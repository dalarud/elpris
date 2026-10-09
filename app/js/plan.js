// Elkollen som en traders plattform (varv 3). Rena funktioner som både appen
// och notistjänsten (Node) använder – inget här får bero på webbläsaren.
//
// Hushållet är en köpare som flyttar sin el i tid. Till skillnad från en
// daytrader har hushållet facit 11–35 timmar fram: morgondagens priser är kända
// från kl 13. Därför finns bara två beräkningar som allt annat läser:
//   dagsplan()  låser en gång per dygn vilka perioder som är billiga och dyra
//               och ger dygnet ett besked: lugnt, svängigt eller dra ner.
//   planera()   (kalkyl.js) säger för varje syssla när den ska köras och vad
//               det är värt jämfört med att köra nu.
// Signalen, orderboken, remsan, de egna ordrarna och notisen bygger på dessa.

import * as K from './kalkyl.js';

export const BILLIG_Q = 0.2;    // köpzon: kvartar vid eller under 30 dygnens 20:e percentil
export const DYR_Q = 0.8;       // avstå-zon: vid eller över 80:e percentilen
export const BESKED_TEXT = { lugnt: 'Lugnt', svangigt: 'Svängigt', draner: 'Dra ner' };

// ------------------------------------------------------------ dagsplanen ----

/**
 * Sammanhängande perioder där `iZon(intervall)` gäller. Avbrott på högst `glapp`
 * minuter slås ihop, perioder kortare än `minMinuter` tas bort. Id = datum + start,
 * så att en period behåller sitt id hela dygnet.
 */
export function zonPerioder(intervall, iZon, { glapp = 30, minMinuter = 30 } = {}) {
  const ut = [];
  let p = null, vantar = [], glappMin = 0;
  const avsluta = () => { if (p) ut.push(p); p = null; vantar = []; glappMin = 0; };
  for (const i of intervall) {
    if (iZon(i)) {
      if (!p) p = { intervall: [] };
      p.intervall.push(...vantar, i);
      vantar = []; glappMin = 0;
    } else if (p) {
      glappMin += i.langd;
      vantar.push(i);
      if (glappMin > glapp) avsluta();
    }
  }
  avsluta();
  return ut.map(({ intervall: iv }) => {
    const a = iv[0], b = iv[iv.length - 1];
    const minuter = iv.reduce((s, i) => s + i.langd, 0);
    return {
      id: `${a.datum}T${hhmm(a)}`, datum: a.datum, start: a.start, slut: b.slut,
      startMs: a.t0, slutMs: b.t0 + b.langd * 60e3,
      franTxt: hhmm(a), tillTxt: slutTxt(b), minuter,
      max: Math.max(...iv.map((i) => i.total)), min: Math.min(...iv.map((i) => i.total)),
      medelTotal: iv.reduce((s, i) => s + i.total * i.langd, 0) / minuter,
      intervall: iv,
    };
  }).filter((q) => q.minuter >= minMinuter);
}

const tva = (n) => String(n).padStart(2, '0');
function hhmm(i) { return `${tva(i.timme)}:${tva(i.minut)}`; }
function slutTxt(i) {
  const k = K.lokalKlocka(i.t0 + i.langd * 60e3);
  return k.datum !== i.datum && k.timme === 0 && k.minut === 0 ? '24:00' : k.txt;
}

/**
 * Dagsplanen för dygnet `datum`.
 *   kvartar  dygnets tolkade prisintervall (tolkaPriser)
 *   tim      timpriser (spot) per datum; dygnen datum−30 … datum−1 används som
 *            referens, så planen är densamma vem som än räknar och när
 *   temp     uppmätt dygnsmedeltemperatur per datum (för normaltemperaturen)
 * Husets exponering räknas med normaltemperaturen för datumet, så att appen och
 * notisen alltid kommer fram till samma besked. Beskedet räknas på hela dygnet
 * och ändras därför inte under dagen.
 */
