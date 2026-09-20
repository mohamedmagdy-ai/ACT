// ======= اختبار: ملخص "لوحة متابعة المالك" على الموبايل (buildOwnerDashboardSnapshot) =======
// أول تجربة لفكرة "صاحب المحل يشوف الوضع من على الموبايل": البرنامج بيحسب ملخص صغير
// (مبيعات النهارده كاش/فيزا/آجل، الخزنة، النواقص، الفواتير الآجلة، واتساب المعلّق)
// ويكتبه في مستند Firestore منفصل (sz_data/_dashboard) — صفحة الموبايل هتقرا المستند
// ده بس، مش كل بيانات المحل. الاختبار ده بيتأكد إن الحساب صح، وإن الكتابة لـFirestore
// بتحصل صح ومحدودة (مش كل مرة تتعمل فيها أي حفظة صغيرة في البرنامج).
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('owner-dashboard-snapshot');
  const { browser, page, pageErrors } = await openApp();

  // ===== تجهيز: بيانات معروفة (مبيعات كاش وفيزا وآجل، صنف بمخزون منخفض، رسالة واتساب معلّقة) =====
  const seed = await page.evaluate(() => {
    localStorage.setItem('sz_store_cfg', JSON.stringify({ name: 'محل الاختبار' }));
    DB.products = [{ id: 'PRD-1', name: 'صنف منخفض', qty: 2, alert: 5, buy: 10, sell: 20 }];
    DB.sales = [
      { id: 'S-1', date: todayStr, total: 300, payment: 'كاش', customer: 'عميل ١' },
      { id: 'S-2', date: todayStr, total: 150, payment: 'فيزا', customer: 'عميل ٢' },
      { id: 'S-3', date: todayStr, total: 500, payment: 'آجل', customer: 'عميل ٣', paid: 0 },
    ];
    DB.maintInvoices = [];
    DB.taxInvoices = [];
    DB.purchases = [];
    DB.expenses = [];
    DB.withdrawals = [];
    DB.receipts = [];
    DB.workOrders = [];
    DB.openingBalances = [];
    DB.pendingWhatsapp = [
      { id: 'PWA-1', phone: '01000000001', text: 'رسالة', customerLabel: 'عميل', sent: false, dismissed: false },
    ];
    return true;
  });
  r.ok('تجهيز البيانات التجريبية نجح', seed === true);

  // ===== ١) الحساب صح لكل بند =====
  const snap = await page.evaluate(() => buildOwnerDashboardSnapshot());
  r.ok('buildOwnerDashboardSnapshot() رجّعت كائن (مش null)', !!snap);
  r.eq('اسم المحل جاي من إعدادات المحل', snap.shopName, 'محل الاختبار');
  r.eq('مبيعات النهارده كاش = 300', snap.todaySales.cash, 300);
  r.eq('مبيعات النهارده فيزا = 150', snap.todaySales.visa, 150);
  r.eq('مبيعات النهارده آجل = 500', snap.todaySales.credit, 500);
  r.eq('عدد فواتير النهارده = 3', snap.todaySales.count, 3);
  r.eq('عدد الأصناف تحت حد التنبيه = 1', snap.lowStockCount, 1);
  r.eq('اسم الصنف المنخفض ظاهر في القايمة', snap.lowStockItems[0].name, 'صنف منخفض');
  r.eq('إجمالي الفواتير الآجلة المستحقة = 500', snap.deferredTotal, 500);
  r.eq('عدد الفواتير الآجلة المستحقة = 1', snap.deferredCount, 1);
  r.eq('عدد رسائل الواتساب المعلّقة = 1', snap.pendingWhatsappCount, 1);
  r.ok('فيه بصمة وقت (updatedAt)', typeof snap.updatedAt === 'number' && snap.updatedAt > 0);

  // ===== ٢) لا يوجد صنف تحت حد التنبيه = 0 ومفيش قايمة =====
  const t2 = await page.evaluate(() => {
    DB.products[0].qty = 50; // بقى متوفر
    const s = buildOwnerDashboardSnapshot();
    return { lowStockCount: s.lowStockCount, lowStockItems: s.lowStockItems.length };
  });
  r.eq('بعد ما الصنف بقى متوفر: عدد النواقص = 0', t2.lowStockCount, 0);
  r.eq('قايمة النواقص فاضية', t2.lowStockItems, 0);

  // ===== ٣) الكتابة لـFirestore: pushOwnerDashboardSnapshot() بتكتب لمستند _dashboard =====
  const t3 = await page.evaluate(() => {
    // ملحوظة: FS_COL متغيّر let على مستوى الـscript الأساسي — مش متعلّق بـwindow في
    // الوضع غير الصارم، فلازم نغيّره بالاسم المباشر (مش window.FS_COL) عشان التغيير
    // يوصل فعلاً للدالة اللي بتستخدمه جوه نفس النطاق (نفس الباج اتصلح زيه قبل كده في
    // login-remember.test.js مع window.CURRENT_USER)
    const writes = [];
    FS_COL = { doc: (id) => ({ set: (data) => { writes.push({ id, data }); return Promise.resolve(); } }) };
    window._fbReady = Promise.resolve();
    _ownerDashLastPush = 0; // نصفّر المُحدّد عشان نضمن كتابة فورية
    pushOwnerDashboardSnapshot();
    return new Promise((resolve) => setTimeout(() => resolve(writes), 50));
  });
  r.eq('عملية كتابة واحدة اتسجّلت', t3.length, 1);
  r.eq('اتكتبت في مستند "_dashboard" بالظبط', t3[0] && t3[0].id, '_dashboard');
  r.ok('البيانات المكتوبة فيها todaySales', !!(t3[0] && t3[0].data && t3[0].data.todaySales));

  // ===== ٤) التحديد الزمني: نداءين متتاليين سريعين = كتابة فورية واحدة بس (التانية بتتأجل) =====
  const t4 = await page.evaluate(() => {
    const writes = [];
    FS_COL = { doc: (id) => ({ set: (data) => { writes.push({ id, data }); return Promise.resolve(); } }) };
    _ownerDashLastPush = 0;
    pushOwnerDashboardSnapshot(); // فورية
    pushOwnerDashboardSnapshot(); // المفروض تتأجل (مش تتنفذ فورًا)
    return new Promise((resolve) => setTimeout(() => resolve(writes.length), 50));
  });
  r.eq('نداءين سريعين متتاليين = كتابة فورية واحدة بس (مش اتنين)', t4, 1);

  r.ok('لا يوجد أي خطأ JS غير متوقع', pageErrors.length === 0);
  if (pageErrors.length) console.log('  Page errors:', pageErrors);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
