# 全流程煙霧測試（v1.0 QA）：PORT=8891 python3 tests/full_smoke.py [輸出資料夾=/tmp/fullsmoke] [只跑的段落,逗號分隔]
# 先在 repo 根目錄開：python3 -m http.server 8891
# iPhone 尺寸 390x844、dpr 2。網址帶 qafast=1（一發在同一幀算完、敵方 AI 不等待，只影響播放）。
# 段落：a0 單人 A0 打到結束｜a5 單人 A5 打到結束｜hot 同手機 2 人｜duel 隊伍代碼對戰｜codex 圖鑑每個分頁｜tut 教學重看｜
#       pause 暫停／繼續／切背景｜reload 重新整理後讀檔續玩｜old 舊版存檔／損毀存檔／localStorage 寫滿｜net 連線 1v1｜league 連線自走棋 3 人
# 收集所有 console error、pageerror、未處理的 promise（unhandledrejection），有就失敗。
import sys, os, time, json, math, random
from playwright.sync_api import sync_playwright

TUTNEXT = "(() => { const bs = [...document.querySelectorAll('#uxTut button')].filter(b => b.offsetParent && !/跳過/.test(b.textContent)); const b = bs[bs.length - 1]; if (b) { b.click(); return true; } return false; })()"
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/fullsmoke'
ONLY = set(sys.argv[2].split(',')) if len(sys.argv) > 2 else None
os.makedirs(OUT, exist_ok=True)
ROOT = 'http://localhost:' + os.environ.get('PORT', '8891') + '/index.html'
HERE = os.path.dirname(os.path.abspath(__file__))
errors = []
rnd = random.Random(7)
INIT = """
localStorage.getItem('fa_tut') || localStorage.setItem('fa_tut', JSON.stringify({skip: 1}));
addEventListener('unhandledrejection', e => console.error('unhandledrejection: ' + (e.reason && (e.reason.stack || e.reason))));
"""

def want(k): return ONLY is None or k in ONLY

def hook(p, who):
    # 測試換頁寫存檔時會開到 manifest.json（瀏覽器順手抓 favicon.ico 得到 404），不算遊戲錯誤
    p.on('console', lambda m: (m.type == 'error') and 'favicon.ico' not in (m.location or {}).get('url', '') and errors.append(f'{who}: {m.text} {(m.location or {}).get("url", "")}'))
    p.on('pageerror', lambda e: errors.append(f'{who} pageerror: {e} {getattr(e, "stack", "")}'))
    return p

def new_ctx(br):
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    ctx.add_init_script(INIT)
    return ctx

def wait(cond, timeout=60, msg=''):
    t0 = time.time()
    while time.time() - t0 < timeout:
        v = cond()
        if v: return v
        time.sleep(0.05)
    raise AssertionError('逾時：' + msg + ' ' + str(errors[:3]))

SCR = '''() => { const v = id => !document.getElementById(id).classList.contains('hidden');
  const m = v('modal'), d = FA.debug(), b = d.battle;
  return { modal: m, choices: m ? document.querySelectorAll('#modalBox [data-c]').length : 0, shop: v('shop'), battle: v('battle'), title: v('title'),
    phase: b ? b.phase : null, turn: b ? b.turn : null, over: d.run ? d.run.over : null, stage: d.run ? d.run.stage : null, tut: v('uxTut'),
    head: m ? (document.querySelector('#modalBox h2') || {}).textContent || '' : '' }; }'''
def scr(p): return p.evaluate(SCR)

# 商店：用真的點擊買卡片（買得起就買），再用 AI 商店擺位
SHOP = '''() => { const r = FA.debug().run, R = FA.run, U = FA.DATA.units, lv = R.lv(r), out = [];
  r.shop.forEach((id, k) => { if (id && r.gold >= R.unitCost(r, id) + 1 && r.bench.some(x => !x)) out.push(k); });
  return out.slice(0, 3); }'''
