// 音效：WebAudio 即時合成，不需要音檔（可離線）
(function (g) {
  const FA = g.FA = g.FA || {};
  let ctx = null, master = null;
  const last = {};
  const S = FA.sound = {
    on: (() => { try { return localStorage.getItem('fa_sound') !== '0'; } catch (e) { return true; } })(),
    init() {
      try {
        if (!ctx) { ctx = new (g.AudioContext || g.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination); }
        if (ctx.state === 'suspended') ctx.resume();
      } catch (e) { }
    },
    toggle() { S.on = !S.on; try { localStorage.setItem('fa_sound', S.on ? '1' : '0'); } catch (e) { } return S.on; },
    tone(f, d, type, vol, slide) {
      const t = ctx.currentTime, o = ctx.createOscillator(), gn = ctx.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
      gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(gn); gn.connect(master); o.start(t); o.stop(t + d + 0.02);
    },
    noise(d, vol, freq) {
      const t = ctx.currentTime, n = Math.floor(ctx.sampleRate * d), buf = ctx.createBuffer(1, n, ctx.sampleRate), data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), gn = ctx.createGain();
      src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq || 1200; gn.gain.value = vol;
      src.connect(f); f.connect(gn); gn.connect(master); src.start(t);
    },
    play(name, k) {
      if (!S.on || !ctx || ctx.state !== 'running') return;
      const now = performance.now(); if (now - (last[name] || 0) < 45) return; last[name] = now;
      try {
        switch (name) {
          case 'launch': S.tone(220, 0.15, 'triangle', 0.18, 2.2); break;
          case 'full': S.tone(330, 0.25, 'sawtooth', 0.12, 2.5); break;
          case 'hit': S.tone(160 + Math.min(300, (k || 0) * 2), 0.09, 'square', 0.12, 0.5); break;
          case 'bump': S.tone(420, 0.04, 'triangle', 0.05); break;
          case 'wall': S.tone(700, 0.05, 'sine', 0.06, 0.7); break;
          case 'boom': S.noise(0.35, 0.35, 900); S.tone(90, 0.3, 'sine', 0.25, 0.4); break;
          case 'death': S.tone(300, 0.4, 'sawtooth', 0.12, 0.25); break;
          case 'combo': S.tone(523, 0.12, 'square', 0.1); setTimeout(() => S.tone(784, 0.2, 'square', 0.1), 90); break;
          case 'freeze': S.tone(1400, 0.2, 'sine', 0.08, 0.6); break;
          case 'zap': S.noise(0.12, 0.2, 4000); break;
          case 'poison': S.tone(200, 0.15, 'sine', 0.06, 1.3); break;
          case 'heal': S.tone(660, 0.18, 'sine', 0.08, 1.5); break;
          case 'win': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => S.tone(f, 0.18, 'triangle', 0.12), i * 110)); break;
          case 'lose': [392, 330, 262].forEach((f, i) => setTimeout(() => S.tone(f, 0.25, 'triangle', 0.1), i * 140)); break;
          case 'coin': S.tone(988, 0.06, 'square', 0.06); setTimeout(() => S.tone(1318, 0.1, 'square', 0.06), 60); break;
          case 'click': S.tone(600, 0.03, 'triangle', 0.05); break;
        }
      } catch (e) { }
    }
  };
  g.addEventListener && g.addEventListener('pointerdown', () => S.init(), { passive: true });
})(globalThis);
