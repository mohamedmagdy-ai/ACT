// ======= اختبار: روابط إرسال واتساب بتفتح تطبيق سطح المكتب على طول =======
// المشكلة اللي بيحلها الكود ده: الضغط على "واتساب" جوه البرنامج كان بيفتح صفحة
// كروم (wa.me) الأول، وبعدين لازم تدوس تاني عشان تفتح تطبيق واتساب فعليًا. الحل:
// استخدام بروتوكول whatsapp:// بدل wa.me، اللي بيفتح تطبيق واتساب لسطح المكتب
// مباشرة (main.js اتعدّل كمان يسمح بالبروتوكول ده — راجع external-url-policy.test.js).
// الاختبار ده بيتأكد إن كل نقاط الإرسال التلاتة (waSend، sendPendingWhatsapp،
// _waLink) بقت بتبني رابط whatsapp:// صح بنفس رقم الهاتف والرسالة.
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('whatsapp-desktop-link');
  const { browser, page, pageErrors } = await openApp();

  const t1 = await page.evaluate(() => {
    let captured = null;
    const orig = window.open;
    window.open = (url) => { captured = url; return null; };
    try {
      waSend('01012345678', 'اختبار الرسالة');
    } finally {
      window.open = orig;
    }
    return captured;
  });
  r.ok('waSend() بتفتح whatsapp:// مش wa.me', !!t1 && t1.startsWith('whatsapp://send?phone='));
  r.ok('waSend() بتبني الرقم بكود مصر (20) صح', !!t1 && t1.includes('phone=201012345678'));
  r.ok('waSend() بتحط نص الرسالة مُرمّز صح في الرابط', !!t1 && t1.includes(encodeURIComponent('اختبار الرسالة')));

  const t2 = await page.evaluate(() => {
    DB.pendingWhatsapp = DB.pendingWhatsapp || [];
    DB.pendingWhatsapp.unshift({ id: 'PWA-TEST-1', phone: '01098765432', text: 'رسالة معلّقة', customerLabel: 'عميل تجريبي', sent: false });
    let captured = null;
    const orig = window.open;
    window.open = (url) => { captured = url; return null; };
    try {
      sendPendingWhatsapp('PWA-TEST-1');
    } finally {
      window.open = orig;
    }
    return captured;
  });
  r.ok('sendPendingWhatsapp() برضه بتفتح whatsapp:// مش wa.me', !!t2 && t2.startsWith('whatsapp://send?phone=201098765432'));

  const t3 = await page.evaluate(() => {
    return _waLink('01055566677', 'رسالة بث');
  });
  r.ok('_waLink() (زرار واتساب في شاشة البث) بتبني whatsapp:// صح', t3.startsWith('whatsapp://send?phone=201055566677') && t3.includes(encodeURIComponent('رسالة بث')));

  r.ok('لا يوجد أي خطأ JS غير متوقع أثناء تشغيل الاختبار', pageErrors.length === 0);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
