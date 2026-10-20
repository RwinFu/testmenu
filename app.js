(() => {
  const KEY = 'rost-cafe-menu-v1';
  const money = value => new Intl.NumberFormat('fa-IR').format(Number(value) || 0);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let data = null;
  let activeCategory = 'all';
  const grid = document.querySelector('#menu-grid');
  const status = document.querySelector('#menu-status');
  const queryInput = document.querySelector('#menu-search');

  async function loadData() {
    try {
      const response = await fetch('menu-data.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('menu-data.json could not be loaded');
      data = await response.json();
      const saved = localStorage.getItem(KEY);
      if (saved) {
        try { data = JSON.parse(saved); } catch { localStorage.removeItem(KEY); }
      }
      applySettings();
      renderCategories();
      renderItems();
    } catch (error) {
      status.textContent = 'بارگذاری منو ممکن نشد. صفحه را از طریق وب‌سرور باز کنید.';
      console.error(error);
    }
  }
  function applySettings() {
    document.querySelectorAll('[data-setting="name"]').forEach(el => { el.textContent = data.settings.name; });
    document.querySelectorAll('[data-setting="eyebrow"]').forEach(el => { el.textContent = data.settings.eyebrow; });
    document.querySelectorAll('[data-setting="description"]').forEach(el => { el.textContent = data.settings.description; });
    document.querySelectorAll('[data-setting="hours"]').forEach(el => { el.textContent = data.settings.hours; });
    document.title = `${data.settings.name} | منوی دیجیتال`;
  }
  function renderCategories() {
    const root = document.querySelector('#category-list');
    const counts = Object.fromEntries(data.categories.map(category => [category.id, data.items.filter(item => item.category === category.id && item.available).length]));
    const buttons = [{id:'all',name:'همه‌ی منو',icon:'✳'}, ...data.categories];
    root.innerHTML = buttons.filter(cat => cat.id === 'all' || counts[cat.id] > 0).map(cat => `<button class="category-btn ${activeCategory === cat.id ? 'active' : ''}" data-category="${escapeHTML(cat.id)}" aria-pressed="${activeCategory === cat.id}">${escapeHTML(cat.name)}</button>`).join('');
    root.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
      activeCategory = button.dataset.category;
      renderCategories(); renderItems();
    }));
  }
  function renderItems() {
    const query = queryInput.value.trim().toLocaleLowerCase('fa');
    const visible = data.items.filter(item => item.available && (activeCategory === 'all' || item.category === activeCategory) && (!query || `${item.name} ${item.description}`.toLocaleLowerCase('fa').includes(query)));
    grid.innerHTML = visible.map(item => `<article class="menu-card">
      <div class="card-image"><img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.name)}" loading="lazy">${item.popular ? '<span class="popular-badge"><span>✦</span> پرطرفدار</span>' : ''}</div>
      <div class="item-content"><div class="item-top"><h3>${escapeHTML(item.name)}</h3><span class="item-price">${money(item.price)} <small>تومان</small></span></div><p class="item-description">${escapeHTML(item.description)}</p></div>
    </article>`).join('');
    document.querySelector('#empty-state').hidden = visible.length > 0;
    status.textContent = visible.length ? `${money(visible.length)} مورد خوشمزه برای انتخاب` : '';
  }
  queryInput.addEventListener('input', renderItems);
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); queryInput.focus(); }
    if (event.key === 'Escape') { queryInput.value = ''; renderItems(); queryInput.blur(); }
  });
  loadData();
})();
