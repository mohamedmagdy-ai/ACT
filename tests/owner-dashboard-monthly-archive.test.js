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

  // ===== ٨) لوحة تحكم إدارية إضافية على الموبايل: المستخدمين/الفروع/الشركاء ورأس
  // المال/العدادات/سجل التدقيق. طلب المستخدم "عاوز كل الخصائص دي في الإعدادات" —
  // pushMobileAdminSnapshot() بتبني لقطة للموبايل بيقرأها بس (من غير كلمات مرور) =====
  const t8 = await page.evaluate(() => {
    DB.branches = [{ id: 'BR-MAIN', name: 'الفرع الرئيسي', isDefault: true }];
    DB.logs = [{ id: 'LOG-1', chainId: 'C1', user: 'admin', action: 'تسجيل دخول', ts: Date.now(), date: todayStr, time: '10:00', prevHash: 'GENESIS', hash: 'abc123' }];
    const users = loadUsers();
    users.push({ username: 'tester', password: 'pbkdf2:10000$abc$def', role: 'user', name: 'مستخدم اختبار', perms: { sales: true }, branch: 'BR-MAIN' });
    localStorage.setItem('sz_users', JSON.stringify(users));
    const writes = [];
    FS_COL = { doc: (id) => ({ set: (data) => { writes.push({ id, data }); return Promise.resolve(); }, get: () => Promise.resolve({ exists: false }) }) };
    window._fbReady = Promise.resolve();
    pushMobileAdminSnapshot();
    return new Promise((resolve) => setTimeout(() => resolve(writes), 150));
  });
  r.eq('كتابة واحدة لمستند "_mobile_admin"', t8.length, 1);
  r.eq('اتكتبت في "_mobile_admin" بالظبط', t8[0] && t8[0].id, '_mobile_admin');
  const t8tester = t8[0] && t8[0].data.users.find((u) => u.username === 'tester');
  r.ok('المستخدم الجديد موجود في اللقطة', !!t8tester);
  r.ok('كلمة المرور مش متسربة في لقطة الموبايل', t8tester && t8tester.password === undefined);
  r.ok('الفرع موجود في اللقطة', t8[0] && t8[0].data.branches.some((b) => b.name === 'الفرع الرئيسي'));
  r.ok('سجل التدقيق موجود في اللقطة', t8[0] && t8[0].data.logs.length >= 1);
  r.ok('العدادات موجودة في اللقطة', t8[0] && typeof t8[0].data.counters === 'object');

  // ===== ٩) pullAndApplyMobileAdminRequests() — طلبات جاية من الموبايل (مستخدم جديد/فرع
  // جديد/مساهمة رأس مال/رأس مال أصلي/تحديث عداد) بتتنفّذ فعليًا بنفس دوال الشاشة العادية،
  // وبعدين بتتشال من قايمة الطلبات (منعًا من تنفيذها تاني في الدورة اللي بعدها) =====
  const t9 = await page.evaluate(() => {
    window.firebase = window.firebase || {};
    firebase.firestore = firebase.firestore || {};
    firebase.firestore.FieldValue = firebase.firestore.FieldValue || {};
    firebase.firestore.FieldValue.arrayRemove = (...args) => ({ __arrayRemove: args });

    DB.branches = [{ id: 'BR-MAIN', name: 'الفرع الرئيسي', isDefault: true }];
    localStorage.setItem('sz_users', JSON.stringify([{ username: 'admin', password: 'pbkdf2:x', role: 'admin', name: 'المدير', perms: { all: true }, branch: 'BR-MAIN' }]));
    DB.partnerCapitalInjections = [];
    // ملحوظة مهمة: partnerInitialCapital في الـ DB الحقيقي دايمًا Array (مش Object) — زي
    // partnerCapitalInjections بالظبط. الأول كتبناها {} بالغلط فسبب استثناء غير ملتقط جوه
    // getPartnerInitialCapital()/setPartnerInitialCapitalFor() (بيستخدموا .forEach/.findIndex/
    // .push) وده كان بيخلي الـ Promise بتاعة page.evaluate() متتنفّذش أبدًا (استثناء غير
    // ملتقط جوه setTimeout بيوقف تنفيذ resolve()) → "Resulting promise was garbage collected".
    DB.partnerInitialCapital = [];
    localStorage.removeItem('sz_counters_BR-MAIN');

    const writeDoc = {
      newUsers: [{ id: 'REQ-1', name: 'مستخدم من الموبايل', username: 'mobileuser', passwordHash: 'pbkdf2:10000$saltsalt$hashhash', viewAll: true, editProd: false, branch: 'BR-MAIN', ts: Date.now() }],
      newBranches: [{ id: 'REQ-2', name: 'فرع الموبايل', ts: Date.now() }],
      partnerInjections: [{ id: 'REQ-3', partner: 'سارة', amount: 1500, date: todayStr, notes: 'من الموبايل', ts: Date.now() }],
      initialCapitalSets: [{ id: 'REQ-4', partner: 'سارة', amount: 3000, ts: Date.now() }],
      counterUpdates: [{ id: 'REQ-5', key: 'sinv', value: 50, ts: Date.now() }],
    };
    const updates = [];
    FS_COL = {
      doc: (id) => ({
        get: () => Promise.resolve({ exists: id === '_mobile_admin_write', data: () => writeDoc }),
        update: (data) => { updates.push(data); return Promise.resolve(); },
        set: () => Promise.resolve(),
      }),
    };
    window._fbReady = Promise.resolve();
    pullAndApplyMobileAdminRequests();
    return new Promise((resolve) => setTimeout(() => resolve({
      updates,
      users: loadUsers(),
      branches: DB.branches.slice(),
      injections: (DB.partnerCapitalInjections || []).slice(),
      initialCapital: getPartnerInitialCapital(),
      counters: loadCounters(),
    }), 300));
  });
  r.eq('كتابة واحدة لتنظيف الطلبات المنفّذة', t9.updates.length, 1);
  r.ok('فيه newUsers ضمن الطلبات المتشالة', !!(t9.updates[0] && t9.updates[0].newUsers));
  r.ok('فيه newBranches ضمن الطلبات المتشالة', !!(t9.updates[0] && t9.updates[0].newBranches));
  r.ok('فيه partnerInjections ضمن الطلبات المتشالة', !!(t9.updates[0] && t9.updates[0].partnerInjections));
  r.ok('فيه initialCapitalSets ضمن الطلبات المتشالة', !!(t9.updates[0] && t9.updates[0].initialCapitalSets));
  r.ok('فيه counterUpdates ضمن الطلبات المتشالة', !!(t9.updates[0] && t9.updates[0].counterUpdates));
  r.ok('المستخدم الجديد من الموبايل اتضاف فعليًا', t9.users.some((u) => u.username === 'mobileuser'));
  const t9user = t9.users.find((u) => u.username === 'mobileuser');
  r.eq('كلمة المرور المشفّرة اتخزنت زي ما وصلت (من غير تشفير إضافي على الكمبيوتر)', t9user && t9user.password, 'pbkdf2:10000$saltsalt$hashhash');
  r.eq('صلاحية "عرض الكل" اتطبّقت صح', t9user && t9user.perms && t9user.perms.all, true);
  r.ok('الفرع الجديد من الموبايل اتضاف فعليًا', t9.branches.some((b) => b.name === 'فرع الموبايل'));
  r.ok('مساهمة رأس المال اتسجّلت فعليًا', t9.injections.some((i) => i.partner === 'سارة' && i.amount === 1500));
  r.eq('رأس المال الأصلي اتسجّل صح', t9.initialCapital['سارة'], 3000);
  r.eq('العداد اتحدّث للقيمة الجديدة الجاية من الموبايل', t9.counters.sinv, 50);

  // ===== ١٠) العدادات: قيمة أقل من الحالية بتتجاهل (نفس حماية دمج العدادات بين أي جهازين —
  // مينفعش عداد يرجع لرقم أقل ويسبب تكرار رقم فاتورة) =====
  const t10 = await page.evaluate(() => {
    const writeDoc = { counterUpdates: [{ id: 'REQ-6', key: 'sinv', value: 5, ts: Date.now() }] };
    FS_COL = {
      doc: (id) => ({
        get: () => Promise.resolve({ exists: id === '_mobile_admin_write', data: () => writeDoc }),
        update: () => Promise.resolve(),
        set: () => Promise.resolve(),
      }),
    };
    window._fbReady = Promise.resolve();
    pullAndApplyMobileAdminRequests();
    return new Promise((resolve) => setTimeout(() => resolve(loadCounters()), 300));
  });
  r.eq('قيمة عداد أقل من الحالية (50) اتجاهلت — العداد فضل 50', t10.sinv, 50);

  r.ok('لا يوجد أي خطأ JS غير متوقع', pageErrors.length === 0);
  if (pageErrors.length) console.log('  Page errors:', pageErrors);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
