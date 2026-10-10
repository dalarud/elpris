// Skickar varningar till mobilen via ntfy (https://ntfy.sh). Körs av GitHub
// Actions strax efter kl 13 när morgondagens priser publicerats.
//
// Regler (för att inte tjata):
//   1. Känt pris: morgondagens dagsplan (app/js/plan.js) säger "dra ner", dvs. de
//      dyra perioderna kostar huset minst varningKr över normalpris
//      -> en notis med tider, pris och de tre åtgärder som är värda mest.
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
import * as P from '../app/js/plan.js';
import { prisprognos } from '../app/js/prognos.js';
import { priserDygn, timprisHistorik, vaderprognos, tempHistorik } from '../app/js/data.js';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROT = join(dirname(fileURLToPath(import.meta.url)), '..');
const inst = { ...K.STANDARD };
const FORVARNING_DYGN = 3;
const vanta = (ms) => new Promise((r) => setTimeout(r, ms));

/** Dygnsdata (`.dagar`) ur en av appens förberäknade filer i app/data/. */
function lasDagar(fil) {
  try { return JSON.parse(readFileSync(join(ROT, 'app', 'data', fil), 'utf8')).dagar ?? {}; } catch { return {}; }
}

/**
 * Uppmätt temperatur i Jönköping: filen (fyra år bakåt, behövs för normaltemperaturen)
 * plus SMHI:s senaste månader. Samma källor som appen, så att dagsplanen blir densamma.
 */
export async function lasTemp() {
  return { ...lasDagar('temp_jonkoping.json'), ...(await tempHistorik().catch(() => ({}))) };
}

/** Timpriser senaste 35 dygnen: förberäknad fil först, bara det som saknas hämtas. */
async function historikMedFil(idag) {
  const fran = K.laggTillDagar(idag, -35), till = K.laggTillDagar(idag, -1);
  return timprisHistorik(fran, till, inst.elomrade, idag, { forladdat: lasDagar(`priser_${inst.elomrade}.json`), maxHamtningar: 40 });
}

