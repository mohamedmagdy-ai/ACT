// ======= اختبار: صفحة "لوحة متابعة المحل" على الموبايل (mobile-dashboard/index.html) =======
// اختبار دخان (smoke test) بسيط بيتأكد إن الصفحة بتفتح صح، شاشة الإعداد الأولى شغالة،
// وإن دالة render() (اللي بترسم البيانات الجاية من Firestore) بتتعامل صح مع بيانات
// حقيقية ومع حالة "لسه مفيش بيانات" — من غير ما نحتاج اتصال Firebase حقيقي (مينفعش
// جوه بيئة الاختبار، ومش هدف الاختبار أصلاً؛ الهدف إن الصفحة نفسها بنيت صح).
const { chromium } = require('playwright');
const path = require('path');
const { TestReporter } = require('./helpers');

// الصفحة بتستخدم toLocaleString('ar-EG') زي برنامج سطح المكتب بالظبط — يعني الأرقام
// بتتعرض بالأرقام الهندية العربية (٣٠٠٫٠٠ مش 300.00). نرجّعها لأرقام عادية هنا عشان
// نقارنها بسهولة في الاختبار، من غير ما نغيّر شكل العرض الحقيقي في الصفحة نفسها.
function normDigits(s) {
  const map = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '٫': '.', ',': '', '٬': '' };
  return String(s).replace(/[٠-٩٫,٬]/g, (c) => (map[c] !== undefined ? map[c] : c));
}

