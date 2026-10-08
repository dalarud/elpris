// Skickar varningar till mobilen via ntfy (https://ntfy.sh). Körs av GitHub
// Actions strax efter kl 13 när morgondagens priser publicerats.
//
// Regler (för att inte tjata):
//   1. Känt pris: dyra perioder i morgon -> en notis med tider, pris och vad det kostar huset.
//   2. Förvarning: om dygnet 3 dagar fram uppskattas bli dyrt -> en notis (märkt uppskattning).
//   Annars skickas ingenting.
//
// Miljövariabler: NTFY_TOPIC (hemligt ämnesnamn; utan det skrivs notisen bara ut),
//                 NTFY_SERVER (valfri, standard https://ntfy.sh), APP_URL (länk i notisen).
// Kör lokalt:     node tools/notis.mjs [--datum 2026-01-14]   (låtsas att det är det datumet)

import * as K from '../app/js/kalkyl.js';
import { prisprognos } from '../app/js/prognos.js';
import { priserDygn, timprisHistorik, vaderprognos, tempHistorik } from '../app/js/data.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROT = join(dirname(fileURLToPath(import.meta.url)), '..');
const inst = { ...K.STANDARD };
const FORVARNING_DYGN = 3;

/** Kronexempel för den dyraste perioden jämfört med dygnets billigaste 3 timmar. */
function exempel(dygn, berikade, idag) {
  const p = [...dygn.perioder].sort((a, b) => b.medelTotal - a.medelTotal)[0];
  const txt = K.exempeltext(p, K.billigasteFonster(berikade, 3), idag);
  return txt ? ` ${txt.replace('under perioden', `kl ${p.franTxt}–${p.tillTxt}`)}` : '';
}

function lasJson(fil) {
  try { return JSON.parse(readFileSync(join(ROT, 'app', 'data', fil), 'utf8')).dagar; } catch { return {}; }
}

/** Timpriser senaste 35 dygnen: förberäknad fil först, resten hämtas. */
async function historikMedFil(idag) {
  const fil = lasJson(`priser_${inst.elomrade}.json`);
  const fran = K.laggTillDagar(idag, -35), till = K.laggTillDagar(idag, -1);
  const ut = {};
  for (let d = fran; d <= till; d = K.laggTillDagar(d, 1)) if (fil[d]) ut[d] = fil[d];
  const hamtat = await timprisHistorik(fran, till, inst.elomrade, idag, { basUrl: 'http://127.0.0.1:9/', maxHamtningar: 40 }).catch(() => ({}));
  return { ...hamtat, ...ut };
}

