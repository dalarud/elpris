# Steg 4–6 – Ny riktning, första versionen och första utvärderingen

## Vad du sa, och vad det ändrade

> "Jag vill få en bättre överblick över mina elkostnader … och appen ska varna mig när det kommer bli höga elpriser och att jag då kanske behöver dra ner på användningen under en viss period."

Förslaget i [steg 4](04-riktning.md) handlade om engångsåtgärder och automatik. Du ville något annat: **överblick** och **varningar**. Det ändrade riktningen så här:

| Tidigare förslag | Nu |
|---|---|
| En guide med engångsåtgärder (Smart Price, tariff, säkring) | Tas bort ur appen. Fynden finns kvar i [steg 3](03-ideer.md) som underlag. |
| Dagens besked per maskin (disk, tvätt) | Ersätts av **läget just nu** och **kommande dagar** med vad huset kostar per dygn i kronor. |
| En notis bara vid undantag | Behålls och blir kärnan: **varning när en dyr period kostar huset märkbart**, och en **förvarning 3 dygn i förväg**. |
| Facit från mätvärden | Blir **Din elkostnad**: månaden hittills, prognos för hela månaden, samma månad i fjol och de senaste 12 månaderna. Bygger på en beräkning tills du laddar upp mätvärden. |

## Vad som är byggt: Elkollen

En webbapp på svenska (`app/`) som kan läggas på telefonens hemskärm, plus en notistjänst.

1. **Just nu.** Totalpriset per kWh med allt inräknat (spot, påslag, moms, energiskatt, nätavgift), nivån jämfört med normalt och när nästa dyra period börjar.
2. **Varningar.**
   - *Känt pris* (i dag och i morgon): dyra perioder med klockslag, högsta pris, vad perioden kostar huset extra och ett exempel i kronor ("En tvätt med tork kostar 8,41 kr under perioden men 4,66 kr kl 21–24").
   - *Uppskattning* (2–5 dygn): dygn som troligen blir dyra, med väntat pris, osäkerhetsspann och skäl (kallare eller svagare vind).
   - Är inget värt en varning står det "Inga varningar", tillsammans med dagens vanliga toppar.
3. **Kommande dagar.** För varje dygn: vad huset kostar i kronor, snittpris och temperatur, samt en remsa med 24 rutor som visar dyra och billiga timmar. Ingen kurva. Uppskattade dagar är märkta med ≈.
4. **Din elkostnad.** Månaden hittills, uppskattning för hela månaden, samma månad i fjol, fördelningen mellan elpris, elnät och skatt, och en tabell över de senaste 12 månaderna.
5. **Inställningar.** Förbrukning, nättariff (Jönköping Energi förifyllt), påslag och månadsavgift, varningsgräns i kronor och import av mätvärden (CSV). Filen läses bara i webbläsaren.
6. **Notis i mobilen** (`tools/notis.mjs` via GitHub Actions och ntfy) strax efter kl 13, när morgondagens priser publicerats. Den skickas bara om morgondagen är värd en varning, eller om ett dyrt dygn väntas om 3 dagar.

### Datakällor
- Spotpriser: elprisetjustnu.se (ENTSO-E), med kvartspriser.
- Väderprognos: SMHI, punktprognos cirka 10 dygn. Används för husets värmebehov och för prisuppskattningen.
- Uppmätt temperatur: SMHI, station Jönköping-Axamo.
- Allt är gratis och kräver ingen inloggning.

### Hur husets förbrukning beräknas (tills mätvärden finns)
Av årsförbrukningen 20 520 kWh antas följande (ANTAGANDE, kan ändras i inställningarna):
- **Fasta delar:** 7 000 kWh hushållsel med typisk dygnsprofil, 5,5 kWh/dygn varmvatten (värms morgon och kväll) och 2 500 kWh laddhybrid (laddas nattens billigaste timmar, eftersom laddboxen prisstyr).
- **Värme:** resten, cirka 9 000 kWh, räknas som uppvärmning och följer utetemperaturen (graddagar, bas 17 °C, normalår 3 530 graddagar i Jönköping).

## Prisuppskattning 2–7 dygn framåt: går det?

Modell: utgå från senast kända dygnspris och justera för hur vädret ändras till måldygnet. Kallare ger högre efterfrågan, svagare vind ger mindre vindkraft och helg ger lägre efterfrågan. Modellen tränades på november 2022 – juni 2025 och testades på juli 2025 – oktober 2026, som den inte hade sett. Vädret i testet är uppmätt, med brus påslaget för att efterlikna prognosfel. Detaljer finns i [`analys/resultat_prismodell.md`](../analys/resultat_prismodell.md).

| Dygn fram | Medelfel | Naivt alternativ | Hittade dyra dygn | Varningar som stämde |
|---|---|---|---|---|
| 2 | 18 öre | 25–28 öre | 73 % | 71 % |
| 3 | 23 öre | 30–36 öre | 54 % | 61 % |
| 4 | 26 öre | 30–39 öre | 58 % | 60 % |
| 5 | 28 öre | 31–40 öre | 53 % | 55 % |
| 6–7 | 32–34 öre | 31–38 öre | 49–52 % | 44–53 % |

**Beslut:** Appen visar uppskattningar upp till 5 dygn fram. Längre fram var modellen inte bättre än att anta samma pris som senaste veckan. Uppskattningarna är alltid märkta, och träffsäkerheten står i appen.

