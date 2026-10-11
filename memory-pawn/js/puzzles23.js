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
    var html = '<p class="pz-tip">' + p.brief + '</p><div class="pz-clue">「戊戌年冬。小儿热了七天。______ 去了镇上，回来时袖子里揣着一张契。」</div>';
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
  var PIECES = ['阝', '可', '阝', '急', '木', '日', '心', '目', '刂'];
  function name_(p) {
    var picked = [];
    H.setBody('<p class="pz-tip">' + p.brief + '</p>' +
      '<div class="pz-clue">碑上凿掉的是两个字。石碑脚下捡到的笔画碎片里，只有四个能拼出那个名字。</div>' +
      '<div class="nm-grid" id="pz-pieces">' + PIECES.map(function (c, i) {
        return '<button class="nm-pc" data-i="' + i + '">' + c + '</button>';
      }).join('') + '</div>' +
      '<div class="pz-slots" id="pz-slots"></div>' +
      '<div class="pz-progress" id="pz-prog">选四个部件</div>');
    function draw() {
      var s = q('#pz-slots');
      s.innerHTML = ['', '', '', ''].map(function (_, i) {
        return '<div class="pz-slot' + (picked[i] ? ' filled' : '') + '">' + (picked[i] || '') + '</div>';
      }).join('') + '<div class="pz-slot" style="width:auto;padding:0 12px;border-style:none;font-size:13px;color:var(--dim)">= 「' +
        (picked.length ? picked.slice(0, 2).join('') + '」' : '？') + '</div>';
      qa('.nm-pc').forEach(function (b) {
        var i = +b.getAttribute('data-i');
        b.classList.toggle('sel', picked.indexOf(PIECES[i]) >= 0 && usedCount(PIECES[i]) > 0);
        b.disabled = picked.length >= 4 && picked.indexOf(PIECES[i]) < 0;
      });
      q('#pz-prog').textContent = picked.length + '/4';
    }
    function usedCount(ch) { return picked.filter(function (c) { return c === ch; }).length; }
    qa('.nm-pc').forEach(function (b) {
      b.onclick = function () {
        var i = +b.getAttribute('data-i');
        if (picked.length >= 4) return;
        if (usedCount(PIECES[i]) >= PIECES.filter(function (c) { return c === PIECES[i]; }).length) return;
        picked.push(PIECES[i]); H.sfx('select'); draw();
        if (picked.length === 4) check();
      };
    });
    function check() {
      var need = { '阝': 2, '可': 1, '急': 1 };
      var got = {};
      picked.forEach(function (c) { got[c] = (got[c] || 0) + 1; });
      var same = Object.keys(need).length === Object.keys(got).length && Object.keys(need).every(function (k) { return got[k] === need[k]; });
      if (same) { H.solve('name'); }
      else {
        H.sfx('wrong');
        q('#pz-prog').textContent = '拼不出名字——再拆一遍。';
        setTimeout(function () { picked = []; draw(); }, 700);
      }
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

  var IMPL = {
    code: lampcode, dial: dial, read: read_book, logic: ledger, numbers: scales,
    grid: sluice, order: diary, filter: search, compose: name_, simon: song,
    quiz: three_asks, choice: finale
  };

  function open(id) {
    var p = H.D.PUZZLES[id];
    if (!p) return;
    var impl = IMPL[p.kind];
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
    /* 给单测用：不经过 DOM 也能验的纯逻辑 */
    _logic: { makeLedger: makeLedger, LEDGER_RULES: LEDGER_RULES, SHAPES: SHAPES, SLUICE: SLUICE, conns: conns, flood: flood, DIARY_ORDER: DIARY_ORDER, PIECES: PIECES, SEARCH: SEARCH }
  };
})(typeof window !== 'undefined' ? window : globalThis);
