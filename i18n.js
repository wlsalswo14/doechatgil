/* 다국어(KO/EN) 문구, 색상 사전, 단계별 안내 데이터 */
(function (global) {
  'use strict';

  const COLORS = [
    { id: 'black', ko: '검정', en: 'Black' },
    { id: 'white', ko: '흰색', en: 'White' },
    { id: 'gray', ko: '회색', en: 'Gray' },
    { id: 'silver', ko: '은색', en: 'Silver' },
    { id: 'gold', ko: '금색', en: 'Gold' },
    { id: 'red', ko: '빨강', en: 'Red' },
    { id: 'pink', ko: '분홍', en: 'Pink' },
    { id: 'orange', ko: '주황', en: 'Orange' },
    { id: 'yellow', ko: '노랑', en: 'Yellow' },
    { id: 'green', ko: '초록', en: 'Green' },
    { id: 'blue', ko: '파랑', en: 'Blue' },
    { id: 'navy', ko: '남색', en: 'Navy' },
    { id: 'purple', ko: '보라', en: 'Purple' },
    { id: 'brown', ko: '갈색', en: 'Brown' },
    { id: 'beige', ko: '베이지', en: 'Beige' },
    { id: 'clear', ko: '투명', en: 'Clear' }
  ];

  // 공원 공식 유실물센터 보관 기간 안내 (KO 기본 FAQ용)
  const KO_RETENTION_FAQ = {
    q: '습득물은 공원에서 얼마나 보관하나요?',
    a: '올림픽공원 내 습득물은 습득일로부터 약 1개월간 안내센터에서 보관하며, 보관 기간 경과 후 유실물법에 따라 관할 경찰서로 이관됩니다.\n안내센터 운영시간은 09:00~19:00(12:00~13:00 휴게)이며, 보관 장소는 평화의광장 안내센터(02-2180-3564)와 만남의광장 안내센터(02-2180-3566)입니다.',
    url: 'https://www.ksponco.or.kr/olympicpark/board.es?mid=a20708000000&bid=0051'
  };

  const TEXT = {
    ko: {
      pageTitle: '되찾길 — 올림픽공원 분실물 길잡이',
      skipToMain: '본문으로 바로가기',
      tagline: '올림픽공원 분실물 길잡이',
      largeText: '큰 글씨',
      searchTitle: '언제·어디서·무엇을',
      labelDate: '잃어버린 날짜',
      labelZone: '장소',
      zoneUnknown: '모르겠어요',
      labelItem: '물건',
      itemPlaceholder: '에어팟, 카드지갑, 차키…',
      searchBtn: '찾아보기',
      errFutureDate: '미래 날짜는 선택할 수 없어요. 오늘 또는 이전 날짜를 선택해 주세요.',
      errInvalidDate: '올바른 날짜를 입력해 주세요.',
      errLoadData: '데이터를 불러오지 못했어요. 잠시 후 새로고침해 주세요.',

      stageTitle: '지금 있을 곳',
      stepperAria: '분실물 처리 4단계',
      stages: [
        { id: 'pending', label: '등록 대기' },
        { id: 'kept', label: '안내센터 보관' },
        { id: 'transfer_window', label: '이관 가능 구간' },
        { id: 'transferred', label: '경찰서 이관' }
      ],
      stageCopy: {
        pending: {
          desc: '아직 공원 유실물 공고에 올라오기 전일 가능성이 높아요.',
          todos: [
            '당일~3일 안에는 습득물이 아직 정리 중일 수 있으니 담당 안내센터에 전화로 먼저 확인해 보세요.',
            '방문·통화 시 아래 3번 한국어 확인 카드에 특징을 정리해 두면 빠르게 확인할 수 있어요.',
            '1~2일 뒤 다시 공고를 확인하거나, 공원 밖 지하철역에서 잃어버렸다면 LOST112도 함께 조회하세요.'
          ]
        },
        kept: {
          desc: '올림픽공원 안내센터에서 보관 중일 가능성이 높은 시기예요.',
          todos: [
            '아래 2번 공원 공고 후보에서 비슷한 물건이 있는지 먼저 확인해 보세요.',
            '비슷한 공고가 있거나 보이지 않더라도 담당 안내센터에 전화해 세부 특징을 확인하세요.',
            '방문 수령 시 신분증을 지참하고 운영시간(점심 휴게 12:00~13:00 제외)을 확인해 주세요.'
          ]
        },
        transfer_window: {
          desc: '정기 경찰서 이관 시점이 가까워졌거나 이미 이관되었을 수 있는 구간이에요.',
          todos: [
            '담당 안내센터에 전화해 아직 센터에 보관 중인지, 경찰서로 넘어갔는지 확인하세요.',
            '이미 이관되었다면 이관 날짜와 접수 번호를 안내받은 뒤 LOST112에서 조회하세요.',
            '아래 2번 공고 목록에서 해당 날짜 주변 공고의 상태(보관 중/경찰서 이관)를 확인해 보세요.'
          ]
        },
        transferred: {
          desc: '이 날짜의 미반환 습득물은 관할 경찰서로 이관된 구간이에요.',
          todos: [
            '이관된 경찰서와 이관일을 확인한 뒤 경찰청 유실물 포털(LOST112)에서 검색하세요.',
            '아래 2번 공고에 비슷한 물건이 있다면 원문 공고 번호를 메모해 두면 문의에 도움이 됩니다.',
            '혹시 보관 여부 확인이 필요하면 담당 안내센터에도 함께 문의할 수 있어요.'
          ]
        }
      },
      eventBanner: '이날 {venue}에서 ‘{title}’ 행사가 열렸어요. 공연장 안에서 잃어버렸다면 주최 측에 먼저 문의해 보세요.',
      eventOrganizer: '주최',
      eventContact: '문의',
      eventLink: '행사 원문',
      transferInfo: '이관일 {moved} · 이관 경찰서 {station}',
      lost112Btn: 'LOST112 바로가기',
      centerSectionOne: '담당 안내센터',
      centerSectionBoth: '올림픽공원 안내센터 (장소 미지정 시 두 곳 모두 확인)',
      hoursLabel: '운영시간',

      candidatesTitle: '공원 공고 후보',
      chipLabel: '품목 후보',
      chipExact: '일치',
      chipOtherBtn: '다른 품목 선택',
      chipCloseOther: '품목 접기',
      detectedZone: '입력 문장에서 장소를 찾았어요: {zone}',
      allPeriod: '전체 기간 보기',
      summaryPeriod: '{cat} · {from} ~ {to} 공고 {count}건',
      summaryAll: '{cat} · 전체 기간 공고 {count}건 (최신순)',
      status: {
        kept: '보관 중',
        contacted: '연락 완료',
        returned: '반환 완료',
        transferred: '경찰서 이관'
      },
      placeFallback: '공원 내',
      noticeLink: '원문 공고',
      pickForCard: '확인 카드에 담기',
      pickedForCard: '확인 카드에 담김',
      moreBtn: '더 보기 ({remain}건 남음)',
      emptyCandidatesTitle: '아직 공고된 비슷한 물건이 없어요',
      emptyAdvice: {
        pending: '분실 후 3일 이내에는 습득물이 아직 게시판에 등록되지 않았을 수 있어요. 안내센터에 직접 전화해 확인해 보세요.',
        kept: '품목 분류가 다를 수 있으니 위 품목 후보를 바꾸어 보거나, 담당 안내센터에 전화로 문의해 보세요.',
        transfer_window: '기간 외 공고일 수 있으니 오른쪽 ‘전체 기간 보기’를 켜거나 안내센터·LOST112를 함께 확인해 보세요.',
        transferred: '이미 경찰서로 이관된 기간이에요. LOST112에서 직접 조회하거나 ‘전체 기간 보기’로 이전 공고를 살펴보세요.'
      },
      policeTitle: '경찰청 습득물',
      policeEmpty: '주변 역·경찰서 습득물은 LOST112에서 이어서 찾을 수 있어요(올림픽공원역·몽촌토성역·한성백제역).',
      policeColorLabel: '색상',

      cardSummary: '안내센터에 보여 줄 확인 카드 만들기',
      labelColor: '색상',
      colorNone: '선택 안 함',
      labelBrand: '브랜드·모델',
      brandPlaceholder: '예: 애플 에어팟 프로 2세대',
      labelFeature: '특징·내용물',
      featurePlaceholder: '예: 투명 케이스, 작은 키링 부착',
      copyCardBtn: '문구 복사',
      callCenterBtn: '안내센터 전화',
      copiedFeedback: '확인 카드 문구를 클립보드에 복사했어요.',
      copyFailedFeedback: '복사에 실패했어요. 화면의 카드를 직접 보여 주세요.',
      enCardNote: '',

      faqTitle: '자주 묻는 질문',
      labelFaqSearch: '궁금한 키워드로 찾기',
      faqPlaceholder: '예: 운영시간, 주차',
      faqClearAria: '검색어 지우기',
      faqSource: '근거: 올림픽공원 FAQ 원문',
      faqSourceLost: '근거: 올림픽공원 유실물센터 안내 원문',
      faqNoMatch: '정확한 답을 찾지 못했어요. 안내센터로 문의하세요.',

      statsTitle: '데이터 한눈에',
      statYearCount: '{year}년 접수 건수',
      statYearUnit: '{n}건',
      statTransferRate: '반환 표기 없이 이관 대상 비율',
      statTransferSub: '{total}건 중 {moved}건 이관',
      statLatestTransfer: '최근 이관일 · 경찰서',
      transferScheduleTitle: '이관 일정 (최근 6회)',

      footerUpdated: '마지막 갱신 {updated}',
      footerSource: '출처: 한국체육산업개발(주) 올림픽공원 유실물 공고·공연 행사 일정·FAQ (공공누리)',
      footerPrivacy: '개인정보를 수집·전송하지 않습니다'
    },

    en: {
      pageTitle: '되찾길 — Olympic Park Lost & Found Guide',
      skipToMain: 'Skip to main content',
      tagline: 'Olympic Park Lost & Found Guide',
      largeText: 'Large text',
      searchTitle: 'When · Where · What',
      labelDate: 'Date lost',
      labelZone: 'Location',
      zoneUnknown: 'Not sure',
      labelItem: 'Item',
      itemPlaceholder: 'AirPods, wallet, car key…',
      searchBtn: 'Search',
      errFutureDate: 'Future dates cannot be selected. Please choose today or an earlier date.',
      errInvalidDate: 'Please enter a valid date.',
      errLoadData: 'Failed to load data. Please refresh and try again.',

      stageTitle: 'Where it likely is now',
      stepperAria: 'Lost item status stages',
      stages: [
        { id: 'pending', label: 'Not posted yet' },
        { id: 'kept', label: 'At Info Center' },
        { id: 'transfer_window', label: 'May move soon' },
        { id: 'transferred', label: 'At police station' }
      ],
      stageCopy: {
        pending: {
          desc: 'Found items may not be posted on the park board yet within 3 days.',
          todos: [
            'Call the responsible Info Center directly to check if a matching item has been turned in.',
            'Prepare item details using the Korean verification card in section 3 before visiting or calling.',
            'Check the board again in 1–2 days, or search LOST112 if lost near a subway station.'
          ]
        },
        kept: {
          desc: 'Your item is most likely being stored at an Olympic Park Info Center.',
          todos: [
            'Review the park notice candidates in section 2 for a possible match.',
            'Call or visit the Info Center with specific identifying details (color, brand, contents).',
            'Bring an ID when picking up, and note the daily break time (12:00–13:00).'
          ]
        },
        transfer_window: {
          desc: 'The scheduled police transfer window is approaching or may have just passed.',
          todos: [
            'Call the Info Center to confirm whether the item is still on-site or transferred.',
            'If transferred, ask for the transfer date and check the national police portal (LOST112).',
            'Check the status badges of nearby notices in section 2 below.'
          ]
        },
        transferred: {
          desc: 'Unclaimed items from this date have been transferred to the local police station.',
          todos: [
            'Search on Korea’s national Lost & Found portal (LOST112) using the transfer date and station below.',
            'If you see a matching park notice in section 2, note the notice number for reference.',
            'You can still contact the Info Center to double-check transfer records.'
          ]
        }
      },
      eventBanner: '‘{title}’ took place at {venue} on this day. If lost inside the venue, contact the event organizer first.',
      eventOrganizer: 'Organizer',
      eventContact: 'Contact',
      eventLink: 'Event notice',
      transferInfo: 'Transferred on {moved} · Station: {station}',
      lost112Btn: 'Open LOST112',
      centerSectionOne: 'Assigned Info Center',
      centerSectionBoth: 'Olympic Park Info Centers (check both when location is unsure)',
      hoursLabel: 'Hours',

      candidatesTitle: 'Park notice candidates',
      chipLabel: 'Item category',
      chipExact: 'match',
      chipOtherBtn: 'Other category',
      chipCloseOther: 'Hide list',
      detectedZone: 'Detected location from your query: {zone}',
      allPeriod: 'Show all dates',
      summaryPeriod: '{cat} · {from} to {to} ({count} found)',
      summaryAll: '{cat} · All dates ({count} found, newest first)',
      status: {
        kept: 'Stored',
        contacted: 'Contacted',
        returned: 'Returned',
        transferred: 'Transferred'
      },
      placeFallback: 'Inside park',
      noticeLink: 'Original notice',
      pickForCard: 'Attach to card',
      pickedForCard: 'Attached to card',
      moreBtn: 'Show more ({remain} left)',
      emptyCandidatesTitle: 'No matching park notices posted yet',
      emptyAdvice: {
        pending: 'Within 3 days of losing an item, it may not appear online yet. Try calling the Info Center directly.',
        kept: 'It might be listed under a nearby category. Try another category chip above or call the Info Center.',
        transfer_window: 'Try enabling “Show all dates” or check both the Info Center and LOST112.',
        transferred: 'Items from this period have moved to the police station. Search on LOST112 or enable “Show all dates”.'
      },
      policeTitle: 'Police found items',
      policeEmpty: 'You can continue searching items found at nearby subway and police stations on LOST112 (Olympic Park Stn, Mongchontoseong Stn, Hanseong Baekje Stn).',
      policeColorLabel: 'Color',

      cardSummary: 'Create Korean verification card for Info Center',
      labelColor: 'Color',
      colorNone: 'Not selected',
      labelBrand: 'Brand / Model',
      brandPlaceholder: 'e.g., Apple AirPods Pro 2',
      labelFeature: 'Details / Contents',
      featurePlaceholder: 'e.g., Clear case with small keychain',
      copyCardBtn: 'Copy Korean text',
      callCenterBtn: 'Call Info Center',
      copiedFeedback: 'Copied the Korean verification text.',
      copyFailedFeedback: 'Copy failed. You can show the card directly on screen.',
      enCardNote: 'Show this card to the Info Center staff. Your free-text inputs are shown as entered with “(원문)”.',

      faqTitle: 'Frequently asked questions',
      labelFaqSearch: 'Search by keyword',
      faqPlaceholder: 'e.g., parking, hours',
      faqClearAria: 'Clear search',
      faqSource: 'Source: Official Olympic Park FAQ',
      faqSourceLost: 'Source: Olympic Park Lost & Found notice',
      faqNoMatch: 'We couldn’t find an exact answer. Please contact an Info Center.',

      statsTitle: 'Data at a glance',
      statYearCount: 'Items logged in {year}',
      statYearUnit: '{n}',
      statTransferRate: 'Transferred without return mark',
      statTransferSub: '{moved} of {total} items',
      statLatestTransfer: 'Latest transfer · Station',
      transferScheduleTitle: 'Transfer schedule (latest 6)',

      footerUpdated: 'Last updated {updated}',
      footerSource: 'Source: KSPO&CO Olympic Park Lost & Found, Events, FAQ (KOGL)',
      footerPrivacy: 'No personal data is collected or transmitted'
    }
  };

  function t(lang, key, vars) {
    const dict = TEXT[lang] || TEXT.ko;
    let str = dict[key];
    if (typeof str !== 'string') return '';
    if (vars) {
      Object.keys(vars).forEach((k) => {
        str = str.replaceAll(`{${k}}`, String(vars[k]));
      });
    }
    return str;
  }

  const exported = { COLORS, KO_RETENTION_FAQ, TEXT, t };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  } else {
    global.I18N = exported;
  }
})(typeof window !== 'undefined' ? window : globalThis);
