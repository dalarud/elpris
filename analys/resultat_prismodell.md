# Prismodell: går det att varna 2–7 dygn i förväg?

Genererad av `analys/prismodell.py`. Träning: mål-dygn 2022-11-09 – 2025-06-23. Test (osett): 2025-07-01 – 2026-10-08.

**Dyr dag** = dygnsmedel minst 150% av medianen för de senaste 30 dygnen (känt när prognosen görs) och minst 0,50 kr/kWh.

| Horisont | Fel (MAE), modell med uppmätt väder | Modell med prognosbrus | Samma som senast kända dygn | Samma som senaste 7 dygnen | Dyra dagar i test | Hittade (brus) | Varningar som stämde (brus) | Naivt (varna om senast kända dygn var dyrt): hittade / stämde |
|---|---|---|---|---|---|---|---|---|
| 2 dygn | 15.6 öre | 18.3 öre | 24.9 öre | 28.0 öre | 100 av 465 | 73 (73%) | 71% av 103 | 57% / 60% |
| 3 dygn | 19.7 öre | 23.4 öre | 35.8 öre | 29.5 öre | 108 av 465 | 58 (54%) | 61% av 95 | 37% / 43% |
| 4 dygn | 20.8 öre | 26.1 öre | 39.3 öre | 30.3 öre | 111 av 465 | 64 (58%) | 60% av 106 | 30% / 35% |
| 5 dygn | 21.3 öre | 28.4 öre | 39.8 öre | 30.9 öre | 116 av 465 | 62 (53%) | 55% av 112 | 32% / 39% |
| 6 dygn | 21.6 öre | 31.6 öre | 38.2 öre | 31.2 öre | 114 av 465 | 59 (52%) | 53% av 111 | 35% / 43% |
| 7 dygn | 22.6 öre | 34.1 öre | 35.8 öre | 31.9 öre | 114 av 465 | 56 (49%) | 44% av 127 | 37% / 45% |

Koefficienter (log-skala) per horisont: konstant, dragning mot veckomedel, effekt per graddag kallare, effekt per m/s mer vind, helgeffekt.

| h | konst | veckomedel | per graddag | per m/s vind | helg |
|---|---|---|---|---|---|
| 2 | -0.009 | +0.185 | +0.040 | -0.105 | -0.227 |
| 3 | -0.016 | +0.326 | +0.050 | -0.108 | -0.229 |
| 4 | -0.017 | +0.339 | +0.053 | -0.108 | -0.245 |
| 5 | -0.016 | +0.317 | +0.056 | -0.108 | -0.244 |
| 6 | -0.012 | +0.245 | +0.059 | -0.107 | -0.232 |
| 7 | -0.012 | +0.254 | +0.060 | -0.106 | -0.218 |

