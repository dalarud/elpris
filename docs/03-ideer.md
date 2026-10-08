# Steg 3 – Idéer, brett

*Underlag: [utredningen](01-utredning.md), [problemformuleringen](02-problemformulering.md) och beräkningarna för ditt hushåll i [`analys/resultat_steg3.md`](../analys/resultat_steg3.md).*

## Vad dina svar ändrade

| Du sa | Vad utredningen visar | Konsekvens |
|---|---|---|
| Jönköping Energi, "fast avgift, **effektavgift**, överföring, energiskatt" | **Effektavgiften togs bort den 1 september 2026** för alla med säkring upp till 63 A, och bytet skedde automatiskt. Du har nu *säkringstariff*: 432,94 kr/mån (20 A) + 29,29 öre/kWh. Alternativet är *tidstariff*: 624,91 kr/mån + 37,84 öre vardagar 07–22 nov–mar och 9,21 öre övrig tid. | Effekttoppar kostar inte längre något. Valet mellan säkrings- och tidstariff blir i stället ett nytt engångsbeslut. |
| Thermia Calibra 12, kan kopplas upp men är inte uppkopplad | Calibra stöder **Smart Price**: gratis, styr både värme och varmvatten efter spotpriset. Kräver Thermia Online och mjukvaran Genesis 13.00 eller senare (standard sedan februari 2023). | **Det största som återstår att hämta finns redan i din värmepump.** |
| Laddbox med prisstyrning | Laddhybridens del (cirka 1 500 kr/år) är troligen redan hämtad, om inställningen är rätt. | Att bygga egen laddstyrning ger nästan inget. Det som återstår är att kontrollera inställningen och ge besked på undantagsdagar. |
| 20 A, 20 520 kWh/år | Mer än mitt första antagande (16 000). Räkningen blir cirka 41 500 kr/år. | Mer kWh gör varje öre värt mer. |
| "Sedan byter jag leverantör" | Varje öre i påslag är värt 256 kr/år för dig. | Appen ska fungera oavsett elhandlare, och avtalsjämförelse är värd att ha med. |

## Var pengarna finns för dig (uppskattning, senaste 12 mån)

| Scenario | Säkringstariff | Tidstariff |
|---|---|---|
| Ingen styrning | 43 050 kr | 42 880 kr |
| **Som idag** (laddboxen styr bilen) | **41 525 kr** | 41 140 kr |
| + Smart Price, försiktig inställning | 39 610 kr | 38 920 kr |
| + Smart Price, kraftig inställning | 39 200 kr | **38 430 kr** |

**Från idag till bästa scenariot: cirka 3 100 kr/år.** Av det kommer 1 900–2 300 kr från Smart Price och 700–800 kr från tidstariffen. Siffrorna bygger på en ANTAGEN fördelning av dina 20 520 kWh (hushåll 7 000, värme 9 000, varmvatten 2 000, bil 2 500) och en ANTAGEN ostyrd varmvattenprofil. Varmvattnets del är troligen i överkant. Med dina riktiga mätvärden kan siffrorna bli säkra.

## Idéer

Alla idéer bedöms på tre saker:
- **Värde** i kr/år för just dig (uppskattning).
- **Din insats**, där *ingen* är bäst och *dagligen* sämst.
- **Byggsvårighet**: L = låg, M = medel, H = hög.

### A. Engångsbeslut med guide

