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
    DB.products = [
      { id: 'PRD-1', name: 'صنف منخفض', qty: 2, alert: 5, buy: 10, sell: 20 },
      { id: 'PRD-2', name: 'صنف راكد', qty: 10, alert: 0, buy: 50, sell: 80 },
    ];
    DB.sales = [
      { id: 'S-1', date: todayStr, total: 300, payment: 'كاش', customer: 'عميل ١', items: [{ name: 'صنف منخفض', qty: 2, price: 100 }] },
      { id: 'S-2', date: todayStr, total: 150, payment: 'فيزا', customer: 'عميل ٢' },
      { id: 'S-3', date: todayStr, total: 500, payment: 'آجل', customer: 'عميل ٣', paid: 0 },
      { id: 'S-4', date: todayStr, total: 600, payment: 'آجل', customer: 'مركز الدلتا' },
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
    DB.receipts = [
      { id: 'RCPT-1', customer: 'عميل ١', device: 'جهاز ١', date: todayStr, status: 'open' },
      { id: 'RCPT-2', customer: 'عميل ٢', device: 'جهاز ٢', date: todayStr, status: 'done' },
    ];
    DB.workOrders = [
      { id: 'WO-1', customer: 'عميل ١', device: 'جهاز ١', total: 300, date: todayStr, status: 'open', exit: 'normal' },
      { id: 'WO-2', customer: 'عميل ٢', device: 'جهاز ٢', total: 250, date: todayStr, status: 'done', exit: 'normal' },
    ];
    DB.serviceCenters = [{ id: 'SC-1', name: 'مركز الدلتا', phone: '' }];
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
  r.eq('مبيعات النهارده آجل = 1100 (500 + 600 مركز الدلتا)', snap.todaySales.credit, 1100);
  r.eq('عدد فواتير النهارده = 4', snap.todaySales.count, 4);
  r.eq('عدد الأصناف تحت حد التنبيه = 1', snap.lowStockCount, 1);
  r.eq('اسم الصنف المنخفض ظاهر في القايمة', snap.lowStockItems[0].name, 'صنف منخفض');
  r.eq('إجمالي الفواتير الآجلة المستحقة = 1100', snap.deferredTotal, 1100);
  r.eq('عدد الفواتير الآجلة المستحقة = 2', snap.deferredCount, 2);
  r.eq('عدد رسائل الواتساب المعلّقة = 1', snap.pendingWhatsappCount, 1);
  r.ok('فيه بصمة وقت (updatedAt)', typeof snap.updatedAt === 'number' && snap.updatedAt > 0);

  // ===== ١.أ) التقرير الشامل للشهر (monthReport) — نفس منطق شاشة "📊 التقارير" =====
  r.ok('فيه monthReport', !!snap.monthReport);
  r.eq('إيراد الشهر = 1550 (300+150+500+600)', snap.monthReport.revenue, 1550);
  r.eq('مستحق عليا (مشتريات آجلة) = 400', snap.monthReport.debtOnMe, 400);
  r.eq('مستحق ليا في monthReport = نفس deferredTotal (1100)', snap.monthReport.debtToMe, snap.deferredTotal);
  r.ok('فيه رقم ربح (موجب أو سالب)', typeof snap.monthReport.profit === 'number');
  r.ok('فيه رقم سيولة', typeof snap.monthReport.liquidityNet === 'number');

  // ===== ١.ب.١) مستحق ليا/عليا بالتفصيل (receivables/payables) — المستخدم لاحظ إن كارت
  // "فواتير آجلة مستحقة" كان بيوري "اللي ليا" بس (إجمالي واحد كمان مش قايمة) من غير
  // "اللي عليا" خالص — دلوقتي الاتنين قوايم تفصيلية منفصلة زي شاشة "📊 التقارير" بالظبط =====
  r.eq('عدد فواتير مستحق ليا = 2 (S-3 وS-4)', snap.receivables.count, 2);
  r.eq('إجمالي مستحق ليا = 1100', snap.receivables.total, 1100);
  r.eq('أكبر فاتورة مستحقة ليا هي S-4 (مركز الدلتا 600)', snap.receivables.items[0].id, 'S-4');
  r.eq('اسم الطرف صح', snap.receivables.items[0].party, 'مركز الدلتا');
  r.eq('عدد فواتير مستحق عليا = 1 (PUR-1)', snap.payables.count, 1);
  r.eq('إجمالي مستحق عليا = 400', snap.payables.total, 400);
  r.eq('فاتورة المستحق عليا هي PUR-1', snap.payables.items[0].id, 'PUR-1');
  r.eq('اسم المورد صح', snap.payables.items[0].party, 'مورد ١');

  // ===== ١.هـ) الخزنة بالتفصيل (treasury) — كام نقدي/فيزا/انستا (نفس calcMethodTotals) =====
  r.ok('فيه treasury', !!snap.treasury);
  r.eq('كاش الخزنة يشمل مبيعات النهارده الكاش (300) — رقم موجود', typeof snap.treasury.cash, 'number');
  r.eq('فيزا الخزنة = 150 (مبيعة S-2)', snap.treasury.visa, 150);
  r.eq('انستا باي الخزنة = 0 (مفيش حركات انستا في البيانات التجريبية)', snap.treasury.instapay, 0);

  // ===== ١.و) كشوف الشهر الحالي كاملة — مبيعات/فواتير صيانة/أوامر شغل/إذن استلام
  // (مش آخر ١٥ بس، ده كان طلب المستخدم) + المفتوح دلوقتي من أوامر الشغل وإذونات الاستلام =====
  r.eq('كشف المبيعات الشهري فيه 4 فواتير', snap.recentSales.length, 4);
  r.eq('كشف أوامر الشغل الشهري فيه الاتنين (مفتوح ومنتهي)', snap.recentWorkOrders.length, 2);
  r.eq('كشف إذن الاستلام الشهري فيه الاتنين (مفتوح ومنتهي)', snap.recentReceipts.length, 2);
  r.eq('كشف فواتير الصيانة فاضي (مفيش فواتير صيانة مسجّلة في البيانات التجريبية)', snap.recentMaintInvoices.length, 0);
  r.eq('أوامر الشغل المفتوحة = أمر واحد بس (WO-1)', snap.openWorkOrders.length, 1);
  r.eq('أمر الشغل المفتوح هو WO-1', snap.openWorkOrders[0].id, 'WO-1');
  r.eq('إذونات الاستلام المفتوحة = إذن واحد بس (RCPT-1)', snap.openReceipts.length, 1);
  r.eq('إذن الاستلام المفتوح هو RCPT-1', snap.openReceipts[0].id, 'RCPT-1');

  // ===== ١.ز) مراكز الخدمة — عدد + أكبر مركز بالمستحق (مركز الدلتا بيه فاتورة آجلة 600) =====
  r.eq('عدد مراكز الخدمة = 1', snap.serviceCenters.count, 1);
  r.eq('فيه مركز واحد له مستحق (600)', snap.serviceCenters.top.length, 1);
  r.eq('اسم المركز صح', snap.serviceCenters.top[0].name, 'مركز الدلتا');
  r.eq('قيمة المستحق للمركز = 600', snap.serviceCenters.top[0].debt, 600);

  // ===== ١.ح) الأفضل والراكد — الصنف اللي اتباع النهارده يظهر في الأفضل، والراكد يظهر في الراكد =====
  r.ok('فيه صنف واحد على الأقل في الأفضل مبيعًا', snap.bestSellers.length >= 1);
  r.eq('الصنف الأكثر مبيعًا هو "صنف منخفض" (اتباع في S-1)', snap.bestSellers[0].name, 'صنف منخفض');
  r.ok('فيه صنف واحد على الأقل في الراكد', snap.stagnant.length >= 1);
  r.eq('"صنف راكد" ظاهر في قايمة الراكد (مفيش له أي حركة بيع)', snap.stagnant[0].name, 'صنف راكد');

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
    // ملحوظة: pushOwnerDashboardSnapshot() دلوقتي بتنده كمان pushMonthlyDashboardArchives()
    // (تحديث أرشيف الشهر الحالي/السابق) — فبنفلتر الكتابات على مستند "_dashboard" بالذات
    // عشان الاختبار ده يفحص سلوك الملخص الأساسي، مش الأرشيف الشهري (له اختبار منفصل)
    const writes = [];
    FS_COL = { doc: (id) => ({ set: (data) => { writes.push({ id, data }); return Promise.resolve(); } }) };
    window._fbReady = Promise.resolve();
    _ownerDashLastPush = 0; // نصفّر المُحدّد عشان نضمن كتابة فورية
    // بنمنع محاولة "تعبئة" أرشيف الشهور القديمة (backfillMonthlyDashboardArchives) من إنها
    // تشتغل هنا — عندها مؤقّتات متأخرة (٣٥٠ مللي+) ممكن تطلق بعد ما الاختبار ده يخلص
    // وتلوّث نتيجة اختبار تاني بعده لسه شغال على نفس الصفحة (له اختبار منفصل خاص بيه)
    _dmBackfillTried = true;
    pushOwnerDashboardSnapshot();
    return new Promise((resolve) => setTimeout(() => resolve(writes.filter((w) => w.id === '_dashboard')), 50));
  });
  r.eq('عملية كتابة واحدة اتسجّلت لمستند "_dashboard"', t3.length, 1);
  r.eq('اتكتبت في مستند "_dashboard" بالظبط', t3[0] && t3[0].id, '_dashboard');
  r.ok('البيانات المكتوبة فيها todaySales', !!(t3[0] && t3[0].data && t3[0].data.todaySales));
  r.ok('البيانات المكتوبة فيها monthReport/expensesMonth/withdrawalsMonth/hr', !!(t3[0] && t3[0].data && t3[0].data.monthReport && t3[0].data.expensesMonth && t3[0].data.withdrawalsMonth && t3[0].data.hr));

  // ===== ٤) التحديد الزمني: نداءين متتاليين سريعين = كتابة فورية واحدة بس لمستند
  // "_dashboard" (التانية بتتأجل) =====
  const t4 = await page.evaluate(() => {
    const writes = [];
    FS_COL = { doc: (id) => ({ set: (data) => { writes.push({ id, data }); return Promise.resolve(); } }) };
    _ownerDashLastPush = 0;
    pushOwnerDashboardSnapshot(); // فورية
    pushOwnerDashboardSnapshot(); // المفروض تتأجل (مش تتنفذ فورًا)
    return new Promise((resolve) => setTimeout(() => resolve(writes.filter((w) => w.id === '_dashboard').length), 50));
  });
  r.eq('نداءين سريعين متتاليين = كتابة فورية واحدة بس لـ"_dashboard" (مش اتنين)', t4, 1);

  r.ok('لا يوجد أي خطأ JS غير متوقع', pageErrors.length === 0);
  if (pageErrors.length) console.log('  Page errors:', pageErrors);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
