/* ==========================================================
   أُنس أحمد V18 — cinema.js
   · إضاءة محيطة تتبع المؤشر بلطف (شاشات المؤشر الدقيق فقط)
   · ظهور ناعم للبطاقات عند التمرير
   · وضع التأمل: قراءة مركّزة تُعتِم ما سوى الآية الجارية
   · مؤقت النوم: يخفض الصوت تدريجياً ثم يوقف التلاوة ويحفظ الموضع
   · اختصارات لوحة المفاتيح في صفحة القرآن
   لا يغيّر منطق القرآن/الصوت؛ يستخدم واجهة QuranAudio العامة فقط.
   ========================================================== */
(function () {
  'use strict';
  var App = (window.Sakina = window.Sakina || {});
  var doc = document, body = doc.body;
  var Q = App.QuranAudio;
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function $(s) { return doc.querySelector(s); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (_) { return null; } }

  /* ───────── 1) الإضاءة المحيطة تتبع المؤشر ───────── */
  var ambient = $('.cine-ambient');
  if (ambient && !reduce && window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
    var raf = 0, px = 0, py = 0;
    window.addEventListener('pointermove', function (e) {
      px = (e.clientX / window.innerWidth - .5) * 70; py = (e.clientY / window.innerHeight - .5) * 40;
      if (raf) return;
      raf = requestAnimationFrame(function () { raf = 0; ambient.style.setProperty('--cine-lx', px.toFixed(1) + 'px'); ambient.style.setProperty('--cine-ly', py.toFixed(1) + 'px'); });
    }, { passive: true });
  }

  /* ───────── 2) ظهور ناعم عند التمرير ───────── */
  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('cine-in'); io.unobserve(en.target); } });
    }, { threshold: .08, rootMargin: '0px 0px -6% 0px' });
    Array.prototype.forEach.call(doc.querySelectorAll('.feature-card, .cat-card, .taj-note, .taj-hero, .taj-counter-card, .daily-ayah, .daily-plan, .qa, .home-activity, .nawawi-hero, .recitation-page-hero, .about-card'), function (el) {
      el.classList.add('cine-reveal'); io.observe(el);
    });
  }

  /* ───────── 3) وضع التأمل ───────── */
  var focusBtn = $('#cine-focus'), hud = $('#cine-hud');
  var fs = Number(store('uns_cine_fs')) || 1;
  function applyFs() { fs = Math.min(1.7, Math.max(.8, Math.round(fs * 10) / 10)); doc.documentElement.style.setProperty('--cine-fs', String(fs)); store('uns_cine_fs', String(fs)); }
  applyFs();
  function isFocus() { return body.classList.contains('cine-focus'); }
  function readerOpen() { var v = $('#surah-view-screen'); return !!v && !v.hidden; }
  function setFocus(on) {
    on = !!on;
    if (on && !readerOpen()) return false;               // التأمل للقراءة داخل سورة مفتوحة فقط
    body.classList.toggle('cine-focus', on);
    if (hud) hud.hidden = !on;
    if (focusBtn) focusBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    return on;
  }
  if (focusBtn) focusBtn.addEventListener('click', function () { setFocus(!isFocus()); });
  var exitBtn = $('#cine-exit'); if (exitBtn) exitBtn.addEventListener('click', function () { setFocus(false); });
  var fsDown = $('#cine-fs-down'), fsUp = $('#cine-fs-up');
  if (fsDown) fsDown.addEventListener('click', function () { fs -= .1; applyFs(); });
  if (fsUp) fsUp.addEventListener('click', function () { fs += .1; applyFs(); });
  var back = $('#back-to-list'); if (back) back.addEventListener('click', function () { setFocus(false); });
  if (App.bus) ['home', 'quran', 'recitation', 'adhkar', 'taj-adhikr', 'nawawi', 'tools', 'about'].forEach(function (n) { if (n !== 'quran') App.bus.on('page:' + n, function () { setFocus(false); }); });
  if (Q && Q.on) Q.on('state', function (st) { body.classList.toggle('cine-playing', !!(st && st.mode && (st.status === 'playing' || st.status === 'loading' || st.status === 'paused'))); });

  /* ───────── 4) مؤقت النوم ───────── */
  var sleepSel = $('#cine-sleep'), sleepLbl = $('#cine-sleep-left');
  var sl = { t: 0, tick: 0, end: 0, total: 0 };
  function lbl(s) { if (sleepLbl) sleepLbl.textContent = s; }
  function mmss(ms) { var s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60); return m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  function restoreVolume() { try { var el = Q && Q._element && Q._element(); if (el) el.volume = 1; } catch (_) {} }
  function clearSleep() { if (sl.t) clearTimeout(sl.t); if (sl.tick) clearInterval(sl.tick); sl.t = sl.tick = 0; sl.end = sl.total = 0; restoreVolume(); }
  function fire() {
    var wasActive = !!sl.t; clearSleep();
    if (Q && Q.pauseSaving) Q.pauseSaving();
    restoreVolume();                                      // الصوت عاد لوضعه الطبيعي للتشغيل القادم
    if (sleepSel) sleepSel.value = '0';
    if (wasActive) lbl('توقّفت التلاوة بمؤقت النوم');
    if (App.bus) App.bus.emit('sleep:fired');
  }
  function tick() {
    var left = sl.end - Date.now();
    lbl('ينتهي بعد ' + mmss(left));
    var fade = Math.min(8000, sl.total * .5);
    var el = Q && Q._element && Q._element();
    if (el && left > 0 && left <= fade) { try { el.volume = Math.max(0, Math.min(1, left / fade)); } catch (_) {} }
  }
  function setSleep(minutes) {
    clearSleep(); minutes = Number(minutes) || 0;
    if (minutes <= 0) { lbl(''); return false; }
    sl.total = minutes * 60000; sl.end = Date.now() + sl.total;
    sl.t = setTimeout(fire, sl.total);
    sl.tick = setInterval(tick, sl.total < 5000 ? 100 : 500);
    tick(); return true;
  }
  if (sleepSel) sleepSel.addEventListener('change', function () { setSleep(sleepSel.value); });

  /* ───────── 5) اختصارات لوحة المفاتيح (صفحة القرآن فقط) ───────── */
  doc.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    var qp = $('#quran'); if (!qp || !qp.classList.contains('is-active')) return;
    var k = e.key;
    if (k === 'Escape' && isFocus()) { setFocus(false); e.preventDefault(); return; }
    if (!Q) return;
    var onControl = tag === 'BUTTON' || tag === 'A' || (t && t.getAttribute && t.getAttribute('role') === 'button') || (t && t.getAttribute && t.getAttribute('role') === 'slider');
    if (k === ' ' || k === 'Spacebar') {
      if (onControl) return;                              // لا نسرق السلوك الأصلي للأزرار
      e.preventDefault();
      var st = Q.state();
      if (!st.mode) { if (readerOpen() && App.quran && App.quran.playAyah) App.quran.playAyah(0); } else Q.toggle();
    } else if (k === 'n' || k === 'N') { Q.next(); }
    else if (k === 'p' || k === 'P') { Q.prev(); }
    else if (k === 'f' || k === 'F') { setFocus(!isFocus()); }
  });

  App.Cinema = { setFocus: setFocus, isFocus: isFocus, setSleep: setSleep, sleepActive: function () { return !!sl.t; },
                 getFontScale: function () { return fs; }, setFontScale: function (v) { fs = Number(v) || 1; applyFs(); return fs; } };
})();
