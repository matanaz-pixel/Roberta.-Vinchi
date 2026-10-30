"""בדיקות דפדפן לאפליקציית המלאי (stock.html). דורש: python3 + playwright + chromium.
הרצה:  python3 tests/browser/stock_browser_test.py
הבדיקה מפעילה שרת http מקומי על הריפו, מדמה את Apps Script (אישור מכשיר והגדרות) ואת Firebase (stub בזיכרון עם
אותם כללים: ילד חדש בלבד, צורת ספירה, t לא יותר משעה קדימה). לא נוגעת באינטרנט."""
import asyncio, json, os, subprocess, sys, time, socket, signal
from playwright.async_api import async_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
results = []
def check(name, ok, extra=''):
    results.append(bool(ok))
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok or extra == '' else ' | ' + str(extra)[:400]))

HEAD = 'מוצר,יחידה,ראשון,שני,שלישי,רביעי,חמישי,שישי,שבת,מתכון,הערה'
XSS = '<img src=x onerror=window.__xss=1>'
CSV = {
  'cold': '\n'.join([HEAD,
    'סחוג,ליטר,,,,4,6,,,סחוג,',
    'מטבוחה,"ק""ג",,,,3,3,,,,',
    f'"{XSS}",יח׳,,,,2,,,,,',
    'פסטו,ליטר,,,,,2,,,,',
    'חומוס,"ק""ג",,,,5,5,,,,לא להקפיא']),
  'hot': '\n'.join([HEAD, 'קרם כרובית,ליטר,,,,6,4,,,קרם כרובית,']),
  'tabun': '\n'.join([HEAD, 'בצק,"ק""ג",,,,10,10,,,,']),
}
# רביעי 28/10/2026 11:00 שעון ישראל (UTC+2 אחרי שינוי השעון)
T0 = int(time.mktime(time.strptime('2026-10-28 09:00:00', '%Y-%m-%d %H:%M:%S'))) * 1000
import calendar
T0 = calendar.timegm(time.strptime('2026-10-28 09:00:00', '%Y-%m-%d %H:%M:%S')) * 1000

STUB = r"""
(() => {
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const store = clone(window.__seed) || {};
  const listeners = []; let online = true, rejectNext = false; const pending = []; const writes = [];
  const offset = () => window.__offset || 0;
  const norm = p => String(p || '').split('/').filter(Boolean).join('/');
  const get = p => { let o = store; for(const k of norm(p).split('/').filter(Boolean)){ if(o == null || typeof o !== 'object') return undefined; o = o[k]; } return o; };
  const put = (p, v) => { const ks = norm(p).split('/'); let o = store; for(const k of ks.slice(0, -1)){ if(o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; } o[ks[ks.length - 1]] = clone(v); };
  const snap = p => { let v; if(norm(p) === '.info/serverTimeOffset') v = offset(); else if(norm(p) === '.info/connected') v = online; else v = clone(get(p)); return { val: () => v === undefined ? null : v, exists: () => v != null }; };
  const fireAll = () => listeners.slice().forEach(l => { try{ l.cb(snap(l.path)); }catch(e){ console.error('stub listener', e); } });
  const deny = () => { const e = new Error('PERMISSION_DENIED'); e.code = 'PERMISSION_DENIED'; return e; };
  const serverNow = () => Date.now() + offset();
  function valid(path, v){
    const m = /^stock\/(\d{4}-\d{2}-\d{2})\/(cold|hot|tabun)\/([^/]+)$/.exec(norm(path));
    if(!m || v == null || typeof v !== 'object') return false;
    if(Object.keys(v).some(k => !['t', 'by', 'items'].includes(k))) return false;
    if(typeof v.t !== 'number' || v.t <= 1700000000000 || v.t > serverNow() + 3600000) return false;
    if(typeof v.by !== 'string' || v.by.length < 1 || v.by.length > 40) return false;
    const ks = Object.keys(v.items || {}); if(!ks.length || ks.length > 150) return false;
    return ks.every(k => k.length <= 60 && typeof v.items[k] === 'number' && v.items[k] >= 0 && v.items[k] <= 100000);
  }
  function apply(path, val){
    if(get(path) !== undefined) throw deny();
    if(rejectNext){ rejectNext = false; throw deny(); }
    if(!valid(path, val)) throw deny();
    put(path, val); writes.push({ path: norm(path), val: clone(val) }); fireAll();
  }
  const ref = path => ({
    path: norm(path),
    child: c => ref(norm(path) + '/' + c),
    push(){ const id = '-Kstub' + Math.random().toString(36).slice(2, 10); const r = ref(norm(path) + '/' + id); r.key = id; return r; },
    set(val){ return new Promise((res, rej) => { if(!online){ pending.push({ path, val, res, rej }); return; } try{ apply(path, val); res(); }catch(e){ rej(e); } }); },
    on(evt, cb){ listeners.push({ path: norm(path), cb }); setTimeout(() => cb(snap(path)), 0); return cb; },
    off(evt, cb){ const i = listeners.findIndex(l => l.cb === cb); if(i >= 0) listeners.splice(i, 1); },
    once(){ return Promise.resolve(snap(path)); },
  });
  window.firebase = { initializeApp(){}, database: () => ({ ref: p => ref(p) }) };
  window.__fb = { store, writes, pending, setOnline(b){ online = b; fireAll(); if(b){ pending.splice(0).forEach(p => { try{ apply(p.path, p.val); p.res(); }catch(e){ p.rej(e); } }); } }, rejectNext(){ rejectNext = true; } };
})();
"""

