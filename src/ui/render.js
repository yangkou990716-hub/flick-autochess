// 戰鬥畫面：Canvas 向量繪製＋爽感回饋（頓幀、震動、粒子、分級傷害數字、層次爆炸、連鎖計數、牆面閃光）
// 角色外觀在 src/ui/sprites.js（FA.sprites），沒載入時退回簡易圓形
(function (g) {
  const FA = g.FA = g.FA || {};
  const SND = n => FA.sound && FA.sound.play(n);
  const TAU = Math.PI * 2, FONT = '-apple-system,"PingFang TC","Noto Sans TC",sans-serif';
  const V = FA.view = { trails: {}, bolts: [], parts: [], texts: [], rings: [], flashes: [], decals: [], walls: [], shake: 0, hitstop: 0, banner: null, chainShow: 0, chainN: 0, chainPulse: 0, screenFlash: 0 };
  let cv, ctx, W, H, dpr, S, CX, CY, bgCache = null, lastB = null;
  const dead = {}, hpLag = {};

  V.init = c => { cv = c; ctx = c.getContext('2d'); V.resize(); addEventListener('resize', V.resize); };
  V.resize = () => {
    dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = Math.min(W - 16, (H - 150)) / (2 * FA.DATA.config.arenaR + 10); CX = W / 2; CY = H / 2 + 10; bgCache = null;
  };
  V.toWorld = (x, y) => ({ x: (x - CX) / S, y: (y - CY) / S });
  V.reset = () => {
    V.trails = {}; V.bolts = []; V.parts = []; V.texts = []; V.rings = []; V.flashes = []; V.decals = []; V.walls = [];
    V.shake = 0; V.hitstop = 0; V.banner = null; V.chainN = 0; V.chainShow = 0; V.chainPulse = 0; V.screenFlash = 0;
    for (const k in dead) delete dead[k]; for (const k in hpLag) delete hpLag[k];
  };
  // 測試用：己方可彈棋子的螢幕座標
  V._own = () => { const b = lastB; if (!b) return null; const o = b.bodies.find(q => q.alive && !q.temp && q.team === 0 && !q.stunned); return o ? [CX + o.x * S, CY + o.y * S] : null; };
  Object.defineProperty(V, '_lastB', { get: () => lastB });

  // ---- 粒子 ----
  const MAXP = 520;
  const add = p => { if (V.parts.length < MAXP) V.parts.push(p); };
  const burst = (x, y, col, n, sp, o) => { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = sp * (0.3 + Math.random()); add(Object.assign({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, max: 0.9, col, k: 'dot', sz: 2 + Math.random() * 2.5, drag: 0.9 }, o)); } };
  const sparks = (x, y, col, n, sp) => burst(x, y, col, n, sp, { k: 'streak', life: 0.25 + Math.random() * 0.2, max: 0.45, drag: 0.86, add: true });
  const smoke = (x, y, r, n) => { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, d = Math.random() * r * 0.5, s = 30 + Math.random() * 60; add({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: 0.7 + Math.random() * 0.6, max: 1.3, col: '#5a5068', k: 'smoke', sz: r * (0.18 + Math.random() * 0.15), drag: 0.95 }); } };
  const vib = ms => { try { if (!(FA.settings && FA.settings.vibrate === false)) navigator.vibrate && navigator.vibrate(ms); } catch (e) { } };
  const ring = (x, y, r, col, life, o) => V.rings.push(Object.assign({ x, y, r, life, max: life, col, w: 4 }, o));

  // ---- 傷害數字分級 ----
  const KCOL = { hit: '#ffffff', blast: '#ffb347', reflect: '#9df', spike: '#f6a', poison: '#a5e05a', burn: '#ff8a3d', zap: '#fff176', magnet: '#9fb4ff' };
  function dmgText(e) {
    const a = e.amt, tier = a >= 80 ? 3 : a >= 45 ? 2 : a >= 18 ? 1 : 0;
    const base = KCOL[e.kind] || '#fff';
    V.texts.push({ x: e.x + (Math.random() - .5) * 18, y: e.y - 12, txt: Math.round(a) + (tier === 3 ? '!' : ''), life: [0.7, 0.85, 1, 1.2][tier], max: [0.7, 0.85, 1, 1.2][tier],
      col: tier === 3 ? '#ff5a3c' : tier === 2 ? (e.kind === 'hit' ? '#ffe066' : base) : base, size: [12, 15, 21, 28][tier], tier, rot: tier >= 2 ? (Math.random() - .5) * 0.3 : 0, vy: [38, 45, 55, 30][tier] });
    return tier;
  }

  // ---- 消化戰鬥事件 ----
  V.consume = b => {
    for (const e of b.events) {
      if (e.t === 'dmg') { SND(e.kind === 'hit' ? 'hit' : e.kind === 'poison' ? 'poison' : 'bump');
        const tier = dmgText(e), col = e.team === 0 ? '#7cf' : '#f87';
        burst(e.x, e.y, col, [4, 7, 12, 18][tier], [130, 170, 240, 300][tier]);
        if (e.kind === 'hit') { V.flashes.push({ x: e.x, y: e.y, r: 14 + tier * 8, life: 0.12, max: 0.12, col: '#ffffff' }); sparks(e.x, e.y, '#fff2b0', 3 + tier * 3, 260 + tier * 60); }
        if (tier >= 2) { V.hitstop = Math.max(V.hitstop, tier === 3 ? 0.09 : 0.06); V.shake = Math.max(V.shake, tier === 3 ? 12 : 8); vib(tier === 3 ? 25 : 15); }
        if (tier === 3) { ring(e.x, e.y, 70, '#ffffff', 0.25, { w: 3 }); V.screenFlash = Math.max(V.screenFlash, 0.12); }
      } else if (e.t === 'boom') { SND('boom');
        const ice = e.n === 0;
        V.flashes.push({ x: e.x, y: e.y, r: e.r * 0.7, life: 0.1, max: 0.1, col: '#ffffff' });
        V.flashes.push({ x: e.x, y: e.y, r: e.r, life: 0.38, max: 0.38, col: ice ? '#8fd8ff' : '#ff7a1a', fire: !ice, grow: true });
        ring(e.x, e.y, e.r * 1.25, ice ? '#e1f5fe' : '#fff3c4', 0.4, { w: 3, nofill: true });
        ring(e.x, e.y, e.r, ice ? '#81d4fa' : '#ff8a3d', 0.35);
        sparks(e.x, e.y, ice ? '#e1f5fe' : '#ffd27a', 16, 420); burst(e.x, e.y, ice ? '#bdf' : '#ffb347', 12, 300, { add: true });
        burst(e.x, e.y, ice ? '#fff' : '#ff5a1f', 8, 120, { k: 'ember', life: 0.9, max: 0.9, drag: 0.96, add: true });
        if (!ice) { smoke(e.x, e.y, e.r, 7); V.decals.push({ x: e.x, y: e.y, r: e.r * 0.55, life: 5, max: 5 }); if (V.decals.length > 14) V.decals.shift(); }
        V.shake = Math.max(V.shake, 10 + Math.min(8, (e.n || 0) * 2)); V.screenFlash = Math.max(V.screenFlash, 0.08);
        if (e.n >= 2) { V.chainN = e.n; V.chainShow = 1.4; V.chainPulse = 1; vib(10 + e.n * 4); }
      } else if (e.t === 'pull') { ring(e.x, e.y, e.r, '#6b8cff', 0.45, { inward: true }); ring(e.x, e.y, e.r * 0.7, '#a9b8ff', 0.35, { inward: true, w: 2 }); }
      else if (e.t === 'launch') SND('launch');
      else if (e.t === 'freeze') { SND('freeze'); V.texts.push({ x: e.x, y: e.y - 24, txt: '❄ 冰凍', life: 0.9, max: 0.9, col: '#8df', size: 14, tier: 1, vy: 30 }); burst(e.x, e.y, '#dff4ff', 14, 200); ring(e.x, e.y, 34, '#bdf', 0.3); }
      else if (e.t === 'poison') { SND('poison'); burst(e.x, e.y, '#9ccc65', 8, 110, { k: 'bubble', life: 0.8, max: 0.8, drag: 0.92 }); }
      else if (e.t === 'bolt') { SND('zap'); V.bolts.push({ x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, life: 0.28, seed: Math.random() * 1000 }); sparks(e.x2, e.y2, '#fff59d', 6, 260); }
      else if (e.t === 'heal') { SND('heal'); V.texts.push({ x: e.x, y: e.y - 22, txt: '+治療', life: 0.9, max: 0.9, col: '#7f7', size: 14, tier: 1, vy: 35 }); burst(e.x, e.y, '#7f7', 10, 120, { k: 'plus', vy: -60, drag: 0.94 }); }
      else if (e.t === 'revive') { SND('heal'); V.banner = { txt: '復活！', life: 1.1, max: 1.1, col: '#fff3c4' }; burst(e.x, e.y, '#fff3c4', 30, 300, { add: true }); ring(e.x, e.y, 90, '#fff3c4', 0.6); }
      else if (e.t === 'death') { SND('death'); burst(e.x, e.y, e.color, 26, 380); sparks(e.x, e.y, '#fff', 12, 480); ring(e.x, e.y, 80, e.team === 0 ? '#7cf' : '#f87', 0.45, { w: 5 }); V.flashes.push({ x: e.x, y: e.y, r: 50, life: 0.15, max: 0.15, col: '#ffffff' }); V.hitstop = 0.1; V.shake = 14; vib(30); }
      else if (e.t === 'combo') { SND('combo'); V.texts.push({ x: e.x, y: e.y - 34, txt: '聯動！' + e.name, life: 1.5, max: 1.5, col: '#ffe066', size: 22, tier: 2, vy: 25 }); ring(e.x, e.y, 120, '#ffe066', 0.5, { w: 5 }); sparks(e.x, e.y, '#ffe066', 20, 420); V.hitstop = 0.12; V.shake = 12; V.screenFlash = 0.15; }
      else if (e.t === 'shieldbreak') { ring(e.x, e.y, 40, '#8ef', 0.3); burst(e.x, e.y, '#bff', 10, 220, { k: 'shard' }); }
      else if (e.t === 'wall') { SND('wall'); sparks(e.x, e.y, '#e0dcff', 5, 200); V.walls.push({ a: Math.atan2(e.y, e.x), life: 0.4, max: 0.4 }); if (V.walls.length > 12) V.walls.shift(); }
      else if (e.t === 'bump') { if (e.s > 150) { sparks(e.x, e.y, '#fff', Math.min(10, e.s / 70 | 0), 120 + e.s * 0.4); ring(e.x, e.y, 18 + Math.min(40, e.s / 15), '#ffffff', 0.18, { w: 2, nofill: true }); } if (e.s > 300) V.shake = Math.max(V.shake, 4); }
      else if (e.t === 'zap') { SND('zap'); ring(e.x, e.y, 40, '#ffe066', 0.3); burst(e.x, e.y, '#ffe066', 10, 220, { add: true }); V.bolts.push({ x1: e.x, y1: e.y - 160, x2: e.x, y2: e.y, life: 0.22, seed: Math.random() * 1000 }); }
      else if (e.t === 'split' || e.t === 'stick' || e.t === 'pierce') V.texts.push({ x: e.x, y: e.y - 22, txt: { split: '分裂！', stick: '黏住！', pierce: '穿透！' }[e.t], life: 0.8, max: 0.8, col: '#cff', size: 14, tier: 1, vy: 35 });
      else if (e.t === 'bossSplit') { V.banner = { txt: '首領分裂了！', life: 1.4, max: 1.4, col: '#ff8fb0' }; V.shake = 16; burst(e.x, e.y, '#c9a', 40, 400); ring(e.x, e.y, 140, '#ff4d6d', 0.5, { w: 6 }); }
      else if (e.t === 'expose') { V.texts.push({ x: e.x, y: e.y - 22, txt: '破甲！', life: 0.8, max: 0.8, col: '#ffb74d', size: 14, tier: 1, vy: 35 }); sparks(e.x, e.y, '#ffb74d', 8, 300); }
      else if (e.t === 'boost') { V.texts.push({ x: e.x, y: e.y - 22, txt: '加速！', life: 0.8, max: 0.8, col: '#cff', size: 14, tier: 1, vy: 35 }); sparks(e.x, e.y, '#cff', 8, 300); }
      // ---- 羈絆抽獎 ----
      else if (e.t === 'lotto') {
        const LR = FA.DATA.lotteryRules, big = e.prize === 'shot' || e.prize === 'gold', none = e.prize === 'none';
        const txt = '🎰 ' + (e.prize === 'dmg' ? `傷害+${Math.round(e.val * 100)}%` : (e.prize === 'stack' ? '小獎！' : '') + LR.name[e.prize]);
        V.texts.push({ x: e.x, y: e.y - 30, txt, life: none ? 0.7 : 1.4, max: none ? 0.7 : 1.4, col: none ? '#9a97b0' : big ? '#ffd54f' : '#b2ff59', size: none ? 11 : big ? 19 : 14, tier: big ? 2 : 1, vy: 28 });
        if (big) { SND('combo'); ring(e.x, e.y, 70, '#ffd54f', 0.45, { w: 4 }); sparks(e.x, e.y, '#ffd54f', 16, 360); if (e.prize === 'shot') V.banner = { txt: '🎰 大獎！多 1 發', life: 1.2, max: 1.2, col: '#ffd54f' }; }
        else if (!none) sparks(e.x, e.y, '#b2ff59', 6, 220);
      }
      // ---- 次元撲滿 ----
      else if (e.t === 'piggold') { SND('coin'); V.texts.push({ x: e.x, y: e.y - 26, txt: `+${e.n}💰`, life: 1.1, max: 1.1, col: '#ffd54f', size: 16, tier: 1, vy: 40 }); burst(e.x, e.y, '#ffd54f', 10, 220, { k: 'ember', life: 0.8, max: 0.8, add: true }); }
      else if (e.t === 'pighop') { V.texts.push({ x: e.x, y: e.y - 24, txt: '蹦！', life: 0.6, max: 0.6, col: '#f8a5c2', size: 12, tier: 1, vy: 30 }); ring(e.x, e.y, 30, '#f8a5c2', 0.25, { w: 2, nofill: true }); }
      else if (e.t === 'pigflee') { burst(e.x, e.y, '#ffe0ec', 6, 160); }
      else if (e.t === 'over') SND(e.winner === 0 ? 'win' : 'lose');
      else if (e.t === 'fullpower') { SND('full'); V.texts.push({ x: e.x, y: e.y - 42, txt: '全力！', life: 1, max: 1, col: '#ff5', size: 24, tier: 2, vy: 30 }); ring(e.x, e.y, 70, '#ffe066', 0.35, { w: 5 }); sparks(e.x, e.y, '#ffe066', 14, 380); V.shake = Math.max(V.shake, 6); }
      else if (e.t === 'shrink') V.banner = { txt: '場地縮小！', life: 1.2, max: 1.2, col: '#ff8a8a' };
      else if (e.t === 'skip') V.banner = { txt: (e.team === 0 ? '我方' : '敵方') + '全員暈眩，跳過', life: 1.2, max: 1.2 };
    }
    b.events = [];
  };

  V.update = dt => {
    for (const p of V.parts) { p.x += p.vx * dt; p.y += p.vy * dt; const d = Math.pow(p.drag, dt * 60); p.vx *= d; p.vy *= d; if (p.k === 'ember') p.vy -= 40 * dt; p.life -= dt; }
    V.parts = V.parts.filter(p => p.life > 0);
    for (const t of V.texts) { t.y -= t.vy * dt; t.life -= dt; } V.texts = V.texts.filter(t => t.life > 0);
    const dec = a => { for (const r of a) r.life -= dt; return a.filter(r => r.life > 0); };
    V.rings = dec(V.rings); V.bolts = dec(V.bolts); V.flashes = dec(V.flashes); V.decals = dec(V.decals); V.walls = dec(V.walls);
    V.shake *= Math.pow(0.02, dt); V.chainShow -= dt; V.chainPulse = Math.max(0, V.chainPulse - dt * 4); V.screenFlash = Math.max(0, V.screenFlash - dt);
    if (V.banner) { V.banner.life -= dt; if (V.banner.life <= 0) V.banner = null; }
  };

  // 預測反彈線（舊版，保留相容）
  V.path = (b, o, ang, pw) => {
    let px = o.x, py = o.y, dx = Math.cos(ang), dy = Math.sin(ang), left = 250 + 700 * pw;
    const pts = [[px, py]], R = b.R - o.r;
    for (let k = 0; k <= o.bounces && left > 0; k++) {
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

  // ---- 場地背景（快取） ----
  function theme(b) {
    const boss = b.bodies.find(o => o.boss);
    if (boss) return { key: 'boss' + boss.color, in: FA.sprites ? FA.sprites.mix('#3a1426', boss.color, 0.18) : '#3a1426', out: '#170811', grid: '#ff4d6d', rim: '#ff3d5a', glow: '#ff1f4a', bg1: '#24060f', bg2: '#0b0307' };
    return { key: 'n', in: '#2e2a4c', out: '#17142b', grid: '#8a7dff', rim: '#7d72d6', glow: '#6b5cff', bg1: '#1d1a33', bg2: '#0e0c18' };
  }
  function buildBg(b, th) {
    const c = document.createElement('canvas'); c.width = W * dpr; c.height = H * dpr; const x = c.getContext('2d'); x.scale(dpr, dpr);
    const R = b.R * S;
    // 外圍：暗色漸層＋星點
    const bg = x.createRadialGradient(CX, CY, R * 0.8, CX, CY, Math.max(W, H)); bg.addColorStop(0, th.bg1); bg.addColorStop(1, th.bg2); x.fillStyle = bg; x.fillRect(0, 0, W, H);
    let sd = 7; const rnd = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(255,255,255,${0.05 + rnd() * 0.18})`; x.fillRect(rnd() * W, rnd() * H, 1.5, 1.5); }
    // 外光暈
    const og = x.createRadialGradient(CX, CY, R, CX, CY, R + 40); og.addColorStop(0, th.glow + '55'); og.addColorStop(1, th.glow + '00'); x.fillStyle = og; x.beginPath(); x.arc(CX, CY, R + 40, 0, TAU); x.fill();
    // 地板
    const fg = x.createRadialGradient(CX, CY - R * 0.2, 10, CX, CY, R); fg.addColorStop(0, th.in); fg.addColorStop(1, th.out);
    x.save(); x.beginPath(); x.arc(CX, CY, R, 0, TAU); x.fillStyle = fg; x.fill(); x.clip();
    // 六角格紋
    x.strokeStyle = th.grid + '14'; x.lineWidth = 1; const hs = 22 * Math.max(0.6, S), hw = hs * Math.sqrt(3);
    x.beginPath();
    for (let row = -Math.ceil(R / (hs * 1.5)) - 1; row <= Math.ceil(R / (hs * 1.5)) + 1; row++) for (let col = -Math.ceil(R / hw) - 1; col <= Math.ceil(R / hw) + 1; col++) {
      const hx = CX + col * hw + (row & 1 ? hw / 2 : 0), hy = CY + row * hs * 1.5;
      for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3, px = hx + Math.cos(a) * hs, py = hy + Math.sin(a) * hs; k ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath();
    }
    x.stroke();
    // 同心圈＋中線＋中心徽記
    x.strokeStyle = th.grid + '22'; x.lineWidth = 1.5; [0.33, 0.66].forEach(k => { x.beginPath(); x.arc(CX, CY, R * k, 0, TAU); x.stroke(); });
    x.strokeStyle = th.grid + '30'; x.setLineDash([6, 8]); x.beginPath(); x.moveTo(CX - R, CY); x.lineTo(CX + R, CY); x.stroke(); x.setLineDash([]);
    x.fillStyle = th.grid + '18'; x.beginPath(); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, rr = k % 2 ? R * 0.06 : R * 0.13; x.lineTo(CX + Math.cos(a) * rr, CY + Math.sin(a) * rr); } x.closePath(); x.fill();
    // 內緣光暈
    const ig = x.createRadialGradient(CX, CY, R * 0.82, CX, CY, R); ig.addColorStop(0, th.glow + '00'); ig.addColorStop(1, th.glow + '40'); x.fillStyle = ig; x.fillRect(CX - R, CY - R, R * 2, R * 2);
    x.restore();
    // 外框
    x.lineWidth = 7; x.strokeStyle = '#0008'; x.beginPath(); x.arc(CX, CY, R + 1, 0, TAU); x.stroke();
    const rg = x.createLinearGradient(CX, CY - R, CX, CY + R); rg.addColorStop(0, FA.sprites ? FA.sprites.mix(th.rim, '#ffffff', 0.35) : th.rim); rg.addColorStop(1, th.rim);
    x.lineWidth = 4; x.strokeStyle = rg; x.stroke();
    if (b.rules.includes('spikes')) {
      for (let i = 0; i < 48; i++) { const a = i / 48 * TAU, r1 = R; x.beginPath(); x.moveTo(CX + Math.cos(a - .05) * r1, CY + Math.sin(a - .05) * r1); x.lineTo(CX + Math.cos(a) * (r1 - 10), CY + Math.sin(a) * (r1 - 10)); x.lineTo(CX + Math.cos(a + .05) * r1, CY + Math.sin(a + .05) * r1);
        x.fillStyle = '#f6a'; x.fill(); x.strokeStyle = '#5a1030'; x.lineWidth = 1; x.stroke(); }
    }
    if (b.R < b.R0) { // 縮圈外的危險區
      x.save(); x.beginPath(); x.arc(CX, CY, b.R0 * S, 0, TAU); x.arc(CX, CY, R + 3, 0, TAU, true); x.fillStyle = '#ff2a4a18'; x.fill('evenodd');
      x.strokeStyle = '#ff446655'; x.lineWidth = 1.5; x.setLineDash([6, 6]); x.beginPath(); x.arc(CX, CY, b.R0 * S, 0, TAU); x.stroke(); x.restore();
    }
    return c;
  }

  // ---- 地板物件 ----
  function drawZones(b, t) {
    (b.zones || []).forEach((z, zi) => {
      const zx = CX + z.x * S, zy = CY + z.y * S, zr = (z.r || 10) * S;
      if (z.kind === 'mine') {
        const col = z.team === 0 ? '#4fd2ff' : '#ff5a5a', rr = 8;
        ctx.fillStyle = '#2b2b33'; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; ctx.beginPath(); ctx.moveTo(zx + Math.cos(a - .35) * rr, zy + Math.sin(a - .35) * rr); ctx.lineTo(zx + Math.cos(a) * rr * 1.55, zy + Math.sin(a) * rr * 1.55); ctx.lineTo(zx + Math.cos(a + .35) * rr, zy + Math.sin(a + .35) * rr); ctx.fill(); }
        ctx.beginPath(); ctx.arc(zx, zy, rr, 0, TAU); ctx.fillStyle = '#3d3d48'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke();
        const on = Math.sin(t * 8 + zi) > 0; ctx.fillStyle = on ? col : '#222'; ctx.beginPath(); ctx.arc(zx, zy, 3, 0, TAU); ctx.fill();
        if (on) { ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(zx, zy, 7, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
        return;
      }
      if (z.kind === 'pool') {
        const gr = ctx.createRadialGradient(zx, zy, 0, zx, zy, zr); gr.addColorStop(0, '#7cb342aa'); gr.addColorStop(0.75, '#558b2f77'); gr.addColorStop(1, '#33691e22');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(zx, zy, zr, 0, TAU); ctx.fill(); ctx.strokeStyle = '#9ccc6588'; ctx.lineWidth = 2; ctx.stroke();
        for (let k = 0; k < 4; k++) { const ph = (t * 0.6 + k * 0.25 + zi * 0.1) % 1, a = k * 1.9 + zi; ctx.globalAlpha = 1 - ph; ctx.strokeStyle = '#c5e1a5'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(zx + Math.cos(a) * zr * 0.5, zy + Math.sin(a) * zr * 0.5, 2 + ph * 4, 0, TAU); ctx.stroke(); }
        ctx.globalAlpha = 1; return;
      }
      // 火焰地板
      const mine = z.team === 0, fl = 0.85 + Math.sin(t * 13 + zi) * 0.08 + Math.sin(t * 7.3) * 0.05;
      const gr = ctx.createRadialGradient(zx, zy, 0, zx, zy, zr * fl); gr.addColorStop(0, mine ? '#ffd27a88' : '#ff8a7a88'); gr.addColorStop(0.5, mine ? '#ff8a3d55' : '#ff3d3d55'); gr.addColorStop(1, '#ff3d0000');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(zx, zy, zr, 0, TAU); ctx.fill();
      ctx.strokeStyle = mine ? '#ff8a3d66' : '#ff3d3d66'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 5]); ctx.stroke(); ctx.setLineDash([]);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + zi, d = zr * 0.45, fx = zx + Math.cos(a) * d, fy = zy + Math.sin(a) * d, h = 8 + Math.sin(t * 10 + k * 2) * 3;
        ctx.fillStyle = '#ff7a1a99'; ctx.beginPath(); ctx.moveTo(fx - 4, fy); ctx.quadraticCurveTo(fx - 3, fy - h * 0.6, fx, fy - h); ctx.quadraticCurveTo(fx + 3, fy - h * 0.6, fx + 4, fy); ctx.fill(); }
      ctx.restore();
    });
  }

  function lightning(x1, y1, x2, y2, seed, jit) {
    let s = seed; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280 - 0.5;
    ctx.beginPath(); ctx.moveTo(x1, y1); const n = 7; for (let k = 1; k < n; k++) { const f = k / n; ctx.lineTo(x1 + (x2 - x1) * f + r() * jit, y1 + (y2 - y1) * f + r() * jit); } ctx.lineTo(x2, y2);
  }

  // 簡易棋子（sprites.js 未載入時）
  function plainBody(o, x, y, r) {
    ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = o.team === 0 ? '#5cf' : '#f55'; ctx.stroke();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x - r * .3, y - 2, r * .1, 0, TAU); ctx.arc(x + r * .3, y - 2, r * .1, 0, TAU); ctx.fill();
  }

  function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function outText(txt, x, y, size, col, lw) { ctx.font = `900 ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#000'; ctx.lineWidth = lw || Math.max(3, size / 5); ctx.strokeText(txt, x, y); ctx.fillStyle = col; ctx.fillText(txt, x, y); }

  V.draw = (b, ui, dt) => {
    lastB = b;
    const t = performance.now() / 1000, th = theme(b), bgKey = th.key + '|' + b.R + '|' + b.rules.join() + '|' + W + 'x' + H;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (V.shake > 0.5) ctx.translate((Math.random() - .5) * V.shake, (Math.random() - .5) * V.shake);
    if (!bgCache || bgCache.key !== bgKey) bgCache = { key: bgKey, c: buildBg(b, th) };
    ctx.drawImage(bgCache.c, -12, -12, W + 24, H + 24); // 稍放大，避免震動露邊
    // 首領戰：外框脈動
    const R = b.R * S;
    ctx.globalAlpha = th.key === 'n' ? 0.25 : 0.35 + Math.sin(t * 2.5) * 0.15; ctx.strokeStyle = th.glow; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(CX, CY, R + 4, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    // 焦痕
    V.decals.forEach(d => { const gr = ctx.createRadialGradient(CX + d.x * S, CY + d.y * S, 0, CX + d.x * S, CY + d.y * S, d.r * S); gr.addColorStop(0, `rgba(10,5,5,${0.45 * Math.min(1, d.life / 1.5)})`); gr.addColorStop(1, 'rgba(10,5,5,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(CX + d.x * S, CY + d.y * S, d.r * S, 0, TAU); ctx.fill(); });
    // 牆面閃光
    if (V.walls.length) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      V.walls.forEach(w => { const k = w.life / w.max; ctx.strokeStyle = `rgba(200,190,255,${0.9 * k})`; ctx.lineWidth = 4 + 8 * k; ctx.beginPath(); ctx.arc(CX, CY, R, w.a - 0.3 * (1.3 - k), w.a + 0.3 * (1.3 - k)); ctx.stroke(); ctx.strokeStyle = `rgba(255,255,255,${k})`; ctx.lineWidth = 2; ctx.stroke(); });
      ctx.restore(); }
    drawZones(b, t);

    // 瞄準線
    let aimO = null;
    if (ui.aim) {
      const o = aimO = b.bodies[ui.aim.idx], k = ui.aim.angle.toFixed(3) + '|' + ui.aim.power.toFixed(3) + '|' + ui.aim.idx;
      if (!ui.pred || ui.predKey !== k) { ui.pred = FA.battle.predict(b, ui.aim.idx, ui.aim.angle, ui.aim.power); ui.predKey = k; }
      const pr = ui.pred, col = ui.aim.enemy ? '#ff7a7a' : '#ffe066';
      if (pr) {
        const line = (arr, a0, a1) => { ctx.beginPath(); for (let i = a0; i <= a1 && i < arr.length; i++) { const p = arr[i]; i === a0 ? ctx.moveTo(CX + p[0] * S, CY + p[1] * S) : ctx.lineTo(CX + p[0] * S, CY + p[1] * S); } ctx.stroke(); };
        ctx.lineCap = 'round';
        ctx.strokeStyle = col + '40'; ctx.lineWidth = 8; line(pr.pts, 0, pr.cut);
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.setLineDash([8, 7]); ctx.lineDashOffset = -t * 40; line(pr.pts, 0, pr.cut); ctx.setLineDash([]); ctx.lineDashOffset = 0;
        const cp = pr.pts[pr.cut]; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(CX + cp[0] * S, CY + cp[1] * S, pr.r * S, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 0.5; ctx.setLineDash([3, 5]); line(pr.pts, pr.cut, pr.pts.length - 1); ctx.setLineDash([]);
        if (pr.hit && pr.hit.length > 1) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; line(pr.hit, 0, pr.hit.length - 1); const e = pr.hit[pr.hit.length - 1]; ctx.beginPath(); ctx.arc(CX + e[0] * S, CY + e[1] * S, 4, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); }
        ctx.globalAlpha = 1; ctx.lineCap = 'butt';
      }
      if (!ui.aim.enemy) { // 拉弓線
        const ox = CX + o.x * S, oy = CY + o.y * S, ex = CX + (o.x - Math.cos(ui.aim.angle) * 140 * ui.aim.power) * S, ey = CY + (o.y - Math.sin(ui.aim.angle) * 140 * ui.aim.power) * S;
        ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.fillStyle = '#ffffff88'; ctx.beginPath(); ctx.arc(ex, ey, 4, 0, TAU); ctx.fill();
      }
    }

    // 拖尾
    ctx.lineCap = 'round';
    b.bodies.forEach(o => {
      const tr = V.trails[o.i] = V.trails[o.i] || [], sp = Math.abs(o.vx) + Math.abs(o.vy);
      if (o.alive && sp > 120) tr.push([o.x, o.y]); else if (tr.length) tr.shift();
      if (tr.length > 14) tr.shift();
      if (tr.length > 1) {
        ctx.strokeStyle = o.color;
        for (let k = 1; k < tr.length; k++) { ctx.globalAlpha = k / tr.length * 0.45; ctx.lineWidth = o.r * S * (k / tr.length) * 1.4; ctx.beginPath(); ctx.moveTo(CX + tr[k - 1][0] * S, CY + tr[k - 1][1] * S); ctx.lineTo(CX + tr[k][0] * S, CY + tr[k][1] * S); ctx.stroke(); }
        if (sp > 700) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#ffffff'; for (let k = Math.max(1, tr.length - 6); k < tr.length; k++) { ctx.globalAlpha = (k / tr.length) * 0.35; ctx.lineWidth = o.r * S * 0.35 * (k / tr.length); ctx.beginPath(); ctx.moveTo(CX + tr[k - 1][0] * S, CY + tr[k - 1][1] * S); ctx.lineTo(CX + tr[k][0] * S, CY + tr[k][1] * S); ctx.stroke(); } ctx.restore(); }
        ctx.globalAlpha = 1;
      }
    });
    ctx.lineCap = 'butt';

    // 棋子：先畫陰影
    b.bodies.forEach(o => { if (!o.alive) return; const x = CX + o.x * S, y = CY + o.y * S, r = o.r * S; ctx.fillStyle = '#0000004d'; ctx.beginPath(); ctx.ellipse(x + r * 0.1, y + r * 0.85, r * 0.95, r * 0.32, 0, 0, TAU); ctx.fill(); });
    const SP = FA.sprites;
    b.bodies.forEach(o => {
      if (o.hurt > 0) o.hurt -= dt * 3;
      const x = CX + o.x * S, y = CY + o.y * S, r = o.r * S;
      if (!o.alive) { // 陣亡：淡出飄起
        if (dead[o.i] == null) dead[o.i] = 0; dead[o.i] += dt;
        if (dead[o.i] < 0.55 && SP && !o.temp) SP.draw(ctx, o, x, y, r, t, dead[o.i] / 0.55);
        return;
      }
      const sel = b.phase === 'aim' && b.turn === 0 && o.team === 0 && !o.stunned && !o.temp;
      if (sel && aimO !== o) { // 可彈提示：旋轉虛線圈
        ctx.strokeStyle = '#ffe066aa'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.lineDashOffset = -t * 20; ctx.beginPath(); ctx.arc(x, y, r + 6 + Math.sin(t * 5) * 1.5, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
      }
      if (aimO === o && ui.aim && !ui.aim.enemy) { // 蓄力光
        const pw = ui.aim.power, full = pw >= FA.DATA.config.fullPowerAt, col = full ? '255,70,50' : pw > 0.6 ? '255,180,70' : '120,240,90';
        const rr = r * (1.35 + pw * 0.7 + (full ? Math.sin(t * 20) * 0.08 : 0)), gr = ctx.createRadialGradient(x, y, r * 0.8, x, y, rr);
        gr.addColorStop(0, `rgba(${col},${0.25 + pw * 0.45})`); gr.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
        if (full && Math.random() < 0.7) { const a = Math.random() * TAU, d = o.r * 2.6; add({ x: o.x + Math.cos(a) * d, y: o.y + Math.sin(a) * d, vx: -Math.cos(a) * d * 3.2, vy: -Math.sin(a) * d * 3.2, life: 0.3, max: 0.3, col: '#ffd27a', k: 'streak', drag: 1, add: true }); }
        ctx.strokeStyle = `rgba(${col},0.9)`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r + 5, -Math.PI / 2, -Math.PI / 2 + TAU * pw); ctx.stroke();
      }
      if (SP) SP.draw(ctx, o, x, y, r, t); else plainBody(o, x, y, r);
      if (o.shield > 0) { // 護盾泡泡
        const sr = r + 5; ctx.fillStyle = '#9ef2ff22'; ctx.beginPath(); ctx.arc(x, y, sr, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#9ef'; ctx.lineWidth = 1.5 + Math.min(3, o.shield / 25); ctx.stroke();
        ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, sr - 2, Math.PI * 1.15 + Math.sin(t * 2) * 0.2, Math.PI * 1.5 + Math.sin(t * 2) * 0.2); ctx.stroke();
      }
      if (o.temp) return;
      if (o.weapon && FA.DATA.weapons[o.weapon]) { ctx.font = `12px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(FA.DATA.weapons[o.weapon].icon, x + r * .95, y + r * .2); }
      if (o.stunned) { ctx.font = `13px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('❄', x + Math.sin(t * 4) * 8, y - r * 1.45 - 6); }
      if (o.poison) { outText('☠' + o.poison.turns, x - r * 1.05, y - r * 0.6, 10, '#c5ef8a', 3); }
      // 血條（含延遲白條）
      const hp = Math.max(0, o.hp / o.maxHp); if (hpLag[o.i] == null || hpLag[o.i] < hp) hpLag[o.i] = hp; else hpLag[o.i] = Math.max(hp, hpLag[o.i] - dt * 0.6);
      const bw = Math.max(26, r * 2.1), bh = o.boss ? 6 : 4, bx = x - bw / 2, by = y + r + 5;
      rrect(bx - 1, by - 1, bw + 2, bh + 2, 3); ctx.fillStyle = '#000b'; ctx.fill();
      ctx.fillStyle = '#fff9'; ctx.fillRect(bx, by, bw * hpLag[o.i], bh);
      const hc = o.team === 0 ? (hp > 0.3 ? '#5fe36a' : '#ffcf3a') : '#ff5a5a'; ctx.fillStyle = hc; ctx.fillRect(bx, by, bw * hp, bh);
      ctx.fillStyle = '#ffffff40'; ctx.fillRect(bx, by, bw * hp, bh / 2);
      if (!o.boss) {
        ctx.font = `700 10px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#000c'; ctx.lineWidth = 3;
        const nm = o.name + (o.star > 1 ? '★'.repeat(o.star) : ''); ctx.strokeText(nm, x, by + bh + 11); ctx.fillStyle = o.star >= 3 ? '#ffe066' : o.star === 2 ? '#e3f2fd' : '#fff'; ctx.fillText(nm, x, by + bh + 11);
      }
    });

    // 特效：火球/閃光
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    V.flashes.forEach(f => {
      const k = 1 - f.life / f.max, fx = CX + f.x * S, fy = CY + f.y * S, rr = Math.max(1, (f.grow ? 0.35 + 0.65 * Math.sqrt(k) : 1 - k * 0.3) * f.r * S);
      const gr = ctx.createRadialGradient(fx, fy, 0, fx, fy, rr); const a = f.life / f.max;
      if (f.fire) { gr.addColorStop(0, `rgba(255,240,200,${a})`); gr.addColorStop(0.35, `rgba(255,170,60,${a * 0.9})`); gr.addColorStop(0.7, `rgba(230,60,20,${a * 0.6})`); gr.addColorStop(1, 'rgba(120,20,0,0)'); }
      else { gr.addColorStop(0, f.col); gr.addColorStop(1, f.col + '00'); ctx.globalAlpha = a; }
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(fx, fy, rr, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    });
    ctx.restore();
    V.rings.forEach(rg => {
      const k = 1 - rg.life / rg.max, e = 1 - Math.pow(1 - k, 3), rr = (rg.inward ? (1 - k) : e) * rg.r * S;
      ctx.strokeStyle = rg.col; ctx.globalAlpha = rg.life / rg.max; ctx.lineWidth = rg.w * (rg.inward ? 1 : 1 - k * 0.6);
      ctx.beginPath(); ctx.arc(CX + rg.x * S, CY + rg.y * S, Math.max(1, rr), 0, TAU); ctx.stroke();
      if (!rg.inward && !rg.nofill) { ctx.globalAlpha *= 0.25; ctx.fillStyle = rg.col; ctx.fill(); }
    });
    ctx.globalAlpha = 1;
    // 閃電
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round';
    V.bolts.forEach(z => { const sd = z.seed + Math.floor(t * 30), a = Math.min(1, z.life * 5), x1 = CX + z.x1 * S, y1 = CY + z.y1 * S, x2 = CX + z.x2 * S, y2 = CY + z.y2 * S;
      ctx.globalAlpha = a * 0.5; ctx.strokeStyle = '#fff176'; ctx.lineWidth = 7; lightning(x1, y1, x2, y2, sd, 16); ctx.stroke();
      ctx.globalAlpha = a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; lightning(x1, y1, x2, y2, sd, 16); ctx.stroke(); });
    ctx.restore();
    // 粒子
    for (const p of V.parts) {
      const px = CX + p.x * S, py = CY + p.y * S, a = Math.min(1, p.life / p.max * 2);
      if (p.k === 'smoke') { ctx.globalAlpha = Math.min(0.35, p.life / p.max * 0.5); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(px, py, p.sz * S * (1.6 - p.life / p.max), 0, TAU); ctx.fill(); continue; }
      if (p.add) ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a;
      if (p.k === 'streak') { ctx.strokeStyle = p.col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - p.vx * S * 0.03, py - p.vy * S * 0.03); ctx.stroke(); }
      else if (p.k === 'bubble') { ctx.strokeStyle = p.col; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(px, py, p.sz, 0, TAU); ctx.stroke(); }
      else if (p.k === 'plus') { ctx.fillStyle = p.col; ctx.fillRect(px - 3, py - 1, 6, 2); ctx.fillRect(px - 1, py - 3, 2, 6); }
      else if (p.k === 'shard') { ctx.fillStyle = p.col; ctx.beginPath(); ctx.moveTo(px, py - 3); ctx.lineTo(px + 2, py); ctx.lineTo(px, py + 3); ctx.lineTo(px - 2, py); ctx.fill(); }
      else if (p.k === 'ember') { ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(px, py, 1.8, 0, TAU); ctx.fill(); }
      else { ctx.fillStyle = p.col; const s = p.sz * (0.4 + 0.6 * p.life / p.max); ctx.fillRect(px - s / 2, py - s / 2, s, s); }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    // 傷害數字
    V.texts.forEach(tx => {
      const age = tx.max - tx.life, pop = tx.tier >= 2 ? 1 + Math.max(0, 0.6 - age * 4) : 1 + Math.max(0, 0.3 - age * 3);
      const px = Math.max(tx.size * 1.3, Math.min(W - tx.size * 1.3, CX + tx.x * S)), py = CY + tx.y * S;
      ctx.save(); ctx.translate(px, py); ctx.rotate(tx.rot || 0); ctx.scale(pop, pop); ctx.globalAlpha = Math.min(1, tx.life / tx.max * 3);
      if (tx.tier === 3) { // 暴擊：背後爆星
        ctx.fillStyle = '#ffcf3a'; ctx.strokeStyle = '#7a2a00'; ctx.lineWidth = 2; ctx.beginPath(); for (let k = 0; k < 16; k++) { const a = k / 16 * TAU + age * 2, rr = k % 2 ? tx.size * 0.55 : tx.size * 1.1; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr - tx.size * 0.35); } ctx.closePath(); ctx.stroke(); ctx.fill();
      }
      outText(tx.txt, 0, 0, tx.size, tx.col, tx.tier >= 2 ? 5 : 3);
      if (tx.tier === 3) { ctx.globalAlpha *= 0.6; ctx.font = `900 ${tx.size}px ${FONT}`; ctx.fillStyle = '#fff'; ctx.save(); ctx.beginPath(); ctx.rect(-80, -tx.size, 160, tx.size * 0.45); ctx.clip(); ctx.fillText(tx.txt, 0, 0); ctx.restore(); }
      ctx.restore();
    });
    ctx.globalAlpha = 1;
    // 力道條（畫在棋子上方）
    if (aimO && ui.aim && !ui.aim.enemy) {
      const o = aimO, fp = FA.DATA.config.fullPowerAt, pw = ui.aim.power, full = pw >= fp, bw = 76, bx = CX + o.x * S - bw / 2, by = CY + o.y * S - o.r * S * 1.6 - 30;
      rrect(bx - 3, by - 3, bw + 6, 14, 7); ctx.fillStyle = '#000c'; ctx.fill(); ctx.strokeStyle = full ? '#ff5a3c' : '#ffffff44'; ctx.lineWidth = 1.5; ctx.stroke();
      const gr = ctx.createLinearGradient(bx, 0, bx + bw, 0); gr.addColorStop(0, '#7cf05a'); gr.addColorStop(0.6, '#ffb347'); gr.addColorStop(1, '#ff3b3b');
      ctx.save(); rrect(bx, by, bw, 8, 4); ctx.clip(); ctx.fillStyle = gr; ctx.fillRect(bx, by, bw * pw, 8); ctx.fillStyle = '#ffffff55'; ctx.fillRect(bx, by, bw * pw, 3);
      if (full) { ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.sin(t * 25) * 0.3})`; ctx.fillRect(bx, by, bw, 8); } ctx.restore();
      ctx.fillStyle = '#fff'; ctx.fillRect(bx + bw * fp, by - 3, 2, 14);
      outText(full ? '全力！' : '力道 ' + Math.round(pw * 100) + '%', bx + bw / 2, by - 7, full ? 15 : 12, full ? '#ffe066' : '#fff', 3);
    }
    ctx.restore();

    // ---- 不受震動影響的 UI ----
    if (V.screenFlash > 0) { ctx.fillStyle = `rgba(255,245,220,${V.screenFlash})`; ctx.fillRect(0, 0, W, H); }
    const boss = b.bodies.find(o => o.boss && o.alive && !o.temp);
    const topY = CY - b.R0 * S;
    if (boss) { // 首領大血條
      const bw = Math.min(300, W - 60), bx = W / 2 - bw / 2, by = topY - 50, hp = Math.max(0, boss.hp / boss.maxHp), lag = hpLag[boss.i] != null ? hpLag[boss.i] : hp;
      outText('👑 ' + boss.name, W / 2, by - 6, 14, '#ffd0dc', 3);
      rrect(bx - 2, by - 2, bw + 4, 14, 7); ctx.fillStyle = '#000d'; ctx.fill(); ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.save(); rrect(bx, by, bw, 10, 5); ctx.clip(); ctx.fillStyle = '#fff8'; ctx.fillRect(bx, by, bw * lag, 10);
      const gr = ctx.createLinearGradient(bx, 0, bx + bw, 0); gr.addColorStop(0, '#ff1f4a'); gr.addColorStop(1, '#ff8a3d'); ctx.fillStyle = gr; ctx.fillRect(bx, by, bw * hp, 10); ctx.fillStyle = '#ffffff40'; ctx.fillRect(bx, by, bw * hp, 4); ctx.restore();
    }
    if (V.chainShow > 0 && V.chainN >= 2) { // 連鎖計數：每次 +1 都重拍
      const n = V.chainN, pul = 1 + V.chainPulse * 0.6, fade = Math.min(1, V.chainShow * 2), size = 26 + Math.min(22, n * 3);
      const col = n >= 5 ? '#ff4dd2' : n >= 4 ? '#ff4d4d' : n >= 3 ? '#ff7a2a' : '#ffb347';
      ctx.save(); ctx.translate(W / 2, topY - 14); ctx.scale(pul, pul); ctx.rotate(Math.sin(t * 18) * 0.03 * Math.min(1, n / 4)); ctx.globalAlpha = fade;
      ctx.fillStyle = col + '33'; ctx.beginPath(); ctx.ellipse(0, -size * 0.35, size * 2.6, size * 0.75, 0, 0, TAU); ctx.fill();
      outText('連鎖 ×' + n, 0, 0, size, col, 5);
      outText(n >= 5 ? '超級連鎖！' : n >= 4 ? '大連鎖！' : n >= 3 ? '好連鎖！' : '', 0, size * 0.62, 12, '#fff', 3);
      ctx.restore();
    }
    if (V.banner) { // 橫幅：滑入
      const bn = V.banner, mx = bn.max || 1.2, age = mx - bn.life, k = Math.min(1, age * 6), out = Math.min(1, bn.life * 4), bh = 46;
      ctx.save(); ctx.globalAlpha = out;
      const gr = ctx.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#0000'); gr.addColorStop(0.2, '#000c'); gr.addColorStop(0.8, '#000c'); gr.addColorStop(1, '#0000');
      ctx.fillStyle = gr; ctx.fillRect(0, CY - bh / 2 - 8, W, bh * k);
      ctx.fillStyle = (bn.col || '#ffe066') + '99'; ctx.fillRect(W * (1 - k) / 2, CY - bh / 2 - 8, W * k, 2); ctx.fillRect(W * (1 - k) / 2, CY + bh / 2 - 10, W * k, 2);
      outText(bn.txt, W / 2 + (1 - k) * 80, CY + 7, 24, bn.col || '#fff', 5);
      ctx.restore();
    }
    if (ui.msg) { ctx.font = `bold 17px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.strokeStyle = '#000a'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeText(ui.msg, W / 2, CY + b.R0 * S + 34); ctx.fillStyle = ui.msgCol || '#fff'; ctx.fillText(ui.msg, W / 2, CY + b.R0 * S + 34); }
  };
})(globalThis);
