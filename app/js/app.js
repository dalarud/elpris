import * as K from './kalkyl.js';
import * as P from './plan.js';
import { prisprognos } from './prognos.js';
import * as D from './data.js';
import { tolkaMatvarden } from './import.js';

// Varv 3: Elkollen som en traders plattform (docs/07-daytrader.md).
//   1. Månaden (kostnad, ≈ hela månaden, vad du flyttat)
//   2. Signalen: ett ord nu, zonremsa (tryck för vad-om), kursen bakom ett tryck, i morgon
//   3. Orderboken: en rad per syssla sorterad efter kronor (Dra ner-läge på dra ner-dygn),
//      bil och värmepump som kontrollrader, egna ordrar
//   4. Kommande dagar   5. Mer (positioner, i fjol, prissäkring, 12 månader)

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stor = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const MANADER = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
const KORT_DAG = ['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön'];
const KLOCKA = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1z"/></svg>';

// ------------------------------------------------------------ lagring ----

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
let journal = lasLokalt('journal', {});         // { 'datum:id': { kr, text } } – det du bockat av
let ordrar = lasLokalt('ordrar', []);           // egna ordrar
let paminnelser = lasLokalt('paminnelser', {}); // { sekvens: { sekvens, nyckel, narMs, startMs, titel } }
let senast = null;                              // senaste beräkningen, för att rita om utan att hämta
let vadOmMs = null;                             // vald tid i remsan

// Städa: journal äldre än 13 månader, gamla påminnelser och nycklar från varv 2.
try {
  const grans = K.laggTillDagar(K.dagensDatum(), -400);
  for (const k of Object.keys(journal)) if (k.slice(0, 10) < grans) delete journal[k];
  for (const [k, v] of Object.entries(paminnelser)) if (v.narMs < Date.now() - 3600e3) delete paminnelser[k];
  for (const k of Object.keys(localStorage)) if (/^(drana|varnad):/.test(k) || k === 'syssla') localStorage.removeItem(k);
} catch { /* lagring blockerad */ }

// ------------------------------------------------------------------ start ----

let korning = 0;
let senastKvart = -1;

async function start() {
  const denna = ++korning;
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

    // Dagsplanerna: låsta per dygn, samma som notisen räknar.
    const planer = [P.dagsplan(idag, pIdag, tim, temp, inst)];
    if (pImorgon) planer.push(P.dagsplan(imorgon, pImorgon, tim, temp, inst));
    const berikade = planer.flatMap((p) => p.kvartar);
    const ref = planer[0].ref;
    const tempFor = (d) => K.valjTemp(d, temp, vader.hem);
    const kostnadDygn = (d) => (tim[d] ? K.dygnskostnad(d, tim[d], tempFor(d), inst, matvarden?.dagar?.[d] ?? null) : null);
    const dygnspris = {};
    for (const [d, v] of Object.entries(tim)) { const m = K.medel(v); if (Number.isFinite(m)) dygnspris[d] = m; }
    const prognos = modell ? prisprognos(modell, dygnspris, vader.modell, pImorgon ? imorgon : idag, idag) : [];

    senast = { idag, imorgon, nu, pImorgon, tim, ref, planer, berikade, tempFor, kostnadDygn, prognos, vader };
    if (vadOmMs !== null && (vadOmMs < nu.ms - 900e3 || !berikade.some((i) => i.t0 === vadOmMs))) vadOmMs = null;
    ritaAllt();
    document.body.dataset.klar = '1';
  } catch (e) {
    console.error(e);
    if (denna === korning) $('#manad').innerHTML = `<p class="fel">Kunde inte hämta priserna just nu (${esc(e.message)}). Försök igen om en stund.</p>`;
  }
}

function ritaAllt() {
  const s = senast;
  s.orderbok = P.orderbok({ berikade: s.berikade, nuMs: s.nu.ms, idag: s.idag, planer: s.planer, inst });
  visaManad(s);
  visaSignal(s);
  visaOrderbok(s);
  visaDagar(s);
  if ($('#mer').open) visaMer(s);
  synkaPaminnelser(s);
}

const narDag = (datum, idag) => (datum === idag ? '' : `${K.dagnamn(datum, idag)} `);

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
  // Skillnaden mot i fjol är marknaden, inget du gjort: alltid grå, "≈ samma" inom bruset.
  const jamf = diff === null ? '' : Math.abs(diff) < Math.max(100, 0.05 * m.fjolHela)
    ? ` · i fjol ${K.kr(m.fjolHela)} (≈ samma)`
    : ` · i fjol ${K.kr(m.fjolHela)} (≈ ${K.kr(Math.abs(diff))} ${diff > 0 ? 'mer' : 'mindre'} i år)`;
  const flyttat = P.journalSumma(journal, m.manad);
  $('#manad').classList.remove('laddar');
  $('#manad').innerHTML = `
    <p class="etikett">${stor(namn)}</p>
    <div class="manad-rad">
      <div><span class="stor-siffra">${K.kr(m.hittills)}</span><span class="dampad"> hittills</span></div>
      <div class="hoger"><span class="mellan-siffra">≈ ${K.kr(m.prognos)}</span><span class="dampad"> hela månaden</span></div>
    </div>
    <p class="undertext">${m.dagar} dygn · ${K.tal(m.kwh)} kWh${m.kwh ? ` · ${K.krKwh(m.hittills / m.kwh)}` : ''}${jamf} · ${m.uppmatta ? 'uppmätt förbrukning' : 'beräknad förbrukning'}</p>
    ${flyttat.antal ? `<p class="flyttat">Flyttat i ${namn}: <strong>≈ ${K.kr(flyttat.kr)}</strong> <span class="dampad">(${flyttat.antal} ${flyttat.antal === 1 ? 'sak' : 'saker'} du bockat av)</span></p>` : ''}`;
}

// ----------------------------------------------------------- 2. signalen ----

let kursOppen = lasLokalt('kursOppen', false);