/** När notisen räknas: nu, eller kl 13:40 det simulerade dygnet om nu ligger utanför dess priser. */
function beslutstid(pIdag, nuMs = Date.now()) {
  const sista = pIdag[pIdag.length - 1];
  if (nuMs >= pIdag[0].t0 && nuMs < sista.t0 + sista.langd * 60e3) return nuMs;
  const kl1330 = pIdag.find((i) => i.timme === 13 && i.minut === 30) ?? pIdag[0];
  return kl1330.t0 + 10 * 60e3;
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
  const temp = kallor.temp ?? await lasTemp();
  const tempFor = (d) => K.valjTemp(d, temp, vader.hem);

  const notiser = [];
  // 1. Morgondagens dagsplan – samma beräkning som appen. Notis bara på dra ner-dygn.
  const plan = P.dagsplan(imorgon, pImorgon, tim, temp, inst);
  if (plan.besked === 'draner') {
    const max = Math.max(...plan.dyra.map((p) => p.max));
    const allaKanda = [...K.berika(pIdag, plan.ref, inst), ...plan.kvartar];
    const delar = { [imorgon]: plan.delar };
    const atgarder = K.dranerAtgarder(plan.dyra, allaKanda, delar, plan.ref, idag, beslutstid(pIdag, kallor.nuMs)).slice(0, 3);
    const gor = atgarder.length
      ? ` Gör så här: ${atgarder.map((x) => `${x.text.toLowerCase()} ${x.id === 'varme' ? x.detalj.split(' – ')[0] : `– ${x.nar}`} (≈ ${K.kr(x.sparar)})`).join('; ')}.`
      : '';
    notiser.push({
      titel: `Dra ner i morgon ${P.tiderText(plan.dyra)}`,
      text: `Upp till ${K.krKwh(max)} (normalt ${K.krKwh(plan.ref.totalMedian)}). Huset ≈ ${K.kr(plan.extra)} över normalt under de dyra timmarna (beräknat).${gor}`,
      prioritet: plan.extra >= 2 * inst.varningKr ? 4 : 3,
      taggar: plan.extra >= 2 * inst.varningKr ? 'rotating_light' : 'warning',
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
  return { notiser, ref, plan, prognos };
}

async function skicka(n) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) { console.log(`[torrkörning] ${n.titel}\n${n.text}\n`); return; }
  const server = process.env.NTFY_SERVER || 'https://ntfy.sh';
  // JSON-publicering klarar å, ä och ö (HTTP-huvuden gör det inte).
  const kropp = { topic, title: n.titel, message: n.text, priority: n.prioritet, tags: [n.taggar] };
  if (process.env.APP_URL) kropp.click = process.env.APP_URL;
  // Tre försök vid nätverksfel, 429 och 5xx (30 s, 2 min) innan notisen ges upp.
  const pauser = [30e3, 120e3];
  for (let forsok = 0; ; forsok++) {
    let fel;
    try {
      const r = await fetch(server, { method: 'POST', body: JSON.stringify(kropp), headers: { 'Content-Type': 'application/json' } });
      if (r.ok) { console.log(`Skickad: ${n.titel}`); return; }
      fel = new Error(`ntfy svarade ${r.status}`);
      if (r.status !== 429 && r.status < 500) throw fel;
    } catch (e) { fel = e; if (/svarade 4\d\d/.test(e.message) && !/429/.test(e.message)) throw e; }
    if (forsok >= pauser.length) throw fel;
    console.log(`${fel.message} – försöker igen om ${pauser[forsok] / 1000} s.`);
    await vanta(pauser[forsok]);
  }
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
  const giltigt = /^\d{4}-\d{2}-\d{2}$/.test(d ?? '') && !Number.isNaN(Date.parse(`${d}T12:00:00Z`)) && K.laggTillDagar(d, 0) === d;
  if (!giltigt) {
    console.error('Ange datum som --datum ÅÅÅÅ-MM-DD');
    process.exit(64);
  }
  return d;
}


/** Körs filen direkt (inte importerad)? Jämför verkliga sökvägar (symlänkar, mellanslag). */
function arHuvudmodul() {
  try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}

/** byggNotiser, men ett tillfälligt nätverks- eller serverfel blir ett nytt försök i stället för en krasch. */
async function forsokBygg(idag) {
  try { return await byggNotiser(idag); } catch (e) { return { notiser: [], orsak: `Hämtningen misslyckades (${e.message}).` }; }
}

if (arHuvudmodul()) {
  const idag = lasDatum(process.argv);
  const schemalagd = process.argv.includes('--schemalagd');
  const schema = process.env.SCHEMA || '';
  if (schemalagd && !arRattKorning(schema)) {
    console.log(schema
      ? `Den här körningen (${schema}) hör inte till aktuell svensk tid (${svenskOffset()}) – den andra schemalagda körningen skickar.`
      : 'Manuell körning utanför kl 13–16 svensk tid – kryssa i "Skicka även utanför tidsfönstret" för att skicka ändå.');
    process.exit(0);
  }
  // Schemalagt: vänta in sent publicerade priser (och tillfälliga fel) i upp till en timme.
  let res = await forsokBygg(idag);
  for (let forsok = 1; schemalagd && res.orsak && forsok <= 12; forsok++) {
    console.log(`${res.orsak} Försöker igen om 5 minuter (${forsok}/12).`);
    await vanta(5 * 60e3);
    res = await forsokBygg(idag);
  }
  if (res.orsak) {
    console.log(res.orsak);
    // Rött jobb bara när en schemalagd körning gett upp; en testkörning före kl 13 är inget fel.
    if (schemalagd) { console.log('::error::Morgondagens priser kunde inte hämtas inom en timme.'); process.exitCode = 1; }
  } else if (!res.notiser.length) console.log(`Inga varningar (normalt ${K.krKwh(res.ref.totalMedian)}).`);
  // Ett fel på en notis stoppar inte de andra; jobbet blir rött om någon inte gick fram.
  for (const n of res.notiser) {
    try { await skicka(n); } catch (e) {
      console.log(`::error::Notisen "${n.titel}" kunde inte skickas (${e.message}).`);
      process.exitCode = 1;
    }
  }
}
