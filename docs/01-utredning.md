# Steg 1 – Utredning: elmarknaden för ett hushåll i SE3, hösten 2026

*Skriven 8 oktober 2026. Fakta är kontrollerade mot källor från 2025–2026 (se källförteckningen sist). Egna beräkningar bygger på verkliga SE3-priser 2022-11-01 – 2026-10-09 och finns i [`analys/resultat_steg1.md`](../analys/resultat_steg1.md). Där jag har fått anta något om ditt hushåll står det **ANTAGANDE**.*

---

## Sammanfattning

1. **Bara en del av elpriset varierar över dygnet.** Av en typisk villaräkning på 36 000–40 000 kr/år är det spotpriset (cirka 41–45 %) som beror på *när* du använder el. Energiskatt, överföringsavgift, påslag och fasta avgifter är lika stora oavsett tidpunkt.
2. **Det rör sig om ungefär 3 500 kr/år för ett hushåll som ditt** (uppskattning, senaste 12 månaderna), alltså cirka 9–11 % av räkningen. Nästan allt kommer från laddhybriden (cirka 1 500 kr) och bergvärmen (varmvatten cirka 1 000 kr, rumsvärme 500–900 kr). **Disk, tvätt och tork ger tillsammans bara cirka 400 kr/år.**
3. **Dygnsmönstret är förutsägbart.** Det är dyrt kl 07–09 och kl 17–21 och billigt på natten och mitt på dagen. En fast timer (bilen alltid kl 01, disken alltid kl 02) gav 87–94 % av den optimala besparingen. Problemet är alltså mindre brist på prognoser än man kan tro.
4. **Kvartspriserna ändrar nästan ingenting i praktiken.** Att välja rätt kvart i stället för rätt timme gav 0,22 kr extra per billaddning. Det räcker att tänka i timmar.
5. **Effektavgifterna är på väg bort, inte på väg in.** Kravet på att alla nätbolag skulle införa effektavgift senast 2027 slopades i mars 2026. Ellevio och Mälarenergi har redan tagit bort sina. Vad som gäller för dig beror på ditt nätbolag, och det kan ändra var de billiga timmarna ligger.
6. **Det mesta av besparingen kräver automatik, inte information.** Bergvärmepumpar och laddboxar har ofta inbyggd spotprisstyrning. Det som saknas på marknaden är något som säger *vad det är värt för just dig, i kronor*, kontrollerar att automatiken faktiskt fungerar och är ärligt om när det inte spelar någon roll.

---

## 1. Vad du betalar för, och vad som varierar över dygnet

| Del av priset | Nivå 2026 | Varierar över dygnet? | Kommentar |
|---|---|---|---|
| **Spotpris** (Nord Pool, elområde SE3) | Snitt 76,7 öre/kWh exkl. moms hittills 2026 (egen beräkning). Dygnsspannet var i snitt 108 öre. | **Ja, per kvart** | Sätts dagen före i den gemensamma europeiska day-ahead-auktionen (SDAC). Sedan 1 oktober 2025 per kvart (96 priser/dygn). Morgondagens priser kommer tidigast kl 13. |
| Elhandlarens påslag och månadsavgift | Vanligen 0–8 öre/kWh och 0–69 kr/mån | Nej | Exempel 2026: Greenely 0 öre + 69 kr/mån, Fortum 3,9 öre + 69 kr, Tibber 7,5 öre + 49 kr. |
| **Energiskatt** | **36,0 öre/kWh** exkl. moms (45 öre inkl. moms) | Nej | Sänkt från 43,9 öre den 1 januari 2026. |
| Överföringsavgift (nätbolaget) | Exempel: Ellevio 26 öre, Vattenfall 44,5 öre (inkl. moms) | **Bara med tidstariff eller effektavgift** | Beror på nätbolag, inte elområde. Se avsnitt 2. |
| Fast nätavgift | Exempel 20 A: Ellevio 7 080 kr/år, Vattenfall 8 085 kr/år (inkl. moms) | Nej | Styrs av huvudsäkringens storlek. |
| Moms | 25 % på allt | — | En skillnad i spotpris på 1 kr blir 1,25 kr på räkningen. |

