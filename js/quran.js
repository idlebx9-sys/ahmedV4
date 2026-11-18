/* ==========================================================
   أُنس أحمد V18 — quran.js (طبقة الواجهة فقط)
   · قائمة السور من بيانات محلية مضمّنة (تعمل دون شبكة)
   · نص السورة عبر Sakina.QuranData (مصدران + تحقق + تخزين محلي)
   · الصوت عبر Sakina.QuranAudio (محرّك واحد لكل الأوضاع)
   ========================================================== */
(function () {
  'use strict';

  var App = (window.Sakina = window.Sakina || {});
  var $ = App.$, $$ = App.$$, on = App.on;
  var Data = App.QuranData, Player = App.QuranAudio;

  var listScreen = $('#surah-list-screen'), viewScreen = $('#surah-view-screen');
  var grid = $('#surah-grid'), search = $('#surah-search');
  var heading = $('#surah-heading'), meta = $('#surah-meta');
  var basmala = $('#basmala'), ayahList = $('#ayah-list');
  var player = $('#player'), pSurah = $('#player-surah'), pReciter = $('#player-reciter');
  var pPlay = $('#player-play'), pPrev = $('#player-prev'), pNext = $('#player-next');
  var pCurrent = $('#player-current'), pTotal = $('#player-total'), pSeek = $('#player-seek'), pFill = $('#player-fill');

  var curSurah = 0, curAyahs = [], cachedSet = {}, seeking = false, loadToken = 0;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtTime(sec) { if (!isFinite(sec) || sec < 0) sec = 0; var m = Math.floor(sec / 60), s = Math.floor(sec % 60); return m + ':' + (s < 10 ? '0' : '') + s; }
  function normalizeAr(s) { return Data.stripMarks(s).replace(/[ؤئ]/g, 'ي').replace(/[ـ\s]+/g, ' ').trim().toLowerCase(); }
  function toArabicDigits(n) { return String(n).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }); }
  function reciterName() { var r = Player.reciterById(Player.getReciterId()); return r ? r.ar : ''; }

  /* ───────── 1) قائمة السور ───────── */
  function renderList() {
    if (!grid) return;
    var q = normalizeAr((search && search.value) || '');
    grid.innerHTML = '';
    var shown = 0;
    Data.SURAHS.forEach(function (s) {
      if (q) {
        var hay = normalizeAr(s.name + ' ' + s.number + ' ' + toArabicDigits(s.number));
        if (hay.indexOf(q) === -1) return;
      }
      shown++;
      var place = s.revelationType === 'Meccan' ? 'مكية' : 'مدنية';
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'surah-card glass';
      card.innerHTML =
        '<span class="surah-num">' + s.number + '</span>' +
        '<span><span class="surah-name">' + esc(s.name) + '</span>' +
        '<span class="surah-info">' + s.numberOfAyahs + ' آية · ' + place +
        (cachedSet[s.number] ? ' · <i class="fa-solid fa-circle-check" title="محفوظة للقراءة دون اتصال" aria-label="محفوظة للقراءة دون اتصال"></i>' : '') +
        '</span></span>';
      on(card, 'click', function () { openSurah(s.number); });
      grid.appendChild(card);
    });
    if (!shown) grid.innerHTML = '<p class="state-msg">لا توجد سورة بهذا الاسم.</p>';
  }
  function refreshCached() {
    Data.cachedNumbers().then(function (nums) { cachedSet = {}; nums.forEach(function (n) { cachedSet[n] = 1; }); renderList(); });
  }
  on(search, 'input', renderList);

  /* ───────── 2) عرض السورة ───────── */
  function showError(n, err) {
    var offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    ayahList.innerHTML = '<p class="state-msg">' + esc(offline ? 'لا يوجد اتصال بالإنترنت، ولم تُحفظ هذه السورة على جهازك بعد.' : (err && err.message) || 'تعذّر تحميل السورة.') +
      '<br><button type="button" class="btn btn-glass btn-sm" id="retry-surah" style="margin-top:14px"><i class="fa-solid fa-rotate-right"></i> إعادة المحاولة</button></p>';
    on($('#retry-surah'), 'click', function () { openSurah(n, { force: true, keepAudio: true }); });
  }

  function openSurah(n, opts) {
    opts = opts || {};
    var s = Data.surah(n);
    if (!s || !viewScreen || !ayahList) return;
    var st = Player.state();
    if (!opts.keepAudio && st.mode && st.surah !== n) Player.stop();      // سورة مختلفة ⇒ أوقف الصوت القديم

    var token = ++loadToken;
    listScreen.hidden = true; viewScreen.hidden = false;
    curSurah = n; curAyahs = [];
    ayahList.innerHTML = '<p class="state-msg">جارٍ تحميل السورة…</p>';
    heading.textContent = s.name;
    meta.textContent = s.numberOfAyahs + ' آية · ' + (s.revelationType === 'Meccan' ? 'مكية' : 'مدنية');
    basmala.hidden = true;

    Data.load(n, { force: !!opts.force }).then(function (res) {
      if (token !== loadToken) return;               // المستخدم انتقل لسورة أخرى
      renderSurah(res);
      refreshCached();
    }).catch(function (err) {
      if (token !== loadToken) return;
      showError(n, err);
    });
  }

  function renderSurah(res) {
    var s = res.surah, n = s.number;
    curAyahs = res.ayahs;
    basmala.hidden = (n === 1 || n === 9);
    ayahList.innerHTML = '';
    var frag = document.createDocumentFragment();
    var page = null;
    res.ayahs.forEach(function (a, i) {
      // صفحة مصحف مرئية: تجميع الآيات في صفحات متتابعة بدل بطاقات متقطعة.
      var pageNo = Math.floor(i / 15) + 1;
      if (pageNo !== page) {
        page = pageNo;
        var sheet = document.createElement('section');
        sheet.className = 'mushaf-page';
        sheet.dataset.page = String(pageNo);
        sheet.innerHTML = '<div class="mushaf-page-ornament" aria-hidden="true">۞</div><div class="mushaf-page-content"></div><div class="mushaf-page-number">' + toArabicDigits(pageNo) + '</div>';
        frag.appendChild(sheet);
      }
      var content = frag.lastChild.querySelector('.mushaf-page-content');
      var line = document.createElement('div');
      line.setAttribute('role', 'button');
      line.tabIndex = 0;
      line.className = 'ayah';
      line.dataset.i = String(i);
      line.dataset.n = String(a.n);
      var words = String(a.text || '').trim().split(/\s+/);
      line.innerHTML = '<span class="ayah-text">' + words.map(function (w, wi) { return '<span class="quran-word" data-word="' + wi + '">' + esc(w) + '</span>'; }).join(' ') + ' <span class="ayah-num" aria-label="رقم الآية">۞' + toArabicDigits(a.n) + '</span></span>';
      on(line, 'click', function () { Player.playAyah(n, a.n, { continuous: true }); });
      on(line, 'keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target === line) { e.preventDefault(); Player.playAyah(n, a.n, { continuous: true }); } });
      content.appendChild(line);
    });
    ayahList.appendChild(frag);
    var firstPage = $('.mushaf-page', ayahList);
    if (firstPage) { firstPage.classList.add('page-active'); window.__unsMushafLastPage = firstPage.dataset.page; }
    var pageNav = $('#mushaf-page-nav');
    if (!pageNav) {
      pageNav = document.createElement('div'); pageNav.id = 'mushaf-page-nav'; pageNav.className = 'mushaf-page-nav';
      pageNav.innerHTML = '<button type="button" class="btn btn-glass btn-sm" id="mushaf-prev-page">الصفحة السابقة</button><span id="mushaf-page-label">الصفحة ١</span><button type="button" class="btn btn-glass btn-sm" id="mushaf-next-page">الصفحة التالية</button>';
      ayahList.parentNode.insertBefore(pageNav, ayahList);
      on($('#mushaf-prev-page'), 'click', function () { changeMushafPage(-1); });
      on($('#mushaf-next-page'), 'click', function () { changeMushafPage(1); });
    }
    updateMushafPageLabel();
    if (res.stale) {
      var note = document.createElement('p');
      note.className = 'state-msg quran-source-note';
      note.textContent = 'تعذّر التحديث؛ عُرضت النسخة المحفوظة على جهازك.';
      ayahList.insertBefore(note, ayahList.firstChild);
    }
    if (App.lastRead && App.lastRead.save) App.lastRead.save(n, s.name);
    var st = Player.state();
    if (st.mode === 'ayah' && st.surah === n) markCurrent(st.ayah, false);
  }

  on($('#back-to-list'), 'click', function () {
    loadToken++;
    Player.stop();
    viewScreen.hidden = true; listScreen.hidden = false;
    if (App.go) App.go('quran', true);
  });

  function updateMushafPageLabel() {
    var active = $('.mushaf-page.page-active');
    var label = $('#mushaf-page-label');
    if (label && active) label.textContent = 'الصفحة ' + toArabicDigits(active.dataset.page);
  }
  function changeMushafPage(delta) {
    var pages = $$('.mushaf-page', ayahList), active = $('.mushaf-page.page-active', ayahList);
    var idx = pages.indexOf(active), next = pages[Math.max(0, Math.min(pages.length - 1, idx + delta))];
    if (!next) return;
    pages.forEach(function (p) { p.classList.toggle('page-active', p === next); });
    window.__unsMushafLastPage = next.dataset.page;
    next.classList.remove('page-turn-in'); void next.offsetWidth; next.classList.add('page-turn-in');
    updateMushafPageLabel();
  }

  function markCurrent(ayahNumber, scroll) {
    $$('.ayah').forEach(function (el) { el.classList.toggle('is-playing', Number(el.dataset.n) === ayahNumber); el.querySelectorAll('.quran-word').forEach(function (w) { w.classList.remove('word-lit', 'word-past'); }); });
    var cur = ayahNumber ? $('.ayah[data-n="' + ayahNumber + '"]') : null;
    if (cur) {
      var page = cur.closest('.mushaf-page');
      $$('.mushaf-page').forEach(function (el) { el.classList.toggle('page-active', el === page); });
      if (scroll !== false && page && page.dataset.page !== window.__unsMushafLastPage) {
        if (window.__unsMushafLastPage) { page.classList.remove('page-turn-in'); void page.offsetWidth; page.classList.add('page-turn-in'); }
        window.__unsMushafLastPage = page.dataset.page;
      }
      if (page) updateMushafPageLabel();
      if (scroll !== false && cur.scrollIntoView) cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  /* ───────── 3) المشغّل (يستمع لأحداث المحرّك فقط) ───────── */
  function setPlayIcon(playing) { if (pPlay) pPlay.innerHTML = playing ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>'; }
  function showPlayer() { if (player) { player.hidden = false; document.body.classList.add('has-player'); } }
  function hidePlayer() { if (player) { player.hidden = true; document.body.classList.remove('has-player'); } }

  function paintState(st) {
    if (!st.mode) { hidePlayer(); setPlayIcon(false); markCurrent(0); return; }
    showPlayer();
    var s = Data.surah(st.surah);
    var title = s ? 'سورة ' + s.name : 'التلاوة';
    if (st.mode === 'ayah') title += ' · الآية ' + st.ayah;
    if (pSurah) pSurah.textContent = st.status === 'error' ? (st.error || 'تعذّر التشغيل') : title;
    if (pReciter) {
      var tail = st.mode === 'surah' ? ' · السورة كاملة' : '';
      if (st.repeat && st.repeat.total > 1) tail += ' · تكرار ' + (st.repeat.total - st.repeat.remaining + 1) + '/' + st.repeat.total;
      if (st.status === 'loading') tail += ' · جارٍ التحميل…';
      pReciter.textContent = reciterName() + tail + (st.status !== 'error' && st.error ? ' — ' + st.error : '');
    }
    if (pPrev) pPrev.setAttribute('aria-label', st.mode === 'surah' ? 'السورة السابقة' : 'الآية السابقة');
    if (pNext) pNext.setAttribute('aria-label', st.mode === 'surah' ? 'السورة التالية' : 'الآية التالية');
    setPlayIcon(st.status === 'playing' || st.status === 'loading');
    var speedSel = $('#quran-speed'); if (speedSel && Number(speedSel.value) !== st.speed) speedSel.value = String(st.speed);
  }
  Player.on('state', paintState);

  Player.on('ayah', function (e) {
    // تغيّرت السورة من المشغّل (التالية/السابقة/متابعة محفوظة): اعرض نصها دون قطع الصوت
    if (e.surah && e.surah !== curSurah) openSurah(e.surah, { keepAudio: true });
    markCurrent(e.ayah, true);
    if (pFill) pFill.style.width = '0%';
    if (pCurrent) pCurrent.textContent = '0:00';
  });
  Player.on('unavailable', function (e) { if (e.mode === 'ayah') { var el = $('.ayah[data-n="' + e.ayah + '"]'); if (el) el.classList.add('no-audio'); } });
  Player.on('time', function (t) {
    if (!isFinite(t.duration) || !t.duration) return;
    var pct = t.current / t.duration * 100;
    if (pFill) pFill.style.width = pct + '%';
    if (pCurrent) pCurrent.textContent = fmtTime(t.current);
    if (pTotal) pTotal.textContent = fmtTime(t.duration);
    // تظليل تقريبي متدرّج لكلمات الآية الحالية؛ التوقيت ليس محاذاة صوتية حرفية.
    var stNow = Player.state();
    if (stNow.mode === 'ayah' && stNow.ayah) {
      var activeAyah = $('.ayah[data-n="' + stNow.ayah + '"]');
      if (activeAyah) {
        var wordsNow = activeAyah.querySelectorAll('.quran-word');
        var wordIndex = Math.min(wordsNow.length - 1, Math.floor((t.current / t.duration) * wordsNow.length));
        wordsNow.forEach(function (word, wi) { word.classList.toggle('word-lit', wi === wordIndex); word.classList.toggle('word-past', wi < wordIndex); });
      }
    }
    if (pSeek && !seeking) pSeek.setAttribute('aria-valuenow', String(Math.round(pct)));
  });
  Player.on('surahend', function (e) { if (App.quran && App.quran.onSurahEnd) App.quran.onSurahEnd(e); });

  on(pNext, 'click', function () { var st = Player.state(); if (st.mode === 'surah') Player.goSurah(1); else Player.next(); });
  on(pPrev, 'click', function () { var st = Player.state(); if (st.mode === 'surah') Player.goSurah(-1); else Player.prev(); });
  on(pPlay, 'click', function () {
    var st = Player.state();
    if (!st.mode) { if (curSurah) Player.playAyah(curSurah, 1, { continuous: true }); return; }
    Player.toggle();
  });

  /* شريط التقدّم */
  function ratioFrom(e) {
    var rect = pSeek.getBoundingClientRect();
    var x = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX) - rect.left;
    var r = Math.min(1, Math.max(0, x / rect.width));
    return getComputedStyle(pSeek).direction === 'rtl' ? 1 - r : r;
  }
  function seekEvt(e) { var r = ratioFrom(e); Player.seekRatio(r); if (pFill) pFill.style.width = (r * 100) + '%'; }
  on(pSeek, 'mousedown', function (e) { seeking = true; seekEvt(e); });
  on(pSeek, 'touchstart', function (e) { seeking = true; seekEvt(e); }, { passive: true });
  on(document, 'mousemove', function (e) { if (seeking) seekEvt(e); });
  on(document, 'touchmove', function (e) { if (seeking) seekEvt(e); }, { passive: true });
  on(document, 'mouseup', function () { seeking = false; });
  on(document, 'touchend', function () { seeking = false; });
  on(pSeek, 'keydown', function (e) {
    if (e.key === 'ArrowRight') Player.seekBy(-5); else if (e.key === 'ArrowLeft') Player.seekBy(5); else return;
    e.preventDefault();
  });

  /* ───────── 4) أزرار شريط أدوات السورة ───────── */
  on($('#play-full-surah'), 'click', function () { if (curSurah) Player.playAyah(curSurah, 1, { continuous: true }); });
  on($('#quran-stop'), 'click', function () { Player.pauseSaving(); });
  on($('#quran-resume'), 'click', function () {
    var st = Player.state();
    if (st.mode && st.status === 'paused') { Player.resume(); return; }
    if (!Player.resumeSaved()) alert('لا يوجد موضع محفوظ بعد. شغّل آية أو سورة أولاً.');
  });
  on($('#quran-speed'), 'change', function (e) { Player.setSpeed(Number(e.target.value)); });
  on($('#quran-loop'), 'change', function (e) { Player.setLoopSurah(e.target.checked); });

  /* ───────── 5) شريحة «آخر قراءة» ───────── */
  function paintResume() {
    var chip = $('#resume-chip'), text = $('#resume-text');
    var last = App.lastRead && App.lastRead.load();
    if (!chip || !text || !last || !last.n) return;
    text.textContent = 'متابعة القراءة: ' + last.name;
    chip.hidden = false;
  }
  if (App.bus) App.bus.on('lastread', paintResume);

  /* ───────── 6) الدخول للقسم + واجهة متوافقة مع بقية الملفات ───────── */
  if (App.bus) App.bus.on('page:quran', function () { if (viewScreen && viewScreen.hidden) { renderList(); refreshCached(); } });
  renderList();
  window.addEventListener('online', function () { if (curSurah && !curAyahs.length && !viewScreen.hidden) openSurah(curSurah, { keepAudio: true }); });

  App.quran = App.quran || {};
  Object.defineProperty(App.quran, 'currentSurahNumber', { configurable: true, get: function () { return curSurah || 1; } });
  App.quran.openSurah = openSurah;
  App.quran.stop = function () { Player.stop(); };
  App.quran.pause = function () { Player.pauseSaving(); };
  App.quran.resume = function () { if (!Player.resume()) Player.resumeSaved(); };
  App.quran.playAyah = function (i) { Player.playAyah(curSurah, i + 1, { continuous: true }); };          // i يبدأ من 0 (توافق مع V17)
  App.quran.repeatAyah = function (i, count) { Player.repeatRange(curSurah, i + 1, i + 1, count); };
  App.quran.currentAyahs = function () { return curAyahs.slice(); };
  App.quran.onSurahEnd = null;
})();
