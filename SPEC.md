# 되찾길 — 프런트엔드 사양 (1단계 MVP)

올림픽공원에서 물건을 잃어버린 사람이 "언제·어디서·무엇을"만 입력하면
① 지금 물건이 있을 곳(4단계) ② 공원 공고 후보 ③ 안내센터에 보여 줄 한국어 확인 카드 ④ 근거 링크가 붙은 FAQ 안내
를 보여 주는 **정적 웹앱**이다. 공공데이터 경진대회 시연용이며 심사위원이 PC·모바일로 바로 열어 본다.

## 0. 작업 범위
- 만들 파일: `site/index.html`, `site/style.css`, `site/app.js` (필요하면 `site/i18n.js`). 
- **건드리지 말 것**: `site/data/*`, `collector/*`, 이 SPEC.md.
- 프레임워크·빌드 도구 없이 바닐라 HTML/CSS/JS(ES2020). 외부 리소스는 Pretendard 웹폰트 하나만 허용:
  `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css`
- GitHub Pages(정적 호스팅)에서 그대로 동작해야 한다. 모든 데이터는 `fetch('data/…json')` 상대경로.
- 서버·DB·로그인·쿠키·외부 API 호출 없음. 개인정보를 어디에도 전송·저장하지 않는다(localStorage에는 언어·큰글씨 설정만).

## 1. 디자인 원칙 — 깔끔한 미니멀리즘
- 흰 배경, 단일 강조색 남색 `#1F3A5F`(보조 `#5B7BA6`, 옅은 배경 `#F3F6FA`), 본문 `#111827`, 보조 텍스트 `#4B5563`, 선 `#E5E7EB`.
- 상태 색은 아이콘·텍스트와 함께만 사용: 보관 중 `#1F3A5F`, 반환 완료 `#6B7280`, 경찰서 이관 `#B45309`(갈색 계열, 과하지 않게).
- 한 열 레이아웃, 최대 폭 720px, 모바일 우선(360px 폭에서 가로 스크롤 없음). 여백 넉넉히, 둥근 모서리 12px, 그림자 없음 또는 아주 옅게.
- 이모지 금지. 아이콘이 필요하면 단순한 인라인 SVG(선 1.75px).
- 글꼴 Pretendard, 기본 16px, 줄간격 1.6. **큰 글씨 모드**: html font-size 125%, 버튼·입력 높이 확대.
- 접근성: 모든 입력에 label, 포커스 링 명확, 대비 AA, 결과 영역 `aria-live="polite"`, 전화번호는 `tel:` 링크.

## 2. 화면 구성 (단일 페이지)
1. **헤더**: 워드마크 "되찾길"(굵게, 남색) + 한 줄 설명("올림픽공원 분실물 길잡이" / EN "Olympic Park Lost & Found Guide"). 우측에 `KO | EN` 토글, `큰 글씨` 토글.
2. **입력 카드** "언제·어디서·무엇을"
   - 잃어버린 날짜(date input, 기본값 오늘, 미래 불가)
   - 장소: `<select>`(dict.zones의 ko/en, "모르겠어요" 포함)
   - 물건: 자유 입력 텍스트(placeholder 예: "에어팟, 카드지갑, 차키…" / EN "AirPods, wallet, car key…")
   - [찾아보기] 버튼. URL 쿼리(`?d=2026-11-15&z=kspodome&q=카드지갑&lang=en`)로 상태를 공유할 수 있게 동기화.
3. **결과 ① 지금 있을 곳** — 4단계 진행 표시(점 4개 + 선, 현재 단계만 남색 채움):
   `등록 대기 → 안내센터 보관 → 이관 가능 구간 → 경찰서 이관` (EN: Not posted yet → At Info Center → May move soon → At police station)
   - 단계 설명 한 문장 + 해야 할 일 번호 목록(최대 3개) + 담당 안내센터 이름·전화(tel)·운영시간.
   - 그날 행사(아래 로직)가 있으면 맨 위에 "이날 ○○에서 ‘행사명’이 열렸어요. 공연장 안에서 잃어버렸다면 주최 측 먼저" + 주최·문의처·행사 원문 링크.
   - 경찰서 이관 단계면: 이관일·경찰서 표시 + LOST112 바로가기(`https://www.lost112.go.kr`).
4. **결과 ② 공원 공고 후보**
   - 위에 "품목 후보" 칩: 해석된 표준 품목과 신뢰도(예: `무선 이어폰 · 일치`, 퍼지면 `헤드셋 62%`). 칩을 누르면 품목 변경.
   - 카드 목록: 품명(굵게) / 습득장소 · 접수일 / 상태 배지 / "원문 공고" 링크. 최대 8개 + "더 보기".
   - 후보가 없으면: "아직 공고된 비슷한 물건이 없어요" + 단계별 조언.
   - 그 아래 "경찰청 습득물" 블록: `police.json`이 비어 있으면 "주변 역·경찰서 습득물은 LOST112에서 이어서 찾을 수 있어요(올림픽공원역·몽촌토성역·한성백제역)" + 링크. 비어 있지 않으면 같은 카드 형식으로 표시(색상 포함).