**Konsekvens:** När man jämför två tidpunkter tar alla fasta delar ut varandra. Värdet av att flytta en kWh är *skillnaden i spotpris × 1,25*, plus skillnaden i nätavgift om nätbolaget har tidsdifferentierad tariff.

### Kvartspris och mätning
- Alla elkunder ska sedan 1 januari 2025 ha en mätare som mäter per kvart. Övergångsregeln som tillät timmätning gäller inte längre (Ei).
- Med kvartsprisavtal betalar du varje kvarts förbrukning till den kvartens spotpris. Kvartspris har blivit standard för rörliga avtal under 2026.
- Ett kvartsprisavtal lönar sig bara om förbrukningen läggs bort från topparna. Med en ostyrd profil (bilen laddar när du kommer hem, varmvattnet värms morgon och kväll) betalade ett hus som ditt i snitt **82 öre** per kWh mot dygnsmedlets **73 öre** senaste året (egen beräkning, ANTAGEN lastprofil). Det är den skillnaden, och lite till, som styrning ska ta bort.

---

## 2. Regler som har ändrats eller är på väg att ändras

| När | Vad | Vad det betyder för dig |
|---|---|---|
| 1 okt 2025 | Day-ahead-marknaden gick över till kvartspriser (15 min). | Fler prisvärden, men i praktiken liten skillnad mot timpriser (se avsnitt 5). |
| 1 jan 2026 | Energiskatten sänktes till 36,0 öre/kWh. | Lägre fast del gör spotprisets svängningar relativt viktigare. |
| Jan–feb 2026 | Tillfälligt elstöd: 26 öre/kWh i SE3 för förbrukningen i januari–februari, utbetalt från juni 2026. | Engångsstöd som inte påverkar *när* du ska använda el. |
| 2026 | Högkostnadsskydd: aktiveras om ett elområdes månadsmedel överstiger 1,50 kr/kWh. Vilande. | Bedöms osannolikt att utlösas. Påverkar inte tidpunktsbeslut. |
| 12–13 mars 2026 | Regeringen slopade kravet att alla nätbolag ska ha **effektavgift** senast 1 jan 2027. Ei upphävde föreskrifterna (EIFS 2022:1) i juni 2026. | Effektavgifter är fortfarande tillåtna men inte längre tvingande. |
| 1 juni 2026 | **Ellevio** tog bort effektavgiften: fast avgift efter säkring + 26 öre/kWh, utan tidsdifferentiering. | Kunder hos Ellevio har ingen nätavgift som beror på tid. |
| 1 juli 2026 | **Mälarenergi Elnät** återgick till en modell utan effektavgift för 16–63 A. | Samma som ovan. |
| 2026 | **E.ON** och **Vattenfall Eldistribution** pausade sina planerade införanden. Vattenfall har kvar en valbar **tidstariff** (76,5 öre vardagar 06–22 nov–mar, annars 30,5 öre). **Göteborg Energi** har kvar effektavgift för villor men stoppade den tidsindelade modellen. | **Ditt nätbolag avgör** om kväll och vinter blir ännu dyrare för dig. |
| Senast 12 april 2027 | Ei ska föreslå en ny modell för effektavgifter. | Effektavgifter kan komma tillbaka i ny form 2028 eller senare. En app bör kunna hantera nätavgift som en utbytbar del. |
| 1 jan 2027 | Ei:s nya föreskrift om hur nätbolag ska informera om sina avgifter (EIFS 2026:8) börjar gälla. | Tydligare fakturor. Kan göra det lättare att läsa in tariffer. |
| 1 jan 2027 (förslag) | Slopad indexering, energiskatt 36,0 öre även 2027. Remitterat i mars 2026. | Inte beslutat. Valet hölls 13 sept 2026 och regeringsbildningen pågår (8 okt). Budgeten för 2027 kan ändras. |
| Vintern 2026/27 | Svenska kraftnät räknar med risk för effektbrist. Flera kärnreaktorer står för revision under hösten (Ringhals 3 till 31 okt, Ringhals 4 till 15 okt, Forsmark 1 åter cirka 17 nov). Prognoser för SE3 i Q4 ligger på 100–115 öre/kWh. | Fler dygn med stora prisspann, alltså mer att vinna på styrning, och fler extremdagar att varna för. |

