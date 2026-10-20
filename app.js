/* Customer menu, waiter cart and the tiny client-side router. */
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const money = value => new Intl.NumberFormat('fa-IR').format(Math.round(Number(value) || 0));
  const num = value => new Intl.NumberFormat('fa-IR').format(Number(value) || 0);
  const timeLabel = value => new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  const CART_KEY = 'rost-cart-v1';
  const state = { data: null, category: 'all', query: '', cart: {}, table: '', guest: '', note: '', detail: null, detailQty: 1, lastOrder: null, admin: false };
  const storefront = $('#storefront');
  const adminView = $('#admin-view');
  const menuGrid = $('#menu-grid');
  const menuStatus = $('#menu-status');
  const emptyState = $('#empty-state');
  const searchInput = $('#menu-search');
  const cartBar = $('#cart-bar');
  const scrim = $('#scrim');

  /* ---------------- UI helpers ---------------- */
  let openSheetEl = null;
  let lastFocus = null;
  let toastTimer = null;
  let hideTimer = null;
  const focusableSelector = 'button:not([disabled]), [href], input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function openSheet(id) {
    const sheet = document.getElementById(id);
    if (!sheet) return;
    if (openSheetEl && openSheetEl !== sheet) closeSheet(true, false);
    clearTimeout(hideTimer);
    hideTimer = null;
    lastFocus = document.activeElement;
    sheet.hidden = false;
    void sheet.offsetHeight;
    requestAnimationFrame(() => sheet.classList.add('open'));
    scrim.hidden = false;
    document.body.classList.add('sheet-open');
    openSheetEl = sheet;
    const target = sheet.querySelector('[data-autofocus]') || sheet.querySelector(focusableSelector);
    setTimeout(() => { if (openSheetEl === sheet) target?.focus({ preventScroll: true }); }, 80);
  }

  function closeSheet(immediate = false, restoreFocus = true) {
    const sheet = openSheetEl;
    if (!sheet) { scrim.hidden = true; document.body.classList.remove('sheet-open'); return; }
    openSheetEl = null;
    sheet.classList.remove('open');
    scrim.hidden = true;
    document.body.classList.remove('sheet-open');
    const hide = () => { sheet.hidden = true; hideTimer = null; };
    clearTimeout(hideTimer);
    if (immediate) hide();
    else hideTimer = setTimeout(hide, 300);
    if (restoreFocus) lastFocus?.focus?.({ preventScroll: true });
  }

  function toast(message) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  window.CafeUI = { openSheet, closeSheet, toast, money, num, timeLabel, esc };

  /* ---------------- cart persistence ---------------- */
  function readCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const cart = {};
      if (parsed && typeof parsed === 'object') {
        Object.keys(parsed).forEach(id => {
          const qty = Number(parsed[id]);
          if (typeof id === 'string' && Number.isSafeInteger(qty) && qty > 0) cart[id] = Math.min(qty, 20);
        });
      }
      return cart;
    } catch { return {}; }
  }
  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(state.cart)); } catch { /* private mode */ }
  }
  state.cart = readCart();

  /* ---------------- menu rendering ---------------- */
  function applySettings() {
    const settings = state.data.settings;
    $$('[data-setting]').forEach(el => {
      const key = el.dataset.setting;
      if (settings[key] !== undefined) el.textContent = settings[key];
    });
    document.title = `${settings.name} | منوی کافه`;
    updateTableChip();
    const notice = $('#notice-banner');
    notice.hidden = !settings.notice.trim();
    notice.textContent = settings.notice;
    renderFooter();
    renderCart();
  }

  function updateTableChip() {
    const chip = $('#head-table');
    if (!chip) return;
    chip.hidden = !state.table;
    if (state.table) $('#head-table-text').textContent = `میز ${state.table}`;
  }

  function renderFooter() {
    const settings = state.data.settings;
    const links = [];
    const phone = String(settings.phone || '').trim();
    if (phone) {
      const dial = phone.replace(/[^\d+]/g, '');
      if (dial) links.push(`<a href="tel:${esc(dial)}">تماس با کافه</a>`);
    }
    const instagram = String(settings.instagram || '').trim().replace(/^@/, '');
    if (/^[A-Za-z0-9._]{1,30}$/.test(instagram)) {
      links.push(`<a href="https://instagram.com/${esc(instagram)}" target="_blank" rel="noopener noreferrer">اینستاگرام</a>`);
    }
    const whatsapp = whatsappNumber();
    if (whatsapp) links.push(`<a href="https://wa.me/${whatsapp}" target="_blank" rel="noopener noreferrer">واتساپ کافه</a>`);
    $('#foot-links').innerHTML = links.join('');
  }

  function renderCategories() {
    const root = $('#category-list');
    const categories = [{ id: 'all', name: 'همهٔ منو', icon: '✦' }, ...state.data.categories];
    root.innerHTML = categories.map(category => `<button type="button" class="cat-chip" data-category="${esc(category.id)}" aria-pressed="${state.category === category.id}"><span aria-hidden="true">${esc(category.icon || '✦')}</span>${esc(category.name)}</button>`).join('');
  }

  function itemCard(item) {
    const closed = !state.data.settings.ordersOpen;
    const action = !item.available
      ? '<span class="sold-note">ناموجود</span>'
      : closed
        ? '<span class="sold-note">سفارش بسته است</span>'
        : `<button class="add-btn" type="button" data-add="${esc(item.id)}" aria-label="افزودن ${esc(item.name)} به سفارش">+</button>`;
    return `<article class="item-card${item.available ? '' : ' is-out'}">
      <button class="item-main" type="button" data-open="${esc(item.id)}" aria-label="${esc(item.name)} — دیدن جزئیات">
        <span class="item-thumb">
          <img src="${esc(item.image)}" alt="" width="96" height="96" loading="lazy">
          ${item.popular && item.available ? '<span class="badge">محبوب</span>' : ''}
        </span>
        <span class="item-body">
          <span class="item-name">${esc(item.name)}</span>
          <span class="item-desc">${esc(item.description)}</span>
          <span class="price">${money(item.price)} <small>تومان</small></span>
        </span>
      </button>
      <div class="item-action">${action}</div>
    </article>`;
  }

  function renderMenu() {
    if (!state.data) return;
    const query = MenuStore.normalize(state.query);
    const visible = state.data.items.filter(item =>
      (state.category === 'all' || item.category === state.category) &&
      (!query || MenuStore.normalize(`${item.name} ${item.description}`).includes(query))
    );
    const groups = state.data.categories
      .map(category => ({ category, items: visible.filter(item => item.category === category.id) }))
      .filter(group => group.items.length);

    menuGrid.innerHTML = groups.map(group => `<section class="menu-group" aria-label="${esc(group.category.name)}">
      <div class="group-head">
        <h3><span aria-hidden="true">${esc(group.category.icon || '✦')}</span>${esc(group.category.name)}</h3>
        <span class="group-line" aria-hidden="true"></span>
        <span class="group-count">${num(group.items.length)}</span>
      </div>
      <div class="group-items">${group.items.map(itemCard).join('')}</div>
    </section>`).join('');

    $('#menu-loading').hidden = true;
    emptyState.hidden = visible.length > 0;
    $('#menu-count').textContent = query ? `${num(visible.length)} نتیجه` : `${num(visible.length)} آیتم`;
    menuStatus.textContent = visible.length ? `${num(visible.length)} آیتم نمایش داده شد.` : 'نتیجه‌ای پیدا نشد.';
    $('#search-clear').hidden = !state.query;
  }

  /* ---------------- item sheet ---------------- */
  function openItem(id) {
    const item = state.data.items.find(entry => entry.id === id);
    if (!item) return;
    state.detail = item;
    state.detailQty = 1;
    renderItemSheet();
    openSheet('item-sheet');
  }

  function renderItemSheet() {
    const item = state.detail;
    if (!item) return;
    const body = $('#item-sheet-body');
    const closed = !state.data.settings.ordersOpen;
    const canAdd = item.available && !closed;
    const lineTotal = item.price * state.detailQty;
    $('#item-sheet-title').textContent = item.name;
    body.innerHTML = `<div class="item-hero">
        <img src="${esc(item.image)}" alt="${esc(item.name)}">
        ${item.popular && item.available ? '<span class="badge">محبوب</span>' : ''}
        ${item.available ? '' : '<span class="badge badge-out">ناموجود</span>'}
      </div>
      <p class="item-info-desc">${esc(item.description) || 'بدون توضیح.'}</p>
      <div class="qty-row">
        <span class="qty-price">${money(item.price)} <small>تومان</small></span>
        <div class="qty">
          <button type="button" data-detail-dec aria-label="کم کردن تعداد"${state.detailQty <= 1 ? ' disabled' : ''}>−</button>
          <output aria-live="polite">${num(state.detailQty)}</output>
          <button type="button" data-detail-inc aria-label="زیاد کردن تعداد"${state.detailQty >= 20 ? ' disabled' : ''}>+</button>
        </div>
      </div>
      <div class="sheet-actions">
        ${canAdd
          ? `<button class="btn btn-dark btn-wide" type="button" data-detail-add>افزودن به سفارش · ${money(lineTotal)} تومان</button>`
          : `<button class="btn btn-wide" type="button" disabled>${item.available ? 'سفارش از منو بسته است' : 'این آیتم فعلاً ناموجود است'}</button>`}
      </div>`;
  }

  /* ---------------- cart ---------------- */
  function cartLines() {
    if (!state.data) return [];
    return Object.keys(state.cart).map(id => {
      const item = state.data.items.find(entry => entry.id === id);
      const qty = state.cart[id];
      return item ? { item, qty } : null;
    }).filter(Boolean);
  }

  function cartTotals() {
    const lines = cartLines();
    return { lines, count: lines.reduce((sum, line) => sum + line.qty, 0), total: lines.reduce((sum, line) => sum + line.item.price * line.qty, 0) };
  }

  function renderCart() {
    if (!state.data) return;
    const { lines, count, total } = cartTotals();
    const badge = $('#cart-count');
    badge.hidden = count === 0;
    badge.textContent = num(count);
    $('#cart-bar-count').textContent = num(count);
    $('#cart-bar-total').textContent = `${money(total)} تومان`;
    cartBar.hidden = count === 0 || state.admin;
    $('#cart-total').textContent = `${money(total)} تومان`;

    const body = $('#cart-body');
    body.innerHTML = lines.map(({ item, qty }) => `<div class="cart-line">
        <img src="${esc(item.image)}" alt="" width="54" height="54" loading="lazy">
        <div>
          <div class="cart-line-name">${esc(item.name)}</div>
          <div class="cart-line-meta">${money(item.price)} تومان${item.available ? '' : ' · ناموجود شد'}</div>
        </div>
        <div class="cart-line-side">
          <span class="cart-line-total">${money(item.price * qty)}</span>
          <div class="qty">
            <button type="button" data-cart-dec="${esc(item.id)}" aria-label="کم کردن ${esc(item.name)}">−</button>
            <output>${num(qty)}</output>
            <button type="button" data-cart-inc="${esc(item.id)}" aria-label="زیاد کردن ${esc(item.name)}">+</button>
          </div>
        </div>
      </div>`).join('');

    const isEmpty = lines.length === 0;
    $('#cart-empty').hidden = !isEmpty;
    $('#order-form').hidden = isEmpty;
    $('#open-my-orders').hidden = OrderStore.myIds().length === 0;
    const closed = !state.data.settings.ordersOpen;
    $('#closed-banner').hidden = !closed;
    const blocked = lines.some(line => !line.item.available);
    $('#submit-order').disabled = closed || blocked;
  }

  function addToCart(id, qty = 1) {
    if (!state.data?.settings.ordersOpen) { toast('سفارش از منو فعلاً بسته است.'); return; }
    const item = state.data.items.find(entry => entry.id === id);
    if (!item || !item.available) { toast('این آیتم فعلاً ناموجود است.'); return; }
    state.cart[id] = Math.min((state.cart[id] || 0) + qty, 20);
    saveCart();
    renderCart();
    toast(`${item.name} به سفارش اضافه شد`);
  }

  function changeCart(id, delta) {
    if (!state.cart[id]) return;
    state.cart[id] += delta;
    if (state.cart[id] <= 0) delete state.cart[id];
    saveCart();
    renderCart();
  }

  function openCart() {
    if (!state.data) return;
    renderCart();
    $('#table-input').value = state.table;
    $('#name-input').value = state.guest;
    $('#note-input').value = state.note;
    openSheet('cart-sheet');
  }

  function submitOrder() {
    if (!state.data) return;
    const { lines, total } = cartTotals();
    if (!lines.length) { toast('سبد سفارش خالی است.'); return; }
    if (!state.data.settings.ordersOpen) { toast('سفارش از منو بسته است.'); return; }
    if (lines.some(line => !line.item.available)) { toast('یکی از آیتم‌ها ناموجود شده؛ آن را از سبد بردار.'); return; }
    const table = $('#table-input').value.trim().slice(0, 10);
    if (!table) { toast('شمارهٔ میز رو وارد کن.'); $('#table-input').focus(); return; }
    state.table = table;
    state.guest = $('#name-input').value.trim().slice(0, 24);
    state.note = $('#note-input').value.trim().slice(0, 200);
    const note = [state.guest ? `نام: ${state.guest}` : '', state.note].filter(Boolean).join(' — ').slice(0, 200);
    try {
      const order = OrderStore.add({
        code: OrderStore.makeCode(),
        table,
        note,
        items: lines.map(line => ({ id: line.item.id, name: line.item.name, price: line.item.price, qty: line.qty }))
      });
      if (order.total !== total) throw new Error('جمع سفارش با منو هم‌خوان نیست.');
      OrderStore.rememberMine(order.id);
      state.cart = {};
      state.lastOrder = order;
      saveCart();
      renderCart();
      closeSheet(true, false);
      showSuccess(order);
    } catch (error) {
      toast(error.message || 'ثبت سفارش انجام نشد.');
    }
  }

  function statusPill(status) {
    const labels = OrderStore.STATUS_LABELS;
    return `<span class="status-pill status-${esc(status)}">${esc(labels[status] || status)}</span>`;
  }

  function whatsappNumber() {
    const digits = String(state.data?.settings.whatsapp || '').replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 ? digits : '';
  }

  function orderMessage(order) {
    const lines = [
      `سفارش ${order.code} — کافه ${state.data.settings.name}`,
      `میز: ${order.table}`,
      ...order.items.map(line => `${line.qty} × ${line.name} = ${line.price * line.qty} تومان`),
      `مجموع: ${order.total} تومان`
    ];
    if (order.note) lines.push(`توضیح: ${order.note}`);
    return lines.join('\n');
  }

  function showSuccess(order) {
    $('#success-body').innerHTML = `<div class="success-wrap">
        <div class="success-check" aria-hidden="true">✓</div>
        <h2 id="success-title">سفارش ثبت شد</h2>
        <p>برای ویتر فرستادیم؛ چند لحظه دیگه سر میزت میاد.</p>
        <div class="order-code">
          <span>کد سفارش</span>
          <strong>${esc(order.code)}</strong>
          <small>میز ${esc(order.table)}${state.guest ? ` · ${esc(state.guest)}` : ''}</small>
        </div>
        <div id="success-status">${statusPill(order.status)}</div>
        <div class="success-list">
          ${order.items.map(line => `<div><span>${num(line.qty)} × ${esc(line.name)}</span><span>${money(line.price * line.qty)}</span></div>`).join('')}
        </div>
        <div class="success-total"><span>مجموع</span><span>${money(order.total)} تومان</span></div>
        <div class="success-actions">
          ${whatsappNumber() ? `<a class="btn btn-dark btn-wide" href="https://wa.me/${whatsappNumber()}?text=${encodeURIComponent(orderMessage(order))}" target="_blank" rel="noopener noreferrer">ارسال سفارش در واتساپ</a>` : ''}
          <button class="btn ${whatsappNumber() ? '' : 'btn-dark'} btn-wide" type="button" data-track-order>پیگیری سفارش</button>
          <button class="btn btn-wide" type="button" data-close>بستن</button>
        </div>
      </div>`;
    openSheet('success-sheet');
  }

  function refreshSuccessStatus() {
    if (!state.lastOrder || $('#success-sheet').hidden) return;
    const saved = OrderStore.list().find(order => order.id === state.lastOrder.id);
    if (!saved) return;
    state.lastOrder = saved;
    const holder = $('#success-status');
    if (holder) holder.innerHTML = statusPill(saved.status);
  }

  function renderMyOrders() {
    const ids = OrderStore.myIds();
    const orders = OrderStore.list().filter(order => ids.includes(order.id));
    const body = $('#my-orders-body');
    if (!orders.length) {
      body.innerHTML = '<div class="cart-empty"><span aria-hidden="true">🧾</span><p>هنوز سفارشی ثبت نکردی.</p></div>';
      return;
    }
    body.innerHTML = orders.map(order => `<article class="my-order">
        <div class="my-order-head">
          <strong>سفارش ${esc(order.code)}</strong>
          ${statusPill(order.status)}
          <time>${timeLabel(order.createdAt)}</time>
        </div>
        <p>میز ${esc(order.table)} · ${order.items.map(line => `${num(line.qty)}× ${esc(line.name)}`).join('، ')}</p>
        <div class="my-order-total"><span>${money(order.total)} تومان</span><span>${esc(OrderStore.STATUS_LABELS[order.status])}</span></div>
      </article>`).join('');
  }

  /* ---------------- routes ---------------- */
  function isAdminRoute() {
    if (new URLSearchParams(location.search).get('admin') === '1') return true;
    const hash = decodeURIComponent(location.hash.replace(/^#\/?/, '')).toLowerCase();
    return hash === 'admin' || hash === '!admin' || hash === 'panel' || hash.startsWith('admin/') || hash.startsWith('admin?');
  }

  function route() {
    const admin = isAdminRoute();
    state.admin = admin;
    storefront.hidden = admin;
    adminView.hidden = !admin;
    closeSheet(true, false);
    if (admin) {
      cartBar.hidden = true;
      window.scrollTo({ top: 0, behavior: 'auto' });
      window.CafeAdmin?.enter();
      if (state.data) document.title = `پنل مدیریت | ${state.data.settings.name}`;
    } else {
      renderCart();
      if (state.data) document.title = `${state.data.settings.name} | منوی کافه`;
    }
  }

  function bindEvents() {
    $('#category-list').addEventListener('click', event => {
      const button = event.target.closest('[data-category]');
      if (!button) return;
      state.category = button.dataset.category;
      $$('#category-list .cat-chip').forEach(chip => chip.setAttribute('aria-pressed', String(chip === button)));
      renderMenu();
      button.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    });

    menuGrid.addEventListener('click', event => {
      const add = event.target.closest('[data-add]');
      if (add) { addToCart(add.dataset.add); return; }
      const open = event.target.closest('[data-open]');
      if (open) openItem(open.dataset.open);
    });

    searchInput.addEventListener('input', () => { state.query = searchInput.value; renderMenu(); });
    $('#search-clear').addEventListener('click', () => {
      searchInput.value = '';
      state.query = '';
      renderMenu();
      searchInput.focus();
    });
    $('#reset-search').addEventListener('click', () => {
      searchInput.value = '';
      state.query = '';
      state.category = 'all';
      renderCategories();
      renderMenu();
    });

    $('#cart-trigger').addEventListener('click', openCart);
    $('#cart-bar-btn').addEventListener('click', openCart);

    $('#cart-body').addEventListener('click', event => {
      const inc = event.target.closest('[data-cart-inc]');
      if (inc) { changeCart(inc.dataset.cartInc, 1); return; }
      const dec = event.target.closest('[data-cart-dec]');
      if (dec) changeCart(dec.dataset.cartDec, -1);
    });

    $('#order-form').addEventListener('submit', event => { event.preventDefault(); submitOrder(); });
    $('#table-input').addEventListener('input', event => { state.table = event.target.value.trim().slice(0, 10); updateTableChip(); });
    $('#name-input').addEventListener('input', event => { state.guest = event.target.value.trim().slice(0, 24); });
    $('#note-input').addEventListener('input', event => { state.note = event.target.value.trim().slice(0, 200); });

    $('#item-sheet-body').addEventListener('click', event => {
      if (event.target.closest('[data-detail-inc]')) { state.detailQty = Math.min(20, state.detailQty + 1); renderItemSheet(); }
      else if (event.target.closest('[data-detail-dec]')) { state.detailQty = Math.max(1, state.detailQty - 1); renderItemSheet(); }
      else if (event.target.closest('[data-detail-add]')) { addToCart(state.detail.id, state.detailQty); closeSheet(); }
    });

    $('#success-body').addEventListener('click', event => {
      if (!event.target.closest('[data-track-order]')) return;
      renderMyOrders();
      closeSheet(true, false);
      openSheet('my-orders-sheet');
    });
    $('#open-my-orders').addEventListener('click', () => { renderMyOrders(); closeSheet(true, false); openSheet('my-orders-sheet'); });

    document.addEventListener('click', event => {
      if (event.target.closest('[data-close]')) closeSheet();
    });
    scrim.addEventListener('click', () => closeSheet());
    document.addEventListener('keydown', event => {
      if (!openSheetEl) return;
      if (event.key === 'Escape') { event.preventDefault(); closeSheet(); return; }
      if (event.key !== 'Tab') return;
      const controls = Array.from(openSheetEl.querySelectorAll(focusableSelector)).filter(el => el.getClientRects().length > 0);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    document.addEventListener('keydown', event => {
      if (state.admin) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchInput.focus(); }
    });

    window.addEventListener('hashchange', route);
    window.addEventListener('rost:menu-changed', refreshMenu);
    window.addEventListener('rost:orders-changed', () => {
      refreshSuccessStatus();
      if (!$('#my-orders-sheet').hidden) renderMyOrders();
      renderCart();
    });
    window.addEventListener('storage', event => {
      if (event.key === MenuStore.MENU_KEY) refreshMenu();
      if (event.key === MenuStore.ORDERS_KEY) { refreshSuccessStatus(); renderCart(); }
    });
  }

  async function refreshMenu() {
    try {
      const result = await MenuStore.load();
      state.data = result.data;
      if (state.category !== 'all' && !state.data.categories.some(category => category.id === state.category)) state.category = 'all';
      Object.keys(state.cart).forEach(id => {
        if (!state.data.items.some(item => item.id === id)) delete state.cart[id];
      });
      saveCart();
      applySettings();
      renderCategories();
      renderMenu();
      renderCart();
    } catch (error) { console.error(error); }
  }

  async function init() {
    const table = new URLSearchParams(location.search).get('table');
    if (table) state.table = table.trim().slice(0, 10);
    bindEvents();
    try {
      const result = await MenuStore.load();
      state.data = result.data;
      applySettings();
      renderCategories();
      renderMenu();
      renderCart();
      if (result.fallback && location.protocol !== 'file:') {
        const notice = $('#notice-banner');
        if (!state.data.settings.notice) {
          notice.hidden = false;
          notice.textContent = 'منوی همراه سایت نمایش داده می‌شود؛ برای قیمت روز از ویتر بپرس.';
        }
      }
    } catch (error) {
      $('#menu-loading').hidden = true;
      menuStatus.textContent = 'منو در دسترس نیست. صفحه را دوباره باز کن.';
      console.error(error);
    }
    route();
  }

  init();
})();
