/* ==========================================================================
   일곱 금촛대 — 게임 로직
   data.js 의 CHURCHES / LAMP_LAYOUT / CLOSING_VERSE 를 읽어 화면을 만든다.
   ========================================================================== */
(function () {
  "use strict";

  /* ---------- 0. 데이터 검증 (콘솔) ---------- */
  var check = validateLampData();
  if (check.ok) {
    console.info("[일곱 금촛대] 데이터 검증 통과 — 조각 " + check.total + "개, 교회별 [" + check.counts.join(", ") + "]");
  } else {
    console.error("[일곱 금촛대] data.js 를 확인하세요:\n- " + check.errors.join("\n- "));
  }

  var STORAGE_KEY = "seven-lampstands:v1";
  var SOUND_KEY = "seven-lampstands:sound";
  var HINT_AFTER = 2;            // 같은 교회에서 이만큼 틀리면 힌트 버튼이 생긴다
  var DRAG_THRESHOLD = 8;        // px
  var TOTAL = CHURCHES.length;

  var ORDERED = CHURCHES.slice().sort(function (a, b) { return a.lampIndex - b.lampIndex; });
  var churchById = new Map();
  var pieceText = new Map();
  ORDERED.forEach(function (c) {
    churchById.set(c.id, c);
    c.promises.forEach(function (p) { pieceText.set(p.id, p.text); });
  });

  var reduceMotion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function make(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ---------- 1. 저장소 (localStorage 는 막혀 있을 수 있다) ---------- */
  var store = {
    load: function (key) {
      try { var raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
      catch (e) { return null; }
    },
    save: function (key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 저장 불가: 무시 */ }
    },
    remove: function (key) {
      try { window.localStorage.removeItem(key); } catch (e) { /* 무시 */ }
    }
  };

  /* ---------- 2. 카드와 정답 판정 ---------- */
  /** 약속 조각 12장: 조각 하나가 카드 한 장 */
  function cardsFor() {
    var list = [];
    ORDERED.forEach(function (c) {
      c.promises.forEach(function (p) { list.push({ id: p.id, pieces: [p.id] }); });
    });
    return list;
  }
  function cardMapFor(mode) {
    var m = new Map();
    cardsFor(mode).forEach(function (c) { m.set(c.id, c); });
    return m;
  }

  /**
   * 유일한 판정 함수. 넣은 조각 집합이 그 교회의 조각 집합과 정확히 같을 때만 ok.
   * 하나가 빠지거나 하나가 섞이면 ok 가 아니다.
   */
  function judge(churchId, pieceIds) {
    var church = churchById.get(churchId);
    var want = new Set(church.promises.map(function (p) { return p.id; }));
    var got = new Set(pieceIds);
    var stray = 0, missing = 0;
    got.forEach(function (id) { if (!want.has(id)) stray++; });
    want.forEach(function (id) { if (!got.has(id)) missing++; });
    return { ok: got.size > 0 && stray === 0 && missing === 0, stray: stray, missing: missing };
  }

  function piecesOf(cardIds, cardMap) {
    var out = [];
    cardIds.forEach(function (id) {
      var card = cardMap.get(id);
      if (card) card.pieces.forEach(function (p) { out.push(p); });
    });
    return out;
  }

  /* ---------- 3. 상태 ---------- */
  function freshState() {
    var placed = {};
    ORDERED.forEach(function (c) { placed[c.id] = []; });
    return {
      view: "start",       // "start" | "game"
      mode: null,          // 게임을 시작하면 "advanced" (조각 12장 방식 하나뿐)
      order: [],           // 카드 영역의 순서 (섞인 카드 id)
      placed: placed,      // 교회별로 놓인 카드 id
      lit: [],             // 불이 켜진 교회 id
      wrong: 0,
      wrongBy: {},
      hintOpen: {},
      elapsed: 0,          // ms
      done: false
    };
  }

  /** 저장된 값을 그대로 믿지 않는다. 판정을 다시 통과한 등잔만 켠다. */
  function sanitize(saved) {
    try {
      if (!saved || typeof saved !== "object") return null;
      if (saved.mode !== "advanced") return null;   // 예전 기본 모드 저장분은 버린다
      var map = cardMapFor(saved.mode);
      var ids = Array.from(map.keys());
      if (!Array.isArray(saved.order) || saved.order.length !== ids.length) return null;
      if (!ids.every(function (id) { return saved.order.indexOf(id) !== -1; })) return null;

      var out = freshState();
      out.mode = saved.mode;
      out.view = saved.view === "game" ? "game" : "start";
      out.order = saved.order.slice();

      var seen = new Set();
      for (var i = 0; i < ORDERED.length; i++) {
        var cid = ORDERED[i].id;
        var arr = saved.placed && Array.isArray(saved.placed[cid]) ? saved.placed[cid] : [];
        for (var j = 0; j < arr.length; j++) {
          if (!map.has(arr[j]) || seen.has(arr[j])) return null;
          seen.add(arr[j]);
        }
        out.placed[cid] = arr.slice();
      }
      var lit = Array.isArray(saved.lit) ? saved.lit : [];
      for (var k = 0; k < lit.length; k++) {
        if (!churchById.has(lit[k]) || out.lit.indexOf(lit[k]) !== -1) return null;
        if (!judge(lit[k], piecesOf(out.placed[lit[k]], map)).ok) return null;
        out.lit.push(lit[k]);
      }
      out.wrong = Math.max(0, Math.floor(Number(saved.wrong) || 0));
      out.elapsed = Math.max(0, Number(saved.elapsed) || 0);
      ORDERED.forEach(function (c) {
        var w = saved.wrongBy && Number(saved.wrongBy[c.id]);
        if (w > 0) out.wrongBy[c.id] = Math.floor(w);
        if (saved.hintOpen && saved.hintOpen[c.id]) out.hintOpen[c.id] = true;
      });
      out.done = out.lit.length === TOTAL;
      return out;
    } catch (e) {
      return null;
    }
  }

  var state = sanitize(store.load(STORAGE_KEY)) || freshState();
  var cardMap = state.mode ? cardMapFor(state.mode) : new Map();

  // 저장하지 않는 화면 상태
  var selected = null;            // 고른 카드 id
  var tableOpen = false;
  var doneRevealed = state.done;  // 완성 화면을 보여 줄 차례인가
  var feedback = {};              // 교회별 판정 메시지 (심화 모드)
  var trayNote = "";              // 한꺼번에 확인한 결과 (기본 모드)
  var tickFrom = null;            // 시계가 돌기 시작한 시각
  var suppressClick = false;      // 드래그 직후의 click 무시
  var doneTimer = null;

  /* ---------- 4. 시계 ---------- */
  function clockShouldRun() {
    return state.view === "game" && !state.done && !tableOpen && !document.hidden;
  }
  function syncClock() {
    var now = performance.now();
    if (tickFrom != null) state.elapsed += now - tickFrom;
    tickFrom = clockShouldRun() ? now : null;
  }
  function elapsedNow() {
    return state.elapsed + (tickFrom != null ? performance.now() - tickFrom : 0);
  }
  function clockText(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    return (m < 10 ? "0" : "") + m + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
  }
  function durationText(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    return m > 0 ? m + "분 " + (s % 60) + "초" : s + "초";
  }
  function save() {
    syncClock();
    store.save(STORAGE_KEY, state);
  }

  /* ---------- 5. 효과음 (기본은 꺼짐) ---------- */
  var soundOn = store.load(SOUND_KEY) === true;
  var audioCtx = null;
  function tone(ctx, freq, at, dur, type, peak) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }
  function play(kind) {
    if (!soundOn) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === "suspended") audioCtx.resume();
      var t = audioCtx.currentTime + 0.01;
      if (kind === "lit") {
        tone(audioCtx, 880, t, 0.9, "sine", 0.12);
        tone(audioCtx, 1318.5, t + 0.09, 1.1, "sine", 0.08);
      } else if (kind === "wrong") {
        tone(audioCtx, 174.6, t, 0.22, "triangle", 0.12);
      } else if (kind === "place") {
        tone(audioCtx, 587.3, t, 0.12, "sine", 0.05);
      } else if (kind === "done") {
        [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
          tone(audioCtx, f, t + i * 0.16, 1.4, "sine", 0.1);
        });
      }
    } catch (e) { /* 소리를 낼 수 없으면 조용히 넘어간다 */ }
  }

  /* ---------- 6. 화면 요소 ---------- */
  var app = $("#app");
  var live = $("#live");
  var menorahWrap = $("#menorah");
  var churchesEl = $("#churches");
  var trayWrap = $("#tray-wrap");
  var trayEl = $("#tray");
  var timerEl = $("#timer");

  var liveTimer = null;
  function announce(msg) {
    live.textContent = "";
    clearTimeout(liveTimer);
    liveTimer = setTimeout(function () { live.textContent = msg; }, 60);
  }

  /* ---------- 7. SVG 등대 ---------- */
  var LAMP_X0 = 50, LAMP_DX = 100, ARM_Y = 146, MID_X = 350;
  function lampX(church) { return LAMP_X0 + LAMP_DX * church.lampIndex; }

  function buildMenorah() {
    var defs =
      '<defs>' +
      '<radialGradient id="glowGrad" cx="50%" cy="50%" r="50%">' +
        '<stop offset="0" stop-color="#ffe7ad" stop-opacity=".85"/>' +
        '<stop offset=".3" stop-color="#ffb65a" stop-opacity=".38"/>' +
        '<stop offset=".65" stop-color="#ff9c46" stop-opacity=".12"/>' +
        '<stop offset="1" stop-color="#ff8a3c" stop-opacity="0"/>' +
      '</radialGradient>' +
      '<radialGradient id="flameOuter" cx="50%" cy="78%" r="75%">' +
        '<stop offset="0" stop-color="#fff3b8"/>' +
        '<stop offset=".45" stop-color="#ffc24a"/>' +
        '<stop offset="1" stop-color="#f0641e"/>' +
      '</radialGradient>' +
      '<linearGradient id="cupMatte" x1="0" x2="1" y1="0" y2="0">' +
        '<stop offset="0" stop-color="#6f5321"/><stop offset=".4" stop-color="#a5843c"/><stop offset="1" stop-color="#6a4f1f"/>' +
      '</linearGradient>' +
      '<linearGradient id="cupLit" x1="0" x2="1" y1="0" y2="0">' +
        '<stop offset="0" stop-color="#b9821f"/><stop offset=".4" stop-color="#ffe7a0"/><stop offset="1" stop-color="#c08a24"/>' +
      '</linearGradient>' +
      '<radialGradient id="floorGrad" cx="50%" cy="50%" r="50%">' +
        '<stop offset="0" stop-color="#8a6a3e" stop-opacity=".55"/>' +
        '<stop offset=".55" stop-color="#5a3f2a" stop-opacity=".28"/>' +
        '<stop offset="1" stop-color="#2a1a20" stop-opacity="0"/>' +
      '</radialGradient>' +
      '</defs>';

    // 성소의 바닥과, 등대를 올려 둔 상 (조각목에 금을 입힌 상)
    var wide = LAMP_LAYOUT === "seven-stands";
    var tx0 = wide ? 12 : 96, tx1 = wide ? 688 : 604, tw = tx1 - tx0;
    var tableShapes =
      '<rect class="wood back" x="' + (tx0 + 54) + '" y="408" width="9" height="38"/>' +
      '<rect class="wood back" x="' + (tx1 - 63) + '" y="408" width="9" height="38"/>' +
      '<rect class="wood" x="' + (tx0 + 14) + '" y="398" width="' + (tw - 28) + '" height="14"/>' +
      '<rect class="solid" x="' + (tx0 + 14) + '" y="409" width="' + (tw - 28) + '" height="3"/>' +
      '<rect class="wood" x="' + (tx0 + 28) + '" y="436" width="' + (tw - 56) + '" height="4"/>' +
      '<rect class="wood" x="' + (tx0 + 16) + '" y="398" width="13" height="54"/>' +
      '<rect class="wood" x="' + (tx1 - 29) + '" y="398" width="13" height="54"/>' +
      '<rect class="solid" x="' + (tx0 + 14) + '" y="447" width="17" height="6" rx="1.5"/>' +
      '<rect class="solid" x="' + (tx1 - 31) + '" y="447" width="17" height="6" rx="1.5"/>' +
      '<rect class="solid" x="' + (tx0 + 8) + '" y="393" width="' + (tw - 16) + '" height="5"/>' +
      '<rect class="solid" x="' + tx0 + '" y="385" width="' + tw + '" height="9" rx="2"/>';
    var scene =
      '<g class="scene">' +
        '<ellipse cx="350" cy="450" rx="' + (tw / 2 + 170) + '" ry="22" fill="url(#floorGrad)"/>' +
        '<ellipse class="table-shadow" cx="350" cy="454" rx="' + (tw / 2 + 8) + '" ry="6"/>' +
        '<g class="base-matte">' + tableShapes + '</g><g class="base-bright">' + tableShapes + '</g>' +
        '<ellipse class="table-glow" cx="350" cy="387" rx="' + Math.min(150, tw / 2 - 20) + '" ry="5"/>' +
      '</g>';

    var branches = "";
    var base = "";

    if (LAMP_LAYOUT === "seven-stands") {
      // 따로 선 촛대 7개
      ORDERED.forEach(function (c) {
        var x = lampX(c);
        branches +=
          '<g class="branch" data-branch="' + c.id + '">' +
            '<path class="metal" d="M' + x + ' ' + ARM_Y + ' V352"/>' +
            '<path class="sheen" d="M' + x + ' ' + (ARM_Y + 4) + ' V348"/>' +
            '<ellipse class="solid" cx="' + x + '" cy="246" rx="9" ry="6"/>' +
            '<path class="solid" d="M' + (x - 27) + ' 385 Q' + (x - 20) + ' 356 ' + x + ' 350 Q' + (x + 20) + ' 356 ' + (x + 27) + ' 385 Z"/>' +
          '</g>';
      });
    } else {
      // 가지가 7개인 등대 하나: 가운데 줄기 + 양쪽으로 세 쌍의 가지
      var RY = [0, 60, 114, 166];
      ORDERED.forEach(function (c) {
        var x = lampX(c);
        var k = Math.round(Math.abs(x - MID_X) / LAMP_DX);
        var d;
        if (k === 0) {
          d = "M" + MID_X + " " + ARM_Y + " V352";
        } else {
          d = "M" + x + " " + ARM_Y + " A" + (LAMP_DX * k) + " " + RY[k] + " 0 0 " + (x < MID_X ? 0 : 1) + " " + MID_X + " " + (ARM_Y + RY[k]);
        }
        branches +=
          '<g class="branch" data-branch="' + c.id + '">' +
            '<path class="metal" d="' + d + '"/>' +
            '<path class="sheen" d="' + d + '"/>' +
          '</g>';
      });
      var baseShapes =
        '<ellipse class="solid" cx="' + MID_X + '" cy="' + (ARM_Y + RY[1]) + '" rx="10" ry="7"/>' +
        '<ellipse class="solid" cx="' + MID_X + '" cy="' + (ARM_Y + RY[2]) + '" rx="11" ry="7"/>' +
        '<ellipse class="solid" cx="' + MID_X + '" cy="' + (ARM_Y + RY[3]) + '" rx="12" ry="7"/>' +
        '<path class="solid" d="M286 376 Q298 354 350 350 Q402 354 414 376 Z"/>' +
        '<rect class="solid" x="272" y="375" width="156" height="10" rx="3"/>';
      base = '<g class="base-matte">' + baseShapes + '</g><g class="base-bright">' + baseShapes + '</g>';
    }

    var lamps = "";
    ORDERED.forEach(function (c, i) {
      var fd = (1.55 + ((i * 37) % 9) * 0.07).toFixed(2);
      var delay = (-(i * 0.43) % 1.7).toFixed(2);
      lamps +=
        '<g class="lamp" data-lamp="' + c.id + '" transform="translate(' + lampX(c) + ' 0)" style="--fd:' + fd + 's;--fdelay:' + delay + 's">' +
          '<circle class="glow" cx="0" cy="88" r="80" fill="url(#glowGrad)"/>' +
          '<text class="lamp-num" x="0" y="36" text-anchor="middle">' + (c.lampIndex + 1) + '</text>' +
          '<g class="flame-wrap"><g class="flame">' +
            '<path class="flame-outer" d="M0 115 C-18 101 -12 81 0 52 C12 81 18 101 0 115 Z"/>' +
            '<path class="flame-inner" d="M0 114 C-8 106 -6 95 0 80 C6 95 8 106 0 114 Z"/>' +
          '</g></g>' +
          '<path class="wick" d="M0 120 V109"/>' +
          '<path class="cup" d="M-20 119 Q-18 144 0 144 Q18 144 20 119 Z"/>' +
          '<ellipse class="rim" cx="0" cy="119" rx="20" ry="4.6"/>' +
          '<ellipse class="cup-knop" cx="0" cy="147" rx="8" ry="4.5"/>' +
          '<rect class="lamp-hit" data-church="' + c.id + '" x="-50" y="12" width="100" height="146"/>' +
        '</g>';
    });

    menorahWrap.innerHTML =
      '<svg class="menorah layout-' + LAMP_LAYOUT + '" viewBox="0 0 700 462" role="img" aria-label="성소의 상 위에 놓인 일곱 금등대">' +
      defs + scene + '<g class="body">' + branches + base + '</g>' + lamps + '</svg>';
  }

  /* ---------- 8. 교회 이름표 ---------- */
  var refs = {};  // 교회 id → 화면 요소 묶음
  function buildChurches() {
    churchesEl.textContent = "";
    // 열어 본 힌트를 모아 두는 자리 (칸이 좁아 칸 안에는 넣지 않는다)
    var hintBoard = $("#hint-board");
    hintBoard.textContent = "";
    ORDERED.forEach(function (c) {
      var li = make("li", "church");
      li.dataset.church = c.id;

      var tag = make("button", "church-tag");
      tag.type = "button";
      tag.appendChild(make("span", "num", String(c.lampIndex + 1)));
      var label = make("span", "tag-text");
      label.appendChild(make("span", "name", c.name));
      // "계 2:7" → 좁은 칸에서는 "2:7" 만 보이도록 책 이름을 따로 감싼다
      var badge = make("span", "ref-badge");
      var sp = c.ref.indexOf(" ");
      if (sp > 0) {
        badge.appendChild(make("span", "ref-book", c.ref.slice(0, sp + 1)));
        badge.appendChild(document.createTextNode(c.ref.slice(sp + 1)));
      } else {
        badge.textContent = c.ref;
      }
      badge.hidden = true;
      label.appendChild(badge);
      tag.appendChild(label);

      var slot = make("div", "slot");

      var actions = make("div", "church-actions");
      var hintBtn = make("button", "mini-btn", "힌트");
      hintBtn.type = "button";
      hintBtn.dataset.action = "hint";
      hintBtn.setAttribute("aria-label", c.name + " 힌트 보기");
      actions.appendChild(hintBtn);

      var hint = make("p", "hint-card");
      hint.appendChild(make("span", "hint-who", (c.lampIndex + 1) + ". " + c.name));
      var hintMain = make("span", "hint-main");
      hintMain.appendChild(make("span", "hint-count", "약속 " + c.promises.length + "개"));
      hintMain.appendChild(document.createTextNode(c.clue || c.hint));
      hint.appendChild(hintMain);
      if (c.clue && c.hint) hint.appendChild(make("span", "hint-sub", "이 교회에 하신 말씀 · " + c.hint));
      var msg = make("p", "church-note msg");

      li.appendChild(tag);
      li.appendChild(slot);
      li.appendChild(msg);
      li.appendChild(actions);
      hintBoard.appendChild(hint);
      churchesEl.appendChild(li);

      refs[c.id] = {
        li: li, tag: tag, badge: badge, slot: slot, actions: actions, hintBtn: hintBtn, hint: hint, msg: msg,
        slotSig: null,
        lamp: $('[data-lamp="' + c.id + '"]', menorahWrap),
        branch: $('[data-branch="' + c.id + '"]', menorahWrap)
      };
    });
  }

  function chipFor(card, locked) {
    var node = make(locked ? "div" : "button", "chip " + (locked ? "is-locked" : "is-pending"));
    node.dataset.card = card.id;
    var texts = card.pieces.map(function (p) { return pieceText.get(p); });
    if (!locked) {
      node.type = "button";
      node.setAttribute("aria-label", texts.join(", ") + " — 카드 영역으로 되돌리기");
    }
    texts.forEach(function (t) { node.appendChild(make("span", "piece", t)); });
    return node;
  }

  function isLit(id) { return state.lit.indexOf(id) !== -1; }

  function renderChurch(c) {
    var r = refs[c.id];
    var lit = isLit(c.id);
    var placed = state.placed[c.id] || [];
    var wrongHere = state.wrongBy[c.id] || 0;
    var hintOpen = !!state.hintOpen[c.id] && !lit;

    r.li.classList.toggle("is-lit", lit);
    r.badge.hidden = !lit;
    r.lamp.classList.toggle("is-lit", lit);
    if (r.branch) r.branch.classList.toggle("is-lit", lit);

    r.tag.setAttribute("aria-label",
      (c.lampIndex + 1) + "번 등잔, " + c.name + ". " +
      (lit ? "불이 켜졌습니다. " + c.ref : "불이 꺼져 있습니다" + (placed.length ? ". 조각 " + placed.length + "개가 놓여 있습니다" : "")));

    var sig = (lit ? "L:" : "P:") + placed.join(",");
    if (sig !== r.slotSig) {
      r.slotSig = sig;
      r.slot.textContent = "";
      placed.forEach(function (cardId) {
        var card = cardMap.get(cardId);
        if (card) r.slot.appendChild(chipFor(card, lit));
      });
    }

    var showHintBtn = !lit && wrongHere >= HINT_AFTER && !hintOpen;
    r.hintBtn.hidden = !showHintBtn;
    r.actions.hidden = !showHintBtn;
    r.hint.hidden = !hintOpen;
    var message = lit ? "" : (feedback[c.id] || "");
    r.msg.textContent = "";
    if (message) {
      // 좁은 칸에서는 짧게, 넓은 화면과 화면 낭독기에는 온전한 문장으로
      var n = parseInt(message, 10);
      r.msg.appendChild(make("span", "msg-full", message));
      var shortMsg = make("span", "msg-short", n > 0 ? n + "개 틀림" : "모자람");
      shortMsg.setAttribute("aria-hidden", "true");
      r.msg.appendChild(shortMsg);
      r.msg.setAttribute("aria-label", message);
    }
    r.msg.hidden = !message;
  }

  /* ---------- 9. 카드 영역 ---------- */
  var traySig = null;
  function trayCards() {
    var used = new Set();
    ORDERED.forEach(function (c) { (state.placed[c.id] || []).forEach(function (id) { used.add(id); }); });
    return state.order.filter(function (id) { return !used.has(id); });
  }

  function renderTray() {
    var ids = trayCards();
    var sig = state.mode + "|" + ids.join(",");
    if (sig !== traySig) {
      traySig = sig;
      var focusedCard = document.activeElement && document.activeElement.closest ? document.activeElement.closest(".card") : null;
      var focusId = focusedCard ? focusedCard.dataset.card : null;
      trayEl.textContent = "";
      ids.forEach(function (id) {
        var card = cardMap.get(id);
        var btn = make("button", "card");
        btn.type = "button";
        btn.dataset.card = id;
        card.pieces.forEach(function (p) { btn.appendChild(make("span", "piece", pieceText.get(p))); });
        trayEl.appendChild(btn);
      });
      if (!ids.length && !state.done) {
        var box = make("div", "tray-empty");
        box.appendChild(make("p", null, "조각을 모두 놓았습니다."));
        var all = make("button", "btn primary check-all", "맞는지 확인");
        all.type = "button";
        all.dataset.action = "check-all";
        box.appendChild(all);
        trayEl.appendChild(box);
      }
      if (focusId) {
        var again = $('.card[data-card="' + focusId + '"]', trayEl);
        if (again) again.focus({ preventScroll: true });
      }
    }
    Array.prototype.forEach.call(trayEl.querySelectorAll(".card"), function (btn) {
      btn.setAttribute("aria-pressed", btn.dataset.card === selected ? "true" : "false");
    });
    document.body.classList.toggle("has-selection", !!selected);
    updateTrayArrows();
  }

  /** 카드 영역을 옆으로 더 넘길 수 있으면 그쪽에 화살표를 보여 준다 */
  var trayPrev = $("#tray-prev"), trayNext = $("#tray-next"), trayRail = $("#tray-rail");
  function updateTrayArrows() {
    var max = trayEl.scrollWidth - trayEl.clientWidth;
    var canPrev = max > 4 && trayEl.scrollLeft > 4;
    var canNext = max > 4 && trayEl.scrollLeft < max - 4;
    trayPrev.hidden = !canPrev;
    trayNext.hidden = !canNext;
    trayRail.classList.toggle("can-prev", canPrev);
    trayRail.classList.toggle("can-next", canNext);
  }
  function nudgeTray(dir) {
    trayEl.scrollBy({ left: dir * Math.max(150, trayEl.clientWidth * 0.7), behavior: reduceMotion.matches ? "auto" : "smooth" });
  }
  trayPrev.addEventListener("click", function () { nudgeTray(-1); });
  trayNext.addEventListener("click", function () { nudgeTray(1); });
  trayEl.addEventListener("scroll", updateTrayArrows, { passive: true });
  window.addEventListener("resize", updateTrayArrows);

  /* ---------- 10. 전체 그리기 ---------- */
  function currentView() {
    if (tableOpen) return "table";
    if (state.view !== "game") return "start";
    return state.done && doneRevealed ? "done" : "game";
  }

  function render() {
    var view = currentView();
    var litCount = state.lit.length;
    app.dataset.view = view;
    document.documentElement.style.setProperty("--lit", (litCount / TOTAL).toFixed(3));

    var svg = $(".menorah", menorahWrap);
    svg.setAttribute("aria-label", "성소의 상 위에 놓인 일곱 금등대. 등잔 7개 중 " + litCount + "개가 켜져 있습니다");
    svg.classList.toggle("all-lit", litCount === TOTAL);

    timerEl.textContent = clockText(elapsedNow());

    ORDERED.forEach(renderChurch);
    renderTray();

    var help = $("#tray-help");
    help.textContent = trayNote || "12장을 모두 놓고 ‘맞는지 확인’을 누르세요. 놓은 조각은 누르면 되돌아오고, 꾹 눌러 끌면 다른 교회로 옮겨집니다.";
    help.classList.toggle("is-result", !!trayNote);

    // 시작 화면
    var canResume = state.mode && !state.done && (state.lit.length > 0 || state.elapsed > 0 || state.wrong > 0);
    $("#btn-resume").hidden = !canResume;
    $("#btn-start").classList.toggle("primary", !canResume);
    $("#btn-start").firstChild.nodeValue = canResume ? "처음부터 다시 " : "시작하기 ";

    // 완성 화면
    // 끝의 "(계 1:20)" 은 줄이 갈라지지 않게 한 덩어리로 둔다
    var doneTitle = $("#done-title");
    var cut = CLOSING_VERSE.lastIndexOf(" (");
    doneTitle.textContent = "";
    if (cut > 0) {
      doneTitle.appendChild(document.createTextNode(CLOSING_VERSE.slice(0, cut) + " "));
      doneTitle.appendChild(make("span", "verse-ref", CLOSING_VERSE.slice(cut + 1)));
    } else {
      doneTitle.textContent = CLOSING_VERSE;
    }
    $("#stat-time").textContent = durationText(state.elapsed);
    $("#stat-wrong").textContent = state.wrong + "번";

    var soundBtn = $("#btn-sound");
    soundBtn.setAttribute("aria-pressed", soundOn ? "true" : "false");
    $("#sound-state").textContent = soundOn ? "켬" : "끔";
  }

  /* ---------- 11. 학습용 표 ---------- */
  function buildTable() {
    var CIRC = ["①", "②", "③", "④", "⑤"];
    var hasVerse = ORDERED.some(function (c) { return c.verseText && c.verseText.trim(); });
    var table = make("table", "promise-table");
    table.appendChild(make("caption", "sr-only", "일곱 교회별 장·절, 약속 조각, 참고 문구"));

    var thead = make("thead");
    var hr = make("tr");
    ["교회", "장·절", "약속 조각", "참고 문구"].forEach(function (h) {
      var th = make("th", null, h);
      th.scope = "col";
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    var tbody = make("tbody");
    ORDERED.forEach(function (c) {
      var tr = make("tr");
      var th = make("th", null, (c.lampIndex + 1) + ". " + c.name);
      th.scope = "row";
      tr.appendChild(th);
      tr.appendChild(make("td", "ref", c.ref));

      var td = make("td");
      var ol = make("ol");
      c.promises.forEach(function (p, i) {
        var li = make("li");
        li.appendChild(make("span", "circ", CIRC[i] || (i + 1) + "."));
        li.appendChild(document.createTextNode(p.text));
        ol.appendChild(li);
      });
      td.appendChild(ol);
      if (hasVerse && c.verseText && c.verseText.trim()) td.appendChild(make("p", "verse", c.verseText.trim()));
      tr.appendChild(td);

      tr.appendChild(make("td", "note", c.note || "—"));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    var holder = $("#table-holder");
    holder.textContent = "";
    holder.appendChild(table);
  }

  /* ---------- 12. 게임 진행 ---------- */
  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function startGame() {
    var mode = "advanced";
    clearTimeout(doneTimer);
    syncClock();
    tickFrom = null;
    state = freshState();
    state.mode = mode;
    state.view = "game";
    cardMap = cardMapFor(mode);
    var ids = Array.from(cardMap.keys());
    var order = shuffle(ids);
    for (var n = 0; n < 5 && order.join() === ids.join(); n++) order = shuffle(ids);  // 정답 순서 그대로는 피한다
    state.order = order;
    selected = null;
    feedback = {};
    trayNote = "";
    tableOpen = false;
    doneRevealed = false;
    traySig = null;
    ORDERED.forEach(function (c) { refs[c.id].slotSig = null; });
    save();
    render();
    window.scrollTo(0, 0);
    announce("약속 조각 12장을 일곱 교회에 나누어 놓으세요. 모두 놓은 뒤 맞는지 확인합니다.");
    var first = $(".card", trayEl);
    if (first) first.focus({ preventScroll: true });
  }

  function selectCard(id) {
    selected = selected === id ? null : id;
    renderTray();
    if (selected) {
      var card = cardMap.get(id);
      announce("고름: " + card.pieces.map(function (p) { return pieceText.get(p); }).join(", ") + ". 교회를 고르세요. 숫자 키 1부터 7로도 고를 수 있습니다.");
    } else {
      announce("고르기를 취소했습니다.");
    }
  }

  function flash(node, cls, ms) {
    if (!node) return;
    node.classList.remove(cls);
    void node.offsetWidth;   // 애니메이션 다시 시작
    node.classList.add(cls);
    setTimeout(function () { node.classList.remove(cls); }, ms || 600);
  }

  /** 불을 켠다. judge 가 ok 일 때만 불린다. */
  function light(churchId, message) {
    var c = churchById.get(churchId);
    if (isLit(churchId)) return;
    state.lit.push(churchId);
    delete feedback[churchId];
    selected = null;
    var all = state.lit.length === TOTAL;
    if (all) state.done = true;
    save();
    render();
    play(all ? "done" : "lit");

    if (all) {
      announce(c.name + " 등잔에 불이 켜졌습니다. 일곱 등잔이 모두 켜졌습니다. " + CLOSING_VERSE);
      doneTimer = setTimeout(function () {
        doneRevealed = true;
        render();
        var title = $("#done-title");
        title.focus({ preventScroll: true });
        title.scrollIntoView({ block: "center", behavior: reduceMotion.matches ? "auto" : "smooth" });
      }, reduceMotion.matches ? 0 : 1600);
    } else {
      announce(message || ("정답입니다. " + c.name + " 등잔에 불이 켜졌습니다. " + c.ref + ". 7개 중 " + state.lit.length + "개."));
    }
  }

  function countWrong(churchId) {
    state.wrong += 1;
    state.wrongBy[churchId] = (state.wrongBy[churchId] || 0) + 1;
    return state.wrongBy[churchId] === HINT_AFTER && !state.hintOpen[churchId];
  }

  /** 카드를 교회에 가져간다 (탭·드래그·키보드 공통) */
  function dropCard(cardId, churchId) {
    var card = cardMap.get(cardId);
    var c = churchById.get(churchId);
    if (!card || !c || state.done) return;
    if (isLit(churchId)) {
      announce(c.name + " 등잔은 이미 켜져 있습니다. 다른 교회를 고르세요.");
      return;
    }

    // 놓기만 한다. 판정은 모두 놓은 뒤 ‘맞는지 확인’에서 한다.
    var texts = card.pieces.map(function (p) { return pieceText.get(p); }).join(", ");
    var hadFocus = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.card === cardId;
    state.placed[churchId].push(cardId);
    delete feedback[churchId];
    trayNote = "";
    selected = null;
    save();
    render();
    play("place");
    var allPlaced = trayCards().length === 0;
    announce(c.name + "에 놓음: " + texts + "." +
      (allPlaced ? " 모두 놓았습니다. 맞는지 확인 버튼을 누르세요." : ""));
    if (hadFocus) focusAfterCardLeft(churchId);
  }

  /** 12장을 모두 놓은 뒤 한꺼번에 판정한다 */
  function checkAll() {
    if (state.done || trayCards().length) return;
    var right = [], missed = [], hintNow = false;
    feedback = {};
    ORDERED.forEach(function (c) {
      if (isLit(c.id)) return;
      var result = judge(c.id, piecesOf(state.placed[c.id], cardMap));
      if (result.ok) { right.push(c.id); return; }
      missed.push(c.id);
      // 몇 개가 맞지 않는지만 알려 주고, 어느 조각인지는 알려 주지 않는다
      feedback[c.id] = result.stray > 0 ? result.stray + "개가 맞지 않습니다." : "조각이 모자랍니다.";
    });
    missed.forEach(function (id) { if (countWrong(id)) hintNow = true; });
    selected = null;
    trayNote = !missed.length ? ""
      : "일곱 교회 중 " + (state.lit.length + right.length) + "곳이 맞았습니다. 맞지 않은 교회의 조각을 눌러 되돌린 뒤 다시 놓아 보세요.";
    var spoken = trayNote + (hintNow ? " 힌트 버튼이 생겼습니다." : "");

    if (right.length) {
      // 판정을 통과한 교회만 불을 켠다
      right.slice(0, -1).forEach(function (id) { state.lit.push(id); });
      light(right[right.length - 1], spoken);
    } else {
      save();
      render();
      play("wrong");
      announce(spoken);
    }
    missed.forEach(function (id) { flash(refs[id].li, "nope"); });
  }

  function focusAfterCardLeft(churchId) {
    var next = $(".card, [data-action='check-all']", trayEl);
    (next || refs[churchId].tag).focus({ preventScroll: true });
  }

  /** 판정이 끝나지 않은 조각을 카드 영역으로 되돌린다 */
  function returnCard(cardId, churchId) {
    if (isLit(churchId)) return;
    var list = state.placed[churchId];
    var at = list.indexOf(cardId);
    if (at === -1) return;
    list.splice(at, 1);
    feedback = {};
    trayNote = "";
    save();
    render();
    refs[churchId].tag.focus({ preventScroll: true });
    announce("카드 영역으로 되돌림: " + cardMap.get(cardId).pieces.map(function (p) { return pieceText.get(p); }).join(", "));
  }

  /** 판정이 끝나지 않은 조각을 다른 교회로 옮긴다 */
  function moveCard(cardId, fromId, toId) {
    var to = churchById.get(toId);
    if (!to || fromId === toId || state.done || isLit(fromId)) return;
    if (isLit(toId)) {
      announce(to.name + " 등잔은 이미 켜져 있습니다. 다른 교회를 고르세요.");
      return;
    }
    var list = state.placed[fromId];
    var at = list.indexOf(cardId);
    if (at === -1) return;
    list.splice(at, 1);
    state.placed[toId].push(cardId);
    feedback = {};
    trayNote = "";
    save();
    render();
    play("place");
    announce(to.name + "(으)로 옮김: " + cardMap.get(cardId).pieces.map(function (p) { return pieceText.get(p); }).join(", "));
  }

  function openHint(churchId) {
    var c = churchById.get(churchId);
    state.hintOpen[churchId] = true;
    save();
    render();
    refs[churchId].tag.focus({ preventScroll: true });
    announce(c.name + " 힌트. 약속 " + c.promises.length + "개. " + (c.clue || c.hint));
  }

  function targetChurch(churchId, viaTag) {
    if (state.done) return;
    if (!selected) {
      if (viaTag && !isLit(churchId)) {
        flash(trayWrap, "nudge", 1000);
        announce("먼저 아래에서 약속 조각을 고르세요.");
      }
      return;
    }
    dropCard(selected, churchId);
  }

  function goHome() {
    clearTimeout(doneTimer);
    if (state.done) doneRevealed = true;
    selected = null;
    tableOpen = false;
    state.view = "start";
    save();
    render();
    window.scrollTo(0, 0);
    $("#btn-resume").hidden ? $("#btn-start").focus() : $("#btn-resume").focus();
  }

  function openTable() {
    tableOpen = true;
    syncClock();
    render();
    window.scrollTo(0, 0);
    $("#table-title").focus({ preventScroll: true });
  }
  function closeTable() {
    tableOpen = false;
    syncClock();
    render();
    window.scrollTo(0, 0);
  }

  /* ---------- 13. 입력: 탭/클릭 ---------- */
  // 드래그를 끝낸 직후에 따라오는 click 은 버린다
  document.addEventListener("click", function (e) {
    if (suppressClick) {
      suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  trayEl.addEventListener("click", function (e) {
    if (e.target.closest("[data-action='check-all']")) { checkAll(); return; }
    var card = e.target.closest(".card");
    if (card) selectCard(card.dataset.card);
  });

  churchesEl.addEventListener("click", function (e) {
    var li = e.target.closest(".church");
    if (!li) return;
    var id = li.dataset.church;
    var chip = e.target.closest(".chip.is-pending");
    if (chip) { returnCard(chip.dataset.card, id); return; }
    var act = e.target.closest("[data-action]");
    if (act) {
      openHint(id);
      return;
    }
    targetChurch(id, !!e.target.closest(".church-tag"));
  });

  menorahWrap.addEventListener("click", function (e) {
    var hit = e.target.closest(".lamp-hit");
    if (hit && state.view === "game") targetChurch(hit.dataset.church, true);
  });

  // 이름표에 손이나 초점이 가면 그 등잔을 짚어 준다
  function pointLamp(e, on) {
    var li = e.target.closest ? e.target.closest(".church") : null;
    if (li && refs[li.dataset.church]) refs[li.dataset.church].lamp.classList.toggle("is-pointed", on);
  }
  churchesEl.addEventListener("pointerover", function (e) { pointLamp(e, true); });
  churchesEl.addEventListener("pointerout", function (e) { pointLamp(e, false); });
  churchesEl.addEventListener("focusin", function (e) { pointLamp(e, true); });
  churchesEl.addEventListener("focusout", function (e) { pointLamp(e, false); });

  /* ---------- 14. 입력: 드래그 (Pointer Events) ----------
     · 카드 영역의 조각 → 교회
     · 교회에 놓은 조각 → 다른 교회 또는 카드 영역
       (손가락으로는 꾹 눌렀다가 끌고, 마우스로는 그냥 끈다)            */
  var HOLD_MS = 320;              // 꾹 누르기로 인정하는 시간
  var TRAY = "__tray__";
  var drag = null;

  function setDropOver(where) {
    if (drag.over === where) return;
    if (drag.over === TRAY) trayWrap.classList.remove("drop-over");
    else if (drag.over && refs[drag.over]) {
      refs[drag.over].li.classList.remove("drop-over");
      refs[drag.over].lamp.classList.remove("drop-over");
    }
    drag.over = where;
    if (where === TRAY) trayWrap.classList.add("drop-over");
    else if (where && refs[where]) {
      refs[where].li.classList.add("drop-over");
      refs[where].lamp.classList.add("drop-over");
    }
  }

  function endDrag() {
    if (!drag) return;
    clearTimeout(drag.holdTimer);
    setDropOver(null);
    if (drag.ghost) drag.ghost.remove();
    drag.el.classList.remove("is-source");
    document.body.classList.remove("is-dragging");
    drag = null;
  }

  function beginDrag(e, el, fromChurch) {
    if ((e.pointerType === "mouse" && e.button !== 0) || state.done) return;
    endDrag();
    drag = {
      id: el.dataset.card, el: el, from: fromChurch, pointerId: e.pointerId,
      x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
      active: false, ghost: null, over: null, dx: 0, dy: 0,
      // 교회 칸은 화면을 밀어 올리는 자리이기도 해서, 손가락은 꾹 눌러야 집힌다
      needHold: !!fromChurch && e.pointerType !== "mouse",
      holdTimer: null
    };
    if (drag.needHold) {
      drag.holdTimer = setTimeout(function () {
        if (!drag || drag.active) return;
        activateDrag();
        try { if (navigator.vibrate) navigator.vibrate(12); } catch (err) { /* 진동 없음 */ }
      }, HOLD_MS);
    }
  }

  /** 조각을 집어 든다: 따라다니는 사본을 만든다 */
  function activateDrag() {
    var rect = drag.el.getBoundingClientRect();
    drag.active = true;
    drag.dx = drag.x0 - rect.left;
    drag.dy = drag.y0 - rect.top;
    drag.ghost = drag.el.cloneNode(true);
    drag.ghost.classList.add("ghost");
    drag.ghost.removeAttribute("aria-pressed");
    drag.ghost.setAttribute("aria-hidden", "true");
    drag.ghost.tabIndex = -1;
    drag.ghost.style.width = rect.width + "px";
    drag.ghost.style.minHeight = rect.height + "px";
    document.body.appendChild(drag.ghost);
    drag.el.classList.add("is-source");
    document.body.classList.add("is-dragging");
    if (selected) { selected = null; renderTray(); }
    moveGhost();
  }

  function moveGhost() {
    drag.ghost.style.transform = "translate(" + (drag.x - drag.dx) + "px," + (drag.y - drag.dy) + "px) rotate(-2deg)";
  }

  trayEl.addEventListener("pointerdown", function (e) {
    var card = e.target.closest(".card");
    if (card) beginDrag(e, card, null);
  });
  churchesEl.addEventListener("pointerdown", function (e) {
    var chip = e.target.closest(".chip.is-pending");
    if (chip) beginDrag(e, chip, chip.closest(".church").dataset.church);
  });
  // 꾹 눌렀을 때 뜨는 브라우저 메뉴는 막는다
  churchesEl.addEventListener("contextmenu", function (e) {
    if (e.target.closest(".chip.is-pending")) e.preventDefault();
  });
  // 집어 든 뒤에는 손가락을 움직여도 화면이 밀리지 않게 한다
  document.addEventListener("touchmove", function (e) {
    if (drag && drag.active && e.cancelable) e.preventDefault();
  }, { passive: false });

  window.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.active) {
      var moved = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) >= DRAG_THRESHOLD;
      if (!moved) return;
      if (drag.needHold) { endDrag(); return; }   // 꾹 누르기 전에 움직였으면 화면 넘기기다
      activateDrag();
    }
    e.preventDefault();
    moveGhost();
    var under = document.elementFromPoint(e.clientX, e.clientY);
    var target = under && under.closest ? under.closest("[data-church]") : null;
    var where = target ? target.dataset.church : null;
    if (!where && drag.from && under && under.closest && under.closest("#tray-wrap")) where = TRAY;
    if (where && where === drag.from) where = null;
    setDropOver(where);
    // 화면 위쪽 가장자리에 닿으면 조금씩 위로 올려 준다
    if (e.clientY < 48 && window.scrollY > 0) window.scrollBy(0, -10);
  }, { passive: false });

  window.addEventListener("pointerup", function (e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    var wasActive = drag.active;
    var cardId = drag.id;
    var from = drag.from;
    var over = drag.over;
    endDrag();
    if (!wasActive) return;       // 집어 들지 않았으면 탭으로 처리된다 (click)
    suppressClick = true;
    setTimeout(function () { suppressClick = false; }, 80);
    if (!over) return;
    if (!from) dropCard(cardId, over);
    else if (over === TRAY) returnCard(cardId, from);
    else moveCard(cardId, from, over);
  });

  window.addEventListener("pointercancel", function (e) {
    if (drag && e.pointerId === drag.pointerId) endDrag();
  });

  /* ---------- 15. 입력: 키보드 ---------- */
  document.addEventListener("keydown", function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (currentView() !== "game") return;

    if (e.key === "Escape" && selected) {
      selected = null;
      renderTray();
      announce("고르기를 취소했습니다.");
      return;
    }
    // 숫자 1~7: 고른 카드를 그 번호의 교회로
    if (selected && /^[1-7]$/.test(e.key)) {
      e.preventDefault();
      dropCard(selected, ORDERED[Number(e.key) - 1].id);
      return;
    }
    // 화살표: 카드끼리, 이름표끼리 이동
    var active = document.activeElement;
    if (!active || !active.classList) return;
    var step = (e.key === "ArrowRight" || e.key === "ArrowDown") ? 1 : (e.key === "ArrowLeft" || e.key === "ArrowUp") ? -1 : 0;
    if (!step) return;
    var group = active.classList.contains("card") ? trayEl.querySelectorAll(".card")
      : active.classList.contains("church-tag") ? churchesEl.querySelectorAll(".church-tag") : null;
    if (!group || !group.length) return;
    var list = Array.prototype.slice.call(group);
    var next = list[(list.indexOf(active) + step + list.length) % list.length];
    if (next) {
      e.preventDefault();
      next.focus();
      if (next.scrollIntoView) next.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  });

  /* ---------- 16. 버튼 ---------- */
  $("#btn-start").addEventListener("click", function () { startGame(); });
  $("#btn-resume").addEventListener("click", function () {
    state.view = "game";
    save();
    render();
    window.scrollTo(0, 0);
    announce("이어서 합니다. 등잔 7개 중 " + state.lit.length + "개가 켜져 있습니다.");
  });
  $("#btn-home").addEventListener("click", goHome);
  $("#btn-again").addEventListener("click", function () { startGame(); });
  $("#btn-table-start").addEventListener("click", openTable);
  $("#btn-table-done").addEventListener("click", openTable);
  $("#btn-table-back").addEventListener("click", closeTable);
  $("#btn-print").addEventListener("click", function () { window.print(); });
  $("#btn-sound").addEventListener("click", function () {
    soundOn = !soundOn;
    store.save(SOUND_KEY, soundOn);
    render();
    if (soundOn) play("lit");
    announce(soundOn ? "효과음을 켰습니다." : "효과음을 껐습니다.");
  });

  /* ---------- 17. 시계 갱신과 저장 ---------- */
  var ticks = 0;
  setInterval(function () {
    if (tickFrom == null) return;
    timerEl.textContent = clockText(elapsedNow());
    if (++ticks % 5 === 0) save();
  }, 1000);
  document.addEventListener("visibilitychange", save);
  window.addEventListener("pagehide", save);

  /* ---------- 18. 시작 ---------- */
  buildMenorah();
  buildChurches();
  buildTable();
  syncClock();
  render();
  // 글꼴이 늦게 실리면 카드 너비가 달라질 수 있어 한 번 더 잰다
  window.addEventListener("load", updateTrayArrows);
})();
