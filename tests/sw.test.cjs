// اختبار Service Worker في Chromium حقيقي: التسجيل، التخزين المسبق لكل ملفات الواجهة، والإقلاع دون اتصال.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/home/claude/.npm-global/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); });
let passed = 0, failed = 0; const results = [];
async function t(name, fn) { try { await fn(); passed++; results.push('PASS ' + name); } catch (e) { failed++; results.push('FAIL ' + name + ' — ' + e.message.split('\n')[0]); } }
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' expected ' + b + ' got ' + a); };
(async () => {
  // ثابتة (بلا متصفح): كل ملف في قائمة التخزين المسبق موجود، وكل CSS/JS محلي في index.html مدرج فيها
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const shell = (sw.match(/var SHELL = \[([\s\S]*?)\];/)[1].match(/"\.\/([^"]*)"/g) || []).map(s => s.slice(3, -1));
  await t('every SHELL entry exists on disk', async () => { const miss = shell.filter(f => f && !fs.existsSync(path.join(ROOT, f))); eq(miss.length, 0, miss.join(',')); });
  await t('every local CSS/JS referenced by index.html is precached by the service worker', async () => {
    const refs = [...html.matchAll(/(?:href|src)="((?:css|js)\/[^"]+)"/g)].map(m => m[1]); const miss = refs.filter(r => !shell.includes(r)); eq(miss.length, 0, 'not precached: ' + miss.join(','));
  });
  await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port + '/';
  const browser = await chromium.launch(); const ctx = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 390, height: 800 } });
  await ctx.route(/fonts\.googleapis|fonts\.gstatic|cdnjs\.cloudflare|js\.puter|esm\.sh/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: 'load' });
  await t('service worker registers and activates', async () => { const ok = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; }); eq(ok, true); });
  await t('cache v18-3 holds cinema.css, cinema.js and quran-refined.css after install', async () => {
    await page.waitForTimeout(1500);
    const keys = await page.evaluate(async () => { const c = await caches.open('uns-ahmad-shell-v18-3'); return (await c.keys()).map(r => new URL(r.url).pathname); });
    for (const f of ['/css/cinema.css', '/js/cinema.js', '/css/quran-refined.css', '/index.html']) eq(keys.includes(f), true, 'missing ' + f + ' (have ' + keys.length + ')');
  });
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(500);       // الصفحة تحت سيطرة الـ SW الآن
  await t('offline reload: page boots from cache with cinema layer applied', async () => {
    await ctx.setOffline(true); await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.Sakina && window.Sakina.Cinema, null, { timeout: 40000 });
    eq(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(4, 6, 5)'); eq(await page.evaluate(() => document.querySelectorAll('.surah-card').length), 114, 'surah cards offline');
    await ctx.setOffline(false);
  });
  await browser.close(); srv.close();
  console.log(results.join('\n') + `\n\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
