/* ============================================================
   主界面 · 像素版画师（v46）
   ------------------------------------------------------------
   口径跟游戏本体一致：1 美术像素 = 1 逻辑像素 @960×672、硬边（只吃 fillStyle +
   fillRect，不出现渐变/圆弧/路径）、限定色阶、2×2 抖动、浏览器零采样上屏。

   v46 相对 v45 的三处硬改动（都是踩过的坑）：
   ① **背板永远 960×672、CSS 也永远 960×672（1:1）** —— v45 按屏幕算倍率烘背板，
      可画的时候还是按逻辑坐标画：倍率一旦 ≠1，画只铺左上角一块；而且只要有**两套
      倍率**（画布一套、文字一套），迟早穿模。现在改成“装不下才整体缩”：给
      #home-stage 一个 scale(k)，画布与文字同吃这一个变换，两边永远对得上。
   ② **小人会走**：底图（含两本账册）烘一次；每帧只重画「地上光池 + 选中光圈 +
      铜锁抖动 + 小人」——所以要有一张离屏底图，否则走动会拖影子。
   ③ 抖动改用 **2×2 图案填充**（一次 fillRect 顶 16 万次）：主线那股压暗雾幕按老
      写法是 16 万次 fillRect，烘一次就顿一下；现在整幅只要几次。

   版面：后墙 0..300 · 招牌 40..128 · 挂灯 176..205 · 两本账册 278..528 ·
   柜台 528..600（页脚那行字刻在柜台正面）· 地板 600..672 ← **小人在这儿走**。
   文字与按钮不进画布，留在 DOM 层（跟游戏 #labels 一个口径），按下面 GEO 的逻辑
   坐标绝对定位 —— 改这边必须同步 index.html 的「主界面 · 像素版」那段 CSS。
   ============================================================ */
