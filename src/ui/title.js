// 標題畫面背景：幾隻棋子在泳池裡互相彈撞（壓扁回彈＋水波），只在標題畫面顯示時跑，離開就停
(function (g) {
  const FA = g.FA, D = FA && FA.DATA, SP = FA && FA.sprites;
  const el = document.getElementById('titleFx'), title = document.getElementById('title');
  if (!el || !SP || !D) return;
  const ctx = el.getContext('2d'), TAU = Math.PI * 2;
  let W = 0, H = 0, dpr = 1, on = false, last = 0, bodies = [], waves = [], bands = [], frames = 0;
  const pool = Object.keys(D.units).filter(id => !D.units[id].noShop);
  function resize() { dpr = Math.min(2, devicePixelRatio || 1); W = el.clientWidth || innerWidth; H = el.clientHeight || innerHeight; if (el.width !== Math.round(W * dpr) || el.height !== Math.round(H * dpr)) { el.width = Math.round(W * dpr); el.height = Math.round(H * dpr); } ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 棋子只在 Logo 上方、說明文字下方的空白「泳池」裡彈，不擋按鈕與文字
    const kids = [...title.children].filter(e => e !== el && e.offsetParent), top = Math.min(...kids.map(e => e.getBoundingClientRect().top)), bot = Math.max(...kids.map(e => e.getBoundingClientRect().bottom));
    bands = [[6, top - 4], [bot + 4, H - 6]].filter(b => b[1] - b[0] > 80);
    bodies.forEach(o => fit(o)); }
  function fit(o) { if (!bands.length) { o.band = [0, H]; return; } if (!o.band || !bands.some(b => b[0] === o.band[0])) o.band = bands[o.i % bands.length]; o.r = Math.max(8, Math.min(o.r0, (o.band[1] - o.band[0]) / 2.9)); o.y = Math.max(o.band[0] + o.r * 1.7, Math.min(o.band[1] - o.r * 1.15, o.y)); o.x = Math.max(o.r, Math.min(W - o.r, o.x)); }
  function spawn() {
    bodies = []; const ids = pool.slice().sort(() => Math.random() - 0.5).slice(0, 6);
    ids.forEach((id, i) => { const U = D.units[id], a = Math.random() * TAU, s = 70 + Math.random() * 70;
      const o = { id, i, color: U.color, star: 1 + (i % 3 === 0 ? 1 : 0) + (i === 5 ? 1 : 0), team: i % 3 === 2 ? 1 : 0, hp: 1, maxHp: 1, r0: 22 + (U.r - 17) * 0.5, r: 0,
        x: 40 + Math.random() * (W - 80), y: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s, q: 0, qv: 0, ang: 0 }; o.r = o.r0; fit(o); o.y = o.band[0] + Math.random() * (o.band[1] - o.band[0]); fit(o); bodies.push(o); });
  }
  const hit = (o, nx, ny, s) => { o.ang = Math.atan2(ny, nx); o.q = Math.min(0.3, Math.max(o.q, s / 700)); o.qv = 0; };
  function step(dt) {
    for (const o of bodies) {
      o.x += o.vx * dt; o.y += o.vy * dt;
      if (o.x < o.r && o.vx < 0) { hit(o, 1, 0, -o.vx); o.vx = -o.vx; } if (o.x > W - o.r && o.vx > 0) { hit(o, -1, 0, o.vx); o.vx = -o.vx; }
      if (o.y < o.band[0] + o.r * 1.7 && o.vy < 0) { hit(o, 0, 1, -o.vy); o.vy = -o.vy; } if (o.y > o.band[1] - o.r * 1.15 && o.vy > 0) { hit(o, 0, -1, o.vy); o.vy = -o.vy; }
      const w = 22; o.qv += (-w * w * o.q - 2 * 0.3 * w * o.qv) * dt; o.q += o.qv * dt;
    }
    for (let a = 0; a < bodies.length; a++) for (let b = a + 1; b < bodies.length; b++) {
      const A = bodies[a], B = bodies[b]; if (A.band !== B.band) continue; const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy), m = A.r + B.r;
      if (d > 0 && d < m) { const nx = dx / d, ny = dy / d, rv = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
        A.x -= nx * (m - d) / 2; A.y -= ny * (m - d) / 2; B.x += nx * (m - d) / 2; B.y += ny * (m - d) / 2;
        if (rv < 0) { A.vx += rv * nx; A.vy += rv * ny; B.vx -= rv * nx; B.vy -= rv * ny; hit(A, -nx, -ny, -rv); hit(B, nx, ny, -rv); if (waves.length < 10) waves.push({ x: A.x + nx * A.r, y: A.y + ny * A.r, t: 0 }); } }
    }
    waves.forEach(w => w.t += dt); waves = waves.filter(w => w.t < 0.9);
  }
  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 2; waves.forEach(w => { const k = w.t / 0.9; ctx.strokeStyle = `rgba(190,240,255,${0.5 * (1 - k)})`; ctx.beginPath(); ctx.ellipse(w.x, w.y, 10 + k * 50, (10 + k * 50) * 0.55, 0, 0, TAU); ctx.stroke(); });
    for (const o of bodies) { // 地面投影
      ctx.fillStyle = 'rgba(2,8,20,0.35)'; ctx.beginPath(); ctx.ellipse(o.x + o.r * 0.18, o.y + o.r * 0.8, o.r * (1 + Math.max(0, o.q) * 0.4), o.r * 0.34, 0, 0, TAU); ctx.fill();
    }
    for (const o of bodies) {
      ctx.save(); ctx.translate(o.x, o.y); if (Math.abs(o.q) > 0.004) { ctx.rotate(o.ang); ctx.scale(1 - o.q, 1 + o.q * 0.65); ctx.rotate(-o.ang); }
      SP.draw(ctx, o, 0, 0, o.r, t); ctx.restore();
    }
  }
  function loop(now) {
    if (!on) return;
    if (title.classList.contains('hidden')) { on = false; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (++frames % 60 === 0) resize(); // 版面可能晚一點才變（例如連線按鈕插入）
    step(dt); draw(now / 1000); requestAnimationFrame(loop);
  }
  function start() { if (on || title.classList.contains('hidden')) return; on = true; resize(); if (!bodies.length) spawn(); last = performance.now(); requestAnimationFrame(loop); }
  new MutationObserver(start).observe(title, { attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', () => { if (on) resize(); });
  start();
})(globalThis);
