# Varv 3: Elkollen som en daytraders plattform

**Uppdrag (2026-10-09):** "Tillämpa samma analyssätt på detta som en daytrader skulle på aktiehandeln och utforma plattformen efter det."

Det här dokumentet beskriver analysen, konceptet, dina val och resultatet. Siffrorna kommer från `analys/resultat_daytrader.md` (marknaden) och `analys/resultat_varningar.md` (efterhandstest av den nya appen).

## 1. Marknaden med en traders verktyg

Underlaget är SE3:s kvartspriser 2025-10-08 – 2026-10-09, räknade som totalpris med Jönköping Energis säkringstariff.

| Traderns fråga | Svaret på elmarknaden | Vad det betyder för appen |
|---|---|---|
| Hur volatilt? | Dygnets spann (högsta minus lägsta) är i snitt 1,30 kr/kWh. Lugna och svängiga dygn kommer i följd: korrelationen mellan dagens och morgondagens spann är 0,43. | Det lönar sig nästan alltid att välja tid. |
| Var ligger nivåerna? | Kvartar bland de 20 % billigaste (köpläge) kostade i snitt 1,04 kr/kWh, oftast kl 11–15. De 20 % dyraste kostade 2,55 kr/kWh, oftast kl 7–8 och 18–20. 56 % av dygnen hade minst ett köpläge. | Billigt och dyrt definieras relativt de senaste 30 dygnen (percentiler), inte som en fast faktor. |
| Trend? | Att en stigande trend fortsatte nästa vecka stämde 40 % av gångerna. | Inga trendpilar. Trender är inget att handla på. |
| Medelåtergång? | Dygnet efter ett toppdygn var i snitt bara 8 % billigare. | Inga råd av typen "vänta ett dygn". |
| Vad driver priset? | Vind: korrelationen med dygnsmedlet är −0,50. Minst blåsiga fjärdedelen av dygnen kostade 2,03 kr/kWh, mest blåsiga 1,38. Temperatur: −0,30. | Vinden och kylan förklarar uppskattningarna för dagar längre fram. |
| Vilken handelsregel är bäst? | Tork, beslut kl 18. Köra direkt: 5,24 kr. Fast timer kl 02: 3,82 kr (68 % av möjlig vinst). Limitorder under 25:e percentilen: 3,53 kr (82 %). Billigaste fönstret bland **kända** priser: 3,16 kr (100 %). | Inom de kända priserna räknar appen exakt. Limitorder används bara för egna ordrar som sträcker sig bortom dem. |
| Risk och exponering? | Utan styrning hamnar 15 % av förbrukningen i den dyraste tiondelen av kvartarna. Månadsmedlet varierade 1,44–2,17 kr/kWh, vilket är cirka 1 245 kr för en vintermånad på 1 700 kWh. | Exponeringen visas på dra ner-dygn och för värmepumpen. Marknadsrisken visas under Prissäkring. |

**Den stora skillnaden mot aktier:** day-ahead-priserna är *kända* 11–35 timmar framåt. En trader skulle betala mycket för facit. Därför är appen byggd kring de kända priserna, och uppskattningar märks alltid med ≈.

## 2. Hur konceptet togs fram

Tre designers fick var sin vinkel:
- **Order:** signal, zoner och orderbok.
- **Resultat:** P&L och risk.
- **Terminal light:** kursvy och marknadsdrivare.

Två granskare satte betyg på dem. Den ena granskade som daytrader och produktdesigner, den andra med din kritik från varv 2 som måttstock ("plottrigt, för lite stödjande"). Order vann med 30–31 poäng av 40. Terminal fick 25–28 och Resultat 20–23. Syntesen utgick från Order och lånade de bästa delarna från de andra två.

Konceptet fick också lösa de fynd som granskningen av varv 2 hittade. Där gav "När ska jag köra?" och "Dra ner" olika tider för samma maskin, perioderna flyttade sig var 15:e minut och varningen kunde nedgraderas på själva dagen.

**Dina val (2026-10-09):**
- **Kursvy:** zonremsan i startvyn och en kompakt kursvy bakom ett tryck ("Visa kursen").
- **Ordrar:** påminnelser per rad och egna ordrar med villkor.

