// ============================================================
// المتجر الأونلاين — المنطق الكامل
// بيقرا كتالوج المنتجات من Firestore (مستند sz_data/_online_catalog، اللي
// البرنامج بيحدّثه تلقائي)، وبيبعت أي طلب جديد كمستند مستقل جوه
// sz_data/_online_orders_incoming/items — البرنامج هو اللي بيراجعه ويأكّده
// ويحسب السعر النهائي، مش الموقع ده (الموقع بيوري تقدير بس).
// ============================================================

const state = {
  catalog: null,         // {products, shipping, enabled}
  section: 'devices',
  search: '',
  cart: {},               // {productId: qty}
};

const CART_KEY = 'act_store_cart_v1';

// ===== أدوات صغيرة =====
const $ = (id) => document.getElementById(id);
const fmtMoney = (n) => `${Math.round(n || 0).toLocaleString('ar-EG')} ج.م`;
function escapeHtml(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function loadCart(){
  try{ const raw = localStorage.getItem(CART_KEY); state.cart = raw ? JSON.parse(raw) : {}; }
  catch(e){ state.cart = {}; }
}
function saveCart(){
  try{ localStorage.setItem(CART_KEY, JSON.stringify(state.cart)); }catch(e){}
}

// ===== تهيئة Firebase =====
let db = null;
function initFirebase(){
  const cfg = window.FIREBASE_CONFIG || {};
  if(!cfg.apiKey || String(cfg.apiKey).indexOf('PASTE_') === 0){
    showConfigNeeded();
    return false;
  }
  try{
    firebase.initializeApp(cfg);
    db = firebase.firestore();
    return true;
  }catch(e){
    console.error('Firebase init failed', e);
    showOffline();
    return false;
  }
}
function showConfigNeeded(){
  $('loading-state').hidden = true;
  const el = $('offline-state');
  el.hidden = false;
  el.querySelector('p').textContent = 'الموقع لسه محتاج إعدادات Firebase — افتح ملف config.js وحط القيم بتاعتك.';
}
function showOffline(){
  $('loading-state').hidden = true;
  $('offline-state').hidden = false;
}

// ===== تحميل الكتالوج =====
function loadCatalog(){
  if(!db) return;
  db.collection('sz_data').doc('_online_catalog').get().then((doc) => {
    $('loading-state').hidden = true;
    if(!doc.exists){ showOffline(); return; }
    const data = doc.data() || {};
    if(data.enabled === false){ showOffline(); return; }
    state.catalog = data;
    renderProducts();
  }).catch((e) => {
    console.error('loadCatalog failed', e);
    showOffline();
  });
}

// ===== صورة إعلانية (عروض/خصومات) أعلى الصفحة — اختيارية، من مستند
// _online_site_content نفسه اللي صفحتي الشروط/الخصوصية بيقروه (قراءة عامة) =====
function loadPromoBanner(){
  if(!db) return;
  db.collection('sz_data').doc('_online_site_content').get().then((doc) => {
    const data = (doc && doc.exists) ? (doc.data() || {}) : {};
    renderPromoBanner(data.bannerImage || '');
  }).catch((e) => {
    console.error('loadPromoBanner failed', e);
  });
}
function renderPromoBanner(url){
  const el = $('promo-banner');
  if(!el) return;
  if(url){
    $('promo-banner-img').src = url;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

// ===== عرض المنتجات =====
function currentFilteredProducts(){
  if(!state.catalog || !state.catalog.products) return [];
  const q = state.search.trim().toLowerCase();
  return state.catalog.products.filter((p) => {
    if((p.section || 'devices') !== state.section) return false;
    if(!q) return true;
    const hay = `${p.name} ${p.cat||''} ${p.subcat||''} ${p.brand||''}`.toLowerCase();
    return hay.indexOf(q) > -1;
  });
}
function renderProducts(){
  const grid = $('product-grid');
  const list = currentFilteredProducts();
  $('empty-state').hidden = list.length !== 0;
  if(!list.length){ grid.innerHTML=''; return; }
  grid.innerHTML = list.map(productCardHtml).join('');
}
function priceBlockHtml(p){
  const hasDiscount = p.originalPrice != null && p.originalPrice > p.price;
  if(!hasDiscount) return `<span class="product-price">${fmtMoney(p.price)}</span>`;
  return `<span class="price-block">
      <span class="price-old">${fmtMoney(p.originalPrice)}</span>
      <span class="price-new">${fmtMoney(p.price)}</span>
    </span>`;
}
function productCardHtml(p){
  const inStock = (p.qty || 0) > 0;
  const inCart = state.cart[p.id] || 0;
  const hasDiscount = p.originalPrice != null && p.originalPrice > p.price;
  const discountPct = hasDiscount ? Math.round(100 - (p.price / p.originalPrice) * 100) : 0;
  const thumbInner = p.image
    ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" onerror="this.remove()">`
    : `<span class="thumb-ph">PRODUCT 1:1</span>`;
  const href = 'product.html?id=' + encodeURIComponent(p.id);
  return `
    <div class="product-card" data-id="${escapeHtml(p.id)}">
      <div class="stock-strip ${inStock ? '' : 'out'}">
        <span>${inStock ? 'متوفر' : 'غير متوفر'}</span>
        ${p.brand ? `<span class="strip-brand" dir="ltr">${escapeHtml(p.brand)}</span>` : ''}
      </div>
      <a class="product-thumb-link" href="${escapeHtml(href)}" aria-label="${escapeHtml(p.name)}">
        <div class="product-thumb ${p.image ? 'has-image' : ''}">
          ${hasDiscount && discountPct > 0 ? `<span class="discount-badge">خصم ${discountPct}%</span>` : ''}
          ${thumbInner}
        </div>
      </a>
      <div class="product-info">
        <a class="product-name-link" href="${escapeHtml(href)}">
          <div class="product-name">${escapeHtml(p.name)}</div>
          <div class="product-code" dir="ltr">${escapeHtml(p.id)}</div>
        </a>
        <div class="product-bottom">
          ${priceBlockHtml(p)}
          ${cartControlHtml(p, inStock, inCart)}
        </div>
      </div>
    </div>`;
}
function cartControlHtml(p, inStock, inCart){
  if(!inStock) return `<button class="ask-btn" onclick="openContact()">اسأل</button>`;
  if(!inCart) return `<button class="add-btn" onclick="cartAdd('${p.id}')">أضف</button>`;
  return `<div class="qty-stepper">
      <button onclick="cartAdd('${p.id}')">+</button>
      <span>${inCart}</span>
      <button onclick="cartRemove('${p.id}')">−</button>
    </div>`;
}

// ===== السلة =====
function findProduct(id){
  return (state.catalog && state.catalog.products || []).find((p) => p.id === id);
}
function cartAdd(id){
  const p = findProduct(id);
  if(!p) return;
  const have = state.cart[id] || 0;
  if(have >= (p.qty || 0)) return; // منعًا لطلب أكتر من المتاح
  state.cart[id] = have + 1;
  saveCart(); renderProducts(); updateCartBadge();
}
function cartRemove(id){
  const have = state.cart[id] || 0;
  if(have <= 1) delete state.cart[id];
  else state.cart[id] = have - 1;
  saveCart(); renderProducts(); updateCartBadge();
}
function cartLines(){
  return Object.keys(state.cart)
    .map((id) => ({ p: findProduct(id), qty: state.cart[id] }))
    .filter((l) => l.p && l.qty > 0);
}
function updateCartBadge(){
  const count = Object.values(state.cart).reduce((a, b) => a + b, 0);
  const badge = $('cart-count');
  if(!badge) return;
  if(count > 0){ badge.textContent = count; badge.hidden = false; }
  else badge.hidden = true;
}
// ملحوظة: السلة وإتمام الطلب بقى صفحة مستقلة (cart.html) بدل الدرج الجانبي +
// نافذة منفصلة — منطق العربة الكامل (المحافظات، حساب الشحن، الملخص، إرسال
// الطلب) موجود جوه cart.html نفسها، لأنها مبنية على نفس نمط الصفحات الثانوية
// التانية (about.html/product.html) بسكريبت مستقل بيقرا نفس مفتاح السلة
// المشترك (act_store_cart_v1)، مش عن طريق app.js هنا.

// ===== نافذة "راسلنا" (قناة تواصل تانية بجانب واتساب) =====
function openContact(){
  $('contact-overlay').hidden = false;
  $('contact-modal').classList.add('open');
  $('contact-modal').setAttribute('aria-hidden', 'false');
}
function closeContact(){
  $('contact-modal').classList.remove('open');
  $('contact-modal').setAttribute('aria-hidden', 'true');
  setTimeout(() => { $('contact-overlay').hidden = true; }, 180);
}
function submitContact(ev){
  ev.preventDefault();
  const message = $('c-message').value.trim();
  if(!message) return;
  const btn = $('submit-contact-btn');
  btn.disabled = true; btn.textContent = 'جاري الإرسال...';

  const msg = {
    name: $('c-name').value.trim(),
    phone: $('c-phone').value.trim(),
    message: message,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  db.collection('sz_data').doc('_online_messages_incoming').collection('items').add(msg)
    .then(() => {
      closeContact();
      $('contact-form').reset();
      $('contact-success-overlay').hidden = false;
      $('contact-success-modal').classList.add('open');
      $('contact-success-modal').setAttribute('aria-hidden', 'false');
    })
    .catch((e) => {
      console.error('submitContact failed', e);
      alert('حصل خطأ وإحنا بنبعت رسالتك، حاول تاني أو تواصل معانا عبر واتساب.');
    })
    .finally(() => {
      btn.disabled = false; btn.textContent = 'إرسال';
    });
}
function closeContactSuccess(){
  $('contact-success-modal').classList.remove('open');
  $('contact-success-modal').setAttribute('aria-hidden', 'true');
  setTimeout(() => { $('contact-success-overlay').hidden = true; }, 180);
}

// ===== نافذة "اطلب صيانة" — بتبعت كل طلب كمستند مستقل جوه
// sz_data/_online_maint_requests_incoming/items (نفس فكرة الطلبات/الرسائل الأونلاين
// بالظبط)؛ البرنامج بيراجعها ويحوّلها لإذن استلام رسمي بيه رقم تتبع حقيقي =====
function openMaintRequest(){
  $('maint-overlay').hidden = false;
  $('maint-modal').classList.add('open');
  $('maint-modal').setAttribute('aria-hidden', 'false');
}
function closeMaintRequest(){
  $('maint-modal').classList.remove('open');
  $('maint-modal').setAttribute('aria-hidden', 'true');
  setTimeout(() => { $('maint-overlay').hidden = true; }, 180);
}
function submitMaintRequest(ev){
  ev.preventDefault();
  const btn = $('submit-maint-btn');
  btn.disabled = true; btn.textContent = 'جاري الإرسال...';

  const req = {
    device: $('mr-device').value.trim(),
    brand: $('mr-brand').value.trim(),
    model: $('mr-model').value.trim(),
    issue: $('mr-issue').value.trim(),
    customerName: $('mr-name').value.trim(),
    customerPhone: $('mr-phone').value.trim(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  db.collection('sz_data').doc('_online_maint_requests_incoming').collection('items').add(req)
    .then(() => {
      closeMaintRequest();
      $('maint-form').reset();
      $('maint-success-overlay').hidden = false;
      $('maint-success-modal').classList.add('open');
      $('maint-success-modal').setAttribute('aria-hidden', 'false');
    })
    .catch((e) => {
      console.error('submitMaintRequest failed', e);
      alert('حصل خطأ وإحنا بنبعت طلبك، حاول تاني أو تواصل معانا مباشرة عبر واتساب.');
    })
    .finally(() => {
      btn.disabled = false; btn.textContent = 'إرسال طلب الصيانة';
    });
}
function closeMaintSuccess(){
  $('maint-success-modal').classList.remove('open');
  $('maint-success-modal').setAttribute('aria-hidden', 'true');
  setTimeout(() => { $('maint-success-overlay').hidden = true; }, 180);
}

// ===== إعداد الصفحة =====
function applyBranding(){
  const name = window.STORE_NAME || 'المتجر الأونلاين';
  $('brand-name').textContent = name;
  const displayPhone = window.STORE_PHONE || (window.STORE_WHATSAPP ? window.STORE_WHATSAPP.replace(/^20/, '0') : '');
  if(window.STORE_PHONE){
    $('footer-phone').hidden = false;
    $('footer-phone').innerHTML = '📞 <span dir="ltr" class="mono-num">' + escapeHtml(window.STORE_PHONE) + '</span>';
  }
  const allPhones = [displayPhone, window.STORE_PHONE_2, window.STORE_PHONE_LANDLINE].filter(Boolean).join(' - ');
  if(allPhones){
    const hp = $('header-phone');
    if(hp){ hp.hidden = false; hp.textContent = allPhones; }
  }
  if(window.STORE_WHATSAPP){
    const a = $('footer-whatsapp');
    a.hidden = false;
    a.href = 'https://wa.me/' + window.STORE_WHATSAPP;
  }
}

function setSection(section){
  state.section = section;
  document.querySelectorAll('.section-tab').forEach((b) => b.classList.toggle('active', b.dataset.section === section));
  document.querySelectorAll('.main-nav-link[data-nav-section]').forEach((a) => a.classList.toggle('active', a.dataset.navSection === section));
  renderProducts();
}
function scrollToCatalog(){
  const el = $('main-content');
  if(el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function wireEvents(){
  document.querySelectorAll('.section-tab').forEach((btn) => {
    btn.addEventListener('click', () => setSection(btn.dataset.section));
  });
  document.querySelectorAll('.main-nav-link[data-nav-section]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      setSection(a.dataset.navSection);
      scrollToCatalog();
    });
  });
  $('hero-browse-btn').addEventListener('click', () => { setSection('devices'); scrollToCatalog(); });
  $('hero-maint-btn').addEventListener('click', openMaintRequest);
  $('maint-block-btn').addEventListener('click', openMaintRequest);
  $('maint-close').addEventListener('click', closeMaintRequest);
  $('maint-overlay').addEventListener('click', closeMaintRequest);
  $('maint-form').addEventListener('submit', submitMaintRequest);
  $('maint-success-close-btn').addEventListener('click', closeMaintSuccess);
  $('search-input').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderProducts();
  });
  $('contact-open-btn').addEventListener('click', openContact);
  $('contact-close').addEventListener('click', closeContact);
  $('contact-overlay').addEventListener('click', closeContact);
  $('contact-form').addEventListener('submit', submitContact);
  $('contact-success-close-btn').addEventListener('click', closeContactSuccess);
}

document.addEventListener('DOMContentLoaded', () => {
  loadCart();
  applyBranding();
  wireEvents();
  updateCartBadge();
  if(initFirebase()){ loadCatalog(); loadPromoBanner(); }
});