export async function byggNotiser(idag, { kallor = {} } = {}) {
  const imorgon = K.laggTillDagar(idag, 1);
  const hamtaPris = kallor.priserDygn ?? priserDygn;
  const [pIdag, pImorgon] = await Promise.all([hamtaPris(idag, inst.elomrade, idag), hamtaPris(imorgon, inst.elomrade, idag)]);
  if (!pImorgon) return { notiser: [], orsak: 'Morgondagens priser är inte publicerade än.' };
  const tim = kallor.timpris ?? await historikMedFil(idag);
  tim[idag] = K.timpriser(pIdag);
  tim[imorgon] = K.timpriser(pImorgon);
  const spot30 = [];
  for (let d = 1; d <= 30; d++) spot30.push(...(tim[K.laggTillDagar(idag, -d)] ?? []).filter(Number.isFinite));
  const ref = K.referens(spot30, inst);
  const vader = kallor.vader ?? await vaderprognos(inst.plats).catch(() => ({ hem: {}, modell: {} }));
  const temp = kallor.temp ?? { ...lasJson('temp_jonkoping.json'), ...(await tempHistorik().catch(() => ({}))) };
  const tempFor = (d) => (Number.isFinite(temp[d]) ? temp[d] : vader.hem[d]?.temp ?? 5);

  const notiser = [];
  // 1. Morgondagens dyra perioder
  const berikade = K.berika(pImorgon, ref, inst);
  const kwhTim = { [imorgon]: K.dygnskostnad(imorgon, tim[imorgon], tempFor(imorgon), inst).kwhTim };
  const perioder = K.dyraPerioder(berikade);
  const dygn = K.dygnsvarningar(perioder, kwhTim, ref, inst).find((d) => d.datum === imorgon);
  if (dygn?.varna) {
    const varst = dygn.niva;
    const tider = dygn.perioder.map((p) => `${p.franTxt}–${p.tillTxt}`).join(' och ');
    const max = Math.max(...dygn.perioder.map((p) => p.max));
    const extra = dygn.extra;
    notiser.push({
      titel: `${K.NIVA_EL[varst]} i morgon ${tider}`,
      text: `Upp till ${K.krKwh(max)} (normalt ${K.krKwh(ref.totalMedian)}). Ditt hus kostar då ungefär ${K.kr(extra)} mer än vid normalpris.${exempel(dygn, berikade, idag)} ${K.RAD[varst]}`,
      prioritet: varst === 'mycket-dyrt' ? 4 : 3,
      taggar: varst === 'mycket-dyrt' ? 'rotating_light' : 'warning',
    });
  }
  // 2. Förvarning om ett dyrt dygn längre fram
  let modell = kallor.modell;
  if (!modell) modell = JSON.parse(readFileSync(join(ROT, 'app', 'modell', 'prismodell.json'), 'utf8'));
  const dygnspris = Object.fromEntries(Object.entries(tim).map(([d, v]) => [d, K.medel(v)]).filter(([, v]) => Number.isFinite(v)));
  const prognos = prisprognos(modell, dygnspris, vader.modell, imorgon, idag);
  const mal = prognos.find((p) => K.dagarMellan(idag, p.datum) === FORVARNING_DYGN);
  if (mal?.dyr) {
    const tot = (s) => (s + inst.paslagOre / 100) * K.MOMS + inst.energiskatt + inst.overforing.sakring;
    const k = K.dygnskostnad(mal.datum, new Array(24).fill(mal.spot), tempFor(mal.datum), inst);
    const n = K.dygnskostnad(mal.datum, new Array(24).fill(ref.spotMedian), tempFor(mal.datum), inst);
    notiser.push({
      titel: `Förvarning: troligen dyr el ${K.dagnamn(mal.datum, idag)}`,
      text: `Uppskattning: dygnsmedel cirka ${K.krKwh(tot(mal.spot))} (spann ${K.tal(tot(mal.spotLag), 2)}–${K.tal(tot(mal.spotHog), 2)}), normalt ${K.krKwh(ref.totalMedian)}.` +
        `${mal.orsak.length ? ` Skäl: ${mal.orsak.join(', ')}.` : ''} Kan kosta huset ungefär ${K.kr(Math.max(0, k.kr - n.kr))} extra. Tvätta och kör det som kan flyttas dagarna före. Exakta priser kommer kl 13 dagen innan.`,
      prioritet: 3,
      taggar: 'crystal_ball',
    });
  }
  return { notiser, ref, perioder, prognos };
}

async function skicka(n) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) { console.log(`[torrkörning] ${n.titel}\n${n.text}\n`); return; }
  const server = process.env.NTFY_SERVER || 'https://ntfy.sh';
  // JSON-publicering klarar å, ä och ö (HTTP-huvuden gör det inte).
  const kropp = { topic, title: n.titel, message: n.text, priority: n.prioritet, tags: [n.taggar] };
  if (process.env.APP_URL) kropp.click = process.env.APP_URL;
  const r = await fetch(server, { method: 'POST', body: JSON.stringify(kropp), headers: { 'Content-Type': 'application/json' } });
  if (!r.ok) throw new Error(`ntfy svarade ${r.status}`);
  console.log(`Skickad: ${n.titel}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--datum');
  const idag = i > 0 ? process.argv[i + 1] : K.dagensDatum();
  // GitHub Actions kör två gånger (för sommar- och vintertid); bara körningen
  // mellan 13:15 och 14:35 svensk tid skickar, så att notisen kommer en gång.
  const { timme, minut } = K.klockslagNu();
  const min = timme * 60 + minut;
  if (process.argv.includes('--schemalagd') && (min < 13 * 60 + 15 || min >= 14 * 60 + 35)) {
    console.log(`Utanför tidsfönstret (${timme}:${String(minut).padStart(2, '0')} svensk tid) – skickar inget.`);
    process.exit(0);
  }
  const { notiser, orsak, ref } = await byggNotiser(idag);
  if (orsak) { console.log(orsak); process.exitCode = 2; }
  else if (!notiser.length) console.log(`Inga varningar (normalt ${K.krKwh(ref.totalMedian)}).`);
  for (const n of notiser) await skicka(n);
}
