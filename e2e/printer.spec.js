import { test, expect, devices } from '@playwright/test';

const inputFile = {
  name: 'small-line.gcode', mimeType: 'text/plain',
  buffer: Buffer.from('G21\nG90\nM83\nG0 X45 Y45 Z.2\nG1 X95 E2 F900\nG1 Y90 E1'),
};

test('desktop physical touchscreen controls temperature, opens Benchy, and exits camera focus', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('x2d-lab:v1', '{"quality":"low"}'));
  await page.setViewportSize({ width: 1180, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Printer', exact: true })).toBeVisible();
  await expect(page.locator('.status-pill')).toHaveText('Ready', { timeout: 15000 });
  await expect(page.locator('.world')).toBeVisible();
  const touchscreen = page.getByRole('region', { name: 'Printer touchscreen' });
  const before = await touchscreen.boundingBox();
  await touchscreen.click();
  await expect(page.getByRole('button', { name: 'Exit screen' })).toBeVisible();
  await expect.poll(async () => (await touchscreen.boundingBox()).width).toBeGreaterThan(before.width * 3);
  await touchscreen.getByRole('button', { name: 'Controls' }).click();
  await touchscreen.getByRole('spinbutton', { name: 'Left nozzle target temperature' }).fill('120');
  await touchscreen.locator('form[data-zone="left"]').getByRole('button', { name: 'Set' }).click();
  await expect.poll(() => page.evaluate(() => window.x2d.getTelemetry().temperatures.left.target)).toBe(120);
  await page.getByRole('button', { name: 'Exit screen' }).click();
  await expect(page.getByRole('button', { name: 'Exit screen' })).toBeHidden();
  await page.getByRole('button', { name: /Print 3DBenchy/ }).click();
  await expect(touchscreen.getByRole('heading', { name: 'Prepare print' })).toBeVisible();
  await expect(touchscreen.getByText(/240 layers/)).toBeVisible();
  await expect(touchscreen.getByRole('button', { name: 'Start print' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('iPhone-sized touch layout imports a file, runs a print, and reloads the app offline', async ({ browser }) => {
  const { defaultBrowserType, ...phone } = devices['iPhone 13'];
  const context = await browser.newContext({ ...phone, baseURL: 'http://127.0.0.1:4178' });
  const page = await context.newPage();
  await page.addInitScript(() => {
    if (!localStorage.getItem('x2d-lab:v1')) localStorage.setItem('x2d-lab:v1', '{"quality":"low"}');
  });
  await page.goto('/');
  await expect(page.locator('.status-pill')).toHaveText('Ready', { timeout: 15000 });
  await page.getByLabel('Simulation speed').selectOption('100');
  await page.locator('#import').setInputFiles(inputFile);
  const screen = page.getByRole('region', { name: 'Printer touchscreen' });
  const start = screen.getByRole('button', { name: 'Start print' });
  await expect(start).toBeVisible();
  await expect.poll(async () => (await screen.boundingBox()).width, { timeout: 15000 }).toBeGreaterThan(270);
  await start.tap();
  await expect(page.locator('.status-pill')).toHaveText('Completed', { timeout: 45000 });
  const manifest = await (await context.request.get('./manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.status-pill')).toHaveText('Ready', { timeout: 18000 });
  await page.locator('.tabs').getByRole('button', { name: 'Print files' }).tap();
  await expect(page.getByText('small-line.gcode')).toBeVisible();
  await context.close();
});

test('touchscreen stays interactive when WebGL is disabled', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type.startsWith('webgl') ? null : getContext.call(this, type, ...args);
    };
  });
  await page.goto('/');
  await expect(page.locator('.status-pill')).toHaveText('Ready');
  await page.getByRole('button', { name: 'Open printer controls' }).click();
  const screen = page.getByRole('region', { name: 'Printer touchscreen' });
  await screen.getByRole('button', { name: 'Controls' }).click();
  await screen.getByRole('spinbutton', { name: 'Build plate target temperature' }).fill('65');
  await screen.locator('form[data-zone="bed"]').getByRole('button', { name: 'Set' }).click();
  await expect.poll(() => page.evaluate(() => window.x2d.getTelemetry().temperatures.bed.target)).toBe(65);
});
