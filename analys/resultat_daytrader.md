# Elmarknaden genom en daytraders ögon

Genererad av `analys/daytrader.py`. SE3 kvartspriser 2025-10-08 – 2026-10-09 (367 dygn), uttryckt som **totalpris** kr/kWh (spot + påslag med moms, energiskatt, Jönköping Energis överföring).

## 1. Volatilitet: dygnets kursspann (high − low)

- Medelspann 1,30 kr/kWh, median 1,22. 10 % av dygnen har spann över 2,09 kr, 10 % under 0,57 kr.
- **Volatiliteten klumpar ihop sig**: korrelation mellan dagens och morgondagens spann 0,43. Ett lugnt dygn följs oftast av ett lugnt, ett svängigt av ett svängigt.
- **Prisnivån är trög**: korrelation mellan dagens och morgondagens dygnsmedel 0,65.

| Månad | Medelpris | Medelspann/dygn | Högsta kvart | Lägsta kvart |
|---|---|---|---|---|
| 2025-10 | 1,56 | 1,55 | 7,93 | 0,77 |
| 2025-11 | 1,66 | 1,23 | 5,96 | 0,74 |
| 2025-12 | 1,44 | 0,77 | 3,38 | 0,72 |
| 2026-01 | 2,15 | 1,18 | 5,49 | 0,83 |
| 2026-02 | 2,17 | 1,30 | 7,26 | 0,93 |
| 2026-03 | 1,53 | 1,21 | 3,94 | 0,77 |
| 2026-04 | 1,49 | 1,36 | 3,44 | 0,75 |
| 2026-05 | 1,76 | 1,37 | 3,72 | 0,60 |
| 2026-06 | 1,77 | 1,52 | 4,76 | 0,78 |
| 2026-07 | 1,46 | 1,06 | 2,82 | 0,79 |
| 2026-08 | 1,63 | 1,34 | 4,23 | 0,79 |
| 2026-09 | 1,88 | 1,77 | 6,07 | 0,76 |
| 2026-10 | 1,64 | 1,56 | 3,39 | 0,72 |

## 2. Nivåer: var ligger priset jämfört med senaste 30 dygnen?

En trader bedömer en kurs relativt sitt intervall, inte i absoluta tal. Här: kvartens percentil bland de senaste 30 dygnens kvartar.

- **Köpläge** (≤ 20:e percentilen): 22% av kvartarna, i snitt 1,04 kr/kWh. **Säljläge/avstå** (≥ 80:e): 22% av kvartarna, i snitt 2,55 kr/kWh.
- Köplägen ligger oftast kl 13, 14, 12, 15, 11; säljlägen kl 19, 18, 20, 08, 07.
- 56% av dygnen har minst ett köpläge – det finns nästan alltid ett bra fönster inom det kända dygnet.

## 3. Trend och medelåtergång (dygnsmedel)

- 7-dygnsmedel över 30-dygnsmedel (stigande trend) 41% av dygnen. Att trenden fortsätter nästa vecka stämde 40% av gångerna – ungefär som slantsingling.
- Efter ett dygn i översta tiondelen var nästa dygn i snitt 2,31 kr mot 2,52 kr – **medelåtergång** på 8%.

## 4. Fundamenta: vad driver kursen?

- Korrelation dygnsmedel–vind -0,50, dygnsmedel–temperatur -0,30 (senaste året).
- Svagaste vindkvartilen: medelpris 2,03 kr. Starkaste: 1,38 kr. Vind är den viktigaste 'nyheten' att bevaka; SMHI:s prognos ger 5–10 dygns förvarning.

## 5. Handelsregler: hur bra är enkla regler för en flyttbar last?

En syssla på 2 timmar och 2,5 kWh (t.ex. tork) ska köras en gång per dygn. Beslut kl 18 med kända priser fram till nästa dygns slut (efter kl 13 är morgondagen känd). Kostnad per körning, medel över året:

| Regel | kr/körning | Sparat mot att köra direkt | Andel av bästa möjliga |
|---|---|---|---|
| Kör direkt kl 18 | 5,24 | 0,00 kr | 0% |
| Fast timer kl 02 | 3,82 | 1,42 kr | 68% |
| Limitorder: första 2 h-fönstret under 30-dygnens 25:e percentil | 3,53 | 1,70 kr | 82% |
| Billigaste natt-fönstret 22–07 | 3,55 | 1,68 kr | 81% |
| Bästa fönstret (facit, kända priser) | 3,16 | 2,08 kr | 100% |

Slutsats: med kända priser är 'facit' gratis inom 11–35 timmar. En enkel limitregel tar en stor del av vinsten men inte allt; att köra på bästa kända fönster är bättre än någon tumregel.

## 6. Risk och exponering för hushållet

- Med en vanlig ostyrd dygnsprofil hamnar 15% av förbrukningen i dyraste tiondelen av kvartarna (jämnt fördelat vore 10 %). Det är hushållets **öppna exponering** mot pristopparna.
- Månadsmedelpriset varierade mellan 1,44 och 2,17 kr/kWh senaste året – för 1 700 kWh i en vintermånad är det 1 245 kr i skillnad. Det är **marknadsrisken** som bara ett fastprisavtal (en 'hedge') tar bort.