(async () => {
  const r = new TestReporter('mobile-dashboard');
  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    const fs = require('fs');
    const fallback = process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium')
      : '/opt/pw-browsers/chromium';
    if (fs.existsSync(fallback)) browser = await chromium.launch({ executablePath: fallback });
    else throw e;
  }
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  // بنمنع أي اتصال شبكة خارجي (سكريبتات Firebase من gstatic، خطوط Google) — الاختبار
  // ده بيفحص منطق الرندر جوه الصفحة نفسها بس (دالة render())، مش اتصال Firebase حقيقي
  // (ده مينفعش جوه بيئة الاختبار المعزولة، ومش هدف الاختبار أصلاً). فشل تحميل سكريبت
  // <script src> لوحده مبيوقفش تنفيذ باقي السكريبتات العادية في الصفحة.
  await page.route('**/*', (route) => {
    if (route.request().url().startsWith('file://')) route.continue();
    else route.abort();
  });
  const filePath = 'file://' + path.resolve(__dirname, '..', 'mobile-dashboard', 'index.html');
  await page.goto(filePath);
  await page.waitForTimeout(300);

  // ===== ١) أول فتح (من غير إعداد محفوظ) = شاشة الإعداد ظاهرة =====
  const t1 = await page.evaluate(() => ({
    setupVisible: !document.getElementById('setup-screen').hidden,
    dashHidden: document.getElementById('dash-screen').hidden,
  }));
  r.ok('أول فتح للصفحة: شاشة الإعداد ظاهرة', t1.setupVisible);
  r.ok('شاشة الداشبورد مخفية لحد ما يتم الإعداد', t1.dashHidden);

  // ===== ٢) فورم الإعداد فيه كل الحقول المطلوبة =====
  const t2 = await page.evaluate(() => {
    const ids = ['in-apiKey', 'in-projectId', 'in-authDomain', 'in-storageBucket', 'in-messagingSenderId', 'in-appId', 'in-email', 'in-pass'];
    return ids.every((id) => !!document.getElementById(id));
  });
  r.ok('كل حقول إعداد الاتصال موجودة', t2);

  // ===== ٣) الضغط على "حفظ والدخول" من غير ملء الحقول = رسالة خطأ واضحة، من غير تعطل =====
  const t3 = await page.evaluate(() => {
    document.getElementById('setup-save-btn').click();
    const box = document.getElementById('setup-err');
    return { visible: !box.hidden, text: box.textContent };
  });
  r.ok('محاولة الحفظ من غير بيانات = رسالة تنبيه واضحة', t3.visible && t3.text.includes('املا'));

  // ===== ٣.أ) إصلاح باج فعلي حصل مع المستخدم: لو مكتبة Firebase ما اتحمّلتش (زي لما
  // الصفحة بتتفتح جوه تطبيق تاني بدل المتصفح نفسه)، الشاشة كانت بتفضل "بيتم الاتصال..."
  // للأبد من غير أي رسالة. هنا في بيئة الاختبار السكريبتات الخارجية (gstatic.com) ممنوعة
  // فعليًا (page.route بيرفض أي حاجة مش file://)، يعني firebase فعلاً undefined — بنتأكد
  // إن الصفحة بتكتشف ده فورًا وتوري رسالة خطأ واضحة بدل ما تفضل عالقة على شاشة التحميل =====
  const t3b = await page.evaluate(() => {
    document.getElementById('in-apiKey').value = 'dummy-key';
    document.getElementById('in-projectId').value = 'dummy-project';
    document.getElementById('in-authDomain').value = 'dummy.firebaseapp.com';
    document.getElementById('in-storageBucket').value = 'dummy.appspot.com';
    document.getElementById('in-messagingSenderId').value = '123';
    document.getElementById('in-appId').value = '1:123:web:abc';
    document.getElementById('in-email').value = 'owner@example.com';
    document.getElementById('in-pass').value = 'password123';
    document.getElementById('setup-save-btn').click();
    return new Promise((resolve) => setTimeout(() => {
      resolve({
        stuckOnLoading: !document.getElementById('loading-screen').hidden,
        errVisible: !document.getElementById('setup-err').hidden,
        errText: document.getElementById('setup-err').textContent,
      });
    }, 300));
  });
  r.ok('مكتبة Firebase مش محمّلة = مش فاضل واقف على شاشة "بيتم الاتصال" للأبد', !t3b.stuckOnLoading);
  r.ok('بدل الشاشة العالقة، ظهرت رسالة خطأ واضحة تشرح المشكلة', t3b.errVisible && (t3b.errText.includes('Firebase') || t3b.errText.includes('مكتبة')));

  // ===== ٤) دالة render() بترسم بيانات صحيحة صح (بمعزل عن أي اتصال Firebase حقيقي) =====
  const t4 = await page.evaluate(() => {
    render({
      shopName: 'محل الاختبار',
      updatedAt: Date.now(),
      todaySales: { cash: 300, visa: 150, credit: 500, count: 3 },
      monthSalesTotal: 9000,
      cashNow: 4200,
      lowStockCount: 1,
      lowStockItems: [{ name: 'صنف منخفض', qty: 2, alert: 5 }],
      deferredTotal: 500,
      deferredCount: 1,
      pendingWhatsappCount: 2,
      receivables: { total: 500, count: 1, items: [{ id: 'S-3', party: 'عميل ٣', remain: 500 }] },
      payables: { total: 400, count: 1, items: [{ id: 'PUR-1', party: 'مورد ١', remain: 400 }] },
      monthReport: { revenue: 9000, cost: 4000, profit: 5000, purchases: 1000, expenses: 1300, debtToMe: 500, debtOnMe: 400, liquidityNet: 3200 },
      expensesMonth: { total: 1300, byType: [{ type: 'إيجار', amount: 1000 }, { type: 'كهرباء وماء', amount: 300 }] },
      withdrawalsMonth: { total: 200, recent: [{ date: '2026-09-01', partner: 'الشريك أ', amount: 200, type: 'سحب' }] },
      hr: { employeesCount: 2, activeCount: 1, monthlySalariesTotal: 3000, pendingUnpaidLeaves: 1 },
      treasury: { cash: 4200, instapay: 250, visa: 150, bankTransfer: 0, check: 0 },
      recentSales: [{ id: 'S-1', customer: 'عميل ١', total: 300, date: '2026-09-01', payment: 'كاش', status: '' }],
      recentMaintenance: [{ id: 'M-1', customer: 'عميل ٢', device: 'جهاز', cost: 250, date: '2026-09-01', status: 'pending', exit: 'normal' }],
      recentMaintInvoices: [{ id: 'MI-1', customer: 'عميل ٣', device: 'جهاز', cost: 400, date: '2026-09-01' }],
      recentWorkOrders: [{ id: 'WO-1', customer: 'عميل ٤', device: 'جهاز', total: 500, date: '2026-09-01', status: 'pending', exit: 'normal' }],
      recentReceipts: [{ id: 'RCPT-1', customer: 'عميل ٥', device: 'جهاز', date: '2026-09-01', status: 'pending' }],
      serviceCenters: { count: 1, top: [{ name: 'مركز الدلتا', debt: 600 }] },
      bestSellers: [{ name: 'صنف منخفض', qty: 2, val: 200 }],
      stagnant: [{ name: 'صنف راكد', stock: 10, capital: 500, ago: 90 }],
    });
    return {
      shopName: document.getElementById('dash-shop-name').textContent,
      heroTotal: document.getElementById('hero-total').textContent,
      cash: document.getElementById('v-cash').textContent,
      visa: document.getElementById('v-visa').textContent,
      credit: document.getElementById('v-credit').textContent,
      count: document.getElementById('v-count').textContent,
      cashNow: document.getElementById('v-cashnow').textContent,
      lowStockBadge: document.getElementById('lowstock-badge').textContent,
      lowStockHtml: document.getElementById('lowstock-list').innerHTML,
      receivablesBadge: document.getElementById('receivables-badge').textContent,
      receivablesHtml: document.getElementById('receivables-box').innerHTML,
      payablesBadge: document.getElementById('payables-badge').textContent,
      payablesHtml: document.getElementById('payables-box').innerHTML,
      waBadge: document.getElementById('wa-badge').textContent,
      rpProfit: document.getElementById('rp-profit').textContent,
      rpRevenue: document.getElementById('rp-revenue').textContent,
      rpDebtOnMe: document.getElementById('rp-debt-on-me').textContent,
      expBadge: document.getElementById('exp-badge').textContent,
      expHtml: document.getElementById('exp-list').innerHTML,
      wdBadge: document.getElementById('wd-badge').textContent,
      wdHtml: document.getElementById('wd-list').innerHTML,
      hrCount: document.getElementById('hr-count').textContent,
      hrActive: document.getElementById('hr-active').textContent,
      hrSalaries: document.getElementById('hr-salaries').textContent,
      hrLeavesHtml: document.getElementById('hr-leaves-box').innerHTML,
      trCash: document.getElementById('tr-cash').textContent,
      trInstapay: document.getElementById('tr-instapay').textContent,
      trVisa: document.getElementById('tr-visa').textContent,
      salesHtml: document.getElementById('sales-list').innerHTML,
      maintHtml: document.getElementById('maint-list').innerHTML,
      maintInvHtml: document.getElementById('maintinv-list').innerHTML,
      woHtml: document.getElementById('wo-list').innerHTML,
      rcptHtml: document.getElementById('rcpt-list').innerHTML,
      svcBadge: document.getElementById('svc-badge').textContent,
      svcHtml: document.getElementById('svc-list').innerHTML,
      bestHtml: document.getElementById('best-list').innerHTML,
      stagnantHtml: document.getElementById('stagnant-list').innerHTML,
      mtCashnow: document.getElementById('mt-cashnow').textContent,
      mtProfit: document.getElementById('mt-profit').textContent,
      mtRcvBadge: document.getElementById('mt-rcv-badge').textContent,
      mtRcvTotal: document.getElementById('mt-rcv-total').textContent,
      mtPayBadge: document.getElementById('mt-pay-badge').textContent,
      mtPayTotal: document.getElementById('mt-pay-total').textContent,
      mtMaintBadge: document.getElementById('mt-maint-badge').textContent,
      mtLowstockBadge: document.getElementById('mt-lowstock-badge').textContent,
      mtSvcBadge: document.getElementById('mt-svc-badge').textContent,
      mtFinanceTotal: document.getElementById('mt-finance-total').textContent,
      mtHrCount: document.getElementById('mt-hr-count').textContent,
      mtWaBadge: document.getElementById('mt-wa-badge').textContent,
    };
  });
  r.eq('اسم المحل اترسم صح', t4.shopName, 'محل الاختبار');
  r.eq('إجمالي مبيعات النهارده = 950.00 (300+150+500)', normDigits(t4.heroTotal), '950.00');
  r.eq('كاش ظاهر صح', normDigits(t4.cash), '300.00');
  r.eq('فيزا ظاهرة صح', normDigits(t4.visa), '150.00');
  r.eq('آجل ظاهر صح', normDigits(t4.credit), '500.00');
  r.eq('عدد الفواتير = 3', t4.count, '3');
  r.eq('الخزنة الحالية ظاهرة صح', normDigits(t4.cashNow), '4200.00');
  r.eq('عداد النواقص = 1', t4.lowStockBadge, '1');
  r.ok('اسم الصنف المنخفض ظاهر في القايمة', t4.lowStockHtml.includes('صنف منخفض'));
  r.eq('عداد مستحق ليا = 1', t4.receivablesBadge, '1');
  r.ok('فاتورة المستحق ليا ظاهرة في القايمة', t4.receivablesHtml.includes('عميل ٣') && t4.receivablesHtml.includes('S-3'));
  r.eq('عداد مستحق عليا = 1', t4.payablesBadge, '1');
  r.ok('فاتورة المستحق عليا (المورد) ظاهرة في القايمة كمان', t4.payablesHtml.includes('مورد ١') && t4.payablesHtml.includes('PUR-1'));
  r.eq('عداد واتساب المعلّق = 2', t4.waBadge, '2');
  // === التقرير الشامل / المصروفات / المسحوبات / HR — الميزات الجديدة اللي طلبها المستخدم ===
  r.eq('صافي الربح في التقرير الشامل ظاهر صح', normDigits(t4.rpProfit), '5000.00 ج');
  r.eq('إجمالي الإيراد ظاهر صح', normDigits(t4.rpRevenue), '9000.00 ج');
  r.eq('مستحق عليا (موردين) ظاهر صح', normDigits(t4.rpDebtOnMe), '400.00 ج');
  r.eq('عداد مصروفات الشهر = 1300.00', normDigits(t4.expBadge), '1300.00');
  r.ok('أكبر بند مصروف (إيجار) ظاهر في القايمة', t4.expHtml.includes('إيجار'));
  r.eq('عداد مسحوبات الشهر = 200.00', normDigits(t4.wdBadge), '200.00');
  r.ok('حركة السحب الأخيرة ظاهرة في القايمة', t4.wdHtml.includes('الشريك أ'));
  r.eq('عدد الموظفين = 2', t4.hrCount, '2');
  r.eq('عدد الموظفين النشطين = 1', t4.hrActive, '1');
  r.eq('إجمالي رواتب الشهر ظاهر صح', normDigits(t4.hrSalaries), '3000.00');
  r.ok('عدد الإجازات بدون أجر المعلّقة ظاهر', t4.hrLeavesHtml.includes('1'));
  // === تفصيل الخزنة، الكشوف الحديثة، مراكز الخدمة، الأفضل/الراكد — طلب المستخدم بعد تجربة v1.3.11/12 ===
  r.eq('تفصيل الخزنة (كاش) ظاهر صح', normDigits(t4.trCash), '4200.00');
  r.eq('تفصيل الخزنة (انستا باي) ظاهر صح', normDigits(t4.trInstapay), '250.00');
  r.eq('تفصيل الخزنة (فيزا) ظاهر صح', normDigits(t4.trVisa), '150.00');
  r.ok('كشف المبيعات فيه الفاتورة اللي بعتناها', t4.salesHtml.includes('S-1') && t4.salesHtml.includes('عميل ١'));
  r.ok('كشف الصيانة الجارية فيه السجل اللي بعتناه', t4.maintHtml.includes('M-1'));
  r.ok('كشف فواتير الصيانة فيه الفاتورة اللي بعتناها', t4.maintInvHtml.includes('MI-1'));
  r.ok('كشف أوامر الشغل فيه الأمر اللي بعتناه', t4.woHtml.includes('WO-1'));
  r.ok('كشف إذن الاستلام فيه الإذن اللي بعتناه', t4.rcptHtml.includes('RCPT-1'));
  r.eq('عداد مراكز الخدمة = 1', t4.svcBadge, '1');
  r.ok('اسم مركز الخدمة ظاهر في القايمة', t4.svcHtml.includes('مركز الدلتا'));
  r.ok('الصنف الأكثر مبيعًا ظاهر في القايمة', t4.bestHtml.includes('صنف منخفض'));
  r.ok('الصنف الراكد ظاهر في القايمة', t4.stagnantHtml.includes('صنف راكد'));
  // === القيم المصغّرة على زراير الشاشة الرئيسية (نظرة سريعة قبل الدخول للتفاصيل) ===
  r.eq('زرار "الخزنة" بيوري الرصيد الحالي', normDigits(t4.mtCashnow), '4200.00');
  r.eq('زرار "التقرير الشامل" بيوري صافي الربح', normDigits(t4.mtProfit), '5000.00');
  r.eq('زرار "مستحق ليا" بيوري العداد', t4.mtRcvBadge, '1');
  r.eq('زرار "مستحق ليا" بيوري الإجمالي', normDigits(t4.mtRcvTotal), '500.00');
  r.eq('زرار "مستحق عليا" بيوري العداد', t4.mtPayBadge, '1');
  r.eq('زرار "مستحق عليا" بيوري الإجمالي', normDigits(t4.mtPayTotal), '400.00');
  r.eq('زرار "الصيانة" بيوري عدد السجلات الجارية', t4.mtMaintBadge, '1');
  r.eq('زرار "المخزون" بيوري عداد النواقص', t4.mtLowstockBadge, '1');
  r.eq('زرار "مراكز الخدمة" بيوري العداد', t4.mtSvcBadge, '1');
  r.eq('زرار "المصروفات والمسحوبات" بيوري إجمالي المصروفات', normDigits(t4.mtFinanceTotal), '1300.00');
  r.eq('زرار "الموظفين" بيوري العدد', t4.mtHrCount, '2');
  r.eq('زرار "واتساب" بيوري عدد الرسائل المعلّقة', t4.mtWaBadge, '2');

  // ===== ٤.أ) التنقل: الشاشة الرئيسية ↔ شاشات التفاصيل =====
  // الشكل القديم كان كل الكروت متعروضة مرة واحدة في صفحة طويلة — اتغيّر
  // لشاشة رئيسية فيها زراير، كل زرار بيفتح شاشة تفاصيل مستقلة، وزرار
  // "→" بيرجعك تاني للرئيسية.
  const NAV_SCREENS = [
    'screen-treasury', 'screen-report', 'screen-receivables', 'screen-payables',
    'screen-sales', 'screen-maintenance', 'screen-inventory', 'screen-servicecenters',
    'screen-finance', 'screen-hr', 'screen-whatsapp',
  ];
  const t4a = await page.evaluate(() => ({
    homeVisible: !document.getElementById('home-view').hidden,
    allDetailScreensHidden: Array.from(document.querySelectorAll('.detail-screen')).every((s) => s.hidden),
    tileCount: document.querySelectorAll('.menu-tile[data-target]').length,
  }));
  r.ok('الشاشة الرئيسية ظاهرة أول ما تدخل الداشبورد', t4a.homeVisible);
  r.ok('كل شاشات التفاصيل مخفية في البداية', t4a.allDetailScreensHidden);
  r.eq('فيه ١١ زرار قسم في الشاشة الرئيسية', t4a.tileCount, 11);

  for (const screenId of NAV_SCREENS) {
    const nav = await page.evaluate((id) => {
      document.querySelector(`.menu-tile[data-target="${id}"]`).click();
      const afterOpen = { homeHidden: document.getElementById('home-view').hidden, screenVisible: !document.getElementById(id).hidden, topbarHidden: document.getElementById('main-topbar').hidden };
      document.querySelector(`#${id} .back-btn`).click();
      const afterBack = { homeHidden: document.getElementById('home-view').hidden, screenVisible: !document.getElementById(id).hidden, topbarHidden: document.getElementById('main-topbar').hidden };
      return { afterOpen, afterBack };
    }, screenId);
    r.ok(`الدوس على زرار "${screenId}" بيفتح شاشة التفاصيل بتاعته ويخفي الرئيسية`, nav.afterOpen.homeHidden === true && nav.afterOpen.screenVisible === true);
    r.ok(`شاشة التفاصيل "${screenId}" بتخفي الشريط العلوي الرئيسي (بتوري شريطها الخاص بس)`, nav.afterOpen.topbarHidden === true);
    r.ok(`زرار الرجوع من "${screenId}" بيرجّع الشاشة الرئيسية ويخفي شاشة التفاصيل`, nav.afterBack.homeHidden === false && nav.afterBack.screenVisible === false);
    r.ok(`زرار الرجوع من "${screenId}" بيرجّع الشريط العلوي الرئيسي تاني`, nav.afterBack.topbarHidden === false);
  }

  // ===== ٥) لا يوجد صنف تحت الحد = رسالة "المخزون تمام" بدل جدول فاضي (وكذلك حالة عدم وجود مصروفات/مسحوبات/إجازات معلّقة) =====
  const t5 = await page.evaluate(() => {
    render({
      shopName: 'محل الاختبار', todaySales: {}, lowStockCount: 0, lowStockItems: [], deferredCount: 0, pendingWhatsappCount: 0,
      receivables: { total: 0, count: 0, items: [] }, payables: { total: 0, count: 0, items: [] },
      expensesMonth: { total: 0, byType: [] }, withdrawalsMonth: { total: 0, recent: [] }, hr: { employeesCount: 0, activeCount: 0, monthlySalariesTotal: 0, pendingUnpaidLeaves: 0 },
      recentSales: [], recentMaintenance: [], recentMaintInvoices: [], recentWorkOrders: [], recentReceipts: [],
      serviceCenters: { count: 0, top: [] }, bestSellers: [], stagnant: [],
    });
    return {
      lowStockHtml: document.getElementById('lowstock-list').innerHTML,
      receivablesHtml: document.getElementById('receivables-box').innerHTML,
      payablesHtml: document.getElementById('payables-box').innerHTML,
      waHtml: document.getElementById('wa-box').innerHTML,
      expHtml: document.getElementById('exp-list').innerHTML,
      wdHtml: document.getElementById('wd-list').innerHTML,
      hrLeavesHtml: document.getElementById('hr-leaves-box').innerHTML,
      salesHtml: document.getElementById('sales-list').innerHTML,
      maintHtml: document.getElementById('maint-list').innerHTML,
      maintInvHtml: document.getElementById('maintinv-list').innerHTML,
      woHtml: document.getElementById('wo-list').innerHTML,
      rcptHtml: document.getElementById('rcpt-list').innerHTML,
      svcHtml: document.getElementById('svc-list').innerHTML,
      bestHtml: document.getElementById('best-list').innerHTML,
      stagnantHtml: document.getElementById('stagnant-list').innerHTML,
    };
  });
  r.ok('مفيش نواقص = رسالة "المخزون تمام"', t5.lowStockHtml.includes('تمام'));
  r.ok('مفيش مستحق ليا = رسالة إيجابية', t5.receivablesHtml.includes('✅'));
  r.ok('مفيش مستحق عليا = رسالة إيجابية', t5.payablesHtml.includes('✅'));
  r.ok('مفيش واتساب معلّق = رسالة إيجابية', t5.waHtml.includes('✅'));
  r.ok('مفيش مصروفات = رسالة إيجابية', t5.expHtml.includes('✅'));
  r.ok('مفيش مسحوبات = رسالة إيجابية', t5.wdHtml.includes('✅'));
  r.ok('مفيش إجازات بدون أجر معلّقة = رسالة إيجابية', t5.hrLeavesHtml.includes('✅'));
  r.ok('كشف المبيعات فاضي = رسالة واضحة', t5.salesHtml.includes('مفيش'));
  r.ok('كشف الصيانة الجارية فاضي = رسالة واضحة', t5.maintHtml.includes('مفيش'));
  r.ok('كشف فواتير الصيانة فاضي = رسالة واضحة', t5.maintInvHtml.includes('مفيش'));
  r.ok('كشف أوامر الشغل فاضي = رسالة واضحة', t5.woHtml.includes('مفيش'));
  r.ok('كشف إذن الاستلام فاضي = رسالة واضحة', t5.rcptHtml.includes('مفيش'));
  r.ok('مفيش مراكز خدمة عليها مستحق = رسالة إيجابية', t5.svcHtml.includes('✅'));
  r.ok('مفيش مبيعات للأكثر مبيعًا = رسالة واضحة', t5.bestHtml.includes('مفيش'));
  r.ok('مفيش أصناف راكدة = رسالة إيجابية', t5.stagnantHtml.includes('✅'));

  // ===== ٦) esc() بتمنع XSS من اسم صنف خبيث =====
  const t6 = await page.evaluate(() => {
    render({ shopName: 'محل', todaySales: {}, lowStockCount: 1, lowStockItems: [{ name: '<img src=x onerror=alert(1)>', qty: 1, alert: 1 }] });
    return document.getElementById('lowstock-list').innerHTML;
  });
  r.ok('اسم صنف فيه HTML خبيث بيتعرض كنص عادي (escaped)، مش كعنصر HTML فعلي', !t6.includes('<img') && t6.includes('&lt;img'));

  // ===== ٧) PWA: الصفحة مرتبطة بـmanifest.json + مسجّلة service worker (تثبيت حقيقي كتطبيق) =====
  const t7 = await page.evaluate(() => {
    const link = document.querySelector('link[rel="manifest"]');
    return {
      manifestHref: link ? link.getAttribute('href') : null,
      hasIcons192: !!document.querySelector('link[rel="icon"][sizes="192x192"]'),
      hasAppleTouchIcon: !!document.querySelector('link[rel="apple-touch-icon"]'),
      installBtnExistsHidden: document.getElementById('install-btn') ? document.getElementById('install-btn').hidden : null,
    };
  });
  r.eq('الصفحة فيها <link rel="manifest"> بيشاور على manifest.json', t7.manifestHref, 'manifest.json');
  r.ok('أيقونة 192x192 موجودة', t7.hasIcons192);
  r.ok('أيقونة apple-touch-icon موجودة (تثبيت على آيفون)', t7.hasAppleTouchIcon);
  r.ok('زرار "تثبيت كتطبيق" موجود ومخفي افتراضيًا (بيظهر بس لو المتصفح عرض فرصة التثبيت)', t7.installBtnExistsHidden === true);

  // manifest.json نفسه ملف JSON صحيح وفيه كل حقول PWA الأساسية
  const fs = require('fs');
  const manifestPath = path.resolve(__dirname, '..', 'mobile-dashboard', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  r.ok('manifest.json فيه display: standalone (يفتح كتطبيق مستقل من غير شريط المتصفح)', manifest.display === 'standalone');
  r.ok('manifest.json فيه أيقونات 192 و512 (المطلوبة لشاشة "أضف للرئيسية")', manifest.icons.some((i) => i.sizes === '192x192') && manifest.icons.some((i) => i.sizes === '512x512'));
  r.ok('manifest.json فيه أيقونة maskable (تتقص صح على أشكال أيقونات أندرويد المختلفة)', manifest.icons.some((i) => i.purpose === 'maskable'));
  const iconsDir = path.resolve(__dirname, '..', 'mobile-dashboard', 'icons');
  const missingIcons = manifest.icons.filter((i) => !fs.existsSync(path.resolve(path.dirname(manifestPath), i.src)));
  r.ok('كل ملفات الأيقونات المذكورة في manifest.json موجودة فعليًا', missingIcons.length === 0);
  const swPath = path.resolve(__dirname, '..', 'mobile-dashboard', 'sw.js');
  r.ok('ملف sw.js (service worker) موجود', fs.existsSync(swPath));

  r.ok('لا يوجد أي خطأ JS غير متوقع', pageErrors.length === 0);
  if (pageErrors.length) console.log('  Page errors:', pageErrors);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
