// 完整跑局（AI 代打雙方）：node sim/fullrun.js [每難度局數=5] [起始 seed=1]｜LV=0,1 只跑指定難度｜V=1 印每局｜STAT=1 印投資策略／環境／首領統計
// CFG='{...}' 暫時覆蓋 config（同 simulate.js）｜OUT=x.json 輸出原始統計（給 sim/fullrun_merge.js 合併）
// 商店：依羈絆／費用／星級估值自動買、刷新、升級、上陣、裝備武器、開武裝箱；選項隨機；戰鬥用 FA.ai 代打（launch 傳 ult）
const path = require('path'), N = +process.argv[2] || 5, root = path.join(__dirname, '..'), S0 = +process.argv[3] || 1;
['data/config', 'data/units', 'data/traits', 'data/items', 'data/enemies', 'data/run', 'src/core/battle', 'src/core/ai', 'src/core/run'].forEach(f => require(path.join(root, f + '.js')));
const FA = globalThis.FA, D = FA.DATA, RUN = FA.run, B = FA.battle, C = D.config;
if (process.env.CFG) { const o = JSON.parse(process.env.CFG); for (const k in o) C[k] = (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) ? Object.assign({}, C[k], o[k]) : o[k]; }
const ST = { strat: {}, env: {}, boss: {}, opener: {} }, recS = (k, key, w, a) => { const o = ST[k][key] = ST[k][key] || { n: 0, w: 0, exp: 0 }; o.n++; if (w) o.w++; (o.as = o.as || []).push(a); };
let runShots = [], runBattles = [];
const PLAYER = { aimNoise: 0.06, candidates: 14 }; // 玩家端 AI：中等水準
let battles = 0, thinks = [], ults = 0, shots = 0;

const val = u => D.units[u.id].cost * Math.pow(3, u.star - 1);
function allUnits(r) { return ['front', 'back', 'bench'].flatMap(z => r[z].filter(Boolean)); }
function mainTrait(r) {
  const c = {}; allUnits(r).forEach(u => D.units[u.id].traits.forEach(t => { c[t] = (c[t] || 0) + val(u); }));
  return Object.keys(c).sort((a, b) => c[b] - c[a])[0];
}
function score(r, u, mt) { return val(u) + (D.units[u.id].traits.includes(mt) ? 1.5 : 0) + u.items.length * 0.5; }

