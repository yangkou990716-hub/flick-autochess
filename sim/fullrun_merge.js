// 合併多個 fullrun.js 的 OUT=*.json：node sim/fullrun_merge.js a.json b.json ...
const fs = require('fs'), J = process.argv.slice(2).map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
const rate = {}, cnt = {}; J.forEach(j => j.out.forEach(([a, w]) => { rate[a] = (rate[a] || 0) + w; cnt[a] = (cnt[a] || 0) + j.N; }));
for (const a in rate) { rate[a] /= cnt[a]; console.log(`A${a}：${(rate[a] * cnt[a]).toFixed(0)}/${cnt[a]}（${(rate[a] * 100).toFixed(0)}%）`); }
const ST = {}; J.forEach(j => { for (const k in j.ST) for (const id in j.ST[k]) { const o = j.ST[k][id], t = ((ST[k] = ST[k] || {})[id] = ST[k][id] || { n: 0, w: 0, as: [], hpLeft: 0, deaths: 0, splitLeft: 0, shots: 0 });
  t.n += o.n; t.w += o.w; if (o.as) t.as.push(...o.as); ['hpLeft', 'deaths', 'splitLeft', 'shots'].forEach(q => { t[q] += o[q] || 0; }); } });
for (const k of ['strat', 'env', 'opener']) {
  console.log('\n== ' + k + '（通關率｜相對同難度平均的差）==');
  Object.entries(ST[k] || {}).map(([id, o]) => ({ id, n: o.n, r: o.w / o.n, d: o.w / o.n - o.as.reduce((s, a) => s + rate[a], 0) / o.n }))
    .sort((p, q) => q.d - p.d).forEach(x => console.log(`${x.id.padEnd(12)} ${(x.r * 100).toFixed(0).padStart(3)}%  ${x.d >= 0 ? '+' : ''}${(x.d * 100).toFixed(0)}  (${x.n})`));
}
console.log('\n== 首領（每次挑戰勝率｜輸時首領剩血｜輸時我方陣亡｜發數）==');
for (const k in ST.boss || {}) { const x = ST.boss[k], l = x.n - x.w; console.log(`${k.padEnd(10, '　')} ${(x.w / x.n * 100).toFixed(0)}% (${x.n})  剩血 ${l ? (x.hpLeft / l * 100).toFixed(0) : '-'}%  陣亡 ${l ? (x.deaths / l).toFixed(1) : '-'}  ${(x.shots / x.n).toFixed(1)} 發`); }
const sh = J.flatMap(j => j.runShots), bt = J.flatMap(j => j.runBattles), avg = a => a.reduce((s, x) => s + x, 0) / a.length;
console.log(`\n每局平均 ${avg(bt).toFixed(1)} 場、${avg(sh).toFixed(0)} 發（${(avg(sh) / avg(bt)).toFixed(1)} 發/場）`);