export function dagsplan(datum, kvartar, tim, temp, inst) {
  const poster = K.posterFranTimpriser(tim, K.laggTillDagar(datum, -30), K.laggTillDagar(datum, -1));
  const ref = K.referens(poster.length >= 24 * 10 ? poster : kvartar.map((i) => ({ spot: i.spot, datum: i.datum, timme: i.timme })), inst);
  const berikade = K.berika(kvartar, ref, inst);
  const billiga = zonPerioder(berikade, (i) => i.total <= ref.p20, { glapp: 15, minMinuter: 60 });
  const dyra = zonPerioder(berikade, (i) => i.total >= ref.p80, { glapp: 30, minMinuter: 30 });
  const iPer = (lista) => { const s = new Set(); for (const p of lista) for (const i of p.intervall) s.add(i.t0); return s; };
  const iBillig = iPer(billiga), iDyr = iPer(dyra);
  for (const i of berikade) i.zon = iDyr.has(i.t0) ? 'dyr' : iBillig.has(i.t0) ? 'billig' : null;

  const forb = K.forbrukningDygn(datum, K.normalTemp(temp, datum), inst, K.timpriser(kvartar));
  let kwh = 0, extra = 0, varmeKwh = 0, varmeExtra = 0;
  for (const p of dyra) {
    let pk = 0, pe = 0;
    for (const i of p.intervall) {
      const e = forb.total[i.timme] * i.langd / 60;
      const v = forb.delar.varme[i.timme] * i.langd / 60;
      pk += e; pe += e * (i.total - ref.totalMedian);
      varmeKwh += v; varmeExtra += v * (i.total - ref.totalMedian);
    }
    p.kwh = pk; p.extra = pe;
    kwh += pk; extra += pe;
  }
  const besked = !dyra.length ? 'lugnt' : extra >= inst.varningKr ? 'draner' : 'svangigt';
  return {
    datum, ref, kvartar: berikade, billiga, dyra, besked,
    kwh, extra, varmeKwh, varmeExtra, delar: forb.delar,
    max: Math.max(...berikade.map((i) => i.total)), min: Math.min(...berikade.map((i) => i.total)),
  };
}

/** "06:00–12:15 och 15:45–20:30" */
export function tiderText(perioder, sep = ' och ') {
  return perioder.map((p) => `${p.franTxt}–${p.tillTxt}`).join(sep);
}

// --------------------------------------------------------------- signalen ----

const nar = (c, idag) => `${K.narOrd(c.klocka, idag)} kl ${c.klocka.txt}`;

/**
 * Ett ord nu. Prövas i ordning:
 *  1. DRA NER     dagens plan säger dra ner och en dyr period återstår
 *  2. VÄNTA       maskinerna (timer) sparar minst 1 kr på att vänta
 *  3. KÖR NU      nu är billigt, eller det blir minst 1 kr dyrare om man väntar
 *  4. SPELAR INGEN ROLL
 * Signalen gäller maskinerna med fördröjd start, den vanligaste frågan. Bastu
 * och ugn har egna svar i orderboken.
 */
export function signal({ planer, berikade, nuMs, idag }) {
  const planIdag = planer.find((p) => p.datum === idag);
  const kvar = (planIdag?.dyra ?? []).filter((p) => p.slutMs > nuMs);
  const aktuellt = berikade.find((i) => i.t0 <= nuMs && nuMs < i.t0 + i.langd * 60e3) ?? berikade[0];
  const maskiner = K.SYSSLOR.filter((s) => s.timer).map((s) => ({ s, r: K.planera(berikade, nuMs, s) })).filter((x) => x.r?.bast);
  const billigaAlla = planer.flatMap((p) => p.billiga);

  if (planIdag?.besked === 'draner' && kvar.length) {
    const pagar = kvar.find((p) => p.startMs <= nuMs);
    return { ord: 'Dra ner', klass: 'draner', aktuellt,
      rad: pagar ? `Dyrt till kl ${pagar.tillTxt}${kvar.length > 1 ? `, sedan igen ${tiderText(kvar.slice(1))}` : ''}.`
        : `Dyrt i dag ${tiderText(kvar)}.` };
  }
  const vanta = maskiner.filter((x) => x.r.sparar >= K.GRANS_KR);
  if (vanta.length) {
    const b = vanta.reduce((a, x) => (x.r.sparar > a.r.sparar ? x : a)).r.bast;
    const per = billigaAlla.find((p) => b.startMs >= p.startMs && b.startMs < p.slutMs);
    const vem = vanta.length === maskiner.length ? 'Maskinerna' : vanta.map((x) => x.s.namn).join(' och ');
    const nar2 = per ? `${K.narOrd(K.lokalKlocka(per.startMs), idag)} ${per.franTxt}–${per.tillTxt}` : nar(b, idag);
    return { ord: 'Vänta', klass: 'vanta', aktuellt, rad: `${vem}: billigast ${nar2}.` };
  }
  const billigNu = billigaAlla.find((p) => p.startMs <= nuMs && nuMs < p.slutMs);
  const undvik = maskiner.map((x) => x.r.undvikFran).filter(Boolean).sort((a, b) => a.startMs - b.startMs)[0];
  if (billigNu || undvik) {
    return { ord: 'Kör nu', klass: 'kor', aktuellt,
      rad: billigNu ? `Billigt till kl ${billigNu.tillTxt}.` : `Starta maskinerna före kl ${undvik.klocka.txt} – sedan blir det dyrare.` };
  }
  return { ord: 'Spelar ingen roll', klass: 'neutral', aktuellt, rad: 'Ingen skillnad värd att planera efter just nu.' };
}

