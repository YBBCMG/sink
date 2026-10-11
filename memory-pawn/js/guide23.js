/* 记忆当铺 - guide23.js：「第一夜清单」新手引导（A 线 · 2026-10-11）

   为什么有这个东西：
     开场一段序章之后，玩家被丢在礁盘上，任务页只写着"点灯" —— 怎么走、怎么互动、
     面板在哪、雾里那只是什么、被咬掉的一口记怎么补，全靠自己撞。剧情本身没问题，
     问题是**剧情和"我现在该按哪个键"之间没有桥**。

   这张单子就是那座桥：
     · 上一行是母亲留在抄本第一页的字（剧情），下一行是白话说怎么动手（操作）；
     · 每一条都要玩家**真做出来**才算过 —— 判据只读游戏状态（走没走 / 交互过没有 /
       灯亮没亮 / 罐子少没少 / 记缺没缺），不认点击，也不认"点了下一步"；
     · 关键步做完才吐一小段剧情插播，不堆在开场；
     · 老玩家（第 3 幕往后）不打扰；走完了折成一张小签，随时能翻回来看。

   零侵入：不碰 game23.js / story23.js / puzzles23.js 一行，只读 GAME23 / PAWN_DEBUG / DOM。
   就算这文件没被 index.html 引上，游戏照常跑（不 throw、不挡路）。 */
