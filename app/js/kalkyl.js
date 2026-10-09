// Beräkningskärnan. Används av både webbappen och notistjänsten (Node), så
// här får inte finnas något som bara fungerar i webbläsaren.
//
// Begrepp:
//   spot      spotpris i kr/kWh exkl. moms (som elbörsen anger det)
//   totalpris det du faktiskt betalar per kWh: spot + påslag (båda + moms),
//             energiskatt och överföringsavgift (inkl. moms)
//   intervall ett pris-intervall (kvart eller timme) med lokal tid

export const MOMS = 1.25;
export const HDD_BAS = 17;            // graddagar för husets värmebehov
export const HDD_NORMALAR = 3530;     // Jönköping, snitt 2023–2025 (SMHI 74460), bas 17 °C

export const STANDARD = {
  elomrade: 'SE3',
  arsforbrukning: 20520,
  bilKwhAr: 2500,
  bilKw: 3.7,
  hushallKwhAr: 7000,
  varmvattenKwhDag: 5.5,
  sakring: '20 A',
  natTariff: 'sakring',                 // 'sakring' eller 'tid'
  natbolag: 'Jönköping Energi Nät',
  natFastKrManad: { sakring: 432.94, tid: 624.91 },
  overforing: { sakring: 0.2929, tidHog: 0.3784, tidLag: 0.0921 },
  tidHoglast: { manader: [11, 12, 1, 2, 3], franTimme: 7, tillTimme: 22, vardagar: true },
  energiskatt: 0.45,                    // 36,0 öre + moms (2026)
  paslagOre: 4,                         // elhandlarens påslag, öre/kWh exkl. moms
  handelKrManad: 49,                    // elhandlarens månadsavgift inkl. moms
  plats: { namn: 'Jönköping', lat: 57.78, lon: 14.16 },
  // Nivåer jämfört med medianen av totalpriset senaste 30 dygnen
  dyrtFaktor: 1.4,
  mycketDyrtFaktor: 2.0,
  billigtFaktor: 0.8,
  // Varna (och skicka notis) bara när de dyra perioderna ett dygn kostar huset
  // minst så här mycket extra jämfört med normalpris. Kalibrerat i
  // analys/resultat_varningar.md: 25 kr ger ungefär en varning i veckan.
  varningKr: 25,
};

// Typisk dygnsprofil för hushållsel (utan värme och bil), relativ.
const HUSHALL_FORM = [0.6, 0.5, 0.5, 0.5, 0.5, 0.6, 0.9, 1.2, 1.1, 0.9, 0.9, 0.9,
  1.0, 0.9, 0.9, 1.0, 1.2, 1.5, 1.6, 1.5, 1.4, 1.2, 1.0, 0.8];
const HUSHALL_SUMMA = HUSHALL_FORM.reduce((a, b) => a + b, 0);
// Varmvatten utan prisstyrning: värms efter morgon- och kvällsduschar.
const VV_FORM = HUSHALL_FORM.map((_, h) => ((h >= 7 && h < 9) || (h >= 18 && h < 20) ? 1 : 0.1));
const VV_SUMMA = VV_FORM.reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------- tid ----

/** Tolkar en ISO-tid med offset ("2026-10-08T17:15:00+02:00") till lokala delar. */
export function lokalTid(iso) {
  return {
    datum: iso.slice(0, 10),
    timme: Number(iso.slice(11, 13)),
    minut: Number(iso.slice(14, 16)),
  };
}

export function veckodag(datum) {
  // 0 = måndag ... 6 = söndag
  return (new Date(datum + 'T12:00:00Z').getUTCDay() + 6) % 7;
}

