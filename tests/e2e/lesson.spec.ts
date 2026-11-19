// End-to-end in a real browser against the local Worker. Python runs for real (Pyodide);
// Claude is mocked here for determinism (live Claude is covered by tests/live).
import { expect, test, type Page } from '@playwright/test';
import { dictionaries } from '../../src/curriculum/dictionaries';

const SEP = '␞';
const lesson = dictionaries.lessons[0];

async function mockTutor(page: Page) {
  await page.route('**/api/tutor', async (route) => {
    const req = route.request().postDataJSON();
    let text = 'Good question. Keys are labels.';
    let meta: any = { verdict: 'none', nailed: [], fix: [], highlightLines: [], next: 'stay' };
    if (req.kind === 'assess-talk') {
      const ok = /bread/.test(req.learnerText);
      text = ok ? 'Yes, square brackets with the key. You nailed it.' : 'Good start, but how would you read the price back out?';
      meta = { verdict: ok ? 'pass' : 'fail', nailed: ['curly braces with pairs'], fix: ok ? [] : ['read with prices["bread"]'], highlightLines: [], next: ok ? 'advance' : 'retry' };
    }
    if (req.kind === 'explain-grade') {
      text = req.grade.passed ? 'Every test passes. Nice.' : 'You made the dictionary right. Line 3 prints the wrong thing.';
      meta = { verdict: req.grade.passed ? 'pass' : 'fail', nailed: ['made capitals correctly'], fix: req.grade.passed ? [] : ['use capitals[country]'], highlightLines: [3], next: 'stay' };
    }
    await route.fulfill({ status: 200, contentType: 'text/plain', body: `${text}\n${SEP}${JSON.stringify(meta)}` });
  });
}

async function unlock(page: Page) {
  // Each test starts from empty progress (no server state carried between runs).
  await page.route('**/api/progress', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: null }) : r.fulfill({ json: { ok: true } })));
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message, e.stack?.split('\n').slice(0,4).join(' | ')));
  page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
  await page.goto('/');
  await page.getByLabel('Passcode').fill('nope');
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByText('That passcode didn’t work.')).toBeVisible();
  await page.getByLabel('Passcode').fill(process.env.E2E_PASS ?? 'dev-pass');
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

async function setCode(page: Page, code: string) {
  const ed = page.getByLabel('Your code');
  await ed.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(code);
}

test('full loop for one dictionaries lesson, type mode', async ({ page }) => {
  await mockTutor(page);
  await unlock(page);
  await page.getByRole('button', { name: /^(Start|Continue):/ }).click();

  await expect(page.getByText(lesson.define)).toBeVisible();
  await page.getByRole('button', { name: 'Show me an example' }).click();
  await page.getByRole('button', { name: 'Go line by line' }).click();
  for (let i = 1; i < lesson.walkthrough.length; i++) {
    await expect(page.getByText(lesson.walkthrough[i - 1].text).first()).toBeVisible();
    await page.getByRole('button', { name: 'Next line' }).click();
  }
  await page.getByRole('button', { name: 'I’ve got it' }).click();

  const composer = page.getByPlaceholder('Ask anything, or explain your thinking…');
  await composer.fill('I would use curly braces');
  await composer.press('Enter');
  await expect(page.getByText('how would you read the price back out?')).toBeVisible();
  await composer.fill('prices = {"apple": 0.5, "bread": 3} then print prices["bread"]');
  await composer.press('Enter');
  await page.getByRole('button', { name: 'Write the code' }).click();

  // Wrong first: loops back with nailed/fix feedback.
  await setCode(page, lesson.doit.wrong[0]);
  await page.getByRole('button', { name: 'Check my code' }).click();
  await expect(page.getByText('Line 3 prints the wrong thing.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check my code' })).toBeVisible();

  // Fix it: real Pyodide grading passes.
  await setCode(page, lesson.doit.reference);
  await page.getByRole('button', { name: 'Check my code' }).click();
  await expect(page.getByText('Every test passes. Nice.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next skill' })).toBeVisible();
  await page.screenshot({ path: `test-results/loop-done-${test.info().project.name}.png`, fullPage: false });
});

test('Run uses program input, and a runaway loop is stopped', async ({ page }) => {
  await mockTutor(page);
  await unlock(page);
  await page.getByRole('button', { name: /^(Start|Continue):/ }).click();
  await page.getByRole('button', { name: 'Show me an example' }).click();
  await page.getByRole('button', { name: 'Go line by line' }).click();
  for (let i = 1; i < lesson.walkthrough.length; i++) await page.getByRole('button', { name: 'Next line' }).click();
  await page.getByRole('button', { name: 'I’ve got it' }).click();
  const composer = page.getByPlaceholder('Ask anything, or explain your thinking…');
  await composer.fill('bread with square brackets');
  await composer.press('Enter');
  await page.getByRole('button', { name: 'Write the code' }).click();

  await setCode(page, 'x = input()\nprint("hi", x)');
  await page.getByLabel('Program input').fill('Jeremy');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('hi Jeremy')).toBeVisible({ timeout: 30_000 });

  await setCode(page, 'while True:\n    pass');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText(/kept running for over 3 seconds/)).toBeVisible({ timeout: 10_000 });

  await setCode(page, 'print(2 + 2)');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('4', { exact: true })).toBeVisible({ timeout: 10_000 });
});

test('exam drill: answer, finish, score', async ({ page }) => {
  await unlock(page);
  await page.getByRole('button', { name: /Exam drill/ }).click();
  await expect(page.getByText('1 of 18')).toBeVisible();
  for (let i = 0; i < 17; i++) await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Finish and score' }).click();
  await expect(page.getByRole('heading', { name: /of 18/ })).toBeVisible();
});