(function (global) {
  'use strict';

  var KEY = 'mp23-guide-v1';
  var POLL = 250;
  var BEAT_TITLE = '第一夜';

  /* 步子：id / tag（清单里的短名）/ mom（母亲的话＝剧情）/ how（白话操作）/ 判据。
     jump: 反应型条目（刚被咬），一出现就插到当前条目前面 —— 出事了得当场说。
     hold: 说明型条目（存档点），摆够这么多毫秒就算过，不逼玩家做动作。 */
  var STEPS = [
    { id: 'walk', tag: '在礁上走两步',
      mom: '第一夜的礁是湿的。左脚踩实了，右脚再迈——灯楼就在前头。',
      how: '走动：<b>WASD</b> / 方向键；手机按左下方向盘',
      done: function (s, st) {
        var a = st.start || { x: s.mx, y: s.my };
        var dx = s.mx - a.x, dy = s.my - a.y;
        return dx * dx + dy * dy >= 6.25;          /* 走出 2.5 格就算会走了 */
      },
      beat: ['你踩在湿礁上，鞋底发出很轻的一声。', '灯楼的门虚掩着，缝里漏出一点光——像有人在里面等你。'] },

    { id: 'look', tag: '看见什么，问它一句',
      mom: '礁上每样东西我都写下来了。你看见什么，就站到它跟前，问它一句。',
      how: '互动：走到东西旁边，按 <b>E</b>（手机点右下那个 E）',
      done: function (s) { return Object.keys(s.seen || {}).length >= 1; } },

    { id: 'panel', tag: '让本子替你记',
      mom: '我记性不好，才什么都写下来。你也不用全记住——右边那本"任务"，一次只说一件事。',
      how: '点右边的 <b>任务</b> 页签（也可以用 Tab 键翻）',
      done: function () { return !!hits.tasks; } },

    { id: 'lamp', tag: '点亮望归灯',
      mom: '芯短了光就抖。光一抖，雾里的人会认错方向——他们会朝着别处走一整夜。',
      how: '去灯楼，把 <b>望归灯</b> 点上（跟着"任务"里那一条走）',
      done: function (s) { return !!s.flags.lamp_lit; },
      beat: ['灯亮起来的那一下，海面上浮出一小块白。', '你把手指从灯芯上收回来。烫的。', '——「亮着的灯，是给还没回来的人留的。」'] },

    { id: 'patrol', tag: '巡礁三件事',
      mom: '灯油、灯罩、礁上那盏小灯。三样过一遍，今晚才稳。少一样，光就短一截。',
      how: '巡礁：灯油桶 → 灯罩 → 小灯（"任务"里会带你去）',
      done: function (s) { return !!s.flags.patrol_done; } },

    { id: 'save', tag: '走歪了就回来',
      mom: '你不必什么都记得。每一幕开头，我都替你记了一笔。',
      how: '右上 <b>↺ 存档点</b>：回到本幕开头，不罚你、也不掉东西',
      done: function () { return !!hits.restart; },
      hold: 9000 },

    { id: 'town', tag: '下镇',
      when: function (s) { return s.act >= 2; },
      mom: '镇上的灯比礁上多，人也多。记住：当铺不问来路。',
      how: '沿石阶下镇——礁上的事你没落下，门自己会开',
      hold: 6000,
      beat: ['石阶一共四十七级。你数到第三十级的时候，听见下面有人在说话。', '——「当记不问来路，赎记不问去处。」'] },

    { id: 'fog', tag: '雾里那只是什么',
      when: function (s) { return s.act >= 2 && mobCount() > 0; },
      mom: '雾里的东西，是人装不住的那部分漏出来的。它不咬你的肉——它咬你的记。',
      how: '别当着它的面开着面板发呆：<b>面板挡不住它</b>。界面那行红字是它离你几格',
      hold: 11000 },

    { id: 'oil', tag: '泼一罐灯油',
      /* 借改（2026-10-12）：怪只在最后一个场景（雾里）—— 这课等真遇见它再上，别在镇上空讲 */
      when: function (s) { return s.act >= 2 && mobCount() > 0; },
      base: function (s) { return s.oil == null ? 2 : s.oil; },
      mom: '它怕灯油。灯油是我们这行唯一的武器，省着用，但别留着。',
      how: '按 <b>F</b> 泼一罐灯油：定住它 15 秒（顶栏"灯油"是罐数，柜台有卖）',
      done: function (s, st) { return (s.oil == null ? 2 : s.oil) < st.base.oil; },
      beat: ['你泼出去。金黄的一摊在地上摊开，那东西停住了，像被谁按了一下。', '——「雾不是天气。雾是人装不住的东西漏出来了。」'] },

    { id: 'bite', tag: '记被咬掉一口',
      when: function () { return hurtCount() > 0; },
      jump: true,
      mom: '字缺了，别硬想。想不回来的东西，硬想会疼。',
      how: '右边 <b>记</b> 里看得见缺的字；当铺柜台上花当金能补回来',
      done: function () { return !!hits.mem; },
      hold: 11000,
      beat: ['你摸了摸口袋——里面空了一块，像少了一张纸。'] }
  ];

  /* ---------- 状态 ---------- */
  var st = { done: {}, beat: {}, base: {}, shownAt: {}, start: null, finished: false, open: false };
  var hits = { tasks: 0, mem: 0, restart: 0 };
  var queue = [];
  var note = null, flashT = 0;

  function store() { try { return global.localStorage; } catch (e) { return null; } }
  function loadSt() {
    var s = store(); if (!s) return;
    try {
      var raw = s.getItem(KEY); if (!raw) return;
      var o = JSON.parse(raw); if (!o || typeof o !== 'object') return;
      st.done = o.done || {}; st.beat = o.beat || {}; st.base = o.base || {};
      st.shownAt = o.shownAt || {}; st.start = o.start || null; st.finished = !!o.finished;
    } catch (e) { /* 坏档就当没存过，别把游戏卡住 */ }
  }
  function saveSt() {
    var s = store(); if (!s) return;
    try {
      s.setItem(KEY, JSON.stringify({ done: st.done, beat: st.beat, base: st.base, shownAt: st.shownAt,
        start: st.start, finished: st.finished, at: Date.now() }));
    } catch (e) { /* ignore */ }
  }

  function GS() { try { return (global.GAME23 && global.GAME23.S) || null; } catch (e) { return null; } }
  function gapi() { try { return (global.PAWN_DEBUG && global.PAWN_DEBUG.api) || null; } catch (e) { return null; } }
  function mobCount() { try { var m = global.GAME23.MOBS(); return m ? m.list().length : 0; } catch (e) { return 0; } }
  function hurtCount() { try { return global.GAME23.damagedMem().length; } catch (e) { return 0; } }
  function modalUp() {
    var a = gapi();
    try { if (a && a.modalOpen && a.modalOpen()) return true; } catch (e) { /* ignore */ }
    try { if (global.GAME23 && global.GAME23.dlgOpen && global.GAME23.dlgOpen()) return true; } catch (e) { /* ignore */ }
    return false;
  }
  function $(id) { return global.document ? global.document.getElementById(id) : null; }

  /* ---------- 便签（index.html 里有；万一没有就自己造一个，别让引导靠 HTML 活着） ---------- */
  function ensureNote() {
    if (note && note.parentNode) return note;
    note = $('guide-note');
    if (note) return note;
    var d = global.document, wrap = $('world-wrap'); if (!d || !wrap) return null;
    note = d.createElement('div');
    note.id = 'guide-note';
    note.innerHTML =
      '<div id="guide-bar"><b id="guide-tag">第一夜清单</b><span id="guide-count"></span>' +
      '<button id="guide-min" title="收起 / 展开">收起</button></div>' +
      '<p id="guide-mom"></p><p id="guide-how"></p><div id="guide-list"></div>';
    wrap.appendChild(note);
    return note;
  }
  function listHtml(s) {
    var out = '';
    for (var i = 0; i < STEPS.length; i++) {
      var sp = STEPS[i];
      if (!applicable(sp, s)) continue;
      out += '<div class="' + (st.done[sp.id] ? 'g-done' : '') + '">' +
        (st.done[sp.id] ? '✓ ' : '· ') + sp.tag + '</div>';
    }
    return out;
  }
  function render(s) {
    var el = ensureNote(); if (!el) return;
    var cur = pick(s), doneN = 0, appN = 0;
    for (var i = 0; i < STEPS.length; i++) {
      var sp = STEPS[i];
      if (!applicable(sp, s)) continue;
      appN++; if (st.done[sp.id]) doneN++;
    }
    var cls = [];
    if (st.finished) cls.push('done'); else cls.push(modalUp() ? 'off' : 'on');
    if (st.open || st.finished) cls.push('open');
    if (flashT > Date.now()) cls.push('flash');
    el.className = cls.join(' ');
    /* 顶部被引导条占着的时候，场景横幅让一让（手机窄屏会叠字） */
    try {
      var body = global.document && global.document.body;
      if (body && body.classList) {
        if (el.className.indexOf('off') < 0) body.classList.add('mp-guide');
        else body.classList.remove('mp-guide');
      }
    } catch (e) { /* ignore */ }

    var tag = $('guide-tag'), cnt = $('guide-count'), mom = $('guide-mom'), how = $('guide-how'), list = $('guide-list');
    if (st.finished) {
      if (tag) tag.textContent = '第一夜清单 ✓';
      if (cnt) cnt.textContent = '看一遍';
      if (mom) mom.innerHTML = '<span class="g-note">礁上、镇上的事你都过了一遍。剩下的路，灯照着你走。</span>';
      if (how) how.innerHTML = '';
    } else if (cur) {
      if (tag) tag.textContent = '第一夜清单';
      if (cnt) cnt.textContent = doneN + ' / ' + appN;
      if (mom) mom.textContent = cur.mom;
      if (how) how.innerHTML = cur.how;
    }
    if (list) list.innerHTML = listHtml(s);
    var min = $('guide-min'); if (min) min.textContent = (st.open || st.finished) ? '收起' : '展开';
  }

  /* ---------- 判据 ---------- */
  function applicable(sp, s) {
    if (!sp.when) return true;
    try { return !!sp.when(s, st); } catch (e) { return true; }
  }
  function markDone(sp, withBeat) {
    if (st.done[sp.id]) return;
    st.done[sp.id] = 1;
    if (withBeat && sp.beat && !st.beat[sp.id]) { st.beat[sp.id] = 1; queue.push(sp.beat); }   /* 插播排队，等面板空下来再播 */
    flashT = Date.now() + 700;
    saveSt();
  }
  function isDone(sp, s) {
    if (st.done[sp.id]) return true;
    if (sp.hold && st.shownAt[sp.id] && (Date.now() - st.shownAt[sp.id]) >= sp.hold) { markDone(sp, true); return true; }
    var v = false;
    try { v = !!(sp.done && sp.done(s, st)); } catch (e) { v = false; }
    if (v) markDone(sp, true);
    return v;
  }
  function pick(s) {
    var i, sp, plain = null;
    for (i = 0; i < STEPS.length; i++) {
      sp = STEPS[i];
      if (!applicable(sp, s) || st.done[sp.id]) continue;
      if (sp.jump) return sp;              /* 反应型条目优先：刚被咬就得说 */
      if (!plain) plain = sp;
    }
    return plain;
  }

  /* ---------- 主循环 ---------- */
  function tick() {
    var s = GS();
    if (!s || !global.GAME23 || !global.GAME23.booted) return;
    if (!st.start) { st.start = { x: s.mx, y: s.my, act: s.act }; saveSt(); }
    if (!st.finished && (s.act >= 3 || s.maxAct >= 3)) { st.finished = true; saveSt(); }   /* 老玩家/上路了：收摊 */

    var i, sp, lastDone = -1;
    for (i = 0; i < STEPS.length; i++) {
      sp = STEPS[i];
      if (!applicable(sp, s)) continue;
      if (sp.base && st.base[sp.id] == null) { try { st.base[sp.id] = sp.base(s, st); } catch (e) { /**/ } }
      if (isDone(sp, s)) lastDone = i;
    }
    /* 后面的条目做完了 → 前面的控制类条目当然也会了，别再拿"先走两步"烦已经点完灯的人 */
    if (lastDone > 0) {
      for (i = 0; i < lastDone; i++) {
        sp = STEPS[i];
        if (!st.done[sp.id] && applicable(sp, s)) { st.done[sp.id] = 1; }
      }
    }
    var cur = pick(s);
    if (cur && st.shownAt[cur.id] == null) { st.shownAt[cur.id] = Date.now(); saveSt(); }
    render(s);
    flush();
  }
  function flush() {
    if (!queue.length || modalUp()) return;
    var a = gapi(); if (!a || !a.say) return;
    var lines = queue.shift();
    try { a.say(lines, null, { title: BEAT_TITLE, end: '……' }); } catch (e) { /* ignore */ }
  }

  /* ---------- 接线 ---------- */
  function bind() {
    var d = global.document; if (!d || !d.addEventListener) return;
    d.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t.nodeType === 1) {
        var id = t.id || '';
        if (id === 'tab-tasks') hits.tasks = 1;
        else if (id === 'tab-mem') hits.mem = 1;
        else if (id === 'btn-restart') hits.restart = 1;
        else if (id === 'guide-min' || id === 'guide-bar') { st.open = !st.open; saveSt(); tick(); return; }
        else if (id === 'guide-note') return;
        t = t.parentNode;
      }
    }, true);
    /* 面板开/关、被咬这些事没有事件可听 —— 靠轮询读状态（250ms，开销可以忽略） */
    if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', function () { try { tick(); } catch (e) { /**/ } });
    global.setInterval(function () { try { tick(); } catch (e) { /**/ } }, POLL);
  }

  loadSt();
  ensureNote();
  bind();
  tick();

  global.GUIDE23 = {
    version: 'guide23-1',
    STEPS: STEPS,
    tick: tick,
    state: function () {
      var s = GS(), cur = pick(s || {}), doneN = 0, appN = 0, pending = [], ids = [];
      for (var i = 0; i < STEPS.length; i++) {
        var sp = STEPS[i];
        if (!applicable(sp, s || {})) continue;
        appN++; ids.push(sp.id);
        if (st.done[sp.id]) doneN++; else pending.push(sp.id);
      }
      var el = ensureNote();
      return { version: 'guide23-1', on: !st.finished, finished: st.finished,
        id: cur ? cur.id : null, idx: cur ? STEPS.indexOf(cur) : -1,
        total: STEPS.length, applicable: appN, doneApplicable: doneN, done: Object.keys(st.done).length,
        pending: pending, steps: ids, open: st.open,
        visible: !!(el && /(^| )(on|done)( |$)/.test(el.className)), text: el ? el.textContent : '' };
    },
    open: function () { st.open = true; saveSt(); tick(); },
    close: function () { st.open = false; saveSt(); tick(); },
    /* 重看一遍：清进度（DEV / 调试 / 以后想加"再看一次第一夜"按钮都靠它） */
    reset: function () {
      st = { done: {}, beat: {}, base: {}, shownAt: {}, start: null, finished: false, open: true };
      queue = []; saveSt(); tick();
      return this.state();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
