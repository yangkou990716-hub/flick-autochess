# 效能量測：PORT=8891 python3 tests/perf_bench.py [CPU 節流倍數=4] [輸出資料夾=/tmp/perf]
# 先在 repo 根目錄開：python3 -m http.server 8891
# AI_ONLY=1 只比較固定種子的敵方回合開頭，含 AI、瞄準預覽與繪製。
# 用 CDP 開 CPU 節流模擬低階手機（390x844、dpr 2），量：
#  1. 戰鬥：6v6 全 3 星（爆炸、分裂、連鎖閃電、遙控炸彈、幻影…）、開場能量全滿、雙方都放大招；每幀 JS 工作時間＋幀間隔
#  2. 商店：連續刷新／購買／拖曳時的處理時間（含重排）與幀間隔
#  3. 長時間：連打 10 場代碼對戰，看 JS heap、DOM 節點、事件監聽數、計時器有沒有一直漲
import sys, os, time, json
from playwright.sync_api import sync_playwright

RATE = float(sys.argv[1]) if len(sys.argv) > 1 else 4
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/perf'
os.makedirs(OUT, exist_ok=True)
ROOT = 'http://localhost:' + os.environ.get('PORT', '8891') + '/index.html'
GAMES = int(os.environ.get('GAMES', '10'))
errors = []

# rAF 包一層：每幀所有 callback 的 JS 時間總和（work）與幀間隔（interval）；計時器計數
INIT = """
localStorage.setItem('fa_tut', JSON.stringify({skip: 1}));
(() => {
  const raf = window.requestAnimationFrame.bind(window), Q = window.__perf = { on: false, work: [], gap: [], ph: [], dr: [], st: [], sn: [], cd: 0, cs: 0, cn: 0, last: 0, cur: 0, tick: 0, timers: 0, intervals: 0 };
  let pend = [], sched = false, prevEnemy = false;
  Q.enemyWork = []; Q.enemyGap = [];
  const enemyAim = () => {
    if (!Q.on || !window.FA || !FA.debug) return false;
    const b = FA.debug().battle;
    return !!b && b.phase === 'aim' && b.turn === 1;
  };
  const flush = ts => { sched = false; const list = pend; pend = []; const t0 = performance.now(), enemy = enemyAim(); Q.cd = Q.cs = Q.cn = 0;
    for (const f of list) { try { f(ts); } catch (e) { setTimeout(() => { throw e; }); } }
    const w = performance.now() - t0; if (enemy) Q.enemyWork.push(w); if (prevEnemy && Q.on) Q.enemyGap.push(ts - Q.last); prevEnemy = enemy; if (Q.on) { let ph = ''; try { const b = FA.debug().battle; ph = b ? b.phase + b.turn : ''; } catch (e) { } Q.work.push(w); Q.ph.push(ph); Q.dr.push(Q.cd); Q.st.push(Q.cs); Q.sn.push(Q.cn); if (Q.last) Q.gap.push(ts - Q.last); } Q.last = ts; };
  window.requestAnimationFrame = f => { pend.push(f); if (!sched) { sched = true; raf(flush); } return ++Q.tick; };
  const st = window.setTimeout, si = window.setInterval, ct = window.clearTimeout, ci = window.clearInterval, live = new Set(), liveI = new Set();
  window.setTimeout = (f, ms, ...a) => { const id = st(() => { live.delete(id); typeof f === 'function' ? f(...a) : 0; }, ms); live.add(id); return id; };
  window.clearTimeout = id => { live.delete(id); ct(id); };
  window.setInterval = (f, ms, ...a) => { const id = si(f, ms, ...a); liveI.add(id); return id; };
  window.clearInterval = id => { liveI.delete(id); ci(id); };
  Q.pending = () => ({ timeouts: live.size, intervals: liveI.size });
  const ae = EventTarget.prototype.addEventListener, re = EventTarget.prototype.removeEventListener; let nL = 0;
  EventTarget.prototype.addEventListener = function (...a) { nL++; return ae.apply(this, a); };
  EventTarget.prototype.removeEventListener = function (...a) { nL--; return re.apply(this, a); };
  Q.listeners = () => nL;
})();
"""

