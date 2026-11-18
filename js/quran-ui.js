/* واجهة القرآن: تقدّم القراءة، التنقل بين السور، تصفية السور، حالة الحفظ دون اتصال، وحالة علامات الآيات.
   لا يغيّر نصوص الآيات ولا محرك القرآن أو الصوت؛ يقرأ من DOM وواجهاتهما العامة فقط. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var App = window.Sakina || {};
  var list = $('#ayah-list'), grid = $('#surah-grid'), view = $('#surah-view-screen');
  if (!list || !grid || !view) return;
  var cached = {};
  function arDigits(n) { return new Intl.NumberFormat('ar-EG').format(n); }
  function readJSON(k, f) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? f : v; } catch (_) { return f; } }
  function refreshCached() {
    var D = App.QuranData; if (!D || !D.cachedNumbers) return Promise.resolve();
    return D.cachedNumbers().then(function (nums) { cached = {}; (nums || []).forEach(function (n) { cached[n] = 1; }); paintStatus(); }).catch(function () {});
  }

  /* ───── قائمة السور: تصفية + تمييز آخر قراءة ───── */
  var filter = 'all', bar = document.createElement('div');
  bar.className = 'surah-filter'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'تصفية السور');
  bar.innerHTML = '<button type="button" class="chip is-on" data-f="all">كل السور</button><button type="button" class="chip" data-f="offline">محفوظة دون اتصال</button>';
  grid.parentNode.insertBefore(bar, grid);
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return; filter = b.dataset.f;
    Array.prototype.forEach.call(bar.children, function (c) { c.classList.toggle('is-on', c === b); c.setAttribute('aria-pressed', c === b); });
    decorateList();
  });
  var busy = false;
  function decorateList() {
    if (busy) return; busy = true;
    var last = App.lastRead && App.lastRead.load ? App.lastRead.load() : null, shown = 0, any = 0;
    Array.prototype.forEach.call(grid.querySelectorAll('.surah-card'), function (c) {
      any++;
      var n = Number(c.querySelector('.surah-num').textContent), off = !!c.querySelector('.fa-circle-check');
      c.hidden = filter === 'offline' && !off; if (!c.hidden) shown++;
      c.classList.toggle('is-last', !!(last && last.n === n));
      if (last && last.n === n && !c.querySelector('.surah-last')) { var s = document.createElement('span'); s.className = 'surah-last'; s.textContent = 'آخر قراءة'; c.appendChild(s); }
    });
    var msg = grid.querySelector('.ui-empty');
    if (any && !shown) { if (!msg) { msg = document.createElement('p'); msg.className = 'state-msg ui-empty'; msg.textContent = 'لم تُحفظ أي سورة للقراءة دون اتصال بعد. افتح سورة وهي متصل بالإنترنت وستُحفظ تلقائياً.'; grid.appendChild(msg); } }
    else if (msg) msg.remove();
    busy = false;
  }
  new MutationObserver(function () { if (!busy) decorateList(); }).observe(grid, { childList: true });

  /* ───── شاشة السورة: تقدّم القراءة + حالة الحفظ + التنقل ───── */
  var prog = document.createElement('div');
  prog.className = 'read-progress'; prog.hidden = true;
  prog.innerHTML = '<div class="rp-bar" role="progressbar" aria-label="تقدم القراءة" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div><span class="rp-text" aria-live="off"></span><span class="rp-status"></span>';
  view.insertBefore(prog, $('#ayah-list'));
  var pager = document.createElement('nav');
  pager.className = 'surah-pager'; pager.setAttribute('aria-label', 'التنقل بين السور'); pager.hidden = true;
  pager.innerHTML = '<button type="button" class="btn btn-glass" data-d="1">السورة التالية <i class="fa-solid fa-arrow-left"></i></button><button type="button" class="btn btn-glass" data-d="-1"><i class="fa-solid fa-arrow-right"></i> السورة السابقة</button>';
  list.after(pager);
  pager.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || !App.quran || !App.quran.openSurah) return;
    var n = App.quran.currentSurahNumber + Number(b.dataset.d);
    if (n < 1 || n > 114) return;
    App.quran.openSurah(n); window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  function paintStatus() {
    var n = App.quran && App.quran.currentSurahNumber, s = $('.rp-status', prog); if (!s) return;
    s.textContent = cached[n] ? 'محفوظة دون اتصال' : (navigator.onLine === false ? 'غير متصل' : 'تُحفظ عند أول فتح');
    s.classList.toggle('is-offline-ok', !!cached[n]);
  }
  var ticking = false;
  function paintProgress() {
    ticking = false;
    var ay = list.querySelectorAll('.ayah'); if (!ay.length) return;
    var mid = innerHeight * 0.4, idx = 0;
    for (var i = 0; i < ay.length; i++) { if (ay[i].getBoundingClientRect().top <= mid) idx = i; else break; }
    var pct = Math.round((idx + 1) / ay.length * 100);
    $('.rp-bar i', prog).style.width = pct + '%'; $('.rp-bar', prog).setAttribute('aria-valuenow', pct);
    $('.rp-text', prog).textContent = 'الآية ' + arDigits(idx + 1) + ' من ' + arDigits(ay.length);
  }
  window.addEventListener('scroll', function () { if (!ticking && !prog.hidden) { ticking = true; requestAnimationFrame(paintProgress); } }, { passive: true });
  function syncSaved() {
    var bm = (readJSON('anas_quran_upgrade_v2', {}).ayahBookmarks) || [];
    Array.prototype.forEach.call(list.querySelectorAll('.ayah'), function (el) {
      var b = el.querySelector('.ayah-tools [data-act="save"]'); if (!b) return;
      var t = (el.querySelector('.ayah-text') || {}).textContent || '', n = (el.querySelector('.ayah-num') || {}).textContent || '';
      var on = bm.some(function (x) { return x.text === t && x.ayah === n; });
      b.classList.toggle('is-saved', on); b.setAttribute('aria-pressed', on); el.classList.toggle('has-mark', on);
    });
  }
  new MutationObserver(function () {
    var has = !!list.querySelector('.ayah'); prog.hidden = !has; pager.hidden = !has;
    Array.prototype.forEach.call(list.querySelectorAll('.ayah-num:not([role])'), function (n) { n.setAttribute('role', 'button'); n.tabIndex = 0; n.setAttribute('aria-label', 'خيارات الآية'); n.setAttribute('aria-expanded', 'false'); });
    if (has) { paintProgress(); paintStatus(); setTimeout(syncSaved, 60); refreshCached(); }
    var n = App.quran && App.quran.currentSurahNumber;
    pager.children[0].disabled = n >= 114; pager.children[1].disabled = n <= 1;
  }).observe(list, { childList: true });
  list.addEventListener('click', function () { setTimeout(syncSaved, 40); }, true);   // التقاط مبكر: أزرار الآيات توقف انتشار الحدث
  /* الضغط على رقم الآية يفتح/يغلق أزرارها (تدرّب، تكرار، حفظ، مشاركة) */
  function toggleTools(num) {
    var ay = num.closest('.ayah'); if (!ay || !ay.querySelector('.ayah-tools')) return;
    var open = !ay.classList.contains('is-active');
    Array.prototype.forEach.call(list.querySelectorAll('.ayah.is-active'), function (x) { x.classList.remove('is-active'); });
    ay.classList.toggle('is-active', open); num.setAttribute('aria-expanded', open);
  }
  list.addEventListener('click', function (e) { var n = e.target.closest('.ayah-num'); if (n) toggleTools(n); });
  list.addEventListener('keydown', function (e) { var n = e.target.closest && e.target.closest('.ayah-num'); if (n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleTools(n); } });
  refreshCached();
})();
