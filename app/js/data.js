// Hämtning av öppna data. Fungerar i både webbläsare och Node (global fetch).
//   Spotpriser:   elprisetjustnu.se (källa ENTSO-E), kvartspriser sedan 2025-10-01
//   Väderprognos: SMHI Öppna data, punktprognos snow1g (cirka 10 dygn)
//   Uppmätt temp: SMHI Öppna data, metobs, station Jönköping-Axamo (74460)

import { tolkaPriser, laggTillDagar, medel, dagensDatum } from './kalkyl.js';
import { smhiTimmar, obsTimmar, slaIhopTimmar, fyllLuckor, dygnFranTimmar, kombineraVader, PROGNOSORTER } from './prognos.js';

const PRIS_URL = (datum, zon) => `https://www.elprisetjustnu.se/api/v1/prices/${datum.slice(0, 4)}/${datum.slice(5, 7)}-${datum.slice(8, 10)}_${zon}.json`;
const SMHI_PROGNOS = (lat, lon) => `https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/${lon.toFixed(4)}/lat/${lat.toFixed(4)}/data.json`;
const SMHI_OBS = (station) => `https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/2/station/${station}/period/latest-months/data.json`;
// Timvärden senaste dygnet: parameter 1 = lufttemperatur, 4 = vindhastighet.
const SMHI_OBS_TIM = (param, station) => `https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/${param}/station/${station}/period/latest-day/data.json`;

// Enkel nyckel-värde-cache: localStorage i webbläsaren, minne i Node.
const minne = new Map();
// Redan åtkomsten kan kasta (SecurityError) när webbläsaren blockerar webbplatsdata.
const lagring = (() => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } })();
function lasCache(nyckel) {
  try { const v = lagring ? lagring.getItem(nyckel) : minne.get(nyckel); return v ? JSON.parse(v) : null; } catch { return null; }
}
function skrivCache(nyckel, varde) {
  try { const s = JSON.stringify(varde); lagring ? lagring.setItem(nyckel, s) : minne.set(nyckel, s); } catch { /* full eller blockerad lagring: hoppa över */ }
}

