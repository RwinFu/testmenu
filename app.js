/* Digital café menu: browse, search and read a dish. No cart, no checkout. */
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const money = value => new Intl.NumberFormat('fa-IR').format(Math.round(Number(value) || 0));
  const num = value => new Intl.NumberFormat('fa-IR').format(Number(value) || 0);
  const state = { data: null, category: 'all', query: '', detail: null, admin: false };
  const storefront = $('#storefront');
  const adminView = $('#admin-view');
  const menuGrid = $('#menu-grid');
  const menuStatus = $('#menu-status');
  const emptyState = $('#empty-state');
  const searchInput = $('#menu-search');
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

  window.CafeUI = { openSheet, closeSheet, toast, money, num, esc };

  /* ---------------- menu rendering ---------------- */
  function applySettings() {
    const settings = state.data.settings;
    $$('[data-setting]').forEach(el => {
      const key = el.dataset.setting;
      if (settings[key] !== undefined) el.textContent = settings[key];
    });
    if (!state.admin) document.title = `${settings.name} | منوی کافه`;
    const notice = $('#notice-banner');
    notice.hidden = !settings.notice.trim();
    notice.textContent = settings.notice;
    renderFooter();
  }

  function renderFooter() {
    const settings = state.data.settings;
    const links = [];
    const phone = String(settings.phone || '').trim();
    if (phone) {
      const latinPhone = phone.replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
      const dial = latinPhone.replace(/[^\d+]/g, '');
      if (dial) links.push(`<a href="tel:${esc(dial)}">تماس با کافه</a>`);
    }
    const instagram = String(settings.instagram || '').trim().replace(/^@/, '');
    if (/^[A-Za-z0-9._]{1,30}$/.test(instagram)) {
      links.push(`<a href="https://instagram.com/${esc(instagram)}" target="_blank" rel="noopener noreferrer">اینستاگرام</a>`);
    }
    $('#foot-links').innerHTML = links.join('');
  }

  function renderCategories() {
    const root = $('#category-list');
    const categories = [{ id: 'all', name: 'همه', icon: '' }, ...state.data.categories];
    root.innerHTML = categories.map(category => `<button type="button" class="cat-chip" data-category="${esc(category.id)}" aria-pressed="${state.category === category.id}">${esc(category.name)}</button>`).join('');
  }

  function itemRow(item) {
    const category = state.data.categories.find(entry => entry.id === item.category);
    return `<article class="menu-item${item.available ? '' : ' is-out'}" data-item="${esc(item.id)}">
      <button class="menu-item-main" type="button" data-open="${esc(item.id)}" aria-label="${esc(item.name)}، ${money(item.price)} تومان — دیدن جزئیات و ترکیبات">
        <span class="menu-thumb">
          <img src="${esc(item.image)}" alt="${esc(item.name)}" width="160" height="160" loading="lazy">
        </span>
        <span class="menu-text">
          <span class="menu-title">
            ${esc(item.name)}
            ${item.popular && item.available ? '<span class="badge-pop">محبوب</span>' : ''}
            ${item.available ? '' : '<span class="badge-out">ناموجود</span>'}
          </span>
          <span class="menu-desc">${esc(item.description) || esc(category?.name || '')}</span>
        </span>
        <span class="menu-price">${money(item.price)}<small>تومان</small></span>
      </button>
    </article>`;
  }

  function renderMenu() {
    if (!state.data) return;
    const query = MenuStore.normalize(state.query);
    const visible = state.data.items.filter(item =>
      (state.category === 'all' || item.category === state.category) &&
      (!query || MenuStore.normalize(`${item.name} ${item.description} ${Array.isArray(item.ingredients) ? item.ingredients.join(' ') : ''}`).includes(query))
    );
    const groups = state.data.categories
      .map(category => ({ category, items: visible.filter(item => item.category === category.id) }))
      .filter(group => group.items.length);

    menuGrid.innerHTML = groups.map(group => `<section class="menu-group" aria-label="${esc(group.category.name)}">
      <header class="group-head">
        <h3><span class="group-icon" aria-hidden="true">${esc(group.category.icon || '✦')}</span>${esc(group.category.name)}</h3>
        <span class="group-count">${num(group.items.length)}</span>
      </header>
      <div class="group-list">${group.items.map(itemRow).join('')}</div>
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
    renderItemSheet();
    openSheet('item-sheet');
  }

  function renderItemSheet() {
    const item = state.detail;
    if (!item) return;
    const category = state.data.categories.find(entry => entry.id === item.category);
    const ingredients = Array.isArray(item.ingredients) ? item.ingredients.filter(part => typeof part === 'string' && part.trim()) : [];
    $('#item-sheet-title').textContent = item.name;
    $('#item-sheet-body').innerHTML = `<div class="detail-photo">
        <img src="${esc(item.image)}" alt="${esc(item.name)}">
        ${item.popular && item.available ? '<span class="detail-badge">محبوب کافه</span>' : ''}
        ${item.available ? '' : '<span class="detail-badge detail-badge-out">ناموجود</span>'}
      </div>
      <div class="detail-head">
        <div>
          <p class="detail-kicker">${esc(category?.name || '')}</p>
          <h3>${esc(item.name)}</h3>
        </div>
        <p class="detail-price">${money(item.price)}<small>تومان</small></p>
      </div>
      <p class="detail-desc">${esc(item.description) || 'توضیحی برای این آیتم ثبت نشده است.'}</p>
      ${ingredients.length ? `<section class="ingredient-block" aria-labelledby="ingredients-title">
        <h4 id="ingredients-title">ترکیبات</h4>
        <ul class="ingredient-chips">${ingredients.map(part => `<li>${esc(part)}</li>`).join('')}</ul>
      </section>` : ''}
      <p class="detail-note">${item.available ? 'برای سفارش، ویتر را صدا بزن.' : 'این آیتم فعلاً در منو موجود نیست.'}</p>
      <button class="btn btn-outline btn-wide" type="button" data-close>بستن</button>`;
  }

  /* ---------------- routes ---------------- */
  function isAdminRoute() {
    const hash = decodeURIComponent(location.hash.replace(/^#\/?/, '')).toLowerCase();
    const adminHash = hash === 'admin' || hash === '!admin' || hash === 'panel' || hash.startsWith('admin/') || hash.startsWith('admin?');
    if (hash) return adminHash;
    return new URLSearchParams(location.search).get('admin') === '1';
  }

  function route() {
    const admin = isAdminRoute();
    state.admin = admin;
    storefront.hidden = admin;
    adminView.hidden = !admin;
    closeSheet(true, false);
    if (admin) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      window.CafeAdmin?.enter();
      document.title = state.data ? `پنل مدیریت | ${state.data.settings.name}` : 'پنل مدیریت';
    } else if (state.data) {
      document.title = `${state.data.settings.name} | منوی کافه`;
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
    window.addEventListener('storage', event => {
      if (event.key === MenuStore.MENU_KEY) refreshMenu();
    });
  }

  async function refreshMenu() {
    try {
      const result = await MenuStore.load();
      state.data = result.data;
      if (state.category !== 'all' && !state.data.categories.some(category => category.id === state.category)) state.category = 'all';
      applySettings();
      renderCategories();
      renderMenu();
      if (state.detail) {
        const fresh = state.data.items.find(item => item.id === state.detail.id);
        if (fresh) { state.detail = fresh; renderItemSheet(); }
      }
    } catch (error) { console.error(error); }
  }

  async function init() {
    bindEvents();
    try {
      const result = await MenuStore.load();
      state.data = result.data;
      applySettings();
      renderCategories();
      renderMenu();
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
