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

  const MAXK = ['blastR', 'blastMult'];
  function addMods(acc, mods, k = 1) { for (const key in mods || {}) { if (MAXK.includes(key)) acc[key] = Math.max(acc[key] || 0, mods[key]); else acc[key] = (acc[key] || 0) + mods[key] * k; } return acc; }

  // ---- 羈絆計算 ----
  function traitTiers(unitIds, emb) { // emb：徽章 {unitId:[trait]}（可省略）
    const uniq = [...new Set(unitIds)], counts = {}, active = {};
    uniq.forEach(id => { const U = D().units[id]; if (U) U.traits.concat(emblemExtra(id, emb, U)).forEach(t => counts[t] = (counts[t] || 0) + 1); });
    for (const k in D().traits) {
      let best = null; D().traits[k].tiers.forEach(t => { if ((counts[k] || 0) >= t.n) best = t; });
      active[k] = best;
    }
    return { counts, active };
  }

  // 所有欄位先列齊（固定順序），讓每個棋子物件形狀一致，物理迴圈才快
  function blankBody(team) {
    return { i: 0, id: '', name: '', team, alive: true, temp: false, boss: false, star: 1, traits: [], color: '', x: 0, y: 0, vx: 0, vy: 0, r: 20, m: 1,
      hp: 1, maxHp: 1, atk: 0, baseAtk: 0, shield: 0, speed: 1, bounces: 0, wallAdd: 0, wallHits: 0, stunned: false, acted: false, chained: false, hitCount: 0, hurt: 0,
      lifesteal: 0, blastR: 0, blastMult: 0, blastMul: 0, pullMul: 0, poisonMul: 0, zapMult: 0, link: null, weapon: null, ab: null, split: null, poison: null,
      pierceLeft: 0, boomUsed: false, burnUsed: false, splitDone: false, healed: false, relaunched: false, fricMul: 1, exposed: 0, exposeAmp: 0, fx: {},
      down: false, sx: 0, sy: 0, ringBuff: 0, energy: 0, ultType: '', ultOn: '', ultUsed: 0, ultStop: 0, ultMassMul: 1,
      farDmg: 0, dodge: 0, trav: 0, ox: 0, oy: 0, homed: false, tether: -1, fear: 0, veil: 0, decoyUsed: false,
      baseItem: null, itemMuted: false, hitCos: 1, preSp: 0, hitShot: false, sweet: 0, cueNext: 0, caromBy: -1, caromDmg: 0, stacks: 0, tapUsed: false, skillDmg: 0, skillEn: 0 }; // ---- 神技 ----
  }

  function makeBody(inst, team, sideMods, traitsActive, env) {
    const cfg = C(), rm = env.radiusMul || 1;
    const base = blankBody(team);
    if (inst.boss) {
      const B = D().enemies.bosses[inst.plane - 1][inst.variant || 0], sc = 1 + (inst.threat || 0), HM = cfg.hpMul || 1;
      return Object.assign(base, { id: 'boss', name: B.name, boss: true, star: 1, traits: [], color: B.color, r: B.r * rm, m: B.mass,
        hp: B.hp * sc * HM, maxHp: B.hp * sc * HM, atk: B.atk * sc, baseAtk: B.atk * sc, bounces: cfg.baseBounces, speed: 0.9,
        ultType: 'nova', zapMult: B.zap || 0, ab: B.ability ? Object.assign({}, B.ability) : null, split: B.split ? Object.assign({}, B.split) : null });
    }
    const U = D().units[inst.id], star = inst.star - 1;
    const hpMult = cfg.starMult[star], atkMult = (cfg.starAtk || cfg.starMult)[star];
    const mods = addMods({}, sideMods);
    (inst.items || []).forEach(it => addMods(mods, it.rolls));
    if (inst.weapon) addMods(mods, D().weapons[inst.weapon].mods);
    unitTraits(inst).forEach(t => { if (traitsActive[t]) addMods(mods, traitsActive[t].mods); });
    const hp = U.hp * hpMult * (1 + (mods.hpPct || 0)) * (cfg.hpMul || 1), atk = U.atk * atkMult * (1 + (mods.atkPct || 0));
    const b = Object.assign(base, { id: inst.id, name: U.name, star: inst.star, traits: unitTraits(inst), color: U.color,
      r: (U.r + (inst.star - 1) * 2) * rm, m: Math.max(0.3, U.mass * (1 + (mods.massPct || 0))), hp, maxHp: hp, atk, baseAtk: atk,
      speed: U.speed * (1 + (mods.speedPct || 0)), bounces: cfg.baseBounces + (mods.bounces || 0), wallAdd: mods.wallAdd || 0,
      farDmg: mods.farDmg || 0, skillDmg: mods.skillDmg || 0, skillEn: mods.skillEn || 0, dodge: Math.min(cfg.dodgeCap || 0.5, mods.dodge || 0),
      lifesteal: mods.lifesteal || 0, blastR: mods.blastR || 0, blastMult: mods.blastMult || 0, blastMul: mods.blastMul || 0, pullMul: mods.pullMul || 0, poisonMul: mods.poisonMul || 0,
      link: U.link ? U.link.with : null, weapon: inst.weapon || null, ultType: U.ult || (D().traitUlt || {})[U.traits[0]] || 'nova' });
    b.shield = hp * (mods.shieldPct || 0);
    if (inst.weapon) b.fx = Object.assign({}, D().weapons[inst.weapon].fx);
    if (b.fx.glide) b.fricMul *= b.fx.glide;
    if (U.ability && U.role !== 'back') {
      b.ab = Object.assign({}, U.ability); delete b.ab.desc;
      if (b.ab.type === 'bigBounce') { b.wallAdd += b.ab.per; b.bounces += b.ab.extra; }
      if (b.ab.type === 'pierce') b.pierceLeft = b.ab.n;
      if (b.ab.type === 'vamp') b.lifesteal += b.ab.val;
      if (b.ab.type === 'glide') b.fricMul *= b.ab.mul;
      if (b.ab.type === 'trickShot') b.bounces += b.ab.extra || 0;
    }
    const item = (inst.items || []).find(it => (D().items[it.id] || {}).tier === 'base');
    if (item) {
      const rolls = item.rolls || {}, scale = key => 1 - (rolls[key] || 0) / (1 + (mods[key] || 0));
      b.baseItem = { id: item.id, atk: scale('atkPct'), hp: scale('hpPct'), speed: scale('speedPct'),
        bounces: rolls.bounces || 0, wallAdd: rolls.wallAdd || 0, lifesteal: rolls.lifesteal || 0 };
    }
    return b;
  }

  // 建一方：前台 bodies + 後台被動 + 策略
  // ext: {mods, shots, chainAll, echo, blastGold, threat, extraEnemy}
  function buildSide(front, back, team, ext, env) {
    const cfg = C();
    const all = front.concat(back).filter(u => u && !u.boss);
    const tt = traitTiers(all.map(u => u.id), emblemMap(all));
    const sideMods = addMods({}, ext.mods);
    if (ext.threat) { sideMods.hpPct = (sideMods.hpPct || 0) + ext.threat; sideMods.atkPct = (sideMods.atkPct || 0) + ext.threat; }
    if (team === 1 && env.enemyHp) sideMods.hpPct = (sideMods.hpPct || 0) + env.enemyHp;
    const bodies = front.filter(Boolean).map(u => makeBody(u.boss ? Object.assign({}, u, { threat: ext.threat }) : u, team, sideMods, tt.active, env));
    const side = { traits: tt.active, counts: tt.counts, turnHeal: 0, turnShield: 0, zap: 0, gravity: 0,
      shotsAdd: ext.shots || 0, chainAll: !!ext.chainAll, echo: ext.echo || null, blastGold: ext.blastGold || 0,
      cannon: [], dmgTaken: ext.dmgTaken || 0, lowStarDmg: ext.lowStarDmg || 0, mark: 0, markAmp: 0, revive: ext.revive || 0, revivePct: 0.4, openFreeze: ext.openFreeze || 0, stormZap: ext.stormZap || 0, stormDmg: 0, snipe: [], veil: 0, veilTick: 0 };
    bodies.forEach(b => { if (b.zapMult) side.zap += b.atk * b.zapMult; });
    if (bodies.length) side.stormDmg = bodies.reduce((s, b) => s + b.atk, 0) / bodies.length * 0.8;
    bondSide(side, all, tt);
    back.filter(Boolean).forEach(u => {
      const U = D().units[u.id]; if (!U || !U.back || U.role === 'front') return;
      const star = u.star - 1, bk = U.back;
      const hpMult = cfg.starMult[star], atkMult = (cfg.starAtk || cfg.starMult)[star];
      if (bk.type === 'atkPct') { const v = bk.val * (1 + 0.5 * (u.star - 1)); bodies.forEach(b => { if (!bk.trait || b.traits.includes(bk.trait)) { b.atk *= 1 + v; b.baseAtk = b.atk; } }); }
      if (bk.type === 'shield') side.turnShield += bk.val * hpMult;
      if (bk.type === 'heal') side.turnHeal += bk.val * hpMult;
      if (bk.type === 'zap') side.zap += U.atk * atkMult * bk.mult;
      if (bk.type === 'gravity') side.gravity += bk.pull * (1 + 0.3 * (u.star - 1));
      if (bk.type === 'cannon') side.cannon.push({ dmg: U.atk * atkMult * bk.mult, r: bk.r });
      if (bk.type === 'mark') { side.mark = Math.max(side.mark, bk.turns); side.markAmp = Math.max(side.markAmp, bk.amp + 0.05 * (u.star - 1)); }
      if (bk.type === 'relayReserve') side.relayReserve = Math.max(side.relayReserve || 0, bk.amount);
      if (bk.type === 'snipe') side.snipe.push(U.atk * atkMult * bk.mult);
      if (bk.type === 'veil') side.veil += bk.n + (u.star >= 3 ? 1 : 0);
      if (bk.type === 'revive') { side.revive += 1; side.revivePct = Math.max(side.revivePct, bk.pct + 0.1 * (u.star - 1)); }
    });
    return { bodies, side };
  }

  // 直式長方形場地：hw/hh 為半寬/半高
  function place(bodies, team, hw, hh) {
    const n = bodies.length, rows = n > 3 ? [bodies.slice(0, Math.ceil(n / 2)), bodies.slice(Math.ceil(n / 2))] : [bodies];
    rows.forEach((row, ri) => {
      const y = (0.5 + ri * 0.24) * hh * (team === 0 ? 1 : -1);
      row.forEach((b, i) => { b.x = (i - (row.length - 1) / 2) * hw * 0.5; b.y = y; });
    });
  }

  // o: {pFront,pBack,eFront,eBack,rules,seed,env:{...fx}, pExt, eExt}
  function create(o) {
    const cfg = C(), env = o.env || {}, am = env.arenaMul || 1, A = cfg.arena, hw = A.w / 2 * am, hh = A.h / 2 * am, R = hw;
    const p = buildSide(o.pFront, o.pBack, 0, o.pExt || {}, env), e = buildSide(o.eFront, o.eBack, 1, o.eExt || {}, env);
    place(p.bodies, 0, hw, hh);
    const boss = e.bodies.filter(b => b.boss), rest = e.bodies.filter(b => !b.boss);
    place(rest, 1, hw, hh); boss.forEach(b => { b.x = 0; b.y = -0.42 * hh; });
    if (boss.length) rest.forEach((b, i) => { b.x = (i - (rest.length - 1) / 2) * hw * 0.42; b.y = -0.75 * hh; });
    const bodies = p.bodies.concat(e.bodies);
    bodies.forEach((b, i) => { b.i = i; b.sx = b.x; b.sy = b.y; });
    if (o.eNoShots) { e.side.noAct = true; e.side.noRevive = true; }
    const M = cfg.movesEach + (o.extraMoves || 0);
    const rs = { s: (o.seed | 0) ^ 0x5bd1e995 }, lay = cfg.pillarLayouts[rng.int(rs, cfg.pillarLayouts.length)];
    const pillars = lay.map(([x, y, r, kind]) => ({ x: x * hw, y: y * hh, r: r * hw, kind }));
    const U0 = cfg.ult && cfg.ult.start || 0; if (U0) bodies.forEach(b => { if (!b.temp) b.energy = U0; }); // 大招開場能量
    const bt = { R, R0: R, hw, hh, hw0: hw, hh0: hh, pillars, rules: o.rules || [], env, bodies, sides: [p.side, e.side], first: o.first != null ? o.first : (e.side.noAct ? 0 : rng.int({ s: (o.seed | 0) ^ 0x2545f491 }, 2)), turn: 0, shots: [0, 0], round: 1, maxRounds: 999, bonus: [0, 0],
      moves: [M + p.side.shotsAdd * 2, e.side.noAct ? 0 : M + e.side.shotsAdd * 2], movesMax: [0, 0], deaths: [0, 0],
      phase: 'aim', winner: null, rng: { s: o.seed | 0 }, events: [], simT: 0, mover: -1, chain: 0, hits: 0, pending: [], comboUsed: {},
      shotCount: 0, zones: [], ghost: {}, echoUsed: false, gold: 0, stopDone: false, stepN: 0, tapQ: null, tapLog: null, teamHit: false, goldBoth: !!o.goldBoth };
    bt.movesMax = bt.moves.slice();
    if (o.eExt && o.eExt.affix) affixSetup(bt, o); // ---- 敵人詞綴 ----
    relax(bt);
    if (bt.rules.includes('swamp')) [[-0.55, 0.15], [0.55, 0.15], [0, -0.02]].forEach(([x, y]) => bt.zones.push({ kind: 'pool', x: x * hw, y: y * hh, r: 50, dmg: 0, team: 1, left: 999, hit: {}, pDmg: 18, turns: 2 }));
    [0, 1].forEach(t => { for (let k = 0; k < bt.sides[t].openFreeze; k++) { const f = alive(bt, 1 - t); if (f.length) { const x = rng.pick(bt.rng, f); x.stunned = true; bt.events.push({ t: 'freeze', x: x.x, y: x.y }); } } });
    bondCreate(bt);
    bt.turn = bt.first; bt.events.push({ t: 'round', n: 1, team: bt.first, start: true }); startTurn(bt);
    return bt;
  }

  // 位移後把重疊推開、拉回場內（不產生速度）
  function relax(b) {
    for (let it = 0; it < 6; it++) {
      const bs = b.bodies.filter(o => o.alive);
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], c = bs[j], dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 0.01, ov = a.r + c.r - d;
        if (ov > 0) { a.x -= dx / d * ov / 2; a.y -= dy / d * ov / 2; c.x += dx / d * ov / 2; c.y += dy / d * ov / 2; }
      }
      bs.forEach(o => {
        o.x = Math.max(-b.hw + o.r, Math.min(b.hw - o.r, o.x)); o.y = Math.max(-b.hh + o.r, Math.min(b.hh - o.r, o.y));
        (b.pillars || []).forEach(p => { const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy) || 0.01, rr = p.r + o.r; if (d < rr) { o.x = p.x + dx / d * rr; o.y = p.y + dy / d * rr; } });
      });
    }
  }

  function shift(b, team, cx, cy, amt) { // 瞬間把某隊（null=全部）往一點拉
    b.bodies.forEach(o => { if (!o.alive || (team != null && o.team !== team)) return; const dx = cx - o.x, dy = cy - o.y, d = Math.hypot(dx, dy) || 1, s = Math.min(d * 0.6, amt); o.x += dx / d * s; o.y += dy / d * s; });
    relax(b);
  }

  function startTurn(b) {
    const s = b.sides[b.turn], foe = 1 - b.turn;
    b.comboUsed = {};
    b.bodies.forEach(x => { x.chained = false; });
    b.bodies.forEach(x => {
      if (!x.alive || x.team !== b.turn) return;
      if (s.turnHeal) x.hp = Math.min(x.maxHp, x.hp + s.turnHeal);
      if (s.turnShield) x.shield += s.turnShield;
      if (x.exposed > 0) x.exposed--;
    });
    if (s.mark) { const f = alive(b, foe); if (f.length) expose(b, rng.pick(b.rng, f), s.mark, s.markAmp); }
    if (s.zap) {
      const foes = alive(b, foe);
      if (foes.length) { const t = rng.pick(b.rng, foes); b.events.push({ t: 'zap', x: t.x, y: t.y }); dealDamage(b, t, s.zap, null, 'zap'); }
    }
    b.bodies.forEach(x => {
      if (!x.alive || x.team !== b.turn) return;
      if (x.poison && x.poison.turns > 0) { const pz = x.poison; pz.turns--; if (!pz.turns) x.poison = null; dealDamage(b, x, pz.dmg, null, 'poison'); }
      if (b.env.fog && x.alive) dealDamage(b, x, x.maxHp * b.env.fog, null, 'poison');
    });
    s.cannon.forEach(cn => { const f = alive(b, foe); if (f.length) { const t = rng.pick(b.rng, f); explode(b, t.x, t.y, cn.r, cn.dmg, b.turn, null, false); } });
    s.snipe.forEach(dmg => { const f = alive(b, foe); if (!f.length) return; const t = f.reduce((m, o) => (o.hp + o.shield < m.hp + m.shield ? o : m)); b.events.push({ t: 'snipe', x: t.x, y: t.y, team: b.turn }); dealDamage(b, t, dmg, null, 'snipe'); });
    if (s.veil) s.veilTick++;
    for (let k = 0; s.veilTick % 2 === 1 && k < s.veil; k++) { const f = alive(b, b.turn).filter(o => !o.veil); if (!f.length) break; const x = rng.pick(b.rng, f); x.veil = 1; b.events.push({ t: 'veil', x: x.x, y: x.y }); }
    for (let k = 0; k < s.stormZap; k++) { const f = alive(b, foe); if (f.length) { const t = rng.pick(b.rng, f); b.events.push({ t: 'zap', x: t.x, y: t.y }); dealDamage(b, t, s.stormDmg, null, 'zap'); } }
    if (s.gravity) { b.events.push({ t: 'pull', x: 0, y: 0, r: b.R }); shift(b, foe, 0, 0, s.gravity * 0.15); }
    if (b.env.storm) { const a = rng.range(b.rng, 0, 6.283), rr = rng.range(b.rng, 0, 0.5), x = Math.cos(a) * rr * b.hw, y = Math.sin(a) * rr * b.hh; b.events.push({ t: 'pull', x, y, r: b.R * 0.8 }); shift(b, null, x, y, b.env.storm * 0.1); }
    if (b.turn === 0 && b.shotCount > 0 && b.rules.includes('shrink')) {
      const hw = b.hw, hh = b.hh;
      b.hw = Math.max(b.hw0 * 0.65, b.hw - 10); b.hh = Math.max(b.hh0 * 0.65, b.hh - 14); b.R = b.hw;
      const ramp = b.zones.find(z => z.kind === 'ramp');
      if (ramp) {
        if (ramp.edge === 'x') ramp.x += Math.sign(ramp.x) * (b.hw - hw);
        else ramp.y += Math.sign(ramp.y) * (b.hh - hh);
      }
      relax(b); b.events.push({ t: 'shrink' });
    }
    if (b.affix) affixTurn(b); // ---- 敵人詞綴 ----
    if (b.bodies.some(o => o.down)) { reviveDowned(b); if (checkEnd(b)) return; } // 回合開始的毒／電擊／炮擊打倒：當下扣動數並復活，避免卡住
    if (!alive(b, foe).length || !alive(b, b.turn).length) return checkEnd(b);
    refreshShots(b);
    if (!canMove(b, b.turn)) return nextTurn(b, b.turn);
  }

  // ---- 輪流行動：一輪內每隻都動一次才換下一輪；輪數用完後才用加時（bonus）發數 ----
  function avail(b, team) {
    if (b.sides[team].noAct || (b.moves && b.moves[team] <= 0)) return [];
    const extra = b.round > b.maxRounds;
    if (extra && !(b.bonus[team] > 0)) return [];
    return b.bodies.filter(x => x.alive && !x.temp && x.team === team && !x.stunned && (extra || !x.acted));
  }
  function refreshShots(b) { b.shots = [0, 1].map(t => Math.max(0, b.moves[t])); }
  function endRound(b) {
    b.bodies.forEach(o => { if (o.stunned && !o.acted) o.stunned = false; o.acted = false; });
    b.round++;
    b.events.push({ t: 'round', n: b.round, extra: b.round > b.maxRounds, team: b.first || 0 });
  }
  function nextTurn(b, last) {
    for (let g = 0; g < 4; g++) {
      const f = b.first || 0; // 每場隨機先手（create 時依種子決定），每輪都由先手方先動
      const order = last == null ? [f, 1 - f] : [1 - last, last];
      const t = order.find(k => avail(b, k).length);
      if (t != null) { b.turn = t; return startTurn(b); }
      if (b.round <= b.maxRounds) { endRound(b); last = null; continue; }
      refreshShots(b); return finish(b, 1); // 輪數與加時都用完還沒殺光
    }
    finish(b, 1);
  }
  function canMove(b, team) { return avail(b, team).length > 0; }

  function launch(b, idx, angle, power, ult, tap) {
    const x = b.bodies[idx], cfg = C();
    if (!x || !x.alive || x.temp || x.team !== b.turn || b.phase !== 'aim' || !avail(b, b.turn).includes(x)) return false;
    power = Math.max(0, Math.min(1, power));
    const raw = power, sweet = x.ab && x.ab.type === 'sweetSpot' && raw >= x.ab.lo - 1e-9 && raw <= x.ab.hi + 1e-9; // 甜蜜點看玩家拉的力道（恐懼前）
    if (b.affix) power = affixLaunch(b, x, power); // ---- 敵人詞綴 ----
    if (x.fear) { power *= 1 - x.fear; x.fear = 0; b.events.push({ t: 'fear', x: x.x, y: x.y, used: true }); } // 恐懼：這一發力道打折
    const full = power >= cfg.fullPowerAt;
    const sp = power * cfg.maxLaunch * x.speed * (full ? 1 + cfg.fullPowerBonus : 1);
    if (full) b.events.push({ t: 'fullpower', x: x.x, y: x.y });
    const U = cfg.ult;
    x.ultOn = ''; x.ultUsed = 0; x.ultStop = 0;
    let spd = sp;
    if (ult && x.energy >= U.max) { x.energy = 0; x.ultOn = x.ultType; b.events.push({ t: 'ult', x: x.x, y: x.y, name: ((D().ults || {})[x.ultType] || {}).name || '大招', team: x.team }); spd *= ultLaunch(b, x); }
    else x.energy = Math.min(U.max, x.energy + U.gainLaunch);
    if (sweet) { spd *= x.ab.speed; b.events.push({ t: 'sweet', x: x.x, y: x.y }); }
    x.vx = Math.cos(angle) * spd; x.vy = Math.sin(angle) * spd;
    b.bodies.forEach(y => { y.ringBuff = 0; y.wallHits = 0; y.boomUsed = false; y.burnUsed = false; y.splitDone = false; y.healed = false; y.relaunched = false; y.trav = 0; y.homed = false; y.tether = -1; y.hitShot = false; y.caromBy = -1; y.cueNext = 0; y.tapUsed = false; y.sweet = 0; if (y.ab && y.ab.type === 'pierce') y.pierceLeft = y.ab.n; });
    x.sweet = sweet ? 1 : 0;
    b.stepN = 0; b.tapLog = null; b.teamHit = false; b.tapQ = tapAbility(x) ? cleanTap(tap) : null; // 二次操作：預先排好的點擊（重播／連線／AI）
    x.ox = x.x; x.oy = x.y;
    b.zones.forEach(z => z.hit = {});
    b.relayGiven = false; b.itemTaken = false;
    b.ropePush = b.zones.some(z => z.kind === 'rope' && z.team !== x.team) ? {} : null;
    if (x.ab && x.ab.type === 'ropeDrop') b.ropeAngle = angle;
    b.phase = 'moving'; b.mover = idx; b.simT = 0; b.chain = 0; b.hits = 0; b.pending = []; b.ghost = {}; b.echoUsed = false; b.stopDone = false;
    b.events.push({ t: 'launch', i: idx });
    bondLaunch(b, x);
    return true;
  }

  function transferEnergy(b, from, to, cap) {
    const amount = Math.min(cap, from.energy, C().ult.max - to.energy);
    if (amount <= 0) return;
    from.energy -= amount;
    to.energy += amount;
    b.events.push({ t: 'relayEnergy', x: to.x, y: to.y, amount });
  }

  function reserveEnergy(b, downed) {
    const side = b.sides[downed.team];
    if (!side.relayReserve || downed.boss) return;
    const cap = side.relayReserve;
    side.relayReserve = 0;
    let recipient = null;
    for (const o of b.bodies) {
      if (o === downed || !o.alive || o.temp || o.boss || o.team !== downed.team || o.energy >= C().ult.max) continue;
      if (!recipient || o.energy > recipient.energy) recipient = o;
    }
    if (recipient) transferEnergy(b, downed, recipient, cap);
  }

  function applyItemStats(o, enabled) {
    const item = o.baseItem, sign = enabled ? 1 : -1;
    const ratio = scale => enabled ? 1 / scale : scale;
    o.atk *= ratio(item.atk); o.baseAtk *= ratio(item.atk);
    o.speed *= ratio(item.speed);
    const maxHp = o.maxHp * ratio(item.hp);
    o.hp = Math.min(maxHp, o.hp * ratio(item.hp)); o.maxHp = maxHp;
    o.bounces += sign * item.bounces; o.wallAdd += sign * item.wallAdd; o.lifesteal += sign * item.lifesteal;
  }

  function confiscate(b, src, tgt) {
    if (!src.ab || src.ab.type !== 'confiscate' || src !== b.bodies[b.mover] || b.itemTaken || !tgt.baseItem) return;
    b.itemTaken = true;
    if (!tgt.itemMuted) applyItemStats(tgt, false);
    tgt.itemMuted = true;
    b.events.push({ t: 'confiscate', x: tgt.x, y: tgt.y, item: tgt.baseItem.id });
  }

  // ---- 傷害 ----
  function dealDamage(b, tgt, amt, src, kind) {
    if (!tgt.alive || tgt.temp || amt <= 0) return 0;
    { const ts = b.sides[tgt.team]; if (ts.dmgTaken) amt *= 1 + ts.dmgTaken; if (kind === 'hit' && src && !src.temp && src.star > tgt.star && b.sides[src.team].lowStarDmg) amt *= 1 + b.sides[src.team].lowStarDmg; } // ---- 經濟擴充：擴張的代價／星級壓制 ----
    amt *= bondDmgMul(b, tgt, src, kind);
    if (kind === 'hit' && tgt.ab && tgt.ab.type === 'guard') amt *= 1 - tgt.ab.red;
    if (b.affix && kind === 'hit') amt = affixDmgMul(b, tgt, amt, src); // ---- 敵人詞綴 ----
    if (tgt.exposed > 0) amt *= 1 + tgt.exposeAmp;
    const pierceShield = src && kind === 'hit' && ((src.fx && src.fx.shieldPierce) || (src.ab && src.ab.type === 'armorBreak'));
    if (tgt.shield > 0 && !pierceShield) {
      const f = kind === 'blast' ? 1.5 : 1, ab = Math.min(tgt.shield, amt / f);
      tgt.shield -= ab; amt -= ab * f;
      if (tgt.shield <= 0.01) { tgt.shield = 0; b.events.push({ t: 'shieldbreak', x: tgt.x, y: tgt.y }); }
    }
    if (amt <= 0) return 0;
    tgt.hp -= amt; tgt.hurt = 1;
    if (b.affix) affixOnDamage(b, tgt, amt, src, kind); // ---- 敵人詞綴 ----
    b.events.push({ t: 'dmg', x: tgt.x, y: tgt.y, amt, kind, team: tgt.team });
    if (kind === 'hit' && src) {
      if (src.lifesteal && !src.temp) src.hp = Math.min(src.maxHp, src.hp + amt * src.lifesteal);
      if (tgt.ab && tgt.ab.type === 'thorns' && src.alive) dealDamage(b, src, amt * tgt.ab.val, tgt, 'reflect');
    }
    if (tgt.split && !tgt.split.done && tgt.hp > 0 && tgt.hp < tgt.maxHp * tgt.split.at) {
      tgt.split.done = true; tgt.r *= 0.78; tgt.m *= 0.6;
      const c = JSON.parse(JSON.stringify(tgt)); c.i = b.bodies.length; c.x += tgt.r * 1.2; c.y -= tgt.r * 0.4; c.vx = -tgt.vx; c.vy = tgt.vy + 200; c.name += '分身'; c.boss = false; c.split = null;
      b.bodies.push(c); b.events.push({ t: 'bossSplit', x: tgt.x, y: tgt.y });
    }
    if (tgt.hp <= 0 && tgt.ab && tgt.ab.type === 'decoy' && !tgt.decoyUsed && !tgt.temp) { tgt.decoyUsed = true; tgt.hp = tgt.maxHp * tgt.ab.keep; tgt.poison = null; b.events.push({ t: 'decoy', x: tgt.x, y: tgt.y }); } // 替身：每場一次
    const sd = b.sides[tgt.team];
    if (tgt.hp <= 0 && sd.revive > 0 && !tgt.boss) { sd.revive--; tgt.hp = tgt.maxHp * sd.revivePct; tgt.poison = null; b.events.push({ t: 'revive', x: tgt.x, y: tgt.y }); }
    if (tgt.hp <= 0) {
      tgt.hp = 0; tgt.alive = false; tgt.vx = tgt.vy = 0;
      if (!tgt.temp) { b.deaths[tgt.team]++; if (!b.sides[tgt.team].noRevive) tgt.down = true; }
      if (!tgt.temp) reserveEnergy(b, tgt);
      b.events.push({ t: 'death', x: tgt.x, y: tgt.y, team: tgt.team, color: tgt.color });
    }
    if (tgt.pigQ != null) pigDamaged(b, tgt);
    return amt;
  }

  function explode(b, x, y, r, dmg, team, src, chain) {
    const sd = b.sides[team];
    if (sd.chainAll) chain = true;
    if (src && src.blastMul) dmg *= 1 + src.blastMul;
    lotDraw(b, team, 'boom', x, y);
    if (sd.blastGold) { const G = b.goldT || (b.goldT = [0, 0]); if (G[team] < sd.blastGold) { G[team]++; if (team === 0) b.gold++; } } // goldT：各方自己打出的金幣（連線自走棋雙方都算）
    const q = [{ x, y, r, dmg, d: 0 }];
    while (q.length) {
      const e = q.shift(); b.chain++;
      b.events.push({ t: 'boom', x: e.x, y: e.y, r: e.r, n: b.chain });
      b.bodies.forEach(o => {
        if (!o.alive || o.team === team || o.temp) return;
        const dx = o.x - e.x, dy = o.y - e.y, d = Math.hypot(dx, dy) || 1;
        if (d > e.r + o.r) return;
        dealDamage(b, o, e.dmg, src, 'blast');
        const k = 260 / o.m; o.vx += dx / d * k; o.vy += dy / d * k;
        if (chain && !o.chained && e.d < 4) { o.chained = true; q.push({ x: o.x, y: o.y, r: e.r, dmg: e.dmg * 0.7, d: e.d + 1 }); }
      });
    }
  }

  function pull(b, cx, cy, r, force, team, except, dmg, src) {
    b.events.push({ t: 'pull', x: cx, y: cy, r });
    lotDraw(b, team, 'pull', cx, cy);
    b.bodies.forEach(o => {
      if (!o.alive || o.team === team || o === except || o.temp) return;
      const dx = cx - o.x, dy = cy - o.y, d = Math.hypot(dx, dy) || 1;
      if (d > r || Math.hypot(o.vx, o.vy) > 350) return;
      if (b.ropePush) delete b.ropePush[o.i];
      const k = force / Math.sqrt(o.m); o.vx += dx / d * k; o.vy += dy / d * k;
      if (dmg) dealDamage(b, o, dmg, src, 'magnet');
    });
  }

  function poison(b, tgt, dmg, turns) {
    if (!tgt.poison || tgt.poison.dmg < dmg) tgt.poison = { dmg, turns }; else tgt.poison.turns = Math.max(tgt.poison.turns, turns);
    b.events.push({ t: 'poison', x: tgt.x, y: tgt.y });
  }
  // 破甲：受到的傷害 +amp，持續 turns 個（被破甲方的）回合
  function expose(b, tgt, turns, amp) {
    if (!tgt.alive || tgt.temp) return;
    tgt.exposeAmp = Math.max(tgt.exposed > 0 ? tgt.exposeAmp : 0, amp); tgt.exposed = Math.max(tgt.exposed, turns);
    b.events.push({ t: 'expose', x: tgt.x, y: tgt.y });
  }
  function bolt(b, from, n, dmg, r, src) {
    const cand = b.bodies.filter(o => o.alive && !o.temp && o.team === from.team && o !== from).map(o => [o, Math.hypot(o.x - from.x, o.y - from.y)]).filter(a => a[1] < r).sort((a, c) => a[1] - c[1]).slice(0, n);
    cand.forEach(([o]) => { b.events.push({ t: 'bolt', x1: from.x, y1: from.y, x2: o.x, y2: o.y }); dealDamage(b, o, dmg, src, 'zap'); });
  }

  const hyp = (x, y) => Math.sqrt(x * x + y * y);
  function atkOf(o) { return o.ab && o.ab.type === 'rage' ? o.baseAtk * (1 + o.ab.max * (1 - o.hp / o.maxHp)) : o.atk; }

  function onHit(b, src, tgt, speed) {
    const cfg = C(), per = cfg.wallBonusPer * (b.env.wallBonusMul || 1) + src.wallAdd;
    const mult = (1 + per * (Math.min(src.wallHits, src.bounces) + lotStack(b, src))) * (src.ringBuff ? 1.2 : 1), atk = atkOf(src), ab = src.ab;
    // 幽影：閃避（隱身必閃）——閃掉碰撞傷害與所有附加效果
    if (!tgt.temp && (tgt.veil || tgt.dodge) && (tgt.veil || rng.next(b.rng) < tgt.dodge)) { tgt.veil = 0; b.events.push({ t: 'dodge', x: tgt.x, y: tgt.y }); return; }
    confiscate(b, src, tgt);
    const far = src.farDmg ? 1 + src.farDmg * Math.min(cfg.farCap || 5, src.trav / 100) : 1, pinK = ab && ab.type === 'pin' ? 1 + ab.bonus : 1; // 狙擊：助跑距離加成
    // ---- 神技 ----：甜蜜點／花式／正中／擦邊／節奏 的本次撞擊倍率
    let sk = 1, post = null; const K = 1 + 0.12 * ((src.star || 1) - 1); // 星級：技巧加成部分 +12%/星
    if (ab && !src.temp) {
      if (ab.type === 'sweetSpot' && src.sweet === 1) { src.sweet = 2; sk *= (1 + (ab.mult - 1) * K) * skillMul(b, src, tgt, '甜蜜點！'); post = 'sweet'; }
      if (ab.type === 'trickShot' && !src.hitShot && src.wallHits >= ab.n) { sk *= (1 + (ab.mult - 1) * K) * skillMul(b, src, tgt, '花式 ×' + src.wallHits + '！'); post = 'trick'; }
      if (ab.type === 'cueBall') {
        if (src.cueNext) { sk *= 1 + src.cueNext; src.cueNext = 0; }
        if (src.hitCos >= ab.perfect) { sk *= (1 + (ab.mult - 1) * K) * skillMul(b, src, tgt, '正中！'); post = 'perfect'; }
        else if (src.hitCos <= ab.graze) post = 'graze';
        else if (src.hitCos >= ab.caromCos && !tgt.boss && !tgt.temp) { tgt.caromBy = src.i; tgt.caromDmg = atk * ab.carom * K * 0.7; } // 偏一點：不定桿，但被撞飛的敵人撞到隊友仍有 7 成連撞傷害
      }
      if (ab.type === 'rhythm' && src.stacks) { sk *= 1 + ab.per * src.stacks * K; if (src.stacks >= ab.boomAt) { sk *= skillMul(b, src, tgt, '節奏 ×' + src.stacks); post = 'beat'; } }
    }
    dealDamage(b, tgt, atk * speed / cfg.dmgSpeedRef * mult * far * pinK * sk, src, 'hit');
    if (!src.temp) src.hitShot = true;
    if (src.team === b.turn) b.teamHit = true; // 節奏：本隊這一發有撞到敵人
    if (post) skillPost(b, src, tgt, post, atk, K);
    if (pinK > 1 && tgt.alive && !tgt.boss) { tgt.vx = tgt.vy = 0; b.events.push({ t: 'pin', x: tgt.x, y: tgt.y }); }
    if (ab && ab.type === 'fear' && tgt.alive && !tgt.boss) { tgt.fear = Math.max(tgt.fear, ab.val); b.events.push({ t: 'fear', x: tgt.x, y: tgt.y }); }
    if (ab && ab.type === 'tether' && src.tether < 0 && tgt.alive && !tgt.temp) { src.tether = tgt.i; b.events.push({ t: 'tether', x: tgt.x, y: tgt.y }); }
    b.hits++; src.hitCount++;
    if (tgt.pigQ != null) pigOnHit(b, src, tgt);
    const UC = C().ult; if (!src.temp) src.energy = Math.min(UC.max, src.energy + UC.gainHit); tgt.energy = Math.min(UC.max, tgt.energy + UC.gainHurt);
    if (src.ultOn) ultHit(b, src, tgt, atk);
    const sd = b.sides[src.team];
    if (ab && ab.type === 'explodeOnHit') explode(b, tgt.x, tgt.y, ab.r, atk * ab.mult * mult, src.team, src, false);
    if (src.blastR) explode(b, tgt.x, tgt.y, src.blastR, atk * src.blastMult * mult, src.team, src, false);
    if (ab && ab.type === 'burn' && !src.burnUsed) { src.burnUsed = true; b.zones.push({ x: tgt.x, y: tgt.y, r: ab.r, dmg: atk * ab.mult, team: src.team, left: ab.shots, hit: {} }); }
    if (src.fx.hitPull) pull(b, tgt.x, tgt.y, src.fx.hitPull.r, src.fx.hitPull.pull * (1 + src.pullMul), src.team, tgt, 0, src);
    if (src.fx.everyN && src.hitCount % src.fx.everyN.n === 0) explode(b, tgt.x, tgt.y, src.fx.everyN.r, atk * src.fx.everyN.mult, src.team, src, false);
    if (sd.echo && !b.echoUsed) { b.echoUsed = true; explode(b, tgt.x, tgt.y, sd.echo.r, atk * sd.echo.mult, src.team, src, false); }
    const ph = (ab && ab.type === 'poisonHit' && ab) || src.fx.poisonHit;
    if (ph && tgt.alive) poison(b, tgt, atk * ph.mult * (1 + (src.poisonMul || 0)), ph.turns);
    if (tgt.alive && ((ab && ab.type === 'freezeHit') || (src.fx.freezeEvery && src.hitCount % src.fx.freezeEvery === 0)) && !tgt.boss) { tgt.stunned = true; b.events.push({ t: 'freeze', x: tgt.x, y: tgt.y }); }
    const ex = (ab && ab.type === 'armorBreak' && ab) || src.fx.exposeHit;
    if (ex && tgt.alive) { if (ab && ab.type === 'armorBreak' && tgt.shield > 0) { tgt.shield = 0; b.events.push({ t: 'shieldbreak', x: tgt.x, y: tgt.y }); } expose(b, tgt, ex.turns, ex.amp); }
    const ch = (ab && ab.type === 'chainHit' && ab) || src.fx.chainHit;
    if (ch) bolt(b, tgt, ch.n, atk * ch.mult, ch.r, src);
    if (tgt.alive && tgt.ab && tgt.ab.type === 'barrelBoom' && !tgt.boomUsed) { tgt.boomUsed = true; explode(b, tgt.x, tgt.y, tgt.ab.r, atkOf(tgt) * tgt.ab.mult, tgt.team, tgt, false); }
  }

  function combo(b, a, c, x, y) {
    const key = Math.min(a.i, c.i) + '-' + Math.max(a.i, c.i);
    if (b.comboUsed[key]) return;
    const owner = a.link === c.id ? a : c;
    const cb = D().units[owner.id].link.combo;
    b.comboUsed[key] = 1;
    b.events.push({ t: 'combo', x, y, name: cb.name });
    const team = a.team, atk = Math.max(atkOf(a), atkOf(c));
    if (cb.type === 'blast') explode(b, x, y, cb.r, atk * cb.mult, team, owner, false);
    if (cb.type === 'shieldAll') b.bodies.forEach(o => { if (o.alive && o.team === team) o.shield += cb.amt * (a.star + c.star) / 2; });
    if (cb.type === 'healAll') b.bodies.forEach(o => { if (o.alive && o.team === team && !o.temp) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * cb.pct); });
    if (cb.type === 'pullBlast') { pull(b, x, y, cb.r, 520, team, null, 0, owner); b.pending.push({ at: b.simT + 0.35, x, y, r: 110, dmg: atk * cb.mult, team, src: owner.i }); }
    if (cb.type === 'poisonCloud') { b.events.push({ t: 'pull', x, y, r: cb.r }); b.bodies.forEach(o => { if (o.alive && !o.temp && o.team !== team && Math.hypot(o.x - x, o.y - y) < cb.r + o.r) poison(b, o, atk * cb.mult, 3); }); }
    if (cb.type === 'freezeBlast') { b.events.push({ t: 'boom', x, y, r: cb.r, n: 0 }); b.bodies.forEach(o => { if (o.alive && !o.temp && o.team !== team && !o.boss && Math.hypot(o.x - x, o.y - y) < cb.r + o.r) { o.stunned = true; dealDamage(b, o, atk * 0.5, owner, 'zap'); b.events.push({ t: 'freeze', x: o.x, y: o.y }); } }); }
    if (cb.type === 'fearBlast') { b.events.push({ t: 'pull', x, y, r: cb.r }); b.bodies.forEach(o => { if (o.alive && !o.temp && o.team !== team && Math.hypot(o.x - x, o.y - y) < cb.r + o.r) { dealDamage(b, o, atk * 0.4, owner, 'blast'); if (o.alive && !o.boss) { o.fear = Math.max(o.fear, cb.val); b.events.push({ t: 'fear', x: o.x, y: o.y }); } } }); }
    if (cb.type === 'launch') {
      const slow = Math.hypot(a.vx, a.vy) < Math.hypot(c.vx, c.vy) ? a : c;
      let best = null, bd = 1e9;
      b.bodies.forEach(o => { if (o.alive && o.team !== team && !o.temp) { const d = Math.hypot(o.x - slow.x, o.y - slow.y); if (d < bd) { bd = d; best = o; } } });
      if (best) { const ang = Math.atan2(best.y - slow.y, best.x - slow.x); slow.vx = Math.cos(ang) * cb.speed; slow.vy = Math.sin(ang) * cb.speed; }
    }
  }

  function spawnShards(b, o) {
    const n = o.ab.n, sp = Math.hypot(o.vx, o.vy), ang = Math.atan2(o.vy, o.vx);
    for (let k = 0; k < n; k++) {
      const a = ang + (k - (n - 1) / 2 + (n === 1 ? 0 : 0)) * 0.5 + 0.25;
      b.bodies.push(Object.assign(blankBody(o.team), { id: o.id, name: '', temp: true, acted: true, team: o.team, alive: true, star: 1, traits: o.traits, color: o.color, r: o.r * 0.6, m: o.m * 0.5,
        hp: 1, maxHp: 1, atk: o.atk * 0.5, baseAtk: o.atk * 0.5, shield: 0, bounces: o.bounces, wallAdd: o.wallAdd, wallHits: o.wallHits, speed: 1,
        x: o.x - Math.cos(a) * 4, y: o.y - Math.sin(a) * 4, vx: Math.cos(a) * sp * 0.9, vy: Math.sin(a) * sp * 0.9, fx: {}, lifesteal: 0, blastR: 0, blastMult: 0, blastMul: o.blastMul, pullMul: 0, hitCount: 0, i: b.bodies.length }));
    }
    b.events.push({ t: 'split', x: o.x, y: o.y });
  }

  function wallBounce(b, o, i, nx, ny, vn, kind) {
    const cfg = C(), e = o.fx.noWallLoss ? 1 : cfg.wallRest;
    o.vx -= (1 + e) * vn * nx; o.vy -= (1 + e) * vn * ny;
    if (vn <= 80) return;
    o.wallHits++; b.events.push({ t: 'wall', x: o.x + nx * o.r, y: o.y + ny * o.r, kind });
    if (o.team === b.turn && o.traits.indexOf('bounce') >= 0) lotDraw(b, o.team, 'wall', o.x, o.y);
    if (kind === 'spike' && !o.temp) dealDamage(b, o, o.maxHp * 0.06, null, 'spike');
    if (kind === 'ring') { const k = Math.min(1.2, 1700 / (hyp(o.vx, o.vy) || 1)); o.vx *= k; o.vy *= k; o.ringBuff = 1; b.events.push({ t: 'ring', x: o.x, y: o.y }); }
    if (kind === 'wall' && b.rules.includes('spikes') && o.team === 0) dealDamage(b, o, o.maxHp * (C().spikeWall || 0.06), null, 'spike');
    if (o.ab && o.ab.type === 'boomerang') { const k = Math.min(1 + o.ab.boost, 1700 / (hyp(o.vx, o.vy) || 1)); o.vx *= k; o.vy *= k; }
    if (o.ab && o.ab.type === 'homing' && !o.homed && i === b.mover) { // 鷹眼：第一次撞牆後轉向最近敵人
      o.homed = true; let best = null, bd = 1e9;
      b.bodies.forEach(q => { if (q.alive && !q.temp && q.team !== o.team) { const d = hyp(q.x - o.x, q.y - o.y); if (d < bd) { bd = d; best = q; } } });
      if (best) { const a = Math.atan2(best.y - o.y, best.x - o.x), v = hyp(o.vx, o.vy) * o.ab.keep; o.vx = Math.cos(a) * v; o.vy = Math.sin(a) * v; b.events.push({ t: 'home', x: o.x, y: o.y, x2: best.x, y2: best.y }); }
    }
    if (o.ab && o.ab.type === 'split' && !o.splitDone && i === b.mover) { o.splitDone = true; spawnShards(b, o); }
  }

  const isLine = z => z.kind === 'ramp' || z.kind === 'rope';

  function placeLine(b) {
    const mv = b.bodies[b.mover], ab = mv && mv.ab;
    if (!mv || !mv.alive || !ab) return;
    if (ab.type !== 'rampDrop' && ab.type !== 'ropeDrop') return;
    b.stopDone = true;
    const line = { x: mv.x, y: mv.y, team: mv.team, placed: b.shotCount, len: ab.length, left: 1 };
    if (ab.type === 'rampDrop') {
      const dx = b.hw - Math.abs(mv.x), dy = b.hh - Math.abs(mv.y);
      if (Math.min(dx, dy) > ab.range) return;
      const edge = line.edge = dx <= dy ? 'x' : 'y', vert = edge === 'x';
      const other = vert ? 'y' : 'x', wall = vert ? b.hw : b.hh, limit = vert ? b.hh : b.hw;
      const sign = Math.sign(mv[edge]) || 1, span = ab.length * Math.SQRT1_2;
      const dir = Math.abs(mv[other]) > limit - span ? -Math.sign(mv[other]) : Math.sign(mv[other] - mv[vert ? 'oy' : 'ox']) || 1;
      line[edge] = sign * (wall - span / 2);
      line[other] += dir * span / 2;
      line.ux = (vert ? -sign : dir) * Math.SQRT1_2;
      line.uy = (vert ? dir : -sign) * Math.SQRT1_2;
      line.kind = 'ramp';
    } else {
      line.kind = 'rope';
      const angle = b.ropeAngle || 0;
      line.ux = -Math.sin(angle); line.uy = Math.cos(angle);
    }
    b.zones = b.zones.filter(z => z.kind !== line.kind);
    b.zones.push(line);
    b.events.push({ t: line.kind + 'Placed', x: line.x, y: line.y });
  }

  // 對固定步長內的位移求交點，避免高速棋子穿過細線。
  function crossLine(b, o, i, line, px, py, dt) {
    if (!line.left) return;
    const isRamp = line.kind === 'ramp', nx = -line.uy, ny = line.ux;
    const d0 = (px - line.x) * nx + (py - line.y) * ny;
    const change = (o.x - px) * nx + (o.y - py) * ny;
    const side = Math.sign(d0) || -Math.sign(change), dn = change * side;
    if (dn >= 0) return;
    const distance = isRamp ? o.r : 0, fraction = Math.max(0, (Math.abs(d0) - distance) / -dn);
    if (fraction > 1) return;
    const x = px + (o.x - px) * fraction, y = py + (o.y - py) * fraction;
    if (Math.abs((x - line.x) * line.ux + (y - line.y) * line.uy) > line.len / 2) return;
    const vn = -(o.vx * nx + o.vy * ny) * side;
    if (vn <= 0) return;
    line.left = 0;
    o.x = x; o.y = y;
    if (isRamp) {
      wallBounce(b, o, i, -nx * side, -ny * side, vn, 'ramp');
      o.x += o.vx * dt * (1 - fraction); o.y += o.vy * dt * (1 - fraction);
    } else o.vx = o.vy = 0;
    b.events.push({ t: isRamp ? 'rampBounce' : 'ropeCatch', x, y });
  }

  // ---- 物理一步；回傳 true 代表全部停止 ----
  function step(b) {
    const cfg = C(), dt = cfg.dt, bs = b.bodies;
    b.simT += dt; b.stepN = (b.stepN || 0) + 1;
    if (b.tapQ && b.tapQ.t === b.stepN) doTap(b, b.tapQ);
    const fr = Math.exp(-cfg.friction * (b.env.frictionMul || 1) * dt), ld = cfg.linDecel * (b.env.frictionMul || 1) * dt;
    let ramp, rope;
    for (const z of b.zones) {
      if (z.kind === 'ramp') ramp = z;
      if (z.kind === 'rope' && z.team !== b.turn) rope = z;
    }
    for (let i = 0; i < bs.length; i++) {
      const o = bs[i]; if (!o.alive) continue;
      const px = o.x, py = o.y;
      o.x += o.vx * dt; o.y += o.vy * dt;
      const sp = hyp(o.vx, o.vy);
      if (o.farDmg) o.trav += sp * dt;
      if (sp > 0) {
        const ns = o.fricMul === 1 ? Math.max(0, sp * fr - ld) : Math.max(0, sp * Math.pow(fr, o.fricMul) - ld * o.fricMul);
        o.vx *= ns / sp; o.vy *= ns / sp;
      }
      if (ramp && i === b.mover) crossLine(b, o, i, ramp, px, py, dt);
      if (rope && b.ropePush && b.ropePush[i]) crossLine(b, o, i, rope, px, py, dt);
      // 長方形牆
      const lx = b.hw - o.r, ly = b.hh - o.r;
      if (o.x > lx) { o.x = lx; if (o.vx > 0) wallBounce(b, o, i, 1, 0, o.vx, 'wall'); } else if (o.x < -lx) { o.x = -lx; if (o.vx < 0) wallBounce(b, o, i, -1, 0, -o.vx, 'wall'); }
      if (o.y > ly) { o.y = ly; if (o.vy > 0) wallBounce(b, o, i, 0, 1, o.vy, 'wall'); } else if (o.y < -ly) { o.y = -ly; if (o.vy < 0) wallBounce(b, o, i, 0, -1, -o.vy, 'wall'); }
      // 障礙柱（泳圈柱：加速加攻；尖刺柱：受傷）
      for (let q = 0; q < b.pillars.length; q++) {
        const p = b.pillars[q], dx = o.x - p.x, dy = o.y - p.y, rr = p.r + o.r;
        if (dx * dx + dy * dy >= rr * rr) continue;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01, nx = -dx / d, ny = -dy / d;
        o.x = p.x + dx / d * rr; o.y = p.y + dy / d * rr;
        const vn = o.vx * nx + o.vy * ny; if (vn > 0) wallBounce(b, o, i, nx, ny, vn, p.kind);
      }
    }
    // 火焰地板
    if (b.zones.length) b.zones.forEach(z => bs.forEach(o => {
      if (isLine(z) || z.left <= 0 || !o.alive || o.temp || o.team === z.team || z.hit[o.i]) return;
      if (hyp(o.x - z.x, o.y - z.y) >= z.r + o.r) return;
      z.hit[o.i] = 1;
      if (z.kind === 'mine') { z.left = 0; explode(b, z.x, z.y, z.br, z.dmg, z.team, null, false); }
      else if (z.kind === 'pool') poison(b, o, z.pDmg, z.turns);
      else if (z.kind === 'web') { o.vx *= z.slow; o.vy *= z.slow; poison(b, o, z.pDmg, z.turns); b.events.push({ t: 'webhit', x: o.x, y: o.y }); }
      else dealDamage(b, o, z.dmg, null, 'burn');
    }));
    if (b.zones.some(z => z.left <= 0)) b.zones = b.zones.filter(z => z.left > 0);
    const n = bs.length;
    for (let i = 0; i < n; i++) {
      const a = bs[i]; if (!a.alive) continue;
      for (let j = i + 1; j < n; j++) {
        const c = bs[j]; if (!c.alive) continue;
        const dx = c.x - a.x, dy = c.y - a.y, rr = a.r + c.r, d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const same = a.team === c.team;
        const key = i + '-' + j;
        if (b.ghost[key]) continue;
        const d = Math.sqrt(d2) || 0.001, nx = dx / d, ny = dy / d;
        const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        const sa = a.vx * nx + a.vy * ny, sc = -(c.vx * nx + c.vy * ny);
        // 穿透
        if (!same && rv < 0) {
          const pa = a.pierceLeft > 0 && sa > 200 ? a : c.pierceLeft > 0 && sc > 200 ? c : null;
          if (pa) { const pv = hyp(pa.vx, pa.vy); pa.preSp = pv; pa.hitCos = pv > 1 ? (pa === a ? sa : sc) / pv : 0; pa.pierceLeft--; b.ghost[key] = 1; const t = pa === a ? c : a; onHit(b, pa, t, pa === a ? sa : sc); b.events.push({ t: 'pierce', x: t.x, y: t.y }); continue; }
        }
        const me = cfg.massExp || 1, ia = 1 / Math.pow(a.m, me), ic = 1 / Math.pow(c.m, me), ov = rr - d; // 有效質量（見 config.massExp）
        a.x -= nx * ov * ia / (ia + ic); a.y -= ny * ov * ia / (ia + ic);
        c.x += nx * ov * ic / (ia + ic); c.y += ny * ov * ic / (ia + ic);
        if (rv >= 0) continue;
        if (!same) { const va = hyp(a.vx, a.vy), vc = hyp(c.vx, c.vy); a.preSp = va; c.preSp = vc; a.hitCos = va > 1 ? sa / va : 0; c.hitCos = vc > 1 ? sc / vc : 0; } // 撞擊角度（1＝正面）
        const jm = -(1 + cfg.restitution) * rv / (ia + ic);
        a.vx -= jm * ia * nx; a.vy -= jm * ia * ny; c.vx += jm * ic * nx; c.vy += jm * ic * ny;
        const px = a.x + nx * a.r, py = a.y + ny * a.r;
        b.events.push({ t: 'bump', x: px, y: py, s: Math.max(sa, sc) });
        if (rope && b.ropePush) {
          if (a.team === rope.team) b.ropePush[i] = !same && sc > 0 && !a.temp;
          if (c.team === rope.team) b.ropePush[j] = !same && sa > 0 && !c.temp;
        }
        if (!same) {
          const mh = cfg.minHitSpeed;
          if (a.ab && a.ab.type === 'heavyPush' && sa > mh) { c.vx += nx * jm * ic * (a.ab.mult - 1); c.vy += ny * jm * ic * (a.ab.mult - 1); }
          if (c.ab && c.ab.type === 'heavyPush' && sc > mh) { a.vx -= nx * jm * ia * (c.ab.mult - 1); a.vy -= ny * jm * ia * (c.ab.mult - 1); }
          if ((a.ab && a.ab.type === 'sticky' && sa > mh) || (c.ab && c.ab.type === 'sticky' && sc > mh)) {
            const M = a.m + c.m, vx = (a.vx * a.m + c.vx * c.m) / M, vy = (a.vy * a.m + c.vy * c.m) / M;
            a.vx = c.vx = vx * 1.1; a.vy = c.vy = vy * 1.1; b.events.push({ t: 'stick', x: px, y: py });
          }
          if (sa > mh) onHit(b, a, c, sa);
          if (sc > mh && c.alive && a.alive) onHit(b, c, a, sc);
        } else {
          const mv = bs[b.mover], ally = mv === a ? c : mv === c ? a : null;
          if (ally && mv.ab && mv.ab.type === 'relayTouch' && !b.relayGiven && !ally.temp && !ally.boss &&
              (mv === a ? sa : sc) > 0 && ally.energy < cfg.ult.max) {
            b.relayGiven = true;
            transferEnergy(b, mv, ally, mv.ab.amount);
          }
          // 撞隊友：被撞方加速（羽毛）、聯動組合技
          if (c.ab && c.ab.type === 'allyBoost' && sa > 100) { c.vx *= c.ab.mult; c.vy *= c.ab.mult; b.events.push({ t: 'boost', x: c.x, y: c.y }); }
          [[a, c, sa], [c, a, sc]].forEach(([h, t, s]) => { const hp = h.ultOn === 'heal' ? 0.4 : (h.ab && h.ab.type === 'healTouch' ? h.ab.pct : 0); if (hp && s > 80 && !t.healed && !t.temp) { t.healed = true; t.hp = Math.min(t.maxHp, t.hp + t.maxHp * hp); b.events.push({ t: 'heal', x: t.x, y: t.y }); } });
          if (a.ab && a.ab.type === 'allyBoost' && sc > 100) { a.vx *= a.ab.mult; a.vy *= a.ab.mult; b.events.push({ t: 'boost', x: a.x, y: a.y }); }
          if ((a.caromBy >= 0 || c.caromBy >= 0) && Math.max(Math.abs(sa), Math.abs(sc)) > 100) { // 撞球手：被正中打飛的敵人撞到隊友，雙方都受傷
            const k = a.caromBy >= 0 ? a : c, src = bs[k.caromBy], dmg = k.caromDmg; k.caromBy = -1;
            b.events.push({ t: 'carom', x: px, y: py }); dealDamage(b, a, dmg, src, 'carom'); dealDamage(b, c, dmg, src, 'carom');
          }
          if (((a.link && a.link === c.id) || (c.link && c.link === a.id)) && !a.temp && !c.temp && Math.max(Math.abs(sa), Math.abs(sc)) > 150) combo(b, a, c, px, py);
        }
      }
    }
    for (let k = b.pending.length - 1; k >= 0; k--) {
      const p = b.pending[k];
      if (b.simT >= p.at) { b.pending.splice(k, 1); explode(b, p.x, p.y, p.r, p.dmg, p.team, bs[p.src], false); }
    }
    const moving = bs.some(o => o.alive && (Math.abs(o.vx) > cfg.stopV || Math.abs(o.vy) > cfg.stopV));
    if (b.simT > cfg.maxSimSec) { bs.forEach(o => { o.vx = o.vy = 0; }); return finishMotion(b); }
    if (!moving) {
      const mv = bs[b.mover];
      if (mv && mv.alive && mv.ultOn && !mv.ultStop && ultStop(b, mv)) return false;
      if (!b.stopDone && mv && mv.alive && mv.ab && mv.ab.type === 'remoteBomb' && !mv.tapUsed) { // 遙控炸彈：沒點就停下小爆
        b.stopDone = true; explode(b, mv.x, mv.y, mv.ab.autoR, atkOf(mv) * mv.ab.auto, mv.team, mv, false); return false;
      }
      if (!b.stopDone && mv && mv.alive && mv.ab && mv.ab.type === 'mineDrop') {
        b.stopDone = true; b.zones.push({ kind: 'mine', x: mv.x, y: mv.y, r: 18, br: mv.ab.r, dmg: atkOf(mv) * mv.ab.mult * (1 + (mv.blastMul || 0)), team: mv.team, left: 6, hit: {} });
      }
      if (mv && mv.alive && mv.ab && mv.ab.type === 'relaunch' && !mv.relaunched) {
        mv.relaunched = true; let best = null, bd = 1e9;
        bs.forEach(o => { if (o.alive && !o.temp && o.team !== mv.team) { const d = hyp(o.x - mv.x, o.y - mv.y); if (d < bd) { bd = d; best = o; } } });
        if (best) { const ang = Math.atan2(best.y - mv.y, best.x - mv.x), v = mv.ab.speed * mv.speed; mv.vx = Math.cos(ang) * v; mv.vy = Math.sin(ang) * v; b.events.push({ t: 'boost', x: mv.x, y: mv.y }); return false; }
      }
      if (!b.stopDone && mv && mv.alive && mv.ab && mv.ab.type === 'quakeStop') {
        b.stopDone = true; b.events.push({ t: 'boom', x: mv.x, y: mv.y, r: mv.ab.r, n: 0 });
        const dmg = atkOf(mv) * mv.ab.mult;
        bs.forEach(o => {
          if (!o.alive || o.temp || o.team === mv.team) return;
          const dx = o.x - mv.x, dy = o.y - mv.y, d = hyp(dx, dy) || 1; if (d > mv.ab.r + o.r) return;
          if (b.ropePush) delete b.ropePush[o.i];
          const k = mv.ab.push / Math.sqrt(o.m); o.vx += dx / d * k; o.vy += dy / d * k; dealDamage(b, o, dmg, mv, 'blast');
        });
        return false;
      }
      if (!b.stopDone && mv && mv.alive && mv.ab && mv.ab.type === 'tether' && mv.tether >= 0) { // 電鰻：把拴住的敵人拉回身邊（瞬間位移）並電擊
        b.stopDone = true; const t = bs[mv.tether];
        if (t && t.alive && !t.temp && t.team !== mv.team) {
          const dx = t.x - mv.x, dy = t.y - mv.y, d = hyp(dx, dy) || 1, rr = mv.r + t.r + 4, x0 = t.x, y0 = t.y;
          if (d > rr) { t.x = mv.x + dx / d * rr; t.y = mv.y + dy / d * rr; t.vx = t.vy = 0; relax(b); }
          b.events.push({ t: 'tetherPull', x1: x0, y1: y0, x2: t.x, y2: t.y, mx: mv.x, my: mv.y }); b.events.push({ t: 'bolt', x1: mv.x, y1: mv.y, x2: t.x, y2: t.y });
          dealDamage(b, t, atkOf(mv) * mv.ab.mult, mv, 'zap');
        }
      }
      if (!b.stopDone && mv && mv.alive && mv.ab && mv.ab.type === 'web') {
        b.stopDone = true; const pd = atkOf(mv) * mv.ab.mult * (1 + (mv.poisonMul || 0));
        b.zones.push({ kind: 'web', x: mv.x, y: mv.y, r: mv.ab.r, dmg: pd * mv.ab.turns, pDmg: pd, turns: mv.ab.turns, slow: mv.ab.slow, team: mv.team, left: 4, hit: {} });
        b.events.push({ t: 'web', x: mv.x, y: mv.y, r: mv.ab.r });
      }
      if (!b.stopDone && mv && mv.alive && mv.ab && mv.ab.type === 'recall') { // 影子：瞬移回出發點＋護盾
        b.stopDone = true; b.events.push({ t: 'blink', x: mv.x, y: mv.y, x2: mv.ox, y2: mv.oy });
        mv.x = mv.ox; mv.y = mv.oy; mv.shield += mv.maxHp * mv.ab.shield; relax(b);
      }
      if (!b.stopDone && mv && mv.alive && mv.ab && mv.ab.type === 'magnetStop') {
        b.stopDone = true; pull(b, mv.x, mv.y, mv.ab.r, mv.ab.pull * (1 + mv.pullMul), mv.team, null, atkOf(mv) * mv.ab.mult, mv); return false;
      }
      bs.forEach(o => { o.vx = o.vy = 0; });
      if (!b.pending.length) return finishMotion(b);
    }
    return false;
  }

  function finishMotion(b) {
    if (!b.stopDone) placeLine(b);
    return true;
  }

  function alive(b, team) { return b.bodies.filter(o => o.alive && !o.temp && o.team === team); }
  function hpSum(b, team) { return alive(b, team).reduce((s, o) => s + o.hp, 0); }

  // 勝負：對方「總動數」先歸零就贏；不能復活的一方（撲滿）全倒也算輸
  // ---- 大招 ----
  function ultLaunch(b, x) {
    const t = x.ultOn; let k = 1;
    if (t === 'bulwark') { b.bodies.forEach(o => { if (o.alive && !o.temp && o.team === x.team) o.shield += o.maxHp * 0.2; }); x.ultMassMul = 3; x.m *= 3; }
    if (t === 'phase') { x.pierceLeft = 99; k = 1.35; }
    if (t === 'ricochet') { x.wallAdd += 0.5; x.bounces += 6; }
    if (t === 'heal') k = 1.2;
    if (t === 'deadeye') k = 1.2;
    return k;
  }
  function ultHit(b, src, tgt, atk) {
    const t = src.ultOn;
    if (t === 'nova' && !src.ultUsed) { src.ultUsed = 1; explode(b, tgt.x, tgt.y, 150, atk * 1.6, src.team, src, false); }
    if (t === 'deadeye' && !src.ultUsed && tgt.alive) { src.ultUsed = 1; b.events.push({ t: 'crit', x: tgt.x, y: tgt.y }); dealDamage(b, tgt, atk * 1.2, src, 'snipe'); expose(b, tgt, 2, 0.25); }
    if (t === 'quake' && tgt.alive) { const dx = tgt.x - src.x, dy = tgt.y - src.y, d = hyp(dx, dy) || 1, k = 700 / Math.sqrt(tgt.m); tgt.vx += dx / d * k; tgt.vy += dy / d * k; if (!tgt.boss) { tgt.stunned = true; b.events.push({ t: 'freeze', x: tgt.x, y: tgt.y }); } }
  }
  function ultStop(b, mv) {
    const t = mv.ultOn, atk = atkOf(mv); mv.ultStop = 1;
    if (t === 'vortex') { pull(b, mv.x, mv.y, 330, 650 * (1 + mv.pullMul), mv.team, null, atk * 0.6, mv); return true; }
    if (t === 'plague') { b.events.push({ t: 'pull', x: mv.x, y: mv.y, r: 260 }); b.bodies.forEach(o => { if (o.alive && !o.temp && o.team !== mv.team && hyp(o.x - mv.x, o.y - mv.y) < 260 + o.r) poison(b, o, atk * 0.7 * (1 + (mv.poisonMul || 0)), 3); }); return false; }
    if (t === 'overdrive') { let best = null, bd = 1e9; b.bodies.forEach(o => { if (o.alive && !o.temp && o.team !== mv.team) { const d = hyp(o.x - mv.x, o.y - mv.y); if (d < bd) { bd = d; best = o; } } }); if (best) { const a = Math.atan2(best.y - mv.y, best.x - mv.x); mv.vx = Math.cos(a) * 1100; mv.vy = Math.sin(a) * 1100; b.events.push({ t: 'boost', x: mv.x, y: mv.y }); return true; } }
    if (t === 'eclipse') { // 影換：和生命比例最低的敵人互換位置
      let best = null, bv = 9; b.bodies.forEach(o => { if (o.alive && !o.temp && o.team !== mv.team && o.hp / o.maxHp < bv) { bv = o.hp / o.maxHp; best = o; } });
      if (best) {
        const x0 = mv.x, y0 = mv.y; mv.x = best.x; mv.y = best.y; best.x = x0; best.y = y0; best.vx = best.vy = 0;
        b.events.push({ t: 'swap', x1: x0, y1: y0, x2: mv.x, y2: mv.y });
        dealDamage(b, best, atk * 0.9, mv, 'blast'); if (best.alive && !best.boss) { best.fear = Math.max(best.fear, 0.4); b.events.push({ t: 'fear', x: best.x, y: best.y }); }
        relax(b);
      }
    }
    return false;
  }
  function ultEnd(x) {
    if (!x.ultOn) return;
    if (x.ultOn === 'bulwark') { x.m /= x.ultMassMul; x.ultMassMul = 1; }
    if (x.ultOn === 'phase') x.pierceLeft = x.ab && x.ab.type === 'pierce' ? x.ab.n : 0;
    if (x.ultOn === 'ricochet') { x.wallAdd -= 0.5; x.bounces -= 6; }
    x.ultOn = '';
  }

  function checkEnd(b) {
    const m = b.moves, gone = t => !alive(b, t).length && !b.bodies.some(o => o.team === t && o.down);
    if (gone(1)) { finish(b, 0); return true; }
    if (gone(0)) { finish(b, 1); return true; }
    const e0 = m[0] <= 0, e1 = m[1] <= 0 && !b.sides[1].noAct;
    if (e0 && e1) { finish(b, m[0] > m[1] ? 0 : 1); return true; }
    if (e1) { finish(b, 0); return true; }
    if (e0) { finish(b, 1); return true; }
    return false;
  }
  // 陣亡：扣動數後在出生點滿血復活（動數歸零就不再復活）
  function reviveDowned(b) {
    const cfg = C();
    b.bodies.forEach(o => {
      if (!o.down) return;
      o.down = false;
      if (o.boss) { b.events.push({ t: 'movecost', team: o.team, n: Math.max(0, b.moves[o.team]), x: o.x, y: o.y }); b.moves[o.team] = 0; return; } // 擊倒首領＝直接獲勝
      b.moves[o.team] -= cfg.deathCost;
      b.events.push({ t: 'movecost', team: o.team, n: cfg.deathCost, x: o.x, y: o.y });
      if (b.moves[o.team] <= 0) return;
      o.alive = true; o.hp = o.maxHp; o.shield = 0; o.poison = null; o.stunned = false; o.exposed = 0; o.fear = 0; o.stacks = 0; o.vx = o.vy = 0; o.x = o.sx; o.y = o.sy;
      b.events.push({ t: 'respawn', x: o.x, y: o.y, team: o.team });
    });
    relax(b);
  }

  function endShot(b) {
    const t = b.turn;
    b.shotCount++;
    const mv = b.bodies[b.mover];
    if (mv) { mv.acted = true; b.moves[t]--; ultEnd(mv); rhythmEnd(b, t); }
    b.tapQ = null;
    if (b.bodies.some(o => o.temp)) { b.bodies = b.bodies.filter(o => !o.temp); b.bodies.forEach((o, i) => o.i = i); }
    b.zones = b.zones.filter(z => isLine(z) ? z.left > 0 && (z.team !== t || z.placed === b.shotCount - 1) : --z.left > 0);
    b.bodies.forEach(o => { if (o.team === t && o.itemMuted) { applyItemStats(o, true); o.itemMuted = false; } });
    b.bodies.forEach(o => { if (o.team === t && b.round > b.maxRounds) o.stunned = false; o.wallHits = 0; });
    b.phase = 'aim'; b.mover = -1;
    reviveDowned(b);
    if (checkEnd(b)) return;
    nextTurn(b, t);
  }

  // ---- 敵人詞綴 ----
  // b.affix：run.affixExt 產生的純資料＋狀態（lavaN）；每個棋子的詞綴狀態放 o.aff（create 時一次補齊，形狀一致）
  function affixSetup(bt, o) {
    const A = bt.affix = JSON.parse(JSON.stringify(o.eExt.affix)); A.lavaN = 0; A.cdLeft = A.cheatN || (A.cheatDeath ? 99 : 0);
    const pf = (o.pFront || []).filter(Boolean), maxI = C().maxItems;
    bt.bodies.forEach((x, k) => {
      x.aff = { mhp0: x.maxHp, empty: 0, q: 0, cd: 0, ih: 0, low: 0, cl: 0 };
      if (x.team === 0) { const u = pf[k]; x.aff.empty = u ? Math.max(0, maxI - (u.items || []).length) : 0; return; }
      const hm = 1 + A.hpPct + (x.boss ? A.bossHp : A.minionHp);
      x.hp *= hm; x.maxHp *= hm; x.aff.mhp0 = x.maxHp;
      if (A.speedPct) x.speed *= 1 + A.speedPct;
      if (!x.boss && A.minionMass) x.m *= 1 + A.minionMass;
    });
    if (A.bossShots && bt.bodies.some(x => x.boss)) { bt.moves[1] += A.bossShots * 2; bt.movesMax[1] = bt.moves[1]; }
  }
  function affixTurn(b) {
    const A = b.affix;
    if (A.lava && b.turn === 0) {
      A.lavaN = Math.min(A.lavaMax || 5, A.lavaN + 1);
      const t = b.bodies.find(x => x.alive && !x.temp && x.team === 0);
      if (t) { b.events.push({ t: 'boom', x: t.x, y: t.y, r: t.r + 10, n: 0 }); dealDamage(b, t, t.maxHp * A.lava * A.lavaN, null, 'burn'); }
    }
  }
  function affixLaunch(b, x, power) {
    if (x.aff && x.aff.q) { x.aff.q = 0; return Math.min(power, 1 - b.affix.hitSlow); }
    return power;
  }
  function affixDmgMul(b, tgt, amt, src) {
    const A = b.affix;
    if (tgt.team !== 0 || !src || src.team !== 1) return amt;
    let k = 1;
    if (A.vsStar1 && tgt.star === 1) k += A.vsStar1;
    if (A.emptySlotDmg && tgt.aff) k += A.emptySlotDmg * tgt.aff.empty;
    return amt * k;
  }
  function affixOnDamage(b, tgt, amt, src, kind) {
    const A = b.affix, f = tgt.aff; if (!f) return;
    if (tgt.team === 0) {
      if (A.hitSlow && kind === 'hit' && src && src.team === 1) f.q = 1;
      if (A.trauma && tgt.hp > 0) { tgt.maxHp = Math.max(f.mhp0 * (1 - A.traumaCap), tgt.maxHp - amt * A.trauma); tgt.hp = Math.min(tgt.hp, tgt.maxHp); }
      return;
    }
    if (A.cheatDeath && tgt.hp <= 0 && !f.cd && A.cdLeft > 0) { f.cd = 1; A.cdLeft--; tgt.hp = tgt.maxHp * A.cheatDeath; b.events.push({ t: 'revive', x: tgt.x, y: tgt.y }); }
    if (A.firstHitSpeed && kind === 'hit' && !f.ih) { f.ih = 1; tgt.speed *= 1 + A.firstHitSpeed; b.events.push({ t: 'boost', x: tgt.x, y: tgt.y }); }
    if (tgt.hp <= 0) return;
    const L = A.lowHp;
    if (L && !f.low && tgt.hp < tgt.maxHp * L.at) {
      f.low = 1; tgt.atk *= 1 + L.atkPct; tgt.baseAtk *= 1 + L.atkPct;
      if (L.counter && b.phase === 'moving') {
        let best = null, bd = 1e9;
        b.bodies.forEach(o => { if (o.alive && !o.temp && o.team !== tgt.team) { const d = hyp(o.x - tgt.x, o.y - tgt.y); if (d < bd) { bd = d; best = o; } } });
        if (best) { const ang = Math.atan2(best.y - tgt.y, best.x - tgt.x), v = 650 * tgt.speed; tgt.vx = Math.cos(ang) * v; tgt.vy = Math.sin(ang) * v; }
      }
      b.events.push({ t: 'boost', x: tgt.x, y: tgt.y });
    }
    const Q = A.cleanse;
    if (Q && !f.cl && tgt.hp < tgt.maxHp * Q.at) {
      f.cl = 1; tgt.poison = null; tgt.stunned = false; tgt.hp = Math.min(tgt.maxHp, tgt.hp + tgt.maxHp * Q.heal);
      b.events.push({ t: 'heal', x: tgt.x, y: tgt.y });
    }
  }

  function finish(b, w) { if (b.phase === 'over') return; b.phase = 'over'; b.winner = w; b.events.push({ t: 'over', winner: w }); }

  // 瞄準預演：用同一套物理跑一次，回傳彈射棋子路線（撞到東西或撞牆上限後再多畫一小段）與第一個被撞棋子的去向
  function predict(b, idx, angle, power) {
    const c = JSON.parse(JSON.stringify(b)); c.events = [];
    if (!launch(c, idx, angle, power)) return null;
    const o = c.bodies[idx], pts = [[o.x, o.y]], EXTRA = 80;
    const lineMaker = o.ab && (o.ab.type === 'rampDrop' || o.ab.type === 'ropeDrop');
    let cut = -1, after = 0, hit = -1, hitPts = null, px = o.x, py = o.y, end = null;
    for (let k = 0; k < 1500; k++) {
      const done = step(c);
      if (end) { if (done || !o.alive) break; continue; }
      if (hit < 0) {
        const j = c.bodies.findIndex((q, n) => n !== idx && !q.temp && q.alive && !q.hopT && (Math.abs(q.vx) > 1 || Math.abs(q.vy) > 1));
        if (j >= 0) { hit = j; hitPts = [[c.bodies[j].x, c.bodies[j].y]]; }
      }
      if (cut < 0 && (hit >= 0 || o.wallHits > Math.max(1, o.bounces))) cut = pts.length;
      if (cut >= 0) { after += Math.hypot(o.x - px, o.y - py); if (hit >= 0) { const q = c.bodies[hit]; hitPts.push([q.x, q.y]); } }
      px = o.x; py = o.y;
      if (k % 2 === 0 || cut >= 0) pts.push([o.x, o.y]);
      if (done || !o.alive) break;
      if (after > EXTRA) {
        if (!lineMaker) break;
        end = [o.x, o.y];
      }
    }
    pts.push(end || [o.x, o.y]);
    const line = c.zones.find(z => isLine(z) && z.team === c.turn && z.placed === c.shotCount);
    return { pts, cut: cut < 0 ? pts.length - 1 : cut, hit: hitPts, r: o.r, line };
  }

  // ---- 徽章 ----：裝備裡的徽章讓角色多 1 個羈絆（原本就有的不重複算）
  const emblemOf = it => D().emblems && it && D().emblems[it.id];
  function emblemMap(units) {
    const m = {};
    (units || []).forEach(u => { if (!u || !u.items) return; u.items.forEach(it => { const E = emblemOf(it); if (E) (m[u.id] = m[u.id] || []).push(E.addTrait); }); });
    return m;
  }
  function emblemExtra(id, emb, U) { const a = (emb && emb[id]) || []; return a.filter((t, i) => !U.traits.includes(t) && a.indexOf(t) === i && D().traits[t]); }
  function unitTraits(inst) { const U = D().units[inst.id]; return U.traits.concat(emblemExtra(inst.id, emblemMap([inst]), U)); }

  // ---- 陣營 ----：計數同流派（前台＋後台、同角色算一次）
  function factionTiers(unitIds) {
    const F = D().factions || {}, counts = {}, active = {};
    [...new Set(unitIds)].forEach(id => { const U = D().units[id]; if (U && U.faction) counts[U.faction] = (counts[U.faction] || 0) + 1; });
    for (const k in F) { let best = null; F[k].tiers.forEach(t => { if ((counts[k] || 0) >= t.n) best = t; }); active[k] = best; }
    return { counts, active };
  }
  // 建一方時：陣營（多發／第一發規則）＋羈絆抽獎獎池
  function bondSide(side, all, tt) {
    const ft = factionTiers(all.map(u => u.id));
    side.factions = ft.active; side.launches = 0; side.firstMul = 1; side.lot = {};
    for (const k in ft.active) { const f = ft.active[k]; if (f && f.fx.shots) { side.shotsAdd += f.fx.shots; side.firstMul = Math.min(side.firstMul, f.fx.firstMul || 1); } }
    for (const k in tt.active) { const a = tt.active[k]; if (a && a.lottery) side.lot[a.lottery.on] = { trait: k, pool: a.lottery.pool }; }
  }
  function bondCreate(bt) {
    bt.lot = { n: {}, dmg: [0, 0], stack: [0, 0], shotN: [0, 0], gold: 0 }; bt.pigGold = 0;
    bt.bodies.forEach(o => { if (o.id === 'piggy' && o.team === 1) { o.pigQ = 0; o.hopT = false; } });
  }
  function bondLaunch(b, x) {
    const s = b.sides[x.team]; s.launches = (s.launches || 0) + 1;
    if (b.lot) { b.lot.n = {}; b.lot.dmg = [0, 0]; b.lot.stack = [0, 0]; }
    pigHop(b, x.team);
  }
  // 傷害倍率：抽獎的本發加成；馬戲團第一發沒先撞牆時碰撞傷害打折
  function bondDmgMul(b, tgt, src, kind) {
    if (!src || !b.lot || src.team === tgt.team) return 1;
    let m = 1 + (b.lot.dmg[src.team] || 0);
    const s = b.sides[src.team];
    if (kind === 'hit' && s.firstMul < 1 && s.launches === 1 && src.team === b.turn) { const mv = b.bodies[b.mover]; if (mv && mv.team === src.team && !mv.wallHits) m *= s.firstMul; }
    return m;
  }

  // ---- 羈絆抽獎 ----：觸發時機用 b.rng 抽，每發每種時機最多 perShot 次
  function lotDraw(b, team, on, x, y) {
    const s = b.sides[team], L = b.lot; if (!L || !s || !s.lot || !s.lot[on]) return;
    const RR = D().lotteryRules, key = team + on; if ((L.n[key] || 0) >= RR.perShot) return; L.n[key] = (L.n[key] || 0) + 1;
    const pool = s.lot[on].pool; let r = rng.next(b.rng) * pool.reduce((a, p) => a + p[1], 0), p = pool[0];
    for (const q of pool) { if (r < q[1]) { p = q; break; } r -= q[1]; }
    let prize = p[0];
    if (prize === 'shot' && L.shotN[team] >= RR.shotCap) prize = 'none';
    const LG = L.goldT || [L.gold, 0];
    if (prize === 'gold' && ((team !== 0 && !b.goldBoth) || LG[team] >= RR.goldCap)) prize = 'none'; // goldBoth：連線自走棋，紅方抽中的金幣也算（各自的商店）
    if (prize === 'dmg') L.dmg[team] += p[2];
    if (prize === 'stack') L.stack[team]++;
    if (prize === 'shot') { L.shotN[team]++; b.moves[team]++; b.movesMax[team]++; } // 總動數制：抽中多 1 動
    if (prize === 'gold') { if (team === 0) L.gold++; (L.goldT || (L.goldT = [L.gold - (team === 0 ? 1 : 0), 0]))[team]++; }
    b.events.push({ t: 'lotto', x, y, prize, val: p[2] || 0, team, on, trait: s.lot[on].trait });
  }
  const lotStack = (b, src) => (b.lot && b.lot.stack[src.team]) || 0;

  // ---- 次元撲滿 ----：被撞往反方向逃、我方每次彈射時蹦一下、每掉 25% 生命掉金
  const PIG = () => (D().run && D().run.piggy) || {};
  function pigHop(b, team) {
    b.bodies.forEach(o => { if (o.pigQ != null) o.hopT = false; });
    if (team !== 0) return;
    const pigs = b.bodies.filter(o => o.alive && o.pigQ != null), mine = alive(b, 0); if (!pigs.length || !mine.length) return;
    const P = PIG(), cx = mine.reduce((a, o) => a + o.x, 0) / mine.length, cy = mine.reduce((a, o) => a + o.y, 0) / mine.length;
    pigs.forEach(o => {
      const a = Math.atan2(o.y - cy, o.x - cx) + (rng.next(b.rng) - 0.5) * 2 * (P.hopJitter || 0), v = P.hop || 0; if (!v) return;
      o.vx = Math.cos(a) * v; o.vy = Math.sin(a) * v; o.hopT = true; b.events.push({ t: 'pighop', x: o.x, y: o.y });
    });
  }
  function pigOnHit(b, src, tgt) {
    if (!tgt.alive) return;
    const P = PIG(), dx = tgt.x - src.x, dy = tgt.y - src.y, d = Math.hypot(dx, dy) || 1, v = Math.max(P.flee || 0, Math.hypot(tgt.vx, tgt.vy));
    tgt.hopT = false; tgt.vx = dx / d * v; tgt.vy = dy / d * v; b.events.push({ t: 'pigflee', x: tgt.x, y: tgt.y });
  }
  function pigDamaged(b, tgt) {
    const P = PIG(), q = tgt.alive ? Math.min(3, Math.floor((1 - tgt.hp / tgt.maxHp) * 4 + 1e-9)) : 4;
    if (q <= tgt.pigQ) return;
    const g = (q - tgt.pigQ) * (P.goldPerQuarter || 0) + (q === 4 ? P.killGold || 0 : 0);
    tgt.pigQ = q; b.pigGold = (b.pigGold || 0) + g;
    if (g) b.events.push({ t: 'piggold', x: tgt.x, y: tgt.y, n: g });
  }

  // ---- 神技 ----：技巧觸發（神技羈絆加傷＋回能量、跳字）
  function skillMul(b, src, tgt, txt) {
    if (src.skillEn) src.energy = Math.min(C().ult.max, src.energy + src.skillEn);
    b.events.push({ t: 'skill', x: tgt ? tgt.x : src.x, y: tgt ? tgt.y : src.y, txt, team: src.team });
    return 1 + (src.skillDmg || 0);
  }
  function skillPost(b, src, tgt, kind, atk, K) {
    const ab = src.ab;
    if (kind === 'sweet' && tgt.alive) expose(b, tgt, ab.turns, ab.amp);
    if (kind === 'trick') explode(b, tgt.x, tgt.y, ab.r, atk * ab.boom * K, src.team, src, false);
    if (kind === 'beat') explode(b, tgt.x, tgt.y, ab.r, atk * ab.boom, src.team, src, false);
    if (kind === 'perfect' && tgt.alive && !tgt.boss && !tgt.temp) { // 定桿：自己停住，敵人整顆飛出
      const dx = tgt.x - src.x, dy = tgt.y - src.y, d = hyp(dx, dy) || 1, v = src.preSp * ab.push * Math.min(1.3, Math.sqrt(src.m / tgt.m));
      tgt.vx = dx / d * v; tgt.vy = dy / d * v; src.vx = src.vy = 0; tgt.caromBy = src.i; tgt.caromDmg = atk * ab.carom * K;
    }
    if (kind === 'graze') { // 擦邊：幾乎不減速，下一撞加成
      const v = hyp(src.vx, src.vy) || 1, w = Math.max(v, src.preSp * 0.92); src.vx *= w / v; src.vy *= w / v; src.cueNext = ab.grazeBonus * K;
      b.events.push({ t: 'skill', x: src.x, y: src.y, txt: '擦邊', team: src.team, small: 1 });
    }
  }
  function rhythmEnd(b, t) { // 鼓手：本隊每一發（誰彈都算）有撞到敵人 +1 層，沒撞到就歸零
    b.bodies.forEach(o => {
      if (o.team !== t || o.temp || !o.alive || !o.ab || o.ab.type !== 'rhythm') return;
      if (b.teamHit) { o.stacks = Math.min(o.ab.max, o.stacks + 1); b.events.push({ t: 'skill', x: o.x, y: o.y, txt: '節奏 ' + o.stacks + ' 層', team: o.team, small: 1 }); }
      else if (o.stacks) { o.stacks = 0; b.events.push({ t: 'skill', x: o.x, y: o.y, txt: '斷拍…', team: o.team, small: 1, bad: 1 }); }
    });
  }
  // ---- 二次操作 ----：飛行中點一下（輸入＝{t 物理步數, x, y 世界座標}，固定步長下可重現）
  const tapAbility = o => (o && o.ab && o.ab.tap) || null;
  function cleanTap(q) {
    if (!q || !isFinite(q.t) || !isFinite(q.x) || !isFinite(q.y)) return null;
    const t = q.t | 0; if (t < 1 || t > 3000) return null;
    return { t, x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100 };
  }
  function canTap(b) { const mv = b.bodies[b.mover]; return b.phase === 'moving' && !!mv && mv.alive && !!tapAbility(mv) && !mv.tapUsed && !b.tapQ; }
  function tap(b, x, y) { if (!canTap(b)) return null; b.tapQ = cleanTap({ t: b.stepN + 1, x, y }); return b.tapQ && Object.assign({}, b.tapQ); } // 即時點擊：下一步生效，回傳要同步的紀錄
  function doTap(b, q) {
    const mv = b.bodies[b.mover], k = tapAbility(mv); if (!k || !mv.alive || mv.tapUsed) return;
    mv.tapUsed = true; b.tapLog = { t: q.t, x: q.x, y: q.y };
    const ab = mv.ab, K = 1 + 0.12 * ((mv.star || 1) - 1);
    if (k === 'boom') { // 遙控炸彈：當場引爆並急停
      b.events.push({ t: 'tap', x: mv.x, y: mv.y, kind: k });
      const m = skillMul(b, mv, null, '引爆！'); mv.vx = mv.vy = 0;
      explode(b, mv.x, mv.y, ab.r, atkOf(mv) * ab.mult * K * m, mv.team, mv, false);
    }
    if (k === 'split') { // 幻影劍士：朝點的方向分出幻影
      const dx = q.x - mv.x, dy = q.y - mv.y, d = hyp(dx, dy) || 1, sp = Math.max(hyp(mv.vx, mv.vy), ab.minSp * mv.speed), m = skillMul(b, mv, null, '分身！');
      b.events.push({ t: 'tap', x: mv.x, y: mv.y, kind: k, x2: q.x, y2: q.y });
      const c = Object.assign(blankBody(mv.team), { id: mv.id, name: '', temp: true, acted: true, alive: true, star: mv.star, traits: mv.traits, color: mv.color, r: mv.r * 0.8, m: mv.m * 0.7,
        hp: 1, maxHp: 1, atk: mv.atk * ab.mult * K * m, baseAtk: mv.atk * ab.mult * K * m, bounces: mv.bounces, wallAdd: mv.wallAdd, speed: 1, fx: {}, x: mv.x, y: mv.y, vx: dx / d * sp, vy: dy / d * sp, i: b.bodies.length });
      b.bodies.push(c); b.ghost[Math.min(mv.i, c.i) + '-' + Math.max(mv.i, c.i)] = 1;
    }
  }

  function runShot(b) { let k = 0; while (!step(b) && k++ < 2500); }

  FA.battle = { avail, create, launch, step, endShot, runShot, predict, startTurn, alive, hpSum, traitTiers, dealDamage, canMove, addMods, atkOf, expose,
    factionTiers, emblemMap, unitTraits, tap, canTap, tapAbility };
})(globalThis);
