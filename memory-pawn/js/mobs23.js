/* 记忆当铺 - mobs23.js：雾里的东西（一个场景一只 · 低移速 · 远程 · 不打血只咬记忆）
 *
 * 三条规矩（照用户原话定的）：
 *   ① 低移速、远程 —— 追得上人，但追不死人；保持距离吐东西，贴近了反而退；
 *   ② 被摸到不掉血，掉记忆 —— 撞上或吃到弹丸都算一次"咬"，咬完就退回雾里消失；
 *   ③ 一个场景只留一只 —— 多了不是难，是恶心。
 * 名字：**雾呓** —— 雾里那声含糊的梦话；只此一种，别的不刷。
 * 反制：**灯油**（oil）—— 泼一罐，圈里的东西被定住十几秒，圈外的不敢进；再加上"怕灯"，
 *       所以灯下与油圈是两处安全区。名字与长相都换成海雾/记当铺这一路的东西。
 *
 * 坐标一律用"格"（和引擎的 S.mx/S.my 同一套），像素换算在 draw 里做。
 */
(function (global) {
  'use strict';

  /* 只留一种 —— 雾里就只有这一样东西（用户：名字够好听、长相够好看、一种就够） */
  var KINDS = {
    wuyi: {
      id: 'wuyi', name: '雾呓', desc: '雾里那声含糊的梦话。它张一次嘴，你身上就少一个字',
      col: '#8f7fb8', col2: '#efe8ff', r: 16, speed: 1.05, keep: 4.4, cd: 3.6,
      shot: { col: '#d9cffb', r: 4.6, speed: 2.6, mk: 'glyph' }
    }
  };

  /* 一个场景一只：第几幕开始出现、落在哪一格、是哪一种 */
  var SPAWN = {
    town:       { act: 2, spots: [[5, 9]] },
    pawnshop:   { act: 2, spots: [[4, 6]] },
    saltflats:  { act: 3, spots: [[9, 6]] },
    lighthouse: { act: 3, spots: [[13, 12]] },
    archive:    { act: 4, spots: [[9, 11]] },
    mist:       { act: 5, spots: [[8, 3]] }
  };

  var AWAKE = 8.5;          /* 多远开始盯上你 */
  var LIGHT_KEEP = 1.7;     /* 灯圈半径（格）：不进去，也不在灯圈里吐 */
  var FLEE_T = 2.6;         /* 咬完往雾里退多久就消失 */
  var TOUCH_D = 0.72;       /* 贴身算"被摸到" */
  var SHOT_D = 0.55;        /* 弹丸命中半径 */
  var OIL_HOLD = 15;        /* 一罐灯油定住多少秒（用户要"十几秒无法攻击"） */

  var list = [], shots = [], lights = [], zones = [], hook = null, sid = null, seq = 0;

  function attach(h) { var old = hook; hook = h; return old; }   /* 返回上一个：测试用完还回去 */
  function setLights(ts) { lights = ts || []; }
  function lightNear(x, y) {
    for (var i = 0; i < lights.length; i++) {
      var dx = lights[i][0] - x, dy = lights[i][1] - y;
      if (dx * dx + dy * dy < LIGHT_KEEP * LIGHT_KEEP) return true;
    }
    return false;
  }
  function zoneAt(x, y) {
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i], dx = z.x - x, dy = z.y - y;
      if (dx * dx + dy * dy < z.r * z.r) return z;
    }
    return null;
  }
  function solidAt(x, y) {
    if (!hook || !hook.solid) return false;
    return !!hook.solid(Math.round(x), Math.round(y));
  }
  function blocked(x, y) { return solidAt(x, y) || lightNear(x, y) || !!zoneAt(x, y); }

  /* 按场景铺怪（一个场景一只）；重进场景会重置 —— 残血不累积，免得越玩越没法玩 */
  function spawnFor(sceneId, act) {
    sid = sceneId; list = []; shots = [];
    var cfg = SPAWN[sceneId];
    if (!cfg || (act || 1) < cfg.act) return 0;
    cfg.spots.forEach(function (s, i) {
      var k = KINDS.wuyi;
      list.push({
        uid: ++seq, kind: k.id, x: s[0], y: s[1],
        state: 'idle', cool: 1.2 + i * 0.5, fled: 0, hold: 0, t: i * 1.7, face: 1
      });
    });
    return list.length;
  }

  /* 泼灯油：圈里的当场定住，圈外的先不敢进（圈还在的时候进来的，一样被定住） */
  function oil(x, y, r, t) {
    var life = t || OIL_HOLD;
    zones.push({ x: x, y: y, r: r || 5.4, t: life, life: life });
    var n = 0;
    list.forEach(function (m) {
      var dx = m.x - x, dy = m.y - y;
      if (dx * dx + dy * dy < (r || 5.4) * (r || 5.4) && m.state !== 'flee') { m.hold = Math.max(m.hold, life); n++; }
    });
    return n;
  }
  function heldCount() { var n = 0; for (var i = 0; i < list.length; i++) if (list[i].hold > 0) n++; return n; }

  function step(m, dx, dy, sp, dt) {   /* 先横后竖地蹭着走，撞墙不至于原地抖 */
    var nx = m.x + dx * sp * dt, ny = m.y + dy * sp * dt;
    if (!blocked(nx, m.y)) m.x = nx;
    if (!blocked(m.x, ny)) m.y = ny;
    if (Math.abs(dx) > 0.05) m.face = dx > 0 ? 1 : -1;
  }

  function update(dt) {
    var i, j;
    for (j = zones.length - 1; j >= 0; j--) {                    /* 油圈会烧完 */
      zones[j].t -= dt;
      if (zones[j].t <= 0) zones.splice(j, 1);
    }
    if (!hook || !hook.player) return;
    var p = hook.player();
    /* 面板（谜题 / 柜台 / 日志）开着 = 人站住了不动 —— 这时候"灯下安全"不该再白送：
       它们敢踏进灯圈、敢隔着面板咬。看菜单不是暂停键。（灯油那层保护不受影响） */
    var inPanel = !!(hook.panelOpen && hook.panelOpen());
    for (i = list.length - 1; i >= 0; i--) {
      var m = list[i], K = KINDS[m.kind];
      m.t += dt;
      var dx = p.x - m.x, dy = p.y - m.y, d = Math.sqrt(dx * dx + dy * dy) || 0.001;
      var ux = dx / d, uy = dy / d;

      if (m.state === 'flee') {                       /* 咬完就跑：退回雾里，几秒后没了 */
        m.fled += dt;
        if (m.fled >= FLEE_T) { list.splice(i, 1); continue; }
        step(m, -ux, -uy, K.speed * 1.5, dt);
        continue;
      }
      var z = zoneAt(m.x, m.y);
      if (z && m.hold < z.t) m.hold = z.t;            /* 踩进油圈就被钉住 */
      if (m.hold > 0) {                               /* 定住的：不动、不吐、只发亮 */
        m.hold -= dt;
        if (m.hold <= 0) { m.hold = 0; m.cool = Math.max(m.cool, 1.2); }
        continue;
      }
      m.cool -= dt;
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
      if (!inPanel && lightNear(m.x, m.y)) step(m, -ux, -uy, 1.4, dt);   /* 蹭到灯圈：退回暗处（面板开着时它们不退） */

      if (d < TOUCH_D && m.cool <= 0) {                           /* 被摸到 */
        m.cool = 1.2;
        if (hook.hit) hook.hit(K, 'touch', m);
        m.state = 'flee'; m.fled = 0;
        continue;
      }
      /* 灯下与油圈里都不挨打 —— 但你开着面板站在原地时，灯下那层保护撤掉 */
      if (d <= K.keep + 0.6 && m.cool <= 0 && !lightNear(m.x, m.y) && (inPanel || !lightNear(p.x, p.y)) && !zoneAt(p.x, p.y)) {
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
    if (!hook || !hook.player) return null;
    var p = hook.player(), best = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].state !== 'hunt') continue;
      var d = Math.sqrt(Math.pow(p.x - list[i].x, 2) + Math.pow(p.y - list[i].y, 2));
      if (!best || d < best.d) best = { kind: KINDS[list[i].kind], d: d, x: list[i].x, y: list[i].y, held: list[i].hold };
    }
    return best;
  }

  function count() { return list.length; }
  function shotCount() { return shots.length; }
  function clear() { list = []; shots = []; }

  /* ---------- 画 ---------- */
  function wings(ctx, K, m, spread) {
    ctx.fillStyle = 'rgba(168,224,207,.30)';
    for (var s2 = -1; s2 <= 1; s2 += 2) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(s2 * K.r * 1.5, -K.r * 1.3 * spread, s2 * K.r * 1.9, K.r * 0.5);
      ctx.quadraticCurveTo(s2 * K.r * 0.9, K.r * 0.5, 0, K.r * 0.4);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(20,40,36,.55)';
    for (var s3 = -1; s3 <= 1; s3 += 2) {
      ctx.beginPath(); ctx.arc(s3 * K.r * 1.1, -K.r * 0.2, 2.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* 雾呓：一层层褪开的雾影 —— 兜帽里两粒淡光，身上浮着别人丢下的字
     （分层半透明 + 渐变画；浅色盐田和深色雾里都立得住，不用描黑边） */
  /* 雾呓：细高的一件雾袍 —— 兜帽下一对平静的眼，袍里浮着别人丢下的字，下摆散成缕缕雾
     （分层半透明 + 竖向渐变；浅底深底都立得住，不描黑边） */
  /* 雾呓：一件细高的雾袍 —— 兜帽下一对安静的眼，袍里浮着别人丢下的字，
     下摆碎成短短几缕、半身就化掉，头顶一线白气（是雾，不是虫，也不是水母） */
  /* 雾呓：一顶宽檐的雾兜帽 + 一件化掉的斗篷 —— 帽檐下幽着一对平静的眼，
     袍里浮着别人丢下的字，下摆三五缕散开就没了（是雾，不是虫，也不是水母） */
  function body(ctx, x, y, K, m) {
    var held = m.hold > 0, wob = Math.sin(m.t * 3.4) * 1.4, r = K.r;
    var sway = Math.sin(m.t * 0.9) * 1.6, breathe = Math.sin(m.t * 1.6) * 0.4;
    ctx.save();
    ctx.translate(x + (held ? 0 : sway * 0.35), y + (held ? 0 : wob * 0.35));
    if (held) ctx.globalAlpha = 0.85;

    var g = ctx.createLinearGradient ? ctx.createLinearGradient(0, -r * 1.2, 0, r * 1.25) : null;
    if (g && g.addColorStop) {
      g.addColorStop(0, 'rgba(250,247,255,.82)');
      g.addColorStop(0.35, 'rgba(178,162,214,.52)');
      g.addColorStop(0.72, 'rgba(148,131,190,.26)');
      g.addColorStop(1, 'rgba(143,127,184,0)');
    }
    var fill = g || 'rgba(166,148,204,.44)';

    /* ① 斗篷：从肩往下散开 */
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, -r * 0.34);
    ctx.quadraticCurveTo(-r * 0.72, r * 0.3, -r * 0.84, r * 0.92);
    ctx.quadraticCurveTo(-r * 0.42, r * 1.16, 0, r * 1.18);
    ctx.quadraticCurveTo(r * 0.42, r * 1.16, r * 0.84, r * 0.92);
    ctx.quadraticCurveTo(r * 0.72, r * 0.3, r * 0.5, -r * 0.34);
    ctx.closePath(); ctx.fill();

    /* ② 兜帽：宽檐，檐口微微下压 */
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(-r * 0.52, -r * 0.3);
    ctx.quadraticCurveTo(-r * 0.72, -r * 0.72, -r * 0.6, -r * 1.0);
    ctx.quadraticCurveTo(-r * 0.3, -r * 1.34, 0, -r * 1.34);
    ctx.quadraticCurveTo(r * 0.3, -r * 1.34, r * 0.6, -r * 1.0);
    ctx.quadraticCurveTo(r * 0.72, -r * 0.72, r * 0.52, -r * 0.3);
    ctx.quadraticCurveTo(0, -r * 0.16, -r * 0.52, -r * 0.3);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(252,249,255,.34)'; ctx.lineWidth = 1;   /* 檐口一道亮边 */
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, -r * 0.32);
    ctx.quadraticCurveTo(0, -r * 0.18, r * 0.55, -r * 0.32);
    ctx.stroke();

    /* ③ 帽檐下的幽暗 + 一对安静的眼 */
    ctx.fillStyle = 'rgba(50,40,68,.5)';
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.6, r * 0.34, r * 0.3 + breathe * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = held ? 0.45 : 0.2;
    ctx.fillStyle = '#fffaff';
    ctx.beginPath(); ctx.arc(-r * 0.12, -r * 0.6, 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.12, -r * 0.6, 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = held ? 0.85 : 1;
    ctx.fillStyle = 'rgba(255,253,255,.96)';
    ctx.beginPath(); ctx.arc(-r * 0.12, -r * 0.6, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.12, -r * 0.6, 1.4, 0, Math.PI * 2); ctx.fill();

    /* ④ 袍里浮着别人丢下的字（三横，自下往上飘，到顶就淡掉） */
    ctx.strokeStyle = 'rgba(248,244,255,.95)'; ctx.lineWidth = 1.1;
    for (var i = 0; i < 3; i++) {
      var ph = (m.t * 0.3 + i * 0.34) % 1;
      var yy = r * 0.88 - ph * r * 1.6, xx = Math.sin(m.t * 0.8 + i * 2) * r * 0.14 + (i - 1) * r * 0.14;
      ctx.globalAlpha = (held ? 0.5 : 0.9) * (1 - ph) * (0.3 + 0.7 * Math.sin(Math.min(1, ph) * Math.PI));
      ctx.beginPath(); ctx.moveTo(xx - 2.4, yy - 2.1); ctx.lineTo(xx + 2.4, yy - 2.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xx - 1.7, yy); ctx.lineTo(xx + 1.7, yy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xx - 2.1, yy + 2.1); ctx.lineTo(xx + 2.1, yy + 2.1); ctx.stroke();
    }
    ctx.globalAlpha = held ? 0.85 : 1;

    /* ⑤ 层雾：几道很淡的横纹，让袍身有纱的层次 */
    ctx.strokeStyle = 'rgba(242,238,255,.10)'; ctx.lineWidth = 2.4;
    for (var b2 = 0; b2 < 3; b2++) {
      var by = r * (0.16 + b2 * 0.34);
      ctx.beginPath();
      ctx.moveTo(-r * (0.66 - b2 * 0.1), by);
      ctx.quadraticCurveTo(0, by + 2.6, r * (0.66 - b2 * 0.1), by);
      ctx.stroke();
    }

    /* ⑥ 下摆：五六缕长短不一的碎边，半身就化掉 */
    var hem = [-0.78, -0.42, -0.1, 0.26, 0.62, 0.9];
    for (var w2 = 0; w2 < hem.length; w2++) {
      var t0 = hem[w2], sd = Math.sin(m.t * 1.2 + w2 * 1.7) * 2;
      var len = r * (0.18 + 0.3 * ((w2 * 37) % 7) / 7);
      ctx.strokeStyle = 'rgba(216,206,242,' + (0.3 - Math.abs(t0) * 0.12).toFixed(2) + ')';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(t0 * r * 0.8, r * (0.98 - Math.abs(t0) * 0.08));
      ctx.quadraticCurveTo(t0 * r * 0.86 + sd, r * 1.05 + len * 0.7, t0 * r * 0.78 + sd * 1.4, r * 1.05 + len);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawZone(ctx, z, CELL) {
    var cx = z.x * CELL + CELL / 2, cy = z.y * CELL + CELL / 2, r = z.r * CELL;
    var k = Math.min(1, z.t / Math.max(0.001, z.life));
    var age = z.life - z.t;
    ctx.save();
    if (ctx.createRadialGradient) {
      var g = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
      g.addColorStop(0, 'rgba(240,196,106,.34)');
      g.addColorStop(0.55, 'rgba(210,150,60,.18)');
      g.addColorStop(1, 'rgba(120,90,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(240,196,106,' + (0.30 + 0.35 * k).toFixed(2) + ')';
    ctx.lineWidth = 2;
    if (ctx.setLineDash) ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(cx, cy, r * (0.94 + 0.03 * Math.sin(age * 3)), 0, Math.PI * 2); ctx.stroke();
    if (ctx.setLineDash) ctx.setLineDash([]);
    for (var d2 = 0; d2 < 5; d2++) {                 /* 泼在地上的几滴油在跳 */
      var a2 = d2 * 1.27 + age * 0.6, rr = r * (0.35 + 0.18 * d2);
      ctx.fillStyle = 'rgba(255,226,150,.55)';
      ctx.beginPath(); ctx.arc(cx + Math.cos(a2) * rr, cy + Math.sin(a2) * rr * 0.62, 2.1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawShot(ctx, cx, cy, s) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = s.col;
    if (s.mk === 'glyph') {                          /* 它吐出来的是一粒字（三横） */
      ctx.strokeStyle = s.col; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-3.4, -2.6); ctx.lineTo(3.4, -2.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-2.4, 0); ctx.lineTo(2.4, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-3.4, 2.6); ctx.lineTo(3.4, 2.6); ctx.stroke();
    } else if (s.mk === 'shell') {
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
    var i;
    for (i = 0; i < zones.length; i++) drawZone(ctx, zones[i], CELL);
    for (i = 0; i < shots.length; i++) {
      var s = shots[i];
      var sx = s.x * CELL + CELL / 2, sy = s.y * CELL + CELL / 2;
      if (glow) glow(ctx, sx, sy, 12, '190,215,255', 0.16);
      drawShot(ctx, sx, sy, s);
    }
    for (i = 0; i < list.length; i++) {
      var m = list[i], K = KINDS[m.kind];
      var x = m.x * CELL + CELL / 2, y = m.y * CELL + CELL / 2;
      /* 浅色地面上也要看得见：先压一圈"雾影"，再叠一层光晕 */
      if (ctx.createRadialGradient) {
        var hg = ctx.createRadialGradient(x, y, 2, x, y, K.r * 2.4);
        hg.addColorStop(0, 'rgba(12,10,20,.5)');
        hg.addColorStop(0.6, 'rgba(12,10,20,.22)');
        hg.addColorStop(1, 'rgba(12,10,20,0)');
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(x, y, K.r * 2.4, 0, Math.PI * 2); ctx.fill();
      }
      if (glow) glow(ctx, x, y, K.r * 3.2, '162,150,200', m.state === 'hunt' ? 0.30 : 0.20);
      if (hook && hook.shadow) hook.shadow(ctx, x, y + K.r * 0.72, K.r * 0.8, K.r * 0.34);
      ctx.save();
      if (m.face < 0) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
      body(ctx, x, y, K, m);
      ctx.restore();
      if (m.hold > 0) {                              /* 被灯油定住：一圈暖光 + 顶上一点火 */
        ctx.strokeStyle = 'rgba(255,220,140,.85)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, K.r * 1.5, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,236,180,.95)';
        ctx.beginPath();
        ctx.moveTo(x, y - K.r - 12);
        ctx.quadraticCurveTo(x + 4, y - K.r - 6, x, y - K.r - 3);
        ctx.quadraticCurveTo(x - 4, y - K.r - 6, x, y - K.r - 12);
        ctx.fill();
      } else if (m.state === 'hunt') {               /* 盯上你的时候眼睛亮一下 */
        ctx.fillStyle = 'rgba(255,120,120,' + (0.5 + 0.4 * Math.sin(m.t * 6)).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(x, y - K.r - 7, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  global.MOBS23 = {
    KINDS: KINDS, SPAWN: SPAWN, AWAKE: AWAKE, LIGHT_KEEP: LIGHT_KEEP, OIL_HOLD: OIL_HOLD,
    attach: attach, spawnFor: spawnFor, setLights: setLights, update: update,
    oil: oil, zones: function () { return zones; }, heldCount: heldCount,
    draw: draw, threat: threat, count: count, shotCount: shotCount, clear: clear,
    list: function () { return list; }, shots: function () { return shots; },
    scene: function () { return sid; }
  };
  if (typeof module === 'object' && module.exports) module.exports = global.MOBS23;
})(typeof window !== 'undefined' ? window : globalThis);
