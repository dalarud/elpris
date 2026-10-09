import * as K from './kalkyl.js';
import { prisprognos, MAX_DYGN_FRAM } from './prognos.js';
import * as D from './data.js';
import { tolkaMatvarden } from './import.js';

// Startvyn är medvetet sparsam (användarens önskemål 2026-10-09):
//   1. Månadens kostnad   2. Läget nu   3. Dra ner-läge (bara när det behövs)
//   4. När ska jag köra?  5. Kommande dagar på en rad   6. Mer (hopfällt)

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stor = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const MANADER = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
const KORT_DAG = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

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

// Ta bort bockar och varningsminnen för dygn som passerat.
try {
  const grans = K.laggTillDagar(K.dagensDatum(), -2);
  for (const k of Object.keys(localStorage)) {
    const m = /^(drana|varnad):(\d{4}-\d{2}-\d{2})/.exec(k);
    if (m && m[2] < grans) localStorage.removeItem(k);
  }
} catch { /* lagring blockerad */ }
let matvarden = lasLokalt('matvarden', null);
let valdSyssla = lasLokalt('syssla', 'tvatt');
let senast = null;   // data från senaste körningen, för att rita om utan att hämta igen

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
    const [tim, vader, temp, modell] = await Promise.all([
      D.timprisHistorik(K.laggTillDagar(idag, -400), K.laggTillDagar(idag, -1), inst.elomrade, idag),
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

    const berikade = K.berika([pIdag, pImorgon].filter(Boolean).flat(), ref, inst);
    const kwhTim = {}, delar = {};
    for (const d of [idag, pImorgon ? imorgon : null].filter(Boolean)) {
      kwhTim[d] = kostnadDygn(d).kwhTim;
      delar[d] = K.forbrukningDygn(d, tempFor(d), inst, tim[d]).delar;
    }
    const dygnspris = {};
    for (const [d, v] of Object.entries(tim)) { const m = K.medel(v); if (Number.isFinite(m)) dygnspris[d] = m; }
    const prognos = modell ? prisprognos(modell, dygnspris, vader.modell, pImorgon ? imorgon : idag, idag) : [];

    // Dyra perioder räknas på hela kända dygn, så att de (och bockarna) inte flyttas när
    // kvartar passerar. Om ett dygn är värt en varning avgörs också på hela dygnet, och
    // ett dygn som varnats en gång fortsätter att vara varnat.
    const allaPerioder = K.dyraPerioder(berikade);
    const perioder = allaPerioder.filter((p) => Date.parse(p.slut) > nu.ms);
    const dygn = K.dygnsvarningar(allaPerioder, kwhTim, ref, inst).map((d) => {
      const varna = d.varna || lasLokalt(`varnad:${d.datum}`, false);
      if (varna) sparaLokalt(`varnad:${d.datum}`, true);
      return { ...d, varna };
    });
    senast = { idag, nu, pImorgon, tim, ref, tempFor, kostnadDygn, berikade, kwhTim, delar, prognos, perioder, dygn };
    visaManad(senast);
    visaLaget(senast);
    visaDraner(senast);
    visaSysslor(senast);
    visaDagar(senast);
    visaMer(senast);
    document.body.dataset.klar = '1';
  } catch (e) {
    console.error(e);
    if (denna === korning) $('#manad').innerHTML = `<p class="fel">Kunde inte hämta priserna just nu (${esc(e.message)}). Försök igen om en stund.</p>`;
  }
}

const slutMs = (i) => i.t0 + i.langd * 60000;
const tid = (i) => `${String(i.timme).padStart(2, '0')}:${String(i.minut).padStart(2, '0')}`;
const narDag = (datum, idag) => (K.dagnamn(datum, idag) === 'i dag' ? '' : `${K.dagnamn(datum, idag)} `);

// ---------------------------------------------------------- 1. månaden ----