Vindeffekten är stor: varje m/s mer vind i snitt vid kuststationerna sänker priset med cirka 10 %. Helg sänker med cirka 20 % och varje grad kallare höjer med 4–6 %.

## Utvärdering, varv 1: efterhandstest på det senaste året

Se [`analys/resultat_varningar.md`](../analys/resultat_varningar.md). Varje dygn 9 oktober 2025 – 9 oktober 2026 simulerades som om appen kört kl 13:30 dagen före.

**Lärdom 1: den första varningsgränsen var för känslig.** "Dyrt" (40 % över normalt) gav varning **179 dygn av 366**. Det beror på att den vanliga kvällstoppen nästan alltid passerar gränsen, och så många notiser slutar man läsa. Jag lade därför till en **gräns i kronor**: appen varnar bara när de dyra perioderna kostar huset minst 25 kr extra. Resultatet blev:

| | Utan kronorgräns | Med 25 kr |
|---|---|---|
| Dygn med varning per år | 179 | **64** (cirka en i veckan, fler på vintern, inga i juni–juli) |
| Andel av merkostnaden i dyra perioder som fångas | 100 % | cirka 75 % |

**Lärdom 2: att dra ner för hand är värt mindre än man tror.** Jag antog att du under en varning flyttar 30 % av hushållselen till dygnets billigaste timmar och låter värmepumpen gå på halvfart i högst 3 timmar. Det hade sparat **cirka 350 kr på ett år** (uppskattning). Varningarnas värde ligger främst i att du slipper bli överraskad och vet vad det kostar. Ett enskilt beslut kan ändå vara värt en del: en bastu (6–9 kWh) en mycket dyr kväll kan kosta 10–20 kr mer än vid billig tid.

**Lärdom 3: förvarningarna fungerar hyggligt.** 63 förvarningar på ett år, varav 43 stämde (68 %, med uppmätt väder; räkna med cirka 60 % med riktiga prognoser). De fångade 43 av 78 dyra dygn.

**Lärdom 4: kvartspriserna spelar liten roll för överblicken.** Appen räknar kostnader per timme och visar remsor per timme. Varningarna använder ändå kvartarna.

## Kvalitetskontroller

- `npm test`: 10 enhetstester. De täcker tariffer och höglasttid, att förbrukningsmodellen summerar till årsförbrukningen, att dyra perioder hittas och slås ihop, att JavaScript-prognosen ger samma svar som Python-modellen och att import av mätvärden fungerar i tre format.
- `npm run backtest`: efterhandstestet ovan.
- `npm run skarmbild`: startar appen i Chromium med verkliga data, kontrollerar att konsolen saknar fel och tar skärmbilder i ljust och mörkt läge.

## Kvar att göra

1. **Publicera.** Slå ihop till `main` och slå på GitHub Pages ("GitHub Actions" som källa). Då blir appen nåbar på `https://dalarud.github.io/elpris/` och prishistoriken uppdateras varje natt.
2. **Notiser.** Installera ntfy-appen, hitta på ett hemligt ämnesnamn, prenumerera på det och lägg in det som hemlighet `NTFY_TOPIC` i GitHub (se README).
3. **Mätvärden.** Ladda upp en export från Jönköping Energis Mina sidor. Då blir kostnaderna verkliga i stället för beräknade, och jag kan kalibrera värmemodellen och varningsgränsen mot ditt verkliga hus. Känns formatet inte igen, skicka de första raderna.
4. **Varv 2 av utvärderingen.** Logga riktiga SMHI-prognoser varje dag, så att förvarningarnas träffsäkerhet kan mätas med riktiga prognoser och inte uppmätt väder. Jämför också uppskattad och verklig månadskostnad när mätvärden finns.

## Granskning före sammanslagning (9 oktober 2026)

Före sammanslagningen till `main` granskades koden i fyra delområden: beräkningar och prognos, gränssnitt, datahämtning och publicering, samt notiser och GitHub Actions. Granskningen gav 29 fynd. Alla bedömdes som verkliga och rättades. De viktigaste var:

- **Dagens väder byggde bara på resten av dygnet.** SMHI:s prognos börjar vid nästa hela timme, så förmiddagens prisuppskattningar blev 14–18 % för låga. Nu fylls dygnets passerade timmar med SMHI:s timmätningar, och prognosen interpoleras per timme så att dygnsmedlet blir tidsvägt.
- **Notisen kunde komma två gånger eller inte alls** när GitHub försenade körningen mer än cirka 35 minuter. Nu avgör cron-uttrycket vilken körning som skickar, och den väntar in sena priser i upp till en timme.
- **Tidstariff gav fel nivåer.** Normalpriset räknades med säkringstariffens avgift. Nu räknas det timme för timme med den avgift som gällde.
- **Schemalagda körningar stängs av efter 60 dagar** utan aktivitet i publika repon. Nu återaktiveras de varje natt.
- **Mindre fel:**
  - "Just nu" kunde visa en inaktuell kvart.
  - Inställningsfälten spärrade vissa värden.
  - Återställ raderade inställningarna direkt.
  - Sommartidsnätterna hanterades fel.
  - Elhandelns månadsavgift redovisades som elnät.

Efter rättningarna hittade efterhandstestet samma varningsdagar som tidigare. Förvarningarna blev 63, varav 43 stämde. Alla rättningar har enhetstester.