(function (global) {
  'use strict';
  var VW = 960, VH = 672, CELL = 48;
  var doc = global.document;

  /* 版面（逻辑像素）—— 改这里必须同步 index.html 的主界面 CSS */
  var GEO = {
    sign: { x: 316, y: 40, w: 328, h: 88 },          /* 木招牌（DOM 标题就摆上面） */
    lampX: 480, lampY: 176,                          /* 挂灯 */
    card: { y: 278, w: 300, h: 250 },                /* 两本账册（＝两张卡）的封面 */
    cardA: { x: 108 }, cardB: { x: 552 },
    plate: { dx: 34, dy: 34, dw: 58, dh: 84 },       /* 封面里那块标签牌（文字就摆这上头） */
    counter: { y: 528, h: 72 },                      /* 柜台：528..600 */
    footY: 552,                                      /* 页脚那行字（刻在柜台正面） */
    walk: { y: 648, x0: 132, x1: 828, stopA: 258, stopB: 702, back: 74 }
  };
  var PLATE_A = { x: GEO.cardA.x + GEO.plate.dx, y: GEO.card.y + GEO.plate.dy, w: GEO.card.w - GEO.plate.dw, h: GEO.card.h - GEO.plate.dh };
  var PLATE_B = { x: GEO.cardB.x + GEO.plate.dx, y: PLATE_A.y, w: PLATE_A.w, h: PLATE_A.h };

  var U = (global.ART31 && global.ART31._u) || null;
  /* 注意：ART31 的 shade/ramp 返回的是 **rgb(r,g,b) 字符串**，不是 #rrggbb ——
     只认井号的解析器会把 blend() 悄悄变成"原样返回"（标签牌本该是深墨却一直是浅色，
     金字压在上头几乎读不出来，实测栽过这一跟头）。三种写法都吃。 */
  function hexOf(col) {
    var s = String(col == null ? '' : col).trim(), m, v;
    m = /^#([0-9a-f]{6})$/i.exec(s);
    if (m) { v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
    m = /^#([0-9a-f]{3})$/i.exec(s);
    if (m) return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16)];
    m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
    if (m) return [+m[1], +m[2], +m[3]];
    return null;
  }
  function shade(col, amt) {
    var a = hexOf(col); if (!a) return String(col || '#000');
    var o = [], i, v;
    for (i = 0; i < 3; i++) { v = a[i]; v = amt >= 0 ? v + (255 - v) * amt : v * (1 + amt); o.push(Math.max(0, Math.min(255, Math.round(v)))); }
    return '#' + o.map(function (n) { var s = n.toString(16); return s.length < 2 ? '0' + s : s; }).join('');
  }
  function blend(a, b, t) {
    var A = hexOf(a), B = hexOf(b); if (!A || !B) return a || b;
    var s = '#', i, v;
    for (i = 0; i < 3; i++) { v = Math.max(0, Math.min(255, Math.round(A[i] + (B[i] - A[i]) * t))); s += (v < 16 ? '0' : '') + v.toString(16); }
    return s;
  }
  function ramp(base, n) {
    if (U && U.ramp) return U.ramp(base, n);
    n = n || 4;
    var out = [], i, t;
    for (i = 0; i < n; i++) { t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; out.push(t < 0 ? shade(base, t * 0.74) : shade(base, t * 0.55)); }
    return out;
  }
  function R(c, x, y, w, h, col) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    if (w < 1 || h < 1) return;
    c.fillStyle = col; c.fillRect(x, y, w, h);
  }
  function HL(c, x, y, w, col) { R(c, x, y, w, 1, col); }
  function VL(c, x, y, h, col) { R(c, x, y, 1, h, col); }
  function FRAME(c, x, y, w, h, col) {
    HL(c, x, y, w, col); HL(c, x, y + h - 1, w, col);
    VL(c, x, y, h, col); VL(c, x + w - 1, y, h, col);
  }
  /* ---- 2×2 抖动：用图案一次填完（老写法逐块 fillRect，整幅 16 万次） ---- */
  var PATS = [];
  function patFor(c, rgba, ph) {
    var key = rgba + '|' + (ph || 0), i;
    for (i = 0; i < PATS.length; i++) if (PATS[i].ctx === c && PATS[i].key === key) return PATS[i].pat;
    if (!doc || !doc.createElement || !c.createPattern) return null;
    var t = doc.createElement('canvas');
    t.width = 2; t.height = 2;
    var tc = t.getContext('2d');
    tc.fillStyle = rgba;
    tc.fillRect((ph & 1) ? 1 : 0, 0, 1, 1);
    tc.fillRect((ph & 1) ? 0 : 1, 1, 1, 1);
    var p = null;
    try { p = c.createPattern(t, 'repeat'); } catch (e) { p = null; }
    PATS.push({ ctx: c, key: key, pat: p });
    return p;
  }
  function DITH(c, x, y, w, h, rgba, ph) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    if (w < 1 || h < 1) return;
    var p = patFor(c, rgba, ph), i, j;
    if (p) { c.fillStyle = p; c.fillRect(x, y, w, h); return; }
    for (j = 0; j < h; j += 2) for (i = 0; i < w; i += 2) {
      if ((((i >> 1) + (j >> 1) + (ph || 0)) & 1) === 0) R(c, x + i, y + j, 2, 2, rgba);
    }
  }
  /* 1px Bayer 细抖（灯下的浮点、掌柜身上那层光）—— 面积小，照旧逐点 */
  function SPK(c, x, y, w, h, col, amt, ph) {
    var B = [[0, 2], [3, 1]], i, j;
    amt = amt || 2; ph = (ph || 0) & 3;
    c.fillStyle = col;
    for (j = 0; j < h; j++) for (i = 0; i < w; i++) {
      if (amt >= 4 || B[(j + (ph >> 1)) & 1][(i + (ph & 1)) & 1] < amt) c.fillRect(x + i, y + j, 1, 1);
    }
  }
  var LOCK = { x: 0, y: 0 };                        /* 铜锁位置（画出来才知道，登记在这） */

  /* 一本账册＝一张卡：皮革四阶 + 书脊 + 装订金线 + 四角铜包角 + 深墨标签牌。
     牌下面那条皮革边距归「刻度尺 / 封条 + 铜锁 + 火漆」——**不许压到牌上**：
     牌上摆的是 DOM 文字，画布再压一层就是两层叠字（v45 那版就栽在这）。 */
  function book(c, x, y, w, h, leather, o) {
    o = o || {};
    var L = ramp(leather, 4), oc = blend(leather, '#0d1018', 0.62), j, k, i;
    R(c, x + 3, y + 3, w, h, 'rgba(0,0,0,.45)');                  /* 硬台阶投影 */
    FRAME(c, x - 1, y - 1, w + 2, h + 2, oc);
    R(c, x, y, w, h, L[1]); R(c, x, y, 16, h, L[0]); VL(c, x + 16, y, h, L[2]);
    HL(c, x, y, w, L[2]); VL(c, x, y, h, L[2]); VL(c, x + w - 1, y, h, oc); HL(c, x, y + h - 1, w, oc);
    for (j = 10; j < h - 10; j += 7) { R(c, x + 5, y + j, 2, 2, '#c9a227'); R(c, x + 10, y + j, 2, 2, '#8a6c38'); }
    DITH(c, x + 18, y + 2, w - 20, h - 4, 'rgba(255,255,255,.055)', 0);
    [[x + 2, y + 2], [x + w - 14, y + 2], [x + 2, y + h - 14], [x + w - 14, y + h - 14]].forEach(function (p) {
      R(c, p[0], p[1], 12, 4, '#c9a227'); R(c, p[0], p[1], 4, 12, '#c9a227'); R(c, p[0] + 4, p[1] + 4, 6, 2, '#8a6c38');
    });
    var px = x + GEO.plate.dx, py = y + GEO.plate.dy, pw = w - GEO.plate.dw, ph = h - GEO.plate.dh;
    R(c, px - 3, py - 3, pw + 6, ph + 6, oc);
    R(c, px - 1, py - 1, pw + 2, ph + 2, '#8a6c38');              /* 牌外那圈细金线 */
    R(c, px, py, pw, ph, blend(L[3], '#171226', 0.80));           /* 深墨牌面：金字才压得住 */
    HL(c, px, py, pw, 'rgba(255,255,255,.10)'); HL(c, px, py + ph - 1, pw, 'rgba(0,0,0,.38)');
    HL(c, px + 8, py + ph - 6, pw - 16, 'rgba(255,255,255,.05)');
    var band = py + ph + 8, bw = pw + 4, bx = px - 2;             /* 牌下那条皮革边距 */
    R(c, bx, band - 2, bw, 16, blend(L[0], '#0d1018', 0.30));
    HL(c, bx, band - 2, bw, 'rgba(0,0,0,.35)'); HL(c, bx, band + 13, bw, 'rgba(255,255,255,.06)');
    if (o.gauge !== undefined && o.gauge >= 0) {                  /* 第一章：12 格进度的刻度尺 */
      var cw = (bw - 8) / 12;
      for (i = 0; i < 12; i++) {
        R(c, cw * i + bx + 4, band, cw - 3, 9, i < o.gauge ? '#e8b74a' : '#4a3f75');
        if (i < o.gauge) HL(c, cw * i + bx + 4, band, cw - 3, '#ffe6a8');
      }
    }
    if (o.locked) {                                              /* 第二章锁着：封条 + 火漆 + 铜锁 */
      R(c, px - 8, band - 4, pw + 16, 22, 'rgba(150,140,168,.28)');
      HL(c, px - 8, band - 4, pw + 16, 'rgba(196,188,214,.32)');
      HL(c, px - 8, band + 17, pw + 16, 'rgba(20,14,30,.55)');
      for (k = 0; k < pw + 16; k += 10) R(c, px - 8 + k, band + 6, 6, 2, 'rgba(255,255,255,.10)');
      R(c, px + pw - 30, band - 12, 30, 17, '#8c2f3a');           /* 红火漆（滴在封条右端） */
      HL(c, px + pw - 30, band - 12, 30, '#b8495a'); HL(c, px + pw - 30, band + 4, 30, '#5e1c25');
      R(c, px + pw - 22, band - 6, 4, 9, '#5e1c25'); R(c, px + pw - 14, band - 4, 3, 7, '#5e1c25');
      LOCK.x = px + pw / 2 - 11; LOCK.y = band - 2;               /* 铜锁：每帧单独画，好抖 */
    } else if (o.mark) {                                         /* 第二章开着：一道金线 + 两颗铜钉 */
      R(c, bx + 20, band + 4, bw - 40, 2, '#6a5a3a');
      R(c, bx + 16, band + 2, 5, 5, '#c9a227'); R(c, bx + bw - 21, band + 2, 5, 5, '#c9a227');
    }
  }
  function lockSprite(c, x, y) {                                  /* 铜锁 22×22（连着锁梁） */
    var oc = '#2a2438';
    R(c, x - 2, y - 2, 26, 26, 'rgba(0,0,0,.55)');
    R(c, x, y, 22, 22, '#c9a227'); R(c, x + 3, y + 3, 16, 16, '#8a6c38');
    R(c, x + 8, y - 6, 6, 8, '#c9a227'); R(c, x + 9, y - 5, 4, 6, oc);
    R(c, x + 7, y + 8, 3, 3, oc); R(c, x + 12, y + 8, 3, 3, oc);
    HL(c, x, y, 22, '#e8cf8a');
  }

  /* 静态场景（含两本账册、不含小人）：烘一次进离屏，之后每帧 drawImage 一张 */
  function paintStatic(c, opts) {
    if (!c || !c.fillRect) return null;
    var lockedB = !(opts && opts.lockedB === false);
    var gauge = (opts && opts.gauge) || 0;
    var SC = { id: 'pawnshop', ambient: 'lamp', palette: { ground: '#1d2733' } };
    var wallL = ramp('#4a3620', 4), wd = ramp('#7a5230', 4), cd = ramp('#5a3b22', 4);
    var lampX = GEO.lampX, lampY = GEO.lampY, i;
    var sx = GEO.sign.x, sy = GEO.sign.y, sw = GEO.sign.w, sh = GEO.sign.h;
    var CY = GEO.counter.y, CYT = GEO.counter.h;
    ART31.paintGround(c, SC, SC.palette);                          /* 底：当铺木地板（小人就走这块） */
    DITH(c, 0, 0, VW, VH, 'rgba(9,7,20,.62)', 0);                  /* 压暗＝硬边雾幕，不是一层平灰 */
    DITH(c, 0, 0, VW, 300, 'rgba(9,7,20,.5)', 1);
    R(c, 0, 0, VW, 300, '#2b1e12');                                /* 后墙：竖板壁 + 横梁 */
    for (i = 0; i < VW; i += 34) {
      VL(c, i, 0, 300, wallL[0]); VL(c, i + 1, 0, 300, wallL[2]);
      if (i % 68 === 0) VL(c, i + 33, 0, 300, wallL[1]);
    }
    HL(c, 0, 298, VW, 3, wallL[0]); R(c, 0, 246, VW, 10, wallL[1]);
    VL(c, lampX - 1, 150, 28, '#2a2118'); VL(c, lampX + 1, 150, 28, '#2a2118');   /* 挂灯 */
    R(c, lampX - 11, lampY, 22, 7, '#5d4a2c'); R(c, lampX - 8, lampY + 7, 16, 18, '#7a6338');
    R(c, lampX - 6, lampY + 9, 12, 14, '#ffd88f'); R(c, lampX - 4, lampY + 11, 8, 10, '#fff6dc');
    R(c, lampX - 11, lampY + 25, 22, 4, '#5d4a2c');
    DITH(c, lampX - 120, lampY - 36, 240, 132, 'rgba(255,206,132,.10)', 0);
    DITH(c, lampX - 72, lampY - 16, 144, 96, 'rgba(255,206,132,.15)', 1);
    SPK(c, lampX - 18, lampY + 30, 36, 10, 'rgba(255,214,150,.45)', 1, 0);
    var wd2 = ramp('#6b4a2a', 4);                                  /* 招牌：木牌 + 内嵌金线 + 铜片 + 挂链 */
    R(c, sx - 2, sy - 2, sw + 4, sh + 4, '#2a1c10');
    R(c, sx, sy, sw, sh, wd2[1]); HL(c, sx, sy, sw, wd2[3]);
    HL(c, sx, sy + sh - 1, sw, wd2[0]); VL(c, sx, sy, sh, wd2[2]); VL(c, sx + sw - 1, sy, sh, wd2[0]);
    FRAME(c, sx + 5, sy + 5, sw - 10, sh - 10, '#c9a227');
    for (i = 0; i < 4; i++) { R(c, sx + 2, sy + 2 + i * 2, 10, 4, '#8a6c38'); R(c, sx + sw - 12, sy + 2 + i * 2, 10, 4, '#8a6c38'); }
    VL(c, sx - 6, sy + 8, 8, '#3a3a44'); VL(c, sx + sw + 5, sy + 8, 8, '#3a3a44');
    /* 柜台 528..600：台面受光一条，正面那道凹槽刻着页脚那句话（DOM 摆上去） */
    R(c, 0, CY, VW, CYT, cd[0]);
    R(c, 0, CY, VW, 16, wd[3]); HL(c, 0, CY, VW, '#e6c48a'); HL(c, 0, CY + 1, VW, wd[2]);
    for (i = 0; i < VW; i += 96) VL(c, i, CY + 16, CYT - 16, cd[1]);
    for (i = 48; i < VW; i += 96) { R(c, i - 2, CY + 26, 4, 4, '#c9a227'); R(c, i - 2, CY + 50, 4, 4, '#8a6c38'); }
    R(c, 0, CY + 44, VW, 26, blend(cd[0], '#0d1018', 0.35));
    HL(c, 0, CY + 44, VW, 'rgba(0,0,0,.42)'); HL(c, 0, CY + 69, VW, 'rgba(255,222,168,.10)');
    HL(c, 0, CY + 16, VW, '#3a2412'); HL(c, 0, CY + CYT - 1, VW, '#1d1310');
    DITH(c, 0, CY + CYT, VW, VH - CY - CYT, 'rgba(9,7,20,.45)', 1);   /* 柜台底下那道影，压出地板 */
    HL(c, 0, CY + CYT, VW, 'rgba(0,0,0,.55)');
    book(c, GEO.cardA.x, GEO.card.y, GEO.card.w, GEO.card.h, '#8a5a30', { gauge: gauge });  /* 第一章＝摊开的账 */
    R(c, GEO.cardA.x + GEO.card.w - 24, GEO.card.y - 6, 9, 40, '#c9a227');                  /* 金书签：挪进皮革边距，不再压标题行 */
    R(c, GEO.cardA.x + GEO.card.w - 28, GEO.card.y + 34, 17, 14, '#e8b74a');
    book(c, GEO.cardB.x, GEO.card.y, GEO.card.w, GEO.card.h, '#4a4258', { locked: lockedB, mark: !lockedB });
    for (i = 0; i < 6; i++) {                                      /* 两侧硬边台阶渐暗 */
      R(c, i * 4, 0, 4, VH, 'rgba(8,6,18,' + (0.07 * (6 - i) / 6).toFixed(3) + ')');
      R(c, VW - 4 - i * 4, 0, 4, VH, 'rgba(8,6,18,' + (0.07 * (6 - i) / 6).toFixed(3) + ')');
    }
    return { A: PLATE_A, B: PLATE_B, sign: GEO.sign, lockedB: lockedB, lock: { x: LOCK.x, y: LOCK.y } };
  }
  function paint(c, opts) { return paintStatic(c, opts); }         /* 兼容旧签名 */

  /* 地上那摊光：硬边同心台阶 + 2×2 抖，不是径向渐变 */
  function lightPool(c, cx, cy, w, h, t) {
    /* 台阶要够亮：只给 .01~.03 的话，深色地板上等于没画（第一稿就是这么白画的） */
    var bands = [[0, '.022'], [5, '.030'], [11, '.042'], [17, '.058']], i, k;
    for (i = 3; i >= 0; i--) {
      k = bands[i][0];
      DITH(c, cx - w / 2 + k, cy - h / 2 + k * 0.6, w - k * 2, h - k * 1.2,
        'rgba(255,206,132,' + bands[i][1] + ')', (i + (t | 0)) & 1);
    }
    DITH(c, cx - 34, cy - 4, 68, 10, 'rgba(255,226,170,.30)', 0);
  }
  /* 选中那本：外圈光晕 + 硬金边 + 四角大括号（每帧画，面积大的都走图案） */
  function selRim(c, x, y, w, h, t) {
    var ph = (t * 2) | 0, i;
    DITH(c, x - 10, y - 10, w + 20, h + 20, 'rgba(255,206,132,.10)', ph & 1);
    DITH(c, x - 5, y - 5, w + 10, h + 10, 'rgba(255,206,132,.16)', (ph + 1) & 1);
    FRAME(c, x - 4, y - 4, w + 8, h + 8, 'rgba(94,68,18,.85)');
    FRAME(c, x - 3, y - 3, w + 6, h + 6, '#e8b74a');
    var g = [[x - 6, y - 6, 1, 1], [x + w + 6, y - 6, -1, 1], [x - 6, y + h + 6, 1, -1], [x + w + 6, y + h + 6, -1, -1]];
    for (i = 0; i < 4; i++) {
      var p = g[i], ox = p[2] > 0 ? 0 : -14, oy = p[3] > 0 ? 0 : -14;
      R(c, p[0] + ox, p[1] + oy, 14, 4, '#ffd88f'); R(c, p[0] + ox, p[1] + oy, 4, 14, '#ffd88f');
    }
  }

  /* ---------------- 离屏底图 + 每帧合成 ---------------- */
  var bg = null, lockCv = null, bakedKey = '', running = false, raf = 0;
  var G = {
    sel: 0, lockedB: true, x: GEO.walk.stopA, target: GEO.walk.stopA,
    face: -1, phase: 0.35, jig: 0, t: 0, arrived: true
  };
  function newCv(w, h) {
    var cv = doc.createElement('canvas');
    cv.width = w; cv.height = h;
    return cv;
  }
  function stopOf(i) {
    if (i === 0) return GEO.walk.stopA;
    return G.lockedB ? GEO.walk.stopB - GEO.walk.back : GEO.walk.stopB;
  }
  function bake(opts) {
    var key = (opts && opts.lockedB === false ? '1' : '0') + '|' + ((opts && opts.gauge) || 0);
    if (bg && key === bakedKey) return;
    bakedKey = key;
    bg = newCv(VW, VH);
    var o = { lockedB: !(opts && opts.lockedB === false), gauge: (opts && opts.gauge) || 0 };
    var info = paintStatic(bg.getContext('2d'), o);
    lockCv = null;
    if (o.lockedB && info && info.lock) {
      lockCv = newCv(34, 34);
      lockSprite(lockCv.getContext('2d'), 4, 10);
      lockCv._lx = info.lock.x - 4; lockCv._ly = info.lock.y - 10;
    }
  }
  function keeper(c) {
    if (!(global.ART31 && ART31.paintFigure)) return;
    /* 他站在最暗的那块地板上，只有 36px 高 —— 得给点暖光才看得见。**但光要收成锥形**：
       两块一样宽的方抖在深底上会读成"贴了个方补丁"（第一稿就是），越往上越窄才像光。 */
    DITH(c, G.x - 17, GEO.walk.y - 38, 34, 42, 'rgba(255,206,132,.09)', 0);
    DITH(c, G.x - 12, GEO.walk.y - 28, 24, 32, 'rgba(255,206,132,.11)', 1);
    DITH(c, G.x - 7, GEO.walk.y - 18, 14, 22, 'rgba(255,206,132,.13)', 0);
    ART31.paintFigure(c, 'keeper', G.x / CELL, (GEO.walk.y - 40) / CELL, G.face, 0, G.phase);
    SPK(c, G.x - 26, GEO.walk.y - 58, 52, 12, 'rgba(255,214,150,.22)', 1, 0);   /* 灯落在他身上那点 */
  }
  function drawFrame() {
    var cv = doc.getElementById('home-cv');
    if (!cv || !bg) return;
    var c = cv.getContext('2d');
    if (!c) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, VW, VH);
    c.drawImage(bg, 0, 0);
    var lockedB = G.lockedB;
    var tgt = G.sel === 0 ? GEO.cardA : GEO.cardB;
    lightPool(c, stopOf(G.sel), GEO.walk.y - 8, 300, 30, G.t);
    selRim(c, tgt.x, GEO.card.y, GEO.card.w, GEO.card.h, G.t);
    if (lockedB && lockCv) {
      var jx = 0, jy = 0;
      if (G.jig > 0) { jx = Math.round(Math.sin(G.jig * 22) * 4 * Math.min(1, G.jig / 2)); jy = Math.round(Math.cos(G.jig * 16) * 2); }
      c.drawImage(lockCv, lockCv._lx + jx, lockCv._ly + jy);
    }
    keeper(c);
  }
  function step(dt) {
    var d = G.target - G.x;
    if (Math.abs(d) > 0.7) {
      var sp = 460 * dt, mv = Math.min(Math.abs(d), sp);
      G.x += (d > 0 ? mv : -mv);
      G.face = d > 0 ? 1 : -1;
      G.phase += dt * 11;
      G.arrived = false;
    } else if (!G.arrived) {
      G.x = G.target; G.arrived = true; G.phase = 0.35;
      if (typeof API.onArrive === 'function') { try { API.onArrive(G.sel, G.lockedB); } catch (e) { /* 回调出错不影响画面 */ } }
    }
    if (G.jig > 0) { G.jig -= dt; if (G.jig < 0) G.jig = 0; }
  }
  var last = 0;
  function loop(ts) {
    if (!running) return;
    var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
    last = ts; G.t += dt;
    step(dt);
    drawFrame();
    raf = global.requestAnimationFrame(loop);
  }
  function play() {
    if (running) return;
    running = true; last = 0;
    if (global.requestAnimationFrame) raf = global.requestAnimationFrame(loop);
    else drawFrame();
  }
  function stop() {
    if (INT.active) iEnd('stop');                  /* v47：动画也跟着收，别留空转 */
    running = false;
    if (raf && global.cancelAnimationFrame) { try { global.cancelAnimationFrame(raf); } catch (e) { /* ignore */ } }
    raf = 0;
  }
  function isMob() {
    try { return !!(global.matchMedia && global.matchMedia('(max-width: 700px)').matches); } catch (e) { return false; }
  }
  var lastOpts = { lockedB: true, gauge: 0 };
  /* 上屏：背板与 CSS 一律 960×672（1:1，浏览器零采样）；装不下就整体缩 #home-stage，
     画布和文字同吃这一个变换 —— 绝不会出现「画按倍率缩放、字不缩放」那种穿模。 */
  function mount(opts) {
    if (opts) lastOpts = opts;
    var cv = doc.getElementById('home-cv');
    var stage = doc.getElementById('home-stage');
    var layer = doc.getElementById('home-layer');
    var modal = doc.getElementById('home-modal');
    if (!cv || !stage || !layer || !modal) return null;
    cv.width = VW; cv.height = VH;
    cv.style.width = VW + 'px'; cv.style.height = VH + 'px';
    layer.style.transform = 'none';
    var mob = isMob();
    if (modal.classList) modal.classList.toggle('mob', mob);
    if (mob) {                                          /* 手机：画布收工，卡片走静态列表 */
      stage.style.transform = 'none'; stage.style.width = ''; stage.style.height = '';
      stop();
      return { A: PLATE_A, B: PLATE_B, sign: GEO.sign, mobile: true };
    }
    var availW = Math.max(200, (modal.clientWidth || global.innerWidth || VW) - 8);
    var availH = Math.max(160, (modal.clientHeight || global.innerHeight || VH) - 8);
    var k = Math.min(1, availW / VW, availH / VH);
    /* 只按「装不下」缩：有地方就 1:1（v45 按屏幕算倍率，可画的时候还是按逻辑坐标画，
       倍率 ≠1 就只铺左上角一块，还跟文字层对不上） */
    stage.style.transformOrigin = '0 0';
    stage.style.transform = k < 0.999 ? 'scale(' + k.toFixed(4) + ')' : 'none';
    stage.style.width = (VW * k) + 'px'; stage.style.height = (VH * k) + 'px';
    bake(lastOpts);
    G.lockedB = !(lastOpts && lastOpts.lockedB === false);
    G.sel = (lastOpts && lastOpts.sel) ? 1 : 0;
    G.x = G.target = stopOf(G.sel);
    G.face = G.sel === 0 ? -1 : 1;
    G.arrived = true; G.jig = 0; G.t = 0;
    drawFrame();
    play();
    return { A: PLATE_A, B: PLATE_B, sign: GEO.sign, k: k, mobile: false };
  }
  function setSel(i) {
    G.sel = i ? 1 : 0;
    G.target = stopOf(G.sel);
    G.arrived = Math.abs(G.target - G.x) < 0.7;
    if (G.arrived) {
      G.x = G.target;
      if (typeof API.onArrive === 'function') { try { API.onArrive(G.sel, G.lockedB); } catch (e) { /* ignore */ } }
    }
    play();
  }
  function setLocked(v) { G.lockedB = !!v; }
  function jiggle() { G.jig = 0.42; play(); }
  /* ================= v47：每章入场动画 =================
     账册翻开 → 暖光过渡 → 章节标题 → 收起（露出该章第一屏）。
     三条口径写死在这里：
       ① **纯视觉、不拦任何输入** —— overlay 是 pointer-events:none；这里的监听器走冒泡、
          **不 stopPropagation、不 preventDefault**：跳过用的那颗键照旧落到引擎手里（不吞键）。
       ② 层级 55 < #modal 的 60：二章开场独白压在它上头，照样看得见（不吞独白）。
       ③ 任意键 / 点击可跳过（**按住不放的重复键不算**，否则长按走位那一串会把动画瞬间吃掉）；
          放完自己收（display:none），不留空转。 */
  var IDUR = 1.55;
  var INT = { active: false, plays: 0, skipped: 0, done: 0, t: 0, dur: IDUR,
              title: '', sub: '', raf: 0, last: 0, timer: 0 };
  var IPAPER = ['#f2e8cc', '#e4d5b0', '#cbb98f', '#a89468'];
  function iEls() {
    return { box: doc.getElementById('chapter-intro'), cv: doc.getElementById('ci-cv'),
             ch: doc.getElementById('ci-ch'), sub: doc.getElementById('ci-sub') };
  }
  function iFit() {                                  /* 装不下整体缩（跟主界面一套口径） */
    var e = iEls();
    if (!e.cv) return 1;
    var w = global.innerWidth || VW, h = global.innerHeight || VH;
    var k = Math.min(1, (w - 12) / VW, (h - 12) / VH);
    e.cv.style.width = VW + 'px'; e.cv.style.height = VH + 'px';
    e.cv.style.transform = k < 0.999 ? 'scale(' + k.toFixed(4) + ')' : 'none';
    return k;
  }
  /* 一页纸：羊皮纸四阶 + 2×2 抖动纸纹 + 页边压暗 + 一行行账目 + 一枚朱印 */
  function iPage(c, x, y, w, h, side) {
    var j = 0, rows = 0, ly = 0, sx = 0;
    R(c, x, y, w, h, IPAPER[1]);
    DITH(c, x + 2, y + 2, w - 4, h - 4, 'rgba(168,148,104,.16)', side);
    R(c, x, y, w, 2, IPAPER[0]);
    R(c, x, y + h - 2, w, 2, IPAPER[3]);
    if (side === 0) {
      R(c, x, y, 3, h, 'rgba(74,52,32,.34)');
      R(c, x + w - 7, y, 7, h, 'rgba(74,52,32,.20)');
    } else {
      R(c, x + w - 3, y, 3, h, 'rgba(74,52,32,.34)');
      R(c, x, y, 7, h, 'rgba(74,52,32,.20)');
    }
    rows = Math.max(0, Math.floor((h - 20) / 11));
    for (j = 0; j < rows; j++) {
      ly = y + 11 + j * 11;
      R(c, x + 9, ly, w - 18, 1, 'rgba(58,40,24,.40)');
      R(c, x + 9, ly + 4, Math.round((w - 18) * (0.30 + ((j * 7 + side * 3) % 5) * 0.12)), 1, 'rgba(58,40,24,.20)');
    }
    sx = side === 0 ? x + w - 30 : x + 12;
    R(c, sx, y + h - 32, 15, 15, 'rgba(152,58,44,.30)');
    R(c, sx + 4, y + h - 28, 7, 7, 'rgba(152,58,44,.24)');
  }
  function iPaint(c, t) {
    var cx = VW / 2, cy = 300;
    var i = 0, sp = 0, e = 0, pw = 0, ph = 0, bx = 0, by = 0, g = 0, q = 0, rr = 0, ww = 0, hh = 0, q2 = 0;
    R(c, 0, 0, VW, VH, '#0a0714');
    sp = Math.min(1, t / 0.44); e = sp * sp * (3 - 2 * sp);
    pw = Math.round(46 + e * 186); ph = Math.round(104 + e * 76);
    bx = Math.round(cx - pw); by = Math.round(cy - ph / 2);
    /* 书缝里先透出一圈暖光（灯亮起来那一下） */
    if (t < 0.62) {
      g = t < 0.44 ? e : Math.max(0, 1 - (t - 0.44) / 0.18);
      DITH(c, cx - pw - 70, by - 48, (pw + 70) * 2, ph + 96, 'rgba(255,206,132,' + (0.05 + g * 0.07).toFixed(3) + ')', 0);
      DITH(c, cx - Math.round(pw * 0.62), by - 18, Math.round(pw * 1.24), ph + 36, 'rgba(255,226,170,' + (0.06 + g * 0.09).toFixed(3) + ')', 1);
    }
    iPage(c, bx, by, pw, ph, 0);
    iPage(c, cx, by, pw, ph, 1);
    R(c, cx - 3, by - 3, 6, ph + 6, '#2a1c10');                 /* 中缝 + 书脊 */
    R(c, cx - 1, by - 3, 2, ph + 6, '#4a3420');
    R(c, bx - 6, by - 6, pw * 2 + 12, 6, '#3a2818');            /* 上下封皮 */
    R(c, bx - 6, by + ph, pw * 2 + 12, 6, '#3a2818');
    R(c, bx - 6, by - 6, pw * 2 + 12, 1, '#6b4a28');
    R(c, bx - 6, by + ph + 5, pw * 2 + 12, 1, '#1a1208');
    /* 过渡：暖光一圈圈往外铺（14 圈抖动，越外越淡） */
    if (t > 0.44) {
      q = Math.min(1, (t - 0.44) / 0.42);
      for (i = 0; i < 14; i++) {
        rr = (i + 1) / 14;
        ww = Math.round(q * VW * 0.62 * rr); hh = Math.round(q * VH * 0.62 * rr);
        DITH(c, cx - ww, cy - hh, ww * 2, hh * 2, 'rgba(255,206,132,' + (0.017 * (1 - rr * 0.55)).toFixed(3) + ')', i & 1);
      }
    }
    /* 标题阶段：账册压暗、四角收黑，DOM 那行字浮在上头 */
    if (t > 0.86) {
      q2 = Math.min(1, (t - 0.86) / 0.30);
      DITH(c, 0, 0, VW, VH, 'rgba(4,3,8,' + (0.26 + q2 * 0.36).toFixed(3) + ')', 0);
      DITH(c, 0, cy - 130, VW, 260, 'rgba(255,206,132,' + (0.032 * q2).toFixed(3) + ')', 1);
      R(c, cx - 116, cy + 96, 232, 1, 'rgba(217,180,106,.45)');
      SPK(c, cx - 150, cy - 60, 300, 150, 'rgba(255,214,150,.05)', 1, 0);
    }
    return t;
  }
  var iBound = false;
  function iOnKey(e) {
    if (!INT.active) return;
    if (e && e.repeat) return;                     /* 按住不放的重复键不算"新按一下" */
    if (e && e.key === 'Escape') return;           /* ESC 留给引擎（关弹窗），不当跳过键 */
    skipIntro();
  }
  function iOnPtr() { if (INT.active && INT.t > 0.04) skipIntro(); }
  function attachIntro() {
    if (iBound) return;
    iBound = true;
    /* **只听 keydown，不听 keyup** —— 进场那颗键的 up 会在 20ms 后到，等于把动画当场跳过
       （真机实测：键盘进场＝动画基本看不见）。重复键在上头已经滤掉了。 */
    try { doc.addEventListener('keydown', iOnKey); } catch (e) { /* ignore */ }
    try { global.addEventListener('pointerdown', iOnPtr); global.addEventListener('touchstart', iOnPtr); } catch (e) { /* ignore */ }
  }
  function detachIntro() {
    if (!iBound) return;
    iBound = false;
    try { doc.removeEventListener('keydown', iOnKey); } catch (e) { /* ignore */ }
    try { global.removeEventListener('pointerdown', iOnPtr); global.removeEventListener('touchstart', iOnPtr); } catch (e) { /* ignore */ }
  }
  function iEnd(why) {
    if (!INT.active) return;
    INT.active = false;
    if (INT.raf && global.cancelAnimationFrame) { try { global.cancelAnimationFrame(INT.raf); } catch (e) { /* ignore */ } }
    INT.raf = 0;
    detachIntro();
    if (why === 'skip') INT.skipped++; else INT.done++;
    var e = iEls(), box = e.box;
    if (box && box.classList) box.classList.add('out');
    if (INT.timer) { try { global.clearTimeout(INT.timer); } catch (er) { /* ignore */ } }
    INT.timer = global.setTimeout(function () {
      INT.timer = 0;
      if (!box || !box.classList) return;
      try { box.classList.remove('show'); box.classList.remove('out'); box.classList.remove('titled'); } catch (er) { /* ignore */ }
    }, 190);
  }
  function skipIntro() { if (INT.active) iEnd('skip'); }
  function iFrame(ts) {
    if (!INT.active) return;
    var dt = INT.last ? Math.min(0.05, (ts - INT.last) / 1000) : 0.016;
    INT.last = ts; INT.t += dt;
    var e = iEls();
    if (e.cv) {
      var c = e.cv.getContext && e.cv.getContext('2d');
      if (c) { try { c.setTransform(1, 0, 0, 1, 0, 0); iPaint(c, INT.t); } catch (er) { /* 画不出来也不许炸 */ } }
    }
    if (e.box && e.box.classList && INT.t >= 0.86) e.box.classList.add('titled');
    if (INT.t >= INT.dur) { iEnd('done'); return; }
    INT.raf = global.requestAnimationFrame ? global.requestAnimationFrame(iFrame) : 0;
    if (!INT.raf) iEnd('done');                    /* 没有 rAF 就不许挂着不放 */
  }
  function playIntro(o) {
    var e = iEls(), c = null;
    if (!e.box || !e.cv) return false;             /* 页面里没有那层（老页面）就别硬放 */
    if (INT.timer) { try { global.clearTimeout(INT.timer); } catch (er) { /* ignore */ } INT.timer = 0; }
    INT.title = (o && o.title) || ''; INT.sub = (o && o.sub) || '';
    INT.t = 0; INT.last = 0; INT.active = true; INT.plays++;
    if (e.ch) e.ch.textContent = INT.title;
    if (e.sub) e.sub.textContent = INT.sub || '';
    if (e.box.classList) { e.box.classList.add('show'); e.box.classList.remove('out'); e.box.classList.remove('titled'); }
    iFit();
    attachIntro();
    c = e.cv.getContext && e.cv.getContext('2d');
    if (c) { try { iPaint(c, 0); } catch (er) { /* ignore */ } }
    if (global.requestAnimationFrame) INT.raf = global.requestAnimationFrame(iFrame);
    else { INT.t = INT.dur; iEnd('done'); }
    return true;
  }

  var API = {
    version: '47.0', VW: VW, VH: VH, GEO: GEO, plateA: PLATE_A, plateB: PLATE_B,
    paint: paint, mount: mount, stop: stop, setSel: setSel, setLocked: setLocked,
    jiggle: jiggle, stopOf: stopOf, state: G, onArrive: null,
    playIntro: playIntro, skipIntro: skipIntro, introState: INT, _iPaint: iPaint,
    _bake: bake, _frame: drawFrame, ramp: ramp, blend: blend
  };
  global.HOMEART = API;
})(typeof window !== 'undefined' ? window : globalThis);
