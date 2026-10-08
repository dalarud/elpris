// Efterhandstest av varningarna på verkliga priser: hur ofta hade Elkollen varnat
// senaste 12 månaderna, stämde förvarningarna, och vad hade det sparat att dra ner?
// Skriver analys/resultat_varningar.md.
//
// Kör: node test/backtest.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as K from '../app/js/kalkyl.js';
import { prisprognos } from '../app/js/prognos.js';

const ROT = join(dirname(fileURLToPath(import.meta.url)), '..');
const inst = { ...K.STANDARD };
// ANTAGANDE om vad "dra ner" betyder under en varnad period:
const HUSHALL_FLYTT = 0.3;       // 30 % av hushållselen (tvätt, tork, disk, ugn) skjuts upp
const VARME_FLYTT = 0.5;         // värmepumpen går på halvfart ...
const VARME_MAX_TIMMAR = 3;      // ... i högst 3 timmar per period (huset håller värmen)
const FLYTT_TILL_TIMMAR = 3;     // värmen tas igen de 3 timmarna efter perioden

// --- data ---
const intervallPerDag = {};
for (const r of readFileSync(join(ROT, 'data', 'spotpris_SE3.csv'), 'utf8').trim().split('\n').slice(1)) {
  const [start, slut, sek] = r.split(',');
  const t = K.lokalTid(start);
  (intervallPerDag[t.datum] ??= []).push({ start, slut, ...t, langd: Math.round((new Date(slut) - new Date(start)) / 6e4), spot: Number(sek) });
}
const vaderRader = readFileSync(join(ROT, 'data', 'vader_daglig.csv'), 'utf8').trim().split('\n');
const kol = vaderRader[0].split(',');
const vader = {}, tempJkpg = {};
for (const rad of vaderRader.slice(1)) {
  const f = rad.split(',');
  const tal = (namn) => Number(f[kol.indexOf(namn)]);
  const temps = ['temp_jonkoping', 'temp_stockholm', 'temp_goteborg', 'temp_malmo'].map(tal).filter((x) => Number.isFinite(x) && f[kol.indexOf('temp_jonkoping')] !== '');
  const vindar = ['vind_falsterbo', 'vind_vaderoarna', 'vind_hoburg', 'vind_sundsvall', 'vind_ostersund'].map(tal).filter(Number.isFinite);
  if (temps.length && vindar.length) vader[f[0]] = { temp: K.medel(temps), vind: K.medel(vindar) };
  if (f[kol.indexOf('temp_jonkoping')] !== '') tempJkpg[f[0]] = tal('temp_jonkoping');
}
const modell = JSON.parse(readFileSync(join(ROT, 'app', 'modell', 'prismodell.json'), 'utf8'));
const tim = Object.fromEntries(Object.entries(intervallPerDag).map(([d, iv]) => [d, K.timpriser(iv)]));
const dygnspris = Object.fromEntries(Object.entries(tim).map(([d, v]) => [d, K.medel(v)]));

// --- simulering ---
const sista = Object.keys(intervallPerDag).sort().at(-1);
const fran = K.laggTillDagar(sista, -366);
const perManad = {};
const forvarningar = [];
let summaExtra = 0, summaBesparing = 0, summaExtraAlla = 0;