def pct(a, q):
    if not a: return 0
    a = sorted(a); return a[min(len(a) - 1, int(len(a) * q))]
def summ(a): return {'n': len(a), 'p50': round(pct(a, .5), 2), 'p95': round(pct(a, .95), 2), 'max': round(max(a) if a else 0, 2)}

TEAM = '''() => { const r = FA.debug().run, D = FA.DATA, mk = (id, w) => ({ id, star: 3, items: [FA.run.makeItem(r, 'blastspring'), FA.run.makeItem(r, 'vampfist')], weapon: w, uid: r.uid++ });
  r.level = 7; r.gold = 999;
  ['detonator', 'splitter', 'mine', 'thunder', 'rbomb', 'phantom'].forEach((id, i) => r.front[i] = mk(id, 'dynamite'));
  ['barrel', 'turret', 'tesla', 'blackhole'].forEach((id, i) => r.back[i] = mk(id, null));
  return FA.run.exportTeam(r, '壓力測試'); }'''

AIM = '''() => { const b = FA.debug().battle; if (!b || b.phase !== 'aim' || b.turn !== 0) return null;
  b.bodies.forEach(o => { if (o.alive) o.energy = 100; }); if (window.__keep) { b.moves = b.movesMax.slice(); b.bodies.forEach(o => { if (!o.__t) { o.__t = 1; o.maxHp *= 6; } o.hp = o.maxHp; }); } // 壓力測試：動數、血量補滿，讓戰鬥一直打下去
  const c = FA.ai.choose(b, 0, FA.DATA.enemies.difficulty(6), { s: (b.round * 977 + b.moves[0] * 31) | 0 }); if (!c) return null;
  const o = b.bodies[c.idx], V = FA.view, L = Math.max(0.6, c.power) * 140, p0 = V.toScreen(o.x, o.y), p1 = V.toScreen(o.x - Math.cos(c.angle) * L, o.y - Math.sin(c.angle) * L);
  return { sx: p0.x, sy: p0.y, ex: p1.x, ey: p1.y }; }'''

def st(p): return p.evaluate('''() => { const v = id => !document.getElementById(id).classList.contains('hidden'), b = FA.debug().battle;
  return { modal: v('modal'), shop: v('shop'), battle: v('battle'), phase: b ? b.phase : null, turn: b ? b.turn : null, head: (document.querySelector('#modalBox h2') || {}).textContent || '' }; }''')

def heap(p, cdp):
    cdp.send('HeapProfiler.collectGarbage'); time.sleep(0.2)
    m = cdp.send('Performance.getMetrics')['metrics']; g = {x['name']: x['value'] for x in m}
    q = p.evaluate('({ ...window.__perf.pending(), listeners: window.__perf.listeners(), dom: document.getElementsByTagName("*").length, parts: FA.view.parts.length, texts: FA.view.texts.length })')
    return dict(heapMB=round(g['JSHeapUsedSize'] / 1e6, 2), nodes=int(g['Nodes']), jsListeners=int(g['JSEventListeners']), **q)

def duel(p, code, ult=True, shots=None):
    p.click('#bDuel'); p.fill('#duelCode', code); p.click('#modalBox button.go')
    t0 = time.time()
    while time.time() - t0 < 240:
        s = st(p)
        if s['modal'] and ('你贏了' in s['head'] or '你輸了' in s['head']): break
        if s['modal'] and '暫停' in s['head']: p.click('#modalBox button.go'); continue
        if s['battle'] and s['phase'] == 'aim' and s['turn'] == 0:
            c = p.evaluate(AIM) if ult else p.evaluate(AIM.replace('o.energy = 100', '0'))
            if c:
                if ult and p.is_visible('#bUlt'): p.click('#bUlt', force=True)
                p.mouse.move(c['sx'], c['sy']); p.mouse.down()
                for i in range(1, 7): p.mouse.move(c['sx'] + (c['ex'] - c['sx']) * i / 6, c['sy'] + (c['ey'] - c['sy']) * i / 6)
                p.mouse.up()
                if shots is not None: shots.append(1)
        elif s['battle'] and s['phase'] == 'aim' and s['turn'] == 1:
            p.evaluate('() => { const b = FA.debug().battle; b && b.bodies.forEach(o => { if (o.alive) o.energy = 100; }); }')
        time.sleep(0.05)
    p.click('#modalBox button.go')