function manadsSiffror({ idag, tim, tempFor, kostnadDygn, prognos }) {
  const manad = idag.slice(0, 7);
  const spotNormal = K.median(Object.entries(tim).filter(([d]) => d < idag && d >= K.laggTillDagar(idag, -30)).flatMap(([, v]) => v).filter(Number.isFinite));
  let hittills = 0, kwh = 0, dagar = 0, uppmatta = 0, resten = 0;
  const delar = { elpris: 0, natavgift: 0, energiskatt: 0 };
  for (let d = `${manad}-01`; d.slice(0, 7) === manad; d = K.laggTillDagar(d, 1)) {
    const k = d < idag ? kostnadDygn(d) : null;
    if (k) {
      hittills += k.kr; kwh += k.kwh; dagar++;
      if (k.kalla === 'uppmätt') uppmatta++;
      for (const n of Object.keys(delar)) delar[n] += k.delar[n];
      continue;
    }
    // I dag, kommande dygn och dygn vars priser inte gick att hämta: uppskattning.
    const p = prognos.find((x) => x.datum === d);
    resten += K.dygnskostnad(d, tim[d] ?? new Array(24).fill(p ? p.spot : spotNormal), tempFor(d), inst).kr;
  }
  const fjol = `${Number(manad.slice(0, 4)) - 1}${manad.slice(4)}`;
  let fjolHela = 0, fjolDagar = 0;
  for (let d = `${fjol}-01`; d.slice(0, 7) === fjol; d = K.laggTillDagar(d, 1)) {
    const k = kostnadDygn(d);
    if (k) { fjolHela += k.kr; fjolDagar++; }
  }
  const antalDagar = new Date(Date.UTC(+manad.slice(0, 4), +manad.slice(5, 7), 0)).getUTCDate();
  return { manad, hittills, kwh, dagar, uppmatta, prognos: hittills + resten, delar, fjolHela, fjolKomplett: fjolDagar === antalDagar };
}

function visaManad(s) {
  const m = manadsSiffror(s);
  const namn = MANADER[+m.manad.slice(5, 7) - 1];
  const diff = m.fjolKomplett ? m.prognos - m.fjolHela : null;
  // Bara skillnader på minst 5 % visas, i neutral färg: det är marknaden, inget du gjort fel.
  const jamforelse = diff === null || Math.abs(diff) < 0.05 * m.fjolHela ? ''
    : `<p class="manad-jamf">≈ ${K.kr(Math.abs(diff))} ${diff > 0 ? 'mer' : 'mindre'} än ${namn} i fjol (${K.kr(m.fjolHela)})</p>`;
  $('#manad').classList.remove('laddar');
  $('#manad').innerHTML = `
    <p class="etikett">${stor(namn)}</p>
    <div class="manad-rad">
      <div><span class="stor-siffra">${K.kr(m.hittills)}</span><span class="dampad"> hittills</span></div>
      <div class="hoger"><span class="mellan-siffra">≈ ${K.kr(m.prognos)}</span><span class="dampad"> hela månaden</span></div>
    </div>
    ${jamforelse}
    <p class="undertext">${m.dagar} dygn · ${K.tal(m.kwh)} kWh${m.kwh ? ` · ${K.krKwh(m.hittills / m.kwh)}` : ''} · ${m.uppmatta ? 'uppmätt förbrukning' : 'beräknad förbrukning'}</p>`;
}

// ---------------------------------------------------------- 2. läget nu ----

function visaLaget({ berikade, perioder, ref, idag, nu }) {
  const aktuellt = berikade.find((i) => i.t0 <= nu.ms && nu.ms < slutMs(i)) ?? berikade[0];
  // Samma perioder som Dra ner, så att de två aldrig säger emot varandra.
  const pagar = perioder.find((p) => Date.parse(p.start) <= nu.ms && nu.ms < Date.parse(p.slut));
  const nasta = perioder.find((p) => Date.parse(p.start) > nu.ms);
  const tider = (p) => `${narDag(p.datum, idag)}${p.franTxt}–${p.tillTxt}`;
  let rubrik, rad, klass;
  if (pagar) {
    klass = pagar.niva;
    rubrik = pagar.niva === 'mycket-dyrt' ? 'Mycket dyrt nu' : 'Dyrt nu';
    rad = `Dyrt till kl ${pagar.tillTxt}.${nasta ? ` Dyrt igen ${tider(nasta)}.` : ''}`;
  } else {
    const kvot = aktuellt.total / ref.totalMedian;
    klass = aktuellt.niva === 'billigt' ? 'billigt' : kvot >= 1.15 ? 'lite-dyrt' : kvot <= 0.9 ? 'lite-billigt' : 'normalt';
    rubrik = { billigt: 'Billigt nu', 'lite-dyrt': 'Lite dyrt nu', 'lite-billigt': 'Lite billigt nu', normalt: 'Normalt pris nu' }[klass];
    rad = nasta ? `Dyrt ${tider(nasta)}.` : 'Inga dyra perioder framför dig.';
  }
  $('#laget').hidden = false;
  $('#laget').className = `kort laget ${klass}`;
  $('#laget').innerHTML = `
    <div class="laget-rad"><span class="prick ${klass}"></span><strong>${rubrik}</strong><span class="laget-pris">${K.krKwh(aktuellt.total)}</span></div>
    <p class="laget-text">${esc(rad)} <span class="dampad">Normalt ${K.kr2(ref.totalMedian)}.</span></p>`;
}

