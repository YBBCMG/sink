/* 记忆当铺 · 第二章核心机制：**主动丧失记忆（献忆）**
   中枢口径（派单 §三），四条都是硬要求，这里逐条落地：
     ① **代价必须在点之前看得懂**：面板先写「你将失去：<哪一段>；之后会变：<哪些台词/线索>」，
        再给一次**预览**（能先看一眼再决定献不献）—— `preview()` 就是那一眼。
     ② **献出的必须是一章里真实存在的那段记**（复用一章已有的记 id，MEM23 里查得到），
        不许凭空造"痛感 +1"这种抽象资源 —— 候选表直接由 `D.MEM23` 现算。
     ③ **绝不许软锁**：献忆后一章真结局仍可达、二章仍能通关 —— 见 index.js 的 noSoftLock()
        与 tools/verify-ch2.mjs 的红→绿判据；
        另外本文件每条路都留了兜底：该献的记**已经不在身上**（被献过 / 被雾咬没）时一律放行，
        不让你卡在"要交的东西已经没了"这种死局里。
     ④ 一章原有的「押一段记开门」照旧保留，这里是叠加，不替换（没碰 story23 的任何一条）。 */
(function (global) {
  'use strict';

  function T(k) { return (global.CH2_TEXT || {})[k] || {}; }
  function itemOf(id) { return global.CH2_ITEMS ? global.CH2_ITEMS.byId(id) : null; }

  /* 三处献忆：要交的记写死 id（"必须是真实存在的那段记"），雾那处是**动态**解 —— 挑最轻的一段 */
  var PUZZLES = {
    door:    { key: 'door',    flag: 'ch2_door_ok',    needItem: 'wax',   answer: 'm_blank',    logTag: '（封口）' },
    tickets: { key: 'tickets', flag: 'ch2_tickets_ok', needItem: 'slip',  answer: 'm_pawnsig',  logTag: '（垫签）' },
    fog:     { key: 'fog',     flag: 'ch2_fog_ok',     needItem: 'scale', answer: 'lightest',   logTag: '（喂雾）' }
  };

  /* ---------- 代价：这一段记交出去，一章里哪些点会换台词 ----------
     数据全部现算（MEM_LINK 反查 + LOST_SAY 有没有写过专属台词），不许在文案里手写死数。 */
  function costOf(host, memId) {
    var link = (host && host.MEM_LINK) || {}, lost = (host && host.LOST_SAY) || {};
    var pts = [];
    Object.keys(link).forEach(function (pid) { if (link[pid] === memId) pts.push(pid); });
    var names = pts.map(function (pid) { return placeName(host, pid); });
    return {
      points: pts,
      names: names,
      written: pts.filter(function (pid) { return !!lost[pid]; }).length,
      count: pts.length
    };
  }
  function placeName(host, pid) {
    var S = (host && host.D && host.D.SCENES) || {};
    var out = pid;
    Object.keys(S).forEach(function (sid) {
      (S[sid].places || []).forEach(function (p) { if (p.id === pid) out = p.name || pid; });
    });
    return out;
  }
  function costLines(host, m, C) {
    var out = ['你将失去：' + (m.tag ? '「' + m.tag + '」' : '') + '这一段 ——', '　「' + host.memBody(m) + '」'];
    out.push(C.count
      ? '之后会变：一章里有 ' + C.count + ' 处会换一套话 —— ' + C.names.join(' / ') +
        '（其中 ' + C.written + ' 处一章已经写好了失忆台词，其余走通用句）'
      : '之后会变：一章暂时没有点挂在它上面，代价是它自己 —— 你再也读不到这段话。');
    out.push('之后不会变：任务、旗标、相簿、结局判定都不看这一段记 ⇒ 一章真结局不受影响。');
    return out;
  }

  /* 旗标一律从宿主的状态里现取（ch2Host 只借出一个 getter，不另给一份副本 —— 给副本就会各写各的） */
  function F(host) { return (host && host.S && host.S.flags) || {}; }
  function itemsTaken(host) { return !!F(host).ch2_shelf_taken; }

  /* ---------- 面板 ---------- */
  function open(key, host) {
    var P = PUZZLES[key], X = T(key);
    if (!P || !X.title) return false;
    if (F(host)[P.flag]) { host.say((X.again || []).slice(), null, { title: X.title }); return true; }

    var it = itemOf(P.needItem);
    if (!itemsTaken(host) || !F(host)['ch2_it_' + P.needItem]) {
      /* 没道具 = 卡在这儿，而这句"卡在哪"就是道具的验收判据（写在 items.js 的 stuck 里） */
      var miss = it ? it.stuck : '';
      host.say((X.lead || []).concat([X.noTool || miss, miss && X.noTool ? miss : '']).filter(Boolean), null, { title: X.title });
      return true;
    }

    var held = ((host.D && host.D.MEM23) || []).filter(function (m) { return host.memHas(m.id); });
    var body = document.bodyOf ? document.bodyOf() : null;
    host.setTitle(X.title);
    var html = '<p class="pz-tip">' + (X.lead || []).join('</p><p class="pz-tip">') + '</p>' +
      '<div class="arc-h">' + (X.ask || '交哪一段记出去？') + '</div>' +
      (held.length
        ? held.map(function (m) {
            var C = costOf(host, m.id);
            return '<div class="arc-item">' + host.memBody(m) +
              '<br><span class="pz-tip">代价：' + (C.count ? '一章 ' + C.count + ' 处会换话' : '只丢它自己') +
              '</span> <button class="pz-btn" data-ch2see="' + m.id + '">先看一眼</button></div>';
          }).join('')
        : '<div class="arc-lock">身上一段记都没有了。</div>');
    host.setBody(html);
    host.setBtns([{ label: '再想想', fn: host.closeModal }]);
    host.openModal();

    var root = host.body ? host.body() : document.getElementById('m-body');
    if (root) root.querySelectorAll('[data-ch2see]').forEach(function (el) {
      el.onclick = function () { preview(P, X, el.getAttribute('data-ch2see'), host); };
    });
    return true;
  }

  /* ---------- 预览：先看一眼再决定（中枢硬要求 ①） ---------- */
  function preview(P, X, memId, host) {
    var m = host.D.mem23ById(memId);
    if (!m) return;
    var C = costOf(host, memId);
    host.setTitle(X.title + ' · 代价');
    host.setBody('<p class="pz-tip">' + costLines(host, m, C).join('</p><p class="pz-tip">') + '</p>' +
      '<p class="pz-tip">看清楚再决定。这一步没有回头路 —— 交出去的记，柜上不赎。</p>');
    host.setBtns([
      { label: '封上口，交出去', fn: function () { confirmGive(P, X, m, host); } },
      { label: '再看一会儿', fn: function () { open(P.key, host); } }
    ]);
    host.openModal();
  }
  function confirmGive(P, X, m, host) {
    var ok = P.answer === 'lightest' ? isLightest(host, m.id) : (m.id === P.answer);
    if (!ok) { host.sfx('blip'); host.toast(X.wrong || '这一段不对。'); return; }
    give(P, X, m, host);
  }
  function isLightest(host, id) {
    var m = host.D.mem23ById(id); if (!m) return false;
    var held = host.D.MEM23.filter(function (x) { return host.memHas(x.id); });
    var min = Math.min.apply(null, held.map(function (x) { return x.w || 0; }));
    return (m.w || 0) <= min;
  }

  /* ---------- 献出的那一下：记真的没了（写进一章的存档） ---------- */
  function give(P, X, m, host) {
    host.sfx('open');
    if (!host.S.mem[m.id]) host.S.mem[m.id] = { state: 'held', pawns: 0, read: 0, sighted: 0, stored: 0 };
    host.S.mem[m.id].state = 'donated';           /* 一章的 memKnown()/memHas() 立刻按"不在身上"算 */
    host.S.mem[m.id].donated = m.tag || 1;
    host.markFlag('ch2_gave_' + m.id);
    host.markFlag('ch2_given');                    /* 旧账本记一行（辅助道具，不挡路） */
    host.markFlag(P.flag);
    host.addLog(P.logTag + '你把「' + (m.tag || m.id) + '」那一段交出去了。' + (X.why || ''));
    host.dirty();
    host.save();
    host.closeModal();
    host.say((X.end || []).slice(), null, { title: X.title });
  }

  /* ---------- 兜底：该交的记已经不在身上了 —— 一律放行，绝不卡死 ---------- */
  function gonePath(key, host) {
    var P = PUZZLES[key], X = T(key);
    if (!P || F(host)[P.flag]) return false;
    host.markFlag(P.flag);
    host.addLog('（免交）' + (X.title || key) + '：要交的那段记已经不在身上，门/雾/票认了账。');
    host.dirty(); host.save();
    host.say((X.gone || ['（要交的那段记已经不在你身上了 —— 这里认了账，让你过去。）']).slice(), null, { title: X.title });
    return true;
  }

  global.CH2_PUZ = { list: PUZZLES, open: open, preview: preview, give: give, costOf: costOf, costLines: costLines, gonePath: gonePath, isLightest: isLightest };
})(typeof window !== 'undefined' ? window : globalThis);
