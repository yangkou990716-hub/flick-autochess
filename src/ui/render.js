// 戰鬥畫面：Canvas 向量繪製＋爽感回饋（頓幀、震動、粒子、分級傷害數字、層次爆炸、連鎖計數、牆面閃光）
// 角色外觀在 src/ui/sprites.js（FA.sprites），沒載入時退回簡易圓形
(function (g) {
  const FA = g.FA = g.FA || {};
  const SND = (n, k) => n && FA.sound && FA.sound.play(n, k);
  const TAU = Math.PI * 2, FONT = '-apple-system,"PingFang TC","Noto Sans TC",sans-serif';
  const V = FA.view = { trails: {}, bolts: [], parts: [], texts: [], rings: [], flashes: [], decals: [], walls: [], fx: [], ripples: [], shake: 0, hitstop: 0, banner: null, cutin: null, edge: null, shrinkT: 0, chainShow: 0, chainN: 0, chainPulse: 0, screenFlash: 0 };
  let cv, ctx, W, H, dpr, S, CX, CY, bgCache = null, lastB = null, causA = null, pillarCache = {};
  const dead = {}, hpLag = {}, spawnIn = {}, ghosts = {}, ripT = {}, pHit = {}, emitT = {}, vis = {}; // vis：棋子的視覺變形（壓扁回彈、跳起高度），不影響物理
  const BGP = 12; // 背景快取外擴（震動時不露邊）
  // 9 種大招的配色／圖示
  const ULT = {
    nova: { col: '#ff8a3d', c2: '#fff3c4', rgb: '255,138,61', icon: '💥' },
    vortex: { col: '#9b6bff', c2: '#e3d6ff', rgb: '155,107,255', icon: '🌀' },
    bulwark: { col: '#ffd54f', c2: '#fff8e1', rgb: '255,213,79', icon: '🛡️' },
    phase: { col: '#4dfcff', c2: '#e0ffff', rgb: '77,252,255', icon: '💨' },
    quake: { col: '#e09a4a', c2: '#ffe0b2', rgb: '224,154,74', icon: '🌋' },
    plague: { col: '#8bd346', c2: '#e6ffc2', rgb: '139,211,70', icon: '☣️' },
    ricochet: { col: '#ff4dd2', c2: '#ffd1f3', rgb: '255,77,210', icon: '🔁' },
    overdrive: { col: '#ff3b3b', c2: '#fff176', rgb: '255,59,59', icon: '⚡' },
    heal: { col: '#fff0a0', c2: '#ffffff', rgb: '235,180,50', icon: '✨' }
  };
  const ULT0 = ULT.nova;

  V.init = c => { cv = c; ctx = c.getContext('2d'); V.resize(); addEventListener('resize', V.resize); };
  V.resize = () => {
    dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); pillarCache = {}; causA = null;
    const A = FA.DATA.config.arena; S = Math.min((W - 28) / (A.w + 10), (H - 190) / (A.h + 10)); CX = W / 2; CY = H / 2 + 18; bgCache = null;
  };
  V.toWorld = (x, y) => ({ x: (x - CX) / S, y: (y - CY) / S });
  V.reset = () => {
    V.trails = {}; V.bolts = []; V.parts = []; V.texts = []; V.rings = []; V.flashes = []; V.decals = []; V.walls = []; V.fx = []; V.ripples = [];
    V.shake = 0; V.hitstop = 0; V.banner = null; V.cutin = null; V.edge = null; V.shrinkT = 0; V.chainN = 0; V.chainShow = 0; V.chainPulse = 0; V.screenFlash = 0;
    [dead, hpLag, spawnIn, ghosts, ripT, pHit, emitT, vis].forEach(o => { for (const k in o) delete o[k]; });
  };
  // 測試用：己方可彈棋子的螢幕座標
  V._own = () => { const b = lastB; if (!b) return null; const o = b.bodies.find(q => q.alive && !q.temp && q.team === 0 && !q.stunned); return o ? [CX + o.x * S, CY + o.y * S] : null; };
  Object.defineProperty(V, '_lastB', { get: () => lastB });
  V._vis = vis; // 測試用：視覺變形狀態

  // ---- 粒子 ----
  const MAXP = 520;
  const add = p => { if (V.parts.length < MAXP) V.parts.push(p); };
  const burst = (x, y, col, n, sp, o) => { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = sp * (0.3 + Math.random()); add(Object.assign({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, max: 0.9, col, k: 'dot', sz: 2 + Math.random() * 2.5, drag: 0.9 }, o)); } };
  const sparks = (x, y, col, n, sp) => burst(x, y, col, n, sp, { k: 'streak', life: 0.25 + Math.random() * 0.2, max: 0.45, drag: 0.86, add: true });
  const smoke = (x, y, r, n) => { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, d = Math.random() * r * 0.5, s = 30 + Math.random() * 60; add({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: 0.7 + Math.random() * 0.6, max: 1.3, col: '#5a5068', k: 'smoke', sz: r * (0.18 + Math.random() * 0.15), drag: 0.95 }); } };
  const vib = ms => { try { if (!(FA.settings && FA.settings.vibrate === false)) navigator.vibrate && navigator.vibrate(ms); } catch (e) { } };
  const ring = (x, y, r, col, life, o) => V.rings.push(Object.assign({ x, y, r, life, max: life, col, w: 4 }, o));

  const ripple = (x, y, r, life, a) => { if (V.ripples.length < 48) V.ripples.push({ x, y, r, life, max: life, a: a || 0.5 }); };
  const fx = o => { if (V.fx.length < 60) V.fx.push(o); };
  const nearPillar = (b, x, y) => { let k = -1, bd = 1e9; (b.pillars || []).forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y) - p.r; if (d < bd) { bd = d; k = i; } }); return bd < 30 ? k : -1; };
  const textPush = (x, y, txt, col, size, life, o) => V.texts.push(Object.assign({ x, y, txt, life, max: life, col, size, tier: 1, vy: 32 }, o));

  // ---- 大招發動特效 ----
  function ultBurst(b, o, type, x, y) {
    const U = ULT[type] || ULT0, col = U.col, c2 = U.c2;
    V.flashes.push({ x, y, r: 90, life: 0.18, max: 0.18, col: '#ffffff' });
    ring(x, y, 150, col, 0.6, { w: 6 }); ring(x, y, 110, c2, 0.45, { w: 3, nofill: true, dl: 0.12 });
    if (type === 'nova') {
      V.flashes.push({ x, y, r: 130, life: 0.5, max: 0.5, col: '#ff7a1a', fire: true, grow: true });
      for (let k = 0; k < 3; k++) ring(x, y, 120 + k * 60, k ? '#ffb347' : '#fff3c4', 0.55, { w: 5 - k, nofill: k > 0, dl: k * 0.1 });
      sparks(x, y, '#ffd27a', 26, 520); burst(x, y, '#ff5a1f', 16, 160, { k: 'ember', life: 1, max: 1, drag: 0.96, add: true });
    } else if (type === 'vortex') {
      for (let k = 0; k < 3; k++) ring(x, y, 200 - k * 40, k ? '#c9b3ff' : '#7a4dff', 0.6, { inward: true, w: 4 - k, dl: k * 0.12 });
      for (let k = 0; k < 36; k++) { const a = k / 36 * TAU, d = 120 + Math.random() * 60; add({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: -Math.cos(a) * d * 1.6 - Math.sin(a) * 260, vy: -Math.sin(a) * d * 1.6 + Math.cos(a) * 260, life: 0.55, max: 0.55, col: k % 3 ? '#b28cff' : '#fff', k: 'streak', drag: 0.94, add: true }); }
    } else if (type === 'bulwark') {
      b.bodies.forEach(q => { if (q.alive && !q.temp && q.team === o.team) { fx({ k: 'hex', x: q.x, y: q.y, r: q.r * 1.7, life: 0.9, max: 0.9, col }); sparks(q.x, q.y, '#fff8e1', 6, 200); } });
      burst(x, y, '#ffe082', 14, 240, { k: 'shard', add: true });
    } else if (type === 'phase') {
      for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; add({ x: x + Math.cos(a) * 20, y: y + Math.sin(a) * 20, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, life: 0.22, max: 0.22, col: '#bffcff', k: 'streak', drag: 0.9, add: true }); }
      V.flashes.push({ x, y, r: 70, life: 0.25, max: 0.25, col: '#4dfcff' });
    } else if (type === 'quake') {
      fx({ k: 'crack', x, y, r: 150, life: 1.4, max: 1.4, seed: Math.random() * 1000, n: 9 });
      smoke(x, y, 120, 10); burst(x, y, '#a1774a', 18, 300, { k: 'shard', drag: 0.9 }); V.shake = Math.max(V.shake, 20); vib(40);
    } else if (type === 'plague') {
      for (let k = 0; k < 12; k++) { const a = Math.random() * TAU, d = Math.random() * 60, s = 40 + Math.random() * 80; add({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.1, max: 1.1, col: '#6fae2a', k: 'smoke', sz: 30 + Math.random() * 20, drag: 0.95 }); }
      burst(x, y, '#c5ef8a', 16, 180, { k: 'bubble', life: 1, max: 1, drag: 0.93 });
    } else if (type === 'ricochet') {
      for (let k = 0; k < 4; k++) ring(x, y, 70 + k * 35, k % 2 ? '#ffd1f3' : '#ff4dd2', 0.4, { w: 3, nofill: true, dl: k * 0.07 });
      sparks(x, y, '#ff8ae6', 22, 480);
    } else if (type === 'overdrive') {
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + Math.random() * 0.5, d = 90 + Math.random() * 60; V.bolts.push({ x1: x, y1: y, x2: x + Math.cos(a) * d, y2: y + Math.sin(a) * d, life: 0.35, seed: Math.random() * 1000 }); }
      sparks(x, y, '#fff176', 18, 420); burst(x, y, '#ff3b3b', 12, 260, { add: true });
    } else if (type === 'heal') {
      fx({ k: 'beam', x, y, r: 46, life: 0.9, max: 0.9, rgb: '255,240,170' });
      burst(x, y, '#fff6c2', 18, 160, { k: 'plus', vy: -90, drag: 0.94, life: 1, max: 1 }); burst(x, y, '#ffffff', 10, 220, { k: 'feather', life: 1.2, max: 1.2, drag: 0.95 });
    }
  }
  // 大招移動中：光暈＋拖尾粒子（每幀呼叫，依 dt 噴發）
  function ultAura(o, x, y, r, t, dt) {
    const type = o.ultOn, U = ULT[type] || ULT0, sp = Math.hypot(o.vx, o.vy), mv = sp > 40;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const pul = 1 + Math.sin(t * 12) * 0.08, gr = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 2 * pul);
    gr.addColorStop(0, `rgba(${U.rgb},0.45)`); gr.addColorStop(1, `rgba(${U.rgb},0)`); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * 2 * pul, 0, TAU); ctx.fill();
    ctx.strokeStyle = U.col; ctx.lineWidth = 2;
    if (type === 'vortex') { for (let k = 0; k < 3; k++) { const a0 = t * 7 + k * TAU / 3; ctx.globalAlpha = 0.8; ctx.beginPath(); for (let j = 0; j <= 10; j++) { const f = j / 10, a = a0 + f * 2.2, rr = r * (1.9 - f * 0.9); j ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.stroke(); } }
    else if (type === 'bulwark') { ctx.globalAlpha = 0.85; ctx.lineWidth = 3; hexPath(x, y, r * 1.55, t * 1.5); ctx.stroke(); ctx.globalAlpha = 0.35; ctx.lineWidth = 1.5; hexPath(x, y, r * 1.85, -t); ctx.stroke(); }
    else if (type === 'overdrive') { ctx.lineJoin = 'round'; const sd = Math.floor(t * 20) * 7.3 + o.i; for (let k = 0; k < 3; k++) { const a = sd * 1.7 + k * 2.1, a2 = a + 0.9; ctx.globalAlpha = 0.9; ctx.strokeStyle = k ? '#fff176' : '#ffffff'; ctx.lineWidth = 1.6; lightning(x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 1.1, x + Math.cos(a2) * r * 1.7, y + Math.sin(a2) * r * 1.7, sd + k * 31, 10); ctx.stroke(); } }
    else if (type === 'heal') { ctx.globalAlpha = 0.9; ctx.strokeStyle = '#fff8d0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y - r * 1.35, r * 0.6, r * 0.18, 0, 0, TAU); ctx.stroke(); }
    else if (type === 'nova') { ctx.globalAlpha = 0.5 + Math.sin(t * 30) * 0.2; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r * (1.3 + Math.sin(t * 18) * 0.08), 0, TAU); ctx.stroke(); }
    else if (type === 'quake') { ctx.globalAlpha = 0.8; ctx.lineWidth = 3; ctx.setLineDash([10, 6]); ctx.lineDashOffset = t * 80; ctx.beginPath(); ctx.arc(x + (Math.random() - 0.5) * 2, y + (Math.random() - 0.5) * 2, r * 1.4, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0; }
    else if (type === 'plague') { ctx.fillStyle = '#9ccc65'; for (let k = 0; k < 6; k++) { const a = t * 2.5 + k * TAU / 6, d = r * (1.45 + Math.sin(t * 4 + k) * 0.1); ctx.globalAlpha = 0.75; ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.14, 0, TAU); ctx.fill(); } }
    else if (type === 'phase') { ctx.globalAlpha = 0.7; ctx.lineWidth = 1.5; for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.arc(x, y, r * (1.25 + k * 0.25 + ((t * 3) % 1) * 0.2), 0, TAU); ctx.stroke(); } }
    else if (type === 'ricochet') { ctx.globalAlpha = 0.85; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 60; ctx.beginPath(); ctx.arc(x, y, r * 1.45, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0; }
    ctx.restore();
    if (!mv || !dt) return;
    // 噴粒子（節流）
    const k = 'u' + o.i; emitT[k] = (emitT[k] || 0) + dt; if (emitT[k] < 0.025) return; emitT[k] = 0;
    const bx = o.x - o.vx / sp * o.r * 0.8, by = o.y - o.vy / sp * o.r * 0.8, j = () => (Math.random() - 0.5) * o.r;
    if (type === 'nova') { add({ x: bx + j(), y: by + j(), vx: j() * 3, vy: j() * 3, life: 0.5, max: 0.5, col: Math.random() < 0.5 ? '#ffb347' : '#ff5a1f', k: 'ember', drag: 0.9, add: true }); }
    else if (type === 'vortex') { const a = Math.random() * TAU, d = o.r * 2.4; add({ x: o.x + Math.cos(a) * d, y: o.y + Math.sin(a) * d, vx: -Math.cos(a) * d * 4 + o.vx * 0.8, vy: -Math.sin(a) * d * 4 + o.vy * 0.8, life: 0.25, max: 0.25, col: '#c9b3ff', k: 'streak', drag: 1, add: true }); }
    else if (type === 'bulwark') { add({ x: bx + j(), y: by + j(), vx: j() * 2, vy: j() * 2, life: 0.6, max: 0.6, col: '#ffe082', k: 'shard', drag: 0.9, add: true }); }
    else if (type === 'phase') { add({ x: o.x + j() * 1.5, y: o.y + j() * 1.5, vx: -o.vx * 0.3, vy: -o.vy * 0.3, life: 0.2, max: 0.2, col: '#bffcff', k: 'streak', drag: 0.9, add: true }); }
    else if (type === 'quake') { add({ x: bx + j(), y: by + j(), vx: j() * 4, vy: j() * 4, life: 0.6, max: 0.6, col: '#a1774a', k: 'shard', drag: 0.88 }); if (Math.random() < 0.15) fx({ k: 'crack', x: o.x, y: o.y, r: 40, life: 1, max: 1, seed: Math.random() * 1000, n: 4 }); }
    else if (type === 'plague') { add({ x: bx + j(), y: by + j(), vx: j(), vy: j() - 10, life: 0.9, max: 0.9, col: '#6fae2a', k: 'smoke', sz: 14 + Math.random() * 10, drag: 0.95 }); if (Math.random() < 0.4) add({ x: bx + j(), y: by + j(), vx: j(), vy: -40, life: 0.7, max: 0.7, col: '#c5ef8a', k: 'bubble', sz: 2 + Math.random() * 3, drag: 0.95 }); }
    else if (type === 'ricochet') { add({ x: bx + j(), y: by + j(), vx: j() * 3, vy: j() * 3, life: 0.35, max: 0.35, col: Math.random() < 0.5 ? '#ff4dd2' : '#fff176', k: 'dot', sz: 3, drag: 0.9, add: true }); }
    else if (type === 'overdrive') { add({ x: bx + j(), y: by + j(), vx: j() * 5, vy: j() * 5, life: 0.3, max: 0.3, col: '#fff176', k: 'streak', drag: 0.85, add: true }); }
    else if (type === 'heal') { add({ x: bx + j(), y: by + j(), vx: j(), vy: -50, life: 0.8, max: 0.8, col: '#fff6c2', k: Math.random() < 0.5 ? 'plus' : 'feather', drag: 0.95, add: true }); }
  }
  function hexPath(x, y, r, rot) { ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = rot + k * Math.PI / 3; k ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); }

  // 大招特寫：畫面暗化（聚光在施放者）＋斜帶大字
  function drawCutin(c, t) {
    const U = ULT[c.type] || ULT0, age = c.max - c.life, fin = Math.min(1, age / 0.1), dark = fin * Math.max(0, Math.min(1, (0.8 - age) / 0.3)), bandA = fin * Math.min(1, c.life / 0.25);
    const sx = CX + c.x * S, sy = CY + c.y * S, foe = c.team !== 0, dir = foe ? -1 : 1;
    ctx.save();
    if (dark > 0) { const g = ctx.createRadialGradient(sx, sy, 24, sx, sy, Math.max(W, H) * 0.75); g.addColorStop(0, 'rgba(4,2,14,0)'); g.addColorStop(0.12, 'rgba(4,2,14,0.5)'); g.addColorStop(1, 'rgba(4,2,14,0.78)'); ctx.globalAlpha = dark; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = U.col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, 34 + age * 60, 0, TAU); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; }
    const slide = 1 - Math.pow(1 - Math.min(1, age / 0.22), 3), by = sy < CY ? CY + 110 : CY - 110, bh = 64;
    ctx.globalAlpha = bandA; ctx.translate(W / 2 - (1 - slide) * W * dir, by); ctx.rotate(-0.07 * dir);
    const g = ctx.createLinearGradient(-W * 0.7, 0, W * 0.7, 0); g.addColorStop(0, `rgba(${U.rgb},0)`); g.addColorStop(0.2, `rgba(${U.rgb},0.88)`); g.addColorStop(0.8, `rgba(${U.rgb},0.88)`); g.addColorStop(1, `rgba(${U.rgb},0)`);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(-W, -bh / 2 - 4, W * 2, bh + 8); ctx.fillStyle = g; ctx.fillRect(-W, -bh / 2, W * 2, bh);
    ctx.fillStyle = '#ffffffcc'; ctx.fillRect(-W, -bh / 2, W * 2, 2.5); ctx.fillRect(-W, bh / 2 - 2.5, W * 2, 2.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let k = 0; k < 12; k++) { const lx = ((k * 137 + age * 1400 * dir) % (W * 2) + W * 2) % (W * 2) - W, ly = -bh / 2 + 6 + (k * 23 % (bh - 12)); ctx.moveTo(lx, ly); ctx.lineTo(lx - 40 * dir, ly); } ctx.stroke();
    const pop = 1 + Math.max(0, 0.18 - age) * 2.5;
    outText(foe ? '敵方大招' : '我方大招', 0, -bh / 2 + 15, 11, foe ? '#ffd0d6' : '#e8f8ff', 3);
    ctx.scale(pop, pop); outText(U.icon + ' ' + c.name, 0, 20, 30, U.c2, 6);
    ctx.restore();
  }

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
      if (e.t === 'dmg') { SND(e.kind === 'hit' ? (e.amt >= 45 ? 'hit' : 'hitS') : e.kind === 'poison' ? 'poison' : e.kind === 'spike' ? null : 'bump');
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
      } else if (e.t === 'pull') { const mv = b.bodies[b.mover], ut = mv && mv.ultOn;
        if (ut === 'vortex') { fx({ k: 'vortex', x: e.x, y: e.y, r: e.r, life: 1, max: 1 }); for (let k = 0; k < 30; k++) { const a = Math.random() * TAU, d = e.r * (0.5 + Math.random() * 0.5); add({ x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d, vx: -Math.cos(a) * d * 2.2 - Math.sin(a) * 200, vy: -Math.sin(a) * d * 2.2 + Math.cos(a) * 200, life: 0.5, max: 0.5, col: '#c9b3ff', k: 'streak', drag: 0.97, add: true }); } V.shake = Math.max(V.shake, 10); }
        else if (ut === 'plague') { ring(e.x, e.y, e.r, '#8bd346', 0.7, { w: 5 }); for (let k = 0; k < 14; k++) { const a = Math.random() * TAU, s = 60 + Math.random() * 160; add({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.3, max: 1.3, col: '#5e9e22', k: 'smoke', sz: 34 + Math.random() * 20, drag: 0.96 }); } burst(e.x, e.y, '#c5ef8a', 18, 260, { k: 'bubble', life: 1, max: 1, drag: 0.93 }); }
        else { ring(e.x, e.y, e.r, '#6b8cff', 0.45, { inward: true }); ring(e.x, e.y, e.r * 0.7, '#a9b8ff', 0.35, { inward: true, w: 2 }); } }
      else if (e.t === 'launch') SND('launch');
      else if (e.t === 'freeze') { SND('freeze'); V.texts.push({ x: e.x, y: e.y - 24, txt: '❄ 冰凍', life: 0.9, max: 0.9, col: '#8df', size: 14, tier: 1, vy: 30 }); burst(e.x, e.y, '#dff4ff', 14, 200); ring(e.x, e.y, 34, '#bdf', 0.3); }
      else if (e.t === 'poison') { SND('poison'); burst(e.x, e.y, '#9ccc65', 8, 110, { k: 'bubble', life: 0.8, max: 0.8, drag: 0.92 }); }
      else if (e.t === 'bolt') { SND('zap'); V.bolts.push({ x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, life: 0.28, seed: Math.random() * 1000 }); sparks(e.x2, e.y2, '#fff59d', 6, 260); }
      else if (e.t === 'heal') { SND('heal'); V.texts.push({ x: e.x, y: e.y - 22, txt: '+治療', life: 0.9, max: 0.9, col: '#7f7', size: 14, tier: 1, vy: 35 }); burst(e.x, e.y, '#7f7', 10, 120, { k: 'plus', vy: -60, drag: 0.94 }); }
      else if (e.t === 'revive') { SND('revive'); V.banner = { txt: '復活！', life: 1.1, max: 1.1, col: '#fff3c4' }; burst(e.x, e.y, '#fff3c4', 30, 300, { add: true }); ring(e.x, e.y, 90, '#fff3c4', 0.6); }
      else if (e.t === 'ult') {
        const mv = b.bodies[b.mover], o = mv && mv.ultOn && mv.team === e.team ? mv : b.bodies.find(q => q.ultOn && q.team === e.team), type = o ? o.ultOn : 'nova';
        SND('ult_' + type);
        V.cutin = { name: e.name, team: e.team, type, x: e.x, y: e.y, life: 1.15, max: 1.15 };
        V.shake = Math.max(V.shake, 10); V.hitstop = Math.max(V.hitstop, 0.5); vib(35); ultBurst(b, o || { team: e.team }, type, e.x, e.y);
      }
      else if (e.t === 'ring') { sparks(e.x, e.y, '#7fd3ff', 10, 320); V.texts.push({ x: e.x, y: e.y - 22, txt: '加速！攻擊+20%', life: 0.8, max: 0.8, col: '#7fd3ff', size: 13, tier: 1, vy: 35 }); }
      else if (e.t === 'movecost') { const own = e.team === 0, col = own ? '#ff5a5a' : '#5dff9a'; SND(own ? 'moveLose' : 'moveGain');
        V.texts.push({ x: e.x, y: e.y - 34, txt: `💀 動數 -${e.n}`, life: 1.7, max: 1.7, col, size: 24, tier: 2, vy: 22, pill: col });
        ring(e.x, e.y, 70, col, 0.5, { w: 5, nofill: true }); V.edge = { col: own ? '255,60,60' : '80,255,150', life: 0.7, max: 0.7 }; V.shake = Math.max(V.shake, 8); }
      else if (e.t === 'respawn') { SND('revive'); const o = b.bodies.find(q => q.alive && q.sx === e.x && q.sy === e.y);
        if (o) { spawnIn[o.i] = 0.7; delete dead[o.i]; hpLag[o.i] = 1; V.trails[o.i] = []; delete ghosts[o.i]; }
        fx({ k: 'beam', x: e.x, y: e.y, r: (o ? o.r : 26) * 1.1, life: 1, max: 1, rgb: e.team === 0 ? '90,210,255' : '255,110,110' });
        ring(e.x, e.y, 60, e.team === 0 ? '#7cf' : '#f87', 0.5, { w: 4, dl: 0.25 }); sparks(e.x, e.y, '#fff', 10, 260); ripple(e.x, e.y, 50, 0.9, 0.7);
        burst(e.x, e.y, e.team === 0 ? '#bdf' : '#fbb', 14, 60, { vy: -120, k: 'ember', life: 0.9, max: 0.9, drag: 0.97, add: true });
        textPush(e.x, e.y - 40, '復活', e.team === 0 ? '#9fe3ff' : '#ffb0b0', 15, 1, { vy: 26 }); }
      else if (e.t === 'death') { SND('death'); burst(e.x, e.y, e.color, 26, 380); sparks(e.x, e.y, '#fff', 12, 480); ring(e.x, e.y, 80, e.team === 0 ? '#7cf' : '#f87', 0.45, { w: 5 }); V.flashes.push({ x: e.x, y: e.y, r: 50, life: 0.15, max: 0.15, col: '#ffffff' }); V.hitstop = 0.1; V.shake = 14; vib(30); }
      else if (e.t === 'combo') { SND('combo'); V.texts.push({ x: e.x, y: e.y - 34, txt: '聯動！' + e.name, life: 1.5, max: 1.5, col: '#ffe066', size: 22, tier: 2, vy: 25 }); ring(e.x, e.y, 120, '#ffe066', 0.5, { w: 5 }); sparks(e.x, e.y, '#ffe066', 20, 420); V.hitstop = 0.12; V.shake = 12; V.screenFlash = 0.15; }
      else if (e.t === 'shieldbreak') { ring(e.x, e.y, 40, '#8ef', 0.3); burst(e.x, e.y, '#bff', 10, 220, { k: 'shard' }); }
      else if (e.t === 'wall') { SND(e.kind === 'ring' ? 'ring' : e.kind === 'spike' ? 'spike' : 'wall');
        if (e.kind === 'ring' || e.kind === 'spike') { const k = nearPillar(b, e.x, e.y); if (k >= 0) pHit[k] = 0.6; if (e.kind === 'spike') { sparks(e.x, e.y, '#ff6a7a', 9, 300); ring(e.x, e.y, 34, '#ff3d5a', 0.3, { w: 3, nofill: true }); } else ripple(e.x, e.y, 40, 0.6, 0.7); }
        else { sparks(e.x, e.y, '#e0dcff', 5, 200); V.walls.push({ x: e.x, y: e.y, life: 0.4, max: 0.4 }); if (V.walls.length > 12) V.walls.shift(); ripple(e.x, e.y, 30, 0.5, 0.5); }
        const mv = b.bodies[b.mover]; if (mv && mv.ultOn === 'ricochet') { sparks(e.x, e.y, '#ff8ae6', 12, 420); ring(e.x, e.y, 50, '#ff4dd2', 0.3, { w: 4, nofill: true }); textPush(e.x, e.y - 16, '反彈 ×' + (mv.wallHits || 1), '#ff8ae6', 15 + Math.min(10, mv.wallHits || 1), 0.7, { tier: 2 }); } }
      else if (e.t === 'bump') { SND('imp', e.s); if (e.s > 150) { sparks(e.x, e.y, '#fff', Math.min(10, e.s / 70 | 0), 120 + e.s * 0.4); ring(e.x, e.y, 18 + Math.min(40, e.s / 15), '#ffffff', 0.18, { w: 2, nofill: true }); } if (e.s > 300) V.shake = Math.max(V.shake, 4); }
      else if (e.t === 'zap') { SND('zap'); ring(e.x, e.y, 40, '#ffe066', 0.3); burst(e.x, e.y, '#ffe066', 10, 220, { add: true }); V.bolts.push({ x1: e.x, y1: e.y - 160, x2: e.x, y2: e.y, life: 0.22, seed: Math.random() * 1000 }); }
      else if (e.t === 'split' || e.t === 'stick' || e.t === 'pierce') { if (e.t === 'pierce') SND('imp', 400); V.texts.push({ x: e.x, y: e.y - 22, txt: { split: '分裂！', stick: '黏住！', pierce: '穿透！' }[e.t], life: 0.8, max: 0.8, col: '#cff', size: 14, tier: 1, vy: 35 }); }
      else if (e.t === 'bossSplit') { SND('boss'); V.banner = { txt: '首領分裂了！', life: 1.4, max: 1.4, col: '#ff8fb0' }; V.shake = 16; burst(e.x, e.y, '#c9a', 40, 400); ring(e.x, e.y, 140, '#ff4d6d', 0.5, { w: 6 }); }
      else if (e.t === 'expose') { V.texts.push({ x: e.x, y: e.y - 22, txt: '破甲！', life: 0.8, max: 0.8, col: '#ffb74d', size: 14, tier: 1, vy: 35 }); sparks(e.x, e.y, '#ffb74d', 8, 300); }
      else if (e.t === 'boost' && b.bodies[b.mover] && b.bodies[b.mover].ultOn === 'overdrive') { SND('zap'); textPush(e.x, e.y - 24, '超載衝刺！', '#ff6a5a', 17, 0.9, { tier: 2 }); for (let k = 0; k < 4; k++) { const a = Math.random() * TAU; V.bolts.push({ x1: e.x, y1: e.y, x2: e.x + Math.cos(a) * 80, y2: e.y + Math.sin(a) * 80, life: 0.3, seed: Math.random() * 1000 }); } ring(e.x, e.y, 80, '#ff3b3b', 0.35, { w: 4 }); V.shake = Math.max(V.shake, 8); }
      else if (e.t === 'boost') { V.texts.push({ x: e.x, y: e.y - 22, txt: '加速！', life: 0.8, max: 0.8, col: '#cff', size: 14, tier: 1, vy: 35 }); sparks(e.x, e.y, '#cff', 8, 300); }
      // ---- 羈絆抽獎 ----
      else if (e.t === 'lotto') {
        const LR = FA.DATA.lotteryRules, big = e.prize === 'shot' || e.prize === 'gold', none = e.prize === 'none';
        const txt = '🎰 ' + (e.prize === 'dmg' ? `傷害+${Math.round(e.val * 100)}%` : (e.prize === 'stack' ? '小獎！' : '') + LR.name[e.prize]);
        V.texts.push({ x: e.x, y: e.y - 30, txt, life: none ? 0.7 : 1.4, max: none ? 0.7 : 1.4, col: none ? '#9a97b0' : big ? '#ffd54f' : '#b2ff59', size: none ? 11 : big ? 19 : 14, tier: big ? 2 : 1, vy: 28 });
        if (big) { SND('combo'); ring(e.x, e.y, 70, '#ffd54f', 0.45, { w: 4 }); sparks(e.x, e.y, '#ffd54f', 16, 360); if (e.prize === 'shot') V.banner = { txt: '🎰 大獎！多 1 動', life: 1.2, max: 1.2, col: '#ffd54f' }; }
        else if (!none) sparks(e.x, e.y, '#b2ff59', 6, 220);
      }
      // ---- 次元撲滿 ----
      else if (e.t === 'piggold') { SND('coin'); V.texts.push({ x: e.x, y: e.y - 26, txt: `+${e.n}💰`, life: 1.1, max: 1.1, col: '#ffd54f', size: 16, tier: 1, vy: 40 }); burst(e.x, e.y, '#ffd54f', 10, 220, { k: 'ember', life: 0.8, max: 0.8, add: true }); }
      else if (e.t === 'pighop') { V.texts.push({ x: e.x, y: e.y - 24, txt: '蹦！', life: 0.6, max: 0.6, col: '#f8a5c2', size: 12, tier: 1, vy: 30 }); ring(e.x, e.y, 30, '#f8a5c2', 0.25, { w: 2, nofill: true }); }
      else if (e.t === 'pigflee') { burst(e.x, e.y, '#ffe0ec', 6, 160); }
      else if (e.t === 'over') SND(e.winner === 0 ? 'win' : 'lose');
      else if (e.t === 'fullpower') { SND('full'); V.texts.push({ x: e.x, y: e.y - 42, txt: '全力！', life: 1, max: 1, col: '#ff5', size: 24, tier: 2, vy: 30 }); ring(e.x, e.y, 70, '#ffe066', 0.35, { w: 5 }); sparks(e.x, e.y, '#ffe066', 14, 380); V.shake = Math.max(V.shake, 6); }
      else if (e.t === 'shrink') { V.banner = { txt: '⚠ 場地縮小！', life: 1.2, max: 1.2, col: '#ff8a8a' }; V.shrinkT = 1.4; V.shake = Math.max(V.shake, 6); }
      else if (e.t === 'round') V.banner = { txt: e.extra ? '加時！' : `第 ${e.n} 輪${e.start ? (e.team === 0 ? '・我方先手' : '・敵方先手') : ''}`, life: e.start ? 1.4 : 1.0, max: e.start ? 1.4 : 1.0 };
      else if (e.t === 'skip') V.banner = { txt: (e.team === 0 ? '我方' : '敵方') + '全員暈眩，跳過', life: 1.2, max: 1.2 };
    }
    b.events = [];
  };

  V.update = dt => {
    for (const p of V.parts) { p.x += p.vx * dt; p.y += p.vy * dt; const d = Math.pow(p.drag, dt * 60); p.vx *= d; p.vy *= d; if (p.k === 'ember') p.vy -= 40 * dt; p.life -= dt; }
    V.parts = V.parts.filter(p => p.life > 0);
    for (const t of V.texts) { t.y -= t.vy * dt; t.life -= dt; } V.texts = V.texts.filter(t => t.life > 0);
    const dec = a => { for (const r of a) r.life -= dt; return a.filter(r => r.life > 0); };
    for (const r of V.rings) if (r.dl > 0) { r.dl -= dt; r.life += dt; }
    V.rings = dec(V.rings); V.bolts = dec(V.bolts); V.flashes = dec(V.flashes); V.decals = dec(V.decals); V.walls = dec(V.walls); V.fx = dec(V.fx); V.ripples = dec(V.ripples);
    for (const k in spawnIn) if ((spawnIn[k] -= dt) <= 0) delete spawnIn[k];
    for (const k in pHit) if ((pHit[k] -= dt) <= 0) delete pHit[k];
    if (V.cutin && (V.cutin.life -= dt) <= 0) V.cutin = null;
    if (V.edge && (V.edge.life -= dt) <= 0) V.edge = null;
    V.shrinkT = Math.max(0, V.shrinkT - dt);
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

  // ---- 場地背景（快取）：水上擂台 ----
  const mix = (a, c, k) => FA.sprites ? FA.sprites.mix(a, c, k) : a;
  function theme(b) {
    const boss = b.bodies.find(o => o.boss);
    if (boss) return { key: 'boss' + boss.color, w1: mix('#7a2350', boss.color, 0.2), w2: '#4a1233', w3: '#22071a', tile: '#3b2532', tile2: '#47303d', grout: '#1f1119', rim: '#ffb3c4', glow: '#ff1f4a', bg1: '#24060f', bg2: '#0b0307', buoy: ['#ff4d6d', '#ffe0e6'] };
    return { key: 'n', w1: '#2a9fd6', w2: '#1670ad', w3: '#0c4a7e', tile: '#2f5568', tile2: '#376074', grout: '#1a3040', rim: '#e9fbff', glow: '#39c6ff', bg1: '#13233a', bg2: '#070e18', buoy: ['#ffd54f', '#ffffff'] };
  }
  function buildBg(b, th) {
    const P = BGP, c = document.createElement('canvas'); c.width = (W + P * 2) * dpr; c.height = (H + P * 2) * dpr; const x = c.getContext('2d'); x.scale(dpr, dpr); x.translate(P, P);
    const hw = b.hw * S, hh = b.hh * S, hw0 = b.hw0 * S, hh0 = b.hh0 * S, L = CX - hw, T = CY - hh, L0 = CX - hw0, T0 = CY - hh0, rad = 18, D = 20;
    const rr = (xx, yy, w, h, r) => { x.beginPath(); x.moveTo(xx + r, yy); x.arcTo(xx + w, yy, xx + w, yy + h, r); x.arcTo(xx + w, yy + h, xx, yy + h, r); x.arcTo(xx, yy + h, xx, yy, r); x.arcTo(xx, yy, xx + w, yy, r); x.closePath(); };
    const bg = x.createRadialGradient(CX, CY, hw0, CX, CY, Math.max(W, H)); bg.addColorStop(0, th.bg1); bg.addColorStop(1, th.bg2); x.fillStyle = bg; x.fillRect(-P, -P, W + P * 2, H + P * 2);
    let sd = 7; const rnd = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
    // 池邊磁磚
    x.save(); x.shadowColor = th.glow; x.shadowBlur = 26; rr(L0 - D, T0 - D, hw0 * 2 + D * 2, hh0 * 2 + D * 2, rad + D * 0.6); x.fillStyle = th.grout; x.fill(); x.restore();
    x.save(); rr(L0 - D, T0 - D, hw0 * 2 + D * 2, hh0 * 2 + D * 2, rad + D * 0.6); x.clip();
    const ts = 10;
    for (let yy = T0 - D; yy < T0 + hh0 * 2 + D; yy += ts) for (let xx = L0 - D; xx < L0 + hw0 * 2 + D; xx += ts) {
      x.fillStyle = (Math.round((xx - L0) / ts) + Math.round((yy - T0) / ts)) & 1 ? th.tile : th.tile2; x.fillRect(xx + 0.6, yy + 0.6, ts - 1.2, ts - 1.2);
      if (rnd() < 0.5) { x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(xx + 0.6, yy + 0.6, ts - 1.2, 1.4); }
    }
    x.restore();
    rr(L0 - D, T0 - D, hw0 * 2 + D * 2, hh0 * 2 + D * 2, rad + D * 0.6); x.lineWidth = 2; x.strokeStyle = '#0007'; x.stroke();
    // 水
    x.save(); rr(L0, T0, hw0 * 2, hh0 * 2, rad); x.clip();
    const wg = x.createRadialGradient(CX, CY - hh0 * 0.2, 0, CX, CY, Math.hypot(hw0, hh0)); wg.addColorStop(0, th.w1); wg.addColorStop(0.6, th.w2); wg.addColorStop(1, th.w3); x.fillStyle = wg; x.fillRect(L0, T0, hw0 * 2, hh0 * 2);
    // 池底格線
    x.strokeStyle = 'rgba(255,255,255,0.07)'; x.lineWidth = 1; x.beginPath(); const gs = 26;
    for (let k = -Math.ceil(hw0 / gs); k <= Math.ceil(hw0 / gs); k++) { x.moveTo(CX + k * gs, T0); x.lineTo(CX + k * gs, T0 + hh0 * 2); }
    for (let k = -Math.ceil(hh0 / gs); k <= Math.ceil(hh0 / gs); k++) { x.moveTo(L0, CY + k * gs); x.lineTo(L0 + hw0 * 2, CY + k * gs); }
    x.stroke();
    // 池底泳道標線（T 字）
    x.fillStyle = 'rgba(0,25,60,0.22)';
    [-0.5, 0.5].forEach(f => { const lx = CX + f * hw0; x.fillRect(lx - 3, T0 + 34, 6, hh0 * 2 - 68); x.fillRect(lx - 14, T0 + 34, 28, 5); x.fillRect(lx - 14, T0 + hh0 * 2 - 39, 28, 5); });
    // 雙方半場色
    const h0 = x.createLinearGradient(0, CY, 0, T0 + hh0 * 2); h0.addColorStop(0, 'rgba(80,210,255,0.05)'); h0.addColorStop(1, 'rgba(80,210,255,0.2)'); x.fillStyle = h0; x.fillRect(L0, CY, hw0 * 2, hh0);
    const h1 = x.createLinearGradient(0, CY, 0, T0); h1.addColorStop(0, 'rgba(255,90,100,0.05)'); h1.addColorStop(1, 'rgba(255,90,100,0.22)'); x.fillStyle = h1; x.fillRect(L0, T0, hw0 * 2, hh0);
    // 中圈
    x.strokeStyle = 'rgba(255,255,255,0.2)'; x.lineWidth = 2; x.beginPath(); x.arc(CX, CY, hw0 * 0.28, 0, TAU); x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.12)'; x.beginPath(); x.arc(CX, CY, 4, 0, TAU); x.fill();
    // 池壁內陰影
    const edge = (x0, y0, x1, y1, rx, ry, rw, rh) => { const g = x.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(0,15,35,0.45)'); g.addColorStop(1, 'rgba(0,15,35,0)'); x.fillStyle = g; x.fillRect(rx, ry, rw, rh); };
    edge(0, T0, 0, T0 + 22, L0, T0, hw0 * 2, 22); edge(0, T0 + hh0 * 2, 0, T0 + hh0 * 2 - 16, L0, T0 + hh0 * 2 - 16, hw0 * 2, 16);
    edge(L0, 0, L0 + 18, 0, L0, T0, 18, hh0 * 2); edge(L0 + hw0 * 2, 0, L0 + hw0 * 2 - 18, 0, L0 + hw0 * 2 - 18, T0, 18, hh0 * 2);
    x.restore();
    // 中線：浮標水道繩
    x.strokeStyle = '#0005'; x.lineWidth = 2; x.beginPath(); x.moveTo(L0, CY + 1); x.lineTo(L0 + hw0 * 2, CY + 1); x.stroke();
    const nb = Math.max(10, Math.round(hw0 * 2 / 13)), bs = hw0 * 2 / nb;
    for (let k = 0; k < nb; k++) { const px = L0 + (k + 0.5) * bs, c0 = th.buoy[(k >> 1) & 1];
      x.fillStyle = '#0004'; x.beginPath(); x.ellipse(px + 1, CY + 3, bs * 0.42, 3.6, 0, 0, TAU); x.fill();
      x.fillStyle = c0; x.beginPath(); x.ellipse(px, CY, bs * 0.42, 3.6, 0, 0, TAU); x.fill();
      x.fillStyle = '#ffffff99'; x.beginPath(); x.ellipse(px - bs * 0.1, CY - 1.4, bs * 0.18, 1.1, 0, 0, TAU); x.fill(); }
    // 縮小後的危險區：紅色斜紋
    if (b.hw < b.hw0) {
      x.save(); rr(L - 1, T - 1, hw * 2 + 2, hh * 2 + 2, rad); x.rect(L0, T0, hw0 * 2, hh0 * 2); x.clip('evenodd');
      x.fillStyle = 'rgba(40,0,10,0.55)'; x.fillRect(L0, T0, hw0 * 2, hh0 * 2);
      x.strokeStyle = 'rgba(255,60,80,0.35)'; x.lineWidth = 5; x.beginPath();
      for (let k = -hh0 * 2; k < hw0 * 2 + hh0 * 2; k += 16) { x.moveTo(L0 + k, T0); x.lineTo(L0 + k - hh0 * 2, T0 + hh0 * 2); } x.stroke(); x.restore();
    }
    // 擂台邊（目前範圍）
    rr(L - 1, T - 1, hw * 2 + 2, hh * 2 + 2, rad); x.lineWidth = 7; x.strokeStyle = '#0007'; x.stroke();
    const rg = x.createLinearGradient(0, T, 0, T + hh * 2); rg.addColorStop(0, th.rim); rg.addColorStop(1, mix(th.rim, th.glow, 0.5));
    x.lineWidth = 3.5; x.strokeStyle = rg; x.stroke();
    if (b.rules.includes('spikes')) { // 牆面尖刺
      x.fillStyle = '#f6a';
      const tooth = (px, py, dx, dy) => { x.beginPath(); x.moveTo(px - dy * 6, py + dx * 6); x.lineTo(px + dx * 10, py + dy * 10); x.lineTo(px + dy * 6, py - dx * 6); x.fill(); };
      for (let k = 0; k <= 14; k++) { const px = L + 8 + k * (hw * 2 - 16) / 14; tooth(px, T, 0, 1); tooth(px, T + hh * 2, 0, -1); }
      for (let k = 0; k <= 20; k++) { const py = T + 8 + k * (hh * 2 - 16) / 20; tooth(L, py, 1, 0); tooth(L + hw * 2, py, -1, 0); }
    }
    return c;
  }
  // 水面焦散紋理（可平鋪，建一次）
  const CS = 150;
  function buildCaus() {
    const c = document.createElement('canvas'); c.width = c.height = CS; const x = c.getContext('2d');
    let sd = 3; const rnd = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
    x.strokeStyle = '#fff'; x.lineJoin = 'round';
    for (let i = 0; i < 18; i++) {
      const cx = rnd() * CS, cy = rnd() * CS, r = 10 + rnd() * 22, n = 7, ph = rnd() * TAU, lw = 0.8 + rnd() * 1.4, pts = [];
      for (let k = 0; k < n; k++) { const a = ph + k / n * TAU, q = r * (0.7 + rnd() * 0.5); pts.push([Math.cos(a) * q, Math.sin(a) * q]); }
      x.lineWidth = lw; x.globalAlpha = 0.5 + rnd() * 0.5;
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        x.beginPath(); pts.forEach((p, k) => { const q = pts[(k + 1) % n], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; k ? x.quadraticCurveTo(cx + ox * CS + p[0], cy + oy * CS + p[1], cx + ox * CS + mx, cy + oy * CS + my) : x.moveTo(cx + ox * CS + mx, cy + oy * CS + my); });
        const p = pts[0], q = pts[1]; x.quadraticCurveTo(cx + ox * CS + p[0], cy + oy * CS + p[1], cx + ox * CS + (p[0] + q[0]) / 2, cy + oy * CS + (p[1] + q[1]) / 2); x.stroke();
      }
    }
    const wc = document.createElement('canvas');
    return { c, wc, wx: wc.getContext('2d'), pat: null, n: 0 };
  }
  // 每幀水面：焦散兩層＋反光帶畫在 1x 低解析離屏（隔幀更新），再疊到擂台；波紋直接畫
  function drawWater(b, th, t) {
    const L = CX - b.hw * S, T = CY - b.hh * S, w = b.hw * S * 2, h = b.hh * S * 2;
    if (!causA) causA = buildCaus();
    const A = causA, ww = Math.ceil(w), hh = Math.ceil(h), x = A.wx;
    if (A.wc.width !== ww || A.wc.height !== hh) { A.wc.width = ww; A.wc.height = hh; A.pat = null; A.n = 0; }
    if (!A.pat) A.pat = x.createPattern(A.c, 'repeat');
    if ((A.n++ & 1) === 0) {
      const pat = A.pat; x.clearRect(0, 0, ww, hh); x.fillStyle = pat;
      if (pat.setTransform) {
        pat.setTransform(new DOMMatrix().translate(Math.round((t * 9) % CS), Math.round((t * 6) % CS))); x.globalAlpha = th.key === 'n' ? 0.075 : 0.045; x.fillRect(0, 0, ww, hh);
        pat.setTransform(new DOMMatrix().translate(Math.round(40 - (t * 7) % (CS * 1.4)), Math.round(17 + (t * 10) % (CS * 1.4))).scale(1.4)); x.globalAlpha = th.key === 'n' ? 0.05 : 0.03; x.fillRect(0, 0, ww, hh);
      } else { x.globalAlpha = 0.06; x.fillRect(0, 0, ww, hh); }
      const sx = -160 + ((t * 38) % (ww + 320)), g = x.createLinearGradient(sx - 70, 0, sx + 70, 140);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.globalAlpha = 1; x.fillStyle = g; x.fillRect(Math.max(0, sx - 260), 0, 520, hh);
    }
    ctx.save(); rrect(L, T, w, h, 18); ctx.clip(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(A.wc, L, T, ww, hh);
    // 波紋
    ctx.lineWidth = 1.5;
    for (const r of V.ripples) {
      const k = 1 - r.life / r.max, e = 1 - Math.pow(1 - k, 2), rad = Math.max(1, (0.25 + 0.75 * e) * r.r * S), px = CX + r.x * S, py = CY + r.y * S;
      ctx.globalAlpha = r.a * (1 - k); ctx.strokeStyle = '#dff8ff'; ctx.beginPath(); ctx.ellipse(px, py, rad, rad * 0.86, 0, 0, TAU); ctx.stroke();
      if (k < 0.7) { ctx.globalAlpha *= 0.6; ctx.beginPath(); ctx.ellipse(px, py, rad * 0.62, rad * 0.53, 0, 0, TAU); ctx.stroke(); }
    }
    ctx.restore();
  }
  // 場地縮小：邊界警示
  function drawShrinkWarn(b, t) {
    const shr = b.hw < b.hw0 - 0.5, st = V.shrinkT / 1.4; if (!shr && st <= 0) return;
    const L = CX - b.hw * S, T = CY - b.hh * S, w = b.hw * S * 2, h = b.hh * S * 2, pul = 0.5 + 0.5 * Math.sin(t * 6);
    ctx.save(); ctx.strokeStyle = `rgba(255,60,80,${Math.min(1, 0.3 + 0.3 * pul + st * 0.7)})`; ctx.lineWidth = 2.5 + st * 6; rrect(L - 2, T - 2, w + 4, h + 4, 19); ctx.stroke();
    if (st > 0) { // 向內箭頭
      const o = (1 - st) * 14 + Math.sin(t * 14) * 3; ctx.fillStyle = `rgba(255,90,100,${Math.min(1, st * 1.6)})`;
      const arw = (px, py, dx, dy) => { ctx.beginPath(); ctx.moveTo(px + dx * 10, py + dy * 10); ctx.lineTo(px - dy * 9, py + dx * 9); ctx.lineTo(px + dy * 9, py - dx * 9); ctx.closePath(); ctx.fill(); };
      [-0.3, 0.3].forEach(f => { arw(CX + f * w, T - 16 + o, 0, 1); arw(CX + f * w, T + h + 16 - o, 0, -1); });
      [-0.3, 0, 0.3].forEach(f => { arw(L - 16 + o, CY + f * h, 1, 0); arw(L + w + 16 - o, CY + f * h, -1, 0); });
    }
    ctx.restore();
  }

  // 障礙柱（快取圖）
  function pillarSprite(kind, r) {
    const key = kind + '|' + Math.round(r * 4); if (pillarCache[key]) return pillarCache[key];
    const sz = Math.ceil(r * 3.2), c = document.createElement('canvas'); c.width = c.height = Math.ceil(sz * dpr); const x = c.getContext('2d'); x.scale(dpr, dpr); x.translate(sz / 2, sz / 2);
    if (kind === 'ring') { // 泳圈：紅白相間、中空透出水面
      const ri = r * 0.5;
      for (let s = 0; s < 8; s++) { x.fillStyle = s % 2 ? '#fbfbff' : '#ff4f63'; x.beginPath(); x.arc(0, 0, r, s / 8 * TAU, (s + 1) / 8 * TAU); x.arc(0, 0, ri, (s + 1) / 8 * TAU, s / 8 * TAU, true); x.closePath(); x.fill(); }
      const sh = x.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.2, 0, 0, r * 1.05); sh.addColorStop(0, 'rgba(255,255,255,0.35)'); sh.addColorStop(0.55, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,30,0.35)');
      x.fillStyle = sh; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.arc(0, 0, ri, 0, TAU, true); x.fill();
      x.strokeStyle = '#0005'; x.lineWidth = 1.5; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.stroke(); x.beginPath(); x.arc(0, 0, ri, 0, TAU); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineCap = 'round'; x.lineWidth = Math.max(1.5, r * 0.11); x.beginPath(); x.arc(0, 0, r * 0.76, Math.PI * 1.1, Math.PI * 1.45); x.stroke();
      x.fillStyle = 'rgba(130,220,255,0.25)'; x.beginPath(); x.arc(0, 0, ri, 0, TAU); x.fill();
    } else { // 尖刺柱：金屬刺球
      for (let s = 0; s < 12; s++) { const a = s / 12 * TAU, p = [[Math.cos(a - 0.22) * r * 0.85, Math.sin(a - 0.22) * r * 0.85], [Math.cos(a) * r * 1.42, Math.sin(a) * r * 1.42], [Math.cos(a + 0.22) * r * 0.85, Math.sin(a + 0.22) * r * 0.85]];
        x.fillStyle = '#5a5f74'; x.beginPath(); x.moveTo(p[0][0], p[0][1]); x.lineTo(p[1][0], p[1][1]); x.lineTo(p[2][0], p[2][1]); x.fill();
        x.fillStyle = '#b9bdcc'; x.beginPath(); x.moveTo(p[0][0], p[0][1]); x.lineTo(p[1][0], p[1][1]); x.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85); x.fill(); }
      const g = x.createRadialGradient(-r * 0.3, -r * 0.35, 1, 0, 0, r); g.addColorStop(0, '#e4e7f0'); g.addColorStop(0.5, '#8a8fa3'); g.addColorStop(1, '#3c4052'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.fill();
      x.strokeStyle = '#2a2d3a'; x.lineWidth = 1.5; x.stroke();
      x.strokeStyle = '#ff4d6d'; x.lineWidth = Math.max(1.5, r * 0.1); x.beginPath(); x.arc(0, 0, r * 0.55, 0, TAU); x.stroke();
      x.fillStyle = '#ffffffcc'; x.beginPath(); x.ellipse(-r * 0.35, -r * 0.4, r * 0.22, r * 0.12, -0.6, 0, TAU); x.fill();
    }
    return pillarCache[key] = { c, sz };
  }
  function drawPillars(b, t, dt) {
    (b.pillars || []).forEach((p, k) => {
      const x = CX + p.x * S, y = CY + p.y * S, r = p.r * S, h = (pHit[k] || 0) / 0.6, sp = pillarSprite(p.kind, r);
      if (p.kind === 'ring') {
        const bob = Math.sin(t * 2.2 + k * 1.7) * r * 0.08, rot = Math.sin(t * 1.3 + k) * 0.2, sq = h > 0 ? Math.sin(h * Math.PI * 5) * 0.22 * h : 0;
        if (dt) { const rk = 'p' + k; ripT[rk] = (ripT[rk] == null ? k * 0.5 : ripT[rk]) - dt; if (ripT[rk] <= 0) { ripT[rk] = 1.5; ripple(p.x, p.y, p.r * 1.9, 1.6, 0.35); } }
        ctx.fillStyle = 'rgba(0,25,55,0.3)'; ctx.beginPath(); ctx.ellipse(x + r * 0.1, y + r * 0.22, r * 1.06, r * 0.98, 0, 0, TAU); ctx.arc(x + r * 0.1, y + r * 0.22, r * 0.5, 0, TAU, true); ctx.fill();
        ctx.save(); ctx.translate(x, y + bob - h * r * 0.25); ctx.rotate(rot); ctx.scale(1 + sq, 1 - sq); ctx.drawImage(sp.c, -sp.sz / 2, -sp.sz / 2, sp.sz, sp.sz); ctx.restore();
        if (h > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 1.8); g.addColorStop(0, `rgba(127,211,255,${0.55 * h})`); g.addColorStop(1, 'rgba(127,211,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, TAU); ctx.fill(); ctx.restore(); }
      } else {
        const jx = h > 0 ? Math.sin(t * 90) * r * 0.08 * h : 0;
        ctx.fillStyle = 'rgba(0,15,35,0.4)'; ctx.beginPath(); ctx.ellipse(x + r * 0.12, y + r * 0.3, r * 1.2, r * 1.0, 0, 0, TAU); ctx.fill();
        ctx.drawImage(sp.c, x + jx - sp.sz / 2, y - sp.sz / 2, sp.sz, sp.sz);
        if (h > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6); g.addColorStop(0, `rgba(255,40,60,${0.9 * h})`); g.addColorStop(1, 'rgba(255,40,60,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, TAU); ctx.fill(); ctx.restore();
          ctx.strokeStyle = `rgba(255,70,90,${h})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r * (1.45 + (1 - h) * 0.4), 0, TAU); ctx.stroke(); }
      }
    });
  }

  // ---- 大招／復活等地面與上層特效 ----
  function drawFx(t, layer) {
    for (const f of V.fx) {
      const k = 1 - f.life / f.max, px = CX + f.x * S, py = CY + f.y * S, R = f.r * S;
      if (layer === 0 && f.k === 'crack') { // 地裂
        let s = f.seed; const rn = () => (s = (s * 9301 + 49297) % 233280) / 233280, grow = Math.min(1, (f.max - f.life) / 0.15), a = Math.min(1, f.life / f.max * 2.5);
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        for (let i = 0; i < f.n; i++) { let a0 = i / f.n * TAU + rn() * 0.5, cx = px, cy = py; const pts = [[cx, cy]], len = R * (0.6 + rn() * 0.4) * grow;
          for (let j = 1; j <= 4; j++) { a0 += (rn() - 0.5) * 0.8; cx = px + Math.cos(a0) * len * j / 4; cy = py + Math.sin(a0) * len * j / 4; pts.push([cx, cy]); }
          ctx.globalAlpha = a * 0.8; ctx.strokeStyle = '#1c0f05'; ctx.lineWidth = 4; ctx.beginPath(); pts.forEach((q, j) => j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke();
          ctx.globalAlpha = a * (0.4 + 0.4 * Math.sin(t * 10 + i)); ctx.strokeStyle = '#ffb35a'; ctx.lineWidth = 1.3; ctx.stroke(); }
        ctx.globalAlpha = 1; ctx.lineCap = 'butt';
      }
      if (layer !== 1) continue;
      if (f.k === 'hex') { ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = f.col; ctx.lineWidth = 4 * (1 - k) + 1; hexPath(px, py, R * (0.75 + 0.35 * (1 - Math.pow(1 - k, 3))), k * 1.5); ctx.stroke(); ctx.globalAlpha *= 0.25; ctx.fillStyle = f.col; ctx.fill(); ctx.restore(); }
      else if (f.k === 'vortex') { // 黑洞
        const rr = R * (1 - k * 0.55), a = Math.min(1, f.life / f.max * 2);
        const g = ctx.createRadialGradient(px, py, 0, px, py, rr); g.addColorStop(0, `rgba(20,0,40,${0.7 * a})`); g.addColorStop(0.5, `rgba(60,20,120,${0.35 * a})`); g.addColorStop(1, 'rgba(60,20,120,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, rr, 0, TAU); ctx.fill();
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#b28cff'; ctx.lineWidth = 3;
        for (let i = 0; i < 4; i++) { const a0 = -t * 9 + i * TAU / 4; ctx.globalAlpha = a * 0.8; ctx.beginPath(); for (let j = 0; j <= 14; j++) { const q = j / 14, an = a0 + q * 3, d = rr * (1 - q * 0.9); j ? ctx.lineTo(px + Math.cos(an) * d, py + Math.sin(an) * d) : ctx.moveTo(px + Math.cos(an) * d, py + Math.sin(an) * d); } ctx.stroke(); }
        ctx.restore();
      } else if (f.k === 'beam') { // 光柱
        const a = k < 0.15 ? k / 0.15 : (1 - k) / 0.85, bw = R * 2 * (1 - k * 0.4);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(0, -BGP, 0, py); g.addColorStop(0, `rgba(${f.rgb},0)`); g.addColorStop(1, `rgba(${f.rgb},${0.45 * a})`); ctx.fillStyle = g; ctx.fillRect(px - bw * 0.8, -BGP, bw * 1.6, py + BGP);
        const g2 = ctx.createLinearGradient(0, -BGP, 0, py); g2.addColorStop(0, 'rgba(255,255,255,0)'); g2.addColorStop(1, `rgba(255,255,255,${0.75 * a})`); ctx.fillStyle = g2; ctx.fillRect(px - bw * 0.18, -BGP, bw * 0.36, py + BGP);
        const g3 = ctx.createRadialGradient(px, py, 0, px, py, bw * 1.2); g3.addColorStop(0, `rgba(${f.rgb},${0.7 * a})`); g3.addColorStop(1, `rgba(${f.rgb},0)`); ctx.fillStyle = g3; ctx.beginPath(); ctx.ellipse(px, py, bw * 1.2, bw * 0.7, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }
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

  // ---- 2.5D 視覺變形 ----：由速度變化推回碰撞法線（Δv 方向），彈簧回彈；起步沿速度拉長並小跳；停下微彈
  let shadowC = null;
  function shadowSprite() {
    if (shadowC) return shadowC; const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(4,10,24,0.85)'); gr.addColorStop(0.5, 'rgba(4,10,24,0.5)'); gr.addColorStop(1, 'rgba(4,10,24,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return shadowC = c;
  }
  function deform(o, dt) {
    const vx = o.vx || 0, vy = o.vy || 0, sp = Math.hypot(vx, vy);
    let v = vis[o.i]; if (!v) v = vis[o.i] = { pvx: vx, pvy: vy, q: 0, qv: 0, ang: 0, z: 0, zv: 0, mv: false };
    if (!dt) return v;
    const dvx = vx - v.pvx, dvy = vy - v.pvy, dv = Math.hypot(dvx, dvy), ps = Math.hypot(v.pvx, v.pvy);
    if (dv > 140) {
      if (ps < 40 && sp > 150) { v.ang = Math.atan2(vy, vx); v.q = -0.24; v.qv = 0; v.zv = Math.min(160, 40 + sp * 0.12); } // 起步：拉長＋小跳
      else { v.ang = Math.atan2(dvy, dvx); v.q = Math.min(0.32, Math.max(v.q, dv / 1600)); v.qv = 0; } // 撞擊：沿法線壓扁
    }
    if (sp > 60) v.mv = true; else if (sp < 8 && v.mv) { v.mv = false; if (Math.abs(v.q) < 0.06) { v.ang = Math.atan2(v.pvy, v.pvx) || 0; v.q = 0.08; v.qv = 0; } } // 停下微彈
    const h = Math.min(dt, 1 / 30), w = 26, zeta = 0.3;
    v.qv += (-w * w * v.q - 2 * zeta * w * v.qv) * h; v.q += v.qv * h; if (Math.abs(v.q) < 0.002 && Math.abs(v.qv) < 0.05) v.q = v.qv = 0;
    if (v.z > 0 || v.zv > 0) { v.zv -= 1100 * h; v.z += v.zv * h; if (v.z <= 0) { v.z = 0; if (v.zv < -120) { v.zv = -v.zv * 0.28; v.q = Math.max(v.q, 0.08); v.ang = Math.PI / 2; } else v.zv = 0; } }
    v.pvx = vx; v.pvy = vy; return v;
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
    const t = performance.now() / 1000, th = theme(b), bgKey = th.key + '|' + b.hw + 'x' + b.hh + '|' + b.rules.join() + '|' + W + 'x' + H;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (V.shake > 0.5) ctx.translate((Math.random() - .5) * V.shake, (Math.random() - .5) * V.shake);
    if (!bgCache || bgCache.key !== bgKey) bgCache = { key: bgKey, c: buildBg(b, th) };
    ctx.drawImage(bgCache.c, -BGP, -BGP, W + BGP * 2, H + BGP * 2); // 外擴，避免震動露邊
    drawWater(b, th, t);
    // 首領戰：外框脈動
    ctx.globalAlpha = th.key === 'n' ? 0.25 : 0.35 + Math.sin(t * 2.5) * 0.15; ctx.strokeStyle = th.glow; ctx.lineWidth = 3; rrect(CX - b.hw * S - 4, CY - b.hh * S - 4, b.hw * S * 2 + 8, b.hh * S * 2 + 8, 20); ctx.stroke(); ctx.globalAlpha = 1;
    drawShrinkWarn(b, t);
    // 焦痕
    V.decals.forEach(d => { const gr = ctx.createRadialGradient(CX + d.x * S, CY + d.y * S, 0, CX + d.x * S, CY + d.y * S, d.r * S); gr.addColorStop(0, `rgba(10,5,5,${0.45 * Math.min(1, d.life / 1.5)})`); gr.addColorStop(1, 'rgba(10,5,5,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(CX + d.x * S, CY + d.y * S, d.r * S, 0, TAU); ctx.fill(); });
    // 牆面閃光
    if (V.walls.length) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      V.walls.forEach(w => { const k = w.life / w.max, g = ctx.createRadialGradient(CX + w.x * S, CY + w.y * S, 0, CX + w.x * S, CY + w.y * S, 30 * (1.4 - k)); g.addColorStop(0, `rgba(220,210,255,${0.8 * k})`); g.addColorStop(1, 'rgba(220,210,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(CX + w.x * S, CY + w.y * S, 30 * (1.4 - k), 0, TAU); ctx.fill(); });
      ctx.restore(); }
    drawFx(t, 0);
    drawZones(b, t);
    drawPillars(b, t, dt);

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

    // 棋子：先更新視覺變形，再畫地面投影（跳越高影子越小越淡、越偏；速度越快影子沿速度拉長）
    const shC = shadowSprite();
    b.bodies.forEach(o => { if (!o.alive) return; const v = deform(o, dt), x = CX + o.x * S, y = CY + o.y * S, r = o.r * S, z = v.z * S, k = 1 / (1 + z / (r * 1.1)), sp = Math.hypot(o.vx, o.vy);
      ctx.save(); ctx.translate(x + r * 0.26 + z * 0.4, y + r * 0.92 + z * 0.55);
      if (sp > 60) { const a = Math.atan2(o.vy * 0.36, o.vx), st = Math.min(0.3, sp / 3500); ctx.rotate(a); ctx.scale(1 + st, 1 - st * 0.3); ctx.rotate(-a); }
      const w = r * 1.18 * k * (1 + Math.max(0, v.q) * 0.5), h = r * 0.46 * k; ctx.globalAlpha = 0.8 * k; ctx.drawImage(shC, -w, -h, w * 2, h * 2); ctx.restore(); });
    ctx.globalAlpha = 1;
    const SP = FA.sprites;
    b.bodies.forEach(o => {
      if (o.hurt > 0) o.hurt -= dt * 3;
      const x = CX + o.x * S, y = CY + o.y * S; let r = o.r * S;
      if (!o.alive) { // 陣亡：淡出飄起（之後到復活前不畫）
        if (dead[o.i] == null) dead[o.i] = 0; dead[o.i] += dt;
        if (dead[o.i] < 0.55 && SP && !o.temp) SP.draw(ctx, o, x, y, r, t, dead[o.i] / 0.55);
        return;
      }
      const si = spawnIn[o.i]; if (si) { const k = 1 - si / 0.7, q = k - 1; r = Math.max(1, r * (1 + 2.70158 * q * q * q + 1.70158 * q * q)); }
      const sp0 = Math.hypot(o.vx, o.vy); if (dt && sp0 > 200) { ripT[o.i] = (ripT[o.i] || 0) + dt; if (ripT[o.i] > 0.08) { ripT[o.i] = 0; ripple(o.x, o.y, o.r * 1.6, 0.6, 0.3); } }
      const sel = b.phase === 'aim' && b.turn === 0 && o.team === 0 && !o.temp && FA.battle.avail(b, 0).includes(o);
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
      const UM = FA.DATA.config.ult.max, en = Math.min(1, (o.energy || 0) / UM), full = en >= 1 && !o.temp && !o.ultOn, foe = o.team !== 0, pul = 0.5 + 0.5 * Math.sin(t * 7 + o.i);
      const ecol = foe ? '255,70,90' : '255,215,80';
      if (full) { const g = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * (1.8 + pul * 0.3)); g.addColorStop(0, `rgba(${ecol},${0.3 + pul * 0.3})`); g.addColorStop(1, `rgba(${ecol},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * (1.8 + pul * 0.3), 0, TAU); ctx.fill(); }
      if (o.ultOn === 'phase' && SP) { const tr = V.trails[o.i] || []; ctx.save(); for (let j = tr.length - 3, n = 0; j >= 0 && n < 3; j -= 3, n++) { ctx.globalAlpha = 0.28 - n * 0.08; SP.draw(ctx, o, CX + tr[j][0] * S, CY + tr[j][1] * S, r, t); } ctx.restore(); ctx.globalAlpha = 1; }
      if (o.ultOn) ultAura(o, x, y, r, t, dt);
      if (SP) { // 2.5D：跳起位移＋速度拉伸＋碰撞壓扁回彈（只是畫面，碰撞判定不變）
        const v = vis[o.i] || { q: 0, z: 0, ang: 0 }, lift = Math.min(r * 0.3, v.z * S);
        ctx.save(); ctx.translate(x, y - lift);
        if (sp0 > 60) { const a = Math.atan2(o.vy, o.vx), k = Math.min(0.09, sp0 / 10000); ctx.rotate(a); ctx.scale(1 + k, 1 - k * 0.7); ctx.rotate(-a); }
        if (Math.abs(v.q) > 0.004) { ctx.rotate(v.ang); ctx.scale(1 - v.q, 1 + v.q * 0.65); ctx.rotate(-v.ang); }
        SP.draw(ctx, o, 0, 0, r, t); ctx.restore();
      } else plainBody(o, x, y, r);
      if (si) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = si / 0.7; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore(); }
      if (!o.temp && !o.boss || o.boss) { // 能量環
        ctx.lineWidth = 2.5; ctx.strokeStyle = '#0008'; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, TAU); ctx.stroke();
        if (full) {
          const fc = foe ? '#ff4d6d' : '#ffd54f'; ctx.lineWidth = 3 + pul * 1.5; ctx.strokeStyle = fc; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, TAU); ctx.stroke();
          ctx.globalAlpha = 1 - pul; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 5 + pul * 6, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; const sd = Math.floor(t * 12) * 13 + o.i * 7;
          for (let j = 0; j < 2; j++) { const a = (sd * 0.37 + j * 3.1) % TAU, a2 = a + 0.9, R1 = r + 3; ctx.strokeStyle = `rgba(${ecol},0.6)`; ctx.lineWidth = 3; lightning(x + Math.cos(a) * R1, y + Math.sin(a) * R1, x + Math.cos(a2) * R1, y + Math.sin(a2) * R1, sd + j * 31, r * 0.5); ctx.stroke(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.stroke(); }
          ctx.restore();
          const by = y - r - 10 + Math.sin(t * 5 + o.i) * 2; outText(foe ? '⚡大招' : '⚡', x, by, foe ? 11 : 14, foe ? '#ff8a9a' : '#ffe066', 3);
        } else { ctx.strokeStyle = o.ultOn ? (ULT[o.ultOn] || ULT0).col : foe ? '#ff9a7a' : '#7fd8ff'; ctx.beginPath(); ctx.arc(x, y, r + 3, -Math.PI / 2, -Math.PI / 2 + TAU * (o.ultOn ? 1 : en)); ctx.stroke(); }
      }
      if (o.shield > 0) { // 護盾泡泡
        const sr = r + 5; ctx.fillStyle = '#9ef2ff22'; ctx.beginPath(); ctx.arc(x, y, sr, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#9ef'; ctx.lineWidth = 1.5 + Math.min(3, o.shield / 25); ctx.stroke();
        ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, sr - 2, Math.PI * 1.15 + Math.sin(t * 2) * 0.2, Math.PI * 1.5 + Math.sin(t * 2) * 0.2); ctx.stroke();
      }
      if (o.temp) return;
      if (o.weapon && FA.DATA.weapons[o.weapon]) { if (SP && SP.badge) SP.badge(ctx, FA.DATA.weapons[o.weapon].icon, x + r * 0.9, y - r * 0.05, 7.5); else { ctx.font = `12px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(FA.DATA.weapons[o.weapon].icon, x + r * .95, y + r * .2); } }
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

    drawFx(t, 1);
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
      if (tx.pill) { ctx.font = `900 ${tx.size}px ${FONT}`; const pw = ctx.measureText(tx.txt).width + tx.size; rrect(-pw / 2, -tx.size * 1.05, pw, tx.size * 1.45, tx.size * 0.7); ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fill(); ctx.strokeStyle = tx.pill; ctx.lineWidth = 2.5; ctx.stroke(); }
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
    const topY = CY - b.hh0 * S;
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
    if (V.edge) { const e = V.edge, a = e.life / e.max, g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72); g.addColorStop(0, `rgba(${e.col},0)`); g.addColorStop(1, `rgba(${e.col},${0.55 * a})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    if (V.cutin) drawCutin(V.cutin, t);
    if (ui.msg) { ctx.font = `bold 17px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.strokeStyle = '#000a'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeText(ui.msg, W / 2, CY + b.hh0 * S + 30); ctx.fillStyle = ui.msgCol || '#fff'; ctx.fillText(ui.msg, W / 2, CY + b.hh0 * S + 30); }
  };
})(globalThis);
