import { readFileSync, writeFileSync, mkdirSync, copyFileSync, cpSync } from 'node:fs';
import vm from 'node:vm';
const context = { window: {} };
vm.runInNewContext(readFileSync('menu-store.js', 'utf8'), context);
const data = JSON.parse(readFileSync('menu-data.json', 'utf8'));
context.window.MenuStore.validate(data);
writeFileSync('menu-defaults.js', '// Generated from menu-data.json by node scripts/build.mjs. Do not edit.\nwindow.MENU_DEFAULTS = ' + JSON.stringify(data, null, 2) + ';\n');
if (process.argv.includes('--site')) {
  mkdirSync('_site', { recursive:true });
  for (const name of ['index.html','admin.html','qr.html','qr-menu.svg','style.css','app.js','admin.js','menu-store.js','menu-defaults.js','menu-data.json']) copyFileSync(name, `_site/${name}`);
  cpSync('assets', '_site/assets', { recursive:true });
}
console.log('Menu validated; bundled fallback generated.');
