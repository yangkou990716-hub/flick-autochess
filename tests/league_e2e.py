# 連線自走棋模式端對端測試（假 Firebase）：python3 tests/league_e2e.py [輸出資料夾=/tmp/r7net]
# 先在 repo 根目錄開：python3 -m http.server 8851（或設 PORT=其他埠）
# 3 個同源分頁（A 房主、B、C）：建房、加入、開始；第 1 回合用真的按鈕（選策略、準備）；奇數 → 1 對＋1 場幽靈戰；
# 第 2 回合商店時關掉 C → C 保留上回合隊伍、由 AI 代打；B 在對戰中重新整理 → 自動接回；一路打到有人淘汰、遊戲結束、名次完整。
# 網址帶 fast=1（畫面上的對戰也直接算完）、lghp=20（起始血量，加快淘汰）——只在 netmock 下有效
import sys, os, time
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/r7net'
os.makedirs(OUT, exist_ok=True)
BASE = 'http://localhost:' + os.environ.get('PORT', '8851') + '/index.html?netmock=1&fast=1&lghp=20&who='
errors = []
PAGES = {}

def st(p): return p.evaluate('FA.leagueNet.state()')

def wait(cond, timeout=60, msg=''):
    t0 = time.time()
    while time.time() - t0 < timeout:
        v = cond()
        if v: return v
        time.sleep(0.15)
    raise AssertionError('逾時：' + msg + ' ' + str({k: {x: st(p).get(x) for x in ('round', 'phase', 'scr', 'np')} for k, p in PAGES.items()}) + str(errors[:3]))

def open_page(ctx, who):
    p = ctx.new_page()
    p.on('console', lambda m, w=who: (m.type == 'error') and errors.append(f'{w}: {m.text}'))
    p.on('pageerror', lambda e, w=who: errors.append(f'{w} pageerror: {e} {e.stack}'))
    p.goto(BASE + who)
    p.wait_for_function('window.FA && FA.leagueNet && FA.netMock')
    PAGES[who] = p
    return p

def moves(p, code):
    pm = p.evaluate(f'FA.netMock._dump().leagues["{code}"].pm || {{}}')
    out = []
    for i, d in (pm.items() if isinstance(pm, dict) else enumerate(pm)):
        if d: out += [dict(m, pair=int(i)) for m in d.values()]
    return out

