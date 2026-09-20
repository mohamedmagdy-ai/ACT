// ======= اختبار: ملخص "لوحة متابعة المالك" على الموبايل (buildOwnerDashboardSnapshot) =======
// أول تجربة لفكرة "صاحب المحل يشوف الوضع من على الموبايل": البرنامج بيحسب ملخص صغير
// (مبيعات النهارده كاش/فيزا/آجل، الخزنة، النواقص، الفواتير الآجلة، واتساب المعلّق، وبعد
// طلب المستخدم زوّدناه بتقرير شامل مختصر للشهر (زي شاشة "📊 التقارير")، مصروفات الشهر،
// مسحوباتي، وملخص الموظفين (HR)) ويكتبه في مستند Firestore منفصل (sz_data/_dashboard) —
// صفحة الموبايل هتقرا المستند ده بس، مش كل بيانات المحل. الاختبار ده بيتأكد إن الحساب
// صح، وإن الكتابة لـFirestore بتحصل صح ومحدودة (مش كل مرة تتعمل فيها أي حفظة صغيرة).
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('owner-dashboard-snapshot');
  const { browser, page, pageErrors } = await openApp();

  // ===== تجهيز: بيانات معروفة (مبيعات، صنف منخفض، واتساب معلّق، مشتريات آجلة، مصروفات،
  // مسحوبات، موظفين) — عشان نغطي كل بنود الملخص الجديدة زي ما طلب المستخدم =====
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
    DB.payments = [];
    DB.purchases = [{ id: 'PUR-1', date: todayStr, supplier: 'مورد ١', total: 400, payment: 'آجل' }];
    DB.expenses = [
      { id: 'EXP-1', date: todayStr, type: 'إيجار', amount: 1000, payment: 'كاش' },
      { id: 'EXP-2', date: todayStr, type: 'كهرباء وماء', amount: 300, payment: 'كاش' },
    ];
    DB.withdrawals = [
      { id: 'WD-1', date: todayStr, amount: 200, partner: 'الشريك أ', type: 'withdraw' },
      { id: 'WD-2', date: todayStr, amount: 100, partner: 'الشريك أ', type: 'deposit' },
    ];
    DB.employees = [
      { id: 'EMP-1', name: 'موظف نشط', status: 'active', salary: 3000, leaveRequests: [{ type: 'unpaid', settled: false }] },
      { id: 'EMP-2', name: 'موظف متوقف', status: 'inactive', salary: 2000, leaveRequests: [] },
    ];
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

  // ===== ١.أ) التقرير الشامل للشهر (monthReport) — نفس منطق شاشة "📊 التقارير" =====
  r.ok('فيه monthReport', !!snap.monthReport);
  r.eq('إيراد الشهر = 950 (300+150+500)', snap.monthReport.revenue, 950);
  r.eq('مستحق عليا (مشتريات آجلة) = 400', snap.monthReport.debtOnMe, 400);
  r.eq('مستحق ليا في monthReport = نفس deferredTotal (500)', snap.monthReport.debtToMe, snap.deferredTotal);
  r.ok('فيه رقم ربح (موجب أو سالب)', typeof snap.monthReport.profit === 'number');
  r.ok('فيه رقم سيولة', typeof snap.monthReport.liquidityNet === 'number');

  // ===== ١.ب) مصروفات الشهر (expensesMonth) =====
  r.eq('إجمالي مصروفات الشهر = 1300 (1000+300)', snap.expensesMonth.total, 1300);
  r.eq('أكبر بند مصروف = إيجار بقيمة 1000', snap.expensesMonth.byType[0].type, 'إيجار');
  r.eq('قيمة بند الإيجار = 1000', snap.expensesMonth.byType[0].amount, 1000);

  // ===== ١.ج) مسحوباتي الشهر (withdrawalsMonth) — الإيداع لا يُحسب ضمن إجمالي السحب =====
  r.eq('إجمالي مسحوبات الشهر = 200 (الإيداع مش محسوب)', snap.withdrawalsMonth.total, 200);
  r.eq('آخر الحركات فيها السحب والإيداع مع بعض (2 حركة)', snap.withdrawalsMonth.recent.length, 2);

  // ===== ١.د) ملخص الموظفين (hr) =====
  r.eq('عدد الموظفين = 2', snap.hr.employeesCount, 2);
  r.eq('عدد النشطين = 1', snap.hr.activeCount, 1);
  r.eq('إجمالي رواتب الشهر (نشطين بس) = 3000', snap.hr.monthlySalariesTotal, 3000);
  r.eq('عدد الإجازات بدون أجر المعلّقة = 1', snap.hr.pendingUnpaidLeaves, 1);

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
  r.ok('البيانات المكتوبة فيها monthReport/expensesMonth/withdrawalsMonth/hr', !!(t3[0] && t3[0].data && t3[0].data.monthReport && t3[0].data.expensesMonth && t3[0].data.withdrawalsMonth && t3[0].data.hr));

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
