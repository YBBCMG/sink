/* 记忆当铺 · 第二章（掌柜视角）—— 挂载与接线
   中枢派单 §一/§七：只求**跑得通**（色块占位、台词大纲级），图片与正文交剧情线 / 美术线。
   本目录（js/ch2/）整目录归"记忆玩法（功能玩法）线"，一章的数据文件（story23 / puzzles23）一个字没碰。

   跟引擎的接口只有三处（都在 game23.js，走 collab 协调）：
     ① interact() 里加一行：`p.ch2` 的点转给 global.CH2.open(p, host)；
     ② artOf() 里加一行：ch2 的点各有各的模型名（一章回归套 ㊶ 的判据）；
     ③ drawPlace() 里加一个分支：色块占位（美术线后面换成自己的画）。

   ===== 2026-10-17 用户第 3 遍（指着线上截图）拍死的口径 =====
   「这根本没用，全删了吧。这玩意就是这个地图本来就用来放记忆的，你装这堆没用的东西」
   「日志这个东西你就删了吧，日志没什么用，相薄也是右边只有一个记忆和任务就可以。
     而且这个任务他还是按第一章看的。」
   ⇒ ① 库房里按 E 只弹「提交记忆」的散点**整块删**（三份当票 / 库房的门），26 只罐一格不动；
      ② 二章右栏只留「记」+「任务」，日志与相簿在二章里不出现；
      ③ 任务页吃二章自己的表（本文件 §六 的 TASKS），一章的幕表一个字不出现；
      ④ 二章顶栏不露一章字段（当金 / 相簿 / 灯油 / 归潮屿·望归灯），只写二章真有的章·幕·罐。

   ===== 2026-10-17 用户：「这第一章和第二章你可以理解成两个游戏来做，不要让他们有任何关系」
   ⇒ **两套档彻底隔离**（§〇）：二章的进度不再寄生在一章的存档里 ——
      · 一章档（mp23-save-v1）里**零 ch2_ 旗标**（引擎 save() 落盘前把 ch2_ 前缀剥掉）；
      · 二章有**自己的键** mp23-ch2-v1（本文件 persist/hydrate）；
      · 二章的库房账、身上那串记、待上架全部走 `ch2_` 前缀 ⇒ 跟着自己的键走；
      · 二章**不读写一章的记**（vault.js 的 memMap 换成自己的 `ch2_mems`，不再碰 S.mem）。
   ⚠️ 一章的当金（S.gold）二章还在用（§4 开局底金 / 认错扣钱），这一条**没隔离**，已报中枢。 */
