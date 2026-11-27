# 連線對戰端對端測試（假 Firebase）：python3 tests/online_e2e.py [輸出資料夾]
# 先在 repo 根目錄開：python3 -m http.server 8851（或設 PORT=其他埠）
# 兩個同源分頁（同一個 context，共用 localStorage＋BroadcastChannel）：A 建房、B 加入、準備、輪流打完一場，
# 中途 B 重新整理（模擬切出 App）、再來一場後 B 關閉 → A 顯示離線並由 AI 代打。
import sys, os, time, json, math
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/nettest'
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
        time.sleep(0.15)
    raise AssertionError('逾時：' + msg + ' ' + str([{k: v for k, v in st(x).items() if k in ('phase','building','applied','gen','turn')} for x in PAGES]) + str(errors[:3]))

def setup_run(p, k):
    # 開單人局，直接把前台塞好，回標題
    p.click('#btnNew')
    if not p.evaluate('!!FA.debug().run'): p.click('#modalBox button.go')  # 已有存檔：確認開新局
    p.evaluate('''k => { const D = FA.DATA, r = FA.debug().run;
      const ids = Object.keys(D.units).filter(id => !D.units[id].noShop && D.units[id].role !== 'back');
      r.level = 3; for (let i = 0; i < 4; i++) r.front[i] = { id: ids[(k * 7 + i * 3) % ids.length], star: 1 + (i % 2), items: [], weapon: null };
      document.getElementById('modal').classList.add('hidden'); }''', k)
    p.click('#bQuit')

def open_page(ctx, who):
    p = ctx.new_page()
    p.on('console', lambda m, w=who: (m.type == 'error') and errors.append(f'{w}: {m.text}'))
    p.on('pageerror', lambda e, w=who: errors.append(f'{w} pageerror: {e} {e.stack}'))
    p.goto(BASE + who)
    p.wait_for_function('window.FA && FA.online && FA.netMock')
    return p

def idle(p, s=None):
    s = s or st(p)
    return s['phase'] in ('aim', 'over') and not s['building']

def synced(a, b):
    # 只用同一組快照判斷（舊版先取 sa/sb、再另外呼叫 idle() 重新讀狀態：sa/sb 可能是「播動畫中」的舊快照，
    # 等 idle() 讀到時已經算完 → 回傳過期的 hash，被誤判成「第 N 發 hash 不同」）
    sa, sb = st(a), st(b)
    return sa['gen'] == sb['gen'] and sa['applied'] == sb['applied'] and idle(a, sa) and idle(b, sb) and (sa, sb)

def drag_shot(p):
    # 用真的滑鼠拖曳：從自己的棋子往下拉 → 往上彈（畫面上對手永遠在上方）
    pos = p.evaluate('FA.view._own()')
    x, y = pos
    p.mouse.move(x, y); p.mouse.down()
    for i in range(1, 8): p.mouse.move(x - i * 14, y + i * 2)  # 橫向：我方在左，往左拉＝朝敵方（右）彈
    p.mouse.up()