## 3. Principer

1. **Facit först.** Inom de kända priserna räknas varje råd exakt. Längre fram finns bara bevakning (≈, ungefär 6 av 10 stämmer).
2. **En kärna för allt.** `dagsplan()` och `planera()` är de enda beräkningarna. Signal, orderbok, remsa, notis och egna ordrar läser dem och kan därför inte säga emot varandra.
3. **Låst per dygn.** Dagsplanen jämförs med de 30 dygnen *före* dygnet. Den blir därför likadan oavsett när den räknas, i notisen kl 13:40 eller i appen kl 19. Varje period har ett fast id (datum + start).
4. **Två gränser överallt.** 1 kr är minsta skillnad som är värd ett råd; under det står "spelar ingen roll". 25 kr över normalt per dygn avgör om dygnet får beskedet dra ner.
5. **Kronor och klockslag, inte index.** Percentiler används bara i beräkningen. Ord som "sälj", "percentil" och "P&L" används inte i appen.
6. **Rött betyder gör något.** Röd färg används bara på dra ner-dygnen (cirka 66 per år). Jämförelsen med i fjol är aldrig röd, eftersom den beror på marknaden.

## 4. Det som byggdes

| Del | Traderns begrepp | Vad den gör |
|---|---|---|
| **Dagsplanen** (`app/js/plan.js`) | Stöd och motstånd, avslutad auktion | Billiga perioder: kvartar vid eller under 30 dygnens 20:e percentil, minst 1 h. Dyra perioder: vid eller över 80:e percentilen, minst 30 min. Dygnet blir **lugnt** (ingen dyr period), **svängigt** (dyra perioder under 25 kr över normalt) eller **dra ner** (≥ 25 kr). Husets exponering räknas med normaltemperatur, så att appen och notisen alltid ger samma besked. |
| **Ordermotorn** (`planera()` i `kalkyl.js`) | Bästa exekvering, courtage | Bästa start per syssla. Maskiner med timer prövas i hela timmar, övriga i kvartar, högst 24 h fram. Bastu föreslås kl 10–21 och ugn kl 10–20. Motorn säger också "starta före X" när det blir minst 1 kr dyrare om man väntar, och ger ett dagtidsalternativ om det kostar högst 25 öre eller 10 % mer. |
| **Signalen** | Handelssignal | Ett ord härlett ur orderboken: **Dra ner** (dra ner-dygn med dyr period kvar), **Vänta** (det som är värt mest är att vänta), **Kör nu** (det som är värt mest är att inte skjuta upp) eller **Spelar ingen roll** (inget du kan köra nu är värt ≥ 1 kr). |
| **Zonremsan** | Kurs mot nivåer | Tunn remsa från nu till slutet av de kända priserna. Billigt är grönt. Dyrt har kontur, men röd fyllning bara på dra ner-dygn. Tryck eller piltangent på en tid visar vad varje syssla kostar då (vad-om). |
| **Kursen** (bakom tryck) | Kursgraf | En stapel per timme, grå utom i perioderna, med normalpriset som en linje. Tryck på en stapel ger vad-om. |
| **Orderboken** | Orderbok, positionsstorlek | En rad per syssla, sorterad efter kronor, högst 7 rader. På dra ner-dygn byter den rubrik och visar husets exponering. Bockar blir en journal. |
| **Kontrollrader** | Stående order, öppen position | Bilen: när laddboxen bör ladda i natt (antaget). Värmepumpen: hur mycket den ostyrda pumpen drar under de dyra perioderna, med länk till Smart Price. |
| **Egna ordrar** | Limitorder med giltighetstid | Ange syssla, "klar senast" och pristak (förslag: 30 dygnens 25:e percentil). Är priserna kända fram till senast-tiden körs ordern på bästa tid. Annars väntar den på nästa dygns priser kl 13, om inte ett känt fönster redan klarar taket, med bästa kända tid som reserv. |
| **Påminnelser** | Larm | Klockknapp per rad: ett schemalagt ntfy-meddelande (högst 3 dygn fram, aldrig kl 22–07) med samma sekvens-id, så att det kan flyttas om planen ändras mer än en timme eller tas bort. Texten skrivs för när den kommer fram. Maskiner med timer som ska gå på natten påminns kvällen före med exakt fördröjning: "ställ 6 h nu (kl 21:30), så startar den kl 03:30". Har kvällen passerat ställer man timern direkt. |
| **Månaden + journal** | Realiserat resultat | Kostnaden hittills och ≈ hela månaden. "Flyttat i oktober: ≈ X kr" summerar det du bockat av, med beloppet låst när du bockade. |
| **Notisen** | Notis när auktionen stängt | Bara när morgondagens dagsplan säger dra ner. Samma tider och åtgärder som i appen. |
| **Mer** | Resultatattribution, positioner, hedge | Jämförelse med i fjol uppdelad i pris och förbrukning. Positioner, alltså vad bil, varmvatten, hushåll och värme betalat mot dygnsmedel. Prissäkring: jämför kvartspris med ett eget fastprisanbud, utan rekommendation. |

