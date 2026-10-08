// Bygger de förberäknade datafilerna som webbappen läser:
//   app/data/priser_SE3.json      timpriser (spot, kr/kWh exkl. moms) per dygn, senaste ~420 dygnen
//   app/data/temp_jonkoping.json  uppmätt dygnsmedeltemperatur, Jönköping-Axamo (SMHI 74460)
// Utgår från de incheckade filerna i data/ och hämtar det som saknas fram till i dag.
//
// Kör: node tools/bygg_data.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dagensDatum, laggTillDagar, lokalTid, medel } from '../app/js/kalkyl.js';
import { priserDygn } from '../app/js/data.js';

const ROT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ZON = 'SE3';
const DYGN = 420;

function lasPrisCsv() {
  const rader = readFileSync(join(ROT, 'data', `spotpris_${ZON}.csv`), 'utf8').trim().split('\n').slice(1);
  const per = {};
  for (const r of rader) {
    const [start, , sek] = r.split(',');
    const t = lokalTid(start);
    ((per[t.datum] ??= new Array(24).fill(null).map(() => []))[t.timme]).push(Number(sek));
  }
  return per;
}

async function main() {
  const idag = dagensDatum();
  const fran = laggTillDagar(idag, -DYGN);
  const csv = lasPrisCsv();
  const dagar = {};
  for (let d = fran; d <= laggTillDagar(idag, 1); d = laggTillDagar(d, 1)) {
    if (csv[d]) { dagar[d] = csv[d].map((v) => (v.length ? Math.round(medel(v) * 1e5) / 1e5 : null)); continue; }
    const iv = await priserDygn(d, ZON, idag).catch(() => null);
    if (!iv) continue;
    const tim = new Array(24).fill(null).map(() => []);
    for (const x of iv) tim[x.timme].push(x.spot);
    dagar[d] = tim.map((v) => (v.length ? Math.round(medel(v) * 1e5) / 1e5 : null));
  }
  // Dagens och morgondagens priser läser appen alltid direkt, så de tas inte med.
  delete dagar[idag];
  delete dagar[laggTillDagar(idag, 1)];
  mkdirSync(join(ROT, 'app', 'data'), { recursive: true });
  writeFileSync(join(ROT, 'app', 'data', `priser_${ZON}.json`),
    JSON.stringify({ zon: ZON, enhet: 'kr/kWh exkl. moms, timmedel', kalla: 'elprisetjustnu.se (ENTSO-E)', skapad: new Date().toISOString(), dagar }));

  // Temperatur: incheckad historik + SMHI senaste månaderna
  const temp = {};
  const v = readFileSync(join(ROT, 'data', 'vader_daglig.csv'), 'utf8').trim().split('\n');
  const kol = v[0].split(',').indexOf('temp_jonkoping');
  for (const rad of v.slice(1)) {
    const f = rad.split(',');
    if (f[kol] !== '') temp[f[0]] = Number(f[kol]);
  }
  try {
    const r = await fetch('https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/2/station/74460/period/latest-months/data.json');
    for (const x of (await r.json()).value ?? []) temp[x.ref] = Number(x.value);
  } catch (e) { console.warn('SMHI ej nåbart:', e.message); }
  const tempUt = Object.fromEntries(Object.entries(temp).filter(([d]) => d >= laggTillDagar(idag, -4 * 365)).sort());
  writeFileSync(join(ROT, 'app', 'data', 'temp_jonkoping.json'),
    JSON.stringify({ station: 'Jönköping-Axamo (SMHI 74460)', enhet: '°C dygnsmedel', skapad: new Date().toISOString(), dagar: tempUt }));
  console.log(`Priser: ${Object.keys(dagar).length} dygn. Temperatur: ${Object.keys(tempUt).length} dygn.`);
}

main();
