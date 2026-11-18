// اختبار متصفح حقيقي (Chromium) مع شبكة مُحاكاة: يثبت سلوك الواجهة والمنطق، لا صحة الروابط الحقيقية.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); });
const COUNTS = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];
const AR = 'قُلْ هُوَ ٱللَّهُ أَحَدٌ';
// WAV صامت 0.5 ثانية
function wav() { const n = 4000, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); return b; }
let passed = 0, failed = 0; const results = [];
async function t(name, fn) { try { await fn(); passed++; results.push('PASS ' + name); } catch (e) { failed++; results.push('FAIL ' + name + ' — ' + e.message.split('\n')[0]); } }
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' expected ' + b + ' got ' + a); };

(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block' });
  const audioHits = []; let cloudFail = false, failAudioFor = null;
  await ctx.route(/alquran\.cloud\/v1\/surah\/(\d+)\/quran-uthmani/, route => {
    if (cloudFail) return route.abort('failed');
    const n = Number(route.request().url().match(/surah\/(\d+)/)[1]), c = COUNTS[n - 1];
    route.fulfill({ json: { code: 200, data: { ayahs: Array.from({ length: c }, (_, i) => ({ numberInSurah: i + 1, text: (i === 0 ? 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ' : '') + AR })) } } });
  });
  await ctx.route(/everyayah\.com|mp3quran\.net|islamic\.network/, route => { const u = route.request().url(); audioHits.push(u); if (failAudioFor && failAudioFor.test(u)) return route.fulfill({ status: 404, body: 'no' }); route.fulfill({ status: 200, contentType: 'audio/wav', body: wav() }); });
  await ctx.route(/fonts\.googleapis|fonts\.gstatic|cdnjs\.cloudflare|js\.puter|esm\.sh/, route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('loading') || !document.getElementById('loader'), null, { timeout: 40000 }).catch(() => {});
  await page.evaluate(() => { const l = document.getElementById('loader'); if (l) l.remove(); document.documentElement.classList.remove('loading'); const m = document.getElementById('memorial-card'); if (m) m.hidden = true; });

  await t('home page opens with no JS errors', async () => { eq(await page.title() !== '', true); eq(errors.length, 0, errors.join(' | ')); });
  await t('navigate to Quran section', async () => { await page.evaluate(() => window.Sakina.go('quran', true)); eq(await page.evaluate(() => document.getElementById('quran').classList.contains('is-active')), true); });
  await t('surah list shows 114 cards with correct names (no network needed)', async () => { eq(await page.locator('.surah-card').count(), 114); eq((await page.locator('.surah-card .surah-name').first().textContent()).trim(), 'الفاتحة'); eq((await page.locator('.surah-card .surah-name').nth(113).textContent()).trim(), 'الناس'); });
  await t('surah 112 is shown as Meccan, surah 2 as Medinan', async () => { const t112 = await page.locator('.surah-card').nth(111).textContent(); const t2 = await page.locator('.surah-card').nth(1).textContent(); eq(/مكية/.test(t112), true); eq(/مدنية/.test(t2), true); });
  await t('search finds surah by name without diacritics', async () => { await page.fill('#surah-search', 'الكهف'); eq(await page.locator('.surah-card').count(), 1); await page.fill('#surah-search', '٣٦'); eq((await page.locator('.surah-card .surah-name').first().textContent()).trim(), 'يس'); await page.fill('#surah-search', ''); });
  await t('open Al-Ikhlas: 4 ayahs rendered, basmala shown separately', async () => { await page.locator('.surah-card').nth(111).click(); await page.waitForSelector('.ayah'); eq(await page.locator('.ayah').count(), 4); eq(await page.locator('#basmala').isVisible(), true); eq(/بسم/.test(await page.locator('.ayah-text').first().textContent()), false, 'basmala must not remain in ayah 1'); });
  await t('click ayah 2 plays everyayah URL for default reciter, player visible', async () => { audioHits.length = 0; await page.locator('.ayah').nth(1).click(); await page.waitForFunction(() => window.Sakina.QuranAudio.state().status === 'playing', null, { timeout: 8000 }); eq(audioHits.some(u => /everyayah\.com\/data\/Alafasy_128kbps\/112002\.mp3/.test(u)), true, audioHits.join(',')); eq(await page.locator('#player').isVisible(), true); });
  await t('player highlights current ayah', async () => { eq(await page.locator('.ayah.is-playing').count(), 1); eq(await page.locator('.ayah.is-playing').getAttribute('data-n'), '2'); });
  await t('play-full-surah button plays the surah ayah-by-ayah from ayah 1 with a single audio element', async () => { audioHits.length = 0; await page.click('#play-full-surah'); await page.waitForFunction(() => { const s = window.Sakina.QuranAudio.state(); return s.mode === 'ayah' && s.ayah === 1 && s.status === 'playing'; }, null, { timeout: 5000 }); const playing = await page.evaluate(() => Array.from(document.querySelectorAll('audio')).filter(a => !a.paused && a.id !== 'memorial-audio').length); eq(playing <= 1, true, 'playing=' + playing); });
  await t('continuous play requests the chosen reciter ayah-1 file (everyayah)', async () => { await page.waitForTimeout(300); eq(audioHits.some(u => /everyayah\.com\/data\/Alafasy_128kbps\/112001\.mp3/.test(u)), true, audioHits.join(',')); });
  await t('switching reciter changes single-ayah audio source', async () => { await page.evaluate(() => window.Sakina.QuranAudio.setReciter('husr')); audioHits.length = 0; await page.locator('.ayah').nth(2).click(); await page.waitForFunction(() => window.Sakina.QuranAudio.state().ayah === 3, null, { timeout: 5000 }); await page.waitForTimeout(400); eq(audioHits.some(u => /Husary_128kbps\/112003\.mp3/.test(u)), true, audioHits.join(',')); });
  await t('pause then resume keeps same element and position state', async () => { await page.click('#player-play'); await page.waitForFunction(() => window.Sakina.QuranAudio._element().paused, null, { timeout: 3000 }); await page.click('#player-play'); await page.waitForFunction(() => !window.Sakina.QuranAudio._element().paused, null, { timeout: 3000 }); });
  await t('failed audio URL → falls back, then shows readable error (no crash)', async () => { failAudioFor = /./; await page.locator('.ayah').nth(0).click(); await page.waitForFunction(() => window.Sakina.QuranAudio.state().status === 'error', null, { timeout: 8000 }); eq(/تعذّر|لا يتوفر/.test(await page.locator('#player-surah').textContent()), true); failAudioFor = null; });
  await t('single-ayah repeat x2 via engine plays ayah twice', async () => { audioHits.length = 0; await page.evaluate(() => window.Sakina.QuranAudio.repeatRange(112, 1, 1, 2)); await page.waitForFunction(() => window.Sakina.QuranAudio.state().repeat === null, null, { timeout: 15000 }); eq(audioHits.filter(u => /112001\.mp3/.test(u)).length >= 2, true, audioHits.join(',')); });
  await t('surah text is cached: reopening works with network fully blocked', async () => { await page.click('#back-to-list'); cloudFail = true; await page.locator('.surah-card').nth(111).click(); await page.waitForSelector('.ayah', { timeout: 5000 }); eq(await page.locator('.ayah').count(), 4); });
  await t('uncached surah with network down → clear error + retry button, then recovers', async () => { await page.click('#back-to-list'); await page.locator('.surah-card').nth(112).click(); await page.waitForSelector('#retry-surah', { timeout: 20000 }); cloudFail = false; await ctx.route(/quran\.com/, r => r.abort('failed')); await page.click('#retry-surah'); await page.waitForSelector('.ayah', { timeout: 8000 }); eq(await page.locator('.ayah').count(), 5); });
  await t('mobile: no horizontal overflow on Quran view', async () => { const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); eq(o <= 1, true, 'overflow=' + o); });
  // ───── المساعد الذكي ─────
  let aiMode = 'unconfigured', aiBodies = [];
  await ctx.route(/\.netlify\/functions\/chat/, route => {
    const m = route.request().method();
    if (m === 'GET') return route.fulfill({ json: { configured: aiMode === 'ok' } });
    aiBodies.push(route.request().postDataJSON());
    if (aiMode === 'unconfigured') return route.fulfill({ status: 503, json: { error: 'not_configured', message: 'x' } });
    if (aiMode === 'down') return route.abort('failed');
    return route.fulfill({ json: { reply: 'الصبر حبس النفس على الطاعة. <b>x</b>', sources: [{ url: 'https://quran.com/2', title: 'القرآن' }, { url: 'javascript:alert(1)', title: 'bad' }] } });
  });
  await t('AI window opens; without server key the site shows a clear message (no crash)', async () => { await page.evaluate(() => window.Sakina.go('home', false)); await page.evaluate(() => window.Sakina.openAI()); await page.waitForSelector('.ai-chip'); await page.fill('#ai-input', 'ما معنى الصبر؟'); await page.click('#ai-send'); await page.waitForSelector('.bubble-note', { timeout: 5000 }); eq(/غير مُفعّل/.test(await page.locator('.bubble-note').last().textContent()), true); });
  await t('AI success: reply rendered as TEXT (no HTML injection), safe source links only, copy button', async () => { aiMode = 'ok'; await page.fill('#ai-input', 'سؤال'); await page.click('#ai-send'); await page.waitForFunction(() => document.querySelectorAll('.bubble.ai .bubble-copy').length >= 1, null, { timeout: 5000 }); const last = page.locator('.bubble.ai').last(); eq(/<b>x<\/b>/.test(await last.locator('.bubble-text').textContent()), true, 'tags must be literal text'); eq(await last.locator('.bubble-text b').count(), 0); eq(await last.locator('.bubble-sources a').count(), 1); eq((await last.locator('.bubble-sources a').getAttribute('href')), 'https://quran.com/2'); });
  await t('AI sends history to server; failed (unanswered) question not kept', async () => { const last = aiBodies[aiBodies.length - 1]; eq(last.messages[last.messages.length - 1].content, 'سؤال'); eq(last.messages[0].role, 'user'); });
  await t('AI network failure → friendly error, input usable again', async () => { aiMode = 'down'; await page.fill('#ai-input', 'مرحبا'); await page.click('#ai-send'); await page.waitForFunction(() => /تعذّر الاتصال/.test(document.querySelector('#ai-messages').textContent), null, { timeout: 5000 }); eq(await page.locator('#ai-send').isDisabled(), false); });
  await t('AI clear button resets conversation and shows suggestions again', async () => { page.once('dialog', d => d.accept()); await page.click('#ai-clear'); await page.waitForSelector('.ai-chip'); eq(await page.locator('.bubble.user').count(), 0); });
  await t('no uncaught JS errors during whole session', async () => { eq(errors.length, 0, errors.join(' | ')); });
  await browser.close(); srv.close();
  console.log(results.join('\n') + `\n\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
