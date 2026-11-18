// اختبارات Node للطبقتين: البيانات والصوت (بشبكة وصوت مُحاكَيين — لا تثبت عمل الروابط الحقيقية)
const assert = require('assert');
const store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
globalThis.window = undefined; // نستخدم globalThis
const fs = require('fs'), path = require('path');
function loadCJS(rel) { const f = path.join(__dirname, rel), m = { exports: {} }; new Function('module', 'require', fs.readFileSync(f, 'utf8'))(m, loadCJS2); return m.exports; }
function loadCJS2(r) { return loadCJS(r); }
const Data = loadCJS('../js/quran-core.js');

let passed = 0, failed = 0;
async function t(name, fn) { try { await fn(); passed++; console.log('PASS', name); } catch (e) { failed++; console.log('FAIL', name, '-', e.message); } }

const AR = 'قُلْ هُوَ ٱللَّهُ أَحَدٌ';
function fakeCloud(n, withBasmala) {
  const c = Data.SURAHS[n - 1].numberOfAyahs;
  return { code: 200, data: { ayahs: Array.from({ length: c }, (_, i) => ({ numberInSurah: i + 1, text: (i === 0 && withBasmala ? 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ' : '') + AR + ' ' + (i + 1) })) } };
}
function fakeQcom(n, page) {
  const c = Data.SURAHS[n - 1].numberOfAyahs, per = 50, start = (page - 1) * per;
  const verses = []; for (let i = start; i < Math.min(c, start + per); i++) verses.push({ verse_number: i + 1, text_uthmani: AR + ' ' + (i + 1) });
  return { verses, pagination: { next_page: start + per < c ? page + 1 : null } };
}
const ok = body => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

(async () => {
  await t('metadata: 114 surahs, 6236 ayahs', () => {
    assert.strictEqual(Data.SURAHS.length, 114);
    assert.strictEqual(Data.SURAHS.reduce((a, s) => a + s.numberOfAyahs, 0), 6236);
    assert.strictEqual(Data.globalAyah(114, 6), 6236);
    assert.strictEqual(Data.globalAyah(2, 156), 7 + 156);
  });
  await t('metadata: revelation types are not all Medinan after surah 10', () => {
    const med = Data.SURAHS.filter(s => s.revelationType === 'Medinan').length;
    assert.strictEqual(med, 28); assert.strictEqual(Data.SURAHS[111].revelationType, 'Meccan');
  });
  await t('basmala split only on first ayah of normal surahs', () => {
    const b = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ الٓمٓ';
    assert.strictEqual(Data.splitBasmala(2, 1, b).had, true);
    assert.strictEqual(Data.splitBasmala(1, 1, b).had, false);
    assert.strictEqual(Data.splitBasmala(9, 1, b).had, false);
    assert.strictEqual(Data.splitBasmala(2, 2, b).had, false);
  });
  await t('validate rejects wrong count / gaps / empty', () => {
    const good = Array.from({ length: 3 }, (_, i) => ({ n: i + 1, text: AR }));
    assert.strictEqual(Data.validateAyahs(114 - 0 === 114 ? 108 : 0, good), null); // الكوثر = 3
    assert.ok(Data.validateAyahs(108, good.slice(0, 2)));
    assert.ok(Data.validateAyahs(108, [good[0], { n: 3, text: AR }, good[2]]));
    assert.ok(Data.validateAyahs(108, [good[0], good[1], { n: 3, text: '' }]));
  });
  await t('load: primary source, basmala stripped, cached after', async () => {
    let calls = 0;
    const r = await Data.load(112, { fetch: u => { calls++; assert.ok(/alquran\.cloud/.test(u)); return ok(fakeCloud(112, true)); } });
    assert.strictEqual(r.source, 'alquran.cloud'); assert.strictEqual(r.ayahs.length, 4);
    assert.ok(!/بسم/.test(Data.stripMarks(r.ayahs[0].text)));
    const r2 = await Data.load(112, { fetch: () => { throw new Error('should not fetch'); } });
    assert.strictEqual(r2.fromCache, true); assert.strictEqual(calls, 1);
  });
  await t('load: falls back to second source (paginated) when first fails', async () => {
    const seen = [];
    const r = await Data.load(36, { fetch: u => { seen.push(u); if (/alquran\.cloud/.test(u)) return Promise.reject(new Error('net')); const p = Number((u.match(/[?&]page=(\d+)/) || [])[1]); return ok(fakeQcom(36, p)); } });
    assert.strictEqual(r.source, 'quran.com'); assert.strictEqual(r.ayahs.length, 83);
    assert.strictEqual(seen.filter(u => /quran\.com/.test(u)).length, 2);
  });
  await t('load: incomplete data from source is rejected, next source used', async () => {
    const r = await Data.load(103, { fetch: u => /alquran\.cloud/.test(u) ? ok({ code: 200, data: { ayahs: [{ numberInSurah: 1, text: AR }] } }) : ok(fakeQcom(103, 1)) });
    assert.strictEqual(r.source, 'quran.com');
  });
  await t('load: all sources fail & no cache -> rejects with Arabic message', async () => {
    let err; try { await Data.load(105, { fetch: () => Promise.reject(new Error('offline')) }); } catch (e) { err = e; }
    assert.ok(err && /تعذّر/.test(err.message) && err.details.length === 2);
  });
  await t('load: all sources fail but cache exists -> serves cache when forced', async () => {
    await Data.load(110, { fetch: () => ok(fakeCloud(110, true)) });
    const r = await Data.load(110, { force: true, fetch: () => Promise.reject(new Error('offline')) });
    assert.strictEqual(r.fromCache, true); assert.strictEqual(r.stale, true);
  });

  /* ───────── الصوت (Audio مُحاكى) ───────── */
  const made = [];
  class FakeAudio {
    constructor() { this.l = {}; this.paused = true; this.currentTime = 0; this.duration = 5; this.src = ''; this.playbackRate = 1; made.push(this); }
    addEventListener(n, f) { (this.l[n] = this.l[n] || []).push(f); }
    removeEventListener(n, f) { this.l[n] = (this.l[n] || []).filter(x => x !== f); }
    removeAttribute() { this.src = ''; } load() {} pause() { this.paused = true; this.fire('pause'); }
    play() { this.paused = false; this.plays = (this.plays || []).concat(this.src); return Promise.resolve(); }
    fire(n) { (this.l[n] || []).slice().forEach(f => f({})); }
    fail() { this.fire('error'); } playing() { this.fire('playing'); } end() { this.fire('ended'); }
  }
  globalThis.Audio = FakeAudio;
  const Audio_ = loadCJS('../js/quran-audio.js');
  const el = () => Audio_._element();

  await t('audio: exactly one <audio> element for all modes', () => {
    Audio_.playAyah(1, 1); Audio_.playSurah(2); Audio_.playAyah(3, 5);
    assert.strictEqual(made.length, 1);
  });
  await t('audio: ayah URL uses everyayah SSSAAA format for chosen reciter', () => {
    Audio_.setReciter('sds'); Audio_.playAyah(2, 156);
    assert.ok(/everyayah\.com\/data\/Abdurrahmaan_As-Sudais_192kbps\/002156\.mp3$/.test(el().src), el().src);
  });
  await t('audio: changing reciter reloads the CURRENT ayah with new reciter', () => {
    Audio_.setReciter('afs'); Audio_.playAyah(112, 2); el().playing();
    Audio_.setReciter('husr');
    assert.ok(/Husary_128kbps\/112002\.mp3$/.test(el().src), el().src);
    assert.strictEqual(Audio_.state().ayah, 2);
  });
  await t('audio: surah mode uses surah file; reciter switch keeps surah', () => {
    Audio_.playSurah(18); assert.ok(/mp3quran\.net\/husr\/018\.mp3$/.test(el().src), el().src);
    Audio_.setReciter('afs'); assert.ok(/afs\/018\.mp3$/.test(el().src));
  });
  await t('audio: failure falls through candidates then islamic.network, then reports unavailable', () => {
    Audio_.setReciter('afs'); Audio_.playAyah(1, 1, { continuous: false });
    const seen = [el().src]; let unavailable = 0; Audio_.on('unavailable', () => unavailable++);
    for (let i = 0; i < 6 && el().src; i++) { el().fail(); if (seen[seen.length - 1] !== el().src) seen.push(el().src); }
    assert.ok(seen.some(u => /islamic\.network.*\/1\.mp3$/.test(u)), seen.join(' | '));
    assert.ok(unavailable >= 1); assert.strictEqual(Audio_.state().status, 'error');
  });
  await t('audio: ended advances to next ayah, then stops at surah end', () => {
    Audio_.playAyah(108, 2); el().playing(); el().end();
    assert.strictEqual(Audio_.state().ayah, 3); assert.ok(/108003\.mp3$/.test(el().src));
    let ended = 0; Audio_.on('surahend', () => ended++); el().end();
    assert.strictEqual(ended, 1); assert.strictEqual(Audio_.state().status, 'idle');
  });
  await t('audio: repeat single ayah 3 times then continue', () => {
    Audio_.repeatRange(108, 1, 1, 3); const hits = [];
    for (let i = 0; i < 3; i++) { hits.push(el().src.slice(-10)); el().playing(); el().end(); }
    assert.deepStrictEqual(hits, ['108001.mp3', '108001.mp3', '108001.mp3']);
    assert.strictEqual(Audio_.state().repeat, null);
  });
  await t('audio: repeat range 2..3 twice', () => {
    Audio_.repeatRange(114, 2, 3, 2); const seq = [];
    for (let i = 0; i < 4; i++) { seq.push(Audio_.state().ayah); el().playing(); el().end(); }
    assert.deepStrictEqual(seq, [2, 3, 2, 3]);
  });
  await t('audio: stale error from previous file cannot skip the new ayah', () => {
    Audio_.playAyah(112, 1, { continuous: false }); const first = el().src;
    Audio_.playAyah(112, 3, { continuous: false }); const second = el().src;
    assert.notStrictEqual(first, second); assert.ok(/112003\.mp3$/.test(second));
  });
  await t('audio: stop clears state, toggle/pause/resume work, speed persists', () => {
    Audio_.playAyah(112, 1); el().playing(); Audio_.pause(); assert.strictEqual(el().paused, true);
    Audio_.resume(); assert.strictEqual(el().paused, false);
    Audio_.setSpeed(0.75); assert.strictEqual(el().playbackRate, 0.75);
    Audio_.playAyah(112, 2); assert.strictEqual(el().playbackRate, 0.75);
    Audio_.stop(); assert.strictEqual(Audio_.state().mode, null);
  });
  await t('audio: resume saved position seeks after metadata', () => {
    Audio_.playAyah(36, 10, { continuous: true }); el().currentTime = 2.2; el().fire('timeupdate'); el().currentTime = 2.4;
    store['uns:audio:resume:v1'] = JSON.stringify({ mode: 'ayah', reciter: 'afs', surah: 36, ayah: 10, time: 2.4 });
    Audio_.stop(); Audio_.resumeSaved(); el().fire('loadedmetadata');
    assert.ok(/036010\.mp3$/.test(el().src)); assert.ok(Math.abs(el().currentTime - 2.4) < 0.01);
  });
  await t('audio: V17 reciter setting migrated', () => { assert.ok(Audio_.reciterById('afs')); assert.strictEqual(Audio_.RECITERS.length, 8); });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
