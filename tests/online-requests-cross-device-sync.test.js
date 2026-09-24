// ======= اختبار: طلبات صيانة الموقع/الطلبات الأونلاين/رسائل الموقع بتتزامن بين الأجهزة =======
// المشكلة اللي بلّغ عنها مستخدم حقيقي: فتح طلب صيانة من جهاز المحل ودوس "تجاهل"،
// وجهاز تاني (البيت) فاتح طلب صيانة تاني — كل جهاز كان شايف بس اللي هو نفسه لقطه.
// السبب: onlineOrders/onlineMessages/onlineMaintRequests كانوا مش موجودين في DB_KEYS —
// القايمة اللي دمج البيانات بين الأجهزة (processFirebaseDoc) بيمر عليها بس. من غيرها،
// أي تغيير (تجاهل/تحويل/أرشفة) كان بيفضل حبيس الجهاز اللي اتعمل عليه، وميوصلش لأي
// جهاز تاني خالص — ولا حتى الطلب الأصلي نفسه لو جهاز تاني وصلّه بعد ما جهاز أول عالجه.
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('online-requests-cross-device-sync');
  const { browser, page, pageErrors } = await openApp();

  const t1 = await page.evaluate(() => {
    if (typeof CURRENT_USER === 'undefined' || !CURRENT_USER) {
      CURRENT_USER = { username: 'tester', name: 'مستخدم اختبار', role: 'admin' };
    }
    // ===== ١) الجداول التلاتة بقت فعليًا جوه DB_KEYS =====
    const inKeys = {
      onlineOrders: DB_KEYS.includes('onlineOrders'),
      onlineMessages: DB_KEYS.includes('onlineMessages'),
      onlineMaintRequests: DB_KEYS.includes('onlineMaintRequests'),
    };

    // ===== ٢) محاكاة: الجهاز ده فتح طلب صيانة واتجاهل هنا محليًا =====
    // createdAt ثابت (مش Date.now() نسبي) عشان يفضل نفس القيمة بالظبط في نداءات
    // page.evaluate() التالية — قيمتين مختلفتين لنفس السجل كانوا هيتعاملوا (عن قصد)
    // كأنهم مستندين مختلفين حقيقة (كاشف تصادم الأرقام)، مش نفس الطلب بنسخة أحدث.
    window._FIXED_CREATED_AT = 1700000000000;
    DB.onlineMaintRequests = [
      { id: 'MREQ-0001', customerName: 'عميل ١', customerPhone: '01000000001', device: 'خلاط', issue: 'مش شغال', status: 'pending', rcptId: '', createdAt: window._FIXED_CREATED_AT },
    ];
    updateMaintReqBadge();
    const badgeBefore = { sidebar: document.getElementById('maintreq-badge').textContent, topbar: document.getElementById('topbar-maintreq-badge').textContent };
    const sidebarDisplayBefore = document.getElementById('maintreq-badge').style.display;
    const topbarDisplayBefore = document.getElementById('topbar-maintreq-badge').style.display;

    // ===== ٣) محاكاة: تحديث سحابي وصل من جهاز/فرع تاني — نفس الطلب، لكن بقى "متجاهل" =====
    const fakeDoc = {
      exists: true,
      data: () => ({
        _updatedAt: Date.now(),
        onlineMaintRequests: [
          { id: 'MREQ-0001', customerName: 'عميل ١', customerPhone: '01000000001', device: 'خلاط', issue: 'مش شغال', status: 'dismissed', rcptId: '', createdAt: window._FIXED_CREATED_AT, updatedAt: Date.now() },
        ],
      }),
    };
    processFirebaseDoc(fakeDoc, true);

    return {
      inKeys,
      badgeBefore,
      sidebarDisplayBefore,
      topbarDisplayBefore,
      statusAfter: DB.onlineMaintRequests.find(x => x.id === 'MREQ-0001').status,
      sidebarAfter: document.getElementById('maintreq-badge').style.display,
      topbarAfter: document.getElementById('topbar-maintreq-badge').style.display,
    };
  });

  r.ok('onlineOrders موجودة في DB_KEYS (بتتزامن بين الأجهزة)', t1.inKeys.onlineOrders);
  r.ok('onlineMessages موجودة في DB_KEYS (بتتزامن بين الأجهزة)', t1.inKeys.onlineMessages);
  r.ok('onlineMaintRequests موجودة في DB_KEYS (بتتزامن بين الأجهزة)', t1.inKeys.onlineMaintRequests);
  r.eq('قبل التحديث السحابي: شارة القايمة الجانبية ظاهرة برقم 1', t1.badgeBefore.sidebar, '1');
  r.eq('قبل التحديث السحابي: شارة أعلى الشاشة (جنب واتساب) ظاهرة برقم 1 كمان', t1.badgeBefore.topbar, '1');
  r.eq('الشارتين ظاهرتين قبل التحديث', t1.sidebarDisplayBefore === '' && t1.topbarDisplayBefore === '', true);
  r.eq('بعد وصول تحديث سحابي من جهاز تاني بـ"تجاهل": الحالة اتحدّثت محليًا لـ"متجاهلة"', t1.statusAfter, 'dismissed');
  r.eq('شارة القايمة الجانبية اختفت (0 طلبات معلّقة) من غير ما تعمل أي حاجة إنت بنفسك', t1.sidebarAfter, 'none');
  r.eq('شارة أعلى الشاشة اختفت هي كمان — نفس اللحظة، على هذا الجهاز البعيد', t1.topbarAfter, 'none');

  // ===== ٤) محاكاة معاكسة: جهاز تاني عمل طلب صيانة جديد — لازم يوصل هنا كمان (مش بس اللي "لقطته" أنت بنفسك) =====
  const t2 = await page.evaluate(() => {
    const fakeDoc2 = {
      exists: true,
      data: () => ({
        _updatedAt: Date.now() + 1,
        onlineMaintRequests: [
          { id: 'MREQ-0001', customerName: 'عميل ١', customerPhone: '01000000001', device: 'خلاط', issue: 'مش شغال', status: 'dismissed', rcptId: '', createdAt: window._FIXED_CREATED_AT, updatedAt: Date.now() },
          { id: 'MREQ-0002', customerName: 'عميل ٢', customerPhone: '01000000002', device: 'فوود بروسيسور', issue: 'موتور محروق', status: 'pending', rcptId: '', createdAt: window._FIXED_CREATED_AT + 1000, updatedAt: Date.now() },
        ],
      }),
    };
    processFirebaseDoc(fakeDoc2, true);
    return {
      count: DB.onlineMaintRequests.length,
      hasNew: !!DB.onlineMaintRequests.find(x => x.id === 'MREQ-0002'),
      badge: document.getElementById('topbar-maintreq-badge').textContent,
      badgeDisplay: document.getElementById('topbar-maintreq-badge').style.display,
    };
  });
  r.eq('طلب صيانة جديد اتعمل من جهاز تاني — وصل هنا فعليًا (بقى صنفين مش واحد)', t2.count, 2);
  r.ok('الطلب الجديد (MREQ-0002) موجود محليًا دلوقتي', t2.hasNew);
  r.eq('شارة أعلى الشاشة رجعت تظهر برقم 1 (الطلب الجديد المعلّق)', t2.badge, '1');
  r.eq('الشارة ظاهرة', t2.badgeDisplay, '');

  r.ok('لا يوجد أي خطأ JS غير متوقع', pageErrors.length === 0);
  if (pageErrors.length) console.log('  Page errors:', pageErrors);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
