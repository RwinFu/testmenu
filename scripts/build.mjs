import { readFileSync, writeFileSync, mkdirSync, copyFileSync, cpSync, rmSync } from 'node:fs';
import vm from 'node:vm';

const context = { window: {} };
vm.runInNewContext(readFileSync('menu-store.js', 'utf8'), context);
const data = JSON.parse(readFileSync('menu-data.json', 'utf8'));
context.window.MenuStore.validate(data);
writeFileSync('menu-defaults.js', '// Generated from menu-data.json by node scripts/build.mjs. Do not edit.\nwindow.MENU_DEFAULTS = ' + JSON.stringify(data, null, 2) + ';\n');

const files = [
  'index.html', 'admin.html', 'qr.html', 'qr.js', 'qr-menu.svg', 'style.css',
  'app.js', 'admin.js', 'menu-store.js', 'menu-defaults.js', 'menu-data.json'
];

function build(directory) {
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  for (const name of files) copyFileSync(name, `${directory}/${name}`);
  cpSync('assets', `${directory}/assets`, { recursive: true });
}

for (const [flag, directory] of [['--site', '_site'], ['--local', '_local-site']]) {
  if (process.argv.includes(flag)) build(directory);
}
console.log('Menu validated; site output built as requested.');
