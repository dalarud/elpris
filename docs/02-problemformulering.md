# Steg 2 – Problemformulering

*Bygger på [utredningen](01-utredning.md) och de egna beräkningarna i [`analys/resultat_steg1.md`](../analys/resultat_steg1.md).*

## Din beskrivning, och vad utredningen säger om den

> "Jag har svårt att veta och förutse när jag ska använda el, eftersom spotpriset svänger så mycket."

Beskrivningen utgår från att svårigheten ligger i att **veta och förutse**. Utredningen pekar delvis åt ett annat håll:

1. **Det mesta går faktiskt att förutse.** Dygnsmönstret är stabilt: dyrt kl 07–09 och 17–21, billigt på natten och mitt på dagen. En fast regel fångar 87–94 % av värdet. Morgondagens exakta priser är kända kl 13, så för nästan alla vardagsbeslut finns facit, ingen prognos behövs.
2. **Det som svänger mest är inte det som kostar mest.** Det man tänker på i vardagen (disk, tvätt) är värt cirka 400 kr/år *tillsammans*. På 87 % av dygnen sparar en flyttad disk mindre än en krona. Laddhybriden och bergvärmen står för cirka 90 % av den möjliga besparingen, och de styrs inte genom att du "vet" något, utan genom inställningar och automatik.
3. **Känslan av osäkerhet kostar i sig.** Ett elpris som svänger kraftigt skapar en oro för att "göra fel", även när det handlar om ören. Ett lika viktigt besked som "kör nu" är därför "det spelar ingen roll idag". Det beskedet ger idag ingen app.

**Omformulerat:** Problemet är inte i första hand att förutse priset. Det är att
- få de **två stora lasterna** (laddhybrid och bergvärme) att automatiskt undvika dyra timmar, och veta att de faktiskt gör det,
- få ett tydligt besked de **få dagar då något avviker** (extrema toppar, billig kväll och dyr natt, kyla),
- slippa tänka på elpriset **resten av tiden**,
- och ta de **engångsbeslut** (nätavgift, säkring, avtal, värmepumpens inställningar) som kan vara värda lika mycket som allt dagligt flyttande tillsammans.

## Vad är svårt: information, tid eller automatik?

| Last eller beslut | Värde/år (uppskattning) | Brist på information? | Brist på tid/uppmärksamhet? | Brist på automatik? | Slutsats |
|---|---|---|---|---|---|
| **Laddhybrid** | ≈ 1 500 kr | Liten. Mönstret är förutsägbart, men 11 % av dygnen slår en fast timer fel. | Stor om det ska göras för hand varje kväll. | **Huvudproblemet.** Ska ställas in en gång. Bil, laddbox eller app kan oftast schemalägga. | Automatisera. Informera bara om undantag. |
| **Varmvatten** (bergvärme) | ≈ 1 000 kr (övre gräns) | Ingen. Användaren fattar aldrig beslutet. | — | **Helt.** Sker i värmepumpen. | Kontrollera att prisstyrningen är på och fungerar. Visa vad den sparar. |
| **Rumsvärme** (bergvärme) | ≈ 500–900 kr | Ingen för vardagen. Viss för extremdagar. | — | **Helt.** Plus en avvägning mot komfort. | Samma som varmvatten. Varna inför extremdagar. |
| **Disk, tvätt, tork** | ≈ 400 kr totalt | **Ja.** Man vet inte om det spelar roll, eller hur många timmar fördröjningen ska ställas på. | **Ja.** Att kolla priset kostar mer uppmärksamhet än det ger. | Delvis. Fördröjd start finns redan på maskinerna. | Ett enda besked i stil med "Sätt 5 h – sparar 1,20 kr" eller "Spelar ingen roll". Ingen kurva. |
| **Tillfälliga storförbrukare** (ugn, bastu, tork, elpatron) på extremdagar | Tiotals kr per extremdygn, några dygn per år | **Ja.** Man vet inte att i morgon är extrem. | — | — | Avisering dagen före, kl 13, bara när det är värt det. |
| **Engångsbeslut** (nättariff, säkring, avtal, värmepumpens inställningar) | 0–2 000+ kr | **Ja.** Svårt att räkna ut vad som lönar sig för just dig. | Engångsinsats | — | Engångsanalys med dina siffror. |

