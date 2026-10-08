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
  for (let d = 0; d < 30; d++) {
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
    if (dagarMellan(idag, mal) > MAX_DYGN_FRAM) break;
    const h = dagarMellan(utfardad, mal);
    const m = modell.horisonter[String(h)];
    const v = vader[mal];
    if (!m || !v) continue;
    const helg = (d) => { const w = (new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7; return w >= 5 ? 1 : 0; };
    const x = [1, Math.log(L7 + C) - Math.log(L1 + C), hdd(v.temp) - hdd(vader[senast].temp), v.vind - vader[senast].vind, helg(mal) - helg(senast)];
    const yhat = x.reduce((a, xi, i) => a + xi * m.koef[i], 0);
    const bas = Math.log(L1 + C);
    const p = Math.exp(bas + yhat) - C;
    ut.push({
      datum: mal, horisont: h, spot: p,
      spotLag: Math.exp(bas + yhat + m.res_p10) - C,
      spotHog: Math.exp(bas + yhat + m.res_p90) - C,
      temp: v.temp, vind: v.vind, median30: m30,
      dyr: p >= 1.5 * m30 && p >= 0.5,
      orsak: orsak(v, vader[senast], helg(mal), helg(senast), p >= L1),
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

/** SMHI punktprognos (snow1g) -> dygnsmedel av temperatur och vind per datum (svensk tid). */
export function smhiDygn(smhi) {
  const per = {};
  for (const ts of smhi.timeSeries) {
    const datum = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(ts.time));
    (per[datum] ??= { temp: [], vind: [] });
    if (Number.isFinite(ts.data.air_temperature)) per[datum].temp.push(ts.data.air_temperature);
    if (Number.isFinite(ts.data.wind_speed)) per[datum].vind.push(ts.data.wind_speed);
  }
  const ut = {};
  for (const [d, v] of Object.entries(per)) ut[d] = { temp: medel(v.temp), vind: medel(v.vind) };
  return ut;
}

/** Medel över flera orter: { datum: { temp, vind } } från temp- och vindorter. */
export function kombineraVader(tempOrter, vindOrter) {
  const datum = new Set([...tempOrter.flatMap((o) => Object.keys(o)), ...vindOrter.flatMap((o) => Object.keys(o))]);
  const ut = {};
  for (const d of datum) {
    const t = medel(tempOrter.map((o) => o[d]?.temp));
    const w = medel(vindOrter.map((o) => o[d]?.vind));
    if (Number.isFinite(t) && Number.isFinite(w)) ut[d] = { temp: t, vind: w };
  }
  return ut;
}

// Orter som modellen tränades på (SMHI-stationernas positioner).
export const PROGNOSORTER = {
  temp: [
    { namn: 'Jönköping', lat: 57.7514, lon: 14.0733 },
    { namn: 'Stockholm', lat: 59.3417, lon: 18.0549 },
    { namn: 'Göteborg', lat: 57.7156, lon: 11.9924 },
    { namn: 'Malmö', lat: 55.5715, lon: 13.0708 },
  ],
  vind: [
    { namn: 'Falsterbo', lat: 55.3837, lon: 12.8166 },
    { namn: 'Väderöarna', lat: 58.576, lon: 11.0661 },
    { namn: 'Hoburg', lat: 56.9209, lon: 18.1506 },
    { namn: 'Sundsvall', lat: 62.5246, lon: 17.441 },
    { namn: 'Östersund', lat: 63.1981, lon: 14.4869 },
  ],
};
