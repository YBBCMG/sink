/* 记忆当铺 - game.js：状态 / 像素渲染 / 移动 / 交互面板 / 失忆 / 结局 / 调试接口 */
(function () {
  'use strict';

  var D = window.MDATA;
  var CFG = D.CFG;

  var S = null;
  var last = 0;
  var rafId = 0;

  var cvEl, ctx, toastEl;
  var modalEl, mTitleEl, mBodyEl, mBtnsEl;
  var endModalEl, endNameEl, endTextEl, endStatsEl, btnAgainEl, btnMainEl;
  var hudGoldEl, hudIntegEl, hudRedeemEl, relicsEl;
  var hudMainEl, hudInterestEl, hudDaysEl, hudTestimonyEl;
  var paneLogEl, paneStoryEl, paneMemEl, paneTicketEl;
  var tabLogEl, tabStoryEl, tabMemEl, tabTicketEl;
  var labelsEl = null, eHintEl = null;
  var lblMap = [];
  var hudGoalEl = null;
  var confirmBoxEl, cfTextEl, btnRestartEl, cfYesEl, cfNoEl, logoEl;
  var pendingConfirm = null;   /* 确认框里「是」要执行的动作（调用方给） */
  var btnBgmEl, dpadEl;
  var devPanelEl, devBodyEl, btnDevEl, devCloseEl;
  /* 开发者模式开关（模块级：重开一局 / 触发结局后仍保留） */
  var DEV = { open: false, clip: false, freeze: false, speed: 1 };

  var toastTimer = null;
  /* v22：暗号 = 钟声三长两短（记忆 code）+ 侧框那句「末了一声要实」→ 六拍 */
  var KNOCK_TARGET = ['L', 'L', 'L', 'S', 'S', 'L'];

  /* ---------- 工具 ---------- */

  function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }

  function fmtTime(sec) {
    var s = Math.max(0, Math.ceil(sec));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function gToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  /* ---------- 存档（结局收集） ---------- */

  var store = (function () {
    var mem = {};
    function probe(obj, kind) {
      try {
        var k = '__mp_probe__';
        obj.setItem(k, '1');
        obj.removeItem(k);
        return {
          kind: kind,
          get: function (key) { try { return obj.getItem(key); } catch (e) { return mem[key] || null; } },
          set: function (key, val) { try { obj.setItem(key, val); } catch (e) { mem[key] = val; } }
        };
      } catch (e) { return null; }
    }
    var st = (typeof localStorage !== 'undefined') ? probe(localStorage, 'local') : null;
    if (!st) st = (typeof sessionStorage !== 'undefined') ? probe(sessionStorage, 'session') : null;
    if (!st) st = { kind: 'memory', get: function (k) { return mem[k] || null; }, set: function (k, v) { mem[k] = v; } };
    return st;
  })();

  var ENDINGS_KEY = 'mp-endings-v1';

  function gLoadEndings() {
    var raw = store.get(ENDINGS_KEY);
    if (!raw) return [];
    try {
      var o = JSON.parse(raw);
      if (Object.prototype.toString.call(o) === '[object Array]') return o;
    } catch (e) { /* 坏档忽略 */ }
    return [];
  }

  function gSaveEndings(arr) {
    try { store.set(ENDINGS_KEY, JSON.stringify(arr)); } catch (e) { /* ignore */ }
  }

  /* ---------- 剧情回顾档案：看过的章节永久记录（跨周目，结局重开后也能翻） ---------- */

  var ARCHIVE_KEY = 'mp-archive-v1';

  function gLoadArch() {
    var raw = store.get(ARCHIVE_KEY);
    if (!raw) return [];
    try {
      var o = JSON.parse(raw);
      if (Object.prototype.toString.call(o) !== '[object Array]') return [];
      /* 迁移：旧六小章 main_ch1..6 → 新三大章 mn_ch1..3 */
      var OLD_CH = { main_ch1: 'mn_ch1', main_ch2: 'mn_ch1', main_ch3: 'mn_ch2', main_ch4: 'mn_ch2', main_ch5: 'mn_ch3', main_ch6: 'mn_ch3' };
      var seen = {}, out = [], changed = false;
      for (var i = 0; i < o.length; i++) {
        var nk = OLD_CH[o[i]] || o[i];
        if (nk !== o[i]) changed = true;
        if (!seen[nk]) { seen[nk] = 1; out.push(nk); }
      }
      if (changed) { try { store.set(ARCHIVE_KEY, JSON.stringify(out)); } catch (e2) { /* ignore */ } }
      return out;
    } catch (e) { /* 坏档忽略 */ }
    return [];
  }

  function gMarkArch(key) {
    var a = gLoadArch();
    if (a.indexOf(key) >= 0) return;
    a.push(key);
    try { store.set(ARCHIVE_KEY, JSON.stringify(a)); } catch (e) { /* ignore */ }
    if (S) S.logDirty = true; /* 提醒侧栏刷新回顾列表 */
  }

  /* ---------- 进度自动存档 ---------- */

  var SAVE_KEY = 'mp-save-v1';
  var CHECK_KEY = 'mp-checkpoint-v1';   /* 章节检查点：独立键，绝不与主存档混写 */

  /* 把当前状态打包成存档对象（主存档与章节检查点共用同一形状） */
  function packState() {
    if (!S || S.phase !== 'play') return null;
    var mem = {};
    for (var i = 0; i < D.MEMORIES.length; i++) {
      var id = D.MEMORIES[i].id, st = S.mem[id];
      mem[id] = { state: st.state, pawnedAt: st.pawnedAt, pawns: st.pawns || 0 };
    }
    return {
      v: 4, t: Math.round(S.t * 100) / 100, gold: S.gold, mem: mem,
      px: S.px, py: S.py, tx: S.tx, ty: S.ty, facing: S.facing,
      items: S.items, relics: S.relics, innerOpen: S.innerOpen, hints: S.hints,
      jobs: S.jobs,
      story: S.story, pages: S.pages, wine: S.wine,
      mode: S.mode, chapter: S.chapter, interest: S.interest,
      testimony: S.testimony, mainFlags: S.mainFlags,
      log: S.log.slice(-80)
    };
  }

  function saveGame() {
    var p = packState();
    if (!p) return;
    try { store.set(SAVE_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
  }

  function loadGame() {
    var raw = store.get(SAVE_KEY);
    if (!raw) return null;
    try { return unpackState(JSON.parse(raw)); } catch (e) { return null; }
  }

  /* 存档对象 → 状态（主存档与检查点共用；v1~v4 兼容，坏档返回 null） */
  function unpackState(o) {
    try {
      if (!o || (o.v < 1 || o.v > 4) || !o.mem) return null;
      var base = freshState();
      base.t = typeof o.t === 'number' ? o.t : 0;
      base.gold = o.gold || 0;
      for (var id in base.mem) {
        if (o.mem[id]) {
          var st = o.mem[id];
          base.mem[id].state = st.state === 'pawned' || st.state === 'lost' ? st.state : 'held';
          base.mem[id].pawnedAt = st.pawnedAt || 0;
          base.mem[id].pawns = st.pawns || 0;
        }
      }
      if (typeof o.px === 'number') { base.px = o.px; base.tx = o.px; }
      if (typeof o.py === 'number') { base.py = o.py; base.ty = o.py; }
      if (o.facing === 0 || o.facing === 1 || o.facing === 2 || o.facing === 3) base.facing = o.facing;
      var k;
      for (k in base.items) if (o.items && o.items[k]) base.items[k] = true;
      for (k in base.relics) if (o.relics && o.relics[k]) base.relics[k] = true;
      base.innerOpen = !!o.innerOpen;
      for (k in base.hints) if (o.hints && o.hints[k]) base.hints[k] = true;
      if (o.jobs && typeof o.jobs === 'object' && !(o.jobs instanceof Array)) base.jobs = o.jobs;
      if (o.story === 'act1' || o.story === 'act2' || o.story === 'act3') base.story = o.story;
      if (o.pages && typeof o.pages === 'object' && !(o.pages instanceof Array)) {
        for (k in base.pages) if (o.pages[k]) base.pages[k] = true;
      }
      base.wine = !!o.wine;
      if (Object.prototype.toString.call(o.log) === '[object Array]') base.log = o.log;
      /* v3：正篇字段（v1/v2 老档默认序章）。v3 老档的六小章 → 新三大章 */
      if (o.mode === 'main') {
        base.mode = 'main';
        var chRaw = o.chapter;
        if (o.v <= 3) chRaw = D.MAIN.chMap[chRaw] || 1;
        base.chapter = (chRaw >= 1 && chRaw <= 11) ? chRaw : 1;
        base.interest = o.interest || 0;
        base.testimony = o.testimony || 0;
        if (o.mainFlags && typeof o.mainFlags === 'object' && !(o.mainFlags instanceof Array)) base.mainFlags = o.mainFlags;
      }
      return base;
    } catch (e) { return null; }
  }

  function clearSave() {
    try { store.set(SAVE_KEY, ''); } catch (e) { /* ignore */ }
  }

  /* ---------- 章节检查点：每章开头记一份，独立键，不碰主存档 ---------- */

  function saveCheckpoint(tag) {
    var p = packState();
    if (!p) return false;
    p.cp = tag || ('main:ch' + (S.mode === 'main' ? S.chapter : 0));
    try { store.set(CHECK_KEY, JSON.stringify(p)); } catch (e) { return false; }
    return true;
  }

  function checkpointRaw() {
    var raw = store.get(CHECK_KEY);
    return (raw && raw.length) ? raw : null;
  }

  function hasCheckpoint() { return !!checkpointRaw(); }

  function checkpointTag() {
    var raw = checkpointRaw();
    if (!raw) return null;
    try { var o = JSON.parse(raw); return (o && o.cp) ? o.cp : null; } catch (e) { return null; }
  }

  function loadCheckpoint() {
    var raw = checkpointRaw();
    if (!raw) return null;
    try { return unpackState(JSON.parse(raw)); } catch (e) { return null; }
  }

  function clearCheckpoint() {
    try { store.set(CHECK_KEY, ''); } catch (e) { /* ignore */ }
  }

  /* ---------- 状态 ---------- */

  function freshState() {
    var mem = {};
    for (var i = 0; i < D.MEMORIES.length; i++) {
      mem[D.MEMORIES[i].id] = { state: 'held', pawnedAt: 0, pawns: 0 };
    }
    return {
      phase: 'play', t: 0, gold: 0,
      px: 4, py: 7, tx: 4, ty: 7, moveT: 0, facing: 1,
      mem: mem,
      items: { key: false, lantern: false, album: false },
      relics: { photo: false, watch: false, ribbon: false },
      innerOpen: false, knockSeq: [], knockWrong: false, knockErr: 0,
      jobs: {},
      story: 'act1', pages: { p1: false, p2: false, p3: false, p4: false, p5: false }, wine: false,
      scene: 'town', quizIdx: 0,
      mode: 'prologue', chapter: 0, interest: 0, testimony: 0, mainFlags: {}, mainT: 0,
      log: [], logDirty: true, memDirty: true,
      modal: null, curIt: null, riddleMsg: '', riddleTry: 0, mini: null,
      hints: { fisher: false, choir: false },
      tabs: 'log', hudT: 0, warnT: 0, saveT: 0,
      ended: null, warnPlayed: false
    };
  }

  function addLog(raw, kind) {
    S.log.push({ raw: raw, t: S.t, kind: kind || '' });
    S.logDirty = true;
  }

  /* ---------- 记忆操作 ---------- */

  /* 价格体系：当多少，赎多少（原价）——"卖了再赎"一来一回净赚 0，无法刷当金。
     钱的正途只有一条：告示牌零工。 */
  function pawnPrice(m) { return m.w; }
  function redeemCost(m) { return m.w; }

  function pawnMemory(id) {
    var m = D.memById(id);
    var st = S.mem[id];
    if (!m || !st || st.state !== 'held') return false;
    var price = pawnPrice(m);
    st.state = 'pawned';
    st.pawnedAt = S.t;
    st.pawns += 1;
    S.gold += price;
    addLog(D.CHAT.pawned.replace('{ID}', id).replace('{GOLD}', price), '');
    window.SFX.pawn();
    window.SFX.coin();
    S.memDirty = true;
    S.logDirty = true;
    return true;
  }

  function redeemMemory(id) {
    var m = D.memById(id);
    var st = S.mem[id];
    if (!m || !st || st.state !== 'pawned') return false;
    var cost = redeemCost(m);
    if (S.gold < cost) { gToast('当金不够——赎回这段要 ' + cost + ' 枚。'); return false; }
    S.gold -= cost;
    st.state = 'held';
    st.pawnedAt = 0;
    addLog(D.CHAT.redeemed.replace('{ID}', id).replace('{GOLD}', cost), '');
    window.SFX.redeem();
    S.memDirty = true;
    S.logDirty = true;
    return true;
  }

  function buyTicket(id) {
    var r = D.canBuy(S, id);
    if (!r.ok) return r;
    S.gold -= r.goods.cost;
    S.items[id] = true;
    addLog('你从柜台取走了「' + r.goods.name + '」。' + (id === 'key' ? '钥匙入手的一瞬，你忘了自己为什么想要它。' : ''), '');
    window.SFX.coin();
    S.memDirty = true;
    return r;
  }

  /* ---------- 交互面板 ---------- */

  function findPlace(id) {
    for (var i = 0; i < D.PLACES.length; i++) if (D.PLACES[i].id === id) return D.PLACES[i];
    for (var j = 0; j < D.NPCS.length; j++) if (D.NPCS[j].id === id) return D.NPCS[j];
    return null;
  }

  function storyNum(s) { return s === 'act2' ? 2 : (s === 'act3' ? 3 : 1); }
  function itVisible(it) {
    if (it.prologueOnly && S.mode === 'main') return false;
    if (it.mainCh !== undefined) {
      if (S.mode !== 'main') return false;
      if (it.hideCh && it.hideCh.indexOf(S.chapter) >= 0) return false;
      /* 守夜完成前（第3章前半），小满在家睡觉不出门 */
      if (it.id === 'sis' && S.chapter === 3 && !S.mainFlags.ch5done) return false;
      return S.chapter >= it.mainCh;
    }
    if (!it.act) return true;
    return storyNum(S.story) >= it.act;
  }

  function findNearestIt() {
    var best = null, bd = 1e9;
    var all = D.PLACES.concat(D.NPCS);
    for (var i = 0; i < all.length; i++) {
      var it = all[i];
      if (!itVisible(it)) continue;
      var d = Math.abs(S.px - it.x) + Math.abs(S.py - it.y);
      if (d <= 2 && d < bd) { bd = d; best = it; }
    }
    return best;
  }

  function openModal(kind, title, bodyHtml, btns) {
    S.modal = { kind: kind };
    mTitleEl.textContent = title;
    mBodyEl.innerHTML = bodyHtml;
    var html = '';
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      html += '<button data-action="' + b.action + '"' + (b.cls ? ' class="' + b.cls + '"' : '') + (b.disabled ? ' disabled' : '') + '>' + b.label + '</button>';
    }
    mBtnsEl.innerHTML = html;
    modalEl.classList.add('show');
    if (dpadEl) dpadEl.style.visibility = 'hidden';   /* 剧情模态打开：隐藏方向键防误走（E 键保留，等同键盘） */
    var inp = document.getElementById('riddle-input');
    if (inp) {
      try { inp.focus(); } catch (e) { /* ignore */ }
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation(); /* 同一个回车不许再冒泡到全局键位，否则会立刻关掉刚弹出的面板 */
          handleAction('riddle:submit', '');
        }
      });
    }
  }

  function closeModal() {
    S.modal = null;
    S.curIt = null;
    S.riddleMsg = '';
    S.mini = null;   /* 小游戏面板随关闭一并清场 */
    /* 不在剧情连页链中且身处雾境时离开 → 回到小镇 */
    if (!S.dialogQ && S.scene === 'mist' && S.phase === 'play') S.scene = 'town';
    modalEl.classList.remove('show');
    if (dpadEl) dpadEl.style.visibility = '';
  }

  /* ---------- 剧情系统（多步对话 / 五页日记 / 雾门终局） ---------- */

  function openPages(list, endLabel, onEnd) {
    S.dialogQ = { list: list, idx: 0, endLabel: endLabel || '离开', onEnd: onEnd || null };
    showPage();
  }

  function showPage() {
    var q = S.dialogQ;
    if (!q) return;
    var pg = q.list[q.idx];
    var last = q.idx >= q.list.length - 1;
    var btns = [{ action: 'page:next', label: last ? q.endLabel : '▸ 继续', cls: last ? 'gold' : '' }];
    openModal('story', pg.t, '<p>' + D.resolveText(pg.h, S) + '</p>', btns);
  }

  function pageNext() {
    var q = S.dialogQ;
    if (!q) return;
    q.idx++;
    if (q.idx >= q.list.length) {
      var cb = q.onEnd;
      closeModal();          /* dialogQ 还在 → 不重置雾境场景 */
      S.dialogQ = null;
      if (cb) cb();
    } else {
      showPage();
    }
  }

  function getPage(id) {
    if (!S.pages || S.pages[id]) return;
    S.pages[id] = true;
    var n = D.pagesCountOf(S);
    var meta = D.CHAT.story.pages[id];
    addLog(D.CHAT.story.gotPage.replace('{N}', n).replace('{LEFT}', meta.from), 'sys');
    gToast('日记 · ' + meta.from + '（' + n + '/5）');
    window.SFX.open();
    S.memDirty = true;
    S.logDirty = true;
    if (n === 5) {
      addLog('五页日记齐了。回当铺，找老板把这本"账"对一对。', 'sys');
      gToast('五页集齐——回当铺找老板');
    }
  }

  function homePanelAct2() {
    openModal('echo', '家 · 妹妹的房间', '<p>' + D.resolveText(D.CHAT.story.homeOpen, S) + '</p>', [
      { action: 'page:p1', label: '翻开抽屉夹层', cls: 'gold' },
      { action: 'close', label: '先不碰' }
    ]);
  }

  function wellPanelAct2() {
    var body = '<p>' + D.resolveText(D.CHAT.story.wellGlow, S) + '</p>';
    var btns = [{ action: 'close', label: '离开' }];
    if (S.items.lantern) btns.unshift({ action: 'page:p4', label: '把雾灯系在井绳上沉下去', cls: 'gold' });
    else body += '<p style="color:var(--dim)">' + D.resolveText(D.CHAT.story.wellNeed, S) + '</p>';
    openModal('echo', '童年之井', body, btns);
  }

  function storyPanel(it) {
    var sid = it.storyId;
    if (sid === 'pew') {
      if (S.pages.p2) {
        openModal('story', '教堂长椅', '<p>诗集还在长椅上晾着。夹在第 41 页的东西，已经在你身上了。</p>', [{ action: 'close', label: '离开' }]);
        return;
      }
      openModal('story', '教堂长椅', '<p>' + D.resolveText(D.CHAT.story.pewBody, S) + '</p>', [
        { action: 'page:p2', label: D.CHAT.story.pewBtn, cls: 'gold' },
        { action: 'close', label: '离开' }
      ]);
    } else if (sid === 'crate') {
      if (S.wine) {
        openModal('story', '仓库地板', '<p>' + D.resolveText(D.CHAT.story.crateDone, S) + '</p>', [{ action: 'close', label: '离开' }]);
        return;
      }
      openModal('story', '仓库地板', '<p>' + D.resolveText(D.CHAT.story.crateBody, S) + '</p>', [
        { action: 'crate:take', label: D.CHAT.story.crateBtn, cls: 'gold' },
        { action: 'close', label: '离开' }
      ]);
    } else if (sid === 'mistgate') {
      openMistGate();
    }
  }

  function clockPanel() {
    var body = '<p>' + D.resolveText(D.CHAT.story.clockBody, S) + '</p>';
    body += '<p style="color:var(--dim)">' + D.resolveText(D.CHAT.story.clockTip, S) + '</p>';
    var opts = ['九点整', '九点三刻', '十点整'];
    var btns = [];
    for (var i = 0; i < opts.length; i++) {
      btns.push({ action: 'clock:' + i, label: '把针拨到 ' + opts[i] });
    }
    btns.push({ action: 'close', label: '先离开' });
    openModal('story', '钟塔 · 拨针', body, btns);
  }

  function openMistGate() {
    var gate = D.finalGateOf(S);
    if (gate === 'blank') { endGame('blank'); return; }
    S.scene = 'mist';
    S.quizIdx = 0;
    gMarkArch('gate');
    var pages = D.CHAT.story.gateOpen.concat(D.CHAT.story.mist);
    if (gate === 'half') {
      gMarkArch('halfgate');
      openPages(pages.concat(D.CHAT.story.halfGate), '……', function () { endGame('half'); });
      return;
    }
    openPages(pages, '答她的话', function () { showQuiz(); });
  }

  function showQuiz() {
    gMarkArch('quiz');
    var qz = D.CHAT.story.quiz;
    if (S.quizIdx >= qz.length) { showFinalChoice(); return; }
    var q = qz[S.quizIdx];
    var body = '<p><b>' + D.resolveText(q.q, S) + '</b></p>';
    var btns = [];
    for (var i = 0; i < q.opts.length; i++) {
      btns.push({ action: 'quiz:' + i, label: q.opts[i] });
    }
    openModal('quiz', '雾的那一边 · ' + (S.quizIdx + 1) + ' / 3', body, btns);
  }

  function answerQuiz(i) {
    var q = D.CHAT.story.quiz[S.quizIdx];
    if (!q) return;
    if (i === q.right) {
      window.SFX.bell();
      S.quizIdx++;
      var self = D.CHAT.story.quizRight[S.quizIdx - 1];
      openPages([{ t: '小满', h: self }], '▸ 下一句', function () { showQuiz(); });
    } else {
      /* 答错即散：三句话没记全，她拼不出你——直接进「一半的我」坏结局 */
      window.SFX.wrong();
      gMarkArch('quizfail');
      openPages(D.CHAT.story.quizFail, '……', function () { endGame('half'); });
    }
  }

  function showFinalChoice() {
    gMarkArch('final');
    openPages(D.CHAT.story.final, '做选择', function () {
      openModal('final', '最后的选择', '<p>雾很轻，压在肩上，像谁的手。</p>', [
        { action: 'final:take', label: D.CHAT.story.choiceTake, cls: 'gold' },
        { action: 'final:keep', label: D.CHAT.story.choiceKeep },
        { action: 'close', label: '再想想' }
      ]);
    });
  }

  function talkDiary() {
    var n = D.pagesCountOf(S);
    if (S.story === 'act1') { bossMenu(); return; }
    if (n < 5) {
      var hints = [];
      for (var k in S.pages) {
        if (!S.pages[k] && D.CHAT.story.bossDiaryHints[k]) hints.push(D.CHAT.story.bossDiaryHints[k]);
      }
      openModal('shop', '老板 · 关于日记',
        '<p>' + D.resolveText(D.CHAT.story.bossDiaryLess.replace('{N}', String(5 - n)), S) + '</p>' +
        '<p style="color:var(--dim)">' + hints.join('<br>') + '</p>',
        [{ action: 'shop:root', label: '回到柜台' }]);
      return;
    }
    if (S.story === 'act2') {
      gMarkArch('diarydone');
      openPages(D.CHAT.story.bossDiaryDone, '收好钉好的日记', function () {
        S.story = 'act3';
        addLog('雾巷深处的<b>雾门</b>开了。', 'sys');
        gToast('雾门开了——去雾巷最深处');
        S.logDirty = true;
        saveGame();
      });
      return;
    }
    openModal('shop', '老板 · 关于日记', '<p>"门开着。别让雾等太久。"</p>', [{ action: 'shop:root', label: '回到柜台' }]);
  }

  function bossMenu() {
    /* 正篇：柜台照常经营，剧情问话按章分流 */
    if (S.mode === 'main') {
      S.modal = { kind: 'shop' };
      S.curIt = findPlace('shop');
      var F = S.mainFlags;
      var askLabel = null;
      if (S.chapter === 1) {
        if (!F.ask1) askLabel = '问雾的事 <span class="sub">门为什么白天开了条缝</span>';
        else if (F.blackout1 && !F.ask2) askLabel = '把失漏摆上柜台 <span class="sub">查清「利息」是什么</span>';
      } else if (S.chapter === 3) {
        if (F.ch6pluto && F.ch5done) askLabel = '给他看白记的契纸 <span class="sub">问老板怎么办</span>';
      } else if (S.chapter === 7 && !F.ask7) askLabel = '问老板守了多久的门 <span class="sub">堰是什么</span>';
      else if (S.chapter === 8 && !F.ask8) askLabel = '问问该还的东西 <span class="sub">空抽屉的名签</span>';
      else if (S.chapter === 10 && !F.ask10) askLabel = '谈谈发还日 <span class="sub">日落前的最后一件事</span>';
      var mbtns = [
        { action: 'shop:pawn', label: '典当记忆 <span class="sub">把一段回忆放上柜台，换当金</span>' },
        { action: 'shop:redeem', label: '赎回记忆 <span class="sub">花当金把它原价换回来</span>' },
        { action: 'shop:goods', label: '看看柜台 <span class="sub">用当金换些东西</span>' }
      ];
      if (askLabel) mbtns.push({ action: 'main:ask', label: askLabel, cls: 'gold' });
      else mbtns.push({ action: 'main:idle', label: '问问近况' });
      mbtns.push({ action: 'close', label: '离开当铺' });
      var dl = mainDaysLeft();
      openModal('shop', '记忆当铺 · 柜台（正篇 · ' + actLabel(curAct()) + '）',
        '<p>老板擦着一只空抽屉："客人，想好了？这里只收回忆。当前当金 <b style="color:var(--gold2)">' + S.gold + '</b> 枚。"</p>' +
        '<p style="color:var(--dim);font-size:12px">利息 ' + S.interest + '% · 证词 ' + S.testimony + ' 件' +
        (dl === 0 ? ' · <b>雾季最后一天</b>' : ' · 距雾季结束 ' + dl + ' 天') + '</p>', mbtns);
      return;
    }
    S.modal = { kind: 'shop' };
    S.curIt = findPlace('shop');
    var body = '<p>老板擦着一只空抽屉："客人，想好了？这里只收回忆。' +
      '当前当金 <b style="color:var(--gold2)">' + S.gold + '</b> 枚。"</p>';
    var btns = [
      { action: 'shop:pawn', label: '典当记忆 <span class="sub">把一段回忆放上柜台，换当金</span>' },
      { action: 'shop:redeem', label: '赎回记忆 <span class="sub">花当金把它原价换回来</span>' },
      { action: 'shop:goods', label: '看看柜台 <span class="sub">用当金换些东西</span>' },
      { action: 'talk:sister', label: '谈谈' + '妹妹' }
    ];
    if (S.story !== 'act1') {
      btns.push({ action: 'talk:diary', label: '谈谈日记 <span class="sub">她留在镇上的五页纸</span>', cls: 'gold' });
    }
    btns.push({ action: 'close', label: '离开当铺' });
    openModal('shop', '记忆当铺 · 柜台', body, btns);
  }

  function pawnPanel() {
    var held = [];
    for (var i = 0; i < D.MEMORIES.length; i++) {
      if (S.mem[D.MEMORIES[i].id].state === 'held') held.push(D.MEMORIES[i]);
    }
    var body = '<p>老板摊开绒布："挑吧。越痛的，越值钱。"</p>';
    var btns = [];
    for (var j = 0; j < held.length; j++) {
      var m = held[j];
      btns.push({
        action: 'pawn:' + m.id,
        label: '<span class="m-tag">' + m.tag + '</span>' + m.text +
               '<span class="cost">+' + pawnPrice(m) + '◆</span>'
      });
    }
    if (!held.length) body += '<p>——你的记忆已经一枚不剩了。老板的表情看不分明。</p>';
    btns.push({ action: 'shop:root', label: '回到柜台', cls: '' });
    openModal('pawn', '典当 · 选一段记忆', body, btns);
  }

  function redeemPanel() {
    var pawned = D.pawnedOf(S);
    var body = '<p>老板指指墙上的沙漏："赎回不打折——当多少，赎多少。沙子漏完之前回来，钱货两清。"</p>';
    var btns = [];
    var anyPoor = false;
    for (var i = 0; i < pawned.length; i++) {
      var m = pawned[i];
      var left = CFG.REDEEM_SECONDS - (S.t - S.mem[m.id].pawnedAt);
      var cost = redeemCost(m);
      var poor = S.gold < cost;
      if (poor) anyPoor = true;
      btns.push({
        action: 'redeem:' + m.id,
        label: '<span class="m-tag">' + m.tag + '</span>' + D.blackout(m.text) +
               '<span class="sub cd" data-cd="' + m.id + '">剩余 ' + fmtTime(left) + '</span>' +
               '<span class="cost">−' + cost + '◆</span>',
        disabled: poor
      });
    }
    if (anyPoor) body += '<p style="color:var(--red)">有几段你暂时赎不起——去告示牌看看零工，或典当别的记忆周转。</p>';
    var lostN = D.lostCountOf(S);
    if (lostN > 0) body += '<p style="color:var(--red)">另有 ' + lostN + ' 段已断当，永远散进了雾里。</p>';
    if (!pawned.length && !lostN) body += '<p>柜台上空空的。你没有典当过任何东西。</p>';
    btns.push({ action: 'shop:root', label: '回到柜台' });
    openModal('redeem', '赎回 · 趁还记得', body, btns);
  }

  function goodsPanel() {
    var body = '<p>柜台下面的暗格里，躺着几样从别人记忆里抽出来的东西。</p>';
    var btns = [];
    for (var i = 0; i < D.SHOP.length; i++) {
      var g = D.SHOP[i];
      var owned = S.items[g.id];
      var r = owned ? { ok: false, why: '已持有' } : D.canBuy(S, g.id);
      var why = owned ? '已持有' : r.why;
      btns.push({
        action: 'buy:' + g.id,
        label: g.ico + ' <b>' + g.name + '</b><span class="sub">' + g.desc +
               (r.ok ? '' : '（<span style="color:var(--red)">' + why + '</span>）') + '</span><span class="cost">' + (owned ? '已持有' : g.cost + '◆') + '</span>',
        disabled: owned || !r.ok
      });
    }
    btns.push({ action: 'shop:root', label: '回到柜台' });
    openModal('goods', '柜台 · 用当金换', body, btns);
  }

  function talkSister() {
    var txt;
    if (S.story !== 'act1') {
      txt = D.CHAT.boss.sisterAfter;
      openModal('talk', '老板 · 关于她', '<p>' + D.resolveText(txt, S) + '</p>', [{ action: 'shop:root', label: '回到柜台' }]);
      return;
    }
    txt = D.hasRelics(S) ? D.CHAT.boss.sister[1] : D.CHAT.boss.sister[0];
    if (D.hasRelics(S)) S.innerOpen = true;
    var btns = [{ action: 'shop:root', label: '回到柜台' }];
    if (D.hasRelics(S)) btns.unshift({ action: 'enter:inner', label: '推开里屋的门', cls: 'gold' });
    openModal('talk', '老板 · 关于她', '<p>' + D.resolveText(txt, S) + '</p>', btns);
  }

  function innerPanel() {
    if (S.innerOpen) {
      openModal('inner', '里屋', '<p>' + D.resolveText(D.CHAT.boss.innerOpen, S) + '</p>', [
        { action: 'enter:inner', label: '走进去', cls: 'gold' },
        { action: 'close', label: '先退出来' }
      ]);
    } else {
      openModal('inner', '里屋', '<p>' + D.resolveText(D.CHAT.boss.innerLocked, S) + '</p>', [
        { action: 'close', label: '离开' }
      ]);
    }
  }

  function echoPanel(it) {
    /* 正篇：井拾卷 / 家守夜 / 镇公所 */
    if (S.mode === 'main' && (it.id === 'well' || it.id === 'home' || it.id === 'hall')) { mainEchoPanel(it); return; }
    /* 第二幕：家 / 井 的剧情变体 */
    if (it.id === 'home' && S.story !== 'act1' && !S.pages.p1) { homePanelAct2(); return; }
    if (it.id === 'well' && S.story !== 'act1' && !S.pages.p4) { wellPanelAct2(); return; }
    var btns = [{ action: 'close', label: '离开' }];
    var body;
    if (it.needLantern && !S.items.lantern) {
      body = '<p>' + D.CHAT.alley.nolight + '</p>' +
             '<p style="color:var(--dim)">（雾里好像有什么微微发光的东西——听说揣上雾灯就能看清。当铺有卖。）</p>';
    } else if (it.id === 'alley') {
      body = '<p>' + it.echo + '</p>';
    } else if (it.bindMem && D.memStateOf(S, it.bindMem) === 'held') {
      var m = D.memById(it.bindMem);
      body = '<p>' + it.name + '——你站了一会儿。</p><p>{{mem:' + m.id + '}}</p><p style="color:var(--dim)">（这段记忆还在你身上，好好留着，或者，别太早卖掉。）</p>';
    } else {
      body = '<p>' + it.echo + '</p>';
      if (it.bindMem) body += '<p style="color:var(--dim)">（一段相关的记忆已经不在了，只剩这里的痕迹。）</p>';
    }
    openModal('echo', it.name, D.resolveText(body, S), btns);
  }

  function boardPanel() {
    var bp = findPlace('board');
    var body = '<p style="border:1px dashed var(--line);border-radius:9px;padding:8px 10px;color:var(--dim)">' +
               D.resolveText(bp.echo, S) + '</p>';
    body += '<p style="margin-top:8px;color:var(--gold2)">—— 下面是镇上的零工，做完当场结钱 ——</p>';
    var btns = [];
    /* 正篇第5章：白老板的催当帖钉在牌上 */
    if (S.mode === 'main' && S.chapter === 5 && !S.mainFlags.ch5pluto) {
      btns.push({ action: 'main:notice2', label: '<b>白日当铺 · 催当帖</b><span class="sub">红印更艳了——白老板在等你</span>', cls: 'gold' });
    }
    for (var i = 0; i < D.JOBS.length; i++) {
      var j = D.JOBS[i];
      var st = S.jobs[j.id] || 'offered';
      var tp = findPlace(j.target);
      if (st === 'offered') {
        btns.push({
          action: 'jobaccept:' + j.id,
          label: '<b>' + j.title + '</b><span class="sub">' + j.desc + '</span><span class="cost">+' + j.reward + '◆</span>'
        });
      } else if (st === 'active') {
        btns.push({
          action: 'noop',
          label: '<b>' + j.title + '</b><span class="sub">进行中 · 去「' + (tp ? tp.name : j.target) + '」按 E 交差</span>',
          disabled: true
        });
      } else {
        btns.push({ action: 'noop', label: '<b>' + j.title + '</b><span class="sub">已完成 ✓</span>', disabled: true });
      }
    }
    btns.push({ action: 'close', label: '离开告示牌' });
    openModal('board', '告示牌 · 雾水镇零工', body, btns);
  }

  function lockKeyPanel() {
    if (S.relics.photo) {
      openModal('lock_key', '教堂侧门', '<p>门已经开了，小龛空着。</p>', [{ action: 'close', label: '离开' }]);
      return;
    }
    if (S.items.key) {
      S.relics.photo = true;
      S.memDirty = true;
      gMarkArch('relic_photo');
      addLog('你用铜钥匙打开了教堂侧门，取到了<b>半张照片</b>。', 'sys');
      window.SFX.door();
      window.SFX.open();
      openModal('lock_key', '教堂侧门', '<p>' + D.resolveText(D.CHAT.key.open, S) + '</p>', [{ action: 'close', label: '收好照片' }]);
    } else {
      openModal('lock_key', '教堂侧门', '<p>' + D.resolveText(D.CHAT.key.nokey, S) + '</p>', [{ action: 'close', label: '离开' }]);
    }
  }

  function riddlePanel() {
    if (S.relics.watch) {
      if (S.story !== 'act1' && !S.pages.p5) { clockPanel(); return; }
      openModal('lock_riddle', '钟塔', '<p>暗格空着，怀表已经在你身上。</p>', [{ action: 'close', label: '离开' }]);
      return;
    }
    var body = '<p>' + D.resolveText(D.CHAT.riddle.prompt, S) + '</p>';
    if (S.riddleMsg) body += '<p style="color:var(--red)">' + S.riddleMsg + '</p>';
    body += '<div class="riddle-row">答案：<input id="riddle-input" maxlength="2" autocomplete="off">' +
            '<button data-action="riddle:submit" class="gold">敲下面板</button></div>' +
            '<p style="color:var(--dim);font-size:12px">输入数字后按回车，或点「敲下面板」。</p>';
    if (S.riddleTry >= 2) body += '<p style="color:var(--gold2);font-size:12px">' + D.CHAT.riddle.hint + '</p>';
    if (D.memStateOf(S, 'bell7') !== 'held' || D.memStateOf(S, 'six') !== 'held') {
      body += '<p style="color:var(--red);font-size:12px">（有两个数被雾糊住了——你当掉的那段记忆，字是黑的。想看清，就得把它赎回来。）</p>';
    }
    var btns = [{ action: 'close', label: '离开' }];
    openModal('lock_riddle', '钟塔 · 老面板', body, btns);
  }

  function codePanel() {
    if (S.relics.ribbon) {
      openModal('lock_code', '码头闸门', '<p>闸门开着，布包已经在你身上。</p>', [{ action: 'close', label: '离开' }]);
      return;
    }
    var body = '<p>' + D.resolveText(D.CHAT.code.prompt, S) + '</p>';
    var track = '<div class="knock-track">';
    for (var i = 0; i < KNOCK_TARGET.length; i++) {
      if (i < S.knockSeq.length) track += '<span>' + (S.knockSeq[i] === 'L' ? '▬' : '▪') + '</span>';
      else if (S.knockWrong && i === (S.knockErr || 1) - 1) track += '<span class="wrong">✕</span>';
      else track += '<span class="slot">○</span>';
    }
    track += '</div>';
    body += track;
    if (S.knockWrong) {
      body += '<p style="color:var(--red);font-size:12px">第 ' + (S.knockErr || 1) + ' 拍敲错了——金属板闷闷地弹回去，进度清零。</p>';
    }
    if (D.memStateOf(S, 'code') !== 'held') {
      body += '<p style="color:var(--red);font-size:12px">（暗号那行字被雾糊住了——它现在在当铺的抽屉里。）</p>';
    }
    var btns = [
      { action: 'knock:L', label: '▬ 敲一声长的', cls: 'gold' },
      { action: 'knock:S', label: '▪ 敲一声短的' },
      { action: 'knock:reset', label: '从头再敲' },
      { action: 'close', label: '离开' }
    ];
    openModal('lock_code', '码头闸门 · 暗号', body, btns);
  }

  function npcPanel(npc) {
    var body;
    var btns = [{ action: 'close', label: '告辞' }];
    /* 正篇：NPC 对话走正篇分流 */
    if (S.mode === 'main') { mainNpcPanel(npc); return; }
    /* 第二幕：NPC 剧情对话（免费） */
    if (npc.id === 'fisher' && S.story !== 'act1' && !S.pages.p3) {
      if (!S.wine) {
        openModal('npc', npc.name, '<p>' + D.resolveText(npc.act2a, S) + '</p>', btns);
        return;
      }
      getPage('p3');
      openPages([
        { t: '老渔夫', h: npc.act2b },
        { t: '她的字 · ' + D.CHAT.story.pages.p3.from, h: D.CHAT.story.pages.p3.text }
      ], '收好字条');
      return;
    }
    if (npc.id === 'choir' && S.story !== 'act1') {
      body = '<p>' + D.resolveText(S.pages.p2 ? npc.act2b : npc.act2a, S) + '</p>';
      openModal('npc', npc.name, body, btns);
      return;
    }
    if (S.hints[npc.id]) {
      body = '<p>' + D.resolveText(npc.tipAfter || npc.idleAfter, S) + '</p>';
    } else {
      body = '<p>' + D.resolveText(npc.idle, S) + '</p>';
      if (S.gold >= npc.cost) {
        btns.unshift({ action: 'tipbuy:' + npc.id, label: '给他 ' + npc.cost + ' 枚当金，听他说 <span class="cost">' + npc.cost + '◆</span>' });
      } else {
        body += '<p style="color:var(--dim)">（你需要 ' + npc.cost + ' 枚当金——也许该先去当铺卖点回忆。）</p>';
      }
    }
    openModal('npc', npc.name, body, btns);
  }

  function openEvent(it) {
    if (!it) return;
    S.curIt = it;
    S.knockWrong = false;
    /* 跑腿委托：走到目标地按 E 即交差（可叠着开该地点自己的面板） */
    for (var i = 0; i < D.JOBS.length; i++) {
      var j = D.JOBS[i];
      if (S.jobs[j.id] === 'active' && j.target === it.id) {
        S.jobs[j.id] = 'done';
        S.gold += j.reward;
        addLog(j.done + '（委托完成 <b>+' + j.reward + '◆</b>）', 'sys');
        window.SFX.coin();
        gToast('委托完成 +' + j.reward + '◆');
      }
    }
    /* 正篇：钟楼/长椅这类序章地点走正篇剧情分流 */
    if (S.mode === 'main' && (it.kind === 'echo' || it.id === 'tower' || it.id === 'pew')) { mainEchoPanel(it); return; }
    switch (it.kind) {
      case 'shop': bossMenu(); break;
      case 'inner': innerPanel(); break;
      case 'echo': echoPanel(it); break;
      case 'board': boardPanel(); break;
      case 'lock_key': lockKeyPanel(); break;
      case 'lock_riddle': riddlePanel(); break;
      case 'lock_code': codePanel(); break;
      case 'story': storyPanel(it); break;
      case 'npc': npcPanel(it); break;
      default: closeModal();
    }
  }

  /* ---------- 动作分发 ---------- */

  function handleAction(action, arg) {
    if (!S || S.phase !== 'play') return;
    window.SFX.click();
    var parts = action.split(':');
    var head = parts[0], tail = parts.slice(1).join(':');
    switch (head) {
      case 'close': closeModal(); break;
      case 'shop': 
        if (tail === 'root') bossMenu();
        else if (tail === 'pawn') pawnPanel();
        else if (tail === 'redeem') redeemPanel();
        else if (tail === 'goods') goodsPanel();
        break;
      case 'talk':
        if (tail === 'diary') talkDiary();
        else talkSister();
        break;
      case 'enter':
        if (!S.innerOpen) { innerPanel(); break; }
        closeModal();
        enterInner();
        break;
      case 'pawn':
        pawnMemory(tail);
        if (S.modal) pawnPanel();
        break;
      case 'redeem':
        redeemMemory(tail);
        if (S.modal) redeemPanel();
        break;
      case 'buy': {
        var r = buyTicket(tail);
        if (!r.ok) gToast(r.why);
        if (S.modal) goodsPanel();
        break;
      }
      case 'tipbuy': {
        var npc = findPlace(tail);
        if (npc && !S.hints[tail] && S.gold >= npc.cost) {
          S.gold -= npc.cost;
          S.hints[tail] = true;
          window.SFX.coin();
          npcPanel(npc);
        }
        break;
      }
      case 'jobaccept': {
        for (var q = 0; q < D.JOBS.length; q++) {
          if (D.JOBS[q].id === tail && !S.jobs[tail]) {
            S.jobs[tail] = 'active';
            addLog('你揭下了告示牌上的委托：「' + D.JOBS[q].title + '」。', 'sys');
            boardPanel();
          }
        }
        break;
      }
      case 'noop':
        break;
      case 'page':
        if (tail === 'next') { pageNext(); break; }
        if (D.CHAT.story.pages[tail]) {
          getPage(tail);
          gMarkArch('diary_' + tail);
          openPages([{ t: '她的字 · ' + D.CHAT.story.pages[tail].from, h: D.CHAT.story.pages[tail].text }], '收好字条');
        }
        break;
      case 'crate':
        if (tail === 'take' && !S.wine) {
          S.wine = true;
          gMarkArch('wine');
          addLog('你从仓库地板下取出了那瓶<b>没开封的陈酒</b>。', 'sys');
          window.SFX.open();
          S.logDirty = true;
          storyPanel(findPlace('crate'));
        }
        break;
      case 'clock': {
        var ci = parseInt(tail, 10);
        if (ci === 1) {
          window.SFX.bell();
          openPages([{ t: '钟塔 · 拨针', h: D.CHAT.story.clockRight }], '▸ 取出纸页', function () {
            getPage('p5');
            gMarkArch('diary_p5');
            openPages([{ t: '她的字 · ' + D.CHAT.story.pages.p5.from, h: D.CHAT.story.pages.p5.text }], '收好字条');
          });
        } else {
          window.SFX.wrong();
          clockPanel();
          gToast(D.CHAT.story.clockWrong);
        }
        break;
      }
      case 'quiz':
        answerQuiz(parseInt(tail, 10));
        break;
      case 'final':
        if (tail === 'take') {
          gMarkArch('pay_take');
          openPages(D.CHAT.story.takePay, '天亮', function () { endGame('true_end'); });
        } else if (tail === 'keep') {
          gMarkArch('pay_keep');
          openPages(D.CHAT.story.keepPay, '回到镇上', function () { endGame('keeper'); });
        }
        break;
      case 'riddle':
        if (tail === 'submit') {
          var inp = document.getElementById('riddle-input');
          var v = inp ? inp.value.trim() : '';
          answerRiddle(v);
        }
        break;
      case 'knock':
        if (tail === 'reset') { S.knockSeq = []; S.knockWrong = false; codePanel(); break; }
        doKnock(tail);
        break;
      case 'chend':
        if (tail === 'next') {
          closeModal();
          S.memDirty = true;
          var ca = curAct(), cm = actMeta(ca);
          if (cm && cm.from === S.chapter) gToast(actLabel(ca));            /* 进入新章（幕） */
          else if (D.MAIN.chapters[S.chapter]) gToast(actLabel(ca) + ' · ' + D.MAIN.chapters[S.chapter].title);
          saveGame();
        }
        break;
      case 'main':
        if (tail === 'ask') {
          var pk = mainAskPages();
          if (pk) openPages(pk, '……', function () { mainAfterAsk(); });
        } else if (tail === 'idle') {
          mainBossIdle();
        } else if (tail === 'net') {
          mainNetStep();
        } else if (tail === 'vigil') {
          mainVigil();
        } else if (tail === 'gear') {
          mainGear();
        } else if (tail === 'ledger') {
          openMini('ledger', null, mainLedgerWin);
        } else if (tail === 'night') {
          mainNight();
        } else if (tail === 'weir') {
          mainWeir();
        } else if (tail === 'genealogy') {
          openPages(D.MAIN.talks.genealogy, '收下家谱抄本', function () { mainGenealogyDone(); });
        } else if (tail === 'notice2') {
          mainPluto2();
        } else if (tail === 'refuse') {
          openPages(D.MAIN.talks.refusePay, '看着他走远', function () { chapterEnd(5); });
        } else if (tail === 'sign') {
          S.mainFlags.signed = 1;
          openPages(D.MAIN.talks.signPay, '收回手', function () { chapterEnd(5); });
        } else if (tail === 'scrap') {
          S.mainFlags.scrap1 = 1;
          openPages(D.MAIN.talks.wellScrap, '收好卷宗', function () { gToast('烧剩的卷宗 · 1/3'); S.memDirty = true; });
        } else if (tail === 'fog') {
          S.mainFlags.fogDone = 1;
          openPages(D.MAIN.talks.fogMove, '扶住门框', function () { chapterEnd(7); });
        }
        break;
      case 'mend':
        mainMend(tail);
        break;
      case 'mini': {
        if (!S.mini) break;
        if (tail === 'retry') { var mr = S.mini; openMini(mr.key, mr.cfgKey, mr.onWin); break; }
        if (tail === 'quit') { S.mini = null; closeModal(); break; }
        var mdef = MINIS[S.mini.key];
        if (mdef) mdef.act(S.mini, tail);
        break;
      }
      default: break;
    }
  }

  function normAnswer(v) {
    var s = String(v).trim();
    var fw = '０１２３４５６７８９';
    return s.replace(/[０-９]/g, function (c) { return String(fw.indexOf(c)); });
  }

  function answerRiddle(v) {
    if (S.relics.watch) {
      if (S.story !== 'act1' && !S.pages.p5) { clockPanel(); return; }
      openModal('lock_riddle', '钟塔', '<p>暗格空着，怀表已经在你身上。</p>', [{ action: 'close', label: '离开' }]);
      return;
    }
    var s = normAnswer(v);
    if (s === '42' || s === '四十二') {
      S.relics.watch = true;
      gMarkArch('relic_watch');
      S.riddleMsg = '';
      S.riddleTry = 0;
      S.memDirty = true;
      addLog('你在钟塔答出了哑掉的那一声，取到了<b>旧怀表</b>。', 'sys');
      window.SFX.bell();
      window.SFX.open();
      var body = '<p>' + D.resolveText(D.CHAT.riddle.right, S) + '</p>';
      openModal('lock_riddle', '钟塔 · 老面板', body, [{ action: 'close', label: '收好怀表' }]);
    } else {
      S.riddleTry = (S.riddleTry || 0) + 1;
      S.riddleMsg = D.CHAT.riddle.wrong;
      window.SFX.wrong();
      riddlePanel();
    }
  }

  function doKnock(k) {
    if (S.relics.ribbon) return;
    S.knockSeq.push(k);
    if (k === 'L') window.SFX.knockL(); else window.SFX.knockS();
    var idx = S.knockSeq.length - 1;
    if (S.knockSeq[idx] !== KNOCK_TARGET[idx]) {
      S.knockErr = idx + 1;
      S.knockWrong = true;
      S.knockSeq = [];
      window.SFX.wrong();
      setTimeout(function () { if (S.modal && S.modal.kind === 'lock_code') codePanel(); }, 450);
      codePanel();
      return;
    }
    S.knockWrong = false;
    S.knockErr = 0;
    if (S.knockSeq.length === KNOCK_TARGET.length) {
      S.relics.ribbon = true;
      gMarkArch('relic_ribbon');
      S.knockSeq = [];
      S.memDirty = true;
      addLog('你在码头敲对了暗号，取到了<b>她的发绳</b>。', 'sys');
      window.SFX.open();
      var body = '<p>' + D.resolveText(D.CHAT.code.right, S) + '</p>';
      openModal('lock_code', '码头闸门 · 暗号', body, [{ action: 'close', label: '收好发绳' }]);
    } else {
      codePanel();
    }
  }

  function enterInner() {
    if (S.story === 'act1') {
      gMarkArch('act2open');
      openPages(D.CHAT.story.act2Open, '走出里屋', function () {
        S.story = 'act2';
        S.innerOpen = true;
        addLog('她叫<b>小满</b>。五页日记，藏在你一定会去的地方——去找。', 'sys');
        gToast('第二幕 · 去找五页日记');
        S.logDirty = true;
        saveGame();
      });
      return;
    }
    openModal('inner', '里屋', '<p>' + D.resolveText(D.CHAT.boss.innerOpen, S) + '</p>' +
      '<p style="color:var(--dim)">（墙上那格空抽屉还空着。签纸上的"冢"字迎着灯。）</p>',
      [{ action: 'close', label: '退出来' }]);
  }

  /* ---------- 正篇《雾季十年》：章节引擎（v20：章 = 幕，chapters 里是章内段落）---------- */

  function actOfStep(n) { return (D.MAIN.actOfStep && D.MAIN.actOfStep[n]) || 1; }
  function curAct() { return actOfStep(S ? S.chapter : 1); }
  function actMeta(a) { return (D.MAIN.acts && D.MAIN.acts[a]) || null; }
  function actName(a) { var m = actMeta(a); return m ? m.title : ''; }
  function actLabel(a) { return '第' + a + '章 ' + actName(a); }
  function stepIsActEnd(n) { var m = actMeta(actOfStep(n)); return !!(m && m.to === n); }
  function stepIsActStart(n) { var m = actMeta(actOfStep(n)); return !!(m && m.from === n); }

  function startMain() {
    clearSave();
    S = freshState();
    S.mode = 'main';
    S.chapter = 1;
    S.story = 'act3';           /* 序章已了结：里屋开着、日记钉成账本 */
    S.innerOpen = true;
    S.wine = true;
    S.pages = { p1: true, p2: true, p3: true, p4: true, p5: true };
    S.px = 4; S.py = 7; S.tx = 4; S.ty = 7;
    addLog('—— 次年 · 雾季十年 ——', 'sys');
    addLog('一年前，你从雾里赎回了妹妹。一年后，新的雾季来了——比去年早，也比去年厚。', 'sys');
    endModalEl.classList.remove('show');
    switchTab('log');
    renderLog(); renderStoryPane(); renderMemPane(); renderTicketPane(); gRenderHUD();
    gMarkArch('mn_ch1');
    openPages(D.MAIN.chapters[1].open, '回镇', null);
    gToast('正篇《雾季十年》· 第一章');
    updateMusic();
    saveGame();
    saveCheckpoint('main:ch1');   /* 正篇开场 = 第 1 章的存档点 */
  }

  /* 段落结算：幕末（段落 3/7/10）弹整章结算；幕内只演一段过场 —— 玩家看到的章只有三幕 + 隐藏章 */
  function chapterEnd(n) {
    var c = D.MAIN.chapters[n];
    if (!c) { closeModal(); return; }
    S.interest = Math.min(100, S.interest + (c.interest || 0));
    S.chapter = n + 1;
    S.mainT = 0;
    S.memDirty = true;
    var a = actOfStep(n), isEnd = stepIsActEnd(n);
    if (isEnd) gMarkArch('mn_ch' + a);
    addLog('—— ' + actLabel(a) + ' · ' + c.title + (isEnd ? ' · 完 ——' : ' ——'), 'sys');
    saveGame();
    if (stepIsActStart(S.chapter)) saveCheckpoint('main:ch' + actOfStep(S.chapter));   /* 每章（幕）开头记检查点 */
    if (!isEnd) {
      /* 幕内推进：只演一段过场（用段末那句），不弹章末结算 */
      openPages([{ t: actLabel(a) + ' · ' + c.title, h: c.end || '（继续）' }], '继续', null);
      updateMusic();
      return;
    }
    var nc = D.MAIN.chapters[n + 1];
    var dl = nc && typeof nc.days === 'number' ? nc.days : 0;
    var extra = '<p style="color:var(--dim);margin-top:8px">利息 ' + S.interest + '% · 证词 ' + S.testimony +
      ' 件 · 距雾季结束 ' + (dl === 0 ? '今夜' : dl + ' 天') + '</p>';
    var na = actOfStep(S.chapter), nm = actMeta(na);
    var lbl = (nm && !nm.hidden) ? ('▸ ' + actLabel(na)) : '▸ 终章 · 落日';
    openModal('chend', actLabel(a) + ' · 完',
      '<p>' + c.end + '</p>' + extra,
      [{ action: 'chend:next', label: lbl, cls: 'gold' }]);
    window.SFX.open();
    updateMusic();
  }

  /* 终章抉择：证词与利息决定可选支路；签了契只剩空账 */
  function mainFinalChoice() {
    var F = S.mainFlags;
    S.memDirty = true;
    if (F.signed) {
      openModal('final', '白天开灯的当铺 · 落日',
        '<p>契纸在你口袋里发烫。墨迹自己爬满了签名栏——你把选择权，也当出去了。</p>',
        [{ action: 'mend:blank', label: '……（契纸替你选了）', cls: 'gold' }]);
      return;
    }
    var canTrue = S.testimony >= 3;
    var canKeep = S.testimony >= 3 && S.interest <= 55;
    var cost = Math.ceil(S.interest / 2);
    var btns = [{
      action: canTrue ? 'mend:take' : 'noop',
      label: canTrue ? '替全镇把利息还清 <span class="sub">花 ' + cost + '◆ 当金 · 3 件证词抵账 · 名字归位</span>'
        : '替全镇还息 <span class="sub">证词不足（' + S.testimony + '/3）——镇上人不肯认这笔账</span>',
      cls: canTrue ? 'gold' : '', disabled: !canTrue
    }, {
      action: 'mend:half',
      label: '只还自己的账 <span class="sub">全镇的名字，继续押在堰里</span>'
    }, {
      action: canKeep ? 'mend:keep' : 'noop',
      label: canKeep ? '自己留在门里守灯 <span class="sub">接下柜台 · 隐藏结局</span>'
        : '留在门里守灯 <span class="sub">账太重（利息 ≤55% 且证词 ≥3），压不住这道门</span>',
      cls: canKeep ? 'gold' : '', disabled: !canKeep
    }];
    openModal('final', '白天开灯的当铺 · 落日',
      '<p>日落前一刻。柜台上一边是你的<b>续当单</b>，一边是空名签和契约正本。</p>', btns);
  }

  function mainMend(which) {
    if (which === 'take') {
      var cost = Math.ceil(S.interest / 2);
      if (S.gold < cost) { gToast('当金不够 ' + cost + '◆——去打零工，或先卖了些回忆'); return; }
      S.gold -= cost;
      openPages(D.MAIN.talks.endTake, '天亮', function () { mainEnd('mtrue'); });
    } else if (which === 'half') {
      openPages(D.MAIN.talks.endHalf, '当铺门口', function () { mainEnd('mhalf'); });
    } else if (which === 'blank') {
      openPages(D.MAIN.talks.endBlank, '——', function () { mainEnd('mblank'); });
    } else if (which === 'keep') {
      gMarkArch('mn_hidden');
      openPages(D.MAIN.talks.hiddenTake, '守第一班', function () { mainEnd('mkeep'); });
    }
  }

  var MAIN_END_SFX = { mtrue: 'end', mhalf: 'endSad', mblank: 'blank', mkeep: 'end' };

  function mainAskPages() {
    var ch = S.chapter, F = S.mainFlags;
    if (ch === 1) {
      if (!F.ask1) return D.MAIN.chapters[1].ask1;
      if (F.blackout1 && !F.ask2) return D.MAIN.chapters[1].ask2;
      return null;
    }
    if (ch === 3) return (F.ch6pluto && F.ch5done) ? D.MAIN.chapters[3].ask : null;
    if (ch === 7) return F.ask7 ? null : D.MAIN.chapters[7].ask;
    if (ch === 8) return F.ask8 ? null : D.MAIN.chapters[8].ask;
    if (ch === 10) return F.ask10 ? null : D.MAIN.chapters[10].ask;
    return null;
  }

  function mainAfterAsk() {
    var ch = S.chapter, F = S.mainFlags;
    if (ch === 1) {
      if (!F.ask1) { F.ask1 = 1; S.mainT = 0; gToast('记下了 · 挂了一百年的旧账'); S.memDirty = true; return; }
      if (F.blackout1 && !F.ask2) { F.ask2 = 1; S.memDirty = true; chapterEnd(1); }
      return;
    }
    if (ch === 3 && F.ch6pluto && F.ch5done) { chapterEnd(3); return; }
    if (ch === 7 && !F.ask7) { F.ask7 = 1; gToast('目标 · 去镇公所看看动静'); S.memDirty = true; return; }
    if (ch === 8 && !F.ask8) { F.ask8 = 1; S.memDirty = true; chapterEnd(8); return; }
    if (ch === 10 && !F.ask10) { F.ask10 = 1; S.memDirty = true; mainFinalChoice(); }
  }

  /* 雾季倒数：按章取自章表 */
  function mainDaysLeft() {
    var c = D.MAIN.chapters[S.chapter];
    return c && typeof c.days === 'number' ? c.days : 0;
  }

  function mainBossIdle() {
    var arr = D.MAIN.talks.bossIdle;
    openModal('shop', '记忆当铺 · 柜台',
      '<p>' + arr[Math.floor(Math.random() * arr.length)] + '</p>',
      [{ action: 'shop:root', label: '回到柜台' }]);
  }

  /* 正篇 NPC 对话分流 */
  function mainNpcPanel(npc) {
    var F = S.mainFlags;
    var btns = [{ action: 'close', label: '告辞' }];
    if (npc.id === 'archivist') {
      if (F.archDone || S.chapter > 2) {
        openModal('npc', npc.name, '<p>"啊？……哦。卷宗收好了就好。"老人重新埋进灯下，"白记的人还在镇上转。你脚下加紧。"</p>', btns);
        return;
      }
      if (!F.ch3met) {
        F.ch3met = 1;
        openPages(D.MAIN.talks.archOpen, '接下钥匙', function () { gToast('任务 · 找三卷烧剩的账'); S.memDirty = true; });
        return;
      }
      var got = (F.scrap1 ? 1 : 0) + (F.scrap2 ? 1 : 0) + (F.scrap3 ? 1 : 0);
      if (got < 3) {
        openModal('npc', npc.name, '<p>' + D.MAIN.talks.archDoing.h + '</p><p style="color:var(--dim)">（已找回 ' + got + '/3）</p>', btns);
        return;
      }
      F.archDone = 1;
      S.testimony += 1;
      openPages(D.MAIN.talks.archDone, '收下证词', function () { gToast('证词 +1'); S.memDirty = true; });
      return;
    }
    if (npc.id === 'lamp') {
      if (!F.genealogy) {
        openPages(D.MAIN.talks.genealogy, '收下家谱抄本', function () { mainGenealogyDone(); });
        return;
      }
      openModal('npc', npc.name, '<p>' + D.MAIN.talks.lampIdle + '</p>', btns);
      return;
    }
    if (npc.id === 'pluto') {
      if (S.chapter > 3) {
        openModal('npc', npc.name, '<p>"日落之前。"他笑着朝当铺的方向抬了抬下巴，"你那位同行，出不了他的门——你呢？"</p>', btns);
        return;
      }
      if (!F.ch6pluto) {
        F.ch6pluto = 1;
        openPages(D.MAIN.talks.pluto, '收下契纸', function () {
          gToast('目标变更 · 回当铺给老板看契纸');
          S.memDirty = true;
        });
        return;
      }
      openModal('npc', npc.name, '<p>' + D.MAIN.talks.plutoAgain.h + '</p>', btns);
      return;
    }
    if (npc.id === 'fisher') {
      if (S.chapter === 2 && !F.scrap2) {
        F.scrap2 = 1;
        openPages(D.MAIN.talks.fisherScrap, '收好卷宗', function () { gToast('烧剩的卷宗 · 2/3'); S.memDirty = true; });
        return;
      }
      if (S.chapter === 2 && !F.ch4done) {
        if (!F.archDone) {
          openModal('npc', npc.name, '<p>"网先不收。"老渔夫朝镇公所的方向努努嘴，"先把那老头要的纸凑齐了再说——他那三卷，比我这网沉。"</p>', btns);
          return;
        }
        F.netPull = 0;
        openPages(D.MAIN.talks.netIntro, '抓住网沿', function () { mainNetStep(); });
        return;
      }
      openModal('npc', npc.name, '<p>"今年的海吵得很。"老渔夫把网摊开晾着，"潮不对，钟也不对。你自己多当心。"</p>', btns);
      return;
    }
    if (npc.id === 'choir') {
      if (S.chapter === 2 && !F.scrap3) {
        F.scrap3 = 1;
        openPages(D.MAIN.talks.choirScrap, '收好卷宗', function () { gToast('烧剩的卷宗 · 3/3'); S.memDirty = true; });
        return;
      }
      openModal('npc', npc.name, '<p>孩子晃着腿："那个姐姐回来以后，我数钟再也没数到过七声。奇怪吧？"</p>', btns);
      return;
    }
    if (npc.id === 'sis') {
      var sk = S.chapter <= 3 ? S.chapter : 'after';
      var sp = D.MAIN.talks.sis[sk] || D.MAIN.talks.sis.after;
      openPages(sp, '好', null);
      return;
    }
    openModal('npc', npc.name, '<p>……</p>', btns);
  }

  /* 收网：三段交互（第4章） */
  function mainNetStep() {
    var F = S.mainFlags;
    F.netPull = (F.netPull || 0) + 1;
    if (F.netPull <= D.MAIN.talks.netPull.length) {
      var idx = F.netPull - 1;
      openModal('story', '收网 · ' + F.netPull + ' / 3',
        '<p>' + D.MAIN.talks.netPull[idx] + '</p>',
        [{ action: 'main:net', label: F.netPull >= 3 ? '把网拖上岸' : '再使一把劲', cls: 'gold' }]);
      return;
    }
    F.ch4done = 1;
    S.testimony += 1;
    openPages(D.MAIN.talks.netAfter, '收下证词', function () {
      gToast('证词 +1');
      chapterEnd(2);
    });
  }

  /* 正篇地点分流（井拾卷 / 家守夜 / 镇公所雾动 / 长椅灯婶 / 钟楼三役） */
  function mainEchoPanel(it) {
    var F = S.mainFlags;
    var btns = [{ action: 'close', label: '离开' }];
    var h;
    if (it.id === 'well') {
      if (S.chapter === 2 && !F.scrap1) {
        btns.unshift({ action: 'main:scrap', label: '翻查井沿的缺角', cls: 'gold' });
        openModal('echo', it.name, '<p>' + it.echo + '</p><p style="color:var(--dim)">（缺角的青苔下，好像压着什么薄薄的东西。）</p>', btns);
        return;
      }
      openModal('echo', it.name, '<p>' + it.echo + '</p>', btns);
      return;
    }
    if (it.id === 'home') {
      if (S.chapter === 3 && !F.ch5done) {
        btns.unshift({ action: 'main:vigil', label: F.vigilSeen ? '再守一夜 · 把歌谣记全' : '今夜守着小满', cls: 'gold' });
        openModal('echo', it.name, '<p>小满睡下了。最近她一入夜就说梦话——梦里全是别人的事，还有一段哼了又哼的调子。</p><p style="color:var(--dim)">（守夜吧。把她的梦话和歌谣，一起记下来。）</p>', btns);
        return;
      }
      openModal('echo', it.name, '<p>妹妹的房间亮着灯。墙下角那排刻痕旁边，多了一行歪歪扭扭的新字：<b>「家」</b>——这次写对了。</p>', btns);
      return;
    }
    if (it.id === 'hall') {
      if (S.chapter === 7 && F.ask7 && !F.fogDone) {
        btns.unshift({ action: 'main:fog', label: '下忘事房看看', cls: 'gold' });
        openModal('echo', it.name, '<p>' + (it.echo || '') + '</p><p style="color:var(--red)">（地下的门缝里，雾正在往外爬。）</p>', btns);
        return;
      }
      openModal('echo', it.name, '<p>' + it.echo + '</p>', btns);
      return;
    }
    if (it.id === 'pew') {
      if (S.chapter === 5 && !F.genealogy) {
        btns.unshift({ action: 'main:genealogy', label: '见晒灯芯的灯婶', cls: 'gold' });
        openModal('echo', it.name, '<p>长椅上摊晒着一排灯芯，油香混着日光。一位妇人背对着你，正在理一卷旧布轴。</p>', btns);
        return;
      }
      openModal('echo', it.name, '<p>灯芯还摊在长椅上晒着。风一过，油香满街。</p>', btns);
      return;
    }
    if (it.id === 'tower') {
      if (S.chapter === 4) {
        if (!F.gearDone) {
          btns.unshift({ action: 'main:gear', label: F.gearSeen ? '再上一次机芯房' : '上去看看机芯', cls: 'gold' });
          h = '<p>二层的门虚掩着，里头传来齿轮停摆的死寂——一百年没走过的钟，在等你。</p>';
        } else if (!F.ledgerDone) {
          btns.unshift({ action: 'main:ledger', label: '再翻忏悔簿', cls: 'gold' });
          h = '<p>机芯走时了。暗抽屉里的忏悔簿还摊在台上——找出被涂改的那一行。</p>';
        } else h = '<p>塔钟走时，稳稳的。忏悔簿收进了你的行囊。</p>';
        openModal('echo', it.name, h, btns);
        return;
      }
      if (S.chapter === 6 && !F.nightDone) {
        btns.unshift({ action: 'main:night', label: F.nightSeen ? '再握一次钟绳' : '握住钟绳', cls: 'gold' });
        openModal('echo', it.name, '<p>夜里的钟楼。钟绳在无风自摆，像有人在雾里等着递绳子。</p><p style="color:var(--dim)">（镇上的钟，又开始数到七就哑了。）</p>', btns);
        return;
      }
      if (S.chapter === 9 && !F.weirDone) {
        btns.unshift({ action: 'main:weir', label: F.weirSeen ? '再下堰去' : '下堰', cls: 'gold' });
        openModal('echo', it.name, '<p>后窗的窄梯露了出来，一直通进雾底。堰在下面——名签的空位，也在下面。</p>', btns);
        return;
      }
      openModal('echo', it.name, '<p>塔钟走时，稳稳的。雾绕着塔尖打转。</p>', btns);
      return;
    }
    openModal('echo', it.name, '<p>' + (it.echo || '……') + '</p>', btns);
  }

  /* 正篇流程链：守夜 / 机芯 / 那一夜 / 上堰 / 催当帖 */
  function mainVigil() {
    var F = S.mainFlags;
    if (!F.vigilSeen) {
      F.vigilSeen = 1;
      openPages(D.MAIN.talks.vigil.slice(0, 5), '灯花跳了跳', function () { openMini('tones', 'vigil', mainVigilWin); });
    } else {
      openMini('tones', 'vigil', mainVigilWin);
    }
  }
  function mainVigilWin() {
    openPages(D.MAIN.talks.vigil.slice(5), '天亮了', function () {
      S.mainFlags.ch5done = 1;
      gToast('梦话与歌谣，都记下了');
      S.memDirty = true;
    });
  }
  function mainGear() {
    var F = S.mainFlags;
    if (!F.gearSeen) {
      F.gearSeen = 1;
      openPages(D.MAIN.talks.gearIntro, '上手', function () { openMini('dial', null, mainGearWin); });
    } else {
      openMini('dial', null, mainGearWin);
    }
  }
  function mainGearWin() {
    openPages(D.MAIN.talks.gearWin, '抽出忏悔簿', function () { openMini('ledger', null, mainLedgerWin); });
  }
  function mainLedgerWin() {
    openPages(D.MAIN.talks.ledgerWin, '收好簿子', function () {
      S.mainFlags.ledgerDone = 1;
      S.memDirty = true;
      chapterEnd(4);
    });
  }
  function mainNight() {
    var F = S.mainFlags;
    if (!F.nightSeen) {
      F.nightSeen = 1;
      openPages(D.MAIN.talks.nightEnter, '握住钟绳', function () { openMini('bells', null, mainNightWin); });
    } else {
      openMini('bells', null, mainNightWin);
    }
  }
  function mainNightWin() {
    openPages(D.MAIN.talks.nightAfter, '回到天亮前', function () {
      S.mainFlags.nightDone = 1;
      S.memDirty = true;
      chapterEnd(6);
    });
  }
  function mainWeir() {
    var F = S.mainFlags;
    if (!F.weirSeen) {
      F.weirSeen = 1;
      openPages(D.MAIN.talks.weirUp, '开口跟唱', function () { openMini('tones', 'seventh', mainWeirWin); });
    } else {
      openMini('tones', 'seventh', mainWeirWin);
    }
  }
  function mainWeirWin() {
    openPages(D.MAIN.talks.threeWords, '收好契约正本', function () {
      S.mainFlags.weirDone = 1;
      S.memDirty = true;
      chapterEnd(9);
    });
  }
  function mainPluto2() {
    openPages(D.MAIN.talks.pluto2, '拿起笔', function () {
      S.mainFlags.ch5pluto = 1;
      S.memDirty = true;
      openModal('final', '催当帖 · 签还是不签',
        '<p>契纸摊在告示牌上，签名的空栏空着。风一吹，纸角拍打着木板，像催促。</p>',
        [
          { action: 'main:refuse', label: '把笔搁回去 <span class="sub">这镇上的东西，不归他卖</span>', cls: 'gold' },
          { action: 'main:sign', label: '签下去 <span class="sub">拿全镇换安稳 · 影响终章</span>' }
        ]);
    });
  }
  function mainGenealogyDone() {
    S.mainFlags.genealogy = 1;
    S.testimony += 1;
    gToast('证词 +1 · 灯匠家谱入手');
    S.memDirty = true;
  }

  /* 正篇逐帧：断片事件（第2章） */
  function mainTick(dt) {
    if (S.mode !== 'main' || S.phase !== 'play') return;
    S.mainT += dt;
    if (S.chapter === 1 && S.mainFlags.ask1 && !S.mainFlags.blackout1 && !S.mainFlags.ask2 && S.mainT > 12 && !S.modal) {
      S.mainFlags.blackout1 = 1;
      S.interest = Math.min(100, S.interest + 10);
      window.SFX.wrong();
      gToast('你回过神来——人站在巷口，手里多了一枚当金。');
      addLog('你断片了一小会儿。手里多了一枚不记得来历的当金——老板说，那是<b>利息</b>。', 'sys');
      S.memDirty = true;
    }
  }

  /* ---------- 小游戏（正篇 · 难，但公平：失手添息，可无限重试） ---------- */

  function miniAddInterest(cost, why) {
    cost = cost || 5;
    S.interest = Math.min(100, S.interest + cost);
    window.SFX.wrong();
    gToast(why + '——账上添息 +' + cost + '%');
    addLog('失手：' + why + '。当铺的账上，又添了一笔利息（+' + cost + '%）。', 'sys');
  }

  function openMini(key, cfgKey, onWin) {
    var def = MINIS[key];
    if (!def || !S || S.phase !== 'play') return;
    var prev = S.mini;
    S.mini = {
      key: key,
      cfgKey: cfgKey || (prev && prev.key === key ? prev.cfgKey : null),
      onWin: onWin || (prev && prev.key === key ? prev.onWin : null),
      t: 0
    };
    def.start(S.mini);
    openModal('mini', def.title, '<div id="mini-stage"></div>', def.buttons());
    def.render(S.mini);
    window.SFX.open();
  }

  function miniWin() {
    var m = S.mini;
    if (!m) return;
    S.mini = null;
    var cb = m.onWin;
    closeModal();
    window.SFX.coin();
    if (cb) cb();
  }

  function miniFailStop(cost, why) {
    var m = S.mini, def = MINIS[m.key];
    miniAddInterest(cost, why);
    m.failed = true;
    openModal('mini', def.title + ' · 失手',
      '<p>' + why + '。</p><p style="color:var(--dim)">账上添息 +' + cost + '%。别慌——雾季不等人，账也不等人，再来。</p>',
      [{ action: 'mini:retry', label: '再试一次', cls: 'gold' }, { action: 'mini:quit', label: '先放一放' }]);
  }

  function miniTick(dt) {
    if (!S.mini || S.phase !== 'play') return;
    var def = MINIS[S.mini.key];
    if (!def) return;
    S.mini.t += dt;
    def.tick(S.mini, dt);
    def.render(S.mini);
  }

  function miniInfo() {
    if (!S.mini) return null;
    var m = S.mini, o = { key: m.key, t: Math.round(m.t * 1000) / 1000 };
    if (m.key === 'tones') { o.phase = m.phase; o.round = m.round; o.cfgKey = m.cfgKey; o.seq = m.cfg.rounds[Math.min(m.round, m.cfg.rounds.length - 1)]; o.inIdx = m.inIdx; }
    if (m.key === 'dial') { o.stage = m.stage; o.ang = Math.round(m.ang * 1000) / 1000; o.win = D.MAIN.minis.dial.stages[m.stage]; }
    if (m.key === 'bells') { o.round = m.round; o.misses = m.misses; o.notes = m.ns; }
    if (m.key === 'ledger') { o.wrong = m.wrong; o.hintN = m.hintN; o.answer = m.case ? m.case.answer : -1; o.rows = m.case ? m.case.entries.length : 0; }
    return o;
  }

  var MINIS = {
    /* 音序记忆：跟着明灭把歌谣记全（守夜 / 上堰） */
    tones: {
      title: '灯芯歌谣',
      start: function (m) {
        m.cfg = D.MAIN.minis.tones.cfgs[m.cfgKey || 'vigil'];
        m.round = 0; m.phase = 'pre'; m.preT = 1.0;
        m.showIdx = -1; m.showT = 0; m.inIdx = 0; m.flash = null;
      },
      buttons: function () { return [{ action: 'mini:quit', label: '不记了' }]; },
      tick: function (m, dt) {
        if (m.failed) return;
        if (m.flash && m.t > m.flash.until) m.flash = null;
        if (m.phase === 'pre') {
          m.preT -= dt;
          if (m.preT <= 0) { m.phase = 'show'; m.showIdx = -1; m.showT = 0.4; }
        } else if (m.phase === 'show') {
          m.showT -= dt;
          if (m.showT <= 0) {
            m.showIdx++;
            if (m.showIdx >= m.cfg.rounds[m.round].length) { m.phase = 'input'; m.inIdx = 0; }
            else m.showT = m.cfg.step;
          }
        }
      },
      act: function (m, a) {
        if (a.indexOf('pad:') !== 0 || m.phase !== 'input') return;
        var i = parseInt(a.slice(4), 10);
        var seq = m.cfg.rounds[m.round];
        m.flash = { i: i, until: m.t + 0.18 };
        if (seq[m.inIdx] === i) {
          m.inIdx++;
          if (m.inIdx >= seq.length) {
            m.round++;
            if (m.round >= m.cfg.rounds.length) { miniWin(); return; }
            m.phase = 'pre'; m.preT = 0.8;
          }
        } else {
          miniFailStop(5, '第' + (m.round + 1) + '段第' + (m.inIdx + 1) + '个音，记岔了');
        }
      },
      render: function (m) {
        var el = document.getElementById('mini-stage');
        if (!el) return;
        var T = D.MAIN.minis.tones;
        var lit = -1;
        if (m.phase === 'show' && m.showIdx >= 0 && m.showT > 0.12) lit = m.cfg.rounds[m.round][m.showIdx];
        if (m.flash) lit = m.flash.i;
        /* 音板是"要点的东西"：建一次就不再重建。
           每帧整块 innerHTML 重建会在按下与抬起之间换掉节点 → 浏览器不派发 click → 吞掉一次敲击。 */
        if (!m.drawn) {
          var h = '<div class="mini-hint">' + (m.cfgKey === 'seventh'
            ? '她的钟缺第七个音。跟着拍子，把哑掉的那个音也唱全——错一个，从头再来。'
            : '跟着灯火的明灭，把小满梦里哼的歌谣记全——错一个音，从头再来。') +
            '</div><div class="mini-progress" id="tone-prog"></div><div class="tone-row">';
          for (var i = 0; i < T.pads.length; i++) {
            h += '<button class="tone-pad" style="background:' + T.padColors[i] + '" data-action="mini:pad:' + i + '">' + T.pads[i] + '</button>';
          }
          h += '</div>';
          el.innerHTML = h;
          m.drawn = true;
        }
        var prog = document.getElementById('tone-prog');
        if (prog) {
          prog.innerHTML = '段 ' + (m.round + 1) + ' / ' + m.cfg.rounds.length +
            (m.phase === 'input' ? ' · <b>该你了</b>' : ' · 听着');
        }
        var pads = el.querySelectorAll('.tone-pad');
        for (var k = 0; k < pads.length; k++) {
          if (k === lit) { if (!pads[k].classList.contains('lit')) pads[k].classList.add('lit'); }
          else if (pads[k].classList.contains('lit')) pads[k].classList.remove('lit');
        }
      }
    },
    /* 机芯校准：指针进金框按下去，四段全中（钟楼二层） */
    dial: {
      title: '塔钟机芯 · 校准',
      useKey: true,
      start: function (m) { m.stage = 0; m.ang = 0; },
      buttons: function () { return [{ action: 'mini:hit', label: '● 校准（E）', cls: 'gold' }, { action: 'mini:quit', label: '不修了' }]; },
      tick: function (m, dt) {
        if (m.failed) return;
        m.ang = (m.ang + D.MAIN.minis.dial.stages[m.stage].speed * dt) % 360;
      },
      act: function (m, a) {
        if (a !== 'hit' || m.failed) return;
        var st = D.MAIN.minis.dial.stages[m.stage];
        if (m.ang >= st.from && m.ang <= st.to) {
          m.stage++;
          if (m.stage >= D.MAIN.minis.dial.stages.length) { miniWin(); return; }
          m.ang = 0;
        } else {
          miniFailStop(5, '第' + (m.stage + 1) + '段校准，按偏了');
        }
      },
      render: function (m) {
        var el = document.getElementById('mini-stage');
        if (!el) return;
        var st = D.MAIN.minis.dial.stages[m.stage];
        var cx = 230, cy = 105, R = 78;
        function pt(deg) {
          var r = (deg - 90) * Math.PI / 180;
          return (cx + R * Math.cos(r)).toFixed(1) + ',' + (cy + R * Math.sin(r)).toFixed(1);
        }
        var large = (st.to - st.from) > 180 ? 1 : 0;
        var nr = (m.ang - 90) * Math.PI / 180;
        var nx = cx + (R - 10) * Math.cos(nr), ny = cy + (R - 10) * Math.sin(nr);
        var pips = '';
        for (var i = 0; i < 4; i++) pips += '<circle cx="' + (cx - 27 + i * 18) + '" cy="16" r="4" fill="' + (i < m.stage ? '#e8b74a' : '#3a3454') + '"/>';
        el.innerHTML =
          '<div class="mini-hint">指针扫进<b style="color:var(--gold2)">金框</b>的瞬间按下校准——四段全部进框，机芯才算走。越往后越快、框越窄。</div>' +
          '<svg class="mini-dial" width="460" height="190" viewBox="0 0 460 190">' +
          '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="none" stroke="#2c2748" stroke-width="14"/>' +
          '<path d="M ' + pt(st.from) + ' A ' + R + ' ' + R + ' 0 ' + large + ' 1 ' + pt(st.to) + '" fill="none" stroke="#e8b74a" stroke-width="14"/>' +
          pips +
          '<line x1="' + cx + '" y1="' + cy + '" x2="' + nx.toFixed(1) + '" y2="' + ny.toFixed(1) + '" stroke="#ff7a5c" stroke-width="3" stroke-linecap="round"/>' +
          '<circle cx="' + cx + '" cy="' + cy + '" r="5" fill="#cfc6f2"/>' +
          '</svg><div class="mini-progress">第 ' + (m.stage + 1) + ' / 4 段 · 指针 ' + Math.round(m.ang) + '°</div>';
      }
    },
    /* 敲钟节拍：圈滑到钟线按下，三长两短加变奏，失误上限 2（那一夜） */
    bells: {
      title: '守夜的钟 · 三长两短',
      useKey: true,
      start: function (m) {
        m.round = 0; m.misses = 0; m.flash = null;
        m.ns = D.MAIN.minis.bells.rounds[0].map(function (n) { return { t: n.t, L: !!n.L, hit: 0, missed: 0 }; });
        m.t = -0.9;
      },
      buttons: function () { return [{ action: 'mini:hit', label: '● 敲钟（E）', cls: 'gold' }, { action: 'mini:quit', label: '放下钟绳' }]; },
      tick: function (m, dt) {
        if (m.failed) return;
        var B = D.MAIN.minis.bells;
        m.t += dt;
        if (m.flash && m.t > m.flash.until) m.flash = null;
        var done = true;
        var i, n;
        for (i = 0; i < m.ns.length; i++) {
          n = m.ns[i];
          if (!n.hit && !n.missed && m.t > n.t + (n.L ? B.longLate : B.hitLate)) {
            n.missed = 1; m.misses++;
            m.flash = { msg: '漏了一记', until: m.t + 0.5 };
          }
          if (!n.hit && !n.missed) done = false;
        }
        if (m.misses > B.maxMiss) { miniFailStop(B.failCost, '漏错太多（已错 ' + m.misses + ' 记）'); return; }
        if (done && m.ns.length && m.t > m.ns[m.ns.length - 1].t + 0.4) {
          m.round++;
          if (m.round >= B.rounds.length) { miniWin(); return; }
          m.ns = B.rounds[m.round].map(function (n2) { return { t: n2.t, L: !!n2.L, hit: 0, missed: 0 }; });
          m.t = -0.9;
        }
      },
      act: function (m, a) {
        if (a !== 'hit' || m.failed) return;
        var B = D.MAIN.minis.bells;
        var best = -1, bestDt = 1e9;
        for (var i = 0; i < m.ns.length; i++) {
          var n = m.ns[i];
          if (n.hit || n.missed) continue;
          var dt = n.t - m.t;
          var wE = n.L ? B.longEarly : B.hitEarly, wL = n.L ? B.longLate : B.hitLate;
          if (dt <= wE && -dt <= wL && Math.abs(dt) < Math.abs(bestDt)) { best = i; bestDt = dt; }
        }
        if (best >= 0) {
          m.ns[best].hit = 1;
          window.SFX.bell();
        } else {
          m.misses++;
          m.flash = { msg: '空击', until: m.t + 0.4 };
        }
      },
      render: function (m) {
        var el = document.getElementById('mini-stage');
        if (!el) return;
        var B = D.MAIN.minis.bells;
        var laneW = 460, strikeX = 60;
        var circles = '';
        for (var i = 0; i < m.ns.length; i++) {
          var n = m.ns[i];
          var x = strikeX + (n.t - m.t) * B.speedPx;
          if (x < -20 || x > laneW + 20) continue;
          var r = n.L ? 13 : 8;
          var fill = n.hit ? '#7ed8a0' : (n.missed ? '#c85a4a' : (n.L ? '#e8b74a' : '#cfc6f2'));
          circles += '<circle cx="' + x.toFixed(1) + '" cy="86" r="' + r + '" fill="' + fill + '" opacity="' + (n.hit || n.missed ? 0.45 : 1) + '"/>';
        }
        el.innerHTML =
          '<div class="mini-hint">圆圈滑到左侧钟线时按下（<b>E / 空格 / 点按钮</b>）：大圈长音，小圈短音。漏错超过 ' + B.maxMiss + ' 记就散架——空击也算错。</div>' +
          '<svg class="mini-dial" width="460" height="150" viewBox="0 0 460 150">' +
          '<rect x="0" y="20" width="460" height="110" fill="none" stroke="#2c2748"/>' +
          '<line x1="' + strikeX + '" y1="20" x2="' + strikeX + '" y2="130" stroke="#e8b74a" stroke-width="3"/>' +
          circles + '</svg>' +
          '<div class="mini-progress">段 ' + (m.round + 1) + ' / 3 · 失误 ' + m.misses + ' / ' + (B.maxMiss + 1) +
          (m.flash ? ' · <b style="color:var(--red)">' + m.flash.msg + '</b>' : '') + '</div>';
      }
    },
    /* 忏悔簿对账：五笔大当里找出被涂改的一行（钟楼二层） */
    ledger: {
      title: '忏悔簿 · 对账',
      /* v22：每开一次簿子现生成一局 —— 唯一解可证、幌子随机、答案不再背下来 */
      start: function (m) {
        m.wrong = {};
        m.hintN = 0;
        m.dirty = true;
        m.case = D.makeLedger() || D.LEDGER_FALLBACK;
      },
      buttons: function () { return [{ action: 'mini:quit', label: '合上簿子' }]; },
      /* 对账是纯点击推理，没有动画帧——但 miniTick 每帧都会调 def.tick：
         少这一个空函数，主循环会在 gTick 里抛异常、gRender 再也执行不到，
         面板看着就是"点了没反应"（v21 及之前的真故障，v22 修）。 */
      tick: function () {},
      act: function (m, a) {
        if (a.indexOf('pick:') !== 0 || m.failed || !m.case) return;
        var i = parseInt(a.slice(5), 10);
        var cfg = m.case;
        if (i === cfg.answer) { miniWin(); return; }
        if (!m.wrong[i]) {
          m.wrong[i] = cfg.entries[i].viol.slice();
          miniAddInterest(D.MAIN.minis.ledger.failCost, '批注对不上——这一行不是漏洞');
          m.hintN = Math.min(cfg.hints.length, m.hintN + 1);
          m.dirty = true;
        }
      },
      render: function (m) {
        var el = document.getElementById('mini-stage');
        if (!el || !m.case) return;
        /* 只在状态变了才重建：账目行是"要点的东西"，每帧重建会被浏览器吞掉点击 */
        if (!m.dirty) return;
        m.dirty = false;
        var cfg = m.case, RULE_CN = ['批注一', '批注二', '批注三', '批注四', '批注五'];
        var h = '<div class="mini-hint">' + cfg.intro + '</div><div class="mini-clues">';
        var i;
        for (i = 0; i < cfg.clues.length; i++) h += '<div class="mini-clue">' + cfg.clues[i] + '</div>';
        h += '</div><div class="ledger-rows">';
        for (i = 0; i < cfg.entries.length; i++) {
          var e = cfg.entries[i], w = m.wrong[i];
          h += '<button class="ledger-row' + (w ? ' wrong' : '') + '" data-action="mini:pick:' + i + '">' +
            '<b>' + e.name + '</b><span>' + e.item + ' · ' + e.term + ' · ' + e.back + '</span><i>' + e.note + '</i></button>';
          if (w) {
            var labels = w.map(function (k) { return RULE_CN[k]; }).join('、');
            h += '<div class="ledger-note">' + (w.length
              ? '✗ 这一行只犯了 ' + labels + '——不是漏洞。'
              : '✓ 这一行一条批注都没犯——干净，但也不是漏洞。') + '</div>';
          }
        }
        h += '</div>';
        for (i = 0; i < m.hintN; i++) h += '<div class="mini-clue hint">' + cfg.hints[i] + '</div>';
        h += '<div style="color:var(--dim);font-size:12px;margin-top:6px">点出<b style="color:var(--red)">同时违反两条批注</b>的那一行。每点错一次，账上添息 +' +
             D.MAIN.minis.ledger.failCost + '%，并多露一条提示。</div>';
        el.innerHTML = h;
      }
    }
  };

  /* ---------- 结局 ---------- */

  var ENDING_SFX = { true_end: 'end', half: 'endSad', blank: 'blank', keeper: 'end' };
  var ENDING_NAMES = {
    true_end: '雾散', half: '一半的我', blank: '空白之人', keeper: '守灯人',
    mtrue: '灯再亮', mhalf: '整镇的一半', mblank: '空账', mkeep: '接柜'
  };

  function endGame(type) {
    if (S.phase !== 'play') return;
    S.phase = 'over';
    S.ended = type;
    gMarkArch('end_' + type);
    S.dialogQ = null;
    S.scene = 'town';
    closeModal();
    updateMusic(); /* 结局页停 BGM（结局本身有专属音效） */
    clearSave(); /* 一局结束，进度档清掉（结局收集单独保存） */
    var cfg = D.CHAT.endings[type];
    var lost = D.lostCountOf(S);
    var text = cfg.text.replace('{LOST}', String(lost));
    endNameEl.textContent = cfg.name;
    endTextEl.innerHTML = D.resolveText(text, S);
    var got = gLoadEndings();
    var isNew = got.indexOf(type) < 0;
    if (isNew) { got.push(type); gSaveEndings(got); }
    var names = ENDING_NAMES;
    var gotNames = got.map(function (g) { return names[g] || g; }).join(' / ');
    endStatsEl.textContent = '断当 ' + lost + ' 段 · 完整度 ' + Math.round(D.integrityOf(S) * 100) + '%' +
      (isNew ? ' · 新结局！' : '') + ' · 已解锁：' + gotNames;
    if (btnMainEl) btnMainEl.style.display = (type === 'true_end') ? '' : 'none';
    endModalEl.classList.add('show');
    window.SFX[ENDING_SFX[type]]();
  }

  /* 正篇结局：终章抉择后结算（结局计入同一份收集） */
  function mainEnd(type) {
    if (!D.MAIN.endings[type] || S.phase !== 'play') return;
    S.phase = 'over';
    S.ended = type;
    gMarkArch('end_' + type);
    S.dialogQ = null;
    S.scene = 'town';
    S.mini = null;
    closeModal();
    clearSave();
    var cfg = D.MAIN.endings[type];
    endNameEl.textContent = cfg.name;
    endTextEl.innerHTML = cfg.epitaph;
    var got = gLoadEndings();
    var isNew = got.indexOf(type) < 0;
    if (isNew) { got.push(type); gSaveEndings(got); }
    var gotNames = got.map(function (g) { return ENDING_NAMES[g] || g; }).join(' / ');
    endStatsEl.textContent = '利息 ' + S.interest + '% · 证词 ' + S.testimony + ' 件' +
      (isNew ? ' · 新结局！' : '') + ' · 已解锁：' + gotNames;
    if (btnMainEl) btnMainEl.style.display = 'none';
    endModalEl.classList.add('show');
    window.SFX[MAIN_END_SFX[type]]();
  }

  /* ---------- 主循环 ---------- */

  /* 长按移动：自建按住状态，主循环每帧轮询续步（不依赖系统按键重复，消除"先卡一下"） */
  var heldDirs = [];
  var DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  function keyDirOf(k) {
    if (k === 'w' || k === 'W' || k === 'ArrowUp') return 'up';
    if (k === 's' || k === 'S' || k === 'ArrowDown') return 'down';
    if (k === 'a' || k === 'A' || k === 'ArrowLeft') return 'left';
    if (k === 'd' || k === 'D' || k === 'ArrowRight') return 'right';
    return null;
  }

  function tryMove(dx, dy) {
    if (!S || S.phase !== 'play' || S.modal) return;
    if (S.moveT > 0) return;
    var nx = S.px + dx, ny = S.py + dy;
    if (dx < 0) S.facing = 3; else if (dx > 0) S.facing = 1;
    if (dy < 0) S.facing = 0; else if (dy > 0) S.facing = 2;
    if (nx < 0 || ny < 0 || nx >= CFG.GRID_W || ny >= CFG.GRID_H) return;
    if (!DEV.clip && D.isSolid(nx, ny)) return;
    S.tx = nx; S.ty = ny;
    S.moveT = 0.0001;
  }

  function gInteract() {
    if (!S || S.phase !== 'play') return;
    if (S.modal) { closeModal(); return; }
    var it = findNearestIt();
    if (it) {
      window.SFX.select();
      openEvent(it);
    } else {
      gToast('这里没什么可互动的。走近一点试试。');
    }
  }

  function gTick(dt) {
    if (!S || S.phase !== 'play') return;
    S.t += dt;
    mainTick(dt);
    miniTick(dt);

    if (S.moveT > 0) {
      S.moveT += dt / (CFG.MOVE_SECONDS / (DEV.speed || 1));
      if (S.moveT >= 1) { S.px = S.tx; S.py = S.ty; S.moveT = 0; }
    }
    /* 长按续步：本帧刚走完一步且方向键仍按住 → 立刻接下一步，零停顿 */
    if (S.moveT === 0 && heldDirs.length && !S.modal) {
      var hd = heldDirs[heldDirs.length - 1];
      tryMove(DIRV[hd][0], DIRV[hd][1]);
    }

    /* DEV 时间冻结：让所有在当记忆的 pawnedAt 跟着时间一起走 → 倒计时定格、永不超期 */
    if (DEV.freeze) {
      for (var fz = 0; fz < D.MEMORIES.length; fz++) {
        var fst = S.mem[D.MEMORIES[fz].id];
        if (fst.state === 'pawned') fst.pawnedAt += dt;
      }
    }

    for (var i = 0; i < D.MEMORIES.length; i++) {
      var m = D.MEMORIES[i];
      var st = S.mem[m.id];
      if (st.state === 'pawned' && S.t - st.pawnedAt >= CFG.REDEEM_SECONDS) {
        st.state = 'lost';
        addLog(D.CHAT.lapse.replace('{ID}', m.id), 'bad');
        window.SFX.lapse();
        gToast('「' + D.blackout(m.text).slice(0, 6) + '…」断当了。');
        S.memDirty = true;
        if (S.modal && (S.modal.kind === 'redeem' || S.modal.kind === 'pawn' || S.modal.kind === 'shop')) {
          if (S.modal.kind === 'redeem') redeemPanel();
        }
      }
    }

    var d = D.derived(S);
    if (d.blankNow) {
      if (!S.warnPlayed && d.integrity < CFG.BLANK_WARN) {
        S.warnPlayed = true;
        window.SFX.warn();
        gToast('你觉得自己……好像少了很多。');
      }
      endGame('blank');
      return;
    }

    S.hudT += dt;
    if (S.hudT >= 0.1) {
      S.hudT = 0;
      gRenderHUD();
      var anyDirty = S.logDirty || S.memDirty;
      if (S.logDirty) { renderLog(); S.logDirty = false; }
      if (S.memDirty) { renderMemPane(); renderTicketPane(); S.memDirty = false; }
      if (anyDirty) renderStoryPane();
      updateRedeemCds();
    }

    S.saveT += dt;
    if (S.saveT >= 1) { S.saveT = 0; saveGame(); }
  }

  function updateRedeemCds() {
    var cds = document.querySelectorAll('.cd[data-cd]');
    for (var i = 0; i < cds.length; i++) {
      var id = cds[i].getAttribute('data-cd');
      var st = S.mem[id];
      if (st && st.state === 'pawned') {
        cds[i].textContent = '剩余 ' + fmtTime(CFG.REDEEM_SECONDS - (S.t - st.pawnedAt));
      }
    }
  }

  /* ---------- 面板渲染 ---------- */

  function renderLog() {
    var html = '';
    for (var i = S.log.length - 1; i >= 0; i--) {
      var l = S.log[i];
      html += '<div class="log-line' + (l.kind === 'sys' ? ' sys' : '') + '"><span class="lt">' +
              String(i + 1) + '</span>' + D.resolveText(l.raw, S) + '</div>';
    }
    paneLogEl.innerHTML = html || '<div class="empty-tip">还没有记忆被写下。</div>';
  }

  function renderMemPane() {
    var html = '';
    for (var i = 0; i < D.MEMORIES.length; i++) {
      var m = D.MEMORIES[i];
      var st = S.mem[m.id].state;
      var cls = st === 'held' ? '' : (st === 'pawned' ? ' pawned' : ' lost');
      var extra = '';
      if (st === 'pawned') {
        extra = '<div class="cd" data-cd="' + m.id + '">赎回期剩余 ' +
                fmtTime(CFG.REDEEM_SECONDS - (S.t - S.mem[m.id].pawnedAt)) + '</div>';
      } else if (st === 'lost') {
        extra = '<div class="cd">已断当 · 永远散进雾里</div>';
      }
      html += '<div class="mem-card' + cls + '"><span class="m-val">' + m.w + '◆</span>' +
              '<span class="m-tag">' + m.tag + '</span>' + D.resolveText('{{mem:' + m.id + '}}', S) + extra + '</div>';
    }
    paneMemEl.innerHTML = html;
  }

  function renderTicketPane() {
    var html = '';
    var any = false;
    for (var i = 0; i < D.SHOP.length; i++) {
      var g = D.SHOP[i];
      if (S.items[g.id]) {
        any = true;
        html += '<div class="ticket-card"><span class="tk-ico">' + g.ico + '</span>' +
                '<span class="tk-b"><b>' + g.name + '</b><i>' + g.desc + '</i></span></div>';
      }
    }
    var rel = '';
    rel += '<div style="margin-top:6px;font-size:12px;color:var(--dim)">信物：' +
           (S.relics.photo ? '<span style="color:var(--gold2)">半张照片</span>' : '▢') + ' ' +
           (S.relics.watch ? '<span style="color:var(--gold2)">旧怀表</span>' : '▢') + ' ' +
           (S.relics.ribbon ? '<span style="color:var(--gold2)">她的发绳</span>' : '▢') + '</div>';
    paneTicketEl.innerHTML = (any ? html : '<div class="empty-tip">行囊空空。当金可以在当铺柜台换成当票。</div>') + rel;
  }

  function goalText() {
    if (!S) return '';
    if (S.mode === 'main') {
      var F = S.mainFlags;
      var ap = actLabel(curAct());
      if (S.chapter === 1) {
        if (!F.ask1) return ap + ' · 回当铺，问清门缝与旧账';
        if (!F.blackout1) return ap + ' · ……等雾再浓一点（在镇上走一走）';
        return ap + ' · 把失漏摆上柜台';
      }
      if (S.chapter === 2) {
        if (!F.ch3met) return ap + ' · 镇公所找档案员';
        if (!F.archDone) return ap + ' · 找三卷烧剩的账（井 / 渔夫 / 教堂）';
        return ap + ' · 码头帮渔夫收网';
      }
      if (S.chapter === 3) {
        if (!F.ch5done) return ap + ' · 回家守夜，记下梦话与歌谣';
        if (!F.ch6pluto) return ap + ' · 镇中心，会会白日当铺';
        return ap + ' · 回当铺给老板看契纸';
      }
      if (S.chapter === 4) {
        if (!F.gearDone) return ap + ' · 钟楼二层，校准塔钟机芯';
        return ap + ' · 忏悔簿里找出被涂改的那一行';
      }
      if (S.chapter === 5) {
        if (!F.genealogy) return ap + ' · 教堂边问灯婶';
        if (!F.ch5pluto) return ap + ' · 告示牌前再见白老板';
        return ap + ' · 做出你的回答';
      }
      var mc = D.MAIN.chapters[S.chapter];
      return mc ? (ap + ' · ' + mc.goal) : '……';
    }
    if (S.story === 'act1') {
      var n = D.relicCountOf(S);
      return n >= 3 ? '回当铺 · 谈谈妹妹' : '找回三样旧物（信物 ' + n + '/3）';
    }
    if (S.story === 'act2') {
      var p = D.pagesCountOf(S);
      return p >= 5 ? '回当铺 · 谈谈日记' : '找回她写的日记（' + p + '/5）';
    }
    return '去雾巷深处 · 推开雾门';
  }

  function gRenderHUD() {
    var d = D.derived(S);
    hudGoldEl.textContent = d.gold;
    if (hudGoalEl && hudGoalEl.textContent !== goalText()) hudGoalEl.textContent = goalText();
    if (hudMainEl) {
      var isMain = S.mode === 'main';
      hudMainEl.style.display = isMain ? '' : 'none';
      if (isMain) {
        hudInterestEl.textContent = S.interest + '%';
        var dl = mainDaysLeft();
        hudDaysEl.textContent = dl === 0 ? '今夜' : ('剩 ' + dl + ' 天');
        hudTestimonyEl.textContent = S.testimony;
      }
    }
    var pct = Math.round(d.integrity * 100);
    hudIntegEl.style.width = pct + '%';
    hudIntegEl.className = pct < 35 ? 'bad' : (pct < 55 ? 'warn' : '');
    hudRedeemEl.textContent = d.earliestRedeem >= 0 ? fmtTime(d.earliestRedeem) : '--:--';
    var r = '';
    r += '<span class="' + (S.relics.photo ? 'got' : 'no') + '">▣</span>';
    r += '<span class="' + (S.relics.watch ? 'got' : 'no') + '">◉</span>';
    r += '<span class="' + (S.relics.ribbon ? 'got' : 'no') + '">✿</span>';
    relicsEl.innerHTML = r;
    var tips = document.getElementById('footer-tips');
    if (d.integrity < CFG.BLANK_WARN) {
      tips.innerHTML = '<span class="blk">■■■ / 方向键 ■■ · ■ 互动 · ■■「■■■■■」前，先去把■■的记忆■掉</span>';
    }
  }

  function switchTab(name) {
    S.tabs = name;
    tabLogEl.className = name === 'log' ? 'on' : '';
    tabStoryEl.className = name === 'story' ? 'on' : '';
    tabMemEl.className = name === 'mem' ? 'on' : '';
    tabTicketEl.className = name === 'ticket' ? 'on' : '';
    paneLogEl.className = 'pane' + (name === 'log' ? ' on' : '');
    paneStoryEl.className = 'pane' + (name === 'story' ? ' on' : '');
    paneMemEl.className = 'pane' + (name === 'mem' ? ' on' : '');
    paneTicketEl.className = 'pane' + (name === 'ticket' ? ' on' : '');
  }

  /* ---------- 剧情回顾：已看章节目录 ---------- */

  function strPages(t, arr) {
    var out = [];
    for (var i = 0; i < arr.length; i++) out.push({ t: t, h: arr[i] });
    return out;
  }

  function quizArchList() {
    var num = ['一', '二', '三'];
    var out = [];
    for (var i = 0; i < D.CHAT.story.quiz.length; i++) {
      var q = D.CHAT.story.quiz[i];
      out.push({
        t: '第' + num[i] + '句',
        h: q.q + '<br><br><b style="color:var(--gold2)">答：' + q.opts[q.right] + '</b><br>' +
           '<span style="color:var(--dim)">' + D.CHAT.story.quizRight[i] + '</span>'
      });
    }
    return out;
  }

  var ARCH = [
    { key: 'intro', title: '开场 · 第七夜的雾', list: strPages('雾水镇', D.CHAT.intro) },
    { key: 'act2open', title: '里屋 · 她留下的字条', list: D.CHAT.story.act2Open },
    { key: 'relic_photo', title: '信物 · 半张照片', list: [{ t: '教堂侧门', h: D.CHAT.key.open }] },
    { key: 'relic_watch', title: '信物 · 停走的怀表', list: [{ t: '钟塔 · 老面板', h: D.CHAT.riddle.right }] },
    { key: 'relic_ribbon', title: '信物 · 她的发绳', list: [{ t: '码头闸门 · 暗号', h: D.CHAT.code.right }] },
    { key: 'wine', title: '陈酒 · 「等好日子」', list: [{ t: '仓库地板', h: D.CHAT.story.crateBody }] },
    { key: 'diary_p1', title: '日记 · 第一页（家）', list: [{ t: '她的字 · ' + D.CHAT.story.pages.p1.from, h: D.CHAT.story.pages.p1.text }] },
    { key: 'diary_p2', title: '日记 · 第二页（教堂）', list: [{ t: '她的字 · ' + D.CHAT.story.pages.p2.from, h: D.CHAT.story.pages.p2.text }] },
    { key: 'diary_p3', title: '日记 · 第三页（码头）', list: [{ t: '她的字 · ' + D.CHAT.story.pages.p3.from, h: D.CHAT.story.pages.p3.text }] },
    { key: 'diary_p4', title: '日记 · 第四页（井）', list: [{ t: '她的字 · ' + D.CHAT.story.pages.p4.from, h: D.CHAT.story.pages.p4.text }] },
    { key: 'diary_p5', title: '日记 · 第五页（钟塔）', list: [{ t: '她的字 · ' + D.CHAT.story.pages.p5.from, h: D.CHAT.story.pages.p5.text }] },
    { key: 'diarydone', title: '老板 · 钉成账本', list: D.CHAT.story.bossDiaryDone },
    { key: 'gate', title: '雾门 · 推门之后', list: D.CHAT.story.gateOpen.concat(D.CHAT.story.mist) },
    { key: 'quiz', title: '三句话 · 她问的与答案', list: quizArchList() },
    { key: 'quizfail', title: '答错 · 纸船漂走', list: D.CHAT.story.quizFail },
    { key: 'halfgate', title: '断当 · 拼不出来的你', list: D.CHAT.story.gateOpen.concat(D.CHAT.story.halfGate) },
    { key: 'final', title: '最后的选择 · 两个选法', list: D.CHAT.story.final },
    { key: 'pay_take', title: '抉择 · 带她回家', list: D.CHAT.story.takePay },
    { key: 'pay_keep', title: '抉择 · 守灯人', list: D.CHAT.story.keepPay }
  ];

  function openArch(key) {
    if (!S || S.phase !== 'play' || S.modal) return;
    if (key.indexOf('end:') === 0) {
      var ek2 = key.slice(4);
      var pcfg = D.CHAT.endings[ek2];
      if (pcfg) {
        openPages([{ t: '结局 · ' + pcfg.name, h: pcfg.text.replace('{LOST}', String(D.lostCountOf(S))) }], '合上', null);
        return;
      }
      var mcfg = D.MAIN.endings[ek2];
      if (mcfg) openPages([{ t: '结局 · ' + mcfg.name, h: mcfg.epitaph }], '合上', null);
      return;
    }
    if (key.indexOf('mch:') === 0) {
      var an = parseInt(key.slice(4), 10);
      var am = actMeta(an);
      if (!am) return;
      var mPages = [];
      for (var si = am.from; si <= am.to; si++) {
        var sc = D.MAIN.chapters[si];
        if (!sc) continue;
        mPages = mPages.concat(sc.open || [], sc.ask1 || [], sc.ask2 || [], sc.ask || []);
      }
      if (!mPages.length) {
        /* 这一章以交互/小游戏推进，没有独立剧情页：用本章末段的小结做回顾占位 */
        var lastc = D.MAIN.chapters[am.to];
        mPages = [{ t: actLabel(an), h: (lastc && lastc.end) || '（本章以交互推进。）' }];
      }
      openPages(mPages, '合上', null);
      return;
    }
    for (var i = 0; i < ARCH.length; i++) {
      if (ARCH[i].key === key) { openPages(ARCH[i].list, '合上', null); return; }
    }
  }

  /* 补登记：按当前进度与结局收集，把"已经看过但还没记档"的章节补上（老存档立刻生效） */
  function seedArch() {
    gMarkArch('intro');
    if (!S) return;
    if (S.innerOpen || storyNum(S.story) > 1) gMarkArch('act2open');
    if (S.relics.photo) gMarkArch('relic_photo');
    if (S.relics.watch) gMarkArch('relic_watch');
    if (S.relics.ribbon) gMarkArch('relic_ribbon');
    if (S.wine) gMarkArch('wine');
    for (var k in S.pages) if (S.pages[k]) gMarkArch('diary_' + k);
    if (storyNum(S.story) >= 3) {
      gMarkArch('diarydone');
      gMarkArch('gate');
      gMarkArch('quiz');
      gMarkArch('final');
    }
    var got = gLoadEndings();
    for (var i = 0; i < got.length; i++) {
      gMarkArch('end_' + got[i]);
      if (got[i] === 'true_end') gMarkArch('pay_take');
      if (got[i] === 'keeper') gMarkArch('pay_keep');
      if (got[i] === 'half') { gMarkArch('halfgate'); gMarkArch('quizfail'); }
    }
    /* 正篇：按章节（幕）进度与正篇结局补登记（新键 mn_ch = 幕） */
    if (S.mode === 'main') {
      var mi;
      for (mi = 1; mi < curAct() && mi <= 3; mi++) gMarkArch('mn_ch' + mi);
      if (S.mainFlags.ch5done) gMarkArch('mn_ch1');   /* 第一幕末（原第 3 章）打过 */
      if (S.mainFlags.nightDone) gMarkArch('mn_ch2'); /* 第二幕内（原第 6 章）打过 */
      if (S.mainFlags.weirDone) gMarkArch('mn_ch3');  /* 第三幕内（原第 9 章）打过 */
      if (S.mainFlags.signed) gMarkArch('mn_hidden');
      for (i = 0; i < got.length; i++) {
        if (D.MAIN.endings[got[i]]) gMarkArch('end_' + got[i]);
      }
    }
  }

  /* 剧情面板：三幕进度 + 线索回顾，随日志/记忆变化刷新 */
  function renderStoryPane() {
    if (!paneStoryEl || !S) return;
    var actN = storyNum(S.story);
    var h = '';

    /* 剧情回顾：点开重看 */
    var archKeys = gLoadArch();
    var rows = '';
    var ai;
    for (ai = 0; ai < ARCH.length; ai++) {
      if (archKeys.indexOf(ARCH[ai].key) < 0) continue;
      rows += '<button class="arch-btn" data-arch="' + ARCH[ai].key + '">▸ ' + ARCH[ai].title + '</button>';
    }
    var ENAMES = {
      true_end: '结局 · 雾散', keeper: '结局 · 守灯人', half: '结局 · 一半的我', blank: '结局 · 空白之人',
      mtrue: '结局 · 灯再亮', mhalf: '结局 · 整镇的一半', mblank: '结局 · 空账', mkeep: '结局 · 接柜'
    };
    var ek;
    for (ek in ENAMES) {
      if (archKeys.indexOf('end_' + ek) >= 0) rows += '<button class="arch-btn gold" data-arch="end:' + ek + '">▸ ' + ENAMES[ek] + '</button>';
    }
    /* 正篇《雾季十年》章节（新键 mn_ch = 幕：三幕三章 + 隐藏章） */
    var cn2;
    for (cn2 = 1; cn2 <= 4; cn2++) {
      var am2 = actMeta(cn2);
      if (archKeys.indexOf('mn_ch' + cn2) >= 0 && am2) {
        rows += '<button class="arch-btn" data-arch="mch:' + cn2 + '">▸ 正篇 · ' + actLabel(cn2) + '（' + am2.label + '）</button>';
      }
    }
    h += '<div class="mem-card"><span class="m-tag">回顾</span>打过的剧情，点开随时重看：' +
         (rows || '<div style="color:var(--dim);margin-top:3px">还没有记录。推进剧情后，看过的段落会一直留在这里——就算重开一局也不会丢。</div>') + '</div>';

    h += '<div class="mem-card"><span class="m-tag">当前</span>' + goalText() + '</div>';

    var rel = (S.relics.photo ? '<span style="color:var(--gold2)">▣ 照片</span>' : '<span style="color:var(--line)">▢ 照片</span>') + ' ' +
              (S.relics.watch ? '<span style="color:var(--gold2)">◉ 怀表</span>' : '<span style="color:var(--line)">▢ 怀表</span>') + ' ' +
              (S.relics.ribbon ? '<span style="color:var(--gold2)">✿ 发绳</span>' : '<span style="color:var(--line)">▢ 发绳</span>');
    h += '<div class="mem-card"><span class="m-tag">第一幕</span>' +
         (actN > 1 ? '已了结 · ' : '进行中 · ') + '信物 ' + D.relicCountOf(S) + '/3<br>' + rel +
         '<div style="color:var(--dim);font-size:11px;margin-top:3px">照片在教堂侧门（要铜钥匙）· 怀表在钟塔（那晚有一声钟是哑的）· 发绳在码头（三长两短）</div></div>';

    var pc = D.pagesCountOf(S);
    var SRC = { p1: '家·抽屉夹层', p2: '教堂·诗集', p3: '码头·铁盒', p4: '井底·油布包', p5: '钟塔·夹层' };
    var pageRows = '';
    if (actN < 2) {
      pageRows = '<span style="color:var(--line)">她的事，要等里屋的门开了才知道。</span>';
    } else {
      for (var k in SRC) {
        pageRows += '<span style="' + (S.pages[k] ? 'color:var(--gold2)' : 'color:var(--line)') + '">' +
                    (S.pages[k] ? '✓ ' : '▢ ') + SRC[k] + '</span><br>';
      }
    }
    h += '<div class="mem-card"><span class="m-tag">第二幕</span>' +
         (actN < 2 ? '还没开始' : (actN > 2 ? '已了结 · ' : '进行中 · ')) + '日记 ' + pc + '/5<br>' + pageRows + '</div>';

    h += '<div class="mem-card"><span class="m-tag">第三幕</span>' +
         (actN < 3 ? '雾门未开——集齐五页日记，回当铺找老板钉成账本。' : '雾门已开 · 去雾巷最深处。三句话答对了，当契作废；<b style="color:var(--red)">答错一句，她拼不出你，当场散场</b>。') + '</div>';

    var d = D.derived(S);
    h += '<div class="mem-card"><span class="m-tag">账本</span>完整度 ' + Math.round(d.integrity * 100) +
         '% · 断当 ' + d.lostCount + '/' + D.CFG.LOST_LIMIT + ' · 在当 ' + d.pawned.length + ' 段 · 当金 ' + S.gold + '◆</div>';

    if (S.mode === 'main') {
      var cAct = actMeta(curAct());
      h += '<div class="mem-card"><span class="m-tag">正篇</span>《雾季十年》· ' + actLabel(curAct()) +
           (cAct ? '（' + cAct.label + '）' : '') +
           '<br><span style="color:var(--dim)">利息 ' + S.interest + '% · 证词 ' + S.testimony + ' 件 · ' +
           (mainDaysLeft() === 0 ? '<b style="color:var(--red)">雾季最后一天</b>' : '距雾季结束 ' + mainDaysLeft() + ' 天') +
           (S.mainFlags.signed ? ' · <b style="color:var(--red)">已签白记契纸</b>' : '') + '</span></div>';
    }

    h += '<div class="empty-tip" style="padding:4px 0">雾，是这座镇的忘性。三长两短，是她叫你的声音。</div>';
    paneStoryEl.innerHTML = h;
  }

  /* ---------- 高清文字层（DOM，不像素化） ---------- */

  function pctX(px) { return (px / (CFG.GRID_W * CFG.CELL) * 100).toFixed(3) + '%'; }
  function pctY(py) { return (py / (CFG.GRID_H * CFG.CELL) * 100).toFixed(3) + '%'; }

  function buildLabels() {
    if (!cvEl || !cvEl.parentNode) return;
    labelsEl = document.createElement('div');
    labelsEl.id = 'labels';
    cvEl.parentNode.insertBefore(labelsEl, toastEl);
    var all = D.PLACES.concat(D.NPCS);
    for (var i = 0; i < all.length; i++) {
      (function (it) {
        if (it.hideLabel) return;
        var el = document.createElement('span');
        el.className = 'lbl' + (it.kind === 'npc' ? ' npc' : '');
        var ax = (it.lx !== undefined) ? it.lx : it.x * CFG.CELL + 8;
        var ay = (it.ly !== undefined) ? it.ly : it.y * CFG.CELL + 13;
        el.style.left = pctX(ax);
        el.style.top = pctY(ay);
        labelsEl.appendChild(el);
        lblMap.push({ el: el, it: it, t: null });
      })(all[i]);
    }
    var sign = document.createElement('span');
    sign.className = 'lbl sign';
    sign.textContent = '當';
    sign.style.left = pctX(41);
    sign.style.top = pctY(108);
    labelsEl.appendChild(sign);
    eHintEl = document.createElement('span');
    eHintEl.className = 'lbl ekey';
    eHintEl.textContent = 'E';
    labelsEl.appendChild(eHintEl);
  }

  function updateLabels(near) {
    if (!labelsEl || !S) return;
    var mist = S.scene === 'mist';
    for (var i = 0; i < lblMap.length; i++) {
      var L = lblMap[i];
      var hide = mist || !itVisible(L.it);
      if (L.el.style.display !== (hide ? 'none' : '')) L.el.style.display = hide ? 'none' : '';
      if (hide) continue;
      var label = L.it.name;
      if (L.it.bindMem && D.memStateOf(S, L.it.bindMem) !== 'held') label = '？？？？';
      if (L.t !== label) { L.t = label; L.el.textContent = label; }
    }
    if (near && S.phase === 'play' && !S.modal) {
      eHintEl.style.left = pctX(near.x * CFG.CELL + 8);
      eHintEl.style.top = pctY(near.y * CFG.CELL - 2);
      eHintEl.classList.add('show');
    } else {
      eHintEl.classList.remove('show');
    }
  }

  /* ---------- 像素渲染 ---------- */

  function rc(x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  }

  function pxCircle(cx, cy, r, c, alpha) {
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.fillStyle = c;
    for (var dy = -r; dy <= r; dy++) {
      var w = Math.floor(Math.sqrt(r * r - dy * dy));
      ctx.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 建筑与景物（逐栋手绘像素，一眼能认出是什么） ---------- */

  function drawWater() {
    /* 码头水面：深水 + 木栈桥 + 系船柱 + 波光 */
    rc(208, 192, 112, 32, '#16233f');
    rc(208, 192, 112, 2, '#243a5e');
    rc(270, 192, 20, 15, '#6a5638');
    rc(270, 192, 20, 1, '#8a7048');
    rc(270, 197, 20, 1, '#4a3a26');
    rc(270, 202, 20, 1, '#4a3a26');
    rc(266, 193, 3, 7, '#5f4a34');
    rc(265, 193, 5, 2, '#6a5638');
    for (var f = 0; f < 3; f++) {
      var ox = Math.sin(S.t * 0.8 + f * 2.1) * 6;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#3a5a8a';
      ctx.fillRect(216 + f * 34 + ox, 200 + f * 6, 12, 1);
      ctx.globalAlpha = 1;
    }
  }

  function drawShop() {
    /* 记忆当铺：紫墙黑瓦、出檐屋顶、檐下挂"當"招牌（文字层叠加）、暖窗、门灯笼 */
    rc(16, 104, 48, 40, '#2a2050');
    rc(22, 94, 36, 4, '#7a5ac8');
    rc(18, 98, 44, 4, '#6a4bb8');
    rc(14, 102, 52, 4, '#4a3590');
    rc(36, 92, 8, 2, '#e8b74a');
    rc(30, 106, 20, 13, '#141026');
    rc(31, 107, 18, 11, '#1d1636');
    rc(30, 106, 20, 1, '#6a4bb8');
    rc(30, 118, 20, 1, '#6a4bb8');
    rc(20, 114, 9, 9, '#b8863a');
    rc(21, 115, 7, 7, '#ffd98a');
    rc(24, 115, 1, 7, '#b8863a');
    rc(51, 114, 9, 9, '#b8863a');
    rc(52, 115, 7, 7, '#ffd98a');
    rc(55, 115, 1, 7, '#b8863a');
    rc(33, 126, 14, 18, '#171228');
    rc(35, 128, 10, 16, '#241c44');
    rc(42, 136, 1, 2, '#e8b74a');
    rc(31, 144, 18, 2, '#7a7494');
    rc(40, 118, 1, 2, '#8a7048');
    pxCircle(40, 122, 2, '#e8b74a');
    rc(39, 121, 3, 1, '#ffd98a');
  }

  function drawHome() {
    /* 你的家：粉瓦小屋、烟囱炊烟、暖窗 */
    rc(50, 26, 44, 22, '#3d2f60');
    rc(66, 8, 12, 3, '#c47a96');
    rc(61, 11, 22, 3, '#b86a8a');
    rc(56, 14, 32, 3, '#b86a8a');
    rc(51, 17, 42, 3, '#a05a78');
    rc(46, 20, 52, 6, '#8a4a68');
    rc(84, 4, 6, 8, '#5a4a72');
    rc(84, 4, 6, 1, '#6a5a86');
    pxCircle(87, 2, 2, '#cfc6f2', 0.22);
    pxCircle(90 + Math.round(Math.sin(S.t * 0.7) * 2), 1, 1, '#cfc6f2', 0.18);
    rc(53, 30, 9, 8, '#b8863a');
    rc(54, 31, 7, 6, '#ffd98a');
    rc(57, 31, 1, 6, '#b8863a');
    rc(82, 30, 9, 8, '#b8863a');
    rc(83, 31, 7, 6, '#ffd98a');
    rc(86, 31, 1, 6, '#b8863a');
    rc(66, 36, 12, 12, '#171228');
    rc(68, 38, 8, 10, '#2a2050');
    rc(74, 42, 1, 2, '#e8b74a');
    rc(64, 48, 16, 2, '#7a7494');
  }

  function drawChurch() {
    /* 教堂：石墙陡顶、金十字、玫瑰窗、拱窗、大拱门、带钥匙孔的侧门（整体避开盘塔） */
    rc(214, 56, 44, 40, '#3a3a5e');
    rc(228, 44, 16, 3, '#8a96c8');
    rc(222, 47, 28, 3, '#7a86b8');
    rc(216, 50, 40, 3, '#6a76a8');
    rc(210, 53, 52, 3, '#5a6698');
    rc(235, 30, 2, 14, '#e8b74a');
    rc(231, 33, 10, 2, '#e8b74a');
    if (S.mode === 'main' && S.mainFlags.nightDone) {
      /* 正篇第6章夜钟敲响后：玫瑰窗由金转暖白（镇上的夜有人守了） */
      var rg = 0.7 + 0.3 * Math.sin(S.t * 1.7);
      ctx.globalAlpha = rg;
      pxCircle(236, 70, 4, '#e8e2d0');
      ctx.globalAlpha = 1;
      pxCircle(236, 70, 3, '#fff6e0');
      pxCircle(236, 70, 1, '#e8d8a0');
    } else {
      pxCircle(236, 70, 4, '#b8863a');
      pxCircle(236, 70, 3, '#ffd98a');
      pxCircle(236, 70, 1, '#b8863a');
    }
    rc(219, 66, 5, 12, '#171228');
    rc(220, 67, 3, 10, '#ffd98a');
    rc(248, 66, 5, 12, '#171228');
    rc(249, 67, 3, 10, '#ffd98a');
    rc(229, 78, 14, 18, '#171228');
    rc(231, 76, 10, 2, '#171228');
    rc(233, 74, 6, 2, '#171228');
    rc(251, 74, 7, 14, '#171228');
    rc(252, 75, 5, 12, '#241c44');
    rc(253, 80, 2, 2, '#e8b74a');
  }

  function drawTower() {
    /* 钟塔：窄身高塔、钟室金钟、时钟面、塔脚闪烁的老面板 */
    rc(262, 24, 36, 24, '#241c44');
    rc(264, 20, 32, 4, '#3a3060');
    rc(268, 17, 24, 3, '#4a3f75');
    rc(272, 14, 16, 3, '#5a4f8a');
    rc(279, 8, 2, 6, '#4a3f75');
    pxCircle(280, 7, 1, '#e8b74a');
    rc(268, 26, 24, 9, '#141026');
    pxCircle(280, 30, 3, '#e8b74a');
    rc(280, 33, 1, 2, '#8a7048');
    if (S.mode === 'main' && S.chapter >= 4 && !S.mainFlags.gearDone) {
      /* 正篇第4章起：机芯被拆走校准——钟面停摆发暗，指针死在「雾季开始」的时刻 */
      pxCircle(280, 41, 5, '#3a3454');
      pxCircle(280, 41, 4, '#8a84a8');
      rc(279, 38, 1, 3, '#241c44');
      rc(283, 41, 3, 1, '#241c44');            /* 指针卡死 */
      rc(277, 44, 1, 1, '#241c44');
      rc(278, 43, 1, 1, '#241c44');            /* 玻璃裂纹 */
    } else {
      pxCircle(280, 41, 5, '#b8863a');
      pxCircle(280, 41, 4, '#ffd98a');
      rc(279, 38, 1, 3, '#241c44');
      rc(280, 41, 3, 1, '#241c44');
    }
    rc(274, 52, 12, 9, '#141026');
    ctx.globalAlpha = 0.65 + 0.35 * Math.sin(S.t * 2);
    ctx.fillStyle = '#e8b74a';
    ctx.fillRect(276, 54, 8, 3);
    ctx.globalAlpha = 1;
  }

  function drawWarehouse() {
    /* 码头仓库：木墙单坡顶、双开大闸门（敲暗号处）、金属敲板、货箱酒桶 */
    rc(258, 168, 44, 24, '#4a3a2a');
    rc(254, 160, 52, 4, '#5f4a34');
    rc(254, 164, 52, 3, '#4a3a26');
    rc(270, 174, 20, 18, '#171228');
    rc(271, 175, 9, 17, '#6a5638');
    rc(280, 175, 9, 17, '#5a4a2e');
    rc(275, 175, 1, 17, '#4a3a26');
    rc(284, 175, 1, 17, '#3a2f1e');
    rc(271, 181, 18, 1, '#4a3a26');
    rc(277, 183, 1, 2, '#e8b74a');
    rc(283, 183, 1, 2, '#e8b74a');
    rc(292, 178, 5, 7, '#8a7048');
    rc(293, 179, 3, 2, '#e8b74a');
    rc(293, 182, 3, 2, '#e8b74a');
    rc(259, 178, 9, 9, '#8a7048');
    rc(259, 178, 9, 1, '#a08858');
    rc(263, 178, 1, 9, '#6a5638');
    rc(259, 182, 9, 1, '#6a5638');
    rc(297, 179, 5, 10, '#6a5638');
    rc(297, 179, 5, 2, '#8a7048');
    rc(297, 183, 5, 1, '#3a2f1e');
    rc(297, 186, 5, 1, '#3a2f1e');
  }

  function drawWell() {
    /* 童年之井：石砌井口、木亭吊桶、青苔下的方槽 */
    rc(128, 66, 16, 3, '#6a4bb8');
    rc(126, 69, 20, 3, '#5a3ba0');
    rc(128, 72, 2, 12, '#6a5638');
    rc(142, 72, 2, 12, '#6a5638');
    rc(128, 72, 16, 2, '#8a7048');
    rc(135, 74, 1, 5, '#8a7048');
    rc(133, 79, 6, 4, '#8a7048');
    rc(134, 80, 4, 1, '#5f4a34');
    pxCircle(136, 89, 7, '#8a84a4');
    pxCircle(136, 89, 5, '#6a6488');
    pxCircle(136, 89, 3, '#141026');
    rc(140, 86, 3, 2, '#c9c2e8');
  }

  function drawBoard() {
    /* 告示牌：木柱板面、寻人启事贴纸（镇中心零工处） */
    var bx = 8 * CFG.CELL, by = 8 * CFG.CELL;
    rc(bx + 3, by + 12, 2, 14, '#5f4a34');
    rc(bx + 17, by + 12, 2, 14, '#5f4a34');
    rc(bx, by - 1, 22, 13, '#5a4630');
    rc(bx + 1, by, 20, 11, '#8a7048');
    rc(bx, by - 1, 22, 1, '#6a5638');
    rc(bx + 3, by + 2, 7, 7, '#f0eaff');
    rc(bx + 4, by + 3, 5, 1, '#8a84a4');
    rc(bx + 4, by + 5, 5, 1, '#8a84a4');
    rc(bx + 4, by + 7, 4, 1, '#8a84a4');
    rc(bx + 12, by + 2, 7, 7, '#d7cff5');
    rc(bx + 13, by + 3, 5, 1, '#8a84a4');
    rc(bx + 13, by + 5, 5, 1, '#8a84a4');
  }

  function drawHall() {
    /* 镇公所：灰石公所、檐口木匾（金描）、铁条窗、台阶下忘事房的灯油暖光 */
    rc(2, 172, 44, 34, '#4e4e6a');
    rc(2, 172, 44, 2, '#5e5e7e');
    rc(0, 166, 48, 6, '#5c5c7a');
    rc(0, 166, 48, 2, '#6c6c8a');
    for (var b = 0; b < 5; b++) rc(3 + b * 9, 168, 5, 2, '#50506e');   /* 女儿墙齿 */
    /* 木匾 */
    rc(13, 176, 22, 9, '#241c30');
    rc(13, 176, 22, 1, '#8a7048'); rc(13, 184, 22, 1, '#8a7048');
    rc(14, 177, 1, 7, '#8a7048'); rc(33, 177, 1, 7, '#8a7048');
    rc(17, 179, 2, 3, '#e8b74a'); rc(23, 179, 2, 3, '#e8b74a'); rc(29, 179, 2, 3, '#e8b74a');
    /* 木门 */
    rc(7, 192, 11, 14, '#2a2138');
    rc(8, 193, 9, 12, '#3a2f4e');
    rc(15, 198, 1, 2, '#e8b74a');
    /* 铁条窗 */
    rc(24, 190, 13, 9, '#191430');
    rc(26, 190, 1, 9, '#7a7494'); rc(30, 190, 1, 9, '#7a7494'); rc(34, 190, 1, 9, '#7a7494');
    rc(24, 190, 13, 1, '#6a6488');
    /* 忘事房地下入口：石阶往下 + 灯油暖光呼吸 */
    rc(38, 194, 9, 12, '#332b4c');
    rc(38, 196, 9, 1, '#463a60'); rc(38, 200, 9, 1, '#463a60'); rc(38, 204, 9, 1, '#463a60');
    var gl = 0.10 + 0.05 * Math.sin(S.t * 1.7);
    pxCircle(42, 205, 8, '#ffb85c', gl);
    pxCircle(42, 206, 4, '#ffb85c', gl + 0.04);
    /* 门外堆的卷宗纸箱 */
    rc(20, 200, 7, 6, '#7a6244'); rc(20, 200, 7, 1, '#8a7048'); rc(23, 200, 1, 6, '#5a4630');
    rc(26, 203, 6, 3, '#6a5638'); rc(26, 203, 6, 1, '#7a6244');
  }

  /* 空地装饰：路灯、草丛、木桶——让小镇不像一张空图纸 */
  function drawLamp(x, y) {
    rc(x - 1, y - 8, 2, 8, '#3a3050');
    rc(x - 3, y - 13, 6, 6, '#241c44');
    rc(x - 2, y - 12, 4, 4, '#ffd98a');
    pxCircle(x, y - 10, 7, '#ffb85c', 0.06);
    pxCircle(x, y - 10, 4, '#ffb85c', 0.08);
  }

  function drawProps() {
    drawLamp(2 * CFG.CELL + 8, 11 * CFG.CELL + 10);
    drawLamp(6 * CFG.CELL + 8, 10 * CFG.CELL + 8);
    drawLamp(13 * CFG.CELL + 4, 9 * CFG.CELL + 8);
    var tufts = [[1, 4], [6, 5], [9, 9], [12, 12], [5, 11], [15, 8], [18, 7], [3, 12], [11, 3], [19, 9], [7, 2], [13, 1]];
    for (var i = 0; i < tufts.length; i++) {
      var tx = tufts[i][0] * CFG.CELL, ty = tufts[i][1] * CFG.CELL;
      rc(tx + 6, ty + 9, 1, 3, '#3f5a48');
      rc(tx + 8, ty + 7, 1, 5, '#35503f');
      rc(tx + 10, ty + 10, 1, 2, '#3f5a48');
    }
    /* 当铺门口的酒桶 */
    var vx = 5 * CFG.CELL + 3, vy = 9 * CFG.CELL + 6;
    rc(vx, vy, 8, 8, '#6a5638');
    rc(vx, vy, 8, 1, '#8a7048');
    rc(vx, vy + 3, 8, 1, '#4a3a26');
    rc(vx, vy + 7, 8, 1, '#4a3a26');
    rc(vx + 1, vy + 1, 6, 2, '#7a6244');
  }

  /* ---------- 剧情景物：教堂长椅 / 仓库暗格 / 雾门 ---------- */

  function drawStoryProps() {
    /* 教堂长椅 + 晾着的诗集 */
    var px0 = 12 * CFG.CELL, py0 = 3 * CFG.CELL;
    rc(px0 + 2, py0 + 8, 12, 2, '#5a4630');
    rc(px0 + 2, py0 + 10, 12, 2, '#6a5638');
    rc(px0 + 3, py0 + 12, 2, 3, '#4a3a26');
    rc(px0 + 11, py0 + 12, 2, 3, '#4a3a26');
    rc(px0 + 4, py0 + 6, 8, 2, '#7a6244');
    rc(px0 + 4, py0 + 6, 8, 1, '#8a7048');
    /* 仓库地板暗格 */
    var cx0 = 17 * CFG.CELL, cy0 = 9 * CFG.CELL;
    rc(cx0 + 3, cy0 + 9, 10, 5, '#5a4630');
    rc(cx0 + 4, cy0 + 10, 8, 3, '#7a6244');
    rc(cx0 + 5, cy0 + 11, 6, 1, '#4a3a26');
    /* 雾门（第三幕） */
    if (S.story === 'act3') {
      var gx = 19 * CFG.CELL, gy = 2 * CFG.CELL;
      ctx.globalAlpha = 0.45;
      rc(gx + 1, gy - 3, 14, 20, '#f0eaff');
      ctx.globalAlpha = 0.9;
      rc(gx + 3, gy - 1, 10, 16, '#ffffff');
      ctx.globalAlpha = 1;
      rc(gx + 3, gy - 1, 10, 1, '#d7cff5');
      rc(gx + 7, gy + 6, 2, 2, '#c9c2e8');
      var pul = Math.floor(S.t * 2) % 2;
      ctx.globalAlpha = pul ? 0.5 : 0.25;
      rc(gx - 2, gy + 12, 20, 2, '#f0eaff');
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- 正篇景物：门缝光 / 收购告示 / 渔网渔获 ---------- */

  function drawMainProps() {
    if (S.mode !== 'main') return;
    var W = CFG.GRID_W * CFG.CELL;
    var signed = S.chapter >= 5 && S.mainFlags.signed;
    /* 第1章起：当铺白天的门缝透光（百年异象）；第5章签契后：门缝光熄灭，贴上白官府封条 */
    if (!signed) {
      var pul = 0.55 + 0.2 * Math.sin(S.t * 1.3);
      ctx.globalAlpha = pul;
      rc(46, 128, 2, 16, '#fff2c8');
      ctx.globalAlpha = pul * 0.45;
      rc(48, 130, 5, 12, '#ffe9a8');
      ctx.globalAlpha = 1;
    } else {
      rc(45, 127, 9, 18, '#2e2a44');
      rc(46, 133, 7, 2, '#d8d2c2');            /* 斜贴封条 */
      rc(45, 136, 2, 2, '#c85a4a');            /* 封条骑缝印 */
      rc(51, 130, 2, 2, '#c85a4a');
    }
    /* 第2章起：告示牌钉上「白日当铺 · 收购雾产」告示（盖红印，压住旧启事） */
    if (S.chapter >= 2) {
      var nbx = 8 * CFG.CELL, nby = 8 * CFG.CELL;
      rc(nbx + 13, nby + 1, 8, 10, '#f7f4ea');
      rc(nbx + 14, nby + 3, 5, 1, '#6a6488');
      rc(nbx + 14, nby + 5, 4, 1, '#6a6488');
      rc(nbx + 14, nby + 7, 5, 1, '#6a6488');
      rc(nbx + 19, nby + 8, 2, 2, '#c85a4a');   /* 红印 */
    }
    /* 第2章起：码头的渔网，网里凝着断当实物（顶针/戏票/鞋） */
    if (S.chapter >= 2) {
      var nx = 13 * CFG.CELL, ny = 12 * CFG.CELL - 2;
      ctx.globalAlpha = 0.5;
      rc(nx, ny, 22, 16, '#24405e');
      ctx.globalAlpha = 1;
      for (var i = 1; i < 4; i++) rc(nx, ny + i * 4, 22, 1, '#7a8ea8');
      for (var j = 1; j < 5; j++) rc(nx + j * 5, ny, 1, 16, '#7a8ea8');
      pxCircle(nx + 6, ny + 8, 1, '#e8b74a');            /* 顶针 */
      rc(nx + 11, ny + 6, 4, 3, '#f0eaff');              /* 半张戏票 */
      rc(nx + 15, ny + 9, 4, 2, '#4a3a2e');              /* 左脚的鞋 */
    }
    /* 第5章起：催当帖（红边白纸压在旧告示上，风里一颤一颤） */
    if (S.chapter >= 5) {
      var cbx = 8 * CFG.CELL + 7, cby = 8 * CFG.CELL + 3 + Math.round(Math.sin(S.t * 2.2) * 0.5);
      rc(cbx, cby, 8, 11, '#f7ede0');
      rc(cbx, cby, 8, 1, '#c85a4a');
      rc(cbx, cby + 10, 8, 1, '#c85a4a');
      rc(cbx + 1, cby + 3, 6, 1, '#8a5a4a');
      rc(cbx + 1, cby + 5, 6, 1, '#8a5a4a');
      rc(cbx + 5, cby + 8, 2, 2, '#c85a4a');             /* 朱印 */
    }
    /* 第7章起：雾动——雾贴地漫进镇口，往当铺方向爬 */
    if (S.chapter >= 7) {
      var fogX = (S.t * 9) % (W + 60) - 30;
      ctx.globalAlpha = 0.09;
      rc(-20 + fogX, 3 * CFG.CELL + 6, 64, 10, '#e8e2ff');
      ctx.globalAlpha = 0.06;
      rc(-20 + (fogX + W * 0.5) % (W + 60), 9 * CFG.CELL, 80, 12, '#e8e2ff');
      ctx.globalAlpha = 1;
    }
    /* 第9章起：堰——下游水面横出一道老石堰，堰闸缺口透水光 */
    if (S.chapter >= 9) {
      var wy = 13 * CFG.CELL + 2;
      ctx.globalAlpha = 0.75;
      rc(6, wy, W - 12, 5, '#4a4666');
      ctx.globalAlpha = 1;
      for (var wi = 0; wi < 8; wi++) rc(10 + wi * (W - 20) / 8, wy + 2, 1, 3, '#38345a');
      rc(W / 2 - 7, wy - 1, 14, 7, '#2c2a4e');           /* 堰闸缺口 */
      ctx.globalAlpha = 0.5 + 0.25 * Math.sin(S.t * 3);
      rc(W / 2 - 5, wy, 10, 3, '#9fd8f0');               /* 缺口透水光 */
      ctx.globalAlpha = 1;
      rc(W / 2 - 9, wy - 2, 2, 9, '#565274');            /* 闸墩 */
      rc(W / 2 + 7, wy - 2, 2, 9, '#565274');
    }
    /* 第10章：终章倒计时——镇上灯一盏一盏灭，days 越少灭得越多 */
    if (S.chapter >= 10) {
      var dl = mainDaysLeft();
      var dead = dl >= 3 ? 1 : (dl === 2 ? 2 : 3);       /* 剩3天灭1盏，2天灭2盏，今夜灭3盏 */
      for (var di = 0; di < dead; di++) {
        var dpx = [15 * CFG.CELL + 8, 17 * CFG.CELL + 8, 8 * CFG.CELL + 8][di];
        var dpy = [4 * CFG.CELL + 8, 12 * CFG.CELL, 5 * CFG.CELL + 8][di];
        ctx.globalAlpha = 0.55;
        pxCircle(dpx, dpy, 6, '#1a1630');
        ctx.globalAlpha = 0.8;
        pxCircle(dpx, dpy, 1, '#5a5470');                /* 灯芯残红 */
        ctx.globalAlpha = 1;
      }
    }
  }

  /* ---------- 雾境（雾门之后） ---------- */

  function drawMistScene() {
    var W = CFG.GRID_W * CFG.CELL, H = CFG.GRID_H * CFG.CELL;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.imageSmoothingEnabled = false;
    rc(0, 0, W, H, '#e9e6f4');
    for (var i = 0; i < 5; i++) {
      ctx.globalAlpha = 0.10;
      rc(Math.sin(S.t * 0.4 + i * 2.2) * 24 - 20, 92 + i * 22, W + 40, 7, '#ffffff');
    }
    ctx.globalAlpha = 0.3;
    rc(0, 190, W, 34, '#dcd6ec');
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    var sway = Math.sin(S.t * 1.1) * 2;
    drawChar(W / 2 + 26 + sway, H * 0.5, PAL.ghost, { facing: 2, kid: true });
    drawChar(W / 2 - 10, H * 0.82, PAL.hero, { facing: 0, frame: -1 });
    ctx.setTransform(2, 0, 0, 2, 0, 0);
  }

  /* ---------- 角色绘制（2x 物理像素高细节 sprite：1px 描边 / 四向 / 双帧步态） ---------- */

  var PAL = {
    hero:   { skin:'#f2cfa0', shade:'#d9b184', hair:'#d8d4e8', hairHi:'#f0ecff', cloth:'#3f5a8a', cloth2:'#2e4368', pants:'#2c3350', shoe:'#191631' },
    fisher: { skin:'#e8bd90', shade:'#c99e6f', hair:'#a8adb5', hairHi:'#cdd2d8', cloth:'#4a6738', cloth2:'#36502a', pants:'#3a3a2c', shoe:'#241c12', hat:'#c9a35a', hat2:'#8a6a34' },
    kid:    { skin:'#f2cfa0', shade:'#d9b184', hair:'#e8c46a', hairHi:'#f7dd8f', cloth:'#a8452f', cloth2:'#7e311e', pants:'#5a4632', shoe:'#241c12' },
    ghost:  { skin:'#f2eee6', shade:'#d9d0cc', hair:'#4a3f5e', hairHi:'#6a5c80', cloth:'#f3f0fa', cloth2:'#c9c2de', pants:'#c9c2de', shoe:'#8a84a4' },
    /* 正篇新角色 */
    archivist: { skin:'#dcb992', shade:'#bd9a74', hair:'#d6d3e0', hairHi:'#efedf6', cloth:'#4a3a2e', cloth2:'#382b20', pants:'#2c2620', shoe:'#191420' },
    pluto:     { skin:'#e8bd90', shade:'#c99e6f', hair:'#3a3244', hairHi:'#544a64', cloth:'#f0ece0', cloth2:'#d8d2c2', pants:'#e6e1d4', shoe:'#a8a294', hat:'#f4f1e8', hat2:'#2a2438' },
    sis:       { skin:'#f2cfa0', shade:'#d9b184', hair:'#4a3f5e', hairHi:'#6a5c80', cloth:'#c97a8e', cloth2:'#a05a72', pants:'#8a4a5e', shoe:'#5a3a4a' },
    lamp:      { skin:'#e8bd90', shade:'#c99e6f', hair:'#8a8578', hairHi:'#b3ada0', cloth:'#7a6a4a', cloth2:'#5c4f36', pants:'#4a4234', shoe:'#2e2820', hat:'#c9b47a', hat2:'#96824e' }
  };

  /* 以脚底中心为原点的 18 宽 sprite，坐标为 2x 物理像素；facing 0上 1右 2下 3左 */
  function guyRects(p, o) {
    var r = [];
    function A(x, y, w, h, c) { r.push([x, y, w, h, c]); }
    var f = o.facing, kid = !!o.kid;
    var fr = (o.frame === 0 || o.frame === 1) ? o.frame : -1;

    /* 帽子 / 头发 */
    if (o.hat === 'kerchief') {
      A(4, 0, 10, 2, p.hat);
      A(3, 2, 12, 2, p.hat);
      A(3, 4, 3, 2, p.hat);
      A(12, 4, 3, 2, p.hat);
      if (f === 0) { A(4, 4, 10, 3, p.hat); A(9, 7, 2, 2, p.hat2); }  /* 背面盖住头发 + 布结 */
    } else if (o.hat === 'straw') {
      A(5, 0, 8, 3, p.hat);
      A(5, 2, 8, 1, p.hat2);
      A(2, 3, 14, 2, p.hat);
      A(6, 0, 2, 1, '#dbb96e');
    } else if (o.hat === 'bowler') {
      /* 白老板的浅色礼帽：圆顶 + 深色帽带 + 折檐 */
      A(5, 0, 8, 2, p.hat);
      A(5, 2, 8, 1, p.hat2);
      A(3, 3, 12, 2, p.hat);
    } else if (f === 0) {
      A(4, 0, 10, 2, p.hair);
      A(3, 2, 12, 7, p.hair);
      A(5, 1, 5, 1, p.hairHi);
    } else {
      A(4, 0, 10, 2, p.hair);
      A(3, 2, 12, 3, p.hair);
      A(5, 1, 5, 1, p.hairHi);
    }

    /* 脸 */
    if (f === 2) {
      A(4, 5, 10, 5, p.skin);
      A(3, 4, 2, 5, p.hair);
      A(13, 4, 2, 5, p.hair);
      A(6, 7, 1, 2, '#221a33');
      A(11, 7, 1, 2, '#221a33');
      A(8, 9, 2, 1, p.shade);
      A(7, 10, 4, 1, p.shade);
    } else if (f === 1 || f === 3) {
      A(5, 5, 8, 5, p.skin);
      A(3, 4, 3, 6, p.hair);
      A(11, 7, 1, 2, '#221a33');
      A(13, 7, 1, 1, p.shade);
      A(8, 10, 4, 1, p.shade);
    } else {
      A(7, 10, 4, 1, p.shade);
    }

    /* 身体 */
    var by = 11;
    if (kid) {
      A(5, by, 8, 8, p.cloth);
      A(7, by, 4, 1, p.shade);
      A(4, by + 8, 10, 2, p.cloth2);
      A(3, by + 1, 2, 5, p.cloth);
      A(13, by + 1, 2, 5, p.cloth);
      A(3, by + 6, 2, 1, p.skin);
      A(13, by + 6, 2, 1, p.skin);
      A(6, by + 10, 2, 1, p.shoe);
      A(10, by + 10, 2, 1, p.shoe);
    } else if (o.hat === 'straw') {
      A(3, by, 12, 8, p.cloth);
      A(8, by + 1, 1, 7, p.cloth2);
      A(4, by + 6, 10, 1, p.cloth2);
      A(2, by + 1, 1, 5, p.cloth2);
      A(15, by + 1, 1, 5, p.cloth2);
    } else {
      A(4, by, 10, 7, p.cloth);
      A(7, by, 4, 1, p.cloth2);
      A(2, by, 2, 6, p.cloth);
      A(14, by, 2, 6, p.cloth);
      A(2, by + 6, 2, 2, p.skin);
      A(14, by + 6, 2, 2, p.skin);
      A(4, by + 6, 10, 1, p.cloth2);
    }

    /* 腿与鞋（小孩穿长袍无腿） */
    if (!kid) {
      var ly = 18;
      if (f === 1 || f === 3) {
        if (fr === 0) { A(10, ly, 3, 5, p.pants); A(10, ly + 5, 4, 2, p.shoe); A(4, ly, 3, 5, p.pants); A(3, ly + 5, 4, 2, p.shoe); }
        else if (fr === 1) { A(8, ly, 3, 5, p.pants); A(8, ly + 5, 4, 2, p.shoe); A(7, ly, 3, 4, p.pants); A(7, ly + 4, 4, 2, p.shoe); }
        else { A(6, ly, 3, 5, p.pants); A(6, ly + 5, 3, 2, p.shoe); A(9, ly, 3, 5, p.pants); A(9, ly + 5, 4, 2, p.shoe); }
      } else {
        var L1 = fr === 0, L2 = fr === 1;
        A(5, ly, 3, L1 ? 5 : (L2 ? 4 : 5), p.pants);
        A(5, ly + (L1 ? 5 : (L2 ? 4 : 5)), 3, 2, p.shoe);
        A(10, ly, 3, L2 ? 5 : (L1 ? 4 : 5), p.pants);
        A(10, ly + (L2 ? 5 : (L1 ? 4 : 5)), 3, 2, p.shoe);
      }
    }

    /* 眼镜（档案员的圆框） */
    if (o.specs) {
      if (f === 2) {
        A(5, 7, 3, 1, '#cfd6e8'); A(10, 7, 3, 1, '#cfd6e8'); A(8, 7, 2, 1, '#8a84a4');
      } else if (f === 1 || f === 3) {
        A(6, 7, 6, 1, '#cfd6e8'); A(3, 7, 3, 1, '#8a84a4');
      }
    }
    return r;
  }

  function drawChar(cx, cy, p, o) {
    var px = Math.round(cx * 2), py = Math.round(cy * 2);
    var sph = o.kid ? 22 : 25;
    var rects = guyRects(p, o);
    var mirror = o.facing === 3;
    var ox = px - 9, oy = py - sph + 1;

    /* 脚下影子 */
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#0d0a1c';
    ctx.fillRect(px - 8, py - 1, 17, 2);
    ctx.fillRect(px - 6, py + 1, 13, 2);
    ctx.globalAlpha = 1;

    /* 1px 外描边（先以描边色把剪影向四方向各挤 1px） */
    ctx.fillStyle = '#181330';
    for (var i = 0; i < rects.length; i++) {
      var t = rects[i];
      var x = mirror ? (18 - t[0] - t[2]) : t[0];
      ctx.fillRect(ox + x - 1, oy + t[1], t[2], t[3]);
      ctx.fillRect(ox + x + 1, oy + t[1], t[2], t[3]);
      ctx.fillRect(ox + x, oy + t[1] - 1, t[2], t[3]);
      ctx.fillRect(ox + x, oy + t[1] + 1, t[2], t[3]);
    }
    /* 本体 */
    for (var j = 0; j < rects.length; j++) {
      var q = rects[j];
      var qx = mirror ? (18 - q[0] - q[2]) : q[0];
      ctx.fillStyle = q[4];
      ctx.fillRect(ox + qx, oy + q[1], q[2], q[3]);
    }
  }

  function gRender() {
    if (S && S.scene === 'mist') {
      updateLabels(null);
      if (!ctx) return;
      drawMistScene();
      return;
    }
    updateLabels(findNearestIt());
    if (!ctx) return;
    var W = CFG.GRID_W * CFG.CELL, H = CFG.GRID_H * CFG.CELL;
    /* 2x 超采样：世界按逻辑坐标绘制（自动放大一倍），角色单独按物理像素精绘 */
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.imageSmoothingEnabled = false;

    for (var gy = 0; gy < CFG.GRID_H; gy++) {
      for (var gx = 0; gx < CFG.GRID_W; gx++) {
        rc(gx * CFG.CELL, gy * CFG.CELL, CFG.CELL, CFG.CELL, ((gx + gy) % 2) ? '#241d3a' : '#282040');
      }
    }
    rc(0, 7 * CFG.CELL, W, CFG.CELL, '#3d3260');
    rc(10 * CFG.CELL, 0, CFG.CELL, H, '#3d3260');
    rc(0, 7 * CFG.CELL + CFG.CELL - 2, W, 2, '#46396b');
    rc(10 * CFG.CELL + CFG.CELL - 2, 0, 2, H, '#46396b');

    /* 地面碎点 */
    var pebbles = [[6, 3], [12, 2], [3, 10], [7, 12], [13, 9], [19, 6], [2, 2], [9, 10], [14, 1], [6, 12]];
    for (var pb = 0; pb < pebbles.length; pb++) {
      rc(pebbles[pb][0] * CFG.CELL + 6, pebbles[pb][1] * CFG.CELL + 7, 3, 2, '#322a52');
    }

    drawWater();
    drawShop();
    drawHome();
    drawChurch();
    drawTower();
    drawWarehouse();
    drawWell();
    drawBoard();
    drawHall();
    drawProps();
    drawStoryProps();
    drawMainProps();

    pxCircle(40, 130, 14, '#ffb85c', 0.07);
    pxCircle(40, 130, 9, '#ffb85c', 0.09);
    pxCircle(15 * CFG.CELL + 8, 4 * CFG.CELL + 8, 12, '#ffb85c', 0.06);
    pxCircle(17 * CFG.CELL + 8, 12 * CFG.CELL, 12, '#7ec4e8', 0.06);
    pxCircle(8 * CFG.CELL + 8, 5 * CFG.CELL + 8, 10, '#c9c2e8', 0.05);

    for (var f = 0; f < 3; f++) {
      var fx = Math.sin(S.t * 0.13 + f * 2.1) * 36;
      ctx.globalAlpha = S.mode === 'main' ? 0.085 : 0.055;   /* 正篇：雾更浓 */
      ctx.fillStyle = '#cfc6f2';
      ctx.fillRect(-20 + fx, 2 * CFG.CELL + f * 56, W + 40, 14);
      ctx.globalAlpha = 1;
    }
    var alleyAlpha = S.items.lantern ? 0.10 : 0.30;
    ctx.globalAlpha = alleyAlpha;
    ctx.fillStyle = '#d7cff5';
    ctx.fillRect(18 * CFG.CELL, 3 * CFG.CELL, 2 * CFG.CELL, 3 * CFG.CELL);
    ctx.globalAlpha = alleyAlpha * 0.6;
    ctx.fillRect(17 * CFG.CELL, 4 * CFG.CELL, CFG.CELL, CFG.CELL);
    ctx.globalAlpha = 1;

    /* 角色：切到物理像素坐标系精绘（细节密度是世界的 2 倍），画完切回 */
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (var ni = 0; ni < D.NPCS.length; ni++) {
      var np = D.NPCS[ni];
      if (!itVisible(np)) continue;
      var ncx = np.x * CFG.CELL + 8, ncy = np.y * CFG.CELL + 9;
      if (np.id === 'fisher') drawChar(ncx, ncy, PAL.fisher, { facing: 2, hat: 'straw' });
      else if (np.id === 'choir') drawChar(ncx, ncy, PAL.kid, { facing: 2, kid: true });
      else if (np.id === 'archivist') drawChar(ncx, ncy, PAL.archivist, { facing: 2, specs: true });
      else if (np.id === 'pluto') drawChar(ncx, ncy, PAL.pluto, { facing: 2, hat: 'bowler' });
      else if (np.id === 'sis') drawChar(ncx, ncy, PAL.sis, { facing: 2, kid: true });
      else if (np.id === 'lamp') drawChar(ncx, ncy, PAL.lamp, { facing: 2, hat: 'kerchief' });
    }
    var pt = S.moveT > 0 ? Math.min(1, S.moveT) : 0;
    var ppx = lerp(S.px, S.tx, pt) * CFG.CELL + 8;
    var ppy = lerp(S.py, S.ty, pt) * CFG.CELL + 11;
    var moving = S.moveT > 0;
    drawChar(ppx, ppy, PAL.hero, { facing: S.facing, frame: moving ? Math.floor(S.t * 8) % 2 : -1 });
    ctx.setTransform(2, 0, 0, 2, 0, 0);
  }

  function loop(now) {
    rafId = requestAnimationFrame(loop);
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    gTick(dt);
    gRender();
  }

  /* ---------- 启动 ---------- */

  function cacheDom() {
    cvEl = document.getElementById('world');
    /* 内部分辨率 2x（640×448）：像素风不变，颗粒更细、角色可精绘 */
    cvEl.width = CFG.GRID_W * CFG.CELL * 2;
    cvEl.height = CFG.GRID_H * CFG.CELL * 2;
    ctx = cvEl.getContext('2d');
    toastEl = document.getElementById('toast');
    modalEl = document.getElementById('modal');
    mTitleEl = document.getElementById('m-title');
    mBodyEl = document.getElementById('m-body');
    mBtnsEl = document.getElementById('m-btns');
    endModalEl = document.getElementById('end-modal');
    endNameEl = document.getElementById('end-name');
    endTextEl = document.getElementById('end-text');
    endStatsEl = document.getElementById('end-stats');
    btnAgainEl = document.getElementById('btn-again');
    btnMainEl = document.getElementById('btn-main');
    hudMainEl = document.getElementById('hud-main');
    hudInterestEl = document.getElementById('hud-interest');
    hudDaysEl = document.getElementById('hud-days');
    hudTestimonyEl = document.getElementById('hud-testimony');
    hudGoldEl = document.getElementById('hud-gold');
    hudIntegEl = document.getElementById('hud-integ');
    hudRedeemEl = document.getElementById('hud-redeem');
    relicsEl = document.getElementById('relics');
    hudGoalEl = document.getElementById('hud-goal');
    paneLogEl = document.getElementById('pane-log');
    paneStoryEl = document.getElementById('pane-story');
    paneMemEl = document.getElementById('pane-mem');
    paneTicketEl = document.getElementById('pane-ticket');
    tabLogEl = document.getElementById('tab-log');
    tabStoryEl = document.getElementById('tab-story');
    tabMemEl = document.getElementById('tab-mem');
    tabTicketEl = document.getElementById('tab-ticket');
    confirmBoxEl = document.getElementById('confirm-box');
    cfTextEl = document.getElementById('cf-text');
    btnRestartEl = document.getElementById('btn-restart');
    logoEl = document.getElementById('logo');
    btnBgmEl = document.getElementById('btn-bgm');
    cfYesEl = document.getElementById('cf-yes');
    cfNoEl = document.getElementById('cf-no');
    devPanelEl = document.getElementById('dev-panel');
    devBodyEl = document.getElementById('dev-body');
    btnDevEl = document.getElementById('btn-dev');
    devCloseEl = document.getElementById('dev-close');
    dpadEl = document.getElementById('dpad');
  }

  /* 触屏虚拟键：D-pad / E 键派发合成键盘事件，与桌面键盘走同一通路（按住连走、松键即停、E 敲击全复用） */
  function bindTouchUI() {
    var ui = document.getElementById('touch-ui');
    if (!ui) return;
    function fire(key, down) {
      var ev;
      try { ev = new KeyboardEvent(down ? 'keydown' : 'keyup', { key: key, bubbles: true }); }
      catch (err) {
        ev = document.createEvent('Event');
        ev.initEvent(down ? 'keydown' : 'keyup', true, false);
        ev.key = key;
      }
      document.dispatchEvent(ev);
    }
    function bindPad(b) {
      var k = b.getAttribute('data-k');
      var down = function (e) {
        e.preventDefault();
        b.classList.add('press');
        fire(k, true);
      };
      var up = function (e) {
        if (e && e.preventDefault) e.preventDefault();
        b.classList.remove('press');
        fire(k, false);
      };
      b.addEventListener('touchstart', down, { passive: false });
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
      b.addEventListener('mousedown', down);
      b.addEventListener('mouseup', up);
      b.addEventListener('mouseleave', function () { up(null); });
    }
    var pads = ui.querySelectorAll('#dpad button');
    for (var i = 0; i < pads.length; i++) bindPad(pads[i]);
    var be = document.getElementById('btn-e');
    if (be) {
      var tapE = function (e) {
        e.preventDefault();
        fire('e', true);
        setTimeout(function () { fire('e', false); }, 70);
      };
      be.addEventListener('touchstart', tapE, { passive: false });
      be.addEventListener('mousedown', tapE);
    }
  }

  function bindEvents() {
    document.addEventListener('keydown', function (e) {
      if (!S) return;
      var ae = document.activeElement;
      if (ae && ae.tagName === 'INPUT') {
        /* 正在输入谜题答案：游戏不劫持任何按键（Esc = 退出输入并关面板） */
        if (e.key === 'Escape') { ae.blur(); if (S.modal) closeModal(); }
        return;
      }
      var k = e.key;
      /* 开发者模式：反引号 / F2 切换面板（谜题输入框聚焦时不触发） */
      if (k === '`' || k === 'F2') {
        e.preventDefault();
        toggleDevPanel();
        return;
      }
      var dir = keyDirOf(k);
      if (dir) {
        e.preventDefault();
        if (heldDirs.indexOf(dir) < 0) heldDirs.push(dir);
        tryMove(DIRV[dir][0], DIRV[dir][1]);
      }
      else if (k === 'e' || k === 'E' || k === ' ' || k === 'Enter') {
        e.preventDefault();
        /* 谜题面板开着时，回车一律提交答案（即使输入框没焦点），不再当作"互动"关面板 */
        if (S.modal && S.modal.kind === 'lock_riddle') {
          var ri = document.getElementById('riddle-input');
          answerRiddle(ri ? ri.value : '');
          return;
        }
        /* 小游戏开着时，E / 空格 / 回车 = 敲击键（机芯校准 / 敲钟） */
        if (S.mini) {
          var mkdef = MINIS[S.mini.key];
          if (mkdef && mkdef.useKey) mkdef.act(S.mini, 'hit');
          return;
        }
        gInteract();
      }
      else if (k === 'Escape') { if (S.modal) closeModal(); }
    });

    /* 松键即停；窗口失焦清空按住状态，防止切窗口后"人还在走" */
    document.addEventListener('keyup', function (e) {
      var dir = keyDirOf(e.key);
      if (dir) {
        var i = heldDirs.indexOf(dir);
        if (i >= 0) heldDirs.splice(i, 1);
      }
    });
    window.addEventListener('blur', function () { heldDirs.length = 0; });

    /* 面板内所有带 data-action 的元素（底部按钮区 + 正文区，例如钟塔的「敲下面板」）统一走动作分发 */
    function modalDelegate(e) {
      var t = e.target;
      while (t && t.getAttribute && !t.getAttribute('data-action')) t = t.parentNode;
      if (!t || !t.getAttribute) return;
      if (t.disabled) return;
      handleAction(t.getAttribute('data-action'), '');
    }
    mBtnsEl.addEventListener('click', modalDelegate);
    mBodyEl.addEventListener('click', modalDelegate);

    tabLogEl.addEventListener('click', function () { switchTab('log'); });
    tabStoryEl.addEventListener('click', function () { switchTab('story'); });
    tabMemEl.addEventListener('click', function () { switchTab('mem'); });
    tabTicketEl.addEventListener('click', function () { switchTab('ticket'); });

    /* 剧情回顾：点侧栏里的章节按钮 → 重看 */
    paneStoryEl.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t.getAttribute && !t.getAttribute('data-arch')) t = t.parentNode;
      if (!t || !t.getAttribute) return;
      var key = t.getAttribute('data-arch');
      if (!key) return;
      window.SFX.click();
      openArch(key);
    });

    btnAgainEl.addEventListener('click', function () {
      window.SFX.unlock();
      window.SFX.click();
      resetGame();
    });

    /* 真结局后：走进正篇《雾季十年》 */
    btnMainEl.addEventListener('click', function () {
      window.SFX.unlock();
      window.SFX.click();
      startMain();
    });

    btnRestartEl.addEventListener('click', function () {
      window.SFX.click();
      gAsk({
        text: '回到本章开头记下的存档点？<br><small style="color:var(--dim)">这一章里走过的进度会退回去。</small>',
        yes: '回到存档点',
        no: '接着玩',
        onYes: restoreCheckpoint
      });
    });
    btnBgmEl.addEventListener('click', function () {
      var on = MUSIC.toggle();
      btnBgmEl.textContent = on ? '♪ 开' : '♪ 关';
      btnBgmEl.classList.toggle('off', !on);
      window.SFX.click();
      gToast(on ? '背景音乐 · 开' : '背景音乐 · 关');
    });
    cfNoEl.addEventListener('click', function () {
      window.SFX.click();
      confirmBoxEl.classList.remove('show');
    });
    cfYesEl.addEventListener('click', function () {
      window.SFX.click();
      confirmBoxEl.classList.remove('show');
      var fn = pendingConfirm;
      pendingConfirm = null;
      if (fn) fn();
    });

    /* 开发者模式：顶栏开关 / 面板关闭 / 面板按钮统一委托 */
    btnDevEl.addEventListener('click', function () {
      window.SFX.click();
      toggleDevPanel();
    });
    devCloseEl.addEventListener('click', function () {
      window.SFX.click();
      toggleDevPanel(false);
    });
    devBodyEl.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t.getAttribute && !t.getAttribute('data-dev')) t = t.parentNode;
      if (!t || !t.getAttribute) return;
      if (t.disabled) return;
      window.SFX.click();
      devAction(t.getAttribute('data-dev'));
    });

    /* 隐秘入口①：长按左上角标题 0.9 秒 → 从第一天重来（走同一套确认框） */
    bindLongPress(logoEl, 900, askFirstDay);

    window.addEventListener('beforeunload', saveGame);

    /* 手机：首次触摸解锁音频（iOS 的 AudioContext 必须在手势里 resume） */
    bindTouchUI();
    var unlockOnce = function () {
      try { window.SFX.unlock(); } catch (e) { /* ignore */ }
      try { MUSIC.unlock(); } catch (e) { /* ignore */ }
      document.removeEventListener('touchend', unlockOnce);
      document.removeEventListener('touchstart', unlockOnce);
    };
    document.addEventListener('touchend', unlockOnce);
    document.addEventListener('touchstart', unlockOnce);
  }

  /* BGM：每章一首主题曲（js/music.js）。key 规则：正篇 m1~m11，序章 prologue，结局页停 */
  function musicKey() {
    if (!S || S.phase !== 'play') return null;
    if (S.mode === 'main') return 'm' + S.chapter;
    return 'prologue';
  }
  function updateMusic() {
    try { MUSIC.play(musicKey()); } catch (e) { /* 静默降级 */ }
  }

  /* 确认框：文案与「是」的动作都由调用方给（顶栏「存档点」与隐秘「从第一天重来」共用） */
  function gAsk(opt) {
    if (!confirmBoxEl) return;
    if (cfTextEl) cfTextEl.innerHTML = opt.text;
    if (cfYesEl) cfYesEl.textContent = opt.yes || '确定';
    if (cfNoEl) cfNoEl.textContent = opt.no || '取消';
    pendingConfirm = opt.onYes || null;
    confirmBoxEl.classList.add('show');
  }

  /* 回到最近的章节存档点（走到这里已经是确认之后） */
  function restoreCheckpoint() {
    var st = loadCheckpoint();
    if (!st) { gToast('还没有存档点 —— 每章开头会自动记一次'); return false; }
    S = st;
    endModalEl.classList.remove('show');
    modalEl.classList.remove('show');
    if (confirmBoxEl) confirmBoxEl.classList.remove('show');
    switchTab('log');
    S.logDirty = true;
    S.memDirty = true;
    renderLog(); renderStoryPane(); renderMemPane(); renderTicketPane(); gRenderHUD();
    saveGame();                 /* 主存档对齐到存档点：这一章的进度算作重来 */
    updateMusic();
    if (DEV.open && devBodyEl) renderDevPanel();
    gToast(S.mode === 'main' ? ('已回到 ' + actLabel(curAct()) + ' 开头') : '已回到存档点');
    return true;
  }

  /* 从第一天重来：必须先过确认框，绝不点一下就重开 */
  function askFirstDay() {
    gAsk({
      text: '是否从第一天重新开始？<br><small style="color:var(--dim)">此操作不可恢复：当前进度与章节存档点都会清空。</small>',
      yes: '是，从第一天开始',
      no: '不了',
      onYes: function () {
        clearCheckpoint();
        resetGame();
        gToast('已从第一天重新开始');
      }
    });
  }

  /* 长按触发（隐秘入口用；jsdom 里不派生灵异事件，只是多个监听） */
  function bindLongPress(el, ms, fn) {
    if (!el) return;
    var timer = null;
    function stop() { if (timer) { clearTimeout(timer); timer = null; } }
    function start() { stop(); timer = setTimeout(function () { timer = null; fn(); }, ms); }
    el.addEventListener('mousedown', start);
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('mouseup', stop);
    el.addEventListener('mouseleave', stop);
    el.addEventListener('touchend', stop);
    el.addEventListener('touchcancel', stop);
  }

  function resetGame() {
    S = freshState();
    clearSave();
    endModalEl.classList.remove('show');
    modalEl.classList.remove('show');
    if (confirmBoxEl) confirmBoxEl.classList.remove('show');
    switchTab('log');
    for (var i = 0; i < D.CHAT.intro.length; i++) addLog(D.CHAT.intro[i], '');
    for (var j = 0; j < D.CHAT.tutorial.length; j++) addLog(D.CHAT.tutorial[j], 'sys');
    S.logDirty = true;
    S.memDirty = true;
    renderLog();
    renderStoryPane();
    renderMemPane();
    renderTicketPane();
    gRenderHUD();
    updateMusic();
    if (DEV.open && devBodyEl) renderDevPanel();
  }

  function boot() {
    cacheDom();
    buildLabels();
    bindEvents();
    var saved = loadGame();
    S = saved || freshState();
    seedArch(); /* 老存档里"已经打过但没记档"的剧情，补进回顾 */
    if (!saved || !S.log.length) {
      for (var i = 0; i < D.CHAT.intro.length; i++) addLog(D.CHAT.intro[i], '');
      for (var j = 0; j < D.CHAT.tutorial.length; j++) addLog(D.CHAT.tutorial[j], 'sys');
    } else {
      setTimeout(function () { gToast('已恢复上次的值班进度'); }, 400);
    }
    switchTab('log');
    renderLog();
    renderStoryPane();
    renderMemPane();
    renderTicketPane();
    gRenderHUD();
    if (btnBgmEl) {
      btnBgmEl.textContent = MUSIC.enabled() ? '♪ 开' : '♪ 关';
      btnBgmEl.classList.toggle('off', !MUSIC.enabled());
    }
    updateMusic();
    if (store.kind !== 'local') {
      setTimeout(function () { gToast('当前环境无法持久存储，结局收集仅本次有效'); }, 800);
    }
    last = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
    rafId = requestAnimationFrame(loop);
  }

  /* ---------- 开发者模式（DEV 按钮 / ` / F2 呼出，测试专用） ---------- */

  function toggleDevPanel(force) {
    DEV.open = force === undefined ? !DEV.open : !!force;
    if (devPanelEl) devPanelEl.classList.toggle('show', DEV.open);
    if (btnDevEl) btnDevEl.classList.toggle('on', DEV.open);
    if (DEV.open) renderDevPanel();
  }

  function devSec(t) { return '<div class="dv-sec">' + t + '</div>'; }

  function devBtn(action, label, cls) {
    return '<button data-dev="' + action + '"' + (cls ? ' class="' + cls + '"' : '') + '>' + label + '</button>';
  }

  function devGrid(rows, tp) {
    return '<div class="dv-grid' + (tp ? ' tp' : '') + '">' + rows.join('') + '</div>';
  }

  function renderDevPanel() {
    if (!devBodyEl) return;
    var i, all;
    var h = '';
    h += devSec('资源 / 时间');
    h += devGrid([
      devBtn('gold:+10', '+10◆'), devBtn('gold:+50', '+50◆'),
      devBtn('gold:0', '清零'), devBtn('time:+60', '+1 分钟')
    ]);
    h += devSec('记忆');
    h += devGrid([
      devBtn('mem:restore', '全部恢复'), devBtn('mem:pawn_all', '全部典当')
    ]);
    h += devSec('行囊 / 信物');
    h += devGrid([
      devBtn('item:key', '铜钥匙'), devBtn('item:lantern', '雾灯'),
      devBtn('item:album', '旧相册'), devBtn('relics:all', '三信物', 'warn')
    ]);
    h += devSec('剧情跳跃');
    h += devGrid([
      devBtn('story:inner', '开里屋'), devBtn('story:act2', '进二幕'),
      devBtn('pages:all', '五页日记'), devBtn('story:act3', '进三幕'),
      devBtn('gate:enter', '推雾门', 'warn'), devBtn('skip:story', '⏭ 跳过对话')
    ]);
    h += devSec('正篇《雾季十年》');
    h += devGrid([
      devBtn('main:go', '▶ 开正篇', 'gold'), devBtn('testimony:1', '证词 +1')
    ]);
    var chBtns = [];
    for (i = 1; i <= 3; i++) chBtns.push(devBtn('act:' + i, '第' + i + '章 ' + actName(i)));
    chBtns.push(devBtn('act:4', '接柜'));
    h += devGrid(chBtns, true);
    h += devSec('传送（自动落到可互动格）');
    all = D.PLACES.concat(D.NPCS);
    var tps = [];
    for (i = 0; i < all.length; i++) tps.push(devBtn('tp:' + all[i].id, all[i].name));
    h += devGrid(tps, true);
    h += devSec('选项');
    h += devGrid([
      devBtn('sw:clip', '穿墙', DEV.clip ? 'on' : ''),
      devBtn('sw:freeze', '时间冻结', DEV.freeze ? 'on' : ''),
      devBtn('sw:speed', '移速 ' + DEV.speed + 'x', DEV.speed > 1 ? 'on' : '')
    ]);
    h += devSec('直达结局（计入结局收集）');
    h += devGrid([
      devBtn('end:true_end', '雾散'), devBtn('end:keeper', '守灯人'),
      devBtn('end:half', '一半的我'), devBtn('end:blank', '空白之人')
    ]);
    h += devGrid([devBtn('reset', '↺ 重开一局', 'warn')]);
    h += devSec('麻烦的手续（点了要过确认框）');
    h += devGrid([devBtn('wipe', '⌫ 从第一天重新开始', 'warn')]);
    devBodyEl.innerHTML = h;
    /* 一局结束后（结局画面）除「重开」外全部置灰 */
    var over = !S || S.phase !== 'play';
    if (over) {
      var btns = devBodyEl.querySelectorAll('button[data-dev]');
      for (var b = 0; b < btns.length; b++) {
        if (btns[b].getAttribute('data-dev') !== 'reset') btns[b].disabled = true;
      }
    }
  }

  /* 螺旋搜索距目标 ≤3 格的可站立格，保证传过去按 E 就能互动 */
  function devSpawnOf(it) {
    var r, dx, dy;
    for (r = 0; r <= 3; r++) {
      for (dy = -r; dy <= r; dy++) {
        for (dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) + Math.abs(dy) !== r) continue;
          if (!D.isSolid(it.x + dx, it.y + dy)) return [it.x + dx, it.y + dy];
        }
      }
    }
    return [it.x, it.y];
  }

  function devTp(id) {
    var it = findPlace(id);
    if (!it) return false;
    var p = devSpawnOf(it);
    S.px = p[0]; S.py = p[1]; S.tx = p[0]; S.ty = p[1];
    S.moveT = 0;
    heldDirs.length = 0;
    gToast('传送 · ' + it.name);
    return true;
  }

  /* 自动推进剧情：翻完所有对话页 + 自动答对雾门三连问；停在需要玩家抉择的面板 */
  function devSkipStory() {
    var guard = 0;
    while (guard++ < 500) {
      if (!S || S.phase !== 'play') break;
      if (S.dialogQ) { pageNext(); continue; }
      if (S.modal && S.modal.kind === 'quiz') {
        var q = D.CHAT.story.quiz[S.quizIdx];
        if (q) { answerQuiz(q.right); continue; }
      }
      break;
    }
    if (S && S.phase === 'play' && !S.dialogQ && !S.modal && S.scene === 'mist') S.scene = 'town';
  }

  function devAction(act) {
    if (!S) return false;
    var parts = String(act).split(':');
    var head = parts[0], tail = parts.slice(1).join(':');
    if (head !== 'reset' && head !== 'main' && S.phase !== 'play') return false;
    var i, r = true;
    switch (head) {
      case 'gold':
        if (tail === '0') S.gold = 0;
        else S.gold += parseInt(tail, 10) || 0;
        gToast('当金 · ' + S.gold + '◆');
        break;
      case 'interest':
        if (tail === '0') S.interest = 0;
        else S.interest = Math.max(0, S.interest + (parseInt(tail, 10) || 0));
        gToast('（DEV）利息 · ' + S.interest + '%');
        break;
      case 'time':
        S.t += parseInt(tail, 10) || 60;
        gToast('时间快进 +1 分钟');
        break;
      case 'mem':
        if (tail === 'restore') {
          for (i = 0; i < D.MEMORIES.length; i++) {
            S.mem[D.MEMORIES[i].id].state = 'held';
            S.mem[D.MEMORIES[i].id].pawnedAt = 0;
          }
          gToast('全部记忆已恢复');
        } else if (tail === 'pawn_all') {
          var gained = 0;
          for (i = 0; i < D.MEMORIES.length; i++) {
            var mm = D.MEMORIES[i];
            if (S.mem[mm.id].state === 'held' && pawnMemory(mm.id)) gained += mm.w;
          }
          gToast('全部典当 +' + gained + '◆');
        }
        break;
      case 'item': {
        var names = { key: '铜钥匙当票', lantern: '雾灯', album: '旧相册' };
        if (tail === 'all') { S.items.key = S.items.lantern = S.items.album = true; gToast('行囊三件已入手'); }
        else if (names[tail]) { S.items[tail] = true; gToast('已入手 · ' + names[tail]); }
        break;
      }
      case 'relics':
        S.relics.photo = S.relics.watch = S.relics.ribbon = true;
        gMarkArch('relic_photo'); gMarkArch('relic_watch'); gMarkArch('relic_ribbon');
        addLog('（DEV）三件信物已集齐。', 'sys');
        gToast('三信物已集齐');
        break;
      case 'story':
        if (tail === 'inner') { S.innerOpen = true; gMarkArch('act2open'); gToast('里屋已解锁'); }
        else if (tail === 'act2') {
          S.innerOpen = true; S.story = 'act2';
          gMarkArch('act2open');
          addLog('（DEV）跳到第二幕：去找五页日记。', 'sys');
          gToast('第二幕 · 开始');
        } else if (tail === 'act3') {
          S.innerOpen = true; S.story = 'act3';
          for (var pg in D.CHAT.story.pages) S.pages[pg] = true;
          gMarkArch('act2open');
          gMarkArch('diarydone'); gMarkArch('gate'); gMarkArch('quiz'); gMarkArch('final');
          for (var pk in D.CHAT.story.pages) gMarkArch('diary_' + pk);
          addLog('（DEV）跳到第三幕：雾门已开。', 'sys');
          gToast('第三幕 · 雾门已开');
        }
        break;
      case 'pages':
        for (var p2 in D.CHAT.story.pages) S.pages[p2] = true;
        for (var p3 in D.CHAT.story.pages) gMarkArch('diary_' + p3);
        gToast('五页日记已集齐');
        break;
      case 'gate':
        closeModal();
        openMistGate();
        break;
      case 'skip':
        devSkipStory();
        break;
      case 'tp':
        r = devTp(tail);
        break;
      case 'sw':
        if (tail === 'clip') { DEV.clip = !DEV.clip; gToast('穿墙 · ' + (DEV.clip ? '开' : '关')); }
        else if (tail === 'freeze') { DEV.freeze = !DEV.freeze; gToast('时间冻结 · ' + (DEV.freeze ? '开（断当暂停）' : '关')); }
        else if (tail === 'speed') { DEV.speed = DEV.speed >= 3 ? 1 : DEV.speed + 1; gToast('移速 · ' + DEV.speed + 'x'); }
        break;
      case 'end':
        if (D.CHAT.endings[tail]) endGame(tail);
        else if (D.MAIN.endings[tail]) {
          if (S.mode !== 'main') { S.mode = 'main'; S.chapter = 10; }
          mainEnd(tail);
        }
        break;
      case 'act': {
        /* 跳章（幕）：落到该章第一段 */
        var an3 = parseInt(tail, 10), am3 = actMeta(an3);
        if (am3) {
          if (S.mode !== 'main') {
            S.mode = 'main';
            S.story = 'act3'; S.innerOpen = true; S.wine = true;
            S.pages = { p1: true, p2: true, p3: true, p4: true, p5: true };
          }
          S.chapter = am3.from;
          S.memDirty = true;
          closeModal();
          updateMusic();
          gToast('（DEV）正篇 · ' + actLabel(an3));
        }
        break;
      }
      case 'chapter': {
        /* 跳段（内部调试用）：1~11 是章内段落 */
        var cn = parseInt(tail, 10);
        if (cn >= 1 && cn <= 11) {
          if (S.mode !== 'main') {
            S.mode = 'main';
            S.story = 'act3'; S.innerOpen = true; S.wine = true;
            S.pages = { p1: true, p2: true, p3: true, p4: true, p5: true };
          }
          S.chapter = cn;
          S.memDirty = true;
          closeModal();
          updateMusic();
          gToast('（DEV）段 ' + cn + ' · ' + (D.MAIN.chapters[cn] ? D.MAIN.chapters[cn].title : '') + '（' + actLabel(actOfStep(cn)) + '）');
        }
        break;
      }
      case 'testimony':
        S.testimony += parseInt(tail, 10) || 1;
        gToast('（DEV）证词 · ' + S.testimony);
        break;
      case 'main':
        startMain();
        break;
      case 'wipe':
        askFirstDay();          /* 二次确认，绝不一键直开 */
        break;
      case 'reset':
        resetGame();
        updateMusic();
        gToast('（DEV）已重开一局');
        break;
      default:
        r = false;
    }
    S.memDirty = true;
    S.logDirty = true;
    gRenderHUD();
    renderDevPanel();
    return r;
  }

  /* ---------- 调试接口 ---------- */

  function gStats() {
    var d = D.derived(S);
    var memStates = {};
    for (var i = 0; i < D.MEMORIES.length; i++) {
      memStates[D.MEMORIES[i].id] = S.mem[D.MEMORIES[i].id].state;
    }
    return {
      phase: S.phase, t: Math.round(S.t * 100) / 100, gold: S.gold,
      integrity: Math.round(d.integrity * 1000) / 1000,
      lostCount: d.lostCount, pawnedCount: d.pawned.length,
      heldCount: D.MEMORIES.length - d.lostCount - d.pawned.length,
      mem: memStates, items: S.items, relics: S.relics,
      innerOpen: S.innerOpen, modal: S.modal ? S.modal.kind : null,
      logCount: S.log.length, pos: [S.px, S.py],
      ended: S.ended, earlyRedeem: d.earliestRedeem,
      allRelics: d.allRelics, hints: S.hints,
      jobs: S.jobs,
      story: S.story, pagesCount: D.pagesCountOf(S), pages: S.pages, wine: S.wine, scene: S.scene,
      quizIdx: S.quizIdx,
      mode: S.mode, chapter: S.chapter, interest: S.interest, testimony: S.testimony,
      mainFlags: S.mainFlags,
      mini: S.mini ? S.mini.key : null,
      music: musicKey()
    };
  }

  window.PAWN_DEBUG = {
    get S() { return S; },
    derived: function () { return D.derived(S); },
    tick: gTick,
    setPos: function (x, y) { S.px = x; S.py = y; S.tx = x; S.ty = y; S.moveT = 0; },
    clearKeys: function () { heldDirs.length = 0; },
    setStory: function (s) { S.story = s; if (s === 'act3') S.innerOpen = true; },
    givePage: function (id) { if (D.CHAT.story.pages[id]) S.pages[id] = true; },
    interact: gInteract,
    openPlace: function (id) { openEvent(findPlace(id)); },
    pawnMemory: pawnMemory,
    redeemMemory: redeemMemory,
    buyTicket: buyTicket,
    answerRiddle: answerRiddle,
    knock: function (seq) {
      S.knockSeq = [];
      S.knockWrong = false;
      for (var i = 0; i < seq.length; i++) {
        if (S.relics.ribbon) break;
        S.knockSeq.push(seq[i]);
        if (seq[i] !== KNOCK_TARGET[i]) { S.knockWrong = true; S.knockSeq = []; return false; }
      }
      if (S.knockSeq.length === KNOCK_TARGET.length) {
        S.relics.ribbon = true;
        S.knockSeq = [];
        S.memDirty = true;
        addLog('你在码头敲对了暗号，取到了<b>她的发绳</b>。', 'sys');
        return true;
      }
      return false;
    },
    enterInner: enterInner,
    stats: gStats,
    endings: gLoadEndings,
    seedArch: seedArch,
    openArch: openArch,
    visible: function (id) {
      var it = null, all = D.PLACES.concat(D.NPCS);
      for (var i = 0; i < all.length; i++) if (all[i].id === id) { it = all[i]; break; }
      return it ? itVisible(it) : null;
    },
    startMain: startMain,
    loadRaw: loadGame,
    checkpoint: {
      has: hasCheckpoint,
      tag: checkpointTag,
      raw: checkpointRaw,
      load: loadCheckpoint,
      save: saveCheckpoint,
      clear: clearCheckpoint,
      restore: restoreCheckpoint
    },
    askFirstDay: askFirstDay,
    miniInfo: miniInfo,
    ledgerCase: function () { return (S.mini && S.mini.key === 'ledger') ? S.mini.case : null; },
    openMini: openMini,
    musicKey: musicKey,
    resolve: function (text) { return D.resolveText(text, S); },
    toggleDev: function () { toggleDevPanel(); },
    dev: devAction,
    devSkip: devSkipStory,
    reset: resetGame
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
