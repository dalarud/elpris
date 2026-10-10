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
    let pk = 0, pe = 0, vk = 0, ve = 0;
    for (const i of p.intervall) {
      const e = forb.total[i.timme] * i.langd / 60;
      const v = forb.delar.varme[i.timme] * i.langd / 60;
      pk += e; pe += e * (i.total - ref.totalMedian);
      vk += v; ve += v * (i.total - ref.totalMedian);
    }
    Object.assign(p, { kwh: pk, extra: pe, varmeKwh: vk, varmeExtra: ve });
    kwh += pk; extra += pe; varmeKwh += vk; varmeExtra += ve;
  }
  const besked = !dyra.length ? 'lugnt' : extra >= inst.varningKr ? 'draner' : 'svangigt';
  return {
    datum, ref, kvartar: berikade, billiga, dyra, besked,
    kwh, extra, varmeKwh, varmeExtra, delar: forb.delar,
    max: Math.max(...berikade.map((i) => i.total)), min: Math.min(...berikade.map((i) => i.total)),
  };
}

/** "06:00–12:15, 13:00–14:00 och 15:45–20:30" */
export function tiderText(perioder, sep = null) {
  const t = perioder.map((p) => `${p.franTxt}–${p.tillTxt}`);
  if (sep) return t.join(sep);
  return t.length > 1 ? `${t.slice(0, -1).join(', ')} och ${t[t.length - 1]}` : (t[0] ?? '');
}

/** "torken och bastun", "tvätten, torken och disken" */
export function ochLista(ord) {
  return ord.length > 1 ? `${ord.slice(0, -1).join(', ')} och ${ord[ord.length - 1]}` : (ord[0] ?? '');
}

/**
 * Dyra perioder som följer varandra med högst 30 min paus (t.ex. över midnatt)
 * slås ihop till en kedja: { startMs, slutMs, pauser: [{ fran, till }] }.
 */
export function kedjor(perioder) {
  const ut = [];
  for (const p of [...perioder].sort((a, b) => a.startMs - b.startMs)) {
    const k = ut[ut.length - 1];
    if (k && p.startMs - k.slutMs <= 30 * 60e3) {
      if (p.startMs > k.slutMs) k.pauser.push({ fran: K.lokalKlocka(k.slutMs), till: K.lokalKlocka(p.startMs) });
      k.slutMs = Math.max(k.slutMs, p.slutMs);
    } else ut.push({ startMs: p.startMs, slutMs: p.slutMs, pauser: [] });
  }
  return ut;
}

// ------------------------------------------------------------- orderboken ----

const nar = (c, idag) => `${K.narOrd(c.klocka, idag)} kl ${c.klocka.txt}`;
/** "Starta före kl X": avrundat nedåt till hel kvart (timermaskiner prövas från nu, t.ex. 16:46). */
const foreKl = (c) => K.lokalKlocka(Math.floor(c.startMs / 900e3) * 900e3).txt;
const stor = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * En rad per syssla, sorterad efter kronor. En rad visas bara när något är värt
 * minst 1 kr – att vänta (typ 'vanta') eller att inte skjuta upp (typ 'fore').
 * Övriga samlas i `ingenRoll`. Varje rad: { id, namn, huvud, kort, detalj[], varde,
 * startMs, typ, syssla, r }. `kort` är tiden i signalens text ("i natt kl 02:00").
 * `varmeLite`: det finns dyra perioder kvar men att sänka värmen ger under 1 kr.
 */