for (let idag = fran; K.laggTillDagar(idag, 1) <= sista; idag = K.laggTillDagar(idag, 1)) {
  const imorgon = K.laggTillDagar(idag, 1);
  const m = imorgon.slice(0, 7);
  const rad = (perManad[m] ??= { dagar: 0, dyraPeriodDagar: 0, varningsdagar: 0, mycket: 0, perioder: 0, timmar: 0, extra: 0, besparing: 0, forv: 0, forvRatt: 0, dyraDagar: 0, dyraForvarnade: 0 });
  rad.dagar++;
  const spot30 = [];
  for (let d = 0; d < 30; d++) spot30.push(...(tim[K.laggTillDagar(idag, -d)] ?? []).filter(Number.isFinite));
  const ref = K.referens(spot30, inst);
  const iv = intervallPerDag[imorgon];
  const kostnad = K.dygnskostnad(imorgon, tim[imorgon], tempJkpg[imorgon], inst);
  const modellDygn = K.forbrukningDygn(imorgon, tempJkpg[imorgon], inst, tim[imorgon]);
  const berikade = K.berika(iv, ref, inst);
  // Husets merkostnad över normalpris hela dygnet (för att se hur stor del varningarna täcker)
  for (const i of berikade) summaExtraAlla += Math.max(0, kostnad.kwhTim[i.timme] * i.langd / 60 * (i.total - ref.totalMedian));
  const allaPerioder = K.dyraPerioder(berikade);
  const dygn = K.dygnsvarningar(allaPerioder, { [imorgon]: kostnad.kwhTim }, ref, inst).find((d) => d.datum === imorgon);
  if (allaPerioder.length) rad.dyraPeriodDagar++;
  const perioder = dygn?.varna ? allaPerioder : [];
  if (perioder.length) {
    rad.varningsdagar++;
    if (dygn.niva === 'mycket-dyrt') rad.mycket++;
  }
  for (const p of perioder) {
    rad.perioder++;
    rad.timmar += p.minuter / 60;
    const k = K.periodKostnad(p, { [imorgon]: kostnad.kwhTim }, ref);
    rad.extra += Math.max(0, k.extra);
    summaExtra += Math.max(0, k.extra);
    // Dra ner: tvätt, tork, disk m.m. flyttas till dygnets billigaste 3 timmar;
    // värmen tas igen de 3 timmarna efter perioden (huset har svalnat lite).
    let husKwh = 0, varmeKwh = 0, krFore = 0, minVarme = 0;
    for (const i of p.intervall) {
      const h = i.timme;
      const varme = minVarme < VARME_MAX_TIMMAR * 60 ? modellDygn.delar.varme[h] * VARME_FLYTT * i.langd / 60 : 0;
      const hus = modellDygn.delar.hushall[h] * HUSHALL_FLYTT * i.langd / 60;
      minVarme += i.langd;
      husKwh += hus; varmeKwh += varme;
      krFore += (hus + varme) * i.total;
    }
    const efter = berikade.filter((i) => i.start >= p.slut).slice(0, FLYTT_TILL_TIMMAR * 4);
    const nasta = efter.length ? efter : (intervallPerDag[K.laggTillDagar(imorgon, 1)] ?? []).slice(0, FLYTT_TILL_TIMMAR * 4)
      .map((i) => ({ ...i, total: K.totalpris(i.spot, i.datum, i.timme, inst) }));
    const prisEfter = nasta.length ? K.medel(nasta.map((i) => i.total)) : ref.totalMedian;
    const billigast = K.billigasteFonster(berikade, 3)?.medel ?? prisEfter;
    const besparing = krFore - husKwh * billigast - varmeKwh * prisEfter * 1.05;   // 5 % extra energi för att ta igen värmen
    rad.besparing += besparing;
    summaBesparing += besparing;
  }
  // Förvarning 3 dygn fram, med uppmätt väder i stället för prognos (optimistiskt)
  const mal = K.laggTillDagar(idag, 3);
  const pr = prisprognos(modell, Object.fromEntries(Object.entries(dygnspris).filter(([d]) => d <= imorgon)), vader, imorgon, idag)
    .find((x) => x.datum === mal);
  if (pr && dygnspris[mal] !== undefined) {
    const verkligDyr = dygnspris[mal] >= 1.5 * pr.median30 && dygnspris[mal] >= 0.5;
    const mrad = (perManad[mal.slice(0, 7)] ??= { dagar: 0, dyraPeriodDagar: 0, varningsdagar: 0, mycket: 0, perioder: 0, timmar: 0, extra: 0, besparing: 0, forv: 0, forvRatt: 0, dyraDagar: 0, dyraForvarnade: 0 });
    if (pr.dyr) { mrad.forv++; if (verkligDyr) mrad.forvRatt++; }
    if (verkligDyr) { mrad.dyraDagar++; if (pr.dyr) mrad.dyraForvarnade++; }
    forvarningar.push({ mal, dyr: pr.dyr, verkligDyr });
  }
}

