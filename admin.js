/* Owner panel: live waiter orders, menu editing and cafe settings.
   The PIN is a local convenience lock, not real authentication. */
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = window.CafeUI?.esc || (value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])));
  const money = value => new Intl.NumberFormat('fa-IR').format(Math.round(Number(value) || 0));
  const num = value => new Intl.NumberFormat('fa-IR').format(Number(value) || 0);
  const timeLabel = value => new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  const SESSION_KEY = 'rost-admin-session';
  const ATTEMPTS_KEY = 'rost-admin-attempts';
  const DEFAULT_PIN = '1234';
  const ORDER_FILTERS = [['all', 'همه'], ['new', 'جدید'], ['preparing', 'در حال آماده‌سازی'], ['served', 'تحویل‌شده'], ['canceled', 'لغو‌شده']];
  const IMAGES = [
    ['assets/items/espresso.jpg', 'اسپرسو'], ['assets/items/americano.jpg', 'آمریکانو'], ['assets/items/latte.jpg', 'لاته'],
    ['assets/items/mocha.jpg', 'موکا'], ['assets/coffee.jpg', 'نوشیدنی سرد'], ['assets/items/coldbrew.jpg', 'کلدبرو'],
    ['assets/items/lemonade.jpg', 'لیموناد'], ['assets/brunch.jpg', 'کروسان'], ['assets/items/avocado.jpg', 'آووکادو'],
    ['assets/items/pancake.jpg', 'پنکیک'], ['assets/items/club.jpg', 'ساندویچ'], ['assets/dessert.jpg', 'کیک'],
    ['assets/items/cheesecake.jpg', 'چیزکیک'], ['assets/items/brownie.jpg', 'براونی'], ['assets/hero-cafe.jpg', 'کافه']
  ];

  let data = null;
  let ready = false;
  let activeTab = 'orders';
  let menuQuery = '';
  let orderFilter = 'all';
  let lastNewCount = -1;
  let editorId = null;

  const hashPin = value => {
    let hash = 2166136261;
    const source = `rost:${value}`;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  };

  function readPasswordHash() {
    try { return localStorage.getItem(MenuStore.PIN_KEY); } catch { return null; }
  }
  function verifyPin(value) {
    const stored = readPasswordHash();
    return hashPin(value) === (stored || hashPin(DEFAULT_PIN));
  }
  function updateHint() {
    const custom = Boolean(readPasswordHash());
    $('#login-hint').textContent = custom ? 'رمز مدیر توسط صاحب کافه تنظیم شده است.' : 'رمز پیش‌فرض: 1234 — بعد از ورود از بخش «کافه» عوضش کن.';
  }

  function isAuthed() {
    try { return sessionStorage.getItem(SESSION_KEY) === 'ok'; } catch { return false; }
  }
  function setAuthed(value) {
    try { value ? sessionStorage.setItem(SESSION_KEY, 'ok') : sessionStorage.removeItem(SESSION_KEY); } catch { /* private mode */ }
  }

  function readAttempts() {
    try { return JSON.parse(sessionStorage.getItem(ATTEMPTS_KEY)) || { fails: 0, until: 0 }; } catch { return { fails: 0, until: 0 }; }
  }
  function writeAttempts(value) {
    try { sessionStorage.setItem(ATTEMPTS_KEY, JSON.stringify(value)); } catch { /* ignore */ }
  }

  const toast = message => window.CafeUI?.toast(message);
  const openSheet = id => window.CafeUI?.openSheet(id);
  const closeSheet = () => window.CafeUI?.closeSheet();

  function setError(message) {
    const box = $('#login-error');
    box.hidden = !message;
    box.textContent = message || '';
  }

  function onLogin(event) {
    event.preventDefault();
    const input = $('#admin-pin');
    const attempts = readAttempts();
    if (attempts.until > Date.now()) {
      const seconds = Math.ceil((attempts.until - Date.now()) / 1000);
      setError(`برای امنیت، ${num(seconds)} ثانیه دیگر دوباره امتحان کن.`);
      return;
    }
    const value = input.value.trim();
    if (!value) { setError('رمز را وارد کن.'); input.focus(); return; }
    if (!verifyPin(value)) {
      const fails = attempts.fails + 1;
      if (fails >= 5) {
        writeAttempts({ fails: 0, until: Date.now() + 30000 });
        setError('پنج بار اشتباه شد؛ ۳۰ ثانیه صبر کن.');
      } else {
        writeAttempts({ fails, until: 0 });
        setError(`رمز درست نیست. ${num(5 - fails)} تلاش دیگر باقی مانده.`);
      }
      input.select();
      return;
    }
    writeAttempts({ fails: 0, until: 0 });
    setError('');
    input.value = '';
    setAuthed(true);
    showApp();
  }

  function showLogin() {
    $('#admin-app').hidden = true;
    $('#admin-login').hidden = false;
    setError('');
    updateHint();
    setTimeout(() => $('#admin-pin')?.focus({ preventScroll: true }), 120);
  }

  function showApp() {
    $('#admin-login').hidden = true;
    $('#admin-app').hidden = false;
    updateHint();
    if (!ready) loadData();
    else { renderStats(); renderOrders(); }
  }

  function enter() {
    if (!isAuthed()) { showLogin(); return; }
    showApp();
  }

  function logout() {
    setAuthed(false);
    showLogin();
    $('#admin-pin').value = '';
    toast('از پنل خارج شدی.');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  async function loadData() {
    $('#orders-list').innerHTML = '<div class="admin-empty"><span aria-hidden="true">⏳</span>در حال خواندن سفارش‌ها…</div>';
    try {
      const result = await MenuStore.load();
      data = result.data;
      ready = true;
      renderAll();
    } catch (error) {
      console.error(error);
      $('#orders-list').innerHTML = '<div class="admin-empty"><span aria-hidden="true">!</span>اطلاعات منو خوانده نشد.</div>';
      toast('اطلاعات منو خوانده نشد.');
    }
  }

  function renderAll() {
    renderStats();
    renderOrderFilters();
    renderOrders();
    renderMenuList();
    renderCategories();
    fillSettings();
    lastNewCount = newOrderCount();
  }

  function newOrderCount() {
    return OrderStore.list().filter(order => order.status === 'new').length;
  }

  function renderStats() {
    const orders = OrderStore.list();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const today = orders.filter(order => order.createdAt >= start.getTime());
    const newCount = orders.filter(order => order.status === 'new').length;
    const sales = today.filter(order => order.status !== 'canceled').reduce((sum, order) => sum + order.total, 0);
    $('#stat-new').textContent = num(newCount);
    $('#stat-today').textContent = num(today.length);
    $('#stat-sales').textContent = money(sales);
    const badge = $('#orders-badge');
    badge.hidden = newCount === 0;
    badge.textContent = num(newCount);
    document.title = newCount ? `(${num(newCount)}) پنل مدیریت` : 'پنل مدیریت';
  }

  function renderOrderFilters() {
    const orders = OrderStore.list();
    $('#order-filters').innerHTML = ORDER_FILTERS.map(([id, label]) => {
      const count = id === 'all' ? orders.length : orders.filter(order => order.status === id).length;
      return `<button type="button" class="filter-chip" data-filter="${id}" aria-pressed="${orderFilter === id}">${label} <span>${num(count)}</span></button>`;
    }).join('');
  }

  function orderCard(order) {
    const labels = OrderStore.STATUS_LABELS;
    let actions = '';
    if (order.status === 'new') {
      actions = `<button class="btn btn-primary" type="button" data-order-status="preparing" data-order-id="${esc(order.id)}">شروع آماده‌سازی</button>
        <button class="btn" type="button" data-order-status="canceled" data-order-id="${esc(order.id)}">لغو</button>`;
    } else if (order.status === 'preparing') {
      actions = `<button class="btn btn-primary" type="button" data-order-status="served" data-order-id="${esc(order.id)}">تحویل شد</button>
        <button class="btn" type="button" data-order-status="canceled" data-order-id="${esc(order.id)}">لغو</button>`;
    }
    return `<article class="order-card" data-status="${esc(order.status)}">
      <div class="order-head">
        <span class="order-num">#${esc(order.code)}</span>
        <span class="order-table">میز ${esc(order.table)}</span>
        <time>${timeLabel(order.createdAt)}</time>
        <span class="status-pill status-${esc(order.status)}">${esc(labels[order.status])}</span>
      </div>
      <div class="order-items">
        ${order.items.map(line => `<div><span class="q">${num(line.qty)}×</span><span>${esc(line.name)}</span><span class="p">${money(line.price * line.qty)} تومان</span></div>`).join('')}
      </div>
      ${order.note ? `<p class="order-note">📝 ${esc(order.note)}</p>` : ''}
      <div class="order-foot">
        <span class="order-total">مجموع: ${money(order.total)} تومان</span>
        <div class="order-actions">${actions || '<span class="status-pill status-served">بسته شد</span>'}</div>
      </div>
    </article>`;
  }

  function renderOrders() {
    const orders = OrderStore.list().filter(order => orderFilter === 'all' || order.status === orderFilter);
    $('#orders-list').innerHTML = orders.length
      ? orders.map(orderCard).join('')
      : '<div class="admin-empty"><span aria-hidden="true">☕</span>سفارشی در این بخش نیست. وقتی مشتری سفارش بدهد، همین‌جا با صدا و نشان ظاهر می‌شود.</div>';
  }

  function renderMenuList() {
    if (!data) return;
    const query = MenuStore.normalize(menuQuery);
    const items = data.items.filter(item => !query || MenuStore.normalize(`${item.name} ${item.description}`).includes(query));
    $('#admin-menu-list').innerHTML = items.length ? items.map(item => {
      const category = data.categories.find(entry => entry.id === item.category);
      return `<article class="admin-item">
        <img src="${esc(item.image)}" alt="" width="52" height="52" loading="lazy">
        <div>
          <div class="admin-item-name">${esc(item.name)}${item.popular ? '<span class="badge-pop">محبوب</span>' : ''}${item.available ? '' : '<span class="badge-off">ناموجود</span>'}</div>
          <div class="admin-item-meta"><span>${esc(category?.name || 'بدون دسته')}</span><span><b>${money(item.price)}</b> تومان</span></div>
        </div>
        <div class="admin-item-actions">
          <input class="switch" type="checkbox" role="switch" data-availability="${esc(item.id)}" aria-label="موجودی ${esc(item.name)}"${item.available ? ' checked' : ''}>
          <button class="lite-btn" type="button" data-edit-item="${esc(item.id)}" aria-label="ویرایش ${esc(item.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m14.5 6.5 3 3"/></svg></button>
          <button class="lite-btn danger" type="button" data-delete-item="${esc(item.id)}" aria-label="حذف ${esc(item.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6.5 7l.8 12h9.4l.8-12M10 11v5M14 11v5"/></svg></button>
        </div>
      </article>`;
    }).join('') : '<div class="admin-empty"><span aria-hidden="true">⌕</span>آیتمی با این مشخصات پیدا نشد.</div>';
  }

  function renderCategories() {
    if (!data) return;
    $('#admin-categories').innerHTML = data.categories.map(category => {
      const count = data.items.filter(item => item.category === category.id).length;
      return `<div class="admin-cat-row">
        <span class="emoji" aria-hidden="true">${esc(category.icon || '✦')}</span>
        <strong>${esc(category.name)}</strong>
        <small>${num(count)} آیتم</small>
        <button class="lite-btn danger" type="button" data-delete-category="${esc(category.id)}" aria-label="حذف ${esc(category.name)}"${count ? ' disabled' : ''}>×</button>
      </div>`;
    }).join('') || '<p class="panel-note">هنوز دسته‌بندی‌ای نداری.</p>';
  }

  function fillSettings() {
    if (!data) return;
    const settings = data.settings;
    $('#set-name').value = settings.name;
    $('#set-eyebrow').value = settings.eyebrow;
    $('#set-description').value = settings.description;
    $('#set-hours').value = settings.hours;
    $('#set-phone').value = settings.phone || '';
    $('#set-whatsapp').value = settings.whatsapp || '';
    $('#set-notice').value = settings.notice || '';
    $('#set-orders-open').checked = settings.ordersOpen;
    const brand = $('.brand-light span:last-child');
    if (brand) brand.textContent = settings.name;
  }

  function selectTab(name) {
    activeTab = name;
    $$('[data-admin-tab]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.adminTab === name)));
    $$('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== name; });
    if (name === 'menu') renderMenuList();
    if (name === 'settings') { renderCategories(); fillSettings(); }
  }

  /* ---------------- item editor ---------------- */
  function imageOptions(selected) {
    const list = IMAGES.slice();
    if (selected && !list.some(([src]) => src === selected)) list.unshift([selected, 'تصویر فعلی']);
    return list.map(([src, label]) => `<label class="image-option" title="${esc(label)}">
        <input type="radio" name="edit-image" value="${esc(src)}"${src === selected ? ' checked' : ''}>
        <img src="${esc(src)}" alt="" loading="lazy">
        <span class="pick-ring" aria-hidden="true"></span>
        <span class="sr-only">${esc(label)}</span>
      </label>`).join('');
  }

  function openEditor(id) {
    if (!data) return;
    if (!data.categories.length) { toast('اول از بخش «کافه» یک دسته‌بندی اضافه کن.'); selectTab('settings'); return; }
    const item = id ? data.items.find(entry => entry.id === id) : null;
    editorId = item?.id || null;
    $('#item-editor-title').textContent = item ? 'ویرایش آیتم' : 'آیتم جدید';
    $('#edit-id').value = item?.id || '';
    $('#edit-name').value = item?.name || '';
    $('#edit-price').value = item?.price ?? '';
    $('#edit-description').value = item?.description || '';
    $('#edit-popular').checked = Boolean(item?.popular);
    $('#edit-available').checked = item ? item.available : true;
    $('#edit-category').innerHTML = data.categories.map(category => `<option value="${esc(category.id)}">${esc(category.name)}</option>`).join('');
    if (item) $('#edit-category').value = item.category;
    $('#image-picker').innerHTML = imageOptions(item?.image || IMAGES[0][0]);
    openSheet('item-editor');
  }

  function saveEditor(event) {
    event.preventDefault();
    if (!data) return;
    const name = $('#edit-name').value.trim();
    const price = Number($('#edit-price').value);
    const category = $('#edit-category').value;
    const description = $('#edit-description').value.trim();
    const image = $('input[name="edit-image"]:checked')?.value;
    if (!name) { toast('نام آیتم را وارد کن.'); $('#edit-name').focus(); return; }
    if (!Number.isSafeInteger(price) || price < 0) { toast('قیمت را درست وارد کن.'); $('#edit-price').focus(); return; }
    if (!category) { toast('دسته‌بندی را انتخاب کن.'); return; }
    if (!image) { toast('یک تصویر انتخاب کن.'); return; }
    const item = {
      id: editorId || `item-${Date.now().toString(36)}`,
      name, category, description, price, image,
      popular: $('#edit-popular').checked,
      available: $('#edit-available').checked
    };
    const items = editorId ? data.items.map(entry => entry.id === editorId ? item : entry) : [item, ...data.items];
    try {
      data = MenuStore.save({ ...data, items });
      closeSheet();
      toast(editorId ? 'آیتم به‌روزرسانی شد.' : 'آیتم به منو اضافه شد.');
      renderStats();
      renderMenuList();
      renderCategories();
    } catch (error) {
      toast(error.message || 'ذخیرهٔ آیتم انجام نشد.');
    }
  }

  /* ---------------- menu handlers ---------------- */
  function toggleAvailability(id, available) {
    if (!data) return;
    const items = data.items.map(item => item.id === id ? { ...item, available } : item);
    try {
      data = MenuStore.save({ ...data, items });
      toast(available ? 'آیتم موجود شد.' : 'آیتم ناموجود شد.');
      renderStats();
      renderMenuList();
    } catch (error) {
      toast(error.message || 'تغییر موجودی انجام نشد.');
      renderMenuList();
    }
  }

  function deleteItem(id) {
    if (!data) return;
    const item = data.items.find(entry => entry.id === id);
    if (!item) return;
    if (!confirm(`«${item.name}» از منو حذف شود؟`)) return;
    try {
      data = MenuStore.save({ ...data, items: data.items.filter(entry => entry.id !== id) });
      toast('آیتم حذف شد.');
      renderStats();
      renderMenuList();
      renderCategories();
    } catch (error) { toast(error.message || 'حذف انجام نشد.'); }
  }

  function saveSettings(event) {
    event.preventDefault();
    if (!data) return;
    const name = $('#set-name').value.trim();
    if (!name) { toast('نام کافه را وارد کن.'); $('#set-name').focus(); return; }
    const next = {
      ...data,
      settings: {
        ...data.settings,
        name,
        eyebrow: $('#set-eyebrow').value.trim(),
        description: $('#set-description').value.trim(),
        hours: $('#set-hours').value.trim(),
        phone: $('#set-phone').value.trim(),
        whatsapp: $('#set-whatsapp').value.trim(),
        notice: $('#set-notice').value.trim(),
        ordersOpen: $('#set-orders-open').checked
      }
    };
    try {
      data = MenuStore.save(next);
      toast('اطلاعات کافه ذخیره شد.');
      fillSettings();
    } catch (error) { toast(error.message || 'ذخیره انجام نشد.'); }
  }

  function addCategory(event) {
    event.preventDefault();
    if (!data) return;
    const name = $('#cat-name').value.trim();
    const icon = $('#cat-icon').value.trim() || '✦';
    if (!name) { toast('نام دسته را وارد کن.'); $('#cat-name').focus(); return; }
    if (data.categories.some(category => category.name.trim() === name)) { toast('این دسته از قبل وجود دارد.'); return; }
    try {
      data = MenuStore.save({ ...data, categories: [...data.categories, { id: `cat-${Date.now().toString(36)}`, name, icon }] });
      $('#cat-name').value = '';
      $('#cat-icon').value = '';
      toast('دسته‌بندی اضافه شد.');
      renderCategories();
    } catch (error) { toast(error.message || 'افزودن دسته انجام نشد.'); }
  }

  function deleteCategory(id) {
    if (!data) return;
    const category = data.categories.find(entry => entry.id === id);
    if (!category) return;
    const count = data.items.filter(item => item.category === id).length;
    if (count) { toast('اول آیتم‌های این دسته را جابه‌جا یا حذف کن.'); return; }
    if (!confirm(`دستهٔ «${category.name}» حذف شود؟`)) return;
    try {
      data = MenuStore.save({ ...data, categories: data.categories.filter(entry => entry.id !== id) });
      toast('دسته حذف شد.');
      renderCategories();
    } catch (error) { toast(error.message || 'حذف دسته انجام نشد.'); }
  }

  function savePin(event) {
    event.preventDefault();
    const current = $('#pin-current').value.trim();
    const next = $('#pin-new').value.trim();
    if (!verifyPin(current)) { toast('رمز فعلی درست نیست.'); $('#pin-current').focus(); return; }
    if (!/^\d{4,12}$/.test(next)) { toast('رمز جدید باید ۴ تا ۱۲ رقم باشد.'); $('#pin-new').focus(); return; }
    try {
      localStorage.setItem(MenuStore.PIN_KEY, hashPin(next));
      $('#pin-form').reset();
      updateHint();
      toast('رمز مدیر عوض شد.');
    } catch { toast('ذخیرهٔ رمز ممکن نشد.'); }
  }

  async function resetMenu() {
    if (!confirm('منو به نسخهٔ اصلی برگردد؟ تغییرات منوی این مرورگر پاک می‌شود.')) return;
    try {
      MenuStore.resetMenu();
      data = (await MenuStore.load()).data;
      renderAll();
      toast('منوی پیش‌فرض بازگردانده شد.');
    } catch (error) { toast('بازگردانی انجام نشد.'); }
  }

  function clearOrders() {
    if (!confirm('همهٔ سفارش‌ها پاک شوند؟ این کار برگشت‌پذیر نیست.')) return;
    OrderStore.clear();
    renderStats();
    renderOrders();
    renderOrderFilters();
    toast('سفارش‌ها پاک شدند.');
  }

  /* ---------------- live updates ---------------- */
  function onOrdersChanged() {
    if (!ready || $('#admin-app').hidden) return;
    const before = lastNewCount;
    const after = newOrderCount();
    lastNewCount = after;
    renderStats();
    renderOrderFilters();
    renderOrders();
    if (before >= 0 && after > before) {
      const latest = OrderStore.list().find(order => order.status === 'new');
      toast(latest ? `سفارش جدید برای میز ${latest.table}` : 'سفارش جدید رسید.');
    }
  }

  async function onMenuChanged() {
    if (!ready) return;
    try {
      const result = await MenuStore.load();
      data = result.data;
      renderStats();
      renderMenuList();
      renderCategories();
      if (activeTab !== 'settings') fillSettings();
    } catch (error) { console.error(error); }
  }

  /* ---------------- bindings ---------------- */
  function bind() {
    $('#login-form').addEventListener('submit', onLogin);
    $('#admin-logout').addEventListener('click', logout);
    $$('[data-admin-tab]').forEach(button => button.addEventListener('click', () => selectTab(button.dataset.adminTab)));

    $('#order-filters').addEventListener('click', event => {
      const button = event.target.closest('[data-filter]');
      if (!button) return;
      orderFilter = button.dataset.filter;
      renderOrderFilters();
      renderOrders();
    });

    $('#orders-list').addEventListener('click', event => {
      const button = event.target.closest('[data-order-status]');
      if (!button) return;
      const id = button.dataset.orderId;
      const status = button.dataset.orderStatus;
      if (status === 'canceled' && !confirm('این سفارش لغو شود؟')) return;
      try {
        OrderStore.update(id, { status });
        toast(status === 'preparing' ? 'سفارش در حال آماده‌سازی است.' : status === 'served' ? 'سفارش تحویل شد.' : 'سفارش لغو شد.');
      } catch (error) { toast(error.message || 'تغییر وضعیت انجام نشد.'); }
    });

    $('#admin-menu-search').addEventListener('input', event => { menuQuery = event.target.value; renderMenuList(); });
    $('#add-item').addEventListener('click', () => openEditor());
    $('#admin-menu-list').addEventListener('change', event => {
      const toggle = event.target.closest('[data-availability]');
      if (toggle) toggleAvailability(toggle.dataset.availability, toggle.checked);
    });
    $('#admin-menu-list').addEventListener('click', event => {
      const edit = event.target.closest('[data-edit-item]');
      if (edit) { openEditor(edit.dataset.editItem); return; }
      const remove = event.target.closest('[data-delete-item]');
      if (remove) deleteItem(remove.dataset.deleteItem);
    });

    $('#item-form').addEventListener('submit', saveEditor);
    $('#settings-form').addEventListener('submit', saveSettings);
    $('#category-form').addEventListener('submit', addCategory);
    $('#admin-categories').addEventListener('click', event => {
      const remove = event.target.closest('[data-delete-category]');
      if (remove) deleteCategory(remove.dataset.deleteCategory);
    });
    $('#pin-form').addEventListener('submit', savePin);
    $('#reset-menu').addEventListener('click', resetMenu);
    $('#clear-orders').addEventListener('click', clearOrders);

    window.addEventListener('rost:orders-changed', onOrdersChanged);
    window.addEventListener('rost:menu-changed', onMenuChanged);
    window.addEventListener('storage', event => {
      if (event.key === MenuStore.ORDERS_KEY) onOrdersChanged();
      if (event.key === MenuStore.MENU_KEY) onMenuChanged();
    });
  }

  function init() {
    bind();
    updateHint();
    selectTab('orders');
    if (isAuthed() && /^#\/?admin/.test(location.hash)) showApp();
  }

  window.CafeAdmin = { enter };
  init();
})();