def init_script(target, skew_extra=0, seed=None, offset=0):
    return f"""
(() => {{ const RD = Date; window.__skew = {target} - RD.now() + {skew_extra};
  class FD extends RD {{ constructor(...a){{ if(a.length === 0) super(RD.now() + window.__skew); else super(...a); }} static now(){{ return RD.now() + window.__skew; }} }}
  window.Date = FD; window.__seed = {json.dumps(seed) if seed else 'null'}; window.__offset = {offset}; }})();
"""

class Srv:
    def __init__(self, status='ok'): self.status = status; self.posts = []; self.gets = 0; self.old = False; self.net = True
    def body(self):
        if self.old: return 'ok'
        if self.status == 'ok': return json.dumps({'status': 'ok', 'name': 'דני', 'code': 'ABCD', 'stations': CSV})
        if self.status == 'unknown': return json.dumps({'status': 'unknown'})
        return json.dumps({'status': self.status, 'name': 'דני', 'code': 'ABCD'})

async def mk_ctx(b, base, srv, target=T0, skew_extra=0, seed=None, offset=0):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, locale='he-IL', timezone_id='Asia/Jerusalem', service_workers='block')
    await ctx.add_init_script(init_script(target, skew_extra, seed, offset))
    async def gs(route):
        req = route.request; h = {'access-control-allow-origin': '*'}
        if not srv.net: return await route.abort()
        if req.method == 'POST':
            d = json.loads(req.post_data); srv.posts.append(d)
            if d.get('a') == 'request': srv.status = 'pending'
            return await route.fulfill(status=200, body=srv.body(), headers=h)
        srv.gets += 1
        return await route.fulfill(status=200, body=srv.body(), headers=h)
    await ctx.route('**/script.google.com/**', gs)
    await ctx.route('**/www.gstatic.com/firebasejs/**', lambda r: r.fulfill(status=200, content_type='text/javascript', body=STUB if 'app-compat' in r.request.url else ''))
    await ctx.route('**/fonts.*/**', lambda r: r.abort())
    return ctx

async def new_page(ctx, errs):
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    return pg

async def fill_count(pg, vals):
    for name, v in vals.items():
        await pg.locator('.row', has_text=name).locator('input').fill(str(v))

def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

