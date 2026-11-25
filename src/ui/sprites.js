// 角色外觀：依角色 id 畫頭飾/紋路（向量），靜態部分用離屏 canvas 快取；表情與狀態每幀即時畫
// 用法：FA.sprites.draw(ctx, o, x, y, r, t, dt)；FA.sprites.icon(id, star, px) 回傳 dataURL（商店/圖鑑可用）
(function (g) {
  const FA = g.FA = g.FA || {};
  const TAU = Math.PI * 2;
  const cache = new Map();
  let dpr = 1;

  // ---- 色彩工具 ----
  const hex = c => { c = (c || '#888').replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join(''); const n = parseInt(c.slice(0, 6), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgb = (a, al) => al == null ? `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})` : `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${al})`;
  const mix = (c, d, k) => { const a = hex(c), b = hex(d); return rgb([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]); };
  const lum = c => { const a = hex(c); return (a[0] * 0.3 + a[1] * 0.59 + a[2] * 0.11) / 255; };
  const hashId = s => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };

  // ---- 小工具形狀 ----
  const P = (c, f) => { c.beginPath(); f(); };
  function star5(c, x, y, R, r) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); }
  function flame(c, x, y, w, h, lean) { c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x - w * 0.9, y - h * 0.55, x + lean, y - h); c.quadraticCurveTo(x + w * 0.9, y - h * 0.5, x + w, y); c.closePath(); }
  const outline = (c, w, col) => { c.lineWidth = w; c.strokeStyle = col || '#0008'; c.lineJoin = 'round'; c.stroke(); };

  // ---- 每隻角色的裝飾：back 畫在身體後面、front 畫在身體上面（座標以中心為原點，r=半徑） ----
  const DECOR = {
    spark: { back(c, r) { // 火焰髮
      [[-0.45, 0.7, -0.25], [0.45, 0.75, 0.25], [0, 1.05, 0.05]].forEach(([dx, h, l]) => { flame(c, dx * r, -r * 0.55, r * 0.38, r * h + r * 0.5, l * r); c.fillStyle = '#ff5a1f'; c.fill(); outline(c, r * 0.06, '#7a1d00aa'); });
      [[-0.2, 0.55], [0.22, 0.6]].forEach(([dx, h]) => { flame(c, dx * r, -r * 0.6, r * 0.2, r * h + r * 0.3, 0); c.fillStyle = '#ffd23f'; c.fill(); });
    } },
    magnet: { back(c, r) { // U 型磁鐵
      c.save(); c.translate(0, -r * 1.3); c.scale(1.25, 1.25); c.lineCap = 'butt';
      c.lineWidth = r * 0.3; c.strokeStyle = '#e53935'; P(c, () => c.arc(0, 0, r * 0.42, Math.PI, TAU)); c.stroke();
      c.fillStyle = '#e53935'; c.fillRect(-r * 0.57, 0, r * 0.3, r * 0.25); c.fillRect(r * 0.27, 0, r * 0.3, r * 0.25);
      c.fillStyle = '#e8eef5'; c.fillRect(-r * 0.57, r * 0.25, r * 0.3, r * 0.22); c.fillRect(r * 0.27, r * 0.25, r * 0.3, r * 0.22);
      c.restore();
    } },
    shield: { front(c, r) { // 大盾
      c.save(); c.translate(r * 0.62, r * 0.32);
      c.beginPath(); c.moveTo(-r * 0.38, -r * 0.42); c.lineTo(r * 0.38, -r * 0.42); c.lineTo(r * 0.38, 0); c.quadraticCurveTo(r * 0.36, r * 0.38, 0, r * 0.55); c.quadraticCurveTo(-r * 0.36, r * 0.38, -r * 0.38, 0); c.closePath();
      const gr = c.createLinearGradient(0, -r * 0.4, 0, r * 0.5); gr.addColorStop(0, '#dfe7ef'); gr.addColorStop(1, '#8a99a8'); c.fillStyle = gr; c.fill(); outline(c, r * 0.07, '#2c3a2a');
      c.fillStyle = '#5a8f3a'; c.fillRect(-r * 0.06, -r * 0.32, r * 0.12, r * 0.7); c.fillRect(-r * 0.26, -r * 0.1, r * 0.52, r * 0.12);
      c.restore();
    }, back(c, r) { c.fillStyle = '#6d7f5a'; P(c, () => c.arc(0, -r * 0.15, r * 1.02, Math.PI * 1.08, Math.PI * 1.92)); c.lineTo(0, -r * 0.15); c.fill(); } },
    feather: { back(c, r) { // 頭上大羽毛
      c.save(); c.translate(r * 0.35, -r * 0.8); c.rotate(0.5); c.scale(1.45, 1.45);
      c.beginPath(); c.moveTo(0, r * 0.3); c.quadraticCurveTo(r * 0.45, -r * 0.4, 0, -r * 1.05); c.quadraticCurveTo(-r * 0.45, -r * 0.4, 0, r * 0.3);
      c.fillStyle = '#9fd8ff'; c.fill(); outline(c, r * 0.05, '#3b6f99');
      c.strokeStyle = '#3b6f99'; c.lineWidth = r * 0.05; P(c, () => { c.moveTo(0, r * 0.35); c.lineTo(0, -r * 0.95); }); c.stroke();
      for (let k = 0; k < 4; k++) { const yy = -r * 0.15 - k * r * 0.2; P(c, () => { c.moveTo(0, yy); c.lineTo(r * 0.22, yy - r * 0.12); c.moveTo(0, yy); c.lineTo(-r * 0.22, yy - r * 0.12); }); c.stroke(); }
      c.restore();
    } },
    barrel: { body(c, r) { // 木桶板＋鐵箍
      c.strokeStyle = '#0003'; c.lineWidth = r * 0.05; for (let k = -2; k <= 2; k++) { P(c, () => c.ellipse(0, 0, Math.abs(k) * r * 0.32 + 0.01, r, 0, 0, TAU)); if (k) c.stroke(); }
      c.fillStyle = '#3a3a44'; [-0.52, 0.52].forEach(y => { c.fillRect(-r, y * r - r * 0.09, r * 2, r * 0.18); });
      c.fillStyle = '#9aa0ab'; [-0.52, 0.52].forEach(y => { c.fillRect(-r, y * r - r * 0.09, r * 2, r * 0.05); });
      c.fillStyle = '#ffcc00'; c.beginPath(); c.moveTo(r * 0.55, -r * 0.3); c.lineTo(r * 0.78, r * 0.12); c.lineTo(r * 0.32, r * 0.12); c.closePath(); c.fill();
    } },
    ironball: { body(c, r) { // 鉚釘
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, x = Math.cos(a) * r * 0.8, y = Math.sin(a) * r * 0.8; c.fillStyle = '#4a5466'; P(c, () => c.arc(x, y, r * 0.09, 0, TAU)); c.fill(); c.fillStyle = '#dfe6f0'; P(c, () => c.arc(x - r * 0.025, y - r * 0.03, r * 0.04, 0, TAU)); c.fill(); }
    }, back(c, r) { c.strokeStyle = '#555f70'; c.lineWidth = r * 0.12; for (let k = 0; k < 2; k++) { P(c, () => c.ellipse(r * 0.55 + k * r * 0.25, -r * 0.95 - k * r * 0.2, r * 0.13, r * 0.2, 0.6, 0, TAU)); c.stroke(); } } },
    medic: { back(c, r) { // 護士帽
      c.translate(0, -r * 0.2); c.scale(1.25, 1.25); c.beginPath(); c.moveTo(-r * 0.6, -r * 0.7); c.lineTo(-r * 0.45, -r * 1.25); c.lineTo(r * 0.45, -r * 1.25); c.lineTo(r * 0.6, -r * 0.7); c.closePath();
      c.fillStyle = '#fff'; c.fill(); outline(c, r * 0.06, '#1a5f50');
      c.fillStyle = '#e53935'; c.fillRect(-r * 0.07, -r * 1.18, r * 0.14, r * 0.4); c.fillRect(-r * 0.2, -r * 1.05, r * 0.4, r * 0.14);
    } },
    jelly: { body(c, r) { // 果凍反光＋氣泡
      c.fillStyle = '#ffffff55'; P(c, () => c.ellipse(-r * 0.35, -r * 0.5, r * 0.3, r * 0.16, -0.6, 0, TAU)); c.fill();
      c.fillStyle = '#ffffff33'; [[0.5, 0.45, 0.1], [0.3, 0.65, 0.06], [-0.55, 0.4, 0.07]].forEach(([x, y, s]) => { P(c, () => c.arc(x * r, y * r, s * r, 0, TAU)); c.fill(); });
    }, back(c, r, col) { c.fillStyle = col; [[-0.5, 0.3], [0.1, 0.42], [0.55, 0.25]].forEach(([x, l]) => { P(c, () => { c.ellipse(x * r, r * 0.8 + l * r * 0.5, r * 0.13, l * r, 0, 0, TAU); }); c.fill(); }); } },
    boomer: { back(c, r) { // 迴力鏢
      c.save(); c.translate(-r * 0.1, -r * 1.05); c.rotate(-0.3); c.scale(1.3, 1.3);
      c.beginPath(); c.moveTo(-r * 0.8, r * 0.15); c.quadraticCurveTo(0, -r * 0.55, r * 0.8, r * 0.15); c.lineTo(r * 0.62, r * 0.32); c.quadraticCurveTo(0, -r * 0.2, -r * 0.62, r * 0.32); c.closePath();
      c.fillStyle = '#b5651d'; c.fill(); outline(c, r * 0.06, '#5a2e0a'); c.strokeStyle = '#ffe9a8'; c.lineWidth = r * 0.06; P(c, () => { c.moveTo(-r * 0.35, -r * 0.02); c.lineTo(-r * 0.2, -r * 0.12); c.moveTo(r * 0.35, -r * 0.02); c.lineTo(r * 0.2, -r * 0.12); }); c.stroke();
      c.restore();
    } },
    captain: { back(c, r) { c.fillStyle = '#d32f2f'; c.beginPath(); c.moveTo(-r * 0.1, -r * 0.9); c.quadraticCurveTo(r * 0.6, -r * 1.9, r * 1.25, -r * 1.05); c.quadraticCurveTo(r * 0.55, -r * 1.3, -r * 0.1, -r * 0.6); c.fill(); outline(c, r * 0.05, '#6a0f0f'); },
    front(c, r) { // 頭盔＋紅羽
      const gr = c.createLinearGradient(0, -r, 0, -r * 0.2); gr.addColorStop(0, '#e9eef3'); gr.addColorStop(1, '#8796a6'); c.fillStyle = gr;
      P(c, () => { c.arc(0, -r * 0.12, r * 1.04, Math.PI * 1.06, Math.PI * 1.94); c.closePath(); }); c.fill(); outline(c, r * 0.06, '#334');
      c.fillStyle = '#ffd54f'; c.fillRect(-r * 0.08, -r * 1.16, r * 0.16, r * 0.82); c.fillRect(-r * 0.95, -r * 0.42, r * 1.9, r * 0.1);
    } },
    tesla: { back(c, r) { // 特斯拉線圈
      c.strokeStyle = '#c0c6d0'; c.lineWidth = r * 0.12; P(c, () => { c.moveTo(0, -r * 0.8); c.lineTo(0, -r * 1.35); }); c.stroke();
      c.strokeStyle = '#d98a3a'; c.lineWidth = r * 0.07; for (let k = 0; k < 3; k++) { P(c, () => c.ellipse(0, -r * 0.92 - k * r * 0.15, r * 0.16, r * 0.05, 0, 0, TAU)); c.stroke(); }
      const gr = c.createRadialGradient(0, -r * 1.45, 0, 0, -r * 1.45, r * 0.25); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#b39dff'); c.fillStyle = gr; P(c, () => c.arc(0, -r * 1.45, r * 0.22, 0, TAU)); c.fill();
      c.strokeStyle = '#e1d6ff'; c.lineWidth = r * 0.05; P(c, () => { c.moveTo(r * 0.2, -r * 1.5); c.lineTo(r * 0.38, -r * 1.42); c.lineTo(r * 0.33, -r * 1.6); c.lineTo(r * 0.52, -r * 1.55); c.moveTo(-r * 0.2, -r * 1.4); c.lineTo(-r * 0.4, -r * 1.5); c.lineTo(-r * 0.36, -r * 1.33); c.lineTo(-r * 0.54, -r * 1.38); }); c.stroke();
    } },
    splitter: { back(c, r, col) { // 小分裂泡
      [[-0.85, -0.75, 0.28], [0.9, -0.6, 0.22], [0.95, 0.35, 0.16]].forEach(([x, y, s]) => { c.fillStyle = col; P(c, () => c.arc(x * r, y * r, s * r, 0, TAU)); c.fill(); outline(c, r * 0.05, '#0006'); c.fillStyle = '#fff8'; P(c, () => c.arc(x * r - s * r * 0.3, y * r - s * r * 0.3, s * r * 0.3, 0, TAU)); c.fill(); });
    }, body(c, r) { c.strokeStyle = '#ffffff66'; c.lineWidth = r * 0.06; c.setLineDash([r * 0.15, r * 0.12]); P(c, () => { c.moveTo(0, -r); c.lineTo(0, -r * 0.55); c.moveTo(0, r * 0.55); c.lineTo(0, r); }); c.stroke(); c.setLineDash([]); } },
    berserker: { back(c, r) { // 牛角
      [-1, 1].forEach(s => { c.beginPath(); c.moveTo(s * r * 0.45, -r * 0.7); c.quadraticCurveTo(s * r * 1.15, -r * 0.9, s * r * 1.0, -r * 1.45); c.quadraticCurveTo(s * r * 0.85, -r * 1.0, s * r * 0.2, -r * 0.88); c.closePath(); c.fillStyle = '#f2e6c9'; c.fill(); outline(c, r * 0.06, '#5a4630'); });
    }, body(c, r) { c.strokeStyle = '#5a0e0acc'; c.lineWidth = r * 0.07; c.lineCap = 'round'; P(c, () => { c.moveTo(r * 0.25, -r * 0.65); c.lineTo(r * 0.6, -r * 0.1); for (let k = 0; k < 3; k++) { const f = 0.25 + k * 0.25, x = r * (0.25 + 0.35 * f), y = r * (-0.65 + 0.55 * f); c.moveTo(x - r * 0.1, y + r * 0.06); c.lineTo(x + r * 0.1, y - r * 0.06); } }); c.stroke(); } },
    detonator: { back(c, r) { // 炸彈引信
      c.fillStyle = '#333'; c.fillRect(-r * 0.2, -r * 1.05, r * 0.4, r * 0.3);
      c.strokeStyle = '#c9a66b'; c.lineWidth = r * 0.09; c.lineCap = 'round'; P(c, () => { c.moveTo(0, -r * 1.05); c.quadraticCurveTo(r * 0.1, -r * 1.4, r * 0.45, -r * 1.35); }); c.stroke();
      c.fillStyle = '#ffe066'; star5(c, r * 0.5, -r * 1.38, r * 0.25, r * 0.1); c.fill(); c.fillStyle = '#ff7a1a'; star5(c, r * 0.5, -r * 1.38, r * 0.13, r * 0.06); c.fill();
    }, body(c, r) { c.fillStyle = '#0003'; c.fillRect(-r, r * 0.3, r * 2, r * 0.2); c.fillStyle = '#ffd54f'; for (let k = -3; k <= 3; k++) { c.beginPath(); c.moveTo(k * r * 0.3, r * 0.3); c.lineTo(k * r * 0.3 + r * 0.15, r * 0.3); c.lineTo(k * r * 0.3 + r * 0.05, r * 0.5); c.lineTo(k * r * 0.3 - r * 0.1, r * 0.5); c.fill(); } } },
    spring: { back(c, r) { // 彈簧
      c.strokeStyle = '#cfd8dc'; c.lineWidth = r * 0.1; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, -r * 0.8);
      for (let k = 0; k < 7; k++) c.lineTo((k % 2 ? 1 : -1) * r * 0.3, -r * 0.85 - k * r * 0.1); c.lineTo(0, -r * 1.55); c.stroke();
      c.fillStyle = '#2ec4b6'; P(c, () => c.arc(0, -r * 1.58, r * 0.16, 0, TAU)); c.fill(); outline(c, r * 0.05, '#0006');
    } },
    bullet: { front(c, r) { // 彈頭尖帽
      const gr = c.createLinearGradient(-r, 0, r, 0); gr.addColorStop(0, '#b87333'); gr.addColorStop(0.45, '#ffd9a0'); gr.addColorStop(1, '#a0522d'); c.fillStyle = gr;
      c.beginPath(); c.moveTo(-r * 0.92, -r * 0.42); c.quadraticCurveTo(-r * 0.8, -r * 1.45, 0, -r * 1.85); c.quadraticCurveTo(r * 0.8, -r * 1.45, r * 0.92, -r * 0.42); c.quadraticCurveTo(0, -r * 0.55, -r * 0.92, -r * 0.42); c.closePath(); c.fill(); outline(c, r * 0.06, '#5a3010');
    }, body(c, r) { c.fillStyle = '#00000030'; c.fillRect(-r, r * 0.45, r * 2, r * 0.14); c.fillStyle = '#ffffff40'; c.fillRect(-r, r * 0.45, r * 2, r * 0.04); } },
    blackhole: { body(c, r) { // 漩渦
      c.lineCap = 'round';
      for (let arm = 0; arm < 3; arm++) { c.beginPath(); for (let k = 0; k <= 24; k++) { const f = k / 24, a = arm * TAU / 3 + f * 4.2, rr = r * (0.12 + f * 0.82); k ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.strokeStyle = arm ? '#9b7bff88' : '#d4b8ffaa'; c.lineWidth = r * 0.1; c.stroke(); }
      const gr = c.createRadialGradient(0, 0, 0, 0, 0, r * 0.45); gr.addColorStop(0, '#000'); gr.addColorStop(1, '#0000'); c.fillStyle = gr; P(c, () => c.arc(0, 0, r * 0.45, 0, TAU)); c.fill();
    }, back(c, r) { c.strokeStyle = '#ffb347aa'; c.lineWidth = r * 0.14; P(c, () => c.ellipse(0, 0, r * 1.45, r * 0.42, -0.35, Math.PI, TAU)); c.stroke(); },
      front(c, r) { c.strokeStyle = '#ffcf7acc'; c.lineWidth = r * 0.14; P(c, () => c.ellipse(0, 0, r * 1.45, r * 0.42, -0.35, 0.25, Math.PI - 0.25)); c.stroke(); } },
    piggy: { back(c, r, col) { [-1, 1].forEach(s => { c.beginPath(); c.moveTo(s * r * 0.25, -r * 0.85); c.lineTo(s * r * 0.75, -r * 1.2); c.lineTo(s * r * 0.75, -r * 0.55); c.closePath(); c.fillStyle = mix(col, '#c2185b', 0.3); c.fill(); outline(c, r * 0.05, '#8a3a5a'); }); },
      body(c, r) { c.fillStyle = '#6a2a44'; c.fillRect(-r * 0.25, -r * 0.82, r * 0.5, r * 0.09); c.fillStyle = '#ffffff44'; P(c, () => c.ellipse(-r * 0.4, -r * 0.35, r * 0.25, r * 0.12, -0.5, 0, TAU)); c.fill(); },
      top(c, r) { c.fillStyle = '#f48fb1'; P(c, () => c.ellipse(0, r * 0.35, r * 0.3, r * 0.2, 0, 0, TAU)); c.fill(); outline(c, r * 0.05, '#8a3a5a'); c.fillStyle = '#8a3a5a'; [-1, 1].forEach(s => { P(c, () => c.ellipse(s * r * 0.11, r * 0.35, r * 0.05, r * 0.08, 0, 0, TAU)); c.fill(); }); } },
    shroom: { back(c, r) { // 蘑菇帽
      const gr = c.createLinearGradient(0, -r * 1.5, 0, -r * 0.4); gr.addColorStop(0, '#9b30d0'); gr.addColorStop(1, '#6a1b9a'); c.fillStyle = gr;
      c.beginPath(); c.moveTo(-r * 1.15, -r * 0.45); c.quadraticCurveTo(-r * 1.05, -r * 1.55, 0, -r * 1.55); c.quadraticCurveTo(r * 1.05, -r * 1.55, r * 1.15, -r * 0.45); c.quadraticCurveTo(0, -r * 0.7, -r * 1.15, -r * 0.45); c.fill(); outline(c, r * 0.06, '#3a0d55');
      c.fillStyle = '#c6ff7a'; [[-0.55, -0.85, 0.16], [0.15, -1.2, 0.2], [0.65, -0.8, 0.13], [-0.2, -0.75, 0.1]].forEach(([x, y, s]) => { P(c, () => c.arc(x * r, y * r, s * r, 0, TAU)); c.fill(); });
    } },
    mine: { back(c, r) { // 尖刺
      c.fillStyle = '#5d4037'; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + Math.PI / 8; c.beginPath(); c.moveTo(Math.cos(a - 0.22) * r * 0.9, Math.sin(a - 0.22) * r * 0.9); c.lineTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3); c.lineTo(Math.cos(a + 0.22) * r * 0.9, Math.sin(a + 0.22) * r * 0.9); c.fill(); }
      c.fillStyle = '#444'; c.fillRect(-r * 0.15, -r * 1.2, r * 0.3, r * 0.3);
    }, body(c, r) { c.strokeStyle = '#ffffff22'; c.lineWidth = r * 0.06; P(c, () => c.arc(0, 0, r * 0.82, 0, TAU)); c.stroke(); } },
    icy: { back(c, r) { // 冰晶冠
      [[-0.5, 0.55, -0.35], [0, 0.85, 0], [0.5, 0.55, 0.35]].forEach(([x, h, rot]) => { c.save(); c.translate(x * r, -r * 0.7); c.rotate(rot); c.beginPath(); c.moveTo(-r * 0.16, 0); c.lineTo(0, -r * h - r * 0.2); c.lineTo(r * 0.16, 0); c.closePath(); c.fillStyle = '#e1f5fe'; c.fill(); outline(c, r * 0.05, '#4fa3d1'); c.fillStyle = '#b3e5fc'; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -r * h - r * 0.2); c.lineTo(r * 0.16, 0); c.fill(); c.restore(); });
    }, body(c, r) { c.strokeStyle = '#ffffff55'; c.lineWidth = r * 0.04; P(c, () => { c.moveTo(-r * 0.7, -r * 0.2); c.lineTo(-r * 0.2, r * 0.75); c.lineTo(r * 0.5, r * 0.6); c.lineTo(r * 0.8, -r * 0.1); c.moveTo(-r * 0.2, r * 0.75); c.lineTo(0, r * 0.2); }); c.stroke(); } },
    vampire: { back(c, r) { // 斗篷高領
      c.fillStyle = '#1a0710'; c.beginPath(); c.moveTo(-r * 1.25, r * 0.05); c.lineTo(-r * 0.95, -r * 1.1); c.lineTo(-r * 0.3, -r * 0.2); c.lineTo(r * 0.3, -r * 0.2); c.lineTo(r * 0.95, -r * 1.1); c.lineTo(r * 1.25, r * 0.05); c.closePath(); c.fill();
      c.fillStyle = '#c62828'; c.beginPath(); c.moveTo(-r * 1.1, 0); c.lineTo(-r * 0.92, -r * 0.88); c.lineTo(-r * 0.5, -r * 0.2); c.closePath(); c.fill(); c.beginPath(); c.moveTo(r * 1.1, 0); c.lineTo(r * 0.92, -r * 0.88); c.lineTo(r * 0.5, -r * 0.2); c.closePath(); c.fill();
    }, body(c, r) { c.fillStyle = '#220812'; c.beginPath(); c.moveTo(-r * 0.95, -r * 0.3); c.quadraticCurveTo(-r * 0.6, -r * 1.1, 0, -r * 1); c.quadraticCurveTo(r * 0.6, -r * 1.1, r * 0.95, -r * 0.3); c.quadraticCurveTo(r * 0.4, -r * 0.7, 0, -r * 0.38); c.quadraticCurveTo(-r * 0.4, -r * 0.7, -r * 0.95, -r * 0.3); c.fill(); } },
    turret: { back(c, r) { // 炮管
      c.save(); c.rotate(-0.5); const gr = c.createLinearGradient(-r * 0.2, 0, r * 0.2, 0); gr.addColorStop(0, '#37474f'); gr.addColorStop(0.5, '#90a4ae'); gr.addColorStop(1, '#37474f'); c.fillStyle = gr;
      c.fillRect(-r * 0.26, -r * 1.75, r * 0.52, r * 1.1); c.fillStyle = '#263238'; c.fillRect(-r * 0.34, -r * 1.85, r * 0.68, r * 0.26); c.restore();
    }, body(c, r) { c.fillStyle = '#00000030'; c.fillRect(-r, -r * 0.1, r * 2, r * 0.16); c.fillStyle = '#cfd8dc'; for (let k = -2; k <= 2; k++) { P(c, () => c.arc(k * r * 0.38, -r * 0.02, r * 0.05, 0, TAU)); c.fill(); } } },
    thunder: { back(c, r) { // 閃電冠羽
      c.save(); c.translate(0, -r * 0.25); c.scale(1.35, 1.35); c.fillStyle = '#ffeb3b'; c.beginPath(); c.moveTo(-r * 0.1, -r * 0.7); c.lineTo(r * 0.35, -r * 1.5); c.lineTo(r * 0.2, -r * 1.05); c.lineTo(r * 0.55, -r * 1.1); c.lineTo(r * 0.05, -r * 0.4); c.closePath(); c.fill(); outline(c, r * 0.06, '#8a6d00'); c.restore();
      [-1, 1].forEach(s => { c.beginPath(); c.moveTo(s * r * 0.85, -r * 0.1); c.lineTo(s * r * 1.35, -r * 0.55); c.lineTo(s * r * 1.2, -r * 0.15); c.lineTo(s * r * 1.45, -r * 0.1); c.lineTo(s * r * 0.9, r * 0.25); c.closePath(); c.fillStyle = '#fbc02d'; c.fill(); outline(c, r * 0.05, '#8a6d00'); });
    }, top(c, r) { c.fillStyle = '#ff9800'; c.beginPath(); c.moveTo(-r * 0.14, r * 0.12); c.lineTo(r * 0.14, r * 0.12); c.lineTo(0, r * 0.32); c.closePath(); c.fill(); outline(c, r * 0.04, '#8a4b00'); } },
    angel: { back(c, r) { // 光環＋翅膀
      [-1, 1].forEach(s => { c.save(); c.scale(s, 1); c.beginPath(); c.moveTo(r * 0.7, -r * 0.1); c.quadraticCurveTo(r * 1.6, -r * 0.9, r * 1.55, -r * 0.1); c.quadraticCurveTo(r * 1.5, r * 0.2, r * 1.3, r * 0.15); c.quadraticCurveTo(r * 1.3, r * 0.45, r * 1.05, r * 0.4); c.quadraticCurveTo(r * 0.95, r * 0.6, r * 0.7, r * 0.4); c.closePath(); c.fillStyle = '#ffffff'; c.fill(); outline(c, r * 0.05, '#c9a24a'); c.restore(); });
    }, halo: true },
    boss: { back(c, r, col) { // 首領：尖角＋鋸齒王冠
      [-1, 1].forEach(s => { c.beginPath(); c.moveTo(s * r * 0.55, -r * 0.65); c.quadraticCurveTo(s * r * 1.3, -r * 0.8, s * r * 1.25, -r * 1.35); c.quadraticCurveTo(s * r * 0.95, -r * 0.95, s * r * 0.3, -r * 0.85); c.closePath(); c.fillStyle = '#2a1a22'; c.fill(); outline(c, r * 0.05, '#000'); });
      const gr = c.createLinearGradient(0, -r * 1.35, 0, -r * 0.8); gr.addColorStop(0, '#fff3a0'); gr.addColorStop(1, '#d4a017'); c.fillStyle = gr;
      c.beginPath(); c.moveTo(-r * 0.55, -r * 0.78); for (let k = 0; k <= 4; k++) { const x = -r * 0.55 + k * r * 0.275; c.lineTo(x, -r * (k % 2 ? 1.08 : 1.38)); } c.lineTo(r * 0.55, -r * 0.78); c.closePath(); c.fill(); outline(c, r * 0.05, '#6b4a00');
      c.fillStyle = '#e53935'; P(c, () => c.arc(0, -r * 0.95, r * 0.08, 0, TAU)); c.fill();
    }, body(c, r) { c.strokeStyle = '#0005'; c.lineWidth = r * 0.05; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + 0.3; P(c, () => { c.moveTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95); c.lineTo(Math.cos(a + 0.2) * r * 0.7, Math.sin(a + 0.2) * r * 0.7); c.lineTo(Math.cos(a + 0.05) * r * 0.55, Math.sin(a + 0.05) * r * 0.55); }); c.stroke(); } } }
  };
  // 未知 id 的預設樣式：依 id 雜湊產生天線＋花紋，之後新增角色也有基本辨識度
  function defaultDecor(id) {
    const h = hashId(id), kind = h % 3, n = 3 + (h >> 3) % 4;
    return { back(c, r) { c.strokeStyle = '#ddd'; c.lineWidth = r * 0.08; P(c, () => { c.moveTo(0, -r * 0.85); c.lineTo(r * 0.2, -r * 1.35); }); c.stroke(); c.fillStyle = `hsl(${h % 360},80%,65%)`; P(c, () => c.arc(r * 0.2, -r * 1.4, r * 0.15, 0, TAU)); c.fill(); },
      body(c, r) { c.fillStyle = '#ffffff30'; c.strokeStyle = '#ffffff40'; c.lineWidth = r * 0.07;
        if (kind === 0) for (let k = 0; k < n; k++) { const a = k / n * TAU; P(c, () => c.arc(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7, r * 0.1, 0, TAU)); c.fill(); }
        else if (kind === 1) { P(c, () => c.arc(0, 0, r * 0.78, 0, TAU)); c.stroke(); }
        else for (let k = 0; k < n; k++) { const y = -r * 0.6 + k * r * 1.2 / n; c.fillRect(-r, y, r * 2, r * 0.06); } } };
  }
  FA.spriteDecor = DECOR; // 新角色可直接加：FA.spriteDecor.newId = { back(c,r,col){}, body(c,r,col){}, top(c,r,col){} }

  // ---- 星級外框 ----
  function frame(c, r, star, teamCol, boss) {
    if (boss) {
      c.lineWidth = r * 0.12; c.strokeStyle = '#1a0a12'; P(c, () => c.arc(0, 0, r, 0, TAU)); c.stroke();
      c.lineWidth = r * 0.06; c.strokeStyle = '#ff3d3d'; c.stroke();
      c.fillStyle = '#1a0a12'; for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; c.beginPath(); c.moveTo(Math.cos(a - 0.12) * r * 1.02, Math.sin(a - 0.12) * r * 1.02); c.lineTo(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2); c.lineTo(Math.cos(a + 0.12) * r * 1.02, Math.sin(a + 0.12) * r * 1.02); c.fill(); }
      return;
    }
    const w = Math.max(2, r * 0.13);
    c.lineWidth = w + 2; c.strokeStyle = '#0009'; P(c, () => c.arc(0, 0, r, 0, TAU)); c.stroke();
    c.lineWidth = w; c.strokeStyle = teamCol; c.stroke();
    if (star >= 2) { // 銀/金第二圈
      const gr = c.createLinearGradient(-r, -r, r, r);
      if (star >= 3) { gr.addColorStop(0, '#fff7c2'); gr.addColorStop(0.5, '#ffb300'); gr.addColorStop(1, '#fff3a0'); } else { gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#9fb3c8'); gr.addColorStop(1, '#eef4fa'); }
      c.lineWidth = Math.max(1.5, r * 0.08); c.strokeStyle = gr; P(c, () => c.arc(0, 0, r + w * 0.9, 0, TAU)); c.stroke();
      const n = star >= 3 ? 6 : 4; // 寶石
      for (let k = 0; k < n; k++) { const a = -Math.PI / 2 + k / n * TAU, x = Math.cos(a) * (r + w * 0.9), y = Math.sin(a) * (r + w * 0.9);
        c.fillStyle = star >= 3 ? (k % 2 ? '#ff5252' : '#40c4ff') : '#e3f2fd'; c.save(); c.translate(x, y); c.rotate(a); c.beginPath(); const s = r * (star >= 3 ? 0.16 : 0.12); c.moveTo(-s, 0); c.lineTo(0, -s * 0.7); c.lineTo(s, 0); c.lineTo(0, s * 0.7); c.closePath(); c.fill(); outline(c, Math.max(1, r * 0.03), '#5a4000'); c.restore(); }
    }
    if (star >= 3) { // 金色光芒尖
      c.fillStyle = '#ffd54f'; for (let k = 0; k < 12; k++) { const a = k / 12 * TAU + Math.PI / 12, r0 = r + w * 1.4; c.beginPath(); c.moveTo(Math.cos(a - 0.07) * r0, Math.sin(a - 0.07) * r0); c.lineTo(Math.cos(a) * (r0 + r * 0.16), Math.sin(a) * (r0 + r * 0.16)); c.lineTo(Math.cos(a + 0.07) * r0, Math.sin(a + 0.07) * r0); c.fill(); }
    }
  }

  // ---- 靜態外觀（快取） ----
  function build(id, color, star, team, boss, r) {
    const pad = 2.25, half = Math.ceil(r * pad + 4), size = half * 2;
    const cv = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(Math.ceil(size * dpr), Math.ceil(size * dpr)) : Object.assign(document.createElement('canvas'), { width: Math.ceil(size * dpr), height: Math.ceil(size * dpr) });
    const c = cv.getContext('2d'); c.scale(dpr, dpr); c.translate(half, half);
    const D = boss ? DECOR.boss : (DECOR[id] || defaultDecor(id)), teamCol = team === 0 ? '#4fd2ff' : '#ff5a5a';
    if (D.halo) { c.strokeStyle = '#ffe082'; c.lineWidth = r * 0.13; P(c, () => c.ellipse(0, -r * 1.25, r * 0.55, r * 0.17, 0, 0, TAU)); c.stroke(); c.strokeStyle = '#fff8e1'; c.lineWidth = r * 0.05; c.stroke(); }
    if (D.back) { c.save(); D.back(c, r, color); c.restore(); }
    // 身體
    const gr = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r * 1.05);
    gr.addColorStop(0, mix(color, '#ffffff', 0.55)); gr.addColorStop(0.45, color); gr.addColorStop(1, mix(color, '#000000', 0.45));
    c.fillStyle = gr; P(c, () => c.arc(0, 0, r, 0, TAU)); c.fill();
    if (D.body) { c.save(); P(c, () => c.arc(0, 0, r, 0, TAU)); c.clip(); D.body(c, r, color); c.restore(); }
    // 邊緣暗角＋上緣高光
    const rim = c.createRadialGradient(0, 0, r * 0.7, 0, 0, r); rim.addColorStop(0, '#0000'); rim.addColorStop(1, '#0000004d'); c.fillStyle = rim; P(c, () => c.arc(0, 0, r, 0, TAU)); c.fill();
    c.strokeStyle = '#ffffff70'; c.lineWidth = r * 0.08; c.lineCap = 'round'; P(c, () => c.arc(0, 0, r * 0.82, Math.PI * 1.15, Math.PI * 1.45)); c.stroke();
    frame(c, r, star, teamCol, boss);
    if (D.front) { c.save(); D.front(c, r, color); c.restore(); }
    return { cv, half, size };
  }
  function get(o, r) {
    const key = (o.boss ? 'B' : o.id) + '|' + o.color + '|' + (o.star || 1) + '|' + o.team + '|' + Math.round(r * 2) + '|' + dpr;
    let s = cache.get(key);
    if (!s) { if (cache.size > 160) cache.clear(); s = build(o.boss ? 'boss' : o.id, o.color, o.star || 1, o.team, o.boss, Math.round(r * 2) / 2); cache.set(key, s); }
    return s;
  }

  // ---- 表情（即時） ----
  function face(c, o, r, t, st) {
    const dark = lum(o.color) > 0.72 ? '#222' : '#151018', e = r * 0.3, ey = -r * 0.08, er = r * 0.15;
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
    const blink = ((t + o.i * 0.73) % 3.4) < 0.12;
    const angry = o.team === 1 || o.boss, worried = !angry && o.hp < o.maxHp * 0.3;
    if (blink) { c.lineWidth = lw; P(c, () => { c.moveTo(-e - er, ey); c.lineTo(-e + er, ey); c.moveTo(e - er, ey); c.lineTo(e + er, ey); }); c.stroke(); }
    else {
      c.fillStyle = '#fff'; P(c, () => { c.ellipse(-e, ey, er * 1.15, er * 1.3, 0, 0, TAU); c.ellipse(e, ey, er * 1.15, er * 1.3, 0, 0, TAU); }); c.fill();
      c.fillStyle = o.boss ? '#d50000' : dark; const lx = st.lookX * er * 0.35, ly = st.lookY * er * 0.35;
      P(c, () => { c.arc(-e + lx, ey + ly, er * 0.72, 0, TAU); c.arc(e + lx, ey + ly, er * 0.72, 0, TAU); }); c.fill();
      c.fillStyle = '#fff'; P(c, () => { c.arc(-e + lx + er * 0.25, ey + ly - er * 0.3, er * 0.25, 0, TAU); c.arc(e + lx + er * 0.25, ey + ly - er * 0.3, er * 0.25, 0, TAU); }); c.fill();
    }
    c.strokeStyle = dark; c.lineWidth = lw;
    if (angry) { P(c, () => { c.moveTo(-e - er * 1.2, ey - er * 2.1); c.lineTo(-e + er * 1.1, ey - er * 1.3); c.moveTo(e + er * 1.2, ey - er * 2.1); c.lineTo(e - er * 1.1, ey - er * 1.3); }); c.stroke(); }
    else if (worried) { P(c, () => { c.moveTo(-e - er, ey - er * 1.4); c.lineTo(-e + er, ey - er * 2); c.moveTo(e + er, ey - er * 1.4); c.lineTo(e - er, ey - er * 2); }); c.stroke(); }
    // 嘴
    if (st.poison) { c.strokeStyle = '#2e5e10'; P(c, () => { c.moveTo(-r * 0.22, r * 0.36); c.quadraticCurveTo(-r * 0.11, r * 0.28, 0, r * 0.36); c.quadraticCurveTo(r * 0.11, r * 0.44, r * 0.22, r * 0.36); }); c.stroke(); }
    else if (worried) { P(c, () => c.arc(0, r * 0.5, r * 0.16, Math.PI * 1.15, Math.PI * 1.85)); c.stroke(); }
    else if (angry) { P(c, () => { c.moveTo(-r * 0.2, r * 0.38); c.quadraticCurveTo(0, r * 0.28, r * 0.2, r * 0.38); }); c.stroke();
      if (o.boss || o.id === 'vampire') { c.fillStyle = '#fff'; [-1, 1].forEach(s => { c.beginPath(); c.moveTo(s * r * 0.15, r * 0.33); c.lineTo(s * r * 0.08, r * 0.33); c.lineTo(s * r * 0.115, r * 0.47); c.fill(); }); } }
    else { P(c, () => c.arc(0, r * 0.2, r * 0.22, 0.25, Math.PI - 0.25)); c.stroke(); if (o.id === 'vampire') { c.fillStyle = '#fff'; [-1, 1].forEach(s => { c.beginPath(); c.moveTo(s * r * 0.15, r * 0.36); c.lineTo(s * r * 0.07, r * 0.38); c.lineTo(s * r * 0.12, r * 0.52); c.fill(); }); } }
    if (!o.boss && !angry) { c.fillStyle = '#ff6b8155'; P(c, () => { c.ellipse(-r * 0.55, r * 0.2, r * 0.14, r * 0.08, 0, 0, TAU); c.ellipse(r * 0.55, r * 0.2, r * 0.14, r * 0.08, 0, 0, TAU); }); c.fill(); }
  }

  // ---- 對外：畫一隻棋子 ----
  // st: { dead:0..1 (陣亡淡出進度) }
  function draw(c, o, x, y, r, t, deadK) {
    dpr = Math.min(2, g.devicePixelRatio || 1);
    const sp = get(o, r), hurt = Math.max(0, o.hurt || 0), frozen = o.stunned, pois = !!o.poison, dead = deadK != null;
    const spd = Math.hypot(o.vx || 0, o.vy || 0);
    c.save(); c.translate(x, y);
    let sx = 1, sy = 1;
    if (hurt > 0) { const w = Math.sin(hurt * 14) * hurt; sx = 1 + 0.18 * w; sy = 1 - 0.18 * w; }
    if (frozen) c.translate(Math.sin(t * 40 + o.i) * r * 0.03, 0);
    if (dead) { const k = deadK; c.globalAlpha *= 1 - k; sx = sy = 1 + k * 0.5; c.rotate(k * 0.6 * (o.i % 2 ? 1 : -1)); c.translate(0, -k * r * 0.6); }
    if (o.boss && !dead) { // 壓迫感：脈動暗紅光暈
      const pul = 1 + Math.sin(t * 3) * 0.06, gr = c.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 1.9 * pul);
      gr.addColorStop(0, '#ff1a4a66'); gr.addColorStop(1, '#ff1a4a00'); c.fillStyle = gr; P(c, () => c.arc(0, 0, r * 1.9 * pul, 0, TAU)); c.fill();
    }
    c.scale(sx, sy);
    c.drawImage(sp.cv, -sp.half, -sp.half, sp.size, sp.size);
    // 狀態疊色
    if (hurt > 0.4 && !dead) { c.globalAlpha = (hurt - 0.4) * 1.3; c.fillStyle = '#fff'; P(c, () => c.arc(0, 0, r, 0, TAU)); c.fill(); c.globalAlpha = 1; }
    if (pois && !dead) { c.fillStyle = `rgba(110,200,40,${0.22 + Math.sin(t * 4) * 0.06})`; P(c, () => c.arc(0, 0, r, 0, TAU)); c.fill(); }
    const lk = spd > 30 ? [o.vx / spd, o.vy / spd] : [0, o.team === 0 ? -0.6 : 0.6];
    const Dd = o.boss ? null : DECOR[o.id];
    face(c, o, r, t, { dead, hurt: hurt > 0.15 && !dead, frozen: frozen && !dead, poison: pois, lookX: lk[0], lookY: lk[1] });
    if (Dd && Dd.top) Dd.top(c, r, o.color);
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

  // 圖示（給商店/圖鑑用）：回傳 dataURL
  const iconCache = {};
  function icon(id, star, px) {
    const k = id + '|' + (star || 1) + '|' + px; if (iconCache[k]) return iconCache[k];
    const U = FA.DATA && FA.DATA.units[id]; if (!U) return '';
    const cv = document.createElement('canvas'), d = 2; cv.width = cv.height = px * d; const c = cv.getContext('2d'); c.scale(d, d);
    const r = px / 3.6; draw(c, { id, color: U.color, star: star || 1, team: 0, i: 0, hp: 1, maxHp: 1 }, px / 2, px / 2 + r * 0.25, r, 0.5);
    return iconCache[k] = cv.toDataURL();
  }

  FA.sprites = { draw, icon, clear: () => cache.clear(), mix, hex, lum };
})(globalThis);
