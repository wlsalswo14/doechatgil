# -*- coding: utf-8 -*-
"""기획서 2-2의 수치를 site/data/lost.json에서 다시 계산한다.  python -I analysis/stats.py"""
import json, os, re, sys, datetime as dt
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "collector"))
from dictionary import classify_item  # noqa: E402

d = json.load(open(os.path.join(ROOT, "site", "data", "lost.json"), encoding="utf-8"))
items, transfers = d["items"], d["transfers"]
D = dt.date.fromisoformat
norm = lambda s: re.sub(r"\s+", "", s.lower())
R = {}

R["items_total"] = len(items)
R["date_range"] = [min(x["date"] for x in items), max(x["date"] for x in items)]
y = [x for x in items if x["date"].startswith("2026")]
st = Counter(x["status"] for x in y)
R["y2026"] = {"n": len(y), "status": dict(st), "transferred_pct": round(100 * st["transferred"] / len(y), 1),
              "returned_pct": round(100 * st["returned"] / len(y), 1),
              "contacted_in_transferred": sum(1 for x in y if x["status"] == "transferred" and "연락" in (x["note"] or ""))}
mv = sorted(D(t["moved"]) for t in transfers)
mv26 = [m for m in mv if m.year == 2026]
gaps = [(b - a).days for a, b in zip(mv26, mv26[1:])]
R["transfers_2026"] = {"n": len(mv26), "gaps": gaps, "mean": round(sum(gaps) / len(gaps), 1), "min": min(gaps), "max": max(gaps),
                       "stations": dict(Counter(t["station"] for t in transfers if t["moved"].startswith("2026")))}
since = [x for x in items if x["date"] >= "2016-01-01"]
names = Counter(norm(x["name"]) for x in since)
R["names_since2016"] = len(names)
R["carkey_variants"] = sorted({x["name"] for x in since if classify_item(x["name"]) == "carkey"})
R["places_since2016"] = len({norm(x["place"]) for x in since if x["place"]})

# 글자 검색 재현율: 흔한 검색어 → 그 검색어가 가리키는 물건 묶음(품명 규칙) 중 몇 %를 글자 일치로 찾는가
G = {"carkey": lambda n: classify_item(n) == "carkey",
     "earphone": lambda n: "이어폰" in n or "헤드셋" in n,
     "smartwatch": lambda n: "워치" in n,
     "cardwallet": lambda n: "카드지갑" in n or "카드케이스" in n,
     "sunglasses": lambda n: "글라스" in n,
     "phone": lambda n: "휴대폰" in n or "스마트폰" in n or "핸드폰" in n}
Q = {"carkey": ["차키", "car key"], "earphone": ["에어팟", "무선이어폰", "earbuds"], "smartwatch": ["스마트워치", "apple watch"],
     "cardwallet": ["카드지갑", "card holder"], "sunglasses": ["선글라스", "sunglasses"], "phone": ["핸드폰", "phone"]}
ko = en = ko_hit = en_hit = 0; detail = {}
for g, qs in Q.items():
    rel = [x["name"] for x in since if G[g](norm(x["name"]))]
    for q in qs:
        hit = sum(1 for n in rel if norm(q) in norm(n))
        detail[q] = [hit, len(rel)]
        if re.search(r"[a-z]", q): en += len(rel); en_hit += hit
        else: ko += len(rel); ko_hit += hit
R["recall"] = {"ko_pct": round(100 * ko_hit / ko, 1), "en_pct": round(100 * en_hit / en, 1), "detail": detail}
wk = lambda xs: round(100 * sum(D(x["date"]).weekday() >= 5 for x in xs) / len(xs), 1)
R["weekend_pct"] = {"since2016": wk(since), "y2026": wk(y)}
lag = sorted((D(x["posted"]) - D(x["date"])).days for x in items if x["date"] >= "2025-01-01" and x["posted"] >= x["date"])
R["post_lag_2025plus"] = {"n": len(lag), "within1_pct": round(100 * sum(l <= 1 for l in lag) / len(lag), 1),
                          "within3_pct": round(100 * sum(l <= 3 for l in lag) / len(lag), 1)}
venues = {"kspodome", "olympichall", "handball", "woori"}
R["venue_near_2026"] = sum(1 for x in y if x["zone"] in venues)
R["kspodome_centers"] = dict(Counter(x["center"] for x in items if x["zone"] == "kspodome"))
R["kept_now"] = sum(1 for x in items if x["status"] in ("kept", "contacted"))

out = os.path.join(ROOT, "analysis", "stats.json")
json.dump(R, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(R, ensure_ascii=False, indent=1))