| # | Idé | Värde/år | Din insats | Bygg | Kommentar |
|---|---|---|---|---|---|
| A1 | **Koppla upp Calibran och slå på Smart Price** | **1 900–2 300 kr** | Engång, 30–60 min (nätverkskabel, kanske installatör för mjukvara) | L | Bäst kvot av allt. Appen bygger ingen egen styrning, den guidar och följer upp. |
| A2 | **Byt till tidstariff** | **≈ 400–800 kr** | Engång, ett samtal | L | Lönar sig om mindre än 31 % av förbrukningen ligger vardagar 07–22 nov–mar. Modellen säger 19–24 %. Kontrollera mot mätdata och bindningstid först. |
| A3 | Kontrollera laddboxens prisstyrning (klartid, laddmängd, att den inte laddar vid inkoppling) | Skyddar cirka 1 500 kr | Engång, 10 min | L | Billig försäkring. |
| A4 | Utred huvudsäkring 16 A | 1 232 kr | Engång + elektriker | M/H | Risk för att säkringen löser ut (elpatron, laddbox, spis). Gamla fakturor med effektavgift visar dina toppar i kW och ger ett första svar. **Ingen rekommendation utan data.** |
| A5 | Räkna på elavtalet när du byter (påslag, månadsavgift och din profil) | 0–1 000 kr | Vid varje byte, 5 min | M | 1 öre = 256 kr/år. Kampanjer med "gratis månadsavgift" tar slut. |
| A6 | Grundinställningar i Calibran: lägg legionellaprogrammet på natten, begränsa elpatronen, se över varmvattentemperaturen | 0–1 000 kr (mycket osäkert) | Engång | L | Kräver menykännedom. Elpatronen är dyr (cirka 3 gånger dyrare per värmeenhet). |
| A7 | 1 °C lägre inomhustemperatur | ≈ 770 kr | Komfort | L | Har inget med tidpunkt att göra, men är ärligt att nämna. |

### B. Dagligt beslutsstöd

| # | Idé | Värde/år | Din insats | Bygg | Kommentar |
|---|---|---|---|---|---|
| B1 | **Dagens besked**: en mening med kronor, t.ex. "Vanlig dag – inget att göra" eller "Kväll 17–20 dyr: en torkomgång kostar 6,80 kr nu mot 1,20 kr efter 22" | ≈ 400–500 kr + trygghet | Sekunder, när du vill | L/M | Ingen kurva. Säger "spelar ingen roll" när skillnaden är under 1 kr. |
| B2 | **"Ställ fördröjd start på 5 h"** i stället för klockslag, översatt direkt till diskmaskinens timer | Ingår i B1 | Sekunder | L | Matchar knapparna på maskinen. |
| B3 | **Notis kl 13 dagen före, bara när det spelar roll** (extremdygn, billig kväll och dyr natt, kyla) | ≈ 200–500 kr | 10–30 notiser/år | M | Det enda som kräver information du inte redan har. |
| B4 | NFC-tagg på diskmaskin, tvätt och tork: blippa telefonen och få beskedet för just den maskinen | Ingår i B1 | Blipp | L | Udda men nästan gratis. En tagg kostar några kronor och öppnar en länk. |
| B5 | Siri-genväg eller widget: "När ska jag diska?" | Ingår i B1 | Röst | L/M | Kräver bara en JSON-fil med dagens besked. |
| B6 | Kalenderflöde med dagens billiga och dyra fönster | Ingår i B1 | Ingen | L | Syns i telefonens kalender. |
| B7 | Lampa som lyser grönt, gult eller rött i köket (smart lampa) | Ingår i B1 | Ingen | M | Kräver hårdvara och hemautomation. |
| B8 | Helgprognos för tvätt (dag 2–7) | ≈ 50–100 kr | Låg | H | Prognoser bortom i morgon är osäkra. Måste märkas som uppskattning. |

### C. Facit och uppföljning

