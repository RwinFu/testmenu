const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

function build(mode) {
  execFileSync(process.execPath, ['scripts/build.mjs', mode], { stdio: 'pipe' });
}

test('public build ships the view-only menu and the pin-gated owner panel', () => {
  build('--site');
  for (const name of ['index.html', 'admin.html', 'qr.html', 'app.js', 'admin.js', 'menu-store.js', 'menu-data.json', 'menu-defaults.js']) {
    assert.equal(fs.existsSync(`_site/${name}`), true, `${name} should be published`);
  }
  assert.equal(fs.existsSync('_site/assets/items/latte.jpg'), true);
  assert.equal(fs.existsSync('_site/admin/index.html'), true);
  const adminRedirect = fs.readFileSync('_site/admin/index.html', 'utf8');
  assert.match(adminRedirect, /#admin/);
  assert.match(adminRedirect, /noindex, nofollow/);
  assert.equal(fs.existsSync('_site/tests'), false);
  assert.equal(fs.existsSync('_site/.git'), false);
  assert.equal(fs.existsSync('_site/package.json'), false);

  const index = fs.readFileSync('_site/index.html', 'utf8');
  assert.match(index, /id="admin-view"/);
  assert.match(index, /id="admin-pin"/);
  assert.match(index, /<script src="admin\.js" defer><\/script>/);
  assert.match(index, /Content-Security-Policy/);
  assert.doesNotMatch(index, /\sstyle=/);
  assert.doesNotMatch(index, /\son(click|change|submit)=/);
  // The customer menu is view-only and has no visible door to the owner panel.
  assert.doesNotMatch(index, /id="cart-sheet"/);
  assert.doesNotMatch(index, /id="order-form"/);
  assert.doesNotMatch(index, /data-add=/);
  assert.doesNotMatch(index, /href="#admin"/);

  const redirect = fs.readFileSync('_site/admin.html', 'utf8');
  assert.match(redirect, /#admin/);
  assert.match(redirect, /noindex, nofollow/);
});

test('local build mirrors the public build for npm start', () => {
  build('--local');
  for (const name of ['index.html', 'admin.html', 'admin.js', 'menu-store.js', 'style.css']) {
    assert.equal(fs.existsSync(`_local-site/${name}`), true, `${name} should exist locally`);
  }
  assert.equal(fs.existsSync('_local-site/tests'), false);
});

test('generated defaults match the published menu', () => {
  build('--site');
  const generated = fs.readFileSync('_site/menu-defaults.js', 'utf8');
  const raw = generated.slice(generated.indexOf('{'), generated.lastIndexOf(';'));
  const data = JSON.parse(raw);
  const source = JSON.parse(fs.readFileSync('menu-data.json', 'utf8'));
  assert.deepEqual(data, source);
});

test('scripts are syntactically valid', () => {
  for (const name of ['app.js', 'admin.js', 'menu-store.js']) {
    assert.doesNotThrow(() => new Function(fs.readFileSync(name, 'utf8')), `${name} should parse`);
  }
});
