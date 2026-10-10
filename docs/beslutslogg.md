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
| B8 | 2026-10-08 | Teknik: statisk webbapp på GitHub Pages, gemensam JS-kärna, notiser via GitHub Actions + ntfy. | Ingen server, gratis, testbar. Repot är publikt. | Native app, egen server, Home Assistant. |
| B9 | 2026-10-08 | **Ny riktning efter användarens svar:** appen ska ge överblick över elkostnaderna och varna när elen blir dyr. Engångsguiden tas bort ur appen. | Användaren: "Det var inte riktigt det jag tänkte mig." | Engångsguide och besked per maskin (steg 4). |
| B10 | 2026-10-08 | Visa **totalpris** (allt inräknat) och **kronor per dygn för huset**, inte spotpris i öre. | Det är det användaren betalar och det som går att jämföra. | Spotpris (det andra appar visar). |
| B11 | 2026-10-08 | **Prisuppskattning 2–5 dygn fram** med väder från SMHI och en enkel log-linjär modell. Visas inte längre fram än 5 dygn. | Bättre än naiva alternativ till och med 5 dygn, inte efter (resultat_prismodell.md). | Ingen prognos alls; betald prognos; maskininlärningsmodell (svårare att granska och köra i webbläsaren). |
| B12 | 2026-10-08 | Väderhistorik från **SMHI:s stationer**. | Open-Meteo begränsade antalet anrop från utvecklingsmiljön. SMHI har både historik och prognos och tillåter anrop från webbläsaren. | Open-Meteo. |
| B13 | 2026-10-08 | Varna bara när dyra perioder kostar huset **minst 25 kr extra** per dygn (inställbart). | Utan gräns blev det 179 varningsdagar per år; med 25 kr blir det 64 som ändå fångar cirka 75 % av merkostnaden (resultat_varningar.md). | Procentgräns enbart; varna för varje topp. |
| B14 | 2026-10-08 | Notis kl 13 för morgondagen (känt pris) och **förvarning exakt 3 dygn före** (uppskattning). | Varje dyrt dygn får högst två notiser utan att tjänsten behöver komma ihåg vad den skickat. | Notis varje gång prognosen ändras. |
| B15 | 2026-10-08 | Förbrukningen **beräknas** från årsförbrukning och temperatur tills mätvärden laddas upp. Mätvärden läses bara i webbläsaren. | Ger överblick direkt utan integration. Integritet. | Kräva mätvärden innan appen fungerar. |
| B16 | 2026-10-09 | Granska koden före sammanslagning och rätta alla 29 fynd (se 05-forsta-versionen.md). | Sammanslagningen gör appen publik och startar notiserna. | Slå ihop direkt. |
| B17 | 2026-10-09 | Dagens väder = SMHI:s timmätningar för passerade timmar + prognos för resten. Dygn som täcks av färre än 20 timmar används inte i prismodellen. | Modellen är tränad på hela dygns medel. Ett halvt dygn gav 14–18 % fel. | Bara prognos; hoppa över prognosen före kl 13. |
| B18 | 2026-10-09 | Notisens körning väljs utifrån cron-uttrycket, inte klockfönster. Väntar in sena priser i upp till 60 min. | Robust mot GitHubs fördröjningar; exakt en notis per dag. | Klockfönster 13:15–14:35 (gav dubbla eller uteblivna notiser vid fördröjning). |
| B19 | 2026-10-09 | *(Ersatt av B22.)* **Förenklad startvy** i ordningen månadens kostnad, läget nu, Dra ner-läge, När ska jag köra?, dagrad och Mer (hopfällt). | Användaren: "plottrigt … för lite stödjande". Valde själv funktioner och startvy. | Behålla detaljvyerna (prisremsor, långa varningar). |
| B20 | 2026-10-09 | *(Ersatt av B24.)* **När ska jag köra?** prövar start nu och om hela timmar (fördröjd start), bara inom kända priser. Under 1 kr skillnad står det "Kör när det passar dig". Bastu och ugn bara dagtid. | Matchar maskinernas timer, är ärligt när det inte spelar roll och undviker orimliga förslag. | Exakt billigaste kvart; prognospriser. |
| B21 | 2026-10-09 | *(Ersatt av B25.)* **Dra ner-läge** som checklista med kronor per åtgärd. Utfälld vid varningsdygn, annars en hopfälld rad för nästa dyra period. | Ger stöd utan att ta plats de flesta dagar. | Visa alltid; visa bara vid varning (då syns det sällan). |
| B22 | 2026-10-09 | **Varv 3: daytraderns analyssätt** (docs/07-daytrader.md). Startvy: månaden, signalen med zonremsa, orderboken, kommande dagar, Mer. | Användarens uppdrag. Konceptet Order fick bäst betyg av två granskare (30–31 av 40). | Terminal light med kursgraf först; Resultat/P&L först. |
| B23 | 2026-10-09 | **Dagsplanen** låser billigt (≤ 20:e percentilen, ≥ 1 h) och dyrt (≥ 80:e, ≥ 30 min) per dygn mot de 30 dygnen *före*. Beskedet blir lugnt, svängigt eller dra ner (≥ 25 kr över normalt, räknat med normaltemperatur). | Traderns nivåer är relativa. En plan som inte flyttar sig under dagen, och samma besked i appen och notisen. 66 dra ner-dygn per år. | Nivåer som faktor × median (1,4/2,0), rullande 30 dygn (flyttade sig vid midnatt). |
| B24 | 2026-10-09 | **En ordermotor** (`planera`) för allt: timer i hela timmar, övriga i kvartar, högst 24 h, bastu 10–21, ugn 10–20, gräns 1 kr, "starta före X", dagtidsalternativ bara om det är nästan lika billigt. | Granskningen av varv 2: två beräkningar gav olika tider och belopp för samma maskin. | Separat dra ner-beräkning mot periodens medelpris. |
| B25 | 2026-10-09 | **Orderboken** ersätter När ska jag köra? och Dra ner: en lista sorterad efter kronor, och på dra ner-dygn med rubrik, exponering och bockar. Bockar blir en journal ("Flyttat i oktober"). | En lista att agera på i stället för två delar med knappar. | Knapp per syssla; checklista per period. |
| B26 | 2026-10-09 | **Kursvy bakom tryck** och zonremsa med vad-om i startvyn. | Användarens val. | Bara remsa; kursvy direkt på svängiga dygn. |
| B27 | 2026-10-09 | **Påminnelser och egna ordrar.** Påminnelse = schemalagt ntfy-meddelande från webbläsaren (≤ 3 dygn, sekvens-id så att det kan flyttas eller tas bort). Order = syssla + klar senast + pristak (förslag: 25:e percentilen) med bästa kända tid som reserv. | Användarens val. Limitregeln tog 82 % av vinsten i analysen; med kända priser används facit. | Bara notis kl 13:40 (varv 2-läget). |
| B28 | 2026-10-09 | Notisen bygger på dagsplanen och skickas bara på dra ner-dygn. | Samma beräkning i appen och notisen. *(Rättelse 2026-10-10: samma commit ändrade av misstag en korrekt rad så att notisen räknade med 7 °C som normaltemperatur; rättat i B29.)* | — |
| B29 | 2026-10-10 | **Rättningar efter granskningen av varv 3** (36 bekräftade fynd, se 07-daytrader.md §7). Bl.a.: notisen läser temperaturfilen som appen (lasTemp); signalen härleds ur orderboken och tar bara med sysslor som går att köra nu; Dra ner i morgon använder orderbokens beslut och undviker alla kända dyra perioder; påminnelsens text skrivs för när den kommer fram och läggs aldrig kl 22–07; påminnelser flyttas bara vid ≥ 1 h (timer) eller ≥ 30 min ändring; tidigaste start inom max(5 öre, 2 %); bilens fönster i den pågående natten; pristak över facit sägs ut. | Granskarna visade att appen och notisen gav olika besked 16 dygn/år, att påminnelser kunde hamna mitt i natten med fel instruktion och att signalen sa emot orderboken. | — |

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
| A11 | Sysslor (varv 3) | Tvätt 1,0 kWh/2 h, tork 2,5/2, disk 1,0/3 (timer); bastu 7/2 kl 10–21, ugn 1,5/1 kl 10–20 | Orderbokens tider och belopp |
| A12 | Körningar per vecka (efterhandstest) | Tvätt 4, tork 3, disk 5, bastu 1, ugn 4 | Orderbokens värde ≈ 1 160 kr/år |
| A13 | Bilens laddning (orderbokens kontrollrad) | 2 500 kWh/år = 6,8 kWh/natt vid 3,7 kW, kl 22–07 | Laddfönstret som visas |

