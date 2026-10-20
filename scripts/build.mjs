import { readFileSync, writeFileSync, mkdirSync, copyFileSync, cpSync, rmSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const context = { window: {} };
vm.runInNewContext(readFileSync('menu-store.js', 'utf8'), context);
const data = JSON.parse(readFileSync('menu-data.json', 'utf8'));
context.window.MenuStore.validate(data);
writeFileSync('menu-defaults.js', '// Generated from menu-data.json by node scripts/build.mjs. Do not edit.\nwindow.MENU_DEFAULTS = ' + JSON.stringify(data, null, 2) + ';\n');

const publicFiles = [
  'index.html', 'qr.html', 'qr.js', 'qr-menu.svg', 'style.css', 'app.js',
  'menu-store.js', 'menu-defaults.js', 'menu-data.json'
];
const localFiles = [...publicFiles, 'admin.html', 'admin.js'];
function build(directory, files) {
  rmSync(directory, { recursive:true, force:true });
  mkdirSync(directory, { recursive:true });
  for (const name of files) copyFileSync(name, `${directory}/${name}`);
  cpSync('assets', `${directory}/assets`, { recursive:true });
}

if (process.argv.includes('--site')) {
  build('_site', publicFiles);
  // The public route is only a GitHub-authenticated gateway; never ship the editor JS.
  copyFileSync('admin-gateway.html', '_site/admin.html');
  if (!existsSync('_site/admin.html') || existsSync('_site/admin.js')) {
    throw new Error('The public Pages artifact must not contain the admin editor.');
  }
}
if (process.argv.includes('--local')) build('_local-site', localFiles);
console.log('Menu validated; public/local output built as requested.');