// --- rapport ---
const MAN = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const ut = [];
const w = (s = '') => ut.push(s);
const rader = Object.entries(perManad).filter(([m]) => m >= fran.slice(0, 7) && m <= sista.slice(0, 7)).sort();
const sum = (f) => rader.reduce((a, [, r]) => a + f(r), 0);
w('# Efterhandstest av varningarna');
w();
w(`Genererad av \`test/backtest.mjs\`. Varje dygn ${K.laggTillDagar(fran, 1)} – ${sista} har simulerats som om Elkollen kört kl 13:30 dagen före, med verkliga kvartspriser och Jönköping Energis säkringstariff. Husets förbrukning är beräknad (20 520 kWh/år, verklig temperatur i Jönköping).`);
w();
w(`**Varning (känt pris)** = de dyra perioderna i morgon (minst 30 min med totalpris minst 40 % över normalt, median 30 dygn) kostar huset minst ${inst.varningKr} kr extra. Kolumnen "Dygn med dyra perioder" visar hur ofta det hade varnats utan kronorgränsen.`);
w();
w('** **Förvarning** = dygnet 3 dagar fram uppskattas få ett dygnsmedel ≥ 1,5 × normalt. Förvarningarna är här beräknade med *uppmätt* väder i stället för prognos, och blir därför något för bra – se `analys/resultat_prismodell.md` för utvärdering med prognosfel.');
w();
w('ANTAGANDE för "dra ner": under en varnad period flyttas 30 % av hushållselen (tvätt, tork, disk, ugn) till dygnets billigaste 3 timmar, och värmepumpen går på halvfart i högst 3 timmar och tar igen det de 3 timmarna efter perioden med 5 % extra energi.');
w();
w('| Månad | Dygn med dyra perioder | Dygn med varning | varav mycket dyrt | Varnade timmar | Husets merkostnad under varningarna | Sparat om du drar ner | Förvarningar (stämde) | Dyra dygn (förvarnade) |');
w('|---|---|---|---|---|---|---|---|---|');
for (const [m, r] of rader) {
  w(`| ${MAN[+m.slice(5, 7) - 1]} ${m.slice(0, 4)} | ${r.dyraPeriodDagar} | ${r.varningsdagar} av ${r.dagar} | ${r.mycket} | ${K.tal(r.timmar)} | ${K.kr(r.extra)} | ${K.kr(r.besparing)} | ${r.forv} (${r.forvRatt}) | ${r.dyraDagar} (${r.dyraForvarnade}) |`);
}
w(`| **Summa** | **${sum((r) => r.dyraPeriodDagar)}** | **${sum((r) => r.varningsdagar)}** | **${sum((r) => r.mycket)}** | **${K.tal(sum((r) => r.timmar))}** | **${K.kr(summaExtra)}** | **${K.kr(summaBesparing)}** | **${sum((r) => r.forv)} (${sum((r) => r.forvRatt)})** | **${sum((r) => r.dyraDagar)} (${sum((r) => r.dyraForvarnade)})** |`);
w();
const fv = forvarningar.filter((f) => f.dyr), dyra = forvarningar.filter((f) => f.verkligDyr);
w('## Slutsatser');
w();
w(`- Elkollen hade varnat för morgondagen **${sum((r) => r.varningsdagar)} dygn av ${sum((r) => r.dagar)}** (${(100 * sum((r) => r.varningsdagar) / sum((r) => r.dagar)).toFixed(0)} %), varav ${sum((r) => r.mycket)} med *mycket dyrt*. Utan kronorgränsen hade det blivit ${sum((r) => r.dyraPeriodDagar)} dygn – vanliga kvällstoppar som inte är värda en notis.`);
w(`- Under de varnade perioderna kostade huset ${K.kr(summaExtra)} mer än vid normalpris. Det är ${(100 * summaExtra / summaExtraAlla).toFixed(0)} % av all merkostnad över normalpris under året; resten är korta toppar under 30 minuter eller nivåer strax under gränsen.`);
w(`- Att dra ner enligt antagandet ovan hade sparat ungefär **${K.kr(summaBesparing)} på ett år** (uppskattning).`);
w(`- Förvarningar 3 dygn i förväg: ${fv.length} st, varav ${fv.filter((f) => f.verkligDyr).length} stämde (${(100 * fv.filter((f) => f.verkligDyr).length / Math.max(1, fv.length)).toFixed(0)} %). De fångade ${dyra.filter((f) => f.dyr).length} av ${dyra.length} dyra dygn (${(100 * dyra.filter((f) => f.dyr).length / Math.max(1, dyra.length)).toFixed(0)} %).`);
writeFileSync(join(ROT, 'analys', 'resultat_varningar.md'), ut.join('\n') + '\n');
console.log(ut.join('\n'));
