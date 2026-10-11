/* 记忆当铺 - music.js：WebAudio 程序化 BGM，每章一首主题曲（无音频文件）
 *   prologue + 正篇 m1~m10 + 隐藏章 m11，八音盒质感（sine 主旋律 + triangle 低音）
 *   无 AudioContext（jsdom 等）时全部 API 静默降级。
 * 引擎：lookahead 调度器（50ms tick / 0.3s 提前排符），LOOP 拍循环，换曲 master 渐隐渐出。 */
(function (global) {
  'use strict';

  var LS_KEY = 'mp-bgm-v1';
  var LOOP_DEF = 32;                 // 默认 8 小节 × 4 拍
  var AHEAD = 0.3;                   // 提前调度秒数
  var TICK_MS = 50;
  var MASTER_V = 0.85;               // master 增益（dip 渐出后回升到同一值）
  var MEL_V = 0.24, BASS_V = 0.17;   // 旋律/低音单音音量
  /* 音量沿革：v18 原值 0.062/0.05 → v18 调大 0.14/0.11（master 0.7）
     → v20 再调大 0.24/0.17（master 0.85）：旋律峰值 0.098 → 0.204（约 +6.4 dB）
     上限依据：mel 最长 2 拍、相邻两音最多重叠 2 个，加低音 1 个 ⇒ 峰值 ≈ 0.85×(0.24×2+0.17) = 0.55 < 1.0，不削波 */

  /* ---------- 音色 ---------- */
  function freq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  var actx = null, master = null, timer = null, seq = null;
  var current = null;                // 想播的 track key（即使被静音也记住）
  var unlocked = false;

  function ctx() {
    if (actx) return actx;
    try {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
      master = actx.createGain();
      master.gain.value = MASTER_V;
      master.connect(actx.destination);
    } catch (e) { actx = null; }
    return actx;
  }

  function enabled() {
    try { return global.localStorage.getItem(LS_KEY) !== '0'; } catch (e) { return true; }
  }
  function setEnabled(v) {
    try { global.localStorage.setItem(LS_KEY, v ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  /* 单音：快 attack + 按 dur 衰减（八音盒包络） */
  function note(midi, when, dur, vol, type) {
    var a = actx;
    if (!a) return;
    try {
      var t0 = a.currentTime + when;
      var o = a.createOscillator();
      var g = a.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq(midi), t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.12, dur));
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + Math.max(0.12, dur) + 0.05);
    } catch (e) { /* ignore */ }
  }

  /* ---------- 曲目库（[beat, midi, durBeats, vol?]；LOOP 拍循环） ---------- */
  var TRACKS = {
    /* 序章 · 雾夜八音盒（A 小，60） */
    prologue: { bpm: 60, loop: 32, mel: [
      [0,69,2],[2,72,1],[3,76,1],[4,74,2],[6,72,2],[8,71,2],[10,64,2],[12,69,4],
      [16,72,2],[18,76,1],[19,81,1],[20,79,2],[22,76,2],[24,74,2],[26,71,2],[28,69,4]
    ], bass: [
      [0,45,4],[4,41,4],[8,40,4],[12,45,4],[16,48,4],[20,43,4],[24,40,4],[28,45,4]
    ] },
    /* 第1章 海与灯芯（C 大，72，微亮叙事） */
    m1: { bpm: 72, loop: 32, mel: [
      [0,76,1],[1,79,1],[2,84,2],[4,83,1],[5,79,1],[6,81,2],[8,79,2],[10,76,2],[12,74,4],
      [16,76,1],[17,79,1],[18,81,2],[20,79,2],[22,76,2],[24,74,2],[26,72,2],[28,74,4]
    ], bass: [
      [0,48,4],[4,43,4],[8,45,4],[12,41,4],[16,48,4],[20,45,4],[24,41,4],[28,43,4]
    ] },
    /* 第2章 忘事房与渔网（D 小，74，行进） */
    m2: { bpm: 74, loop: 32, mel: [
      [0,74,2],[2,77,1],[3,76,1],[4,72,2],[6,74,2],[8,69,4],[12,0,4],
      [16,77,2],[18,79,1],[19,81,1],[20,79,2],[22,77,2],[24,76,2],[26,72,2],[28,74,4]
    ], bass: [
      [0,50,4],[4,50,4],[8,46,4],[12,48,4],[16,41,4],[20,48,4],[24,46,4],[28,45,4]
    ] },
    /* 第3章 守夜与白日（E 小摇篮曲，66） */
    m3: { bpm: 66, loop: 32, mel: [
      [0,76,2],[2,79,2],[4,83,2],[6,81,2],[8,79,4],[12,76,4],
      [16,76,2],[18,79,2],[20,81,2],[22,79,2],[24,78,4],[28,76,4]
    ], bass: [
      [0,52,4],[4,52,4],[8,48,4],[12,47,4],[16,45,4],[20,52,4],[24,48,4],[28,47,4]
    ] },
    /* 第4章 钟楼二层（A 小机械齿轮，80，短音型） */
    m4: { bpm: 80, loop: 32, mel: [
      [0,76,.5],[1,76,.5],[2,72,.5],[3,76,.5],[4,69,2],[6,0,2],
      [8,74,.5],[9,74,.5],[10,71,.5],[11,74,.5],[12,67,2],[14,0,2],
      [16,76,.5],[17,76,.5],[18,72,.5],[19,76,.5],[20,81,2],[22,0,2],
      [24,71,.5],[25,72,.5],[26,74,.5],[27,71,.5],[28,69,4]
    ], bass: [
      [0,45,4],[4,40,4],[8,41,4],[12,43,4],[16,45,4],[20,40,4],[24,41,4],[28,40,4]
    ] },
    /* 第5章 灯匠家谱·催当帖（F 大，72，暖中带忧） */
    m5: { bpm: 72, loop: 32, mel: [
      [0,69,2],[2,72,2],[4,77,2],[6,76,2],[8,74,2],[10,72,2],[12,69,4],
      [16,72,2],[18,74,2],[20,77,2],[22,79,2],[24,81,2],[26,79,2],[28,77,4]
    ], bass: [
      [0,41,4],[4,48,4],[8,50,4],[12,48,4],[16,46,4],[20,41,4],[24,43,4],[28,48,4]
    ] },
    /* 第6章 那一夜（D 小，84，低音藏「三长两短」动机） */
    m6: { bpm: 84, loop: 32, mel: [
      [0,74,2],[2,76,1],[3,77,1],[4,76,2],[6,74,2],[8,73,2],[10,74,2],[12,0,4],
      [16,77,2],[18,79,1],[19,81,1],[20,82,2],[22,81,2],[24,79,2],[26,77,2],[28,76,4]
    ], bass: [
      [0,50,3],[3,50,3],[6,50,3],[9,50,1],[10,50,1],[12,0,4],
      [16,50,3],[19,50,3],[22,50,3],[25,50,1],[26,50,1],[28,45,4]
    ] },
    /* 第7章 老板的真名（B 小，60，低沉） */
    m7: { bpm: 60, loop: 32, mel: [
      [0,78,2],[2,76,2],[4,74,2],[6,73,2],[8,71,4],[12,0,4],
      [16,71,2],[18,73,2],[20,74,2],[22,78,2],[24,76,4],[28,74,2],[30,73,2]
    ], bass: [
      [0,47,4],[4,47,4],[8,43,4],[12,42,4],[16,47,4],[20,43,4],[24,50,4],[28,42,4]
    ] },
    /* 第8章 该还的东西（G 大，76，坚定） */
    m8: { bpm: 76, loop: 32, mel: [
      [0,67,1],[1,71,1],[2,74,2],[4,79,2],[6,74,2],[8,71,2],[10,72,2],[12,74,4],
      [16,74,1],[17,76,1],[18,78,2],[20,79,2],[22,81,2],[24,83,2],[26,81,2],[28,79,4]
    ], bass: [
      [0,43,4],[4,50,4],[8,43,4],[12,48,4],[16,43,4],[20,50,4],[24,52,4],[28,50,4]
    ] },
    /* 第9章 堰上·三句话（E 小，68，空灵高音区） */
    m9: { bpm: 68, loop: 32, mel: [
      [0,83,2],[2,88,2],[4,86,2],[6,83,2],[8,79,4],[12,83,4],
      [16,81,2],[18,79,2],[20,78,2],[22,79,2],[24,76,4],[28,78,2],[30,79,2]
    ], bass: [
      [0,40,4],[4,47,4],[8,48,4],[12,47,4],[16,45,4],[20,52,4],[24,48,4],[28,47,4]
    ] },
    /* 第10章 白天开灯的当铺（C 大，72，明亮收束） */
    m10: { bpm: 72, loop: 32, mel: [
      [0,72,1],[1,76,1],[2,79,2],[4,84,2],[6,83,1],[7,79,1],[8,81,2],[10,79,2],[12,76,4],
      [16,77,2],[18,81,2],[20,79,2],[22,76,2],[24,74,2],[26,77,2],[28,76,2],[30,74,2]
    ], bass: [
      [0,48,4],[4,43,4],[8,41,4],[12,48,4],[16,41,4],[20,48,4],[24,50,4],[28,43,4]
    ] },
    /* 隐藏章 接柜（夜灯温暖，58） */
    m11: { bpm: 58, loop: 32, mel: [
      [0,76,2],[2,74,2],[4,72,2],[6,74,2],[8,76,2],[10,79,2],[12,81,4],
      [16,79,2],[18,76,2],[20,74,2],[22,72,2],[24,74,4],[28,72,4]
    ], bass: [
      [0,48,4],[4,43,4],[8,45,4],[12,41,4],[16,48,4],[20,43,4],[24,41,4],[28,48,4]
    ] },
    /* ===== 加曲（v29）：同一幕里也会换曲，五首主题曲之外再备十首 ===== */
    /* 雾里飘（A 小，56，稀疏空灵） */
    x_fog: { bpm: 56, loop: 32, mel: [
      [0,69,2],[3,72,2],[6,76,3],[10,74,2],[13,72,2],[16,71,3],[20,69,2],[24,64,4],[28,0,4]
    ], bass: [
      [0,45,4],[4,45,4],[8,41,4],[12,43,4],[16,40,4],[20,43,4],[24,45,4],[28,45,4]
    ] },
    /* 雨落堤上（D 小，63） */
    x_rain: { bpm: 63, loop: 32, mel: [
      [0,74,1],[1,77,1],[2,81,2],[5,79,1],[6,77,2],[8,76,2],[10,74,2],[12,72,2],[14,74,2],
      [16,77,3],[20,76,2],[22,74,2],[24,72,3],[28,74,4]
    ], bass: [
      [0,50,4],[4,45,4],[8,46,4],[12,48,4],[16,50,4],[20,45,4],[24,43,4],[28,45,4]
    ] },
    /* 潮涨潮落（G 大，66） */
    x_tide: { bpm: 66, loop: 32, mel: [
      [0,71,2],[2,74,2],[4,79,2],[6,78,2],[8,76,2],[10,74,2],[12,71,4],
      [16,74,2],[18,76,2],[20,79,2],[22,83,2],[24,81,2],[26,79,2],[28,76,4]
    ], bass: [
      [0,43,4],[4,50,4],[8,48,4],[12,43,4],[16,45,4],[20,52,4],[24,50,4],[28,43,4]
    ] },
    /* 摇篮曲（E 小，60） */
    x_lullaby: { bpm: 60, loop: 32, mel: [
      [0,76,3],[3,74,1],[4,72,2],[6,71,2],[8,76,2],[10,79,2],[12,76,4],
      [16,74,2],[18,72,2],[20,71,2],[22,69,2],[24,71,4],[28,72,4]
    ], bass: [
      [0,40,4],[4,47,4],[8,45,4],[12,40,4],[16,43,4],[20,48,4],[24,45,4],[28,40,4]
    ] },
    /* 灯下抄书（F 大，70） */
    x_lamplight: { bpm: 70, loop: 32, mel: [
      [0,77,2],[2,81,2],[4,84,2],[6,81,2],[8,79,2],[10,77,2],[12,79,4],
      [16,76,2],[18,81,2],[20,79,2],[22,77,2],[24,74,2],[26,77,2],[28,76,4]
    ], bass: [
      [0,41,4],[4,48,4],[8,45,4],[12,41,4],[16,46,4],[20,50,4],[24,48,4],[28,41,4]
    ] },
    /* 镇上的午后（C 大，88，轻快） */
    x_market: { bpm: 88, loop: 32, mel: [
      [0,72,1],[1,76,1],[2,79,1],[3,76,1],[4,81,2],[6,79,2],[8,77,1],[9,81,1],[10,79,2],[12,76,4],
      [16,79,1],[17,76,1],[18,81,1],[19,79,1],[20,84,2],[22,81,2],[24,79,2],[26,76,2],[28,72,4]
    ], bass: [
      [0,48,2],[2,55,2],[4,53,2],[6,48,2],[8,45,2],[10,52,2],[12,48,4],
      [16,48,2],[18,55,2],[20,53,2],[22,48,2],[24,43,2],[26,50,2],[28,48,4]
    ] },
    /* 齿轮与钟摆（A 小，84，机械短音型） */
    x_clockwork: { bpm: 84, loop: 32, mel: [
      [0,69,.5],[.5,76,.5],[1,81,.5],[1.5,76,.5],[2,72,.5],[2.5,76,.5],[3,81,.5],[3.5,76,.5],
      [4,74,.5],[4.5,81,.5],[5,77,.5],[5.5,81,.5],[6,74,2],[8,0,2],
      [10,69,.5],[10.5,76,.5],[11,81,.5],[11.5,76,.5],[12,72,4],
      [16,76,.5],[16.5,72,.5],[17,69,.5],[17.5,72,.5],[18,74,.5],[18.5,79,.5],[19,74,.5],[19.5,79,.5],
      [20,76,.5],[20.5,72,.5],[21,69,.5],[21.5,72,.5],[22,71,2],[24,0,2],[26,69,2],[28,69,4]
    ], bass: [
      [0,45,4],[4,40,4],[8,45,4],[12,43,4],[16,45,4],[20,40,4],[24,41,4],[28,45,4]
    ] },
    /* 盐风（D 大，74） */
    x_saltwind: { bpm: 74, loop: 32, mel: [
      [0,74,2],[2,78,2],[4,81,2],[6,78,2],[8,76,2],[10,74,2],[12,78,4],
      [16,81,2],[18,78,2],[20,74,2],[22,76,2],[24,78,2],[26,81,2],[28,74,4]
    ], bass: [
      [0,38,4],[4,45,4],[8,43,4],[12,38,4],[16,45,4],[20,50,4],[24,43,4],[28,38,4]
    ] },
    /* 深水里的名字（B 小，58，低沉） */
    x_deepwater: { bpm: 58, loop: 32, mel: [
      [0,71,2],[2,74,2],[4,78,2],[6,76,2],[8,74,4],[12,71,4],
      [16,73,2],[18,76,2],[20,74,2],[22,71,2],[24,69,4],[28,71,4]
    ], bass: [
      [0,35,4],[4,42,4],[8,47,4],[12,42,4],[16,35,4],[20,42,4],[24,47,4],[28,42,4]
    ] },
    /* 雾散了（C 大，76，明亮） */
    x_morning: { bpm: 76, loop: 32, mel: [
      [0,72,2],[2,76,2],[4,79,2],[6,84,2],[8,81,4],[12,79,4],
      [16,77,2],[18,81,2],[20,79,2],[22,76,2],[24,74,4],[28,72,4]
    ], bass: [
      [0,48,4],[4,55,4],[8,52,4],[12,48,4],[16,53,4],[20,57,4],[24,55,4],[28,48,4]
    ] }
  };

  /* ---------- 调度器 ---------- */
  function schedule() {
    var a = actx;
    if (!a || !seq) return;
    if (rotateAt && nowMs() >= rotateAt) rotate();     /* 到点自己走下一首（5 分钟一轮） */
    var ahead = a.currentTime + AHEAD;
    var bps = seq.bps;
    var voices = [['mel', MEL_V, 'sine'], ['bass', BASS_V, 'triangle']];
    for (var v = 0; v < voices.length; v++) {
      var name = voices[v][0], defV = voices[v][1], wave = voices[v][2];
      var list = seq.track[name];
      if (!list || !list.length) continue;
      var p = seq.ptr[name];
      var guard = 0;
      while (guard++ < 256) {
        var ev = list[p.i];
        var start = seq.t0 + (p.loop * seq.LOOP + ev[0]) / bps;
        if (start >= ahead) break;
        if (ev[1] > 0) {
          var when = Math.max(0, start - a.currentTime);
          note(ev[1], when, ev[2] / bps, ev[3] || defV, wave);
        }
        p.i++;
        if (p.i >= list.length) { p.i = 0; p.loop++; }
      }
    }
  }

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  /* master 渐隐 → 渐出（换曲 / 恢复时的平滑过渡） */
  function dip() {
    var a = actx;
    if (!a || !master) return;
    try {
      var now = a.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0.0001, now + 0.18);
      master.gain.linearRampToValueAtTime(MASTER_V, now + 0.7);
    } catch (e) { /* ignore */ }
  }

  /* ---------- 曲池：同一幕里每 5 分钟换一首 ---------- */
  var ROTATE_MS = 300000;                  /* 5 分钟（用户定的轮换周期） */
  var POOLS = {
    prologue: ['prologue', 'x_fog', 'x_deepwater'],
    m1: ['m1', 'x_tide', 'x_morning'],
    m2: ['m2', 'x_rain', 'x_market'],
    m3: ['m3', 'x_lullaby', 'x_lamplight'],
    m4: ['m4', 'x_clockwork', 'x_saltwind'],
    m5: ['m5', 'x_lamplight', 'x_fog'],
    m6: ['m6', 'x_deepwater', 'x_rain'],
    m7: ['m7', 'x_deepwater', 'x_lullaby'],
    m8: ['m8', 'x_morning', 'x_market'],
    m9: ['m9', 'x_fog', 'x_tide'],
    m10: ['m10', 'x_morning', 'x_saltwind'],
    m11: ['m11', 'x_lamplight', 'x_saltwind']
  };
  var picked = {};        /* base key → 池内第几首 */
  var playingKey = null;  /* 正在响的那一首（可能不是 base） */
  var rotateAt = 0;       /* 下一次轮换的时刻（Date.now 域） */

  function nowMs() { return Date.now(); }
  function pool(key) {
    var p = POOLS[key];
    if (p && p.length) return p;
    return TRACKS[key] ? [key] : [];
  }
  /* 起一首具体的曲子（渐隐渐出交给 dip） */
  function startTrack(key) {
    var a = ctx();
    var t = key ? TRACKS[key] : null;
    if (!a || !t) return false;
    if (a.state === 'suspended') { try { a.resume(); } catch (e) { /* ignore */ } }
    stopTimer();
    dip();
    playingKey = key;
    seq = {
      track: t, bps: t.bpm / 60, LOOP: t.loop || LOOP_DEF,
      t0: a.currentTime + 0.35,
      ptr: { mel: { i: 0, loop: 0 }, bass: { i: 0, loop: 0 } }
    };
    timer = setInterval(schedule, TICK_MS);
    schedule();
    return true;
  }
  /* 池内前进一首；force=true 时不管到没到点（DEV / 测试用） */
  function rotate(force) {
    if (!current) return null;
    var p = pool(current);
    if (p.length < 2) return playingKey;
    var i = ((picked[current] || 0) + 1) % p.length;
    /* 池子只有三首，随机走也可能撞上同一首：再挪一格，保证"换得掉" */
    if (p[i] === playingKey && p.length > 2 && !force) i = (i + 1) % p.length;
    picked[current] = i;
    var key = p[i];
    /* 没声音（jsdom / 还没解锁）也要把账走完 —— 否则 DEV 和测试都验不了轮换 */
    if (!startTrack(key)) playingKey = key;
    rotateAt = nowMs() + ROTATE_MS;
    return key;
  }
  /* 老接口：按 current 池里已选中的那首起播 */
  function start() {
    var p = pool(current);
    if (!p.length) return;
    if (startTrack(p[picked[current] || 0])) rotateAt = nowMs() + ROTATE_MS;
  }

  /* ---------- 对外 API ---------- */
  function play(key) {
    if (key === current) return;
    current = key;
    picked[key] = 0;
    rotateAt = 0;
    playingKey = null;
    if (!key || !TRACKS[key]) { stopTimer(); seq = null; return; }
    if (!enabled() || !unlocked) { stopTimer(); seq = null; return; }
    start();
  }

  function stop() {
    current = null;
    playingKey = null;
    rotateAt = 0;
    stopTimer(); seq = null;
  }

  function toggle() {
    var v = !enabled();
    setEnabled(v);
    if (v && current && unlocked) start();
    else { stopTimer(); seq = null; }
    return v;
  }

  /* 首次交互解锁（浏览器自动播放策略）：解锁后按 current 补播 */
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    var a = ctx();
    if (!a) return;
    if (a.state === 'suspended') { try { a.resume(); } catch (e) { /* ignore */ } }
    if (current && enabled()) start();
  }

  function installUnlock() {
    try {
      var once = function () {
        unlock();
        global.removeEventListener('pointerdown', once, true);
        global.removeEventListener('keydown', once, true);
      };
      global.addEventListener('pointerdown', once, true);
      global.addEventListener('keydown', once, true);
    } catch (e) { /* ignore */ }
  }

  installUnlock();

  global.MUSIC = {
    play: play,
    stop: stop,
    toggle: toggle,
    unlock: unlock,
    enabled: enabled,
    setEnabled: setEnabled,
    current: function () { return current; },
    playing: function () { return playingKey; },
    pool: pool,
    rotate: rotate,
    nextIn: function () { return rotateAt ? Math.max(0, rotateAt - nowMs()) : 0; },
    ROTATE_MS: ROTATE_MS,
    POOLS: POOLS,
    TRACKS: TRACKS
  };
  if (typeof module === 'object' && module.exports) module.exports = global.MUSIC;
})(typeof window !== 'undefined' ? window : globalThis);