function visaSignal(s) {
  const { idag, nu, planer, berikade, ref, pImorgon } = s;
  const sig = P.signal({ planer, berikade, nuMs: nu.ms, idag });
  const fran = Math.floor(nu.ms / 900e3) * 900e3;
  const syns = berikade.filter((i) => i.t0 + i.langd * 60e3 > fran);
  // Förklaringen: en rad per dygn och sort, med alla perioder som återstår.
  const forklaring = [];
  for (const p of planer) {
    const dyra = p.dyra.filter((d) => d.slutMs > nu.ms);
    if (dyra.length) forklaring.push(`<span class="nyckel"><i class="ruta dyr ${p.besked}"></i>dyrt ${narDag(p.datum, idag)}${P.tiderText(dyra)} (upp till ${K.kr2(Math.max(...dyra.map((d) => d.max)))})</span>`);
  }
  for (const p of planer) {
    const billiga = p.billiga.filter((d) => d.slutMs > nu.ms);
    if (billiga.length) forklaring.push(`<span class="nyckel"><i class="ruta billig"></i>billigt ${narDag(p.datum, idag)}${P.tiderText(billiga)}</span>`);
  }
  const planI = planer.find((p) => p.datum === s.imorgon);
  const morgonDag = KORT_DAG[K.veckodag(s.imorgon)];
  let morgon;
  if (!pImorgon) morgon = '<p class="morgon dampad">I morgon: priserna kommer kl 13.</p>';
  else if (planI.besked === 'lugnt') morgon = `<p class="morgon"><span class="besked-ord lugnt">Lugnt</span> i morgon ${morgonDag} – inget dyrt (${K.tal(planI.min, 2)}–${K.tal(planI.max, 2)} kr/kWh).</p>`;
  else if (planI.besked === 'svangigt') morgon = `<p class="morgon"><span class="besked-ord svangigt">Svängigt</span> i morgon ${morgonDag} – dyrt ${P.tiderText(planI.dyra)}, men det kostar huset bara ≈ ${K.kr(Math.max(0, planI.extra))} extra.</p>`;
  else {
    const atg = K.dranerAtgarder(planI.dyra, berikade, { [s.imorgon]: planI.delar }, planI.ref, idag, nu.ms);
    morgon = `<details class="morgon-draner"><summary><span class="besked-ord draner">Dra ner</span> i morgon ${P.tiderText(planI.dyra)} – huset ≈ ${K.kr(planI.extra)} över normalt</summary>
      <ul class="enkel">${atg.map((a) => `<li><span><strong>${esc(a.text)}</strong> <span class="dampad">${esc(a.detalj)}</span></span><span class="varde">≈&nbsp;${K.kr(a.sparar)}</span></li>`).join('')}</ul>
      <p class="undertext">Belopp mot att göra det under de dyra timmarna i morgon. Uppskattning.</p></details>`;
  }
  $('#signal').hidden = false;
  $('#signal').className = `kort signal ${sig.klass}`;
  $('#signal').innerHTML = `
    <div class="signal-rad"><span class="signal-ord ${sig.klass}">${esc(sig.ord)}</span>
      <span class="signal-pris">nu <strong>${K.krKwh(sig.aktuellt.total)}</strong><span class="dampad"> · normalt ${K.tal(ref.totalMedian, 2)}</span></span></div>
    <p class="signal-text">${esc(sig.rad)}</p>
    ${remsa(syns, fran, planer)}
    <p class="forklaring">${forklaring.join('') || '<span class="dampad">Inga dyra eller billiga perioder framför dig.</span>'}</p>
    <div id="vadom" aria-live="polite">${vadOmText(s)}</div>
    <details class="kurs" id="kurs"${kursOppen ? ' open' : ''}><summary>Visa kursen</summary>${kursvy(syns, planer, ref, idag)}</details>
    ${morgon}`;
}

/** Zonremsan: från nu till slutet av de kända priserna. Tryck eller piltangenter väljer en tid. */
function remsa(syns, fran, planer) {
  if (!syns.length) return '';
  const slut = syns[syns.length - 1].t0 + syns[syns.length - 1].langd * 60e3;
  const bredd = (slut - fran) / 60e3;
  const x = (ms) => ((ms - fran) / 60e3).toFixed(1);
  const besked = Object.fromEntries(planer.map((p) => [p.datum, p.besked]));
  const delar = [];
  for (const i of syns) {
    if (i.zon !== 'billig') continue;
    const a = Math.max(i.t0, fran);
    delar.push(`<rect x="${x(a)}" y="0" width="${(i.t0 + i.langd * 60e3 - a) / 60e3}" height="24" class="z-billig"/>`);
  }
  // Dyra perioder ritas som ett block: fyllt rött bara på dra ner-dygn, annars kontur.
  for (const p of planer.flatMap((pl) => pl.dyra)) {
    if (p.slutMs <= fran) continue;
    const a = Math.max(p.startMs, fran);
    const w = (p.slutMs - a) / 60e3;
    delar.push(besked[p.datum] === 'draner'
      ? `<rect x="${x(a)}" y="0" width="${w}" height="24" class="z-draner"/>`
      : `<rect x="${(+x(a) + 1.5).toFixed(1)}" y="2" width="${Math.max(0, w - 3)}" height="20" class="z-dyr"/>`);
  }
  const midnatt = planer.length > 1 ? planer[1].kvartar[0].t0 : null;
  const markor = Math.max(4, bredd / 120);
  const vald = vadOmMs !== null && vadOmMs >= fran ? `<rect x="${x(vadOmMs)}" y="0" width="${markor.toFixed(1)}" height="24" class="z-vald"/>` : '';
  const etiketter = ['<span style="left:0">nu</span>'];
  if (midnatt && midnatt > fran) etiketter.push(`<span class="mitt" style="left:${(100 * (midnatt - fran) / 60e3 / bredd).toFixed(1)}%">00 ${KORT_DAG[K.veckodag(planer[1].datum)]}</span>`);
  etiketter.push(`<span style="right:0">${planer.length > 1 ? `${KORT_DAG[K.veckodag(planer[1].datum)]} 24` : '24'}</span>`);
  return `<div class="remsa-ram">
    <svg class="remsa" id="remsa" viewBox="0 0 ${bredd.toFixed(1)} 24" preserveAspectRatio="none" tabindex="0" role="slider"
      aria-label="Priset från nu till ${planer.length > 1 ? 'i morgon kväll' : 'midnatt'}. Välj en tid för att se vad sysslorna kostar då."
      aria-valuemin="0" aria-valuemax="${Math.round(bredd)}" aria-valuenow="${vadOmMs !== null ? Math.round((vadOmMs - fran) / 60e3) : 0}"
      aria-valuetext="${vadOmMs !== null ? K.lokalKlocka(vadOmMs).txt : 'ingen tid vald'}" data-fran="${fran}" data-slut="${slut}">
      <rect x="0" y="0" width="${bredd.toFixed(1)}" height="24" class="z-bas"/>${delar.join('')}
      ${midnatt && midnatt > fran ? `<rect x="${x(midnatt)}" y="0" width="2" height="24" class="z-midnatt"/>` : ''}${vald}
    </svg>
    <div class="remsa-etiketter" aria-hidden="true">${etiketter.join('')}</div></div>`;
}

