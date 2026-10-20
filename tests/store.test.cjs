const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

const defaults = JSON.parse(fs.readFileSync('menu-data.json', 'utf8'));
const source = fs.readFileSync('menu-store.js', 'utf8');
const MENU_KEY = 'rost-cafe-menu-v2';

function environment({ savedMenu = null, orders = null, blocked = false, fetchImpl = null, protocol = 'https:' } = {}) {
  const memory = new Map();
  if (savedMenu) memory.set(MENU_KEY, JSON.stringify(savedMenu));
  if (orders) memory.set('rost-orders-v1', JSON.stringify(orders));
  const localStorage = blocked ? {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); }
  } : {
    getItem: key => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: key => memory.delete(key)
  };
  const window = { MENU_DEFAULTS: defaults };
  const context = {
    window, localStorage, location: { protocol }, console,
    setTimeout, clearTimeout, AbortController,
    fetch: fetchImpl || (async () => ({ ok: true, json: async () => defaults }))
  };
  vm.runInNewContext(source, context);
  return { MenuStore: window.MenuStore, OrderStore: window.OrderStore, memory };
}

test('published menu validates and defaults fill optional fields', () => {
  const { MenuStore } = environment();
  assert.equal(MenuStore.validate(defaults), defaults);
  const stripped = structuredClone(defaults);
  delete stripped.settings.notice;
  delete stripped.settings.ordersOpen;
  assert.equal(MenuStore.validate(MenuStore.withDefaults(stripped)).settings.ordersOpen, true);
});

test('rejects duplicate IDs, bad prices, references, images and settings', () => {
  const { MenuStore } = environment();
  const changes = [
    data => data.items.push(data.items[0]),
    data => data.categories.push(data.categories[0]),
    data => { data.items[0].price = -1; },
    data => { data.items[0].price = '100'; },
    data => { data.items[0].category = 'missing'; },
    data => { data.items[0].image = 'javascript:alert(1)'; },
    data => { data.items[0].image = 'assets/../.git/config'; },
    data => { data.settings = {}; },
    data => { data.settings.ordersOpen = 'yes'; },
    data => { data.settings.whatsapp = 5; },
    data => { data.items[0].available = 'yes'; },
    data => { data.items[0].name = ''; }
  ];
  for (const change of changes) {
    const data = structuredClone(defaults);
    change(data);
    assert.throws(() => MenuStore.validate(MenuStore.withDefaults(data)));
  }
});

test('dish ingredients are optional but validated when present', () => {
  const { MenuStore } = environment();
  const without = structuredClone(defaults);
  without.items.forEach(item => { delete item.ingredients; });
  assert.equal(MenuStore.validate(without), without);

  const bad = [
    data => { data.items[0].ingredients = 'شیر'; },
    data => { data.items[0].ingredients = ['']; },
    data => { data.items[0].ingredients = [null]; },
    data => { data.items[0].ingredients = Array.from({ length: 11 }, (_, index) => `item-${index}`); },
    data => { data.items[0].ingredients = ['x'.repeat(31)]; }
  ];
  for (const change of bad) {
    const data = structuredClone(defaults);
    change(data);
    assert.throws(() => MenuStore.validate(data));
  }
});

test('normalizes Persian and Arabic letters, diacritics and half spaces', () => {
  const { MenuStore } = environment();
  assert.equal(MenuStore.normalize('آيس كافي'), 'آیس کافی');
  assert.equal(MenuStore.normalize('رُست'), 'رست');
  assert.equal(MenuStore.normalize('کافه‌لاته'), 'کافهلاته');
});

test('saved menu wins; blocked storage and failed network fall back cleanly', async () => {
  const saved = structuredClone(defaults);
  saved.settings.name = 'کافهٔ تست';
  const first = environment({ savedMenu: saved });
  assert.equal((await first.MenuStore.load()).data.settings.name, 'کافهٔ تست');

  const blocked = environment({ blocked: true, fetchImpl: async () => { throw new Error('offline'); } });
  const result = await blocked.MenuStore.load();
  assert.equal(result.data.items.length, defaults.items.length);
  assert.equal(result.fallback, true);
});

test('corrupt saved menu is ignored; malformed responses fall back to bundled menu', async () => {
  const corrupt = environment();
  corrupt.memory.set(MENU_KEY, '{');
  const result = await corrupt.MenuStore.load();
  assert.equal(result.data.items.length, defaults.items.length);

  for (const fetchImpl of [
    async () => ({ ok: false }),
    async () => ({ ok: true, json: async () => ({}) })
  ]) {
    const env = environment({ fetchImpl });
    const loaded = await env.MenuStore.load();
    assert.equal(loaded.fallback, true);
    assert.equal(loaded.data.items.length, defaults.items.length);
  }
});

test('direct file opening uses the bundled menu without fetching', async () => {
  const { MenuStore } = environment({ protocol: 'file:', fetchImpl: () => { throw new Error('must not fetch'); } });
  const result = await MenuStore.load();
  assert.equal(result.data.items.length, defaults.items.length);
  assert.equal(result.fallback, true);
});

test('saving and resetting the menu are validated', async () => {
  const { MenuStore } = environment();
  const next = structuredClone(defaults);
  next.items[0].price = 123456;
  MenuStore.save(next);
  assert.equal((await MenuStore.load()).data.items[0].price, 123456);
  assert.throws(() => MenuStore.save({ ...next, items: [{ ...next.items[0], image: 'http://evil.test/x.jpg' }] }));
  MenuStore.resetMenu();
  assert.equal((await MenuStore.load()).data.items[0].price, defaults.items[0].price);
});

test('orders are created with a safe total and follow the status flow', () => {
  const { OrderStore } = environment();
  const order = OrderStore.add({
    code: '1234', table: '5', note: 'بدون شکر',
    items: [
      { id: 'latte', name: 'کافه لاته', price: 145000, qty: 2 },
      { id: 'brownie', name: 'براونی شکلاتی', price: 85000, qty: 1 }
    ]
  });
  assert.equal(order.total, 375000);
  assert.equal(order.status, 'new');
  assert.equal(OrderStore.list().length, 1);
  assert.equal(OrderStore.update(order.id, { status: 'preparing' }).status, 'preparing');
  assert.equal(OrderStore.list()[0].status, 'preparing');
  assert.throws(() => OrderStore.update(order.id, { status: 'done' }));
  assert.throws(() => OrderStore.update('missing', { status: 'served' }));
});

test('invalid orders and an empty table are rejected', () => {
  const { OrderStore } = environment();
  assert.throws(() => OrderStore.add({ table: '', items: [{ id: 'x', name: 'x', price: 1000, qty: 1 }] }));
  assert.throws(() => OrderStore.add({ table: '3', items: [] }));
  assert.throws(() => OrderStore.add({ table: '3', items: [{ id: 'x', name: 'x', price: 1000, qty: 0 }] }));
  assert.throws(() => OrderStore.add({ table: '3', items: [{ id: 'x', name: 'x', price: -5, qty: 1 }] }));
  assert.equal(OrderStore.list().length, 0);
});

test('tracking remembers only this device orders and clearing removes them', () => {
  const { OrderStore } = environment();
  const order = OrderStore.add({ table: '7', items: [{ id: 'espresso', name: 'اسپرسو دبل', price: 95000, qty: 1 }] });
  OrderStore.rememberMine(order.id);
  assert.deepEqual(JSON.parse(JSON.stringify(OrderStore.myIds())), [order.id]);
  OrderStore.clear();
  assert.equal(OrderStore.list().length, 0);
  assert.deepEqual(Array.from(OrderStore.myIds()), []);
});
