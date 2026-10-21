/* Digital café menu: browse, search and read a dish. No cart, no checkout.
   Mobile-first: sticky category bar, quick search panel and a full-screen dish sheet. */
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const money = value => new Intl.NumberFormat('fa-IR').format(Math.round(Number(value) || 0));
  const num = value => new Intl.NumberFormat('fa-IR').format(Number(value) || 0);
  const state = { data: null, category: 'all', query: '', detail: null, admin: false };
  const scrollBehavior = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  const storefront = $('#storefront');
  const adminView = $('#admin-view');
  const menuGrid = $('#menu-grid');
  const menuStatus = $('#menu-status');
  const emptyState = $('#empty-state');
  const searchInput = $('#menu-search');
  const searchResults = $('#search-results');
  const searchEmpty = $('#search-empty');
  const scrim = $('#scrim');
  const scrollTopBtn = $('#scroll-top');
  const siteHead = $('#site-head');

  /* ---------------- UI helpers ---------------- */
  let openSheetEl = null;
  let sheetHasScrim = true;
  let lastFocus = null;
  let toastTimer = null;
  let hideTimer = null;
  const focusableSelector = 'button:not([disabled]), [href], input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function openSheet(id, options = {}) {
    const sheet = document.getElementById(id);
    if (!sheet) return;
    // When one sheet opens another (search → dish details), restore focus to
    // the original visible trigger instead of a control inside the hidden sheet.
    const focusToRestore = openSheetEl ? lastFocus : (options.returnFocus || document.activeElement);
    if (openSheetEl && openSheetEl !== sheet) closeSheet(true, false);
    clearTimeout(hideTimer);
    hideTimer = null;
    sheetHasScrim = options.scrim !== false;
    lastFocus = focusToRestore;
    if (sheet.id === 'search-panel') {
      $('#search-open').setAttribute('aria-expanded', 'true');
      $('#search-open-hero').setAttribute('aria-expanded', 'true');
    }
    sheet.hidden = false;
    void sheet.offsetHeight;
    requestAnimationFrame(() => sheet.classList.add('open'));
    if (sheetHasScrim) scrim.hidden = false;
    document.body.classList.add('sheet-open');
    openSheetEl = sheet;
    const target = sheet.querySelector('[data-autofocus]') || sheet.querySelector(focusableSelector);
    setTimeout(() => { if (openSheetEl === sheet) target?.focus({ preventScroll: true }); }, 90);
  }

  function closeSheet(immediate = false, restoreFocus = true) {
    const sheet = openSheetEl;
    if (!sheet) { scrim.hidden = true; document.body.classList.remove('sheet-open'); return; }
    openSheetEl = null;
    sheet.classList.remove('open');
    if (sheet.id === 'search-panel') {
      $('#search-open').setAttribute('aria-expanded', 'false');
      $('#search-open-hero').setAttribute('aria-expanded', 'false');
    }
    if (sheetHasScrim) scrim.hidden = true;
    sheetHasScrim = true;
    document.body.classList.remove('sheet-open');
    const hide = () => { sheet.hidden = true; hideTimer = null; };
    clearTimeout(hideTimer);
    if (immediate) hide();
    else hideTimer = setTimeout(hide, 320);
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
    const categories = [{ id: 'all', name: 'همه' }, ...state.data.categories];
    root.innerHTML = categories.map(category => `<button type="button" class="cat-chip" data-category="${esc(category.id)}" aria-pressed="${state.category === category.id}">${esc(category.name)}</button>`).join('');
    const active = root.querySelector('[aria-pressed="true"]');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function itemRow(item) {
    const badge = item.available
      ? (item.popular ? '<span class="badge-pop">محبوب</span>' : '')
      : '<span class="badge-out">ناموجود</span>';
    return `<article class="menu-item${item.available ? '' : ' is-out'}">
      <button class="menu-item-main" type="button" data-open="${esc(item.id)}" aria-label="${esc(item.name)}، ${money(item.price)} تومان — دیدن جزئیات و ترکیبات">
        <span class="menu-thumb">
          <img src="${esc(item.image)}" alt="" width="160" height="160" loading="lazy" decoding="async">
        </span>
        <span class="menu-text">
          <span class="menu-title">${esc(item.name)}${badge}</span>
          <span class="menu-desc">${esc(item.description)}</span>
        </span>
        <span class="menu-price">${money(item.price)}<small>تومان</small></span>
      </button>
    </article>`;
  }

  function renderMenu() {
    if (!state.data) return;
    const visible = state.category === 'all'
      ? state.data.items
      : state.data.items.filter(item => item.category === state.category);
    const groups = state.data.categories
      .map(category => ({ category, items: visible.filter(item => item.category === category.id) }))
      .filter(group => group.items.length);

    menuGrid.innerHTML = groups.map(group => `<section class="menu-group" aria-label="${esc(group.category.name)}">
      <header class="group-head">
        <h3>${esc(group.category.name)}</h3>
        <span class="group-line" aria-hidden="true"></span>
        <span class="group-count">${num(group.items.length)}</span>
      </header>
      <div class="group-list">${group.items.map(itemRow).join('')}</div>
    </section>`).join('');

    const activeCategory = state.data.categories.find(category => category.id === state.category);
    $('#menu-title').textContent = activeCategory ? activeCategory.name : 'منو';
    $('#menu-sub').textContent = activeCategory
      ? `آیتم‌های دستهٔ ${activeCategory.name}`
      : `${num(state.data.categories.length)} دسته، ${num(state.data.items.length)} آیتم`;

    $('#menu-loading').hidden = true;
    emptyState.hidden = visible.length > 0;
    $('#menu-count').textContent = `${num(visible.length)} آیتم`;
    menuStatus.textContent = visible.length ? `${num(visible.length)} آیتم نمایش داده شد.` : 'نتیجه‌ای پیدا نشد.';
  }

  function renderPopular() {
    if (!state.data) return;
    const popular = state.data.items.filter(item => item.popular && item.available &&
      (state.category === 'all' || item.category === state.category)).slice(0, 8);
    const wrap = $('#popular');
    wrap.hidden = popular.length === 0;
    $('#popular-list').innerHTML = popular.map(item => `<button class="pop-card" type="button" data-open="${esc(item.id)}" aria-label="${esc(item.name)}، ${money(item.price)} تومان">
      <span class="pop-photo"><img src="${esc(item.image)}" alt="" width="240" height="180" loading="lazy" decoding="async"></span>
      <span class="pop-name">${esc(item.name)}</span>
      <span class="pop-price">${money(item.price)} <small>تومان</small></span>
    </button>`).join('');
  }

  function setCategory(id) {
    state.category = id;
    renderCategories();
    renderPopular();
    renderMenu();
    const heading = $('#menu-heading');
    if (heading.getBoundingClientRect().top < 130) {
      heading.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    }
  }

  /* ---------------- dish sheet ---------------- */
  function openItem(id, trigger) {
    const item = state.data.items.find(entry => entry.id === id);
    if (!item) return;
    state.detail = item;
    renderItemSheet();
    openSheet('item-sheet', { returnFocus: trigger || document.activeElement });
  }

  function renderItemSheet() {
    const item = state.detail;
    if (!item) return;
    const category = state.data.categories.find(entry => entry.id === item.category);
    const ingredients = Array.isArray(item.ingredients) ? item.ingredients.filter(part => typeof part === 'string' && part.trim()) : [];
    $('#item-sheet-body').innerHTML = `<div class="detail-hero">
        <img src="${esc(item.image)}" alt="${esc(item.name)}" decoding="async">
        <button class="detail-close" type="button" data-close aria-label="بستن">×</button>
        <div class="detail-badges">
          ${item.popular && item.available ? '<span class="detail-badge">محبوب کافه</span>' : ''}
          ${item.available ? '' : '<span class="detail-badge detail-badge-out">ناموجود</span>'}
        </div>
      </div>
      <div class="detail-body">
        <h2 id="item-sheet-title" class="sr-only">${esc(item.name)}</h2>
        <p class="detail-kicker">${esc(category?.name || '')}</p>
        <div class="detail-title-row">
          <h3>${esc(item.name)}</h3>
          <p class="detail-price">${money(item.price)}<small>تومان</small></p>
        </div>
        <p class="detail-desc">${esc(item.description) || 'توضیحی برای این آیتم ثبت نشده است.'}</p>
        ${ingredients.length ? `<section class="ingredient-block" aria-labelledby="ingredients-title">
          <h4 id="ingredients-title">ترکیبات</h4>
          <ul class="ingredient-chips">${ingredients.map(part => `<li>${esc(part)}</li>`).join('')}</ul>
        </section>` : ''}
        <p class="detail-note">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h11v5.2A4.8 4.8 0 0 1 10.2 19H8.8A4.8 4.8 0 0 1 4 14.2V9Z"/><path d="M15 10h1.6a2.4 2.4 0 0 1 0 4.8H15"/></svg>
          ${item.available ? 'برای سفارش، ویتر را صدا بزن.' : 'این آیتم فعلاً در منو موجود نیست.'}
        </p>
      </div>
      <div class="detail-bar">
        <div class="detail-bar-price"><span>قیمت</span><strong>${money(item.price)} <small>تومان</small></strong></div>
        <button class="btn btn-dark" type="button" data-close>بستن</button>
      </div>`;
  }

  /* ---------------- search ---------------- */
  const categoryName = item => state.data?.categories.find(category => category.id === item.category)?.name || '';

  function searchMatches(query) {
    const clean = MenuStore.normalize(query);
    if (!clean) return [];
    return state.data.items.filter(item => MenuStore.normalize(
      `${item.name} ${item.description} ${categoryName(item)} ${Array.isArray(item.ingredients) ? item.ingredients.join(' ') : ''}`
    ).includes(clean));
  }

  function renderSearch() {
    if (!state.data) return;
    const query = state.query.trim();
    $('#search-clear').hidden = !query;
    $('#search-hint').hidden = Boolean(query);
    searchEmpty.hidden = true;
    if (!query) {
      searchResults.innerHTML = '';
      const popular = state.data.items.filter(item => item.popular && item.available).slice(0, 4);
      $('#search-suggestions').innerHTML = `
        <div class="suggest-block">
          <h3>دسته‌بندی‌ها</h3>
          <div class="suggest-chips">${[{ id: 'all', name: 'همه' }, ...state.data.categories].map(category =>
            `<button class="cat-chip" type="button" data-search-category="${esc(category.id)}">${esc(category.name)}</button>`).join('')}</div>
        </div>
        ${popular.length ? `<div class="suggest-block">
          <h3>پیشنهاد کافه</h3>
          <div class="menu-list">${popular.map(itemRow).join('')}</div>
        </div>` : ''}`;
      $('#search-status').textContent = '';
      return;
    }
    $('#search-suggestions').innerHTML = '';
    const matches = searchMatches(query);
    searchResults.innerHTML = matches.map(itemRow).join('');
    searchEmpty.hidden = matches.length > 0;
    $('#search-status').textContent = matches.length
      ? `${num(matches.length)} نتیجه برای «${query}»`
      : `نتیجه‌ای برای «${query}» پیدا نشد.`;
  }

  function openSearch(event) {
    if (!state.data) return;
    renderSearch();
    const trigger = event?.currentTarget?.focus ? event.currentTarget : document.activeElement;
    openSheet('search-panel', { scrim: false, returnFocus: trigger });
  }

  function closeSearch() {
    if (openSheetEl?.id === 'search-panel') closeSheet();
  }

  function clearSearch(focus = true) {
    state.query = '';
    searchInput.value = '';
    renderSearch();
    if (focus) searchInput.focus({ preventScroll: true });
  }

  /* ---------------- routes & chrome ---------------- */
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
    updateScrollChrome();
  }

  function updateScrollChrome() {
    const y = window.scrollY || window.pageYOffset || 0;
    siteHead?.classList.toggle('is-stuck', y > 4);
    if (scrollTopBtn) {
      const show = !state.admin && y > 640;
      if (show === scrollTopBtn.hidden) scrollTopBtn.hidden = !show;
      scrollTopBtn.classList.toggle('show', show);
    }
  }

  /* ---------------- sheet drag-to-close (phones) ---------------- */
  function bindSheetDrag(sheet) {
    const grip = sheet.querySelector('.sheet-grip');
    if (!grip) return;
    let startY = 0;
    let delta = 0;
    let pointerId = null;
    const isPhone = () => window.matchMedia?.('(max-width: 719px)').matches;
    const reset = () => {
      sheet.style.transition = '';
      sheet.style.transform = '';
      delta = 0;
      pointerId = null;
    };
    grip.addEventListener('pointerdown', event => {
      if (!isPhone() || (event.pointerType === 'mouse' && event.button !== 0)) return;
      pointerId = event.pointerId;
      startY = event.clientY;
      delta = 0;
      sheet.style.transition = 'none';
      grip.setPointerCapture?.(event.pointerId);
    });
    grip.addEventListener('pointermove', event => {
      if (pointerId === null || event.pointerId !== pointerId) return;
      delta = Math.max(0, event.clientY - startY);
      sheet.style.transform = `translateY(${delta}px)`;
    });
    const finish = () => {
      if (pointerId === null) return;
      const shouldClose = delta > 90;
      reset();
      if (shouldClose) closeSheet();
    };
    grip.addEventListener('pointerup', finish);
    grip.addEventListener('pointercancel', finish);
  }

  /* ---------------- events ---------------- */
  function bindEvents() {
    const onCategory = id => setCategory(id);

    $('#category-list').addEventListener('click', event => {
      const button = event.target.closest('[data-category]');
      if (button && button.dataset.category !== state.category) onCategory(button.dataset.category);
    });

    menuGrid.addEventListener('click', event => {
      const open = event.target.closest('[data-open]');
      if (open) openItem(open.dataset.open, open);
    });

    $('#popular-list').addEventListener('click', event => {
      const open = event.target.closest('[data-open]');
      if (open) openItem(open.dataset.open, open);
    });

    $('#search-open').addEventListener('click', openSearch);
    $('#search-open-hero').addEventListener('click', openSearch);
    $('#search-close').addEventListener('click', closeSearch);
    searchInput.addEventListener('input', () => { state.query = searchInput.value; renderSearch(); });
    searchInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') event.preventDefault();
    });
    $('#search-clear').addEventListener('click', () => clearSearch());
    $('#search-empty-clear').addEventListener('click', () => {
      state.query = '';
      searchInput.value = '';
      closeSearch();
      setCategory('all');
      $('#menu-heading').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    });

    $('#search-results').addEventListener('click', event => {
      const open = event.target.closest('[data-open]');
      if (open) openItem(open.dataset.open, open);
    });
    $('#search-suggestions').addEventListener('click', event => {
      const category = event.target.closest('[data-search-category]');
      if (category) {
        closeSearch();
        state.query = '';
        searchInput.value = '';
        setCategory(category.dataset.searchCategory);
        return;
      }
      const open = event.target.closest('[data-open]');
      if (open) openItem(open.dataset.open, open);
    });

    $('#reset-search').addEventListener('click', () => setCategory('all'));

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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
    });

    scrollTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: scrollBehavior() });
      $('.brand')?.focus?.({ preventScroll: true });
    });

    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { updateScrollChrome(); ticking = false; });
    }, { passive: true });

    window.addEventListener('hashchange', route);
    window.addEventListener('rost:menu-changed', refreshMenu);
    window.addEventListener('storage', event => {
      if (event.key === MenuStore.MENU_KEY) refreshMenu();
    });
    $$('.sheet').forEach(bindSheetDrag);
  }

  async function refreshMenu() {
    try {
      const result = await MenuStore.load();
      state.data = result.data;
      if (state.category !== 'all' && !state.data.categories.some(category => category.id === state.category)) state.category = 'all';
      applySettings();
      renderCategories();
      renderPopular();
      renderMenu();
      if (openSheetEl?.id === 'search-panel') renderSearch();
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
      renderPopular();
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