function vadOmText(s) {
  if (vadOmMs === null) return '<p class="undertext remsa-hjalp">Tryck på en tid i remsan för att se vad sysslorna kostar då.</p>';
  const lista = P.vadOm(s.berikade, s.nu.ms, vadOmMs).sort((a, b) => b.mer - a.mer);
  const k = K.lokalKlocka(vadOmMs);
  if (!lista.length) return `<div class="vadom"><p>Priserna räcker inte för en körning som börjar ${K.narOrd(k, s.idag)} kl ${k.txt}.</p><button type="button" class="lank" data-vadom-stang>Stäng</button></div>`;
  return `<div class="vadom"><p><strong>Startar du ${K.narOrd(k, s.idag)} kl ${k.txt}:</strong></p>
    <ul>${lista.map((x) => `<li><span>${x.namn}</span><span>≈&nbsp;${K.kr2(x.kr)}</span><span class="dampad">${x.mer >= 0.5 ? `+${K.tal(x.mer, 2)} · bäst ${x.bast.klocka.txt}` : 'bra tid'}</span></li>`).join('')}</ul>
    <button type="button" class="lank" data-vadom-stang>Stäng</button></div>`;
}

/** Kursen: en stapel per timme, grå utom i perioderna, med normalpriset som en tunn linje. */
function kursvy(syns, planer, ref, idag) {
  const timmar = [];
  for (const i of syns) {
    const nyckel = `${i.datum} ${i.timme}`;
    let t = timmar[timmar.length - 1];
    if (!t || t.nyckel !== nyckel) timmar.push(t = { nyckel, datum: i.datum, timme: i.timme, t0: i.t0, sum: 0, min: 0, zon: new Set() });
    t.sum += i.total * i.langd; t.min += i.langd;
    if (i.zon) t.zon.add(i.zon);
  }
  if (!timmar.length) return '';
  const besked = Object.fromEntries(planer.map((p) => [p.datum, p.besked]));
  const vals = timmar.map((t) => t.sum / t.min);
  const max = Math.max(...vals, ref.totalMedian) * 1.08;
  const B = 10, H = 64;
  const y = (v) => H - (v / max) * H;
  const staplar = timmar.map((t, k) => {
    const v = vals[k];
    const klass = t.zon.has('dyr') ? (besked[t.datum] === 'draner' ? 'k-draner' : 'k-dyr') : t.zon.has('billig') ? 'k-billig' : 'k-normal';
    const top = Math.min(H - 2, y(v)), x0 = k * B + 1, w = B - 2, r = 2;
    const d = `M${x0},${H}V${(top + r).toFixed(1)}Q${x0},${top.toFixed(1)} ${x0 + r},${top.toFixed(1)}H${x0 + w - r}Q${x0 + w},${top.toFixed(1)} ${x0 + w},${(top + r).toFixed(1)}V${H}Z`;
    return `<path d="${d}" class="${klass}" data-t0="${t.t0}"><title>${narDag(t.datum, idag)}kl ${String(t.timme).padStart(2, '0')}: ${K.krKwh(v)}</title></path>`;
  }).join('');
  const etik = timmar.map((t, k) => (k === 0 || t.timme === 0 || t.timme === 12
    ? `<span style="left:${(100 * (k + 0.5) / timmar.length).toFixed(1)}%">${t.timme === 0 ? `00 ${KORT_DAG[K.veckodag(t.datum)]}` : String(t.timme).padStart(2, '0')}</span>` : '')).join('');
  const dyrast = vals.indexOf(Math.max(...vals)), billigast = vals.indexOf(Math.min(...vals));
  const tim = (k) => `${narDag(timmar[k].datum, idag)}kl ${String(timmar[k].timme).padStart(2, '0')}`;
  const yN = y(ref.totalMedian).toFixed(1);
  return `<div class="kurs-ram">
    <svg class="kursvy" viewBox="0 0 ${timmar.length * B} ${H}" preserveAspectRatio="none" role="img"
      aria-label="Timpriser framåt. Dyrast ${tim(dyrast)} ${K.krKwh(vals[dyrast])}, billigast ${tim(billigast)} ${K.krKwh(vals[billigast])}, normalt ${K.krKwh(ref.totalMedian)}.">
      ${staplar}<line x1="0" x2="${timmar.length * B}" y1="${yN}" y2="${yN}" class="k-normallinje"/>
    </svg>
    <div class="kurs-etiketter" aria-hidden="true">${etik}</div>
    <p class="undertext">En stapel per timme. Linjen är normalpriset ${K.kr2(ref.totalMedian)}. Dyrast ${tim(dyrast)} (${K.kr2(vals[dyrast])}), billigast ${tim(billigast)} (${K.kr2(vals[billigast])}). Tryck på en stapel för vad-om.</p></div>`;
}

function valjTid(ms) {
  if (!senast) return;
  const t = Math.floor(ms / 900e3) * 900e3;
  vadOmMs = senast.berikade.some((i) => i.t0 === t) ? t : null;
  $('#vadom').innerHTML = vadOmText(senast);
  const svg = $('#remsa');
  if (!svg) return;
  const fran = +svg.dataset.fran;
  svg.querySelector('.z-vald')?.remove();
  if (vadOmMs === null) return;
  const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  r.setAttribute('x', ((vadOmMs - fran) / 60e3).toFixed(1));
  r.setAttribute('y', '0'); r.setAttribute('width', Math.max(4, (+svg.dataset.slut - fran) / 60e3 / 120).toFixed(1)); r.setAttribute('height', '24');
  r.setAttribute('class', 'z-vald');
  svg.appendChild(r);
  svg.setAttribute('aria-valuenow', Math.round((vadOmMs - fran) / 60e3));
  svg.setAttribute('aria-valuetext', K.lokalKlocka(vadOmMs).txt);
}

