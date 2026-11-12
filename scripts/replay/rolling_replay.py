"""Rolling-window replay: a pawn's forfeit share against a liquidating loan's, on hourly ZEC.

Run:  python3 -I scripts/replay/rolling_replay.py [prices.json.gz]
Default input: zec_1h_2026-11-11.json.gz next to this file, made by fetch_prices.py.
Standard library only. Prints the grid; the line marked * is the one the README quotes.

For every start hour t0 with a full window ahead, at loan to value L and term D days:
  Pawn         principal L x S0, repayment K = L x S0 x (1 + rate x D / 30).
               Forfeited when the close at t0 + D is below K. Nothing earlier can end it.
  Liquidation  debt L x S0, held flat (interest ignored, which favours this loan).
               Liquidated when any hourly close in (t0, t0 + D] reaches the debt / 0.80,
               that is, when its loan to value reaches 80%.
Windows overlap (one start per hour), so a share is an average over every start date.
"""
import collections
import datetime
import gzip
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT = os.path.join(HERE, "zec_1h_2026-11-11.json.gz")
HOUR = 3600
TERMS_DAYS = (30, 60, 90)
LTVS = (0.40, 0.50, 0.60)
PAWN_MONTHLY_RATE = 0.03
LIQUIDATION_LTV = 0.80
QUOTED = (90, 0.50)


def load(path):
    opener = gzip.open if path.endswith(".gz") else open
    with opener(path, "rt") as f:
        data = json.load(f)
    return data, data.pop("rows")


def window_min(xs, w):
    """m[i] = min(xs[i+1 .. i+w]) for every i with a full window ahead."""
    out = [0.0] * (len(xs) - w)
    dq = collections.deque()
    for j in range(1, len(xs)):
        while dq and xs[dq[-1]] >= xs[j]:
            dq.pop()
        dq.append(j)
        i = j - w
        if i >= 0:
            while dq[0] <= i:
                dq.popleft()
            out[i] = xs[dq[0]]
    return out


def replay(close, days, ltv):
    hours = days * 24
    lowest = window_min(close, hours)
    windows = forfeited = liquidated = 0
    for i in range(len(close) - hours):
        s0, s_t = close[i], close[i + hours]
        repayment = ltv * s0 * (1 + PAWN_MONTHLY_RATE * days / 30)
        windows += 1
        forfeited += s_t < repayment
        liquidated += lowest[i] <= ltv * s0 / LIQUIDATION_LTV
    return windows, 100 * forfeited / windows, 100 * liquidated / windows


def day(ts):
    return datetime.datetime.fromtimestamp(ts, datetime.UTC).strftime("%Y-%m-%d")


def main(path):
    meta, rows = load(path)
    close = [r[4] for r in rows]
    print(f"{meta['asset']} hourly closes {day(rows[0][0])} to {day(rows[-1][0])}, {len(rows)} hours")
    print(f"sources: {'; '.join(meta['sources'])}; hours with no trade carried forward: {meta['filled']}")
    print(f"pawn rate {PAWN_MONTHLY_RATE:.0%} a month, liquidation at {LIQUIDATION_LTV:.0%} loan to value\n")
    print("  term  LTV   windows   pawn forfeited   loan liquidated")
    for days in TERMS_DAYS:
        for ltv in LTVS:
            windows, forfeit, liquidation = replay(close, days, ltv)
            mark = "*" if (days, ltv) == QUOTED else " "
            print(f"{mark} {days:3d}d  {ltv:.0%}  {windows:8d}   {forfeit:13.1f}%   {liquidation:14.1f}%")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else DEFAULT)
