/* 《记忆当铺》v31 · 建筑像素美术（A 线 / 画质）
   —— 用户口径（2026-10-12）：像素风为主；每栋建筑都有自己的特征；画质不许低；分辨率要高。

   落地口径（每条都能被机械拦死，见 .workbuddy/tests/art31-test.js）：
     1. 1 美术像素 = 1 逻辑像素（画布 960×672，格 CELL=48）。所有坐标 Math.round 取整 → 硬边，
        不吃抗锯齿。只允许一次填充一个整数矩形，没有半个像素。
     2. 禁用 ctx 的渐变 / 圆弧 / 路径 / 描边：本文件只用 fillStyle + fillRect 两个 API。
        色阶过渡一律 2×2 Bayer 抖动（SPECK/DITH），圆的边缘用逐行矩形堆（DISC）。
     3. 限色：每种材质只给 5 档色阶（ramp），逐场景与 palette.solid 混色 —— 夜色/晨雾氛围不丢。
     4. 每栋建筑的身份**不靠 hash 猜**：BUILDING 表按「场景 + 矩形」点名，
        名字取自 story23.js 的场景数据（记当铺 / 岛史馆 / 盐仓 / 柜台 / 卷宗架 / 望归灯…）。
        同一场景里两栋建筑画出来的"笔触指纹"必然不同（单测会逐对比对）。

   接线（共有文件按协作规矩走 collab claim/sync --as A）：
     · index.html：在 js/game23.js 之前加 <script src="js/art31.js"></script>
     · game23.js bake()：paintSolids(c, sc, pal) →
           (global.ART31 ? ART31.paintSolids : paintSolids)(c, sc, pal)

   自检：
     node tools/art31-render.mjs          # 纯 JS 光栅化 → tools/evidence/art31-*.png（肉眼复核）
     node .workbuddy/tests/art31-test.js  # 硬边 / 整数坐标 / 逐栋特征唯一 / 六场景全覆盖
*/
(function (global) {
  'use strict';

  var CELL = 48, VW = 960, VH = 672;

  /* ============================================================
     一、色：自洽实现，不依赖 game23.js 闭包里的 shade/mix
     ============================================================ */
  function parseCol(col) {
    var s = String(col == null ? '' : col);
    var m = /^#([0-9a-fA-F]{6})$/.exec(s);
    if (m) { var v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
    m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);
    if (m) return [+m[1], +m[2], +m[3]];
    return null;
  }
  function rgb(a) { return 'rgb(' + a[0] + ',' + a[1] + ',' + a[2] + ')'; }
  function clamp8(v) { v = Math.round(v); return v < 0 ? 0 : (v > 255 ? 255 : v); }
  /* amt>0 往白提，amt<0 压暗（口径同 game23.js 的 shade） */
  function shade(col, amt) {
    var a = parseCol(col);
    if (!a) return String(col || '#000');
    var o = [], i, v;
    for (i = 0; i < 3; i++) {
      v = a[i];
      v = amt >= 0 ? v + (255 - v) * amt : v * (1 + amt);
      o.push(clamp8(v));
    }
    return rgb(o);
  }
  function mix(a, b, t) {
    var A = parseCol(a), B = parseCol(b), o = [], i;
    if (!A || !B) return String(a || b || '#000');
    for (i = 0; i < 3; i++) o.push(clamp8(A[i] + (B[i] - A[i]) * t));
    return rgb(o);
  }
  function blend(a, b, t) {                       /* → #rrggbb（ramp 的底必须是 hex） */
    var A = parseCol(a), B = parseCol(b);
    if (!A || !B) return a || b;
    var s = '#', i, v;
    for (i = 0; i < 3; i++) { v = clamp8(A[i] + (B[i] - A[i]) * t); s += (v < 16 ? '0' : '') + v.toString(16); }
    return s;
  }
  /* 5 档色阶：#0 最暗 → #4 最亮 */
  function ramp(base, n) {
    n = n || 5;
    var out = [], i, t;
    for (i = 0; i < n; i++) {
      t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
      out.push(t < 0 ? shade(base, t * 0.74) : shade(base, t * 0.55));
    }
    return out;
  }
  /* 确定性随机：同一栋楼每次烘焙的细节完全一样，刷新也不变 */
  function rngAt(x, y, k) {
    var n = (Math.abs(x) * 374761393 + Math.abs(y) * 668265263 + (k || 0) * 2246822519) >>> 0;
    return function () {
      n = (n ^ (n >>> 13)) >>> 0;
      n = (n * 1274126177) >>> 0;
      return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
    };
  }

  /* ============================================================
     二、像素图元：全部只用 c.fillStyle + c.fillRect
     ============================================================ */
  function snap(v) { return Math.round(v); }
  function R(c, x, y, w, h, col) {
    x = snap(x); y = snap(y); w = snap(w); h = snap(h);
    if (w < 1 || h < 1) return;
    if (col) c.fillStyle = col;
    c.fillRect(x, y, w, h);
  }
  function HL(c, x, y, w, col) { R(c, x, y, w, 1, col); }
  function VL(c, x, y, h, col) { R(c, x, y, 1, h, col); }
  function FRAME(c, x, y, w, h, col) {
    HL(c, x, y, w, col); HL(c, x, y + h - 1, w, col);
    VL(c, x, y, h, col); VL(c, x + w - 1, y, h, col);
  }
  var BAY = [[0, 2], [3, 1]];                     /* 2×2 Bayer，值 0..3 */
  var BAY4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  /* amount: 1=25% 2=50% 3=75% 4=满 —— 只点抖动像素，不铺底 */
  function SPECK(c, x, y, w, h, col, amount, ph) {
    x = snap(x); y = snap(y); w = snap(w); h = snap(h);
    if (w < 1 || h < 1 || !col) return;
    ph = (ph || 0) & 3;
    var i, j, v;
    amount = amount || 2;
    c.fillStyle = col;
    for (j = 0; j < h; j++) {
      for (i = 0; i < w; i++) {
        v = BAY[(j + (ph >> 1)) & 1][(i + (ph & 1)) & 1];
        if (amount >= 4 || v < amount) c.fillRect(x + i, y + j, 1, 1);
      }
    }
  }
  function SPECK4(c, x, y, w, h, col, level, ph) {   /* 4×4 细抖，大面积雾/水用 */
    x = snap(x); y = snap(y); w = snap(w); h = snap(h);
    if (w < 1 || h < 1 || !col) return;
    ph = (ph || 0) & 3;
    var i, j;
    c.fillStyle = col;
    for (j = 0; j < h; j++) {
      for (i = 0; i < w; i++) {
        if (BAY4[(j + ph) & 3][(i + ph) & 3] < level) c.fillRect(x + i, y + j, 1, 1);
      }
    }
  }
  function DITH(c, x, y, w, h, colA, colB, amount, ph) {
    R(c, x, y, w, h, colA);
    SPECK(c, x, y, w, h, colB, amount, ph);
  }
  function DISC(c, cx, cy, r, cTop, cMid, cLow) {
    r = Math.max(1, snap(r)); cx = snap(cx); cy = snap(cy);
    var dy, dx, col;
    for (dy = -r; dy <= r; dy++) {
      dx = Math.floor(Math.sqrt(r * r - dy * dy) + 0.5);
      col = cMid;
      if (cTop && dy <= -r * 0.3) col = cTop;
      if (cLow && dy >= r * 0.35) col = cLow;
      R(c, cx - dx, cy + dy, dx * 2 + 1, 1, col);
    }
  }
  function OVAL(c, cx, cy, rx, ry, cTop, cMid, cLow) {
    rx = Math.max(1, snap(rx)); ry = Math.max(1, snap(ry)); cx = snap(cx); cy = snap(cy);
    var dy, dx, col, t;
    for (dy = -ry; dy <= ry; dy++) {
      t = dy / ry;
      dx = Math.floor(rx * Math.sqrt(Math.max(0, 1 - t * t)) + 0.5);
      col = cMid;
      if (cTop && t <= -0.3) col = cTop;
      if (cLow && t >= 0.35) col = cLow;
      R(c, cx - dx, cy + dy, dx * 2 + 1, 1, col);
    }
  }
  /* 逐行内收的梯形/锥体：屋顶透视、塔身收分、盐堆都用它 */
  function TAPER(c, x, y, w, h, tones, topInset, curve) {
    var j, ins, ww, t, col;
    curve = curve || 1;
    for (j = 0; j < h; j++) {
      t = j / Math.max(1, h - 1);
      ins = snap(topInset * Math.pow(1 - t, curve));
      ww = w - ins * 2;
      col = t < 0.2 ? tones[4] : (t < 0.52 ? tones[3] : (t < 0.84 ? tones[2] : tones[1]));
      R(c, x + ins, y + j, ww, 1, col);
    }
  }

  /* ============================================================
     三、材质基色（会被 palette.solid 按氛围压暗 / 偏冷）
     ============================================================ */
  var MAT = {
    wood:    '#8f6636',   /* 老木 */
    plank:   '#9b7a4e',   /* 木板墙 */
    log:     '#6b5030',   /* 原木 / 梁 */
    brick:   '#9a6553',   /* 砖 */
    stone:   '#8b95a6',   /* 石 */
    granite: '#93a0b0',   /* 礁岩 */
    slate:   '#5f6b84',   /* 石板瓦 */
    tile:    '#726d92',   /* 瓦（冷紫灰，夜里发青） */
    thatch:  '#a89058',   /* 茅草 */
    salt:    '#d5dee8',   /* 盐 */
    metal:   '#7b8492',   /* 铁 */
    brass:   '#c9962f',   /* 铜 */
    rope:    '#b09a68',   /* 绳 */
    cloth:   '#8a79b4',   /* 布 */
    foliage: '#4d6b46',   /* 苔 / 树 */
    water:   '#3a5568',   /* 水 */
    mist:    '#c3cfdd'    /* 雾 */
  };

  /* ============================================================
     四、建筑点名表：key = "格x,格y,格w,格h"，与 story23.js 的 solids 一一对应
     ============================================================ */
  var BUILDING = {
    lighthouse: {
      '8,1,4,6':   { kind: 'lighttower', name: '望归灯' },
      '3,4,2,1':   { kind: 'carverock',  name: '刻痕礁石' },
      '15,4,2,1':  { kind: 'lampbase',   name: '九宫灯阵基座' },
      '11,9,3,2':  { kind: 'shed',       name: '灯台工具棚' },
      '1,0,18,1':  { kind: 'cliff',      name: '崖壁' },
      '0,1,1,13':  { kind: 'cliff',      name: '礁壁' },
      '19,1,1,13': { kind: 'cliff',      name: '礁壁' }
    },
    town: {
      '4,2,4,3':   { kind: 'pawnshop',    name: '记当铺' },
      '13,2,4,3':  { kind: 'archivehall', name: '岛史馆' },
      '8,8,2,2':   { kind: 'stallshed',   name: '告示棚' },
      '17,0,1,8':  { kind: 'seawall',     name: '东堤' },
      '0,0,1,14':  { kind: 'seawall',     name: '西堤' },
      '19,0,1,14': { kind: 'seawall',     name: '外堤' }
    },
    pawnshop: {
      '5,3,11,2':  { kind: 'counter',    name: '柜台' },
      '2,2,3,2':   { kind: 'shelving',   name: '寄售架' },
      '15,2,3,2':  { kind: 'backroom',   name: '账房货架' },
      '0,0,20,1':  { kind: 'plankwall',  name: '板壁' },
      '0,0,1,14':  { kind: 'plankwall',  name: '板壁' },
      '19,0,1,14': { kind: 'plankwall',  name: '板壁' }
    },
    saltflats: {
      '4,2,3,3':   { kind: 'saltbarn1', name: '盐仓·甲' },
      '9,2,3,3':   { kind: 'saltbarn2', name: '盐仓·乙' },
      '14,2,3,3':  { kind: 'saltbarn3', name: '盐仓·丙' },
      '6,10,8,1':  { kind: 'dike',      name: '潮堤石堰' },
      '0,0,20,1':  { kind: 'saltwall',  name: '堤' },
      '0,1,1,13':  { kind: 'saltwall',  name: '堤' },
      '19,1,1,13': { kind: 'saltwall',  name: '堤' }
    },
    archive: {
      '3,2,5,2':   { kind: 'shelfwall1', name: '卷宗架·东' },
      '11,2,6,2':  { kind: 'shelfwall2', name: '卷宗架·西' },
      '8,6,4,2':   { kind: 'namewall',   name: '名字碑座' },
      '0,0,20,1':  { kind: 'stonewall',  name: '石壁' },
      '0,1,1,13':  { kind: 'stonewall',  name: '石壁' },
      '19,1,1,13': { kind: 'stonewall',  name: '石壁' }
    },
    mist: {
      '3,3,3,2':   { kind: 'foghut1', name: '雾里的小屋' },
      '14,3,3,2':  { kind: 'foghut2', name: '雾里的空屋' },
      '0,0,20,1':  { kind: 'fogwall', name: '雾墙' },
      '0,1,1,13':  { kind: 'fogwall', name: '雾墙' },
      '19,1,1,13': { kind: 'fogwall', name: '雾墙' }
    }
  };

  var PLAN = function (sc) {
    var table = (sc && BUILDING[sc.id]) || {};
    var out = [];
    var list = (sc && sc.solids) || [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      var key = s[0] + ',' + s[1] + ',' + s[2] + ',' + s[3];
      var hit = table[key];
      var thin = (s[2] <= 1 || s[3] <= 1);
      out.push({
        key: key, cx: s[0], cy: s[1], cw: s[2], ch: s[3],
        x: s[0] * CELL, y: s[1] * CELL, w: s[2] * CELL, h: s[3] * CELL,
        kind: hit ? hit.kind : (thin ? 'wall' : 'house'),
        name: hit ? hit.name : '民房',
        known: !!hit, thin: thin
      });
    }
    return out;
  };

  /* ============================================================
     五、氛围：夜里压暗、灯下提暖、白天留雾
     ============================================================ */
  function moodOf(sc) {
    var a = sc && sc.ambient;
    if (a === 'night') return { t: 0.34, lit: 1, glow: 1.00, cool: 0.30, key: 'night' };
    if (a === 'lamp')  return { t: 0.30, lit: 1, glow: 0.90, cool: 0.24, key: 'lamp' };
    if (a === 'dusk')  return { t: 0.20, lit: 1, glow: 0.60, cool: 0.18, key: 'dusk' };
    return { t: 0.10, lit: 0, glow: 0.34, cool: 0.12, key: 'day' };
  }
  function tonesOf(pal, mood) {
    pal = pal || {};
    var solid = /^#[0-9a-fA-F]{6}$/.test(String(pal.solid)) ? pal.solid : '#2b3242';
    var accent = /^#[0-9a-fA-F]{6}$/.test(String(pal.accent)) ? pal.accent : '#e8b74a';
    var T = {}, k;
    for (k in MAT) if (Object.prototype.hasOwnProperty.call(MAT, k)) T[k] = ramp(blend(MAT[k], solid, mood.t), 5);
    T.lamp  = ramp('#e8a33c', 5);
    T.cream = ramp('#ffe6ac', 5);
    T.cold  = ramp(blend('#7fa0c4', solid, mood.cool), 5);
    T.white = ramp('#e9eff7', 5);
    T.acc   = ramp(accent, 5);
    T.ink   = shade(blend(MAT.wood, solid, 0.62), -0.5);
    return T;
  }

  /* ============================================================
     六、共享构件（屋顶 / 墙 / 门窗 / 灯 / 招牌 / 杂物）
     ============================================================ */
  function groundShadow(c, x, y, w, h) {
    R(c, x + 1, y, w, Math.max(3, h), 'rgba(0,0,0,.30)');
    R(c, x + 4, y + h - 1, w, 3, 'rgba(0,0,0,.16)');
    SPECK(c, x + 6, y + h + 2, Math.max(2, w - 8), 4, 'rgba(0,0,0,.12)', 2, 1);
  }
  /* 南向坡屋面：上窄下宽的透视梯形 + 瓦行 + 交错瓦缝 + 苔痕 */
  function slope(c, x, y, w, h, T, inset) {
    inset = inset == null ? 7 : inset;
    TAPER(c, x, y, w, h, T, inset, 1.6);
    var j, ins, k;
    /* 竖瓦垄：瓦要竖着排才像瓦（暗垄沟 + 亮垄背，隔一条再补高光） */
    for (k = x + inset + 3; k < x + w - inset - 3; k += 9) {
      VL(c, k, y + 3, h - 6, T[1]);
      VL(c, k + 1, y + 4, h - 8, T[3]);
      if (((((k - x) / 9) | 0) % 2) === 0) VL(c, k + 2, y + 5, h - 10, T[4]);
    }
    /* 横瓦口：每 9px 一道，画在当行的收分之内 */
    for (j = 9; j < h - 4; j += 9) {
      ins = snap(inset * Math.pow(1 - j / Math.max(1, h - 1), 1.6));
      HL(c, x + ins, y + j, w - ins * 2, T[0]);
      HL(c, x + ins, y + j + 1, w - ins * 2, T[3]);
    }
    /* 脊下第一排瓦压暗：坡面才立得起来 */
    ins = snap(inset * 0.9);
    R(c, x + ins, y + 1, w - ins * 2, 4, T[1]);
    HL(c, x + ins, y, w - ins * 2, T[0]);
    /* 左上受光、右下压暗 */
    SPECK(c, x + inset, y + 3, Math.max(2, snap(w * 0.3)), h - 8, 'rgba(255,255,255,.12)', 1, 1);
    SPECK(c, x + w - inset - snap(w * 0.3), y + 3, snap(w * 0.3), h - 8, 'rgba(0,0,0,.20)', 1, 3);
    /* 苔痕 / 水渍 + 两侧暗边 */
    SPECK(c, x + inset + 2, y + 4, Math.max(2, snap(w * 0.42)), 5, T.foliage ? T.foliage[1] : T[1], 1, 2);
    VL(c, x + inset, y + 1, h - 6, T[0]);
    VL(c, x + w - inset - 1, y + 1, h - 6, T[0]);
  }
  function ridge(c, x, y, w, T) {                    /* 屋脊 + 两端起翘的脊头（破掉矩形轮廓） */
    R(c, x, y - 2, w, 5, T[1]);
    HL(c, x, y - 2, w, T[3]);
    HL(c, x, y + 2, w, T[0]);
    R(c, x - 3, y - 6, 6, 5, T[3]);
    R(c, x - 5, y - 10, 4, 5, T[2]);
    HL(c, x - 3, y - 6, 6, T[4]);
    R(c, x + w - 3, y - 6, 6, 5, T[3]);
    R(c, x + w + 1, y - 10, 4, 5, T[2]);
    HL(c, x + w - 3, y - 6, 6, T[4]);
    VL(c, x, y - 2, 5, T[0]);
    VL(c, x + w - 1, y - 2, 5, T[0]);
  }
  function eave(c, x, y, w, T, rafter) {
    R(c, x - 3, y, w + 6, 5, T[2]);
    HL(c, x - 3, y, w + 6, T[4]);
    HL(c, x - 3, y + 4, w + 6, T[0]);
    if (rafter !== 0) for (var k = x + 2; k < x + w - 2; k += 9) R(c, k, y + 5, 3, 3, T[1]);
    R(c, x - 3, y + 5, w + 6, 2, 'rgba(0,0,0,.48)');
    SPECK(c, x - 3, y + 7, w + 6, 4, 'rgba(0,0,0,.32)', 2, 1);
  }
  function chimney(c, x, y, T, smoke) {
    R(c, x, y, 12, 18, T[2]);
    VL(c, x, y, 18, T[3]); VL(c, x + 11, y, 18, T[0]);
    for (var j = y + 5; j < y + 17; j += 5) HL(c, x, j, 12, T[0]);
    R(c, x - 2, y - 3, 16, 4, T[3]);
    HL(c, x - 2, y - 3, 16, T[4]);
    if (smoke) { SPECK(c, x + 3, y - 14, 7, 11, 'rgba(200,210,225,.30)', 1, 2); SPECK(c, x - 1, y - 24, 9, 11, 'rgba(200,210,225,.18)', 1, 1); }
  }
  function skylight(c, x, y, w, h, E) {
    R(c, x - 2, y - 2, w + 4, h + 4, E.T.slate[0]);
    R(c, x, y, w, h, E.T.cold[3]);
    R(c, x, y, w, 3, E.T.cold[4]);
    VL(c, x + ((w / 2) | 0), y, h, E.T.ink);
    HL(c, x, y + ((h / 2) | 0), w, E.T.ink);
  }
  /* 墙：三档横向明暗 + 材质纹理（板 / 砖 / 石 / 盐 / 礁 / 雾） */
  function wallOf(c, x, y, w, h, T, kind, rnd) {
    if (w < 2 || h < 2) return;
    var a = Math.max(1, snap(h * 0.30)), low = Math.max(1, snap(h * 0.34));
    R(c, x, y, w, a, T[3]);
    R(c, x, y + a, w, h - a - low, T[2]);
    R(c, x, y + h - low, w, low, T[1]);
    SPECK(c, x, y + a - 1, w, 3, T[2], 2, 1);
    SPECK(c, x, y + h - low - 1, w, 3, T[1], 2, 3);
    var j, k, bw;
    if (kind === 'plank') {
      for (j = 6; j < h - 2; j += 7) { HL(c, x, y + j, w, T[0]); HL(c, x, y + j + 1, w, T[4]); }
      for (k = x + 13; k < x + w - 3; k += 27) if (rnd() > 0.35) VL(c, k, y + 2, h - 4, T[1]);
    } else if (kind === 'brick') {
      for (j = 0; j < h - 3; j += 9) {
        HL(c, x, y + j, w, T[0]);
        for (k = x + (((j / 9) | 0) % 2 ? 0 : 12); k < x + w - 2; k += 26) VL(c, k, y + j + 1, 8, T[0]);
      }
    } else if (kind === 'stone' || kind === 'granite' || kind === 'cliff') {
      for (j = 0; j < h - 4; j += 10) {
        HL(c, x, y + j + 9, w, T[0]);
        k = x + ((j / 10 | 0) % 2 ? 5 : 0);
        while (k < x + w - 4) {
          bw = 14 + snap(rnd() * 15);
          VL(c, k, y + j + 1, 8, T[0]);
          if (rnd() > 0.55) HL(c, k + 1, y + j + 1, Math.min(bw, x + w - k - 1), T[4]);
          k += bw;
        }
      }
      if (kind !== 'cliff') SPECK(c, x, y + 2, w, h - 4, T[0], 1, 2);
    } else if (kind === 'salt') {
      for (j = 0; j < h - 3; j += 8) {
        HL(c, x, y + j, w, T[0]);
        for (k = x + (((j / 8) | 0) % 2 ? 6 : 0); k < x + w - 2; k += 17) VL(c, k, y + j + 1, 7, T[0]);
      }
      SPECK(c, x, y, w, h, '#ffffff', 1, 1);
      SPECK(c, x, y + h - 4, w, 4, T[4], 3, 3);
    } else if (kind === 'fog') {
      SPECK4(c, x, y, w, h, 'rgba(214,226,240,.50)', 9, 0);
      SPECK4(c, x, y + 2, w, h - 4, 'rgba(214,226,240,.35)', 6, 2);
    }
    R(c, x, y, w, 2, T[4]);                          /* 墙头受光 */
    HL(c, x, y, w, shade(T[4], 0.28));
    R(c, x, y + h - 3, w, 3, shade(T[1], -0.32));    /* 墙脚压暗 */
    VL(c, x, y, h, shade(T[0], -0.25));              /* 两侧暗边：跟地面分开 */
    VL(c, x + w - 1, y, h, shade(T[0], -0.25));
    R(c, x + w - 4, y, 4, h, 'rgba(0,0,0,.16)');     /* 右侧暗面 → 有体积 */
  }
  function winLit(c, x, y, w, h, T, big) {
    R(c, x - 2, y - 2, w + 4, h + 4, T.ink);
    HL(c, x - 2, y - 2, w + 4, shade(T.ink, 0.35));
    R(c, x, y, w, h, T.lamp[2]);
    R(c, x, y, w, Math.max(2, snap(h * 0.42)), T.cream[4]);
    R(c, x + 1, y + 1, Math.max(2, snap(w * 0.42)), Math.max(2, snap(h * 0.3)), '#fffdf2');
    R(c, x, y + h - 2, w, 2, T.lamp[0]);
    VL(c, x + ((w / 2) | 0), y, h, T.ink);
    HL(c, x, y + ((h / 2) | 0), w, T.ink);
    SPECK(c, x, y + h + 2, w, 7, 'rgba(255,206,132,.32)', 2, 1);     /* 光洒到墙上 */
    glowAt(c, x + ((w / 2) | 0), y + ((h / 2) | 0), big ? Math.max(20, w * 1.2) : Math.max(14, w * 0.9), '255,206,132', big ? 1 : 0.8);
  }
  function winCold(c, x, y, w, h, T) {
    R(c, x - 2, y - 2, w + 4, h + 4, T.ink);
    R(c, x, y, w, h, T.cold[1]);
    R(c, x, y, w, Math.max(1, snap(h * 0.30)), T.cold[2]);
    R(c, x + 1, y + h - 4, w - 2, 2, T.cold[3]);     /* 斜反光 */
    VL(c, x + ((w / 2) | 0), y, h, T.ink);
    HL(c, x, y + ((h / 2) | 0), w, T.ink);
    FRAME(c, x, y, w, h, T.ink);
  }
  function windows(c, x, wallY, w, wallH, E, n, forceLit) {
    if (wallH < 14) return;
    n = Math.max(1, n);
    var i, ww = 20, gap = (w - n * ww) / (n + 1), wx, wy = wallY + Math.max(4, snap(wallH * 0.22));
    var wh = Math.min(20, wallH - 12);
    for (i = 0; i < n; i++) {
      wx = x + snap(gap * (i + 1) + ww * i);
      if (wx + ww > x + w - 3) break;
      if (E.lit || forceLit === true) winLit(c, wx, wy, ww, wh, E.T, false);
      else winCold(c, wx, wy, ww, wh, E.T);
    }
  }
  function doorway(c, x, y, w, h, E, o) {
    o = o || {};
    var D = o.door || E.T.log;
    R(c, x - 3, y - 4, w + 6, h + 4, shade((E.wall && E.wall[0]) || D[0], -0.3));
    R(c, x, y, w, h, D[2]);
    var k;
    for (k = x + 3; k < x + w - 2; k += 6) VL(c, k, y + 1, h - 2, D[0]);
    R(c, x, y, w, 2, D[3]);
    R(c, x, y + h - 1, w, 1, D[0]);
    R(c, x + w - 5, y + snap(h * 0.5), 2, 3, E.T.brass[3]);
    if (o.arch) { R(c, x - 2, y - 6, w + 4, 6, D[1]); HL(c, x - 2, y - 6, w + 4, D[3]); }
    if (o.open) { R(c, x + 2, y + 2, w - 4, h - 4, 'rgba(8,10,14,.85)'); }
    if (o.lamp) lantern(c, x + ((w / 2) | 0), y - 12, E, 1);
    R(c, x - 4, y + h, w + 8, 3, E.T.stone[3]);      /* 门槛石 */
    R(c, x - 6, y + h + 3, w + 12, 2, E.T.stone[2]);
    HL(c, x - 4, y + h, w + 8, E.T.stone[4]);
  }
  function lantern(c, x, y, E, big) {
    var T = E.T, r = big ? 6 : 4, hgt = big ? 13 : 9;
    VL(c, x, y - (big ? 9 : 6), big ? 9 : 6, T.metal[1]);
    R(c, x - r - 1, y - 1, r * 2 + 2, 2, T.metal[2]);            /* 顶盖 */
    R(c, x - r, y + 1, r * 2, hgt, T.lamp[3]);
    R(c, x - r, y + 1, r * 2, 3, T.cream[4]);
    R(c, x - r, y + hgt - 2, r * 2, 2, T.lamp[1]);
    VL(c, x, y + 1, hgt, 'rgba(90,50,10,.45)');
    R(c, x - 2, y + hgt + 1, 4, 2, T.metal[1]);
    VL(c, x, y + hgt + 3, 3, T.acc[3]);
    glowAt(c, x, y + 1 + hgt / 2, big ? 26 : 17, '255,206,132', big ? 1 : 0.7);
  }
  function glowAt(c, cx, cy, r, rgbStr, strength) {
    r = Math.max(6, snap(r));
    var band, rr, alpha;
    for (band = 3; band >= 1; band--) {
      rr = snap(r * band / 3);
      alpha = (0.045 + (3 - band) * 0.05) * (strength == null ? 1 : strength);
      SPECK(c, cx - rr, cy - snap(rr * 0.66), rr * 2, snap(rr * 1.32), 'rgba(' + rgbStr + ',' + alpha.toFixed(3) + ')', 1, band & 3);
    }
  }
  function candle(c, x, y, E) {
    R(c, x - 2, y, 5, 3, E.T.metal[3]);
    R(c, x - 1, y - 7, 2, 7, E.T.white[4]);
    R(c, x - 1, y - 9, 2, 2, E.T.lamp[3]);
    R(c, x - 2, y - 11, 4, 2, 'rgba(255,226,150,.75)');
    glowAt(c, x, y - 8, 15, '255,206,132', 0.8);
  }
  function coinSign(c, x, y, r, T) {                  /* 铜钱招牌：外圆内方 */
    R(c, x - 5, y - r - 4, 11, 4, T[1]);
    HL(c, x - 5, y - r - 4, 11, T[3]);
    DISC(c, x, y, r, T[4], T[3], T[2]);
    OVAL(c, x, y, r - 1, r - 2, T[4], T[3], T[2]);
    R(c, x - 3, y - 3, 7, 7, '#2a1c0b');
    FRAME(c, x - 3, y - 3, 7, 7, T[4]);
    VL(c, x - r - 1, y, r * 2, T[0]);
  }
  function clothSign(c, x, y, w, h, T) {             /* 招幌：布 + 抖动边 */
    R(c, x, y, w, h, T.cloth[2]);
    VL(c, x, y, h, T.cloth[3]);
    VL(c, x + w - 1, y, h, T.cloth[1]);
    SPECK(c, x, y + h - 5, w, 5, 'rgba(0,0,0,.25)', 2, 1);
    R(c, x - 1, y - 3, w + 2, 3, T.log[2]);
    var k;
    for (k = y + 3; k < y + h - 3; k += 6) HL(c, x + 2, k, w - 4, T.cloth[4]);
  }
  function plankStep(c, x, y, w, n, T) {
    for (var i = 0; i < n; i++) {
      R(c, x + i * 2, y + i * 3, w - i * 4, 3, i % 2 ? T[3] : T[2]);
      HL(c, x + i * 2, y + i * 3, w - i * 4, T[4]);
      HL(c, x + i * 2, y + i * 3 + 3, w - i * 4, T[0]);
    }
  }
  function crate(c, x, y, w, h, T) {
    R(c, x, y, w, h, T[2]);
    HL(c, x, y, w, T[4]); VL(c, x, y, h, T[3]);
    HL(c, x, y + h - 1, w, T[0]); VL(c, x + w - 1, y, h, T[0]);
    HL(c, x, y + snap(h * 0.42), w, T[0]);
    HL(c, x, y + snap(h * 0.42) + 1, w, T[3]);
    VL(c, x + 2, y + 2, h - 4, T[1]); VL(c, x + w - 3, y + 2, h - 4, T[1]);
    R(c, x + 1, y + 1, 1, 1, T[4]); R(c, x + w - 2, y + 1, 1, 1, T[4]);
  }
  function barrel(c, x, y, w, h, T) {                /* T = 桶身色阶数组 */
    OVAL(c, x + (w >> 1), y + h - 1, w >> 1, 2, null, 'rgba(0,0,0,.25)', null);
    TAPER(c, x, y, w, h, T, 2, 2.2);
    R(c, x + 1, y + snap(h * 0.22), w - 2, 2, T[0]);            /* 两道铁箍 */
    R(c, x + 1, y + snap(h * 0.72), w - 2, 2, T[0]);
    R(c, x + 2, y - 2, w - 5, 3, T[3]);                         /* 桶盖 */
    HL(c, x + 2, y - 2, w - 5, T[4]);
  }
  function ropeCoil(c, x, y, r, T) {
    DISC(c, x, y, r, T[3], T[2], T[1]);
    DISC(c, x, y, r - 2, T[2], T[3], T[2]);
    DISC(c, x, y, r - 4, T[2], T[2], T[1]);
    DISC(c, x, y, 1, null, T[4], null);
  }
  function saltPile(c, x, y, w, h, T) {
    TAPER(c, x, y, w, h, T, snap(w * 0.34), 1.5);
    SPECK(c, x, y, w, h, '#ffffff', 1, 2);
    HL(c, x + snap(w * 0.3), y + 1, snap(w * 0.4), '#ffffff');
    R(c, x, y + h, w, 1, 'rgba(0,0,0,.18)');
  }
  function abacus(c, x, y, w, T, bead) {             /* T = 木色阶数组，bead = 算珠颜色 */
    R(c, x, y, w, 13, T[0]);
    R(c, x + 1, y + 1, w - 2, 11, T[3]);
    HL(c, x + 1, y + 4, w - 2, T[0]);
    HL(c, x + 1, y + 9, w - 2, T[0]);
    var i;
    for (i = x + 2; i < x + w - 3; i += 4) {
      R(c, i, y + 2, 3, 2, bead); R(c, i, y + 6, 3, 2, bead);
    }
    HL(c, x, y, w, T[4]);
  }
  function scaleBeam(c, x, y, T) {                   /* 杆秤 */
    R(c, x - 18, y, 36, 2, T.brass[3]);
    HL(c, x - 18, y, 36, T.brass[4]);
    VL(c, x, y - 10, 11, T.brass[2]);
    DISC(c, x, y - 12, 3, T.brass[4], T.brass[3], T.brass[1]);
    R(c, x - 15, y + 2, 2, 7, T.brass[1]);
    OVAL(c, x - 14, y + 11, 7, 3, T.brass[4], T.brass[3], T.brass[1]);
    HL(c, x - 20, y + 10, 13, T.brass[4]);
    R(c, x + 11, y + 2, 2, 5, T.brass[1]);
    R(c, x + 8, y + 7, 8, 7, T.metal[2]);
    HL(c, x + 8, y + 7, 8, T.metal[3]);
    HL(c, x + 8, y + 8, 8, T.metal[0]);
  }
  function openBook(c, x, y, w, h, T) {
    R(c, x, y, w, h, T.white[1]);
    R(c, x, y, w, 1, T.white[4]);
    HL(c, x, y + h - 1, w, '#8a7c5c');
    VL(c, x + (w >> 1), y, h, '#9c8c68');
    var j, half = (w >> 1) - 4;
    for (j = 2; j < h - 2; j += 3) {
      HL(c, x + 2, y + j, half, 'rgba(90,80,60,.55)');
      HL(c, x + (w >> 1) + 2, y + j, half, 'rgba(90,80,60,.55)');
    }
  }
  function paperSlip(c, x, y, w, h, rot) {           /* 当票 / 告示：白纸 + 两行墨迹 */
    R(c, x, y, w, h, '#e6dcc2');
    R(c, x, y, w, 1, '#f6efdd');
    if (rot) R(c, x + w - 2, y, 2, 2, '#c8bd9d');
    HL(c, x + 1, y + 2, w - 3, 'rgba(70,60,40,.55)');
    HL(c, x + 1, y + 4, w - 4, 'rgba(70,60,40,.45)');
    if (h > 7) HL(c, x + 1, y + 6, w - 5, 'rgba(70,60,40,.40)');
  }
  function scrollRow(c, x, y, w, h, T, n) {          /* 卷宗：横放圆卷 */
    var i, sw = snap(w / n);
    for (i = 0; i < n; i++) {
      var sx = x + i * sw;
      R(c, sx, y, Math.max(3, sw - 2), h, T.white[2]);
      HL(c, sx, y, Math.max(3, sw - 2), T.white[4]);
      HL(c, sx, y + h - 1, Math.max(3, sw - 2), '#8a8470');
      VL(c, sx, y + 1, h - 2, '#b8b19a');
      VL(c, sx + Math.max(2, sw - 3), y + 1, h - 2, '#8a8470');
      R(c, sx + 1, y + (h >> 1) - 1, Math.max(2, sw - 4), 2, E_dark(T));
    }
  }
  function E_dark(T) { return T && T.wood ? T.wood[0] : '#2b2118'; }
  function crateStack(c, x, y, T, rnd) {
    crate(c, x, y + 12, 26, 20, T);
    crate(c, x + 4, y - 8, 22, 20, T);
    if (rnd() > 0.4) crate(c, x + 26, y + 4, 20, 28, T);
  }
  function jar(c, x, y, w, h, T) {
    OVAL(c, x, y + h - 2, w >> 1, 2, null, 'rgba(0,0,0,.22)', null);
    TAPER(c, x, y, w, h, T, snap(w * 0.18), 0.8);
    R(c, x + snap(w * 0.2), y - 3, snap(w * 0.6), 4, T[1]);
    HL(c, x + snap(w * 0.2), y - 3, snap(w * 0.6), T[3]);
    HL(c, x + snap(w * 0.3), y + 2, snap(w * 0.4), T[4]);
  }
  function netDrape(c, x, y, w, h, T) {              /* 渔网：抖动网目 */
    SPECK(c, x, y, w, h, T.rope[2], 2, 1);
    var i;
    for (i = 0; i < w; i += 4) VL(c, x + i, y, h, 'rgba(160,138,92,.45)');
    for (i = 0; i < h; i += 4) HL(c, x, y + i, w, 'rgba(160,138,92,.35)');
  }
  function rock(c, x, y, w, h, T, rnd, moss) {       /* 礁石：不规则圆丘 + 苔 + 白浪（T = 岩色阶） */
    var j, ww, ins;
    for (j = 0; j < h; j++) {
      ins = snap((w * 0.16) * Math.pow(1 - j / h, 1.8) + rnd() * 1.4);
      ww = w - ins * 2;
      R(c, x + ins, y + j, ww, 1, j < h * 0.22 ? T[3] : (j < h * 0.62 ? T[2] : T[1]));
    }
    HL(c, x + snap(w * 0.2) + 1, y, Math.max(2, w - snap(w * 0.4) - 2), T[4]);   /* 岩顶受光 */
    SPECK(c, x + 2, y + 2, w - 4, snap(h * 0.4), moss || T[2], 1, 2);
    SPECK(c, x, y + h - 6, w, 6, 'rgba(255,255,255,.5)', 2, 1);
    R(c, x + 2, y + h + 1, w - 4, 2, 'rgba(0,0,0,.28)');                        /* 落地影 */
  }
  function rail(c, x, y, w, T) {                     /* 栏杆（T = 金属色阶数组） */
    R(c, x, y, w, 3, T[2]);
    HL(c, x, y, w, T[4]);
    HL(c, x, y + 3, w, T[0]);
    for (var k = x + 3; k < x + w - 2; k += 11) R(c, k, y + 3, 2, 9, T[1]);
    R(c, x, y + 11, w, 2, T[2]);
  }
  function glassGrid(c, x, y, w, h, E, litAll) {     /* 灯室玻璃格 */
    R(c, x, y, w, h, E.T.ink);
    var cols = Math.max(2, (w / 8) | 0), rows = Math.max(1, (h / 8) | 0);
    var cw = snap(w / cols), chh = snap(h / rows), i, j;
    for (j = 0; j < rows; j++) {
      for (i = 0; i < cols; i++) {
        var on = litAll || ((i + j) % 3 !== 1);
        R(c, x + 1 + i * cw, y + 1 + j * chh, cw - 1, chh - 1, on ? E.T.lamp[3] : E.T.cold[2]);
        if (on) R(c, x + 1 + i * cw, y + 1 + j * chh, cw - 1, 2, E.T.cream[4]);
      }
    }
  }
  function lightCone(c, x, y, spread, len, rgbStr) { /* 灯锥：逐行抖动的扇形（不是渐变） */
    var j, ww;
    for (j = 0; j < len; j++) {
      ww = snap(spread * (j / len));
      SPECK(c, x - ww, y + j, ww * 2, 1, 'rgba(' + rgbStr + ',' + (0.30 - 0.26 * (j / len)).toFixed(3) + ')', 2, j & 3);
    }
  }
  function flag(c, x, y, T, h) {
    R(c, x - 1, y - h, 2, h, T.metal[2]);
    R(c, x - 1, y - h - 2, 3, 3, T.brass[3]);
    var i;
    for (i = 0; i < 14; i++) R(c, x + 1, y - h + 2 + i, 20 - (i > 6 ? (i - 6) : 0), 1, i % 3 === 0 ? T.acc[3] : (i % 3 === 1 ? T.acc[2] : T.acc[1]));
  }

  /* ============================================================
     七、逐栋画法
     ============================================================ */
  function paintHouse(c, b, E) {                     /* 兜底：普通民居 */
    var T = E.T, x = b.x, y = b.y, w = b.w, h = b.h;
    var rh = snap(h * 0.56), wy = y + rh, wh = h - rh - 5;
    groundShadow(c, x, y + h - 7, w, 5);
    slope(c, x - 3, y, w + 6, rh - 4, T.thatch, 6);
    ridge(c, x - 3, y, w + 6, T.thatch);
    if (E.rnd() > 0.45) chimney(c, x + snap(w * 0.7), y + 5, T.brick, E.mood.lit);
    eave(c, x - 4, y + rh - 4, w + 8, T.thatch);
    wallOf(c, x, wy, w, wh, T.plank, 'plank', E.rnd);
    windows(c, x, wy, w, wh, E, Math.max(2, (w / 52) | 0));
    doorway(c, x + (w >> 1) - 9, wy + wh - 30, 18, 30, E, { lamp: 0 });
  }

  function paintPawnshop(c, b, E) {                  /* 记当铺：铜钱招牌 + 两只灯笼 + 橱窗 */
    var T = E.T, x = b.x, y = b.y, w = b.w, h = b.h, rnd = E.rnd;
    var rh = snap(h * 0.52), wy = y + rh, wh = h - rh - 6;
    groundShadow(c, x, y + h - 7, w, 5);
    slope(c, x - 4, y, w + 8, rh - 5, T.tile, 9);
    ridge(c, x - 4, y, w + 8, T.tile);
    SPECK(c, x + 6, y + 5, w - 12, 6, T.foliage[1], 1, 2);
    chimney(c, x + snap(w * 0.74), y + 4, T.brick, E.mood.lit);
    skylight(c, x + snap(w * 0.20), y + 13, 22, 13, E);
    eave(c, x - 5, y + rh - 5, w + 10, T.tile);
    wallOf(c, x, wy, w, wh, T.plank, 'plank', rnd);
    /* 两只橱窗：左摆秤，右摆当票与算盘 */
    var wyy = wy + 7, ww1 = 34, ww2 = 34;
    winLit(c, x + 10, wyy, ww1, 24, T, true);
    scaleBeam(c, x + 10 + (ww1 >> 1), wyy + 12, T);
    winLit(c, x + w - 44, wyy, ww2, 24, T, true);
    abacus(c, x + w - 40, wyy + 8, 26, T.log, T.brass[3]);
    var dx = x + (w >> 1) - 13;
    doorway(c, dx, wy + wh - 34, 26, 34, E, { lamp: 0 });
    coinSign(c, x + (w >> 1), wy + 5, 12, T.brass);
    clothSign(c, x + 6, wy + 2, 11, 30, T);
    clothSign(c, x + w - 17, wy + 2, 11, 30, T);
    lantern(c, dx - 9, wy + 6, E, 1);
    lantern(c, dx + 35, wy + 6, E, 1);
    plankStep(c, dx - 8, y + h - 8, 42, 3, T.stone);
    paperSlip(c, x + 5, wy + wh - 15, 9, 12, 1);
    paperSlip(c, x + w - 14, wy + wh - 18, 9, 12, 0);
    R(c, x, wy, w, 2, T.log[4]);
  }

  function paintArchiveHall(c, b, E) {               /* 岛史馆：石造 + 双柱 + 拱窗 + 门匾 */
    var T = E.T, x = b.x, y = b.y, w = b.w, h = b.h, rnd = E.rnd;
    var rh = snap(h * 0.46), wy = y + rh, wh = h - rh - 6;
    groundShadow(c, x, y + h - 7, w, 5);
    slope(c, x - 4, y, w + 8, rh - 6, T.slate, 4);
    ridge(c, x - 4, y, w + 8, T.slate);
    eave(c, x - 5, y + rh - 6, w + 10, T.slate);
    wallOf(c, x, wy, w, wh, T.granite, 'stone', rnd);
    /* 山墙三角 + 门匾 */
    TAPER(c, x + (w >> 2), wy - 6, w >> 1, 8, T.granite, 6, 1);
    R(c, x + (w >> 1) - 20, wy + 2, 40, 11, T.stone[1]);
    FRAME(c, x + (w >> 1) - 20, wy + 2, 40, 11, T.brass[2]);
    var i;
    for (i = 0; i < 4; i++) R(c, x + (w >> 1) - 16 + i * 9, wy + 6, 6, 3, T.white[4]);
    /* 两根石柱 */
    var px1 = x + 12, px2 = x + w - 20;
    [px1, px2].forEach(function (px) {
      R(c, px, wy + 16, 8, wh - 18, T.stone[3]);
      VL(c, px, wy + 16, wh - 18, T.stone[4]);
      VL(c, px + 7, wy + 16, wh - 18, T.stone[1]);
      R(c, px - 2, wy + 14, 12, 4, T.stone[2]);
      R(c, px - 2, wy + wh - 5, 12, 5, T.stone[2]);
      HL(c, px - 2, wy + 14, 12, T.stone[4]);
    });
    /* 拱窗两扇（阶梯拱） */
    var wx = x + 30, wyy = wy + 12;
    archWindow(c, wx, wyy, 22, 30, E, false);
    archWindow(c, x + w - 52, wyy, 22, 30, E, true);
    var dx = x + (w >> 1) - 12;
    doorway(c, dx, wy + wh - 32, 24, 32, E, { arch: 1 });
    lantern(c, dx - 12, wy + 8, E, 0);
    plankStep(c, dx - 10, y + h - 9, 44, 4, T.stone);
    R(c, x, wy, w, 2, T.stone[4]);
  }
  function archWindow(c, x, y, w, h, E, lit) {
    var T = E.T, i;
    if (lit) { winLit(c, x, y, w, h - 4, T, true); }
    else { winCold(c, x, y, w, h - 4, T); }
    for (i = 0; i < 5; i++) {
      R(c, x - 2 + i, y - 2 - i, w + 4 - i * 2, 1, T.ink);
      R(c, x + i, y - 1 - i, w - i * 2, 1, lit ? T.lamp[3] : T.cold[2]);
    }
    R(c, x + (w >> 1), y - 6, 1, 6, T.ink);
  }

  function paintStallShed(c, b, E) {                 /* 告示棚：布棚 + 告示纸 + 一盏灯 */
    var T = E.T, x = b.x, y = b.y, w = b.w, h = b.h;
    groundShadow(c, x, y + h - 6, w, 4);
    /* 四根柱 */
    [x + 5, x + w - 11].forEach(function (px) {
      R(c, px, y + 18, 6, h - 22, T.log[2]);
      VL(c, px, y + 18, h - 22, T.log[3]);
    });
    /* 布棚：斜的，带抖动边 */
    var j;
    for (j = 0; j < 16; j++) {
      R(c, x - 3 + j, y + 2 + j, w + 6 - j * 2, 1, j % 2 ? T.cloth[3] : T.cloth[2]);
    }
    SPECK(c, x - 3, y + 17, w + 6, 4, 'rgba(0,0,0,.30)', 2, 1);
    R(c, x - 3, y + 2, w + 6, 3, T.cloth[4]);
    /* 背上挂满告示 */
    R(c, x + 8, y + 22, w - 16, h - 30, T.plank[2]);
    FRAME(c, x + 8, y + 22, w - 16, h - 30, T.log[0]);
    HL(c, x + 8, y + 22, w - 16, T.plank[4]);
    var i;
    for (i = 0; i < 4; i++) paperSlip(c, x + 12 + (i % 2) * 26, y + 26 + ((i / 2) | 0) * 18, 20, 15, i % 2);
    lantern(c, x + w - 16, y + 20, E, 0);
    crate(c, x + 2, y + h - 24, 22, 22, T.plank);
    R(c, x + 6, y + h - 20, 14, 3, T.white[3]);
  }

  function paintCounter(c, b, E) {                   /* 记当铺柜台：算盘 + 秤 + 账本 + 蜡烛 */
    var T = E.T, x = b.x, y = b.y, w = b.w, h = b.h, rnd = E.rnd;
    groundShadow(c, x, y + h - 4, w, 3);
    R(c, x, y + 16, w, h - 18, T.log[1]);            /* 柜身 */
    wallOf(c, x, y + 18, w, h - 20, T.wood, 'plank', rnd);
    R(c, x - 2, y + 12, w + 4, 8, T.log[3]);         /* 台面 */
    HL(c, x - 2, y + 12, w + 4, T.log[4]);
    HL(c, x - 2, y + 19, w + 4, T.log[0]);
    HL(c, x - 2, y + 15, w + 4, T.wood[2]);
    /* 台面上的家伙什，一件一件摆开 */
    abacus(c, x + 18, y + 4, 44, T.log, T.brass[4]);
    scaleBeam(c, x + 118, y + 8, T);
    openBook(c, x + 190, y + 3, 46, 10, T);
    candle(c, x + 258, y + 6, E);
    paperSlip(c, x + 286, y + 4, 16, 9, 1);
    paperSlip(c, x + 306, y + 6, 14, 8, 0);
    var k;
    for (k = x + 340; k < x + w - 20; k += 30) jar(c, k, y + 2, 12, 12, T.metal);
    lantern(c, x + 150, y - 6, E, 1);
    R(c, x + (w >> 1), y + 12, 1, 8, T.log[0]);
    /* 台前挂当票夹 */
    var i;
    for (i = 0; i < 12; i++) paperSlip(c, x + 14 + i * 42, y + h - 16 + (i % 2) * 2, 12, 14, i % 3 === 0);
  }

  function paintShelving(c, b, E) {                  /* 寄售架：格子 + 杂物 + 价签 */
    var T = E.T, x = b.x, y = b.y, w = b.w, h = b.h, rnd = E.rnd;
    groundShadow(c, x, y + h - 4, w, 3);
    wallOf(c, x, y, w, h - 3, T.wood, 'plank', rnd);
    FRAME(c, x, y, w, h - 3, T.log[0]);
    var cols = 3, rows = 2, cw = (w - 8) / cols, chh = (h - 12) / rows, i, j;
    for (j = 0; j < rows; j++) {
      for (i = 0; i < cols; i++) {
        var cx = x + 4 + i * cw, cy = y + 5 + j * chh;
        R(c, cx, cy, cw - 4, chh - 6, T.log[2]);
        HL(c, cx, cy, cw - 4, T.log[4]);
        var pick = rnd();
        if (pick > 0.62) jar(c, cx + 8, cy + chh - 20, 13, 13, T.metal);
        else if (pick > 0.32) crate(c, cx + 5, cy + 4, 26, 20, T.plank);
        else openBook(c, cx + 6, cy + 8, 26, 10, T);
        R(c, cx + 2, cy + 1, 10, 6, T.white[2]);     /* 价签 */
        VL(c, cx + 2, cy + 1, 6, T.white[4]);
      }
    }
    HL(c, x + 2, y + (h >> 1) - 1, w - 4, T.log[3]);
    R(c, x, y, w, 3, T.log[4]);
  }

  function paintBackroom(c, b, E) {                  /* 账房货架：布帘 + 货箱 + 门缝暖光 */
    var T = E.T, x = b.x, y = b.y, w = b.w, h = b.h, rnd = E.rnd;
    groundShadow(c, x, y + h - 4, w, 3);
    wallOf(c, x, y, w, h - 3, T.log, 'plank', rnd);
    var k;
    for (k = x + 6; k < x + w - 6; k += 9) {         /* 布帘 */
      VL(c, k, y + 4, h - 14, T.cloth[1]);
      VL(c, k + 1, y + 4, h - 14, T.cloth[3]);
      VL(c, k + 2, y + 4, h - 14, T.cloth[0]);
    }
    SPECK(c, x + 4, y + h - 16, w - 8, 5, T.cloth[4], 2, 1);
    R(c, x + 4, y + 1, w - 8, 4, T.log[4]);
    R(c, x + (w >> 1) - 6, y + 6, 12, h - 20, '#11131a');   /* 帘缝 */
    R(c, x + (w >> 1) - 4, y + 10, 8, h - 26, 'rgba(255,206,132,.28)');
    glowAt(c, x + (w >> 1), y + h - 12, 20, '255,206,132', 0.5);
    crate(c, x + 4, y + h - 26, 30, 22, T.plank);
    ropeCoil(c, x + w - 14, y + h - 12, 9, T.rope);
  }

  function paintSaltBarn(c, b, E, variant) {         /* 盐仓甲乙丙：同族不同相 */
    var T = E.T, x = b.x, y = b.y, w = b.w, h = b.h, rnd = E.rnd;
    var rh = snap(h * 0.44), wy = y + rh, wh = h - rh - 6;
    groundShadow(c, x, y + h - 7, w, 5);
    if (variant === 2) {                             /* 乙：斜棚 */
      var j;
      for (j = 0; j < rh - 4; j++) R(c, x - 3 + snap(j * 0.5), y + j, w + 6 - j, 1, j % 2 ? T.metal[2] : T.metal[3]);
      R(c, x - 3, y, 4, rh - 4, T.metal[1]);
      R(c, x + w - 1, y, 4, rh - 4, T.metal[1]);
      eave(c, x - 4, y + rh - 4, w + 8, T.metal);
    } else {
      slope(c, x - 4, y, w + 8, rh - 4, T.thatch, 7);
      ridge(c, x - 4, y, w + 8, T.thatch);
      eave(c, x - 5, y + rh - 4, w + 10, T.thatch);
    }
    wallOf(c, x, wy, w, wh, T.salt, 'salt', rnd);
    if (variant === 3) {                             /* 丙：破檐 + 结晶霜 */
      R(c, x + w - 30, y + rh - 6, 26, 8, 'rgba(20,22,28,.55)');
      SPECK(c, x, y + rh - 3, w, 3, '#ffffff', 3, 1);
      SPECK(c, x + 4, y + rh - 6, w - 8, 4, 'rgba(255,255,255,.55)', 2, 3);
      HL(c, x - 5, y + rh - 4, w + 10, '#ffffff');
    }
    if (variant === 1) {
      saltPile(c, x + 8, y + h - 30, 34, 24, T.white);
      saltPile(c, x + w - 38, y + h - 26, 28, 20, T.white);
      R(c, x + (w >> 1) - 2, y + h - 34, 3, 28, T.wood[1]);
      R(c, x + (w >> 1) - 8, y + h - 36, 15, 6, T.wood[3]);
    } else if (variant === 2) {                       /* 绞盘 */
      var cx2 = x + (w >> 1);
      R(c, x + 8, y + h - 20, 10, 16, T.log[1]);
      R(c, x + w - 18, y + h - 20, 10, 16, T.log[1]);
      R(c, x + 6, y + h - 26, w - 12, 7, T.log[2]);
      DISC(c, cx2, y + h - 23, 9, T.metal[3], T.metal[2], T.metal[0]);
      DISC(c, cx2, y + h - 23, 3, T.metal[3], T.metal[1], T.metal[0]);
      R(c, cx2 + 9, y + h - 26, 12, 3, T.metal[1]);
      R(c, cx2 + 20, y + h - 29, 3, 9, T.metal[2]);
      ropeCoil(c, x + 16, y + h - 12, 8, T.rope);
    } else {
      R(c, x + 6, y + h - 26, 24, 22, T.log[1]);
      R(c, x + 10, y + h - 22, 16, 4, T.log[4]);
      HL(c, x + 6, y + h - 26, 24, T.wood[3]);
    }
    var dx = x + (w >> 1) - 11;
    doorway(c, dx, wy + wh - 28, 22, 28, E, { open: variant === 3, lamp: 0 });
    windows(c, x, wy, w, wh - 8, E, 1, variant !== 3);
    R(c, x, wy, w, 2, T.salt[4]);
  }

  function paintLightTower(c, b, E) {                /* 望归灯：礁岩基座 + 塔身收分 + 点着的灯室 */
    var T = E.T, x = b.x, y = b.y, w = b.w, h = b.h, rnd = E.rnd;
    groundShadow(c, x, y + h - 8, w, 6);
    /* 礁岩基座：占底下 1/3，逐行收分 + 层理 + 苔 + 白浪 */
    var rockH = snap(h * 0.34), rockY = y + h - rockH, j;
    for (j = 0; j < rockH; j++) {
      var ins = snap(7 * Math.pow(1 - j / rockH, 1.3) + rnd() * 2);
      R(c, x + ins, rockY + j, w - ins * 2, 1, j < rockH * 0.18 ? T.granite[4] : (j < rockH * 0.55 ? T.granite[2] : T.granite[1]));
    }
    for (j = 8; j < rockH - 4; j += 14) {
      var i2 = snap(7 * Math.pow(1 - j / rockH, 1.3));
      HL(c, x + i2, rockY + j, w - i2 * 2, T.granite[0]);
      HL(c, x + i2, rockY + j + 1, w - i2 * 2, T.granite[4]);
    }
    SPECK(c, x + 8, rockY + 5, w - 16, snap(rockH * 0.34), T.foliage[1], 1, 2);
    HL(c, x + 8, rockY, w - 16, T.granite[4]);
    SPECK(c, x + 6, rockY + rockH - 7, w - 12, 7, 'rgba(255,255,255,.5)', 2, 1);
    /* 灯室（先定位置，塔身从它下面长出来） */
    var lw = snap(w * 0.66), lx = x + ((w - lw) >> 1), ly = y + snap(h * 0.16);
    /* 塔身：上细下粗 */
    var tw = snap(w * 0.5), tx = x + ((w - tw) >> 1);
    var tTop = ly + 26, tBot = rockY + 12, tH = tBot - tTop;
    TAPER(c, tx, tTop, tw, tH, T.stone, snap(tw * 0.18), 0.7);
    for (j = 0; j < tH; j += 10) {
      var in2 = snap(tw * 0.18 * Math.pow(1 - j / tH, 0.7));
      HL(c, tx + in2, tTop + j, tw - in2 * 2, T.stone[0]);
      HL(c, tx + in2, tTop + j + 1, tw - in2 * 2, T.stone[3]);
    }
    [0.3, 0.62, 0.9].forEach(function (t) {
      var yy = tTop + snap(tH * t), in3 = snap(tw * 0.18 * Math.pow(1 - t, 0.7));
      R(c, tx + in3 - 1, yy, tw - in3 * 2 + 2, 4, T.stone[3]);
      HL(c, tx + in3 - 1, yy, tw - in3 * 2 + 2, T.stone[4]);
      HL(c, tx + in3 - 1, yy + 4, tw - in3 * 2 + 2, T.stone[0]);
    });
    VL(c, tx, tTop, tH, T.stone[0]);                  /* 两侧勾边：跟礁岩分开 */
    VL(c, tx + tw - 1, tTop, tH, T.stone[0]);
    /* 塔门 + 旧钟（都在南面，玩家看得见） */
    var dx = tx + ((tw >> 1) | 0) - 9;
    doorway(c, dx, tBot - 34, 18, 34, E, { lamp: 0 });
    clockFace(c, tx + 10, tTop + snap(tH * 0.46), 14, E);
    /* 灯室：玻璃全亮 + 平台 + 锥顶 + 风向球 */
    R(c, lx - 3, ly + 22, lw + 6, 6, T.metal[1]);
    HL(c, lx - 3, ly + 22, lw + 6, T.metal[3]);
    glassGrid(c, lx, ly, lw, 22, E, 1);
    rail(c, lx - 4, ly + 24, lw + 8, T.metal);
    TAPER(c, lx - 2, ly - 11, lw + 4, 12, T.metal, snap(lw * 0.36), 1.4);
    R(c, lx + ((lw >> 1) | 0) - 2, ly - 17, 4, 7, T.metal[2]);
    DISC(c, lx + ((lw >> 1) | 0), ly - 19, 4, T.brass[4], T.brass[3], T.brass[1]);
    /* 灯亮着：光晕 + 顺塔身洒下来的一片暖 */
    glowAt(c, lx + ((lw >> 1) | 0), ly + 11, 64, '255,214,150', 1);
    SPECK(c, lx + 2, ly + 28, lw - 4, Math.max(6, snap(h * 0.22)), 'rgba(255,214,150,.22)', 1, 2);
    SPECK(c, x + 8, rockY + 3, w - 16, snap(h * 0.14), 'rgba(255,214,150,.16)', 1, 1);
  }
  function clockFace(c, cx, cy, r, E) {
    var T = E.T;
    DISC(c, cx, cy, r + 2, T.metal[3], T.metal[2], T.metal[0]);
    DISC(c, cx, cy, r, T.white[4], T.white[2], T.white[1]);
    VL(c, cx, cy - r + 3, r - 2, T.ink);            /* 长针指上 */
    HL(c, cx, cy - 1, snap(r * 0.55), T.ink);       /* 短针指右 */
    R(c, cx - 1, cy - 2, 3, 3, T.metal[0]);         /* 轴 */
    var i;
    for (i = 0; i < 4; i++) {
      if (i === 0) R(c, cx, cy - r + 1, 1, 2, T.metal[0]);
      if (i === 1) R(c, cx + r - 2, cy, 2, 1, T.metal[0]);
      if (i === 2) R(c, cx, cy + r - 2, 1, 2, T.metal[0]);
      if (i === 3) R(c, cx - r + 1, cy, 2, 1, T.metal[0]);
    }
  }

  function paintCarveRock(c, b, E) {                 /* 刻痕礁石：三道刻痕 + 水线 */
    var T = E.T, x = b.x, y = b.y, w = b.w, h = b.h;
    rock(c, x + 6, y + 10, w - 12, h - 14, T.granite, E.rnd, T.foliage[2]);
    SPECK(c, x + 10, y + 12, w - 20, 6, T.foliage[2], 1, 1);
    var i;
    for (i = 0; i < 3; i++) {
      HL(c, x + 18 + i * 3, y + 18 + i * 5, w - 40 - i * 6, 'rgba(240,246,255,.75)');
      HL(c, x + 18 + i * 3, y + 19 + i * 5, w - 40 - i * 6, 'rgba(40,52,66,.55)');
    }
    SPECK(c, x + 8, y + h - 8, w - 16, 6, 'rgba(255,255,255,.40)', 2, 2);
  }

  function paintLampBase(c, b, E) {                  /* 九宫灯阵基座：3×3 铜灯 */
    var T = E.T, x = b.x, y = b.y, w = b.w, h = b.h;
    groundShadow(c, x, y + h - 6, w, 4);
    R(c, x + 2, y + h - 22, w - 4, 20, T.stone[2]);
    HL(c, x + 2, y + h - 22, w - 4, T.stone[4]);
    HL(c, x + 2, y + h - 3, w - 4, T.stone[0]);
    var i, j, k = 0;
    for (j = 0; j < 3; j++) {
      for (i = 0; i < 3; i++) {
        var lx = x + 12 + i * 26, ly = y + h - 44 + j * 9;
        var on = (k === 0 || k === 4 || k === 5 || k === 8);
        R(c, lx - 5, ly + 6, 11, 3, T.brass[1]);
        R(c, lx - 4, ly, 9, 7, on ? T.lamp[3] : T.metal[0]);
        if (on) { R(c, lx - 4, ly, 9, 2, T.cream[4]); glowAt(c, lx, ly + 3, 15, '255,206,132', 0.8); }
        k++;
      }
    }
    R(c, x + 2, y + h - 50, w - 4, 8, T.brass[2]);
    HL(c, x + 2, y + h - 50, w - 4, T.brass[4]);
  }

  function paintShed(c, b, E) {                      /* 灯台工具棚：斜棚 + 油桶 + 绳圈 */
    var T = E.T, x = b.x, y = b.y, w = b.w, h = b.h, rnd = E.rnd;
    var rh = snap(h * 0.42), wy = y + rh, wh = h - rh - 6;
    groundShadow(c, x, y + h - 7, w, 5);
    var j;
    for (j = 0; j < rh; j++) R(c, x - 2 + snap(j * 0.35), y + j, w + 4 - j, 1, j % 2 ? T.plank[1] : T.plank[2]);
    for (j = 6; j < rh - 2; j += 8) HL(c, x - 2 + snap(j * 0.35), y + j, w + 4 - j, T.plank[0]);
    R(c, x - 2, y, w + 4, 3, T.plank[3]);
    eave(c, x - 3, y + rh - 3, w + 6, T.plank);
    wallOf(c, x, wy, w, wh, T.log, 'plank', rnd);
    doorway(c, x + 10, wy + wh - 30, 20, 30, E, { open: 0 });
    windows(c, x + 34, wy, w - 44, wh, E, 1, false);
    barrel(c, x + w - 34, y + h - 32, 18, 26, T.metal);
    barrel(c, x + w - 18, y + h - 26, 14, 20, T.rope);
    ropeCoil(c, x + w - 12, y + h - 10, 9, T.rope);
  }

  function paintDike(c, b, E) {                      /* 潮堤石堰：大石错缝 + 盐霜 + 一处豁口 */
    var T = E.T, x = b.x, y = b.y, w = b.w, h = b.h, rnd = E.rnd;
    R(c, x, y + h - 6, w, 4, 'rgba(0,0,0,.20)');
    var j, k, bw;
    for (j = 0; j < h - 6; j += 11) {
      var band = (j / 11) | 0;
      R(c, x, y + j, w, 11, band % 2 ? T.stone[2] : T.stone[3]);
      HL(c, x, y + j, w, T.stone[4]);
      HL(c, x, y + j + 10, w, T.stone[0]);
      k = x + (band % 2 ? 0 : 14);
      while (k < x + w - 6) {
        bw = 20 + snap(rnd() * 22);
        VL(c, k, y + j + 1, 9, T.stone[0]);
        k += bw;
      }
    }
    /* 豁口：把中间一段挖成缺口 */
    var gx = x + snap(w * 0.42), gw = 44;
    R(c, gx, y + 4, gw, h - 10, 'rgba(12,16,22,.55)');
    for (k = 0; k < 5; k++) R(c, gx - 4 + k * 12, y + h - 14 - (k % 2) * 4, 9, 8, T.stone[2]);
    SPECK(c, x, y, w, h - 6, '#ffffff', 1, 2);
    SPECK(c, x, y + h - 12, w, 6, 'rgba(255,255,255,.55)', 3, 1);
  }

  function paintWall(c, b, E, kind) {                /* 长墙类：礁壁 / 堤 / 板壁 / 盐堤 / 石壁 / 雾墙 */
    var T = E.T, x = b.x, y = b.y, w = b.w, h = b.h, rnd = E.rnd;
    var theme = kind === 'seawall' ? T.stone : (kind === 'plankwall' ? T.plank :
      (kind === 'saltwall' ? T.salt : (kind === 'fogwall' ? T.mist : (kind === 'wall' ? T.granite : T.granite))));
    if (kind === 'fogwall') {                        /* 雾墙：底下是墙，上面盖雾 */
      wallOf(c, x, y + 6, w, h - 6, T.granite, 'cliff', rnd);
      SPECK4(c, x, y, w, h, 'rgba(214,226,240,.55)', 10, 0);
      SPECK4(c, x, y - 2, w, h + 2, 'rgba(214,226,240,.30)', 6, 2);
      SPECK4(c, x, y + 2, w, h - 2, 'rgba(255,255,255,.22)', 3, 1);
      return;
    }
    if (kind === 'cliff') {                          /* 礁壁：分层岩 + 苔 + 浪花 */
      wallOf(c, x, y + 4, w, h - 4, T.granite, 'cliff', rnd);
      var j;
      for (j = 8; j < h - 4; j += 15) {
        HL(c, x, y + j, w, T.granite[0]);
        HL(c, x, y + j + 1, w, T.granite[3]);
        if (rnd() > 0.5) SPECK(c, x, y + j + 2, w, 6, T.foliage[1], 1, 2);
      }
      R(c, x, y, w, 5, T.granite[3]);
      HL(c, x, y, w, T.granite[4]);
      SPECK(c, x, y + h - 7, w, 7, 'rgba(255,255,255,.45)', 2, 1);
      return;
    }
    wallOf(c, x, y + 3, w, h - 3, theme, kind === 'plankwall' ? 'plank' : (kind === 'saltwall' ? 'salt' : 'stone'), rnd);
    R(c, x, y, w, 4, theme[3]);                      /* 压顶石 */
    HL(c, x, y, w, theme[4]);
    HL(c, x, y + 4, w, theme[0]);
    var k;
    for (k = x + (b.cw > 1 ? CELL : 2); k < x + w - 2; k += CELL) {
      VL(c, k, y + 5, h - 6, theme[0]);
      VL(c, k + 1, y + 5, h - 6, theme[3]);
    }
    if (kind === 'plankwall') {                      /* 板壁挂当票夹与钩 */
      var i2;
      for (i2 = 0; i2 < Math.max(1, (w / 90) | 0); i2++) {
        paperSlip(c, x + 18 + i2 * 90, y + 14, 11, 13, i2 % 2);
        R(c, x + 34 + i2 * 90, y + 12, 2, 6, T.metal[1]);
      }
      HL(c, x, y + 12, w, T.plank[4]);
    }
    if (kind === 'saltwall') SPECK(c, x, y, w, h, '#ffffff', 1, 3);
    if (kind === 'seawall') {
      SPECK(c, x, y + h - 8, w, 8, 'rgba(255,255,255,.35)', 2, 1);
      var i3;
      for (i3 = 0; i3 < (w / 140 | 0); i3++) R(c, x + 20 + i3 * 140, y - 4, 6, 5, T.stone[2]);   /* 系缆桩 */
    }
  }

  function paintShelfWall(c, b, E, variant) {        /* 卷宗架：木格 + 卷轴 + 编号签 */
    var T = E.T, x = b.x, y = b.y, w = b.w, h = b.h, rnd = E.rnd;
    groundShadow(c, x, y + h - 5, w, 4);
    R(c, x, y, w, h, T.wood[1]);
    FRAME(c, x, y, w, h, T.wood[0]);
    HL(c, x, y, w, T.wood[4]);
    var rows = 3, rh2 = snap((h - 6) / rows), i, j;
    for (j = 0; j < rows; j++) {
      R(c, x + 3, y + 3 + j * rh2, w - 6, rh2 - 3, T.wood[0]);
      HL(c, x + 3, y + 3 + j * rh2, w - 6, T.wood[3]);
      var n = variant === 2 ? 5 : 4;
      if (rnd() > 0.5) n++;
      scrollRow(c, x + 5, y + 5 + j * rh2, w - 14, Math.max(5, rh2 - 8), T, n);
      R(c, x + w - 9, y + 5 + j * rh2, 4, 6, T.white[2]);       /* 编号签 */
      HL(c, x + w - 9, y + 5 + j * rh2, 4, T.acc[3]);
    }
    if (variant === 2) { SPECK(c, x, y, w, h, 'rgba(0,0,0,.16)', 2, 2); }
    else { SPECK(c, x + 4, y + h - 8, w - 8, 6, 'rgba(0,0,0,.22)', 1, 1); }
  }

  function paintNameWall(c, b, E) {                  /* 名字碑座：碑 + 刻名 + 蜡烛 + 苔 */
    var T = E.T, x = b.x, y = b.y, w = b.w, h = b.h, rnd = E.rnd;
    groundShadow(c, x, y + h - 7, w, 5);
    var sx = x + snap(w * 0.18), sw = w - snap(w * 0.36), sy = y + 10, sh = h - 20;
    R(c, sx - 3, sy + sh, sw + 6, 6, T.stone[1]);    /* 底座 */
    HL(c, sx - 3, sy + sh, sw + 6, T.stone[3]);
    wallOf(c, sx, sy, sw, sh, T.stone, 'stone', rnd);
    FRAME(c, sx, sy, sw, sh, shade(T.stone[0], -0.35));
    TAPER(c, sx - 4, sy - 8, sw + 8, 9, T.granite, snap(sw * 0.3), 1.2);   /* 碑首 */
    var i, j;
    for (j = 0; j < 5; j++) {                        /* 刻名：长短不一的 1px 横杠 */
      var lw = 14 + snap(rnd() * 16);
      R(c, sx + 10 + (j % 2) * 12, sy + 14 + j * 7, lw, 3, T.white[4]);
      HL(c, sx + 10 + (j % 2) * 12, sy + 17 + j * 7, lw, T.granite[0]);
      R(c, sx + 10 + (j % 2) * 12, sy + 14 + j * 7, 2, 3, T.white[4]);
    }
    SPECK(c, sx, sy + sh - 24, sw, 8, T.foliage[1], 1, 2);
    VL(c, sx + sw - 6, sy + 6, sh - 10, 'rgba(20,24,30,.45)');   /* 裂纹 */
    /* 烛光扫在碑面上：越靠下越暖（还是抖动，不用渐变） */
    SPECK(c, sx + 2, sy + sh - 30, sw - 4, 22, 'rgba(255,206,132,.38)', 1, 2);
    SPECK(c, sx + 4, sy + sh - 13, sw - 8, 13, 'rgba(255,214,150,.62)', 2, 1);
    candle(c, x + snap(w * 0.1), y + h - 10, E);
    candle(c, x + snap(w * 0.16), y + h - 8, E);
    jar(c, x + w - 20, y + h - 22, 13, 14, T.metal);
    SPECK(c, sx, sy + sh + 2, sw, 6, 'rgba(0,0,0,.28)', 2, 1);
    R(c, sx, sy, sw, 2, T.stone[3]);
  }

  function paintFogHut(c, b, E, variant) {           /* 雾里的小屋 / 空屋：塌、破、雾 */
    var T = E.T, x = b.x, y = b.y, w = b.w, h = b.h, rnd = E.rnd;
    var rh = snap(h * 0.5), wy = y + rh, wh = h - rh - 6;
    groundShadow(c, x, y + h - 7, w, 5);
    var j;
    for (j = 0; j < rh - 6; j++) {                   /* 塌下去的屋顶：左侧塌 */
      var sag = snap(Math.max(0, (1 - j / rh) * 6));
      var col = j % 2 ? T.thatch[1] : T.thatch[2];
      R(c, x - 2 + sag, y + j + sag, w + 4 - sag * 2, 1, col);
    }
    R(c, x - 2, y + 2, w + 4, 3, T.thatch[3]);
    eave(c, x - 3, y + rh - 4, w + 6, T.thatch, 0);
    /* 塌口：露出黑梁 */
    R(c, x + 4, y + 2, 22, 10, 'rgba(10,12,16,.75)');
    R(c, x + 4, y + 8, 22, 3, T.log[1]);
    wallOf(c, x, wy, w, wh, T.log, 'plank', rnd);
    if (variant === 1) {
      doorway(c, x + (w >> 1) - 9, wy + wh - 28, 18, 28, E, { lamp: 1 });
      windows(c, x + 24, wy, w - 30, wh - 6, E, 1, true);
      lantern(c, x + 8, wy + 8, E, 0);
    } else {
      doorway(c, x + (w >> 1) - 11, wy + wh - 30, 22, 30, E, { open: 1 });
      R(c, x + (w >> 1) - 6, wy + wh - 24, 12, 18, 'rgba(255,210,150,.20)');
      R(c, x + 6, wy + 8, 16, 14, 'rgba(10,12,16,.7)');          /* 破窗 */
      HL(c, x + 6, wy + 8, 16, T.log[1]);
      var i;
      for (i = 0; i < 4; i++) R(c, x + 8 + i * 5, wy + 10 + (i % 2) * 4, 4, 3, T.log[3]);
    }
    /* 雾：三级抖动，从地面往上爬 */
    SPECK4(c, x - 4, y + rh - 4, w + 8, h - rh + 4, 'rgba(220,232,244,.42)', 8, 0);
    SPECK4(c, x - 6, y + h - 16, w + 12, 16, 'rgba(232,240,250,.55)', 10, 2);
    SPECK4(c, x + 4, y + 2, w - 8, 10, 'rgba(220,232,244,.22)', 5, 1);
  }

  var PAINT = {
    house: paintHouse,
    pawnshop: paintPawnshop,
    archivehall: paintArchiveHall,
    stallshed: paintStallShed,
    counter: paintCounter,
    shelving: paintShelving,
    backroom: paintBackroom,
    lighttower: paintLightTower,
    carverock: paintCarveRock,
    lampbase: paintLampBase,
    shed: paintShed,
    dike: paintDike,
    namewall: paintNameWall,
    wall: function (c, b, E) { paintWall(c, b, E, 'wall'); },
    cliff: function (c, b, E) { paintWall(c, b, E, 'cliff'); },
    seawall: function (c, b, E) { paintWall(c, b, E, 'seawall'); },
    plankwall: function (c, b, E) { paintWall(c, b, E, 'plankwall'); },
    saltwall: function (c, b, E) { paintWall(c, b, E, 'saltwall'); },
    stonewall: function (c, b, E) { paintWall(c, b, E, 'stonewall'); },
    fogwall: function (c, b, E) { paintWall(c, b, E, 'fogwall'); },
    saltbarn1: function (c, b, E) { paintSaltBarn(c, b, E, 1); },
    saltbarn2: function (c, b, E) { paintSaltBarn(c, b, E, 2); },
    saltbarn3: function (c, b, E) { paintSaltBarn(c, b, E, 3); },
    shelfwall1: function (c, b, E) { paintShelfWall(c, b, E, 1); },
    shelfwall2: function (c, b, E) { paintShelfWall(c, b, E, 2); },
    foghut1: function (c, b, E) { paintFogHut(c, b, E, 1); },
    foghut2: function (c, b, E) { paintFogHut(c, b, E, 2); }
  };

  /* ============================================================
     八、对外：paintSolids 与 game23.js 原签名一致，可直接替换
     ============================================================ */
  function paintSolids(c, sc, pal) {
    if (!c || !sc) return 0;
    var mood = moodOf(sc);
    var T = tonesOf(pal, mood);
    var items = PLAN(sc);
    var done = 0, i, b, fn;
    for (i = 0; i < items.length; i++) {
      b = items[i];
      fn = PAINT[b.kind] || PAINT.house;
      fn(c, b, {
        T: T, rnd: rngAt(b.cx, b.cy, 11), mood: mood,
        lit: mood.lit || (rngAt(b.cx, b.cy, 7)() > 0.55),
        wall: T.plank, sc: sc, pal: pal
      });
      done++;
    }
    return done;
  }

  var ART31 = {
    version: '31.0',
    CELL: CELL, VW: VW, VH: VH,
    setup: function (o) { if (o && o.cell) { CELL = o.cell; } },
    plan: PLAN, paintSolids: paintSolids,
    BUILDING: BUILDING, MAT: MAT, PAINT: PAINT,
    /* 下面这些暴露给单测 / 渲染工具用 */
    _u: { shade: shade, mix: mix, blend: blend, ramp: ramp, snap: snap, parseCol: parseCol, rngAt: rngAt, moodOf: moodOf, tonesOf: tonesOf }
  };

  if (typeof module === 'object' && module.exports) module.exports = ART31;
  global.ART31 = ART31;
})(typeof window !== 'undefined' ? window : globalThis);
