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
      down: false, sx: 0, sy: 0, ringBuff: 0, energy: 0, ultType: '', ultOn: '', ultUsed: 0, ultStop: 0, ultMassMul: 1 };
  }

  function makeBody(inst, team, sideMods, traitsActive, env) {
    const cfg = C(), rm = env.radiusMul || 1;
    const base = blankBody(team);
    if (inst.boss) {
      const B = D().enemies.bosses[inst.plane - 1][inst.variant || 0], sc = 1 + (inst.threat || 0);
      return Object.assign(base, { id: 'boss', name: B.name, boss: true, star: 1, traits: [], color: B.color, r: B.r * rm, m: B.mass,
        hp: B.hp * sc, maxHp: B.hp * sc, atk: B.atk * sc, baseAtk: B.atk * sc, bounces: cfg.baseBounces, speed: 0.9,
        ultType: 'nova', zapMult: B.zap || 0, ab: B.ability ? Object.assign({}, B.ability) : null, split: B.split ? Object.assign({}, B.split) : null });
    }
    const U = D().units[inst.id], m = cfg.starMult[inst.star - 1];
    const mods = addMods({}, sideMods);
    (inst.items || []).forEach(it => addMods(mods, it.rolls));
    if (inst.weapon) addMods(mods, D().weapons[inst.weapon].mods);
    unitTraits(inst).forEach(t => { if (traitsActive[t]) addMods(mods, traitsActive[t].mods); });
    const hp = U.hp * m * (1 + (mods.hpPct || 0)), atk = U.atk * m * (1 + (mods.atkPct || 0));
    const b = Object.assign(base, { id: inst.id, name: U.name, star: inst.star, traits: unitTraits(inst), color: U.color,
      r: (U.r + (inst.star - 1) * 2) * rm, m: Math.max(0.3, U.mass * (1 + (mods.massPct || 0))), hp, maxHp: hp, atk, baseAtk: atk,
      speed: U.speed * (1 + (mods.speedPct || 0)), bounces: cfg.baseBounces + (mods.bounces || 0), wallAdd: mods.wallAdd || 0,
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
      cannon: [], dmgTaken: ext.dmgTaken || 0, lowStarDmg: ext.lowStarDmg || 0, mark: 0, markAmp: 0, revive: ext.revive || 0, revivePct: 0.4, openFreeze: ext.openFreeze || 0, stormZap: ext.stormZap || 0, stormDmg: 0 };
    bodies.forEach(b => { if (b.zapMult) side.zap += b.atk * b.zapMult; });
    if (bodies.length) side.stormDmg = bodies.reduce((s, b) => s + b.atk, 0) / bodies.length * 0.8;
    bondSide(side, all, tt);
    back.filter(Boolean).forEach(u => {
      const U = D().units[u.id]; if (!U || !U.back || U.role === 'front') return;
      const k = cfg.starMult[u.star - 1], bk = U.back;
      if (bk.type === 'atkPct') { const v = bk.val * (1 + 0.5 * (u.star - 1)); bodies.forEach(b => { if (!bk.trait || b.traits.includes(bk.trait)) { b.atk *= 1 + v; b.baseAtk = b.atk; } }); }
      if (bk.type === 'shield') side.turnShield += bk.val * k;
      if (bk.type === 'heal') side.turnHeal += bk.val * k;
      if (bk.type === 'zap') side.zap += U.atk * k * bk.mult;
      if (bk.type === 'gravity') side.gravity += bk.pull * (1 + 0.3 * (u.star - 1));
      if (bk.type === 'cannon') side.cannon.push({ dmg: U.atk * k * bk.mult, r: bk.r });
      if (bk.type === 'mark') { side.mark = Math.max(side.mark, bk.turns); side.markAmp = Math.max(side.markAmp, bk.amp + 0.05 * (u.star - 1)); }
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
    const bt = { R, R0: R, hw, hh, hw0: hw, hh0: hh, pillars, rules: o.rules || [], env, bodies, sides: [p.side, e.side], turn: 0, shots: [0, 0], round: 1, maxRounds: 999, bonus: [0, 0],
      moves: [M + p.side.shotsAdd * 2, e.side.noAct ? 0 : M + e.side.shotsAdd * 2], movesMax: [0, 0], deaths: [0, 0],
      phase: 'aim', winner: null, rng: { s: o.seed | 0 }, events: [], simT: 0, mover: -1, chain: 0, hits: 0, pending: [], comboUsed: {},
      shotCount: 0, zones: [], ghost: {}, echoUsed: false, gold: 0, stopDone: false };
    bt.movesMax = bt.moves.slice();
    if (o.eExt && o.eExt.affix) affixSetup(bt, o); // ---- 敵人詞綴 ----
    relax(bt);
    if (bt.rules.includes('swamp')) [[-0.55, 0.15], [0.55, 0.15], [0, -0.02]].forEach(([x, y]) => bt.zones.push({ kind: 'pool', x: x * hw, y: y * hh, r: 50, dmg: 0, team: 1, left: 999, hit: {}, pDmg: 18, turns: 2 }));
    [0, 1].forEach(t => { for (let k = 0; k < bt.sides[t].openFreeze; k++) { const f = alive(bt, 1 - t); if (f.length) { const x = rng.pick(bt.rng, f); x.stunned = true; bt.events.push({ t: 'freeze', x: x.x, y: x.y }); } } });
    bondCreate(bt);
    startTurn(bt);
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
    for (let k = 0; k < s.stormZap; k++) { const f = alive(b, foe); if (f.length) { const t = rng.pick(b.rng, f); b.events.push({ t: 'zap', x: t.x, y: t.y }); dealDamage(b, t, s.stormDmg, null, 'zap'); } }
    if (s.gravity) { b.events.push({ t: 'pull', x: 0, y: 0, r: b.R }); shift(b, foe, 0, 0, s.gravity * 0.15); }
    if (b.env.storm) { const a = rng.range(b.rng, 0, 6.283), rr = rng.range(b.rng, 0, 0.5), x = Math.cos(a) * rr * b.hw, y = Math.sin(a) * rr * b.hh; b.events.push({ t: 'pull', x, y, r: b.R * 0.8 }); shift(b, null, x, y, b.env.storm * 0.1); }
    if (b.turn === 0 && b.shotCount > 0 && b.rules.includes('shrink')) { b.hw = Math.max(b.hw0 * 0.65, b.hw - 10); b.hh = Math.max(b.hh0 * 0.65, b.hh - 14); b.R = b.hw; relax(b); b.events.push({ t: 'shrink' }); }
    if (b.affix) affixTurn(b); // ---- 敵人詞綴 ----
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
    b.events.push({ t: 'round', n: b.round, extra: b.round > b.maxRounds });
  }
  function nextTurn(b, last) {
    for (let g = 0; g < 4; g++) {
      const order = last == null ? [0, 1] : [1 - last, last];
      const t = order.find(k => avail(b, k).length);
      if (t != null) { b.turn = t; return startTurn(b); }
      if (b.round <= b.maxRounds) { endRound(b); last = null; continue; }
      refreshShots(b); return finish(b, 1); // 輪數與加時都用完還沒殺光
    }
    finish(b, 1);
  }
  function canMove(b, team) { return avail(b, team).length > 0; }

  function launch(b, idx, angle, power, ult) {
    const x = b.bodies[idx], cfg = C();
    if (!x || !x.alive || x.temp || x.team !== b.turn || b.phase !== 'aim' || !avail(b, b.turn).includes(x)) return false;
    power = Math.max(0, Math.min(1, power));
    if (b.affix) power = affixLaunch(b, x, power); // ---- 敵人詞綴 ----
    const full = power >= cfg.fullPowerAt;
    const sp = power * cfg.maxLaunch * x.speed * (full ? 1 + cfg.fullPowerBonus : 1);
    if (full) b.events.push({ t: 'fullpower', x: x.x, y: x.y });
    const U = cfg.ult;
    x.ultOn = ''; x.ultUsed = 0; x.ultStop = 0;
    let spd = sp;
    if (ult && x.energy >= U.max) { x.energy = 0; x.ultOn = x.ultType; b.events.push({ t: 'ult', x: x.x, y: x.y, name: ((D().ults || {})[x.ultType] || {}).name || '大招', team: x.team }); spd *= ultLaunch(b, x); }
    else x.energy = Math.min(U.max, x.energy + U.gainLaunch);
    x.vx = Math.cos(angle) * spd; x.vy = Math.sin(angle) * spd;
    b.bodies.forEach(y => { y.ringBuff = 0; y.wallHits = 0; y.boomUsed = false; y.burnUsed = false; y.splitDone = false; y.healed = false; y.relaunched = false; if (y.ab && y.ab.type === 'pierce') y.pierceLeft = y.ab.n; });
    b.zones.forEach(z => z.hit = {});
    b.phase = 'moving'; b.mover = idx; b.simT = 0; b.chain = 0; b.hits = 0; b.pending = []; b.ghost = {}; b.echoUsed = false; b.stopDone = false;
    b.events.push({ t: 'launch', i: idx });
    bondLaunch(b, x);
    return true;
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
    const sd = b.sides[tgt.team];
    if (tgt.hp <= 0 && sd.revive > 0 && !tgt.boss) { sd.revive--; tgt.hp = tgt.maxHp * sd.revivePct; tgt.poison = null; b.events.push({ t: 'revive', x: tgt.x, y: tgt.y }); }
    if (tgt.hp <= 0) {
      tgt.hp = 0; tgt.alive = false; tgt.vx = tgt.vy = 0;
      if (!tgt.temp) { b.deaths[tgt.team]++; if (!b.sides[tgt.team].noRevive) tgt.down = true; }
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
    if (sd.blastGold && b.gold < sd.blastGold) b.gold++;
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
    const mult = (1 + per * (Math.min(src.wallHits, src.bounces) + lotStack(b, src))) * (src.ringBuff ? 1.2 : 1), atk = atkOf(src);
    dealDamage(b, tgt, atk * speed / cfg.dmgSpeedRef * mult, src, 'hit');
    b.hits++; src.hitCount++;
    if (tgt.pigQ != null) pigOnHit(b, src, tgt);
    const UC = C().ult; if (!src.temp) src.energy = Math.min(UC.max, src.energy + UC.gainHit); tgt.energy = Math.min(UC.max, tgt.energy + UC.gainHurt);
    if (src.ultOn) ultHit(b, src, tgt, atk);
    const ab = src.ab, sd = b.sides[src.team];
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
    if (kind === 'wall' && b.rules.includes('spikes') && o.team === 0) dealDamage(b, o, o.maxHp * 0.06, null, 'spike');
    if (o.ab && o.ab.type === 'boomerang') { const k = Math.min(1 + o.ab.boost, 1700 / (hyp(o.vx, o.vy) || 1)); o.vx *= k; o.vy *= k; }
    if (o.ab && o.ab.type === 'split' && !o.splitDone && i === b.mover) { o.splitDone = true; spawnShards(b, o); }
  }

  // ---- 物理一步；回傳 true 代表全部停止 ----
  function step(b) {
    const cfg = C(), dt = cfg.dt, bs = b.bodies;
    b.simT += dt;
    const fr = Math.exp(-cfg.friction * (b.env.frictionMul || 1) * dt), ld = cfg.linDecel * (b.env.frictionMul || 1) * dt;
    for (let i = 0; i < bs.length; i++) {
      const o = bs[i]; if (!o.alive) continue;
      o.x += o.vx * dt; o.y += o.vy * dt;
      const sp = hyp(o.vx, o.vy);
      if (sp > 0) {
        const ns = o.fricMul === 1 ? Math.max(0, sp * fr - ld) : Math.max(0, sp * Math.pow(fr, o.fricMul) - ld * o.fricMul);
        o.vx *= ns / sp; o.vy *= ns / sp;
      }
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
      if (z.left <= 0 || !o.alive || o.temp || o.team === z.team || z.hit[o.i]) return;
      if (hyp(o.x - z.x, o.y - z.y) >= z.r + o.r) return;
      z.hit[o.i] = 1;
      if (z.kind === 'mine') { z.left = 0; explode(b, z.x, z.y, z.br, z.dmg, z.team, null, false); }
      else if (z.kind === 'pool') poison(b, o, z.pDmg, z.turns);
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
          if (pa) { pa.pierceLeft--; b.ghost[key] = 1; const t = pa === a ? c : a; onHit(b, pa, t, pa === a ? sa : sc); b.events.push({ t: 'pierce', x: t.x, y: t.y }); continue; }
        }
        const ia = 1 / a.m, ic = 1 / c.m, ov = rr - d;
        a.x -= nx * ov * ia / (ia + ic); a.y -= ny * ov * ia / (ia + ic);
        c.x += nx * ov * ic / (ia + ic); c.y += ny * ov * ic / (ia + ic);
        if (rv >= 0) continue;
        const jm = -(1 + cfg.restitution) * rv / (ia + ic);
        a.vx -= jm * ia * nx; a.vy -= jm * ia * ny; c.vx += jm * ic * nx; c.vy += jm * ic * ny;
        const px = a.x + nx * a.r, py = a.y + ny * a.r;
        b.events.push({ t: 'bump', x: px, y: py, s: Math.max(sa, sc) });
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
          // 撞隊友：被撞方加速（羽毛）、聯動組合技
          if (c.ab && c.ab.type === 'allyBoost' && sa > 100) { c.vx *= c.ab.mult; c.vy *= c.ab.mult; b.events.push({ t: 'boost', x: c.x, y: c.y }); }
          [[a, c, sa], [c, a, sc]].forEach(([h, t, s]) => { const hp = h.ultOn === 'heal' ? 0.4 : (h.ab && h.ab.type === 'healTouch' ? h.ab.pct : 0); if (hp && s > 80 && !t.healed && !t.temp) { t.healed = true; t.hp = Math.min(t.maxHp, t.hp + t.maxHp * hp); b.events.push({ t: 'heal', x: t.x, y: t.y }); } });
          if (a.ab && a.ab.type === 'allyBoost' && sc > 100) { a.vx *= a.ab.mult; a.vy *= a.ab.mult; b.events.push({ t: 'boost', x: a.x, y: a.y }); }
          if (((a.link && a.link === c.id) || (c.link && c.link === a.id)) && !a.temp && !c.temp && Math.max(Math.abs(sa), Math.abs(sc)) > 150) combo(b, a, c, px, py);
        }
      }
    }
    for (let k = b.pending.length - 1; k >= 0; k--) {
      const p = b.pending[k];
      if (b.simT >= p.at) { b.pending.splice(k, 1); explode(b, p.x, p.y, p.r, p.dmg, p.team, bs[p.src], false); }
    }
    const moving = bs.some(o => o.alive && (Math.abs(o.vx) > cfg.stopV || Math.abs(o.vy) > cfg.stopV));
    if (b.simT > cfg.maxSimSec) { bs.forEach(o => { o.vx = o.vy = 0; }); return true; }
    if (!moving) {
      const mv = bs[b.mover];
      if (mv && mv.alive && mv.ultOn && !mv.ultStop && ultStop(b, mv)) return false;
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
          const k = mv.ab.push / Math.sqrt(o.m); o.vx += dx / d * k; o.vy += dy / d * k; dealDamage(b, o, dmg, mv, 'blast');
        });
        return false;
      }
      if (!b.stopDone && mv && mv.alive && mv.ab && mv.ab.type === 'magnetStop') {
        b.stopDone = true; pull(b, mv.x, mv.y, mv.ab.r, mv.ab.pull * (1 + mv.pullMul), mv.team, null, atkOf(mv) * mv.ab.mult, mv); return false;
      }
      bs.forEach(o => { o.vx = o.vy = 0; });
      return b.pending.length === 0;
    }
    return false;
  }

  function alive(b, team) { return b.bodies.filter(o => o.alive && !o.temp && o.team === team); }
  function hpSum(b, team) { return alive(b, team).reduce((s, o) => s + o.hp, 0); }

  // 勝負：對方「總動數」先歸零就贏；不能復活的一方（撲滿）全倒也算輸
  // ---- 大招 ----
  function ultLaunch(b, x) {
    const t = x.ultOn; let k = 1;
    if (t === 'bulwark') { b.bodies.forEach(o => { if (o.alive && !o.temp && o.team === x.team) o.shield += o.maxHp * 0.3; }); x.ultMassMul = 3; x.m *= 3; }
    if (t === 'phase') { x.pierceLeft = 99; k = 1.35; }
    if (t === 'ricochet') { x.wallAdd += 0.5; x.bounces += 6; }
    if (t === 'heal') k = 1.2;
    return k;
  }
  function ultHit(b, src, tgt, atk) {
    const t = src.ultOn;
    if (t === 'nova' && !src.ultUsed) { src.ultUsed = 1; explode(b, tgt.x, tgt.y, 150, atk * 1.6, src.team, src, false); }
    if (t === 'quake' && tgt.alive) { const dx = tgt.x - src.x, dy = tgt.y - src.y, d = hyp(dx, dy) || 1, k = 700 / Math.sqrt(tgt.m); tgt.vx += dx / d * k; tgt.vy += dy / d * k; if (!tgt.boss) { tgt.stunned = true; b.events.push({ t: 'freeze', x: tgt.x, y: tgt.y }); } }
  }
  function ultStop(b, mv) {
    const t = mv.ultOn, atk = atkOf(mv); mv.ultStop = 1;
    if (t === 'vortex') { pull(b, mv.x, mv.y, 330, 650 * (1 + mv.pullMul), mv.team, null, atk * 0.6, mv); return true; }
    if (t === 'plague') { b.events.push({ t: 'pull', x: mv.x, y: mv.y, r: 260 }); b.bodies.forEach(o => { if (o.alive && !o.temp && o.team !== mv.team && hyp(o.x - mv.x, o.y - mv.y) < 260 + o.r) poison(b, o, atk * 0.7 * (1 + (mv.poisonMul || 0)), 3); }); return false; }
    if (t === 'overdrive') { let best = null, bd = 1e9; b.bodies.forEach(o => { if (o.alive && !o.temp && o.team !== mv.team) { const d = hyp(o.x - mv.x, o.y - mv.y); if (d < bd) { bd = d; best = o; } } }); if (best) { const a = Math.atan2(best.y - mv.y, best.x - mv.x); mv.vx = Math.cos(a) * 1100; mv.vy = Math.sin(a) * 1100; b.events.push({ t: 'boost', x: mv.x, y: mv.y }); return true; } }
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
      o.alive = true; o.hp = o.maxHp; o.shield = 0; o.poison = null; o.stunned = false; o.exposed = 0; o.vx = o.vy = 0; o.x = o.sx; o.y = o.sy;
      b.events.push({ t: 'respawn', x: o.x, y: o.y, team: o.team });
    });
    relax(b);
  }

  function endShot(b) {
    const t = b.turn;
    b.shotCount++;
    const mv = b.bodies[b.mover];
    if (mv) { mv.acted = true; b.moves[t]--; ultEnd(mv); }
    if (b.bodies.some(o => o.temp)) { b.bodies = b.bodies.filter(o => !o.temp); b.bodies.forEach((o, i) => o.i = i); }
    b.zones.forEach(z => z.left--); b.zones = b.zones.filter(z => z.left > 0);
    b.bodies.forEach(o => { if (o.team === t && b.round > b.maxRounds) o.stunned = false; o.wallHits = 0; });
    b.phase = 'aim'; b.mover = -1;
    reviveDowned(b);
    if (checkEnd(b)) return;
    nextTurn(b, t);
  }

  // ---- 敵人詞綴 ----
  // b.affix：run.affixExt 產生的純資料＋狀態（lavaN）；每個棋子的詞綴狀態放 o.aff（create 時一次補齊，形狀一致）
  function affixSetup(bt, o) {
    const A = bt.affix = JSON.parse(JSON.stringify(o.eExt.affix)); A.lavaN = 0;
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
    if (A.cheatDeath && tgt.hp <= 0 && !f.cd) { f.cd = 1; tgt.hp = tgt.maxHp * A.cheatDeath; b.events.push({ t: 'revive', x: tgt.x, y: tgt.y }); }
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
    let cut = -1, after = 0, hit = -1, hitPts = null, px = o.x, py = o.y;
    for (let k = 0; k < 1500; k++) {
      const done = step(c);
      if (hit < 0) {
        const j = c.bodies.findIndex((q, n) => n !== idx && !q.temp && q.alive && !q.hopT && (Math.abs(q.vx) > 1 || Math.abs(q.vy) > 1));
        if (j >= 0) { hit = j; hitPts = [[c.bodies[j].x, c.bodies[j].y]]; }
      }
      if (cut < 0 && (hit >= 0 || o.wallHits > Math.max(1, o.bounces))) cut = pts.length;
      if (cut >= 0) { after += Math.hypot(o.x - px, o.y - py); if (hit >= 0) { const q = c.bodies[hit]; hitPts.push([q.x, q.y]); } }
      px = o.x; py = o.y;
      if (k % 2 === 0 || cut >= 0) pts.push([o.x, o.y]);
      if (after > EXTRA || done || !o.alive) break;
    }
    pts.push([o.x, o.y]);
    return { pts, cut: cut < 0 ? pts.length - 1 : cut, hit: hitPts, r: o.r };
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
    if (prize === 'gold' && (team !== 0 || L.gold >= RR.goldCap)) prize = 'none';
    if (prize === 'dmg') L.dmg[team] += p[2];
    if (prize === 'stack') L.stack[team]++;
    if (prize === 'shot') { L.shotN[team]++; b.moves[team]++; b.movesMax[team]++; } // 總動數制：抽中多 1 動
    if (prize === 'gold') L.gold++;
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

  function runShot(b) { let k = 0; while (!step(b) && k++ < 2500); }

  FA.battle = { avail, create, launch, step, endShot, runShot, predict, startTurn, alive, hpSum, traitTiers, dealDamage, canMove, addMods, atkOf, expose,
    factionTiers, emblemMap, unitTraits };
})(globalThis);
