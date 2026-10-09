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

test('signal: VÄNTA när maskinerna sparar på att vänta, med nattens billiga period', () => {
  const idag = new Array(24).fill(1.0);
  const imorgon = new Array(24).fill(1.0); imorgon[1] = imorgon[2] = imorgon[3] = 0.1;
  const s = P.signal(scen(idag, imorgon, '2026-01-14T18:00:00+01:00'));
  assert.equal(s.ord, 'Vänta');
  assert.match(s.rad, /billigast i natt 01:00–04:00/);
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
  assert.equal(p.nar.txt, '20:30');
  assert.match(p.meddelande, /fördröjd start 7 h nu \(kl 20:30\), så startar den kl 03:30/);
  const b = P.paminnelse({ namn: 'Bastu', startMs: Date.parse('2026-01-15T11:15:00+01:00'), timer: false }, Date.parse('2026-01-14T15:00:00+01:00'));
  assert.equal(b.nar.txt, '11:00');
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
  assert.ok(p.narMs <= P.lokalMs('2026-10-24', '21:00'));
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
