// 平衡模擬器：node sim/simulate.js [場數=1000] [seed=1]
// AI 互打，統計各角色、羈絆、裝備勝率（目標 45%～55%）
const path = require('path');
['data/config', 'data/units', 'data/traits', 'data/items', 'data/enemies', 'src/core/battle', 'src/core/ai', 'src/core/run']
  .forEach(f => require(path.join(__dirname, '..', f + '.js')));
const FA = globalThis.FA, D = FA.DATA;
const N = +process.argv[2] || 1000, rs = { s: +process.argv[3] || 1 };
const ids = Object.keys(D.units), traitIds = Object.keys(D.traits), baseItems = Object.keys(D.items).filter(k => D.items[k].tier === 'base');

function team() {
  const main = FA.rng.pick(rs, traitIds);
  const pool = ids.filter(id => D.units[id].traits.includes(main));
  const pick = () => FA.rng.next(rs) < 0.7 ? FA.rng.pick(rs, pool) : FA.rng.pick(rs, ids);
  const mk = id => {
    const u = { id, star: FA.rng.next(rs) < 0.3 ? 2 : 1, items: [] };
    if (FA.rng.next(rs) < 0.35) { const it = FA.rng.next(rs) < 0.25 ? 'blastspring' : FA.rng.pick(rs, baseItems); u.items.push(FA.run.makeItem({ rng: rs }, it)); }
    return u;
  };
  const front = [], back = [];
  while (front.length < 4) { const id = pick(); if (D.units[id].role !== 'back') front.push(mk(id)); }
  while (back.length < 2) { const id = pick(); if (D.units[id].role !== 'front') back.push(mk(id)); }
  return { front, back };
}

const st = { unit: {}, trait: {}, item: {} };
const rec = (k, key, w) => { const o = st[k][key] = st[k][key] || [0, 0]; o[0]++; if (w) o[1]++; };
const diff = { aimNoise: 0.06, candidates: 10 };
const t0 = Date.now();
for (let n = 0; n < N; n++) {
  const A = team(), B = team();
  const b = FA.battle.create({ pFront: A.front, pBack: A.back, eFront: B.front, eBack: B.back, seed: FA.rng.int(rs, 1e9) });
  let guard = 0;
  while (b.phase !== 'over' && guard++ < 40) {
    const ch = FA.ai.choose(b, b.turn, diff, b.rng);
    if (!ch) break;
    FA.battle.launch(b, ch.idx, ch.angle, ch.power); b.events = [];
    FA.battle.runShot(b); FA.battle.endShot(b); b.events = [];
  }
  [A, B].forEach((T, side) => {
    const w = b.winner === side, all = T.front.concat(T.back);
    new Set(all.map(u => u.id)).forEach(id => rec('unit', D.units[id].name, w));
    const tt = FA.battle.traitTiers(all.map(u => u.id));
    for (const k in tt.active) if (tt.active[k]) rec('trait', D.traits[k].name + tt.active[k].n, w);
    new Set(all.flatMap(u => u.items.map(i => i.id))).forEach(id => rec('item', D.items[id].name, w));
  });
}
const out = {};
for (const k in st) {
  out[k] = Object.entries(st[k]).map(([name, [n, w]]) => ({ name, n, rate: +(w / n * 100).toFixed(1) })).sort((a, b) => b.rate - a.rate);
  console.log('\n== ' + k + ' ==');
  out[k].forEach(x => console.log(`${x.name.padEnd(6, '　')} ${String(x.rate).padStart(5)}%  (${x.n})${x.rate > 55 || x.rate < 45 ? '  ⚠' : ''}`));
}
console.log(`\n${N} 場，${((Date.now() - t0) / 1000).toFixed(1)}s`);
