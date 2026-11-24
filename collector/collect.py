# -*- coding: utf-8 -*-
"""되찾길 수집기 — 표준 라이브러리만 사용.

소스 (모두 한국체육산업개발 공개 데이터):
  1) 유실물 공고  : KCISA_KEY 가 있으면 「올림픽공원 및 미사경정공원 유실물 정보」 오픈API(KSClost),
                   없으면 같은 원천인 올림픽공원 공식 유실물 게시판(공개 HTML)
  2) 행사(대관·공연): 올림픽공원 공연·행사 일정(공식 사이트 공개 JSON) — 주최·문의처 포함
  3) FAQ          : 올림픽공원 자주 묻는 질문(공식 게시판) — 원문 링크 유지
  4) 경찰청 습득물 : DATA_GO_KR_KEY 가 있고 활용 승인된 경우에만 (포털기관·경찰서 2종)

출력: site/data/*.json
"""
import json, os, re, sys, time, html, hashlib, urllib.request, urllib.parse, datetime as dt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "site", "data")
CACHE = os.path.join(ROOT, "collector", "cache")
os.makedirs(OUT, exist_ok=True); os.makedirs(CACHE, exist_ok=True)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dictionary import classify_item, classify_zone, CATEGORIES, ZONES  # noqa: E402

UA = "doechatgil-collector/1.0 (public-data contest demo)"
BASE = "https://www.ksponco.or.kr"
LOST_LIST = BASE + "/olympicpark/board.es?mid=a20708000000&bid=0051&nPage={p}"
LOST_VIEW = BASE + "/olympicpark/board.es?mid=a20708000000&bid=0051&act=view&list_no={n}"
EVENT_AJAX = BASE + "/olympicpark/eventInfo/eventInfoListAjax.es"
EVENT_VIEW = BASE + "/olympicpark/eventInfo/eventInfoView.es?mid=a20301010100&evtSeq={s}"
FAQ_URL = BASE + "/board.es?mid=a10309000000&bid=0067"
KST = dt.timezone(dt.timedelta(hours=9))

def now_kst():
    return dt.datetime.now(KST)

def log(*a):
    print("[collect]", *a, flush=True)

def http(url, data=None, headers=None, tries=4, timeout=60):
    h = {"User-Agent": UA}
    if headers: h.update(headers)
    for k in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=h)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            if k == tries - 1: raise
            time.sleep(2 * (k + 1))

def text(s):
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"[ \t\r\f\v]+", " ", html.unescape(s)).strip()

def save(name, obj):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))

# ------------------------------------------------------------------ 유실물 공고
def parse_date(s, year_hint=None):
    m = re.search(r"(20\d\d)\s*[/.\-년]\s*(\d{1,2})\s*[/.\-월]\s*(\d{1,2})", s)
    if m: return dt.date(int(m[1]), int(m[2]), int(m[3]))
    return None

def list_notices(max_pages=40):
    seen, out = set(), []
    for p in range(1, max_pages + 1):
        h = http(LOST_LIST.format(p=p))
        rows = re.findall(r'act=view&amp;list_no=(\d+)[^>]*class="item".*?<strong class="title">(.*?)</strong>.*?class="date"[^>]*>.*?<span>(\d{4}-\d\d-\d\d)</span>', h, re.S)
        new = 0
        for n, title, d in rows:
            if n in seen: continue
            seen.add(n); new += 1
            out.append({"list_no": int(n), "title": text(title), "posted": d})
        if new == 0: break
        time.sleep(0.3)
    log("notices listed", len(out))
    return out

