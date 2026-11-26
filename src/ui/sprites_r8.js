// 第八輪新角色造型（神技 6 隻）：函式式寫法，掛在 FA.spriteDecor，由 sprites.js 讀取
// body 會自動裁切在球體內；top 每幀畫（盡量簡單）
(function (g) {
  const FA = g.FA = g.FA || {};
  const TAU = Math.PI * 2;
  const P = (c, f) => { c.beginPath(); f(); };
  const outline = (c, w, col) => { c.lineWidth = w; c.strokeStyle = col || '#0008'; c.lineJoin = 'round'; c.stroke(); };
  const DEC = {
    archer: { back(c, r) { // 背後長弓＋弦
      c.save(); c.rotate(-0.5);
      c.strokeStyle = '#6d4c41'; c.lineWidth = r * 0.16; c.lineCap = 'round'; P(c, () => c.arc(0, 0, r * 1.45, -Math.PI * 0.42, Math.PI * 0.42)); c.stroke();
      c.strokeStyle = '#fff8e1'; c.lineWidth = r * 0.04; P(c, () => { c.moveTo(Math.cos(-Math.PI * 0.42) * r * 1.45, Math.sin(-Math.PI * 0.42) * r * 1.45); c.lineTo(Math.cos(Math.PI * 0.42) * r * 1.45, Math.sin(Math.PI * 0.42) * r * 1.45); }); c.stroke();
      c.restore();
    }, body(c, r) { // 甜蜜點靶心
      c.strokeStyle = '#2e7d32aa'; c.lineWidth = r * 0.08; P(c, () => c.arc(0, r * 0.45, r * 0.32, 0, TAU)); c.stroke();
      c.fillStyle = '#69f0ae'; P(c, () => c.arc(0, r * 0.45, r * 0.12, 0, TAU)); c.fill();
    } },
    cue: { back(c, r) { // 斜放球桿
      c.save(); c.rotate(0.7); c.fillStyle = '#8d6e63'; c.fillRect(-r * 0.07, -r * 2.1, r * 0.14, r * 1.4); c.fillStyle = '#4fc3f7'; c.fillRect(-r * 0.07, -r * 2.2, r * 0.14, r * 0.14); c.restore();
    }, body(c, r) { // 白球上的號碼圈
      c.fillStyle = '#d32f2f'; c.fillRect(-r, r * 0.28, r * 2, r * 0.22);
      c.fillStyle = '#fff'; P(c, () => c.arc(0, r * 0.55, r * 0.26, 0, TAU)); c.fill(); outline(c, r * 0.03, '#0005');
      c.fillStyle = '#212121'; c.font = `900 ${r * 0.32}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('8', 0, r * 0.56);
    } },
    trick: { back(c, r) { // 彩帶繞圈
      ['#ff4081', '#40c4ff', '#ffd740'].forEach((col, k) => { c.strokeStyle = col; c.lineWidth = r * 0.1; c.lineCap = 'round'; P(c, () => c.arc(0, 0, r * (1.18 + k * 0.14), -Math.PI * (0.9 - k * 0.2), -Math.PI * (0.2 - k * 0.15))); c.stroke(); });
    }, body(c, r) { // 鋸齒折線（反彈軌跡）
      c.strokeStyle = '#fff'; c.lineWidth = r * 0.08; c.lineJoin = 'round'; P(c, () => { c.moveTo(-r * 0.7, r * 0.25); c.lineTo(-r * 0.35, r * 0.6); c.lineTo(0, r * 0.25); c.lineTo(r * 0.35, r * 0.6); c.lineTo(r * 0.7, r * 0.25); }); c.stroke();
    } },
    drummer: { back(c, r) { // 一對鼓棒
      [-1, 1].forEach(s => { c.save(); c.rotate(s * 0.45); c.fillStyle = '#ffe0b2'; c.fillRect(-r * 0.06, -r * 1.85, r * 0.12, r * 1.15); c.fillStyle = '#fff'; P(c, () => c.arc(0, -r * 1.9, r * 0.13, 0, TAU)); c.fill(); outline(c, r * 0.03, '#5d4037'); c.restore(); });
    }, body(c, r) { // 鼓面繩紋
      c.fillStyle = '#fff3e0cc'; c.fillRect(-r, r * 0.25, r * 2, r * 0.14);
      c.strokeStyle = '#8d6e63'; c.lineWidth = r * 0.05; P(c, () => { for (let k = -4; k <= 4; k++) { c.moveTo(k * r * 0.22, r * 0.4); c.lineTo(k * r * 0.22 + r * 0.11, r * 0.85); } }); c.stroke();
    } },
    rbomb: { back(c, r) { // 引信天線＋紅燈
      c.strokeStyle = '#263238'; c.lineWidth = r * 0.09; c.lineCap = 'round'; P(c, () => { c.moveTo(0, -r * 0.85); c.quadraticCurveTo(r * 0.3, -r * 1.3, r * 0.15, -r * 1.6); }); c.stroke();
      c.fillStyle = '#ff1744'; P(c, () => c.arc(r * 0.15, -r * 1.65, r * 0.16, 0, TAU)); c.fill(); outline(c, r * 0.04, '#5a0010');
    }, body(c, r) { c.fillStyle = '#ffd600'; c.fillRect(-r, r * 0.3, r * 2, r * 0.16); c.fillStyle = '#212121'; for (let k = -4; k <= 4; k += 2) c.fillRect(k * r * 0.22, r * 0.3, r * 0.2, r * 0.16); },
    top(c, r) { if (g.performance) { const k = 0.5 + 0.5 * Math.sin(performance.now() / 120); c.fillStyle = `rgba(255,40,60,${0.35 + k * 0.5})`; P(c, () => c.arc(r * 0.15, -r * 1.65, r * 0.12, 0, TAU)); c.fill(); } } },
    phantom: { back(c, r) { // 殘影＋劍
      c.fillStyle = '#5c6bc044'; P(c, () => c.arc(r * 0.5, r * 0.1, r, 0, TAU)); c.fill(); P(c, () => c.arc(-r * 0.5, r * 0.1, r, 0, TAU)); c.fill();
      c.save(); c.rotate(-0.6); c.fillStyle = '#eceff1'; c.beginPath(); c.moveTo(-r * 0.08, -r * 0.9); c.lineTo(0, -r * 2.1); c.lineTo(r * 0.08, -r * 0.9); c.closePath(); c.fill(); outline(c, r * 0.03, '#37474f');
      c.fillStyle = '#ffd740'; c.fillRect(-r * 0.25, -r * 0.95, r * 0.5, r * 0.1); c.restore();
    }, body(c, r) { c.fillStyle = '#1a237e88'; c.fillRect(-r, -r * 0.3, r * 2, r * 0.26); } }
  };
  FA.spriteDecor = FA.spriteDecor || {};
  for (const k in DEC) FA.spriteDecor[k] = DEC[k];
})(globalThis);
