// Backup round trip, before and after splitting sync out of the app-state file: log a session, export a
// backup, clear everything, import the backup, and the session is back. Empty storage at the start;
// Netlify functions stubbed, so nothing reaches your real cloud data.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const errs: string[] = [];
test.beforeEach(async ({ page }) => {
  errs.length = 0;
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|favicon/i.test(m.text())) errs.push('console: ' + m.text()); });
  await page.route('**/.netlify/functions/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
  page.on('dialog', d => d.accept());
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
});
test.afterEach(() => { expect(errs, 'no errors in the page').toEqual([]); });

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name, exact: true });
const sessions = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('dp_logs') || '[]').length as number);

test('backup: export, clear everything, import, and the session is back', async ({ page }) => {
  // 1. one logged session
  await tab(page, 'Today').click();
  await page.getByRole('button', { name: /^Start (?!week|block)/ }).first().click();
  const inputs = page.locator('.wo2-inputs input.ni');
  await inputs.nth(0).fill('80');
  await inputs.nth(1).fill('9');
  await page.getByRole('button', { name: 'Log set 1' }).click();
  const skip = page.getByRole('button', { name: 'Skip rest' });
  if (await skip.isVisible()) await skip.click();
  await page.getByRole('button', { name: 'End', exact: true }).click();
  await page.getByRole('button', { name: 'Finish anyway' }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  expect(await sessions(page)).toBe(1);

  // 2. export a backup file
  await page.getByRole('button', { name: 'Settings' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export Backup/ }).click()]);
  const file = await download.path();
  const backup = JSON.parse(readFileSync(file, 'utf8'));
  expect(Array.isArray(backup.logs) && backup.logs.length).toBe(1);

  // 3. clear everything
  await page.getByRole('button', { name: 'Clear All Data' }).click();
  await page.getByRole('button', { name: 'Clear Everything' }).click();
  await expect.poll(() => sessions(page)).toBe(0);

  // 4. import it, and the session is back
  await expect(page.getByRole('button', { name: /Import Backup/ }).or(page.getByRole('navigation', { name: 'Main' })).first()).toBeVisible();   // after Clear the app stays on Settings, which has no tab bar
  if (!(await page.getByRole('button', { name: /Import Backup/ }).isVisible())) await page.getByRole('button', { name: 'Settings' }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Import Backup/ }).click()]);
  await chooser.setFiles(file);
  await expect.poll(() => sessions(page)).toBe(1);
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('dp_logs') || '[]'));
  expect(JSON.stringify(restored[0])).toContain('"reps":9');
});
