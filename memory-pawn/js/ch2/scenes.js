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
  /* S3 那间房的 id：**必须在这里先写**（VAR 提升只提升声明、不提升赋值）——
     库房那扇去账房的门（VAULT_SCENE.places 里那条，位置在本行下面）要用它当 `to`。
     第一版把 `var BACK` 写在账房那一段（下面三百行处），门先生成、BACK 还是 undefined
     ⇒ `to: undefined` 当场被 JSON/引擎当"没有去向"丢掉，门就成了一块只会说话的招牌。
     **判据 B3-a 逮的就是这一条**（"那扇门的去向：undefined"）。 */
  var BACK = 'ch2_back';
  var SHOP = 'ch2_shop';        /* 柜台 · 前厅：二章自己的接待场（不是一章当铺那张图） */

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

  /* ---------- 26 个逐格交互点（2026-10-17 用户点单） ----------
     用户原话：「而且这个它不真实，应该是做成走到我们这个罐子面前，然后对罐子交互，然后才能对这个罐子进行操作。」
     ⇒ 架子上的**每一只罐子自己是一个点**，玩家得站到它面前按 E。

     坐标（中枢 2026-10-17 钉死，不是我自己挑的）：A–M 在 (4+i, 5)、N–Z 在 (4+i, 8)，i=0..12 ⇒ x=4..16。
     **为什么这样摆得通、还不用改引擎**（引擎的 nearestPlace 在 game23.js:1242-1250）：
     它是"曼哈顿距离 ≤1 且最小者胜"。玩家站罐子**正下方**那一格 ——
       · 站 (x,6)：正上方 (x,5) 那只 d=1；左右两只 d=2；下一排 (x,8) 更远 ⇒ **只认那一只**；
       · 站 (x,7)：正下方 (x,8) 那只 d=1，上排的 d=2 ⇒ 只认下排那一只。
     ⇒ "站到哪只面前就只认那只"，不用朝向、不用按 id 找点。

     这两排**不走 solids**：点是 ch2 kind，引擎自己就把该格算成墙（story23.js:1414-1424）
     —— 罐子本来就长在架子上，架子本来就是墙。所以这里一条 solids 都不用加。
     两排架子 solids 仍照中枢派的从 12 格扩到 13 格（[4,5,13,1] / [4,8,13,1]），跟画那头的
     13 格（x=4..16）对齐；第 6/7 行走道一格不占，玩家从下面那排走到头就行。

     ⚠️ 别把 jarPoints() 挪回 VAULT_SCENE.places 字面量里：这张表是**数出来的**，
     账本那面（vault.js 的 cells()）与画那面（art.js 的 jarRow）都按同一套算法摆格，
     写成 26 行常量以后三处一改就散。 */
  var ROW_N = 13, JAR_ROWS = [5, 8];
  var LETTERS26 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  function jarPoints() {
    var out = [];
    for (var r = 0; r < JAR_ROWS.length; r++) {
      for (var i = 0; i < ROW_N; i++) {
        var k = r * ROW_N + i;
        out.push({
          id: "ch2_jar_" + LETTERS26[k], name: LETTERS26[k] + " 格", x: 4 + i, y: JAR_ROWS[r],
          kind: "ch2", ch2: true,
          say: ["（" + LETTERS26[k] + " 格的罐子。铜牌上只有格号。）"],
          again: ["（" + LETTERS26[k] + " 格。铜牌凉着。）"]
        });
      }
    }
    return out;
  }
  /* 把 26 个点挂进库房场景：幂等（挂两次不会变 52 个），缺哪个补哪个。 */
  function mountJars(sc) {
    if (!sc || !sc.places) return 0;
    var have = {};
    sc.places.forEach(function (p) { have[p.id] = 1; });
    var n = 0;
    jarPoints().forEach(function (p) { if (!have[p.id]) { sc.places.push(p); n++; } });
    return n;
  }
  /* ---------- 库房（新场景） ---------- */
  /* 20×14 沿用一章网格；三排当票架子当障碍，一格 16px 的算法照旧交给引擎 */
  var VAULT_SCENE = {
    id: VAULT, name: '记忆库', sub: '当铺 · 里间',
    act: 6, w: 20, h: 14, spawn: { x: 3, y: 12 },
    palette: { ground: '#241d2b', ground2: '#2b2333', solid: '#120e17', accent: '#d9b46a', sky: '#0d0a12' },
    ambient: 'lamp',
    solids: [[0, 0, 20, 1], [0, 1, 1, 13], [19, 1, 1, 13], [0, 13, 20, 1],
             [4, 2, 12, 1], [4, 5, 13, 1], [4, 8, 13, 1], [16, 2, 2, 1], [2, 6, 1, 2]],
    places: [
      /* 2026-10-17 用户第 2 遍（指着线上截图，原话照抄）：
           「这两个东西还留着交互，把这两个能交互的功能也关了」
           「这玩意就是这个地图本来就用来放记忆的」
         ⇒ 这张图上最后两个"散点"也整点删了（不是改成没台词的死点 —— 死点会挡住那一格，
           玩家照样按得到、只是不出话，比留着更糊涂）：
             · `ch2_shelf`（柜上留下的三样，原 (6,11) —— 取四件道具的那张面板）
             · `ch2_vault_exit`（出库房 · 回主界面，原 (2,10)）
        现在这张图**只剩 26 只罐**（下面 mountJars 装的，各归各格、一格不动），
        离场只靠顶栏那颗「主界面」按钮（game23.js:4607 → showHome）。
        ⚠️ 三件事别改回去：① 26 只罐一格都不许动（用户要的就是"走到罐子面前交互"）；
           ② 别把"柜上三样"加回来 —— 道具随之退役（js/ch2/items.js 现在是墓碑）；
           ③ 库房里**不再有任何按 E 的常设点**，26 只罐之外一个都不许有。 */
    ],
    /* 2026-10-17 中枢派单（用户第 2 遍追问「新地图怎么进、在哪进」）：
       库房东墙那道矮门 —— **(16,11)**，art.js 的 `LOW_DOOR`（js/ch2/art.js:225）就画在这一格 ——
       挂成 **portal** → 账房 ch2_back。门画在哪一格、路就开在哪一格，两件事必须是同一件事。
       为什么走 portal 而不是"按 E 的门"：portal 是"走上去就换场景"那一路（引擎 game23.js:3899-3903
       tryMove 里认 `D.portalAt`），玩家一脚踩上去就进；而且它**不占 places** ⇒
       库房里能按 E 的点仍然只有 26 只罐（用户这单要的就是这个数）。
       ⚠️ 别把它塞回 `places`：引擎把"非 look/portal/jobs 的点"所在格算成障碍（story23.js:1408），
          塞成 place 会让这一格变成墙，或者变成一扇只能说话、走不过去的假门。
       ⚠️ 也别加第二条 —— 库房 ⇄ 账房 之间**只此一道**（往返各一道，见账房那头的 (1,10)）。 */
    portals: [
      { x: 16, y: 11, to: BACK, tx: 2, ty: 11, label: '进账房 · 里间' }
    ]
  };

  /* ============================================================
     S3 账房 · 里间（`ch2_back`）—— 2026-10-17 中枢派单 · 用户亲口点单
     「那你把后面再做一下吧。再做一个地图就可以了，做完之后让美术来做。」

     一、**id 的裁定（中枢派单第 1 条：撞名先拆 id）**：这个房间的 id 就是 `ch2_back`，
        **两个字都不是我自己挑的**：
          · 剧情线 `tools/剧情-二章-设计.md:157` —— S3 = `ch2_back` · 账房 · 里间 · 新建 9 点；
          · 美术线 `js/ch2/art.js:151` `BACK_ID = 'ch2_back'`，那间房的底色 / 梁上账册 /
            右墙那道门（`backLayer`）**全部按这个 id 画好了**，我改 id 等于把它画好的东西挂空。
        所以拆的是**库房那一头**：库房原来那个同名的出口点 `ch2_back` 改叫 `ch2_vault_exit`，
        房间拿回 `ch2_back` 这个名字（老名字在 js/ch2/index.js 里留了别名，老判据/老存档不受影响）。

     二、**9 个点位怎么算出来的**（判据 B1-b 逐条钉）：
        剧情线口径那一行给的是「算赎价 / 担保链 / 查旧票 / 翻访客簿 / 写总号回函」＋ 房间里镇场的
        祁掌柜（`剧情-二章-设计.md:143`：「S3 账房 · 里间 —— 每条客人线的中段」）＝ 8 个房内点；
        第 9 个是**出口**（回库房），照库房那张表的先例（出口本身也占一格点位）。
        "查旧票"在这一间里落成 **旧票箱**、"翻访客簿"落成 **访客簿**；剩下四件（算赎价 / 担保链 /
        账桌 / 算盘）照剧情线那句"算盘和旧票堆到梁上"摆 —— 8 + 出口 = 9。

     三、**为什么块表（solids）要在装载时从当铺拷一份**：这间房走的是美术线的
        "一章当铺那套素材原样调用、只换 palette"（`art.js:966-974` 的 `shopView`）。
        拷一份而不是写常量：哪天剧情/美术把当铺的块位动了（当铺正被别的线改），
        这间房跟着动，不会留下一份对不上的老坐标。拷不到就退回我这份常量（常量本身也是照抄当铺那 6 块）。
     四、**门：一道，回库房**（(1,10)，跟库房 (16,11) 那道矮门对开）。中枢 2026-10-17 口径澄清：
       用户那句「彻底隔开、不要有出去和进来的方法」说的是**一章 ⇄ 二章**；
       二章内部库房 ⇄ 账房 是要通着的，所以这道门加回来了（做成 portal，不占 places）。
       这间房没有通往外部的路：不挂主界面、不挂一章当铺、不挂剧情门 —— 进出都还在二章里。
       8 个房内点是硬口径（S3 = 新建 9 点 − 出口那一点）。 */
  var BACK_SOLIDS_FALLBACK = [[5, 3, 11, 2], [2, 2, 3, 2], [15, 2, 3, 2], [0, 0, 1, 14], [19, 0, 1, 14], [0, 0, 20, 1]];
  /* 配色照抄 art.js:152 的 BACK_PAL —— 那间房的地面/墙是美术线按这个色画好的，
     我这里再写一遍是**兜底**（场景对象的 palette 引擎也要用），改一个色得两边一起改。 */
  var BACK_PALETTE = { ground: '#2b2130', ground2: '#33263a', solid: '#141019', accent: '#cfa95f', sky: '#0a0810' };
  var BACK_SCENE = {
    id: BACK, name: '账房', sub: '当铺 · 里间',
    act: 6, w: 20, h: 14, spawn: { x: 3, y: 12 },
    palette: BACK_PALETTE, ambient: 'lamp',
    solids: BACK_SOLIDS_FALLBACK.slice(),
    places: [
      /* ---- ① 门：西墙 (1,10) 那道门回库房（2026-10-17 中枢口径澄清后加回来的）----
         用户第 4 遍那句「这两张彻底隔开，不要有出去和进来的方法」说的是**一章 ⇄ 二章**；
         二章内部（库房 ⇄ 账房）是**要连着**的 —— 中枢原话：
         「边界澄清：用户那条…指的是**一章当铺 ↔ 二章**；二章内部库房↔账房可以连着，照这条执行。」
         这条门做成 **portal**（挂在下面的 `portals` 里，不占 places）：走上去就回库房，
         跟库房那头 (16,11) 那道矮门对开，两间房之间**恰好一道门、往返一条路**。
         落点 (15,12) 是库房里紧挨着那道矮门的空地（走回来正好站在门边上，不用横穿整间屋子）。 */
      /* ---- ②–⑨ 房内 8 件（S3 口径那五件事 + 这间房的陈设）----
         **摆位不是随手挑的**（判据 B4-c 会替我把关）：这间房复用当铺的块表，
         柜台横在 y=3..4（x=5..15），所以能站人的地方是 y≥5 那半张 + 两侧墙根。
         · 掌柜那把椅子摆 **(16,11)** —— 柜台右边那一格；玩家站它正下方 (16,12) 就够得着，
           底下那半张图（y=12..13）全是空的，怎么绕都到得了。
         · **跟人对账的四件**（赎价 / 担保链 / 对账簿 / 算盘）摆在同一条 **y=10** 上，
           x=15..18 挨着柜台那面 —— 玩家站在 (x,11) 那一排，正上方就是它们，一件不串台。
         · 剩下三件（账桌 / 来访簿 / 回函）摆在 y=12 那条案上 + 东边墙根的旧票箱。 */
      { id: 'ch2_back_keeper', name: '祁掌柜', x: 16, y: 11, kind: 'ch2', ch2: true, npc: 'keeper', say: [
        '祁掌柜把算盘推到一边，抬头看你一眼：「你来得正好。」',
        '「账房这间，白天归你，夜里归我。算不平的账，摆到这张桌子上就是。」'
      ], again: ['（祁掌柜低头拨算盘。珠子响一阵，停一阵。）'] },
      { id: 'ch2_back_redeem', name: '算赎价', x: 15, y: 10, kind: 'ch2', ch2: true, say: [
        '赎价那本摊在掌柜左手边：一行一件逾期件，一行写着"当金 × 天数"。',
        '（三件压在手里，先还谁的，今天就得定。）'
      ], again: ['（赎价那本还摊着。数字一行都没划。）'] },
      { id: 'ch2_back_chain', name: '担保链', x: 16, y: 10, kind: 'ch2', ch2: true, say: [
        '墙上钉着一串小木牌，牌之间用麻线连着：谁替谁担保，一环一环。',
        '（这次链子上串的是人，不是环。）'
      ], again: ['（五块小木牌，麻线绷得笔直。）'] },
      { id: 'ch2_back_desk', name: '账桌', x: 17, y: 10, kind: 'ch2', ch2: true, say: [
        '账桌上摊着半本对账、一盏油灯、一支秃笔。灯芯剪得很短 —— 这是给夜里算账备的。'
      ], again: ['（灯还亮着。笔搁在账上，压着上一行的墨。）'] },
      { id: 'ch2_back_ledger', name: '对账簿', x: 10, y: 12, kind: 'ch2', ch2: true, say: [
        '对账簿摊开着，左边记货、右边记人。',
        '（第十七任那半本缺了一页 —— 撕口还是新的。）'
      ], again: ['（缺的那页还在缺着。）'] },
      { id: 'ch2_back_visitors', name: '访客簿', x: 18, y: 13, kind: 'ch2', ch2: true, say: [
        '访客簿摊在桌角：名字、日子、来找谁。最近三页上，同一个姓出现了很多回。'
      ], again: ['（访客簿摊在桌角，翻到最近三页。）'] },
      /* 回函与赎价并进对账簿那一件里（9 点是硬口径；"写总号回函"落在对账簿那一行） */
      { id: 'ch2_back_oldbox', name: '旧票箱', x: 18, y: 9, kind: 'ch2', ch2: true, say: [
        '旧票箱塞在架子底下，票按年份捆着，最上面那捆的绳是新换的。',
        '（要查哪一年，就得整捆抽出来。）'
      ], again: ['（箱子还塞在架子底下。）'] },
      { id: 'ch2_back_abacus', name: '算盘', x: 18, y: 10, kind: 'ch2', ch2: true, say: [
        '一把老算盘，横梁磨得发亮。珠子停在半路，是上一笔没算完的账。'
      ], again: ['（珠子还停在半路。）'] }
    ],
    /* 西墙那道门 → 回库房。跟库房的 (16,11) 对开，两间房之间**只此一道**、往返一条路。
       落点 (15,12)：库房里紧挨着矮门的空地 —— 走回来正好站在门边上。
       ⚠️ 落点别压在库房的 (16,11) 上：那一格本身就是门口，一落地就被弹回账房（来回抽搐）。 */
    portals: [
      { x: 1, y: 10, to: VAULT, tx: 15, ty: 12, label: '回库房' }
    ]
  };

  /* ---------- 往一章两张图里各挂一个点（复用，不重画） ----------
     2026-10-17 用户点单：**里间那道门删了** —— 从"一章当铺"走进二章这条路整个拿掉
     （切章只走主界面）。所以挂点从三个减到两个，留下的这两个**只是 flavor**：
     它们都没有 `to`（按 E 只出字），也**都到不了第二幕的任何东西**（`CH2.open` 只有
     'ch2_fog' / 'ch2_backalley' 两个 case，`fog()` / `alley()` 都只 say）⇒ 走不过去。
        · 原 `pawnshop.ch2_vaultdoor`（里间 · 那排架子）已从这里删掉；
        · 回库房那道门不在这张表里，挂在一章自己的场景表上：
          js/story23.js `pawnshop` places 的 `ch2_vaultdoor`（16,10，已补 `to`）。
     verify-ch2 ① 的挂点数同时从 3 改成 2；verify-ch2vault 的 D7 钉死
     "在场面上真按 E，这两个点一步都进不了二章"。 */
  /* ---------- 柜台待客点（用户原话：「应该是我们在店铺和客人交互收记忆，然后买卖记忆」） ----------
     挂在一章当铺那张图上（前台＝一章那张柜台，设计书 S2），**story23.js 一个字节都不碰** ——
     走的就是下面这套 HOOKS 机制（跟 town/mist 那两个挂点同一路：story23 的地图是数据不是代码）。
     门控用 ch2_entered：对局二章时才营业（跟当铺里那道门同款）。
     **kind 是 look**：引擎把"非 look/portal/jobs 的点"所在格算成墙 —— 待客点得站得上去（客人站的位置
     也得是玩家走得过的格），所以它不能是 ch2 kind。CH2.open 那边照样按 id 认它（game23.js:1277 那条
     p.ch2 && CH2.open(p, host) 只看 ch2 标记，不看 kind）。
     收下 → 落"待上架"（ch2_pending），**不许直接进 26 格** —— 用户要的是玩家亲手走到罐前存。 */
  /* 2026-10-17：这个待客点原来挂在 `pawnshop`（**一章那张图**）上 —— 那就是"二章的点长在一章地图里"。
     用户原话：「那当铺的门那都连着第一张…那是第一张本来就有的地图」⇒ 搬进二章自己的柜台场景。
     ⚠️ 它现在**已经在 SHOP_SCENE.places 里预置好了**（坐标 (7,9)，跟 drawn 的客人同一格），
       所以 install() 里那段自动找落点的逻辑走到这儿会"已存在 ⇒ 幂等返回"，不会再挑格子。 */
  var COUNTER_HOOK = { sid: "ch2_shop", id: "ch2_counter_guest", name: "柜上 · 待客", need: "ch2_entered",
    say: [
      "柜台上那杆秤还没收。外头进来一个人，肩上背着渔网，网是空的。",
      "「掌柜的，」他说，「我那段记 —— 你还收不收？」"
    ], again: [
      "（阿海靠在柜台外头，等你开秤。）"
    ] };
  /* ---------- 柜台 · 前厅（二章自己的接待场）----------
     用户 2026-10-17 点单（逐字）：「你做个柜台地图，因为这个我们不是有任何接待客人买卖东西吗？
     肯定是要有柜台的呀。」
     为什么这张图必须存在：收当/卖赎这一整条循环发生在**柜台**上，而原先那个待客点长在一章的
     当铺图里（见 COUNTER_HOOK 的注）—— 二章借一章的地图，正是用户第 N 次拍死的事。
     ⇒ 这里是二章自己的一间前厅：柜台、待上架柜、当票架、通里间那道门，全是自己的。

     **画面锚点跟 js/ch2/art.js 的 SHOP 常量一一对应，谁改谁两边一起改**：
       柜台      x3..16 × y6..7   → solids [3,6,14,2]；像素 144..816 × 288..384（672×96）
       待上架柜  x1..3  × y1..2   → solids [1,1,3,2]；像素 48..192 × 48..144
       当票架    x16..18 × y1..2  → solids [16,1,3,2]；像素 768..912 × 48..144
       北墙那道门 x9..11 × y0     → 通里间 ch2_vault（像素 432..576 × 8..48）
     走位：玩家（学徒）在北半边当值；客人在柜台外头（南半张）。柜台两端各留一格绕行口
     （西 x1..2 / 东 x17..18），站到 (10,4) 就够得着"开秤"那一点。 */
  var SHOP_SCENE = {
    id: SHOP, name: '柜台', sub: '当铺 · 前厅',
    act: 6, w: 20, h: 14, spawn: { x: 10, y: 3 },
    palette: { ground: '#241d2b', ground2: '#2b2333', solid: '#120e17', accent: '#d9b46a', sky: '#0d0a12' },
    ambient: 'lamp',
    solids: [[0, 0, 20, 1], [0, 1, 1, 13], [19, 1, 1, 13], [0, 13, 20, 1],
             [1, 1, 3, 2], [16, 1, 3, 2], [3, 6, 14, 2]],
    portals: [
      { x: 10, y: 0, to: 'ch2_vault', tx: 3, ty: 12, label: '进里间 · 记忆库' }
    ],
    places: [
      { id: 'ch2_counter_guest', name: '柜上 · 待客', x: 7, y: 9, kind: 'look', ch2: true, need: 'ch2_entered',
        say: [
          '柜台上那杆秤还没收。外头进来一个人，肩上背着渔网，网是空的。',
          '「掌柜的，」他说，「我那段记 —— 你还收不收？」'
        ],
        again: ['（阿海靠在柜台外头，等你开秤。）'] },
      { id: 'ch2_shop_serve', name: '柜台 · 开秤', x: 10, y: 5, kind: 'ch2', ch2: true, say: [
        '柜台横在屋里，台面上摊着账本，算盘拨了一半。铜沿被手肘磨得发亮。',
        '（秤在左手边。开秤的那一下，是这行当里唯一还算数的一下。）'
      ], again: ['（秤搁着。今天还没开张。）'] },
      { id: 'ch2_shop_incoming', name: '柜上 · 待上架', x: 2, y: 3, kind: 'ch2', ch2: true, say: [
        '柜上摆着四只罐，封条还没干透 —— 是今天收进来的四段，等着入格。',
        '（一格一段。号牌得等入库那天才刻。）'
      ], again: ['（四只罐，四段记。还得再核一遍。）'] },
      { id: 'ch2_shop_tickets', name: '当票架', x: 17, y: 3, kind: 'ch2', ch2: true, say: [
        '一排当票垂在钩子上，票角一枚火漆。字都朝里 —— 朝外的那几张，是没人来赎的。',
        '（这一架子，是这间铺子的良心。）'
      ], again: ['（票角上的火漆凉着。）'] }
    ]
  };

  var HOOKS = [
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
    var report = { vault: VAULT, back: BACK, hooks: [], skipped: [], jars: 0, solidsFrom: 'fallback' };
    if (!D || !D.SCENES) return report;
    if (!D.SCENES[VAULT]) D.SCENES[VAULT] = VAULT_SCENE;
    /* 柜台 · 前厅：二章自己的接待场（幂等，装两次不会冲掉美术线后来调的块位） */
    if (!D.SCENES[SHOP]) D.SCENES[SHOP] = SHOP_SCENE;
    report.shop = SHOP;
    /* 26 个逐格交互点：跟场景同生共死（场景在就一定有 26 个点） */
    report.jars = mountJars(D.SCENES[VAULT]);
    /* S3 账房（`ch2_back`）：装场景 + 块表从当铺拷一份（拷不到就用兜底常量）。
       为什么要拷：这间房走的是 art.js 那条"一章当铺素材 + 只换 palette"的复用路，
       块位跟当铺一致才画得对得上（art.js:951-974 的 shopSolids/shopView）。
       已经装过就**不覆盖**（幂等：装载两次不会把美术线后来调的块位冲掉）。 */
    /* 2026-10-17 断耦合：原先这里把**一章当铺的块表**整份拷过来（"块位跟当铺一致才画得对得上"）。
       那套前提已经不存在了 —— 账房现在是 art.js 自己画的（用户拍死"二章不沿用一章资产"）。
       而且旧块表里那道"柜台横在 y=3..4"的位置，我这间房根本不画柜台 ⇒ 那就是一片**空气墙**。
       ⇒ 块表改成只有四面墙：房内 8 件实物各自是点位（引擎自己把点位那格算墙），其余全是地。 */
    (function mountBack() {
      /* 四面墙 + **北半间那张大账桌**（tiles x5..14 × y3..4）。
         这张桌是 art.js 的 backDesk() 画的，画出来的矩形就是 5*48..15*48 × 3*48..5*48
         —— 块位和画面必须是同一条线，差一格就是空气墙或者能穿过去的桌子。 */
      BACK_SCENE.solids = [[0, 0, 20, 1], [0, 1, 1, 13], [19, 1, 1, 13], [0, 13, 20, 1],
                           [5, 3, 10, 2]];
      report.solidsFrom = 'own-walls';
      if (!D.SCENES[BACK]) D.SCENES[BACK] = BACK_SCENE;
    })();
    /* 柜台待客点单独挂：它在一章当铺那张图上，门控与库房那道门同款 */
    (function mountCounter() {
      var csc = D.SCENES[COUNTER_HOOK.sid];
      if (!csc) { report.skipped.push(COUNTER_HOOK.sid + "." + COUNTER_HOOK.id + "（场景不在）"); return; }
      var hit = null;
      csc.places.forEach(function (p) { if (p.id === COUNTER_HOOK.id) hit = p; });
      if (hit) { report.hooks.push(COUNTER_HOOK.sid + "." + COUNTER_HOOK.id + "@" + hit.x + "," + hit.y); return; }
      /* 候选格＝柜台前那一排（第 6 行）＋第 7 行：跟一章那些挂点同一条规矩 ——
         ① 自己走得进 ② 上下至少一格站得下脚 ③ 没被别的点占着，也不压出口。 */
      var cands = [[12, 6], [11, 6], [13, 6], [12, 7], [11, 7], [13, 7], [9, 6], [8, 6], [7, 6], [14, 6], [10, 7]];
      var spot = null;
      cands.forEach(function (c) {
        if (spot) return;
        if (D.isSolidIn(COUNTER_HOOK.sid, c[0], c[1])) return;
        if (passable(D, COUNTER_HOOK.sid, c[0], c[1]) !== true) return;
        if (D.portalAt(COUNTER_HOOK.sid, c[0], c[1])) return;
        if (csc.places.some(function (p) { return p.x === c[0] && p.y === c[1]; })) return;
        var up = c[1] - 1 >= 0 && passable(D, COUNTER_HOOK.sid, c[0], c[1] - 1);
        var dn = c[1] + 1 < csc.h && passable(D, COUNTER_HOOK.sid, c[0], c[1] + 1);
        if (!up && !dn) return;
        spot = { x: c[0], y: c[1] };
      });
      if (!spot) { report.skipped.push(COUNTER_HOOK.sid + "." + COUNTER_HOOK.id + "（柜台前找不到站得住的落点）"); return; }
      csc.places.push({ id: COUNTER_HOOK.id, name: COUNTER_HOOK.name, x: spot.x, y: spot.y,
        kind: "look", ch2: true, need: COUNTER_HOOK.need, say: COUNTER_HOOK.say, again: COUNTER_HOOK.again });
      report.hooks.push(COUNTER_HOOK.sid + "." + COUNTER_HOOK.id + "@" + spot.x + "," + spot.y);
    })();
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

  global.CH2_SCENES = { install: install, VAULT: VAULT, BACK: BACK, SHOP: SHOP, BACK_SCENE: BACK_SCENE,
    SHOP_SCENE: SHOP_SCENE,
    HOOKS: HOOKS, COUNTER_HOOK: COUNTER_HOOK,
    jarPoints: jarPoints, mountJars: mountJars, ROW_N: ROW_N, JAR_ROWS: JAR_ROWS.slice(),
    pickSpot: pickSpot, isFree: isFree, passable: passable, reach: reach, targets: targets };
})(typeof window !== 'undefined' ? window : globalThis);
