// 連線自走棋模式的無畫面模擬：node sim/league_sim.js [局數=20] [人數=4] [seed=1]
// 每位玩家用簡易 AI 經營商店，對戰雙方由 AI 出手；檢查配對（不連續打同一人、奇數幽靈）、扣血、淘汰、名次
const path = require('path');
['data/config', 'data/units', 'data/traits', 'data/items', 'data/enemies', 'data/run', 'data/league', 'src/core/battle', 'src/core/ai', 'src/core/run', 'src/core/league']
  .forEach(f => require(path.join(__dirname, '..', f + '.js')));
const FA = globalThis.FA, D = FA.DATA, LG = FA.league, RUN = FA.run, BT = FA.battle;
if (process.env.LOSS) Object.assign(FA.DATA.league.loss, JSON.parse(process.env.LOSS)); // LOSS='{"perLeft":3}' 暫時試扣血數值
const N = +process.argv[2] || 20, NP = +process.argv[3] || 4, rs = { s: +process.argv[4] || 1 };
const ext = strats => { const s = RUN.sfx({ strats: strats || [] }); return { mods: s.mods, shots: s.shots, chainAll: s.chainAll, revive: s.revive, echo: s.echo, blastGold: s.blastGold, openFreeze: s.openFreeze, stormZap: s.stormZap }; };
function fight(c0, c1, seed) {
  const t = [c0, c1].map(c => RUN.importTeam(c));
  const b = BT.create({ pFront: t[0].front, pBack: t[0].back, eFront: t[1].front, eBack: t[1].back, rules: [], env: {}, pExt: ext(t[0].strats), eExt: ext(t[1].strats), seed, goldBoth: true });
  const ar = { s: seed ^ 0x1234 }; let n = 0;
  while (b.phase !== 'over' && n++ < 400) { const c = FA.ai.choose(b, b.turn, D.enemies.difficulty(15), ar); if (!c || !BT.launch(b, c.idx, c.angle, c.power, !!c.ult, c.tap)) break; BT.runShot(b); BT.endShot(b); b.events = []; }
  if (b.phase !== 'over') throw new Error('戰鬥沒結束');
  return { winner: b.winner, left: Math.max(0, b.moves[b.winner]), st: [LG.battleStats(b, 0), LG.battleStats(b, 1)] };
}
const tot = { gold: [0, 0, 0], outs: 0, rounds: 0, ghosts: 0, repeats: 0, dmg: [], byMax: 0 };
for (let gm = 0; gm < N; gm++) {
  const ids = [...Array(NP)].map((_, i) => 'p' + i), runs = {}, ps = {}, hist = {}, prev = {};
  ids.forEach((id, i) => { runs[id] = LG.newRun(FA.rng.int(rs, 2 ** 31)); ps[id] = { hp: D.league.hp, out: 0 }; hist[id] = []; });
  let round = 1, over = false;
  while (!over) {
    const alive = ids.filter(id => !ps[id].out), code = {};
    alive.forEach(id => { LG.autoShop(runs[id]); code[id] = LG.teamCode(runs[id], id); });
    ids.filter(id => ps[id].out).forEach(id => { code[id] = prev[id]; });
    const pairs = LG.pair(alive, hist, rs), results = [];
    pairs.forEach(([a, b]) => {
      let cb;
      if (b === LG.GHOST) { const src = LG.ghostSource(a, alive, ids, hist, rs); cb = prev[src] || code[src]; tot.ghosts++; }
      else { cb = code[b]; if (hist[a][hist[a].length - 1] === b && alive.length > 2) tot.repeats++; }
      results.push(Object.assign({ a, b }, fight(code[a], cb, FA.rng.int(rs, 2 ** 31))));
      hist[a].push(b); if (b !== LG.GHOST) hist[b].push(a);
    });
    const st = LG.settle(round, ps, results), bst = {};
    results.forEach(x => { bst[x.a] = x.st[0]; if (x.b !== LG.GHOST) bst[x.b] = x.st[1]; tot.gold[0] += x.st[0].g + x.st[1].g; tot.gold[1] += x.st[0].lg + x.st[1].lg; });
    for (const id in st.res) { tot.dmg.push(st.res[id].dmg); const o = LG.finishRound(runs[id], Object.assign({ round, st: bst[id] }, st.res[id])); if (o && o.bond) tot.gold[2]++; }
    Object.assign(ps, st.ps); alive.forEach(id => { prev[id] = code[id]; });
    over = st.over; if (!over) round++;
  }
  tot.rounds += round; tot.outs += ids.filter(id => ps[id].out).length; if (round >= D.league.maxRounds) tot.byMax++;
  const places = ids.map(id => ps[id].place).sort().join(',');
  if (places !== ids.map((_, i) => i + 1).join(',')) throw new Error('名次不完整 ' + places);
}
const dm = tot.dmg.filter(x => x > 0);
console.log(`${N} 局 × ${NP} 人：平均 ${(tot.rounds / N).toFixed(1)} 回合（打滿 ${D.league.maxRounds} 回合 ${tot.byMax} 局）、平均淘汰 ${(tot.outs / N).toFixed(1)} 人、幽靈戰 ${tot.ghosts}、連續同對手 ${tot.repeats}、` +
  `輸家平均扣血 ${(dm.reduce((a, b) => a + b, 0) / dm.length).toFixed(1)}（${Math.min(...dm)}～${Math.max(...dm)}）`);
