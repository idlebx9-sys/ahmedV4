// الأدوات: المجموعات، بقاء كل المعرّفات، وضغط أزرار الأداة دون أخطاء JS.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/home/claude/.npm-global/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'x' }); r.end(fs.readFileSync(f)); });
let ok = 0, bad = 0; const out = [];
async function t(n, fn) { try { await fn(); ok++; out.push('PASS ' + n); } catch (e) { bad++; out.push('FAIL ' + n + ' — ' + e.message.split('\n')[0]); } }
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' expected ' + b + ' got ' + a); };
(async () => {
  await new Promise(r => srv.listen(0, r)); const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block' });
  await ctx.route(/fonts\.|cdnjs|puter|esm|alquran|everyayah|mp3quran/, r => r.abort());
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.dismiss());
  await p.goto('http://localhost:' + srv.address().port + '/'); await p.waitForFunction(() => window.Sakina && window.Sakina.go, null, { timeout: 30000 });
  await p.evaluate(() => { const l = document.getElementById('loader'); if (l) l.remove(); document.documentElement.classList.remove('loading'); const m = document.getElementById('memorial-card'); if (m) m.hidden = true; window.Sakina.go('tools'); });
  await t('tools: 4 groups holding all 15 cards', async () => { eq(await p.locator('#tools .tool-group').count(), 4); eq(await p.locator('#tools .tool-group > .tool-grid > article').count(), 15); });
  await t('tools: every original control id still exists', async () => {
    const ids = ['daily-goal','vocab-card','gregorian-today','tasbeeh-tap','tasbeeh-count','theme-toggle','quran-global-search','prayer-locate','qibla-calc','tts-play','stat-tasbeeh','bookmark-add','names-grid','playlist-list','stat-read-ayahs'];
    for (const i of ids) eq(await p.locator('#' + i).count() >= 1, true, '#' + i);
  });
  await t('tools: tasbeeh tap increments the counter', async () => { const g = async () => Number((await p.locator('#tasbeeh-count').textContent()).replace(/\D/g, '') || 0); const a = await g(); await p.locator('#tasbeeh-tap').click(); eq(await g(), a + 1); });
  await t('tools: theme toggle flips the theme', async () => { const g = () => p.evaluate(() => document.documentElement.classList.contains('light-mode')); const a = await g(); await p.locator('#theme-toggle').click(); if (a === await g()) throw new Error('unchanged'); await p.locator('#theme-toggle').click(); });
  await t('tools: pressing every safe button raises no JS error', async () => {
    const ids = await p.$$eval('#tools button', bs => bs.filter(x => x.id && !/reset|clear|restore|import|export|delete|locate|calc|play|backup/.test(x.id)).map(x => x.id));
    for (const id of ids) { await p.locator('#' + id).scrollIntoViewIfNeeded().catch(() => {}); await p.locator('#' + id).click({ timeout: 2000, force: true }).catch(() => {}); }
    eq(errs.length, 0, errs[0]);
  });
  await t('tools: no horizontal overflow at 360/768', async () => { for (const w of [360, 768]) { await p.setViewportSize({ width: w, height: 800 }); eq(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1), true, 'w' + w); } });
  await b.close(); srv.close(); console.log(out.join('\n') + '\n\n' + ok + ' passed, ' + bad + ' failed'); process.exit(bad ? 1 : 0);
})();
