/* ==========================================================
   أُنس أحمد V18 — ai.js (واجهة المساعد الديني)
   · يتصل بنقطة خادم (Netlify Function) تحمل المفتاح؛ لا مفتاح ولا طرف ثالث في المتصفح
   · الموقع يعمل كاملاً دون إعداد المساعد؛ تظهر رسالة واضحة فقط داخل نافذته
   · الردود تُعرض بـ textContent (لا HTML) · سجل المحادثة اختياري ومحلي على الجهاز
   ========================================================== */
(function () {
  'use strict';

  var App = (window.Sakina = window.Sakina || {});
  var $ = App.$, on = App.on;
  var ENDPOINT = (window.UNS_CONFIG && window.UNS_CONFIG.AI_ENDPOINT) || '/.netlify/functions/chat';
  var HISTORY_KEY = 'uns:ai:history:v1', OPT_KEY = 'uns:ai:save:v1';

  var box = $('#ai-messages'), input = $('#ai-input'), typing = $('#ai-typing'), sendBtn = $('#ai-send');
  var statusDot = $('.ai-status'), topbar = $('.ai-topbar');
  var busy = false, history = [], configured = null;

  var SUGGESTIONS = [
    'ما معنى الصبر في القرآن؟',
    'كيف أنظّم وردًا يوميًا من القرآن؟',
    'اشرح لي معنى كلمة «السكينة»',
    'ما فضل أذكار الصباح والمساء؟',
    'ضع لي خطة لحفظ جزء عمّ'
  ];

  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* لا يهم */ } }
  function saveOn() { return !!lsGet(OPT_KEY, false); }
  function persist() { if (saveOn()) lsSet(HISTORY_KEY, history.slice(-30)); }

  function setStatus(text, isError) {
    if (!statusDot) return;
    statusDot.textContent = '';
    var d = document.createElement('i'); d.className = 'dot'; d.setAttribute('aria-hidden', 'true');
    if (isError) d.style.background = '#f87171';
    statusDot.appendChild(d); statusDot.appendChild(document.createTextNode(' ' + text));
  }

  /* ───────── الفقاعات ───────── */
  function bubble(role, text, sources) {
    var b = document.createElement('div');
    b.className = 'bubble ' + (role === 'user' ? 'user' : 'ai');
    var p = document.createElement('div'); p.className = 'bubble-text'; p.textContent = text; b.appendChild(p);

    if (role !== 'user' && text) {
      if (sources && sources.length) {
        var src = document.createElement('div'); src.className = 'bubble-sources';
        var lab = document.createElement('strong'); lab.textContent = 'المصادر: '; src.appendChild(lab);
        sources.forEach(function (s, i) {
          if (!/^https:\/\//i.test(s.url)) return;
          var a = document.createElement('a'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = s.title || s.url;
          src.appendChild(a); if (i < sources.length - 1) src.appendChild(document.createTextNode(' · '));
        });
        b.appendChild(src);
      }
      var copy = document.createElement('button');
      copy.type = 'button'; copy.className = 'bubble-copy'; copy.setAttribute('aria-label', 'نسخ الإجابة'); copy.textContent = 'نسخ';
      on(copy, 'click', function () {
        var done = function () { copy.textContent = 'تم النسخ ✓'; setTimeout(function () { copy.textContent = 'نسخ'; }, 1500); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { copy.textContent = 'تعذّر النسخ'; });
        else { try { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); } catch (e) { copy.textContent = 'تعذّر النسخ'; } }
      });
      b.appendChild(copy);
    }
    box.appendChild(b);
    box.scrollTop = box.scrollHeight;
    return b;
  }

  function note(text) {
    var n = document.createElement('div'); n.className = 'bubble ai bubble-note'; n.textContent = text;
    box.appendChild(n); box.scrollTop = box.scrollHeight; return n;
  }

  /* ───────── الإرسال ───────── */
  function send(textOverride) {
    var text = (textOverride || (input && input.value) || '').trim();
    if (!text || busy) return;
    if (text.length > 2000) { note('السؤال طويل جدًا (الحد 2000 حرف). اختصره من فضلك.'); return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { note('لا يوجد اتصال بالإنترنت. المساعد يحتاج اتصالًا.'); setStatus('غير متصل', true); return; }

    var sug = $('.ai-suggestions', box); if (sug) sug.remove();
    bubble('user', text);
    history.push({ role: 'user', content: text });
    if (input) input.value = '';
    busy = true; if (typing) typing.hidden = false; if (sendBtn) sendBtn.disabled = true;
    setStatus('يكتب…', false);

    var msgs = history.slice(-12);
    while (msgs.length && msgs[0].role !== 'user') msgs.shift();

    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 45000);

    fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: msgs }), signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) { return { res: res, data: data }; });
      })
      .then(function (r) {
        if (r.res.ok && r.data && r.data.reply) {
          history.push({ role: 'assistant', content: r.data.reply });
          bubble('ai', r.data.reply, r.data.sources);
          persist(); configured = true; setStatus('متصل', false);
          return;
        }
        history.pop();                                       // لا نُبقي سؤالًا بلا جواب في السياق
        var code = r.data && r.data.error;
        if (code === 'not_configured' || r.res.status === 404) { configured = false; note('المساعد الذكي غير مُفعّل بعد على هذا الموقع. يحتاج صاحب الموقع إلى ضبط مفتاح الخدمة (انظر ملف README). بقية الموقع تعمل بشكل طبيعي.'); setStatus('غير مُفعّل', true); }
        else if (code === 'rate_limited') { note((r.data && r.data.message) || 'طلبات كثيرة. انتظر قليلًا.'); setStatus('مشغول', true); }
        else { note((r.data && r.data.message) || 'تعذّر الحصول على إجابة الآن. أعد المحاولة.'); setStatus('خطأ', true); }
      })
      .catch(function (err) {
        history.pop();
        note(err && err.name === 'AbortError' ? 'استغرق الرد وقتًا طويلًا. أعد المحاولة.' : 'تعذّر الاتصال بالمساعد. تحقّق من الإنترنت ثم أعد المحاولة.');
        setStatus('غير متصل', true);
      })
      .then(function () {
        clearTimeout(timer); busy = false; if (typing) typing.hidden = true; if (sendBtn) sendBtn.disabled = false; if (input) input.focus();
      });
  }

  /* ───────── أدوات الواجهة: مسح، حفظ السجل، اقتراحات ───────── */
  function addSuggestions() {
    if (!box || $('.ai-suggestions', box)) return;
    var wrap = document.createElement('div'); wrap.className = 'ai-suggestions';
    SUGGESTIONS.forEach(function (q) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'ai-chip'; b.textContent = q;
      on(b, 'click', function () { send(q); });
      wrap.appendChild(b);
    });
    box.appendChild(wrap);
  }
  function greet() { bubble('ai', 'السلام عليكم ورحمة الله وبركاته 🌙\nاسألني عن معاني القرآن والأذكار وتنظيم الورد. أحرص على التفريق بين النص الشرعي والتفسير والرأي، وأقول «لست متأكدًا» حين لا أتيقّن.'); addSuggestions(); }
  function clearChat() { history = []; try { localStorage.removeItem(HISTORY_KEY); } catch (e) { /* لا يهم */ } if (box) box.textContent = ''; greet(); }

  function buildTools() {
    if (!topbar || $('.ai-tools', topbar)) return;
    var tools = document.createElement('div'); tools.className = 'ai-tools';
    var clr = document.createElement('button'); clr.type = 'button'; clr.className = 'icon-btn round'; clr.id = 'ai-clear'; clr.setAttribute('aria-label', 'مسح المحادثة'); clr.title = 'مسح المحادثة'; clr.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
    on(clr, 'click', function () { if (!history.length || confirm('مسح المحادثة الحالية؟')) clearChat(); });
    var lab = document.createElement('label'); lab.className = 'ai-save'; lab.title = 'يُحفظ على جهازك فقط';
    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'ai-save-history'; cb.checked = saveOn();
    on(cb, 'change', function () { lsSet(OPT_KEY, cb.checked); if (cb.checked) persist(); else { try { localStorage.removeItem(HISTORY_KEY); } catch (e) { /* لا يهم */ } } });
    lab.appendChild(cb); lab.appendChild(document.createTextNode(' حفظ السجل'));
    tools.appendChild(lab); tools.appendChild(clr);
    var close = $('#ai-close'); if (close && close.parentNode === topbar) topbar.insertBefore(tools, close); else topbar.appendChild(tools);
  }

  function probe() {
    if (configured !== null) return;
    fetch(ENDPOINT, { method: 'GET' }).then(function (r) { return r.ok ? r.json() : { configured: false }; })
      .then(function (j) { configured = !!(j && j.configured); setStatus(configured ? 'متصل' : 'غير مُفعّل', !configured); })
      .catch(function () { setStatus('غير متصل', true); });
  }

  on($('#ai-form'), 'submit', function (e) { e.preventDefault(); send(); });
  on(sendBtn, 'click', function () { send(); });
  if (input) input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });

  App.AI = {
    open: function () {
      buildTools();
      if (!box.children.length) {
        var saved = saveOn() ? lsGet(HISTORY_KEY, []) : [];
        if (Array.isArray(saved) && saved.length) { history = saved; saved.forEach(function (m) { bubble(m.role === 'user' ? 'user' : 'ai', m.content); }); }
        else greet();
      }
      probe();
      setTimeout(function () { if (input) input.focus(); }, 100);
    },
    close: function () { if (App.closeAI) App.closeAI(); }
  };
  on(document, 'keydown', function (e) { var ov = $('#ai-overlay'); if (e.key === 'Escape' && ov && !ov.hidden) App.AI.close(); });
  setStatus('جاهز', false);
})();