// ------------------------------------------------------- 3. dra ner-läge ----

function bockade(nyckel) { return new Set(lasLokalt(`drana:${nyckel}`, [])); }

// Vilka Dra ner-kort som är utfällda (överlever omritning).
const oppnaDraner = new Set();

function visaDraner({ dygn, perioder, berikade, delar, ref, idag, nu, prognos, pImorgon }) {
  const kort = [];
  // Ett kort per dygn med dyra perioder kvar. Dygn värda en varning (≥ varningKr,
  // räknat på hela dygnet) är utfällda, övriga en hopfälld rad ett tryck bort.
  for (const d of dygn) {
    const kvar = perioder.filter((p) => p.datum === d.datum);
    if (!kvar.length) continue;
    const atgarder = K.dranerAtgarder(kvar, berikade, delar, ref, idag, nu.ms);
    const summa = atgarder.reduce((a, x) => a + x.sparar, 0);
    if (!atgarder.length || summa < 2) continue;
    const nyckel = d.datum;
    const klara = bockade(nyckel);
    const gjort = atgarder.filter((x) => klara.has(x.id)).reduce((a, x) => a + x.sparar, 0);
    const oppen = d.varna || oppnaDraner.has(nyckel);
    const tider = kvar.map((p) => `${p.franTxt}–${p.tillTxt}`).join(' och ');
    const max = Math.max(...kvar.map((p) => p.max));
    kort.push(`<details class="draner ${d.niva}${d.varna ? '' : ' liten'}" data-period="${esc(nyckel)}"${oppen ? ' open' : ''}>
      <summary><span class="rubrik">${d.varna ? 'Dra ner' : 'Dyrt'} ${esc(K.dagnamn(d.datum, idag))} ${tider}</span>
        <span class="dampad">${d.varna ? '' : 'Dra ner och spara '}≈&nbsp;${K.kr(summa)}${d.varna ? ' att spara' : ''}</span></summary>
      <p class="dampad">Upp till ${K.krKwh(max)}, normalt ${K.kr2(ref.totalMedian)}. Bocka av det du gör:</p>
      <ul class="checklista">${atgarder.map((a) => `
        <li><label><input type="checkbox" data-atgard="${a.id}"${klara.has(a.id) ? ' checked' : ''}>
          <span class="atgard"><strong>${esc(a.text)}</strong><span class="dampad">${esc(a.detalj)}</span></span>
          <span class="sparar">≈&nbsp;${K.kr(a.sparar)}</span></label></li>`).join('')}
      </ul>
      <p class="summa">${gjort > 0 ? `Du sparar ≈&nbsp;${K.kr(gjort)} av möjliga ${K.kr(summa)}.` : `Gör du allt sparar du ≈&nbsp;${K.kr(summa)}.`} <span class="dampad">Uppskattning.</span></p>
    </details>`);
  }
  // Uppskattade dyra dygn längre fram: en kort rad, ingen checklista än.
  const kommande = prognos.filter((p) => p.dyr && K.dagarMellan(idag, p.datum) >= (pImorgon ? 2 : 1));
  if (kommande.length) {
    const dagar = kommande.map((p) => K.dagnamn(p.datum, idag)).join(', ');
    // Föreslå den sista dagen före det första dyra dygnet (om den inte själv är dyr eller redan passerad).
    const fore = K.laggTillDagar(kommande[0].datum, -1);
    const plan = fore > idag && !kommande.some((p) => p.datum === fore) ? ` – planera tvätt och bastu till ${K.dagnamn(fore, idag)}` : '';
    kort.push(`<p class="forvarning"><strong>Troligen dyrt ${esc(dagar)}</strong>${esc(plan)}. <span class="dampad">Uppskattning; exakta priser kl 13 dagen före.</span></p>`);
  }
  $('#draner').innerHTML = kort.join('');
}

