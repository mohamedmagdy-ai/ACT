-- schema.sql — هيكل قاعدة بيانات SQLite لنظام صفية زغلول
-- ============================================================================
-- فلسفة التصميم (مهم تفهمها قبل ما تقرا الجداول):
--
-- ١. كل جدول عنده أعمدة "ساخنة" (indexed) للحقول اللي بيتم البحث/الفلترة/الفرز بيها
--    كتير (زي التاريخ، اسم العميل، الحالة، الفرع) — عشان الاستعلامات تبقى سريعة حتى
--    مع آلاف السجلات، وده أصلاً الهدف من الانتقال لـSQLite (بدل ما نلف على كل
--    localStorage array في الذاكرة في كل مرة).
--
-- ٢. كل جدول عنده كمان عمود `data` (نص JSON كامل للسجل الأصلي زي ما هو). ده مقصود:
--    شكل البيانات في البرنامج بيتغيّر بشكل متكرر (زي ما شفنا النهارده: discPct،
--    legalName، logoText... كلها اتضافت في نفس اليوم)، فلو ربطنا كل حقل بعمود SQL
--    منفصل، أي إضافة حقل جديد في الكود كانت هتحتاج "migration" لقاعدة البيانات في
--    كل مرة. بدل كده: أي حقل مش من الحقول "الساخنة" بيتخزن جوه `data` تلقائيًا،
--    ومفيش داعي نلمس الـschema أبدًا لمجرد إضافة حقل جديد.
--
-- ٣. كل الجداول (عدا branches نفسها) فيها `branch_id` — استعدادًا لمرحلة الفروع
--    المتعددة اللاحقة، حتى لو فرع واحد بس شغال دلوقتي.
--
-- ٤. `id` هو المفتاح الأساسي في كل مكان (زي ID اللي البرنامج بيولّده أصلاً:
--    S-1, WO-1, BR-MAIN...) — نفس الأرقام والصيغة الحالية تمامًا، مفيش تغيير.
-- ============================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL; -- أداء أفضل مع كتابة/قراءة متزامنة (مفيد وقت المزامنة مع Firebase)

-- ============ الفروع (الجدول الوحيد اللي معندوش branch_id لأنه هو نفسه تعريف الفروع) ============
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER,
  data TEXT NOT NULL DEFAULT '{}'
);

