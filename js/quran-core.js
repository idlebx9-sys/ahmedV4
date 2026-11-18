/* ==========================================================
   أُنس أحمد V18 — quran-core.js
   طبقة بيانات القرآن (منفصلة تماماً عن الواجهة):
   · بيانات السور الـ114 مضمّنة محلياً (الاسم، العدد، المكية/المدنية) — القائمة لا تحتاج شبكة
   · نص الآيات يُجلب من مصدر أساسي ثم احتياطي، ويُتحقق منه قبل القبول
   · كل سورة صحيحة تُخزَّن محلياً (IndexedDB ثم localStorage) للقراءة دون اتصال
   · لا يُنشأ أي نص قرآني يدوياً هنا: النص يأتي من المصدر فقط
   ========================================================== */
(function (root) {
  'use strict';

  var App = (root.Sakina = root.Sakina || {});

  /* ───────── بيانات مرجعية ثابتة ─────────
     عدد الآيات حسب العدّ الكوفي المعتمد في مصاحف المدينة (مجموعها 6236).
     التصنيف المكي/المدني وفق بيانات Tanzil؛ وفي بعض السور خلاف معتبر بين العلماء. */
  var NAMES = ['الفاتحة','البقرة','آل عمران','النساء','المائدة','الأنعام','الأعراف','الأنفال','التوبة','يونس','هود','يوسف','الرعد','إبراهيم','الحجر','النحل','الإسراء','الكهف','مريم','طه','الأنبياء','الحج','المؤمنون','النور','الفرقان','الشعراء','النمل','القصص','العنكبوت','الروم','لقمان','السجدة','الأحزاب','سبأ','فاطر','يس','الصافات','ص','الزمر','غافر','فصلت','الشورى','الزخرف','الدخان','الجاثية','الأحقاف','محمد','الفتح','الحجرات','ق','الذاريات','الطور','النجم','القمر','الرحمن','الواقعة','الحديد','المجادلة','الحشر','الممتحنة','الصف','الجمعة','المنافقون','التغابن','الطلاق','التحريم','الملك','القلم','الحاقة','المعارج','نوح','الجن','المزمل','المدثر','القيامة','الإنسان','المرسلات','النبأ','النازعات','عبس','التكوير','الانفطار','المطففين','الانشقاق','البروج','الطارق','الأعلى','الغاشية','الفجر','البلد','الشمس','الليل','الضحى','الشرح','التين','العلق','القدر','البينة','الزلزلة','العاديات','القارعة','التكاثر','العصر','الهمزة','الفيل','قريش','الماعون','الكوثر','الكافرون','النصر','المسد','الإخلاص','الفلق','الناس'];
  var COUNTS = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];
  var MEDINAN = [2,3,4,5,8,9,13,22,24,33,47,48,49,55,57,58,59,60,61,62,63,64,65,66,76,98,99,110];
  var TOTAL_AYAHS = 6236;

  var OFFSETS = (function () {          // عدد الآيات قبل كل سورة → رقم الآية العام
    var o = [0], s = 0;
    for (var i = 0; i < COUNTS.length; i++) { s += COUNTS[i]; o.push(s); }
    return o;
  })();

  var SURAHS = NAMES.map(function (name, i) {
    return {
      number: i + 1,
      name: name,
      numberOfAyahs: COUNTS[i],
      revelationType: MEDINAN.indexOf(i + 1) >= 0 ? 'Medinan' : 'Meccan',
      firstGlobal: OFFSETS[i] + 1
    };
  });

  function surah(n) { return SURAHS[n - 1] || null; }
  function globalAyah(s, a) { return OFFSETS[s - 1] + a; }      // 1..6236

  /* ───────── أدوات النص ───────── */
  function stripMarks(s) {
    return String(s == null ? '' : s)
      .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u08D3-\u08FF]/g, '')
      .replace(/[آأإٱٲٳ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
  }
  var BASMALA_WORDS = ['بسم', 'الله', 'الرحمن', 'الرحيم'];

  /* بعض المصادر تُلحق البسملة بأول آية؛ نفصلها بالمقارنة على الحروف بلا تشكيل
     (وليس بتعبير يعتمد على ترميز محدد). لا تُطبَّق على الفاتحة (آيتها الأولى هي البسملة). */
  function splitBasmala(surahNumber, ayahNumber, text) {
    if (ayahNumber !== 1 || surahNumber === 1 || surahNumber === 9) return { text: text, had: false };
    var parts = String(text).replace(/^\uFEFF/, '').trim().split(/\s+/);
    if (parts.length <= 4) return { text: text, had: false };
    for (var i = 0; i < 4; i++) if (stripMarks(parts[i]) !== BASMALA_WORDS[i]) return { text: text, had: false };
    return { text: parts.slice(4).join(' '), had: true };
  }

  /* ───────── التحقق من اكتمال السورة ───────── */
  function validateAyahs(surahNumber, ayahs) {
    var meta = surah(surahNumber);
    if (!meta) return 'رقم سورة غير صحيح';
    if (!Array.isArray(ayahs)) return 'بيانات الآيات ليست قائمة';
    if (ayahs.length !== meta.numberOfAyahs) return 'عدد الآيات ' + ayahs.length + ' بدل ' + meta.numberOfAyahs;
    for (var i = 0; i < ayahs.length; i++) {
      var a = ayahs[i];
      if (!a || a.n !== i + 1) return 'ترتيب الآيات غير متسلسل عند ' + (i + 1);
      if (typeof a.text !== 'string' || !/[\u0621-\u064A]/.test(a.text)) return 'نص فارغ أو غير عربي في الآية ' + (i + 1);
    }
    return null;   // سليم
  }

  /* ───────── المصادر ───────── */
  var TIMEOUT = 15000;
  var SOURCES = [
    {
      id: 'alquran.cloud',
      pages: function () { return null; },
      url: function (n) { return 'https://api.alquran.cloud/v1/surah/' + n + '/quran-uthmani'; },
      parse: function (res) {
        if (!res || res.code !== 200 || !res.data || !Array.isArray(res.data.ayahs)) return null;
        return res.data.ayahs.map(function (a) { return { n: a.numberInSurah, text: a.text }; });
      }
    },
    {
      id: 'quran.com',
      paged: true,
      url: function (n, page) {
        return 'https://api.quran.com/api/v4/verses/by_chapter/' + n +
          '?language=ar&words=false&fields=text_uthmani&per_page=50&page=' + (page || 1);
      },
      parse: function (res) {
        if (!res || !Array.isArray(res.verses)) return null;
        return res.verses.map(function (v) { return { n: v.verse_number, text: v.text_uthmani }; });
      },
      nextPage: function (res) { return res && res.pagination && res.pagination.next_page ? res.pagination.next_page : null; }
    }
  ];

  function fetchJSON(url, doFetch) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT);
    return doFetch(url, ctrl ? { signal: ctrl.signal } : {}).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }, function (err) {
      clearTimeout(timer);
      if (err && err.name === 'AbortError') throw new Error('انتهت مهلة الاتصال');
      throw err;
    });
  }

  function fromSource(src, n, doFetch) {
    var all = [];
    function step(page) {
      return fetchJSON(src.url(n, page), doFetch).then(function (res) {
        var part = src.parse(res);
        if (!part) throw new Error('شكل استجابة غير متوقع');
        all = all.concat(part);
        var np = src.paged && src.nextPage ? src.nextPage(res) : null;
        if (np && all.length < 400) return step(np);
        return all;
      });
    }
    return step(1).then(function (raw) {
      var ayahs = raw.map(function (a) {
        var sp = splitBasmala(n, a.n, a.text);
        return { n: a.n, g: globalAyah(n, a.n), text: String(sp.text).trim() };
      });
      var bad = validateAyahs(n, ayahs);
      if (bad) throw new Error('فشل التحقق: ' + bad);
      return ayahs;
    });
  }

  /* ───────── التخزين المحلي: IndexedDB ثم localStorage ───────── */
  var DB_NAME = 'uns-ahmad-quran', STORE = 'surahs', LS_PREFIX = 'uns:q:v1:';
  var memory = {};
  var dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      try {
        if (!root.indexedDB) return resolve(null);
        var req = root.indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () { req.result.createObjectStore(STORE, { keyPath: 'n' }); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { resolve(null); };
        req.onblocked = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
    return dbPromise;
  }

  function cacheGet(n) {
    if (memory[n]) return Promise.resolve(memory[n]);
    return openDB().then(function (db) {
      if (!db) return lsGet(n);
      return new Promise(function (resolve) {
        try {
          var rq = db.transaction(STORE, 'readonly').objectStore(STORE).get(n);
          rq.onsuccess = function () { resolve(rq.result || lsGet(n)); };
          rq.onerror = function () { resolve(lsGet(n)); };
        } catch (e) { resolve(lsGet(n)); }
      });
    }).then(function (rec) {
      if (rec && !validateAyahs(n, rec.ayahs)) { memory[n] = rec; return rec; }
      return null;   // سجل تالف: يُتجاهل ويُعاد الجلب
    });
  }
  function lsGet(n) {
    try { return JSON.parse(root.localStorage.getItem(LS_PREFIX + n) || 'null'); } catch (e) { return null; }
  }
  function cachePut(rec) {
    memory[rec.n] = rec;
    return openDB().then(function (db) {
      if (!db) { lsPut(rec); return; }
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(rec);
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { lsPut(rec); resolve(); };
        } catch (e) { lsPut(rec); resolve(); }
      });
    });
  }
  function lsPut(rec) { try { root.localStorage.setItem(LS_PREFIX + rec.n, JSON.stringify(rec)); } catch (e) { /* ممتلئ */ } }

  function cachedNumbers() {
    return openDB().then(function (db) {
      var set = {};
      Object.keys(memory).forEach(function (k) { set[k] = 1; });
      try {
        for (var i = 1; i <= 114; i++) if (root.localStorage.getItem(LS_PREFIX + i)) set[i] = 1;
      } catch (e) { /* لا يهم */ }
      if (!db) return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
      return new Promise(function (resolve) {
        try {
          var rq = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys();
          rq.onsuccess = function () { (rq.result || []).forEach(function (k) { set[k] = 1; }); resolve(Object.keys(set).map(Number).sort(function (a, b) { return a - b; })); };
          rq.onerror = function () { resolve(Object.keys(set).map(Number).sort(function (a, b) { return a - b; })); };
        } catch (e) { resolve(Object.keys(set).map(Number)); }
      });
    });
  }

  /* ───────── الواجهة العامة ─────────
     load(n) → { surah, ayahs:[{n,g,text}], source, fromCache }
     ترتيب المحاولة: الذاكرة/التخزين المحلي ← المصدر الأساسي ← الاحتياطي.
     عند الفشل الكامل يُرفض الوعد برسالة عربية مناسبة (والواجهة تعرض «إعادة المحاولة»). */
  function load(n, opts) {
    opts = opts || {};
    var meta = surah(n);
    if (!meta) return Promise.reject(new Error('رقم سورة غير صحيح'));
    var doFetch = opts.fetch || (root.fetch ? root.fetch.bind(root) : null);

    return cacheGet(n).then(function (rec) {
      if (rec && !opts.force) return { surah: meta, ayahs: rec.ayahs, source: rec.source, fromCache: true };
      if (!doFetch) {
        if (rec) return { surah: meta, ayahs: rec.ayahs, source: rec.source, fromCache: true };
        throw new Error('المتصفح لا يدعم الاتصال بالشبكة');
      }
      var errors = [], i = 0;
      function tryNext() {
        if (i >= SOURCES.length) {
          if (rec) return { surah: meta, ayahs: rec.ayahs, source: rec.source, fromCache: true, stale: true };
          var e = new Error('تعذّر تحميل السورة من جميع المصادر. تحقّق من الإنترنت ثم أعد المحاولة.');
          e.details = errors;
          throw e;
        }
        var src = SOURCES[i++];
        return fromSource(src, n, doFetch).then(function (ayahs) {
          var out = { n: n, source: src.id, at: Date.now(), ayahs: ayahs };
          cachePut(out);
          return { surah: meta, ayahs: ayahs, source: src.id, fromCache: false };
        }, function (err) {
          errors.push(src.id + ': ' + (err && err.message || err));
          return tryNext();
        });
      }
      return tryNext();
    });
  }

  var api = {
    SURAHS: SURAHS, TOTAL_AYAHS: TOTAL_AYAHS,
    surah: surah, globalAyah: globalAyah, stripMarks: stripMarks,
    splitBasmala: splitBasmala, validateAyahs: validateAyahs,
    load: load, cachedNumbers: cachedNumbers,
    _sources: SOURCES
  };
  App.QuranData = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
