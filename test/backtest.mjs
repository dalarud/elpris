// Efterhandstest av dagsplanen, signalen och orderboken på verkliga priser
// senaste 12 månaderna: hur ofta blir dygnet lugnt, svängigt eller dra ner, vad
// säger signalen, vad är orderboken värd och stämde förvarningarna?
// Skriver analys/resultat_varningar.md.
//
// Kör: node test/backtest.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as K from '../app/js/kalkyl.js';
import { prisprognos } from '../app/js/prognos.js';
import * as P from '../app/js/plan.js';

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
  (intervallPerDag[t.datum] ??= []).push({ start, slut, t0: Date.parse(start), ...t, langd: Math.round((new Date(slut) - new Date(start)) / 6e4), spot: Number(sek) });
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
const ny = () => ({ dagar: 0, lugnt: 0, svangigt: 0, draner: 0, timmar: 0, extra: 0, besparing: 0, forv: 0, forvRatt: 0, dyraDagar: 0, dyraForvarnade: 0 });
const perManad = {};
const forvarningar = [];
const signaler = { 12: {}, 20: {} };
// ANTAGANDE: så här ofta körs sysslorna per vecka (för orderbokens värde per år).
const PER_VECKA = { tvatt: 4, tork: 3, disk: 5, bastu: 1, ugn: 4 };
const order = Object.fromEntries(K.SYSSLOR.map((x) => [x.id, { n: 0, sparar: 0, varde1: 0 }]));
let summaExtra = 0, summaBesparing = 0, motsagelser = 0;
const planCache = {};
const plan = (d) => (planCache[d] ??= intervallPerDag[d] ? P.dagsplan(d, intervallPerDag[d], tim, tempJkpg, inst) : null);
const klockan = (d, h) => intervallPerDag[d]?.find((i) => i.timme === h && i.minut === 0)?.t0;

for (let idag = fran; K.laggTillDagar(idag, 1) <= sista; idag = K.laggTillDagar(idag, 1)) {
  const imorgon = K.laggTillDagar(idag, 1);
  const rad = (perManad[imorgon.slice(0, 7)] ??= ny());
  rad.dagar++;
  // Morgondagens plan, som notisen kl 13:40 och appen ser den.
  const pl = plan(imorgon);
  rad[pl.besked]++;
  if (pl.besked === 'draner') {
    const verklig = K.forbrukningDygn(imorgon, tempJkpg[imorgon], inst, tim[imorgon]);
    let husKwh = 0, varmeKwh = 0, krFore = 0, extra = 0;
    for (const p of pl.dyra) {
      rad.timmar += p.minuter / 60;
      let minVarme = 0;
      for (const i of p.intervall) {
        const e = verklig.total[i.timme] * i.langd / 60;
        extra += e * (i.total - pl.ref.totalMedian);
        const varme = minVarme < VARME_MAX_TIMMAR * 60 ? verklig.delar.varme[i.timme] * VARME_FLYTT * i.langd / 60 : 0;
        const hus = verklig.delar.hushall[i.timme] * HUSHALL_FLYTT * i.langd / 60;
        minVarme += i.langd;
        husKwh += hus; varmeKwh += varme; krFore += (hus + varme) * i.total;
      }
    }
    const sistaDyr = pl.dyra.at(-1);
    const efter = [...pl.kvartar, ...(plan(K.laggTillDagar(imorgon, 1))?.kvartar ?? [])].filter((i) => i.t0 >= sistaDyr.slutMs).slice(0, FLYTT_TILL_TIMMAR * 4);
    const prisEfter = efter.length ? K.medel(efter.map((i) => i.total)) : pl.ref.totalMedian;
    const billigast = pl.billiga.length ? Math.min(...pl.billiga.map((p) => p.medelTotal)) : prisEfter;
    const besparing = krFore - husKwh * billigast - varmeKwh * prisEfter * 1.05;
    rad.extra += extra; summaExtra += extra;
    rad.besparing += besparing; summaBesparing += besparing;
  }
  // Signalen kl 12 (bara dagens priser kända) och kl 20 (även morgondagens).
  for (const h of [12, 20]) {
    const nuMs = klockan(idag, h);
    if (!nuMs) continue;
    const planer = [plan(idag), h >= 13 ? plan(imorgon) : null].filter(Boolean);
    const berikade = planer.flatMap((p) => p.kvartar);
    const ob = P.orderbok({ berikade, nuMs, idag, planer });
    const sig = P.signal({ planer, berikade, nuMs, idag, orderbok: ob });
    signaler[h][sig.ord] = (signaler[h][sig.ord] ?? 0) + 1;
    // Signalen får aldrig säga emot orderboken.
    const rader = ob.rader.filter((r) => r.typ !== 'varme' && r.r?.nu);
    if ((sig.ord === 'Spelar ingen roll' && rader.length) || (sig.ord === 'Kör nu' && rader[0]?.typ !== 'fore')
      || (sig.ord === 'Vänta' && !rader.length)) motsagelser++;
  }
  // Orderboken kl 18: vad sparar varje syssla på att följa raden i stället för att köra direkt?
  const kl18 = klockan(idag, 18);
  if (kl18 && plan(imorgon)) {
    const berikade = [plan(idag), plan(imorgon)].flatMap((p) => p.kvartar);
    for (const sy of K.SYSSLOR) {
      const r = K.planera(berikade, kl18, sy);
      const bas = r?.nu ?? r?.kandidater.find((c) => !sy.dagtid || c.dagtid);
      if (!r?.bast || !bas) continue;
      const o = order[sy.id];
      o.n++;
      o.sparar += bas.kr - r.bast.kr;
      if (bas.kr - r.bast.kr >= K.GRANS_KR) o.varde1++;
    }
  }
  // Förvarning 3 dygn fram, med uppmätt väder i stället för prognos (optimistiskt)
  const mal = K.laggTillDagar(idag, 3);
  const pr = prisprognos(modell, Object.fromEntries(Object.entries(dygnspris).filter(([d]) => d <= imorgon)), vader, imorgon, idag)
    .find((x) => x.datum === mal);
  if (pr && dygnspris[mal] !== undefined) {
    const verkligDyr = dygnspris[mal] >= 1.5 * pr.median30 && dygnspris[mal] >= 0.5;
    const mrad = (perManad[mal.slice(0, 7)] ??= ny());
    if (pr.dyr) { mrad.forv++; if (verkligDyr) mrad.forvRatt++; }
    if (verkligDyr) { mrad.dyraDagar++; if (pr.dyr) mrad.dyraForvarnade++; }
    forvarningar.push({ mal, dyr: pr.dyr, verkligDyr });
  }
}

