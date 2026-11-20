// Screenshot the real app (not mocks) at phone + laptop, light + dark. Claude is mocked.
// Usage: node scripts/shots.mjs <baseURL> <passcode> <outDir>
import { chromium } from 'playwright';
const [base, pass, out] = process.argv.slice(2);
const SEP = '␞';
const sizes = { phone: { width: 390, height: 844 }, laptop: { width: 1440, height: 900 } };
const b = await chromium.launch();
for (const [size, viewport] of Object.entries(sizes)) {
  for (const scheme of ['dark']) {
    const ctx = await b.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.route('**/api/progress', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: null }) : r.fulfill({ json: { ok: true } })));
    await p.route('**/api/tutor', (r) =>
      r.fulfill({ body: `You built the dictionary exactly right. Line 3 prints the country instead of looking it up.\n${SEP}{"verdict":"fail","nailed":["capitals has both pairs"],"fix":["print capitals[country]"],"highlightLines":[3],"next":"retry"}` }),
    );
    const shot = (name) => p.screenshot({ path: `${out}/${size}-${scheme}-${name}.png`, fullPage: size === 'phone' });
    await p.goto(base);
    await shot('pass');
    await p.getByLabel('Passcode').fill(pass);
    await p.getByRole('button', { name: 'Open' }).click();
    await p.getByRole('button', { name: /^(Start|Continue):/ }).waitFor();
    await shot('home');
    await p.getByRole('button', { name: /^(Start|Continue):/ }).click();
    await shot('learn-slide');
    while (!(await p.getByRole('button', { name: 'Show me an example' }).isVisible())) await p.getByRole('button', { name: 'Next', exact: true }).click();
    await p.getByRole('button', { name: 'Show me an example' }).click();
    await p.getByRole('button', { name: 'Go line by line' }).click();
    await p.getByRole('button', { name: 'Next line' }).click();
    await shot('walk');
    while (!(await p.getByRole('button', { name: 'I’ve got it' }).isVisible())) await p.getByRole('button', { name: 'Next line' }).click();
    await p.getByRole('button', { name: 'I’ve got it' }).click();
    const c = p.getByPlaceholder('Ask anything, or explain your thinking…');
    await c.fill('curly braces then prices["bread"]');
    await c.press('Enter');
    await p.waitForTimeout(400);
    await shot('talkthrough-feedback');
    await p.goto(base);
    await p.getByRole('button', { name: /Exam drill/ }).first().click();
    await shot('drill-q1');
    const choice = p.locator('main ul button').first();
    if (await choice.count()) await choice.click();
    else {
      await p.locator('main textarea').fill('wrong');
      await p.getByRole('button', { name: 'Lock in answer' }).click();
    }
    await shot('drill-answered');
    for (let i = 0; i < 16; i++) await p.getByRole('button', { name: 'Next' }).click();
    await shot('drill-coding');
    await p.getByRole('button', { name: 'Next' }).click();
    await p.getByRole('button', { name: 'Finish and score' }).click();
    await shot('drill-results');
    await ctx.close();
  }
}
await b.close();
console.log('done');
