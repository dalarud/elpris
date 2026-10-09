# Elkollen

En svensk webbapp som hjälper ett hushåll att **använda el när den är billig och dra ner när den är dyr**, i kronor och klockslag. Den är byggd som en daytraders plattform (se [docs/07-daytrader.md](docs/07-daytrader.md)), men utan jargong. Målgruppen är ett hus i elområde SE3 med kvartsprisavtal, bergvärme och laddhybrid (Jönköping Energi Nät), men allt går att ställa in.

- **Månaden:** vad elen kostat hittills, ≈ hela månaden och vad du flyttat genom att bocka av.
- **Signalen:** ett ord nu (*Kör nu*, *Vänta*, *Dra ner* eller *Spelar ingen roll*) och en zonremsa från nu till slutet av de kända priserna. Tryck på en tid för att se vad sysslorna kostar då. Kursen per timme visas bakom ett tryck.
- **Orderboken:** en rad per syssla (tvätt, tork, disk, bastu, ugn, värme) sorterad efter kronor, till exempel "Tork: ställ 13 h → start i natt 03:30 · ≈ 3,70 kr". På dra ner-dygn visar den husets exponering och blir en checklista.
- **Bil och värmepump** som kontrollrader: när laddboxen bör ladda, och vad den ostyrda värmepumpen drar under de dyra timmarna.
- **Egna ordrar:** "torken klar före lördag 07, högst 1,20 kr/kWh". Appen räknar ut när den ska köras.
- **Påminnelser:** klockknapp per rad. Du får en ntfy-notis vid rätt tid, eller kvällen före om timern ska ställas.
- **Kommande dagar:** kronor per dygn upp till 5 dygn fram. Tryck på ett dygn för detaljer.
- **Notis i mobilen** kl 13:40 dagen före ett dra ner-dygn, ungefär 1,3 gånger i veckan i snitt (fler på vintern).

Appen: `https://dalarud.github.io/elpris/` *(blir nåbar när GitHub Pages är påslaget, se nedan)*.

## Status

| Steg | Dokument | Status |
|---|---|---|
| 1. Utred | [docs/01-utredning.md](docs/01-utredning.md) | ✅ |
| 2. Formulera problemet | [docs/02-problemformulering.md](docs/02-problemformulering.md) | ✅ |
| 3. Spåna brett | [docs/03-ideer.md](docs/03-ideer.md) | ✅ |
| 4. Riktning | [docs/04-riktning.md](docs/04-riktning.md), ändrad efter ditt svar | ✅ |
| 5. Första versionen | [docs/05-forsta-versionen.md](docs/05-forsta-versionen.md) | ✅ Byggd och testad |
| 6. Utvärdera och förbättra | [analys/resultat_varningar.md](analys/resultat_varningar.md), [analys/resultat_prismodell.md](analys/resultat_prismodell.md), [docs/06-forenkling.md](docs/06-forenkling.md), [docs/07-daytrader.md](docs/07-daytrader.md) | 🔄 Varv 3: daytraderns analyssätt (analys/resultat_daytrader.md) |

Beslut, antaganden och öppna frågor: [docs/beslutslogg.md](docs/beslutslogg.md)

## Kom igång

### 1. Publicera appen
1. Slå ihop grenen till `main`.
2. Gå till **Settings → Pages** och välj **Source: GitHub Actions**.
3. Arbetsflödet *Publicera Elkollen* publicerar appen och uppdaterar prishistoriken varje natt.
4. Öppna appen i mobilen och välj **Lägg till på hemskärmen**.