def bench_enemy_turn(p, cdp):
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': RATE})
    work, gaps, turns = [], [], []
    for seed in range(1, 9):
        p.goto(ROOT)
        p.wait_for_function('window.FA && FA.debug')
        p.evaluate('localStorage.removeItem("flick_autochess_save_v2")')
        p.click('#btnNew')
        if p.is_visible('#modalBox button.go') and '開新局' in p.locator('#modalBox').inner_text():
            p.click('#modalBox button.go')
        while p.is_visible('#modalBox [data-c]'):
            p.click('#modalBox [data-c="0"]')
        if p.is_visible('#modalBox button.go'):
            p.click('#modalBox button.go')
        p.evaluate("""seed => {
            const r = FA.debug().run;
            r.rng.s = seed;
            r.front.fill(null); r.back.fill(null); r.strats = [];
        }""", seed)
        code = p.evaluate(TEAM)
        p.evaluate("""seed => {
            const B = FA.battle, create = B.create;
            B.create = o => {
              B.create = create;
              const b = create({ ...o, seed, first: 0 });
              b.bodies.forEach(x => { x.energy = FA.DATA.config.ult.max; });
              return b;
            };
            FA.settings.speed = 1;
        }""", seed)
        p.click('#bDuel'); p.fill('#duelCode', code); p.click('#modalBox button.go')
        # 先畫出場地與棋子，再由我方原地出手，量進入敵方回合的幀。
        p.evaluate("""async () => {
            for (let i = 0; i < 8; i++) await new Promise(requestAnimationFrame);
            const b = FA.debug().battle, mover = FA.battle.avail(b, 0)[0];
            window.__perf.on = true;
            if (!FA.battle.launch(b, mover.i, 0, 0, false)) throw new Error('無法開啟敵方回合量測');
        }""")
        p.wait_for_function("""() => {
            const q = window.__perf, b = FA.debug().battle;
            return b?.phase === 'moving' && b.turn === 1 && q.enemyWork.length > 0 && q.enemyGap.length === q.enemyWork.length;
        }""")
        frame = p.evaluate('() => { const q = window.__perf; q.on = false; return [q.enemyWork, q.enemyGap]; }')
        work.extend(frame[0]); gaps.extend(frame[1])
        turns.append({'seed': seed, 'work_max': round(max(frame[0]), 2), 'gap_max': round(max(frame[1]), 2)})
    result = {'cpu_rate': RATE, 'enemy_work': summ(work), 'enemy_gap': summ(gaps), 'turns': turns}
    print(f'CPU 節流 {RATE}x｜敵方回合開頭（8 個固定種子）｜每幀 JS', result['enemy_work'], '｜幀間隔', result['enemy_gap'])
    print('各種子最長幀', turns)
    with open(f'{OUT}/ai_turn_{int(RATE)}x.json', 'w') as f:
        json.dump(result, f, ensure_ascii=False, indent=1)

