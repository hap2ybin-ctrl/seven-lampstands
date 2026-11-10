/* ==========================================================================
   일곱 금촛대 — 정답 데이터
   --------------------------------------------------------------------------
   · 이 파일만 고치면 문구·힌트·참고 문구·성경 본문을 바꿀 수 있습니다.
   · promises[].text 는 정답 판정에 쓰이는 카드 문구입니다.
   · clue 는 힌트를 열었을 때 크게 나오는 단서, hint 는 그 아래에 나오는 서신의 말씀입니다.
   · note 는 학습용 표에만 나오고, 정답 판정에는 쓰지 않습니다.
   · verseText 는 비워 두었습니다. 사용 허락을 받은 번역본 본문을 직접 채우세요.
   ========================================================================== */
"use strict";

/** 등대 모양: "menorah"(가지 7개인 등대 하나) | "seven-stands"(따로 선 촛대 7개) */
const LAMP_LAYOUT = "menorah";

/** 완성 화면에 나오는 문구 */
const CLOSING_VERSE = "일곱 촛대는 일곱 교회니라 (계 1:20)";

const CHURCHES = [
  {
    id: "ephesus",
    name: "에베소",
    ref: "계 2:7",
    lampIndex: 0,
    promises: [{ id: "eph-1", text: "낙원에 있는 생명나무 과실" }],
    hint: "처음 사랑을 버렸느니라 (2:4)",
    clue: "에덴동산 한가운데 있던 것을 떠올려 보세요.",
    note: "",
    verseText: ""
  },
  {
    id: "smyrna",
    name: "서머나",
    ref: "계 2:10–11",
    lampIndex: 1,
    promises: [
      { id: "smy-1", text: "생명의 면류관" },
      { id: "smy-2", text: "둘째 사망의 해를 면함" }
    ],
    hint: "죽도록 충성하라 (2:10)",
    clue: "죽기까지 충성한 사람에게 주시는 약속입니다. ‘생명’과 ‘사망’이 들어갑니다.",
    note: "생명의 면류관은 \"죽도록 충성하라\"(2:10)에 따른 약속",
    verseText: ""
  },
  {
    id: "pergamum",
    name: "버가모",
    ref: "계 2:17",
    lampIndex: 2,
    promises: [
      { id: "per-1", text: "감추었던 만나" },
      { id: "per-2", text: "흰 돌" }
    ],
    hint: "사탄의 권좌가 있는 데 (2:13)",
    clue: "광야에서 먹던 하늘 양식, 그리고 새 이름이 새겨지는 것입니다.",
    note: "흰 돌 위에 받는 자밖에 알 수 없는 새 이름",
    verseText: ""
  },
  {
    id: "thyatira",
    name: "두아디라",
    ref: "계 2:26–28",
    lampIndex: 3,
    promises: [
      { id: "thy-1", text: "만국을 다스리는 철장 권세" },
      { id: "thy-2", text: "새벽 별" }
    ],
    hint: "이세벨을 용납함 (2:20)",
    clue: "나라들을 다스리는 권세, 그리고 새벽하늘에 뜨는 것입니다.",
    note: "",
    verseText: ""
  },
  {
    id: "sardis",
    name: "사데",
    ref: "계 3:5",
    lampIndex: 4,
    promises: [
      { id: "sar-1", text: "흰 옷을 입음" },
      { id: "sar-2", text: "생명책 녹명" }
    ],
    hint: "살았다 하는 이름은 가졌으나 죽은 자 (3:1)",
    clue: "더럽히지 않은 ‘옷’, 그리고 이름이 지워지지 않는 ‘책’입니다.",
    note: "아버지와 천사들 앞에서 그 이름을 시인함",
    verseText: ""
  },
  {
    id: "philadelphia",
    name: "빌라델비아",
    ref: "계 3:12",
    lampIndex: 5,
    promises: [
      { id: "phi-1", text: "하나님 성전의 기둥" },
      { id: "phi-2", text: "하나님의 이름과 새 예루살렘의 이름과 예수님의 새 이름 기록" }
    ],
    hint: "열린 문을 두었으되 (3:8)",
    clue: "하나님의 성전에 세워지는 것, 그리고 그 위에 기록되는 이름들입니다.",
    note: "다시는 결코 밖으로 나가지 아니함",
    verseText: ""
  },
  {
    id: "laodicea",
    name: "라오디게아",
    ref: "계 3:21",
    lampIndex: 6,
    promises: [{ id: "lao-1", text: "예수님의 보좌에 함께 앉게 해줌" }],
    hint: "차지도 아니하고 뜨겁지도 아니하도다 (3:15)",
    clue: "이기신 예수님이 앉으신 자리를 떠올려 보세요.",
    note: "",
    verseText: ""
  }
];

/**
 * 데이터 자체 점검. 조각 합계 12, 교회별 [1,2,2,2,2,2,1], id 중복 없음을 확인한다.
 * 브라우저 콘솔에서 validateLampData() 를 직접 불러 볼 수 있다.
 */
function validateLampData() {
  const EXPECTED = [1, 2, 2, 2, 2, 2, 1];
  const errors = [];
  const sorted = CHURCHES.slice().sort(function (a, b) { return a.lampIndex - b.lampIndex; });
  const counts = sorted.map(function (c) { return c.promises.length; });
  const total = counts.reduce(function (a, b) { return a + b; }, 0);

  if (CHURCHES.length !== 7) errors.push("교회는 7개여야 합니다 (현재 " + CHURCHES.length + "개)");
  if (total !== 12) errors.push("조각 합계는 12여야 합니다 (현재 " + total + ")");
  if (counts.join(",") !== EXPECTED.join(",")) errors.push("교회별 조각 수가 [" + EXPECTED + "] 이 아닙니다: [" + counts + "]");

  const lampIdx = sorted.map(function (c) { return c.lampIndex; }).join(",");
  if (lampIdx !== "0,1,2,3,4,5,6") errors.push("lampIndex 는 0~6 이 한 번씩 나와야 합니다: " + lampIdx);

  const ids = new Set();
  const texts = new Set();
  CHURCHES.forEach(function (c) {
    if (ids.has(c.id)) errors.push("교회 id 중복: " + c.id);
    ids.add(c.id);
    c.promises.forEach(function (p) {
      if (ids.has(p.id)) errors.push("조각 id 중복: " + p.id);
      ids.add(p.id);
      if (texts.has(p.text)) errors.push("조각 문구 중복: " + p.text);
      texts.add(p.text);
    });
  });
  if (LAMP_LAYOUT !== "menorah" && LAMP_LAYOUT !== "seven-stands") {
    errors.push("LAMP_LAYOUT 은 \"menorah\" 또는 \"seven-stands\" 여야 합니다");
  }
  return { ok: errors.length === 0, total: total, counts: counts, errors: errors };
}

/* Node 에서 검증할 때만 쓰인다 (브라우저에서는 무시됨) */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { LAMP_LAYOUT: LAMP_LAYOUT, CLOSING_VERSE: CLOSING_VERSE, CHURCHES: CHURCHES, validateLampData: validateLampData };
}