> **Osäkerhet:** Nätbolagens tariffer ändras snabbt just nu. Uppgifterna ovan kommer från pressmeddelanden och prislistor april–juli 2026. Det som gäller din adress måste kontrolleras mot din faktura.

---

## 3. Prisbilden i SE3

Egna beräkningar på spotpriset (öre/kWh exkl. moms, se [resultat](../analys/resultat_steg1.md) avsnitt 1):

| År | Medel | Medel dygnsspann | Dygn med spann > 1 kr |
|---|---|---|---|
| 2023 | 59,0 | 74 | 105 av 365 |
| 2024 | 40,9 | 60 | 55 av 366 |
| 2025 | 51,2 | 90 | 117 av 365 |
| 2026 (t.o.m. 9 okt) | 76,7 | 108 | 144 av 282 |

- **2026 är både dyrare och mer svängigt än tidigare år.** Januari–februari låg på cirka 110 öre i månadsmedel. September 2026 hade det största genomsnittliga dygnsspannet på två år (142 öre).
- **Mönstret är stabilt** (senaste 12 månaderna). Medelpriset är högst kl 18–19 (102–103 öre) och kl 07–08 (91–93 öre). Det är lägst kl 02–04 (55–56 öre) och kl 13–14 (54–56 öre). Den dyraste timmen låg mellan 17 och 21 på 65 % av dygnen. Den billigaste låg antingen på natten eller mitt på dagen.
- **Extremdygn finns, men de är få.** Exempelvis 12 december 2024 (max 8,16 kr), 14 oktober 2025 (max 5,71 kr) och 19 februari 2026 (max 5,18 kr). Priserna publiceras kl 13 dagen före. Det ger 11 timmars förvarning innan dygnet börjar och drygt ett dygn före kvällstoppen.

---

## 4. Datakällor

| Behov | Källa | Kostnad/villkor | Upplösning och fördröjning | Bedömning |
|---|---|---|---|---|
| Spotpris idag och imorgon | **elprisetjustnu.se API** (data från ENTSO-E) | Gratis, ingen nyckel. Be om källhänvisning. | Kvart sedan 2025-10-01 (timme innan). Från november 2022. Morgondagen tidigast kl 13. | **Förstahandsval.** Testad: 1 439 dygn utan luckor. |
| Spotpris, reserv och mer marknadsdata | ENTSO-E Transparency Platform | Gratis med token | Kvart. Även last- och vindprognoser. | Bra reserv och underlag för egna prognoser. |
| Officiellt spotpris | Nord Pool Data Portal | Webbvisning gratis, API kommersiellt | Kvart | Referens för kontroll. |
| Prognos längre än i morgon | Inga fria officiella. Tibber har en textprognos i appen. SMHI och Montel säljer produktionsprognoser. | Mest betaltjänster | — | Svagt fält. Egen prognos går att bygga men blir en *uppskattning*. |
| Egen förbrukning (i efterhand) | Nätbolagets "Mina sidor" eller elhandlarens app | Gratis | Kvart, normalt dagen efter | Bra för uppföljning. Ingen gemensam svensk datahubb finns i drift enligt det jag har hittat. |
| Egen förbrukning (realtid) | Elmätarens **HAN/P1-port** med läsare (t.ex. Tibber Pulse, Homey Energy Dongle eller öppna P1-läsare) | Läsare cirka 400–1 000 kr. Nätbolaget måste aktivera porten. | Sekunder | Möjliggör "vad drar huset just nu" och kontroll av att styrningen fungerar. |
| Styra bergvärmepump | Tillverkarens moln: NIBE **myUplink** (öppet API med OAuth), Thermia Online, CTC/IVT via egna appar | Gratis till premium | — | Kräver modellkännedom. Ofta finns inbyggd spotstyrning redan. |
| Styra laddning | Bilens app eller API, laddboxens API (Easee, Zaptec), Monta (stöder många boxar, spotpris per kvart eller timme), Enode (kommersiellt aggregat) | Varierar | — | Beror på vilken bil och laddbox du har. |
| Väder (värmebehov, prisdrivare) | SMHI öppna data, Open-Meteo | Gratis | Timme | Användbart för värmebehov och grov prisprognos. |
| Nätavgifter | Nätbolagens prislistor (pdf/webb) | Gratis | — | Inget gemensamt API. Läggs in manuellt per nätbolag. |