with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path='/usr/bin/google-chrome', headless=os.environ.get('HEADED') != '1',
                            args=['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--js-flags=--expose-gc'])
    ctx = br.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
    ctx.add_init_script(INIT)
    p = ctx.new_page()
    p.on('console', lambda m: (m.type == 'error') and errors.append(m.text))
    p.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    cdp = ctx.new_cdp_session(p); cdp.send('Performance.enable')
    if os.environ.get('AI_ONLY') == '1':
        bench_enemy_turn(p, cdp)
        br.close()
        print('console 錯誤：', errors if errors else '無')
        assert not errors, errors
        sys.exit(0)
    p.goto(ROOT); p.wait_for_function('window.FA && FA.debug')
    p.evaluate('''() => { const Q = window.__perf, V = FA.view, B = FA.battle, d = V.draw, st = B.step;
      V.draw = function () { const t0 = performance.now(); try { return d.apply(this, arguments); } finally { Q.cd += performance.now() - t0; } };
      B.step = function () { const t0 = performance.now(); try { return st.apply(this, arguments); } finally { Q.cs += performance.now() - t0; Q.cn++; } }; }''')
    p.click('#btnNew')
    while p.is_visible('#modalBox [data-c]'): p.click('#modalBox [data-c="0"]'); time.sleep(0.1)
    if p.is_visible('#modal'): p.click('#modalBox button.go')
    code = p.evaluate(TEAM); p.evaluate('() => { document.getElementById("modal").classList.add("hidden"); }')
    p.click('#bReroll')  # 重畫商店
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': RATE})

    # ---- 1. 戰鬥 ----
    p.evaluate('window.__perf.on = false; window.__perf.work = []; window.__perf.gap = []; window.__perf.ph = []; FA.settings.speed = 2')
    p.click('#bDuel'); p.fill('#duelCode', code); p.click('#modalBox button.go')
    p.evaluate('window.__perf.on = true; window.__keep = true')
    p.wait_for_function('FA.debug().battle'); p.evaluate('FA.debug().battle.bodies.forEach(o => { o.__t = 1; o.maxHp *= 6; o.hp = o.maxHp; })')
    shots = []; t0 = time.time(); shot_png = False
    while time.time() - t0 < 300 and len(shots) < 14:
        s = st(p)
        if s['modal'] and ('你贏了' in s['head'] or '你輸了' in s['head']): break
        if s['battle'] and s['phase'] == 'aim' and s['turn'] == 0:
            c = p.evaluate(AIM)
            if c:
                if p.is_visible('#bUlt'): p.click('#bUlt', force=True)
                p.mouse.move(c['sx'], c['sy']); p.mouse.down()
                for i in range(1, 7): p.mouse.move(c['sx'] + (c['ex'] - c['sx']) * i / 6, c['sy'] + (c['ey'] - c['sy']) * i / 6)
                p.mouse.up(); shots.append(1)
        elif s['battle'] and s['phase'] == 'aim' and s['turn'] == 1:
            p.evaluate('() => { const b = FA.debug().battle; b && b.bodies.forEach(o => { if (o.alive) o.energy = 100; }); b.moves = b.movesMax.slice(); b.bodies.forEach(o => { if (!o.__t) { o.__t = 1; o.maxHp *= 6; } o.hp = o.maxHp; }); }')
        elif s['battle'] and s['phase'] == 'moving' and not shot_png and len(shots) >= 2:
            time.sleep(0.3); p.screenshot(path=f'{OUT}/battle_moving.png'); shot_png = True
        time.sleep(0.05)
    p.evaluate('window.__perf.on = false; window.__keep = false')
    w = p.evaluate('window.__perf.work'); g = p.evaluate('window.__perf.gap'); ph = p.evaluate('window.__perf.ph')
    mv = [x for x, f in zip(w, ph) if f.startswith('moving')]
    dr = p.evaluate('window.__perf.dr'); stm = p.evaluate('window.__perf.st'); sn = p.evaluate('window.__perf.sn')
    drm = [x for x, f in zip(dr, ph) if f.startswith('moving')]; stmm = [x for x, f in zip(stm, ph) if f.startswith('moving')]
    per = sum(stm) / max(1, sum(sn))  # 每一物理步平均
    # 實機 60fps 時每幀只跑 120Hz 物理 2 步（2x 播放 4 步）；這裡幀間隔被軟體合成拉長、每幀步數偏多，所以另算「繪製＋4 步＋其他」的估計幀成本
    est = [d + per * 4 + max(0, x - d - s) for x, d, s in zip(mv, drm, stmm)]
    print('  飛行中 繪製', summ(drm), f'｜物理每步 {per:.3f}ms', '｜估計 60fps 幀成本（繪製＋4 步＋其他）', summ(est))
    print(f'CPU 節流 {RATE}x｜戰鬥（6v6 全 3 星、大招、2x 播放）出手 {len(shots)}：每幀 JS 全部', summ(w), '｜飛行中', summ(mv), '｜幀間隔', summ(g), '｜lowFx', p.evaluate('FA.view.lowFx'), '繪製平均', round(p.evaluate('FA.view.drawMs || 0'), 2))
    res = {'battle_work': summ(w), 'battle_work_moving': summ(mv), 'battle_gap': summ(g), 'battle_draw_moving': summ(drm), 'step_ms': per, 'battle_est_frame': summ(est)}
    # 打完這場
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
    while True:
        s = st(p)
        if s['modal'] and ('你贏了' in s['head'] or '你輸了' in s['head']): p.click('#modalBox button.go'); break
        if s['modal'] and not ('你贏了' in s['head'] or '你輸了' in s['head']): p.click('#modalBox button.go'); continue
        if s['battle'] and s['phase'] == 'aim' and s['turn'] == 0:
            c = p.evaluate(AIM.replace('o.energy = 100', '0'))
            if c: p.evaluate('() => { const b = FA.debug().battle, c = FA.ai.choose(b, 0, FA.DATA.enemies.difficulty(3), { s: 5 }); FA.battle.launch(b, c.idx, c.angle, c.power, false); }')
        time.sleep(0.1)
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': RATE})

    # ---- 2. 商店 ----
    p.evaluate('() => { const r = FA.debug().run; r.gold = 999; }'); p.click('#bReroll')
    HT = '''sel => { const t0 = performance.now(); const el = document.querySelector(sel); if (!el) return -1; el.click(); document.body.offsetHeight; return performance.now() - t0; }'''
    hs = []
    for k in range(25):
        hs.append(p.evaluate(HT, '#bReroll'))
        if k % 3 == 0:
            v = p.evaluate(HT, '#shopRow [data-b]')
            if v >= 0: hs.append(v)
        if k % 5 == 4:
            p.evaluate('() => { const r = FA.debug().run; r.bench.fill(null); }'); hs.append(p.evaluate(HT, '#bReroll'))
    p.evaluate('window.__perf.work = []; window.__perf.gap = []; window.__perf.on = true')
    # 拖曳：前台第 1 隻拖到備戰區再拖回（pointermove 每幀）
    for k in range(4):
        a = p.evaluate('() => { const r = document.querySelector("#front .slot").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }')
        bb = p.evaluate('() => { const r = document.querySelectorAll("#bench .slot")[3].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }')
        src, dst = (a, bb) if k % 2 == 0 else (bb, a)
        p.mouse.move(*src); p.mouse.down()
        for i in range(1, 25): p.mouse.move(src[0] + (dst[0] - src[0]) * i / 24, src[1] + (dst[1] - src[1]) * i / 24); time.sleep(0.016)
        p.mouse.up(); time.sleep(0.1)
    p.evaluate('window.__perf.on = false')
    g = p.evaluate('window.__perf.gap')
    print(f'商店：點擊處理＋重排（刷新/購買）', summ(hs), '｜拖曳幀間隔', summ(g))
    res.update(shop_click=summ(hs), shop_drag_gap=summ(g))
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})

    # ---- 3. 連打 N 場：記憶體／監聽／計時器 ----
    p.evaluate('() => { const r = FA.debug().run; r.front.fill(null); r.back.fill(null); r.front[0] = { id: "spark", star: 1, items: [], weapon: null, uid: r.uid++ }; r.front[1] = { id: "mine", star: 1, items: [], weapon: null, uid: r.uid++ }; r.front[2] = { id: "detonator", star: 2, items: [], weapon: null, uid: r.uid++ }; r.level = 3; }')
    mem = [heap(p, cdp)]
    for n in range(GAMES):
        duel(p, code, ult=(n % 2 == 0))
        mem.append(heap(p, cdp))
        print(f'  第 {n + 1} 場後', mem[-1])
    print('記憶體：開始', mem[0], '→ 結束', mem[-1])
    res['mem'] = mem
    json.dump(res, open(f'{OUT}/perf_{int(RATE)}x.json', 'w'), ensure_ascii=False, indent=1)
    br.close()

print('console 錯誤：', errors if errors else '無')
