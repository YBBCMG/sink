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
      '<div class="sl-grid" id="pz-grid" style="grid-template-columns:repeat(4, 42px)"></div>' +
      '<div class="pz-progress" id="pz-prog">通到 0/3 个盐池</div>');
    var GLYPH = { straight: ['┈', '┊', '┈', '┊'], elbow: ['┌', '┐', '┘', '└'], tee: ['├', '┬', '┤', '┴'] };
    function glyphOf(pp) { return (GLYPH[pp.shape] || [])[((pp.rot % 4) + 4) % 4] || '·'; }
    function draw() {
      var flow = flood();
      var grid = q('#pz-grid'); grid.innerHTML = '';
      for (var y = 0; y < 4; y++) for (var x = 0; x < 4; x++) {
        var c = el('div', 'sl-cell'), pp = pipeAt(x, y), key = x + ',' + y;
        if (x === SLUICE.src.x && y === SLUICE.src.y) { c.className = 'sl-cell src'; c.innerHTML = '<span>≋</span>'; }
        else if (SLUICE.pools.some(function (o) { return o.x === x && o.y === y; })) {
          c.className = 'sl-cell pool' + (flow[key] ? ' done' : ''); c.innerHTML = '<span>' + (flow[key] ? '◉' : '○') + '</span>';
        } else if (pp) {
          c.className = 'sl-cell pipe' + (flow[key] ? ' flow' : '');
          c.innerHTML = '<span>' + glyphOf(pp) + '</span>';
          c.onclick = (function (ppp) { return function () { ppp.rot = (ppp.rot + 1) % 4; H.sfx('click'); draw(); }; })(pp);
        }
        grid.appendChild(c);
      }
      var done = SLUICE.pools.filter(function (o) { return flow[o.x + ',' + o.y]; }).length;
      q('#pz-prog').textContent = '通到 ' + done + '/3 个盐池';
      if (done === 3) H.solve('sluice');
    }
    H.setBtns([{ label: '全部复位', fn: function () { SLUICE.pipes.forEach(function (pp) { pp.rot = 0; }); draw(); } },
      { label: '先不开闸', fn: function () { H.close(); } }]);
    draw();
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
    function draw() {
      var list = q('#pz-list'); list.innerHTML = '';
      cur.forEach(function (id, i) {
        var it = DIARY.filter(function (x) { return x.id === id; })[0];
        var b = el('button', 'od-item' + (sel === i ? ' sel' : ''), '<span class="od-n">' + (i + 1) + '</span>' + it.t);
        b.onclick = function () {
          if (sel === null) { sel = i; H.sfx('select'); }
          else if (sel === i) { sel = null; }
          else { var t = cur[sel]; cur[sel] = cur[i]; cur[i] = t; sel = null; H.sfx('click'); }
          draw();
        };
        list.appendChild(b);
      });
    }
    H.setBtns([
      { label: '排好了', fn: function () {
        if (cur.join() === DIARY_ORDER.join()) { H.solve('diary'); }
        else { H.sfx('wrong'); q('#pz-prog').textContent = '顺序不对——她先说"妈没了"，最后才说"记不住字了"。'; }
      } },
      { label: '先放下', fn: function () { H.close(); } }
    ]);
    draw();
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
    function draw() {
      var g = q('#pz-lz'); if (!g) return;
      g.innerHTML = '';
      st.forEach(function (v, i) {
        var b = el('button', 'lz-cell' + (v ? ' on' : ''), '');
        b.setAttribute('data-i', i);
        b.onclick = function () { LIGHTS.flip(st, W, i); H.sfx('click'); draw(); };
        g.appendChild(b);
      });
      var off = 0;
      st.forEach(function (v) { if (!v) off++; });
      var pr = q('#pz-prog');
      if (pr) pr.textContent = off ? ('还暗着 ' + off + ' 盏') : '九盏都亮了';
      if (!off) H.solve('lights');
    }
    H.setBtns([{ label: '先不按', fn: function () { H.close(); } }]);
    draw();
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
    for (var guard = 0; guard < 60 && rules.length < 6; guard++) {
      var a = R(4), b = R(4);
      if (b === a) b = (b + 1) % 4;
      var r = MADE[R(MADE.length)](a, b);
      if (!r.f(want)) continue;                                    /* 只留谜底满足的规矩 */
      if (rules.some(function (x) { return x.t === r.t; })) continue;
      rules.push(r);
      if (rules.length < 3) continue;
      var ok = 0;
      for (var m = 0; m < 16; m++) {
        var as = [m & 1, (m >> 1) & 1, (m >> 2) & 1, (m >> 3) & 1];
        if (rules.every(function (x) { return x.f(as); })) ok++;
      }
      if (ok === 1) return { want: want, rules: rules, unique: true };
    }
    return { want: want, rules: rules, unique: false };
  }
  function makeGates(rand) {
    var R = rand || rnd, g = null;
    for (var i = 0; i < 80; i++) { g = gateRuleSet(R); if (g.unique) return g; }
    return g;                                                       /* 兜底：极端情况下也让玩家扳（测试盯着唯一性） */
  }
  function switches(p) {
    var pz = makeGates(), as = [0, 0, 0, 0];
    H.setBody('<p class="pz-tip">' + p.brief + '</p>' +
      '<div class="pz-clue">堤上钉着三块告示，写的就是扳闸板的规矩：' +
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
    function draw() {
      var done = Object.keys(hit).length;
      q('#pz-half-l').innerHTML = lefts.map(function (x) {
        return '<button class="pz-opt hp' + (hit[x.i] ? ' on' : '') + (sel === x.i ? ' sel' : '') + '" data-i="' + x.i + '">' + x.t + '</button>';
      }).join('');
      q('#pz-half-r').innerHTML = rights.map(function (x) {
        return '<button class="pz-opt hp' + (hit[x.i] ? ' on' : '') + '" data-i="' + x.i + '">' + x.t + '</button>';
      }).join('');
      qa('#pz-half-l .pz-opt').forEach(function (b) {
        b.onclick = function () { if (hit[+b.getAttribute('data-i')]) return; sel = +b.getAttribute('data-i'); H.sfx('click'); draw(); };
      });
      qa('#pz-half-r .pz-opt').forEach(function (b) {
        b.onclick = function () {
          var j = +b.getAttribute('data-i');
          if (hit[j]) return;
          if (sel === null) { q('#pz-prog').textContent = '先在左边点一句。'; return; }
          if (j === sel) { hit[j] = 1; sel = null; H.sfx('open'); draw(); return; }
          miss++; sel = null; H.sfx('wrong');
          q('#pz-prog').textContent = '接不上（错了 ' + miss + ' 回）。';
        };
      });
      var pr = q('#pz-prog');
      if (pr) pr.textContent = '接上了 ' + done + '/' + pairs.length + ' 句' + (miss ? '（错了 ' + miss + ' 回）' : '');
      if (done === pairs.length) H.solve('halves');
    }
    H.setBtns([{ label: '先不接', fn: function () { H.close(); } }]);
    draw();
  }

  /* ============ 18. 连环锁（幕五 · 五道环 · 一百秒 · 超时从第一道重来） ============
     规矩：一百秒内把五枚环一枚一枚解完；解不完，五枚一起弹回去，从第一枚重来。
     每枚环是一道**自己**的机关；而且每轮重新生成 —— 答案不跟上一轮一样，背答案没用。 */
  var CHAIN_LIMIT = 100;
  var CHAIN_NAMES = ['一', '二', '三', '四', '五'];
  var CHAIN_MARKS = ['雾', '灯', '海', '名', '岸', '钟', '贝', '船'];
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
    function mkTap(R) { return { kind: 'tap', name: '记数', n: 4 + R(5) }; }
    function mkNotch(R) { var s = R(8), k = 1 + R(7); return { kind: 'notch', name: '对位', start: s, step: k, target: (s + k) % 8 }; }
    function mkWeigh(R) { return { kind: 'weigh', name: '配重', target: 1 + R(15) }; }
    function mkPair(R) { return { kind: 'pair', name: '对牌', pairs: shuffle(CHAIN_PAIRS.slice(), R).slice(0, 3) }; }
    function mkSeq(R) { var s = [], i; for (i = 0; i < 4; i++) s.push(R(4)); return { kind: 'seq', name: '灯序', seq: s }; }
    /* 一轮 = 五枚环（次序也洗牌）。rand 可注入（测试用固定种子验"两轮答案不一样"） */
    function makeRun(rand) {
      var R = rand || rnd;
      var nodes = shuffle([mkTap(R), mkNotch(R), mkWeigh(R), mkPair(R), mkSeq(R)], R);
      nodes.forEach(function (n, i) { n.no = i; n.done = false; });
      return { nodes: nodes, idx: 0, tLeft: CHAIN_LIMIT, fails: 0, done: false, started: false };
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
    function panel() {
      token++; live = true;
      H.setTitle('✦ 连环锁');
      H.setBody('<p class="pz-tip">铁闸上五枚铜环，一枚扣一枚。每枚环上是一道自己的机关。</p>' +
        '<div class="pz-clue">一百秒。从第一枚开始，一枚一枚解；五枚都解进闸里，闸自己开。<br>' +
        '表走完还没解完 —— 五枚一起弹回去，从第一枚重来；<b>下一轮的机关重新打过，答案跟这一轮不一样</b>。</div>' +
        head() +
        '<div class="ch-rings">' + run.nodes.map(function (n, i) {
          var cls = n.done ? 'done' : (i === run.idx ? 'now' : 'off');
          return '<button class="ch-ring ' + cls + '" data-i="' + i + '"><b>' + CHAIN_NAMES[i] + '</b><small>' + n.name + '</small></button>';
        }).join('') + '</div>' +
        '<div class="pz-progress" id="pz-chain-msg">' + (note || (run.started ? ('接着解第 ' + (run.idx + 1) + ' 枚。') : '推开第一枚环，表就开始走。')) + '</div>');
      qa('.ch-ring').forEach(function (b, i) {
        if (i === run.idx && !run.done) b.onclick = function () { openNode(); };
        else b.disabled = true;
      });
      H.setBtns([{ label: '合上机关（表还在走）', fn: function () { H.close(); } }]);
      paint();
      H.refresh();
    }
    /* 一道环解开了：锁进闸里，接着下一枚 */
    function after(n) {
      n.done = true; H.sfx('open');
      run.idx++;
      if (run.idx >= run.nodes.length) { run.done = true; live = false; token++; H.solve('chainlink'); return; }
      note = '第 ' + run.idx + ' 枚锁进去了。';
      panel();
    }
    /* 表走完：五枚一起弹回去，机关重新打过 */
    function expire() {
      var f = run.fails + 1;
      run = makeRun(); run.fails = f;
      note = '表走完了 —— 五枚环一起弹回去。机关重新打过：这一轮的五个机关，答案跟上一轮全不一样。';
      H.sfx('wrong');
      H.toast('连环锁弹回去了 · 从第一道重来');
      live = live && !!q('#pz-chain-left');
      if (live) panel();
    }
    function openNode() {
      var n = run.nodes[run.idx];
      if (!n || run.done) return;
      run.started = true;
      ({ tap: microTap, notch: microNotch, weigh: microWeigh, pair: microPair, seq: microSeq })[n.kind](n);
      H.refresh();
    }

    /* —— 一、记数：环闪几下，就按几下 —— */
    function microTap(n) {
      var my = ++token, taps = 0, playing = true;
      H.setBody('<p class="pz-tip">这枚环上刻着数。它闪几下，你就按几下 —— 数错就重来。</p>' + head() +
        '<div class="ch-big" id="pz-tap">按</div>' +
        '<div class="pz-progress" id="pz-prog">看着……</div>');
      function flash() {
        var b = q('#pz-tap'); if (!b) return;
        b.classList.add('lit'); H.sfx('bell');
        setTimeout(function () { var x = q('#pz-tap'); if (x) x.classList.remove('lit'); }, 170);
      }
      for (var i = 0; i < n.n; i++) (function (k) {
        setTimeout(function () { if (my === token) flash(); }, 320 + 330 * k);
      })(i);
      setTimeout(function () {
        if (my !== token) return;
        playing = false;
        var pr = q('#pz-prog'); if (pr) pr.textContent = '你来按。按完了报数。';
      }, 320 + 330 * n.n + 220);
      q('#pz-tap').onclick = function () {
        if (playing) return;
        taps++; H.sfx('click');
        var pr = q('#pz-prog'); if (pr) pr.textContent = '你按了 ' + taps + ' 下';
      };
      H.setBtns([
        { label: '再闪一遍', fn: function () { microTap(n); } },
        { label: '报数', fn: function () {
          var pr = q('#pz-prog');
          if (playing) { if (pr) pr.textContent = '先让它闪完。'; return; }
          if (taps === n.n) { after(n); return; }
          H.sfx('wrong'); taps = 0;
          if (pr) pr.textContent = '不对。再闪一遍，重数。';
        } },
        { label: '回到机关', fn: function () { panel(); } }
      ]);
    }

    /* —— 二、对位：八格刻度，往右走 k 格停住 —— */
    function microNotch(n) {
      var cur = n.start;
      function draw() {
        var c = q('#pz-marks'); if (!c) return;
        c.innerHTML = CHAIN_MARKS.map(function (m, i) {
          return '<span class="ch-mark' + (i === cur ? ' now' : '') + '">' + m + '</span>';
        }).join('');
        var pr = q('#pz-prog');
        if (pr) pr.textContent = '现在指在「' + CHAIN_MARKS[cur] + '」（第 ' + cur + ' 格）。铁牌上写着：往右走 ' + n.step + ' 格。';
      }
      H.setBody('<p class="pz-tip">八格刻度，一格一格地挪。走一格 = 挪到下一格。</p>' + head() +
        '<div class="ch-marks" id="pz-marks"></div>' +
        '<div class="pz-progress" id="pz-prog"></div>');
      H.setBtns([
        { label: '‹ 退一格', fn: function () { cur = (cur + 7) % 8; H.sfx('click'); draw(); } },
        { label: '进一格 ›', fn: function () { cur = (cur + 1) % 8; H.sfx('click'); draw(); } },
        { label: '报数', fn: function () {
          if (cur === n.target) { after(n); return; }
          H.sfx('wrong');
          q('#pz-prog').textContent = '不是这一格。往右是往下面那头走。';
        } },
        { label: '回到机关', fn: function () { panel(); } }
      ]);
      draw();
    }

    /* —— 三、配重：四枚砝码各一次，压到刻的数 —— */
    function microWeigh(n) {
      var W = [1, 2, 4, 8], sel = [0, 0, 0, 0];
      function sum() { return W.reduce(function (a, w, i) { return a + (sel[i] ? w : 0); }, 0); }
      function draw() {
        qa('#pz-ws .pz-opt').forEach(function (b, i) { b.classList.toggle('on', !!sel[i]); });
        var s = q('#pz-sum'); if (s) s.textContent = sum();
      }
      H.setBody('<p class="pz-tip">盘上的配重要压到刻的数。四枚砝码，每枚最多上一次。</p>' + head() +
        '<div class="pz-progress">要压：<b>' + n.target + '</b> 两　现在盘上：<b id="pz-sum">0</b> 两</div>' +
        '<div class="pz-row" id="pz-ws">' + W.map(function (w, i) {
          return '<button class="pz-opt" data-i="' + i + '">' + w + ' 两</button>';
        }).join('') + '</div>');
      qa('#pz-ws .pz-opt').forEach(function (b, i) {
        b.onclick = function () { sel[i] = sel[i] ? 0 : 1; H.sfx('click'); draw(); };
      });
      H.setBtns([
        { label: '报数', fn: function () {
          if (sum() === n.target) { after(n); return; }
          H.sfx('wrong');
          q('#pz-prog').textContent = '不对——盘上是 ' + sum() + ' 两。';
        } },
        { label: '回到机关', fn: function () { panel(); } }
      ]);
      draw();
    }

    /* —— 四、对牌：三张牌配三句话 —— */
    function microPair(n) {
      var lefts = shuffle(n.pairs.map(function (pr, i) { return { i: i, t: pr[0] }; }));
      var rights = shuffle(n.pairs.map(function (pr, i) { return { i: i, t: pr[1] }; }));
      var sel = null, hit = {}, miss = 0;
      function draw() {
        var done = Object.keys(hit).length;
        q('#pz-pair-l').innerHTML = lefts.map(function (x) {
          return '<button class="pz-opt hp' + (hit[x.i] ? ' on' : '') + (sel === x.i ? ' sel' : '') + '" data-i="' + x.i + '">' + x.t + '</button>';
        }).join('');
        q('#pz-pair-r').innerHTML = rights.map(function (x) {
          return '<button class="pz-opt hp' + (hit[x.i] ? ' on' : '') + '" data-i="' + x.i + '">' + x.t + '</button>';
        }).join('');
        qa('#pz-pair-l .pz-opt').forEach(function (b) {
          b.onclick = function () { var i = +b.getAttribute('data-i'); if (hit[i]) return; sel = i; H.sfx('click'); draw(); };
        });
        qa('#pz-pair-r .pz-opt').forEach(function (b) {
          b.onclick = function () {
            var j = +b.getAttribute('data-i');
            if (hit[j]) return;
            if (sel === null) { q('#pz-prog').textContent = '先在左边点一张。'; return; }
            if (j === sel) { hit[j] = 1; sel = null; H.sfx('open'); draw(); return; }
            miss++; sel = null; H.sfx('wrong');
            q('#pz-prog').textContent = '配不上（错了 ' + miss + ' 回）。';
          };
        });
        var pr = q('#pz-prog');
        if (pr) pr.textContent = '配上了 ' + done + '/' + n.pairs.length + ' 对' + (miss ? '（错了 ' + miss + ' 回）' : '');
        if (done === n.pairs.length) after(n);
      }
      H.setBody('<p class="pz-tip">三张牌，三句话。左边点一张，再点右边配得上的那句。</p>' + head() +
        '<div class="hp-wrap"><div class="hp-col" id="pz-pair-l"></div><div class="hp-col" id="pz-pair-r"></div></div>' +
        '<div class="pz-progress" id="pz-prog"></div>');
      H.setBtns([{ label: '回到机关', fn: function () { panel(); } }]);
      draw();
    }

    /* —— 五、灯序：四盏灯按顺序亮一遍，照着点回去 —— */
    function microSeq(n) {
      var my = ++token, seqTok = 0, input = [], armed = false;
      H.setBody('<p class="pz-tip">四盏灯按顺序亮一遍。照着顺序点回去。</p>' + head() +
        '<div class="ch-lamps" id="pz-lamps">' + [1, 2, 3, 4].map(function (k, i) {
          return '<button class="ch-lamp" data-i="' + i + '">' + k + '</button>';
        }).join('') + '</div>' +
        '<div class="ch-seq" id="pz-seqline"></div>' +
        '<div class="pz-progress" id="pz-prog">看着……</div>');
      function lamp(i) {
        var b = qa('#pz-lamps .ch-lamp')[i]; if (!b) return;
        b.classList.add('lit'); H.sfx('bell');
        setTimeout(function () { if (b) b.classList.remove('lit'); }, 190);
      }
      function play() {
        if (my !== token) return;
        armed = false; input = []; var mine = ++seqTok;
        var line = q('#pz-seqline'); if (line) line.textContent = '';
        var pr = q('#pz-prog'); if (pr) pr.textContent = '看着……';
        n.seq.forEach(function (k, idx) {
          setTimeout(function () { if (my === token && mine === seqTok) lamp(k); }, 300 + 360 * idx);
        });
        setTimeout(function () {
          if (my !== token || mine !== seqTok) return;
          armed = true;
          var p2 = q('#pz-prog'); if (p2) p2.textContent = '你来点（' + n.seq.length + ' 下）';
        }, 300 + 360 * n.seq.length + 200);
      }
      qa('#pz-lamps .ch-lamp').forEach(function (b, i) {
        b.onclick = function () {
          if (!armed) return;
          lamp(i); input.push(i);
          var line = q('#pz-seqline'); if (line) line.textContent = input.join(' · ');
          var k = input.length - 1;
          if (input[k] !== n.seq[k]) {
            armed = false; H.sfx('wrong');
            q('#pz-prog').textContent = '第 ' + (k + 1) + ' 下就错了。再亮一遍。';
            setTimeout(play, 700);
            return;
          }
          if (input.length === n.seq.length) after(n);
        };
      });
      H.setBtns([
        { label: '再亮一遍', fn: play },
        { label: '回到机关', fn: function () { panel(); } }
      ]);
      play();
    }

    function tick(dt) {
      if (!run.started || run.done) return;
      run.tLeft -= dt;
      if (run.tLeft <= 0) { expire(); return; }
      if (live) paint();
    }
    function enter() { note = run.done ? '闸已经开了 —— 名字在闸后面。' : note; panel(); }
    function leave() { live = false; token++; }
    return { makeRun: makeRun, enter: enter, leave: leave, tick: tick, peek: function () { return run; },
      reset: function () { run = makeRun(); note = ''; }, LIMIT: CHAIN_LIMIT, MARKS: CHAIN_MARKS, PAIRS: CHAIN_PAIRS };
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
