/* Shared loading and validation. Public visitors never see a browser's admin draft. */
(() => {
  const KEY = 'rost-cafe-menu-v1';
  const images = ['assets/hero-cafe.jpg', 'assets/coffee.jpg', 'assets/brunch.jpg', 'assets/dessert.jpg'];
  const text = (value, max) => typeof value === 'string' && value.length <= max;
  function validate(data) {
    if (!data || !data.settings || !text(data.settings.name, 50) || !data.settings.name.trim() ||
        !['eyebrow', 'description', 'hours'].every(key => text(data.settings[key], 200)) ||
        !Array.isArray(data.categories) || !Array.isArray(data.items) || data.categories.length > 100 || data.items.length > 2000) throw new Error('ساختار فایل منو معتبر نیست.');
    const ids = new Set();
    data.categories.forEach(cat => {
      if (!cat || !text(cat.id, 100) || !cat.id || cat.id === 'all' || ids.has(cat.id) || !text(cat.name, 80) || !cat.name.trim() || (cat.icon !== undefined && !text(cat.icon, 20))) throw new Error('دسته‌بندی نامعتبر است.');
      ids.add(cat.id);
    });
    const itemIds = new Set();
    data.items.forEach(item => {
      if (!item || !text(item.id, 100) || !item.id || itemIds.has(item.id) || !ids.has(item.category) ||
          !text(item.name, 60) || !item.name.trim() || !text(item.description, 150) ||
          !Number.isSafeInteger(item.price) || item.price < 0 || item.price > 1e10 ||
          !images.includes(item.image) || typeof item.available !== 'boolean' || typeof item.popular !== 'boolean') throw new Error('اطلاعات آیتم منو معتبر نیست.');
      itemIds.add(item.id);
    });
    return data;
  }
  function readDraft() {
    try { const saved = localStorage.getItem(KEY); return saved ? validate(JSON.parse(saved)) : null; }
    catch { return null; } // Storage may be disabled or an old draft may be corrupt.
  }
  function save(data) { localStorage.setItem(KEY, JSON.stringify(validate(data))); }
  async function load({ draft = false } = {}) {
    let data;
    let fallback = false;
    if (location.protocol !== 'file:') {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch('menu-data.json', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Menu unavailable');
        data = validate(await response.json());
      } catch { fallback = true; }
      finally { clearTimeout(timeout); }
    } else { fallback = true; }
    if (!data) data = validate(JSON.parse(JSON.stringify(window.MENU_DEFAULTS)));
    return { data: (draft && readDraft()) || data, fallback };
  }
  const normalize = value => String(value).normalize('NFKC').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\u064B-\u065F\u0670\u200c]/g, '').toLocaleLowerCase('fa').trim();
  window.MenuStore = { KEY, validate, load, save, readDraft, normalize };
})();