**Bortvalt:**
- Trendpilar, glidande medelvärden, RSI, candlesticks och "nivå 73/100".
- Prognosstaplar efter de kända priserna.
- Snittkurs mot marknaden i startvyn: den var ±2 kr i oktober och bygger på en modell.
- Avtalsråd.
- Egen styrning av Calibran och laddboxen.

## 5. Efterhandstest (verkliga priser, senaste 12 månaderna)

Se `analys/resultat_varningar.md`.

| Mått | Resultat |
|---|---|
| Dagsbesked | 152 lugna, 148 svängiga, **66 dra ner-dygn** (cirka 1,3 i veckan, flest i nov–feb och aug) |
| Signal kl 12 | Kör nu 226, Spelar ingen roll 58, Dra ner 66, Vänta 16 dygn |
| Signal kl 20 | Vänta 190, Kör nu 66, Dra ner 60, Spelar ingen roll 50 dygn |
| Orderboken, beslut kl 18 | Tork 2,02 kr/körning (raden är värd ≥ 1 kr 286 dygn av 366). Bastu 4,85 kr. Ugn 1,06 kr. Tvätt 0,81 kr. Disk 0,77 kr. Med antagna körningar per vecka (4/3/5/1/4) blir det **≈ 1 160 kr/år**. |
| Dra ner-dygnen | Huset kostade 3 598 kr över normalt under de dyra perioderna. Att dra ner enligt antagandet sparar ≈ 310 kr/år. |
| Förvarningar 3 dygn före | 63 st, varav 43 stämde (68 %) |

**Lärdomar:**
- Signalen följer dygnets rytm. Mitt på dagen är det oftast "kör nu", på kvällen "vänta till natten". Det är rätt råd, inte brus.
- Det mesta av värdet i vardagen ligger i att lägga torken och bastun rätt, mindre i tvätt och disk. "Spelar ingen roll" är därför ett vanligt och ärligt svar för de små maskinerna.
- Dra ner-dygnen är få men dyra. De står för en stor del av merkostnaden, och där är värmepumpen den stora posten. Smart Price är fortfarande det enskilt viktigaste rådet (≈ 1 900–2 300 kr/år, se `docs/03-ideer.md`).

## 6. Antaganden och öppna frågor

- **Sysslornas energi och längd** (tvätt 1,0 kWh/2 h, tork 2,5/2, disk 1,0/3, bastu 7/2, ugn 1,5/1) och **tidsfönster** (bastu 10–21, ugn 10–20) är antaganden. De kan göras ändringsbara om du vill.
- **Bilen:** 2 500 kWh/år vid 3,7 kW, och att den laddas varje natt. Laddboxens schema är okänt (F3).
- **Påminnelser** kräver att du fyller i ditt ntfy-ämne i appen. Ämnet sparas bara i webbläsaren. ntfy.sh tillåter högst 3 dygns fördröjning.
- **Egna ordrar** räknas om när appen är öppen. Det finns ingen server som bevakar dem. En påminnelse på ordern ger en notis även när appen är stängd.

## 7. Granskning av varv 3 och rättningar (2026-10-10)

