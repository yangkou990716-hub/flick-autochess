// 產生「舊版存檔」測試資料：node tests/gen_old_saves.js（在 repo 根目錄；會用 git 取出歷史版本的 data/ 與 src/core/）
// 每個歷史版本各做兩份：商店中（打過 1 場）與戰鬥中（彈過 2 發），格式同當時 main.js 的 save()：{ run, battle, mode }
// 輸出 tests/fixtures/old_saves/<commit>_<shop|battle>.json；tests/full_smoke.py 的 old 段落會逐一讀檔續玩
const { execSync } = require('child_process'), fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'fixtures', 'old_saves');
const COMMITS = { '187f943': 'v0.2', 'ca6fe8a': '+7角色', '02d0b88': '道具', '4e88cb4': '敵人詞綴', '941ac1e': '總動數制', '600b14f': '經濟擴充', '10d56bd': '狙擊幽影', 'a96ee35': '神技角色' };
fs.mkdirSync(OUT, { recursive: true });
const git = (c, f) => execSync(`git show ${c}:${f}`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });

for (const [c, label] of Object.entries(COMMITS)) {
  const files = [...git(c, 'index.html').matchAll(/src="((?:data|src\/core)\/[^"]+)"/g)].map(m => m[1]).filter(f => !f.includes('netconfig'));
  const ctx = { console, Math, JSON, Date, Buffer }; ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of files) vm.runInContext(git(c, f), ctx, { filename: c + ':' + f });
  const FA = ctx.FA, R = FA.run, D = FA.DATA;
  const r = R.newRun(1234567, 1);
  const pick = () => { let g = 0; while (r.pending && g++ < 12) { const t = r.pending.type; const k = R.choose(r, 0); if (k === 'battle') return 'battle'; if (t === 'path' && !r.pending) return null; } return null; };
  pick();
  // 買得起就買、放前台
  for (let k = 0; k < r.shop.length; k++) if (r.shop[k]) R.buy(r, k);
  const lv = typeof R.lv === 'function' ? R.lv(r) : { front: 3, back: 1 };
  r.bench.forEach((u, i) => { if (!u) return; const z = D.units[u.id].role === 'back' ? 'back' : 'front', k = r[z].findIndex((x, j) => !x && j < lv[z]); if (k >= 0) { r[z][k] = u; r.bench[i] = null; } });
  if (!r.front.some(Boolean)) { const k = r.bench.findIndex(Boolean); if (k >= 0) { r.front[0] = r.bench[k]; r.bench[k] = null; } }
  // 打一場（AI 代打）→ 商店存檔
  const fight = shots => {
    if (R.advance) R.advance(r);
    let res = pick(); let g = 0;
    while (res !== 'battle' && r.pending && g++ < 8) res = pick();
    const b = R.startBattle(r); if (!b) return null;
    let n = 0;
    while (b.phase !== 'over' && n < (shots == null ? 60 : shots)) {
      const ch = FA.ai.choose(b, b.turn, D.enemies.difficulty ? D.enemies.difficulty(3) : { aimNoise: 0.1, candidates: 6 }, b.rng);
      if (!ch) break;
      FA.battle.launch(b, ch.idx, ch.angle, ch.power, ch.ult, ch.tap); b.events = [];
      if (FA.battle.runShot) FA.battle.runShot(b); else { let k = 0; while (!FA.battle.step(b) && k++ < 3000); }
      if (FA.battle.endShot) FA.battle.endShot(b); b.events = []; n++;
    }
    return b;
  };
  const b1 = fight(null);
  if (b1 && b1.phase === 'over') R.endBattle(r, b1);
  pick();
  fs.writeFileSync(path.join(OUT, `${c}_shop.json`), JSON.stringify({ label, run: r, battle: null, mode: 'run' }));
  const b2 = fight(2);
  fs.writeFileSync(path.join(OUT, `${c}_battle.json`), JSON.stringify({ label, run: r, battle: b2 && b2.phase !== 'over' ? b2 : null, mode: 'run' }));
  console.log(c, label, '商店：位面', r.plane, '節點', r.stage, '金', r.gold, '｜戰鬥中', !!(b2 && b2.phase !== 'over'), b2 ? Object.keys(b2).length + ' 欄' : '');
}