-- ============ العملاء ============
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  name TEXT,
  phone TEXT,
  created_at INTEGER,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE INDEX IF NOT EXISTS idx_customers_branch ON customers(branch_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- ============ المنتجات / المخزون ============
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  name TEXT,
  sell REAL DEFAULT 0,
  buy REAL DEFAULT 0,
  qty REAL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE INDEX IF NOT EXISTS idx_products_branch ON products(branch_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

-- ============ المبيعات ============
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  date TEXT,
  customer TEXT,
  customer_phone TEXT,
  status TEXT,
  total REAL DEFAULT 0,
  created_at INTEGER,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE INDEX IF NOT EXISTS idx_sales_branch ON sales(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);

-- ============ الصيانة (إذن الاستلام) ============
CREATE TABLE IF NOT EXISTS maintenance (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  date TEXT,
  customer TEXT,
  customer_phone TEXT,
  device TEXT,
  status TEXT,
  exit_type TEXT,
  created_at INTEGER,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE INDEX IF NOT EXISTS idx_maintenance_branch ON maintenance(branch_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_date ON maintenance(date);
CREATE INDEX IF NOT EXISTS idx_maintenance_customer ON maintenance(customer);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance(status);

-- ============ المشتريات ============
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  date TEXT,
  supplier TEXT,
  type TEXT,
  total REAL DEFAULT 0,
  is_tax INTEGER DEFAULT 0,
  created_at INTEGER,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE INDEX IF NOT EXISTS idx_purchases_branch ON purchases(branch_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(date);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier);

-- ============ العهدة ============
CREATE TABLE IF NOT EXISTS custody (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  employee TEXT,
  date TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE INDEX IF NOT EXISTS idx_custody_branch ON custody(branch_id);

-- ============ المصروفات ============
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  date TEXT,
  category TEXT,
  amount REAL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE INDEX IF NOT EXISTS idx_expenses_branch ON expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);

-- ============ إذونات الاستلام (منفصلة عن الصيانة نفسها لو الكود بيستخدمها منفصل) ============
CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  date TEXT,
  customer TEXT,
  status TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE INDEX IF NOT EXISTS idx_receipts_branch ON receipts(branch_id);
CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(date);

-- ============ أوامر الشغل ============
CREATE TABLE IF NOT EXISTS work_orders (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  date TEXT,
  customer TEXT,
  status TEXT,
  tech TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE INDEX IF NOT EXISTS idx_wo_branch ON work_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_wo_date ON work_orders(date);
CREATE INDEX IF NOT EXISTS idx_wo_tech ON work_orders(tech);

-- ============ فواتير الصيانة ============
CREATE TABLE IF NOT EXISTS maint_invoices (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  date TEXT,
  customer TEXT,
  total REAL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE INDEX IF NOT EXISTS idx_maintinv_branch ON maint_invoices(branch_id);
CREATE INDEX IF NOT EXISTS idx_maintinv_date ON maint_invoices(date);

-- ============ المرتجعات ============
CREATE TABLE IF NOT EXISTS returns (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  date TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE INDEX IF NOT EXISTS idx_returns_branch ON returns(branch_id);

-- ============ الفواتير الضريبية (مبيعات وصيانة مع بعض، متفرقة بـtax_type) ============
CREATE TABLE IF NOT EXISTS tax_invoices (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  date TEXT,
  customer TEXT,
  tax_type TEXT, -- 'sale' أو 'maint'
  total REAL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE INDEX IF NOT EXISTS idx_taxinv_branch ON tax_invoices(branch_id);
CREATE INDEX IF NOT EXISTS idx_taxinv_date ON tax_invoices(date);
CREATE INDEX IF NOT EXISTS idx_taxinv_type ON tax_invoices(tax_type);

-- ============ الموظفين ============
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  name TEXT,
  role TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch_id);

-- ============ المدفوعات ============
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  date TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE INDEX IF NOT EXISTS idx_payments_branch ON payments(branch_id);

-- ============ حدود التأمين ومدفوعاته ============
CREATE TABLE IF NOT EXISTS insurance_limits (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE TABLE IF NOT EXISTS insurance_payments (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  date TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- ============ الأصول الثابتة ============
CREATE TABLE IF NOT EXISTS fixed_assets (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- ============ الأرصدة الافتتاحية (مفتاحها الشهر مش id عادي) ============
CREATE TABLE IF NOT EXISTS opening_balances (
  id TEXT PRIMARY KEY, -- عادة بيبقى الشهر (YYYY-MM) أو معرّف مركّب branch+month
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  month TEXT,
  amount REAL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE INDEX IF NOT EXISTS idx_opening_branch_month ON opening_balances(branch_id, month);

-- ============ المسحوبات ============
CREATE TABLE IF NOT EXISTS withdrawals (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  date TEXT,
  partner TEXT,
  amount REAL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_branch ON withdrawals(branch_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_date ON withdrawals(date);

-- ============ سجل التدقيق (Audit Log) — مهم جدًا نحافظ على سلسلة الـhash زي ما هي ============
-- ملحوظة أمان: العمود `data` هنا لازم يحتوي على كل حقول الـhash chain (prevHash, hash..)
-- زي ما هي بالظبط من غير أي تعديل، عشان آلية اكتشاف التلاعب تفضل شغالة صح.
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  at INTEGER,
  seq INTEGER, -- ترتيب تسلسلي صريح (بديل موثوق لترتيب الإدراج، مهم لسلسلة الـhash)
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE INDEX IF NOT EXISTS idx_audit_branch_seq ON audit_logs(branch_id, seq);

-- ============ فك التجميعات (Disassemblies) ============
CREATE TABLE IF NOT EXISTS disassemblies (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  date TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- ============ رأس مال الشركاء ومساهماتهم ============
CREATE TABLE IF NOT EXISTS partner_capital (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  partner TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE TABLE IF NOT EXISTS partner_capital_injections (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  partner TEXT,
  date TEXT,
  amount REAL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE INDEX IF NOT EXISTS idx_partner_cap_branch ON partner_capital(branch_id);
CREATE INDEX IF NOT EXISTS idx_partner_inj_branch ON partner_capital_injections(branch_id);

-- ============ مراكز الخدمة (فروع فرعية/مواقع صيانة خارجية) ============
CREATE TABLE IF NOT EXISTS service_centers (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- ============ التحويلات بين الفروع — مهمة جدًا لمرحلة الفروع المتعددة ============
CREATE TABLE IF NOT EXISTS transfers (
  id TEXT PRIMARY KEY,
  from_branch TEXT NOT NULL,
  to_branch TEXT NOT NULL,
  date TEXT,
  status TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (from_branch) REFERENCES branches(id),
  FOREIGN KEY (to_branch) REFERENCES branches(id)
);
CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers(from_branch);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers(to_branch);

-- ============ عمولات الفنيين ============
CREATE TABLE IF NOT EXISTS technician_commissions (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  tech_id TEXT,
  month TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE INDEX IF NOT EXISTS idx_techcomm_branch_month ON technician_commissions(branch_id, month);
CREATE INDEX IF NOT EXISTS idx_techcomm_tech ON technician_commissions(tech_id);

-- ============ رسائل واتساب المعلّقة ============
CREATE TABLE IF NOT EXISTS pending_whatsapp (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  sent INTEGER DEFAULT 0,
  created_at INTEGER,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE INDEX IF NOT EXISTS idx_wa_branch ON pending_whatsapp(branch_id);
CREATE INDEX IF NOT EXISTS idx_wa_sent ON pending_whatsapp(sent);

-- ============ سجل تعارضات المزامنة (بين الفروع/الأجهزة) — بيانات تشخيصية بس، مش مالية ============
CREATE TABLE IF NOT EXISTS sync_conflicts (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  time INTEGER,
  table_name TEXT,
  data TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_syncconf_time ON sync_conflicts(time);

-- ============ نقاط ولاء العملاء ============
CREATE TABLE IF NOT EXISTS loyalty_points (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL DEFAULT 'BR-MAIN',
  customer_id TEXT,
  date TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_points(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_date ON loyalty_points(date);

-- ============ جدول بيانات إضافي عام (Key-Value) لأي إعدادات متفرقة زي sz_store_cfg،
-- sz_counters، sz_zoom_level، sz_last_backup_day... إلخ (مش محتاجة جدول مخصص لكل واحدة) ============
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER
);

-- ============ جدول تعريفي: تعيين كل مفتاح localStorage/DB_KEY قديم لاسم الجدول الجديد ============
-- (بيُستخدم وقت الترحيل بس، مش وقت التشغيل العادي)
CREATE TABLE IF NOT EXISTS _migration_key_map (
  old_key TEXT PRIMARY KEY,
  new_table TEXT NOT NULL
);
