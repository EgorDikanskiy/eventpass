import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  use: {
    baseURL: process.env.EVENTPASS_TEST_URL ?? 'http://localhost:8090',
    actionTimeout: 10_000,
    trace: 'retain-on-failure',
  },
});
