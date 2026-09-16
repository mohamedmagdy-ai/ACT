// ======= اختبارات نظام الترخيص/الموديولات + حماية showTab =======
// يغطي: الوضع الافتراضي (بدون ترخيص = صفر تأثير)، قفل موديول معيّن (زي الصيانة)،
// منع فتح تاب مقفول حتى باستدعاء مباشر للكود (مش بس إخفاء الزرار)، رجوع كل حاجة
// طبيعي بعد إلغاء القفل، وظهور زرار التجربة المجانية.
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('license-modules');
  const { browser, page, pageErrors } = await openApp();

  const t1 = await page.evaluate(() => {
    applyModuleRestrictions();
    const hidden = Array.from(document.querySelectorAll('.ntab[onclick]')).filter(b => b.style.display === 'none');
    return { hiddenCount: hidden.length, disabledIds: _disabledTabIds() };
  });
  r.eq('الوضع الافتراضي (بدون ترخيص): صفر تابات مخفية', t1.hiddenCount, 0);

  const t2 = await page.evaluate(() => {
    LICENSE_CONFIG.enabled = true;
    _licCacheSet({ key: 'TEST-KEY', active: true, expiresAt: '2099-01-01', modules: { maintenance: false, insurance: false }, trial: false });
    applyModuleRestrictions();
    const hiddenIds = Array.from(document.querySelectorAll('.ntab[onclick]'))
      .filter(b => b.style.display === 'none')
      .map(b => (b.getAttribute('onclick').match(/showTab\('([a-zA-Z]+)'/) || [])[1]);
    return hiddenIds.sort();
  });
  r.eq('قفل موديول الصيانة+التأمينات بيخفي التابات الصح بالظبط', t2, ['insurance', 'maintinv', 'rcpt', 'svccenters', 'wo'].sort());

  const t3 = await page.evaluate(() => {
    showTab('wo', null);
    return document.getElementById('s-wo').classList.contains('active');
  });
  r.ok('استدعاء مباشر لتاب مقفول (showTab) بيتمنع فعليًا، مش بس إخفاء الزرار', t3 === false);

  const t4 = await page.evaluate(() => {
    showTab('sales', null);
    return document.getElementById('s-sales').classList.contains('active');
  });
  r.ok('تاب مسموح (مش مقفول) بيشتغل عادي', t4 === true);

  const t5 = await page.evaluate(() => {
    LICENSE_CONFIG.enabled = false;
    applyModuleRestrictions();
    return document.querySelectorAll('.ntab[onclick][style*="display: none"]').length;
  });
  r.eq('إلغاء الترخيص بيرجّع كل التابات تظهر تاني', t5, 0);

  const t6 = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#license-gate button'));
    const trialBtn = btns.find(b => b.textContent.includes('نسخة تجريبية'));
    return !!trialBtn;
  });
  r.ok('زرار "ابدأ نسخة تجريبية مجانية" موجود في شاشة الترخيص', t6);

  r.ok('لا يوجد أي خطأ JS غير متوقع أثناء تشغيل الاختبار', pageErrors.length === 0);
  if (pageErrors.length) console.log('  Page errors:', pageErrors);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
