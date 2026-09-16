// ======= اختبار Node عادي: التأكد إن قناة IPC بتاعة الزووم متوصّلة صح =======
// الاختبار السابق (zoom-native.test.js) بيتأكد إن الواجهة بتنادي electronAPI.
// setZoomFactor صح. الاختبار ده بيتأكد إن السلك التاني من الطرفين موجود فعليًا:
// main.js فاتح قناة 'set-zoom-factor'، وpreload.js عاكسها بنفس الاسم بالظبط —
// لو الاسمين اختلفوا (تعديل مستقبلي غلط في أي ملف)، النداء هيفشل بصمت جوه
// التطبيق الحقيقي من غير أي رسالة خطأ واضحة، فمهم نتأكد منهم مربوطين ببعض هنا.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(desc, cond) {
  if (cond) { pass++; console.log(`  ✓ ${desc}`); }
  else { fail++; console.log(`  ✗ ${desc}`); }
}

console.log('\n===== zoom-ipc-wiring.test.js =====');

const mainJs = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const preloadJs = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');

ok("main.js بيسجّل ipcMain.handle('set-zoom-factor', ...)", /ipcMain\.handle\(\s*['"]set-zoom-factor['"]/.test(mainJs));
ok('main.js بينادي win.webContents.setZoomFactor فعليًا جوه الهاندلر', mainJs.includes('win.webContents.setZoomFactor'));
ok("preload.js بيعرّض setZoomFactor عن طريق ipcRenderer.invoke('set-zoom-factor')", /setZoomFactor:\s*\(factor\)\s*=>\s*ipcRenderer\.invoke\(\s*['"]set-zoom-factor['"]/.test(preloadJs));

console.log(`\nzoom-ipc-wiring: ${pass} نجحت، ${fail} فشلت\n`);
process.exitCode = fail === 0 ? 0 : 1;