PLACE = '''() => { const r = FA.debug().run, R = FA.run, U = FA.DATA.units, lv = R.lv(r);
  if (r.gold >= 14 && r.level < FA.DATA.config.levels.length) R.buyXp(r);
  r.bench.forEach((u, i) => { if (!u) return; const role = U[u.id].role, zs = role === 'back' ? ['back'] : role === 'front' ? ['front'] : ['front', 'back'];
    for (const z of zs) { const k = r[z].findIndex((x, j) => !x && j < R.lv(r)[z]); if (k >= 0) { r[z][k] = u; r.bench[i] = null; return; } } });
  // 備戰區滿了賣最便宜的
  if (r.bench.every(Boolean)) R.sell(r, { zone: 'bench', i: 0 });
  r.items.slice().forEach(() => { const k = r.front.findIndex(u => u && u.items.length < 3); if (k >= 0 && r.items.length) R.equip(r, 0, { zone: 'front', i: k }); });
  r.weapons.slice().forEach(() => { const k = r.front.findIndex(u => u && !u.weapon); if (k >= 0 && r.weapons.length) R.equipWeapon(r, 0, { zone: 'front', i: k }); });
  if (!r.front.slice(0, lv.front).some(Boolean)) { const k = r.bench.findIndex(Boolean); if (k >= 0) { r.front[0] = r.bench[k]; r.bench[k] = null; } }
  return true; }'''

# 我方出手：AI 選角度；一半用真的滑鼠拖曳（含大招鍵），一半直接呼叫（快）
AIM = '''() => { const b = FA.debug().battle; if (!b || b.phase !== 'aim' || b.turn !== 0) return null;
  const c = FA.ai.choose(b, 0, FA.DATA.enemies.difficulty(8), { s: (b.round * 977 + b.moves[0] * 31) | 0 }); if (!c) return null;
  const o = b.bodies[c.idx], V = FA.view, w0 = V.toWorld(0, 0), w1 = V.toWorld(1, 0), S = 1 / (w1.x - w0.x);
  const sx = (o.x - w0.x) * S, sy = (o.y - w0.y) * S, L = c.power * 140;
  return { idx: c.idx, angle: c.angle, power: c.power, ult: !!c.ult, tap: c.tap || null, sx, sy, ex: (o.x - Math.cos(c.angle) * L - w0.x) * S, ey: (o.y - Math.sin(c.angle) * L - w0.y) * S }; }'''

def my_shot(p, real):
    c = p.evaluate(AIM)
    if not c: return False
    if real:
        if c['ult'] and p.is_visible('#bUlt'): p.click('#bUlt', force=True)
        p.mouse.move(c['sx'], c['sy']); p.mouse.down()
        for i in range(1, 7): p.mouse.move(c['sx'] + (c['ex'] - c['sx']) * i / 6, c['sy'] + (c['ey'] - c['sy']) * i / 6)
        p.mouse.up()
        ok = p.evaluate('() => { const b = FA.debug().battle; return !b || b.phase !== "aim" || b.turn !== 0; }')
        if ok: return True
    p.evaluate('c => FA.battle.launch(FA.debug().battle, c.idx, c.angle, c.power, c.ult, c.tap)', c)
    return True

def play_until(p, done, max_steps=4000, label='', shots=None):
    """自動玩：選擇卡點第一張（隨機）、商店自動買、戰鬥自動出手，直到 done(s) 為真"""
    n = 0; battles = 0; last_battle = False
    while n < max_steps:
        n += 1
        s = scr(p)
        if done(s): return s
        if s['tut']: p.click('#uxTutNext'); continue
        if s['modal']:
            if s['choices']:
                k = rnd.randrange(s['choices']); p.click(f'#modalBox [data-c="{k}"]')
            else:
                btn = p.query_selector('#modalBox button.go') or p.query_selector('#modalBox button')
                if btn: btn.click()
            continue
        if s['battle']:
            if not last_battle: battles += 1; last_battle = True
            if s['phase'] == 'aim' and s['turn'] == 0:
                my_shot(p, rnd.random() < 0.4)
                if shots is not None: shots.append(1)
            time.sleep(0.03); continue
        last_battle = False
        if s['shop']:
            for k in p.evaluate(SHOP): p.click(f'#shopRow [data-b="{k}"]')
            p.evaluate(PLACE)
            p.click('#bFight'); continue
        time.sleep(0.05)
    raise AssertionError(f'{label} 超過步數 {scr(p)}')

