/* Menu storage for the café's digital menu and the owner panel.
   GitHub Pages is static, so the published menu lives in menu-data.json and
   the owner's edits are kept in this browser until they publish a new file. */
(() => {
  const MENU_KEY = 'rost-menu-v3';
  const PIN_KEY = 'rost-admin-pin-v1';
  const IMAGE_PATTERN = /^assets\/(?:[a-z0-9-]+\/)?[a-z0-9-]+\.(?:jpe?g|png|webp)$/;
  const SETTINGS_DEFAULTS = { name: '', eyebrow: '', description: '', hours: '', phone: '', instagram: '', notice: '' };
  const SETTINGS_LIMITS = { eyebrow: 100, description: 200, hours: 80, phone: 30, instagram: 60, notice: 200 };

  const text = (value, max) => typeof value === 'string' && value.length <= max;
  const clone = value => JSON.parse(JSON.stringify(value));
  const validIngredients = value => value === undefined || (Array.isArray(value) && value.length <= 10 &&
    value.every(part => text(part, 30) && Boolean(part.trim())));

  function withDefaults(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
    const raw = input.settings && typeof input.settings === 'object' && !Array.isArray(input.settings) ? input.settings : {};
    const settings = {};
    for (const key of Object.keys(SETTINGS_DEFAULTS)) {
      settings[key] = raw[key] === undefined ? SETTINGS_DEFAULTS[key] : raw[key];
    }
    return Object.assign({}, input, { settings });
  }

  function validate(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('ساختار فایل منو معتبر نیست.');
    const settings = data.settings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings) ||
        !text(settings.name, 50) || !settings.name.trim()) throw new Error('نام کافه در فایل منو معتبر نیست.');
    for (const [key, max] of Object.entries(SETTINGS_LIMITS)) {
      if (!text(settings[key], max)) throw new Error('اطلاعات کافه معتبر نیست.');
    }
    if (!Array.isArray(data.categories) || !Array.isArray(data.items) ||
        data.categories.length > 30 || data.items.length > 300) throw new Error('ساختار فایل منو معتبر نیست.');

    const categoryIds = new Set();
    data.categories.forEach(category => {
      if (!category || !text(category.id, 60) || !category.id || category.id === 'all' || categoryIds.has(category.id) ||
          !text(category.name, 60) || !category.name.trim() ||
          (category.icon !== undefined && !text(category.icon, 8))) throw new Error('دسته‌بندی نامعتبر است.');
      categoryIds.add(category.id);
    });

    const itemIds = new Set();
    data.items.forEach(item => {
      if (!item || !text(item.id, 80) || !item.id || itemIds.has(item.id) ||
          !categoryIds.has(item.category) || !text(item.name, 60) || !item.name.trim() ||
          !text(item.description, 150) || !validIngredients(item.ingredients) ||
          !Number.isSafeInteger(item.price) || item.price < 0 || item.price > 1e10 ||
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
    MENU_KEY, PIN_KEY, SETTINGS_DEFAULTS,
    validate, withDefaults, load, save, resetMenu, readSavedMenu, normalize
  };
})();
