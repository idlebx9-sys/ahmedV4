/* ==========================================================
   أُنس أحمد V18 — quran-audio.js
   محرّك صوت واحد لكل أوضاع التشغيل (عنصر Audio واحد فقط ⇒ لا يتداخل ملفان):
   · وضع الآية: ملف لكل آية، ويتغيّر بتغيّر القارئ
   · وضع السورة: ملف السورة كاملة للقارئ نفسه
   · تعدّد المصادر: إن فشل رابط جُرّب الرابط الاحتياطي، ثم تُتخطى الآية برسالة واضحة
   · استئناف من موضع التوقف، تكرار آية/مجموعة آيات، سرعة، تنقّل بين السور
   لم يُتحقق من الروابط من بيئة التطوير (لا شبكة)؛ صفحة audio-check.html تفحصها من متصفحك.
   ========================================================== */
(function (root) {
  'use strict';

  var App = (root.Sakina = root.Sakina || {});
  var Data = App.QuranData || (typeof require !== 'undefined' ? require('./quran-core.js') : null);

  /* ───────── القرّاء ─────────
     folders : أسماء مجلدات everyayah.com بالترتيب (تُجرَّب عند الفشل؛ ما نجح يُحفظ)
     islamic : معرّف الإصدار في cdn.islamic.network (احتياطي بالرقم العام للآية)
     surah   : مجلد ملفات السور الكاملة في mp3quran.net */
  var RECITERS = [
    { id: 'afs',   ar: 'مشاري راشد العفاسي',    en: 'Mishary Rashid Alafasy',      folders: ['Alafasy_128kbps', 'Alafasy_64kbps'], islamic: 'ar.alafasy',              surah: 'https://server8.mp3quran.net/afs/' },
    { id: 'sds',   ar: 'عبد الرحمن السديس',      en: 'Abdurrahman As-Sudais',       folders: ['Abdurrahmaan_As-Sudais_192kbps', 'Abdurrahmaan_As-Sudais_64kbps'], islamic: 'ar.abdurrahmaansudais', surah: 'https://server11.mp3quran.net/sds/' },
    { id: 'shur',  ar: 'سعود الشريم',            en: 'Saud Ash-Shuraim',            folders: ['Saood_ash-Shuraym_128kbps', 'Saood_ash-Shuraym_64kbps'], islamic: 'ar.saoodshuraym',     surah: 'https://server7.mp3quran.net/shur/' },
    { id: 'maher', ar: 'ماهر المعيقلي',          en: 'Maher Al-Muaiqly',            folders: ['Maher_AlMuaiqly_64kbps', 'MaherAlMuaiqly128kbps'], islamic: 'ar.mahermuaiqly',         surah: 'https://server12.mp3quran.net/maher/' },
    { id: 'basit', ar: 'عبد الباسط عبد الصمد',  en: 'Abdul Basit Abdus-Samad',     folders: ['Abdul_Basit_Murattal_192kbps', 'Abdul_Basit_Murattal_64kbps'], islamic: 'ar.abdulbasitmurattal', surah: 'https://server7.mp3quran.net/basit/' },
    { id: 'husr',  ar: 'محمود خليل الحصري',     en: 'Mahmoud Khalil Al-Husary',    folders: ['Husary_128kbps', 'Husary_64kbps'], islamic: 'ar.husary',                                    surah: 'https://server13.mp3quran.net/husr/' },
    { id: 'minsh', ar: 'محمد صديق المنشاوي',    en: 'Mohamed Siddiq Al-Minshawi',  folders: ['Minshawy_Murattal_128kbps'], islamic: 'ar.minshawi',                                        surah: 'https://server10.mp3quran.net/minsh/' },
    { id: 'shaat', ar: 'أبو بكر الشاطري',        en: 'Abu Bakr Ash-Shaatree',       folders: ['Abu_Bakr_Ash-Shaatree_128kbps', 'Abu_Bakr_Ash-Shaatree_64kbps'], islamic: 'ar.shaatree',   surah: 'https://server11.mp3quran.net/shatri/' }
  ];

  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function reciterById(id) { for (var i = 0; i < RECITERS.length; i++) if (RECITERS[i].id === id) return RECITERS[i]; return null; }

  var LS_STATE = 'uns:audio:state:v1', LS_RESUME = 'uns:audio:resume:v1', LS_FOLDER = 'uns:audio:folder:v1';
  function lsGet(k, d) { try { var v = root.localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { root.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* لا يهم */ } }

  /* ترحيل إعداد القارئ من V17 (anas_quran_upgrade_v2.reciter) دون فقدان اختيار المستخدم */
  var saved = lsGet(LS_STATE, null);
  if (!saved) {
    var old = lsGet('anas_quran_upgrade_v2', {});
    saved = { reciter: old && reciterById(old.reciter) ? old.reciter : 'afs', speed: 1 };
  }
  if (!reciterById(saved.reciter)) saved.reciter = 'afs';

  /* روابط الآية بالترتيب: مجلد ناجح سابقاً ← بقية المجلدات ← الاحتياطي */
  function ayahUrls(rec, s, a) {
    var urls = [], file = pad(s, 3) + pad(a, 3) + '.mp3';
    var prefer = (lsGet(LS_FOLDER, {}) || {})[rec.id];
    var order = rec.folders.slice();
    if (prefer && order.indexOf(prefer) > 0) { order.splice(order.indexOf(prefer), 1); order.unshift(prefer); }
    order.forEach(function (f) { urls.push({ url: 'https://everyayah.com/data/' + f + '/' + file, folder: f }); });
    if (rec.islamic) urls.push({ url: 'https://cdn.islamic.network/quran/audio/128/' + rec.islamic + '/' + Data.globalAyah(s, a) + '.mp3', folder: null });
    return urls;
  }
  function surahUrls(rec, s) { return [{ url: rec.surah + pad(s, 3) + '.mp3', folder: null }]; }

  /* ───────── المحرّك ───────── */
  var listeners = {};
  function emit(name, detail) { (listeners[name] || []).slice().forEach(function (fn) { try { fn(detail); } catch (e) { /* لا نُسقط الباقين */ } }); }

  var audio = null;
  var S = {
    mode: null,            // 'ayah' | 'surah' | null
    status: 'idle',        // idle | loading | playing | paused | error
    reciter: saved.reciter,
    speed: Number(saved.speed) || 1,
    surah: 0, ayah: 0,
    candidates: [], cIdx: 0,
    token: 0,              // يُبطل أحداث الملفات القديمة
    failStreak: 0,
    repeat: null,          // {from,to,remaining,total}  (آية واحدة: from==to)
    loopSurah: false,
    lastError: ''
  };
  var lastSave = 0;

  function setStatus(st, msg) { S.status = st; if (msg !== undefined) S.lastError = msg; emit('state', snapshot()); }
  function snapshot() {
    return { mode: S.mode, status: S.status, reciter: S.reciter, surah: S.surah, ayah: S.ayah, speed: S.speed, loopSurah: S.loopSurah, error: S.lastError, repeat: S.repeat ? { from: S.repeat.from, to: S.repeat.to, remaining: S.repeat.remaining, total: S.repeat.total } : null };
  }

  function ensure() {
    if (audio) return audio;
    var A = root.Audio || root.webkitAudio;
    if (!A) return null;
    audio = new A();
    audio.preload = 'auto';
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', function () { emit('time', { current: audio.currentTime, duration: audio.duration }); });
    audio.addEventListener('playing', function () { S.failStreak = 0; foundWorking(S.token); setStatus('playing', ''); });
    audio.addEventListener('pause', function () { if (S.status === 'playing') setStatus('paused'); });
    audio.addEventListener('waiting', function () { if (S.status === 'playing') emit('buffering', true); });
    audio.addEventListener('canplay', function () { emit('buffering', false); });
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return audio;
  }

  function onTime() {
    emit('time', { current: audio.currentTime, duration: audio.duration });
    var now = Date.now();
    if (now - lastSave > 1000 && S.mode && audio.currentTime > 0.5) { lastSave = now; persistResume(); }
  }
  function persistResume() {
    if (!S.mode) return;
    lsSet(LS_RESUME, { mode: S.mode, reciter: S.reciter, surah: S.surah, ayah: S.ayah, time: audio ? audio.currentTime : 0, at: Date.now() });
  }

  /* تحميل الملف الحالي: يجرّب المرشّحين بالتسلسل */
  function startCandidates(candidates, startTime) {
    var a = ensure();
    if (!a) { setStatus('error', 'المتصفح لا يدعم تشغيل الصوت'); return; }
    S.candidates = candidates; S.cIdx = 0; S.token++;
    loadCandidate(startTime || 0);
  }
  function loadCandidate(startTime) {
    var a = audio, token = S.token, c = S.candidates[S.cIdx];
    setStatus('loading', '');
    try { a.pause(); } catch (e) { /* لا يهم */ }
    a.src = c.url;
    a.defaultPlaybackRate = S.speed; a.playbackRate = S.speed;
    if (startTime > 0) {
      var seek = function () { a.removeEventListener('loadedmetadata', seek); if (token === S.token) { try { a.currentTime = Math.max(0, Math.min(startTime, (a.duration || startTime + 1) - 0.5)); } catch (e) { /* لا يهم */ } } };
      a.addEventListener('loadedmetadata', seek);
    }
    var p = a.play();
    if (p && p.catch) p.catch(function (err) {
      if (token !== S.token) return;                      // طلب أقدم أُلغي
      if (err && err.name === 'AbortError') return;       // استُبدل المصدر أثناء التحميل
      if (err && err.name === 'NotAllowedError') { setStatus('paused', 'منع المتصفح التشغيل التلقائي — اضغط زر التشغيل'); return; }
      handleLoadFailure(token);
    });
  }
  function onError() {
    if (!audio || !audio.src || !S.mode) return;
    handleLoadFailure(S.token);
  }
  function handleLoadFailure(token) {
    if (token !== S.token) return;
    if (S.cIdx + 1 < S.candidates.length) { S.cIdx++; loadCandidate(0); return; }
    // لا مصدر يعمل لهذا الملف
    S.failStreak++;
    var who = (reciterById(S.reciter) || {}).ar || '';
    var msg = S.mode === 'ayah'
      ? 'لا يتوفر تسجيل للآية ' + S.ayah + ' بصوت ' + who + ' أو تعذّر الاتصال'
      : 'تعذّر تشغيل السورة بصوت ' + who + ' — جرّب قارئاً آخر أو تحقق من الاتصال';
    emit('unavailable', { surah: S.surah, ayah: S.ayah, mode: S.mode, reciter: S.reciter });
    if (S.mode === 'ayah' && S.failStreak < 3 && S.ayah < Data.surah(S.surah).numberOfAyahs && S._continuous) {
      setStatus('loading', msg + ' — الانتقال للتالية');
      var next = S.ayah + 1;
      setTimeout(function () { if (token === S.token) playAyah(S.surah, next, { continuous: true, keepStreak: true }); }, 400);
      return;
    }
    setStatus('error', msg);
  }
  function foundWorking(token) {
    var c = S.candidates[S.cIdx];
    if (c && c.folder && S.mode === 'ayah') {                 // احفظ المجلد الذي نجح لهذا القارئ
      var map = lsGet(LS_FOLDER, {}) || {};
      if (map[S.reciter] !== c.folder) { map[S.reciter] = c.folder; lsSet(LS_FOLDER, map); }
    }
  }

  function onEnded() {
    if (!S.mode) return;
    S.failStreak = 0;
    foundWorking(S.token);
    if (S.mode === 'surah') {
      if (S.loopSurah) { startCandidates(surahUrls(reciterById(S.reciter), S.surah)); return; }
      setStatus('idle'); emit('surahend', { surah: S.surah, mode: 'surah' }); return;
    }
    // وضع الآيات
    var r = S.repeat, total = Data.surah(S.surah).numberOfAyahs;
    if (r) {
      if (S.ayah < r.to) { playAyah(S.surah, S.ayah + 1, { continuous: S._continuous, keepRepeat: true }); return; }
      r.remaining--;
      if (r.remaining > 0) { playAyah(S.surah, r.from, { continuous: S._continuous, keepRepeat: true }); return; }
      S.repeat = null;
      if (r.from === r.to && !S._continuous) { setStatus('idle'); emit('rangeend', { surah: S.surah }); return; }
    }
    if (S.ayah < total) { if (S._continuous) playAyah(S.surah, S.ayah + 1, { continuous: true }); else setStatus('idle'); return; }
    if (S.loopSurah) { playAyah(S.surah, 1, { continuous: true }); return; }
    setStatus('idle'); emit('surahend', { surah: S.surah, mode: 'ayah' });
  }

  /* ───────── أوامر التشغيل ───────── */
  function playAyah(s, a, opts) {
    opts = opts || {};
    var meta = Data.surah(s);
    if (!meta || a < 1 || a > meta.numberOfAyahs) return false;
    var rec = reciterById(S.reciter);
    S.mode = 'ayah'; S.surah = s; S.ayah = a;
    S._continuous = opts.continuous !== undefined ? !!opts.continuous : true;
    if (!opts.keepRepeat) S.repeat = null;
    if (!opts.keepStreak) S.failStreak = 0;
    emit('ayah', { surah: s, ayah: a });
    startCandidates(ayahUrls(rec, s, a), opts.startTime || 0);
    return true;
  }
  function playSurah(s, opts) {
    opts = opts || {};
    if (!Data.surah(s)) return false;
    S.mode = 'surah'; S.surah = s; S.ayah = 0; S.repeat = null; S.failStreak = 0; S._continuous = false;
    emit('ayah', { surah: s, ayah: 0 });
    startCandidates(surahUrls(reciterById(S.reciter), s), opts.startTime || 0);
    return true;
  }
  function pause() { if (audio && S.mode) { persistResume(); audio.pause(); } }
  function resumePlay() {
    if (!audio || !S.mode || !audio.src) return false;
    var p = audio.play();
    if (p && p.catch) p.catch(function (e) { if (e && e.name === 'NotAllowedError') setStatus('paused', 'اضغط زر التشغيل للمتابعة'); });
    return true;
  }
  function toggle() {
    if (!S.mode) return false;
    if (S.status === 'error' || S.status === 'idle') { return S.mode === 'surah' ? playSurah(S.surah) : playAyah(S.surah, S.ayah || 1, { continuous: S._continuous }); }
    if (audio && !audio.paused) { pause(); return true; }
    return resumePlay();
  }
  function stop() {
    S.token++;                                  // أبطل أي أحداث معلّقة
    if (audio) { try { audio.pause(); } catch (e) { /* لا يهم */ } audio.removeAttribute('src'); try { audio.load(); } catch (e2) { /* لا يهم */ } }
    S.mode = null; S.repeat = null; S.ayah = 0; S.status = 'idle'; S.lastError = '';
    emit('state', snapshot());
  }
  function stopKeepingPosition() { persistResume(); pause(); }

  function nextAyah() {
    if (S.mode !== 'ayah') return false;
    S.repeat = null;
    return playAyah(S.surah, Math.min(S.ayah + 1, Data.surah(S.surah).numberOfAyahs), { continuous: S._continuous });
  }
  function prevAyah() {
    if (S.mode !== 'ayah') return false;
    if (audio && audio.currentTime > 3) { audio.currentTime = 0; return true; }
    S.repeat = null;
    return playAyah(S.surah, Math.max(1, S.ayah - 1), { continuous: S._continuous });
  }
  function goSurah(delta) {
    var n = S.surah + delta;
    if (n < 1 || n > 114) return false;
    return S.mode === 'surah' ? playSurah(n) : playAyah(n, 1, { continuous: true });
  }
  function repeatRange(s, from, to, count) {
    count = Math.max(1, Math.min(100, Number(count) || 1));
    if (!Data.surah(s)) return false;
    to = Math.max(from, to);
    S.repeat = { from: from, to: to, remaining: count, total: count };
    return playAyah(s, from, { continuous: false, keepRepeat: true });
  }
  function seekRatio(r) { if (audio && isFinite(audio.duration) && audio.duration > 0) audio.currentTime = Math.max(0, Math.min(1, r)) * audio.duration; }
  function seekBy(sec) { if (audio && isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + sec)); }

  function setSpeed(v) {
    v = Number(v) || 1; S.speed = v;
    if (audio) { audio.defaultPlaybackRate = v; audio.playbackRate = v; }
    lsSet(LS_STATE, { reciter: S.reciter, speed: S.speed });
    emit('state', snapshot());
  }
  function setLoopSurah(b) { S.loopSurah = !!b; emit('state', snapshot()); }

  /* تغيير القارئ يسري على الآيات الفردية والسورة معاً */
  function setReciter(id) {
    if (!reciterById(id)) return false;
    S.reciter = id;
    lsSet(LS_STATE, { reciter: S.reciter, speed: S.speed });
    if (S.mode === 'ayah' && S.status !== 'idle') playAyah(S.surah, S.ayah, { continuous: S._continuous, keepRepeat: true });
    else if (S.mode === 'surah' && S.status !== 'idle') playSurah(S.surah);
    else emit('state', snapshot());
    return true;
  }

  /* استئناف آخر موضع محفوظ (حتى بعد إعادة تحميل الصفحة) */
  function resumeSaved() {
    var r = lsGet(LS_RESUME, null);
    if (!r || !Data.surah(r.surah)) return false;
    if (reciterById(r.reciter)) S.reciter = r.reciter;
    return r.mode === 'surah'
      ? playSurah(r.surah, { startTime: r.time })
      : playAyah(r.surah, Math.max(1, r.ayah), { continuous: true, startTime: r.time });
  }
  function getSaved() { return lsGet(LS_RESUME, null); }

  /* أزرار قفل الشاشة/سماعات البلوتوث */
  function mediaSession() {
    try {
      if (!root.navigator || !navigator.mediaSession) return;
      var ms = navigator.mediaSession;
      ms.setActionHandler('play', resumePlay);
      ms.setActionHandler('pause', pause);
      ms.setActionHandler('nexttrack', function () { if (S.mode === 'surah') goSurah(1); else nextAyah(); });
      ms.setActionHandler('previoustrack', function () { if (S.mode === 'surah') goSurah(-1); else prevAyah(); });
    } catch (e) { /* غير مدعوم */ }
  }
  mediaSession();

  var api = {
    RECITERS: RECITERS, reciterById: reciterById,
    ayahUrls: ayahUrls, surahUrls: surahUrls,
    on: function (n, fn) { (listeners[n] = listeners[n] || []).push(fn); },
    off: function (n, fn) { listeners[n] = (listeners[n] || []).filter(function (f) { return f !== fn; }); },
    state: snapshot,
    playAyah: playAyah, playSurah: playSurah, pause: pause, resume: resumePlay, toggle: toggle,
    stop: stop, pauseSaving: stopKeepingPosition,
    next: nextAyah, prev: prevAyah, goSurah: goSurah, repeatRange: repeatRange,
    seekRatio: seekRatio, seekBy: seekBy,
    setSpeed: setSpeed, setLoopSurah: setLoopSurah, setReciter: setReciter,
    getReciterId: function () { return S.reciter; },
    resumeSaved: resumeSaved, getSaved: getSaved,
    _element: function () { return audio; }
  };
  App.QuranAudio = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
