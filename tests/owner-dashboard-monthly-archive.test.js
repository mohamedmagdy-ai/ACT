// ======= اختبار: أرشيف شهري للوحة متابعة الموبايل (buildMonthlyDashboardArchive) +
// إعدادات المحل القابلة للتعديل من الموبايل (pushMobileEditableSettings/
// pullMobileEditableSettingsIfNewer) =======
// طلب المستخدم: "تقرير مختصر عن كل شهر... لو عاوز شهر قبل كدا ادخل اعمل بحث" +
// "الاعدادات اللي على نسخة الكمبيوتر عاوزها عندي على الموبايل واقدر اتحكم فيها".
// buildOwnerDashboardSnapshot() (الاختبار التاني) بيحسب الشهر الحالي بس. الدالة الجديدة
// دي بتحسب نفس فكرة الملخص لأي شهر (حتى لو فات) وبتتكتب في مستند منفصل لكل شهر.
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('owner-dashboard-monthly-archive');
  const { browser, page, pageErrors } = await openApp();

  // ===== تجهيز: بيانات في شهرين مختلفين (الحالي والسابق) عشان نتأكد إن الأرشيف بياخد
  // شهر بعينه بس، مش كل البيانات مع بعض =====
  const seed = await page.evaluate(() => {
    const prevDate = new Date();
    prevDate.setMonth(prevDate.getMonth() - 1, 15); // ١٥ الشهر اللي فات (يوم آمن مش هيطلع الشهر الحالي أو اللي قبله)
    const prevStr = prevDate.toISOString().slice(0, 10);
    window.__prevMonthStr = prevStr.slice(0, 7);
    window.__curMonthStr = todayStr.slice(0, 7);

    localStorage.setItem('sz_store_cfg', JSON.stringify({ name: 'محل الاختبار' }));
    DB.products = [{ id: 'PRD-1', name: 'صنف الشهر الحالي', qty: 5, alert: 0, buy: 10, sell: 20 }];
    DB.sales = [
      { id: 'S-CUR', date: todayStr, total: 300, payment: 'كاش', customer: 'عميل حالي', items: [{ name: 'صنف الشهر الحالي', qty: 1, price: 300 }] },
      { id: 'S-PREV', date: prevStr, total: 500, payment: 'كاش', customer: 'عميل سابق' },
    ];
    DB.maintInvoices = [{ id: 'MI-PREV', date: prevStr, cost: 200, customer: 'عميل سابق', device: 'جهاز' }];
    DB.taxInvoices = [];
    DB.purchases = [];
    DB.expenses = [{ id: 'EXP-PREV', date: prevStr, type: 'إيجار', amount: 700, payment: 'كاش' }];
    DB.withdrawals = [{ id: 'WD-PREV', date: prevStr, amount: 150, partner: 'الشريك أ', type: 'withdraw' }];
    DB.receipts = [{ id: 'RCPT-PREV', date: prevStr, customer: 'عميل سابق', device: 'جهاز', status: 'done' }];
    DB.workOrders = [{ id: 'WO-PREV', date: prevStr, customer: 'عميل سابق', device: 'جهاز', total: 200, status: 'done' }];
    DB.openingBalances = [];
    DB.employees = [];
    DB.serviceCenters = [];
    DB.pendingWhatsapp = [];
    return true;
  });
  r.ok('تجهيز بيانات شهرين مختلفين نجح', seed === true);

  // ===== ١) buildMonthlyDashboardArchive(الشهر السابق) بياخد بيانات الشهر ده بس =====
  const archPrev = await page.evaluate(() => buildMonthlyDashboardArchive(window.__prevMonthStr));
  r.ok('buildMonthlyDashboardArchive() رجّعت كائن للشهر السابق', !!archPrev);
  r.eq('اسم الشهر في الأرشيف صح', archPrev.month, await page.evaluate(() => window.__prevMonthStr));
  r.eq('مبيعات الشهر السابق فيها فاتورة واحدة بس (S-PREV)', archPrev.sales.length, 1);
  r.eq('فاتورة الشهر السابق هي S-PREV', archPrev.sales[0].id, 'S-PREV');
  r.eq('فواتير الصيانة للشهر السابق فيها MI-PREV', archPrev.maintInvoices.length, 1);
  r.eq('أوامر الشغل للشهر السابق فيها WO-PREV', archPrev.workOrders.length, 1);
  r.eq('إذن الاستلام للشهر السابق فيه RCPT-PREV', archPrev.receipts.length, 1);
  r.eq('مصروفات الشهر السابق = 700', archPrev.expensesTotal, 700);
  r.eq('مسحوبات الشهر السابق = 150', archPrev.withdrawalsTotal, 150);
  // ملحوظة: salesTotal = مبيعات (500) + فواتير صيانة (200 من MI-PREV)، زي نفس منطق
  // monthSalesTotal في buildOwnerDashboardSnapshot (tm.sm + tm.mm) بالظبط
  r.eq('إجمالي مبيعات الشهر السابق (summary.salesTotal) = 700 (500 مبيعات + 200 صيانة)', archPrev.summary.salesTotal, 700);
  r.eq('عدد فواتير المبيعات في summary = 1', archPrev.summary.salesCount, 1);

  // ===== ٢) buildMonthlyDashboardArchive(الشهر الحالي) بياخد بيانات الشهر الحالي بس =====
  const archCur = await page.evaluate(() => buildMonthlyDashboardArchive(window.__curMonthStr));
  r.eq('مبيعات الشهر الحالي فيها فاتورة واحدة بس (S-CUR)', archCur.sales.length, 1);
  r.eq('فاتورة الشهر الحالي هي S-CUR', archCur.sales[0].id, 'S-CUR');
  r.eq('مصروفات الشهر الحالي = 0 (مفيش مصروفات في الشهر ده)', archCur.expensesTotal, 0);
  r.ok('الأكثر مبيعًا للشهر الحالي فيه الصنف اللي اتباع الشهر ده', archCur.bestSellers.some((p) => p.name === 'صنف الشهر الحالي'));

  // ===== ٣) شهر مفيهوش أي بيانات خالص = أرشيف فاضي (مش خطأ) =====
  const archEmpty = await page.evaluate(() => buildMonthlyDashboardArchive('2020-01'));
  r.ok('شهر فاضي خالص برضه بيرجّع كائن صحيح', !!archEmpty);
  r.eq('مفيش مبيعات في شهر 2020-01', archEmpty.sales.length, 0);
  r.eq('summary.salesTotal = 0', archEmpty.summary.salesTotal, 0);

  // ===== ٤) pushMonthlyDashboardArchives() — بتكتب مستند لكل من الشهر الحالي والسابق =====
  const t4 = await page.evaluate(() => {
    const writes = [];
    FS_COL = { doc: (id) => ({ set: (data) => { writes.push({ id, data }); return Promise.resolve(); }, get: () => Promise.resolve({ exists: false }) }) };
    window._fbReady = Promise.resolve();
    pushMonthlyDashboardArchives();
    return new Promise((resolve) => setTimeout(() => resolve(writes), 1200));
  });
  const curMonthStr = await page.evaluate(() => window.__curMonthStr);
  const prevMonthStr = await page.evaluate(() => window.__prevMonthStr);
  r.eq('كتابتين اتسجّلوا (الشهر الحالي + السابق)', t4.length, 2);
  r.ok('فيه كتابة لمستند "_dm_<الشهر الحالي>"', t4.some((w) => w.id === '_dm_' + curMonthStr));
  r.ok('فيه كتابة لمستند "_dm_<الشهر السابق>"', t4.some((w) => w.id === '_dm_' + prevMonthStr));

  // ===== ٥) إعدادات المحل القابلة للتعديل من الموبايل: pushMobileEditableSettings() =====
  const t5 = await page.evaluate(() => {
    localStorage.setItem('sz_store_cfg', JSON.stringify({ name: 'محل الاختبار', addr: 'عنوان تجريبي', tel1: '0100', tel2: '0200', mgrWhatsapp: '0111' }));
    localStorage.setItem('sz_tax_rate', '14');
    localStorage.setItem('sz_crn', '12345');
    localStorage.setItem('sz_taxcard', '999-888');
    const writes = [];
    FS_COL = { doc: (id) => ({ set: (data) => { writes.push({ id, data }); return Promise.resolve(); }, get: () => Promise.resolve({ exists: false }) }) };
    window._fbReady = Promise.resolve();
    pushMobileEditableSettings();
    return new Promise((resolve) => setTimeout(() => resolve(writes), 100));
  });
  r.eq('كتابة واحدة لمستند "_mobile_settings"', t5.length, 1);
  r.eq('اتكتبت في "_mobile_settings" بالظبط', t5[0] && t5[0].id, '_mobile_settings');
  r.eq('اسم المحل المكتوب صح', t5[0] && t5[0].data.name, 'محل الاختبار');
  r.eq('نسبة الضريبة المكتوبة صح', t5[0] && t5[0].data.taxRate, 14);
  r.eq('رقم السجل التجاري المكتوب صح', t5[0] && t5[0].data.crn, '12345');
  r.ok('فيه بصمة وقت (updatedAt)', typeof (t5[0] && t5[0].data.updatedAt) === 'number');

  // ===== ٦) pullMobileEditableSettingsIfNewer() — تعديل جه من الموبايل (updatedAt أحدث)
  // لازم يتطبّق هنا على localStorage =====
  const t6 = await page.evaluate(() => {
    const remoteData = { name: 'اسم جديد من الموبايل', addr: 'عنوان جديد', tel1: '0100', tel2: '0200', mgrWhatsapp: '0111', taxRate: 15, crn: '54321', taxcard: '111-222', updatedAt: Date.now() + 100000 };
    FS_COL = { doc: (id) => ({ get: () => Promise.resolve({ exists: true, data: () => remoteData }) }) };
    window._fbReady = Promise.resolve();
    localStorage.setItem('sz_mobile_settings_applied_at', '0'); // أقدم من أي تعديل جاي
    pullMobileEditableSettingsIfNewer();
    return new Promise((resolve) => setTimeout(() => resolve({
      storeCfg: JSON.parse(localStorage.getItem('sz_store_cfg') || '{}'),
      taxRate: localStorage.getItem('sz_tax_rate'),
      crn: localStorage.getItem('sz_crn'),
    }), 100));
  });
  r.eq('اسم المحل اتحدّث من التعديل الجاي من الموبايل', t6.storeCfg.name, 'اسم جديد من الموبايل');
  r.eq('نسبة الضريبة اتحدّثت من الموبايل', t6.taxRate, '15');
  r.eq('رقم السجل التجاري اتحدّث من الموبايل', t6.crn, '54321');

  // ===== ٧) تعديل أقدم (updatedAt أقدم من آخر مرة طبّقنا فيها) — متتطبقش (منعًا لتراجع البيانات) =====
  const t7 = await page.evaluate(() => {
    localStorage.setItem('sz_store_cfg', JSON.stringify({ name: 'الاسم الحالي الصحيح' }));
    localStorage.setItem('sz_mobile_settings_applied_at', String(Date.now()));
    const oldRemote = { name: 'اسم قديم لازم يتجاهل', updatedAt: Date.now() - 999999 };
    FS_COL = { doc: (id) => ({ get: () => Promise.resolve({ exists: true, data: () => oldRemote }) }) };
    window._fbReady = Promise.resolve();
    pullMobileEditableSettingsIfNewer();
    return new Promise((resolve) => setTimeout(() => resolve(JSON.parse(localStorage.getItem('sz_store_cfg') || '{}')), 100));
  });
  r.eq('تعديل أقدم من آخر مرة اتطبّقت متطبقش (الاسم فضل زي ما هو)', t7.name, 'الاسم الحالي الصحيح');

  r.ok('لا يوجد أي خطأ JS غير متوقع', pageErrors.length === 0);
  if (pageErrors.length) console.log('  Page errors:', pageErrors);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
