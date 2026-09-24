// ======= اختبار: البنوك (DB.banks) والحركات البنكية (DB.bankTx) بتتزامن بين الأجهزة =======
// المشكلة اللي بلّغ عنها مستخدم حقيقي: سجّل بنك من جهاز البيت، وروح المحل — جهاز
// المحل معندوش أي أثر للبنك ده خالص. السبب: banks/bankTx كانوا مش موجودين في DB_KEYS —
// fsWriteAll بيرفع نسخة سحابية مستقلة بس للجداول المذكورة في القايمة دي، فأي جدول
// ناقص منها (زي banks/bankTx كانوا) مبيوصلش للسحابة خالص، يفضل حبيس التخزين المحلي
// بتاع الجهاز اللي اتسجل عليه بس — ده أخطر من مجرد "مش بيتزامن"، لأنه فعليًا بيمنع
// أي نسخة سحابية للبيانات دي من الأساس (لو الجهاز ده اتمسح/اتغيّر، البنك بيضيع تمامًا).
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('banks-cross-device-sync');
  const { browser, page, pageErrors } = await openApp();

  const t1 = await page.evaluate(() => {
    if (typeof CURRENT_USER === 'undefined' || !CURRENT_USER) {
      CURRENT_USER = { username: 'tester', name: 'مستخدم اختبار', role: 'admin' };
    }
    // ===== ١) الجدولين بقوا فعليًا جوه DB_KEYS (شرط لازم عشان أي مزامنة سحابية تحصل أصلاً) =====
    const inKeys = { banks: DB_KEYS.includes('banks'), bankTx: DB_KEYS.includes('bankTx') };

    // ===== ٢) محاكاة: جهاز البيت سجّل بنك محليًا، وجهاز المحل معندوش نسخة منه =====
    window._FIXED_CREATED_AT = 1700000000000;
    DB.banks = [
      { id: 'BANK-0001', name: 'بنك القاهرة', commissionPct: 1.4, accountNo: '', settlementDays: 2, active: true, createdAt: window._FIXED_CREATED_AT },
    ];
    DB.bankTx = [
      { id: 'BTX-0001', bankId: 'BANK-0001', amount: 500, commissionAmount: 7, settled: false, date: '2026-09-01', createdAt: window._FIXED_CREATED_AT },
    ];

    // ===== ٣) محاكاة: تحديث سحابي وصل من جهاز/فرع تاني — نفس البنك، لكن اتحدّث (اسم/عمولة
    // اتغيّرت)، وحركة بنكية جديدة اتسجلت وأتأكد تحويلها (settled) من الجهاز التاني =====
    const fakeDoc = {
      exists: true,
      data: () => ({
        _updatedAt: Date.now(),
        banks: [
          { id: 'BANK-0001', name: 'بنك القاهرة', commissionPct: 1.5, accountNo: '', settlementDays: 2, active: true, createdAt: window._FIXED_CREATED_AT, updatedAt: Date.now() },
        ],
        bankTx: [
          { id: 'BTX-0001', bankId: 'BANK-0001', amount: 500, commissionAmount: 7, settled: false, date: '2026-09-01', createdAt: window._FIXED_CREATED_AT, updatedAt: Date.now() },
          { id: 'BTX-0002', bankId: 'BANK-0001', amount: 900, commissionAmount: 12.6, settled: true, date: '2026-09-05', createdAt: window._FIXED_CREATED_AT + 1000, updatedAt: Date.now() },
        ],
      }),
    };
    processFirebaseDoc(fakeDoc, true);

    return {
      inKeys,
      bankCommissionAfter: DB.banks.find(b => b.id === 'BANK-0001').commissionPct,
      bankCount: DB.banks.length,
      txCount: DB.bankTx.length,
      hasNewTx: !!DB.bankTx.find(t => t.id === 'BTX-0002'),
      newTxSettled: (DB.bankTx.find(t => t.id === 'BTX-0002') || {}).settled,
    };
  });

  r.ok('banks موجودة في DB_KEYS (بتتزامن بين الأجهزة، مش حبيسة جهاز واحد)', t1.inKeys.banks);
  r.ok('bankTx موجودة في DB_KEYS (بتتزامن بين الأجهزة، مش حبيسة جهاز واحد)', t1.inKeys.bankTx);
  r.eq('بعد وصول تحديث سحابي من جهاز تاني: نسبة عمولة البنك اتحدّثت محليًا (1.4 → 1.5)', t1.bankCommissionAfter, 1.5);
  r.eq('نفس البنك (BANK-0001) اتدمج بالـid — مفيش نسخة مكررة', t1.bankCount, 1);
  r.eq('حركة بنكية جديدة اتسجلت من جهاز تاني وصلت هنا فعليًا (بقى حركتين مش واحدة)', t1.txCount, 2);
  r.ok('الحركة الجديدة (BTX-0002) موجودة محليًا دلوقتي', t1.hasNewTx);
  r.eq('حالة "تم التحويل فعليًا" (settled) وصلت صح من الجهاز التاني', t1.newTxSettled, true);

  // ===== ٤) محاكاة معاكسة: بنك جديد كلّه اتسجل من جهاز تاني (مش بس تحديث لبنك موجود) —
  // لازم يوصل هنا كمان، مش بس اللي "لقطه" الجهاز ده بنفسه من الأول =====
  const t2 = await page.evaluate(() => {
    const fakeDoc2 = {
      exists: true,
      data: () => ({
        _updatedAt: Date.now() + 1,
        banks: [
          { id: 'BANK-0001', name: 'بنك القاهرة', commissionPct: 1.5, accountNo: '', settlementDays: 2, active: true, createdAt: window._FIXED_CREATED_AT, updatedAt: Date.now() },
          { id: 'BANK-0002', name: 'بنك مصر', commissionPct: 1.2, accountNo: '', settlementDays: 3, active: true, createdAt: window._FIXED_CREATED_AT + 2000, updatedAt: Date.now() },
        ],
        bankTx: DB.bankTx,
      }),
    };
    processFirebaseDoc(fakeDoc2, true);
    return {
      count: DB.banks.length,
      hasNewBank: !!DB.banks.find(b => b.id === 'BANK-0002'),
    };
  });
  r.eq('بنك جديد بالكامل اتسجل من جهاز تاني — وصل هنا فعليًا (بقى بنكين مش واحد)', t2.count, 2);
  r.ok('البنك الجديد (بنك مصر) موجود محليًا دلوقتي من غير ما حد يسجّله على هذا الجهاز', t2.hasNewBank);

  // ===== ٥) الرفع للسحابة (fsWriteAll): كل جدول في DB_KEYS بياخد مستند Firestore مستقل
  // بتاعه — بنتأكد إن banks/bankTx بقوا فعليًا من ضمن المستندات اللي بترتفع =====
  const t3 = await page.evaluate(() => {
    const uploadedDocs = [];
    FS_COL = { doc: (name) => ({ set: (data) => { uploadedDocs.push(name); return Promise.resolve(); } }) };
    fsWriteAll({ banks: DB.banks, bankTx: DB.bankTx, _updatedAt: Date.now() });
    return uploadedDocs;
  });
  r.ok('fsWriteAll بترفع مستند Firestore مستقل لجدول "banks"', t3.includes('banks'));
  r.ok('fsWriteAll بترفع مستند Firestore مستقل لجدول "bankTx"', t3.includes('bankTx'));

  r.ok('لا يوجد أي خطأ JS غير متوقع', pageErrors.length === 0);
  if (pageErrors.length) console.log('  Page errors:', pageErrors);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
