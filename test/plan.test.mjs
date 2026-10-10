// Tester för varv 3: dagsplan, signal, orderbok, egna ordrar och påminnelser.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../app/js/kalkyl.js';
import * as P from '../app/js/plan.js';

const inst = { ...K.STANDARD };

function kvartar(datum, spotPerTimme) {
  const ut = [];
  for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 15) {
    const s = `${datum}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+01:00`;
    const t0 = Date.parse(s);
    ut.push({ start: s, slut: new Date(t0 + 15 * 60e3).toISOString(), t0, datum, timme: h, minut: m, langd: 15, spot: spotPerTimme[h] });
  }
  return ut;
}

/** 30 dygn historik med ett vanligt dygnsmönster: billigt mitt på dagen och natten, dyrt morgon och kväll. */
function historik(slutDatum, skala = 1) {
  const form = [0.5, 0.45, 0.4, 0.4, 0.45, 0.6, 0.9, 1.2, 1.2, 1.0, 0.8, 0.6, 0.5, 0.5, 0.55, 0.7, 0.9, 1.3, 1.5, 1.4, 1.1, 0.9, 0.7, 0.6];
  const tim = {};
  for (let i = 1; i <= 30; i++) tim[K.laggTillDagar(slutDatum, -i)] = form.map((x) => x * skala);
  return tim;
}
const TEMP = {};   // ingen uppmätt temperatur → normaltemperatur 7 °C

test('dagsplan: lugnt dygn utan dyr period', () => {
  const tim = historik('2026-01-14');
  const plan = P.dagsplan('2026-01-14', kvartar('2026-01-14', new Array(24).fill(0.6)), tim, TEMP, inst);
  assert.equal(plan.dyra.length, 0);
  assert.equal(plan.besked, 'lugnt');
});

test('dagsplan: kvällstopp ger dyr period; besked efter husets kronor', () => {
  const tim = historik('2026-01-14');
  const spot = new Array(24).fill(0.6); spot[2] = spot[3] = 0.3;
  spot[17] = spot[18] = spot[19] = 1.6;            // lite över 80:e percentilen
  const lugn = P.dagsplan('2026-01-14', kvartar('2026-01-14', spot), tim, TEMP, inst);
  assert.equal(lugn.dyra.length, 1);
  assert.equal(lugn.dyra[0].franTxt, '17:00');
  assert.equal(lugn.dyra[0].tillTxt, '20:00');
  assert.equal(lugn.dyra[0].id, '2026-01-14T17:00');
  assert.equal(lugn.besked, 'svangigt');
  assert.ok(lugn.billiga.some((p) => p.franTxt === '02:00'));

  const spot2 = new Array(24).fill(0.6);
  for (let h = 6; h < 22; h++) spot2[h] = 4.0;     // dyrt hela dagen
  const dyr = P.dagsplan('2026-01-14', kvartar('2026-01-14', spot2), tim, TEMP, inst);
  assert.equal(dyr.besked, 'draner');
  assert.ok(dyr.extra >= inst.varningKr);
});

test('dagsplan: samma plan oavsett när den räknas (referensen är dygnen före)', () => {
  const tim = historik('2026-01-14');
  const spot = new Array(24).fill(0.6); spot[18] = 3;
  const a = P.dagsplan('2026-01-14', kvartar('2026-01-14', spot), tim, TEMP, inst);
  // Senare under dagen finns dagens timpriser också i historiken – planen ska inte ändras.
  const b = P.dagsplan('2026-01-14', kvartar('2026-01-14', spot), { ...tim, '2026-01-14': spot, '2026-01-15': spot }, TEMP, inst);
  assert.deepEqual(a.dyra.map((p) => p.id), b.dyra.map((p) => p.id));
  assert.equal(a.besked, b.besked);
});

test('zonPerioder: korta avbrott slås ihop, korta perioder tas bort', () => {
  const iv = kvartar('2026-01-14', new Array(24).fill(1)).map((i) => ({ ...i, total: i.timme === 10 || (i.timme === 11 && i.minut === 30) ? 3 : 1 }));
  const p = P.zonPerioder(iv, (i) => i.total >= 3, { glapp: 30, minMinuter: 30 });
  assert.equal(p.length, 1);
  assert.equal(p[0].franTxt, '10:00');
  assert.equal(p[0].tillTxt, '11:45');
  assert.equal(P.zonPerioder(iv, (i) => i.total >= 3, { glapp: 0, minMinuter: 30 }).length, 1);  // 11:30-kvarten är för kort
});

