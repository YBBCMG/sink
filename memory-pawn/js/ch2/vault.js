/* 《记忆当铺》二章 · 记忆库 26 容器（A–Z）＋ 当金收支 —— 逻辑层
   ── B 线（玩法）出，中枢 2026-10-17 解禁 · 期 1「只库房」。判据：tools/verify-ch2vault.mjs（29 条）。

   ── 用户原话（逐字，不改一个字）：
      「首先就这个记忆怎么收，怎么保留，这个部分是要补第一张的坑的，可以做一个容器，一共 26 个容器名字是
       A 到 Z。难点在于你可能会忘了那个容器装的是谁的记忆，是那条记忆。但是别人来买的时候，你必须精准找出
       来，连续三次找错了，就会让店面亏损当金。亏没了就是坏结局。初始有一点，然后通过各种方式来买东西赚
       差价获得。亏钱的方式应该不是这一条，增加一些亏钱和赚钱的方式。」
      「我们这几个储存记忆的容器是不许重命名的，就是要玩家记忆力足够好才行。」
      「38 段又不是每时每刻都有 38 段，可以进来几个，然后出去再卖出去。」

   ── 四条一条也不许改的地基（改一条玩法当场塌）：
     ① **26 格 A–Z，不许改名、不许加备注、不许贴标签**（用户原话）。玩家只能靠自己的记性把"格号"和
        "谁的记"对上 —— 只要容器能被命名，玩家就把柜子变成自己的笔记本，26 格沦为装饰。
     ② **一格一段**：满了就进不去（不是排队，是"你得先卖出去一件"）。
     ③ **格号不复用**：货出手了，那格空着、号还留着、位置不动。空了也是线索。
     ④ **账本＝只记元数据的手账**：自动记 格号/入库日/封条色/重量档/货主代号；**客人的那句话与记的内容
        一个字都不记**（口径 A）。想留更多，玩家自己在纸上记 —— 难度是"注意力与人味"，不是背单词。

   ── 与美术线（js/ch2/art.js）的分界：**我只给坐标，不画一笔**。
      `cells()` 报的 26 格坐标跟 A 线 `verify-vault-noname.mjs` 读的 CELLS 表是同一张（中排 A–M / 下排 N–Z，
      架板 y=232 / 376，每排 13 只，pitch = (576-12)/13）。封条色只表批次（`floor(格号/3)%4`，四色四批）——
      **它不是身份线索**：一旦让颜色能区分货主，"看一眼颜色对号"就成立，提示分级与整个难度链当场作废。

   ── 跟引擎的接口：**零**。本模块只碰 `global.CH2` / `global.CH2_ART` 的只读面 + 宿主递进来的 host
      （`ch2Host()` 那个对象）。**`js/game23.js`、`index.html`、`js/ch2/scenes.js`、`js/ch2/index.js`
       一个字节不碰** —— 柜子挂上去走的是"包一层 CH2.open"，跟 art.js 包 ART31 是同一个手法。 */
