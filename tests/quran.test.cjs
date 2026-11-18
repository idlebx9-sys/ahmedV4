// القرآن: قائمة السور، التصفية، تقدّم القراءة، التنقل، حالة الحفظ دون اتصال، وعلامات الآيات (باستجابة API مُحاكاة).
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/home/claude/.npm-global/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'x' }); r.end(fs.readFileSync(f)); });
let ok = 0, bad = 0; const out = [];
async function t(n, fn) { try { await fn(); ok++; out.push('PASS ' + n); } catch (e) { bad++; out.push('FAIL ' + n + ' — ' + e.message.split('\n').slice(0, 6).join(' | ')); } }
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' expected ' + b + ' got ' + a); };
const AYAH = 'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ';
(async () => {
  await new Promise(r => srv.listen(0, r)); const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block' });
  await ctx.route(/alquran\.cloud\/v1\/surah\/(\d+)\/quran-uthmani/, route => route.fulfill({ json: { code: 200, data: { ayahs: Array.from({ length: ({ 1: 7, 2: 286, 3: 200 })[Number(route.request().url().match(/surah\/(\d+)/)[1])] || 7 }, (_, i) => ({ numberInSurah: i + 1, text: AYAH })) } } }));
  await ctx.route(/everyayah|mp3quran|islamic\.network/, r => r.fulfill({ status: 404, body: 'x' }));
  await ctx.route(/fonts\.|cdnjs|puter|esm/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:' + srv.address().port + '/'); await p.waitForFunction(() => window.Sakina && window.Sakina.go, null, { timeout: 30000 });
  await p.evaluate(() => { const l = document.getElementById('loader'); if (l) l.remove(); document.documentElement.classList.remove('loading'); const m = document.getElementById('memorial-card'); if (m) m.hidden = true; window.Sakina.go('quran'); });
  await t('surah list: 114 cards; offline filter shows a clear empty state before anything is cached', async () => {
    await p.waitForSelector('.surah-card'); eq(await p.locator('.surah-card').count(), 114);
    await p.click('.surah-filter [data-f="offline"]'); eq(await p.locator('.surah-card:visible').count(), 0); eq(await p.locator('.ui-empty').isVisible(), true);
    await p.click('.surah-filter [data-f="all"]'); eq(await p.locator('.surah-card:visible').count(), 114);
  });
  await t('open surah 1: ayah text untouched, progress starts at ayah 1 of 7, prev disabled', async () => {
    await p.locator('.surah-card').nth(0).click(); await p.waitForSelector('.ayah');
    eq(await p.locator('.ayah-text').first().textContent().then(s => s.includes(AYAH)), true, 'text'); eq(await p.locator('.read-progress').isVisible(), true);
    if (!/١ من ٧/.test(await p.locator('.rp-text').textContent())) throw new Error(await p.locator('.rp-text').textContent());
    eq(await p.locator('.surah-pager [data-d="-1"]').isDisabled(), true);
  });
  await t('next surah opens surah 2; scrolling updates the progress label and bar', async () => {
    await p.locator('.surah-pager [data-d="1"]').click(); await p.waitForFunction(() => window.Sakina.quran.currentSurahNumber === 2 && document.querySelectorAll('.ayah').length === 286, null, { timeout: 8000 });
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(500);
    if (/الآية ١ من/.test(await p.locator('.rp-text').textContent())) throw new Error('unchanged');
    eq(Number(await p.locator('.rp-bar').getAttribute('aria-valuenow')) > 50, true);
  });
  await t('ayah bookmark: toggles, persists after reopening, SVG icons (no emoji)', async () => {
    await p.evaluate(() => window.scrollTo(0, 0)); eq(await p.locator('.ayah-tools').first().isVisible(), false, 'tools hidden by default');
    await p.locator('.ayah-num').first().click(); eq(await p.locator('.ayah.is-active .ayah-tools').isVisible(), true, 'tools after tap');
    const btn = p.locator('.ayah.is-active .ayah-tools [data-act="save"]'); await btn.click({ timeout: 4000 }); await p.waitForTimeout(100); eq(await btn.evaluate(e => e.classList.contains('is-saved')), true);
    await p.click('#back-to-list'); await p.locator('.surah-card').nth(1).click(); await p.waitForFunction(() => document.querySelectorAll('.ayah').length === 286, null, { timeout: 8000 }); await p.waitForTimeout(300);
    eq(await p.locator('.ayah.has-mark').count(), 1, 'persist mark'); await p.locator('.ayah-num').first().click();
    eq(await p.locator('.ayah-tools [data-act="save"]').first().evaluate(e => e.classList.contains('is-saved')), true, 'persist');
    eq(await p.locator('.ayah-tools svg').count() >= 4, true, 'svg'); eq(/[\u{1F300}-\u{1FAFF}\u2B50]/u.test(await p.locator('.ayah-tools').first().innerHTML()), false, 'emoji');
    await p.locator('.ayah-tools [data-act="save"]').first().click(); await p.waitForTimeout(100); eq(await p.locator('.ayah.has-mark').count(), 0, 'unsave');
  });
  await t('offline status + filter: opened surahs are marked cached and appear under the offline filter', async () => {
    await p.waitForTimeout(400); eq(await p.locator('.rp-status').textContent(), 'محفوظة دون اتصال');
    await p.click('#back-to-list'); await p.click('.surah-filter [data-f="offline"]'); await p.waitForTimeout(300);
    eq(await p.locator('.surah-card:visible').count() >= 2, true); await p.click('.surah-filter [data-f="all"]');
  });
  await t('last-read badge marks the last opened surah', async () => { eq(await p.locator('.surah-card.is-last .surah-last').count(), 1); });
  await t('touch targets: toolbar buttons and pager >= 44px', async () => {
    await p.locator('.surah-card').nth(0).click(); await p.waitForSelector('.ayah');
    const m = await p.evaluate(() => Math.min(...[...document.querySelectorAll('#quran-toolbar .btn, .surah-pager .btn')].map(e => e.getBoundingClientRect().height)));
    if (m < 44) throw new Error('min ' + m);
  });
  await t('no JS errors and no horizontal overflow at 360/768/1440', async () => {
    for (const w of [360, 768, 1440]) { await p.setViewportSize({ width: w, height: 800 }); eq(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1), true, 'w' + w); }
    eq(errs.length, 0, errs[0]);
  });
  await b.close(); srv.close(); console.log(out.join('\n') + '\n\n' + ok + ' passed, ' + bad + ' failed'); process.exit(bad ? 1 : 0);
})();
