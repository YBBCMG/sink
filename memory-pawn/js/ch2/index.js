/* 记忆当铺 · 第二章骨架（掌柜视角）—— 挂载与接线
   中枢派单 §一/§七：只求**跑得通**（色块占位、台词大纲级），图片与正文交剧情线 / 美术线。
   本目录（js/ch2/）整目录归"记忆玩法（功能玩法）线"，一章的数据文件（story23 / puzzles23）一个字没碰。

   跟引擎的接口只有三处（都在 game23.js，走 collab 协调）：
     ① interact() 里加一行：`p.ch2` 的点转给 global.CH2.open(p, host)；
     ② artOf() 里加一行：ch2 的点各有各的模型名（一章回归套 ㊶ 的判据）；
     ③ drawPlace() 里加一个分支：色块占位（美术线后面换成自己的画）。
   存档不新增键：进度全部落在 S.flags 的 `ch2_` 前缀旗标 + S.mem 的 state 上，一章存档原样吃。 */
(function (global) {
  'use strict';

  var VAULT = 'ch2_vault';
  var installed = null;

  function D() { return global.WORLD; }
  function T(k) { return (global.CH2_TEXT || {})[k] || {}; }
  function flag(s, f) { return !!(s && s.flags && s.flags[f]); }

  /* ---------- 加载即装图（story23 先跑、game23 后跑：此刻 WORLD 已经在） ---------- */
  function install() {
    var d = D();
    if (!d || !d.SCENES || !global.CH2_SCENES) return null;
    installed = global.CH2_SCENES.install(d);
    return installed;
  }
  install();

  /* ---------- 进场条件：一章通关（真结局走完 / 或已经结算过结局） ---------- */
  function cleared(state) {
    var s = state || {};
    if (s.cleared) return true;
    return flag(s, 'name_returned');
  }
  /* 管理员入口（2026-10-13 用户点：「给他一个直接进第二章的口子」，操作面在顶栏 DEV 面板）。
     这一条**只是 OR**：cleared() 与 name_returned 一个字没改 —— 开关关着时行为和从前逐字一致，
     开关本身不进 flags，也不参与任何一章判定（verify-ch2 ⑯ 钉死）。 */
  function adminEntry(state) {
    var s = state || {};
    return !!(s.ch2 && s.ch2.adminEntry === true);
  }

  /* ---------- 点分发 ---------- */
  function open(p, host) {
    if (!p || !p.ch2) return false;
    switch (p.id) {
      case 'ch2_vaultdoor': return enterVault(host);
      case 'ch2_shelf':     return shelf(host);
      case 'ch2_tickets':   return step('tickets', host);
      case 'ch2_door':      return step('door', host);
      case 'ch2_fog':       return fog(host);
      case 'ch2_backalley': return alley(host);
      case 'ch2_back':      return leave(host);
      default: return false;
    }
  }
  function enterVault(host) {
    if (!cleared(host.S) && !adminEntry(host.S)) {
      host.say([
        '（里间那道门后面还有一层。你听得见里面有纸的声音，可门不认你。）',
        '（得先把岛上那一夜走完 —— 一个人是不是掌柜，不是自己说了算的。）'
      ], null, { title: '里间 · 那排架子' });
      return true;
    }
    host.markFlag('ch2_entered');
    host.enterScene(VAULT, 3, 12);
    host.dirty(); host.save();
    /* 标题读 `CH2_TEXT.sub`（`PROVISIONAL` 清单里那个键）—— 2026-10-14 中枢抓的死插槽：
       这里从前是写死的字面量 `'记忆库 · 当铺里间'`，改 `text.js` 的 `sub` 屏幕上一点变化都没有，
       用户当场复现（"进了库房，但并没有改变什么呢"）。verify-ch2 ⑲/⑳ 现在钉死"清单里每个键都得真印上屏"。
       兜底那个短词只防 `text.js` 没加载时标题全空，不承担文案口径。 */
    host.say((T('enterLead').length ? T('enterLead') : []).slice(), null, { title: T('sub') || '记忆库' });
    return true;
  }
  function leave(host) {
    var d = D(), sc = d.SCENES['pawnshop'];
    host.enterScene('pawnshop', sc ? sc.spawn.x : 10, sc ? sc.spawn.y : 11);
    host.say(T('backOut').slice(), null, { title: '外间' });
    return true;
  }

  /* ---------- 柜上留下的三样（道具 = 钥匙，取走不要钱；每件带效果声明） ---------- */
  function shelf(host) {
    var box = global.CH2_ITEMS.list, taken = [], left = [];
    box.forEach(function (it) { (flag(host.S, 'ch2_it_' + it.id) ? taken : left).push(it); });
    host.setTitle(T('shelf').title || '柜上留下的三样');
    var html = '<p class="pz-tip">' + (T('shelf').lead || []).join('</p><p class="pz-tip">') + '</p>';
    if (left.length) {
      html += left.map(function (it) {
        return '<div class="arc-item">' + it.name + ' —— ' + it.desc +
          '<br><span class="pz-tip">' + it.how + '</span>' +
          '<br><button class="pz-btn" data-ch2take="' + it.id + '">取走</button></div>';
      }).join('');
    } else html += '<div class="arc-lock">三样都拿齐了。</div>';
    if (flag(host.S, 'ch2_it_ledger')) {
      var given = ((host.D && host.D.MEM23) || []).filter(function (m) { return flag(host.S, 'ch2_gave_' + m.id); });
      html += '<div class="arc-h">旧账本 · 损失清单</div>' + (given.length
        ? given.map(function (m) { return '<div class="arc-item">已交出去：' + (m.tag || '') + ' —— 「' + host.memBody(m) + '」</div>'; }).join('')
        : '<div class="arc-lock">还是空的。</div>');
    }
    host.setBody(html);
    host.setBtns([{ label: '合上', fn: host.closeModal }]);
    host.openModal();
    var root = host.body ? host.body() : document.getElementById('m-body');
    if (root) root.querySelectorAll('[data-ch2take]').forEach(function (el) {
      el.onclick = function () {
        var id = el.getAttribute('data-ch2take');
        host.markFlag('ch2_it_' + id);
        host.markFlag('ch2_shelf_taken');
        host.sfx('coin');
        host.addLog('（库房）你取走了' + (global.CH2_ITEMS.byId(id) || {}).name + '。');
        host.dirty(); host.save(); host.closeModal();
        shelf(host);
      };
    });
    return true;
  }

  /* ---------- 三处献忆 ---------- */
  function step(key, host) {
    var P = global.CH2_PUZ.list[key];
    if (!P) return false;
    /* 兜底先走：该献的那段记已经不在身上（献过 / 被雾咬没 / 老档没有）→ 放行，不卡死 */
    var ans = P.answer === 'lightest'
      ? ((host.D.MEM23.filter(function (m) { return host.memHas(m.id); })).length === 0)
      : !host.memHas(P.answer);
    if (!flag(host.S, P.flag) && ans) return global.CH2_PUZ.gonePath(key, host);
    return global.CH2_PUZ.open(key, host);
  }

  /* ---------- 后门夜路（复用镇子地图的挂点，只给线索，不做门） ---------- */
  function alley(host) {
    var X = T('alley');
    if (flag(host.S, 'ch2_alley_seen')) { host.say(X.again.slice(), null, { title: X.title }); return true; }
    host.markFlag('ch2_alley_seen');
    host.say(X.lead.concat(X.end), null, { title: X.title });
    return true;
  }

  /* ---------- 码头雾里：第三处献忆 + 二章结局（占位正文） ---------- */
  function fog(host) {
    if (!flag(host.S, 'ch2_door_ok')) {
      host.say(['（脚印到这儿就断了。雾里头有东西在等你把库里的事办完。）',
                '（库房的门还没开 —— 先回记忆库。）'], null, { title: T('fog').title });
      return true;
    }
    if (flag(host.S, 'ch2_fog_ok')) {
      if (!flag(host.S, 'ch2_end')) {
        host.markFlag('ch2_end');
        host.dirty(); host.save();
        host.say(T('ending').lines.slice(), null, { title: T('ending').title });
        return true;
      }
      host.say(T('fog').again.slice(), null, { title: T('fog').title });
      return true;
    }
    return step('fog', host);
  }

  /* ---------- 自检：骨架自己的判据（测试与验收脚本直接调） ---------- */
  function validate(d) {
    d = d || D();
    var errs = [];
    if (!d || !d.SCENES) return ['WORLD 没装好'];
    var sc = d.SCENES[VAULT];
    if (!sc) errs.push('没装进记忆库场景：' + VAULT);
    else {
      if (sc.id !== VAULT) errs.push('场景 id 对不上');
      if (!sc.name || !sc.palette) errs.push('场景缺 name/palette');
      if (d.isSolidIn(VAULT, sc.spawn.x, sc.spawn.y)) errs.push('出生点落在障碍上');
      sc.places.forEach(function (p) {
        if (!p.ch2) errs.push('库房里的点不是 ch2 点：' + p.id);
        if (p.puz && !d.PUZZLES[p.puz]) errs.push('引用了不存在的谜题：' + p.id);
        if (p.to && !d.SCENES[p.to]) errs.push('指向不存在的场景：' + p.id);
      });
    }
    /* 复用挂点：三个都得在，且带着 back_ok 门控 */
    (global.CH2_SCENES.HOOKS || []).forEach(function (h) {
      var hit = (d.SCENES[h.sid] && d.SCENES[h.sid].places || []).filter(function (p) { return p.id === h.id; })[0];
      if (!hit) { errs.push('复用挂点没挂上：' + h.sid + '.' + h.id); return; }
      if (hit.need !== 'back_ok') errs.push('挂点门控不对：' + h.id);
      if (!hit.ch2) errs.push('挂点没打 ch2 记号：' + h.id);
    });
    /* 道具：四件都得答得出「没有它卡在哪」 */
    (global.CH2_ITEMS.list || []).forEach(function (it) {
      if (!it.stuck) errs.push('道具没写"没有它卡在哪"：' + it.id);
      if (!it.how) errs.push('道具没写效果声明 how：' + it.id);
    });
    if ((global.CH2_ITEMS.list || []).length < 3) errs.push('道具不足三件');
    /* 三处献忆：要献的记必须在一章真表里（不许凭空造） */
    var n = 0;
    Object.keys(global.CH2_PUZ.list).forEach(function (k) {
      n++;
      var P = global.CH2_PUZ.list[k];
      if (P.answer !== 'lightest' && !d.mem23ById(P.answer)) errs.push('要献的记在一章表里不存在：' + k + ' -> ' + P.answer);
      if (!(global.CH2_TEXT[k] || {}).title) errs.push('这处献忆没有文案：' + k);
      if (!(global.CH2_ITEMS.list || []).some(function (it) { return it.id === P.needItem; })) errs.push('献忆要的道具不存在：' + k);
    });
    if (n < 3) errs.push('献忆不足三处（' + n + '）');
    /* 每个点各有各的模型名（一章回归套 ㊶ 的同一口径，ch2 的点自己也要满足） */
    Object.keys(d.SCENES).forEach(function (sid) {
      var seen = {};
      d.SCENES[sid].places.forEach(function (p) {
        if (!p.ch2) return;
        var k = 'ch2:' + p.id;
        if (seen[k]) errs.push('ch2 的点重样了：' + sid + '.' + p.id);
        seen[k] = 1;
      });
    });
    return errs;
  }

  /* ---------- 不软锁：献忆之后，一章真结局仍可达 ----------
     纯函数，吃一章自己的判据 trueEndingReachable()；二章能不能走通由 verify-ch2.mjs 真跑。 */
  function noSoftLock(state, d) {
    d = d || D();
    var s = state || {};
    var reachable = d.trueEndingReachable(s);
    var donated = Object.keys(s.mem || {}).filter(function (k) { return (s.mem[k] || {}).state === 'donated'; });
    return {
      ok: !!reachable,
      trueEnding: !!reachable,
      donated: donated,
      /* 交出去的记不许是"一章还在用的钥匙"：KEY_GATE 那处（铁盒）与 needRead 挂的点都不能碰 */
      note: '一章判定只看旗标与相簿，不看记的持有状态 ⇒ 献忆不影响真结局'
    };
  }

  /* ---------- 给开发者面板的节点表（面板不抄第二份 ch2 数据）----------
     一处献忆 = 一个节点：场景 + 点位 + 旗标 + 要献的记 + 要的道具。ch2 加一处献忆，面板自动多一行
     （verify-ch2 ㉒「面板列出的节点数 = ch2 实际谜题数」就是这么钉住的）。 */
  var NODE_PLACE = { door: [VAULT, 'ch2_door'], tickets: [VAULT, 'ch2_tickets'], fog: ['mist', 'ch2_fog'] };
  function devNodes() {
    var out = [];
    Object.keys((global.CH2_PUZ || {}).list || {}).forEach(function (k) {
      var P = global.CH2_PUZ.list[k], where = NODE_PLACE[k] || [];
      out.push({ key: k, puzzle: true, sid: where[0], pid: where[1], name: (T(k).title || k),
        flag: P.flag, item: P.needItem, answer: P.answer });
    });
    out.push({ key: 'shelf', puzzle: false, sid: VAULT, pid: 'ch2_shelf', name: '柜上留下的三样（取道具）', flag: 'ch2_shelf_taken' });
    out.push({ key: 'vaultdoor', puzzle: false, sid: 'pawnshop', pid: 'ch2_vaultdoor', name: '里间 · 那排架子', flag: 'ch2_entered' });
    return out;
  }

  global.CH2 = {
    VAULT: VAULT, install: install, report: function () { return installed; },
    open: open, cleared: cleared, adminEntry: adminEntry, validate: validate, noSoftLock: noSoftLock,
    devNodes: devNodes,
    state: function (s) {
      s = s || (global.PAWN_DEBUG && global.PAWN_DEBUG.api ? global.PAWN_DEBUG.api.state : null);
      var f = (s && s.flags) || {};
      return {
        entered: !!f.ch2_entered,
        admin: adminEntry(s),
        items: ['wax', 'slip', 'scale', 'ledger'].filter(function (i) { return !!f['ch2_it_' + i]; }),
        door: !!f.ch2_door_ok, tickets: !!f.ch2_tickets_ok, fog: !!f.ch2_fog_ok,
        end: !!f.ch2_end,
        given: Object.keys((s && s.mem) || {}).filter(function (k) { return (s.mem[k] || {}).state === 'donated'; })
      };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
