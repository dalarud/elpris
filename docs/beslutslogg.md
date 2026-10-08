# Beslutslogg och antaganden

Här samlas beslut (B), antaganden (A) och öppna frågor (F) i den ordning de uppstår, så att det går att följa resonemanget.

## Beslut

| # | Datum | Beslut | Varför | Alternativ som valdes bort |
|---|---|---|---|---|
| B1 | 2026-10-08 | Prisdata hämtas från **elprisetjustnu.se**. | Gratis, ingen nyckel, kvartspriser sedan 2025-10-01, historik från november 2022. Testat: 1 439 dygn utan luckor. | ENTSO-E (kräver token, används som reserv). Nord Pool (API kommersiellt). |
| B2 | 2026-10-08 | Huvudanalysen görs på **senaste 12 månaderna** (2025-10-08 – 2026-10-07). Extremdygn och årsjämförelser på hela perioden sedan 2022-11. | De 12 senaste månaderna speglar dagens marknad (kvartspriser, nuvarande skatt) och innehåller en hel vinter. | Kalenderår (2026 är inte slut). |
| B3 | 2026-10-08 | Värdet av att flytta förbrukning räknas som **skillnad i spotpris × 1,25**. | Påslag, energiskatt och överföring är lika i alla kvartar vid nätavgift utan tidsdifferentiering och tar ut varandra. | Hela kWh-priset (ger samma differens men döljer logiken). |
| B4 | 2026-10-08 | Tidstariff och effektavgift hanteras som **scenario** tills nätbolaget är känt. | Utredningen visar att det beror helt på nätbolag. | — |
| B5 | 2026-10-08 | Analysskripten skrivs i Python (pandas) och prisdatat checkas in i `data/`. | Gör beräkningarna reproducerbara och möjliga att återanvända för utvärderingen i steg 6. | Bara länka till källan (riskerar att data ändras eller försvinner). |

## Antaganden (ersätts med verkliga värden efter steg 4)

| # | Antagande | Värde | Påverkar |
|---|---|---|---|
| A1 | Laddhybrid, energi från nätet per laddning | 10 kWh (inkl. cirka 10 % laddförluster) | Bilens besparing, i proportion |
| A2 | Laddeffekt | 3,7 kW (1-fas 16 A) | Hur länge laddningen tar och därmed hur billiga timmar som räcker |
| A3 | Laddningar per år; inkoppling och klar | 250 st; in 17:00, klar 07:00 | Bilens årsbesparing |
| A4 | El till rumsvärme (bergvärme) | 7 000 kWh/år, fördelat efter graddagar | Värmens besparing |
| A5 | El till varmvatten | 4 kWh/dygn, ostyrt morgon och kväll | Varmvattnets besparing (troligen en övre gräns) |
| A6 | Rumsvärmens flyttbarhet | ±30–50 % runt medeleffekten inom dygnet, 5 % energistraff på flyttad del | Värmens besparing (grov modell) |
| A7 | Hushållsel | 5 000 kWh/år med typisk kvällsprofil | Elräkningens storlek |
| A8 | Diskmaskin / tvätt / tork | 1,0 / 0,8 / 2,0 kWh per körning; 250 / 150 / 150 körningar per år | Vitvarornas besparing |
| A9 | Elhandlarens påslag | 4 öre/kWh + 49 kr/mån | Elräkningens storlek (inte tidsvärdet) |
| A10 | Bensin | 19 kr/l, 0,65 l/mil i hybridläge; el 2 kWh/mil | Brytpunkt el eller bensin |

## Öppna frågor

| # | Fråga | Varför den spelar roll |
|---|---|---|
| F1 | Vilket nätbolag och vilken tariff (enkel, tid eller effekt)? | Ändrar var de billiga timmarna ligger och hur mycket styrning är värd. |
| F2 | Bergvärmepumpens märke, modell, uppkoppling och nuvarande inställningar? | Avgör om och hur den kan styras eller följas upp. |
| F3 | Laddhybridens modell och laddeffekt; laddbox eller vägguttag; körning per dag? | Avgör bilens besparing och om laddningen kan automatiseras. |
| F4 | Huvudsäkring och årsförbrukning? | Engångsbesparingar (säkring) och kalibrering av modellen. |
| F5 | Hur kvartspris och månadspris jämförs för en ostyrd profil (hypotes H3). | Avgör om avtalsvalet är rätt för dig. |
