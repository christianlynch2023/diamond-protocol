// More browser tests, added before splitting the app-state file so the refactor can't quietly break
// swap, skip, Body's health watch or weight-jump settings. Same rules as app.spec.ts: empty storage per
// test, Netlify functions stubbed, and any error in the page fails the test.
import { test, expect, type Page } from '@playwright/test';

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errs: string[] = [];
  pageErrors.set(page, errs);
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|favicon/i.test(m.text())) errs.push('console: ' + m.text()); });
  await page.route('**/.netlify/functions/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
  page.on('dialog', d => d.accept());
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
});
test.afterEach(async ({ page }) => { expect(pageErrors.get(page) ?? [], 'no errors in the page').toEqual([]); });

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name, exact: true });
async function startWorkout(page: Page) {
  await tab(page, 'Today').click();
  await page.getByRole('button', { name: /^Start (?!week|block)/ }).first().click();
  await expect(page.getByText(/^Exercise 1 of \d+/)).toBeVisible();
}

test('swap: choosing an alternative replaces the exercise', async ({ page }) => {
  await startWorkout(page);
  // Find an exercise that has alternatives (most do); move on with Skip if the first doesn't.
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Swap', exact: true }).click();
    await expect(page.getByText('Swap Exercise')).toBeVisible();
    const opts = page.locator('.swap-opt');
    if (await opts.count()) {
      const pick = (await opts.first().innerText()).trim();
      await opts.first().click();
      await expect(page.getByText('Swap Exercise')).toHaveCount(0);
      await expect(page.locator('.wo2-name')).toContainText(pick);
      return;
    }
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await page.locator('.modal').getByRole('button', { name: 'Skip', exact: true }).click();
  }
  test.fail(true, 'no exercise with alternatives in the first four');
});

test('skip: confirming moves the workout on to the next exercise', async ({ page }) => {
  await startWorkout(page);
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByText('Skip Exercise?')).toBeVisible();
  await page.locator('.modal').getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByText(/^Exercise 2 of \d+/)).toBeVisible();
});

test('Body: the health watch card shows, and asks for a panel when there is none', async ({ page }) => {
  await tab(page, 'Body').click();
  await expect(page.getByText('Health watch', { exact: true })).toBeVisible();
  await expect(page.getByText(/Add a blood panel in Bloods below/)).toBeVisible();
});

test('weight jumps: a setting survives closing the app', async ({ page }) => {
  const open = async () => {
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: /Weight jumps and equipment/ }).click();
  };
  await open();
  const first = page.locator('.eq2-in input').first();
  await first.fill('5');
  await expect(page.getByText(/1 set/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await open();
  await expect(page.locator('.eq2-in input').first()).toHaveValue('5');
});