export function orderbok({ berikade, nuMs, idag, planer }) {
  const rader = [], ingenRoll = [];
  const dyraKvar = planer.flatMap((p) => p.dyra).filter((p) => p.slutMs > nuMs);
  for (const s of K.SYSSLOR) {
    const r = K.planera(berikade, nuMs, s);
    if (!r?.bast) continue;
    const bas = r.nu ?? r.kandidater.find((c) => !s.dagtid || c.dagtid);
    const sparar = bas.kr - r.bast.kr;
    if (sparar >= K.GRANS_KR) {
      const detalj = [];
      let huvud, kort;
      if (s.timer && r.bast.om > 0) {
        huvud = `ställ ${r.bast.om} h → start ${nar(r.bast, idag)}`;
        kort = `${nar(r.bast, idag)} (ställ ${r.bast.om} h)`;
        detalj.push(`${K.kr2(r.bast.kr)} i stället för ${K.kr2(bas.kr)} nu · klar ca ${r.bast.slut.txt}`);
      } else {
        huvud = kort = nar(r.bast, idag);
        detalj.push(`${K.kr(r.bast.kr)} i stället för ${K.kr(bas.kr)} ${r.nu ? 'nu' : nar(bas, idag)}`);
      }
      if (r.dagAlt) detalj.push(`Hellre på dagen? ${stor(nar(r.dagAlt, idag))}: ${K.kr2(r.dagAlt.kr)} (${K.tal(Math.max(0, r.dagAlt.kr - r.bast.kr) * 100)} öre mer).`);
      if (!s.timer && r.undvikFran && r.undvikFran.klocka.datum === idag && r.undvikFran.startMs < r.bast.startMs) {
        detalj.push(`Ska det bli i dag: starta före kl ${foreKl(r.undvikFran)}.`);
      }
      if (K.iPerioder(dyraKvar, r.bast.startMs, r.bast.startMs + s.timmar * 3600e3)) {
        detalj.push('Dyrt även då – men den billigaste tiden inom ett dygn.');
      }
      rader.push({ id: s.id, namn: s.namn, huvud, kort, detalj, varde: sparar, startMs: r.bast.startMs, syssla: s, r, typ: 'vanta' });
    } else if (r.undvikFran && r.nu) {
      const varde = r.undvikFran.kr - r.nu.kr;
      const fore = foreKl(r.undvikFran);
      const detalj = [`${K.kr2(r.nu.kr)} nu · efter kl ${fore} ≈ ${K.kr2(varde)} dyrare`];
      // Den billigaste tiden kan ligga senare (efter den dyra perioden) men vara
      // mindre än 1 kr billigare – säg det i stället för att låtsas att nu är bäst.
      if (r.bast.startMs > r.nu.startMs + 15 * 60e3 && r.nu.kr - r.bast.kr >= 0.25
        && !K.iPerioder(dyraKvar, r.bast.startMs, r.bast.startMs + s.timmar * 3600e3)) {
        detalj.push(`Eller ${nar(r.bast, idag)}${s.timer && r.bast.om > 0 ? ` (ställ ${r.bast.om} h)` : ''}: ${K.kr2(r.bast.kr)}.`);
      }
      rader.push({ id: s.id, namn: s.namn, huvud: `starta före kl ${fore}`, kort: `före kl ${fore}`, detalj, varde, startMs: Math.floor(r.undvikFran.startMs / 900e3) * 900e3, syssla: s, r, typ: 'fore' });
    } else {
      ingenRoll.push(s.bestamd);
    }
  }
  // Värmen: sänk under de dyraste timmarna av återstående dyra perioder (i dag först).
  const planMedKvar = planer.find((p) => p.dyra.some((d) => d.slutMs > nuMs));
  let varmeLite = false;
  if (planMedKvar) {
    const delar = Object.fromEntries(planer.map((p) => [p.datum, p.delar]));
    const v = K.varmeSankning(planMedKvar.dyra.filter((p) => p.slutMs > nuMs), berikade, delar, nuMs);
    if (v && v.sparar >= K.GRANS_KR) {
      const dag = v.datum === idag ? '' : `${K.dagnamn(v.datum, idag)} `;
      rader.push({ id: 'varme', namn: 'Värme', huvud: `sänk 2 grader ${dag}kl ${v.fran.txt}–${v.till.txt}`, kort: `${dag}kl ${v.fran.txt}`,
        detalj: ['Huset håller värmen några timmar. Höj igen efteråt.'], varde: v.sparar, startMs: v.franMs, slutMs: v.slutMs, typ: 'varme' });
    } else varmeLite = true;
  }
  rader.sort((a, b) => b.varde - a.varde);
  return { rader: rader.slice(0, 7), ingenRoll, varmeLite, summa: rader.reduce((a, x) => a + x.varde, 0) };
}

// --------------------------------------------------------------- signalen ----

/**
 * Ett ord nu, härlett ur orderboken så att de aldrig säger emot varandra:
 *  1. DRA NER            dagens plan säger dra ner och en dyr period återstår
 *  2. VÄNTA              den rad som är värd mest är att vänta
 *  3. KÖR NU             den rad som är värd mest är att inte skjuta upp
 *                        (VÄNTA om nu är dyrt och en senare tid är lite billigare)
 *  4. SPELAR INGEN ROLL  ingen rad för något som går att köra nu
 * Bara sysslor som går att köra nu räknas (bastu och ugn utanför sina tider inte).
 */
