const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const defaults = JSON.parse(fs.readFileSync('menu-data.json'));
function store(options = {}) {
  const context = { window:{ MENU_DEFAULTS: defaults }, location:{ protocol:'https:' }, localStorage:{ getItem:() => null, setItem:() => {} }, setTimeout, clearTimeout, AbortController, fetch:async () => ({ok:true, json:async () => defaults}), ...options };
  vm.runInNewContext(fs.readFileSync('menu-store.js','utf8'), context);
  return context.window.MenuStore;
}
test('published menu validates', () => assert.equal(store().validate(defaults), defaults));
test('rejects duplicate IDs, invalid prices, references, settings and images', () => {
  for (const change of [d => d.items.push(d.items[0]), d => d.categories.push(d.categories[0]), d => d.items[0].price = -1, d => d.items[0].price = '100', d => d.items[0].category = 'missing', d => d.items[0].image = 'javascript:alert(1)', d => d.settings = {}, d => d.items[0].available = 'yes']) {
    const data = structuredClone(defaults); change(data); assert.throws(() => store().validate(data));
  }
});
test('normalizes Persian/Arabic letters, diacritics and half spaces', () => {
  assert.equal(store().normalize('آيس كافي'), 'آیس کافی');
  assert.equal(store().normalize('رُست'), 'رست');
});
test('blocked localStorage cannot break public or admin loading', async () => {
  const s = store({ localStorage:{ getItem:() => { throw new Error('blocked'); } } });
  assert.equal((await s.load()).data.settings.name, defaults.settings.name);
  assert.equal((await s.load({draft:true})).data.settings.name, defaults.settings.name);
});
test('public ignores draft; preview/admin loads it', async () => {
  const draft = structuredClone(defaults); draft.settings.name = 'پیش‌نویس';
  const s = store({ localStorage:{ getItem:() => JSON.stringify(draft) } });
  assert.equal((await s.load()).data.settings.name, defaults.settings.name);
  assert.equal((await s.load({draft:true})).data.settings.name, 'پیش‌نویس');
});
test('corrupt draft is ignored', async () => {
  for (const saved of ['{', '{"settings":{}}']) {
    const s = store({localStorage:{getItem:() => saved}});
    assert.equal((await s.load({draft:true})).data.settings.name, defaults.settings.name);
  }
});
test('network and malformed response fall back to bundled menu', async () => {
  for (const fetch of [async () => {throw new Error('offline');}, async () => ({ok:false}), async () => ({ok:true,json:async () => ({})})]) {
    const result = await store({fetch}).load();
    assert.equal(result.fallback, true);
    assert.equal(result.data.items.length, defaults.items.length);
  }
});
test('direct file opening uses bundled menu without fetch', async () => {
  const result = await store({ location:{protocol:'file:'}, fetch:() => {throw new Error('must not fetch');} }).load();
  assert.equal(result.data.items.length, defaults.items.length);
});
