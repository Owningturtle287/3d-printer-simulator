import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: 'http://127.0.0.1:4178',
    launchOptions: {
      executablePath: process.env.X2D_TEST_CHROMIUM,
      args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage'],
    },
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4178 --strictPort',
    url: 'http://127.0.0.1:4178',
    timeout: 20000,
  },
});
