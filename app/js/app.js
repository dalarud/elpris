import * as K from './kalkyl.js';
import { prisprognos, MAX_DYGN_FRAM } from './prognos.js';
import * as D from './data.js';
import { tolkaMatvarden } from './import.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stor = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const MANADER = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

// ------------------------------------------------------------ inställningar ----

function lasLokalt(nyckel, standard) {
  try { const v = localStorage.getItem(nyckel); return v ? JSON.parse(v) : standard; } catch { return standard; }
}
function sparaLokalt(nyckel, v) {
  try { localStorage.setItem(nyckel, JSON.stringify(v)); return true; } catch { return false; }
}

function laddaInstallningar() {
  const sparat = lasLokalt('installningar', {});
  return { ...K.STANDARD, ...sparat,
    natFastKrManad: { ...K.STANDARD.natFastKrManad, ...(sparat.natFastKrManad ?? {}) },
    overforing: { ...K.STANDARD.overforing, ...(sparat.overforing ?? {}) } };
}

let inst = laddaInstallningar();
let matvarden = lasLokalt('matvarden', null);

// ------------------------------------------------------------------ start ----

let korning = 0;
let senastKvart = -1;   // kvarten (ms / 15 min) då senaste körningen startade

async function start() {
  const denna = ++korning;            // en senare körning (timer, Spara) vinner
  const idag = K.dagensDatum();
  const imorgon = K.laggTillDagar(idag, 1);
  const nu = { ...K.klockslagNu(), ms: Date.now() };
  senastKvart = Math.floor(nu.ms / 900e3);
  try {
    const [pIdag, pImorgon] = await Promise.all([
      D.priserDygn(idag, inst.elomrade, idag),
      D.priserDygn(imorgon, inst.elomrade, idag).catch(() => null),
    ]);
    if (!pIdag) throw new Error('Dagens priser saknas');
    const fran = K.laggTillDagar(idag, -400);
    const [tim, vader, temp, modell] = await Promise.all([
      D.timprisHistorik(fran, K.laggTillDagar(idag, -1), inst.elomrade, idag),
      D.vaderprognos(inst.plats).catch(() => ({ hem: {}, modell: {} })),
      D.tempHistorik(),
      fetch('modell/prismodell.json').then((r) => r.json()).catch(() => null),
    ]);
    if (denna !== korning) return;
    tim[idag] = K.timpriser(pIdag);
    if (pImorgon) tim[imorgon] = K.timpriser(pImorgon);

    const poster30 = K.posterFranTimpriser(tim, K.laggTillDagar(idag, -30), K.laggTillDagar(idag, -1));
    const ref = K.referens(poster30.length ? poster30 : pIdag.map((i) => ({ spot: i.spot, datum: i.datum, timme: i.timme })), inst);

    const tempFor = (d) => K.valjTemp(d, temp, vader.hem);
    const kostnadDygn = (d) => (tim[d] ? K.dygnskostnad(d, tim[d], tempFor(d), inst, matvarden?.dagar?.[d] ?? null) : null);

    const kanda = [pIdag, pImorgon].filter(Boolean).flat();
    const berikade = K.berika(kanda, ref, inst);
    const kwhTim = { [idag]: kostnadDygn(idag).kwhTim };
    if (pImorgon) kwhTim[imorgon] = kostnadDygn(imorgon).kwhTim;

    // Prognos 2–5 dygn
    const dygnspris = {};
    for (const [d, v] of Object.entries(tim)) { const m = K.medel(v); if (Number.isFinite(m)) dygnspris[d] = m; }
    const senast = pImorgon ? imorgon : idag;
    const prognos = modell ? prisprognos(modell, dygnspris, vader.modell, senast, idag) : [];
    // Varför uppskattningen saknas, om den saknas (visas i varningar och kommande dagar).
    const prognosSaknas = prognos.length ? null
      : !vader.prognosHamtad || !Object.keys(vader.modell).length ? 'SMHI:s väderprognos kunde inte hämtas'
        : 'den kunde inte beräknas';

    visaJustNu(berikade, ref, idag, nu);
    visaVarningar(berikade, ref, kwhTim, prognos, idag, nu, pImorgon, tempFor, prognosSaknas);
    visaDagar(berikade, ref, idag, nu, pImorgon, prognos, tempFor, kostnadDygn, prognosSaknas);
    visaKostnad(tim, idag, tempFor, kostnadDygn, prognos);
  } catch (e) {
    console.error(e);
    if (denna === korning) $('#just-nu').innerHTML = `<p class="fel">Kunde inte hämta priserna just nu (${esc(e.message)}). Försök igen om en stund.</p>`;
  }
}