document.addEventListener('click', (e) => {
  const svg = e.target.closest('#remsa');
  if (svg) {
    const r = svg.getBoundingClientRect();
    const andel = Math.min(0.999, Math.max(0, (e.clientX - r.left) / r.width));
    valjTid(+svg.dataset.fran + andel * (+svg.dataset.slut - +svg.dataset.fran));
    return;
  }
  const stapel = e.target.closest('.kursvy path[data-t0]');
  if (stapel) { valjTid(+stapel.dataset.t0); return; }
  if (e.target.closest('[data-vadom-stang]')) { vadOmMs = null; $('#vadom').innerHTML = vadOmText(senast); $('#remsa .z-vald')?.remove(); }
});
document.addEventListener('keydown', (e) => {
  const svg = e.target.closest?.('#remsa');
  if (!svg || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  const fran = +svg.dataset.fran, slut = +svg.dataset.slut;
  const nu = vadOmMs ?? fran;
  const ny = e.key === 'Home' ? fran : e.key === 'End' ? slut - 900e3 : nu + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 3600e3 : 900e3);
  valjTid(Math.min(slut - 900e3, Math.max(fran, ny)));
});
document.addEventListener('toggle', (e) => {
  if (e.target.id === 'kurs') { kursOppen = e.target.open; sparaLokalt('kursOppen', kursOppen); }
  if (e.target.id === 'mer' && e.target.open && senast) visaMer(senast);
}, true);

// --------------------------------------------------------- 3. orderboken ----

function paminnelseFor(r, nuMs) {
  if (!r.startMs) return null;
  return P.paminnelse({ namn: r.namn, startMs: r.startMs, timer: Boolean(r.syssla?.timer) && r.typ === 'vanta',
    text: r.typ === 'fore' ? `${r.namn}: starta nu – ${r.huvud}.` : `${r.namn} ${r.huvud}. ${r.detalj[0] ?? ''}` }, nuMs);
}

const hittaPaminnelse = (nyckel) => Object.values(paminnelser).find((x) => x.nyckel === nyckel);
const paminnerTxt = (pam, idag) => `<span class="paminner">${KLOCKA} påminner ${esc(K.narOrd(K.lokalKlocka(pam.narMs), idag))} kl ${K.lokalKlocka(pam.narMs).txt} · <button type="button" class="lank" data-pamin-bort="${esc(pam.nyckel)}">ta bort</button></span>`;

function visaOrderbok(s) {
  const { idag, nu, planer, orderbok: ob } = s;
  const planIdag = planer[0];
  const kvar = planIdag.dyra.filter((p) => p.slutMs > nu.ms);
  const draner = planIdag.besked === 'draner' && kvar.length > 0;
  const rubrik = draner
    ? `<h2>Dra ner ${P.tiderText(kvar, ' · ')}</h2><p class="exponering">Huset ≈ ${K.tal(planIdag.kwh)} kWh under dagens dyra timmar, ≈ ${K.kr(planIdag.extra)} över normalt <span class="dampad">(beräknat)</span>. Bocka av det du gör:</p>`
    : `<div class="rubrikrad"><h2>När ska jag köra?</h2>${ob.rader.length ? `<span class="dampad">≈ ${K.kr(ob.summa)} om allt flyttas</span>` : ''}</div>`;
  const rad = (r) => {
    const nyckel = `${idag}:${r.id}`;
    const pam = hittaPaminnelse(nyckel);
    const p = pam ? null : paminnelseFor(r, nu.ms);
    return `<li class="order-rad">
      <input type="checkbox" data-bock="${esc(r.id)}" aria-label="${esc(r.namn)} gjort"${journal[nyckel] ? ' checked' : ''}>
      <div class="rad-text"><span><strong>${esc(r.namn)}</strong> ${esc(r.huvud)}</span>
        ${r.detalj.map((d) => `<span class="dampad">${esc(d)}</span>`).join('')}
        ${pam ? paminnerTxt(pam, idag) : ''}</div>
      <span class="varde">≈&nbsp;${K.kr(r.varde)}</span>
      ${p ? `<button type="button" class="knapp-ikon liten" data-pamin="${esc(r.id)}" aria-label="Påminn mig om ${esc(r.namn.toLowerCase())} ${esc(K.narOrd(p.nar, idag))} kl ${p.nar.txt}" title="Påminn mig ${esc(K.narOrd(p.nar, idag))} kl ${p.nar.txt}">${KLOCKA}</button>` : '<span></span>'}
    </li>`;
  };
  const ingen = ob.ingenRoll.length
    ? `<p class="ingen-roll">${ob.rader.length ? `Spelar ingen roll i dag: ${esc(ob.ingenRoll.join(', '))}.` : `Spelar ingen roll i dag – kör ${esc(ob.ingenRoll.filter((x) => x !== 'sänka värmen').join(', '))} när det passar dig.`}</p>` : '';

  // Kontrollrader: bilen och värmepumpen.
  const bil = P.bilFonster({ berikade: s.berikade, nuMs: nu.ms, idag, inst });
  const bilTxt = !s.pImorgon && K.lokalKlocka(nu.ms).timme >= 7
    ? 'Bil: nattens priser kommer kl 13.'
    : bil?.bast ? `Bil: laddboxen bör ladda ${esc(bil.txt)}${bil.sparar >= K.GRANS_KR ? ` – ≈ ${K.kr(bil.sparar)} billigare än direkt kl 18` : ''}. <span class="dampad">(antaget ${K.tal(bil.kwh, 1)} kWh)</span>`
      : 'Bil: inget nattfönster inom de kända priserna.';
  const vpPlan = kvar.length ? planIdag : planer[1];
  const vp = P.varmepumpLage(vpPlan, nu.ms);
  const vpTxt = vp
    ? `Värmepump ostyrd: ≈ ${K.tal(vp.kwh)} av husets ${K.tal(vp.husKwh)} kWh ${vpPlan.datum === idag ? '' : 'i morgon '}${vp.tider}${vp.extra >= 0.5 ? `, ≈ ${K.kr(vp.extra)} över normalt` : ''} <span class="dampad">(beräknat)</span>.`
    : 'Värmepump ostyrd – inga dyra perioder framför dig.';

  $('#orderbok').hidden = false;
  $('#orderbok').className = `kort orderbok${draner ? ' draner' : ''}`;
  $('#orderbok').innerHTML = `${rubrik}
    ${ob.rader.length ? `<ul class="orderlista">${ob.rader.map(rad).join('')}</ul>` : ''}
    ${ingen}
    <ul class="kontroll">
      <li>${bilTxt}</li>
      <li>${vpTxt} <a href="#mer-varmepump" data-oppna-mer>Smart Price ›</a></li>
    </ul>
    ${visaOrdrar(s)}
    ${inst.ntfyAmne ? '' : `<p class="undertext pamin-tips">${KLOCKA} Vill du bli påmind? Fyll i ditt ntfy-ämne under <button type="button" class="lank" data-installningar>Inställningar</button>.</p>`}`;
}

