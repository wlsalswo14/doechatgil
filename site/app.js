/* 되찾길 — 올림픽공원 분실물 길잡이 핵심 로직 및 화면 제어 */
(function (global) {
  'use strict';

  const I18N = global.I18N || (typeof require === 'function' ? require('./i18n.js') : null);
  // 경찰청 유실물 통합포털(옛 LOST112)은 경찰민원24로 통합됐다
  const LOST112_URL = 'https://minwon24.police.go.kr/';
  const NOTICE_BASE_URL = 'https://www.ksponco.or.kr/olympicpark/board.es?mid=a20708000000&bid=0051&act=view&list_no=';
  const PAGE_SIZE = 8;

  // -------------------- 날짜 유틸 (한국 시간 기준 YYYY-MM-DD) --------------------

  function getTodayKST(now) {
    const d = now || new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(d);
    const map = {};
    parts.forEach((p) => { map[p.type] = p.value; });
    return `${map.year}-${map.month}-${map.day}`;
  }

  function parseDateUTC(dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    const ms = Date.UTC(y, m - 1, d);
    const check = new Date(ms);
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
      return null;
    }
    return ms;
  }

  function diffDays(aStr, bStr) {
    const a = parseDateUTC(aStr);
    const b = parseDateUTC(bStr);
    if (a === null || b === null) return 0;
    return Math.round((a - b) / 86400000);
  }

  function addDays(dateStr, delta) {
    const ms = parseDateUTC(dateStr);
    if (ms === null) return dateStr;
    const d = new Date(ms + delta * 86400000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatUpdated(isoStr) {
    if (!isoStr) return '';
    return isoStr.replace('T', ' ').replace('+09:00', ' KST');
  }

  // -------------------- 품목·장소 해석 로직 --------------------

  function normalizeText(str) {
    return String(str || '').toLowerCase().replace(/\s+/g, '');
  }

  function getBigrams(str) {
    const set = new Set();
    for (let i = 0; i < str.length - 1; i += 1) {
      set.add(str.slice(i, i + 2));
    }
    return set;
  }

  function bigramJaccard(a, b) {
    if (a.length < 2 || b.length < 2) return 0;
    const setA = getBigrams(a);
    const setB = getBigrams(b);
    let inter = 0;
    setA.forEach((bg) => {
      if (setB.has(bg)) inter += 1;
    });
    const union = setA.size + setB.size - inter;
    return union === 0 ? 0 : inter / union;
  }

  // 동의어 일치: 영문·숫자 동의어는 단어 경계로(during→ring, what→hat 오탐 방지), 한·중·일은 공백 제거 후 포함 여부로
  const ASCII_SYN = /^[a-z0-9 .'\-]+$/i;
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function synMatchLen(rawQuery, qNorm, syn) {
    const s = String(syn || '').toLowerCase().trim();
    if (!s) return 0;
    if (ASCII_SYN.test(s)) {
      const re = new RegExp(`(^|[^a-z0-9])${escapeRe(s).replace(/\s+/g, '\\s*')}s?($|[^a-z0-9])`);
      return re.test(String(rawQuery || '').toLowerCase()) ? s.replace(/\s+/g, '').length : 0;
    }
    const sNorm = normalizeText(s);
    return sNorm && qNorm.includes(sNorm) ? sNorm.length : 0;
  }

  // SPEC 4장: 동의어 일치(최장 우선) → 없으면 2-gram 자카드 상위 3개(0.25 이상) → 없으면 etc
  function interpret(query, categories) {
    const qNorm = normalizeText(query);
    if (!qNorm) {
      return [{ id: 'etc', confidence: 0, exact: false }];
    }

    const exactMatches = [];
    categories.forEach((cat) => {
      if (!cat.syn || !cat.syn.length) return;
      let maxLen = 0;
      cat.syn.forEach((s) => {
        const len = synMatchLen(query, qNorm, s);
        if (len > maxLen) maxLen = len;
      });
      if (maxLen > 0) {
        exactMatches.push({ id: cat.id, confidence: 100, exact: true, matchLen: maxLen });
      }
    });

    if (exactMatches.length > 0) {
      exactMatches.sort((a, b) => b.matchLen - a.matchLen);
      // 가장 길게 일치한 품목만 '일치'로 표시하고, 짧은 부분 일치는 보조 후보로 낮춘다
      const top = exactMatches[0].matchLen;
      return exactMatches.slice(0, 3).map(({ id, matchLen }) => (
        matchLen === top ? { id, confidence: 100, exact: true } : { id, confidence: Math.round((matchLen / top) * 60), exact: false }
      ));
    }

    const fuzzyMatches = [];
    categories.forEach((cat) => {
      if (!cat.syn || !cat.syn.length) return;
      let best = 0;
      cat.syn.forEach((s) => {
        const sNorm = normalizeText(s);
        const sim = bigramJaccard(qNorm, sNorm);
        if (sim > best) best = sim;
      });
      if (best >= 0.25) {
        fuzzyMatches.push({ id: cat.id, sim: best, confidence: Math.round(best * 100), exact: false });
      }
    });

    if (fuzzyMatches.length > 0) {
      fuzzyMatches.sort((a, b) => b.sim - a.sim);
      return fuzzyMatches.slice(0, 3).map(({ id, confidence, exact }) => ({ id, confidence, exact }));
    }

    return [{ id: 'etc', confidence: 0, exact: false }];
  }

  // 장소가 "모르겠어요"일 때 입력 문장에서 zone syn 보조 추출
  function extractZoneFromQuery(query, zones) {
    const qNorm = normalizeText(query);
    if (!qNorm) return null;
    let bestZone = null;
    let bestLen = 0;
    zones.forEach((z) => {
      if (!z.syn || !z.syn.length) return;
      z.syn.forEach((s) => {
        const len = synMatchLen(query, qNorm, s);
        if (len > bestLen) {
          bestLen = len;
          bestZone = z.id;
        }
      });
    });
    return bestZone;
  }

  // -------------------- 단계·행사·후보·FAQ·통계 로직 --------------------

  // 시연 기준일(asof) 시점의 유실물 데이터: 그날까지 게시된 공고만 남기고,
  // 그 뒤에 일어난 이관은 아직 일어나지 않은 것으로 되돌린다.
  function lostAsOf(lost, asof) {
    if (!lost || !asof) return lost;
    const items = (lost.items || [])
      .filter((i) => (i.posted || i.date || '') <= asof)
      .map((i) => (i.moved && i.moved > asof)
        ? Object.assign({}, i, { status: 'kept', moved: null, station: null })
        : i);
    const transfers = (lost.transfers || []).filter((t) => t.moved && t.moved <= asof);
    return Object.assign({}, lost, { items, transfers });
  }

  // 단계 판정. transfers는 최신순이며 todayStr 이전에 실제로 이관된 공지만 본다.
  function determineStage(lostDate, todayStr, transfers) {
    const list = (transfers || []).filter((tr) => tr.moved && tr.moved <= todayStr);
    const latest = list[0];
    // 1) 공지에 적힌 이관 구간에 들면 경찰서 이관
    const matched = list.find((tr) => lostDate <= tr.cutoff && (!tr.from || tr.from <= lostDate));
    // 가장 오래된 공지처럼 시작일이 없는 구간은 실제 이관일을 알 수 없으므로 날짜를 보여 주지 않는다
    if (matched) return matched.from ? { stage: 'transferred', transfer: matched } : { stage: 'transferred', transfer: null, gap: true };
    // 2) 최근 이관 기준일 이전인데 공지 구간 밖이면(공지 누락 기간) 이관됐을 가능성이 높음
    if (latest && lostDate <= latest.cutoff) return { stage: 'transferred', transfer: null, gap: true };
    const elapsed = diffDays(todayStr, lostDate);
    const sinceLatestMove = latest ? diffDays(todayStr, latest.moved) : 0;
    const windowOpen = Boolean(latest && sinceLatestMove >= 20) || elapsed >= 25;
    // 3) 이관 가능 구간이면 분실 직후라도 먼저 알린다(기다리는 사이 이관될 수 있음)
    if (windowOpen) return { stage: 'transfer_window', transfer: null, recent: elapsed <= 3 };
    if (elapsed <= 3) return { stage: 'pending', transfer: null };
    return { stage: 'kept', transfer: null };
  }

  function getDayEvents(lostDate, resolvedZone, events) {
    const seen = new Set();
    const sameDay = (events || []).filter((ev) => {
      if (!(ev.from <= lostDate && lostDate <= ev.to)) return false;
      const key = `${String(ev.title || '').replace(/\s+/g, '')}|${ev.zone}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (resolvedZone && resolvedZone !== 'unknown') {
      return sameDay.filter((ev) => ev.zone === resolvedZone);
    }
    return sameDay.slice(0, 2);
  }

  function getCandidates({ items, catId, lostDate, resolvedZone, targetCenter, allPeriod }) {
    const fromDate = addDays(lostDate, -1);
    const toDate = addDays(lostDate, 21);

    const filtered = (items || []).filter((item) => {
      if (item.cat !== catId) return false;
      if (allPeriod) return true;
      return item.date >= fromDate && item.date <= toDate;
    });

    const scored = filtered.map((item) => {
      const zoneScore = resolvedZone && item.zone === resolvedZone ? 2 : 0;
      const centerScore = targetCenter && item.center === targetCenter ? 1 : 0;
      const datePenalty = Math.abs(diffDays(item.date, lostDate)) * 0.05;
      return { item, score: zoneScore + centerScore - datePenalty };
    });

    if (allPeriod) {
      scored.sort((a, b) => {
        if (b.item.date !== a.item.date) return b.item.date.localeCompare(a.item.date);
        return b.score - a.score;
      });
    } else {
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.item.date.localeCompare(a.item.date);
      });
    }

    return {
      fromDate,
      toDate,
      results: scored.map((s) => s.item)
    };
  }

  // 경찰서 이름 표시(영어 화면에서는 영문)
  function stationName(st, lang) {
    if (!st) return '';
    if (lang !== 'en') return st;
    if (st.includes('송파')) return 'Songpa Police Station';
    return 'the local police station';
  }

  function tokenizeQuery(query) {
    return String(query || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((tok) => tok.length >= 2 || /^[가-힣]$/.test(tok));
  }

  // 근거 기반 FAQ 검색: 기준 점수 미만이면 빈 배열 반환(지어내기 금지)
  function searchFaq(query, lang, faqKo, faqEn) {
    const trimmed = String(query || '').trim();
    if (!trimmed) {
      if (lang === 'en') {
        const idx42 = faqEn.find((f) => f.ko_index === 42);
        const keep = faqEn.find((f) => f.ko_index === -1);
        return [idx42, keep].filter(Boolean);
      }
      const items = [];
      // 첫 화면 기본 FAQ: 순서가 바뀌어도 분실물 문항을 고른다
      const lostFaq = (faqKo || []).find((f) => /분실|유실|잃어/.test(f.q));
      if (lostFaq) items.push(lostFaq);
      items.push(I18N.KO_RETENTION_FAQ);
      return items;
    }

    const STOP_EN = new Set(['the', 'is', 'a', 'an', 'where', 'what', 'how', 'do', 'does', 'i', 'my', 'can', 'to', 'of', 'in', 'at', 'on', 'for', 'are', 'and', 'it', 'me', 'please', 'there', 'when', 'which']);
    const tokens = tokenizeQuery(trimmed).filter((t) => lang !== 'en' || !STOP_EN.has(t));
    if (tokens.length === 0) return [];

    if (lang === 'en') {
      const scored = (faqEn || []).map((item) => {
        const qLower = item.q.toLowerCase();
        const tags = (item.tags || []).map((tag) => tag.toLowerCase());
        const qWords = tokenizeQuery(qLower);
        let score = 0;
        let matched = 0;

        tokens.forEach((tok) => {
          const inTagExact = tags.some((tag) => tag === tok || tag.split(/\s+/).includes(tok));
          const inTagSub = !inTagExact && tok.length >= 3 && tags.some((tag) => tag.includes(tok));
          const inQExact = qWords.includes(tok);
          const inQSub = !inQExact && tok.length >= 4 && qLower.includes(tok);

          if (inTagExact || inQExact) {
            score += (inTagExact ? 2 : 0) + (inQExact ? 1.5 : 0);
            matched += 1;
          } else if (inTagSub || inQSub) {
            score += 1;
            matched += 1;
          }
        });

        return { item, score, ratio: matched / tokens.length };
      });

      return scored
        .filter((s) => s.score >= 1.5 && s.ratio >= (tokens.length <= 2 ? 1 : 0.5))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((s) => s.item);
    }

    // KO: 질문 제목 일치를 필수로 하고(본문만 겹치면 제외), 짧은 검색어는 모든 단어가 맞아야 한다
    const SYN_KO = {
      '운영시간': ['이용시간', '개방시간', '운영시간', '몇시'], '이용시간': ['이용시간', '개방시간', '운영시간'],
      '개방시간': ['이용시간', '개방시간'], '분실': ['분실', '유실물', '소지품', '잃어'], '유실물': ['분실', '유실물', '소지품'],
      '잃어버렸어요': ['분실', '소지품'], '보관': ['보관', '유실물', '분실'], '주차요금': ['주차', '요금'], '전화번호': ['안내센터', '전화'],
      '화장실': ['화장실'], '반려견': ['반려견', '애완동물'], '강아지': ['반려견', '애완동물']
    };
    const expanded = tokens.map((tok) => SYN_KO[tok] || [tok]);
    const wantsMisa = /미사/.test(trimmed);
    const koPool = (faqKo || []).concat([I18N.KO_RETENTION_FAQ]).filter((item) => wantsMisa || !/미사/.test(item.q));
    const scored = koPool.map((item) => {
      const qLower = item.q.toLowerCase();
      const aLower = item.a.toLowerCase();
      let score = 0;
      let matched = 0;
      let inTitle = 0;
      expanded.forEach((alts) => {
        const inQ = alts.some((t) => qLower.includes(t));
        const inA = alts.some((t) => aLower.includes(t));
        if (inQ || inA) {
          score += (inQ ? 3 : 0) + (inA ? 1 : 0);
          matched += 1;
          if (inQ) inTitle += 1;
        }
      });
      return { item, score, ratio: matched / expanded.length, inTitle };
    });
    const need = expanded.length <= 2 ? 1 : 0.6;
    return scored
      .filter((s) => s.inTitle >= 1 && s.ratio >= need)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((s) => s.item);
  }

  function computeStats(lostData) {
    const items = (lostData && lostData.items) || [];
    const transfers = (lostData && lostData.transfers) || [];
    const year = (lostData && lostData.updated ? lostData.updated.slice(0, 4) : getTodayKST().slice(0, 4));
    const yearItems = items.filter((i) => (i.date || '').startsWith(`${year}-`));
    const transferredCount = yearItems.filter((i) => i.status === 'transferred').length;
    const rate = yearItems.length > 0 ? Math.round((transferredCount / yearItems.length) * 1000) / 10 : 0;

    return {
      year,
      yearTotal: yearItems.length,
      transferredCount,
      transferRate: rate,
      latestTransfer: transfers[0] || null,
      recentTransfers: transfers.slice(0, 6)
    };
  }

  // -------------------- 브라우저 UI 상태 및 렌더링 --------------------

  const state = {
    lang: 'ko',
    largeText: false,
    today: getTodayKST(),
    data: null,
    hasSearched: false,
    date: getTodayKST(),
    selectedZone: '',
    resolvedZone: null,
    zoneAutoDetected: false,
    query: '',
    interpretations: [],
    activeCat: 'etc',
    showAllCats: false,
    allPeriod: false,
    visibleCount: PAGE_SIZE,
    stageInfo: null,
    pickedItem: null,
    cardColor: '',
    cardBrand: '',
    cardFeature: '',
    faqQuery: ''
  };

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach((key) => {
        const val = attrs[key];
        if (val === null || val === undefined || val === false) return;
        if (key === 'className') node.className = val;
        else if (key === 'text') node.textContent = val;
        else if (key.startsWith('on') && typeof val === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), val);
        } else {
          node.setAttribute(key, String(val));
        }
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach((child) => {
        if (child === null || child === undefined) return;
        if (typeof child === 'string') node.appendChild(document.createTextNode(child));
        else node.appendChild(child);
      });
    }
    return node;
  }

  function svgIcon(type) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');

    const paths = {
      external: ['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', 'M15 3h6v6', 'M10 14L21 3'],
      phone: ['M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 11.2 19a19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6.3 6.3l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z'],
      kept: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
      contacted: ['M20 6L9 17l-5-5'],
      returned: ['M22 11.1V12a10 10 0 1 1-5.9-9.1', 'M22 4L12 14.1l-3-3'],
      transferred: ['M5 12h14', 'M13 5l7 7-7 7'],
      pin: ['M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z', 'M12 10m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0'],
      check: ['M20 6L9 17l-5-5'],
      chevron: ['M6 9l6 6 6-6']
    };

    (paths[type] || []).forEach((d) => {
      const p = document.createElementNS(svgNS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    return svg;
  }

  function getCategoryObj(id) {
    return (state.data.dict.categories || []).find((c) => c.id === id) ||
      { id: 'etc', ko: '기타', en: 'Other' };
  }

  function getZoneObj(id) {
    return (state.data.dict.zones || []).find((z) => z.id === id) || null;
  }

  function getCenterKey() {
    if (!state.resolvedZone || state.resolvedZone === 'unknown') return null;
    const z = getZoneObj(state.resolvedZone);
    return z && z.center ? z.center : null;
  }

  function formatHours(lang) {
    const raw = state.data.dict.hours || '09:00-19:00 (12:00-13:00 휴게)';
    if (lang === 'en') {
      return raw.replace('휴게', 'break');
    }
    return raw;
  }

  // -------------------- 로컬 설정 & URL 쿼리 동기화 --------------------

  function loadPrefs() {
    try {
      const savedLang = localStorage.getItem('doechatgil_lang');
      if (savedLang === 'ko' || savedLang === 'en') state.lang = savedLang;
      const savedLarge = localStorage.getItem('doechatgil_large');
      state.largeText = savedLarge === '1';
    } catch (_) {
      // 저장소 접근 불가 환경 무시
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem('doechatgil_lang', state.lang);
      localStorage.setItem('doechatgil_large', state.largeText ? '1' : '0');
    } catch (_) {
      // 저장소 접근 불가 환경 무시
    }
  }

  function readQueryParams() {
    const params = new URLSearchParams(window.location.search);
    const langParam = params.get('lang');
    if (langParam === 'ko' || langParam === 'en') {
      state.lang = langParam;
    }

    // 시연용 기준일(?asof=YYYY-MM-DD): 심사 날짜가 달라도 같은 화면을 재현한다
    const asof = params.get('asof');
    if (asof && parseDateUTC(asof) !== null && asof <= state.today) {
      state.today = asof;
      state.asof = asof;
    }

    const d = params.get('d');
    const z = params.get('z');
    const q = params.get('q');

    let hasInput = false;
    if (d && parseDateUTC(d) !== null && d <= state.today) {
      state.date = d;
      hasInput = true;
    }
    if (z !== null) {
      state.selectedZone = z === 'unknown' ? '' : z;
      hasInput = true;
    }
    if (q !== null) {
      state.query = q;
      hasInput = true;
    }
    return hasInput;
  }

  function syncUrlParams() {
    const params = new URLSearchParams();
    if (state.hasSearched) {
      if (state.date) params.set('d', state.date);
      if (state.selectedZone) params.set('z', state.selectedZone);
      if (state.query.trim()) params.set('q', state.query.trim());
    }
    if (state.lang === 'en') {
      params.set('lang', 'en');
    }
    if (state.asof) params.set('asof', state.asof);
    const qs = params.toString();
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }

  // -------------------- 정적 UI 다국어 적용 --------------------

  function applyStaticI18n() {
    const lang = state.lang;
    document.documentElement.lang = lang;
    document.title = I18N.t(lang, 'pageTitle');

    document.querySelectorAll('[data-i18n]').forEach((node) => {
      const key = node.getAttribute('data-i18n');
      const txt = I18N.t(lang, key);
      if (txt) node.textContent = txt;
    });

    document.getElementById('lang-group').setAttribute('aria-label', lang === 'en' ? 'Language' : '언어 선택');
    document.getElementById('lang-ko').setAttribute('aria-pressed', String(lang === 'ko'));
    document.getElementById('lang-en').setAttribute('aria-pressed', String(lang === 'en'));

    document.getElementById('input-query').placeholder = I18N.t(lang, 'itemPlaceholder');
    document.getElementById('card-brand').placeholder = I18N.t(lang, 'brandPlaceholder');
    document.getElementById('card-feature').placeholder = I18N.t(lang, 'featurePlaceholder');
    document.getElementById('input-faq').placeholder = I18N.t(lang, 'faqPlaceholder');
    document.getElementById('faq-clear-btn').setAttribute('aria-label', I18N.t(lang, 'faqClearAria'));
    document.getElementById('stage-stepper').setAttribute('aria-label', I18N.t(lang, 'stepperAria'));
    const heroCredit = document.getElementById('hero-credit-link');
    if (heroCredit) heroCredit.setAttribute('aria-label', I18N.t(lang, 'heroCreditAria'));
    document.querySelectorAll('img[data-alt-ko][data-alt-en]').forEach((img) => {
      img.alt = lang === 'en' ? img.getAttribute('data-alt-en') : img.getAttribute('data-alt-ko');
    });

    if (state.data) {
      renderNotices();
      populateZoneSelect();
      populateColorSelect();
      renderFooter();
      renderStats();
      renderFaq();
      if (state.hasSearched) {
        renderAllResults();
      }
    }
  }

  function applyLargeText() {
    document.documentElement.classList.toggle('large-text', state.largeText);
    document.getElementById('large-text-toggle').setAttribute('aria-pressed', String(state.largeText));
  }

  function populateZoneSelect() {
    const select = document.getElementById('input-zone');
    const prev = state.selectedZone;
    select.innerHTML = '';
    select.appendChild(el('option', { value: '', text: I18N.t(state.lang, 'zoneUnknown') }));

    (state.data.dict.zones || []).forEach((z) => {
      if (z.id === 'unknown') return;
      select.appendChild(el('option', {
        value: z.id,
        text: state.lang === 'en' ? z.en : z.ko
      }));
    });
    select.value = prev;
  }

  function populateColorSelect() {
    const select = document.getElementById('card-color');
    const prev = state.cardColor;
    select.innerHTML = '';
    select.appendChild(el('option', { value: '', text: I18N.t(state.lang, 'colorNone') }));

    I18N.COLORS.forEach((c) => {
      select.appendChild(el('option', {
        value: c.id,
        text: `${c.ko} / ${c.en}`
      }));
    });
    select.value = prev;
  }

  // -------------------- 결과 ① 지금 있을 곳 렌더링 --------------------

  function renderStageSection() {
    const lang = state.lang;
    const dict = state.data.dict;
    const stageInfo = state.stageInfo;

    // 1) 그날 행사 배너
    const eventWrap = document.getElementById('event-banner-wrap');
    eventWrap.innerHTML = '';
    const dayEvents = getDayEvents(state.date, state.resolvedZone, state.data.events);
    dayEvents.forEach((ev) => {
      const metaItems = [];
      if (ev.organizer) {
        metaItems.push(el('span', { text: `${I18N.t(lang, 'eventOrganizer')}: ${ev.organizer}` }));
      }
      if (ev.contact) {
        metaItems.push(el('span', { text: `${I18N.t(lang, 'eventContact')}: ${ev.contact}` }));
      }
      if (ev.url) {
        metaItems.push(el('a', {
          className: 'ext-link',
          href: ev.url,
          target: '_blank',
          rel: 'noopener noreferrer'
        }, [I18N.t(lang, 'eventLink'), svgIcon('external')]));
      }
      // 영어 화면: 공연장은 영문 구역명, 제목은 「영문 공연정보」에서 같은 기간·비슷한 제목을 찾아 쓴다
      let venue = ev.venue;
      let title = ev.title;
      if (lang === 'en') {
        const z = getZoneObj(ev.zone);
        if (z && z.id !== 'unknown') venue = z.en;
        const enShow = findEnglishShow(ev, state.data.enShows || []);
        if (enShow) {
          title = enShow.title;
          if (enShow.url) {
            metaItems.push(el('a', {
              className: 'ext-link', href: enShow.url, target: '_blank', rel: 'noopener noreferrer'
            }, [I18N.t(lang, 'enShowLink'), svgIcon('external')]));
          }
        }
      }

      eventWrap.appendChild(el('div', { className: 'event-banner' }, [
        el('p', {
          className: 'event-lead',
          text: I18N.t(lang, 'eventBanner', { venue, title })
        }),
        el('div', { className: 'event-meta' }, metaItems)
      ]));
    });

    // 2) 4단계 스텝퍼
    const stepper = document.getElementById('stage-stepper');
    stepper.innerHTML = '';
    const stages = I18N.TEXT[lang].stages;
    const activeIdx = stages.findIndex((st) => st.id === stageInfo.stage);
    const isUrgentStage = stageInfo.stage === 'transfer_window' && Boolean(stageInfo.recent);
    stages.forEach((st, idx) => {
      const isDone = activeIdx >= 0 && idx < activeIdx;
      const isActive = idx === activeIdx;
      const cls = [
        'stepper-step',
        isDone ? 'is-done' : '',
        isActive ? 'is-active' : '',
        isActive && isUrgentStage ? 'is-urgent' : '',
        isActive && stageInfo.stage === 'transferred' ? 'is-transferred' : ''
      ].filter(Boolean).join(' ');
      const dotChild = isDone
        ? svgIcon('check')
        : el('span', { className: 'stepper-num', text: String(idx + 1) });
      stepper.appendChild(el('li', {
        className: cls,
        'aria-current': isActive ? 'step' : null
      }, [
        el('span', { className: 'stepper-dot', 'aria-hidden': 'true' }, dotChild),
        el('span', { className: 'stepper-label', text: st.label })
      ]));
    });

    // 3) 단계 설명 + 해야 할 일 + 경찰서 이관 정보 + 안내센터
    const body = document.getElementById('stage-body');
    body.innerHTML = '';

    const copy = I18N.TEXT[lang].stageCopy[stageInfo.stage];
    body.appendChild(el('p', { className: 'stage-desc', text: copy.desc }));

    const todoOl = el('ol', { className: 'todo-list' },
      copy.todos.map((item) => el('li', { text: item }))
    );
    body.appendChild(todoOl);

    if (stageInfo.stage === 'transfer_window' && stageInfo.recent) {
      body.insertBefore(el('p', { className: 'stage-urgent', text: I18N.t(lang, 'recentWindow') }), body.firstChild);
    }

    if (stageInfo.stage === 'transferred') {
      const tr = stageInfo.transfer;
      const info = tr
        ? I18N.t(lang, 'transferInfo', { moved: tr.moved, station: stationName(tr.station, lang) })
        : I18N.t(lang, 'transferInfoUnknown');
      const callout = el('div', { className: 'transfer-callout' }, [
        el('p', { className: 'transfer-callout-text' }, [
          el('strong', { text: info })
        ]),
        el('a', {
          className: 'btn btn-primary btn-sm',
          href: LOST112_URL,
          target: '_blank',
          rel: 'noopener noreferrer'
        }, [I18N.t(lang, 'lost112Btn'), svgIcon('external')])
      ]);
      body.appendChild(callout);
    }

    const centerKey = getCenterKey();
    const centerKeys = centerKey ? [centerKey] : ['peace', 'meeting'];
    const centerList = el('ul', { className: 'center-list' },
      centerKeys.map((key) => {
        const c = dict.centers[key];
        return el('li', { className: 'center-item' }, [
          el('span', { className: 'center-name', text: lang === 'en' ? c.en : c.ko }),
          el('a', { className: 'tel-link', href: `tel:${c.tel}` }, [svgIcon('phone'), c.tel])
        ]);
      })
    );

    body.appendChild(el('div', { className: 'center-box' }, [
      el('p', {
        className: 'center-box-title',
        text: I18N.t(lang, centerKey ? 'centerSectionOne' : 'centerSectionBoth')
      }),
      centerList,
      el('p', {
        className: 'center-hours',
        text: `${I18N.t(lang, 'hoursLabel')}: ${formatHours(lang)}`
      })
    ]));
  }

  // -------------------- 결과 ② 공원 공고 후보 + 경찰청 습득물 렌더링 --------------------

  function renderStatusBadge(status) {
    const lang = state.lang;
    const label = I18N.TEXT[lang].status[status] || status;
    const iconType = status === 'transferred' ? 'transferred'
      : status === 'returned' ? 'returned'
      : status === 'contacted' ? 'contacted'
      : 'kept';
    return el('span', { className: `status-badge status-${status}` }, [
      svgIcon(iconType),
      label
    ]);
  }

  function renderCandidatesSection() {
    const lang = state.lang;
    const dict = state.data.dict;

    // 1) 품목 후보 칩 + 자동 추출 장소 안내
    const bar = document.getElementById('interpretation-bar');
    bar.innerHTML = '';

    const chips = [el('span', { className: 'chip-group-label', text: I18N.t(lang, 'chipLabel') })];
    const shownIds = new Set();

    state.interpretations.forEach((cand) => {
      shownIds.add(cand.id);
      const cat = getCategoryObj(cand.id);
      const name = lang === 'en' ? cat.en : cat.ko;
      let label = name;
      if (cand.exact) label = `${name} · ${I18N.t(lang, 'chipExact')}`;
      else if (cand.confidence > 0) label = `${name} ${cand.confidence}%`;

      chips.push(el('button', {
        type: 'button',
        className: `chip${state.activeCat === cand.id ? ' is-selected' : ''}`,
        'aria-pressed': String(state.activeCat === cand.id),
        onClick: () => selectCategory(cand.id)
      }, label));
    });

    if (!shownIds.has(state.activeCat)) {
      const activeObj = getCategoryObj(state.activeCat);
      chips.push(el('button', {
        type: 'button',
        className: 'chip is-selected',
        'aria-pressed': 'true',
        onClick: () => selectCategory(state.activeCat)
      }, lang === 'en' ? activeObj.en : activeObj.ko));
    }

    chips.push(el('button', {
      type: 'button',
      className: 'chip chip-ghost',
      'aria-expanded': String(state.showAllCats),
      onClick: () => {
        state.showAllCats = !state.showAllCats;
        renderCandidatesSection();
      }
    }, I18N.t(lang, state.showAllCats ? 'chipCloseOther' : 'chipOtherBtn')));

    bar.appendChild(el('div', { className: 'chip-group' }, chips));

    if (state.showAllCats) {
      const allRow = el('div', { className: 'chip-group' },
        dict.categories.map((cat) => el('button', {
          type: 'button',
          className: `chip${state.activeCat === cat.id ? ' is-selected' : ''}`,
          'aria-pressed': String(state.activeCat === cat.id),
          onClick: () => {
            state.showAllCats = false;
            selectCategory(cat.id);
          }
        }, lang === 'en' ? cat.en : cat.ko))
      );
      bar.appendChild(allRow);
    }

    if (state.zoneAutoDetected && state.resolvedZone) {
      const zObj = getZoneObj(state.resolvedZone);
      if (zObj) {
        const zLabel = lang === 'en' ? zObj.en : zObj.ko;
        bar.appendChild(el('p', { className: 'detected-zone-note' }, [
          svgIcon('pin'),
          I18N.t(lang, 'detectedZone', { zone: zLabel })
        ]));
      }
    }

    // 2) 후보 목록 계산 및 표시
    const { fromDate, toDate, results } = getCandidates({
      items: state.data.lost.items,
      catId: state.activeCat,
      lostDate: state.date,
      resolvedZone: state.resolvedZone,
      targetCenter: getCenterKey(),
      allPeriod: state.allPeriod
    });

    const catObj = getCategoryObj(state.activeCat);
    const catName = lang === 'en' ? catObj.en : catObj.ko;
    const summaryEl = document.getElementById('candidates-summary');
    summaryEl.textContent = state.allPeriod
      ? I18N.t(lang, 'summaryAll', { cat: catName, count: results.length })
      : I18N.t(lang, 'summaryPeriod', { cat: catName, from: fromDate, to: toDate, count: results.length });

    const listEl = document.getElementById('candidates-list');
    const moreWrap = document.getElementById('candidates-more-wrap');
    listEl.innerHTML = '';
    moreWrap.innerHTML = '';

    if (results.length === 0) {
      listEl.appendChild(el('div', { className: 'empty-state' }, [
        el('p', { className: 'empty-title', text: I18N.t(lang, 'emptyCandidatesTitle') }),
        el('p', { className: 'empty-desc', text: I18N.TEXT[lang].emptyAdvice[state.stageInfo.stage] })
      ]));
    } else {
      const slice = results.slice(0, state.visibleCount);
      slice.forEach((item) => {
        const isPicked = state.pickedItem && state.pickedItem.id === item.id;
        // 영어 화면: 제목은 표준 품목 영문, 공고 원문 품명·장소는 (Korean)으로 덧붙인다
        const itemCat = getCategoryObj(item.cat);
        const displayName = lang === 'en' ? itemCat.en : ((item.name || '').trim() || catName);
        const rawPlace = (item.place || '').trim();
        const zoneEn = lang === 'en' && item.zone && item.zone !== 'unknown' ? getZoneObj(item.zone).en : '';
        const displayPlace = lang === 'en'
          ? (zoneEn || I18N.t(lang, 'placeFallback'))
          : (rawPlace || I18N.t(lang, 'placeFallback'));
        const centerObj = dict.centers[item.center];
        const centerLabel = centerObj ? (lang === 'en' ? centerObj.en : centerObj.ko) : '';
        const metaParts = [displayPlace, item.date];
        if (lang === 'en') {
          metaParts.unshift(`${I18N.t(lang, 'noticeNameLabel')}: ${item.name}${rawPlace ? ` / ${rawPlace}` : ''}`);
        }
        if (centerLabel) metaParts.push(centerLabel);
        if (item.status === 'transferred' && item.moved) {
          metaParts.push(`${item.moved} ${stationName(item.station, lang)}`.trim());
        }

        const card = el('article', { className: `item-card${isPicked ? ' is-picked' : ''}` }, [
          el('div', { className: 'item-card-top' }, [
            el('h3', { className: 'item-name', text: displayName }),
            renderStatusBadge(item.status)
          ]),
          el('p', { className: 'item-meta', text: metaParts.join(' · ') }),
          el('div', { className: 'item-card-bottom' }, [
            el('a', {
              className: 'ext-link',
              href: `${NOTICE_BASE_URL}${encodeURIComponent(item.notice)}`,
              target: '_blank',
              rel: 'noopener noreferrer'
            }, [I18N.t(lang, 'noticeLink'), svgIcon('external')]),
            el('button', {
              type: 'button',
              className: `btn btn-sm ${isPicked ? 'btn-primary' : 'btn-secondary'}`,
              'aria-pressed': String(Boolean(isPicked)),
              onClick: () => togglePickItem(item)
            }, I18N.t(lang, isPicked ? 'pickedForCard' : 'pickForCard'))
          ])
        ]);
        listEl.appendChild(card);
      });

      const remain = results.length - slice.length;
      if (remain > 0) {
        moreWrap.appendChild(el('button', {
          type: 'button',
          className: 'btn btn-secondary btn-block',
          onClick: () => {
            state.visibleCount += PAGE_SIZE;
            renderCandidatesSection();
          }
        }, I18N.t(lang, 'moreBtn', { remain })));
      }
    }

    // 3) 경찰청 습득물 블록
    renderPoliceBlock();
  }

  function renderPoliceBlock() {
    const lang = state.lang;
    const container = document.getElementById('police-content');
    container.innerHTML = '';
    const policeItems = state.data.police || [];

    if (policeItems.length === 0) {
      container.appendChild(el('div', { className: 'police-empty' }, [
        el('p', { text: I18N.t(lang, 'policeEmpty') }),
        el('div', null, [
          el('a', {
            className: 'btn btn-secondary btn-sm',
            href: LOST112_URL,
            target: '_blank',
            rel: 'noopener noreferrer'
          }, [I18N.t(lang, 'lost112Btn'), svgIcon('external')])
        ])
      ]));
      return;
    }

    const matched = policeItems.filter((p) => !p.cat || p.cat === state.activeCat).slice(0, PAGE_SIZE);
    if (matched.length === 0) {
      container.appendChild(el('div', { className: 'police-empty' }, [
        el('p', { text: I18N.t(lang, 'policeEmpty') })
      ]));
      return;
    }

    const list = el('div', { className: 'item-list' },
      matched.map((p) => {
        const meta = [p.where, p.date, p.color ? `${I18N.t(lang, 'policeColorLabel')}: ${p.color}` : '']
          .filter(Boolean)
          .join(' · ');
        return el('article', { className: 'item-card' }, [
          el('div', { className: 'item-card-top' }, [
            el('h4', { className: 'item-name', text: p.name || p.cls || '-' }),
            renderStatusBadge('transferred')
          ]),
          el('p', { className: 'item-meta', text: meta })
        ]);
      })
    );
    container.appendChild(list);
  }

  function selectCategory(catId) {
    state.activeCat = catId;
    state.visibleCount = PAGE_SIZE;
    renderCandidatesSection();
    renderKoreanCard();
  }

  function togglePickItem(item) {
    if (state.pickedItem && state.pickedItem.id === item.id) {
      state.pickedItem = null;
    } else {
      state.pickedItem = item;
    }
    renderCandidatesSection();
    renderKoreanCard();
    if (state.pickedItem) {
      // 담았다는 피드백: 확인 카드 영역을 펼치고 그 위치로 이동
      const det = document.getElementById('confirm-card-details');
      if (det) {
        det.open = true;
        det.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  // 「영문 공연정보」에서 같은 기간·비슷한 제목의 영문 공연명을 찾는다
  function latinTokens(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((t) => t.length >= 2);
  }
  function findEnglishShow(ev, enShows) {
    const evTok = new Set(latinTokens(ev.title));
    let best = null;
    let bestScore = 0;
    enShows.forEach((s) => {
      if (!(s.date >= addDays(ev.from, -3) && s.date <= ev.to)) return;
      const tok = latinTokens(s.title);
      if (!tok.length) return;
      const inter = tok.filter((t) => evTok.has(t)).length;
      const score = evTok.size ? inter / Math.min(tok.length, evTok.size) : 0;
      if (score > bestScore) { bestScore = score; best = s; }
    });
    return bestScore >= 0.5 ? best : null;
  }

  // 상단 안내 띠: 시연 기준일, 데이터 갱신 지연
  function renderNotices() {
    const lang = state.lang;
    let bar = document.getElementById('notice-bar');
    if (!bar) {
      bar = el('div', { id: 'notice-bar', className: 'notice-bar', role: 'status' });
      const main = document.querySelector('main') || document.body;
      main.insertBefore(bar, main.firstChild);
    }
    bar.innerHTML = '';
    const msgs = [];
    if (state.asof) msgs.push(I18N.t(lang, 'asofBanner', { d: state.asof }));
    const updated = state.data && state.data.meta && state.data.meta.updated;
    if (updated) {
      const ageH = (Date.now() - Date.parse(updated)) / 3600000;
      if (!state.asof && ageH > 48) msgs.push(I18N.t(lang, 'staleBanner', { u: formatUpdated(updated) }));
    }
    msgs.forEach((m) => bar.appendChild(el('p', { text: m })));
    bar.hidden = msgs.length === 0;
  }

  // -------------------- 결과 ③ 한국어 확인 카드 렌더링 --------------------

  function buildKoreanCardLines() {
    const cat = getCategoryObj(state.activeCat);
    const zoneObj = state.resolvedZone ? getZoneObj(state.resolvedZone) : null;
    const colorObj = I18N.COLORS.find((c) => c.id === state.cardColor);
    const brand = state.cardBrand.trim();
    const feature = state.cardFeature.trim();
    const zoneKo = zoneObj && zoneObj.id !== 'unknown' ? zoneObj.ko : '올림픽공원 내';

    const rows = [
      { label: '품목', value: cat.ko, isOrig: false }
    ];
    if (colorObj) {
      rows.push({ label: '색상', value: colorObj.ko, isOrig: false });
    }
    if (brand) {
      rows.push({ label: '브랜드', value: brand, isOrig: true });
    }
    if (feature) {
      rows.push({ label: '특징', value: feature, isOrig: true });
    }
    rows.push({ label: '분실', value: `${state.date} · ${zoneKo}`, isOrig: false });

    if (state.pickedItem) {
      const p = state.pickedItem;
      const pPlace = (p.place || '').trim() || '공원 내';
      rows.push({
        label: '후보',
        value: `${p.name || cat.ko} (${p.date}, ${pPlace}, 공고 #${p.notice})`,
        isOrig: false
      });
    }
    return rows;
  }

  function renderKoreanCard() {
    const preview = document.getElementById('korean-card-preview');
    preview.innerHTML = '';

    const rows = buildKoreanCardLines();
    preview.appendChild(el('p', { className: 'korean-card-title', text: '분실물 확인을 요청합니다' }));

    const dl = el('dl', { className: 'korean-card-dl' });
    rows.forEach((r) => {
      dl.appendChild(el('dt', { text: r.label }));
      const ddChildren = [r.value];
      if (r.isOrig) {
        ddChildren.push(el('span', { className: 'orig-tag', text: '(원문)' }));
      }
      dl.appendChild(el('dd', null, ddChildren));
    });
    preview.appendChild(dl);

    const enNote = document.getElementById('korean-card-en-note');
    if (state.lang === 'en') {
      enNote.textContent = I18N.t('en', 'enCardNote');
      enNote.hidden = false;
    } else {
      enNote.hidden = true;
    }

    const centerKey = getCenterKey() || 'peace';
    const center = state.data.dict.centers[centerKey];
    const callBtn = document.getElementById('call-center-btn');
    callBtn.href = `tel:${center.tel}`;
  }

  function copyKoreanCard() {
    const rows = buildKoreanCardLines();
    const lines = ['분실물 확인을 요청합니다'];
    rows.forEach((r) => {
      lines.push(`- ${r.label}: ${r.value}${r.isOrig ? ' (원문)' : ''}`);
    });
    const text = lines.join('\n');
    const feedback = document.getElementById('copy-feedback');

    const onSuccess = () => {
      feedback.textContent = I18N.t(state.lang, 'copiedFeedback');
    };
    const onFail = () => {
      feedback.textContent = I18N.t(state.lang, 'copyFailedFeedback');
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onSuccess, () => fallbackCopy(text, onSuccess, onFail));
    } else {
      fallbackCopy(text, onSuccess, onFail);
    }
  }

  function fallbackCopy(text, onSuccess, onFail) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) onSuccess();
      else onFail();
    } catch (_) {
      onFail();
    }
  }

  // -------------------- 결과 ④ FAQ 렌더링 --------------------

  function cleanFaqAnswer(raw) {
    return String(raw || '')
      .replace(/^\s*(?:-->|→)\s*(?:\r?\n)?\s*A\s*(?:\r?\n)+/i, '')
      .replace(/^\s*A\s*(?:\r?\n)+/, '')
      .trim();
  }

  function renderFaq() {
    const lang = state.lang;
    const container = document.getElementById('faq-results');
    container.innerHTML = '';

    const clearBtn = document.getElementById('faq-clear-btn');
    const hasFaqQuery = Boolean(state.faqQuery.trim());
    clearBtn.hidden = !hasFaqQuery;

    const matches = searchFaq(state.faqQuery, lang, state.data.faqKo, state.data.faqEn);
    if (matches.length === 0) {
      const centers = state.data.dict.centers;
      container.appendChild(el('div', { className: 'faq-fallback' }, [
        el('p', { text: I18N.t(lang, 'faqNoMatch') }),
        el('ul', { className: 'center-list' }, ['peace', 'meeting'].map((key) => {
          const c = centers[key];
          return el('li', { className: 'center-item' }, [
            el('span', { className: 'center-name', text: lang === 'en' ? c.en : c.ko }),
            el('a', { className: 'tel-link', href: `tel:${c.tel}` }, [svgIcon('phone'), c.tel])
          ]);
        }))
      ]));
      return;
    }

    matches.forEach((item) => {
      const chev = svgIcon('chevron');
      chev.setAttribute('class', 'icon chevron');
      const details = el('details', { className: 'faq-item' }, [
        el('summary', { className: 'faq-summary' }, [
          el('span', { className: 'faq-q', text: item.q }),
          chev
        ]),
        el('div', { className: 'faq-body' }, [
          el('p', { className: 'faq-a', text: cleanFaqAnswer(item.a) }),
          el('a', {
            className: 'ext-link faq-source',
            href: item.url,
            target: '_blank',
            rel: 'noopener noreferrer'
          }, [I18N.t(lang, /bid=0051/.test(item.url || '') ? 'faqSourceLost' : (/data\.go\.kr/.test(item.url || '') ? 'faqSourceFile' : 'faqSource')), svgIcon('external')])
        ])
      ]);
      if (hasFaqQuery) details.open = true;
      container.appendChild(details);
    });
  }

  // -------------------- 데이터 한눈에 & 푸터 렌더링 --------------------

  function renderStats() {
    const lang = state.lang;
    const stats = computeStats(state.data.lost);
    const grid = document.getElementById('stats-grid');
    grid.innerHTML = '';

    grid.appendChild(el('div', { className: 'stat-card' }, [
      el('p', { className: 'stat-label', text: I18N.t(lang, 'statYearCount', { year: stats.year }) }),
      el('p', { className: 'stat-value', text: I18N.t(lang, 'statYearUnit', { n: stats.yearTotal }) })
    ]));

    grid.appendChild(el('div', { className: 'stat-card' }, [
      el('p', { className: 'stat-label', text: I18N.t(lang, 'statTransferRate') }),
      el('p', { className: 'stat-value', text: `${stats.transferRate}%` }),
      el('p', {
        className: 'stat-sub',
        text: I18N.t(lang, 'statTransferSub', { total: stats.yearTotal, moved: stats.transferredCount })
      })
    ]));

    const latest = stats.latestTransfer;
    grid.appendChild(el('div', { className: 'stat-card' }, [
      el('p', { className: 'stat-label', text: I18N.t(lang, 'statLatestTransfer') }),
      el('p', { className: 'stat-value', text: latest ? latest.moved : '-' }),
      el('p', { className: 'stat-sub', text: latest ? stationName(latest.station, lang) : '' })
    ]));

    const dl = document.getElementById('dict-download');
    if (dl) dl.remove();
    grid.parentNode.appendChild(el('a', {
      id: 'dict-download', className: 'ext-link dict-download', href: 'data/dictionary.csv', download: 'doechatgil_dictionary.csv'
    }, [I18N.t(state.lang, 'dictDownload'), svgIcon('external')]));
    const list = document.getElementById('transfers-list');
    list.innerHTML = '';
    stats.recentTransfers.forEach((tr) => {
      list.appendChild(el('li', { className: 'transfer-row' }, [
        el('span', { className: 'transfer-period', text: `${tr.from} ~ ${tr.cutoff}` }),
        el('span', { className: 'transfer-date', text: `→ ${tr.moved} (${stationName(tr.station, lang)})` })
      ]));
    });
  }

  function renderFooter() {
    const updated = formatUpdated(state.data.meta && state.data.meta.updated);
    document.getElementById('footer-updated').textContent = I18N.t(state.lang, 'footerUpdated', { updated });
  }

  function renderAllResults() {
    const resultsArea = document.getElementById('results-area');
    const wasHidden = resultsArea.hidden;
    resultsArea.hidden = false;

    const homeIntro = document.getElementById('home-intro');
    if (homeIntro) homeIntro.hidden = true;
    const faqStepNum = document.getElementById('faq-step-num');
    if (faqStepNum) faqStepNum.hidden = false;

    renderStageSection();
    renderCandidatesSection();
    renderKoreanCard();

    if (wasHidden) {
      resultsArea.querySelectorAll('.result-section').forEach((sec) => {
        sec.classList.remove('is-entering');
        void sec.offsetWidth;
        sec.classList.add('is-entering');
      });
    }
  }

  // -------------------- 검색 실행 --------------------

  function runSearch(updateUrl) {
    const errorEl = document.getElementById('form-error');
    const dateVal = document.getElementById('input-date').value;
    const zoneVal = document.getElementById('input-zone').value;
    const queryVal = document.getElementById('input-query').value;

    if (!dateVal || parseDateUTC(dateVal) === null) {
      errorEl.textContent = I18N.t(state.lang, 'errInvalidDate');
      errorEl.hidden = false;
      return;
    }
    if (dateVal > state.today) {
      errorEl.textContent = I18N.t(state.lang, 'errFutureDate');
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;

    state.date = dateVal;
    state.selectedZone = zoneVal;
    state.query = queryVal;
    state.hasSearched = true;
    state.visibleCount = PAGE_SIZE;
    state.showAllCats = false;
    state.pickedItem = null;

    // 장소: select 우선, 모르겠어요면 문장에서 syn 보조 추출
    if (zoneVal) {
      state.resolvedZone = zoneVal;
      state.zoneAutoDetected = false;
    } else {
      const extracted = extractZoneFromQuery(queryVal, state.data.dict.zones);
      state.resolvedZone = extracted;
      state.zoneAutoDetected = Boolean(extracted);
    }

    // 품목 해석 및 단계 판정
    state.interpretations = interpret(queryVal, state.data.dict.categories);
    state.activeCat = state.interpretations[0].id;
    state.stageInfo = determineStage(state.date, state.today, state.data.lost.transfers);

    if (updateUrl) syncUrlParams();
    renderAllResults();
  }

  // -------------------- 초기화 및 이벤트 바인딩 --------------------

  async function fetchJson(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path} (${res.status})`);
    return res.json();
  }

  function bindEvents() {
    document.getElementById('lang-ko').addEventListener('click', () => {
      if (state.lang === 'ko') return;
      state.lang = 'ko';
      savePrefs();
      syncUrlParams();
      applyStaticI18n();
    });

    document.getElementById('lang-en').addEventListener('click', () => {
      if (state.lang === 'en') return;
      state.lang = 'en';
      savePrefs();
      syncUrlParams();
      applyStaticI18n();
    });

    document.getElementById('large-text-toggle').addEventListener('click', () => {
      state.largeText = !state.largeText;
      savePrefs();
      applyLargeText();
    });

    document.getElementById('search-form').addEventListener('submit', (e) => {
      e.preventDefault();
      runSearch(true);
    });

    document.getElementById('toggle-all-period').addEventListener('change', (e) => {
      state.allPeriod = e.target.checked;
      state.visibleCount = PAGE_SIZE;
      if (state.hasSearched) renderCandidatesSection();
    });

    document.getElementById('card-color').addEventListener('change', (e) => {
      state.cardColor = e.target.value;
      if (state.hasSearched) renderKoreanCard();
    });

    document.getElementById('card-brand').addEventListener('input', (e) => {
      state.cardBrand = e.target.value;
      if (state.hasSearched) renderKoreanCard();
    });

    document.getElementById('card-feature').addEventListener('input', (e) => {
      state.cardFeature = e.target.value;
      if (state.hasSearched) renderKoreanCard();
    });

    document.getElementById('copy-card-btn').addEventListener('click', copyKoreanCard);

    const faqInput = document.getElementById('input-faq');
    faqInput.addEventListener('input', (e) => {
      state.faqQuery = e.target.value;
      renderFaq();
    });

    document.getElementById('faq-clear-btn').addEventListener('click', () => {
      state.faqQuery = '';
      faqInput.value = '';
      renderFaq();
      faqInput.focus();
    });
  }

  async function init() {
    loadPrefs();
    const hasQueryInput = readQueryParams();
    applyLargeText();

    const dateInput = document.getElementById('input-date');
    dateInput.max = state.today;
    dateInput.value = state.date;
    document.getElementById('input-query').value = state.query;

    bindEvents();
    applyStaticI18n();

    try {
      const [lost, events, dict, faqKo, faqEn, police, meta] = await Promise.all([
        fetchJson('data/lost.json'),
        fetchJson('data/events.json'),
        fetchJson('data/dict.json'),
        fetchJson('data/faq_ko.json'),
        fetchJson('data/faq_en.json'),
        fetchJson('data/police.json'),
        fetchJson('data/meta.json')
      ]);

      let enShows = [];
      try { enShows = await fetchJson('data/en_shows.json'); } catch (_) { enShows = []; }
      state.data = { lost: lostAsOf(lost, state.asof), events, dict, faqKo, faqEn, police, meta, enShows };
      renderNotices();
      populateZoneSelect();
      populateColorSelect();
      renderFooter();
      renderStats();
      renderFaq();

      if (hasQueryInput) {
        runSearch(false);
      }
    } catch (err) {
      const box = document.getElementById('load-error');
      box.textContent = I18N.t(state.lang, 'errLoadData');
      box.hidden = false;
      console.error('Data load error:', err);
    }
  }

  const logicExports = {
    lostAsOf,
    getTodayKST,
    diffDays,
    addDays,
    normalizeText,
    bigramJaccard,
    interpret,
    extractZoneFromQuery,
    determineStage,
    getDayEvents,
    getCandidates,
    searchFaq,
    computeStats
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = logicExports;
  } else {
    global.DoechatgilLogic = logicExports;
    document.addEventListener('DOMContentLoaded', init);
  }
})(typeof window !== 'undefined' ? window : globalThis);