5. **결과 ③ 한국어 확인 카드** (접이식, 기본 접힘 "안내센터에 보여 줄 확인 카드 만들기")
   - 입력: 색상(select: 검정/흰색/회색/은색/금색/빨강/분홍/주황/노랑/초록/파랑/남색/보라/갈색/베이지/투명 — ko/en 병기), 브랜드·모델(텍스트), 특징·내용물(텍스트).
   - 출력 카드(항상 한국어): 제목 "분실물 확인을 요청합니다" / 품목(표준 품목 한글) / 색상(한글) / 브랜드 / 특징 / 분실(날짜 + 장소 한글) / 후보(선택한 공고가 있으면). EN 모드면 카드 아래에 영어 설명 "Show this card to the Info Center staff…". 사용자가 입력한 자유 텍스트는 그대로 두고 "(원문)" 표시.
   - 버튼: [문구 복사] [안내센터 전화].
6. **결과 ④ 자주 묻는 질문** — 검색창 1개(예: "운영시간", "주차", EN "parking", "hours").
   - KO: `faq_ko.json`의 q+a에서 토큰 겹침 점수, EN: `faq_en.json`의 q+tags.
   - 상위 3개를 질문/답변 + "근거: 올림픽공원 FAQ 원문 ↗" 링크로 표시. **점수가 기준 미만이면 답을 만들지 말고** "정확한 답을 찾지 못했어요. 안내센터로 문의하세요" + 두 센터 전화. 지어낸 문장을 절대 출력하지 않는다.
   - 검색 전 기본으로 "분실물 관련" 질문 2개(ko_index 42와 보관 기간 안내)를 보여 준다.
7. **데이터 한눈에**(작은 섹션, 심사위원용): lost.json에서 계산한 3개 숫자 — 올해 접수 건수, 그중 반환 표기 없이 이관 대상 비율, 최근 이관일·경찰서. 그리고 "이관 일정" 최근 6회 목록(기간 → 이관일).
8. **푸터**: "마지막 갱신 {meta.updated}" · 출처 "한국체육산업개발(주) 올림픽공원 유실물 공고·공연 행사 일정·FAQ (공공누리)" · "개인정보를 수집·전송하지 않습니다" · GitHub 링크(`https://github.com/wlsalswo14/doechatgil`).

## 3. 데이터 (site/data)
- `lost.json` `{updated, items:[{id,date,name,qty,place,zone,cat,center,status,note,posted,notice,moved,station}], transfers:[{from,cutoff,moved,station}]}`
  - status: `kept`(보관 중) `contacted`(연락 완료) `returned`(반환 완료) `transferred`(경찰서 이관)
  - transfers는 최신순. 원문 공고 URL: `https://www.ksponco.or.kr/olympicpark/board.es?mid=a20708000000&bid=0051&act=view&list_no={notice}`
- `events.json` `[{seq,title,from,to,venue,zone,organizer,contact,url}]` (from/to: YYYY-MM-DD)
- `dict.json` `{categories:[{id,ko,en,police,syn[]}], zones:[{id,ko,en,syn[],center}], centers:{peace:{ko,en,tel},meeting:{ko,en,tel}}, hours}`
- `faq_ko.json` `[{q,a,url}]`, `faq_en.json` `[{ko_index,q,a,tags[],url}]`, `police.json` `[]` 또는 `[{id,date,name,cls,color,where,cat}]`, `meta.json` `{updated,sources}`

## 4. 로직
날짜는 모두 한국 시간 기준 날짜(YYYY-MM-DD) 문자열 비교·일수 계산.
- **품목 해석** `interpret(query)`: 소문자·공백 제거 정규화. ① 각 카테고리 syn 중 정규화된 syn이 query에 포함되면 일치(신뢰도 100). 여러 개면 가장 긴 syn 우선. ② 없으면 query와 모든 syn의 문자 2-gram 자카드 유사도 → 카테고리별 최댓값 상위 3개(신뢰도 = 유사도×100 반올림). 0.25 미만은 버림. ③ 아무것도 없으면 `etc`.
- **장소**: select 값 우선, "모르겠어요"면 query 안의 zone syn으로 보조 추출.
- **단계 판정** (T=오늘, L=분실일, latest=transfers[0]):
  1. L이 어떤 transfer의 `[from, cutoff]` 구간에 들고 그 `moved ≤ T` → **경찰서 이관**(해당 transfer 정보 표시).
  2. 아니면 `T−L ≤ 3` → **등록 대기**.
  3. 아니면 `T−latest.moved ≥ 20` 또는 `T−L ≥ 25` → **이관 가능 구간**.
  4. 그 외 → **안내센터 보관**.
- **담당 안내센터**: zones[z].center(없으면 두 센터 모두 표시). 전화·운영시간은 dict.centers / dict.hours.
- **그날 행사**: `from ≤ L ≤ to` 인 events 중 zone이 사용자 장소와 같은 것(장소가 공연장 zone인 경우) 또는 장소를 모를 때는 그날 전체 행사(최대 2개).
- **후보 정렬**: 같은 cat만. 기간 `L−1 ≤ date ≤ L+21`. 점수 = (zone 일치 2점) + (같은 담당 센터 1점) − (|date−L| × 0.05). 상위 8개. "전체 기간 보기" 토글 시 기간 제한 해제(최신순).

## 5. 품질 체크(완료 전 직접 확인)
- `python -m http.server 8765 --directory site` 로 띄워 콘솔 오류 0, 360px·1280px 레이아웃 확인.
- 시나리오: (A) 2026-11-15, KSPO DOME, "카드지갑" → 행사 안내 + 단계 + 후보. (B) EN, "I lost my AirPods near the 88 lawn" → 무선 이어폰·88잔디마당 해석. (C) 큰 글씨 모드 + "휴대폰" 3주 전 날짜.
- 코드는 읽기 쉽게, 함수 단위로. 주석은 짧게 한국어.
