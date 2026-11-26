// 一局流程（參考貨幣戰爭）：開局詞綴 → 投資環境（整局）→ 首個投資策略 → 3 位面節點（戰鬥/遭遇/獎勵/補給/首領）→ 首領後投資策略
(function (g) {
  const FA = g.FA = g.FA || {};
  const D = () => FA.DATA, C = () => FA.DATA.config, RD = () => FA.DATA.run, R = () => FA.rng;
  const ZONES = ['front', 'back', 'bench'];
  const shopIds = () => Object.keys(D().units).filter(id => !D().units[id].noShop);

  function pickN(r, arr, n) { const a = arr.slice(), out = []; while (out.length < n && a.length) out.push(a.splice(R().int(r.rng, a.length), 1)[0]); return out; }

  function newRun(seed, asc) {
    const c = C(), A = RD().ascensions ? RD().ascensions[asc || 0] : { threat: 0, hp: c.squadHp };
    const r = { v: 3, rng: { s: seed | 0 }, plane: 1, step: 0, stage: 0, asc: asc || 0, hp: A.hp, maxHp: A.hp, gold: c.startGold, level: 1, xp: 0, streak: 0,
      front: Array(c.maxFront).fill(null), back: Array(3).fill(null), bench: Array(c.benchSize).fill(null),
      items: [], weapons: [], shop: [], locked: false, uid: 1, over: null, last: null, lastStand: c.lastStand, freeReroll: 0, freeLeft: 0,
      strats: [], threat: A.threat || 0, extraEnemy: 0, env: null, opener: null, node: null, encLv: 0,
      timed: [], futures: [], afterStrat: null, lvPaid: {} };
    r.bossVar = R().int(r.rng, D().enemies.bosses[0].length);
    r.pending = { type: 'opener', options: pickN(r, Object.keys(RD().openers), 3) };
    rollShop(r, true);
    return r;
  }

  // ---- 策略／環境效果彙總（戰鬥與經濟用）----
  function sfx(r) {
    const o = { mods: {}, flawlessGold: 0, income: 0, shots: 0, chainAll: false, echo: null, blastGold: 0, streakAdd: 0, interestAdd: 0, frontAdd: 0, openFreeze: 0, revive: 0, stormZap: 0, interestCap: 0, streakMul: 1, onBossGold: 0 };
    r.strats.forEach(id => {
      const f = RD().strategies[id].fx;
      if (f.mods) FA.battle.addMods(o.mods, f.mods);
      ['income', 'shots', 'frontAdd', 'revive', 'interestAdd', 'streakAdd', 'openFreeze', 'stormZap', 'flawlessGold'].forEach(k => { if (f[k]) o[k] += f[k]; });
      if (f.blastGold) o.blastGold += f.blastGold;
      if (f.echo) o.echo = o.echo ? { r: Math.max(o.echo.r, f.echo.r), mult: o.echo.mult + f.echo.mult } : Object.assign({}, f.echo);
      if (f.chainAll) o.chainAll = true;
      if (f.interestCap) o.interestCap = Math.max(o.interestCap, f.interestCap);
      if (f.streakMul) o.streakMul *= f.streakMul;
      if (f.onBoss) o.onBossGold += f.onBoss.gold;
    });
    return o;
  }
  const efx = r => (r.env && RD().envs[r.env].fx) || {};
  // 策略效果 → battle.create 的 pExt／eExt
  const battleExt = s => ({ mods: s.mods, shots: s.shots, chainAll: s.chainAll, revive: s.revive, echo: s.echo, blastGold: s.blastGold, openFreeze: s.openFreeze, stormZap: s.stormZap });

  const lv = r => { const L = C().levels[r.level - 1]; return { front: Math.min(C().maxFront, L.front + sfx(r).frontAdd), back: L.back }; };
  const unitAt = (r, l) => r[l.zone][l.i];
  const unitCost = (r, id) => Math.max(1, D().units[id].cost + (efx(r).costAdd || 0));
  // 傳入 r 時，降價環境（拍賣行）照降價後價格回收，避免低買高賣
  const sellPrice = (u, r) => (r ? Math.min(D().units[u.id].cost, unitCost(r, u.id)) : D().units[u.id].cost) * Math.pow(3, u.star - 1) - (u.star > 1 ? 1 : 0);
  const steps = r => RD().planes[r.plane - 1].steps;
  const isBoss = r => steps(r)[r.step] === 'boss';

  function rollShop(r, force) {
    if (r.locked && !force) return;
    const c = C(), odds = c.odds[r.level - 1], ids = shopIds();
    r.shop = [];
    for (let k = 0; k < c.shopSize; k++) {
      let x = R().next(r.rng) * 100, cost = 1;
      for (let i = 0; i < 5; i++) { if (x < odds[i]) { cost = i + 1; break; } x -= odds[i]; }
      let pool = ids.filter(id => D().units[id].cost === cost);
      while (!pool.length && cost > 1) { cost--; pool = ids.filter(id => D().units[id].cost === cost); }
      r.shop.push(R().pick(r.rng, pool));
    }
  }

  function reroll(r) {
    if (r.freeLeft > 0) { r.freeLeft--; rollShop(r, true); return true; }
    if (r.gold < C().rerollCost) return false; r.gold -= C().rerollCost; rollShop(r, true); return true;
  }
  function buyXp(r) { if (r.gold < C().xpCost || r.level >= C().levels.length) return false; r.gold -= C().xpCost; addXp(r, C().xpGain); return true; }
  function addXp(r, n) {
    r.xp += n; while (r.level < C().levels.length && r.xp >= C().levels[r.level].xp) r.level++;
    r.strats.forEach(id => { const f = RD().strategies[id].fx.atLevel; if (f && r.level >= f.lv && !r.lvPaid[id]) { r.lvPaid[id] = 1; r.gold += f.gold; } });
  }

  function count(r, id, star) { let n = 0; ZONES.forEach(z => r[z].forEach(u => { if (u && u.id === id && u.star === star) n++; })); return n; }

  function absorb(r, keep, others) {
    const items = keep.items.concat(...others.map(o => o.items));
    keep.items = items.slice(0, C().maxItems); r.items.push(...items.slice(C().maxItems));
    others.forEach(o => { if (o.weapon) { if (!keep.weapon) keep.weapon = o.weapon; else r.weapons.push(o.weapon); } });
  }

  function addUnit(r, id, star) {
    const slot = r.bench.indexOf(null);
    if (slot < 0) { r.gold += D().units[id].cost * Math.pow(3, star - 1); return false; }
    r.bench[slot] = { uid: r.uid++, id, star, items: [], weapon: null }; merge(r); return true;
  }

  function buy(r, i) {
    const id = r.shop[i]; if (!id) return false;
    const cost = unitCost(r, id); if (r.gold < cost) return false;
    const slot = r.bench.indexOf(null);
    if (slot < 0 && count(r, id, 1) < 2) return false;
    r.gold -= cost; r.shop[i] = null;
    if (slot < 0) {
      const locs = []; ZONES.forEach(z => r[z].forEach((x, k) => { if (x && x.id === id && x.star === 1) locs.push({ zone: z, i: k }); }));
      const keep = unitAt(r, locs[0]), o = unitAt(r, locs[1]);
      r[locs[1].zone][locs[1].i] = null; keep.star = 2; absorb(r, keep, [o]); merge(r);
    } else { r.bench[slot] = { uid: r.uid++, id, star: 1, items: [], weapon: null }; merge(r); }
    return true;
  }

  function merge(r) {
    let again = true;
    while (again) {
      again = false;
      const groups = {};
      ZONES.forEach(z => r[z].forEach((u, i) => { if (u && u.star < 3) (groups[u.id + '_' + u.star] = groups[u.id + '_' + u.star] || []).push({ zone: z, i }); }));
      for (const k in groups) {
        const gq = groups[k]; if (gq.length < 3) continue;
        const keep = unitAt(r, gq[0]), others = [gq[1], gq[2]].map(l => unitAt(r, l));
        others.forEach((o, n) => { r[gq[n + 1].zone][gq[n + 1].i] = null; });
        keep.star++; absorb(r, keep, others); again = true; break;
      }
    }
  }

  function sell(r, l) {
    const u = unitAt(r, l); if (!u) return false;
    r.gold += sellPrice(u, r); r.items.push(...u.items); if (u.weapon) r.weapons.push(u.weapon); r[l.zone][l.i] = null; return true;
  }

  function slotOk(r, l) {
    if (l.zone === 'front') return l.i < lv(r).front;
    if (l.zone === 'back') return l.i < lv(r).back;
    return l.i < C().benchSize;
  }
  function move(r, a, b) {
    if (!slotOk(r, b) || !slotOk(r, a)) return false;
    const x = unitAt(r, a), y = unitAt(r, b);
    r[a.zone][a.i] = y; r[b.zone][b.i] = x; return true;
  }

  function makeItem(r, id) {
    const I = D().items[id], rolls = {};
    for (const k in I.affix) {
      const [a, b] = I.affix[k], v = R().range(r.rng, a, b);
      rolls[k] = (Number.isInteger(a) && Number.isInteger(b)) ? Math.round(v) : Math.round(v * 100) / 100;
    }
    return { id, rolls };
  }
  const randomBase = r => R().pick(r.rng, Object.keys(D().items).filter(k => D().items[k].tier === 'base'));
  const randomWeapon = r => R().pick(r.rng, Object.keys(D().weapons));

  function equip(r, itemIdx, l) {
    const u = unitAt(r, l), it = r.items[itemIdx]; if (!u || !it) return false;
    if (D().items[it.id].tier === 'base') {
      for (const aid in D().items) {
        const A = D().items[aid]; if (!A.recipe) continue;
        const need = A.recipe.slice(), pi = need.indexOf(it.id); if (pi < 0) continue; need.splice(pi, 1);
        const hi = u.items.findIndex(x => x.id === need[0]);
        if (hi >= 0) { u.items.splice(hi, 1); u.items.push(makeItem(r, aid)); r.items.splice(itemIdx, 1); return 'combine'; }
      }
    }
    if (u.items.length >= C().maxItems) return false;
    u.items.push(it); r.items.splice(itemIdx, 1); return true;
  }
  function equipWeapon(r, wi, l) {
    const u = unitAt(r, l), w = r.weapons[wi]; if (!u || !w) return false;
    r.weapons.splice(wi, 1); if (u.weapon) r.weapons.push(u.weapon); u.weapon = w; return true;
  }

  // ---- 通用效果 ----
  function applyFx(r, f) {
    if (!f) return;
    if (f.gold) r.gold = Math.max(0, r.gold + f.gold);
    if (f.xp) addXp(r, f.xp);
    if (f.lastStand) r.lastStand += f.lastStand;
    if (f.heal) r.hp = Math.min(r.maxHp || C().squadHp, r.hp + f.heal);
    if (f.freeReroll) { r.freeReroll += f.freeReroll; r.freeLeft += f.freeReroll; }
    if (f.freeRerolls) r.freeLeft += f.freeRerolls;
    if (f.swapHpGold) { const mx = r.maxHp || C().squadHp, hp = r.hp, gold = r.gold; r.hp = Math.max(1, Math.min(mx, gold)); r.gold = hp + Math.max(0, gold - mx); }
    for (let k = 0; k < (f.weapon || 0) + (f.weapons || 0); k++) r.weapons.push(randomWeapon(r));
    for (let k = 0; k < (f.item || 0) + (f.items || 0); k++) r.items.push(makeItem(r, randomBase(r)));
    for (let k = 0; k < (f.unit2 || 0); k++) addUnit(r, R().pick(r.rng, shopIds().filter(i => D().units[i].cost <= 2)), 2);
    const give = (cost, n, star) => { for (let k = 0; k < n; k++) addUnit(r, R().pick(r.rng, shopIds().filter(i => D().units[i].cost === cost)), star || 1); };
    if (f.units) give(f.units.cost, f.units.n, f.units.star);
    if (f.units2) f.units2.forEach(([c, n]) => give(c, n, 1));
  }

  function strategyOptions(r, forceTier) {
    const T = RD().tiers, S = RD().strategies, out = [], bias = efx(r).tierBias;
    const chance = { silver: T.silver.chance, gold: T.gold.chance, prism: T.prism.chance };
    if (bias === 'gold') { chance.silver = 30; chance.gold = 62; chance.prism = 8; }
    if (bias === 'prism') { chance.silver = 30; chance.gold = 35; chance.prism = 35; }
    const nOpt = efx(r).stratOptions || 3;
    if (bias === 'silver') { chance.silver = 100; chance.gold = 0; chance.prism = 0; }
    for (let k = 0; k < nOpt; k++) {
      let tier = forceTier;
      if (!tier) { let x = R().next(r.rng) * 100; tier = 'silver'; for (const t of ['silver', 'gold', 'prism']) { if (x < chance[t]) { tier = t; break; } x -= chance[t]; } }
      let pool = Object.keys(S).filter(id => S[id].tier === tier && !r.strats.includes(id) && !out.includes(id));
      if (!pool.length) pool = Object.keys(S).filter(id => !r.strats.includes(id) && !out.includes(id));
      if (pool.length) out.push(R().pick(r.rng, pool));
    }
    return out;
  }
  const askStrategy = (r, tier) => { r.pending = { type: 'strategy', options: strategyOptions(r, tier), tier: tier || null }; };

  function nodeOptions(r) {
    const fixed = steps(r)[r.step], sw = efx(r).planeSwap;
    const swap = k => (sw && r.plane === sw.plane && k === sw.from ? sw.to : k);
    if (fixed) return [swap(fixed)];
    const w = RD().nodeWeights, keys = Object.keys(w), tot = keys.reduce((s, k) => s + w[k], 0);
    const roll = () => { let x = R().next(r.rng) * tot; for (const k of keys) { if (x < w[k]) return k; x -= w[k]; } return 'battle'; };
    const a = swap(roll()); let b = swap(roll()), guard = 0; while (b === a && guard++ < 8) b = swap(roll());
    return a === b ? [a] : [a, b];
  }

  function advance(r) { r.pending = { type: 'path', options: nodeOptions(r) }; }

  // 回傳 'battle' 代表要開戰
  function choose(r, i) {
    const p = r.pending; if (!p) return null;
    const id = p.options[i];
    r.pending = null;
    if (p.type === 'opener') { r.opener = id; applyFx(r, RD().openers[id].fx); if (RD().openers[id].fx.bonusPick) r.futures.push({ at: 0, tier: RD().openers[id].fx.bonusPick }); r.pending = { type: 'env', options: pickN(r, Object.keys(RD().envs), 3) }; }
    else if (p.type === 'env') { r.env = id; askStrategy(r); }
    else if (p.type === 'path') {
      if (id === 'supply') r.pending = { type: 'supply', options: pickN(r, Object.keys(RD().supplies), 3) };
      else if (id === 'encounter') r.pending = { type: 'encounter', options: RD().encounter.map((_, k) => k) };
      else { r.node = id; if (id === 'boss') r.gold += sfx(r).onBossGold; return 'battle'; }
    }
    else if (p.type === 'encounter') { r.node = 'encounter'; r.encLv = id; return 'battle'; }
    else if (p.type === 'supply') { applyFx(r, RD().supplies[id].fx); r.node = 'supply'; finishNode(r, null); }
    else if (p.type === 'strategy') {
      const S = RD().strategies[id], T = RD().tiers[S.tier];
      r.strats.push(id); r.threat += T.threat; r.extraEnemy += T.extraEnemy;
      applyFx(r, S.fx);
      if (S.fx.perNode) r.timed.push(Object.assign({ src: id }, S.fx.perNode));
      if (S.fx.future) r.futures.push({ at: r.stage + S.fx.future.after, tier: S.fx.future.tier });
      if (S.fx.pickNow) askStrategy(r, S.fx.pickNow);
      else afterStrategies(r);
    }
    return null;
  }

  function afterStrategies(r) {
    if (r.pending) return;
    const due = r.futures.findIndex(f => r.stage >= f.at);
    if (due >= 0) { const f = r.futures.splice(due, 1)[0]; return askStrategy(r, f.tier); }
    if (r.afterStrat === 'nextPlane') { r.afterStrat = null; r.plane++; r.step = 0; r.bossVar = R().int(r.rng, D().enemies.bosses[r.plane - 1].length); }
  }

  // ---- 敵人 ----
  function enemyTeam(r) {
    const E = D().enemies, node = r.node, enc = node === 'encounter' ? RD().encounter[r.encLv] : null;
    const st = r.stage + 1 + (enc ? enc.add : 0), df = E.difficulty(st);
    if (node === 'reward') {
      const n = Math.min(6, 3 + r.plane);
      return { name: '撲滿', reward: true, rules: [], front: [...Array(n)].map(() => ({ id: 'piggy', star: 1, items: [] })), back: [] };
    }
    const mk = id => {
      const x = R().next(r.rng), star = x < df.star3 ? 3 : x < df.star3 + df.star2 ? 2 : 1;
      const u = { id, star, items: [], weapon: null };
      if (R().next(r.rng) < df.itemChance + (enc ? enc.add * 0.05 : 0)) u.items.push(makeItem(r, randomBase(r)));
      if (enc && enc.add >= 4 && st >= 8) u.weapon = randomWeapon(r);
      return u;
    };
    const a = R().pick(r.rng, E.archetypes);
    let nf = df.front + r.extraEnemy + (enc ? enc.extra : 0);
    if (node === 'boss') {
      const B = E.bosses[r.plane - 1][r.bossVar || 0];
      nf = Math.max(1, df.front - 3 + r.extraEnemy);
      return { name: B.name, boss: true, rules: B.rules,
        front: [{ boss: true, plane: r.plane, variant: r.bossVar || 0, id: 'boss', star: 1, items: [] }].concat(a.front.slice(0, Math.min(5, nf)).map(mk)), back: a.back.slice(0, df.back).map(mk) };
    }
    const fr = []; for (let k = 0; k < Math.min(C().maxFront, nf); k++) fr.push(a.front[k % a.front.length]);
    return { name: (enc ? `遭遇${enc.name}・` : '') + a.name, rules: [], front: fr.map(mk), back: a.back.slice(0, df.back).map(mk) };
  }

  function startBattle(r) {
    const en = enemyTeam(r), s = sfx(r);
    r.enemy = { name: en.name, boss: !!en.boss, rules: en.rules, reward: !!en.reward };
    const front = r.front.slice(0, lv(r).front).filter(Boolean);
    if (!front.length) return null;
    const eExt = en.reward ? { mods: { hpPct: (RD().piggy.hpBase + RD().piggy.hpPerStage * r.stage) / D().units.piggy.hp - 1 } } : { threat: r.threat };
    return FA.battle.create({ pFront: front, pBack: r.back.slice(0, lv(r).back), eFront: en.front, eBack: en.back, rules: en.rules, env: efx(r),
      pExt: battleExt(s), eExt, eNoShots: !!en.reward, extraRounds: en.boss ? C().bossRoundsAdd : 0,
      seed: Math.floor(R().next(r.rng) * 2 ** 31) });
  }

  // 每個節點結束：收入、經驗、持續效果、前進
  function finishNode(r, res, battleNode) {
    const c = C(), s = sfx(r), e = efx(r);
    let cap = c.interestMax + s.interestAdd + (e.interestAdd || 0); if (s.interestCap) cap = Math.max(cap, s.interestCap);
    const interest = Math.min(cap, Math.floor(r.gold / c.interestPer));
    let sb = 0;
    if (battleNode) { c.streak.forEach(([n, v]) => { if (Math.abs(r.streak) >= n) sb = v; }); sb = Math.round((sb + (sb ? s.streakAdd : 0)) * s.streakMul); }
    const inc = c.baseIncome + s.income + (e.incomeAdd || 0);
    r.gold += inc + interest + sb;
    if (res) Object.assign(res, { income: inc, interest, streakBonus: sb });
    r.timed.forEach(t => { if (t.n > 0) { t.n--; if (t.gold) r.gold += t.gold; if (t.xp) addXp(r, t.xp); if (t.rerolls) r.freeLeft += t.rerolls; } });
    r.timed = r.timed.filter(t => t.n > 0);
    addXp(r, c.xpPerRound);
    r.freeLeft += r.freeReroll;
    const wasBoss = r.node === 'boss';
    r.stage++; r.step++; r.node = null;
    if (r.hp <= 0) r.over = 'lose';
    else if (wasBoss) {
      if (r.plane >= RD().planes.length) {
        if (res && res.win === false) { r.step--; res.retry = true; } // 終局首領沒殺光：扣血後回商店重新挑戰
        else r.over = 'win';
      }
      else { r.afterStrat = 'nextPlane'; askStrategy(r); }
    }
    if (!r.over && !r.pending) afterStrategies(r);
    rollShop(r);
  }

  function endBattle(r, b) {
    const c = C(), win = b.winner === 0, e = efx(r), s = sfx(r), node = r.node;
    const res = { win, node, dmg: 0, drops: [], weapons: [], gold: 0 };
    if (node === 'reward') {
      const P = RD().piggy, killed = b.bodies.filter(o => o.team === 1 && !o.alive).length;
      res.gold = killed * P.goldEach; res.pigs = killed;
      if (win) { for (let k = 0; k < (P.allBonus.item || 0); k++) { const it = makeItem(r, randomBase(r)); r.items.push(it); res.drops.push(it); } }
      r.gold += res.gold; finishNode(r, res, false); r.last = res; return res;
    }
    r.streak = win ? Math.max(1, r.streak + 1) : Math.min(-1, r.streak - 1);
    if (!win) {
      const left = FA.battle.alive(b, 1).length, L = c.lossDamage, A = RD().ascensions ? RD().ascensions[r.asc || 0] : { lossAdd: 0 };
      res.dmg = Math.round(L.base + left * L.perEnemy + (r.stage + 1) * L.perStage + (node === 'boss' ? 4 : 0) + A.lossAdd);
      r.hp = Math.max(0, r.hp - res.dmg);
      if (r.hp <= 0 && r.lastStand > 0) { r.lastStand--; r.hp = 1; res.saved = true; }
    } else {
      res.heal = Math.min(c.winHeal, (r.maxHp || c.squadHp) - r.hp); r.hp += res.heal;
      res.gold = 1 + (e.winGold || 0);
      if (s.flawlessGold && b.bodies.every(o => o.team !== 0 || o.temp || o.alive)) { res.gold += s.flawlessGold; res.flawless = true; }
      let rw = null;
      if (node === 'encounter') rw = RD().encounter[r.encLv].reward;
      if (node === 'boss') rw = { weapon: 1, item: 2 };
      if (!rw && R().next(r.rng) < c.dropChance) rw = { item: 1 };
      if (rw) {
        res.gold += rw.gold || 0;
        for (let k = 0; k < (rw.item || 0); k++) { const it = makeItem(r, randomBase(r)); r.items.push(it); res.drops.push(it); }
        for (let k = 0; k < (rw.weapon || 0); k++) { const w = randomWeapon(r); r.weapons.push(w); res.weapons.push(w); }
        if (rw.strategy) res.stratTier = rw.strategy;
      }
    }
    if (e.battleHeal && r.hp > 0) { const h = Math.min(e.battleHeal, r.maxHp - r.hp); r.hp += h; res.heal = (res.heal || 0) + h; }
    res.gold += b.gold || 0; r.gold += res.gold;
    finishNode(r, res, true);
    if (res.stratTier && !r.over) { if (r.pending) r.futures.push({ at: r.stage, tier: res.stratTier }); else askStrategy(r, res.stratTier); }
    r.last = res;
    return res;
  }

  // ---- 隊伍代碼（匯出／匯入）----
  function exportTeam(r, name) {
    const L = lv(r), pack = u => u && [u.id, u.star, u.weapon || '', u.items.map(it => [it.id, it.rolls])];
    const data = { v: 1, n: name || '對手', f: r.front.slice(0, L.front).filter(Boolean).map(pack), b: r.back.slice(0, L.back).filter(Boolean).map(pack), s: r.strats };
    const json = JSON.stringify(data);
    return typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, 'utf8').toString('base64');
  }
  function importTeam(code) {
    try {
      const json = typeof atob === 'function' ? decodeURIComponent(escape(atob(code.trim()))) : Buffer.from(code.trim(), 'base64').toString('utf8');
      const d = JSON.parse(json), un = a => {
        if (!D().units[a[0]] || D().units[a[0]].noShop) throw 0;
        return { id: a[0], star: Math.max(1, Math.min(3, a[1] | 0)), weapon: D().weapons[a[2]] ? a[2] : null, items: (a[3] || []).filter(x => D().items[x[0]]).slice(0, 3).map(x => ({ id: x[0], rolls: x[1] })) };
      };
      return { name: String(d.n || '對手').slice(0, 12), front: d.f.slice(0, 7).map(un), back: d.b.slice(0, 3).map(un), strats: (d.s || []).filter(s => RD().strategies[s]) };
    } catch (e) { return null; }
  }
  function duelBattle(r, team) {
    const s = sfx(r), mine = r.front.slice(0, lv(r).front).filter(Boolean);
    if (!mine.length || !team.front.length) return null;
    const s2 = sfx({ strats: team.strats });
    return FA.battle.create({ pFront: mine, pBack: r.back.slice(0, lv(r).back), eFront: team.front, eBack: team.back, rules: [], env: {},
      pExt: battleExt(s), eExt: battleExt(s2),
      seed: Math.floor(R().next(r.rng) * 2 ** 31) });
  }

  FA.run = { newRun, rollShop, reroll, buyXp, buy, sell, move, equip, equipWeapon, merge, makeItem, startBattle, endBattle, enemyTeam,
    bossInfo: r => D().enemies.bosses[r.plane - 1][r.bossVar || 0], sellPrice, unitCost, lv, isBoss, steps, unitAt, choose, advance, sfx, efx, nodeOptions,
    exportTeam, importTeam, duelBattle, shopIds };
})(globalThis);
