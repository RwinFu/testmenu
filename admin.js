(() => {
  const money = value => new Intl.NumberFormat('fa-IR').format(Number(value) || 0);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let data;
  let toastTimer;
  let lastFocus;
  function closeModal() {
    $('#item-modal').hidden = true;
    document.body.classList.remove('modal-open');
    lastFocus?.focus();
  }
  const $ = selector => document.querySelector(selector);
  async function start() {
    try {
      const result = await MenuStore.load({ draft: true });
      data = result.data;
      render(); bind();
    } catch (error) {
      $('.admin-main').innerHTML = '<p>اطلاعات منو بارگذاری نشد. لطفاً این سایت رو از طریق وب‌سرور باز کن، نه با باز کردن مستقیم فایل.</p>';
      console.error(error);
    }
  }
  function persist(message = 'تغییرات در همین مرورگر ذخیره شد.') {
    try { MenuStore.save(data); render(); notify(message); }
    catch (error) { render(); notify('ذخیره نشد؛ حافظهٔ مرورگر بسته یا پر است. قبل از بستن صفحه خروجی بگیر.'); console.error(error); }
  }
  function notify(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600); }
  function render() {
    document.querySelectorAll('[data-setting="name"]').forEach(el => el.textContent = data.settings.name);
    document.title = `مدیریت منو | ${data.settings.name}`;
    $('#stat-items').textContent = money(data.items.length);
    $('#stat-available').textContent = money(data.items.filter(item => item.available).length);
    $('#stat-categories').textContent = money(data.categories.length);
    renderFilters(); renderItems(); renderCategories(); fillSettings();
  }
  function renderFilters() {
    const filter = $('#filter-category'); const current = filter.value || 'all';
    filter.innerHTML = '<option value="all">همه‌ی دسته‌بندی‌ها</option>' + data.categories.map(cat => `<option value="${esc(cat.id)}">${esc(cat.name)}</option>`).join('');
    if ([...filter.options].some(option => option.value === current)) filter.value = current;
  }
  function renderItems() {
    const term = MenuStore.normalize($('#admin-search').value);
    const category = $('#filter-category').value; const availability = $('#filter-availability').value;
    const entries = data.items.filter(item => (!term || MenuStore.normalize(`${item.name} ${item.description}`).includes(term)) && (category === 'all' || item.category === category) && (availability === 'all' || (availability === 'available' ? item.available : !item.available)));
    $('#items-table').innerHTML = entries.map(item => {
      const cat = data.categories.find(categoryItem => categoryItem.id === item.category);
      return `<tr><td><div class="table-name"><img src="${esc(item.image)}" alt="" loading="lazy"><div><strong>${esc(item.name)}</strong><small>${item.popular ? '✦ پرطرفدار' : 'منوی کافه'}</small></div></div></td><td data-label="دسته‌بندی">${esc(cat?.name || '—')}</td><td data-label="قیمت">${money(item.price)} تومان</td><td data-label="وضعیت"><span class="availability ${item.available ? '' : 'off'}">${item.available ? 'موجود' : 'ناموجود'}</span></td><td data-label="عملیات"><div class="table-actions"><button data-edit="${esc(item.id)}">ویرایش</button><button data-toggle="${esc(item.id)}">${item.available ? 'ناموجود' : 'موجود'}</button><button data-delete="${esc(item.id)}" aria-label="حذف ${esc(item.name)}">حذف</button></div></td></tr>`;
    }).join('') || '<tr><td colspan="5">آیتمی با این مشخصات پیدا نشد.</td></tr>';
    $('#items-table').querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => openModal(button.dataset.edit)));
    $('#items-table').querySelectorAll('[data-toggle]').forEach(button => button.addEventListener('click', () => { const item = data.items.find(entry => entry.id === button.dataset.toggle); item.available = !item.available; persist(item.available ? 'آیتم به منوی قابل سفارش برگشت.' : 'آیتم به‌عنوان ناموجود علامت خورد.'); }));
    $('#items-table').querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => { const item = data.items.find(entry => entry.id === button.dataset.delete); if (confirm(`«${item.name}» از منو حذف بشه؟`)) { data.items = data.items.filter(entry => entry.id !== item.id); persist('آیتم حذف شد.'); } }));
  }
  function renderCategories() {
    $('#category-admin-list').innerHTML = data.categories.map(cat => `<div class="category-row"><span class="category-emoji">${esc(cat.icon || '✳')}</span><strong>${esc(cat.name)}</strong><small>${money(data.items.filter(item => item.category === cat.id).length)} آیتم</small><button data-category-delete="${esc(cat.id)}" title="حذف دسته‌بندی" aria-label="حذف ${esc(cat.name)}">حذف</button></div>`).join('') || '<p>هنوز دسته‌بندی‌ای نداریم.</p>';
    $('#category-admin-list').querySelectorAll('[data-category-delete]').forEach(button => button.addEventListener('click', () => {
      const id = button.dataset.categoryDelete; const cat = data.categories.find(category => category.id === id);
      if (data.items.some(item => item.category === id)) { notify('اول آیتم‌های این دسته رو جابه‌جا یا حذف کن.'); return; }
      if (confirm(`دسته‌ی «${cat.name}» حذف بشه؟`)) { data.categories = data.categories.filter(category => category.id !== id); persist('دسته‌بندی حذف شد.'); }
    }));
  }
  function fillSettings() {
    $('#setting-name').value = data.settings.name || '';
    $('#setting-eyebrow').value = data.settings.eyebrow || '';
    $('#setting-description').value = data.settings.description || '';
    $('#setting-hours').value = data.settings.hours || '';
  }
  function fillCategorySelect(selected) {
    $('#item-category').innerHTML = data.categories.map(cat => `<option value="${esc(cat.id)}">${esc(cat.name)}</option>`).join('');
    if (selected) $('#item-category').value = selected;
  }
  function openModal(id) {
    const item = id ? data.items.find(entry => entry.id === id) : null;
    if (!data.categories.length) { notify('برای افزودن آیتم، اول یک دسته‌بندی بساز.'); return; }
    $('#item-form').reset(); $('#item-id').value = item?.id || '';
    $('#modal-title').textContent = item ? 'ویرایش آیتم' : 'افزودن آیتم';
    $('#item-name').value = item?.name || ''; $('#item-price').value = item?.price ?? '';
    $('#item-description').value = item?.description || ''; $('#item-popular').checked = item?.popular || false; $('#item-available').checked = item?.available ?? true;
    fillCategorySelect(item?.category || data.categories[0].id);
    $('#item-image').value = item?.image || 'assets/hero-cafe.jpg';
    lastFocus = document.activeElement;
    $('#item-modal').hidden = false; document.body.classList.add('modal-open'); $('#item-name').focus();
  }
  function bind() {
    $('#admin-search').addEventListener('input', renderItems);
    $('#filter-category').addEventListener('change', renderItems);
    $('#filter-availability').addEventListener('change', renderItems);
    $('#add-item').addEventListener('click', () => openModal());
    $('#cancel-modal').addEventListener('click', closeModal);
    $('#item-modal').addEventListener('click', event => { if (event.target === $('#item-modal')) closeModal(); });
    document.addEventListener('keydown', event => { if ($('#item-modal').hidden) return;
      if (event.key === 'Escape') closeModal();
      if (event.key === 'Tab') {
        const controls = [...$('#item-form').querySelectorAll('input:not([type=hidden]), select, textarea, button')];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      } });
    $('#item-form').addEventListener('submit', event => {
      event.preventDefault(); const id = $('#item-id').value || `item-${Date.now()}`;
      const item = { id, name: $('#item-name').value.trim(), category: $('#item-category').value, description: $('#item-description').value.trim(), price: Number($('#item-price').value), image: $('#item-image').value, popular: $('#item-popular').checked, available: $('#item-available').checked };
      try { MenuStore.validate({ ...data, items: [item] }); } catch { notify('نام و قیمت معتبر وارد کن.'); return; }
      const index = data.items.findIndex(entry => entry.id === id);
      if (index >= 0) data.items[index] = item; else data.items.unshift(item);
      closeModal(); persist(index >= 0 ? 'اطلاعات آیتم به‌روزرسانی شد.' : 'آیتم جدید به منو اضافه شد.');
    });
    $('#settings-form').addEventListener('submit', event => {
      event.preventDefault();
      if (!$('#setting-name').value.trim()) { notify('نام کافه را وارد کن.'); $('#setting-name').focus(); return; }
      data.settings.name = $('#setting-name').value.trim(); data.settings.eyebrow = $('#setting-eyebrow').value.trim(); data.settings.description = $('#setting-description').value.trim(); data.settings.hours = $('#setting-hours').value.trim(); persist('اطلاعات کافه ذخیره شد.');
    });
    $('#add-category').addEventListener('click', () => {
      const name = prompt('نام دسته‌بندی جدید:'); if (!name?.trim()) return;
      if (name.trim().length > 80) { notify('نام دسته‌بندی باید کمتر از ۸۰ حرف باشد.'); return; }
      if (data.categories.some(cat => cat.name.trim() === name.trim())) { notify('این دسته‌بندی از قبل وجود داره.'); return; }
      const id = `cat-${Date.now()}`; data.categories.push({id, name:name.trim(), icon:'✳'}); persist('دسته‌بندی اضافه شد.');
    });
    $('#export-button').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'}); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'menu-data.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('فایل menu-data.json دانلود شد.');
    });
    $('#import-button').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', async event => {
      const file = event.target.files[0]; if (!file) return;
      if (file.size > 2 * 1024 * 1024) { notify('حجم فایل نباید بیشتر از ۲ مگابایت باشد.'); event.target.value = ''; return; }
      try {
        const imported = JSON.parse(await file.text());
        MenuStore.validate(imported);
        if (confirm('منوی فعلی با اطلاعات این فایل جایگزین بشه؟')) { data = imported; persist('فایل منو بارگذاری و ذخیره شد.'); }
      } catch { notify('فایل معتبر نیست؛ یک menu-data.json درست انتخاب کن.'); }
      event.target.value = '';
    });
  }
  start();
})();
