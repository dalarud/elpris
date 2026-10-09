// Uppskattning av dygnsmedelpriset 2–5 dygn framåt utifrån senast kända priser
// och SMHI:s väderprognos. Samma modell som analys/prismodell.py tränar; se
// analys/resultat_prismodell.md för hur träffsäker den var på osedda data.

import { laggTillDagar, dagarMellan, medel, median } from './kalkyl.js';

export const MAX_DYGN_FRAM = 5;   // längre fram var modellen inte bättre än att gissa

/**
 * modell:   innehållet i app/modell/prismodell.json
 * dygnspris: { 'YYYY-MM-DD': medelspot } för kända dygn (minst 30 bakåt)
 * vader:     { 'YYYY-MM-DD': { temp, vind } } – medel över orterna i modellen
 * senast:    senaste dygn med kända priser (i morgon efter kl 13, annars i dag)
 * idag:      dagens datum
 */
export function prisprognos(modell, dygnspris, vader, senast, idag) {
  const C = modell.C;
  const hdd = (t) => Math.max(0, modell.HDD_BAS - t);
  const L1 = dygnspris[senast];
  const sju = [], trettio = [];
  // 31 dygn (senast och 30 bakåt), samma fönster som analys/prismodell.py utvärderades med.
  for (let d = 0; d <= 30; d++) {
    const p = dygnspris[laggTillDagar(senast, -d)];
    if (Number.isFinite(p)) { if (d < 7) sju.push(p); trettio.push(p); }
  }
  if (!Number.isFinite(L1) || sju.length < 5 || !vader[senast]) return [];
  const L7 = medel(sju);
  const m30 = median(trettio);
  const utfardad = laggTillDagar(senast, -1);   // modellen räknar horisont från dagen före senast kända dygn
  const ut = [];
  for (let fram = 1; fram <= MAX_DYGN_FRAM + 1; fram++) {
    const mal = laggTillDagar(senast, fram);
    const h = dagarMellan(utfardad, mal);
    // Både avståndet från i dag och modellens horisont får vara högst 5 dygn
    // (före kl 13 är horisonten ett dygn längre än avståndet från i dag).
    if (dagarMellan(idag, mal) > MAX_DYGN_FRAM || h > MAX_DYGN_FRAM) break;
    const m = modell.horisonter[String(h)];
    const v = vader[mal];
    if (!m || !v) continue;
    const helg = (d) => { const w = (new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7; return w >= 5 ? 1 : 0; };
    const x = [1, Math.log(L7 + C) - Math.log(L1 + C), hdd(v.temp) - hdd(vader[senast].temp), v.vind - vader[senast].vind, helg(mal) - helg(senast)];
    const yhat = x.reduce((a, xi, i) => a + xi * m.koef[i], 0);
    const bas = Math.log(L1 + C);
    const p = Math.exp(bas + yhat) - C;
    const dyr = p >= 1.5 * m30 && p >= 0.5;
    ut.push({
      datum: mal, horisont: h, spot: p,
      spotLag: Math.exp(bas + yhat + m.res_p10) - C,
      spotHog: Math.exp(bas + yhat + m.res_p90) - C,
      temp: v.temp, vind: v.vind, median30: m30,
      dyr,
      // Skäl anges bara när prognosen pekar uppåt; ett dyrt dygn under dagens nivå
      // är dyrt för att priset redan ligger högt (hogtLage).
      orsak: p >= L1 ? orsak(v, vader[senast], helg(mal), helg(senast), true) : (dyr ? [] : orsak(v, vader[senast], helg(mal), helg(senast), false)),
      hogtLage: dyr && p < L1,
    });
  }
  return ut;
}

/** Vädret/kalendern som drar priset åt det håll prognosen pekar. */
function orsak(v, senast, helgMal, helgSenast, upp) {
  const delar = [];
  if (upp) {
    if (v.temp < senast.temp - 2) delar.push('kallare');
    if (v.vind < senast.vind - 1.5) delar.push('svagare vind');
    if (!helgMal && helgSenast) delar.push('vardag');
  } else {
    if (v.temp > senast.temp + 2) delar.push('mildare');
    if (v.vind > senast.vind + 1.5) delar.push('mer vind');
    if (helgMal && !helgSenast) delar.push('helg');
  }
  return delar;
}

const DATUM_SV = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false });
/** Lokal (svensk) datum-timme-nyckel 'YYYY-MM-DD HH' för en tidpunkt i ms. */
function timnyckel(ms) {
  const d = Object.fromEntries(DATUM_SV.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${d.year}-${d.month}-${d.day} ${d.hour === '24' ? '00' : d.hour}`;
}

/**
 * SMHI punktprognos (snow1g) -> värden per hel timme { 'YYYY-MM-DD HH': { temp, vind } }.
 * Prognosen har timsteg de första dygnen och sedan 3–12 timmar mellan stegen;
 * mellanliggande timmar interpoleras linjärt så att dygnsmedlet blir tidsvägt.
 */
export function smhiTimmar(smhi) {
  const pkt = (smhi?.timeSeries ?? [])
    .map((ts) => ({ t: Date.parse(ts.time), temp: ts.data?.air_temperature, vind: ts.data?.wind_speed }))
    .filter((p) => Number.isFinite(p.t)).sort((a, b) => a.t - b.t);
  const ut = {};
  for (let i = 0; i < pkt.length; i++) {
    const a = pkt[i], b = pkt[i + 1];
    const steg = b ? Math.round((b.t - a.t) / 3600e3) : 1;
    for (let k = 0; k < Math.max(1, steg); k++) {
      const f = b ? k / steg : 0;
      const varde = (x, y) => (Number.isFinite(x) && Number.isFinite(y) ? x + (y - x) * f : (k === 0 && Number.isFinite(x) ? x : undefined));
      ut[timnyckel(a.t + k * 3600e3)] = { temp: varde(a.temp, b?.temp), vind: varde(a.vind, b?.vind) };
    }
  }
  return ut;
}

/** SMHI metobs (timvärden, period latest-day) -> { 'YYYY-MM-DD HH': varde } för fältet `falt`. */
export function obsTimmar(metobs, falt) {
  const ut = {};
  for (const v of metobs?.value ?? []) {
    const x = Number(v.value);
    if (Number.isFinite(x)) ut[timnyckel(v.date)] = { [falt]: x };
  }
  return ut;
}

/** Slår ihop timvärden: uppmätta (passerade timmar) går före prognosen. */
export function slaIhopTimmar(prognos, ...uppmatt) {
  const ut = {};
  for (const [k, v] of Object.entries(prognos ?? {})) ut[k] = { ...v };
  for (const obs of uppmatt) for (const [k, v] of Object.entries(obs ?? {})) ut[k] = { ...(ut[k] ?? {}), ...v };
  return ut;
}

/**
 * Fyller saknade timmar i ett dygn med närmaste kända timme samma dygn. Används för
 * dagens dygn när en stations mätningar för de passerade timmarna saknas, så att
 * ett enda bortfall inte tar bort hela prisuppskattningen.
 */
export function fyllLuckor(timmar, datum) {
  const ut = { ...timmar };
  for (const falt of ['temp', 'vind']) {
    const kanda = [];
    for (let h = 0; h < 24; h++) {
      const v = ut[`${datum} ${String(h).padStart(2, '0')}`]?.[falt];
      if (Number.isFinite(v)) kanda.push([h, v]);
    }
    if (!kanda.length) continue;
    for (let h = 0; h < 24; h++) {
      const k = `${datum} ${String(h).padStart(2, '0')}`;
      if (Number.isFinite(ut[k]?.[falt])) continue;
      const narmast = kanda.reduce((a, b) => (Math.abs(b[0] - h) < Math.abs(a[0] - h) ? b : a));
      ut[k] = { ...(ut[k] ?? {}), [falt]: narmast[1] };
    }
  }
  return ut;
}

/** Timvärden -> dygnsmedel { datum: { temp, vind, timmarTemp, timmarVind } }. */
export function dygnFranTimmar(timmar) {
  const per = {};
  for (const [k, v] of Object.entries(timmar ?? {})) {
    const d = (per[k.slice(0, 10)] ??= { temp: [], vind: [] });
    if (Number.isFinite(v.temp)) d.temp.push(v.temp);
    if (Number.isFinite(v.vind)) d.vind.push(v.vind);
  }
  const ut = {};
  for (const [d, v] of Object.entries(per)) ut[d] = { temp: medel(v.temp), vind: medel(v.vind), timmarTemp: v.temp.length, timmarVind: v.vind.length };
  return ut;
}

/** Bakåtkompatibelt: SMHI-prognos direkt till dygnsmedel. */
export function smhiDygn(smhi) {
  return dygnFranTimmar(smhiTimmar(smhi));
}

export const MIN_TIMMAR = 20;   // ett dygn måste täckas nästan helt för att räknas

/**
 * Medel över flera orter: { datum: { temp, vind } } från temp- och vindorter.
 * Ett dygn tas bara med om alla orter täcker det nästan helt (MIN_TIMMAR), annars
 * blir medlet skevt (t.ex. dagens dygn när bara kvällens prognos finns kvar).
 * Dygn utan timräkning (äldre format/testdata) godtas som de är.
 */
export function kombineraVader(tempOrter, vindOrter) {
  const datum = new Set([...tempOrter.flatMap((o) => Object.keys(o)), ...vindOrter.flatMap((o) => Object.keys(o))]);
  const tackt = (v, falt) => v && Number.isFinite(v[falt]) && (v[falt === 'temp' ? 'timmarTemp' : 'timmarVind'] ?? 24) >= MIN_TIMMAR;
  const ut = {};
  for (const d of datum) {
    if (!tempOrter.every((o) => tackt(o[d], 'temp')) || !vindOrter.every((o) => tackt(o[d], 'vind'))) continue;
    ut[d] = { temp: medel(tempOrter.map((o) => o[d].temp)), vind: medel(vindOrter.map((o) => o[d].vind)) };
  }
  return ut;
}

// Orter som modellen tränades på (SMHI-stationernas positioner).
export const PROGNOSORTER = {
  temp: [
    { namn: 'Jönköping', lat: 57.7514, lon: 14.0733, station: 74460 },
    { namn: 'Stockholm', lat: 59.3417, lon: 18.0549, station: 98230 },
    { namn: 'Göteborg', lat: 57.7156, lon: 11.9924, station: 71420 },
    { namn: 'Malmö', lat: 55.5715, lon: 13.0708, station: 52350 },
  ],
  vind: [
    { namn: 'Falsterbo', lat: 55.3837, lon: 12.8166, station: 52240 },
    { namn: 'Väderöarna', lat: 58.576, lon: 11.0661, station: 81350 },
    { namn: 'Hoburg', lat: 56.9209, lon: 18.1506, station: 68560 },
    { namn: 'Sundsvall', lat: 62.5246, lon: 17.441, station: 127310 },
    { namn: 'Östersund', lat: 63.1981, lon: 14.4869, station: 134110 },
  ],
};
