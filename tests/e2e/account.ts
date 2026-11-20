// Test accounts. Usernames start with "e2e-" so they never count as active students in the budget.
import type { Page } from '@playwright/test';

export const E2E = {
  username: `e2e-${process.env.E2E_WHO ?? 'bot'}`,
  password: process.env.E2E_PASSWORD ?? 'e2e-local-password',
  invite: process.env.E2E_INVITE ?? 'dev-invite',
};

/** Sign in through the API (sets the session cookie), creating the test account the first time. */
export async function signInApi(page: Page, who = E2E.username) {
  const login = await page.request.post('/api/auth/login', { data: { username: who, password: E2E.password } });
  if (login.ok()) return;
  const r = await page.request.post('/api/auth/signup', { data: { name: 'Test Student', username: who, password: E2E.password, code: E2E.invite } });
  if (!r.ok()) throw new Error(`could not create test account: ${r.status()} ${await r.text()}`);
}

/** Skip the first-run tutorial in tests that aren't about it. */
export async function skipTour(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('py-tutor.tour.skip-all', '1');
    } catch {
      /* ignore */
    }
  });
}
