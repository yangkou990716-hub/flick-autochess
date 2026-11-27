// 第七輪新角色造型（狙擊／幽影等 8 隻）：舊函式寫法，掛在 FA.spriteDecor，由 sprites.js 讀取（美術升級版相容）
// 用 FA.sprites.kit.paint 取一致光影（若有）；小工具在本檔自帶，不改 sprites.js 本體
(function (g) {
  const FA = g.FA = g.FA || {};
  const TAU = Math.PI * 2;
  const P = (c, f) => { c.beginPath(); f(); };
  const outline = (c, w, col) => { c.lineWidth = w; c.strokeStyle = col || '#0008'; c.lineJoin = 'round'; c.stroke(); };
  function star5(c, x, y, R, r) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); }
  const DEC = {
    javelin: { back(c, r) { // 斜插標槍
      c.save(); c.rotate(0.55); c.fillStyle = '#8d6e63'; c.fillRect(-r * 0.07, -r * 1.9, r * 0.14, r * 1.5);
      c.beginPath(); c.moveTo(0, -r * 2.25); c.lineTo(r * 0.2, -r * 1.85); c.lineTo(-r * 0.2, -r * 1.85); c.closePath(); c.fillStyle = '#eceff1'; c.fill(); outline(c, r * 0.04, '#37474f');
      c.fillStyle = '#ff7043'; c.beginPath(); c.moveTo(-r * 0.07, -r * 0.55); c.lineTo(-r * 0.3, -r * 0.35); c.lineTo(-r * 0.07, -r * 0.75); c.fill(); c.restore();
    }, body(c, r) { c.fillStyle = '#e65100aa'; c.fillRect(-r, -r * 0.08, r * 2, r * 0.16); } },
    hawk: { back(c, r) { // 鷹羽冠＋翅
      c.fillStyle = '#6d4c41'; [-1, 1].forEach(s => { c.beginPath(); c.moveTo(s * r * 0.8, -r * 0.2); c.quadraticCurveTo(s * r * 1.7, -r * 0.6, s * r * 1.5, r * 0.3); c.quadraticCurveTo(s * r * 1.2, 0, s * r * 0.8, r * 0.2); c.closePath(); c.fill(); outline(c, r * 0.05, '#3e2723'); });
      c.fillStyle = '#fff8e1'; c.beginPath(); c.moveTo(-r * 0.3, -r * 0.8); c.lineTo(0, -r * 1.45); c.lineTo(r * 0.3, -r * 0.8); c.closePath(); c.fill(); outline(c, r * 0.04, '#5d4037');
    }, top(c, r) { c.fillStyle = '#ffb300'; c.beginPath(); c.moveTo(-r * 0.15, r * 0.1); c.lineTo(r * 0.15, r * 0.1); c.lineTo(0, r * 0.38); c.closePath(); c.fill(); outline(c, r * 0.04, '#8a5a00'); } },
    sniper: { back(c, r) { // 狙擊槍管＋瞄準鏡
      c.save(); c.rotate(-0.35); c.fillStyle = '#263238'; c.fillRect(-r * 0.1, -r * 2.0, r * 0.2, r * 1.3); c.fillStyle = '#455a64'; c.fillRect(-r * 0.22, -r * 1.25, r * 0.44, r * 0.25); c.restore();
    }, front(c, r) { c.strokeStyle = '#ff5370'; c.lineWidth = r * 0.07; P(c, () => c.arc(r * 0.35, -r * 0.1, r * 0.32, 0, TAU)); c.stroke(); P(c, () => { c.moveTo(r * 0.35, -r * 0.5); c.lineTo(r * 0.35, r * 0.3); c.moveTo(-r * 0.05, -r * 0.1); c.lineTo(r * 0.75, -r * 0.1); }); c.lineWidth = r * 0.04; c.stroke(); } },
    shadow: { back(c, r) { // 殘影＋兜帽
      c.fillStyle = '#5e4b8b55'; P(c, () => c.arc(-r * 0.45, r * 0.15, r, 0, TAU)); c.fill();
      c.fillStyle = '#2a1f45'; c.beginPath(); c.moveTo(-r * 1.0, -r * 0.1); c.quadraticCurveTo(-r * 0.9, -r * 1.3, 0, -r * 1.5); c.quadraticCurveTo(r * 0.9, -r * 1.3, r * 1.0, -r * 0.1); c.quadraticCurveTo(0, -r * 0.7, -r * 1.0, -r * 0.1); c.fill();
    }, body(c, r) { c.fillStyle = '#0006'; c.fillRect(-r, -r * 0.35, r * 2, r * 0.3); } },
    illusion: { back(c, r) { // 魔術帽＋星
      c.fillStyle = '#311b92'; c.fillRect(-r * 0.5, -r * 1.75, r * 1.0, r * 0.95); c.fillRect(-r * 0.85, -r * 0.88, r * 1.7, r * 0.16); outline(c, r * 0.04, '#000');
      c.fillStyle = '#ce93d8'; c.fillRect(-r * 0.5, -r * 1.05, r * 1.0, r * 0.14);
      c.fillStyle = '#fff59d'; star5(c, r * 0.95, -r * 1.25, r * 0.2, r * 0.08); c.fill(); star5(c, -r * 1.0, -r * 0.55, r * 0.13, r * 0.05); c.fill();
    } },
    nightmare: { back(c, r) { // 彎角＋暗翼
      c.fillStyle = '#1a0f3a'; [-1, 1].forEach(s => { c.beginPath(); c.moveTo(s * r * 0.6, -r * 0.3); c.lineTo(s * r * 1.75, -r * 0.9); c.lineTo(s * r * 1.45, -r * 0.35); c.lineTo(s * r * 1.7, -r * 0.1); c.lineTo(s * r * 1.3, r * 0.05); c.lineTo(s * r * 1.45, r * 0.35); c.lineTo(s * r * 0.7, r * 0.3); c.closePath(); c.fill(); });
      c.fillStyle = '#b0bec5'; [-1, 1].forEach(s => { c.beginPath(); c.moveTo(s * r * 0.35, -r * 0.8); c.quadraticCurveTo(s * r * 0.55, -r * 1.55, s * r * 0.15, -r * 1.6); c.quadraticCurveTo(s * r * 0.35, -r * 1.25, s * r * 0.12, -r * 0.88); c.closePath(); c.fill(); outline(c, r * 0.04, '#37474f'); });
    }, body(c, r) { c.fillStyle = '#ff1744aa'; [-1, 1].forEach(s => { P(c, () => c.ellipse(s * r * 0.35, -r * 0.55, r * 0.12, r * 0.06, s * 0.4, 0, TAU)); c.fill(); }); } },
    spider: { back(c, r) { // 八隻腳
      c.strokeStyle = '#3e0a24'; c.lineWidth = r * 0.1; c.lineCap = 'round';
      [-1, 1].forEach(s => { for (let k = 0; k < 4; k++) { const a = -0.9 + k * 0.55; P(c, () => { c.moveTo(s * r * 0.7, 0); c.lineTo(s * r * (1.2 + 0.1 * Math.cos(a)), r * Math.sin(a) * 0.9 - r * 0.2); c.lineTo(s * r * 1.45, r * Math.sin(a) * 1.1 + r * 0.15); }); c.stroke(); } });
    }, body(c, r) { c.fillStyle = '#ffeb3b'; c.beginPath(); c.moveTo(0, r * 0.2); c.lineTo(r * 0.2, r * 0.45); c.lineTo(0, r * 0.75); c.lineTo(-r * 0.2, r * 0.45); c.closePath(); c.fill(); } },
    eel: { back(c, r) { // 背鰭＋尾巴
      c.fillStyle = '#00838f'; c.beginPath(); c.moveTo(-r * 0.8, -r * 0.5); for (let k = 0; k <= 5; k++) c.lineTo(-r * 0.8 + k * r * 0.32, -r * (k % 2 ? 1.35 : 0.85)); c.lineTo(r * 0.8, -r * 0.5); c.closePath(); c.fill(); outline(c, r * 0.04, '#004d55');
      c.beginPath(); c.moveTo(r * 0.7, r * 0.5); c.quadraticCurveTo(r * 1.5, r * 0.6, r * 1.6, r * 1.2); c.quadraticCurveTo(r * 1.2, r * 0.9, r * 0.5, r * 0.85); c.closePath(); c.fill();
    }, body(c, r) { c.strokeStyle = '#fff59d'; c.lineWidth = r * 0.07; c.lineJoin = 'round'; P(c, () => { c.moveTo(-r * 0.5, r * 0.2); c.lineTo(-r * 0.15, r * 0.45); c.lineTo(r * 0.05, r * 0.2); c.lineTo(r * 0.4, r * 0.5); }); c.stroke(); } }
  };
  // 四個配件分別用斜角板、交棒、鉗口和救生浮標辨識。
  Object.assign(DEC, {
    rampmaker: { front(c, r) {
      P(c, () => { c.moveTo(-r * .43, r * .54); c.lineTo(r * .38, r * .54); c.lineTo(r * .38, r * .10); c.closePath(); });
      c.fillStyle = '#ffdb91'; c.fill(); outline(c, r * .075, '#854720');
    } },
    relay: { front(c, r) {
      P(c, () => { c.moveTo(-r * .57, r * .57); c.lineTo(r * .52, r * .22); });
      c.lineCap = 'round'; c.strokeStyle = '#8f2453'; c.lineWidth = r * .3; c.stroke();
      c.strokeStyle = '#fff1a7'; c.lineWidth = r * .19; c.stroke();
    } },
    salvage: { back(c, r) {
      c.strokeStyle = '#37495f'; c.lineCap = 'round'; c.lineWidth = r * .22;
      for (const sign of [-1, 1]) {
        P(c, () => { c.moveTo(sign * r * .5, -r * .73); c.lineTo(sign * r * .84, -r * 1.24); c.lineTo(sign * r * .56, -r * 1.42); });
        c.stroke();
      }
    } },
    buoykeeper: { front(c, r) {
      P(c, () => c.arc(0, r * .52, r * .28, 0, TAU));
      c.strokeStyle = '#ff9074'; c.lineWidth = r * .15; c.stroke();
      P(c, () => { c.arc(0, r * .52, r * .28, -.4, .4); c.moveTo(-r * .25, r * .62); c.arc(0, r * .52, r * .28, 2.76, 3.52); });
      c.strokeStyle = '#fff5d8'; c.lineWidth = r * .13; c.stroke();
    } }
  });
  FA.spriteDecor = FA.spriteDecor || {};
  for (const k in DEC) FA.spriteDecor[k] = DEC[k];
})(globalThis);
