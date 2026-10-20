const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const data = JSON.parse(fs.readFileSync('menu-data.json'));
test('mobile menu, categories, search and reset', async ({page}) => {
  const errors = []; page.on('pageerror', error => errors.push(error));
  await page.goto('/');
  await expect(page.locator('.menu-card')).toHaveCount(data.items.length);
  await page.getByRole('button', {name:'قهوه گرم'}).click();
  await expect(page.locator('.menu-card')).toHaveCount(data.items.filter(i => i.category === 'coffee').length);
  await page.locator('#menu-search').fill('آمري');
  await expect(page.locator('.menu-card')).toHaveCount(1);
  await page.locator('#menu-search').fill('چیزی که نداریم');
  await expect(page.locator('#empty-state')).toBeVisible();
  await page.locator('#reset-search').click();
  await expect(page.locator('.menu-card')).toHaveCount(data.items.length);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('customer menu does not link to admin; owner route remains available', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('a[href="admin.html"]')).toHaveCount(0);
  await page.goto('/index.html?preview=1');
  await expect(page.locator('#preview-banner')).toBeVisible();
  await expect(page.locator('a[href="admin.html"]')).toHaveCount(0);
  await page.goto('/admin.html');
  await expect(page.locator('#items-table tr')).toHaveCount(data.items.length);
});
test('works with blocked storage and failed JSON request', async ({page}) => {
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', {get(){throw new Error('blocked');}}));
  await page.route('**/menu-data.json', route => route.abort());
  await page.goto('/');
  await expect(page.locator('.menu-card')).toHaveCount(data.items.length);
  await expect(page.locator('#load-notice')).toBeVisible();
  await page.goto('/admin.html');
  await expect(page.locator('#items-table tr')).toHaveCount(data.items.length);
});
test('admin edit persists, preview isolated from customer, export and import', async ({page}) => {
  await page.goto('/admin.html');
  await expect(page.locator('#items-table tr')).toHaveCount(data.items.length);
  await page.locator('[data-edit="espresso"]').click();
  await page.locator('#item-price').fill('123456');
  await page.getByRole('button', {name:'ذخیره آیتم'}).click();
  await expect(page.locator('#toast')).toContainText('به‌روزرسانی');
  await page.reload();
  await expect(page.locator('#items-table tr').filter({has:page.locator('[data-edit="espresso"]')})).toContainText('۱۲۳٬۴۵۶');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-button').click();
  const download = await downloadPromise;
  const exported = JSON.parse(fs.readFileSync(await download.path()));
  expect(exported.items.find(i => i.id === 'espresso').price).toBe(123456);
  await page.goto('/index.html?preview=1');
  await expect(page.locator('#preview-banner')).toBeVisible();
  await expect(page.locator('.menu-card').filter({has:page.getByRole('heading', {name:'اسپرسو دبل',exact:true})})).toContainText('۱۲۳٬۴۵۶');
  await page.goto('/');
  await expect(page.locator('.menu-card').filter({has:page.getByRole('heading', {name:'اسپرسو دبل',exact:true})})).not.toContainText('۱۲۳٬۴۵۶');
  await page.goto('/admin.html');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#import-file').setInputFiles({name:'menu-data.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(data))});
  await expect(page.locator('#toast')).toContainText('بارگذاری و ذخیره');
  await page.locator('[data-toggle="espresso"]').click();
  await page.goto('/index.html?preview=1');
  await expect(page.locator('.menu-card').filter({has:page.getByRole('heading', {name:'اسپرسو دبل',exact:true})})).toContainText('فعلاً ناموجود');
});
test('admin add/delete item and category; reject malformed import', async ({page}) => {
  await page.goto('/admin.html');
  await expect(page.locator('#items-table tr')).toHaveCount(data.items.length);
  page.once('dialog', dialog => dialog.accept('دسته آزمایشی'));
  await page.locator('#add-category').click();
  await expect(page.locator('#category-admin-list')).toContainText('دسته آزمایشی');
  await page.locator('#add-item').click();
  await page.locator('#item-name').fill('آیتم آزمایشی');
  await page.locator('#item-price').fill('100');
  await page.locator('#item-category').selectOption({label:'دسته آزمایشی'});
  await page.getByRole('button', {name:'ذخیره آیتم'}).click();
  const row = page.locator('#items-table tr').filter({hasText:'آیتم آزمایشی'});
  await expect(row).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await row.getByRole('button', {name:'حذف آیتم آزمایشی',exact:true}).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', {name:'حذف دسته آزمایشی',exact:true}).click();
  await expect(page.locator('#category-admin-list')).not.toContainText('دسته آزمایشی');
  await page.locator('#import-file').setInputFiles({name:'bad.json', mimeType:'application/json', buffer:Buffer.from('{"items":[{}],"categories":[],"settings":{}}')});
  await expect(page.locator('#toast')).toContainText('معتبر نیست');
});
test('phone and desktop layouts fit without horizontal page scroll', async ({page}) => {
  for (const width of [320,390,768,1280]) {
    await page.setViewportSize({width,height:850});
    for (const path of ['/','/admin.html','/qr.html']) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} at ${width}`).toBe(true);
    }
  }
});
