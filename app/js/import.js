// Import av egna mätvärden (export från nätbolagets eller elhandlarens "Mina sidor").
// Formaten varierar, så tolkningen är medvetet tolerant: varje rad som innehåller
// ett datum med klockslag och ett tal tolkas som förbrukning (kWh) för intervallet
// som börjar vid klockslaget.
//
// Resultat: { 'YYYY-MM-DD': [24 kWh per timme] } plus statistik.

const DATUM_TID = /(\d{4})-(\d{2})-(\d{2})(?:[T ]|\s*[;,\t]\s*)(\d{1,2})[:.](\d{2})/;
const DATUM_SVENSK = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2})[:.](\d{2})/;   // 1/9/2026 00:00 (dag/månad)

function tal(s) {
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

export function tolkaMatvarden(text) {
  const timmar = {};          // datum -> [24]
  const raknare = {};         // datum -> antal värden
  let rader = 0, tolkade = 0, minutSteg = new Set();
  let forra = null;
  const avgransare = text.includes(';') ? ';' : text.includes('\t') ? '\t' : ',';
  for (const rad of text.split(/\r?\n/)) {
    if (!rad.trim()) continue;
    rader++;
    let m = rad.match(DATUM_TID);
    let datum, timme, minut;
    if (m) {
      datum = `${m[1]}-${m[2]}-${m[3]}`; timme = Number(m[4]); minut = Number(m[5]);
    } else if ((m = rad.match(DATUM_SVENSK))) {
      datum = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; timme = Number(m[4]); minut = Number(m[5]);
    } else continue;
    // Talet = sista fältet som är ett tal och inte en del av datum/tid.
    const resten = rad.slice(rad.indexOf(m[0]) + m[0].length);
    const falt = resten.split(avgransare).map((f) => f.replace(/["']/g, '')).filter((f) => f.trim());
    const varden = falt.map(tal).filter((x) => Number.isFinite(x));
    if (!varden.length || timme > 23) continue;
    // Om raden har både "till"-tid och värde: ta det sista talet.
    const kwh = varden[varden.length - 1];
    if (kwh < 0 || kwh > 100) continue;
    (timmar[datum] ??= new Array(24).fill(0))[timme] += kwh;
    raknare[datum] = (raknare[datum] ?? 0) + 1;
    const t = Date.UTC(+datum.slice(0, 4), +datum.slice(5, 7) - 1, +datum.slice(8, 10), timme, minut);
    if (forra !== null && t > forra && t - forra <= 3600e3) minutSteg.add((t - forra) / 60000);
    forra = t;
    tolkade++;
  }
  // Behåll bara dygn som verkar kompletta (minst 23 timmar eller 92 kvartar).
  const kompletta = {};
  for (const [d, v] of Object.entries(timmar)) {
    const n = raknare[d];
    if (n >= 23 && (n <= 25 || n >= 92)) kompletta[d] = v.map((x) => Math.round(x * 1000) / 1000);
  }
  const dagar = Object.keys(kompletta).sort();
  return {
    dagar: kompletta,
    statistik: {
      rader, tolkade,
      antalDygn: dagar.length,
      fran: dagar[0] ?? null, till: dagar.at(-1) ?? null,
      upplosning: minutSteg.has(15) ? 'kvart' : minutSteg.has(60) ? 'timme' : 'okänd',
      kwh: dagar.reduce((a, d) => a + kompletta[d].reduce((x, y) => x + y, 0), 0),
    },
  };
}
