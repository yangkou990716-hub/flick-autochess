// 驗證不同幀預算、高手二次操作與亂數來源下，分幀和同步選招完全一致。
const assert = require('node:assert/strict');
const path = require('node:path');
for (const file of ['data/config', 'data/units', 'data/traits', 'data/items', 'data/enemies', 'data/run', 'src/core/battle', 'src/core/ai', 'src/core/run']) {
  require(path.join(__dirname, '..', file + '.js'));
}
const { DATA: D, rng, battle: BT, ai } = FA;
const random = { s: 20261127 };
const ids = Object.keys(D.units).filter(id => !D.units[id].noShop && D.units[id].role !== 'back');
const skills = ids.filter(id => D.units[id].traits.includes('finesse'));
const items = Object.keys(D.items).filter(id => D.items[id].tier === 'base');
const copy = b => JSON.parse(JSON.stringify(b));
function unit(id) {
  return { id, star: 1 + rng.int(random, 3),
    items: rng.int(random, 3) === 0 ? [FA.run.makeItem({ rng: random }, rng.pick(random, items))] : [] };
}
let split = 0, taps = 0, ults = 0, unavailable = 0;
for (let n = 0; n < 200; n++) {
  const expert = n % 4 === 0, rngInBattle = n % 2 === 0, first = n % 3 ? 0 : 1;
  const front = () => Array.from({ length: 2 + rng.int(random, 5) }, (_, i) => unit(rng.pick(random, expert && i === 0 ? skills : ids)));
  const battle = BT.create({ pFront: front(), pBack: [unit('medic')], eFront: front(), eBack: [unit('relay')],
    rules: n % 5 === 0 ? ['swamp'] : [], first, seed: rng.int(random, 1e9) });
  for (let k = 0; k < n % 4 && battle.phase !== 'over'; k++) {
    const bodies = BT.avail(battle, battle.turn);
    if (!bodies.length) break;
    const o = rng.pick(random, bodies);
    BT.launch(battle, o.i, rng.range(random, -Math.PI, Math.PI), rng.range(random, 0.5, 1), true);
    BT.runShot(battle); BT.endShot(battle); battle.events = [];
  }
  for (const o of battle.bodies) if (o.alive && rng.int(random, 2) === 0) o.energy = D.config.ult.max;
  if (n % 23 === 0) battle.moves[battle.turn] = 0;
  const baked = copy(battle), synchronous = copy(battle), seed = rng.int(random, 1e9);
  const r0 = rngInBattle ? synchronous.rng : { s: seed };
  const r1 = rngInBattle ? battle.rng : { s: seed };
  const before = r1.s;
  const diff = { candidates: 4 + rng.int(random, 30), aimNoise: 0.06, expert };
  const expected = ai.choose(synchronous, synchronous.turn, diff, r0);
  const task = ai.chooseAsync(battle, battle.turn, diff, r1);
  assert.equal(task.step(0), false);
  let steps = 1;
  while (!task.step([0.2, 1, 6][n % 3])) {
    assert.equal(r1.s, before, '分幀完成前不改動原本的亂數');
    assert(++steps < 10000, '分幀工作必須結束');
  }
  assert.deepEqual(task.result, expected, `戰鬥狀態 ${n + 1}`);
  assert.equal(r1.s, r0.s);
  assert.equal(task.step(0), true);
  if (rngInBattle) baked.rng.s = r1.s;
  assert.deepEqual(battle, baked, '只推進傳入的亂數狀態');
  if (steps > 1) split++;
  if (expected) {
    const { idx, angle, power } = expected;
    const preview = ai.predictAsync(battle, idx, angle, power);
    while (!preview.step(0.5)) {}
    assert.deepEqual(preview.result, BT.predict(battle, idx, angle, power), `瞄準路線 ${n + 1}`);
  }
  if (expected?.tap) taps++;
  if (expected?.ult) ults++;
  if (!expected) unavailable++;
}
assert(split > 0 && taps > 0 && ults > 0 && unavailable > 0);
console.log(`200/200 完全一致，跨幀 ${split}、二次操作 ${taps}、大招 ${ults}、無可用出手 ${unavailable}`);