export function signal({ planer, berikade, nuMs, idag, orderbok: ob = null }) {
  ob ??= orderbok({ berikade, nuMs, idag, planer });
  const planIdag = planer.find((p) => p.datum === idag);
  const kvar = (planIdag?.dyra ?? []).filter((p) => p.slutMs > nuMs);
  const aktuellt = berikade.find((i) => i.t0 <= nuMs && nuMs < i.t0 + i.langd * 60e3) ?? berikade[0];
  const billigNu = planer.flatMap((p) => p.billiga).find((p) => p.startMs <= nuMs && nuMs < p.slutMs);

  if (planIdag?.besked === 'draner' && kvar.length) {
    const k = kedjor(planer.flatMap((p) => p.dyra).filter((p) => p.slutMs > nuMs))[0];
    const slut = K.lokalKlocka(k.slutMs - 1);
    const till = `${slut.datum === idag ? '' : `${K.dagnamn(slut.datum, idag)} `}kl ${K.lokalKlocka(k.slutMs).txt}`;
    const paus = k.pauser.length ? ` (kort paus ${k.pauser.map((x) => `${x.fran.txt}–${x.till.txt}`).join(', ')})` : '';
    const rad = k.startMs <= nuMs ? `Dyrt till ${till}${paus}.` : `Dyrt från kl ${K.lokalKlocka(k.startMs).txt} till ${till}${paus}.`;
    return { ord: 'Dra ner', klass: 'draner', aktuellt, rad };
  }
  // Bara sysslor som går att köra nu styr signalen (bastu kl 23 jämför bara tider i morgon).
  const rader = ob.rader.filter((r) => r.typ !== 'varme' && r.r?.nu);
  if (!rader.length) {
    return { ord: 'Spelar ingen roll', klass: 'neutral', aktuellt,
      rad: billigNu ? `Billigt till kl ${billigNu.tillTxt} – men inget du kan köra nu blir minst 1 kr billigare av att flyttas.`
        : 'Inget du kan köra nu blir minst 1 kr billigare av att vänta eller skynda.' };
  }
  const topp = rader[0];
  if (topp.typ === 'vanta') {
    const vanta = rader.filter((r) => r.typ === 'vanta').slice(0, 2);
    return { ord: 'Vänta', klass: 'vanta', aktuellt, rad: `${vanta.map((r) => `${stor(r.syssla.bestamd)} ${r.kort}`).join(', ')}.` };
  }
  const fore = rader.filter((r) => r.typ === 'fore');
  const forst = fore.reduce((a, r) => (r.startMs < a.startMs ? r : a));
  // Dyrt just nu och en senare tid är (lite) billigare: säg det i stället för "kör nu".
  if (aktuellt?.zon === 'dyr' && topp.r.bast.startMs > topp.r.nu.startMs + 15 * 60e3 && topp.r.bast.kr < topp.r.nu.kr) {
    return { ord: 'Vänta', klass: 'vanta', aktuellt,
      rad: `${stor(topp.syssla.bestamd)}: helst ${nar(topp.r.bast, idag)}, senast före kl ${foreKl(topp.r.undvikFran)} – sedan blir det dyrare.` };
  }
  // Samma tid för alla: "Starta torken och disken före kl 16:00". Olika tider: de två första var för sig.
  const tider = new Set(fore.map((r) => foreKl(r.r.undvikFran)));
  const vad = tider.size === 1
    ? `${ochLista(fore.map((r) => r.syssla.bestamd))} före kl ${foreKl(forst.r.undvikFran)}`
    : ochLista([...fore].sort((a, b) => a.startMs - b.startMs).slice(0, 2).map((r) => `${r.syssla.bestamd} före kl ${foreKl(r.r.undvikFran)}`));
  return { ord: 'Kör nu', klass: 'kor', aktuellt, rad: `Starta ${vad} – sedan blir det dyrare.` };
}

// ------------------------------------------------------ bil och värmepump ----

/**
 * Bilen: billigaste sammanhängande laddfönster i natten som pågår eller kommer
 * (kl 22–07) för en dags körning (bilKwhAr / 365 med bilKw), jämfört med att ladda
 * direkt kl 18. ANTAGET – laddboxens schema och bilens behov är inte kända.
 * { saknas: true } om nattens priser inte är kända än (före kl 13).
 */
