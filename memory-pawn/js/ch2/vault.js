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
               'ch2_lowd', 'ch2_e5_bad', 'ch2_lastday', 'ch2_gold_boot', 'ch2_seen',
               /* V8：身上那串记的 id 列表（进白名单它也是"不许起名字"的：一个 id 就是一段，没有名字位） */
               'ch2_carry',
               /* V10：柜台收下来、**还没上架**的那几段（id 列表）。收当 → 待上架 → 走到罐前才进格 */
               'ch2_pending',
               /* 2026-10-17：二章自己的「记表」（一段一格存进去以后记到哪一格）。
                  以前这一笔是写在一章的 `S.mem[id]` 里 —— 那就是"二章改一章的记"。
                  用户口径：「两个游戏…不要让他们有任何关系」⇒ 二章自己一张表，跟着二章的档走。 */
               'ch2_mems'];

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
    /* 2026-10-17 中枢新单：二章旗标一变，顶栏「目标 / 第几幕」与任务页得当场重画 ——
       不然收完一段、顶栏还写着上一拍的"把客人让进来"（实拍逮到过）。 */
    if (h && h.dirty) h.dirty();
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
  /* 26 格的坐标 = **跟 A 线 art.js 同一张 48px 网格表**（2026-10-17 01:34 对齐过）：
     `var CELL = 48`（art.js:24）· jarRow(c, tx0, y0, …) 摆在第 tx0 格起，每格中心 x = tx*48 + 24，
     罐子宽 34 ⇒ 左沿 = tx*48 + 7（art.js:571 那句 `jx = tx*CELL + R((CELL-jw)/2)`）。
     我这边只报数、不画：格号 A–Z 按 13 一格折行，上排 y0=232 / 下排 y0=376，罐底 = y0 + jh。 */
  var ROW = { tx0: 4, y0: [232, 376], n: 13, jw: 34, jh: 36, cell: 48 };
  function cells() {
    var out = [], i, r;
    for (r = 0; r < 2; r++) {
      for (i = 0; i < ROW.n; i++) {
        var k = r * ROW.n + i, tx = ROW.tx0 + i;
        out.push({ k: k, id: LETTERS[k], letter: LETTERS[k],
                   x: tx * ROW.cell + Math.round((ROW.cell - ROW.jw) / 2),
                   y: ROW.y0[r] + ROW.jh, w: ROW.jw, h: ROW.jh, tx: tx });
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
  /* ============================================================
     七之二、逐格交互（用户 2026-10-17 口径 → V8 四条子判据）
     ------------------------------------------------------------
     「目前罐子不可以交互，应该是每个罐子都可以交互的。然后当你身上有记忆的时候，对一个罐子交互就可以
      选择是否将某一段记忆存入其中。然后再交互就会选择是否取出这段记忆，但是不显示名字。直到交易之前
      都不会显示名字，只会显示罐子的代号。只有交还之后才知道给的正确还是错误。」
     四个动作照中枢拍板：① 26 格全可交互（空罐照按）② 身上有记 + 空格 → 给"选哪一段"的面
     ③ 同格再按 = 取出（**回身上**，不是销毁）④ 满格 + 身上有记 → 必须先取出，**不许替换、不许顶掉**。

     ⚠️ 这一节的两条边界（改了就等于把难度送人）：
       · **选段的面只列序号**，不列名字、不列 tag、不列原文 —— 顾客看得见的那一栏只有「第 N 段 · 重 X 档」。
       · 「取」在这里**只把记拿回身上**；对/错是交割那次 `take()` 才结的账。这一面在交割前逐字节一样。
     ============================================================ */
  /* **身上那串记**：一章是 `S.mem[id].state`（held/spoiled/donated）。二章只借一个"哪几段在身上"的
     列表——**只存 id**，不存名字、不存内容（口径 A）。`ch2_carry` 进 WKEYS 白名单。 */
  var CARRY = 'ch2_carry';
  function carryIds(s) {
    return String(fget(s, CARRY) == null ? '' : fget(s, CARRY))
      .split(',').filter(function (x) { return x !== ''; });
  }
  function setCarry(s, ids) {
    var uniq = [];
    (ids || []).forEach(function (x) { if (x && uniq.indexOf(x) < 0) uniq.push(x); });
    /* 账号串进档；**顺序 = 玩家收进来的顺序**（这也是"只能靠记性"的一部分：系统不替你排）。 */
    fset({ S: s, save: function () {} }, CARRY, uniq.join(','));
    return uniq;
  }
  function carryList(s) {
    return carryIds(s).map(function (id, i) { return { id: id, n: i + 1, slot: null }; });
  }
  /* 真机上"身上有记"＝**二章自己手里那串**（`ch2_carry`）+ 柜台刚收下还没上架的（`ch2_pending`）。
     2026-10-17 之前这里是从一章的 `S.mem` 里搬（`state==='held'` 那几段）—— 那是"二章读一章的记"，
     用户拍死「两个游戏不要有任何关系」之后改成只认自己的两个旗标（都是 `ch2_` 前缀，跟着二章的档走）。 */
  function carryFromMem(s) {
    var ids = carryIds(s), add = [];
    pendingIds(s).forEach(function (id) { if (id && ids.indexOf(id) < 0 && add.indexOf(id) < 0) add.push(id); });
    return add.length ? setCarry(s, ids.concat(add)) : ids;
  }
  function carryPush(s, id) { return setCarry(s, carryIds(s).concat([id])); }
  function carryDrop(s, id) {
    var ids = carryIds(s), i = ids.indexOf(id);
    if (i < 0) return { ok: false, msg: 'not-carried' };
    ids.splice(i, 1); setCarry(s, ids);
    return { ok: true, id: id };
  }
  /* ---------- 二章自己的「记表」（2026-10-17 断耦合） ----------
     形制：`{ <记 id>: { slot: 存进第几格, state: 'held'|'stored' } }`，存成一行 JSON 的旗标 `ch2_mems`。
     以前这一笔写在一章的 `S.mem[id]` 上（ch2_stored / donated / state='donated'）—— 二章一存东西，
     一章那段记就"不在身上"了，一章的台词、一章的真相都会跟着变。用户拍死：「两个游戏，不要有任何关系」。
     ⇒ 二章自己一张表；这行旗标是 `ch2_` 前缀 ⇒ 跟着二章的档（mp23-ch2-v1）走，一章的档里一个字都没有。 */
  var MEM2 = 'ch2_mems';
  function memMap(s) {
    var raw = fget(s, MEM2), out = {};
    if (!raw) return out;
    try { var o = JSON.parse(String(raw)); if (o && typeof o === 'object') out = o; } catch (e) { out = {}; }
    return out;
  }
  function memSet(s, map) { fset({ S: s, save: function () {} }, MEM2, JSON.stringify(map || {})); return map; }
  function memRec(s, id) { return memMap(s)[id] || null; }
  /* 记在这库房里的三种状态：在册（ch2_mems 里有 slot）/ 在手上（ch2_carry）/ 空。
     **只认二章自己的两个旗标**，一章的 S.mem 一个字节都不看（断耦合）。 */
  function memState(s, id) {
    var rec = memRec(s, id);
    if (rec && rec.slot != null) return 'stored';
    if (carryIds(s).indexOf(id) >= 0) return 'held';
    return 'gone';
  }

  /* 存进去（**必须走"那一格"**：玩家指哪只罐子就进哪只，不许系统自己挑空格） */
  function storeHeld(host, slot, id) {
    var s = S_(host && host.S ? host.S : null);
    if (!(slot >= 0 && slot < COUNT)) return { ok: false, msg: 'bad-slot' };
    var row = slotRow(s, slot);
    /* ④ 满格必须先取 —— 替换在这里就被挡住（不是"顶掉最旧的"）。 */
    if (row && row.occupied) { txt(host, LETTERS[slot] + ' 格已经满了 —— 先把它取出来，再存新的。'); return { ok: false, msg: 'full-slot', id: LETTERS[slot] }; }
    if (carryIds(s).indexOf(id) < 0) return { ok: false, msg: 'not-carried' };
    var r = store(host, { o: '', d: num(fget(s, 'ch2_lastday'), 1), w: 0 });
    if (!r.ok) return r;                                   /* 架全满（26/26）也走这条 */
    var from = r.slot, to = slot;
    if (from !== to) {                                     /* store() 落的是"第一格空的" —— 搬回玩家指的那格 */
      var moved = slotRow(s, from);
      putRow(s, emptyRow(from));
      moved.slot = to;
      putRow(s, moved);
    }
    /* 记到**二章自己那张表**上（以前写一章的 S.mem —— 断耦合后不再碰） */
    var map = memMap(s);
    var m = map[id] || {};
    m.slot = to;                                           /* 存哪一格 —— 交割/取回都按它认账 */
    m.state = 'stored';
    map[id] = m;
    memSet(s, map);
    carryDrop(s, id);
    /* V10：这段要是"柜台收下来、还没上架"那一批里的，上架这一下就从待上架划掉
       —— 同一个东西挂在两个账上当两件，玩家会以为收了两段。 */
    pendingDrop(s, id);
    if (host && host.save) host.save();
    if (host && host.addLog) host.addLog('（库房）把身上这一段存进 ' + LETTERS[to] + ' 格。');
    if (host && host.sfx) host.sfx('coin');
    return { ok: true, slot: to, id: LETTERS[to], mem: id };
  }
  /* 取回身上（③）：格腾空、号留着；**记回到手上**，不是销毁。对/错不在这里判。 */
  function takeHeld(host, slot) {
    var s = S_(host && host.S ? host.S : null);
    var key = String(slot);
    var map = memMap(s), id = null;
    Object.keys(map).forEach(function (k) { if (String((map[k] || {}).slot) === key) id = k; });
    if (id == null) return { ok: false, msg: 'nothing' };
    var r = take(host, slot, slot, { render: false });
    if (!r.right) return { ok: false, msg: 'no-row', id: LETTERS[slot] };
    var m = map[id];
    delete m.slot;
    m.state = 'held';                                      /* 回到身上 */
    memSet(s, map);
    carryPush(s, id);
    /* 2026-10-17 中枢新单：第 3 幕「按 E 把这一段取出来」拿它打勾（取过一次才算数） */
    fset(host, 'ch2_take_n', num(fget(s, 'ch2_take_n'), 0) + 1);
    if (host && host.save) host.save();
    if (host && host.addLog) host.addLog('（库房）从 ' + LETTERS[slot] + ' 格把记取回身上。');
    return { ok: true, slot: slot, id: LETTERS[slot], mem: id, gold: r.gold };
  }
  /* 交割前那一面：**只有格号 + 空满 + 封条色 + 重量档 + 入库日**，一个字的对错都没有。
     判据 V8-c 就是拿它对「对后 / 错后」两种面板做逐字节比对。 */
  function faceOf(s, k) {
    var row = slotRow(s, k) || emptyRow(k);
    return '<p class="pz-tip">第 <b>' + LETTERS[k] + '</b> 格</p>'
      + '<p class="pz-tip">' + (row.occupied
        ? '入库 ' + row.date + ' 日 · 封条 ' + sealColor(row.batch) + ' · 重 ' + row.weight + ' 档 · '
          + (row.tainted ? '带串味' : '无串味')
        : '空罐 · 号还留着（格号不复用）') + '</p>'
      + '<p class="pz-tip">里头那段记：<b>…</b></p>';
  }
  function actJar(host, slot) {
    var s = S_(host && host.S ? host.S : null);
    if (!(slot >= 0 && slot < COUNT)) return { ok: false, msg: 'bad-slot' };
    /* 2026-10-17 中枢新单（二章任务引导）：罐前这一按落一个二章自己的旗标 ——
       第 2 幕「站到某只空罐前按 E 开罐」就是拿它打勾的（真按过才勾，不是摆设）。
       空罐 / 有货 / 满格三条路都算"走到了罐子面前"，所以记在最前头。 */
    fset(host, 'ch2_jar_open', 1);
    carryFromMem(s);                                       /* 真机：身上的记随时搬进来（不弹提示） */
    var row = slotRow(s, slot), held = carryIds(s);
    if (row && row.occupied) return jarTakePanel(host, s, slot);
    if (held.length) return jarStorePanel(host, s, slot, held);
    say(host, 'empty');                                    /* ① 空罐照样有回应：不许"按了没动静" */
    return { ok: true, msg: 'empty', id: LETTERS[slot] };
  }
  /* ② 手里有记：给「选哪一段」的面 —— **只列序号 + 重量档，不列名字**。 */
  /* 选段那一面要用"一行十三格、到底换行"的排版（身上最多 38 段）；这一段只管排版的样式
     原来是跟账本共用的，账本整块删掉（2026-10-17 中枢裁决）之后留在这儿自用 ——
     面板上只有序号，跟账本没有任何关系。
     ⚠️ 两个真机上踩出来的坑，别改回去：
       ① 样式必须裹在 `display:contents` 的壳里、**且壳要是 #m-body 的直接子元素**：
          index.html 那套"对话皮肤"按 `:has(#m-body > div)` 认对话框，块级 div 一进去，
          面板就被改成对话框样式（按钮变右下角 ▼、字被 color:transparent 藏掉）；
       ② 必须显式写 flex-direction:row —— #m-btns 的基础规则是 column。 */
  var PICK_CSS = '<style>#m-btns{display:flex;flex-direction:row;flex-wrap:wrap;gap:4px;margin-top:8px;'
    + 'align-items:flex-start}'
    + '#m-btns button{width:calc((100% - 48px)/13);min-width:0;max-width:calc((100% - 48px)/13);'
    + 'flex:0 0 calc((100% - 48px)/13);padding:7px 0;text-align:center;font-size:11px;line-height:1.3;'
    + 'letter-spacing:0;border-radius:7px;white-space:nowrap;overflow:hidden}'
    + '#m-btns button:last-child{width:auto;min-width:88px;max-width:none;flex:1 1 auto;padding:7px 12px}</style>';
  function jarStorePanel(host, s, slot, held) {
    var btns = held.map(function (id, i) {
      return {
        label: '第 ' + (i + 1) + ' 段', fn: function () {
          var r = storeHeld(host, slot, held[i]);
          if (host && host.closeModal) host.closeModal();
          if (host && host.addLog) { /* 结果已经记过日志 */ }
          return r;
        }
      };
    });
    btns.push({ label: '算了', fn: host && host.closeModal ? host.closeModal : function () {} });
    if (host && host.setTitle && host.setBtns) {
      host.setTitle(LETTERS[slot] + ' 格空着 · 存一段进去？');
      host.setBtns(btns);
      /* 身上最多 38 段 ⇒ 38 颗按钮。宿主那张面板默认是**一列**排下来的（#m-btns 基础规则
         flex-direction:column）—— 实拍上屏时第 15 段就被顶到框外了。所以这里用 PICK_CSS
         那段只管排版的样式（一行十三格、到底换行）；两个坑写在 PICK_CSS 上面。 */
      if (host.setBody) host.setBody('<p class="pz-tip">要存哪一段？<b>只有序号</b> —— 名字和内容都不给你看。</p>'
        + '<div style="display:contents">' + PICK_CSS + '</div>');
      if (host.openModal) host.openModal();
    }
    return { ok: true, waiting: true, id: LETTERS[slot], count: held.length };
  }
  /* ③ 满格：取出（回身上）。「认」那一步等交割才结账。 */
  function jarTakePanel(host, s, slot) {
    var row = slotRow(s, slot);
    var id = null, _map = memMap(s);
    Object.keys(_map).forEach(function (k) { if (String((_map[k] || {}).slot) === String(slot)) id = k; });
    var btns = [{ label: '取出来', fn: function () {
      var r = id == null ? { ok: false, msg: 'nothing' } : takeHeld(host, slot);
      /* 取出之后面板要跟着变（不然屏上还挂着"已经有一件货"、"取出来"再按就落空）。
         **交割前不判对错**：这里只说"回身上了 / 号还留着"，一个字都不提这段对不对。 */
      if (host && host.closeModal) host.closeModal();
      if (r && r.ok) txt(host, LETTERS[slot] + ' 格空了 —— 号还留着。');
      else txt(host, LETTERS[slot] + ' 格本来就是空的。');
      return r;
    } }];
    btns.push({ label: '算了', fn: host && host.closeModal ? host.closeModal : function () {} });
    if (host && host.setTitle && host.setBtns) {
      host.setTitle(LETTERS[slot] + ' 格 · 已经有一件货');
      if (host.setBody) host.setBody(faceOf(s, slot) + '<p class="pz-tip">要把它取回身上吗？（号还留着，格号不复用）</p>');
      host.setBtns(btns);
      if (host.openModal) host.openModal();
    }
    return { ok: true, waiting: true, id: LETTERS[slot], occupied: true, filled: !!row };
  }
  /* 判据 V8-a/b/d 直接用这两个函数做"哑宿主"驱动；真机上走上面那两个面板。
     ⚠️ 2026-10-17：模块没落盘时判据也要能红得"干净"（不能抛 TypeError 把整批断言带塌）
     —— 所以这里连模块自己的装载期都兜得住。 */
  function jarButtonLabels(host, slot) {
    var seen = [];
    var dumb = {
      S: host && host.S, say: function () {}, toast: function () {},
      setTitle: function () {}, setBody: function () {},
      setBtns: function (a) { seen = [].concat(a || []); },
      openModal: function () {}, closeModal: function () {}, save: function () {},
      addLog: function () {}, sfx: function () {}, dirty: function () {}
    };
    actJar(dumb, slot);
    return seen.map(function (b) { return b.label; });
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
     七之四、柜台待客（用户原话：「应该是我们在店铺和客人交互收记忆，然后买卖记忆」）
     ------------------------------------------------------------
     四步（中枢 2026-10-17 拍死的顺序）：**验**（成色＝痛感 w ＋ 磨损）→ **问来路**
     （「这记是你自己的吗」）→ **定价**（给多了铺子赔、给少了客人转身走）→ **收下**。
     · 收下 ≠ 上架：东西进 `ch2_pending`（待上架）＋ 身上那串搬运列表，**26 格一个字节都不动**
       —— 上架是玩家自己走到罐子前面按 E 那一下（actJar → storeHeld）。
     · 选段那面只给序号（跟库房同一条规矩）：面板上永远没有名字 / 原文 / tag / 记的 id。
     · 客人只有一位（设计书 K3 阿海，渔夫），**能反复接** —— 他走了又来，柜台一直有生意。
     ============================================================ */
  var PENDING = "ch2_pending";
  var SRC_PRICE = { own: 1, other: 1.4, name: 1.8, life: 1.6, unknown: 1 };
  var GUEST_SRC = ["own", "other", "name", "life", "unknown"];
  /* 客人（设计书 K3 阿海：一章那位渔夫，二章回头客）。**一句话都不进账** —— 只用来演。 */
  var GUEST = {
    id: "ahai", name: "阿海", who: "渔夫",
    lead: ["柜台上那杆秤还没收。外头进来一个人，肩上背着渔网，网是空的。",
           "「掌柜的，」他说，「我那段记 —— 你还收不收？」"],
    ask: "「这记是你自己的吗？」"
  };
  function pendingIds(s) {
    return String(fget(s, PENDING) == null ? "" : fget(s, PENDING)).split(",").filter(function (x) { return x !== ""; });
  }
  function setPending(s, ids) {
    var uniq = [];
    (ids || []).forEach(function (x) { if (x && uniq.indexOf(x) < 0) uniq.push(x); });
    fset({ S: s, save: function () {} }, PENDING, uniq.join(","));
    return uniq;
  }
  function pendingDrop(s, id) {
    var ids = pendingIds(s), i = ids.indexOf(id);
    if (i >= 0) { ids.splice(i, 1); setPending(s, ids); }
    return ids;
  }
  /* 这段记的"痛感"（=当金值）：**二章自己那张表里记的 w**；没有就按阿海那份 6 档算。
     2026-10-17 断耦合：以前读的是一章 `S.mem` 的 w（二章读一章的记），现在只读自己的 ch2_mems。 */
  function weightOf(s, id) {
    var m = memRec(s, id);
    var w = m && (m.w != null ? m.w : m.weight);
    return num(w, GUEST_W);
  }
  var GUEST_W = 6;
  /* 定价：痛感 × 来路 ＋ 这段自己那点零头。**确定性的**（同一段两次报价一样，判据才钉得住）。 */
  function priceOf(id, src) {
    var s = S_(null), w = weightOf(s, id);
    var h = 0; String(id).split("").forEach(function (ch) { h = (h * 31 + ch.charCodeAt(0)) % 97; });
    var add = h % 5;
    var v = Math.round(w * 2 * (SRC_PRICE[src] || 1)) + add;
    return Math.max(1, Math.min(99, v));
  }
  function tierOf(w) { return w >= 13 ? "重" : w >= 7 ? "中" : w >= 4 ? "轻" : "薄"; }
  /* 收下：进待上架 + 身上；**不进 26 格**。当金当场付给客人（铺子出钱收货）。 */
  function receive(host, o) {
    o = o || {};
    var s = S_(host && host.S ? host.S : null);
    if (!s) return { ok: false, msg: "no-state" };
    var n = num(fget(s, "ch2_recv_n"), 0) + 1;
    var id = "ch2_r" + n;                       /* 只在这儿生成 id：玩家面从头到尾看不见它 */
    var price = priceOf(id, o.src);
    /* 收下的这段记进**二章自己的表**（以前写一章的 S.mem —— 现在一个字节都不碰） */
    var _map = memMap(s);
    _map[id] = { state: "held", w: weightOf(s, id), from: "counter", src: o.src, day: num(fget(s, "ch2_lastday"), 1) };
    memSet(s, _map);
    setPending(s, pendingIds(s).concat([id]));
    carryPush(s, id);
    fset(host, "ch2_recv_n", n);
    s.gold = num(s.gold, 0) - price; if (s.gold < 0) s.gold = 0;
    if (host && host.addLog) host.addLog("（柜台）收下阿海那段记，付 " + price + " 枚当金 —— 待上架，还没入库房。");
    if (host && host.sfx) host.sfx("coin");
    if (host && host.save) host.save();
    return { ok: true, id: id, price: price, pending: pendingIds(s), carry: carryIds(s), gold: s.gold };
  }
  /* 柜台那一面：`step` 由按钮自己往下推（host.__ch2Counter），真机上不存额外状态。 */
  function counterPanel(host, step) {
    if (!host || !host.setTitle || !host.setBody || !host.setBtns || !host.openModal) return null;
    var s = S_(host.S || null);
    step = Math.max(0, Math.min(3, num(step, 0)));
    function repaint(next) { host.__ch2Counter = next; return counterPanel(host, next); }
    var id = host.__ch2RecvId || ("ch2_r" + (num(fget(s, "ch2_recv_n"), 0) + 1));
    var btns = [], body = "";
    /* ---- 动线第一拍：**客人在门外等**（2026-10-17 中枢派单第 3 条）----
       用户要的是一条完整的接待动线：门外等 → 进来 → 验物 → 问话 → 定价 → 收当/赎回 → 走人。
       原来这里一按 E 就是「柜台 · 收当」，人已经站在屋里了 —— 门口那一段根本不存在。
       现在 step 0 = 门口：开门才把人让进来（落 `ch2_guest_in`）。
       ⚠️ 这个旗标是**二章自己的**（走 fset ⇒ lib 那个键），不进一章存档。 */
    if (step === 0 && !fget(s, "ch2_guest_in")) {
      host.setTitle("柜台 · 门口");
      body = "<p class=\"pz-tip\">门外有人站着，肩上背着渔网，网是空的。他敲了两下门框：「掌柜的在吗？」</p>"
           + "<p class=\"pz-tip\">（开秤的动线：开门引入 → 验成色 → 问来路 → 定价 → 收下 / 让他回去再想想。）</p>";
      btns.push({ label: "开门（让他进来）", fn: function () { fset(host, "ch2_guest_in", 1); return repaint(1); } });
      btns.push({ label: "先不开", fn: host && host.closeModal ? host.closeModal : function () {} });
      host.setBody(body);
      host.setBtns(btns);
      host.openModal();
      return { ok: true, opened: true, step: 0, door: true, guest: GUEST.id };
    }
    /* 客人已经在屋里（门口那一步过过了）⇒ step 0 当成"验成色"用，不用再点一次开门 */
    if (step === 0) step = 1;
    if (step === 1) {
      var w = weightOf(s, id);
      host.setTitle("收当 · 验");
      body = "<p class=\"pz-tip\">" + weightOf(s, id) + " 档的痛感 —— " + tierOf(w) + "。"
           + "（这段记还带着磨损，离了原主就散。成色看得，来路也得问。）</p>";
      btns.push({ label: "问他：这记是你自己的吗", fn: function () { return repaint(2); } });
    } else if (step === 2) {
      host.setTitle("收当 · 问来路");
      body = "<p class=\"pz-tip\">" + GUEST.ask + "</p>";
      [["是别人的", "other"], ["是我的（他自己的）", "own"], ["是一个名字", "name"], ["是一条命", "life"]].forEach(function (p) {
        btns.push({ label: p[0], fn: function () { host.__ch2RecvSrc = p[1]; return repaint(3); } });
      });
      btns.push({ label: "不好说", fn: function () { host.__ch2RecvSrc = "unknown"; return repaint(3); } });
    } else {
      var src = host.__ch2RecvSrc || "unknown";
      var price = priceOf(id, src);
      host.setTitle("收当 · 定价 " + price + " 枚");
      body = "<p class=\"pz-tip\">你报了 " + price + " 枚当金。他想了很久，把渔网放在柜台上。</p>"
           + "<p class=\"pz-tip\">（给多了铺子赔，给少了人就走 —— 秤在柜上，账在你心里。）</p>";
      btns.push({ label: "收下（" + price + " 枚）", fn: function () {
        var r = receive(host, { src: src });
        if (host && host.closeModal) host.closeModal();
        /* 动线最后一拍：**走人**（中枢派单第 3 条 "…→ 收当/赎回 → 走人"）。
           以前只有一句"东西收下了"，人还杵在柜台外头 —— 玩家不知道这一段收完没有。 */
        if (r && r.ok && host && host.say) host.say([
          "（阿海把渔网背回肩上，走之前在柜台上按了一下帽檐，没再多说。）",
          "（东西收下了，暂记在待上架 —— 走到库房里那只罐子前面，再决定它进哪一格。）"
        ]);
        return r;
      } });
      btns.push({ label: "让他回去再想想", fn: function () {
        if (host && host.closeModal) host.closeModal();
        if (host && host.say) host.say(["（他把渔网背回肩上，走了 —— 临出门撂一句「改天再来」。）"]);
        return { ok: true, left: true };
      } });
    }
    btns.push({ label: "算了", fn: host && host.closeModal ? host.closeModal : function () {} });
    host.setBody(body);
    host.setBtns(btns);
    host.openModal();
    return { ok: true, opened: true, step: step, guest: GUEST.id };
  }
  function counterOpen(host) {
    if (!host || !host.setTitle) { say(host, "store"); return { ok: false, msg: "no-host" }; }
    return counterPanel(host, host.__ch2Counter || 0);
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
    full: ['（架上一格空位都没有了。先出一件货，再收新的。）'],
    /* ① 空罐也得有回应 —— 按了没动静，玩家只会以为"罐子不能交互"（用户原话的由来） */
    empty: ['（空罐。号刻在铜牌上，底下没货 —— 也没起过名。）']
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
      host.setBtns(keys.concat([{ label: '算了', fn: host.closeModal }]));
      if (host.openModal) host.openModal();
    }
    return { ok: true, waiting: true };
  }
  function install() {
    var C = global.CH2;
    if (!C || typeof C.open !== 'function') return false;
    if (C.__ch2vault) return true;                       /* 幂等：包过了就不再包一层 */
    var v0 = C.open;
    C.open = function (p, host) {
      if (p && p.ch2 === true && p.id) {
        if (p.id.indexOf('ch2_jar_') === 0) return actJar(host, LETTERS.indexOf(p.id.slice(8)));
        /* V10 柜台待客（一章当铺那张图上的 ch2_counter_guest）：先把 say 读完，回调再落到这儿 */
        if (p.id === 'ch2_counter_guest') return counterOpen(host);
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
    /* V10 · 柜台收当（验 / 问来路 / 定价 / 收下） */
    counterOpen: counterOpen, counterPanel: counterPanel, receive: receive, priceOf: priceOf,
    pendingIds: pendingIds, PENDING: PENDING, GUEST: GUEST, GUEST_W: GUEST_W, SRC_PRICE: SRC_PRICE,
    actTake: actTake, actJar: actJar,
    /* V8 · 逐格交互：身上那串记 / 逐格存 / 逐格取回 / 交割前面 */
    CARRY: CARRY, carryIds: carryIds, carryList: carryList, carryFromMem: carryFromMem,
    carryPush: carryPush, carryDrop: carryDrop, memState: memState,
    storeHeld: storeHeld, takeHeld: takeHeld, faceOf: faceOf,
    memoOf: function (s, k) { var r = slotRow(s, k); return r && r.occupied ? r.weight : null; },
    jarButtonLabels: jarButtonLabels,
    /* 自检用：装载成功没 */
    loadedAt: mounted
  };
})(typeof window !== 'undefined' ? window : globalThis);
