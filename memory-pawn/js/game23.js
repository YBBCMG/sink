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
  var keys = {}, moveCd = 0, portalCd = 0, dirty = { hud: 1, log: 1, tasks: 1, album: 1, arch: 1 };
  var endingRun = [];

  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function store() { try { return global.localStorage; } catch (e) { return null; } }

  /* ---------- 存档 ---------- */
  function freshState() {
    return {
      scene: 'lighthouse', x: 3, y: 12, tx: 3, ty: 12, mt: 0, face: 1,
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
    dirty.hud = 1; dirty.tasks = 1; dirty.album = 1; dirty.arch = 1;
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
          markFlag('first_pawn'); dirty.hud = 1; save(); render();
        };
      });
      b.querySelectorAll('[data-redeem]').forEach(function (el) {
        el.onclick = function () {
          var id = el.getAttribute('data-redeem'), m = D.mem23ById(id), cost = m.w;
          if (S.gold < cost) { toast('当金不够——赎回这段要 ' + cost + ' 枚。'); return; }
          S.gold -= cost; S.mem[id].state = 'held'; S.redeemed++;
          sfx('redeem'); dirty.hud = 1; save();
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
    dirty.arch = 1; dirty.tasks = 1; dirty.album = 1;
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
  }

  /* ---------- 渲染 ---------- */
  function drawFigure(x, y, col, face) {
    var px = x * CELL + CELL / 2, py = y * CELL + CELL / 2;
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(px, py + 15, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(px - 9, py + 14); ctx.lineTo(px + 9, py + 14);
    ctx.lineTo(px + 7, py - 4); ctx.lineTo(px - 7, py - 4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(px, py - 10, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillRect(px + (face > 0 ? 2 : -4), py - 12, 2, 2);
  }
  function drawPlace(p) {
    var px = p.x * CELL + CELL / 2, py = p.y * CELL + CELL / 2;
    var col = scene().palette.accent;
    ctx.save();
    if (p.kind === 'npc') drawFigure(p.x, p.y, '#8fb8c8', -1);
    else if (p.kind === 'puzzle') {
      ctx.fillStyle = '#3a2f18'; ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.rect(px - 15, py - 15, 30, 30); ctx.fill(); ctx.stroke();
      ctx.fillStyle = col; ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('✦', px, py + 1);
    } else if (p.kind === 'item' || p.kind === 'buy') {
      ctx.fillStyle = '#4a3a20'; ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.rect(px - 14, py - 11, 28, 22); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px - 14, py - 3); ctx.lineTo(px + 14, py - 3); ctx.stroke();
    } else if (p.kind === 'portal') {
      ctx.fillStyle = '#1d2733'; ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.rect(px - 13, py - 18, 26, 36); ctx.fill(); ctx.stroke();
      ctx.fillStyle = col; ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('↥', px, py + 6);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
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
    ctx.fillStyle = pal.sky; ctx.fillRect(0, 0, canvas.width, canvas.height);
    /* 地面 */
    for (var y = 0; y < GRID_H; y++) for (var x = 0; x < GRID_W; x++) {
      ctx.fillStyle = ((x + y) % 2 === 0) ? pal.ground : pal.ground2;
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
    /* 障碍 */
    ctx.fillStyle = pal.solid;
    sc.solids.forEach(function (s) {
      ctx.fillRect(s[0] * CELL, s[1] * CELL, s[2] * CELL, s[3] * CELL);
      ctx.fillStyle = 'rgba(255,255,255,.06)';
      ctx.fillRect(s[0] * CELL, s[1] * CELL, s[2] * CELL, 4);
      ctx.fillStyle = pal.solid;
    });
    /* 出口高亮 */
    sc.portals.forEach(function (p) {
      ctx.fillStyle = 'rgba(201,162,39,.20)';
      ctx.fillRect((p.x - 1) * CELL, (p.y - 1) * CELL, CELL * 3, CELL * 3);
      label(p.label || '出口', p.x, p.y, false);
    });
    sc.places.forEach(function (p) { drawPlace(p); });
    /* 玩家 */
    drawFigure(S.tx, S.ty, '#e6dcc8', S.face);
    /* 可交互提示 */
    var near = nearestPlace();
    if (near) { label(near.name, near.x, near.y, true); ctx.fillStyle = '#e0b25c'; ctx.font = 'bold 15px sans-serif'; ctx.fillText('E', near.x * CELL + CELL + 8, near.y * CELL + 26); }
    /* 氛围 */
    if (sc.ambient === 'night') { ctx.fillStyle = 'rgba(6,10,20,.42)'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    if (sc.ambient === 'lamp' || sc.ambient === 'night') {
      var g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 40, canvas.width / 2, canvas.height / 2, canvas.width * 0.62);
      g.addColorStop(0, 'rgba(240,196,106,.16)'); g.addColorStop(1, 'rgba(0,0,0,.45)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (sc.ambient === 'fog') {
      for (var i = 0; i < 5; i++) {
        var fx = ((t * 12 + i * 220) % (canvas.width + 400)) - 200;
        var gg = ctx.createRadialGradient(fx, 120 + i * 110, 10, fx, 120 + i * 110, 230);
        gg.addColorStop(0, 'rgba(210,220,232,.20)'); gg.addColorStop(1, 'rgba(210,220,232,0)');
        ctx.fillStyle = gg; ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    if (sc.ambient === 'dusk') { ctx.fillStyle = 'rgba(60,30,10,.16)'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    if (sc.ambient === 'wind') {
      ctx.strokeStyle = 'rgba(230,235,240,.18)'; ctx.lineWidth = 2;
      for (var k = 0; k < 7; k++) {
        var yy = ((t * 90 + k * 97) % canvas.height);
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(canvas.width, yy + 30); ctx.stroke();
      }
    }
  }

  /* ---------- 循环 ---------- */
  function update(dt) {
    S.t += dt;
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('scene-banner').classList.remove('on'); }
    if (moveCd > 0) moveCd -= dt;
    if (portalCd > 0) portalCd -= dt;
    if (S.mt > 0) {
      S.mt -= dt;
      if (S.mt <= 0) { S.x = S.tx; S.y = S.ty; S.mt = 0; onArrive(); }
    } else {
      /* 站在出口上就换场景（不是只在"刚走完一步"那瞬间才判） */
      if (portalCd <= 0 && !modalOpen && !dlg) {
        var pp = D.portalAt(S.scene, S.x, S.y);
        if (pp) { enterScene(pp.to, pp.tx, pp.ty); return; }
      }
      if (!modalOpen && !dlg && !$('dev-panel').classList.contains('show') && !$('end-modal').classList.contains('show')) {
        var dx = 0, dy = 0;
        if (keys.left) dx = -1; else if (keys.right) dx = 1;
        else if (keys.up) dy = -1; else if (keys.down) dy = 1;
        if ((dx || dy) && moveCd <= 0) tryMove(dx, dy);
      }
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
    S.tx = nx; S.ty = ny; S.mt = 0.16; moveCd = 0.14;
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
  function keydown(e) {
    var k = e.key;
    if (k === '`' || k === 'F2') { toggleDev(); e.preventDefault(); return; }
    if (modalOpen) {
      if (k === 'Escape') { closeModal(); }
      if (k === 'Enter' || k === 'e' || k === 'E') {
        var m = $('m-btns'); if (m && m.firstChild) { m.firstChild.click(); e.preventDefault(); }
      }
      return;
    }
    if (k === 'w' || k === 'ArrowUp') keys.up = 1;
    else if (k === 's' || k === 'ArrowDown') keys.down = 1;
    else if (k === 'a' || k === 'ArrowLeft') keys.left = 1;
    else if (k === 'd' || k === 'ArrowRight') keys.right = 1;
    else if (k === 'e' || k === 'E' || k === ' ' || k === 'Enter') { interact(); e.preventDefault(); }
    else if (k === 'Tab') { e.preventDefault(); cycleTab(); }
  }
  function keyup(e) {
    var k = e.key;
    if (k === 'w' || k === 'ArrowUp') keys.up = 0;
    else if (k === 's' || k === 'ArrowDown') keys.down = 0;
    else if (k === 'a' || k === 'ArrowLeft') keys.left = 0;
    else if (k === 'd' || k === 'ArrowRight') keys.right = 0;
  }
  function cycleTab() {
    var tabs = ['tab-log', 'tab-tasks', 'tab-album', 'tab-archive'];
    var cur = tabs.filter(function (t) { return $(t).classList.contains('on'); })[0] || tabs[0];
    var i = (tabs.indexOf(cur) + 1) % tabs.length;
    $(tabs[i]).click();
  }

  /* ---------- 面板 / DEV ---------- */
  function bindTabs() {
    var map = { 'tab-log': 'pane-log', 'tab-tasks': 'pane-tasks', 'tab-album': 'pane-album', 'tab-archive': 'pane-archive' };
    Object.keys(map).forEach(function (tab) {
      $(tab).onclick = function () {
        Object.keys(map).forEach(function (t) { $(t).classList.toggle('on', t === tab); $(map[t]).classList.toggle('on', t === tab); });
        dirty.log = dirty.tasks = dirty.album = dirty.arch = 1;
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
    dirty.hud = dirty.tasks = dirty.arch = 1;
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
    dirty.hud = dirty.tasks = dirty.album = dirty.arch = 1;
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
          if (cp) { S = loadFrom(cp); dirty.hud = dirty.log = dirty.tasks = dirty.album = dirty.arch = 1; toast('回到本幕开头。'); }
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
    dirty.hud = dirty.log = dirty.tasks = dirty.album = dirty.arch = 1;
    raf = requestAnimationFrame(loop);
    window.PAWN_DEBUG = {
      S: S, D: D, api: {
        enter: enterScene, flag: markFlag, solve: solvePuzzle, ending: ending, say: say,
        get state() { return S; }, interact: interact, modalOpen: function () { return modalOpen; },
        setPos: function (x, y) { S.x = S.tx = x; S.y = S.ty = y; S.mt = 0; }
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
    dirty.hud = dirty.log = dirty.tasks = dirty.album = dirty.arch = 1;
  }

  /* 谜题层需要的宿主接口 */
  function puzzleHost() {
    return {
      D: D, get S() { return S; },
      modalBody: modalBody, setTitle: setTitle, setBody: setBody, setBtns: setBtns,
      solve: solvePuzzle, toast: toast, sfx: sfx, close: closeModal, ending: ending,
      isOpen: function () { return modalOpen; }, openModal: openModal,
      refresh: function () { dirty.hud = dirty.tasks = dirty.album = 1; refreshPanels(); }
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
