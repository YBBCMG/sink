/* 记忆当铺 - mobs23.js：雾里的小怪（低移速 · 远程 · 不打血，只咬记忆）
 *
 * 为什么单开一个文件：引擎只管"有没有被咬到"，咬掉哪段记由引擎的 damageMemory 决定。
 * 三条规矩（照用户原话定的）：
 *   ① 低移速   —— 追得上人，但追不死人；
 *   ② 远程     —— 保持距离吐东西，贴近了反而退（所以站着硬拼没意义）；
 *   ③ 被摸到不掉血，掉记忆 —— 撞上或吃到弹丸都算一次"咬"，咬完就退回雾里消失。
 * 另外补了一条让玩法立得住的：**它们怕灯**（灯圈里不进、不吐），所以灯下是安全区。
 *
 * 坐标一律用"格"（和引擎的 S.mx/S.my 同一套），像素换算在 draw 里做。
 */
(function (global) {
  'use strict';

  var KINDS = {
    suckle: {
      id: 'suckle', name: '雾吮', col: '#8f7fb8', r: 14, speed: 1.05, keep: 4.4, cd: 3.4,
      shot: { col: '#c9b8f0', r: 4.2, speed: 2.6, mk: 'blob' }
    },
    clatter: {
      id: 'clatter', name: '忘潮蟹', col: '#b8a07a', r: 15, speed: 0.85, keep: 5.2, cd: 4.2,
      shot: { col: '#e0d0a8', r: 5.0, speed: 2.2, mk: 'shell' }
    },
    picker: {
      id: 'picker', name: '拾忆虫', col: '#7fb8a8', r: 12, speed: 1.35, keep: 3.6, cd: 2.9,
      shot: { col: '#a8e0cf', r: 3.6, speed: 3.0, mk: 'scale' }
    }
  };

  /* 哪个场景、第几幕开始有、哪几格、什么种类（幕一不刷：先把规矩学会） */
  var SPAWN = {
    town:       { act: 2, spots: [[5, 9, 'picker'], [14, 12, 'suckle']] },
    saltflats:  { act: 3, spots: [[9, 6, 'clatter'], [15, 11, 'picker']] },
    lighthouse: { act: 3, spots: [[3, 10, 'picker'], [13, 12, 'suckle']] },
    pawnshop:   { act: 3, spots: [[4, 6, 'picker']] },
    archive:    { act: 4, spots: [[9, 11, 'suckle']] },
    mist:       { act: 5, spots: [[5, 6, 'suckle'], [15, 10, 'clatter'], [8, 3, 'picker']] }
  };

  var AWAKE = 8.5;        /* 多远开始盯上你 */
  var LIGHT_KEEP = 1.7;   /* 灯圈半径（格）：不进去，也不在里面吐 */
  var FLEE_T = 2.6;       /* 咬完往雾里退多久就消失 */
  var TOUCH_D = 0.72;     /* 贴身算"被摸到"的距离 */
  var SHOT_D = 0.55;      /* 弹丸命中半径 */

  var list = [], shots = [], lights = [], hook = null, sid = null, seq = 0;

  function attach(h) { var old = hook; hook = h; return old; }   /* 返回上一个：测试用完还回去 */
  function setLights(ts) { lights = ts || []; }
  function lightNear(x, y) {
    for (var i = 0; i < lights.length; i++) {
      var dx = lights[i][0] - x, dy = lights[i][1] - y;
      if (dx * dx + dy * dy < LIGHT_KEEP * LIGHT_KEEP) return true;
    }
    return false;
  }
  function solidAt(x, y) {
    if (!hook || !hook.solid) return false;
    return !!hook.solid(Math.round(x), Math.round(y));
  }
  function blocked(x, y) { return solidAt(x, y) || lightNear(x, y); }

  /* 按场景铺怪；同一场景反复进入会重置（残血不累积，免得越玩越没法玩） */
  function spawnFor(sceneId, act) {
    sid = sceneId; list = []; shots = [];
    var cfg = SPAWN[sceneId];
    if (!cfg || (act || 1) < cfg.act) return 0;
    cfg.spots.forEach(function (s, i) {
      var k = KINDS[s[2]] || KINDS.picker;
      list.push({
        uid: ++seq, kind: k.id, x: s[0], y: s[1], hx: s[0], hy: s[1],
        state: 'idle', cool: 0.9 + i * 0.5, fled: 0, t: i * 1.7, face: 1
      });
    });
    return list.length;
  }

  function step(m, dx, dy, sp, dt) {   /* 先横后竖地蹭着走，撞墙不至于原地抖 */
    var nx = m.x + dx * sp * dt, ny = m.y + dy * sp * dt;
    if (!blocked(nx, m.y)) m.x = nx;
    if (!blocked(m.x, ny)) m.y = ny;
    if (Math.abs(dx) > 0.05) m.face = dx > 0 ? 1 : -1;
  }

  function update(dt) {
    if (!hook || !hook.player) return;
    var p = hook.player();
    var i, j;
    for (i = list.length - 1; i >= 0; i--) {
      var m = list[i], K = KINDS[m.kind];
      m.t += dt; m.cool -= dt;
      var dx = p.x - m.x, dy = p.y - m.y, d = Math.sqrt(dx * dx + dy * dy) || 0.001;
      var ux = dx / d, uy = dy / d;

      if (m.state === 'flee') {                       /* 咬完就跑：退回雾里，几秒后没了 */
        m.fled += dt;
        if (m.fled >= FLEE_T) { list.splice(i, 1); continue; }
        step(m, -ux, -uy, K.speed * 1.5, dt);
        continue;
      }
      if (m.state === 'idle') {
        if (d > AWAKE) continue;
        m.state = 'hunt';
        if (hook.wake) hook.wake(K);
        if (hook.roar) hook.roar(m, K);
        continue;
      }
      /* hunt：保持距离的远程 —— 远了走近，近了退开 */
      if (d > K.keep + 0.5) step(m, ux, uy, K.speed, dt);
      else if (d < K.keep - 0.8) step(m, -ux, -uy, K.speed * 0.9, dt);
      if (lightNear(m.x, m.y)) step(m, -ux, -uy, 1.4, dt);      /* 蹭到灯圈：赶紧退回暗处 */

      if (d < TOUCH_D && m.cool <= 0) {                          /* 被摸到 */
        m.cool = 1.2;
        if (hook.hit) hook.hit(K, 'touch', m);
        m.state = 'flee'; m.fled = 0;
        continue;
      }
      /* 灯下是安全区：自己不在灯圈里，也不朝站在灯圈里的人吐 */
      if (d <= K.keep + 0.6 && m.cool <= 0 && !lightNear(m.x, m.y) && !lightNear(p.x, p.y)) {
        m.cool = K.cd;
        shots.push({
          x: m.x, y: m.y, vx: ux * K.shot.speed, vy: uy * K.shot.speed,
          r: K.shot.r, col: K.shot.col, mk: K.shot.mk, life: 4.2, kind: m.kind
        });
        if (hook.spit) hook.spit(m, K);
      }
    }
    for (j = shots.length - 1; j >= 0; j--) {                     /* 弹丸：慢速直线 */
      var s = shots[j];
      s.life -= dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      var sx = p.x - s.x, sy = p.y - s.y;
      if (sx * sx + sy * sy < SHOT_D * SHOT_D) {
        shots.splice(j, 1);
        if (hook.hit) hook.hit(KINDS[s.kind], 'shot', s);
        continue;
      }
      if (s.life <= 0 || solidAt(s.x, s.y)) shots.splice(j, 1);
    }
  }

  /* 最近的一只（引擎拿它做"有东西在靠近"的提示条） */
  function threat() {
    var best = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].state !== 'hunt') continue;
      if (!hook || !hook.player) break;
      var p = hook.player();
      var d = Math.sqrt(Math.pow(p.x - list[i].x, 2) + Math.pow(p.y - list[i].y, 2));
      if (!best || d < best.d) best = { kind: KINDS[list[i].kind], d: d, x: list[i].x, y: list[i].y };
    }
    return best;
  }

  function count() { return list.length; }
  function shotCount() { return shots.length; }
  function clear() { list = []; shots = []; }

  /* ---------- 画 ---------- */
  function body(ctx, x, y, K, m) {
    var wob = Math.sin(m.t * 3.4) * 1.4;
    ctx.save();
    ctx.translate(x, y + wob * 0.4);
    if (ctx.scale) ctx.scale(1.22, 1.22);        /* 雾里的东西也得看得见：整体再放大一档 */
    ctx.fillStyle = 'rgba(150,170,210,.13)';     /* 脚下一团雾，把它从地砖里"托"出来 */
    ctx.beginPath(); ctx.ellipse(0, 5, K.r * 1.5, K.r * 0.95, 0, 0, Math.PI * 2); ctx.fill();
    if (m.kind === 'suckle') {                       /* 雾吮：一团半透明的凝胶 + 三条须 + 一只眼 */
      ctx.fillStyle = 'rgba(143,127,184,.42)';
      ctx.beginPath(); ctx.ellipse(0, 2, K.r, K.r * 0.78, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(200,185,240,.30)';
      ctx.beginPath(); ctx.ellipse(-2, -2, K.r * 0.55, K.r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(120,104,160,.75)'; ctx.lineWidth = 2;
      for (var i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(i * 4, K.r * 0.6);
        ctx.quadraticCurveTo(i * 7 + wob, K.r * 1.5, i * 4 - wob, K.r * 2.1); ctx.stroke();
      }
      ctx.fillStyle = '#f0e6ff'; ctx.beginPath(); ctx.arc(1, 0, 2.1, 0, Math.PI * 2); ctx.fill();
    } else if (m.kind === 'clatter') {               /* 忘潮蟹：壳 + 两只钳 + 背一段记 */
      ctx.fillStyle = K.col;
      ctx.beginPath(); ctx.ellipse(0, 2, K.r * 0.95, K.r * 0.72, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.beginPath(); ctx.ellipse(0, 3.4, K.r * 0.7, K.r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = K.col; ctx.lineWidth = 2.4;
      for (var s2 = -1; s2 <= 1; s2 += 2) {
        ctx.beginPath(); ctx.moveTo(s2 * 5, 4); ctx.lineTo(s2 * 9, 9); ctx.stroke();
        ctx.beginPath(); ctx.arc(s2 * 11, -1, 3.2, -0.6, 1.9); ctx.stroke();
      }
      ctx.fillStyle = '#f4ead2';                    /* 壳上驮着的那点"记" */
      ctx.fillRect(-3, -4, 6, 3);
      ctx.fillStyle = '#3a2f22';
      ctx.beginPath(); ctx.arc(-3, 0, 1.3, 0, Math.PI * 2); ctx.arc(3, 0, 1.3, 0, Math.PI * 2); ctx.fill();
    } else {                                         /* 拾忆虫：小身子 + 六条腿 + 两根触须 */
      ctx.fillStyle = K.col;
      ctx.beginPath(); ctx.ellipse(0, 1, K.r * 0.62, K.r * 0.82, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(40,70,62,.85)'; ctx.lineWidth = 1.6;
      for (var l = 0; l < 3; l++) {
        var ly = -2 + l * 4;
        ctx.beginPath(); ctx.moveTo(-3, ly); ctx.lineTo(-7 - l, ly + 3 + wob); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(3, ly); ctx.lineTo(7 + l, ly + 3 - wob); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(-1, -5); ctx.lineTo(-4, -9); ctx.moveTo(1, -5); ctx.lineTo(4, -9); ctx.stroke();
      ctx.fillStyle = '#eafff6'; ctx.beginPath(); ctx.arc(0, -3.4, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawShot(ctx, cx, cy, s) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = s.col;
    if (s.mk === 'shell') {
      ctx.beginPath(); ctx.ellipse(0, 0, s.r, s.r * 0.72, 0.4, 0, Math.PI * 2); ctx.fill();
    } else if (s.mk === 'scale') {
      ctx.beginPath(); ctx.moveTo(0, -s.r); ctx.lineTo(s.r * 0.9, 0); ctx.lineTo(0, s.r); ctx.lineTo(-s.r * 0.9, 0);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(0, 0, s.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(-s.r * 0.3, -s.r * 0.3, s.r * 0.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function draw(ctx, CELL, glow) {
    for (var j = 0; j < shots.length; j++) {
      var s = shots[j];
      var sx = s.x * CELL + CELL / 2, sy = s.y * CELL + CELL / 2;
      if (glow) glow(ctx, sx, sy, 12, '190,215,255', 0.16);
      drawShot(ctx, sx, sy, s);
    }
    for (var i = 0; i < list.length; i++) {
      var m = list[i], K = KINDS[m.kind];
      var x = m.x * CELL + CELL / 2, y = m.y * CELL + CELL / 2;
      if (glow) glow(ctx, x, y, K.r * 2.6, '180,200,255', m.state === 'hunt' ? 0.20 : 0.12);
      if (hook && hook.shadow) hook.shadow(ctx, x, y + K.r * 0.7, K.r * 0.8, K.r * 0.34);
      ctx.save();
      if (m.face < 0) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
      body(ctx, x, y, K, m);
      ctx.restore();
      if (m.state === 'hunt') {                     /* 盯上你的时候眼睛亮一下 */
        ctx.fillStyle = 'rgba(255,120,120,' + (0.5 + 0.4 * Math.sin(m.t * 6)).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(x, y - K.r - 7, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  global.MOBS23 = {
    KINDS: KINDS, SPAWN: SPAWN, AWAKE: AWAKE, LIGHT_KEEP: LIGHT_KEEP,
    attach: attach, spawnFor: spawnFor, setLights: setLights, update: update,
    draw: draw, threat: threat, count: count, shotCount: shotCount, clear: clear,
    list: function () { return list; }, shots: function () { return shots; },
    scene: function () { return sid; }
  };
  if (typeof module === 'object' && module.exports) module.exports = global.MOBS23;
})(typeof window !== 'undefined' ? window : globalThis);
