/* 《记忆当铺》二章 · 记忆库（ch2_vault）像素美术 —— A 线 / 画质
   ============================================================================
   口径（画面硬规矩，不许破）：
     · 1 美术像素 = 1 逻辑像素 @960×672；只用 fillStyle + fillRect
     · 不用渐变 / 圆弧 / 路径；整数坐标；限定色阶；2×2 抖动；1px Bayer 点光
   ★★★ 二章 = **另一部作品**（用户 2026-10-17 逐字拍死）★★★
     「这第一章和第二章你可以理解成两个游戏来做，不要让他们有任何关系，这人物也是两个人。」
     「二章不沿用一章的立绘/背景/UI 资产，两套视觉各自独立。」
     ⇒ 本模块**一笔一章素材都不借**：地面、墙、柜台、梁、罐、人物立绘、颜色工具，
       全部自己一份。一章的 art31 未加载 / 被改 / 被删，二章这张画一个像素都不受影响。
     ⇒ 本模块只做一件事：把 ch2 这三个场景的**画法**挂到引擎那三个绘制入口上
       （paintGround / paintSolids / paintFigure）。非 ch2 的场景原样交给原函数，
       一章那张图我们**一个字节都不碰**（连它上面的装饰件都不画）。
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
  /* ---------- 色算：本模块自持 ----------
     连"借一章的颜色工具函数"都不做：解析 / 明暗 / 混色 / 确定性随机全自己一份。
     两个游戏，两套工具，谁也删不掉谁。 */
  function parseCol(col) {
    var s = String(col == null ? '' : col).trim(), h, n, m, p, o = [], i;
    if (s.charAt(0) === '#') {
      h = s.slice(1);
      if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      if (h.length === 6) {
        n = parseInt(h, 16);
        if (!isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
      }
    }
    m = /rgba?\(([^)]+)\)/.exec(s);
    if (m) {
      p = m[1].split(',');
      for (i = 0; i < 4; i++) o[i] = (p[i] === undefined || p[i] === '') ? 1 : parseFloat(p[i]);
      return o;
    }
    return [0, 0, 0, 1];
  }
  function colOf(a) {
    var r = R(a[0]), g = R(a[1]), b = R(a[2]), al = a[3] === undefined ? 1 : a[3];
    if (al >= 1) return 'rgb(' + r + ',' + g + ',' + b + ')';
    return 'rgba(' + r + ',' + g + ',' + b + ',' + (Math.round(al * 1000) / 1000) + ')';
  }
  /* 混色：两色按 t 线性过（t=0 取 a、t=1 取 b） */
  function mixOf(a, b, t) {
    var A0 = parseCol(a), B0 = parseCol(b), o = [], i;
    t = t === undefined ? 0.5 : (t < 0 ? 0 : t > 1 ? 1 : t);
    for (i = 0; i < 4; i++) o[i] = A0[i] + (B0[i] - A0[i]) * t;
    return colOf(o);
  }
  /* 明暗：正数往白提、负数往黑压（像素画里"提亮一档"和"加一层光"是同一件事） */
  function shadeOf(col, amt) {
    if (!amt) return col;
    return amt > 0 ? mixOf(col, '#ffffff', amt * 0.62) : mixOf(col, '#08060c', -amt * 0.80);
  }
  function blendOf(a, b, t) { return mixOf(a, b, t); }
  /* 确定性随机：同一格每次烘焙的花纹完全一样，刷新不变 */
  function rng(x, y, k) {
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
  /* 账房自己的色（中枢转的 D 线第一条）：一章当铺那套暖木摆进一个紫调房间，读起来就是
     "当铺换了个色"。木作整体往**冷紫褐**压、墙带提亮一档、纸留亮（夜里算账得看得见字），
     铜件照旧（那是二章统一的亮点）。 */
  function palBackOf(sc) {
    var P = palOf(sc), o = {}, k;
    for (k in P) if (Object.prototype.hasOwnProperty.call(P, k)) o[k] = P[k];
    /* 提亮一档：北半间那张大账桌是冷紫木，压在冷石板上会糊成一片黑影（实拍自审逮到），
       所以木作整体再往亮里走半步、地面也提一档 —— 屋子暗，不等于家具看不见。 */
    o.wood = '#5d4a68'; o.woodLit = '#826a94'; o.woodHi = '#a68fba';
    o.woodDark = '#3a2e46'; o.woodDeep = '#221b2b';
    o.board = '#463a52'; o.boardLit = '#5f5070'; o.boardDeep = '#2b2436'; o.boardSeam = '#1b1524';
    o.wallBase = '#332a3e'; o.wallLit = '#56486a'; o.wallDark = '#1f1a2a'; o.mortar = '#3d3350';
    o.floorBase = '#3a3348'; o.floorLit = '#544a66'; o.floorDark = '#241f30'; o.seam = '#16121e';
    o.copper = '#b0823a'; o.copperLit = '#e0bd6c'; o.copperDark = '#66461a';
    o.paper = '#e6dfd4'; o.paperDark = '#b4aa9c';
    return o;
  }
  /* 入库批次：火漆颜色 —— 一色一批，按格号分（画上去是干净的，接真状态是一行的事） */
  var WAX = ['#a8322a', '#96602a', '#2f6a68', '#6a4276'];

  /* ---- v6：出口那道门 + 第二张二章室内图（S3 账房）--------------------------
     中枢 2026-10-17 追加单的原话（逐字）：「库房要看得见『出口』…这间房**必须画出门**（通柜台／账房），
     别画成一个封死的盒子 —— 用户现在的抱怨就是『一直困在库房』。」「给**柜台或账房**做一张二章室内图
     （**复用一章当铺素材改色**，别新起一套风格），两间房的门要在视觉上对得上位置感。」
     场景 id 照 tools/剧情-二章-设计.md:157 —— S3 账房 = `ch2_back`。 */
  var BACK_ID = 'ch2_back';
  var BACK_PAL = { ground: '#2b2130', ground2: '#33263a', solid: '#141019', accent: '#cfa95f', sky: '#0a0810' };
  var DOORS = { vaultExit: null, backDoor: null, shopDoor: null };   /* 门的位置：判据拿它验"门开在出口那一列" */
  /* ---------- 柜台（前厅）：场景 id 与几个**像素锚点** ----------
     锚点在这里写一次，判据和实拍都读它，别在别处硬编码（改一处就全对）。
     跟 js/ch2/scenes.js 里的 SHOP_SCENE 一一对应：solids [1,1,3,2] / [16,1,3,2] / [3,6,14,2]，
     柜台 3..16 格 × 6..7 格 = 144..816 × 288..384。 */
  var SHOP_ID = 'ch2_shop';
  /* 柜台这张图的 id：**两种叫法都认**。
     记忆玩法 那条线按中心的意思把它叫 ch2_counter，我这张已经落在 ch2_shop 上（scenes.js 里那条 SHOP_SCENE）。
     谁先上线都行：isShop() 两个 id 都算，画法和碰撞都是同一套，不会出现"场景叫 ch2_counter 就白屏"。 */
  var SHOP_IDS = ['ch2_shop', 'ch2_counter'];
  var SHOP = {
    counter: { tx: 3, ty: 6, tw: 14, th: 2, x: 144, y: 288, w: 672, h: 96 },
    farDoor: { x: 432, y: 8, w: 144, h: 40 },
    shelf:   { x: 48,  y: 48, w: 144, h: 96 },
    tickets: { x: 768, y: 48, w: 144, h: 96 },
    guests:  [{ tx: 7, ty: 9 }, { tx: 13, ty: 10 }]
  };
  /* 库里那道矮门画在哪一格：**就是 ch2_door 这个点位那一格**（js/ch2/scenes.js:111 = (16,11)）。
     中枢 2026-10-17 追加单原话：「库房那张室内图出口的点位已经存在…所以：门就画在那个位置
     （右墙那侧），室内图别把 x16,y11 这点挡掉」。引擎的规矩是"非 look/portal/jobs 的点所在格
     算障碍"（js/story23.js:1408）⇒ 这一格本来就是墙，**门画在这格上，碰撞和画面才是同一件事**；
     上下两格 (16,10)/(16,12) 是走得过去的过道，一格都不许占（占了就是假墙）。 */
  var LOW_DOOR = { tx: 16, ty: 11 };
  /* 判据的**负对照**开关：verify-ch2-rooms 要靠它证明"门没画上时这条判据得红"。
     正式渲染永远是 false —— 没有第二条渲染路径。 */
  var SKIP_LOWDOOR = false;
  /* 判据的负对照开关：verify-ch2-rooms 靠它证明「门没画上时这条判据得红」。正式渲染永远 false。 */
  var SKIP_BACKDOOR = false;

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
  /* 库房这两道门的画法就两套：exitDoor()（通外间、透光、敞着）与 lowDoor()（库里那道矮门、封着）。
     原先还有一套通用的 door()（门楣挂封泥那种），2026-10-17 之后一个调用点都没有了 ——
     门画在哪一格现在由点位决定（lowDoor 直接钉在 ch2_door 那格上），那套就不留了，
     免得以后有人挑错函数、把门画到墙带上去。 */

  /* 出口那道门（比 door() 更"像出口"）：门框内沿提亮 + 门板虚掩错开一条 + 缝里三级**硬边**暖光
     + 铜轴铜拉手 + 门槛铜踏板。硬规矩照旧：只有 fillStyle + fillRect，一个渐变都没有。 */
  function exitDoor(c, x, y, w, h, P, opts) {
    var o = opts || {}, i, leaf = 16, dir = o.dir === 'left' ? -1 : 1;
    DOORS[o.key || 'vaultExit'] = { x: x, y: y, w: w, h: h };
    rect(c, x - 5, y - 5, w + 10, h + 10, P.woodDeep);                  /* 门框外沿 */
    rect(c, x - 3, y - 3, w + 6, h + 6, P.woodDark);
    rect(c, dir > 0 ? x - 3 : x + w + 1, y - 3, 2, h + 6, P.woodHi);    /* 内沿一道亮边（外间的灯落在框上） */
    rect(c, x, y, w, h, '#1b1420');                                     /* 门洞（暗底） */
    var lx = dir > 0 ? x + leaf : x, lw = w - leaf;                     /* 门板往屋里错开一条 ⇒ 看得见"开着" */
    rect(c, lx, y + 4, lw, h - 8, shadeOf(P.woodDark, -0.16));
    for (i = 0; i < lw; i += 9) rect(c, lx + i, y + 4, 1, h - 8, P.boardSeam);
    var gx = dir > 0 ? x + 1 : x + w - leaf - 1;                        /* 缝里那道暖光：三级硬边 */
    dith(c, gx, y + 4, leaf, h - 8, 'rgba(255,226,170,.42)', 0);
    dith(c, gx + 2, y + 12, leaf - 3, h - 24, 'rgba(255,246,214,.58)', 1);
    rect(c, gx + 2, y + R(h * 0.44), 3, R(h * 0.14), 'rgba(255,248,222,.72)');
    var hx = dir > 0 ? lx + 2 : lx + lw - 5;                            /* 铜活：门轴 + 拉手 */
    rect(c, hx, y + 16, 3, 12, P.copper);
    rect(c, hx, y + R(h * 0.46), 3, 10, P.brassLit);
    rect(c, x - 5, y + h + 2, w + 10, 7, P.woodDark);                   /* 门槛 + 铜踏板 */
    rect(c, x - 2, y + h + 3, w + 4, 3, P.copperDark);
    rect(c, x + 3, y + h + 3, w - 6, 1, P.brassLit);
  }

  /* ============================ 两扇门（新单） ============================
     库房西墙「出库房」与柜台那头「进柜台」，同一套画法、镜像关系，**只有门楣上的刻纹不同**：
       opt.side    'right' = 门朝画面右开（库房西墙用）；'left' = 镜像（柜台东侧用）
       opt.emblem  'jar' 罐（库房）/ 'scale' 秤（柜台）—— 匾额上那块刻纹就是两头的字
       opt.lit     true 时多一层暖框（玩家走近时由 overlay() 每帧补画，见 doorGlow()）
     尺寸固定 48×96 —— 1 格宽 × 2 格高，**底边对齐墙脚**（锚点见 DOOR_SPEC）。
     ⚠ 门楣上不写汉字：这工程的世界美术一律不往画布上写字（本文件第 22 行那条规矩，
       一章也一样），字交给 DOM/交互提示；两头靠**刻纹**区分（罐 / 秤），远看也分得出。
     ============================================================================ */
  var DOOR_SPEC = {
    w: 48, h: 96,                 /* 1 格 × 2 格（CELL = 48） */
    anchor: 'bottom-center',      /* 底边贴在墙脚线上，横向取格子中点 */
    wall: { stone: ['#b28b5b', '#957149', '#c69e69'], joint: '#6f5537',
            wood: '#ae8658', woodDark: '#6d5133', metal: '#fec458' },
    from: 'tools/_out-wall-palette.json（真机截图逐像素频次统计，库房西墙那一段）'
  };
  function doorWallPal() { return DOOR_SPEC.wall; }
  /* 一块石砖：三色里挑一色作面、上沿提亮、下沿压暗 —— 砖感全靠这三道 */
  function sblock(c, x, y, w, h, P, tone) {
    var face = tone === 2 ? '#c69e69' : tone === 1 ? '#957149' : '#b28b5b';
    rect(c, x, y, w, h, '#3a2c1c');                       /* 缝（砖与砖之间那条暗） */
    rect(c, x + 1, y + 1, w - 2, h - 2, face);
    rect(c, x + 1, y + 1, w - 2, 1, mixOf(face, '#ffffff', 0.22));
    rect(c, x + 1, y + h - 2, w - 2, 1, mixOf(face, '#000000', 0.28));
    dith(c, x + 2, y + 3, w - 4, h - 5, 'rgba(0,0,0,.10)', 1);
  }
  /* 门楣匾额上的两块刻纹：罐 / 秤（各 14×9，只用方块） */
  function emblem(c, x, y, kind) {
    rect(c, x, y, 14, 9, '#2a1f12');                      /* 匾底 */
    rect(c, x + 1, y + 1, 12, 7, '#8a6a3a');
    rect(c, x + 1, y + 1, 12, 1, '#c8a468');
    if (kind === 'jar') {                                 /* 罐：小口 + 鼓腹 + 一道封条 */
      rect(c, x + 3, y + 2, 8, 1, '#3a2c1c');
      rect(c, x + 4, y + 3, 6, 1, '#efe6d0');
      rect(c, x + 3, y + 3, 1, 3, '#efe6d0');
      rect(c, x + 10, y + 3, 1, 3, '#efe6d0');
      rect(c, x + 3, y + 6, 8, 1, '#efe6d0');
      rect(c, x + 6, y + 3, 2, 4, '#a8322a');
    } else {                                              /* 秤：横梁 + 提钮 + 两只盘 */
      rect(c, x + 2, y + 3, 10, 1, '#efe6d0');
      rect(c, x + 6, y + 2, 2, 2, '#efe6d0');
      rect(c, x + 3, y + 5, 3, 2, '#efe6d0');
      rect(c, x + 8, y + 5, 3, 2, '#efe6d0');
    }
  }
  function doorSprite(c, x, y, opt) {
    var o = opt || {}, W = DOOR_SPEC.w, H = DOOR_SPEC.h, i;
    var flip = o.side === 'left';
    function R2(x2, y2, w2, h2, col) {
      if (flip) x2 = x + W - (x2 - x) - w2;
      rect(c, x2, y2, w2, h2, col);
    }
    DOORS[o.key || 'doorSprite'] = { x: x, y: y, w: W, h: H };
    /* ---- 底：整块先铺石缝，再砌龛 ---- */
    R2(x, y, W, H, '#241a10');
    sblock(c, x + 1, y + 1, W - 2, 11, null, 2);                   /* 龛顶横楣石（受光最亮） */
    sblock(c, x + 1, y + 12, 5, H - 18, null, 0);                  /* 左立石 */
    sblock(c, x + W - 6, y + 12, 5, H - 18, null, 1);              /* 右立石 */
    /* ---- 门楣：木 + 匾额（刻纹就是两头的"字"） ---- */
    R2(x + 3, y + 13, W - 6, 12, '#6d5133');
    R2(x + 3, y + 13, W - 6, 10, '#ae8658');
    R2(x + 3, y + 13, W - 6, 1, '#d8b183');                        /* 上沿受光 */
    R2(x + 3, y + 22, W - 6, 1, '#3a2c1c');
    emblem(c, flip ? x + W - 33 : x + 9, y + 15, o.emblem || 'jar');
    /* ---- 门洞：凹龛（左边是墙厚受光、右边是墙厚背光 ⇒ 3/4 的纵深全靠这两条） ---- */
    R2(x + 6, y + 25, W - 12, H - 25 - 14, '#1a1209');             /* 洞底（深褐，不是纯黑） */
    R2(x + 6, y + 25, 3, H - 25 - 14, '#8a6a45');                  /* 左墙厚：受光的那一面 */
    R2(x + W - 9, y + 25, 3, H - 25 - 14, '#3d2d1c');              /* 右墙厚：背光 */
    R2(x + 6, y + 25, W - 12, 2, '#0f0a06');                       /* 洞口上檐的暗 */
    /* ---- 门板：竖板缝 + 上下横档 + 门钉（**不许整块矩形当门扇**） ---- */
    var dx = x + 10, dw = 27, dy = y + 28, dh = H - 28 - 16;
    R2(dx, dy, dw, dh, '#3d2d1c');
    R2(dx, dy, dw, dh, '#5c4326');
    R2(dx, dy, dw, 2, '#6d5133');
    for (i = 5; i < dw - 1; i += 5) R2(dx + i, dy + 2, 1, dh - 4, '#3d2d1c');
    R2(dx + 2, dy + 8, dw - 4, 2, '#6d5133');
    R2(dx + 2, dy + dh - 12, dw - 4, 2, '#6d5133');
    for (i = 0; i < 4; i++) R2(dx + 4 + i * 6, dy + 3, 2, 2, '#fec458');
    /* ---- 门缝暖光：门虚掩着，开着的那条缝在右（镜像后在左），三级硬边 ---- */
    var sx = x + 37, sw = 3;
    R2(sx - (flip ? 0 : 0), dy, sw, dh, '#140e08');
    R2(dx + dw, dy, 1, dh, 'rgba(255,206,132,.55)');
    R2(dx + dw + 1, dy + 4, 1, dh - 8, 'rgba(255,226,170,.72)');
    R2(dx + dw + 2, dy + 14, 1, dh - 28, 'rgba(255,246,214,.86)');
    /* 铜活：铰链两枚（在开缝的对面）+ 拉手 */
    var hx = x + 11;
    R2(hx, dy + 14, 2, 7, '#a5792f');
    R2(hx, dy + dh - 22, 2, 7, '#a5792f');
    R2(hx, dy + dh - 22, 2, 1, '#f0d68c');
    R2(dx + dw - 4, dy + Math.round(dh * 0.46), 3, 3, '#f0d68c');
    /* ---- 门槛：木槛 + 铜踏板 + 门前那道影（底边 y+H 就是墙脚线） ---- */
    R2(x + 3, y + H - 15, W - 6, 9, '#3a2c1c');
    R2(x + 4, y + H - 14, W - 8, 6, '#6d5133');
    R2(x + 6, y + H - 13, W - 12, 2, '#fec458');
    R2(x + 6, y + H - 12, W - 12, 1, '#f0d68c');
    R2(x + 2, y + H - 5, W - 4, 5, 'rgba(0,0,0,.34)');
    /* ---- 走近：龛沿整圈提亮一档 ---- */
    if (o.lit) {
      R2(x + 1, y + 1, W - 2, 2, 'rgba(255,226,170,.50)');
      R2(x, y + 2, 2, H - 8, 'rgba(255,226,170,.38)');
      R2(x + W - 2, y + 2, 2, H - 8, 'rgba(255,226,170,.38)');
      R2(x + 4, y + H - 16, W - 8, 2, 'rgba(255,214,140,.46)');
    }
    return DOORS[o.key || 'doorSprite'];
  }

  /* 库里那道**矮门** —— 中枢 2026-10-17 追加单钉死：「门就画在那个位置（右墙那侧）」。
     它画在点位 ch2_door 那一格 (16,11) 上（js/ch2/scenes.js:111），三条硬约束：
       ① **只画这一格**：这格本身就是障碍（story23.js:1408「非 look/portal/jobs 的点所在格算墙」）
          ⇒ 门画在这格上，画面和碰撞是同一件事；上下两格 (16,10)/(16,12) 是走得过去的过道，
          一格都不许占（占了就是假墙 —— 玩家会从画出来的墙里走过去）。
       ② 一眼读出"**矮**"：门板只占下半截，上半截是石楣后头的暗 —— 跟左边那道通柜台的整扇门分得出高矮。
       ③ 一明一暗照旧：这道**封着**（门上只有一块空白封泥），只给冷边、不点暖光 —— 出口仍是左边那道。
     只有 fillStyle + fillRect，没有渐变、没有圆弧（硬规矩）。 */
  function lowDoor(c, x, y, P) {
    DOORS.lowDoor = { x: x, y: y, w: 48, h: 48, tx: LOW_DOOR.tx, ty: LOW_DOOR.ty };
    if (SKIP_LOWDOOR) return;
    var i;
    /* ① 门套：石砌一圈（跟两面墙同一种砖）。立着的东西往上长 9px —— 这屋的透视就这么立的。
       **另一条暗账**：引擎给每个 ch2 点位画的占位方块是**居中 30×24**（js/game23.js:3488
       drawCh2Spot：深底 + 金框 + 一道斜杠），它盖的是这一格的正当中。所以门的"认得出"
       全摆在那一圈边上：门楣上那块空白封泥、左右两道木立柱、下头那道铜门槛。 */
    rect(c, x + 1, y - 9, 46, 57, P.woodDeep);                        /* 门套外沿的暗线 */
    /* 门套用**木**、不用砖：这屋的地板跟两面墙是同一种砖（第二节就写着"地板读着像墙"），
       门框要也是砖的，那一格在整间屋里就化了 —— 木框跟左边那道出口门、跟两排货架是一套 */
    rect(c, x + 4, y - 6, 40, 50, P.woodDark);
    rect(c, x + 4, y - 6, 40, 2, P.woodLit);                          /* 门楣受光的一道亮边 */
    rect(c, x + 4, y - 6, 2, 50, mixOf(P.woodDark, P.woodHi, 0.34));  /* 左侧立柱受光 */
    rect(c, x + 42, y - 6, 2, 50, P.woodDeep);                        /* 右侧立柱背光 */
    rect(c, x + 47, y - 6, 3, 55, 'rgba(0,0,0,.30)');                 /* 门套右边一道落影：门是立着的东西 */
    dith(c, x + 4, y + 6, 40, 42, 'rgba(0,0,0,.22)', 1);              /* 门套内一圈压暗，门洞才陷进去 */
    rect(c, x + 2, y - 9, 44, 3, mixOf(P.woodDark, P.woodHi, 0.32));  /* 门楣压顶 */
    /* ② 门洞：暗底（门后头有地方，只是黑） */
    rect(c, x + 10, y + 6, 28, 33, '#0b0810');
    /* ③ 矮门板：只占下半截，右侧虚掩留一条缝 —— 门后那道黑从缝里透出来 */
    rect(c, x + 10, y + 21, 26, 18, shadeOf(P.woodDark, -0.14));
    for (i = 0; i < 24; i += 7) rect(c, x + 11 + i, y + 22, 1, 16, P.boardSeam);
    rect(c, x + 10, y + 21, 26, 1, mixOf(P.woodDark, P.woodHi, 0.42));
    rect(c, x + 10, y + 38, 26, 2, '#0b0810');
    rect(c, x + 37, y + 22, 2, 16, '#05040a');                        /* 虚掩的那条缝 */
    /* ④ 门楣上那块**空白封泥**（场景原话「门上没有锁，只有一块空白的封泥」）：压在门板上沿。
       跟 26 只罐子上的火漆是同一种东西，但**不取 WAX 那四色**（那四色只表入库批次，不许混用）*/
    rect(c, x + 16, y - 2, 15, 12, '#523029');
    rect(c, x + 17, y - 1, 13, 10, '#7d4a40');
    rect(c, x + 17, y - 1, 13, 1, '#9c6558');
    rect(c, x + 22, y + 2, 3, 3, '#4a2b26');                          /* 绳结 —— 不是字，一个字都没有 */
    rect(c, x + 16, y + 9, 15, 1, '#3d241f');
    /* ⑤ 铜活：一副门轴 + 一只门环（跟出口那道门同一套铜，屋里才是一间屋）*/
    rect(c, x + 10, y + 23, 2, 6, P.copper);
    rect(c, x + 10, y + 29, 2, 6, P.copperDark);
    rect(c, x + 34, y + 23, 2, 12, P.copperDark);
    rect(c, x + 31, y + 31, 5, 3, P.copper);
    rect(c, x + 31, y + 31, 5, 1, P.copperLit);
    /* ⑥ 门槛：一级石阶 + 铜踏板（往西铺 6px，接住走过来的那一步）*/
    rect(c, x - 6, y + 44, 54, 8, P.woodDark);
    rect(c, x - 2, y + 45, 46, 4, P.copperDark);
    rect(c, x + 2, y + 45, 38, 1, P.brassLit);
    /* ⑦ 冷边 + 门槛上一层薄冷雾：**封着，不透光** —— 跟左边那道暖出口对着看，一眼分得出哪道能出去 */
    rect(c, x + 4, y - 4, 40, 2, 'rgba(168,196,224,.16)');
    rect(c, x + 4, y + 2, 2, 38, 'rgba(168,196,224,.20)');
    rect(c, x + 38, y + 2, 2, 38, 'rgba(120,148,180,.14)');
    dith(c, x - 10, y + 44, 68, 18, 'rgba(150,178,208,.10)', 1);
    /* ⑧ 门后那块窄地压暗一档：门不是贴在墙上 —— 门后头有地方，只是暗（那几件家什也一并退到暗里）*/
    dith(c, x + 48, y - 30, 92, 132, 'rgba(8,6,16,.36)', 0);
    dith(c, x + 48, y - 10, 92, 92, 'rgba(8,6,16,.26)', 1);
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
    /* 口沿 + 盖：**空着的那格是盖挪开了**（口里 10×4 见黑 + 盖搁在罐子右边），
       有货的那格是**封条在**（盖子盖着 + 火漆）—— 这是"状态"，不是"身份"：
       26 只罐的形制 / 尺寸 / 陶色仍然一模一样（verify-vault-noname 那四条硬规矩照旧）。 */
    var mw = R(w * 0.34), mx = x + R((w - mw) / 2);
    if (lid === 'open') {
      rect(c, mx, top, mw, 4, '#160f0c');                                 /* 口里是黑的 */
      rect(c, mx, top, mw, 1, mixOf(base, P.potDark, 0.12));              /* 近侧口沿 */
      rect(c, mx, top + 3, mw, 1, mixOf(dark, P.potDeep, 0.55));          /* 远侧口沿吃光 */
      rect(c, mx + 1, top + 1, 2, 2, mixOf(lit, '#ffffff', 0.18));        /* 内壁一点反光 */
      rect(c, x + w - 5, by - 4, 11, 3, mixOf(dark, base, 0.35));         /* 盖挪到罐子右边搁着 */
      rect(c, x + w - 5, by - 4, 11, 1, mixOf(lit, '#ffffff', 0.14));
      rect(c, x + w - 1, by - 6, 3, 2, mixOf(dark, P.potDeep, 0.3));
    } else {
      rect(c, mx, top, mw, 3, mixOf(base, P.potDark, 0.25));
      rect(c, mx, top, mw, 1, mixOf(lit, '#ffffff', 0.10));
      if (lid === 'flat') rect(c, x + R(w * 0.30), top - 2, R(w * 0.40), 2, mixOf(dark, base, 0.4));
      else rect(c, x + R(w * 0.45), top - 2, R(w * 0.10), 2, mixOf(dark, P.potDeep, 0.3));
    }
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
  /* 一排罐：n 只，**一格一只**（第 tx0+i 格），罐子锁在该格的格心。
     **为什么非得在格心**：功能线那一版把 26 个点摆在 (4+i,5) / (4+i,8)（中枢钉的坐标），
     引擎认点靠"曼哈顿距离 ≤1、最小者胜"（game23.js:1242-1250）⇒ 罐子偏出格心，
     高亮与 E 键就会指向两只不同的罐子（判据 ① 逮这个）。
     **硬规矩落在这几行上**（中枢转用户原话：记忆容器不许重命名，第 3 条）：
       · 26 只罐子**同形制、同陶色、同尺寸、同盖** —— 逐像素同一个模子，格与格之间
         **只有铜牌刻的格号不同**（外加封条色＝批次、以及"空着/有货"这个状态）。
       · 所以认格子只能靠**记住格号**：把眼睛闭上，你手上那些长得一模一样的罐子，
         谁也帮不了你 —— 这正是"玩家记忆力得好"这条规矩要的样子。
       · 封条色按三格一批（floor(格号/3)%4）：同批同色，颜色只表批次、不当识别手段。
     任何"让某格好认"的装饰（不同陶色/花纹/记号/崩口）都属于违规，别加。 */
  function jarRow(c, tx0, y0, n, h, P, seed, start, opts) {
    var o = opts || {}, i, out = [];
    for (i = 0; i < n; i++) {
      var k = start + i;                                /* 全库第几格（0..25） */
      var jw = 34, jh = 36;                             /* 全库同尺寸，不给任何格子做区分 */
      var tx = tx0 + i;
      var jx = tx * CELL + R((CELL - jw) / 2);          /* 格心：一格一只，点位在哪一格罐子就在哪一格 */
      var by = y0 + h - 7;
      var ch = String.fromCharCode(65 + k);
      var sealed = o.sealed ? !!o.sealed[i] : false;
      var wax = WAX[Math.floor(k / 3) % 4];             /* 封条色＝入库批次（三格一批） */
      jar(c, jx, by, jw, jh, P, seed, ch, wax, sealed, 'round', 0, sealed ? 'knob' : 'open');
      out.push({ k: k, letter: ch, tx: tx, ty: Math.floor((by - jh / 2) / CELL),
                 x: jx, by: by, w: jw, h: jh, wax: wax, sealed: !!sealed, plate: plateBox(jx, by, jw) });
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
    /* ---- 左墙那道：**出库房那道**（虚掩、透着外间的灯 ⇒ 站在屋里一眼看得见出口）。
            右墙那道矮门**不在这条墙带上** —— 中枢 2026-10-17 追加单把它钉在点位 ch2_door
            那一格 (16,11) 上（见 lowDoor()：门画在哪一格，碰撞就在哪一格，两件事得是同一件事）。---- */
    doorSprite(c, 0, 480, { side: 'right', emblem: 'jar', key: 'vaultExit' });
    sconce(c, 27, 448, P);                                     /* 门楣上加一盏壁灯：出口自己会发光 */
    /* 门里那道楔形光：四级**硬边**，从门槛一路铺进屋（点位 ch2_back@(2,10) 那格就踩在最亮那段上） */
    var WG = [['rgba(255,226,170,.30)', 0], ['rgba(255,214,150,.20)', 1], ['rgba(255,206,132,.13)', 0], ['rgba(255,206,132,.07)', 1]];
    for (var wi = 0; wi < 4; wi++) dith(c, 52 + wi * 30, 486 + wi * 8, 150 - wi * 26, 96 - wi * 16, WG[wi][0], WG[wi][1]);
    rect(c, 52, 474, 44, 62, 'rgba(255,226,170,.24)');
    rect(c, 56, 480, 22, 34, 'rgba(255,246,214,.34)');
    dith(c, 860, 470, 52, 140, 'rgba(255,206,132,.045)', 1);    /* 右门那侧只留一点环境光 */
    /* ---- 架子 ---- */
    rack(c, 192, 88, 576, 56, P, 7, 'drawers');                /* 上排：当票匣（储物） */
    rack(c, 766, 88, 98, 56, P, 13, 'plain');                  /* 角柜 */
    rack(c, 96, 288, 48, 96, P, 19, 'tall');                   /* 左墙边那口高柜 */
    rack(c, 192, 232, 624, 56, P, 3, 'plain');                 /* 中排：A–M（13 格，x=4..16） */
    rack(c, 192, 376, 624, 56, P, 5, 'plain');                 /* 下排：N–Z（13 格，靠门，潮） */
    /* 角柜与高柜上原先堆着四只箱：crate(774,108) / crate(826,116) 摞在角柜上，
       box(100,300) / box(104,344) 摞在左墙高柜前。2026-10-17 用户点单（逐字）：
       「目前库房里面这几个大箱子是什么呀？把这大箱子去了呀，美术在下面应该已经画好了，但是这个大箱子挡着呢。」
       ⇒ 这四只全去了，露出底下画好的**角柜**（rack 766,88，见上）与**左墙高柜**（rack 96,288，见上）。
       挡路的从来是那两口柜子 —— 箱子只是画在柜子上的装饰件；这两处的碰撞体
       （solids `[16,2,2,1]` 与 `[2,6,1,2]`）**一个字节没动**，去掉画不动碰撞，也不会出现空气墙。 */
    /* ---- 26 只罐：中排 A–M / 下排 N–Z ----
       **空满从账上读**（js/ch2/vault.js 是账的 owner，这里只借读 GAME23.S）；
       账还没挂上（单跑 art.js / 判据）就退回这两行摆样 —— 美术不依赖玩法模块是否加载。 */
    var sealMid = [1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0];
    var sealLow = [1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1];
    var live = vaultSealed();
    CELLS = [];                                        /* 每次烘焙重数一遍（供判据逐格对拍） */
    jarRow(c, 4, 232, 13, 56, P, 101, 0, { sealed: live ? live.slice(0, 13) : sealMid });
    jarRow(c, 4, 376, 13, 56, P, 211, 13, { sealed: live ? live.slice(13, 26) : sealLow });
    /* ---- 靠门那半间的潮气：下排架底泛潮 + 门边一层薄雾 ---- */
    dith(c, 192, 336, 624, 46, 'rgba(158,182,208,.045)', 1);
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
    /* ---- 库里那道矮门：**画在点位 ch2_door 那一格 (16,11)**（中枢 2026-10-17 追加单）。
       放这么晚是有意的：门是立在地上的家什，得压在后头那些雾、家什**之上**，
       不然雾会糊在门板上、麻袋会从门框里长出来。门后那片窄地的压暗也在这个函数里。 ---- */
    lowDoor(c, LOW_DOOR.tx * CELL, LOW_DOOR.ty * CELL, P);
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
  /* ============================================================
     六之二、S3 账房（`ch2_back`）：**一章当铺那套素材原样调用、只换 palette**
     ── 复用的是真的复用：art31 的 paintGround/paintSolids 都吃 palette
        （art31.js:1474 / :1229），而 `PLAN(sc)` 是**按 sc.solids 的块位**去查
        `BUILDING[场景 id]`（art31.js:249-268）—— 所以"一章当铺的块位 + 我的配色"
        递进去，出来的就是同一套柜台/货架/里间，只是换了色。**不新起第二套画法。**
     ── 要调**包一层之前存下来的原件**（ORIG）：调 A.paintGround 会转回我自己、递归。
     ============================================================ */
  function isBack(sc) { return !!sc && sc.id === BACK_ID; }
  function isShop(sc) { return !!sc && SHOP_IDS.indexOf(sc.id) >= 0; }
  function isCh2(sc) { return isVault(sc) || isBack(sc) || isShop(sc); }

  /* ============================================================
     六之二、二章自己的两张室内图：**柜台 · 前厅（ch2_shop）** 与 **账房（ch2_back）**
     ------------------------------------------------------------
     上一版这两张走的是"一章当铺的块位 + 只换 palette"（shopView + ORIG 重放原件）——
     那等于把**一个游戏的地图**搬进另一个游戏。用户 2026-10-17 拍死之后整段删掉：
     两间房的地、墙、梁、柜台、陈设、人，全部本模块自己画。
     用户同日追加：「你做个柜台地图，因为这个我们不是有任何接待客人买卖东西吗？
     肯定是要有柜台的呀。」⇒ 前厅是**新画的一张图**，不是当铺改色。
     ============================================================ */

  /* ---------- 前厅的色（第三套：库房暖木 / 账房冷石 / 前厅青砖 + 亮铜）----------
     三个场景一脚踩下去就要分得出：库房那条暖木栈道是仓库，账房 48 见方的冷石板是算账的，
     前厅是**开门做生意**的地方 —— 石头偏冷青、木作比库房亮一档、铜件亮着。 */
  function shopPal(sc) {
    var P = palOf(sc), o = {}, k;
    for (k in P) if (Object.prototype.hasOwnProperty.call(P, k)) o[k] = P[k];
    o.floorBase = '#4a5162'; o.floorLit = '#67708a'; o.floorDark = '#2b3039'; o.seam = '#191c23';
    o.wallBase = '#2a2436'; o.wallLit = '#3f3852'; o.wallDark = '#181420'; o.mortar = '#221d2c';
    o.wood = '#5a4227'; o.woodLit = '#7d5e38'; o.woodHi = '#a8824e'; o.woodDark = '#382a19'; o.woodDeep = '#1d150d';
    o.counter = '#4a3520'; o.counterLit = '#6d5130'; o.counterHi = '#9a7442'; o.counterDeep = '#241a0e';
    return o;
  }

  /* ---------- 前厅地面：青砖错缝 + 柜前那条被踩亮的路 ---------- */
  function paintShopFloor(c, sc) {
    var P = shopPal(sc), x, y, i, r, t, col, row = 0, bx, bw, off, n;
    rect(c, 0, 0, VW, VH, P.wallDark);
    /* **40px 的大块青石板**，错缝半块铺；缝 2px 深色，每块左上角一道斜受光。
       第一版按 24px 铺，结果跟墙那套 12px 砖是同一个节奏 ⇒ 整屏读成一堵墙（实拍自审逮到）。
       现在两套尺子差三倍多，一眼分得出这是地、那是墙。 */
    /* **32px 正铺棋盘石砖**：一格深一格浅。铺过 24px 与 40px 两版错缝，都栽在同一处 ——
       跟墙那套 12px 砖是同一个节奏，整屏读成一堵墙（实拍自审逮到）。正铺棋盘是最不容易读错的"这是地"。 */
    for (y = 48; y < 672; y += 32) {
      for (x = 48; x < 912; x += 32) {
        bx = x; bw = Math.min(x + 32, 912) - bx;
        if (bw <= 0) continue;
        r = rng(bx, y, 7); t = r();
        n = (((bx / 32) | 0) + ((y / 32) | 0)) % 2;
        col = n === 0 ? mixOf(P.floorBase, P.floorLit, 0.20 + t * 0.16)
                      : mixOf(P.floorBase, P.floorDark, 0.46 - t * 0.14);
        rect(c, bx, y, bw, 32, col);
        rect(c, bx, y, bw, 1, mixOf(col, '#ffffff', 0.12));      /* 砖上沿受光 */
        rect(c, bx, y + 30, bw, 2, shadeOf(col, -0.26));         /* 下沿压暗 */
        rect(c, bx, y, bw, 2, P.seam);                           /* 横缝 */
        rect(c, bx + bw - 2, y, 2, 32, P.seam);                  /* 竖缝 */
        if (n === 0) {
          for (i = 0; i < 3; i++) {
            rect(c, bx + 4 + R(r() * (bw - 10)), y + 5 + R(r() * 22), 1, 1, shadeOf(col, -0.16));
          }
        }
      }
      row++;
    }
    /* 柜前那块**暗红毡毯**：营业的铺子，客人站的地方铺一块。
       一来画面有冷暖对比（青灰石墙 / 暗红毡 / 褐木柜台），二来把"等候区"从一片空地里读出来。 */
    carpet(c, 192, 408, 576, 176);
    /* 柜台前那一条：客来客往，砖面被踩得比别处亮（不是灯，是"用旧了"） */
    dith(c, 144, 384, 672, 96, 'rgba(255,226,170,.045)', 0);
    /* 两盏吊灯的灯脚 */
    pool(c, 300, 556, 220, 84, 0);
    pool(c, 660, 556, 220, 84, 1);
  }

  /* ---------- 前厅：墙 / 匾额 / 通里间那道门 / 内场两座柜 / 柜台 / 客人 ---------- */
  function paintShopRoom(c, sc) {
    var P = shopPal(sc), g, gs, i;
    /* 墙 */
    brick(c, 0, 0, VW, 48, P, 13, true);
    brick(c, 0, 48, 48, 624, P, 29, false);
    brick(c, 912, 48, 48, 624, P, 37, false);
    dith(c, 0, 48, 48, 624, 'rgba(0,0,0,.26)', 0);
    dith(c, 912, 48, 48, 624, 'rgba(0,0,0,.26)', 1);
    rect(c, 0, 0, VW, 3, P.woodDeep);
    /* **踢脚线**：地跟墙之间压一道木线 —— 没有它，两套砖纹在接缝处会连成一片（实拍自审逮到） */
    rect(c, 0, 48, VW, 2, P.woodDeep);
    rect(c, 0, 50, VW, 4, P.woodDark);
    rect(c, 0, 54, VW, 1, 'rgba(0,0,0,.34)');
    rect(c, 48, 48, 2, 624, P.woodDeep);
    rect(c, 50, 48, 4, 624, P.woodDark);
    rect(c, 54, 48, 1, 624, 'rgba(0,0,0,.30)');
    rect(c, 910, 48, 2, 624, P.woodDeep);
    rect(c, 906, 48, 4, 624, P.woodDark);
    rect(c, 905, 48, 1, 624, 'rgba(0,0,0,.30)');
    /* 北墙：匾额（只刻纹样，不写字）+ 两盏壁灯。
       实拍自审逮到：原来一块匾横在 x336..624 正中，而通里间的门正是 432..576 ——
       门一画上去就把匾盖掉大半个，只在两头露出两条深色边，白刻。
       改成**两块分挂门两侧**：门在中间，左右各一块，谁都挡不着谁。 */
    sign(c, 216, 8, 180, 34, P);
    sign(c, 588, 8, 180, 34, P);
    sconce(c, 176, 22, P); sconce(c, 784, 22, P);
    /* 通里间那道门：门洞是暗的、门板往屋里错开一条、缝里漏里间的灯 */
    (function farDoor() {
      var d = SHOP.farDoor;
      DOORS.shopDoor = { x: d.x, y: d.y, w: d.w, h: d.h };
      rect(c, d.x - 6, d.y - 5, d.w + 12, d.h + 7, P.woodDeep);
      rect(c, d.x - 4, d.y - 3, d.w + 8, d.h + 5, P.woodDark);
      rect(c, d.x, d.y, d.w, d.h, '#140f18');
      rect(c, d.x + 6, d.y + 2, d.w - 28, d.h - 2, shadeOf(P.woodDark, -0.22));
      for (i = 0; i < d.w - 28; i += 9) rect(c, d.x + 6 + i, d.y + 2, 1, d.h - 2, P.boardSeam);
      dith(c, d.x + d.w - 22, d.y + 3, 20, d.h - 6, 'rgba(255,226,170,.40)', 0);
      dith(c, d.x + d.w - 20, d.y + 7, 17, d.h - 14, 'rgba(255,246,214,.56)', 1);
      rect(c, d.x + d.w - 20, d.y + R(d.h * 0.34), 3, R(d.h * 0.26), 'rgba(255,248,222,.70)');
      rect(c, d.x + 9, d.y + 10, 3, 10, P.copper);
      rect(c, d.x + 9, d.y + 22, 3, 8, P.brassLit);
      rect(c, d.x - 6, d.y + d.h + 2, d.w + 12, 6, P.woodDark);
      rect(c, d.x - 3, d.y + d.h + 3, d.w + 6, 3, P.copperDark);
    })();
    /* 内场两座柜：西＝待上架，东＝当票架 */
    incomingCabinet(c, SHOP.shelf.x, SHOP.shelf.y, SHOP.shelf.w, SHOP.shelf.h, P);
    ticketCabinet(c, SHOP.tickets.x, SHOP.tickets.y, SHOP.tickets.w, SHOP.tickets.h, P);
    /* 侧墙挂的货（不落地，只压墙面） */
    wallbox(c, 8, 168, P); hooks(c, 14, 300, P); wallstr(c, 12, 470, P);
    wallbox(c, 926, 180, P); wallbox(c, 926, 316, P); hooks(c, 930, 440, P);
    /* 地上几件矮平的家什（走过不违和） */
    sack(c, 60, 470, P); sack(c, 80, 486, P);
    barrel(c, 68, 596, P);
    broom(c, 884, 556, P);
    pallet2(c, 800, 636, P);
    stool(c, 232, 424, P);
    stool(c, 704, 424, P);
    /* ---- 柜台：这张图的主角 ---- */
    shopCounter(c, SHOP.counter.x, SHOP.counter.y, SHOP.counter.w, SHOP.counter.h, P);
    /* ---- 客座：柜台外头等开秤的客人（二章自己的立绘，不是一章那套 FIG）---- */
    gs = SHOP.guests;
    for (g = 0; g < gs.length; g++) figOwn(c, 'guest', gs[g].tx, gs[g].ty, -1, 0, gs[g].tx * 0.37);
    /* 吊灯两盏（画在最后 = 吊在最前头） */
    hanglamp(c, 300, 58, P); hanglamp(c, 660, 58, P);
    return 8;
  }

  /* 柜台：三层读法 —— 台面（亮）→ 立面（三段木格 + 铜钉）→ 踢脚（暗）；
     台面上摆四件"开秤的家伙"：算盘 / 账本 / 油灯 / 秤，另有一叠空当票。 */
  function shopCounter(c, x, y, w, h, P) {
    var i, si, top = 14, faceY = y + top, faceH = h - top - 8;
    var segW = Math.floor((w - 16) / 3), sx;
    /* 台面 */
    rect(c, x - 4, y - 4, w + 8, top + 4, P.counterDeep);
    rect(c, x - 2, y, w + 4, top, P.counterLit);
    rect(c, x - 2, y, w + 4, 3, P.counterHi);
    rect(c, x - 2, y + top - 3, w + 4, 3, P.counter);
    for (i = 0; i < w + 4; i += 46) rect(c, x - 2 + i, y + 3, 1, top - 6, shadeOf(P.counterLit, -0.16));
    /* 铜沿：营业中的柜台才擦得亮 */
    rect(c, x - 2, y + top - 1, w + 4, 2, P.copperDark);
    rect(c, x - 2, y + top - 1, w + 4, 1, mixOf(P.brass, '#ffffff', 0.18));
    /* 立面：三段木格 + 每格四颗铜钉 + 一个只刻纹样的小件。
       实拍自审逮到的问题：三段之间只有一线之差 ⇒ 远看整面墙一样平。
       改法：段与段之间立一根**亮色立柱**、每段里再压一道凹框（外深内浅），
       下沿补一条更黑的拖影 —— 靠明暗差把"这是三段抽屉"读出来，不用描边不用渐变。 */
    rect(c, x - 2, faceY, w + 4, faceH, P.counter);
    rect(c, x - 2, faceY, w + 4, 1, P.counterLit);
    rect(c, x - 2, faceY + faceH - 6, w + 4, 6, shadeOf(P.counter, -0.22));
    for (si = 0; si < 3; si++) {
      sx = x + 8 + si * (segW + 8);
      /* 凹框：外框深一圈，内面反而比底色亮一档 —— 这块才"凸"得出来 */
      rect(c, sx, faceY + 6, segW, faceH - 16, shadeOf(P.counter, -0.34));
      rect(c, sx + 3, faceY + 9, segW - 6, faceH - 22, shadeOf(P.counter, 0.14));
      rect(c, sx + 3, faceY + 9, segW - 6, 1, shadeOf(P.counter, 0.30));
      rect(c, sx + 3, faceY + faceH - 14, segW - 6, 1, shadeOf(P.counter, -0.20));
      /* 木纹：几道 1px 短横，别让它是一块塑料 */
      for (i = 0; i < 5; i++) {
        rect(c, sx + 8 + ((i * 37) % Math.max(4, segW - 40)), faceY + 14 + i * 9, 12 + (i % 3) * 7, 1, shadeOf(P.counter, -0.10));
      }
      carve(c, sx + R(segW / 2), faceY + R(faceH / 2) - 1, 5, P);
      for (i = 0; i < 2; i++) {
        rect(c, sx + 4, faceY + 3 + i * 4, 2, 2, P.copper);
        rect(c, sx + segW - 6, faceY + 3 + i * 4, 2, 2, P.copper);
      }
      /* 段与段之间的立柱（亮木 + 一道高光）：这条是"三段"的读点 */
      rect(c, sx + segW + 2, faceY + 2, 6, faceH - 8, shadeOf(P.counter, 0.22));
      rect(c, sx + segW + 2, faceY + 2, 2, faceH - 8, shadeOf(P.counter, 0.40));
      rect(c, sx + segW + 7, faceY + 2, 1, faceH - 8, P.counterDeep);
    }
    /* 踢脚 + 柜台在地上的影子 */
    rect(c, x - 4, y + h - 8, w + 8, 8, P.counterDeep);
    rect(c, x - 6, y + h, w + 12, 4, 'rgba(0,0,0,.34)');
    rect(c, x - 4, y + h + 4, w + 8, 2, 'rgba(0,0,0,.16)');
    /* 台面上的家伙（最后画 ⇒ 压在台面上；锚点往上提 34px 让它们"坐在"台面上） */
    objAbacus(c, x + 26, y - 34, P);
    objBigLedger(c, x + 96, y - 33, P);
    oilLamp(c, x + 162, y - 30, P);
    beamScale(c, x + 216, y - 33, P);
    slip(c, x + 288, y - 10, P, 4);
    objVisitBook(c, x + 344, y - 33, P);
    beamScale(c, x + 420, y - 33, P);
  }

  /* 待上架柜：客人刚当进来的记先摆在柜上等入库 —— 四只罐、四段，一格一只（跟库房同一套 jar()） */
  function incomingCabinet(c, x, y, w, h, P) {
    var i;
    rack(c, x, y + 36, w, h - 36, P, 17, 'plain');
    for (i = 0; i < 4; i++) {
      jar(c, x + 8 + i * 34, y + 44, 26, 34, P, 300 + i,
          'ABCD'.charAt(i), WAX[i % WAX.length], 1, 0, CLAY[i % CLAY.length], 1);
    }
    slip(c, x + 6, y + 90, P, 2);
    carve(c, x + R(w / 2), y + h - 12, 4, P);
  }

  /* 当票架：三排挂钩、每排三张当票（只有线，不写字），票角一枚火漆 */
  function ticketCabinet(c, x, y, w, h, P) {
    var r, i, sx, sy;
    rect(c, x, y, w, h, P.woodDark);
    rect(c, x, y, w, 3, P.woodLit);
    rect(c, x, y, 3, h, P.woodLit);
    rect(c, x + w - 3, y, 3, h, P.woodDeep);
    rect(c, x + 3, y + h - 5, w - 6, 5, P.woodDeep);
    carve(c, x + R(w / 2), y + 16, 6, P);
    for (r = 0; r < 3; r++) {
      for (i = 0; i < 3; i++) {
        sx = x + 12 + i * 42; sy = y + 30 + r * 21;
        rect(c, sx + 10, sy - 5, 1, 5, P.copper);
        rect(c, sx, sy, 22, 17, shadeOf(P.paperDark, -0.18));
        rect(c, sx + 1, sy + 1, 20, 15, P.paper);
        rect(c, sx + 3, sy + 4, 12, 1, P.ink);
        rect(c, sx + 3, sy + 7, 15, 1, shadeOf(P.ink, 0.34));
        rect(c, sx + 3, sy + 10, 9, 1, shadeOf(P.ink, 0.34));
        rect(c, sx + 15, sy + 11, 4, 4, WAX[(r + i) % WAX.length]);
      }
    }
  }

  /* 账房北半间那张大账桌：台面（亮边）+ 立面（三段抽屉，每个一枚铜拉手）+ 桌腿 + 地上的影。
     台面上摆的是"算不平的账"那几样：摊开的账本、算盘、一盏灯、一只镇纸。 */
  function backDesk(c, x, y, w, h, P) {
    var i, si, top = 16, faceY = y + top, faceH = h - top - 10;
    var segW = Math.floor((w - 24) / 4), sx;
    rect(c, x - 4, y - 4, w + 8, top + 6, P.woodDeep);
    rect(c, x - 2, y, w + 4, top, P.woodLit);
    rect(c, x - 2, y, w + 4, 3, mixOf(P.woodHi, P.paper, 0.18));
    rect(c, x - 2, y + top - 3, w + 4, 3, P.wood);
    for (i = 0; i < w + 4; i += 52) rect(c, x - 2 + i, y + 3, 1, top - 6, shadeOf(P.woodLit, -0.18));
    rect(c, x - 2, y + top - 1, w + 4, 2, P.copper);
    rect(c, x - 2, y + top - 1, w + 4, 1, P.brassLit);
    rect(c, x - 2, faceY, w + 4, faceH, P.woodDark);
    rect(c, x - 2, faceY, w + 4, 1, P.wood);
    for (si = 0; si < 4; si++) {
      sx = x + 6 + si * (segW + 6);
      rect(c, sx, faceY + 6, segW, faceH - 16, shadeOf(P.woodDark, -0.22));
      rect(c, sx, faceY + 6, segW, 1, P.wood);
      rect(c, sx + 3, faceY + 9, segW - 6, 2, P.woodDeep);          /* 抽屉缝 */
      rect(c, sx + R(segW / 2) - 4, faceY + R((faceH - 16) / 2) + 2, 9, 3, P.copper);
      rect(c, sx + R(segW / 2) - 4, faceY + R((faceH - 16) / 2) + 2, 9, 1, P.brassLit);
    }
    rect(c, x - 4, y + h - 10, w + 4, 10, P.woodDeep);
    rect(c, x - 6, y + h, w + 12, 4, 'rgba(0,0,0,.32)');
    /* 桌面上的东西 */
    objBigLedger(c, x + 18, y - 30, P);
    objAbacus(c, x + 104, y - 31, P);
    oilLamp(c, x + 190, y - 26, P);
    slip(c, x + 250, y - 8, P, 3);
    objVisitBook(c, x + 300, y - 30, P);
    objBigLedger(c, x + 372, y - 30, P);
    rect(c, x + 440, y + 4, 22, 8, P.ink);                        /* 镇纸 */
    rect(c, x + 440, y + 4, 22, 2, mixOf(P.ink, '#ffffff', 0.22));
  }
  /* 前厅柜前那块毡毯：暗红底 + 三道边 + 织纹 + 两端流苏（只有 fillRect，没有弧线） */
  function carpet(c, x, y, w, h) {
    var i, j;
    rect(c, x + 4, y + 4, w, h, 'rgba(0,0,0,.30)');                /* 绒面压出来的影子 */
    rect(c, x, y, w, h, '#6e2a22');                               /* 外框 */
    rect(c, x + 3, y + 3, w - 6, h - 6, '#8a3428');               /* 边带 */
    rect(c, x + 12, y + 12, w - 24, h - 24, '#7c2f26');           /* 内框 */
    rect(c, x + 12, y + 12, w - 24, 1, '#a5493a');
    rect(c, x + 16, y + 16, w - 32, h - 32, '#93392c');           /* 绒面 */
    /* 回纹：边带上一圈小方块（十六格一循环） */
    for (i = 16; i < w - 16; i += 16) {
      rect(c, x + i, y + 4, 6, 6, '#a5493a');
      rect(c, x + i, y + h - 10, 6, 6, '#a5493a');
      rect(c, x + i + 1, y + 5, 4, 4, '#7c2f26');
      rect(c, x + i + 1, y + h - 9, 4, 4, '#7c2f26');
    }
    for (j = 16; j < h - 16; j += 16) {
      rect(c, x + 4, y + j, 6, 6, '#a5493a');
      rect(c, x + w - 10, y + j, 6, 6, '#a5493a');
      rect(c, x + 5, y + j + 1, 4, 4, '#7c2f26');
      rect(c, x + w - 9, y + j + 1, 4, 4, '#7c2f26');
    }
    /* 中心菱格：横竖各几道短杠错开摆，远看就是菱花（不用圆弧） */
    for (j = 0; j < h - 56; j += 20) {
      for (i = 0; i < w - 56; i += 20) {
        var dx = x + 28 + i + ((j / 20) % 2 ? 10 : 0);
        var dy = y + 28 + j;
        if (dx > x + w - 30) continue;
        rect(c, dx - 4, dy, 9, 1, '#a5493a');
        rect(c, dx, dy - 4, 1, 9, '#a5493a');
        rect(c, dx - 2, dy - 2, 5, 5, '#7c2f26');
        rect(c, dx - 1, dy - 1, 3, 3, '#a5493a');
      }
    }
    rect(c, x + 16, y + 16, w - 32, 1, '#a5493a');
    for (i = 0; i < w - 8; i += 8) {                              /* 两端流苏 */
      rect(c, x + 4 + i, y - 4, 1, 4, '#8a6a3c');
      rect(c, x + 4 + i, y + h, 1, 4, '#8a6a3c');
    }
    dith(c, x + 4, y + 4, w - 8, h - 8, 'rgba(0,0,0,.14)', 1);    /* 压一层旧色 */
  }
  /* 木凳：客人坐着等开秤的小方凳 */
  function stool(c, x, y, P) {
    rect(c, x + 2, y + 14, 20, 4, 'rgba(0,0,0,.30)');
    rect(c, x, y, 24, 6, P.woodDark);
    rect(c, x, y, 24, 2, P.woodLit);
    rect(c, x + 1, y + 6, 22, 2, P.woodDeep);
    rect(c, x + 2, y + 8, 3, 8, P.woodDark); rect(c, x + 19, y + 8, 3, 8, P.woodDark);
    rect(c, x + 6, y + 10, 12, 1, P.woodDeep);
  }
  /* 柜上那盏油灯 / 那杆秤（都是"开秤做生意"的记号，画小、画亮） */
  function oilLamp(c, x, y, P) {
    rect(c, x + 5, y + 22, 14, 3, P.copperDark);
    rect(c, x + 7, y + 13, 10, 10, P.copper);
    rect(c, x + 7, y + 13, 10, 1, P.copperLit);
    rect(c, x + 8, y + 6, 8, 8, 'rgba(255,214,140,.30)');
    rect(c, x + 11, y + 3, 2, 5, 'rgba(255,240,190,.72)');
    rect(c, x + 10, y + 8, 4, 3, 'rgba(255,246,214,.88)');
    rect(c, x + 3, y + 1, 18, 2, P.brass);
  }
  function beamScale(c, x, y, P) {
    rect(c, x + 2, y + 22, 20, 3, P.brass);
    rect(c, x + 2, y + 22, 20, 1, P.brassLit);
    rect(c, x + 11, y + 11, 2, 12, P.copperDark);
    rect(c, x + 10, y + 9, 4, 3, P.brassLit);
    rect(c, x, y + 24, 8, 2, P.brass); rect(c, x + 16, y + 24, 8, 2, P.brass);
    rect(c, x, y + 26, 8, 4, 'rgba(196,150,80,.55)');
    rect(c, x + 16, y + 26, 8, 4, 'rgba(196,150,80,.55)');
    rect(c, x + 1, y + 26, 6, 1, 'rgba(255,236,190,.42)');
  }

  /* ============================================================
     六之三、二章自持立绘
     ------------------------------------------------------------
     几何契约照引擎那句调用对齐：paintFigure(c, id, x, y, face, lift, phase)，x/y 是**格号**，
     px = x*48+24、脚底在 py+16 —— 画出来的人跟引擎画的人踩在同一个脚印上。
     **一章那套 FIG 一张都不借**（keeper / hai / you 全在一章 art31 里）。
     二章两个人物（用户 2026-10-17：「这人物也是两个人」）：
       · you    主角：前厅当值的学徒 —— 靛青短褂 + 米色围裙 + 麻绳腰带 + 束发
       · keeper 祁掌柜：账房那位 —— 墨绿长衫 + 灰白须发
     外加只在前厅用的 guest（上门的客人）：暗紫褐短打 + 斗笠，跟"两个人"不混。 */
  var CH2_FIG = {
    /* 二章主角也用同一把尺子（tools/shot-hero.mjs 量的）：
       原值 头 12 行 / 总 43 行 = 28%（1:3.6）、腿只露 1~2 行（全被短褂下摆盖住）。
       改：头 12→9 行、宽 12→10；腿 11→14（多露 9 行）。只有 you 带这三个字段。 */
    you:    { coat: '#2c4468', sash: '#8a6a3c', skin: '#e8c49e', hair: '#1f160f', build: 'slim', apron: '#cbb691',
              headW: 8, headH: 8, legRows: 14 },
    keeper: { coat: '#2f4a3c', sash: '#7a5a34', skin: '#e3c09a', hair: '#d2ccc2', build: 'stout', beard: '#ded9cf' },
    guest:  { coat: '#5a4a68', sash: '#8a7448', skin: '#eccba6', hair: '#2a1f18', build: 'slim',
              hat: '#5f5645', pack: '#6e6653' }
  };
  function rampOf(col) {
    return [shadeOf(col, -0.55), shadeOf(col, -0.26), col, mixOf(col, '#fff4dc', 0.28)];
  }
  function figOwn(c, id, x, y, face, lift, phase) {
    var F = CH2_FIG[id] || CH2_FIG.you;
    var px = R(x * CELL + CELL / 2), pby = R(y * CELL + CELL / 2 - (lift || 0));
    var ph = (phase === undefined ? 0 : phase);
    var mv = (lift || 0) > 0.02;
    var sw = mv ? (Math.sin(ph) >= 0 ? 1 : -1) : 0;
    var bob = mv ? (Math.abs(Math.sin(ph)) > 0.45 ? 1 : 0)
                 : (Math.sin(ph * 0.4) > 0.62 ? 1 : 0);
    var gy = pby + 16 - bob;
    var dir = face > 0 ? 1 : (face < 0 ? -1 : 0);
    var wide = F.build === 'stout' ? 1 : 0;
    var cr = rampOf(F.coat), sr = rampOf(F.skin), hr = rampOf(F.hair);
    var oc = mixOf(F.coat, '#0b0e14', 0.68), hc = mixOf(F.hair, '#0a0c11', 0.46);
    var i, sg, off, by, bw, aoff, aw;
    var HW = F.headW || 12, HH = F.headH || 12, LEG = F.legRows || 11;
    var hx0 = px - (HW >> 1);
    /* 影子：三层硬边（不画椭圆） */
    rect(c, px - 9 - wide, gy + 1, 18 + wide * 2, 3, 'rgba(0,0,0,.30)');
    rect(c, px - 7 - wide, gy - 1, 14 + wide * 2, 3, 'rgba(0,0,0,.15)');
    /* 腿 + 靴 */
    for (i = 0; i < 2; i++) {
      sg = i ? 1 : -1; off = sg * (3 + wide);
      /* 跟一章同一套：走路抬脚，别左右挪（挪到同一点就是"腿糊成一坨"） */
      var st2 = mv && (sw * sg > 0) ? 2 : 0;
      rect(c, px + off - 3, gy - LEG + st2, 6, LEG - 1 - st2, oc);
      rect(c, px + off - 2, gy - LEG + 1 + st2, 4, LEG - 3 - st2, '#3b2c22');
      rect(c, px + off - 3, gy - 3 + st2, 6, 3, '#241a13');
      rect(c, px + off - 2, gy - 3 + st2, 4, 1, '#4a3728');
    }
    /* 袍身：上宽下略收，1px 描边立住 */
    by = gy - 27; bw = 13 + wide * 2;
    rect(c, px - R(bw / 2) - 1, by - 1, bw + 2, 18, oc);
    rect(c, px - R(bw / 2), by, bw, 17, cr[1]);
    rect(c, px - R(bw / 2), by, bw, 6, cr[2]);
    rect(c, px - R(bw / 2) + 1, by + 1, bw - 2, 1, cr[3]);
    /* 交领：三段错开的矩形（不画斜线） */
    rect(c, px - 4 + (dir > 0 ? 1 : 0), by, 4, 2, oc);
    rect(c, px - 3, by + 2, 3, 2, oc);
    rect(c, px - 2, by + 4, 2, 2, oc);
    /* 腰带 */
    rect(c, px - R(bw / 2), gy - 15, bw, 3, F.sash);
    rect(c, px - R(bw / 2), gy - 15, bw, 1, mixOf(F.sash, '#ffffff', 0.24));
    /* 围裙（前厅当值的记号） */
    if (F.apron) {
      rect(c, px - 3, gy - 17, 7, 9, F.apron);
      rect(c, px - 3, gy - 17, 7, 1, mixOf(F.apron, '#ffffff', 0.22));
      rect(c, px - 3, gy - 9, 7, 1, shadeOf(F.apron, -0.24));
    }
    /* 下摆 */
    rect(c, px - R(bw / 2) - 1, gy - 11, bw + 2, 2, cr[1]);
    rect(c, px - R(bw / 2), gy - 10, bw, 1, cr[0]);
    /* 手臂：走路时前后换 */
    for (i = 0; i < 2; i++) {
      sg = i ? 1 : -1; aoff = sg * (R(bw / 2) + 1); aw = mv ? (sw * sg) : 0;
      rect(c, px + aoff - 2, by + 3 + aw, 4, 11, oc);
      rect(c, px + aoff - 1, by + 4 + aw, 2, 9, cr[1]);
      rect(c, px + aoff - 2, by + 12 + aw, 4, 3, sr[1]);
    }
    /* 头：脖子 + 脸 + 发 */
    /* 头：**一块壳 + 三行顶发 + 脸 + 1px 鬓角 + 2px 眼**。
       上一版是按老常数硬扳的，扳完脸被鬓角啃掉一半（实拍一看像个"口"字）。
       这版全部由 hTop / HW / HH 推出来，HH 改成 9 就是九行脑袋，换谁都不会错位。 */
    var hTop = by - HH - 4;
    rect(c, px - 2, by - 4, 4, Math.min(4, HH - 4), sr[0]);           /* 脖子 */
    rect(c, hx0 - 1, hTop, HW + 2, HH + 2, hc);                       /* 头壳（含描边） */
    rect(c, hx0, hTop + 1, HW, HH, hr[1]);                            /* 发色打底 */
    rect(c, hx0, hTop + 1, HW, 3, hr[2]);                             /* 顶发亮一档 */
    rect(c, hx0, hTop + 1, HW, 1, hr[3]);
    /* 脸 6px 宽（不是 8）：8 宽的脸加上只有 3 行顶发，远看就是"一张白面具挂着一个洞"。
       左右各留 2px 鬓角，脸窄下来，眼睛才落在两侧头发中间。 */
    rect(c, hx0 + 2, hTop + 4, HW - 4, HH - 3, sr[2]);                /* 脸 */
    rect(c, hx0 + 2, hTop + 4, HW - 4, 1, sr[3]);
    rect(c, hx0 + 2, hTop + HH, HW - 4, 1, sr[1]);                    /* 下巴那道暗 */
    rect(c, hx0, hTop + 4, 2, HH - 3, hr[1]);                         /* 鬓角（2px） */
    rect(c, hx0 + HW - 2, hTop + 4, 2, HH - 3, hr[0]);
    rect(c, hx0 + (dir > 0 ? 1 : 0), hTop + 4, (dir > 0 ? 2 : dir < 0 ? 2 : 1), 3, hr[1]);
    /* 眼：2px 宽一道，位置由 HH 推（约在脸上 60% 处），朝哪边就看哪边 */
    var eyeRow = hTop + HH - 3;
    if (dir >= 0) rect(c, px + 1, eyeRow, 2, 2, '#241a14');
    if (dir <= 0) rect(c, px - 3, eyeRow, 2, 2, '#241a14');
    if (dir === 0) { rect(c, px - 3, eyeRow, 2, 2, '#241a14'); rect(c, px + 2, eyeRow, 2, 2, '#241a14'); }
    /* 斗笠（客人）/ 须（掌柜） */
    if (F.hat) {
      rect(c, px - 5, by - 14, 10, 11, shadeOf(F.skin, -0.30));   /* 笠檐压在脸上的那道暗 */
      rect(c, px - 6, by - 15, 12, 12, oc);
      rect(c, px - 8, by - 17, 16, 3, F.hat);
      rect(c, px - 5, by - 20, 10, 4, shadeOf(F.hat, 0.16));
      rect(c, px - 8, by - 17, 16, 1, shadeOf(F.hat, 0.30));
      rect(c, px - 8, by - 15, 2, 1, shadeOf(F.hat, -0.24));
      rect(c, px + 6, by - 15, 2, 1, shadeOf(F.hat, -0.24));
    }
    if (F.pack) {                                                 /* 肩上那捆网 + 腰侧布袋 */
      rect(c, px + R(bw / 2) - 1, by + 1, 6, 12, '#5e5748');
      rect(c, px + R(bw / 2) + 1, by + 3, 2, 8, '#7a7260');
      rect(c, px + R(bw / 2) - 2, by + 12, 8, 2, '#463f33');
      rect(c, px - R(bw / 2) - 4, gy - 16, 6, 7, '#6e5a3a');
      rect(c, px - R(bw / 2) - 3, gy - 15, 4, 5, '#8a7350');
    }
    if (F.beard) {
      rect(c, px - 3, by - 6, 6, 3, F.beard);
      rect(c, px - 2, by - 3, 4, 2, shadeOf(F.beard, -0.14));
      rect(c, px - 5, by - 8, 2, 3, F.beard);
      rect(c, px + 3, by - 8, 2, 3, F.beard);
    }
    return 1;
  }
  /* 带身份的 NPC：bake 里由 drawPlace 的 p.npc 分支画，位置在 paintSolids **之后**；
     我的补丁层重放的是"房间"，不含人 ⇒ 盖住他那格就会把人抹掉（实拍 jar-23 一眼看见那格空了）。 */
  function npcArt(c, sc) {
    var ps = (sc && sc.places) || [], i, n = 0;
    for (i = 0; i < ps.length; i++) {
      if (!ps[i].npc) continue;
      figOwn(c, ps[i].npc, ps[i].x, ps[i].y, -1, 0, 0.35);
      n++;
    }
    return n;
  }
  /* ---------- 账房（ch2_back）：**自己画的地面与墙** ----------
     原先这两行是 「ORIG.ground/solids(shopView(sc))」 —— 一章当铺的地面与建筑换个色调就搬进来。
     现在整间自己画：冷石板 + 砖墙 + 梁 + 陈设（backLayer 里那批本来就是我的画法）。 */
  function paintBackFloor(c, sc) {
    var P = palBackOf(sc), x, y, i, r, t, col;
    rect(c, 0, 0, VW, VH, P.wallDark);
    /* 石板：48 见方、四道缝、中心提亮一档 —— 账房是算账的地方，冷、硬、干净；
       库房那条暖木栈道是仓库，前厅是 24 见方的青砖：三张图一脚踩下去就分得出。 */
    for (y = 48; y < 672; y += 48) {
      for (x = 48; x < 912; x += 48) {
        r = rng(x, y, 41); t = r();
        col = t > 0.86 ? mixOf(P.floorBase, P.floorLit, 0.62)
            : t < 0.22 ? shadeOf(P.floorBase, -0.18)
            : mixOf(P.floorBase, P.floorLit, 0.14 + t * 0.20);
        rect(c, x, y, 48, 48, col);
        rect(c, x + 1, y + 1, 46, 1, mixOf(col, '#ffffff', 0.07));
        rect(c, x + 1, y + 45, 46, 2, shadeOf(col, -0.20));
        rect(c, x, y, 1, 48, P.seam); rect(c, x + 47, y, 1, 48, P.seam);
        rect(c, x, y, 48, 1, P.seam); rect(c, x, y + 47, 48, 1, P.seam);
        for (i = 0; i < 6; i++) {
          rect(c, x + 4 + R(r() * 40), y + 4 + R(r() * 40), 1, 1,
               r() > 0.5 ? shadeOf(col, -0.15) : mixOf(col, '#ffffff', 0.10));
        }
      }
    }
  }
  function paintBackRoom(c, sc) {
    var P = palBackOf(sc);
    brick(c, 0, 0, VW, 48, P, 11, true);
    brick(c, 0, 48, 48, 624, P, 23, false);
    brick(c, 912, 48, 48, 624, P, 31, false);
    dith(c, 0, 48, 48, 624, 'rgba(0,0,0,.30)', 0);
    dith(c, 912, 48, 48, 624, 'rgba(0,0,0,.30)', 1);
    rect(c, 0, 0, VW, 3, P.woodDeep);
    rect(c, 0, 48, 3, 624, P.woodDeep);
    rect(c, 912, 48, 3, 624, P.woodDeep);
    /* 两面侧墙挂的账格与货：屋子四面有物，画面才不空 */
    wallbox(c, 926, 120, P); wallbox(c, 926, 236, P); wallbox(c, 926, 352, P);
    wallbox(c, 8, 120, P); wallbox(c, 8, 232, P);
    hooks(c, 14, 176, P); hooks(c, 14, 300, P);
    wallstr(c, 10, 480, P);
    /* 踢脚线：地跟墙之间压一道木线（跟柜台那间同一套办法，接缝不连成一片） */
    rect(c, 0, 48, VW, 2, P.woodDeep);
    rect(c, 0, 50, VW, 4, P.woodDark);
    rect(c, 0, 54, VW, 1, 'rgba(0,0,0,.34)');
    rect(c, 48, 48, 2, 624, P.woodDeep); rect(c, 50, 48, 4, 624, P.woodDark);
    rect(c, 910, 48, 2, 624, P.woodDeep); rect(c, 906, 48, 4, 624, P.woodDark);
    /* 北半间那张**大账桌**（tiles x5..14 × y3..4 ⇒ solids [5,3,10,2]，两边同一条线）：
       断耦合之前这半间"有一张柜台"，其实是把一章当铺那张重放过来的；现在自己画一张。 */
    backDesk(c, 5 * CELL, 3 * CELL, 10 * CELL, 2 * CELL, P);
    /* 桌上那两盏灯照下来的一摊光：桌子南沿那道边亮起来，木头才不是一块黑 */
    pool(c, 5 * CELL + 5 * CELL, 5 * CELL + 18, 420, 96, 0);
    dith(c, 5 * CELL, 5 * CELL - 6, 10 * CELL, 10, 'rgba(255,226,170,.10)', 1);
    /* 梁 + 梁上陈设 + 房内 8 件实物 + 西墙那道门（都在 backLayer 里） */
    backLayer(c, sc, P);
    return 8;
  }
  /* ---------- S3 账房：8 件实物（一格一件，坐标照 js/ch2/scenes.js 那 9 个点）----------
     为什么"画在点位那一格"是安全的：引擎把**非 look/portal/jobs 的点所在格**算成障碍
     （js/story23.js:1408）⇒ 那 8 格本来就是墙，在它上面画实物，碰撞和画面才是同一件事。
     出口 (1,10) 是 look（能走），所以门画在它左边那一列墙砖上 —— 跟库房那道一个形制、同一高度。 */
  var BACK_OBJS = [
    { id: 'ch2_back_redeem',   tx: 15, ty: 10, art: 'bookStand' },
    { id: 'ch2_back_chain',    tx: 16, ty: 10, art: 'tagChain' },
    { id: 'ch2_back_desk',     tx: 17, ty: 10, art: 'deskTop' },
    { id: 'ch2_back_abacus',   tx: 18, ty: 10, art: 'abacus' },
    { id: 'ch2_back_oldbox',   tx: 18, ty: 9,  art: 'oldBox' },
    { id: 'ch2_back_ledger',   tx: 10, ty: 12, art: 'bigLedger' },
    { id: 'ch2_back_visitors', tx: 18, ty: 13, art: 'visitBook' }
  ];
  function backObjs() {
    return BACK_OBJS.map(function (o) { return { id: o.id, tx: o.tx, ty: o.ty, art: o.art, x: o.tx * CELL, y: o.ty * CELL }; });
  }
  /* 北半间那道受光带：梁上那排账册/旧票是特意摆在北半间的，引擎的暗角在上面再压一层，
     不补光就"暗到看不清"（中枢转的 D 线第二条）。只往墙带上画，不碰地面。 */
  function wallGlow(c, x, y, w, h, P) {
    rect(c, x, y, w, h, mixOf(P.wallBase, P.wallLit, 0.58));
    rect(c, x, y, w, 2, mixOf(P.wallLit, P.woodHi, 0.40));
    rect(c, x, y + h - 1, w, 1, 'rgba(0,0,0,.22)');
    dith(c, x, y + h - 9, w, 8, 'rgba(255,226,170,.11)', 0);
  }
  /* ① 算赎价：一本摊在斜架上的账（只画格线，不写字） */
  function objBookStand(c, x, y, P) {
    var bx = x + 7, by = y + 13, i;
    rect(c, bx, by + 18, 34, 5, P.woodDark);
    rect(c, bx, by + 18, 34, 1, P.woodLit);
    rect(c, bx + 3, by + 23, 3, 7, P.woodDeep);
    rect(c, bx + 28, by + 23, 3, 7, P.woodDeep);
    rect(c, bx + 1, by + 2, 32, 17, P.woodDark);
    rect(c, bx + 1, by + 2, 32, 2, P.woodLit);
    rect(c, bx + 3, by, 13, 15, P.paper);
    rect(c, bx + 16, by, 13, 15, shadeOf(P.paper, -0.07));
    rect(c, bx + 15, by, 2, 15, P.ink);
    for (i = 0; i < 4; i++) {
      rect(c, bx + 5, by + 3 + i * 3, 9, 1, 'rgba(42,32,24,.34)');
      rect(c, bx + 18, by + 3 + i * 3, 9, 1, 'rgba(42,32,24,.34)');
    }
    rect(c, bx + 6, by + 19, 24, 1, 'rgba(0,0,0,.20)');
  }
  /* ② 担保链：一块木板上钉着一串小木牌，牌之间用麻线连着（一环一环） */
  function objTagChain(c, x, y, P) {
    var i;
    rect(c, x + 7, y + 5, 34, 40, mixOf(P.woodDark, P.wood, 0.38));
    rect(c, x + 7, y + 5, 34, 2, P.woodLit);
    rect(c, x + 9, y + 9, 30, 1, P.woodDeep);
    rect(c, x + 9, y + 41, 30, 1, P.woodDeep);
    rect(c, x + 14, y + 9, 1, 32, 'rgba(158,138,102,.72)');
    for (i = 0; i < 5; i++) {
      var ty2 = y + 10 + i * 6;
      rect(c, x + 16, ty2, 8, 5, mixOf(P.paper, P.paperDark, 0.30));
      rect(c, x + 16, ty2, 8, 1, P.paper);
      rect(c, x + 18, ty2 + 2, 4, 1, 'rgba(42,32,24,.42)');
      rect(c, x + 14, ty2 + 2, 2, 1, 'rgba(158,138,102,.72)');
    }
  }
  /* ③ 账桌：桌面 + 两条腿 + 横撑，摆着半本对账、一支秃笔、一盏油灯 */
  function objDeskTop(c, x, y, P) {
    rect(c, x + 1, y + 14, 46, 4, mixOf(P.woodDark, P.wood, 0.5));
    rect(c, x + 1, y + 14, 46, 1, P.woodHi);
    rect(c, x + 3, y + 18, 42, 2, P.woodDeep);
    rect(c, x + 5, y + 20, 4, 23, P.woodDark);
    rect(c, x + 39, y + 20, 4, 23, P.woodDark);
    rect(c, x + 9, y + 26, 30, 2, P.woodDeep);
    rect(c, x + 20, y + 7, 24, 7, P.paper);
    rect(c, x + 20, y + 7, 24, 1, shadeOf(P.paper, 0.08));
    rect(c, x + 22, y + 10, 20, 1, 'rgba(42,32,24,.30)');
    rect(c, x + 22, y + 13, 20, 1, 'rgba(42,32,24,.20)');
    rect(c, x + 21, y + 3, 11, 1, P.woodHi);
    rect(c, x + 27, y, 2, 4, P.woodDeep);
    rect(c, x + 5, y + 5, 9, 9, P.copperDark);
    rect(c, x + 6, y + 3, 7, 3, P.copper);
    rect(c, x + 8, y, 3, 3, 'rgba(255,236,180,.88)');
    rect(c, x + 5, y + 14, 9, 1, 'rgba(0,0,0,.22)');
  }
  /* ④ 算盘：框 + 横梁 + 两档珠子，珠子停在半路（上一笔没算完） */
  function objAbacus(c, x, y, P) {
    var i, r2, bx, ry, on;
    rect(c, x + 3, y + 9, 42, 28, P.woodDark);
    rect(c, x + 3, y + 9, 42, 2, P.woodHi);
    rect(c, x + 3, y + 9, 2, 28, P.woodLit);
    rect(c, x + 3, y + 35, 42, 2, P.woodDeep);
    rect(c, x + 5, y + 20, 38, 2, P.woodDark);
    for (r2 = 0; r2 < 2; r2++) {
      ry = r2 ? y + 23 : y + 12;
      rect(c, x + 5, ry, 38, 1, mixOf(P.woodDark, P.wood, 0.45));
      for (i = 0; i < 7; i++) {
        bx = x + 7 + i * 5;
        on = i < (r2 ? 4 : 3);
        rect(c, bx, ry, 3, 6, on ? P.woodHi : mixOf(P.brass, P.copperDark, 0.25));
        rect(c, bx, ry, 3, 1, on ? '#cbb68d' : P.brassLit);
      }
    }
  }
  /* ⑤ 旧票箱：盖半开，票按年份捆着，最上面那捆的绳是新换的 */
  function objOldBox(c, x, y, P) {
    var i, bx, by2;
    rect(c, x + 5, y + 19, 36, 26, mixOf(P.woodDark, P.wood, 0.35));
    rect(c, x + 5, y + 19, 36, 2, P.woodLit);
    rect(c, x + 7, y + 27, 32, 1, P.woodDeep);
    rect(c, x + 7, y + 36, 32, 1, 'rgba(0,0,0,.22)');
    rect(c, x + 3, y + 12, 40, 8, mixOf(P.woodDark, P.wood, 0.52));
    rect(c, x + 3, y + 12, 40, 1, P.woodHi);
    rect(c, x + 3, y + 19, 40, 1, P.woodDeep);
    for (i = 0; i < 3; i++) {
      bx = x + 9 + i * 9;
      by2 = y + 14 - (i === 2 ? 3 : 0);
      rect(c, bx, by2, 9, 6, i === 2 ? P.paper : shadeOf(P.paperDark, -0.14));
      rect(c, bx, by2, 9, 1, P.paper);
      rect(c, bx + 3, by2 - 1, 2, 8, i === 2 ? P.brass : P.woodDark);
    }
  }
  /* ⑥ 对账簿：摊在矮案上，左边记货、右边记人（格线，不写字） */
  function objBigLedger(c, x, y, P) {
    var i;
    rect(c, x + 1, y + 22, 46, 4, mixOf(P.woodDark, P.wood, 0.42));
    rect(c, x + 1, y + 22, 46, 1, P.woodLit);
    rect(c, x + 5, y + 26, 3, 11, P.woodDark);
    rect(c, x + 40, y + 26, 3, 11, P.woodDark);
    rect(c, x + 2, y + 6, 21, 16, P.paper);
    rect(c, x + 24, y + 6, 21, 16, shadeOf(P.paper, -0.07));
    rect(c, x + 23, y + 6, 2, 16, P.ink);
    for (i = 0; i < 5; i++) {
      rect(c, x + 5, y + 8 + i * 3, 15, 1, 'rgba(42,32,24,.30)');
      if (i !== 3) rect(c, x + 27, y + 8 + i * 3, 15, 1, 'rgba(42,32,24,.30)');
    }
    rect(c, x + 33, y + 6, 9, 6, shadeOf(P.paperDark, -0.44));
    rect(c, x + 33, y + 11, 9, 1, 'rgba(255,246,216,.38)');
  }
  /* ⑦ 访客簿：摊在桌角，最近三页上同一个姓出现很多回 */
  function objVisitBook(c, x, y, P) {
    var i;
    rect(c, x + 9, y + 24, 36, 4, mixOf(P.woodDark, P.wood, 0.46));
    rect(c, x + 9, y + 24, 36, 1, P.woodLit);
    rect(c, x + 12, y + 28, 4, 18, P.woodDark);
    rect(c, x + 38, y + 28, 4, 18, P.woodDark);
    rect(c, x + 11, y + 11, 32, 13, P.paper);
    rect(c, x + 11, y + 11, 32, 1, shadeOf(P.paper, 0.08));
    rect(c, x + 26, y + 11, 1, 13, 'rgba(42,32,24,.35)');
    for (i = 0; i < 3; i++) {
      rect(c, x + 14, y + 13 + i * 3, 10, 1, 'rgba(42,32,24,.32)');
      rect(c, x + 29, y + 13 + i * 3, 10, 1, 'rgba(42,32,24,.32)');
    }
    rect(c, x + 11, y + 23, 32, 1, 'rgba(0,0,0,.20)');
  }
  var OBJ_FN = {
    bookStand: objBookStand, tagChain: objTagChain, deskTop: objDeskTop,
    abacus: objAbacus, oldBox: objOldBox, bigLedger: objBigLedger, visitBook: objVisitBook
  };
  /* 二章自己往这张图上叠的几笔 */
  function backLayer(c, sc, P) {
    /* ---- 北半间那道光（中枢转的 D 线第二条）：不补，梁上的账册/旧票就"暗到看不清" ---- */
    wallGlow(c, 92, 4, 776, 44, P);
    /* ---- 顶上那道梁：「算盘和旧票堆到梁上」（tools/剧情-二章-设计.md:155 那行原话）----
       只往**墙带**上画（y 0..48 这条永远空着）：账册格 + 一捆捆旧票 + 挂钟 + 两盏壁灯。 */
    beam(c, 96, 10, 768, 30, P);
    ledgerHole(c, 120, 16, 7, P);
    ledgerHole(c, 470, 16, 6, P);
    bundleRow(c, 232, 24, 9, P);
    clockFace(c, 300, 20, P);
    bundleRow(c, 640, 24, 7, P);
    sconce(c, 152, 22, P);
    sconce(c, 812, 22, P);
    /* 夜里算账的地方：两盏铜灯（梁上悬下来的）+ 地上两摊灯脚 */
    hanglamp(c, 400, 132, P);
    hanglamp(c, 600, 118, P);
    pool(c, 404, 596, 220, 84, 0);
    pool(c, 604, 578, 200, 76, 1);
    /* ---- 房内 8 件实物：一格一件，坐标照 js/ch2/scenes.js 那 9 个点（祁掌柜那格是引擎自己画的 NPC）---- */
    var i, o, fn;
    for (i = 0; i < BACK_OBJS.length; i++) {
      o = BACK_OBJS[i];
      fn = OBJ_FN[o.art];
      if (fn) fn(c, o.tx * CELL, o.ty * CELL, P);
    }
    /* 地上散落两张旧票 + 门口那块铜踏板 */
    slip(c, 420, 560, P, 3);
    slip(c, 566, 590, P, 5);
    /* ---- 出口那道门：**在出口点 (1,10) 左边那一列**，跟库房那道同一高度、同一形制 ----
       （上一版画在东墙 x=913 上了：出口点在 (1,10) 是西侧，门画在东边等于"门在别处、
       玩家走不出去也看不出来" —— 中枢转的 D 线第四条，判据 B-5 现在钉这一条。） */
    if (!SKIP_BACKDOOR) exitDoor(c, 5, 428, 43, 162, P, { key: 'backDoor', dir: 'left' });
    rect(c, 52, 596, 52, 6, P.woodDark);
    rect(c, 58, 597, 40, 2, P.copperDark);
  }
  /* 梁：一道木梁 + 上沿一道灯色 */
  function beam(c, x, y, w, h, P) {
    rect(c, x, y, w, h, P.woodDark);
    rect(c, x, y, w, 2, P.woodLit);
    rect(c, x, y + h - 3, w, 3, P.woodDeep);
    rect(c, x, y + 8, w, 1, P.woodDeep);
    for (var i = 0; i < w; i += 96) rect(c, x + i, y, 3, h, P.woodDeep);
  }
  /* 梁上的账册格：一格一本，册脊朝外（只有深浅，不写字） */
  function ledgerHole(c, x, y, n, P) {
    rect(c, x - 4, y - 4, n * 22 + 8, 30, P.woodDeep);
    for (var i = 0; i < n; i++) {
      var xx = x + i * 22;
      rect(c, xx, y, 20, 24, shadeOf(P.paperDark, -0.30));
      rect(c, xx + 2, y + 2, 16, 20, i % 2 ? P.paper : shadeOf(P.paper, -0.10));
      rect(c, xx + 2, y + 2, 2, 20, P.ink);
      rect(c, xx + 5, y + 6, 11, 1, P.paperDark);
      rect(c, xx + 5, y + 10, 11, 1, P.paperDark);
    }
  }
  /* 梁上一捆捆旧票：纸捆 + 麻绳（比散点干净，一眼看得出是"票"） */
  function bundleRow(c, x, y, n, P) {
    for (var i = 0; i < n; i++) {
      var xx = x + i * 44, yy = y + (i % 2) * 2;
      rect(c, xx, yy, 36, 20, shadeOf(P.paperDark, -0.24));
      rect(c, xx + 1, yy + 1, 34, 17, i % 3 === 0 ? shadeOf(P.paper, -0.06) : P.paper);
      rect(c, xx + 1, yy + 17, 34, 2, shadeOf(P.paperDark, -0.34));
      rect(c, xx + 8, yy, 2, 19, P.woodDark);
      rect(c, xx + 24, yy, 2, 19, P.woodDark);
      rect(c, xx, yy, 36, 1, shadeOf(P.paper, 0.12));
    }
  }
  /* 挂钟：方壳圆面（硬规矩：只有矩形，不画圆 —— 八边形切角凑一个"钟"的样子） */
  function clockFace(c, x, y, P) {
    rect(c, x, y, 30, 30, P.woodDark);
    rect(c, x + 2, y + 2, 26, 26, P.copperDark);
    rect(c, x + 4, y + 4, 22, 22, shadeOf(P.paper, -0.04));
    rect(c, x + 5, y + 5, 20, 1, P.paperDark);
    rect(c, x + 5, y + 24, 20, 1, P.paperDark);
    rect(c, x + 5, y + 5, 1, 20, P.paperDark);
    rect(c, x + 24, y + 5, 1, 20, P.paperDark);
    rect(c, x + 14, y + 8, 2, 9, P.ink);
    rect(c, x + 14, y + 16, 7, 2, P.ink);
    rect(c, x + 2, y + 30, 26, 3, P.woodDeep);
  }

  /* ============================================================
     五之二、动态那层：空/满（从账上读）+ 靠近高亮（每帧画）
     ------------------------------------------------------------
     为什么分两层：底图（bake）是预烘焙、每帧只 drawImage 一次（game23.js:3537-3562），
     而"玩家走到哪只罐子跟前"逐帧在变、空/满随账在变 —— 所以：
       · 空/满：进 bake（跟罐子同一个模子画出来，引擎的环境色照旧压在上面）；
                 账一变就喊一次重烘（GAME23.QUALITY.setup 是引擎导出的，它自己置 bgDirty）。
       · 靠近高亮：挂在 ART31.paintFigure 上（引擎每帧都给玩家调一次，game23.js:3741），
                 每帧多画那几笔铜框 + 暖晕 —— 不重烘、不碰底图。
     ============================================================ */
  /* 26 格空满：账上那份说了算。`GAME23.S` 是引擎导出的存档 getter（线上也有）；
     拿不到（单跑 art.js、或玩法模块没挂上）⇒ null，退回静态摆样。 */
  function vaultSealed() {
    try {
      var Vv = global.CH2_VAULT, G = global.GAME23;
      if (Vv && Vv.cellState && G && G.S) {
        var st = Vv.cellState(G.S);
        if (st && st.length === 26) return st.map(function (r) { return !!r.occupied; });
      }
    } catch (e) {}
    return null;
  }
  function sealedSig() {
    var st = vaultSealed();
    return st ? st.map(function (b) { return b ? '1' : '0'; }).join('') : 'none';
  }
  /* 我这边的 26 格（格号 + 格位 + 空满）—— 判据拿它跟 vault.js 的 cellState 逐格对拍：
     账只能有一个 owner，两边不许各念各的 */
  function cellStateMine() {
    var st = vaultSealed();
    return CELLS.map(function (c, i) {
      var s = st ? st[i] : !!c.sealed;
      return { k: c.k, id: c.letter, letter: c.letter, tx: c.tx, ty: c.ty,
               x: c.x, by: c.by, w: c.w, h: c.h, wax: c.wax, sealed: s, occupied: s };
    });
  }
  /* 靠近高亮：跟引擎的 nearestPlace **同一口径**（曼哈顿距离 ≤1、最小者胜，game23.js:1242-1250）
     —— 站在 (tx,6) 只认正上方那一只、(tx,7) 只认正下方那一只，走道/别处都不亮。 */
  function highlightAt(tx, ty) {
    var best = null, bd = 99, i, c, d;
    for (i = 0; i < CELLS.length; i++) {
      c = CELLS[i];
      d = Math.abs(tx - c.tx) + Math.abs(ty - c.ty);
      if (d <= 1 && d < bd) { bd = d; best = c; }
    }
    return best ? { k: best.k, letter: best.letter, tx: best.tx, ty: best.ty,
                    x: best.x, by: best.by, w: best.w, h: best.h, plate: best.plate } : null;
  }
  /* 高亮那一笔：只有矩形 + 2×2 抖动（硬规矩）；且**只落在那只罐子那一格里**
     —— 判据 ⑦ 拿这一条卡"高亮不许糊到隔壁格"。 */
  function paintHighlight(c, cell, P, ph) {
    var x = cell.x, by = cell.by, w = cell.w, h = cell.h, top = by - h;
    var bx = x - 3, bY = top - 6, bw = w + 6, bh = h + 9;
    dith(c, bx, bY, bw, 4, 'rgba(255,214,150,.28)', ph);                   /* 上 */
    dith(c, bx, bY + bh - 4, bw, 4, 'rgba(255,226,180,.20)', 1 - ph);      /* 下 */
    dith(c, bx, bY, 4, bh, 'rgba(255,214,150,.28)', 1 - ph);               /* 左 */
    dith(c, bx + bw - 4, bY, 4, bh, 'rgba(255,226,180,.20)', ph);          /* 右 */
    rect(c, bx, bY, bw, 1, P.copperLit);
    rect(c, bx, bY + bh - 1, bw, 1, P.copperDark);
    rect(c, bx, bY, 1, bh, P.copperLit);
    rect(c, bx + bw - 1, bY, 1, bh, P.copperDark);
    rect(c, bx + 1, bY + 1, 2, 1, 'rgba(255,246,214,.55)');
    var pl = cell.plate || plateBox(x, by, w);                             /* 铜牌（只刻格号那块）再亮一档 */
    rect(c, pl.x - 1, pl.y - 1, pl.w + 2, 1, P.copperLit);
    rect(c, pl.x - 1, pl.y + pl.h, pl.w + 2, 1, P.copperDark);
    rect(c, pl.x - 1, pl.y, 1, pl.h, P.copperLit);
    rect(c, pl.x + pl.w, pl.y, 1, pl.h, P.copperDark);
    var ax = pl.x + R(pl.w / 2) - 2, ay = pl.y - 6;                        /* 牌上一枚小尖：指"这一格" */
    rect(c, ax, ay + 2, 4, 1, P.copperLit);
    rect(c, ax + 1, ay + 1, 2, 1, P.copperLit);
    rect(c, ax + 1, ay, 2, 1, 'rgba(255,246,214,.80)');
  }
  /* 账房那处点位前的一只矮凳 —— 认领了引擎的占位方块，就得自己画一只有体的东西 */
  function accountStool(c, px, py, P) {
    var x = R(px) - 12, y = R(py) + 2;
    rect(c, x + 1, y + 11, 22, 2, 'rgba(0,0,0,.34)');
    dith(c, x, y + 12, 24, 3, 'rgba(0,0,0,.20)', 1);
    rect(c, x + 2, y + 10, 3, 6, P.woodDark);
    rect(c, x + 19, y + 10, 3, 6, P.woodDark);
    rect(c, x, y + 4, 24, 6, P.woodLit);
    rect(c, x, y + 4, 24, 1, mixOf(P.woodLit, '#ffffff', 0.18));
    rect(c, x, y + 9, 24, 1, P.woodDark);
    rect(c, x + 1, y + 4, 1, 6, P.woodDeep);
    rect(c, x + 22, y + 4, 1, 6, P.woodDeep);
  }
  /* 引擎那行的对接面（中枢待落的一行）：认领 = "这一格我自己画，别盖占位方块"。
     不认领 ⇒ 引擎照旧画 v43 那块暗底金框的方块（一章那些点还是它的）。 */
  function paintSpot(c, p, px, py, col, lit) {
    if (!p) return false;
    var id = String(p.id);
    spotSeen++;                                             /* 引擎那行一落，补丁层就退休 */
    if (id.indexOf('ch2_jar_') === 0) return true;          /* 罐子在架子那层画过了，这里只负责"别盖" */
    if (id === 'ch2_vault_store') { accountStool(c, px, py, palOf()); return true; }
    /* 库里每个点都有真画（scenes.js 里 ch2_back 已改名 ch2_vault_exit，另加了一道后门 ch2_vaultdoor_back） */
    if (id === 'ch2_door' || id === 'ch2_vault_exit' || id === 'ch2_vaultdoor_back'
      || id === 'ch2_back' || id === 'ch2_shelf' || id === 'ch2_tickets') return isVault(lastScene);
    /* 前厅（柜台）：开秤点 / 待上架 / 当票架 / 店里的活口 —— 都有真画，别盖方块 */
    if (id.indexOf('ch2_shop_') === 0) return isShop(lastScene);
    /* 账房那 9 个点也有真画（8 件实物 + 掌柜） */
    if (id.indexOf('ch2_back_') === 0) return isBack(lastScene);
    return false;
  }
  /* 每帧那薄薄一层（只有库房画） */
  var lastScene = null, bakedSig = 'none', lastKick = 0, kickTries = 0, bakeId = 0, spotSeen = 0;
  var ovN = 0, ovSkip = '';
  function overlay(c, tx, ty) {
    ovN++;
    var vault = isVault(lastScene), back = isBack(lastScene), shop = isShop(lastScene);
    if (!vault && !back && !shop) { ovSkip = 'scene:' + (lastScene && lastScene.id); return; }
    var L = layerFor();                                       /* 方块盖在点位上：每帧把这层贴回去 */
    if (L && c.drawImage) c.drawImage(L, 0, 0, VW, VH);
    /* 只有库房这层还兼画"靠近高亮"；另外两间只负责盖方块 */
    if (!vault) { ovSkip = (back ? 'back' : 'shop') + ':只盖方块'; return; }
    var sig = sealedSig();
    if (sig !== bakedSig) {                                 /* 账变了：喊一次重烘，下一帧底图就是新的 */
      if (Date.now() - lastKick > 200 && kickTries < 6) {
        lastKick = Date.now(); kickTries++;
        rebake();
      }
      return;
    }
    kickTries = 0;
    /* 走近那道出库房的门（门在格 10..11 的西墙上）：门框整圈亮一档。
       **每帧补画**，烘好的底图里没有这层 —— 玩家一走近就"亮起来"，走开就没了。 */
    if (tx <= 2 && ty >= 9 && ty <= 13) doorSprite(c, 0, 480, { side: 'right', emblem: 'jar', lit: true });
    var hit = highlightAt(tx, ty);
    if (!hit) return;
    var G2 = global.GAME23, t = (G2 && G2.S && G2.S.t) || 0;
    paintHighlight(c, hit, palOf(), Math.floor(t * 2) % 2);
  }
  function rebake() {
    try {
      var G = global.GAME23;
      if (G && G.QUALITY && G.QUALITY.setup) { G.QUALITY.setup(); return true; }
    } catch (e) {}
    return false;
  }
  /* ---------- 占位方块那条：引擎的 drawCh2Spot 画在罐子之上 ----------
     game23.js:3528 那支 `else if (p.ch2)` 分支在 bake 里排在 places 那一趟（**架子之后**）：
     26 个逐格点一挂上，26 只罐就被 26 块暗底金框方块盖住（实拍 tools/evidence/jar-02-*）。
     引擎那行归中枢（我这边把 CH2_ART.paintSpot 备好了，见下）；在它落下来之前，
     每烘一次我就把 **26 只罐本身**重画一遍盖回去 —— 只画罐子那 34×36，别处一个像素不碰。
     重画的这层在引擎那层环境色**之上**，所以按同一套参数把环境补一遍（逐行，精确到 1px）。 */
  function parseRGBA(s) {
    var m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(String(s));
    return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : null;
  }
  function ambOfNow() {
    try {
      var G = global.GAME23;
      if (G && G.QUALITY && G.QUALITY.ambOf && lastScene) return G.QUALITY.ambOf(lastScene);
    } catch (e) {}
    return null;
  }
  /* ---------- 把引擎的占位方块盖回去 ----------
     bake 的顺序是 paintGround（paintRoom：整间房 + 26 只罐）→ paintSolids → portals → places，
     而 `drawPlace` 会给**每个 `p.ch2` 点**画一块占位方块（game23.js:3488 drawCh2Spot，
     函数头上写着"美术线接手后换画"）⇒ 库里 31 个点每个都顶着一块金框方块，
     正压在我画的 26 只罐 / 三份当票 / 货架 / 账桌 / 那道矮门上（实拍 jar-01 一眼五个）。
     引擎那一行归中枢（我这边 `paintSpot` 已经把接口备好、也随时能接）：一旦它调过
     `paintSpot`（`spotSeen > 0`），这层就**自动退休**，不再插手。
     在那之前：把 31 块脚印**并成一个裁剪区**、照着原样重画一遍整间房（同一个 paintRoom、
     同一批种子 ⇒ 逐像素跟底图一样，没有补丁边），再补上引擎压在底图上的那几笔光。
     这层每帧只 blit 一次（底图每帧都会重贴一遍，所以不是"每烘一次补一次"）。 */
  function coverRegions() {
    var out = [], seen = {}, i, ps = (lastScene && lastScene.places) || [], p2;
    function add(tx, ty) {
      var key = tx + ',' + ty;
      if (seen[key]) return;
      seen[key] = 1;
      out.push({ x: tx * CELL + 7, y: ty * CELL + 10, w: 34, h: 28, tx: tx, ty: ty });
    }
    /* 方块 = 以格心为中心 30×24 + 2px 描边 + 1px 余量 */
    for (i = 0; i < ps.length; i++) { p2 = ps[i]; if (p2 && p2.ch2) add(p2.x, p2.y); }
    if (isVault(lastScene)) for (i = 0; i < CELLS.length; i++) add(CELLS[i].tx, CELLS[i].ty);
    return out;
  }
  /* 引擎点在自己脚下那盏灯（game23.js:3647-3654：格心为圆心、半径 64、rgba(warm,.16)、叠加混合） */
  function litCenters() {
    var out = [], ps = (lastScene && lastScene.places) || [], i, p2;
    for (i = 0; i < ps.length; i++) {
      p2 = ps[i];
      if (!p2 || !p2.ch2 || p2.kind === 'look' || p2.kind === 'portal' || p2.npc) continue;
      out.push([p2.x * CELL + CELL / 2, p2.y * CELL + CELL / 2]);
    }
    return out;
  }
  function layerShade(c, box, amb, lights) {
    if (!amb) return;
    var x = box.x, w = box.w, y, i, k, lv, a, d;
    for (y = box.y; y < box.y + box.h; y++) {                 /* ① 环境渐变（1px 一行，同引擎那条线） */
      var f = y / VH;
      rect(c, x, y, w, 1, 'rgba(' + R(amb.t0[0] + (amb.b0[0] - amb.t0[0]) * f) + ','
        + R(amb.t0[1] + (amb.b0[1] - amb.t0[1]) * f) + ',' + R(amb.t0[2] + (amb.b0[2] - amb.t0[2]) * f)
        + ',' + (amb.t0[3] + (amb.b0[3] - amb.t0[3]) * f).toFixed(3) + ')');
    }
    if (amb.tn && amb.tn[3] > 0) rect(c, x, box.y, w, box.h, 'rgba(' + R(amb.tn[0]) + ',' + R(amb.tn[1]) + ',' + R(amb.tn[2]) + ',' + amb.tn[3] + ')');
    /* ② 暗角（r0=VH*0.4 → r1=VW*0.74，到 r1 是 .30）：逐行按行心的距离取那一档 */
    var vx = x + w / 2, r0 = VH * 0.40, r1 = VW * 0.74;
    for (y = box.y; y < box.y + box.h; y++) {
      d = Math.sqrt((vx - VW / 2) * (vx - VW / 2) + (y - VH / 2) * (y - VH / 2));
      var va = 0.30 * Math.min(1, Math.max(0, (d - r0) / (r1 - r0)));
      if (va > 0.004) rect(c, x, y, w, 1, 'rgba(0,0,0,' + va.toFixed(3) + ')');
    }
    /* ③ 灯（叠加混合）。一行一个矩形、**不叠**：透明底上 lighter 会把整色存下来、alpha 累加，
       两三个矩形叠一起就是不透明白（自审抓到的那条白带就是这么来的）。
       横向只有 ±17px 偏移（格距 48），场值差不到一档 ⇒ 每行取格心那一档就够。 */
    if (!lights.length) return;
    var warm = parseRGBA('rgba(' + String(amb.warm) + ',1)');
    if (!warm) return;
    var cx2 = x + w / 2;
    if (c.save && c.globalCompositeOperation !== undefined) c.save();
    if (c.globalCompositeOperation !== undefined) c.globalCompositeOperation = 'lighter';
    for (y = box.y; y < box.y + box.h; y++) {
      a = 0;
      for (k = 0; k < lights.length; k++) {
        var dx = lights[k][0] - cx2, dy = lights[k][1] - y, dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < 64) a += 0.16 * (1 - dd / 64);
      }
      lv = Math.min(5, Math.round(a / 0.04));
      if (lv > 0) rect(c, x, y, w, 1, 'rgba(' + R(warm[0]) + ',' + R(warm[1]) + ',' + R(warm[2]) + ',' + (lv * 0.04).toFixed(2) + ')');
    }
    if (c.restore) c.restore();
  }
  function ambNow() {
    var amb = ambOfNow();
    if (!amb) return null;
    var t0 = parseRGBA(amb.top), b0 = parseRGBA(amb.bot), tn = parseRGBA(amb.tint);
    if (!t0 || !b0) return null;
    return { t0: t0, b0: b0, tn: tn, warm: amb.warm };
  }
  var LAYER = null, LAYER_KEY = null;
  function layerFor() {
    if (spotSeen) return null;                                /* 引擎那行落了 ⇒ 这层退休 */
    var key = bakeId + '|' + sealedSig() + '|' + ((lastScene && lastScene.id) || '');
    if (LAYER && LAYER_KEY === key) return LAYER;
    if (!LAYER && global.document && global.document.createElement) LAYER = global.document.createElement('canvas');
    if (!LAYER) return null;
    LAYER.width = VW; LAYER.height = VH;
    var c = LAYER.getContext ? LAYER.getContext('2d') : null;
    if (!c || !c.clearRect) return null;
    c.clearRect(0, 0, VW, VH);
    var regs = coverRegions(), amb = ambNow(), lights = litCenters(), i, pal0 = (lastScene && lastScene.palette) || null;
    if (!regs.length) return null;
    /* 31 块脚印并成一个裁剪区，整间房照着原样重画一遍 —— 只落在这些块上 */
    if (c.save && c.beginPath && c.clip) {
      c.save();
      c.beginPath();
      for (i = 0; i < regs.length; i++) c.rect(regs[i].x, regs[i].y, regs[i].w, regs[i].h);
      c.clip();
      if (isBack(lastScene)) {
        /* 账房这张图：地面（paintBackFloor = 一章当铺原件换色）→ 房间（paintBackRoom = 原件 + 我这层陈设）。
           实测这间 9 个 ch2 点每个都顶着引擎的金框方块，把我刚画的 8 件实物和西墙那道门全压住了
           （实拍 jar-20 那四格：方块正压在算赎价/担保链/账桌/算盘上）。 */
        paintBackFloor(c, lastScene, pal0);
        paintBackRoom(c, lastScene, pal0);
        npcArt(c, lastScene);                      /* 房间重放不含人 ⇒ 祁掌柜得自己补回来 */
      } else if (isShop(lastScene)) {
        paintShopFloor(c, lastScene, pal0);
        paintShopRoom(c, lastScene, pal0);
        npcArt(c, lastScene);
      } else {
        /* 照 bake 的顺序把这一块重放一遍：地面（paintFloor，不透底的底子）→ 房间（paintRoom）。
           只重放 paintRoom 是不行的 —— 墙砖/地砖的底子在 paintFloor 那层，缺了它方块会透出来。 */
        paintFloor(c, lastScene, pal0);
        paintRoom(c, lastScene, pal0);
      }
      c.restore();
    }
    for (i = 0; i < regs.length; i++) layerShade(c, regs[i], amb, lights);
    LAYER_KEY = key;
    return LAYER;
  }

  function isVault(sc) { return !!sc && sc.id === V; }
  function paintGroundFor(c, sc, pal) {
    if (isVault(sc)) return paintFloor(c, sc, pal);
    if (isBack(sc)) return paintBackFloor(c, sc, pal);
    if (isShop(sc)) return paintShopFloor(c, sc, pal);
    return null;
  }
  function paintSolidsFor(c, sc, pal) {
    if (isVault(sc)) return paintRoom(c, sc, pal);
    if (isBack(sc)) return paintBackRoom(c, sc, pal);
    if (isShop(sc)) return paintShopRoom(c, sc, pal);
    return null;
  }
  function install() {
    var A = global.ART31;
    if (!A || !A.paintGround || !A.paintSolids || !A.paintFigure) return false;
    if (A.__ch2vaultArt) return true;
    var g0 = A.paintGround, s0 = A.paintSolids, f0 = A.paintFigure;   /* 原件只用来"转交"，不重放 */
    A.paintGround = function (c, sc, pal) {
      if (isCh2(sc)) lastScene = sc;
      if (isVault(sc)) return paintFloor(c, sc, pal);
      if (isBack(sc)) return paintBackFloor(c, sc, pal);
      if (isShop(sc)) return paintShopFloor(c, sc, pal);
      return g0.apply(this, arguments);            /* 一章自己的场：一个字节不掺 */
    };
    A.paintSolids = function (c, sc, pal) {
      var r;
      if (isVault(sc)) r = paintRoom(c, sc, pal);
      else if (isBack(sc)) r = paintBackRoom(c, sc, pal);
      else if (isShop(sc)) r = paintShopRoom(c, sc, pal);
      else return s0.apply(this, arguments);       /* 一章自己的场：一个字节不掺 */
      lastScene = sc || null;                               /* 每帧那层要知道"在哪个 ch2 场" */
      bakedSig = isVault(sc) ? sealedSig() : 'none';        /* 这一版底图用的是什么空满 */
      bakeId++;                                             /* 底图换代：那层要跟着补画罐子 */
      return r;
    };
    /* 每帧一次：引擎画玩家时顺路把"靠近高亮"补上（game23.js:3741 那一句） */
    A.paintFigure = function (c, id, x, y, face, mv, t) {
      /* 只接 ch2 的三个场：一章的人一章自己画，我们连笔都不落。
         引擎画带身份的 NPC 时把**点位 id**当立绘 id 传过来（game23.js:3513）——
         这里按点位表把 id 换回真正的立绘 id（祁掌柜 = keeper），否则就没这个人。 */
      var sc = lastScene;
      if (!isCh2(sc)) return f0.apply(this, arguments);
      var fig = id, ps, qi;
      if (id && String(id).indexOf('ch2_') === 0) {
        ps = sc.places || [];
        for (qi = 0; qi < ps.length; qi++) {
          if (ps[qi].id === id && ps[qi].npc) { fig = ps[qi].npc; break; }
        }
      }
      var r = figOwn(c, fig, x, y, face, mv, t);
      if (fig === 'you') overlay(c, x, y);   /* 兜底层：三间房的占位方块都靠它盖（高亮只在库房，overlay 里自己分） */
      return r;
    };
    A.__ch2vaultArt = 1;
    A.__ch2vaultFigure = 1;
    return true;
  }
  var ok = install();

  global.CH2_ART = {
    VAULT: V, install: install, installed: function () { return !!(global.ART31 && global.ART31.__ch2vaultArt); },
    paintFloor: paintFloor, paintRoom: paintRoom, jar: jar, palette: palOf,
    SHOP: SHOP_ID, SHOP_IDS: SHOP_IDS.slice(), shopAnchor: SHOP, shopPal: shopPal,
    /* 柜台那张图的**占位色块 + 尺寸**（给记忆玩法直接抄去建场景用；不含任何画法）：
       W/H 是整张图的逻辑像素，counter 是柜台那块占位方块的像素矩形与配色。 */
    counterSpec: function () {
      var P = shopPal({ palette: {} }, {});
      return {
        imageId: 'ch2_counter', alias: ['ch2_shop'],
        scene: { w: 20, h: 14, cell: CELL, px: VW, py: VH },
        counter: { x: SHOP.counter.x, y: SHOP.counter.y, w: SHOP.counter.w, h: SHOP.counter.h,
                   tx: SHOP.counter.tx, ty: SHOP.counter.ty, tw: SHOP.counter.tw, th: SHOP.counter.th },
        farDoor: { x: SHOP.farDoor.x, y: SHOP.farDoor.y, w: SHOP.farDoor.w, h: SHOP.farDoor.h },
        shelf: { x: SHOP.shelf.x, y: SHOP.shelf.y, w: SHOP.shelf.w, h: SHOP.shelf.h },
        tickets: { x: SHOP.tickets.x, y: SHOP.tickets.y, w: SHOP.tickets.w, h: SHOP.tickets.h },
        guests: SHOP.guests.map(function (g) { return { tx: g.tx, ty: g.ty }; }),
        palette: {
          counterTop: P.counterLit, counterTopHi: P.counterHi, counterFront: P.counter,
          counterDeep: P.counterDeep, copper: P.copper, brassHi: P.brassLit,
          floor: P.floorBase, floorLit: P.floorLit, wall: P.wallBase, rug: '#93392c'
        }
      };
    },
    paintShopFloor: paintShopFloor, paintShopRoom: paintShopRoom,
    BACK: BACK_ID, paintBackFloor: paintBackFloor, paintBackRoom: paintBackRoom,
    fig: figOwn, FIG: CH2_FIG,
    /* 两扇门（新单）：贴图画法 + 规格 + 墙面色板，生成器 tools/gen-door-sprites.mjs 直接调 */
    doorSprite: doorSprite, DOOR_SPEC: DOOR_SPEC, doorWallPal: doorWallPal,
    WAX: WAX, FONT: FONT, VW: VW, VH: VH, CELL: CELL,
    BACK: BACK_ID, paletteBack: BACK_PAL,
    lowDoorTile: { tx: LOW_DOOR.tx, ty: LOW_DOOR.ty },
    /* 判据的负对照开关：关掉 lowDoor 再画一遍，那条"门在那格上"的判据必须变红 ——
       证明判据逮的是门本身，不是随便一片深色地板 */
    skipLowDoor: function (v) { SKIP_LOWDOOR = !!v; return SKIP_LOWDOOR; },
    skipBackDoor: function (v) { SKIP_BACKDOOR = !!v; return SKIP_BACKDOOR; },
    backObjs: backObjs,
    drawNpcs: function (c) { return npcArt(c, lastScene); },   /* 判据用：这一间的人画在哪儿 */
    drawBackObjs: function (c) {                 /* 判据用：只画那 7 件实物，方便逐格记账 */
      var P = palBackOf({ palette: BACK_PAL }), i, o, fn;
      for (i = 0; i < BACK_OBJS.length; i++) {
        o = BACK_OBJS[i]; fn = OBJ_FN[o.art];
        if (fn) fn(c, o.tx * CELL, o.ty * CELL, P);
      }
      return BACK_OBJS.length;
    },
    palBack: function () { return palBackOf({ palette: BACK_PAL }); },
    cells: function () { return CELLS.slice(); },
    /* 逐格那一套（中枢 2026-10-17 追加单：每只罐都要有可交互的样子）： */
    jarRow: jarRow, cellState: cellStateMine, highlightAt: highlightAt, paintSpot: paintSpot,
    rebake: rebake,
    /* 自检面：底图用的空满 vs 账上现在的空满（判据用它判"画有没有跟上账"） */
    sig: function () { return { baked: bakedSig, live: sealedSig(), kicks: kickTries, scene: lastScene && lastScene.id, bakes: bakeId, ovN: ovN, ovSkip: ovSkip }; },
    layer: layerFor,
    regions: coverRegions,
    ROW: { tx0: 4, ty: [5, 8], n: 13, y0: [232, 376], h: 56, jw: 34, jh: 36, pitch: CELL },
    /* 两扇门的位置：判据拿它判"两间房的门在位置感上对不对得上"（vaultExit 在库房左墙、backDoor 在账房右墙） */
    doors: function () {
      var o = {}, k;
      for (k in DOORS) if (DOORS[k]) o[k] = { x: DOORS[k].x, y: DOORS[k].y, w: DOORS[k].w, h: DOORS[k].h };
      return o;
    },
    /* 我这几张图各自是怎么来的：reuse 恒为 null —— 一个都不再复用一章的资产（用户 2026-10-17 拍死） */
    rooms: function () {
      return {
        ch2_vault: { id: V, reuse: null, doors: { exit: DOORS.vaultExit, low: DOORS.lowDoor } },
        ch2_back: { id: BACK_ID, reuse: null, palette: BACK_PAL, doors: { in: DOORS.backDoor } },
        ch2_shop: { id: SHOP_ID, reuse: null, palette: shopPal({ palette: BACK_PAL }), doors: { back: DOORS.shopDoor } }
      };
    },
    /* 自检用：装载成功没 */
    loadedAt: ok
  };
})(typeof window !== 'undefined' ? window : globalThis);