// Absolut tid (ms) i stället för klockslag: natten då sommartiden slutar finns
// klockslagen 02:00–02:59 två gånger.
const slutMs = (i) => i.t0 + i.langd * 60000;

function aterstaende(berikade, idag, nu) {
  return berikade.filter((i) => slutMs(i) > nu.ms);
}

// ---------------------------------------------------------------- just nu ----

function visaJustNu(berikade, ref, idag, nu) {
  const aktuellt = berikade.find((i) => i.t0 <= nu.ms && nu.ms < slutMs(i)) ?? berikade[0];
  const kommande = aterstaende(berikade, idag, nu);
  const nastaDyr = kommande.find((i) => i !== aktuellt && (i.niva === 'dyrt' || i.niva === 'mycket-dyrt'));
  const rorligt = aktuellt.total - aktuellt.spot * K.MOMS;
  let sammanfattning;
  if (aktuellt.niva === 'mycket-dyrt' || aktuellt.niva === 'dyrt') {
    const slut = kommande.slice(kommande.indexOf(aktuellt)).find((i) => i.niva !== 'dyrt' && i.niva !== 'mycket-dyrt');
    sammanfattning = slut ? `Dra ner nu om du kan. Priset sjunker ${K.dagnamn(slut.datum, idag) === 'i dag' ? '' : K.dagnamn(slut.datum, idag) + ' '}kl ${String(slut.timme).padStart(2, '0')}:${String(slut.minut).padStart(2, '0')}.` : 'Dra ner nu om du kan.';
  } else if (nastaDyr) {
    sammanfattning = `Nästa dyra period börjar ${K.dagnamn(nastaDyr.datum, idag)} kl ${String(nastaDyr.timme).padStart(2, '0')}:${String(nastaDyr.minut).padStart(2, '0')}.`;
  } else {
    sammanfattning = 'Inga dyra perioder resten av dagen' + (berikade.some((i) => i.datum > idag) ? ' eller i morgon.' : '.');
  }
  $('#just-nu').classList.remove('laddar');
  $('#just-nu').innerHTML = `
    <h2>Just nu</h2>
    <div class="nu-rad">
      <span class="nu-pris">${K.tal(aktuellt.total, 2)} <span class="nu-enhet">kr/kWh</span></span>
      <span class="chip ${aktuellt.niva}">${K.NIVA_TEXT[aktuellt.niva]}</span>
    </div>
    <p class="undertext">Normalpris ${K.krKwh(ref.totalMedian)} · nu: spotpris ${K.tal(aktuellt.spot * K.MOMS, 2)} kr, skatt och avgifter ${K.tal(rorligt, 2)} kr</p>
    <p class="nu-sammanfattning">${esc(sammanfattning)}</p>`;
}

// -------------------------------------------------------------- varningar ----