function arrange(r) {
  const L = RUN.lv(r), mt = mainTrait(r), us = allUnits(r).sort((a, b) => score(r, b, mt) - score(r, a, mt));
  r.front.fill(null); r.back.fill(null); r.bench.fill(null);
  let f = 0, k = 0, n = 0;
  us.forEach(u => {
    const role = D.units[u.id].role;
    if (role !== 'front' && k < L.back && (role === 'back' || f >= L.front)) r.back[k++] = u;
    else if (role !== 'back' && f < L.front) r.front[f++] = u;
    else if (n < C.benchSize) r.bench[n++] = u;
    else { r.gold += RUN.sellPrice(u, r); r.items.push(...u.items); if (u.weapon) r.weapons.push(u.weapon); }
  });
}
function shop(r) {
  const mt = mainTrait(r);
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < r.shop.length; i++) {
      const id = r.shop[i]; if (!id) continue;
      const have = allUnits(r).some(u => u.id === id), fits = mt && D.units[id].traits.includes(mt);
      const keep = r.stage < 3 ? 0 : 10; // 留利息
      if ((have || fits || allUnits(r).length < RUN.lv(r).front + RUN.lv(r).back) && RUN.unitCost(r, id) <= r.gold - (have ? 0 : keep)) RUN.buy(r, i);
    }
    arrange(r);
    if (r.gold >= 14 && r.level < C.levels.length) RUN.buyXp(r);
    if (r.gold >= 14 || (r.freeLeft > 0)) RUN.reroll(r); else break;
  }
  arrange(r);
  // 武裝箱等「打開」類道具
  const cs = RUN.cons(r);
  for (let i = cs.length - 1; i >= 0; i--) {
    const X = D.consumables[cs[i]]; if (!X) continue;
    if (X.act === 'pick' && !r.pending) { RUN.useCons(r, i, null); if (r.pending && r.pending.type === 'armory') RUN.choose(r, 0); }
    else if (X.act === 'clone') { const t = r.front.findIndex(u => u && D.units[u.id].cost <= X.maxCost); if (t >= 0) RUN.useCons(r, i, { zone: 'front', i: t }); }
  }
  arrange(r);
  const fr = r.front.map((u, i) => u ? i : -1).filter(i => i >= 0);
  for (let g = 0; g < 30 && r.items.length && fr.length; g++) {
    const t = fr.slice().sort((a, b) => r.front[a].items.length - r.front[b].items.length)[0];
    if (!RUN.equip(r, 0, { zone: 'front', i: t })) { if (fr.every(i => r.front[i].items.length >= C.maxItems)) break; r.items.push(r.items.shift()); }
  }
  for (let g = 0; g < 6 && r.weapons.length; g++) { const t = fr.find(i => !r.front[i].weapon); if (t == null) break; RUN.equipWeapon(r, 0, { zone: 'front', i: t }); }
}
function fight(r) {
  const b = RUN.startBattle(r);
  if (!b) throw new Error('startBattle 回傳 null（前台沒人）');
  const diff = D.enemies.difficulty(r.stage + 1);
  let guard = 0;
  while (b.phase !== 'over' && guard++ < 80) {
    const t0 = process.hrtime.bigint();
    const ch = FA.ai.choose(b, b.turn, b.turn === 0 ? PLAYER : diff, b.rng);
    thinks.push(Number(process.hrtime.bigint() - t0) / 1e6);
    if (!ch) { console.error('NULL', JSON.stringify({ turn: b.turn, moves: b.moves, round: b.round, phase: b.phase, reward: r.enemy.reward, boss: r.enemy.boss, alive: b.bodies.map(o => [o.team, o.alive, o.down, o.stunned, o.acted, !!o.temp]) })); throw new Error('AI 回傳 null 但戰鬥未結束'); }
    if (!B.launch(b, ch.idx, ch.angle, ch.power, ch.ult)) throw new Error('launch 失敗');
    if (b.bodies[ch.idx].ultOn) ults++;
    shots++;
    B.runShot(b); B.endShot(b); b.events = [];
  }
  JSON.parse(JSON.stringify(b)); // 戰鬥物件可 JSON 存檔
  if (b.phase !== 'over') throw new Error('戰鬥沒有結束');
  battles++; r._sh = (r._sh || 0) + guard; r._bt = (r._bt || 0) + 1;
  if (r.enemy.boss) {
    const bo = b.bodies.find(o => o.boss), key = 'P' + r.plane + '-' + (D.enemies.bosses[r.plane - 1][r.bossVar || 0].name);
    const x = ST.boss[key] = ST.boss[key] || { n: 0, w: 0, hpLeft: 0, deaths: 0, splitLeft: 0, shots: 0 };
    x.n++; x.shots += guard; if (b.winner === 0) x.w++; else { x.hpLeft += bo ? Math.max(0, bo.hp) / bo.maxHp : 0; x.deaths += b.deaths[0]; if (!bo || !bo.alive) x.splitLeft++; }
  }
  return RUN.endBattle(r, b);
}
const out = [];
const LVS = (process.env.LV || '0,1,2,3,4,5').split(',').map(Number); // LV=4,5 只跑指定難度
for (const a of LVS) {
  let wins = 0; const lines = [];
  for (let g = 0; g < N; g++) {
    const seed = S0 * 7919 + a * 1000 + g * 77, r = RUN.newRun(seed, a), rr = { s: seed };
    const log = []; let guard = 0;
    while (!r.over && guard++ < 300) {
      if (r.pending) {
        const p = r.pending, i = FA.rng.int(rr, p.options.length);
        const res = RUN.choose(r, i);
        if (res === 'battle') { shop(r); const o = fight(r); log.push((r.enemy.boss ? 'B' : r.enemy.reward ? '$' : '') + (o.win ? 'W' : 'L')); }
        continue;
      }
      shop(r); RUN.advance(r);
      const s = JSON.stringify(r); JSON.parse(s); // 一局狀態可存檔
    }
    if (!r.over) throw new Error(`A${a} 第 ${g + 1} 局沒有結束`);
    if (r.over === 'win') wins++;
    runShots.push(r._sh || 0); runBattles.push(r._bt || 0);
    const ww = r.over === 'win'; r.strats.forEach(s => recS('strat', s, ww, a)); if (r.env) recS('env', r.env, ww, a); if (r.opener) recS('opener', r.opener, ww, a);
    lines.push(`  ${r.over === 'win' ? '通關' : '失敗'} 位面${r.plane} 關${r.stage} 血${r.hp} Lv${r.level} 詞綴[${(r.affixes || []).join(',')}] ${log.join('')}`);
  }
  out.push([a, wins]);
  console.log(`A${a}：${wins}/${N} 通關（${(wins / N * 100).toFixed(0)}%）`); if (process.env.V) console.log(lines.join('\n'));
}
thinks.sort((x, y) => x - y);
const rate = {}; out.forEach(([a, w]) => { rate[a] = w / N; });
if (process.env.STAT) for (const k of ['strat', 'env', 'opener']) {
  console.log('\n== ' + k + '（通關率｜相對同難度平均的差）==');
  Object.entries(ST[k]).map(([id, o]) => ({ id, n: o.n, r: o.w / o.n, d: o.w / o.n - o.as.reduce((s, a) => s + rate[a], 0) / o.n }))
    .sort((p, q) => q.d - p.d).forEach(x => console.log(`${x.id.padEnd(12)} ${(x.r * 100).toFixed(0).padStart(3)}%  ${x.d >= 0 ? '+' : ''}${(x.d * 100).toFixed(0)}  (${x.n})`));
}
if (process.env.STAT) { console.log('\n== 首領（勝率｜輸時首領剩血｜輸時我方陣亡｜發數）=='); for (const k in ST.boss) { const x = ST.boss[k], l = x.n - x.w; console.log(`${k.padEnd(10, '　')} ${(x.w / x.n * 100).toFixed(0)}% (${x.n})  剩血 ${l ? (x.hpLeft / l * 100).toFixed(0) : '-'}%  陣亡 ${l ? (x.deaths / l).toFixed(1) : '-'}  首領死但輸 ${x.splitLeft}  ${(x.shots / x.n).toFixed(1)} 發`); } }
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
if (process.env.OUT) require('fs').writeFileSync(process.env.OUT, JSON.stringify({ N, out, ST, runShots, runBattles })); // 多個行程分難度跑時，用 sim/fullrun_merge.js 合併
console.log(`每局平均 ${avg(runBattles).toFixed(1)} 場、${avg(runShots).toFixed(0)} 發`);
console.log(`共 ${battles} 場戰鬥、${(shots / battles).toFixed(1)} 發/場、大招 ${(ults / battles).toFixed(2)} 次/場；AI 思考 p50 ${thinks[thinks.length >> 1].toFixed(1)}ms p95 ${thinks[Math.floor(thinks.length * 0.95)].toFixed(1)}ms max ${thinks[thinks.length - 1].toFixed(1)}ms`);
