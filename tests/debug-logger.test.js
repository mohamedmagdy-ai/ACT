// ======= اختبارات أداة التسجيل الموحّدة (logger) =======
// بيتأكد إن logger.log/warn فعلاً مخفيين افتراضيًا (مش ظاهرين في Console من غير تفعيل
// وضع التشخيص)، وإن logger.error فاضل ظاهر دايمًا (أخطاء حقيقية مينفعش تتخفى).
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('debug-logger');
  const { browser, page, pageErrors } = await openApp();

  const consoleTexts = [];
  page.on('console', msg => consoleTexts.push(msg.text()));

  await page.evaluate(() => {
    localStorage.removeItem('sz_debug_mode');
    logger.log('__T_LOG_HIDDEN__');
    logger.warn('__T_WARN_HIDDEN__');
    logger.error('__T_ERROR_ALWAYS_VISIBLE__');
  });
  r.ok('logger.log مخفي افتراضيًا (وضع التشخيص مطفي)', !consoleTexts.some(t => t.includes('__T_LOG_HIDDEN__')));
  r.ok('logger.warn مخفي افتراضيًا (وضع التشخيص مطفي)', !consoleTexts.some(t => t.includes('__T_WARN_HIDDEN__')));
  r.ok('logger.error فاضل ظاهر حتى من غير تفعيل وضع التشخيص', consoleTexts.some(t => t.includes('__T_ERROR_ALWAYS_VISIBLE__')));

  await page.evaluate(() => {
    toggleDebugMode(true);
    logger.log('__T_LOG_VISIBLE_NOW__');
    logger.warn('__T_WARN_VISIBLE_NOW__');
  });
  r.ok('logger.log بيظهر بعد تفعيل وضع التشخيص', consoleTexts.some(t => t.includes('__T_LOG_VISIBLE_NOW__')));
  r.ok('logger.warn بيظهر بعد تفعيل وضع التشخيص', consoleTexts.some(t => t.includes('__T_WARN_VISIBLE_NOW__')));

  const uiCheck = await page.evaluate(() => {
    loadDebugModeConfig();
    const checkedWhenOn = document.getElementById('cfg-debug-mode').checked;
    document.getElementById('cfg-debug-mode').checked = false;
    toggleDebugMode(false);
    return { checkedWhenOn, offAfterToggle: _debugModeOn() === false };
  });
  r.ok('خانة الإعدادات بتعكس حالة وضع التشخيص صح', uiCheck.checkedWhenOn === true);
  r.ok('إطفاء وضع التشخيص من الإعدادات بيشتغل فعليًا', uiCheck.offAfterToggle);

  r.ok('لا يوجد أي خطأ JS غير متوقع أثناء تشغيل الاختبار', pageErrors.length === 0);
  if (pageErrors.length) console.log('  Page errors:', pageErrors);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
