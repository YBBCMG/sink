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
      case 'ch2_fog':       return fog(host);
      case 'ch2_backalley': return alley(host);
      /* 2026-10-17 用户第 2 遍（「这两个东西还留着交互，把这两个能交互的功能也关了」）：
         `ch2_shelf`（柜上留下的三样）与 `ch2_vault_exit`（出库房）两条 case **跟着点位一起删了**
         —— 点没了还留着 case，就是"永远走不到的备用分支"，下一个人会以为还漏挂了一个点。
         库房里现在能按 E 的只有 26 只罐（走 js/ch2/vault.js 那条 CH2_OPEN 包装）。 */
      /* 主界面第一本册子那颗「回岛上去」到这里来（game23.js:4101 把 `go !== 'ch2'` 那条路
         喂成 `{ id: 'ch2_back' }`）。**它是合成 id、不是点位**：账房那个场景也叫 `ch2_back`，
         但场景 id 不进这张分发表（场景由引擎的 portal/to 走）。
         这条必须留着：删了它 = 二章里再也回不到一章（主界面上那颗按钮变成死键）。 */
      case 'ch2_back':      return backToCh1(host);
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
  /* 2026-10-17 中枢派单（用户第 2 遍追问「新地图怎么进、在哪进」+ 两句实拍）：
     **从二章回一章**这条唯一的入口 = 主界面第一本册子那颗「回岛上去」（game23.js:3982/4101）。
     ---- 为什么不再"替玩家点一下顶栏主界面按钮" ----
     那条老做法（leave()）只把人带回主界面，人是**没有换场景**的：主界面再渲染一次，
     第一本册子还是「回岛上去」⇒ 玩家点一次、菜单弹回来一次、人还在二章里 —— 原地打转。
     （verify-ch2 ㉜ 的案底：修之前场景一直是 ch2_vault、home 一直开着。）
     现在直接换场景回一章当铺；换场景那一下引擎自己会把二章的外壳摘掉
     （game23.js:215 `applyCh2Chrome(inCh2Scene())`）⇒ 右栏页签与顶栏字段跟着复原。
     ⚠️ 切章只走主界面那条老规矩没破：这条路**只能**由主界面那颗按钮触发
        （`CH2.open({id:'ch2_back'})` 只有 game23.js:4101 一处调用），地图上没有任何门通到这里。 */
  function backToCh1(host) {
    host.enterScene('pawnshop', 10, 11);
    host.dirty(); host.save();
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

  /* ---------- 柜上留下的三样：**已整块退役**（2026-10-17 中枢派单 · 用户第 2 遍）----------
     用户原话：「这两个东西还留着交互，把这两个能交互的功能也关了」＋「这玩意就是这个地图
     本来就用来放记忆的」⇒ 那个点连同这张"取走"面板一起删掉，道具（封蜡/空签/小秤/旧账本）
     随之退役（js/ch2/items.js 现在只剩一块墓碑）：
       · 没有点 = 没有取得渠道，留着"要交道具"的任务就是**取不到却要交**的死账；
       · 献忆那三处（门/票/雾）早就随散点退役了，道具原本只服务它们。
     所以这一段不留代码、不留面板、不留任务、不留 DEV 节点（devNodes 里那条也删了）。
     ⚠️ 别凭"以前这里有四件好东西"把面板加回来：加回来 = 用户第 3 遍骂的那堆东西。

     下面这面是「旧账本 · 损失清单」—— 献忆整套退役之后它没东西可列，
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
     2026-10-17 中枢新单（用户：「那任务呢任务在哪？目前没有主线任务引导啊」）：
     一张表贴到底不算引导 —— 改成**五幕各自一张表**，幕推进时上一幕的条目收起、下一幕的换上来。
     · 每条都得有真判定（`ch2_` 旗标 / 在册格数 / 柜台收没收到），**不许光挂文案永远不打勾**；
     · 幕由"真做到哪一步"推出来（stageOf），不是自己往上数；
     · 一章的 62 条任务、第 6 幕、相簿 4/4 一个字都不出现在这儿。 */
  var ACTS = [
    { n: 1, name: '收货', goal: '到柜台开秤，把门外那位请进来，收下第一段记（开张第一单是阿蕊）' },
    { n: 2, name: '上架', goal: '回库房，把身上那段记存进 A–Z 里的一只罐' },
    { n: 3, name: '取货', goal: '从有货的那一格取一段出来（满格先取，再存新的）' },
    { n: 4, name: '回头客', goal: '阿海背着空渔网又来了 —— 再接一单，把第二段记收进来' },
    { n: 5, name: '立账', goal: '让十三只罐都上过货，这间库房才算立住' }
  ];
  function fnum(s, k) { var v = Number((s && s.flags) ? s.flags[k] : 0); return isFinite(v) ? v : 0; }
  function jarUsed(s) {
    var raw = String((s && s.flags && s.flags.ch2_vault) || '');
    var n = 0;
    /* 第六个字段是两位：`(串味?1:0) + (占格?1:0)`（vault.js:100 encode）——
       **看右位**才是"这一格有没有货"。⚠️ 2026-10-17 逮到的老家贼：这里原先写 `=== '11'`，
       只数得中"带串味"的格子 ⇒ 正常入库的罐子一格都不算，顶栏永远「罐 0/26」。 */
    raw.split('|').forEach(function (p) {
      if (!p) return;
      if ((p.split(':')[5] || '0').charAt(1) === '1') n++;
    });
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
  /* 现在到第几幕：**由真做到哪一步推出来**（单调，不会倒回去） */
  function stageOf(s) {
    var recv = fnum(s, 'ch2_recv_n'), used = jarUsed(s), take = fnum(s, 'ch2_take_n');
    if (recv < 1) return 1;          /* 还没在柜台上收下过东西 */
    /* 2026-10-19：验物 V1 落码之后，"取"不一定留在库里 —— 客人赎走那一段，格就空了。
       所以第二幕的判据改成 used<1 **且** 没取过：取过（含验物赎走）就不再退回第二幕。 */
    if (used < 1 && take < 1) return 2;   /* 收下了，还没上架 */
    if (take < 1) return 3;          /* 上过架，还没取过 */
    if (recv < 2) return 4;          /* 取过了，第二位客人还没接到 */
    return 5;                        /* 立账：把一排 13 格堆起来 */
  }
  /* 五幕各自的条目表：`done(s)` 全落在二章自己的真账上 */
  function specOf(act) {
    if (act === 1) return [
      { name: '进库房（顶栏 ▤ 主界面 → 第二本册子）', hint: '主界面两颗册子，右边那本',
        done: function (s) { return flag(s, 'ch2_entered'); } },
      { name: '到柜台前按 E，把门外的客人让进来', hint: '库房西墙那道门 → 柜台 · 门口（门外收着伞那位是阿蕊）',
        done: function (s) { return flag(s, 'ch2_guest_in'); } },
      { name: '验成色 → 问来路 → 定价，点「收下」', hint: '柜台 · 开秤（有货才有价）',
        done: function (s) { return fnum(s, 'ch2_recv_n') >= 1; } }
    ];
    if (act === 2) return [
      /* 2026-10-19 夜：K1 阿蕊第一单接进柜台（剧情 §15-2）——
         她走的时候那句「断当要人证」是 K1 第二段（查旧票 → 码头找证人）的钩子。
         ⚠️ 挂**第二幕**不挂第一幕：收下她那一刻幕就推进到"上架"，第一幕的条目当场收起，
         挂第一幕等于"勾上了但玩家永远看不到"（按 stageOf 的跳幕点核过）。 */
      { name: '她走时说：等这阵子过了再来办断当（断当要人证）', hint: '柜台上收下她那一单之后 —— 下一段在码头那条路上',
        done: function (s) { return String(((s && s.flags) || {}).ch2_guest_last || '') === 'aurui'; } },
      { name: '收下的记挂在「待上架」——得自己搬去库房', hint: '身上 / 待上架那两笔数在这儿看得见',
        done: function (s) { return pendingN(s) + carryN(s) > 0; } },
      { name: '站到某只空罐前按 E 开罐', hint: '库房 A–Z，一格一只',
        done: function (s) { return flag(s, 'ch2_jar_open'); } },
      { name: '选「第 N 段」存进去，在册 +1', hint: '罐的面板只有序号，不写名字',
        done: function (s) { return jarUsed(s) >= 1; } }
    ];
    if (act === 3) return [
      { name: '点开在册的那一格看一眼（格号 / 封条 / 重量档）', hint: '格号就是唯一的线索',
        done: function (s) { return jarUsed(s) >= 1; } },
      { name: '按 E 把这一段取出来（满格必须先取）', hint: '有货的那只罐',
        done: function (s) { return fnum(s, 'ch2_take_n') >= 1; } },
      { name: '取出来的记回到身上', hint: '身上 +1 段，格空着、号还留着',
        done: function (s) { return carryN(s) >= 1; } },
      /* 2026-10-19 中枢接的剧情单（§15-3 验物 V1 落码）：当票架上客人报三样，你在 A–Z 里认物 */
      { name: '当票架：凭客人报的三样，在 A–Z 里验中一回', hint: '柜台里那排当票架 —— 日名 / 封条色 / 轻重档，对上两样就算验中',
        done: function (s) { return fnum(s, 'ch2_verify_n') >= 1; } }
    ];
    if (act === 4) return [
      { name: '阿海背着空渔网又来了 —— 再接一单', hint: '回柜台 · 门口，再开一次秤（这回是他）',
        done: function (s) { return fnum(s, 'ch2_recv_n') >= 2; } },
      { name: '第二段也上架（在册 2 格）', hint: '库房 · 随便哪只空罐',
        done: function (s) { return jarUsed(s) >= 2; } },
      { name: '让在册上到三格', hint: '在册就是这一章的进度条',
        done: function (s) { return jarUsed(s) >= 3; } }
    ];
    return [
      { name: '在册过六格', hint: '柜台上一直有生意',
        done: function (s) { return jarUsed(s) >= 6; } },
      { name: '一整排（A–M 十三格）都上过货', hint: '库房 A–Z，先挑满第一排 —— 十三格是一只架的容量',
        done: function (s) { return jarUsed(s) >= 13; } },
      { name: '收口：待上架清空、身上清空', hint: '账要平 —— 东西都在格子里',
        done: function (s) { return pendingN(s) === 0 && carryN(s) === 0; } }
    ];
  }
  /* 某一幕的条目（`done` 现算 —— 旗标一变，屏上就跟着打勾） */
  function tasksOf(act, s) {
    s = s || state0();
    return specOf(Number(act) || 1).map(function (x) {
      return { name: x.name, hint: x.hint, done: !!(s && x.done(s)) };
    });
  }
  function tasks(s) {
    s = s || state0();
    var act = stageOf(s), A = ACTS[act - 1], list = tasksOf(act, s);
    var todo = list.filter(function (x) { return !x.done; });
    var now = todo.length ? todo[0].name
      : (act < ACTS.length ? '这一幕做完了 —— 下一步：' + ACTS[act].name : '这一章到头了');
    return {
      act: act, actName: A.name, goal: A.goal,
      list: list, now: now,
      done: list.length - todo.length, total: list.length,
      used: jarUsed(s), pending: pendingN(s), carry: carryN(s)
    };
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
      next: t.now,
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
    /* 道具：**已整块退役**（2026-10-17 用户第 2 遍：取道具那张面板跟着点位一起删了）。
       这里原来钉"每件都得答得出没有它卡在哪 + 至少三件" —— 那套验收口径随道具一起作废：
       现在二章没有道具，CH2_ITEMS.list 必须是空的（`verify-ch2` ④ 钉死这一点）。
       留一句在这儿，免得下一个人以为"检查漏写了"。 */
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
     ch2 现在**没有谜题节点、也没有取道具的节点**（献忆散点与柜上三样都删了）：
     面板只列一条 —— 进库房。`ch2_vaultdoor` 是合成 id（主界面那本册子用的那个），不是点位。
     verify-ch2 钉住"面板列出的节点数 = ch2 实际节点数"，数量这一头跟着这里走。 */
  var NODE_PLACE = {};
  function devNodes() {
    var out = [];
    Object.keys((global.CH2_PUZ || {}).list || {}).forEach(function (k) {
      var P = global.CH2_PUZ.list[k], where = NODE_PLACE[k] || [];
      if (!where[0]) return;                       /* 没有落点的不进面板（删了的散点就属于这种） */
      out.push({ key: k, puzzle: true, sid: where[0], pid: where[1], name: (T(k).title || k),
        flag: P.flag, item: P.needItem, answer: P.answer });
    });
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
    ACTS: ACTS, tasks: tasks, tasksOf: tasksOf, stageOf: stageOf, hud: hud, memPage: memPage, jarUsed: jarUsed,
    state: function (s) {
      s = s || state0();
      var f = (s && s.flags) || {};
      return {
        entered: !!f.ch2_entered,
        admin: adminEntry(s),
        /* 道具已退役（2026-10-17）：字段留着但是恒空 —— 老调用方读它不会炸，
           值也不再变（DEV 面板那个"给全套道具"的按钮写进去的 ch2_it_* 没人认了）。 */
        items: [],
        fog: !!f.ch2_fog_ok, end: !!f.ch2_end,
        used: jarUsed(s), act: stageOf(s), tasks: tasksOf(stageOf(s), s)
      };
    }
  };
  /* 当前这一帧是不是站在二章里（scene id 带 ch2_ 前缀就是二章那张图） */
  function inCh2(s) {
    s = s || state0();
    return /^ch2_/.test(String((s && s.scene) || ''));
  }
})(typeof window !== 'undefined' ? window : globalThis);
