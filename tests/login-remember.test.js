// ======= اختبار: شاشة الدخول الجديدة (اختيار المستخدم من قائمة + حفظ بيانات الدخول) =======
const { openApp, TestReporter } = require('./helpers');

(async () => {
  const r = new TestReporter('login-remember');
  const { browser, page, pageErrors } = await openApp();

  // ===== ٠) تجهيز: مستخدم اختبار غير افتراضي (من غير mustChangePass) بكلمة سر معروفة =====
  await page.evaluate(async () => {
    const hash = await hashPass('Cashier@123');
    const users = loadUsers();
    users.push({ username: 'cashier1', password: hash, role: 'user', name: 'كاشير تجريبي', perms: { all: true }, branch: 'BR-MAIN' });
    saveUsers(users);
    initLoginScreen();
  });
  await page.waitForTimeout(100);

  // ===== ١) شاشة الدخول بقت فيها قائمة اختيار (select) مش خانة كتابة =====
  const t1 = await page.evaluate(() => {
    const sel = document.getElementById('login-user');
    return {
      isSelect: sel && sel.tagName === 'SELECT',
      hasAdmin: Array.from(sel.options).some((o) => o.value === 'admin'),
      hasCashier: Array.from(sel.options).some((o) => o.value === 'cashier1'),
    };
  });
  r.ok('عنصر اختيار المستخدم بقى قايمة (select) مش خانة كتابة', t1.isSelect);
  r.ok('القايمة فيها حساب "المدير" الافتراضي', t1.hasAdmin);
  r.ok('القايمة فيها المستخدم الجديد اللي اتضاف', t1.hasCashier);

  // ===== ٢) دخول بمستخدم من القايمة + كلمة سر غلط بيرفض =====
  await page.selectOption('#login-user', 'cashier1');
  await page.fill('#login-pass', 'wrong-password');
  await page.click('.login-btn');
  await page.waitForTimeout(200);
  const t2 = await page.evaluate(() => ({
    errVisible: document.getElementById('login-err').style.display !== 'none',
    stillOnLogin: !document.getElementById('login-screen').classList.contains('hidden'),
  }));
  r.ok('كلمة سر غلط بيظهر رسالة خطأ', t2.errVisible);
  r.ok('ولسه واقف في شاشة الدخول', t2.stillOnLogin);

  // ===== ٣) دخول صحيح من غير تفعيل "حفظ بيانات الدخول" — مفيش حاجة تتحفظ =====
  await page.fill('#login-pass', 'Cashier@123');
  const rememberChecked0 = await page.evaluate(() => document.getElementById('login-remember').checked);
  r.eq('تشييك "حفظ بيانات الدخول" مش مفعّل افتراضيًا', rememberChecked0, false);
  await page.click('.login-btn');
  await page.waitForTimeout(250);
  const t3 = await page.evaluate(() => ({
    loggedIn: !!(typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.username === 'cashier1'),
    hidden: document.getElementById('login-screen').classList.contains('hidden'),
    remembered: localStorage.getItem('sz_remembered_login'),
  }));
  r.ok('الدخول نجح بالمستخدم والباسورد الصح', t3.loggedIn);
  r.ok('شاشة الدخول اتقفلت', t3.hidden);
  r.eq('من غير تفعيل "حفظ بيانات الدخول"، مفيش حاجة اتحفظت محليًا', t3.remembered, null);

  // ===== ٤) خروج — القايمة والباسورد بيرجعوا فاضيين لأن مفيش حاجة محفوظة =====
  await page.evaluate(() => doLogout());
  await page.waitForTimeout(100);
  await page.click('#danger-confirm-btn');
  await page.waitForTimeout(150);
  const t4 = await page.evaluate(() => ({
    passVal: document.getElementById('login-pass').value,
    rememberChecked: document.getElementById('login-remember').checked,
    loginVisible: !document.getElementById('login-screen').classList.contains('hidden'),
  }));
  r.eq('كلمة المرور فاضية بعد الخروج (مفيش حفظ)', t4.passVal, '');
  r.eq('تشييك "حفظ بيانات الدخول" مبقاش متفعّل', t4.rememberChecked, false);
  r.ok('شاشة الدخول ظهرت تاني بعد الخروج', t4.loginVisible);

  // ===== ٥) دخول تاني بتفعيل "حفظ بيانات الدخول" — البيانات المفروض تتحفظ محليًا =====
  await page.selectOption('#login-user', 'cashier1');
  await page.fill('#login-pass', 'Cashier@123');
  await page.click('#login-remember');
  await page.click('.login-btn');
  await page.waitForTimeout(250);
  const t5 = await page.evaluate(() => {
    const raw = localStorage.getItem('sz_remembered_login');
    return raw ? JSON.parse(raw) : null;
  });
  r.ok('اتحفظت بيانات الدخول محليًا بعد تفعيل التشييك', !!t5);
  if (t5) {
    r.eq('اسم المستخدم المحفوظ صح', t5.username, 'cashier1');
    r.eq('كلمة المرور المحفوظة صح', t5.password, 'Cashier@123');
  }

  // ===== ٦) خروج تاني — المفروض القايمة والباسورد والتشييك يترجّعوا زي ما كانوا =====
  await page.evaluate(() => doLogout());
  await page.waitForTimeout(100);
  await page.click('#danger-confirm-btn');
  await page.waitForTimeout(150);
  const t6 = await page.evaluate(() => ({
    userVal: document.getElementById('login-user').value,
    passVal: document.getElementById('login-pass').value,
    rememberChecked: document.getElementById('login-remember').checked,
  }));
  r.eq('اسم المستخدم اترجّع تلقائيًا في القايمة', t6.userVal, 'cashier1');
  r.eq('كلمة المرور اترجّعت تلقائيًا في الخانة', t6.passVal, 'Cashier@123');
  r.ok('تشييك "حفظ بيانات الدخول" فضل مفعّل', t6.rememberChecked);

  // ===== ٧) دخول "بدوسة زرار واحدة" من غير كتابة أي حاجة (البيانات جاهزة من الحفظ) =====
  await page.click('.login-btn');
  await page.waitForTimeout(250);
  const t7 = await page.evaluate(() => !!(typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.username === 'cashier1'));
  r.ok('الدخول نجح بدوسة زرار واحدة بس من غير ما يكتب أي حاجة', t7);

  // ===== ٨) خروج + إلغاء تفعيل "حفظ بيانات الدخول" وقت الدخول — البيانات المحفوظة تتمسح =====
  await page.evaluate(() => doLogout());
  await page.waitForTimeout(100);
  await page.click('#danger-confirm-btn');
  await page.waitForTimeout(150);
  await page.click('#login-remember'); // كان متفعّل من الخطوة اللي فاتت، هنشيله
  await page.click('.login-btn');
  await page.waitForTimeout(250);
  const t8 = await page.evaluate(() => localStorage.getItem('sz_remembered_login'));
  r.eq('لما نلغي تفعيل الحفظ وقت الدخول، البيانات المحفوظة بتتمسح', t8, null);

  r.ok('لا يوجد أي خطأ JS غير متوقع', pageErrors.length === 0);
  if (pageErrors.length) console.log('  Page errors:', pageErrors);

  await browser.close();
  process.exitCode = r.close() ? 0 : 1;
})();
