const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

function build(mode) {
  execFileSync(process.execPath, ['scripts/build.mjs', mode], { stdio:'pipe' });
}

test('public Pages artifact exposes only a GitHub-authenticated admin gateway', () => {
  build('--site');
  assert.equal(fs.existsSync('_site/admin.html'), true);
  assert.equal(fs.existsSync('_site/admin.js'), false);
  assert.equal(fs.existsSync('_site/index.html'), true);
  assert.equal(fs.existsSync('_site/qr.js'), true);
  const index = fs.readFileSync('_site/index.html', 'utf8');
  const gateway = fs.readFileSync('_site/admin.html', 'utf8');
  assert.doesNotMatch(index, /href=["']admin\.html["']/);
  assert.match(index, /Content-Security-Policy/);
  assert.match(gateway, /github\.com\/RwinFu\/testmenu\/edit\/main\/menu-data\.json/);
  assert.match(gateway, /Content-Security-Policy/);
  assert.match(gateway, /noindex, nofollow/);
  assert.doesNotMatch(gateway, /id="items-table"|src="admin\.js"/);
});

test('local-only output includes the editor without exposing repository files', () => {
  build('--local');
  assert.equal(fs.existsSync('_local-site/admin.html'), true);
  assert.equal(fs.existsSync('_local-site/admin.js'), true);
  assert.equal(fs.existsSync('_local-site/.git'), false);
  assert.equal(fs.existsSync('_local-site/package.json'), false);
  assert.equal(fs.existsSync('_local-site/tests'), false);
  const editor = fs.readFileSync('_local-site/admin.html', 'utf8');
  assert.match(editor, /id="items-table"/);
  assert.match(editor, /Content-Security-Policy/);
});