function scen(spotIdag, spotImorgon, nuIso) {
  const tim = historik('2026-01-14');
  tim['2026-01-14'] = spotIdag;
  const planer = [P.dagsplan('2026-01-14', kvartar('2026-01-14', spotIdag), tim, TEMP, inst)];
  if (spotImorgon) planer.push(P.dagsplan('2026-01-15', kvartar('2026-01-15', spotImorgon), tim, TEMP, inst));
  const berikade = planer.flatMap((p) => p.kvartar);
  return { planer, berikade, nuMs: Date.parse(nuIso), idag: '2026-01-14', inst };
}

test('signal: VÄNTA när det som är värt mest är att vänta, med tid och timer', () => {
  const idag = new Array(24).fill(1.0);
  const imorgon = new Array(24).fill(1.0); imorgon[1] = imorgon[2] = imorgon[3] = 0.1;
  const sc = scen(idag, imorgon, '2026-01-14T18:00:00+01:00');
  const s = P.signal(sc);
  assert.equal(s.ord, 'Vänta');
  assert.match(s.rad, /i natt kl 0[1-3]:00( \(ställ \d+ h\))?/);
  // Signalen säger aldrig emot orderboken: VÄNTA bara när översta raden är att vänta.
  assert.equal(P.orderbok(sc).rader[0].typ, 'vanta');
});

test('signal: SPELAR INGEN ROLL bara när orderboken är tom', () => {
  const sc = scen(new Array(24).fill(0.8), null, '2026-01-14T14:00:00+01:00');
  assert.equal(P.orderbok(sc).rader.filter((r) => r.r?.nu).length, 0);
  assert.equal(P.signal(sc).ord, 'Spelar ingen roll');
});

test('signal: KÖR NU när det blir dyrt senare och inget är billigare', () => {
  const idag = new Array(24).fill(0.5); idag[17] = idag[18] = idag[19] = 3.0;
  const s = P.signal(scen(idag, null, '2026-01-14T14:00:00+01:00'));
  assert.ok(['Kör nu', 'Dra ner'].includes(s.ord), s.ord);
  const lugn = P.signal(scen(new Array(24).fill(0.8), null, '2026-01-14T14:00:00+01:00'));   // jämnt, nära normalt
  assert.equal(lugn.ord, 'Spelar ingen roll');
});

test('signal: DRA NER på ett dra ner-dygn med dyr period kvar', () => {
  const idag = new Array(24).fill(0.6);
  for (let h = 6; h < 22; h++) idag[h] = 4.0;
  const s = P.signal(scen(idag, null, '2026-01-14T09:00:00+01:00'));
  assert.equal(s.ord, 'Dra ner');
  assert.match(s.rad, /Dyrt till kl 22:00/);
});

test('orderbok: sorterad efter kronor, timer i hela timmar, småsaker samlas', () => {
  const idag = new Array(24).fill(1.0);
  const imorgon = new Array(24).fill(1.0); imorgon[2] = imorgon[3] = imorgon[4] = 0.1; imorgon[11] = imorgon[12] = 0.2;
  const o = P.orderbok(scen(idag, imorgon, '2026-01-14T18:00:00+01:00'));
  assert.ok(o.rader.length >= 3);
  assert.ok(o.rader.every((r, i) => i === 0 || o.rader[i - 1].varde >= r.varde));
  assert.equal(o.rader[0].id, 'bastu');
  const tork = o.rader.find((r) => r.id === 'tork');
  assert.match(tork.huvud, /^ställ \d+ h → start i natt kl 0[2-4]:00$/);
  assert.ok(o.rader.every((r) => r.varde >= K.GRANS_KR));
});

test('orderbok: "starta före" när det blir dyrare senare', () => {
  const idag = new Array(24).fill(0.5); idag[17] = idag[18] = idag[19] = 3.0;
  const o = P.orderbok(scen(idag, null, '2026-01-14T14:00:00+01:00'));
  const bastu = o.rader.find((r) => r.id === 'bastu');
  assert.equal(bastu.typ, 'fore');
  assert.match(bastu.huvud, /starta före kl 1[56]:/);
});

test('egen order: facit när priserna är kända fram till senast-tiden', () => {
  const idag = new Array(24).fill(1.0);
  const imorgon = new Array(24).fill(1.0); imorgon[3] = imorgon[4] = 0.2;
  const sc = scen(idag, imorgon, '2026-01-14T18:00:00+01:00');
  const u = P.utvarderaOrder({ syssla: 'tork', senastMs: Date.parse('2026-01-15T07:00:00+01:00'), maxPris: 0.5 }, sc.berikade, sc.nuMs);
  assert.equal(u.status, 'planerad');
  assert.equal(u.start.klocka.txt, '03:00');
  assert.ok(u.facit);
});

