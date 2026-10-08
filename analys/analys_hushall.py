"""Steg 3: siffror för användarens hushåll (Jönköping Energi, Thermia Calibra 12,
laddhybrid med prisstyrd laddbox, 20 A, 20 520 kWh/år).

Bygger en kvartsprofil för senaste 12 månaderna med verkliga SE3-priser och
räknar årskostnad för olika scenarier (ostyrt/styrt, säkrings-/tidstariff).
Skriver analys/resultat_steg3.md.

Kör: python3 analys/analys_hushall.py
"""
from pathlib import Path

import numpy as np
import pandas as pd

from analys_besparing import MOMS, TZ, VARME_MANAD, fmt, las_priser

UT = Path(__file__).resolve().parent / "resultat_steg3.md"

# --- Kända fakta (användaren + Jönköping Energi Nät, priser fr.o.m. 2026-09-01, inkl. moms) ---
ARSFORBRUKNING = 20520
SAKRING = {"16 A": 330.28, "20 A": 432.94, "25 A": 522.24}           # kr/mån, säkringstariff
TID_FAST = {"16 A": 513.52, "20 A": 624.91, "25 A": 784.74}          # kr/mån, tidstariff
OVERFORING_SAKRING = 0.2929                                          # kr/kWh
OVERFORING_TID_HOG, OVERFORING_TID_LAG = 0.3784, 0.0921              # vardagar 07-22 nov-mar / övrig tid
ENERGISKATT = 0.45                                                   # 36,0 öre + moms
# --- ANTAGANDEN (kalibreras mot mätdata om sådan finns) ---
PASLAG = 0.04                     # öre/kWh exkl. moms -> kr
MANADSAVGIFT_HANDEL = 49
HUSHALL_KWH = 7000
VARME_KWH = 9000
VV_KWH_DAG = 5.5                  # ca 2 000 kWh/år
BIL_KWH, BIL_KW, BIL_GGR = 10.0, 3.7, 250
FORM = np.array([0.6, 0.5, 0.5, 0.5, 0.5, 0.6, 0.9, 1.2, 1.1, 0.9, 0.9, 0.9,
                 1.0, 0.9, 0.9, 1.0, 1.2, 1.5, 1.6, 1.5, 1.4, 1.2, 1.0, 0.8])


def hoglast(idx):
    return (idx.month.isin([1, 2, 3, 11, 12])) & (idx.weekday < 5) & (idx.hour >= 7) & (idx.hour < 22)


def profiler(p, styrd_bil, styrd_vv, varme_alfa, signal=None):
    """Kvartsvis last (kWh) för varje del av hushållet. signal = prisserie som
    styrningen optimerar mot (default spotpris)."""
    idx = p.index
    sig = p if signal is None else signal
    n = len(p)
    hus = FORM[idx.hour] / FORM.mean() * HUSHALL_KWH / (365 * 96)
    varme = np.zeros(n)
    vv = np.zeros(n)
    bil = np.zeros(n)
    dag_nr = pd.Index(idx.date)
    bil_kvartar = int(np.ceil(BIL_KWH / (BIL_KW * 0.25)))
    laddsannolikhet = BIL_GGR / 365  # bilen laddas i snitt så här stor del av dygnen
    for d in sorted(set(dag_nr)):
        i = np.where(dag_nr == d)[0]
        dag = pd.Timestamp(d)
        e = VARME_KWH * VARME_MANAD[dag.month] / sum(VARME_MANAD.values()) / dag.days_in_month
        bas = np.full(len(i), e / len(i))
        if varme_alfa:
            ordning = np.argsort(sig.to_numpy()[i])
            halv = len(i) // 2
            bas[ordning[halv:]] *= 1 - varme_alfa
            bas[ordning[:halv]] *= 1 + varme_alfa * 1.05  # 5 % energistraff på den flyttade delen
        varme[i] = bas
        timmar = idx.hour[i]
        if styrd_vv:
            s2 = np.convolve(sig.to_numpy()[i], np.ones(8), mode="valid")
            start = int(np.argmin(s2))
            vv[i[start:start + 8]] = VV_KWH_DAG * 1.10 / 8
        else:
            m = ((timmar >= 7) & (timmar < 9)) | ((timmar >= 18) & (timmar < 20))
            vv[i[m]] = VV_KWH_DAG / m.sum()
        # Bilen: kopplas in 17:00, klar 07:00 nästa dygn
        start17 = i[timmar >= 17]
        if len(start17) == 0:
            continue
        fonster = np.arange(start17[0], min(start17[0] + 14 * 4, n))
        if styrd_bil:
            valda = fonster[np.argsort(sig.to_numpy()[fonster])[:bil_kvartar]]
        else:
            valda = fonster[:bil_kvartar]
        bil[valda] += BIL_KW * 0.25 * laddsannolikhet
    return {"Hushållsel": hus, "Rumsvärme": varme, "Varmvatten": vv, "Laddhybrid": bil}


