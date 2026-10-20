/* Owner panel: edit dishes, prices and café details behind a simple local PIN.
   There is no server; edits stay in this browser until menu-data.json is replaced. */
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = window.CafeUI?.esc || (value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])));
  const money = value => new Intl.NumberFormat('fa-IR').format(Math.round(Number(value) || 0));
  const num = value => new Intl.NumberFormat('fa-IR').format(Number(value) || 0);
  const SESSION_KEY = 'rost-admin-session';
  const ATTEMPTS_KEY = 'rost-admin-attempts';
  const DEFAULT_PIN = '1234';
  const IMAGES = [
    ['assets/items/espresso.jpg', 'اسپرسو'], ['assets/items/americano.jpg', 'آمریکانو'], ['assets/items/latte.jpg', 'لاته'],
    ['assets/items/mocha.jpg', 'موکا'], ['assets/items/coldbrew.jpg', 'کلدبرو'], ['assets/items/lemonade.jpg', 'لیموناد'],
    ['assets/coffee.jpg', 'قهوه'], ['assets/brunch.jpg', 'صبحانه'], ['assets/items/avocado.jpg', 'آووکادو'],
    ['assets/items/pancake.jpg', 'پنکیک'], ['assets/items/club.jpg', 'ساندویچ'], ['assets/dessert.jpg', 'دسر'],
    ['assets/items/cheesecake.jpg', 'چیزکیک'], ['assets/items/brownie.jpg', 'براونی'], ['assets/hero-cafe.jpg', 'کافه']
  ];

  let data = null;
  let ready = false;
  let pendingLoad = null;
  let activeTab = 'menu';
  let menuQuery = '';
  let editorId = null;

  const toLatinDigits = value => String(value ?? '').replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

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
    $('#login-hint').textContent = custom ? 'رمز مدیر توسط صاحب کافه تنظیم شده است.' : 'رمز پیش‌فرض: 1234 — بعد از ورود از بخش «اطلاعات کافه» عوضش کن.';
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

  const parseIngredients = value => Array.from(new Set(String(value || '')
    .split(/[,،\n]/)
    .map(part => part.trim())
    .filter(Boolean)))
    .slice(0, 10)
    .map(part => part.slice(0, 30));

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
    const value = toLatinDigits(input.value).trim();
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
    if (window.matchMedia?.('(pointer: fine)').matches) {
      setTimeout(() => $('#admin-pin')?.focus({ preventScroll: true }), 120);
    }
  }

  async function showApp() {
    $('#admin-login').hidden = true;
    $('#admin-app').hidden = true;
    await loadData();
    if (!data) { showLogin(); return; }
    $('#admin-app').hidden = false;
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

  function loadData() {
    if (pendingLoad) return pendingLoad;
    $('#admin-menu-list').innerHTML = '<div class="admin-empty"><span aria-hidden="true">⏳</span>در حال خواندن منو…</div>';
    pendingLoad = (async () => {
      try {
        const result = await MenuStore.load();
        data = result.data;
        ready = true;
        renderAll();
      } catch (error) {
        console.error(error);
        toast('اطلاعات منو خوانده نشد.');
      }
    })().finally(() => { pendingLoad = null; });
    return pendingLoad;
  }

  function renderAll() {
    if (!data) return;
    $('#admin-brand-name').textContent = data.settings.name;
    document.title = `پنل مدیریت | ${data.settings.name}`;
    renderStats();
    renderMenuList();
    renderCategories();
    if (!$('#settings-form').contains(document.activeElement)) fillSettings();
    updateSource();
  }

  function renderStats() {
    if (!data) return;
    $('#stat-items').textContent = num(data.items.length);
    $('#stat-out').textContent = num(data.items.filter(item => !item.available).length);
    $('#stat-cats').textContent = num(data.categories.length);
  }

  function updateSource() {
    const saved = MenuStore.readSavedMenu();
    $('#menu-source').textContent = saved
      ? 'الان نسخهٔ ذخیره‌شده در همین مرورگر نمایش داده می‌شود.'
      : 'الان نسخهٔ منتشرشده در سایت نمایش داده می‌شود.';
  }

  function renderMenuList() {
    if (!data) return;
    const query = MenuStore.normalize(menuQuery);
    const items = data.items.filter(item => !query || MenuStore.normalize(`${item.name} ${item.description} ${Array.isArray(item.ingredients) ? item.ingredients.join(' ') : ''}`).includes(query));
    if (!items.length) {
      $('#admin-menu-list').innerHTML = `<div class="admin-empty"><span aria-hidden="true">☕</span>${data.items.length ? 'آیتمی با این جست‌وجو پیدا نشد.' : 'هنوز آیتمی در منو نیست؛ با «آیتم جدید» شروع کن.'}</div>`;
      return;
    }
    $('#admin-menu-list').innerHTML = items.map(item => {
      const category = data.categories.find(entry => entry.id === item.category);
      return `<article class="admin-item${item.available ? '' : ' is-out'}">
        <img class="admin-thumb" src="${esc(item.image)}" alt="" width="96" height="96" loading="lazy">
        <button class="admin-item-text" type="button" data-edit-item="${esc(item.id)}">
          <strong>${esc(item.name)}</strong>
          <small>${esc(category?.name || '')} · ${money(item.price)} تومان</small>
        </button>
        <div class="admin-item-actions">
          <label class="switch">
            <input type="checkbox" data-availability="${esc(item.id)}" aria-label="موجودی ${esc(item.name)}" ${item.available ? 'checked' : ''}>
            <span class="switch-track" aria-hidden="true"></span>
          </label>
          <button class="mini-btn" type="button" data-edit-item="${esc(item.id)}" aria-label="ویرایش ${esc(item.name)}">ویرایش</button>
          <button class="mini-btn danger" type="button" data-delete-item="${esc(item.id)}" aria-label="حذف ${esc(item.name)}">حذف</button>
        </div>
      </article>`;
    }).join('');
  }

  function renderCategories() {
    if (!data) return;
    const rows = data.categories.map(category => {
      const count = data.items.filter(item => item.category === category.id).length;
      return `<div class="category-row">
        <span class="category-name"><span aria-hidden="true">${esc(category.icon || '✦')}</span>${esc(category.name)}</span>
        <span class="category-count">${num(count)} آیتم</span>
        <button class="mini-btn danger" type="button" data-delete-category="${esc(category.id)}">حذف</button>
      </div>`;
    });
    $('#admin-categories').innerHTML = rows.length ? rows.join('') : '<div class="admin-empty">هنوز دسته‌بندی‌ای ساخته نشده است.</div>';
  }

  function fillSettings() {
    if (!data) return;
    const settings = data.settings;
    $('#set-name').value = settings.name;
    $('#set-eyebrow').value = settings.eyebrow;
    $('#set-description').value = settings.description;
    $('#set-hours').value = settings.hours;
    $('#set-phone').value = settings.phone;
    $('#set-instagram').value = settings.instagram;
    $('#set-notice').value = settings.notice;
  }

  /* ---------------- item editor ---------------- */
  function renderImagePicker(selected) {
    $('#image-picker').innerHTML = IMAGES.map(([path, label]) => `<label class="image-option${path === selected ? ' is-selected' : ''}">
      <input type="radio" name="edit-image" value="${esc(path)}" ${path === selected ? 'checked' : ''}>
      <img src="${esc(path)}" alt="" width="120" height="90" loading="lazy">
      <span>${esc(label)}</span>
    </label>`).join('');
  }

  function openEditor(id) {
    if (!data) return;
    if (!data.categories.length) { toast('اول در بخش «اطلاعات کافه» یک دسته‌بندی بساز.'); selectTab('settings'); return; }
    const item = id ? data.items.find(entry => entry.id === id) : null;
    editorId = item ? item.id : null;
    $('#item-editor-title').textContent = item ? 'ویرایش آیتم' : 'آیتم جدید';
    $('#edit-id').value = item?.id || '';
    $('#edit-name').value = item?.name || '';
    $('#edit-price').value = item?.price ?? '';
    $('#edit-category').innerHTML = data.categories.map(category => `<option value="${esc(category.id)}">${esc(category.name)}</option>`).join('');
    $('#edit-category').value = item?.category || data.categories[0].id;
    $('#edit-description').value = item?.description || '';
    $('#edit-ingredients').value = Array.isArray(item?.ingredients) ? item.ingredients.join('، ') : '';
    $('#edit-popular').checked = Boolean(item?.popular);
    $('#edit-available').checked = item ? item.available : true;
    renderImagePicker(item?.image || IMAGES[0][0]);
    openSheet('item-editor');
  }

  function saveEditor(event) {
    event.preventDefault();
    if (!data) return;
    const name = $('#edit-name').value.trim();
    const price = Number($('#edit-price').value);
    const category = $('#edit-category').value;
    const description = $('#edit-description').value.trim();
    const ingredients = parseIngredients($('#edit-ingredients').value);
    const image = $('input[name="edit-image"]:checked')?.value;
    if (!name) { toast('نام آیتم را وارد کن.'); $('#edit-name').focus(); return; }
    if (!Number.isSafeInteger(price) || price < 0) { toast('قیمت را درست وارد کن.'); $('#edit-price').focus(); return; }
    if (!category) { toast('دسته‌بندی را انتخاب کن.'); return; }
    if (!image) { toast('یک تصویر انتخاب کن.'); return; }
    const item = {
      id: editorId || `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name, category, description, ingredients, price, image,
      popular: $('#edit-popular').checked,
      available: $('#edit-available').checked
    };
    const items = editorId ? data.items.map(entry => entry.id === editorId ? item : entry) : [item, ...data.items];
    try {
      data = MenuStore.save({ ...data, items });
      closeSheet();
      toast(editorId ? 'آیتم به‌روزرسانی شد.' : 'آیتم به منو اضافه شد.');
      renderAll();
    } catch (error) {
      toast(error.message || 'ذخیرهٔ آیتم انجام نشد.');
    }
  }

  function toggleAvailability(id, available) {
    if (!data) return;
    const items = data.items.map(item => item.id === id ? { ...item, available } : item);
    try {
      data = MenuStore.save({ ...data, items });
      toast(available ? 'آیتم موجود شد.' : 'آیتم ناموجود شد.');
      renderStats();
      renderMenuList();
      updateSource();
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
      renderAll();
    } catch (error) { toast(error.message || 'حذف انجام نشد.'); }
  }

  /* ---------------- settings ---------------- */
  function saveSettings(event) {
    event.preventDefault();
    if (!data) return;
    const name = $('#set-name').value.trim();
    if (!name) { toast('نام کافه را وارد کن.'); $('#set-name').focus(); return; }
    const next = {
      ...data,
      settings: {
        name,
        eyebrow: $('#set-eyebrow').value.trim(),
        description: $('#set-description').value.trim(),
        hours: $('#set-hours').value.trim(),
        phone: $('#set-phone').value.trim(),
        instagram: $('#set-instagram').value.trim(),
        notice: $('#set-notice').value.trim()
      }
    };
    try {
      data = MenuStore.save(next);
      toast('اطلاعات کافه ذخیره شد.');
      renderAll();
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
      data = MenuStore.save({ ...data, categories: [...data.categories, { id: `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name, icon }] });
      $('#cat-name').value = '';
      $('#cat-icon').value = '';
      toast('دسته‌بندی اضافه شد.');
      renderAll();
    } catch (error) { toast(error.message || 'افزودن دسته انجام نشد.'); }
  }

  function deleteCategory(id) {
    if (!data) return;
    const category = data.categories.find(entry => entry.id === id);
    if (!category) return;
    if (data.items.some(item => item.category === id)) { toast('اول آیتم‌های این دسته را جابه‌جا یا حذف کن.'); return; }
    if (!confirm(`دستهٔ «${category.name}» حذف شود؟`)) return;
    try {
      data = MenuStore.save({ ...data, categories: data.categories.filter(entry => entry.id !== id) });
      toast('دسته حذف شد.');
      renderAll();
    } catch (error) { toast(error.message || 'حذف دسته انجام نشد.'); }
  }

  function savePin(event) {
    event.preventDefault();
    const current = toLatinDigits($('#pin-current').value).trim();
    const next = toLatinDigits($('#pin-new').value).trim();
    if (!verifyPin(current)) { toast('رمز فعلی درست نیست.'); $('#pin-current').focus(); return; }
    if (!/^\d{4,12}$/.test(next)) { toast('رمز جدید باید ۴ تا ۱۲ رقم باشد.'); $('#pin-new').focus(); return; }
    try {
      localStorage.setItem(MenuStore.PIN_KEY, hashPin(next));
      $('#pin-form').reset();
      updateHint();
      toast('رمز مدیر عوض شد.');
    } catch { toast('ذخیرهٔ رمز ممکن نشد.'); }
  }

  /* ---------------- publish ---------------- */
  function downloadMenu() {
    if (!data) return;
    try {
      const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'menu-data.json';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast('فایل منو آماده شد.');
    } catch { toast('ساخت فایل ممکن نشد.'); }
  }

  async function importMenu(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      data = MenuStore.save(parsed);
      renderAll();
      selectTab('menu');
      toast('فایل منو بارگذاری شد.');
    } catch (error) {
      toast(error.message || 'فایل منو معتبر نیست.');
    } finally { input.value = ''; }
  }

  async function resetMenu() {
    if (!confirm('منو به نسخهٔ منتشرشده برگردد؟ تغییرات این مرورگر پاک می‌شود.')) return;
    try {
      MenuStore.resetMenu();
      data = (await MenuStore.load()).data;
      renderAll();
      toast('منوی منتشرشده بازگردانده شد.');
    } catch (error) { toast('بازگردانی انجام نشد.'); }
  }

  /* ---------------- tabs and live updates ---------------- */
  function selectTab(tab) {
    activeTab = tab;
    $$('[data-admin-tab]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.adminTab === tab)));
    $$('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== tab; });
    if (tab === 'settings') fillSettings();
  }

  async function onMenuChanged() {
    if (!ready || $('#admin-app').hidden) return;
    try {
      const result = await MenuStore.load();
      data = result.data;
      $('#admin-brand-name').textContent = data.settings.name;
      renderStats();
      renderMenuList();
      renderCategories();
      updateSource();
      if (activeTab === 'settings' && !$('#settings-form').contains(document.activeElement)) fillSettings();
    } catch (error) { console.error(error); }
  }

  /* ---------------- bindings ---------------- */
  function bind() {
    $('#login-form').addEventListener('submit', onLogin);
    $('#admin-logout').addEventListener('click', logout);
    $$('[data-admin-tab]').forEach(button => button.addEventListener('click', () => selectTab(button.dataset.adminTab)));

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

    $('#image-picker').addEventListener('change', event => {
      if (!event.target.matches('input[name="edit-image"]')) return;
      $$('#image-picker .image-option').forEach(option => option.classList.toggle('is-selected', Boolean(option.querySelector('input')?.checked)));
    });

    $('#item-form').addEventListener('submit', saveEditor);
    $('#settings-form').addEventListener('submit', saveSettings);
    $('#category-form').addEventListener('submit', addCategory);
    $('#admin-categories').addEventListener('click', event => {
      const remove = event.target.closest('[data-delete-category]');
      if (remove) deleteCategory(remove.dataset.deleteCategory);
    });
    $('#pin-form').addEventListener('submit', savePin);

    $('#download-menu').addEventListener('click', downloadMenu);
    $('#import-menu-btn').addEventListener('click', () => $('#import-menu').click());
    $('#import-menu').addEventListener('change', importMenu);
    $('#reset-menu').addEventListener('click', resetMenu);

    window.addEventListener('rost:menu-changed', onMenuChanged);
    window.addEventListener('storage', event => {
      if (event.key === MenuStore.MENU_KEY) onMenuChanged();
    });
  }

  function bindPinPad() {
    const pad = $('#pin-pad');
    const input = $('#admin-pin');
    if (!pad || !input) return;
    pad.addEventListener('click', event => {
      const key = event.target.closest('[data-pin]');
      if (key) {
        input.value = `${input.value}${key.dataset.pin}`.slice(0, 12);
        setError('');
        return;
      }
      if (event.target.closest('[data-pin-clear]')) {
        input.value = '';
        setError('');
        return;
      }
      if (event.target.closest('[data-pin-back]')) {
        input.value = input.value.slice(0, -1);
        setError('');
      }
    });
  }

  function init() {
    bind();
    bindPinPad();
    updateHint();
    selectTab('menu');
    // Avoid a flash of the login card when the tab already holds a session.
    if (isAuthed()) $('#admin-login').hidden = true;
  }

  window.CafeAdmin = { enter };
  init();
})();