| # | Idé | Värde/år | Din insats | Bygg | Kommentar |
|---|---|---|---|---|---|
| C1 | **Månadsfacit från dina mätvärden**: "I september betalade du 64 öre/kWh, dygnsmedlet var 87 öre. Styrningen sparade cirka 210 kr." | Säkrar att A1–A3 faktiskt ger pengar | Ladda upp en fil per månad, 2 min | M | Det ingen annan app gör ärligt. Kalibrerar dessutom alla uppskattningar. |
| C2 | Före/efter-test av Smart Price och tidstariff på dina egna data | Bekräftar A1/A2 | Ingen extra | M | Hypotes H5 i steg 2. |
| C3 | Elpatronvakt: hitta timmar då elpatronen sannolikt gått | 0–1 000 kr | Ingen extra | M | Mönster i mätdata. Osäkert. |
| C4 | Kvartspris eller månadspris för just din profil | 0–500 kr | Ingen extra | L | Hypotes H3. |
| C5 | Läsare på elmätarens HAN-port för realtid | Som C1, men direkt | Köp (400–1 000 kr) + nätbolaget öppnar porten | M/H | Bra senare steg om C1 visar sig värdefullt. |
| C6 | Kontroll av fakturan mot beräknad kostnad | Skydd mot fel | Ingen extra | M | |

### D. Egen styrning

| # | Idé | Värde/år | Din insats | Bygg | Kommentar |
|---|---|---|---|---|---|
| D1 | Styra Calibran själv (Modbus TCP eller inofficiellt Thermia Online-API) | 0–400 kr mer än Smart Price | Engång + en dator som alltid är på hemma | H | Risk för komfort och drift. Gör inte detta före A1 och C2. |
| D2 | Egen laddstyrning via laddboxens API | 0–200 kr | Engång | M/H | Laddboxen gör redan detta. |
| D3 | Starta diskmaskinen via app eller smart kontakt | ≈ 140 kr | Hårdvara | M | Litet värde. |
| D4 | Lastbalansering för att klara 16 A | Möjliggör 1 232 kr | Elektriker | H | Säkerhetsfråga. Först utreda (A4). |

### E. Udda och större

| # | Idé | Värde/år | Bedömning |
|---|---|---|---|
| E1 | Hembatteri 10 kWh | Cirka 1 500–2 500 kr i prisarbitrage | Investering 50 000–80 000 kr ger mer än 15 års återbetalning utan stödtjänster. **Nej nu.** |
| E2 | Sälja värmepumpens flexibilitet via aggregator | 0–500 kr | Ingen känd lokal marknad i Jönköping. Parkeras. |
| E3 | Köra laddhybriden på bensin de dyraste dagarna | ≈ 0 kr | El var dyrare än bensin i 13 kvartar på ett år. **Nej, men det är ett ärligt besked: "ladda alltid".** |
| E4 | Större varmvatten- eller ackumulatortank | Ökar A1:s värde något | Investering. Senare. |
| E5 | Familjeläge: samma besked till alla i hushållet | Litet | Enkelt tillägg till B3. |
| E6 | Månadsbudget: prognos för månadens elkostnad | Planering, inga kronor | Kan komma senare. |
| E7 | Jämförelse med grannar eller poäng | — | **Nej.** Går emot "inga fler kurvor". |

## Bedömning

Sorterat efter värde i förhållande till din insats och byggsvårigheten:

1. **A1 Smart Price** (≈ 2 000 kr, en timme en gång). Har inget med appbygget att göra, men är det viktigaste rådet. Appen ska guida dit och sedan visa att det fungerar.
2. **A2 tidstariff** (≈ 400–800 kr, ett samtal). Ska bekräftas med dina mätvärden.
3. **B1+B2+B3 besked och notiser** (≈ 600–1 000 kr + trygghet). Det dagliga stödet du bad om, i en form som kräver sekunder.
4. **C1 facit** (säkrar att 1–3 ger pengar, kalibrerar allt). Kräver att du kan ta fram mätvärden.
5. **A3–A7** som punkter i en engångsguide.
6. **D och E** väntar. Egen styrning ger lite mer än det som redan finns inbyggt och kostar mycket att bygga.

Den viktigaste insikten är att appens största nytta inte är att räkna ut när el är billig. Det gör laddboxen och Calibran redan, eller kan göra. Nyttan ligger i att **få dem påslagna, kontrollera att de fungerar, säga till när något avviker och låta dig strunta i resten**.
