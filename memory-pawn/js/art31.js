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
    BLOT(c, x - 8, y + h - 13, w + 16, 13, 'rgba(0,0,0,.30)', 2, 1);   /* 塔基一片湿暗：石头塔得从石头地里立出来 */
    /* 礁岩基座：占底下 1/3，逐行收分 + 层理 + 苔 + 白浪。
       石头塔站在石头地上 —— 基岩必须比铺地暗一档，不然整座塔糊进地面。 */
    var wet = ramp(blend(MAT.granite, (E.pal && E.pal.solid) || '#000000', 0.36), 6);
    var rockH = snap(h * 0.34), rockY = y + h - rockH, j;
    R(c, x + 2, rockY - 2, w - 4, rockH + 4, 'rgba(0,0,0,.34)');       /* 落地暗圈 */
    for (j = 0; j < rockH; j++) {
      var ins = snap(7 * Math.pow(1 - j / rockH, 1.3) + rnd() * 2);
      R(c, x + ins, rockY + j, w - ins * 2, 1, j < rockH * 0.18 ? wet[5] : (j < rockH * 0.55 ? wet[3] : wet[2]));
    }
    for (j = 8; j < rockH - 4; j += 14) {
      var i2 = snap(7 * Math.pow(1 - j / rockH, 1.3));
      HL(c, x + i2, rockY + j, w - i2 * 2, wet[0]);
      HL(c, x + i2, rockY + j + 1, w - i2 * 2, wet[4]);
    }
    SPECK(c, x + 8, rockY + 5, w - 16, snap(rockH * 0.34), T.foliage[1], 1, 2);
    HL(c, x + 8, rockY, w - 16, wet[5]);
    VL(c, x + 2, rockY, rockH, wet[0]);
    VL(c, x + w - 3, rockY, rockH, wet[0]);
    SPECK(c, x + 6, rockY + rockH - 7, w - 12, 7, 'rgba(255,255,255,.55)', 2, 1);
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
    /* 两侧勾一道重边 + 塔基压黑：石头塔要在石头地上"立"起来 */
    VL(c, tx, tTop, tH, shade(T.stone[0], -0.40));
    VL(c, tx + tw - 1, tTop, tH, shade(T.stone[0], -0.40));
    R(c, tx - 4, tBot - 2, tw + 8, 6, 'rgba(0,0,0,.34)');
    HL(c, tx - 4, tBot - 2, tw + 8, shade(T.stone[0], -0.20));
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

  function paintCarveRock(c, b, E) {                 /* 刻痕礁石：湿岩 + 晒白的干顶 + 白浪 + 三道刻痕 */
    var T = E.T, x = b.x, y = b.y, w = b.w, h = b.h, i;
    var wet = ramp(blend(MAT.granite, (E.pal && E.pal.solid) || '#000000', 0.52), 6);
    var dry = ramp(blend(MAT.granite, '#dfe8f4', 0.26), 6);
    groundShadow(c, x + 4, y + h - 6, w - 8, 5);
    BLOT(c, x + 2, y + h - 9, w - 4, 8, 'rgba(226,238,250,.30)', 2, 1);   /* 脚底浪 */
    rock(c, x + 3, y + 3, w - 6, h - 6, wet, E.rnd, T.foliage[2]);        /* 湿岩主体：自带不规则轮廓 */
    /* 干顶：贴着岩顶的弧线走，越往下越宽 —— 拉成直条就成了箱子 */
    for (i = 0; i < 17; i++) {
      var t = i / 17, dw = snap((w - 22) * Math.min(1, 0.42 + t * 0.95));
      R(c, x + ((w - dw) >> 1) + snap((rngAt(i, 1, 99)() - 0.5) * 3), y + 3 + i, dw, 1, i < 8 ? dry[4] : dry[3]);
    }
    HL(c, x + 11, y + 20, w - 28, dry[0]);                               /* 潮线：干湿交界 */
    for (i = 0; i < w - 24; i++) {                                        /* 白浪：浪线 + 飞沫，不要等距点阵 */
      if (rngAt(x + i, y, 44)() > 0.45) R(c, x + 12 + i, y + h - 8 + snap(Math.sin(i * 0.35) * 1.6), 1, 2, 'rgba(240,248,255,.55)');
    }
    HL(c, x + 12, y + 9, w - 30, 'rgba(226,238,250,.36)');               /* 顶沿受光 */
    SPECK(c, x + 10, y + 8, w - 26, 8, T.foliage[2], 1, 1);              /* 苔 */
    for (i = 0; i < 3; i++) {                                            /* 三道刻痕 */
      HL(c, x + 18 + i * 3, y + 14 + i * 5, w - 40 - i * 6, 'rgba(240,246,255,.55)');
      HL(c, x + 18 + i * 3, y + 15 + i * 5, w - 40 - i * 6, 'rgba(24,34,46,.55)');
    }
  }

  function paintLampBase(c, b, E) {                  /* 九宫灯阵基座：九盏铜灯坐在石台上，铺满占格 */
    var T = E.T, x = b.x, y = b.y, w = b.w, h = b.h, i, j, k = 0, lx, ly, on;
    groundShadow(c, x, y + h - 6, w, 5);
    R(c, x, y + h - 11, w, 11, T.stone[1]);                     /* 石台铺满整格宽 */
    HL(c, x, y + h - 11, w, T.stone[3]);
    VL(c, x, y + h - 11, 11, T.stone[0]);
    VL(c, x + w - 1, y + h - 11, 11, T.stone[0]);
    HL(c, x + 2, y + h - 2, w - 4, shade(T.stone[0], -0.3));    /* 台脚压黑 */
    R(c, x + 4, y + 2, w - 8, h - 12, T.brass[0]);              /* 背板 */
    HL(c, x + 4, y + 2, w - 8, T.brass[2]);
    for (j = 0; j < 3; j++) {
      for (i = 0; i < 3; i++) {
        lx = x + 14 + i * 28; ly = y + 4 + j * 11;
        on = (k === 0 || k === 4 || k === 5 || k === 8);
        R(c, lx - 7, ly + 8, 15, 3, T.brass[1]);                 /* 灯座 */
        R(c, lx - 6, ly, 13, 8, on ? T.lamp[2] : T.metal[0]);    /* 灯身 */
        R(c, lx - 6, ly, 13, 2, on ? T.cream[4] : T.metal[2]);   /* 灯罩亮口 */
        HL(c, lx - 6, ly + 8, 13, on ? T.lamp[4] : T.metal[0]);
        if (on) glowAt(c, lx, ly + 4, 13, '255,206,132', 0.7);
        k++;
      }
    }
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

  /* ============================================================
     三、地面层（v31.1）：六种铺法各有各的材质语言
     口径同上：只用 fillStyle/fillRect、整数像素、限色阶、2×2 抖动，不用渐变
     （以前那版是 strokeRect + createRadialGradient，放大一圈全是灰糊边）
     ============================================================ */
  var GROUND_OF = {
    lighthouse: 'stone', town: 'plank', pawnshop: 'wood',
    saltflats: 'salt', archive: 'tile', mist: 'gravel'
  };
  function BLOT(c, x, y, w, h, col, amount, ph) {   /* 2×2 块抖动：大面积的脏斑/水汽用它，比逐像素省 4 倍 */
    x = snap(x); y = snap(y); w = snap(w); h = snap(h);
    if (x < 0) { w += x; x = 0; }                    /* 裁到画布内：出血的斑块不留无效笔触 */
    if (y < 0) { h += y; y = 0; }
    if (x + w > VW) w = VW - x;
    if (y + h > VH) h = VH - y;
    if (w < 2 || h < 2 || !col) return;
    ph = (ph || 0) & 1;
    var i, j;
    amount = amount || 1;
    c.fillStyle = col;
    for (j = 0; j + 1 < h; j += 2) {
      for (i = 0; i + 1 < w; i += 2) {
        if (amount >= 3 || BAY[(j >> 1) & 1][(i >> 1) & 1] < amount) c.fillRect(x + i, y + j, 2, 2);
      }
    }
  }
  function PATCH(c, x, y, w, h, col) {              /* 不规则大斑：几块错位矩形拼出来 */
    x = snap(x); y = snap(y); w = snap(w); h = snap(h);
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > VW) w = VW - x;
    if (y + h > VH) h = VH - y;
    if (w < 2 || h < 2) return;
    /* 直边整矩形一看就是贴图残留；四块错位矩形拼出来才像"这一片跟别处不一样" */
    if (w < 26 || h < 26) { R(c, x, y, w, h, col); return; }
    R(c, x + snap(w * 0.10), y, snap(w * 0.80), h, col);
    R(c, x, y + snap(h * 0.16), w, snap(h * 0.68), col);
    R(c, x + snap(w * 0.04), y + snap(h * 0.22), snap(w * 0.62), snap(h * 0.74), col);
    R(c, x + snap(w * 0.30), y + snap(h * 0.06), snap(w * 0.66), snap(h * 0.60), col);
  }
  function BLOB(c, cx, cy, rx, ry, col, rnd) {      /* 不规则块：每行宽窄抖一点，比正椭圆自然（水洼/盐斑） */
    rx = Math.max(1, snap(rx)); ry = Math.max(1, snap(ry));
    cx = snap(cx); cy = snap(cy);
    var j, t, dx;
    for (j = -ry; j <= ry; j++) {
      t = j / ry;
      dx = rx * Math.sqrt(Math.max(0, 1 - t * t)) * (0.80 + rnd() * 0.40);
      R(c, cx - dx, cy + j, dx * 2, 1, col);
    }
  }
  function CRACK(c, x, y, len, dir, col, rnd) {      /* 随机游走裂缝：盐壳/石缝要的是"不齐"，等距网格最假 */
    var i, a = dir;
    for (i = 0; i < len; i++) {
      a += (rnd() - 0.5) * 0.7;
      x += Math.cos(a); y += Math.sin(a);
      R(c, x, y, 1, 1, col);
      if (rnd() > 0.9) R(c, x + 1, y, 2, 1, col);
    }
  }
  function groundTones(pal, style, mood) {
    var g0 = (pal && pal.ground) || '#1d2733';
    var g1 = (pal && pal.ground2) || g0;
    var mat = { stone: MAT.stone, plank: MAT.plank, wood: MAT.wood, salt: MAT.salt, tile: MAT.stone, gravel: MAT.granite }[style] || MAT.stone;
    var k = { stone: 0.34, plank: 0.42, wood: 0.36, salt: 0.52, tile: 0.28, gravel: 0.30 }[style] || 0.3;
    var base = blend(blend(g0, g1, 0.45), mat, k);
    return ramp(blend(base, (pal && pal.solid) || '#000000', (mood ? mood.t : 0.2) * 0.8), 6);   /* 0 最暗 → 5 最亮 */
  }
  function groundBase(c, T) {
    var i, bx, by, bw, bh, tone, soft;
    R(c, 0, 0, VW, VH, T[2]);
    /* 大尺度定调：几块台阶色斑（平色），只在边上咬一道 2×2 抖把台阶化开。
       振幅只给一档：地面是背景，它一跳，建筑就淹了（第一版深色斑撒满整幅，像迷彩）。 */
    soft = blend(T[1], T[2], 0.5);
    for (i = 0; i < 9; i++) {
      bx = snap(rngAt(i, 1, 21)() * VW) - 80; by = snap(rngAt(i, 2, 22)() * VH) - 70;
      bw = 200 + snap(rngAt(i, 3, 23)() * 300); bh = 140 + snap(rngAt(i, 4, 24)() * 220);
      tone = rngAt(i, 5, 25)() > 0.45 ? T[3] : soft;
      PATCH(c, bx, by, bw, bh, tone);
      BLOT(c, bx + 8, by + 6, bw - 16, 10, tone, 1, i & 1);
      BLOT(c, bx + 8, by + bh - 16, bw - 16, 10, tone, 1, (i + 1) & 1);
    }
  }
  function groundStone(c, T) {                       /* 望归灯：海码头石板，行高/板长都不齐，缝错开，苔成簇 */
    var y = -20, rowH, off, x, fw, n, i, j, mx, mw;
    while (y < VH) {
      rowH = 22 + snap(rngAt(0, y, 31)() * 14);
      off = snap(rngAt(1, y, 32)() * 60);
      x = -off;
      while (x < VW) {
        fw = 44 + snap(rngAt(x, y, 33)() * 40);
        n = rngAt(x, y, 34)();
        R(c, x + 1, y + 1, fw - 2, rowH - 2, n > 0.72 ? T[3] : T[2]);   /* 只差一档：石板地是背景，不是迷彩 */
        HL(c, x + 1, y + rowH - 1, fw - 1, T[1]);       /* 缝：压到一档，别拉成黑白格 */
        VL(c, x + fw - 1, y + 1, rowH - 1, T[1]);
        if (n > 0.62) HL(c, x + 3 + snap(rngAt(x, y, 39)() * (fw * 0.5)), y + 1, snap(fw * 0.22), T[3]);   /* 受光只占一小段 */
        if (n > 0.90) {                                  /* 裂：一成石板有，两段暗线 */
          j = x + 12 + snap(rngAt(x, y, 35)() * Math.max(6, fw - 30));
          for (i = 0; i < 8; i++) R(c, j + (i > 4 ? 1 : 0), y + 4 + i, 1, 1, T[1]);
          for (i = 0; i < 6; i++) R(c, j + (i > 4 ? 1 : 0) + i, y + 12 + i, 1, 1, T[1]);
        }
        x += fw;
      }
      /* 潮缝：一行里连着几块石板的缝间长苔 —— 短而密的一段，不是虚线尺 */
      if (rngAt(2, y, 36)() > 0.62) {
        mx = snap(rngAt(3, y, 37)() * (VW - 130)); mw = 36 + snap(rngAt(4, y, 38)() * 46);
        for (i = 0; i < mw; i++) {
          if (rngAt(mx + i, y, 41)() > 0.12) R(c, mx + i, y + rowH - 2, 1, 2, T[0]);
          if (rngAt(mx + i, y, 42)() > 0.55) R(c, mx + i, y + rowH - 4, 1, 2, T[1]);
        }
      }
      y += rowH;
    }
  }
  function groundPlank(c, T) {                       /* 盐埕镇：码头船板，长板通铺，缝压一档，木纹长而淡 */
    var y = 0, bh, x, n, i, gx, gw;
    while (y < VH) {
      bh = 14 + snap(rngAt(0, y, 41)() * 7);
      n = rngAt(1, y, 42)();
      R(c, 0, y, VW, bh, n > 0.78 ? T[4] : (n > 0.28 ? T[3] : T[2]));
      HL(c, 0, y, VW, T[4]);
      HL(c, 0, y + bh - 1, VW, T[1]);
      x = snap(rngAt(2, y, 43)() * 200);
      while (x < VW) {                                /* 断口：缝要看得见，钉才不是凭空冒出来的黑点 */
        VL(c, x, y + 1, bh - 2, T[0]);
        R(c, x + 3, y + 3, 1, 1, T[0]);
        x += 220 + snap(rngAt(y, x, 44)() * 200);
      }
      for (i = 0; i < 2; i++) {
        gx = snap(rngAt(i, y, 45)() * 700); gw = 90 + snap(rngAt(i, y, 46)() * 260);
        HL(c, gx, y + 3 + snap(rngAt(i, y, 47)() * Math.max(2, bh - 6)), gw, T[2]);
      }
      if (n > 0.88) R(c, snap(rngAt(3, y, 48)() * (VW - 20)), y + (bh >> 1), 2, 2, T[1]);   /* 节疤：一个小点，别画成虫子 */
      y += bh;
    }
  }
  function groundWood(c, T) {                        /* 记当铺：室内木地板，柜台前踩白一条（靠板色提亮，不铺点阵） */
    var y = 0, bh, x, i, gx, gw, n, wear;
    while (y < VH) {
      bh = 11 + snap(rngAt(0, y, 61)() * 4);
      n = rngAt(1, y, 62)();
      wear = (y > 258 && y < 372);                   /* 走道：这一段板子整体亮一档 */
      R(c, 0, y, VW, bh, wear ? (n > 0.5 ? T[4] : T[3]) : (n > 0.72 ? T[3] : T[2]));
      HL(c, 0, y, VW, T[4]);
      HL(c, 0, y + bh - 1, VW, T[1]);
      x = snap(rngAt(2, y, 63)() * 160);
      while (x < VW) { VL(c, x, y + 1, bh - 2, T[1]); x += 180 + snap(rngAt(y, x, 64)() * 190); }
      for (i = 0; i < 3; i++) {
        gx = snap(rngAt(i, y, 65)() * 620); gw = 120 + snap(rngAt(i, y, 66)() * 280);
        HL(c, gx, y + 2 + snap(rngAt(i, y, 67)() * Math.max(2, bh - 4)), gw, T[1]);
      }
      if (n > 0.93) OVAL(c, snap(rngAt(4, y, 68)() * VW), y + (bh >> 1), 3, 2, T[1], T[0], T[1]);
      y += bh;
    }
    for (i = 0; i < 8; i++) {                        /* 走道中段各踩亮一道（不铺横向点阵 —— 那是"拉链"） */
      HL(c, snap(rngAt(i, 2, 70)() * 700), 262 + snap(rngAt(i, 1, 69)() * 104),
        80 + snap(rngAt(i, 3, 71)() * 220), T[4]);
    }
  }
  function groundSalt(c, T) {                        /* 盐田：盐壳裂纹网（随机游走）+ 稀疏晶粒，不是等距瓷砖 */
    var i, cx, cy, len, a, rx, ry, damp;
    var crack = blend(T[0], T[1], 0.55);             /* 盐壳的裂纹要看得见：暗一档半，不能只是"隐约" */
    for (i = 0; i < 16; i++) {
      cx = snap(rngAt(i, 6, 56)() * VW); cy = snap(rngAt(i, 7, 57)() * VH);
      len = 60 + snap(rngAt(i, 8, 58)() * 120); a = rngAt(i, 9, 59)() * 6.283;
      CRACK(c, cx, cy, len, a, crack, rngAt(i, 10, 60));
      if (rngAt(i, 11, 61)() > 0.55) {               /* 主缝上分一支 */
        CRACK(c, cx + 20, cy + 12, snap(len * 0.45), a + 1.3, crack, rngAt(i, 12, 62));
      }
    }
    damp = blend(T[1], T[2], 0.62);                  /* 湿痕：只比盐壳暗一点点 */
    for (i = 0; i < 3; i++) {
      cx = snap(90 + rngAt(i, 13, 63)() * (VW - 220)); cy = snap(70 + rngAt(i, 14, 64)() * (VH - 180));
      rx = 40 + snap(rngAt(i, 15, 65)() * 30); ry = 24 + snap(rngAt(i, 16, 66)() * 18);
      BLOB(c, cx, cy, rx, ry, damp, rngAt(i, 17, 67));
    }
    for (i = 0; i < 90; i++) {                       /* 晶粒：一颗颗点，不是白方块 */
      cx = snap(rngAt(i, 20, 69)() * VW); cy = snap(rngAt(i, 21, 70)() * VH);
      R(c, cx, cy, 1, 1, rngAt(i, 22, 71)() > 0.5 ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.35)');
    }
  }
  function groundTile(c, T) {                        /* 岛史馆：大方砖错缝，砖色只差一档，磨旧成片 */
    var y, x, off, n, i, cx, cy;
    for (i = 0; i < 4; i++) {                        /* 磨旧 / 落灰成片（少而大，别铺成补丁） */
      cx = snap(rngAt(i, 1, 71)() * VW) - 90; cy = snap(rngAt(i, 2, 72)() * VH) - 70;
      PATCH(c, cx, cy, 240 + snap(rngAt(i, 3, 73)() * 280), 170 + snap(rngAt(i, 4, 74)() * 220),
        rngAt(i, 5, 75)() > 0.5 ? T[3] : T[1]);
    }
    for (y = 0; y < VH; y += 24) {
      off = (((y / 24) | 0) % 2) ? 12 : 0;
      for (x = -24 + off; x < VW; x += 24) {
        HL(c, x + 1, y + 23, 23, T[1]);              /* 只有缝，不逐砖变色：变色就成了棋盘 / 像掉了砖 */
        VL(c, x + 23, y + 1, 23, T[1]);
        if (rngAt(x, y, 76)() > 0.86) HL(c, x + 3, y + 20, 18, T[3]);   /* 砖沿磨亮一小段 */
      }
    }
    for (i = 0; i < 70; i++) {                       /* 灰：稀疏散点 */
      cx = snap(rngAt(i, 6, 77)() * VW); cy = snap(rngAt(i, 7, 78)() * VH);
      R(c, cx, cy, 1, 1, 'rgba(226,232,240,.16)');
    }
  }
  function groundGravel(c, T) {                      /* 雾里：碎石滩（成堆）+ 水洼，不铺横向条带 */
    var i, j, cx, cy, rx, ry, n, gx, gy;
    for (i = 0; i < 8; i++) {
      cx = snap(rngAt(i, 1, 81)() * VW) - 100; cy = snap(rngAt(i, 2, 82)() * VH) - 80;
      PATCH(c, cx, cy, 200 + snap(rngAt(i, 3, 83)() * 300), 150 + snap(rngAt(i, 4, 84)() * 200),
        rngAt(i, 5, 85)() > 0.5 ? T[3] : T[1]);
    }
    for (i = 0; i < 9; i++) {                        /* 碎石成堆：一堆一堆，不是满地芝麻 */
      cx = snap(rngAt(i, 6, 86)() * VW); cy = snap(rngAt(i, 7, 87)() * VH);
      rx = 40 + snap(rngAt(i, 8, 88)() * 60); ry = 28 + snap(rngAt(i, 9, 89)() * 40);
      for (j = 0; j < 80; j++) {
        gx = cx + snap((rngAt(i * 100 + j, 10, 90)() - 0.5) * rx * 2);
        gy = cy + snap((rngAt(i * 100 + j, 11, 91)() - 0.5) * ry * 2);
        n = rngAt(i * 100 + j, 12, 92)();
        R(c, gx, gy, 1 + (n > 0.6 ? 1 : 0), 1 + (n > 0.85 ? 1 : 0), n > 0.5 ? T[4] : T[1]);
      }
    }
    for (i = 0; i < 5; i++) {                        /* 水洼：不规则块 + 一道亮边 */
      cx = snap(80 + rngAt(i, 13, 93)() * (VW - 200)); cy = snap(70 + rngAt(i, 14, 94)() * (VH - 170));
      rx = 54 + snap(rngAt(i, 15, 95)() * 50); ry = 26 + snap(rngAt(i, 16, 96)() * 22);
      BLOB(c, cx, cy, rx, ry, T[1], rngAt(i, 17, 97));
      BLOB(c, cx, cy - 1, rx - 3, ry - 3, 'rgba(196,216,232,.16)', rngAt(i, 18, 98));
      HL(c, cx - rx + 12, cy - ry + 3, rx, 'rgba(255,255,255,.14)');
    }
  }
  var GROUND_FN = { stone: groundStone, plank: groundPlank, wood: groundWood, salt: groundSalt, tile: groundTile, gravel: groundGravel };
  function paintGround(c, sc, pal) {
    if (!c || !c.fillRect) return 0;
    var style = GROUND_OF[(sc && sc.id) || ''] || 'stone';
    var T = groundTones(pal || (sc && sc.palette), style, moodOf(sc));
    groundBase(c, T);
    var fn = GROUND_FN[style] || groundStone;
    fn(c, T);
    return 1;
  }

  /* ============================================================
     四、氛围层（v31.2）：雾带与风痕（每帧画，所以要省）
     以前是 6 个 250px 径向渐变大团 + 2px stroke 斜线 —— 放大看全是糊边，
     而且每帧 6 次全屏渐变填充（≈390 万像素/帧）。现在只有几千个小矩形。
     ============================================================ */
  function paintFog(c, sc, t, amb) {
    if (!c || !c.fillRect) return 0;
    var i, x, y, h, th, drift, cx, cy, rr, seg = 26;
    var rgb = '214,224,238', col = 'rgba(' + rgb + ',.15)', edge = 'rgba(' + rgb + ',.09)';
    /* ① 两条波状雾带：沿 x 起伏（不是通栏直条），边沿用错位短段做出毛边（不用点阵条） */
    for (i = 0; i < 2; i++) {
      y = snap(70 + i * 236 + Math.sin(t * 0.35 + i * 1.3) * 16);
      h = snap(74 + i * 16);
      drift = ((t * (9 + i * 5)) % (VW + 420)) - 210;
      for (x = -210; x < VW + 210; x += seg) {
        var wy = y + snap(Math.sin((x + drift) * 0.0062 + i * 1.7) * 18);
        th = snap(h * (0.46 + 0.54 * (0.5 + 0.5 * Math.sin((x + drift) * 0.0115 + i * 2.1))));
        R(c, x + drift, wy, seg, th, col);
        if (((x / seg) | 0) % 2 === 0) R(c, x + drift + 5, wy - 6, 15, 7, edge);
        else R(c, x + drift + 3, wy + th - 1, 13, 7, edge);
      }
    }
    /* ② 三团浓雾：实心核（不规则块）+ 稀外圈，各自速度横移 */
    for (i = 0; i < 3; i++) {
      cx = ((t * (11 + i * 6)) % (VW + 620)) - 310;
      cy = 128 + i * 216 + snap(Math.sin(t * 0.28 + i * 2) * 22);
      rr = 74 + i * 22;
      BLOT(c, cx - rr - 22, cy - rr * 0.66 - 16, rr * 2 + 44, rr * 1.32 + 32, edge, 1, i & 1);
      BLOB(c, cx, cy, rr, rr * 0.62, 'rgba(' + rgb + ',.20)', rngAt(i, 3, 5));
      BLOB(c, cx, cy, rr * 0.62, rr * 0.40, 'rgba(' + rgb + ',.14)', rngAt(i, 4, 6));
    }
    return 1;
  }
  function paintWind(c, sc, t) {
    if (!c || !c.fillRect) return 0;
    var k, x, y, off, col = 'rgba(232,238,246,.20)';
    for (k = 0; k < 9; k++) {
      y = snap((t * 96 + k * 88) % VH);
      off = snap((t * 150 + k * 60) % 46);
      for (x = -46 + off; x < VW; x += 46) {          /* 断续的斜风痕，不是一条通栏直线 */
        R(c, x - 26, y + snap(x * 0.035) - 1, 30, 2, col);
        if ((k + (x >> 6)) % 3 === 0) R(c, x - 4, y + snap(x * 0.035) + 3, 14, 1, 'rgba(232,238,246,.12)');
      }
    }
    return 1;
  }

  /* ============================================================
     五、人物：六个 NPC + 玩家（v31.3）
     旧画法是一套平滑矢量小人 + 六种颜色（渐变大衣、quadratic 曲线、圆头笔触），
     跟像素建筑差一个画质档。这里一人一套：身形高低、衣色四阶、随身物、发型/帽子。
     落点口径跟老画法对齐：脚底在 py+16、身高 32~36 逻辑像素（一格 48 装得下）。
     ============================================================ */
  var FIG = {
    hai: {
      name: '阿海', role: '引灯人', h: 34, skin: '#d9ab80', hair: '#2b2419',
      coat: '#2f6f7a', trim: '#8fd0d8', boot: '#3a2b22', hat: 'straw', prop: 'pole'
    },
    chen: {
      name: '陈婶', role: '盐仓邻居', h: 32, skin: '#e2b78f', hair: '#4a3b32',
      coat: '#a85f56', trim: '#e8d5ba', boot: '#4a3a30', hat: 'kerchief', apron: '#d9c7a6', prop: 'basket'
    },
    keeper: {
      name: '祁掌柜', role: '当铺掌柜', h: 36, skin: '#dcb48c', hair: '#7b7b86',
      coat: '#5b5384', trim: '#cfc8e6', boot: '#2f2a3a', collar: 1, prop: 'ledger'
    },
    awang: {
      name: '阿罔', role: '老盐工', h: 32, skin: '#c99a6e', hair: '#cfc8ba',
      coat: '#8a7a3c', trim: '#dccd90', boot: '#4a3a26', build: 'stout', hat: 'strawFlat', prop: 'rake'
    },
    liu: {
      name: '柳先生', role: '岛史馆馆守', h: 36, skin: '#dcc09c', hair: '#b0b0ab',
      coat: '#4f6b62', trim: '#c2d8cc', boot: '#33302c', robe: 1, glasses: 1, prop: 'book'
    },
    her: {
      name: '她', role: '雾客', h: 33, skin: '#ead9e4', hair: '#3a3446',
      coat: '#a695c4', trim: '#ddd4ee', boot: '#5f5674', robe: 1, back: 1, hairLong: 1
    },
    you: {
      name: '你', role: '替记人', h: 34, skin: '#e8c8a0', hair: '#3a3128',
      coat: '#f3ead6', trim: '#cdc3ac', boot: '#4a3f33', prop: 'handLamp',
      /* 用户："主角的样子好像有点诡异啊，画的正常一点。"
         先量后改（量出来的原值见 tools/shot-hero.mjs）：
           头 10 行 / 总 32 行 = 31%  ⇒ 1:3.2 头身，接近大头娃娃；
           腿只露 5 行（16%），脚几乎贴着衣摆；胳膊是两根离身的 2px 竖条。
         改：头 9→7 行宽 8→7、腿 11→18（多露 9 行）、胳膊 2→3px 并贴回躯干、
             眼 1px→2px 宽带一道眉。头身比落到 1:4.1（下面的数就是这么量出来的）。
         只有 you 带这五个字段 —— 别的角色（掌柜/客人/雾客…）一个像素都不变。 */
      topPad: 4, headRows: 7, headW: 7, legRows: 18, armW: 3, eyeW: 2, eyeRow: 5,
      /* 再补三笔：一块大色板上身在这尺寸下读不出"人"，加门襟 + 腰带 + 高领 */
      collar: true, placket: true, belt: '#8a6a44', trouser: '#5a4c3e'
    }
  };
  /* 随身物：都在人物右手边，硬边小件 */
  function figProp(c, F, px, gy) {
    var i;
    if (F.prop === 'pole') {                        /* 引灯人的挑灯杆：杆 + 灯箱 + 灯火 */
      VL(c, px + 8, gy - 30, 28, '#5a4630');
      R(c, px + 5, gy - 33, 7, 6, '#3d3a44');
      R(c, px + 6, gy - 32, 5, 4, '#ffd58a');
      R(c, px + 7, gy - 31, 3, 2, '#fff3d0');
      SPECK(c, px + 4, gy - 36, 9, 3, 'rgba(255,214,150,.22)', 1, 0);
      SPECK(c, px + 4, gy - 27, 9, 2, 'rgba(255,214,150,.16)', 1, 1);
      return 8;
    }
    if (F.prop === 'basket') {                      /* 陈婶的提篮：编纹 + 提手 */
      R(c, px + 6, gy - 8, 8, 7, '#9a7c4e');
      HL(c, px + 6, gy - 8, 8, '#c0a06a');
      HL(c, px + 6, gy - 6, 8, '#7d6339');
      HL(c, px + 6, gy - 4, 8, '#7d6339');
      R(c, px + 7, gy - 11, 1, 3, '#7d6339'); R(c, px + 12, gy - 11, 1, 3, '#7d6339');
      HL(c, px + 7, gy - 11, 6, '#7d6339');
      return 7;
    }
    if (F.prop === 'ledger') {                      /* 祁掌柜的账册：夹在左手 + 一根铜扣 */
      R(c, px - 12, gy - 14, 6, 8, '#5a4530');
      VL(c, px - 12, gy - 14, 8, '#e8e2d0');
      HL(c, px - 11, gy - 11, 5, '#c9b98c');
      R(c, px - 8, gy - 13, 2, 2, '#c9a227');
      return 5;
    }
    if (F.prop === 'rake') {                        /* 盐耙：斜杆（阶梯）+ 三齿 —— 扛在肩侧，别从脸上穿过去 */
      for (i = 0; i < 8; i++) R(c, px + 8 + i, gy - 20 + i, 2, 2, '#6a5233');
      R(c, px + 14, gy - 13, 7, 2, '#8a7a5c');
      for (i = 0; i < 3; i++) R(c, px + 14 + i * 3, gy - 11, 1, 3, '#8a7a5c');
      return 8;
    }
    if (F.prop === 'book') {                        /* 柳先生手里的册子 + 书签 */
      R(c, px - 11, gy - 14, 5, 7, '#6d5a3e');
      VL(c, px - 11, gy - 14, 7, '#e6dfc8');
      VL(c, px - 9, gy - 13, 5, '#c9a227');
      return 4;
    }
    if (F.prop === 'handLamp') {                    /* 玩家手里的灯：铜框 + 亮芯 + 抖开的光 */
      R(c, px + 7, gy - 15, 5, 7, '#7a6338');
      R(c, px + 8, gy - 14, 3, 5, '#ffd58a');
      R(c, px + 9, gy - 13, 1, 3, '#fff6dc');
      HL(c, px + 7, gy - 16, 5, '#a8894a');
      SPECK(c, px + 5, gy - 19, 8, 3, 'rgba(255,214,150,.20)', 1, 0);
      return 5;
    }
    return 0;
  }
  function paintFigure(c, id, x, y, face, lift, phase) {
    if (!c || !c.fillRect) return 0;
    var F = FIG[id] || FIG.you;
    var px = snap(x * CELL + CELL / 2), pby = snap(y * CELL + CELL / 2 - (lift || 0));
    var ph = (phase === undefined ? 0 : phase);
    var mv = (lift || 0) > 0.02;
    var sw = mv ? (Math.sin(ph) >= 0 ? 1 : -1) : 0;
    var bob = mv ? (Math.abs(Math.sin(ph)) > 0.45 ? 1 : 0) : (Math.sin(ph * 0.4) > 0.62 ? 1 : 0);
    var gy = pby + 16 - bob;
    var dir = face > 0 ? 1 : (face < 0 ? -1 : 0);
    var wide = F.build === 'stout' ? 1 : 0;
    var cr = ramp(F.coat, 4), sr = ramp(F.skin, 3), hr = ramp(F.hair, 3);
    var dark = cr[0], mid = cr[1], base = cr[2], lite = cr[3];
    /* 描边口径：整幅人物靠 1px 暗边立住（旧画法是渐变 + 圆头笔触，放大就散） */
    var oc = blend(F.coat, '#0d1018', 0.66);
    var hc = blend(F.hair, '#0b0d13', 0.5);
    var made = 0, i, j, t, w2, x0, yy;
    OVAL(c, px, gy + 2, 11 + wide, 3, 'rgba(0,0,0,.34)', 'rgba(0,0,0,.20)', 'rgba(0,0,0,.08)');
    made++;
    /* 腿 + 靴：先铺 1px 描边，再铺本色 */
    var LEG = F.legRows || 11;                       /* 腿长（从脚底往上数） */
    for (i = 0; i < 2; i++) {
      var sg = i ? 1 : -1;
      /* 走路改成**抬脚**，不再左右平移：
         平移那版在 sw=-1 的两帧上两条腿会挪到同一点（腿本来只有 5px 宽），
         量出来的"腿粗"从 16 掉到 8 —— 那就是中枢说的"走路四帧糊"。抬脚不会撞。 */
      var off = sg * (3 + wide);
      var step = mv && (sw * sg > 0) ? 2 : 0;
      R(c, px + off - 2, gy - LEG + step, 5, LEG - 2 - step, oc);
      R(c, px + off - 1, gy - LEG + 1 + step, 3, LEG - 3 - step, F.trouser || shade(F.boot, 0.26));
      R(c, px + off - 3, gy - 4 + step, 6, 4, oc);
      R(c, px + off - 2, gy - 3 + step, 4, 3, F.boot);
      made += 4;
    }
    /* 身子：一行一行铺（下摆比肩宽），左亮右暗 + 右侧 2×2 抖过渡 */
    /* 注意：hy/hh 是在底下"头"那一节才 var 出来的（var 会提升但值是 undefined），
       所以这里**不能**写 hy + hh —— 一写就是 NaN，整段躯干当场不画（改这版时踩过一次，量出来是"身子凭空少 15 行"）。
       直接用同一条公式重算一遍。 */
    var top = gy - F.h + 2 - (F.topPad || 0) + (F.headRows || 9);
    var bot = F.robe ? gy - 2 : gy - (LEG - 4), nrow = bot - top;
    var shW = 11 + wide * 2;
    for (i = 0; i < nrow; i++) {
      yy = top + i; t = nrow > 1 ? i / (nrow - 1) : 0;
      w2 = snap(shW + t * (F.robe ? 7 : 4));
      x0 = px - (w2 >> 1);
      R(c, x0 - 1, yy, w2 + 2, 1, oc);
      R(c, x0, yy, w2, 1, base);
      VL(c, x0, yy, 1, lite);
      VL(c, x0 + w2 - 1, yy, 1, mid);
      if ((i & 1) === 0) VL(c, x0 + w2 - 2, yy, 1, mid);     /* 跟右暗边咬成 2×2 抖 */
      made += 5;
    }
    /* 围裙 / 高领 / 长衫门襟 */
    if (F.apron) {
      R(c, px - 4, gy - 16, 9, 9, F.apron);
      VL(c, px - 4, gy - 16, 9, shade(F.apron, 0.34));
      VL(c, px + 4, gy - 16, 9, shade(F.apron, -0.34));
      HL(c, px - 4, gy - 8, 9, shade(F.apron, -0.45));
      made += 4;
    }
    if (F.collar) { R(c, px - 5, top - 2, 11, 3, F.trim); R(c, px - 5, top - 2, 11, 1, shade(F.trim, 0.3)); made += 2; }
    if (F.placket) {                                 /* 门襟：一道竖线 + 两颗扣子，上衣才不是一块板 */
      var pkTop = top + 4, pkH = nrow - 7;
      if (pkH > 2) { VL(c, px, pkTop, pkH, shade(F.coat, -0.30)); made++; }
      R(c, px - 1, pkTop + 2, 3, 1, shade(F.trim, -0.18));
      R(c, px - 1, pkTop + Math.max(3, pkH - 3), 3, 1, shade(F.trim, -0.18));
      made += 2;
    }
    if (F.belt) {                                    /* 腰带：一条 2px 横带，把人分出上下身 */
      var bY = bot - 4;
      R(c, px - (shW >> 1) - 1, bY, shW + 2, 2, oc);
      R(c, px - (shW >> 1), bY, shW, 2, F.belt);
      HL(c, px - (shW >> 1), bY, shW, shade(F.belt, 0.28));
      R(c, px - 1, bY, 3, 2, shade(F.belt, -0.34));
      made += 4;
    }
    if (F.robe) { VL(c, px, top + 4, bot - top - 6, mid); made++; }
    /* 手：袖子跟身子之间留一道描边，别糊成一坨 */
    /* 袖子收到衣摆上沿就停：手臂比衣摆还长 5 行，看着像"袖子拖到膝盖"（实拍自测逮到的） */
    var armY = top + 2, armH = Math.max(7, bot - armY - 1);
    var aw = F.armW || 2;
    /* gap：胳膊和躯干之间不再空一格 —— 空着就成"两片挂着的板子"（实拍自审逮到的） */
    var gap = aw >= 3 ? aw : 3;
    var ax = px - (shW >> 1) - gap, bx = px + (shW >> 1) + gap - 1;
    R(c, ax - 1, armY - 1, aw + 2, armH + 3, oc);
    R(c, ax, armY, aw, armH, mid);
    VL(c, ax, armY, 1, lite);
    R(c, ax, armY + armH, aw, 2, sr[2]);
    R(c, bx - 1, armY - 1, aw + 2, armH + 3, oc);
    R(c, bx, armY, aw, armH, dark);
    R(c, bx, armY + armH, aw, 2, sr[1]);
    made += 8;
    /* 头：外描边一块，里面再分头发/脸（8×9，眼睛才读得出来） */
    var hw = F.headW || 8, hh = F.headRows || 9, hx = px - (hw >> 1), hy = gy - F.h + 2 - (F.topPad || 0);
    R(c, hx - 1, hy, hw + 2, hh + 2, hc);
    if (F.back) {                                   /* 背对：整颗头都是头发 */
      R(c, hx, hy + 1, hw, hh, hr[1]);
      VL(c, hx, hy + 1, hh, hr[2]);
      VL(c, hx + hw - 1, hy + 1, hh, hr[0]);
      HL(c, hx, hy + hh, hw, hr[0]);
      made += 4;
    } else {
      R(c, hx, hy + 1, hw, hh, hr[1]);              /* 头发打底 */
      R(c, hx + 1, hy + 4, hw - 2, hh - 3, sr[2]); /* 脸 */
      VL(c, hx + 1, hy + 4, hh - 3, sr[1]);
      VL(c, hx + hw - 2, hy + 4, hh - 3, sr[0]);
      R(c, hx, hy + 1, hw, 3, hr[1]);               /* 顶发再压一遍（额头齐） */
      VL(c, hx, hy + 4, 4, hr[1]);                  /* 鬓角 */
      VL(c, hx + hw - 1, hy + 4, 4, hr[0]);
      var ew = F.eyeW || 1, eyY = hy + (F.eyeRow || 6);
      var ex = hx + 2 + (dir > 0 ? 1 : 0);
      if (dir <= 0) R(c, ex, eyY, ew, 2, '#20191a');
      if (dir >= 0) R(c, ex + 3, eyY, ew, 2, '#20191a');
      if (ew > 1) {                                 /* 眉毛：一条 1px 暗线，眼就不飘在脸上 */
        if (dir <= 0) R(c, ex, eyY - 1, ew + 1, 1, shade(F.hair, -0.10));
        if (dir >= 0) R(c, ex + 3 - 1, eyY - 1, ew + 1, 1, shade(F.hair, -0.10));
      }
      made += 8;
      if (F.glasses) { R(c, hx + 1, hy + 5, 3, 3, 'rgba(222,234,244,.55)'); R(c, hx + 5, hy + 5, 3, 3, 'rgba(222,234,244,.55)'); made += 2; }
    }
    if (F.hairLong) {                               /* 背上长发披到腰，发梢抖着收口 */
      var hly = hy + hh, hlh = (gy - 15) - hly;
      if (hlh > 3) {
        R(c, hx - 1, hly, hw + 2, hlh, hc);
        R(c, hx, hly, hw, hlh, hr[1]);
        VL(c, hx, hly, hlh, hr[2]);
        VL(c, hx + hw - 1, hly, hlh, hr[0]);
        SPECK(c, hx, hly + hlh - 4, hw, 4, hr[1], 2, 1);
        made += 5;
      }
    }
    /* 帽子 */
    if (F.hat === 'straw') {                        /* 斗笠：三层梯形 + 帽檐暗边 */
      R(c, hx + 2, hy - 4, hw - 4, 3, '#b3904f');
      R(c, hx, hy - 2, hw, 2, '#c9a86a');
      R(c, hx - 3, hy, hw + 6, 2, '#d3b478');
      HL(c, hx - 3, hy + 2, hw + 6, '#8a6c38');
      VL(c, hx - 3, hy, 1, '#e2c68e');
      made += 5;
    } else if (F.hat === 'strawFlat') {             /* 平顶草帽 */
      R(c, hx + 1, hy - 4, hw - 2, 3, '#d3b478');
      R(c, hx - 2, hy - 1, hw + 4, 2, '#c2a367');
      HL(c, hx - 2, hy + 1, hw + 4, '#8a6c38');
      made += 3;
    } else if (F.hat === 'kerchief') {              /* 头巾 + 脑后结 */
      R(c, hx, hy, hw, 3, '#e6e4d6');
      VL(c, hx, hy + 3, 5, '#e6e4d6');
      VL(c, hx + hw - 1, hy + 3, 5, '#cfcdbe');
      R(c, hx - 2, hy + 3, 3, 2, '#cfcdbe');
      R(c, hx - 3, hy + 4, 2, 4, '#cfcdbe');
      made += 5;
    }
    made += figProp(c, F, px, gy);
    /* 雾客：下摆 25% 抖着化进雾里（只用衣色的抖点，掺浅色就成蕾丝裙了） */
    if (F.fade) {
      for (j = 0; j < 5; j++) SPECK(c, px - 8, gy - 6 + j, 16, 1, F.coat, 1, j & 1);
      made += 5;
    }
    return made;
  }

  var ART31 = {
    version: '31.3',
    CELL: CELL, VW: VW, VH: VH,
    setup: function (o) { if (o && o.cell) { CELL = o.cell; } },
    plan: PLAN, paintSolids: paintSolids, paintGround: paintGround,
    paintFog: paintFog, paintWind: paintWind,
    paintFigure: paintFigure, FIG: FIG,
    BUILDING: BUILDING, MAT: MAT, PAINT: PAINT, GROUND_OF: GROUND_OF, GROUND_FN: GROUND_FN, BLOT: BLOT,
    /* 下面这些暴露给单测 / 渲染工具用 */
    _u: { shade: shade, mix: mix, blend: blend, ramp: ramp, snap: snap, parseCol: parseCol, rngAt: rngAt, moodOf: moodOf, tonesOf: tonesOf }
  };

  if (typeof module === 'object' && module.exports) module.exports = ART31;
  global.ART31 = ART31;
})(typeof window !== 'undefined' ? window : globalThis);
