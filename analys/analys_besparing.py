"""Hur mycket pengar rör det sig om? Analys av verkliga SE3-priser.

Läser data/spotpris_SE3.csv (från hamta_priser.py) och räknar fram vad det hade
sparat att flytta olika laster i tid. Resultatet skrivs som Markdown till
analys/resultat_steg1.md.

Grundprincip: bara spotpriset varierar över dygnet för ett hushåll med
kvartsprisavtal och nätavgift utan tidsdifferentiering. Påslag, energiskatt och
överföringsavgift är samma i alla kvartar och tar ut varandra när man jämför två
tidpunkter. Skillnaden i kronor = skillnad i spotpris x 1,25 (moms).

Alla antaganden om förbrukning är markerade ANTAGANDE och samlade högst upp.

Kör: python3 analys/analys_besparing.py
"""
import math
from pathlib import Path

import numpy as np
import pandas as pd

ROT = Path(__file__).resolve().parent.parent
DATA = ROT / "data" / "spotpris_SE3.csv"
UT = ROT / "analys" / "resultat_steg1.md"
TZ = "Europe/Stockholm"
MOMS = 1.25

# --- ANTAGANDEN (ersätts med användarens verkliga värden i steg 4) -----------
DISK_KWH, DISK_TIM = 1.0, 2.5          # diskmaskin, normalprogram
TVATT_KWH, TVATT_TIM = 0.8, 2.0        # tvätt 40 grader
TORK_KWH, TORK_TIM = 2.0, 2.0          # torktumlare (värmepumpstork ca 1-2 kWh, vanlig 3-4)
BIL_KWH = 10.0                         # laddhybrid, energi från nätet per laddtillfälle (inkl. förluster)
BIL_KW = 3.7                           # laddeffekt 1-fas 16 A
BIL_IN, BIL_KLAR = 17, 7               # bilen kopplas in 17:00, ska vara klar 07:00
BIL_GGR_PER_AR = 250
VV_KWH_DAG = 4.0                       # varmvatten via bergvärmen, el per dygn
VARME_KWH_AR = 7000.0                  # bergvärme, el till rumsuppvärmning per år
# Andel av årets uppvärmningsbehov per månad (graddagar, ungefärligt Mellansverige)
VARME_MANAD = {1: 15.5, 2: 13.5, 3: 12.0, 4: 8.0, 5: 4.0, 6: 1.0, 7: 0.5, 8: 0.7,
               9: 3.3, 10: 8.0, 11: 12.5, 12: 15.0}
# ---------------------------------------------------------------------------


def las_priser():
    df = pd.read_csv(DATA)
    start = pd.to_datetime(df["start"], utc=True)
    slut = pd.to_datetime(df["slut"], utc=True)
    langd = (slut - start).dt.total_seconds() / 60
    rader = []
    for s, l, p in zip(start, langd, df["sek_per_kwh"]):
        n = int(round(l / 15))
        for i in range(n):
            rader.append((s + pd.Timedelta(minutes=15 * i), p))
    serie = pd.Series([p for _, p in rader], index=pd.DatetimeIndex([t for t, _ in rader]))
    serie = serie[~serie.index.duplicated()].sort_index()
    full = pd.date_range(serie.index[0], serie.index[-1], freq="15min")
    saknas = len(full) - len(serie)
    serie = serie.reindex(full).ffill()
    serie.index = serie.index.tz_convert(TZ)
    return serie, saknas


def fonster(s, t0, t1):
    return s[(s.index >= t0) & (s.index < t1)].to_numpy()


def kostnad_fast_start(s, t0, kwh, timmar):
    n = int(round(timmar * 4))
    p = fonster(s, t0, t0 + pd.Timedelta(minutes=15 * n))
    if len(p) < n:
        return None
    return p.mean() * kwh * MOMS


def kostnad_basta_sammanhangande(s, t0, t1, kwh, timmar):
    """Billigaste start för ett program som måste gå i ett svep."""
    n = int(round(timmar * 4))
    p = fonster(s, t0, t1)
    if len(p) < n:
        return None, None
    medel = np.convolve(p, np.ones(n) / n, mode="valid")
    i = int(np.argmin(medel))
    return medel[i] * kwh * MOMS, i


