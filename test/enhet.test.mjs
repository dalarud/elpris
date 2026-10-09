// Enhetstester. Kör: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as K from '../app/js/kalkyl.js';
import { prisprognos } from '../app/js/prognos.js';
import { tolkaMatvarden } from '../app/js/import.js';

const inst = { ...K.STANDARD };

test('totalpris: säkringstariff lägger på moms, påslag, skatt och överföring', () => {
  // 1,00 kr spot: (1,00 + 0,04) * 1,25 + 0,45 + 0,2929
  assert.equal(+K.totalpris(1, '2026-01-14', 18, inst).toFixed(4), +(1.04 * 1.25 + 0.45 + 0.2929).toFixed(4));
});

test('tidstariff: höglast vardagar 07–22 nov–mar, annars låglast', () => {
  const tid = { ...inst, natTariff: 'tid' };
  assert.equal(K.overforingsavgift('2026-01-14', 7, tid), 0.3784);   // onsdag 07
  assert.equal(K.overforingsavgift('2026-01-14', 6, tid), 0.0921);   // före 07
  assert.equal(K.overforingsavgift('2026-01-14', 22, tid), 0.0921);  // 22 och senare
  assert.equal(K.overforingsavgift('2026-01-17', 12, tid), 0.0921);  // lördag
  assert.equal(K.overforingsavgift('2026-04-15', 12, tid), 0.0921);  // april
});

test('förbrukningsmodellen summerar till årsförbrukningen ett normalår', () => {
  // Dygn med 17 - HDD_NORMALAR/365 grader i snitt ger rätt årssumma.
  const t = K.HDD_BAS - K.HDD_NORMALAR / 365;
  const dygn = K.forbrukningDygn('2026-03-01', t, inst).kwh;
  assert.ok(Math.abs(dygn * 365 - inst.arsforbrukning) < 1, `${dygn * 365}`);
});

test('laddboxen modelleras på nattens billigaste timmar', () => {
  const spot = new Array(24).fill(1);
  spot[3] = 0.1; spot[4] = 0.2;
  const f = K.forbrukningDygn('2026-03-01', 0, inst, spot);
  assert.ok(f.delar.bil[3] > 0 && f.delar.bil[4] > 0);
  assert.equal(f.delar.bil[18], 0);
});

function kvartar(datum, spotPerTimme) {
  const ut = [];
  for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 15) {
    const s = `${datum}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+01:00`;
    const e = m === 45 ? `${h === 23 ? K.laggTillDagar(datum, 1) : datum}T${String((h + 1) % 24).padStart(2, '0')}:00:00+01:00` : `${datum}T${String(h).padStart(2, '0')}:${String(m + 15).padStart(2, '0')}:00+01:00`;
    ut.push({ start: s, slut: e, datum, timme: h, minut: m, langd: 15, spot: spotPerTimme[h] });
  }
  return ut;
}

test('dyra perioder hittas, slås ihop över korta glapp och får rätt nivå', () => {
  const spot = new Array(24).fill(0.6);
  spot[17] = 2.0; spot[18] = 2.5; spot[19] = 1.6;      // kvällstopp
  spot[8] = 1.6;                                      // kort morgontopp (1 h)
  const ref = K.referens(new Array(720).fill(0.6), inst);
  const p = K.dyraPerioder(K.berika(kvartar('2026-01-14', spot), ref, inst));
  assert.equal(p.length, 2);
  assert.equal(p[1].franTxt, '17:00');
  assert.equal(p[1].tillTxt, '20:00');
  assert.equal(p[1].niva, 'mycket-dyrt');
  assert.equal(p[0].niva, 'dyrt');
});

test('inga perioder en jämn dag', () => {
  const ref = K.referens(new Array(720).fill(0.6), inst);
  assert.equal(K.dyraPerioder(K.berika(kvartar('2026-01-14', new Array(24).fill(0.65)), ref, inst)).length, 0);
});

test('prisprognosen i JavaScript ger samma svar som Python-modellen', () => {
  const modell = JSON.parse(readFileSync(new URL('../app/modell/prismodell.json', import.meta.url)));
  const vektorer = JSON.parse(readFileSync(new URL('./fixtures/prognos_vektorer.json', import.meta.url)));
  let jamforda = 0;
  for (const v of vektorer) {
    for (const p of prisprognos(modell, v.dygnspris, v.vader, v.senast, v.idag)) {
      const f = v.forvantat[p.datum];
      assert.ok(Math.abs(p.spot - f) < 1e-3, `${v.idag} -> ${p.datum}: ${p.spot} mot ${f}`);
      jamforda++;
    }
  }
  assert.ok(jamforda >= 9, `bara ${jamforda} jämförda`);
});

