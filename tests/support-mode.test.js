// ======= اختبارات وضع الدعم الفني المخفي (Ctrl+Alt+Shift+M) =======
// بيغطي: الاختصار السري بيفتح شاشة كلمة السر، الباسورد الغلط بيوري خطأ وميفتحش أي
// معلومات، الباسورد الصح بيفتح شاشة المعلومات، وإنها بتوضح صح لما الترخيص يكون
// مفعّل أو غير مفعّل — كل ده من غير ما يظهر أي زرار أو أثر ليها في الواجهة العادية.
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('support-mode');
  const { browser, page, pageErrors } = await openApp();

  const t1 = await page.evaluate(() => {
    return {
      noVisibleTrace: !document.body.innerHTML.includes('وضع الدعم الفني') || true, // العنصر لسه متعملش لحد ما يتفعّل
      gateNotYetInDom: !document.getElementById('__support_gate'),
    };
  });
  r.ok('مفيش أي عنصر لوضع الدعم الفني في الصفحة قبل استخدام الاختصار', t1.gateNotYetInDom);

  const t2 = await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'M', ctrlKey: true, altKey: true, shiftKey: true, bubbles: true }));
    return !!document.getElementById('__support_gate');
  });
  r.ok('الاختصار السري (Ctrl+Alt+Shift+M) بيفتح شاشة كلمة السر', t2);

  const t3 = await page.evaluate(() => {
    document.getElementById('__support_pass').value = 'كلمة سر غلط';
    document.getElementById('__support_ok').click();
    const errShown = document.getElementById('__support_err').style.display === 'block';
    const stillOnGate = !!document.getElementById('__support_gate');
    const infoNotOpened = !document.getElementById('__support_info');
    return { errShown, stillOnGate, infoNotOpened };
  });
  r.ok('باسورد غلط بيوري رسالة خطأ وميفتحش شاشة المعلومات', t3.errShown && t3.stillOnGate && t3.infoNotOpened);

  const t4 = await page.evaluate(() => {
    document.getElementById('__support_pass').value = SUPPORT_PASSCODE;
    document.getElementById('__support_ok').click();
    return {
      gateGone: !document.getElementById('__support_gate'),
      infoOpened: !!document.getElementById('__support_info'),
      mentionsDisabled: (document.getElementById('__support_info') || {}).textContent && document.getElementById('__support_info').textContent.includes('غير مفعّل'),
    };
  });
  r.ok('باسورد صح بيقفل شاشة كلمة السر ويفتح شاشة المعلومات', t4.gateGone && t4.infoOpened);
  r.ok('شاشة المعلومات بتوضح إن الترخيص غير مفعّل (النسخة الداخلية الافتراضية)', t4.mentionsDisabled);

  const t5 = await page.evaluate(() => {
    document.getElementById('__support_close').click();
    return !document.getElementById('__support_info');
  });
  r.ok('زرار "إغلاق" بيقفل شاشة المعلومات فعليًا', t5);

  const t6 = await page.evaluate(() => {
    LICENSE_CONFIG.enabled = true;
    _licCacheSet({ key: 'ACT-TEST-0000', clientName: 'عميل تجريبي', expiresAt: '2099-01-01', modules: { maintenance: false }, trial: false, cachedAt: Date.now() });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'M', ctrlKey: true, altKey: true, shiftKey: true, bubbles: true }));
    document.getElementById('__support_pass').value = SUPPORT_PASSCODE;
    document.getElementById('__support_ok').click();
    const txt = document.getElementById('__support_info').textContent;
    document.getElementById('__support_close').click();
    LICENSE_CONFIG.enabled = false;
    _licCacheSet(null);
    return txt;
  });
  r.ok('لما يكون فيه ترخيص شغال، شاشة المعلومات بتوري اسم العميل الصح', t6.includes('عميل تجريبي'));
  r.ok('شاشة المعلومات بتوري الخصائص المتوقفة الصح (الصيانة)', t6.includes('maintenance'));

  r.ok('لا يوجد أي خطأ JS غير متوقع أثناء تشغيل الاختبار', pageErrors.length === 0);
  if (pageErrors.length) console.log('  Page errors:', pageErrors);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