async function hamtaJson(url) {
  const r = await fetch(url);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${r.status} från ${new URL(url).host}`);
  return r.json();
}

/** Priser för ett dygn som intervall, eller null om de inte publicerats än. */
export async function priserDygn(datum, zon, idag) {
  // Dagens och morgondagens fil kan saknas (före kl 13) – undvik att ett gammalt
  // 404-svar ligger kvar i webbläsarens cache genom en parameter som byts var 10:e minut.
  const url = PRIS_URL(datum, zon) + (datum >= idag ? `?v=${Math.floor(Date.now() / 6e5)}` : '');
  const rader = await hamtaJson(url);
  if (!rader || !rader.length) return null;
  return tolkaPriser(rader);
}

/**
 * Timpriser för många dygn: { datum: [24 spot] }. Använder först redan kända dygn
 * (`forladdat`, t.ex. lästa från fil i Node) eller den förberäknade filen
 * data/priser_<zon>.json, och hämtar resten direkt.
 */
export async function timprisHistorik(fran, till, zon, idag, { basUrl = '', maxHamtningar = 70, forladdat = null } = {}) {
  const ut = {};
  if (forladdat) Object.assign(ut, forladdat);
  else {
    try {
      const r = await fetch(`${basUrl}data/priser_${zon}.json`);
      if (r.ok) Object.assign(ut, (await r.json()).dagar);
    } catch { /* finns inte (t.ex. lokalt): hämta direkt */ }
  }
  const saknas = [];
  for (let d = fran; d <= till; d = laggTillDagar(d, 1)) {
    if (ut[d]) continue;
    const c = d < idag ? lasCache(`tim:${zon}:${d}`) : null;
    if (c) ut[d] = c; else saknas.push(d);
  }
  // Hämta nyaste först; äldre dygn utan förberäknad fil hoppas över om de är för många.
  saknas.reverse();
  const valda = saknas.slice(0, maxHamtningar);
  const svar = await parallellt(valda, 6, (d) => priserDygn(d, zon, idag).catch(() => null));
  valda.forEach((d, i) => {
    const iv = svar[i];
    if (!iv) return;
    const tim = new Array(24).fill(null).map(() => []);
    for (const x of iv) tim[x.timme].push(x.spot);
    ut[d] = tim.map((v) => (v.length ? Math.round(medel(v) * 1e5) / 1e5 : null));
    if (d < idag) skrivCache(`tim:${zon}:${d}`, ut[d]);
  });
  return ut;
}

async function parallellt(lista, n, f) {
  const ut = new Array(lista.length);
  let i = 0;
  await Promise.all(new Array(Math.min(n, lista.length)).fill(0).map(async () => {
    while (i < lista.length) { const j = i++; ut[j] = await f(lista[j]); }
  }));
  return ut;
}

/**
 * Väder per dygn för hemorten och för prismodellens orter. Prognosen (SMHI snow1g)
 * börjar vid nästa hela timme, så dagens passerade timmar fylls i med SMHI:s
 * uppmätta timvärden. Dygn som inte täcks nästan helt tas inte med i modellens
 * väder (se kombineraVader).
 * Returnerar { hem: { datum: { temp, timmarTemp, ... } }, modell: { datum: { temp, vind } } }.
 */
export async function vaderprognos(plats, { hemStation = 74460 } = {}) {
  const prognos = async (o) => {
    const nyckel = `smhi:${o.lat.toFixed(2)}:${o.lon.toFixed(2)}`;
    const c = lasCache(nyckel);
    const harData = (x) => x && Object.keys(x).length > 0;
    if (c && Date.now() - c.t < 3 * 3600e3 && harData(c.timmar)) return c.timmar;
    const timmar = smhiTimmar(await hamtaJson(SMHI_PROGNOS(o.lat, o.lon)));
    if (harData(timmar)) skrivCache(nyckel, { t: Date.now(), timmar });   // cacha aldrig ett tomt/404-svar
    return timmar;
  };
  const obs = async (param, station, falt) => {
    const nyckel = `smhiobs:${param}:${station}`;
    const c = lasCache(nyckel);
    if (c && Date.now() - c.t < 3600e3 && c.timmar && Object.keys(c.timmar).length) return c.timmar;
    const timmar = obsTimmar(await hamtaJson(SMHI_OBS_TIM(param, station)), falt);
    if (Object.keys(timmar).length) skrivCache(nyckel, { t: Date.now(), timmar });
    return timmar;
  };
  const tyst = (p) => p.catch(() => ({}));
  const [hemP, hemO, tempP, tempO, vindP, vindO] = await Promise.all([
    tyst(prognos(plats)),
    tyst(obs(1, hemStation, 'temp')),
    Promise.all(PROGNOSORTER.temp.map((o) => tyst(prognos(o)))),
    Promise.all(PROGNOSORTER.temp.map((o) => tyst(obs(1, o.station, 'temp')))),
    Promise.all(PROGNOSORTER.vind.map((o) => tyst(prognos(o)))),
    Promise.all(PROGNOSORTER.vind.map((o) => tyst(obs(4, o.station, 'vind')))),
  ]);
  // Mätningar för dagens passerade timmar + prognos; saknas en stations mätningar
  // fylls dagens tidiga timmar med närmaste kända värde (se fyllLuckor).
  const idag = dagensDatum();
  const dygn = (p, o) => dygnFranTimmar(fyllLuckor(slaIhopTimmar(p, o), idag));
  const temp = tempP.map((p, i) => dygn(p, tempO[i]));
  const vind = vindP.map((p, i) => dygn(p, vindO[i]));
  return { hem: dygn(hemP, hemO), modell: kombineraVader(temp, vind), prognosHamtad: [...tempP, ...vindP].every((p) => Object.keys(p).length > 0) };
}

/** Uppmätt dygnsmedeltemperatur (senaste ~4 månaderna) + förberäknad historik. */
export async function tempHistorik({ basUrl = '', station = 74460 } = {}) {
  const ut = {};
  try {
    const r = await fetch(`${basUrl}data/temp_jonkoping.json`);
    if (r.ok) Object.assign(ut, (await r.json()).dagar);
  } catch { /* saknas lokalt */ }
  try {
    const nyckel = `smhiobs:${station}`;
    let c = lasCache(nyckel);
    if (!c || Date.now() - c.t > 6 * 3600e3) {
      const d = await hamtaJson(SMHI_OBS(station));
      c = { t: Date.now(), v: Object.fromEntries((d?.value ?? []).map((x) => [x.ref, Number(x.value)])) };
      skrivCache(nyckel, c);
    }
    Object.assign(ut, c.v);
  } catch { /* SMHI nere: använd det vi har */ }
  return ut;
}

export function rensaCache() {
  if (!lagring) { minne.clear(); return; }
  for (const k of Object.keys(lagring)) if (/^(tim|smhi|smhiobs):/.test(k)) lagring.removeItem(k);
}
