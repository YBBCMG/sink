/* 记忆当铺 · 第二章 —— 「献忆」这整套**已退役**（2026-10-17 用户第 3 遍 + 中枢裁决）。
   ────────────────────────────────────────────────────────────────────────────────
   用户原话（照抄）：
     「这根本没用，全删了吧。这玩意就是这个地图本来就用来放记忆的，你装这堆没用的东西。」
   「这第一章和第二章你可以理解成两个游戏来做，不要让他们有任何关系，这人物也是两个人。」
   中枢裁决：库房是**存记忆**的房间（26 只罐各归各格），地上那些按 E 只弹「提交记忆」的散点全删。

   为什么整套退役、不是只删三个点：
     ① 献忆的候选表是 `D.MEM23` 现算的 —— 那是**一章的记**。二章读一章的记表，正是用户拍死的耦合
        （"两个游戏、两个人、不要有任何关系"）；
     ② 献完还要把 `S.mem[id].state` 改成 'donated' —— **二章写一章的记**，比读更坏；
     ③ 三个散点里两个（三份当票 / 库房的门）就是用户指着截图骂的那堆东西。
   所以：点位删（js/ch2/scenes.js）· 分发删（js/ch2/index.js 的两条 case）· 本模块只留一块墓碑。

   ⚠️ 留这块墓碑而不是删文件：index.html 里还挂着 `js/ch2/puzzles.js?v=4` 这条 script，
      删了文件就是 404（index.html 是美术线地盘，这一轮不动它）。墓碑里把 `CH2_PUZ` 定义成空表 +
      惰性空实现 —— 谁要是还按老名字调它，得到的是 false，不会抛、也不会打开任何面板。

   现在二章的玩法只剩一件（就是用户要的那件）：**26 只罐 A–Z，走到罐前按 E 存/取**。
   在册 / 身上 / 待上架三处状态全在 `ch2_` 前缀的旗标里（二章自己的档 mp23-ch2-v1）。 */
(function (global) {
  'use strict';
  if (global.CH2_PUZ && global.CH2_PUZ.retired) return;
  global.CH2_PUZ = {
    retired: true,
    retiredAt: '2026-10-17',
    why: '献忆整套退役：候选表吃一章的 MEM23、写一章的 S.mem，两部作品零关系的硬口径下不许存在',
    list: {},
    costOf: function () { return { points: [], names: [], written: 0, count: 0 }; },
    costLines: function () { return []; },
    preview: function () { return false; },
    open: function () { return false; },
    gonePath: function () { return false; },
    isLightest: function () { return null; },
    give: function () { return { ok: false, msg: 'retired' }; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
