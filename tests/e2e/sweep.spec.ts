// The whole course, every lesson, in a real browser, the way a student goes through it: open each step, walk the
// example line by line, write the right answer and check it, then take the Quick check and get every question
// right. Fails on any page error, anything sticking out past the screen edge, a Try it the right answer can't
// pass, or a Quick check answer that doesn't count as right. Slow (all lessons), so it only runs when asked:
//   E2E_SWEEP=1 E2E_URL=http://localhost:8799 npx playwright test tests/e2e/sweep.spec.ts --project=phone
import { expect, test, type Page } from '@playwright/test';
import { concepts, conceptOrder } from '../../src/curriculum';
import { quizFor } from '../../src/curriculum/quiz';
import type { DrillQuestion } from '../../src/types';
import { signInApi, skipTour } from './account';

test.skip(!process.env.E2E_SWEEP, 'set E2E_SWEEP=1 to run the full-course sweep');
test.setTimeout(60 * 60_000);

async function fits(page: Page, where: string, problems: string[]) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - Math.min(document.documentElement.clientWidth, window.screen.width));
  if (wide > 1) problems.push(`${where}: page scrolls sideways by ${wide}px`);
}

async function answer(page: Page, q: DrillQuestion) {
  if (q.kind === 'predict') {
    await page.getByLabel('Exact output, one printed line per line').fill(String(q.answer));
    await page.getByRole('button', { name: 'Lock in answer' }).click();
  } else {
    await page.getByRole('button', { name: q.choices![Number(q.answer)], exact: true }).click();
  }
}

async function tab(page: Page, label: string) {
  await page.locator('nav[aria-label="Lesson progress"]').getByRole('button', { name: new RegExp(`${label}$`) }).click();
}

test('every lesson works end to end', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  await page.route('**/api/progress', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: null }) : r.fulfill({ json: { ok: true } })));
  await page.route('**/api/tutor', (r) => r.fulfill({ status: 500, body: 'no AI in the sweep' }));
  await page.route('**/api/tts', (r) => r.fulfill({ status: 500, body: 'no' }));
  await skipTour(page);
  await signInApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: /^(Start|Continue):/ }).click();

  const order = conceptOrder.flatMap((id) => concepts[id]!.lessons.map((l, i) => ({ id, i, l })));
  for (const { id, i, l } of order) {
    const where = `${id} ${i + 1} ${l.subskill}`;
    try {
      await expect(page.getByText(l.title).first(), `${where}: lesson didn't open`).toBeVisible({ timeout: 15_000 });
      await fits(page, `${where} learn`, problems);
      await tab(page, 'Example');
      await expect(page.getByLabel('Example code')).toBeVisible();
      await fits(page, `${where} example`, problems);
      // walk every line; the last button says I've got it
      await tab(page, 'Line by line');
      for (let n = 1; n <= l.walkthrough.length; n++) {
        await expect(page.getByText(`Line ${n} of ${l.walkthrough.length}`), `${where}: walkthrough line ${n}`).toBeVisible();
        if (n < l.walkthrough.length) await page.getByRole('button', { name: 'Next line' }).click();
      }
      await tab(page, 'Try it');
      const editor = page.getByLabel('Your code');
      await editor.click();
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
      await page.keyboard.press('Delete');
      await page.keyboard.insertText(l.doit.reference);
      await page.getByRole('button', { name: 'Check my code' }).click();
      const passed = await page.getByText('All tests pass.').first().isVisible({ timeout: 60_000 }).catch(() => false)
        || await page.getByText('All tests pass.').first().waitFor({ timeout: 60_000 }).then(() => true, () => false);
      if (!passed) {
        problems.push(`${where}: the reference solution didn't pass Check in the browser`);
        await page.screenshot({ path: `test-results/sweep-${id}-${i}-check.png` });
      }
      await fits(page, `${where} try it`, problems);
      // Quick check: every question right first time
      const qs = quizFor(id, l.subskill);
      await page.getByRole('button', { name: 'Quick check', exact: true }).first().click();
      for (let k = 0; k < qs.length; k++) {
        await expect(page.getByText(`Question ${k + 1} of ${qs.length}`), `${where}: quiz question ${k + 1}`).toBeVisible();
        await answer(page, qs[k]);
        const right = await page.getByRole('status').filter({ hasText: 'Right.' }).isVisible({ timeout: 5000 }).catch(() => false)
          || await page.getByRole('status').filter({ hasText: 'Right.' }).waitFor({ timeout: 5000 }).then(() => true, () => false);
        if (!right) problems.push(`${where}: quiz ${qs[k].id} right answer was marked wrong`);
        await fits(page, `${where} quiz ${k + 1}`, problems);
        await page.getByRole('button', { name: k === qs.length - 1 ? 'See your score' : 'Next question' }).click();
      }
      await expect(page.getByRole('heading', { name: `${qs.length} of ${qs.length}` }), `${where}: quiz score`).toBeVisible();
      await page.getByRole('button', { name: /^(Next skill|Next topic|Back to Home)$/ }).click();
    } catch (e) {
      problems.push(`${where}: ${(e as Error).message.split('\n')[0]}`);
      await page.screenshot({ path: `test-results/sweep-${id}-${i}-fail.png` }).catch(() => {});
      // carry on from the next lesson: open its topic from Home
      return expect(problems, problems.join('\n')).toEqual([]);
    }
  }
  console.log(`swept ${order.length} lessons`);
  expect(problems, problems.join('\n')).toEqual([]);
});
