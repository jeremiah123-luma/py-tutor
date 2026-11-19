// Hands-free talk mode in Chromium with a fake microphone playing a recorded question.
// Real: VAD (Silero in the browser), OpenAI transcription, OpenAI speech. Mocked: Claude.
import { expect, test } from '@playwright/test';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const SEP = '␞';
// macOS blocks real/fake mic capture for the test runner, so getUserMedia is replaced with a stream
// that plays a recorded question (on a loop, with silence around it). VAD and everything after are real.
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

async function fakeMic(page: import('@playwright/test').Page) {
  const wav = readFileSync(path.resolve('tests/e2e/fixtures-question.wav'));
  await page.route('**/__fixture/question.wav', (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: wav }));
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
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
}

test('talk mode: tutor speaks, hears a spoken question, answers', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop', 'one run is enough');
  const tutorCalls: any[] = [];
  const stt: string[] = [];
  await fakeMic(page);
  await page.route('**/api/progress', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: null }) : r.fulfill({ json: { ok: true } })));
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('requestfailed', (r) => console.log('REQFAIL', r.url(), r.failure()?.errorText));
  await page.route('**/api/tutor', async (route) => {
    const req = route.request().postDataJSON();
    tutorCalls.push(req);
    await route.fulfill({ status: 200, contentType: 'text/plain', body: `Then Python raises a KeyError. That is why we check with in first.\n${SEP}{"verdict":"none","nailed":[],"fix":[],"highlightLines":[],"next":"stay"}` });
  });
  page.on('response', async (r) => {
    if (r.url().endsWith('/api/stt')) stt.push((await r.json()).text);
  });
  const ttsTimes: number[] = [];
  page.on('requestfinished', (r) => r.url().endsWith('/api/tts') && ttsTimes.push(Date.now()));

  await page.goto('/');
  await page.getByLabel('Passcode').fill(process.env.E2E_PASS ?? 'dev-pass');
  await page.getByRole('button', { name: 'Open' }).click();
  await page.getByRole('radio', { name: /Talk/ }).first().click();
  await page.getByRole('button', { name: /^(Start|Continue):/ }).click();

  await expect(page.getByText('Tap anywhere to start').first()).toBeVisible();
  await page.mouse.click(400, 400);
  await expect(page.getByText(/Speaking/)).toBeVisible({ timeout: 20_000 });
  // The definition is spoken with real TTS, then the mic opens and VAD hears the recorded question.
  await expect.poll(() => stt.length, { timeout: 45_000 }).toBeGreaterThan(0);
  console.log('heard:', stt[0], '| tts requests:', ttsTimes.length);
  expect(stt[0].toLowerCase()).toContain('dictionary');
  await expect.poll(() => tutorCalls.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(tutorCalls[0].kind).toBe('ask');
  expect(tutorCalls[0].mode).toBe('talk');
  await expect(page.getByText(/KeyError/)).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: 'test-results/talk-answer.png' });
});
