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
| B6 | 2026-10-08 | Räkna med **Jönköping Energis säkringstariff** (fr.o.m. 2026-09-01) som nuläge och tidstariffen som alternativ. Effektavgiften räknas inte med. | Jönköping Energi tog bort effektavgiften för ≤ 63 A den 1 sept 2026, automatiskt (pressmeddelande 31 mars 2026, prislista). Användarens bild av en effektavgift bygger troligen på fakturor från före september. | Modellera effektavgift. |
| B7 | 2026-10-08 | Föreslå **ingen egen styrning** av värmepump eller laddbox i v1. Guida i stället till inbyggd styrning (Thermia Smart Price, laddboxens prisstyrning) och följ upp den. | Inbyggd styrning är gratis och fångar nästan hela värdet. Egen styrning ger 0–400 kr/år mer, kräver hårdvara och innebär en risk för komforten. | Modbus- eller API-styrning av Calibra (idé D1). *Väntar på avstämning.* |
| B8 | 2026-10-08 | Föreslagen teknik: statisk webbapp på GitHub Pages, gemensam JS-kärna, notiser via GitHub Actions + ntfy. | Ingen server, gratis, testbar. Repot är publikt. | Native app, egen server, Home Assistant. *Väntar på avstämning.* |

## Kända fakta om hushållet (från användaren 2026-10-08)

| Fakta | Värde |
|---|---|
| Nätbolag | Jönköping Energi Nät, idag säkringstariff (432,94 kr/mån + 29,29 öre/kWh inkl. moms) |
| Elhandel | Kvartsprisavtal, byter leverantör ibland (påslag okänt) |
| Värmepump | Thermia Calibra 12 (bergvärme), inte uppkopplad, så Smart Price är inte aktivt |
| Laddhybrid | Laddbox med prisstyrning (märke och inställning okänd) |
| Huvudsäkring / årsförbrukning | 20 A / 20 520 kWh |

## Antaganden (ersätts med verkliga värden efter steg 4)

| # | Antagande | Värde | Påverkar |
|---|---|---|---|
| A0 | Fördelning av 20 520 kWh (steg 3) | Hushåll 7 000, rumsvärme 9 000, varmvatten 2 000, laddhybrid 2 500 | Alla belopp i steg 3 |
| A1 | Laddhybrid, energi från nätet per laddning | 10 kWh (inkl. cirka 10 % laddförluster) | Bilens besparing, i proportion |
| A2 | Laddeffekt | 3,7 kW (1-fas 16 A) | Hur länge laddningen tar och därmed hur billiga timmar som räcker |
| A3 | Laddningar per år; inkoppling och klar | 250 st; in 17:00, klar 07:00 | Bilens årsbesparing |
| A4 | El till rumsvärme (bergvärme), steg 1 | 7 000 kWh/år (steg 3: 9 000), fördelat efter graddagar | Värmens besparing |
| A5 | El till varmvatten, steg 1 | 4 kWh/dygn (steg 3: 5,5), ostyrt morgon och kväll | Varmvattnets besparing (troligen en övre gräns) |
| A6 | Rumsvärmens flyttbarhet | ±30–50 % runt medeleffekten inom dygnet, 5 % energistraff på flyttad del | Värmens besparing (grov modell) |
| A7 | Hushållsel, steg 1 | 5 000 kWh/år (steg 3: 7 000) med typisk kvällsprofil | Elräkningens storlek |
| A8 | Diskmaskin / tvätt / tork | 1,0 / 0,8 / 2,0 kWh per körning; 250 / 150 / 150 körningar per år | Vitvarornas besparing |
| A9 | Elhandlarens påslag | 4 öre/kWh + 49 kr/mån | Elräkningens storlek (inte tidsvärdet) |
| A10 | Bensin | 19 kr/l, 0,65 l/mil i hybridläge; el 2 kWh/mil | Brytpunkt el eller bensin |

## Öppna frågor

| # | Fråga | Varför den spelar roll |
|---|---|---|
| ~~F1~~ | ~~Nätbolag och tariff?~~ **Besvarad:** Jönköping Energi, säkringstariff sedan 1 sept 2026. | |
| ~~F2~~ | ~~Bergvärmepump?~~ **Besvarad:** Thermia Calibra 12, inte uppkopplad. | |
| F3 | *Delvis besvarad:* laddbox med prisstyrning. Märke, inställning och körning per dag är okända. | Avgör om appen kan varna när laddboxen kommer ladda dyrt. |
| ~~F4~~ | ~~Säkring och förbrukning?~~ **Besvarad:** 20 A, 20 520 kWh/år. | |
| F6 | Finns mätvärden per timme/kvart att exportera från Mina sidor? Gamla fakturor med effekt i kW? | Facit, tariffval (A2) och 16 A-utredning (A4) på riktiga data. |
| F7 | Notiser via ntfy eller e-post, bara vid avvikelse eller dagligen? | Notistjänstens utformning. |
| F8 | Är det okej att repot är publikt? | Hosting (GitHub Pages). |
| F5 | Hur kvartspris och månadspris jämförs för en ostyrd profil (hypotes H3). | Avgör om avtalsvalet är rätt för dig. |