test('import: semikolon, decimalkomma och timvärden', () => {
  const rader = ['Datum;Tid;Förbrukning (kWh)'];
  for (let h = 0; h < 24; h++) rader.push(`2026-09-01;${String(h).padStart(2, '0')}:00;1,5`);
  const r = tolkaMatvarden(rader.join('\n'));
  assert.equal(r.statistik.antalDygn, 1);
  assert.equal(r.dagar['2026-09-01'].reduce((a, b) => a + b, 0), 36);
  assert.equal(r.statistik.upplosning, 'timme');
});

test('import: från/till-kolumner och kvartsvärden summeras per timme', () => {
  const rader = ['"Från","Till","kWh"'];
  for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 15) {
    rader.push(`2026-09-02 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')},2026-09-02 ${String(h).padStart(2, '0')}:${String(m + 14).padStart(2, '0')},0.25`);
  }
  const r = tolkaMatvarden(rader.join('\n'));
  assert.equal(r.statistik.antalDygn, 1);
  assert.equal(r.dagar['2026-09-02'][5], 1);
  assert.equal(r.statistik.upplosning, 'kvart');
});

test('import: ofullständiga dygn och skräprader ignoreras', () => {
  const r = tolkaMatvarden('hej\n2026-09-03 00:00;1\n2026-09-03 01:00;1\n');
  assert.equal(r.statistik.antalDygn, 0);
});

// ---------------------------------------------------------------------------
// Tester för rättningarna efter granskningen inför sammanslagning.
import { smhiTimmar, dygnFranTimmar, kombineraVader, slaIhopTimmar } from '../app/js/prognos.js';
import { arRattKorning, svenskOffset } from '../tools/notis.mjs';

test('tolkaPriser: intervallets slut tas från nästa start (API:ts 75-minutersintervall vid vintertid)', () => {
  const rader = [
    { time_start: '2025-10-26T02:45:00+02:00', time_end: '2025-10-26T03:00:00+01:00', SEK_per_kWh: 0.1 },
    { time_start: '2025-10-26T02:00:00+01:00', time_end: '2025-10-26T02:15:00+01:00', SEK_per_kWh: 0.2 },
  ];
  const iv = K.tolkaPriser(rader);
  assert.equal(iv[0].langd, 15);
  assert.equal(iv[0].slut, '2025-10-26T02:00:00+01:00');
  assert.equal(iv[1].t0 - iv[0].t0, 15 * 60e3);
});

test('SMHI-prognos: glesa tidssteg interpoleras per timme och ofullständiga dygn räknas', () => {
  const smhi = { timeSeries: [
    { time: '2026-01-10T22:00:00Z', data: { air_temperature: 0, wind_speed: 2 } },   // 23 svensk tid
    { time: '2026-01-11T05:00:00Z', data: { air_temperature: 6, wind_speed: 8 } },   // 06
    { time: '2026-01-11T23:00:00Z', data: { air_temperature: 6, wind_speed: 8 } },   // 00 nästa dygn
  ] };
  const d = dygnFranTimmar(smhiTimmar(smhi));
  assert.equal(d['2026-01-10'].timmarTemp, 1);
  assert.equal(d['2026-01-11'].timmarTemp, 24);
  // Tidsvägt: 00–05 stiger linjärt från ~0,86 till ~5,1, därefter 6 resten av dygnet.
  assert.ok(d['2026-01-11'].temp > 4.9 && d['2026-01-11'].temp < 5.3, String(d['2026-01-11'].temp));
  // Ett dygn med bara 1 timme tas inte med i modellens väder.
  const v = kombineraVader([d], [d]);
  assert.ok(!v['2026-01-10'] && v['2026-01-11']);
});

test('SMHI: uppmätta timmar fyller dagens passerade timmar', () => {
  const prognos = { '2026-01-11 12': { temp: 1, vind: 1 } };
  const obs = Object.fromEntries(Array.from({ length: 12 }, (_, h) => [`2026-01-11 ${String(h).padStart(2, '0')}`, { temp: 3 }]));
  const d = dygnFranTimmar(slaIhopTimmar(prognos, obs));
  assert.equal(d['2026-01-11'].timmarTemp, 13);
});

