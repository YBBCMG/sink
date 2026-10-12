/* ============================================================
   jobs-hard23.js · 告示牌硬委托（3 道推理活）
   ------------------------------------------------------------
   用户 2026-10-13：「告示牌太简单了，安排几个特别难的 —— 难度不用过高，
   只需要有连环锁其中任意一枚的水准就行。」
   标尺 = js/puzzles23.js 五枚铜环（排除法 / 自指真假 / 条件链 / 引用前解 / 次序）。
   本文件自带三道题：生成器 + 判定 + 渲染，纯逻辑、无依赖、离线 file:// 能跑。
   ------------------------------------------------------------
   交给宿主（game23.js 的 puzzleHost()）用的接口只有两个：
     JOBSHARD23.KINDS                 —— 三道题的元信息（id / 标题 / 报酬）
     JOBSHARD23.enter(kind, H, api)   —— 开一道题；api = { pay: fn(题目名) }
   H 就是现成的宿主对象：setTitle / setBody / setBtns / toast / sfx / close /
   wrong（错一次） / sfx('wrong') / modalBody。
   ------------------------------------------------------------
   v1 · 会话 D · 2026-10-13
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------------- 通用小工具 ---------------- */
  function rnd(n) { return Math.floor(Math.random() * n); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  /* 宿主给的 modalBody 是个**函数**（game23.js:531）—— 有的谜题层当元素用，这里三种都收 */
  function elOf(root) {
    var r = typeof root === 'function' ? root() : root;
    if (typeof r === 'string') r = document.getElementById(r);
    return (r && r.querySelectorAll) ? r : document;
  }
  function qa(sel, root) { return Array.prototype.slice.call(elOf(root).querySelectorAll(sel)); }
  function inBody(H, sel) { return elOf(H.modalBody).querySelector(sel); }
  function bump(H) { if (H && H.wrong) H.wrong(); else if (H && H.sfx) H.sfx('wrong'); }

  /* ============================================================
     一 · 盐垛清点 —— 四元整数联立（总和 + 三条关系）
     ============================================================ */
  var SALT_NAMES = ['甲垛', '乙垛', '丙垛', '丁垛'];

  function saltOk(cl, v) {
    if (cl.k === 'sum') return v[0] + v[1] + v[2] + v[3] === cl.t;
    if (cl.k === 'eq') return v[cl.a] === v[cl.b] + cl.d;
    if (cl.k === 'mul') return v[cl.a] === v[cl.b] * cl.m;
    if (cl.k === 'lin') return v[cl.a] === v[cl.i] + v[cl.j] + cl.off;
    return true;
  }
  /* 解的个数（线索里必须带总和 —— 带总和解空间从 36^4 降到 36^3，秒出） */
  function saltCount(clues) {
    var T = 0, i, j, k, c;
    for (i = 0; i < clues.length; i++) if (clues[i].k === 'sum') T = clues[i].t;
    var n = 0, v = [0, 0, 0, 0];
    for (i = 5; i <= 40; i++) for (j = 5; j <= 40; j++) for (k = 5; k <= 40; k++) {
      var d = T - i - j - k;
      if (d < 5 || d > 40) continue;
      v[0] = i; v[1] = j; v[2] = k; v[3] = d;
      var all = true;
      for (c = 0; c < clues.length; c++) if (!saltOk(clues[c], v)) { all = false; break; }
      if (all) { n++; if (n > 1) return n; }
    }
    return n;
  }
  function saltLine(cl) {
    var A = SALT_NAMES, s;
    if (cl.k === 'sum') return '四个垛子合起来是 <b>' + cl.t + '</b> 袋。';
    if (cl.k === 'eq') return A[cl.a] + '比' + A[cl.b] + '多 <b>' + cl.d + '</b> 袋。';
    if (cl.k === 'mul') return A[cl.a] + '正好是' + A[cl.b] + '的两倍。';
    if (cl.k === 'lin') {
      s = A[cl.a] + '比' + A[cl.i] + '和' + A[cl.j] + '两垛合起来';
      return s + (cl.off < 0 ? '少 <b>' + (-cl.off) + '</b> 袋。' : '多 <b>' + cl.off + '</b> 袋。');
    }
    return '';
  }
  function genSalt() {
    for (var attempt = 0; attempt < 3000; attempt++) {
      /* ① 先定解 */
      var v = null, T = 0;
      for (var t = 0; t < 300; t++) {
        T = 60 + rnd(61);
        var a = rnd(36) + 5, b = rnd(36) + 5, c = rnd(36) + 5, d = T - a - b - c;
        if (d >= 5 && d <= 40) { v = [a, b, c, d]; break; }
      }
      if (!v) continue;
      /* ② 造线索池：全是真话 */
      var pool = [], i, j, k;
      for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) {
        if (i === j) continue;
        var gap = v[i] - v[j];
        if (gap >= 2 && gap <= 14) pool.push({ k: 'eq', a: i, b: j, d: gap });
        if (v[i] === 2 * v[j]) pool.push({ k: 'mul', a: i, b: j, m: 2 });
      }
      for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) for (k = j + 1; k < 4; k++) {
        if (i === j || i === k) continue;
        var off = v[i] - v[j] - v[k];
        if (off !== 0 && Math.abs(off) <= 14) pool.push({ k: 'lin', a: i, i: j, j: k, off: off });
      }
      if (pool.length < 3) continue;
      var base = { k: 'sum', t: T };
      /* ③ 挑三条关系：合起来唯一解 + 每条都吃得着劲（删掉就不唯一） */
      for (var q = 0; q < 80; q++) {
        var three = shuffle(pool.slice()).slice(0, 3);
        var clues = [base].concat(three);
        if (saltCount(clues) !== 1) continue;
        var tight = true;
        for (var r = 0; r < 3; r++) {
          var less = [base];
          for (var z = 0; z < 3; z++) if (z !== r) less.push(three[z]);
          if (saltCount(less) < 2) { tight = false; break; }
        }
        if (!tight) continue;
        return { clues: clues, sol: v.slice(), total: T, lines: clues.map(saltLine) };
      }
    }
    return null;
  }

  function uiSalt(H, api) {
    var inst = genSalt();
    if (!inst) { H.setBody('<p class="pz-tip">账本潮得看不清了，回头再算。</p>'); H.setBtns([{ label: '好', fn: function () { H.close(); } }]); return; }
    var val = [5, 5, 5, 5], tries = 0;
    H.setTitle('✦ 告示牌 · 盐垛清点');
    function body(msg) {
      var h = '<p class="pz-tip">盐场的账本被潮气泡花了，只剩这几句批注。<b>四个垛子各多少袋？</b>（每垛 5–40 袋）</p>' +
        '<div class="pz-clue">' + inst.lines.join('<br>') + '</div><div class="jh-salt">';
      for (var i = 0; i < 4; i++) {
        h += '<div class="jh-row"><b class="jh-name">' + SALT_NAMES[i] + '</b>' +
          '<button class="jh-min" data-i="' + i + '" data-d="-5">−5</button>' +
          '<button class="jh-min" data-i="' + i + '" data-d="-1">−1</button>' +
          '<span class="jh-num" id="jh-n' + i + '">' + val[i] + '</span>' +
          '<button class="jh-min" data-i="' + i + '" data-d="1">+1</button>' +
          '<button class="jh-min" data-i="' + i + '" data-d="5">+5</button></div>';
      }
      h += '</div><div class="pz-progress" id="jh-msg">' + (msg || '数清了就交账。错了我只说你错，不说是哪一垛。') + '</div>';
      H.setBody(h);
      qa('.jh-min', H.modalBody).forEach(function (b) {
        b.onclick = function () {
          var i = Number(b.getAttribute('data-i')), d = Number(b.getAttribute('data-d'));
          val[i] = Math.max(1, Math.min(99, val[i] + d));
          inBody(H, '#jh-n' + i).textContent = val[i];
        };
      });
    }
    body();
    H.setBtns([
      { label: '交账', fn: function () {
        var ok = true;
        for (var i = 0; i < 4; i++) if (val[i] !== inst.sol[i]) ok = false;
        if (ok) { api.pay('盐垛清点'); return; }
        tries++;
        bump(H);
        inBody(H, '#jh-msg').innerHTML = tries === 1
          ? '对不上。再核一遍批注 —— 有一句是「两垛合起来」的关系。'
          : '还是对不上（第 ' + tries + ' 回）。把四条关系一条条代进去，别跳。';
      } },
      { label: '合上账本', fn: function () { H.close(); } }
    ]);
  }

  /* ============================================================
     二 · 夜里的潮声 —— 时间线互证（指认一个人）
     变量：潮痕等级 ⇄ 时辰 要靠墙上的表翻；人的话有的报时辰有的报潮痕。
     ============================================================ */
  var HOURS = ['子时', '丑时', '寅时', '卯时', '辰时', '巳时', '午时', '未时'];
  var LVC = ['一', '二', '三', '四', '五', '六', '七', '八'];
  var TIDE_PEOPLE = ['阿盐', '阿禾', '小满', '阿七'];
  var TIDE_PLACES = ['盐仓', '码头', '堤上', '灶房'];

  /* 一句断言 → 落哪个时辰（报时辰的直接用；报潮痕的去表上翻） */
  function tideHourOf(c, hourOfLevel) { return c.mode === 'time' ? c.h : hourOfLevel[c.lv]; }
  /* 表：等级 index（0=一痕）→ 时辰 index */
  function tideTable(perm) { var m = []; for (var h = 0; h < 8; h++) m[perm[h]] = h; return m; }
  /* 谁的行踪说不通（自己的话自相打架 / 我报的「我和他在一块儿」跟他的行踪对不上） */
  function tideBlame(claims, hourOfLevel) {
    var own = [{}, {}, {}, {}], i, c, h;
    for (i = 0; i < claims.length; i++) {
      c = claims[i];
      if (c.with >= 0) continue;
      h = tideHourOf(c, hourOfLevel);
      if (own[c.p][h] !== undefined && own[c.p][h] !== c.place) own[c.p][h] = -1;  /* 自相矛盾，标记 -1 */
      else own[c.p][h] = c.place;
    }
    var blame = [];
    for (i = 0; i < claims.length; i++) {
      c = claims[i];
      if (c.with < 0) continue;
      h = tideHourOf(c, hourOfLevel);
      var other = own[c.with][h];
      if (other !== undefined && other !== c.place && blame.indexOf(c.p) < 0) blame.push(c.p);
    }
    for (i = 0; i < 4; i++) for (h = 0; h < 8; h++) {
      if (own[i][h] === -1 && blame.indexOf(i) < 0) blame.push(i);
    }
    return blame;
  }
  function genTide() {
    for (var attempt = 0; attempt < 400; attempt++) {
      var perm = shuffle([0, 1, 2, 3, 4, 5, 6, 7]);      /* perm[时辰] = 潮痕等级 */
      var hourOfLevel = tideTable(perm);
      var loc = [], h, p;
      for (h = 0; h < 8; h++) loc.push([rnd(4), rnd(4), rnd(4), rnd(4)]);
      /* 每人先给两句自己的行踪（一句报时辰、一句报潮痕），时辰互不相同 */
      var ownH = [], claims = [];
      for (p = 0; p < 4; p++) {
        var hs = shuffle([0, 1, 2, 3, 4, 5, 6, 7]).slice(0, 2);
        ownH.push(hs);
        claims.push({ p: p, h: hs[0], mode: 'time', place: loc[hs[0]][p], with: -1 });
        claims.push({ p: p, h: hs[1], mode: 'tide', lv: perm[hs[1]], place: loc[hs[1]][p], with: -1 });
      }
      /* 再给每人一句「我和某人一块儿」；其中一句留给「那晚嘴硬的人」去撒谎 */
      var alibi = [];
      for (p = 0; p < 4; p++) {
        var cand = [];
        for (var x = 0; x < 4; x++) {
          if (x === p) continue;
          for (var q = 0; q < ownH[x].length; q++) {
            var hh = ownH[x][q];
            if (loc[hh][p] === loc[hh][x]) cand.push({ x: x, h: hh });
          }
        }
        if (!cand.length) { cand = null; break; }
        var pickc = cand[rnd(cand.length)];
        /* 故意让这句话跟对方的报法错开：对方报时辰，这句就报潮痕 —— 不翻表就比不出来 */
        var partner = claims.filter(function (c) { return c.p === pickc.x && c.h === pickc.h; })[0];
        alibi.push({ p: p, h: pickc.h, x: pickc.x, place: loc[pickc.h][p], mode: partner && partner.mode === 'time' ? 'tide' : 'time' });
      }
      if (!alibi.length || alibi.length !== 4) continue;
      /* 抽一个人当「那晚嘴硬的人」，把他那句互证改成一个对不上的地方 */
      var liar = rnd(4), mine = alibi[liar], bad = mine.place;
      while (bad === mine.place) bad = rnd(4);
      var all = claims.concat(alibi.map(function (a) {
        if (a.p !== liar) return { p: a.p, h: a.h, mode: a.mode, lv: perm[a.h], place: a.place, with: a.x };
        return { p: a.p, h: a.h, mode: mine.mode, lv: perm[mine.h], place: bad, with: mine.x };
      }));
      all = shuffle(all);
      var blame = tideBlame(all, hourOfLevel);
      if (blame.length !== 1 || blame[0] !== liar) continue;      /* 必须恰好一人说不通，而且就是设计的那个人 */
      return { claims: all, perm: perm, hourOfLevel: hourOfLevel, liar: liar, bad: bad };
    }
    return null;
  }
  function tideSay(c) {
    var when = c.mode === 'time' ? HOURS[c.h] : ('潮到' + LVC[c.lv] + '痕');
    if (c.with >= 0) return when + '，我和' + TIDE_PEOPLE[c.with] + '一块儿在' + TIDE_PLACES[c.place] + '。';
    return when + '，我在' + TIDE_PLACES[c.place] + '。';
  }

  function uiTide(H, api) {
    var inst = genTide();
    if (!inst) { H.setBody('<p class="pz-tip">潮声太杂，这桩先放着。</p>'); H.setBtns([{ label: '好', fn: function () { H.close(); } }]); return; }
    var tries = 0;
    H.setTitle('✦ 告示牌 · 夜里的潮声');
    var table = '<div class="jh-tide">';
    for (var i = 0; i < 8; i++) table += '<span><b>' + HOURS[i] + '</b> 潮到' + LVC[inst.perm[i]] + '痕</span>';
    table += '</div>';
    var talk = '';
    for (var p = 0; p < 4; p++) {
      var mine = inst.claims.filter(function (c) { return c.p === p; });
      talk += '<div class="jh-say"><b>' + TIDE_PEOPLE[p] + '</b><br>' +
        mine.map(function (c) { return '「' + tideSay(c) + '」'; }).join(' ') + '</div>';
    }
    H.setBody('<p class="pz-tip">昨夜盐仓少了三袋盐。守夜的四个人各说了一段话，墙上刻着昨夜的潮位表。</p>' +
      '<div class="pz-clue"><b>墙上那张表（时辰 ⇄ 潮痕）</b>' + table + '</div>' +
      '<div class="pz-clue">四个人是这么说的 ——<br>' + talk + '</div>' +
      '<div class="pz-progress" id="jh-msg">' + '那句话跟他自己的行踪对不上 —— 指着谁？错了我只说你错，不说是错在哪。' + '</div>');
    var btns = [];
    for (var q = 0; q < 4; q++) btns.push({
      label: '是 ' + TIDE_PEOPLE[q], fn: (function (idx) {
        return function () {
          if (idx === inst.liar) { api.pay('夜里的潮声'); return; }
          tries++; bump(H);
          inBody(H, '#jh-msg').innerHTML = '不是他（第 ' + tries + ' 回）。' +
            '两条尺子都得用：墙上那张表把「几痕」翻成「几时」，再拿两个人各自的话对一遍。';
        };
      })(q)
    });
    btns.push({ label: '先不查', fn: function () { H.close(); } });
    H.setBtns(btns);
  }

  /* ============================================================
     三 · 谁在账上做手脚 —— 最少矛盾子集（勾一组）
     八张欠条都是「或」句；恰好有一组 k 张不可能同时为真，且是最少的一组。
     ============================================================ */
  var RV = [
    { pos: '老周是船主', neg: '老周不是船主' },
    { pos: '那夜刮的是东风', neg: '那夜刮的不是东风' },
    { pos: '盐价是三文', neg: '盐价不是三文' },
    { pos: '丢的正是三袋', neg: '丢的不是三袋' },
    { pos: '账房那夜在镇上', neg: '账房那夜不在镇上' },
    { pos: '有条船进过港', neg: '没有船进过港' }
  ];
  function rClauseLine(lits) {
    var s = lits.map(function (l) { return l[1] ? RV[l[0]].pos : RV[l[0]].neg; });
    if (s.length === 1) return s[0] + '。';
    return s.join('，或者 ') + '。';
  }
  function rSat(lits, asg) {
    for (var i = 0; i < lits.length; i++) if (!!(asg >> lits[i][0] & 1) === !!lits[i][1]) return true;
    return false;
  }
  function rSubSat(clauses, mask) {
    for (var a = 0; a < 64; a++) {
      var all = true;
      for (var i = 0; i < clauses.length; i++) {
        if (!(mask >> i & 1)) continue;
        if (!rSat(clauses[i], a)) { all = false; break; }
      }
      if (all) return true;
    }
    return false;
  }
  function rPop(x) { var n = 0; while (x) { n += x & 1; x >>= 1; } return n; }
  /* 全部「最小不可能同时为真」的子集 */
  function rMus(clauses) {
    var unsat = [], m, i;
    for (m = 1; m < (1 << clauses.length); m++) if (!rSubSat(clauses, m)) unsat.push(m);
    return unsat.filter(function (u) {
      for (i = 0; i < clauses.length; i++) {
        if (!(u >> i & 1)) continue;
        if (unsat.indexOf(u & ~(1 << i)) >= 0) return false;
      }
      return true;
    });
  }
  function genReceipts() {
    for (var attempt = 0; attempt < 6000; attempt++) {
      var clauses = [], used = {}, i;
      for (i = 0; i < 8; i++) {
        var shape = rnd(3), lits = [], guard = 0;
        while (guard++ < 40) {
          var v = rnd(6), w = rnd(2) ? true : false, key = v + ':' + (w ? 1 : 0);
          if (lits.some(function (l) { return l[0] === v; })) continue;
          lits.push([v, w]);
          if (lits.length >= (shape === 0 ? 1 : (shape === 1 ? 2 : 3))) break;
        }
        var sig = lits.map(function (l) { return l[0] + (l[1] ? '+' : '-'); }).join('');
        if (used[sig]) { i--; continue; }
        used[sig] = 1;
        clauses.push(lits);
      }
      var mus = rMus(clauses);
      if (mus.length !== 1) continue;
      var k = rPop(mus[0]);
      if (k < 3 || k > 4) continue;
      var idx = [];
      for (i = 0; i < 8; i++) if (mus[0] >> i & 1) idx.push(i);
      return { clauses: clauses, k: k, answer: idx, lines: clauses.map(rClauseLine) };
    }
    return null;
  }

  function uiReceipts(H, api) {
    var inst = genReceipts();
    if (!inst) { H.setBody('<p class="pz-tip">欠条太乱，这桩先放着。</p>'); H.setBtns([{ label: '好', fn: function () { H.close(); } }]); return; }
    var sel = {}, tries = 0;
    H.setTitle('✦ 告示牌 · 谁在账上做手脚');
    function paint() {
      qa('.jh-receipt', H.modalBody).forEach(function (el) {
        var i = Number(el.getAttribute('data-i'));
        el.className = 'jh-receipt' + (sel[i] ? ' on' : '');
      });
      var n = Object.keys(sel).length;
      inBody(H, '#jh-msg').innerHTML = '挑了 <b>' + n + '</b> / ' + inst.k + ' 张。' +
        (tries ? '（错了 ' + tries + ' 回）' : '必须正好挑出最少的那一组。');
    }
    var h = '<p class="pz-tip">柜上翻出八张欠条，是同一伙人写的。其中<b>最少有 ' + inst.k + ' 张不可能同时为真</b> —— 挑出那几张。</p>' +
      '<div class="jh-receipts">';
    for (var i = 0; i < 8; i++) h += '<button class="jh-receipt" data-i="' + i + '"><b>' + (i + 1) + '</b>' + inst.lines[i] + '</button>';
    h += '</div><div class="pz-progress" id="jh-msg"></div>';
    H.setBody(h);
    qa('.jh-receipt', H.modalBody).forEach(function (b) {
      b.onclick = function () {
        var i = Number(b.getAttribute('data-i'));
        if (sel[i]) delete sel[i]; else sel[i] = 1;
        paint();
      };
    });
    paint();
    H.setBtns([
      { label: '定案', fn: function () {
        var got = Object.keys(sel).map(Number).sort(function (a, b) { return a - b; });
        if (got.length !== inst.k) { inBody(H, '#jh-msg').innerHTML = '得正好挑 ' + inst.k + ' 张 —— 多一张少一张都不叫「最少」。'; return; }
        var ok = got.length === inst.answer.length && got.every(function (v, ix) { return v === inst.answer[ix]; });
        if (ok) { api.pay('谁在账上做手脚'); return; }
        tries++; bump(H);
        paint();
        inBody(H, '#jh-msg').innerHTML = '不是这一组（第 ' + tries + ' 回）。' +
          '把这 ' + got.length + ' 张当条件摆一摆：要是有一种世界让它们同时成立，那就不是它们。';
      } },
      { label: '先合上', fn: function () { H.close(); } }
    ]);
  }

  /* ---------------- 出口 ---------------- */
  var KINDS = {
    salt: { name: '盐垛清点', gold: 12, run: uiSalt },
    tide: { name: '夜里的潮声', gold: 15, run: uiTide },
    receipts: { name: '谁在账上做手脚', gold: 20, run: uiReceipts }
  };

  function enter(kind, H, api) {
    var k = KINDS[kind];
    if (!k || !H) return false;
    if (!api) api = {};
    if (!api.pay) api.pay = function (name) { H.toast('结了 · ' + name); H.close(); };
    k.run(H, api);
    if (H.refresh) H.refresh();
    return true;
  }

  global.JOBSHARD23 = {
    KINDS: KINDS, enter: enter,
    /* 给单测 / 探针用的纯逻辑：不碰 DOM */
    _logic: {
      genSalt: genSalt, saltCount: saltCount, saltOk: saltOk, saltLine: saltLine,
      genTide: genTide, tideBlame: tideBlame, tideTable: tideTable, tideSay: tideSay,
      genReceipts: genReceipts, rMus: rMus, rSubSat: rSubSat, rClauseLine: rClauseLine,
      HOURS: HOURS, LVC: LVC, TIDE_PEOPLE: TIDE_PEOPLE, TIDE_PLACES: TIDE_PLACES,
      SALT_NAMES: SALT_NAMES, RV: RV
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
