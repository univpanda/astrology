"""Browser regressions using isolated API mocks; no production writes.
Run: python3 test/test-browser-state.py (requires Playwright and Chromium).
"""
import asyncio
import functools
import http.server
import json
from pathlib import Path
import subprocess
import threading
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

catalogue = json.loads(subprocess.check_output(
    ['node', 'scripts/archive-settings.mjs', '--print'], cwd=ROOT))
choices = {s['settingId']: s['value'] for s in next(
    r for r in catalogue['readings'] if r['id'] == 'rao')['choices']}
link = '#d=1961-08-04&t=19:24&lat=21.3069&lon=-157.8583&tz=Pacific%2FHonolulu&place=Honolulu&n=Chart%20A&g=male'
row_a = dict(id='record-a', name='Chart A', birth_date='1961-08-04',
             birth_time='19:24:00', latitude=21.3069, longitude=-157.8583,
             zone='Pacific/Honolulu', place_label='Honolulu', gender='male', celebrity=False)
row_b = dict(row_a, id='record-b', name='Chart B', birth_date='1962-08-04')

async def check(browser, base, mode):
    context = await browser.new_context()
    page = await context.new_page()
    page.set_default_timeout(10000)
    writes, charts, errors = [], [], []
    load_release, save_release, chart_release = [asyncio.Event() for _ in range(3)]
    if mode != 'startup':
        load_release.set()
    page.on('pageerror', lambda e: errors.append(str(e)))
    custom = dict(choices, **{'ayanamsa': 'raman', 'node-type': 'mean'}) if mode in ['startup', 'presets', 'load-retry'] else choices.copy()
    loads = 0

    async def api(route):
        nonlocal loads
        url, body = route.request.url, route.request.post_data_json
        if url.endswith('/settings'):
            if body['action'] == 'save':
                writes.append(body)
                await route.fulfill(json={'saved': True})
            else:
                loads += 1
                await load_release.wait()
                if mode == 'load-retry' and loads == 1:
                    await route.fulfill(status=503, json={'error': 'test outage'})
                else:
                    await route.fulfill(json={'profiles': [], 'custom': {
                        'choices': custom, 'selected_preset': 'custom'}})
        elif url.endswith('/chart'):
            charts.append(body)
            number = len(charts)
            if ((mode == 'rapid' and number == 2) or
                (mode in ['chart-order', 'metadata', 'cancel'] and number == 1)):
                await chart_release.wait()
            # Exercise the server response path and its required request fields.
            assert body.get('date') and body.get('time'), body
            chart = await page.evaluate('p => Astro.chart(p)', body)
            await route.fulfill(json={'chart': chart})
        elif url.endswith('/kundalis'):
            if body['action'] == 'save':
                writes.append(body)
                if mode in ['save-order', 'save-failure'] and len([w for w in writes if 'entry' in w]) == 1:
                    await save_release.wait()
                    if mode == 'save-failure':
                        await route.fulfill(status=503, json={'error': 'test outage'})
                        return
            await route.fulfill(json={'saved': True, 'entries': [row_a, row_b]})
        else:
            await route.fulfill(status=503, json={'error': 'isolated test'})

    await page.route('**/functions/v1/**', api)
    try:
        await page.goto(base + '/' + (link if mode in ['rapid', 'save-order', 'save-failure', 'metadata', 'cancel'] else ''))
        if mode == 'startup':
            await page.locator('#tab-settings').click()
            assert await page.locator('#chart-style').is_disabled()
            assert await page.locator('#preset-choice').is_disabled()
            # Even a synthetic change must not save unseen defaults.
            await page.locator('#chart-style').evaluate("s => {s.value='south'; s.dispatchEvent(new Event('change'));}")
            assert not writes
            load_release.set()
            await page.wait_for_function("!document.getElementById('chart-style').disabled")
            await page.locator('#chart-style').select_option('south')
            await page.wait_for_function("document.getElementById('preset-status').textContent.includes('saved to database')")
            saved = writes[-1]['choices']
            assert saved['ayanamsa'] == 'raman' and saved['node-type'] == 'mean'
            assert saved['chart-style'] == 'south'
        elif mode == 'load-retry':
            await page.locator('#tab-settings').click()
            await page.locator('#settings-retry').wait_for(state='visible')
            assert await page.locator('#ayanamsa').is_disabled() and not writes
            await page.locator('#settings-retry').click()
            await page.wait_for_function("!document.getElementById('ayanamsa').disabled")
            assert await page.locator('#ayanamsa').input_value() == 'raman'
            assert not writes
        elif mode == 'presets':
            await page.locator('#tab-settings').click()
            await page.wait_for_function("!document.getElementById('preset-choice').disabled")
            # Create the editor first, checking that its controls lock too.
            await page.locator('#preset-create').click()
            await page.locator('#preset-back').click()
            for name in ['raman', 'rao', 'star', 'parashara', 'page']:
                await page.locator('#preset-choice').select_option(name)
                assert await page.locator('#ayanamsa').is_disabled()
                assert await page.locator('#node-type').is_disabled()
                assert await page.locator('#chart-style').is_disabled()
                assert await page.locator('#preset-create').is_disabled()
                assert await page.locator('#my-ayanamsa').is_disabled()
                before = await page.locator('#ayanamsa').input_value()
                await page.locator('#ayanamsa').evaluate("s => {s.value='kp'; s.dispatchEvent(new Event('change'));}")
                assert await page.locator('#ayanamsa').input_value() == before
                await page.wait_for_function("document.getElementById('preset-status').textContent.includes('saved to database')")
                assert writes[-1]['choices'] == custom
            await page.locator('#preset-choice').select_option('mine')
            assert await page.locator('#ayanamsa').is_enabled()
            assert await page.locator('#ayanamsa').input_value() == 'raman'
            assert await page.locator('#node-type').input_value() == 'mean'
            await page.locator('#ayanamsa').select_option('kp')
            await page.wait_for_function("document.getElementById('preset-status').textContent.includes('saved to database')")
            assert writes[-1]['choices']['ayanamsa'] == 'kp'
            assert writes[-1]['selectedPreset'] == 'custom'
        elif mode == 'rapid':
            await page.wait_for_function("!document.getElementById('result').hidden")
            await page.locator('#tab-settings').click()
            await page.locator('#ayanamsa').select_option('raman')
            await page.locator('#node-type').select_option('mean')
            await page.wait_for_timeout(100)
            assert charts[-1]['ayanamsa'] == 'raman' and charts[-1]['trueNode'] is False
            assert charts[-1]['date'] == '1961-08-04' and charts[-1]['time'] == '19:24:00'
            latest_table = await page.locator('#graha-tables').inner_text()
            chart_release.set()
            await page.wait_for_timeout(100)
            assert await page.locator('#graha-tables').inner_text() == latest_table
            assert await page.locator('#ayanamsa').input_value() == 'raman'
            assert await page.locator('#node-type').input_value() == 'mean'
        elif mode in ['save-order', 'save-failure']:
            await page.wait_for_function("!document.getElementById('result').hidden")
            await page.locator('#tab-saved').click()
            await page.get_by_role('button', name='Chart B', exact=True).click()
            await page.wait_for_function("document.getElementById('result-name').textContent === 'Chart B'")
            save_release.set()
            await page.wait_for_timeout(100)
            await page.locator('#edit-button').click()
            await page.locator('#birth-form').evaluate('f => f.requestSubmit()')
            await page.wait_for_timeout(200)
            saves = [w for w in writes if 'entry' in w]
            assert len(saves) == 2 and saves[-1]['id'] == 'record-b', saves
            assert saves[-1]['entry']['name'] == 'Chart B'
        elif mode == 'chart-order':
            await page.wait_for_function("!document.getElementById('preset-choice').disabled")
            await page.locator('#tab-saved').click()
            await page.get_by_role('button', name='Chart A', exact=True).click()
            await page.get_by_role('button', name='Chart B', exact=True).click()
            await page.wait_for_function("document.getElementById('result-name').textContent === 'Chart B'")
            chart_release.set()
            await page.wait_for_timeout(150)
            assert await page.locator('#result-name').inner_text() == 'Chart B'
        elif mode == 'metadata':
            await page.wait_for_function("document.querySelector('#birth-form button.primary').disabled")
            await page.locator('#celebrity').evaluate('n => n.checked=true')
            await page.locator('#person-note').evaluate("n => n.value='Later unrelated input'")
            chart_release.set()
            await page.wait_for_function("!document.getElementById('result').hidden")
            await page.wait_for_timeout(100)
            entry = next(w['entry'] for w in writes if 'entry' in w)
            assert entry['celebrity'] is False and entry['note'] == ''
        elif mode == 'cancel':
            await page.wait_for_function("document.querySelector('#birth-form button.primary').disabled")
            await page.locator('#tab-add').click()
            chart_release.set()
            await page.wait_for_timeout(150)
            assert await page.locator('#name').input_value() == ''
            assert not [w for w in writes if 'entry' in w]
        assert not errors, errors
        print('  ok  ' + mode, flush=True)
    finally:
        load_release.set()
        save_release.set()
        chart_release.set()
        await context.close()

async def main(base):
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        try:
            for mode in ['startup', 'load-retry', 'presets', 'rapid', 'save-order', 'save-failure', 'chart-order', 'metadata', 'cancel']:
                await check(browser, base, mode)
        finally:
            await browser.close()

if __name__ == '__main__':
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0),
        functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        asyncio.run(main('http://127.0.0.1:' + str(server.server_port)))
    finally:
        server.shutdown()
        server.server_close()
