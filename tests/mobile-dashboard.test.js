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
  // سكريبتات Firebase الحقيقية اتمنعت (فوق) — الكود بيستخدم firebase.firestore.FieldValue.arrayUnion
  // في طلبات لوحة الإدارة الإضافية (حسابات/فروع/شركاء/عدادات)، فبنحط بديل بسيط بس عشان الاختبارات
  // تقدر تتحقق من مسار النجاح الكامل، من غير ما تحتاج اتصال Firebase حقيقي
  await page.evaluate(() => {
    window.firebase = window.firebase || {};
    firebase.firestore = firebase.firestore || {};
    firebase.firestore.FieldValue = { arrayUnion: (...args) => ({ __arrayUnion: args }) };
  });

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
      recentMaintInvoices: [{ id: 'MI-1', customer: 'عميل ٣', device: 'جهاز', cost: 400, date: '2026-09-01' }],
      recentWorkOrders: [
        { id: 'WO-1', customer: 'عميل ٤', device: 'جهاز', total: 500, date: '2026-09-01', status: 'open', exit: 'normal' },
        { id: 'WO-2', customer: 'عميل ٦', device: 'جهاز', total: 300, date: '2026-09-02', status: 'done', exit: 'normal' },
      ],
      recentReceipts: [
        { id: 'RCPT-1', customer: 'عميل ٥', device: 'جهاز', date: '2026-09-01', status: 'open' },
        { id: 'RCPT-2', customer: 'عميل ٧', device: 'جهاز', date: '2026-09-02', status: 'done' },
      ],
      openWorkOrders: [{ id: 'WO-1', customer: 'عميل ٤', device: 'جهاز', total: 500, date: '2026-09-01', status: 'open' }],
      openReceipts: [{ id: 'RCPT-1', customer: 'عميل ٥', device: 'جهاز', date: '2026-09-01', status: 'open' }],
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
      maintInvHtml: document.getElementById('maintinv-list').innerHTML,
      maintinvBadge: document.getElementById('maintinv-badge').textContent,
      woHtml: document.getElementById('wo-list').innerHTML,
      woBadge: document.getElementById('wo-badge').textContent,
      woOpenHtml: document.getElementById('wo-open-list').innerHTML,
      woOpenBadge: document.getElementById('wo-open-badge').textContent,
      rcptHtml: document.getElementById('rcpt-list').innerHTML,
      rcptBadge: document.getElementById('rcpt-badge').textContent,
      rcptOpenHtml: document.getElementById('rcpt-open-list').innerHTML,
      rcptOpenBadge: document.getElementById('rcpt-open-badge').textContent,
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
      mt2MaintinvCount: document.getElementById('mt2-maintinv-count').textContent,
      mt2WoCount: document.getElementById('mt2-wo-count').textContent,
      mt2WoOpenBadge: document.getElementById('mt2-wo-open-badge').textContent,
      mt2RcptCount: document.getElementById('mt2-rcpt-count').textContent,
      mt2RcptOpenBadge: document.getElementById('mt2-rcpt-open-badge').textContent,
      mt2LowstockBadge: document.getElementById('mt2-lowstock-badge').textContent,
      mt2ExpTotal: document.getElementById('mt2-exp-total').textContent,
      mt2WdTotal: document.getElementById('mt2-wd-total').textContent,
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
  r.ok('كشف فواتير الصيانة فيه الفاتورة اللي بعتناها', t4.maintInvHtml.includes('MI-1'));
  r.eq('عداد فواتير الصيانة = 1', t4.maintinvBadge, '1');
  r.ok('كشف كل أوامر الشغل (الشهر) فيه الاتنين', t4.woHtml.includes('WO-1') && t4.woHtml.includes('WO-2'));
  r.eq('عداد كل أوامر الشغل (الشهر) = 2', t4.woBadge, '2');
  r.ok('كشف "أوامر الشغل المفتوحة دلوقتي" فيه WO-1 بس (مش WO-2 المنتهي)', t4.woOpenHtml.includes('WO-1') && !t4.woOpenHtml.includes('WO-2'));
  r.eq('عداد أوامر الشغل المفتوحة = 1', t4.woOpenBadge, '1');
  r.ok('كشف كل إذونات الاستلام (الشهر) فيه الاتنين', t4.rcptHtml.includes('RCPT-1') && t4.rcptHtml.includes('RCPT-2'));
  r.eq('عداد كل إذونات الاستلام (الشهر) = 2', t4.rcptBadge, '2');
  r.ok('كشف "إذونات الاستلام المفتوحة دلوقتي" فيه RCPT-1 بس (مش RCPT-2 المُسلّم)', t4.rcptOpenHtml.includes('RCPT-1') && !t4.rcptOpenHtml.includes('RCPT-2'));
  r.eq('عداد إذونات الاستلام المفتوحة = 1', t4.rcptOpenBadge, '1');
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
  r.eq('زرار "الصيانة" بيوري عدد المفتوح دلوقتي (أوامر شغل + إذونات استلام)', t4.mtMaintBadge, '2');
  r.eq('زرار "المخزون" بيوري عداد النواقص', t4.mtLowstockBadge, '1');
  r.eq('زرار "مراكز الخدمة" بيوري العداد', t4.mtSvcBadge, '1');
  r.eq('زرار "المصروفات والمسحوبات" بيوري إجمالي المصروفات', normDigits(t4.mtFinanceTotal), '1300.00');
  r.eq('زرار "الموظفين" بيوري العدد', t4.mtHrCount, '2');
  r.eq('زرار "واتساب" بيوري عدد الرسائل المعلّقة', t4.mtWaBadge, '2');
  // === زراير القوائم الفرعية (جوه شاشات الصيانة/المخزون/المصروفات) — طلب المستخدم إن
  // فواتير الصيانة/أوامر الشغل/إذن الاستلام تبقى اختيارات منفصلة تتفتح لوحدها ===
  r.eq('زرار "فواتير الصيانة" الفرعي بيوري عدد فواتير الشهر', t4.mt2MaintinvCount, '1');
  r.eq('زرار "أوامر الشغل" الفرعي بيوري عدد أوامر الشهر', t4.mt2WoCount, '2');
  r.eq('زرار "أوامر الشغل" الفرعي بيوري عداد المفتوح', t4.mt2WoOpenBadge, '1');
  r.eq('زرار "إذن الاستلام" الفرعي بيوري عدد إذونات الشهر', t4.mt2RcptCount, '2');
  r.eq('زرار "إذن الاستلام" الفرعي بيوري عداد المفتوح', t4.mt2RcptOpenBadge, '1');
  r.eq('زرار "أصناف محتاجة شراء" الفرعي بيوري عداد النواقص', t4.mt2LowstockBadge, '1');
  r.eq('زرار "مصروفات الشهر" الفرعي بيوري الإجمالي', normDigits(t4.mt2ExpTotal), '1300.00');
  r.eq('زرار "مسحوباتي" الفرعي بيوري الإجمالي', normDigits(t4.mt2WdTotal), '200.00');

  // ===== ٤.أ) التنقل: الشاشة الرئيسية ↔ شاشات التفاصيل =====
  // الشكل القديم كان كل الكروت متعروضة مرة واحدة في صفحة طويلة — اتغيّر
  // لشاشة رئيسية فيها زراير، كل زرار بيفتح شاشة تفاصيل مستقلة، وزرار
  // "→" بيرجعك تاني للرئيسية.
  const NAV_SCREENS = [
    'screen-treasury', 'screen-report', 'screen-receivables', 'screen-payables',
    'screen-sales', 'screen-maintenance', 'screen-inventory', 'screen-servicecenters',
    'screen-finance', 'screen-hr', 'screen-whatsapp', 'screen-months', 'screen-settings-menu',
  ];
  const t4a = await page.evaluate(() => ({
    homeVisible: !document.getElementById('home-view').hidden,
    allDetailScreensHidden: Array.from(document.querySelectorAll('.detail-screen')).every((s) => s.hidden),
    tileCount: document.querySelectorAll('#home-view .menu-tile[data-target]').length,
  }));
  r.ok('الشاشة الرئيسية ظاهرة أول ما تدخل الداشبورد', t4a.homeVisible);
  r.ok('كل شاشات التفاصيل مخفية في البداية', t4a.allDetailScreensHidden);
  r.eq('فيه ١٣ زرار قسم في الشاشة الرئيسية (حسابات الدخول/الفروع/الشركاء/العدادات/سجل التدقيق/بيانات المحل بقوا كلهم تحت زرار "الإعدادات" واحد بدل ما ياخدوا زرار لوحدهم)', t4a.tileCount, 13);

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

  // ===== ٤.ب) التنقل المتداخل: الصيانة/المخزون/المصروفات بقوا قوائم فرعية بزراير —
  // كل بند (فواتير الصيانة/أوامر الشغل/إذن الاستلام، وهكذا) بقى اختيار مستقل يتفتح
  // لوحده، وزرار الرجوع منه بيرجع لقايمة القسم (مش للرئيسية على طول) — طلب المستخدم =====
  const NESTED_SCREENS = [
    { parent: 'screen-maintenance', children: ['screen-maintinv', 'screen-workorders', 'screen-receipts'] },
    { parent: 'screen-inventory', children: ['screen-lowstock', 'screen-bestsellers', 'screen-stagnant'] },
    { parent: 'screen-finance', children: ['screen-expenses', 'screen-withdrawals'] },
    // "الإعدادات" بقت هي كمان قايمة فرعية (طلب المستخدم: بدل ما كل خاصية إعدادات تاخد
    // زرار لوحدها في الرئيسية، كلهم بقوا اختيارات جوه تبويب "الإعدادات" واحد — نفس فكرة
    // الكمبيوتر) — بس بتستخدم كلاس ".settings-item" بدل ".menu-tile" فالكويري تحت بتدوّر
    // على الاتنين مع بعض.
    { parent: 'screen-settings-menu', children: ['screen-shopsettings', 'screen-accounts', 'screen-mbranches', 'screen-mpartners', 'screen-mcounters', 'screen-mauditlog'] },
  ];
  for (const { parent, children } of NESTED_SCREENS) {
    const subTileCount = await page.evaluate((p) => document.querySelectorAll(`#${p} .menu-tile[data-target], #${p} .settings-item[data-target]`).length, parent);
    r.eq(`شاشة "${parent}" بقت قايمة فرعية فيها ${children.length} اختيار`, subTileCount, children.length);
    for (const childId of children) {
      const nav = await page.evaluate(({ p, c }) => {
        document.querySelector(`.menu-tile[data-target="${p}"], .settings-item[data-target="${p}"]`).click(); // رجّع من الرئيسية لقايمة القسم
        document.querySelector(`.menu-tile[data-target="${c}"], .settings-item[data-target="${c}"]`).click(); // ادخل الاختيار الفرعي
        const afterOpen = { parentHidden: document.getElementById(p).hidden, childVisible: !document.getElementById(c).hidden };
        document.querySelector(`#${c} .back-btn`).click(); // زرار الرجوع من الفرعي
        const afterBack = { parentVisible: !document.getElementById(p).hidden, childHidden: document.getElementById(c).hidden, homeHidden: document.getElementById('home-view').hidden };
        return { afterOpen, afterBack };
      }, { p: parent, c: childId });
      r.ok(`الدوس على اختيار "${childId}" بيفتحه ويخفي قايمة القسم`, nav.afterOpen.parentHidden === true && nav.afterOpen.childVisible === true);
      r.ok(`زرار الرجوع من "${childId}" بيرجع لقايمة القسم "${parent}" (مش للرئيسية على طول)`, nav.afterBack.parentVisible === true && nav.afterBack.childHidden === true && nav.afterBack.homeHidden === true);
    }
    // ارجع للرئيسية تاني عشان الاختبار اللي بعده يبدأ من حالة معروفة
    await page.evaluate((p) => { document.querySelector(`#${p} .back-btn`).click(); }, parent);
  }

  // ===== ٤.ب.١) صف "بيانات الاتصال السحابي" جوه شاشة الإعدادات — ده مش شاشة تفاصيل
  // عادية زي الباقي، ده نفس زرار "⚙" القديم اللي كان في الشريط العلوي (اتشال من هناك
  // وبقى هنا بس) وبيفتح شاشة الإعداد/الاتصال الرئيسية (setup) =====
  const cloudRow = await page.evaluate(() => ({
    exists: !!document.getElementById('settings-row-cloud'),
    oldGearGone: !document.getElementById('settings-btn'),
  }));
  r.ok('صف "بيانات الاتصال السحابي" موجود جوه شاشة الإعدادات', cloudRow.exists);
  r.ok('زرار الترس (⚙) القديم اتشال فعليًا من الشريط العلوي', cloudRow.oldGearGone);

  // ===== ٤.ج) الشهور السابقة: طلب المستخدم "تقرير مختصر عن كل شهر... لو عاوز شهر قبل
  // كدا ادخل اعمل بحث". بنحاكي كائن db (فايرستور) بشهرين عندهم بيانات وشهر تالت من غيرها،
  // ونتأكد إن القايمة بترسم صح وإن الدخول على شهر بيوري تفاصيله =====
  const t4c = await page.evaluate(() => {
    const now = new Date();
    const curMonth = now.toISOString().slice(0, 7);
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = prevDate.toISOString().slice(0, 7);
    const fixtures = {};
    fixtures['_dm_' + curMonth] = {
      month: curMonth,
      summary: { revenue: 5000, cost: 2000, profit: 3000, purchases: 500, expenses: 800, liquidityNet: 2500, salesTotal: 5000, salesCount: 2 },
      sales: [{ id: 'S-1', customer: 'عميل ١', total: 300, date: curMonth + '-05', payment: 'كاش' }],
      maintInvoices: [], workOrders: [], receipts: [],
      expensesByType: [{ type: 'إيجار', amount: 800 }],
      expensesTotal: 800, withdrawalsTotal: 100,
      bestSellers: [{ name: 'صنف تجريبي', qty: 3, val: 300 }],
    };
    fixtures['_dm_' + prevMonth] = {
      month: prevMonth,
      summary: { revenue: 1000, cost: 1500, profit: -500, purchases: 0, expenses: 200, liquidityNet: -200, salesTotal: 1000, salesCount: 1 },
      sales: [], maintInvoices: [], workOrders: [], receipts: [],
      expensesByType: [], expensesTotal: 200, withdrawalsTotal: 0, bestSellers: [],
    };
    db = {
      collection: () => ({
        doc: (id) => ({
          get: () => Promise.resolve(fixtures[id] ? { exists: true, data: () => fixtures[id] } : { exists: false }),
        }),
      }),
    };
    document.getElementById('months-tile').click();
    return new Promise((resolve) => setTimeout(() => {
      const rows = Array.from(document.querySelectorAll('#months-list .month-row')).map((el) => el.getAttribute('data-month'));
      resolve({
        monthsScreenVisible: !document.getElementById('screen-months').hidden,
        loadingHidden: document.getElementById('months-loading').hidden,
        rowCount: rows.length,
        hasCurMonth: rows.includes(curMonth),
        hasPrevMonth: rows.includes(prevMonth),
        curMonth, prevMonth,
        curMonthRowText: document.querySelector(`#months-list .month-row[data-month="${curMonth}"]`).textContent,
      });
    }, 400));
  });
  r.ok('الدوس على "الشهور السابقة" بيفتح شاشتها', t4c.monthsScreenVisible);
  r.ok('مؤشر التحميل بيختفي بعد ما البيانات توصل', t4c.loadingHidden);
  r.eq('القايمة فيها ١٢ شهر بالظبط', t4c.rowCount, 12);
  r.ok('الشهر الحالي موجود في القايمة', t4c.hasCurMonth);
  r.ok('الشهر السابق موجود في القايمة', t4c.hasPrevMonth);
  r.ok('صف الشهر الحالي فيه مبلغ المبيعات (5000)', normDigits(t4c.curMonthRowText).includes('5000.00'));

  const t4d = await page.evaluate((curMonth) => {
    document.querySelector(`#months-list .month-row[data-month="${curMonth}"]`).click();
    return new Promise((resolve) => setTimeout(() => resolve({
      detailVisible: !document.getElementById('screen-month-detail').hidden,
      title: document.getElementById('md-title').textContent,
      profit: document.getElementById('md-profit').textContent,
      salesHtml: document.getElementById('md-sales-list').innerHTML,
      bestHtml: document.getElementById('md-best-list').innerHTML,
      backTarget: document.querySelector('#screen-month-detail .back-btn').getAttribute('data-back'),
    }), 200));
  }, t4c.curMonth);
  r.ok('الدوس على شهر معيّن بيفتح شاشة تفاصيله', t4d.detailVisible);
  r.ok('عنوان الشاشة فيه اسم الشهر', t4d.title.length > 2);
  r.ok('صافي ربح الشهر ظاهر صح', normDigits(t4d.profit).includes('3000'));
  r.ok('فاتورة المبيعات اللي بعتناها ظاهرة', t4d.salesHtml.includes('S-1'));
  r.ok('الصنف الأكثر مبيعًا للشهر ده ظاهر', t4d.bestHtml.includes('صنف تجريبي'));
  r.eq('زرار الرجوع من تفاصيل الشهر بيرجع لقايمة الشهور (مش للرئيسية)', t4d.backTarget, 'screen-months');
  await page.evaluate(() => { document.getElementById('home-view').hidden = true; document.querySelector('#screen-month-detail .back-btn').click(); document.querySelector('#screen-months .back-btn').click(); });

  // شهر مفيهوش بيانات محفوظة أصلاً = رسالة واضحة بدل شاشة فاضية بلا تفسير
  const t4e = await page.evaluate(() => {
    const emptyRow = Array.from(document.querySelectorAll('#months-list .month-row')).find((el) => el.querySelector('.sub') && el.querySelector('.sub').textContent.includes('لسه معندناش'));
    if (!emptyRow) return { skipped: true };
    emptyRow.click();
    return new Promise((resolve) => setTimeout(() => resolve({ skipped: false, html: document.getElementById('md-sales-list').innerHTML }), 200));
  });
  if (!t4e.skipped) r.ok('شهر مفيهوش بيانات = رسالة واضحة (مش فاضي بلا تفسير)', t4e.html.includes('لسه معندناش'));

  // ===== ٤.د) إعدادات المحل من الموبايل: قراءة القيم الحالية وتعديلها وحفظها =====
  const t4f = await page.evaluate(() => {
    document.getElementById('home-view').hidden = false;
    document.querySelectorAll('.detail-screen').forEach((s) => { s.hidden = true; });
    const remoteSettings = { name: 'محل من فايرستور', legalName: '', addr: 'عنوان قديم', tel1: '0100', tel2: '', mgrWhatsapp: '', taxRate: 14, crn: '111', taxcard: '222' };
    db = { collection: () => ({ doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => remoteSettings }) }) }) };
    document.getElementById('settings-row-shop').click();
    return new Promise((resolve) => setTimeout(() => resolve({
      screenVisible: !document.getElementById('screen-shopsettings').hidden,
      formVisible: !document.getElementById('ss-form-wrap').hidden,
      name: document.getElementById('ss-name').value,
      addr: document.getElementById('ss-addr').value,
      taxrate: document.getElementById('ss-taxrate').value,
    }), 200));
  });
  r.ok('الدوس على "إعدادات المحل" بيفتح شاشتها', t4f.screenVisible);
  r.ok('الفورم بيظهر بعد ما البيانات توصل', t4f.formVisible);
  r.eq('اسم المحل الحالي اترسم في الحقل', t4f.name, 'محل من فايرستور');
  r.eq('العنوان الحالي اترسم في الحقل', t4f.addr, 'عنوان قديم');
  r.eq('نسبة الضريبة الحالية اترسمت في الحقل', t4f.taxrate, '14');

  const t4g = await page.evaluate(() => {
    const writes = [];
    db = { collection: () => ({ doc: () => ({ set: (data) => { writes.push(data); return Promise.resolve(); } }) }) };
    document.getElementById('ss-name').value = 'اسم جديد من الموبايل';
    document.getElementById('ss-taxrate').value = '15';
    document.getElementById('ss-save-btn').click();
    return new Promise((resolve) => setTimeout(() => resolve({
      writes,
      msgVisible: !document.getElementById('ss-msg').hidden,
      msgText: document.getElementById('ss-msg').textContent,
    }), 100));
  });
  r.eq('كتابة واحدة لمستند الإعدادات لما تحفظ من الموبايل', t4g.writes.length, 1);
  r.eq('الاسم الجديد اتبعت صح في الكتابة', t4g.writes[0].name, 'اسم جديد من الموبايل');
  r.eq('نسبة الضريبة الجديدة اتبعتت صح', t4g.writes[0].taxRate, 15);
  r.ok('فيه بصمة وقت في الكتابة', typeof t4g.writes[0].updatedAt === 'number');
  r.ok('رسالة نجاح الحفظ ظاهرة', t4g.msgVisible && t4g.msgText.includes('تم الحفظ'));
  await page.evaluate(() => { db = null; document.getElementById('home-view').hidden = false; document.querySelectorAll('.detail-screen').forEach((s) => { s.hidden = true; }); });

  // ===== ٤.هـ) حسابات الدخول: عرض الحسابات الحالية وإضافة حساب جديد (كلمة المرور
  // بتتشفّر PBKDF2 على الموبايل نفسه، وبتتبعت كطلب لـ_mobile_admin_write) =====
  const t4h = await page.evaluate(() => {
    const adminSnap = {
      branches: [{ id: 'BR-MAIN', name: 'الفرع الرئيسي', isDefault: true }],
      users: [
        { username: 'admin', name: 'المدير', role: 'admin', perms: { all: true }, branch: 'BR-MAIN' },
        { username: 'cashier1', name: 'كاشير أحمد', role: 'user', perms: { sales: true }, branch: 'BR-MAIN' },
      ],
    };
    db = { collection: () => ({ doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => adminSnap }) }) }) };
    document.getElementById('settings-row-accounts').click();
    return new Promise((resolve) => setTimeout(() => resolve({
      screenVisible: !document.getElementById('screen-accounts').hidden,
      listHtml: document.getElementById('acc-list').innerHTML,
      branchOptions: document.getElementById('acc-branch').innerHTML,
    }), 150));
  });
  r.ok('الدوس على "حسابات الدخول" بيفتح شاشتها', t4h.screenVisible);
  r.ok('الحسابات الحالية اترسمت (المدير والكاشير)', t4h.listHtml.includes('المدير') && t4h.listHtml.includes('كاشير أحمد'));
  r.ok('قايمة الفروع في الفورم اترسمت من البيانات المتزامنة', t4h.branchOptions.includes('الفرع الرئيسي'));

  const t4i = await page.evaluate(() => {
    const writes = [];
    db = { collection: () => ({ doc: () => ({ set: (data, opts) => { writes.push({ data, opts }); return Promise.resolve(); } }) }) };
    document.getElementById('acc-name').value = 'محاسب جديد';
    document.getElementById('acc-user').value = 'newacct';
    document.getElementById('acc-pass').value = 'pass1234';
    document.getElementById('acc-save-btn').click();
    return new Promise((resolve) => setTimeout(() => resolve({
      writes,
      msgText: document.getElementById('acc-msg').textContent,
    }), 250));
  });
  r.eq('كتابة واحدة لمستند طلبات الموبايل لما تضيف حساب', t4i.writes.length, 1);
  r.ok('الطلب فيه merge:true (عشان مايمسحش طلبات تانية)', t4i.writes[0].opts && t4i.writes[0].opts.merge === true);
  r.ok('رسالة نجاح الإضافة ظاهرة', t4i.msgText.includes('اتبعت'));

  const t4j = await page.evaluate(() => {
    // اسم دخول مكرر (admin موجود بالفعل في _mobileAdminCache) لازم يترفض قبل ما يوصل لأي كتابة
    document.getElementById('acc-name').value = 'حد تاني';
    document.getElementById('acc-user').value = 'admin';
    document.getElementById('acc-pass').value = 'pass1234';
    let wrote = false;
    db = { collection: () => ({ doc: () => ({ set: () => { wrote = true; return Promise.resolve(); } }) }) };
    document.getElementById('acc-save-btn').click();
    return { msgText: document.getElementById('acc-msg').textContent, wrote };
  });
  r.ok('اسم دخول مكرر بيترفض من غير ما يوصل لأي كتابة', t4j.msgText.includes('مستخدم بالفعل') && t4j.wrote === false);

  const t4k = await page.evaluate(async () => {
    const h = await hashPassMobile('secret123');
    return { h };
  });
  r.ok('كلمة المرور بتتشفّر بنفس صيغة الكمبيوتر (pbkdf2:10000$salt$hash)', /^pbkdf2:10000\$[0-9a-f]{32}\$[0-9a-f]{64}$/.test(t4k.h));
  await page.evaluate(() => { db = null; document.getElementById('home-view').hidden = false; document.querySelectorAll('.detail-screen').forEach((s) => { s.hidden = true; }); });

  // ===== ٤.و) الفروع: عرض وإضافة =====
  const t4l = await page.evaluate(() => {
    const adminSnap = { branches: [{ id: 'BR-MAIN', name: 'الفرع الرئيسي', isDefault: true }] };
    db = { collection: () => ({ doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => adminSnap }) }) }) };
    document.getElementById('settings-row-branches').click();
    return new Promise((resolve) => setTimeout(() => resolve({
      screenVisible: !document.getElementById('screen-mbranches').hidden,
      listHtml: document.getElementById('mbr-list').innerHTML,
    }), 150));
  });
  r.ok('الدوس على "الفروع" بيفتح شاشتها', t4l.screenVisible);
  r.ok('الفرع الحالي اترسم', t4l.listHtml.includes('الفرع الرئيسي') && t4l.listHtml.includes('الفرع الافتراضي'));

  const t4m = await page.evaluate(() => {
    const writes = [];
    db = { collection: () => ({ doc: () => ({ set: (data) => { writes.push(data); return Promise.resolve(); } }) }) };
    document.getElementById('mbr-name').value = 'فرع سموحة';
    document.getElementById('mbr-save-btn').click();
    return new Promise((resolve) => setTimeout(() => resolve({ writes, msgText: document.getElementById('mbr-msg').textContent }), 150));
  });
  r.eq('كتابة واحدة لطلب إضافة فرع', t4m.writes.length, 1);
  r.ok('رسالة نجاح إضافة الفرع ظاهرة', t4m.msgText.includes('اتبعت'));
  await page.evaluate(() => { db = null; document.getElementById('home-view').hidden = false; document.querySelectorAll('.detail-screen').forEach((s) => { s.hidden = true; }); });

  // ===== ٤.ز) الشركاء ورأس المال: عرض الأرصدة وسجل المساهمات + تسجيل مساهمة جديدة
  // وضبط رأس المال الأصلي =====
  const t4n = await page.evaluate(() => {
    const adminSnap = {
      partners: {
        shares: [{ name: 'أحمد', balance: 5000, pct: 50 }, { name: 'محمد', balance: 5000, pct: 50 }],
        initial: { 'أحمد': 4000, 'محمد': 4000 },
        injections: [{ partner: 'أحمد', amount: 1000, date: '2026-01-01', notes: 'دفعة أولى' }],
      },
    };
    db = { collection: () => ({ doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => adminSnap }) }) }) };
    document.getElementById('settings-row-partners').click();
    return new Promise((resolve) => setTimeout(() => resolve({
      screenVisible: !document.getElementById('screen-mpartners').hidden,
      balancesHtml: document.getElementById('mpt-balances').innerHTML,
      injectionsHtml: document.getElementById('mpt-injections').innerHTML,
    }), 150));
  });
  r.ok('الدوس على "الشركاء ورأس المال" بيفتح شاشتها', t4n.screenVisible);
  r.ok('أرصدة الشركاء اترسمت (أحمد ومحمد بالنسب)', t4n.balancesHtml.includes('أحمد') && t4n.balancesHtml.includes('محمد') && t4n.balancesHtml.includes('50'));
  r.ok('سجل المساهمات اترسم', t4n.injectionsHtml.includes('أحمد') && t4n.injectionsHtml.includes('دفعة أولى'));

  const t4o = await page.evaluate(() => {
    const writes = [];
    db = { collection: () => ({ doc: () => ({ set: (data) => { writes.push(data); return Promise.resolve(); } }) }) };
    document.getElementById('mpt-inj-partner').value = 'أحمد';
    document.getElementById('mpt-inj-amount').value = '2000';
    document.getElementById('mpt-inj-btn').click();
    return new Promise((resolve) => setTimeout(() => resolve({ writes, msgText: document.getElementById('mpt-msg').textContent }), 150));
  });
  r.eq('كتابة واحدة لطلب مساهمة رأس مال جديدة', t4o.writes.length, 1);
  r.ok('رسالة نجاح تسجيل المساهمة ظاهرة', t4o.msgText.includes('اتبعت'));

  const t4p = await page.evaluate(() => {
    const writes = [];
    db = { collection: () => ({ doc: () => ({ set: (data) => { writes.push(data); return Promise.resolve(); } }) }) };
    document.getElementById('mpt-init-partner').value = 'محمد';
    document.getElementById('mpt-init-amount').value = '4500';
    document.getElementById('mpt-init-btn').click();
    return new Promise((resolve) => setTimeout(() => resolve({ writes, msgText: document.getElementById('mpt-msg').textContent }), 150));
  });
  r.eq('كتابة واحدة لطلب ضبط رأس المال الأصلي', t4p.writes.length, 1);
  r.ok('رسالة نجاح ضبط رأس المال الأصلي ظاهرة', t4p.msgText.includes('اتبعت'));
  await page.evaluate(() => { db = null; document.getElementById('home-view').hidden = false; document.querySelectorAll('.detail-screen').forEach((s) => { s.hidden = true; }); });

  // ===== ٤.ح) العدادات: عرض القيم الحالية وتحديث عداد واحد =====
  const t4q = await page.evaluate(() => {
    const adminSnap = { counters: { rcpt: 5, sinv: 10, minv: 1, wo: 3, tsinv: 1, tminv: 1 } };
    db = { collection: () => ({ doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => adminSnap }) }) }) };
    document.getElementById('settings-row-counters').click();
    return new Promise((resolve) => setTimeout(() => resolve({
      screenVisible: !document.getElementById('screen-mcounters').hidden,
      sinvVal: document.getElementById('mct-in-sinv') ? document.getElementById('mct-in-sinv').value : null,
    }), 150));
  });
  r.ok('الدوس على "العدادات" بيفتح شاشتها', t4q.screenVisible);
  r.eq('القيمة الحالية لعداد المبيعات اترسمت صح', t4q.sinvVal, '10');

  const t4r = await page.evaluate(() => {
    const writes = [];
    db = { collection: () => ({ doc: () => ({ set: (data) => { writes.push(data); return Promise.resolve(); } }) }) };
    document.getElementById('mct-in-sinv').value = '25';
    document.querySelector('[data-counter-key="sinv"]').click();
    return new Promise((resolve) => setTimeout(() => resolve({ writes, msgText: document.getElementById('mct-msg').textContent }), 150));
  });
  r.eq('كتابة واحدة لطلب تحديث عداد', t4r.writes.length, 1);
  r.ok('رسالة نجاح تحديث العداد ظاهرة', t4r.msgText.includes('اتبعت'));
  await page.evaluate(() => { db = null; document.getElementById('home-view').hidden = false; document.querySelectorAll('.detail-screen').forEach((s) => { s.hidden = true; }); });

  // ===== ٤.ط) سجل التدقيق: عرض العمليات + فحص سلامة السلسلة (hash chain) محليًا على
  // الموبايل، بنفس خوارزمية الكمبيوتر بالظبط — بنتأكد إن سلسلة سليمة بترجع ok=true
  // وإن سلسلة اتلاعب فيها بترجع ok=false =====
  const t4s = await page.evaluate(() => {
    function buildChain(actions) {
      // مهم: DB.logs الحقيقي بيتبني بـunshift() (الأحدث أول عنصر)، ونفس الترتيب ده
      // بيوصل للموبايل (data.logs في _mobile_admin) — فبنبني هنا بترتيب زمني عادي
      // (الأقدم الأول) وبعدين نعكسه في الآخر، عشان الفيكستشر تطابق شكل البيانات
      // الحقيقي اللي verifyAuditLogIntegrityMobile بيتوقعه فعليًا.
      let prev = 'GENESIS'; const ts0 = 1700000000000; const logs = [];
      actions.forEach((a, i) => {
        const ts = ts0 + i * 1000;
        const hash = _auditHash(prev + '|user1|' + a + '|' + ts);
        logs.push({ id: 'LOG-' + i, chainId: 'TESTCHAIN', user: 'user1', action: a, ts, date: '2026-01-01', time: '10:00', prevHash: prev, hash });
        prev = hash;
      });
      return logs.reverse();
    }
    const goodLogs = buildChain(['فتح البرنامج', 'بيع فاتورة S-1', 'تعديل سعر صنف']);
    const tamperedLogs = JSON.parse(JSON.stringify(goodLogs));
    tamperedLogs[1].action = 'بيع فاتورة S-999 (متلاعب بيها)';
    return {
      goodResult: verifyAuditLogIntegrityMobile(goodLogs),
      tamperedResult: verifyAuditLogIntegrityMobile(tamperedLogs),
      sampleHash: goodLogs[0].hash,
      goodLogs,
    };
  });
  r.ok('سلسلة سليمة: فحص السلامة بيرجع ok=true (٣ عمليات)', t4s.goodResult.ok === true && t4s.goodResult.checked === 3);
  r.ok('سلسلة اتلاعب فيها: فحص السلامة بيكتشفها ويرجع ok=false', t4s.tamperedResult.ok === false);
  r.ok('الهاش بيتحسب فعليًا بنفس خوارزمية sha256Sync', typeof t4s.sampleHash === 'string' && t4s.sampleHash.length === 64);

  const t4t = await page.evaluate((goodLogs) => {
    const adminSnap = { logs: goodLogs };
    db = { collection: () => ({ doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => adminSnap }) }) }) };
    document.getElementById('settings-row-auditlog').click();
    return new Promise((resolve) => setTimeout(() => resolve({
      screenVisible: !document.getElementById('screen-mauditlog').hidden,
      listHtml: document.getElementById('mal-list').innerHTML,
    }), 150));
  }, t4s.goodLogs);
  r.ok('الدوس على "سجل التدقيق" بيفتح شاشتها', t4t.screenVisible);
  r.ok('العمليات المتزامنة اترسمت في القايمة', t4t.listHtml.includes('بيع فاتورة S-1'));

  const t4u = await page.evaluate(() => {
    document.getElementById('mal-check-btn').click();
    return document.getElementById('mal-check-result').innerHTML;
  });
  r.ok('زرار فحص السلامة بيوري نتيجة إيجابية للسجل السليم المتزامن', t4u.includes('مفيش أي تلاعب'));
  await page.evaluate(() => { db = null; document.getElementById('home-view').hidden = false; document.querySelectorAll('.detail-screen').forEach((s) => { s.hidden = true; }); });

  // ===== ٥) لا يوجد صنف تحت الحد = رسالة "المخزون تمام" بدل جدول فاضي (وكذلك حالة عدم وجود مصروفات/مسحوبات/إجازات معلّقة) =====
  const t5 = await page.evaluate(() => {
    render({
      shopName: 'محل الاختبار', todaySales: {}, lowStockCount: 0, lowStockItems: [], deferredCount: 0, pendingWhatsappCount: 0,
      receivables: { total: 0, count: 0, items: [] }, payables: { total: 0, count: 0, items: [] },
      expensesMonth: { total: 0, byType: [] }, withdrawalsMonth: { total: 0, recent: [] }, hr: { employeesCount: 0, activeCount: 0, monthlySalariesTotal: 0, pendingUnpaidLeaves: 0 },
      recentSales: [], recentMaintInvoices: [], recentWorkOrders: [], recentReceipts: [],
      openWorkOrders: [], openReceipts: [],
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
      maintInvHtml: document.getElementById('maintinv-list').innerHTML,
      woHtml: document.getElementById('wo-list').innerHTML,
      woOpenHtml: document.getElementById('wo-open-list').innerHTML,
      rcptHtml: document.getElementById('rcpt-list').innerHTML,
      rcptOpenHtml: document.getElementById('rcpt-open-list').innerHTML,
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
  r.ok('كشف فواتير الصيانة فاضي = رسالة واضحة', t5.maintInvHtml.includes('مفيش'));
  r.ok('كشف كل أوامر الشغل فاضي = رسالة واضحة', t5.woHtml.includes('مفيش'));
  r.ok('كشف أوامر الشغل المفتوحة فاضي = رسالة إيجابية', t5.woOpenHtml.includes('✅'));
  r.ok('كشف كل إذونات الاستلام فاضي = رسالة واضحة', t5.rcptHtml.includes('مفيش'));
  r.ok('كشف إذونات الاستلام المفتوحة فاضي = رسالة إيجابية', t5.rcptOpenHtml.includes('✅'));
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