---

## 5. Befintliga lösningar: vad de gör bra och dåligt

| Typ | Exempel | Bra | Dåligt |
|---|---|---|---|
| **Prisvisare** | elbruk.se, elprisetjustnu.se, hurbra.se ("elpris imorgon"), widgets och Homey-appar | Gratis, snabba, visar morgondagen kl 13 | Visar kurvor i öre exkl. moms, inte kronor för *din* apparat. Säger aldrig "det spelar ingen roll idag". Kräver att du tolkar varje dag. |
| **Elhandlarappar med styrning** | Tibber, Greenely | Styr laddning och värme automatiskt, realtidsmätning (Tibber Pulse), notiser | Kräver ofta att du är kund. Hårdvarustödet är begränsat (Greenely: schemaläggning bara via Easee enligt deras support). Besparingssiffrorna är egna och inte oberoende verifierade ("upp till 50 %"). Greenely har fått omfattande kritik för kundservice 2026. Tibbers värmestyrning stänger av NIBE:s egen prisstyrning. |
| **Tillverkarnas inbyggda styrning** | NIBE Smart Price Adaption (ingår i myUplink), Thermia Smart Price, CTC, IVT, Easee/Zaptec, Monta SmartCharge, bilens laddschema | Gratis eller billigt, sköter sig själv, kräver ingen daglig insats | Svart låda. Redovisar inte vad den har sparat. Varje tillverkare har sin egen logik och enheterna samordnas inte. Inställningarna är svåra (forumkritik av CTC). Ofta är funktionen inte ens påslagen. Tillverkarnas "5–10 %" är marknadsföring. |
| **Hemautomation** | Home Assistant (Nordpool, EVCC), Homey | Kraftfullt, lokalt, går att göra allt | Kräver tid, kunskap och underhåll. |
| **Myndigheter** | Elpriskollen (Ei), Ei:s råd om smart styrning | Neutralt, jämför avtal | Ingen daglig beslutshjälp. |

**Luckan:** Ingen av lösningarna svarar enkelt på tre frågor:
1. *Behöver jag göra något idag, och vad är det värt i kronor?*
2. *Gör min automatik det den ska, och vad har den sparat jämfört med att inte styra?*
3. *Vilka engångsbeslut (avtal, tariff, säkring, inställningar) är värda mer än allt dagligt flyttande?*

---

## 6. Vad går att påverka i ett hushåll som ditt, och hur mycket?

**ANTAGANDEN** (ersätts med dina verkliga värden i steg 4): hushållsel 5 000 kWh/år, bergvärme 7 000 kWh el till rumsvärme och 1 460 kWh till varmvatten, laddhybrid 10 kWh per laddning 250 gånger/år med 3,7 kW. Disk 1 kWh, tvätt 0,8 kWh, tork 2 kWh. Totalt cirka 16 000 kWh/år. Nätavgift utan tidsdifferentiering.

Alla belopp är räknade på **verkliga SE3-priser 8 oktober 2025 – 7 oktober 2026**, inklusive moms.

### Per tillfälle

| Beslut | Sparat i snitt | Median | Dygn då det sparar < 1 kr | Bästa dygnet |
|---|---|---|---|---|
| Diskmaskin: starta inte kl 19, låt den gå när det är billigast före kl 07 | **0,57 kr** | 0,49 kr | 87 % | 3,02 kr |
| Laddhybrid: ladda inte direkt kl 17, välj billigaste kvartarna före kl 07 | **6,01 kr** | 4,88 kr | 10 % | 41,43 kr |
| Varmvatten: värm inte morgon och kväll, värm under dygnets billigaste 2 h (+10 % el för högre lagringstemperatur) | **2,89 kr/dygn** | 2,71 kr | 13 % | 11,64 kr |

### Per år (uppskattning)