test('egen order: väntar på nästa dygns priser när gränsen inte nås, med reserv', () => {
  const idag = new Array(24).fill(1.0);
  const sc = scen(idag, null, '2026-01-14T09:00:00+01:00');
  const u = P.utvarderaOrder({ syssla: 'tork', senastMs: Date.parse('2026-01-15T07:00:00+01:00'), maxPris: 0.5 }, sc.berikade, sc.nuMs);
  assert.equal(u.status, 'vantar');
  assert.ok(u.reserv);
  const sen = P.utvarderaOrder({ syssla: 'tork', senastMs: Date.parse('2026-01-14T09:30:00+01:00'), maxPris: 9 }, sc.berikade, sc.nuMs);
  assert.equal(sen.status, 'for-sent');
});

test('påminnelse: timer på natten påminns kvällen före med exakt fördröjning', () => {
  const p = P.paminnelse({ namn: 'Tork', startMs: Date.parse('2026-01-15T03:30:00+01:00'), timer: true }, Date.parse('2026-01-14T15:00:00+01:00'));
  assert.equal(p.nar.txt, '21:30');
  assert.match(p.meddelande, /fördröjd start 6 h nu \(kl 21:30\), så startar den kl 03:30/);
  // Kl 20:00 med start 02:00: påminnelsen läggs 21:00, aldrig mitt i natten.
  const sen = P.paminnelse({ namn: 'Tork', startMs: Date.parse('2026-01-15T02:00:00+01:00'), timer: true }, Date.parse('2026-01-14T20:00:07+01:00'));
  assert.equal(sen.nar.txt, '21:00');
  assert.match(sen.meddelande, /ställ 5 h|start 5 h/);
  // Efter kvällstiden finns ingen påminnelse – då ställer man timern direkt.
  assert.equal(P.paminnelse({ namn: 'Tork', startMs: Date.parse('2026-01-15T02:00:00+01:00'), timer: true }, Date.parse('2026-01-14T21:30:00+01:00')), null);
  const b = P.paminnelse({ namn: 'Bastu', bestamd: 'bastun', startMs: Date.parse('2026-01-15T11:15:00+01:00'), timer: false }, Date.parse('2026-01-14T15:00:00+01:00'));
  assert.equal(b.nar.txt, '11:00');
  assert.equal(b.meddelande, 'Bastun kl 11:15 – dags om 15 minuter. Det är den billigaste tiden.');
  // En timermaskin på dagen: ingen "ställ N h" som skulle ge fel starttid.
  const dag = P.paminnelse({ namn: 'Tork', startMs: Date.parse('2026-01-15T13:00:00+01:00'), timer: true }, Date.parse('2026-01-15T09:00:00+01:00'));
  assert.doesNotMatch(dag.meddelande, /ställ|i morgon|nu kostar/);
  assert.equal(P.paminnelse({ namn: 'Bastu', startMs: Date.parse('2026-01-19T11:15:00+01:00') }, Date.parse('2026-01-14T15:00:00+01:00')), null);
  const k = P.ntfyKropp('amne', 'elkollen-2026-01-15-bastu', 'Bastu', b);
  assert.equal(k.delay, String(Math.floor(b.narMs / 1000)));
  assert.match(k.sequence_id, /^[-_A-Za-z0-9]{1,64}$/);
});

test('påminnelse: sommartid ger rätt kvällstid', () => {
  const p = P.paminnelse({ namn: 'Disk', startMs: Date.parse('2026-07-15T02:00:00+02:00'), timer: true }, Date.parse('2026-07-14T12:00:00+02:00'));
  assert.equal(p.nar.txt, '21:00');
});

test('påminnelse och lokalMs: rätt kring bytet till vintertid 25 oktober', () => {
  assert.equal(new Date(P.lokalMs('2026-10-24', '21:00')).toISOString(), '2026-10-24T19:00:00.000Z');
  assert.equal(new Date(P.lokalMs('2026-10-25', '21:00')).toISOString(), '2026-10-25T20:00:00.000Z');
  const p = P.paminnelse({ namn: 'Tork', startMs: Date.parse('2026-10-25T03:30:00+01:00'), timer: true }, Date.parse('2026-10-24T12:00:00+02:00'));
  assert.ok(p.narMs <= P.lokalMs('2026-10-24', '22:00'));
  assert.ok(Number.isNaN(P.lokalMs('2026-10-24', '')));
  assert.match(p.meddelande, /startar den kl 03:30/);
});

test('bilFonster: billigaste laddfönster i natt, jämfört med kl 18', () => {
  const idag = new Array(24).fill(1.0); idag[18] = 2.0;
  const imorgon = new Array(24).fill(1.0); imorgon[3] = imorgon[4] = 0.1;
  const b = P.bilFonster(scen(idag, imorgon, '2026-01-14T15:00:00+01:00'));
  assert.equal(b.bast.klocka.txt, '03:00');
  assert.ok(b.sparar > 0);
});

