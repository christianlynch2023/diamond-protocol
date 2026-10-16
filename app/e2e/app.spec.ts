// Browser tests: the flows you rely on at the gym, run against the built app on a phone-sized screen.
// Each test starts with empty storage. Netlify functions are stubbed, so no test can reach your real
// cloud sync, WHOOP or the AI. Any uncaught error or console error in the page fails the test.
import { test, expect, type Page } from '@playwright/test';

const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errs: string[] = [];
  pageErrors.set(page, errs);
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource|net::ERR|favicon/i.test(t)) return;   // stubbed or missing network
    errs.push('console: ' + t);
  });
  await page.route('**/.netlify/functions/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
  page.on('dialog', d => d.accept());   // the app's alert() confirmations
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page) ?? [], 'no errors in the page').toEqual([]);
});

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name, exact: true });
const noCrash = async (page: Page) => { await expect(page.getByText(/couldn.t load/)).toHaveCount(0); };

test('every tab and Settings opens without a crash', async ({ page }) => {
  for (const name of ['Today', 'Train', 'Progress', 'Body', 'Fuel']) {
    await tab(page, name).click();
    await noCrash(page);
  }
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByText('Restore points', { exact: true })).toBeVisible();
  await expect(page.getByText('Weight jumps and equipment', { exact: true })).toBeVisible();
  await noCrash(page);
});

async function startWorkout(page: Page) {
  await tab(page, 'Today').click();
  await page.getByRole('button', { name: /^Start (?!week|block)/ }).first().click();
  await expect(page.getByText(/^Exercise 1 of \d+/)).toBeVisible();
}
async function logSet(page: Page, weight: string, reps: string, n: number) {
  const inputs = page.locator('.wo2-inputs input.ni');
  await inputs.nth(0).fill(weight);
  await inputs.nth(1).fill(reps);
  await page.getByRole('button', { name: `Log set ${n}` }).click();
}

test('a workout: log, rest, edit, end and save to history', async ({ page }) => {
  await startWorkout(page);
  await logSet(page, '60', '10', 1);
  // Rest runs inline and locks logging; skipping it brings the Log button back.
  await expect(page.getByRole('button', { name: 'Skip rest' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip rest' }).click();
  await expect(page.getByRole('button', { name: 'Log set 2' })).toBeVisible();
  // Edit set 1 by tapping its row.
  await page.locator('.wo2-tr.done').first().click();
  await page.locator('.wo2-inputs input.ni').nth(1).fill('11');
  await page.getByRole('button', { name: 'Update set 1' }).click();
  await expect(page.locator('.wo2-tr.done').first()).toContainText('60 × 11');
  // End with exercises unlogged: the finish warning appears.
  const skip = page.getByRole('button', { name: 'Skip rest' });
  if (await skip.isVisible()) await skip.click();
  await page.getByRole('button', { name: 'End', exact: true }).click();
  await expect(page.getByText('Finish session?')).toBeVisible();
  await page.getByRole('button', { name: 'Finish anyway' }).click();
  await expect(page.locator('.done-title')).toContainText('done');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  // Saved: one session with the edited set.
  const logs = await page.evaluate(() => JSON.parse(localStorage.getItem('dp_logs') || '[]'));
  expect(logs.length).toBe(1);
  expect(JSON.stringify(logs[0])).toContain('"reps":11');
});

test('an unfinished workout survives closing the app and resumes', async ({ page }) => {
  await startWorkout(page);
  await logSet(page, '70', '8', 1);
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await tab(page, 'Today').click();
  await page.getByRole('button', { name: 'Resume session' }).click();
  await expect(page.locator('.wo2-tr.done').first()).toContainText('70 × 8');
});

test('Fuel: log food and today\u2019s total updates', async ({ page }) => {
  await tab(page, 'Fuel').click();
  await page.getByRole('button', { name: 'Log food' }).click();
  await page.getByLabel('Protein g').fill('30');
  await page.getByLabel('Carbs g').fill('20');
  await page.getByLabel('Fat g').fill('10');
  await page.getByRole('button', { name: /^Add 290 kcal$/ }).click();
  await expect(page.locator('.fu-head')).toContainText('290');
});