with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path='/usr/bin/google-chrome', headless=os.environ.get('HEADED') != '1', args=['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'])
    ctx = br.new_context(viewport={'width': 390, 'height': 844})
    ctx.add_init_script("localStorage.setItem('fa_tut', JSON.stringify({skip: 1}))")
    a = open_page(ctx, 'A')
    a.evaluate('localStorage.clear(); localStorage.setItem("fa_tut", JSON.stringify({skip:1}))')
    a.reload(); a.wait_for_function('window.FA && FA.leagueNet && FA.netMock')
    b = open_page(ctx, 'B'); c = open_page(ctx, 'C')
    for p, n in ((a, '阿明'), (b, '小華'), (c, '大雄')): p.evaluate(f'FA.leagueNet.setName("{n}")')
    pids = {}

    # 建房／加入／開始
    a.click('#btnLeague'); a.click('#lgCreate')
    code = wait(lambda: st(a)['code'], 10, '建房')
    for p in (b, c):
        p.click('#btnLeague'); p.fill('#lgCode', code); p.click('#lgJoin')
    wait(lambda: len(st(a)['players']) == 3, 10, '加入')
    for k, p in PAGES.items(): pids[k] = st(p)['pid']
    a.screenshot(path=f'{OUT}/01_lobby_A.png')
    a.click('#lgStart')

    # 第 1 回合：真的按鈕（策略 3 選 1 → 自動買 → 準備）
    for k in 'ABC':
        p = PAGES[k]
        wait(lambda: st(p)['scr'] == 'shop', 10, k + ' 進商店')
        wait(lambda: p.is_visible('#modalBox [data-c]'), 5, k + ' 投資策略')
        while p.is_visible('#modal') and p.is_visible('#modalBox [data-c]'):  # 第 1 回合的投資策略（有的策略會再加選）
            p.click('#modalBox [data-c="0"]'); time.sleep(0.2)
        p.evaluate('FA.leagueNet.autoShop()')
        if k == 'A': a.screenshot(path=f'{OUT}/02_shop_A.png')
        p.click('#bFight')
    a.screenshot(path=f'{OUT}/03_waiting_A.png')
    wait(lambda: st(a)['phase'] == 'battle', 10, '第 1 回合開戰')
    s = st(a); print('第 1 回合配對：', [(x['a'], x['b'], x['src']) for x in s['pairs']])
    assert s['np'] == 2 and sum(1 for x in s['pairs'] if x['b'] == '#ghost') == 1, '3 人應有 1 場幽靈戰'

    bys = set()
    rounds_seen = set(); closed = False; reloaded = False; shots_png = False; spect_png = False
    t0 = time.time()
    while time.time() - t0 < 600:
        live = {k: p for k, p in PAGES.items() if not p.is_closed()}
        sa = st(a)
        if sa['state'] == 'over' or sa['phase'] == 'over': break
        r = sa['round']; rounds_seen.add(r)
        if sa['phase'] == 'shop':
            if r == 2 and not closed:  # 第 2 回合商店：C 掉線（不送出）→ 保留上回合隊伍
                c.close(); closed = True; live.pop('C')
                wait(lambda: not st(a)['players'][pids['C']]['online'], 10, 'A 看到 C 離線')
                print('C 已離線')
            for k, p in live.items():
                s = st(p)
                if s['scr'] == 'shop' and s['me'] and not s['me'].get('out') and s['me'].get('rdy') != r:
                    p.evaluate('FA.leagueNet.autoShop(); document.getElementById("modal").classList.add("hidden"); FA.leagueNet.ready()')
            time.sleep(0.3); continue
        # 對戰：輪到誰就出手（同時記下每一發是誰出的：玩家 pid／ai:ghost／ai:<離線玩家>）
        for m in moves(a, code): bys.add((m.get('r'), m.get('by')))
        if r == 2 and not reloaded and st(b)['scr'] == 'lgb':
            mine = [x for x in st(b)['pairs'] if x['r'] == 2 and pids['B'] in (x['a'], x['b'])]
            if mine and mine[0]['applied'] >= 2:
                b.reload(); b.wait_for_function('window.FA && FA.leagueNet && FA.netMock')
                wait(lambda: st(b)['scr'] in ('lgb', 'lg') and st(b)['round'] >= 2, 15, 'B 重新整理接回')
                print('B 重新整理後接回：', st(b)['scr'], '回合', st(b)['round']); reloaded = True
        if not shots_png and st(a)['scr'] == 'lgb':
            a.screenshot(path=f'{OUT}/04_battle_A.png'); shots_png = True
        for k, p in live.items():
            s = st(p)
            if s['me'] and s['me'].get('out') and not spect_png and s['scr'] == 'lgb':
                time.sleep(0.3); p.screenshot(path=f'{OUT}/06_spectator_{k}.png'); spect_png = True
            if s['myTurn']: p.evaluate('FA.leagueNet.autoShoot()')
        time.sleep(0.1)

    sa = st(a); ps = sa['players']
    print('結束：回合', sa['round'], '狀態', sa['state'], {v['name']: (v['hp'], v.get('out'), v.get('place')) for v in ps.values()})
    assert sa['state'] == 'over', '遊戲沒結束'
    assert len(rounds_seen) >= 3 or sa['round'] >= 3, '至少 3 回合'
    places = sorted(v.get('place') for v in ps.values())
    assert places == [1, 2, 3], places
    assert any(v.get('out') for v in ps.values()), '應該有人淘汰'
    ghost_ai = [x for x in bys if x[1] == 'ai:ghost']; c_ai = [x for x in bys if x[1] == 'ai:' + pids['C']]
    print('幽靈 AI 出手的回合', sorted({x[0] for x in ghost_ai}), '｜C 掉線 AI 代打的回合', sorted({x[0] for x in c_ai}))
    assert ghost_ai, '幽靈應由 AI 出手'
    assert c_ai and min(x[0] for x in c_ai) >= 2, 'C 掉線後應由 AI 代打'
    time.sleep(1)
    a.screenshot(path=f'{OUT}/07_over_A.png'); b.screenshot(path=f'{OUT}/08_over_B.png')
    txt = a.inner_text('#lgBox'); print('A 結算畫面：', txt.replace('\n', ' / ')[:200])
    assert '名' in txt or '獲勝' in txt
    br.close()

print('console 錯誤：', errors if errors else '無')
assert not errors
print('OK')