## Öppna frågor

| # | Fråga | Varför den spelar roll |
|---|---|---|
| ~~F1~~ | ~~Nätbolag och tariff?~~ **Besvarad:** Jönköping Energi, säkringstariff sedan 1 sept 2026. | |
| ~~F2~~ | ~~Bergvärmepump?~~ **Besvarad:** Thermia Calibra 12, inte uppkopplad. | |
| F3 | *Delvis besvarad:* laddbox med prisstyrning. Märke, inställning och körning per dag är okända. | Avgör om appen kan varna när laddboxen kommer ladda dyrt. |
| ~~F4~~ | ~~Säkring och förbrukning?~~ **Besvarad:** 20 A, 20 520 kWh/år. | |
| F6 | Finns mätvärden per timme/kvart att exportera från Mina sidor? Gamla fakturor med effekt i kW? | Facit, tariffval (A2) och 16 A-utredning (A4) på riktiga data. |
| F7 | Notiser via ntfy eller e-post? *(Antaget: ntfy. Bara vid varning, se B13–B14.)* | Notistjänstens utformning. |
| F8 | Är det okej att repot är publikt? *(Antaget: ja, inga personuppgifter i repot.)* | Hosting (GitHub Pages). |
| ~~F9~~ | ~~Får jag slå ihop till `main`?~~ **Besvarad 2026-10-09:** ja. Pages måste slås på av användaren. | |
| F5 | Hur kvartspris och månadspris jämförs för en ostyrd profil (hypotes H3). | Avgör om avtalsvalet är rätt för dig. |
