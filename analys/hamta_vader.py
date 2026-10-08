"""Hämtar dygnsväder från SMHI:s öppna mätdata (stationer) för prismodellen:
temperatur där många bor (efterfrågan) och vind vid kuststationer (vindkraft).

Data: SMHI Öppna data, metobs. Parameter 2 = lufttemperatur dygnsmedel,
parameter 4 = vindhastighet (timvärden, medelvärdesbildas per dygn).

Kör: python3 analys/hamta_vader.py 2022-10-01 data/vader_daglig.csv
"""
import csv
import io
import json
import sys
import urllib.request
from collections import defaultdict

BAS = "https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/{p}/station/{s}/period/{period}/data.{fmt}"
TEMP = {"jonkoping": 74460, "stockholm": 98230, "goteborg": 71420, "malmo": 52350}
VIND = {"falsterbo": 52240, "vaderoarna": 81350, "hoburg": 68560, "sundsvall": 127310, "ostersund": 134110}


def hamta(url):
    req = urllib.request.Request(url, headers={"User-Agent": "elpris-analys/0.1"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode("utf-8")


def las_csv(text):
    """SMHI-CSV: rubrikrader, sedan 'datum;tid;värde;kvalitet' eller dygnsformat."""
    rader = []
    for rad in text.splitlines():
        delar = rad.split(";")
        if len(delar) >= 4 and delar[0][:2] in ("19", "20") and len(delar[0]) >= 10:
            if len(delar[0]) > 10 and len(delar) >= 5 and delar[2][:2] in ("19", "20"):  # dygn: från;till;dag;värde
                rader.append((delar[2], delar[3]))
            else:  # tim: datum;tid;värde
                rader.append((delar[0], delar[2]))
    return rader


def las_json(text, dygn):
    d = json.loads(text)
    ut = []
    for v in d.get("value", []):
        if dygn:
            ut.append((v["ref"], v["value"]))
        else:
            from datetime import datetime, timezone
            t = datetime.fromtimestamp(v["date"] / 1000, tz=timezone.utc)
            ut.append((t.strftime("%Y-%m-%d"), v["value"]))
    return ut


def serie(param, station, dygn, fran):
    varden = defaultdict(list)
    for period, fmt in (("corrected-archive", "csv"), ("latest-months", "json")):
        text = hamta(BAS.format(p=param, s=station, period=period, fmt=fmt))
        rader = las_csv(text) if fmt == "csv" else las_json(text, dygn)
        for dag, v in rader:
            if dag >= fran:
                try:
                    varden[dag].append(float(v))
                except ValueError:
                    pass
    return {dag: sum(v) / len(v) for dag, v in varden.items()}


def main():
    fran, utfil = sys.argv[1], sys.argv[2]
    kol = {}
    for namn, st in TEMP.items():
        kol[f"temp_{namn}"] = serie(2, st, True, fran)
    for namn, st in VIND.items():
        kol[f"vind_{namn}"] = serie(4, st, False, fran)
    dagar = sorted(set().union(*[set(v) for v in kol.values()]))
    with open(utfil, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["datum"] + list(kol))
        for dag in dagar:
            w.writerow([dag] + [("" if dag not in kol[k] else round(kol[k][dag], 2)) for k in kol])


if __name__ == "__main__":
    main()
