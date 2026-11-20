// Talk mode in WebKit (Safari's engine) at iPhone size. Guards the iPhone failure where the mic was first
// requested long after the tap (outside the gesture), got refused, and the screen still said "Listening".
// Taps are sent as key presses: Playwright's WebKit on macOS mis-targets raw mouse clicks, and keys still count as a gesture.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { signInApi, skipTour } from './account';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const SEP = '␞';

async function fakeMic(page: Page) {
  const wav = readFileSync(path.resolve('tests/e2e/fixtures-question.wav'));
  await page.route('**/__fixture/question.wav', (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: wav }));
  await page.addInitScript(() => {
    (window as any).__gum = [];
    const fake = async () => {
      (window as any).__gum.push(navigator.userActivation?.isActive ?? null);
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
    // WebKit ignores a plain assignment to navigator.mediaDevices.getUserMedia.
    Object.defineProperty(MediaDevices.prototype, 'getUserMedia', { value: fake, configurable: true, writable: true });
  });
}

const tap = async (page: Page, loc: Locator) => {
  await loc.focus();
  await page.keyboard.press('Enter');
};

test('iPhone (WebKit): mic opens inside the tap, once, and survives several turns', async ({ page }) => {
  test.setTimeout(180_000);
  await fakeMic(page);
  const stt: string[] = [];
  await page.route('**/api/progress', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: null }) : r.fulfill({ json: { ok: true } })));
  await page.route('**/api/tutor', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: `Then Python raises a KeyError.\n${SEP}{"verdict":"none","nailed":[],"fix":[],"highlightLines":[],"next":"stay"}` }),
  );
  page.on('response', async (r) => {
    if (r.url().endsWith('/api/stt')) stt.push((await r.json()).text);
  });
  await skipTour(page);
  await signInApi(page);
  await page.goto('/');
  await tap(page, page.getByRole('radio', { name: /Talk/ }).first());
  await tap(page, page.getByRole('button', { name: /^(Start|Continue):/ }));
  await tap(page, page.getByRole('button', { name: 'Tap anywhere to start' }));
  await expect(page.getByText(/Speaking/)).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => stt.length, { timeout: 120_000 }).toBeGreaterThanOrEqual(2); // two spoken turns heard
  expect(stt[0].toLowerCase()).toContain('dictionary');
  const gum = await page.evaluate(() => (window as any).__gum as (boolean | null)[]);
  expect(gum).toHaveLength(1); // the mic was opened once for the whole session…
  expect(gum[0]).not.toBe(false); // …and inside the tap
  await expect(page.getByText(/microphone/i)).toHaveCount(0); // no mic error shown
});
