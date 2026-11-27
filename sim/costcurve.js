// 費用曲線：node sim/costcurve.js [每組場數=200] [seed=1]
// 1) 單角色強度：隨機 1 星隊伍（無裝備）換進 1 隻指定角色（指定星級），對隨機 1 星隊伍的勝率 → 依費用平均
// 2) 純費用隊對打：4 前台全由「c 費 s 星」隨機角色組成，兩兩對打（例：5 費 1 星 vs 1 費 3 星）
// CFG='{...}' 暫時覆蓋 config（同 simulate.js）；ONLY=1 只跑第 1 部分、ONLY=2 只跑第 2 部分
const path = require('path');
['data/config', 'data/units', 'data/traits', 'data/items', 'data/enemies', 'data/run', 'src/core/battle', 'src/core/ai', 'src/core/run']
  .forEach(f => require(path.join(__dirname, '..', f + '.js')));
const FA = globalThis.FA, D = FA.DATA;
if (process.env.CFG) { const o = JSON.parse(process.env.CFG); for (const k in o) D.config[k] = (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) ? Object.assign({}, D.config[k], o[k]) : o[k]; }
const M = +process.argv[2] || 200, rs = { s: +process.argv[3] || 1 };
const ids = Object.keys(D.units).filter(k => !D.units[k].noShop);
const diff = { aimNoise: 0.06, candidates: 10 };
const mk = (id, star) => ({ id, star: star || 1, items: [], weapon: null });
function rnd() {
  const front = [], back = [];
  while (front.length < 4) { const id = FA.rng.pick(rs, ids); if (D.units[id].role !== 'back') front.push(mk(id)); }
  while (back.length < 2) { const id = FA.rng.pick(rs, ids); if (D.units[id].role !== 'front') back.push(mk(id)); }
  return { front, back };
}
function play(A, B) {
  const b = FA.battle.create({ pFront: A.front, pBack: A.back, eFront: B.front, eBack: B.back, seed: FA.rng.int(rs, 1e9), eExt: {}, rules: [] });
  let g = 0;
  while (b.phase !== 'over' && g++ < 40) { const ch = FA.ai.choose(b, b.turn, diff, b.rng); if (!ch) break; FA.battle.launch(b, ch.idx, ch.angle, ch.power, ch.ult, ch.tap); FA.battle.runShot(b); FA.battle.endShot(b); b.events = []; }
  return b.winner;
}
// 兩邊輪流當 A，抵銷先手
const vs = (fa, fb, n) => { let w = 0; for (let k = 0; k < n; k++) { if (k & 1) { if (play(fb(), fa()) === 1) w++; } else if (play(fa(), fb()) === 0) w++; } return w / n; };

if (process.env.ONLY !== '2') {
  const byCost = {}, rows = [];
  for (const id of ids) {
    const U = D.units[id], r = [];
    for (const star of [1, 2]) {
      const fa = () => { const T = rnd(); if (U.role === 'back') T.back[0] = mk(id, star); else T.front[0] = mk(id, star); return T; };
      r.push(vs(fa, rnd, M));
    }
    rows.push([U.name, U.cost, r]);
    (byCost[U.cost] = byCost[U.cost] || []).push(r);
  }
  console.log('== 單角色（換進隨機 1 星隊）勝率：1 星｜2 星 ==');
  rows.sort((a, b) => a[1] - b[1] || b[2][0] - a[2][0]).forEach(([n, c, r]) => console.log(`${c}費 ${n.padEnd(5, '　')} ${r.map(x => (x * 100).toFixed(0).padStart(3) + '%').join('  ')}`));
  console.log('\n== 依費用平均（1 星｜2 星｜同費 1 星最大差）==');
  for (const c in byCost) { const a = byCost[c], av = k => a.reduce((s, r) => s + r[k], 0) / a.length, s1 = a.map(r => r[0]); console.log(`${c} 費 ×${a.length}：${(av(0) * 100).toFixed(1)}%  ${(av(1) * 100).toFixed(1)}%  差 ${((Math.max(...s1) - Math.min(...s1)) * 100).toFixed(0)}`); }
}
if (process.env.ONLY !== '1') {
  const pool = c => ids.filter(id => D.units[id].cost === c && D.units[id].role !== 'back');
  const pure = (c, s) => () => { const p = pool(c); return { front: [0, 1, 2, 3].map(() => mk(FA.rng.pick(rs, p), s)), back: [] }; };
  const pairs = [[[5, 1], [1, 1]], [[4, 1], [2, 1]], [[3, 1], [1, 1]], [[5, 1], [3, 1]], [[1, 2], [3, 1]], [[2, 2], [4, 1]], [[2, 2], [5, 1]], [[3, 2], [5, 1]], [[1, 3], [5, 1]], [[1, 3], [4, 2]], [[2, 3], [5, 2]], [[5, 2], [3, 2]]];
  console.log('\n== 純費用隊（4 前台）對打：左方勝率 ==');
  for (const [a, b] of pairs) console.log(`${a[0]}費${a[1]}星 vs ${b[0]}費${b[1]}星：${(vs(pure(a[0], a[1]), pure(b[0], b[1]), M) * 100).toFixed(0)}%`);
}
