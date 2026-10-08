# Resultat steg 1: vad är tidpunkten värd i kronor?

Genererad av `analys/analys_besparing.py`. Data: elprisetjustnu.se (ENTSO-E), SE3, 2022-11-01 – 2026-10-09. Saknade kvartar (ifyllda med föregående värde): 0.

Alla kronor är **inklusive 25 % moms**. Bara spotpriset varierar över dygnet; påslag, energiskatt och överföringsavgift är lika i alla kvartar (antar nätavgift utan tidsdifferentiering).

## 1. Prisnivå och svängningar per år (spot, öre/kWh exkl. moms)

| År | Medel | Medel dygnsspann (max–min) | Dygn med spann > 1 kr | Dyraste kvart/timme | Billigaste |
|---|---|---|---|---|---|
| 2022 (fr.o.m. 2022-11-01) | 201,1 | 159,8 | 39 av 61 | 725 | -2 |
| 2023 | 59,0 | 74,2 | 105 av 365 | 375 | -69 |
| 2024 | 40,9 | 59,5 | 55 av 366 | 816 | -69 |
| 2025 | 51,2 | 90,2 | 117 av 365 | 571 | -28 |
| 2026 (t.o.m. 2026-10-09) | 76,7 | 108,0 | 144 av 282 | 518 | -16 |

### Månadsmedel senaste två åren (öre/kWh exkl. moms)

| Månad | Medel | Medel dygnsspann |
|---|---|---|
| 2024-10 | 16,5 | 47,7 |
| 2024-11 | 66,9 | 105,1 |
| 2024-12 | 58,3 | 113,4 |
| 2025-01 | 63,5 | 109,8 |
| 2025-02 | 77,0 | 101,0 |
| 2025-03 | 50,9 | 97,9 |
| 2025-04 | 37,5 | 88,4 |
| 2025-05 | 43,0 | 83,9 |
| 2025-06 | 22,8 | 55,4 |
| 2025-07 | 37,0 | 60,0 |
| 2025-08 | 48,6 | 75,3 |
| 2025-09 | 52,3 | 116,2 |
| 2025-10 | 62,8 | 136,1 |
| 2025-11 | 69,7 | 98,4 |
| 2025-12 | 51,7 | 61,2 |
| 2026-01 | 108,5 | 94,7 |
| 2026-02 | 110,2 | 103,8 |
| 2026-03 | 58,7 | 96,7 |
| 2026-04 | 56,1 | 108,4 |
| 2026-05 | 77,0 | 109,8 |
| 2026-06 | 78,0 | 121,7 |
| 2026-07 | 53,6 | 84,5 |
| 2026-08 | 66,7 | 107,4 |
| 2026-09 | 87,3 | 141,6 |
| 2026-10 | 67,5 | 124,7 |

## 2. Vad hade det sparat? Senaste 12 månaderna (2025-10-08 – 2026-10-07, 365 dygn)

### Per tillfälle

| Last | Utan styrning | Bästa tidpunkt | Sparat per gång, medel | Median | Dygn då det sparar < 1 kr | Bästa dygnet |
|---|---|---|---|---|---|---|
| Diskmaskin 1,0 kWh, start 19:00 → billigaste start före 07:00 | 1,23 kr | 0,66 kr | **0,57 kr** | 0,49 kr | 87% | 3,02 kr |
| Laddhybrid 10 kWh, laddar direkt 17:00 → billigaste kvartar före 07:00 | 12,28 kr | 6,27 kr | **6,01 kr** | 4,88 kr | 10% | 41,43 kr |
| Varmvatten 4 kWh/dygn, morgon+kväll → billigaste 2 h (+10 % el) | 4,87 kr | 1,99 kr | **2,89 kr** | 2,71 kr | 13% | 11,64 kr |

### Per år (uppskattning med antagna mängder)

| Last | Antagen användning | Möjlig besparing/år | Kräver |
|---|---|---|---|
| Diskmaskin | 250 körningar | 143 kr | Fördröjd start på maskinen + att veta antal timmar |
| Tvätt + tork | 150 omgångar à 2,8 kWh (samma flyttvärde/kWh som disken) | 240 kr | Fördröjd start; ofta praktiskt svårare |
| Laddhybrid | 250 laddningar à 10 kWh = 2 500 kWh | **1 502 kr** | Schemalagd laddning (bil, laddbox eller app) |
| Varmvatten | 1 460 kWh/år | 1 054 kr | Värmepumpens styrning |
| Rumsvärme, mild modulering (±30 %) | 7 000 kWh/år | 523 kr | Värmepumpens styrning/termostat |
| Rumsvärme, kraftig modulering (±50 %) | 7 000 kWh/år | 871 kr | Värmepumpens styrning + huset måste tåla det |
| **Summa** | | **3 462 – 3 811 kr** | |

