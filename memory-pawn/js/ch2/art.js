/* 《记忆当铺》二章 · 记忆库（ch2_vault）像素美术 —— A 线 / 画质
   ============================================================================
   口径（跟一章 art31 同一套，不许破）：
     · 1 美术像素 = 1 逻辑像素 @960×672；只用 fillStyle + fillRect
     · 不用渐变 / 圆弧 / 路径；整数坐标；限定色阶；2×2 抖动；1px Bayer 点光
   接线（**不改 game23.js**）：
     本模块在加载时把 ART31.paintGround / paintSolids **包一层** —— 只有 sc.id === 'ch2_vault'
     走这里的画法，别的场景原样转交给 art31（它的行为一个字节都没改）。这样新场景的美术
     是"插上去"的，引擎那侧零改动；哪天不想要了，删掉 index.html 里那一行 script 即可。
   画了什么（对着 v56 §1.1 的形制）：
     · 三排木架：上排**当票匣**（储物），中排 A–M、下排 N–Z —— **26 只粗陶罐**，一格一只
     · 每罐：铜牌刻号（3×5 点阵字母，设计里格号就是 A–Z）+ **火漆封条**（颜色＝入库批次）
       —— 没封的那几只＝空罐（设计 §1.1-3：格号不复用，空了也留着号）
     · 近景那一条（画布最下缘）＝**账房收当台**：账本 / 算盘 / 油灯 / 笔筒 / 一叠空当票
       —— 二章玩家是"坐柜台后收当的人"，柜台就该在离眼睛最近的那条
     · 两侧墙各开一道门（左＝原路出去，右＝库里那道矮门），门缝里漏外间的暖光
     · 一盏吊灯 + 两盏壁灯：地面三级光池；靠门那半间飘着**潮气**（下排"靠门潮"）
   不画汉字：一章的世界美术一律不往画布上写字（文本走 DOM），这里照办 —— 匾额只刻纹样。
   ============================================================================ */