(function (global) {
  'use strict';

  var VAULT = 'ch2_vault';
  var KEY2 = 'mp23-ch2-v1';          /* 二章自己的存档键（一章那三个键一个都不碰） */
  var installed = null;

  function D() { return global.WORLD; }
  function T(k) { return (global.CH2_TEXT || {})[k] || {}; }
  function flag(s, f) { return !!(s && s.flags && s.flags[f]); }

  /* ============================================================
     §〇 二章自己的档：一章档里零 ch2_ 旗标，二章自己一个键
     ------------------------------------------------------------
     只搬 `ch2_` 前缀那一片：一章的旗标 / 记 / 相簿 / 任务一个字节都不进这个键，反过来也一样。
     引擎那侧只有两个调用点（game23.js：save() 落盘前剥前缀 → persist(S)；load() 垫完默认 → hydrate(s)），
     走的是 collab claim→副本→sync，没整份重写。 */
  function ls() { try { return global.localStorage || null; } catch (e) { return null; } }
  function lsget(k) { var st = ls(); try { return st ? st.getItem(k) : null; } catch (e) { return null; } }
  function lsset(k, v) { var st = ls(); try { if (st) st.setItem(k, v); } catch (e) { /* 私密模式/配额满：别把游戏弄崩 */ } }
  /* 只挑 ch2_ 前缀的旗标（二章的全部进度都在这片里：进门 / 三样道具 / 库房账 / 身上那串 / 待上架 / 结局） */
  function ch2Flags(s) {
    var f = (s && s.flags) || {}, out = {};
    Object.keys(f).forEach(function (k) { if (k.indexOf('ch2_') === 0) out[k] = f[k]; });
    return out;
  }
  /* 落盘：把二章那一片写进自己的键（一章的键由引擎自己写，两边互不覆盖） */
  function persist(s) {
    if (!s) return null;
    var o = { v: 1, at: Date.now(), flags: ch2Flags(s) };
    lsset(KEY2, JSON.stringify(o));
    return o;
  }
  /* 读档：把二章那一片垫回内存（一章档里本来就没有它们） */
  function hydrate(s) {
    if (!s) return 0;
    var raw = lsget(KEY2), o = null;
    try { o = raw ? JSON.parse(raw) : null; } catch (e) { o = null; }
    if (!o || !o.flags) return 0;
    s.flags = s.flags || {};
    var n = 0;
    Object.keys(o.flags).forEach(function (k) {
      if (k.indexOf('ch2_') !== 0) return;          /* 脏档里混进一章的键：不认 */
      s.flags[k] = o.flags[k]; n++;
    });
    return n;
  }

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
      /* 进第二章的唯一入口：**主界面那两颗册子**（game23.js:4008 直接
         `CH2.open({ id:'ch2_vaultdoor' }, ch2Host())`，不经过任何点位）。
         2026-10-17 用户第 4 遍之后，一章当铺里那个同名点位（`story23.js` 的 (16,10)）
         **已经删掉**（剧情线地盘，走 collab claim→副本→sync 删的）—— 所以这条 case 现在
         是"只有主界面会用"的那一条，**必须留着**：删了它 = 第二章彻底没有入口。
         它不挂引擎的 `to`：一章的地图里没有 `ch2_vault` 这张图（库房由 js/ch2/scenes.js 装），
         挂 `to:` 会被一章自己的世界校验判成死门（world-test ①/④ 实测红过）。
         闸门仍是 enterVault（`cleared() || adminEntry()`），一个字节没改。 */
      case 'ch2_vaultdoor': return enterVault(host);
      case 'ch2_shelf':     return shelf(host);
      case 'ch2_fog':       return fog(host);
      case 'ch2_backalley': return alley(host);
      /* 2026-10-17：`ch2_tickets`（三份当票）/ `ch2_door`（库房的门）两条 case **删了** ——
         那两个点位本身已经从场景表里摘掉（js/ch2/scenes.js 里那条注写了理由），
         这里再留着 case 就是"永远走不到的备用分支"，下一个人会以为还少挂了一个点。 */
      /* 库房那个『出库房 · 柜上』的点：2026-10-17 中枢派单"撞名先拆 id" ——
         它从 `ch2_back` 改名成 `ch2_vault_exit`（`ch2_back` 这个名字让给 S3 那间新房）。
         老名字留成别名：老判据、老存档、老习惯都照旧能走通。 */
      case 'ch2_vault_exit':
      case 'ch2_back':      return leave(host);
      /* S3 账房（`ch2_back` 那间房）里的点位：每个点都给一句正经话。
         引擎那边的顺序是 say（点位自己的话）→ CH2.open（这里）⇒ 我这里是**第二句**，
         不抢第一句、也不吞掉它；没这一条的话默认分支返回 false，玩家按 E 只出半截话。 */
      case 'ch2_back_keeper':   return backLine(host, 'keeper');
      case 'ch2_back_redeem':   return backLine(host, 'redeem');
      case 'ch2_back_chain':    return backLine(host, 'chain');
      case 'ch2_back_desk':     return backLine(host, 'desk');
      case 'ch2_back_ledger':   return backLine(host, 'ledger');
      case 'ch2_back_oldbox':   return backLine(host, 'oldbox');
      case 'ch2_back_visitors': return backLine(host, 'visitors');
      case 'ch2_back_letter':   return backLine(host, 'letter');
      case 'ch2_back_abacus':   return backLine(host, 'abacus');
      default: return false;
    }
  }
  /* 2026-10-17 用户点单：**里间那道门删了** —— 进二章这条路只剩主界面（第一章/第二章那两本册子）。
     所以这道闸口的原话（"门不认你"）跟着门一起没了，但**闸本身照旧**：
     未通关 / 未开 DEV 免通 ⇒ 拦在门外，一句话都不多说（按钮那边本来就是灰的）。
     闸还是那两句口径（`cleared() || adminEntry()`），一个字没改。 */
  function enterVault(host) {
    if (!cleared(host.S) && !adminEntry(host.S)) {
      host.say([
        '（这边进不去。要进第二章，回主界面选「第二章」那本册子。）',
        '（得先把岛上那一夜走完 —— 一个人是不是掌柜，不是自己说了算的。）'
      ], null, { title: '记忆库' });
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
  /* 2026-10-17 用户第 4 遍：「我要的就是这两张彻底隔开，不要有出去和进来的方法。」
     ---- 库房那个出口（ch2_vault_exit）现在回**主界面**，不落一章当铺那张图 ----
     为什么不能再用 `to:'pawnshop'`：那是"从库房走出去直接进第一章那张图、接着就能玩第一章"
     —— 用户指着这一条说了四遍。切章只走主界面那条老规矩（v46 定的），
     所以出口只负责"把人从库房里带出来"，带回到主界面那两本册子前面，由玩家自己挑。
     **引擎零改动**：点的是顶栏那颗本来就有的「主界面」按钮（game23.js:4507 → showHome()）——
     等于替玩家点了一下他自己能点的按钮。
     ⚠️ 顺序要紧：`say()` 里那段话点完之后才轮到回调（game23.js:499-501：行数走完 → closeModal
     → done()）；showHome() 有闸（game23.js:4039：`if (modalOpen)` 就拒绝并 toast）——
     先说完再点，不然菜单会被那道闸挡下来、玩家还以为按钮坏了。 */
  function leave(host) {
    host.say(T('backOut').slice(), function () {
      var doc = global.document || null;
      var btn = doc && doc.getElementById ? doc.getElementById('btn-home') : null;
      if (btn && btn.click) { btn.click(); return; }
      var G = global.GAME23;
      if (G && typeof G.showHome === 'function') G.showHome();
    }, { title: '外间' });
    return true;
  }
  /* ---------- S3 账房（`ch2_back`）：每个点位点下去各有一句"经手"的话 ----------
     引擎的顺序是 say（点位自己的那两句）→ 这里（第二句）⇒ 不抢第一句、也不吞它。
     每句都带一个「这账房里的活」的口径词（赎价 / 担保 / 旧票 / 访客 / 回函 …），
     判据 `tools/verify-ch2back.mjs` 的 B4-c 真按一遍，认的就是"屏上真出过字"。 */
  var BACK_SAY = {
    keeper:   '「算不平的账，摆在桌上就是。」他把毛笔递过来，笔杆上有一圈旧漆。',
    redeem:   '赎价那本翻到逾期那三件：先还谁，明天得给柜台一个数。',
    chain:    '担保那串木牌挨个看过去：这一环扣着谁，得顺着麻线摸到底。',
    desk:     '把油灯往中间挪了挪 —— 夜里算账就靠这一盏。',
    ledger:   '对账簿翻到第十七任那半本：缺的那页撕口还是新的。',
    oldbox:   '旧票箱抽出一捆，绳子上还留着上一任的手劲。',
    visitors: '访客簿从后往前翻：同一个姓，最近三页都来过。',
    letter:   '把回函的抬头写全：收货人不得留货 —— 这行字最上头，比别的都大一号。',
    abacus:   '珠子拨了一下，停住。这一笔数还没平。'
  };
  function backLine(host, key) {
    var line = BACK_SAY[key];
    if (!line) return false;
    host.say([line], null, { title: '账房 · 里间' });
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
  /* 这一面原来是「旧账本 · 损失清单」（列你献出去的那几段记）—— 献忆整套退役之后它没东西可列，
     连带那段"读一章记表"的代码也一起删了（二章不读一章的记）。 */

  /* ---------- 库房里货存进去了没有（雾那道门的门控，二章自己的状态） ---------- */
  function hasStored(s) {
    var raw = String((s && s.flags && s.flags.ch2_vault) || '');
    /* 行格式 slot:date:batch:weight:owner:ta①1 —— 只有 occupied=1 的行算"上过货" */
    return raw.split('|').some(function (p) { return p.split(':')[5] === '11'; });
  }

  /* ---------- 后门夜路（复用镇子地图的挂点，只给线索，不做门） ---------- */
  function alley(host) {
    var X = T('alley');
    if (flag(host.S, 'ch2_alley_seen')) { host.say(X.again.slice(), null, { title: X.title }); return true; }
    host.markFlag('ch2_alley_seen');
    host.say(X.lead.concat(X.end), null, { title: X.title });
    return true;
  }

  /* ---------- 码头雾里：二章结局 ----------
     2026-10-17：原来这里要"喂一段最轻的记"（候选表由一章记表现算）—— 那正是用户拍死的耦合
     （两个游戏、两个人、二章不许读写一章的记）。改成**二章自己的门槛**：
     库里真上过货（ch2_vault 里有 occupied 的行）雾才让路。
     文案与结局行读 CH2_TEXT（`fog` / `ending`），一个字没重写。 */
  function fog(host) {
    var X = T('fog');
    if (!hasStored(host.S)) {
      host.say(['（脚印到这儿就断了。雾里头有东西在等你把库里的事办完。）',
                '（库房还空着 —— 先收一段记、存进罐里。）'], null, { title: X.title });
      return true;
    }
    if (!flag(host.S, 'ch2_fog_ok')) {
      host.markFlag('ch2_fog_ok');
      host.dirty(); host.save();
      /* 让路那两句读 CH2_TEXT.fog.end（text.js 里本来写给这一刻的，别在代码里另造一句） */
      var give = (T('fog').end || []).slice();
      host.say(give.length ? give : ['（雾让开半步。）'], null, { title: X.title });
      return true;
    }
    if (!flag(host.S, 'ch2_end')) {
      host.markFlag('ch2_end');
      host.dirty(); host.save();
      host.say(T('ending').lines.slice(), null, { title: T('ending').title });
      return true;
    }
    host.say(X.again.slice(), null, { title: X.title });
    return true;
  }

  /* ============================================================
     §六 二章自己的幕表与待办（**只读 js/ch2 这一份**）
     ------------------------------------------------------------
     用户：「而且这个任务他还是按第一章看的。」⇒ 二章的任务页不许再吃一章的 TASKS / S.act。
     这里三幕、五个条目，判据条件全落在 `ch2_` 前缀的旗标上（二章自己的档里），
     一章的 62 条任务、第 6 幕、相簿 4/4 一个都不出现。 */
  var ACTS = [
    { n: 1, name: '收货', goal: '在柜台开一秤，收一段记下来' },
    { n: 2, name: '上架', goal: '走到某只罐前按 E，把身上那段记存进去' },
    { n: 3, name: '出货', goal: '按格号把记取出来，交割给客人' }
  ];
  function jarUsed(s) {
    var raw = String((s && s.flags && s.flags.ch2_vault) || '');
    var n = 0;
    raw.split('|').forEach(function (p) { if (p && p.split(':')[5] === '11') n++; });
    return n;
  }
  function pendingN(s) {
    var raw = String((s && s.flags && s.flags.ch2_pending) || '');
    return raw.split(',').filter(function (x) { return x !== ''; }).length;
  }
  function carryN(s) {
    var raw = String((s && s.flags && s.flags.ch2_carry) || '');
    return raw.split(',').filter(function (x) { return x !== ''; }).length;
  }
  function actOf(s) {
    if (jarUsed(s) > 0) return 3;
    if (pendingN(s) > 0 || carryN(s) > 0) return 2;
    return 1;
  }
  function tasks(s) {
    s = s || state0();
    var f = (s && s.flags) || {}, used = jarUsed(s);
    var list = [
      { name: '进库房（主界面选「第二章」那本册子）', done: !!f.ch2_entered, hint: '顶栏 ▤ 主界面' },
      { name: '收下柜上留下的三样', done: !!f.ch2_shelf_taken, hint: '库房角上 (6,11) 按 E' },
      { name: '在柜台上收一段记', done: pendingN(s) + carryN(s) + used > 0, hint: '柜台 · 开秤 (10,5)' },
      { name: '把记存进罐子（站到罐前按 E）', done: used > 0, hint: '库房 A–Z 二十六格' },
      { name: '让十三只罐都上过货', done: used >= 13, hint: '在册 ' + used + '/26' }
    ];
    var act = actOf(s), A = ACTS[act - 1];
    return { act: act, actName: A.name, goal: A.goal, list: list, used: used };
  }
  function state0() {
    return (global.PAWN_DEBUG && global.PAWN_DEBUG.api ? global.PAWN_DEBUG.api.state : null);
  }
  /* 顶栏那三样（章 / 幕 / 账房状态）—— 一章的字段一个都不带出来 */
  function hud(s) {
    s = s || state0();
    var t = tasks(s), V = (global.CH2_VAULT || {});
    var sceneName = '';
    try { sceneName = (s && s.scene && D().SCENES[s.scene]) ? D().SCENES[s.scene].name : ''; } catch (e) { sceneName = ''; }
    return {
      ch: T('title') || '第二章',
      scene: sceneName || '记忆库',
      act: t.act, actName: t.actName, goal: t.goal,
      used: t.used, total: (V.COUNT || 26), pending: pendingN(s), carry: carryN(s)
    };
  }
  /* 右栏「记」这一页在二章里写什么：**只有格号和序号，没有名字**（口径 A 的那条地基）。
     一章那 38 段的列表一个字都不搬过来 —— 两个游戏、两个人的账。 */
  function memPage(s) {
    s = s || state0();
    var used = jarUsed(s), carry = carryN(s), pend = pendingN(s);
    var rows = [];
    for (var i = 0; i < 26; i++) rows.push(i);
    var html = '<div class="arc-h">库房 · 在册 ' + used + '/26</div>';
    html += '<div class="arc-item">身上还有 <b>' + carry + '</b> 段，待上架 <b>' + pend + '</b> 段。</div>';
    html += '<div class="arc-item">罐子里的记**不写名字**：格号就是唯一的线索。</div>';
    html += '<div class="arc-h">A–Z</div><div class="arc-item">' +
      rows.map(function (i) { return String.fromCharCode(65 + i); }).join(' ') + '</div>';
    return html;
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
    /* 复用挂点：两个都得在，且带着 back_ok 门控 */
    (global.CH2_SCENES.HOOKS || []).forEach(function (h) {
      var hit = (d.SCENES[h.sid] && d.SCENES[h.sid].places || []).filter(function (p) { return p.id === h.id; })[0];
      if (!hit) { errs.push('复用挂点没挂上：' + h.sid + '.' + h.id); return; }
      if (hit.need !== 'back_ok') errs.push('挂点门控不对：' + h.id);
      if (!hit.ch2) errs.push('挂点没打 ch2 记号：' + h.id);
    });
    /* 道具：每件都得答得出「没有它卡在哪」 */
    (global.CH2_ITEMS.list || []).forEach(function (it) {
      if (!it.stuck) errs.push('道具没写"没有它卡在哪"：' + it.id);
      if (!it.how) errs.push('道具没写效果声明 how：' + it.id);
    });
    if ((global.CH2_ITEMS.list || []).length < 3) errs.push('道具不足三件');
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

  /* ---------- 不软锁：一章真结局仍可达 ----------
     纯函数，吃一章自己的判据 trueEndingReachable()；二章能不能走通由 verify-ch2.mjs 真跑。
     献忆整套退役之后，二章**一个字节都不写一章的记** ⇒ 这条现在是"结构上不可能坏"，
     留着它是为了让下一个人别再把"献一段记"接回一章的 mem 上。 */
  function noSoftLock(state, d) {
    d = d || D();
    var s = state || {};
    var reachable = d.trueEndingReachable(s);
    return {
      ok: !!reachable,
      trueEnding: !!reachable,
      donated: [],
      note: '二章不读写一章的记（memMap 是二章自己的 ch2_mems）⇒ 献忆不存在的这一年，真结局结构上不可能被它影响'
    };
  }

  /* ---------- 给开发者面板的节点表（面板不抄第二份 ch2 数据）----------
     ch2 现在**没有谜题节点**（献忆散点删了）：面板只列三样 —— 取道具 / 进库房 / 26 格。
     verify-ch2 ㉒ 钉住"面板列出的节点数 = ch2 实际节点数"，数量这一头跟着这里走。 */
  var NODE_PLACE = {};
  function devNodes() {
    var out = [];
    Object.keys((global.CH2_PUZ || {}).list || {}).forEach(function (k) {
      var P = global.CH2_PUZ.list[k], where = NODE_PLACE[k] || [];
      if (!where[0]) return;                       /* 没有落点的不进面板（删了的散点就属于这种） */
      out.push({ key: k, puzzle: true, sid: where[0], pid: where[1], name: (T(k).title || k),
        flag: P.flag, item: P.needItem, answer: P.answer });
    });
    out.push({ key: 'shelf', puzzle: false, sid: VAULT, pid: 'ch2_shelf', name: '柜上留下的三样（取道具）', flag: 'ch2_shelf_taken' });
    out.push({ key: 'enter', puzzle: false, sid: VAULT, pid: 'ch2_vaultdoor', name: '进记忆库（主界面选第二章）', flag: 'ch2_entered' });
    return out;
  }

  global.CH2 = {
    VAULT: VAULT, KEY2: KEY2, install: install, report: function () { return installed; },
    open: open, cleared: cleared, adminEntry: adminEntry, validate: validate, noSoftLock: noSoftLock,
    devNodes: devNodes,
    /* §〇 两套档隔离：引擎只在 save/load 两处调这两个 */
    persist: persist, hydrate: hydrate, ch2Flags: ch2Flags, inCh2: inCh2,
    /* §六 二章自己的幕表（右栏「任务」页 + 顶栏用它） */
    ACTS: ACTS, tasks: tasks, hud: hud, memPage: memPage, jarUsed: jarUsed,
    state: function (s) {
      s = s || state0();
      var f = (s && s.flags) || {};
      return {
        entered: !!f.ch2_entered,
        admin: adminEntry(s),
        items: ['wax', 'slip', 'scale', 'ledger'].filter(function (i) { return !!f['ch2_it_' + i]; }),
        fog: !!f.ch2_fog_ok, end: !!f.ch2_end,
        used: jarUsed(s), act: actOf(s)
      };
    }
  };
  /* 当前这一帧是不是站在二章里（scene id 带 ch2_ 前缀就是二章那张图） */
  function inCh2(s) {
    s = s || state0();
    return /^ch2_/.test(String((s && s.scene) || ''));
  }
})(typeof window !== 'undefined' ? window : globalThis);
