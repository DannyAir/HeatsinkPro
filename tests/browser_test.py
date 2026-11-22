"""Browser test of the r3 page (Playwright): run  python tests/browser_test.py
Checks progress bar, Auto/Recalculate, keyboard shortcuts, persistence, sweep and a regression over modes."""
import asyncio, re
from playwright.async_api import async_playwright
import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'dist' / 'HeatsinkStudy_r3.html').as_uri()
CHROME = os.environ.get('CHROME')  # optional path to Chrome; default = Playwright's Chromium
OUT = ROOT / 'tests' / 'out'; OUT.mkdir(exist_ok=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox']) if CHROME else await p.chromium.launch(args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width':1300,'height':900})
        pg = await ctx.new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append('pageerror: '+str(e)))
        pg.on('console', lambda m: errs.append('console: '+m.text) if m.type=='error' and 'Failed to load resource' not in m.text else None)
        async def idle(t=8000):
            await pg.wait_for_function("document.body.dataset.state==='idle'", timeout=t)
        async def kpi(): return await pg.evaluate("[...document.querySelectorAll('.kpi .v')].slice(0,3).map(e=>e.textContent).join(' | ')")
        async def st(): return await pg.evaluate("[document.body.dataset.state, document.body.classList.contains('stale'), document.querySelector('#progTxt').textContent]")
        await pg.goto(URL); await idle()
        print('load', await kpi(), await st())
        # progress sampling on fine grid (auto on)
        await pg.evaluate("document.querySelectorAll('details.sec').forEach(d=>d.open=true)")
        samples = []
        await pg.select_option('#f_grid','fine')
        for _ in range(60):
            w = await pg.evaluate("[document.querySelector('#progFill').style.width, document.querySelector('#progTxt').textContent, document.body.dataset.state]")
            samples.append(w)
            if w[2]=='idle': break
            await pg.wait_for_timeout(8)
        mids=[x for x in samples if x[0] not in ('','0%','100%')]
        print('progress samples', len(samples), 'intermediate', len(mids), mids[:4], 'final', samples[-1])
        await idle(); await pg.select_option('#f_grid','medium'); await idle()
        # auto off -> stale
        await pg.uncheck('#autoRun'); await pg.wait_for_timeout(100)
        k0 = await kpi()
        await pg.fill('#f_Px','1200'); await pg.wait_for_timeout(400)
        print('auto off edit', await st(), 'kpi unchanged:', (await kpi())==k0)
        await pg.fill('#f_Py','2200'); await pg.wait_for_timeout(200)
        await pg.click('#btnRecalc'); await idle()
        k1 = await kpi(); print('after Recalculate', k1, await st(), 'changed:', k1!=k0)
        # Enter key
        await pg.fill('#f_Px','1000'); await pg.press('#f_Px','Enter'); await idle()
        print('Enter recalcs', await kpi(), await st())
        # Ctrl+Enter
        await pg.fill('#f_Px','960'); await pg.keyboard.press('Control+Enter'); await idle()
        print('Ctrl+Enter', await kpi())
        # reload keeps auto off and values
        await pg.reload(); await idle()
        print('reload auto checked:', await pg.is_checked('#autoRun'), 'Px', await pg.input_value('#f_Px'))
        # sweep with pending change
        await pg.evaluate("location.hash='sweep'"); await idle()
        await pg.fill('#f_Py','1920'); await pg.wait_for_timeout(150)
        print('sweep stale', await st())
        await pg.click('#swRun'); await idle(15000)
        print('sweep after run', await pg.evaluate("document.querySelector('#swCap').textContent.slice(0,90)"), await st())
        # auto back on: applies pending + auto updates
        await pg.check('#autoRun'); await idle()
        await pg.evaluate("location.hash='map'"); await idle()
        await pg.fill('#f_Px','480'); await idle(); print('auto on edit', await kpi())
        # rapid edits -> last wins
        for v in ['500','700','900','960']:
            await pg.fill('#f_Px',v); await pg.wait_for_timeout(30)
        await idle(); print('rapid edits final', await kpi(), await pg.evaluate("document.querySelector('#calcTime').textContent"))
        # regression: modes/types/TIM
        await pg.evaluate("document.querySelectorAll('details.sec').forEach(d=>d.open=true)")
        for k,v in [('fanMode','pull'),('fanMode','impinge'),('fanMode','natural'),('fanMode','push'),('hsType','pinSt'),('hsType','plate'),('timMode','A'),('timMode','C'),('layout','posCols'),('layout','posRows')]:
            await pg.select_option('#f_'+k, v); await idle()
            for tab in ['map','flow','transient','equations']:
                await pg.evaluate(f"location.hash='{tab}'"); await pg.wait_for_timeout(120)
            print(k, v, await kpi())
        await pg.evaluate("location.hash='map'"); await idle()
        await pg.screenshot(path=str(OUT / 'desktop.png'))
        # mobile
        m = await ctx.new_page(); await m.set_viewport_size({'width':390,'height':844})
        m.on('pageerror', lambda e: errs.append('m pageerror: '+str(e)))
        await m.goto(URL); await m.wait_for_function("document.body.dataset.state==='idle'", timeout=8000)
        await m.uncheck('#autoRun'); await m.evaluate("location.hash='setup'"); await m.wait_for_timeout(200)
        await m.fill('#f_Px','1100'); await m.wait_for_timeout(200)
        await m.screenshot(path=str(OUT / 'phone_stale.png'))
        await m.click('#btnRecalc'); await m.wait_for_timeout(30)
        await m.screenshot(path=str(OUT / 'phone_running.png'))
        await m.wait_for_function("document.body.dataset.state==='idle'", timeout=8000)
        await m.check('#autoRun')
        print('\n'.join(errs) or 'NO ERRORS')
        if errs: raise SystemExit(1)
        await b.close()
asyncio.run(main())