// Bocka av = journal. Beloppet låses när du bockar.
document.addEventListener('change', (e) => {
  const ruta = e.target.closest('input[data-bock]');
  if (!ruta || !senast) return;
  const r = senast.orderbok.rader.find((x) => x.id === ruta.dataset.bock);
  const nyckel = `${senast.idag}:${ruta.dataset.bock}`;
  if (ruta.checked && r) journal[nyckel] = { kr: r.varde, text: `${r.namn} ${r.huvud}` };
  else delete journal[nyckel];
  sparaLokalt('journal', journal);
  visaManad(senast);
});

// ------------------------------------------------------- egna ordrar ----

function visaOrdrar(s) {
  const { idag, nu, berikade } = s;
  const rader = ordrar.map((o) => {
    const u = P.utvarderaOrder(o, berikade, nu.ms);
    if (!u) return '';
    const senastK = K.lokalKlocka(o.senastMs);
    const villkor = `klar före ${K.narOrd(senastK, idag)} ${senastK.txt}${Number.isFinite(o.maxPris) ? ` · högst ${K.krKwh(o.maxPris)}` : ''}`;
    const start = u.start ?? u.reserv;
    let status;
    if (u.status === 'planerad') {
      status = `Plan: ${u.s.timer && u.start.om > 0 ? `ställ ${u.start.om} h → start` : 'starta'} ${K.narOrd(u.start.klocka, idag)} kl ${u.start.klocka.txt} · ${K.krKwh(u.prisKwh)}`;
    } else if (u.status === 'dags') status = `Plan: <strong>starta nu</strong> · ${K.krKwh(u.prisKwh)}`;
    else if (u.status === 'vantar') {
      status = `Väntar på ${s.pImorgon ? 'nästa dygns' : 'morgondagens'} priser kl 13${u.reserv ? ` – annars ${K.narOrd(u.reserv.klocka, idag)} kl ${u.reserv.klocka.txt} (${K.krKwh(u.prisKwh)})` : ''}`;
    } else status = 'Hinner inte före din tid – ta bort ordern.';
    const pam = hittaPaminnelse(`order:${o.id}`);
    const p = !pam && start && u.status !== 'for-sent' ? P.paminnelse({ namn: u.s.namn, startMs: start.startMs, timer: u.s.timer && start.om > 0 }, nu.ms) : null;
    return `<li class="order-rad egen">
      <input type="checkbox" data-order-klar="${esc(o.id)}" aria-label="${esc(u.s.namn)} gjort">
      <div class="rad-text"><span><strong>${esc(u.s.namn)}</strong> <span class="dampad">${esc(villkor)}</span></span>
        <span>${status}</span>
        ${pam ? paminnerTxt(pam, idag) : ''}</div>
      <button type="button" class="knapp-ikon liten" data-order-bort="${esc(o.id)}" aria-label="Ta bort ordern" title="Ta bort ordern">✕</button>
      ${p ? `<button type="button" class="knapp-ikon liten" data-pamin-order="${esc(o.id)}" aria-label="Påminn mig ${esc(K.narOrd(p.nar, idag))} kl ${p.nar.txt}" title="Påminn mig ${esc(K.narOrd(p.nar, idag))} kl ${p.nar.txt}">${KLOCKA}</button>` : '<span></span>'}
    </li>`;
  }).join('');
  return `<div class="ordrar"><div class="rubrikrad"><h3>Mina ordrar</h3><button type="button" class="knapp-sekundar liten" id="ny-order">+ Ny order</button></div>
    ${rader ? `<ul class="orderlista">${rader}</ul>` : '<p class="undertext">Lägg en order, t.ex. "torken klar före lördag 07, högst 1,20 kr/kWh", så räknar Elkollen ut när den ska köras.</p>'}</div>`;
}

function oppnaOrderdialog() {
  const f = $('#orderform');
  f.syssla.innerHTML = K.SYSSLOR.map((x) => `<option value="${x.id}">${x.namn}</option>`).join('');
  const idag = K.dagensDatum();
  f.dag.innerHTML = [0, 1, 2].map((n) => { const d = K.laggTillDagar(idag, n); return `<option value="${d}">${stor(K.dagnamn(d, idag))}</option>`; }).join('');
  f.dag.value = K.laggTillDagar(idag, 1);
  f.tid.value = '07:00';
  const p25 = senast?.ref.p25;
  const forslag = Number.isFinite(p25) ? Math.round(p25 * 20) / 20 : null;
  f.maxPris.value = forslag === null ? '' : forslag.toFixed(2);
  $('#order-tips').textContent = forslag === null ? ''
    : `Förslaget ${K.krKwh(forslag)} är ungefär den nivå som en fjärdedel av kvartarna senaste 30 dygnen låg under. Lämna tomt för bästa tid utan tak.`;
  $('#orderdialog').returnValue = '';
  $('#orderdialog').showModal();
}

$('#orderdialog').addEventListener('close', () => {
  if ($('#orderdialog').returnValue !== 'lagg') return;
  const f = $('#orderform');
  const senastMs = Date.parse(`${f.dag.value}T${f.tid.value}:00${tidszon(f.dag.value, f.tid.value)}`);
  const maxPris = f.maxPris.value === '' ? null : Number(String(f.maxPris.value).replace(',', '.'));
  if (!Number.isFinite(senastMs)) return;
  ordrar.push({ id: Math.random().toString(36).slice(2, 10), syssla: f.syssla.value, senastMs, maxPris: Number.isFinite(maxPris) ? maxPris : null, skapad: Date.now() });
  sparaLokalt('ordrar', ordrar);
  if (senast) visaOrderbok(senast);
});
$('#order-avbryt').addEventListener('click', () => $('#orderdialog').close('avbryt'));

/** +01:00 eller +02:00 för en svensk lokal tid. */
function tidszon(datum, tid) {
  return K.lokalKlocka(Date.parse(`${datum}T${tid}:00+01:00`)).txt === tid ? '+01:00' : '+02:00';
}

