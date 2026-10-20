/* Shared storage for the QR menu, the waiter cart and the owner panel.
   Everything lives in this browser: GitHub Pages is static and has no backend. */
(() => {
  const MENU_KEY = 'rost-cafe-menu-v2';
  const ORDERS_KEY = 'rost-orders-v1';
  const MY_ORDERS_KEY = 'rost-my-orders-v1';
  const PIN_KEY = 'rost-admin-pin-v1';
  const MAX_ORDERS = 200;
  const STATUSES = ['new', 'preparing', 'served', 'canceled'];
  const STATUS_LABELS = { new: 'سفارش جدید', preparing: 'در حال آماده‌سازی', served: 'تحویل شد', canceled: 'لغو شد' };
  const IMAGE_PATTERN = /^assets\/(?:[a-z0-9-]+\/)?[a-z0-9-]+\.(?:jpe?g|png|webp)$/;
  const SETTINGS_DEFAULTS = { name: '', eyebrow: '', description: '', hours: '', phone: '', instagram: '', whatsapp: '', notice: '', ordersOpen: true };

  const text = (value, max) => typeof value === 'string' && value.length <= max;
  const clone = value => JSON.parse(JSON.stringify(value));

  function withDefaults(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
    return Object.assign({}, input, { settings: Object.assign({}, SETTINGS_DEFAULTS, input.settings && typeof input.settings === 'object' ? input.settings : {}) });
  }

  function validate(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('ساختار فایل منو معتبر نیست.');
    const settings = data.settings;
    if (!settings || typeof settings !== 'object' ||
        !text(settings.name, 50) || !settings.name.trim() ||
        !text(settings.eyebrow, 100) || !text(settings.description, 200) || !text(settings.hours, 80) ||
        !text(settings.phone, 30) || !text(settings.instagram, 60) || !text(settings.whatsapp, 30) || !text(settings.notice, 200) ||
        typeof settings.ordersOpen !== 'boolean') throw new Error('اطلاعات کافه معتبر نیست.');
    if (!Array.isArray(data.categories) || !Array.isArray(data.items) ||
        data.categories.length > 30 || data.items.length > 300) throw new Error('ساختار فایل منو معتبر نیست.');

    const categoryIds = new Set();
    data.categories.forEach(category => {
      if (!category || !text(category.id, 60) || !category.id || category.id === 'all' || categoryIds.has(category.id) ||
          !text(category.name, 60) || !category.name.trim() || !text(category.icon, 8)) throw new Error('دسته‌بندی نامعتبر است.');
      categoryIds.add(category.id);
    });

    const itemIds = new Set();
    data.items.forEach(item => {
      if (!item || !text(item.id, 80) || !item.id || itemIds.has(item.id) ||
          !categoryIds.has(item.category) || !text(item.name, 60) || !item.name.trim() ||
          !text(item.description, 150) || !Number.isSafeInteger(item.price) || item.price < 0 || item.price > 1e10 ||
          !text(item.image, 120) || !IMAGE_PATTERN.test(item.image) ||
          typeof item.available !== 'boolean' || typeof item.popular !== 'boolean') throw new Error('اطلاعات آیتم منو معتبر نیست.');
      itemIds.add(item.id);
    });
    return data;
  }

  function storage() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
    } catch { /* Blocked storage behaves like an empty one. */ }
    return null;
  }

  function readSavedMenu() {
    try {
      const raw = storage()?.getItem(MENU_KEY);
      return raw ? validate(withDefaults(JSON.parse(raw))) : null;
    } catch { return null; }
  }

  async function load() {
    const saved = readSavedMenu();
    if (saved) return { data: saved, source: 'saved', fallback: false };

    let published = null;
    let fallback = false;
    const protocol = typeof location !== 'undefined' ? location.protocol : 'https:';
    if (protocol !== 'file:') {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch('menu-data.json', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Menu unavailable');
        published = validate(withDefaults(await response.json()));
      } catch { fallback = true; }
      finally { clearTimeout(timer); }
    } else { fallback = true; }

    if (!published) {
      const defaults = withDefaults(clone(window.MENU_DEFAULTS));
      published = validate(defaults);
    }
    return { data: published, source: fallback ? 'bundled' : 'published', fallback };
  }

  function save(data) {
    const clean = validate(withDefaults(clone(data)));
    const store = storage();
    if (!store) throw new Error('حافظهٔ مرورگر در دسترس نیست.');
    store.setItem(MENU_KEY, JSON.stringify(clean));
    broadcast('rost:menu-changed', {});
    return clean;
  }

  function resetMenu() {
    storage()?.removeItem(MENU_KEY);
    broadcast('rost:menu-changed', {});
  }

  const normalize = value => String(value ?? '').normalize('NFKC').replace(/ي/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[\u064B-\u065F\u0670\u200c]/g, '').toLocaleLowerCase('fa').trim();

  function isOrder(order) {
    return Boolean(order && typeof order === 'object' &&
      text(order.id, 80) && text(order.code, 10) && text(order.table, 20) && text(order.note, 200) &&
      Array.isArray(order.items) && order.items.length > 0 && order.items.length <= 60 &&
      order.items.every(line => line && text(line.id, 80) && text(line.name, 60) &&
        Number.isSafeInteger(line.price) && line.price >= 0 && Number.isSafeInteger(line.qty) && line.qty > 0 && line.qty <= 50) &&
      Number.isSafeInteger(order.total) && order.total >= 0 &&
      STATUSES.includes(order.status) && Number.isSafeInteger(order.createdAt));
  }

  function listOrders() {
    try {
      const raw = storage()?.getItem(ORDERS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(isOrder) : [];
    } catch { return []; }
  }

  function writeOrders(orders) {
    const store = storage();
    if (!store) throw new Error('حافظهٔ مرورگر در دسترس نیست.');
    store.setItem(ORDERS_KEY, JSON.stringify(orders.slice(0, MAX_ORDERS)));
  }

  function makeCode() {
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  function addOrder(draft) {
    if (!draft || typeof draft !== 'object') throw new Error('سفارش معتبر نیست.');
    const items = (Array.isArray(draft.items) ? draft.items : []).map(line => ({
      id: String(line.id || '').slice(0, 80),
      name: String(line.name || '').slice(0, 60),
      price: Number(line.price),
      qty: Number(line.qty)
    }));
    const order = {
      id: `order-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      code: text(draft.code, 10) && draft.code ? draft.code : makeCode(),
      table: String(draft.table || '').trim().slice(0, 20),
      note: String(draft.note || '').trim().slice(0, 200),
      items,
      total: items.reduce((sum, line) => sum + line.price * line.qty, 0),
      status: 'new',
      createdAt: Date.now()
    };
    if (!isOrder(order) || !order.table) throw new Error('سفارش کامل نیست.');
    const orders = [order, ...listOrders()];
    writeOrders(orders);
    broadcast('rost:orders-changed', { id: order.id, change: 'added' });
    return order;
  }

  function updateOrder(id, patch) {
    const orders = listOrders();
    const index = orders.findIndex(order => order.id === id);
    if (index < 0) throw new Error('سفارش پیدا نشد.');
    if (!patch || !STATUSES.includes(patch.status)) throw new Error('وضعیت معتبر نیست.');
    orders[index] = Object.assign({}, orders[index], { status: patch.status });
    writeOrders(orders);
    broadcast('rost:orders-changed', { id, change: 'updated' });
    return orders[index];
  }

  function clearOrders() {
    storage()?.removeItem(ORDERS_KEY);
    storage()?.removeItem(MY_ORDERS_KEY);
    broadcast('rost:orders-changed', { change: 'cleared' });
  }

  function rememberMyOrder(id) {
    try {
      const store = storage();
      if (!store) return;
      const raw = store.getItem(MY_ORDERS_KEY);
      const ids = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw).filter(value => typeof value === 'string') : [];
      store.setItem(MY_ORDERS_KEY, JSON.stringify([id, ...ids.filter(value => value !== id)].slice(0, 10)));
    } catch { /* Tracking is a convenience, never a requirement. */ }
  }

  function myOrderIds() {
    try {
      const raw = storage()?.getItem(MY_ORDERS_KEY);
      const ids = raw ? JSON.parse(raw) : [];
      return Array.isArray(ids) ? ids.filter(value => typeof value === 'string').slice(0, 10) : [];
    } catch { return []; }
  }

  /* Same-tab CustomEvent plus a cross-tab BroadcastChannel message. */
  const channel = (() => {
    try { return typeof BroadcastChannel === 'function' ? new BroadcastChannel('rost-cafe') : null; } catch { return null; }
  })();
  function emitLocal(type, detail) {
    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent(type, { detail: detail || {} }));
      }
    } catch { /* Non-browser test environments have no event target. */ }
  }
  function broadcast(type, detail) {
    emitLocal(type, detail);
    try { channel?.postMessage({ type, detail }); } catch { /* Ignore closed channels. */ }
  }
  if (channel) channel.addEventListener('message', event => {
    const message = event.data;
    if (message && typeof message.type === 'string') emitLocal(message.type, message.detail);
  });

  window.MenuStore = {
    MENU_KEY, ORDERS_KEY, MY_ORDERS_KEY, PIN_KEY,
    validate, withDefaults, load, save, resetMenu, readSavedMenu, normalize
  };
  window.OrderStore = {
    STATUSES, STATUS_LABELS, list: listOrders, add: addOrder, update: updateOrder, clear: clearOrders,
    rememberMine: rememberMyOrder, myIds: myOrderIds, makeCode
  };
})();
