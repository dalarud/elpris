"""Hämtar historiska spotpriser för ett elområde från elprisetjustnu.se.

Data: elprisetjustnu.se (källa: ENTSO-E), exkl. moms och avgifter.
Före 2025-10-01 är priserna per timme, därefter per kvart.

Användning: python3 analys/hamta_priser.py SE3 2022-11-01 2026-10-09 data/spotpris_SE3.csv
Hämtar bara dagar som saknas i utfilen, så skriptet kan köras om.
"""
import csv
import json
import os
import sys
import time
import urllib.request
from datetime import date, timedelta

URL = "https://www.elprisetjustnu.se/api/v1/prices/{y}/{m:02d}-{d:02d}_{zon}.json"


def hamta_dag(zon, dag):
    url = URL.format(y=dag.year, m=dag.month, d=dag.day, zon=zon)
    req = urllib.request.Request(url, headers={"User-Agent": "elpris-analys/0.1"})
    for forsok in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(2 ** forsok)
        except Exception:
            time.sleep(2 ** forsok)
    raise RuntimeError(f"Kunde inte hämta {url}")


def main():
    zon, start, slut, utfil = sys.argv[1], date.fromisoformat(sys.argv[2]), date.fromisoformat(sys.argv[3]), sys.argv[4]
    redan = set()
    if os.path.exists(utfil):
        with open(utfil) as f:
            for rad in csv.DictReader(f):
                redan.add(rad["start"][:10])
    ny = not os.path.exists(utfil)
    with open(utfil, "a", newline="") as f:
        w = csv.writer(f)
        if ny:
            w.writerow(["start", "slut", "sek_per_kwh", "eur_per_kwh"])
        dag = start
        while dag <= slut:
            if dag.isoformat() not in redan:
                data = hamta_dag(zon, dag)
                if data:
                    for p in data:
                        w.writerow([p["time_start"], p["time_end"], p["SEK_per_kWh"], p["EUR_per_kWh"]])
                    f.flush()
                time.sleep(0.15)
            dag += timedelta(days=1)


if __name__ == "__main__":
    main()
