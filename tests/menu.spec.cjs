const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const data = JSON.parse(fs.readFileSync('menu-data.json', 'utf8'));
const coffeeCount = data.items.filter(item => item.category === 'coffee').length;

async function login(page) {
  await page.goto('/#admin');
  await page.locator('#admin-pin').fill('1234');
  await page.getByRole('button', { name: 'ورود به پنل' }).click();
  await expect(page.locator('#admin-app')).toBeVisible();
}

test('the admin short URL opens the pin screen and dishes list their ingredients', async ({ page }) => {
  await page.goto('/admin/');
  await expect(page).toHaveURL(/#admin$/);
  await expect(page.locator('#admin-login')).toBeVisible();
  await expect(page.locator('#admin-pin')).toBeVisible();

  await page.goto('/');
  await page.locator('[data-open="latte"]').click();
  await expect(page.locator('#item-sheet')).toBeVisible();
  await expect(page.locator('.ingredient-chips')).toContainText('شیر تازه');
  await expect(page.locator('.ingredient-chips')).toContainText('اسپرسو');
  await expect(page.locator('#item-sheet')).not.toContainText('افزودن');

  await page.goto('/');
  await page.locator('#search-open-hero').click();
  await page.locator('#menu-search').fill('پسته');
  await expect(page.locator('#search-results .menu-item')).toHaveCount(1);
  await expect(page.locator('#search-results .menu-item')).toContainText('آیس لاته پسته');
  await expect(page.locator('#search-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#search-panel')).toBeHidden();
});

test('the menu is view-only and customers can browse, filter and search it', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error));
  await page.goto('/');
  await expect(page.locator('#menu-grid .menu-item')).toHaveCount(data.items.length);
  await page.locator('.cat-chip', { hasText: 'قهوهٔ گرم' }).click();
  await expect(page.locator('#menu-grid .menu-item')).toHaveCount(coffeeCount);
  await page.locator('#search-open').click();
  await page.locator('#menu-search').fill('آمري');
  await expect(page.locator('#search-results .menu-item')).toHaveCount(1);
  await page.locator('#menu-search').fill('چیزی که نداریم');
  await expect(page.locator('#search-empty')).toBeVisible();
  await page.locator('#search-empty-clear').click();
  await expect(page.locator('#search-panel')).toBeHidden();
  await expect(page.locator('#menu-grid .menu-item')).toHaveCount(data.items.length);

  // No cart, no add button and no visible link into the owner panel.
  await expect(page.locator('[data-add]')).toHaveCount(0);
  await expect(page.locator('#cart-sheet')).toHaveCount(0);
  await expect(page.locator('.site-foot').getByText('ورود مدیر')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('mobile quick search and dish details are usable with touch-sized controls', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await page.locator('#search-open').click();
  await expect(page.locator('#menu-search')).toBeFocused();
  await expect(page.locator('#search-suggestions')).toContainText('دسته‌بندی‌ها');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#menu-search').fill('لاته');
  await expect(page.locator('#search-results .menu-item')).toContainText('لاته');
  await page.locator('#search-results [data-open="latte"]').click();
  await expect(page.locator('#item-sheet')).toBeVisible();
  await expect(page.locator('#search-panel')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#item-sheet')).toContainText('ترکیبات');
  await page.keyboard.press('Escape');
  await expect(page.locator('#item-sheet')).toBeHidden();
  await expect(page.locator('#search-open')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('owner can hide a dish, change a price and add a new item', async ({ page }) => {
  await login(page);

  await page.locator('[data-admin-tab="menu"]').click();
  await page.locator('[data-availability="espresso"]').uncheck();
  await expect(page.locator('#toast')).toContainText('ناموجود');

  await page.goto('/');
  const espresso = page.locator('#menu-grid .menu-item').filter({ has: page.locator('[data-open="espresso"]') });
  await expect(espresso).toContainText('ناموجود');

  await page.goto('/#admin');
  await expect(page.locator('#admin-app')).toBeVisible();
  await page.locator('[data-admin-tab="menu"]').click();
  await page.locator('.admin-item-text[data-edit-item="latte"]').click();
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
  await expect(page.locator('#menu-grid .menu-item')).toHaveCount(data.items.length + 1);
  await expect(page.locator('#menu-grid .menu-item').filter({ has: page.locator('[data-open="latte"]') })).toContainText('۱۵۰٬۰۰۰');
});

test('owner can edit café details, add a category and change the PIN', async ({ page }) => {
  await login(page);
  await page.locator('[data-admin-tab="settings"]').click();
  await page.locator('#set-name').fill('کافه تست');
  await page.locator('#set-notice').fill('امروز دسر ویژه داریم.');
  await page.getByRole('button', { name: 'ذخیرهٔ اطلاعات' }).click();
  await expect(page.locator('#toast')).toContainText('ذخیره');

  await page.goto('/');
  await expect(page.locator('#notice-banner')).toContainText('امروز دسر ویژه داریم.');
  await expect(page.locator('.brand-name').first()).toHaveText('کافه تست');

  await page.goto('/#admin');
  await expect(page.locator('#admin-app')).toBeVisible();
  await page.locator('[data-admin-tab="settings"]').click();
  await page.locator('#cat-name').fill('نوشیدنی گرم');
  await page.locator('#category-form').getByRole('button', { name: 'افزودن' }).click();
  await expect(page.locator('#admin-categories')).toContainText('نوشیدنی گرم');

  await page.locator('#pin-current').fill('1234');
  await page.locator('#pin-new').fill('4321');
  await page.locator('#pin-form').getByRole('button', { name: 'تغییر رمز' }).click();
  await expect(page.locator('#toast')).toContainText('رمز مدیر عوض شد');

  await page.locator('#admin-logout').click();
  await page.locator('#admin-pin').fill('1234');
  await page.getByRole('button', { name: 'ورود به پنل' }).click();
  await expect(page.locator('#login-error')).toBeVisible();
  await page.locator('#admin-pin').fill('4321');
  await page.getByRole('button', { name: 'ورود به پنل' }).click();
  await expect(page.locator('#admin-app')).toBeVisible();
});

test('owner can download the current menu as menu-data.json', async ({ page }) => {
  await login(page);
  await page.locator('[data-admin-tab="settings"]').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#download-menu').click()
  ]);
  expect(download.suggestedFilename()).toBe('menu-data.json');
  const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  expect(exported.items.length).toBe(data.items.length);
  expect(exported.settings.name).toBe(data.settings.name);
});

test('works with blocked storage and failed JSON request', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }));
  await page.route('**/menu-data.json', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#menu-grid .menu-item')).toHaveCount(data.items.length);
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
