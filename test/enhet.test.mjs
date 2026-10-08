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
