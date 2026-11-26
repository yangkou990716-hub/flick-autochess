// AI：用幾何產生候選射擊（直打／反彈球／推隊友撞敵／聯動）→ 依類別配額取 diff.candidates 發
//     → 用同一套物理預演打分（擊殺加權、聯動、狀態、尖刺自傷）→ 選最高，再加瞄準誤差
// diff: {aimNoise 瞄準誤差（弧度）, candidates 預演次數＝思考深度}
(function (g) {
  const FA = g.FA = g.FA || {};
  const clone = b => { const c = JSON.parse(JSON.stringify(b)); c.events = []; return c; };
  const EVAL_STEPS = 1000; // 預演最多約 8 秒（固定步長 1/120），大部分傷害都在前段，換取效能
  const W = { own: 0.9, kill: 150, killHp: 0.3, die: 120, dieHp: 0.3, combo: 35, freeze: 45, poison: 0.7, spike: 0.8, zone: 0.4, expose: 20, win: 1500, lose: 1500 };

  function evalShot(b, team, idx, ang, pw) {
    const c = clone(b);
    if (!FA.battle.launch(c, idx, ang, pw)) return -1e9;
    // 全場都慢於最低傷害速度時，直接歸零（仍會觸發「停下時」能力），省下尾段滑行的計算
    const slow = FA.DATA.config.minHitSpeed;
    for (let k = 0; !FA.battle.step(c) && k < EVAL_STEPS; k++) {
      if ((k & 3) === 3 && !c.pending.length && c.bodies.every(o => !o.alive || (o.vx * o.vx + o.vy * o.vy) < slow * slow)) c.bodies.forEach(o => { o.vx = o.vy = 0; });
    }
    let s = 0, foesLeft = 0, ownLeft = 0;
    b.bodies.forEach((o0, i) => {
      if (o0.temp || !o0.alive) return;
      const o = c.bodies[i], lost = (o0.hp + o0.shield) - (o.hp + o.shield);
      if (o.team === team) {
        s -= lost * W.own;
        if (!o.alive) s -= W.die + o0.maxHp * W.dieHp; else ownLeft++;
      } else {
        s += lost;
        if (!o.alive) s += W.kill + o0.maxHp * W.killHp + (o0.boss ? 200 : 0);
        else {
          foesLeft++;
          if (o.stunned && !o0.stunned) s += W.freeze;
          if (o.exposed > o0.exposed) s += W.expose;
          const p1 = o.poison ? o.poison.dmg * o.poison.turns : 0, p0 = o0.poison ? o0.poison.dmg * o0.poison.turns : 0;
          if (p1 > p0) s += (p1 - p0) * W.poison;
        }
      }
    });
    if (!foesLeft) s += W.win;
    if (!ownLeft) s -= W.lose;
    c.events.forEach(e => {
      if (e.t === 'combo') s += W.combo;
      else if (e.t === 'dmg' && e.kind === 'spike' && e.team === team) s -= e.amt * W.spike;
    });
    const z0 = b.zones.length;
    for (let i = z0; i < c.zones.length; i++) if (c.zones[i].team === team) s += (c.zones[i].dmg || 0) * W.zone;
    return s;
  }

  // 反彈球：找圓牆上一點 P，使 m→P 反射後朝向 f；回傳最佳的 2 個角度
  function bankAngles(b, m, f) {
    const L = b.R - m.r, N = 48, sc = [];
    const score = th => {
      const px = Math.cos(th) * L, py = Math.sin(th) * L;
      let dx = px - m.x, dy = py - m.y; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const nx = px / L, ny = py / L, dn = dx * nx + dy * ny, rx = dx - 2 * dn * nx, ry = dy - 2 * dn * ny;
      let tx = f.x - px, ty = f.y - py; const tl = Math.hypot(tx, ty) || 1;
      return (rx * tx + ry * ty) / tl - (dl + tl) / 4000; // 對準度，略偏好短路線
    };
    for (let k = 0; k < N; k++) sc.push(score(k / N * 2 * Math.PI));
    const peaks = [];
    for (let k = 0; k < N; k++) if (sc[k] >= sc[(k + N - 1) % N] && sc[k] >= sc[(k + 1) % N] && sc[k] > 0.9) peaks.push(k);
    peaks.sort((a, c) => sc[c] - sc[a]);
    return peaks.slice(0, 2).map(k => {
      let lo = (k - 1) / N * 2 * Math.PI, hi = (k + 1) / N * 2 * Math.PI;
      for (let it = 0; it < 12; it++) { const a = lo + (hi - lo) / 3, c = hi - (hi - lo) / 3; if (score(a) < score(c)) lo = a; else hi = c; }
      const th = (lo + hi) / 2;
      return Math.atan2(Math.sin(th) * L - m.y, Math.cos(th) * L - m.x);
    });
  }

  // 直線路上有沒有別的棋子擋住（粗略），用來排序
  function blocked(b, m, tx, ty, skip) {
    const dx = tx - m.x, dy = ty - m.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    return b.bodies.some(o => {
      if (!o.alive || o === m || o === skip || o.temp) return false;
      const px = o.x - m.x, py = o.y - m.y, t = px * ux + py * uy;
      return t > 0 && t < L && Math.abs(px * uy - py * ux) < o.r + m.r;
    });
  }

  function choose(b, team, diff, r) {
    const mine = b.bodies.filter(o => o.alive && !o.temp && o.team === team && !o.stunned);
    const allies = b.bodies.filter(o => o.alive && !o.temp && o.team === team);
    const foes = b.bodies.filter(o => o.alive && !o.temp && o.team !== team);
    if (!mine.length) return null;
    const N = Math.max(2, diff.candidates | 0);
    const jit = () => FA.rng.next(r) * 0.6; // 排序用的小擾動（可重現）
    const kill = (m, f) => (f.hp + f.shield) / Math.max(1, FA.battle.atkOf(m)); // 越小越容易擊殺
    const cat = { combo: [], direct: [], bank: [], push: [] };
    mine.forEach(m => {
      foes.forEach(f => {
        const a = Math.atan2(f.y - m.y, f.x - m.x), d = Math.hypot(f.x - m.x, f.y - m.y);
        const h = kill(m, f) + d / 400 + (blocked(b, m, f.x, f.y, f) ? 1.5 : 0) + jit();
        cat.direct.push({ c: [m.i, a, 1], h }, { c: [m.i, a, 0.72], h: h + 0.4 });
        bankAngles(b, m, f).forEach(ba => cat.bank.push({ c: [m.i, ba, 1], h: kill(m, f) + 0.5 + jit() }));
      });
      allies.forEach(al => {
        if (al === m) return;
        const linked = (m.link && m.link === al.id) || (al.link && al.link === m.id);
        foes.forEach(f => {
          const fd = Math.hypot(f.x - al.x, f.y - al.y); if (fd > 280) return;
          const ux = (f.x - al.x) / (fd || 1), uy = (f.y - al.y) / (fd || 1), cx = al.x - ux * (m.r + al.r) * 0.9, cy = al.y - uy * (m.r + al.r) * 0.9;
          const a = Math.atan2(cy - m.y, cx - m.x), dot = Math.cos(a) * ux + Math.sin(a) * uy;
          if (dot < 0.4) return;
          const e = { c: [m.i, a, 1], h: kill(al, f) + fd / 300 + (1 - dot) * 2 + (blocked(b, m, cx, cy, al) ? 1.5 : 0) + jit() };
          (linked ? cat.combo : cat.push).push(e);
        });
        if (linked && !b.comboUsed[Math.min(m.i, al.i) + '-' + Math.max(m.i, al.i)])
          cat.combo.push({ c: [m.i, Math.atan2(al.y - m.y, al.x - m.x), 0.85], h: 1 + jit() });
      });
    });
    for (const k in cat) cat[k].sort((x, y) => x.h - y.h);
    // 配額：聯動優先，其次直打、反彈、推隊友，剩下隨機
    const quota = { combo: Math.min(cat.combo.length, Math.max(1, Math.round(N * 0.1))), direct: Math.max(1, Math.round(N * 0.55)), bank: Math.round(N * 0.15), push: Math.round(N * 0.1) };
    const list = [], take = (k, n) => { for (const e of cat[k]) { if (n <= 0 || list.length >= N) break; list.push(e.c); n--; } };
    take('combo', quota.combo); take('direct', quota.direct); take('bank', quota.bank); take('push', quota.push);
    // 沒用完的名額依序回填，再補隨機角度
    ['direct', 'bank', 'push', 'combo'].forEach(k => cat[k].forEach(e => { if (list.length < N - 1 && !list.includes(e.c)) list.push(e.c); }));
    while (list.length < N) list.push([FA.rng.pick(r, mine).i, FA.rng.range(r, -Math.PI, Math.PI), FA.rng.range(r, 0.6, 1)]);
    let best = null, bs = -1e9;
    list.forEach(c => { const s = evalShot(b, team, c[0], c[1], c[2]); if (s > bs) { bs = s; best = c; } });
    if (!best) return null;
    const noise = (FA.rng.next(r) + FA.rng.next(r) - 1) * diff.aimNoise;
    return { idx: best[0], angle: best[1] + noise, power: best[2], score: bs };
  }

  FA.ai = { choose, evalShot, bankAngles };
})(globalThis);
