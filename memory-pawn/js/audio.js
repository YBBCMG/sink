/* 记忆当铺 - audio.js：WebAudio 合成音效，无 AudioContext 时静默降级 */
(function (global) {
  'use strict';

  var actx = null;
  var unlocked = false;

  function ctx() {
    if (actx) return actx;
    try {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    } catch (e) { actx = null; }
    return actx;
  }

  function tone(freq, dur, type, vol, when, slide) {
    var a = ctx();
    if (!a) return;
    try {
      var t0 = a.currentTime + (when || 0);
      var o = a.createOscillator();
      var g = a.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(a.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch (e) { /* 静默降级 */ }
  }

  var SFX = {
    unlock: function () {
      var a = ctx();
      if (!a || unlocked) return;
      try {
        if (a.state === 'suspended' && a.resume) a.resume();
        unlocked = true;
      } catch (e) { /* ignore */ }
    },
    coin: function () { tone(1150, 0.07, 'square', 0.09, 0); tone(1560, 0.09, 'square', 0.08, 0.06); },
    pawn: function () { tone(220, 0.3, 'sine', 0.14, 0, 150); tone(880, 0.1, 'triangle', 0.1, 0.22); },
    redeem: function () { tone(520, 0.12, 'sine', 0.13, 0); tone(780, 0.12, 'sine', 0.13, 0.1); tone(1040, 0.2, 'sine', 0.13, 0.2); },
    lapse: function () { tone(160, 0.5, 'sawtooth', 0.1, 0, 70); },
    door: function () { tone(140, 0.12, 'square', 0.12, 0); tone(90, 0.2, 'square', 0.1, 0.1); },
    bell: function () { tone(660, 0.6, 'triangle', 0.12, 0, 640); },
    open: function () { tone(392, 0.12, 'triangle', 0.12, 0); tone(523, 0.12, 'triangle', 0.12, 0.1); tone(659, 0.12, 'triangle', 0.12, 0.2); tone(784, 0.24, 'triangle', 0.12, 0.3); },
    wrong: function () { tone(180, 0.18, 'square', 0.1, 0); tone(140, 0.22, 'square', 0.1, 0.14); },
    click: function () { tone(1200, 0.04, 'square', 0.05, 0); },
    select: function () { tone(940, 0.05, 'square', 0.06, 0); },
    knockL: function () { tone(300, 0.22, 'triangle', 0.14, 0, 240); },
    knockS: function () { tone(300, 0.08, 'triangle', 0.12, 0, 280); },
    warn: function () { tone(98, 0.3, 'sine', 0.14, 0); tone(98, 0.3, 'sine', 0.14, 0.35); },
    end: function () { tone(523, 0.2, 'triangle', 0.13, 0); tone(659, 0.2, 'triangle', 0.13, 0.18); tone(784, 0.2, 'triangle', 0.13, 0.36); tone(1046, 0.4, 'triangle', 0.13, 0.54); },
    endSad: function () { tone(392, 0.3, 'triangle', 0.13, 0); tone(311, 0.3, 'triangle', 0.13, 0.22); tone(233, 0.5, 'triangle', 0.13, 0.44); },
    blank: function () { tone(90, 0.9, 'sawtooth', 0.09, 0, 40); tone(93, 0.9, 'sawtooth', 0.07, 0.05, 38); }
  };

  global.SFX = SFX;
})(typeof window !== 'undefined' ? window : globalThis);
