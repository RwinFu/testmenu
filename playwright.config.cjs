const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  reporter:process.env.GITHUB_ACTIONS ? 'github' : 'list',
  testDir:'./tests',
  testMatch:'**/*.spec.cjs',
  use:{
    baseURL:'http://127.0.0.1:8000',
    viewport:{ width:390, height:844 },
    launchOptions:process.env.CHROMIUM_PATH ? { executablePath:process.env.CHROMIUM_PATH, args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote'] } : {}
  },
  webServer:{ command:'npm start', url:'http://127.0.0.1:8000', reuseExistingServer:true },
});