// ------------------------------------------------------------- orderboken ----

/**
 * En rad per syssla, sorterad efter kronor. En rad visas bara när något är värt
 * minst 1 kr – att vänta, eller att inte skjuta upp. Övriga samlas i `ingenRoll`.
 * Varje rad: { id, namn, huvud, detalj[], varde, startMs, paminnelse }.
 */
export function orderbok({ berikade, nuMs, idag, planer, inst }) {
  const rader = [], ingenRoll = [];
  for (const s of K.SYSSLOR) {
    const r = K.planera(berikade, nuMs, s);
    if (!r?.bast) continue;
    const bas = r.nu ?? r.kandidater.find((c) => !s.dagtid || c.dagtid);
    const sparar = bas.kr - r.bast.kr;
    if (sparar >= K.GRANS_KR) {
      const detalj = [];
      let huvud;
      if (s.timer && r.bast.om > 0) {
        huvud = `ställ ${r.bast.om} h → start ${nar(r.bast, idag)}`;
        detalj.push(`${K.kr2(r.bast.kr)} i stället för ${K.kr2(bas.kr)} nu · klar ca ${r.bast.slut.txt}`);
      } else {
        huvud = K.narOrd(r.bast.klocka, idag) === 'i dag' ? `i dag kl ${r.bast.klocka.txt}` : nar(r.bast, idag);
        detalj.push(`${K.kr(r.bast.kr)} i stället för ${K.kr(bas.kr)} ${r.nu ? 'nu' : nar(bas, idag)}`);
      }
      if (r.dagAlt) detalj.push(`Hellre på dagen? ${stor(nar(r.dagAlt, idag))}: ${K.kr2(r.dagAlt.kr)} (${K.tal(Math.max(0, r.dagAlt.kr - r.bast.kr) * 100)} öre mer).`);
      if (!s.timer && r.undvikFran && r.undvikFran.klocka.datum === idag && r.undvikFran.startMs < r.bast.startMs) {
        detalj.push(`Ska det bli i dag: starta före kl ${r.undvikFran.klocka.txt}.`);
      }
      rader.push({ id: s.id, namn: s.namn, huvud, detalj, varde: sparar, startMs: r.bast.startMs, syssla: s, r, typ: 'vanta' });
    } else if (r.undvikFran && r.nu) {
      const varde = r.undvikFran.kr - r.nu.kr;
      rader.push({ id: s.id, namn: s.namn, huvud: `starta före kl ${r.undvikFran.klocka.txt}`,
        detalj: [`${K.kr2(r.nu.kr)} nu, sedan ≈ ${K.kr2(varde)} dyrare`], varde, startMs: r.nu.startMs, syssla: s, r, typ: 'fore' });
    } else {
      ingenRoll.push(s.namn.toLowerCase());
    }
  }
  // Värmen: sänk under de dyraste 3 timmarna av återstående dyra perioder.
  const dyraKvar = planer.flatMap((p) => p.dyra).filter((p) => p.slutMs > nuMs);
  if (dyraKvar.length) {
    const delar = Object.fromEntries(planer.map((p) => [p.datum, p.delar]));
    const v = varmeSankning(dyraKvar, berikade, delar, nuMs);
    if (v && v.sparar >= K.GRANS_KR) {
      rader.push({ id: 'varme', namn: 'Värme', huvud: `sänk 2 grader kl ${v.fran}, höj kl ${v.till}`,
        detalj: [`${v.datum === idag ? 'I dag' : stor(K.dagnamn(v.datum, idag))}. Huset håller värmen några timmar.`], varde: v.sparar, startMs: v.franMs, typ: 'varme' });
    } else ingenRoll.push('sänka värmen');
  }
  rader.sort((a, b) => b.varde - a.varde);
  return { rader: rader.slice(0, 7), ingenRoll, summa: rader.reduce((a, x) => a + x.varde, 0) };
}

