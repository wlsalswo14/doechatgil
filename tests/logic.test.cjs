// 되찾길 핵심 로직 회귀 테스트 — node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const L = require(path.join(__dirname, '..', 'site', 'app.js'));
const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'site', 'data', f), 'utf8'));
const dict = read('dict.json');
const lost = read('lost.json');
const top = (q) => L.interpret(q, dict.categories)[0];

test('품목 해석: 구어·외국어·표기 변형', () => {
  const cases = {
    '핸드폰': 'phone', '에어팟': 'earphone', 'I lost my AirPods near the 88 lawn': 'earphone',
    '자동차 열쇠': 'carkey', '차 열쇠': 'carkey', '차키': 'carkey', 'car key': 'carkey',
    '갤럭시 버즈': 'earphone', 'Galaxy Buds': 'earphone', 'Galaxy Watch': 'watch', '스마트워치': 'watch',
    '카드지갑': 'wallet', '교통카드': 'card', '응원봉': 'goods', 'lightstick': 'goods', 'mobile battery': 'device'
  };
  for (const [q, want] of Object.entries(cases)) {
    const r = top(q);
    assert.strictEqual(r.id, want, `${q} → ${r.id}`);
    assert.strictEqual(r.exact, true, `${q} exact`);
  }
});

test('품목 해석: 단어 안의 짧은 영단어로 오탐하지 않음', () => {
  const r = L.interpret('I lost something during the concert', dict.categories);
  assert.ok(!r.some((c) => c.id === 'jewelry'), 'during ≠ ring');
  const r2 = L.interpret('What should I do? I lost my bag', dict.categories);
  assert.strictEqual(r2[0].id, 'bag');
  assert.ok(!r2.some((c) => c.id === 'clothes'), 'what ≠ hat');
  const h = top('hockey stick');
  assert.ok(!(h.id === 'key' && h.exact), 'hockey ≠ key 일치(낮은 신뢰도 후보로만 허용)');
});

test('장소 추출: 단어 경계', () => {
  assert.strictEqual(L.extractZoneFromQuery('near the 88 lawn', dict.zones), 'lawn88');
  assert.notStrictEqual(L.extractZoneFromQuery('mp3 player', dict.zones), 'gates');
  assert.notStrictEqual(L.extractZoneFromQuery('navigate', dict.zones), 'gates');
  assert.strictEqual(L.extractZoneFromQuery('Ticketlink Live Arena', dict.zones), 'handball');
});

test('단계 판정: 실제 이관 일정(2026.11.18 송파경찰서)과 일치', () => {
  const T = lost.transfers;
  // 11/15 분실 → 11/16 조회: 직전 이관(10/14) 후 20일이 넘어 이관 가능 구간(분실 직후라도)
  const a = L.determineStage('2026-11-15', '2026-11-16', T);
  assert.strictEqual(a.stage, 'transfer_window');
  assert.strictEqual(a.recent, true);
  // 11/24 조회: 11/18 이관 공지 구간에 포함
  const b = L.determineStage('2026-11-15', '2026-11-24', T);
  assert.strictEqual(b.stage, 'transferred');
  assert.strictEqual(b.transfer.moved, '2026-11-18');
  // 11/22 분실 → 11/24 조회: 최근 이관 직후라 등록 대기
  assert.strictEqual(L.determineStage('2026-11-22', '2026-11-24', T).stage, 'pending');
  // 2013년 분실: 첫 공지 이전 → 경찰서 이관(이관일을 지어내지 않음)
  const old = L.determineStage('2013-05-05', '2026-11-24', T);
  assert.strictEqual(old.stage, 'transferred');
  assert.ok(!old.transfer || old.transfer.moved !== '2024-12-03');
});

test('이관 구간: 공지에 적힌 시작일을 쓰고 2000-01-01을 지어내지 않음', () => {
  const nov = lost.transfers.find((t) => t.moved === '2026-11-18');
  assert.strictEqual(nov.from, '2026-10-29');
  assert.ok(!lost.transfers.some((t) => t.from === '2000-01-01'));
});

test('FAQ: 근거가 약하면 답하지 않음', () => {
  const ko = read('faq_ko.json');
  const en = read('faq_en.json');
  assert.strictEqual(L.searchFaq('우주선 발사', 'ko', ko, en).length, 0);
  assert.ok(L.searchFaq('주차 요금', 'ko', ko, en)[0].q.includes('주차'));
  assert.ok(L.searchFaq('이용시간', 'ko', ko, en)[0].q.includes('이용시간'));
  assert.ok(!L.searchFaq('운영시간', 'ko', ko, en).some((x) => /미사/.test(x.q)));
  assert.ok(L.searchFaq('where is the info center', 'en', ko, en).length >= 1);
});
