/* ============================================================
   主界面 · 像素版画师（v45）
   ------------------------------------------------------------
   口径跟游戏本体完全一致：1 美术像素 = 1 逻辑像素 @960×672、硬边（只吃 fillStyle +
   fillRect，不出现渐变/圆弧/路径）、限定色阶（ramp 四阶）、2×2 抖动、
   背板 = 屏幕设备像素 → 1:1 最近邻上屏（浏览器零采样）。

   底直接复用游戏铺地（当铺木地板，连踩白的走道都在），人物复用 ART31.paintFigure('keeper')。
   文字与按钮**不进画布**：留在 DOM 层（跟游戏 #labels 一个口径，字不被像素化），
   由 CSS 按下面这份逻辑坐标绝对定位 —— 所以两边必须对着改，改了这边要同步 home CSS。

   一拍：openHome 时烘焙一次（不是每帧画），之后每帧零成本。
   ============================================================ */
(function (global) {
  'use strict';
  var VW = 960, VH = 672;

  /* 版面（逻辑像素）—— 改这里必须同步 index.html 的「主界面 · 像素版」那段 CSS */
  var GEO = {
    sign: { x: 316, y: 40, w: 328, h: 88 },          /* 木招牌 */
    lampX: 480, lampY: 176,                          /* 挂灯 */
    keeperX: 480, keeperY: 532,                      /* 掌柜（脚底在台面下 4px，露头肩 32px） */
    counter: { y: 528, h: 84 },                      /* 柜台 */
    card: { y: 278, w: 300, h: 250 },                /* 两本账册（＝两张卡）的封面 */
    cardA: { x: 108 }, cardB: { x: 552 },
    plate: { dx: 34, dy: 34, dw: 58, dh: 84 },       /* 封面里那块标签牌（文字就摆在这上面） */
    footY: 626                                      /* 底部那行掌柜的话 */
  };
  /* 标签牌（文字区）的逻辑坐标：CSS 里那两组数字就是从这里算出来的 */
  var PLATE_A = { x: GEO.cardA.x + GEO.plate.dx, y: GEO.card.y + GEO.plate.dy, w: GEO.card.w - GEO.plate.dw, h: GEO.card.h - GEO.plate.dh };
  var PLATE_B = { x: GEO.cardB.x + GEO.plate.dx, y: GEO.card.y + GEO.plate.dy, w: PLATE_A.w, h: PLATE_A.h };

  var U = (global.ART31 && global.ART31._u) || null;
  function hexOf(col) {
    var m = /^#([0-9a-f]{6})$/i.exec(String(col || ''));
    if (!m) return null;
    var v = parseInt(m[1], 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
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
  /* 2×2 块抖（整幅压暗、雾幕都用它；不是逐像素噪点） */
  function DITH(c, x, y, w, h, col, ph) {
    var i, j;
    for (j = 0; j < h; j += 2) for (i = 0; i < w; i += 2) {
      if ((((i >> 1) + (j >> 1) + (ph || 0)) & 1) === 0) R(c, x + i, y + j, 2, 2, col);
    }
  }
  /* 1px Bayer 细抖（灯下的浮点、掌柜身上那层光） */
  function SPK(c, x, y, w, h, col, amt, ph) {
    var B = [[0, 2], [3, 1]], i, j;
    amt = amt || 2; ph = (ph || 0) & 3;
    c.fillStyle = col;
    for (j = 0; j < h; j++) for (i = 0; i < w; i++) {
      if (amt >= 4 || B[(j + (ph >> 1)) & 1][(i + (ph & 1)) & 1] < amt) c.fillRect(x + i, y + j, 1, 1);
    }
  }
  /* 一本账册＝一张卡：皮革四阶 + 书脊 + 装订金线 + 四角铜包角 + 标签牌（锁态加封条/铜锁/火漆） */
  function ledger(c, x, y, w, h, leather, locked) {
    var L = ramp(leather, 4), oc = blend(leather, '#0d1018', 0.62), j;
    R(c, x + 3, y + 3, w, h, 'rgba(0,0,0,.45)');                  /* 硬台阶投影 */
    FRAME(c, x - 1, y - 1, w + 2, h + 2, oc);
    R(c, x, y, w, h, L[1]); R(c, x, y, 16, h, L[0]); VL(c, x + 16, y, h, L[2]);
    HL(c, x, y, w, L[2]); VL(c, x, y, h, L[2]); VL(c, x + w - 1, y, h, oc); HL(c, x, y + h - 1, w, oc);
    for (j = 10; j < h - 10; j += 7) { R(c, x + 5, y + j, 2, 2, '#c9a227'); R(c, x + 10, y + j, 2, 2, '#8a6c38'); }
    DITH(c, x + 18, y + 2, w - 20, h - 4, 'rgba(255,255,255,.055)', 0);
    [[x + 2, y + 2], [x + w - 14, y + 2], [x + 2, y + h - 14], [x + w - 14, y + h - 14]].forEach(function (p) {
      R(c, p[0], p[1], 12, 4, '#c9a227'); R(c, p[0], p[1], 4, 12, '#c9a227'); R(c, p[0] + 4, p[1] + 4, 6, 2, '#8a6c38');
    });
    var px = x + GEO.plate.dx, py = y + GEO.plate.dy, pw = w - GEO.plate.dw, ph = h - GEO.plate.dh, k;
    R(c, px - 2, py - 2, pw + 4, ph + 4, oc);
    R(c, px, py, pw, ph, blend(L[3], locked ? '#151022' : '#241c33', locked ? 0.74 : 0.62));
    HL(c, px, py, pw, 'rgba(255,255,255,.18)'); HL(c, px, py + ph - 1, pw, 'rgba(0,0,0,.30)');
    for (k = 0; k < pw; k += 9) R(c, px + k, py + 3, 4, 1, 'rgba(0,0,0,.08)');
    if (locked) {
      /* 封条只压标签牌下沿一条（斜带会糊住字，这块吃过亏） */
      R(c, px - 6, py + ph - 20, pw + 12, 15, 'rgba(150,140,168,.30)');
      HL(c, px - 6, py + ph - 20, pw + 12, 'rgba(196,188,214,.34)');
      HL(c, px - 6, py + ph - 6, pw + 12, 'rgba(20,14,30,.55)');
      for (k = 0; k < pw + 12; k += 10) R(c, px - 6 + k, py + ph - 18, 6, 2, 'rgba(255,255,255,.10)');
      R(c, x + w - 58, py - 10, 26, 15, '#8c2f3a');               /* 红火漆 */
      HL(c, x + w - 58, py - 10, 26, '#b8495a'); HL(c, x + w - 58, py + 4, 26, '#5e1c25');
      R(c, x + w - 46, py + 5, 3, 10, '#5e1c25');
      var lx = px + pw / 2 - 11, ly = py + ph - 26;               /* 铜锁挂在书脊一侧，不压字 */
      R(c, lx - 2, ly - 2, 26, 26, oc); R(c, lx, ly, 22, 22, '#c9a227'); R(c, lx + 3, ly + 3, 16, 16, '#8a6c38');
      R(c, lx + 8, ly - 6, 6, 8, '#c9a227'); VL(c, lx + 10, ly + 5, 7, '#2a2438');
      R(c, lx + 6, ly + 8, 3, 3, '#2a2438'); R(c, lx + 13, ly + 8, 3, 3, '#2a2438');
    }
  }
  function paint(c, opts) {
    if (!c || !c.fillRect) return null;
    /* lockedB：第二章是否封着 —— 这是**游戏状态**，不能写死：
       解锁后字变成「进入第二章」，画布上却还挂着封条/铜锁/火漆，图文就打架了。 */
    var lockedB = !(opts && opts.lockedB === false);
    var SC = { id: 'pawnshop', ambient: 'lamp', palette: { ground: '#1d2733' } };
    var wallL = ramp('#4a3620', 4), wd = ramp('#7a5230', 4), cd = ramp('#5a3b22', 4);
    var lampX = GEO.lampX, lampY = GEO.lampY, i;
    var sx = GEO.sign.x, sy = GEO.sign.y, sw = GEO.sign.w, sh = GEO.sign.h;
    var CY = GEO.counter.y, CYT = GEO.counter.h;
    ART31.paintGround(c, SC, SC.palette);                    /* 底：当铺木地板 */
    DITH(c, 0, 0, VW, VH, 'rgba(9,7,20,.62)', 0);            /* 压暗＝硬边雾幕，不是一层平灰 */
    DITH(c, 0, 0, VW, 300, 'rgba(9,7,20,.5)', 1);
    DITH(c, 0, VH - 160, VW, 160, 'rgba(9,7,20,.45)', 1);
    R(c, 0, 0, VW, 300, '#2b1e12');                          /* 后墙：竖板壁 + 横梁 */
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
    var wd2 = ramp('#6b4a2a', 4);                            /* 招牌：木牌 + 内嵌金线 + 铜片 + 挂链 */
    R(c, sx - 2, sy - 2, sw + 4, sh + 4, '#2a1c10');
    R(c, sx, sy, sw, sh, wd2[1]); HL(c, sx, sy, sw, wd2[3]);
    HL(c, sx, sy + sh - 1, sw, wd2[0]); VL(c, sx, sy, sh, wd2[2]); VL(c, sx + sw - 1, sy, sh, wd2[0]);
    FRAME(c, sx + 5, sy + 5, sw - 10, sh - 10, '#c9a227');
    for (i = 0; i < 4; i++) { R(c, sx + 2, sy + 2 + i * 2, 10, 4, '#8a6c38'); R(c, sx + sw - 12, sy + 2 + i * 2, 10, 4, '#8a6c38'); }
    VL(c, sx - 6, sy + 8, 8, '#3a3a44'); VL(c, sx + sw + 5, sy + 8, 8, '#3a3a44');
    if (global.ART31 && ART31.paintFigure) {
      ART31.paintFigure(c, 'keeper', GEO.keeperX / 48, (GEO.keeperY - 40) / 48, -1, 0, 0.35);
    }
    SPK(c, 452, 494, 56, 12, 'rgba(255,214,150,.16)', 1, 0);      /* 掌柜身上那点灯光 */
    R(c, 0, CY, VW, CYT, cd[0]);                                  /* 柜台 */
    R(c, 0, CY, VW, 16, wd[3]); HL(c, 0, CY, VW, '#e6c48a'); HL(c, 0, CY + 1, VW, wd[2]);
    for (i = 0; i < VW; i += 96) VL(c, i, CY + 16, CYT - 16, cd[1]);
    for (i = 48; i < VW; i += 96) { R(c, i - 2, CY + 34, 4, 4, '#c9a227'); R(c, i - 2, CY + 60, 4, 4, '#8a6c38'); }
    HL(c, 0, CY + 16, VW, '#3a2412'); HL(c, 0, CY + CYT - 1, VW, '#1d1310');
    ledger(c, GEO.cardA.x, GEO.card.y, GEO.card.w, GEO.card.h, '#8a5a30', false);   /* 第一章＝摊开的账 */
    R(c, GEO.cardA.x + GEO.card.w - 52, GEO.card.y - 6, 9, 40, '#c9a227');          /* 金书签 */
    R(c, GEO.cardA.x + GEO.card.w - 56, GEO.card.y + 34, 17, 14, '#e8b74a');
    R(c, PLATE_A.x, PLATE_A.y + PLATE_A.h + 10, PLATE_A.w, 11, '#241a10');         /* 12 格进度刻度 */
    for (i = 0; i < 12; i++) {
      R(c, PLATE_A.x + 3 + i * (PLATE_A.w - 6) / 12, PLATE_A.y + PLATE_A.h + 12,
        (PLATE_A.w - 6) / 12 - 3, 7, i === 0 ? '#e8b74a' : '#4a3f75');
    }
    ledger(c, GEO.cardB.x, GEO.card.y, GEO.card.w, GEO.card.h, '#4a4258', lockedB);   /* 第二章：封着／开了 */
    R(c, 0, VH - 56, VW, 56, 'rgba(10,8,20,.88)'); HL(c, 0, VH - 56, VW, '#3a3158');
    for (i = 0; i < 6; i++) {                                                       /* 两侧硬边台阶渐暗 */
      R(c, i * 4, 0, 4, VH, 'rgba(8,6,18,' + (0.07 * (6 - i) / 6).toFixed(3) + ')');
      R(c, VW - 4 - i * 4, 0, 4, VH, 'rgba(8,6,18,' + (0.07 * (6 - i) / 6).toFixed(3) + ')');
    }
    return { A: PLATE_A, B: PLATE_B, sign: GEO.sign };
  }
  /* 上屏：背板 = 屏幕设备像素（1:1，浏览器零采样）；文字层按同一个倍率缩放。
     传 opts 记下来 —— 窗口缩放重烘时不用调用方再传一遍。 */
  var lastOpts = { lockedB: true };
  function mount(opts) {
    if (opts) lastOpts = opts;
    var cv = global.document && document.getElementById('home-cv');
    var stage = global.document && document.getElementById('home-stage');
    var layer = global.document && document.getElementById('home-layer');
    if (!cv || !stage || !layer) return null;
    var dpr = global.devicePixelRatio || 1;
    /* 倍率要按**遮罩自己的方框**算，不是整窗 —— 遮罩只盖住游戏区时，
       按整窗算会画出比遮罩还大的背板，被 overflow:hidden 四周裁掉（这块吃过一次亏）。 */
    var modal = global.document.getElementById('home-modal');
    var availW = ((modal && modal.clientWidth) || global.innerWidth || VW) - 6;
    var availH = ((modal && modal.clientHeight) || global.innerHeight || VH) - 6;
    var raw = Math.min(availW / VW, availH / VH) * dpr;
    var S = Math.max(1, Math.min(raw, 3));
    cv.width = Math.round(VW * S); cv.height = Math.round(VH * S);
    cv.style.width = (cv.width / dpr) + 'px'; cv.style.height = (cv.height / dpr) + 'px';
    stage.style.width = cv.style.width; stage.style.height = cv.style.height;
    layer.style.transform = 'scale(' + (S / dpr).toFixed(6) + ')';
    var ctx = cv.getContext('2d');
    return paint(ctx, lastOpts);
  }
  global.HOMEART = { version: '45.1', VW: VW, VH: VH, GEO: GEO, plateA: PLATE_A, plateB: PLATE_B, paint: paint, mount: mount, ramp: ramp, blend: blend };
})(typeof window !== 'undefined' ? window : globalThis);