export function bilFonster({ berikade, nuMs, inst }) {
  const kwh = inst.bilKwhAr / 365;
  if (!(kwh > 0) || !(inst.bilKw > 0)) return null;
  const timmar = Math.max(0.25, Math.ceil(kwh / inst.bilKw * 4) / 4);
  const k = K.lokalKlocka(nuMs);
  const morgon = k.timme < 7 ? k.datum : K.laggTillDagar(k.datum, 1);
  const nattStart = Math.max(nuMs, lokalMs(K.laggTillDagar(morgon, -1), '22:00'));
  const nattSlut = lokalMs(morgon, '07:00');
  const sista = berikade[berikade.length - 1];
  if (!sista || sista.t0 + sista.langd * 60e3 < nattSlut) return { saknas: true, kwh };
  const r = K.planera(berikade, nuMs, { id: 'bil', namn: 'Bil', kwh, timmar, timer: false }, { maxTimmar: 24 });
  const natt = (r?.kandidater ?? []).filter((c) => c.startMs >= nattStart && c.startMs + timmar * 3600e3 <= nattSlut);
  if (!natt.length) return { saknas: true, kwh };
  const bast = K.billigast(natt);
  const kl18 = r.kandidater.find((c) => c.klocka.timme === 18 && c.klocka.minut === 0 && c.startMs < bast.startMs);
  return { kwh, bast, txt: `${K.narOrd(bast.klocka, k.datum)} ${bast.klocka.txt}–${bast.slut.txt}`,
    sparar: kl18 ? kl18.kr - bast.kr : null };
}

/** Den ostyrda värmepumpen under dygnets dyra perioder som inte passerat än (beräknat). */
export function varmepumpLage(plan, nuMs = -Infinity) {
  const kvar = (plan?.dyra ?? []).filter((p) => p.slutMs > nuMs);
  if (!kvar.length) return null;
  const sum = (f) => kvar.reduce((a, p) => a + f(p), 0);
  return { kwh: sum((p) => p.varmeKwh), husKwh: sum((p) => p.kwh), extra: sum((p) => p.varmeExtra), tider: tiderText(kvar) };
}

// ----------------------------------------------------------------- vad-om ----

/**
 * Vad kostar varje syssla om den startas vid `startMs`, jämfört med bästa tid?
 * `utanfor`: bastu och ugn utanför sina antagna tider (då ges inget belopp).
 */
export function vadOm(berikade, nuMs, startMs) {
  return K.SYSSLOR.map((s) => {
    const r = K.planera(berikade, nuMs, s);
    if (!r?.bast) return null;
    const k = K.lokalKlocka(startMs), slut = K.lokalKlocka(startMs + s.timmar * 3600e3);
    const slutTim = slut.timme + slut.minut / 60 + (slut.datum !== k.datum ? 24 : 0);
    if (s.dagtid && (k.timme < s.fran || slutTim > s.klar)) return { id: s.id, namn: s.namn, utanfor: true, syssla: s };
    const kr = K.fonsterKostnad(berikade, startMs, s.timmar, s.kwh);
    if (kr === null) return null;
    return { id: s.id, namn: s.namn, kr, mer: kr - r.bast.kr, bast: r.bast, syssla: s };
  }).filter(Boolean);
}

// ---------------------------------------------------------- egna ordrar ----

/**
 * En egen order: kör `syssla` så att den är klar senast `senastMs`, helst till högst
 * `maxPris` (medel under körningen, kr/kWh).
 *  - Är alla priser fram till senast-tiden kända körs ordern på bästa tid (facit).
 *    Ligger även den över taket sägs det (overTak) – senast-tiden går före taket.
 *  - Annars: bästa kända fönster om det klarar taket. Om inte väntar ordern på nästa
 *    dygns priser (kl 13) med bästa kända fönster som reserv.
 * Status: planerad, vantar, dags (bästa tid är nu), for-sent, utanfor-tid (bastu och
 * ugn kan inte vara klara före senast-tiden inom sina antagna tider).
 */
