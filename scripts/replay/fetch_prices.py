"""Download hourly ZEC prices from public endpoints into the file rolling_replay.py reads.

Run:  python3 -I scripts/replay/fetch_prices.py
Writes: zec_1h_<today>.json.gz next to this file. Standard library only, no API key.

Sources:
  Binance spot klines  https://data-api.binance.vision/api/v3/klines   ZECUSDT from its 2019-03-21
                       listing (Binance's public market-data host, open where api.binance.com is not)
  Bitfinex candles     https://api-pub.bitfinex.com/v2/candles  tZECUSD 1h, used only before that listing
Rows sit on a strict hourly grid, [unix_hour, open, high, low, close]; an hour with no trade carries
the previous close and is counted in "filled". A fresh download adds the hours since the
committed snapshot, so its numbers move slightly from the ones the README quotes.
"""
import datetime
import gzip
import json
import os
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
HOUR = 3600
BITFINEX_SYMBOL, BITFINEX_FROM = "tZECUSD", "2016-12-01"
BINANCE_SYMBOL = "ZECUSDT"
SERIES_FROM = "2017-01-01"
BINANCE_PAGE = 1_000
BITFINEX_PAGE = 10_000


def get(url):
    request = urllib.request.Request(url, headers={"User-Agent": "price-replay/1.0"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except OSError:
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"no answer from {url}")


def ts(day):
    return int(datetime.datetime.fromisoformat(day).replace(tzinfo=datetime.UTC).timestamp())


def binance():
    rows, cursor = [], 0
    while True:
        batch = get(
            "https://data-api.binance.vision/api/v3/klines?interval=1h"
            f"&limit={BINANCE_PAGE}&symbol={BINANCE_SYMBOL}&startTime={cursor}"
        )
        if not batch:
            break
        rows += [[k[0] // 1000, float(k[1]), float(k[2]), float(k[3]), float(k[4])] for k in batch]
        cursor = batch[-1][0] + HOUR * 1000
        if len(batch) < BINANCE_PAGE:
            break
        time.sleep(0.15)
    return rows


def bitfinex(start, end):
    rows, cursor = [], start * 1000
    while cursor < end * 1000:
        batch = get(
            f"https://api-pub.bitfinex.com/v2/candles/trade:1h:{BITFINEX_SYMBOL}/hist"
            f"?limit={BITFINEX_PAGE}&sort=1&start={cursor}&end={end * 1000}"
        )
        if not batch:
            break
        # Bitfinex order: MTS, OPEN, CLOSE, HIGH, LOW, VOLUME
        rows += [[c[0] // 1000, float(c[1]), float(c[3]), float(c[4]), float(c[2])] for c in batch]
        cursor = batch[-1][0] + HOUR * 1000
        if len(batch) < BITFINEX_PAGE:
            break
        time.sleep(3)
    return rows


def grid(rows, start):
    by_hour = {r[0] - r[0] % HOUR: r for r in rows if r[0] >= start}
    out, filled, prev = [], 0, None
    for hour in range(min(by_hour), max(by_hour) + HOUR, HOUR):
        row = by_hour.get(hour)
        if row is None:
            filled += 1
            out.append([hour, prev, prev, prev, prev])
        else:
            out.append([hour, row[1], row[2], row[3], row[4]])
            prev = row[4]
    return out, filled


def main():
    today = datetime.date.today().isoformat()
    listed_rows = binance()
    listed = listed_rows[0][0]
    early = [r for r in bitfinex(ts(BITFINEX_FROM), listed) if r[0] < listed]
    series, filled = grid(early + listed_rows, ts(SERIES_FROM))
    listing_day = datetime.datetime.fromtimestamp(listed, datetime.UTC).strftime("%Y-%m-%d")
    out = {
        "asset": "ZEC",
        "fetched": today,
        "sources": [
            f"Bitfinex {BITFINEX_SYMBOL} 1h {BITFINEX_FROM} to listing",
            f"Binance {BINANCE_SYMBOL} 1h from {listing_day}",
        ],
        "filled": filled,
        "rows": series,
    }
    path = os.path.join(HERE, f"zec_1h_{today}.json.gz")
    with gzip.open(path, "wt") as f:
        json.dump(out, f)
    print(f"wrote {os.path.relpath(path)}: {len(series)} hours, {filled} filled")


if __name__ == "__main__":
    main()
