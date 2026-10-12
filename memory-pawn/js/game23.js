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
  var LEGACY_ACK_KEY = 'mp23-legacy-ack-v1';   /* 版本提示只弹一次：弹过就落这个记号 */
  var GUIDE_KEY = 'mp23-guide-v1';             /* 新手引导（guide23.js:20 用的同一个键）：开新档时要一起清 */

  var canvas, ctx, S = null, raf = 0, lastT = 0, toastT = 0, bannerT = 0, actCardT = 0, lockCd = 0, firstSightT = 0;
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
      legs: {}, oil: 2,          /* legs：跑腿走到第几段；oil：灯油罐数（反制用） */
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
      flags: S.flags, photos: S.photos, tasks: S.tasks, mem: S.mem, scrolls: S.scrolls, caught: S.caught,
      legs: S.legs || {}, oil: S.oil == null ? 2 : S.oil, log: S.log.slice(-200),
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
  /* 老档提示的"说过了"记号：老档本身不清（v22 回放还要用），只记住这话已经说过 */
  function legacyAcked() {
    var st = store(); if (!st) return false;
    try { return !!st.getItem(LEGACY_ACK_KEY); } catch (e) { return false; }
  }
  function ackLegacy() {
    var st = store(); if (!st) return;
    try { st.setItem(LEGACY_ACK_KEY, '1'); } catch (e) { /* 私密模式/配额满：下次顶多再弹一次，不报错 */ }
  }
  /* 开新档（删档重来 / ?fresh=1）时把新手教程也清掉 —— 老玩家从第一天重来时，
     「第一夜清单」要回到第一课，而不是顶着一张全打勾的旧便签。
     两种时机都得管：
       · 开机路径（?fresh=1）：index.html 里 game23.js 先于 guide23.js 执行，此刻 GUIDE23 还不存在
         ⇒ 只能直接删原始键，guide23 随后 loadSt 读到空，自然全新；
       · 运行中路径（DEV 面板「删档重来」）：GUIDE23 已加载且把 finished:true 读进了内存
         ⇒ 光删键没用，必须再调 GUIDE23.reset() 清内存与队列。
     注意：通关后「再玩一次」（restart()）不走这里 —— 那时候不该再被教程堵一次。 */
  function clearGuide() {
    var st = store();
    if (st) { try { st.removeItem(GUIDE_KEY); } catch (e) { /* ignore */ } }
    try {
      if (global.GUIDE23 && typeof global.GUIDE23.reset === 'function') global.GUIDE23.reset();
    } catch (e) { /* 引导没上也不许挡路 */ }
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
  function sfx(name) {
    try { if (global.SFX && global.SFX[name]) global.SFX[name](); } catch (e) { /* ignore */ }
    /* 谜题答错统一喊 'wrong' —— 反噬就在这一个口子上接，不用挨个改谜题 */
    if (name === 'wrong' && modalOpen && global.PUZZLES23 && global.PUZZLES23.current) {
      try { puzzleWrong(global.PUZZLES23.current()); } catch (e) { /* ignore */ }
    }
  }
  /* 画面抖一下：被咬的时候得有"出事了"的反馈，不能只弹一行字 */
  var shake = 0;
  function jolt(t) { shake = Math.max(shake, t || 0.45); }
  function music(key) { try { if (global.MUSIC && key) global.MUSIC.play(key); } catch (e) { /* ignore */ } }
  function banner(main, sub) {
    var b = $('scene-banner'); if (!b) return;
    b.innerHTML = main + '<small>' + (sub || '') + '</small>';
    b.classList.add('on'); bannerT = 2.4;
  }
  /* 初见：屏幕上方的那一条（用户 2026-10-12：「不需要母亲那句，只需要在初见这个怪的时候弹一个提示」）。
     只弹一次 —— 记在存档的 flags.met_wuyi 里：重进场景、重开浏览器都不再骚扰，新开一局自然重来。
     它只说两件事：这是什么、怎么反制；细的留给左上那张"第一夜清单"（fog / oil 两步）。 */
  function firstSight(K) {
    var el = $('first-sight'); if (!el) return;
    el.innerHTML = '<b>初见 · ' + K.name + '</b>' +
      '<span class="fs-w">' + (K.desc || '') + '</span>' +
      '<span class="fs-y">灯下它不敢进；兜里有灯油就按 <b>F</b> 泼下去 —— 定住它十几秒。</span>';
    el.classList.add('on');
    if (global.document && global.document.body) {
      global.document.body.classList.add('fs-on');
      /* 现场量一次高度交给 CSS：手机上左上那张引导纸要让到它下面去（窄屏换行也不会撞上）。
         jsdom 里量出来是 0 —— 那就不设，CSS 里 110px 兜底。 */
      try {
        var h = el.getBoundingClientRect ? Math.ceil(el.getBoundingClientRect().height) : 0;
        if (h > 0) global.document.body.style.setProperty('--fs-h', h + 'px');
      } catch (e) { /* 量不到就算了 */ }
    }
    firstSightT = 8.5;
  }
  /* 幕间卡：进了新的一幕就把幕号 / 幕名 / 一句引子摊在画面中间（3.4 秒后自己淡掉） */
  function actCard(act) {
    var el = $('act-card'); if (!el) return;
    var info = (D.ACT_TITLES && D.ACT_TITLES[act]) || {};
    el.innerHTML = '<div class="ac-rule"></div><div class="ac-no">第 ' + act + ' 幕</div>' +
      '<div class="ac-name">' + (info.name || '') + '</div>' +
      '<div class="ac-line">' + (info.line || '') + '</div><div class="ac-rule"></div>';
    el.classList.add('on'); actCardT = 3.4;
  }
  /* 门禁：门上的 need 没兑现就走不了 —— 提示要说清"差哪件事" */
  function needText(flag) {
    var t = D.TASKS.filter(function (x) { return x.flag === flag; })[0];
    return t ? '「' + t.title + '」' : '前面那件事';
  }
  function lockedBy(p) { return (p && p.need && !S.flags[p.need]) ? p.need : null; }
  function lockToast(need, door) {
    if (lockCd > 0) return;
    lockCd = 1.8;
    var what = door ? '这扇门还锁着' : '还不行';
    toast(what + ' —— 先把' + needText(need) + '做完。');
    addLog('走不过去：还差 ' + needText(need));
  }
  /* 哪个旗标一置，就把哪几扇门打开（置旗标时当面告诉玩家） */
  function doorsOpenedBy(flag) {
    var names = [];
    Object.keys(D.SCENES).forEach(function (sid) {
      var sc = D.SCENES[sid];
      sc.portals.concat(sc.places).forEach(function (q) {
        if (q.need === flag && q.to) names.push(q.label || memNameOf(q) || '那扇门');
      });
    });
    return names;
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
      actCard(act);
      addLog('—— 第 ' + act + ' 幕 · ' + ((D.ACT_TITLES[act] || {}).name || '') + ' ——');
      var open = (D.TEXT.actOpen && D.TEXT.actOpen[act]) || [];
      if (open.length) say(open, null);
      music('m' + Math.min(act, 5));
      S.oil = (S.oil || 0) + 1;      /* 新的一幕：柜上再给一罐灯油 */
    } else {
      S.act = Math.max(S.act, act);
    }
    if (SCENE_FLAG[sid] && !(opts && opts.silent)) markFlag(SCENE_FLAG[sid]);
    /* 雾里的小怪：按 场景 × 幕数 铺（幕一不刷，先把规矩学会） */
    if (global.MOBS23) {
      var mobN = global.MOBS23.spawnFor(sid, S.act);
      syncMobs();
      if (mobN && !(opts && opts.silent)) addLog('雾里有东西在爬 —— ' + mobN + ' 只。它们咬不走钱，只咬记。');
    }
    syncThreat();
    runLegs();                    /* 跑腿任务：进对场景就算走到那一段 */
    dirty.hud = 1; dirty.tasks = 1;
    save();
  }

  /* ---------- 跑腿：任务要跨场景来回跑 ---------- */
  /* 一条腿 = { scene, flag?, hint }：
     没有 flag 的腿 = "到那个场景就算走到"（回程腿常这么写）；
     有 flag 的腿 = "得在那个场景里，那件事真的办了"。顺序硬性，走完才结算。 */
  function legList(t) { return (t && t.legs) || []; }
  function legAt(t) { var k = (S.legs && S.legs[t.id]) || 0; return k < legList(t).length ? legList(t)[k] : null; }
  function legSceneName(sid) { var sc = D.SCENES[sid]; return sc ? sc.name : sid; }
  function legHintOf(t) { var lg = legAt(t); return lg ? ((lg.hint || '') + (lg.scene ? '（' + legSceneName(lg.scene) + '）' : '')) : ''; }
  function legRoute(t) {
    var k = (S.legs && S.legs[t.id]) || 0;
    return legList(t).map(function (lg, i) {
      var mark = i < k ? '✓' : (i === k ? '●' : '○');
      return mark + ' ' + legSceneName(lg.scene);
    }).join(' → ');
  }
  function runLegs(quiet) {
    if (!S.legs) S.legs = {};
    var changed = false;
    D.TASKS.forEach(function (t) {
      if (!legList(t).length) return;
      var k = S.legs[t.id] || 0, moved = false;
      while (k < t.legs.length) {
        var lg = t.legs[k];
        var here = !lg.scene || lg.scene === S.scene;
        var done = !lg.flag || !!S.flags[lg.flag];
        if (here && done) { k++; moved = true; } else break;
      }
      if (moved) {
        S.legs[t.id] = k; changed = true;
        if (k < t.legs.length) {
          var nx = t.legs[k];
          if (!quiet) toast('差事推进 · ' + t.title + '：接着去 ' + legSceneName(nx.scene) + (nx.hint ? '（' + nx.hint + '）' : ''));
          addLog('… 跑腿：' + t.title + ' 走到第 ' + k + '/' + t.legs.length + ' 段');
        }
      }
      /* 纯跑腿任务（errand）：走完整条路线，这条差事就算办成 —— 旗标从路上来。
         其余"跑腿 + 办事"的任务：路线只是路，事还得真办（旗标由别处给）。 */
      if (k >= t.legs.length && t.errand && !S.flags[t.flag]) {
        S.flags[t.flag] = 1; changed = true; runDerived();
      }
      /* 事办完了 + 路线走完了 → 任务才算完成 */
      if (k >= t.legs.length && S.flags[t.flag] && !S.tasks[t.id]) {
        S.tasks[t.id] = 1; changed = true;
        toast('任务完成 · ' + t.title);
        addLog('✓ 任务完成：' + t.title + '（跑完 ' + t.legs.length + ' 段：' + legRoute(t) + '）');
        sfx('open');
      }
    });
    if (changed) { dirty.hud = 1; dirty.tasks = 1; save(); }
    return changed;
  }

  /* ---------- 反制：泼灯油（定住十几秒，圈里圈外都算）---------- */
  var OIL_R = 5.4, OIL_T = 15, OIL_PRICE = 2;
  function pourOil() {
    if (!global.MOBS23) return 0;
    if (!DEVM.inf && (S.oil || 0) <= 0) { toast('灯油见底了 —— 记当铺柜台有卖（' + OIL_PRICE + ' 枚一罐）。'); return 0; }
    if (!DEVM.inf) S.oil--;                            /* v34 B4：无限灯油开关 */
    var n = global.MOBS23.oil(S.mx, S.my, OIL_R, OIL_T);
    sfx('open');
    addLog('泼了一罐灯油 —— 雾里的东西定住了 ' + OIL_T + ' 秒。');
    toast(n ? ('灯油泼下去：' + n + ' 只被定住 ' + OIL_T + ' 秒，动不了也吐不出。')
            : ('地上亮起一摊灯油 —— ' + OIL_T + ' 秒内它不敢踩进来。'));
    dirty.hud = 1; save();
    return n || 1;
  }

  /* ---------- 记忆损伤（这一轮的新玩法）---------- */
  /* 雾里的东西咬人不掉血，只咬记。两档：hurt 1 = 缺字，hurt 2 = 碎了（state='spoiled'）。
     挑哪一段：先挑"伤得最轻、痛感最低"的那段 —— 有准谱，玩家能预料，也补得回来。 */
  function memHurt(id) { var st = S.mem[id]; return (st && st.hurt) || 0; }
  function damagedMem() {
    return D.MEM23.filter(function (m) {
      var st = S.mem[m.id] || {};
      return (st.hurt || 0) > 0 || st.state === 'spoiled';
    });
  }
  /* 缺字的记：每三个字挖掉一个（碎了就只留框） —— "想不起来"得看得见 */
  function fuzzyText(text, hurt) {
    if (!hurt) return text;
    var out = '';
    for (var i = 0; i < text.length; i++) out += (hurt >= 2 || i % 3 === 1) ? '◻' : text[i];
    return out;
  }
  function fixCost(hurt) { return 2 * Math.max(1, hurt || 1); }
  /* 记一旦不在身上（被咬 / 当出去），就不该再有地方放着它的正文。
     实测漏在"日志"里：咬完那一行把整段原文抄了一遍，玩家点开日志就能读完 —— 等于白咬。
     柜台那份是当铺替你收着的（规则允许）；日志是"你经历过的记录"，缺字就得是缺字。 */
  function memGone(m) {
    var st = S.mem[m.id] || {};
    return st.state !== 'held' || (st.hurt || 0) > 0;
  }
  function purgeMemLog() {
    var cut = 0;
    S.log = (S.log || []).filter(function (l) {
      var raw = (l && l.raw) || '', bad = false;
      D.MEM23.forEach(function (m) {
        if (bad || !m.text || !memGone(m)) return;
        /* 整段命中，或者前 12 个字命中 —— 抄一半的日志同样得走 */
        if (raw.indexOf(m.text) >= 0 || (m.text.length > 12 && raw.indexOf(m.text.slice(0, 12)) >= 0)) bad = true;
      });
      if (bad) cut++;
      return !bad;
    });
    if (cut) dirty.log = 1;
    return cut;
  }
  function damageMemory(n, why) {
    n = n || 1;
    var hitList = [];
    for (var k = 0; k < n; k++) {
      var cand = D.MEM23.filter(function (m) {
        var st = S.mem[m.id];
        return st && st.state === 'held' && ((st.hurt || 0) < 2);
      });
      if (!cand.length) { toast('它张了张嘴，可你身上已经没几段完整的记了。'); break; }
      /* 挑法有准谱：先挑伤得最轻的，再挑痛感最低的；
         妹妹那段（pawnedFromStart）永远排最后 —— 结局的眼泪不该被小怪提前咬掉 */
      cand.sort(function (a, b) {
        return (memHurt(a.id) - memHurt(b.id)) ||
          ((a.pawnedFromStart ? 1 : 0) - (b.pawnedFromStart ? 1 : 0)) ||
          (a.w - b.w) || (a.id < b.id ? -1 : 1);
      });
      var v = cand[0], st2 = S.mem[v.id];
      st2.hurt = (st2.hurt || 0) + 1;
      if (st2.hurt >= 2) st2.state = 'spoiled';
      hitList.push(v);
      /* 日志里只留"哪一段被咬"——正文一个字都不抄（抄了，玩家翻日志就能把整段读回来） */
      addLog('被咬掉一口：' + v.tag + ' —— ' + (st2.state === 'spoiled' ? '整段散了，接不起来。' : '缺了几个字，补得回来。'));
    }
    if (hitList.length) {
      var v2 = hitList[0], now = S.mem[v2.id];
      jolt(0.5);
      purgeMemLog();                                   /* 之前抄进日志的正文，一并抹掉 */
      toast(now.state === 'spoiled'
        ? '咬碎了一段记：' + v2.tag + '。接不起来了 —— 记当铺柜台能补。'
        : '被咬掉一口：' + v2.tag + '，缺了字。补得回来（记当铺柜台）。');
      dirty.mem = 1; dirty.hud = 1;
      save();
    }
    return hitList;
  }
  /* 谜题反噬：数据里写了 harm 的谜题，错够次数就咬一段记（先给一次提醒） */
  var wrongSeen = {};
  function puzzleWrong(puzId) {
    var pz = D.PUZZLES[puzId] || {};
    var harm = pz.harm;
    if (!harm || !harm.wrong) return 0;
    wrongSeen[puzId] = (wrongSeen[puzId] || 0) + 1;
    var n = wrongSeen[puzId];
    if (n % harm.wrong === 0) {
      var got = damageMemory(harm.dmg || 1, 'puzzle:' + puzId);
      if (got.length) toast('这段机关咬人：错 ' + harm.wrong + ' 次，' + got[0].tag + '被咬了一口。');
      return got.length;
    }
    toast('不对。再错 ' + (harm.wrong - (n % harm.wrong)) + ' 次，它就要咬你的记了。');
    return 0;
  }
  function puzzleSolved(puzId) { wrongSeen[puzId] = 0; }
  /* 灯圈：小怪拿它当"不敢进"的安全区（门楼 + 每处可交互点，正好就是画面上发光的地方） */
  function lightTiles() {
    var sc = scene(), out = [];
    sc.portals.forEach(function (p) { out.push([p.x, p.y]); });
    sc.places.forEach(function (p) { if (p.kind !== 'look' && !p.npc) out.push([p.x, p.y]); });
    return out;
  }
  function syncMobs() {
    if (!global.MOBS23) return;
    global.MOBS23.setLights(lightTiles());
  }
  var threatText = '';
  function syncThreat() {
    var el = $('threat'); if (!el) return;
    var th = global.MOBS23 ? global.MOBS23.threat() : null;
    var txt = th ? ('有东西在靠近：' + th.kind.name + ' · 距你 ' + th.d.toFixed(1) + ' 格' + (modalOpen ? ' —— 它就在面板后头等着' : ' · 往灯下走')) : '';
    if (txt === threatText) return;
    threatText = txt;
    el.textContent = txt;
    if (el.classList) el.classList[txt ? 'add' : 'remove']('on');
    if (document.body && document.body.classList) document.body.classList[txt ? 'add' : 'remove']('mp-threat');
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
    var pending = [];
    var hit = D.TASKS.filter(function (t) { return t.flag === flag; });
    hit.forEach(function (t) {
      if (legList(t).length && ((S.legs && S.legs[t.id]) || 0) < t.legs.length) { pending.push(t); return; }
      S.tasks[t.id] = 1;
      toast('任务完成 · ' + t.title);
      addLog('✓ 任务完成：' + t.title + '（' + t.brief + '）');
      sfx('open');
    });
    runLegs(true);                 /* 事办完了 + 路线走完了，就在这一下结算 */
    pending.forEach(function (t) {
      if (!S.tasks[t.id]) toast('事办好了 · ' + t.title + ' —— 可这趟差事还没跑完：' + legHintOf(t));
    });
    var opened = doorsOpenedBy(flag);
    if (opened.length) { toast('门开了 · ' + opened.join('、')); addLog('门开了：' + opened.join('、')); }
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
    /* 谜题层要知道"面板合上了"：连环锁的表关着也走，旧的定时器一律作废 */
    try { if (global.PUZZLES23 && global.PUZZLES23.onModalClose) global.PUZZLES23.onModalClose(); } catch (e) { /* ignore */ }
  }
  function modalBody() { return $('m-body'); }
  /* 面板（谜题/柜台/日志）开着被咬：画布上的抽搐被面板挡着看不见，抖的得是面板自己 */
  function biteFlash() {
    if (!modalOpen) return;
    var el = $('m-card'); if (!el) return;
    el.classList.remove('mp-bite');
    void el.offsetWidth;                       /* 强制重排：连着被咬两次也要各抖一下 */
    el.classList.add('mp-bite');
    setTimeout(function () { el.classList.remove('mp-bite'); }, 520);
  }

  /* ---------- 交互 ---------- */
  /* 记没了，话就换了：
     身上没有那段记（当出去了 / 咬碎了），跟人和东西打交道的方式就变 —— 人换一套台词，
     东西只剩"看见"，没有"想起"。
     两条硬规矩：
       ① **不许吃掉信息**：东西还在原处、字还刻在石头上 —— 丢的是"它跟谁有关"，不是"它是什么"。
          否则丢了记等于过不了关，那不是玩法，是惩罚。
       ② **不许吃掉玩法**：替代台词照样走原来的分发（开门 / 开谜题 / 给相簿），一步都不少。 */
  var MEM_LINK = {
    lamp: 'm_first_light', clock: 'm_mother', chest: 'm_mother', book: 'm_first_light',
    carve: 'm_sister_hand', hai: 'm_boat', oil: 'm_mother', copy2: 'm_sister_hand',
    tin: 'm_mother', ashes: 'm_blank', sea: 'm_boat', lights: 'm_first_light', logbook: 'm_first_light',
    dock: 'm_bell', chen: 'm_mother', sea_lamp: 'm_first_light',
    letters: 'm_letter',
    awang: 'm_salt', chest2: 'm_sister_hand', saltbook: 'm_salt', saltpile: 'm_salt',
    liu: 'm_blank', namewall: 'm_sister_hand', inbook: 'm_blank', shelfrow: 'm_blank',
    northwin: 'm_blank', burn: 'm_blank', stillclock: 'm_mother',
    her_words: 'm_sis_voice', othlamp: 'm_boat', boatshape: 'm_boat', her: 'm_sis_voice',
    /* ---- v33：附录 1 的 28 个新挂点 —— 60 个交互点全挂上，一个不漏 ---- */
    pawn_door: 'm_pawn_door', arch_door: 'm_arch_door', board: 'm_board', saltgate: 'm_saltgate',
    notice: 'm_notice', keeper: 'm_keeper', shelf: 'm_shelf', scales: 'm_scales',
    ledger: 'm_ledger', scale_pan: 'm_scale_pan', back: 'm_back', abacus: 'm_abacus',
    pawnsig: 'm_pawnsig', sluice: 'm_sluice', post: 'm_post', gauge: 'm_gauge',
    wrack: 'm_wrack', dike: 'm_dike', switches: 'm_switches', saltnames: 'm_saltnames',
    search: 'm_search', fogdoor: 'm_fogdoor', cipher: 'm_cipher', song: 'm_song',
    ask: 'm_ask', halves: 'm_halves', chainlink: 'm_chainlink', return: 'm_return'
  };
  /* 写过的替代台词（没写的走下面的通用句） */
  var LOST_SAY = {
    chen: [
      '陈婶在盐仓门口择菜，看见你，手停了半拍。',
      '「你妈那盏灯，你还记得多少？」她问完自己先别开脸。',
      '你张了张嘴。灯记得，手记得——手心里那点机油味，想不起来了。',
      '「……瞧我这嘴。」她把菜叶在围裙上擦了两下，「回去吧。天要黑了。」'
    ],
    awang: [
      '老盐工蹲在盐堆边捻盐，捻得很慢：「你小时候第一次尝盐，是我给你的。」',
      '你尝过盐。咸是咸的。她后面那句话，你想不起来了。',
      '她把指头上的盐搓掉：「不记得就算了。盐不用人记。」'
    ],
    hai: [
      '「上回出海，你吐得舱板上都是。」阿海笑着看你，「这回还去不去？喏，不去也行。」',
      '海你记得，船你也记得。出海那天的事，一片空白。',
      '他见你没接话，自己把话头收了：「……行。那你歇着。」',
      '他把空灯罩往肩上一扛，走两步又回头：「字的事我不问。路的事你喊我。」'
    ],
    liu: [
      '柳先生的眼睛对着窗：「你十五岁以前的事，馆里有几页纸替你说。」',
      '「几页？」你没听清。他也侧过头：「……什么？」',
      '你想问他那几页纸写了什么——可你连「想知道什么」都想不起来了。',
      '「不急。」他把纸卷好，用袖子压了压，「纸比我活得久。它等你。」'
    ],
    her: [
      '她就站在雾里，背对着灯。你想叫她，可你不知道该叫她什么。',
      '她回过一点头——不是看你，是在等。',
      '「今天第几天了？」她问。',
      '你答不上来。她自己说：「不记得了。反正灯还亮着。」'
    ],
    carve: [
      '礁石背面有刻痕，一道一道，数不清。最深处刻着两个字。',
      '你认得那两个字：阿隐。可你想不起这是谁的名字了。',
      '你伸手摸了一遍。有一道刻得特别浅，像刻的人中途停了手。'
    ],
    lamp: [
      '灯楼的门是虚掩的。煤油味，混着一点海腥。',
      '你伸手去够火，手没抖。',
      '第一次点这盏灯是什么时候、划了几根火柴，你想不起来了。'
    ],
    letters: [
      '柜台底下塞着一沓信，麻线捆着，收信人一栏全写着同一个名字：阿隐。',
      '你在外地写过信吗？想不起来。',
      '信上的字横平竖直，收笔的地方往回勾。你认得这个字，认不出写字的人。'
    ],
    dock: [
      '码头边的桩子上挂着一串旧铃铛——雾铃。起雾的时候该有人摇它。',
      '铃怎么摇，你忘了。那串铃响起来是什么声，你也忘了。',
      '断口以上那道磨出来的亮痕，你看了半天，没想起来是谁攥的。'
    ],
    book: [
      '手抄本是守灯人的记事：天气、潮位、灯油，一天一行。',
      '有一页被撕走了。撕走的那页上写过什么，你想不起来。',
      '你把剩下的半页对着灯看。纸边上那道干水痕是谁留下的，你也想不起来。'
    ],
    chest: [
      '铁盒在礁石缝里，锁早就锈了。里面三样东西：一截新灯芯、一本抄本、一张对折的纸。',
      '这三样是谁放的、那句话是谁写的，你想不起来了。',
      '你把纸展开又对折回去。折痕跟原来那道重合。'
    ],
    namewall: [
      '碑上刻着守灯人的名字，一代一代。最新的三个字被凿掉了，凿痕很深。',
      '你一个一个看过去，一张脸都想不起来。包括你自己那一行。',
      '碑脚散着几块碎石。你捡起来一块，又放回去。'
    ],
    burn: [
      '墙上的火痕是一整片，从地脚烧到房梁。甲午年那场火，把替记契的副本烧了个干净。',
      '烧掉的那些写着谁的事——你想不起来了。',
      '墙角那块没烧到的凹槽还在。你拿手比了比，比不出什么。'
    ],
    stillclock: [
      '东墙上挂着一只木壳挂钟，钟摆垂着，不动，停在三点四十五。',
      '母亲说过这个钟点是什么时候。你站在钟底下，什么也没等到。',
      '「别修。」柳先生在窗边说，「修好了，我就得知道现在几点了。」'
    ],
    chest2: [
      '潮退下去，礁缝里露出半只铁盒。盒子里没有别的，只有一张照片。',
      '照片上是两个小孩，背对着海，手拉着手。你认得其中一个是你。',
      '另一个是谁，你想不起来了。'
    ],
    /* ---- v33 表 B：45 处失忆台词（剧情线交付，一个字没改）---- */
    clock: [
      '钟还在走，走到三点四十五就停住了。',
      '谁把它停在这个点上的，你想不起来。你没动它。'
    ],
    oil: [
      '灯油桶是满的，灯罩搁在旁边，擦得干净。',
      '谁教你剪灯芯、油添到几指高，你想不起来。桶和灯罩都在原处。'
    ],
    copy2: [
      '抄本第二本摊在桌上，字迹跟第一本不一样。',
      '写字的人跟你是什么关系，你想不起来。本子还能翻。'
    ],
    tin: [
      '针线盒开着，里面是顶针、线头、两枚纽扣。',
      '谁用这个盒子补过谁的衣裳，你想不起来。盒子还在。'
    ],
    ashes: [
      '灯台底下有一堆灰，扫过又落了一层。',
      '烧掉的是什么、什么时候烧的，你想不起来。灰还在。'
    ],
    sea: [
      '望海台上风大，栏杆上有一道绳子磨出来的印。',
      '你在这儿等过谁，想不起来。海还是那个海。'
    ],
    lights: [
      '九宫灯阵一盏一盏都亮着，格子边上刻着号。',
      '谁教你排这个次序，你想不起来。号还刻着。'
    ],
    logbook: [
      '记事簿翻到最新一页，上一行写着「油满」。',
      '前面那些页是谁写的，你想不起来。字还在纸上。'
    ],
    sea_lamp: [
      '海边的灯座是空的，底下一圈油渍。',
      '这儿本来放的是哪盏灯、谁放的，你想不起来。座还在。'
    ],
    saltbook: [
      '晒盐簿摊在盐堆边，页角被盐吃出洞。',
      '簿上那些名字，你认得字，认不出人。'
    ],
    saltpile: [
      '盐堆上插着三根木签，签上刻着道道。',
      '三道是什么意思、谁刻的，你想不起来。签还插着。'
    ],
    inbook: [
      '入册簿摊在柜上，最新一行只有年份，没有名字。',
      '空着那一格本来写谁，你想不起来。格还在。'
    ],
    shelfrow: [
      '没编号的那格书架上落着灰，中间一小块是干净的。',
      '拿走的是一册什么、谁拿的，你想不起来。空位还在。'
    ],
    northwin: [
      '朝北的窗关不严，窗台上落着一小堆灰。',
      '你在这扇窗前等过什么，想不起来。窗框上那截钉还在。'
    ],
    her_words: [
      '石头下面压着一张纸，笔画很轻，是竖着写的。',
      '字是谁写的、写给谁的，你想不起来。纸还在石头下面。'
    ],
    othlamp: [
      '雾里那盏灯亮着，碗沿缺了一块。',
      '谁点的灯、给谁点的，你想不起来。灯还亮着。'
    ],
    boatshape: [
      '雾里的船影是空的，甲板上有两个并排的脚印。',
      '船是谁的、为什么搁在这儿，你想不起来。船影还在。'
    ],
    pawn_door: [
      '门开着，门槛比别家矮半寸。',
      '谁把它削低的、为什么削，你想不起来。门照样进。'
    ],
    arch_door: [
      '馆门锁着，钥匙不在门上。',
      '钥匙在谁袖子里、怎么进去，你想不起来。门还是那道门。'
    ],
    board: [
      '牌子上挂着三张活儿，字迹各不相同。',
      '谁挂的、揭了要交给谁，你想不起来。活儿还能揭。'
    ],
    saltgate: [
      '坡又长又陡，路面上全是白印子。',
      '这道坡通向哪儿、挑盐的人为什么在这儿歇脚，你想不起来。坡还在。'
    ],
    notice: [
      '牌子上贴着潮汛，还有一张禁令。',
      '禁令是谁写的、为什么禁，你想不起来。字还贴在上面。'
    ],
    keeper: [
      '柜台后站着一个人，一直在打算盘。',
      '他叫什么、跟你做过什么买卖，你想不起来。算盘还在响。'
    ],
    shelf: [
      '架子上标着价，最上层那格空着。',
      '那格是替谁留的，你想不起来。架子还能看。'
    ],
    scales: [
      '秤是黄铜的，秤盘里有一道刻痕。',
      '这道痕是怎么磨出来的，你想不起来。秤还能称。'
    ],
    ledger: [
      '账本摊在柜台上，蓝布封面磨破了。',
      '后一半记的是什么，你想不起来。本子还能翻。'
    ],
    scale_pan: [
      '秤盘底下压着一枚铜钱。',
      '谁压的、压了多少年，你想不起来。钱还在盘子底下。'
    ],
    back: [
      '里间的门关着，门缝里有股旧纸味。',
      '里面放的是什么、谁进去过，你想不起来。门没上锁。'
    ],
    abacus: [
      '算盘摆在柜台角上，珠子是木的。',
      '谁打的算盘、算什么用的，你想不起来。珠子一颗不少。'
    ],
    pawnsig: [
      '当票背面有个小记号，是指甲划的。',
      '记号什么意思、谁划的，你想不起来。票还在你手里。'
    ],
    sluice: [
      '闸门是青石的，堤头四块闸板，板角都刻着号。',
      '先开哪块、后开哪块，你想不起来。板还在，号还刻着。'
    ],
    post: [
      '桩子立在水边，上面刻着一道一道的横线。',
      '这些线是什么时候刻的，你想不起来。桩还立着。'
    ],
    gauge: [
      '石尺从水里露出五格，第一格被摸得发亮。',
      '第一格为什么最亮，你想不起来。尺还能读。'
    ],
    wrack: [
      '滩上摊着一堆东西：木片、破网、一只鞋。',
      '鞋是谁的、这些东西是谁丢的，你想不起来。东西都还在滩上。'
    ],
    dike: [
      '豁口比别处低一截，石头填过又塌了。',
      '谁填的、塌过几回，你想不起来。豁口还等着人动手。'
    ],
    switches: [
      '四块闸板立在堤头，板上的刻号是漆过的。',
      '四块板该怎么配，你想不起来。号还在板上。'
    ],
    saltnames: [
      '池底全是刻出来的字，一个挨着一个。',
      '这些名字都是谁的，你想不起来。字还在石头上。'
    ],
    search: [
      '架子按年份排，每册脊上都贴着号。',
      '该抽哪一册、按什么条件抽，你想不起来。号还能认。'
    ],
    fogdoor: [
      '北门是两块木板拼的，合不严。',
      '这扇门通向哪儿、为什么常年不锁，你想不起来。雾从缝里进来。'
    ],
    cipher: [
      '契上有一个字比别的字浅。',
      '这个字被谁换过、原来是什么，你想不起来。底下那一层还在。'
    ],
    song: [
      '她敲了四下，停了一下，又敲三下。',
      '这四个音是哪首、她什么时候教的，你想不起来。她又敲了一遍。'
    ],
    ask: [
      '有人问你叫什么。',
      '名字你说得出来，可你不记得这问题问过多少回了。'
    ],
    halves: [
      '桌上摊着半句话，后半截写着「把名字还给她」。',
      '前半截在哪儿、这句话原来说的是谁，你想不起来。'
    ],
    chainlink: [
      '锁有七环，每环上都刻着数。',
      '七环该按什么顺序咬上，你想不起来。环数得清。'
    ],
    return: [
      '名字就在你手上。',
      '还回去会怎么样、以前有谁还过，你想不起来。手还能伸出去。'
    ],
  };
  /* ============ v33：分类 + 名字门控（契约 §三 / §四）============
     认不出它是什么，但东西还在原处 —— 丢的只是"它跟谁有关"。两条硬规矩照抄 v30：
       ① 不吃信息：原物、刻痕、号码、纸都在原处；
       ② 不吃玩法：interact() 的分发一步不少，照样开门 / 开谜题 / 给相簿。
     降级是双向的：把那段记赎回来，名字当场恢复（memKnown 一翻脸就还回去）。 */
  var CAT_ORDER = ['person', 'thing', 'place', 'self'];
  var CAT_CN = { person: '人', thing: '物', place: '地', self: '己' };
  /* 认不出时的说法：说得清"这东西还在"，不报它的名 */
  var LOST_NAME = {
    lamp: '门虚掩着的灯楼',
    clock: '停住不走的老物件',
    chest: '一只上了年头的铁盒',
    book: '一本字迹发旧的手抄',
    carve: '石头上深深浅浅的道子',
    hai: '总扛着空灯罩的年轻人',
    oil: '满着的油桶和擦净的灯罩',
    copy2: '摊在桌上的另一本册子',
    tin: '敞着的针线盒子',
    ashes: '灯台底下的一小堆灰',
    sea: '风很大的临海平台',
    lights: '一格一格亮着的灯格子',
    logbook: '翻到最新一页的簿子',
    dock: '晒着渔网的水边台阶',
    chen: '在盐仓门口择菜的人',
    sea_lamp: '海边那个空着的铁座子',
    letters: '麻线捆着的一沓旧信',
    awang: '蹲在盐堆边捻盐的老人',
    chest2: '卡在石缝里的方盒子',
    saltbook: '页角被盐吃出洞的簿子',
    saltpile: '一堆盐，插着三根木签',
    liu: '守着一屋子纸的人',
    namewall: '刻满字的石碑',
    inbook: '摊在柜上的册子',
    shelfrow: '落着灰的那格架子',
    northwin: '关不严的一扇窗',
    burn: '墙上熏黑的一片',
    stillclock: '指针钉死在那儿的钟',
    her_words: '石头下压着的一张纸',
    othlamp: '雾里亮着的那点光',
    boatshape: '雾里空着的一条船',
    her: '雾里背对着灯的那个人',
    pawn_door: '矮半寸的那道门',
    arch_door: '一道上着锁的大门',
    board: '挂着三张活儿的牌子',
    saltgate: '又长又陡的一道坡',
    notice: '贴着潮汛和禁令的牌子',
    keeper: '一直在擦柜台的人',
    shelf: '标着价的一排架子',
    scales: '黄铜的两只盘子',
    ledger: '蓝布封面的一本册子',
    scale_pan: '盘子底下压着的东西',
    back: '一道虚掩着的小门',
    abacus: '一排珠子，底下垫着布',
    pawnsig: '背面有个指甲划的记号',
    sluice: '整块青石凿的一扇闸',
    post: '水边一根刻着横线的桩',
    gauge: '从水里露出五格的石尺',
    wrack: '滩上摊着的一堆杂物',
    dike: '低下去的一截缺口',
    switches: '四块漆过号的板子',
    saltnames: '池底一片刻出来的字',
    search: '按年份排的一架子册子',
    fogdoor: '两块木板拼的门',
    cipher: '一个字颜色浅些的契纸',
    song: '四个音，敲了又停',
    ask: '有人在问你话',
    halves: '桌上摊着的半句话',
    chainlink: '七只咬在一起的铁环',
    return: '名字就在你手上',
  };
  function memKnown(id) {
    var m = D.mem23ById(id);            /* 没挂记忆的点：当"认得"处理，别把没门控的东西弄成哑巴 */
    if (!m) return true;
    var st = S.mem[id] || {};
    return (st.state || 'held') === 'held' && (st.hurt || 0) < 2;
  }
  function memNameOf(p) {
    if (!p) return '';
    var id = MEM_LINK[p.id];
    if (!id || memKnown(id)) return p.name || '';
    if (LOST_NAME[p.id]) return LOST_NAME[p.id];
    return p.npc ? '一个叫不出名字的人' : '一件叫不出名字的东西';
  }
  function memTotalW() {                /* §六-2：当金总量由数据现算，谁加条目它自己跟着动 */
    return (D.MEM23 || []).reduce(function (n, m) { return n + (m.w || 0); }, 0);
  }
  function memLinkedSay(p, lines) {
    var id = MEM_LINK[p.id];
    if (!id) return lines;
    var st = S.mem[id] || {}, m = D.mem23ById(id) || {}, tag = m.tag || '这段记';
    /* v34c：老档 / 删过条目的形状是"表里压根没有这条记"—— 照 memKnown 的同一口径当"在身上"。
       不等价就会串台：记好好的，说的却是失忆台词（真机验收抓到的：LOST_SAY 被误用）。 */
    var mstate = st.state || 'held', mhurt = st.hurt || 0;
    if (mstate === 'held' && mhurt < 2) {
      /* 只缺一个字：话还说得出口，但说得不全 */
      return mhurt === 1
        ? lines.concat(['（说到' + tag + '，你只记得半句 —— 剩下的字是空的。）'])
        : lines;
    }
    if (LOST_SAY[p.id]) return LOST_SAY[p.id].slice();
    if (p.npc) return ['（你想跟他说点什么。关于' + tag + '，你什么都想不起来。）',
      '（他看了你一会儿，见你没开口，自己把话头收了回去。）'];
    return ['（' + (p.name || '这东西') + '还在原处。你看了一会儿 —— 关于' + tag + '，你想不起来了。）'];
  }
  /* ============ v34 A1：记忆即钥匙（点位上锁，不是改名字）============
     v33 只把名字降级了 —— 解法没变，还是点同一个地方，那是贴皮。
     v34 让"那段记"当钥匙：KEY_GATE 里点过名的点，记不在身上时
       · 脚下那盏灯**不亮**（不是改名字，是这个点根本不发光）
       · 点了也不给原来的东西 —— 有 alt 的走糙办法（照样能过），没 alt 的只剩一句"想不起来"
     两条 v30 硬规矩照旧，这里更要紧：
       ① 不吃信息：糙办法里该知道的照样告诉你（谁的笔迹、纸上写的什么一个不少），
          代价是"留下痕迹"，不是"信息消失"；
       ② 不吃玩法：alt 路径照样置 p.flag（东西照拿、关照样过），只多一个痕迹旗标。
     门控表写在本文件（不动 story23.js）：KEY_GATE[id] = null 表示"有锁、没糙办法"。 */
  var KEY_GATE = {
    chest: {
      say: [
        '你把铁盒从石缝里抠出来，翻来覆去看了看 —— 一只上了年头的铁盒，你看不出是谁的。',
        '锁早锈了。你没有钥匙，也想不起该拿它怎么办 —— 手边有块礁石。',
        '你拿石头砸了两下。盒盖崩开一条缝，纸角跟着撕掉一小块。',
        '里面三样东西还在：一截新灯芯、一本手抄本、一张对折的纸。纸是母亲的笔迹，省字：',
        '「别去找她。灯我来守过了，你守好灯就行。」撕掉的那一小块，拼不出来了。',
        '你把纸折回去。手上沾着锈。'
      ],
      flag: 'chest_broke',                 /* 代价：铁盒是砸开的，留下痕迹 */
      log: '你把铁盒砸开了 —— 纸撕掉一角，盒盖再合不严了。'
    }
  };
  function memKeyOf(p) {
    return (p && p.id && Object.prototype.hasOwnProperty.call(KEY_GATE, p.id) && MEM_LINK[p.id]) ? MEM_LINK[p.id] : null;
  }
  function memKeyOpen(p) { var id = memKeyOf(p); return !id || memKnown(id); }
  function memAlt(p) { return (p && !memKeyOpen(p)) ? (KEY_GATE[p.id] || null) : null; }
  /* 记不在身上、点又上着锁：糙办法（有 alt）/ 一句"想不起来"（没 alt）。
     两条路都**不碰原来的分发面板**（买、当、念卷宗那些要求"知道自己在干什么"）。 */
  function memKeyBlocked(p) {
    var alt = memAlt(p), name = memNameOf(p);
    S.seen[p.id] = 1;
    if (!alt) {
      say(['（' + name + '就在你跟前。你看了一会儿 —— 想不起它跟你有什么关系。）',
           '（手伸出去又收回来：不是打不开，是你不知道该拿它怎么办。）'], null, { title: name });
      return;
    }
    say(alt.say, function () {
      if (p.flag) markFlag(p.flag);          /* ② 不吃玩法：该拿的照样拿到 */
      if (alt.flag) markFlag(alt.flag);      /* 代价留痕 */
      if (alt.log) addLog(alt.log);
      dirty.mem = dirty.log = dirty.hud = 1;
      if (p.to) enterScene(p.to, p.tx, p.ty);
      else if (p.kind === 'jobs') jobsPanel();
    }, { title: name });
  }
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
    if (p.need && !S.flags[p.need]) { lockToast(p.need, p.kind === 'portal'); return; }
    if (!memKeyOpen(p)) { memKeyBlocked(p); return; }   /* v34 A1：记不在身上，这个点根本不开 */
    sfx('select');
    var first = !S.seen[p.id];
    S.seen[p.id] = 1;
    var lines = (first || !p.again) ? (p.say || []) : p.again;
    lines = memLinkedSay(p, lines);      /* 那段记不在身上了：换一套话（分发照旧，一步不少） */
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
    }, { title: memNameOf(p) });
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
    setTitle(memNameOf(p));
    setBody('<p class="pz-tip">' + (p.say || []).join('</p><p class="pz-tip">') + '</p><p class="pz-tip">售价 ' + p.price + ' 枚当金（你有 ' + S.gold + ' 枚）</p>');
    setBtns([
      { label: '买下（' + p.price + ' 枚）', fn: function () {
        S.gold -= p.price; markFlag(p.flag); sfx('coin'); closeModal(); dirty.hud = 1; save();
        toast('买下了 · ' + memNameOf(p));
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
    if (S.flags[p.flag]) { setTitle(memNameOf(p)); setBody('<p class="pz-tip">' + (p.workDone || '已经做完了。') + '</p>'); setBtns([{ label: '好', fn: closeModal }]); openModal(); return; }
    setTitle(memNameOf(p));
    setBody('<p class="pz-tip">' + (p.say || []).slice(-1)[0] + '</p>');
    setBtns([
      { label: p.workLabel || '动手', fn: function () {
        markFlag(p.flag); sfx('open'); closeModal();
        toast(p.workDone || '做完了。');
        addLog('（' + memNameOf(p) + '）' + (p.workDone || '做完了。'));
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
      html += '<div class="arc-h">灯油（' + (S.oil == null ? 2 : S.oil) + ' 罐）—— 泼一罐，雾里的东西定住 15 秒</div>';
      html += '<div class="arc-item">柜上有灯油卖：' + OIL_PRICE + ' 枚一罐。<br>' +
        '<button class="pz-btn" data-buyoil="1">买一罐（−' + OIL_PRICE + '）</button></div>';
      var hurtList = damagedMem();
      html += '<div class="arc-h">缺字 / 碎了的（' + hurtList.length + '）—— 补记要付当金</div>';
      html += hurtList.map(function (m) {
        var h = memHurt(m.id) || 2, cost = fixCost(h);
        return '<div class="arc-item mem-hurt"><b>' + m.tag + '</b>' + fuzzyText(m.text, h) + '<br>' +
          '<button class="pz-btn" data-fix="' + m.id + '">补一段（−' + cost + '）</button></div>';
      }).join('') || '<div class="arc-lock">没有缺字的记 —— 账上干净。</div>';
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
          S.mem[id].state = 'pawned'; S.mem[id].pawns++; bgDirty = true;   /* v34：门控点外观跟着变 */
          S.gold += m.w; sfx('coin');
          addLog('当掉了：' + m.tag + '（+' + m.w + ' 枚）');
          purgeMemLog();
          toast('当掉 · ' + m.tag + '（+' + m.w + '）');
          markFlag('first_pawn'); dirty.hud = 1; dirty.mem = 1; save(); render();
        };
      });
      b.querySelectorAll('[data-buyoil]').forEach(function (el) {
        el.onclick = function () {
          if (S.gold < OIL_PRICE) { toast('当金不够 —— 一罐灯油 ' + OIL_PRICE + ' 枚。'); return; }
          S.gold -= OIL_PRICE; S.oil = (S.oil || 0) + 1; sfx('coin');
          addLog('买了一罐灯油。'); toast('灯油 +1（共 ' + S.oil + ' 罐）');
          dirty.hud = 1; save(); render();
        };
      });
      b.querySelectorAll('[data-fix]').forEach(function (el) {
        el.onclick = function () {
          var id = el.getAttribute('data-fix'), st3 = S.mem[id], h3 = st3.hurt || 2, cost3 = fixCost(h3);
          var m3 = D.mem23ById(id);
          if (S.gold < cost3) { toast('补记要 ' + cost3 + ' 枚当金 —— 不够。'); return; }
          S.gold -= cost3; st3.hurt = h3 - 1;
          if (st3.hurt < 2 && st3.state === 'spoiled') st3.state = 'held';
          if (st3.hurt <= 0) st3.hurt = 0;
          sfx('coin'); dirty.hud = 1; dirty.mem = 1; save();
          addLog('补回来一段：' + ((m3 && m3.tag) || id));
          toast(st3.hurt ? ('补回一半：还缺 ' + st3.hurt + ' 处字。') : ('补好了：' + ((m3 && m3.tag) || id) + ' 又在身上了。'));
          render();
        };
      });
      b.querySelectorAll('[data-redeem]').forEach(function (el) {
        el.onclick = function () {
          var id = el.getAttribute('data-redeem'), m = D.mem23ById(id), cost = m.w;
          if (S.gold < cost) { toast('当金不够——赎回这段要 ' + cost + ' 枚。'); return; }
          S.gold -= cost; S.mem[id].state = 'held'; S.redeemed++; bgDirty = true;   /* v34：名字回来，外观也回来 */
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
    setTitle(memNameOf(p) + ' · 念卷宗');
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
    puzzleSolved(puzId);          /* 这一局错了几次，解开就归零 */
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
    var lg = nt ? legHintOf(nt) : '';
    $('hud-goal').textContent = nt ? (nt.title + (lg ? ' · ' + lg : '')) : '都做完了';
    var ho = $('hud-oil'); if (ho) ho.textContent = (S.oil == null ? 2 : S.oil);
    var hw = $('hud-hurt-wrap'), hn = damagedMem().length;
    if (hw) {
      hw.style.display = hn ? '' : 'none';
      $('hud-hurt').textContent = hn;
    }
  }
  function refreshLog() {
    var p = $('pane-log'); if (!p) return;
    p.innerHTML = S.log.slice(-60).reverse().map(function (l) {
      return '<div class="arc-item">' + l.raw + '</div>';
    }).join('') || '<div class="arc-lock">还没有发生什么。</div>';
  }
  /* 任务页只回答一件事：**现在我该干什么**。
     口径改过两回：① 以前把五幕 46 条一次摊开 —— 后面的幕次既剧透又干扰，看到的是目录不是待办；
     ② 2026-10-11 用户拍板「只显示目前要做的是什么」：同幕其余项**标题和线索都不再列**，
        只留一行报数（另有 N 项在雾里）。**后面几幕的标题一个字都不出现**（有测试钉着）。 */
  function refreshTasks() {
    var p = $('pane-tasks'); if (!p) return;
    var list = D.tasksOfAct(S.act);
    var todo = list.filter(function (t) { return !taskDone(t); });
    var done = list.filter(function (t) { return taskDone(t); });
    var next = todo.filter(function (t) { return t.kind === 'main'; })[0] || todo[0] || null;
    var lastAct = 1; D.TASKS.forEach(function (t) { if (t.act > lastAct) lastAct = t.act; });
    var html = '<div class="arc-h">第 ' + S.act + ' 幕 · 现在（还差 ' + todo.length + ' 项）</div>';
    if (next) {
      html += '<div class="arc-item task-now"><span class="tn-tag">现在</span><b>' + next.title + '</b>' + next.brief +
        '<br><span style="color:var(--dim)">线索：' + next.hint + '</span>' +
        (legList(next).length ? ('<div class="leg-route">路线：' + legRoute(next) +
          (legAt(next) ? '<br>这一段：' + legHintOf(next) : '') + '</div>') : '') + '</div>';
    }
    /* 同幕其余项：只报数，不列标题、不列线索（列出来就是一张目录，不是"现在该干什么"） */
    var rest = todo.filter(function (t) { return !next || t.id !== next.id; });
    if (rest.length) html += '<div class="arc-item" style="color:var(--dim)">另有 ' + rest.length +
      ' 项在雾里 —— 不摊开，只报个数。</div>';
    if (!todo.length) html += '<div class="arc-item">这一幕该做的都做了 —— 往前走，下一幕自己会来。</div>';
    if (done.length) {
      html += '<div class="arc-h">本幕已了（' + done.length + '）</div>' + done.map(function (t) {
        return '<div class="arc-item done-line">✓ ' + t.title + '</div>';
      }).join('');
    }
    var past = [];
    for (var a = 1; a < S.act; a++) {
      var pl = D.tasksOfAct(a);
      if (pl.length) past.push('第 ' + a + ' 幕 ' + pl.filter(taskDone).length + '/' + pl.length);
    }
    var shut = [];
    scene().portals.concat(scene().places).forEach(function (q) {
      if (q.to && q.need && !S.flags[q.need]) shut.push('<b>' + (q.label || memNameOf(q)) + '</b> —— 要先做完' + needText(q.need));
    });
    if (shut.length) html += '<div class="arc-h">这里出不去（' + shut.length + '）</div><div class="arc-item locked">' + shut.join('<br>') + '</div>';
    html += '<div class="arc-note">' + (past.length ? past.join(' · ') + ' · 过去了<br>' : '') +
      (lastAct > S.act ? '后面还有 ' + (lastAct - S.act) + ' 幕 —— 到那一幕，才轮到你操心。' : '这是最后一幕了。') + '</div>';
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
  /* v33：按 cat 分组（契约 §六-4）—— 组头带条数、空组不显示；组内保持原顺序 */
  function memCatGroups(list, blank) {
    var out = '';
    CAT_ORDER.forEach(function (cat) {
      var grp = list.filter(function (x) { return (x.m.cat || 'self') === cat; });
      if (!grp.length) return;
      out += '<div class="arc-h mem-cat-head" data-cat-head="' + cat + '">' + CAT_CN[cat] +
        (blank ? ' · 押在柜上' : ' · 还记得') + '（' + grp.length + '）</div>';
      out += grp.map(function (x) {
        var hurt = x.st.hurt || 0, spoiled = x.st.state === 'spoiled';
        if (blank) {
          return '<div class="arc-item locked" data-cat="' + cat + '"><b class="mem-tag">' + x.m.tag + '</b>' +
            '<span class="mem-blank">（想不起来了 · 当票 ' + x.m.w + ' 枚' +
            (x.st.pawns > 1 ? ' · 当出去过 ' + x.st.pawns + ' 回' : '') + '）</span></div>';
        }
        var note = spoiled ? ('碎了 · 补要 ' + fixCost(2) + ' 枚')
          : (hurt ? ('缺字 ' + hurt + '/2 · 补要 ' + fixCost(hurt) + ' 枚') : ('痛感 ' + x.m.w));
        return '<div class="arc-item' + (hurt ? ' mem-hurt' : '') + '" data-cat="' + cat + '">' +
          '<b class="mem-tag">' + x.m.tag + '</b>' +
          (hurt ? fuzzyText(x.m.text, hurt) : x.m.text) +
          '<span class="mem-w">' + note + '</span></div>';
      }).join('');
    });
    return out;
  }
  function refreshMem() {
    var p = $('pane-mem'); if (!p) return;
    var all = D.MEM23, held = [], pawned = [];
    all.forEach(function (m) {
      var st = S.mem[m.id] || { state: 'held', pawns: 0 };
      (st.state === 'pawned' ? pawned : held).push({ m: m, st: st });
    });
    var html = '<div class="arc-h">在身上的（' + held.length + '/' + all.length + '）</div>';
    html += memCatGroups(held, false) || '<div class="arc-lock">身上一段记都没有了。</div>';
    if (damagedMem().length) html += '<div class="arc-item">被咬过的记能在记当铺柜台补（补一次 2 枚当金起）。</div>';
    html += '<div class="arc-h">押在柜上的（' + pawned.length + '）—— 当出去了，这儿就是空的</div>';
    html += memCatGroups(pawned, true) || '<div class="arc-lock">柜上没押着东西。</div>';
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
  /* 两个颜色按比例混（只吃 #rrggbb）—— 房子要的是"材质色"，不能把近黑的 solid 一路提亮 */
  function mix(a, b, t) {
    var A = /^#([0-9a-fA-F]{6})$/.exec(String(a || '')), B = /^#([0-9a-fA-F]{6})$/.exec(String(b || ''));
    if (!A || !B) return String(a || b || '#000');
    var va = parseInt(A[1], 16), vb = parseInt(B[1], 16), out = [];
    for (var sh = 16; sh >= 0; sh -= 8) out.push(Math.round(((va >> sh) & 255) + (((vb >> sh) & 255) - ((va >> sh) & 255)) * t));
    return 'rgb(' + out[0] + ',' + out[1] + ',' + out[2] + ')';
  }
  function shadowUnder(c, px, py, rx, ry) {
    /* 软影：一个径向渐变压扁出来的椭圆 —— 边缘是化的。
       以前是实心椭圆，放大以后像在角色脚下贴了块黑纸。 */
    var r = Math.max(1, rx);
    var g = c.createRadialGradient(px, py, 0.5, px, py, r);
    g.addColorStop(0, 'rgba(0,0,0,.36)');
    g.addColorStop(0.5, 'rgba(0,0,0,.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.save();
    if (c.translate && c.scale) {
      c.translate(px, py);
      c.scale(1, Math.max(0.18, ry / r));
      c.translate(-px, -py);
    }
    c.fillStyle = g;
    c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  /* 地面：每种场景一种铺法 + 逐格确定性微差，破掉"平铺棋盘"的廉价感 */
  function paintGround(c, pal, style) {
    c.fillStyle = pal.ground; c.fillRect(0, 0, VW, VH);
    for (var y = 0; y < GRID_H; y++) for (var x = 0; x < GRID_W; x++) {
      var px = x * CELL, py = y * CELL;
      var n1 = hash(x, y, 1), n2 = hash(x, y, 2), n3 = hash(x, y, 3);
      /* 四格一档的大斑 + 每格微差：以前是逐格明暗交替，铺出来就是一张棋盘（最像 8bit 的地方） */
      var macro = hash(x >> 2, y >> 2, 9);
      c.fillStyle = shade(pal.ground, (macro - 0.5) * 0.20 + (n1 - 0.5) * 0.10);
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
        c.strokeStyle = 'rgba(0,0,0,.20)'; c.lineWidth = 1;
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
  /* 建筑：从上看是屋顶（屋脊 + 瓦楞 + 檐），底下露出墙面（错缝砖 + 暖窗），脚下落影。
     一次烘焙，细节随便加都不吃帧率；每块的差别全由 hash 决定，刷新也不会变。 */
  function paintSolids(c, sc, pal) {
    var style = GROUND[sc.id] || 'stone';
    var lit = (sc.ambient === 'night' || sc.ambient === 'lamp' || sc.ambient === 'dusk');
    var vert = (style === 'stone' || style === 'tile' || style === 'salt');   /* 瓦楞竖着排；木板屋横着来 */
    sc.solids.forEach(function (s) {
      var x = s[0] * CELL, y = s[1] * CELL, w = s[2] * CELL, h = s[3] * CELL;
      var thin = (s[2] <= 1 || s[3] <= 1);        /* 一格宽 = 围墙 / 礁带，不是房子 */
      var wallH = thin ? h : Math.min(h - 6, Math.max(10, h * 0.38));
      var wallY = thin ? y : y + h - wallH;
      var i, k;
      /* 落影：三层错位，方块"立"在格子上 */
      for (i = 3; i >= 1; i--) {
        c.fillStyle = 'rgba(0,0,0,' + (0.07 + i * 0.04).toFixed(2) + ')';
        c.fillRect(x + i * 1.6, y + h - 4 + i * 1.8, w, 3 + i * 1.6);
      }
      if (!thin) {
        /* ---- 屋顶：双坡（中间一道屋脊）+ 瓦楞 + 瓦行 + 受光檐口 ---- */
        var roofTone = mix(pal.solid, (style === 'plank' || style === 'wood') ? '#8a7150' : '#6b7784', 0.52);
        var rx = x - 3, rw = w + 6, ry = y - 3, rh = h - wallH + 3;
        var rg = c.createLinearGradient(0, ry, 0, ry + rh);
        rg.addColorStop(0, shade(roofTone, 0.26));
        rg.addColorStop(0.46, shade(roofTone, 0.14));
        rg.addColorStop(0.54, shade(roofTone, -0.04));
        rg.addColorStop(1, shade(roofTone, -0.26));
        c.fillStyle = rg; c.fillRect(rx, ry, rw, rh);
        /* 瓦楞（顺坡）+ 瓦行（横档）：两个方向都有，才像一片瓦而不是一块板 */
        c.strokeStyle = 'rgba(0,0,0,.26)'; c.lineWidth = 1;
        for (i = (vert ? rx + 7 : ry + 6); i < (vert ? rx + rw : ry + rh) - 1; i += (vert ? 7 : 6)) {
          c.beginPath();
          if (vert) { c.moveTo(i + 0.5, ry + 1); c.lineTo(i + 0.5, ry + rh - 1); }
          else { c.moveTo(rx + 1, i + 0.5); c.lineTo(rx + rw - 1, i + 0.5); }
          c.stroke();
        }
        c.strokeStyle = 'rgba(0,0,0,.14)';
        for (i = ry + 8; i < ry + rh - 2; i += 8) {
          c.beginPath(); c.moveTo(rx + 1, i + 0.5); c.lineTo(rx + rw - 1, i + 0.5); c.stroke();
        }
        c.fillStyle = shade(roofTone, 0.52); c.fillRect(rx + 1, ry + rh * 0.46, rw - 2, 3);
        c.fillStyle = 'rgba(255,255,255,.16)'; c.fillRect(rx, ry, rw, 2);
        c.fillStyle = 'rgba(0,0,0,.40)'; c.fillRect(x, wallY - 4, w, 4);
        c.strokeStyle = 'rgba(0,0,0,.50)'; c.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
        /* 大屋顶上立一根烟囱（按 seed 决定有没有） */
        if (s[2] >= 3 && rh > 16 && hash(s[0], s[1], 41) > 0.45) {
          var chx = rx + 7 + hash(s[0], s[1], 43) * Math.max(1, rw - 22);
          c.fillStyle = shade(roofTone, -0.42); c.fillRect(chx, ry + 4, 7, 11);
          c.fillStyle = shade(roofTone, 0.34); c.fillRect(chx - 2, ry + 3, 11, 3.5);
          if (lit) { c.fillStyle = 'rgba(255,198,120,.22)'; c.fillRect(chx - 2, ry + 14, 11, 4); }
        }
      }
      /* ---- 墙身：错缝砖 + 墙脚压暗 ---- */
      var wallTone = mix(pal.solid, '#7c6c50', thin ? 0.34 : 0.42);
      var wg = c.createLinearGradient(0, wallY, 0, wallY + wallH);
      wg.addColorStop(0, shade(wallTone, 0.16));
      wg.addColorStop(1, shade(wallTone, -0.34));
      c.fillStyle = wg; c.fillRect(x, wallY, w, wallH);
      c.strokeStyle = 'rgba(0,0,0,.26)'; c.lineWidth = 1;
      var bn = 0;
      for (var by = wallY + 8; by < wallY + wallH - 2; by += 8, bn++) {
        c.beginPath(); c.moveTo(x + 1, by + 0.5); c.lineTo(x + w - 1, by + 0.5); c.stroke();
        for (var bx = x + (bn % 2 ? 12 : 4); bx < x + w - 2; bx += 16) {
          c.beginPath(); c.moveTo(bx + 0.5, by - 7); c.lineTo(bx + 0.5, by); c.stroke();
        }
      }
      c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(x, wallY, w, 1.6);
      c.fillStyle = 'rgba(0,0,0,.30)'; c.fillRect(x, wallY + wallH - 3, w, 3);
      if (thin) {
        /* 围墙 / 礁带：压顶石 + 竖缝，别看起来像一条纯色 */
        c.fillStyle = shade(wallTone, 0.34); c.fillRect(x, y, w, 3);
        c.fillStyle = 'rgba(255,255,255,.09)'; c.fillRect(x, y + 3, w, 1);
        c.strokeStyle = 'rgba(0,0,0,.24)'; c.lineWidth = 1;
        for (k = x + CELL; k < x + w - 1; k += CELL) { c.beginPath(); c.moveTo(k + 0.5, y + 4); c.lineTo(k + 0.5, y + h - 2); c.stroke(); }
      } else if (wallH >= 12) {
        /* ---- 窗：夜里点着灯就是暖的，没人就冷着 ---- */
        var wn = Math.floor((w - 12) / 26);
        for (k = 0; k < wn; k++) {
          var wx = x + 9 + k * 26 + hash(s[0] + k, s[1], 51) * 5;
          if (wx + 14 > x + w - 4) break;
          var wy = wallY + Math.max(3, Math.min(wallH - 17, wallH * 0.28));
          c.fillStyle = '#1c1a16'; c.fillRect(wx - 2, wy - 2, 16, 17);
          var wgd = c.createLinearGradient(wx, wy, wx, wy + 13);
          if (lit) { wgd.addColorStop(0, '#fff0c8'); wgd.addColorStop(0.55, '#ffcf78'); wgd.addColorStop(1, '#e08a24'); }
          else { wgd.addColorStop(0, '#8fa2b4'); wgd.addColorStop(1, '#465360'); }
          c.fillStyle = wgd; c.fillRect(wx, wy, 12, 13);
          c.strokeStyle = 'rgba(20,18,14,.75)'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(wx + 6, wy); c.lineTo(wx + 6, wy + 13); c.stroke();
          c.beginPath(); c.moveTo(wx, wy + 4); c.lineTo(wx + 12, wy + 4); c.stroke();
          c.beginPath(); c.moveTo(wx, wy + 9); c.lineTo(wx + 12, wy + 9); c.stroke();
          c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(wx, wy, 12, 1.6);
          if (lit) {
            c.fillStyle = 'rgba(255,206,132,.18)'; c.fillRect(wx - 6, wy + 13, 24, 9);
            var wgl = c.createRadialGradient(wx + 6, wy + 6, 2, wx + 6, wy + 6, 26);
            wgl.addColorStop(0, 'rgba(255,206,132,.18)'); wgl.addColorStop(1, 'rgba(255,206,132,0)');
            c.fillStyle = wgl; c.beginPath(); c.arc(wx + 6, wy + 6, 26, 0, Math.PI * 2); c.fill();
          }
        }
      }
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

  /* ---------- 可交互点：每种点有自己的"建模"，不再是一块灰方块 / 一个白点 ---------- */
  function softGlow(c, px, py, r, rgb, a) {
    var g = c.createRadialGradient(px, py, 1, px, py, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    c.fillStyle = g; c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.fill();
  }
  /* 一块木料：底色 + 上缘受光 + 描边 */
  function plank(c, x, y, w, h) {
    c.fillStyle = '#6b5327'; c.fillRect(x, y, w, h);
    c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(x + 1, y + 1, w - 2, 2);
    c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  /* 一块石料 / 台阶：底色 + 上缘受光 + 描边 */
  function slab(c, x, y, w, h, fill, line) {
    c.fillStyle = fill; c.fillRect(x, y, w, h);
    c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(x, y, w, 1.6);
    c.strokeStyle = line || 'rgba(0,0,0,.45)'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  /* 谁是谁：NPC 各有各的颜色，别一水儿青蓝 */
  var NPC_COL = { hai: '#8fb8c8', chen: '#c8a08f', keeper: '#a9a2c4', awang: '#c2b184', liu: '#9fb0a8', her: '#c9b0c8' };
  /* 谜题类型 → 家伙什（没列进去的落回通用石台） */
  var PROP_OF = { lampcode: 'lamp', dial: 'clock', read_book: 'book', ledger: 'book', diary: 'book',
    search: 'shelf', sluice: 'sluice', scales: 'scale', name: 'stele',
    lights: 'lanterns', abacus: 'abacus', switches: 'gates', cipher: 'slab', halves: 'papers', chainlink: 'chain' };

  function drawProp(c, kind, px, py, col, lit) {
    var warm = lit ? '255,206,132' : '178,200,216';
    var lg, i;
    if (kind === 'lamp') {
      /* 望归灯：石座 + 灯柱 + 玻璃罩 */
      shadowUnder(c, px, py + 15, 11, 4.5);
      slab(c, px - 8, py + 9, 16, 7, '#2b3546');
      c.fillStyle = '#3c4655'; c.fillRect(px - 2.5, py - 6, 5, 16);
      c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(px + 0.5, py - 6, 2, 16);
      softGlow(c, px, py - 8, 24, warm, lit ? 0.42 : 0.18);
      lg = c.createLinearGradient(px, py - 15, px, py - 1);
      lg.addColorStop(0, lit ? '#fff3cf' : '#cfe0ea'); lg.addColorStop(1, lit ? '#efa63c' : '#6d7c88');
      c.fillStyle = lg; c.beginPath();
      c.moveTo(px - 5.5, py - 1); c.lineTo(px - 4, py - 14); c.lineTo(px + 4, py - 14); c.lineTo(px + 5.5, py - 1);
      c.closePath(); c.fill();
      slab(c, px - 6.5, py - 17, 13, 3.4, '#2b3546');
      slab(c, px - 5, py - 1.6, 10, 2.6, '#2b3546');
    } else if (kind === 'clock') {
      /* 灯楼的旧钟：木箱 + 钟面 + 指针 */
      shadowUnder(c, px, py + 14, 12, 5);
      plank(c, px - 11, py - 8, 22, 22);
      c.fillStyle = '#efe3c6'; c.beginPath(); c.arc(px, py + 1, 7.6, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#8a6b2f'; c.lineWidth = 1.2; c.stroke();
      c.strokeStyle = '#3a2f18'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(px, py + 1); c.lineTo(px, py - 3.6); c.stroke();
      c.beginPath(); c.moveTo(px, py + 1); c.lineTo(px + 3.8, py + 2.4); c.stroke();
      c.fillStyle = '#c9a227'; c.beginPath(); c.arc(px, py + 1, 1.1, 0, Math.PI * 2); c.fill();
      for (i = 0; i < 12; i++) {
        var tan = i * Math.PI / 6;
        c.fillStyle = 'rgba(58,47,24,.7)';
        c.fillRect(px + Math.sin(tan) * 6.4 - 0.4, py + 1 - Math.cos(tan) * 6.4 - 0.4, 0.9, 0.9);
      }
    } else if (kind === 'book') {
      /* 摊开的账本 / 抄本：两张纸 + 书脊 */
      shadowUnder(c, px, py + 12, 14, 5);
      plank(c, px - 15, py - 1, 30, 13);
      c.fillStyle = '#efe6d0';
      c.beginPath(); c.moveTo(px - 12, py - 9); c.lineTo(px - 0.6, py - 5.5); c.lineTo(px - 0.6, py + 2); c.lineTo(px - 12, py - 1.5); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(px + 12, py - 9); c.lineTo(px + 0.6, py - 5.5); c.lineTo(px + 0.6, py + 2); c.lineTo(px + 12, py - 1.5); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(96,76,42,.65)'; c.lineWidth = 0.8;
      for (i = 0; i < 3; i++) {
        c.beginPath(); c.moveTo(px - 10.5, py - 6.6 + i * 2.1); c.lineTo(px - 2, py - 4.6 + i * 2.1); c.stroke();
        c.beginPath(); c.moveTo(px + 10.5, py - 6.6 + i * 2.1); c.lineTo(px + 2, py - 4.6 + i * 2.1); c.stroke();
      }
      c.fillStyle = '#4a3a20'; c.fillRect(px - 0.8, py - 6, 1.6, 8.4);
    } else if (kind === 'shelf') {
      /* 卷宗架：三层，塞着卷宗 */
      shadowUnder(c, px, py + 14, 13, 5);
      plank(c, px - 13, py - 14, 26, 28);
      for (i = 0; i < 3; i++) {
        var sy2 = py - 11 + i * 9, j;
        c.fillStyle = 'rgba(0,0,0,.30)'; c.fillRect(px - 11, sy2 + 6.5, 22, 1.6);
        for (j = 0; j < 4; j++) {
          var sh2 = 5 + hash(i + 1, j + 1, 61) * 3;
          c.fillStyle = ['#b9a06a', '#8f7a48', '#d8c48e', '#7d6a44'][(i + j) % 4];
          c.fillRect(px - 10 + j * 5.4, sy2 + 6.5 - sh2, 4, sh2);
        }
      }
    } else if (kind === 'sluice') {
      /* 潮堤闸门：铁框 + 闸板 + 手轮 */
      shadowUnder(c, px, py + 15, 14, 5);
      slab(c, px - 13, py - 13, 26, 27, '#39424e');
      c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1;
      for (i = 0; i < 3; i++) { c.beginPath(); c.moveTo(px - 9 + i * 9, py - 12); c.lineTo(px - 9 + i * 9, py + 13); c.stroke(); }
      c.fillStyle = '#8c99a6'; c.beginPath(); c.arc(px, py + 1, 5.6, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#2b3546'; c.lineWidth = 1.6;
      for (i = 0; i < 4; i++) {
        var an = i * Math.PI / 2 + 0.4;
        c.beginPath(); c.moveTo(px, py + 1); c.lineTo(px + Math.cos(an) * 5.6, py + 1 + Math.sin(an) * 5.6); c.stroke();
      }
    } else if (kind === 'scale') {
      /* 秤：立柱 + 横梁 + 两只秤盘 */
      shadowUnder(c, px, py + 13, 11, 4);
      c.fillStyle = '#6b5327'; c.fillRect(px - 2, py - 6, 4, 19); c.fillRect(px - 9, py + 11, 18, 3);
      c.strokeStyle = '#c9a227'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(px - 13, py - 7); c.lineTo(px + 13, py - 6); c.stroke();
      c.fillStyle = '#c9a227'; c.beginPath(); c.arc(px, py - 7, 2, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(201,162,39,.8)'; c.lineWidth = 1;
      for (var sd = -1; sd <= 1; sd += 2) {
        var dx2 = px + sd * 12;
        c.beginPath(); c.moveTo(dx2, py - 6.5); c.lineTo(dx2 - 4, py - 1); c.moveTo(dx2, py - 6.5); c.lineTo(dx2 + 4, py - 1); c.stroke();
        c.fillStyle = 'rgba(201,162,39,.5)';
        c.beginPath(); c.ellipse(dx2, py - 0.6, 4.6, 1.7, 0, 0, Math.PI * 2); c.fill();
      }
    } else if (kind === 'stele') {
      /* 名字碑：石面 + 刻痕 + 底座；石板得亮一档 —— 史馆那张深色底上
         原来的 #3b3f45 几乎看不见（2026-10-11 视觉复核抓到的）。 */
      shadowUnder(c, px, py + 15, 12, 5);
      slab(c, px - 8, py + 11, 16, 6, '#5d646c');
      slab(c, px - 11, py - 18, 22, 30, '#79828d');
      c.fillStyle = 'rgba(255,255,255,.16)'; c.fillRect(px - 11, py - 18, 5, 30);
      c.fillStyle = 'rgba(28,26,22,.55)'; c.fillRect(px + 5, py - 18, 6, 30);
      c.fillStyle = '#8d959e'; c.fillRect(px - 7.5, py - 14, 15, 23);
      c.strokeStyle = 'rgba(40,36,28,.75)'; c.lineWidth = 0.9;
      for (i = 0; i < 4; i++) { c.beginPath(); c.moveTo(px - 5.5, py - 11 + i * 5); c.lineTo(px + 5.5, py - 11 + i * 5); c.stroke(); }
      c.fillStyle = 'rgba(236,228,204,.7)';
      c.fillRect(px - 5.5, py - 11, 11, 1); c.fillRect(px - 3.5, py - 6, 7, 1);
      softGlow(c, px, py - 2, 22, warm, lit ? 0.22 : 0.12);
    } else if (kind === 'lanterns') {
      /* 灯阵：铁架上三个小灯罩，好的一盏泛暖光 */
      shadowUnder(c, px, py + 15, 13, 5);
      plank(c, px - 12, py + 8, 24, 7);
      c.fillStyle = '#3a4450'; c.fillRect(px - 13, py - 12, 26, 3.4);
      for (i = 0; i < 3; i++) {
        var lx = px - 8 + i * 8, on = (i % 2 === 0);
        c.fillStyle = on ? '#f0c471' : '#4a545f';
        c.fillRect(lx - 2.4, py - 9, 4.8, 8);
        softGlow(c, lx, py - 5, on ? 12 : 6, warm, on ? 0.32 : 0.10);
      }
      c.fillStyle = '#2b3546'; c.fillRect(px - 2.4, py - 8, 4.8, 16);
      softGlow(c, px, py - 2, 20, warm, 0.2);
    } else if (kind === 'abacus') {
      /* 算盘：木框 + 横梁 + 两排珠子 */
      shadowUnder(c, px, py + 14, 12, 5);
      plank(c, px - 13, py - 10, 26, 22);
      c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1; c.strokeRect(px - 12.5, py - 9.5, 25, 21);
      c.fillStyle = '#6b5636'; c.fillRect(px - 12, py - 1, 24, 2);
      for (i = 0; i < 5; i++) {
        var bx2 = px - 10 + i * 5;
        c.fillStyle = '#c9a227'; c.beginPath(); c.arc(bx2, py - 5, 2, 0, Math.PI * 2); c.fill();
        if (i < 3) { c.fillStyle = '#a3862c'; c.beginPath(); c.arc(bx2, py + 4, 2, 0, Math.PI * 2); c.fill(); }
      }
      softGlow(c, px, py - 4, 18, warm, 0.16);
    } else if (kind === 'gates') {
      /* 闸板：四块木板插在石槽里，两块提起来 */
      shadowUnder(c, px, py + 15, 14, 5);
      slab(c, px - 13, py + 8, 26, 7, '#3b3f45');
      for (i = 0; i < 4; i++) {
        var gx = px - 11 + i * 7, up = (i === 1 || i === 3);
        plank(c, gx - 2.6, py - (up ? 14 : 6), 5.2, (up ? 20 : 18));
        c.fillStyle = up ? 'rgba(0,0,0,.28)' : 'rgba(255,255,255,.10)';
        c.fillRect(gx - 2.6, py - (up ? 14 : 6), 5.2, 2);
      }
      softGlow(c, px, py + 2, 20, warm, 0.14);
    } else if (kind === 'slab') {
      /* 契文石板：斜靠的石板 + 四行刻字 */
      shadowUnder(c, px, py + 15, 12, 5);
      slab(c, px - 12, py + 9, 24, 6, '#4a5058');
      slab(c, px - 10, py - 17, 20, 27, '#6f7883');
      c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(px - 10, py - 17, 4, 27);
      c.strokeStyle = 'rgba(38,34,28,.7)'; c.lineWidth = 0.8;
      for (i = 0; i < 4; i++) { c.beginPath(); c.moveTo(px - 5, py - 12 + i * 5); c.lineTo(px + (i % 2 ? 5 : 6), py - 12 + i * 5); c.stroke(); }
      softGlow(c, px, py - 4, 20, warm, 0.16);
    } else if (kind === 'papers') {
      /* 撕成两半的纸：两片摊在石上 */
      shadowUnder(c, px, py + 14, 13, 5);
      slab(c, px - 12, py + 8, 24, 6, '#454b53');
      c.save(); c.translate(px - 7, py - 4); c.rotate(-0.09);
      c.fillStyle = '#d9d2bb'; c.fillRect(-7, -8, 14, 17); c.restore();
      c.save(); c.translate(px + 8, py + 1); c.rotate(0.12);
      c.fillStyle = '#cfc7ad'; c.fillRect(-7, -8, 14, 16); c.restore();
      c.strokeStyle = 'rgba(60,54,42,.5)'; c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(px - 13, py - 10); c.lineTo(px - 1, py - 6); c.stroke();
      softGlow(c, px, py - 2, 20, warm, 0.18);
    } else if (kind === 'chain') {
      /* 连环锁：一整道铁闸（跨两格）+ 五枚铜环 + 闸后漏出来的灯光
         —— 幕五最后一关的家伙，得比旁边任何一处都大（第一版只有一格，复核时嫌小） */
      var gw = 46;
      shadowUnder(c, px, py + 22, gw - 6, 7);
      softGlow(c, px, py - 2, 46, '255,206,132', lit ? 0.30 : 0.18);
      slab(c, px - gw, py - 30, 2 * gw, 6, '#39414b');
      c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(px - gw, py - 30, 2 * gw, 1.6);
      c.fillStyle = '#2f363f';
      c.fillRect(px - gw, py - 25, 5, 46);
      c.fillRect(px + gw - 5, py - 25, 5, 46);
      for (i = 0; i < 5; i++) {                            /* 五根竖栅 */
        var bx3 = px - gw + 12 + i * ((2 * gw - 24) / 4);
        c.fillStyle = (i % 2) ? '#3a424c' : '#333b44';
        c.fillRect(bx3 - 1.6, py - 22, 3.2, 42);
      }
      c.fillStyle = '#4a525c';
      c.fillRect(px - gw + 4, py - 18, 2 * gw - 8, 3);
      c.fillRect(px - gw + 4, py + 8, 2 * gw - 8, 3);
      for (i = 0; i < 5; i++) {                            /* 五枚铜环 */
        var rx3 = px - gw + 16 + i * ((2 * gw - 32) / 4), on3 = (i % 2 === 0);
        c.strokeStyle = on3 ? '#e6c477' : '#8a7a52'; c.lineWidth = 2.4;
        c.beginPath(); c.arc(rx3, py + 15, 4.4, 0, Math.PI * 2); c.stroke();
        if (on3) softGlow(c, rx3, py + 15, 9, '255,206,132', 0.35);
      }
    } else {
      /* 通用谜题：石台 + 记忆的光 */
      shadowUnder(c, px, py + 14, 12, 5);
      slab(c, px - 12, py - 11, 24, 25, '#5b4a26', shade(col, -0.2));
      c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(px - 10, py - 9, 20, 5);
      softGlow(c, px, py + 1, 24, warm, 0.26);
      c.fillStyle = col; c.font = '20px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('\u2726', px, py + 2);
    }
  }

  function drawChest(c, px, py) {
    /* 铁盒：箱体 + 弧盖 + 铜扣 */
    shadowUnder(c, px, py + 13, 14, 5);
    c.fillStyle = '#5a5240'; c.fillRect(px - 14, py - 4, 28, 17);
    var cg = c.createLinearGradient(px, py - 14, px, py - 3);
    cg.addColorStop(0, '#5f5542'); cg.addColorStop(1, '#3a3327');
    c.fillStyle = cg;
    c.beginPath(); c.moveTo(px - 14, py - 4); c.lineTo(px - 14, py - 9);
    c.quadraticCurveTo(px, py - 19, px + 14, py - 9); c.lineTo(px + 14, py - 4); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 1; c.strokeRect(px - 13.5, py - 4.5, 27, 17);
    c.fillStyle = '#c9a227'; c.fillRect(px - 3, py - 6, 6, 9);
    c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(px - 12, py - 3, 24, 2);
    softGlow(c, px, py - 2, 22, '255,206,132', 0.18);
  }

  function drawGoods(c, px, py) {
    /* 寄售架：三层小格，摆着东西 */
    shadowUnder(c, px, py + 14, 13, 5);
    plank(c, px - 14, py - 15, 28, 30);
    for (var r2 = 0; r2 < 3; r2++) {
      var ry2 = py - 12 + r2 * 10, q2;
      c.fillStyle = 'rgba(0,0,0,.32)'; c.fillRect(px - 12, ry2 + 7, 24, 2);
      for (q2 = 0; q2 < 3; q2++) {
        var hh = 4 + hash(r2 + 3, q2 + 5, 71) * 4;
        c.fillStyle = ['#b9a06a', '#8f7a48', '#d8c48e'][(r2 + q2) % 3];
        c.fillRect(px - 10 + q2 * 8, ry2 + 7 - hh, 5, hh);
      }
    }
    softGlow(c, px, py, 24, '255,206,132', 0.10);
  }

  function drawBoard(c, px, py) {
    /* 告示牌：两根柱 + 板 + 钉着的纸 */
    shadowUnder(c, px, py + 14, 13, 5);
    c.fillStyle = '#6b5327'; c.fillRect(px - 9, py + 5, 3, 9); c.fillRect(px + 6, py + 5, 3, 9);
    plank(c, px - 14, py - 14, 28, 21);
    var papers = [[-10, -11, 8, 7], [0, -12, 8, 6], [-7, -2, 9, 6], [4, -3, 7, 5]];
    papers.forEach(function (pp, i) {
      c.fillStyle = i % 2 ? '#e7dcc0' : '#dbcfae';
      c.fillRect(px + pp[0], py + pp[1], pp[2], pp[3]);
      c.fillStyle = 'rgba(60,50,30,.45)';
      c.fillRect(px + pp[0] + 1, py + pp[1] + 2, pp[2] - 3, 0.9);
      c.fillRect(px + pp[0] + 1, py + pp[1] + 4.5, pp[2] - 4.5, 0.9);
    });
  }

  function drawSite(c, px, py, id) {
    /* 干活点：油桶 + 木板（潮堤那处换成沙袋 + 木桩） */
    var b2;
    shadowUnder(c, px, py + 14, 14, 5);
    if (id === 'dike') {
      for (b2 = 0; b2 < 3; b2++) {
        slab(c, px - 14 + b2 * 9, py + 1 - b2 * 3, 13, 12, b2 % 2 ? '#8d8574' : '#9c9482');
      }
      c.fillStyle = '#6b5327'; c.fillRect(px + 3, py - 14, 4, 26);
      c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(px + 3, py - 14, 4, 2);
      c.fillStyle = '#f2f5fa'; c.beginPath(); c.ellipse(px + 5, py - 6, 8, 3, 0, 0, Math.PI * 2); c.fill();
    } else {
      c.fillStyle = '#6b5327'; c.fillRect(px - 15, py - 6, 13, 18);
      c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(px - 15, py + 1, 13, 2); c.fillRect(px - 15, py + 8, 13, 2);
      c.fillStyle = '#6b5327'; c.beginPath(); c.ellipse(px - 8.5, py - 6, 6.5, 2.6, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,206,132,.5)'; c.beginPath(); c.ellipse(px - 8.5, py - 6, 4.6, 1.7, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#8a733f'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(px + 2, py + 11); c.lineTo(px + 14, py - 3); c.stroke();
      c.strokeStyle = '#6b5327'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(px + 3, py - 4); c.lineTo(px + 13, py + 10); c.stroke();
      softGlow(c, px - 2, py, 20, '255,206,132', 0.10);
    }
  }

  function drawTrace(c, p, px, py) {
    /* "细看"类：地上留一道痕迹 + 一点若有若无的光，别只放个白点 */
    c.fillStyle = 'rgba(255,255,255,.09)';
    c.beginPath(); c.ellipse(px, py - 2, 12, 5.5, hash(p.x, p.y, 21) * 3, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(px - 9, py + 4); c.lineTo(px + 8, py - 3); c.stroke();
    c.beginPath(); c.moveTo(px - 5, py + 6); c.lineTo(px + 4, py + 1); c.stroke();
    softGlow(c, px, py - 2, 16, '226,232,240', 0.06);
  }

  /* ================= 交互点"建模"：一处一个样子 =================
     以前只有谜题有家伙什，其余交互点共用 drawTrace（地上一团白印）；
     门楼也全长一个样、只占一格。现在：
       · 门屋长成"占 4~9 格"的房子（门上是房子就 3 格宽 × 3 格高）；
       · 每个交互点有自己的模型，同一场景里绝不重样。 */

  /* 门往上两格都是房子 → 长成 9 格（3×3）；否则 6 格（3×2） */
  function houseAbove(sc, x, y) {
    if (x < 0 || x >= sc.w || y - 1 < 0) return false;
    if (!D.isSolidIn(sc.id, x, y - 1)) return false;
    return (y - 2 >= 0) && D.isSolidIn(sc.id, x, y - 2);
  }
  function otherAt(sc, x, y, self) {
    var hit = null;
    sc.places.forEach(function (q) { if (q !== self && q.x === x && q.y === y) hit = q; });
    sc.portals.forEach(function (q) { if (q !== self && q.x === x && q.y === y) hit = q; });
    return hit;
  }
  /* 门屋的"占地"：给自检 / 测试用的口径，也是 bake 决定画不画的唯一出处
     正面门 3 格宽 ×（门上是房子就 3 行 = 9 格，否则 2 行 = 6 格）；
     地图沿上的边门 1~2 格宽 × 3 行（进深被邻居占了就只占沿上那一列）；
     地图沿上"隔壁就有一扇正经门"的出口直接不画（kind:'skip'）——否则一堵塞全是门。 */
  function gatePlan(sid, po) {
    var sc = D.SCENES[sid];
    if (!sc) return null;
    var twin = po.to ? sc.places.some(function (q) {
      return q !== po && q.to && Math.abs(q.x - po.x) + Math.abs(q.y - po.y) <= 1;
    }) : false;
    if (twin) return { kind: 'skip', w: 0, h: 0, cells: 0 };
    if (po.x <= 0 || po.x >= sc.w - 1) {
      var inward = po.x <= 0 ? 1 : -1;
      var blocked = otherAt(sc, po.x + inward, po.y, po) ? true : false;
      return { kind: 'side', w: blocked ? 1 : 2, h: 3, cells: (blocked ? 1 : 2) * 3 };
    }
    var rows = houseAbove(sc, po.x, po.y) ? 3 : 2;
    return { kind: 'front', w: 3, h: rows, cells: 3 * rows };
  }
  /* 一个交互点最后用的是哪套模型（测试据此断言"同场景里两两不重样"） */
  function artOf(p) {
    if (p.npc) return 'figure:' + (p.npc || p.id);
    if (PLACE_ART[p.id] && ART_FN[PLACE_ART[p.id]]) return 'art:' + PLACE_ART[p.id];
    if (p.kind === 'portal') return 'gate:' + (GATE_STYLE[p.id] || 'plain');
    if (p.kind === 'puzzle') return 'prop:' + (PROP_OF[p.puz] || 'spark');
    if (p.kind === 'item') return 'chest';
    if (p.kind === 'buy') return 'goods';
    if (p.kind === 'jobs') return 'board';
    if (p.kind === 'work') return 'site:' + p.id;
    return 'trace';
  }
  /* 匾额：一块黑漆板 + 金边 + 三道笔画（不写真字，远处看就是三个字） */
  function plaque(c, cx, cy, w, h) {
    c.fillStyle = '#20180f'; c.fillRect(cx - w / 2, cy - h / 2, w, h);
    c.strokeStyle = 'rgba(201,162,39,.85)'; c.lineWidth = 1.2;
    c.strokeRect(cx - w / 2 + 0.6, cy - h / 2 + 0.6, w - 1.2, h - 1.2);
    c.fillStyle = 'rgba(240,208,124,.9)';
    c.fillRect(cx - w / 2 + 5, cy - 2.6, w / 3 - 5, 1.6);
    c.fillRect(cx - w / 6 + 1, cy - 4, w / 3 - 4, 1.6);
    c.fillRect(cx + w / 6 - 1, cy - 0.6, w / 3 - 5, 1.6);
    c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(cx - w / 2 + 1, cy - h / 2 + 1, w - 2, 1.4);
  }
  /* 灯笼：挂在一根横挑的木杆下，红纸 + 暖光 */
  function lantern(c, x, y, big) {
    var w = big ? 11 : 8.4, h = big ? 14 : 10.6;
    softGlow(c, x, y + 1, big ? 30 : 22, '255,196,110', 0.34);
    c.fillStyle = '#2b3546'; c.fillRect(x - 0.9, y - h / 2 - 7, 1.8, 7);
    c.fillStyle = '#3a3126'; c.fillRect(x - w / 2 - 1.6, y - h / 2 - 1.6, w + 3.2, 2.4);
    var lg = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    lg.addColorStop(0, '#8f2f1c'); lg.addColorStop(0.42, '#d9603a'); lg.addColorStop(1, '#a83b22');
    c.fillStyle = lg;
    c.beginPath(); c.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(60,20,12,.55)'; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(x - w / 2 + 0.8, y); c.lineTo(x + w / 2 - 0.8, y); c.stroke();
    c.fillStyle = '#3a3126'; c.fillRect(x - w / 2 - 1.6, y + h / 2 - 0.8, w + 3.2, 2.4);
    c.fillStyle = '#f5cf7a'; c.fillRect(x - w / 2 + 1.4, y - h / 2 + 2.4, w - 2.8, 1.4);
    c.fillStyle = '#c9542f'; c.fillRect(x - 1.1, y + h / 2 + 1.6, 2.2, 4.2);
  }
  /* 石阶：几级往外铺开 */
  function steps(c, cx, y, n, baseW, grow) {
    for (var i = 0; i < n; i++) {
      var sw = baseW + i * grow;
      slab(c, cx - sw / 2, y + i * 4.8, sw, 4.8, i % 2 ? '#66717f' : '#7b8896', 'rgba(0,0,0,.42)');
    }
  }

  /* 正面门屋：3 格宽 ×（2 或 3）格高；门口朝下，台阶铺在门前 */
  function drawGateFront(c, p) {
    var sc = scene();
    var px = p.x * CELL + CELL / 2, py = p.y * CELL + CELL / 2;
    var rows = houseAbove(sc, p.x, p.y) ? 3 : 2;
    var half = CELL * 1.5, x0 = px - half, w = half * 2;
    var sill = py + CELL * 0.40;
    var top = sill - rows * CELL;
    var doorW = Math.min(50, w - 34), doorH = Math.min(rows * CELL - 30, 90);
    var j, bx, by;
    /* 落影 */
    for (j = 3; j >= 1; j--) {
      c.fillStyle = 'rgba(0,0,0,' + (0.08 + j * 0.045).toFixed(2) + ')';
      c.fillRect(x0 + j * 1.8, sill + j * 1.9, w, 4 + j * 1.6);
    }
    /* 墙身：错缝砖 */
    var wallTone = mix(sc.palette.solid, '#7c6c50', 0.40);
    var wg = c.createLinearGradient(0, top, 0, sill);
    wg.addColorStop(0, shade(wallTone, 0.18));
    wg.addColorStop(0.6, shade(wallTone, -0.02));
    wg.addColorStop(1, shade(wallTone, -0.34));
    c.fillStyle = wg; c.fillRect(x0, top, w, sill - top);
    c.strokeStyle = 'rgba(0,0,0,.22)'; c.lineWidth = 1;
    var bn = 0;
    for (by = top + 10; by < sill - 3; by += 10, bn++) {
      c.beginPath(); c.moveTo(x0 + 1, by + 0.5); c.lineTo(x0 + w - 1, by + 0.5); c.stroke();
      for (bx = x0 + (bn % 2 ? 14 : 5); bx < x0 + w - 2; bx += 19) {
        c.beginPath(); c.moveTo(bx + 0.5, by - 9.5); c.lineTo(bx + 0.5, by); c.stroke();
      }
    }
    c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(x0, top, w, 1.6);
    /* 檐下暗带 + 屋顶（瓦楞 + 屋脊 + 受光檐口） */
    c.fillStyle = 'rgba(0,0,0,.42)'; c.fillRect(x0, top, w, 6);
    var roofH = 17, rx = x0 - 8, rw = w + 16, ry = top - roofH;
    var roofTone = mix(sc.palette.solid, '#6b7784', 0.55);
    var rg = c.createLinearGradient(0, ry, 0, top);
    rg.addColorStop(0, shade(roofTone, 0.30)); rg.addColorStop(0.56, shade(roofTone, 0.08)); rg.addColorStop(1, shade(roofTone, -0.28));
    c.fillStyle = rg; c.fillRect(rx, ry, rw, roofH);
    c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = 1;
    for (j = rx + 8; j < rx + rw - 1; j += 8) { c.beginPath(); c.moveTo(j + 0.5, ry + 1); c.lineTo(j + 0.5, ry + roofH - 1); c.stroke(); }
    c.fillStyle = shade(roofTone, 0.55); c.fillRect(rx, ry + roofH * 0.42, rw, 2.6);
    c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(rx, ry, rw, 2);
    c.strokeStyle = 'rgba(0,0,0,.5)'; c.strokeRect(rx + 0.5, ry + 0.5, rw - 1, roofH - 1);
    /* 门洞：门楣石 + 两根门柱 + 里头是黑的、底下透出暖光 */
    var dx0 = px - doorW / 2, dy0 = sill - doorH;
    slab(c, dx0 - 7, dy0 - 9, doorW + 14, 10, '#6f7a88');
    slab(c, dx0 - 7, dy0, 7, doorH, '#5d6773');
    slab(c, dx0 + doorW, dy0, 7, doorH, '#5d6773');
    var og = c.createLinearGradient(0, dy0, 0, sill);
    og.addColorStop(0, 'rgba(4,6,10,.94)');
    og.addColorStop(0.68, 'rgba(9,12,18,.74)');
    og.addColorStop(1, 'rgba(255,196,110,.30)');
    c.fillStyle = og; c.fillRect(dx0, dy0, doorW, doorH);
    c.strokeStyle = 'rgba(255,208,132,.28)'; c.lineWidth = 1.4;
    c.strokeRect(dx0 + 0.7, dy0 + 0.7, doorW - 1.4, doorH - 1.4);
    /* 门里两扇木门（半掩）：门缝里透一线光 */
    c.fillStyle = '#3d2f1e';
    c.fillRect(dx0 + 1.4, dy0 + 2, doorW / 2 - 3.4, doorH - 3);
    c.fillRect(dx0 + doorW / 2 + 2, dy0 + 2, doorW / 2 - 3.4, doorH - 3);
    c.fillStyle = 'rgba(255,214,140,.42)'; c.fillRect(px - 1.1, dy0 + 2, 2.2, doorH - 3);
    /* 匾额压在门楣上 */
    plaque(c, px, dy0 - 17, Math.min(62, doorW + 8), 13);
    /* 两盏灯笼挂在门柱外侧 */
    lantern(c, dx0 - 16, dy0 + 12, true);
    lantern(c, dx0 + doorW + 16, dy0 + 12, true);
    /* 门口那级门槛 + 石阶 */
    slab(c, px - doorW / 2 - 2, sill, doorW + 4, 5, '#8b98a6', 'rgba(0,0,0,.45)');
    steps(c, px, sill + 5, 3, doorW + 6, 7);
    softGlow(c, px, sill - 4, 34, '255,206,132', 0.22);
    /* 两侧石墩：把 3 格宽在门口这一行补齐，别让墙凭空断掉 */
    for (j = -1; j <= 1; j += 2) {
      slab(c, px + j * (half - 20) - 9, sill - 12, 18, 17, '#5b6570', 'rgba(0,0,0,.42)');
      c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(px + j * (half - 20) - 9, sill - 12, 18, 2);
    }
    gateExtras(c, p, px, sill, half);
  }

  /* 同一座门屋在不同地方也得看出是谁家：当铺挂幌子、史馆立石狮、盐埕口堆盐包 */
  var GATE_STYLE = { pawn_door: 'shop', arch_door: 'hall', saltgate: 'pier' };
  function gateExtras(c, p, px, sill, half) {
    var st = GATE_STYLE[p.id], i, j;
    if (st === 'shop') {
      /* 记当铺：檐下挂一面幌子（布幡），门口摆一条长凳——门口有人等过 */
      var bx = px + half - 20, by = sill - 92;
      c.strokeStyle = '#4a3a24'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(bx + 5, by); c.lineTo(bx + 5, by + 8); c.stroke();
      c.fillStyle = '#2f3a4e'; c.fillRect(bx - 5, by + 8, 20, 34);
      c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(bx - 5, by + 8, 20, 2);
      c.fillStyle = 'rgba(201,162,39,.85)'; c.fillRect(bx - 5, by + 15, 20, 3);
      c.fillRect(bx - 5, by + 30, 20, 3);
      c.fillStyle = 'rgba(226,214,186,.75)';
      c.fillRect(bx - 1, by + 21, 12, 1.4); c.fillRect(bx + 2, by + 25.4, 6, 1.4);
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1; c.strokeRect(bx - 5, by + 8, 20, 34);
      plank(c, px - half + 6, sill + 8, 30, 5);
      c.fillStyle = '#4a3a24'; c.fillRect(px - half + 9, sill + 13, 3, 8); c.fillRect(px - half + 30, sill + 13, 3, 8);
    } else if (st === 'hall') {
      /* 岛史馆：门口立一对石狮，门上加铜环，匾换成没上漆的石匾 */
      for (i = -1; i <= 1; i += 2) {
        var lx = px + i * (half - 13);
        slab(c, lx - 7, sill - 20, 14, 26, '#666c74');
        c.fillStyle = '#8b9099';
        c.beginPath(); c.ellipse(lx, sill - 25, 6.4, 5.4, 0, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(lx, sill - 31, 4.2, 0, Math.PI * 2); c.fill();
        for (j = 0; j < 5; j++) {
          var an = Math.PI + j * (Math.PI / 4);
          c.beginPath(); c.arc(lx + Math.cos(an) * 4.4, sill - 31 + Math.sin(an) * 4.4, 1.5, 0, Math.PI * 2); c.fill();
        }
        c.fillStyle = 'rgba(40,44,52,.85)';
        c.beginPath(); c.arc(lx - 1.6, sill - 32, 0.7, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(lx + 1.6, sill - 32, 0.7, 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = '#6d7784'; c.fillRect(px - 31, sill - 106, 62, 14);
      c.strokeStyle = 'rgba(240,240,232,.35)'; c.lineWidth = 1;
      for (i = 0; i < 3; i++) { c.strokeRect(px - 24 + i * 17, sill - 103, 11, 8); }
      for (i = -1; i <= 1; i += 2) {
        c.strokeStyle = 'rgba(201,162,39,.9)'; c.lineWidth = 1.6;
        c.beginPath(); c.arc(px + i * 14, sill - 46, 3.4, 0, Math.PI * 2); c.stroke();
      }
    } else if (st === 'pier') {
      /* 盐埕口：门口堆两只盐包，边上再插一段木栅栏 */
      for (i = 0; i < 2; i++) {
        var sx = px - half + 10 + i * 21;
        c.fillStyle = i ? '#d8dee2' : '#c3ccd2';
        c.beginPath(); c.ellipse(sx, sill - 7, 10, 9, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,.6)';
        c.beginPath(); c.ellipse(sx - 2.4, sill - 9, 5, 3.4, -0.3, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(120,132,142,.75)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(sx - 9, sill - 2); c.lineTo(sx + 9, sill - 3); c.stroke();
      }
      for (i = 0; i < 3; i++) { c.fillStyle = '#6b5327'; c.fillRect(px + half - 30 + i * 10, sill - 21, 3, 25); }
      c.fillStyle = '#8a733f'; c.fillRect(px + half - 32, sill - 17, 30, 3);
      c.fillRect(px + half - 32, sill - 7, 30, 3);
    }
  }

  /* 边门：贴左右地图沿的门屋 —— 1 格宽（地图沿那一列）× 3 格高，门朝地图里开。
     第一版把"朝里"和"贴沿"两边写反了，门洞 / 灯笼 / 台阶全画到画布外面去，
     所以地图沿上的门看着像一段光秃秃的墙。这里以 inward = -dir 为准重写。 */
  function drawGateSide(c, p, dir) {
    var sc = scene();
    var px = p.x * CELL + CELL / 2, py = p.y * CELL + CELL / 2;
    var inward = -dir;                              /* 地图里面是哪一边 */
    var faceX = px + inward * (CELL * 0.5);         /* 墙朝地图里的那张脸 */
    var backX = px - inward * (CELL * 0.5);         /* 贴地图沿的那条边 */
    var x1 = Math.min(faceX, backX), w1 = CELL;
    var top = py - CELL * 1.5, bot = py + CELL * 1.5;
    var blocked = otherAt(sc, p.x + inward, p.y, p) ? true : false;
    var dz = blocked ? CELL * 0.42 : CELL * 0.60;   /* 门洞只开在靠里的那半边 */
    var doorH = 44, dy0 = py - doorH / 2;
    var dx0 = inward > 0 ? faceX - dz : faceX;
    var j, by, bx, bn;
    /* 落影 */
    for (j = 3; j >= 1; j--) {
      c.fillStyle = 'rgba(0,0,0,' + (0.07 + j * 0.04).toFixed(2) + ')';
      c.fillRect(x1 + j * inward * 1.6, bot - 4 + j * 1.8, w1, 4 + j * 1.6);
    }
    /* 墙身：错缝砖 */
    var wallTone = mix(sc.palette.solid, '#7c6c50', 0.40);
    var wg = c.createLinearGradient(0, top, 0, bot);
    wg.addColorStop(0, shade(wallTone, 0.18));
    wg.addColorStop(0.62, shade(wallTone, -0.02));
    wg.addColorStop(1, shade(wallTone, -0.32));
    c.fillStyle = wg; c.fillRect(x1, top, w1, bot - top);
    c.strokeStyle = 'rgba(0,0,0,.22)'; c.lineWidth = 1;
    bn = 0;
    for (by = top + 10; by < bot - 2; by += 10, bn++) {
      c.beginPath(); c.moveTo(x1 + 1, by + 0.5); c.lineTo(x1 + w1 - 1, by + 0.5); c.stroke();
      for (bx = x1 + (bn % 2 ? 12 : 4); bx < x1 + w1 - 2; bx += 17) {
        c.beginPath(); c.moveTo(bx + 0.5, by - 9.5); c.lineTo(bx + 0.5, by); c.stroke();
      }
    }
    c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(x1, top, w1, 1.6);
    /* 瓦檐：从墙顶朝地图里挑出来一截，才像门屋，不像一段光墙 */
    var roofTone = mix(sc.palette.solid, '#6b7784', 0.55);
    var rx = inward > 0 ? x1 : x1 - 15, rw = w1 + 15;
    var rg = c.createLinearGradient(0, top - 12, 0, top);
    rg.addColorStop(0, shade(roofTone, 0.30)); rg.addColorStop(1, shade(roofTone, -0.26));
    c.fillStyle = rg; c.fillRect(rx, top - 12, rw, 12);
    c.strokeStyle = 'rgba(0,0,0,.30)'; c.lineWidth = 1;
    for (j = rx + 7; j < rx + rw - 1; j += 7) {
      c.beginPath(); c.moveTo(j + 0.5, top - 11); c.lineTo(j + 0.5, top - 1); c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(rx, top - 12, rw, 2);
    c.fillStyle = 'rgba(0,0,0,.40)'; c.fillRect(rx, top - 1.5, rw, 2.5);
    c.strokeStyle = 'rgba(0,0,0,.5)'; c.strokeRect(rx + 0.5, top - 11.5, rw - 1, 11);
    /* 门洞：石框 + 里头是黑的、底下透出屋里的暖光 */
    var og = c.createLinearGradient(dx0, 0, dx0 + dz, 0);
    og.addColorStop(0, inward > 0 ? 'rgba(255,196,110,.30)' : 'rgba(4,6,10,.94)');
    og.addColorStop(1, inward > 0 ? 'rgba(4,6,10,.94)' : 'rgba(255,196,110,.30)');
    c.fillStyle = og; c.fillRect(dx0, dy0, dz, doorH);
    c.strokeStyle = 'rgba(255,208,132,.26)'; c.lineWidth = 1.3;
    c.strokeRect(dx0 + 0.7, dy0 + 0.7, dz - 1.4, doorH - 1.4);
    slab(c, inward > 0 ? dx0 - 6 : dx0, dy0 - 8, dz + 6, 8, '#6f7a88');       /* 门楣石 */
    /* 门槛 + 台阶：横着朝地图里铺，一级比一级矮 */
    slab(c, inward > 0 ? faceX - 3 : faceX - 15, py + 8, 18, 5, '#8b98a6', 'rgba(0,0,0,.45)');
    for (j = 0; j < 3; j++) {
      var sw2 = 18 - j * 4.4;
      slab(c, inward > 0 ? faceX - 3 + j * 1.6 : faceX + 3 - sw2 - j * 1.6, py + 13 + j * 4.6, sw2, 4.6,
        j % 2 ? '#66717f' : '#7b8896', 'rgba(0,0,0,.42)');
    }
    /* 灯笼挂在门洞上沿、地图里那一侧 */
    lantern(c, faceX + inward * 17, dy0 - 6, false);
    softGlow(c, faceX + inward * 12, py + 10, 28, '255,206,132', 0.22);
    /* 门口那片暖光池 + 朝外的一串脚印 */
    c.fillStyle = 'rgba(255,214,140,.24)';
    for (j = 0; j < 3; j++) {
      c.beginPath();
      c.ellipse(faceX + inward * (20 + j * 9), py + 16 + (j % 2) * 6, 3, 1.9, 0, 0, Math.PI * 2);
      c.fill();
    }
  }

  function drawGate(c, p) {
    if (p.x <= 0) drawGateSide(c, p, -1);
    else if (p.x >= GRID_W - 1) drawGateSide(c, p, 1);
    else drawGateFront(c, p);
  }

  /* ---------------- 每个交互点一个模型 ---------------- */

  /* 礁石上的刻痕（望归灯） */
  function artRockCarve(c, px, py) {
    shadowUnder(c, px, py + 15, 18, 6);
    c.fillStyle = '#39414a';
    c.beginPath();
    c.moveTo(px - 19, py + 14); c.lineTo(px - 21, py - 3); c.lineTo(px - 11, py - 14);
    c.lineTo(px + 4, py - 17); c.lineTo(px + 16, py - 9); c.lineTo(px + 19, py + 4);
    c.lineTo(px + 13, py + 14); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,.09)';
    c.beginPath(); c.moveTo(px - 19, py + 14); c.lineTo(px - 21, py - 3); c.lineTo(px - 11, py - 14);
    c.lineTo(px - 3, py - 16); c.lineTo(px - 6, py + 12); c.closePath(); c.fill();
    c.fillStyle = 'rgba(28,24,20,.55)';
    c.beginPath(); c.moveTo(px + 13, py + 14); c.lineTo(px + 16, py - 9); c.lineTo(px + 19, py + 4); c.closePath(); c.fill();
    /* 潮线：一条白边 */
    c.strokeStyle = 'rgba(214,228,238,.35)'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(px - 17, py + 7); c.lineTo(px + 15, py + 9); c.stroke();
    /* 刻痕：一道深、两道浅，像用铁钉刻的 */
    c.strokeStyle = 'rgba(232,238,244,.62)'; c.lineWidth = 1.1;
    for (var i = 0; i < 3; i++) {
      c.beginPath();
      c.moveTo(px - 12 + i * 11, py - 10);
      c.lineTo(px - 10 + i * 11, py - 1);
      c.lineTo(px - 13 + i * 11, py + 6);
      c.stroke();
    }
    c.strokeStyle = 'rgba(232,238,244,.34)';
    c.beginPath(); c.moveTo(px - 15, py - 12); c.lineTo(px + 12, py - 11); c.stroke();
    softGlow(c, px, py - 2, 20, '210,226,240', 0.10);
  }

  /* 母亲的第二本抄本：两本合着的旧书叠着，夹一根烧黑的火柴 */
  function artStackBooks(c, px, py) {
    shadowUnder(c, px, py + 13, 15, 5);
    plank(c, px - 14, py + 1, 28, 10);
    c.fillStyle = '#4a3a24'; c.fillRect(px - 12, py + 2, 24, 8);
    c.fillStyle = 'rgba(239,230,208,.75)'; c.fillRect(px - 11, py + 6, 22, 3);
    plank(c, px - 12, py - 8, 24, 9);
    c.fillStyle = '#3c2f1c'; c.fillRect(px - 10, py - 7, 20, 7);
    c.fillStyle = 'rgba(239,230,208,.6)'; c.fillRect(px - 10, py - 4, 20, 2.6);
    c.fillStyle = 'rgba(201,162,39,.75)'; c.fillRect(px - 9, py - 6.4, 18, 1);
    /* 书面压痕：上一页隔着纸印过来的一个"记"字，画三道短横示意 */
    c.fillStyle = 'rgba(120,100,60,.55)';
    c.fillRect(px - 5, py - 2.4, 10, 1); c.fillRect(px - 3, py - 0.6, 6, 1);
    /* 烧黑一半的火柴梗 */
    c.strokeStyle = '#2a2118'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(px + 12, py - 9); c.lineTo(px + 19, py - 3); c.stroke();
    c.strokeStyle = '#8a6b2f'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(px + 18, py - 4); c.lineTo(px + 21, py - 1.6); c.stroke();
    softGlow(c, px, py - 2, 20, '255,206,132', 0.10);
  }

  /* 母亲的针线盒：开了盖的铁皮盒 + 线轴 + 两枚纽扣 + 弯针 */
  function artSewBox(c, px, py) {
    shadowUnder(c, px, py + 14, 14, 5);
    slab(c, px - 15, py - 4, 30, 18, '#6d6a5e');
    c.fillStyle = 'rgba(0,0,0,.40)'; c.fillRect(px - 13, py - 2, 26, 14);
    c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(px - 15, py - 4, 30, 2);
    /* 掀开的盒盖斜靠在后头 */
    c.save(); c.translate(px - 9, py - 10); c.rotate(-0.34);
    slab(c, -12, -5, 24, 7, '#7d7a6c');
    c.restore();
    /* 线轴 */
    slab(c, px + 5, py - 3, 9, 11, '#d9d2bd');
    c.fillStyle = 'rgba(120,110,90,.35)';
    for (var i = 0; i < 3; i++) { c.fillRect(px + 5, py + i * 3.2, 9, 1); }
    /* 两枚纽扣：一白一棕，四孔 */
    var btns = [[-9, 1, '#e8e2d2'], [-3, 5, '#5a4630']];
    btns.forEach(function (b) {
      c.fillStyle = b[2]; c.beginPath(); c.arc(px + b[0], py + b[1], 3.6, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(40,32,20,.7)';
      c.fillRect(px + b[0] - 1.8, py + b[1] - 1.6, 1, 1); c.fillRect(px + b[0] + 0.8, py + b[1] - 1.6, 1, 1);
      c.fillRect(px + b[0] - 1.8, py + b[1] + 0.6, 1, 1); c.fillRect(px + b[0] + 0.8, py + b[1] + 0.6, 1, 1);
    });
    /* 弯了的针 */
    c.strokeStyle = '#cfd6de'; c.lineWidth = 0.9;
    c.beginPath(); c.moveTo(px - 13, py - 1); c.quadraticCurveTo(px - 8, py - 5, px - 4, py - 7.5); c.stroke();
    softGlow(c, px, py, 18, '255,206,132', 0.08);
  }

  /* 灯台下的灰烬：一堆灰 + 翘出来的一角硬纸 */
  function artAshPile(c, px, py) {
    shadowUnder(c, px, py + 13, 16, 5);
    var g = c.createRadialGradient(px, py + 4, 2, px, py + 4, 20);
    g.addColorStop(0, 'rgba(96,92,86,.95)'); g.addColorStop(1, 'rgba(70,68,64,.35)');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(px, py + 6, 17, 8.5, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(122,118,110,.85)';
    c.beginPath(); c.ellipse(px - 3, py + 2, 11, 6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(48,46,44,.8)';
    c.beginPath(); c.ellipse(px + 4, py + 8, 9, 4, 0, 0, Math.PI * 2); c.fill();
    /* 灰里露出的一角硬纸 */
    c.fillStyle = 'rgba(226,214,186,.9)';
    c.beginPath(); c.moveTo(px + 1, py - 1); c.lineTo(px + 11, py - 6); c.lineTo(px + 13, py + 1); c.lineTo(px + 4, py + 2); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(60,48,30,.5)'; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(px + 4, py - 0.6); c.lineTo(px + 11, py - 3.4); c.stroke();
    /* 没灭透的一点红 */
    c.fillStyle = 'rgba(214,96,48,.55)';
    c.beginPath(); c.arc(px - 7, py + 5, 1.6, 0, Math.PI * 2); c.fill();
    softGlow(c, px, py + 2, 16, '198,120,66', 0.10);
  }

  /* 灯油桶与灯罩：木桶 + 漏斗 + 立在布上的玻璃灯罩 */
  function artOilRig(c, px, py) {
    shadowUnder(c, px, py + 15, 17, 6);
    /* 油桶 */
    c.fillStyle = '#5c4a2c'; c.fillRect(px - 17, py - 8, 18, 22);
    c.fillStyle = 'rgba(0,0,0,.30)'; c.fillRect(px - 17, py - 2, 18, 2.4); c.fillRect(px - 17, py + 5, 18, 2.4);
    c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(px - 17, py - 8, 18, 2);
    c.fillStyle = '#4a3a22';
    c.beginPath(); c.ellipse(px - 8, py - 8, 9, 3.4, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(226,178,92,.55)';
    c.beginPath(); c.ellipse(px - 8, py - 8, 6.4, 2.2, 0, 0, Math.PI * 2); c.fill();
    /* 桶嘴上的漏斗 */
    c.fillStyle = '#8b98a6';
    c.beginPath(); c.moveTo(px - 13, py - 17); c.lineTo(px - 3, py - 17); c.lineTo(px - 6.6, py - 10); c.lineTo(px - 9.4, py - 10); c.closePath(); c.fill();
    /* 灯罩立在麻布上 */
    c.fillStyle = 'rgba(198,188,164,.55)';
    c.beginPath(); c.ellipse(px + 12, py + 11, 10, 4, 0, 0, Math.PI * 2); c.fill();
    softGlow(c, px + 12, py - 6, 22, '255,206,132', 0.26);
    var lg = c.createLinearGradient(px + 12, py - 15, px + 12, py + 1);
    lg.addColorStop(0, 'rgba(255,243,207,.92)'); lg.addColorStop(1, 'rgba(226,166,60,.72)');
    c.fillStyle = lg;
    c.beginPath();
    c.moveTo(px + 6.6, py + 1); c.lineTo(px + 8, py - 14); c.lineTo(px + 16, py - 14); c.lineTo(px + 17.4, py + 1);
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(px + 9.6, py - 13); c.lineTo(px + 8.6, py); c.stroke();
    slab(c, px + 6, py - 16.4, 12, 2.8, '#3c4655');
    slab(c, px + 7, py + 1, 10, 2.4, '#3c4655');
  }

  /* 望海台：木栏杆 + 挂着的风灯 + 一盘缆绳，栏杆外就是黑海 */
  function artLookout(c, px, py) {
    c.fillStyle = 'rgba(0,0,0,.30)';
    c.fillRect(px - 22, py + 10, 44, 3);
    /* 两根立柱 + 两道横杆 */
    var i;
    for (i = -1; i <= 1; i += 2) {
      slab(c, px + i * 18 - 2.4, py - 20, 4.8, 32, '#6b5327', 'rgba(0,0,0,.45)');
    }
    plank(c, px - 22, py - 18, 44, 4);
    plank(c, px - 22, py - 8, 44, 4);
    /* 竖栏杆 */
    c.fillStyle = '#5b4520';
    for (i = 0; i < 5; i++) { c.fillRect(px - 16 + i * 8, py - 14, 2.2, 7); }
    /* 挂在栏杆上的风灯 */
    softGlow(c, px + 12, py - 25, 20, '255,206,132', 0.30);
    c.fillStyle = '#2b3546'; c.fillRect(px + 11, py - 18, 2, 7);
    slab(c, px + 6, py - 31, 12, 13, '#39424e');
    c.fillStyle = 'rgba(255,240,200,.9)'; c.fillRect(px + 8, py - 29, 8, 9);
    c.fillStyle = '#39424e'; c.fillRect(px + 5.6, py - 32.4, 13, 2.6);
    /* 缆绳盘 */
    c.strokeStyle = '#8a733f'; c.lineWidth = 2.6;
    for (i = 0; i < 3; i++) {
      c.beginPath(); c.ellipse(px - 13, py + 8 - i * 2.4, 9 - i * 0.6, 3.4, 0, 0, Math.PI * 2); c.stroke();
    }
    c.strokeStyle = 'rgba(255,255,255,.10)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(px - 22, py + 10); c.lineTo(px + 22, py + 10); c.stroke();
  }

  /* 码头：桩子 + 雾铃 + 剩半截的断绳（少一只铃） */
  function artFogBell(c, px, py) {
    shadowUnder(c, px, py + 15, 13, 5);
    slab(c, px - 3, py - 24, 6, 38, '#4a3a22');                 /* 桩子 */
    c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(px - 3, py - 24, 6, 2);
    plank(c, px - 17, py - 22, 20, 4);                          /* 挑出去的横木 */
    /* 还挂着的那只铃 */
    softGlow(c, px - 12, py - 12, 18, '226,196,120', 0.22);
    c.fillStyle = '#8a6b2f';
    c.beginPath(); c.arc(px - 12, py - 13, 6.4, Math.PI, 0); c.fill();
    c.fillStyle = '#c9a227'; c.fillRect(px - 18, py - 13.4, 12, 3.4);
    c.fillStyle = '#6b5327'; c.beginPath(); c.arc(px - 12, py - 10.4, 1.4, 0, Math.PI * 2); c.fill();
    /* 断了的那截绳：绳头散成三股 */
    c.strokeStyle = '#8a733f'; c.lineWidth = 1.8;
    c.beginPath(); c.moveTo(px + 1, py - 21); c.lineTo(px + 7, py - 13); c.stroke();
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(px + 7, py - 13); c.lineTo(px + 11, py - 8); c.stroke();
    c.beginPath(); c.moveTo(px + 7, py - 13); c.lineTo(px + 10, py - 10.6); c.stroke();
    c.beginPath(); c.moveTo(px + 7, py - 13); c.lineTo(px + 12, py - 11.4); c.stroke();
    softGlow(c, px + 8, py - 11, 14, '210,220,232', 0.10);
  }

  /* 镇口的告示牌：石碑 + 一张大红印的布告（和镇里那块木告示板不同） */
  function artNoticeStone(c, px, py) {
    shadowUnder(c, px, py + 15, 14, 5);
    slab(c, px - 12, py + 7, 24, 8, '#5b6570');                 /* 石座 */
    slab(c, px - 15, py - 19, 30, 27, '#6d7784');               /* 碑面 */
    c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(px - 15, py - 19, 30, 2);
    c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(px - 15, py + 5, 30, 3);
    /* 布告纸 + 四角钉 */
    c.fillStyle = '#e6dcbe'; c.fillRect(px - 10, py - 15, 20, 19);
    c.fillStyle = 'rgba(70,58,34,.55)';
    for (var i = 0; i < 5; i++) { c.fillRect(px - 7, py - 12 + i * 3.4, 14 - (i % 3) * 3, 1.1); }
    c.fillStyle = '#a8352a'; c.beginPath(); c.arc(px + 4.6, py - 4, 3.4, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,220,210,.55)'; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(px + 3, py - 5.4); c.lineTo(px + 6.2, py - 2.6); c.stroke();
    c.fillStyle = '#c9a227';
    [[-9.4, -14.4], [8.4, -14.4], [-9.4, 3.4], [8.4, 3.4]].forEach(function (q) {
      c.beginPath(); c.arc(px + q[0], py + q[1], 1.2, 0, Math.PI * 2); c.fill();
    });
    softGlow(c, px, py - 4, 20, '255,206,132', 0.08);
  }

  /* 海边的灯座：石台 + 空铁架 + 一滴新蜡（谁在这儿点过灯） */
  function artLampSeat(c, px, py) {
    shadowUnder(c, px, py + 15, 12, 5);
    slab(c, px - 11, py + 4, 22, 12, '#5f6a76');
    c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(px - 11, py + 4, 22, 2);
    /* 灯座上的凹槽 + 蜡痕 */
    slab(c, px - 8, py - 3, 16, 8, '#4b5561');
    c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.ellipse(px, py - 2, 6.4, 2.6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(240,232,214,.85)';
    c.beginPath(); c.ellipse(px, py - 3, 5.4, 2.2, 0, 0, Math.PI * 2); c.fill();
    /* 新蜡：白得干净，边上还挂着一滴 */
    c.fillStyle = '#f2ece0'; c.fillRect(px - 1.6, py - 9, 3.2, 6.4);
    c.beginPath(); c.moveTo(px - 1.6, py - 9); c.lineTo(px, py - 12); c.lineTo(px + 1.6, py - 9); c.closePath(); c.fill();
    c.fillStyle = 'rgba(242,236,224,.75)';
    c.beginPath(); c.ellipse(px + 7, py - 1.6, 3.4, 1.8, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(px - 7.6, py - 0.6, 2.6, 1.5, 0, 0, Math.PI * 2); c.fill();
    /* 铁架：三根斜撑 */
    c.strokeStyle = '#3a4149'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(px - 10, py + 4); c.lineTo(px - 3, py - 8); c.stroke();
    c.beginPath(); c.moveTo(px + 10, py + 4); c.lineTo(px + 3, py - 8); c.stroke();
    softGlow(c, px, py - 4, 22, '190,206,224', 0.10);
  }

  /* 柜台下的信札：一摞信封 + 麻绳十字捆 + 一枚火漆印，边上摊开一封 */
  function artLetterBundle(c, px, py) {
    shadowUnder(c, px, py + 13, 15, 5);
    /* 摊开的一封 */
    c.save(); c.translate(px + 6, py + 6); c.rotate(0.12);
    c.fillStyle = '#ded2b2'; c.fillRect(-13, -6, 26, 13);
    c.strokeStyle = 'rgba(70,58,34,.5)'; c.lineWidth = 0.8; c.strokeRect(-12.5, -5.5, 25, 12);
    c.beginPath(); c.moveTo(-12, -5); c.lineTo(0, 1.6); c.lineTo(12, -5); c.stroke();
    c.restore();
    /* 摞起来的信 */
    for (var i = 0; i < 3; i++) {
      c.fillStyle = i % 2 ? '#cfc2a0' : '#e0d5b8';
      c.fillRect(px - 13 + i * 0.6, py - 11 + i * 3.4, 26, 6);
      c.strokeStyle = 'rgba(70,58,34,.42)'; c.lineWidth = 0.8;
      c.strokeRect(px - 12.7 + i * 0.6, py - 10.7 + i * 3.4, 25.4, 5.4);
    }
    /* 麻绳十字捆 */
    c.strokeStyle = '#9c8348'; c.lineWidth = 1.7;
    c.beginPath(); c.moveTo(px, py - 12); c.lineTo(px, py + 3); c.stroke();
    c.beginPath(); c.moveTo(px - 13, py - 4); c.lineTo(px + 13, py - 4); c.stroke();
    /* 火漆印 */
    c.fillStyle = '#9c3128'; c.beginPath(); c.arc(px + 1.6, py - 4, 3.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,220,210,.45)'; c.beginPath(); c.arc(px + 0.8, py - 4.8, 1.2, 0, Math.PI * 2); c.fill();
    softGlow(c, px, py - 4, 18, '255,206,132', 0.08);
  }

  /* 柜台的秤盘：黄铜浅盘 + 两只砝码 + 挂钩链子，搁在小几上 */
  function artBrassPan(c, px, py) {
    shadowUnder(c, px, py + 14, 13, 5);
    plank(c, px - 14, py + 3, 28, 12);                            /* 小几 */
    c.fillStyle = 'rgba(0,0,0,.32)'; c.fillRect(px - 14, py + 8, 28, 2);
    /* 盘 */
    var pg = c.createLinearGradient(0, py - 6, 0, py + 4);
    pg.addColorStop(0, '#f0d68a'); pg.addColorStop(1, '#a8812c');
    c.fillStyle = pg;
    c.beginPath(); c.ellipse(px - 3, py - 3, 12.5, 5.4, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(120,92,28,.8)'; c.lineWidth = 1;
    c.beginPath(); c.ellipse(px - 3, py - 3, 12.5, 5.4, 0, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(60,44,12,.35)';
    c.beginPath(); c.ellipse(px - 3, py - 2.4, 10.4, 3.8, 0, 0, Math.PI * 2); c.fill();
    /* 三根吊链 + 提梁 */
    c.strokeStyle = '#c9a227'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(px - 13, py - 4); c.lineTo(px - 3, py - 16); c.stroke();
    c.beginPath(); c.moveTo(px + 7, py - 4); c.lineTo(px - 3, py - 16); c.stroke();
    c.beginPath(); c.moveTo(px - 3, py - 8); c.lineTo(px - 3, py - 16); c.stroke();
    c.fillStyle = '#c9a227'; c.beginPath(); c.arc(px - 3, py - 17, 2.4, 0, Math.PI * 2); c.fill();
    /* 盘里的两只砝码 */
    slab(c, px - 8, py - 7, 6, 5, '#8f99a4');
    slab(c, px + 1, py - 8, 7, 6, '#7d8792');
    softGlow(c, px - 3, py - 4, 18, '255,216,140', 0.12);
  }

  /* 里间的门：木框 + 半撩起来的布帘 + 门帘钩，帘后透暖光 */
  function artBackDoor(c, px, py) {
    slab(c, px - 16, py - 26, 32, 40, '#3d2f1e');
    c.fillStyle = '#241c12'; c.fillRect(px - 12, py - 22, 24, 34);
    softGlow(c, px, py - 4, 22, '255,206,132', 0.28);
    c.fillStyle = 'rgba(255,214,140,.30)'; c.fillRect(px - 12, py - 22, 24, 34);
    /* 布帘：从右往左撩起一半，褶子用明暗竖条 */
    var cg = c.createLinearGradient(px - 14, 0, px + 12, 0);
    cg.addColorStop(0, '#6d5a44'); cg.addColorStop(0.5, '#8a7458'); cg.addColorStop(1, '#5c4b38');
    c.fillStyle = cg;
    c.beginPath();
    c.moveTo(px - 14, py - 24); c.lineTo(px + 8, py - 24);
    c.quadraticCurveTo(px + 2, py - 2, px + 6, py + 12); c.lineTo(px - 14, py + 12);
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = 1;
    for (var i = 0; i < 4; i++) {
      c.beginPath(); c.moveTo(px - 12 + i * 5, py - 22); c.lineTo(px - 10 + i * 5, py + 10); c.stroke();
    }
    /* 帘钩 + 环 */
    c.strokeStyle = '#a9853c'; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(px + 8, py - 22); c.lineTo(px + 10, py + 12); c.stroke();
    c.fillStyle = '#c9a227'; c.beginPath(); c.arc(px + 8.6, py - 8, 2.2, 0, Math.PI * 2); c.fill();
    slab(c, px - 18, py - 28, 36, 5, '#4a3a24');
  }

  /* 当铺的账本：摊开的账册（竖格）+ 算盘 + 印章盒 */
  function artLedgerOpen(c, px, py) {
    shadowUnder(c, px, py + 12, 16, 5);
    plank(c, px - 16, py - 1, 32, 13);
    c.fillStyle = '#efe6d0';
    c.beginPath(); c.moveTo(px - 13, py - 10); c.lineTo(px - 0.7, py - 6.4); c.lineTo(px - 0.7, py + 2); c.lineTo(px - 13, py - 1.6); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(px + 13, py - 10); c.lineTo(px + 0.7, py - 6.4); c.lineTo(px + 0.7, py + 2); c.lineTo(px + 13, py - 1.6); c.closePath(); c.fill();
    /* 竖栏格线：账本才有的竖格子 */
    c.strokeStyle = 'rgba(120,70,50,.5)'; c.lineWidth = 0.7;
    for (var i = 0; i < 4; i++) {
      c.beginPath(); c.moveTo(px - 11 + i * 3.2, py - 8.4 + i * 0.6); c.lineTo(px - 11 + i * 3.2, py - 1.2 + i * 0.6); c.stroke();
      c.beginPath(); c.moveTo(px + 11 - i * 3.2, py - 8.4 + i * 0.6); c.lineTo(px + 11 - i * 3.2, py - 1.2 + i * 0.6); c.stroke();
    }
    c.fillStyle = '#4a3a20'; c.fillRect(px - 0.9, py - 7, 1.8, 9);
    /* 算盘搁在摊开的账上（当铺的账要打得响） */
    plank(c, px - 3, py + 3.4, 22, 7);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(px - 1, py + 5, 18, 1);
    c.fillStyle = '#c9a227';
    for (i = 0; i < 4; i++) { c.fillRect(px + 1 + i * 4.4, py + 5.6, 2.2, 3); }
    c.fillStyle = '#9c3128'; c.fillRect(px - 16, py + 4, 7, 6);   /* 印章盒 */
    softGlow(c, px, py - 3, 20, '255,206,132', 0.10);
  }

  /* 盐工的晒盐簿：簿子搁在盐块上，纸面结了一层白霜 */
  function artSaltRegister(c, px, py) {
    shadowUnder(c, px, py + 13, 15, 5);
    /* 一摞盐块当桌子 */
    slab(c, px - 14, py + 2, 28, 13, '#cfd6dc', 'rgba(120,132,142,.6)');
    c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(px - 13, py + 3, 26, 2);
    c.fillStyle = 'rgba(150,162,172,.45)'; c.fillRect(px - 13, py + 8, 26, 1.4);
    /* 摊开的簿子 */
    c.fillStyle = '#e7e0cc';
    c.beginPath(); c.moveTo(px - 12, py - 8); c.lineTo(px - 0.7, py - 5); c.lineTo(px - 0.7, py + 3); c.lineTo(px - 12, py + 0.4); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(px + 12, py - 8); c.lineTo(px + 0.7, py - 5); c.lineTo(px + 0.7, py + 3); c.lineTo(px + 12, py + 0.4); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(96,76,42,.5)'; c.lineWidth = 0.8;
    for (var i = 0; i < 3; i++) {
      c.beginPath(); c.moveTo(px - 10, py - 5.6 + i * 2.4); c.lineTo(px - 2.4, py - 3.6 + i * 2.4); c.stroke();
      c.beginPath(); c.moveTo(px + 10, py - 5.6 + i * 2.4); c.lineTo(px + 2.4, py - 3.6 + i * 2.4); c.stroke();
    }
    c.fillStyle = '#4a3a20'; c.fillRect(px - 0.8, py - 5.4, 1.6, 8);
    /* 结在纸上的盐霜：几粒白点 */
    c.fillStyle = 'rgba(255,255,255,.85)';
    for (i = 0; i < 7; i++) {
      var hx = hash(i, 3, 91), hy = hash(i, 7, 93);
      c.fillRect(px - 11 + hx * 22, py - 6 + hy * 8, 1.4, 1.4);
    }
    /* 木刮板 */
    c.strokeStyle = '#8a733f'; c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(px + 14, py + 12); c.lineTo(px + 21, py - 1); c.stroke();
    softGlow(c, px, py, 18, '226,236,244', 0.10);
  }

  /* 盐堆与三天的记号：白色盐堆 + 三根记数木签 + 插着的木铲 */
  function artSaltHeap(c, px, py) {
    shadowUnder(c, px, py + 14, 17, 6);
    var g = c.createLinearGradient(0, py - 16, 0, py + 14);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#e6ecf0'); g.addColorStop(1, '#b9c4cc');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(px - 20, py + 13); c.quadraticCurveTo(px - 12, py - 18, px, py - 19);
    c.quadraticCurveTo(px + 13, py - 17, px + 20, py + 13); c.closePath(); c.fill();
    /* 堆面上的盐粒 */
    c.fillStyle = 'rgba(255,255,255,.75)';
    for (var i = 0; i < 8; i++) {
      c.fillRect(px - 12 + hash(i, 1, 95) * 24, py - 8 + hash(i, 2, 97) * 16, 1.6, 1.6);
    }
    /* 三天的记号：三根木签插成一排 */
    for (i = 0; i < 3; i++) {
      var sx = px - 8 + i * 8;
      c.fillStyle = '#8a733f'; c.fillRect(sx - 1, py - 12 + i * 2.4, 2.2, 14);
      c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(sx - 1, py - 12 + i * 2.4, 2.2, 1.6);
    }
    /* 木铲插在堆里 */
    c.strokeStyle = '#6b5327'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(px + 16, py + 12); c.lineTo(px + 12, py - 4); c.stroke();
    c.fillStyle = '#7d6a44';
    c.beginPath(); c.moveTo(px + 10, py - 4); c.lineTo(px + 17, py - 5); c.lineTo(px + 16, py - 12); c.lineTo(px + 10, py - 11); c.closePath(); c.fill();
    softGlow(c, px, py + 2, 22, '232,242,250', 0.12);
  }

  /* 潮位尺：一根刻着格子的木尺立在石槽里，刻度下半截是湿的 */
  function artTideGauge(c, px, py) {
    shadowUnder(c, px, py + 15, 11, 5);
    slab(c, px - 12, py + 6, 24, 10, '#5f6a76');                  /* 石槽 */
    c.fillStyle = 'rgba(30,40,52,.55)'; c.beginPath(); c.ellipse(px, py + 6, 10, 3, 0, 0, Math.PI * 2); c.fill();
    slab(c, px - 4, py - 30, 8, 37, '#cbbf9c');                   /* 尺身 */
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(px + 1, py - 30, 3, 37);
    /* 刻度：每 4 像素一格，重点处加长 */
    c.strokeStyle = 'rgba(50,40,24,.75)'; c.lineWidth = 1;
    for (var i = 0; i < 9; i++) {
      var ty = py - 26 + i * 4, long = (i % 3 === 0);
      c.beginPath(); c.moveTo(px - 4, ty + 0.5); c.lineTo(px - 4 + (long ? 8 : 5), ty + 0.5); c.stroke();
    }
    /* 湿痕：下半截颜色深，边上挂一小撮水 */
    c.fillStyle = 'rgba(40,56,72,.40)'; c.fillRect(px - 4, py - 6, 8, 13);
    c.fillStyle = 'rgba(150,190,215,.45)';
    c.beginPath(); c.ellipse(px + 4, py - 6, 2.2, 1.2, 0, 0, Math.PI * 2); c.fill();
    /* 顶上钉的一块小木牌 */
    plank(c, px - 7, py - 37, 14, 8);
    softGlow(c, px, py - 14, 18, '206,226,240', 0.10);
  }

  /* 潮位桩（把日记残页排成时间的那根桩）：粗木桩 + 钉子 + 钉着的纸 */
  function artTidePost(c, px, py) {
    shadowUnder(c, px, py + 15, 12, 5);
    slab(c, px - 6, py - 30, 12, 44, '#6b5327');                  /* 粗桩 */
    c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(px - 6, py - 30, 4, 44);
    c.fillStyle = 'rgba(0,0,0,.30)'; c.fillRect(px - 6, py - 18, 12, 2); c.fillRect(px - 6, py - 6, 12, 2);
    /* 钉在上头的三张纸：一张翘着 */
    var papers = [[-14, -26, 13, 11, -0.10], [1, -24, 12, 10, 0.07], [-8, -12, 14, 10, 0.03]];
    papers.forEach(function (q, i) {
      c.save(); c.translate(px + q[0] + q[2] / 2, py + q[1] + q[3] / 2); c.rotate(q[4]);
      c.fillStyle = i === 2 ? '#e8dcbb' : '#dccfae';
      c.fillRect(-q[2] / 2, -q[3] / 2, q[2], q[3]);
      c.fillStyle = 'rgba(70,58,34,.5)';
      c.fillRect(-q[2] / 2 + 1.5, -q[3] / 2 + 3, q[2] - 4, 1);
      c.fillRect(-q[2] / 2 + 1.5, -q[3] / 2 + 5.6, q[2] - 6, 1);
      c.restore();
    });
    c.fillStyle = '#8f99a4';
    [[-9, -26], [6, -24], [-2, -12]].forEach(function (q) {
      c.beginPath(); c.arc(px + q[0], py + q[1], 1.3, 0, Math.PI * 2); c.fill();
    });
    /* 桩脚绕着的绳 */
    c.strokeStyle = '#8a733f'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(px - 8, py + 8); c.lineTo(px + 8, py + 5); c.stroke();
    softGlow(c, px, py - 8, 20, '226,236,244', 0.08);
  }

  /* 潮水冲上岸的东西：缠成团的一张网 + 两只浮子 + 一段浮木 + 海带 */
  function artDriftWrack(c, px, py) {
    shadowUnder(c, px, py + 14, 17, 6);
    /* 浮木 */
    c.save(); c.translate(px - 4, py + 6); c.rotate(-0.18);
    plank(c, -17, -4, 34, 8);
    c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(-17, 0, 34, 2);
    c.restore();
    /* 渔网：几个交叠的菱形网格 */
    c.strokeStyle = 'rgba(226,222,206,.55)'; c.lineWidth = 0.9;
    for (var i = -2; i <= 2; i++) {
      c.beginPath();
      c.moveTo(px - 14 + i * 6, py - 4); c.lineTo(px - 8 + i * 6, py + 4);
      c.stroke();
      c.beginPath();
      c.moveTo(px - 8 + i * 6, py - 4); c.lineTo(px - 14 + i * 6, py + 4);
      c.stroke();
    }
    /* 两只浮子 */
    c.fillStyle = '#c9542f';
    c.beginPath(); c.ellipse(px + 10, py - 6, 4.6, 3.4, -0.4, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e8e2d2';
    c.beginPath(); c.ellipse(px + 10, py - 6, 4.6, 3.4, -0.4, Math.PI * 0.86, Math.PI * 1.86); c.fill();
    c.fillStyle = '#a83b22'; c.beginPath(); c.arc(px + 14, py + 2, 2.6, 0, Math.PI * 2); c.fill();
    /* 海带 */
    c.strokeStyle = 'rgba(74,96,72,.85)'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(px - 15, py + 9); c.quadraticCurveTo(px - 6, py + 2, px + 2, py + 10); c.stroke();
    softGlow(c, px, py, 20, '210,226,236', 0.08);
  }

  /* 馆里的入册簿：斜搁在诵经架上的大册 + 笔 + 墨水瓶 */
  function artLecternBook(c, px, py) {
    shadowUnder(c, px, py + 14, 14, 5);
    /* 架子腿 */
    c.strokeStyle = '#4a3a24'; c.lineWidth = 2.6;
    c.beginPath(); c.moveTo(px - 9, py + 13); c.lineTo(px - 13, py - 4); c.stroke();
    c.beginPath(); c.moveTo(px + 9, py + 13); c.lineTo(px + 13, py - 4); c.stroke();
    /* 斜面 */
    c.save(); c.translate(px, py - 1); c.rotate(-0.14);
    plank(c, -16, -12, 32, 14);
    c.fillStyle = '#e9e2cd'; c.fillRect(-14, -10.4, 28, 11);
    c.strokeStyle = 'rgba(96,76,42,.55)'; c.lineWidth = 0.8;
    for (var i = 0; i < 4; i++) {
      c.beginPath(); c.moveTo(-12, -9 + i * 2.6); c.lineTo(12, -9 + i * 2.6); c.stroke();
    }
    c.fillStyle = '#4a3a20'; c.fillRect(-0.8, -10.4, 1.6, 11);
    c.restore();
    /* 笔搁在架边 + 墨水瓶 */
    c.strokeStyle = '#e8e2d2'; c.lineWidth = 1.8;
    c.beginPath(); c.moveTo(px + 6, py + 2); c.lineTo(px + 18, py - 6); c.stroke();
    c.strokeStyle = '#3a2f18'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(px + 16, py - 4.4); c.lineTo(px + 19, py - 6.4); c.stroke();
    slab(c, px - 20, py + 4, 8, 8, '#2f3a46', 'rgba(0,0,0,.5)');
    c.fillStyle = 'rgba(20,26,34,.85)'; c.beginPath(); c.ellipse(px - 16, py + 4, 3.4, 1.4, 0, 0, Math.PI * 2); c.fill();
    softGlow(c, px, py - 4, 20, '255,206,132', 0.10);
  }

  /* 没编号的那格书架：书架的中间一格空着（层板上只有一个灰印） */
  function artEmptyShelf(c, px, py) {
    shadowUnder(c, px, py + 15, 14, 5);
    plank(c, px - 15, py - 21, 30, 38);
    for (var r = 0; r < 3; r++) {
      var ry = py - 17 + r * 12, q;
      c.fillStyle = 'rgba(0,0,0,.34)'; c.fillRect(px - 13, ry + 9, 26, 2);
      if (r === 1) {
        /* 空格：层板上留一道没擦净的灰印 */
        c.fillStyle = 'rgba(200,196,182,.16)'; c.fillRect(px - 11, ry + 2, 22, 7);
        c.strokeStyle = 'rgba(120,112,96,.5)'; c.lineWidth = 0.8;
        c.strokeRect(px - 11, ry + 2, 22, 7);
        continue;
      }
      for (q = 0; q < 4; q++) {
        var sh = 6 + hash(r + 2, q + 4, 61) * 4;
        c.fillStyle = ['#b9a06a', '#8f7a48', '#d8c48e', '#7d6a44'][(r * 2 + q) % 4];
        c.fillRect(px - 12 + q * 5.6, ry + 9 - sh, 4.4, sh);
      }
    }
    /* 挂着的小掸子 */
    c.strokeStyle = '#6b5327'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(px + 15, py - 18); c.lineTo(px + 17, py - 3); c.stroke();
    c.fillStyle = 'rgba(198,188,164,.85)';
    c.beginPath(); c.ellipse(px + 17, py - 1, 3.2, 5, 0.2, 0, Math.PI * 2); c.fill();
    softGlow(c, px, py - 4, 18, '210,220,232', 0.06);
  }

  /* 朝北的那扇窗：窗框 + 一道冷光柱 + 窗台上的枯盆栽 */
  function artNorthWindow(c, px, py) {
    /* 一道从窗里斜下来的冷光 */
    c.save();
    c.globalAlpha = 0.16;
    var g = c.createLinearGradient(px, py - 20, px + 14, py + 16);
    g.addColorStop(0, '#cfe0ea'); g.addColorStop(1, 'rgba(207,224,234,0)');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(px - 13, py - 18); c.lineTo(px + 13, py - 18); c.lineTo(px + 20, py + 16); c.lineTo(px - 4, py + 16); c.closePath(); c.fill();
    c.restore();
    slab(c, px - 15, py - 22, 30, 34, '#3b3630');                 /* 窗框外圈 */
    c.fillStyle = '#20262e'; c.fillRect(px - 12, py - 19, 24, 28);
    var wg = c.createLinearGradient(0, py - 19, 0, py + 9);
    wg.addColorStop(0, '#9fb6c6'); wg.addColorStop(0.7, '#5d6f80'); wg.addColorStop(1, '#6d7f8e');
    c.fillStyle = wg; c.fillRect(px - 11, py - 18, 22, 26);
    c.strokeStyle = 'rgba(28,24,20,.8)'; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(px, py - 18); c.lineTo(px, py + 8); c.stroke();
    c.beginPath(); c.moveTo(px - 11, py - 6); c.lineTo(px + 11, py - 6); c.stroke();
    c.beginPath(); c.moveTo(px - 11, py + 2); c.lineTo(px + 11, py + 2); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(px - 11, py - 18, 22, 1.6);
    slab(c, px - 17, py + 9, 34, 6, '#6d6455');                    /* 窗台 */
    /* 窗台上的枯盆栽 */
    c.fillStyle = '#8a5a3a'; c.fillRect(px + 8, py + 2, 8, 8);
    c.fillStyle = '#5f4a30'; c.fillRect(px + 8, py + 2, 8, 2);
    c.strokeStyle = 'rgba(120,110,80,.9)'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(px + 12, py + 2); c.lineTo(px + 11, py - 5); c.stroke();
    c.beginPath(); c.moveTo(px + 12, py - 1); c.lineTo(px + 15, py - 4); c.stroke();
    softGlow(c, px, py - 6, 22, '190,214,232', 0.12);
  }

  /* 火痕墙：一段塌了的墙 + 一道烧黑的火痕 + 壁龛里的小罐 */
  function artBurnWall(c, px, py) {
    shadowUnder(c, px, py + 15, 17, 6);
    slab(c, px - 20, py - 16, 40, 30, '#4a453e');
    c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(px - 20, py - 16, 40, 2);
    /* 塌口：右上角缺一块 */
    c.fillStyle = 'rgba(0,0,0,0)';
    /* 砖缝 */
    c.strokeStyle = 'rgba(0,0,0,.30)'; c.lineWidth = 1;
    for (var by = py - 8; by < py + 12; by += 7) {
      c.beginPath(); c.moveTo(px - 19, by + 0.5); c.lineTo(px + 19, by + 0.5); c.stroke();
      for (var bx = px - 14; bx < px + 18; bx += 12) {
        c.beginPath(); c.moveTo(bx + 0.5, by - 6.5); c.lineTo(bx + 0.5, by); c.stroke();
      }
    }
    /* 火痕：从下往上收的黑烟 */
    var g = c.createLinearGradient(0, py + 13, 0, py - 16);
    g.addColorStop(0, 'rgba(12,10,8,.88)'); g.addColorStop(0.6, 'rgba(20,16,12,.55)'); g.addColorStop(1, 'rgba(20,16,12,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(px - 8, py + 13); c.lineTo(px - 11, py - 2); c.lineTo(px - 5, py - 13);
    c.lineTo(px + 6, py - 14); c.lineTo(px + 9, py - 1); c.lineTo(px + 7, py + 13); c.closePath(); c.fill();
    /* 壁龛：凹进去的一格，放着一个小罐 */
    c.fillStyle = '#17140f'; c.fillRect(px + 11, py - 6, 10, 11);
    c.strokeStyle = 'rgba(180,168,142,.45)'; c.lineWidth = 1; c.strokeRect(px + 11.5, py - 5.5, 9, 10);
    c.fillStyle = '#6d6156';
    c.beginPath(); c.ellipse(px + 16, py + 1, 3.2, 3.6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#4a4238'; c.fillRect(px + 14.4, py - 3.6, 3.2, 2);
    softGlow(c, px + 16, py, 14, '255,196,110', 0.10);
  }

  /* 她留在雾里的话：雾里浮着的几笔字 + 一个按在雾上的手印 */
  function artFogWords(c, px, py) {
    var i;
    /* 一团更浓的雾 */
    c.fillStyle = 'rgba(214,222,232,.16)';
    c.beginPath(); c.ellipse(px, py - 2, 22, 13, 0, 0, Math.PI * 2); c.fill();
    /* 浮着的笔画：三道短横 + 一竖，像写到一半散了 */
    c.strokeStyle = 'rgba(236,242,250,.62)'; c.lineWidth = 1.4;
    for (i = 0; i < 3; i++) {
      var yy = py - 9 + i * 6.4;
      c.beginPath(); c.moveTo(px - 11 + (i % 2) * 2, yy); c.lineTo(px + 6 - (i % 2) * 3, yy - 0.8); c.stroke();
    }
    c.beginPath(); c.moveTo(px + 3, py - 12); c.lineTo(px + 1.4, py + 8); c.stroke();
    c.globalAlpha = 0.4;
    c.strokeStyle = 'rgba(236,242,250,.7)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(px - 9, py - 14); c.lineTo(px + 8, py - 15.4); c.stroke();
    c.globalAlpha = 1;
    /* 按在雾上的手印：五指 */
    c.fillStyle = 'rgba(228,236,246,.22)';
    c.beginPath(); c.ellipse(px - 2, py + 6, 6, 7.6, 0.2, 0, Math.PI * 2); c.fill();
    for (i = 0; i < 4; i++) {
      c.beginPath();
      c.ellipse(px - 7 + i * 3.4, py - 2.4 + (i === 3 ? 1.6 : 0), 1.5, 3.6, (i - 1.5) * 0.18, 0, Math.PI * 2);
      c.fill();
    }
    softGlow(c, px, py - 2, 26, '226,236,248', 0.14);
  }

  /* 雾里的另一盏灯：一根挑杆挑着的小灯，罩子糊着一层雾 */
  function artFogLantern(c, px, py) {
    c.fillStyle = 'rgba(0,0,0,.26)'; c.beginPath(); c.ellipse(px, py + 15, 11, 4, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#3a4149'; c.lineWidth = 3.4;                  /* 挑杆 */
    c.beginPath(); c.moveTo(px - 16, py + 14); c.lineTo(px + 10, py + 14); c.stroke();
    c.beginPath(); c.moveTo(px + 10, py + 14); c.lineTo(px + 16, py - 8); c.stroke();
    /* 挂着的灯 */
    c.fillStyle = '#39424e'; c.fillRect(px + 15, py - 8, 1.8, 6);
    softGlow(c, px + 16, py + 4, 26, '255,226,168', 0.32);
    slab(c, px + 9, py - 2, 14, 15, '#3f4a57');
    c.fillStyle = 'rgba(255,238,196,.85)'; c.fillRect(px + 11, py, 10, 11);
    c.fillStyle = 'rgba(210,222,234,.30)'; c.fillRect(px + 11, py, 10, 4);   /* 玻璃上糊的雾 */
    c.fillStyle = '#39424e'; c.fillRect(px + 8, py - 4, 16, 2.6);
    c.fillRect(px + 8, py + 13, 16, 2.4);
    /* 灯下站过人的地方：一小圈没雾的空地 */
    c.fillStyle = 'rgba(226,236,246,.10)';
    c.beginPath(); c.ellipse(px + 16, py + 16, 12, 4.4, 0, 0, Math.PI * 2); c.fill();
  }

  /* 雾里的船影：只剩一个黑轮廓的船，桅杆上还挂着半张帆 */
  function artBoatShadow(c, px, py) {
    c.fillStyle = 'rgba(18,22,28,.55)';
    c.beginPath();
    c.moveTo(px - 22, py + 2); c.lineTo(px + 22, py + 2);
    c.quadraticCurveTo(px + 16, py + 16, px - 2, py + 16);
    c.quadraticCurveTo(px - 16, py + 15, px - 22, py + 2); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(18,22,28,.6)'; c.lineWidth = 2.6;      /* 桅杆 */
    c.beginPath(); c.moveTo(px + 2, py + 3); c.lineTo(px + 2, py - 26); c.stroke();
    c.beginPath(); c.moveTo(px + 2, py - 26); c.lineTo(px + 16, py - 16); c.stroke();
    /* 半张帆：一个三角，边缘被雾吃掉 */
    c.fillStyle = 'rgba(180,192,206,.28)';
    c.beginPath(); c.moveTo(px + 3, py - 25); c.lineTo(px + 15, py - 16); c.lineTo(px + 3, py - 4); c.closePath(); c.fill();
    /* 缆绳拖进雾里 */
    c.strokeStyle = 'rgba(180,192,206,.30)'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(px - 22, py + 1); c.quadraticCurveTo(px - 30, py + 8, px - 26, py + 15); c.stroke();
    /* 船边的雾 */
    c.fillStyle = 'rgba(214,222,232,.16)';
    c.beginPath(); c.ellipse(px - 2, py + 8, 26, 10, 0, 0, Math.PI * 2); c.fill();
  }

  /* 她教你的歌谣：一副木架挂着四根管子（敲的），边上挂着音符 */
  function artSongChime(c, px, py) {
    c.fillStyle = 'rgba(0,0,0,.26)'; c.beginPath(); c.ellipse(px, py + 15, 12, 4.2, 0, 0, Math.PI * 2); c.fill();
    slab(c, px - 2, py - 4, 4, 20, '#4a3a24');                    /* 立杆 */
    plank(c, px - 16, py - 20, 32, 4);                            /* 横梁 */
    /* 四根管子：长短不同，颜色有点差别 */
    var lens = [16, 21, 13, 18];
    for (var i = 0; i < 4; i++) {
      var tx = px - 12 + i * 8, tl = lens[i];
      c.strokeStyle = 'rgba(214,206,180,.5)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(tx, py - 16); c.lineTo(tx, py - 16 + 3); c.stroke();
      var tg = c.createLinearGradient(tx - 2, 0, tx + 2, 0);
      tg.addColorStop(0, '#e6dcc0'); tg.addColorStop(0.5, '#b9a97e'); tg.addColorStop(1, '#8a7c58');
      c.fillStyle = tg; c.fillRect(tx - 2, py - 13, 4, tl);
      c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(tx - 2, py - 13 + tl - 2, 4, 2);
    }
    /* 小木槌 */
    c.strokeStyle = '#6b5327'; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(px + 12, py + 14); c.lineTo(px + 18, py + 1); c.stroke();
    c.fillStyle = '#8a733f';
    c.beginPath(); c.ellipse(px + 19, py - 1.6, 4.4, 3.2, -0.4, 0, Math.PI * 2); c.fill();
    /* 飘着的一个音符 */
    c.fillStyle = 'rgba(240,228,190,.75)';
    c.font = '13px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('\u266a', px - 14, py - 26);
    softGlow(c, px, py - 6, 22, '255,226,168', 0.14);
  }

  /* 三问：一根杆上挑着三盏灯，答对一句亮一盏 */
  function artThreeAsks(c, px, py) {
    c.fillStyle = 'rgba(0,0,0,.26)'; c.beginPath(); c.ellipse(px, py + 15, 12, 4.2, 0, 0, Math.PI * 2); c.fill();
    slab(c, px - 2.5, py - 6, 5, 22, '#3a3126');                  /* 立杆 */
    c.strokeStyle = '#3a3126'; c.lineWidth = 2.6;                 /* 三根挑出去的枝 */
    var tips = [[-15, -16], [0, -23], [15, -16]];
    tips.forEach(function (q, i) {
      c.beginPath(); c.moveTo(px, py - 6); c.lineTo(px + q[0], py + q[1] + 6); c.stroke();
      var lx = px + q[0], ly = py + q[1] + 8;
      c.fillStyle = '#2b3546'; c.fillRect(lx - 0.8, ly - 6, 1.6, 5);
      /* 第一盏是亮的，另外两盏还冷着 */
      var on = (i === 1);
      softGlow(c, lx, ly + 4, on ? 24 : 14, on ? '255,226,168' : '178,200,216', on ? 0.42 : 0.12);
      var lg = c.createLinearGradient(0, ly, 0, ly + 11);
      lg.addColorStop(0, on ? '#fff3cf' : '#c6d4de'); lg.addColorStop(1, on ? '#e8a63c' : '#5d6b78');
      c.fillStyle = lg;
      c.beginPath(); c.moveTo(lx - 4.4, ly); c.lineTo(lx - 3.2, ly + 10); c.lineTo(lx + 3.2, ly + 10); c.lineTo(lx + 4.4, ly); c.closePath(); c.fill();
      c.fillStyle = '#2b3546'; c.fillRect(lx - 5.2, ly - 2.4, 10.4, 2.4);
      c.fillRect(lx - 4.4, ly + 10, 8.8, 2);
    });
    softGlow(c, px, py + 2, 26, '255,226,168', 0.12);
  }

  /* 还名：碑前摆着凿子和笔、一方砚台、一朵白花 */
  function artReturnStele(c, px, py) {
    shadowUnder(c, px, py + 15, 13, 5);
    slab(c, px - 12, py - 24, 24, 38, '#3b3f45');
    c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(px - 12, py - 24, 4, 38);
    c.fillStyle = '#2b2620'; c.fillRect(px - 8.4, py - 20, 16.8, 30);
    /* 补上去的那个名字：一道新刻的笔画（比别的浅） */
    c.strokeStyle = 'rgba(236,228,204,.85)'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(px - 5, py - 16); c.lineTo(px + 5, py - 16.6); c.stroke();
    c.beginPath(); c.moveTo(px - 1.6, py - 18); c.lineTo(px - 1.6, py - 8); c.stroke();
    c.beginPath(); c.moveTo(px - 5.6, py - 12.4); c.lineTo(px + 5.6, py - 13); c.stroke();
    c.strokeStyle = 'rgba(232,222,198,.35)'; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(px - 4.6, py - 3.4); c.lineTo(px + 5, py - 4); c.stroke();
    c.beginPath(); c.moveTo(px - 4.6, py + 2.4); c.lineTo(px + 5, py + 1.8); c.stroke();
    /* 碑前的凿子 + 笔 + 砚台 */
    c.strokeStyle = '#8f99a4'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(px - 20, py + 8); c.lineTo(px - 8, py + 2); c.stroke();
    c.strokeStyle = '#e8e2d2'; c.lineWidth = 1.8;
    c.beginPath(); c.moveTo(px + 6, py + 8); c.lineTo(px + 17, py + 2); c.stroke();
    c.strokeStyle = '#3a2f18'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(px + 14.6, py + 3.6); c.lineTo(px + 18, py + 2); c.stroke();
    slab(c, px - 4, py + 6, 9, 7, '#2f3a46', 'rgba(0,0,0,.5)');
    /* 一朵白花压在碑脚 */
    c.fillStyle = 'rgba(240,240,232,.9)';
    for (var i = 0; i < 5; i++) {
      var a = i * Math.PI * 0.4 - 0.6;
      c.beginPath(); c.ellipse(px + 10 + Math.cos(a) * 3.4, py + 12 + Math.sin(a) * 2.4, 2.4, 1.8, a, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#c9a227'; c.beginPath(); c.arc(px + 10, py + 12, 1.3, 0, Math.PI * 2); c.fill();
    softGlow(c, px, py - 4, 20, '255,226,168', 0.12);
  }

  /* 礁缝里的另一个铁盒：贝壳长满的盒子，还挂着海草 */
  function artBarnacleChest(c, px, py) {
    shadowUnder(c, px, py + 13, 14, 5);
    c.fillStyle = '#4e4a3c'; c.fillRect(px - 14, py - 4, 28, 17);
    var cg = c.createLinearGradient(px, py - 14, px, py - 3);
    cg.addColorStop(0, '#565245'); cg.addColorStop(1, '#33302a');
    c.fillStyle = cg;
    c.beginPath(); c.moveTo(px - 14, py - 4); c.lineTo(px - 14, py - 9);
    c.quadraticCurveTo(px, py - 19, px + 14, py - 9); c.lineTo(px + 14, py - 4); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 1; c.strokeRect(px - 13.5, py - 4.5, 27, 17);
    /* 藤壶：一堆小灰锥 */
    for (var i = 0; i < 9; i++) {
      var bx = px - 12 + hash(i, 5, 81) * 24, by = py - 6 + hash(i, 9, 83) * 14;
      var br = 1.8 + hash(i, 3, 85) * 1.6;
      c.fillStyle = 'rgba(186,186,176,.85)';
      c.beginPath(); c.arc(bx, by, br, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(90,90,84,.7)';
      c.beginPath(); c.arc(bx, by, br * 0.42, 0, Math.PI * 2); c.fill();
    }
    /* 挂着的一撮海草 */
    c.strokeStyle = 'rgba(74,96,72,.9)'; c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(px + 10, py - 3); c.quadraticCurveTo(px + 16, py + 4, px + 12, py + 12); c.stroke();
    c.strokeStyle = 'rgba(74,96,72,.6)'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(px - 12, py + 12); c.quadraticCurveTo(px - 17, py + 6, px - 14, py - 1); c.stroke();
    softGlow(c, px, py - 2, 20, '226,236,244', 0.10);
  }

  /* id → 模型；没登记的落回老路子（谜题 → drawProp，痕迹 → drawTrace） */
  /* 灯台的记事簿：硬皮簿 + 灯油渍 + 露出来的纸边 */
  function artLogBook(c, px, py) {
    shadowUnder(c, px, py + 13, 14, 5);
    slab(c, px - 13, py - 3, 26, 16, '#5a4a33', 'rgba(30,24,16,.6)');
    c.fillStyle = '#7a6543'; c.fillRect(px - 13, py - 3, 26, 3);
    c.fillStyle = 'rgba(240,226,196,.9)'; c.fillRect(px - 10, py + 1, 20, 10);
    c.strokeStyle = 'rgba(90,74,51,.6)'; c.lineWidth = 0.8;
    for (var i = 0; i < 3; i++) { c.beginPath(); c.moveTo(px - 9, py + 3 + i * 2.4); c.lineTo(px + 9, py + 3 + i * 2.4); c.stroke(); }
    c.fillStyle = 'rgba(60,44,20,.32)'; c.beginPath(); c.arc(px + 5, py + 6, 4.6, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(60,44,20,.5)'; c.lineWidth = 1; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(px - 13, py - 3, 26, 1.4);
  }
  /* 当票背面的暗记：一沓小票扇开，票背上有圈、两道杠、替字头 */
  function artPawnTickets(c, px, py) {
    shadowUnder(c, px, py + 13, 15, 5);
    for (var i = 0; i < 4; i++) {
      c.save(); c.translate(px - 9 + i * 6, py - 6 + i * 4); c.rotate(-0.09 + i * 0.05);
      c.fillStyle = i % 2 ? '#cfc2a0' : '#ded2b2';
      c.fillRect(-7, -9, 14, 18);
      c.strokeStyle = 'rgba(70,58,34,.45)'; c.lineWidth = 0.7; c.strokeRect(-6.6, -8.6, 13.2, 17.2);
      c.strokeStyle = 'rgba(60,50,32,.7)'; c.fillStyle = 'rgba(60,50,32,.7)';
      if (i === 3) { c.fillRect(-2.4, -3, 4.8, 1.2); c.fillRect(-2.4, -0.6, 4.8, 1.2); }
      else if (i === 2) { c.beginPath(); c.arc(0, -1, 2.4, 0, Math.PI * 2); c.stroke(); }
      else { c.fillRect(-2.6, -1.6, 5.2, 1); c.fillRect(-0.9, -3.6, 1.8, 3.6); }
      c.restore();
    }
    softGlow(c, px, py + 2, 20, '255,206,132', 0.12);
  }
  /* 退潮露出的池底：湿砖 + 砖缝 + 刻到一半的名字 */
  function artPoolFloor(c, px, py) {
    shadowUnder(c, px, py + 14, 16, 6);
    slab(c, px - 15, py - 4, 30, 18, '#b9c2c9', 'rgba(120,132,142,.55)');
    c.fillStyle = 'rgba(150,162,172,.7)';
    for (var i = 0; i < 3; i++) c.fillRect(px - 15, py - 1 + i * 5, 30, 0.9);
    c.fillStyle = 'rgba(255,255,255,.28)'; c.fillRect(px - 14, py - 3, 28, 2);
    c.strokeStyle = 'rgba(70,84,94,.85)'; c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(px - 4, py - 1); c.lineTo(px + 3, py + 1); c.stroke();
    c.beginPath(); c.moveTo(px + 3, py - 4); c.lineTo(px + 1, py + 5); c.stroke();
    c.beginPath(); c.moveTo(px + 1, py + 5); c.lineTo(px + 6, py + 6); c.stroke();
    softGlow(c, px, py, 22, '178,200,216', 0.16);
  }
  /* 停在三点四十五的钟：木壳挂钟 + 停住的指针 + 壳底的烟熏印 */
  function artStoppedClock(c, px, py) {
    shadowUnder(c, px, py + 14, 12, 5);
    plank(c, px - 11, py - 20, 22, 34);
    c.fillStyle = 'rgba(0,0,0,.32)'; c.fillRect(px - 11, py + 6, 22, 8);
    c.fillStyle = '#efe3c6'; c.beginPath(); c.arc(px, py - 3, 8.4, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#8a6b2f'; c.lineWidth = 1.2; c.stroke();
    c.fillStyle = 'rgba(90,74,45,.7)';
    for (var i = 0; i < 12; i++) {
      var a = i * Math.PI / 6;
      c.fillRect(px + Math.sin(a) * 6.6 - 0.5, py - 3 - Math.cos(a) * 6.6 - 0.5, 1, 1);
    }
    var h = (3 + 45 / 60) * Math.PI / 6;
    c.strokeStyle = '#4a3a20'; c.lineWidth = 1.8; c.beginPath();
    c.moveTo(px, py - 3); c.lineTo(px + Math.sin(h) * 4.2, py - 3 - Math.cos(h) * 4.2); c.stroke();
    c.lineWidth = 1.4; c.beginPath();
    c.moveTo(px, py - 3); c.lineTo(px + Math.sin(Math.PI * 1.5) * 6.2, py - 3 - Math.cos(Math.PI * 1.5) * 6.2); c.stroke();
    c.fillStyle = '#4a3a20'; c.beginPath(); c.arc(px, py - 3, 1.2, 0, Math.PI * 2); c.fill();
    softGlow(c, px, py - 4, 20, '255,206,132', 0.1);
  }

  var PLACE_ART = {
    carve: 'rockCarve', copy2: 'stackBooks', tin: 'sewBox', ashes: 'ashPile', oil: 'oilRig', sea: 'lookout',
    dock: 'fogBell', notice: 'noticeStone', sea_lamp: 'lampSeat',
    letters: 'letterBundle', scale_pan: 'brassPan', back: 'backDoor', ledger: 'ledgerOpen',
    saltbook: 'saltRegister', saltpile: 'saltHeap', gauge: 'tideGauge', post: 'tidePost', wrack: 'driftWrack',
    inbook: 'lecternBook', shelfrow: 'emptyShelf', northwin: 'northWindow', burn: 'burnWall',
    her_words: 'fogWords', othlamp: 'fogLantern', boatshape: 'boatShadow',
    song: 'songChime', ask: 'threeAsks', return: 'returnStele', chest2: 'barnacleChest',
    logbook: 'logBook', pawnsig: 'pawnTickets', saltnames: 'poolFloor', stillclock: 'stoppedClock'
  };
  var ART_FN = {
    rockCarve: artRockCarve, stackBooks: artStackBooks, sewBox: artSewBox, ashPile: artAshPile,
    oilRig: artOilRig, lookout: artLookout, fogBell: artFogBell, noticeStone: artNoticeStone,
    lampSeat: artLampSeat, letterBundle: artLetterBundle, brassPan: artBrassPan, backDoor: artBackDoor,
    ledgerOpen: artLedgerOpen, saltRegister: artSaltRegister, saltHeap: artSaltHeap, tideGauge: artTideGauge,
    tidePost: artTidePost, driftWrack: artDriftWrack, lecternBook: artLecternBook, emptyShelf: artEmptyShelf,
    northWindow: artNorthWindow, burnWall: artBurnWall, fogWords: artFogWords, fogLantern: artFogLantern,
    boatShadow: artBoatShadow, songChime: artSongChime, threeAsks: artThreeAsks, returnStele: artReturnStele,
    barnacleChest: artBarnacleChest, logBook: artLogBook, pawnTickets: artPawnTickets,
    poolFloor: artPoolFloor, stoppedClock: artStoppedClock
  };

  function drawPlace(c, p) {
    var px = p.x * CELL + CELL / 2, py = p.y * CELL + CELL / 2;
    var sc = scene(), col = sc.palette.accent;
    var lit = (sc.ambient === 'night' || sc.ambient === 'lamp' || sc.ambient === 'dusk');
    var art = PLACE_ART[p.id];
    c.save();
    if (!memKeyOpen(p)) c.globalAlpha = 0.45;          /* v34 A1：认不出的东西，画得发暗 */
    if (p.npc) {
      /* 有身份的 NPC 一律画人（祁掌柜 / 柳先生 / 阿罔以前只是地上的一团灰印）。
         v31.3：六个人各有立绘（身形 / 衣色四阶 / 随身物），跟像素建筑一个档 */
      if (global.ART31 && ART31.paintFigure) ART31.paintFigure(c, p.id, p.x, p.y, -1, 0, 0.35);
      else drawFigure(c, p.x, p.y, NPC_COL[p.id] || '#8fb8c8', -1, 0);
    } else if (art && ART_FN[art]) {
      ART_FN[art](c, px, py, col, lit);
    } else if (p.kind === 'portal') {
      drawGate(c, p);
    } else if (p.kind === 'puzzle') {
      drawProp(c, PROP_OF[p.puz] || 'spark', px, py, col, lit);
    } else if (p.kind === 'item') {
      drawChest(c, px, py);
    } else if (p.kind === 'buy') {
      drawGoods(c, px, py);
    } else if (p.kind === 'jobs') {
      drawBoard(c, px, py);
    } else if (p.kind === 'work') {
      drawSite(c, px, py, p.id);
    } else {
      drawTrace(c, p, px, py);
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
    /* 地面画法：v31.1 起也交给 art31.js（硬边像素铺法 + 2×2 抖），
       没加载到就回退本文件的老画法（渐变 + strokeRect）。 */
    (typeof ART31 !== 'undefined' && ART31 && ART31.paintGround ? ART31.paintGround : function (cc, s2, p2) { paintGround(cc, p2, GROUND[s2.id] || 'stone'); })(c, sc, pal);
    /* 建筑画法：v31 起交给 art31.js（硬边像素、每栋专属形制）。
       没加载到 art31（或它半路炸了）就自动回退本文件的老画法，绝不白屏。 */
    (typeof ART31 !== 'undefined' && ART31 && ART31.paintSolids ? ART31.paintSolids : paintSolids)(c, sc, pal);
    /* 出口格画门屋；places 里那些 kind='portal' 的（镇上的记当铺 / 岛史馆 / 盐埕口）
       以前被这一行整批跳过 —— 三扇门从来没画出来过，玩家只能靠互动标签猜。
       地图沿上那种"旁边就有一扇正经门"的出口（镇子东头的盐埕口）不再另起一座，
       免得到处都是门、玩家分不清哪个是哪个。 */
    var exitHere = {};
    sc.portals.forEach(function (po) {
      exitHere[po.x + ',' + po.y] = 1;
      var g = gatePlan(sc.id, po);
      if (g && g.kind !== 'skip') drawGate(c, po);
    });
    sc.places.forEach(function (p) { if (!exitHere[p.x + ',' + p.y]) drawPlace(c, p); });
    bgDirty = false;
  }
  var SCALE_CAP = 3;
  function setupCanvas() {
    /* 画质的关键：背板像素要跟"屏幕上真实的像素"对齐，而不是只跟 DPR 对齐。
       以前 SCALE 只取 min(2, DPR)，canvas 又被 CSS 拉成另一个尺寸 —— 浏览器再采样一次，
       细线和字全是糊的（实机反馈"画质太低"就是这个）。现在按 显示宽度/VW × DPR 算，量化到 1/8 档。 */
    var dpr = global.devicePixelRatio || 1;
    /* 先把内联尺寸清掉再量：不然上一轮写死的 px 会顶着 CSS 的 width:100%，窗口缩放就不跟手了 */
    if (canvas.style) { canvas.style.width = ''; canvas.style.height = ''; }
    var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    var dispW = (rect && rect.width) ? rect.width : VW;
    var raw = (dispW / VW) * dpr;                       /* 屏幕上真实需要几倍 */
    if (raw >= 1) {
      /* v31.2：背板直接按"屏幕上的真实设备像素"来 —— 一格背板 = 一个设备像素，
         浏览器不再二次采样（以前量化到 1/8 档，多出来的那点余量就是一层糊）。
         CSS 尺寸按 dpr 折回去，显示大小跟以前一样，只是不糊了。 */
      SCALE = clamp(raw, 1, SCALE_CAP);
      canvas.width = Math.round(VW * SCALE); canvas.height = Math.round(VH * SCALE);
      if (canvas.style) {
        canvas.style.width = (canvas.width / dpr) + 'px';
        canvas.style.height = (canvas.height / dpr) + 'px';
        canvas.style.imageRendering = 'pixelated';
      }
    } else {
      /* 窗口比画布还窄（很少见）：保 1:1 会把 1px 线裁没，这里交回浏览器平滑缩，
         宁可软一点也别丢线。 */
      SCALE = 1;
      canvas.width = VW; canvas.height = VH;
      if (canvas.style) {
        canvas.style.width = ''; canvas.style.height = '';
        canvas.style.imageRendering = 'auto';
      }
    }
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
  /* 每个氛围一套"灯色 / 分级 / 压暗"：冷场景冷、暖场景暖，光不再是同一块灰 */
  var AMB = {
    night: { key: '206,226,255', warm: '255,206,132', top: 'rgba(8,18,40,.34)', bot: 'rgba(4,8,18,.04)', tint: 'rgba(6,10,20,.18)', dust: 1 },
    lamp: { key: '255,214,150', warm: '255,186,104', top: 'rgba(44,24,6,.18)', bot: 'rgba(255,190,110,.08)', tint: 'rgba(60,34,8,.05)', dust: 1 },
    dusk: { key: '255,200,150', warm: '255,166,96', top: 'rgba(52,26,6,.24)', bot: 'rgba(255,150,80,.10)', tint: 'rgba(60,30,10,.08)', dust: 1 },
    fog: { key: '222,232,244', warm: '216,228,242', top: 'rgba(126,146,170,.18)', bot: 'rgba(196,210,228,.10)', tint: 'rgba(150,170,195,.06)', dust: 0 },
    wind: { key: '228,238,250', warm: '236,244,255', top: 'rgba(26,38,54,.24)', bot: 'rgba(200,215,235,.08)', tint: 'rgba(40,55,75,.06)', dust: 0 },
    still: { key: '255,236,200', warm: '255,220,170', top: 'rgba(40,30,14,.24)', bot: 'rgba(130,98,44,.06)', tint: 'rgba(60,45,20,.06)', dust: 1 }
  };
  function ambOf(sc) { return AMB[sc.ambient] || AMB.still; }
  function render() {
    var sc = scene(), pal = sc.palette, t = S.t, amb = ambOf(sc);
    if (ctx.setTransform) ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    if (bgDirty) bake();
    var shook = false;
    if (shake > 0.01) {
      ctx.save(); shook = true;
      if (ctx.translate) ctx.translate(Math.sin(S.t * 61) * 3.4 * shake, Math.cos(S.t * 53) * 2.6 * shake);
    }
    ctx.fillStyle = pal.sky; ctx.fillRect(0, 0, VW, VH);
    if (bg) ctx.drawImage(bg, 0, 0, VW, VH);
    /* ① 分级：上冷下暖一层薄色（以前是"平色 + 一整块灰罩"） */
    var gr = ctx.createLinearGradient(0, 0, 0, VH);
    gr.addColorStop(0, amb.top); gr.addColorStop(1, amb.bot);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, VW, VH);
    if (amb.tint) { ctx.fillStyle = amb.tint; ctx.fillRect(0, 0, VW, VH); }
    /* ② 光：走叠加混合（lighter）—— 用 source-over 压上去只会越盖越灰 */
    ctx.save();
    if (ctx.globalCompositeOperation !== undefined) ctx.globalCompositeOperation = 'lighter';
    sc.portals.forEach(function (p) {
      var pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
      var gx = p.x * CELL + CELL / 2, gy = p.y * CELL + CELL / 2;
      var pg = ctx.createRadialGradient(gx, gy, 3, gx, gy, 54);
      pg.addColorStop(0, 'rgba(' + amb.warm + ',' + (0.16 + 0.13 * pulse).toFixed(2) + ')');
      pg.addColorStop(1, 'rgba(' + amb.warm + ',0)');
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(gx, gy, 54, 0, Math.PI * 2); ctx.fill();
    });
    /* 每处可交互点 / 干活点脚下都有一盏灯（以前只有谜题和货架有） */
    sc.places.forEach(function (pl) {
      if (pl.kind === 'look' || pl.kind === 'portal' || pl.npc) return;
      if (!memKeyOpen(pl)) return;                     /* v34 A1：记不在身上，脚下这盏灯不亮 */
      var fx = pl.x * CELL + CELL / 2, fy = pl.y * CELL + CELL / 2;
      var fg = ctx.createRadialGradient(fx, fy, 3, fx, fy, 64);
      fg.addColorStop(0, 'rgba(' + amb.warm + ',.16)'); fg.addColorStop(1, 'rgba(' + amb.warm + ',0)');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(fx, fy, 64, 0, Math.PI * 2); ctx.fill();
    });
    /* 玩家随身那盏灯：自己照亮脚下一圈（夜里 / 雾里更容易找到自己） */
    var lx = S.mx * CELL + CELL / 2, ly = S.my * CELL + CELL / 2;
    var lg = ctx.createRadialGradient(lx, ly, 5, lx, ly, 104);
    lg.addColorStop(0, 'rgba(' + amb.key + ',.22)'); lg.addColorStop(1, 'rgba(' + amb.key + ',0)');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(lx, ly, 104, 0, Math.PI * 2); ctx.fill();
    /* 灯下浮尘 */
    if (amb.dust) {
      for (var d = 0; d < 34; d++) {
        var dn = hash(d, 0, 7), dn2 = hash(d, 1, 9);
        var dxp = (dn * VW + Math.sin(t * 0.6 + d) * 16 + VW) % VW;
        var dyp = (dn2 * VH - t * (5 + dn * 9) + VH * 8) % VH;
        var da = 0.07 + 0.22 * (0.5 + 0.5 * Math.sin(t * 1.7 + d * 1.3));
        ctx.fillStyle = 'rgba(' + amb.warm + ',' + da.toFixed(2) + ')';
        ctx.fillRect(dxp, dyp, 2, 2);
      }
    }
    ctx.restore();
    /* ③ 雾带 / 风痕：这两样是"挡光"的，得压在光上面 */
    if (sc.ambient === 'fog') {
      if (global.ART31 && ART31.paintFog) {
        ART31.paintFog(ctx, sc, t, amb);       /* v31.2：硬边雾带（以前是 6 个 250px 渐变大团，放大全糊） */
      } else {
        for (var i = 0; i < 6; i++) {
          var fx2 = ((t * 11 + i * 190) % (VW + 420)) - 210;
          var gg = ctx.createRadialGradient(fx2, 110 + i * 96, 8, fx2, 110 + i * 96, 250);
          gg.addColorStop(0, 'rgba(214,224,238,.22)'); gg.addColorStop(1, 'rgba(214,224,238,0)');
          ctx.fillStyle = gg; ctx.fillRect(0, 0, VW, VH);
        }
      }
    }
    if (sc.ambient === 'wind') {
      if (global.ART31 && ART31.paintWind) {
        ART31.paintWind(ctx, sc, t);           /* v31.2：断续斜风痕（以前是 2px stroke 通栏直线） */
      } else {
        ctx.strokeStyle = 'rgba(230,235,240,.16)'; ctx.lineWidth = 2;
        for (var k = 0; k < 8; k++) {
          var yy = ((t * 90 + k * 97) % VH);
          ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(VW, yy + 30); ctx.stroke();
        }
      }
    }
    /* ③b 小怪和它们的弹丸：画在氛围层之上（雾里的东西本来就该浮在雾上） */
    if (global.MOBS23) {
      try { global.MOBS23.draw(ctx, CELL, softGlow); } catch (e) { /* ignore */ }
    }
    /* ④ 暗角：视线收到中间 */
    var vg = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.40, VW / 2, VH / 2, VW * 0.74);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.30)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
    /* ⑤ 标签和玩家最后画：字不被雾压糊，"我在哪儿"永远一眼看到 */
    sc.portals.forEach(function (p) { label(p.label || '出口', p.x, p.y, false); });
    var near = nearestPlace();
    if (near) {
      label(memNameOf(near), near.x, near.y, true);
      ctx.fillStyle = '#e0b25c'; ctx.font = 'bold 15px sans-serif';
      ctx.fillText('E', near.x * CELL + CELL + 8, near.y * CELL + 26);
    }
    if (shook) ctx.restore();
    /* 被咬的那一下：红边 + 三条错位的切片 —— "记被咬掉一口"得看得见 */
    if (shake > 0.01) {
      ctx.fillStyle = 'rgba(170,36,56,' + (0.10 + 0.30 * shake).toFixed(2) + ')';
      ctx.fillRect(0, 0, VW, VH);
      if (bg && ctx.drawImage && SCALE) {
        for (var g2 = 0; g2 < 3; g2++) {
          var yy2 = (hash(g2, Math.floor(S.t * 9), 3) * (VH - 40)) | 0, hh = 12 + hash(g2, 1, 4) * 26;
          ctx.drawImage(bg, 0, yy2 * SCALE, bg.width, hh * SCALE,
            (hash(g2, 2, 5) - 0.5) * 16, yy2, VW, hh);
        }
      }
    }
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
    if (global.ART31 && ART31.paintFigure) {
      /* v31.3：玩家也换成像素立绘（走路时 1px 上下颠，口径跟 NPC 一致） */
      ART31.paintFigure(ctx, 'you', S.mx, S.my, S.face, mv > 0.02 ? 1 : 0, t * 11);
    } else {
      drawFigure(ctx, S.mx, S.my, '#f3ead6', S.face, mv > 0.02 ? Math.abs(Math.sin(t * 11)) * 1.8 : 0, t * 11);
    }
    var bob = Math.sin(t * 3.4) * 2;
    ctx.fillStyle = 'rgba(255,228,150,.9)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 30 + bob); ctx.lineTo(cx - 6, cy - 40 + bob); ctx.lineTo(cx + 6, cy - 40 + bob);
    ctx.closePath(); ctx.fill();
  }

  /* ---------- 循环 ---------- */
  function update(dt) {
    if (shake > 0) shake = Math.max(0, shake - dt);
    S.t += dt;
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('scene-banner').classList.remove('on'); }
    if (actCardT > 0) { actCardT -= dt; if (actCardT <= 0) $('act-card').classList.remove('on'); }
    if (firstSightT > 0) {                        /* 初见那条：几秒后自己淡掉，把上沿还给引导纸 */
      firstSightT -= dt;
      if (firstSightT <= 0) {
        var fsEl = $('first-sight'); if (fsEl) fsEl.classList.remove('on');
        if (global.document && global.document.body) global.document.body.classList.remove('fs-on');
      }
    }
    if (lockCd > 0) lockCd -= dt;
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
      if (pp) {
        var lk = lockedBy(pp);
        if (lk) lockToast(lk, true);
        else { enterScene(pp.to, pp.tx, pp.ty); return; }
      }
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
    if (p && portalCd <= 0) {
      var lk = lockedBy(p);
      if (lk) { lockToast(lk, true); return; }        /* 锁着的门：人被挡住，但门得说话 */
      enterScene(p.to, p.tx, p.ty); return;
    }
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
    /* 谜题层的表（连环锁）：关着面板也走 —— 机关不会等你 */
    if (global.PUZZLES23 && global.PUZZLES23.tick) { try { global.PUZZLES23.tick(dt); } catch (e) { /* ignore */ } }
    /* 小怪：解谜的时候照走 —— 面板开着被摸到，一样丢记（用户要的就是这个"恶心"） */
    if (global.MOBS23) {
      try { global.MOBS23.update(dt); syncThreat(); } catch (e) { /* ignore */ }
    }
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
    if (k === 'f' || k === 'F') { pourOil(); e.preventDefault(); return; }   /* 面板开着也能泼 */
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
      '<div class="arc-h">状态</div><div class="arc-item">' + JSON.stringify({ scene: S.scene, act: S.act, gold: S.gold, oil: S.oil == null ? 2 : S.oil, tasks: doneCount(), photos: D.photoCount(S), flags: Object.keys(S.flags).length }) + '</div>' +
      '<div class="dv-sec">谜题直达（自动补齐前置）</div>' +
      '<div class="dv-list">' + devPuzzleRows() + '</div>' +
      '<div class="dv-sec">记忆 · 点一条翻状态</div>' +
      '<div class="pz-row"><button class="pz-btn" data-dev="mem0">全部归零</button>' +
      '<button class="pz-btn" data-dev="memall">全部恢复</button></div>' +
      '<div class="dv-list">' + devMemRows() + '</div>' +
      '<div class="dv-sec">旗标 · 点一条翻转</div>' +
      '<div class="pz-row"><button class="pz-btn" data-dev="snap">记快照</button>' +
      '<button class="pz-btn" data-dev="rollback">回滚旗标</button></div>' +
      '<div class="dv-list">' + devFlagRows() + '</div>' +
      '<div class="dv-sec">便利</div>' +
      '<div class="pz-row"><button class="pz-btn" data-dev="oil">灯油 +5</button>' +
      '<button class="pz-btn" data-dev="gold">+10 当金</button>' +
      '<button class="pz-btn" data-dev="inf">无限灯油：' + (DEVM.inf ? '开' : '关') + '</button></div>';
    body.querySelectorAll('[data-jump]').forEach(function (b) {
      b.onclick = function () { devJump(+b.getAttribute('data-jump')); };
    });
    body.querySelectorAll('[data-scene]').forEach(function (b) {
      b.onclick = function () { enterScene(b.getAttribute('data-scene')); toggleDev(); };
    });
    body.querySelectorAll('[data-dev]').forEach(function (b) {
      b.onclick = function () { devAction(b.getAttribute('data-dev')); };
    });
    body.querySelectorAll('[data-pz]').forEach(function (b) {
      b.onclick = function () { var v = b.getAttribute('data-pz').split('|'); devGoto(v[0], v[1]); };
    });
    body.querySelectorAll('[data-mem]').forEach(function (b) {
      b.onclick = function () { devMemCycle(b.getAttribute('data-mem')); };
    });
    body.querySelectorAll('[data-flag]').forEach(function (b) {
      b.onclick = function () { devFlagToggle(b.getAttribute('data-flag')); };
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
    if (a === 'oil') { S.oil = (S.oil == null ? 2 : S.oil) + 5; toast('灯油 +5'); }
    if (a === 'inf') { DEVM.inf = !DEVM.inf; toast('无限灯油：' + (DEVM.inf ? '开' : '关')); }
    if (a === 'mem0') { (D.MEM23 || []).forEach(function (m) { devMemSet(m.id, 'pawned', 0); }); toast('全部记忆归零'); }
    if (a === 'memall') { (D.MEM23 || []).forEach(function (m) { devMemSet(m.id, 'held', 0); }); dirty.mem = dirty.arch = 1; bgDirty = true; toast('全部记忆恢复'); }
    if (a === 'snap') { devSnap(); toast('旗标快照已记（' + DEVM.snapN + ' 条）'); }
    if (a === 'rollback') { devRollback(); return; }
    if (a === 'ending') { S.act = 5; D.PHOTOS.forEach(function (p) { S.photos[p.id] = 1; }); ending('true_name'); }
    if (a === 'wipe') { try { store().removeItem(SAVE_KEY); store().removeItem(CHECK_KEY); } catch (e) { /**/ } clearGuide(); S = freshState(); enterScene('lighthouse'); }
    dirty.hud = dirty.tasks = dirty.album = dirty.arch = 1; dirty.mem = 1;
    renderDev();
    save();
  }
  /* ============ v34 B：开发者面板（用户痛点：解谜玩得慢，来不及体验）============
     B5：DEVM **不进存档** —— 它是闭包里的，pack() 里没有它，刷新 / 开新档就回默认；
     面板默认不显示（顶栏 DEV / 反引号 / F2 唤出），不挡正常玩法。 */
  var DEVM = { inf: false, snap: null, snapN: 0 };
  function devAllPlaces() {
    var out = [];
    Object.keys(D.SCENES).forEach(function (sid) {
      (D.SCENES[sid].places || []).forEach(function (p) { out.push({ sid: sid, p: p }); });
    });
    return out;
  }
  /* B1：列出全部谜题节点（按幕分组），点了直达 —— 前置旗标沿 need 链自动补齐 */
  function devPuzzleRows() {
    var html = '', last = -1;
    devAllPlaces().filter(function (e) { return e.p.kind === 'puzzle'; })
      .sort(function (a, b) { return (D.SCENES[a.sid].act || 0) - (D.SCENES[b.sid].act || 0); })
      .forEach(function (e) {
        var act = D.SCENES[e.sid].act || 0;
        if (act !== last) { html += '<div class="dv-sub">第 ' + act + ' 幕 · ' + D.SCENES[e.sid].name + '</div>'; last = act; }
        html += '<button class="dv-row" data-pz="' + e.sid + '|' + e.p.id + '">' + (e.p.name || e.p.id) +
          '<i>' + (S.flags[e.p.flag] ? '已过' : '未过') + '</i></button>';
      });
    return html || '<div class="dv-sub">（没有谜题点）</div>';
  }
  function devPuzFlag(p) {          /* 引擎 solvePuzzle 那套命名（game23 1136 行）：谜题解完置的旗标 */
    if (p.flag) return p.flag;
    var z = p.puz;
    if (z === 'read_book') return 'book_read';
    if (z === 'three_asks') return 'asks_ok';
    return z + '_ok';
  }
  /* 旗标是谁给的：① 点位自己的 flag ② 这个点上的谜题解开会给的 flag。
    （第一版只认 ①，实测"直达连环锁"时链断在第一层 —— asks_ok 是谜题给的，不是点位给的。）*/
  function devFlagSrc(F) {
    var all = devAllPlaces(), i;
    for (i = 0; i < all.length; i++) if (all[i].p.flag === F) return all[i];
    for (i = 0; i < all.length; i++) if (all[i].p.puz && devPuzFlag(all[i].p) === F) return all[i];
    return null;
  }
  function devNeedChain(flag, seen) {           /* 沿 need 链把前置一个个补上（谜题给的旗标也得认）*/
    if (!flag || S.flags[flag] || seen[flag]) return;
    seen[flag] = 1;
    var src = devFlagSrc(flag);
    if (src) { devNeedChain(src.p.need, seen); S.seen[src.p.id] = 1; }
    S.flags[flag] = 1;
  }
  function devGoto(sid, pid) {
    var sc = D.SCENES[sid]; if (!sc) { toast('没有这个场景。'); return; }
    var p = (sc.places || []).filter(function (q) { return q.id === pid; })[0];
    if (!p) { toast('没有这个点。'); return; }
    var act = sc.act || 1;
    D.TASKS.forEach(function (t) { if (t.act < act) { S.tasks[t.id] = 1; S.flags[t.flag] = 1; } });
    devNeedChain(p.need, {});
    awardPhotos();
    S.maxAct = Math.max(S.maxAct || 1, act); S.act = act;
    enterScene(sid, p.x, p.y);
    dirty.hud = dirty.tasks = dirty.arch = dirty.mem = 1;
    toggleDev();
    toast('已直达：' + (p.name || pid));
  }
  /* B2：记忆 —— 归零 / 恢复 / 单条四态循环（有 → 当出 → 半碎 → 咬碎） */
  function devMemSet(id, st, hurt) {
    if (!S.mem) S.mem = {};
    /* v34c：别删条目 —— 游戏自己的口径是"每条记都有条目"（story23 建 S.mem 时逐条写）。
       删了会掉进"表里没有这条记"的缝，memLinkedSay 会误判成失忆态。 */
    S.mem[id] = { state: st, hurt: hurt || 0, pawns: (S.mem[id] && S.mem[id].pawns) || 0 };
    dirty.mem = dirty.arch = 1;
    bgDirty = true;   /* v34：底图是预烘焙的，记忆一变就得重烘，"画暗"才不是陈旧画面 */
  }
  function devMemRows() {
    return (D.MEM23 || []).map(function (m) {
      var st = (S.mem && S.mem[m.id]) || {}, s = st.state || 'held', h = st.hurt || 0;
      var lbl = s !== 'held' ? '当出' : (h >= 2 ? '咬碎' : (h === 1 ? '半碎' : '有'));
      return '<button class="dv-row" data-mem="' + m.id + '">' + (m.tag || m.id) + '<i>' + lbl + '</i></button>';
    }).join('');
  }
  function devMemCycle(id) {
    var st = (S.mem && S.mem[id]) || {}, s = st.state || 'held', h = st.hurt || 0;
    if (s === 'held' && h === 0) devMemSet(id, 'pawned', 0);
    else if (s === 'pawned') devMemSet(id, 'held', 1);
    else if (h === 1) devMemSet(id, 'held', 2);
    else devMemSet(id, 'held', 0);
    renderDev();
  }
  /* B3：旗标 —— 能看、能翻、能回滚 */
  function devFlagRows() {
    var ks = Object.keys(S.flags || {}).sort();
    var tail = '';
    if (ks.length > 26) { tail = '<div class="dv-sub">…（' + (ks.length - 26) + ' 条更早的略）</div>'; ks = ks.slice(-26); }
    return tail + ks.map(function (k) {
      return '<button class="dv-row' + (S.flags[k] ? ' on' : '') + '" data-flag="' + k + '">' + k +
        '<i>' + (S.flags[k] ? '1' : '0') + '</i></button>';
    }).join('');
  }
  function devSnap() { DEVM.snap = JSON.stringify(S.flags || {}); DEVM.snapN = Object.keys(S.flags || {}).length; }
  function devFlagToggle(k) {
    if (!DEVM.snap) devSnap();
    S.flags[k] = S.flags[k] ? 0 : 1;
    dirty.hud = dirty.tasks = dirty.arch = dirty.mem = 1;
    renderDev(); save();
  }
  function devRollback() {
    if (!DEVM.snap) { toast('还没记过快照。'); return; }
    var old = JSON.parse(DEVM.snap);
    Object.keys(S.flags).forEach(function (k) { if (!(k in old)) delete S.flags[k]; });
    Object.keys(old).forEach(function (k) { S.flags[k] = old[k]; });
    dirty.hud = dirty.tasks = dirty.arch = dirty.mem = 1;
    renderDev(); save();
    toast('旗标已回滚');
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
  var GAME = { booted: false, get S() { return S; }, D: D, fresh: freshState, pack: pack, solvePuzzle: solvePuzzle, PHOTO_RULES: PHOTO_RULES, SCENE_FLAG: SCENE_FLAG, DERIVED: DERIVED, interact: interact, markFlag: markFlag, forceClose: forceClose, dlgOpen: function () { return !!dlg; }, artOf: artOf, gatePlan: gatePlan, PLACE_ART: PLACE_ART, GATE_STYLE: GATE_STYLE,
    damageMemory: damageMemory, puzzleWrong: puzzleWrong, puzzleSolved: puzzleSolved,
    pourOil: pourOil, runLegs: runLegs, legAt: legAt, legHintOf: legHintOf, legRoute: legRoute,
    OIL: { r: OIL_R, t: OIL_T, price: OIL_PRICE },
    memHurt: memHurt, damagedMem: damagedMem, fuzzyText: fuzzyText, fixCost: fixCost,
    jolt: jolt, lightTiles: lightTiles, MOBS: function () { return global.MOBS23 || null; },
    QUALITY: { scaleCap: SCALE_CAP, scale: function () { return SCALE; }, setup: setupCanvas, amb: AMB, ambOf: ambOf, VW: VW, VH: VH } };
  global.GAME23 = GAME;

  function boot() {
    canvas = $('world'); ctx = canvas.getContext('2d');
    setupCanvas();
    window.addEventListener('resize', function () { setupCanvas(); });
    var q = global.location && global.location.search || '';
    if (q.indexOf('fresh=1') >= 0) { try { store().removeItem(SAVE_KEY); store().removeItem(CHECK_KEY); } catch (e) { /**/ } clearGuide(); }
    S = load() || freshState();
    purgeMemLog();     /* 老存档里已经抄进日志的正文，进游戏就先抹一次 */
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
    /* 版本提示只弹一次：弹过留记号；已经在玩这一趟（有进度）就再也不提"从头开始" */
    var legacy = legacyNotice() && !legacyAcked() && !S.introDone;
    enterScene(S.scene, S.x, S.y, { silent: true });
    if (legacy) {
      ackLegacy();
      say(['（检测到旧版的存档：那是另一个岛的故事，这一趟从头开始。）'], null, { title: '版本提示' });
    }
    if (!S.introDone && !legacy) {
      S.introDone = true; save();
      say(D.TEXT.prologue.slice(), function () { banner(scene().name, scene().sub); }, { title: '记忆当铺 · 归潮屿', end: '点亮灯' });
    }
    dirty.hud = dirty.log = dirty.tasks = dirty.album = dirty.arch = 1; dirty.mem = 1;
    raf = requestAnimationFrame(loop);
    window.PAWN_DEBUG = {
      S: S, D: D,
      /* v33 判据面：分类 / 名字门控 / 派生总量（探针与回归只读） */
      mem: { link: MEM_LINK, lostName: LOST_NAME, lostSay: LOST_SAY, nameOf: memNameOf, known: memKnown,
             total: memTotalW, cats: CAT_ORDER, catCn: CAT_CN,
             keyGate: KEY_GATE, keyOf: memKeyOf, keyOpen: memKeyOpen, alt: memAlt },
      dev: { state: DEVM, goto: devGoto, memSet: devMemSet, memCycle: devMemCycle,
             flagToggle: devFlagToggle, snap: devSnap, rollback: devRollback, action: devAction,
             pour: pourOil,
             rows: function () { return $('dev-body').innerHTML; } },
      api: {
        enter: enterScene, flag: markFlag, solve: solvePuzzle, ending: ending, say: say,
        get state() { return S; }, interact: interact, modalOpen: function () { return modalOpen; },
        setPos: function (x, y) { S.x = S.tx = x; S.y = S.ty = y; S.mx = x; S.my = y; S.mt = 0; }
      }
    };
  }
  function loadFrom(o) {
    /* 老存档没有这两个字段：补默认，别让跑腿任务 / 灯油变成 undefined */
    S.legs = (o && o.legs) || {};
    S.oil = (o && o.oil == null) ? 2 : o.oil;
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
      wrong: puzzleWrong, harm: function (n, why) { return damageMemory(n || 1, why); },
      isOpen: function () { return modalOpen; }, openModal: openModal,
      refresh: function () { dirty.hud = dirty.tasks = dirty.album = 1; dirty.mem = 1; refreshPanels(); }
    };
  }

  /* 起页：DOMContentLoaded 之前调用会等一等；测试可以轮询 GAME23.booted */
  function start() {
    if (GAME.booted) return;
    PUZZLES23.attach(puzzleHost());
    boot();
    /* 小怪的接线要等 boot() 把 D / S 装好 —— 早一步挂在 D 上是 null，整页就起不来了 */
    if (global.MOBS23) {
      global.MOBS23.attach({
        player: function () { return { x: S.mx, y: S.my }; },
        solid: function (x, y) { return solid(x, y); },
        shadow: shadowUnder,
        panelOpen: function () { return modalOpen; },      /* 面板开着：怪敢进灯圈、敢隔着面板咬 */
        /* 例外（用户 2026-10-12）：解最后那道连环锁的时候，别让他挨打 ——
           这道锁一百秒、五枚环，手忙脚乱的时候还被咬一口不叫难，叫欺负人。
           只认连环锁这一个面板（PUZZLES23.current() 在面板合上时会被清空）。 */
        grace: function () {
          try { return !!(global.PUZZLES23 && global.PUZZLES23.current && global.PUZZLES23.current() === 'chainlink'); }
          catch (e) { return false; }
        },
        hit: function (K, how) {
          toast((how === 'touch' ? K.name + '贴上来摸了你一下' : K.name + '朝你吐了一口') + ' —— 咬走一段记。');
          biteFlash(K);                                    /* 面板挡着看不见画布：抖一下面板本身 */
          damageMemory(1, 'mob:' + K.id);
        },
        wake: function (K) {
          addLog('雾里抬头了：' + K.name);
          /* 初见那一拍：屏幕上沿弹一次「它是什么、怎么反制」，并记进存档只此一次；
             往后再抬头就只剩 toast 那一句（用户 2026-10-12：不要母亲那句，初见弹一个提示即可）。 */
          if (S.flags && !S.flags.met_wuyi) { S.flags.met_wuyi = 1; firstSight(K); save(); }
          else toast('雾里抬头了：' + K.name + '。它在往你这边挪 —— 灯下它不敢进。');
        },
        spit: function () { sfx('blip'); }
      });
      global.MOBS23.spawnFor(S.scene, S.act);
      syncMobs();
    }
    GAME.booted = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof window !== 'undefined' ? window : globalThis);
