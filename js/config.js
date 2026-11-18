/* إعدادات التشغيل — لا تضع هنا أي مفتاح سري (هذا الملف يصل إلى المتصفح) */
window.UNS_CONFIG = {
  // عنوان WebSocket لخادم وسيط خاص بخدمة Nabr لتصحيح التلاوة (انظر README). فارغ = الميزة غير مفعّلة.
  // مثال: 'wss://your-nabr-proxy.example.com/nabr'
  NABR_WS_URL: '',
  // نقطة المساعد الذكي (Netlify Function). تعمل بعد ضبط مفتاح المزوّد في متغيرات البيئة.
  AI_ENDPOINT: '/.netlify/functions/chat'
};