### Varningar i mobilen
1. Installera appen **ntfy** (gratis, [iPhone](https://apps.apple.com/app/ntfy/id1625396347) och [Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy)).
2. Hitta på ett **hemligt ämnesnamn** som ingen kan gissa, till exempel `elkollen-` följt av 12 slumpade tecken. Ämnesnamnet fungerar som ett lösenord.
3. Prenumerera på ämnet i ntfy-appen.
4. Lägg in samma namn i GitHub under **Settings → Secrets and variables → Actions → New repository secret** med namnet `NTFY_TOPIC`.
5. Testa efter kl 13: **Actions → Varna för dyr el → Run workflow**, med "Skicka även utanför tidsfönstret" ikryssat. Skickas inget betyder det att morgondagen inte är dyr. Loggen visar vad som räknades ut.

Notisen skickas strax efter kl 13:40 svensk tid. Kommer morgondagens priser sent väntar tjänsten i upp till en timme. GitHub stänger av schemalagda körningar i publika repon efter 60 dagar utan aktivitet. Den nattliga körningen håller dem igång, och skulle de ändå stängas av får du ett mejl från GitHub och kan slå på dem under **Actions**. Vill du pausa notiserna, till exempel under en resa, väljer du **Actions → Varna för dyr el → ⋯ → Disable workflow**. Ett arbetsflöde som du har stängt av själv slås inte på igen automatiskt.

### Påminnelser från appen
Klockknapparna i orderboken lägger en schemalagd notis i samma ntfy-ämne. Fyll i ämnet under **Inställningar → Påminnelser** i appen. Det sparas bara i webbläsaren. ntfy.sh tillåter högst 3 dygns fördröjning, så klockan visas bara för tider inom det.

### Egna mätvärden
Ladda ner förbrukningen per timme eller kvart från Jönköping Energis Mina sidor (eller elhandlarens app) och läs in filen under **Inställningar → Mätvärden**. Filen stannar i webbläsaren. Då blir kostnaderna uppmätta i stället för beräknade.

## Hur det räknas

- **Totalpris** = (spotpris + påslag) × 1,25 + energiskatt 45 öre + överföringsavgift. Fasta avgifter ingår i dygns- och månadskostnaderna.
- **Dagsplanen** jämför varje kvart med de 30 dygnen före dygnet. *Billigt* = bland de 20 % billigaste kvartarna (minst 1 h), *dyrt* = bland de 20 % dyraste (minst 30 min), *normalt* = medianen. Dygnet blir *lugnt*, *svängigt* eller *dra ner*. Dra ner gäller när de dyra perioderna kostar huset minst 25 kr över normalt (går att ändra), och bara då skickas notis.
- **Orderboken** prövar varje syssla nu och senare inom de kända priserna (högst 24 h fram). Under 1 kr skillnad står det "spelar ingen roll".
- **Förbrukning** beräknas från årsförbrukningen. Värmedelen följer utetemperaturen och laddhybriden laddas nattens billigaste timmar. Uppmätta värden ersätter beräkningen.
- **Prisuppskattning** 2–5 dygn: senast kända pris justerat för temperatur, vind och helg ([modell och utvärdering](analys/resultat_prismodell.md)).

## Utveckling

```
npm test                 # enhetstester (Node 20+)
npm run backtest         # efterhandstest av dagsplanen, signalen och orderboken på senaste årets priser
npm run data             # bygg app/data/*.json (prishistorik och temperatur)
npm run notis            # torrkörning av notisen (skickar bara om NTFY_TOPIC är satt)
npm run skarmbild -- ut/ # starta appen i Chromium och ta skärmbilder (kräver Playwright)
```

Lokalt: `npx serve app` (eller valfri statisk webbserver) och öppna sidan.

Analysskript i Python (pandas, numpy):
```
python3 analys/hamta_priser.py SE3 2022-11-01 2026-10-09 data/spotpris_SE3.csv
python3 analys/hamta_vader.py 2022-10-01 data/vader_daglig.csv
python3 analys/prismodell.py        # tränar prismodellen -> app/modell/prismodell.json
python3 analys/analys_besparing.py  # steg 1
python3 analys/analys_hushall.py    # steg 3
```

Data: [Elpriset just nu.se](https://www.elprisetjustnu.se) (ENTSO-E) och [SMHI Öppna data](https://www.smhi.se/data).
