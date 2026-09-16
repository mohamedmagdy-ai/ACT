// ======= مُشغّل كل ملفات الاختبار (tests/*.test.js) بالترتيب، وواحد تلو الآخر =======
// بيشغّلهم كعمليات منفصلة (مش require مباشر) عشان أي كراش أو صفحة معلّقة في اختبار
// ميوقفش باقي الاختبارات، وبيلخّص النتيجة النهائية بكود خروج (exit code) واضح:
// 0 = كل حاجة سليمة، 1 = فيه اختبار فشل — مفيد لو حبيت تربطها بـCI مستقبلاً.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const testFiles = fs.readdirSync(__dirname)
  .filter(f => f.endsWith('.test.js'))
  .sort();

console.log(`\n🧪 هيتم تشغيل ${testFiles.length} ملف اختبار...\n`);

let allPassed = true;
for (const file of testFiles) {
  console.log(`\n===== ${file} =====`);
  const res = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit' });
  if (res.status !== 0) allPassed = false;
}

console.log(allPassed
  ? '\n✅ كل ملفات الاختبار عدّت بنجاح.\n'
  : '\n❌ فيه ملف اختبار واحد أو أكتر فشل — راجع التفاصيل فوق.\n');

process.exit(allPassed ? 0 : 1);
