// 戰鬥畫面：Canvas 向量繪製＋爽感回饋（頓幀、震動、粒子、傷害數字、連鎖計數）
(function (g) {
  const FA = g.FA = g.FA || {};
  const V = FA.view = { parts: [], texts: [], rings: [], shake: 0, hitstop: 0, banner: null, chainShow: 0, chainN: 0 };
  let cv, ctx, W, H, dpr, S, CX, CY;

  V.init = c => { cv = c; ctx = c.getContext('2d'); V.resize(); addEventListener('resize', V.resize); };
  V.resize = () => {
    dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = Math.min(W - 16, (H - 150)) / (2 * FA.DATA.config.arenaR + 10); CX = W / 2; CY = H / 2 + 10;
  };
  V.toWorld = (x, y) => ({ x: (x - CX) / S, y: (y - CY) / S });
  V.reset = () => { V.parts = []; V.texts = []; V.rings = []; V.shake = 0; V.hitstop = 0; V.banner = null; V.chainN = 0; };

  const burst = (x, y, col, n, sp) => { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = sp * (0.3 + Math.random()); V.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, col }); } };
  const vib = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { } };

  // 消化戰鬥事件
  V.consume = b => {
    for (const e of b.events) {
      if (e.t === 'dmg') {
        const big = e.amt > 45;
        V.texts.push({ x: e.x + (Math.random() - .5) * 16, y: e.y - 10, txt: Math.round(e.amt), life: 0.9, col: e.kind === 'blast' ? '#ffb347' : e.kind === 'reflect' ? '#9df' : e.kind === 'spike' ? '#f6a' : '#fff', big });
        burst(e.x, e.y, e.team === 0 ? '#7cf' : '#f87', big ? 14 : 7, big ? 260 : 160);
        if (big) { V.hitstop = Math.max(V.hitstop, 0.06); V.shake = Math.max(V.shake, 8); vib(15); }
      } else if (e.t === 'boom') {
        V.rings.push({ x: e.x, y: e.y, r: e.r, life: 0.35, max: 0.35, col: '#ff8a3d' }); burst(e.x, e.y, '#ffb347', 16, 300);
        V.shake = Math.max(V.shake, 10); if (e.n >= 2) { V.chainN = e.n; V.chainShow = 1.2; }
      } else if (e.t === 'pull') V.rings.push({ x: e.x, y: e.y, r: e.r, life: 0.4, max: 0.4, col: '#6b8cff', inward: true });
      else if (e.t === 'death') { burst(e.x, e.y, e.color, 30, 380); V.hitstop = 0.1; V.shake = 14; vib(30); }
      else if (e.t === 'combo') { V.texts.push({ x: e.x, y: e.y - 30, txt: '聯動！' + e.name, life: 1.4, col: '#ffe066', big: true }); V.hitstop = 0.12; V.shake = 12; }
      else if (e.t === 'shieldbreak') V.rings.push({ x: e.x, y: e.y, r: 40, life: 0.3, max: 0.3, col: '#8ef' });
      else if (e.t === 'wall') burst(e.x, e.y, '#ccc', 4, 120);
      else if (e.t === 'bump' && e.s > 300) V.shake = Math.max(V.shake, 4);
      else if (e.t === 'zap') { V.rings.push({ x: e.x, y: e.y, r: 40, life: 0.3, max: 0.3, col: '#ffe066' }); burst(e.x, e.y, '#ffe066', 10, 220); }
      else if (e.t === 'split' || e.t === 'stick' || e.t === 'pierce') V.texts.push({ x: e.x, y: e.y - 20, txt: { split: '分裂！', stick: '黏住！', pierce: '穿透！' }[e.t], life: 0.7, col: '#cff' });
      else if (e.t === 'bossSplit') { V.banner = { txt: '首領分裂了！', life: 1.4 }; V.shake = 16; burst(e.x, e.y, '#c9a', 40, 400); }
      else if (e.t === 'boost') V.texts.push({ x: e.x, y: e.y - 20, txt: '加速！', life: 0.7, col: '#cff' });
      else if (e.t === 'fullpower') { V.texts.push({ x: e.x, y: e.y - 40, txt: '全力！', life: 0.9, col: '#ff5', big: true }); V.shake = Math.max(V.shake, 6); }
      else if (e.t === 'shrink') V.banner = { txt: '場地縮小！', life: 1.2 };
      else if (e.t === 'skip') V.banner = { txt: (e.team === 0 ? '我方' : '敵方') + '全員暈眩，跳過', life: 1.2 };
    }
    b.events = [];
  };

  V.update = dt => {
    V.parts.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .9; p.vy *= .9; p.life -= dt; });
    V.parts = V.parts.filter(p => p.life > 0);
    V.texts.forEach(t => { t.y -= 40 * dt; t.life -= dt; }); V.texts = V.texts.filter(t => t.life > 0);
    V.rings.forEach(r => r.life -= dt); V.rings = V.rings.filter(r => r.life > 0);
    V.shake *= Math.pow(0.02, dt); V.chainShow -= dt;
    if (V.banner) { V.banner.life -= dt; if (V.banner.life <= 0) V.banner = null; }
  };

  // 預測反彈線
  V.path = (b, o, ang, pw) => {
    let px = o.x, py = o.y, dx = Math.cos(ang), dy = Math.sin(ang), left = 250 + 700 * pw;
    const pts = [[px, py]], R = b.R - o.r;
    for (let k = 0; k <= o.bounces && left > 0; k++) {
      // 牆
      const bb = px * dx + py * dy, cc = px * px + py * py - R * R, tw = -bb + Math.sqrt(Math.max(0, bb * bb - cc));
      let tb = 1e9;
      b.bodies.forEach(q => {
        if (!q.alive || q === o) return;
        const fx = px - q.x, fy = py - q.y, rr = o.r + q.r, B = fx * dx + fy * dy, Cq = fx * fx + fy * fy - rr * rr, disc = B * B - Cq;
        if (disc >= 0) { const t = -B - Math.sqrt(disc); if (t > 0.5 && t < tb) tb = t; }
      });
      const t = Math.min(tw, tb, left);
      px += dx * t; py += dy * t; left -= t; pts.push([px, py]);
      if (tb <= tw || left <= 0) break;
      const nx = px / Math.hypot(px, py), ny = py / Math.hypot(px, py), dn = dx * nx + dy * ny;
      dx -= 2 * dn * nx; dy -= 2 * dn * ny;
    }
    return pts;
  };

  function face(o, x, y, r) {
    ctx.fillStyle = '#111';
    const hurt = o.hurt > 0, e = r * 0.28;
    if (!o.alive) { ctx.font = `${r * 0.6}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('x  x', x, y - r * .1); return; }
    if (hurt) {
      ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(x - e - 4, y - 6); ctx.lineTo(x - e + 3, y - 2); ctx.lineTo(x - e - 4, y + 2);
      ctx.moveTo(x + e + 4, y - 6); ctx.lineTo(x + e - 3, y - 2); ctx.lineTo(x + e + 4, y + 2); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x - e, y - 3, r * .11, 0, 6.28); ctx.arc(x + e, y - 3, r * .11, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - e + 1, y - 4, r * .04, 0, 6.28); ctx.arc(x + e + 1, y - 4, r * .04, 0, 6.28); ctx.fill();
    }
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.beginPath();
    if (hurt) ctx.arc(x, y + r * .38, r * .14, Math.PI * 1.1, Math.PI * 1.9); else ctx.arc(x, y + r * .15, r * .2, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }

  V.draw = (b, ui, dt) => {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (V.shake > 0.5) ctx.translate((Math.random() - .5) * V.shake, (Math.random() - .5) * V.shake);
    // 場地
    const g2 = ctx.createRadialGradient(CX, CY, 10, CX, CY, b.R * S);
    g2.addColorStop(0, '#2c2846'); g2.addColorStop(1, '#1b1830');
    ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(CX, CY, b.R * S, 0, 6.28); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = b.rules.includes('spikes') ? '#f6a' : '#6a64a0'; ctx.stroke();
    if (b.rules.includes('spikes')) { ctx.fillStyle = '#f6a'; for (let i = 0; i < 48; i++) { const a = i / 48 * 6.28, r1 = b.R * S; ctx.beginPath(); ctx.moveTo(CX + Math.cos(a - .05) * r1, CY + Math.sin(a - .05) * r1); ctx.lineTo(CX + Math.cos(a) * (r1 - 9), CY + Math.sin(a) * (r1 - 9)); ctx.lineTo(CX + Math.cos(a + .05) * r1, CY + Math.sin(a + .05) * r1); ctx.fill(); } }
    if (b.R < b.R0) { ctx.strokeStyle = '#ff446633'; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(CX, CY, b.R0 * S, 0, 6.28); ctx.stroke(); ctx.setLineDash([]); }
    ctx.strokeStyle = '#ffffff10'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(CX - b.R * S, CY); ctx.lineTo(CX + b.R * S, CY); ctx.stroke();

    // 瞄準線
    if (ui.aim) {
      const o = b.bodies[ui.aim.idx], k = ui.aim.angle.toFixed(3) + '|' + ui.aim.power.toFixed(3) + '|' + ui.aim.idx;
      if (!ui.pred || ui.predKey !== k) { ui.pred = FA.battle.predict(b, ui.aim.idx, ui.aim.angle, ui.aim.power); ui.predKey = k; }
      const pr = ui.pred, col = ui.aim.enemy ? '#ff7a7a' : '#ffe066';
      if (pr) {
        const line = (arr, a0, a1) => { ctx.beginPath(); for (let i = a0; i <= a1 && i < arr.length; i++) { const p = arr[i]; i === a0 ? ctx.moveTo(CX + p[0] * S, CY + p[1] * S) : ctx.lineTo(CX + p[0] * S, CY + p[1] * S); } ctx.stroke(); };
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.setLineDash([8, 7]); line(pr.pts, 0, pr.cut); ctx.setLineDash([]);
        const cp = pr.pts[pr.cut]; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(CX + cp[0] * S, CY + cp[1] * S, pr.r * S, 0, 6.28); ctx.stroke();
        ctx.globalAlpha = 0.5; ctx.setLineDash([3, 5]); line(pr.pts, pr.cut, pr.pts.length - 1); ctx.setLineDash([]);
        if (pr.hit && pr.hit.length > 1) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; line(pr.hit, 0, pr.hit.length - 1); const e = pr.hit[pr.hit.length - 1]; ctx.beginPath(); ctx.arc(CX + e[0] * S, CY + e[1] * S, 4, 0, 6.28); ctx.fillStyle = '#fff'; ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      if (!ui.aim.enemy) { // 力道條
        const fp = FA.DATA.config.fullPowerAt, full = ui.aim.power >= fp, bx = CX + o.x * S - 34, by = CY + o.y * S - o.r * S - 30;
        ctx.fillStyle = '#000b'; ctx.fillRect(bx - 2, by - 2, 72, 12);
        ctx.fillStyle = full ? '#ff3b3b' : ui.aim.power > 0.6 ? '#ffb347' : '#7cf05a'; ctx.fillRect(bx, by, 68 * ui.aim.power, 8);
        ctx.fillStyle = '#fff'; ctx.fillRect(bx + 68 * fp, by - 2, 2, 12);
        ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(full ? '全力！' : '力道 ' + Math.round(ui.aim.power * 100) + '%', bx + 34, by - 5);
      }
      if (!ui.aim.enemy) { // 拉弓線
        ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(CX + o.x * S, CY + o.y * S);
        ctx.lineTo(CX + (o.x - Math.cos(ui.aim.angle) * 140 * ui.aim.power) * S, CY + (o.y - Math.sin(ui.aim.angle) * 140 * ui.aim.power) * S); ctx.stroke();
      }
    }

    // 火焰地板
    (b.zones || []).forEach(z => { ctx.fillStyle = z.team === 0 ? '#ff8a3d33' : '#ff3d3d33'; ctx.strokeStyle = '#ff8a3d88'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(CX + z.x * S, CY + z.y * S, z.r * S, 0, 6.28); ctx.fill(); ctx.stroke(); });
    // 棋子
    const t = performance.now() / 1000;
    b.bodies.forEach(o => {
      if (o.hurt > 0) o.hurt -= dt * 3;
      if (!o.alive) return;
      const x = CX + o.x * S, y = CY + o.y * S, r = o.r * S;
      const sel = b.phase === 'aim' && b.turn === 0 && o.team === 0 && !o.stunned;
      if (o.team === b.turn && sel) { ctx.strokeStyle = '#ffe06688'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r + 5 + Math.sin(t * 5) * 2, 0, 6.28); ctx.stroke(); }
      ctx.fillStyle = '#0006'; ctx.beginPath(); ctx.ellipse(x, y + r * .8, r * .9, r * .3, 0, 0, 6.28); ctx.fill();
      const gr = ctx.createRadialGradient(x - r * .3, y - r * .3, r * .1, x, y, r);
      gr.addColorStop(0, '#fff8'); gr.addColorStop(0.25, o.color); gr.addColorStop(1, o.color);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = o.team === 0 ? '#5cf' : '#f55'; ctx.stroke();
      if (o.shield > 0) { ctx.strokeStyle = '#9ef'; ctx.lineWidth = 2 + Math.min(4, o.shield / 20); ctx.beginPath(); ctx.arc(x, y, r + 4, 0, 6.28); ctx.stroke(); }
      face(o, x, y, r);
      if (o.temp) return;
      if (o.weapon && FA.DATA.weapons[o.weapon]) { ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(FA.DATA.weapons[o.weapon].icon, x + r * .8, y - r * .6); }
      if (o.boss) { ctx.font = `${r * .6}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('👑', x, y - r - 4); }
      else if (o.star > 1) { ctx.fillStyle = '#ffe066'; ctx.font = `bold ${10}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('★'.repeat(o.star), x, y - r - 3); }
      if (o.stunned) { ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('💫', x + Math.sin(t * 4) * 8, y - r - 12); }
      const bw = r * 2, hpw = bw * Math.max(0, o.hp / o.maxHp);
      ctx.fillStyle = '#000a'; ctx.fillRect(x - r, y + r + 4, bw, 5);
      ctx.fillStyle = o.team === 0 ? '#5f5' : '#f55'; ctx.fillRect(x - r, y + r + 4, hpw, 5);
      ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(o.name, x, y + r + 18);
    });

    // 特效
    V.rings.forEach(rg => {
      const k = 1 - rg.life / rg.max, rr = (rg.inward ? (1 - k) : k) * rg.r * S;
      ctx.strokeStyle = rg.col; ctx.globalAlpha = rg.life / rg.max; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(CX + rg.x * S, CY + rg.y * S, Math.max(1, rr), 0, 6.28); ctx.stroke();
      if (!rg.inward) { ctx.fillStyle = rg.col + '44'; ctx.fill(); }
    });
    ctx.globalAlpha = 1;
    V.parts.forEach(p => { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.col; ctx.fillRect(CX + p.x * S - 2, CY + p.y * S - 2, 4, 4); });
    ctx.globalAlpha = 1;
    V.texts.forEach(tx => {
      ctx.globalAlpha = Math.min(1, tx.life * 2); ctx.fillStyle = tx.col; ctx.font = `bold ${tx.big ? 20 : 14}px sans-serif`; ctx.textAlign = 'center';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText(tx.txt, CX + tx.x * S, CY + tx.y * S); ctx.fillText(tx.txt, CX + tx.x * S, CY + tx.y * S);
    });
    ctx.globalAlpha = 1;
    ctx.restore();
    if (V.chainShow > 0 && V.chainN >= 2) {
      ctx.font = `bold ${26 + Math.min(20, V.chainN * 2)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#ffb347'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
      ctx.strokeText('連鎖 ×' + V.chainN, W / 2, CY - b.R0 * S - 18); ctx.fillText('連鎖 ×' + V.chainN, W / 2, CY - b.R0 * S - 18);
    }
    if (V.banner) { ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.strokeText(V.banner.txt, W / 2, CY); ctx.fillText(V.banner.txt, W / 2, CY); }
    if (ui.msg) { ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = ui.msgCol || '#fff'; ctx.fillText(ui.msg, W / 2, CY + b.R0 * S + 34); }
  };
})(globalThis);
