#!/usr/bin/env python3
"""Drivesoid health report — reads drives-history.jsonl and prints a summary."""

import json, sys, math
from datetime import datetime, timezone
from collections import Counter
from pathlib import Path

HISTORY_PATH = Path(__file__).parent.parent / 'data' / 'drives-history.jsonl'
DIMS = [
    'vitality', 'fatigue',
    'longing', 'intimacy', 'possessiveness', 'lust',
    'jealousy', 'anxiety', 'protectiveness',
    'contentment', 'elation', 'seeking', 'play',
    'dejection', 'irritability',
]
GROUPS = {
    'activation': ['vitality', 'fatigue'],
    'attachment': ['longing', 'intimacy', 'possessiveness', 'lust'],
    'threat':     ['jealousy', 'anxiety', 'protectiveness'],
    'reward':     ['contentment', 'elation', 'seeking', 'play'],
    'negative':   ['dejection', 'irritability'],
}

days = int(sys.argv[1]) if len(sys.argv) > 1 else 7

try:
    raw = HISTORY_PATH.read_text()
except FileNotFoundError:
    print(f'[ERROR] {HISTORY_PATH} not found'); sys.exit(1)

rows = []
for line in raw.splitlines():
    line = line.strip()
    if not line: continue
    try: rows.append(json.loads(line))
    except: pass

if not rows:
    print('[ERROR] no data'); sys.exit(1)

cutoff_ts = datetime.now(timezone.utc).timestamp() - days * 86400
rows = [r for r in rows if datetime.fromisoformat(r['ts'].replace('Z', '+00:00')).timestamp() >= cutoff_ts]

if not rows:
    print(f'[ERROR] no data in last {days} days'); sys.exit(1)

now_str  = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
first_ts = rows[0]['ts'][:16].replace('T', ' ')
last_ts  = rows[-1]['ts'][:16].replace('T', ' ')

def stats(vals):
    vals = [v for v in vals if v is not None and math.isfinite(v)]
    if not vals: return None
    n  = len(vals)
    mu = sum(vals) / n
    sigma = math.sqrt(sum((v - mu) ** 2 for v in vals) / n) if n > 1 else 0.0
    return {'n': n, 'mean': mu, 'min': min(vals), 'max': max(vals), 'std': sigma, 'last': vals[-1]}

def bar(v, width=16):
    filled = round(v * width)
    return '█' * filled + '░' * (width - filled)

def trend(vals, last_n=10):
    vals = [v for v in vals if v is not None and math.isfinite(v)]
    if len(vals) < 4: return '~'
    recent  = vals[-last_n:]
    earlier = vals[-last_n*2:-last_n] if len(vals) >= last_n*2 else vals[:max(1, len(vals)-last_n)]
    if not earlier: return '~'
    delta = sum(recent)/len(recent) - sum(earlier)/len(earlier)
    if delta > 0.015: return '↑'
    if delta < -0.015: return '↓'
    return '→'

print(f'\n{"═"*60}')
print(f'  DRIVESOID HEALTH REPORT  [{now_str}]')
print(f'  Period: {first_ts} → {last_ts}  ({len(rows)} ticks, {days}d window)')
print(f'{"═"*60}')

last_display = rows[-1].get('display', {})
print('\n── CURRENT STATE ─────────────────────────────────────────')
for grp, dims in GROUPS.items():
    print(f'  {grp.upper()}')
    for d in dims:
        v = last_display.get(d)
        if v is None: continue
        print(f'    {d:<16} {bar(v)} {v:.2f}')

print('\n── DIMENSION TRENDS (mean ± std, trend) ──────────────────')
all_display = [r.get('display', {}) for r in rows]
for grp, dims in GROUPS.items():
    print(f'  {grp.upper()}')
    for d in dims:
        vals = [disp.get(d) for disp in all_display]
        s = stats(vals)
        if not s: continue
        tr = trend(vals)
        print(f'    {d:<16} mean={s["mean"]:.3f}  std={s["std"]:.3f}  [{s["min"]:.2f}–{s["max"]:.2f}]  {tr}')

print('\n── CLASSIFIER ─────────────────────────────────────────────')
all_cls = [c for r in rows for c in (r.get('classifier') or []) if c]
errors  = [c for c in all_cls if 'error' in c]
hits    = [c for c in all_cls if 'label' in c]
label_counts = Counter(c['label'] for c in hits)
confidences  = [c['confidence'] for c in hits if isinstance(c.get('confidence'), float)]

if confidences:
    print(f'  calls={len(all_cls)}  ok={len(hits)}  errors={len(errors)}  avg_confidence={sum(confidences)/len(confidences):.3f}')
else:
    print(f'  calls={len(all_cls)}  ok={len(hits)}  errors={len(errors)}')
if label_counts:
    total = sum(label_counts.values())
    for label, cnt in label_counts.most_common():
        pct = cnt / total * 100
        print(f'    {label:<22} {cnt:>4}  ({pct:4.1f}%)')

print('\n── SLEEP ──────────────────────────────────────────────────')
sleep_statuses = [r.get('sleep') for r in rows]
asleep_count = sleep_statuses.count('asleep')
awake_count  = sleep_statuses.count('awake')
asleep_pct   = asleep_count / len(sleep_statuses) * 100 if sleep_statuses else 0
print(f'  awake={awake_count} ticks  asleep={asleep_count} ticks  ({asleep_pct:.1f}% asleep)')

print('\n── WHIM ───────────────────────────────────────────────────')
whims  = [r.get('whim', {}) for r in rows]
active = [w for w in whims if w.get('active')]
if active:
    pos = len([w for w in active if set(w.get('dims', [])) & {'vitality','seeking','play','elation','contentment'}])
    neg = len(active) - pos
    print(f'  active={len(active)}/{len(whims)} ticks ({len(active)/len(whims)*100:.1f}%)  pos={pos}  neg={neg}')
else:
    print('  no active whim recorded in period')

print('\n── UNANSWERED THREAD ──────────────────────────────────────')
ua_rows = [r.get('unanswered') for r in rows if r.get('unanswered')]
if ua_rows:
    high = sum(1 for u in ua_rows if u.get('stakes') == 'high')
    norm = sum(1 for u in ua_rows if u.get('stakes') == 'normal')
    print(f'  active in {len(ua_rows)}/{len(rows)} ticks  high_stakes={high}  normal={norm}')
else:
    print('  no unanswered threads in period')

print(f'\n{"═"*60}\n')