| Last | Möjlig besparing/år | Vad som krävs |
|---|---|---|
| Laddhybrid | **≈ 1 500 kr** | Schemalagd laddning (bil, laddbox eller app). Görs en gång. |
| Varmvatten (bergvärmen) | ≈ 1 050 kr *(övre gräns: förutsätter att tanken räcker ett dygn)* | Värmepumpens styrning. |
| Rumsvärme (bergvärmen) | ≈ 520–870 kr *(grov modell)* | Värmepumpens styrning eller termostat. Huset måste tåla det. |
| Tvätt + tork | ≈ 240 kr | Fördröjd start. Ofta opraktiskt. |
| Diskmaskin | ≈ 140 kr | Fördröjd start. |
| **Summa** | **≈ 3 500–3 800 kr/år** | ≈ 9–11 % av en räkning på 36 000–40 000 kr |

Som jämförelse: RISE simulerade 2025 åt Energimyndigheten en villa i SE3 med värmepump och elbil. Den sparade i snitt cirka 5 000 kr/år, men där kom två tredjedelar från *effektavgiften* och en tredjedel (cirka 1 700 kr) från spotpriset, med 2021 års priser. Mina siffror för spotdelen ligger högre, vilket stämmer med att 2026 har haft större prisspann.

### Andra fynd som påverkar vad som är värt att bygga

- **En fast timer räcker långt.** Disken alltid kl 02 gav 94 % av den optimala besparingen. Bilen alltid kl 01 gav 87 %. Den fasta bil-timern var ändå *sämre än att ladda direkt* 11 % av dygnen, när kvällen var billig och natten dyr. Det är undantagen som kräver information.
- **Värdet av att vänta beror på klockan.** En last som skulle starta kl 19 och får vänta upp till 6 h sparar i snitt 55 öre/kWh. En last som skulle starta kl 12 sparar bara 4–5 öre. Mitt på dagen är det redan billigt.
- **Besparingen är ojämnt fördelad.** De 20 % bästa dygnen står för 45–50 % av årsbesparingen för både bil och värme. Höst och vinter är viktigast. Juli gav bara 2,30 kr per billaddning, september 10,91 kr.
- **Kvartarna spelar liten roll.** Inom en timme skiljer kvartarna i snitt 16 öre, men att optimera på kvartsnivå gav bara 0,22 kr extra per billaddning (cirka 55 kr/år).
- **Bensin är nästan aldrig billigare än el för laddhybriden.** Med ANTAGANDET 19 kr/l och 0,65 l/mil går gränsen vid ett spotpris på 4,18 kr/kWh. Det hände i 13 av 34 944 kvartar senaste året. Rådet är att alltid ladda, men vid rätt tid.
- **Tidstariff förstärker allt.** Hos Vattenfall med tidstariff blir det 336 kr/år mer värt att flytta billaddningen (vardagskvällar nov–mar kostar 46 öre extra per kWh i nätavgift).
- **Det finns andra spakar än tidpunkten** (ska utredas i steg 3). Huvudsäkringen styr den fasta avgiften: 20 A → 16 A är 1 680 kr/år billigare hos Ellevio och 2 310 kr/år hos Vattenfall. Avtalets påslag och månadsavgift kan skilja flera hundra kronor. Dessa beslut tas en gång, inte varje dag.
- **Årsvariationen är stor.** Laddhybriden hade sparat cirka 1 060 kr under 2024 men cirka 4 100 kr/år i takt under krisvintern 2022. Besparingen följer prisspannet, inte prisnivån.

---

## 7. Tillägg 2026-10-08: ditt nätbolag och din värmepump

**Jönköping Energi Nät**
- Effektavgiften (en avgift per kW, beräknad på snittet av de två högsta timvärdena per månad) **togs bort den 1 september 2026** för alla kunder med säkring upp till 63 A. Bytet skedde automatiskt. Bolaget hänvisar till regeringens besked den 13 mars 2026 och uppger att 40 % av kunderna fick det billigare med effektavgift, 40 % dyrare och 20 % ingen skillnad.
- **Säkringstariff** (nuläge, inkl. moms): 16 A 330,28 kr/mån, 20 A 432,94 kr/mån, 25 A 522,24 kr/mån. Överföring 29,29 öre/kWh.
- **Tidstariff** (valbar, inkl. moms): 16 A 513,52 kr/mån, 20 A 624,91 kr/mån. Överföring 37,84 öre/kWh måndag–fredag 07–22 november–mars och 9,21 öre/kWh övrig tid. Prislistan nämner inte helgdagar. Bindningstid och bytesregler framgår inte och måste frågas efter.

