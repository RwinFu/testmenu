(() => {
  const money = value => new Intl.NumberFormat('fa-IR').format(value);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let data;
  let activeCategory = 'all';
  const grid = document.querySelector('#menu-grid');
  const status = document.querySelector('#menu-status');
  const input = document.querySelector('#menu-search');
  const preview = new URLSearchParams(location.search).get('preview') === '1';
  async function start() {
    try {
      const result = await MenuStore.load({ draft: preview });
      data = result.data;
      if (preview) document.querySelector('#preview-banner').hidden = false;
      if (result.fallback && location.protocol !== 'file:') {
        const notice = document.querySelector('#load-notice');
        notice.hidden = false;
        notice.textContent = 'نسخهٔ همراه سایت نمایش داده می‌شود. برای اطمینان از قیمت روز، از همکاران کافه بپرسید.';
      }
      document.querySelectorAll('[data-setting]').forEach(el => { el.textContent = data.settings[el.dataset.setting]; });
      document.title = `${data.settings.name} | منوی کافه`;
      renderCategories(); renderItems();
    } catch (error) {
      status.textContent = 'منو در دسترس نیست. لطفاً از همکاران کافه کمک بگیرید یا صفحه را دوباره باز کنید.';
      console.error(error);
    }
  }
  function renderCategories() {
    const categories = [{ id:'all', name:'همهٔ منو', icon:'✳' }, ...data.categories];
    const root = document.querySelector('#category-list');
    root.innerHTML = categories.map(cat => `<button type="button" class="category-btn ${activeCategory === cat.id ? 'active' : ''}" data-category="${esc(cat.id)}" aria-pressed="${activeCategory === cat.id}"><span aria-hidden="true">${esc(cat.icon || '✳')}</span>${esc(cat.name)}</button>`).join('');
    root.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
      activeCategory = button.dataset.category;
      root.querySelectorAll('button').forEach(btn => { const selected = btn === button; btn.classList.toggle('active', selected); btn.setAttribute('aria-pressed', selected); });
      button.scrollIntoView({ block:'nearest', inline:'nearest', behavior:'smooth' });
      renderItems();
    }));
  }
  function renderItems() {
    if (!data) return;
    const query = MenuStore.normalize(input.value);
    const visible = data.items.filter(item => (activeCategory === 'all' || item.category === activeCategory) && MenuStore.normalize(`${item.name} ${item.description}`).includes(query));
    grid.innerHTML = visible.map(item => `<article class="menu-card ${item.available ? '' : 'unavailable'}">
      <div class="card-image"><img src="${esc(item.image)}" alt="" width="110" height="110" loading="lazy">${item.popular && item.available ? '<span class="popular-badge">محبوب</span>' : ''}</div>
      <div class="item-content"><h3>${esc(item.name)}</h3><p class="item-description">${esc(item.description)}</p><div class="item-bottom"><span class="item-price">${money(item.price)} <small>تومان</small></span>${item.available ? '<span class="item-category">'+esc(data.categories.find(cat => cat.id === item.category).name)+'</span>' : '<span class="sold-out">فعلاً ناموجود</span>'}</div></div>
    </article>`).join('');
    document.querySelector('#empty-state').hidden = visible.length > 0;
    status.textContent = visible.length ? `${money(visible.length)} انتخاب • تازه آماده می‌شود` : '';
  }
  input.addEventListener('input', renderItems);
  document.querySelector('#reset-search').addEventListener('click', () => { input.value = ''; activeCategory = 'all'; renderCategories(); renderItems(); input.focus(); });
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); input.focus(); }
    if (event.key === 'Escape' && document.activeElement === input) { input.value = ''; renderItems(); }
  });
  start();
})();