document.addEventListener('toggle', (e) => {
  const d = e.target.closest?.('details.draner.liten');
  if (!d) return;
  if (d.open) oppnaDraner.add(d.dataset.period); else oppnaDraner.delete(d.dataset.period);
}, true);

// Bocka av (sparas per period i webbläsaren)
document.addEventListener('change', (e) => {
  const ruta = e.target.closest('input[data-atgard]');
  if (!ruta) return;
  const nyckel = ruta.closest('[data-period]').dataset.period;
  const klara = bockade(nyckel);
  if (ruta.checked) klara.add(ruta.dataset.atgard); else klara.delete(ruta.dataset.atgard);
  sparaLokalt(`drana:${nyckel}`, [...klara]);
  if (senast) visaDraner(senast);
});

// ---------------------------------------------------- 4. när ska jag köra? ----

function visaSysslor({ berikade, nu, idag }) {
  const s = K.SYSSLOR.find((x) => x.id === valdSyssla) ?? K.SYSSLOR[0];
  const r = K.planera(berikade, nu.ms, s);
  const nar = (c) => `${K.narOrd(c.klocka, idag)} kl ${c.klocka.txt}`;
  const timer = (c) => (s.timer && c.om > 0
    ? `<p class="timer">Start ${c.klocka.txt}, klar ca ${c.slut.txt} – ställ fördröjd start på <strong>${c.om} h</strong></p>` : '');
  let svar;
  if (!r || !r.bast) {
    svar = `<p>${!r ? 'Priserna räcker inte för att räkna ut det just nu.' : `Ingen ledig dagtid inom de kända priserna. Morgondagens priser kommer kl 13.`}</p>`;
  } else if (!r.nu) {
    // Bastu eller ugn utanför dagtid: bara bästa tid, ingen jämförelse med "nu".
    svar = `<p class="besked">${stor(nar(r.bast))}</p><p>${K.kr2(r.bast.kr)} – billigaste dagtiden inom de kända priserna.</p>`;
  } else if (r.sparar >= K.GRANS_KR) {
    const dagAlt = r.dagAlt
      ? `<p class="dampad">Hellre på dagen? ${stor(nar(r.dagAlt))}: ${K.kr2(r.dagAlt.kr)} (${K.tal(Math.max(0, r.dagAlt.kr - r.bast.kr) * 100)} öre mer).</p>` : '';
    svar = `<p class="besked">${stor(nar(r.bast))}</p>
      <p>${K.kr2(r.bast.kr)} i stället för ${K.kr2(r.nu.kr)} nu – <strong>du sparar ${K.kr2(r.sparar)}</strong></p>
      ${timer(r.bast)}${dagAlt}`;
  } else if (r.undvikFran) {
    const u = r.undvikFran;
    svar = `<p class="besked">Kör nu – eller före kl ${u.klocka.txt}</p>
      <p class="dampad">${s.namn} nu kostar ${K.kr2(r.nu.kr)}. Startar du ${nar(u)} kostar det ${K.kr2(u.kr)}.</p>`;
  } else {
    svar = `<p class="besked">Kör när det passar dig</p>
      <p class="dampad">${s.namn} nu kostar ${K.kr2(r.nu.kr)}. ${r.bast === r.nu ? 'Nu är den billigaste tiden.' : `Bästa tiden sparar bara ${K.tal(Math.max(0, r.sparar) * 100)} öre.`}</p>`;
  }
  $('#sysslor').hidden = false;
  $('#sysslor').innerHTML = `
    <h2>När ska jag köra?</h2>
    <div class="knapprad">${K.SYSSLOR.map((x) => `<button type="button" class="syssla${x.id === s.id ? ' vald' : ''}" data-syssla="${x.id}" aria-pressed="${x.id === s.id}">${x.namn}</button>`).join('')}</div>
    <div class="svar">${svar}</div>
    <p class="undertext">${s.namn}: ca ${K.tal(s.kwh, 1)} kWh på ${s.timmar} h (uppskattning)${s.dagtid ? `, start tidigast ${String(K.DAG_START).padStart(2, '0')}, klar senast ${K.KLAR_SENAST}` : ''}. Högst 24 h fram.</p>`;
}

document.addEventListener('click', (e) => {
  const knapp = e.target.closest('button[data-syssla]');
  if (!knapp) return;
  valdSyssla = knapp.dataset.syssla;
  sparaLokalt('syssla', valdSyssla);
  if (senast) visaSysslor(senast);
});

// ------------------------------------------------------ 5. kommande dagar ----