Rumsvärmemodellen är grov: den flyttar energi från dygnets dyraste halva till den billigaste utan att modellera husets tröghet, och drar av 5 % extra energi på den flyttade delen för högre förluster och sämre värmefaktor. Se det som en övre rimlighetsgräns för en enkel styrning.

### Räcker en fast timer?

| Last | Optimal styrning sparar | Fast timer sparar | Andel av optimalt | Dygn då timern var sämre än att köra direkt |
|---|---|---|---|---|
| Diskmaskin, alltid start 02:00 | 0,57 kr/gång | 0,54 kr/gång | 94% | 1% |
| Laddhybrid, alltid start 01:00 | 6,01 kr/gång | 5,20 kr/gång | 87% | 11% |

### Besparing per månad (laddhybrid, kr per laddning)

| Månad | Medel | Median | Max |
|---|---|---|---|
| 2025-10 | 8,75 | 8,87 | 41,43 |
| 2025-11 | 7,67 | 6,35 | 30,04 |
| 2025-12 | 5,15 | 4,71 | 14,12 |
| 2026-01 | 7,34 | 6,22 | 16,66 |
| 2026-02 | 6,97 | 5,66 | 21,50 |
| 2026-03 | 6,11 | 5,92 | 16,13 |
| 2026-04 | 3,77 | 2,97 | 9,37 |
| 2026-05 | 3,06 | 3,10 | 6,49 |
| 2026-06 | 4,35 | 3,78 | 11,36 |
| 2026-07 | 2,30 | 1,40 | 8,37 |
| 2026-08 | 5,86 | 5,87 | 11,73 |
| 2026-09 | 10,91 | 12,08 | 21,45 |
| 2026-10 | 8,88 | 11,39 | 14,30 |

### Hur ojämnt fördelad är besparingen?

- De 20 % bästa dygnen står för **45%** av laddhybridens årsbesparing; de 10 bästa dygnen ensamma för 11%.
- Diskmaskinen sparar mindre än 50 öre per körning 52% av dygnen och mer än 3 kr 0% av dygnen.
- Rumsvärme (±50 %): de 20 % bästa dygnen står för 50% av besparingen, de 10 bästa dygnen för 13%. Bästa dygnet: 18,87 kr (2025-11-25).

## 3. Värdet av flexibilitet: öre/kWh (inkl. moms) som sparas när en 2-timmarslast får vänta

| Tänkt start | Får vänta ≤ 3 h | ≤ 6 h | ≤ 12 h | ≤ 24 h |
|---|---|---|---|---|
| 07:00 | 35,5 | 51,3 | 54,5 | 70,2 |
| 12:00 | 4,1 | 5,0 | 19,9 | 29,0 |
| 17:00 | 21,1 | 44,6 | 56,7 | 73,7 |
| 19:00 | 35,9 | 55,0 | 60,3 | 78,6 |
| 22:00 | 19,3 | 23,5 | 34,6 | 44,5 |

## 4. Extrema och lugna dygn (hela perioden)

### De 12 dygn med störst spann

| Dygn | Medel öre | Min öre | Max öre | Laddhybrid sparar | Disk sparar |
|---|---|---|---|---|---|
| 2024-12-12 | 244 | 56 | 816 | 73,65 kr | 3,30 kr |
| 2024-01-05 | 217 | 90 | 589 | 40,02 kr | 1,02 kr |
| 2024-12-11 | 228 | 35 | 509 | 28,86 kr | 0,75 kr |
| 2025-10-14 | 188 | 97 | 571 | 41,43 kr | 3,02 kr |
| 2022-12-13 | 479 | 265 | 725 | 45,12 kr | 2,60 kr |
| 2022-12-06 | 379 | 97 | 521 | 33,13 kr | 2,32 kr |
| 2026-02-19 | 179 | 97 | 518 | 13,70 kr | 0,78 kr |
| 2025-01-20 | 181 | 37 | 454 | 30,60 kr | 1,36 kr |
| 2022-12-12 | 454 | 218 | 623 | 42,49 kr | 2,99 kr |
| 2022-12-14 | 483 | 293 | 643 | 38,81 kr | 2,85 kr |
| 2025-01-15 | 72 | 0 | 349 | 4,08 kr | 0,31 kr |
| 2025-10-01 | 103 | 44 | 383 | 19,61 kr | 1,68 kr |

### Lugna dygn: andel dygn där laddhybriden sparar < 1 kr och disken < 0,25 kr

| År | Laddhybrid < 1 kr | Disk < 0,25 kr |
|---|---|---|
| 2022 | 5% | 21% |
| 2023 | 14% | 43% |
| 2024 | 20% | 55% |
| 2025 | 13% | 29% |
| 2026 | 11% | 21% |

### Laddhybrid: medelbesparing per laddning per år