export function utvarderaOrder(order, berikade, nuMs) {
  const s = K.SYSSLOR.find((x) => x.id === order.syssla);
  if (!s || !Number.isFinite(order.senastMs)) return null;
  const langdMs = s.timmar * 3600e3;
  if (order.senastMs - langdMs < nuMs - 15 * 60e3) return { status: 'for-sent', s };
  const sistKand = berikade.length ? berikade[berikade.length - 1] : null;
  const kandSlut = sistKand ? sistKand.t0 + sistKand.langd * 60e3 : 0;
  const maxTimmar = Math.max(0, Math.ceil((order.senastMs - nuMs) / 3600e3));
  const r = K.planera(berikade, nuMs, s, { maxTimmar });
  const fore = (r?.kandidater ?? []).filter((c) => c.startMs + langdMs <= order.senastMs);
  const tillatna = fore.filter((c) => !s.dagtid || c.dagtid);
  if (!tillatna.length) {
    if (fore.length && kandSlut >= order.senastMs) return { status: 'utanfor-tid', s };
    return kandSlut < order.senastMs ? { status: 'vantar', s, reserv: null, kandSlut } : { status: 'for-sent', s };
  }
  const bast = K.billigast(tillatna);
  const prisKwh = bast.kr / s.kwh;
  const nu = r.nu && r.nu.startMs + langdMs <= order.senastMs ? r.nu : null;
  const facit = kandSlut >= order.senastMs;
  const harTak = Number.isFinite(order.maxPris) && order.maxPris > 0;
  const overTak = harTak && prisKwh > order.maxPris;
  const sparar = nu ? nu.kr - bast.kr : null;
  if (facit || !overTak) {
    return { status: bast.startMs <= nuMs + 60e3 ? 'dags' : 'planerad', s, start: bast, prisKwh, facit, overTak, sparar };
  }
  return { status: 'vantar', s, reserv: bast, prisKwh, kandSlut, overTak, sparar };
}

// ---------------------------------------------------------- påminnelser ----

/**
 * När och vad en påminnelse ska säga. Texten skrivs för när den kommer fram och
 * innehåller bara absoluta klockslag.
 *  - Maskin med fördröjd start som ska gå på natten (22–07): påminn kvällen före,
 *    senast 21:59, ett helt antal timmar före start – då ger "ställ N h nu" exakt
 *    rätt starttid. Har kvällen redan passerat finns ingen påminnelse (null): ställ
 *    timern nu, raden säger hur.
 *  - Annars 15 min före start ("Bastu kl 12:45 – dags om 15 minuter").
 *  - typ 'fore' (starta före kl X): 30 min före X.  typ 'varme': vid start.
 * null om tiden ligger för nära (< 2 min), är på natten eller längre fram än 3 dygn.
 */
export function paminnelse({ namn, bestamd, startMs, timer, typ = 'vanta', slutMs = null }, nuMs) {
  const start = K.lokalKlocka(startMs);
  const vem = bestamd ?? namn.toLowerCase();
  let narMs, meddelande;
  if (typ === 'varme') {
    narMs = startMs;
    meddelande = `Sänk värmen 2 grader nu${slutMs ? ` och höj igen kl ${K.lokalKlocka(slutMs).txt}` : ''} – huset håller värmen.`;
  } else if (typ === 'fore') {
    narMs = startMs - 30 * 60e3;
    meddelande = `Starta ${vem} före kl ${start.txt} – sedan blir det dyrare.`;
  } else if (timer && (start.timme >= 22 || start.timme < 7)) {
    const kl22 = lokalMs(start.timme < 7 ? K.laggTillDagar(start.datum, -1) : start.datum, '22:00');
    const h = Math.ceil((startMs - kl22 + 1) / 3600e3);
    narMs = startMs - h * 3600e3;
    meddelande = `Ställ ${vem} på fördröjd start ${h} h nu (kl ${K.lokalKlocka(narMs).txt}), så startar den kl ${start.txt}.`;
  } else {
    narMs = startMs - 15 * 60e3;
    meddelande = `${stor(vem)} kl ${start.txt} – dags om 15 minuter. Det är den billigaste tiden.`;
  }
  const n = K.lokalKlocka(narMs);
  if (narMs < nuMs + 2 * 60e3 || narMs > nuMs + 3 * 24 * 3600e3 || n.timme >= 22 || n.timme < 7) return null;
  return { narMs, nar: n, meddelande };
}

/** Tidpunkt (ms) för en svensk lokal tid, t.ex. ('2026-10-24', '21:00'). Rätt även kring sommartidsbytet; NaN om ogiltig. */
export function lokalMs(datum, tid) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum ?? '') || !/^\d{2}:\d{2}$/.test(tid ?? '')) return NaN;
  for (const off of ['+01:00', '+02:00']) {
    const ms = Date.parse(`${datum}T${tid}:00${off}`);
    if (!Number.isFinite(ms)) return NaN;
    const k = K.lokalKlocka(ms);
    if (k.txt === tid && k.datum === datum) return ms;
  }
  return Date.parse(`${datum}T${tid}:00+01:00`);   // tiden finns inte (hoppas över vid sommartid)
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
