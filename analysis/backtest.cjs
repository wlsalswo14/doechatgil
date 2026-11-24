// 단계 판정 백테스트 — 기획서 3장 '단계 판정(검증 완료)' 수치를 재현한다.
// 정의: 2026년 각 이관(이관일 M) 공지의 대상 구간(from~cutoff)에 접수된 물건마다,
//       이관 직전 7일(M-7 ~ M-1) 중 분실일 이후 날짜에 조회했다고 가정한다.
//       그날 기준으로 determineStage가 '이관 가능 구간'을 냈으면 '미리 경고함'으로 센다.
// 실행: node analysis/backtest.cjs [data/lost.json 경로]
const path = require('path');
const fs = require('fs');
const L = require(path.join(__dirname, '..', 'site', 'app.js'));
const file = process.argv[2] || path.join(__dirname, '..', 'site', 'data', 'lost.json');
const lost = JSON.parse(fs.readFileSync(file, 'utf8'));
const T = lost.transfers;

let total = 0, warned = 0;
const perTransfer = [];
for (const tr of T.filter((t) => t.moved && t.moved.startsWith('2026-'))) {
  const items = lost.items.filter((i) => i.date <= tr.cutoff && (!tr.from || i.date >= tr.from));
  let n = 0, w = 0;
  for (const it of items) {
    for (let k = 7; k >= 1; k--) {
      const d = L.addDays(tr.moved, -k);
      if (d < it.date) continue;
      const st = L.determineStage(it.date, d, T).stage;
      n++; if (st === 'transfer_window') w++;
    }
  }
  total += n; warned += w;
  perTransfer.push({ moved: tr.moved, items: items.length, queries: n, warned: w });
}
console.table(perTransfer);
console.log(JSON.stringify({ queries: total, warned, rate: total ? +(warned / total * 100).toFixed(1) : null }));