document.addEventListener('click', (e) => {
  if (e.target.closest('#ny-order')) { oppnaOrderdialog(); return; }
  const bort = e.target.closest('[data-order-bort]');
  if (bort) {
    const id = bort.dataset.orderBort;
    avbrytPaminnelse(`order:${id}`);
    ordrar = ordrar.filter((o) => o.id !== id);
    sparaLokalt('ordrar', ordrar);
    if (senast) visaOrderbok(senast);
    return;
  }
  if (e.target.closest('[data-installningar]')) { $('#oppna-installningar').click(); return; }
  if (e.target.closest('[data-oppna-mer]')) $('#mer').open = true;
});
document.addEventListener('change', (e) => {
  const ruta = e.target.closest('input[data-order-klar]');
  if (!ruta || !senast || !ruta.checked) return;
  const o = ordrar.find((x) => x.id === ruta.dataset.orderKlar);
  if (!o) return;
  const u = P.utvarderaOrder(o, senast.berikade, senast.nu.ms);
  journal[`${senast.idag}:order-${o.id}`] = { kr: Math.max(0, u?.sparar ?? 0), text: `Order ${u?.s.namn ?? ''}` };
  sparaLokalt('journal', journal);
  avbrytPaminnelse(`order:${o.id}`);
  ordrar = ordrar.filter((x) => x.id !== o.id);
  sparaLokalt('ordrar', ordrar);
  visaManad(senast);
  visaOrderbok(senast);
});

// --------------------------------------------------------- påminnelser ----
// Läggs som ett schemalagt ntfy-meddelande (högst 3 dygn fram). Samma sekvens-id
// ersätter ett schemalagt meddelande, DELETE tar bort det.

async function ntfy(metod, vag, kropp) {
  const server = (inst.ntfyServer || 'https://ntfy.sh').replace(/\/$/, '');
  const r = await fetch(`${server}${vag}`, { method: metod, body: kropp ? JSON.stringify(kropp) : undefined, headers: kropp ? { 'Content-Type': 'application/json' } : {} });
  if (!r.ok) throw new Error(`ntfy svarade ${r.status}`);
}

async function laggPaminnelse(nyckel, titel, p, startMs) {
  if (!inst.ntfyAmne) { $('#oppna-installningar').click(); return; }
  const sekvens = `elkollen-${nyckel.replace(/[^A-Za-z0-9]/g, '-')}`.slice(0, 64);
  try {
    await ntfy('POST', '/', P.ntfyKropp(inst.ntfyAmne, sekvens, titel, p, location.href.split('#')[0]));
    paminnelser[sekvens] = { sekvens, nyckel, narMs: p.narMs, startMs, titel };
    sparaLokalt('paminnelser', paminnelser);
  } catch (e) {
    alert(`Påminnelsen kunde inte läggas (${e.message}). Kontrollera ntfy-ämnet under Inställningar.`);
  }
  if (senast) visaOrderbok(senast);
}

async function avbrytPaminnelse(nyckel) {
  const p = hittaPaminnelse(nyckel);
  if (!p) return;
  delete paminnelser[p.sekvens];
  sparaLokalt('paminnelser', paminnelser);
  try { await ntfy('DELETE', `/${encodeURIComponent(inst.ntfyAmne)}/${p.sekvens}`); } catch { /* bästa försök */ }
}

/** Om planen ändrats sedan påminnelsen lades flyttas den (samma sekvens ersätter den gamla). */
async function synkaPaminnelser(s) {
  if (!inst.ntfyAmne) return;
  for (const r of s.orderbok.rader) {
    const pam = hittaPaminnelse(`${s.idag}:${r.id}`);
    if (!pam || Math.abs(pam.startMs - r.startMs) < 15 * 60e3) continue;
    const p = paminnelseFor(r, s.nu.ms);
    if (!p) continue;
    try {
      await ntfy('POST', '/', P.ntfyKropp(inst.ntfyAmne, pam.sekvens, pam.titel, p, location.href.split('#')[0]));
      paminnelser[pam.sekvens] = { ...pam, narMs: p.narMs, startMs: r.startMs };
      sparaLokalt('paminnelser', paminnelser);
    } catch { /* försök igen vid nästa uppdatering */ }
  }
}

document.addEventListener('click', (e) => {
  const knapp = e.target.closest('[data-pamin]');
  if (knapp && senast) {
    const r = senast.orderbok.rader.find((x) => x.id === knapp.dataset.pamin);
    const p = r && paminnelseFor(r, Date.now());
    if (p) laggPaminnelse(`${senast.idag}:${r.id}`, `Elkollen: ${r.namn}`, p, r.startMs);
    return;
  }
  const ok = e.target.closest('[data-pamin-order]');
  if (ok && senast) {
    const o = ordrar.find((x) => x.id === ok.dataset.paminOrder);
    const u = o && P.utvarderaOrder(o, senast.berikade, Date.now());
    const start = u?.start ?? u?.reserv;
    const p = start && P.paminnelse({ namn: u.s.namn, startMs: start.startMs, timer: u.s.timer && start.om > 0 }, Date.now());
    if (p) laggPaminnelse(`order:${o.id}`, `Elkollen: ${u.s.namn}`, p, start.startMs);
    return;
  }
  const bort = e.target.closest('[data-pamin-bort]');
  if (bort) avbrytPaminnelse(bort.dataset.paminBort).then(() => senast && visaOrderbok(senast));
});

// ------------------------------------------------------ 4. kommande dagar ----

let valdDag = null;