function visaDagar({ idag, pImorgon, berikade, kostnadDygn, prognos, tempFor }) {
  const dagar = [];
  for (const d of [idag, pImorgon ? K.laggTillDagar(idag, 1) : null].filter(Boolean)) {
    const perioder = K.dyraPerioder(berikade.filter((i) => i.datum === d));
    const niva = perioder.some((p) => p.niva === 'mycket-dyrt') ? 'mycket-dyrt' : perioder.length ? 'dyrt' : 'normalt';
    dagar.push({ d, kr: kostnadDygn(d).kr, niva, uppsk: false });
  }
  for (const p of prognos) {
    if (dagar.some((x) => x.d === p.datum)) continue;
    const kr = K.dygnskostnad(p.datum, new Array(24).fill(p.spot), tempFor(p.datum), inst).kr;
    dagar.push({ d: p.datum, kr, niva: p.dyr ? 'dyrt' : p.spot <= 0.7 * p.median30 ? 'billigt' : 'normalt', uppsk: true });
  }
  $('#dagar').hidden = false;
  $('#dagar').innerHTML = `<h2>Kommande dagar</h2>
    <div class="dagrad">${dagar.map((x) => `<div class="dagruta" title="${K.NIVA_TEXT[x.niva]}${x.uppsk ? ' (uppskattning)' : ''}">
      <span class="dagnamn">${x.d === idag ? 'I dag' : KORT_DAG[K.veckodag(x.d)]}</span>
      <span class="prick ${x.niva}"></span>
      <span class="dagkr">${x.uppsk ? '≈' : ''}${K.tal(x.kr)}</span></div>`).join('')}
    </div>
    <p class="undertext">Kronor per dygn för huset. Grön = billigt, gul/röd = dyra timmar, ≈ = uppskattning.</p>`;
}

// ------------------------------------------------------------------ 6. mer ----

function visaMer(s) {
  const { idag, kostnadDygn } = s;
  const m = manadsSiffror(s);
  const summa = m.delar.elpris + m.delar.natavgift + m.delar.energiskatt || 1;
  const pct = (x) => Math.round(100 * x / summa);
  const manader = [];
  const manad = idag.slice(0, 7);
  for (let i = 12; i >= 1; i--) {
    const mm = new Date(Date.UTC(+manad.slice(0, 4), +manad.slice(5, 7) - 1 - i, 1)).toISOString().slice(0, 7);
    let kr = 0, kwh = 0, n = 0;
    const antal = new Date(Date.UTC(+mm.slice(0, 4), +mm.slice(5, 7), 0)).getUTCDate();
    for (let d = `${mm}-01`; d.slice(0, 7) === mm; d = K.laggTillDagar(d, 1)) {
      const k = kostnadDygn(d);
      if (k) { kr += k.kr; kwh += k.kwh; n++; }
    }
    if (n) manader.push({ m: mm, kr, kwh, n, antal });
  }
  const sum = (f) => manader.reduce((a, x) => a + f(x), 0);
  $('#mer-innehall').innerHTML = `
    <h3>${stor(MANADER[+manad.slice(5, 7) - 1])} hittills</h3>
    <p>Elpris ${K.kr(m.delar.elpris)} (${pct(m.delar.elpris)} %) · Elnät ${K.kr(m.delar.natavgift)} (${pct(m.delar.natavgift)} %) · Energiskatt ${K.kr(m.delar.energiskatt)} (${pct(m.delar.energiskatt)} %). Bara elpriset påverkas av när du använder el.</p>
    <h3>Senaste 12 månaderna</h3>
    <div class="tabellrulle"><table>
      <thead><tr><th>Månad</th><th>kWh</th><th>Kostnad</th><th>kr/kWh</th></tr></thead>
      <tbody>${manader.map((x) => `<tr><td>${MANADER[+x.m.slice(5, 7) - 1].slice(0, 3)} ${x.m.slice(0, 4)}${x.n < x.antal ? ` <span class="undertext">(${x.n} dygn)</span>` : ''}</td><td>${K.tal(x.kwh)}</td><td>${K.kr(x.kr)}</td><td>${K.tal(x.kr / x.kwh, 2)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th>Summa</th><th>${K.tal(sum((x) => x.kwh))}</th><th>${K.kr(sum((x) => x.kr))}</th><th>${K.tal(sum((x) => x.kr) / sum((x) => x.kwh), 2)}</th></tr></tfoot>
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
