// Talk mode recovers instead of sticking: empty transcripts and tutor errors go back to listening, saying
// "next" after a pass moves on, and Next skill keeps the same microphone. Everything paid is mocked.
import { expect, test } from '@playwright/test';
import { signInApi, skipTour } from './account';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const SEP = '␞';
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

test('talk mode: recovers from empty speech and tutor errors', async ({ page }) => {
  test.setTimeout(180_000);
  const wav = readFileSync(path.resolve('tests/e2e/fixtures-question.wav'));
  await page.route('**/__fixture/question.wav', (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: wav }));
  await page.addInitScript(() => {
    (window as any).__gum = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      (window as any).__gum++;
      const ctx = new AudioContext({ sampleRate: 48000 });
      await ctx.resume();
      const buf = await ctx.decodeAudioData(await (await fetch('/__fixture/question.wav')).arrayBuffer());
      const dest = ctx.createMediaStreamDestination();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(dest);
      src.start();
      return dest.stream;
    };
  });
  // short silent speech so turns are quick
  await page.route('**/api/tts', (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: wav.subarray(0, 44 + 4000) }));
  await page.route('**/api/progress', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: null }) : r.fulfill({ json: { ok: true } })));
  const said = ['', 'what is a key', 'my approach is a loop', 'next'];
  let n = 0;
  await page.route('**/api/stt', (r) => r.fulfill({ json: { text: said[Math.min(n++, said.length - 1)] } }));
  let tutorCalls = 0;
  await page.route('**/api/tutor', (r) => {
    tutorCalls++;
    const kind = JSON.parse(r.request().postData() ?? '{}').kind;
    if (kind === 'ask') return r.fulfill({ status: 500, body: 'boom' }); // the tutor is down
    return r.fulfill({ body: `Nice, that works.\n${SEP}{"verdict":"pass","nailed":[],"fix":[],"highlightLines":[],"next":"advance"}` });
  });
  await skipTour(page);
  await signInApi(page);
  await page.goto('/');
  await page.getByRole('radio', { name: /Talk/ }).first().click();
  await page.getByRole('button', { name: /^(Start|Continue):/ }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /Tap anywhere to start/ }).click();
  const status = page.locator('[role=status]');
  // 1) empty transcript: back to listening, never stuck on Thinking
  await expect.poll(() => n, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
  await expect(status).toHaveText(/Listening/, { timeout: 15_000 });
  // 2) the question goes to the tutor, which fails: the error is shown and it listens again
  await expect.poll(() => n, { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
  await expect(page.getByText(/couldn.t reach the tutor/)).toBeVisible({ timeout: 15_000 });
  await expect(status).toHaveText(/Listening/, { timeout: 15_000 });
  expect(await page.evaluate(() => (window as any).__gum)).toBe(1);
});

test('talk mode: "next" after a spoken pass goes to the next skill on the same mic', async ({ page }) => {
  test.setTimeout(300_000);
  const wav = readFileSync(path.resolve('tests/e2e/fixtures-question.wav'));
  await page.route('**/__fixture/question.wav', (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: wav }));
  await page.addInitScript(() => {
    (window as any).__gum = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      (window as any).__gum++;
      const ctx = new AudioContext({ sampleRate: 48000 });
      await ctx.resume();
      const buf = await ctx.decodeAudioData(await (await fetch('/__fixture/question.wav')).arrayBuffer());
      const dest = ctx.createMediaStreamDestination();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(dest);
      src.start();
      return dest.stream;
    };
  });
  const spoken: string[] = [];
  await page.route('**/api/tts', (r) => {
    spoken.push(JSON.parse(r.request().postData() ?? '{}').text ?? '');
    return r.fulfill({ status: 200, contentType: 'audio/wav', body: wav.subarray(0, 44 + 4000) });
  });
  await page.route('**/api/progress', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: null }) : r.fulfill({ json: { ok: true } })));
  await page.route('**/api/stt', (r) => r.fulfill({ json: { text: 'next' } }));
  const kinds: string[] = [];
  await page.route('**/api/tutor', (r) => {
    kinds.push(JSON.parse(r.request().postData() ?? '{}').kind);
    return r.fulfill({ body: `Good.\n${SEP}{"verdict":"pass","nailed":[],"fix":[],"highlightLines":[],"next":"advance"}` });
  });
  await skipTour(page);
  await signInApi(page);
  await page.goto('/');
  await page.getByRole('radio', { name: /Talk/ }).first().click();
  await page.getByRole('button', { name: /^(Start|Continue):/ }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /Tap anywhere to start/ }).click();
  // flows through the lesson on "next", passes the explanation and the spoken code, then "next" starts skill 2
  await expect.poll(() => kinds.filter((k) => k === 'assess-spoken-code').length, { timeout: 240_000 }).toBeGreaterThanOrEqual(1);
  const before = spoken.length;
  await expect.poll(() => spoken.slice(before).join(' ').length, { timeout: 60_000 }).toBeGreaterThan(40); // the new skill is being explained
  expect(kinds.filter((k) => k === 'ask').length).toBe(0); // "next" never went to the AI
  expect(await page.evaluate(() => (window as any).__gum)).toBe(1); // same mic, no new permission prompt
});

test('talk mode: goes quiet when the app is hidden, and stays quiet until a tap', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'one run is enough');
  test.setTimeout(120_000);
  const wav = readFileSync(path.resolve('tests/e2e/fixtures-question.wav'));
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext({ sampleRate: 48000 });
      await ctx.resume();
      return ctx.createMediaStreamDestination().stream; // a mic that hears nothing
    };
  });
  let tts = 0;
  let other = 0;
  await page.route('**/api/tts', (r) => {
    tts++;
    return r.fulfill({ status: 200, contentType: 'audio/wav', body: wav.subarray(0, 44 + 4000) });
  });
  await page.route('**/api/stt', (r) => {
    other++;
    return r.fulfill({ json: { text: '' } });
  });
  await page.route('**/api/tutor', (r) => {
    other++;
    return r.fulfill({ body: `Ok.\n${SEP}{"verdict":"none","nailed":[],"fix":[],"highlightLines":[],"next":"stay"}` });
  });
  await page.route('**/api/progress', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: null }) : r.fulfill({ json: { ok: true } })));
  await skipTour(page);
  await signInApi(page);
  await page.goto('/');
  await page.getByRole('radio', { name: /Talk/ }).first().click();
  await page.getByRole('button', { name: /^(Start|Continue):/ }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /Tap anywhere to start/ }).click();
  // it explains on its own: a couple of lines go by with nobody touching it
  await expect.poll(() => tts, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);

  // the app goes to the background
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByText('Paused. Tap to keep going.')).toBeVisible();
  const before = { tts, other };
  await page.waitForTimeout(8000); // longer than the 2.6 s it waits before moving on by itself
  expect({ tts, other }).toEqual(before);

  // back in the app: still quiet until a tap, then it picks up again
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(3000);
  expect(tts).toBe(before.tts);
  await page.mouse.click(200, 400);
  await expect.poll(() => tts, { timeout: 15_000 }).toBeGreaterThan(before.tts);
});