function visaVarningar(berikade, ref, kwhTim, prognos, idag, nu, pImorgon, tempFor, prognosSaknas) {
  const kort = [];
  const vanliga = [];
  const dygn = K.dygnsvarningar(K.dyraPerioder(aterstaende(berikade, idag, nu)), kwhTim, ref, inst);
  for (const d of dygn) {
    if (!d.varna) { vanliga.push(d); continue; }
    for (const p of d.perioder) {
      const v = K.varningstext(p, p.kostnad, ref, idag, K.billigasteFonster(aterstaende(berikade, idag, nu), 3));
      kort.push(`<article class="varning ${v.niva}"><h3>${esc(v.rubrik)}<span class="chip ${v.niva}">Känt pris</span></h3><p>${esc(v.text)}</p></article>`);
    }
  }
  // Uppskattade dyra dagar längre fram (2–5 dygn)
  const dyra = prognos.filter((p) => p.dyr && K.dagarMellan(idag, p.datum) >= (pImorgon ? 2 : 1));
  for (const grupp of grupperaDagar(dyra)) {
    const forsta = grupp[0], sista = grupp.at(-1);
    const dagar = grupp.length > 1 ? `${K.dagnamn(forsta.datum, idag)}–${K.dagnamn(sista.datum, idag)}` : K.dagnamn(forsta.datum, idag);
    const tot = (s) => K.dygnsTotal(s, forsta.datum, inst);
    const orsaker = [...new Set(grupp.flatMap((g) => g.orsak))];
    const skal = orsaker.length ? `Skäl: ${orsaker.join(', ')}.` : grupp.some((g) => g.hogtLage) ? 'Priset ligger redan högt och väntas ligga kvar.' : '';
    const extra = grupp.reduce((a, g) => {
      const k = K.dygnskostnad(g.datum, new Array(24).fill(g.spot), tempFor(g.datum), inst);
      const n = K.dygnskostnad(g.datum, new Array(24).fill(ref.spotMedian), tempFor(g.datum), inst);
      return a + k.kr - n.kr;
    }, 0);
    kort.push(`<article class="varning dyrt"><h3>Troligen dyrt ${esc(dagar)}<span class="chip uppskattning">Uppskattning</span></h3>
      <p>Väntat dygnsmedel cirka ${K.krKwh(tot(forsta.spot))} (troligt spann ${K.tal(tot(forsta.spotLag), 2)}–${K.tal(tot(forsta.spotHog), 2)}), normalt ${K.krKwh(ref.totalMedian)}.
      ${esc(skal)} Det skulle kosta ditt hus ungefär ${K.kr(Math.max(0, extra))} extra. Planera tvätt och annat som kan flyttas till dagarna före.</p></article>`);
  }
  if (!kort.length) {
    const toppar = vanliga.map((d) => `${K.dagnamn(d.datum, idag)} ${d.perioder.map((p) => `${p.franTxt}–${p.tillTxt}`).join(' och ')} (upp till ${K.krKwh(Math.max(...d.perioder.map((p) => p.max)))}, kostar huset ca ${K.kr(d.extra)} extra)`);
    const framat = prognosSaknas
      ? ` Uppskattningen för de kommande dagarna saknas just nu (${prognosSaknas}).`
      : ` Inget tyder heller på dyra dagar de närmaste ${MAX_DYGN_FRAM} dygnen.`;
    kort.push(`<article class="varning lugnt"><h3>Inga varningar</h3><p>Inget ${pImorgon ? 'i dag eller i morgon' : 'resten av dagen'} kostar huset mer än ${K.kr(inst.varningKr)} extra.${framat}${toppar.length ? ` Vanliga toppar: ${esc(toppar.join('; '))}.` : ''}</p></article>`);
  }
  $('#varningar').innerHTML = kort.join('');
}

function grupperaDagar(lista) {
  const grupper = [];
  for (const p of lista) {
    const g = grupper.at(-1);
    if (g && K.dagarMellan(g.at(-1).datum, p.datum) === 1) g.push(p); else grupper.push([p]);
  }
  return grupper;
}

// ---------------------------------------------------------- kommande dagar ----

