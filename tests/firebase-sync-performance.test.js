// ======= اختبار: أداء مزامنة فايربيز (دمج البيانات + تجميع الحفظات السريعة) =======
// المشكلة اللي بيصلحها الاختبار ده مختلفة عن اختبار "التمرير الافتراضي" (المخزن بس) —
// دي شكوى أعم من المستخدم: "البرنامج بيتقّل عمومًا وأنا بعدّل وبحفظ بسرعة، حتى لو
// مش في جدول المخزن، والسهم نفسه بيتحرك ببطء، وزرار الحفظ محتاج ضغطتين تلاتة".
//
// اتكشف سببين حقيقيين في saveToFirebase (مسؤولة عن رفع أي حفظة لأي شاشة في
// البرنامج، مش بس المخزن):
//  ١) دمج البيانات مع النسخة السحابية كان فيه remoteArr.find(...) جوه forEach على
//     localArr — بحث خطي لكل عنصر محلي، يعني O(local.length × remote.length) —
//     مع آلاف الفواتير/المبيعات المتراكمة بمرور الوقت، ده بيبقى عشرات/مئات
//     الملايين من المقارنات على الـmain thread في كل حفظة واحدة. الإصلاح: خريطة
//     (Map) واحدة بالـid، بحث O(1) بدل O(n) — نفس النتيجة، أسرع بمراحل.
//  ٢) saveDB() كانت بتبدأ دورة قراءة+دمج+رفع سحابية كاملة فورًا مع كل حفظة، من
//     غير أي تجميع — فلو المستخدم بيعدّل ويحفظ بسرعة (يفتح صنف، يحفظ، يفتح
//     التاني...) كانت دورات كتير بتتراكب فوق بعض. الإصلاح: تجميع (debounce)
//     الحفظات السريعة المتتالية في نداء مزامنة سحابية واحد بس بعد فترة هدوء قصيرة.
//
// الاختبار ده بيتحقق فعليًا (مش افتراضًا) من الاتنين: إن الدمج لسه بيرجع نفس
// النتيجة الصحيحة (مين يكسب لما فيه تعارض)، وإنه سريع فعلاً حتى مع آلاف السجلات
// (مقياس أداء صريح، مش بس "بيشتغل")، وإن الحفظات السريعة المتتالية بتتجمّع في
// نداء مزامنة واحد بس مش نداء لكل حفظة.
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('firebase-sync-performance');
  const { browser, page, pageErrors } = await openApp();

  // ===== ١) دمج البيانات: صحة النتيجة + سرعة فعلية مع آلاف السجلات =====
  const N = 15000;
  const merge = await page.evaluate(async (N) => {
    CURRENT_USER = { role: 'admin', name: 'Test Admin' };
    // بيانات محلية: N فاتورة، كل واحدة لها updatedAt واضح
    DB.sales = [];
    for (let i = 0; i < N; i++) {
      DB.sales.push({ id: 'SL-' + i, total: i, updatedAt: 1000 + i });
    }
    const remoteSales = [];
    // ثلث متراكب، نسخة سحابية "أقدم" من المحلية — المفروض المحلي يكسب
    for (let i = 0; i < N / 3; i++) {
      remoteSales.push({ id: 'SL-' + i, total: i * 2, updatedAt: 500 + i });
    }
    // ثلث متراكب تاني، نسخة سحابية "أحدث" من المحلية — المفروض السحابي يكسب
    for (let i = Math.floor(N / 3); i < Math.floor(2 * N / 3); i++) {
      remoteSales.push({ id: 'SL-' + i, total: i * 2, updatedAt: 9000000 + i });
    }
    // ٥٠٠ فاتورة موجودة على السحاب بس (مش عند العميل ده محليًا) — المفروض تتضاف
    for (let i = N; i < N + 500; i++) {
      remoteSales.push({ id: 'SL-' + i, total: i * 2, updatedAt: 1 });
    }
    const remoteStore = { sales: { d: remoteSales, _updatedAt: Date.now() } };
    // نبدّل FS_COL/FS_DOC بستَب بسيط في الذاكرة (بدل شبكة فايربيز حقيقية، اللي
    // ممنوعة في بيئة الاختبار أصلاً) — نفس شكل الاستدعاءات (doc().get()/.set())
    // اللي saveToFirebase/fsReadAll/fsWriteAll فعليًا بتستخدمه
    FS_COL = {
      doc(name) {
        return {
          get() {
            const has = Object.prototype.hasOwnProperty.call(remoteStore, name);
            return Promise.resolve({ exists: has, data: () => remoteStore[name] });
          },
          set(val) { remoteStore[name] = val; return Promise.resolve(); },
          delete() { delete remoteStore[name]; return Promise.resolve(); },
        };
      },
    };
    FS_DOC = FS_COL.doc('main');
    window._fbReady = Promise.resolve(null);

    const t0 = performance.now();
    await saveToFirebase(DB);
    const t1 = performance.now();

    const byId = {};
    DB.sales.forEach(s => { byId[s.id] = s; });
    return {
      ms: t1 - t0,
      totalLen: DB.sales.length,
      localWinsSample: byId['SL-100'], // متوقع: total=100 (المحلي كسب لأنه أحدث)
      remoteWinsSample: byId['SL-' + Math.floor(N / 2)], // متوقع: total = (N/2)*2 (السحابي كسب)
      remoteOnlySample: byId['SL-' + (N + 10)], // متوقع: موجود، total=(N+10)*2
    };
  }, N);

  r.ok(
    'الدمج (قراءة+دمج+رفع) لـ' + N + ' سجل خلص في وقت معقول (أقل من ثانيتين) — لو كان لسه فيه بحث O(n²) القديم كان هياخد عشرات الثواني على الأقل',
    merge.ms < 2000
  );
  console.log('  ⏱ زمن الدمج الفعلي: ' + Math.round(merge.ms) + ' مللي ثانية');
  r.eq('إجمالي السجلات بعد الدمج = ' + (N + 500) + ' (كل المحلي + الإضافات السحابية الجديدة، من غير تكرار)', merge.totalLen, N + 500);
  r.eq('تعارض والمحلي أحدث: المحلي كسب فعليًا (SL-100 → total=100)', merge.localWinsSample && merge.localWinsSample.total, 100);
  r.eq('تعارض والسحابي أحدث: السحابي كسب فعليًا (SL-' + Math.floor(N / 2) + ' → total=' + (Math.floor(N / 2) * 2) + ')', merge.remoteWinsSample && merge.remoteWinsSample.total, Math.floor(N / 2) * 2);
  r.ok('سجل موجود على السحاب بس اتضاف فعليًا للنتيجة النهائية', !!merge.remoteOnlySample && merge.remoteOnlySample.total === (N + 10) * 2);

  // ===== ٢) الحفظات السريعة المتتالية بتتجمّع في نداء مزامنة سحابية واحد =====
  const debounce = await page.evaluate(async () => {
    window.__fbCallCount = 0;
    saveToFirebase = function () { window.__fbCallCount++; return Promise.resolve(); };
    clearTimeout(_fbSyncTimer);
    _fbSyncInFlight = false;
    _fbSyncPendingAgain = false;
    if (!DB.products || !DB.products.length) DB.products = [{ id: 'P-1', name: 'صنف', qty: 1 }];
    // نحاكي مستخدم بيعدّل ويحفظ ١٠ مرات ورا بعض بسرعة (زي ما لو كان بيقلّب في
    // عشرة أصناف مختلفة ويحفظ بعد كل واحد)
    for (let i = 0; i < 10; i++) {
      DB.products[0].name = 'صنف ' + i;
      saveDB();
    }
    return true;
  });
  r.ok('تجهيز محاكاة ١٠ حفظات سريعة متتالية نجح', debounce === true);
  await page.waitForTimeout(1200); // أكتر من فترة التجميع (٧٠٠ مللي ثانية) بهامش أمان
  const countAfterBurst = await page.evaluate(() => window.__fbCallCount);
  r.eq('١٠ حفظات سريعة متتالية عملت نداء مزامنة سحابية واحد بس (مش ١٠)', countAfterBurst, 1);

  // بعد ما الموضوع يهدأ، حفظة جديدة منفصلة المفروض تعمل نداء تاني طبيعي (مش
  // متجمّدة للأبد بسبب التجميع)
  await page.evaluate(() => { DB.products[0].name = 'صنف أخير'; saveDB(); });
  await page.waitForTimeout(1200);
  const countAfterNewSave = await page.evaluate(() => window.__fbCallCount);
  r.eq('حفظة جديدة بعد فترة هدوء عملت نداء مزامنة تاني (النظام مش واقف)', countAfterNewSave, 2);

  // ===== ٣) مفيش أي خطأ JS غير متوقع طول الاختبار =====
  r.ok('لا يوجد أي خطأ JS غير متوقع أثناء تشغيل الاختبار', pageErrors.length === 0);
  if (pageErrors.length) console.log('  pageErrors:', pageErrors);

  await browser.close();
  process.exit(r.close() ? 0 : 1);
})();
