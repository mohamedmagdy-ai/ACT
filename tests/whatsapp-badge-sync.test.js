// ======= اختبار: عداد "واتساب" فوق (pending-wa-badge) بيتحدّث مع أي تحديث سحابي =======
// المشكلة اللي بيحلها الكود ده: العداد كان بيتحدّث بس لما تعمل حاجة من نفس الجهاز
// (إرسال/تجاهل رسالة، أو تسجيل دخول). لو تحديث وصل من فرع/جهاز تاني عن طريق
// المزامنة السحابية (processFirebaseDoc) بيغيّر DB.pendingWhatsapp فعليًا (مثلاً
// حد تاني بعت أو تجاهل نفس الرسالة)، العداد كان بيفضل واقف على الرقم القديم —
// وده اللي كان بيبان كـ"العداد شايل ٥ بس لما تفتح القايمة يقولك مفيش رسائل خالص"،
// لأن القايمة نفسها (renderPendingWhatsappList) بتحسب من DB.pendingWhatsapp
// الطازة كل مرة تتفتح، بعكس العداد الجامد. الحل: renderPendingWhatsappBadge()
// بقت بتتنادى كمان جوه processFirebaseDoc مع كل تحديث سحابي.
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('whatsapp-badge-sync');
  const { browser, page, pageErrors } = await openApp();

  // ===== تجهيز: مستخدم مسجّل دخول (شرط تفعيل الرندر جوه processFirebaseDoc) + رسالة معلّقة محلياً =====
  const t1 = await page.evaluate(() => {
    if (typeof CURRENT_USER === 'undefined' || !CURRENT_USER) {
      CURRENT_USER = { username: 'tester', name: 'مستخدم اختبار', role: 'admin' };
    }
    DB.pendingWhatsapp = [
      { id: 'PWA-SYNC-1', phone: '01000000001', text: 'رسالة ١', customerLabel: 'عميل ١', sent: false, dismissed: false },
      { id: 'PWA-SYNC-2', phone: '01000000002', text: 'رسالة ٢', customerLabel: 'عميل ٢', sent: false, dismissed: false },
    ];
    renderPendingWhatsappBadge();
    const badge = document.getElementById('pending-wa-badge');
    return { text: badge.textContent, display: badge.style.display };
  });
  r.eq('العداد بيورّي 2 صح لما في رسالتين معلّقتين محليًا', t1.text, '2');
  r.eq('العداد ظاهر (مش display:none)', t1.display, '');

  // ===== المحاكاة: تحديث سحابي وصل (من فرع/جهاز تاني) بيقول إن الرسالتين بقوا متجاهلتين =====
  const t2 = await page.evaluate(() => {
    const fakeDoc = {
      exists: true,
      data: () => ({
        _updatedAt: Date.now(),
        pendingWhatsapp: [
          { id: 'PWA-SYNC-1', phone: '01000000001', text: 'رسالة ١', customerLabel: 'عميل ١', sent: false, dismissed: true, dismissedAt: Date.now() },
          { id: 'PWA-SYNC-2', phone: '01000000002', text: 'رسالة ٢', customerLabel: 'عميل ٢', sent: true, sentAt: Date.now() },
        ],
      }),
    };
    processFirebaseDoc(fakeDoc, true);
    const badge = document.getElementById('pending-wa-badge');
    return {
      badgeText: badge.textContent,
      badgeDisplay: badge.style.display,
      dbPending: DB.pendingWhatsapp.filter((m) => !m.sent && !m.dismissed).length,
    };
  });
  r.eq('بعد التحديث السحابي: DB.pendingWhatsapp الحقيقي بقى صفر رسايل معلّقة', t2.dbPending, 0);
  r.eq('العداد فوق اتحدّث لصفر برضه (مش لسه واقف على 2)', t2.badgeText, '');
  r.eq('العداد اتخفى (display:none) بعد ما بقى صفر', t2.badgeDisplay, 'none');

  // ===== وفتح قايمة الرسائل المعلّقة بيورّي نفس الحقيقة (مفيش تعارض بين العداد والقايمة) =====
  const t3 = await page.evaluate(() => {
    renderPendingWhatsappList();
    return document.getElementById('pending-wa-list').textContent;
  });
  r.ok('قايمة الرسائل بتورّي "مفيش رسائل معلّقة" — نفس حقيقة العداد بالظبط', t3.includes('مفيش رسائل معلّقة'));

  // ===== تأكيد إضافي: تحديث سحابي بيضيف رسالة معلّقة جديدة من فرع تاني — العداد لازم يعكسها فورًا =====
  const t4 = await page.evaluate(() => {
    const fakeDoc2 = {
      exists: true,
      data: () => ({
        _updatedAt: Date.now() + 1,
        pendingWhatsapp: [
          { id: 'PWA-SYNC-1', phone: '01000000001', text: 'رسالة ١', customerLabel: 'عميل ١', sent: false, dismissed: true, dismissedAt: Date.now() },
          { id: 'PWA-SYNC-2', phone: '01000000002', text: 'رسالة ٢', customerLabel: 'عميل ٢', sent: true, sentAt: Date.now() },
          { id: 'PWA-SYNC-3', phone: '01000000003', text: 'رسالة جديدة من فرع تاني', customerLabel: 'عميل ٣', sent: false, dismissed: false },
        ],
      }),
    };
    processFirebaseDoc(fakeDoc2, true);
    return document.getElementById('pending-wa-badge').textContent;
  });
  r.eq('رسالة معلّقة جديدة وصلت من فرع تاني — العداد اتحدّث لـ1 فورًا', t4, '1');

  r.ok('لا يوجد أي خطأ JS غير متوقع', pageErrors.length === 0);
  if (pageErrors.length) console.log('  Page errors:', pageErrors);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
