import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  // Against the live site, real network (Pyodide download, real STT/TTS) is occasionally slow: retry once, and report it as flaky.
  retries: process.env.E2E_URL?.startsWith("https") ? 1 : 0,
  use: { baseURL: process.env.E2E_URL ?? 'http://localhost:8787', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'laptop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /talk-iphone/ },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testIgnore: /talk-iphone/ },
    // Safari's engine at iPhone size, for the voice flow (isMobile emulation isn't used: it breaks WebKit input on macOS).
    { name: 'iphone', use: { browserName: 'webkit', viewport: { width: 393, height: 852 }, userAgent: devices['iPhone 15'].userAgent }, testMatch: /talk-iphone/ },
  ],
});