def parse_view(h):
    i = h.find("view_cont")
    body = h[i:] if i > 0 else h
    end = body.find("btn_area")
    body = body[:end] if end > 0 else body
    center = None
    m = re.search(r"\((평화의\s*광장|만남의\s*광장)\s*안내센터\)", text(body))
    if m: center = "peace" if "평화" in m[1] else "meeting"
    items = []
    # 공고 하나에 두 센터의 표가 함께 실리기도 한다 → 표마다 직전 센터 머리글을 붙인다
    heads = [(m.start(), "peace" if "평화" in m[1] else "meeting")
             for m in re.finditer(r"\((평화의\s*광장|만남의\s*광장)\s*안내센터\)", body)]
    for trm in re.finditer(r"<tr[^>]*>(.*?)</tr>", body, re.S):
        tr = trm.group(1)
        tds = [re.sub(r"\s+", " ", text(td)).strip() for td in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if len(tds) < 4: continue
        d = parse_date(tds[0])
        if not d or not tds[1]: continue
        cen = next((c for pos, c in reversed(heads) if pos < trm.start()), center)
        items.append({"date": d.isoformat(), "name": tds[1], "qty": tds[2], "place_raw": tds[3],
                      "desc": tds[4] if len(tds) > 4 else "", "note": tds[5] if len(tds) > 5 else "", "center": cen})
    t = text(body)
    if not items:  # 2015년 무렵 자유 서식: "*평화의 광장 ... YYYY년 M월 D일 습득물 현황입니다. - 품명(설명)"
        for seg in re.split(r"\*\s*(?=평화의\s*광장|만남의\s*광장)", t):
            cen = "peace" if seg.startswith("평화") else ("meeting" if seg.startswith("만남") else None)
            if not cen: continue
            for dm in re.finditer(r"(20\d\d)년\s*(\d{1,2})월\s*(\d{1,2})일\s*습득물 현황입니다\.(.*?)(?=20\d\d년\s*\d{1,2}월\s*\d{1,2}일\s*습득물|위의 유사한|$)", seg, re.S):
                d = dt.date(int(dm[1]), int(dm[2]), int(dm[3]))
                for im in re.finditer(r"-\s*([^\-(]{1,30}?)\s*\(([^)]*)\)", dm[4]):
                    if len(im[1].strip()) > 20 or "확인" in im[1]: continue
                    note = "연락 완료" if "연락완료" in im[2].replace(" ", "") else ""
                    items.append({"date": d.isoformat(), "name": im[1].strip(), "qty": "1", "place_raw": "", "desc": im[2].strip(),
                                  "note": note, "center": cen})
    transfer = None
    # 이관 공지 서식(2016~2026):
    #  "2026년 10월 29일 ~11월 16일 까지 습득물은 … 11월 18일자로 송파경찰서로 이관"
    #  "2026년 8월 11일 까지 습득물은 … 8월 11일자로 경찰서로 이관"
    #  "2024년 10월 23일 이전 습득물은 … 11월 12일자로 경찰서로 이관"
    #  "2016년 8월 31일 이전 입고된 습득물들에 관해서는 2016년 10월 6일 부로 송파경찰서 … 이관"
    m = re.search(r"(20\d\d)년\s*(\d{1,2})월\s*(\d{1,2})일\s*(?:~\s*(\d{1,2})월\s*(\d{1,2})일)?\s*(?:까지|이전)[^.]{0,40}?(?:습득물|입고)"
                  r"[^.]*?(?:(20\d\d)년\s*)?(\d{1,2})월\s*(\d{1,2})일\s*(?:자로|부로)\s*(\S*?경찰서)", t)
    if m:
        y = int(m[1]); a_m, a_d = int(m[2]), int(m[3])
        if m[4]:
            frm = dt.date(y, a_m, a_d); to = dt.date(y + (1 if int(m[4]) < a_m else 0), int(m[4]), int(m[5]))
        else:
            frm = None; to = dt.date(y, a_m, a_d)
        mm, md = int(m[7]), int(m[8])
        my = int(m[6]) if m[6] else to.year + (1 if mm < to.month else 0)
        moved = dt.date(my, mm, md)
        transfer = {"from": frm.isoformat() if frm else None, "cutoff": to.isoformat(), "moved": moved.isoformat(),
                    "station": m[9] if m[9] != "경찰서" else "관할 경찰서"}
    return center, items, transfer

KCISA_URL = "https://api.kcisa.kr/openapi/service/rest/meta/KSClost"

def collect_lost_api(key, want=320, rows=20):
    """「올림픽공원 및 미사경정공원 유실물 정보」 오픈API.
    같은 공고가 수집 때마다 누적되므로 최신 등록분(끝 페이지)부터 거꾸로 읽고 제목·게시일로 중복을 없앤다."""
    def page(p):
        x = http(KCISA_URL + "?" + urllib.parse.urlencode({"serviceKey": key, "numOfRows": rows, "pageNo": p}), timeout=90, tries=5)
        return x
    first = page(1)
    total = int((re.search(r"<totalCount>(\d+)</totalCount>", first) or [0, 0])[1])
    last = max(1, -(-total // rows))
    seen, out = set(), []
    p = last
    while p >= 1 and len(out) < want:
        x = first if p == 1 else page(p)
        for it in reversed(re.findall(r"<item>(.*?)</item>", x, re.S)):
            g = lambda t: html.unescape((re.search(rf"<{t}>(.*?)</{t}>", it, re.S) or [None, ""])[1])
            title, desc, reg = text(g("title")), g("description"), g("regDate")[:10]
            sig = (title, reg)
            if sig in seen: continue
            seen.add(sig)
            center, items, transfer = parse_view("view_cont" + desc)
            out.append({"v": 4, "list_no": len(out), "title": title, "posted": reg, "center": center, "items": items, "transfer": transfer})
        p -= 1
    log("api notices", len(out), "of totalCount", total)
    return out

def collect_lost():
    key = os.environ.get("KCISA_KEY", "").strip()
    if key:
        try:
            return collect_lost_api(key)
        except Exception as e:  # noqa: BLE001
            log("api fail → 공식 게시판으로 대체", type(e).__name__)
    cache_f = os.path.join(CACHE, "notices.json")
    cache = json.load(open(cache_f, encoding="utf-8")) if os.path.exists(cache_f) else {}
    notices = list_notices()
    for k, n in enumerate(notices):
        key = str(n["list_no"])
        if key in cache and cache[key].get("v") == 5: continue
        h = http(LOST_VIEW.format(n=n["list_no"]))
        center, items, transfer = parse_view(h)
        cache[key] = {"v": 5, **n, "center": center, "items": items, "transfer": transfer}
        if k % 20 == 0: log("view", k, "/", len(notices))
        time.sleep(0.25)
    json.dump(cache, open(cache_f, "w", encoding="utf-8"), ensure_ascii=False)
    return [cache[str(n["list_no"])] for n in notices]

def build_lost(notices):
    # 이관 구간: 공지에 시작일이 적혀 있으면 그대로, "~까지/이전"만 있으면 직전 기준일 다음 날부터.
    # 가장 오래된 공지는 시작일을 모르므로 None(그 이전 전체). 공지 사이 빈 기간은 지어내지 않는다.
    seen = {}
    for n in notices:
        t = n.get("transfer")
        if t and (t["cutoff"], t["moved"]) not in seen:
            seen[(t["cutoff"], t["moved"])] = {**t, "notice": n["list_no"]}
    tl = sorted(seen.values(), key=lambda t: t["cutoff"])
    transfers = []
    for k, t in enumerate(tl):
        frm = t.get("from")
        if not frm and k:
            frm = (dt.date.fromisoformat(tl[k - 1]["cutoff"]) + dt.timedelta(days=1)).isoformat()
        transfers.append({"from": frm, "cutoff": t["cutoff"], "moved": t["moved"], "station": t["station"], "notice": t["notice"]})
    transfers.reverse()
    merged = {}
    for n in sorted(notices, key=lambda x: (x["posted"], x["list_no"])):  # 오래된 공고 → 최신 공고 순으로 덮어씀
        for it in n["items"]:
            cen = it.get("center") or n["center"]
            key = (it["date"], re.sub(r"\s+", "", it["name"]), re.sub(r"\s+", "", it["place_raw"]), cen)
            prev = merged.get(key)
            rec = {**it, "center": cen, "posted": prev["posted"] if prev else n["posted"],
                   "last_seen": n["posted"], "notice": n["list_no"]}
            if prev and prev.get("note") and not it.get("note"): rec["note"] = prev["note"]
            merged[key] = rec
    items = []
    for key, it in merged.items():
        cat = classify_item(it["name"])
        zone = classify_zone(it["place_raw"])
        note = it.get("note", "")
        if "반환" in note: status = "returned"
        else:
            status = "kept"
            for t in transfers:
                if it["date"] <= t["cutoff"] and (not t["from"] or it["date"] >= t["from"]):
                    status = "transferred"; it["moved"] = t["moved"]; it["station"] = t["station"]; break
            else:
                # 공지 구간 밖이지만 최근 기준일보다 오래됨 → 이관 추정(이관일 미상)
                if transfers and it["date"] <= transfers[0]["cutoff"]: status = "transferred"
        if "연락" in note and status == "kept": status = "contacted"
        iid = hashlib.md5('|'.join(map(str, key)).encode()).hexdigest()[:10]
        items.append({"id": iid, "date": it["date"], "name": it["name"], "qty": it["qty"], "place": it["place_raw"],
                      "zone": zone, "cat": cat, "center": it["center"] or "peace", "status": status, "note": note,
                      "posted": it["posted"], "notice": it["notice"], "moved": it.get("moved"), "station": it.get("station")})
    items.sort(key=lambda x: x["date"], reverse=True)
    return items, transfers

def zone_center_map(items):
    from collections import Counter, defaultdict
    c = defaultdict(Counter)
    for it in items: c[it["zone"]][it["center"]] += 1
    return {z: cnt.most_common(1)[0][0] for z, cnt in c.items()}

# ------------------------------------------------------------------ 행사(대관·공연)
PLC = {"01": "olympichall", "02": "kspodome", "03": "handball", "04": "woori", "05": "kartshall", "07": "olympichall"}
def collect_events(months_back=14, months_fwd=3):
    today = now_kst().date(); out = {}
    y, m = today.year, today.month
    ym = []
    for k in range(-months_back, months_fwd + 1):
        mm = m + k; yy = y + (mm - 1) // 12; mm = (mm - 1) % 12 + 1
        ym.append(f"{yy}{mm:02d}")
    for s in ym:
        try:
            r = json.loads(http(EVENT_AJAX, data=json.dumps({"nowYM": s, "plcCd": ""}).encode(),
                                headers={"Content-Type": "application/json;charset=UTF-8"}))
        except Exception as e:  # noqa: BLE001
            log("event fail", s, e); continue
        for grp in r:
            for e in grp:
                seq = e.get("evtSeq")
                if not seq or seq in out: continue
                out[seq] = {"seq": seq, "title": html.unescape(e.get("title") or "").strip(),
                            "from": (e.get("beginDt") or "")[:10], "to": (e.get("endDt") or "")[:10],
                            "venue": (e.get("plc") or "").strip(), "zone": PLC.get((e.get("plcCd") or "").strip(), classify_zone(e.get("plc") or "")),
                            "organizer": (e.get("spns") or "").strip(), "contact": (e.get("nqry") or "").strip(),
                            "url": EVENT_VIEW.format(s=seq)}
        time.sleep(0.2)
    uniq = {}
    for e in out.values():  # 같은 행사가 다른 번호로 두 번 올라온 경우 하나만 남긴다
        k = (re.sub(r"\s+", "", e["title"]), e["zone"], e["from"])
        if k not in uniq or e["seq"] > uniq[k]["seq"]: uniq[k] = e
    ev = sorted(uniq.values(), key=lambda x: x["from"], reverse=True)
    log("events", len(ev))
    return ev

# ------------------------------------------------------------------ 공공데이터포털 파일데이터
def filedata(pk):
    """공공데이터포털 파일데이터(로그인 불필요) CSV를 받아 문자열로 돌려준다."""
    import csv, io
    page = http(f"https://www.data.go.kr/data/{pk}/fileData.do")
    m = re.search(r"fn_fileDataDown\('(\d+)', '([^']+)', '([^']*)','(\d+)', '(\d+)'\)", page)
    if not m: raise RuntimeError("download button not found")
    j = json.loads(http("https://www.data.go.kr/tcs/dss/selectFileDataDownload.do", data=urllib.parse.urlencode(
        {"publicDataDetailPk": m[2], "publicDataPk": m[1], "atchFileId": m[3], "fileDetailSn": m[4], "publicDataTyCode": "PR0051"}).encode()))
    req = urllib.request.Request(f"https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId={j['atchFileId']}&fileDetailSn={j['fileDetailSn']}",
                                 headers={"User-Agent": UA})
    raw = urllib.request.urlopen(req, timeout=60).read()
    for enc in ("utf-8-sig", "cp949"):
        try: t = raw.decode(enc); break
        except UnicodeDecodeError: continue
    return list(csv.DictReader(io.StringIO(t)))

FAQ_FILE_PAGE = "https://www.data.go.kr/data/15089962/fileData.do"
EN_SHOW_PAGE = "https://www.data.go.kr/data/15149169/fileData.do"

def collect_faq():
    """「자주 묻는 질문정보」 파일데이터가 기준. 같은 질문의 공식 게시판 원문(문장부호 보존)이 있으면 본문만 그것으로 바꾼다."""
    board = {}
    try:
        h = http(FAQ_URL)
        for q, a in re.findall(r'class="question">.*?<span class="title">(.*?)</span>.*?class="answer"[^>]*>(.*?)</div>\s*</div>', h, re.S):
            q = text(q); a = text(a)
            a = re.sub(r"[ \t]*\n[ \t\n]*", "\n", a).strip()
            a = re.sub(r"^[^\w가-힣]*A\s*\n", "", a).strip()
            board[re.sub(r"[^가-힣a-z0-9]", "", q.lower())] = a
    except Exception as e:  # noqa: BLE001
        log("faq board fail", type(e).__name__)
    out = []
    for r in filedata("15089962"):
        q = (r.get("제목") or "").strip(); a = (r.get("내용") or "").strip()
        if not q: continue
        k = re.sub(r"[^가-힣a-z0-9]", "", q.lower())
        out.append({"q": q if q.endswith(("?", ".")) else q + "?" if q.endswith(("요", "까", "나요")) else q,
                    "a": board.get(k, a), "id": (r.get("일련번호") or "").strip(),
                    "category": (r.get("카테고리") or "").strip(), "url": FAQ_FILE_PAGE})
    log("faq(file)", len(out), "board-matched", sum(1 for x in out if re.sub(r"[^가-힣a-z0-9]", "", x["q"].lower()) in board))
    return out

def collect_en_shows():
    """「영문 공연정보」 파일데이터 → 영어 화면의 공연명·해외 예매 링크."""
    out = []
    for r in filedata("15149169"):
        t = html.unescape((r.get("공연제목") or "").strip()); d = (r.get("공연일자") or "").strip()[:10]
        if t and re.match(r"\d{4}-\d\d-\d\d", d):
            out.append({"id": (r.get("일련번호") or "").strip(), "title": t, "date": d, "url": (r.get("상세주소") or "").strip()})
    out.sort(key=lambda x: x["date"], reverse=True)
    log("en shows", len(out))
    return out

def save_dictionary_csv():
    import csv
    with open(os.path.join(OUT, "dictionary.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["종류", "표준ID", "표준명(한)", "표준명(영)", "경찰청 대분류/담당센터", "동의어·공고 표기"])
        for c in CATEGORIES: w.writerow(["품목", c["id"], c["ko"], c["en"], c["police"], " | ".join(c["syn"])])
        for z in ZONES: w.writerow(["장소", z["id"], z["ko"], z["en"], z.get("center") or "", " | ".join(z["syn"])])

# ------------------------------------------------------------------ 경찰청(선택)
def collect_police():
    key = os.environ.get("DATA_GO_KR_KEY", "").strip()
    if not key:
        log("police: DATA_GO_KR_KEY 없음 → 건너뜀"); return None
    out = []
    end = now_kst().date(); start = end - dt.timedelta(days=60)
    base = "https://apis.data.go.kr/1320000/LosPtfundInfoInqireService/getPtLosfundInfoAccToClAreaPd"
    for page in range(1, 6):
        q = urllib.parse.urlencode({"serviceKey": key, "pageNo": page, "numOfRows": 100, "START_YMD": start.strftime("%Y%m%d"),
                                    "END_YMD": end.strftime("%Y%m%d"), "N_FD_LCT_CD": "LCA000"})
        try: x = http(base + "?" + q)
        except Exception as e:  # noqa: BLE001
            log("police fail", type(e).__name__); return None
        rows = re.findall(r"<item>(.*?)</item>", x, re.S)
        for r in rows:
            g = lambda t: (re.search(rf"<{t}>(.*?)</{t}>", r, re.S) or [None, ""])[1].strip()
            dep = g("depPlace")
            if not any(s in dep for s in ("올림픽공원역", "몽촌토성역", "한성백제역", "방이역", "둔촌오륜역", "송파경찰서")): continue
            nm = re.sub(r"([가-힣])[가-힣]{1,3}(?=(님|씨|의\s))", r"\1○○", g("fdPrdtNm"))  # 실명 가리기
            out.append({"id": g("atcId"), "date": g("fdYmd"), "name": nm, "cls": g("prdtClNm"),
                        "color": g("clrNm"), "where": dep, "cat": classify_item(g("fdPrdtNm") + " " + g("prdtClNm"))})
        if len(rows) < 100: break
    log("police", len(out))
    return out

# ------------------------------------------------------------------ main
def main():
    started = now_kst()
    meta = {"updated": started.isoformat(timespec="minutes"), "sources": {}}
    notices = collect_lost()
    items, transfers = build_lost(notices)
    save("lost.json", {"updated": meta["updated"], "items": items, "transfers": transfers})
    meta["sources"]["lost"] = {"ok": True, "notices": len(notices), "items": len(items),
                               "via": "api" if os.environ.get("KCISA_KEY") else "official-board"}
    zc = zone_center_map(items)
    save("dict.json", {"categories": CATEGORIES, "zones": [{**z, "center": zc.get(z["id"], z.get("center"))} for z in ZONES],
                       "centers": {"peace": {"ko": "평화의광장 안내센터", "en": "Peace Plaza Info Center", "tel": "02-2180-3564"},
                                   "meeting": {"ko": "만남의광장 안내센터", "en": "Meeting Plaza Info Center", "tel": "02-2180-3566"}},
                       "hours": "09:00-19:00 (12:00-13:00 휴게)"})
    try:
        ev = collect_events(); save("events.json", ev); meta["sources"]["events"] = {"ok": True, "n": len(ev)}
    except Exception as e:  # noqa: BLE001
        meta["sources"]["events"] = {"ok": False, "error": type(e).__name__}
    try:
        fq = collect_faq(); save("faq_ko.json", fq); meta["sources"]["faq"] = {"ok": True, "n": len(fq), "via": "data.go.kr file 15089962"}
    except Exception as e:  # noqa: BLE001
        meta["sources"]["faq"] = {"ok": False, "error": type(e).__name__}
    try:
        es = collect_en_shows(); save("en_shows.json", es); meta["sources"]["en_shows"] = {"ok": True, "n": len(es), "via": "data.go.kr file 15149169"}
    except Exception as e:  # noqa: BLE001
        meta["sources"]["en_shows"] = {"ok": False, "error": type(e).__name__}
    save_dictionary_csv()
    pol = collect_police()
    if pol is not None:
        save("police.json", pol); meta["sources"]["police"] = {"ok": True, "n": len(pol)}
    else:
        meta["sources"]["police"] = {"ok": False, "error": "no-key-or-not-approved"}
        if not os.path.exists(os.path.join(OUT, "police.json")): save("police.json", [])
    save("meta.json", meta)
    log("done", json.dumps(meta, ensure_ascii=False))

if __name__ == "__main__":
    main()
