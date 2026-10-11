/* 记忆当铺 v23 · 引擎（6 张场景图 / 32 任务 / 12 谜题 / 4 结局 / 通关后世界档案）
   数据来源：js/story23.js（世界）+ js/puzzles23.js（谜题）；音频沿用 audio.js / music.js。
   设计口径：① 不进 DOM 每帧重建（脏标记）② 逻辑与渲染分离，可被无头测试驱动 ③ 手机触屏可完成一切操作 */
(function (global) {
  'use strict';

  var D = global.WORLD;
  if (!D) { console.error('[v23] 找不到 WORLD（js/story23.js 没加载）'); return; }

  var GRID_W = 20, GRID_H = 14, CELL = 48;
  var SAVE_KEY = 'mp23-save-v1', CHECK_KEY = 'mp23-check-v1', END_KEY = 'mp23-endings-v1';
  var LEGACY_KEYS = ['mp-save-v1', 'mp-checkpoint-v1', 'mp-endings-v1', 'mp-archive-v1'];

  var canvas, ctx, S = null, raf = 0, lastT = 0, toastT = 0, bannerT = 0;
  var keys = {}, moveCd = 0, portalCd = 0, dirty = { hud: 1, log: 1, tasks: 1, album: 1, arch: 1, mem: 1 };
  var endingRun = [];

  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function store() { try { return global.localStorage; } catch (e) { return null; } }

  /* ---------- 存档 ---------- */
  function freshState() {
    return {
      scene: 'lighthouse', x: 3, y: 12, tx: 3, ty: 12, mt: 0, face: 1, mx: 3, my: 12,
      act: 1, maxAct: 1, gold: 0, flags: {}, photos: {}, tasks: {}, mem: D.mem23Fresh(), scrolls: 0,
      caught: {}, log: [], seen: {}, ended: null, cleared: false,
      pawned: 0, redeemed: 0, helped: [], introDone: false, t: 0, name: ''
    };
  }
  function save() {
    var st = store(); if (!st) return;
    try { st.setItem(SAVE_KEY, JSON.stringify(pack())); } catch (e) { /* ignore */ }
  }
  function pack() {
    return { v: 23, scene: S.scene, x: S.x, y: S.y, act: S.act, maxAct: S.maxAct, gold: S.gold,
      flags: S.flags, photos: S.photos, tasks: S.tasks, mem: S.mem, scrolls: S.scrolls, caught: S.caught, log: S.log.slice(-200),
      seen: S.seen, ended: S.ended, cleared: S.cleared, pawned: S.pawned, redeemed: S.redeemed,
      helped: S.helped, introDone: S.introDone, t: Math.round(S.t) };
  }
  function load() {
    var st = store(); if (!st) return null;
    try {
      var raw = st.getItem(SAVE_KEY); if (!raw) return null;
      var o = JSON.parse(raw); if (!o || o.v !== 23) return null;
      var s = freshState();
      Object.keys(o).forEach(function (k) { if (k in s) s[k] = o[k]; });
      return s;
    } catch (e) { return null; }
  }
  function legacyNotice() {
    var st = store(); if (!st) return false;
    for (var i = 0; i < LEGACY_KEYS.length; i++) if (st.getItem(LEGACY_KEYS[i])) return true;
    return false;
  }
  function saveCheckpoint() {
    var st = store(); if (!st) return;
    try { st.setItem(CHECK_KEY, JSON.stringify({ v: 23, at: Date.now(), state: pack() })); } catch (e) { /* ignore */ }
  }
  function checkpointRaw() { var st = store(); if (!st) return null; try { return st.getItem(CHECK_KEY); } catch (e) { return null; } }
  function loadCheckpoint() {
    var raw = checkpointRaw(); if (!raw) return null;
    try { var o = JSON.parse(raw); return o && o.v === 23 ? o.state : null; } catch (e) { return null; }
  }
  function endingsRun() {
    var st = store(); if (!st) return [];
    try { return JSON.parse(st.getItem(END_KEY) || '[]') || []; } catch (e) { return []; }
  }
  function markEnding(id) {
    var st = store();
    endingRun = endingsRun();
    if (endingRun.indexOf(id) < 0) endingRun.push(id);
    if (st) { try { st.setItem(END_KEY, JSON.stringify(endingRun)); } catch (e) { /* ignore */ } }
  }

  /* ---------- 工具 ---------- */
  function toast(msg) {
    var t = $('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show'); toastT = 2.6;
  }
  function addLog(raw) { S.log.push({ t: Math.round(S.t), raw: raw }); if (S.log.length > 300) S.log.shift(); dirty.log = 1; }
  function sfx(name) { try { if (global.SFX && global.SFX[name]) global.SFX[name](); } catch (e) { /* ignore */ } }
  function music(key) { try { if (global.MUSIC && key) global.MUSIC.play(key); } catch (e) { /* ignore */ } }
  function banner(main, sub) {
    var b = $('scene-banner'); if (!b) return;
    b.innerHTML = main + '<small>' + (sub || '') + '</small>';
    b.classList.add('on'); bannerT = 2.4;
  }

  /* ---------- 场景 ---------- */
  function scene() { return D.SCENES[S.scene]; }
  function solid(x, y) { return D.isSolidIn(S.scene, x, y); }

  /* 走进某个场景就等于完成对应任务（主线：进镇 / 进馆 / 进雾） */
  var SCENE_FLAG = { town: 'town_entered', archive: 'archive_entered', mist: 'mist_entered' };

  function enterScene(sid, x, y, opts) {
    var sc = D.SCENES[sid]; if (!sc) return;
    S.scene = sid;
    S.x = S.tx = (x == null ? sc.spawn.x : x);
    S.y = S.ty = (y == null ? sc.spawn.y : y);
    S.mx = S.x; S.my = S.y; bgDirty = true;   /* 换场景重烘焙底图，显示坐标直接对齐 */
    S.mt = 0;
    portalCd = 0.5;
    banner(sc.name, sc.sub);
    sfx('door');
    var act = sc.act || 1;
    if (!opts || !opts.silent) addLog('【' + sc.name + '】' + sc.sub);
    if (act > S.maxAct) {
      S.maxAct = act; S.act = act;
      saveCheckpoint();
      var open = (D.TEXT.actOpen && D.TEXT.actOpen[act]) || [];
      if (open.length) say(open, null);
      music('m' + Math.min(act, 5));
    } else {
      S.act = Math.max(S.act, act);
    }
    if (SCENE_FLAG[sid] && !(opts && opts.silent)) markFlag(SCENE_FLAG[sid]);
    dirty.hud = 1; dirty.tasks = 1;
    save();
  }

  /* ---------- 旗标 / 任务 ---------- */
  /* 派生旗标：几个旗标凑齐了，某个任务自然就成立（不靠玩家专门去点） */
  var DERIVED = [
    { flag: 'customers_done', needs: ['bell_rope', 'read_letter', 'seat_lamp_owner', 'first_pawn'] },
    { flag: 'salt_done', needs: ['salt3', 'sluice_ok'] },
    { flag: 'gap_seen', needs: ['diary_ok', 'book_read'] },
    { flag: 'tide_low', needs: ['dike_fixed', 'sluice_ok'] },
    { flag: 'contract_seen', needs: ['search_ok', 'name_ok'] }
  ];
  var DERIVED_TEXT = {
    gap_seen: function () { say(D.TEXT.gap || []); },
    contract_seen: function () { say((D.TEXT.contract || []).concat(D.TEXT.tear2 || [])); }
  };
  function runDerived() {
    for (var pass = 0; pass < 3; pass++) {
      var changed = false;
      DERIVED.forEach(function (r) {
        if (S.flags[r.flag]) return;
        var hit = r.needs.every(function (f) { return !!S.flags[f]; });
        if (!hit) return;
        S.flags[r.flag] = 1;
        changed = true;
        var t = D.TASKS.filter(function (x) { return x.flag === r.flag; })[0];
        if (t) { S.tasks[t.id] = 1; toast('任务完成 · ' + t.title); addLog('✓ 任务完成：' + t.title); sfx('open'); }
        if (DERIVED_TEXT[r.flag]) DERIVED_TEXT[r.flag]();
      });
      if (!changed) break;
    }
    awardPhotos();
  }

  function markFlag(flag) {
    if (!flag || S.flags[flag]) return;
    S.flags[flag] = 1;
    runDerived();
    var hit = D.TASKS.filter(function (t) { return t.flag === flag; });
    hit.forEach(function (t) {
      S.tasks[t.id] = 1;
      toast('任务完成 · ' + t.title);
      addLog('✓ 任务完成：' + t.title + '（' + t.brief + '）');
      sfx('open');
    });
    awardPhotos();
    dirty.hud = 1; dirty.tasks = 1; dirty.album = 1; dirty.arch = 1; dirty.mem = 1;
    save();
  }
  /* 相簿四张的取得规则（写在引擎里，测试可查） */
  var PHOTO_RULES = [
    { photo: 'p1', flag: 'got_album' },
    { photo: 'p2', flag: 'got_photo2' },
    { photo: 'p3', flag: 'read_scrolls' },
    { photo: 'p4', flag: 'song_ok' }
  ];
  function awardPhotos() {
    PHOTO_RULES.forEach(function (r) {
      if (S.flags[r.flag] && !S.photos[r.photo]) {
        S.photos[r.photo] = 1;
        var ph = D.PHOTOS.filter(function (p) { return p.id === r.photo; })[0];
        if (ph) { toast('相簿 +1 · ' + ph.name); addLog('相簿添了一张：' + ph.text); sfx('coin'); }
      }
    });
  }
  function taskDone(t) { return !!S.tasks[t.id]; }
  function nextMainTask() {
    for (var i = 0; i < D.TASKS.length; i++) if (D.TASKS[i].kind === 'main' && !taskDone(D.TASKS[i])) return D.TASKS[i];
    return null;
  }

  /* ---------- 对话 ---------- */
  var dlg = null;
  function say(lines, done, opts) {
    dlg = { lines: (lines || []).slice(), i: 0, done: done || null, opts: opts || {} };
    if (!dlg.lines.length) { var d0 = dlg; dlg = null; if (d0.done) d0.done(); return; }
    openModal();
    renderDialog();
  }
  function renderDialog() {
    if (!dlg) return;
    if (dlg.i >= dlg.lines.length) {
      var d = dlg; dlg = null; closeModal();
      if (d.done) d.done();
      return;
    }
    setTitle(dlg.opts.title || '');
    setBody('<p class="dlg-line">' + dlg.lines[dlg.i] + '</p>');
    setBtns([{ label: dlg.i >= dlg.lines.length - 1 ? (dlg.opts.end || '好') : '继续', fn: function () { if (!dlg) return; dlg.i++; renderDialog(); } }]);
    sfx('click');
  }

  /* ---------- 弹窗 ---------- */
  var modalOpen = false;
  function setTitle(t) { var m = $('m-title'); if (m) { m.innerHTML = t || ''; m.style.display = t ? '' : 'none'; } }
  function setBody(html) { var m = $('m-body'); if (m) m.innerHTML = html || ''; }
  function setBtns(list) {
    var m = $('m-btns'); if (!m) return;
    m.innerHTML = '';
    (list || []).forEach(function (b) {
      var el = document.createElement('button');
      el.textContent = b.label;
      el.onclick = function () { sfx('select'); b.fn(); };
      m.appendChild(el);
    });
  }
  function openModal() {
    var m = $('modal'); if (m) m.classList.add('show');
    modalOpen = true;
    if (document.body) document.body.classList.add('mp-modal');   /* 手机：弹窗期间收起触屏控件，别压住谜题 */
  }
  /* 关弹窗要把按钮一起清掉 —— 否则旧按钮留在 DOM 里，再点就是空指针（v23 实测踩过） */
  function closeModal() {
    var m = $('modal'); if (m) m.classList.remove('show');
    if (document.body) document.body.classList.remove('mp-modal');
    modalOpen = false;
    var b = $('m-btns'); if (b) b.innerHTML = '';
  }
  function modalBody() { return $('m-body'); }

  /* ---------- 交互 ---------- */
  function nearestPlace() {
    var sc = scene(), best = null, bd = 99;
    for (var i = 0; i < sc.places.length; i++) {
      var p = sc.places[i];
      var d = Math.abs(p.x - S.tx) + Math.abs(p.y - S.ty);
      if (d <= 1 && d < bd) { bd = d; best = p; }
    }
    return best;
  }
  function interact() {
    if (modalOpen || dlg) return;
    var p = nearestPlace();
    if (!p) { toast('这里没什么可看的。'); return; }
    if (p.need && !S.flags[p.need]) { toast('还不行——先把前面那件事做完。'); return; }
    sfx('select');
    var first = !S.seen[p.id];
    S.seen[p.id] = 1;
    var lines = (first || !p.again) ? (p.say || []) : p.again;
    say(lines, function () {
      /* 分发顺序有讲究：买/干活/当记/念卷宗这些"面板类"交互不能先被通用 markFlag 吃掉
         —— 寄售架带 flag=got_album，先置旗标就会变成"不花钱白拿相簿"（实测踩过） */
      if (p.kind === 'portal' && p.to) { enterScene(p.to, p.tx, p.ty); return; }
      if (p.kind === 'work') { workPanel(p); return; }
      if (p.kind === 'pawn') { pawnPanel(); return; }
      if (p.kind === 'scrolls') { scrollsPanel(p); return; }
      if (p.kind === 'buy') { buyItem(p); return; }
      if (p.kind === 'puzzle') { if (p.flag) markFlag(p.flag); openPuzzle(p.puz); return; }
      if (p.flag) markFlag(p.flag);
      if (p.to) enterScene(p.to, p.tx, p.ty);
      else if (p.kind === 'jobs') jobsPanel();
    }, { title: p.name });
  }
  function openPuzzle(puzId) {
    var p = D.PUZZLES[puzId]; if (!p) return;
    if (p.need && !S.flags[p.need]) { toast('还不行——先把前面的事做完。'); return; }
    openModal();
    PUZZLES23.open(puzId);
  }
  function buyItem(p) {
    if (S.flags[p.flag]) { toast('已经在你手里了。'); return; }
    if (S.gold < p.price) { toast('当金不够——要 ' + p.price + ' 枚，你有 ' + S.gold + ' 枚。'); return; }
    setTitle(p.name);
    setBody('<p class="pz-tip">' + (p.say || []).join('</p><p class="pz-tip">') + '</p><p class="pz-tip">售价 ' + p.price + ' 枚当金（你有 ' + S.gold + ' 枚）</p>');
    setBtns([
      { label: '买下（' + p.price + ' 枚）', fn: function () {
        S.gold -= p.price; markFlag(p.flag); sfx('coin'); closeModal(); dirty.hud = 1; save();
        toast('买下了 · ' + p.name);
      } },
      { label: '先不买', fn: function () { closeModal(); } }
    ]);
    openModal();
  }
  function jobsPanel() {
    setTitle('告示牌 · 零工');
    setBody('<p class="pz-tip">搬盐、补网、替人读信。做一趟 6 枚当金。</p>');
    setBtns([
      { label: '搬一趟盐（+6）', fn: function () {
        S.gold += 6; dirty.hud = 1; save();
        toast('当金 +6（现在 ' + S.gold + '）'); sfx('coin');
        addLog('在告示牌接了一趟零工：搬盐，得 6 枚当金。');
        closeModal();
      } },
      { label: '算了', fn: function () { closeModal(); } }
    ]);
    openModal();
  }

  /* 干活：一次互动就把这件事做完（修堤 / 巡礁 / 晒盐） */
  function workPanel(p) {
    if (S.flags[p.flag]) { setTitle(p.name); setBody('<p class="pz-tip">' + (p.workDone || '已经做完了。') + '</p>'); setBtns([{ label: '好', fn: closeModal }]); openModal(); return; }
    setTitle(p.name);
    setBody('<p class="pz-tip">' + (p.say || []).slice(-1)[0] + '</p>');
    setBtns([
      { label: p.workLabel || '动手', fn: function () {
        markFlag(p.flag); sfx('open'); closeModal();
        toast(p.workDone || '做完了。');
        addLog('（' + p.name + '）' + (p.workDone || '做完了。'));
      } },
      { label: '先不做', fn: closeModal }
    ]);
    openModal();
  }

  /* 当记 / 赎记：当铺柜台 */
  function pawnPanel() {
    function list(state) {
      return D.MEM23.filter(function (m) { return S.mem[m.id] && S.mem[m.id].state === state; });
    }
    function render() {
      var held = list('held'), pn = list('pawned');
      var html = '<p class="pz-tip">当金 = 这段记的痛感。当出去能换钱，赎回来要原价——一来一回不赚不亏。</p>';
      html += '<div class="arc-h">押在账上的（' + pn.length + '）——赎回要付当金</div>';
      html += pn.map(function (m) {
        var st = S.mem[m.id];
        return '<div class="arc-item"><b>' + m.id + '</b>' + m.text + '<br>' +
          '<button class="pz-btn" data-redeem="' + m.id + '">赎回（−' + m.w + '）</button></div>';
      }).join('') || '<div class="arc-lock">账上没有押着东西。</div>';
      html += '<div class="arc-h">还在身上的（' + held.length + '）</div>';
      html += held.map(function (m) {
        return '<div class="arc-item"><b>' + m.id + '</b>' + m.text + '<br>' +
          '<button class="pz-btn" data-pawn="' + m.id + '">当掉（+' + m.w + '）</button></div>';
      }).join('') || '<div class="arc-lock">身上空了。</div>';
      setTitle('记当铺 · 柜台');
      setBody(html);
      setBtns([{ label: '离开柜台', fn: closeModal }]);
      muddle();
    }
    function muddle() {
      var b = $('m-body');
      b.querySelectorAll('[data-pawn]').forEach(function (el) {
        el.onclick = function () {
          var id = el.getAttribute('data-pawn'), m = D.mem23ById(id);
          S.mem[id].state = 'pawned'; S.mem[id].pawns++;
          S.gold += m.w; sfx('coin');
          addLog('当掉了：' + m.text + '（+' + m.w + ' 枚）');
          toast('当掉 · ' + m.id + '（+' + m.w + '）');
          markFlag('first_pawn'); dirty.hud = 1; dirty.mem = 1; save(); render();
        };
      });
      b.querySelectorAll('[data-redeem]').forEach(function (el) {
        el.onclick = function () {
          var id = el.getAttribute('data-redeem'), m = D.mem23ById(id), cost = m.w;
          if (S.gold < cost) { toast('当金不够——赎回这段要 ' + cost + ' 枚。'); return; }
          S.gold -= cost; S.mem[id].state = 'held'; S.redeemed++;
          sfx('redeem'); dirty.hud = 1; dirty.mem = 1; save();
          addLog('赎回了：' + m.text);
          var tear = !!m.pawnedFromStart;
          closeModal();
          if (tear) {
            say(D.TEXT.tear1.slice(), function () { markFlag('redeemed_sis'); }, { title: '赎回来的那段记', end: '把手收回来' });
          } else {
            render();
          }
        };
      });
    }
    render();
    openModal();
  }

  /* 念卷宗给柳先生听：三册之后他给你那张夹在卷宗里的照片 */
  function scrollsPanel(p) {
    var SCROLLS = [
      '第一册：盐埕的潮位记。字很工整，是柳先生年轻时候的手。',
      '第二册：甲午年那场火的善后单。烧掉的东西列了三页，最后一行写着"替记契副本，四十七份"。',
      '第三册：一册没编号的薄本，里面夹着一张照片——三个人的合影，脸都被磨掉了，只剩衣服：一件守灯人的旧棉袄。'
    ];
    var i = S.scrolls || 0;
    setTitle(p.name + ' · 念卷宗');
    if (i >= SCROLLS.length) {
      setBody('<p class="pz-tip">三册都念完了。柳先生点点头，把那张照片推给你：「夹在这里很多年了。你拿着。」</p>');
      setBtns([{ label: '收下照片', fn: function () { closeModal(); markFlag('read_scrolls'); } }]);
      openModal(); return;
    }
    setBody('<p class="pz-tip">' + SCROLLS[i] + '</p><p class="pz-progress">已念 ' + i + '/' + SCROLLS.length + ' 册</p>');
    setBtns([
      { label: i === SCROLLS.length - 1 ? '念完这一册' : '念下一册', fn: function () {
        S.scrolls = i + 1; save(); sfx('click');
        if (S.scrolls >= SCROLLS.length) { closeModal(); markFlag('read_scrolls'); toast('相簿 +1 · 被磨掉脸的合影'); }
        else scrollsPanel(p);
      } },
      { label: '先不念', fn: closeModal }
    ]);
    openModal();
  }

  /* ---------- 谜题结算 ---------- */
  function solvePuzzle(puzId) {
    var p = D.PUZZLES[puzId];
    var flag = p.flag || (puzId === 'read_book' ? 'book_read' : (puzId === 'three_asks' ? 'asks_ok' : puzId + '_ok'));
    closeModal();
    sfx('open');
    toast('解开了 · ' + p.name);
    addLog('✦ 解开了「' + p.name + '」：' + (p.brief || ''));
    markFlag(flag);
    if (puzId === 'dial' && !S.flags.dial_ok) markFlag('dial_ok');
    save();
  }
  /* 结局 */
  function ending(id) {
    var e = D.ENDINGS.filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    closeModal();
    if (id === 'true_name') markFlag('name_returned');
    S.ended = id;
    S.cleared = true;
    markEnding(id);
    addLog('—— 结局：' + e.name);
    save();
    var stats = '<div class="pz-tip">走了 ' + Math.round(S.t / 60) + ' 分钟 · 任务 ' + doneCount() + '/' + D.TASKS.length +
      ' · 相簿 ' + D.photoCount(S) + '/4 · 当金 ' + S.gold + ' · 结局收集 ' + endingsRun().length + '/4</div>';
    $('end-name').textContent = (e.true ? '★ ' : '') + e.name;
    $('end-text').innerHTML = e.text.split('\n').map(function (l) { return '<p class="dlg-line">' + l + '</p>'; }).join('');
    $('end-stats').innerHTML = stats;
    $('btn-main').style.display = 'inline-block';
    $('end-modal').classList.add('show');
    sfx(e.true ? 'end' : 'endSad');
    music(e.true ? 'm4' : 'm5');
    dirty.arch = 1; dirty.tasks = 1; dirty.album = 1; dirty.mem = 1;
  }
  function doneCount() { return D.TASKS.filter(taskDone).length; }

  /* ---------- 侧栏 ---------- */
  function refreshHUD() {
    $('hud-gold').textContent = S.gold;
    $('hud-tasks').textContent = doneCount() + '/' + D.TASKS.length;
    $('hud-act').textContent = S.act;
    $('hud-scene').textContent = scene().name;
    var n = D.photoCount(S);
    $('hud-album').textContent = n + '/4';
    var bar = $('hud-album-bar'); if (bar) bar.style.width = Math.round(n / 4 * 100) + '%';
    var nt = nextMainTask();
    $('hud-goal').textContent = nt ? nt.title : '都做完了';
  }
  function refreshLog() {
    var p = $('pane-log'); if (!p) return;
    p.innerHTML = S.log.slice(-60).reverse().map(function (l) {
      return '<div class="arc-item">' + l.raw + '</div>';
    }).join('') || '<div class="arc-lock">还没有发生什么。</div>';
  }
  function refreshTasks() {
    var p = $('pane-tasks'); if (!p) return;
    var html = '';
    for (var a = 1; a <= 5; a++) {
      var list = D.tasksOfAct(a);
      html += '<div class="arc-h">第 ' + a + ' 幕（' + list.filter(taskDone).length + '/' + list.length + '）</div>';
      list.forEach(function (t) {
        var done = taskDone(t);
        html += '<div class="arc-item' + (done ? '' : (t.act === S.act ? '' : ' locked')) + '">' +
          (done ? '✓ ' : '○ ') + '<b>' + t.title + '</b>' + t.brief +
          (done ? '' : '<br><span style="color:var(--dim)">线索：' + t.hint + '</span>') + '</div>';
      });
    }
    p.innerHTML = html;
  }
  function refreshAlbum() {
    var p = $('pane-album'); if (!p) return;
    var html = '<div class="arc-h">姐姐的相簿（' + D.photoCount(S) + '/4）</div>';
    D.PHOTOS.forEach(function (ph) {
      var has = !!S.photos[ph.id];
      html += '<div class="arc-item' + (has ? '' : ' locked') + '"><b>' + (has ? '▣' : '▢') + ' ' + ph.name + '</b>' +
        (has ? ph.text : '（还没有 · ' + ph.get + '）') + '</div>';
    });
    html += '<div class="arc-h">提示</div><div class="arc-item">相簿四张齐，终幕才有「把名字还给她」。</div>';
    p.innerHTML = html;
  }
  /* 「记」面板：游戏叫记忆当铺，这一栏就是你的记
     规矩和主题一致 —— 当出去的记，在柜台看得见（当铺替你收着），在你身上是空的 */
  function refreshMem() {
    var p = $('pane-mem'); if (!p) return;
    var all = D.MEM23, held = [], pawned = [];
    all.forEach(function (m) {
      var st = S.mem[m.id] || { state: 'held', pawns: 0 };
      (st.state === 'pawned' ? pawned : held).push({ m: m, st: st });
    });
    var html = '<div class="arc-h">在身上的（' + held.length + '/' + all.length + '）</div>';
    html += held.map(function (x) {
      return '<div class="arc-item"><b class="mem-tag">' + x.m.tag + '</b>' + x.m.text +
        '<span class="mem-w">痛感 ' + x.m.w + '</span></div>';
    }).join('') || '<div class="arc-lock">身上一段记都没有了。</div>';
    html += '<div class="arc-h">押在柜上的（' + pawned.length + '）—— 当出去了，这儿就是空的</div>';
    html += pawned.map(function (x) {
      return '<div class="arc-item locked"><b class="mem-tag">' + x.m.tag + '</b>' +
        '<span class="mem-blank">（想不起来了 · 当票 ' + x.m.w + ' 枚' +
        (x.st.pawns > 1 ? ' · 当出去过 ' + x.st.pawns + ' 回' : '') + '）</span></div>';
    }).join('') || '<div class="arc-lock">柜上没押着东西。</div>';
    html += '<div class="arc-h">账</div>';
    html += '<div class="arc-item">当金结余 <b>' + S.gold + '</b> 枚 · 赎回累计 <b>' + (S.redeemed || 0) + '</b> 次</div>';
    html += '<div class="arc-item">当出去换钱，赎回来付原价 —— 一来一回不赚不亏，只是那段时间里，你会真的想不起它。</div>';
    if (pawned.length) html += '<div class="arc-item">押在柜上的，到记当铺柜台能赎回来。</div>';
    p.innerHTML = html;
  }
  function refreshArchive() {
    var p = $('pane-archive'); if (!p) return;
    if (!S.cleared && !endingsRun().length) {
      p.innerHTML = '<div class="arc-lock">世界档案要通关后才会打开。<br>灯亮过一整夜，账才合得上。</div>';
      return;
    }
    var html = '<div class="arc-h">岛史编年史</div>';
    D.CHRONICLE.forEach(function (c) { html += '<div class="arc-item"><b>' + c.y + '</b>' + c.t + '</div>'; });
    html += '<div class="arc-h">这一趟你做过的事</div>';
    html += '<div class="arc-item">任务完成：<b>' + doneCount() + '/' + D.TASKS.length + '</b></div>';
    html += '<div class="arc-item">相簿：<b>' + D.photoCount(S) + '/4</b></div>';
    html += '<div class="arc-item">当金结余：<b>' + S.gold + '</b></div>';
    var mains = D.TASKS.filter(function (t) { return t.kind === 'main' && taskDone(t); }).map(function (t) { return t.title; });
    html += '<div class="arc-item">走过的主线：' + (mains.join(' · ') || '（还没有）') + '</div>';
    html += '<div class="arc-h">结局图鉴（' + endingsRun().length + '/4）</div>';
    D.ENDINGS.forEach(function (e) {
      var got = endingsRun().indexOf(e.id) >= 0;
      html += '<div class="arc-item' + (got ? '' : ' locked') + '"><b>' + (got ? (e.true ? '★' : '●') : '○') + ' ' + e.name + '</b>' + e.cond + '</div>';
    });
    html += '<div class="arc-h">词条</div>';
    [['替记', '把记不住的东西从一个人身上搬到另一个人身上。'], ['雾客', '进水的人。站着不动，等一个想不起来的人。'],
      ['望归灯', '每夜亮一百分钟，给雾里的人认路。'], ['进水', '替记人背满了，先掉名字，再掉脸。'],
      ['契', '替记要立契，双方各系一根红线。'], ['灯号', '三长两短，先雾后灯。']].forEach(function (k) {
        html += '<div class="arc-item"><b>' + k[0] + '</b>' + k[1] + '</div>';
      });
    html += '<div class="arc-h">子页</div><div class="arc-item"><a href="v22.html" style="color:var(--gold2)">逐段回放（旧版 v22 的剧情回放）</a></div>';
    p.innerHTML = html;
  }
  function refreshPanels() {
    if (dirty.hud) { refreshHUD(); dirty.hud = 0; }
    if (dirty.log) { refreshLog(); dirty.log = 0; }
    if (dirty.tasks) { refreshTasks(); dirty.tasks = 0; }
    if (dirty.album) { refreshAlbum(); dirty.album = 0; }
    if (dirty.arch) { refreshArchive(); dirty.arch = 0; }
    if (dirty.mem) { refreshMem(); dirty.mem = 0; }
  }

  /* ---------- 渲染 ---------- */
  /* 画布逻辑尺寸固定 960x672；背板按 devicePixelRatio 放大，浏览器再缩放显示。
     以前画布就是 960 宽被拉大显示，线条和字全是糊的（实机反馈"画质太低"）。 */
  var VW = 960, VH = 672, SCALE = 1, bg = null, bgDirty = true;
  var MOVE_SPEED = 6.8;   /* 格/秒：走路是滑的，不是一格一格蹦 */
  var GROUND = {
    lighthouse: 'stone', town: 'plank', pawnshop: 'wood',
    saltflats: 'salt', archive: 'tile', mist: 'gravel'
  };
  function hash(x, y, k) {
    var n = (Math.abs(x) * 374761393 + Math.abs(y) * 668265263 + (k || 0) * 2246822519) >>> 0;
    n = (n ^ (n >>> 13)) >>> 0; n = (n * 1274126177) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }
  function shade(col, amt) {
    var m = /^#([0-9a-fA-F]{6})$/.exec(String(col || ''));
    if (!m) return String(col || '#000');
    var v = parseInt(m[1], 16), r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
    if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  function shadowUnder(c, px, py, rx, ry) {
    c.fillStyle = 'rgba(0,0,0,.30)';
    c.beginPath(); c.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2); c.fill();
  }
  /* 地面：每种场景一种铺法 + 逐格确定性微差，破掉"平铺棋盘"的廉价感 */
  function paintGround(c, pal, style) {
    c.fillStyle = pal.ground; c.fillRect(0, 0, VW, VH);
    for (var y = 0; y < GRID_H; y++) for (var x = 0; x < GRID_W; x++) {
      var px = x * CELL, py = y * CELL;
      var n1 = hash(x, y, 1), n2 = hash(x, y, 2), n3 = hash(x, y, 3);
      var base = ((x + y) % 2 === 0) ? pal.ground : pal.ground2;
      c.fillStyle = shade(base, (n1 - 0.5) * 0.22);
      c.fillRect(px, py, CELL, CELL);
      if (style === 'stone') {
        c.strokeStyle = 'rgba(0,0,0,.20)'; c.lineWidth = 1;
        c.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
        c.fillStyle = 'rgba(255,255,255,.045)'; c.fillRect(px + 2, py + 2, CELL - 4, 2);
        if (n2 > 0.88) {
          c.strokeStyle = 'rgba(0,0,0,.26)'; c.beginPath();
          c.moveTo(px + 8 + n3 * 8, py + 6); c.lineTo(px + 18 + n3 * 6, py + 22); c.lineTo(px + 28, py + 30); c.stroke();
        }
      } else if (style === 'plank' || style === 'wood') {
        var seam = style === 'wood' ? 12 : 16;
        c.strokeStyle = 'rgba(0,0,0,.26)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(px, py + seam + 0.5); c.lineTo(px + CELL, py + seam + 0.5); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,.05)';
        c.beginPath(); c.moveTo(px, py + seam - 0.5); c.lineTo(px + CELL, py + seam - 0.5); c.stroke();
        if (n2 > 0.62) {
          c.strokeStyle = 'rgba(0,0,0,.15)'; c.beginPath();
          c.moveTo(px + 2, py + 4 + n3 * 6); c.lineTo(px + CELL - 3, py + 5 + n3 * 6); c.stroke();
        }
        if (n2 > 0.94) { c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.arc(px + 14 + n3 * 18, py + 20, 2.4, 0, Math.PI * 2); c.fill(); }
      } else if (style === 'salt') {
        c.fillStyle = 'rgba(255,255,255,' + (0.03 + n1 * 0.05).toFixed(3) + ')';
        c.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
        c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 1;
        for (var r = 1; r <= 2; r++) { c.beginPath(); c.arc(px + 10 + r * 12, py + CELL - 6, 8 + r * 5, Math.PI * 1.15, Math.PI * 1.75); c.stroke(); }
      } else if (style === 'tile') {
        c.strokeStyle = 'rgba(0,0,0,.16)'; c.lineWidth = 1;
        c.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
        if (n2 > 0.90) { c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(px + 6, py + 6, 8, 8); }
      } else {
        for (var d = 0; d < 5; d++) {
          var hx = hash(x * 7 + d, y, 11), hy = hash(x, y * 7 + d, 13), hr = hash(x + d, y + d, 17);
          c.fillStyle = hr > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.18)';
          c.beginPath(); c.arc(px + hx * CELL, py + hy * CELL, 1 + hr * 1.6, 0, Math.PI * 2); c.fill();
        }
      }
    }
    /* 大尺度脏斑/补光：地面不是一块死板棋盘 */
    for (var i = 0; i < 26; i++) {
      var gx = hash(i, 3, 5) * VW, gy = hash(i, 4, 6) * VH, gr = 40 + hash(i, 5, 7) * 90;
      var g = c.createRadialGradient(gx, gy, 2, gx, gy, gr);
      g.addColorStop(0, hash(i, 6, 8) > 0.5 ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.035)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    }
  }
  /* 障碍：投影 + 上下渐变 + 砖缝，做出厚度（原来是纯色方块） */
  function paintSolids(c, sc, pal) {
    sc.solids.forEach(function (s) {
      var x = s[0] * CELL, y = s[1] * CELL, w = s[2] * CELL, h = s[3] * CELL;
      c.fillStyle = 'rgba(0,0,0,.30)';
      c.fillRect(x + 3, y + h - 4, w, 7);
      var g = c.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, shade(pal.solid, 0.18));
      g.addColorStop(0.55, pal.solid);
      g.addColorStop(1, shade(pal.solid, -0.28));
      c.fillStyle = g; c.fillRect(x, y, w, h);
      c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(x, y, w, 5);
      c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = 1;
      for (var sx = x + 24; sx < x + w - 2; sx += 24) { c.beginPath(); c.moveTo(sx + 0.5, y + 6); c.lineTo(sx + 0.5, y + h - 2); c.stroke(); }
      for (var sy = y + 22; sy < y + h - 2; sy += 22) { c.beginPath(); c.moveTo(x + 1, sy + 0.5); c.lineTo(x + w - 1, sy + 0.5); c.stroke(); }
      c.strokeStyle = 'rgba(0,0,0,.45)'; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    });
  }
  /* 人物：腿会迈、手会摆、有发型和脸；左上受光 + 右下压暗 + 暖轮廓光 */
  function drawFigure(c, x, y, col, face, lift, phase) {
    var px = x * CELL + CELL / 2, py = y * CELL + CELL / 2 - (lift || 0);
    var ph = (phase === undefined ? S.t * 11 : phase);
    var mv = (lift || 0) > 0.02 ? 1 : 0, sw = mv ? Math.sin(ph) : 0;
    var bob = mv ? Math.abs(Math.sin(ph)) * 0.55 : 0;
    var gy = py + 16 - bob, hip = gy - 9.5, sh = gy - 20.5, hyy = gy - 27;
    var hair = shade(col, -0.52), pants = shade(col, -0.4), boot = shade(col, -0.66);
    var f = face === 0 ? 0 : (face > 0 ? 1 : -1), r = 6.3;
    c.save(); c.lineCap = "round"; c.lineJoin = "round";
    shadowUnder(c, px, py + 17, 10.4 - bob * 0.5, 4);
    /* 腿：交替迈步 + 靴子 */
    for (var i = 0; i < 2; i++) {
      var off = i ? 2.5 : -2.5, sgn = i ? -1 : 1, sx = px + off + sw * sgn * 2.4;
      c.strokeStyle = pants; c.lineWidth = 3.6;
      c.beginPath(); c.moveTo(px + off * 0.82, hip); c.lineTo(sx, gy - 1.5); c.stroke();
      c.strokeStyle = boot; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(sx - 1.5, gy - 0.9); c.lineTo(sx + 2.3, gy - 0.9); c.stroke();
    }
    /* 大衣：A 字下摆，左上亮右下暗 */
    var cg = c.createLinearGradient(px - 8, sh, px + 7, gy);
    cg.addColorStop(0, shade(col, 0.3)); cg.addColorStop(0.55, col); cg.addColorStop(1, shade(col, -0.34));
    c.fillStyle = cg;
    c.beginPath();
    c.moveTo(px - 6.2, sh); c.lineTo(px + 6.2, sh);
    c.quadraticCurveTo(px + 8.0, hip + 1, px + 7.5, gy - 7.2);
    c.quadraticCurveTo(px, gy - 5.0, px - 7.5, gy - 7.2);
    c.quadraticCurveTo(px - 8.0, hip + 1, px - 6.2, sh); c.closePath(); c.fill();
    c.fillStyle = "rgba(0,0,0,.22)";
    c.beginPath(); c.arc(px, sh + 3.6, 0.7, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(px, sh + 7.4, 0.7, 0, Math.PI * 2); c.fill();
    c.fillStyle = "rgba(0,0,0,.16)";
    c.beginPath(); c.ellipse(px, gy - 7.0, 7.1, 2.4, 0, 0, Math.PI); c.fill();
    c.strokeStyle = "rgba(0,0,0,.34)"; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(px - 7.3, hip); c.lineTo(px + 7.3, hip); c.stroke();
    c.fillStyle = shade(col, 0.42); c.fillRect(px - 1.4, hip - 1.4, 2.8, 2.8);
    /* 手臂：提灯那只不动，另一只反相摆 */
    c.strokeStyle = shade(col, -0.14); c.lineWidth = 3.2;
    c.beginPath(); c.moveTo(px - 5.7, sh + 1.6); c.lineTo(px - 6.8 - sw * 2.2, hip + 3.8); c.stroke();
    /* 头：后发 → 脸 → 刘海 → 发髻 → 五官 */
    c.fillStyle = hair;
    c.beginPath(); c.arc(px - f * 4.0, hyy - 4.8, 3.3, 0, Math.PI * 2); c.fill();   /* 脑后发髻 */
    var fg = c.createLinearGradient(px - 5, hyy - 5, px + 5, hyy + 6);
    fg.addColorStop(0, "#fdf4e4"); fg.addColorStop(1, "#e0ccae");
    c.fillStyle = fg;
    c.beginPath(); c.ellipse(px + f * 0.6, hyy + 0.4, r - 0.4, r - 0.1, 0, 0, Math.PI * 2); c.fill();
    /* 发型轮廓：盖住颅顶，露出脸 */
    c.fillStyle = hair;
    c.beginPath();
    c.moveTo(px - r - 1, hyy + 3.4);
    c.quadraticCurveTo(px - r - 1.7, hyy - r - 2.5, px, hyy - r - 1.9);
    c.quadraticCurveTo(px + r + 1.7, hyy - r - 2.5, px + r + 1, hyy + 3.4);
    c.quadraticCurveTo(px + r - 0.5, hyy + 0.3, px + f * 1.4, hyy - 3.5);
    c.quadraticCurveTo(px - r + 0.5, hyy - 0.9, px - r - 1, hyy + 3.4);
    c.closePath(); c.fill();
    if (f !== 0) {
      c.fillStyle = "#3a3038";
      c.beginPath(); c.arc(px + f * 1.7, hyy + 0.5, 0.85, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(px + f * 4.2, hyy + 0.5, 0.85, 0, Math.PI * 2); c.fill();
      c.fillStyle = "rgba(255,255,255,.92)";
      c.fillRect(px + f * 1.7 - 0.3, hyy, 0.7, 0.7);
      c.fillStyle = "rgba(214,120,110,.3)";
      c.beginPath(); c.arc(px + f * 5.1, hyy + 2.7, 1.3, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "rgba(90,58,58,.5)"; c.lineWidth = 0.7;
      c.beginPath(); c.arc(px + f * 3.0, hyy + 3.5, 1.1, 0.25, Math.PI - 0.25); c.stroke();
    }
    c.strokeStyle = "rgba(255,216,150,.32)"; c.lineWidth = 1;
    c.beginPath(); c.arc(px, hyy, r + 0.9, Math.PI * 1.02, Math.PI * 1.72); c.stroke();
    /* 手里那盏灯：木框 + 暖玻璃 + 光晕 */
    var lx = px + (f < 0 ? -11.5 : 11.5), ly = py + 4;
    c.strokeStyle = shade(col, -0.28); c.lineWidth = 2.6;
    c.beginPath(); c.moveTo(px + (f < 0 ? -5.7 : 5.7), sh + 1.6); c.lineTo(lx, ly - 5); c.stroke();
    var lg = c.createRadialGradient(lx, ly, 1, lx, ly, 17);
    lg.addColorStop(0, "rgba(255,214,132,.5)"); lg.addColorStop(0.45, "rgba(255,190,110,.15)");
    lg.addColorStop(1, "rgba(255,190,110,0)");
    c.fillStyle = lg; c.beginPath(); c.arc(lx, ly, 17, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "rgba(58,42,28,.85)"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(lx - 2.5, ly - 4.3); c.lineTo(lx + 2.5, ly - 4.3);
    c.lineTo(lx + 2.1, ly + 3.7); c.lineTo(lx - 2.1, ly + 3.7); c.closePath(); c.stroke();
    var cg2 = c.createLinearGradient(lx, ly - 3.6, lx, ly + 3.2);
    cg2.addColorStop(0, "#fff2c8"); cg2.addColorStop(1, "#ffb257");
    c.fillStyle = cg2; c.fillRect(lx - 1.7, ly - 3.4, 3.4, 6.4);
    c.fillStyle = "#fff0bd"; c.beginPath(); c.arc(lx, ly + 0.2, 1, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  function drawPlace(c, p) {
    var px = p.x * CELL + CELL / 2, py = p.y * CELL + CELL / 2;
    var col = scene().palette.accent;
    c.save();
    if (p.kind === 'npc') {
      drawFigure(c, p.x, p.y, '#8fb8c8', -1, 0);
    } else if (p.kind === 'puzzle') {
      shadowUnder(c, px, py + 15, 16, 6);
      c.fillStyle = '#2a2416'; c.fillRect(px - 16, py - 4, 32, 18);
      c.fillStyle = '#3a2f18'; c.strokeStyle = shade(col, -0.20); c.lineWidth = 2;
      c.beginPath(); c.rect(px - 15, py - 15, 30, 30); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(px - 13, py - 13, 26, 6);
      var g = c.createRadialGradient(px, py, 2, px, py, 26);
      g.addColorStop(0, 'rgba(255,226,150,.26)'); g.addColorStop(1, 'rgba(255,226,150,0)');
      c.fillStyle = g; c.beginPath(); c.arc(px, py, 26, 0, Math.PI * 2); c.fill();
      c.fillStyle = col; c.font = '20px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('\u2726', px, py + 1);
    } else if (p.kind === 'item' || p.kind === 'buy') {
      shadowUnder(c, px, py + 13, 15, 5);
      c.fillStyle = '#4a3a20'; c.strokeStyle = shade(col, -0.15); c.lineWidth = 2;
      c.beginPath(); c.rect(px - 14, py - 11, 28, 22); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.09)'; c.fillRect(px - 12, py - 9, 24, 5);
      c.beginPath(); c.moveTo(px - 14, py - 3); c.lineTo(px + 14, py - 3); c.stroke();
      c.fillStyle = shade(col, 0.10); c.fillRect(px - 3, py - 8, 6, 5);
    } else if (p.kind === 'portal') {
      c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 1;
      for (var i = 0; i < 3; i++) {
        c.fillStyle = shade('#2b3546', 0.12 - i * 0.07);
        c.fillRect(px - 16 + i * 5, py + 12 - i * 9, 32 - i * 10, 9);
        c.strokeRect(px - 16 + i * 5 + 0.5, py + 12 - i * 9 + 0.5, 32 - i * 10 - 1, 8);
      }
    } else {
      /* "细看"类：地上留一道痕迹，别只放个白点 */
      c.fillStyle = 'rgba(255,255,255,.10)';
      c.beginPath(); c.ellipse(px, py - 2, 11, 5, hash(p.x, p.y, 21) * 3, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.16)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(px - 8, py + 4); c.lineTo(px + 7, py - 2); c.stroke();
    }
    c.restore();
  }
  /* 静态世界预烘焙：地面 + 障碍 + 道具 + 门口台阶只画一次，之后每帧一次 drawImage。
     细节可以放心加，帧率反而比原来每帧重画 280 格更稳。 */
  function bake() {
    if (!bg || !bg.getContext) { bgDirty = false; return; }
    var c = bg.getContext('2d');
    if (!c || !c.setTransform) { bgDirty = false; return; }
    c.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    c.clearRect(0, 0, VW, VH);
    var sc = scene(), pal = sc.palette;
    paintGround(c, pal, GROUND[S.scene] || 'stone');
    paintSolids(c, sc, pal);
    sc.portals.forEach(function (p) { drawPlace(c, { x: p.x, y: p.y, kind: 'portal' }); });
    sc.places.forEach(function (p) { if (p.kind !== 'portal') drawPlace(c, p); });
    bgDirty = false;
  }
  function setupCanvas() {
    SCALE = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    canvas.width = Math.round(VW * SCALE); canvas.height = Math.round(VH * SCALE);
    bg = document.createElement('canvas');
    bg.width = canvas.width; bg.height = canvas.height;
    bgDirty = true;
  }
  function label(text, x, y, hi) {
    ctx.save();
    ctx.font = '13px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    var w = ctx.measureText(text).width + 12;
    ctx.fillStyle = hi ? 'rgba(201,162,39,.92)' : 'rgba(10,12,16,.72)';
    ctx.beginPath(); ctx.rect(x * CELL + CELL / 2 - w / 2, y * CELL - 16, w, 18); ctx.fill();
    ctx.fillStyle = hi ? '#241d08' : '#cfd6de';
    ctx.fillText(text, x * CELL + CELL / 2, y * CELL + 1);
    ctx.restore();
  }
  function render() {
    var sc = scene(), pal = sc.palette, t = S.t;
    if (ctx.setTransform) ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    if (bgDirty) bake();
    ctx.fillStyle = pal.sky; ctx.fillRect(0, 0, VW, VH);
    if (bg) ctx.drawImage(bg, 0, 0, VW, VH);
    /* 出口：脉冲高亮 + 标签 */
    sc.portals.forEach(function (p) {
      var pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
      ctx.fillStyle = 'rgba(201,162,39,' + (0.10 + 0.10 * pulse).toFixed(2) + ')';
      ctx.fillRect((p.x - 1) * CELL, (p.y - 1) * CELL, CELL * 3, CELL * 3);
      label(p.label || '\u51fa\u53e3', p.x, p.y, false);
    });
    /* 可交互提示 */
    var near = nearestPlace();
    if (near) { label(near.name, near.x, near.y, true); ctx.fillStyle = '#e0b25c'; ctx.font = 'bold 15px sans-serif'; ctx.fillText('E', near.x * CELL + CELL + 8, near.y * CELL + 26); }
    /* 氛围 */
    if (sc.ambient === 'night') { ctx.fillStyle = 'rgba(6,10,20,.24)'; ctx.fillRect(0, 0, VW, VH); }
    if (sc.ambient === 'lamp' || sc.ambient === 'night') {
      var g = ctx.createRadialGradient(VW / 2, VH / 2, 40, VW / 2, VH / 2, VW * 0.62);
      g.addColorStop(0, 'rgba(240,196,106,.20)'); g.addColorStop(1, 'rgba(0,0,0,.28)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    }
    if (sc.ambient === 'fog') {
      for (var i = 0; i < 5; i++) {
        var fx = ((t * 12 + i * 220) % (VW + 400)) - 200;
        var gg = ctx.createRadialGradient(fx, 120 + i * 110, 10, fx, 120 + i * 110, 230);
        gg.addColorStop(0, 'rgba(210,220,232,.20)'); gg.addColorStop(1, 'rgba(210,220,232,0)');
        ctx.fillStyle = gg; ctx.fillRect(0, 0, VW, VH);
      }
    }
    if (sc.ambient === 'dusk') { ctx.fillStyle = 'rgba(60,30,10,.10)'; ctx.fillRect(0, 0, VW, VH); }
    if (sc.ambient === 'wind') {
      ctx.strokeStyle = 'rgba(230,235,240,.18)'; ctx.lineWidth = 2;
      for (var k = 0; k < 7; k++) {
        var yy = ((t * 90 + k * 97) % VH);
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(VW, yy + 30); ctx.stroke();
      }
    }
    /* 焦点补光：每个可交互点脚下那一圈暖光，画面有落点而不是一片糊 */
    if (sc.ambient !== 'fog') {
      sc.places.forEach(function (pl) {
        if (pl.kind !== 'puzzle' && pl.kind !== 'item' && pl.kind !== 'buy') return;
        var fx = pl.x * CELL + CELL / 2, fy = pl.y * CELL + CELL / 2;
        var fg = ctx.createRadialGradient(fx, fy, 4, fx, fy, 58);
        fg.addColorStop(0, 'rgba(255,206,132,.13)'); fg.addColorStop(1, 'rgba(255,206,132,0)');
        ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(fx, fy, 58, 0, Math.PI * 2); ctx.fill();
      });
    }
    /* 灯下浮尘：暖场景里慢慢往上飘，画面立刻活一点 */
    if (sc.ambient === 'lamp' || sc.ambient === 'night' || sc.ambient === 'dusk') {
      for (var d = 0; d < 30; d++) {
        var dn = hash(d, 0, 7), dn2 = hash(d, 1, 9);
        var dxp = (dn * VW + Math.sin(t * 0.6 + d) * 16 + VW) % VW;
        var dyp = (dn2 * VH - t * (5 + dn * 9) + VH * 8) % VH;
        var da = 0.08 + 0.20 * (0.5 + 0.5 * Math.sin(t * 1.7 + d * 1.3));
        ctx.fillStyle = 'rgba(255,214,140,' + da.toFixed(2) + ')';
        ctx.fillRect(dxp, dyp, 2, 2);
      }
    }
    /* 暗角：视线自然收到中间 */
    var vg = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.42, VW / 2, VH / 2, VW * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.22)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
    /* 玩家画在氛围之后：之前被夜色/雾蒙版盖住，玩家根本找不到自己（实机反馈） */
    drawSelf(t);
  }

  /* 「我在哪儿」：光晕 + 呼吸圈 + 头顶小箭头，怎么都能一眼看到 */
  function drawSelf(t) {
    var mv = Math.abs(S.tx - S.mx) + Math.abs(S.ty - S.my);
    var cx = S.mx * CELL + CELL / 2, cy = S.my * CELL + CELL / 2;
    var pulse = 0.5 + 0.5 * Math.sin(t * 2.6);
    var ring = ctx.createRadialGradient(cx, cy, 2, cx, cy, 30 + pulse * 6);
    ring.addColorStop(0, 'rgba(255,232,170,' + (0.30 + 0.12 * pulse).toFixed(2) + ')');
    ring.addColorStop(1, 'rgba(255,232,170,0)');
    ctx.fillStyle = ring;
    ctx.beginPath(); ctx.arc(cx, cy, 34 + pulse * 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,226,150,' + (0.35 + 0.25 * pulse).toFixed(2) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, cy + 12, 13 + pulse * 2, 5 + pulse, 0, 0, Math.PI * 2); ctx.stroke();
    drawFigure(ctx, S.mx, S.my, '#f3ead6', S.face, mv > 0.02 ? Math.abs(Math.sin(t * 11)) * 1.8 : 0, t * 11);
    var bob = Math.sin(t * 3.4) * 2;
    ctx.fillStyle = 'rgba(255,228,150,.9)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 30 + bob); ctx.lineTo(cx - 6, cy - 40 + bob); ctx.lineTo(cx + 6, cy - 40 + bob);
    ctx.closePath(); ctx.fill();
  }

  /* ---------- 循环 ---------- */
  function update(dt) {
    S.t += dt;
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('scene-banner').classList.remove('on'); }
    if (moveCd > 0) moveCd -= dt;
    if (portalCd > 0) portalCd -= dt;
    /* 平滑位移：mx/my 是"眼睛看到的位置"（浮点格坐标），x/y 是"落定的格子"。
       走到格心才落定并判出口 —— 之前是每 0.14 秒整格瞬移，实机看就是一下下跳。 */
    var mdx = S.tx - S.mx, mdy = S.ty - S.my;
    var dist = Math.abs(mdx) + Math.abs(mdy);
    if (dist > 0.0001) {
      var step = MOVE_SPEED * dt;
      if (step >= dist) {
        S.mx = S.tx; S.my = S.ty; S.x = S.tx; S.y = S.ty; S.mt = 0;
        var scBefore = S.scene;
        onArrive();
        if (S.scene !== scBefore) return;
      } else {
        S.mx += mdx / dist * step; S.my += mdy / dist * step;
      }
    }
    /* 站在出口上就换场景（不是只在"刚走完一步"那瞬间才判） */
    if (portalCd <= 0 && !modalOpen && !dlg) {
      var pp = D.portalAt(S.scene, S.x, S.y);
      if (pp) { enterScene(pp.to, pp.tx, pp.ty); return; }
    }
    if (!modalOpen && !dlg && !$('dev-panel').classList.contains('show') && !$('end-modal').classList.contains('show')) {
      var dx = 0, dy = 0;
      if (keys.left) dx = -1; else if (keys.right) dx = 1;
      else if (keys.up) dy = -1; else if (keys.down) dy = 1;
      /* 到格心才接下一步：按住时零停顿地连成滑行，轻点则精确只走一格。
         （提前接步会让"点一下"多滑一两格，手感发飘——测试⑤就是这么抓出来的） */
      var remain = Math.abs(S.tx - S.mx) + Math.abs(S.ty - S.my);
      if ((dx || dy) && moveCd <= 0 && remain < 0.05) tryMove(dx, dy);
    }
  }
  function tryMove(dx, dy) {
    if (dx) S.face = dx;
    var nx = clamp(S.tx + dx, 0, GRID_W - 1), ny = clamp(S.ty + dy, 0, GRID_H - 1);
    var p = D.portalAt(S.scene, nx, ny);
    if (p && portalCd <= 0) { enterScene(p.to, p.tx, p.ty); return; }
    if (solid(nx, ny)) {
      var hit = null;
      scene().places.forEach(function (q) { if (q.x === nx && q.y === ny) hit = q; });
      if (hit) { interact(); }
      return;
    }
    S.tx = nx; S.ty = ny; moveCd = 0.02;   /* 位移本身由 update 按速度推进 */
    sfx('click');
  }
  function onArrive() {
    var p = D.portalAt(S.scene, S.x, S.y);
    if (p && portalCd <= 0) enterScene(p.to, p.tx, p.ty);
  }
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (!lastT) lastT = ts;
    var dt = Math.min(0.05, (ts - lastT) / 1000);
    lastT = ts;
    update(dt);
    render();
    refreshPanels();
    if (saveT > 0) { saveT -= dt; if (saveT <= 0) { save(); saveT = 5; } }
  }
  var saveT = 5;

  /* ---------- 输入 ---------- */
  /* 中文输入法（微软拼音等）激活时，字母键的 e.key 会是 'Process'（keyCode 229），
     只按 e.key 判断会导致 WASD 完全失灵——本机实测就是这样。先认物理键 e.code。 */
  function keyNameOf(e) {
    var c = e.code || '';
    if (c === 'KeyW' || c === 'ArrowUp') return 'w';
    if (c === 'KeyS' || c === 'ArrowDown') return 's';
    if (c === 'KeyA' || c === 'ArrowLeft') return 'a';
    if (c === 'KeyD' || c === 'ArrowRight') return 'd';
    if (c === 'KeyE' || c === 'Space' || c === 'Enter' || c === 'NumpadEnter') return 'e';
    if (c === 'Escape') return 'Escape';
    if (c === 'Backquote') return '`';
    if (c === 'F2') return 'F2';
    var k = e.key;
    if (!k) return '';
    if (k === ' ') return 'e';
    if (k.length === 1) return k.toLowerCase();      /* 大写/Shift 也认 */
    return k;
  }

  function keydown(e) {
    var k = keyNameOf(e);
    if (k === '`' || k === 'F2') { toggleDev(); e.preventDefault(); return; }
    if (modalOpen) {
      if (k === 'Escape') { closeModal(); }
      if (k === 'Enter' || k === 'e' || k === 'E') {
        var m = $('m-btns'); if (m && m.firstChild) { m.firstChild.click(); e.preventDefault(); }
      }
      return;
    }
    if (k === 'w') keys.up = 1;
    else if (k === 's') keys.down = 1;
    else if (k === 'a') keys.left = 1;
    else if (k === 'd') keys.right = 1;
    else if (k === 'e') { interact(); e.preventDefault(); }
    else if (k === 'Tab') { e.preventDefault(); cycleTab(); }
  }
  function keyup(e) {
    var k = keyNameOf(e);        /* 必须和 keydown 用同一套：否则输入法下会"抬起认不出"→ 人一直走 */
    if (k === 'w') keys.up = 0;
    else if (k === 's') keys.down = 0;
    else if (k === 'a') keys.left = 0;
    else if (k === 'd') keys.right = 0;
  }
  function cycleTab() {
    var tabs = ['tab-log', 'tab-mem', 'tab-tasks', 'tab-album', 'tab-archive'];
    var cur = tabs.filter(function (t) { return $(t).classList.contains('on'); })[0] || tabs[0];
    var i = (tabs.indexOf(cur) + 1) % tabs.length;
    $(tabs[i]).click();
  }

  /* ---------- 面板 / DEV ---------- */
  function bindTabs() {
    var map = { 'tab-log': 'pane-log', 'tab-mem': 'pane-mem', 'tab-tasks': 'pane-tasks', 'tab-album': 'pane-album', 'tab-archive': 'pane-archive' };
    Object.keys(map).forEach(function (tab) {
      $(tab).onclick = function () {
        Object.keys(map).forEach(function (t) { $(t).classList.toggle('on', t === tab); $(map[t]).classList.toggle('on', t === tab); });
        dirty.log = dirty.tasks = dirty.album = dirty.arch = 1; dirty.mem = 1;
        refreshPanels();
      };
    });
  }
  function toggleDev() {
    var p = $('dev-panel'); p.classList.toggle('show'); $('btn-dev').classList.toggle('on', p.classList.contains('show'));
    if (p.classList.contains('show')) renderDev();
  }
  function renderDev() {
    var body = $('dev-body');
    body.innerHTML =
      '<div class="arc-h">跳到某一幕</div>' +
      '<div class="pz-row">' + [1, 2, 3, 4, 5].map(function (a) {
        return '<button class="pz-btn" data-jump="' + a + '">第 ' + a + ' 幕</button>';
      }).join('') + '</div>' +
      '<div class="arc-h">资源</div>' +
      '<div class="pz-row"><button class="pz-btn" data-dev="gold">+10 当金</button>' +
      '<button class="pz-btn" data-dev="photos">给全部相簿</button>' +
      '<button class="pz-btn" data-dev="solve">解完本幕主线</button></div>' +
      '<div class="arc-h">场景</div>' +
      '<div class="pz-row">' + Object.keys(D.SCENES).map(function (s) {
        return '<button class="pz-btn" data-scene="' + s + '">' + D.SCENES[s].name + '</button>';
      }).join('') + '</div>' +
      '<div class="arc-h">终局</div>' +
      '<div class="pz-row"><button class="pz-btn" data-dev="ending">直接通关（真结局）</button>' +
      '<button class="pz-btn" data-dev="wipe">删档重来</button></div>' +
      '<div class="arc-h">状态</div><div class="arc-item">' + JSON.stringify({ scene: S.scene, act: S.act, gold: S.gold, tasks: doneCount(), photos: D.photoCount(S), flags: Object.keys(S.flags).length }) + '</div>';
    body.querySelectorAll('[data-jump]').forEach(function (b) {
      b.onclick = function () { devJump(+b.getAttribute('data-jump')); };
    });
    body.querySelectorAll('[data-scene]').forEach(function (b) {
      b.onclick = function () { enterScene(b.getAttribute('data-scene')); toggleDev(); };
    });
    body.querySelectorAll('[data-dev]').forEach(function (b) {
      b.onclick = function () { devAction(b.getAttribute('data-dev')); };
    });
  }
  function devJump(act) {
    D.TASKS.forEach(function (t) { if (t.act < act) { S.tasks[t.id] = 1; S.flags[t.flag] = 1; } });
    awardPhotos();
    var first = Object.keys(D.SCENES).filter(function (s) { return D.SCENES[s].act === act; })[0];
    S.maxAct = act; S.act = act;
    enterScene(first);
    dirty.hud = dirty.tasks = dirty.arch = 1; dirty.mem = 1;
    toggleDev();
  }
  function devAction(a) {
    if (a === 'gold') S.gold += 10;
    if (a === 'photos') D.PHOTOS.forEach(function (p) { S.photos[p.id] = 1; });
    if (a === 'solve') {
      D.TASKS.filter(function (t) { return t.act === S.act && t.kind === 'main'; }).forEach(function (t) {
        S.flags[t.flag] = 1; S.tasks[t.id] = 1;
      });
      awardPhotos();
    }
    if (a === 'ending') { S.act = 5; D.PHOTOS.forEach(function (p) { S.photos[p.id] = 1; }); ending('true_name'); }
    if (a === 'wipe') { try { store().removeItem(SAVE_KEY); store().removeItem(CHECK_KEY); } catch (e) { /**/ } S = freshState(); enterScene('lighthouse'); }
    dirty.hud = dirty.tasks = dirty.album = dirty.arch = 1; dirty.mem = 1;
    renderDev();
    save();
  }
  /* 一键把弹窗/对话/结局窗全关掉（测试与 DEV 用；正常玩法不会走到） */
  function forceClose() {
    closeModal(); dlg = null;
    $('end-modal').classList.remove('show');
    $('dev-panel').classList.remove('show');
    $('confirm-box').classList.remove('show');
  }

  function confirmBox(text, onYes, yesLabel, noLabel) {
    $('cf-text').textContent = text;
    $('cf-yes').textContent = yesLabel || '确定';
    $('cf-no').textContent = noLabel || '取消';
    $('confirm-box').classList.add('show');
    $('cf-yes').onclick = function () { $('confirm-box').classList.remove('show'); onYes(); };
    $('cf-no').onclick = function () { $('confirm-box').classList.remove('show'); };
  }

  /* ---------- 启动 ---------- */
  var GAME = { booted: false, get S() { return S; }, D: D, fresh: freshState, pack: pack, solvePuzzle: solvePuzzle, PHOTO_RULES: PHOTO_RULES, SCENE_FLAG: SCENE_FLAG, DERIVED: DERIVED, interact: interact, markFlag: markFlag, forceClose: forceClose, dlgOpen: function () { return !!dlg; } };
  global.GAME23 = GAME;

  function boot() {
    canvas = $('world'); ctx = canvas.getContext('2d');
    setupCanvas();
    window.addEventListener('resize', function () { setupCanvas(); });
    var q = global.location && global.location.search || '';
    if (q.indexOf('fresh=1') >= 0) { try { store().removeItem(SAVE_KEY); store().removeItem(CHECK_KEY); } catch (e) { /**/ } }
    S = load() || freshState();
    endingRun = endingsRun();
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    document.querySelectorAll('#dpad button').forEach(function (b) {
      var k = b.getAttribute('data-k');
      var set = function (v) { return function (e) { e.preventDefault(); keydown({ key: k }); keys[k.replace('Arrow', '').toLowerCase()] = v; }; };
      b.addEventListener('touchstart', set(1), { passive: false });
      b.addEventListener('mousedown', set(1));
      b.addEventListener('touchend', function (e) { e.preventDefault(); keys[k.replace('Arrow', '').toLowerCase()] = 0; }, { passive: false });
      b.addEventListener('mouseup', function () { keys[k.replace('Arrow', '').toLowerCase()] = 0; });
      b.addEventListener('mouseleave', function () { keys[k.replace('Arrow', '').toLowerCase()] = 0; });
    });
    /* E 键：触摸/笔走 pointerdown（真机不等那 300ms 的合成 click），鼠标仍走 click；
       触摸那次会再补一个合成 click，用 500ms 窗口去重，避免一下按出两回 */
    var eTouchedAt = 0;
    function eAction() {
      if (modalOpen) { var m = $('m-btns'); if (m && m.firstChild) m.firstChild.click(); return; }
      interact();
    }
    $('btn-e').addEventListener('pointerdown', function (ev) {
      if (ev && (ev.pointerType === 'touch' || ev.pointerType === 'pen')) { eTouchedAt = Date.now(); eAction(); }
    });
    $('btn-e').addEventListener('click', function () {
      if (Date.now() - eTouchedAt < 500) return;
      eAction();
    });
    $('btn-restart').onclick = function () {
      var cp = loadCheckpoint();
      confirmBox(cp ? '回到本幕开头（第 ' + (JSON.parse(cpRaw()).state.act) + ' 幕）的存档点吗？' : '还没有存档点——要删档从头来吗？',
        function () {
          if (cp) { S = loadFrom(cp); dirty.hud = dirty.log = dirty.tasks = dirty.album = dirty.arch = 1; dirty.mem = 1; toast('回到本幕开头。'); }
          else restart();
        }, '回到存档点', '接着走');
    };
    function cpRaw() { return checkpointRaw(); }
    $('btn-bgm').onclick = function () {
      var on = global.MUSIC.toggle();
      $('btn-bgm').textContent = on ? '♪ 开' : '♪ 关';
      toast(on ? '背景音乐 · 开' : '背景音乐 · 关');
    };
    $('btn-archive').onclick = function () { $('tab-archive').click(); };
    $('btn-dev').onclick = toggleDev;
    $('dev-close').onclick = toggleDev;
    $('btn-again').onclick = function () { $('end-modal').classList.remove('show'); restart(); };
    $('btn-main').onclick = function () { $('end-modal').classList.remove('show'); $('btn-archive').click(); };
    bindTabs();
    if (global.MUSIC) {
      $('btn-bgm').textContent = global.MUSIC.enabled() ? '♪ 开' : '♪ 关';
      music('prologue');
    }
    var legacy = legacyNotice();
    enterScene(S.scene, S.x, S.y, { silent: true });
    if (legacy) say(['（检测到旧版的存档：那是另一个岛的故事，这一趟从头开始。）'], null, { title: '版本提示' });
    if (!S.introDone && !legacy) {
      S.introDone = true; save();
      say(D.TEXT.prologue.slice(), function () { banner(scene().name, scene().sub); }, { title: '记忆当铺 · 归潮屿', end: '点亮灯' });
    }
    dirty.hud = dirty.log = dirty.tasks = dirty.album = dirty.arch = 1; dirty.mem = 1;
    raf = requestAnimationFrame(loop);
    window.PAWN_DEBUG = {
      S: S, D: D, api: {
        enter: enterScene, flag: markFlag, solve: solvePuzzle, ending: ending, say: say,
        get state() { return S; }, interact: interact, modalOpen: function () { return modalOpen; },
        setPos: function (x, y) { S.x = S.tx = x; S.y = S.ty = y; S.mx = x; S.my = y; S.mt = 0; }
      }
    };
  }
  function loadFrom(o) {
    var s = freshState();
    Object.keys(o).forEach(function (k) { if (k in s) s[k] = o[k]; });
    return s;
  }
  function restart() {
    try { store().removeItem(SAVE_KEY); store().removeItem(CHECK_KEY); } catch (e) { /**/ }
    S = freshState(); S.introDone = true;
    enterScene('lighthouse');
    dirty.hud = dirty.log = dirty.tasks = dirty.album = dirty.arch = 1; dirty.mem = 1;
  }

  /* 谜题层需要的宿主接口 */
  function puzzleHost() {
    return {
      D: D, get S() { return S; },
      modalBody: modalBody, setTitle: setTitle, setBody: setBody, setBtns: setBtns,
      solve: solvePuzzle, toast: toast, sfx: sfx, close: closeModal, ending: ending,
      isOpen: function () { return modalOpen; }, openModal: openModal,
      refresh: function () { dirty.hud = dirty.tasks = dirty.album = 1; dirty.mem = 1; refreshPanels(); }
    };
  }

  /* 起页：DOMContentLoaded 之前调用会等一等；测试可以轮询 GAME23.booted */
  function start() {
    if (GAME.booted) return;
    PUZZLES23.attach(puzzleHost());
    boot();
    GAME.booted = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof window !== 'undefined' ? window : globalThis);
