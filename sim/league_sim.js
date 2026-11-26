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
  const b = BT.create({ pFront: t[0].front, pBack: t[0].back, eFront: t[1].front, eBack: t[1].back, rules: [], env: {}, pExt: ext(t[0].strats), eExt: ext(t[1].strats), seed });
  const ar = { s: seed ^ 0x1234 }; let n = 0;
  while (b.phase !== 'over' && n++ < 400) { const c = FA.ai.choose(b, b.turn, D.enemies.difficulty(15), ar); if (!c || !BT.launch(b, c.idx, c.angle, c.power, !!c.ult, c.tap)) break; BT.runShot(b); BT.endShot(b); b.events = []; }
  if (b.phase !== 'over') throw new Error('戰鬥沒結束');
  return { winner: b.winner, left: Math.max(0, b.moves[b.winner]) };
}
const tot = { outs: 0, rounds: 0, ghosts: 0, repeats: 0, dmg: [], byMax: 0 };
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
    const st = LG.settle(round, ps, results);
    for (const id in st.res) { tot.dmg.push(st.res[id].dmg); LG.finishRound(runs[id], Object.assign({ round }, st.res[id])); }
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
