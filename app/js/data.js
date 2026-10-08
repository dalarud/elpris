// Hämtning av öppna data. Fungerar i både webbläsare och Node (global fetch).
//   Spotpriser:   elprisetjustnu.se (källa ENTSO-E), kvartspriser sedan 2025-10-01
//   Väderprognos: SMHI Öppna data, punktprognos snow1g (cirka 10 dygn)
//   Uppmätt temp: SMHI Öppna data, metobs, station Jönköping-Axamo (74460)

import { tolkaPriser, laggTillDagar, medel } from './kalkyl.js';
import { smhiDygn, kombineraVader, PROGNOSORTER } from './prognos.js';

const PRIS_URL = (datum, zon) => `https://www.elprisetjustnu.se/api/v1/prices/${datum.slice(0, 4)}/${datum.slice(5, 7)}-${datum.slice(8, 10)}_${zon}.json`;
const SMHI_PROGNOS = (lat, lon) => `https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/${lon.toFixed(4)}/lat/${lat.toFixed(4)}/data.json`;
const SMHI_OBS = (station) => `https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/2/station/${station}/period/latest-months/data.json`;

// Enkel nyckel-värde-cache: localStorage i webbläsaren, minne i Node.
const minne = new Map();
const lagring = typeof localStorage !== 'undefined' ? localStorage : null;
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
 * Timpriser för många dygn: { datum: [24 spot] }. Använder först den förberäknade
 * filen data/priser.json (om den finns) och hämtar resten direkt.
 */
export async function timprisHistorik(fran, till, zon, idag, { basUrl = '', maxHamtningar = 70 } = {}) {
  const ut = {};
  try {
    const r = await fetch(`${basUrl}data/priser_${zon}.json`);
    if (r.ok) Object.assign(ut, (await r.json()).dagar);
  } catch { /* finns inte (t.ex. lokalt): hämta direkt */ }
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

/** Väderprognos för hemorten och för prismodellens orter. */
export async function vaderprognos(plats) {
  const hamta = async (o) => {
    const nyckel = `smhi:${o.lat.toFixed(2)}:${o.lon.toFixed(2)}`;
    const c = lasCache(nyckel);
    if (c && Date.now() - c.t < 3 * 3600e3) return c.v;
    const v = smhiDygn(await hamtaJson(SMHI_PROGNOS(o.lat, o.lon)));
    skrivCache(nyckel, { t: Date.now(), v });
    return v;
  };
  const [hem, ...ovriga] = await Promise.all([plats, ...PROGNOSORTER.temp, ...PROGNOSORTER.vind].map((o) => hamta(o).catch(() => ({}))));
  const temp = ovriga.slice(0, PROGNOSORTER.temp.length);
  const vind = ovriga.slice(PROGNOSORTER.temp.length);
  return { hem, modell: kombineraVader(temp, vind) };
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
