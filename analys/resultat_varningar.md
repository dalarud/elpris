# Efterhandstest av varningarna

Genererad av `test/backtest.mjs`. Varje dygn 2025-10-09 – 2026-10-09 har simulerats som om Elkollen kört kl 13:30 dagen före, med verkliga kvartspriser och Jönköping Energis säkringstariff. Husets förbrukning är beräknad (20 520 kWh/år, verklig temperatur i Jönköping).

**Varning (känt pris)** = de dyra perioderna i morgon (minst 30 min med totalpris minst 40 % över normalt, median 30 dygn) kostar huset minst 25 kr extra. Kolumnen "Dygn med dyra perioder" visar hur ofta det hade varnats utan kronorgränsen.

** **Förvarning** = dygnet 3 dagar fram uppskattas få ett dygnsmedel ≥ 1,5 × normalt. Förvarningarna är här beräknade med *uppmätt* väder i stället för prognos, och blir därför något för bra – se `analys/resultat_prismodell.md` för utvärdering med prognosfel.

ANTAGANDE för "dra ner": under en varnad period flyttas 30 % av hushållselen (tvätt, tork, disk, ugn) till dygnets billigaste 3 timmar, och värmepumpen går på halvfart i högst 3 timmar och tar igen det de 3 timmarna efter perioden med 5 % extra energi.

| Månad | Dygn med dyra perioder | Dygn med varning | varav mycket dyrt | Varnade timmar | Husets merkostnad under varningarna | Sparat om du drar ner | Förvarningar (stämde) | Dyra dygn (förvarnade) |
|---|---|---|---|---|---|---|---|---|
| okt 2025 | 14 | 4 av 23 | 4 | 74 | 257 kr | 31 kr | 4 (3) | 6 (3) |
| nov 2025 | 18 | 10 av 30 | 8 | 187 | 783 kr | 60 kr | 8 (7) | 10 (7) |
| dec 2025 | 8 | 2 av 31 | 1 | 28 | 94 kr | 12 kr | 4 (1) | 3 (1) |
| jan 2026 | 22 | 14 av 31 | 6 | 200 | 802 kr | 68 kr | 10 (9) | 17 (9) |
| feb 2026 | 8 | 3 av 28 | 2 | 28 | 212 kr | 44 kr | 5 (1) | 2 (1) |
| mar 2026 | 7 | 3 av 31 | 3 | 29 | 86 kr | 20 kr | 0 (0) | 2 (0) |
| apr 2026 | 19 | 3 av 30 | 3 | 49 | 113 kr | 15 kr | 4 (3) | 4 (3) |
| maj 2026 | 20 | 6 av 31 | 2 | 94 | 212 kr | 17 kr | 7 (5) | 7 (5) |
| jun 2026 | 12 | 0 av 30 | 0 | 0 | 0 kr | 0 kr | 1 (0) | 3 (0) |
| jul 2026 | 2 | 0 av 31 | 0 | 0 | 0 kr | 0 kr | 1 (0) | 0 (0) |
| aug 2026 | 23 | 11 av 31 | 11 | 239 | 545 kr | 49 kr | 13 (11) | 14 (11) |
| sep 2026 | 22 | 7 av 30 | 5 | 132 | 315 kr | 31 kr | 5 (3) | 9 (3) |
| okt 2026 | 4 | 1 av 9 | 0 | 11 | 28 kr | 6 kr | 1 (0) | 1 (0) |
| **Summa** | **179** | **64** | **45** | **1 070** | **3 447 kr** | **353 kr** | **63 (43)** | **78 (43)** |

## Slutsatser

- Elkollen hade varnat för morgondagen **64 dygn av 366** (17 %), varav 45 med *mycket dyrt*. Utan kronorgränsen hade det blivit 179 dygn – vanliga kvällstoppar som inte är värda en notis.
- Under de varnade perioderna kostade huset 3 447 kr mer än vid normalpris. Det är 54 % av all merkostnad över normalpris under året; resten är korta toppar under 30 minuter eller nivåer strax under gränsen.
- Att dra ner enligt antagandet ovan hade sparat ungefär **353 kr på ett år** (uppskattning).
- Förvarningar 3 dygn i förväg: 63 st, varav 43 stämde (68 %). De fångade 43 av 78 dyra dygn (55 %).