function visaDagar(s) {
  const { idag, planer, kostnadDygn, prognos, tempFor } = s;
  const dagar = planer.map((p) => ({ d: p.datum, kr: kostnadDygn(p.datum).kr, besked: p.besked, plan: p, uppsk: false }));
  for (const p of prognos) {
    if (dagar.some((x) => x.d === p.datum)) continue;
    const kr = K.dygnskostnad(p.datum, new Array(24).fill(p.spot), tempFor(p.datum), inst).kr;
    dagar.push({ d: p.datum, kr, besked: p.dyr ? 'dyrt' : 'okant', prognos: p, uppsk: true });
  }
  if (!dagar.some((x) => x.d === valdDag)) valdDag = null;
  const dyra = dagar.filter((x) => x.uppsk && x.besked === 'dyrt');
  let forvarning = '';
  if (dyra.length) {
    // Peka på det billigaste dygnet före det första dyra som inte självt ser dyrt ut.
    const fore = dagar.filter((x) => x.d < dyra[0].d && x.d > idag && x.besked !== 'dyrt' && x.besked !== 'draner');
    const bast = fore.sort((a, b) => a.kr - b.kr)[0];
    forvarning = `<p class="forvarning"><strong>Troligen dyrt ${esc(dyra.map((x) => K.dagnamn(x.d, idag)).join(', '))}</strong> – ${bast ? `kör det som kan vänta ${esc(K.dagnamn(bast.d, idag))}` : 'inget billigare dygn före – använd de billiga perioderna'}. <span class="dampad">Uppskattning, ungefär 6 av 10 stämmer.</span></p>`;
  }
  const x = dagar.find((y) => y.d === valdDag);
  let detalj = '';
  if (x && !x.uppsk) {
    const p = x.plan;
    detalj = `<p class="dagdetalj"><strong>${stor(K.dagnamn(x.d, idag))}: ${P.BESKED_TEXT[p.besked]}.</strong> ${K.tal(p.min, 2)}–${K.tal(p.max, 2)} kr/kWh. ${p.dyra.length ? `Dyrt ${P.tiderText(p.dyra)}. ` : ''}${p.billiga.length ? `Billigt ${P.tiderText(p.billiga)}. ` : ''}Huset ≈ ${K.kr(x.kr)}.</p>`;
  } else if (x) {
    const pr = x.prognos;
    const tot = (sp) => K.dygnsTotal(sp, x.d, inst);
    const orsak = pr.orsak?.length ? ` Orsak: ${pr.orsak.join(', ')}.` : '';
    detalj = `<p class="dagdetalj"><strong>${stor(K.dagnamn(x.d, idag))} ≈ ${K.kr(x.kr)}.</strong> Dygnsmedel ≈ ${K.krKwh(tot(pr.spot))} (troligen ${K.tal(tot(pr.spotLag), 2)}–${K.tal(tot(pr.spotHog), 2)}).${orsak} <span class="dampad">Uppskattning; exakta priser kl 13 dagen före.</span></p>`;
  }
  const prick = (y) => (y.besked === 'draner' ? 'mycket-dyrt' : y.besked === 'svangigt' || y.besked === 'dyrt' ? 'dyrt' : y.besked === 'lugnt' ? 'billigt' : 'normalt');
  $('#dagar').hidden = false;
  $('#dagar').innerHTML = `<h2>Kommande dagar</h2>
    <div class="dagrad">${dagar.map((y) => `<button type="button" class="dagruta${y.d === valdDag ? ' vald' : ''}" data-dag="${y.d}" aria-expanded="${y.d === valdDag}">
      <span class="dagnamn">${y.d === idag ? 'I dag' : stor(KORT_DAG[K.veckodag(y.d)])}</span>
      <span class="prick ${prick(y)}"></span>
      <span class="dagkr">${y.uppsk ? '≈' : ''}${K.tal(y.kr)}</span></button>`).join('')}
    </div>
    ${detalj}${forvarning}
    <p class="undertext">Kronor per dygn för huset. Grön = lugnt, gul = dyra timmar, röd = dra ner, ≈ = uppskattning. Tryck på en dag.</p>`;
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-dag]');
  if (!b || !senast) return;
  valdDag = valdDag === b.dataset.dag ? null : b.dataset.dag;
  visaDagar(senast);
});

// ------------------------------------------------------------------ 5. mer ----

let fastOre = lasLokalt('fastOre', null);

