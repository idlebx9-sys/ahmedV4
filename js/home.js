/* الصفحة الرئيسية: التاريخ، الرسالة اليومية، متابعة القراءة، الوصول السريع، ولوحة النشاط.
   كل رقم هنا يُقرأ من التخزين المحلي الذي تكتب فيه الأقسام نفسها؛ لا توجد قيم افتراضية مصطنعة. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var App = window.Sakina || {};
  var MSGS = [
    'ابدأ يومك بذكر الله، وقليلٌ دائم خيرٌ من كثيرٍ منقطع.',
    'صفحة واحدة اليوم تكفي لتبقى على الطريق.',
    'اجعل لقلبك وردًا لا يسقط مهما انشغلت.',
    'خذ لحظة صمت، ثم ابدأ بما تعرفه من الذكر.',
    'الاستمرار على القليل أثبت من الحماس العابر.',
    'اقرأ بتدبّر؛ آية تفهمها خيرٌ من صفحات تمرّ عليك سريعًا.',
    'ما كان لله دام واتصل.',
    'ابدأ بالصلاة على النبي ﷺ، ثم أكمل وردك.',
    'راجع ما حفظت قبل أن تضيف جديدًا.',
    'اختم يومك بأذكار المساء واستغفارٍ هادئ.',
    'خصّص وقتًا ثابتًا للقرآن، يصبح عادةً تشتاق إليها.',
    'التسبيح يسير على اللسان، ثقيل في الميزان.'
  ];
  function num(n) { return new Intl.NumberFormat('ar-EG').format(n); }
  function readJSON(k, f) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? f : v; } catch (_) { return f; } }
  function dayKey(d) { return d.toLocaleDateString('en-CA'); }

  function paintHeader() {
    var now = new Date(), h = now.getHours();
    $('#home-greeting').textContent = h < 12 ? 'صباح الخير' : h < 18 ? 'طاب يومك' : 'مساء الخير';
    var hij = '', gre = '';
    try { hij = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now); } catch (_) {}
    try { gre = new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long', year: 'numeric' }).format(now); } catch (_) {}
    $('#home-dates').textContent = [hij, gre].filter(Boolean).join(' — ');
    var doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    $('#home-daily-msg').textContent = MSGS[doy % MSGS.length];
  }

  function streak() {
    var days = readJSON('uns_ahmad_activity_days_v1', []), set = {}, n = 0, d = new Date();
    if (!Array.isArray(days)) return 0;
    days.forEach(function (x) { set[x] = 1; });
    while (set[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function adhkarTotal() {
    var t = 0;
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('sakina:count:') === 0) t += Math.max(0, parseInt(localStorage.getItem(k), 10) || 0); } } catch (_) {}
    return t;
  }
  function surahName(n) {
    try { var s = App.QuranData && App.QuranData.surah && App.QuranData.surah(n); return s && (s.name || s.ar); } catch (_) { return ''; }
  }

  function paintActivity() {
    var last = App.lastRead && App.lastRead.load ? App.lastRead.load() : null;
    var resume = readJSON('uns:audio:resume:v1', null);
    var up = readJSON('anas_quran_upgrade_v2', {});
    var ayahs = Math.max(0, Number(up.readAyahs) || 0), adhkar = adhkarTotal();
    var nw = readJSON('unsAhmadNawawiRead', []); nw = Array.isArray(nw) ? nw.length : 0;
    var lastText = '—', cont = 'ابدأ القراءة';
    if (last && last.n) {
      var ay = resume && resume.surah === last.n && resume.ayah > 0 ? resume.ayah : 0;
      lastText = (last.name || ('سورة ' + last.n)) + (ay ? ' · الآية ' + num(ay) : '');
      cont = 'تابع القراءة: ' + (last.name || ('سورة ' + last.n));
    } else if (resume && resume.surah) { lastText = 'سورة ' + num(resume.surah) + (resume.ayah ? ' · الآية ' + num(resume.ayah) : ''); cont = 'تابع الاستماع'; }
    $('#home-continue-text').textContent = cont;
    $('#hs-last').textContent = lastText;
    $('#hs-ayahs').textContent = num(ayahs);
    $('#hs-adhkar').textContent = num(adhkar);
    $('#hs-streak').textContent = num(streak());
    var days = readJSON('uns_ahmad_activity_days_v1', []), wk = $('#hs-week'), d = new Date(), html = '';
    d.setDate(d.getDate() - 6);
    for (var i = 0; i < 7; i++, d.setDate(d.getDate() + 1)) {
      var on = Array.isArray(days) && days.indexOf(dayKey(d)) !== -1;
      html += '<span class="wd' + (on ? ' on' : '') + '"><i></i><small>' + d.toLocaleDateString('ar', { weekday: 'narrow' }) + '</small></span>';
    }
    wk.innerHTML = html;
    $('#hs-nawawi').textContent = num(nw) + ' / ' + num(40);
    $('#hs-nawawi-bar').style.width = Math.min(100, Math.round(nw / 40 * 100)) + '%';
    var any = !!(last || resume || ayahs || adhkar || nw);
    $('#home-empty').hidden = any; $('#home-stats').hidden = !any;
  }

  var tt;
  function toast(msg, bad) {
    var t = $('#home-toast'); if (!t) return;
    t.textContent = msg; t.hidden = false; t.classList.toggle('is-error', !!bad);
    clearTimeout(tt); tt = setTimeout(function () { t.hidden = true; }, 3200);
  }

  function init() {
    if (!$('#home-stats')) return;
    var dc = document.getElementById('daily-continuity'), cols = $('.home-columns');   // لوحة الاستمرارية القائمة تنتقل بجوار النشاط بدل تضخيم أعلى الصفحة
    if (dc && cols) cols.appendChild(dc);
    paintHeader(); paintActivity();
    var home = $('#home');
    new MutationObserver(function () { if (home.classList.contains('is-active')) { paintHeader(); paintActivity(); } }).observe(home, { attributes: true, attributeFilter: ['class'] });
    if (App.bus && App.bus.on) App.bus.on('lastread', paintActivity);
    window.addEventListener('storage', paintActivity);
    var add = $('#plan-progress-add');
    if (add) add.addEventListener('click', function () { setTimeout(function () { toast('تم تسجيل إنجاز اليوم.'); paintActivity(); }, 30); });
    $('#quick-grid').addEventListener('click', function (e) {
      var a = e.target.closest('a.qa'); if (!a) return;
      var id = a.getAttribute('data-target'); if (!id) return;
      setTimeout(function () {
        var el = document.getElementById(id);
        if (!el) { toast('تعذّر العثور على هذه الأداة. افتح القسم من القائمة.', true); return; }
        (el.closest('article') || el).scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 120);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
