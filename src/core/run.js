// 一局流程：商店、經濟、升星、裝備、敵人生成、結算
(function (g) {
  const FA = g.FA = g.FA || {};
  const D = () => FA.DATA, C = () => FA.DATA.config, R = () => FA.rng;
  const ZONES = ['front', 'back', 'bench'];

  function newRun(seed) {
    const c = C();
    const r = { v: 1, rng: { s: seed | 0 }, stage: 1, hp: c.squadHp, gold: c.startGold, level: 1, xp: 0, streak: 0,
      front: Array(6).fill(null), back: Array(3).fill(null), bench: Array(c.benchSize).fill(null),
      items: [], shop: [], locked: false, uid: 1, over: null, last: null };
    rollShop(r, true);
    return r;
  }

  const lv = r => C().levels[r.level - 1];
  const unitAt = (r, l) => r[l.zone][l.i];
  const sellPrice = u => D().units[u.id].cost * Math.pow(3, u.star - 1) - (u.star > 1 ? 1 : 0);

  function rollShop(r, force) {
    if (r.locked && !force) return;
    const c = C(), odds = c.odds[r.level - 1], ids = Object.keys(D().units);
    r.shop = [];
    for (let k = 0; k < c.shopSize; k++) {
      let x = R().next(r.rng) * 100, cost = 1;
      for (let i = 0; i < 5; i++) { if (x < odds[i]) { cost = i + 1; break; } x -= odds[i]; }
      let pool = ids.filter(id => D().units[id].cost === cost);
      while (!pool.length && cost > 1) { cost--; pool = ids.filter(id => D().units[id].cost === cost); }
      r.shop.push(R().pick(r.rng, pool));
    }
  }

  function reroll(r) { if (r.gold < C().rerollCost) return false; r.gold -= C().rerollCost; rollShop(r, true); return true; }
  function buyXp(r) {
    if (r.gold < C().xpCost || r.level >= C().levels.length) return false;
    r.gold -= C().xpCost; addXp(r, C().xpGain); return true;
  }
  function addXp(r, n) {
    r.xp += n;
    while (r.level < C().levels.length && r.xp >= C().levels[r.level].xp) r.level++;
  }

  function count(r, id, star) { let n = 0; ZONES.forEach(z => r[z].forEach(u => { if (u && u.id === id && u.star === star) n++; })); return n; }

  function buy(r, i) {
    const id = r.shop[i]; if (!id) return false;
    const cost = D().units[id].cost; if (r.gold < cost) return false;
    let slot = r.bench.indexOf(null);
    if (slot < 0 && count(r, id, 1) < 2) return false; // 板凳滿且無法合成
    r.gold -= cost; r.shop[i] = null;
    const u = { uid: r.uid++, id, star: 1, items: [] };
    if (slot < 0) { // 板凳滿：直接和場上兩隻合成
      const locs = []; ZONES.forEach(z => r[z].forEach((x, k) => { if (x && x.id === id && x.star === 1) locs.push({ zone: z, i: k }); }));
      const keep = unitAt(r, locs[0]), o = unitAt(r, locs[1]);
      r[locs[1].zone][locs[1].i] = null; keep.star = 2;
      const items = keep.items.concat(o.items); keep.items = items.slice(0, C().maxItems); r.items.push(...items.slice(C().maxItems));
      merge(r);
    } else { r.bench[slot] = u; merge(r); }
    return true;
  }

  // 3 隻同角色同星 → 升星（優先保留前台位置）
  function merge(r) {
    let again = true;
    while (again) {
      again = false;
      const groups = {};
      ZONES.forEach(z => r[z].forEach((u, i) => { if (u && u.star < 3) (groups[u.id + '_' + u.star] = groups[u.id + '_' + u.star] || []).push({ zone: z, i }); }));
      for (const k in groups) {
        const g = groups[k]; if (g.length < 3) continue;
        const keep = unitAt(r, g[0]), others = [g[1], g[2]].map(l => unitAt(r, l));
        let items = keep.items.concat(...others.map(o => o.items));
        others.forEach((o, n) => { r[g[n + 1].zone][g[n + 1].i] = null; });
        keep.star++; keep.items = items.slice(0, C().maxItems); r.items.push(...items.slice(C().maxItems));
        again = true; break;
      }
    }
  }

  function sell(r, l) {
    const u = unitAt(r, l); if (!u) return false;
    r.gold += sellPrice(u); r.items.push(...u.items); r[l.zone][l.i] = null; return true;
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

  function equip(r, itemIdx, l) {
    const u = unitAt(r, l), it = r.items[itemIdx]; if (!u || !it) return false;
    // 嘗試合成
    if (D().items[it.id].tier === 'base') {
      for (const aid in D().items) {
        const A = D().items[aid]; if (!A.recipe) continue;
        const need = A.recipe.slice(); const pi = need.indexOf(it.id); if (pi < 0) continue; need.splice(pi, 1);
        const hi = u.items.findIndex(x => x.id === need[0]);
        if (hi >= 0) { u.items.splice(hi, 1); u.items.push(makeItem(r, aid)); r.items.splice(itemIdx, 1); return 'combine'; }
      }
    }
    if (u.items.length >= C().maxItems) return false;
    u.items.push(it); r.items.splice(itemIdx, 1); return true;
  }

  function isBoss(stage) { return stage % C().bossEvery === 0; }

  function randomBase(r) { const ids = Object.keys(D().items).filter(k => D().items[k].tier === 'base'); return R().pick(r.rng, ids); }

  function enemyTeam(r) {
    const st = r.stage, df = D().enemies.difficulty(st), E = D().enemies;
    const mk = id => {
      const x = R().next(r.rng), star = x < df.star3 ? 3 : x < df.star3 + df.star2 ? 2 : 1;
      const u = { id, star, items: [] };
      if (R().next(r.rng) < df.itemChance) u.items.push(makeItem(r, randomBase(r)));
      return u;
    };
    if (isBoss(st)) {
      const a = R().pick(r.rng, E.archetypes), n = Math.max(1, df.front - 3);
      return { name: E.boss.name, boss: true, rules: E.boss.rules[st] || ['spikes', 'shrink'],
        front: [{ boss: true, stage: st, id: 'boss', star: 1, items: [] }].concat(a.front.slice(0, n).map(mk)), back: a.back.slice(0, df.back).map(mk) };
    }
    const a = R().pick(r.rng, E.archetypes);
    return { name: a.name, rules: [], front: a.front.slice(0, df.front).map(mk), back: a.back.slice(0, df.back).map(mk) };
  }

  function startBattle(r) {
    const en = enemyTeam(r);
    r.enemy = { name: en.name, boss: !!en.boss, rules: en.rules };
    const front = r.front.slice(0, lv(r).front).filter(Boolean);
    if (!front.length) return null;
    return FA.battle.create({ pFront: front, pBack: r.back.slice(0, lv(r).back), eFront: en.front, eBack: en.back, rules: en.rules,
      seed: Math.floor(R().next(r.rng) * 2 ** 31) });
  }

  function endBattle(r, b) {
    const c = C(), win = b.winner === 0, res = { win, stage: r.stage, boss: isBoss(r.stage), dmg: 0, drops: [] };
    r.streak = win ? Math.max(1, r.streak + 1) : Math.min(-1, r.streak - 1);
    if (!win) {
      const left = FA.battle.alive(b, 1).length, L = c.lossDamage;
      res.dmg = Math.round(L.base + left * L.perEnemy + r.stage * L.perStage);
      r.hp = Math.max(0, r.hp - res.dmg);
    }
    const interest = Math.min(c.interestMax, Math.floor(r.gold / c.interestPer));
    let sb = 0; c.streak.forEach(([n, v]) => { if (Math.abs(r.streak) >= n) sb = v; });
    res.income = c.baseIncome; res.interest = interest; res.streakBonus = sb; res.winBonus = win ? 1 : 0;
    r.gold += c.baseIncome + interest + sb + res.winBonus;
    if (win && (res.boss || R().next(r.rng) < c.dropChance)) {
      const it = makeItem(r, randomBase(r)); r.items.push(it); res.drops.push(it);
      if (res.boss) { const it2 = makeItem(r, randomBase(r)); r.items.push(it2); res.drops.push(it2); }
    }
    addXp(r, c.xpPerRound);
    r.stage++;
    if (r.hp <= 0) r.over = 'lose';
    else if (r.stage > c.battles) r.over = 'win';
    rollShop(r);
    r.last = res;
    return res;
  }

  FA.run = { newRun, rollShop, reroll, buyXp, buy, sell, move, equip, merge, makeItem, startBattle, endBattle, enemyTeam, sellPrice, lv, isBoss, unitAt };
})(globalThis);
