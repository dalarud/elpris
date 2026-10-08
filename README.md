# elpris

Ett produktutvecklingsprojekt: en app som hjälper ett hushåll i elområde SE3 (kvartsprisavtal, laddhybrid, bergvärme) att använda el när den är billig och undvika den när den är dyr. Råden ska ges i kronor och kunna förstås på några sekunder.

## Status

| Steg | Innehåll | Status |
|---|---|---|
| 1. Utred | [docs/01-utredning.md](docs/01-utredning.md) | ✅ Klart 2026-10-08 |
| 2. Formulera problemet | [docs/02-problemformulering.md](docs/02-problemformulering.md) | ✅ Klart 2026-10-08 |
| 3. Spåna brett | — | ⏳ Väntar på avstämning |
| 4. Föreslå riktning, stäm av | — | |
| 5. Bygg första version | — | |
| 6. Utvärdera och förbättra | — | |

Beslut, antaganden och öppna frågor: [docs/beslutslogg.md](docs/beslutslogg.md)

## Viktigaste fynden hittills

- Tidpunkten är värd cirka **3 500 kr/år** för ett hushåll som detta (uppskattning på verkliga SE3-priser senaste 12 månaderna), ungefär 10 % av elräkningen.
- Ungefär **90 % av det kommer från laddhybriden och bergvärmen**. Disk, tvätt och tork är värda cirka 400 kr/år tillsammans.
- Dygnsmönstret är förutsägbart. En fast timer fångar 87–94 % av värdet. Det som är svårt är automatik och undantagsdagar, inte prognoser.

## Analys

```
python3 analys/hamta_priser.py SE3 2022-11-01 2026-10-09 data/spotpris_SE3.csv   # hämtar bara saknade dygn
python3 analys/analys_besparing.py                                              # skriver analys/resultat_steg1.md
```

Kräver Python 3.11+ med pandas och numpy. Prisdata: [elprisetjustnu.se](https://www.elprisetjustnu.se) (källa ENTSO-E).
