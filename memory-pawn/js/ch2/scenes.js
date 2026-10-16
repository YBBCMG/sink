/* 记忆当铺 · 第二章地图
   口径（中枢派单 §四）：**新场景 1 处 + 复用 2 处**，不重画地图，复用只挂新的可交互点。

   为什么新挂的点要算坐标而不是写死：一章的镇子 / 当铺 / 雾里三张图是别的线在改的，
   我写死的格子过两天就可能压在别人新加的墙上，或者更糟 —— **堵住一条老路**。
   所以这里在加载时自己算：从场景出生点做 BFS，挑一个
     ① 空着的格子（不是障碍、不是已有交互点/出口）
     ② **把它变成交互点以后，一张图里原有的每个交互点与每道出口仍然走得到**
     ③ 它自己旁边至少有一格站得下脚
   三条同时满足才落点。算不出落点时这个点就不挂（宁可少一个点，也不许挡路）。 */
(function (global) {
  'use strict';

  var VAULT = 'ch2_vault';

  /* ---------- 落点小工具（纯函数，测试可直接拿 D 跑） ---------- */
  /* 走得过去的格子：不是障碍就行 —— **出口那格例外**。
     引擎 tryMove() 是先认出口再认障碍的（game23.js:3773 在 3779 之前），所以压在墙里那格
     出口（灯台/镇子那些 x=0 的阶梯）玩家照样踏得上去。第一版没这条，BFS 一进不了出口格，
     `targets()` 就把所有出口漏光了，"不挡路"的检查等于没做。 */
  function passable(D, sid, x, y) {
    var sc = D.SCENES[sid];
    if (!sc) return false;
    if (x < 0 || y < 0 || x >= sc.w || y >= sc.h) return false;
    if (D.portalAt(sid, x, y)) return true;
    return !D.isSolidIn(sid, x, y);
  }
  /* 能放交互点的格子：走得过去，且不是出口（出口上不许压东西） */
  function isFree(D, sid, x, y) {
    var sc = D.SCENES[sid];
    if (!sc || !passable(D, sid, x, y)) return false;
    for (var i = 0; i < sc.portals.length; i++) if (sc.portals[i].x === x && sc.portals[i].y === y) return false;
    return true;
  }
  /* 从出生点能走到的所有格子 */
  function reach(D, sid) {
    var sc = D.SCENES[sid], out = {}, q = [[sc.spawn.x, sc.spawn.y]];
    out[sc.spawn.x + ',' + sc.spawn.y] = 1;
    while (q.length) {
      var c = q.shift(), dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var i = 0; i < 4; i++) {
        var nx = c[0] + dirs[i][0], ny = c[1] + dirs[i][1], k = nx + ',' + ny;
        if (out[k]) continue;
        if (!passable(D, sid, nx, ny)) continue;
        out[k] = 1; q.push([nx, ny]);
      }
    }
    return out;
  }
  /* 目标点/出口在 reach 里还够不够得着（交互点：站在它四邻差一格以内都算） */
  function okAt(D, sid, set, x, y) {
    return !!(set[(x - 1) + ',' + y] || set[(x + 1) + ',' + y] || set[x + ',' + (y - 1)] || set[x + ',' + (y + 1)]);
  }
  function targets(D, sid) {
    var sc = D.SCENES[sid], base = reach(D, sid), list = [];
    sc.places.forEach(function (p) { if (okAt(D, sid, base, p.x, p.y)) list.push({ kind: 'place', x: p.x, y: p.y, id: p.id }); });
    sc.portals.forEach(function (po) { if (base[po.x + ',' + po.y]) list.push({ kind: 'portal', x: po.x, y: po.y, id: 'portal' }); });
    return list;
  }
  /* 挑一个"加进去也不挡路"的格子：按离锚点的远近逐个试，第一个不被否掉的就是它 */
  function pickSpot(D, sid, ax, ay) {
    var sc = D.SCENES[sid];
    if (!sc) return null;
    var ts = targets(D, sid);
    var seen = {}, q = [[ax, ay]], order = [];
    seen[ax + ',' + ay] = 1;
    while (q.length && order.length < 400) {
      var c = q.shift();
      if (!(c[0] === ax && c[1] === ay)) order.push(c);
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var i = 0; i < 4; i++) {
        var nx = c[0] + dirs[i][0], ny = c[1] + dirs[i][1], k = nx + ',' + ny;
        if (seen[k] || !isFree(D, sid, nx, ny)) continue;
        seen[k] = 1; q.push([nx, ny]);
      }
    }
    for (var j = 0; j < order.length; j++) {
      var x = order[j][0], y = order[j][1];
      sc.places.push({ id: '__probe', name: '', x: x, y: y, kind: 'look' });
      var after = reach(D, sid);
      sc.places.pop();
      var good = true;
      for (var t = 0; t < ts.length && good; t++) {
        good = ts[t].kind === 'portal'
          ? !!after[ts[t].x + ',' + ts[t].y]                       /* 出口：那一格本身还得走得到 */
          : okAt(D, sid, after, ts[t].x, ts[t].y);                 /* 交互点：还得站得过去 */
      }
      if (good && okAt(D, sid, after, x, y)) return { x: x, y: y };
    }
    return null;
  }

  /* ---------- 库房（新场景） ---------- */
  /* 20×14 沿用一章网格；三排当票架子当障碍，一格 16px 的算法照旧交给引擎 */
  var VAULT_SCENE = {
    id: VAULT, name: '记忆库', sub: '当铺 · 里间',
    act: 6, w: 20, h: 14, spawn: { x: 3, y: 12 },
    palette: { ground: '#241d2b', ground2: '#2b2333', solid: '#120e17', accent: '#d9b46a', sky: '#0d0a12' },
    ambient: 'lamp',
    solids: [[0, 0, 20, 1], [0, 1, 1, 13], [19, 1, 1, 13], [0, 13, 20, 1],
             [4, 2, 12, 1], [4, 5, 12, 1], [4, 8, 12, 1], [16, 2, 2, 1], [2, 6, 1, 2]],
    places: [
      { id: 'ch2_shelf', name: '柜上留下的三样', x: 6, y: 11, kind: 'ch2', ch2: true, say: [
        '库房角上摆着三样东西，是上一任掌柜留下的：一块封蜡、一把空签、一杆小秤。',
        '（都是钥匙，不是补品。用得上哪样，你自己拿。）'
      ], again: ['（三样东西还在角上。拿过的两样留了印子。）'] },
      { id: 'ch2_tickets', name: '三份当票', x: 10, y: 11, kind: 'ch2', ch2: true, say: [
        '当票架上三份并排放着，日期同一天，笔迹三样。',
        '（一份写着灯灭了，一份写着灯亮着，一份把那个字洇成了一个方块。）'
      ], again: ['（三份当票还架在那儿。灯那一栏三样说法。）'] },
      { id: 'ch2_door', name: '库房的门', x: 16, y: 11, kind: 'ch2', ch2: true, say: [
        '库里还有一道门，比进来的那道矮。门上没有锁，只有一块空白的封泥。',
        '（门认掌柜的手 —— 认的不是掌纹，是你交出去过的东西。）'
      ], again: ['（封泥上留着一个印子。）'] },
      { id: 'ch2_back', name: '原路出去', x: 2, y: 10, kind: 'ch2', ch2: true, say: [
        '（进来的那道门还虚掩着，外间的算盘声听得见。）'
      ] },
      /* 账房那个点是 v48 补的：**画在柜台上的那批本来按不到 E**。落点规矩跟一章那些挂点一样 ——
         站在走得进、不挡路的格子上：(12,12) 是柜台前那一格（第 13 行就是柜台那条边），玩家站 (12,11) 面朝柜台。
         点的 id 用 **ch2_vault_store** —— D/B 线的 js/ch2/vault.js 包 CH2.open 时认的就是这个 id
         （那一单明文"scenes.js 一字节不碰"，入口由这层供给）：它装上后按 E 直接开 26 格账本；
         没装的时候就是下面这三句台词，一点副作用都没有。
         **26 格不逐格挂点**：架子横跨 x=4..15 只有 12 格宽，一排 13 只罐子 —— 一格一点塞不下；
         挂到过道（第 6/7 行）上又会把走道堵死（交互点所在格在引擎里算障碍，isSolidIn 把非 portal/look 的点都算墙）。
         所以逐格交互交给"账房点开账本再选格"（vault.js 里 ch2_jar_A..Z 那条分支，等架子加宽再挂）。 */
      { id: 'ch2_vault_store', name: '账房', x: 12, y: 12, kind: 'ch2', ch2: true, say: [
        '柜上一本账，一格格记着进出 —— 一格一段，架上同时最多二十六段。',
        '（罐子全库同款，铜牌上刻着格号 A 到 Z，封条的颜色只跟入库批次走。哪一格是谁，得你自己记。）',
        '（卖出、赎回、断当，都把那一格腾出来；腾出来的格子照样刻着原来的格号。）'
      ], again: ['（账面上进出两栏都还空着。）'] },
    ],
    portals: []
  };

  /* ---------- 往一章三张图里各挂一个点（复用，不重画） ---------- */
  var HOOKS = [
    { sid: 'pawnshop', id: 'ch2_vaultdoor', name: '里间 · 那排架子', need: 'back_ok', say: [
        '里间那道门开着 —— 门后面是一排排当票架子，一格一段记，一直排到看不见的地方。',
        '（上一任掌柜的库房。你现在是掌柜，库房自然是你的。）'
      ], again: ['（架子在最里头等着。）'] },
    { sid: 'town', id: 'ch2_backalley', name: '后门夜路', need: 'back_ok', say: [
        '当铺的后门开在一条背街上。夜里没人走这条路 —— 走这条路的都不想让灯照着。',
        '（墙根有脚印，新旧叠着，一直往码头去。）'
      ], again: ['（脚印还是往码头去。）'] },
    { sid: 'mist', id: 'ch2_fog', name: '码头雾里', need: 'back_ok', say: [
        '码头上的雾是有分量的。它吃字 —— 你张嘴说话，它把话咽下去。',
        '（要过去，得喂它一段记。）'
      ], again: ['（雾让开过半步，现在又合上了。）'] }
  ];

  function install(D) {
    var report = { vault: VAULT, hooks: [], skipped: [] };
    if (!D || !D.SCENES) return report;
    if (!D.SCENES[VAULT]) D.SCENES[VAULT] = VAULT_SCENE;
    HOOKS.forEach(function (h) {
      var sc = D.SCENES[h.sid];
      if (!sc) { report.skipped.push(h.sid + '.' + h.id + '（场景不在）'); return; }
      var has = sc.places.some(function (p) { return p.id === h.id; });
      if (has) { report.hooks.push(h.sid + '.' + h.id); return; }          /* 幂等：加载两次不加两个点 */
      var spot = pickSpot(D, h.sid, sc.spawn.x, sc.spawn.y);
      if (!spot) { report.skipped.push(h.sid + '.' + h.id + '（找不到不挡路的落点）'); return; }
      sc.places.push({ id: h.id, name: h.name, x: spot.x, y: spot.y, kind: 'ch2', ch2: true, need: h.need, say: h.say, again: h.again });
      report.hooks.push(h.sid + '.' + h.id + '@' + spot.x + ',' + spot.y);
    });
    return report;
  }

  global.CH2_SCENES = { install: install, VAULT: VAULT, HOOKS: HOOKS, pickSpot: pickSpot, isFree: isFree, passable: passable, reach: reach, targets: targets };
})(typeof window !== 'undefined' ? window : globalThis);
