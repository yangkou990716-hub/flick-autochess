# 音效／音樂冒煙測試：python3 tests/audio_test.py [埠號]（先在專案根目錄開 python3 -m http.server 埠號）
# headless 不出聲沒關係：檢查每個音效、每首曲子都能播、沒有錯誤、節點數不暴增、限流有效、切前後台會暫停/恢復
import asyncio, sys, json
from playwright.async_api import async_playwright
PORT = sys.argv[1] if len(sys.argv) > 1 else '8872'

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width': 844, 'height': 390})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.goto(f'http://localhost:{PORT}/'); await pg.evaluate("localStorage.clear()"); await pg.reload(); await pg.wait_for_timeout(300)
        await pg.mouse.click(200, 800)  # 第一次觸控解鎖
        await pg.wait_for_timeout(400)
        st = await pg.evaluate("FA.sound.stats()")
        print('unlock', st['state'], 'song', st['song'])
        assert st['state'] == 'running' and st['song'] == 'title'
        # 每個音效各播一次（間隔開，避免被限流）
        names = await pg.evaluate("FA.sound.names()")
        for n in names:
            await pg.evaluate(f"FA.sound.play('{n}', 500)"); await pg.wait_for_timeout(25)
        st = await pg.evaluate("FA.sound.stats()")
        print('sfx', len(names), 'played', st['sfxPlayed'], 'cached', st['cached'])
        assert st['sfxPlayed'] >= len(names) - 2
        # 同一幀 300 次碰撞：應被限流
        r = await pg.evaluate("(()=>{const a=FA.sound.stats().sfxPlayed;for(let i=0;i<300;i++)FA.sound.play('imp',100+i*3);const s=FA.sound.stats();return [s.sfxPlayed-a,s.voices]})()")
        print('burst 300 -> played', r[0], 'voices', r[1]); assert r[0] <= 4
        # 每首曲子播 1.5 秒
        peak = 0
        for s in await pg.evaluate("FA.sound.songs()"):
            await pg.evaluate(f"FA.sound.music('{s}')")
            for _ in range(6):
                await pg.wait_for_timeout(250); peak = max(peak, (await pg.evaluate("FA.sound.stats()"))['mnodes'])
            st = await pg.evaluate("FA.sound.stats()")
            print('song', s, 'notes', st['notes'], 'mnodes', st['mnodes'], 'playing', st['playing'])
            assert st['song'] == s
        print('music node peak', peak); assert peak < 150
        # 音樂開關
        await pg.evaluate("FA.sound.toggleMusic()"); await pg.wait_for_timeout(1500)
        st = await pg.evaluate("FA.sound.stats()"); print('music off playing', st['playing']); assert st['playing'] == 0 and not await pg.evaluate("FA.sound.musicOn")
        assert await pg.evaluate("localStorage.getItem('fa_music')") == '0'
        await pg.evaluate("FA.sound.toggleMusic()"); await pg.wait_for_timeout(300)
        # 切到背景／回來
        await pg.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))"); await pg.wait_for_timeout(300)
        hid = (await pg.evaluate("FA.sound.stats()"))['state']
        await pg.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))"); await pg.wait_for_timeout(300)
        back = (await pg.evaluate("FA.sound.stats()"))['state']
        print('hidden', hid, 'visible', back); assert hid == 'suspended' and back == 'running'
        # 實際玩一場：商店→戰鬥，音樂要跟著換
        await pg.evaluate("Array.from(document.querySelectorAll('button')).filter(b=>b.textContent.includes('跳過教學')&&b.offsetParent).forEach(b=>b.click())")
        await pg.click('#btnNew', force=True); await pg.wait_for_timeout(300)
        for _ in range(6):
            await pg.evaluate("Array.from(document.querySelectorAll('button')).filter(b=>b.textContent.includes('跳過教學')&&b.offsetParent).forEach(b=>b.click())")
            if await pg.evaluate("!document.getElementById('modal').classList.contains('hidden')&&!!document.querySelector('#modal [data-c]')"): await pg.click('[data-c="0"]', force=True); await pg.wait_for_timeout(150)
        song_shop = (await pg.evaluate("FA.sound.stats()"))['song']
        for i in range(5): await pg.evaluate(f"document.querySelector('[data-b=\"{i}\"]')&&document.querySelector('[data-b=\"{i}\"]').click()")
        for i in range(3): await pg.click(f'#bench [data-i="{i}"]', force=True); await pg.click(f'#front [data-i="{i}"]', force=True)
        await pg.click('#bReroll', force=True)
        await pg.click('#bFight', force=True); await pg.wait_for_timeout(200)
        for _ in range(4):
            if await pg.evaluate("!document.getElementById('modal').classList.contains('hidden')&&!!document.querySelector('#modal [data-c]')"): await pg.click('[data-c="0"]', force=True); await pg.wait_for_timeout(150)
        await pg.evaluate("Array.from(document.querySelectorAll('button')).filter(b=>b.textContent.includes('跳過教學')&&b.offsetParent).forEach(b=>b.click())")
        await pg.wait_for_timeout(500)
        song_battle = (await pg.evaluate("FA.sound.stats()"))['song']
        # 讓 AI 幫我方打幾發，跑碰撞音效
        for _ in range(8):
            await pg.evaluate("""(()=>{const d=FA.debug(),b=d.battle;if(!b||b.phase!=='aim'||b.turn!==0)return;const c=FA.ai.choose(b,0,FA.DATA.enemies.difficulty(5),b.rng);if(c)FA.battle.launch(b,c.idx,c.angle,c.power,c.ult)})()""")
            await pg.wait_for_timeout(1500)
        st = await pg.evaluate("FA.sound.stats()")
        print('shop song', song_shop, 'battle song', song_battle, 'after fight', json.dumps(st))
        assert song_shop == 'shop' and song_battle in ('battle', 'boss') and st['voices'] < 40 and st['mnodes'] < 150
        print('errors', errs); assert not errs
        await b.close()
asyncio.run(main())