| År | Medel kr/laddning | × 250 laddningar |
|---|---|---|
| 2022 | 16,58 | 4 145 kr |
| 2023 | 5,55 | 1 387 kr |
| 2024 | 4,25 | 1 062 kr |
| 2025 | 5,82 | 1 456 kr |
| 2026 | 5,69 | 1 422 kr |

## 5. Hela elräkningen: hur stor del går att påverka med tidpunkt? (senaste 12 mån)

ANTAGANDE: hushållsel 5 000 kWh, rumsvärme 7 000 kWh, varmvatten 1 460 kWh, laddhybrid 2 500 kWh = **15 959 kWh/år**. Ostyrd profil (bilen laddar 17:00, varmvatten morgon/kväll).

| Post | Ellevio (26 öre, 20 A) | Vattenfall enkeltariff (44,5 öre, 20 A) | Påverkas av tidpunkt? |
|---|---|---|---|
| Spotpris inkl. moms (snitt 82 öre exkl. moms för denna profil, mot 73 öre rakt medel) | 16 391 kr | 16 391 kr | **Ja** |
| Elhandlarens påslag 4 öre + 49 kr/mån | 1 386 kr | 1 386 kr | Nej |
| Energiskatt 36 öre (45 inkl. moms) | 7 182 kr | 7 182 kr | Nej |
| Överföringsavgift | 4 149 kr | 7 102 kr | Nej (enkeltariff) |
| Fast nätavgift 20 A | 7 080 kr | 8 085 kr | Nej (men säkringsstorleken går att välja) |
| **Summa** | **36 188 kr** | **40 145 kr** | |

- Spotdelen är 45%–41% av räkningen. Resten påverkas inte av när elen används.
- Uppskattad besparing från tidsflytt (3 462–3 811 kr) motsvarar **9%–11% av hela räkningen** och 21%–23% av spotkostnaden.
- Varav vitvaror (disk, tvätt, tork): 383 kr/år.

## 6. Om nätavgiften är tidsdifferentierad (exempel: Vattenfall Eldistribution tidstariff 2026)

Vattenfalls tidstariff: 76,5 öre/kWh vardagar 06–22 i jan–mar och nov–dec, annars 30,5 öre (enkeltariff: 44,5 öre överallt; alla inkl. moms). Helgdagar på vardagar är inte inräknade här (förenkling).

| Last | Värde av att flytta, enkeltariff | Med tidstariff | Skillnad per år |
|---|---|---|---|
| Laddhybrid (kr/laddning) | 6,01 | 7,35 | 336 kr |
| Diskmaskin (kr/körning) | 0,57 | 0,71 | 34 kr |

Tidstariffen gör alltså kvällen ännu dyrare vintertid och förstärker samma beteende som spotpriset belönar. Den ändrar också *när* det är billigast: kl 22 blir ett hårt gränsvärde på vardagar vintertid.

## 7. Laddhybrid: när är bensin billigare än el?

ANTAGANDE: bensin 19 kr/l, 0,65 l/mil i hybridläge, 2,0 kWh/mil på el inkl. laddförluster. Då är el dyrare än bensin först när spotpriset överstiger **4,18 kr/kWh** exkl. moms. Senaste 12 månaderna hände det i 13 av 34944 kvartar. Slutsats: ladda alltid – frågan är bara när.

## 8. Spelar kvartarna någon roll? (sedan 2025-10-01)

- Kvartspriset avviker i snitt 5,4 öre/kWh från sin timmes medelpris.
- Skillnaden mellan dyraste och billigaste kvart inom samma timme är i snitt 16,2 öre; över 10 öre i 47% av timmarna och över 25 öre i 21%.
- Laddhybrid: att välja kvartar i stället för hela timmar sparar ytterligare 0,22 kr per laddning (jämfört med 6,01 kr för hela flytten).

## 9. Hur förutsägbart är dygnsmönstret? (senaste 12 månaderna)

| Timme | 00 | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Medel öre | 62 | 58 | 56 | 55 | 56 | 62 | 76 | 91 | 93 | 82 | 70 | 62 | 57 | 54 | 56 | 62 | 74 | 90 | 102 | 103 | 97 | 87 | 77 | 66 |
| Andel dygn då timmen är billigast | 4% | 5% | 8% | 12% | 8% | 2% | 2% | 0% | 0% | 0% | 1% | 1% | 5% | 18% | 13% | 4% | 1% | 1% | 0% | 0% | 0% | 0% | 0% | 15% |
| Andel dygn då timmen är dyrast | 5% | 0% | 0% | 0% | 0% | 0% | 0% | 9% | 11% | 4% | 1% | 1% | 0% | 0% | 1% | 1% | 3% | 13% | 13% | 17% | 14% | 8% | 0% | 0% |