with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path='/usr/bin/google-chrome', headless=os.environ.get('HEADED') != '1', args=['--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'])
    ctx = br.new_context(viewport={'width': 844, 'height': 390})
    ctx.add_init_script("localStorage.setItem('fa_tut', JSON.stringify({skip: 1}))")
    a = open_page(ctx, 'A')
    a.evaluate('localStorage.clear(); localStorage.setItem("fa_tut", JSON.stringify({skip:1}))')
    a.reload(); a.wait_for_function('window.FA && FA.online && FA.netMock')
    b = open_page(ctx, 'B'); PAGES[:] = [a, b]
    setup_run(a, 1); setup_run(b, 4)
    a.evaluate('FA.online.setName("阿明")'); b.evaluate('FA.online.setName("小華")')

    # 建房／加入
    a.click('#btnNet'); a.click('#netCreate')
    code = wait(lambda: st(a)['code'], 10, '建房')
    b.click('#btnNet'); b.fill('#netCode', code); b.click('#netJoin')
    wait(lambda: st(b)['code'] == code and len(st(a)['players']) == 2, 10, '加入')
    a.screenshot(path=f'{OUT}/01_lobby_A.png')
    a.click('#netReady'); b.click('#netReady')
    wait(lambda: st(a)['gen'] == 1 and st(b)['gen'] == 1 and idle(a) and idle(b), 15, '開戰')
    sa, sb = st(a), st(b)
    assert sa['mySeat'] == 0 and sb['mySeat'] == 1, (sa['mySeat'], sb['mySeat'])
    assert sa['hash'] == sb['hash'], '開局 hash 不同'
    print('房號', code, '開局 hash', sa['hash'])

    # 前兩發用真的拖曳（各一發），檢查客人端的輸入有翻轉
    angles = {}
    for _ in range(6):  # 連擊／多動可能讓同一方連續出手：直到雙方各拖過一發
        if len(angles) == 2: break
        s0 = wait(lambda: synced(a, b), 40, '同步')[0]
        p = a if s0['turn'] == 0 else b
        drag_shot(p)
        moved0 = lambda q: (lambda s: s['applied'] > s0['applied'] or s['phase'] == 'moving')(st(q))
        wait(lambda: moved0(a) and moved0(b), 10, '拖曳出手')
        mv = a.evaluate(f'FA.netMock._dump().rooms["{code}"].moves')
        k = sorted(mv.keys())[-1]; angles[s0['turn']] = mv[k]['angle']
        b.screenshot(path=f'{OUT}/02_battle_B_moving.png') if s0['turn'] == 1 else None
    print('拖曳角度（seat0 應約 -90°，seat1 應約 +90°）', {k: round(math.degrees(v)) for k, v in angles.items()})
    assert -120 < math.degrees(angles[0]) < -60 and 60 < math.degrees(angles[1]) < 120, angles

    # 其餘用 AI 選角度、走同一條送出路徑；中途 B 重新整理
    reloaded = False; tampered = False; checks = 0
    while True:
        sa, sb = wait(lambda: synced(a, b), 60, '同步')
        # 同一個 applied、雙方都停在瞄準時才比 hash（不一致時客人會讀房主快照覆蓋，給 5 秒）
        n0 = sa['applied']
        sa, sb = wait(lambda: (lambda s: s and s[0]['applied'] == n0 and s[0]['hash'] == s[1]['hash'] and s)(synced(a, b)), 5, f"第 {n0} 發 hash 不同")
        checks += 1
        if sa['phase'] == 'over': break
        if sa['applied'] == 4 and not reloaded:
            b.screenshot(path=f'{OUT}/03_battle_B_before_reload.png')
            print('B 竄改後 resync 次數', sb['resyncs']); assert sb['resyncs'] >= 1, '竄改後應該要讀快照覆蓋'
            b.reload(); b.wait_for_function('window.FA && FA.online && FA.netMock')
            wait(lambda: st(b)['gen'] == 1 and st(b)['applied'] >= 4 and idle(b), 20, 'B 重連')
            print('B 重新整理後接回：applied', st(b)['applied'], 'hash', st(b)['hash'] == st(a)['hash'])
            reloaded = True; continue
        if sa['applied'] == 2 and not tampered:  # 故意讓 B 的狀態偏掉 → 下一發 hash 不同 → 讀房主快照覆蓋
            b.evaluate('FA.online.battle().bodies.forEach(o => { o.x += 7; o.hp *= 0.9; })'); tampered = True
        p = a if sa['turn'] == 0 else b
        if not p.evaluate('FA.online.autoShoot()'):
            time.sleep(0.3); continue
        # 等雙方都收到這一發（開始移動或已算完）才進下一輪；否則下一輪的「同步」可能還是出手前的狀態，
        # 接著比 hash 時雙方剛好在各自播動畫（moving）→ 誤判 hash 不同
        moved = lambda q: (lambda s: s['applied'] > n0 or s['phase'] == 'moving')(st(q))
        wait(lambda: moved(a) and moved(b), 10, f'第 {n0} 發雙方收到')
    sa, sb = st(a), st(b)
    print('結束：發數', sa['applied'], '勝方', sa['winner'], sb['winner'], 'hash', sa['hash'], sb['hash'], '比對次數', checks, 'resync', sa['resyncs'], sb['resyncs'])
    assert sa['winner'] == sb['winner'] and sa['hash'] == sb['hash']
    wait(lambda: st(a)['result'] and st(a)['result']['winner'] == sa['winner'], 5, 'result')
    time.sleep(1.2)
    a.screenshot(path=f'{OUT}/04_over_A.png'); b.screenshot(path=f'{OUT}/05_over_B.png')

    # 再來一場 → B 關閉 → A 顯示離線＋AI 代打
    a.click('#noAgain'); b.click('#noAgain')
    wait(lambda: st(a)['gen'] == 2 and st(b)['gen'] == 2 and idle(a), 15, '再來一場')
    bpid = st(b)['pid']
    b.close()
    wait(lambda: not st(a)['players'][bpid]['online'], 10, 'A 看到 B 離線')
    n0 = st(a)['applied']
    t0 = time.time()
    while time.time() - t0 < 90:
        s = st(a)
        if s['phase'] == 'over': break
        if s['myTurn']: a.evaluate('FA.online.autoShoot()')
        mv = a.evaluate(f'FA.netMock._dump().rooms["{code}"].moves || {{}}')
        ai = [m for m in mv.values() if m.get('g') == 2 and str(m.get('by', '')).startswith('ai:')]
        if len(ai) >= 2 and idle(a): break
        time.sleep(0.3)
    print('B 離線後 AI 代打發數', len(ai), '目前', st(a)['applied'], st(a)['phase'])
    assert len(ai) >= 1
    time.sleep(0.5)
    a.evaluate('0')
    a.screenshot(path=f'{OUT}/06_A_opponent_offline_ai.png')
    hud = a.inner_text('#netHud'); print('A HUD:', hud.replace('\n', ' / '))
    assert '離線' in hud or '離開' in hud
    br.close()

print('console 錯誤：', errors if errors else '無')
assert not errors
print('OK')
