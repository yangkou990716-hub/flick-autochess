# 二次操作（飛行中點畫面）連線端對端測試（假 Firebase）：PORT=8851 python3 tests/tap_e2e.py [輸出資料夾]
# 先在 repo 根目錄開：python3 -m http.server 8851
# 兩個分頁各帶遙控炸彈＋幻影劍士。輪到有可點角色的一方：本機預演（aimRelease）→ 飛行中用真的滑鼠點畫面 → 送出帶 tap 的 move，
# 檢查：move 有 tap 欄位、兩端 hash 相同、兩端 tapLog 相同（seat1 是翻轉畫面，順便驗證座標翻轉）。其餘發用 AI（也可能帶 tap）。
import sys, os, time, json
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/taptest'
os.makedirs(OUT, exist_ok=True)
BASE = 'http://localhost:' + os.environ.get('PORT', '8851') + '/index.html?netmock=1&who='
errors = []
PAGES = []
def st(p): return p.evaluate('FA.online.state()')

def wait(cond, timeout=60, msg=''):
    t0 = time.time()
    while time.time() - t0 < timeout:
        v = cond()
        if v: return v
        time.sleep(0.1)
    raise AssertionError('逾時：' + msg + ' ' + str([{k: v for k, v in st(x).items() if k in ('phase', 'building', 'applied', 'gen', 'turn', 'pre')} for x in PAGES]) + str(errors[:3]))

def setup_run(p, ids):
    p.click('#btnNew')
    if not p.evaluate('!!FA.debug().run'): p.click('#modalBox button.go')
    p.evaluate('''ids => { const r = FA.debug().run; r.level = 3; ids.forEach((id, i) => r.front[i] = { id, star: 1 + (i % 2), items: [], weapon: null });
      document.getElementById('modal').classList.add('hidden'); }''', ids)
    p.click('#bQuit')

def open_page(ctx, who):
    p = ctx.new_page()
    p.on('console', lambda m, w=who: (m.type == 'error') and errors.append(f'{w}: {m.text}'))
    p.on('pageerror', lambda e, w=who: errors.append(f'{w} pageerror: {e} {e.stack}'))
    p.goto(BASE + who)
    p.wait_for_function('window.FA && FA.online && FA.netMock')
    return p

def idle(p):
    s = st(p)
    return s['phase'] in ('aim', 'over') and not s['building'] and not s['pre']

def synced(a, b):
    sa, sb = st(a), st(b)
    return sa['gen'] == sb['gen'] and sa['applied'] == sb['applied'] and idle(a) and idle(b) and (sa, sb)

# 找到本方可點的角色，瞄最近的敵人（真實座標角度）
PICK = '''seat => { const B = FA.online.battle(), av = FA.battle.avail(B, seat).filter(o => FA.battle.tapAbility(o));
  if (!av.length) return null; const m = av[0]; let best = null, bd = 1e9;
  B.bodies.forEach(o => { if (o.alive && !o.temp && o.team !== seat) { const d = Math.hypot(o.x - m.x, o.y - m.y); if (d < bd) { bd = d; best = o; } } });
  return { idx: m.i, angle: Math.atan2(best.y - m.y, best.x - m.x), id: m.id }; }'''

with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path='/usr/bin/google-chrome', headless=os.environ.get('HEADED') != '1', args=['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'])
    ctx = br.new_context(viewport={'width': 844, 'height': 390})
    ctx.add_init_script("localStorage.setItem('fa_tut', JSON.stringify({skip: 1}))")
    a = open_page(ctx, 'A')
    a.evaluate('localStorage.clear(); localStorage.setItem("fa_tut", JSON.stringify({skip:1}))')
    a.reload(); a.wait_for_function('window.FA && FA.online && FA.netMock')
    b = open_page(ctx, 'B'); PAGES[:] = [a, b]
    setup_run(a, ['rbomb', 'phantom', 'ironball', 'cue']); setup_run(b, ['phantom', 'rbomb', 'archer', 'drummer'])
    a.evaluate('FA.online.setName("阿明")'); b.evaluate('FA.online.setName("小華")')
    a.click('#btnNet'); a.click('#netCreate')
    code = wait(lambda: st(a)['code'], 10, '建房')
    b.click('#btnNet'); b.fill('#netCode', code); b.click('#netJoin')
    wait(lambda: st(b)['code'] == code and len(st(a)['players']) == 2, 10, '加入')
    a.click('#netReady'); b.click('#netReady')
    wait(lambda: st(a)['gen'] == 1 and st(b)['gen'] == 1 and idle(a) and idle(b), 15, '開戰')
    assert st(a)['hash'] == st(b)['hash'], '開局 hash 不同'

    tapped = {0: 0, 1: 0}; shots = 0
    while True:
        sa, sb = wait(lambda: synced(a, b), 60, '同步')
        wait(lambda: st(a)['hash'] == st(b)['hash'], 5, f"第 {sa['applied']} 發 hash 不同")
        if sa['phase'] == 'over': break
        seat = sa['turn']; p = a if seat == 0 else b
        pk = p.evaluate(PICK, seat)
        if pk and tapped[seat] < 3:
            n0 = sa['applied']
            assert p.evaluate(f"FA.online.aimRelease({pk['idx']}, {pk['angle']}, 1, false)"), 'aimRelease 失敗'
            def flying():
                pr = st(p)['pre']; return (not pr) or pr['stepN'] >= 30 + 12 * tapped[seat]
            wait(flying, 10, '預演飛行')
            if tapped[seat] == 0: p.screenshot(path=f'{OUT}/tap_seat{seat}_before.png')
            pr = st(p)['pre']; can = bool(pr and pr['canTap'] and not pr['sent'])
            p.mouse.click(195, 380)  # 真的點畫面（飛行中）
            if can:
                wait(lambda: st(a)['applied'] > n0 and st(b)['applied'] > n0, 20, '帶 tap 的一發套用')
                mv = a.evaluate(f'FA.netMock._dump().rooms["{code}"].moves')
                m = mv[sorted(mv.keys())[-1]]
                assert m.get('tap') and m['n'] == n0, ('move 沒有 tap', m)
                la, lb = a.evaluate('JSON.stringify(FA.online.tapLog())'), b.evaluate('JSON.stringify(FA.online.tapLog())')
                assert la == lb and la != 'null', ('tapLog 不同', la, lb)
                tapped[seat] += 1
                print(f"seat{seat} {pk['id']} 點擊 tap={m['tap']} tapLog 兩端相同")
                if tapped[seat] == 1: time.sleep(0.2); p.screenshot(path=f'{OUT}/tap_seat{seat}_after.png')
            shots += 1
            continue
        if not p.evaluate('FA.online.autoShoot()'): time.sleep(0.2)
        shots += 1
    sa, sb = st(a), st(b)
    mv = a.evaluate(f'FA.netMock._dump().rooms["{code}"].moves')
    ntap = sum(1 for m in mv.values() if m.get('tap'))
    print('結束：發數', sa['applied'], '勝方', sa['winner'], sb['winner'], 'hash', sa['hash'], sb['hash'], '點擊（手動）', tapped, '帶 tap 的 move', ntap, 'resync', sa['resyncs'], sb['resyncs'])
    assert sa['winner'] == sb['winner'] and sa['hash'] == sb['hash']
    assert tapped[0] >= 1 and tapped[1] >= 1, '兩邊都要至少點過一次'
    assert sa['resyncs'] == 0 and sb['resyncs'] == 0, '不應該需要讀快照修正'
    br.close()

print('console 錯誤：', errors if errors else '無')
assert not errors
print('OK')
