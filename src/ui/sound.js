// 音效＋背景音樂：WebAudio 即時合成，不需要音檔（可離線）
// - 音效：ZzFX（vendor/zzfx.js，MIT）的參數產生樣本，第一次用到（或解鎖後閒置時）算成 AudioBuffer 快取，之後每次播放只建 1 個節點
// - 音樂：自寫的步進音序器（和弦進行＋貝斯／琶音／墊音／主旋律／鼓），用 AudioContext 時間軸預排 0.3 秒
// - 開關：音效 fa_sound、音樂 fa_music（localStorage），兩條匯流排各自獨立；總輸出接壓縮器防爆音
// - iPhone：第一次觸控才建立／解鎖 AudioContext；切出 App 暫停、回來恢復；audioSession=ambient（跟著靜音鍵、可和其他 App 的音樂並存）
(function (g) {
  const FA = g.FA = g.FA || {};
  const LSget = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v !== '0'; } catch (e) { return d; } };
  const LSset = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch (e) { } };
  let ctx = null, master = null, sfxBus = null, musBus = null, duck = null;
  const MUS_VOL = 0.26, SFX_VOL = 0.85;
  const stat = { voices: 0, mnodes: 0, sfxPlayed: 0, sfxDropped: 0, notes: 0 };

  // ================= 音效定義 =================
  // 每個音效＝{ l: [[ZzFX 參數...], 起始秒]... , v 音量, r 音高隨機, g 最短間隔秒, p 優先度 0 低(碰撞)/1 一般/2 高(大招、介面) }
  // ZzFX 參數順序：音量, 隨機, 頻率, attack, sustain, release, 波形(0正弦1三角2鋸齒3tan4噪音5方波), 波形曲線, slide, deltaSlide,
  //               pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const NT = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  const midi = s => { const l = s[0].toLowerCase(); let i = 1, acc = 0; if (s[1] === '#' || (s[1] === 'b' && s.length > 2)) { acc = s[1] === '#' ? 1 : -1; i = 2; } return NT[l] + acc + (parseInt(s.slice(i), 10) + 1) * 12; };
  // 一串音符（樂句）→ 圖層；sh 波形、d 每音長、gap 間隔
  const notes = (list, gap, d, sh, vol, extra) => list.map((n, i) => [Object.assign([vol, 0, hz(midi(n)), 0.005, d * 0.4, d * 0.6, sh, sh === 5 ? 0.5 : 1], extra || []), i * gap]);
  const SFX = {
    // ---- 碰撞（依速度分 4 級）----
    imp0: { l: [[[.5, 0, 520, 0, .004, .035, 1, 2, -30]]], v: .32, r: .12, g: .03, p: 0 },
    imp1: { l: [[[.8, 0, 270, 0, .008, .07, 2, 1.6, -14, 0, 0, 0, 0, .3]], [[.3, 0, 1800, 0, 0, .03, 4, 1]]], v: .42, r: .1, g: .035, p: 0 },
    imp2: { l: [[[1, 0, 175, 0, .015, .12, 2, 2, -9, 0, 0, 0, 0, .8]], [[.6, 0, 95, 0, .02, .12, 0, 1, -4]]], v: .55, r: .08, g: .04, p: 0 },
    imp3: { l: [[[1, 0, 125, 0, .03, .2, 2, 2, -6, 0, 0, 0, 0, 1.5, 0, .05]], [[1, 0, 62, 0, .05, .25, 0, 1, -2]], [[.5, 0, 420, 0, .02, .18, 4, 1, -2]]], v: .7, r: .06, g: .05, p: 1 },
    hitS: { l: [[[.6, 0, 340, 0, .006, .06, 4, 1, -8, 0, 0, 0, 0, 0, 0, .2]]], v: .22, r: .1, g: .05, p: 0 },
    hit: { l: [[[.8, 0, 300, 0, .01, .14, 4, 1, -5, 0, 0, 0, 0, 0, 0, .3]], [[.7, 0, 80, 0, .03, .15, 0, 1, -3]]], v: .5, r: .08, g: .06, p: 1 },
    bump: { l: [[[.4, 0, 800, 0, 0, .03, 1, 1, -20]]], v: .18, r: .15, g: .05, p: 0 },
    wall: { l: [[[.55, 0, 640, 0, .005, .07, 0, 1, -25]], [[.2, 0, 1300, 0, 0, .03, 1, 1, -30]]], v: .3, r: .1, g: .045, p: 0 },
    ring: { l: [[[.7, 0, 230, .005, .06, .22, 0, 1, 14, 0, 0, 0, 0, 0, 12]], [[.35, 0, 880, 0, .03, .15, 1, 1, 25], .04]], v: .45, r: .05, g: .08, p: 1 },
    spike: { l: [[[.6, 0, 1500, 0, .02, .1, 2, 1, -30, 0, 0, 0, 0, 1.5, 0, .2]], [[.6, 0, 190, 0, .03, .12, 5, .4, -8]]], v: .42, r: .08, g: .08, p: 1 },
    // ---- 彈射 ----
    launch: { l: [[[.45, 0, 200, .01, .03, .12, 1, 1, 14]], [[.25, 0, 600, .02, .04, .1, 4, 1, 8]]], v: .4, r: .05, g: .06, p: 1 },
    full: { l: [[[.55, 0, 180, .01, .06, .2, 2, 1, 18]], [[.3, 0, 700, .02, .08, .15, 4, 1, 10]]], v: .42, r: .03, g: .1, p: 1 },
    // ---- 戰鬥效果 ----
    boom: { l: [[[1, 0, 55, 0, .08, .5, 0, 1, -1.5]], [[.9, 0, 300, 0, .05, .45, 4, 1, -1, 0, 0, 0, 0, 2]]], v: .62, r: .08, g: .07, p: 1, duck: 1 },
    death: { l: [[[.6, 0, 420, 0, .05, .35, 2, 1, -6, 0, 0, 0, 0, .3]], [[.45, 0, 120, 0, .05, .3, 0, 1, -3]]], v: .45, r: .05, g: .1, p: 1 },
    combo: { l: notes(['c5', 'g5'], .09, .16, 5, .5), v: .32, g: .1, p: 1 },
    freeze: { l: [[[.4, 0, 1600, .005, .05, .25, 0, 1, -12, 0, 0, 0, 0, 0, 0, 0, .04]], [[.2, 0, 2600, 0, .05, .2, 1, 1, 0, 0, 0, 0, .03]]], v: .3, r: .06, g: .08, p: 1 },
    zap: { l: [[[.45, 0, 2000, 0, .03, .09, 4, 1, -10, 0, 0, 0, 0, 0, 0, .15]]], v: .28, r: .1, g: .06, p: 0 },
    poison: { l: [[[.35, 0, 180, .01, .05, .12, 0, 1, 15, 0, 0, 0, .05]]], v: .25, r: .1, g: .08, p: 0 },
    heal: { l: [[[.4, 0, 660, .01, .08, .25, 0, 1, 6, 0, 0, 0, 0, 0, 0, 0, .06]]], v: .3, r: .04, g: .08, p: 1 },
    revive: { l: notes(['g4', 'c5', 'e5', 'g5', 'c6'], .07, .3, 0, .55, { 16: .08 }).concat([[[.3, 0, 300, .3, .05, .2, 4, 1, 6]]]), v: .42, g: .3, p: 2 },
    moveLose: { l: notes(['e4', 'a#3'], .13, .22, 5, .5), v: .34, g: .3, p: 2 },
    moveGain: { l: notes(['e5', 'b5'], .08, .18, 1, .5), v: .3, g: .3, p: 2 },
    // ---- 大招（9 種）：共用一聲蓄力，再各自的主音 ----
    ult_nova: { l: [[[.5, 0, 200, .25, 0, .05, 2, 1, 30]], [[1, 0, 50, 0, .1, .7, 0, 1, -1], .25], [[.9, 0, 400, 0, .05, .6, 4, 1, -1.5, 0, 0, 0, 0, 2], .25]] },
    ult_vortex: { l: [[[.7, 0, 800, .05, .4, .4, 0, 1, -8, 0, 0, 0, 0, 0, 30]], [[.6, 0, 110, .1, .5, .3, 1, 1, -1, 0, 0, 0, 0, 0, 6]]] },
    ult_bulwark: { l: [[[.7, 0, 440, 0, .02, .6, 5, .3]], [[.5, 0, 660, 0, .02, .5, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, .08]], [[.6, 0, 110, .02, .3, .4, 1]]] },
    ult_phase: { l: [[[.5, 0, 300, .02, .08, .25, 1, 1, 45, 0, 0, 0, 0, 0, 0, 0, .04]], [[.3, 0, 1500, .01, .1, .3, 0, 1, -20, 0, 0, 0, 0, 0, 40]]] },
    ult_quake: { l: [[[1, 0, 45, .02, .4, .6, 4, 1, -.5, 0, 0, 0, 0, 1]], [[.8, 0, 70, 0, .1, .4, 0, 1, -2]], [[.6, 0, 55, 0, .1, .4, 0, 1, -2], .22]] },
    ult_plague: { l: [[[.5, 0, 160, .01, .45, .2, 0, 1, 25, 0, 0, 0, .07]], [[.35, 0, 90, .05, .4, .3, 2, 1, 0, 0, 0, 0, 0, 0, 8]]] },
    ult_ricochet: { l: [[[.5, 0, 700, 0, .3, .15, 1, 1, 0, 0, 500, .04, .08]], [[.3, 0, 1400, 0, .02, .1, 0, 1], .4]] },
    ult_overdrive: { l: [[[.6, 0, 90, .02, .35, .25, 2, 1, 10, 0, 0, 0, 0, .3, 0, .15]], [[.4, 0, 1200, 0, .2, .2, 4, 1, 0, 0, 0, 0, 0, 0, 0, .2]]] },
    ult_heal: { l: notes(['e5', 'g#5', 'b5', 'e6'], .08, .45, 0, .5, { 16: .1 }).concat([[[.3, 0, 1320, .1, .3, .4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, .1]]]) },
    // ---- 商店／流程 ----
    coin: { l: notes(['b5', 'e6'], .06, .1, 5, .4), v: .26, g: .05, p: 2 },
    buy: { l: notes(['c6', 'g6'], .07, .14, 5, .45).concat([[[.4, 0, 140, 0, .02, .06, 0, 1, -5]]]), v: .3, g: .05, p: 2 },
    sell: { l: notes(['e6', 'b5'], .06, .12, 5, .4), v: .26, g: .05, p: 2 },
    reroll: { l: [[[.35, 0, 1500, 0, .2, .05, 4, 1, 0, 0, 0, 0, .035, 0, 0, 0, 0, 1, 0, .9]], [[.3, 0, 300, .02, .1, .1, 1, 1, 10]]], v: .32, g: .08, p: 2 },
    starup: { l: notes(['c6', 'e6', 'g6', 'c7'], .06, .2, 1, .5).concat([[[.25, 0, 2093, .01, .25, .3, 0, 1, 0, 0, 0, 0, .05, 0, 0, 0, 0, 1, 0, .5], .24]]), v: .38, g: .2, p: 2 },
    strategy: { l: notes(['e5', 'g#5', 'b5', 'e6', 'g#6'], .05, .4, 0, .45, { 16: .09 }).concat([[[.3, 0, 330, .1, .3, .4, 1, 1]]]), v: .38, g: .2, p: 2 },
    turn: { l: notes(['a5', 'e6'], .12, .35, 0, .45), v: .28, g: .4, p: 2 },
    click: { l: [[[.3, 0, 900, 0, 0, .02, 1, 1, -40]]], v: .18, g: .03, p: 2 },
    boss: { l: [[[.9, 0, 55, .15, .6, .8, 2, 1, 0, 0, 0, 0, .125, .2, 0, 0, 0, .8, 0, .4]], [[.6, 0, 110, 0, .1, 1.2, 0, 1, -.2, 0, 0, 0, 0, 0, 3]], [[.4, 0, 200, .4, .1, .4, 4, 1]]], v: .6, g: 1, p: 2, duck: 2 },
    win: { l: notes(['c5', 'e5', 'g5'], .1, .12, 5, .45).concat(notes(['c6'], 0, .6, 5, .5).map(x => [x[0], .3]), notes(['g5'], 0, .6, 1, .35).map(x => [x[0], .3])), v: .42, g: 1, p: 2, duck: 2 },
    lose: { l: notes(['g4', 'f#4', 'f4'], .22, .25, 1, .5).concat([[[.5, 0, hz(midi('e4')), .01, .5, .4, 1, 1, -.4], .66]]), v: .42, g: 1, p: 2, duck: 2 }
  };
  const ULT_IN = [[.35, 0, 400, .15, 0, .08, 4, 1, 20]]; // 大招共用：蓄力噪音上衝
  Object.keys(SFX).forEach(k => { if (k.startsWith('ult_')) { const d = SFX[k]; d.l.unshift(ULT_IN); Object.assign(d, { v: .55, g: .3, p: 2, duck: 2 }); } });

  // ---- 樣本快取 ----
  const buf = {};
  function build(name) {
    const d = SFX[name]; if (!d || !g.ZZFX) return null;
    if (buf[name]) return buf[name];
    const Z = g.ZZFX; Z.volume = 1; Z.sampleRate = 44100;
    const parts = d.l.map(([p, at]) => { const q = p.slice(); q[1] = 0; return { s: Z.buildSamples(...q), o: Math.round((at || 0) * 44100) }; });
    const n = Math.max(...parts.map(x => x.s.length + x.o)), out = new Float32Array(n);
    parts.forEach(x => { for (let i = 0; i < x.s.length; i++) out[i + x.o] += x.s[i]; });
    let pk = 0; for (let i = 0; i < n; i++) { const a = Math.abs(out[i]); if (a > pk) pk = a; }
    const k = (d.v == null ? .5 : d.v) / (pk || 1);
    for (let i = 0; i < n; i++) out[i] *= k;
    const b = ctx.createBuffer(1, n, 44100); b.getChannelData(0).set(out);
    return (buf[name] = b);
  }
  // 解鎖後在閒置時把剩下的音效預先算好，避免第一次播放卡一下
  function prebuild() {
    const left = Object.keys(SFX).filter(k => !buf[k]);
    if (!left.length || !ctx) return;
    try { build(left[0]); } catch (e) { }
    (g.requestIdleCallback || (f => setTimeout(f, 16)))(prebuild);
  }

  // ---- 限流：同名最短間隔、碰撞類每 50ms 最多 3 聲、同時發聲上限 ----
  const last = {}; let impWin = 0, impN = 0, lastAny = 0;
  function playBuf(b, rate) {
    const s = ctx.createBufferSource(); s.buffer = b; if (rate !== 1) s.playbackRate.value = rate;
    s.connect(sfxBus); stat.voices++; s.onended = () => { stat.voices--; s.disconnect(); };
    s.start(); return s;
  }
  function duckMusic(lv) {
    if (!duck) return; const t = ctx.currentTime, p = duck.gain;
    p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(lv > 1 ? .35 : .6, t + .03); p.setTargetAtTime(1, t + (lv > 1 ? .7 : .25), .3);
  }

  const S = FA.sound = {
    on: LSget('fa_sound', true), musicOn: LSget('fa_music', true),
    get ctx() { return ctx; },
    names: () => Object.keys(SFX), songs: () => Object.keys(SONGS),
    stats: () => Object.assign({ state: ctx ? ctx.state : 'none', song: cur ? cur.name : null, playing: playing.length, cached: Object.keys(buf).length }, stat),
    init() {
      try {
        if (!ctx) {
          const AC = g.AudioContext || g.webkitAudioContext; if (!AC) return;
          try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch (e) { }
          ctx = new AC();
          const comp = ctx.createDynamicsCompressor();
          comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 10; comp.attack.value = .003; comp.release.value = .15;
          master = ctx.createGain(); master.gain.value = .9; master.connect(comp); comp.connect(ctx.destination);
          sfxBus = ctx.createGain(); sfxBus.gain.value = S.on ? SFX_VOL : 0; sfxBus.connect(master);
          musBus = ctx.createGain(); musBus.gain.value = S.musicOn ? MUS_VOL : 0; musBus.connect(master);
          duck = ctx.createGain(); duck.connect(musBus);
          ctx.onstatechange = () => { if (ctx.state === 'running') { ensureMusic(); if (!S._pb) { S._pb = 1; setTimeout(prebuild, 300); } } };
          setInterval(tick, 50);
        }
        if (ctx.state !== 'running' && !document.hidden) {
          const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0); // iOS 解鎖用的無聲樣本
          const p = ctx.resume(); p && p.then && p.then(ensureMusic, () => { });
        }
      } catch (e) { }
    },
    toggle() { S.on = !S.on; LSset('fa_sound', S.on); if (sfxBus) sfxBus.gain.setTargetAtTime(S.on ? SFX_VOL : 0, ctx.currentTime, .03); return S.on; },
    toggleMusic() {
      S.musicOn = !S.musicOn; LSset('fa_music', S.musicOn);
      if (ctx) { musBus.gain.setTargetAtTime(S.musicOn ? MUS_VOL : 0, ctx.currentTime, .15); if (S.musicOn) ensureMusic(); else stopAll(.6); }
      return S.musicOn;
    },
    play(name, k) {
      if (!S.on || !ctx || ctx.state !== 'running') return;
      if (name === 'imp') { const s = k || 0; if (s < 60) return; name = s < 170 ? 'imp0' : s < 380 ? 'imp1' : s < 700 ? 'imp2' : 'imp3'; }
      if (name === 'click' && performance.now() - lastAny < 60) return; // 已經有專屬音效就不再疊按鈕聲
      const d = SFX[name] || SFX.combo; if (!SFX[name]) name = 'combo';
      const now = ctx.currentTime;
      if (now - (last[name] || -9) < (d.g || .04)) { stat.sfxDropped++; return; }
      const pri = d.p == null ? 1 : d.p;
      if (pri === 0) { if (now - impWin > .05) { impWin = now; impN = 0; } if (impN >= 3 || stat.voices > 12) { stat.sfxDropped++; return; } impN++; }
      else if (pri === 1 && stat.voices > 20) { stat.sfxDropped++; return; }
      else if (stat.voices > 32) { stat.sfxDropped++; return; }
      last[name] = now; if (name !== 'click') lastAny = performance.now();
      try {
        const b = build(name); if (!b) return;
        playBuf(b, 1 + (d.r || 0) * (Math.random() * 2 - 1)); stat.sfxPlayed++;
        if (d.duck) duckMusic(d.duck);
      } catch (e) { }
    },
    // 狀態從 false 變 true 時才響（例：輪到你）
    edge(key, flag) { const was = S['_e' + key]; S['_e' + key] = !!flag; if (flag && !was) S.play(key); },
    music(name, opt) { want = name; wantDelay = (opt && opt.delay) || 0; ensureMusic(); }
  };

  // ================= 背景音樂 =================
  // 每首：bpm、chords（每小節一個和弦，逗號＝半小節兩個）、bass/arp 每小節 16 格樣式、鼓 k/s/h、主旋律 lead（音名:16分音符數）
  // bass：r 根音 o 高八度 f 五度 t 三度 . 休止 - 延長；arp：0~3 和弦音序號
  const SONGS = {
    title: { bpm: 100, chords: 'C Am F G C Am Dm G', bass: 'r--.....o.f.r...', arp: '0.1.2.3.2.1.0.1.', arpW: 'triangle', pad: 1,
      k: 'x.......x.......', s: '........x.......', h: '..x...x...x...x.',
      lead: 'e4:4 g4:4 c5:4 g4:4 a4:6 g4:2 e4:8 f4:4 a4:4 c5:4 a4:4 g4:6 f4:2 d4:8 e4:4 g4:4 c5:4 e5:4 d5:4 c5:4 a4:8 f4:4 a4:2 g4:2 f4:4 d4:4 g4:4 b3:4 d4:4 r:4', leadW: 'triangle',
      v: { b: .5, a: .1, p: .05, l: .2, k: .5, s: .25, h: .1 } },
    shop: { bpm: 112, chords: 'Fmaj7 Em7,A7 Dm7 G7 Cmaj7 Am7 Dm7,G7 Cmaj7', bass: 'r-.f..r.r-.f..o.', arp: '..1.2...3.2..1..', arpW: 'sine', pad: 1,
      k: 'x.....x.x.....x.', s: '...x..x....x..x.', h: 'x.x.x.x.x.x.x.x.', sRim: 1,
      lead: 'a4:3 c5:3 e5:2 r:2 d5:2 c5:4 b4:6 g4:2 r:2 c#5:2 e5:4 f5:3 e5:3 d5:2 r:4 a4:4 b4:4 d5:4 f5:4 e5:2 d5:2 e5:6 g5:2 r:2 e5:2 d5:4 c5:6 a4:2 r:4 c5:2 d5:2 f5:4 e5:2 d5:2 b4:4 d5:4 c5:12 r:4', leadW: 'triangle',
      v: { b: .45, a: .09, p: .05, l: .17, k: .35, s: .14, h: .06 } },
    battle: { bpm: 140, chords: 'Am F G Em Am F G E', bass: 'r.o.r.o.r.o.r.o.', arp: '0120012001200120', arpW: 'square', pad: 0,
      k: 'x...x...x...x...', s: '....x.......x..x', h: '.xx..xx..xx..xx.',
      lead: 'a4:2 c5:2 e5:2 a5:2 g5:2 e5:2 c5:2 e5:2 f5:4 e5:2 c5:2 a4:4 c5:4 d5:2 g5:2 b5:2 g5:2 d5:4 b4:4 e5:6 g5:2 b5:4 e5:4 a5:2 g5:2 e5:2 a5:2 c6:4 b5:2 a5:2 f5:4 a5:2 g5:2 f5:4 c5:4 d5:2 e5:2 g5:2 d5:2 b4:4 d5:4 e5:4 g#5:4 b5:4 e5:4', leadW: 'square', lo: -12,
      v: { b: .55, a: .05, p: 0, l: .11, k: .6, s: .3, h: .09 } },
    boss: { bpm: 150, chords: 'Dm Bb Gm A Dm Bb C A', bass: 'rrorrrorrrorrfro', bassW: 'sawtooth', arp: '0.2.1.2.0.2.3.2.', arpW: 'square', pad: 1, padW: 'sawtooth',
      k: 'x..x..x.x..x..x.', s: '....x.......x.xx', h: 'x.x.x.x.x.x.x.x.',
      lead: 'd5:4 r:2 d5:2 f5:4 a5:4 a#5:6 a5:2 f5:4 d5:4 g5:4 a#5:4 d6:4 a#5:4 a5:8 c#6:4 e5:4 d6:4 c6:2 a5:2 f5:4 d5:4 f5:2 g5:2 a5:2 a#5:2 a5:4 f5:4 e5:4 g5:4 c6:4 g5:4 a5:4 e5:4 c#5:4 a4:4', leadW: 'sawtooth', lo: -12,
      v: { b: .4, a: .05, p: .025, l: .09, k: .65, s: .32, h: .08 } },
    win: { bpm: 120, chords: 'C F G C Am F G C', bass: 'r...o...f...o...', arp: '0.1.2.3.0.1.2.3.', arpW: 'triangle', pad: 1,
      k: 'x.......x.......', s: '....x.......x...', h: '..x...x...x...x.',
      lead: 'c5:4 e5:4 g5:4 c6:4 a5:4 f5:4 c5:8 b4:4 d5:4 g5:4 f5:4 e5:12 r:4 e5:4 a5:4 c6:4 a5:4 f5:4 a5:4 c6:4 d6:4 d6:4 b5:4 g5:4 b5:4 c6:12 r:4', leadW: 'triangle', lo: -12,
      v: { b: .45, a: .08, p: .04, l: .18, k: .4, s: .2, h: .08 } },
    lose: { bpm: 72, chords: 'Am Dm E Am F Dm E Am', bass: 'r-------f-------', arp: '0...1...2...1...', arpW: 'sine', pad: 1,
      lead: 'e5:8 c5:4 a4:4 f5:8 d5:4 a4:4 g#4:8 b4:4 e5:4 a4:16 c5:8 a4:4 f4:4 d5:8 f5:4 d5:4 b4:8 g#4:4 e4:4 a4:16', leadW: 'triangle', lo: -12,
      v: { b: .4, a: .1, p: .06, l: .2 } }
  };
  const QUAL = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], dim: [0, 3, 6], sus4: [0, 5, 7] };
  function chord(name) { const m = /^([A-G])([#b]?)(.*)$/.exec(name); const pc = (NT[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12; return { pc, iv: QUAL[m[3]] || QUAL[''] }; }
  // 把一首曲子展開成每格事件表（只做一次）
  function compile(def) {
    if (def._steps) return def;
    const bars = def.chords.split(' '), len = bars.length * 16, steps = [...Array(len)].map(() => []);
    const chordAt = st => { const parts = bars[st >> 4].split(','), n = parts.length, k = Math.min(n - 1, ((st & 15) * n) >> 4); return { c: chord(parts[k]), start: ((st >> 4) << 4) + ((16 / n) * k), len: 16 / n }; };
    const holdLen = (pat, i) => { let d = 1; while (pat[(i + d) % 16] === '-' && d < 16) d++; return d; };
    for (let st = 0; st < len; st++) {
      const i = st & 15, C = chordAt(st), c = C.c;
      const bc = def.bass && def.bass[i];
      if (bc && bc !== '.' && bc !== '-') {
        const root = 48 + c.pc - (c.pc > 7 ? 12 : 0), off = { r: 0, o: 12, f: 7, t: c.iv[1] }[bc] || 0;
        steps[st].push(['b', root + off, Math.max(1, holdLen(def.bass, i) - 0.3)]);
      }
      const ac = def.arp && def.arp[i];
      if (ac && ac >= '0' && ac <= '3') {
        const r = 60 + c.pc - (c.pc > 5 ? 12 : 0), iv = c.iv.concat([12]);
        steps[st].push(['a', r + 12 + iv[Math.min(+ac, iv.length - 1)], holdLen(def.arp, i) * 0.8]);
      }
      if (def.pad && C.start === st) { const r = 52 + ((c.pc - 4 + 12) % 12); steps[st].push(['p', c.iv.map(x => r + x), C.len]); }
      ['k', 's', 'h'].forEach(dk => { const ch = def[dk] && def[dk][i]; if (ch === 'x' || ch === 'o') steps[st].push([dk, ch === 'o' ? .5 : 1]); });
    }
    if (def.lead) { let st = 0; def.lead.split(' ').forEach(tok => { const [n, d] = tok.split(':'), dd = +d; if (n !== 'r' && st < len) steps[st].push(['l', midi(n) + (def.lo || 0), dd]); st += dd; }); def._leadLen = st; }
    def._steps = steps; def._len = len; return def;
  }

  // ---- 鼓：小段樣本，第一次用時算好 ----
  let drums = null;
  function makeDrums() {
    const sr = ctx.sampleRate, mk = (sec, f) => { const n = Math.floor(sr * sec), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0); f(d, n, sr); return b; };
    let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 1073741823.5) - 1;
    drums = {
      k: mk(.3, (d, n, sr) => { let ph = 0; for (let i = 0; i < n; i++) { const t = i / sr, f = 45 + 110 * Math.exp(-t * 28); ph += 2 * Math.PI * f / sr; d[i] = Math.sin(ph) * Math.exp(-t * 9) * .9; } }),
      s: mk(.2, (d, n, sr) => { let lp = 0, ph = 0; for (let i = 0; i < n; i++) { const t = i / sr, w = rnd(); lp += (w - lp) * .5; ph += 2 * Math.PI * 190 / sr; d[i] = ((w - lp) * .8 * Math.exp(-t * 22) + Math.sin(ph) * .5 * Math.exp(-t * 35)) * .8; } }),
      r: mk(.06, (d, n, sr) => { let ph = 0; for (let i = 0; i < n; i++) { const t = i / sr; ph += 2 * Math.PI * 1700 / sr; d[i] = (Math.sin(ph) * .6 + rnd() * .3) * Math.exp(-t * 90); } }),
      h: mk(.05, (d, n, sr) => { let prev = 0; for (let i = 0; i < n; i++) { const t = i / sr, w = rnd(); d[i] = (w - prev) * .5 * Math.exp(-t * 70); prev = w; } })
    };
  }

  let cur = null, want = null, wantDelay = 0; const playing = [];
  function noteOsc(dest, t, m, dur, type, vol, atk) {
    const o = ctx.createOscillator(), gn = ctx.createGain(), end = t + dur;
    o.type = type; o.frequency.value = hz(m);
    gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol, t + atk);
    gn.gain.setValueAtTime(vol, Math.max(t + atk, end - dur * 0.35)); gn.gain.exponentialRampToValueAtTime(.0005, end);
    o.connect(gn); gn.connect(dest); o.start(t); o.stop(end + .02);
    stat.mnodes += 2; stat.notes++; o.onended = () => { stat.mnodes -= 2; gn.disconnect(); };
  }
  function playStep(s, st, t, spb) {
    const def = s.def, V = def.v;
    for (const e of def._steps[st]) {
      const k = e[0];
      if (k === 'b') noteOsc(s.gain, t, e[1], e[2] * spb, def.bassW || 'triangle', V.b * (def.bassW === 'sawtooth' ? .35 : 1), .006);
      else if (k === 'a') noteOsc(s.gain, t, e[1], Math.max(.08, e[2] * spb), def.arpW || 'square', V.a * (def.arpW === 'square' ? .6 : 1), .004);
      else if (k === 'l') noteOsc(s.gain, t, e[1], e[2] * spb * .92, def.leadW || 'square', V.l * (def.leadW === 'square' || def.leadW === 'sawtooth' ? .55 : 1), .012);
      else if (k === 'p') { if (!V.p) continue; const gn = ctx.createGain(), end = t + e[2] * spb, os = [];
        gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(V.p * (def.padW === 'sawtooth' ? .4 : 1), t + .12); gn.gain.setValueAtTime(V.p * (def.padW === 'sawtooth' ? .4 : 1), end - .15); gn.gain.linearRampToValueAtTime(0, end);
        gn.connect(s.gain); stat.mnodes++;
        e[1].forEach(m => { const o = ctx.createOscillator(); o.type = def.padW || 'triangle'; o.frequency.value = hz(m); o.connect(gn); o.start(t); o.stop(end + .02); os.push(o); stat.mnodes++; });
        os[0].onended = () => { stat.mnodes -= 1 + os.length; gn.disconnect(); }; stat.notes++; }
      else { // 鼓
        if (!drums) makeDrums();
        const src = ctx.createBufferSource(), gn = ctx.createGain(), dk = k === 's' && def.sRim ? 'r' : k;
        src.buffer = drums[dk]; gn.gain.value = (V[k] || 0) * e[1]; src.connect(gn); gn.connect(s.gain); src.start(t);
        stat.mnodes += 2; src.onended = () => { stat.mnodes -= 2; gn.disconnect(); };
      }
    }
  }
  const LOOK = .3;
  function tick() {
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    for (let i = playing.length - 1; i >= 0; i--) {
      const s = playing[i];
      if (s.stopped) { if (now > s.stopAt) { try { s.gain.disconnect(); } catch (e) { } playing.splice(i, 1); } continue; }
      const spb = 60 / s.def.bpm / 4;
      if (s.next < now - .1) { const skip = Math.ceil((now - s.next) / spb); s.step += skip; s.next += skip * spb; } // 主執行緒卡住太久：跳過錯過的格子，不要一次補一堆
      while (s.next < now + LOOK) { playStep(s, s.step % s.def._len, s.next, spb); s.step++; s.next += spb; }
    }
  }
  function stopSong(s, fade) {
    if (!s || s.stopped) return; s.stopped = true;
    const t = ctx.currentTime, p = s.gain.gain; p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(0, t + fade);
    s.stopAt = t + fade + LOOK + .1;
  }
  function stopAll(fade) { playing.forEach(s => stopSong(s, fade)); cur = null; }
  function ensureMusic() {
    if (!ctx || ctx.state !== 'running' || !S.musicOn) return;
    if (!want) { if (cur) stopAll(.8); return; }
    if (cur && cur.name === want) return;
    if (cur) stopSong(cur, .7);
    const def = compile(SONGS[want] || SONGS.title), t0 = ctx.currentTime + .05 + wantDelay;
    const gain = ctx.createGain(); gain.gain.setValueAtTime(0, ctx.currentTime); gain.gain.setValueAtTime(0, t0); gain.gain.linearRampToValueAtTime(1, t0 + .9); gain.connect(duck);
    cur = { name: want, def, gain, step: 0, next: t0, stopped: false }; playing.push(cur); wantDelay = 0;
  }

  // ---- 解鎖與前後台 ----
  const unlock = () => { if (!ctx || ctx.state !== 'running') S.init(); };
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach(ev => g.addEventListener && g.addEventListener(ev, unlock, { passive: true, capture: true }));
  if (g.document) {
    const vis = () => {
      if (!ctx) return;
      if (document.hidden) { if (ctx.state === 'running') ctx.suspend().catch(() => { }); }
      else if (ctx.state !== 'running') { const p = ctx.resume(); p && p.then && p.then(ensureMusic, () => { }); }
    };
    document.addEventListener('visibilitychange', vis);
    g.addEventListener('pagehide', () => { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => { }); });
    g.addEventListener('pageshow', vis);
    // 按鈕點擊聲（專屬音效已經響了就略過）
    document.addEventListener('click', e => { if (e.target.closest && e.target.closest('button,.choice,[data-m]')) S.play('click'); });
  }
})(globalThis);
