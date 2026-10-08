# Steg 4 – Föreslagen riktning (att stämma av innan jag bygger)

> **Uppdatering 2026-10-08:** Du svarade att du hellre vill ha *överblick över elkostnaderna* och *varningar när elen blir dyr*. Riktningen nedan är därför ersatt. Se [05-forsta-versionen.md](05-forsta-versionen.md).

## Kort

En liten svensk webbapp, **Elbesked**, med tre delar. Ingen av dem visar en priskurva som huvudsak.

1. **Gör en gång – värt X kr/år.** En guide med engångsåtgärder sorterade efter kronor: slå på Smart Price i Calibran, byt till tidstariff (efter kontroll), kontrollera laddboxen, utred 16 A. Varje punkt har steg-för-steg-instruktioner och en uppskattning som räknas om när riktiga data finns.
2. **Dagens besked.** En mening med kronor för idag och i morgon, plus besked per maskin ("Disk: sätt 5 h – sparar 1,10 kr" eller "Spelar ingen roll idag"). En **notis kl 13 bara när morgondagen avviker**. Målet är 10–30 notiser per år, inte en per dag.
3. **Facit** *(om du kan ta fram mätvärden)*. Månadsvis: vad du betalade per kWh mot dygnsmedlet, vad styrningen sparade och om tidstariffen lönade sig. Varje siffra är märkt som *känd* eller *uppskattad*.

## Varför just detta

- Cirka 90 % av pengarna finns i värmepumpen och bilen. Båda har redan inbyggd prisstyrning. Det mest lönsamma är att få den påslagen och kontrollerad, inte att bygga en ny.
- Ett dagligt beslut om disk är värt 50 öre. Det motiverar ett besked som går att läsa på en sekund, inte en app som du måste öppna och tolka.
- Undantagsdagarna kräver information du inte har. Det är dem notisen är till för.
- Inga andra appar visar ärligt vad styrningen sparade. Facit gör att både du och jag kan se om råden fungerar, och det är grunden för utvärderingen i steg 6.

## Vad jag *inte* bygger i första versionen, och varför

| Bortvalt | Skäl |
|---|---|
| Egen styrning av Calibra eller laddbox | Smart Price och laddboxen gör jobbet gratis. Egen styrning ger högst några hundra kronor mer, kräver en dator hemma och innebär en risk för komforten. Kan prövas senare om facit visar att den inbyggda styrningen fungerar dåligt. |
| Prisprognoser bortom i morgon | Svag data och litet värde (≈ 50–100 kr/år). Skulle bli en uppskattning som lätt misstolkas. |
| Batteri, flexmarknader | Betalar sig inte idag. |
| Inloggning, konton, server | Behövs inte för ett hushåll. Inställningar sparas i webbläsaren. |

## Teknik (förslag)

| Del | Val | Varför |
|---|---|---|
| App | Statisk webbapp (HTML, CSS, JavaScript) som kan installeras på hemskärmen | Fungerar på alla telefoner, inget byggsteg, lätt att underhålla. |
| Prisdata | elprisetjustnu.se direkt från webbläsaren (tillåter CORS) | Gratis, kvartspriser, ingen nyckel. |
| Beräkningskärna | En JavaScript-modul som både appen och notistjänsten använder | Samma logik överallt, testbar mot historiska dygn. |
| Hosting | GitHub Pages (repot är publikt, så det är gratis) | Ingen server att sköta. |
| Notiser | GitHub Actions kör kl 13:15 varje dag och skickar via **ntfy** (gratis app för iPhone och Android) när det spelar roll | Gratis och pålitligt. Ämnesnamnet hålls hemligt i GitHub Secrets. |
| Facit | Du laddar upp en exportfil (CSV/Excel) från Jönköping Energis Mina sidor. Beräkningen sker i webbläsaren och filen lämnar aldrig telefonen. | Ingen integration behövs. Inget lämnar din telefon. |
| Test | Backtest på verkliga lugna och extrema dygn (data finns redan i `data/`) | Krav i steg 6: kontrollera att råden hade sparat pengar. |

## Mina frågor till dig

Bara sådant som ändrar vad jag bygger:

1. **Notiser:** Är ntfy-appen okej (gratis, ingen inloggning), eller vill du hellre ha e-post? Och vill du ha notis *bara när något avviker* (mitt förslag) eller en kort sammanfattning *varje dag* kl 13?
2. **Mätvärden:** Kan du ladda ner din förbrukning per timme eller kvart för det senaste året från Jönköping Energis Mina sidor (eller elhandlarens app)? Har du kvar några fakturor från innan september som visar effektavgiften i kW? Om ja bygger jag facit och tariffkalkylen på dina riktiga data i första versionen, annars kommer de i version två.
3. **Laddboxen:** Vilket märke, och hur är prisstyrningen inställd? Till exempel "klar till kl 07", "billigaste 4 timmarna" eller "under X öre". Det avgör om appen kan säga "i natt laddar boxen dyrt – byt till kl 23".
4. **Öppenhet:** Repot är **publikt**. Dokumentationen nämner nätbolag, värmepump och årsförbrukning, men inget namn eller adress. Är det okej? Om du hellre gör det privat fungerar allt utom gratis GitHub Pages. Då lägger jag appen på en annan gratis plats.

Säg gärna också om du ser något i riktningen ovan som inte stämmer med hur du vill använda appen.
