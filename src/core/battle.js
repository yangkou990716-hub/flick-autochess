// 戰鬥核心：固定時間步圓形物理＋規則。純資料物件，可 JSON 存檔、可在 Node 跑。
(function (g) {
  const FA = g.FA = g.FA || {};
  const D = () => FA.DATA, C = () => FA.DATA.config;

  // ---- 可重現亂數（mulberry32），狀態存在物件 o.s ----
  const rng = FA.rng = {
    next(o) { let t = o.s = (o.s + 0x6D2B79F5) | 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; },
    int(o, n) { return Math.floor(rng.next(o) * n); },
    pick(o, a) { return a[rng.int(o, a.length)]; },
    range(o, a, b) { return a + (b - a) * rng.next(o); }
  };

  // ---- 羈絆計算 ----
  function traitTiers(unitIds) {
    const uniq = [...new Set(unitIds)], counts = {}, active = {};
    uniq.forEach(id => { const U = D().units[id]; if (U) U.traits.forEach(t => counts[t] = (counts[t] || 0) + 1); });
    for (const k in D().traits) {
      let best = null; D().traits[k].tiers.forEach(t => { if ((counts[k] || 0) >= t.n) best = t; });
      active[k] = best;
    }
    return { counts, active };
  }

  function itemStats(items) {
    const s = { atkPct: 0, hpPct: 0, bounce: 0, launchPct: 0, lifesteal: 0, blastR: 0, blastMult: 0 };
    (items || []).forEach(it => { for (const k in it.rolls) { if (k === 'blastR' || k === 'blastMult') s[k] = Math.max(s[k], it.rolls[k]); else s[k] += it.rolls[k]; } });
    return s;
  }

  function makeBody(inst, team) {
    const cfg = C();
    if (inst.boss) {
      const B = D().enemies.boss, sc = 1 + B.stageScale * (inst.stage - 5);
      return { id: 'boss', name: B.name, boss: true, team, star: 1, traits: [], color: B.color, r: B.r, m: B.mass,
        hp: B.hp * sc, maxHp: B.hp * sc, atk: B.atk * sc, shield: 0, bounces: cfg.baseBounces, launchPct: 0, lifesteal: 0,
        blastR: 0, blastMult: 0, alive: true, x: 0, y: 0, vx: 0, vy: 0, wallHits: 0, stunned: false, chained: false };
    }
    const U = D().units[inst.id], m = cfg.starMult[inst.star - 1], it = itemStats(inst.items);
    const hp = U.hp * m * (1 + it.hpPct);
    const b = { id: inst.id, name: U.name, team, star: inst.star, traits: U.traits.slice(), color: U.color, r: U.r + (inst.star - 1) * 2, m: U.mass,
      hp, maxHp: hp, atk: U.atk * m * (1 + it.atkPct), shield: 0, bounces: cfg.baseBounces + it.bounce,
      launchPct: (U.launchPct || 0) + it.launchPct, lifesteal: it.lifesteal, blastR: it.blastR, blastMult: it.blastMult,
      pierce: !!U.pierce, link: U.link ? U.link.with : null, alive: true, x: 0, y: 0, vx: 0, vy: 0, wallHits: 0, stunned: false, chained: false };
    if (U.role === 'both' && U.front) {
      if (U.front.type === 'thorns') b.thorns = U.front.val;
      if (U.front.type === 'deathBlast') b.deathBlast = { r: U.front.r, mult: U.front.mult };
    }
    return b;
  }

  // 建一方隊伍：前台 bodies + 後台被動
  function buildSide(front, back, team) {
    const cfg = C();
    const bodies = front.filter(Boolean).map(u => makeBody(u, team));
    const backU = back.filter(Boolean);
    const tt = traitTiers(front.concat(back).filter(u => u && !u.boss).map(u => u.id));
    const side = { traits: tt.active, counts: tt.counts, turnHeal: 0, turnShield: 0, breakReflect: 0, backIds: backU.map(u => u.id) };
    backU.forEach(u => {
      const U = D().units[u.id]; if (!U || !U.back || U.role === 'front') return;
      const k = cfg.starMult[u.star - 1], v = U.back.val * (1 + 0.5 * (u.star - 1));
      if (U.back.type === 'atkPct') bodies.forEach(b => { if (!U.back.trait || b.traits.includes(U.back.trait)) b.atk *= 1 + v; });
      if (U.back.type === 'shield') side.turnShield += U.back.val * k;
      if (U.back.type === 'heal') side.turnHeal += U.back.val * k;
      if (U.back.type === 'bounce') bodies.forEach(b => b.bounces += U.back.val * u.star);
      if (U.back.type === 'launchPct') bodies.forEach(b => b.launchPct += v);
    });
    const w = side.traits.wall;
    if (w) { bodies.forEach(b => b.shield = b.maxHp * w.shieldPct); side.breakReflect = w.breakReflect || 0; }
    return { bodies, side };
  }

  function place(bodies, team, R) {
    const n = bodies.length, rows = n > 3 ? [bodies.slice(0, Math.ceil(n / 2)), bodies.slice(Math.ceil(n / 2))] : [bodies];
    rows.forEach((row, ri) => {
      const y = (0.42 + ri * 0.24) * R * (team === 0 ? 1 : -1);
      row.forEach((b, i) => { b.x = (i - (row.length - 1) / 2) * R * 0.36; b.y = y; if (b.boss) { b.x = 0; b.y = -0.4 * R; } });
    });
  }

  // opts: {pFront,pBack,eFront,eBack,rules,seed}
  function create(o) {
    const cfg = C(), R = cfg.arenaR;
    const p = buildSide(o.pFront, o.pBack, 0), e = buildSide(o.eFront, o.eBack, 1);
    place(p.bodies, 0, R);
    const boss = e.bodies.filter(b => b.boss), rest = e.bodies.filter(b => !b.boss);
    place(rest, 1, R); boss.forEach(b => { b.x = 0; b.y = -0.12 * R; });
    if (boss.length) rest.forEach((b, i) => { b.y = -0.6 * R - (i % 2) * 0.15 * R; });
    const bodies = p.bodies.concat(e.bodies);
    bodies.forEach((b, i) => b.i = i);
    const bt = { R, R0: R, rules: o.rules || [], bodies, sides: [p.side, e.side], turn: 0, shots: [cfg.turnsEach, cfg.turnsEach],
      phase: 'aim', winner: null, rng: { s: o.seed | 0 }, events: [], simT: 0, mover: -1, chain: 0, hits: 0, pending: [], comboUsed: {}, shotCount: 0 };
    startTurn(bt);
    return bt;
  }

  function startTurn(b) {
    const s = b.sides[b.turn];
    b.comboUsed = {};
    b.bodies.forEach(x => { x.chained = false; });
    b.bodies.forEach(x => {
      if (!x.alive || x.team !== b.turn) return;
      if (s.turnHeal) x.hp = Math.min(x.maxHp, x.hp + s.turnHeal);
      if (s.turnShield) x.shield += s.turnShield;
    });
    if (b.turn === 0 && b.shotCount > 0 && b.rules.includes('shrink')) { b.R = Math.max(170, b.R - 14); b.events.push({ t: 'shrink' }); }
    if (!canMove(b, b.turn)) { b.events.push({ t: 'skip', team: b.turn }); endShot(b); }
  }

  function canMove(b, team) { return b.bodies.some(x => x.alive && x.team === team && !x.stunned); }

  function launch(b, idx, angle, power) {
    const x = b.bodies[idx], cfg = C();
    if (!x || !x.alive || x.team !== b.turn || x.stunned || b.phase !== 'aim') return false;
    power = Math.max(0, Math.min(1, power));
    const sp = power * cfg.maxLaunch * (1 + x.launchPct);
    x.vx = Math.cos(angle) * sp; x.vy = Math.sin(angle) * sp;
    b.bodies.forEach(y => y.wallHits = 0);
    b.phase = 'moving'; b.mover = idx; b.simT = 0; b.chain = 0; b.hits = 0; b.pending = [];
    b.events.push({ t: 'launch', i: idx });
    return true;
  }

  // ---- 傷害 ----
  function dealDamage(b, tgt, amt, src, kind) {
    if (!tgt.alive || amt <= 0) return 0;
    if (tgt.shield > 0 && !(src && src.pierce && kind === 'hit')) {
      const f = kind === 'blast' ? 2 : 1, ab = Math.min(tgt.shield, amt / f);
      tgt.shield -= ab; amt -= ab * f;
      if (tgt.shield <= 0.01) {
        tgt.shield = 0; b.events.push({ t: 'shieldbreak', x: tgt.x, y: tgt.y });
        const br = b.sides[tgt.team].breakReflect;
        if (br && src && src.alive && kind !== 'reflect') dealDamage(b, src, br, tgt, 'reflect');
      }
    }
    if (amt <= 0) return 0;
    tgt.hp -= amt; tgt.hurt = 1;
    b.events.push({ t: 'dmg', x: tgt.x, y: tgt.y, amt, kind, team: tgt.team });
    if (kind === 'hit' && src) {
      if (src.lifesteal) src.hp = Math.min(src.maxHp, src.hp + amt * src.lifesteal);
      if (tgt.thorns && src.alive) dealDamage(b, src, amt * tgt.thorns, tgt, 'reflect');
    }
    if (tgt.hp <= 0) {
      tgt.hp = 0; tgt.alive = false; tgt.vx = tgt.vy = 0;
      b.events.push({ t: 'death', x: tgt.x, y: tgt.y, team: tgt.team, color: tgt.color });
      if (tgt.deathBlast) explode(b, tgt.x, tgt.y, tgt.deathBlast.r, tgt.atk * tgt.deathBlast.mult, tgt.team, tgt, false);
    }
    return amt;
  }

  function explode(b, x, y, r, dmg, team, src, chain) {
    const q = [{ x, y, r, dmg, d: 0 }];
    while (q.length) {
      const e = q.shift(); b.chain++;
      b.events.push({ t: 'boom', x: e.x, y: e.y, r: e.r, n: b.chain });
      b.bodies.forEach(o => {
        if (!o.alive || o.team === team) return;
        const dx = o.x - e.x, dy = o.y - e.y, d = Math.hypot(dx, dy) || 1;
        if (d > e.r + o.r) return;
        dealDamage(b, o, e.dmg, src, 'blast');
        const k = 260 / o.m; o.vx += dx / d * k; o.vy += dy / d * k;
        if (chain && !o.chained && e.d < 4) { o.chained = true; q.push({ x: o.x, y: o.y, r: e.r, dmg: e.dmg * 0.7, d: e.d + 1 }); }
      });
    }
  }

  function pull(b, cx, cy, r, force, team, except, stun, dmg, src) {
    b.events.push({ t: 'pull', x: cx, y: cy, r });
    b.bodies.forEach(o => {
      if (!o.alive || o.team === team || o === except) return;
      const dx = cx - o.x, dy = cy - o.y, d = Math.hypot(dx, dy) || 1;
      if (d > r || Math.hypot(o.vx, o.vy) > 300) return; // 怕高速
      const k = force / Math.sqrt(o.m); o.vx += dx / d * k; o.vy += dy / d * k;
      if (stun) o.stunned = true;
      if (dmg) dealDamage(b, o, dmg, src, 'magnet');
    });
  }

  function onHit(b, src, tgt, speed) {
    const cfg = C(), mult = 1 + cfg.wallBonusPer * Math.min(src.wallHits, src.bounces);
    dealDamage(b, tgt, src.atk * speed / cfg.dmgSpeedRef * mult, src, 'hit');
    b.hits++;
    const s = b.sides[src.team];
    const bt = s.traits.blast && src.traits.includes('blast') ? s.traits.blast : null;
    if (bt || src.blastR) {
      const r = Math.max(bt ? bt.r : 0, src.blastR), m = Math.max(bt ? bt.mult : 0, src.blastMult);
      explode(b, tgt.x, tgt.y, r, src.atk * m * mult, src.team, src, !!(bt && bt.chain));
    }
    const mt = s.traits.magnet;
    if (mt && src.traits.includes('magnet')) pull(b, tgt.x, tgt.y, mt.r, mt.pull, src.team, tgt, !!mt.stun, src.atk * (mt.dmg || 0), src);
  }

  function combo(b, a, c, x, y) {
    const key = Math.min(a.i, c.i) + '-' + Math.max(a.i, c.i);
    if (b.comboUsed[key]) return;
    const owner = a.link === c.id ? a : c, partner = owner === a ? c : a;
    const cb = D().units[owner.id].link.combo;
    b.comboUsed[key] = 1;
    b.events.push({ t: 'combo', x, y, name: cb.name });
    const team = a.team, atk = Math.max(a.atk, c.atk);
    if (cb.type === 'blast') explode(b, x, y, cb.r, atk * cb.mult, team, a, false);
    if (cb.type === 'shieldAll') b.bodies.forEach(o => { if (o.alive && o.team === team) o.shield += cb.amt * (a.star + c.star) / 2; });
    if (cb.type === 'healAll') b.bodies.forEach(o => { if (o.alive && o.team === team) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * cb.pct); });
    if (cb.type === 'pullBlast') { pull(b, x, y, cb.r, 520, team, null, false); b.pending.push({ at: b.simT + 0.35, x, y, r: 110, dmg: atk * cb.mult, team, src: a.i }); }
    if (cb.type === 'launch') {
      const slow = Math.hypot(a.vx, a.vy) < Math.hypot(c.vx, c.vy) ? a : c;
      let best = null, bd = 1e9;
      b.bodies.forEach(o => { if (o.alive && o.team !== team) { const d = Math.hypot(o.x - slow.x, o.y - slow.y); if (d < bd) { bd = d; best = o; } } });
      if (best) { const ang = Math.atan2(best.y - slow.y, best.x - slow.x); slow.vx = Math.cos(ang) * cb.speed; slow.vy = Math.sin(ang) * cb.speed; }
    }
  }

  // ---- 物理一步；回傳 true 代表全部停止 ----
  function step(b) {
    const cfg = C(), dt = cfg.dt, bs = b.bodies, n = bs.length;
    b.simT += dt;
    const fr = Math.exp(-cfg.friction * dt);
    for (const o of bs) {
      if (!o.alive) continue;
      o.x += o.vx * dt; o.y += o.vy * dt;
      let sp = Math.hypot(o.vx, o.vy);
      if (sp > 0) { const ns = Math.max(0, sp * fr - cfg.linDecel * dt); o.vx *= ns / sp; o.vy *= ns / sp; }
      // 牆
      const d = Math.hypot(o.x, o.y), lim = b.R - o.r;
      if (d > lim) {
        const nx = o.x / d, ny = o.y / d, vn = o.vx * nx + o.vy * ny;
        o.x = nx * lim; o.y = ny * lim;
        if (vn > 0) {
          o.vx -= (1 + cfg.wallRest) * vn * nx; o.vy -= (1 + cfg.wallRest) * vn * ny;
          if (vn > 80) {
            o.wallHits++; b.events.push({ t: 'wall', x: o.x, y: o.y });
            if (b.rules.includes('spikes') && o.team === 0) dealDamage(b, o, o.maxHp * 0.06, null, 'spike');
          }
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const a = bs[i]; if (!a.alive) continue;
      for (let j = i + 1; j < n; j++) {
        const c = bs[j]; if (!c.alive) continue;
        const dx = c.x - a.x, dy = c.y - a.y, rr = a.r + c.r, d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 0.001, nx = dx / d, ny = dy / d, ia = 1 / a.m, ic = 1 / c.m, ov = rr - d;
        a.x -= nx * ov * ia / (ia + ic); a.y -= ny * ov * ia / (ia + ic);
        c.x += nx * ov * ic / (ia + ic); c.y += ny * ov * ic / (ia + ic);
        const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        if (rv >= 0) continue;
        const sa = a.vx * nx + a.vy * ny, sc = -(c.vx * nx + c.vy * ny);
        const jm = -(1 + cfg.restitution) * rv / (ia + ic);
        a.vx -= jm * ia * nx; a.vy -= jm * ia * ny; c.vx += jm * ic * nx; c.vy += jm * ic * ny;
        const px = a.x + nx * a.r, py = a.y + ny * a.r;
        b.events.push({ t: 'bump', x: px, y: py, s: Math.max(sa, sc) });
        if (a.team !== c.team) {
          if (sa > cfg.minHitSpeed) onHit(b, a, c, sa);
          if (sc > cfg.minHitSpeed && c.alive && a.alive) onHit(b, c, a, sc);
        } else if ((a.link && a.link === c.id) || (c.link && c.link === a.id)) {
          if (Math.max(Math.abs(sa), Math.abs(sc)) > 150) combo(b, a, c, px, py);
        }
      }
    }
    for (let k = b.pending.length - 1; k >= 0; k--) {
      const p = b.pending[k];
      if (b.simT >= p.at) { b.pending.splice(k, 1); explode(b, p.x, p.y, p.r, p.dmg, p.team, bs[p.src], false); }
    }
    const moving = bs.some(o => o.alive && (Math.abs(o.vx) > cfg.stopV || Math.abs(o.vy) > cfg.stopV));
    if (!moving || b.simT > cfg.maxSimSec) { bs.forEach(o => { o.vx = o.vy = 0; }); return b.pending.length === 0 || b.simT > cfg.maxSimSec; }
    return false;
  }

  function alive(b, team) { return b.bodies.filter(o => o.alive && o.team === team); }
  function hpSum(b, team) { return alive(b, team).reduce((s, o) => s + o.hp, 0); }

  function endShot(b) {
    const t = b.turn;
    b.shotCount++;
    b.shots[t] = Math.max(0, b.shots[t] - 1);
    b.bodies.forEach(o => { if (o.team === t) o.stunned = false; o.wallHits = 0; });
    b.phase = 'aim'; b.mover = -1;
    const p = alive(b, 0).length, e = alive(b, 1).length;
    if (!p || !e) return finish(b, p ? 0 : 1);
    if (!b.shots[0] && !b.shots[1]) return finish(b, hpSum(b, 0) > hpSum(b, 1) ? 0 : 1);
    b.turn = b.shots[1 - t] ? 1 - t : t;
    startTurn(b);
  }

  function finish(b, w) { b.phase = 'over'; b.winner = w; b.events.push({ t: 'over', winner: w }); }

  // 把整發跑完（AI 預演、模擬器用）
  function runShot(b) { let k = 0; while (!step(b) && k++ < 2000); }

  FA.battle = { create, launch, step, endShot, runShot, startTurn, alive, hpSum, traitTiers, dealDamage, canMove };
})(globalThis);