console.log(`戰鬥中打出的金幣：爆破得金 ${tot.gold[0]}、羈絆抽獎 ${tot.gold[1]}；人脈進階達成 ${tot.gold[2]} 次`);

// 自我檢查：對戰資料（battleStats）要進回合結算——金幣、抽獎金、人脈進階、陣亡（無傷獎勵）
{
  const mk = () => { const r = LG.newRun(4242); r.pending = null; r.bondQ = { need: 2, gold: 3, cons: {}, step: 1, goldStep: 0 }; return r; };
  const base = { round: 1, win: true, left: 3, hp: 80 };
  const r0 = mk(), r1 = mk();
  const o0 = LG.finishRound(r0, Object.assign({}, base)), o1 = LG.finishRound(r1, Object.assign({ st: { g: 2, lg: 1, d: 0, tr: ['mech', 'blast', 'bogus'] } }, base));
  const diff = o1.gold - o0.gold; // 本場金幣（不含利息）：爆破 2＋抽獎 1＋人脈進階 3
  if (diff !== 2 + 1 + 3 || r1.gold - r0.gold < diff || !o1.bond || o0.bond || o1.lotGold !== 1) throw new Error('戰鬥資料沒進結算：差 ' + diff + ' bond ' + JSON.stringify(o1.bond));
  // 真實對戰：紅方（seat1）的爆破得金、抽獎金要記在 seat1（goldBoth）；單人模式（無 goldBoth）紅方抽獎不給金
  let ok = 0;
  const u = id => ({ id, star: 2, items: [], weapon: null }), blast = ['spark', 'barrel', 'splitter', 'detonator', 'mine'].map(u), plain = ['spark', 'barrel', 'mine', 'detonator'].map(u);
  for (let s = 1; s <= 12 && ok < 2; s++) {
    const go = both => {
      const b = BT.create({ pFront: plain, pBack: [], eFront: blast, eBack: [], rules: [], env: {}, eExt: { blastGold: 2 }, seed: s, goldBoth: both });
      const ar = { s }; let n = 0;
      while (b.phase !== 'over' && n++ < 400) { const c = FA.ai.choose(b, b.turn, D.enemies.difficulty(15), ar); if (!c || !BT.launch(b, c.idx, c.angle, c.power, !!c.ult)) break; BT.runShot(b); BT.endShot(b); b.events = []; }
      return LG.battleStats(b, 1);
    };
    const y = go(true), n0 = go(false);
    if (n0.lg) throw new Error('單人模式紅方不該拿抽獎金');
    if (y.g > 0 && y.lg > 0) ok++;
  }
  if (ok < 2) throw new Error('紅方爆破／抽獎金幣沒記到 seat1');
  console.log('自我檢查 OK：對戰金幣／抽獎／人脈進階／陣亡帶進結算，紅方抽獎金記在自己');
}