(function (global) {
  'use strict';

  /* ============================================================
     一、常量（口径全在这里，改数值不用翻正文）
     ============================================================ */
  var V = 'ch2_vault';                                   /* 本模块只管这一张图 */
  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  /* 火漆四色＝四批（**必须与 js/ch2/art.js 的 WAX 逐字一致**；那边是画、这边是账，色号一处定义两处用） */
  var WAX = ['#a8322a', '#96602a', '#2f6a68', '#6a4276'];
  var COUNT = 26;

  var PEN_MIN = 4, PEN_MAX = 12;                          /* 单次认错扣的当金区间（§3.2） */
  var STRIKE = 3;                                         /* 连错几次掉一块招牌（§3.1） */
  var HINT_COST = [4, 8, 16];                             /* 问伙计三级阶梯（§3.4）：三问合计 28 < 三连错上限 36 */
  var GOLD_BOOT = 40;                                     /* 开局底金（§4）：够买柜台四件（24 枚）后余 16 */
  var LOW_GOLD = 5;                                       /* 软破产线（§3.3） */
  var LOW_DAYS = 3;                                       /* 连着几个营业日低于软线 → 坏结局 */
  var BAD_ID = 'e5_bad';                                  /* 坏结局编号（56-3 拍板：单独编，不占一章那 4 个） */

  var LIB = 'ch2_vault';                                  /* 库房那串账（设计 §8 定的键名） */
  /* 本模块允许写进档的旗标白名单（判据 C11-a 拿它当尺子） */
  var WKEYS = [LIB, 'ch2_salvage_n', 'ch2_bad_fault', 'ch2_shop_lv', 'ch2_hint_n',
               'ch2_lowd', 'ch2_e5_bad', 'ch2_lastday', 'ch2_gold_boot', 'ch2_seen'];

  /* 一格的行字段白名单（判据 C2-a 拿它当尺子）。**没有可命名语义的字段** —— 这是 V7-a。 */
  var FIELDS = ['slot', 'date', 'batch', 'weight', 'owner', 'tainted', 'occupied'];

  /* ============================================================
     二、工具
     ============================================================ */
  function S_(s) { return s || (global.PAWN_DEBUG && global.PAWN_DEBUG.S) || null; }
  function fl(s) { s = S_(s); return (s && s.flags) || {}; }
  function fget(s, k) { var v = fl(s)[k]; return v == null ? null : v; }
  function fset(h, k, v) {
    var s = S_(h && h.S ? h.S : null);
    if (!s) return v;
    s.flags = s.flags || {};
    s.flags[k] = v;
    if (h && h.save) h.save();
    return v;
  }
  function sealColor(batch) { return WAX[batch % WAX.length]; }
  function num(v, d) { v = parseInt(v, 10); return isNaN(v) ? d : v; }
  function txt(host, msg) { if (host && host.toast) host.toast(msg); }

  /* ============================================================
     三、那串账：一格一段，行字段只有白名单那七个
     ============================================================ */
  /* 库房那串账＝26 行，按格号 A→Z 的顺序；空格的 owner 是空串（**空罐不让号**）。 */
  function decode(raw) {
    return String(raw == null ? '' : raw).split('|').filter(function (x) { return x !== ''; }).map(function (p) {
      var b = p.split(':');
      return {
        slot: num(b[0], 0), date: num(b[1], 1), batch: num(b[2], 0), weight: num(b[3], 0),
        owner: b[4] == null ? '' : String(b[4]),
        tainted: b[5] === '1', occupied: (b[5] || '0').charAt(1) === '1'
      };
    });
  }
  function encode(rows) {
    return rows.map(function (r) {
      return [r.slot, r.date, r.batch, r.weight,
              r.owner == null ? '' : r.owner,
              (r.tainted ? '1' : '0') + (r.occupied ? '1' : '0')].join(':');
    }).join('|');
  }
  function rows(s) { return decode(fget(s, LIB)); }
  /* 空格子＝还没上过货的格子。**只给上过货的 26 行建账**，没上货的格子连行都不占。 */
  function slotRow(s, slot) {
    return rows(s).filter(function (r) { return r.slot === slot; })[0] || null;
  }
  function emptyRow(slot) {
    return { slot: slot, date: 0, batch: Math.floor(slot / 3) % 4, weight: 0, owner: '', tainted: false, occupied: false };
  }
  /* 一格一段：账目里每格最多一条。判据 C1-b/C1-c/C14-a 都钉这条。
     ⚠️ 这里收的是**状态 s**，不是 host —— `rows()` 吃的是 s。2026-10-17 踩过：
     写成 `rows(host)` 会读出空串，于是每存一件都把上一件覆盖掉（判据 C1-b/C9-a 逮到）。 */
  function putRow(s, row) {
    var all = rows(s);
    var hit = -1;
    all.forEach(function (r, i) { if (r.slot === row.slot) hit = i; });
    if (hit >= 0) all[hit] = row; else all.push(row);
    all.sort(function (a, b) { return a.slot - b.slot; });
    fset({ S: s, save: function () {} }, LIB, encode(all));
    return row;
  }
  function firstEmpty(s) {
    var used = {};
    rows(s).forEach(function (r) { if (r.occupied) used[r.slot] = 1; });
    for (var i = 0; i < COUNT; i++) if (!used[i]) return i;
    return -1;
  }
  function copies(s) {
    var n = 0;
    rows(s).forEach(function (r) { if (r.occupied) n++; });
    return n;
  }

  /* ============================================================
     四、26 格的坐标（跟 A 线 art.js 的 jarRow 同一张表；这里只报数、不画）
     ============================================================ */
  var ROW = { x0: 192 + 6, w: 576, n: 13, jw: 34, jh: 36, top: 232, bottom: 376, pad: 7 };
  function cells() {
    var out = [], i, r, k, pitch = (ROW.w - 12) / ROW.n, kk;
    for (r = 0; r < 2; r++) {
      var y0 = r === 0 ? ROW.top : ROW.bottom;
      for (i = 0; i < ROW.n; i++) {
        kk = r * ROW.n + i;
        out.push({ k: kk, id: LETTERS[kk], letter: LETTERS[kk],
                   x: Math.round(ROW.x0 + i * pitch + (pitch - ROW.jw) / 2),
                   y: y0 + ROW.jh - 7, w: ROW.jw, h: ROW.jh });
      }
    }
    return out;
  }
  /* 格子状态：账上那份 + 铜牌刻的号 + 封条色 + 空满。**空满＝账上有没有货，不是单独一个开关。**
     封条色按批次（三格一批），跟 art.js 逐字同一条算法 —— 判据拿两边对拍。 */
  function cellState(s) {
    var base = cells(), all = rows(s), by = {};
    all.forEach(function (r) { by[r.slot] = r; });
    return base.map(function (c) {
      var r = by[c.k];
      return { k: c.k, id: c.id, letter: c.id, x: c.x, y: c.y, w: c.w, h: c.h,
               wax: sealColor(Math.floor(c.k / 3) % 4),
               sealed: !!(r && r.occupied), occupied: !!(r && r.occupied) };
    });
  }

  /* ============================================================
     五、四个动作：存 / 取 / 翻 / 丢
     ============================================================ */
  /* 收当上架造的那一行（`o` 只吃 货主代号/日期/重量档/串味 —— **o.why（客人那句话）与 o.seam（原文）
     在这函数里一个字符都不出现**，判据 C13-b 就是拿源码切这个函数体验口径 A 的）。
     `seal` 是给判据造"同批三件"用的显式批次（正常收当不许传）—— 颜色永远归批次，不归人。 */
  function rowOf(slot, o) {
    return {
      slot: slot, date: num(o.d, 1),
      batch: o.seal == null ? Math.floor(slot / 3) % WAX.length : (num(o.seal, 0) % WAX.length),
      weight: num(o.w, 0),
      owner: o.o == null ? '' : String(o.o),
      tainted: !!o.taint,
      occupied: true
    };
  }
  /* ① 存（收当上架）：o = { o:货主代号, d:入库日, w:重量档＝这段记的当金值, day, taint, seal } */
  function store(host, o) {
    o = o || {};
    var s = S_(host && host.S ? host.S : null);
    var slot = firstEmpty(s);
    if (slot < 0) { txt(host, '架上一格空位都没有了 —— 先出一件货。'); return { ok: false, msg: 'full' }; }
    var row = rowOf(slot, o);
    /* **客人的那句话（o.why）与记的原文（o.seam）只进日志，一行都不进账** —— 口径 A。 */
    putRow(s, row);
    if (host && host.save) host.save();
    if (host && host.addLog) host.addLog('（库房）上架 ' + LETTERS[slot] + ' —— ' + row.date + ' 日入，'
      + (row.tainted ? '带串味' : '无串味') + '。');
    if (host && host.sfx) host.sfx('coin');
    return { ok: true, slot: slot, id: LETTERS[slot], row: row, copies: copies(s) };
  }

  /* ② 取（认格）：key = 玩家指的格号。对＝收息放货；错＝扣当金 + 连错 +1。 */
  function take(host, key, want, opt) {
    opt = opt || {};
    var s = S_(host && host.S ? host.S : null);
    var k = typeof key === 'string' ? LETTERS.indexOf(key.toUpperCase()) : num(key, -1);
    if (k < 0 || k > 25) return { ok: false, right: false, msg: 'bad-slot' };
    var row = slotRow(s, k);
    var out = { ok: true, right: false, pay: 0, degraded: false, over: false, slot: k, id: LETTERS[k] };

    if (row && row.occupied && (want == null || want === k)) {
      /* 认对了：过手、收息、清零连错。**取对是给玩家的呼吸口**（§3.1）。 */
      row.occupied = false; row.owner = '';        /* 号留着、位置不动 —— 格号不复用 */
      putRow(s, row);
      fset(host, 'ch2_salvage_n', 0);
      out.right = true; out.gold = s ? s.gold : 0;
      if (host && host.addLog) host.addLog('（库房）从 ' + LETTERS[k] + ' 取货，认对了。连错清零。');
      if (host && host.sfx) host.sfx('open');
      if (opt.render) renderTake(host, k, true);
      return out;
    }

    /* 认错：这份钱是被"记性"罚掉的，不是被剧情罚掉的。 */
    var pen = penalty((row && row.weight) || 0);
    out.pay = pen;
    if (s) { s.gold = (s.gold || 0) - pen; if (s.gold < 0) s.gold = 0; }
    var n = num(fget(s, 'ch2_salvage_n'), 0) + 1;
    /* 同一个班次里累计；错满三次掉一块招牌、计数归零（**语义是"掉招牌"，不是"错三次就死"**） */
    if (n >= STRIKE) {
      fset(host, 'ch2_salvage_n', 0);
      fset(host, 'ch2_shop_lv', num(fget(s, 'ch2_shop_lv'), 0) + 1);
      out.degraded = true;
      if (host && host.addLog) host.addLog('（库房）连错三次 —— 铺子降了一级。');
    } else {
      fset(host, 'ch2_salvage_n', n);
    }
    if (host && host.addLog) host.addLog('（库房）认错了格：' + LETTERS[k] + ' 不是。扣 ' + pen + ' 枚当金。');
    if (host && host.sfx) host.sfx('hurt');
    out.over = broke(host);
    if (opt.render) renderTake(host, k, false);
    return out;
  }

  /* ③ 翻（不看内容地翻）：翻账不要钱，**但一格一格翻** —— 26 格就是 26 次按键。
     ⚠️ 这一面返回给玩家的文本**不带 `owner`**：用户 2026-10-17 口径「直到交易之前都不会显示名字，
     只会显示罐子的代号」。`owner` 代号留在账（存档）里，但**不上玩家的面**。 */
  function look(s, k) {
    var row = slotRow(s, k);
    if (!row) return { slot: k, id: LETTERS[k], empty: true, line: LETTERS[k] + ' 空罐 · 封条 ' + sealColor(Math.floor(k / 3) % 4) };
    return { slot: k, id: LETTERS[k], empty: !row.occupied, row: row,
             line: LETTERS[k] + ' · ' + row.date + ' 日入 · 封条 ' + sealColor(row.batch)
                 + ' · 重 ' + row.weight + ' 档 · ' + (row.tainted ? '带串味' : '无串味')
                 + ' · 「…」' };
  }
  /* 账房只给元数据，内容那一栏**永远是「…」**（口径 A 的正面表达）。 */
  function ledger(s) { return rows(s).slice(); }

  /* 丢（出手 / 断当）：不是"删掉"，是"这格腾出来"。日志留痕。 */
  function drop(host, k, why) {
    var s = S_(host && host.S ? host.S : null);
    var row = slotRow(s, k);
    if (!row || !row.occupied) return { ok: false, msg: 'nothing' };
    row.occupied = false; row.owner = '';
    putRow(s, row);
    if (host && host.save) host.save();
    if (host && host.addLog) host.addLog('（库房）' + LETTERS[k] + ' 出手了（' + (why || '卖') + '）。号还留着。');
    return { ok: true, slot: k, id: LETTERS[k] };
  }

  /* ============================================================
     六、账房（钱）
     ============================================================ */
  /* 单次认错扣额：clamp(round(当金值 × 1/3), 4, 12)。痛感＝价（一章原句「当金＝这段记的痛感」）。 */
  function penalty(w) { var v = Math.round((w || 0) / 3); return Math.max(PEN_MIN, Math.min(PEN_MAX, v)); }

  /* 开局底金：当铺得有本钱。只补到 40，**不动一章的账**（一章的 gold 是另一条线的钱）。 */
  function bootGold(host) {
    var s = S_(host && host.S ? host.S : null);
    if (!s) return { ok: false };
    if (fget(s, 'ch2_gold_boot')) return { ok: true, booted: true, gold: s.gold };
    if ((s.gold || 0) < GOLD_BOOT) s.gold = GOLD_BOOT;
    fset(host, 'ch2_gold_boot', 1);
    return { ok: true, booted: false, gold: s.gold };
  }

  /* 问伙计（花钱买提示）：三级阶梯 4 / 8 / 16。
     **买提示不清连错计数** —— 否则 4 枚就能洗白一次错，整个惩罚形同虚设（§3.1）。 */
  function hint(host, slot) {
    var s = S_(host && host.S ? host.S : null);
    var n = num(fget(s, 'ch2_hint_n'), 0);
    if (n >= 3) return { ok: false, msg: 'done', tier: 3, cost: 0 };
    var cost = HINT_COST[n];
    if ((s.gold || 0) < cost) { txt(host, '当金不够 —— 问一趟要 ' + cost + ' 枚。'); return { ok: false, msg: 'poor', cost: cost }; }
    s.gold -= cost;
    fset(host, 'ch2_hint_n', n + 1);
    /* 三级：半区（含正主）/ 三格（含正主）/ 直接报格号。**一级也不许报废话** —— 花钱不买废话。 */
    var half = slot < 13 ? 0 : 13;
    var out = { ok: true, tier: n + 1, cost: cost, slot: slot, id: LETTERS[slot] };
    if (n === 0) { out.slots = []; for (var i = half; i < half + 13; i++) out.slots.push(i); out.text = '「那件……在那排的 ' + LETTERS[half] + ' 到 ' + LETTERS[half + 12] + ' 里，我只能说这么多。」'; }
    else if (n === 1) { out.slots2 = [Math.max(0, slot - 1), slot, Math.min(25, slot + 1)]; out.text = '「三只里有一只，我猜是中间那个位置。」'; }
    else { out.text = '「' + LETTERS[slot] + '。别问我怎么知道的，我天天擦架子。」'; }
    if (host && host.addLog) host.addLog('（账房）问伙计一趟，花 ' + cost + ' 枚。');
    if (host && host.sfx) host.sfx('coin');
    return out;
  }
  /* 提示阶梯按天重置：一天三问，问完等明天（否则一夜之间问穿柜子）。 */
  function tickDay(host) {
    var s = S_(host && host.S ? host.S : null);
    fset(host, 'ch2_lastday', num(fget(s, 'ch2_lastday'), 0) + 1);
    fset(host, 'ch2_hint_n', 0);
    var out = { day: num(fget(s, 'ch2_lastday'), 1), over: false, gold: s ? s.gold : 0 };
    if ((s.gold || 0) < LOW_GOLD) {
      var d = num(fget(s, 'ch2_lowd'), 0) + 1;
      fset(host, 'ch2_lowd', d);
      out.lowd = d;
      /* 软破产：连着三个营业日连灯油都买不起 —— 铺子事实上停摆了（§3.3）。 */
      if (d >= LOW_DAYS) out.over = bad(host);
    } else {
      fset(host, 'ch2_lowd', 0);
      out.lowd = 0;
    }
    return out;
  }
  /* 硬破产：当金归零。**两条路都通往同一个坏结局**，但只剩一条命（判据 C8-a/C8-b 各一个）。 */
  function broke(host) {
    var s = S_(host && host.S ? host.S : null);
    if (!s) return false;
    if ((s.gold || 0) <= 0) return bad(host);
    return false;
  }
  /* 坏结局：**只走 host.ending('e5_bad') 一个入口**，并且只报一次 —— 引擎那边一条线都不加。 */
  function bad(host) {
    var s = S_(host && host.S ? host.S : null);
    if (!s) return false;
    if (fget(s, 'ch2_e5_bad')) return true;
    fset(host, 'ch2_e5_bad', 1);
    if (host && host.addLog) host.addLog('（当铺）当金空了 —— 招牌盘给总号。');
    if (host && host.ending) host.ending(BAD_ID);
    return true;
  }

  /* ============================================================
     七、四个动作的"面"（数据面，给宿主渲染；**本模块直接建 DOM 一个字节都不许有**）
     ============================================================ */
  /* 玩家面只报账上那四样元数据：**入库日 / 封条色 / 重量档 / 串味** —— 不报货主、不报内容。
     用户口径（2026-10-17）：「直到交易之前都不会显示名字，只会显示罐子的代号」。 */
  function bodyFor(s, k) {
    var L = look(s, k);
    var meta = L.empty ? '空罐 · 号还留着（格号不复用）'
      : '入库 ' + L.row.date + ' 日 · 封条 ' + sealColor(L.row.batch) + ' · 重 ' + L.row.weight + ' 档 · '
        + (L.row.tainted ? '带串味' : '无串味');
    return '<p class="pz-tip">第 <b>' + L.id + '</b> 格</p>'
      + '<p class="pz-tip">' + meta + '</p>'
      + '<p class="pz-tip">里头那段记：<b>…</b></p>';
  }
  /* 取当那一面：列出候选格子的元数据，玩家自己指。**候选表就是 26 格，不排序、不推荐、不给捷径。**
     用户 2026-10-17 口径（逐字）：「只有交还之后才知道给的正确还是错误」——
     所以**交割之前这一面不许暗示对错**：同一格的面板，对与错逐字节一样。对错是交割那一刻才结的账。 */
  function renderTake(host, k, right) {
    if (!host || !host.setTitle || !host.setBody || !host.setBtns || !host.openModal) return null;
    var s = S_(host.S);
    var row = slotRow(s, k) || emptyRow(k);
    var head = '<p class="pz-tip">第 <b>' + LETTERS[k] + '</b> 格</p>';
    var meta = '<p class="pz-tip">' + (row.occupied
      ? '入库 ' + row.date + ' 日 · 封条 ' + sealColor(row.batch) + ' · 重 ' + row.weight + ' 档 · '
        + (row.tainted ? '带串味' : '无串味')
      : '空罐 · 号还留着（格号不复用）') + '</p>';
    var face = head + meta + '<p class="pz-tip">里头那段记：<b>…</b></p>';
    if (right) {
      /* 交割之后才说话：对的那一次，格号与客人说的对得上。 */
      host.setTitle('取当 · ' + LETTERS[k]);
      host.setBody(face + '<p class="pz-tip">就是这段。客人手里的当票收回来，格子空了，号还留着。</p>');
    } else {
      /* 交割之后才说话：错了也不报"正确答案是第几格" —— 那是替玩家做记忆，比扣钱还伤难度。 */
      host.setTitle('取当 · 认错了格');
      host.setBody(face + '<p class="pz-tip">这一格不是他的。账房少了 ' + penalty(row.weight || 0)
        + ' 枚当金。货还在架上，号没动。</p>');
    }
    host.setBtns([{ label: '合上', fn: host.closeModal }]);
    host.openModal();
    return true;
  }
  /* 判据 C12-c 读这个：三面都必须给得出东西，且**不许把整句话端上来**（正文里不许出现句号）。 */
  function FACES() {
    return {
      take: function (host, k) { return bodyFor(S_(host && host.S ? host.S : null), k); },
      look: function (host, k) { return look(S_(host && host.S ? host.S : null), k).line; },
      drop: function (host, k) {
        var row = slotRow(S_(host && host.S ? host.S : null), k);
        return LETTERS[k] + ' · ' + (row && row.occupied ? row.date + ' 日入 · 重 ' + row.weight + ' 档' : '空罐');
      }
    };
  }

  /* ============================================================
     八、自检（判据 C14-a 直接调；挂上去之前先自己照一遍）
     ============================================================ */
  function selfcheck(s) {
    var errs = [], all = rows(s || (global.PAWN_DEBUG && global.PAWN_DEBUG.S));
    var seen = {};
    all.forEach(function (r) {
      if (!(r.slot >= 0 && r.slot < COUNT)) errs.push('格号越界：' + r.slot);
      if (seen[r.slot] && r.occupied) errs.push('同一格塞了两件：' + r.slot);
      if (r.occupied) seen[r.slot] = 1;
      Object.keys(r).forEach(function (k) { if (FIELDS.indexOf(k) < 0) errs.push('出格字段：' + k); });
      /* **账面上不许出现"能起名字"的语义**（V7-a） */
      ['label', 'name', 'note', 'alias', 'memo', 'tag', 'title'].forEach(function (b) {
        if (k_of(r, b)) errs.push('账上出现了可命名字段：' + b);
      });
    });
    if (cells().length !== COUNT) errs.push('格数不是 26');
    if (cells().map(function (c) { return c.id; }).join('') !== LETTERS.join('')) errs.push('格号不是 A–Z');
    return errs;
  }
  function k_of(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  /* ============================================================
     九、接线：包一层 CH2.open（**跟 art.js 包 ART31 同一个手法，引擎零改动**）
     ============================================================ */
  var TEXT = {
    store: ['（收当）过秤、问明来源、写票、上架。', '（空罐一只只排着，号是刻在铜牌上的。）'],
    take: ['（取当）客人报的是他自己那段记 —— 你得把它从 26 只一模一样的罐子里拎出来。'],
    full: ['（架上一格空位都没有了。先出一件货，再收新的。）']
  };
  function say(host, k) { if (host && host.say) host.say(TEXT[k].slice()); }
  /* 取当这一面的玩家动作：host 若是验收脚本递进来的"哑宿主"，它自己会用 pick 指定；真机上走面板。 */
  function actTake(host, slot) {
    var s = S_(host && host.S ? host.S : null);
    say(host, 'take');
    /* pick 是留给判据的接线口（真机不传）；**玩家面永远只有 26 个格号可选，没有第 27 个输入位。** */
    var pick = host && typeof host.pick === 'number' ? host.pick : null;
    if (pick != null) return take(host, pick, slot, { render: true });
    var keys = [];
    for (var i = 0; i < COUNT; i++) keys.push({ label: LETTERS[i], fn: (function (kk) {
      return function () { take(host, kk, slot, { render: true }); };
    })(i) });
    if (host && host.setTitle && host.setBtns) {
      host.setTitle('取当 · 客人说的是「' + (slot == null ? '—' : LETTERS[slot]) + '」那一段吗');
      host.setBtns(keys.slice(0, 12).concat([{ label: '算了', fn: host.closeModal }]));
      if (host.openModal) host.openModal();
    }
    return { ok: true, waiting: true };
  }
  function openVault(host) {
    say(host, 'store');
    return true;
  }

  function install() {
    var C = global.CH2;
    if (!C || typeof C.open !== 'function') return false;
    if (C.__ch2vault) return true;                       /* 幂等：包过了就不再包一层 */
    var v0 = C.open;
    C.open = function (p, host) {
      if (p && p.ch2 === true && p.id) {
        if (p.id === V) return openVault(host);
        if (p.id.indexOf('ch2_jar_') === 0) return actTake(host, LETTERS.indexOf(p.id.slice(8)));
        if (p.id === 'ch2_vault_store') return openVault(host);
      }
      return v0.apply(this, arguments);
    };
    C.__ch2vault = 1;
    return true;
  }
  var mounted = install();

  global.CH2_VAULT = {
    VAULT: V, COUNT: COUNT, LETTERS: LETTERS.slice(), WAX: WAX.slice(), FIELDS: FIELDS.slice(),
    WKEYS: WKEYS.slice(), BAD_ID: BAD_ID, GOLD_BOOT: GOLD_BOOT,
    /* 形制 */
    cells: cells, cellState: cellState, sealColor: sealColor, copies: copies, firstEmpty: firstEmpty,
    /* 账 */
    decode: decode, encode: encode, ledger: ledger, look: look,
    /* 四动作 */
    store: store, take: take, drop: drop, hint: hint,
    /* 钱与结局 */
    penalty: penalty, bootGold: bootGold, tickDay: tickDay, broke: broke, bad: bad,
    /* 接线与自检 */
    install: install, mounted: mounted, FACES: FACES, selfcheck: selfcheck,
    open: openVault, actTake: actTake,
    /* 自检用：装载成功没 */
    loadedAt: mounted
  };
})(typeof window !== 'undefined' ? window : globalThis);
