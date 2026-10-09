"""Elmarknaden genom en daytraders ögon: volatilitet, nivåer, trend, signaler,
handelsregler och risk – på verkliga SE3-kvartspriser (senaste 12 månaderna).

Hushållet ses som en köpare som varje dag "handlar" sin flyttbara förbrukning
(tork, tvätt, disk, bastu, laddning, värmepumpens tröghet) över dygnets kvartar.
Skillnad mot aktiehandel: day-ahead-priserna för nästa dygn är KÄNDA kl 13 dagen
före, så inom 11–35 timmar är "kursen" facit, inte en prognos.

Kör: python3 analys/daytrader.py  (skriver analys/resultat_daytrader.md)
"""
from pathlib import Path

import numpy as np
import pandas as pd

ROT = Path(__file__).resolve().parent.parent
MOMS = 1.25
FAST = 0.04 * MOMS + 0.45 + 0.2929   # påslag, energiskatt, överföring (Jönköping, säkringstariff), kr/kWh


def kvartspriser():
    df = pd.read_csv(ROT / "data" / "spotpris_SE3.csv")
    t = pd.to_datetime(df["start"], utc=True).dt.tz_convert("Europe/Stockholm")
    s = pd.Series(df["sek_per_kwh"].to_numpy(), index=t)
    s = s[s.index >= pd.Timestamp("2025-10-01", tz="Europe/Stockholm")]   # bara kvartsperioden
    return s * MOMS + FAST                                                 # totalpris kr/kWh


def vader():
    v = pd.read_csv(ROT / "data" / "vader_daglig.csv", parse_dates=["datum"]).set_index("datum")
    return pd.DataFrame({
        "temp": v[["temp_jonkoping", "temp_stockholm", "temp_goteborg", "temp_malmo"]].mean(axis=1),
        "vind": v[["vind_falsterbo", "vind_vaderoarna", "vind_hoburg", "vind_sundsvall", "vind_ostersund"]].mean(axis=1),
    })


def f(x, d=2):
    return f"{x:,.{d}f}".replace(",", " ").replace(".", ",")


