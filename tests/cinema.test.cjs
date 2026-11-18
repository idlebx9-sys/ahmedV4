// اختبارات الطبقة السينمائية والميزات الجديدة (وضع التأمل، مؤقت النوم، الاختصارات، تقليل الحركة، بلا JS).
// Chromium حقيقي عبر Playwright بشبكة مُحاكاة؛ لا يثبت صحة روابط خدمات القرآن الحقيقية.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/home/claude/.npm-global/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); });
const AR = 'قُلْ هُوَ ٱللَّهُ أَحَدٌ';
function wav() { const n = 4000, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); return b; }
let passed = 0, failed = 0; const results = [];
async function t(name, fn) { try { await fn(); passed++; results.push('PASS ' + name); } catch (e) { failed++; results.push('FAIL ' + name + ' — ' + e.message.split('\n')[0]); } }
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' expected ' + b + ' got ' + a); };
const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const nums = s => (s.match(/[\d.]+/g) || []).map(Number);

async function mk(browser, opts) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block' }, opts || {}));
  await ctx.route(/alquran\.cloud\/v1\/surah\/(\d+)\/quran-uthmani/, route => { route.fulfill({ json: { code: 200, data: { ayahs: Array.from({ length: 4 }, (_, i) => ({ numberInSurah: i + 1, text: (i === 0 ? 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ' : '') + AR })) } } }); });
  await ctx.route(/everyayah\.com|mp3quran\.net|islamic\.network/, route => route.fulfill({ status: 200, contentType: 'audio/wav', body: wav() }));
  await ctx.route(/fonts\.googleapis|fonts\.gstatic|cdnjs\.cloudflare|js\.puter|esm\.sh/, route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  return ctx;
}
async function boot(page, base) {
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => window.Sakina && window.Sakina.go && window.Sakina.Cinema, null, { timeout: 40000 });
  await page.evaluate(() => { const l = document.getElementById('loader'); if (l) l.remove(); document.documentElement.classList.remove('loading'); const m = document.getElementById('memorial-card'); if (m) m.hidden = true; });
}

(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await mk(browser); const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await boot(page, base);

  // ── الهوية البصرية ──
  await t('body is near-black (cinema palette wins over old navy layers)', async () => { eq(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(4, 6, 5)'); });
  await t('ambient light layer exists, is decorative (aria-hidden) and non-interactive', async () => { const r = await page.evaluate(() => { const a = document.querySelector('.cine-ambient'); return a && { h: a.getAttribute('aria-hidden'), pe: getComputedStyle(a).pointerEvents, pos: getComputedStyle(a).position }; }); eq(r.h, 'true'); eq(r.pe, 'none'); eq(r.pos, 'fixed'); });
  await t('site header is black-emerald, not the old navy (3,7,17)', async () => { const c = await page.evaluate(() => getComputedStyle(document.getElementById('site-header')).backgroundColor); const n = nums(c); eq(n[0] <= 6 && n[1] <= 8 && n[2] <= 8, true, c); });
  await t('hero primary button is emerald (not gold) and text/bg contrast >= 4.5:1', async () => {
    const r = await page.evaluate(() => { const b = document.querySelector('.hero .btn-light'); const cs = getComputedStyle(b); return { bg: cs.backgroundImage, color: cs.color }; });
    const stops = r.bg.match(/rgb\(\d+, \d+, \d+\)/g); const first = nums(stops[0]), text = nums(r.color);
    eq(first[1] > first[0] && first[1] > first[2], true, 'first stop not green: ' + stops[0]);
    const cr = ratio(first, text); eq(cr >= 4.5, true, 'contrast=' + cr.toFixed(2));
  });
  await t('hero secondary button is a glass outline (visually different from primary)', async () => { const r = await page.evaluate(() => { const a = getComputedStyle(document.querySelector('.hero .btn-light')).backgroundImage, b = getComputedStyle(document.querySelector('.hero .btn-glass')).backgroundImage; return a !== b; }); eq(r, true); });

  // ── وضع التأمل ──
  await page.evaluate(() => window.Sakina.go('quran', true));
  await t('focus mode refuses to start while no surah is open', async () => { const r = await page.evaluate(() => window.Sakina.Cinema.setFocus(true)); eq(r, false); eq(await page.evaluate(() => document.body.classList.contains('cine-focus')), false); });
  await page.locator('.surah-card').nth(111).click(); await page.waitForSelector('.ayah');
  await t('focus button enters focus mode: header/toolbar hidden, HUD visible, aria-pressed=true', async () => {
    await page.click('#cine-focus');
    eq(await page.evaluate(() => document.body.classList.contains('cine-focus')), true);
    eq(await page.locator('#cine-hud').isVisible(), true);
    eq(await page.getAttribute('#cine-focus', 'aria-pressed'), 'true');
    eq(await page.evaluate(() => getComputedStyle(document.getElementById('site-header')).display), 'none');
    eq(await page.evaluate(() => getComputedStyle(document.getElementById('quran-toolbar')).display), 'none');
  });
  await t('in focus mode while playing: non-current ayahs dimmed, current ayah fully lit; player stays usable', async () => {
    await page.evaluate(() => window.Sakina.QuranAudio.repeatRange(112, 2, 2, 40));   // آية ثابتة: القياس في الحالة المستقرة
    await page.waitForFunction(() => window.Sakina.QuranAudio.state().status === 'playing', null, { timeout: 8000 });
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => ({ cur: getComputedStyle(document.querySelector('.ayah.is-playing')).opacity, other: getComputedStyle(document.querySelector('.ayah:not(.is-playing)')).opacity, player: !document.getElementById('player').hidden }));
    eq(Number(r.cur), 1, 'cur'); eq(Number(r.other) < .5, true, 'other=' + r.other); eq(r.player, true);
  });
  await t('font size buttons change --cine-fs and persist in localStorage; clamped to 0.8..1.7', async () => {
    const before = await page.evaluate(() => window.Sakina.Cinema.getFontScale());
    await page.click('#cine-fs-up'); const up = await page.evaluate(() => window.Sakina.Cinema.getFontScale()); eq(up > before, true);
    eq(await page.evaluate(() => localStorage.getItem('uns_cine_fs')), String(up));
    for (let i = 0; i < 20; i++) await page.click('#cine-fs-up'); eq(await page.evaluate(() => window.Sakina.Cinema.getFontScale()), 1.7);
    for (let i = 0; i < 30; i++) await page.click('#cine-fs-down'); eq(await page.evaluate(() => window.Sakina.Cinema.getFontScale()), .8);
    await page.evaluate(() => window.Sakina.Cinema.setFontScale(1));
  });
  await t('Escape exits focus mode and restores header', async () => { await page.evaluate(() => document.activeElement && document.activeElement.blur()); await page.keyboard.press('Escape'); eq(await page.evaluate(() => document.body.classList.contains('cine-focus')), false); eq(await page.evaluate(() => getComputedStyle(document.getElementById('site-header')).display !== 'none'), true); eq(await page.locator('#cine-hud').isVisible(), false); });
  await t('navigating to another section exits focus mode', async () => { await page.evaluate(() => window.Sakina.Cinema.setFocus(true)); eq(await page.evaluate(() => window.Sakina.Cinema.isFocus()), true); await page.evaluate(() => window.Sakina.go('home', true)); eq(await page.evaluate(() => window.Sakina.Cinema.isFocus()), false); await page.evaluate(() => window.Sakina.go('quran', true)); });

  // ── اختصارات لوحة المفاتيح ──
  await t('keyboard: Space toggles pause/resume when no control is focused', async () => {
    await page.evaluate(() => window.Sakina.QuranAudio.repeatRange(112, 1, 1, 40));
    await page.waitForFunction(() => window.Sakina.QuranAudio.state().status === 'playing', null, { timeout: 8000 });
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('Space'); await page.waitForFunction(() => window.Sakina.QuranAudio.state().status === 'paused', null, { timeout: 4000 });
    await page.keyboard.press('Space'); await page.waitForFunction(() => window.Sakina.QuranAudio.state().status === 'playing', null, { timeout: 4000 });
  });
  await t('keyboard: N moves to the next ayah, P back', async () => {
    await page.evaluate(() => window.Sakina.quran.playAyah(0)); await page.waitForFunction(() => window.Sakina.QuranAudio.state().ayah === 1, null, { timeout: 5000 });
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('n'); await page.waitForFunction(() => window.Sakina.QuranAudio.state().ayah === 2, null, { timeout: 5000 });
    await page.keyboard.press('p'); await page.waitForFunction(() => window.Sakina.QuranAudio.state().ayah === 1, null, { timeout: 5000 });
  });
  await t('keyboard: shortcuts ignored while typing in an input', async () => {
    await page.evaluate(() => window.Sakina.QuranAudio.repeatRange(112, 1, 1, 40)); await page.waitForFunction(() => window.Sakina.QuranAudio.state().status === 'playing', null, { timeout: 8000 });
    await page.evaluate(() => { const i = document.createElement('input'); i.id = 'tmp-in'; document.body.appendChild(i); i.focus(); });
    await page.keyboard.press('Space'); await page.waitForTimeout(300);
    eq(await page.evaluate(() => window.Sakina.QuranAudio.state().status), 'playing'); await page.evaluate(() => document.getElementById('tmp-in').remove());
  });

  // ── مؤقت النوم ──
  await t('sleep select shows a countdown, and "off" clears it', async () => {
    await page.selectOption('#cine-sleep', '10'); eq(/ينتهي بعد/.test(await page.textContent('#cine-sleep-left')), true); eq(await page.evaluate(() => window.Sakina.Cinema.sleepActive()), true);
    await page.selectOption('#cine-sleep', '0'); eq(await page.evaluate(() => window.Sakina.Cinema.sleepActive()), false); eq((await page.textContent('#cine-sleep-left')).trim(), '');
  });
  await t('sleep timer fades volume, then pauses playback, restores volume=1 and resets the select', async () => {
    await page.evaluate(() => window.Sakina.QuranAudio.repeatRange(112, 1, 1, 60)); await page.waitForFunction(() => window.Sakina.QuranAudio.state().status === 'playing', null, { timeout: 8000 });
    await page.evaluate(() => window.Sakina.Cinema.setSleep(0.05));            // 3 ثوانٍ
    await page.waitForFunction(() => window.Sakina.QuranAudio._element().volume < 0.99, null, { timeout: 4000 });   // بدأ التلاشي
    await page.waitForFunction(() => window.Sakina.QuranAudio.state().status === 'paused', null, { timeout: 6000 });
    eq(await page.evaluate(() => window.Sakina.QuranAudio._element().volume), 1, 'volume restored');
    eq(await page.inputValue('#cine-sleep'), '0'); eq(/توقّفت التلاوة/.test(await page.textContent('#cine-sleep-left')), true);
    eq(await page.evaluate(() => window.Sakina.Cinema.sleepActive()), false);
  });
  await t('after the timer fired, the saved position allows resuming', async () => { eq(await page.evaluate(() => !!window.Sakina.QuranAudio.getSaved()), true); });

  // ── تخطيط ──
  await t('mobile 390px: no horizontal overflow on home and Quran list/reader', async () => {
    for (const p of ['home', 'quran']) { await page.evaluate(p => window.Sakina.go(p, true), p); await page.waitForTimeout(400); const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); eq(o <= 1, true, p + ' overflow=' + o); }
  });
  await t('no uncaught JS errors in main session', async () => { eq(errors.length, 0, errors.join(' | ')); });
  await ctx.close();

  // ── تقليل الحركة ──
  const rctx = await mk(browser, { reducedMotion: 'reduce' }); const rp = await rctx.newPage(); await boot(rp, base);
  await t('prefers-reduced-motion: no reveal classes, ambient animations disabled', async () => {
    eq(await rp.locator('.cine-reveal').count(), 0);
    const r = await rp.evaluate(() => ({ a: getComputedStyle(document.querySelector('.cine-ambient'), '::before').animationName, g: getComputedStyle(document.querySelector('.cine-grain')).animationName }));
    eq(r.a, 'none'); eq(r.g, 'none');
  });
  await rctx.close();

  // ── بلا JavaScript: لا يجوز إخفاء أي محتوى ──
  const nctx = await mk(browser, { javaScriptEnabled: false }); const np = await nctx.newPage();
  await np.goto(base, { waitUntil: 'load' });
  await np.waitForTimeout(1500);                // انتهاء حركة دخول الهيرو الأصلية قبل القياس
  await t('JS disabled: hero and cards stay fully visible (reveal never hides content)', async () => {
    eq(await np.locator('.cine-reveal').count(), 0);
    const op = await np.evaluate(() => getComputedStyle(document.querySelector('.hero-title')).opacity); eq(Number(op) > 0, true);
    const vis = await np.locator('.hero-title').isVisible(); eq(vis, true);
  });
  await nctx.close();

  await browser.close(); srv.close();
  console.log(results.join('\n') + `\n\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
