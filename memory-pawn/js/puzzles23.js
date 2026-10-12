/* 记忆当铺 v23 · 谜题层（12 个，全部可触屏、条件唯一、有线索可推）
   与引擎的接口：host = { D, S, modalBody, setTitle, setBody, setBtns, solve(id), toast(msg), sfx(name), ending(id), refresh() }
   每个谜题自己渲染进 #m-body，解出时调 host.solve(id) —— 引擎负责置旗标、记日志、刷任务。 */
(function (global) {
  'use strict';

  var H = null;
  function attach(host) { H = host; }
  function q(sel) { return H.modalBody().querySelector(sel); }
  function qa(sel) { return Array.prototype.slice.call(H.modalBody().querySelectorAll(sel)); }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }

  /* ============ 1. 灯号（三长两短，先雾后灯） ============ */
  function lampcode(p) {
    var TARGET = ['雾', '雾', '雾', '灯', '灯'];
    var seq = [];
    H.setBody('<p class="pz-tip">' + p.brief + '</p>' +
      '<div class="pz-clue">礁石刻痕：三长两短。抄本边上一行小字：先雾，后灯。</div>' +
      '<div class="pz-seq" id="pz-seq"></div>' +
      '<div class="pz-row"><button class="pz-btn" id="pz-fog">雾（长）</button><button class="pz-btn" id="pz-lamp">灯（短）</button></div>' +
      '<div class="pz-progress" id="pz-prog">已敲 0/5</div>');
    var seqEl = q('#pz-seq'), progEl = q('#pz-prog');
    function draw() {
      seqEl.innerHTML = TARGET.map(function (t, i) {
        var v = seq[i];
        return '<span class="pz-slot' + (v ? ' filled' : '') + '" style="display:inline-flex;margin:0 4px">' + (v || '?') + '</span>';
      }).join('');
      progEl.textContent = '已敲 ' + seq.length + '/5';
    }
    function push(v) {
      if (seq.length >= TARGET.length) seq = [];
      seq.push(v);
      H.sfx(v === '雾' ? 'knockL' : 'knockS');
      draw();
      if (seq.length === TARGET.length) {
        var okk = seq.every(function (t, i) { return t === TARGET[i]; });
        if (okk) { H.solve('lampcode'); }
        else { H.sfx('wrong'); H.toast('灯号没对上——先三声雾，再两声灯。'); seq = []; draw(); }
      }
    }
    q('#pz-fog').onclick = function () { push('雾'); };
    q('#pz-lamp').onclick = function () { push('灯'); };
    H.setBtns([{ label: '先不敲', fn: function () { H.close(); } }]);
    draw();
  }

  /* ============ 2. 钟表校准（潮到三刻 = 3:45） ============ */
  function dial(p) {
    var h = 3, m = 20, TH = 3, TM = 45;
    H.setBody('<p class="pz-tip">' + p.brief + '</p>' +
      '<div class="pz-clue">钟面刻着：潮到三刻，灯要拨亮。（一刻 = 十五分）</div>' +
      '<div class="sc-pan"><span class="sc-num" id="pz-clock">03:20</span></div>' +
      '<div class="pz-row"><button class="pz-btn" data-d="h-1">时 −1</button><button class="pz-btn" data-d="h1">时 +1</button></div>' +
      '<div class="pz-row"><button class="pz-btn" data-d="m-5">分 −5</button><button class="pz-btn" data-d="m5">分 +5</button></div>' +
      '<div class="pz-progress" id="pz-prog">把钟拨到潮水那一刻</div>');
    function draw() {
      m = (m + 60) % 60; h = ((h - 1 + 12) % 12) + 1;
      q('#pz-clock').textContent = ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2);
      var dh = Math.abs(h - TH), dm = Math.abs(m - TM);
      q('#pz-prog').textContent = (dh === 0 && dm === 0) ? '' : (dh === 0 ? '时针对了' : '') + (dm === 0 && dh !== 0 ? '分针对了' : '') || '把钟拨到潮水那一刻';
    }
    qa('[data-d]').forEach(function (b) {
      b.onclick = function () {
        var d = b.getAttribute('data-d');
        if (d === 'h-1') h--, h = h < 1 ? 12 : h;
        if (d === 'h1') h = h === 12 ? 1 : h + 1;
        if (d === 'm-5') m -= 5;
        if (d === 'm5') m += 5;
        H.sfx('click'); draw();
        if (((h - 1 + 12) % 12) + 1 === TH && ((m % 60) + 60) % 60 === TM) H.solve('dial');
      };
    });
    H.setBtns([{ label: '先不拨', fn: function () { H.close(); } }]);
    draw();
  }

  /* ============ 3. 残页复原（三个空） ============ */
  function read_book(p) {
    var picks = {};
    var html = '<p class="pz-tip">' + p.brief + '</p><div class="pz-clue">「戊戌年冬。小儿热了七天。______ 去了镇上，回来时袖子鼓着一角，是张契。」</div>';
    p.blanks.forEach(function (b, i) {
      html += '<div class="qa-q">' + b.label + '</div><div class="qa-opt" data-blank="' + i + '">' +
        b.options.map(function (o) { return '<button class="pz-opt" data-v="' + o + '">' + o + '</button>'; }).join('') + '</div>';
    });
    html += '<div class="pz-progress" id="pz-prog">三个空都要填</div>';
    H.setBody(html);
    qa('[data-blank]').forEach(function (row) {
      var i = +row.getAttribute('data-blank');
      row.querySelectorAll('.pz-opt').forEach(function (b) {
        b.onclick = function () {
          picks[i] = b.getAttribute('data-v');
          row.querySelectorAll('.pz-opt').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on'); H.sfx('select');
        };
      });
    });
    H.setBtns([
      { label: '念出来', fn: function () {
        var bad = [];
        p.blanks.forEach(function (b, i) {
          if (picks[i] !== b.answer) bad.push(i);
        });
        if (!bad.length) { H.solve('read_book'); return; }
        H.sfx('wrong');
        q('#pz-prog').textContent = '第 ' + bad.map(function (i) { return p.blanks[i].label; }).join('、') + ' 对不上——再想想。';
      } },
      { label: '合上抄本', fn: function () { H.close(); } }
    ]);
  }

  /* ============ 4. 账本对账（逻辑排除，每局现生成） ============ */
  var LEDGER_RULES = [
    { id: 'r1', text: '一笔记只能写一件东西', test: function (r) { return r.items !== 1; } },
    { id: 'r2', text: '替记不收当金（当金必须是 0）', test: function (r) { return r.kind === '替记' && r.gold !== 0; } },
    { id: 'r3', text: '未满十六岁不签替记', test: function (r) { return r.kind === '替记' && r.age < 16; } },
    { id: 'r4', text: '同一天不能又当又赎', test: function (r) { return r.kind !== '替记' && r.day === r.redeemDay; } },
    { id: 'r5', text: '当金不能超过这段记的痛感', test: function (r) { return r.gold > r.w; } }
  ];
  var NAMES = ['阿隐', '阿罔', '陈婶', '柳先生', '祁掌柜', '阿海', '灯娘', '小满'];
  var THINGS = ['一盏灯的暖', '海难那一夜', '会写自己的名字', '码头上的钟声', '母亲的手', '盐的味道', '一个没说完的道歉', '第一次喝醉'];
  function makeRow(bad) {
    var kind = bad ? (Math.random() < 0.6 ? '替记' : '当') : (Math.random() < 0.35 ? '替记' : (Math.random() < 0.5 ? '赎' : '当'));
    var r = {
      name: NAMES[rnd(NAMES.length)], kind: kind,
      thing: THINGS[rnd(THINGS.length)],
      w: 1 + rnd(5), gold: 1 + rnd(5), age: 16 + rnd(34),
      items: 1, day: 1 + rnd(28), redeemDay: 1 + rnd(28)
    };
    if (kind === '替记') { r.gold = Math.random() < 0.6 ? 0 : 1 + rnd(4); r.age = Math.random() < 0.25 ? 8 + rnd(7) : 16 + rnd(30); }
    if (bad) {
      var want = 2 + rnd(2); /* 2~3 条 */
      var tries = 0;
      while (LEDGER_RULES.filter(function (u) { return u.test(r); }).length < want && tries < 60) {
        tries++;
        var pick = rnd(5);
        if (pick === 0) r.items = 2;
        if (pick === 1) { r.kind = '替记'; r.gold = 1 + rnd(4); }
        if (pick === 2) { r.kind = '替记'; r.age = 8 + rnd(7); }
        if (pick === 3) { r.kind = '当'; r.redeemDay = r.day; }
        if (pick === 4) r.gold = r.w + 1 + rnd(3);
      }
    } else {
      /* 最多犯一条 */
      var guard = 0;
      while (LEDGER_RULES.filter(function (u) { return u.test(r); }).length > 1 && guard < 60) {
        guard++;
        r.items = 1; r.day = 1 + rnd(28); r.redeemDay = 1 + rnd(28);
        if (r.kind === '替记') { r.gold = Math.random() < 0.7 ? 0 : r.gold; r.age = 16 + rnd(30); }
        else { r.gold = Math.min(r.gold, r.w); }
      }
    }
    return r;
  }
  function makeLedger() {
    for (var a = 0; a < 300; a++) {
      var rows = [];
      var badIdx = rnd(6);
      for (var i = 0; i < 6; i++) rows.push(makeRow(i === badIdx));
      var counts = rows.map(function (r) { return LEDGER_RULES.filter(function (u) { return u.test(r); }).length; });
      var multi = counts.filter(function (c) { return c >= 2; }).length;
      if (multi === 1 && counts[badIdx] >= 2) return rows;
    }
    /* 兜底：手写一局，保证唯一解 */
    return [
      { name: '陈婶', kind: '当', thing: '母亲的手', w: 3, gold: 2, age: 41, items: 1, day: 4, redeemDay: 9 },
      { name: '阿海', kind: '赎', thing: '盐的味道', w: 2, gold: 2, age: 17, items: 1, day: 11, redeemDay: 20 },
      { name: '祁掌柜', kind: '当', thing: '码头上的钟声', w: 4, gold: 3, age: 63, items: 1, day: 7, redeemDay: 15 },
      { name: '阿罔', kind: '替记', thing: '海难那一夜', w: 5, gold: 3, age: 12, items: 2, day: 2, redeemDay: 2 },
      { name: '柳先生', kind: '当', thing: '一个没说完的道歉', w: 3, gold: 1, age: 55, items: 1, day: 18, redeemDay: 26 },
      { name: '小满', kind: '赎', thing: '一盏灯的暖', w: 2, gold: 2, age: 22, items: 1, day: 6, redeemDay: 21 }
    ];
  }
  function ledger(p) {
    var rows = makeLedger();
    var html = '<p class="pz-tip">' + p.brief + '</p>';
    html += '<div class="mini-clues"><div class="mini-clue">账本边上的批注（掌柜的字）：</div>' +
      LEDGER_RULES.map(function (u) { return '<div class="mini-clue">· ' + u.text + '</div>'; }).join('') + '</div>';
    html += '<div class="ledger-rows" id="pz-rows">' + rows.map(function (r, i) {
      return '<button class="ledger-row" data-i="' + i + '"><b>#' + (i + 1) + ' ' + r.name + '</b>' + r.kind + '「' + r.thing + '」' +
        '<i>当金 ' + r.gold + ' · ' + r.age + ' 岁 · 初' + r.day + ' 赎' + r.redeemDay + '</i></button>';
    }).join('') + '</div><div class="pz-progress" id="pz-prog">哪一笔同时犯了两条批注？</div>';
    H.setBody(html);
    qa('.ledger-row').forEach(function (b) {
      b.onclick = function () {
        var i = +b.getAttribute('data-i');
        var r = rows[i];
        var broken = LEDGER_RULES.filter(function (u) { return u.test(r); });
        if (broken.length >= 2) { H.solve('ledger'); return; }
        H.sfx('wrong');
        b.classList.add('wrong');
        q('#pz-prog').textContent = '#' + (i + 1) + ' 只犯了 ' + broken.length + ' 条：' + (broken.map(function (u) { return u.text; }).join('；') || '一条都没犯');
      };
    });
    H.setBtns([{ label: '合上账本', fn: function () { H.close(); } }]);
  }

  /* ============ 5. 秤当金（三枚砝码，每枚最多两次，17 两唯一） ============ */
  function scales(p) {
    var W = [1, 3, 9], TARGET = 17, LIMIT = 2;
    var cnt = [0, 0, 0];
    H.setBody('<p class="pz-tip">' + p.brief + '</p>' +
      '<div class="pz-clue">秤杆上刻着：宁少一两，不多一钱。三枚砝码各只能上一次，一次最多放两枚同号。</div>' +
      '<div class="sc-pan"><span class="sc-num" id="pz-sum">0</span><span style="color:var(--dim)">两 / 要称 ' + TARGET + ' 两</span></div>' +
      '<div class="pz-row" id="pz-weights">' + W.map(function (w, i) {
        return '<button class="pz-btn" data-i="' + i + '">' + w + ' 两<br><small style="color:var(--dim)">已放 0</small></button>';
      }).join('') + '</div>' +
      '<div class="pz-progress" id="pz-prog">把秤压平</div>');
    function draw() {
      var sum = cnt.reduce(function (a, c, i) { return a + c * W[i]; }, 0);
      q('#pz-sum').textContent = sum;
      qa('#pz-weights .pz-btn').forEach(function (b, i) {
        b.querySelector('small').textContent = '已放 ' + cnt[i];
        b.disabled = cnt[i] >= LIMIT;
      });
      q('#pz-prog').textContent = sum === TARGET ? '秤平了——正好 ' + TARGET + ' 两' : (sum > TARGET ? '太重了' : '还差 ' + (TARGET - sum) + ' 两');
      return sum;
    }
    qa('#pz-weights .pz-btn').forEach(function (b) {
      b.onclick = function () {
        var i = +b.getAttribute('data-i');
        if (cnt[i] >= LIMIT) return;
        cnt[i]++; H.sfx('click');
        var sum = draw();
        if (sum === TARGET) H.solve('scales');
      };
    });
    H.setBtns([{ label: '全部拿下', fn: function () { cnt = [0, 0, 0]; draw(); } },
      { label: '先不称', fn: function () { H.close(); } }]);
    draw();
  }

  /* ============ 6. 闸门引水（4x4 管道旋转，连通三个盐池） ============ */
  /* 方向：0=上 1=右 2=下 3=左（表里的字母就是按这个编号写的，别照着注释猜） */
  var SHAPES = {
    straight: [[1, 3], [0, 2], [1, 3], [0, 2]],  /* 直管只有两个姿态，凑满四格：rot%4 索引才安全（曾印出 undefined） */
    elbow: [[1, 2], [2, 3], [3, 0], [0, 1]], /* rot0: 右下 ; 1: 下左 ; 2: 左上 ; 3: 上右 */
    tee: [[1, 2, 3], [0, 2, 3], [0, 1, 3], [0, 1, 2]] /* rot k = 除了 k 方向之外的三通 */
  };
  var ARM = ['up', 'rt', 'dn', 'lf'];   /* v38 画法用：方向编号 → CSS 臂名（跟 SHAPES 的 0/1/2/3 同序） */
  var SLUICE = {
    src: { x: 0, y: 1 },
    pools: [{ x: 3, y: 0 }, { x: 3, y: 2 }, { x: 3, y: 3 }],
    pipes: [
      { x: 1, y: 1, shape: 'tee', solved: 1 },      /* 左接水源、上、下 */
      { x: 1, y: 0, shape: 'elbow', solved: 0 },
      { x: 2, y: 0, shape: 'straight', solved: 0 },
      { x: 1, y: 2, shape: 'tee', solved: 3 },      /* 上、右、下 */
      { x: 2, y: 2, shape: 'straight', solved: 0 },
      { x: 1, y: 3, shape: 'elbow', solved: 3 },
      { x: 2, y: 3, shape: 'straight', solved: 0 }
    ]
  };
  function conns(p) { return SHAPES[p.shape][((p.rot % 4) + 4) % 4] || []; }
  function pipeAt(x, y) {
    for (var i = 0; i < SLUICE.pipes.length; i++) if (SLUICE.pipes[i].x === x && SLUICE.pipes[i].y === y) return SLUICE.pipes[i];
    return null;
  }
  /* 从水源往右灌：返回被灌到的格子键（含被灌到的盐池） */
  function flood() {
    var seen = {}, out = {};
    var sx = SLUICE.src.x, sy = SLUICE.src.y;
    var stack = [], DIR = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    out[sx + ',' + sy] = 1;
    var first = pipeAt(sx + 1, sy);
    if (first && conns(first).indexOf(3) >= 0) stack.push([sx + 1, sy]);
    /* 盐池是敞口的：水到了就进池 */
    function isPool(x, y) {
      return SLUICE.pools.some(function (o) { return o.x === x && o.y === y; });
    }
    while (stack.length) {
      var cur = stack.pop(), key = cur[0] + ',' + cur[1];
      if (seen[key]) continue;
      seen[key] = 1; out[key] = 1;
      var pp = pipeAt(cur[0], cur[1]);
      if (!pp) continue;
      conns(pp).forEach(function (d) {
        var nx = cur[0] + DIR[d][0], ny = cur[1] + DIR[d][1];
        if (nx < 0 || ny < 0 || nx > 3 || ny > 3) return;
        if (isPool(nx, ny)) { out[nx + ',' + ny] = 1; return; }
        var np = pipeAt(nx, ny);
        if (!np) return;
        var opp = (d + 2) % 4;
        if (conns(np).indexOf(opp) >= 0) stack.push([nx, ny]);
      });
    }
    return out;
  }
  function sluice(p) {
    SLUICE.pipes.forEach(function (pp) {
      var r; do { r = rnd(4); } while (r === pp.solved);
      pp.rot = r;
    });
    H.setBody('<p class="pz-tip">' + p.brief + '</p>' +
      '<div class="pz-clue">闸门在最左边（金色），三个盐池在最右边（青色）。管道点一下转九十度。</div>' +
      '<div class="sl-grid" id="pz-grid"></div>' +
      '<div class="pz-progress" id="pz-prog">通到 0/3 个盐池</div>');
    /* v38 画法口径（用户报「管道难看」+「逻辑好像有问题，应该无解」）：
       旧版把连接印成 box-drawing 字形，而 tee 的 '├┬┤┴' 跟 SHAPES 的连接表**差了 90°** ——
       玩家照着屏幕上的 T 去接，永远接不通，看起来就是"无解"（其实数据里有解）。
       现在每根管子**只画 rot0 那一版的臂**（跟 SHAPES[shape][0] 一一对应，常量），
       姿态一律交给 CSS rotate(rot*90deg) —— 显示和逻辑由同一个 rot 驱动，不可能再对不上。 */
    var grid = q('#pz-grid'), cellOf = {};
    function isPool(x, y) { return SLUICE.pools.some(function (o) { return o.x === x && o.y === y; }); }
    for (var y = 0; y < 4; y++) for (var x = 0; x < 4; x++) {
      var key = x + ',' + y, pp = pipeAt(x, y), c = el('div', 'sl-cell');
      if (x === SLUICE.src.x && y === SLUICE.src.y) {
        c.className = 'sl-cell src';
        c.innerHTML = '<div class="sl-gate"><i></i><i></i><i></i></div>';
      } else if (isPool(x, y)) {
        c.className = 'sl-cell pool';
        c.innerHTML = '<div class="sl-pool"><i class="lvl"></i></div>';
      } else if (pp) {
        c.className = 'sl-cell pipe';
        c.innerHTML = '<div class="sl-rot" data-rot="' + pp.rot + '"><i class="hub"></i>' +
          SHAPES[pp.shape][0].map(function (d) { return '<i class="a ' + ARM[d] + '"></i>'; }).join('') + '</div>';
        c.onclick = (function (ppp) { return function () { ppp.rot = (ppp.rot + 1) % 4; H.sfx('click'); paint(); }; })(pp);
      }
      cellOf[key] = c; grid.appendChild(c);
    }
    /* 只更新状态、不重建 DOM —— 这样点击时管子是**转过去**的（CSS 过渡），不是闪一下换字形 */
    function paint() {
      var flow = flood();
      SLUICE.pipes.forEach(function (pp) {
        var key = pp.x + ',' + pp.y, c = cellOf[key], box = c.firstChild, on = !!flow[key];
        c.className = 'sl-cell pipe' + (on ? ' flow' : '');
        box.setAttribute('data-rot', pp.rot);
        box.style.transform = 'rotate(' + (pp.rot * 90) + 'deg)';
      });
      var done = 0;
      SLUICE.pools.forEach(function (o) {
        var on = !!flow[o.x + ',' + o.y];
        if (on) done++;
        cellOf[o.x + ',' + o.y].className = 'sl-cell pool' + (on ? ' done' : '');
      });
      cellOf[SLUICE.src.x + ',' + SLUICE.src.y].className = 'sl-cell src' + (flow[SLUICE.src.x + ',' + SLUICE.src.y] ? ' gush' : '');
      q('#pz-prog').textContent = '通到 ' + done + '/3 个盐池';
      if (done === 3) H.solve('sluice');
    }
    H.setBtns([{ label: '全部复位', fn: function () { SLUICE.pipes.forEach(function (pp) { pp.rot = 0; }); paint(); } },
      { label: '先不开闸', fn: function () { H.close(); } }]);
    paint();
  }

  /* ============ 7. 日记残页（时间线排序） ============ */
  var DIARY = [
    { id: 'a', t: '他醒了。他问我，我是谁。我说，我是姐姐。他信了。' },
    { id: 'b', t: '妈没了。灯得有人守，我先守着。' },
    { id: 'c', t: '今天他会写自己的名字了——是我握着他的手写的。' },
    { id: 'd', t: '镇上的人开始叫我"那个替记的"。他们躲着我走。' },
    { id: 'e', t: '我记不住字了。趁还记得，把要紧的写下来。' }
  ];
  var DIARY_ORDER = ['b', 'c', 'd', 'a', 'e'];
  function diary(p) {
    var cur = DIARY.map(function (x) { return x.id; });
    cur.sort(function () { return Math.random() - 0.5; });
    if (cur.join() === DIARY_ORDER.join()) cur.reverse();
    var sel = null;
    H.setBody('<p class="pz-tip">' + p.brief + '</p>' +
      '<div class="pz-clue">潮水送回来的纸只剩五行字，日期全泡糊了。点两张纸交换位置。</div>' +
      '<div class="od-list" id="pz-list"></div>' +
      '<div class="pz-progress" id="pz-prog">锚点：第一张是"妈没了"，最后一张是"我记不住字了"</div>');
    /* v38（用户报「点一下会闪一条线、内容突然往上跳」）：改**原地更新**。
       旧版每次点击都 list.innerHTML='' 重建五行按钮 —— 正在按的那个 <button> 被从 DOM 里抽走，
       焦点丢、浏览器按"把焦点元素带进视野"的规矩顺手滚一下容器，玩家看到的就是那一下闪跳。
       现在按钮只建一次，点击只改文字与类名（DOM 不动 → 不会跳、焦点也不丢）。 */
    var byId = {};
    DIARY.forEach(function (x) { byId[x.id] = x; });
    var nodes = cur.map(function (id, i) {
      var b = el('button', 'od-item', '<span class="od-n">' + (i + 1) + '</span>' + byId[id].t);
      b.onclick = (function (at) {
        return function () {
          if (sel === null) { sel = at; H.sfx('select'); }
          else if (sel === at) { sel = null; }
          else { var t = cur[sel]; cur[sel] = cur[at]; cur[at] = t; sel = null; H.sfx('click'); }
          paint();
        };
      })(i);
      return b;
    });
    function paint() {
      cur.forEach(function (id, i) {
        var b = nodes[i];
        b.className = 'od-item' + (sel === i ? ' sel' : '');
        b.innerHTML = '<span class="od-n">' + (i + 1) + '</span>' + byId[id].t;
      });
    }
    var list = q('#pz-list');
    nodes.forEach(function (b) { list.appendChild(b); });
    paint();
    H.setBtns([
      { label: '排好了', fn: function () {
        if (cur.join() === DIARY_ORDER.join()) { H.solve('diary'); }
        else { H.sfx('wrong'); q('#pz-prog').textContent = '顺序不对——她先说"妈没了"，最后才说"记不住字了"。'; }
      } },
      { label: '先放下', fn: function () { H.close(); } }
    ]);
    /* 起手就把五行按钮建好（paint 由上面那次调用收尾） */
  }

  /* ============ 8. 卷宗检索（三层条件唯一解） ============ */
  var SEARCH = {
    years: ['甲午', '戊戌', '庚子', '辛丑'],
    events: ['一场火', '替记契', '沉船', '灯油'],
    names: ['阿隐', '阿罔', '柳先生', '祁掌柜'],
    answer: { year: '戊戌', event: '替记契', name: '阿隐' }
  };
  function search(p) {
    function selHtml(label, key, opts) {
      return '<div class="sr-row"><label>' + label + '</label><select data-k="' + key + '"><option value="">— 未选 —</option>' +
        opts.map(function (o) { return '<option>' + o + '</option>'; }).join('') + '</select></div>';
    }
    H.setBody('<p class="pz-tip">' + p.brief + '</p>' +
      '<div class="pz-clue">架子按三层排：年份、事由、人名。柳先生说过一句：「她来的那年，镇上下过一场雾症；那册写的是替记；签名栏空着，只有一个人名。」</div>' +
      selHtml('年份', 'year', SEARCH.years) + selHtml('事由', 'event', SEARCH.events) + selHtml('人名', 'name', SEARCH.names) +
      '<div class="sr-result" id="pz-res">三层都选准，才抽得出那一册。</div>');
    H.setBtns([
      { label: '抽这一册', fn: function () {
        var pick = {};
        qa('select').forEach(function (s) { pick[s.getAttribute('data-k')] = s.value; });
        var res = q('#pz-res');
        if (!pick.year || !pick.event || !pick.name) { res.className = 'sr-result no'; res.textContent = '三层都得选。'; return; }
        var hit = pick.year === SEARCH.answer.year && pick.event === SEARCH.answer.event && pick.name === SEARCH.answer.name;
        if (hit) { res.className = 'sr-result ok'; res.textContent = '抽出来了：一册用红线捆着的契，封皮上写着「戊戌 · 替记 · 阿隐」。'; H.solve('search'); }
        else {
          H.sfx('wrong');
          res.className = 'sr-result no';
          res.textContent = pick.year === SEARCH.answer.year ? '年份对得上……别的不对。' :
            (pick.name === SEARCH.answer.name ? '这个名字对，年份和事由不对。' : '这一格是空的。');
        }
      } },
      { label: '先不查', fn: function () { H.close(); } }
    ]);
  }

  /* ============ 9. 名字重建（部件拼字：阿 + 隐） ============ */
  /* 唯一解是两层意思，缺一层就漏：
     ① 判题只认一种排法 —— 左"阝"右"可"＝阿、左"阝"右"急"＝隐，同一批碎片换个位置就念不出那个名字。
     ② 九片里**只有这两组**左右凑得出字。剩下的五片是别处捡来的偏旁（彳 目 刂 冫 宀），跟谁都成不了字 ——
        不许再放"自己也能凑成字"的碎片（早先的 木+目＝相 就让「阿相」「相隐」也念得出来）。
     碎片顺序故意打散：要用的四片既不挨着、也不落在奇偶位上；左右两半更不许贴着摆。
     两块"阝"分开放（3 与 8），提示不报数。
     picked 里存的是"第几片"的下标，不是字：两块"阝"各算各的（按字高亮会让选一片亮两片）。 */
  var PIECES = ['急', '彳', '目', '阝', '刂', '可', '冫', '宀', '阝'];
  var NAME_ANS = ['阝', '可', '阝', '急'];
  var NAME_PAIRS = { '阝可': '阿', '阝急': '隐' };   /* 左＋右拼得出字的两组 —— 就这两组，fix-v30 ⑦ 钉着 */
  function name_(p) {
    var picked = [], tries = 0;
    H.setBody('<p class="pz-tip">' + p.brief + '</p>' +
      '<div class="pz-clue">碑上凿掉的是两个字 —— 一个字两片，左一片、右一片。碎片是在碑脚下捡的，里面混着别处来的笔画。</div>' +
      '<div class="nm-grid" id="pz-pieces">' + PIECES.map(function (c, i) {
        return '<button class="nm-pc" data-i="' + i + '">' + c + '</button>';
      }).join('') + '</div>' +
      '<div class="pz-slots nm-slots" id="pz-slots"></div>' +
      '<div class="pz-progress" id="pz-prog">选四片</div>');
    function chAt(i) { return picked[i] === undefined ? '' : PIECES[picked[i]]; }
    function word(i) {                       /* 第 i 个字的读法：拼得出就显示，拼不出就是「？」 */
      var a = chAt(i * 2), b = chAt(i * 2 + 1);
      if (!a || !b) return '';
      return NAME_PAIRS[a + b] || '？';
    }
    function slot(i) { return '<div class="pz-slot' + (chAt(i) ? ' filled' : '') + '">' + chAt(i) + '</div>'; }
    function draw() {
      q('#pz-slots').innerHTML =
        '<div class="pz-pair">' + slot(0) + '<i>＋</i>' + slot(1) + '</div>' +
        '<div class="pz-pair">' + slot(2) + '<i>＋</i>' + slot(3) + '</div>' +
        '<div class="pz-glue">＝ 「' + (word(0) || '？') + (word(1) || '？') + '」</div>';
      qa('.nm-pc').forEach(function (b) {
        var i = +b.getAttribute('data-i');
        b.classList.toggle('sel', picked.indexOf(i) >= 0);        /* 按"哪一片"高亮：一片只能用一次 */
        b.disabled = picked.length >= 4 && picked.indexOf(i) < 0;
      });
      q('#pz-prog').textContent = picked.length + '/4';
    }
    qa('.nm-pc').forEach(function (b) {
      b.onclick = function () {
        var i = +b.getAttribute('data-i');
        if (picked.length >= 4 || picked.indexOf(i) >= 0) return;
        picked.push(i); H.sfx('select'); draw();
        if (picked.length === 4) check();
      };
    });
    function check() {
      var got = picked.map(function (i) { return PIECES[i]; });
      if (got.join('') === NAME_ANS.join('')) { H.solve('name'); return; }
      tries++;
      H.sfx('wrong');
      var four = got.slice().sort().join('') === NAME_ANS.slice().sort().join('');
      var w0 = word(0), w1 = word(1), msg;
      if (four) msg = '四片都对了 —— 可这两个字不是这么站队的。谁在左、谁在右？';
      else if (w0 && !w1) msg = '第一个字出来了（' + w0 + '），第二个还散着。';
      else if (!w0 && w1) msg = '第二个字出来了（' + w1 + '），第一个还散着。';
      else if (w0 && w1) msg = '「' + w0 + w1 + '」—— 不是碑上那个名字。';   /* 兜底：两处都成字＝唯一解，正常走不到这 */
      else msg = '拼不出字 —— 再拆一遍。';
      if (tries >= 3) msg += '（那个名字，你在礁石刻痕上见过。）';
      q('#pz-prog').textContent = msg;
      setTimeout(function () { picked = []; draw(); }, 900);
    }
    H.setBtns([{ label: '算了', fn: function () { H.close(); } }]);
    draw();
  }

  /* ============ 10. 歌谣（序列记忆） ============ */
  var songToken = 0;   /* 每次打开歌谣 +1：玩家中途关面板时，旧的播放定时器必须作废（实测漏了这一层会连报 7 个 TypeError） */
  function song(p) {
    var PADS = ['雾', '灯', '潮'];
    var mine = ++songToken;
    function alive() { return mine === songToken && !!q('#pz-seq') && (!H.isOpen || H.isOpen()); }
    var SEQ = (H.D.TEXT.songPattern || [1, 1, 2]).map(function (n) { return Math.max(0, Math.min(2, n - 1)); });
    var input = [], playing = false, armed = false;
    H.setBody('<p class="pz-tip">' + p.brief + '</p>' +
      '<div class="pz-clue">她敲在你手心里的顺序：雾、雾、灯、潮、灯、灯、雾。</div>' +
      '<div class="sm-seq" id="pz-seq"></div>' +
      '<div class="sm-pads" id="pz-pads">' + PADS.map(function (n, i) {
        return '<button class="sm-pad" data-i="' + i + '">' + n + '</button>';
      }).join('') + '</div>' +
      '<div class="pz-progress" id="pz-prog">先听一遍，再敲回去</div>');
    var tones = ['knockL', 'click', 'bell'];
    function flash(i) {
      var b = qa('.sm-pad')[i];
      if (!b) return;
      b.classList.add('lit');
      H.sfx(tones[i]);
      setTimeout(function () { b.classList.remove('lit'); }, 220);
    }
    function playSeq() {
      if (playing) return;
      playing = true; armed = false; input = [];
      if (!alive()) return;
      q('#pz-prog').textContent = '听着……';
      SEQ.forEach(function (n, k) {
        setTimeout(function () {
          if (!alive()) return;
          flash(n);
          q('#pz-seq').textContent = SEQ.slice(0, k + 1).map(function (m) { return PADS[m]; }).join(' · ');
        }, 260 * k + 120);
      });
      setTimeout(function () {
        if (!alive()) return;                 /* 面板已经关了/重开了：这一遍不再算数 */
        playing = false; armed = true;
        q('#pz-seq').textContent = '';
        q('#pz-prog').textContent = '你来敲（' + SEQ.length + ' 下）';
      }, 260 * SEQ.length + 300);
    }
    qa('.sm-pad').forEach(function (b) {
      b.onclick = function () {
        var i = +b.getAttribute('data-i');
        if (!armed) { return; }
        flash(i);
        input.push(i);
        q('#pz-seq').textContent = input.map(function (m) { return PADS[m]; }).join(' · ');
        var k = input.length - 1;
        if (input[k] !== SEQ[k]) {
          H.sfx('wrong'); armed = false;
          q('#pz-prog').textContent = '第 ' + (k + 1) + ' 下就错了。再听一遍。';
          setTimeout(playSeq, 700);
          return;
        }
        if (input.length === SEQ.length) { H.solve('song'); }
      };
    });
    H.setBtns([{ label: '再听一遍', fn: playSeq }, { label: '先不敲', fn: function () { H.close(); } }]);
    playSeq();
  }

  /* ============ 11. 三问 ============ */
  function three_asks(p) {
    var QS = H.D.TEXT.asks;
    var html = '<p class="pz-tip">' + p.brief + '</p>';
    QS.forEach(function (q, i) {
      html += '<div class="qa-q">' + (i + 1) + '. ' + q.q + '</div><input class="qa-in" data-i="' + i + '" placeholder="把答案写下来">';
    });
    html += '<div class="pz-progress" id="pz-prog">三句话，答案都在走过的路上</div>';
    H.setBody(html);
    function norm(v) { return String(v || '').replace(/[\s，。、,.;；:：!！?？"'"'（）()]/g, ''); }
    H.setBtns([
      { label: '回答', fn: function () {
        var wrong = [];
        qa('.qa-in').forEach(function (inp, i) {
          var v = norm(inp.value);
          var hit = v.length > 0 && QS[i].a.some(function (k) { return v.indexOf(norm(k)) >= 0; });
          if (!hit) wrong.push(i + 1);
        });
        if (!wrong.length) { H.solve('three_asks'); return; }
        H.sfx('wrong');
        q('#pz-prog').textContent = '第 ' + wrong.join('、') + ' 句还不对。想想这三件事：谁在点灯、谁签的字、债是谁的。';
      } },
      { label: '先不答', fn: function () { H.close(); } }
    ]);
  }

  /* ============ 12. 还名（终幕抉择，真结局需要相簿 4/4） ============ */
  function finale(p) {
    var n = H.D.photoCount(H.S);
    var hasAll = n >= H.D.PHOTOS.length;
    var html = '<p class="pz-tip">' + p.brief + '</p>' +
      '<div class="pz-clue">相簿：' + n + '/4' + (hasAll ? '（四张都在手里）' : '（还缺 ' + (4 - n) + ' 张——你想不起那个名字）') + '</div>' +
      '<div class="pz-row" id="pz-choices"></div>';
    H.setBody(html);
    var row = q('#pz-choices');
    p.choices.forEach(function (c) {
      var need = c.need === 'photos4' && !hasAll;
      var b = el('button', 'pz-opt' + (need ? '' : ''), c.label + (need ? '<br><small style="color:var(--dim)">相簿不全，这个选项是空的</small>' : ''));
      b.disabled = need;
      b.onclick = function () { H.ending(c.id); };
      row.appendChild(b);
    });
    H.setBtns([]);
  }

  /* ============ 13. 灯阵（三乘三：按一盏，连它上下左右一起翻；九盏全亮才过） ============ */
  /* 乱局一律从"全亮"倒着按 n 下生成 —— 按过的下标本身就是一组解，所以**永远有解**；
     每次进来重掷，位置都不一样（背答案没用）。 */
  var LIGHTS = {
    nb: function (i, w) {
      var x = i % w, y = Math.floor(i / w), out = [i];
      if (x > 0) out.push(i - 1);
      if (x < w - 1) out.push(i + 1);
      if (y > 0) out.push(i - w);
      if (y < w - 1) out.push(i + w);
      return out;
    },
    full: function (w) { var a = [], i; for (i = 0; i < w * w; i++) a.push(1); return a; },
    flip: function (st, w, i) { LIGHTS.nb(i, w).forEach(function (k) { st[k] = st[k] ? 0 : 1; }); return st; },
    isFull: function (st) { for (var i = 0; i < st.length; i++) if (!st[i]) return false; return true; },
    scramble: function (w, n, rand) {
      var R = rand || rnd, st = LIGHTS.full(w);
      for (var i = 0; i < n; i++) LIGHTS.flip(st, w, R(w * w));
      if (LIGHTS.isFull(st)) LIGHTS.flip(st, w, R(w * w));
      return st;
    },
    /* 暴力解（3x3 只有 512 种按法）：测试拿它证明"每个乱局都解得开" */
    solve: function (st, w) {
      var n = w * w, best = null;
      for (var mask = 0; mask < (1 << n); mask++) {
        var cur = st.slice(), clicks = [];
        for (var i = 0; i < n; i++) if (mask & (1 << i)) { LIGHTS.flip(cur, w, i); clicks.push(i); }
        if (LIGHTS.isFull(cur) && (!best || clicks.length < best.length)) best = clicks;
      }
      return best;
    }
  };
  function lights(p) {
    var W = 3, st = LIGHTS.scramble(W, 3 + rnd(3));
    H.setBody('<p class="pz-tip">' + p.brief + '</p>' +
      '<div class="pz-clue">铁牌上刻着规矩：按一盏，它和自己上下左右一起翻。九盏全亮，海上的船才看得见岸。</div>' +
      '<div class="lz-grid" id="pz-lz"></div>' +
      '<div class="pz-progress" id="pz-prog"></div>');
    /* v38：棋盘只建一次，点击只翻类名（旧版每次点击 innerHTML='' 重建九格 —— 按钮被抽走、焦点掉 body，
       跟日记残页/断句是同一类"点一下闪一下"的毛病，一起收掉） */
    var g = q('#pz-lz');
    var cells = st.map(function (v, i) {
      var b = el('button', 'lz-cell' + (v ? ' on' : ''), '');
      b.setAttribute('data-i', i);
      b.onclick = function () { LIGHTS.flip(st, W, i); H.sfx('click'); paint(); };
      g.appendChild(b);
      return b;
    });
    function paint() {
      var off = 0;
      st.forEach(function (v, i) {
        cells[i].className = 'lz-cell' + (v ? ' on' : '');
        if (!v) off++;
      });
      var pr = q('#pz-prog');
      if (pr) pr.textContent = off ? ('还暗着 ' + off + ' 盏') : '九盏都亮了';
      if (!off) H.solve('lights');
    }
    H.setBtns([{ label: '先不按', fn: function () { H.close(); } }]);
    paint();
  }

  /* ============ 14. 柜台的算盘（当金 = 重量 × 每两当金；三张当票每次重掷） ============ */
  var BILL_GOODS = ['一枚银簪', '一副铜锁', '一件旧棉袄', '一只怀表', '一顶呢帽', '一台座钟', '一把裁纸刀', '半边砚台', '一串铜钱', '一只木匣'];
  function makeBill(rand) {
    var R = rand || rnd, pool = BILL_GOODS.slice(), rows = [], total = 0;
    for (var i = 0; i < 3; i++) {
      var name = pool.splice(R(pool.length), 1)[0];
      var wt = 2 + R(8), price = 3 + R(7);
      rows.push({ name: name, wt: wt, price: price, sub: wt * price });
      total += wt * price;
    }
    return { rows: rows, total: total };
  }
  function abacus(p) {
    var b = makeBill(), tries = 0;
    H.setBody('<p class="pz-tip">' + p.brief + '</p>' +
      '<div class="pz-clue">柜台的规矩：当金 = 重量（两）× 每两当金（枚）。三张当票都在一两以上，不用抹零。</div>' +
      '<div class="ab-table" id="pz-bill">' + b.rows.map(function (r) {
        return '<div class="ab-row"><span>' + r.name + '</span><span>' + r.wt + ' 两</span><span>每两 ' + r.price + ' 枚</span><span class="ab-q">?</span></div>';
      }).join('') + '</div>' +
      '<div class="pz-row"><input class="ab-in" id="pz-ab" type="number" inputmode="numeric" placeholder="合起来多少枚">' +
      '<span class="ab-unit">枚</span></div>' +
      '<div class="pz-progress" id="pz-prog">三张当票，一笔一笔算</div>');
    H.setBtns([
      { label: '报账', fn: function () {
        var box = q('#pz-ab'); if (!box) return;
        var v = parseInt(box.value, 10);
        var pr = q('#pz-prog');
        if (!(v >= 0)) { pr.textContent = '还没写数。'; return; }
        if (v === b.total) { H.solve('abacus'); return; }
        tries++; H.sfx('wrong');
        pr.textContent = tries >= 2
          ? ('不对。' + (v > b.total ? '报多了。' : '报少了。') + '提示：先把每张分开算，再合起来。')
          : '不对，再算一遍。';
      } },
      { label: '不算了', fn: function () { H.close(); } }
    ]);
  }

  /* ============ 15. 四块闸板（三条规矩 · 扳到位；规矩和谜底每局重掷） ============ */
  var GATES = ['甲', '乙', '丙', '丁'];
  function gateRuleSet(R) {
    var want = [R(2), R(2), R(2), R(2)];
    function cnt(as) { return as[0] + as[1] + as[2] + as[3]; }
    /* v38：谜底是全开/全关时，规矩表里那条总数告示（正好 0 块 / 正好 4 块）一句话就把答案念出来了
       —— 用户抽到的正是这种。这类谜底不掷，重掷到不是全一样为止（掷不出来就用最后一次的）。 */
    for (var reroll = 0; reroll < 24; reroll++) {
      var openSum = cnt(want);
      if (openSum > 0 && openSum < 4) break;
      want = [R(2), R(2), R(2), R(2)];
    }
    var wantOpen = cnt(want);
    var MADE = [
      function (a, b) { return { t: GATES[a] + '和' + GATES[b] + '只能一个样——要么都开，要么都关。', f: function (as) { return as[a] === as[b]; } }; },
      function (a, b) { return { t: GATES[a] + '和' + GATES[b] + '必须一个开一个关，不能一样。', f: function (as) { return as[a] !== as[b]; } }; },
      function (a, b) { return { t: GATES[a] + '要是开着，' + GATES[b] + '就得跟着开。', f: function (as) { return !as[a] || !!as[b]; } }; },
      function (a, b) { return { t: GATES[a] + '和' + GATES[b] + '里，至少得有一个开着。', f: function (as) { return !!(as[a] || as[b]); } }; },
      function (a) { return { t: '四块闸板里，正好 ' + wantOpen + ' 块是开着的。', f: function (as) { return cnt(as) === wantOpen; } }; },
      function (a) { return { t: GATES[a] + '得关着，水才压得住。', f: function (as) { return as[a] === 0; } }; }
    ];
    var rules = [];
    /* v38（用户实测「太简单了」）：把每条规矩当成 16 位掩码（16 种局面一个 bit 一位），
       直接**穷举**「三条合起来只剩一个解、且任意两条都还定不死」的紧凑局 ——
       之前是掷骰子凑 + 只查唯一解，实测 400 局里 13% 是「一句话就念出答案」的送礼局（用户就抽到这种）。
       穷举不会漏：找不到三条就找四条，仍然找不到才退回老口径（绝不把玩家卡在没有解的局里）。 */
    var wantIdx = want[0] | (want[1] << 1) | (want[2] << 2) | (want[3] << 3);
    var wantBit = 1 << wantIdx;
    function maskOf(f) {
      var mk = 0;
      for (var m = 0; m < 16; m++) {
        if (f([m & 1, (m >> 1) & 1, (m >> 2) & 1, (m >> 3) & 1])) mk |= (1 << m);
      }
      return mk;
    }
    function bits(x) { var n = 0; while (x) { n += x & 1; x >>>= 1; } return n; }
    var CAND = [], seenT = {};
    MADE.forEach(function (mk, mi) {
      /* 总数这一类规矩在「正好 0 / 正好 4 块」时，一句话就把答案念出来了 —— 用户踩到的就是这条，直接不用它 */
      if (mi === 4 && (wantOpen === 0 || wantOpen === 4)) return;
      for (var a = 0; a < 4; a++) for (var b = 0; b < 4; b++) {
        if (b === a) continue;
        var r = mk(a, b);
        if (seenT[r.t]) continue;
        seenT[r.t] = 1;
        var mk2 = maskOf(r.f);
        /* 注意别用 return：这是 forEach 的回调，return 会把这一整类规矩的其他配对全跳过（实测候选从 25 条掉到 10 条） */
        if (mk2 & wantBit) CAND.push({ t: r.t, f: r.f, mask: mk2 });   /* 只留谜底满足的规矩 */
      }
    });
    function pick(combo) {
      var rs = combo.map(function (i) { return { t: CAND[i].t, f: CAND[i].f }; });
      return { want: want, rules: rs, unique: true, tight: true, cand: CAND.length, hits: hits.length };
    }
    var hits = [];
    for (var i2 = 0; i2 < CAND.length && hits.length < 12; i2++) {
      for (var j2 = i2 + 1; j2 < CAND.length && hits.length < 12; j2++) {
        var ij = CAND[i2].mask & CAND[j2].mask;
        if (ij === wantBit) continue;                       /* 光这两条就定死了 → 第三条就是摆设 */
        for (var k2 = j2 + 1; k2 < CAND.length && hits.length < 12; k2++) {
          if ((ij & CAND[k2].mask) === wantBit) hits.push([i2, j2, k2]);
        }
      }
    }
    if (hits.length) return pick(hits[R(hits.length)]);
    for (var i3 = 0; i3 < CAND.length && hits.length < 12; i3++) {
      for (var j3 = i3 + 1; j3 < CAND.length && hits.length < 12; j3++) {
        for (var k3 = j3 + 1; k3 < CAND.length && hits.length < 12; k3++) {
          var ijk = CAND[i3].mask & CAND[j3].mask & CAND[k3].mask;
          if (ijk !== wantBit) continue;
          for (var l4 = 0; l4 < CAND.length; l4++) {
            if (l4 === i3 || l4 === j3 || l4 === k3) continue;
            var all4 = ijk & CAND[l4].mask;
            if (all4 !== wantBit) continue;
            if (((CAND[i3].mask & CAND[j3].mask & CAND[l4].mask) === wantBit) ||
                ((CAND[i3].mask & CAND[k3].mask & CAND[l4].mask) === wantBit) ||
                ((CAND[j3].mask & CAND[k3].mask & CAND[l4].mask) === wantBit)) break;   /* 有摆设 → 不紧凑 */
            hits.push([i3, j3, k3, l4]);
          }
        }
      }
    }
    if (hits.length) return pick(hits[R(hits.length)]);
    /* 兜底：真找不到紧凑局时退回老口径（唯一解即可） */
    for (var guard = 0; guard < 200 && rules.length < 6; guard++) {
      var ga = R(4), gb = R(4);
      if (gb === ga) gb = (gb + 1) % 4;
      var rg = MADE[R(MADE.length)](ga, gb);
      if (!rg.f(want)) continue;
      if (wantOpen === 0 || wantOpen === 4) { if (rg.t.indexOf('正好') === 0) continue; }   /* 总数一句话念答案的，兜底也不用 */
      if (rules.some(function (x) { return x.t === rg.t; })) continue;
      rules.push(rg);
      if (rules.length >= 3 && maskOf(function (as) { return rules.every(function (x) { return x.f(as); }); }) === wantBit) {
        return { want: want, rules: rules, unique: true, tight: false, cand: CAND.length, hits: hits.length };
      }
    }
    return { want: want, rules: rules, unique: false, tight: false };
  }
  function makeGates(rand) {
    var R = rand || rnd, g = null;
    for (var i = 0; i < 80; i++) { g = gateRuleSet(R); if (g.unique) return g; }
    return g;                                                       /* 兜底：极端情况下也让玩家扳（测试盯着唯一性） */
  }
  function switches(p) {
    var pz = makeGates(), as = [0, 0, 0, 0];
    H.setBody('<p class="pz-tip">' + p.brief + '</p>' +
      '<div class="pz-clue">堤上钉着 ' + pz.rules.length + ' 块告示，写的就是扳闸板的规矩：' +
      pz.rules.map(function (r, i) { return '<br>' + (i + 1) + '. ' + r.t; }).join('') + '</div>' +
      '<div class="pz-row" id="pz-gates">' + GATES.map(function (g, i) {
        return '<button class="pz-opt gate" data-i="' + i + '">' + g + '<br><small>关</small></button>';
      }).join('') + '</div>' +
      '<div class="pz-progress" id="pz-prog">四块闸板，一块一块扳</div>');
    function draw() {
      qa('#pz-gates .pz-opt').forEach(function (b, i) {
        b.classList.toggle('on', !!as[i]);
        b.querySelector('small').textContent = as[i] ? '开' : '关';
      });
    }
    qa('#pz-gates .pz-opt').forEach(function (b, i) {
      b.onclick = function () { as[i] = as[i] ? 0 : 1; H.sfx('click'); draw(); };
    });
    H.setBtns([
      { label: '扳到位', fn: function () {
        var bad = pz.rules.filter(function (r) { return !r.f(as); });
        if (!bad.length) { H.solve('switches'); return; }
        H.sfx('wrong');
        q('#pz-prog').textContent = '第 ' + (pz.rules.indexOf(bad[0]) + 1) + ' 条不对劲：' + bad[0].t;
      } },
      { label: '先不扳', fn: function () { H.close(); } }
    ]);
    draw();
  }

  /* ============ 16. 换过字的契（字表往后错 k 位；k 和那个词每次都重掷） ============ */
  var CIPHER_TABLE = ['阿', '隐', '灯', '娘', '替', '记', '雾', '客', '盐', '堤', '船', '铃', '岸', '潮', '名', '字', '火', '窗', '门', '石', '碑', '史', '当', '纸'];
  var CIPHER_WORDS = [['阿', '隐'], ['替', '记'], ['灯', '娘'], ['雾', '客'], ['名', '字'], ['盐', '堤']];
  function makeCipher(rand) {
    var R = rand || rnd, k = 3 + R(5);
    var word = CIPHER_WORDS[R(CIPHER_WORDS.length)].slice();
    var shown = word.map(function (ch) {
      var at = (CIPHER_TABLE.indexOf(ch) + k) % CIPHER_TABLE.length;
      return { ch: CIPHER_TABLE[at], at: at };
    });
    return { k: k, word: word, shown: shown };
  }
  function cipher(p) {
    var c = makeCipher(), picked = [];
    H.setBody('<p class="pz-tip">' + p.brief + '</p>' +
      '<div class="pz-clue">契上的规矩：每个字都按字表<b>往后错 ' + c.k + ' 位</b>写（错到末尾就从头绕）。<br>' +
        '字表：' + CIPHER_TABLE.map(function (ch, i) { return '<span class="ci-cell" data-i="' + i + '"><b>' + i + '</b>' + ch + '</span>'; }).join('') + '</div>' +
      '<div class="pz-progress">契上写的是：' + c.shown.map(function (s) { return '「' + s.ch + '」（字表第 ' + s.at + '）'; }).join('　') + '</div>' +
      '<div class="pz-slots" id="pz-ci">' + c.word.map(function (x, i) { return '<span class="pz-slot" data-i="' + i + '">?</span>'; }).join('') + '</div>' +
      '<div class="pz-progress" id="pz-prog">往后错 ' + c.k + ' 位写的，往前推 ' + c.k + ' 位才读得回。</div>');
    function slots() { return qa('#pz-ci .pz-slot'); }
    function drawSlots() {
      slots().forEach(function (s, i) {
        s.textContent = picked[i] == null ? '?' : CIPHER_TABLE[picked[i]];
        s.classList.toggle('filled', picked[i] != null);
      });
    }
    qa('.ci-cell').forEach(function (cell) {
      cell.onclick = function () {
        if (picked.length >= c.word.length) return;
        picked.push(+cell.getAttribute('data-i'));
        H.sfx('click'); drawSlots();
        q('#pz-prog').textContent = '这是第 ' + picked.length + ' 个字。';
      };
    });
    H.setBtns([
      { label: '退一个字', fn: function () { picked.pop(); drawSlots(); } },
      { label: '照这样读', fn: function () {
        if (picked.length < c.word.length) { q('#pz-prog').textContent = '还没填满。'; return; }
        var got = picked.map(function (i) { return CIPHER_TABLE[i]; }).join('');
        if (got === c.word.join('')) { H.solve('cipher'); return; }
        H.sfx('wrong');
        q('#pz-prog').textContent = '读出来是「' + got + '」，读不通。错位不是加就是减——契上是往后错的。';
      } },
      { label: '先不读', fn: function () { H.close(); } }
    ]);
    drawSlots();
  }

  /* ============ 17. 断句（撕成两半的话拼回去；两列每次都洗牌） ============ */
  function shuffle(a, rand) {
    var R = rand || rnd;
    for (var i = a.length - 1; i > 0; i--) { var j = R(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function halves(p) {
    var pairs = (p.pairs || []).slice();
    var lefts = shuffle(pairs.map(function (pr, i) { return { i: i, t: pr[0] }; }));
    var rights = shuffle(pairs.map(function (pr, i) { return { i: i, t: pr[1] }; }));
    var sel = null, hit = {}, miss = 0;
    H.setBody('<p class="pz-tip">' + p.brief + '</p>' +
      '<div class="pz-clue">雾里的纸被撕成了两半：左半句在左边，右半句在右边。先点左边一句，再点右边接得上的那半句。</div>' +
      '<div class="hp-wrap"><div class="hp-col" id="pz-half-l"></div><div class="hp-col" id="pz-half-r"></div></div>' +
      '<div class="pz-progress" id="pz-prog"></div>');
    /* v38（用户报「这个也是点击的时候会有一个线突然出现」）：改**原地更新**。
       旧版每次点击都把两列 innerHTML 整片重刷 —— 被点中的按钮当场被抽走：焦点掉到 body，
       浏览器按"把焦点元素带进视野"的规矩还可能顺手滚一下容器，看到的就是那一下闪跳。
       现在两列按钮只建一次，点击只改类名与进度文字，DOM 不动 → 不闪、不跳、焦点还在。 */
    var lBtns = [], rBtns = [];
    lefts.forEach(function (x) {
      var b = el('button', 'pz-opt hp', x.t);
      b.setAttribute('data-i', x.i);
      b.onclick = function () {
        if (hit[x.i]) return;
        sel = x.i; H.sfx('click'); paint();
      };
      lBtns.push(b);
      q('#pz-half-l').appendChild(b);
    });
    rights.forEach(function (x) {
      var b = el('button', 'pz-opt hp', x.t);
      b.setAttribute('data-i', x.i);
      b.onclick = function () {
        var j = x.i;
        if (hit[j]) return;
        if (sel === null) { q('#pz-prog').textContent = '先在左边点一句。'; return; }
        if (j === sel) { hit[j] = 1; sel = null; H.sfx('open'); }
        else { miss++; sel = null; H.sfx('wrong'); }
        paint();
      };
      rBtns.push(b);
      q('#pz-half-r').appendChild(b);
    });
    function paint() {
      lBtns.forEach(function (b) {
        var i = +b.getAttribute('data-i');
        b.className = 'pz-opt hp' + (hit[i] ? ' on' : '') + (sel === i ? ' sel' : '');
      });
      rBtns.forEach(function (b) {
        var i = +b.getAttribute('data-i');
        b.className = 'pz-opt hp' + (hit[i] ? ' on' : '');
      });
      var done = Object.keys(hit).length;
      var pr = q('#pz-prog');
      if (pr) pr.textContent = '接上了 ' + done + '/' + pairs.length + ' 句' + (miss ? '（错了 ' + miss + ' 回）' : '');
      if (done === pairs.length) H.solve('halves');
    }
    H.setBtns([{ label: '先不接', fn: function () { H.close(); } }]);
    paint();
  }

  /* ============ 18. 连环锁（幕五 · 五道环 · 六百秒 · 超时从第一道重来） ============
     v35：用户判了旧那五道（记数/对位/配重/对牌/灯序）"一点难度都没有" —— 那是「手」的题。
     现在五枚环各是一道**要动脑的推理题**，而且是一副**连环**：环四的题面现场引用前三枚的答案，
     环五引用前四枚。前几枚咬出来的样子整份登在面板的凭据栏里 —— 证据全在面板内，不许靠记忆、不许跑腿。
     规矩（用户 2026-10-13 亲口）：
       · 六百秒内一枚一枚解完；表走完 → 五枚一起弹回去、从第一枚重来、这一轮的题全部重掷；
       · 同一枚环**错两次** → 整锁弹回 + 重新计时 + 计数归零；
       · 弹回越多，铁牌背面给的**方法**提示越多（上限三层，只给方法不给答案）。
     出题一律**生成式**：随手取一个解 → 随机生成约束 → **穷举全部候选验"恰好唯一解"**（不唯一就加线索/重掷）。
     `space`/`holds`/`answer` 三个出口就是给判据机械复核唯一解用的 —— holds 是老实实现，不写只认 answer 的假货。 */
  var CHAIN_LIMIT = 600;   /* 100 → 600：2026-10-12 用户拍板「我承认 100 秒，也许连第一关都过不去，加时间吧」= 10 分钟 / 平均每枚环 2 分钟 */
  var CHAIN_NAMES = ['一', '二', '三', '四', '五'];
  var CHAIN_MARKS = ['雾', '灯', '海', '名', '岸', '钟', '贝', '船'];
  var CHAIN_CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  /* 旧的「对牌」词条：不在环上了，别的口径还在引，留着 */
  var CHAIN_PAIRS = [
    ['替记', '拿自己的一段记，替别人背一笔债'],
    ['雾客', '雾里站着不动的人'],
    ['当金', '记能换成的钱'],
    ['入册', '镇上立过的契都在这本里'],
    ['望归灯', '每夜要亮一百分钟'],
    ['雾铃', '起雾时挂在码头上响的东西'],
    ['潮到三刻', '旧钟上的三点四十五分']
  ];
  var CHAIN = (function () {
    /* ================= 出题底座：候选 / 判据 / 唯一解 ================= */

    /* 全排列（五个 = 120 种，判据要把它们一种不落地穷举一遍） */
    function perms(arr) {
      var out = [], cur = [], used = [], i;
      for (i = 0; i < arr.length; i++) used.push(false);
      (function rec() {
        if (cur.length === arr.length) { out.push(cur.slice()); return; }
        for (var k = 0; k < arr.length; k++) {
          if (used[k]) continue;
          used[k] = true; cur.push(arr[k]); rec(); cur.pop(); used[k] = false;
        }
      })();
      return out;
    }
    function same(a, b) {
      if (!a || !b || a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
      return true;
    }
    function posOf(arr, v) { for (var i = 0; i < arr.length; i++) if (arr[i] === v) return i; return -1; }
    function matches(cand, trial) { var n = 0; for (var i = 0; i < cand.length; i++) if (cand[i] === trial[i]) n++; return n; }
    function pickN(R, pool, n) { return shuffle(pool.slice(), R).slice(0, n); }
    function bits(a) { var n = 0; for (var i = 0; i < a.length; i++) if (a[i]) n++; return n; }
    function swapOne(R, arr) {
      var b = arr.slice(), i = R(b.length), j = (i + 1 + R(b.length - 1)) % b.length, t = b[i];
      b[i] = b[j]; b[j] = t; return b;
    }

    /* 线索是**数据**不是闭包 —— node 能 JSON 序列化，判据拿 node 比对"题面变没变"时才是真在比题面。
       at/notat/before/adj/between 对排列类候选通用（值可以是字，也可以是环的号）；
       trial 是环一的"试排 —— 对了几位"。 */
    function arrOK(cand, cls) {
      for (var k = 0; k < cls.length; k++) {
        var c = cls[k], pa, pb, pv;
        if (c.t === 'at') { if (cand[c.k] !== c.v) return false; }
        else if (c.t === 'notat') { if (cand[c.k] === c.v) return false; }
        else if (c.t === 'before') {
          pa = posOf(cand, c.a); pb = posOf(cand, c.b);
          if (!(pa >= 0 && pb >= 0 && pa < pb)) return false;
        } else if (c.t === 'adj') {
          pa = posOf(cand, c.a); pb = posOf(cand, c.b);
          if (Math.abs(pa - pb) !== 1) return false;
        } else if (c.t === 'between') {
          pa = posOf(cand, c.a); pb = posOf(cand, c.b); pv = posOf(cand, c.v);
          if (!((pa < pv && pv < pb) || (pb < pv && pv < pa))) return false;
        } else if (c.t === 'trial') {
          if (matches(cand, c.arr) !== c.hit) return false;
        }
      }
      return true;
    }

    /* 造唯一解：线索池**前面是弱线索、尾巴上压着"必胜"线索**（能一格一格钉死目标解的那种）。
       一条条挑：能把候选缩小的就收下，直到候选里只剩目标解；加完还要穷举核一遍，核不过就重掷。 */
    function narrow(space, target, pool, keep, ok) {
      var chosen = pool.slice(0, keep), sol = [], i, p;
      for (i = 0; i < space.length; i++) if (ok(space[i], chosen)) sol.push(space[i]);
      for (i = keep; i < pool.length && sol.length > 1; i++) {
        var s2 = [];
        for (p = 0; p < sol.length; p++) if (ok(sol[p], [pool[i]])) s2.push(sol[p]);
        if (s2.length < sol.length) { chosen.push(pool[i]); sol = s2; }
      }
      if (sol.length !== 1 || !same(sol[0], target)) return null;
      return { clauses: chosen, sol: sol[0] };
    }

    /* 必胜线索：把目标解一格一格写出来（弱线索实在不够用时，narrow 才会把它们收进来） */
    function pinClauses(R, target, n) {
      var idx = [], out = [], i;
      for (i = 0; i < target.length; i++) idx.push(i);
      shuffle(idx, R);
      for (i = 0; i < Math.min(n, idx.length); i++) out.push({ t: 'at', k: idx[i], v: target[idx[i]] });
      return out;
    }

    /* 随机构一条排列类线索（能不能用在目标解上，由调用方拿 arrOK 筛） */
    function someClause(R, vals) {
      var n = vals.length, k = R(7), i, j, p;
      if (k === 0) return { t: 'at', k: R(n), v: vals[R(n)] };
      if (k === 1) return { t: 'notat', k: R(n), v: vals[R(n)] };
      if (k === 2 || k === 3) { i = R(n); j = (i + 1 + R(n - 1)) % n; return { t: 'before', a: vals[i], b: vals[j] }; }
      if (k === 4) { i = R(n); j = (i + 1 + R(n - 1)) % n; return { t: 'adj', a: vals[i], b: vals[j] }; }
      p = shuffle(vals.slice(), R);
      return { t: 'between', a: p[0], b: p[1], v: p[2] };
    }
    /* 攒 want 条"在目标解上为真"的弱线索 */
    function trueClauses(R, target, want) {
      var out = [], tries = 0;
      while (out.length < want && tries < 300) {
        tries++;
        var c = someClause(R, target);
        if (arrOK(target, [c])) out.push(c);
      }
      return out;
    }
    /* 目标解：**直接在候选空间里挑一个满足全部派生线索的**。
       为什么不用"随手拼一个再试"：拼出来的解有可能不满足自己的线索（比如"环三咬在环一前面"
       撞上"环一钉在第一格"），那样节点就成了 0 解 —— 判据 ① 会当场抓住（1000 种子里抓到过一次）。
       在空间里挑就不会有这种事：挑出来的解**按定义**满足它自己那一套线索。 */
    function pickTarget(R, values, cls) {
      var sp = perms(values), out = [], i;
      for (i = 0; i < sp.length; i++) if (arrOK(sp[i], cls)) out.push(sp[i]);
      if (!out.length) return null;
      return out[R(out.length)].slice();
    }

    /* ================= 环一 · 咬合（排除法）=================
       五个字咬进五个齿位（候选 5! = 120）。铁牌上列着几条**试排**，每条只报"对了几位"。
       推法：两条只差一个对调的试排摆一起比，差出来的数只跟那两格有关；再一位一位地划。
       光靠试排钉不死全部 120 种，所以线索池尾巴上压着四条"哪格是哪字"的必胜线索（不够用时才收）。 */
    var RING_BITE = {
      kind: 'bite', name: '咬合',
      make: function (R) {
        var last = null, att, i, t, k, marks, target, pool, seen, nk, kinds, got;
        for (att = 0; att < 40 && !last; att++) {
          marks = pickN(R, CHAIN_MARKS, 5);
          target = shuffle(marks.slice(), R);
          pool = []; seen = {};
          for (i = 0; i < 30 && pool.length < 7; i++) {
            t = shuffle(marks.slice(), R);
            k = matches(t, target);
            if (k === 5) continue;                       /* 跟答案一模一样的那条等于把答案送出去 */
            if (seen[t.join('')]) continue;
            seen[t.join('')] = 1;
            pool.push({ t: 'trial', arr: t, hit: k });
          }
          if (pool.length < 6) continue;
          kinds = {}; nk = 0;
          for (i = 0; i < pool.length; i++) if (!kinds[pool[i].hit]) { kinds[pool[i].hit] = 1; nk++; }
          if (nk < 2) continue;                          /* 全报同一个数就没什么好比的了 */
          got = narrow(perms(marks), target, pool.concat(pinClauses(R, target, 4)), 4, arrOK);
          if (got && got.clauses.length <= 7) {
            last = { kind: 'bite', name: '咬合', marks: marks.slice(), trials: got.clauses, sol: got.sol.slice() };
          }
        }
        if (!last) {
          /* 兜底：几乎跑不到 —— 四条试排（各差一个对调）+ 四条必胜线索，必唯一 */
          var mk = pickN(R, CHAIN_MARKS, 5), tg = shuffle(mk.slice(), R), fb = [], f;
          for (f = 0; f < 4; f++) fb.push({ t: 'trial', arr: swapOne(R, tg), hit: 3 });
          var g2 = narrow(perms(mk), tg, fb.concat(pinClauses(R, tg, 4)), 4, arrOK);
          last = {
            kind: 'bite', name: '咬合', marks: mk.slice(),
            trials: (g2 ? g2.clauses : pinClauses(R, tg, 4)), sol: (g2 ? g2.sol : tg).slice()
          };
        }
        return last;
      },
      space: function (n) { return perms(n.marks); },
      holds: function (n, c) { return arrOK(c, n.trials); },
      answer: function (n) { return n.sol.slice(); }
    };

    /* ================= 环二 · 证词（自指真假）=================
       七句话互相指涉（"第几句是假话""恰好有几句真话"），候选 = 128 种"哪几句为真"。
       一句话的真假必须跟它断言的内容一致 —— 整个系统的**不动点**才是答案：这就是"必须联立"。
       生成：随手取一个真假组合当解 → 每句挑一条在它上面成立、又不恒真恒假的句式 →
             穷举 128 种验"恰好一个不动点、而且就是那个解"。 */
    var SAY_N = 7;
    function sayPool(R, i, N) {
      var others = [], k;
      for (k = 0; k < N; k++) if (k !== i) others.push(k);
      var j = others[R(others.length)];
      return [
        { t: 'count', k: 1 + R(N - 2) },
        { t: 'parity', p: R(2) },
        { t: 'isfalse', i: i },                          /* 「这一句是假话」：经典自指，不动点从不存在，选不上 */
        { t: 'istrue', i: j },
        { t: 'isfalse', i: j },
        { t: 'diff', i: i, j: j },
        { t: 'same', i: i, j: j },
        { t: 'impl', i: i, j: j },
        { t: 'somefalse', i: i, j: j }
      ];
    }
    function sayTruth(s, a) {
      var c = bits(a);
      if (s.t === 'count') return c === s.k;
      if (s.t === 'parity') return (c % 2) === s.p;
      if (s.t === 'istrue') return a[s.i] === 1;
      if (s.t === 'isfalse') return a[s.i] === 0;
      if (s.t === 'diff') return a[s.i] !== a[s.j];
      if (s.t === 'same') return a[s.i] === a[s.j];
      if (s.t === 'impl') return !(a[s.i] === 1 && a[s.j] === 0);
      if (s.t === 'somefalse') return !(a[s.i] === 1 && a[s.j] === 1);
      return false;
    }
    function saysOK(says, a) {
      for (var i = 0; i < says.length; i++) if (sayTruth(says[i], a) !== (a[i] === 1)) return false;
      return true;
    }
    function sayRef(s, own) {                            /* 这句指着哪一句（指自己/不指人 = -1） */
      if (s.t === 'count' || s.t === 'parity') return -1;
      var tgt = (s.t === 'diff' || s.t === 'same' || s.t === 'impl' || s.t === 'somefalse') ? s.j : s.i;
      return tgt === own ? -1 : tgt;
    }
    function varies(st, N) {                             /* 恒真/恒假的话是废句，不收 */
      var seen = {}, m, i, a;
      for (m = 0; m < (1 << N); m++) {
        a = [];
        for (i = 0; i < N; i++) a.push((m >> i) & 1);
        seen[sayTruth(st, a) ? 1 : 0] = 1;
        if (seen[0] && seen[1]) return true;
      }
      return false;
    }
    function hasCycle(says, N) {                         /* 指来指去要成环，这才叫互相指涉 */
      for (var s = 0; s < N; s++) {
        var cur = s, steps = 0;
        while (steps++ < N) {
          var nx = sayRef(says[cur], cur);
          if (nx < 0) break;
          cur = nx;
          if (cur === s) return true;
        }
      }
      return false;
    }
    function sayText(s) {
      if (s.t === 'count') return '这七句话里，说真话的恰好有 ' + CHAIN_CN[s.k] + ' 句。';
      if (s.t === 'parity') return '这七句话里，说真话的句数是' + (s.p ? '奇数' : '偶数') + '。';
      if (s.t === 'istrue') return '第 ' + CHAIN_CN[s.i + 1] + ' 句是真话。';
      if (s.t === 'isfalse') return '第 ' + CHAIN_CN[s.i + 1] + ' 句是假话。';
      if (s.t === 'diff') return '第 ' + CHAIN_CN[s.i + 1] + ' 句和第 ' + CHAIN_CN[s.j + 1] + ' 句，一真一假。';
      if (s.t === 'same') return '第 ' + CHAIN_CN[s.i + 1] + ' 句和第 ' + CHAIN_CN[s.j + 1] + ' 句，要么都真、要么都假。';
      if (s.t === 'impl') return '要是第 ' + CHAIN_CN[s.i + 1] + ' 句为真，第 ' + CHAIN_CN[s.j + 1] + ' 句也就为真。';
      if (s.t === 'somefalse') return '第 ' + CHAIN_CN[s.i + 1] + ' 句、第 ' + CHAIN_CN[s.j + 1] + ' 句里，至少有一句是假话。';
      return '';
    }
    var RING_TESTIMONY = {
      kind: 'testimony', name: '证词',
      make: function (R) {
        var N = SAY_N, att, i, m, p, refs, sols, a;
        for (att = 0; att < 300; att++) {
          var tgt = [], cnt = 2 + R(4);
          var idxs = shuffle([0, 1, 2, 3, 4, 5, 6], R).slice(0, cnt);
          for (i = 0; i < N; i++) tgt.push(0);
          for (i = 0; i < idxs.length; i++) tgt[idxs[i]] = 1;
          var says = [], okAll = true;
          for (i = 0; i < N; i++) {
            var pool = sayPool(R, i, N), cands = [];
            for (p = 0; p < pool.length; p++) {
              if (sayTruth(pool[p], tgt) !== (tgt[i] === 1)) continue;
              if (!varies(pool[p], N)) continue;
              cands.push(pool[p]);
            }
            if (!cands.length) { okAll = false; break; }
            says.push(cands[R(cands.length)]);
          }
          if (!okAll) continue;
          refs = 0;
          for (i = 0; i < N; i++) if (sayRef(says[i], i) >= 0) refs++;
          if (refs < 3) continue;
          if (!hasCycle(says, N)) continue;
          sols = [];
          for (m = 0; m < (1 << N); m++) {
            a = [];
            for (i = 0; i < N; i++) a.push((m >> i) & 1);
            if (saysOK(says, a)) sols.push(a);
          }
          if (sols.length !== 1 || !same(sols[0], tgt)) continue;
          return { kind: 'testimony', name: '证词', says: says, texts: says.map(sayText), sol: tgt.slice() };
        }
        /* 兜底：几乎跑不到 —— 首句报"恰好六句真"、其余六句都指首句，唯一不动点（全假） */
        var fs = [{ t: 'count', k: N - 1 }], t2 = [0];
        for (i = 1; i < N; i++) { fs.push({ t: 'istrue', i: 0 }); t2.push(0); }
        return { kind: 'testimony', name: '证词', says: fs, texts: fs.map(sayText), sol: t2 };
      },
      space: function (n) {
        var out = [], m, i;
        for (m = 0; m < (1 << n.says.length); m++) {
          var a = [];
          for (i = 0; i < n.says.length; i++) a.push((m >> i) & 1);
          out.push(a);
        }
        return out;
      },
      holds: function (n, c) { return c.length === n.says.length && saysOK(n.says, c); },
      answer: function (n) { return n.sol.slice(); }
    };

    /* ================= 环三 · 对质（真假与位次联立）=================
       五个人各咬一格、各留一句话；账上记着"一共几句真话" + 真话那几位咬的位次（和/奇偶/最靠前）。
       候选 = 5! = 120 种次序。生成：随手取一个次序当解 → 每人的话挑一条"在这解上恰好真/恰好假"的说法
       → 账从解上抠出来（绝不拍脑袋）→ 穷举 120 种验唯一，账不够就再加一笔。 */
    function liarSayTruth(s, cand) {
      if (s.t === 'selfat') return cand[s.k] === s.v;
      if (s.t === 'at') return cand[s.k] === s.v;
      if (s.t === 'notat') return cand[s.k] !== s.v;
      if (s.t === 'before') return posOf(cand, s.a) < posOf(cand, s.b);
      if (s.t === 'adj') return Math.abs(posOf(cand, s.a) - posOf(cand, s.b)) === 1;
      return false;
    }
    function liarSay(R, people, target, i, b) {
      var me = people[i], k, k2, p, a, att, shape;
      for (att = 0; att < 24; att++) {
        shape = R(5);
        if (shape === 0) {                               /* 我咬在第 k 格 */
          k = posOf(target, me);
          if (!b) k = (k + 1 + R(4)) % 5;
          return { t: 'selfat', v: me, k: k };
        }
        if (shape === 1 || shape === 2) {                /* 谁咬在第 k 格 / 谁不在第 k 格 */
          p = R(5); k = posOf(target, people[p]);
          if (shape === 1) {
            if (!b) k = (k + 1 + R(4)) % 5;
            return { t: 'at', v: people[p], k: k };
          }
          if (b) { k2 = (k + 1 + R(4)) % 5; return { t: 'notat', v: people[p], k: k2 }; }
          return { t: 'notat', v: people[p], k: k };
        }
        if (shape === 3) {                               /* 谁咬在我前面 */
          p = R(5); if (p === i) continue;
          a = people[p];
          if (b === (posOf(target, a) < posOf(target, me))) return { t: 'before', a: a, b: me };
          continue;
        }
        p = R(5); if (p === i) continue;                 /* 谁跟我挨着 */
        a = people[p];
        if (b === (Math.abs(posOf(target, a) - posOf(target, me)) === 1)) return { t: 'adj', a: a, b: me };
      }
      k = posOf(target, me);
      if (!b) k = (k + 1) % 5;
      return { t: 'selfat', v: me, k: k };
    }
    function liarSayText(s, speaker) {
      if (s.t === 'selfat') return speaker + '说：我咬在第 ' + CHAIN_CN[s.k + 1] + ' 格。';
      if (s.t === 'at') return speaker + '说：' + s.v + '咬在第 ' + CHAIN_CN[s.k + 1] + ' 格。';
      if (s.t === 'notat') return speaker + '说：' + s.v + '不在第 ' + CHAIN_CN[s.k + 1] + ' 格。';
      if (s.t === 'before') return speaker + '说：' + s.a + '咬在我前面。';
      if (s.t === 'adj') return speaker + '说：' + s.a + '和我挨着。';
      return '';
    }
    function liarStats(people, cand, t) {
      var st = { ts: 0, sum: 0, odd: 0, mn: 9, mx: -1 }, i, p;
      for (i = 0; i < t.length; i++) {
        if (!t[i]) continue;
        p = posOf(cand, people[i]);
        st.ts++; st.sum += p;
        if (p % 2 === 0) st.odd++;
        if (p < st.mn) st.mn = p;
        if (p > st.mx) st.mx = p;
      }
      return st;
    }
    function liarTruths(node, cand) {
      var t = [];
      for (var i = 0; i < node.says.length; i++) t.push(liarSayTruth(node.says[i], cand) ? 1 : 0);
      return t;
    }
    function liarFactOK(st, f) {
      if (f.t === 'fcnt') return st.ts === f.n;
      if (f.t === 'fsum') return st.ts > 0 && st.sum === f.n;
      if (f.t === 'fodd') return st.ts > 0 && st.odd === f.n;
      if (f.t === 'fmin') return st.ts > 0 && st.mn === f.n;
      if (f.t === 'fmax') return st.ts > 0 && st.mx === f.n;
      return true;
    }
    function liarFactText(f) {
      if (f.t === 'fcnt') return '五句话里，说真话的恰好有 ' + CHAIN_CN[f.n] + ' 句。';
      if (f.t === 'fsum') return '说真话的那几位，咬的位次加起来恰好是 ' + CHAIN_CN[f.n] + '。';
      if (f.t === 'fodd') return '说真话的那几位里，咬在奇数格（一、三、五）的恰好有 ' + CHAIN_CN[f.n] + ' 个。';
      if (f.t === 'fmin') return '说真话的那几位里，咬得最靠前的在第 ' + CHAIN_CN[f.n + 1] + ' 格。';
      if (f.t === 'fmax') return '说真话的那几位里，咬得最靠后的在第 ' + CHAIN_CN[f.n + 1] + ' 格。';
      return '';
    }
    function liarClauseOK(node, cand, cls) {
      var t = liarTruths(node, cand), st = null, i, c;
      for (i = 0; i < cls.length; i++) {
        c = cls[i];
        if (c.t.charAt(0) === 'f') {
          if (!st) st = liarStats(node.people, cand, t);
          if (!liarFactOK(st, c)) return false;
        } else if (!arrOK(cand, [c])) return false;
      }
      return true;
    }
    var RING_LIARS = {
      kind: 'liars', name: '对质',
      make: function (R, prev) {
        var people = (prev && prev[0] && prev[0].length === 5) ? prev[0].slice() : pickN(R, CHAIN_MARKS, 5);
        var space = perms(people), att, i;
        for (att = 0; att < 60; att++) {
          var target = shuffle(people.slice(), R), says = [];
          for (i = 0; i < 5; i++) says.push(liarSay(R, people, target, i, R(2) === 1));
          var t = [];
          for (i = 0; i < 5; i++) t.push(liarSayTruth(says[i], target) ? 1 : 0);
          var nT = 0;
          for (i = 0; i < 5; i++) nT += t[i];
          if (nT < 1 || nT > 4) continue;                /* 全真/全假没什么可联立的 */
          var st = liarStats(people, target, t);
          var node = { kind: 'liars', name: '对质', people: people.slice(), says: says };
          var pool = [
            { t: 'fcnt', n: st.ts }, { t: 'fodd', n: st.odd }, { t: 'fsum', n: st.sum },
            { t: 'fmin', n: st.mn }, { t: 'fmax', n: st.mx }
          ];
          var ok = function (cand, cls) { return liarClauseOK(node, cand, cls); };
          var got = narrow(space, target, pool.concat(pinClauses(R, target, 4)), 1, ok);
          if (!got || got.clauses.length > 5) continue;  /* 账记得太啰嗦就重掷一把清爽的 */
          node.clauses = got.clauses;
          node.sol = got.sol.slice();
          return node;
        }
        /* 兜底：几乎跑不到 —— 五笔"谁在哪格"的账 + 一句真话数 */
        var pp = people.slice(), tg = shuffle(pp.slice(), R), ss = [], ii;
        for (ii = 0; ii < 5; ii++) ss.push({ t: 'selfat', v: pp[ii], k: posOf(tg, pp[ii]) });
        var tt = [], nt = 0;
        for (ii = 0; ii < 5; ii++) { tt.push(1); nt++; }
        var node2 = { kind: 'liars', name: '对质', people: pp, says: ss };
        var g3 = narrow(space, tg, [{ t: 'fcnt', n: nt }].concat(pinClauses(R, tg, 4)), 1,
          function (cand, cls) { return liarClauseOK(node2, cand, cls); });
        node2.clauses = (g3 ? g3.clauses : pinClauses(R, tg, 4));
        node2.sol = (g3 ? g3.sol : tg).slice();
        return node2;
      },
      space: function (n) { return perms(n.people); },
      holds: function (n, c) { return liarClauseOK(n, c, n.clauses); },
      answer: function (n) { return n.sol.slice(); }
    };

    /* ================= 环四 · 归还（真·连环：题面现场引用前三枚的答案）=================
       环一咬出来的五个字、环二说真话的句数、环三咬出来的次序 —— 整份登在凭据栏（证据在面板里），
       再折成三条线索。改掉前面任何一枚的解，这一枚的凭据和线索都会跟着变：这才叫连环，不是装饰。 */
    function arrClauseText(c, lab) {
      lab = lab || function (v) { return '『' + v + '』'; };
      if (c.t === 'at') return lab(c.v) + '咬在第 ' + CHAIN_CN[c.k + 1] + ' 格。';
      if (c.t === 'notat') return lab(c.v) + '不咬在第 ' + CHAIN_CN[c.k + 1] + ' 格。';
      if (c.t === 'before') return lab(c.a) + '咬在' + lab(c.b) + '前面。';
      if (c.t === 'adj') return lab(c.a) + '和' + lab(c.b) + '咬着挨着的两格。';
      if (c.t === 'between') return lab(c.v) + '咬在' + lab(c.a) + '和' + lab(c.b) + '中间。';
      if (c.t === 'trial') return '试排：' + c.arr.join(' ') + '　—— 对了 ' + CHAIN_CN[c.hit] + ' 位。';
      return '';
    }
    var RING_RETURN = {
      kind: 'return', name: '归还',
      make: function (R, prev) {
        var r1 = (prev && prev[0] && prev[0].length === 5) ? prev[0].slice() : pickN(R, CHAIN_MARKS, 5);
        var r2 = (prev && prev[1] && prev[1].length === 7) ? prev[1].slice() : [1, 0, 1, 0, 1, 0, 1];
        var r3 = (prev && prev[2] && prev[2].length === 5) ? prev[2].slice() : r1.slice().reverse();
        var marks = r1.slice(), T2 = bits(r2);
        var a1 = r1[0];
        var k1 = posOf(r3, a1); if (k1 < 0) k1 = 0;
        var a2 = (r3[4] === a1) ? r3[3] : r3[4];         /* 别跟 a1 撞成同一个字 */
        var k2 = posOf(r1, a2); if (k2 < 0) k2 = (k1 + 1) % 5;
        var d1 = { t: 'at', k: k1, v: a1 };              /* 环一第一格那个字 → 它在环三里排第几格 */
        var d2 = (k2 !== k1) ? { t: 'at', k: k2, v: a2 } /* 环三最后那个字 → 它在环一里排第几格 */
          : { t: 'before', a: a2, b: a1 };
        var rest = [], q;
        for (q = 0; q < 5; q++) if (marks[q] !== a1 && marks[q] !== a2) rest.push(marks[q]);
        var a3 = rest[T2 % rest.length], b3 = rest[(T2 + 1) % rest.length];
        var d3 = { t: 'before', a: a3, b: b3 };          /* 环二说真话的句数 → 环一里第几格那个字在前 */
        var derived = [d1, d2, d3];
        var target = pickTarget(R, marks, derived);
        for (var dAtt = 0; !target && dAtt < 3; dAtt++) { /* 关系线索撞死了：翻方向、再不行就退掉一条 */
          if (dAtt === 0) { d3 = { t: 'before', a: d3.b, b: d3.a }; derived = [d1, d2, d3]; }
          else if (dAtt === 1) { derived = [d1, d2]; }
          else { derived = [d1]; }
          target = pickTarget(R, marks, derived);
        }
        if (!target) target = shuffle(marks.slice(), R);
        var node = { kind: 'return', name: '归还', marks: marks.slice() };
        var ok = function (cand, cls) { return arrOK(cand, cls); };
        var got = narrow(perms(marks), target, derived.concat(trueClauses(R, target, 4)).concat(pinClauses(R, target, 4)), derived.length, ok);
        if (!got) {
          var g4 = narrow(perms(marks), target, derived.concat(pinClauses(R, target, 4)), derived.length, ok);
          got = g4 || { clauses: derived.concat(pinClauses(R, target, 4)), sol: target };
        }
        node.clauses = got.clauses;
        node.derived = derived.length;
        node.ledger = [
          '环一咬出来的次序：' + r1.join(' '),
          '环二那七句里，说真话的有 ' + CHAIN_CN[T2] + ' 句',
          '环三咬出来的次序：' + r3.join(' ')
        ];
        node.sol = got.sol.slice();
        return node;
      },
      space: function (n) { return perms(n.marks); },
      holds: function (n, c) { return arrOK(c, n.clauses); },
      answer: function (n) { return n.sol.slice(); }
    };

    /* ================= 环五 · 合闸（终局综合：把前四枚的答案交叉折算）=================
       候选 = 五枚环咬上去的次序（5! = 120）。线索全部**拿前四枚的答案互相折算**出来的：
       环一最先咬上的字在环四里排第几格、环三最先咬上的字在环一里排第几格、环二的真话数是奇是偶……
       生成：先按派生线索造一个目标次序，再拿弱线索一条条收窄，穷举 120 种验唯一。 */
    var RING_SEAL = {
      kind: 'seal', name: '合闸',
      make: function (R, prev) {
        var r1 = (prev && prev[0] && prev[0].length === 5) ? prev[0].slice() : pickN(R, CHAIN_MARKS, 5);
        var r2 = (prev && prev[1] && prev[1].length === 7) ? prev[1].slice() : [1, 0, 1, 0, 1, 0, 1];
        var r3 = (prev && prev[2] && prev[2].length === 5) ? prev[2].slice() : r1.slice().reverse();
        var r4 = (prev && prev[3] && prev[3].length === 5) ? prev[3].slice() : r1.slice().reverse();
        var T2 = bits(r2), rings = [0, 1, 2, 3, 4];
        var m1 = posOf(r4, r1[0]); if (m1 < 0) m1 = 0;   /* 环一最先咬上的字，在环四里排第几格 */
        var m3 = posOf(r1, r3[0]); if (m3 < 0) m3 = (m1 + 1) % 5;  /* 环三最先咬上的字，在环一里排第几格 */
        var v1 = { t: 'at', k: m1, v: 0 };
        /* 环三那条：位次撞了才改成"前后"关系，方向按环一钉死的那格挑 ——
           环一正好在第一格时，"环三咬在环一前面"是无解的（判据 1000 种子里抓到过一次） */
        var v3 = (m3 !== m1) ? { t: 'at', k: m3, v: 2 }
          : (m1 === 0 ? { t: 'before', a: 0, b: 2 } : { t: 'before', a: 2, b: 0 });
        var v5 = (T2 % 2 === 1) ? { t: 'before', a: 1, b: 4 } : { t: 'before', a: 4, b: 1 };
        var derived = [v1, v3, v5], got = null, att;
        var target = pickTarget(R, rings, derived);
        for (var vAtt = 0; !target && vAtt < 3; vAtt++) { /* 撞死了：翻 v5 的方向、再不行就退掉一条 */
          if (vAtt === 0) { v5 = { t: 'before', a: v5.b, b: v5.a }; derived = [v1, v3, v5]; }
          else if (vAtt === 1) { derived = [v1, v3]; }
          else { derived = [v1]; }
          target = pickTarget(R, rings, derived);
        }
        if (!target) target = shuffle(rings.slice(), R);
        for (att = 0; att < 3 && !got; att++) {
          var pool = derived.concat(trueClauses(R, target, 5)).concat(pinClauses(R, target, 4));
          var g = narrow(perms(rings), target, pool, derived.length, arrOK);
          if (g && g.clauses.length <= 8) got = g;
        }
        if (!got) {
          got = narrow(perms(rings), target, derived.concat(pinClauses(R, target, 4)), derived.length, arrOK)
            || { clauses: derived.concat(pinClauses(R, target, 4)), sol: target };
        }
        return {
          kind: 'seal', name: '合闸', rings: rings.slice(), clauses: got.clauses, derived: derived.length,
          ledger: [
            '环一咬出来的次序：' + r1.join(' '),
            '环二那七句里，说真话的有 ' + CHAIN_CN[T2] + ' 句',
            '环三咬出来的次序：' + r3.join(' '),
            '环四咬出来的次序：' + r4.join(' ')
          ],
          sol: got.sol.slice()
        };
      },
      space: function (n) { return perms(n.rings); },
      holds: function (n, c) { return arrOK(c, n.clauses); },
      answer: function (n) { return n.sol.slice(); }
    };

    /* 环的次序**固定**：环四/环五的 make 拿得到前面各环的答案，靠的就是这个次序 */
    var RINGS = [RING_BITE, RING_TESTIMONY, RING_LIARS, RING_RETURN, RING_SEAL];

    /* ================= 一轮 · 判定 · 提示 ================= */
    function makeRun(rand) {
      var R = rand || rnd, nodes = [], ans = [], i, n;
      for (i = 0; i < RINGS.length; i++) {
        n = RINGS[i].make(R, ans.slice());
        n.no = i;
        nodes.push(n);
        ans.push(RINGS[i].answer(n));
      }
      return { nodes: nodes, idx: 0, tLeft: CHAIN_LIMIT, fails: 0, ringWrong: 0, done: false, started: false };
    }
    var run = makeRun(), live = false, note = '', token = 0;
    function secs() { return Math.max(0, Math.ceil(run.tLeft)); }
    function pct() { return Math.max(0, Math.min(100, run.tLeft / CHAIN_LIMIT * 100)); }
    function paint() {
      var a = q('#pz-chain-left'); if (a) a.textContent = secs() + ' 秒';
      var b = q('#pz-chain-bar'); if (b) b.style.width = pct() + '%';
    }
    function head() {
      return '<div class="ch-clock"><span class="ch-lab">表</span><b id="pz-chain-left">' + secs() + ' 秒</b>' +
        '<span class="ch-bar"><i id="pz-chain-bar" style="width:' + pct() + '%"></i></span>' +
        '<span class="ch-try">第 ' + (run.fails + 1) + ' 次</span></div>';
    }
    /* 防卡死：按"整锁弹回过几次"分层，上限三层；只给**方法**，一条都不许泄答案 */
    function hint() {
      if (run.fails <= 0) return '';
      var s1 = '铁牌背面刻着一行小字：别急着排。先挑两条只差一个对调的试排摆在一起比 —— 它们各自"对了几位"，差出来的数只跟这两格有关。';
      var s2 = '下面还有一行：一位一位地钉。先假设某一格是某个字，看它会让哪几条试排"对了几位"对不上；对不上，就把这个字从这一格划掉。';
      var s3 = '最下面那行更浅：五个字各用一次 —— 划掉一格，别处也跟着窄。实在卡住就拿纸把已经钉死的格记下来，再拿剩下没用的字去卡。';
      if (run.fails === 1) return s1;
      if (run.fails === 2) return s1 + '\n' + s2;
      return s1 + '\n' + s2 + '\n' + s3;
    }
    function openNode() {
      var n = run.nodes[run.idx];
      if (!n || run.done) return;
      run.started = true;                                /* 推开第一枚环，表就开始走 */
      RINGS[run.idx].view(n);
      H.refresh();
    }
    /* 判定：对 → 推进；错 → 本环记一笔；同一枚错到第二回 → 整锁弹回 + 表重置 + 五枚全部重掷 */
    function submit(cand) {
      var n = run.nodes[run.idx];
      if (!n || run.done) return 'wrong';
      if (RINGS[run.idx].holds(n, cand)) {
        n.done = true; run.ringWrong = 0;
        H.sfx('open');
        run.idx++;
        if (run.idx >= run.nodes.length) {
          run.done = true; live = false; token++;
          note = '闸开了 —— 五枚环咬成一副。';
          H.solve('chainlink');
          return 'right';
        }
        note = '第 ' + CHAIN_CN[run.idx] + ' 枚锁进去了。';
        if (live) panel();
        return 'right';
      }
      run.ringWrong++;
      if (run.ringWrong >= 2) {
        var f = run.fails + 1;
        run = makeRun();
        run.fails = f;
        note = '这一枚错了两回 —— 五枚一起弹回去，从第一枚重来。机关重新打过，表重新走。';
        H.sfx('wrong');
        H.toast('连环锁弹回去了 · 从第一道重来');
        if (live) panel();
        return 'wrong';
      }
      H.sfx('wrong');
      return 'wrong';
    }
    /* 表走完：五枚一起弹回去，机关重新打过 */
    function expire() {
      var f = run.fails + 1;
      run = makeRun(); run.fails = f;
      note = '表走完了 —— 五枚环一起弹回去。机关重新打过：这一轮的题跟上一轮全不一样，表也重新走。';
      H.sfx('wrong');
      H.toast('连环锁弹回去了 · 从第一道重来');
      live = live && !!q('#pz-chain-left');
      if (live) panel();
    }
    function tick(dt) {
      if (!run.started || run.done) return;
      run.tLeft -= dt;
      if (run.tLeft <= 0) { expire(); return; }
      if (live) paint();
    }
    function reset() { run = makeRun(); note = ''; }
    function enter() { note = run.done ? '闸已经开了 —— 名字在闸后面。' : note; panel(); }
    function leave() { live = false; token++; }

    /* ================= 面板 ================= */
    function trySubmit(cand) {
      var i;
      for (i = 0; i < cand.length; i++) {
        if (cand[i] === null || cand[i] === undefined) {
          var m0 = q('#pz-ch-msg');
          if (m0) m0.textContent = '还有格子空着。';
          return;
        }
      }
      var t0 = token, r = submit(cand);
      if (r === 'right' || token !== t0) return;         /* 面板已经重画过（弹回/推进），旧话就别写了 */
      var el = q('#pz-ch-msg');
      if (el) el.textContent = '不对。这一枚还能再试一次；错第二回，整副锁就弹回去了。';
    }
    /* 五格输入口：左边是还没咬上去的，点一个再点一格就咬进去；点已咬的那格退回来。
       钩子：.ch-pick[data-v] / .ch-slot[data-i] / #pz-ch-submit（单测走的就是这套） */
    function mountSlots(items) {
      var placed = [null, null, null, null, null], sel = null, i;
      function rawOf(d) { for (var k = 0; k < items.length; k++) if (String(items[k].v) === d) return items[k].v; return null; }
      function labelOf(v) { for (var k = 0; k < items.length; k++) if (String(items[k].v) === String(v)) return items[k].t; return String(v); }
      function draw() {
        var pool = q('#pz-ch-pool'), slots = q('#pz-ch-slots'), html = '', k, taken;
        if (pool) {
          for (k = 0; k < items.length; k++) {
            taken = false;
            for (i = 0; i < 5; i++) if (placed[i] !== null && String(placed[i]) === String(items[k].v)) taken = true;
            if (taken) continue;
            html += '<button class="ch-pick pz-opt' + (sel !== null && String(sel) === String(items[k].v) ? ' sel' : '') +
              '" data-v="' + items[k].v + '">' + items[k].t + '</button>';
          }
          pool.innerHTML = html || '<span class="ch-empty">都咬上去了</span>';
        }
        if (slots) {
          slots.innerHTML = placed.map(function (v, k2) {
            return '<button class="ch-slot pz-slot' + (v !== null ? ' filled' : '') + '" data-i="' + k2 + '">' +
              (v === null ? '·' : labelOf(v)) + '</button>';
          }).join('');
        }
        qa('#pz-ch-pool .ch-pick').forEach(function (b) {
          b.onclick = function () { sel = rawOf(b.getAttribute('data-v')); H.sfx('click'); draw(); };
        });
        qa('#pz-ch-slots .ch-slot').forEach(function (b) {
          b.onclick = function () {
            var k2 = +b.getAttribute('data-i');
            if (placed[k2] !== null) { placed[k2] = null; H.sfx('click'); draw(); return; }
            if (sel === null) { var m1 = q('#pz-ch-msg'); if (m1) m1.textContent = '先在左边点一个字。'; return; }
            placed[k2] = sel; sel = null; H.sfx('click'); draw();
          };
        });
      }
      draw();
      return { get: function () { return placed.slice(); }, draw: draw };
    }
    /* 一个排列类环的面板：题面（凭据/账/铁牌） + 五格输入口 */
    function viewArr(cfg) {
      var html = '<p class="pz-tip">' + cfg.tip + '</p>' + head();
      if (cfg.ledger && cfg.ledger.length) {
        html += '<div class="pz-clue"><b>闸上刻着前几枚咬出来的样子</b><br>' + cfg.ledger.join('<br>') + '</div>';
      }
      if (cfg.body && cfg.body.length) html += '<div class="pz-clue">' + cfg.body.join('<br>') + '</div>';
      html += '<div class="pz-slots" id="pz-ch-slots"></div>' +
        '<div class="pz-row" id="pz-ch-pool"></div>' +
        '<div class="pz-progress" id="pz-ch-msg">' + cfg.msg + '</div>';
      H.setBody(html);
      var box = null;
      H.setBtns([
        { label: '咬上这一枚', fn: function () { trySubmit(box.get()); } },
        { label: '回到机关', fn: function () { panel(); } }
      ]);
      box = mountSlots(cfg.items);
      H.refresh();
    }
    function viewBite(n) {
      var body = [], i;
      for (i = 0; i < n.trials.length; i++) {
        var t = n.trials[i];
        if (t.t === 'trial') {
          body.push('<b>试排' + CHAIN_CN[i + 1] + '</b>　' + t.arr.join('　') + '　—— 对了 <b>' + CHAIN_CN[t.hit] + '</b> 位');
        } else {
          body.push('<b>铁牌背面</b>　' + arrClauseText(t));
        }
      }
      viewArr({
        tip: '第一枚环 · 咬合：五个字咬进五个齿位，一字一格。铁牌上那几条试排，每一条只报"对了几位"，不报是哪几位。',
        body: body,
        items: n.marks.map(function (c) { return { v: c, t: c }; }),
        msg: '把五个字按你推出来的次序咬进格子里。'
      });
    }
    function viewLiars(n) {
      var says = [], facts = [], i;
      for (i = 0; i < n.says.length; i++) says.push('　' + liarSayText(n.says[i], n.people[i]));
      for (i = 0; i < n.clauses.length; i++) {
        var c = n.clauses[i];
        facts.push(c.t.charAt(0) === 'f' ? '　' + liarFactText(c) : '　铁牌上还刻着：' + arrClauseText(c));
      }
      viewArr({
        tip: '第三枚环 · 对质：五个人各咬一格，各留了一句话。账上只记真假和位次的数目，不记是谁。',
        body: says.concat(['<b>账上记着：</b>']).concat(facts),
        items: n.people.map(function (c) { return { v: c, t: c }; }),
        msg: '把五个人的次序咬出来。'
      });
    }
    function viewReturn(n) {
      var clues = n.clauses.map(function (c) { return '　' + arrClauseText(c); });
      viewArr({
        tip: '第四枚环 · 归还：环一那五个字在这一枚里重排。铁牌上的线索，得拿前三枚咬出来的样子去折算。',
        ledger: n.ledger,
        body: ['<b>铁牌上刻着：</b>'].concat(clues),
        items: n.marks.map(function (c) { return { v: c, t: c }; }),
        msg: '把这一枚的五个字咬出来。'
      });
    }
    function viewSeal(n) {
      var lab = function (v) { return '环' + CHAIN_NAMES[v]; };
      var clues = n.clauses.map(function (c) { return '　' + arrClauseText(c, lab); });
      viewArr({
        tip: '第五枚环 · 合闸：这一枚问的是五枚环咬上去的次序。线索得拿前四枚咬出来的样子互相折算。',
        ledger: n.ledger,
        body: ['<b>铁闸上刻着：</b>'].concat(clues),
        items: n.rings.map(function (v) { return { v: v, t: lab(v) }; }),
        msg: '把五枚环的次序排出来。'
      });
    }
    function viewTestimony(n) {
      var pick = [], i;
      for (i = 0; i < n.texts.length; i++) pick.push(null);
      function draw() {
        var box = q('#pz-says');
        if (!box) return;
        box.innerHTML = n.texts.map(function (t, k) {
          return '<div class="pz-row" style="justify-content:flex-start;gap:6px;margin:4px 0">' +
            '<span style="min-width:22px;color:#9a9a9a">第' + CHAIN_CN[k + 1] + '句</span>' +
            '<span style="flex:1 1 auto">' + t + '</span>' +
            '<button class="ch-t pz-opt' + (pick[k] === 1 ? ' on' : '') + '" data-i="' + k + '" data-v="1">真</button>' +
            '<button class="ch-t pz-opt' + (pick[k] === 0 ? ' on' : '') + '" data-i="' + k + '" data-v="0">假</button>' +
            '</div>';
        }).join('');
        qa('#pz-says .ch-t').forEach(function (b) {
          b.onclick = function () {
            pick[+b.getAttribute('data-i')] = +b.getAttribute('data-v');
            H.sfx('click');
            draw();
          };
        });
      }
      H.setBody('<p class="pz-tip">第二枚环 · 证词：七句话互相指涉。哪几句是真的，得让每一句话都跟自己说的内容对得上。</p>' +
        head() +
        '<div class="pz-clue" id="pz-says"></div>' +
        '<div class="pz-progress" id="pz-ch-msg">七句都判个真假，再报上来。</div>');
      H.setBtns([
        { label: '报上这一枚', fn: function () { trySubmit(pick.slice()); } },
        { label: '回到机关', fn: function () { panel(); } }
      ]);
      draw();
      H.refresh();
    }
    RING_BITE.view = viewBite;
    RING_TESTIMONY.view = viewTestimony;
    RING_LIARS.view = viewLiars;
    RING_RETURN.view = viewReturn;
    RING_SEAL.view = viewSeal;

    function panel() {
      token++; live = true;
      H.setTitle('✦ 连环锁');
      var h = hint();
      H.setBody('<p class="pz-tip">铁闸上五枚铜环，一枚扣一枚。每一枚是一道要动脑的机关 —— <b>后一枚的题，得拿前几枚咬出来的答案去解</b>。</p>' +
        '<div class="pz-clue">六百秒。从第一枚开始，一枚一枚解；五枚都咬进闸里，闸自己开。<br>' +
        '表走完 —— 五枚一起弹回去，从第一枚重来；<b>下一轮的机关重新打过，答案跟这一轮不一样</b>。<br>' +
        '同一枚环错两回，整副锁也弹回去，表重新走。</div>' +
        head() +
        '<div class="ch-rings">' + run.nodes.map(function (n, i) {
          var cls = n.done ? 'done' : (i === run.idx ? 'now' : 'off');
          return '<button class="ch-ring ' + cls + '" data-i="' + i + '"><b>' + CHAIN_NAMES[i] + '</b><small>' + n.name + '</small></button>';
        }).join('') + '</div>' +
        '<div class="pz-progress" id="pz-chain-msg">' +
        (note || (run.started ? ('接着解第 ' + CHAIN_CN[run.idx + 1] + ' 枚。') : '推开第一枚环，表就开始走。')) + '</div>' +
        (h ? '<div class="pz-clue" style="margin-top:8px"><b>铁牌背面</b><br>' + h.split('\n').join('<br>') + '</div>' : ''));
      qa('.ch-ring').forEach(function (b, i) {
        if (i === run.idx && !run.done) b.onclick = function () { openNode(); };
        else b.disabled = true;
      });
      H.setBtns([{ label: '合上机关（表还在走）', fn: function () { H.close(); } }]);
      paint();
      H.refresh();
    }

    return {
      LIMIT: CHAIN_LIMIT, RINGS: RINGS,
      makeRun: makeRun, peek: function () { return run; }, reset: reset,
      tick: tick, enter: enter, leave: leave,
      submit: submit, hint: hint,
      MARKS: CHAIN_MARKS, NAMES: CHAIN_NAMES, PAIRS: CHAIN_PAIRS
    };
  })();
  function chainlink() { CHAIN.enter(); }

  var IMPL = {
    code: lampcode, dial: dial, read: read_book, logic: ledger, numbers: scales,
    grid: sluice, order: diary, filter: search, compose: name_, simon: song,
    quiz: three_asks, choice: finale,
    lights: lights, count: abacus, toggles: switches, shift: cipher, pair: halves, chain: chainlink
  };

  var openId = null;      /* 现在开着的是哪个谜题（引擎的 sfx('wrong') 反噬靠它认门） */
  function open(id) {
    var p = H.D.PUZZLES[id];
    if (!p) return;
    var impl = IMPL[p.kind];
    openId = id;
    /* 打开谜题必须同时告诉引擎"面板开着"：否则 modalOpen 还是 false，
       弹窗只靠 class 显示——之前靠调用方手动加 class 绕过，实测会引出难查的时序 bug */
    if (H.openModal) H.openModal();
    H.setTitle('✦ ' + p.name);
    if (!impl) {
      H.setBody('<p class="pz-tip">' + p.brief + '</p><p class="pz-progress">这一处还没接上。</p>');
      H.setBtns([{ label: '好', fn: function () { H.close(); } }]);
      return;
    }
    impl(p);
    H.refresh();
  }

  global.PUZZLES23 = {
    attach: attach, open: open, IMPL: IMPL,
    /* 引擎每帧喂 dt：连环锁的表靠它走（关着面板也走 —— 机关不会等你） */
    tick: function (dt) { CHAIN.tick(dt); },
    /* 引擎关面板时通知谜题层：机关面板合上了，表照样走；旧的定时器一律作废 */
    onModalClose: function () { openId = null; CHAIN.leave(); },
    current: function () { return openId; },
    /* 给单测用：不经过 DOM 也能验的纯逻辑 */
    _logic: { makeLedger: makeLedger, LEDGER_RULES: LEDGER_RULES, SHAPES: SHAPES, SLUICE: SLUICE, conns: conns, flood: flood, DIARY_ORDER: DIARY_ORDER, PIECES: PIECES, SEARCH: SEARCH,
      LIGHTS: LIGHTS, makeBill: makeBill, makeGates: makeGates, makeCipher: makeCipher, CIPHER_TABLE: CIPHER_TABLE, shuffle: shuffle, CHAIN: CHAIN }
  };
})(typeof window !== 'undefined' ? window : globalThis);
