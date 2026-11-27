// AI：用幾何產生候選射擊（直打／反彈球／泳圈柱反彈／推隊友撞敵／聯動）→ 依類別配額取 diff.candidates 發
//     → 用同一套物理預演打分（擊殺／陣亡以動數計、勝負、聯動、狀態、尖刺自傷、泳圈加攻）→ 選最高
//     → 能量滿的棋子再預演「放大招」版本，分數夠高才放 → 加瞄準誤差
// diff: {aimNoise 瞄準誤差（弧度）, candidates 預演次數＝思考深度}
(function (g) {
  const FA = g.FA = g.FA || {};
  const clone = b => { const c = JSON.parse(JSON.stringify(b)); c.events = []; return c; };
  const EVAL_STEPS = 1000; // 預演最多約 8 秒（固定步長 1/120），大部分傷害都在前段，換取效能
  // 總動數制：擊倒對手＝對方動數 -deathCost，自己被打倒同理，所以擊殺／陣亡以「動數價值」move 計分
  const W = { own: 0.9, move: 60, killHp: 0.15, dieHp: 0.15, combo: 35, freeze: 45, poison: 0.7, spike: 1.6, zone: 0.4, expose: 20, ring: 12, win: 2000, lose: 2000, ultHold: 15, fear: 30, rhythm: 35, beat: 30 };

  function evalShot(b, team, idx, ang, pw, ult, tap, expert) {
    const c = clone(b);
    if (!FA.battle.launch(c, idx, ang, pw, ult, tap)) return -1e9;
    // 全場都慢於最低傷害速度時，直接歸零（仍會觸發「停下時」能力），省下尾段滑行的計算
    const ab = c.bodies[idx].ab;
    const usesLines = (ab && (ab.type === 'rampDrop' || ab.type === 'ropeDrop')) || c.zones.some(z => z.kind === 'ramp' || z.kind === 'rope');
    const slow = usesLines ? FA.DATA.config.stopV : FA.DATA.config.minHitSpeed;
    for (let k = 0; !FA.battle.step(c) && k < EVAL_STEPS; k++) {
      if ((k & 3) === 3 && !c.pending.length && c.bodies.every(o => !o.alive || (o.vx * o.vx + o.vy * o.vy) < slow * slow)) c.bodies.forEach(o => { o.vx = o.vy = 0; });
    }
    const cfg = FA.DATA.config, dc = cfg.deathCost, foe = 1 - team, noRev = b.sides[foe].noRevive;
    let s = 0, foesLeft = 0, kills = 0, deaths = 0, bossDown = false;
    b.bodies.forEach((o0, i) => {
      if (o0.temp || !o0.alive) return;
      const o = c.bodies[i], lost = (o0.hp + o0.shield) - (o.hp + o.shield);
      if (o.team === team) {
        if (!o.alive) { deaths++; s -= o0.maxHp * W.dieHp + (o0.hp + o0.shield) * W.own; } else s -= lost * W.own;
      } else {
        s += lost;
        if (!o.alive) { kills++; s += o0.maxHp * W.killHp; if (o0.boss) bossDown = true; }
        else {
          foesLeft++;
          if (o.stunned && !o0.stunned) s += W.freeze;
          if (o.exposed > o0.exposed) s += W.expose;
          if (o.fear > o0.fear) s += W.fear;
          const p1 = o.poison ? o.poison.dmg * o.poison.turns : 0, p0 = o0.poison ? o0.poison.dmg * o0.poison.turns : 0;
          if (p1 > p0) s += (p1 - p0) * W.poison;
        }
      }
    });
    // 動數：對方被擊倒扣 dc 動（首領倒下＝直接贏）；自己這發 -1、被擊倒扣 dc
    const mF = bossDown ? 0 : b.moves[foe] - kills * dc, mM = b.moves[team] - 1 - deaths * dc;
    const foeNoAct = b.sides[foe].noAct;
    s += (Math.min(kills * dc, Math.max(0, b.moves[foe])) - deaths * dc) * W.move;
    if (noRev ? !foesLeft : bossDown || (!foeNoAct && mF <= 0 && (mM > 0 || mM > mF))) s += W.win;
    else if (mM <= 0) s -= W.lose;
    let ring = 0;
    c.events.forEach(e => {
      if (e.t === 'combo') s += W.combo;
      else if (e.t === 'dmg' && e.kind === 'spike' && e.team === team) s -= e.amt * W.spike;
      else if (e.t === 'ring' && !ring) ring = 1;
    });
    if (ring && c.hits) s += W.ring; // 泳圈柱加速加攻後真的撞到人
    if (expert) { // 高手：會顧節奏層數
      b.bodies.forEach((o0, i) => { if (o0.team !== team || o0.temp || !o0.alive || !o0.ab || o0.ab.type !== 'rhythm') return; const o = c.bodies[i];
        s += c.teamHit && o && o.alive ? W.rhythm * (o0.stacks + 1) : -W.rhythm * 1.5 * o0.stacks;
        if (i === idx && b.moves[team] > 3) s += W.beat * (o0.stacks - 2); }); // 層數低時先讓隊友打、疊高了才讓鼓手出手
    }
    const z0 = b.zones.length;
    for (let i = z0; i < c.zones.length; i++) if (c.zones[i].team === team) s += (c.zones[i].dmg || 0) * W.zone;
    return s;
  }

  // 反彈球（長方形牆）：把目標對四面牆做鏡射，直接瞄鏡像點
  function bankAngles(b, m, f) {
    const lx = b.hw - m.r, ly = b.hh - m.r, out = [];
    [[2 * lx - f.x, f.y], [-2 * lx - f.x, f.y], [f.x, 2 * ly - f.y], [f.x, -2 * ly - f.y]].forEach(([x, y]) => {
      out.push({ a: Math.atan2(y - m.y, x - m.x), d: Math.hypot(x - m.x, y - m.y) });
    });
    return out.sort((p, q) => p.d - q.d).slice(0, 2).map(o => o.a);
  }

  // 柱子反彈：在柱子（半徑 p.r+m.r）上找一點，入射方向反射後朝向目標；回傳角度或 null
  function pillarAngle(m, p, f) {
    const L = p.r + m.r, N = 36;
    const score = th => {
      const nx = Math.cos(th), ny = Math.sin(th), px = p.x + nx * L, py = p.y + ny * L;
      let dx = px - m.x, dy = py - m.y; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const dn = dx * nx + dy * ny; if (dn >= -0.15) return -2; // 要從外側正面撞上
      const rx = dx - 2 * dn * nx, ry = dy - 2 * dn * ny, tx = f.x - px, ty = f.y - py, tl = Math.hypot(tx, ty) || 1;
      return (rx * tx + ry * ty) / tl - (dl + tl) / 5000;
    };
    let bk = -1, bv = -2;
    for (let k = 0; k < N; k++) { const v = score(k / N * 2 * Math.PI); if (v > bv) { bv = v; bk = k; } }
    if (bv < 0.85) return null;
    let lo = (bk - 1) / N * 2 * Math.PI, hi = (bk + 1) / N * 2 * Math.PI;
    for (let it = 0; it < 10; it++) { const a = lo + (hi - lo) / 3, c = hi - (hi - lo) / 3; if (score(a) < score(c)) lo = a; else hi = c; }
    const th = (lo + hi) / 2;
    return Math.atan2(p.y + Math.sin(th) * L - m.y, p.x + Math.cos(th) * L - m.x);
  }

  // 直線路上有沒有尖刺柱
  function spikeOnPath(b, m, tx, ty) {
    const dx = tx - m.x, dy = ty - m.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    return (b.pillars || []).some(p => {
      if (p.kind !== 'spike') return false;
      const px = p.x - m.x, py = p.y - m.y, t = px * ux + py * uy;
      return t > 0 && t < L && Math.abs(px * uy - py * ux) < p.r + m.r;
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

  // ---- 神技 ----
  // 多次反彈（長方形鏡像法）：目標對牆鏡射 i、j 次的像點，撞牆 |i|+|j| 次；回傳 [{a, d, n}]
  function multiBank(b, m, f, nMin, nMax) {
    const lx = b.hw - m.r, ly = b.hh - m.r, out = [], img = (k, L, v) => k * 2 * L + (k & 1 ? -v : v);
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
      const n = Math.abs(i) + Math.abs(j); if (n < nMin || n > nMax) continue;
      const x = img(i, lx, f.x), y = img(j, ly, f.y); out.push({ a: Math.atan2(y - m.y, x - m.x), d: Math.hypot(x - m.x, y - m.y), n });
    }
    return out.sort((p, q) => p.d - q.d);
  }
  // 普通玩家的二次操作：固定在飛出 0.4 秒時點最近的敵人（不看時機）
  function simpleTap(b, m) {
    if (!FA.battle.tapAbility(m)) return null;
    let best = null, bd = 1e9; b.bodies.forEach(o => { if (o.alive && !o.temp && o.team !== m.team) { const d = Math.hypot(o.x - m.x, o.y - m.y); if (d < bd) { bd = d; best = o; } } });
    return best ? { t: 48, x: best.x, y: best.y } : null;
  }
  // 高手的二次操作：先不點跑一次，記錄每個時間點的位置，挑「炸最多人」或「分身最近的敵人」的幾個時機，再逐一預演
  function tapPlans(b, team, c) {
    const x0 = clone(b), m = x0.bodies[c[0]], kind = FA.battle.tapAbility(m); if (!kind) return [];
    if (!FA.battle.launch(x0, c[0], c[1], c[2], false)) return [];
    const R = m.ab.r || 130, snaps = [];
    for (let k = 1; k <= 360; k++) {
      const done = FA.battle.step(x0), mv = x0.bodies[c[0]];
      if (!mv.alive || (k > 6 && Math.hypot(mv.vx, mv.vy) < 40)) break;
      if (k % 4 === 0) {
        const foes = x0.bodies.filter(o => o.alive && !o.temp && o.team !== team);
        if (kind === 'boom') { const n = foes.reduce((s, o) => s + (Math.hypot(o.x - mv.x, o.y - mv.y) < R + o.r ? 1 + (1 - o.hp / o.maxHp) : 0), 0); if (n) snaps.push({ v: n, t: k + 1, x: 0, y: 0 }); }
        else foes.forEach(o => { const d = Math.hypot(o.x - mv.x, o.y - mv.y); if (d > mv.r + o.r + 20) snaps.push({ v: -d / 300 - o.hp / o.maxHp, t: k + 1, x: o.x + o.vx * 0.05, y: o.y + o.vy * 0.05 }); });
      }
      if (done) break;
    }
    snaps.sort((p, q) => q.v - p.v);
    const out = [], seen = new Set();
    for (const s of snaps) { const key = kind === 'boom' ? s.t >> 3 : (s.t >> 4) + ':' + Math.round(s.x / 60) + ':' + Math.round(s.y / 60); if (seen.has(key)) continue; seen.add(key); out.push({ t: s.t, x: s.x, y: s.y }); if (out.length >= 6) break; }
    return out;
  }
  const isSkill = m => m.ab && ['sweetSpot', 'trickShot', 'cueBall', 'remoteBomb', 'phantom', 'rhythm'].includes(m.ab.type);

  function choose(b, team, diff, r) {
    const mine = FA.battle.avail(b, team);
    const allies = b.bodies.filter(o => o.alive && !o.temp && o.team === team);
    const foes = b.bodies.filter(o => o.alive && !o.temp && o.team !== team);
    if (!mine.length) return null;
    const N = Math.max(2, diff.candidates | 0);
    const jit = () => FA.rng.next(r) * 0.6; // 排序用的小擾動（可重現）
    const kill = (m, f) => (f.hp + f.shield) / Math.max(1, FA.battle.atkOf(m)); // 越小越容易擊殺
    const cat = { combo: [], direct: [], bank: [], push: [], ring: [] };
    const rings = (b.pillars || []).filter(p => p.kind === 'ring');
    mine.forEach(m => {
      foes.forEach(f => {
        const a = Math.atan2(f.y - m.y, f.x - m.x), d = Math.hypot(f.x - m.x, f.y - m.y);
        const h = kill(m, f) + d / 400 + (blocked(b, m, f.x, f.y, f) ? 1.5 : 0) + (spikeOnPath(b, m, f.x, f.y) ? 2 : 0) + jit();
        cat.direct.push({ c: [m.i, a, 1], h }, { c: [m.i, a, 0.72], h: h + 0.4 });
        bankAngles(b, m, f).forEach(ba => cat.bank.push({ c: [m.i, ba, 1], h: kill(m, f) + 0.5 + jit() }));
        rings.forEach(p => { const ra = pillarAngle(m, p, f); if (ra != null) cat.ring.push({ c: [m.i, ra, 1], h: kill(m, f) * 0.85 + 0.3 + jit() }); });
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
    const quota = { combo: Math.min(cat.combo.length, Math.max(1, Math.round(N * 0.1))), ring: Math.min(cat.ring.length, Math.max(1, Math.round(N * 0.15))), direct: Math.max(1, Math.round(N * 0.45)), bank: Math.round(N * 0.12), push: Math.round(N * 0.1) };
    const list = [], take = (k, n) => { for (const e of cat[k]) { if (n <= 0 || list.length >= N) break; list.push(e.c); n--; } };
    take('combo', quota.combo); take('ring', quota.ring); take('direct', quota.direct); take('bank', quota.bank); take('push', quota.push);
    // 沒用完的名額依序回填，再補隨機角度
    ['direct', 'ring', 'bank', 'push', 'combo'].forEach(k => cat[k].forEach(e => { if (list.length < N - 1 && !list.includes(e.c)) list.push(e.c); }));
    while (list.length < N) list.push([FA.rng.pick(r, mine).i, FA.rng.range(r, -Math.PI, Math.PI), FA.rng.range(r, 0.6, 1)]);
    const EX = !!diff.expert;
    if (EX) mine.forEach(m => { // 高手：替神技角色加專屬候選（甜蜜點力道、3～4 次反彈、撞球連撞線）
      const t = m.ab && m.ab.type; if (!t) return;
      const near = foes.slice().sort((p, q) => Math.hypot(p.x - m.x, p.y - m.y) - Math.hypot(q.x - m.x, q.y - m.y)).slice(0, 3);
      if (t === 'sweetSpot') { const mid = (m.ab.lo + m.ab.hi) / 2; near.forEach(f => { list.push([m.i, Math.atan2(f.y - m.y, f.x - m.x), mid, 1]); bankAngles(b, m, f).forEach(a => list.push([m.i, a, mid, 1])); }); }
      if (t === 'trickShot') foes.forEach(f => multiBank(b, m, f, m.ab.n, m.ab.n + 1).slice(0, 3).forEach(o => list.push([m.i, o.a, 1, 1])));
      if (t === 'cueBall') near.forEach(f => foes.forEach(e => { if (e === f) return; const d = Math.hypot(e.x - f.x, e.y - f.y) || 1; if (d > 420) return; const ux = (e.x - f.x) / d, uy = (e.y - f.y) / d, px = f.x - ux * (m.r + f.r), py = f.y - uy * (m.r + f.r);
        const a = Math.atan2(py - m.y, px - m.x); if (Math.cos(a) * ux + Math.sin(a) * uy > 0.9) list.push([m.i, a, 1, 1]); }));
      if (t === 'remoteBomb' || t === 'phantom') near.forEach(f => { const a = Math.atan2(f.y - m.y, f.x - m.x); list.push([m.i, a, 1, 1], [m.i, a + 0.18, 1, 1], [m.i, a - 0.18, 1, 1]); });
    });
    // 二次操作：普通 AI 一律用固定時機（simpleTap）；高手之後再搜尋最佳時機
    const tapOf = c => simpleTap(b, b.bodies[c[0]]);
    const taps = list.map(c => tapOf(c));
    const sc = list.map((c, k) => evalShot(b, team, c[0], c[1], c[2], false, taps[k], EX));
    if (EX) { // 高手：每個二次操作角色取分數前 3 的候選，搜尋點擊時機
      const byU = {};
      list.forEach((c, k) => { if (FA.battle.tapAbility(b.bodies[c[0]])) (byU[c[0]] = byU[c[0]] || []).push(k); });
      for (const u in byU) byU[u].sort((x, y) => sc[y] - sc[x]).slice(0, 3).forEach(k => {
        tapPlans(b, team, list[k]).forEach(tp => { const v = evalShot(b, team, list[k][0], list[k][1], list[k][2], false, tp, EX); if (v > sc[k]) { sc[k] = v; taps[k] = tp; } });
      });
    }
    let bi = -1, bs = -1e9;
    sc.forEach((v, k) => { if (v > bs) { bs = v; bi = k; } });
    if (bi < 0) return null;
    let best = list[bi], useUlt = false, bestTap = taps[bi];
    // 大招：能量滿的棋子取前幾名候選，再各預演一次「放大招」；放大招要比不放多出 ultHold 分才放（快沒動數時不留）
    const UM = FA.DATA.config.ult.max, full = new Set(mine.filter(m => m.energy >= UM).map(m => m.i));
    if (full.size) {
      const hold = b.moves[team] <= 3 ? 0 : W.ultHold;
      const top = list.map((c, k) => k).filter(k => full.has(list[k][0])).sort((x, y) => sc[y] - sc[x]).slice(0, Math.max(2, Math.min(4, N >> 3)));
      top.forEach(k => { const c = list[k], v = evalShot(b, team, c[0], c[1], c[2], true, taps[k], EX) - hold; if (v > bs) { bs = v; best = c; useUlt = true; bestTap = taps[k]; } });
    }
    const bm = b.bodies[best[0]], an = EX && isSkill(bm) ? diff.aimNoise * 0.35 : diff.aimNoise; // 高手玩神技角色瞄得更準
    const noise = (FA.rng.next(r) + FA.rng.next(r) - 1) * an;
    const res = { idx: best[0], angle: best[1] + noise, power: best[2], score: bs, ult: useUlt };
    if (bestTap) res.tap = bestTap;
    return res;
  }

  FA.ai = { choose, evalShot, bankAngles, pillarAngle, multiBank, simpleTap };
})(globalThis);
