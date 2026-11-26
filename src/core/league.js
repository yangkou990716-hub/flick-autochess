// 連線自走棋模式（2～4 人排位）核心邏輯：不碰畫面、不碰網路，Node 可直接跑（sim/league_sim.js）
// 商店沿用 run.js（金幣、利息、連勝連敗、等級、升星、裝備欄、投資策略），不含位面、節點、詞綴、投資環境
// 配對：每回合兩兩配對，避免和上回合同一人；奇數時落單者打「幽靈」（另一位玩家上回合的隊伍，AI 操作）
(function (g) {
  const FA = g.FA = g.FA || {};
  const L = () => FA.DATA.league, C = () => FA.DATA.config, RUN = () => FA.run, RNG = () => FA.rng;
  const GHOST = '#ghost';

  // ---- 每位玩家自己手機上的 run ----
  function newRun(seed) {
    const r = RUN().newRun(seed | 0, 0);
    r.league = { round: 1, applied: 0, strat: 0 };
    r.pending = null; r.affixes = []; r.affixSeen = true; r.env = null; r.opener = null;
    r.lastStand = 0; r.hp = r.maxHp = L().hp;
    RUN().rollShop(r, true);
    stratFor(r, 1);
    return r;
  }
  const stratRound = n => n >= L().stratFirst && (n - L().stratFirst) % L().stratEvery === 0;
  // 該回合要發投資策略就掛到 r.pending（每回合只發一次）
  function stratFor(r, round) {
    if (!stratRound(round) || r.league.strat >= round) return false;
    r.league.strat = round;
    if (r.pending) { r.futures.push({ at: r.stage, tier: null }); return true; } // 已有待選（例如上個策略的加選）：排到後面
    RUN().askStrategy(r); return true;
  }
  // 送出隊伍：前台空的就從備戰區／後台補上，還是沒人就免費給 1 隻 1 費前台
  function ensureFront(r) {
    const lv = RUN().lv(r), has = () => r.front.slice(0, lv.front).some(Boolean);
    if (has()) return false;
    for (const z of ['bench', 'back']) r[z].forEach((u, i) => {
      if (!u || has() || FA.DATA.units[u.id].role === 'back') return;
      const k = r.front.findIndex((x, j) => !x && j < lv.front); if (k >= 0) { r.front[k] = u; r[z][i] = null; }
    });
    if (!has()) {
      const ids = RUN().shopIds().filter(id => FA.DATA.units[id].cost === 1 && FA.DATA.units[id].role !== 'back');
      r.front[0] = { uid: r.uid++, id: RNG().pick(r.rng, ids), star: 1, items: [], weapon: null };
    }
    return true;
  }
  function teamCode(r, name) { ensureFront(r); return RUN().exportTeam(r, name); }

  // 對戰結束時某一方（seat）的戰鬥資料：自己打出的金幣（爆破得金策略 g、羈絆抽獎 lg）、陣亡數 d、啟動的羈絆 tr（人脈進階用）
  // 權威端寫進 pr/{i}.st，房主結算時轉進 res/{pid}.st，各家自己的手機再用它算商店
  function battleStats(b, seat) {
    if (!b) return null;
    const L = b.lot || {}, tr = (b.sides[seat] && b.sides[seat].traits) || {};
    return { g: (b.goldT || [b.gold || 0, 0])[seat] || 0, lg: (L.goldT || [L.gold || 0, 0])[seat] || 0, d: (b.deaths || [0, 0])[seat] || 0, tr: Object.keys(tr).filter(k => tr[k]) };
  }
  // 回合結算（自己的 run）：沿用 run.endBattle 的連勝連敗、收入、利息、經驗、掉落、陣營／策略效果；
  // 血量以房主算的為準（hp），之後加發本模式的戰後掉落與每 3 回合的投資策略
  // res: { round, win, left（對方剩餘動數，輸時算扣血用）, hp, st（battleStats：本場自己的金幣／陣亡／羈絆） }
  function finishRound(r, res) {
    if (!res || r.league.applied >= res.round) return null;
    r.league.applied = res.round;
    const left = Math.max(0, res.left || 0), st = res.st || {}, cap = (v, m) => Math.max(0, Math.min(m, v | 0)); // 數值設上限（資料來自網路）
    const traits = {}; (Array.isArray(st.tr) ? st.tr : st.tr && typeof st.tr === 'object' ? Object.values(st.tr) : []).slice(0, 20).forEach(k => { if (FA.DATA.traits[k]) traits[k] = 1; });
    const fake = { winner: res.win ? 0 : 1, moves: [res.win ? left : 0, res.win ? 0 : left], deaths: [cap(st.d, 20), 0], sides: [{ traits }, { traits: {} }],
      gold: cap(st.g, 10), lot: { gold: cap(st.lg, 10) }, bodies: [] };
    r.node = 'battle';
    const out = RUN().endBattle(r, fake);
    r.hp = res.hp; r.maxHp = L().hp; r.over = null; r.lastStand = 0; r.step = 0; // 沒有位面節點：step 歸零（商店不會顯示首領）
    out.dmg = res.dmg || 0; out.heal = 0;
    const D = L().drop;
    if (RNG().next(r.rng) < D.itemChance) { const ids = Object.keys(FA.DATA.items).filter(k => FA.DATA.items[k].tier === 'base'); const it = RUN().makeItem(r, RNG().pick(r.rng, ids)); r.items.push(it); out.drops.push(it); }
    else { r.gold += D.gold; out.gold += D.gold; out.dropGold = D.gold; }
    r.league.round = res.round + 1;
    stratFor(r, r.league.round);
    return out;
  }

  // 簡易 AI 商店（模擬器與測試用）：選策略、買得起就買、補滿前台／後台、有餘錢升級
  function autoShop(r) {
    const R = RUN(), U = FA.DATA.units;
    let guard = 0; while (r.pending && guard++ < 6) R.choose(r, 0);
    if (r.gold >= 10 + C().xpCost) R.buyXp(r);
    for (let k = 0; k < r.shop.length; k++) if (r.shop[k] && r.gold >= R.unitCost(r, r.shop[k]) + 2) R.buy(r, k);
    const lv = R.lv(r);
    r.bench.forEach((u, i) => {
      if (!u) return;
      const role = U[u.id].role, zs = role === 'back' ? ['back'] : role === 'front' ? ['front'] : ['front', 'back'];
      for (const z of zs) { const k = r[z].findIndex((x, j) => !x && j < lv[z]); if (k >= 0) { r[z][k] = u; r.bench[i] = null; return; } }
    });
    r.items.slice().forEach(() => { const u = r.front.find(Boolean); if (u && r.items.length) R.equip(r, 0, { zone: 'front', i: r.front.indexOf(u) }); });
    ensureFront(r);
  }

  // ---- 房主：扣血、配對、排名 ----
  const lossDmg = (left, round) => { const X = L().loss; return X.base + Math.ceil(Math.max(0, left) / C().deathCost) * X.perLeft + Math.floor(round / X.roundDiv); };

  // ids：存活玩家；hist[pid] = 打過的對手（依回合順序，'#ghost' 代表幽靈）；回傳 [[a, b|'#ghost'], ...]
  function pair(ids, hist, rng) {
    const W = L().pairCost, last = id => (hist[id] || [])[(hist[id] || []).length - 1];
    const met = (a, b) => (hist[a] || []).filter(x => x === b).length;
    const cost = (a, b) => b === GHOST ? W.perGhost * met(a, GHOST) : (last(a) === b || last(b) === a ? W.repeatLast : 0) + W.perMet * met(a, b);
    const list = ids.slice(); if (list.length % 2) list.push(GHOST);
    let best = null, bestC = 1e9, ties = 0;
    (function rec(rest, acc, c) {
      if (c > bestC) return;
      if (!rest.length) {
        if (c < bestC) { bestC = c; best = acc.slice(); ties = 1; }
        else if (RNG().next(rng) < 1 / ++ties) best = acc.slice(); // 同分隨機挑（蓄水池抽樣）
        return;
      }
      const a = rest[0];
      for (let k = 1; k < rest.length; k++) {
        const b = rest[k], p = a === GHOST ? [b, a] : [a, b];
        acc.push(p); rec(rest.filter((_, j) => j !== 0 && j !== k), acc, c + cost(p[0], p[1])); acc.pop();
      }
    })(list, [], 0);
    // 座位（藍／紅）隨機
    return (best || []).map(p => p[1] !== GHOST && RNG().next(rng) < 0.5 ? [p[1], p[0]] : p);
  }
  // 幽靈的隊伍來源：存活的其他玩家（避開上回合對手），沒有就任何其他玩家
  function ghostSource(id, alive, all, hist, rng) {
    const last = (hist[id] || [])[(hist[id] || []).length - 1];
    let pool = alive.filter(x => x !== id && x !== last); if (!pool.length) pool = alive.filter(x => x !== id); if (!pool.length) pool = all.filter(x => x !== id);
    return pool.length ? RNG().pick(rng, pool) : null;
  }

  // 結算一回合：ps[pid] = { hp, out, place }（out＝淘汰的回合，0＝存活）；results = [{ a, b, winner(0/1), left }]
  // 回傳 { ps（更新後）, res[pid] = { win, dmg, opp, left, hp }, over }
  function settle(round, ps, results) {
    const next = {}, res = {};
    for (const id in ps) next[id] = Object.assign({}, ps[id]);
    results.forEach(x => {
      const seats = [x.a, x.b];
      seats.forEach((id, s) => {
        if (id === GHOST || !next[id] || next[id].out) return;
        const win = x.winner === s, dmg = win ? 0 : lossDmg(x.left, round);
        next[id].hp = Math.max(0, next[id].hp - dmg);
        res[id] = { win, dmg, opp: seats[1 - s], left: win ? 0 : Math.max(0, x.left), hp: next[id].hp };
      });
    });
    const aliveBefore = Object.keys(ps).filter(id => !ps[id].out);
    const dead = aliveBefore.filter(id => next[id].hp <= 0).sort((a, b) => ps[b].hp - ps[a].hp || res[b].left - res[a].left); // 同回合淘汰：回合前血多的名次較前
    let alive = aliveBefore.filter(id => next[id].hp > 0);
    if (!alive.length && dead.length) { alive = [dead.shift()]; next[alive[0]].hp = 1; res[alive[0]].hp = 1; } // 全滅：回合前血最多的留 1 血獲勝
    dead.forEach((id, k) => { next[id].out = round; next[id].place = alive.length + k + 1; });
    let over = false;
    if (alive.length <= 1 || round >= L().maxRounds) {
      over = true;
      alive.sort((a, b) => next[b].hp - next[a].hp).forEach((id, k) => { next[id].place = k + 1; });
    }
    return { ps: next, res, over };
  }

  FA.league = { // 網路與畫面在 src/league.js（FA.leagueNet）
    GHOST, newRun, stratFor, stratRound, ensureFront, teamCode, battleStats, finishRound, autoShop, lossDmg, pair, ghostSource, settle };
})(globalThis);