test('journalSumma: summerar månadens bockar', () => {
  assert.deepEqual(P.journalSumma({ '2026-10-01:tork': { kr: 3 }, '2026-10-02:bastu': { kr: 7.5 }, '2026-09-30:disk': { kr: 1 } }, '2026-10'), { kr: 10.5, antal: 2 });
});

test('bilFonster: efter kl 22 och efter midnatt gäller den pågående natten', () => {
  const idag = new Array(24).fill(1.0); idag[22] = idag[23] = 0.3;
  const imorgon = new Array(24).fill(1.0); imorgon[2] = imorgon[3] = 0.2; imorgon[22] = imorgon[23] = 0.05;
  const sent = P.bilFonster(scen(idag, imorgon, '2026-01-14T22:40:00+01:00'));
  assert.equal(sent.bast.klocka.datum, '2026-01-15');
  assert.equal(sent.bast.klocka.txt, '02:00');            // inte i morgon kväll 22:00
  const natt = P.bilFonster({ ...scen(idag, imorgon, '2026-01-15T00:40:00+01:00'), idag: '2026-01-15' });
  assert.equal(natt.bast.klocka.txt, '02:00');
  // Utan morgondagens priser är natten okänd.
  assert.ok(P.bilFonster(scen(idag, null, '2026-01-14T15:00:00+01:00')).saknas);
});

test('planera: skjuter inte upp ett dygn för en skillnad på några öre', () => {
  const idag = new Array(24).fill(1.0); idag[23] = 0.300;
  const imorgon = new Array(24).fill(1.0); imorgon[0] = imorgon[1] = 0.300; imorgon[20] = imorgon[21] = imorgon[22] = 0.299;
  const sc = scen(idag, imorgon, '2026-01-14T21:00:00+01:00');
  const r = K.planera(sc.berikade, sc.nuMs, K.SYSSLOR.find((s) => s.id === 'tork'));
  assert.ok(r.bast.om < 12, `start om ${r.bast.om} h`);
});

test('egen order: över taket med kända priser sägs ut; bastu utanför sin tid', () => {
  const idag = new Array(24).fill(1.0);
  const imorgon = new Array(24).fill(2.0);
  const sc = scen(idag, imorgon, '2026-01-14T18:00:00+01:00');
  const u = P.utvarderaOrder({ syssla: 'tork', senastMs: Date.parse('2026-01-15T07:00:00+01:00'), maxPris: 0.5 }, sc.berikade, sc.nuMs);
  assert.equal(u.facit, true);
  assert.equal(u.overTak, true);
  const b = P.utvarderaOrder({ syssla: 'bastu', senastMs: Date.parse('2026-01-15T07:00:00+01:00'), maxPris: null }, sc.berikade, Date.parse('2026-01-14T22:00:00+01:00'));
  assert.equal(b.status, 'utanfor-tid');
});

test('vadOm: bastu och ugn utanför sina tider ger inget belopp', () => {
  const sc = scen(new Array(24).fill(1.0), new Array(24).fill(1.0), '2026-01-14T18:00:00+01:00');
  const v = P.vadOm(sc.berikade, sc.nuMs, Date.parse('2026-01-15T02:00:00+01:00'));
  assert.ok(v.find((x) => x.id === 'bastu').utanfor);
  assert.ok(v.find((x) => x.id === 'ugn').utanfor);
  assert.ok(Number.isFinite(v.find((x) => x.id === 'tork').kr));
});

test('signal och orderbok säger aldrig emot varandra (slumpade dygn)', () => {
  let fro = 7;
  const slump = () => ((fro = (fro * 16807) % 2147483647) / 2147483647);
  for (let n = 0; n < 60; n++) {
    const idag = Array.from({ length: 24 }, () => 0.2 + 2.5 * slump());
    const imorgon = Array.from({ length: 24 }, () => 0.2 + 2.5 * slump());
    const h = 8 + Math.floor(slump() * 14);
    const sc = scen(idag, h >= 13 ? imorgon : null, `2026-01-14T${String(h).padStart(2, '0')}:20:00+01:00`);
    const ob = P.orderbok(sc);
    const sig = P.signal({ ...sc, orderbok: ob });
    const rader = ob.rader.filter((r) => r.typ !== 'varme' && r.r?.nu);
    if (sig.ord === 'Spelar ingen roll') assert.equal(rader.length, 0);
    if (sig.ord === 'Kör nu') assert.equal(rader[0].typ, 'fore');
    if (rader.length && sig.ord !== 'Dra ner') assert.notEqual(sig.ord, 'Spelar ingen roll');
  }
});
