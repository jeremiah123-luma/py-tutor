// End-to-end in a real browser against the local Worker. Python runs for real (Pyodide);
// Claude is mocked here for determinism (live Claude is covered by tests/live).
import { expect, test, type Page } from '@playwright/test';
import { dictionaries } from '../../src/curriculum/dictionaries';
import { toSlides } from '../../src/ui/SlideDeck';

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


/** Nothing on screen may stick out past the right edge (ignores things inside horizontal scrollers and decorative layers). */
async function expectFitsScreen(page: Page, where: string) {
  const offenders = await page.evaluate(() => {
    // A phone browser zooms out to fit a too-wide page, which would hide the problem; measure against the real screen.
    const W = Math.min(document.documentElement.clientWidth, window.screen.width);
    const bad: string[] = [];
    if (document.documentElement.scrollWidth > W + 1) bad.push(`page scrolls sideways: ${document.documentElement.scrollWidth} > ${W}`);
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      if (el.closest('[aria-hidden="true"]')) continue;
      let scroller = false;
      for (let a = el.parentElement; a; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') { scroller = true; break; }
      }
      if (scroller) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > W + 1) bad.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 40)}" right=${Math.round(r.right)} > ${W}`);
    }
    return bad.slice(0, 5);
  });
  expect(offenders, `${where}: elements wider than the screen`).toEqual([]);
}

/** Click through the Learn slides to the example. */
async function throughSlides(page: Page) {
  const done = page.getByRole('button', { name: 'Show me an example' });
  for (let k = 0; k < 10 && !(await done.isVisible()); k++) {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.waitForTimeout(150);
  }
  await done.click();
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
  await page.getByRole('button', { name: /^(Start|Continue):/ }).waitFor();
  await page.waitForTimeout(1200); // let the entrance animations settle
  await expectFitsScreen(page, 'home');
  await page.getByRole('button', { name: /^(Start|Continue):/ }).click();

  // Learn is slides only: big words, no editor or terminal yet.
  await expect(page.getByText(toSlides(lesson.define)[0])).toBeVisible();
  await expect(page.getByLabel('Example code')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Console' })).toHaveCount(0);
  await expectFitsScreen(page, 'lesson');
  await throughSlides(page);
  // Run on the example runs the example itself, with nothing in the input box (regression: it once ran the hidden starter).
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('tabpanel').getByText('1.99')).toBeVisible({ timeout: 30_000 }); // first run downloads Python
  await expect(page.getByRole('tabpanel').getByText(/Error/)).toHaveCount(0);
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
  await throughSlides(page);
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
  await expectFitsScreen(page, 'drill');
  await expect(page.getByLabel('time left')).toHaveText('90:00');
  await expect(page.getByLabel('time left')).not.toHaveText('90:00', { timeout: 3000 }); // the clock ticks
  for (let i = 0; i < 17; i++) await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Finish and score' }).click();
  await expect(page.getByRole('heading', { name: /of 18/ })).toBeVisible();
});