const stor = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Värmen på halvfart under de dyraste sammanhängande 3 timmarna, tas igen de 3 timmarna efter (+5 %). */
export function varmeSankning(perioder, berikade, delarPerDatum, nuMs) {
  let bast = null;
  for (const p of perioder) {
    const iv = p.intervall.filter((i) => i.t0 + i.langd * 60e3 > nuMs);
    for (let a = 0; a < iv.length; a++) {
      let kwh = 0, kr = 0, min = 0;
      for (let b = a; b < iv.length && min < 180; b++) {
        const m = Math.min(iv[b].langd, 180 - min);
        min += m;
        const d = delarPerDatum[iv[b].datum];
        if (!d) continue;
        const e = d.varme[iv[b].timme] * 0.5 * m / 60;
        kwh += e; kr += e * iv[b].total;
      }
      if (!bast || kr > bast.kr) bast = { kwh, kr, fran: iv[a], slutMs: Math.max(iv[a].t0, nuMs) + min * 60e3 };
    }
  }
  if (!bast || bast.kwh < 0.3) return null;
  const franMs = Math.max(bast.fran.t0, nuMs);
  const efter = berikade.filter((i) => i.t0 >= bast.slutMs).slice(0, 12);
  if (!efter.length) return null;
  const prisEfter = K.medel(efter.map((i) => i.total));
  return { datum: bast.fran.datum, franMs, fran: K.lokalKlocka(franMs).txt, till: K.lokalKlocka(bast.slutMs).txt,
    kwh: bast.kwh, sparar: bast.kr - bast.kwh * prisEfter * 1.05 };
}

// ------------------------------------------------------ bil och värmepump ----

/**
 * Bilen: billigaste sammanhängande laddfönster kl 22–07 i natt för en dags
 * körning (bilKwhAr / 365 med bilKw), jämfört med att ladda direkt kl 18.
 * ANTAGET – laddboxens schema och bilens behov är inte kända.
 */
export function bilFonster({ berikade, nuMs, idag, inst }) {
  const kwh = inst.bilKwhAr / 365;
  if (!(kwh > 0) || !(inst.bilKw > 0)) return null;
  const timmar = Math.max(0.25, Math.ceil(kwh / inst.bilKw * 4) / 4);
  const s = { id: 'bil', namn: 'Bil', kwh, timmar, timer: false };
  const r = K.planera(berikade, nuMs, s, { maxTimmar: 24 });
  if (!r) return null;
  const natt = r.kandidater.filter((c) => {
    const slutTim = c.slut.timme + c.slut.minut / 60 + (c.slut.datum !== c.klocka.datum ? 24 : 0);
    return (c.klocka.timme >= 22 || c.klocka.timme < 7) && (slutTim <= 7 || (c.klocka.timme >= 22 && slutTim <= 31));
  });
  if (!natt.length) return { saknas: true };
  const bast = natt.reduce((a, b) => (b.kr < a.kr - 1e-9 ? b : a));
  const kl18 = r.kandidater.find((c) => c.klocka.timme === 18 && c.klocka.minut === 0 && c.startMs < bast.startMs);
  return { kwh, bast, txt: `${K.narOrd(bast.klocka, idag)} ${bast.klocka.txt}–${bast.slut.txt}`,
    sparar: kl18 ? kl18.kr - bast.kr : null };
}

/** Den ostyrda värmepumpen under dygnets dyra perioder (beräknat). */
export function varmepumpLage(plan) {
  if (!plan?.dyra.length) return null;
  return { kwh: plan.varmeKwh, husKwh: plan.kwh, extra: plan.varmeExtra, tider: tiderText(plan.dyra) };
}

// ----------------------------------------------------------------- vad-om ----