Tre granskare (beräkningar, UX, robusthet) med var sin skeptisk verifierare hittade 36 fynd. Alla bekräftades, några med sänkt allvarlighetsgrad. De viktigaste:

| Fynd | Rättning |
|---|---|
| Notisen räknade med 7 °C som normaltemperatur och gav ett annat besked än appen 16 dygn av 366 (7 missade dra ner-dygn på vintern och 9 falsklarm). | `lasTemp()` läser samma temperaturdata som appen. Notisen ger nu samma belopp som appen, t.ex. 65 kr för 22/9. |
| Påminnelser för maskiner med timer kunde flyttas till mitt i natten. Texten ("ställ 4 h") räknades från när knappen trycktes, så den som följde den startade maskinen 4 timmar för sent. | `paminnelse()` skriver texten för leveranstillfället med absoluta klockslag, lägger aldrig en påminnelse kl 22–07 och flyttar den bara om planen ändras ≥ 1 h (timer) eller ≥ 30 min. Påminnelser kopplas till sysslan, inte till dagens datum. |
| Signalen sa emot orderboken (t.ex. "Spelar ingen roll" ovanför en rad värd 2 kr). | Signalen härleds ur orderboken och tar bara med sysslor som går att köra nu. "Kör nu" i en dyr kvart förklaras ("Dyrt nu, men dyrare senare"), och "helst X, senast före Y" visas bara när X ligger före Y och utanför dyra perioder. Efterhandstestet kontrollerar villkoren vid 732 tidpunkter: 0 avvikelser. |
| Dra ner i morgon-listan gav andra tider än orderboken och kunde föreslå en tid inne i dagens dyra period. | Den separata listan är borttagen (en andra kontroll visade att den fortfarande kunde avvika). Raden "Dra ner i morgon" sammanfattar, och råden står bara i orderboken, som räknar med alla kända priser. Notisen använder orderbokens rader vid kl 13:40, med klockslag och vad det kan kosta att vänta ("basta i dag före kl 15:30 (annars upp till ≈ 14 kr mer)"). |
| Ordermotorn kunde skjuta upp disken ett dygn för ett öre. | Den tidigaste starten inom max(5 öre, 2 %) av den billigaste väljs (`K.billigast`). |
| Bilens laddfönster kunde gälla nästa kväll i stället för natten som pågår. | Bara den pågående eller kommande natten (22–07). |
| Pristaket i egna ordrar ignorerades utan att det syntes. Bastu-ordrar blev direkt "för sent". | "Över ditt tak" visas. Egen status när bastu och ugn inte hinner inom sina tider. Dialogen kontrollerar tid och tak, godtar "1,20" och föreslår kl 21 för bastu. |
| Positioner visade värmens "0" som ett resultat. Smart Price-länken landade inte rätt. | Värmen står som antagande i text. Länken öppnar Mer och rullar dit. |
| Trasiga data i webbläsarens lagring kunde krascha appen. Fokus och uppläsning störde var 15:e minut. | Lagringen kontrolleras och har prefixet `elkollen:`. Ritfel skiljs från hämtfel. Fokus behålls, och bara signalordet läses upp. Remsan har fler tangenter. |
| Notisen gav upp vid ett enda ntfy-fel. | Tre försök per notis. Ett fel stoppar inte de andra notiserna. |

En andra kontroll av rättningarna (en av fyra granskare hann klart innan kvotgränsen) hittade bland annat följande, som också är rättat:
- "Dyrt till i morgon kl 00:00" när det var dyrt hela morgondagen. Nu står det "kl 24:00".
- Rubriken på dra ner-dygn räknade hela periodernas kWh. Nu räknas bara det som återstår.
- Värdet på "starta före"-rader visade bara skillnaden vid gränsen. Nu visas spannet, t.ex. "efter kl 05:30 3–6 kr dyrare", och det högre beloppet räknas.
- Ihopfällningen dolde ibland en rad som signalen nämnde. Nu fälls bara minst två rader ihop, och aldrig en som signalen nämner.
- Orderdialogen föreslog ett pristak även när alla priser fram till senast-tiden var kända, och gav sedan "över ditt tak". Nu används taket bara när det behövs.