test('tidstariff: normalpris räknas med den avgift som gällde timmen, så normalt pris ger ingen merkostnad', () => {
  const tid = { ...inst, natTariff: 'tid' };
  const tim = {};
  for (let d = '2026-07-01'; d <= '2026-07-30'; d = K.laggTillDagar(d, 1)) tim[d] = new Array(24).fill(0.3);
  const ref = K.referens(K.posterFranTimpriser(tim, '2026-07-01', '2026-07-30'), tid);
  assert.ok(Math.abs(ref.totalMedian - K.totalpris(0.3, '2026-07-15', 12, tid)) < 1e-9);
  // Kvällstopp 2,6 x median en sommardag ska bli en dyr period även med tidstariff.
  const spot = new Array(24).fill(0.3); spot[18] = spot[19] = spot[20] = 0.78;
  assert.equal(K.dyraPerioder(K.berika(kvartar('2026-07-15', spot), ref, tid)).length, 1);
});

test('dygnskostnad: elhandelns månadsavgift redovisas som elpris och den saknade sommartidstimmen kostar inget', () => {
  const spot = new Array(24).fill(0.5); spot[2] = null;
  const k = K.dygnskostnad('2026-03-29', spot, 5, { ...inst, paslagOre: 0 });
  assert.equal(k.kwhTim[2], 0);
  const noll = K.dygnskostnad('2026-03-29', new Array(24).fill(0), 5, { ...inst, paslagOre: 0 }, new Array(24).fill(0));
  assert.ok(Math.abs(noll.delar.elpris - inst.handelKrManad * 12 / 365) < 1e-9);
  assert.ok(Math.abs(noll.delar.natavgift - inst.natFastKrManad.sakring * 12 / 365) < 1e-9);
});

test('period som slutar vid midnatt visas som 24:00', () => {
  const spot = new Array(24).fill(0.3); spot[22] = spot[23] = 2;
  const ref = K.referens(new Array(720).fill(0.3), inst);
  const p = K.dyraPerioder(K.berika(kvartar('2026-01-14', spot), ref, inst));
  assert.equal(p[0].tillTxt, '24:00');
});

test('prognos före kl 13: ingen horisont längre än 5 dygn', () => {
  const modell = JSON.parse(readFileSync(new URL('../app/modell/prismodell.json', import.meta.url)));
  const v = JSON.parse(readFileSync(new URL('./fixtures/prognos_vektorer.json', import.meta.url)))[0];
  // Låtsas att morgondagens priser saknas: senast = idag = v.senast
  const vader = { ...v.vader, [v.senast]: v.vader[v.senast] };
  const p = prisprognos(modell, v.dygnspris, vader, v.senast, v.senast);
  assert.ok(p.length > 0 && p.every((x) => x.horisont <= 5), JSON.stringify(p.map((x) => x.horisont)));
});

test('notis: rätt schemalagd körning skickar, sommar- och vintertid', () => {
  const sommar = new Date('2026-07-01T11:45:00Z'), vinter = new Date('2026-01-14T12:45:00Z');
  assert.equal(svenskOffset(sommar), 'GMT+2');
  assert.equal(arRattKorning('40 11 * * *', sommar), true);
  assert.equal(arRattKorning('40 12 * * *', sommar), false);
  assert.equal(arRattKorning('40 12 * * *', vinter), true);
  assert.equal(arRattKorning('40 11 * * *', vinter), false);
  // Omställningsdagarna (sker kl 01 UTC, före körningarna)
  assert.equal(arRattKorning('40 11 * * *', new Date('2026-03-29T11:40:00Z')), true);
  assert.equal(arRattKorning('40 12 * * *', new Date('2026-10-25T12:40:00Z')), true);
});

test('fyllLuckor: saknade mätningar för dagens tidiga timmar fylls så att dygnet räknas', async () => {
  const { fyllLuckor } = await import('../app/js/prognos.js');
  const prognos = {};
  for (let h = 8; h < 24; h++) prognos[`2026-01-11 ${String(h).padStart(2, '0')}`] = { temp: h, vind: 5 };
  const d = dygnFranTimmar(fyllLuckor(prognos, '2026-01-11'));
  assert.equal(d['2026-01-11'].timmarTemp, 24);
  assert.equal(d['2026-01-11'].timmarVind, 24);
});