/** Vad kostar varje syssla om den startas vid `startMs`, jämfört med bästa tid? */
export function vadOm(berikade, nuMs, startMs) {
  return K.SYSSLOR.map((s) => {
    const kr = K.fonsterKostnad(berikade, startMs, s.timmar, s.kwh);
    const r = K.planera(berikade, nuMs, s);
    if (kr === null || !r?.bast) return null;
    return { id: s.id, namn: s.namn, kr, mer: kr - r.bast.kr, bast: r.bast };
  }).filter(Boolean);
}

// ---------------------------------------------------------- egna ordrar ----

/**
 * En egen order: kör `syssla` så att den är klar senast `senastMs`, och bara om
 * priset (medel under körningen, kr/kWh) är högst `maxPris`.
 *  - Är alla priser fram till senast-tiden kända: bästa fönstret (facit).
 *  - Annars: bästa kända fönster om det klarar prisgränsen. Om inte väntar ordern
 *    på nästa dygns priser (kl 13) med bästa kända fönster som reserv.
 * Status: planerad, vantar, dags (starttiden har passerat), for-sent.
 */
export function utvarderaOrder(order, berikade, nuMs) {
  const s = K.SYSSLOR.find((x) => x.id === order.syssla);
  if (!s) return null;
  const langdMs = s.timmar * 3600e3;
  if (order.senastMs - langdMs < nuMs - 15 * 60e3) return { status: 'for-sent', s };
  const sistKand = berikade.length ? berikade[berikade.length - 1] : null;
  const kandSlut = sistKand ? sistKand.t0 + sistKand.langd * 60e3 : 0;
  const maxTimmar = Math.max(0, Math.ceil((order.senastMs - nuMs) / 3600e3));
  const r = K.planera(berikade, nuMs, s, { maxTimmar });
  const tillatna = (r?.kandidater ?? []).filter((c) => c.startMs + langdMs <= order.senastMs && (!s.dagtid || c.dagtid));
  if (!tillatna.length) {
    return kandSlut < order.senastMs ? { status: 'vantar', s, reserv: null, kandSlut } : { status: 'for-sent', s };
  }
  const bast = tillatna.reduce((a, b) => (b.kr < a.kr - 1e-9 ? b : a));
  const prisKwh = bast.kr / s.kwh;
  const nu = r.nu && r.nu.startMs + langdMs <= order.senastMs ? r.nu : null;
  const facit = kandSlut >= order.senastMs;
  if (facit || !Number.isFinite(order.maxPris) || prisKwh <= order.maxPris) {
    return { status: bast.startMs <= nuMs + 60e3 ? 'dags' : 'planerad', s, start: bast, prisKwh, facit, sparar: nu ? nu.kr - bast.kr : null };
  }
  return { status: 'vantar', s, reserv: bast, prisKwh, kandSlut, sparar: nu ? nu.kr - bast.kr : null };
}

// ---------------------------------------------------------- påminnelser ----

/**
 * När och vad en påminnelse ska säga. Maskiner med fördröjd start som ska gå på
 * natten påminns kl 21 kvällen före (då man ställer timern), allt annat 15 min före.
 * null om tiden ligger för nära (< 2 min) eller för långt fram (> 3 dygn, ntfy:s gräns).
 */
export function paminnelse({ namn, startMs, timer, text }, nuMs) {
  const start = K.lokalKlocka(startMs);
  let narMs = startMs - 15 * 60e3;
  let meddelande = text ?? `${namn} kl ${start.txt} – nu är det dags.`;
  if (timer && (start.timme >= 22 || start.timme < 7)) {
    // Påminn kvällen före, senast kl 21, ett helt antal timmar före start – då
    // ger den fördröjda starten exakt rätt tid.
    const kl21 = Date.parse(`${start.timme < 7 ? K.laggTillDagar(start.datum, -1) : start.datum}T21:00:00${offset(startMs)}`);
    const h = Math.ceil((startMs - kl21) / 3600e3);
    const kvall = startMs - h * 3600e3;
    if (h >= 1 && kvall > nuMs + 2 * 60e3) {
      narMs = kvall;
      meddelande = `Ställ ${namn.toLowerCase()} på fördröjd start ${h} h nu (kl ${K.lokalKlocka(kvall).txt}), så startar den kl ${start.txt}.`;
    }
  }
  if (narMs < nuMs + 2 * 60e3 || narMs > nuMs + 3 * 24 * 3600e3) return null;
  return { narMs, nar: K.lokalKlocka(narMs), meddelande };
}

