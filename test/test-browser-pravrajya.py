"""Pravrajya UI regression, with all APIs mocked and no saved-data writes.
Run python3 test/test-browser-pravrajya.py [deployed-base-url].
"""
import asyncio
import importlib.util
import sys
spec = importlib.util.spec_from_file_location('state_tests', __file__.replace('test-browser-pravrajya.py', 'test-browser-state.py'))
state = importlib.util.module_from_spec(spec)
spec.loader.exec_module(state)

async def check(base):
    async with state.async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        passage = dict(topic='yoga',subject='Pravrajya Yoga',condition='general',
            heading='Pravrājya Yogas - renunciation (Sannyasa)',effect='mixed',
            points=['Brihat Jataka XV.1–4: the classical Pravrājya conditions.'],
            source='Brihat Jataka XV.1–4, Iyer (1885).',note='Test passage')
        async def api(route):
            url, body = route.request.url, route.request.post_data_json
            if url.endswith('/settings'):
                await route.fulfill(json={'profiles':[],'custom':{'choices':state.choices,'selected_preset':'custom'}})
            elif url.endswith('/kundalis'):
                await route.fulfill(json={'saved':True,'entries':[]})
            elif url.endswith('/chart'):
                chart = await page.evaluate('p=>Astro.chart(p)',body)
                await route.fulfill(json={'chart':chart})
            elif url.endswith('/readings'):
                await route.fulfill(json={'count':1,'passages':[passage]})
            else:
                await route.fulfill(status=503,json={'error':'isolated test'})
        await page.route('**/functions/v1/**',api)
        try:
            await page.goto(base+'/#d=1913-01-09&t=21:35&lat=33.8886&lon=-117.8131&tz=America%2FLos_Angeles&place=Yorba%20Linda&n=Pravrajya%20test&g=male')
            await page.wait_for_function("!document.getElementById('result').hidden")
            await page.locator('#tab-yogas').click()
            row = page.locator('#panel-yogas tr').filter(has=page.get_by_text('Pravrajya yoga',exact=True))
            await row.wait_for(state='visible')
            assert await row.count() == 1
            assert 'Mixed' in await row.inner_text()
            title = row.get_by_text('Pravrajya yoga',exact=True)
            assert 'share Sagittarius' in await title.get_attribute('title')
            assert '%' in await row.inner_text()
            await page.locator('#tab-lesson').click()
            for query in ['Pravrajya','Pravrājya','Sannyasa']:
                await page.locator('#lesson-query').fill(query)
                await page.get_by_role('heading',name=passage['heading'],exact=True).wait_for(state='visible')
            assert not errors, errors
            print('  ok   Pravrajya appears once in the chart, with its qualifications, frequencies and searchable passage')
        finally:
            await context.close()
            await browser.close()

if __name__ == '__main__':
    if len(sys.argv)>1:
        asyncio.run(check(sys.argv[1].rstrip('/')))
    else:
        server = state.http.server.ThreadingHTTPServer(('127.0.0.1',0),
            state.functools.partial(state.Quiet,directory=str(state.ROOT)))
        state.threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            asyncio.run(check('http://127.0.0.1:'+str(server.server_port)))
        finally:
            server.shutdown()
            server.server_close()
