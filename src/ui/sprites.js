// 角色外觀（向量）：「玩具壓克力球」統一風格——上亮下暗的全域光、深色同色系描邊、球體高光＋水面反光的邊緣光
// 靜態部分用離屏 canvas 快取；表情與狀態每幀即時畫
// 用法：FA.sprites.draw(ctx, o, x, y, r, t, deadK)；FA.sprites.icon(id, star, px) 回傳 dataURL（商店/圖鑑可用）
//
// ===== 新角色怎麼套用新風格 =====
// 1) 什麼都不做：依角色第一個羈絆自動配頭飾、第二個羈絆配身上花紋（TRAIT_LOOK），已是新風格
// 2) 資料式（建議）：在本檔 LOOK 加一行，或在任何地方呼叫
//      FA.sprites.define('newId', { back: [['horns', { col: '#f2e6c9' }]], body: [['bands', { ys: [0.5] }]], front: [], top: [] });
//    每個元素是 [零件名, 參數]，零件見 PARTS（horns/crown/helmet/antenna/flames/wings/halo/spikes/rivets/bands/emblem/gear/drips/gloss/coil…）
//    參數 col 省略時用角色本色；x/y/s 都以半徑 r 為單位
// 3) 函式式（舊寫法相容）：FA.spriteDecor.newId = { back(c, r, col) {}, body(c, r, col) {}, front(c, r, col) {}, top(c, r, col) {} }
//    函式裡可用 FA.sprites.kit 的 paint/ink/flame/star5 讓描邊與光影一致
// body 會自動裁切在球體內；top 每幀畫在表情之上（不快取，盡量簡單）
(function (g) {
  const FA = g.FA = g.FA || {};
  const TAU = Math.PI * 2;
  const cache = new Map();
  let dpr = 1;

  // ---- 色彩工具 ----
  const hex = c => { c = c || '#888'; if (c[0] === 'r') { const m = c.match(/[\d.]+/g); return [+m[0], +m[1], +m[2]]; } c = c.replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join(''); const n = parseInt(c.slice(0, 6), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgb = (a, al) => al == null ? `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})` : `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${al})`;
  const mix = (c, d, k) => { const a = hex(c), b = hex(d); return rgb([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]); };
  const lum = c => { const a = hex(c); return (a[0] * 0.3 + a[1] * 0.59 + a[2] * 0.11) / 255; };
  const hashId = s => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
  const ink = col => mix(col, '#1a1024', 0.68); // 描邊＝同色系深色，不用純黑

  // ---- 共用畫法：所有零件走同一套光影 ----
  let R = 20; // 目前快取中的半徑（paint 的全域光用）
  const P = (c, f) => { c.beginPath(); f(); };
  // 填色：全域由上往下的光（-1.7r 亮 → r 暗），再用同色系深色描邊
  function paint(c, col, o) {
    o = o || {};
    const gr = c.createLinearGradient(0, -R * 1.8, 0, R * 1.1);
    gr.addColorStop(0, mix(col, '#ffffff', o.hi == null ? 0.45 : o.hi)); gr.addColorStop(0.5, col); gr.addColorStop(1, mix(col, '#000000', o.lo == null ? 0.35 : o.lo));
    c.fillStyle = o.flat ? col : gr; c.fill();
    if (o.line !== false) { c.lineWidth = Math.max(1, R * (o.lw || 0.075)); c.strokeStyle = o.ink || ink(col); c.lineJoin = 'round'; c.stroke(); }
  }
  // 細亮邊（零件的高光線）
  const gloss = (c, w) => { c.strokeStyle = '#ffffffa0'; c.lineWidth = Math.max(0.8, R * (w || 0.05)); c.lineCap = 'round'; c.stroke(); };
  function star5(c, x, y, Ro, ri) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? ri : Ro; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); }
  function flame(c, x, y, w, h, lean) { c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x - w * 0.9, y - h * 0.55, x + lean, y - h); c.quadraticCurveTo(x + w * 0.9, y - h * 0.5, x + w, y); c.closePath(); }
  const outline = (c, w, col) => { c.lineWidth = w; c.strokeStyle = col || '#0008'; c.lineJoin = 'round'; c.stroke(); };
  const gem = (c, x, y, s, col, rot) => { c.save(); c.translate(x, y); c.rotate(rot || 0); P(c, () => { c.moveTo(0, -s); c.lineTo(s * 0.8, 0); c.lineTo(0, s); c.lineTo(-s * 0.8, 0); c.closePath(); }); const gr = c.createLinearGradient(-s, -s, s, s); gr.addColorStop(0, mix(col, '#fff', 0.7)); gr.addColorStop(0.5, col); gr.addColorStop(1, mix(col, '#000', 0.4)); c.fillStyle = gr; c.fill(); c.lineWidth = Math.max(0.8, s * 0.22); c.strokeStyle = ink(col); c.stroke(); c.fillStyle = '#ffffffcc'; P(c, () => c.arc(-s * 0.22, -s * 0.3, s * 0.2, 0, TAU)); c.fill(); c.restore(); };

  // ---- 零件庫（資料式造型用）：(c, r, p) p＝參數＋p.col（預設角色本色） ----
  const PARTS = {
    // 一對彎角
    horns(c, r, p) { const col = p.col || '#f2e6c9', L = p.len || 1, sp = p.spread || 1; [-1, 1].forEach(s => { P(c, () => { c.moveTo(s * r * 0.45 * sp, -r * 0.7); c.quadraticCurveTo(s * r * 1.15 * sp, -r * 0.85, s * r * (0.95 + 0.1 * sp), -r * (0.95 + 0.5 * L)); c.quadraticCurveTo(s * r * 0.85 * sp, -r * 1.0, s * r * 0.2, -r * 0.86); c.closePath(); }); paint(c, col); P(c, () => { c.moveTo(s * r * 0.55 * sp, -r * 0.8); c.quadraticCurveTo(s * r * 0.95 * sp, -r * 0.95, s * r * 0.95, -r * (0.95 + 0.4 * L)); }); gloss(c, 0.04); }); },
    // 鋸齒王冠
    crown(c, r, p) { const col = p.col || '#ffd54f', w = (p.w || 0.55) * r, y = (p.y || -0.78) * r, h = (p.h || 0.6) * r, n = p.n || 4;
      P(c, () => { c.moveTo(-w, y); for (let k = 0; k <= n; k++) c.lineTo(-w + k * w * 2 / n, y - (k % 2 ? h * 0.5 : h)); c.lineTo(w, y); c.closePath(); }); paint(c, col, { hi: 0.7 });
      for (let k = 0; k <= n; k += 2) gem(c, -w + k * w * 2 / n, y - h - r * 0.02, r * 0.07, '#fff3a0');
      gem(c, 0, y - h * 0.3, r * 0.1, p.gem || '#e53935'); },
    // 頭盔（蓋住頭頂，畫在 front）
    helmet(c, r, p) { const col = p.col || '#c9d3de'; P(c, () => { c.arc(0, -r * 0.12, r * 1.04, Math.PI * 1.06, Math.PI * 1.94); c.closePath(); }); paint(c, col, { hi: 0.6 });
      P(c, () => c.arc(0, -r * 0.12, r * 0.9, Math.PI * 1.2, Math.PI * 1.45)); gloss(c, 0.07);
      if (p.crest) { c.fillStyle = p.crest; c.fillRect(-r * 0.08, -r * 1.18, r * 0.16, r * 0.78); c.fillRect(-r * 0.96, -r * 0.42, r * 1.92, r * 0.1); } },
    // 天線（尾端球）
    antenna(c, r, p) { const lean = (p.lean == null ? 0.25 : p.lean) * r, L = (p.len || 0.55) * r; c.strokeStyle = ink(p.col || '#cfd8dc'); c.lineWidth = r * 0.14; c.lineCap = 'round'; P(c, () => { c.moveTo(0, -r * 0.85); c.quadraticCurveTo(lean * 0.2, -r * 0.85 - L * 0.6, lean, -r * 0.85 - L); }); c.stroke(); c.strokeStyle = p.col || '#cfd8dc'; c.lineWidth = r * 0.07; c.stroke();
      P(c, () => c.arc(lean, -r * 0.85 - L, r * 0.17, 0, TAU)); paint(c, p.tip || '#ffd54f', { hi: 0.7 }); },
    // 火焰（頭頂），cols 外→內
    flames(c, r, p) { const cols = p.cols || ['#ff5a1f', '#ffd23f'], s = p.s || 1;
      [[-0.45, 0.7, -0.25], [0.45, 0.75, 0.25], [0, 1.05, 0.05]].forEach(([dx, h, l]) => { flame(c, dx * r * s, -r * 0.55, r * 0.38 * s, (r * h + r * 0.5) * s, l * r); paint(c, cols[0], { hi: 0.3 }); });
      [[-0.2, 0.55], [0.22, 0.6]].forEach(([dx, h]) => { flame(c, dx * r * s, -r * 0.6, r * 0.2 * s, (r * h + r * 0.3) * s, 0); c.fillStyle = cols[1]; c.fill(); }); },
    // 側翼
    wings(c, r, p) { const col = p.col || '#ffffff', sp = p.span || 1; [-1, 1].forEach(s => { c.save(); c.scale(s, 1); P(c, () => { c.moveTo(r * 0.7, -r * 0.1); c.quadraticCurveTo(r * (0.9 + 0.7 * sp), -r * 0.9, r * (0.85 + 0.7 * sp), -r * 0.1); c.quadraticCurveTo(r * (0.8 + 0.7 * sp), r * 0.2, r * (0.6 + 0.7 * sp), r * 0.15); c.quadraticCurveTo(r * (0.6 + 0.7 * sp), r * 0.45, r * (0.35 + 0.7 * sp), r * 0.4); c.quadraticCurveTo(r * 0.95, r * 0.6, r * 0.7, r * 0.4); c.closePath(); }); paint(c, col, { ink: p.ink }); c.restore(); }); },
    halo(c, r, p) { c.strokeStyle = '#b8860b'; c.lineWidth = r * 0.2; P(c, () => c.ellipse(0, -r * 1.28, r * 0.56, r * 0.17, 0, 0, TAU)); c.stroke(); c.strokeStyle = p.col || '#ffe082'; c.lineWidth = r * 0.12; c.stroke(); c.strokeStyle = '#fffdf0'; c.lineWidth = r * 0.04; c.stroke(); },
    // 放射尖刺（地雷／首領）
    spikes(c, r, p) { const n = p.n || 8, L = p.len || 1.3, col = p.col || '#5d4037'; for (let k = 0; k < n; k++) { const a = k / n * TAU + (p.rot || Math.PI / 8); P(c, () => { c.moveTo(Math.cos(a - 0.22) * r * 0.9, Math.sin(a - 0.22) * r * 0.9); c.lineTo(Math.cos(a) * r * L, Math.sin(a) * r * L); c.lineTo(Math.cos(a + 0.22) * r * 0.9, Math.sin(a + 0.22) * r * 0.9); c.closePath(); }); paint(c, col); } },
    // 一圈鉚釘
    rivets(c, r, p) { const n = p.n || 8, rad = (p.rad || 0.8) * r; for (let k = 0; k < n; k++) { const a = k / n * TAU + (p.rot || 0), x = Math.cos(a) * rad, y = Math.sin(a) * rad; P(c, () => c.arc(x, y, r * 0.09, 0, TAU)); paint(c, p.col || '#8a94a6', { hi: 0.8, lw: 0.04 }); } },
    // 橫帶（金屬箍、腰帶）：ys 以 r 為單位
    bands(c, r, p) { (p.ys || [0.5]).forEach(y => { const h = (p.h || 0.18) * r; c.fillStyle = p.col || '#3a3a44'; c.fillRect(-r, y * r - h / 2, r * 2, h); c.fillStyle = '#ffffff50'; c.fillRect(-r, y * r - h / 2, r * 2, h * 0.28); c.fillStyle = '#0004'; c.fillRect(-r, y * r + h * 0.3, r * 2, h * 0.2); }); },
    // 胸前徽記：cross / bolt / star / drop / skull / ring
    emblem(c, r, p) { const x = (p.x || 0) * r, y = (p.y == null ? 0.55 : p.y) * r, s = (p.s || 0.22) * r, col = p.col || '#ffd54f';
      c.save(); c.translate(x, y);
      if (p.shape === 'cross') { P(c, () => { c.rect(-s * 0.3, -s, s * 0.6, s * 2); c.rect(-s, -s * 0.3, s * 2, s * 0.6); }); paint(c, col, { line: false }); }
      else if (p.shape === 'bolt') { P(c, () => { c.moveTo(-s * 0.2, -s); c.lineTo(s * 0.55, -s); c.lineTo(s * 0.1, -s * 0.1); c.lineTo(s * 0.6, -s * 0.1); c.lineTo(-s * 0.4, s); c.lineTo(-s * 0.05, s * 0.05); c.lineTo(-s * 0.55, s * 0.05); c.closePath(); }); paint(c, col); }
      else if (p.shape === 'drop') { P(c, () => { c.moveTo(0, -s); c.quadraticCurveTo(s * 0.9, 0, s * 0.6, s * 0.5); c.arc(0, s * 0.4, s * 0.6, 0, Math.PI); c.quadraticCurveTo(-s * 0.9, 0, 0, -s); }); paint(c, col); }
      else if (p.shape === 'ring') { P(c, () => c.arc(0, 0, s, 0, TAU)); c.lineWidth = s * 0.45; c.strokeStyle = ink(col); c.stroke(); c.lineWidth = s * 0.25; c.strokeStyle = col; c.stroke(); }
      else { star5(c, 0, 0, s, s * 0.45); paint(c, col); }
      c.restore(); },
    // 齒輪
    gear(c, r, p) { const x = (p.x || 0) * r, y = (p.y || -1.05) * r, s = (p.s || 0.38) * r, n = p.teeth || 8, col = p.col || '#b0bec5';
      P(c, () => { for (let k = 0; k < n * 2; k++) { const a = k / (n * 2) * TAU, rr = k % 2 ? s * 0.78 : s; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); }); paint(c, col);
      P(c, () => c.arc(x, y, s * 0.32, 0, TAU)); c.fillStyle = ink(col); c.fill(); },
    // 往下滴的液體（畫在 back，從身體下緣冒出）
    drips(c, r, p) { const col = p.col; [[-0.5, 0.3], [0.1, 0.42], [0.55, 0.25]].forEach(([x, l]) => { P(c, () => c.ellipse(x * r, r * 0.8 + l * r * 0.5, r * 0.13, l * r, 0, 0, TAU)); paint(c, col, { lw: 0.05 }); }); },
    // 果凍高光＋氣泡（body）
    gloss(c, r) { c.fillStyle = '#ffffff55'; P(c, () => c.ellipse(-r * 0.35, -r * 0.5, r * 0.3, r * 0.16, -0.6, 0, TAU)); c.fill(); c.fillStyle = '#ffffff33'; [[0.5, 0.45, 0.1], [0.3, 0.65, 0.06], [-0.55, 0.4, 0.07]].forEach(([x, y, s]) => { P(c, () => c.arc(x * r, y * r, s * r, 0, TAU)); c.fill(); }); },
    // 彈簧（頭頂）
    coil(c, r, p) { c.lineCap = 'round'; const seg = () => { c.beginPath(); c.moveTo(0, -r * 0.8); for (let k = 0; k < 7; k++) c.lineTo((k % 2 ? 1 : -1) * r * 0.3, -r * 0.85 - k * r * 0.1); c.lineTo(0, -r * 1.55); };
      seg(); c.strokeStyle = ink('#cfd8dc'); c.lineWidth = r * 0.17; c.stroke(); seg(); c.strokeStyle = '#e3e9ec'; c.lineWidth = r * 0.09; c.stroke();
      P(c, () => c.arc(0, -r * 1.6, r * 0.17, 0, TAU)); paint(c, p.tip || '#2ec4b6', { hi: 0.7 }); },
    // 斜紋／條紋（body）
    stripes(c, r, p) { c.fillStyle = p.col || '#ffffff2a'; const n = p.n || 3; for (let k = 0; k < n; k++) { const y = -r * 0.6 + k * r * 1.2 / Math.max(1, n - 1); c.save(); c.translate(0, y); c.rotate(p.rot || -0.25); c.fillRect(-r * 1.2, -r * 0.06, r * 2.4, r * 0.12); c.restore(); } },
    // 圓點花紋（body）
    dots(c, r, p) { c.fillStyle = p.col || '#ffffff35'; const n = p.n || 5; for (let k = 0; k < n; k++) { const a = k / n * TAU + 0.4; P(c, () => c.arc(Math.cos(a) * r * 0.68, Math.sin(a) * r * 0.68 + r * 0.05, r * 0.11, 0, TAU)); c.fill(); } }
  };
  // 羈絆 → 預設零件（新角色沒寫造型時自動套）：第一羈絆決定頭飾，第二羈絆決定身上花紋
  const TRAIT_LOOK = {
    blast: { back: [['flames', { s: 0.8 }]], body: [['emblem', { shape: 'star', col: '#ffcc00' }]] },
    magnet: { back: [['antenna', { tip: '#e53935', col: '#c0c6d0' }]], body: [['emblem', { shape: 'ring', col: '#6b8cff' }]] },
    wall: { front: [['helmet', {}]], body: [['bands', { ys: [0.55], col: '#4f6b3a' }]] },
    swift: { back: [['wings', { span: 0.7 }]], body: [['stripes', { n: 3 }]] },
    heavy: { back: [['horns', { len: 0.7 }]], body: [['rivets', { n: 8 }]] },
    toxic: { back: [['drips', {}]], body: [['dots', { col: '#c6ff7a55' }]] },
    mech: { back: [['gear', {}]], body: [['bands', { ys: [-0.05], h: 0.14, col: '#455a64' }]] },
    bounce: { back: [['coil', {}]], body: [['dots', {}]] }
  };

  // ---- 角色造型：資料式（零件組合）＋少量自訂函式 ----
  const custom = { // 零件庫沒有的獨特形狀
    magnetU(c, r) { c.save(); c.translate(0, -r * 1.3); c.scale(1.25, 1.25); c.lineCap = 'butt';
      P(c, () => c.arc(0, 0, r * 0.42, Math.PI, TAU)); c.lineWidth = r * 0.42; c.strokeStyle = ink('#e53935'); c.stroke(); c.lineWidth = r * 0.3; c.strokeStyle = '#e53935'; c.stroke();
      P(c, () => c.arc(0, 0, r * 0.47, Math.PI * 1.15, Math.PI * 1.4)); gloss(c, 0.05);
      [-1, 1].forEach(s => { P(c, () => c.rect(s > 0 ? r * 0.27 : -r * 0.57, 0, r * 0.3, r * 0.24)); paint(c, '#e53935', { lw: 0.05 }); P(c, () => c.rect(s > 0 ? r * 0.27 : -r * 0.57, r * 0.24, r * 0.3, r * 0.22)); paint(c, '#e8eef5', { lw: 0.05 }); });
      c.restore(); },
    bigShield(c, r) { c.save(); c.translate(r * 0.62, r * 0.32);
      P(c, () => { c.moveTo(-r * 0.4, -r * 0.44); c.lineTo(r * 0.4, -r * 0.44); c.lineTo(r * 0.4, 0); c.quadraticCurveTo(r * 0.38, r * 0.4, 0, r * 0.58); c.quadraticCurveTo(-r * 0.38, r * 0.4, -r * 0.4, 0); c.closePath(); }); paint(c, '#c9d3de', { hi: 0.7 });
      c.fillStyle = '#5a8f3a'; c.fillRect(-r * 0.06, -r * 0.32, r * 0.12, r * 0.72); c.fillRect(-r * 0.27, -r * 0.1, r * 0.54, r * 0.12);
      P(c, () => { c.moveTo(-r * 0.3, -r * 0.36); c.lineTo(r * 0.1, -r * 0.36); }); gloss(c, 0.05); c.restore(); },
    hood(c, r, col) { P(c, () => { c.arc(0, -r * 0.15, r * 1.04, Math.PI * 1.08, Math.PI * 1.92); c.lineTo(0, -r * 0.15); c.closePath(); }); paint(c, mix(col, '#2c3a2a', 0.35)); },
    feather(c, r) { c.save(); c.translate(r * 0.35, -r * 0.8); c.rotate(0.5); c.scale(1.45, 1.45);
      P(c, () => { c.moveTo(0, r * 0.3); c.quadraticCurveTo(r * 0.45, -r * 0.4, 0, -r * 1.05); c.quadraticCurveTo(-r * 0.45, -r * 0.4, 0, r * 0.3); }); paint(c, '#9fd8ff', { ink: '#2f5f88' });
      c.strokeStyle = '#2f5f88'; c.lineWidth = r * 0.05; P(c, () => { c.moveTo(0, r * 0.35); c.lineTo(0, -r * 0.95); for (let k = 0; k < 4; k++) { const yy = -r * 0.15 - k * r * 0.2; c.moveTo(0, yy); c.lineTo(r * 0.22, yy - r * 0.12); c.moveTo(0, yy); c.lineTo(-r * 0.22, yy - r * 0.12); } }); c.stroke(); c.restore(); },
    barrel(c, r) { c.strokeStyle = '#0003'; c.lineWidth = r * 0.05; for (let k = -2; k <= 2; k++) { if (!k) continue; P(c, () => c.ellipse(0, 0, Math.abs(k) * r * 0.32, r, 0, 0, TAU)); c.stroke(); }
      PARTS.bands(c, r, { ys: [-0.52, 0.52], col: '#3a3a44' });
      P(c, () => { c.moveTo(r * 0.55, -r * 0.32); c.lineTo(r * 0.82, r * 0.14); c.lineTo(r * 0.28, r * 0.14); c.closePath(); }); paint(c, '#ffcc00', { lw: 0.05 }); c.fillStyle = '#222'; c.fillRect(r * 0.53, -r * 0.14, r * 0.05, r * 0.14); },
    weights(c, r) { [0, 1].forEach(k => { P(c, () => c.ellipse(r * 0.55 + k * r * 0.25, -r * 0.95 - k * r * 0.2, r * 0.13, r * 0.2, 0.6, 0, TAU)); c.lineWidth = r * 0.16; c.strokeStyle = ink('#555f70'); c.stroke(); c.lineWidth = r * 0.09; c.strokeStyle = '#8a94a6'; c.stroke(); }); },
    nurseCap(c, r) { c.save(); c.translate(0, -r * 0.2); c.scale(1.25, 1.25); P(c, () => { c.moveTo(-r * 0.6, -r * 0.7); c.lineTo(-r * 0.45, -r * 1.25); c.lineTo(r * 0.45, -r * 1.25); c.lineTo(r * 0.6, -r * 0.7); c.closePath(); }); paint(c, '#ffffff', { ink: '#1a5f50', hi: 0, lo: 0.12 });
      c.fillStyle = '#e53935'; c.fillRect(-r * 0.07, -r * 1.18, r * 0.14, r * 0.4); c.fillRect(-r * 0.2, -r * 1.05, r * 0.4, r * 0.14); c.restore(); },
    boomerang(c, r) { c.save(); c.translate(-r * 0.1, -r * 1.05); c.rotate(-0.3); c.scale(1.3, 1.3);
      P(c, () => { c.moveTo(-r * 0.8, r * 0.15); c.quadraticCurveTo(0, -r * 0.55, r * 0.8, r * 0.15); c.lineTo(r * 0.62, r * 0.32); c.quadraticCurveTo(0, -r * 0.2, -r * 0.62, r * 0.32); c.closePath(); }); paint(c, '#b5651d');
      c.strokeStyle = '#ffe9a8'; c.lineWidth = r * 0.06; P(c, () => { c.moveTo(-r * 0.35, -r * 0.02); c.lineTo(-r * 0.2, -r * 0.12); c.moveTo(r * 0.35, -r * 0.02); c.lineTo(r * 0.2, -r * 0.12); }); c.stroke(); c.restore(); },
    plume(c, r) { P(c, () => { c.moveTo(-r * 0.1, -r * 0.9); c.quadraticCurveTo(r * 0.6, -r * 1.9, r * 1.25, -r * 1.05); c.quadraticCurveTo(r * 0.55, -r * 1.3, -r * 0.1, -r * 0.6); }); paint(c, '#d32f2f'); },
    teslaCoil(c, r) { c.strokeStyle = ink('#c0c6d0'); c.lineWidth = r * 0.18; c.lineCap = 'round'; P(c, () => { c.moveTo(0, -r * 0.8); c.lineTo(0, -r * 1.35); }); c.stroke(); c.strokeStyle = '#c0c6d0'; c.lineWidth = r * 0.1; c.stroke();
      c.strokeStyle = '#d98a3a'; c.lineWidth = r * 0.07; for (let k = 0; k < 3; k++) { P(c, () => c.ellipse(0, -r * 0.92 - k * r * 0.15, r * 0.17, r * 0.055, 0, 0, TAU)); c.stroke(); }
      const gr = c.createRadialGradient(0, -r * 1.45, 0, 0, -r * 1.45, r * 0.25); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#b39dff'); c.fillStyle = gr; P(c, () => c.arc(0, -r * 1.45, r * 0.22, 0, TAU)); c.fill(); outline(c, r * 0.05, '#4a3a8a');
      c.strokeStyle = '#e1d6ff'; c.lineWidth = r * 0.05; P(c, () => { c.moveTo(r * 0.2, -r * 1.5); c.lineTo(r * 0.38, -r * 1.42); c.lineTo(r * 0.33, -r * 1.6); c.lineTo(r * 0.52, -r * 1.55); c.moveTo(-r * 0.2, -r * 1.4); c.lineTo(-r * 0.4, -r * 1.5); c.lineTo(-r * 0.36, -r * 1.33); c.lineTo(-r * 0.54, -r * 1.38); }); c.stroke(); },
    buds(c, r, col) { [[-0.85, -0.75, 0.28], [0.9, -0.6, 0.22], [0.95, 0.35, 0.16]].forEach(([x, y, s]) => { P(c, () => c.arc(x * r, y * r, s * r, 0, TAU)); paint(c, col, { lw: 0.05 }); c.fillStyle = '#fff8'; P(c, () => c.arc(x * r - s * r * 0.3, y * r - s * r * 0.3, s * r * 0.3, 0, TAU)); c.fill(); }); },
    seam(c, r) { c.strokeStyle = '#ffffff66'; c.lineWidth = r * 0.06; c.setLineDash([r * 0.15, r * 0.12]); P(c, () => { c.moveTo(0, -r); c.lineTo(0, -r * 0.55); c.moveTo(0, r * 0.55); c.lineTo(0, r); }); c.stroke(); c.setLineDash([]); },
    scar(c, r) { c.strokeStyle = '#5a0e0acc'; c.lineWidth = r * 0.07; c.lineCap = 'round'; P(c, () => { c.moveTo(r * 0.25, -r * 0.65); c.lineTo(r * 0.6, -r * 0.1); for (let k = 0; k < 3; k++) { const f = 0.25 + k * 0.25, x = r * (0.25 + 0.35 * f), y = r * (-0.65 + 0.55 * f); c.moveTo(x - r * 0.1, y + r * 0.06); c.lineTo(x + r * 0.1, y - r * 0.06); } }); c.stroke(); },
    fuse(c, r) { P(c, () => c.rect(-r * 0.2, -r * 1.05, r * 0.4, r * 0.3)); paint(c, '#3a3a44', { lw: 0.05 });
      c.strokeStyle = '#c9a66b'; c.lineWidth = r * 0.09; c.lineCap = 'round'; P(c, () => { c.moveTo(0, -r * 1.05); c.quadraticCurveTo(r * 0.1, -r * 1.4, r * 0.45, -r * 1.35); }); c.stroke();
      c.fillStyle = '#ffe066'; star5(c, r * 0.5, -r * 1.38, r * 0.26, r * 0.1); c.fill(); c.fillStyle = '#ff7a1a'; star5(c, r * 0.5, -r * 1.38, r * 0.13, r * 0.06); c.fill(); },
    hazard(c, r) { c.fillStyle = '#0003'; c.fillRect(-r, r * 0.3, r * 2, r * 0.2); c.fillStyle = '#ffd54f'; for (let k = -3; k <= 3; k++) { P(c, () => { c.moveTo(k * r * 0.3, r * 0.3); c.lineTo(k * r * 0.3 + r * 0.15, r * 0.3); c.lineTo(k * r * 0.3 + r * 0.05, r * 0.5); c.lineTo(k * r * 0.3 - r * 0.1, r * 0.5); }); c.fill(); } },
    nose(c, r) { const gr = c.createLinearGradient(-r, 0, r, 0); gr.addColorStop(0, '#9a5a28'); gr.addColorStop(0.42, '#ffe1b0'); gr.addColorStop(1, '#8a4520'); c.fillStyle = gr;
      P(c, () => { c.moveTo(-r * 0.92, -r * 0.42); c.quadraticCurveTo(-r * 0.8, -r * 1.45, 0, -r * 1.85); c.quadraticCurveTo(r * 0.8, -r * 1.45, r * 0.92, -r * 0.42); c.quadraticCurveTo(0, -r * 0.55, -r * 0.92, -r * 0.42); c.closePath(); }); c.fill(); outline(c, r * 0.075, '#4a2508');
      P(c, () => { c.moveTo(-r * 0.45, -r * 0.8); c.quadraticCurveTo(-r * 0.35, -r * 1.35, -r * 0.05, -r * 1.65); }); gloss(c, 0.06); },
    swirl(c, r) { c.lineCap = 'round';
      for (let arm = 0; arm < 3; arm++) { c.beginPath(); for (let k = 0; k <= 24; k++) { const f = k / 24, a = arm * TAU / 3 + f * 4.2, rr = r * (0.12 + f * 0.82); k ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.strokeStyle = arm ? '#9b7bff88' : '#d4b8ffaa'; c.lineWidth = r * 0.1; c.stroke(); }
      const gr = c.createRadialGradient(0, 0, 0, 0, 0, r * 0.45); gr.addColorStop(0, '#000'); gr.addColorStop(1, '#0000'); c.fillStyle = gr; P(c, () => c.arc(0, 0, r * 0.45, 0, TAU)); c.fill(); },
    diskBack(c, r) { c.strokeStyle = '#8a4a00'; c.lineWidth = r * 0.2; P(c, () => c.ellipse(0, 0, r * 1.45, r * 0.42, -0.35, Math.PI, TAU)); c.stroke(); c.strokeStyle = '#ffb347'; c.lineWidth = r * 0.12; c.stroke(); },
    diskFront(c, r) { c.strokeStyle = '#8a4a00'; c.lineWidth = r * 0.2; P(c, () => c.ellipse(0, 0, r * 1.45, r * 0.42, -0.35, 0.25, Math.PI - 0.25)); c.stroke(); c.strokeStyle = '#ffd27a'; c.lineWidth = r * 0.12; c.stroke(); c.strokeStyle = '#fff8'; c.lineWidth = r * 0.04; c.stroke(); },
    pigEars(c, r, col) { [-1, 1].forEach(s => { P(c, () => { c.moveTo(s * r * 0.25, -r * 0.85); c.lineTo(s * r * 0.75, -r * 1.2); c.lineTo(s * r * 0.75, -r * 0.55); c.closePath(); }); paint(c, mix(col, '#c2185b', 0.3), { ink: '#8a3a5a' }); }); },
    coinSlot(c, r) { c.fillStyle = '#6a2a44'; c.fillRect(-r * 0.25, -r * 0.82, r * 0.5, r * 0.09); },
    snout(c, r) { c.fillStyle = '#f48fb1'; P(c, () => c.ellipse(0, r * 0.35, r * 0.3, r * 0.2, 0, 0, TAU)); c.fill(); outline(c, r * 0.05, '#8a3a5a'); c.fillStyle = '#8a3a5a'; [-1, 1].forEach(s => { P(c, () => c.ellipse(s * r * 0.11, r * 0.35, r * 0.05, r * 0.08, 0, 0, TAU)); c.fill(); }); },
    shroomCap(c, r) { P(c, () => { c.moveTo(-r * 1.15, -r * 0.45); c.quadraticCurveTo(-r * 1.05, -r * 1.55, 0, -r * 1.55); c.quadraticCurveTo(r * 1.05, -r * 1.55, r * 1.15, -r * 0.45); c.quadraticCurveTo(0, -r * 0.7, -r * 1.15, -r * 0.45); }); paint(c, '#8e2bc2');
      c.fillStyle = '#c6ff7a'; [[-0.55, -0.85, 0.16], [0.15, -1.2, 0.2], [0.65, -0.8, 0.13], [-0.2, -0.75, 0.1]].forEach(([x, y, s]) => { P(c, () => c.arc(x * r, y * r, s * r, 0, TAU)); c.fill(); });
      P(c, () => c.arc(0, -r * 0.25, r * 1.15, Math.PI * 1.25, Math.PI * 1.45)); gloss(c, 0.06); },
    plug(c, r) { P(c, () => c.rect(-r * 0.15, -r * 1.2, r * 0.3, r * 0.3)); paint(c, '#444', { lw: 0.05 }); },
    crystals(c, r) { [[-0.5, 0.55, -0.35], [0, 0.85, 0], [0.5, 0.55, 0.35]].forEach(([x, h, rot]) => { c.save(); c.translate(x * r, -r * 0.7); c.rotate(rot); P(c, () => { c.moveTo(-r * 0.17, 0); c.lineTo(0, -r * h - r * 0.2); c.lineTo(r * 0.17, 0); c.closePath(); }); paint(c, '#e1f5fe', { ink: '#3f8fbf', hi: 0.6 }); c.fillStyle = '#9fd8f5'; P(c, () => { c.moveTo(0, 0); c.lineTo(0, -r * h - r * 0.2); c.lineTo(r * 0.17, 0); }); c.fill(); c.restore(); }); },
    cracks(c, r) { c.strokeStyle = '#ffffff66'; c.lineWidth = r * 0.04; P(c, () => { c.moveTo(-r * 0.7, -r * 0.2); c.lineTo(-r * 0.2, r * 0.75); c.lineTo(r * 0.5, r * 0.6); c.lineTo(r * 0.8, -r * 0.1); c.moveTo(-r * 0.2, r * 0.75); c.lineTo(0, r * 0.2); }); c.stroke(); },
    cape(c, r) { P(c, () => { c.moveTo(-r * 1.25, r * 0.05); c.lineTo(-r * 0.95, -r * 1.1); c.lineTo(-r * 0.3, -r * 0.2); c.lineTo(r * 0.3, -r * 0.2); c.lineTo(r * 0.95, -r * 1.1); c.lineTo(r * 1.25, r * 0.05); c.closePath(); }); paint(c, '#2a0c18', { ink: '#0a0206' });
      c.fillStyle = '#c62828'; [-1, 1].forEach(s => { P(c, () => { c.moveTo(s * r * 1.1, 0); c.lineTo(s * r * 0.92, -r * 0.88); c.lineTo(s * r * 0.5, -r * 0.2); c.closePath(); }); c.fill(); }); },
    widow(c, r) { c.fillStyle = '#220812'; P(c, () => { c.moveTo(-r * 0.95, -r * 0.3); c.quadraticCurveTo(-r * 0.6, -r * 1.1, 0, -r * 1); c.quadraticCurveTo(r * 0.6, -r * 1.1, r * 0.95, -r * 0.3); c.quadraticCurveTo(r * 0.4, -r * 0.7, 0, -r * 0.38); c.quadraticCurveTo(-r * 0.4, -r * 0.7, -r * 0.95, -r * 0.3); }); c.fill(); },
    barrelGun(c, r) { c.save(); c.rotate(-0.5); P(c, () => c.rect(-r * 0.26, -r * 1.75, r * 0.52, r * 1.1)); const gr = c.createLinearGradient(-r * 0.26, 0, r * 0.26, 0); gr.addColorStop(0, '#37474f'); gr.addColorStop(0.45, '#b0bec5'); gr.addColorStop(1, '#37474f'); c.fillStyle = gr; c.fill(); outline(c, r * 0.07, '#1c262b');
      P(c, () => c.rect(-r * 0.34, -r * 1.87, r * 0.68, r * 0.26)); paint(c, '#263238', { lw: 0.06 }); c.restore(); },
    boltCrest(c, r) { c.save(); c.translate(0, -r * 0.25); c.scale(1.35, 1.35); P(c, () => { c.moveTo(-r * 0.1, -r * 0.7); c.lineTo(r * 0.35, -r * 1.5); c.lineTo(r * 0.2, -r * 1.05); c.lineTo(r * 0.55, -r * 1.1); c.lineTo(r * 0.05, -r * 0.4); c.closePath(); }); paint(c, '#ffeb3b', { ink: '#8a6d00' }); c.restore();
      [-1, 1].forEach(s => { P(c, () => { c.moveTo(s * r * 0.85, -r * 0.1); c.lineTo(s * r * 1.35, -r * 0.55); c.lineTo(s * r * 1.2, -r * 0.15); c.lineTo(s * r * 1.45, -r * 0.1); c.lineTo(s * r * 0.9, r * 0.25); c.closePath(); }); paint(c, '#fbc02d', { ink: '#8a6d00' }); }); },
    beak(c, r) { P(c, () => { c.moveTo(-r * 0.14, r * 0.12); c.lineTo(r * 0.14, r * 0.12); c.lineTo(0, r * 0.32); c.closePath(); }); c.fillStyle = '#ff9800'; c.fill(); outline(c, r * 0.04, '#8a4b00'); },
    // ---- 機械擴充 4 隻 ----
    curlHandle(c, r) { // 冰壺握把
      c.lineCap = 'round'; P(c, () => { c.moveTo(-r * 0.15, -r * 0.82); c.lineTo(-r * 0.15, -r * 1.2); c.quadraticCurveTo(-r * 0.12, -r * 1.42, r * 0.25, -r * 1.42); c.lineTo(r * 0.75, -r * 1.42); });
      c.strokeStyle = ink('#e53935'); c.lineWidth = r * 0.26; c.stroke(); c.strokeStyle = '#e53935'; c.lineWidth = r * 0.17; c.stroke(); c.strokeStyle = '#ffffff88'; c.lineWidth = r * 0.05; c.stroke(); },
    granite(c, r) { c.fillStyle = '#ffffff30'; [[-0.4, 0.35, 0.05], [0.2, 0.55, 0.04], [0.55, 0.1, 0.05], [-0.6, -0.1, 0.035], [0.1, -0.35, 0.03], [-0.15, 0.7, 0.04]].forEach(([x, y, s]) => { P(c, () => c.arc(x * r, y * r, s * r, 0, TAU)); c.fill(); });
      PARTS.bands(c, r, { ys: [0.62], h: 0.16, col: '#e53935' }); },
    drillBit(c, r) { // 頭頂鑽頭
      c.save(); c.translate(0, -r * 0.7); P(c, () => { c.moveTo(-r * 0.55, 0); c.lineTo(0, -r * 1.25); c.lineTo(r * 0.55, 0); c.closePath(); }); paint(c, '#cfd8dc', { hi: 0.7 });
      c.save(); P(c, () => { c.moveTo(-r * 0.55, 0); c.lineTo(0, -r * 1.25); c.lineTo(r * 0.55, 0); c.closePath(); }); c.clip(); c.strokeStyle = '#607d8b'; c.lineWidth = r * 0.08; for (let k = 0; k < 5; k++) { P(c, () => { c.moveTo(-r * 0.6, -k * r * 0.25 + r * 0.05); c.lineTo(r * 0.6, -k * r * 0.25 - r * 0.2); }); c.stroke(); } c.restore();
      P(c, () => c.rect(-r * 0.6, -r * 0.08, r * 1.2, r * 0.18)); paint(c, '#455a64', { lw: 0.05 }); c.restore(); },
    hazardLite(c, r) { PARTS.bands(c, r, { ys: [0.58], h: 0.2, col: '#263238' }); c.save(); P(c, () => c.rect(-r, r * 0.5, r * 2, r * 0.16)); c.clip(); c.fillStyle = '#ffd54f'; for (let k = -4; k <= 4; k++) { P(c, () => { c.moveTo(k * r * 0.26, r * 0.5); c.lineTo(k * r * 0.26 + r * 0.13, r * 0.5); c.lineTo(k * r * 0.26, r * 0.66); c.lineTo(k * r * 0.26 - r * 0.13, r * 0.66); }); c.fill(); } c.restore(); },
    rocks(c, r) { [[-0.95, -0.55, 0.3, -0.3], [0.95, -0.5, 0.27, 0.4], [-0.6, -1.0, 0.2, 0.2], [0.55, -1.05, 0.22, -0.5]].forEach(([x, y, s, rot]) => { c.save(); c.translate(x * r, y * r); c.rotate(rot); P(c, () => { c.moveTo(-s * r, s * r * 0.4); c.lineTo(-s * r * 0.6, -s * r * 0.7); c.lineTo(s * r * 0.4, -s * r); c.lineTo(s * r, -s * r * 0.1); c.lineTo(s * r * 0.6, s * r * 0.7); c.closePath(); }); paint(c, '#8d6e63'); c.restore(); }); },
    strata(c, r) { c.strokeStyle = '#0003'; c.lineWidth = r * 0.06; [0.15, 0.45, 0.72].forEach(y => { P(c, () => { c.moveTo(-r, y * r); for (let k = 1; k <= 6; k++) c.lineTo(-r + k * r / 3, y * r + (k % 2 ? -1 : 1) * r * 0.06); }); c.stroke(); });
      c.strokeStyle = '#ffb74d99'; c.lineWidth = r * 0.05; P(c, () => { c.moveTo(-r * 0.2, r * 0.9); c.lineTo(-r * 0.05, r * 0.55); c.lineTo(-r * 0.25, r * 0.3); c.lineTo(0, 0); }); c.stroke(); },
    cometTail(c, r) { [['#26c6da', 1.0, -0.42, 0.55], ['#80deea', 1.25, -0.78, 0.5], ['#e0f7fa', 0.95, -1.12, 0.38]].forEach(([col, L, rot, w]) => { c.save(); c.rotate(rot - 0.2); flame(c, 0, -r * 0.55, r * w, r * (0.9 + L), 0); paint(c, col, { ink: '#0e6f7a', lw: 0.05 }); c.restore(); }); },
    turretRivets(c, r) { for (let k = -2; k <= 2; k++) { P(c, () => c.arc(k * r * 0.38, -r * 0.02, r * 0.055, 0, TAU)); c.fillStyle = '#e0e6ea'; c.fill(); } },
    sparkles(c, r) { c.fillStyle = '#ffffffcc'; [[0.45, -0.45, 0.14], [-0.5, 0.45, 0.09], [0.55, 0.45, 0.07]].forEach(([x, y, s]) => { star5(c, x * r, y * r, s * r, s * r * 0.35); c.fill(); }); }
  };
  const C = n => (c, r, col) => custom[n](c, r, col);
  const LOOK = {
    spark: { back: [['flames', {}]], body: [['emblem', { shape: 'star', col: '#ffe066', s: 0.18 }]] },
    magnet: { back: [C('magnetU')], body: [['emblem', { shape: 'ring', col: '#e8eef5', s: 0.18 }]] },
    shield: { back: [C('hood')], front: [C('bigShield')] },
    feather: { back: [C('feather')], body: [['stripes', { n: 3, col: '#9fd8ff40' }]] },
    barrel: { body: [C('barrel')] },
    ironball: { back: [C('weights')], body: [['rivets', { n: 8 }]] },
    medic: { back: [C('nurseCap')], body: [['emblem', { shape: 'cross', col: '#ffffff', s: 0.17, y: 0.6 }]] },
    jelly: { back: [['drips', {}]], body: [['gloss', {}]] },
    boomer: { back: [C('boomerang')], body: [['stripes', { n: 2, col: '#b5651d40' }]] },
    captain: { back: [C('plume')], front: [['helmet', { crest: '#ffd54f' }]] },
    tesla: { back: [C('teslaCoil')], body: [['emblem', { shape: 'bolt', col: '#e1d6ff', s: 0.2 }]] },
    splitter: { back: [C('buds')], body: [C('seam')] },
    berserker: { back: [['horns', { col: '#f2e6c9' }]], body: [C('scar')] },
    detonator: { back: [C('fuse')], body: [C('hazard')] },
    spring: { back: [['coil', {}]], body: [['dots', { n: 4 }]] },
    bullet: { front: [C('nose')], body: [['bands', { ys: [0.52], h: 0.14, col: '#8a4520' }]] },
    blackhole: { back: [C('diskBack')], body: [C('swirl')], front: [C('diskFront')] },
    piggy: { back: [C('pigEars')], body: [C('coinSlot'), ['gloss', {}]], top: [C('snout')] },
    shroom: { back: [C('shroomCap')], body: [['dots', { n: 4, col: '#ffffff30' }]] },
    mine: { back: [['spikes', {}], C('plug')], body: [['emblem', { shape: 'ring', col: '#ffffff40', s: 0.82 }]] },
    icy: { back: [C('crystals')], body: [C('cracks')] },
    vampire: { back: [C('cape')], body: [C('widow')] },
    turret: { back: [C('barrelGun')], body: [['bands', { ys: [-0.02], h: 0.16, col: '#37474f' }], C('turretRivets')] },
    thunder: { back: [C('boltCrest')], top: [C('beak')] },
    angel: { halo: true, back: [['wings', { ink: '#c9a24a' }]], body: [['emblem', { shape: 'star', col: '#ffe082', s: 0.16, y: 0.6 }]] },
    curler: { back: [C('curlHandle')], body: [C('granite')] },
    drill: { back: [C('drillBit')], body: [C('hazardLite')] },
    quake: { back: [C('rocks')], body: [C('strata')] },
    comet: { back: [C('cometTail')], body: [C('sparkles')] },
    boss: { back: [], body: [] } // 首領另外畫（bossBack/bossBody）
  };

  // 舊式（函式物件）造型表：保留相容，外部可直接塞 FA.spriteDecor.newId = { back(){}, ... }
  const DECOR = {};
  FA.spriteDecor = DECOR;
  // 規格 → 統一的 {back, body, front, top, halo}
  const runList = list => (c, r, col) => list.forEach(e => { c.save(); if (typeof e === 'function') e(c, r, col); else { const f = PARTS[e[0]]; f && f(c, r, Object.assign({ col }, e[1])); } c.restore(); });
  function compile(spec) { const o = { halo: !!spec.halo }; ['back', 'body', 'front', 'top'].forEach(k => { if (typeof spec[k] === 'function') o[k] = spec[k]; else if (spec[k] && spec[k].length) o[k] = runList(spec[k]); }); return o; }
  const compiled = {};
  function define(id, spec) { LOOK[id] = spec; delete compiled[id]; cache.clear(); dropIcons(); }
  function lookOf(id) {
    if (DECOR[id]) return DECOR[id]; // 外部函式式覆蓋
    if (compiled[id]) return compiled[id];
    let spec = LOOK[id];
    if (!spec) { // 沒寫造型：依羈絆自動組合
      const U = FA.DATA && FA.DATA.units && FA.DATA.units[id], tr = (U && U.traits) || [], h = hashId(id);
      const a = TRAIT_LOOK[tr[0]] || TRAIT_LOOK[['blast', 'magnet', 'swift', 'heavy', 'mech', 'bounce'][h % 6]], b = TRAIT_LOOK[tr[1]] || a;
      spec = { back: (a.back || []).slice(), front: (a.front || []).slice(), body: (b.body || a.body || []).slice() };
    }
    return compiled[id] = compile(spec);
  }

  // ---- 首領：大彎角＋鋸齒王冠＋肩甲尖刺、身上裂紋發紅光 ----
  function bossBack(c, r, col) {
    PARTS.spikes(c, r, { n: 10, len: 1.32, col: '#2a1a22', rot: 0 });
    [-1, 1].forEach(s => { P(c, () => { c.moveTo(s * r * 0.5, -r * 0.62); c.bezierCurveTo(s * r * 1.5, -r * 0.7, s * r * 1.55, -r * 1.3, s * r * 1.12, -r * 1.75); c.quadraticCurveTo(s * r * 1.1, -r * 1.1, s * r * 0.28, -r * 0.88); c.closePath(); }); paint(c, '#3b2630', { ink: '#0a0408', hi: 0.25 });
      c.strokeStyle = '#ffffff22'; c.lineWidth = r * 0.03; for (let k = 1; k < 5; k++) { const f = k / 5; P(c, () => { c.moveTo(s * r * (0.5 + f * 0.7), -r * (0.7 + f * 0.6)); c.lineTo(s * r * (0.35 + f * 0.6), -r * (0.85 + f * 0.55)); }); c.stroke(); } });
    PARTS.crown(c, r, { col: '#f4c430', w: 0.58, y: -0.8, h: 0.62, n: 4, gem: '#ff1744' });
  }
  function bossBody(c, r, col) {
    const gr = c.createLinearGradient(0, r * 0.25, 0, r); gr.addColorStop(0, '#0000'); gr.addColorStop(1, '#000a'); c.fillStyle = gr; c.fillRect(-r, r * 0.25, r * 2, r);
    c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = '#ff3d3d88'; c.lineWidth = r * 0.05; c.lineCap = 'round';
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + 0.3; P(c, () => { c.moveTo(Math.cos(a) * r * 0.98, Math.sin(a) * r * 0.98); c.lineTo(Math.cos(a + 0.2) * r * 0.72, Math.sin(a + 0.2) * r * 0.72); c.lineTo(Math.cos(a + 0.05) * r * 0.55, Math.sin(a + 0.05) * r * 0.55); }); c.stroke(); }
    c.restore();
  }

  // ---- 星級外框（層次：暗底 → 隊伍色斜面環 → 銀/金外環＋寶石 → 金光芒）＋羈絆色寶石 ----
  function bevelRing(c, rad, w, col, dark) { const gr = c.createLinearGradient(0, -rad, 0, rad); gr.addColorStop(0, mix(col, '#ffffff', 0.55)); gr.addColorStop(0.5, col); gr.addColorStop(1, mix(col, '#000000', dark || 0.45)); c.lineWidth = w; c.strokeStyle = gr; P(c, () => c.arc(0, 0, rad, 0, TAU)); c.stroke(); }
  function frame(c, r, star, teamCol, boss, traits) {
    if (boss) {
      c.lineWidth = r * 0.2; c.strokeStyle = '#12060c'; P(c, () => c.arc(0, 0, r * 1.02, 0, TAU)); c.stroke();
      bevelRing(c, r * 1.02, r * 0.09, '#ff2d55', 0.6);
      c.strokeStyle = '#ffd0d8aa'; c.lineWidth = r * 0.025; P(c, () => c.arc(0, 0, r * 1.02, Math.PI * 1.15, Math.PI * 1.5)); c.stroke();
      for (let k = 0; k < 4; k++) gem(c, Math.cos(k / 4 * TAU + Math.PI / 4) * r * 1.02, Math.sin(k / 4 * TAU + Math.PI / 4) * r * 1.02, r * 0.1, '#ff1744', k / 4 * TAU + Math.PI / 4);
      return;
    }
    const w = Math.max(2.2, r * 0.14);
    if (star >= 3) { // 金色光芒（最外層、畫在環的後面）
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU + Math.PI / 12, r0 = r + w * 1.3; P(c, () => { c.moveTo(Math.cos(a - 0.08) * r0, Math.sin(a - 0.08) * r0); c.lineTo(Math.cos(a) * (r0 + r * 0.2), Math.sin(a) * (r0 + r * 0.2)); c.lineTo(Math.cos(a + 0.08) * r0, Math.sin(a + 0.08) * r0); c.closePath(); }); paint(c, '#ffc531', { ink: '#7a5200', lw: 0.03, hi: 0.6 }); }
    }
    c.lineWidth = w + 2.5; c.strokeStyle = '#0a0612cc'; P(c, () => c.arc(0, 0, r, 0, TAU)); c.stroke();
    bevelRing(c, r, w, teamCol);
    c.strokeStyle = '#ffffffb0'; c.lineWidth = Math.max(0.8, w * 0.28); P(c, () => c.arc(0, 0, r - w * 0.15, Math.PI * 1.12, Math.PI * 1.42)); c.stroke();
    if (star >= 2) {
      const R2 = r + w * 0.95, mat = star >= 3 ? '#ffb300' : '#b8c7d6';
      c.lineWidth = Math.max(1.6, r * 0.1) + 1.5; c.strokeStyle = star >= 3 ? '#5a3c00' : '#2c3a48'; P(c, () => c.arc(0, 0, R2, 0, TAU)); c.stroke();
      bevelRing(c, R2, Math.max(1.6, r * 0.1), mat, 0.35);
      const n = star >= 3 ? 6 : 4;
      for (let k = 0; k < n; k++) { const a = -Math.PI / 2 + k / n * TAU; gem(c, Math.cos(a) * R2, Math.sin(a) * R2, r * (star >= 3 ? 0.13 : 0.1), star >= 3 ? (k % 2 ? '#ff4060' : '#40c4ff') : '#eaf4ff', a); }
    }
    // 羈絆色寶石：右下（不擋臉、不擋星級寶石）
    (traits || []).slice(0, 3).forEach((tc, k) => { const a = Math.PI * 0.2 + k * 0.32; gem(c, Math.cos(a) * r, Math.sin(a) * r, Math.max(1.6, r * 0.12), tc, a); });
  }

  // ---- 靜態外觀（快取） ----
  function build(id, color, star, team, boss, r) {
    R = r;
    const pad = boss ? 2.4 : 2.25, half = Math.ceil(r * pad + 4), size = half * 2;
    const cv = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(Math.ceil(size * dpr), Math.ceil(size * dpr)) : Object.assign(document.createElement('canvas'), { width: Math.ceil(size * dpr), height: Math.ceil(size * dpr) });
    const c = cv.getContext('2d'); c.scale(dpr, dpr); c.translate(half, half);
    const L = boss ? { back: bossBack, body: bossBody } : lookOf(id), teamCol = team === 0 ? '#4fd2ff' : '#ff5a5a';
    const U = FA.DATA && FA.DATA.units && FA.DATA.units[id], TR = FA.DATA && FA.DATA.traits;
    const traits = !boss && U && TR ? U.traits.map(t => TR[t] && TR[t].color).filter(Boolean) : [];
    if (L.halo) PARTS.halo(c, r, {});
    if (L.back) { c.save(); L.back(c, r, color); c.restore(); }
    // 身體底色：球體漸層（光從左上）
    const base = boss ? mix(color, '#2a0a14', 0.25) : color;
    const gr = c.createRadialGradient(-r * 0.38, -r * 0.42, r * 0.04, -r * 0.1, -r * 0.1, r * 1.15);
    gr.addColorStop(0, mix(base, '#ffffff', 0.6)); gr.addColorStop(0.42, base); gr.addColorStop(1, mix(base, '#0a0612', 0.55));
    c.fillStyle = gr; P(c, () => c.arc(0, 0, r, 0, TAU)); c.fill();
    c.save(); P(c, () => c.arc(0, 0, r, 0, TAU)); c.clip();
    if (L.body) { c.save(); L.body(c, r, color); c.restore(); }
    // 明暗交界：右下陰影
    const sh = c.createRadialGradient(-r * 0.55, -r * 0.6, r * 0.6, -r * 0.2, -r * 0.2, r * 1.6); sh.addColorStop(0, '#0000'); sh.addColorStop(0.55, '#0000'); sh.addColorStop(1, '#0a061299'); c.fillStyle = sh; c.fillRect(-r, -r, r * 2, r * 2);
    // 邊緣光：水面反光（右下一彎青白色）
    c.strokeStyle = boss ? '#ff6a8a88' : '#bff4ff99'; c.lineWidth = r * 0.12; P(c, () => c.arc(r * 0.06, r * 0.06, r * 0.93, Math.PI * 0.05, Math.PI * 0.55)); c.stroke();
    c.restore();
    // 高光：大片柔光＋小亮點
    const hl = c.createRadialGradient(-r * 0.38, -r * 0.5, 0, -r * 0.38, -r * 0.5, r * 0.5); hl.addColorStop(0, '#ffffffcc'); hl.addColorStop(1, '#ffffff00');
    c.fillStyle = hl; P(c, () => c.ellipse(-r * 0.36, -r * 0.5, r * 0.46, r * 0.3, -0.5, 0, TAU)); c.fill();
    c.fillStyle = '#ffffffee'; P(c, () => c.ellipse(-r * 0.48, -r * 0.56, r * 0.12, r * 0.07, -0.6, 0, TAU)); c.fill();
    // 同色系描邊
    c.lineWidth = Math.max(1, r * 0.06); c.strokeStyle = ink(base); P(c, () => c.arc(0, 0, r - r * 0.03, 0, TAU)); c.stroke();
    frame(c, r, star, teamCol, boss, traits);
    if (L.front) { c.save(); L.front(c, r, color); c.restore(); }
    return { cv, half, size };
  }
  const VER = 'v3';
  function get(o, r) {
    const key = VER + (o.boss ? 'B' : o.id) + '|' + o.color + '|' + (o.star || 1) + '|' + o.team + '|' + Math.round(r * 2) + '|' + dpr;
    let s = cache.get(key);
    if (!s) { if (cache.size > 160) cache.clear(); s = build(o.boss ? 'boss' : o.id, o.color, o.star || 1, o.team, o.boss, Math.round(r * 2) / 2); cache.set(key, s); }
    return s;
  }

  // ---- 表情（即時） ----
  function face(c, o, r, t, st) {
    const dark = '#1a1024', e = r * 0.3, ey = -r * 0.08, er = r * 0.15;
    c.fillStyle = dark; c.strokeStyle = dark; c.lineCap = 'round'; c.lineJoin = 'round';
    const lw = Math.max(1.4, r * 0.09);
    if (st.dead) { c.lineWidth = lw; P(c, () => { [-1, 1].forEach(s => { const x = s * e; c.moveTo(x - er, ey - er); c.lineTo(x + er, ey + er); c.moveTo(x + er, ey - er); c.lineTo(x - er, ey + er); }); }); c.stroke(); P(c, () => c.ellipse(0, r * 0.38, r * 0.16, r * 0.1, 0, 0, TAU)); c.fill(); return; }
    if (st.hurt) { // >< 眼＋張嘴
      c.lineWidth = lw; P(c, () => { c.moveTo(-e - er, ey - er); c.lineTo(-e + er * 0.6, ey); c.lineTo(-e - er, ey + er); c.moveTo(e + er, ey - er); c.lineTo(e - er * 0.6, ey); c.lineTo(e + er, ey + er); }); c.stroke();
      P(c, () => c.ellipse(0, r * 0.38, r * 0.17, r * 0.15, 0, 0, TAU)); c.fill(); c.fillStyle = '#ff6b81'; P(c, () => c.ellipse(0, r * 0.44, r * 0.1, r * 0.06, 0, 0, TAU)); c.fill();
      return;
    }
    if (st.frozen) { // 緊閉發抖
      c.lineWidth = lw; P(c, () => { [-1, 1].forEach(s => { c.moveTo(s * e - er, ey); c.lineTo(s * e + er, ey); }); }); c.stroke();
      c.lineWidth = lw * 0.8; P(c, () => { c.moveTo(-r * 0.22, r * 0.36); for (let k = 1; k <= 6; k++) c.lineTo(-r * 0.22 + k * r * 0.073, r * 0.36 + (k % 2 ? -1 : 1) * r * 0.05); }); c.stroke();
      return;
    }
    if (o.id === 'piggy' && o.team === 1 && Math.hypot(o.vx || 0, o.vy || 0) > 60) { // 次元撲滿逃跑中＝驚恐臉＋汗
      c.fillStyle = '#fff'; P(c, () => { c.arc(-e, ey, er * 1.3, 0, TAU); c.arc(e, ey, er * 1.3, 0, TAU); }); c.fill();
      c.fillStyle = dark; P(c, () => { c.arc(-e, ey, er * 0.45, 0, TAU); c.arc(e, ey, er * 0.45, 0, TAU); }); c.fill();
      P(c, () => c.ellipse(0, r * 0.4, r * 0.13, r * 0.17, 0, 0, TAU)); c.fill();
      c.fillStyle = '#8fd3ff'; [-1, 1].forEach(s => { P(c, () => { c.moveTo(s * r * 0.75, -r * 0.5); c.quadraticCurveTo(s * r * 0.88, -r * 0.25, s * r * 0.75, -r * 0.17); c.quadraticCurveTo(s * r * 0.62, -r * 0.25, s * r * 0.75, -r * 0.5); }); c.fill(); });
      return;
    }
    const blink = ((t + o.i * 0.73) % 3.4) < 0.12;
    const angry = o.team === 1 || o.boss, worried = !angry && o.hp < o.maxHp * 0.3;
    if (blink) { c.lineWidth = lw; P(c, () => { c.moveTo(-e - er, ey); c.lineTo(-e + er, ey); c.moveTo(e - er, ey); c.lineTo(e + er, ey); }); c.stroke(); }
    else {
      // 眼白（深色描邊）→ 瞳孔 → 雙高光
      c.fillStyle = '#fff'; P(c, () => { c.ellipse(-e, ey, er * 1.15, er * 1.3, 0, 0, TAU); c.moveTo(e + er * 1.15, ey); c.ellipse(e, ey, er * 1.15, er * 1.3, 0, 0, TAU); }); c.fill(); c.lineWidth = Math.max(0.8, r * 0.04); c.stroke();
      const lx = st.lookX * er * 0.35, ly = st.lookY * er * 0.35;
      if (o.boss) { c.fillStyle = '#ff1744'; P(c, () => { c.ellipse(-e + lx, ey + ly, er * 0.5, er * 0.85, 0, 0, TAU); c.moveTo(e + lx + er * 0.5, ey + ly); c.ellipse(e + lx, ey + ly, er * 0.5, er * 0.85, 0, 0, TAU); }); c.fill(); c.fillStyle = '#ffd0d8'; }
      else { c.fillStyle = dark; P(c, () => { c.arc(-e + lx, ey + ly, er * 0.74, 0, TAU); c.moveTo(e + lx + er * 0.74, ey + ly); c.arc(e + lx, ey + ly, er * 0.74, 0, TAU); }); c.fill(); c.fillStyle = '#fff'; }
      P(c, () => { c.arc(-e + lx + er * 0.25, ey + ly - er * 0.32, er * 0.27, 0, TAU); c.moveTo(e + lx + er * 0.52, ey + ly - er * 0.32); c.arc(e + lx + er * 0.25, ey + ly - er * 0.32, er * 0.27, 0, TAU); }); c.fill();
      c.fillStyle = '#ffffffaa'; P(c, () => { c.arc(-e + lx - er * 0.25, ey + ly + er * 0.3, er * 0.12, 0, TAU); c.moveTo(e + lx - er * 0.13, ey + ly + er * 0.3); c.arc(e + lx - er * 0.25, ey + ly + er * 0.3, er * 0.12, 0, TAU); }); c.fill();
      if (angry) { // 上眼皮壓低
        c.fillStyle = o.boss ? '#2a0a14' : mix(o.color, '#000', 0.25); P(c, () => { c.moveTo(-e - er * 1.3, ey - er * 1.4); c.lineTo(-e + er * 1.3, ey - er * 0.55); c.lineTo(-e + er * 1.3, ey - er * 1.6); c.closePath(); c.moveTo(e + er * 1.3, ey - er * 1.4); c.lineTo(e - er * 1.3, ey - er * 0.55); c.lineTo(e - er * 1.3, ey - er * 1.6); c.closePath(); }); c.fill();
      }
    }
    c.strokeStyle = dark; c.lineWidth = lw;
    if (angry) { P(c, () => { c.moveTo(-e - er * 1.2, ey - er * 2.1); c.lineTo(-e + er * 1.1, ey - er * 1.3); c.moveTo(e + er * 1.2, ey - er * 2.1); c.lineTo(e - er * 1.1, ey - er * 1.3); }); c.stroke(); }
    else if (worried) { P(c, () => { c.moveTo(-e - er, ey - er * 1.4); c.lineTo(-e + er, ey - er * 2); c.moveTo(e + er, ey - er * 1.4); c.lineTo(e - er, ey - er * 2); }); c.stroke(); }
    // 嘴
    if (st.poison) { c.strokeStyle = '#2e5e10'; P(c, () => { c.moveTo(-r * 0.22, r * 0.36); c.quadraticCurveTo(-r * 0.11, r * 0.28, 0, r * 0.36); c.quadraticCurveTo(r * 0.11, r * 0.44, r * 0.22, r * 0.36); }); c.stroke(); }
    else if (worried) { P(c, () => c.arc(0, r * 0.5, r * 0.16, Math.PI * 1.15, Math.PI * 1.85)); c.stroke(); }
    else if (angry) {
      if (o.boss) { c.fillStyle = '#12060c'; P(c, () => { c.moveTo(-r * 0.3, r * 0.3); c.quadraticCurveTo(0, r * 0.22, r * 0.3, r * 0.3); c.quadraticCurveTo(0, r * 0.56, -r * 0.3, r * 0.3); }); c.fill(); c.fillStyle = '#fff'; [-0.2, -0.07, 0.07, 0.2].forEach(x => { P(c, () => { c.moveTo(x * r - r * 0.05, r * 0.28); c.lineTo(x * r + r * 0.05, r * 0.28); c.lineTo(x * r, r * 0.38); }); c.fill(); }); }
      else { P(c, () => { c.moveTo(-r * 0.2, r * 0.38); c.quadraticCurveTo(0, r * 0.28, r * 0.2, r * 0.38); }); c.stroke();
        if (o.id === 'vampire') { c.fillStyle = '#fff'; [-1, 1].forEach(s => { P(c, () => { c.moveTo(s * r * 0.15, r * 0.33); c.lineTo(s * r * 0.08, r * 0.33); c.lineTo(s * r * 0.115, r * 0.47); }); c.fill(); }); } } }
    else { P(c, () => { c.moveTo(-r * 0.2, r * 0.24); c.quadraticCurveTo(0, r * 0.5, r * 0.2, r * 0.24); c.closePath(); }); c.fill(); c.fillStyle = '#ff7b93'; P(c, () => c.ellipse(0, r * 0.37, r * 0.09, r * 0.045, 0, 0, TAU)); c.fill();
      if (o.id === 'vampire') { c.fillStyle = '#fff'; [-1, 1].forEach(s => { P(c, () => { c.moveTo(s * r * 0.15, r * 0.26); c.lineTo(s * r * 0.07, r * 0.28); c.lineTo(s * r * 0.12, r * 0.42); }); c.fill(); }); } }
    if (!o.boss && !angry) { c.fillStyle = '#ff6b8166'; P(c, () => { c.ellipse(-r * 0.56, r * 0.18, r * 0.14, r * 0.08, 0, 0, TAU); c.moveTo(r * 0.7, r * 0.18); c.ellipse(r * 0.56, r * 0.18, r * 0.14, r * 0.08, 0, 0, TAU); }); c.fill(); }
  }

  // ---- 對外：畫一隻棋子 ----
  function draw(c, o, x, y, r, t, deadK) {
    dpr = Math.min(2, g.devicePixelRatio || 1);
    const sp = get(o, r), hurt = Math.max(0, o.hurt || 0), frozen = o.stunned, pois = !!o.poison, dead = deadK != null;
    const spd = Math.hypot(o.vx || 0, o.vy || 0);
    c.save(); c.translate(x, y);
    let sx = 1, sy = 1;
    if (hurt > 0) { const w = Math.sin(hurt * 14) * hurt; sx = 1 + 0.18 * w; sy = 1 - 0.18 * w; }
    if (frozen) c.translate(Math.sin(t * 40 + o.i) * r * 0.03, 0);
    if (dead) { const k = deadK; c.globalAlpha *= 1 - k; sx = sy = 1 + k * 0.5; c.rotate(k * 0.6 * (o.i % 2 ? 1 : -1)); c.translate(0, -k * r * 0.6); }
    if (o.boss && !dead) { // 壓迫感：脈動暗紅光暈＋旋轉暗刺影
      const pul = 1 + Math.sin(t * 3) * 0.06, gr = c.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 2.1 * pul);
      gr.addColorStop(0, '#ff1a4a77'); gr.addColorStop(0.6, '#8a0a2a33'); gr.addColorStop(1, '#ff1a4a00'); c.fillStyle = gr; P(c, () => c.arc(0, 0, r * 2.1 * pul, 0, TAU)); c.fill();
      c.save(); c.rotate(t * 0.4); c.fillStyle = '#12060c88'; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; P(c, () => { c.moveTo(Math.cos(a - 0.1) * r * 1.25, Math.sin(a - 0.1) * r * 1.25); c.lineTo(Math.cos(a) * r * 1.6 * pul, Math.sin(a) * r * 1.6 * pul); c.lineTo(Math.cos(a + 0.1) * r * 1.25, Math.sin(a + 0.1) * r * 1.25); }); c.fill(); } c.restore();
    }
    c.scale(sx, sy);
    c.drawImage(sp.cv, -sp.half, -sp.half, sp.size, sp.size);
    // 狀態疊色
    if (hurt > 0.4 && !dead) { c.globalAlpha = (hurt - 0.4) * 1.3; c.fillStyle = '#fff'; P(c, () => c.arc(0, 0, r, 0, TAU)); c.fill(); c.globalAlpha = 1; }
    if (pois && !dead) { c.fillStyle = `rgba(110,200,40,${0.22 + Math.sin(t * 4) * 0.06})`; P(c, () => c.arc(0, 0, r, 0, TAU)); c.fill(); }
    const lk = spd > 30 ? [o.vx / spd, o.vy / spd] : [0, o.team === 0 ? -0.6 : 0.6];
    face(c, o, r, t, { dead, hurt: hurt > 0.15 && !dead, frozen: frozen && !dead, poison: pois, lookX: lk[0], lookY: lk[1] });
    const Lk = o.boss ? null : lookOf(o.id);
    if (Lk && Lk.top) { R = r; c.save(); Lk.top(c, r, o.color); c.restore(); }
    if (frozen && !dead) { // 冰殼
      c.fillStyle = '#b3e5fc66'; P(c, () => c.arc(0, 0, r * 1.08, 0, TAU)); c.fill(); c.strokeStyle = '#e1f5fe'; c.lineWidth = Math.max(1.5, r * 0.07); c.stroke();
      c.strokeStyle = '#ffffffaa'; c.lineWidth = Math.max(1, r * 0.04); P(c, () => { c.moveTo(-r * 0.6, -r * 0.6); c.lineTo(-r * 0.2, -r * 0.1); c.lineTo(-r * 0.45, r * 0.3); c.moveTo(r * 0.5, -r * 0.7); c.lineTo(r * 0.3, -r * 0.3); }); c.stroke();
    }
    if (pois && !dead) { // 汗滴＋毒泡
      c.fillStyle = '#9ccc65'; const ph = (t * 0.8 + o.i * 0.37) % 1; P(c, () => c.arc(r * 0.55, -r * 0.9 - ph * r * 0.6, r * 0.12 * (1 - ph * 0.5), 0, TAU)); c.fill();
      c.fillStyle = '#8fd3ff'; P(c, () => { c.moveTo(r * 0.68, -r * 0.45); c.quadraticCurveTo(r * 0.8, -r * 0.2, r * 0.68, -r * 0.12); c.quadraticCurveTo(r * 0.56, -r * 0.2, r * 0.68, -r * 0.45); }); c.fill();
    }
    c.restore();
  }

  // 裝備/武器小徽章（圓底＋金邊＋圖示），快取
  const badgeCache = {};
  function badge(c, txt, x, y, s) {
    const k = txt + '|' + Math.round(s) + '|' + dpr; let b = badgeCache[k];
    if (!b) { const px = Math.ceil(s * 2 + 4), cv = document.createElement('canvas'); cv.width = cv.height = Math.ceil(px * dpr); const q = cv.getContext('2d'); q.scale(dpr, dpr); q.translate(px / 2, px / 2);
      const gr = q.createLinearGradient(0, -s, 0, s); gr.addColorStop(0, '#3a3358'); gr.addColorStop(1, '#141020'); q.fillStyle = gr; q.beginPath(); q.arc(0, 0, s, 0, TAU); q.fill();
      q.lineWidth = Math.max(1.2, s * 0.16); const g2 = q.createLinearGradient(0, -s, 0, s); g2.addColorStop(0, '#fff3a0'); g2.addColorStop(1, '#b07800'); q.strokeStyle = g2; q.stroke();
      q.font = `${Math.round(s * 1.15)}px -apple-system,"Apple Color Emoji","Segoe UI Emoji",sans-serif`; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText(txt, 0, s * 0.08);
      b = badgeCache[k] = { cv, px }; }
    c.drawImage(b.cv, x - b.px / 2, y - b.px / 2, b.px, b.px);
  }

  // 圖示（給商店/圖鑑用）：回傳 dataURL
  const iconCache = {};
  function icon(id, star, px) {
    const k = id + '|' + (star || 1) + '|' + px; if (iconCache[k]) return iconCache[k];
    const U = FA.DATA && FA.DATA.units[id]; if (!U) return '';
    const cv = document.createElement('canvas'), d = 2; cv.width = cv.height = px * d; const c = cv.getContext('2d'); c.scale(d, d);
    const r = px / 3.6; draw(c, { id, color: U.color, star: star || 1, team: 0, i: 0, hp: 1, maxHp: 1 }, px / 2, px / 2 + r * 0.25, r, 0.5);
    return iconCache[k] = shortUrl(cv.toDataURL());
  }
  // dataURL（每張數 KB）轉成 blob: 短網址：商店每次重畫都把圖示塞進 innerHTML，長字串解析很慢；同一網址瀏覽器也只解碼一次
  function shortUrl(d) {
    try {
      if (typeof URL === 'undefined' || !URL.createObjectURL || typeof Blob === 'undefined') return d;
      const bin = atob(d.slice(d.indexOf(',') + 1)), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([u8], { type: 'image/png' }));
    } catch (e) { return d; }
  }
  const dropIcons = () => { for (const k in iconCache) { const u = iconCache[k]; if (u && u.startsWith('blob:')) try { URL.revokeObjectURL(u); } catch (e) { } delete iconCache[k]; } };

  FA.sprites = { draw, icon, badge, define, parts: PARTS, looks: LOOK, traitLooks: TRAIT_LOOK, kit: { paint, ink, gloss, flame, star5, gem, mix },
    clear: () => { cache.clear(); for (const k in compiled) delete compiled[k]; }, mix, hex, lum };
})(globalThis);