**Mönster:** Brist på *information* gäller främst små laster och sällsynta dagar. Brist på *tid* gäller allt som kräver dagliga beslut. Brist på *automatik* gäller nästan alla pengar. En lösning som bara visar mer information (som de flesta prisappar gör) angriper alltså den minst värdefulla delen av problemet.

## Vad marknaden saknar

Utredningen visar att automatiken ofta redan finns (NIBE Smart Price Adaption, Thermia Smart Price, laddboxar, Monta, Tibber, Greenely). Det som saknas är:

1. **Kronor i stället för öre per kWh.** Ingen översätter priset till "vad kostar det att köra *min* disk nu jämfört med kl 02".
2. **Ärlighet om när det inte spelar någon roll.** Prisappar visar en kurva varje dag, även när skillnaden är 30 öre.
3. **Ett facit.** Tillverkare och elhandlare säger "spara upp till 50 %" men visar aldrig vad du *faktiskt* sparade jämfört med att inte styra.
4. **Samordning och kontroll.** Bil och värmepump styrs i olika appar med olika logik, och ingen kontrollerar att de gör rätt.
5. **Engångsbesluten.** Säkring, tariff och avtal analyseras sällan tillsammans med förbrukningen.

## Problemformulering

> **Hjälp ett hushåll med laddhybrid och bergvärme i SE3 att fånga merparten av de cirka 3 500 kr/år som tidpunkten är värd, med nästan ingen daglig ansträngning. Varje råd ska förstås på några sekunder och uttryckas i kronor. Säg ärligt när tidpunkten inte spelar någon roll.**

Delmål som går att mäta:
- **Fångad besparing:** andel av den teoretiskt möjliga besparingen (mål ≥ 80 %), mätt i efterhand mot verkliga priser.
- **Ansträngning:** antal beslut eller aviseringar per vecka som kräver att du gör något (mål: i genomsnitt högst ett eller två).
- **Begriplighet:** varje råd innehåller en handling och ett belopp i kronor, till exempel "Ladda efter 23 – sparar 8 kr".
- **Ärlighet:** uppskattningar markeras som uppskattningar. Dygn då skillnaden är under en tröskel (t.ex. 1 kr) får beskedet "spelar ingen roll".

## Hypoteser att pröva i steg 6

- **H1.** En fast grundinställning plus besked vid undantag fångar minst 90 % av värdet av full optimering.
- **H2.** Värdet är koncentrerat till kvällar under höst och vinter och till ett tiotal extremdygn per år.
- **H3.** Att ett kvartsprisavtal lönar sig förutsätter styrning. Ostyrt betalar ett hus som ditt cirka 12 % mer än dygnsmedelpriset.
- **H4.** Kvartsupplösning tillför försumbart värde jämfört med timupplösning för hushållets beslut.
- **H5.** För bergvärmen är engångsbeslutet (att slå på och ställa in prisstyrningen rätt) värt mer än dagliga råd.

## Okända faktorer som ändrar siffrorna mest

Räknat i kronor är det här de uppgifter om ditt hushåll som påverkar resultatet mest. *(Besvarade 2026-10-08, se [beslutsloggen](beslutslogg.md) och [steg 3](03-ideer.md).)*

1. **Nätbolag och nättariff.** Med tidstariff eller effektavgift flyttas de billiga timmarna och värdet av styrning ökar.
2. **Bergvärmepumpens märke och modell**, om den är uppkopplad och om prisstyrning redan är på. Det avgör om den kan styras och hur.
3. **Laddhybridens modell, laddeffekt och hur den laddas** (laddbox eller vägguttag), samt ungefärlig körsträcka per dag. Det avgör både värdet och om laddningen kan styras automatiskt.
4. **Huvudsäkringens storlek** och årsförbrukningen (står på fakturan).