def kostnad(p, last, tariff, sakring="20 A"):
    tot = sum(last.values())
    kwh = tot.sum()
    spot = (tot * p.to_numpy()).sum() * MOMS
    handel = kwh * PASLAG * MOMS + MANADSAVGIFT_HANDEL * 12
    skatt = kwh * ENERGISKATT
    if tariff == "säkring":
        nat = kwh * OVERFORING_SAKRING + SAKRING[sakring] * 12
    else:
        hl = hoglast(p.index)
        nat = (tot[hl].sum() * OVERFORING_TID_HOG + tot[~hl].sum() * OVERFORING_TID_LAG) + TID_FAST[sakring] * 12
    return {"kWh": kwh, "spot": spot, "handel": handel, "skatt": skatt, "nat": nat,
            "summa": spot + handel + skatt + nat, "andel_hoglast": tot[hoglast(p.index)].sum() / kwh}


def main():
    s, _ = las_priser()
    slut = (s.index[-1] - pd.Timedelta(days=2)).normalize()
    start = slut - pd.Timedelta(days=365)
    p = s[(s.index >= start) & (s.index < slut)]
    ut = []
    w = ut.append
    w("# Resultat steg 3: ditt hushåll\n")
    w(f"Genererad av `analys/analys_hushall.py`. Verkliga SE3-priser {start.date()} – {(slut - pd.Timedelta(days=1)).date()}. "
      "Nätavgifter: Jönköping Energi Nät fr.o.m. 2026-09-01 (inkl. moms). Alla belopp inkl. moms.\n")
    w(f"**ANTAGEN fördelning av {fmt(ARSFORBRUKNING, 0)} kWh:** hushållsel {fmt(HUSHALL_KWH, 0)}, rumsvärme {fmt(VARME_KWH, 0)}, "
      f"varmvatten {fmt(VV_KWH_DAG * 365, 0)}, laddhybrid {fmt(BIL_KWH * BIL_GGR, 0)} kWh. Kalibreras mot dina mätvärden om du kan ta fram dem.\n")

    tid_signal = s.copy()
    hl = hoglast(tid_signal.index)
    tid_signal[hl] += (OVERFORING_TID_HOG - OVERFORING_TID_LAG) / MOMS
    tid_signal[~hl] += 0
    tid_signal = tid_signal[(tid_signal.index >= start) & (tid_signal.index < slut)]

    scen = [
        ("A. Ingen styrning", dict(styrd_bil=False, styrd_vv=False, varme_alfa=0)),
        ("B. Som idag: laddboxen styr bilen", dict(styrd_bil=True, styrd_vv=False, varme_alfa=0)),
        ("C. + Smart Price på Calibra, försiktig (±30 %)", dict(styrd_bil=True, styrd_vv=True, varme_alfa=0.3)),
        ("D. + Smart Price, kraftig (±50 %)", dict(styrd_bil=True, styrd_vv=True, varme_alfa=0.5)),
    ]
    rader = {}
    for namn, kw in scen:
        last = profiler(p, **kw)
        rader[namn] = (kostnad(p, last, "säkring"), kostnad(p, last, "tid"), last)
    # Scenario där styrningen också känner till tidstariffen
    last_tid = profiler(p, styrd_bil=True, styrd_vv=True, varme_alfa=0.5, signal=tid_signal)
    rader["E. Som D, men styrningen tar hänsyn till tidstariffen"] = (kostnad(p, last_tid, "säkring"), kostnad(p, last_tid, "tid"), last_tid)

    w("## Årskostnad per scenario\n")
    w("| Scenario | kWh | Säkringstariff 20 A | Tidstariff 20 A | Andel kWh i höglast | Billigast |")
    w("|---|---|---|---|---|---|")
    bas = rader["A. Ingen styrning"][0]["summa"]
    idag = rader["B. Som idag: laddboxen styr bilen"][0]["summa"]
    for namn, (ks, kt, _) in rader.items():
        bast = "säkring" if ks["summa"] <= kt["summa"] else f"tid (−{fmt(ks['summa'] - kt['summa'], 0)} kr)"
        w(f"| {namn} | {fmt(ks['kWh'], 0)} | {fmt(ks['summa'], 0)} kr | {fmt(kt['summa'], 0)} kr | {ks['andel_hoglast']:.0%} | {bast} |")
    w("")
    w("Tidstariffen lönar sig om mindre än cirka 31 % av förbrukningen ligger vardagar 07–22 nov–mar "
      "(den fasta avgiften är 2 304 kr/år högre för 20 A, överföringen 37,84 i stället för 29,29 öre i höglast och 9,21 öre i övrigt).\n")

    w("## Vad varje steg är värt (säkringstariff)\n")
    w("| Steg | Besparing/år |")
    w("|---|---|")
    nyckel = list(rader)
    for a, b in zip(nyckel[:-2], nyckel[1:-1]):
        w(f"| {a} → {b} | {fmt(rader[a][0]['summa'] - rader[b][0]['summa'], 0)} kr |")
    w(f"| Totalt från ostyrt (A) till kraftig styrning (D) | {fmt(bas - rader[nyckel[3]][0]['summa'], 0)} kr |")
    w(f"| **Kvar att hämta från idag (B) till C–D** | **{fmt(idag - rader[nyckel[2]][0]['summa'], 0)} – {fmt(idag - rader[nyckel[3]][0]['summa'], 0)} kr** |")
    w("")

    w("## Kostnadsposter, scenario B (som idag), säkringstariff 20 A\n")
    k = rader["B. Som idag: laddboxen styr bilen"][0]
    w("| Post | kr/år | Andel |")
    w("|---|---|---|")
    for post, namn in (("spot", "Spotpris"), ("handel", "Påslag + månadsavgift elhandel"), ("skatt", "Energiskatt"), ("nat", "Nätavgift (fast + överföring)")):
        w(f"| {namn} | {fmt(k[post], 0)} | {k[post] / k['summa']:.0%} |")
    w(f"| **Summa** | **{fmt(k['summa'], 0)}** | |")
    w("")
    last_b = rader["B. Som idag: laddboxen styr bilen"][2]
    w("### Spotkostnad per del (scenario B)\n")
    w("| Del | kWh | Snittpris spot exkl. moms | Dygnsmedel |")
    w("|---|---|---|---|")
    for del_, l in last_b.items():
        w(f"| {del_} | {fmt(l.sum(), 0)} | {fmt(100 * (l * p.to_numpy()).sum() / l.sum(), 1)} öre | {fmt(100 * p.mean(), 1)} öre |")
    w("")

    # Engångsbeslut
    w("## Engångsbeslut utan tidsflytt\n")
    marginal = p.mean() * MOMS + PASLAG * MOMS + ENERGISKATT + OVERFORING_SAKRING
    w("| Beslut | Besparing/år | Förutsättning |")
    w("|---|---|---|")
    w(f"| Huvudsäkring 20 A → 16 A | {fmt((SAKRING['20 A'] - SAKRING['16 A']) * 12, 0)} kr | Att huset klarar sig på 16 A (bergvärme + elpatron + laddbox + spis). Måste utredas, kan inte rekommenderas utan mätdata. |")
    w(f"| 1 °C lägre inomhustemperatur (≈ 5 % av värmen) | ≈ {fmt(VARME_KWH * 0.05 * marginal, 0)} kr | Komfort. Rörligt pris per kWh ≈ {fmt(marginal)} kr. |")
    w(f"| 100 kWh mindre elpatron (direktel i stället för värmepump, COP ≈ 3) | ≈ {fmt(100 * (1 - 1 / 3) * marginal, 0)} kr per 100 kWh | Att elpatronen går i onödan, går att se i mätdata. |")
    w(f"| 1 öre/kWh lägre påslag hos elhandlaren | {fmt(ARSFORBRUKNING * 0.01 * MOMS, 0)} kr | Byte av elavtal. |")
    w("")
    UT.write_text("\n".join(ut) + "\n")
    print("\n".join(ut))


if __name__ == "__main__":
    main()