function visaDagar(berikade, ref, idag, nu, pImorgon, prognos, tempFor, kostnadDygn, prognosSaknas) {
  const rader = [];
  // Behåll uppfällda dagar när vyn ritas om.
  const oppna = new Set([...document.querySelectorAll('#dagar details[open]')].map((e) => e.dataset.datum));
  for (const d of [idag, pImorgon ? K.laggTillDagar(idag, 1) : null].filter(Boolean)) {
    const dagens = berikade.filter((i) => i.datum === d);
    const k = kostnadDygn(d);
    const timNiva = new Array(24).fill(null).map((_, h) => {
      const iv = dagens.filter((i) => i.timme === h);
      if (!iv.length) return 'normalt';
      return K.niva(K.medel(iv.map((i) => i.total)), ref, inst);
    });
    const vagtMedel = K.medel(dagens.map((i) => i.total));
    const perioder = K.dyraPerioder(dagens);
    const billigast = K.billigasteFonster(dagens, 3);
    const t = tempFor(d);
    rader.push(`<details class="dag" data-datum="${d}"${oppna.has(d) ? ' open' : ''}>
      <summary>
        <span class="dag-namn">${esc(stor(K.dagnamn(d, idag)))} <span class="dag-info">${d.slice(8, 10)}/${Number(d.slice(5, 7))}</span></span>
        <span class="dag-kr">${K.kr(k.kr)}</span>
        <span class="dag-info">Snitt ${K.krKwh(vagtMedel)} · ${Number.isFinite(t) ? `${K.tal(t)} °C · ` : ''}${k.kalla === 'uppmätt' ? 'uppmätt' : 'beräknad'} förbrukning ${K.tal(k.kwh)} kWh</span>
        <span class="chip ${dagsniva(timNiva)}">${K.NIVA_TEXT[dagsniva(timNiva)]}</span>
        <div class="remsa" aria-label="Prisnivå per timme">${timNiva.map((n, h) => `<span class="${n}${d === idag && h < nu.timme ? ' forbi' : ''}" title="${String(h).padStart(2, '0')}:00 ${K.NIVA_TEXT[n]}"></span>`).join('')}</div>
        <div class="remsa-axel"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
      </summary>
      <div class="dag-detalj">
        ${perioder.length ? perioder.map((p) => `<p><span class="chip ${p.niva}">${K.NIVA_TEXT[p.niva]}</span> ${p.franTxt}–${p.tillTxt}, upp till ${K.krKwh(p.max)}</p>`).join('') : '<p>Inga dyra perioder.</p>'}
        ${billigast ? `<p><span class="chip billigt">Billigast</span> ${billigast.fran}–${billigast.till}, i snitt ${K.krKwh(billigast.medel)}</p>` : ''}
        <p class="undertext">Elpris ${K.kr(k.delar.elpris)} · nät ${K.kr(k.delar.natavgift)} · skatt ${K.kr(k.delar.energiskatt)}</p>
      </div>
    </details>`);
  }
  for (const p of prognos) {
    const tot = (s) => K.dygnsTotal(s, p.datum, inst);
    if (pImorgon && p.datum === K.laggTillDagar(idag, 1)) continue;
    const k = K.dygnskostnad(p.datum, new Array(24).fill(p.spot), tempFor(p.datum), inst);
    const nivaP = p.dyr ? 'dyrt' : p.spot <= 0.7 * p.median30 ? 'billigt' : 'normalt';
    rader.push(`<div class="dag"><div class="dag-rad" style="display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:center">
      <span class="dag-namn">${esc(stor(K.dagnamn(p.datum, idag)))} <span class="dag-info">${p.datum.slice(8, 10)}/${Number(p.datum.slice(5, 7))}</span></span>
      <span class="dag-kr">≈ ${K.kr(k.kr)}</span>
      <span class="dag-info">Snitt ≈ ${K.krKwh(tot(p.spot))} (${K.tal(tot(p.spotLag), 2)}–${K.tal(tot(p.spotHog), 2)}) · ${K.tal(p.temp)} °C</span>
      <span class="chip ${nivaP}">${p.dyr ? 'Troligen dyrt' : nivaP === 'billigt' ? 'Troligen billigt' : 'Troligen normalt'}</span>
    </div></div>`);
  }
  $('#dagar').hidden = false;
  $('#dagar').innerHTML = `<h2>Kommande dagar</h2>
    <p class="undertext">Kronor = vad ditt hus beräknas kosta det dygnet, allt inräknat. Tryck på en dag för detaljer. Dagar med ≈ är uppskattningar.</p>
    ${rader.join('')}
    ${prognosSaknas ? `<p class="undertext">Uppskattning för dagarna därefter saknas just nu – ${prognosSaknas}.</p>` : ''}`;
}

