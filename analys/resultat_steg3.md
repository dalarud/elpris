# Resultat steg 3: ditt hushåll

Genererad av `analys/analys_hushall.py`. Verkliga SE3-priser 2025-10-07 – 2026-10-06. Nätavgifter: Jönköping Energi Nät fr.o.m. 2026-09-01 (inkl. moms). Alla belopp inkl. moms.

**ANTAGEN fördelning av 20 520 kWh:** hushållsel 7 000, rumsvärme 9 000, varmvatten 2 008, laddhybrid 2 500 kWh. Kalibreras mot dina mätvärden om du kan ta fram dem.

## Årskostnad per scenario

| Scenario | kWh | Säkringstariff 20 A | Tidstariff 20 A | Andel kWh i höglast | Billigast |
|---|---|---|---|---|---|
| A. Ingen styrning | 20 551 | 43 052 kr | 42 882 kr | 28% | tid (−171 kr) |
| B. Som idag: laddboxen styr bilen | 20 551 | 41 525 kr | 41 143 kr | 24% | tid (−382 kr) |
| C. + Smart Price på Calibra, försiktig (±30 %) | 20 820 | 39 609 kr | 38 924 kr | 20% | tid (−685 kr) |
| D. + Smart Price, kraftig (±50 %) | 20 864 | 39 196 kr | 38 430 kr | 19% | tid (−766 kr) |
| E. Som D, men styrningen tar hänsyn till tidstariffen | 20 864 | 39 217 kr | 38 387 kr | 18% | tid (−830 kr) |

Tidstariffen lönar sig om mindre än cirka 31 % av förbrukningen ligger vardagar 07–22 nov–mar (den fasta avgiften är 2 304 kr/år högre för 20 A, överföringen 37,84 i stället för 29,29 öre i höglast och 9,21 öre i övrigt).

## Vad varje steg är värt (säkringstariff)

| Steg | Besparing/år |
|---|---|
| A. Ingen styrning → B. Som idag: laddboxen styr bilen | 1 527 kr |
| B. Som idag: laddboxen styr bilen → C. + Smart Price på Calibra, försiktig (±30 %) | 1 916 kr |
| C. + Smart Price på Calibra, försiktig (±30 %) → D. + Smart Price, kraftig (±50 %) | 413 kr |
| Totalt från ostyrt (A) till kraftig styrning (D) | 3 856 kr |
| **Kvar att hämta från idag (B) till C–D** | **1 916 – 2 329 kr** |

## Kostnadsposter, scenario B (som idag), säkringstariff 20 A

| Post | kr/år | Andel |
|---|---|---|
| Spotpris | 19 447 | 47% |
| Påslag + månadsavgift elhandel | 1 616 | 4% |
| Energiskatt | 9 248 | 22% |
| Nätavgift (fast + överföring) | 11 215 | 27% |
| **Summa** | **41 525** | |

### Spotkostnad per del (scenario B)

| Del | kWh | Snittpris spot exkl. moms | Dygnsmedel |
|---|---|---|---|
| Hushållsel | 7 000 | 77,5 öre | 72,9 öre |
| Rumsvärme | 9 000 | 76,7 öre | 72,9 öre |
| Varmvatten | 2 008 | 97,5 öre | 72,9 öre |
| Laddhybrid | 2 544 | 50,0 öre | 72,9 öre |

## Engångsbeslut utan tidsflytt

| Beslut | Besparing/år | Förutsättning |
|---|---|---|
| Huvudsäkring 20 A → 16 A | 1 232 kr | Att huset klarar sig på 16 A (bergvärme + elpatron + laddbox + spis). Måste utredas, kan inte rekommenderas utan mätdata. |
| 1 °C lägre inomhustemperatur (≈ 5 % av värmen) | ≈ 767 kr | Komfort. Rörligt pris per kWh ≈ 1,70 kr. |
| 100 kWh mindre elpatron (direktel i stället för värmepump, COP ≈ 3) | ≈ 114 kr per 100 kWh | Att elpatronen går i onödan, går att se i mätdata. |
| 1 öre/kWh lägre påslag hos elhandlaren | 256 kr | Byte av elavtal. |

