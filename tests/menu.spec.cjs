const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const data = JSON.parse(fs.readFileSync('menu-data.json', 'utf8'));
const coffeeCount = data.items.filter(item => item.category === 'coffee').length;

test('customer can browse, filter and search the menu', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error));
  await page.goto('/');
  await expect(page.locator('.item-card')).toHaveCount(data.items.length);
  await page.locator('.cat-chip', { hasText: 'قهوهٔ گرم' }).click();
  await expect(page.locator('.item-card')).toHaveCount(coffeeCount);
  await page.locator('#menu-search').fill('آمري');
  await expect(page.locator('.item-card')).toHaveCount(1);
  await page.locator('#menu-search').fill('چیزی که نداریم');
  await expect(page.locator('#empty-state')).toBeVisible();
  await page.locator('#reset-search').click();
  await expect(page.locator('.item-card')).toHaveCount(data.items.length);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('customer orders from the table and the owner sees it live', async ({ page }) => {
  await page.goto('/?table=5');
  await expect(page.locator('#head-table')).toBeVisible();
  await expect(page.locator('#head-table')).toContainText('میز 5');

  await page.locator('[data-add="espresso"]').click();
  await page.locator('[data-add="latte"]').click();
  await expect(page.locator('#cart-count')).toHaveText('۲');
  await page.locator('#cart-bar-btn').click();
  await expect(page.locator('#cart-sheet')).toBeVisible();
  await expect(page.locator('#table-input')).toHaveValue('5');
  await page.locator('#note-input').fill('بدون شکر');
  await page.locator('#submit-order').click();

  await expect(page.locator('#success-sheet')).toBeVisible();
  const code = (await page.locator('.order-code strong').textContent()).trim();
  expect(code).toMatch(/^\d{4}$/);
  await expect(page.locator('#success-status')).toContainText('سفارش جدید');
  await page.getByRole('button', { name: 'پیگیری سفارش' }).click();
  await expect(page.locator('#my-orders-sheet')).toBeVisible();
  await expect(page.locator('#my-orders-body')).toContainText(code);

  await page.goto('/#admin');
  await expect(page.locator('#admin-login')).toBeVisible();
  await page.locator('#admin-pin').fill('0000');
  await page.getByRole('button', { name: 'ورود به پنل' }).click();
  await expect(page.locator('#login-error')).toBeVisible();
  await page.locator('#admin-pin').fill('1234');
  await page.getByRole('button', { name: 'ورود به پنل' }).click();
  await expect(page.locator('#admin-app')).toBeVisible();
  await expect(page.locator('.order-card')).toHaveCount(1);
  await expect(page.locator('.order-card')).toContainText(code);
  await expect(page.locator('.order-card')).toContainText('میز 5');
  await expect(page.locator('.order-card')).toContainText('بدون شکر');

  await page.getByRole('button', { name: 'شروع آماده‌سازی' }).click();
  await expect(page.locator('.order-card .status-pill')).toHaveText('در حال آماده‌سازی');

  await page.goto('/');
  await page.locator('#cart-trigger').click();
  await page.locator('#open-my-orders').click();
  await expect(page.locator('#my-orders-body .status-pill')).toHaveText('در حال آماده‌سازی');
});

test('owner edits availability, prices and adds an item', async ({ page }) => {
  await page.goto('/#admin');
  await page.locator('#admin-pin').fill('1234');
  await page.getByRole('button', { name: 'ورود به پنل' }).click();
  await expect(page.locator('#admin-app')).toBeVisible();

  await page.locator('[data-admin-tab="menu"]').click();
  await page.locator('[data-availability="espresso"]').uncheck();
  await expect(page.locator('#toast')).toContainText('ناموجود');

  await page.goto('/');
  const espresso = page.locator('.item-card').filter({ has: page.locator('[data-open="espresso"]') });
  await expect(espresso).toContainText('ناموجود');
  await expect(page.locator('[data-add="espresso"]')).toHaveCount(0);

  await page.goto('/#admin');
  await expect(page.locator('#admin-app')).toBeVisible();
  await page.locator('[data-admin-tab="menu"]').click();
  await page.locator('[data-edit-item="latte"]').click();
  await expect(page.locator('#item-editor')).toBeVisible();
  await page.locator('#edit-price').fill('150000');
  await page.getByRole('button', { name: 'ذخیرهٔ آیتم' }).click();
  await expect(page.locator('#toast')).toContainText('به‌روزرسانی');

  await page.locator('#add-item').click();
  await page.locator('#edit-name').fill('کیک تست');
  await page.locator('#edit-price').fill('99000');
  await page.locator('#edit-category').selectOption('dessert');
  await page.getByRole('button', { name: 'ذخیرهٔ آیتم' }).click();
  await expect(page.locator('#admin-menu-list')).toContainText('کیک تست');

  await page.goto('/');
  await expect(page.locator('.item-card')).toHaveCount(data.items.length + 1);
  await expect(page.locator('.item-card').filter({ has: page.locator('[data-open="latte"]') })).toContainText('۱۵۰٬۰۰۰');
});

test('order can be forwarded to the cafe WhatsApp when configured', async ({ page }) => {
  await page.goto('/#admin');
  await page.locator('#admin-pin').fill('1234');
  await page.getByRole('button', { name: 'ورود به پنل' }).click();
  await page.locator('[data-admin-tab="settings"]').click();
  await page.locator('#set-whatsapp').fill('989121234567');
  await page.getByRole('button', { name: 'ذخیرهٔ اطلاعات' }).click();
  await expect(page.locator('#toast')).toContainText('ذخیره');

  await page.goto('/?table=2');
  await page.locator('[data-add="espresso"]').click();
  await page.locator('#cart-bar-btn').click();
  await page.locator('#submit-order').click();
  const link = page.getByRole('link', { name: 'ارسال سفارش در واتساپ' });
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href).toContain('https://wa.me/989121234567?text=');
  const text = decodeURIComponent(href.split('?text=')[1]);
  expect(text).toContain('میز: 2');
  expect(text).toContain('اسپرسو دبل');
  await page.goto('/');
  await expect(page.locator('#foot-links')).toContainText('واتساپ کافه');
});

test('closed ordering and a saved cafe notice are respected', async ({ page }) => {
  await page.goto('/#admin');
  await page.locator('#admin-pin').fill('1234');
  await page.getByRole('button', { name: 'ورود به پنل' }).click();
  await page.locator('[data-admin-tab="settings"]').click();
  await page.locator('#set-notice').fill('امروز دسر ویژه داریم.');
  await page.locator('#set-orders-open').uncheck();
  await page.getByRole('button', { name: 'ذخیرهٔ اطلاعات' }).click();
  await expect(page.locator('#toast')).toContainText('ذخیره');

  await page.goto('/');
  await expect(page.locator('#notice-banner')).toContainText('امروز دسر ویژه داریم.');
  await expect(page.locator('[data-add]')).toHaveCount(0);
});

test('works with blocked storage and failed JSON request', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }));
  await page.route('**/menu-data.json', route => route.abort());
  await page.goto('/');
  await expect(page.locator('.item-card')).toHaveCount(data.items.length);
  await expect(page.locator('#notice-banner')).toBeVisible();
});

test('phone and desktop layouts fit without horizontal page scroll', async ({ page }) => {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    for (const path of ['/', '/qr.html', '/#admin']) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} at ${width}`).toBe(true);
    }
  }
});