export function laggTillDagar(datum, n) {
  const d = new Date(datum + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dagarMellan(fran, till) {
  return Math.round((new Date(till + 'T12:00:00Z') - new Date(fran + 'T12:00:00Z')) / 864e5);
}

export function dagensDatum(nu = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(nu);
}

export function klockslagNu(nu = new Date()) {
  const s = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit', hour12: false }).format(nu);
  const [h, m] = s.split(':').map(Number);
  return { timme: h, minut: m };
}

// ------------------------------------------------------------- priser ----

/** Omvandlar elprisetjustnu.se-format till intervall. */
export function tolkaPriser(rader) {
  return rader.map((r, i) => {
    const t = lokalTid(r.time_start);
    // Slutet tas från nästa intervalls start när det finns: API:t anger t.ex.
    // 02:45+02:00 -> 03:00+01:00 (75 min) natten då sommartiden slutar.
    const slut = rader[i + 1]?.time_start ?? r.time_end;
    const t0 = Date.parse(r.time_start);
    const langd = Math.round((Date.parse(slut) - t0) / 60000);
    return { start: r.time_start, slut, t0, ...t, langd, spot: r.SEK_per_kWh };
  });
}

export function arHoglast(datum, timme, inst) {
  const h = inst.tidHoglast;
  const manad = Number(datum.slice(5, 7));
  if (!h.manader.includes(manad)) return false;
  if (h.vardagar && veckodag(datum) >= 5) return false;
  return timme >= h.franTimme && timme < h.tillTimme;
}

export function overforingsavgift(datum, timme, inst) {
  if (inst.natTariff !== 'tid') return inst.overforing.sakring;
  return arHoglast(datum, timme, inst) ? inst.overforing.tidHog : inst.overforing.tidLag;
}

/** Rörligt pris per kWh i kr inkl. moms, skatt och nät för ett intervall. */
export function totalpris(spot, datum, timme, inst) {
  return (spot + inst.paslagOre / 100) * MOMS + inst.energiskatt + overforingsavgift(datum, timme, inst);
}

/** Fasta avgifter per dygn (nät + elhandel), kr inkl. moms. */
export function fastNatPerDygn(inst) {
  return (inst.natFastKrManad[inst.natTariff] ?? inst.natFastKrManad.sakring) * 12 / 365;
}

export function fastHandelPerDygn(inst) {
  return inst.handelKrManad * 12 / 365;
}

/** Fasta avgifter per dygn (nät + elhandel), kr inkl. moms. */
export function fastPerDygn(inst) {
  return fastNatPerDygn(inst) + fastHandelPerDygn(inst);
}

/** Genomsnittligt totalpris över dygnets timmar för ett (uppskattat) jämnt spotpris. */
export function dygnsTotal(spot, datum, inst) {
  let s = 0;
  for (let h = 0; h < 24; h++) s += totalpris(spot, datum, h, inst);
  return s / 24;
}

export function median(v) {
  const s = [...v].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Kvantil q (0–1) med linjär interpolation. */
export function kvantil(v, q) {
  const s = [...v].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const pos = (s.length - 1) * q, i = Math.floor(pos);
  return i + 1 < s.length ? s[i] + (pos - i) * (s[i + 1] - s[i]) : s[i];
}

export function medel(v) {
  const s = v.filter((x) => Number.isFinite(x));
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : NaN;
}

// ----------------------------------------------------- förbrukningsmodell ----

/** Normaltemperatur för ett datum: medel av samma datum de fyra föregående åren. */
export function normalTemp(temp, datum) {
  const v = [];
  for (let ar = 1; ar <= 4; ar++) {
    const d = `${Number(datum.slice(0, 4)) - ar}${datum.slice(4)}`;
    if (Number.isFinite(temp[d])) v.push(temp[d]);
  }
  return v.length ? medel(v) : 7;
}

/**
 * Dygnsmedeltemperatur för hushållets värmebehov: uppmätt i första hand, annars
 * SMHI (uppmätta timmar + prognos) om dygnet täcks nästan helt, annars normalt.
 */
export function valjTemp(datum, uppmatt, hemVader) {
  if (Number.isFinite(uppmatt[datum])) return uppmatt[datum];
  const h = hemVader?.[datum];
  return h && Number.isFinite(h.temp) && (h.timmarTemp ?? 24) >= 18 ? h.temp : normalTemp(uppmatt, datum);
}

export function varmeKwhAr(inst) {
  return Math.max(0, inst.arsforbrukning - inst.hushallKwhAr - inst.bilKwhAr - inst.varmvattenKwhDag * 365);
}

/**
 * Beräknad förbrukning (kWh) per timme 0–23 för ett dygn.
 * tempMedel: dygnets medeltemperatur på orten (°C), styr värmen.
 * spotTim: dygnets 24 timpriser (används för när laddboxen laddar bilen).
 */
export function forbrukningDygn(datum, tempMedel, inst, spotTim = null) {
  const hdd = Math.max(0, HDD_BAS - (Number.isFinite(tempMedel) ? tempMedel : 7));
  const varmeDag = varmeKwhAr(inst) / HDD_NORMALAR * hdd;
  const hushallDag = inst.hushallKwhAr / 365;
  const bilDag = inst.bilKwhAr / 365;
  const delar = { hushall: [], varme: [], varmvatten: [], bil: new Array(24).fill(0) };
  for (let h = 0; h < 24; h++) {
    delar.hushall.push(hushallDag * HUSHALL_FORM[h] / HUSHALL_SUMMA);
    delar.varme.push(varmeDag / 24);
    delar.varmvatten.push(inst.varmvattenKwhDag * VV_FORM[h] / VV_SUMMA);
  }
  // Laddboxen styr mot pris: billigaste timmarna kl 22–07 (natten före + kvällen).
  const fonster = [22, 23, 0, 1, 2, 3, 4, 5, 6];
  const ordning = spotTim
    ? fonster.filter((h) => Number.isFinite(spotTim[h])).sort((a, b) => spotTim[a] - spotTim[b])
    : [1, 2, 3, 4, 0, 5, 23, 22, 6];
  let kvar = bilDag;
  for (const h of ordning) {
    if (kvar <= 0) break;
    const e = Math.min(kvar, inst.bilKw);
    delar.bil[h] += e;
    kvar -= e;
  }
  const total = delar.hushall.map((_, h) => delar.hushall[h] + delar.varme[h] + delar.varmvatten[h] + delar.bil[h]);
  return { total, delar, kwh: total.reduce((a, b) => a + b, 0) };
}

/** Grupperar intervall per timme (medel av spot). */
export function timpriser(intervall) {
  const tim = new Array(24).fill(null).map(() => []);
  for (const i of intervall) tim[i.timme].push(i.spot);
  return tim.map((v) => (v.length ? medel(v) : NaN));
}

/**
 * Kostnad för ett dygn: förbrukning (modell eller uppmätt per timme) x totalpris.
 * matt: valfri array med 24 uppmätta kWh, ersätter modellen.
 */
export function dygnskostnad(datum, spotTim, tempMedel, inst, matt = null) {
  const modell = forbrukningDygn(datum, tempMedel, inst, spotTim);
  // En timme utan pris i ett annars komplett dygn är timmen som inte finns när
  // sommartiden börjar; den får ingen beräknad förbrukning.
  const harPris = spotTim.map(Number.isFinite);
  const saknas = harPris.filter((x) => !x).length;
  const kwhTim = matt ?? modell.total.map((e, h) => (harPris[h] || saknas > 2 ? e : 0));
  let spot = 0, handel = 0, skatt = 0, natRorlig = 0;
  for (let h = 0; h < 24; h++) {
    const e = kwhTim[h] ?? 0;
    const p = harPris[h] ? spotTim[h] : medel(spotTim);
    spot += e * p * MOMS;
    handel += e * inst.paslagOre / 100 * MOMS;
    skatt += e * inst.energiskatt;
    natRorlig += e * overforingsavgift(datum, h, inst);
  }
  const fastNat = fastNatPerDygn(inst), fastHandel = fastHandelPerDygn(inst);
  const kwh = kwhTim.reduce((a, b) => a + (b ?? 0), 0);
  return {
    datum, kwh, kalla: matt ? 'uppmätt' : 'beräknad',
    kr: spot + handel + skatt + natRorlig + fastNat + fastHandel,
    delar: { elpris: spot + handel + fastHandel, energiskatt: skatt, natavgift: natRorlig + fastNat },
    kwhTim,
  };
}

// -------------------------------------------------------- nivåer, perioder ----

/**
 * "Normalt" = medianen av vad en kWh kostat timme för timme de senaste 30
 * dygnen, med den nätavgift som gällde varje timme (spelar roll vid tidstariff).
 * poster: [{ spot, datum, timme }] – se posterFranTimpriser. En ren lista med
 * spotpriser accepteras också (räknas då med säkringstariffens avgift).
 */
export function referens(poster, inst) {
  const lista = poster.filter((p) => (typeof p === 'number' ? Number.isFinite(p) : Number.isFinite(p?.spot)));
  const spot = lista.map((p) => (typeof p === 'number' ? p : p.spot));
  const total = lista.map((p) => (typeof p === 'number' || !p.datum
    ? ((typeof p === 'number' ? p : p.spot) + inst.paslagOre / 100) * MOMS + inst.energiskatt + inst.overforing.sakring
    : totalpris(p.spot, p.datum, p.timme, inst)));
  // Köp- och säljzon som en trader ser dem: kvartens läge i senaste 30 dygnens intervall.
  return { spotMedian: median(spot), totalMedian: median(total), p20: kvantil(total, 0.2), p80: kvantil(total, 0.8), p90: kvantil(total, 0.9) };
}

/** Timposter för referens(): dygnen från och med `fran` till och med `till`. */
export function posterFranTimpriser(tim, fran, till) {
  const ut = [];
  for (let d = fran; d <= till; d = laggTillDagar(d, 1)) {
    (tim[d] ?? []).forEach((spot, timme) => { if (Number.isFinite(spot)) ut.push({ spot, datum: d, timme }); });
  }
  return ut;
}

export function niva(total, ref, inst) {
  if (total >= ref.totalMedian * inst.mycketDyrtFaktor) return 'mycket-dyrt';
  if (total >= ref.totalMedian * inst.dyrtFaktor) return 'dyrt';
  if (total <= ref.totalMedian * inst.billigtFaktor) return 'billigt';
  return 'normalt';
}

export const NIVA_TEXT = { 'mycket-dyrt': 'Mycket dyrt', dyrt: 'Dyrt', normalt: 'Normalt', billigt: 'Billigt' };
export const NIVA_EL = { 'mycket-dyrt': 'Mycket dyr el', dyrt: 'Dyr el', normalt: 'Normalpris', billigt: 'Billig el' };
const NIVA_RANG = { billigt: 0, normalt: 1, dyrt: 2, 'mycket-dyrt': 3 };

/** Lägger på totalpris och nivå på varje intervall. */
export function berika(intervall, ref, inst) {
  return intervall.map((i) => {
    const total = totalpris(i.spot, i.datum, i.timme, inst);
    return { ...i, total, niva: niva(total, ref, inst) };
  });
}

function hhmm(i, slut = false) {
  const t = slut ? lokalTid(i.slut) : i;
  if (slut && t.timme === 0 && t.minut === 0 && t.datum !== i.datum) return '24:00';
  return `${String(t.timme).padStart(2, '0')}:${String(t.minut).padStart(2, '0')}`;
}

/**
 * Sammanhängande dyra perioder (dyrt eller mycket dyrt). Korta avbrott på högst
 * `glapp` minuter slås ihop. Perioder kortare än `minMinuter` tas bort.
 */
export function dyraPerioder(berikade, { glapp = 30, minMinuter = 30 } = {}) {
  const perioder = [];
  let p = null;
  let glappMin = 0;
  for (const i of berikade) {
    const dyr = NIVA_RANG[i.niva] >= 2;
    if (dyr) {
      if (!p) p = { intervall: [], start: i.start, datum: i.datum, franTxt: hhmm(i) };
      if (glappMin) { p.intervall.push(...p.vantande); }
      p.vantande = [];
      glappMin = 0;
      p.intervall.push(i);
      p.slut = i.slut;
      p.tillTxt = hhmm(i, true);
    } else if (p) {
      glappMin += i.langd;
      p.vantande.push(i);
      if (glappMin > glapp) { perioder.push(p); p = null; glappMin = 0; }
    }
  }
  if (p) perioder.push(p);
  return perioder
    .map((q) => {
      const minuter = q.intervall.reduce((a, i) => a + i.langd, 0);
      const max = Math.max(...q.intervall.map((i) => i.total));
      const medelTotal = q.intervall.reduce((a, i) => a + i.total * i.langd, 0) / minuter;
      const varst = q.intervall.some((i) => i.niva === 'mycket-dyrt') ? 'mycket-dyrt' : 'dyrt';
      return { datum: q.datum, start: q.start, slut: q.slut, franTxt: q.franTxt, tillTxt: q.tillTxt, minuter, max, medelTotal, niva: varst, intervall: q.intervall };
    })
    .filter((q) => q.minuter >= minMinuter);
}

/**
 * Vad perioden kostar hushållet extra jämfört med normalpris, med beräknad
 * förbrukning per timme (kwhTim för respektive datum).
 */
export function periodKostnad(period, kwhTimPerDatum, ref) {
  let kwh = 0, kr = 0, extra = 0;
  for (const i of period.intervall) {
    const kwhTim = kwhTimPerDatum[i.datum];
    if (!kwhTim) continue;
    const e = kwhTim[i.timme] * i.langd / 60;
    kwh += e;
    kr += e * i.total;
    extra += e * (i.total - ref.totalMedian);
  }
  return { kwh, kr, extra };
}

// ---------------------------------------------------------------- text ----

const krFmt = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });
const kr2Fmt = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const kr = (x) => `${krFmt.format(Math.round(x))}\u00a0kr`;
export const krKwh = (x) => `${kr2Fmt.format(x)}\u00a0kr/kWh`;
export const kr2 = (x) => `${kr2Fmt.format(x)}\u00a0kr`;
export const tal = (x, d = 0) => new Intl.NumberFormat('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(x);

const DAGNAMN = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag'];
export function dagnamn(datum, idag) {
  const d = dagarMellan(idag, datum);
  if (d === 0) return 'i dag';
  if (d === 1) return 'i morgon';
  if (d === -1) return 'i går';
  return DAGNAMN[veckodag(datum)];
}

/** "i natt", "i kväll", "i dag", "i morgon" eller veckodag för en lokal tidpunkt. */
export function narOrd(klocka, idag) {
  const d = dagarMellan(idag, klocka.datum);
  if (d === 0 && klocka.timme >= 18) return 'i kväll';
  if ((d === 1 && klocka.timme < 6) || (d === 0 && klocka.timme < 5)) return 'i natt';
  return dagnamn(klocka.datum, idag);
}

export const RAD = {
  'mycket-dyrt': 'Skjut upp allt som kan vänta: tvätt, tork, disk, ugn och bastu. Sänk gärna värmen 1–2 grader under perioden – huset håller värmen några timmar. Se till att bilen inte laddar då.',
  dyrt: 'Flytta gärna tvätt, tork, disk och bastu till en billigare tid.',
};

/**
 * Delar upp dyra perioder per dygn och avgör vilka dygn som är värda en varning:
 * summan av husets merkostnad under perioderna måste vara minst inst.varningKr.
 */
export function dygnsvarningar(perioder, kwhTimPerDatum, ref, inst) {
  const per = {};
  for (const p of perioder) {
    const k = periodKostnad(p, kwhTimPerDatum, ref);
    (per[p.datum] ??= { datum: p.datum, perioder: [], extra: 0, kr: 0, kwh: 0 });
    per[p.datum].perioder.push({ ...p, kostnad: k });
    per[p.datum].extra += Math.max(0, k.extra);
    per[p.datum].kr += k.kr;
    per[p.datum].kwh += k.kwh;
  }
  return Object.values(per).map((d) => ({
    ...d,
    varna: d.extra >= inst.varningKr,
    niva: d.perioder.some((p) => p.niva === 'mycket-dyrt') ? 'mycket-dyrt' : 'dyrt',
  }));
}

/** Billigaste sammanhängande fönster om `timmar` timmar bland intervallen (totalpris). */
export function billigasteFonster(intervall, timmar = 3) {
  const n = intervall.length ? Math.round(timmar * 60 / intervall[0].langd) : 0;
  if (!n || intervall.length < n) return null;
  let bast = null;
  for (let i = 0; i + n <= intervall.length; i++) {
    const m = medel(intervall.slice(i, i + n).map((x) => x.total));
    if (!bast || m < bast.medel) bast = { medel: m, i };
  }
  const a = intervall[bast.i], b = intervall[bast.i + n - 1];
  return { medel: bast.medel, datum: a.datum, fran: hhmm(a), till: hhmm(b, true) };
}

const EXEMPEL_KWH = 3;   // en omgång tvätt + tork (ungefärligt)

/** "En tvätt med tork kostar X kr under perioden men Y kr i natt 01–04." */
export function exempeltext(period, billigast, idag) {
  if (!billigast || period.medelTotal - billigast.medel < 0.3) return '';
  const nar = `${billigast.datum === period.datum ? '' : dagnamn(billigast.datum, idag) + ' '}kl ${billigast.fran}–${billigast.till}`;
  return `En tvätt med tork (cirka ${EXEMPEL_KWH} kWh) kostar ${kr2(EXEMPEL_KWH * period.medelTotal)} under perioden men ${kr2(EXEMPEL_KWH * billigast.medel)} ${nar}.`;
}

/** Varning för en känd dyr period, formulerad i klartext. */
export function varningstext(period, kostnad, ref, idag, billigast = null) {
  const dag = dagnamn(period.datum, idag);
  const rubrik = `${NIVA_EL[period.niva]} ${dag} ${period.franTxt}–${period.tillTxt}`;
  const rader = [
    `Upp till ${krKwh(period.max)} (normalt ${krKwh(ref.totalMedian)}).`,
  ];
  if (kostnad && kostnad.kwh > 0.5) {
    rader.push(`Ditt hus använder ungefär ${tal(kostnad.kwh)} kWh då, vilket kostar ${kr(kostnad.kr)} – ${kr(Math.max(0, kostnad.extra))} mer än vid normalpris (uppskattning).`);
  }
  rader.push(exempeltext(period, billigast, idag));
  rader.push(RAD[period.niva]);
  return { rubrik, text: rader.filter(Boolean).join(' '), niva: period.niva };
}

// -------------------------------------------------------- stödfunktioner ----

/**
 * Sysslor som går att flytta i tid. Energi och längd är ungefärliga (ANTAGANDE).
 * timer: maskinen har fördröjd start. dagtid: föreslå bara start kl 07–20.
 */
export const SYSSLOR = [
  { id: 'tvatt', namn: 'Tvätt', kwh: 1.0, timmar: 2, timer: true, flytta: 'Skjut upp tvätten', tidigare: 'Tvätta före' },
  { id: 'tork', namn: 'Tork', kwh: 2.5, timmar: 2, timer: true, flytta: 'Skjut upp torken', tidigare: 'Kör torken före' },
  { id: 'disk', namn: 'Disk', kwh: 1.0, timmar: 3, timer: true, flytta: 'Starta disken senare', tidigare: 'Diska före' },
  { id: 'bastu', namn: 'Bastu', kwh: 7, timmar: 2, timer: false, dagtid: true, flytta: 'Vänta med bastun', tidigare: 'Basta före' },
  { id: 'ugn', namn: 'Ugn', kwh: 1.5, timmar: 1, timer: false, dagtid: true, flytta: 'Vänta med ugnen', tidigare: 'Använd ugnen före' },
];

const KLOCKA_SV = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
/** Svensk lokal tid för en tidpunkt i ms: { datum, timme, minut, txt }. */
export function lokalKlocka(ms) {
  const d = Object.fromEntries(KLOCKA_SV.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const timme = d.hour === '24' ? 0 : Number(d.hour);
  return { datum: `${d.year}-${d.month}-${d.day}`, timme, minut: Number(d.minute), txt: `${String(timme).padStart(2, '0')}:${d.minute}` };
}

/** Kostnad (kr) för `kwh` jämnt fördelat över [startMs, startMs + timmar). null om priserna inte räcker. */
export function fonsterKostnad(berikade, startMs, timmar, kwh) {
  const slut = startMs + timmar * 3600e3;
  let minuter = 0, krMin = 0;
  for (const i of berikade) {
    const a = Math.max(i.t0, startMs), b = Math.min(i.t0 + i.langd * 60e3, slut);
    if (b > a) { const m = (b - a) / 60e3; minuter += m; krMin += m * i.total; }
  }
  if (minuter < timmar * 60 - 1) return null;
  return kwh * krMin / minuter;
}

/**
 * Ordermotorn: EN beräkning av när en syssla bör köras, som alla delar av appen
 * (När ska jag köra?, Dra ner, notiser) använder. Regler:
 *  - Maskiner med fördröjd start prövas i hela timmar från nu (det går att ställa),
 *    övriga i hela kvartar (man startar dem själv).
 *  - Högst `maxTimmar` fram (24 h) och bara så långt priserna är kända.
 *  - Dagtid-sysslor (bastu, ugn) startar tidigast 07 och är klara senast 21.
 *  - Under GRANS_KR (1 kr) är skillnaden inte värd att planera efter.
 * Returnerar null om inga priser finns. Belopp i kr, alla uppskattningar.
 */
export const GRANS_KR = 1;
export const DAG_START = 7;
export const KLAR_SENAST = 21;

export function planera(berikade, nuMs, syssla, { maxTimmar = 24 } = {}) {
  const steg = syssla.timer ? 3600e3 : 900e3;
  const forsta = syssla.timer ? nuMs : Math.ceil(nuMs / 900e3) * 900e3;
  const kandidater = [];
  for (let t = forsta; t <= nuMs + maxTimmar * 3600e3; t += steg) {
    const kr = fonsterKostnad(berikade, t, syssla.timmar, syssla.kwh);
    if (kr === null) break;
    const klocka = lokalKlocka(t), slut = lokalKlocka(t + syssla.timmar * 3600e3);
    const slutTim = slut.timme + slut.minut / 60 + (slut.datum !== klocka.datum ? 24 : 0);
    const dagtid = klocka.timme >= DAG_START && slutTim <= KLAR_SENAST;
    kandidater.push({ startMs: t, om: Math.round((t - nuMs) / 3600e3), kr, klocka, slut, dagtid });
  }
  if (!kandidater.length) return null;
  const minst = (l) => l.reduce((a, b) => (b.kr < a.kr - 1e-9 ? b : a), l[0]);
  const tillatna = syssla.dagtid ? kandidater.filter((c) => c.dagtid) : kandidater;
  // "Nu" för bastu och ugn utanför dagtid finns inte – jämför då mot första tillåtna start.
  const nu = syssla.dagtid ? (kandidater[0].dagtid ? kandidater[0] : null) : kandidater[0];
  if (!tillatna.length) return { nu, bast: null, dagAlt: null, sparar: 0, undvikFran: null, kandidater };
  const bast = minst(tillatna);
  // Ett dagtidsalternativ för maskiner som annars föreslås på natten – bara om det
  // kostar högst 25 öre eller 10 % mer än bästa tiden.
  const dag = syssla.dagtid ? null : kandidater.filter((c) => c.dagtid);
  const dagBast = dag?.length ? minst(dag) : null;
  const dagAlt = dagBast && dagBast !== bast && !bast.dagtid
    && dagBast.kr - bast.kr <= Math.max(0.25, 0.1 * bast.kr) ? dagBast : null;
  const bas = nu ?? tillatna[0];
  // När blir det dyrt om man väntar? Första start (inom 12 h) som kostar minst
  // GRANS_KR mer än att köra nu – för beskedet "kör nu eller före kl X".
  const undvik = tillatna.find((c) => c.startMs > bas.startMs && c.startMs <= bas.startMs + 12 * 3600e3 && c.kr - bas.kr >= GRANS_KR);
  return { nu, bast, dagAlt, sparar: nu ? nu.kr - bast.kr : 0, undvikFran: undvik ?? null, kandidater };
}

/**
 * Dra ner-läge för ett dygn: konkreta saker att göra under dygnets dyra perioder
 * och vad var och en sparar. Sysslornas alternativa tid kommer från ordermotorn
 * (planera), så tiden är densamma som i När ska jag köra?. Besparingen räknas mot
 * att köra sysslan under den dyraste av perioderna.
 * Värmen: halvfart under periodens dyraste 3 timmar, tas igen de 3 timmarna efter
 * med 5 % extra energi. Alla belopp är uppskattningar.
 * delarPerDatum: { datum: forbrukningDygn(...).delar }
 */
export function dranerAtgarder(perioder, berikade, delarPerDatum, ref, idag, nuMs) {
  const lista = Array.isArray(perioder) ? perioder : [perioder];
  const dyrast = lista.reduce((a, b) => (b.medelTotal > a.medelTotal ? b : a));
  const iPeriod = (ms) => lista.some((p) => ms < Date.parse(p.slut) && ms >= Date.parse(p.start));
  const atgarder = [];
  for (const s of SYSSLOR) {
    const r = planera(berikade, nuMs ?? Date.parse(dyrast.start), s);
    // Bästa start som inte ligger i någon av dygnets dyra perioder.
    const alt = r?.bast && !iPeriod(r.bast.startMs) ? r.bast
      : r ? r.kandidater.filter((c) => (!s.dagtid || c.dagtid) && !iPeriod(c.startMs) && !iPeriod(c.startMs + s.timmar * 3600e3 - 1))
        .reduce((a, b) => (!a || b.kr < a.kr ? b : a), null) : null;
    if (!alt) continue;
    const sparar = s.kwh * dyrast.medelTotal - alt.kr;
    const nar = `${narOrd(alt.klocka, idag)} kl ${alt.klocka.txt}`;
    const fore = alt.startMs < Date.parse(dyrast.start);
    const detalj = s.timer && alt.om > 0 ? `kör ${nar} i stället – ställ ${alt.om} h` : `t.ex. ${nar} i stället`;
    atgarder.push({ id: s.id, text: fore ? s.tidigare : s.flytta, detalj, nar, sparar, startMs: alt.startMs });
  }
  // Värmen: dyraste sammanhängande 3 timmarna bland dygnets perioder.
  let bastV = null;
  for (const p of lista) {
    const iv = p.intervall;
    for (let a = 0; a < iv.length; a++) {
      let kwh = 0, krV = 0, min = 0, b = a;
      for (; b < iv.length && min < 180; b++) {
        const d = delarPerDatum[iv[b].datum];
        const m = Math.min(iv[b].langd, 180 - min);
        min += m;
        if (!d) continue;
        const e = d.varme[iv[b].timme] * 0.5 * m / 60;
        kwh += e; krV += e * iv[b].total;
      }
      if (!bastV || krV > bastV.kr) bastV = { kwh, kr: krV, fran: iv[a], slutMs: iv[a].t0 + min * 60e3 };
    }
  }
  if (bastV && bastV.kwh > 0.3) {
    const efter = berikade.filter((i) => i.t0 >= bastV.slutMs).slice(0, 12);
    const prisEfter = efter.length ? medel(efter.map((i) => i.total)) : ref.totalMedian;
    const hoj = lokalKlocka(bastV.slutMs);
    atgarder.push({ id: 'varme', text: 'Sänk värmen 2 grader', detalj: `sänk kl ${hhmm(bastV.fran)}, höj igen kl ${hoj.txt} – huset håller värmen`, sparar: bastV.kr - bastV.kwh * prisEfter * 1.05 });
  }
  return atgarder.filter((a) => a.sparar >= GRANS_KR).sort((a, b) => b.sparar - a.sparar);
}
