// Onboarding end to end: sign up with the class code, add a passkey, sign back in with only the passkey,
// the first-run tour, and the "You hit your cap" pop-up through to the admin approving more.
import { expect, test } from '@playwright/test';
import { E2E } from './account';

const local = !process.env.E2E_URL;
const shot = (name: string) => `test-results/onboarding-${name}-${test.info().project.name}.png`;

test('sign up, passkey, tour, sign out, passkey sign-in', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'laptop' && info.project.name !== 'phone', 'Chromium only (virtual passkey)');
  // A virtual Face ID / Touch ID so passkeys work headless.
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true },
  });

  const username = `e2e-${Date.now().toString(36)}`;
  await page.goto('/');
  await page.screenshot({ path: shot('1-sign-in') });
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByLabel('Your name').fill('Jordan Test');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(E2E.password);
  await page.getByLabel('Class code').fill('not-the-code');
  await page.screenshot({ path: shot('2-create-account') });
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText('That class code isn’t right.')).toBeVisible();
  await page.getByLabel('Class code').fill(E2E.invite);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();

  // Right after sign-up: offer a passkey.
  await expect(page.getByText('You’re in, Jordan.')).toBeVisible();
  await page.screenshot({ path: shot('3-passkey-offer') });
  await page.getByRole('button', { name: 'Add a passkey' }).click();

  // First-run tour on home.
  const tour = page.getByRole('dialog');
  await expect(tour.getByText('Welcome to py-tutor')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot('4-tour-welcome') });
  await tour.getByRole('button', { name: 'Next' }).click();
  await expect(tour.getByText('Pick up where you left off')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot('5-tour-spotlight') });
  await tour.getByRole('button', { name: /Skip/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Start|Continue):/ })).toBeVisible();

  // Sign out, then back in with only the passkey.
  await page.getByRole('button', { name: /^Account:/ }).click();
  await page.getByRole('menuitem', { name: /Sign out/ }).click();
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page.getByRole('button', { name: /^(Start|Continue):/ })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0); // the tour doesn't come back
  const me = await (await page.request.get('/api/me')).json();
  expect(me.user.username).toBe(username);
  expect(me.user.passkeys).toBe(1);
});

test('hitting the cap: pop-up, Ask for more, admin approves', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'laptop', 'one browser is enough');
  test.skip(!local, 'needs a local admin account');
  const username = `e2e-cap-${Date.now().toString(36)}`;
  await page.request.post('/api/auth/signup', { data: { name: 'Casey Capped', username, password: E2E.password, code: E2E.invite } });
  await page.addInitScript(() => localStorage.setItem('py-tutor.tour.skip-all', '1'));
  // Pretend the allowance is used up for this one call (the cap math itself is unit-tested).
  await page.route('**/api/tutor', (r) =>
    r.fulfill({ status: 402, json: { error: 'cap', usage: { date: '', spentToday: 0.21, allowance: 0.2, bonus: 0, capped: true, active: 5, monthSpent: 3, budget: 30, admin: false } } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: /^(Start|Continue):/ }).click();
  const next = page.getByRole('button', { name: 'Next', exact: true });
  for (let k = 0; k < 10 && !(await page.getByRole('button', { name: 'Show me an example' }).isVisible()); k++) await next.click();
  await page.getByRole('button', { name: 'Show me an example' }).click();
  await page.getByPlaceholder('Ask anything, or explain your thinking…').fill('what is a key?');
  await page.getByPlaceholder('Ask anything, or explain your thinking…').press('Enter');

  const pop = page.getByRole('dialog');
  await expect(pop.getByText('You hit your cap')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot('6-cap') });
  await pop.getByRole('button', { name: 'Ask for more' }).click();
  await expect(pop.getByText('Request saved.')).toBeVisible();

  // The admin sees the request and approves +$0.50.
  const admin = await browser.newContext({ baseURL: info.project.use.baseURL });
  const ar = admin.request;
  const login = await ar.post('/api/auth/login', { data: { username: 'e2e-admin', password: E2E.password } });
  if (!login.ok()) await ar.post('/api/auth/signup', { data: { name: 'Admin', username: 'e2e-admin', password: E2E.password, code: 'dev-admin' } });
  const ap = await admin.newPage();
  await ap.addInitScript(() => localStorage.setItem('py-tutor.tour.skip-all', '1'));
  await ap.goto('/');
  await ap.getByRole('button', { name: /^Account:/ }).click();
  await ap.getByRole('menuitem', { name: 'Class usage' }).click();
  await expect(ap.getByText('Casey Capped').first()).toBeVisible();
  await ap.screenshot({ path: shot('7-admin'), fullPage: true });
  const row = ap.locator('div', { hasText: `@${username}` }).filter({ has: ap.getByRole('button', { name: '+$0.50' }) }).last();
  await row.getByRole('button', { name: '+$0.50' }).click();
  await expect(ap.getByText(/Casey Capped: approved \+\$0\.50/)).toBeVisible();
  const me = await (await page.request.get('/api/me')).json();
  expect(me.usage.bonus).toBeCloseTo(0.5);
  await admin.close();
});
