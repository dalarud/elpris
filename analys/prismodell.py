"""Enkel prognosmodell för dygnsmedelpriset i SE3, 2–7 dygn framåt.

Idé: utgå från det senast kända dygnet (morgondagen, känd kl 13) och justera för
hur vädret förväntas ändras till måldygnet: kallare -> högre efterfrågan,
mindre vind -> mindre vindkraft, helg -> lägre efterfrågan.

Modell per horisont h (dygn efter dagens datum), i log-skala:
    log(P_mål + C) - log(P_senast + C) =
        a + b*(log(P_7d + C) - log(P_senast + C)) + c*dHDD + d*dVind + e*dHelg
Tränas med minsta kvadrat. Koefficienter och osäkerhetsintervall skrivs till
app/modell/prismodell.json så att appen kan räkna samma sak i webbläsaren.

Utvärderas på data som modellen inte sett (från 2025-07-01) mot två enkla
alternativ: "samma som senast kända dygn" och "samma som senaste veckan".
Eftersom vi tränar och testar med *uppmätt* väder (inte prognoser) läggs brus på
vädret i en andra utvärdering för att efterlikna prognosfel.

Kör: python3 analys/prismodell.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROT = Path(__file__).resolve().parent.parent
C = 0.3                       # kr/kWh, gör log-skalan tålig mot priser nära noll
HDD_BAS = 15.0                # graddagar under 15 grader
TEST_FRAN = "2025-07-01"
import os
GRANS = float(os.environ.get("GRANS", "1.5"))   # dyr dag = minst så här mycket gånger 30-dagarsmedianen
HORISONTER = range(2, 8)
TEMP_KOL = ["temp_jonkoping", "temp_stockholm", "temp_goteborg", "temp_malmo"]
VIND_KOL = ["vind_falsterbo", "vind_vaderoarna", "vind_hoburg", "vind_sundsvall", "vind_ostersund"]
# ANTAGANDE: typiska prognosfel (standardavvikelse) som funktion av horisont
TEMP_FEL = lambda h: 0.8 + 0.35 * h   # grader
VIND_FEL = lambda h: 0.6 + 0.25 * h   # m/s (medel över stationer)


def dygnspriser():
    df = pd.read_csv(ROT / "data" / "spotpris_SE3.csv")
    t = pd.to_datetime(df["start"], utc=True).dt.tz_convert("Europe/Stockholm")
    langd = (pd.to_datetime(df["slut"], utc=True) - pd.to_datetime(df["start"], utc=True)).dt.total_seconds()
    vikt = langd / 3600
    d = pd.DataFrame({"dag": t.dt.date, "p": df["sek_per_kwh"] * vikt, "w": vikt})
    g = d.groupby("dag").sum()
    s = g["p"] / g["w"]
    s.index = pd.to_datetime(s.index)
    return s


def vader():
    v = pd.read_csv(ROT / "data" / "vader_daglig.csv", parse_dates=["datum"]).set_index("datum")
    ut = pd.DataFrame(index=v.index)
    ut["temp"] = v[TEMP_KOL].mean(axis=1)
    ut["vind"] = v[VIND_KOL].mean(axis=1)
    return ut.interpolate(limit=3)


def bygg_rader(p, v):
    rader = []
    dagar = p.index
    for i in range(6, len(dagar) - 1):
        I = dagar[i]                  # utfärdandedag, kl ~13:30
        senast = I + pd.Timedelta(days=1)
        if senast not in p.index:
            continue
        L1 = p[senast]
        L7 = p[(p.index > I - pd.Timedelta(days=6)) & (p.index <= senast)].mean()
        for h in HORISONTER:
            T = I + pd.Timedelta(days=h)
            if T not in p.index or T not in v.index or senast not in v.index:
                continue
            rader.append({
                "utfardad": I, "mal": T, "h": h, "P": p[T], "L1": L1, "L7": L7,
                "temp_mal": v.at[T, "temp"], "temp_senast": v.at[senast, "temp"],
                "vind_mal": v.at[T, "vind"], "vind_senast": v.at[senast, "vind"],
                "helg_mal": int(T.weekday() >= 5), "helg_senast": int(senast.weekday() >= 5),
                "median30": p[(p.index > I - pd.Timedelta(days=30)) & (p.index <= senast)].median(),
            })
    return pd.DataFrame(rader).dropna()


def X(df, temp_mal=None, vind_mal=None):
    tm = df["temp_mal"] if temp_mal is None else temp_mal
    vm = df["vind_mal"] if vind_mal is None else vind_mal
    hdd = lambda t: np.maximum(0, HDD_BAS - t)
    return np.column_stack([
        np.ones(len(df)),
        np.log(df["L7"] + C) - np.log(df["L1"] + C),
        hdd(tm) - hdd(df["temp_senast"]),
        vm - df["vind_senast"],
        df["helg_mal"] - df["helg_senast"],
    ])


def y(df):
    return np.log(df["P"] + C) - np.log(df["L1"] + C)


def prognos(df, koef, **kw):
    return np.exp(np.log(df["L1"] + C) + X(df, **kw) @ koef) - C


def main():
    p = dygnspriser()
    v = vader()
    alla = bygg_rader(p, v)
    tran = alla[alla["mal"] < pd.Timestamp(TEST_FRAN) - pd.Timedelta(days=7)]
    test = alla[alla["mal"] >= pd.Timestamp(TEST_FRAN)]
    rng = np.random.default_rng(1)
    ut = ["# Prismodell: går det att varna 2–7 dygn i förväg?\n",
          f"Genererad av `analys/prismodell.py`. Träning: mål-dygn {tran['mal'].min().date()} – {tran['mal'].max().date()}. "
          f"Test (osett): {test['mal'].min().date()} – {test['mal'].max().date()}.\n",
          f"**Dyr dag** = dygnsmedel minst {GRANS:.0%} av medianen för de senaste 30 dygnen (känt när prognosen görs) och minst 0,50 kr/kWh.\n",
          "| Horisont | Fel (MAE), modell med uppmätt väder | Modell med prognosbrus | Samma som senast kända dygn | Samma som senaste 7 dygnen | Dyra dagar i test | Hittade (brus) | Varningar som stämde (brus) | Naivt (varna om senast kända dygn var dyrt): hittade / stämde |",
          "|---|---|---|---|---|---|---|---|---|"]
    modell = {"C": C, "HDD_BAS": HDD_BAS, "features": ["konstant", "log(L7+C)-log(L1+C)", "dHDD", "dVind", "dHelg"],
              "horisonter": {}, "temp_kol": TEMP_KOL, "vind_kol": VIND_KOL}
    for h in HORISONTER:
        tr, te = tran[tran["h"] == h], test[test["h"] == h]
        koef, *_ = np.linalg.lstsq(X(tr), y(tr), rcond=None)
        res = y(tr) - X(tr) @ koef
        p10, p90 = np.quantile(res, [0.1, 0.9])
        pred = prognos(te, koef)
        brus_t = te["temp_mal"] + rng.normal(0, TEMP_FEL(h), len(te))
        brus_v = te["vind_mal"] + rng.normal(0, VIND_FEL(h), len(te))
        pred_b = prognos(te, koef, temp_mal=brus_t, vind_mal=brus_v)
        mae = lambda a: 100 * np.mean(np.abs(a - te["P"]))
        dyr = (te["P"] >= GRANS * te["median30"]) & (te["P"] >= 0.5)
        varn = (pred_b >= GRANS * te["median30"]) & (pred_b >= 0.5)
        hit = (dyr & varn).sum()
        varn_naiv = (te["L1"] >= GRANS * te["median30"]) & (te["L1"] >= 0.5)
        hit_naiv = (dyr & varn_naiv).sum()
        ut.append(f"| {h} dygn | {mae(pred):.1f} öre | {mae(pred_b):.1f} öre | {mae(te['L1']):.1f} öre | {mae(te['L7']):.1f} öre | "
                  f"{dyr.sum()} av {len(te)} | {hit} ({hit / max(dyr.sum(), 1):.0%}) | {hit / max(varn.sum(), 1):.0%} av {varn.sum()} | "
                  f"{hit_naiv / max(dyr.sum(), 1):.0%} / {hit_naiv / max(varn_naiv.sum(), 1):.0%} |")
        modell["horisonter"][str(h)] = {"koef": [round(float(k), 5) for k in koef],
                                        "res_p10": round(float(p10), 4), "res_p90": round(float(p90), 4),
                                        "n_tran": int(len(tr))}
    ut.append("")
    ut.append("Koefficienter (log-skala) per horisont: konstant, dragning mot veckomedel, effekt per graddag kallare, "
              "effekt per m/s mer vind, helgeffekt.\n")
    ut.append("| h | konst | veckomedel | per graddag | per m/s vind | helg |")
    ut.append("|---|---|---|---|---|---|")
    for h, m in modell["horisonter"].items():
        ut.append(f"| {h} | " + " | ".join(f"{k:+.3f}" for k in m["koef"]) + " |")
    ut.append("")
    (ROT / "analys" / "resultat_prismodell.md").write_text("\n".join(ut) + "\n")
    # Testvektorer så att JavaScript-versionen (app/js/prognos.js) kan kontrolleras mot Python.
    vektorer = []
    for I in ["2026-01-12", "2026-02-18", "2026-09-23"]:
        I = pd.Timestamp(I)
        senast = I + pd.Timedelta(days=1)
        dp = {d.strftime("%Y-%m-%d"): float(p[d]) for d in p.index if senast - pd.Timedelta(days=30) < d <= senast}
        vd = {d.strftime("%Y-%m-%d"): {"temp": float(v.at[d, "temp"]), "vind": float(v.at[d, "vind"])}
              for d in pd.date_range(senast, I + pd.Timedelta(days=7))}
        rad = bygg_rader(p[p.index <= I + pd.Timedelta(days=7)], v)
        rad = rad[rad["utfardad"] == I]
        forv = {}
        for _, r in rad.iterrows():
            koef = np.array(modell["horisonter"][str(int(r["h"]))]["koef"])
            forv[r["mal"].strftime("%Y-%m-%d")] = float(prognos(rad.loc[[_]], koef).iloc[0])
        vektorer.append({"idag": I.strftime("%Y-%m-%d"), "senast": senast.strftime("%Y-%m-%d"), "dygnspris": dp, "vader": vd, "forvantat": forv})
    (ROT / "test" / "fixtures").mkdir(parents=True, exist_ok=True)
    (ROT / "test" / "fixtures" / "prognos_vektorer.json").write_text(json.dumps(vektorer, indent=1))
    utmapp = ROT / "app" / "modell"
    utmapp.mkdir(parents=True, exist_ok=True)
    (utmapp / "prismodell.json").write_text(json.dumps(modell, indent=1, ensure_ascii=False))
    print("\n".join(ut))


if __name__ == "__main__":
    main()
