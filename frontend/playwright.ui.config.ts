import { defineConfig } from '@playwright/test';

// Isolated browser checks against the built-in demo API; no external services.
export default defineConfig({
  testDir: './tests/ui',
  timeout: 45000,
  fullyParallel: true,
  workers: 4,
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
  ],
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    env: { VITE_API_MODE: 'mock' },
  },
});
