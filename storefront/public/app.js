// ============================================================
// المتجر الأونلاين — المنطق الكامل
// بيقرا كتالوج المنتجات من Firestore (مستند sz_data/_online_catalog، اللي
// البرنامج بيحدّثه تلقائي)، وبيبعت أي طلب جديد كمستند مستقل جوه
// sz_data/_online_orders_incoming/items — البرنامج هو اللي بيراجعه ويأكّده
// ويحسب السعر النهائي، مش الموقع ده (الموقع بيوري تقدير بس).
// ============================================================

// نفس ترتيب المحافظات اللي في البرنامج بالظبط (مهم يفضل مطابق عشان مقارنة
// "الصعيد" تشتغل صح لو حد غيّر القايمة من البرنامج)
const EGYPT_GOVERNORATES = ['القاهرة','الجيزة','القليوبية','الإسكندرية','البحيرة','مطروح','كفر الشيخ','الدقهلية','دمياط','الشرقية','بورسعيد','الإسماعيلية','السويس','شمال سيناء','جنوب سيناء','الغربية','المنوفية','بني سويف','الفيوم','المنيا','أسيوط','سوهاج','قنا','الأقصر','أسوان','البحر الأحمر','الوادي الجديد'];

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
    populateGovernorates();
    renderProducts();
  }).catch((e) => {
    console.error('loadCatalog failed', e);
    showOffline();
  });
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
function productCardHtml(p){
  const inStock = (p.qty || 0) > 0;
  const inCart = state.cart[p.id] || 0;
  const thumbInner = p.image
    ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" onerror="this.remove()">`
    : `<span class="thumb-ph">PRODUCT 1:1</span>`;
  return `
    <div class="product-card" data-id="${escapeHtml(p.id)}">
      <div class="stock-strip ${inStock ? '' : 'out'}">
        <span>${inStock ? 'متوفر' : 'غير متوفر'}</span>
        ${p.brand ? `<span class="strip-brand" dir="ltr">${escapeHtml(p.brand)}</span>` : ''}
      </div>
      <div class="product-thumb ${p.image ? 'has-image' : ''}">
        ${thumbInner}
      </div>
      <div class="product-info">
        <div class="product-name">${escapeHtml(p.name)}</div>
        <div class="product-code" dir="ltr">${escapeHtml(p.id)}</div>
        <div class="product-bottom">
          <span class="product-price">${fmtMoney(p.price)}</span>
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
  saveCart(); renderProducts(); renderCart();
}
function cartRemove(id){
  const have = state.cart[id] || 0;
  if(have <= 1) delete state.cart[id];
  else state.cart[id] = have - 1;
  saveCart(); renderProducts(); renderCart();
}
function cartLines(){
  return Object.keys(state.cart)
    .map((id) => ({ p: findProduct(id), qty: state.cart[id] }))
    .filter((l) => l.p && l.qty > 0);
}
function cartHasLargeItem(lines){
  return lines.some((l) => l.p.shipSize === 'large');
}
function estimateShipping(lines, governorate){
  const shipping = (state.catalog && state.catalog.shipping) || { std:{customer:60}, high:{customer:75}, saeedGovs:[] };
  const isSaeed = governorate && shipping.saeedGovs && shipping.saeedGovs.indexOf(governorate) > -1;
  const tier = (cartHasLargeItem(lines) || isSaeed) ? 'high' : 'std';
  const shipCustomer = tier === 'high' ? (shipping.high.customer || 0) : (shipping.std.customer || 0);
  return { tier, shipCustomer };
}
function cartTotals(governorate){
  const lines = cartLines();
  const itemsTotal = lines.reduce((sum, l) => sum + l.p.price * l.qty, 0);
  const { shipCustomer } = estimateShipping(lines, governorate || $('f-gov').value);
  return { lines, itemsTotal, shipCustomer, grandTotal: itemsTotal + (lines.length ? shipCustomer : 0) };
}
function updateCartBadge(){
  const count = Object.values(state.cart).reduce((a, b) => a + b, 0);
  const badge = $('cart-count');
  if(count > 0){ badge.textContent = count; badge.hidden = false; }
  else badge.hidden = true;
}
function renderCart(){
  updateCartBadge();
  const { lines, itemsTotal, shipCustomer, grandTotal } = cartTotals();
  $('cart-empty').hidden = lines.length !== 0;
  $('cart-summary').hidden = lines.length === 0;
  $('cart-items').innerHTML = lines.map((l) => `
    <div class="cart-line">
      <div class="cart-line-thumb">${l.p.image ? `<img src="${escapeHtml(l.p.image)}" alt="" onerror="this.remove()">` : escapeHtml((l.p.name||'؟').charAt(0).toUpperCase())}</div>
      <div class="cart-line-info">
        <div class="cart-line-name">${escapeHtml(l.p.name)}</div>
        <div class="cart-line-price">${l.qty} × ${fmtMoney(l.p.price)}</div>
      </div>
      <button class="cart-line-remove" onclick="cartRemove('${l.p.id}')">إزالة</button>
    </div>`).join('');
  $('sum-items').textContent = fmtMoney(itemsTotal);
  $('sum-ship').textContent = fmtMoney(shipCustomer);
  $('sum-total').textContent = fmtMoney(grandTotal);
}

// ===== المحافظات =====
function populateGovernorates(){
  const sel = $('f-gov');
  if(sel.options.length) return; // اتعملت خلاص
  sel.innerHTML = '<option value="" disabled selected>اختر المحافظة</option>' +
    EGYPT_GOVERNORATES.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
}

// ===== الدرج/النوافذ =====
function openCart(){
  $('cart-overlay').hidden = false;
  $('cart-drawer').classList.add('open');
  $('cart-drawer').setAttribute('aria-hidden', 'false');
}
function closeCart(){
  $('cart-drawer').classList.remove('open');
  $('cart-drawer').setAttribute('aria-hidden', 'true');
  setTimeout(() => { $('cart-overlay').hidden = true; }, 200);
}
function openCheckout(){
  if(!cartLines().length) return;
  closeCart();
  renderCheckoutSummary();
  $('checkout-overlay').hidden = false;
  $('checkout-modal').classList.add('open');
  $('checkout-modal').setAttribute('aria-hidden', 'false');
}
function closeCheckout(){
  $('checkout-modal').classList.remove('open');
  $('checkout-modal').setAttribute('aria-hidden', 'true');
  setTimeout(() => { $('checkout-overlay').hidden = true; }, 180);
}
function renderCheckoutSummary(){
  const { itemsTotal, shipCustomer, grandTotal } = cartTotals();
  $('checkout-summary').innerHTML = `
    <div class="sum-row"><span>الأصناف</span><strong>${fmtMoney(itemsTotal)}</strong></div>
    <div class="sum-row"><span>الشحن (تقديري)</span><strong>${fmtMoney(shipCustomer)}</strong></div>
    <div class="sum-row sum-total"><span>الإجمالي التقديري</span><strong>${fmtMoney(grandTotal)}</strong></div>`;
}

// ===== إرسال الطلب =====
function submitOrder(ev){
  ev.preventDefault();
  const lines = cartLines();
  if(!lines.length) return;
  const btn = $('submit-order-btn');
  btn.disabled = true; btn.textContent = 'جاري الإرسال...';

  const order = {
    customerName: $('f-name').value.trim(),
    customerPhone: $('f-phone').value.trim(),
    governorate: $('f-gov').value,
    address: $('f-address').value.trim(),
    notes: $('f-notes').value.trim(),
    payMethod: document.querySelector('input[name="pay"]:checked').value,
    items: lines.map((l) => ({ code: l.p.id, name: l.p.name, qty: l.qty })),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  db.collection('sz_data').doc('_online_orders_incoming').collection('items').add(order)
    .then((ref) => {
      state.cart = {};
      saveCart(); renderProducts(); renderCart();
      closeCheckout();
      $('order-ref').innerHTML = 'رقم مرجعي: <span dir="ltr" class="mono-num">' + escapeHtml(ref.id.slice(-6).toUpperCase()) + '</span>';
      $('checkout-form').reset();
      $('success-overlay').hidden = false;
      $('success-modal').classList.add('open');
      $('success-modal').setAttribute('aria-hidden', 'false');
    })
    .catch((e) => {
      console.error('submitOrder failed', e);
      alert('حصل خطأ وإحنا بنبعت طلبك، حاول تاني أو تواصل معانا مباشرة.');
    })
    .finally(() => {
      btn.disabled = false; btn.textContent = 'تأكيد الطلب';
    });
}
function closeSuccess(){
  $('success-modal').classList.remove('open');
  $('success-modal').setAttribute('aria-hidden', 'true');
  setTimeout(() => { $('success-overlay').hidden = true; }, 180);
}

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

// ===== إعداد الصفحة =====
function applyBranding(){
  const name = window.STORE_NAME || 'المتجر الأونلاين';
  document.title = name;
  $('page-title').textContent = name;
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
  $('hero-maint-btn').addEventListener('click', openContact);
  $('maint-block-btn').addEventListener('click', openContact);
  $('search-input').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderProducts();
  });
  $('cart-btn').addEventListener('click', openCart);
  $('cart-close').addEventListener('click', closeCart);
  $('cart-overlay').addEventListener('click', closeCart);
  $('checkout-btn').addEventListener('click', openCheckout);
  $('checkout-close').addEventListener('click', closeCheckout);
  $('checkout-overlay').addEventListener('click', closeCheckout);
  $('f-gov').addEventListener('change', renderCheckoutSummary);
  $('checkout-form').addEventListener('submit', submitOrder);
  $('success-close-btn').addEventListener('click', closeSuccess);
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
  if(initFirebase()) loadCatalog();
});
