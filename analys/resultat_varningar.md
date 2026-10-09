# Efterhandstest av dagsplanen, signalen och orderboken

Genererad av `test/backtest.mjs`. Varje dygn 2025-10-09 – 2026-10-09 har simulerats med verkliga kvartspriser och Jönköping Energis säkringstariff. Husets förbrukning är beräknad (20 520 kWh/år).

**Dagsplanen** jämför varje kvart med de 30 dygnen före. *Dyrt* = vid eller över 80:e percentilen i minst 30 minuter, *billigt* = vid eller under 20:e percentilen i minst en timme. Beskedet för dygnet:
- **Lugnt**: ingen dyr period.
- **Svängigt**: dyra perioder, men de kostar huset mindre än 25 kr över normalpris (räknat med normaltemperatur).
- **Dra ner**: de dyra perioderna kostar huset minst 25 kr över normalpris. Då skickas en notis kl 13:40 dagen före.

ANTAGANDE för "dra ner": under de dyra perioderna flyttas 30 % av hushållselen till dygnets billigaste period, och värmepumpen går på halvfart i högst 3 timmar och tar igen det de 3 timmarna efter med 5 % extra energi. Merkostnad och besparing räknas med uppmätt temperatur.

| Månad | Lugnt | Svängigt | Dra ner | Timmar med dra ner | Husets merkostnad dra ner-dygnen | Sparat om du drar ner | Förvarningar (stämde) | Dyra dygn (förvarnade) |
|---|---|---|---|---|---|---|---|---|
| okt 2025 | 10 | 9 | 4 | 67 | 247 kr | 24 kr | 4 (3) | 6 (3) |
| nov 2025 | 15 | 5 | 10 | 181 | 770 kr | 59 kr | 8 (7) | 10 (7) |
| dec 2025 | 23 | 5 | 3 | 46 | 129 kr | 15 kr | 4 (1) | 3 (1) |
| jan 2026 | 3 | 12 | 16 | 281 | 977 kr | 65 kr | 10 (9) | 17 (9) |
| feb 2026 | 11 | 12 | 5 | 65 | 313 kr | 57 kr | 5 (1) | 2 (1) |
| mar 2026 | 21 | 7 | 3 | 43 | 101 kr | 20 kr | 0 (0) | 2 (0) |
| apr 2026 | 8 | 19 | 3 | 58 | 121 kr | 5 kr | 4 (3) | 4 (3) |
| maj 2026 | 9 | 17 | 5 | 87 | 190 kr | 8 kr | 7 (5) | 7 (5) |
| jun 2026 | 11 | 18 | 1 | 17 | 24 kr | 2 kr | 1 (0) | 3 (0) |
| jul 2026 | 14 | 17 | 0 | 0 | 0 kr | 0 kr | 1 (0) | 0 (0) |
| aug 2026 | 13 | 9 | 9 | 170 | 436 kr | 21 kr | 13 (11) | 14 (11) |
| sep 2026 | 9 | 15 | 6 | 97 | 263 kr | 26 kr | 5 (3) | 9 (3) |
| okt 2026 | 5 | 3 | 1 | 11 | 28 kr | 7 kr | 1 (0) | 1 (0) |
| **Summa** | **152** | **148** | **66** | **1 120** | **3 598 kr** | **309 kr** | **63 (43)** | **78 (43)** |

## Signalen

Vad signalen hade sagt kl 12 (bara dagens priser kända) och kl 20 (även morgondagens):

| Signal | kl 12 | kl 20 |
|---|---|---|
| Dra ner | 66 | 60 |
| Vänta | 16 | 190 |
| Kör nu | 226 | 66 |
| Spelar ingen roll | 58 | 50 |

## Orderboken: vad är raderna värda?

Beslut kl 18 med kända priser (i dag och i morgon), högst 24 h fram, jämfört med att köra direkt. Bastu och ugn bara dagtid (klara senast 21).

| Syssla | Sparat per körning (medel) | Dygn då raden är värd minst 1 kr | Antagna körningar/vecka | ≈ kr/år |
|---|---|---|---|---|
| Tvätt (1,0 kWh, 2 h) | 0,81 kr | 110 av 366 | 4 | 168 kr |
| Tork (2,5 kWh, 2 h) | 2,02 kr | 286 av 366 | 3 | 315 kr |
| Disk (1,0 kWh, 3 h) | 0,77 kr | 103 av 366 | 5 | 201 kr |
| Bastu (7,0 kWh, 2 h) | 4,85 kr | 305 av 366 | 1 | 252 kr |
| Ugn (1,5 kWh, 1 h) | 1,06 kr | 174 av 366 | 4 | 221 kr |
| **Summa** | | | | **1 158 kr** |

## Slutsatser

- Av 366 dygn var 152 lugna, 148 svängiga och **66 dra ner-dygn** (18 %, ungefär 1,3 i veckan). Bara dra ner-dygnen ger notis och röd färg.
- Under dra ner-dygnens dyra perioder kostade huset 3 598 kr mer än vid normalpris. Att dra ner enligt antagandet hade sparat ungefär **309 kr på ett år** (uppskattning).
- Att följa orderboken för tvätt, tork, disk, bastu och ugn (beslut kl 18) är värt ungefär **1 158 kr per år** med antagna körningar – uppskattning.
- Förvarningar 3 dygn i förväg: 63 st, varav 43 stämde (68 %). De fångade 43 av 78 dyra dygn (55 %).