// --- rapport ---
const MAN = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const ut = [];
const w = (x = '') => ut.push(x);
const rader = Object.entries(perManad).filter(([m]) => m >= K.laggTillDagar(fran, 1).slice(0, 7) && m <= sista.slice(0, 7)).sort();
const sum = (f) => rader.reduce((a, [, r]) => a + f(r), 0);
const dagar = sum((r) => r.dagar);
w('# Efterhandstest av dagsplanen, signalen och orderboken');
w();
w(`Genererad av \`test/backtest.mjs\`. Varje dygn ${K.laggTillDagar(fran, 1)} – ${sista} har simulerats med verkliga kvartspriser och Jönköping Energis säkringstariff. Husets förbrukning är beräknad (20 520 kWh/år).`);
w();
w('**Dagsplanen** jämför varje kvart med de 30 dygnen före. *Dyrt* = vid eller över 80:e percentilen i minst 30 minuter, *billigt* = vid eller under 20:e percentilen i minst en timme. Beskedet för dygnet:');
w('- **Lugnt**: ingen dyr period.');
w(`- **Svängigt**: dyra perioder, men de kostar huset mindre än ${inst.varningKr} kr över normalpris (räknat med normaltemperatur).`);
w(`- **Dra ner**: de dyra perioderna kostar huset minst ${inst.varningKr} kr över normalpris. Då skickas en notis kl 13:40 dagen före.`);
w();
w('ANTAGANDE för "dra ner": under de dyra perioderna flyttas 30 % av hushållselen till dygnets billigaste period, och värmepumpen går på halvfart i högst 3 timmar och tar igen det de 3 timmarna efter med 5 % extra energi. Merkostnad och besparing räknas med uppmätt temperatur.');
w();
w('| Månad | Lugnt | Svängigt | Dra ner | Timmar med dra ner | Husets merkostnad dra ner-dygnen | Sparat om du drar ner | Förvarningar (stämde) | Dyra dygn (förvarnade) |');
w('|---|---|---|---|---|---|---|---|---|');
for (const [m, r] of rader) {
  w(`| ${MAN[+m.slice(5, 7) - 1]} ${m.slice(0, 4)} | ${r.lugnt} | ${r.svangigt} | ${r.draner} | ${K.tal(r.timmar)} | ${K.kr(r.extra)} | ${K.kr(r.besparing)} | ${r.forv} (${r.forvRatt}) | ${r.dyraDagar} (${r.dyraForvarnade}) |`);
}
w(`| **Summa** | **${sum((r) => r.lugnt)}** | **${sum((r) => r.svangigt)}** | **${sum((r) => r.draner)}** | **${K.tal(sum((r) => r.timmar))}** | **${K.kr(summaExtra)}** | **${K.kr(summaBesparing)}** | **${sum((r) => r.forv)} (${sum((r) => r.forvRatt)})** | **${sum((r) => r.dyraDagar)} (${sum((r) => r.dyraForvarnade)})** |`);
w();
w('## Signalen');
w();
w('Vad signalen hade sagt kl 12 (bara dagens priser kända) och kl 20 (även morgondagens):');
w();
w('| Signal | kl 12 | kl 20 |');
w('|---|---|---|');
for (const ord of ['Dra ner', 'Vänta', 'Kör nu', 'Spelar ingen roll']) w(`| ${ord} | ${signaler[12][ord] ?? 0} | ${signaler[20][ord] ?? 0} |`);
w();
w(`Signalen härleds ur orderboken. Antal gånger signalen sa emot orderboken: **${motsagelser}**.`);
w();
w('## Orderboken: vad är raderna värda?');
w();
w('Beslut kl 18 med kända priser (i dag och i morgon), högst 24 h fram, jämfört med att köra direkt. Bastu och ugn bara dagtid (klara senast 21).');
w();
w('| Syssla | Sparat per körning (medel) | Dygn då raden är värd minst 1 kr | Antagna körningar/vecka | ≈ kr/år |');
w('|---|---|---|---|---|');
let arSumma = 0;
for (const sy of K.SYSSLOR) {
  const o = order[sy.id];
  const per = o.n ? o.sparar / o.n : 0;
  const ar = per * PER_VECKA[sy.id] * 52;
  arSumma += ar;
  w(`| ${sy.namn} (${K.tal(sy.kwh, 1)} kWh, ${sy.timmar} h) | ${K.kr2(per)} | ${o.varde1} av ${o.n} | ${PER_VECKA[sy.id]} | ${K.kr(ar)} |`);
}
w(`| **Summa** | | | | **${K.kr(arSumma)}** |`);
w();
const fv = forvarningar.filter((f) => f.dyr), dyra = forvarningar.filter((f) => f.verkligDyr);
w('## Slutsatser');
w();
w(`- Av ${dagar} dygn var ${sum((r) => r.lugnt)} lugna, ${sum((r) => r.svangigt)} svängiga och **${sum((r) => r.draner)} dra ner-dygn** (${(100 * sum((r) => r.draner) / dagar).toFixed(0)} %, ungefär ${K.tal(sum((r) => r.draner) / 52, 1)} i veckan). Bara dra ner-dygnen ger notis och röd färg.`);
w(`- Under dra ner-dygnens dyra perioder kostade huset ${K.kr(summaExtra)} mer än vid normalpris. Att dra ner enligt antagandet hade sparat ungefär **${K.kr(summaBesparing)} på ett år** (uppskattning).`);
w(`- Att följa orderboken för tvätt, tork, disk, bastu och ugn (beslut kl 18) är värt ungefär **${K.kr(arSumma)} per år** med antagna körningar – uppskattning.`);
w(`- Förvarningar 3 dygn i förväg: ${fv.length} st, varav ${fv.filter((f) => f.verkligDyr).length} stämde (${(100 * fv.filter((f) => f.verkligDyr).length / Math.max(1, fv.length)).toFixed(0)} %). De fångade ${dyra.filter((f) => f.dyr).length} av ${dyra.length} dyra dygn (${(100 * dyra.filter((f) => f.dyr).length / Math.max(1, dyra.length)).toFixed(0)} %).`);
writeFileSync(join(ROT, 'analys', 'resultat_varningar.md'), ut.join('\n') + '\n');
console.log(ut.join('\n'));