def main():
    p = kvartspriser()
    slut = p.index.max().normalize()
    p = p[p.index >= slut - pd.Timedelta(days=366)]
    dag = p.groupby(p.index.date)
    ohlc = pd.DataFrame({"open": dag.first(), "high": dag.max(), "low": dag.min(), "close": dag.last(), "medel": dag.mean()})
    ohlc.index = pd.to_datetime(ohlc.index)
    ohlc["spann"] = ohlc["high"] - ohlc["low"]
    ut = []
    w = ut.append
    w("# Elmarknaden genom en daytraders ögon\n")
    w(f"Genererad av `analys/daytrader.py`. SE3 kvartspriser {ohlc.index.min().date()} – {ohlc.index.max().date()} ({len(ohlc)} dygn), "
      "uttryckt som **totalpris** kr/kWh (spot + påslag med moms, energiskatt, Jönköping Energis överföring).\n")

    # 1. Volatilitet och regimer
    w("## 1. Volatilitet: dygnets kursspann (high − low)\n")
    w(f"- Medelspann {f(ohlc['spann'].mean())} kr/kWh, median {f(ohlc['spann'].median())}. "
      f"10 % av dygnen har spann över {f(ohlc['spann'].quantile(0.9))} kr, 10 % under {f(ohlc['spann'].quantile(0.1))} kr.")
    ac_spann = ohlc["spann"].autocorr(1)
    ac_medel = ohlc["medel"].autocorr(1)
    w(f"- **Volatiliteten klumpar ihop sig**: korrelation mellan dagens och morgondagens spann {f(ac_spann)}. "
      f"Ett lugnt dygn följs oftast av ett lugnt, ett svängigt av ett svängigt.")
    w(f"- **Prisnivån är trög**: korrelation mellan dagens och morgondagens dygnsmedel {f(ac_medel)}.\n")
    m = ohlc.groupby(ohlc.index.to_period("M")).agg(medel=("medel", "mean"), spann=("spann", "mean"), max=("high", "max"), min=("low", "min"))
    w("| Månad | Medelpris | Medelspann/dygn | Högsta kvart | Lägsta kvart |")
    w("|---|---|---|---|---|")
    for per, r in m.iterrows():
        w(f"| {per} | {f(r['medel'])} | {f(r['spann'])} | {f(r['max'])} | {f(r['min'])} |")
    w("")

    # 2. Nivåer: percentil mot senaste 30 dygnen (som stöd/motstånd)
    w("## 2. Nivåer: var ligger priset jämfört med senaste 30 dygnen?\n")
    w("En trader bedömer en kurs relativt sitt intervall, inte i absoluta tal. Här: kvartens percentil bland de senaste 30 dygnens kvartar.\n")
    vals = p.to_numpy()
    idx = p.index
    perc = np.full(len(p), np.nan)
    fonster = 30 * 96
    for i in range(fonster, len(p)):
        hist = vals[i - fonster:i]
        perc[i] = (hist < vals[i]).mean() * 100
    pp = pd.Series(perc, index=idx).dropna()
    kop = pp <= 20
    salj = pp >= 80
    w(f"- **Köpläge** (≤ 20:e percentilen): {kop.mean():.0%} av kvartarna, i snitt {f(p[kop[kop].index].mean())} kr/kWh. "
      f"**Säljläge/avstå** (≥ 80:e): {salj.mean():.0%} av kvartarna, i snitt {f(p[salj[salj].index].mean())} kr/kWh.")
    timmar_kop = pd.Series(kop[kop].index.hour).value_counts(normalize=True).sort_index()
    timmar_salj = pd.Series(salj[salj].index.hour).value_counts(normalize=True).sort_index()
    w("- Köplägen ligger oftast kl " + ", ".join(f"{h:02d}" for h in timmar_kop.sort_values(ascending=False).index[:5]) +
      "; säljlägen kl " + ", ".join(f"{h:02d}" for h in timmar_salj.sort_values(ascending=False).index[:5]) + ".")
    dagar_med_kop = kop.groupby(kop.index.date).any().mean()
    w(f"- {dagar_med_kop:.0%} av dygnen har minst ett köpläge – det finns nästan alltid ett bra fönster inom det kända dygnet.\n")

    # 3. Trend och medelåtergång
    w("## 3. Trend och medelåtergång (dygnsmedel)\n")
    ma7 = ohlc["medel"].rolling(7).mean()
    ma30 = ohlc["medel"].rolling(30).mean()
    trend_upp = ma7 > ma30
    nasta_vecka = ohlc["medel"].shift(-7).rolling(7).mean().shift(-0)   # medel kommande 7 dygn räknat från t+1
    framtid = ohlc["medel"][::-1].rolling(7).mean()[::-1].shift(-1)
    ok = trend_upp.notna() & framtid.notna() & ma7.notna()
    traff = ((framtid[ok] > ma7[ok]) == trend_upp[ok]).mean()
    w(f"- 7-dygnsmedel över 30-dygnsmedel (stigande trend) {trend_upp[ok].mean():.0%} av dygnen. "
      f"Att trenden fortsätter nästa vecka stämde {traff:.0%} av gångerna – {'något bättre än' if traff > 0.55 else 'ungefär som'} slantsingling.")
    extrem = ohlc["medel"] >= ohlc["medel"].rolling(30).quantile(0.9)
    efter = ohlc["medel"].shift(-1)[extrem]
    w(f"- Efter ett dygn i översta tiondelen var nästa dygn i snitt {f(efter.mean())} kr mot {f(ohlc['medel'][extrem].mean())} kr – "
      f"**medelåtergång** på {(1 - efter.mean() / ohlc['medel'][extrem].mean()):.0%}.\n")

    # 4. Fundamenta: vind och temperatur
    w("## 4. Fundamenta: vad driver kursen?\n")
    v = vader().reindex(ohlc.index)
    df = pd.concat([ohlc["medel"], v], axis=1).dropna()
    w(f"- Korrelation dygnsmedel–vind {f(df['medel'].corr(df['vind']))}, dygnsmedel–temperatur {f(df['medel'].corr(df['temp']))} (senaste året).")
    lag_vind = df["vind"] <= df["vind"].quantile(0.25)
    hog_vind = df["vind"] >= df["vind"].quantile(0.75)
    w(f"- Svagaste vindkvartilen: medelpris {f(df['medel'][lag_vind].mean())} kr. Starkaste: {f(df['medel'][hog_vind].mean())} kr. "
      "Vind är den viktigaste 'nyheten' att bevaka; SMHI:s prognos ger 5–10 dygns förvarning.\n")

    # 5. Handelsregler (strategier) för en flyttbar last
    w("## 5. Handelsregler: hur bra är enkla regler för en flyttbar last?\n")
    w("En syssla på 2 timmar och 2,5 kWh (t.ex. tork) ska köras en gång per dygn. Beslut kl 18 med kända priser fram till nästa dygns slut "
      "(efter kl 13 är morgondagen känd). Kostnad per körning, medel över året:\n")
    rader = []
    for d in ohlc.index[31:-2]:
        beslut = pd.Timestamp(d.date(), tz="Europe/Stockholm") + pd.Timedelta(hours=18)
        horisont = p[(p.index >= beslut) & (p.index < beslut + pd.Timedelta(hours=30))]
        if len(horisont) < 100:
            continue
        roll = horisont.rolling(8).mean().shift(-7).dropna()          # 2 h-fönster som startar vid varje kvart
        hist = p[(p.index < beslut) & (p.index >= beslut - pd.Timedelta(days=30))]
        p25 = hist.quantile(0.25)
        nu = roll.iloc[0]
        optimal = roll.min()
        timer02 = roll[roll.index.hour == 2].iloc[0] if (roll.index.hour == 2).any() else nu
        under = roll[roll <= p25]
        limit = under.iloc[0] if len(under) else optimal              # första gången under P25, annars bästa
        natt = roll[(roll.index.hour >= 22) | (roll.index.hour < 7)]
        rader.append({"nu": nu, "optimal": optimal, "timer02": timer02, "limit": limit, "natt": natt.min()})
    r = pd.DataFrame(rader) * 2.5
    bas = r["nu"].mean()
    w("| Regel | kr/körning | Sparat mot att köra direkt | Andel av bästa möjliga |")
    w("|---|---|---|---|")
    for namn, kol in [("Kör direkt kl 18", "nu"), ("Fast timer kl 02", "timer02"), ("Limitorder: första 2 h-fönstret under 30-dygnens 25:e percentil", "limit"),
                      ("Billigaste natt-fönstret 22–07", "natt"), ("Bästa fönstret (facit, kända priser)", "optimal")]:
        sp = bas - r[kol].mean()
        andel = sp / (bas - r["optimal"].mean())
        w(f"| {namn} | {f(r[kol].mean())} | {f(sp)} kr | {andel:.0%} |")
    w("")
    w("Slutsats: med kända priser är 'facit' gratis inom 11–35 timmar. En enkel limitregel tar en stor del av vinsten men inte allt; "
      "att köra på bästa kända fönster är bättre än någon tumregel.\n")

    # 6. Risk: hushållets exponering och månadsrisk
    w("## 6. Risk och exponering för hushållet\n")
    form = np.array([0.6, 0.5, 0.5, 0.5, 0.5, 0.6, 0.9, 1.2, 1.1, 0.9, 0.9, 0.9, 1.0, 0.9, 0.9, 1.0, 1.2, 1.5, 1.6, 1.5, 1.4, 1.2, 1.0, 0.8])
    last = form[p.index.hour] / form.mean()          # relativ förbrukningsprofil per kvart (hushåll)
    topp = p >= p.rolling(30 * 96, min_periods=96).quantile(0.9)
    andel = (last * topp).sum() / last.sum()
    w(f"- Med en vanlig ostyrd dygnsprofil hamnar {andel:.0%} av förbrukningen i dyraste tiondelen av kvartarna (jämnt fördelat vore 10 %). "
      "Det är hushållets **öppna exponering** mot pristopparna.")
    manad = (p.groupby(p.index.to_period("M")).mean())
    w(f"- Månadsmedelpriset varierade mellan {f(manad.min())} och {f(manad.max())} kr/kWh senaste året – "
      f"för 1 700 kWh i en vintermånad är det {f((manad.max() - manad.min()) * 1700, 0)} kr i skillnad. Det är **marknadsrisken** som "
      "bara ett fastprisavtal (en 'hedge') tar bort.\n")
    (ROT / "analys" / "resultat_daytrader.md").write_text("\n".join(ut) + "\n")
    print("\n".join(ut))


if __name__ == "__main__":
    main()
