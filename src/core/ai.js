// AI：抽樣候選射擊 → 用同一套物理預演 → 選分數最高，再加瞄準誤差
(function (g) {
  const FA = g.FA = g.FA || {};
  const clone = b => { const c = JSON.parse(JSON.stringify(b)); c.events = []; return c; };

  function evalShot(b, team, idx, ang, pw) {
    const c = clone(b);
    if (!FA.battle.launch(c, idx, ang, pw)) return -1e9;
    FA.battle.runShot(c);
    let s = 0;
    c.bodies.forEach((o, i) => {
      const o0 = b.bodies[i], lost = (o0.hp + o0.shield) - (o.hp + o.shield);
      if (o.team === team) { s -= lost * 0.9; if (o0.alive && !o.alive) s -= 120; }
      else { s += lost; if (o0.alive && !o.alive) s += 150; if (o.stunned) s += 20; }
    });
    return s;
  }

  // diff: {aimNoise, candidates}
  function choose(b, team, diff, r) {
    const mine = b.bodies.filter(o => o.alive && o.team === team && !o.stunned);
    const foes = b.bodies.filter(o => o.alive && o.team !== team);
    const cands = [];
    mine.forEach(m => foes.forEach(f => {
      const a = Math.atan2(f.y - m.y, f.x - m.x);
      cands.push([m.i, a, 1], [m.i, a, 0.7]);
    }));
    // 打亂並截斷，再補幾發隨機角度（反彈球）
    for (let i = cands.length - 1; i > 0; i--) { const j = FA.rng.int(r, i + 1);[cands[i], cands[j]] = [cands[j], cands[i]]; }
    const list = cands.slice(0, Math.max(2, Math.floor(diff.candidates * 0.75)));
    while (list.length < diff.candidates && mine.length) list.push([FA.rng.pick(r, mine).i, FA.rng.range(r, -Math.PI, Math.PI), FA.rng.range(r, 0.6, 1)]);
    let best = null, bs = -1e9;
    list.forEach(c => { const s = evalShot(b, team, c[0], c[1], c[2]); if (s > bs) { bs = s; best = c; } });
    if (!best) return null;
    const noise = (FA.rng.next(r) + FA.rng.next(r) - 1) * diff.aimNoise;
    return { idx: best[0], angle: best[1] + noise, power: best[2] };
  }

  FA.ai = { choose };
})(globalThis);
