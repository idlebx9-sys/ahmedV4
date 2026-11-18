// اختبارات الصفحة الرئيسية: لا بيانات وهمية، ربط القيم بالتخزين الحقيقي، الاختصارات، وعدم تجاوز العرض (360/390/430/768/1440).
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/home/claude/.npm-global/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'x' }); r.end(fs.readFileSync(f)); });
let ok = 0, bad = 0; const out = [];
async function t(n, fn) { try { await fn(); ok++; out.push('PASS ' + n); } catch (e) { bad++; out.push('FAIL ' + n + ' — ' + e.message.split('\n')[0]); } }
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' expected ' + b + ' got ' + a); };
async function open(browser, w, seed) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, serviceWorkers: 'block' });
  await ctx.route(/fonts\.|cdnjs|puter|esm|alquran|everyayah|mp3quran/, r => r.abort());
  if (seed) await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { for (const k in s) localStorage.setItem(k, s[k]); sessionStorage.setItem('seeded', '1'); } }, seed);
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:' + srv.address().port + '/');
  await page.waitForFunction(() => window.Sakina && window.Sakina.go, null, { timeout: 30000 });
  await page.evaluate(() => { const l = document.getElementById('loader'); if (l) l.remove(); document.documentElement.classList.remove('loading'); const m = document.getElementById('memorial-card'); if (m) m.hidden = true; });
  page.errs = errs; return page;
}
(async () => {
  await new Promise(r => srv.listen(0, r)); const b = await chromium.launch();
  await t('clean storage: activity shows an empty state, no invented numbers', async () => {
    const p = await open(b, 390); await p.waitForTimeout(300);
    eq(await p.locator('#home-empty').isVisible(), true, 'empty visible'); eq(await p.locator('#home-stats').isVisible(), false, 'stats hidden');
    eq(await p.locator('#home-continue-text').textContent(), 'ابدأ القراءة'); await p.context().close();
  });
  await t('hijri + gregorian dates and a daily message are rendered', async () => {
    const p = await open(b, 390); const d = await p.locator('#home-dates').textContent(); if (!/—/.test(d) || d.length < 15) throw new Error('dates: ' + d);
    if ((await p.locator('#home-daily-msg').textContent()).length < 10) throw new Error('no message'); await p.context().close();
  });
  await t('seeded real storage: every value is read from its source', async () => {
    const seed = { 'sakina:lastRead': JSON.stringify({ n: 18, name: 'الكهف', at: 1 }), 'uns:audio:resume:v1': JSON.stringify({ surah: 18, ayah: 7, mode: 'ayah', reciter: 'afs' }), 'anas_quran_upgrade_v2': JSON.stringify({ readAyahs: 12 }), 'sakina:count:morning:0': '5', 'sakina:count:morning:1': '3', 'unsAhmadNawawiRead': JSON.stringify([1, 2, 3, 4]) };
    const p = await open(b, 390, seed); await p.waitForTimeout(300);
    const g = id => p.locator(id).textContent();
    if (!/الكهف/.test(await g('#hs-last')) || !/٧/.test(await g('#hs-last'))) throw new Error('last: ' + await g('#hs-last'));
    eq(await g('#hs-ayahs'), '١٢'); eq(await g('#hs-adhkar'), '٨'); eq(await g('#hs-nawawi'), '٤ / ٤٠');
    if (!/الكهف/.test(await g('#home-continue-text'))) throw new Error('continue text'); eq(await p.locator('#hs-streak').textContent(), '١'); await p.context().close();
  });
  await t('last-7-days dots reflect real activity days (today is lit)', async () => {
    const p = await open(b, 390); await p.waitForTimeout(300);
    eq(await p.locator('#hs-week .wd').count(), 7); eq(await p.locator('#hs-week .wd.on').count() >= 1, true, 'today lit'); eq(await p.locator('#quick-grid .qa-ico svg use').count(), 10, 'svg icons'); await p.context().close();
  });
  await t('quick grid: 10 shortcuts; a shortcut opens its section', async () => {
    const p = await open(b, 390); eq(await p.locator('#quick-grid .qa').count(), 10);
    await p.locator('#quick-grid .qa-5').click(); await p.waitForTimeout(300); eq(await p.locator('#nawawi').evaluate(e => e.classList.contains('is-active')), true); await p.context().close();
  });
  await t('tool shortcut opens Tools and the target exists', async () => {
    const p = await open(b, 390); await p.locator('#quick-grid .qa-8').click(); await p.waitForTimeout(500);
    eq(await p.locator('#tools').evaluate(e => e.classList.contains('is-active')), true); eq(await p.locator('#prayer-locate').count(), 1); await p.context().close();
  });
  await t('wird button shows a success message', async () => {
    const p = await open(b, 390); await p.locator('#plan-progress-add').click(); await p.waitForTimeout(150); eq(await p.locator('#home-toast').isVisible(), true); await p.context().close();
  });
  for (const w of [360, 390, 430, 768, 1440]) await t('no horizontal overflow and touch targets >= 44px at ' + w, async () => {
    const p = await open(b, w); await p.waitForTimeout(300);
    const r = await p.evaluate(() => ({ o: document.documentElement.scrollWidth - innerWidth, s: Math.min(...[...document.querySelectorAll('#quick-grid .qa,#home-continue')].map(e => e.getBoundingClientRect().height)) }));
    if (r.o > 1) throw new Error('overflow ' + r.o); if (r.s < 44) throw new Error('target ' + r.s); eq(p.errs.length, 0, 'js errors ' + p.errs[0]); await p.context().close();
  });
  await b.close(); srv.close(); console.log(out.join('\n') + '\n\n' + ok + ' passed, ' + bad + ' failed'); process.exit(bad ? 1 : 0);
})();