/** Svensk tidszonsförskjutning (+01:00/+02:00) vid tidpunkten. */
function offset(ms) {
  const k = K.lokalKlocka(ms);
  const lokal = Date.UTC(+k.datum.slice(0, 4), +k.datum.slice(5, 7) - 1, +k.datum.slice(8, 10), k.timme, k.minut);
  const min = Math.round((lokal - Math.floor(ms / 60e3) * 60e3) / 60e3);
  return `+${tva(Math.floor(min / 60))}:${tva(min % 60)}`;
}

/** ntfy-meddelande (JSON-publicering) för en påminnelse. sekvens: [-_A-Za-z0-9]{1,64}. */
export function ntfyKropp(amne, sekvens, titel, p, klickUrl) {
  const k = { topic: amne, title: titel, message: p.meddelande, delay: String(Math.floor(p.narMs / 1000)), sequence_id: sekvens, tags: ['alarm_clock'], priority: 3 };
  if (klickUrl) k.click = klickUrl;
  return k;
}

// ------------------------------------------------- journal och positioner ----

/** Summan av det du bockat av en månad: { kr, antal }. journal: { 'datum:id': { kr } } */
export function journalSumma(journal, manad) {
  let kr = 0, antal = 0;
  for (const [k, v] of Object.entries(journal ?? {})) {
    if (k.startsWith(manad) && Number.isFinite(v?.kr)) { kr += v.kr; antal++; }
  }
  return { kr, antal };
}

/**
 * Positioner: vad varje del av förbrukningen betalat per kWh jämfört med dygnets
 * medelpris (tidsvägt) under perioden. Negativt = billigare än snittet.
 * BERÄKNAT med förbrukningsmodellen om inga mätvärden finns.
 */
export function positioner(tim, fran, till, tempFor, inst) {
  const ut = { bil: { kwh: 0, kr: 0, snitt: 0 }, varmvatten: { kwh: 0, kr: 0, snitt: 0 }, hushall: { kwh: 0, kr: 0, snitt: 0 }, varme: { kwh: 0, kr: 0, snitt: 0 } };
  let dygn = 0;
  for (let d = fran; d <= till; d = K.laggTillDagar(d, 1)) {
    const spot = tim[d];
    if (!spot || spot.filter(Number.isFinite).length < 23) continue;
    dygn++;
    const pris = spot.map((s, h) => (Number.isFinite(s) ? K.totalpris(s, d, h, inst) : NaN));
    const snitt = K.medel(pris);
    const f = K.forbrukningDygn(d, tempFor(d), inst, spot);
    for (const del of Object.keys(ut)) {
      for (let h = 0; h < 24; h++) {
        if (!Number.isFinite(pris[h])) continue;
        const e = f.delar[del][h];
        ut[del].kwh += e; ut[del].kr += e * pris[h]; ut[del].snitt += e * snitt;
      }
    }
  }
  for (const v of Object.values(ut)) { v.krKwh = v.kwh ? v.kr / v.kwh : NaN; v.mot = v.kr - v.snitt; }
  return { dygn, delar: ut };
}

/**
 * Prissäkring: senaste perioden med kvartspris mot ett fast elpris (öre/kWh inkl.
 * moms, elhandelns del). Nät och skatt är desamma och tas inte med.
 */
export function jamforFastpris(tim, fran, till, tempFor, inst, fastOre) {
  let kwh = 0, rorligt = 0;
  const manader = {};
  for (let d = fran; d <= till; d = K.laggTillDagar(d, 1)) {
    const spot = tim[d];
    if (!spot || spot.filter(Number.isFinite).length < 23) continue;
    const f = K.forbrukningDygn(d, tempFor(d), inst, spot);
    for (let h = 0; h < 24; h++) {
      if (!Number.isFinite(spot[h])) continue;
      const e = f.total[h], p = (spot[h] + inst.paslagOre / 100) * K.MOMS;
      kwh += e; rorligt += e * p;
      const m = (manader[d.slice(0, 7)] ??= { kwh: 0, kr: 0 });
      m.kwh += e; m.kr += e * p;
    }
  }
  const snitt = Object.values(manader).filter((m) => m.kwh > 0).map((m) => m.kr / m.kwh);
  return { kwh, rorligt, fast: Number.isFinite(fastOre) ? kwh * fastOre / 100 : null,
    manadMin: Math.min(...snitt), manadMax: Math.max(...snitt) };
}