def kostnad_basta_kvartar(p, kwh, kw):
    """Billigaste kvartar (behöver inte ligga i följd), t.ex. elbilsladdning."""
    n = math.ceil(kwh / (kw * 0.25))
    if len(p) < n:
        return None
    billigast = np.sort(p)[:n]
    return billigast.mean() * kwh * MOMS


def dagar(s, fran, till):
    d0 = pd.Timestamp(fran, tz=TZ)
    d1 = pd.Timestamp(till, tz=TZ)
    return pd.date_range(d0, d1, freq="D", tz=TZ)


def kl(dag, timme):
    return pd.Timestamp(year=dag.year, month=dag.month, day=dag.day, hour=0, tz=TZ) + pd.Timedelta(hours=timme)


def analysera_period(s, fran, till):
    rad = []
    for dag in dagar(s, fran, till):
        r = {"dag": dag.date()}
        # Diskmaskin: start 19:00 direkt, eller billigaste start så att den är klar 07:00
        bas = kostnad_fast_start(s, kl(dag, 19), DISK_KWH, DISK_TIM)
        opt, _ = kostnad_basta_sammanhangande(s, kl(dag, 19), kl(dag, 31), DISK_KWH, DISK_TIM)
        fast_timer = kostnad_fast_start(s, kl(dag, 26), DISK_KWH, DISK_TIM)  # alltid 02:00
        if bas is None or opt is None or fast_timer is None:
            continue
        r["disk_bas"], r["disk_opt"], r["disk_timer"] = bas, opt, fast_timer
        # Elbil: laddar direkt 17:00 vs billigaste kvartar fram till 07:00
        n = math.ceil(BIL_KWH / (BIL_KW * 0.25))
        p_bil = fonster(s, kl(dag, BIL_IN), kl(dag, 24 + BIL_KLAR))
        r["bil_bas"] = p_bil[:n].mean() * BIL_KWH * MOMS
        r["bil_opt"] = kostnad_basta_kvartar(p_bil, BIL_KWH, BIL_KW)
        r["bil_timer"] = kostnad_fast_start(s, kl(dag, 24 + 1), BIL_KWH, n / 4)  # alltid 01:00
        # Timvis optimering (som ett timprisavtal/timstyrning) för att mäta värdet av kvartar
        tim = p_bil[: len(p_bil) // 4 * 4].reshape(-1, 4).mean(axis=1)
        ntim = math.ceil(n / 4)
        r["bil_opt_tim"] = np.sort(tim)[:ntim].mean() * BIL_KWH * MOMS
        # Varmvatten: 50 % kl 07-09 och 50 % kl 18-20 vs billigaste 2 h under dygnet
        # (med 10 % extra el för högre lagringstemperatur)
        bas_vv = 0.5 * kostnad_fast_start(s, kl(dag, 7), VV_KWH_DAG, 2) + 0.5 * kostnad_fast_start(s, kl(dag, 18), VV_KWH_DAG, 2)
        opt_vv, _ = kostnad_basta_sammanhangande(s, kl(dag, 0), kl(dag, 24), VV_KWH_DAG * 1.10, 2)
        r["vv_bas"], r["vv_opt"] = bas_vv, opt_vv
        # Rumsvärme: jämn last över dygnet vs modulering +-ALFA runt medel (daglig summa
        # bevarad), 5 % extra energi för värmeförluster/sämre COP på den flyttade delen.
        p_dag = fonster(s, kl(dag, 0), kl(dag, 24))
        e_dag = VARME_KWH_AR * VARME_MANAD[dag.month] / sum(VARME_MANAD.values()) / pd.Timestamp(dag).days_in_month
        r["varme_kwh"] = e_dag
        r["varme_bas"] = p_dag.mean() * e_dag * MOMS
        for alfa in (0.3, 0.5):
            sortp = np.sort(p_dag)
            halv = len(sortp) // 2
            # dyraste halvan minskas med alfa, billigaste halvan ökas med alfa
            besp = alfa * e_dag / len(p_dag) * (sortp[halv:].sum() - sortp[:halv].sum()) * MOMS
            straff = alfa * e_dag / 2 * 0.05 * sortp[:halv].mean() * MOMS
            r[f"varme_besp_{alfa}"] = besp - straff
        # Dygnsstatistik
        r["medel"] = p_dag.mean()
        r["min"], r["max"] = p_dag.min(), p_dag.max()
        r["spread"] = p_dag.max() - p_dag.min()
        rad.append(r)
    return pd.DataFrame(rad).set_index("dag")


def generiskt_flyttvarde(s, fran, till):
    """Öre/kWh (inkl. moms) som sparas om en 2-timmarslast som startar kl h
    i stället får starta när som helst inom W timmar."""
    tabell = {}
    for h in (7, 12, 17, 19, 22):
        for w in (3, 6, 12, 24):
            v = []
            for dag in dagar(s, fran, till):
                bas = kostnad_fast_start(s, kl(dag, h), 1.0, 2)
                opt, _ = kostnad_basta_sammanhangande(s, kl(dag, h), kl(dag, h + w + 2), 1.0, 2)
                if bas is not None and opt is not None:
                    v.append(bas - opt)
            tabell[(h, w)] = 100 * np.mean(v)
    return tabell


def kvartsanalys(s, fran, till):
    """Hur mycket skiljer kvartarna inom en timme?"""
    d = s[(s.index >= pd.Timestamp(fran, tz=TZ)) & (s.index < pd.Timestamp(till, tz=TZ))]
    df = pd.DataFrame({"p": d})
    df["tim"] = df.index.tz_convert("UTC").floor("h")  # UTC undviker dubbeltimmen vid vintertid
    df["timmedel"] = df.groupby("tim")["p"].transform("mean")
    avvik = (df["p"] - df["timmedel"]).abs()
    inom = df.groupby("tim")["p"].agg(lambda x: x.max() - x.min())
    return avvik.mean(), inom.mean(), (inom > 0.10).mean(), (inom > 0.25).mean()


def elrakning(s, fran, till, vitvaror_besp, bil_besp, vv_besp, varme_lag, varme_hog):
    """Grov årskostnad för ett hus som användarens, med verkliga spotpriser och en
    antagen lastprofil. Returnerar Markdown."""
    d = s[(s.index >= pd.Timestamp(fran, tz=TZ)) & (s.index < pd.Timestamp(till, tz=TZ))]
    # Hushållsel 5 000 kWh/år med typisk dygnsprofil (ANTAGANDE)
    form = np.array([0.6, 0.5, 0.5, 0.5, 0.5, 0.6, 0.9, 1.2, 1.1, 0.9, 0.9, 0.9,
                     1.0, 0.9, 0.9, 1.0, 1.2, 1.5, 1.6, 1.5, 1.4, 1.2, 1.0, 0.8])
    hus = form[d.index.hour] / form.mean() * 5000 / (365 * 96)
    varme = np.array([VARME_KWH_AR * VARME_MANAD[m] / sum(VARME_MANAD.values()) / pd.Timestamp(t).days_in_month / 96
                      for t, m in zip(d.index, d.index.month)])
    vv = np.where(((d.index.hour >= 7) & (d.index.hour < 9)) | ((d.index.hour >= 18) & (d.index.hour < 20)), VV_KWH_DAG / 16, 0)
    bil = np.where((d.index.hour >= 17) & (d.index.minute + 60 * d.index.hour < 17 * 60 + BIL_KWH / BIL_KW * 60),
                   BIL_KW * 0.25 * BIL_GGR_PER_AR / 365, 0)
    last = hus + varme + vv + bil
    kwh = last.sum()
    spot = (last * d.to_numpy()).sum() * MOMS
    profilpris = (last * d.to_numpy()).sum() / kwh
    rader = []
    rader.append(f"ANTAGANDE: hushållsel 5 000 kWh, rumsvärme {fmt(VARME_KWH_AR, 0)} kWh, varmvatten {fmt(VV_KWH_DAG * 365, 0)} kWh, "
                 f"laddhybrid {fmt(BIL_KWH * BIL_GGR_PER_AR, 0)} kWh = **{fmt(kwh, 0)} kWh/år**. Ostyrd profil (bilen laddar 17:00, varmvatten morgon/kväll).\n")
    rader.append("| Post | Ellevio (26 öre, 20 A) | Vattenfall enkeltariff (44,5 öre, 20 A) | Påverkas av tidpunkt? |")
    rader.append("|---|---|---|---|")
    skatt = 0.45 * kwh
    pasl = 0.04 * MOMS * kwh + 49 * 12
    rader.append(f"| Spotpris inkl. moms (snitt {fmt(100 * profilpris, 0)} öre exkl. moms för denna profil, mot {fmt(100 * d.mean(), 0)} öre rakt medel) | {fmt(spot, 0)} kr | {fmt(spot, 0)} kr | **Ja** |")
    rader.append(f"| Elhandlarens påslag 4 öre + 49 kr/mån | {fmt(pasl, 0)} kr | {fmt(pasl, 0)} kr | Nej |")
    rader.append(f"| Energiskatt 36 öre (45 inkl. moms) | {fmt(skatt, 0)} kr | {fmt(skatt, 0)} kr | Nej |")
    rader.append(f"| Överföringsavgift | {fmt(0.26 * kwh, 0)} kr | {fmt(0.445 * kwh, 0)} kr | Nej (enkeltariff) |")
    rader.append(f"| Fast nätavgift 20 A | {fmt(590 * 12, 0)} kr | {fmt(8085, 0)} kr | Nej (men säkringsstorleken går att välja) |")
    tot_e = spot + pasl + skatt + 0.26 * kwh + 590 * 12
    tot_v = spot + pasl + skatt + 0.445 * kwh + 8085
    rader.append(f"| **Summa** | **{fmt(tot_e, 0)} kr** | **{fmt(tot_v, 0)} kr** | |")
    rader.append("")
    lag = vitvaror_besp + bil_besp + vv_besp + varme_lag
    hog = vitvaror_besp + bil_besp + vv_besp + varme_hog
    rader.append(f"- Spotdelen är {spot / tot_e:.0%}–{spot / tot_v:.0%} av räkningen. Resten påverkas inte av när elen används.")
    rader.append(f"- Uppskattad besparing från tidsflytt ({fmt(lag, 0)}–{fmt(hog, 0)} kr) motsvarar **{lag / tot_v:.0%}–{hog / tot_e:.0%} av hela räkningen** "
                 f"och {lag / spot:.0%}–{hog / spot:.0%} av spotkostnaden.")
    rader.append(f"- Varav vitvaror (disk, tvätt, tork): {fmt(vitvaror_besp, 0)} kr/år.")
    return "\n".join(rader) + "\n"


def fmt(x, dec=2):
    return f"{x:,.{dec}f}".replace(",", " ").replace(".", ",")


def main():
    s, saknas = las_priser()
    ut = []
    w = ut.append
    w("# Resultat steg 1: vad är tidpunkten värd i kronor?\n")
    w(f"Genererad av `analys/analys_besparing.py`. Data: elprisetjustnu.se (ENTSO-E), SE3, "
      f"{s.index[0].date()} – {s.index[-1].date()}. Saknade kvartar (ifyllda med föregående värde): {saknas}.\n")
    w("Alla kronor är **inklusive 25 % moms**. Bara spotpriset varierar över dygnet; påslag, "
      "energiskatt och överföringsavgift är lika i alla kvartar (antar nätavgift utan tidsdifferentiering).\n")

    # --- Prisnivåer -----------------------------------------------------------
    w("## 1. Prisnivå och svängningar per år (spot, öre/kWh exkl. moms)\n")
    w("| År | Medel | Medel dygnsspann (max–min) | Dygn med spann > 1 kr | Dyraste kvart/timme | Billigaste |")
    w("|---|---|---|---|---|---|")
    for ar in sorted(set(s.index.year)):
        d = s[s.index.year == ar]
        dag = d.groupby(d.index.date)
        spann = dag.max() - dag.min()
        w(f"| {ar}{' (t.o.m. ' + str(d.index[-1].date()) + ')' if ar == s.index[-1].year else ''}"
          f"{' (fr.o.m. ' + str(d.index[0].date()) + ')' if ar == s.index[0].year else ''} | {fmt(100 * d.mean(), 1)} | "
          f"{fmt(100 * spann.mean(), 1)} | {(spann > 1).sum()} av {len(spann)} | {fmt(100 * d.max(), 0)} | {fmt(100 * d.min(), 0)} |")
    w("")
    senaste = s[s.index >= s.index[-1] - pd.Timedelta(days=730)]
    man = senaste.groupby([senaste.index.year, senaste.index.month]).mean()
    w("### Månadsmedel senaste två åren (öre/kWh exkl. moms)\n")
    w("| Månad | Medel | Medel dygnsspann |")
    w("|---|---|---|")
    for (ar, m), v in man.items():
        d = senaste[(senaste.index.year == ar) & (senaste.index.month == m)]
        dag = d.groupby(d.index.date)
        w(f"| {ar}-{m:02d} | {fmt(100 * v, 1)} | {fmt(100 * (dag.max() - dag.min()).mean(), 1)} |")
    w("")

    # --- Huvudanalys senaste 12 mån --------------------------------------------
    slut = (s.index[-1] - pd.Timedelta(days=2)).date()
    start = (pd.Timestamp(slut) - pd.Timedelta(days=364)).date()
    r = analysera_period(s, str(start), str(slut))
    n = len(r)
    w(f"## 2. Vad hade det sparat? Senaste 12 månaderna ({start} – {slut}, {n} dygn)\n")
    w("### Per tillfälle\n")
    w("| Last | Utan styrning | Bästa tidpunkt | Sparat per gång, medel | Median | Dygn då det sparar < 1 kr | Bästa dygnet |")
    w("|---|---|---|---|---|---|---|")
    disk = r["disk_bas"] - r["disk_opt"]
    bil = r["bil_bas"] - r["bil_opt"]
    vv = r["vv_bas"] - r["vv_opt"]
    w(f"| Diskmaskin {fmt(DISK_KWH, 1)} kWh, start 19:00 → billigaste start före 07:00 | {fmt(r['disk_bas'].mean())} kr | {fmt(r['disk_opt'].mean())} kr | "
      f"**{fmt(disk.mean())} kr** | {fmt(disk.median())} kr | {(disk < 1).mean():.0%} | {fmt(disk.max())} kr |")
    w(f"| Laddhybrid {fmt(BIL_KWH, 0)} kWh, laddar direkt 17:00 → billigaste kvartar före 07:00 | {fmt(r['bil_bas'].mean())} kr | {fmt(r['bil_opt'].mean())} kr | "
      f"**{fmt(bil.mean())} kr** | {fmt(bil.median())} kr | {(bil < 1).mean():.0%} | {fmt(bil.max())} kr |")
    w(f"| Varmvatten {fmt(VV_KWH_DAG, 0)} kWh/dygn, morgon+kväll → billigaste 2 h (+10 % el) | {fmt(r['vv_bas'].mean())} kr | {fmt(r['vv_opt'].mean())} kr | "
      f"**{fmt(vv.mean())} kr** | {fmt(vv.median())} kr | {(vv < 1).mean():.0%} | {fmt(vv.max())} kr |")
    w("")

    w("### Per år (uppskattning med antagna mängder)\n")
    disk_ar = disk.mean() * 250
    tvatt_tork = disk.mean() / DISK_KWH * (TVATT_KWH + TORK_KWH) * 150
    bil_ar = bil.mean() * BIL_GGR_PER_AR
    vv_ar = vv.sum()
    varme3, varme5 = r["varme_besp_0.3"].sum(), r["varme_besp_0.5"].sum()
    w("| Last | Antagen användning | Möjlig besparing/år | Kräver |")
    w("|---|---|---|---|")
    w(f"| Diskmaskin | 250 körningar | {fmt(disk_ar, 0)} kr | Fördröjd start på maskinen + att veta antal timmar |")
    w(f"| Tvätt + tork | 150 omgångar à {fmt(TVATT_KWH + TORK_KWH, 1)} kWh (samma flyttvärde/kWh som disken) | {fmt(tvatt_tork, 0)} kr | Fördröjd start; ofta praktiskt svårare |")
    w(f"| Laddhybrid | {BIL_GGR_PER_AR} laddningar à {fmt(BIL_KWH, 0)} kWh = {fmt(BIL_KWH * BIL_GGR_PER_AR, 0)} kWh | **{fmt(bil_ar, 0)} kr** | Schemalagd laddning (bil, laddbox eller app) |")
    w(f"| Varmvatten | {fmt(VV_KWH_DAG * 365, 0)} kWh/år | {fmt(vv_ar, 0)} kr | Värmepumpens styrning |")
    w(f"| Rumsvärme, mild modulering (±30 %) | {fmt(VARME_KWH_AR, 0)} kWh/år | {fmt(varme3, 0)} kr | Värmepumpens styrning/termostat |")
    w(f"| Rumsvärme, kraftig modulering (±50 %) | {fmt(VARME_KWH_AR, 0)} kWh/år | {fmt(varme5, 0)} kr | Värmepumpens styrning + huset måste tåla det |")
    tot_lag = disk_ar + tvatt_tork + bil_ar + vv_ar + varme3
    tot_hog = disk_ar + tvatt_tork + bil_ar + vv_ar + varme5
    w(f"| **Summa** | | **{fmt(tot_lag, 0)} – {fmt(tot_hog, 0)} kr** | |")
    w("")
    w("Rumsvärmemodellen är grov: den flyttar energi från dygnets dyraste halva till den billigaste "
      "utan att modellera husets tröghet, och drar av 5 % extra energi på den flyttade delen för "
      "högre förluster och sämre värmefaktor. Se det som en övre rimlighetsgräns för en enkel styrning.\n")

    # --- Enkel timer vs optimering ---------------------------------------------
    w("### Räcker en fast timer?\n")
    disk_t = r["disk_bas"] - r["disk_timer"]
    bil_t = r["bil_bas"] - r["bil_timer"]
    w("| Last | Optimal styrning sparar | Fast timer sparar | Andel av optimalt | Dygn då timern var sämre än att köra direkt |")
    w("|---|---|---|---|---|")
    w(f"| Diskmaskin, alltid start 02:00 | {fmt(disk.mean())} kr/gång | {fmt(disk_t.mean())} kr/gång | {disk_t.mean() / disk.mean():.0%} | {(disk_t < 0).mean():.0%} |")
    w(f"| Laddhybrid, alltid start 01:00 | {fmt(bil.mean())} kr/gång | {fmt(bil_t.mean())} kr/gång | {bil_t.mean() / bil.mean():.0%} | {(bil_t < 0).mean():.0%} |")
    w("")

    # --- Säsong ----------------------------------------------------------------
    w("### Besparing per månad (laddhybrid, kr per laddning)\n")
    w("| Månad | Medel | Median | Max |")
    w("|---|---|---|---|")
    bm = bil.groupby([pd.to_datetime(bil.index).year, pd.to_datetime(bil.index).month])
    for (ar, m), g in bm:
        w(f"| {ar}-{m:02d} | {fmt(g.mean())} | {fmt(g.median())} | {fmt(g.max())} |")
    w("")

    # --- Fördelning ------------------------------------------------------------
    w("### Hur ojämnt fördelad är besparingen?\n")
    sort_bil = bil.sort_values(ascending=False)
    topp20 = sort_bil.iloc[: int(len(sort_bil) * 0.2)].sum() / sort_bil.sum()
    topp10d = sort_bil.iloc[:10].sum() / sort_bil.sum()
    w(f"- De 20 % bästa dygnen står för **{topp20:.0%}** av laddhybridens årsbesparing; de 10 bästa dygnen ensamma för {topp10d:.0%}.")
    w(f"- Diskmaskinen sparar mindre än 50 öre per körning {(disk < 0.5).mean():.0%} av dygnen och mer än 3 kr {(disk > 3).mean():.0%} av dygnen.")
    sort_v = r["varme_besp_0.5"].sort_values(ascending=False)
    w(f"- Rumsvärme (±50 %): de 20 % bästa dygnen står för {sort_v.iloc[: int(len(sort_v) * 0.2)].sum() / sort_v.sum():.0%} av besparingen, "
      f"de 10 bästa dygnen för {sort_v.iloc[:10].sum() / sort_v.sum():.0%}. Bästa dygnet: {fmt(sort_v.iloc[0])} kr ({sort_v.index[0]}).")
    w("")

    # --- Generiskt flyttvärde ---------------------------------------------------
    w("## 3. Värdet av flexibilitet: öre/kWh (inkl. moms) som sparas när en 2-timmarslast får vänta\n")
    g = generiskt_flyttvarde(s, str(start), str(slut))
    w("| Tänkt start | Får vänta ≤ 3 h | ≤ 6 h | ≤ 12 h | ≤ 24 h |")
    w("|---|---|---|---|---|")
    for h in (7, 12, 17, 19, 22):
        w(f"| {h:02d}:00 | " + " | ".join(fmt(g[(h, ww)], 1) for ww in (3, 6, 12, 24)) + " |")
    w("")

    # --- Extremdagar -----------------------------------------------------------
    w("## 4. Extrema och lugna dygn (hela perioden)\n")
    hela = analysera_period(s, str(s.index[0].date()), str(slut))
    hela_bil = hela["bil_bas"] - hela["bil_opt"]
    hela_disk = hela["disk_bas"] - hela["disk_opt"]
    w("### De 12 dygn med störst spann\n")
    w("| Dygn | Medel öre | Min öre | Max öre | Laddhybrid sparar | Disk sparar |")
    w("|---|---|---|---|---|---|")
    for d in hela.sort_values("spread", ascending=False).head(12).index:
        x = hela.loc[d]
        w(f"| {d} | {fmt(100 * x['medel'], 0)} | {fmt(100 * x['min'], 0)} | {fmt(100 * x['max'], 0)} | {fmt(hela_bil[d])} kr | {fmt(hela_disk[d])} kr |")
    w("")
    w("### Lugna dygn: andel dygn där laddhybriden sparar < 1 kr och disken < 0,25 kr\n")
    w("| År | Laddhybrid < 1 kr | Disk < 0,25 kr |")
    w("|---|---|---|")
    hidx = pd.to_datetime(hela.index)
    for ar in sorted(set(hidx.year)):
        m = hidx.year == ar
        w(f"| {ar} | {(hela_bil[m] < 1).mean():.0%} | {(hela_disk[m] < 0.25).mean():.0%} |")
    w("")
    w("### Laddhybrid: medelbesparing per laddning per år\n")
    w("| År | Medel kr/laddning | × 250 laddningar |")
    w("|---|---|---|")
    for ar in sorted(set(hidx.year)):
        m = hidx.year == ar
        w(f"| {ar} | {fmt(hela_bil[m].mean())} | {fmt(hela_bil[m].mean() * 250, 0)} kr |")
    w("")


    # --- Hela elräkningen --------------------------------------------------------
    w("## 5. Hela elräkningen: hur stor del går att påverka med tidpunkt? (senaste 12 mån)\n")
    w(elrakning(s, str(start), str(slut), disk_ar + tvatt_tork, bil_ar, vv_ar, varme3, varme5))

    # --- Tidstariff -------------------------------------------------------------
    w("## 6. Om nätavgiften är tidsdifferentierad (exempel: Vattenfall Eldistribution tidstariff 2026)\n")
    w("Vattenfalls tidstariff: 76,5 öre/kWh vardagar 06–22 i jan–mar och nov–dec, annars 30,5 öre "
      "(enkeltariff: 44,5 öre överallt; alla inkl. moms). Helgdagar på vardagar är inte inräknade här (förenkling).\n")
    s_tid = s.copy()
    hl = (s_tid.index.month.isin([1, 2, 3, 11, 12])) & (s_tid.index.weekday < 5) & (s_tid.index.hour >= 6) & (s_tid.index.hour < 22)
    s_tid[hl] = s_tid[hl] + 0.46 / MOMS  # påslaget uttryckt exkl. moms så att MOMS-faktorn ger 46 öre
    rt = analysera_period(s_tid, str(start), str(slut))
    bil_t2 = rt["bil_bas"] - rt["bil_opt"]
    disk_t2 = rt["disk_bas"] - rt["disk_opt"]
    w("| Last | Värde av att flytta, enkeltariff | Med tidstariff | Skillnad per år |")
    w("|---|---|---|---|")
    w(f"| Laddhybrid (kr/laddning) | {fmt(bil.mean())} | {fmt(bil_t2.mean())} | {fmt((bil_t2.mean() - bil.mean()) * BIL_GGR_PER_AR, 0)} kr |")
    w(f"| Diskmaskin (kr/körning) | {fmt(disk.mean())} | {fmt(disk_t2.mean())} | {fmt((disk_t2.mean() - disk.mean()) * 250, 0)} kr |")
    w("")
    w("Tidstariffen gör alltså kvällen ännu dyrare vintertid och förstärker samma beteende som spotpriset belönar. "
      "Den ändrar också *när* det är billigast: kl 22 blir ett hårt gränsvärde på vardagar vintertid.\n")

    # --- Bensin eller el --------------------------------------------------------
    w("## 7. Laddhybrid: när är bensin billigare än el?\n")
    bensin_kr_l, l_per_mil, kwh_per_mil = 19.0, 0.65, 2.0
    fast_kr_kwh = 0.45 + 0.445 + 0.04 * MOMS  # energiskatt, överföring (Vattenfall enkel), påslag; inkl. moms
    brytpunkt = (bensin_kr_l * l_per_mil / kwh_per_mil - fast_kr_kwh) / MOMS
    d12 = s[(s.index >= pd.Timestamp(str(start), tz=TZ)) & (s.index < pd.Timestamp(str(slut), tz=TZ))]
    w(f"ANTAGANDE: bensin {fmt(bensin_kr_l, 0)} kr/l, {fmt(l_per_mil)} l/mil i hybridläge, {fmt(kwh_per_mil, 1)} kWh/mil på el inkl. laddförluster. "
      f"Då är el dyrare än bensin först när spotpriset överstiger **{fmt(brytpunkt)} kr/kWh** exkl. moms. "
      f"Senaste 12 månaderna hände det i {(d12 > brytpunkt).sum()} av {len(d12)} kvartar. "
      "Slutsats: ladda alltid – frågan är bara när.\n")

    # --- Kvartar ---------------------------------------------------------------
    w("## 8. Spelar kvartarna någon roll? (sedan 2025-10-01)\n")
    avvik, inom, a10, a25 = kvartsanalys(s, "2025-10-01", str(slut))
    kv = r[pd.to_datetime(r.index) >= pd.Timestamp("2025-10-01")]
    extra = (kv["bil_opt_tim"] - kv["bil_opt"]).mean()
    w(f"- Kvartspriset avviker i snitt {fmt(100 * avvik, 1)} öre/kWh från sin timmes medelpris.")
    w(f"- Skillnaden mellan dyraste och billigaste kvart inom samma timme är i snitt {fmt(100 * inom, 1)} öre; "
      f"över 10 öre i {a10:.0%} av timmarna och över 25 öre i {a25:.0%}.")
    w(f"- Laddhybrid: att välja kvartar i stället för hela timmar sparar ytterligare {fmt(extra)} kr per laddning "
      f"(jämfört med {fmt((kv['bil_bas'] - kv['bil_opt']).mean())} kr för hela flytten).")
    w("")

    # --- Mönster ---------------------------------------------------------------
    w("## 9. Hur förutsägbart är dygnsmönstret? (senaste 12 månaderna)\n")
    d12 = s[(s.index >= pd.Timestamp(str(start), tz=TZ)) & (s.index < pd.Timestamp(str(slut), tz=TZ))]
    tim = d12.groupby(d12.index.hour).mean()
    w("| Timme | " + " | ".join(f"{h:02d}" for h in range(24)) + " |")
    w("|---|" + "---|" * 24)
    w("| Medel öre | " + " | ".join(fmt(100 * tim[h], 0) for h in range(24)) + " |")
    # vilken timme är billigast respektive dyrast varje dygn
    dagl = d12.groupby([d12.index.date, d12.index.hour]).mean().unstack()
    billig = dagl.idxmin(axis=1).value_counts(normalize=True).sort_index()
    dyr = dagl.idxmax(axis=1).value_counts(normalize=True).sort_index()
    w("| Andel dygn då timmen är billigast | " + " | ".join(f"{billig.get(h, 0):.0%}" for h in range(24)) + " |")
    w("| Andel dygn då timmen är dyrast | " + " | ".join(f"{dyr.get(h, 0):.0%}" for h in range(24)) + " |")
    w("")

    UT.write_text("\n".join(ut) + "\n")
    print("\n".join(ut))


if __name__ == "__main__":
    main()