async def main():
    port = free_port()
    http = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    base = f'http://127.0.0.1:{port}'
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            errs = []

            # ---------- A. שער ----------
            srv = Srv('unknown'); ctx = await mk_ctx(b, base, srv); pg = await new_page(ctx, errs)
            await pg.goto(base + '/stock.html'); await pg.wait_for_selector('.gate-box input[type=text]:not(.hp)')
            check('A1 unknown device sees gate, app hidden', await pg.locator('#app').is_hidden() and await pg.locator('.card, .st').count() == 0)
            await pg.fill('.gate-box input[type=text]:not(.hp)', 'דני'); await pg.click('.gate-box button.primary')
            await pg.wait_for_selector('.gate .code')
            check('A2 request sent with 32-hex device id', srv.posts and srv.posts[0]['a'] == 'request' and len(srv.posts[0]['dev']) == 32, srv.posts)
            srv.status = 'ok'; await pg.click('.gate-box button.primary')
            await pg.wait_for_selector('.st', timeout=10000)
            check('A3 approved: home with 3 stations', await pg.locator('.st').count() == 3)
            await ctx.close()

            # ---------- B-H: זרימה מלאה ----------
            srv = Srv('ok'); ctx = await mk_ctx(b, base, srv); pg = await new_page(ctx, errs)
            await pg.goto(base + '/stock.html'); await pg.wait_for_selector('.st')
            txt = await pg.locator('.stations').inner_text()
            check('B1 home: three stations, none counted yet', all(n in txt for n in ['פס קר', 'פס חם', 'טאבון']) and txt.count('עדיין לא נספר היום') == 3, txt)
            check('B2 today chip is Wednesday and pressed', 'רביעי' in await pg.locator('.chip[aria-pressed=true]').first.inner_text())
            check('B3 viewport 390: no horizontal scroll', await pg.evaluate('document.documentElement.scrollWidth <= 390'))
            await pg.screenshot(path='/tmp/stock_home.png')

            await pg.locator('.st', has_text='פס קר').click(); await pg.wait_for_selector('.row')
            names = await pg.locator('.row .nm').all_inner_texts()
            check('C1 count shows only products with a base today (פסטו hidden)', len(names) == 4 and 'פסטו' not in names, names)
            await pg.fill('#sender-in', 'דני'); await pg.locator('.bar .btn').click()
            check('C2 empty save shows a clear message and saves nothing', not await pg.locator('.bar .btn').is_disabled() and 'לפחות מוצר' in await pg.locator('.banner.err[role=alert]').inner_text())
            check('C3 xss product name rendered as text', XSS in names and await pg.evaluate('window.__xss === undefined') and await pg.locator('.row img').count() == 0)
            await pg.locator('.row', has_text='סחוג').locator('input').fill('1')
            await pg.locator('.row', has_text='מטבוחה').locator('button.step').nth(1).click()    # + מ-ריק = 1
            await pg.locator('.row', has_text='חומוס').locator('input').fill('5,5')               # פסיק עשרוני
            check('C4 progress shows 3 of 4', '3 מתוך 4' in await pg.locator('.progress').inner_text())
            await pg.screenshot(path='/tmp/stock_count.png')
            await pg.fill('#sender-in', ''); await pg.locator('.bar .btn').click()
            check('C5 name required when unknown', 'השם' in await pg.locator('.banner.err').inner_text())
            await pg.fill('#sender-in', 'דני')
            await pg.locator('.bar .btn').dblclick()                                                  # לחיצה כפולה
            await pg.wait_for_selector('.need')
            await pg.wait_for_timeout(300)
            w = await pg.evaluate('window.__fb.writes')
            check('D1 double click saves exactly one count', len(w) == 1, w)
            c1 = w[0]['val'] if w else {}
            check('D2 stored shape {t,by,items}, sanitized keys, no xss key', set(c1) == {'t', 'by', 'items'} and c1['by'] == 'דני' and set(c1['items']) == {'סחוג', 'מטבוחה', 'חומוס'} and c1['items']['חומוס'] == 5.5, c1)
            check('D3 written under today date and station', w and w[0]['path'].startswith('stock/2026-10-28/cold/'), w and w[0]['path'])
            body = await pg.locator('#view').inner_text()
            needs = await pg.locator('.need .nm').all_inner_texts()
            check('E1 prep: to-prepare list sorted by need ratio (סחוג then מטבוחה)', needs == ['סחוג', 'מטבוחה'], needs)
            qs = await pg.locator('.need .pq input').evaluate_all('els => els.map(e => e.value)')
            check('E2 quantities = base - have (3, 2)', qs == ['3', '2'], qs)
            check('E3 enough group has חומוס, uncounted group has the xss name as text', 'מספיק (1)' in body and 'לא נספר (1)' in body and XSS in body and await pg.evaluate('window.__xss === undefined'))
            href = await pg.locator('.need a').first.get_attribute('href')
            check('E4 recipe link deep-links to the book', href == './recipes.html#q=' + '%D7%A1%D7%97%D7%95%D7%92', href)
            wa = await pg.locator('a.wa').get_attribute('href')
            from urllib.parse import unquote
            wt = unquote(wa)
            check('E5 whatsapp text has station, products and quantities', wa.startswith('https://wa.me/?text=') and 'פס קר' in wt and 'סחוג' in wt and '3' in wt, wt)
            # הטבח מחליט כמה להכין: ההודעה מציגה יש, להכין ו"מספיק עד", ומכילה את כל מוצרי הפס
            check('E6 coverage line shown per prep row', await pg.locator('.need .cov').count() == 2 and 'מספיק' in (await pg.locator('.need .cov').first.inner_text()) or 'לא מספיק' in (await pg.locator('.need .cov').first.inner_text()), await pg.locator('.need .cov').all_inner_texts())
            check('E7 whatsapp lists counted, enough and uncounted products', 'יש ' in wt and 'להכין 3' in wt and 'חומוס' in wt and 'לא נספר' in wt, wt)
            await pg.locator('.need').first.locator('button.step', has_text='+').click()
            wt2 = unquote(await pg.locator('a.wa').get_attribute('href'))
            vals2 = await pg.locator('.need .pq input').evaluate_all('els => els.map(e => e.value)')
            check('E8 plus changes the amount and the whatsapp text live', vals2[0] == '3.5' and 'סחוג: יש 1 ליטר, להכין 3.5' in wt2, (vals2, wt2))
            await pg.locator('.need .pq input').first.fill('4')
            wt3 = unquote(await pg.locator('a.wa').get_attribute('href'))
            check('E9 typed amount reaches whatsapp', 'להכין 4' in wt3, wt3)
            await pg.go_back(); await pg.wait_for_selector('.st'); await pg.locator('.st', has_text='פס קר').click(); await pg.wait_for_selector('.need')
            check('E10 chosen amount survives leaving and returning', (await pg.locator('.need .pq input').first.input_value()) == '4')
            await pg.locator('.need .pq input').first.fill('3')
            await pg.screenshot(path='/tmp/stock_prep.png')

            # יום אחר: מחר (חמישי): סחוג 6-1=5, מטבוחה 3-1=2, פסטו חדש לא נספר
            await pg.go_back(); await pg.wait_for_selector('.st')
            home = await pg.locator('.stations').inner_text()
            check('F0 home shows who/when and count of items', 'נספר ב-11:00 על ידי דני' in home and '2 להכין' in home, home)
            await pg.locator('.chip', has_text='מחר').click()
            home2 = await pg.locator('.stations').inner_text()
            check('F1 tomorrow base applied on home (3 to prepare: סחוג, מטבוחה, חומוס 5.5>5 no)', 'נספר ב-11:00' in home2 and ('2 להכין' in home2) and 'לא נספרו' in home2, home2)
            await pg.locator('.st', has_text='פס קר').click(); await pg.wait_for_selector('.need')
            needs2 = await pg.locator('.need .pq input').evaluate_all('els => els.map(e => e.value)')
            check('F2 tomorrow prep quantities (5 and 2)', needs2 == ['5', '2'], needs2)
            await pg.go_back(); await pg.wait_for_selector('.st')
            await pg.locator('.chip', has_text='היום').click()
            await pg.locator('.st', has_text='פס קר').click(); await pg.wait_for_selector('.need')

            # ספירה שנייה: האחרונה פעילה, הקודמת בהיסטוריה
            await pg.wait_for_timeout(1100)
            await pg.locator('.btn', has_text='ספירה חדשה').click(); await pg.wait_for_selector('.row')
            check('G0 new count starts empty (draft cleared after save)', await pg.locator('.progress').inner_text() == 'נספרו 0 מתוך 4')
            await fill_count(pg, {'סחוג': 4, 'מטבוחה': 0})
            await pg.locator('.bar .btn').click(); await pg.wait_for_selector('.need, .empty')
            await pg.wait_for_timeout(300)
            w = await pg.evaluate('window.__fb.writes')
            check('G1 second count written as a new child', len(w) == 2 and w[0]['path'] != w[1]['path'], [x['path'] for x in w])
            needs3 = await pg.locator('.need .pq input').evaluate_all('els => els.map(e => e.value)')
            check('G2 latest count is the active one (מטבוחה 3 to prepare, סחוג 0)', needs3 == ['3'], needs3)
            await pg.go_back(); await pg.go_back(); await pg.wait_for_selector('.st')
            await pg.locator('.link', has_text='היסטוריה').click(); await pg.wait_for_selector('.hc')
            hc = await pg.locator('.hc').all_inner_texts()
            check('H1 history lists both counts of today, one marked active', len(hc) == 2 and sum('פעילה' in x for x in hc) == 1, hc)
            await pg.locator('.hc').nth(1).click(); await pg.wait_for_selector('.need')
            sub = await pg.locator('#view').inner_text()
            check('H2 older count opens its own prep list with note about current settings', 'לפי ההגדרות הנוכחיות' in sub and await pg.locator('.need .nm').first.inner_text() == 'סחוג', sub)
            await pg.screenshot(path='/tmp/stock_hist.png')
            check('Z1 no console/page errors in main flow', errs == [], errs)
            snapshot = await pg.evaluate('window.__fb.store')
            await ctx.close()

            # ---------- XSS מ-Firebase ----------
            seed = {'stock': {'2026-10-28': {'hot': {
                '-a1': {'t': T0 - 5000, 'by': '<img src=x onerror=window.__xss2=1>', 'items': {'קרם כרובית': 1}},
                '-a2': {'t': 'oops', 'by': 'x', 'items': {'קרם כרובית': 1}},
                '-a3': {'t': T0 - 9000, 'by': 'זיוף', 'items': 'bad'}}}}}
            srv = Srv('ok'); ctx = await mk_ctx(b, base, srv, seed=seed); pg = await new_page(ctx, errs)
            await pg.goto(base + '/stock.html'); await pg.wait_for_selector('.st')
            home = await pg.locator('.stations').inner_text()
            check('X1 malicious "by" shown as text only; malformed counts ignored', '<img src=x onerror=window.__xss2=1>' in home and await pg.evaluate('window.__xss2 === undefined') and await pg.locator('.st img').count() == 0, home)
            await ctx.close()

            # ---------- טיוטה ושתי תחנות ----------
            srv = Srv('ok'); ctx = await mk_ctx(b, base, srv); pg = await new_page(ctx, errs)
            await pg.goto(base + '/stock.html#/count/cold'); await pg.wait_for_selector('.row')
            await fill_count(pg, {'סחוג': 2}); await pg.reload(); await pg.wait_for_selector('.row')
            check('I1 unsaved draft survives reload', await pg.locator('.row', has_text='סחוג').locator('input').input_value() == '2')
            await pg.goto(base + '/stock.html#/count/hot'); await pg.wait_for_selector('.row')
            check('I2 other station has its own (empty) draft', await pg.locator('.progress').inner_text() == 'נספרו 0 מתוך 1')
            await fill_count(pg, {'קרם כרובית': 3})
            await pg.goto(base + '/stock.html#/count/cold'); await pg.wait_for_selector('.row')
            check('I3 first station draft intact after visiting second', await pg.locator('.row', has_text='סחוג').locator('input').input_value() == '2')
            # ערך לא תקין
            await fill_count(pg, {'מטבוחה': 'abc'}); await pg.fill('#sender-in', 'דנה')
            await pg.locator('.bar .btn').click()
            check('I4 invalid value blocks save and marks the row', await pg.locator('.row.bad').count() == 1 and await pg.evaluate('window.__fb.writes.length') == 0)
            await fill_count(pg, {'מטבוחה': '-3'}); await pg.locator('.bar .btn').click()
            check('I5 negative value rejected', await pg.evaluate('window.__fb.writes.length') == 0)
            await ctx.close()

            # ---------- בלי קליטה באמצע ספירה ----------
            srv = Srv('ok'); ctx = await mk_ctx(b, base, srv); pg = await new_page(ctx, errs)
            await pg.goto(base + '/stock.html#/count/cold'); await pg.wait_for_selector('.row')
            await pg.evaluate('window.__fb.setOnline(false)')
            await fill_count(pg, {'סחוג': 1}); await pg.fill('#sender-in', 'דני'); await pg.locator('.bar .btn').click()
            await pg.wait_for_selector('.need')
            check('J1 offline save shows prep immediately (optimistic)', await pg.locator('.need .nm').first.inner_text() == 'סחוג')
            await pg.wait_for_timeout(4500)
            bn = await pg.locator('#banners').inner_text()
            check('J2 offline banner + pending count shown', 'ממתינות לשליחה' in bn and 'אין קליטה' in bn, bn)
            await pg.reload(); await pg.wait_for_selector('.need')
            check('J3 pending count survives reload (outbox)', await pg.locator('.need .nm').first.inner_text() == 'סחוג')
            await pg.evaluate('window.__fb.setOnline(true)'); await pg.wait_for_timeout(2500)
            w = await pg.evaluate('window.__fb.writes')
            bn = await pg.locator('#banners').inner_text()
            check('J4 back online: exactly one write, banner cleared', len(w) == 1 and 'ממתינות' not in bn and 'אין קליטה' not in bn, (w, bn))
            # דחייה מהשרת
            await pg.goto(base + '/stock.html#/count/hot'); await pg.wait_for_selector('.row')
            await pg.evaluate('window.__fb.rejectNext()'); await fill_count(pg, {'קרם כרובית': 1}); await pg.locator('.bar .btn').click()
            await pg.wait_for_timeout(800)
            check('J5 rejected write shows an error banner and leaves the outbox', 'נדחתה' in await pg.locator('#banners').inner_text() and await pg.evaluate("JSON.parse(localStorage.getItem('sk-outbox-v1')||'[]').length") == 0)
            await ctx.close()

            # ---------- שעון מכשיר שגוי ----------
            two_days = 2 * 24 * 3600 * 1000
            srv = Srv('ok'); ctx = await mk_ctx(b, base, srv, skew_extra=two_days, offset=-two_days); pg = await new_page(ctx, errs)
            await pg.goto(base + '/stock.html#/count/cold'); await pg.wait_for_selector('.row')
            await fill_count(pg, {'סחוג': 1}); await pg.fill('#sender-in', 'דני'); await pg.locator('.bar .btn').click(); await pg.wait_for_selector('.need')
            w = await pg.evaluate('window.__fb.writes')
            check('K1 device clock +2 days: count still written under the real server date', len(w) == 1 and w[0]['path'].startswith('stock/2026-10-28/'), w and w[0]['path'])
            check('K2 clock banner shown', 'השעון במכשיר' in await pg.locator('#banners').inner_text())
            await ctx.close()

            # ---------- חצות באמצע ספירה ----------
            late = calendar.timegm(time.strptime('2026-10-28 21:59:30', '%Y-%m-%d %H:%M:%S')) * 1000
            srv = Srv('ok'); ctx = await mk_ctx(b, base, srv, target=late); pg = await new_page(ctx, errs)
            await pg.goto(base + '/stock.html#/count/cold'); await pg.wait_for_selector('.row')
            await fill_count(pg, {'סחוג': 1}); await pg.fill('#sender-in', 'דני')
            await pg.evaluate('window.__skew += 90000'); await pg.evaluate('checkDate()')
            await pg.locator('.bar .btn').click(); await pg.wait_for_timeout(800)
            await pg.wait_for_selector('.need')
            w = await pg.evaluate('window.__fb.writes')
            check('L1 count opened before midnight is stored under the date it started', len(w) == 1 and w[0]['path'].startswith('stock/2026-10-28/cold/'), w and w[0]['path'])
            await pg.evaluate("location.hash = '#/'"); await pg.wait_for_selector('.st')
            check('L2 after midnight home treats the new day as empty', 'עדיין לא נספר היום' in await pg.locator('.stations').inner_text())
            await ctx.close()

            # ---------- שרת ישן / חסימה / קליטה ----------
            srv = Srv('ok'); srv.old = True; ctx = await mk_ctx(b, base, srv); pg = await new_page(ctx, errs)
            await pg.goto(base + '/stock.html'); await pg.wait_for_selector('.gate-box h1')
            check('M1 old server without cache: clear message', 'לא מעודכן' in await pg.locator('.gate-box h1').inner_text())
            await ctx.close()
            srv = Srv('ok'); ctx = await mk_ctx(b, base, srv); pg = await new_page(ctx, errs)
            await pg.goto(base + '/stock.html'); await pg.wait_for_selector('.st')
            srv.net = False; await pg.reload(); await pg.wait_for_selector('.st')
            check('M2 offline with cached settings: app opens with banner', 'הגדרות מוצרים שנשמרו' in await pg.locator('#banners').inner_text())
            await pg.evaluate("(()=>{const c=JSON.parse(localStorage.getItem('sk-defs-v1')); c.ts=Date.now()-20*86400e3; localStorage.setItem('sk-defs-v1', JSON.stringify(c));})()")
            await pg.reload(); await pg.wait_for_selector('.gate-box h1')
            check('M3 offline with 20-day-old cache: gate asks to connect', 'אין חיבור' in await pg.locator('.gate-box h1').inner_text())
            srv.net = True; srv.status = 'ok'; await pg.click('.gate-box button.primary'); await pg.wait_for_selector('.st')
            srv.status = 'blocked'; await pg.reload(); await pg.wait_for_selector('.gate-box h1')
            check('M4 blocked: locked, cache wiped, home emptied', 'אין גישה' in await pg.locator('.gate-box h1').inner_text() and await pg.evaluate("localStorage.getItem('sk-defs-v1')") is None and await pg.locator('.st').count() == 0)
            await ctx.close()

            # ---------- נגישות בסיסית ----------
            srv = Srv('ok'); ctx = await mk_ctx(b, base, srv); pg = await new_page(ctx, errs)
            bad = []
            for h in ['#/', '#/count/cold', '#/history']:
                await pg.goto(base + '/stock.html' + h); await pg.wait_for_selector('#view > *')
                bad += await pg.evaluate("""() => [...document.querySelectorAll('#view button, #view input, #view select, #view a')].filter(e => { const n = (e.getAttribute('aria-label') || e.textContent || '').trim(); const l = e.id && document.querySelector('label[for="'+e.id+'"]'); return !n && !l; }).map(e => e.outerHTML.slice(0, 80))""")
            check('N1 every control has an accessible name', not bad, bad)
            small = await pg.evaluate("""() => { const out = []; document.querySelectorAll('#view button, #view a.btn, #view input, #view select').forEach(e => { const r = e.getBoundingClientRect(); if(r.width && (r.height < 44 || r.width < 44) && !e.classList.contains('hp')) out.push((e.className || e.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); }); return out; }""")
            check('N2 touch targets at least 44px (history page)', not small, small)
            await ctx.close()

            # ---------- #q= בספר ----------
            ctx = await b.new_context(viewport={'width': 390, 'height': 844}, locale='he-IL', service_workers='block')
            csv_rec = 'קטגוריה,שם,מצרכים,הוראות הכנה,הערות\nפס חם,קרם כרובית,"חמאה 400 גרם\nכרובית 2 ק""ג",מבשלים,\nפס קר,סחוג,עגבניות 1 ק"ג,טוחנים,'
            async def gs2(route):
                if route.request.method == 'POST': return await route.fulfill(status=200, body='ok')
                await route.fulfill(status=200, body=json.dumps({'status': 'ok', 'name': 'x', 'code': 'AAAA', 'csv': csv_rec, 'extra': ''}), headers={'access-control-allow-origin': '*'})
            await ctx.route('**/script.google.com/**', gs2); await ctx.route('**/fonts.*/**', lambda r: r.abort())
            pg = await new_page(ctx, errs)
            await pg.goto(base + '/recipes.html#q=%D7%A7%D7%A8%D7%9D%20%D7%9B%D7%A8%D7%95%D7%91%D7%99%D7%AA'); await pg.wait_for_selector('.card')
            check('Q1 book: #q= fills search and filters to the recipe', await pg.input_value('#search') == 'קרם כרובית' and await pg.locator('.card').count() == 1)
            await ctx.close()
            check('Z2 no console/page errors anywhere', errs == [], errs)
            await b.close()
    finally:
        http.send_signal(signal.SIGTERM)
    print('\n%d/%d passed' % (sum(results), len(results)))
    sys.exit(0 if all(results) else 1)

asyncio.run(main())