(function (global) {
  'use strict';

  var V = 'ch2_vault';
  var VW = 960, VH = 672, CELL = 48;

  /* ---------- 小工具 ---------- */
  function R(v) { return Math.round(v); }
  function U() { return (global.ART31 && global.ART31._u) || null; }
  function shadeOf(col, amt) { var u = U(); return u && u.shade ? u.shade(col, amt) : col; }
  function mixOf(a, b, t) { var u = U(); return u && u.mix ? u.mix(a, b, t) : a; }
  function blendOf(a, b, t) { var u = U(); return u && u.blend ? u.blend(a, b, t) : b; }
  /* 确定性随机：同一格每次烘焙的花纹完全一样，刷新不变 */
  function rng(x, y, k) {
    var u = U();
    if (u && u.rngAt) return u.rngAt(x, y, k);
    var n = (Math.abs(x) * 374761393 + Math.abs(y) * 668265263 + (k || 0) * 2246822519) >>> 0;
    return function () { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296; };
  }
  function rect(c, x, y, w, h, col) {
    x = R(x); y = R(y); w = R(w); h = R(h);
    if (w <= 0 || h <= 0) return;
    c.fillStyle = col; c.fillRect(x, y, w, h);
  }
  /* 2×2 抖动：大块走图案（一次 fillRect），拿不到图案（无头测试的假 ctx）就一步步铺 */
  var PAT = {};
  function tileOf(col) {
    if (PAT[col] !== undefined) return PAT[col];
    PAT[col] = null;
    try {
      if (typeof document === 'undefined' || !document.createElement) return null;
      var t = document.createElement('canvas');
      t.width = 2; t.height = 2;
      var tc = t.getContext && t.getContext('2d');
      if (!tc || !tc.fillRect) return null;
      tc.fillStyle = col; tc.fillRect(0, 0, 1, 1); tc.fillRect(1, 1, 1, 1);
      PAT[col] = t;
    } catch (e) { PAT[col] = null; }
    return PAT[col];
  }
  function dith(c, x, y, w, h, col, phase) {
    x = R(x); y = R(y); w = R(w); h = R(h);
    if (w <= 0 || h <= 0) return;
    var tile = tileOf(col), p = null;
    if (tile && c.createPattern) { try { p = c.createPattern(tile, 'repeat'); } catch (e) { p = null; } }
    if (p) {
      if (c.save) c.save();
      c.fillStyle = p;
      if (phase && c.translate) c.translate(1, 1);
      c.fillRect(x, y, w, h);
      if (c.restore) c.restore();
      return;
    }
    c.fillStyle = col;
    var ox = phase ? 1 : 0, yy, xx;
    for (yy = 0; yy < h; yy += 2) for (xx = ox; xx < w; xx += 2) c.fillRect(x + xx, y + yy, 1, 1);
  }
  /* 1px 点光（Bayer 4×4 阈值）：灯落下来的那点碎光，比铺色干净 */
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function spk(c, x, y, w, h, col, amt, phase) {
    x = R(x); y = R(y); w = R(w); h = R(h);
    var thr = Math.max(1, Math.min(16, R(16 - amt * 15)));
    c.fillStyle = col;
    for (var yy = 0; yy < h; yy++) {
      for (var xx = 0; xx < w; xx++) {
        var b = BAYER[((yy + (phase || 0)) & 3) * 4 + ((xx + (phase || 0)) & 3)];
        if (b < thr) c.fillRect(x + xx, y + yy, 1, 1);
      }
    }
  }

  /* ---------- 3×5 点阵（铜牌刻号用；设计里格号就是 A–Z） ---------- */
  var FONT = {
    A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'],
    C: ['011', '100', '100', '100', '011'], D: ['110', '101', '101', '101', '110'],
    E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
    G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'],
    I: ['111', '010', '010', '010', '111'], J: ['001', '001', '001', '101', '010'],
    K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'],
    M: ['101', '111', '111', '101', '101'], N: ['110', '101', '101', '101', '101'],
    O: ['010', '101', '101', '101', '010'], P: ['110', '101', '110', '100', '100'],
    Q: ['010', '101', '101', '110', '011'], R: ['110', '101', '110', '101', '101'],
    S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'],
    U: ['101', '101', '101', '101', '011'], V: ['101', '101', '101', '101', '010'],
    W: ['101', '101', '111', '111', '101'], X: ['101', '101', '010', '101', '101'],
    Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111']
  };
  function glyph(c, ch, x, y, col) {
    var g = FONT[ch]; if (!g) return;
    c.fillStyle = col;
    for (var r = 0; r < 5; r++) {
      var row = g[r];
      for (var i = 0; i < 3; i++) if (row.charAt(i) === '1') c.fillRect(x + i, y + r, 1, 1);
    }
  }

  /* ---------- 调色（从场景 palette 派生，改场景数据这里跟着变） ---------- */
  function palOf(sc) {
    var p = (sc && sc.palette) || {};
    var floor = p.ground || '#241d2b';
    var floor2 = p.ground2 || '#2b2333';
    /* 地板比墙**暖且亮**：这是"屋子立起来"的第一眼凭证 —— 第一版地板用石缝，结果
       跟墙一样是砖，整屏读成一堵墙（实拍自审抓到）。 */
    var board = mixOf(shadeOf(floor2, 0.20), '#4a382c', 0.50);
    return {
      floorDark: shadeOf(floor, -0.30), floorBase: floor, floorLit: shadeOf(floor2, 0.30),
      seam: shadeOf(floor, -0.46),
      board: board, boardLit: shadeOf(board, 0.30), boardDeep: shadeOf(board, -0.34),
      boardSeam: shadeOf(floor, -0.58),
      wallBase: blendOf(shadeOf(floor, -0.12), '#2a2130', 0.45),
      wallLit: shadeOf(blendOf(p.solid || '#120e17', '#3a2a30', 0.55), 0.34),
      wallDark: shadeOf(blendOf(p.solid || '#120e17', '#241a24', 0.5), 0.10),
      mortar: shadeOf(p.solid || '#120e17', 0.20),
      wood: '#6b4a28', woodLit: '#8f6737', woodHi: '#b08549', woodDark: '#432f1a', woodDeep: '#241a10',
      pottery: '#7a6650', potLit: '#a08a6c', potDark: '#4e4034', potDeep: '#2c241c',
      copper: '#a5792f', copperLit: '#d8b054', copperDark: '#5c3f16',
      brass: '#c99a44', brassLit: '#f0d68c',
      paper: '#e8e0cc', paperDark: '#b9ae94', ink: '#2a2018',
      lamp: '255,206,132', lampKey: '255,226,170',
      fog: '158,182,208',
      letterDark: '#2a1a08'
    };
  }
  /* 入库批次：火漆颜色 —— 一色一批，按格号分（画上去是干净的，接真状态是一行的事） */
  var WAX = ['#a8322a', '#96602a', '#2f6a68', '#6a4276'];

  /* ============================================================
     一、地面：木栈道 + 石板缝 + 光池 + 潮气
     ============================================================ */
  function paintFloor(c, sc) {
    var P = palOf(sc);
    rect(c, 0, 0, VW, VH, P.wallDark);                        /* 先把整张铺满（底下 sky 不许露） */

    var y, x;
    /* 地面＝长条木栈道：一条 22 高、横向通铺、端头错缝。地是暖的、墙是冷的，
       "这是一间屋子"全靠这条分界（第一版铺石缝，整屏读成一堵墙）。 */
    for (y = 48; y < 624; y += 22) {
      var shift = ((y / 22) % 3) * 62;
      for (x = 48 - shift; x < 912; x += 184) {
        var r = rng(x, y, 3), t = r();
        /* 板色四档抖开（一章那张地板就是靠这个才有活气，平色铺过去像塑料） */
        /* 对比度要压住：地板一花，整屏就跟着读成"木墙"（v3 实拍栽过） */
        var col = t > 0.86 ? mixOf(P.board, P.boardLit, 0.75)
                : t > 0.58 ? mixOf(P.board, P.boardLit, 0.30)
                : t < 0.24 ? shadeOf(P.board, -0.13)
                : P.board;
        rect(c, x, y, 182, 20, col);
        rect(c, x, y, 182, 1, mixOf(col, '#ffffff', 0.08));   /* 板面高光 */
        rect(c, x, y + 20, 182, 2, P.boardSeam);              /* 板缝 */
        rect(c, x + 182, y, 2, 20, P.boardSeam);              /* 端头缝 */
        /* 木纹：几道 1px 长痕，长短深浅不一 —— 这是画质的那口气 */
        var g = 2 + R(r() * 3), q;
        for (q = 0; q < g; q++) {
          var gx = x + R(r() * 46), gw = 40 + R(r() * 120);
          if (gx + gw > x + 180) gw = x + 180 - gx;
          if (gw > 6) rect(c, gx, y + 3 + R(r() * 14), gw, 1, q % 2 ? 'rgba(0,0,0,.075)' : 'rgba(255,240,214,.05)');
        }
        if (t > 0.55) { rect(c, x + 20, y + 6, 1, 9, 'rgba(0,0,0,.10)'); rect(c, x + 74, y + 4, 1, 13, 'rgba(0,0,0,.075)'); }
        if (r() > 0.58) { rect(c, x + 12, y + 10, 1, 1, 'rgba(0,0,0,.28)'); rect(c, x + 168, y + 10, 1, 1, 'rgba(0,0,0,.28)'); }
      }
    }
    /* 墙脚：墙与地交界的一道亮边 + 落影 —— 屋子因此才立得住 */
    rect(c, 48, 46, 864, 3, mixOf(P.boardLit, P.woodHi, 0.35));
    dith(c, 48, 49, 864, 10, 'rgba(0,0,0,.30)', 0);
    rect(c, 46, 48, 3, 576, mixOf(P.boardLit, P.woodHi, 0.30));
    dith(c, 49, 48, 10, 576, 'rgba(0,0,0,.30)', 1);
    rect(c, 912, 48, 3, 576, mixOf(P.boardLit, P.woodHi, 0.30));
    dith(c, 902, 48, 10, 576, 'rgba(0,0,0,.30)', 0);
    /* 中央那条走道：板子**竖着铺**（朝着屋里退）—— 全屏唯一一条"往里"的线。
       横铺到底就是一堵木墙（v2~v5 一直栽在这），一条竖走道 + 两边压暗，屋子立刻有进深。 */
    var ax;
    for (ax = 240; ax < 720; ax += 26) {
      var ar = rng(ax, 1, 9), at = ar();
      var ac = at > 0.84 ? mixOf(P.board, P.boardLit, 0.55)
             : at < 0.24 ? shadeOf(P.board, -0.10)
             : mixOf(P.board, P.boardLit, 0.14);
      rect(c, ax, 48, 24, 576, ac);
      rect(c, ax + 24, 48, 2, 576, P.boardSeam);            /* 竖板缝 */
      var j, jy = 70 + R(ar() * 150);
      for (j = 0; j < 4; j++) {                             /* 横向接头，错开 */
        rect(c, ax, jy, 24, 2, P.boardSeam);
        rect(c, ax + 3, jy + 2, 18, 1, 'rgba(255,240,214,.045)');
        jy += 150 + R(ar() * 40);
      }
      var g2 = 1 + R(ar() * 3), q2;
      for (q2 = 0; q2 < g2; q2++) {
        var gy = 60 + R(ar() * 500), gh = 40 + R(ar() * 120);
        if (gy + gh > 620) gh = 620 - gy;
        if (gh > 8) rect(c, ax + 3 + R(ar() * 16), gy, 1, gh, 'rgba(0,0,0,.075)');
      }
    }
    rect(c, 238, 48, 3, 576, P.boardDeep);                  /* 走道两边收边 */
    rect(c, 718, 48, 3, 576, P.boardDeep);
    dith(c, 240, 48, 480, 576, 'rgba(224,206,176,.030)', 0);
    /* 走道两侧（货架底下那片）压暗一档 */
    dith(c, 48, 48, 192, 576, 'rgba(0,0,0,.20)', 1);
    dith(c, 720, 48, 192, 576, 'rgba(0,0,0,.20)', 0);
    /* 环境光遮蔽：墙根一圈暗带 —— 场地"往里退"全靠这几笔（没有它，地板就是一堵平墙） */
    dith(c, 48, 49, 864, 34, 'rgba(0,0,0,.26)', 0);
    dith(c, 48, 60, 864, 26, 'rgba(0,0,0,.16)', 1);
    dith(c, 49, 49, 26, 575, 'rgba(0,0,0,.20)', 1);
    dith(c, 885, 49, 27, 575, 'rgba(0,0,0,.20)', 0);
    rect(c, 48, 48, 864, 2, 'rgba(0,0,0,.34)');
    /* 中央踏出来的亮道（人来人往，磨得发白） */
    dith(c, 96, 60, 768, 548, 'rgba(224,206,176,.045)', 0);
    dith(c, 160, 96, 640, 480, 'rgba(224,206,176,.040)', 1);
    /* 靠门那半间的潮：湿石色（发暗发青）+ 水边一线反光 —— 下排"靠门潮"得看得见 */
    var damp = [[56, 448, 236, 160], [120, 536, 220, 76], [608, 456, 300, 152], [700, 540, 190, 70], [352, 496, 176, 96]];
    damp.forEach(function (s, i) {
      dith(c, s[0], s[1], s[2], s[3], 'rgba(96,124,158,.085)', i & 1);
      dith(c, s[0] + 6, s[1] + 8, s[2] - 26, s[3] - 20, 'rgba(96,124,158,.070)', (i + 1) & 1);
      rect(c, s[0] + 10, s[1] + 12, R(s[2] * 0.34), 1, 'rgba(196,216,236,.16)');   /* 水沿的反光 */
      rect(c, s[0] + 18, s[1] + R(s[3] * 0.62), R(s[2] * 0.5), 1, 'rgba(196,216,236,.12)');
    });
    /* 排水沟：地上一条铁篦子（潮气有去处，屋子才像用的） */
    grate(c, 576, 528, 96, 30, P);
    grate(c, 120, 596, 64, 20, P);
    /* 光池：吊灯一盏（正中）、壁灯两盏（两侧）、账房油灯一盏（画布下缘） */
    pool(c, 480, 306, 336, 250, 0);
    pool(c, 150, 430, 190, 150, 1);
    pool(c, 812, 430, 190, 150, 1);
    pool(c, 480, 592, 440, 140, 0);
    /* 地上散落的当票（两三张，别多） */
    slip(c, 262, 600, P, 0); slip(c, 292, 608, P, 1); slip(c, 706, 588, P, 2);
    return 1;
  }
  /* 铁篦子：扁铁条 + 底下黑洞 */
  function grate(c, x, y, w, h, P) {
    rect(c, x - 2, y - 2, w + 4, h + 4, mixOf(P.boardDeep, '#000000', 0.35));
    rect(c, x, y, w, h, '#0e0c12');
    for (var i = 2; i < w - 2; i += 7) rect(c, x + i, y + 2, 3, h - 4, '#3a3530');
    for (var j = 2; j < h - 2; j += 6) rect(c, x + 2, y + j, w - 4, 1, 'rgba(120,116,110,.35)');
    rect(c, x, y, w, 1, 'rgba(150,146,138,.30)');
  }
  function pool(c, cx, cy, w, h, phase) {
    var i, k, bands = [[0, '.026'], [6, '.040'], [13, '.055'], [21, '.075']];
    for (i = 3; i >= 0; i--) {
      k = bands[i][0];
      dith(c, cx - w / 2 + k, cy - h / 2 + k * 0.55, w - k * 2, h - k * 1.1,
        'rgba(' + '255,206,132' + ',' + bands[i][1] + ')', (i + phase) & 1);
    }
    dith(c, cx - w * 0.16, cy - 5, w * 0.32, 11, 'rgba(255,226,170,.26)', phase & 1);
    spk(c, cx - w * 0.30, cy - h * 0.22, w * 0.60, h * 0.40, 'rgba(255,214,150,.10)', 0.34, phase);
  }

  /* ============================================================
     二、砖墙 / 门 / 匾 / 灯（一层一层往上叠）
     ============================================================ */
  function brick(c, x, y, w, h, P, seed, lit) {
    rect(c, x, y, w, h, P.wallDark);
    var row = 0, yy, xx;
    for (yy = y; yy < y + h; yy += 12) {
      var off = (row % 2) ? 15 : 0;
      for (xx = x - 30; xx < x + w; xx += 30) {
        var bx = xx + off, bw = 28, r = rng(bx, yy, seed + row);
        var t = r();
        if (bx < x) { bw -= (x - bx); bx = x; }
        if (bx + bw > x + w) bw = x + w - bx;
        if (bw <= 0) continue;
        var col = t > 0.82 ? P.wallLit : t < 0.30 ? P.wallBase : mixOf(P.wallBase, P.wallLit, 0.25 + t * 0.22);
        if (lit) col = blendOf(col, '#c99a5e', 0.16);
        rect(c, bx, yy, bw, 10, col);
        rect(c, bx, yy, bw, 1, mixOf(col, '#ffffff', 0.08));
        rect(c, bx, yy + 9, bw, 1, P.mortar);
      }
      row++;
    }
    /* 墙整体压冷压暗一档：地板是暖的，两层才分得开 */
    dith(c, x, y, w, h, 'rgba(8,6,16,.30)', (seed & 1));
  }
  /* 一扇门：门框 + 门板 + 缝里漏出来的光 */
  function door(c, x, y, w, h, P, opts) {
    var o = opts || {};
    rect(c, x - 5, y - 5, w + 10, h + 10, P.woodDeep);                 /* 门框外沿 */
    rect(c, x - 3, y - 3, w + 6, h + 6, P.woodDark);
    rect(c, x, y, w, h, shadeOf('#171018', 0.06));                     /* 门洞（暗） */
    var i;
    for (i = 0; i < w; i += 9) rect(c, x + i, y, 1, h, '#0e0a12');     /* 门板缝 */
    if (o.gap) {                                                        /* 虚掩：一道暖光 */
      var gw = o.gap;
      dith(c, x + w - gw, y + 4, gw, h - 8, 'rgba(255,206,132,.30)', 0);
      dith(c, x + w - gw - 6, y + 14, gw + 6, h - 28, 'rgba(255,206,132,.14)', 1);
    }
    /* 门楣上一块封泥 / 铜活 */
    var cx = x + w / 2, cy = y + R(h * 0.42);
    rect(c, cx - 6, cy - 4, 12, 8, P.copper);
    rect(c, cx - 6, cy - 4, 12, 1, P.copperLit);
    rect(c, cx - 6, cy + 3, 12, 1, P.copperDark);
    rect(c, cx - 2, cy - 2, 4, 4, P.woodDeep);
  }

  /* ============================================================
     三、货架 + 粗陶罐（26 格）
     ============================================================ */
  function rack(c, x, y, w, h, P, seed, kind) {
    var r = rng(x, y, seed);
    /* 檐口 + 架上堆的货：柜子因此"有厚度"。顶上一排东西画在货架**之上**（更远），
       玩家从后头走过时会被引擎画在他前头 —— 透视线自然对得上。 */
    rect(c, x - 2, y - 7, w + 4, 8, P.woodDark);
    rect(c, x - 2, y - 7, w + 4, 2, P.woodLit);
    rect(c, x - 2, y - 1, w + 4, 1, P.woodDeep);
    var pi, px = x + 10;
    while (px < x + w - 30) {
      var pr = rng(px, y, seed + 3);
      var pw = 26 + R(pr() * 22), ph = 8 + R(pr() * 7);
      var pc = pr() > 0.55 ? mixOf(P.woodDark, P.wood, 0.5) : mixOf(P.pottery, P.potDark, 0.45);
      rect(c, px, y - 7 - ph, pw, ph, pc);
      rect(c, px, y - 7 - ph, pw, 1, mixOf(pc, '#ffffff', 0.16));
      rect(c, px + 4, y - 4 - ph, pw - 8, 1, 'rgba(0,0,0,.24)');
      if (pr() > 0.6) { rect(c, px + 6, y - 7 - ph - 5, 5, 5, mixOf(P.pottery, P.potDark, 0.3)); }
      px += pw + 6 + R(pr() * 12);
    }
    dith(c, x, y - 26, w, 20, 'rgba(0,0,0,.14)', 0);
    /* 落地影：没有它架子是"浮"在地板上的（实拍自审抓到） */
    dith(c, x + 4, y + h, w - 8, 12, 'rgba(0,0,0,.34)', 0);
    dith(c, x + 12, y + h + 4, w - 24, 10, 'rgba(0,0,0,.20)', 1);
    rect(c, x + 2, y + h - 1, w - 4, 3, 'rgba(0,0,0,.42)');
    rect(c, x + w, y + 4, 7, h - 2, 'rgba(0,0,0,.22)');
    /* 背板 */
    rect(c, x + 4, y + 2, w - 8, h - 8, blendOf(P.woodDeep, P.woodDark, 0.45));
    var i;
    for (i = x + 6; i < x + w - 6; i += 7) if (r() > 0.45) rect(c, i, y + 3, 1, h - 10, 'rgba(0,0,0,.22)');
    /* 立柱 */
    rect(c, x, y, 5, h, P.woodDark); rect(c, x + 1, y + 1, 2, h - 2, P.wood);
    rect(c, x + w - 5, y, 5, h, P.woodDark); rect(c, x + w - 5, y + 1, 2, h - 2, P.wood);
    /* 上沿 */
    rect(c, x, y, w, 5, P.wood); rect(c, x, y, w, 1, P.woodHi);
    rect(c, x, y + 4, w, 1, P.woodDeep);
    /* 底板（罐子站这条上） */
    rect(c, x, y + h - 7, w, 7, P.wood);
    rect(c, x, y + h - 7, w, 1, P.woodHi);
    rect(c, x, y + h - 3, w, 3, P.woodDeep);
    rect(c, x + 2, y + h - 2, w - 4, 1, '#000000');
    /* 每 3 格一根托木 */
    for (i = x + 96; i < x + w - 12; i += 144) rect(c, i, y + h - 12, 3, 5, P.woodDark);
    /* 架顶一层灰 */
    dith(c, x + 6, y + 5, w - 12, 3, 'rgba(190,170,140,.05)', 1);
    if (kind === 'drawers') {                                          /* 上排改成当票匣 */
      var dw = 92, dh = 34, dx = x + 6, dy = y + 6, col = 0;
      while (dx + dw <= x + w - 6) {
        var rr = rng(dx, dy, seed + 5);
        rect(c, dx, dy, dw, dh, mixOf(P.woodDark, P.wood, 0.35 + rr() * 0.3));
        rect(c, dx, dy, dw, 1, P.woodLit);
        rect(c, dx, dy + dh - 1, dw, 1, P.woodDeep);
        /* 铜拉手 */
        rect(c, dx + dw / 2 - 5, dy + dh / 2 - 2, 10, 5, P.copper);
        rect(c, dx + dw / 2 - 5, dy + dh / 2 - 2, 10, 1, P.copperLit);
        rect(c, dx + dw / 2 - 5, dy + dh / 2 + 2, 10, 1, P.copperDark);
        /* 匣面：木作线脚 + 一枚菱形雕花。**没有名牌槽、没有纸签**（硬规矩：
           记忆容器上不许出现任何"能写、能改"的视觉暗示 —— 原来这里贴着一张纸签，已去掉） */
        rect(c, dx + 3, dy + 3, dw - 6, 1, P.woodDeep);
        rect(c, dx + 3, dy + dh - 4, dw - 6, 1, 'rgba(255,240,214,.08)');
        carve(c, dx + R(dw / 2), dy + R(dh * 0.42), 5, P);
        dx += dw + 4; col++;
      }
    }
  }
  /* 木作线脚上的菱形雕花：纯花纹，**装不了名字**（硬规矩用） */
  function carve(c, cx, cy, r, P) {
    var i;
    for (i = 0; i < r; i++) {
      rect(c, cx - (r - i), cy - i, (r - i) * 2, 1, 'rgba(0,0,0,.20)');
      rect(c, cx - (r - i), cy + i, (r - i) * 2, 1, 'rgba(0,0,0,.13)');
    }
    rect(c, cx - 1, cy, 3, 1, 'rgba(255,240,214,.10)');
  }
  /* 三种形制 + 五种陶色 + 三种盖 —— 一柜子货不能是 26 份拷贝（近景自审抓到过） */
  var PROF = {
    round: [34, 34, 30, 28, 28, 34, 46, 58, 72, 84, 92, 97, 100, 100, 100, 100, 100, 100, 100, 100,
            100, 100, 100, 100, 100, 100, 100, 99, 97, 94, 90, 86, 82, 78, 74, 70],
    tall:  [30, 30, 26, 26, 26, 30, 36, 44, 54, 64, 74, 84, 92, 96, 100, 100, 100, 100, 100, 100,
            100, 100, 100, 100, 100, 100, 100, 100, 98, 96, 92, 88, 84, 80, 76, 72],
    jar:   [40, 40, 34, 34, 34, 46, 60, 74, 86, 94, 98, 100, 100, 100, 100, 100, 100, 100, 100, 100,
            100, 100, 100, 100, 100, 100, 100, 100, 98, 96, 92, 90, 88, 86, 84, 82, 80]
  };
  var CLAY = ['#7a6650', '#8a5a44', '#62705c', '#4a4038', '#9a8a6a'];
  /* 一只粗陶罐：形制 / 陶色 / 盖 / 崩口 都按格号定死（刷新不变），但一柜子看过去是 26 只 */
  function jar(c, x, by, w, h, P, seed, letter, wax, sealed, shape, clay, lid) {
    /* 这里**一个 rng 都不用**：函数纯到 (w,h,letter,wax,sealed) 决定，两只罐子只要
       格号一样就逐像素一样（判据拿这个当"同款"的硬证据）。 */
    var prof = PROF[shape] || PROF.round;
    var base = CLAY[clay % CLAY.length];
    var lit = mixOf(base, P.potLit, 0.58), dark = mixOf(base, P.potDark, 0.78), deep = P.potDeep;
    /* 架板上的一圈影 */
    rect(c, x + 3, by - 1, w - 6, 2, 'rgba(0,0,0,.34)');
    dith(c, x + 1, by - 2, w - 2, 3, 'rgba(0,0,0,.22)', 1);
    var top = by - h, i, row;
    var chip = 0;                                                /* 崩口＝区分个体，不做 */
    for (row = 0; row < h; row++) {
      var f = prof[Math.min(prof.length - 1, R(row / h * (prof.length - 1)))];
      var ww = Math.max(4, R(w * f / 100));
      var x0 = x + R((w - ww) / 2);
      var yy = top + row;
      var b2 = row < 6 ? mixOf(base, P.potDark, 0.35)
             : row > h - 5 ? mixOf(base, P.potDark, 0.45) : base;
      rect(c, x0, yy, ww, 1, b2);
      var lw = Math.max(1, R(ww * 0.22)), dw = Math.max(1, R(ww * 0.26));
      rect(c, x0 + 1, yy, lw, 1, row < 8 ? mixOf(lit, P.potLit, 0.3) : lit);
      rect(c, x0 + ww - dw, yy, dw, 1, row > h - 8 ? deep : dark);
      if ((row === 0 || row === 1) && !(chip && row < 2)) rect(c, x0, yy, ww, 1, mixOf(lit, '#ffffff', 0.12));
      if (row > 8 && row < h - 8 && (row % 7) === 0) rect(c, x0 + 3, yy, 1, 1, mixOf(lit, '#ffffff', 0.35));
      if (chip === -1 && row === 2 && ww > 12) rect(c, x0, yy, 3, 1, dark);   /* 崩口 */
      if (chip === 1 && row === 2 && ww > 12) rect(c, x0 + ww - 3, yy, 3, 1, dark);
    }
    /* 颈上一道箍 */
    rect(c, x + R(w * 0.30), top + R(h * 0.16), R(w * 0.40), 2, mixOf(dark, P.potDeep, 0.5));
    /* 口沿 + 盖：三种盖（圆钮 / 平盖 / 敞口） */
    rect(c, x + R(w * 0.33), top, R(w * 0.34), 3, mixOf(base, P.potDark, 0.25));
    rect(c, x + R(w * 0.33), top, R(w * 0.34), 1, mixOf(lit, '#ffffff', 0.10));
    if (lid === 'knob') rect(c, x + R(w * 0.45), top - 2, R(w * 0.10), 2, mixOf(dark, P.potDeep, 0.3));
    else if (lid === 'flat') rect(c, x + R(w * 0.30), top - 2, R(w * 0.40), 2, mixOf(dark, base, 0.4));
    else { rect(c, x + R(w * 0.36), top + 1, R(w * 0.28), 2, '#160f0c'); }     /* 敞口：往里是黑的 */
    /* 铜牌刻号（铜有新旧：一柜子铜牌不该一个色） */
    var pw = 13, ph = 9, px = x + R((w - pw) / 2), py = by - 15;
    var old = false;                                             /* 铜牌新旧＝区分个体，不做 */
    var cop = P.copper;
    rect(c, px - 1, py - 1, pw + 2, ph + 2, P.woodDeep);
    rect(c, px, py, pw, ph, cop);
    rect(c, px, py, pw, 1, old ? mixOf(cop, '#8a946a', 0.4) : P.copperLit);
    rect(c, px, py + ph - 1, pw, 1, P.copperDark);
    rect(c, px + pw - 1, py, 1, ph, P.copperDark);
    glyph(c, letter, px + R((pw - 3) / 2), py + 2, P.letterDark);
    rect(c, px + 1, py + 1, 1, 1, 'rgba(0,0,0,.35)'); rect(c, px + pw - 2, py + 1, 1, 1, 'rgba(0,0,0,.35)');
    /* 火漆封条：颜色＝入库批次（没封的＝空罐，号还留着） */
    if (sealed) {
      var sx = x + R(w / 2) - 4, sy = top + R(h * 0.06);
      rect(c, sx - 1, sy - 1, 10, 7, 'rgba(0,0,0,.45)');
      rect(c, sx, sy, 8, 5, wax);
      rect(c, sx, sy, 8, 1, mixOf(wax, '#ffffff', 0.28));
      rect(c, sx, sy + 4, 8, 1, mixOf(wax, '#000000', 0.35));
      rect(c, sx + 3, sy + 2, 2, 1, mixOf(wax, '#000000', 0.45));
      rect(c, sx + 1, sy + 5, 2, 2, wax);
    }
  }
  /* 一排罐：13 只，格号从 start 起。
     **硬规矩落在这三行上**（中枢转用户原话：记忆容器不许重命名，第 3 条）：
       · 26 只罐子**同形制、同陶色、同尺寸、同盖** —— 逐像素同一个模子，格与格之间
         **只有铜牌刻的格号不同**（外加封条色＝批次、以及"空着/有货"这个状态）。
       · 所以认格子只能靠**记住格号**：把眼睛闭上，你手上那些长得一模一样的罐子，
         谁也帮不了你 —— 这正是"玩家记忆力得好"这条规矩要的样子。
       · 封条色按三格一批（floor(格号/3)%4）：同批同色，颜色只表批次、不当识别手段。
     任何"让某格好认"的装饰（不同陶色/花纹/记号/崩口）都属于违规，别加。 */
  function jarRow(c, x0, y0, w, h, P, seed, start, opts) {
    var o = opts || {}, n = 13, pitch = (w - 12) / n, i, out = [];
    for (i = 0; i < n; i++) {
      var k = start + i;                                /* 全库第几格（0..25） */
      var jw = 34, jh = 36;                             /* 全库同尺寸，不给任何格子做区分 */
      var jx = x0 + 6 + R(i * pitch + (pitch - jw) / 2);
      var by = y0 + h - 7;
      var ch = String.fromCharCode(65 + k);
      var sealed = o.sealed ? o.sealed[i] : false;
      var wax = WAX[Math.floor(k / 3) % 4];             /* 封条色＝入库批次（三格一批） */
      jar(c, jx, by, jw, jh, P, seed, ch, wax, sealed, 'round', 0, 'knob');
      out.push({ k: k, letter: ch, x: jx, by: by, w: jw, h: jh,
                 wax: wax, sealed: !!sealed, plate: plateBox(jx, by, jw) });
    }
    CELLS = CELLS.concat(out);
    return out;
  }
  var CELLS = [];
  /* 铜牌（刻格号的那块）在格子里的位置 —— 判据拿它当"允许不同的那一小块" */
  function plateBox(jx, by, jw) {
    var pw = 13, ph = 9;
    return { x: jx + R((jw - pw) / 2), y: by - 15, w: pw, h: ph };
  }

  /* ============================================================
     四、账房收当台（近景那条，画布最下缘）
     ============================================================ */
  function counter(c, x, y, w, h, P) {
    var r = rng(x, y, 29);
    var surf = 22;                                             /* 台面深度：这一条是"家什立得住"的关键 */
    /* 台面（朝观众这条边）：木板 + 后沿一道亮线 + 前沿落影 */
    rect(c, x, y, w, surf, P.woodLit);
    for (var s = x + 40; s < x + w; s += 152) rect(c, s, y, 2, surf, P.woodDark);
    var i;
    for (i = x + 12; i < x + w; i += 38) {
      rect(c, i, y + 2, 1, surf - 4, 'rgba(0,0,0,.10)');
      if (r() > 0.5) rect(c, i + 9, y + 4 + R(r() * 12), 24 + R(r() * 30), 1, 'rgba(0,0,0,.075)');
    }
    rect(c, x, y, w, 2, mixOf(P.woodHi, '#ffffff', 0.16));     /* 后沿：屋里那面的一道亮边 */
    dith(c, x - 4, y - 8, w + 8, 10, 'rgba(0,0,0,.30)', 0);
    dith(c, x + 6, y + surf - 10, w - 12, 10, 'rgba(0,0,0,.10)', 1);
    /* 立面：竖板 + 木纹 + 底影 */
    rect(c, x, y + surf, w, h - surf, P.wood);
    for (i = x + 10; i < x + w - 6; i += 26) {
      rect(c, i, y + surf, 1, h - surf, P.woodDark);
      if (r() > 0.4) rect(c, i + 8, y + surf + 4 + R(r() * 8), 1, 6 + R(r() * 10), 'rgba(0,0,0,.14)');
    }
    rect(c, x, y + h - 4, w, 4, P.woodDeep);
    rect(c, x, y + h - 4, w, 1, mixOf(P.woodDark, '#000000', 0.3));
    /* 铜锁牌 */
    rect(c, x + w / 2 - 9, y + surf + 8, 18, 12, P.copperDark);
    rect(c, x + w / 2 - 8, y + surf + 9, 16, 10, P.copper);
    rect(c, x + w / 2 - 8, y + surf + 9, 16, 1, P.copperLit);
    rect(c, x + w / 2 - 2, y + surf + 12, 4, 4, P.woodDeep);
    /* ---- 台面上的一摊活（底都落在台面上，不悬空） ---- */
    var ty = y + surf;                                          /* 家什的底 */
    /* 账本（摊开） */
    rect(c, x + 96, ty - 3, 84, 5, 'rgba(0,0,0,.34)');
    rect(c, x + 100, ty - 24, 38, 24, mixOf(P.paper, P.paperDark, 0.22));
    rect(c, x + 138, ty - 24, 38, 24, P.paper);
    rect(c, x + 134, ty - 27, 8, 27, P.woodDark);
    rect(c, x + 136, ty - 26, 4, 25, mixOf(P.woodDark, P.wood, 0.4));
    for (i = 0; i < 5; i++) {
      rect(c, x + 104, ty - 19 + i * 4, 28, 1, 'rgba(42,32,24,.55)');
      rect(c, x + 143, ty - 19 + i * 4, 26, 1, 'rgba(42,32,24,.45)');
    }
    rect(c, x + 100, ty - 24, 38, 1, '#ffffff');
    /* 算盘 */
    var ax = x + 208;
    rect(c, ax - 1, ty - 20, 88, 23, 'rgba(0,0,0,.34)');
    rect(c, ax, ty - 22, 86, 22, P.woodDark);
    rect(c, ax + 2, ty - 21, 82, 20, mixOf(P.wood, P.woodLit, 0.45));
    rect(c, ax + 2, ty - 12, 82, 2, P.woodDeep);
    for (i = 0; i < 12; i++) {
      var bx = ax + 6 + i * 7, k;
      rect(c, bx, ty - 22, 1, 22, P.woodDeep);
      for (k = 0; k < 2 + (i % 2); k++) {
        rect(c, bx - 2, ty - 20 + (i % 3) + k * 3, 5, 3, i % 2 ? '#2a2018' : mixOf(P.woodHi, '#000000', 0.30));
      }
    }
    /* 油灯：铜座 + 火苗 + 一圈暖光 */
    var lx2 = x + 342;
    rect(c, lx2 - 13, ty - 10, 26, 11, 'rgba(0,0,0,.32)');
    rect(c, lx2 - 11, ty - 14, 22, 14, P.brass);
    rect(c, lx2 - 11, ty - 14, 22, 1, P.brassLit);
    rect(c, lx2 - 7, ty - 20, 14, 7, mixOf(P.brass, P.brassLit, 0.35));
    rect(c, lx2 - 4, ty - 26, 8, 7, '#f0d68c');
    rect(c, lx2 - 2, ty - 30, 4, 5, '#ffe6ac');
    rect(c, lx2 - 1, ty - 32, 2, 3, '#fff6d8');
    dith(c, lx2 - 44, ty - 54, 88, 48, 'rgba(255,206,132,.10)', 0);
    dith(c, lx2 - 24, ty - 40, 48, 34, 'rgba(255,226,170,.13)', 1);
    /* 笔筒 + 两支笔 */
    rect(c, x + 268, ty - 20, 20, 21, mixOf(P.pottery, P.potDark, 0.3));
    rect(c, x + 268, ty - 20, 20, 1, P.potLit);
    rect(c, x + 273, ty - 30, 2, 12, P.woodDark); rect(c, x + 276, ty - 33, 2, 15, P.woodDark);
    rect(c, x + 273, ty - 32, 2, 2, P.ink); rect(c, x + 276, ty - 35, 2, 2, P.ink);
    /* 一叠空白当票 */
    rect(c, x + 396, ty - 3, 56, 5, 'rgba(0,0,0,.30)');
    rect(c, x + 398, ty - 8, 54, 5, P.paper);
    rect(c, x + 400, ty - 12, 52, 5, mixOf(P.paper, P.paperDark, 0.2));
    rect(c, x + 402, ty - 16, 50, 5, P.paper);
    rect(c, x + 404, ty - 16, 46, 1, '#ffffff');
    /* 台前地上那盏灯往上洒的光锥 */
    dith(c, lx2 - 70, y - 104, 140, 104, 'rgba(255,206,132,.05)', 0);
    spk(c, lx2 - 54, y - 92, 108, 92, 'rgba(255,214,150,.09)', 0.3, 1);
  }
  /* 吊灯：屋里那盏主灯（地面正中那圈光池的源头，不能只有光没有灯） */
  function hanglamp(c, x, y, P) {
    rect(c, x - 1, 48, 3, y - 48, P.woodDeep);                 /* 链 */
    var i;
    for (i = 52; i < y; i += 8) rect(c, x - 3, i, 7, 2, mixOf(P.brass, P.brassDark || P.copperDark, 0.4));
    rect(c, x - 26, y, 52, 5, P.copperDark);                   /* 灯罩 */
    rect(c, x - 30, y + 5, 60, 3, P.copper);
    rect(c, x - 30, y + 5, 60, 1, P.copperLit);
    rect(c, x - 22, y + 8, 44, 6, mixOf(P.brass, P.brassLit, 0.4));
    rect(c, x - 14, y + 14, 28, 5, '#ffe6ac');                 /* 罩底那点亮 */
    rect(c, x - 8, y + 19, 16, 4, '#fff6d8');
    rect(c, x - 4, y + 23, 8, 3, 'rgba(255,246,216,.75)');
    dith(c, x - 60, y + 10, 120, 70, 'rgba(255,206,132,.075)', 0);
    dith(c, x - 34, y + 22, 68, 50, 'rgba(255,226,170,.10)', 1);
    spk(c, x - 24, y + 26, 48, 40, 'rgba(255,214,150,.16)', 0.42, 0);
  }
  /* 地上散落的当票 */
  function slip(c, x, y, P, k) {
    var r = rng(x, y, 41 + k);
    rect(c, x + 1, y + 1, 15, 11, 'rgba(0,0,0,.30)');
    rect(c, x, y, 15, 11, mixOf(P.paper, P.paperDark, 0.15 + r() * 0.3));
    rect(c, x, y, 15, 1, P.paper);
    rect(c, x + 2, y + 3, 11, 1, 'rgba(42,32,24,.5)');
    rect(c, x + 2, y + 6, 8, 1, 'rgba(42,32,24,.4)');
  }

  /* ============================================================
     五、房间：墙面 → 门 → 灯 → 架子 → 罐 → 台
     ============================================================ */
  function paintRoom(c, sc) {
    var P = palOf(sc);
    /* ---- 墙（冷、暗）---- */
    brick(c, 0, 0, VW, 48, P, 11, true);                       /* 顶墙（远墙）：灯的暖色落上去 */
    brick(c, 0, 48, 48, 576, P, 23, false);
    brick(c, 912, 48, 48, 576, P, 31, false);
    dith(c, 0, 48, 48, 576, 'rgba(0,0,0,.34)', 0);
    dith(c, 912, 48, 48, 576, 'rgba(0,0,0,.34)', 1);
    rect(c, 0, 0, VW, 3, P.woodDeep);                          /* 顶墙上一道木压条 */
    rect(c, 912, 48, 3, 576, P.woodDeep);
    rect(c, 0, 48, 3, 576, P.woodDeep);
    /* ---- 顶墙：匾额（只刻纹样，不写字）+ 两盏壁灯 ---- */
    sign(c, 356, 4, 248, 40, P);
    sconce(c, 168, 20, P); sconce(c, 792, 20, P);
    /* ---- 两侧的门（左：原路出去，虚掩；右：库里那道矮门，封着）---- */
    door(c, 5, 428, 43, 162, P, { gap: 11 });
    door(c, 913, 466, 43, 152, P, { gap: 0 });
    /* 门里洒出来的暖光，落到门内地面上 */
    dith(c, 48, 440, 128, 148, 'rgba(255,206,132,.085)', 0);
    dith(c, 58, 462, 96, 110, 'rgba(255,226,170,.085)', 1);
    dith(c, 860, 470, 52, 140, 'rgba(255,206,132,.045)', 1);
    /* ---- 架子 ---- */
    rack(c, 192, 88, 576, 56, P, 7, 'drawers');                /* 上排：当票匣（储物） */
    rack(c, 766, 88, 98, 56, P, 13, 'plain');                  /* 角柜 */
    rack(c, 96, 288, 48, 96, P, 19, 'tall');                   /* 左墙边那口高柜 */
    rack(c, 192, 232, 576, 56, P, 3, 'plain');                 /* 中排：A–M */
    rack(c, 192, 376, 576, 56, P, 5, 'plain');                 /* 下排：N–Z（靠门，潮） */
    /* 角柜与高柜上的小件 */
    crate(c, 774, 108, P, 0); crate(c, 826, 116, P, 1);
    box(c, 100, 300, P); box(c, 104, 344, P);
    /* ---- 26 只罐：中排 A–M / 下排 N–Z ---- */
    var sealMid = [1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0];
    var sealLow = [1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1];
    CELLS = [];                                        /* 每次烘焙重数一遍（供判据逐格对拍） */
    jarRow(c, 192, 232, 576, 56, P, 101, 0, { sealed: sealMid });
    jarRow(c, 192, 376, 576, 56, P, 211, 13, { sealed: sealLow });
    /* ---- 靠门那半间的潮气：下排架底泛潮 + 门边一层薄雾 ---- */
    dith(c, 192, 336, 576, 46, 'rgba(158,182,208,.045)', 1);
    dith(c, 48, 448, 300, 176, 'rgba(158,182,208,.050)', 0);
    dith(c, 596, 448, 316, 176, 'rgba(158,182,208,.050)', 1);
    dith(c, 60, 500, 210, 120, 'rgba(158,182,208,.038)', 1);
    /* ---- 潮雾：三条静止的雾带（引擎只在 ambient='fog' 的场景画雾，这间是灯房，
       雾得自己带）+ 门口两团更浓的 ---- */
    dith(c, 48, 470, 864, 46, 'rgba(158,182,208,.055)', 0);
    dith(c, 48, 520, 864, 34, 'rgba(158,182,208,.045)', 1);
    dith(c, 48, 570, 864, 30, 'rgba(158,182,208,.035)', 0);
    dith(c, 48, 462, 864, 8, 'rgba(196,214,236,.030)', 1);
    dith(c, 50, 452, 172, 150, 'rgba(158,182,208,.070)', 1);
    dith(c, 842, 490, 70, 130, 'rgba(158,182,208,.055)', 0);
    /* 每个交互点脚下摆一件**矮**东西（高的会被玩家走过去，读起来就是穿模）：
       三样东西＝一只矮木托，三份当票＝一只矮签架 */
    pallet(c, 284, 546, P);
    tixrack(c, 476, 544, P);
    /* ---- 挂在两面侧墙上的货（不占地面，只压墙面 + 探出 10px）---- */
    wallbox(c, 8, 120, P); wallbox(c, 8, 232, P);
    wallstr(c, 10, 372, P); wallstr(c, 12, 470, P);
    wallbox(c, 926, 168, P); wallbox(c, 926, 280, P);
    hooks(c, 930, 384, P); hooks(c, 14, 168, P);
    /* ---- 地上几件矮平的家什（踩过去也不违和：托盘 / 麻袋 / 席子卷）---- */
    pallet2(c, 62, 546, P); pallet2(c, 828, 470, P);
    sack(c, 56, 210, P); sack(c, 76, 226, P); sack(c, 872, 560, P);
    roll(c, 846, 232, P);
    /* 墙角一只桶、一把扫帚 */
    barrel(c, 64, 598, P); broom(c, 878, 556, P);
    /* ---- 屋里那盏主灯（画在架子之后 = 吊在架子前头），地面正中那圈光池的源头 ---- */
    hanglamp(c, 480, 62, P);
    /* ---- 近景：账房收当台 ---- */
    counter(c, 96, 624, 768, 48, P);
    return 8;
  }

  /* 墙上挂的匣 / 挂着的当票串 / 铁钩 —— 屋内墙上"有货"，画面才不空 */
  function wallbox(c, x, y, P) {
    var w = 34, h = 44;
    rect(c, x, y, w, h, mixOf(P.woodDark, P.wood, 0.35));
    rect(c, x, y, w, 1, P.woodLit);
    rect(c, x, y + h - 1, w, 1, P.woodDeep);
    rect(c, x + 4, y + 5, w - 8, 1, P.woodDeep);              /* 线脚，不是名牌槽 */
    carve(c, x + R(w / 2), y + 14, 5, P);
    rect(c, x + w / 2 - 4, y + 26, 8, 5, P.copper);
    rect(c, x + w / 2 - 4, y + 26, 8, 1, P.copperLit);
    rect(c, x + w, y + 6, 6, h - 12, 'rgba(0,0,0,.22)');
  }
  function wallstr(c, x, y, P) {
    rect(c, x + 8, y, 1, 26, 'rgba(150,130,96,.55)');            /* 绳 */
    var i, sy = y + 24;
    for (i = 0; i < 4; i++) {
      rect(c, x + 2, sy + i * 9, 14, 7, mixOf(P.paper, P.paperDark, i * 0.16));
      rect(c, x + 2, sy + i * 9, 14, 1, P.paper);
      rect(c, x + 5, sy + i * 9 + 3, 8, 1, 'rgba(42,32,24,.45)');
    }
  }
  function hooks(c, x, y, P) {
    var i;
    for (i = 0; i < 3; i++) {
      var hy = y + i * 30;
      rect(c, x, hy, 18, 2, mixOf(P.copperDark, P.copper, 0.5));
      rect(c, x + 14, hy, 4, 8, mixOf(P.copperDark, P.copper, 0.4));
    }
  }
  /* 地面矮件：托盘 / 麻袋 / 席子卷 —— 都只有十几像素高，踩过去不违和 */
  function pallet2(c, x, y, P) {
    rect(c, x, y + 12, 62, 10, mixOf(P.woodDark, P.wood, 0.4));
    rect(c, x, y + 12, 62, 1, P.woodLit);
    rect(c, x, y + 21, 62, 1, P.woodDeep);
    for (var i = 6; i < 58; i += 14) rect(c, x + i, y + 14, 1, 7, 'rgba(0,0,0,.18)');
    rect(c, x + 4, y + 1, 26, 12, mixOf(P.woodDark, P.wood, 0.45));   /* 一只矮箱（原来给的是纸色，实拍里像块浮着的白板） */
    rect(c, x + 4, y + 1, 26, 1, P.woodLit);
    rect(c, x + 8, y + 6, 18, 1, 'rgba(0,0,0,.20)');
    rect(c, x + 34, y + 3, 22, 10, mixOf(P.pottery, P.potDark, 0.42));
    rect(c, x + 34, y + 3, 22, 1, P.potLit);
    dith(c, x + 2, y + 21, 60, 6, 'rgba(0,0,0,.26)', 0);
  }
  function sack(c, x, y, P) {
    rect(c, x, y, 26, 22, mixOf('#9c8a6a', P.paperDark, 0.45));
    rect(c, x, y, 26, 1, 'rgba(255,246,216,.20)');
    rect(c, x + 8, y - 4, 10, 6, mixOf('#8a7860', P.paperDark, 0.4));
    rect(c, x + 4, y + 20, 18, 2, 'rgba(0,0,0,.30)');
    rect(c, x + 6, y + 8, 12, 1, 'rgba(0,0,0,.16)');
  }
  function roll(c, x, y, P) {
    rect(c, x, y, 54, 14, mixOf('#b0a080', P.woodHi, 0.35));
    rect(c, x, y, 54, 1, 'rgba(255,246,216,.22)');
    for (var i = 6; i < 52; i += 9) rect(c, x + i, y + 1, 1, 12, 'rgba(0,0,0,.14)');
    rect(c, x, y + 13, 54, 1, 'rgba(0,0,0,.30)');
    rect(c, x + 50, y + 2, 4, 10, 'rgba(0,0,0,.22)');
  }
  /* 矮木托：封蜡 / 空签 / 小秤 三样（对应 ch2_shelf 那个点，16px 高，不挡视线） */
  function pallet(c, x, y, P) {
    rect(c, x, y + 10, 58, 12, mixOf(P.woodDark, P.wood, 0.4));
    rect(c, x, y + 10, 58, 1, P.woodLit);
    rect(c, x, y + 21, 58, 1, P.woodDeep);
    for (var i = 4; i < 56; i += 12) rect(c, x + i, y + 12, 1, 9, 'rgba(0,0,0,.16)');
    /* 一块封蜡（红） */
    rect(c, x + 4, y + 2, 12, 8, '#a8322a'); rect(c, x + 4, y + 2, 12, 1, '#c8544a');
    rect(c, x + 4, y + 9, 12, 1, '#6e1e18');
    /* 一把空签（一捆竹签） */
    rect(c, x + 20, y + 4, 14, 6, mixOf('#c8a86a', P.woodHi, 0.3));
    rect(c, x + 20, y + 4, 14, 1, '#e6cc96');
    rect(c, x + 22, y + 6, 10, 1, 'rgba(0,0,0,.30)');
    /* 一杆小秤：横梁 + 两只小盘 */
    rect(c, x + 40, y + 2, 16, 2, P.brass); rect(c, x + 47, y + 4, 2, 7, P.brass);
    rect(c, x + 38, y + 9, 6, 2, P.copper); rect(c, x + 52, y + 9, 6, 2, P.copper);
    rect(c, x + 38, y + 9, 6, 1, P.copperLit);
  }
  /* 矮签架：三份当票并排（对应 ch2_tickets 那个点） */
  function tixrack(c, x, y, P) {
    rect(c, x, y + 16, 60, 12, mixOf(P.woodDark, P.wood, 0.35));
    rect(c, x, y + 16, 60, 1, P.woodLit);
    rect(c, x, y + 27, 60, 1, P.woodDeep);
    rect(c, x + 4, y + 2, 16, 16, P.paperDark);
    rect(c, x + 22, y, 16, 18, P.paper);
    rect(c, x + 40, y + 3, 16, 15, mixOf(P.paper, P.paperDark, 0.25));
    for (var k = 0; k < 3; k++) {
      var px = x + 5 + k * 18;
      rect(c, px + 1, y + 2 - k, 14, 1, '#ffffff');
      rect(c, px + 3, y + 7, 10, 1, 'rgba(42,32,24,.55)');
      rect(c, px + 3, y + 10, 7, 1, 'rgba(42,32,24,.45)');
      rect(c, px + 3, y + 13, 11, 1, 'rgba(42,32,24,.40)');
    }
  }
  /* 匾额：木牌 + 铜框 + 刻纹（刻意不写汉字 —— 一章的世界美术也不在画布上写字） */
  function sign(c, x, y, w, h, P) {
    rect(c, x - 3, y - 3, w + 6, h + 6, P.copperDark);
    rect(c, x - 2, y - 2, w + 4, h + 4, P.copper);
    rect(c, x - 2, y - 2, w + 4, 1, P.copperLit);
    rect(c, x + 2, y + 2, w - 4, h - 4, blendOf(P.woodDeep, '#1a1208', 0.5));
    /* 两道刻线 + 四角回纹 + 中间一朵（回纹是当铺匾上的老花样） */
    rect(c, x + 8, y + 7, w - 16, 1, 'rgba(217,180,106,.45)');
    rect(c, x + 8, y + h - 8, w - 16, 1, 'rgba(217,180,106,.35)');
    var i;
    for (i = 0; i < 4; i++) {
      var cx = x + 12 + (i % 2) * (w - 30), cy = y + 8 + R(i / 2) * (h - 18);
      rect(c, cx, cy, 8, 1, 'rgba(217,180,106,.55)'); rect(c, cx, cy, 1, 6, 'rgba(217,180,106,.55)');
      rect(c, cx + 3, cy + 3, 5, 1, 'rgba(217,180,106,.35)');
    }
    var mx = x + w / 2;
    rect(c, mx - 16, y + h / 2 - 1, 32, 2, 'rgba(217,180,106,.30)');
    rect(c, mx - 9, y + h / 2 - 5, 4, 10, 'rgba(217,180,106,.55)');
    rect(c, mx + 5, y + h / 2 - 5, 4, 10, 'rgba(217,180,106,.55)');
    rect(c, mx - 1, y + h / 2 - 5, 2, 10, 'rgba(217,180,106,.30)');
  }
  /* 壁灯：铜托 + 灯焰 + 墙上一圈暖色 */
  function sconce(c, x, y, P) {
    dith(c, x - 46, y - 12, 92, 74, 'rgba(255,206,132,.075)', 0);
    dith(c, x - 26, y - 4, 52, 50, 'rgba(255,226,170,.10)', 1);
    rect(c, x - 6, y + 10, 12, 3, P.brass);
    rect(c, x - 3, y + 4, 6, 7, mixOf(P.brass, P.brassLit, 0.4));
    rect(c, x - 2, y - 2, 4, 6, '#ffe6ac');
    rect(c, x - 1, y - 5, 2, 4, '#fff6d8');
    rect(c, x - 1, y - 7, 2, 2, 'rgba(255,246,216,.55)');
    rect(c, x - 8, y + 13, 16, 2, P.copperDark);
  }
  function crate(c, x, y, P, k) {
    var r = rng(x, y, 61 + k);
    rect(c, x, y, 44, 36, mixOf(P.woodDark, P.wood, 0.30 + r() * 0.2));
    rect(c, x, y, 44, 1, P.woodLit);
    rect(c, x, y + 35, 44, 1, P.woodDeep);
    rect(c, x, y + 16, 44, 2, P.woodDark);
    rect(c, x + 20, y, 2, 36, P.woodDark);
    rect(c, x + 4, y + 20, 36, 2, 'rgba(0,0,0,.20)');
  }
  function box(c, x, y, P) {
    rect(c, x, y, 40, 42, mixOf(P.woodDark, P.wood, 0.45));
    rect(c, x, y, 40, 1, P.woodLit);
    rect(c, x + 6, y + 6, 28, 1, P.woodDeep);
    carve(c, x + 20, y + 15, 5, P);
    rect(c, x, y + 41, 40, 1, P.woodDeep);
  }
  function barrel(c, x, y, P) {
    rect(c, x, y, 30, 40, mixOf(P.woodDark, P.wood, 0.35));
    rect(c, x, y, 30, 1, P.woodLit);
    rect(c, x, y + 7, 30, 3, mixOf(P.copperDark, P.copper, 0.5));
    rect(c, x, y + 30, 30, 3, mixOf(P.copperDark, P.copper, 0.5));
    rect(c, x + 13, y + 4, 4, 32, 'rgba(0,0,0,.18)');
    rect(c, x, y + 39, 30, 1, P.woodDeep);
  }
  function broom(c, x, y, P) {
    rect(c, x + 2, y, 2, 46, P.woodDark);
    rect(c, x, y + 44, 16, 10, mixOf('#b08a4a', P.woodHi, 0.4));
    var i;
    for (i = 0; i < 5; i++) rect(c, x + i * 3, y + 54, 1, 5, 'rgba(176,138,74,.7)');
  }

  /* ============================================================
     六、接线：只把 ch2_vault 这一张包下来，别的场景原样交给 art31
     ============================================================ */
  function isVault(sc) { return !!sc && sc.id === V; }
  function paintGroundFor(c, sc, pal) { return isVault(sc) ? paintFloor(c, sc, pal) : null; }
  function paintSolidsFor(c, sc, pal) { return isVault(sc) ? paintRoom(c, sc, pal) : null; }
  function install() {
    var A = global.ART31;
    if (!A || !A.paintGround || !A.paintSolids) return false;
    if (A.__ch2vaultArt) return true;
    var g0 = A.paintGround, s0 = A.paintSolids;
    A.paintGround = function (c, sc, pal) {
      return isVault(sc) ? paintFloor(c, sc, pal) : g0.apply(this, arguments);
    };
    A.paintSolids = function (c, sc, pal) {
      return isVault(sc) ? paintRoom(c, sc, pal) : s0.apply(this, arguments);
    };
    A.__ch2vaultArt = 1;
    return true;
  }
  var ok = install();

  global.CH2_ART = {
    VAULT: V, install: install, installed: function () { return !!(global.ART31 && global.ART31.__ch2vaultArt); },
    paintFloor: paintFloor, paintRoom: paintRoom, jar: jar, palette: palOf,
    WAX: WAX, FONT: FONT, VW: VW, VH: VH, CELL: CELL,
    cells: function () { return CELLS.slice(); },
    /* 自检用：装载成功没 */
    loadedAt: ok
  };
})(typeof window !== 'undefined' ? window : globalThis);
