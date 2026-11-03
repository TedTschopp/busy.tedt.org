import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',use:{baseURL:process.env.BUSY_TEST_URL??'http://127.0.0.1:4322',channel:'chrome',headless:true},webServer:process.env.BUSY_TEST_URL?undefined:{command:'node scripts/serve-preview.mjs',url:'http://127.0.0.1:4322',reuseExistingServer:!process.env.CI},workers:1,reporter:'list'});
