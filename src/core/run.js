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
      front: Array(c.maxFront).fill(null), back: Array(c.maxBack || 3).fill(null), bench: Array(c.benchSize).fill(null),
      items: [], weapons: [], shop: [], locked: false, uid: 1, over: null, last: null, lastStand: c.lastStand, freeReroll: 0, freeLeft: 0,
      strats: [], threat: A.threat || 0, extraEnemy: 0, env: null, opener: null, node: null, encLv: 0,
      timed: [], futures: [], afterStrat: null, lvPaid: {} };
    r.bossVar = R().int(r.rng, D().enemies.bosses[0].length);
    initCons(r, A); // ---- 道具 ----
    r.ecoRng = { s: ((seed | 0) ^ 0x2c1b3c6d) | 0 }; ecoNode(r); // ---- 經濟擴充 ----
    r.pending = { type: 'opener', options: pickN(r, Object.keys(RD().openers), 3) };
    rollAffixes(r, seed); // ---- 敵人詞綴 ----
    rollShop(r, true);
    return r;
  }

  // ---- 敵人詞綴 ----
  // 用獨立亂數（由 seed 衍生），不影響主亂數序列：A0/A1 的局和加入詞綴前完全相同
  const AFX = () => D().enemies.affixes || {};
  function rollAffixes(r, seed) {
    const A = RD().ascensions ? RD().ascensions[r.asc || 0] : null, n = (A && A.affixN) || 0;
    if (seed != null) r.affRng = { s: (seed ^ 0x5f3759df) | 0 };
    if (r.affixRerolls == null) r.affixRerolls = 1;
    r.affixSeen = !n;
    const pool = Object.keys(AFX()).filter(id => !(A && A.affixSoft) || AFX()[id].tier === 'soft');
    const a = pool.slice(), out = [];
    while (out.length < n && a.length) out.push(a.splice(R().int(r.affRng, a.length), 1)[0]);
    r.affixes = out;
    return out;
  }
  // 開局免費重骰（第一場戰鬥前、每局 1 次）
  function rerollAffixes(r) {
    if (!r.affixes || !r.affixes.length || !(r.affixRerolls > 0) || r.stage > 0) return false;
    r.affixRerolls--; const seen = r.affixSeen; rollAffixes(r); r.affixSeen = seen; return true;
  }
  // 詞綴 id 清單 → battle.create 的 eExt.affix（純資料）；ctx: {plane, boss}
  function affixExt(ids, ctx) {
    ctx = ctx || {};
    const o = { ids: [], hpPct: 0, speedPct: 0, bossHp: 0, bossShots: 0, minionHp: 0, minionMass: 0, hitSlow: 0, trauma: 0, traumaCap: 0, cheatDeath: 0, cheatN: 0,
      vsStar1: 0, emptySlotDmg: 0, firstHitSpeed: 0, lowHp: null, cleanse: null, lava: 0, lavaMax: 0, rules: [] };
    (ids || []).forEach(id => {
      const X = AFX()[id]; if (!X) return; const f = X.fx;
      if (f.plane && f.plane !== ctx.plane) return; // 位面強化只在對應位面生效
      if (f.boss && !ctx.boss) return; // 首領強化只在首領戰
      o.ids.push(id);
      if (f.plane) { o.hpPct += f.hpPct || 0; o.speedPct += f.speedPct || 0; }
      if (f.boss) { o.bossHp += f.boss.hpPct || 0; o.bossShots += f.boss.shots || 0; }
      if (f.minion) { o.minionHp += f.minion.hpPct || 0; o.minionMass += f.minion.massPct || 0; }
      if (f.hitSlow) o.hitSlow = Math.max(o.hitSlow, f.hitSlow);
      if (f.trauma) { o.trauma += f.trauma; o.traumaCap = Math.max(o.traumaCap, f.cap || 0.4); }
      if (f.cheatDeath) { o.cheatDeath = Math.max(o.cheatDeath, f.cheatDeath); o.cheatN = Math.max(o.cheatN, f.cheatN || 99); }
      if (f.vsStar1) o.vsStar1 += f.vsStar1;
      if (f.emptySlotDmg) o.emptySlotDmg += f.emptySlotDmg;
      if (f.firstHitSpeed) o.firstHitSpeed += f.firstHitSpeed;
      if (f.lowHp) o.lowHp = Object.assign({}, f.lowHp);
      if (f.cleanse) o.cleanse = Object.assign({}, f.cleanse);
      if (f.lava) { o.lava += f.lava; o.lavaMax = Math.max(o.lavaMax, f.lavaMax || 5); }
      if (f.rules) f.rules.forEach(k => { if (!o.rules.includes(k)) o.rules.push(k); });
    });
    return o.ids.length ? o : null;
  }
  // startBattle 用：把本局詞綴掛到敵隊（撲滿不套用）；尖刺圍欄重用 'spikes' 規則
  function affixEnemy(r, en) {
    if (en.reward || !r.affixes || !r.affixes.length) return;
    const ax = affixExt(r.affixes, { plane: r.plane, boss: !!en.boss }); if (!ax) return;
    en.affix = ax;
    const add = ax.rules.filter(k => !(en.rules || []).includes(k));
    if (add.length) en.rules = (en.rules || []).concat(add);
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

  const lv = r => {
    const L = C().levels[Math.min(r.level, C().levels.length) - 1], mb = C().maxBack || 3;
    while (r.back.length < mb) r.back.push(null); // ---- 經濟擴充 ----：舊存檔後台只有 3 格
    return { front: Math.min(C().maxFront, L.front + sfx(r).frontAdd), back: Math.min(L.back, r.back.length) };
  };
  const unitAt = (r, l) => r[l.zone][l.i];
  const unitCost = (r, id) => Math.max(1, D().units[id].cost + (efx(r).costAdd || 0));
  // 傳入 r 時，降價環境（拍賣行）照降價後價格回收，避免低買高賣
  const sellPrice = (u, r) => (r ? Math.min(D().units[u.id].cost, unitCost(r, u.id)) : D().units[u.id].cost) * Math.pow(3, u.star - 1) - (u.star > 1 ? 1 : 0);
  const steps = r => RD().planes[r.plane - 1].steps;
  const isBoss = r => steps(r)[r.step] === 'boss';

  function rollShop(r, force) {
    if (r.locked && !force) return;
    const c = C();
    r.shop = [];
    for (let k = 0; k < c.shopSize; k++) r.shop.push(rollUnitId(r)); // ---- 經濟擴充 ----：輪崗／概念股權重在 rollUnitId
  }

  function reroll(r) {
    if (r.freeLeft > 0) { r.freeLeft--; rollShop(r, true); rerollQuest(r); return true; }
    if (r.gold < rerollCost(r)) return false; const rc = rerollCost(r); r.gold -= rc; if (rc > 0) r.spentNode = true; rollShop(r, true); rerollQuest(r); return true;
  }
  function buyXp(r) { if (r.gold < C().xpCost || r.level >= C().levels.length) return false; r.gold -= C().xpCost; r.spentNode = true; addXp(r, C().xpGain); return true; }
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
    r.gold -= cost; r.shop[i] = null; r.spentNode = true;
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
    for (let k = 0; k < (f.emblem || 0); k++) r.items.push(makeItem(r, randomEmblem(r)));
    for (let k = 0; k < (f.unit2 || 0); k++) addUnit(r, R().pick(r.rng, shopIds().filter(i => D().units[i].cost <= 2)), 2);
    const give = (cost, n, star) => { for (let k = 0; k < n; k++) addUnit(r, R().pick(r.rng, shopIds().filter(i => D().units[i].cost === cost)), star || 1); };
    if (f.units) give(f.units.cost, f.units.n, f.units.star);
    if (f.units2) f.units2.forEach(([c, n]) => give(c, n, 1));
    if (f.cons) giveCons(r, f.cons); // ---- 道具 ----
  }

  function strategyOptions(r, forceTier, exempt) {
    const T = RD().tiers, S = RD().strategies, out = [], bias = efx(r).tierBias;
    const chance = { silver: T.silver.chance, gold: T.gold.chance, prism: T.prism.chance };
    if (bias === 'gold') { chance.silver = 30; chance.gold = 62; chance.prism = 8; }
    if (bias === 'prism') { chance.silver = 30; chance.gold = 35; chance.prism = 35; }
    const nOpt = efx(r).stratOptions || 3;
    if (bias === 'silver') { chance.silver = 100; chance.gold = 0; chance.prism = 0; }
    for (let k = 0; k < nOpt; k++) {
      let tier = forceTier;
      if (!exempt && hasFx(r, 'lockTier')) tier = hasFx(r, 'lockTier'); // ---- 經濟擴充 ----：遠見
      if (!tier) { let x = R().next(r.rng) * 100; tier = 'silver'; for (const t of ['silver', 'gold', 'prism']) { if (x < chance[t]) { tier = t; break; } x -= chance[t]; } }
      let pool = Object.keys(S).filter(id => S[id].tier === tier && !r.strats.includes(id) && !out.includes(id));
      if (!pool.length) pool = Object.keys(S).filter(id => !r.strats.includes(id) && !out.includes(id));
      if (pool.length) out.push(R().pick(r.rng, pool));
    }
    return out;
  }
  const askStrategy = (r, tier, exempt) => { r.pending = { type: 'strategy', options: strategyOptions(r, tier, exempt), tier: (!exempt && hasFx(r, 'lockTier')) || tier || null }; };

  function nodeOptions(r) {
    const fixed = steps(r)[r.step], sw = efx(r).planeSwap;
    const swap = k => (sw && r.plane === sw.plane && k === sw.from ? sw.to : k);
    if (fixed) return [swap(fixed)];
    const w = RD().nodeWeights, keys = Object.keys(w), tot = keys.reduce((s, k) => s + w[k], 0);
    const roll = () => { let x = R().next(r.rng) * tot; for (const k of keys) { if (x < w[k]) return k; x -= w[k]; } return 'battle'; };
    const a = swap(roll()); let b = swap(roll()), guard = 0; while (b === a && guard++ < 8) b = swap(roll());
    return a === b ? [a] : [a, b];
  }

  function advance(r) {
    if (preBossSupply(r)) return; // ---- 經濟擴充 ----：人身意外險
    r.pending = { type: 'path', options: nodeOptions(r) };
  }

  // 回傳 'battle' 代表要開戰
  function choose(r, i) {
    const p = r.pending; if (!p) return null;
    const id = p.options[i];
    r.pending = null;
    if (p.type === 'armory') { pickArmory(r, p, i); return null; } // ---- 道具 ----
    if (p.type === 'carrier') { pickCarrier(r, p, i); return null; } // ---- 補給 ----
    if (p.type === 'opener') { r.opener = id; applyFx(r, RD().openers[id].fx); if (RD().openers[id].fx.bonusPick) r.futures.push({ at: 0, tier: RD().openers[id].fx.bonusPick }); r.pending = { type: 'env', options: envOptions(r) }; }
    else if (p.type === 'env') { r.env = id; envPicked(r); askStrategy(r); }
    else if (p.type === 'path') {
      if (efx(r).perNodeAtk) r.evoN = (r.evoN || 0) + 1; // ---- 經濟擴充 ----：進化演算法
      if (id === 'supply') r.pending = carrierOn() ? carrierPending(r) : { type: 'supply', options: pickN(r, Object.keys(RD().supplies), 3) }; // ---- 補給 ----
      else if (id === 'encounter') r.pending = { type: 'encounter', options: hasFx(r, 'encMode') === 'diode' ? [0, RD().encounter.length - 1] : RD().encounter.map((_, k) => k) }; // ---- 經濟擴充 ----：二極體
      else { r.node = id; if (id === 'boss') r.gold += sfx(r).onBossGold; return 'battle'; }
    }
    else if (p.type === 'encounter') { r.node = 'encounter'; r.encLv = id; return 'battle'; }
    else if (p.type === 'supply' && p.extra) { applyFx(r, RD().supplies[id].fx); r.pending = { type: 'path', options: nodeOptions(r) }; } // ---- 經濟擴充 ----：人身意外險
    else if (p.type === 'supply') { applyFx(r, RD().supplies[id].fx); r.node = 'supply'; finishNode(r, null); }
    else if (p.type === 'strategy') {
      const S = RD().strategies[id], T = RD().tiers[S.tier];
      const noThreat = hasFx(r, 'noThreat'); // ---- 經濟擴充 ----：遠見之後的策略不再加敵人強度
      r.strats.push(id); if (!noThreat) { r.threat += T.threat; r.extraEnemy += T.extraEnemy; }
      stratPicked(r, S.fx); // ---- 經濟擴充 ----
      applyFx(r, S.fx);
      if (S.fx.perNode) r.timed.push(Object.assign({ src: id }, S.fx.perNode));
      if (S.fx.future) r.futures.push({ at: r.stage + S.fx.future.after, tier: S.fx.future.tier });
      if (S.fx.pickNow) askStrategy(r, S.fx.pickNow, !!S.fx.lockTier);
      else afterStrategies(r);
    }
    return null;
  }

  function afterStrategies(r) {
    if (r.pending) return;
    const due = r.futures.findIndex(f => r.stage >= f.at);
    if (due >= 0) { const f = r.futures.splice(due, 1)[0]; return askStrategy(r, f.tier); }
    if (r.afterStrat === 'nextPlane') { r.afterStrat = null; r.plane++; r.step = 0; r.bossVar = R().int(r.rng, D().enemies.bosses[r.plane - 1].length); planeCons(r); }
  }

  // ---- 敵人 ----
  function enemyTeam(r) {
    const E = D().enemies, node = r.node, enc = node === 'encounter' ? RD().encounter[r.encLv] : null;
    const st = r.stage + 1 + (enc ? enc.add : 0), df = E.difficulty(st);
    if (node === 'reward') {
      const n = RD().piggy.count ? RD().piggy.count[r.plane - 1] : Math.min(6, 3 + r.plane); // ---- 次元撲滿 ----
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
    affixEnemy(r, en); // ---- 敵人詞綴 ----
    r.enemy = { name: en.name, boss: !!en.boss, rules: en.rules, reward: !!en.reward };
    const front = r.front.slice(0, lv(r).front).filter(Boolean);
    if (!front.length) return null;
    const eExt = en.reward ? { mods: { hpPct: (RD().piggy.hpBase + RD().piggy.hpPerStage * r.stage) / D().units.piggy.hp - 1 } } : { threat: r.threat };
    if (en.affix) eExt.affix = en.affix; // ---- 敵人詞綴 ----
    const b = FA.battle.create({ pFront: front, pBack: r.back.slice(0, lv(r).back), eFront: en.front, eBack: en.back, rules: en.rules, env: efx(r),
      pExt: econExt(r, battleExt(s)), eExt, eNoShots: !!en.reward, extraMoves: en.boss ? C().bossMovesAdd : 0,
      seed: Math.floor(R().next(r.rng) * 2 ** 31) });
    if (!en.reward) pinpoint(r, b); // ---- 經濟擴充 ----：定點爆破
    return b;
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
    r.timed.forEach(t => { if (t.n > 0) { t.n--; if (t.gold) r.gold += t.gold; if (t.xp) addXp(r, t.xp); if (t.rerolls) r.freeLeft += t.rerolls; if (t.unit) addUnit(r, t.unit, 1); } });
    econFinish(r, res); // ---- 經濟擴充 ----：存款回報
    r.timed = r.timed.filter(t => t.n > 0);
    addXp(r, c.xpPerRound);
    r.freeLeft += r.freeReroll + (factionFx(r).nodeReroll || 0);
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
    ecoNode(r); // ---- 經濟擴充 ----：輪崗、商店道具格（先於下一個商店）
    rollShop(r);
  }

  function endBattle(r, b) {
    const c = C(), win = b.winner === 0, e = efx(r), s = sfx(r), node = r.node;
    const res = { win, node, dmg: 0, drops: [], weapons: [], gold: 0 };
    if (node === 'reward') {
      const P = RD().piggy, killed = b.bodies.filter(o => o.team === 1 && !o.alive).length;
      res.gold = b.pigGold != null ? b.pigGold + ((b.lot && b.lot.gold) || 0) : killed * P.goldEach; res.pigs = killed;
      if (win) { for (let k = 0; k < (P.allBonus.item || 0); k++) { const it = makeItem(r, randomBase(r)); r.items.push(it); res.drops.push(it); } }
      if (win) rewardCons(r, P.allBonus, res); // ---- 道具 ----
      r.gold += res.gold; finishNode(r, res, false); r.last = res; return res;
    }
    r.streak = win ? Math.max(1, r.streak + 1) : Math.min(-1, r.streak - 1);
    if (!win) {
      const left = b.moves ? Math.ceil(Math.max(0, b.moves[1]) / c.deathCost) : FA.battle.alive(b, 1).length, L = c.lossDamage, A = RD().ascensions ? RD().ascensions[r.asc || 0] : { lossAdd: 0 };
      res.dmg = Math.round(L.base + left * L.perEnemy + (r.stage + 1) * L.perStage + (node === 'boss' ? 4 : 0) + A.lossAdd);
      res.dmg = Math.max(1, res.dmg - (factionFx(r).lossRed || 0));
      if (hasFx(r, 'lossMul')) res.dmg = Math.round(res.dmg * hasFx(r, 'lossMul')); // ---- 經濟擴充 ----：擴張的代價
      r.hp = Math.max(0, r.hp - res.dmg);
      if (r.hp <= 0 && r.lastStand > 0) { r.lastStand--; r.hp = 1; res.saved = true; }
    } else {
      res.heal = Math.min(c.winHeal, (r.maxHp || c.squadHp) - r.hp); r.hp += res.heal;
      res.gold = 1 + (e.winGold || 0);
      if (s.flawlessGold && !(b.deaths && b.deaths[0])) { res.gold += s.flawlessGold; res.flawless = true; }
      let rw = null;
      if (node === 'encounter') rw = RD().encounter[r.encLv].reward;
      if (node === 'boss') rw = RD().bossReward || { weapon: 1, item: 2 };
      if (!rw && R().next(r.rng) < c.dropChance) rw = RD().dropReward || { item: 1 };
      if (rw) {
        res.gold += rw.gold || 0;
        for (let k = 0; k < (rw.item || 0); k++) { const it = makeItem(r, randomBase(r)); r.items.push(it); res.drops.push(it); }
        for (let k = 0; k < (rw.weapon || 0); k++) { const w = randomWeapon(r); r.weapons.push(w); res.weapons.push(w); }
        for (let k = 0; k < (rw.emblem || 0); k++) { const it = makeItem(r, randomEmblem(r)); r.items.push(it); res.drops.push(it); }
        if (rw.strategy) res.stratTier = rw.strategy;
        rewardCons(r, rw, res); // ---- 道具 ----
      }
    }
    if (e.battleHeal && r.hp > 0) { const h = Math.min(e.battleHeal, r.maxHp - r.hp); r.hp += h; res.heal = (res.heal || 0) + h; }
    bondAfterBattle(r, b, res, win);
    bondQuest(r, b, res); // ---- 經濟擴充 ----：人脈進階
    res.gold += b.gold || 0; r.gold += res.gold;
    finishNode(r, res, true);
    if (res.stratTier && !r.over) { if (r.pending) r.futures.push({ at: r.stage, tier: res.stratTier }); else askStrategy(r, res.stratTier); }
    r.last = res;
    return res;
  }

  // ---- 道具 ----
  // r.consumables：道具 id 陣列（舊存檔沒有這欄，一律經 cons(r) 取用）
  const CD = () => D().consumables || {};
  const cons = r => r.consumables || (r.consumables = []);
  function initCons(r, A) { cons(r); if (A && A.wrench && CD()[A.wrench]) r.consumables.push(A.wrench); }
  function giveCons(r, m, out) {
    for (const id in m || {}) for (let k = 0; k < m[id]; k++) if (CD()[id]) { cons(r).push(id); if (out) out.push(id); }
  }
  // 獎勵物件 rw 的 cons:{id:n}、consOne:[候選]（隨機給 1 個）→ 進物品欄，記到 res.cons
  function rewardCons(r, rw, res) {
    if (!rw) return; const out = res ? (res.cons = res.cons || []) : null;
    if (rw.cons) giveCons(r, rw.cons, out);
    if (rw.consOne && rw.consOne.length) giveCons(r, { [R().pick(r.rng, rw.consOne)]: 1 }, out);
  }
  function planeCons(r) { const L = (RD().planeStartCons || {})[r.plane]; if (L) L.forEach(id => giveCons(r, { [id]: 1 })); }
  const consNeeds = id => (CD()[id] || {}).target || 'none';
  // 使用第 ci 個道具。tgt：角色 {zone,i}；裝備 {item:k}（物品欄）或 {zone,i,slot:k}（角色身上）。
  // 回傳 false 或 { ok:true, msg }；武裝箱會設 r.pending = { type:'armory' }
  function useCons(r, ci, tgt) {
    const id = cons(r)[ci], X = CD()[id]; if (!X) return false;
    const fail = msg => ({ ok: false, msg });
    if (X.act === 'pick') {
      if (r.pending) return fail('先完成目前的選擇');
      const pool = Object.keys(D().items).filter(k => D().items[k].tier === X.tier);
      r.pending = { type: 'armory', options: pickN(r, pool, X.pick || 3), src: id };
      r.consumables.splice(ci, 1); return { ok: true, msg: X.name + '打開了' };
    }
    if (X.act === 'reforge') {
      const u = tgt && tgt.zone ? unitAt(r, tgt) : null, list = u ? u.items : r.items, k = u ? tgt.slot : tgt && tgt.item;
      const it = list && k != null ? list[k] : null; if (!it) return fail('請選 1 件裝備');
      const tier = D().items[it.id].tier, pool = Object.keys(D().items).filter(x => D().items[x].tier === tier);
      const others = pool.filter(x => x !== it.id), nid = R().pick(r.rng, others.length ? others : pool);
      list[k] = makeItem(r, nid); r.consumables.splice(ci, 1);
      return { ok: true, msg: `${D().items[it.id].name} → ${D().items[nid].name}`, item: list[k] };
    }
    const u = tgt && tgt.zone ? unitAt(r, tgt) : null; if (!u) return fail('請選 1 隻角色');
    if (X.act === 'clone') {
      if (D().units[u.id].cost > (X.maxCost || 99)) return fail(`只能用在 ≤${X.maxCost} 費角色`);
      if (r.bench.indexOf(null) < 0) return fail('備戰區沒有空位');
      r.consumables.splice(ci, 1); addUnit(r, u.id, 1); return { ok: true, msg: '複製了 ' + D().units[u.id].name };
    }
    if (X.act === 'strip') {
      if (!u.items.length && !u.weapon) return fail('這隻沒有裝備');
      r.items.push(...u.items); u.items = []; if (u.weapon) { r.weapons.push(u.weapon); u.weapon = null; }
      if (!X.reusable) r.consumables.splice(ci, 1);
      return { ok: true, msg: '裝備已拆回物品欄' };
    }
    return false;
  }
  function pickArmory(r, p, i) { const id = p.options[i]; if (id && D().items[id]) r.items.push(makeItem(r, id)); }
  // ---- 補給 ----
  // 選人帶裝：選項 { u:角色id, it:裝備 } 或 { sup:'heal'|'gold' }（保底）
  const carrierOn = () => RD().supplyMode && RD().supplyMode.mode === 'carrier';
  function rollUnitId(r) { // 依目前等級的商店機率抽 1 隻（只抽商店可買的）；---- 經濟擴充 ----：輪崗費用 ×2、概念股羈絆權重
    const odds = shopOdds(r), ids = shopIds(), tot = odds.reduce((a, b) => a + b, 0);
    let x = R().next(r.rng) * tot, cost = 1;
    for (let i = 0; i < 5; i++) { if (x < odds[i]) { cost = i + 1; break; } x -= odds[i]; }
    let pool = ids.filter(id => D().units[id].cost === cost);
    while (!pool.length && cost > 1) { cost--; pool = ids.filter(id => D().units[id].cost === cost); }
    const cc = efx(r).concept;
    if (cc && pool.some(id => D().units[id].traits.includes(cc.trait))) {
      const w = id => (D().units[id].traits.includes(cc.trait) ? cc.w : 1), sum = pool.reduce((a, id) => a + w(id), 0);
      let y = R().next(r.rng) * sum; for (const id of pool) { if (y < w(id)) return id; y -= w(id); } return pool[pool.length - 1];
    }
    return R().pick(r.rng, pool);
  }
  function carrierOptions(r) {
    const M = RD().supplyMode, out = [], seen = [];
    for (let k = 0, g = 0; k < (M.n || 4) && g < 40; g++) { const id = rollUnitId(r); if (seen.includes(id) && g < 30) continue; seen.push(id); out.push({ u: id, it: makeItem(r, randomBase(r)) }); k++; }
    const fb = (M.fallback || ['heal', 'gold']).filter(k => RD().supplies[k]);
    if (fb.length) out.push({ sup: R().pick(r.rng, fb) });
    return out;
  }
  function carrierPending(r) { return { type: 'carrier', options: carrierOptions(r), rerolls: RD().supplyMode.rerolls == null ? 1 : RD().supplyMode.rerolls }; }
  const carrierRerollCost = () => RD().supplyMode.rerollCost || 2;
  function rerollCarrier(r) {
    const p = r.pending; if (!p || p.type !== 'carrier' || !(p.rerolls > 0) || r.gold < carrierRerollCost()) return false;
    r.gold -= carrierRerollCost(); r.spentNode = true; p.rerolls--; p.options = carrierOptions(r); return true;
  }
  function pickCarrier(r, p, i) {
    const o = p.options[i]; if (!p.extra) r.node = 'supply';
    if (o && o.sup) applyFx(r, RD().supplies[o.sup].fx);
    else if (o && o.u) {
      const slot = r.bench.indexOf(null);
      if (slot < 0) { r.gold += D().units[o.u].cost; r.items.push(o.it); } // 備戰區滿：退錢、裝備進物品欄
      else { r.bench[slot] = { uid: r.uid++, id: o.u, star: 1, items: o.it ? [o.it] : [], weapon: null }; merge(r); }
    }
    if (p.extra) { r.pending = { type: 'path', options: nodeOptions(r) }; return; } // ---- 經濟擴充 ----：人身意外險的額外補給不算節點
    finishNode(r, null);
  }
  // ---- 徽章 ----：併進 items（tier:'emblem'，不進基礎裝備池、不參與合成）
  (function () { const E = D().emblems || {}; for (const id in E) if (!D().items[id]) D().items[id] = E[id]; })();
  const randomEmblem = r => R().pick(r.rng, Object.keys(D().emblems));

  // ---- 陣營 ----：上場（前台＋後台）陣營加成的 fx 合計
  const teamUnits = r => r.front.slice(0, lv(r).front).concat(r.back.slice(0, lv(r).back)).filter(Boolean);
  function factionFx(r) {
    const ft = FA.battle.factionTiers(teamUnits(r).map(u => u.id)), o = {};
    for (const k in ft.active) { const t = ft.active[k]; if (t) for (const f in t.fx) o[f] = (o[f] || 0) + t.fx[f]; }
    return o;
  }
  const rerollCost = r => Math.max(0, C().rerollCost - (factionFx(r).rerollOff || 0));
  // 戰後：衛隊勝利多回血、工坊掉裝備／金幣、羈絆抽獎的金幣
  function bondAfterBattle(r, b, res, win) {
    const f = factionFx(r);
    if (win && f.winHeal && r.hp > 0) { const h = Math.min(f.winHeal, (r.maxHp || C().squadHp) - r.hp); r.hp += h; res.heal = (res.heal || 0) + h; }
    if (f.drop && R().next(r.rng) < f.drop) { const it = makeItem(r, randomBase(r)); r.items.push(it); res.drops.push(it); res.workshop = true; }
    if (f.gold) res.gold += f.gold;
    if (b.lot && b.lot.gold) { res.gold += b.lot.gold; res.lotGold = b.lot.gold; }
  }

  // ---- 經濟擴充 ----（C1 投資策略、C2 投資環境、C3 商店道具格、C7 等級）
  // 狀態欄位（舊存檔沒有，一律以預設值讀）：ecoRng 獨立亂數（輪崗／道具格，不擾動主亂數）、rotCost 輪崗費用、shopCons 商店道具格 {id,price}
  //   spentNode 本節點有花錢、evoN 進化層數、rerollN/rqDone 二手市場、bondQ 人脈進階 {need,gold,cons,step,goldStep}、insDone 意外險已給的位面、econNotes 給 UI 的提示
  (function () { // 概念股：依羈絆自動產生 c_<羈絆>
    const T = D().traits || {};
    for (const k in T) if (!RD().envs['c_' + k]) RD().envs['c_' + k] = { name: T[k].name + '概念股', concept: true,
      desc: `開局送 1 隻${T[k].name} 1～2 費角色＋簡易武裝箱；整局${T[k].name}角色在商店出現的權重 ×1.8`,
      fx: { concept: { trait: k, w: 1.8 }, unitTrait: { trait: k, cost: [1, 2] }, cons: { armory: 1 } } };
  })();
  const eco = r => r.ecoRng || (r.ecoRng = { s: ((r.rng.s | 0) ^ 0x2c1b3c6d) | 0 });
  const note = (r, t) => (r.econNotes = r.econNotes || []).push(t);
  function hasFx(r, k) { for (const id of r.strats || []) { const S = RD().strategies[id]; if (S && S.fx[k] != null) return S.fx[k]; } return null; }
  function envOptions(r) { // 概念股在選項裡最多 1 個
    const E = RD().envs, keys = Object.keys(E), con = keys.filter(k => E[k].concept);
    return pickN(r, keys.filter(k => !E[k].concept).concat(con.length ? [R().pick(eco(r), con)] : []), 3);
  }
  function envPicked(r) {
    const f = efx(r);
    if (f.unitTrait) {
      const [a, b] = f.unitTrait.cost, pool = shopIds().filter(id => D().units[id].traits.includes(f.unitTrait.trait) && D().units[id].cost >= a && D().units[id].cost <= b);
      if (pool.length) addUnit(r, R().pick(r.rng, pool), 1);
    }
    if (f.cons) giveCons(r, f.cons);
    ecoNode(r);
    if (f.concept || f.rotateCost) rollShop(r, true); // 第一個商店套用新權重
  }
  function shopOdds(r) {
    const odds = C().odds[Math.min(r.level, C().odds.length) - 1].slice(), m = efx(r).rotateCost;
    if (m && r.rotCost) odds[r.rotCost - 1] *= m;
    return odds;
  }
  function ecoNode(r) { // 每個節點開始：輪崗換費用、商店道具格
    const odds = C().odds[Math.min(r.level, C().odds.length) - 1], m = efx(r).rotateCost;
    if (m) { const cs = [1, 2, 3, 4, 5].filter(c => odds[c - 1] > 0); r.rotCost = R().pick(eco(r), cs); } else r.rotCost = 0;
    const SC = C().shopCons;
    if (SC && !(r.locked && r.shopCons)) {
      const ids = Object.keys(SC.pool || {}).filter(id => CD()[id]);
      r.shopCons = ids.length && R().next(eco(r)) < SC.chance ? (id => ({ id, price: SC.pool[id] }))(R().pick(eco(r), ids)) : null;
    }
  }
  function buyShopCons(r) {
    const sc = r.shopCons; if (!sc || r.gold < sc.price) return false;
    r.gold -= sc.price; r.spentNode = true; giveCons(r, { [sc.id]: 1 }); r.shopCons = null; return true;
  }
  function stratPicked(r, f) {
    if (f.valueInv) {
      const v = f.valueInv, id = R().pick(r.rng, shopIds().filter(i => D().units[i].cost === v.cost));
      addUnit(r, id, v.star || 2); r.timed.push({ src: 'g_value', unit: id, n: v.n });
    }
    if (f.sellAll) {
      let g = 0;
      ZONES.forEach(z => r[z].forEach((u, i) => { if (!u) return; g += sellPrice(u, r) * f.sellAll; r.items.push(...u.items); if (u.weapon) r.weapons.push(u.weapon); r[z][i] = null; }));
      r.gold += g; note(r, `大裁員：賣出全部角色 +${g} 金`);
    }
    if (f.bondQuest) r.bondQ = Object.assign({}, f.bondQuest);
  }
  function preBossSupply(r) {
    if (!efx(r).preBossSupply || steps(r)[r.step] !== 'boss') return false;
    const done = r.insDone || (r.insDone = {}); if (done[r.plane]) return false;
    done[r.plane] = 1;
    r.pending = carrierOn() ? Object.assign(carrierPending(r), { extra: true }) : { type: 'supply', options: pickN(r, Object.keys(RD().supplies), 3), extra: true };
    return true;
  }
  function activeTraitN(r) {
    const us = teamUnits(r), tt = FA.battle.traitTiers(us.map(u => u.id), FA.battle.emblemMap(us));
    return Object.keys(tt.active).filter(k => tt.active[k]).length;
  }
  // pExt 加上：進化演算法、團隊力量·銀（攻擊）；dmgTaken／lowStarDmg 交給 battle.js（尚未支援時無效果）
  function econExt(r, ext) {
    const mods = FA.battle.addMods({}, ext.mods), pt = hasFx(r, 'perTrait');
    let atk = (efx(r).perNodeAtk || 0) * (r.evoN || 0);
    if (pt && pt.atkPct) atk += pt.atkPct * activeTraitN(r);
    if (atk) mods.atkPct = (mods.atkPct || 0) + atk;
    const o = Object.assign({}, ext, { mods });
    let dt = 0; (r.strats || []).forEach(id => { dt += RD().strategies[id].fx.dmgTaken || 0; }); if (dt) o.dmgTaken = dt;
    const ls = hasFx(r, 'lowStarDmg'); if (ls) o.lowStarDmg = ls;
    return o;
  }
  function econAtk(r) { const m = econExt(r, { mods: {} }).mods; return m.atkPct || 0; } // UI 顯示用
  function pinpoint(r, b) { // 定點爆破：開打時直接扣生命最高敵人的血（不致死，留 1 血）
    const f = hasFx(r, 'pinpoint'); if (!f || !b) return;
    const es = b.bodies.filter(o => o.team === 1 && o.alive && !o.temp); if (!es.length) return;
    const t = es.reduce((a, o) => (o.hp > a.hp ? o : a), es[0]), amt = Math.min(t.hp - 1, t.maxHp * (t.boss ? f.bossPct : f.pct));
    if (amt <= 0) return;
    t.hp -= amt; b.pinpoint = { i: t.i, amt };
    b.events.push({ t: 'dmg', x: t.x, y: t.y, amt, kind: 'blast', team: 1 });
  }
  function econFinish(r, res) { // finishNode 內：存款回報
    const n = hasFx(r, 'saveRerolls');
    if (n && !r.spentNode) { r.freeLeft += n; if (res) res.saveRerolls = n; note(r, `存款回報：+${n} 次免費刷新`); }
    r.spentNode = false;
  }
  function rerollQuest(r) {
    const q = efx(r).rerollQuest; if (!q || r.rqDone) return;
    r.rerollN = (r.rerollN || 0) + 1;
    if (r.rerollN >= q.n) { r.rqDone = true; r.gold += q.gold || 0; giveCons(r, q.cons); note(r, `二手市場：刷新 ${q.n} 次，+${q.gold} 金＋員工投影儀`); }
  }
  function bondQuest(r, b, res) {
    const q = r.bondQ; if (!q || !b || !b.sides) return;
    const n = Object.keys(b.sides[0].traits || {}).filter(k => b.sides[0].traits[k]).length;
    if (n < q.need) return;
    res.gold += q.gold; rewardCons(r, { cons: q.cons }, res);
    res.bond = { n, need: q.need, gold: q.gold }; note(r, `人脈進階：啟動 ${n} 個羈絆，+${q.gold} 金`);
    q.need += q.step || 1; q.gold += q.goldStep || 0;
  }
  const takeNotes = r => { const a = r.econNotes || []; r.econNotes = []; return a; };

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
        return { id: a[0], star: Math.max(1, Math.min(3, a[1] | 0)), weapon: D().weapons[a[2]] ? a[2] : null, items: (Array.isArray(a[3]) ? a[3] : []).map(x => Array.isArray(x) && cleanItem({ id: x[0], rolls: x[1] }, true)).filter(Boolean).slice(0, 3) }; // 詞條夾在範圍內（防竄改代碼）
      };
      return { name: String(d.n || '對手').slice(0, 12), front: d.f.slice(0, 7).map(un), back: d.b.slice(0, C().maxBack || 3).map(un), strats: (d.s || []).filter(s => RD().strategies[s]) };
    } catch (e) { return null; }
  }
  function duelBattle(r, team) {
    const s = sfx(r), mine = r.front.slice(0, lv(r).front).filter(Boolean);
    if (!mine.length || !team.front.length) return null;
    const s2 = sfx({ strats: team.strats });
    return FA.battle.create({ pFront: mine, pBack: r.back.slice(0, lv(r).back), eFront: team.front, eBack: team.back, rules: [], env: {},
      pExt: econExt(r, battleExt(s)), eExt: battleExt(s2),
      seed: Math.floor(R().next(r.rng) * 2 ** 31) });
  }

  // ---- 存檔相容 ----：舊版存檔（缺新欄位、已移除的角色／裝備／武器／策略 id、欄位型別壞掉）讀進來前先修好
  // 回傳修好的 run（原物件就地修改）；完全不能用時回傳 null。notes 會放進 r.econNotes，商店資訊列顯示
  const RUN_V = 4;
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const clampI = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Math.round(num(v, d))));
  // 裝備：id 要存在；詞條只留該裝備有的，壞掉／缺的補下限。strict（隊伍代碼匯入，防竄改）才把數值夾在範圍內；
  // 存檔不夾（之後調整數值範圍時，玩家已拿到的裝備不會被偷偷改掉）
  function cleanItem(it, strict) {
    if (!it || typeof it !== 'object' || !D().items[it.id]) return null;
    const I = D().items[it.id], src = it.rolls && typeof it.rolls === 'object' ? it.rolls : {}, rolls = {};
    for (const k in I.affix || {}) { const [lo, hi] = I.affix[k], v = num(src[k], lo); rolls[k] = strict ? Math.max(Math.min(lo, hi), Math.min(Math.max(lo, hi), v)) : v; }
    return { id: it.id, rolls };
  }
  function cleanUnit(u, r, lost) {
    if (!u || typeof u !== 'object') return null;
    const U = D().units[u.id];
    if (!U) { lost.push(u); return null; }
    const out = Object.assign({}, u, { star: clampI(u.star, 1, 3, 1), items: (Array.isArray(u.items) ? u.items : []).map(it => cleanItem(it)).filter(Boolean).slice(0, C().maxItems || 3),
      weapon: u.weapon && (D().weapons || {})[u.weapon] ? u.weapon : null });
    if (!(typeof out.uid === 'number' && isFinite(out.uid))) out.uid = r.uid++;
    return out;
  }
  function migrate(r) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
    const c = C(), Rd = RD(), notes = [];
    const asc = clampI(r.asc, 0, (Rd.ascensions || [0]).length - 1, 0);
    const tpl = newRun(num(r.rng && r.rng.s, 1) | 0, asc);
    const fresh = { pending: null, over: null, last: null, node: null, env: null, opener: null, afterStrat: null, shopCons: null, affixes: [], affixSeen: true, consumables: [], bossVar: 0 };
    for (const k in tpl) if (r[k] === undefined || (r[k] === null && Array.isArray(tpl[k]))) r[k] = k in fresh ? fresh[k] : JSON.parse(JSON.stringify(tpl[k]));
    if (!r.rng || typeof r.rng !== 'object') r.rng = tpl.rng;
    ['ecoRng', 'affRng'].forEach(k => { if (!r[k] || typeof r[k] !== 'object') r[k] = tpl[k]; });
    // 數值欄位
    const P = (Rd.planes || [1]).length;
    r.asc = asc; r.plane = clampI(r.plane, 1, P, 1); r.level = clampI(r.level, 1, c.levels.length, 1);
    ['step', 'stage', 'xp', 'uid', 'freeReroll', 'freeLeft', 'extraEnemy', 'lastStand'].forEach(k => { r[k] = Math.max(0, Math.round(num(r[k], tpl[k]))); });
    r.uid = Math.max(1, r.uid); r.streak = Math.round(num(r.streak, 0)); r.threat = num(r.threat, tpl.threat);
    r.gold = Math.max(0, Math.round(num(r.gold, tpl.gold))); r.maxHp = Math.max(1, Math.round(num(r.maxHp, tpl.maxHp))); r.hp = clampI(r.hp, 0, Math.max(r.maxHp, 999), r.maxHp);
    const bosses = D().enemies.bosses[r.plane - 1] || [];
    r.bossVar = clampI(r.bossVar, 0, Math.max(0, bosses.length - 1), 0);
    r.encLv = clampI(r.encLv, 0, Math.max(0, (Rd.encounter || [0]).length - 1), 0);
    r.locked = !!r.locked;
    // 角色：已移除的換成金幣；陣列長度對齊目前設定（多出來的移到備戰區，放不下的也換金幣）
    const lost = [], over = [];
    const size = { front: c.maxFront, back: c.maxBack || 3, bench: c.benchSize };
    ZONES.forEach(z => {
      const a = (Array.isArray(r[z]) ? r[z] : []).map(u => cleanUnit(u, r, lost));
      while (a.length > size[z]) { const u = a.pop(); if (u) over.push(u); }
      while (a.length < size[z]) a.push(null);
      r[z] = a;
    });
    over.forEach(u => { const k = r.bench.indexOf(null); if (k >= 0) r.bench[k] = u; else r.gold += sellPrice(u); });
    if (lost.length) { const g = lost.reduce((s, u) => s + 2 * Math.pow(3, clampI(u.star, 1, 3, 1) - 1), 0); r.gold += g; notes.push(`舊存檔：${lost.length} 隻已移除的角色換成 ${g} 金`); }
    // 物品欄、商店、策略、環境、詞綴、道具
    r.items = (Array.isArray(r.items) ? r.items : []).map(it => cleanItem(it)).filter(Boolean);
    r.weapons = (Array.isArray(r.weapons) ? r.weapons : []).filter(w => (D().weapons || {})[w]);
    r.consumables = (Array.isArray(r.consumables) ? r.consumables : []).filter(id => CD()[id]);
    const hadShop = Array.isArray(r.shop), shop = hadShop ? r.shop.slice(0, c.shopSize) : [];
    while (shop.length < c.shopSize) shop.push(null);
    r.shop = shop.map(id => (id && D().units[id] && !D().units[id].noShop ? id : null)); // 已移除的角色卡變空格（買光的空格照舊）
    if (!hadShop) rollShop(r, true);
    r.strats = (Array.isArray(r.strats) ? r.strats : []).filter(id => (Rd.strategies || {})[id]);
    if (r.env && !(Rd.envs || {})[r.env]) r.env = null;
    if (r.opener && !(Rd.openers || {})[r.opener]) r.opener = null;
    r.affixes = (Array.isArray(r.affixes) ? r.affixes : []).filter(id => AFX()[id]);
    if (!r.affixes.length) r.affixSeen = true;
    ['timed', 'futures'].forEach(k => { r[k] = (Array.isArray(r[k]) ? r[k] : []).filter(t => t && typeof t === 'object'); });
    r.timed.forEach(t => { if (t.unit && !D().units[t.unit]) delete t.unit; });
    r.futures = r.futures.filter(f => !f.tier || (Rd.tiers || {})[f.tier]);
    if (!r.lvPaid || typeof r.lvPaid !== 'object') r.lvPaid = {};
    if (r.shopCons && !(r.shopCons.id && CD()[r.shopCons.id])) r.shopCons = null;
    if (r.node && !((Rd.nodeInfo || {})[r.node] || r.node === 'boss')) r.node = null;
    if (r.over && r.over !== 'win' && r.over !== 'lose') r.over = null;
    // 待選擇：類型或選項失效就清掉（玩家回到商店按「前進」重新選路線）
    const p = r.pending;
    if (p) {
      const dict = { opener: Rd.openers, env: Rd.envs, path: Rd.nodeInfo, supply: Rd.supplies, strategy: Rd.strategies, armory: D().items }[p.type];
      let ok = Array.isArray(p.options) && p.options.length > 0;
      if (ok && dict) ok = p.options.every(o => o === 'boss' || dict[o]);
      else if (ok && p.type === 'encounter') ok = p.options.every(o => (Rd.encounter || [])[o]);
      else if (ok && p.type === 'carrier') ok = p.options.every(o => o && (o.sup ? (Rd.supplies || {})[o.sup] : D().units[o.u] && cleanItem(o.it)));
      else if (ok) ok = false;
      if (!ok) { r.pending = null; notes.push('舊存檔：待選擇的項目已失效，請重新選路線'); }
    }
    if (notes.length) r.econNotes = (Array.isArray(r.econNotes) ? r.econNotes : []).concat(notes);
    r.v = RUN_V;
    return r;
  }
  // 存檔裡的戰鬥能不能續打：要有總動數制欄位、棋子 id 都還存在；和目前版本的戰鬥物件比對欄位，
  // 缺的欄位若是單值（數字／布林／null，例如狀態旗標）或空陣列／空物件就用新版預設補上，缺了有內容的結構（舊規則）就放棄這場戰鬥
  let refB = null;
  const isEmpty = v => v == null || typeof v !== 'object' || (Array.isArray(v) ? !v.length : !Object.keys(v).length);
  function fillFrom(o, ref) {
    for (const k in ref) if (!(k in o)) { if (!isEmpty(ref[k])) return false; o[k] = ref[k] == null || typeof ref[k] !== 'object' ? ref[k] : Array.isArray(ref[k]) ? [] : {}; }
    return true;
  }
  function battleOk(b) {
    if (!b || typeof b !== 'object' || !Array.isArray(b.moves) || !Array.isArray(b.bodies) || !b.bodies.length || !b.rng || !Array.isArray(b.sides)) return false;
    if (!['aim', 'moving', 'over'].includes(b.phase)) return false;
    try {
      if (!refB) { const u = { id: shopIds()[0], star: 1, items: [], weapon: null }; refB = FA.battle.create({ pFront: [u], pBack: [], eFront: [u], eBack: [], rules: [], env: {}, seed: 1 }); }
      if (!fillFrom(b, refB) || !b.sides.every(sd => sd && typeof sd === 'object' && fillFrom(sd, refB.sides[0]))) return false;
      return b.bodies.every(o => o && typeof o === 'object' && isFinite(o.x) && isFinite(o.y) && (o.boss || o.temp || D().units[o.id]) && fillFrom(o, refB.bodies[0]));
    } catch (e) { return false; }
  }

  FA.run = { newRun, rollShop, reroll, buyXp, buy, sell, move, equip, equipWeapon, merge, makeItem, startBattle, endBattle, enemyTeam,
    bossInfo: r => D().enemies.bosses[r.plane - 1][r.bossVar || 0], sellPrice, unitCost, lv, isBoss, steps, unitAt, choose, advance, sfx, efx, nodeOptions,
    exportTeam, importTeam, duelBattle, shopIds,
    cons, giveCons, useCons, consNeeds, carrierPending, rerollCarrier, carrierRerollCost }; // ---- 道具 ---- / ---- 補給 ----
  Object.assign(FA.run, { rollAffixes, rerollAffixes, affixExt, affixEnemy }); // ---- 敵人詞綴 ----
  Object.assign(FA.run, { factionFx, rerollCost, teamUnits }); // ---- 陣營 ----
  Object.assign(FA.run, { askStrategy }); // ---- 連線自走棋（src/core/league.js）----
  Object.assign(FA.run, { buyShopCons, shopOdds, takeNotes, econExt, econAtk, hasFx, envOptions, activeTraitN }); // ---- 經濟擴充 ----
  Object.assign(FA.run, { migrate, battleOk, cleanItem, RUN_V }); // ---- 存檔相容 ----
})(globalThis);