**Thermia Calibra 12**
- Bergvärmepump med varvtalsstyrd kompressor, 3–12 kW värme. Har styrsystemet Genesis och kan anslutas via Modbus.
- **Thermia Online** ingår utan abonnemang. **Smart Price** är en kostnadsfri tilläggstjänst som planerar värme *och* varmvatten efter Nord Pools spotpris, med en reglage mellan komfort och besparing. Calibra-serien stöds. Kräver Genesis 13.00 eller senare (standard sedan februari 2023). Thermia anger ingen besparingssiffra.

Källor: [Jönköping Energi – elnätspriser](https://jonkopingenergi.se/privat/elnat/elnat/priser), [Jönköping Energi återgår till prismodell utan effektavgift](https://www.mynewsdesk.com/se/jonkopingenergi/pressreleases/joenkoeping-energi-aatergaar-till-prismodell-utan-effektavgift-3440958), [SVT Jönköping 1 april 2026](https://www.svt.se/nyheter/lokalt/jonkoping/jonkoping-energi-slopar-kritiserade-effektavgifterna), [Thermia Smart Price](https://www.thermia.se/varmepumpar/spotprisstyrning/smart-price/), [Thermia Online](https://www.thermia.se/varmepumpar/tjaenster-foer-distansstyrning/thermia-online/), [Thermia Calibra](https://www.thermia.se/varmepumpar/utgaangna-modeller/calibra-bergvarmepump-jordvarmepump/).

---

## Källförteckning

**Myndigheter och regering**
- Skatteverket: [Sänkt skatt på el 1 januari 2026](https://www.skatteverket.se/foretag/skatterochavdrag/punktskatter/nyheterinompunktskatter/2025/nyheterinompunktskatter/sanktskattpael1januari2026.5.1522bf3f19aea8075ba96f.html)
- Regeringen: [Förslag om slopad indexering av elskatt på remiss](https://www.regeringen.se/pressmeddelanden/2026/03/forslag-om-slopad-indexering-av-elskatt-pa-remiss/) (mars 2026)
- Regeringen: [Uppdrag till Ei att upphäva föreskrifter och föreslå ny utformning av effektavgifter](https://www.regeringen.se/regeringsuppdrag/2026/03/uppdrag-till-energimarknadsinspektionen-att-upphava-foreskrifter-och-lamna-forslag-om-en-ny-utformning-av-effektavgifterna/)
- Regeringen: [Stöd till hushåll till följd av ökade energipriser](https://www.regeringen.se/pressmeddelanden/2026/03/stod-till-hushall-till-foljd-av-okade-energipriser/) och [Frågor och svar om det tillfälliga el- och gasstödet](https://www.regeringen.se/regeringens-politik/energi/fragor-och-svar-om-det-tillfalliga-el--och-gasstodet/)
- Riksdagen: [Extra ändringsbudget för 2026](https://data.riksdagen.se/dokument/HD01FIU48)
- Ei: [Tariffer (nättariffer)](https://ei.se/bransch/tariffer-nattariffer) (granskad 10 juli 2026)
- Ei: [Frågor och svar om kvartsmätning](https://ei.se/konsument/el/elmatare-och-matning-av-din-elanvandning/fragor-och-svar-om-kvartsmatning)
- Ei: [Sänk elkostnaderna med smart styrning](https://ei.se/konsument/anvand-el-smartare/styr-din-elanvandning/sank-elkostnaderna-med-smart-styrning) (RISE-simuleringen, granskad 23 juni 2026)
- Valmyndigheten: [Preliminärt resultat i riksdagsvalet](https://www.val.se/servicelankar/servicelankar/pressrum/nyheter--pressmeddelanden/pressmeddelande-nya/2026-09-17-preliminart-resultat-i-riksdagsvalet-klart)

**Marknad och data**
- [elprisetjustnu.se – Elpris-API](https://www.elprisetjustnu.se/elpris-api)
- Market Coupling Steering Committee: [Go-live 15-minute MTU in SDAC, 1 Oct 2025](https://bsp-southpool.com/2025/09/12/market-coupling-steering-committee-confirms-go-live-15-minute-mtu-sdac-delivery-day-1)
- [Elpris SE3 september 2026](https://energismarthem.se/elpris-se3-2026-09/), [Elbot: Vinterprognosen 2026/2027](https://www.elbot.se/artiklar/vinterprognosen-2026-2027-darfor-blir-elen-dyrare-i/), [Tibber: elpriser hösten och vintern 2026](https://tibber.com/se/magazine/power-hacks/elpriser-host-vinter), [hurbra.se: Fyra kärnreaktorer står still](https://hurbra.se/fyra-karnreaktorer-still-elpris-oktober-2026/)

**Nätbolag**
- Vattenfall Eldistribution: [Säkringsabonnemang 16–63 A](https://www.vattenfalleldistribution.se/abonnemang-och-avgifter/avtal-och-avgifter/elnatsavgifter/sakringsabonnemang-16-63a/), [Prisinformation effektguiden](https://www.vattenfalleldistribution.se/abonnemang-och-avgifter/avtal-och-avgifter/effektguiden/prisinformation/)
- Ellevio: [Prismodell utan effektavgift](https://www.ellevio.se/abonnemang/prismodell-utan-effektavgift/), [Privata Affärer 20 april 2026](https://www.privataaffarer.se/privatekonomi/elpriser/ellevio-slopar-kritiserad-effektavgift/)
- [Mälarenergi Elnät återgår till prismodell utan effektavgift](https://via.tt.se/pressmeddelande/4297527/malarenergi-elnat-atergar-till-prismodell-utan-effektavgift)
- [Byggahus: Eons kunder slipper effektavgift](https://www.byggahus.se/eons-kunder-slipper-effektavgift)
- [Göteborg Energi – nyhetsrum](https://www.mynewsdesk.com/se/goteborg_energi)
- [Selectra: Effektavgift Vattenfall Eldistribution 2026](https://selectra.se/elnat/elnatsbolag/vattenfall-eldistribution/effektavgift)

**Avtal, appar och utrustning**
- [Börskollen: Billigaste elavtalet 2026](https://www.borskollen.se/billigaste-elavtal), [Greenely vs Tibber](https://www.borskollen.se/elavtal/greenely-vs-tibber)
- [Realtid: Greenely svarar varken Bolagsverket eller sina kunder](https://www.realtid.se/it-tech/greenely-svarar-varken-bolagsverket-eller-sina-kunder/), [Reco: Greenely](https://www.reco.se/greenely-ab)
- [Greenely support: schemaläggning via laddbox](https://support.greenely.com/en/articles/7266484-can-i-smart-charge-or-schedule-via-the-charging-box)
- [Tibber: NIBE myUplink](https://tibber.com/se/store/produkt/nibe-myuplink)
- [Thermia Smart Price](https://thermia.com/products/thermia-smart-price)
- [Monta: SmartCharge](https://monta.com/uk/help-center/enable-auto-smartcharge-app/)
- [Varberg Energi: HAN-port](https://www.varbergenergi.se/privat/elnat/elmatning/han-port-och-anslutning-teknisk-utrustning), [Homey Energy Dongle](https://homey.app/en-be/news/the-homey-energy-dongle-is-now-available)
- [Byggahus: varning för CTC:s smarta elprisstyrning](https://www.byggahus.se/forum/threads/varning-for-ctcs-sa-kallade-smart-elprisstyrning-smartgrid.502180/), [Rika tillsammans: NIBE Smart price adaption](https://rikatillsammans.se/forum/t/blockering-tillsats-nibe-varmepumpar-och-smart-price-adaption/46478)
- [Hurbra: När lönar sig kvartspris?](https://hurbra.se/nar-lonar-sig-kvartspris-pa-el/)

*Uppgifter från jämförelsesajter och forum är markerade som sådana i texten där de används. De har lägre tillförlitlighet än myndighets- och bolagskällor.*
