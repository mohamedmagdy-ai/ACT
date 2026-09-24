// ======= اختبار: إصلاح حد تنبيه النواقص (5→1) وعدم إعادة تفعيل التنبيهات المكتومة =======
// السبب: p.alert=parseFloat($('pr-alrt').value)||5 كانت بتحوّل أي قيمة "0" (يعني تنبيه
// متوقف عمدًا عن طريق 🔔/🔕) لـ5 تلقائيًا عند أي حفظ لاحق للمنتج، لأن 0 قيمة falsy في
// JS. برضه صاحب المحل طلب إن القيمة الافتراضية الجديدة تبقى 1 مش 5 لكل الأصناف
// (القديمة اللي كانت على 5، والجديدة اللي هتتعمل).
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('alert-threshold-default');
  const { browser, page, pageErrors } = await openApp();

  // ===== ١) صنف مكتوم التنبيه (alert=0) — تعديل وحفظ حاجة تانية فيه (مش حقل التنبيه) لازم يفضل 0 =====
  const t1 = await page.evaluate(() => {
    if (typeof CURRENT_USER === 'undefined' || !CURRENT_USER) {
      CURRENT_USER = { username: 'tester', name: 'مستخدم اختبار', role: 'admin' };
    }
    const p = { id: 'PRD-D900', name: 'صنف مكتوم التنبيه', cat: 'اجهزة', subcat: '', section: 'devices', brand: 'Test', buy: 100, sell: 150, qty: 10, alert: 0, _prevAlert: 5, notes: '' };
    DB.products.unshift(p);
    openProdModal('PRD-D900');
    const alrtBeforeEdit = document.getElementById('pr-alrt').value;
    document.getElementById('pr-nm').value = 'صنف مكتوم التنبيه (اتعدّل)';
    saveProd();
    const saved = DB.products.find(x => x.id === 'PRD-D900');
    return { alrtBeforeEdit, savedAlert: saved ? saved.alert : null, savedName: saved ? saved.name : null };
  });
  r.eq('لما تفتح تعديل صنف مكتوم التنبيه، خانة "حد التنبيه" بتورّي 0 (مش فاضية أو 5)', t1.alrtBeforeEdit, '0');
  r.eq('بعد التعديل والحفظ، التنبيه فضل متوقف (0) — مرجعش يتفعّل لوحده', t1.savedAlert, 0);
  r.eq('التعديل الفعلي (الاسم) اتحفظ صح', t1.savedName, 'صنف مكتوم التنبيه (اتعدّل)');

  // ===== ٢) صنف على القيمة الافتراضية القديمة (5) — لما تفتحله وتحفظ من غير ما تلمس حقل التنبيه، يفضل 5 (الحفظ العادي مبيغيّرش القيمة اللي إنت كاتبها فعلاً) =====
  const t2 = await page.evaluate(() => {
    const p = { id: 'PRD-D901', name: 'صنف تاني', cat: 'اجهزة', subcat: '', section: 'devices', brand: 'Test', buy: 100, sell: 150, qty: 10, alert: 5, notes: '' };
    DB.products.unshift(p);
    openProdModal('PRD-D901');
    saveProd();
    const saved = DB.products.find(x => x.id === 'PRD-D901');
    return { savedAlert: saved ? saved.alert : null };
  });
  r.eq('صنف بحد تنبيه 5: حفظ عادي من غير تغيير الحقل بيفضل زي ما هو (5)', t2.savedAlert, 5);

  // ===== ٣) منتج جديد — القيمة الافتراضية في الفورم بقت 1 مش 5 =====
  const t3 = await page.evaluate(() => {
    openProdModal(null);
    return document.getElementById('pr-alrt').value;
  });
  r.eq('فورم "إضافة منتج جديد": حد التنبيه الافتراضي بقى 1 مش 5', t3, '1');

  // ===== ٤) الترحيل التلقائي (مرة واحدة): أصناف موجودة بحد تنبيه 5 بتتحول لـ1، والمكتومة (0) متتلمسش =====
  const t4 = await page.evaluate(() => {
    DB._alertDefaultMigratedTo1 = false;
    DB.products.push(
      { id: 'PRD-D910', name: 'صنف قديم على الافتراضي', alert: 5 },
      { id: 'PRD-D911', name: 'صنف مكتوم', alert: 0, _prevAlert: 5 },
      { id: 'PRD-D912', name: 'صنف بحد مخصص', alert: 10 }
    );
    const nMigrated = runAlertDefaultMigrationTo1();
    return {
      nMigrated,
      oldDefault: DB.products.find(x => x.id === 'PRD-D910').alert,
      muted: DB.products.find(x => x.id === 'PRD-D911').alert,
      custom: DB.products.find(x => x.id === 'PRD-D912').alert,
      flag: DB._alertDefaultMigratedTo1,
    };
  });
  r.ok('الترحيل غيّر صنف واحد على الأقل (اللي كان على القيمة القديمة 5)', t4.nMigrated >= 1);
  r.eq('الصنف اللي كان على 5 بقى 1', t4.oldDefault, 1);
  r.eq('الصنف المكتوم (0) فضل 0 — الترحيل مالوش دعوة بالمكتومين', t4.muted, 0);
  r.eq('الصنف بحد مخصص (10) فضل زي ما هو — الترحيل بيلمس بس القيمة الافتراضية القديمة', t4.custom, 10);
  r.ok('علامة "اتعمل الترحيل" اتسجلت', t4.flag === true);

  // ===== ٥) الترحيل مبيتكررش تاني لو العلامة متسجلة بالفعل =====
  const t5 = await page.evaluate(() => {
    DB.products.push({ id: 'PRD-D913', name: 'صنف بعد الترحيل', alert: 5 });
    const n = runAlertDefaultMigrationTo1();
    return { n, stillFive: DB.products.find(x => x.id === 'PRD-D913').alert };
  });
  r.eq('الترحيل ماشتغلش تاني (العلامة متسجلة بالفعل)', t5.n, 0);
  r.eq('صنف اتضاف بعد الترحيل بحد 5 فضل 5 (منطقي — الترحيل حدث تاريخي مرة واحدة، مش قاعدة دايمة)', t5.stillFive, 5);

  r.ok('لا يوجد أي خطأ JS غير متوقع', pageErrors.length === 0);
  if (pageErrors.length) console.log('  Page errors:', pageErrors);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
