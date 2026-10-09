# Elkollen

En svensk webbapp som ger **överblick över elkostnaderna** och **varnar när elen blir dyr**, så att du hinner dra ner användningen. Den är byggd för ett hus i elområde SE3 med kvartsprisavtal, bergvärme och laddhybrid (Jönköping Energi Nät), men allt går att ställa in.

- **Månaden:** vad elen kostat hittills, uppskattning för hela månaden och skillnad mot samma månad i fjol.
- **Läget nu:** på en rad, med när nästa dyra period börjar.
- **Dra ner-läge:** när en dyr period kommer en checklista med konkreta åtgärder, till exempel vänta med bastun eller skjuta upp torken, och vad var och en sparar i kronor.
- **När ska jag köra?** Tryck Tvätt, Tork, Disk, Bastu eller Ugn och få bästa tid, vad du sparar och hur många timmar fördröjd start ska ställas på.
- **Kommande dagar:** kronor per dygn för huset, upp till 5 dygn fram (längre fram är en uppskattning från SMHI:s väderprognos).
- **Notis i mobilen** strax efter kl 13 när morgondagen blir dyr. Ungefär en gång i veckan, fler på vintern.

Appen: `https://dalarud.github.io/elpris/` *(blir nåbar när GitHub Pages är påslaget, se nedan)*.

## Status

| Steg | Dokument | Status |
|---|---|---|
| 1. Utred | [docs/01-utredning.md](docs/01-utredning.md) | ✅ |
| 2. Formulera problemet | [docs/02-problemformulering.md](docs/02-problemformulering.md) | ✅ |
| 3. Spåna brett | [docs/03-ideer.md](docs/03-ideer.md) | ✅ |
| 4. Riktning | [docs/04-riktning.md](docs/04-riktning.md), ändrad efter ditt svar | ✅ |
| 5. Första versionen | [docs/05-forsta-versionen.md](docs/05-forsta-versionen.md) | ✅ Byggd och testad |
| 6. Utvärdera och förbättra | [analys/resultat_varningar.md](analys/resultat_varningar.md), [analys/resultat_prismodell.md](analys/resultat_prismodell.md), [docs/06-forenkling.md](docs/06-forenkling.md) | 🔄 Varv 2: förenklad startvy och stödfunktioner |

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

### Egna mätvärden
Ladda ner förbrukningen per timme eller kvart från Jönköping Energis Mina sidor (eller elhandlarens app) och läs in filen under **Inställningar → Mätvärden**. Filen stannar i webbläsaren. Då blir kostnaderna uppmätta i stället för beräknade.

## Hur det räknas

- **Totalpris** = (spotpris + påslag) × 1,25 + energiskatt 45 öre + överföringsavgift. Fasta avgifter ingår i dygns- och månadskostnaderna.
- **Normalt** = medianpriset de senaste 30 dygnen. *Dyrt* ≥ 1,4 × normalt, *mycket dyrt* ≥ 2 × normalt.
- **Varning** ges bara när de dyra perioderna kostar huset minst 25 kr extra det dygnet (går att ändra).
- **Förbrukning** beräknas från årsförbrukningen. Värmedelen följer utetemperaturen och laddhybriden laddas nattens billigaste timmar. Uppmätta värden ersätter beräkningen.
- **Prisuppskattning** 2–5 dygn: senast kända pris justerat för temperatur, vind och helg ([modell och utvärdering](analys/resultat_prismodell.md)).

## Utveckling

```
npm test                 # enhetstester (Node 20+)
npm run backtest         # efterhandstest av varningarna på senaste årets priser
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
