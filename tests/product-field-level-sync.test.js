// ======= اختبار: تنبيه النواقص (🔔/🔕) وصور المنتج بيتدمجوا بطابعهم الزمني الخاص،
// مش بتوقيت المنتج ككل =======
// المشكلة اللي بلّغ عنها مستخدم حقيقي: كتم تنبيه صنف (🔕) أو رفع صورة جديدة ليه، وبعد
// إقفال وفتح البرنامج لقى التنبيه رجع يشتغل لوحده و/أو الصورة اختفت — خصوصًا للأصناف
// المرتبطة بالمتجر الأونلاين (اللي بتتحدّث كمان من جهاز تاني، زي تنقيص المخزون وقت تأكيد
// طلب أونلاين). السبب: قبل الإصلاح ده، لو جهازين عدّلوا نفس المنتج، السجل كله (مش بس
// الحقل اللي اتغيّر فعليًا) كان بياخد نسخة الجهاز اللي حفظ أحدث توقيتًا — حتى لو التعديل
// ده كان في حقل تاني خالص، وده كان بيمسح بصمت أي تعديل أحدث فعليًا على alert أو الصور
// حصل على جهاز تاني لسه مامزامنش. راجع _mergeProductTimestampedField في app/index.html.
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('product-field-level-sync');
  const { browser, page, pageErrors } = await openApp();

  // ===== ١) الحالة الأساسية: كتمت تنبيه صنف هنا، وجهاز تاني عدّل حاجة تانية (الكمية)
  // بعد كده بتوقيت أحدث للسجل ككل — لازم الكتم يفضل زي ما هو (مايرجعش يشتغل لوحده) =====
  const t1 = await page.evaluate(() => {
    if (typeof CURRENT_USER === 'undefined' || !CURRENT_USER) {
      CURRENT_USER = { username: 'tester', name: 'مستخدم اختبار', role: 'admin' };
    }
    const T0 = 1700000000000;
    DB.products = [{
      id: 'PRD-D700', name: 'صنف مرتبط بالموقع', cat: 'اجهزة', section: 'devices', brand: 'Test',
      buy: 100, sell: 150, qty: 5, qtyByBranch: { 'BR-MAIN': 5 },
      alert: 0, alertUpdatedAt: T0 + 5000, // كتمت التنبيه هنا من لحظة T0+5000 (أحدث حاجة حصلت للصنف ده فعليًا)
      images: ['old.jpg'], imageUrl: 'old.jpg', imagesUpdatedAt: T0,
      onlineVisible: true, updatedAt: T0 + 5000,
    }];
    // جهاز تاني وصله تحديث: نقّص الكمية (بيع أونلاين اتأكد) بتوقيت أحدث للسجل ككل من
    // توقيت الكتم نفسه — بس من غير ما يلمس alert خالص (alertUpdatedAt قديم/مفيش عنده)
    const fakeDoc = {
      exists: true,
      data: () => ({
        _updatedAt: T0 + 9000,
        products: [{
          id: 'PRD-D700', name: 'صنف مرتبط بالموقع', cat: 'اجهزة', section: 'devices', brand: 'Test',
          buy: 100, sell: 150, qty: 3, qtyByBranch: { 'BR-MAIN': 3 }, qtyByBranchUpdatedAt: { 'BR-MAIN': T0 + 9000 },
          alert: 5, // القيمة القديمة قبل الكتم — الجهاز ده لسه مالحقش يشوف الكتم
          images: ['old.jpg'], imageUrl: 'old.jpg',
          onlineVisible: true, updatedAt: T0 + 9000, // أحدث توقيتًا للسجل ككل من الكتم نفسه
        }],
      }),
    };
    processFirebaseDoc(fakeDoc, true);
    const p = DB.products.find(x => x.id === 'PRD-D700');
    return { alert: p.alert, qty: p.qty };
  });
  r.eq('تنبيه الصنف فضل متكتّم (0) رغم إن الجهاز التاني بعت تحديث أحدث توقيتًا للسجل ككل', t1.alert, 0);
  r.eq('في نفس الوقت، تنقيص الكمية (بيع أونلاين اتأكد من الجهاز التاني) اتطبّق صح', t1.qty, 3);

  // ===== ٢) العكس: تعديل التنبيه من جهاز تاني بتوقيت أحدث فعليًا لحقل التنبيه نفسه —
  // لازم يوصل صح، مش يفضل واقف على القيمة القديمة هنا =====
  const t2 = await page.evaluate(() => {
    const fakeDoc2 = {
      exists: true,
      data: () => ({
        _updatedAt: Date.now(),
        products: [{
          id: 'PRD-D700', name: 'صنف مرتبط بالموقع', cat: 'اجهزة', section: 'devices', brand: 'Test',
          buy: 100, sell: 150, qty: 3, qtyByBranch: { 'BR-MAIN': 3 },
          alert: 2, alertUpdatedAt: Date.now(), // تعديل حقيقي وأحدث فعليًا لحقل التنبيه من جهاز تاني
          images: ['old.jpg'], imageUrl: 'old.jpg',
          onlineVisible: true, updatedAt: Date.now(),
        }],
      }),
    };
    processFirebaseDoc(fakeDoc2, true);
    return { alert: DB.products.find(x => x.id === 'PRD-D700').alert };
  });
  r.eq('تعديل تنبيه حقيقي وأحدث من جهاز تاني وصل صح (0 → 2)', t2.alert, 2);

  // ===== ٣) نفس الفكرة للصور: رفعت صورة جديدة هنا، وجهاز تاني عدّل حاجة تانية (الكمية)
  // بتوقيت أحدث للسجل ككل — الصورة الجديدة لازم تفضل موجودة، مايرجعش القديمة =====
  const t3 = await page.evaluate(() => {
    const T1 = Date.now();
    DB.products = [{
      id: 'PRD-D701', name: 'صنف تاني مرتبط بالموقع', cat: 'اجهزة', section: 'devices', brand: 'Test',
      buy: 100, sell: 150, qty: 5, qtyByBranch: { 'BR-MAIN': 5 },
      alert: 1, alertUpdatedAt: T1 - 10000,
      images: ['new-photo.jpg'], imageUrl: 'new-photo.jpg', imagesUpdatedAt: T1 + 5000, // رفعت صورة جديدة هنا
      onlineVisible: true, updatedAt: T1 + 5000,
    }];
    const fakeDoc3 = {
      exists: true,
      data: () => ({
        _updatedAt: T1 + 9000,
        products: [{
          id: 'PRD-D701', name: 'صنف تاني مرتبط بالموقع', cat: 'اجهزة', section: 'devices', brand: 'Test',
          buy: 100, sell: 150, qty: 2, qtyByBranch: { 'BR-MAIN': 2 }, qtyByBranchUpdatedAt: { 'BR-MAIN': T1 + 9000 },
          alert: 1,
          images: ['old-photo.jpg'], imageUrl: 'old-photo.jpg', // الجهاز التاني لسه شايف الصورة القديمة بس
          onlineVisible: true, updatedAt: T1 + 9000, // أحدث توقيتًا للسجل ككل من رفع الصورة نفسه
        }],
      }),
    };
    processFirebaseDoc(fakeDoc3, true);
    const p = DB.products.find(x => x.id === 'PRD-D701');
    return { images: p.images, imageUrl: p.imageUrl, qty: p.qty };
  });
  r.eq('الصورة الجديدة فضلت موجودة (new-photo.jpg) رغم تحديث أحدث توقيتًا للسجل ككل من جهاز تاني', t3.imageUrl, 'new-photo.jpg');
  r.eq('imageUrl و images متطابقين برضه (new-photo.jpg)', t3.images[0], 'new-photo.jpg');
  r.eq('تنقيص الكمية من الجهاز التاني اتطبّق صح في نفس الوقت', t3.qty, 2);

  // ===== ٤) توافق للخلف: سجلات قديمة (قبل هذا الإصلاح) من غير alertUpdatedAt/imagesUpdatedAt
  // خالص — لازم يرجع لنفس السلوك القديم بالظبط (مقارنة توقيت السجل ككل) من غير أي كسر =====
  const t4 = await page.evaluate(() => {
    const T2 = Date.now();
    DB.products = [{
      id: 'PRD-D702', name: 'صنف قديم', cat: 'اجهزة', section: 'devices', brand: 'Test',
      buy: 100, sell: 150, qty: 5, qtyByBranch: { 'BR-MAIN': 5 },
      alert: 0, images: ['x.jpg'], imageUrl: 'x.jpg',
      updatedAt: T2, // مفيش alertUpdatedAt ولا imagesUpdatedAt خالص (سجل من قبل الإصلاح)
    }];
    const fakeDoc4 = {
      exists: true,
      data: () => ({
        _updatedAt: T2 + 5000,
        products: [{
          id: 'PRD-D702', name: 'صنف قديم', cat: 'اجهزة', section: 'devices', brand: 'Test',
          buy: 100, sell: 150, qty: 5, qtyByBranch: { 'BR-MAIN': 5 },
          alert: 3, images: ['y.jpg'], imageUrl: 'y.jpg',
          updatedAt: T2 + 5000, // أحدث توقيتًا للسجل ككل — ده اللي المفروض يكسب هنا (نفس السلوك القديم)
        }],
      }),
    };
    processFirebaseDoc(fakeDoc4, true);
    return { alert: DB.products.find(x => x.id === 'PRD-D702').alert };
  });
  r.eq('توافق للخلف: سجل قديم من غير طوابع الحقول الجديدة رجع لنفس سلوك "الأحدث توقيتًا للسجل ككل" العادي', t4.alert, 3);

  r.ok('لا يوجد أي خطأ JS غير متوقع', pageErrors.length === 0);
  if (pageErrors.length) console.log('  Page errors:', pageErrors);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