def start_single(p, asc):
    p.goto(ROOT + '?qafast=1'); p.wait_for_function('window.FA && FA.debug')
    p.select_option('#selAsc', str(asc))
    p.click('#btnNew')
    s = scr(p)
    if s['modal'] and '開新局' in s['head']: p.click('#modalBox button.go')

import atexit
atexit.register(lambda: errors and print('收集到的錯誤：', '\n'.join(errors[:10])))
with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path='/usr/bin/google-chrome', headless=os.environ.get('HEADED') != '1',
                            args=['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'])

    # ---------- 單人 A0／A5 打到結束 ----------
    for asc, key in ((0, 'a0'), (5, 'a5')):
        if not want(key): continue
        ctx = new_ctx(br); p = hook(ctx.new_page(), key)
        t0 = time.time(); start_single(p, asc); shots = []
        s = play_until(p, lambda s: s['modal'] and ('通關' in s['head'] or '歸零' in s['head']), 6000, key, shots)
        p.screenshot(path=f'{OUT}/{key}_end.png')
        r = p.evaluate('FA.debug().run')
        print(f'{key}: {s["head"].strip()}｜位面 {r["plane"]} 節點 {r["stage"]}｜我方出手 {len(shots)}｜{time.time() - t0:.0f}s')
        p.click('#modalBox button'); wait(lambda: scr(p)['title'], 5, '回標題')
        assert not p.is_visible('#btnCont'), '結束後不應有「繼續遊戲」'
        ctx.close()

    # ---------- 同手機輪流 2 人 ----------
    if want('hot'):
        ctx = new_ctx(br); p = hook(ctx.new_page(), 'hot')
        p.goto(ROOT + '?qafast=1'); p.wait_for_function('window.FA && FA.debug')
        p.click('#btnHot'); p.click('#modalBox button:has-text("2 人")')
        t0 = time.time()
        s = play_until(p, lambda s: s['modal'] and '最終排名' in s['head'], 9000, 'hot')
        txt = p.inner_text('#modalBox'); print('hot：', txt.replace('\n', ' ')[:120], f'{time.time() - t0:.0f}s')
        assert 'P1' in txt and 'P2' in txt
        p.click('#modalBox button'); wait(lambda: scr(p)['title'], 5)
        ctx.close()

    # ---------- 隊伍代碼對戰 ----------
    if want('duel'):
        ctx = new_ctx(br); p = hook(ctx.new_page(), 'duel')
        start_single(p, 1)
        play_until(p, lambda s: s['shop'] and not s['modal'] and (s['stage'] or 0) >= 2, 2000, 'duel 準備')
        p.click('#bExport'); code = p.input_value('#modalBox textarea'); p.click('#modalBox button')
        assert len(code) > 20, code
        p.click('#bDuel'); p.fill('#duelCode', 'xxx'); p.click('#modalBox button.go')
        assert '代碼無效' in p.inner_text('#info')
        p.click('#bDuel'); p.fill('#duelCode', code); p.click('#modalBox button.go')
        wait(lambda: scr(p)['battle'], 5, '對戰開始')
        stage0 = p.evaluate('FA.debug().run.stage')
        s = play_until(p, lambda s: s['modal'] and ('你贏了' in s['head'] or '你輸了' in s['head']), 600, 'duel')
        print('duel：', s['head'].strip())
        p.click('#modalBox button.go'); wait(lambda: scr(p)['shop'], 5)
        assert p.evaluate('FA.debug().run.stage') == stage0, '代碼對戰不應影響進度'
        ctx.close()

    # ---------- 圖鑑每個分頁、教學重看 ----------
    if want('codex') or want('tut'):
        ctx = new_ctx(br); p = hook(ctx.new_page(), 'codex')
        p.goto(ROOT + '?qafast=1'); p.wait_for_function('window.FA && FA.debug')
        if want('codex'):
            p.click('#btnCodex')
            tabs = p.eval_on_selector_all('#modalBox [data-tab]', 'els => els.map(e => e.dataset.tab)')
            for t in tabs:
                p.click(f'#modalBox [data-tab="{t}"]')
                n = p.eval_on_selector_all('#modalBox .choices > *', 'els => els.length')
                assert n > 0, '圖鑑分頁空白 ' + t
                assert 'undefined' not in p.inner_text('#modalBox .choices') and 'NaN' not in p.inner_text('#modalBox .choices'), '圖鑑有 undefined/NaN ' + t
            print('codex 分頁：', tabs)
            p.screenshot(path=f'{OUT}/codex.png')
            p.click('#modalBox [data-close]')
        if want('tut'):
            p.click('#uxTutBtn'); p.wait_for_timeout(300)
            if p.is_visible('#modalBox .tutlist'):  # v1.0：先出章節清單，挑第一章重看
                p.click('#modalBox .tutlist button'); p.wait_for_timeout(300)
            k = 0
            while p.is_visible('#uxTut') and k < 20:
                nb = p.query_selector('#uxTut button:visible')
                if not nb: break
                nb.click(); k += 1; p.wait_for_timeout(150)
            assert not p.is_visible('#uxTut'), '教學關不掉'
            p.evaluate("document.getElementById('modal').classList.add('hidden'); localStorage.setItem('fa_tut', '{}'); localStorage.setItem('fa_a2hs', '1')")
            p.reload(); p.wait_for_function('window.FA && FA.debug')
            if p.is_visible('#uxTut'): p.evaluate(TUTNEXT)
            p.click('#btnNew'); s = scr(p)
            if s['modal'] and '開新局' in s['head']: p.click('#modalBox button.go')
            seen = set(); bubbles = 0
            # v1.0 教學：情境式泡泡（#uxTut 內按鈕）＋練習關；記錄在商店／戰鬥／結算各看過泡泡
            n = 0
            while not ('result' in seen and s.get('shop')) and n < 3000:
                n += 1; s = scr(p)
                if p.is_visible('#uxTut'):
                    bt = p.inner_text('#uxBubble') if p.is_visible('#uxBubble') else ''
                    seen.add('result' if ('結算' in bt or '勝負' in bt) else 'battle' if s['battle'] else 'shop'); bubbles += 1
                    if not p.evaluate(TUTNEXT): p.evaluate("document.getElementById('uxTut').classList.add('hidden')")
                    continue
                if s['modal']:
                    if s['choices']: p.evaluate("document.querySelector('#modalBox [data-c]').click()")
                    else:
                        p.evaluate("(document.querySelector('#modalBox button.go') || document.querySelector('#modalBox button') || {click(){}}).click()")
                    if 'battle' in seen: seen.add('result')
                elif s['battle'] and s['phase'] == 'aim' and s['turn'] == 0: my_shot(p, False)
                elif s['shop']:
                    if 'battle' in seen: break
                    for kk in p.evaluate(SHOP): p.evaluate("k => document.querySelector('#shopRow [data-b=\"' + k + '\"]').click()", str(kk))
                    p.evaluate(PLACE); p.evaluate("document.getElementById('bFight').click()")
                time.sleep(0.03)
            print('教學重看：', sorted(seen), '泡泡數', bubbles); assert {'shop', 'battle'} <= seen and bubbles >= 4, (seen, bubbles)
            p.evaluate("localStorage.setItem('fa_tut', JSON.stringify({skip: 1}))")
        ctx.close()

    # ---------- 暫停／繼續／切背景、重新整理後讀檔續玩 ----------
    if want('pause') or want('reload'):
        ctx = new_ctx(br); p = hook(ctx.new_page(), 'pause')
        start_single(p, 2)
        play_until(p, lambda s: s['battle'] and s['phase'] == 'aim' and s['turn'] == 0, 800, 'pause 進戰鬥')
        if want('pause'):
            p.click('#bPause'); assert '暫停' in scr(p)['head']
            for lbl in ('音效', '音樂', '震動', '播放速度'):
                p.click(f'#modalBox button:has-text("{lbl}")'); assert '暫停' in scr(p)['head'], lbl
            p.click('#modalBox button.go'); assert not scr(p)['modal']
            # 切背景：hidden → 自動暫停＋存檔；回來還是暫停畫面
            p.evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'))")
            assert '暫停' in scr(p)['head'], '切背景應暫停'
            sv = p.evaluate("JSON.parse(localStorage.getItem('flick_autochess_save_v2'))")
            assert sv and sv['battle'], '切背景應存檔（含戰鬥）'
            p.evaluate("delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange'))")
            p.click('#modalBox button.go')
            # 暫停中物理不動
            my_shot(p, False); p.click('#bPause'); a1 = p.evaluate('JSON.stringify(FA.debug().battle.bodies.map(o => [o.x, o.y]))'); time.sleep(0.4)
            assert a1 == p.evaluate('JSON.stringify(FA.debug().battle.bodies.map(o => [o.x, o.y]))'), '暫停時棋子還在動'
            p.click('#modalBox button.go')
            print('pause：暫停／繼續／切背景 OK')
        if want('reload'):
            # 戰鬥中重新整理 → 繼續遊戲 → 回到戰鬥（暫停）→ 打完
            play_until(p, lambda s: s['battle'] and s['phase'] == 'aim' and s['turn'] == 0, 800, 'reload 戰鬥')
            r0 = p.evaluate('JSON.stringify({ g: FA.debug().run.gold, st: FA.debug().run.stage, m: FA.debug().battle.moves })')
            p.reload(); p.wait_for_function('window.FA && FA.debug')
            assert p.is_visible('#btnCont'), '重新整理後應有繼續遊戲'
            p.click('#btnCont'); s = scr(p); assert s['battle'] and '暫停' in s['head'], s
            assert r0 == p.evaluate('JSON.stringify({ g: FA.debug().run.gold, st: FA.debug().run.stage, m: FA.debug().battle.moves })'), '戰鬥讀檔不一致'
            p.click('#modalBox button.go')
            play_until(p, lambda s: s['shop'] and not s['modal'], 800, 'reload 打完')
            # 商店中重新整理
            r1 = p.evaluate('JSON.stringify(FA.debug().run)')
            p.reload(); p.wait_for_function('window.FA && FA.debug'); p.click('#btnCont')
            wait(lambda: scr(p)['shop'], 5)
            assert json.loads(r1)['gold'] == p.evaluate('FA.debug().run.gold') and json.loads(r1)['stage'] == p.evaluate('FA.debug().run.stage')
            play_until(p, lambda s: (s['stage'] or 0) >= json.loads(r1)['stage'] + 1 and s['shop'] and not s['modal'], 800, 'reload 續玩')
            print('reload：戰鬥中／商店中重新整理續玩 OK')
        ctx.close()

    # ---------- 舊版存檔、損毀存檔、localStorage 寫滿 ----------
    if want('old'):
        KEY = 'flick_autochess_save_v2'
        fx = os.path.join(HERE, 'fixtures', 'old_saves')
        ctx = new_ctx(br); p = hook(ctx.new_page(), 'old')
        p.goto(ROOT + '?qafast=1'); p.wait_for_function('window.FA && FA.debug')
        def load_save(raw):
            # 先離開遊戲頁（pagehide 會存檔蓋掉），在同源的靜態檔寫入，再開遊戲
            p.goto(ROOT.replace('index.html', 'manifest.json')); p.evaluate('([k, v]) => { localStorage.setItem(k, v); }', [KEY, raw])
            p.goto(ROOT + '?qafast=1'); p.wait_for_function('window.FA && FA.debug')
        cases = [(f, open(os.path.join(fx, f), encoding='utf8').read()) for f in sorted(os.listdir(fx)) if f.endswith('.json')]
        # 手做：已移除的角色／裝備／武器／策略／環境／詞綴 id、欄位型別壞掉
        base = json.loads(open(os.path.join(fx, 'a96ee35_shop.json'), encoding='utf8').read())
        bad = json.loads(json.dumps(base)); r = bad['run']
        r['bench'][0] = {'id': 'oldhero', 'star': 2, 'items': [{'id': 'oldsword', 'rolls': {'atk': 0.1}}], 'weapon': 'oldgun', 'uid': 99}
        r['front'][0] = r['front'][0] or {'id': 'spark', 'star': 1, 'items': [], 'weapon': None, 'uid': 98}
        r['front'][0]['items'] = [{'id': 'fist', 'rolls': {'atk': 'x'}}, {'id': 'ghostitem'}]
        r['shop'][0] = 'removedunit'; r['strats'] = ['nostrat'] + r.get('strats', []); r['env'] = 'noenv'; r['affixes'] = ['aff_none']
        r['items'] = [{'id': 'nope'}]; r['weapons'] = ['nogun']; r['consumables'] = ['nocons']; r['level'] = 99; r['gold'] = 'NaN'
        cases.append(('removed_ids', json.dumps(bad)))
        bad2 = json.loads(json.dumps(base)); bad2['run']['front'] = None; bad2['run']['bench'] = 'x'; cases.append(('broken_arrays', json.dumps(bad2)))
        bb = json.loads(open(os.path.join(fx, 'a96ee35_battle.json'), encoding='utf8').read())
        if bb['battle']: bb['battle']['bodies'][0]['id'] = 'oldhero'; cases.append(('battle_removed_id', json.dumps(bb)))
        for name, raw in cases:
            n0 = len(errors)
            load_save(raw)
            assert p.is_visible('#btnCont'), name + '：讀不到存檔'
            p.click('#btnCont'); time.sleep(0.2)
            s = scr(p)
            st0 = p.evaluate('FA.debug().run && FA.debug().run.stage')
            play_until(p, lambda s: s['shop'] and not s['modal'] and (s['stage'] or 0) >= (st0 or 0) + 1, 600, 'old ' + name)
            r = p.evaluate('FA.debug().run')
            ok = all(u is None or u['id'] in p.evaluate('Object.keys(FA.DATA.units)') for z in ('front', 'back', 'bench') for u in r[z])
            print(f'old {name}：續玩到節點 {r["stage"]}　金 {r["gold"]}　角色 id 都有效 {ok}　錯誤 {len(errors) - n0}')
            assert ok and isinstance(r['gold'], int)
        # 損毀 JSON：不能壞，提示並保留備份
        load_save('{"run": {"front": [')
        assert not p.is_visible('#btnCont'), '損毀存檔不應顯示繼續'
        assert p.evaluate('!!localStorage.getItem("flick_autochess_save_v2_bad")'), '損毀存檔應保留備份'
        print('old 損毀 JSON：', p.inner_text('#modalBox').replace('\n', ' ')[:60] if p.is_visible('#modal') else '（無提示）')
        assert p.is_visible('#modal'), '損毀存檔應提示'
        p.click('#modalBox button')
        # localStorage 寫滿：存檔失敗要提示、不能丟例外
        p.goto(ROOT.replace('index.html', 'manifest.json')); p.evaluate("localStorage.clear(); localStorage.setItem('fa_tut', JSON.stringify({skip: 1}))")
        start_single(p, 0); play_until(p, lambda s: s['shop'] and not s['modal'], 200, 'full 開局')
        p.evaluate("""() => { localStorage.removeItem('flick_autochess_save_v2'); const big = 'x'.repeat(1 << 20); let i = 0; try { for (; i < 200; i++) localStorage.setItem('__fill' + i, big); } catch (e) { }
          let k = 1 << 19, n = 0; while (k > 8 && n < 5000) { try { localStorage.setItem('__fill_s' + (n++), 'x'.repeat(k)); } catch (e) { k >>= 1; } } }""")
        p.click('#bLock'); time.sleep(0.3)
        txt = p.evaluate('(document.getElementById("uxToast") || {}).textContent || ""') + p.inner_text('#info')
        print('old 寫滿：提示', '空間' in txt or '存檔' in txt)
        assert '空間' in txt or '存檔失敗' in txt, '寫滿應提示'
        p.evaluate("() => { for (const k of Object.keys(localStorage)) if (k.startsWith('__fill')) localStorage.removeItem(k); }")
        p.click('#bLock'); assert p.evaluate("!!localStorage.getItem('flick_autochess_save_v2')"), '空間回來後應能存檔'
        ctx.close()

    # ---------- iPhone 相容：meta、manifest、圖示、長按、橫向提示、各尺寸不橫向溢出 ----------
    if want('ios'):
        ctx = new_ctx(br); p = hook(ctx.new_page(), 'ios')
        p.goto(ROOT + '?qafast=1'); p.wait_for_function('window.FA && FA.debug')
        meta = p.evaluate("""() => Object.fromEntries([...document.querySelectorAll('meta[name]')].map(m => [m.name, m.content]))""")
        vp = meta.get('viewport', '')
        for k in ('viewport-fit=cover', 'user-scalable=no', 'width=device-width'): assert k in vp, ('viewport', k)
        for k in ('apple-mobile-web-app-capable', 'apple-mobile-web-app-status-bar-style', 'theme-color', 'apple-mobile-web-app-title'): assert k in meta, ('meta', k)
        man = p.evaluate("fetch('manifest.json').then(r => r.json())")
        assert man['display'] == 'standalone' and man['orientation'] == 'portrait'
        for ic in man['icons'] + [{'src': p.evaluate("document.querySelector('link[rel=apple-touch-icon]').getAttribute('href')"), 'sizes': '180x180'}]:
            wh = p.evaluate("src => new Promise(ok => { const i = new Image(); i.onload = () => ok(i.naturalWidth + 'x' + i.naturalHeight); i.onerror = () => ok('err'); i.src = src; })", ic['src'])
            assert wh == ic['sizes'], (ic, wh)
        assert {'192x192', '512x512'} <= {i['sizes'] for i in man['icons']}, '缺 192／512 圖示'
        sw = p.evaluate("fetch('sw.js').then(r => r.text())")
        for f in p.evaluate("[...document.scripts].map(s => s.getAttribute('src')).filter(Boolean)") + [i['src'] for i in man['icons']]:
            assert "'" + f + "'" in sw, 'sw.js 沒快取 ' + f
        ev = p.evaluate("() => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); document.querySelector('#title h1').dispatchEvent(e); return e.defaultPrevented; }")
        assert ev, '長按選單沒擋'
        assert p.evaluate("getComputedStyle(document.body).webkitTouchCallout || 'none'") == 'none'
        assert p.evaluate("getComputedStyle(document.querySelector('#btnNew')).touchAction") == 'manipulation', '按鈕要 touch-action: manipulation（雙擊不放大）'
        # 各尺寸（SE／標準／Pro Max）：標題、商店不橫向溢出
        start_single(p, 0); play_until(p, lambda s: s['shop'] and not s['modal'], 200, 'ios 商店')
        for w, h in ((375, 667), (390, 844), (430, 932), (320, 568)):
            p.set_viewport_size({'width': w, 'height': h}); time.sleep(0.2)
            ow = p.evaluate("() => [...document.querySelectorAll('#shop *')].filter(e => e.offsetParent && e.getBoundingClientRect().right > innerWidth + 1).map(e => (e.id || e.className || e.tagName) + ':' + Math.round(e.getBoundingClientRect().right)).slice(0, 5)")
            print(f'ios {w}x{h} 商店橫向溢出：', ow or '無')
            assert not ow, ow
            p.screenshot(path=f'{OUT}/ios_shop_{w}x{h}.png')
        p.set_viewport_size({'width': 390, 'height': 844})
        # 橫向：戰鬥中轉橫 → 提示＋自動暫停
        play_until(p, lambda s: s['battle'] and s['phase'] == 'aim' and s['turn'] == 0, 400, 'ios 戰鬥')
        p.set_viewport_size({'width': 844, 'height': 390}); time.sleep(0.3)
        assert p.is_visible('#uxRotate'), '橫向應顯示提示'
        assert '暫停' in scr(p)['head'], '橫向應暫停戰鬥'
        p.screenshot(path=f'{OUT}/ios_landscape.png')
        p.set_viewport_size({'width': 390, 'height': 844}); time.sleep(0.2)
        assert not p.is_visible('#uxRotate')
        p.click('#modalBox button.go')
        print('ios：meta／manifest／圖示／sw 快取清單／長按／雙擊／橫向 OK')
        ctx.close()

    # ---------- 實際播放（不帶 qafast）：畫面每幀都畫，含低階手機降特效模式 ----------
    if want('live'):
        ctx = new_ctx(br); p = hook(ctx.new_page(), 'live')
        p.goto(ROOT); p.wait_for_function('window.FA && FA.debug'); p.evaluate('FA.settings.speed = 2')
        p.select_option('#selAsc', '3'); p.click('#btnNew')
        for k in range(2):
            if k == 1: p.evaluate('FA.view.lowFx = true; FA.view.drawMs = 99')  # 第 2 場強制低特效
            st0 = p.evaluate('FA.debug().run.stage')
            play_until(p, lambda s: s['shop'] and not s['modal'] and (s['stage'] or 0) > st0, 3000, 'live')
        print('live：實際播放 2 個節點 OK，lowFx', p.evaluate('FA.view.lowFx'))
        ctx.close()

    # ---------- 連線 1v1（假 Firebase）----------
    if want('net'):
        ctx = new_ctx(br)
        def np_(who):
            p = hook(ctx.new_page(), 'net' + who); p.goto(ROOT + '?netmock=1&who=' + who); p.wait_for_function('window.FA && FA.online && FA.netMock'); return p
        a = np_('A'); b = np_('B')
        for p, k in ((a, 1), (b, 4)):
            p.click('#btnNew')
            if not p.evaluate('!!FA.debug().run'): p.click('#modalBox button.go')
            p.evaluate("""k => { const D = FA.DATA, r = FA.debug().run; const ids = Object.keys(D.units).filter(id => !D.units[id].noShop && D.units[id].role !== 'back');
              r.level = 3; for (let i = 0; i < 4; i++) r.front[i] = { id: ids[(k * 7 + i * 3) % ids.length], star: 1, items: [], weapon: null }; document.getElementById('modal').classList.add('hidden'); }""", k)
            p.click('#bQuit')
        ost = lambda p: p.evaluate('FA.online.state()')
        a.click('#btnNet'); a.click('#netCreate'); code = wait(lambda: ost(a)['code'], 10, '建房')
        b.click('#btnNet'); b.fill('#netCode', code); b.click('#netJoin')
        wait(lambda: len(ost(a)['players']) == 2, 10, '加入'); a.click('#netReady'); b.click('#netReady')
        wait(lambda: ost(a)['gen'] == 1 and ost(b)['gen'] == 1, 15, '開戰')
        t0 = time.time()
        while time.time() - t0 < 240:
            sa, sb = ost(a), ost(b)
            if sa['phase'] == 'over' and sb['phase'] == 'over' and sa['applied'] == sb['applied']: break
            for p in (a, b): p.evaluate('FA.online.autoShoot()')
            time.sleep(0.2)
        sa, sb = ost(a), ost(b)
        print('net 1v1：發數', sa['applied'], '勝方', sa['winner'], sb['winner'], 'hash 相同', sa['hash'] == sb['hash'])
        assert sa['phase'] == 'over' and sa['winner'] == sb['winner'] and sa['hash'] == sb['hash']
        time.sleep(1.5); a.click('#noLeave'); b.click('#noLeave'); time.sleep(0.5)
        ctx.close()

    # ---------- 連線自走棋 3 人（假 Firebase、fast）----------
    if want('league'):
        ctx = new_ctx(br); P = {}
        for who in 'ABC':
            p = hook(ctx.new_page(), 'lg' + who); p.goto(ROOT + '?netmock=1&fast=1&lghp=20&who=' + who); p.wait_for_function('window.FA && FA.leagueNet && FA.netMock'); P[who] = p
        lst = lambda p: p.evaluate('FA.leagueNet.state()')
        P['A'].click('#btnLeague'); P['A'].click('#lgCreate'); code = wait(lambda: lst(P['A'])['code'], 10, '建房')
        for k in 'BC': P[k].click('#btnLeague'); P[k].fill('#lgCode', code); P[k].click('#lgJoin')
        wait(lambda: len(lst(P['A'])['players']) == 3, 10, '加入'); P['A'].click('#lgStart')
        t0 = time.time()
        while time.time() - t0 < 400:
            sa = lst(P['A'])
            if sa['state'] == 'over' or sa['phase'] == 'over': break
            for k, p in P.items():
                s = lst(p)
                if s['phase'] == 'shop' and s['scr'] == 'shop' and s['me'] and not s['me'].get('out') and s['me'].get('rdy') != s['round']:
                    p.evaluate('FA.leagueNet.autoShop(); document.getElementById("modal").classList.add("hidden"); FA.leagueNet.ready()')
                if s['myTurn']: p.evaluate('FA.leagueNet.autoShoot()')
            time.sleep(0.15)
        sa = lst(P['A']); print('league 3 人：回合', sa['round'], '狀態', sa['state'], sorted(v.get('place') or 0 for v in sa['players'].values()))
        assert sa['state'] == 'over'
        ctx.close()

    br.close()

print('console 錯誤：', errors if errors else '無')
assert not errors, errors
print('OK')
