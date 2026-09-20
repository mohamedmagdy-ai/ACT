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
      deferredBadge: document.getElementById('deferred-badge').textContent,
      waBadge: document.getElementById('wa-badge').textContent,
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
  r.eq('عداد الفواتير الآجلة = 1', t4.deferredBadge, '1');
  r.eq('عداد واتساب المعلّق = 2', t4.waBadge, '2');

  // ===== ٥) لا يوجد صنف تحت الحد = رسالة "المخزون تمام" بدل جدول فاضي =====
  const t5 = await page.evaluate(() => {
    render({ shopName: 'محل الاختبار', todaySales: {}, lowStockCount: 0, lowStockItems: [], deferredCount: 0, pendingWhatsappCount: 0 });
    return {
      lowStockHtml: document.getElementById('lowstock-list').innerHTML,
      deferredHtml: document.getElementById('deferred-box').innerHTML,
      waHtml: document.getElementById('wa-box').innerHTML,
    };
  });
  r.ok('مفيش نواقص = رسالة "المخزون تمام"', t5.lowStockHtml.includes('تمام'));
  r.ok('مفيش فواتير آجلة = رسالة إيجابية', t5.deferredHtml.includes('✅'));
  r.ok('مفيش واتساب معلّق = رسالة إيجابية', t5.waHtml.includes('✅'));

  // ===== ٦) esc() بتمنع XSS من اسم صنف خبيث =====
  const t6 = await page.evaluate(() => {
    render({ shopName: 'محل', todaySales: {}, lowStockCount: 1, lowStockItems: [{ name: '<img src=x onerror=alert(1)>', qty: 1, alert: 1 }] });
    return document.getElementById('lowstock-list').innerHTML;
  });
  r.ok('اسم صنف فيه HTML خبيث بيتعرض كنص عادي (escaped)، مش كعنصر HTML فعلي', !t6.includes('<img') && t6.includes('&lt;img'));

  r.ok('لا يوجد أي خطأ JS غير متوقع', pageErrors.length === 0);
  if (pageErrors.length) console.log('  Page errors:', pageErrors);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