function dagsniva(timNiva) {
  if (timNiva.includes('mycket-dyrt')) return 'mycket-dyrt';
  if (timNiva.filter((n) => n === 'dyrt').length >= 2) return 'dyrt';
  if (timNiva.filter((n) => n === 'billigt').length >= 16) return 'billigt';
  return 'normalt';
}

// ------------------------------------------------------------ elkostnad ----

function visaKostnad(tim, idag, tempFor, kostnadDygn, prognos) {
  const manad = idag.slice(0, 7);
  const forsta = `${manad}-01`;
  const dagarIManad = new Date(Date.UTC(+manad.slice(0, 4), +manad.slice(5, 7), 0)).getUTCDate();
  let hittills = 0, hittillsKwh = 0, uppmatta = 0, dagar = 0;
  const delar = { elpris: 0, natavgift: 0, energiskatt: 0 };
  const spotNormal = K.median(Object.entries(tim).filter(([d]) => d < idag && d >= K.laggTillDagar(idag, -30)).flatMap(([, v]) => v).filter(Number.isFinite));
  let resten = 0;
  for (let d = forsta; d < idag; d = K.laggTillDagar(d, 1)) {
    const k = kostnadDygn(d);
    if (!k) {   // priserna för dygnet gick inte att hämta: uppskatta med normalpris
      resten += K.dygnskostnad(d, new Array(24).fill(spotNormal), tempFor(d), inst).kr;
      continue;
    }
    hittills += k.kr; hittillsKwh += k.kwh; dagar++;
    if (k.kalla === 'uppmätt') uppmatta++;
    for (const n of Object.keys(delar)) delar[n] += k.delar[n];
  }
  // Uppskattning för resten av månaden: kända priser, prisprognos, annars normalpris
  for (let d = idag; d.slice(0, 7) === manad; d = K.laggTillDagar(d, 1)) {
    const p = prognos.find((x) => x.datum === d);
    const spot = tim[d] ?? new Array(24).fill(p ? p.spot : spotNormal);
    resten += K.dygnskostnad(d, spot, tempFor(d), inst).kr;
  }
  // Samma månad förra året
  const fjolManad = `${Number(manad.slice(0, 4)) - 1}${manad.slice(4)}`;
  let fjol = 0, fjolDagar = 0, fjolKwh = 0;
  for (let d = `${fjolManad}-01`; d.slice(0, 7) === fjolManad; d = K.laggTillDagar(d, 1)) {
    const k = kostnadDygn(d);
    if (k) { fjol += k.kr; fjolKwh += k.kwh; fjolDagar++; }
  }
  // Senaste 12 månaderna
  const manader = [];
  for (let i = 12; i >= 1; i--) {
    const m = new Date(Date.UTC(+manad.slice(0, 4), +manad.slice(5, 7) - 1 - i, 1)).toISOString().slice(0, 7);
    let kr = 0, kwh = 0, n = 0, uppm = 0;
    const antal = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
    for (let d = `${m}-01`; d.slice(0, 7) === m; d = K.laggTillDagar(d, 1)) {
      const k = kostnadDygn(d);
      if (k) { kr += k.kr; kwh += k.kwh; n++; if (k.kalla === 'uppmätt') uppm++; }
    }
    if (n) manader.push({ m, kr, kwh, n, antal, uppm });
  }
  const summa = delar.elpris + delar.natavgift + delar.energiskatt || 1;
  const pct = (x) => `${(100 * x / summa).toFixed(1)}%`;
  const kalla = uppmatta === dagar && dagar ? 'uppmätt förbrukning' : uppmatta ? `uppmätt förbrukning ${uppmatta} av ${dagar} dygn, resten beräknad` : 'beräknad förbrukning';
  $('#kostnad').hidden = false;
  $('#kostnad').innerHTML = `
    <h2>Din elkostnad</h2>
    <div class="siffror">
      <div class="siffra"><div class="e">${MANADER[+manad.slice(5, 7) - 1]} hittills (${dagar} dygn)</div><div class="v">${K.kr(hittills)}</div><div class="e">${K.tal(hittillsKwh)} kWh · ${hittillsKwh ? K.krKwh(hittills / hittillsKwh) : ''}</div></div>
      <div class="siffra"><div class="e">Hela ${MANADER[+manad.slice(5, 7) - 1]}, uppskattning</div><div class="v">≈ ${K.kr(hittills + resten)}</div><div class="e">${dagarIManad - Number(idag.slice(8, 10)) + 1} dygn kvar inkl. i dag</div></div>
      ${fjolDagar ? `<div class="siffra"><div class="e">${MANADER[+manad.slice(5, 7) - 1]} i fjol</div><div class="v">${K.kr(fjol)}</div><div class="e">${K.tal(fjolKwh)} kWh · ${K.krKwh(fjol / fjolKwh)}</div></div>` : ''}
    </div>
    <div class="fordelning" role="img" aria-label="Fördelning av kostnaden"><span style="width:${pct(delar.elpris)}"></span><span style="width:${pct(delar.natavgift)}"></span><span style="width:${pct(delar.energiskatt)}"></span></div>
    <div class="legend"><span><i style="background:var(--accent)"></i>Elpris ${K.kr(delar.elpris)}</span><span><i style="background:var(--dyrt);opacity:.75"></i>Elnät ${K.kr(delar.natavgift)}</span><span><i style="background:var(--normalt);opacity:.5"></i>Energiskatt ${K.kr(delar.energiskatt)}</span></div>
    <p class="undertext">Baserat på ${kalla} och verkliga priser. Bara elpriset påverkas av när du använder el.</p>
    <h3>Senaste 12 månaderna</h3>
    <div class="tabellrulle"><table>
      <thead><tr><th>Månad</th><th>kWh</th><th>Kostnad</th><th>kr/kWh</th></tr></thead>
      <tbody>${manader.map((x) => `<tr><td>${MANADER[+x.m.slice(5, 7) - 1].slice(0, 3)} ${x.m.slice(0, 4)}${x.n < x.antal ? ` <span class="undertext">(${x.n} dygn)</span>` : ''}</td><td>${K.tal(x.kwh)}</td><td>${K.kr(x.kr)}</td><td>${K.tal(x.kr / x.kwh, 2)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th>Summa</th><th>${K.tal(manader.reduce((a, x) => a + x.kwh, 0))}</th><th>${K.kr(manader.reduce((a, x) => a + x.kr, 0))}</th><th>${K.tal(manader.reduce((a, x) => a + x.kr, 0) / manader.reduce((a, x) => a + x.kwh, 0), 2)}</th></tr></tfoot>
    </table></div>`;
}

// ---------------------------------------------------------- inställningar ----

/** Fyller formuläret med inställningarna `v` (standard: de som gäller nu). */
function fyllFormular(v = inst) {
  const f = $('#installningsform');
  f.arsforbrukning.value = v.arsforbrukning;
  f.bilKwhAr.value = v.bilKwhAr;
  f.hushallKwhAr.value = v.hushallKwhAr;
  f.varmvattenKwhDag.value = v.varmvattenKwhDag;
  f.natTariff.value = v.natTariff;
  f.natFastSakring.value = v.natFastKrManad.sakring;
  f.natFastTid.value = v.natFastKrManad.tid;
  f.overforingSakring.value = +(v.overforing.sakring * 100).toFixed(2);
  f.overforingTidHog.value = +(v.overforing.tidHog * 100).toFixed(2);
  f.overforingTidLag.value = +(v.overforing.tidLag * 100).toFixed(2);
  f.paslagOre.value = v.paslagOre;
  f.handelKrManad.value = v.handelKrManad;
  f.varningKr.value = v.varningKr;
  $('#varme-text').textContent = `Resten, ${K.tal(K.varmeKwhAr(v))} kWh/år, räknas som uppvärmning och följer utetemperaturen.`;
  visaMatstatus();
}

function visaMatstatus() {
  const s = matvarden?.statistik;
  $('#matstatus').textContent = s ? `Inlästa mätvärden: ${s.antalDygn} dygn (${s.fran} – ${s.till}), ${K.tal(s.kwh)} kWh, upplösning ${s.upplosning}.` : 'Inga mätvärden inlästa – förbrukningen beräknas.';
}

function lasFormular() {
  const f = $('#installningsform');
  const n = (x) => Number(String(x).replace(',', '.'));
  return {
    arsforbrukning: n(f.arsforbrukning.value), bilKwhAr: n(f.bilKwhAr.value), hushallKwhAr: n(f.hushallKwhAr.value),
    varmvattenKwhDag: n(f.varmvattenKwhDag.value), natTariff: f.natTariff.value,
    natFastKrManad: { sakring: n(f.natFastSakring.value), tid: n(f.natFastTid.value) },
    overforing: { sakring: n(f.overforingSakring.value) / 100, tidHog: n(f.overforingTidHog.value) / 100, tidLag: n(f.overforingTidLag.value) / 100 },
    paslagOre: n(f.paslagOre.value), handelKrManad: n(f.handelKrManad.value), varningKr: n(f.varningKr.value),
  };
}

let matvardenAndrade = false;
$('#oppna-installningar').addEventListener('click', () => {
  fyllFormular();
  matvardenAndrade = false;
  $('#installningar').returnValue = '';
  $('#installningar').showModal();
});
$('#installningar').addEventListener('close', () => {
  if ($('#installningar').returnValue === 'spara') {
    const ny = lasFormular();
    // Använd formulärets värden direkt; de gäller även om webbläsaren inte låter oss spara.
    inst = { ...K.STANDARD, ...ny,
      natFastKrManad: { ...K.STANDARD.natFastKrManad, ...ny.natFastKrManad },
      overforing: { ...K.STANDARD.overforing, ...ny.overforing } };
    if (!sparaLokalt('installningar', ny)) $('#plats').textContent = 'SE3 · Jönköping · inställningarna sparas inte i den här webbläsaren';
    start();
  } else if (matvardenAndrade) start();
});
$('#avbryt').addEventListener('click', () => $('#installningar').close('avbryt'));
// Återställ fyller bara formuläret med standardvärdena; inget sparas förrän Spara.
$('#aterstall').addEventListener('click', () => fyllFormular(K.STANDARD));
$('#matfil').addEventListener('change', async (e) => {
  const fil = e.target.files?.[0];
  if (!fil) return;
  const res = tolkaMatvarden(await fil.text());
  if (!res.statistik.antalDygn) {
    $('#matstatus').innerHTML = `<span class="fel">Hittade inga kompletta dygn i filen (${res.statistik.rader} rader lästa). Formatet känns inte igen – skicka gärna de första raderna så lägger jag till det.</span>`;
    return;
  }
  matvarden = res;
  matvardenAndrade = true;
  if (!sparaLokalt('matvarden', res)) $('#matstatus').innerHTML = '<span class="fel">Mätvärdena används nu men kunde inte sparas i webbläsaren (fullt eller blockerat).</span>';
  else visaMatstatus();
});
$('#rensa-matvarden').addEventListener('click', () => {
  try { localStorage.removeItem('matvarden'); } catch { /* ignorera */ }
  matvarden = null;
  matvardenAndrade = true;
  visaMatstatus();
});

// Uppdatera vid varje kvartsskifte (priset byts då) och när appen visas igen.
let timer = null;
function schemalagg() {
  clearTimeout(timer);
  timer = setTimeout(() => { if (document.visibilityState === 'visible') start(); schemalagg(); }, 900e3 - (Date.now() % 900e3) + 3000);
}
document.addEventListener('visibilitychange', () => {
  // En ny kvart sedan senaste körningen betyder nytt pris (och kanske nytt dygn).
  if (document.visibilityState === 'visible' && Math.floor(Date.now() / 900e3) !== senastKvart) { start(); schemalagg(); }
});
start();
schemalagg();
