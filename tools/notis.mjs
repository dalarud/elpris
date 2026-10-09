// Skickar varningar till mobilen via ntfy (https://ntfy.sh). Körs av GitHub
// Actions strax efter kl 13 när morgondagens priser publicerats.
//
// Regler (för att inte tjata):
//   1. Känt pris: dyra perioder i morgon som kostar huset minst varningKr extra
//      -> en notis med tider, pris och vad det kostar huset.
//   2. Förvarning: om dygnet 3 dagar fram uppskattas bli dyrt -> en notis (märkt uppskattning).
//   Annars skickas ingenting.
//
// Miljövariabler: NTFY_TOPIC (hemligt ämnesnamn; utan det skrivs notisen bara ut),
//                 NTFY_SERVER (valfri, standard https://ntfy.sh), APP_URL (länk i notisen),
//                 SCHEMA (cron-uttrycket som startade körningen, sätts av varning.yml).
// Kör lokalt:     node tools/notis.mjs [--datum 2026-01-14]   (låtsas att det är det datumet)
//                 --schemalagd: bara den schemalagda körning som hör till aktuell
//                 svensk tid (sommar/vinter) skickar, och den väntar in sena priser.

import * as K from '../app/js/kalkyl.js';
import { prisprognos } from '../app/js/prognos.js';
import { priserDygn, timprisHistorik, vaderprognos, tempHistorik } from '../app/js/data.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

/** Timpriser senaste 35 dygnen: förberäknad fil först, bara det som saknas hämtas. */
async function historikMedFil(idag) {
  const fran = K.laggTillDagar(idag, -35), till = K.laggTillDagar(idag, -1);
  return timprisHistorik(fran, till, inst.elomrade, idag, { forladdat: lasJson(`priser_${inst.elomrade}.json`), maxHamtningar: 40 });
}

export async function byggNotiser(idag, { kallor = {} } = {}) {
  const imorgon = K.laggTillDagar(idag, 1);
  const hamtaPris = kallor.priserDygn ?? priserDygn;
  const [pIdag, pImorgon] = await Promise.all([hamtaPris(idag, inst.elomrade, idag), hamtaPris(imorgon, inst.elomrade, idag)]);
  if (!pImorgon) return { notiser: [], orsak: 'Morgondagens priser är inte publicerade än.' };
  const tim = kallor.timpris ?? await historikMedFil(idag);
  tim[idag] = K.timpriser(pIdag);
  tim[imorgon] = K.timpriser(pImorgon);
  const ref = K.referens(K.posterFranTimpriser(tim, K.laggTillDagar(idag, -30), K.laggTillDagar(idag, -1)), inst);
  const vader = kallor.vader ?? await vaderprognos(inst.plats).catch(() => ({ hem: {}, modell: {} }));
  const temp = kallor.temp ?? { ...lasJson('temp_jonkoping.json'), ...(await tempHistorik().catch(() => ({}))) };
  const tempFor = (d) => K.valjTemp(d, temp, vader.hem);

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
    const tot = (s) => K.dygnsTotal(s, mal.datum, inst);
    const skal = mal.orsak.length ? ` Skäl: ${mal.orsak.join(', ')}.` : mal.hogtLage ? ' Priset ligger redan högt och väntas ligga kvar.' : '';
    const k = K.dygnskostnad(mal.datum, new Array(24).fill(mal.spot), tempFor(mal.datum), inst);
    const n = K.dygnskostnad(mal.datum, new Array(24).fill(ref.spotMedian), tempFor(mal.datum), inst);
    notiser.push({
      titel: `Förvarning: troligen dyr el ${K.dagnamn(mal.datum, idag)}`,
      text: `Uppskattning: dygnsmedel cirka ${K.krKwh(tot(mal.spot))} (spann ${K.tal(tot(mal.spotLag), 2)}–${K.tal(tot(mal.spotHog), 2)}), normalt ${K.krKwh(ref.totalMedian)}.` +
        `${skal} Kan kosta huset ungefär ${K.kr(Math.max(0, k.kr - n.kr))} extra. Tvätta och kör det som kan flyttas dagarna före. Exakta priser kommer kl 13 dagen innan.`,
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

/** 'GMT+2' på sommartid, 'GMT+1' på vintertid. */
export function svenskOffset(nu = new Date()) {
  return new Intl.DateTimeFormat('en', { timeZone: 'Europe/Stockholm', timeZoneName: 'shortOffset' })
    .formatToParts(nu).find((p) => p.type === 'timeZoneName').value;
}

/** Ska den här schemalagda körningen skicka? Avgörs av vilken cron som startade den. */
export function arRattKorning(schema, nu = new Date()) {
  // 11:40 UTC = 13:40 sommartid, 12:40 UTC = 13:40 vintertid.
  const ratt = svenskOffset(nu) === 'GMT+2' ? '40 11 * * *' : '40 12 * * *';
  if (schema) return schema === ratt;
  // Manuell körning med --schemalagd: skicka mellan 13 och 16 svensk tid.
  const { timme } = K.klockslagNu(nu);
  return timme >= 13 && timme < 16;
}

function lasDatum(argv) {
  const i = argv.findIndex((a) => a === '--datum' || a.startsWith('--datum='));
  if (i < 0) return K.dagensDatum();
  const d = argv[i].includes('=') ? argv[i].split('=')[1] : argv[i + 1];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d ?? '')) {
    console.error('Ange datum som --datum ÅÅÅÅ-MM-DD');
    process.exit(64);
  }
  return d;
}

const vanta = (ms) => new Promise((r) => setTimeout(r, ms));

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const idag = lasDatum(process.argv);
  const schemalagd = process.argv.includes('--schemalagd');
  if (schemalagd && !arRattKorning(process.env.SCHEMA)) {
    console.log(`Den här körningen (${process.env.SCHEMA ?? 'manuell'}) hör inte till aktuell svensk tid (${svenskOffset()}) – den andra körningen skickar.`);
    process.exit(0);
  }
  // Schemalagt: vänta in sent publicerade priser i upp till en timme.
  let res = await byggNotiser(idag);
  for (let forsok = 1; schemalagd && res.orsak && forsok <= 12; forsok++) {
    console.log(`${res.orsak} Försöker igen om 5 minuter (${forsok}/12).`);
    await vanta(5 * 60e3);
    res = await byggNotiser(idag);
  }
  if (res.orsak) {
    console.log(res.orsak);
    // Rött jobb bara när en schemalagd körning gett upp; en testkörning före kl 13 är inget fel.
    if (schemalagd) { console.log('::error::Morgondagens priser saknades även efter en timme.'); process.exitCode = 1; }
  } else if (!res.notiser.length) console.log(`Inga varningar (normalt ${K.krKwh(res.ref.totalMedian)}).`);
  for (const n of res.notiser) await skicka(n);
}
