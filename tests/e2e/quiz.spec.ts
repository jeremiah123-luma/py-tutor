// Quick check in a real browser: take a lesson's questions from the step row, get a perfect score, see it saved and
// shown on Home, and open a topic's practice questions. No AI is involved anywhere in a quiz.
import { expect, test, type Page } from '@playwright/test';
import { dictionariesQuiz } from '../../src/curriculum/quiz/dictionaries';
import { dictionaries } from '../../src/curriculum/dictionaries';
import { signInApi, skipTour } from './account';
import type { DrillQuestion } from '../../src/types';

async function answer(page: Page, q: DrillQuestion, right = true) {
  if (q.kind === 'predict') {
    await page.getByLabel('Exact output, one printed line per line').fill(right ? String(q.answer) : 'not it');
    await page.getByRole('button', { name: 'Lock in answer' }).click();
  } else {
    const pick = right ? Number(q.answer) : (Number(q.answer) + 1) % q.choices!.length;
    await page.getByRole('button', { name: q.choices![pick], exact: true }).click();
  }
  await expect(page.getByRole('status').filter({ hasText: right ? 'Right.' : 'Not quite' })).toBeVisible();
}

test('Quick check: perfect score saved, shown on Home, and topic practice opens', async ({ page }) => {
  const saved: any[] = [];
  await page.route('**/api/progress', (r) => {
    if (r.request().method() === 'GET') return r.fulfill({ json: null });
    saved.push(r.request().postDataJSON());
    return r.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/tutor', (r) => r.fulfill({ status: 500, body: 'no AI in this test' }));
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await skipTour(page);
  await signInApi(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Open the first lesson and jump straight to Quick check from the step row
  await page.getByRole('button', { name: /^Dictionaries/ }).first().click();
  await page.getByRole('button', { name: /Quick check/ }).first().click();
  const lesson = dictionaries.lessons[0];
  const qs = dictionariesQuiz[lesson.subskill];
  await expect(page.getByRole('heading', { name: /^Quick check:/ })).toBeVisible();

  // First question wrong: it comes back once at the end, and the score counts the first try
  for (let k = 0; k < qs.length; k++) {
    await expect(page.getByText(`Question ${k + 1} of ${qs.length}`)).toBeVisible();
    await answer(page, qs[k], k !== 0);
    await page.getByRole('button', { name: 'Next question' }).click();
  }
  await expect(page.getByText(/One more look · 1 of 1/)).toBeVisible();
  await answer(page, qs[0]);
  await page.getByRole('button', { name: 'See your score' }).click();
  await expect(page.getByRole('heading', { name: `${qs.length - 1} of ${qs.length}` })).toBeVisible();

  // Try again for a perfect score
  await page.getByRole('button', { name: 'Try again' }).click();
  for (let k = 0; k < qs.length; k++) {
    await answer(page, qs[k]);
    await page.getByRole('button', { name: k === qs.length - 1 ? 'See your score' : 'Next question' }).click();
  }
  await expect(page.getByRole('heading', { name: `${qs.length} of ${qs.length}` })).toBeVisible();
  await expect(page.getByText('Perfect. It shows as a check on Home.')).toBeVisible();
  await expect.poll(() => saved.some((p) => p?.quiz?.dictionaries?.[lesson.subskill]?.best === qs.length)).toBe(true);

  // Next skill moves on to lesson 2
  await page.getByRole('button', { name: 'Next skill' }).click();
  await expect(page.getByText(dictionaries.lessons[1].title).first()).toBeVisible();

  // Home counts the perfect quiz, and Practice questions runs the whole topic
  await page.getByRole('button', { name: 'Back to home' }).first().click();
  await expect(page.getByText(`1/${dictionaries.lessons.length} perfect`).first()).toBeVisible();
  await page.getByRole('button', { name: /Practice questions/ }).first().click();
  const total = Object.values(dictionariesQuiz).flat().length;
  await expect(page.getByText(`Question 1 of ${total}`)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dictionaries practice' })).toBeVisible();

  // nothing sticks out past the screen edge on a phone
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(wide).toBeLessThanOrEqual(1);
});
