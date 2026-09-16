// ======= اختبارات بلوك إعدادات ETA (الفاتورة/الإيصال الإلكتروني) =======
// البلوك ده "بنية تحتية" بس دلوقتي (مفيش اتصال فعلي بسيرفر الضرائب) — الاختبار هنا
// بيتأكد إن الحفظ/الاسترجاع شغالين صح، وإن قفله عبر الترخيص (لعميل مش محتاجه) بيشتغل
// من غير ما يأثر على باقي إعدادات الضريبة.
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('eta-settings');
  const { browser, page, pageErrors } = await openApp();

  const t1 = await page.evaluate(() => {
    loadTaxConfig();
    return {
      blockVisible: document.getElementById('eta-settings-block').style.display !== 'none',
      checkboxChecked: document.getElementById('cfg-eta-enabled').checked,
      fieldsHidden: document.getElementById('eta-config-fields').style.display === 'none',
      isEtaEnabled: isEtaEnabled()
    };
  });
  r.ok('البلوك ظاهر افتراضيًا (لو الترخيص مش شغال)', t1.blockVisible);
  r.ok('الخانة مطفية افتراضيًا', t1.checkboxChecked === false);
  r.ok('حقول الإعدادات التفصيلية مخفية طول ما الخانة مطفية', t1.fieldsHidden);
  r.ok('isEtaEnabled() ترجع false افتراضيًا', t1.isEtaEnabled === false);

  const t2 = await page.evaluate(() => {
    document.getElementById('cfg-eta-enabled').checked = true;
    toggleEtaConfigFields();
    document.getElementById('cfg-eta-env').value = 'preprod';
    document.getElementById('cfg-eta-activity').value = '4649';
    document.getElementById('cfg-eta-branchid').value = '1';
    document.getElementById('cfg-eta-clientid').value = 'CID-TEST';
    document.getElementById('cfg-eta-clientsecret').value = 'SECRET-TEST';
    saveTaxConfig();
    return getEtaConfig();
  });
  r.eq('حفظ إعدادات ETA بيحفظ كل القيم صح', t2, {
    enabled: true, env: 'preprod', activityCode: '4649', branchId: '1', clientId: 'CID-TEST', clientSecret: 'SECRET-TEST'
  });

  const t3 = await page.evaluate(() => {
    document.getElementById('cfg-eta-enabled').checked = false;
    document.getElementById('eta-config-fields').style.display = 'none';
    loadTaxConfig(); // زي ما بيحصل لو المستخدم قفل وفتح تبويب الإعدادات تاني
    return {
      checkboxRestored: document.getElementById('cfg-eta-enabled').checked,
      clientIdRestored: document.getElementById('cfg-eta-clientid').value
    };
  });
  r.ok('البيانات بترجع صح بعد إعادة تحميل شاشة الإعدادات', t3.checkboxRestored === true && t3.clientIdRestored === 'CID-TEST');

  const t4 = await page.evaluate(() => {
    LICENSE_CONFIG.enabled = true;
    _licCacheSet({ key: 'TEST-KEY', active: true, expiresAt: '2099-01-01', modules: { eta: false }, trial: false });
    applyModuleRestrictions();
    return {
      blockHidden: document.getElementById('eta-settings-block').style.display === 'none',
      taxFieldStillThere: !!document.getElementById('cfg-tax')
    };
  });
  r.ok('قفل موديول eta من الترخيص بيخفي البلوك بالكامل', t4.blockHidden);
  r.ok('باقي إعدادات الضريبة العادية مش متأثرة بقفل موديول ETA', t4.taxFieldStillThere);

  const t5 = await page.evaluate(() => {
    _licCacheSet({ key: 'TEST-KEY', active: true, expiresAt: '2099-01-01', modules: { eta: true }, trial: false });
    applyModuleRestrictions();
    const visibleWhenAllowed = document.getElementById('eta-settings-block').style.display !== 'none';
    LICENSE_CONFIG.enabled = false;
    applyModuleRestrictions();
    const visibleWhenLicenseOff = document.getElementById('eta-settings-block').style.display !== 'none';
    return visibleWhenAllowed && visibleWhenLicenseOff;
  });
  r.ok('البلوك بيرجع يظهر لما الموديول يتفتح أو الترخيص يتقفل خالص', t5);

  r.ok('لا يوجد أي خطأ JS غير متوقع أثناء تشغيل الاختبار', pageErrors.length === 0);
  if (pageErrors.length) console.log('  Page errors:', pageErrors);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