function visaMer(s) {
  const { idag, kostnadDygn, tim, tempFor } = s;
  const m = manadsSiffror(s);
  const summa = m.delar.elpris + m.delar.natavgift + m.delar.energiskatt || 1;
  const pct = (x) => Math.round(100 * x / summa);
  const fran = K.laggTillDagar(idag, -365), till = K.laggTillDagar(idag, -1);

  // Jämfört med samma dygn i fjol: elpriset och förbrukningen (vädret).
  const manad = idag.slice(0, 7);
  const iAr = { kr: 0, kwh: 0 }, iFjol = { kr: 0, kwh: 0 };
  for (let d = `${manad}-01`; d < idag; d = K.laggTillDagar(d, 1)) {
    const a = kostnadDygn(d), b = kostnadDygn(`${Number(d.slice(0, 4)) - 1}${d.slice(4)}`);
    if (!a || !b) continue;
    iAr.kr += a.kr; iAr.kwh += a.kwh; iFjol.kr += b.kr; iFjol.kwh += b.kwh;
  }
  let fjolTxt = '<p class="undertext">Ingen jämförelse än.</p>';
  if (iAr.kwh && iFjol.kwh) {
    const pA = iAr.kr / iAr.kwh, pF = iFjol.kr / iFjol.kwh;
    const pris = (pA - pF) * iAr.kwh, forb = (iAr.kwh - iFjol.kwh) * pF;
    const tecken = (v) => `${v >= 0 ? '+' : '−'}${K.kr(Math.abs(v))}`;
    fjolTxt = `<p>Samma dygn hittills: ${K.kr(iAr.kr)} i år mot ${K.kr(iFjol.kr)} i fjol (${tecken(iAr.kr - iFjol.kr)}).</p>
      <ul><li>Priset per kWh: ${tecken(pris)} (${K.krKwh(pA)} mot ${K.krKwh(pF)})</li><li>Förbrukningen (vädret): ${tecken(forb)} (${K.tal(iAr.kwh)} mot ${K.tal(iFjol.kwh)} kWh)</li></ul>
      <p class="undertext">Det är marknaden och vädret – inget du gjort.${m.uppmatta ? '' : ' Förbrukningen är beräknad; när du använder el syns först med inlästa mätvärden.'}</p>`;
  }

  const pos = P.positioner(tim, fran, till, tempFor, inst);
  const DELNAMN = { bil: 'Bilen', varmvatten: 'Varmvattnet', hushall: 'Hushållselen', varme: 'Värmen' };
  const posRader = Object.entries(pos.delar).filter(([, v]) => v.kwh > 0)
    .map(([k, v]) => `<tr><td>${DELNAMN[k]}</td><td>${K.tal(v.kwh)}</td><td>${K.tal(v.krKwh, 2)}</td><td>${Math.abs(v.mot) < 0.5 ? '' : v.mot < 0 ? '−' : '+'}${K.tal(Math.abs(v.mot))}</td></tr>`).join('');

  const fp = P.jamforFastpris(tim, fran, till, tempFor, inst, fastOre === null ? NaN : Number(fastOre));
  const fastTxt = fp.fast !== null
    ? `<p>Med fast pris ${K.tal(+fastOre, 1)} öre/kWh hade elhandelns del blivit ${K.kr(fp.fast)} – ${K.kr(Math.abs(fp.fast - fp.rorligt))} ${fp.fast > fp.rorligt ? 'mer' : 'mindre'} än med kvartspris. <span class="dampad">Beräknat, utan månadsavgifter. Ingen rekommendation – ett fast pris är en försäkring mot svängningar.</span></p>` : '';

  const manader = [];
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
  const sum = (f) => manader.reduce((a, y) => a + f(y), 0);
  $('#mer-innehall').innerHTML = `
    <h3>${stor(MANADER[+manad.slice(5, 7) - 1])} hittills</h3>
    <p>Elpris ${K.kr(m.delar.elpris)} (${pct(m.delar.elpris)} %) · Elnät ${K.kr(m.delar.natavgift)} (${pct(m.delar.natavgift)} %) · Energiskatt ${K.kr(m.delar.energiskatt)} (${pct(m.delar.energiskatt)} %). Bara elpriset påverkas av när du använder el.</p>
    <h3>Jämfört med i fjol</h3>${fjolTxt}
    <h3 id="mer-varmepump">Positioner senaste 12 månaderna</h3>
    <p class="undertext">Vad varje del betalat per kWh, och skillnaden i kronor mot om den använt el jämnt över dygnet. Minus = billigare. Beräknat${m.uppmatta ? '' : ' med förbrukningsmodellen'}.</p>
    <div class="tabellrulle"><table><thead><tr><th>Del</th><th>kWh</th><th>kr/kWh</th><th>mot jämnt, kr</th></tr></thead><tbody>${posRader}</tbody></table></div>
    <p>Värmepumpen går ostyrd och är den största posten som återstår. Calibran kan kopplas till Thermia Online och styras med <strong>Smart Price</strong> (gratis) – uppskattningsvis 1 900–2 300 kr/år. Elkollen styr den inte själv.</p>
    <h3>Prissäkring</h3>
    <p>Med kvartspris betalade elhandelns del ${K.kr(fp.rorligt)} för ${K.tal(fp.kwh)} kWh senaste året (${K.krKwh(fp.rorligt / fp.kwh)}). Månadsmedlet varierade ${K.tal(fp.manadMin, 2)}–${K.tal(fp.manadMax, 2)} kr/kWh – för 1 700 kWh en vintermånad är det ${K.kr(1700 * (fp.manadMax - fp.manadMin))} i skillnad. Det är marknadsrisken som bara ett fast pris tar bort.</p>
    <label class="fastpris">Jämför med ett fastprisanbud (öre/kWh inkl. moms, elhandelns pris) <input type="number" id="fastpris" step="any" inputmode="decimal" value="${fastOre ?? ''}"></label>
    ${fastTxt}
    <h3>Senaste 12 månaderna</h3>
    <div class="tabellrulle"><table>
      <thead><tr><th>Månad</th><th>kWh</th><th>Kostnad</th><th>kr/kWh</th></tr></thead>
      <tbody>${manader.map((y) => `<tr><td>${MANADER[+y.m.slice(5, 7) - 1].slice(0, 3)} ${y.m.slice(0, 4)}${y.n < y.antal ? ` <span class="undertext">(${y.n} dygn)</span>` : ''}</td><td>${K.tal(y.kwh)}</td><td>${K.kr(y.kr)}</td><td>${K.tal(y.kr / y.kwh, 2)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th>Summa</th><th>${K.tal(sum((y) => y.kwh))}</th><th>${K.kr(sum((y) => y.kr))}</th><th>${K.tal(sum((y) => y.kr) / sum((y) => y.kwh), 2)}</th></tr></tfoot>
    </table></div>`;
}

document.addEventListener('change', (e) => {
  if (e.target.id !== 'fastpris') return;
  const v = Number(String(e.target.value).replace(',', '.'));
  fastOre = e.target.value === '' || !Number.isFinite(v) ? null : v;
  sparaLokalt('fastOre', fastOre);
  if (senast) visaMer(senast);
});

// ---------------------------------------------------------- inställningar ----

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
  f.ntfyAmne.value = v.ntfyAmne ?? '';
  f.ntfyServer.value = v.ntfyServer ?? 'https://ntfy.sh';
  $('#varme-text').textContent = `Resten, ${K.tal(K.varmeKwhAr(v))} kWh/år, räknas som uppvärmning och följer utetemperaturen.`;
  visaMatstatus();
}

function visaMatstatus() {
  const s = matvarden?.statistik;
  $('#matstatus').textContent = s ? `Inlästa mätvärden: ${s.antalDygn} dygn (${s.fran} – ${s.till}), ${K.tal(s.kwh)} kWh, upplösning ${s.upplosning}.` : 'Inga mätvärden inlästa – förbrukningen beräknas.';
}

function lasFormular() {
  const f = $('#installningsform');
  const n = (v) => Number(String(v).replace(',', '.'));
  return {
    arsforbrukning: n(f.arsforbrukning.value), bilKwhAr: n(f.bilKwhAr.value), hushallKwhAr: n(f.hushallKwhAr.value),
    varmvattenKwhDag: n(f.varmvattenKwhDag.value), natTariff: f.natTariff.value,
    natFastKrManad: { sakring: n(f.natFastSakring.value), tid: n(f.natFastTid.value) },
    overforing: { sakring: n(f.overforingSakring.value) / 100, tidHog: n(f.overforingTidHog.value) / 100, tidLag: n(f.overforingTidLag.value) / 100 },
    paslagOre: n(f.paslagOre.value), handelKrManad: n(f.handelKrManad.value), varningKr: n(f.varningKr.value),
    ntfyAmne: f.ntfyAmne.value.trim(), ntfyServer: f.ntfyServer.value.trim() || 'https://ntfy.sh',
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
    inst = { ...K.STANDARD, ...ny,
      natFastKrManad: { ...K.STANDARD.natFastKrManad, ...ny.natFastKrManad },
      overforing: { ...K.STANDARD.overforing, ...ny.overforing } };
    if (!sparaLokalt('installningar', ny)) $('#plats').textContent = 'SE3 · Jönköping · inställningarna sparas inte i den här webbläsaren';
    start();
  } else if (matvardenAndrade) start();
});
$('#avbryt').addEventListener('click', () => $('#installningar').close('avbryt'));
// Återställ fyller bara formuläret med standardvärdena (ntfy-ämnet behålls); inget sparas förrän Spara.
$('#aterstall').addEventListener('click', () => fyllFormular({ ...K.STANDARD, ntfyAmne: inst.ntfyAmne, ntfyServer: inst.ntfyServer }));
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
  if (document.visibilityState === 'visible' && Math.floor(Date.now() / 900e3) !== senastKvart) { start(); schemalagg(); }
});
start();
schemalagg();
