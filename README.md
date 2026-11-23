# py-tutor

Live at **https://pytutor.jeremiahsleman.com** (the old workers.dev address redirects there).

A Python tutor I built to get ready for my CS 100 final at NJIT. It covers the whole course in the order our zyBook teaches it (Modules 2 to 11), with extra depth on what the final leans on most: dictionaries, files, and classes.

| Topic | |
|---|---|
| The final's big three | Dictionaries, Files, Classes |
| Earlier topics | Basics, Strings and lists, Branching, For loops, Functions, String methods, While loops |

That's 10 topics and 63 lessons. Every lesson runs through the same loop: a plain definition, an example, a line-by-line walkthrough, a spoken talk-through, then I write the code and real tests grade it, looping until I have it down. After a pass there's a five-question **Quick check** (315 multiple-choice questions in all), and the best score sticks.

Two modes:
- **Type** (laptop): an editor, a console with zyBooks-style program input, and tests that show expected vs. actual output with whitespace visible.
- **Talk** (phone in a mount): fully hands-free. The tutor explains out loud, listens, and answers. A frosted-glass orb (rendered in Blender) shows when it's listening, thinking, or speaking, and a glow rises from the bottom of the screen while you talk.

There's also a **practice exam** that mixes the big three with review questions from earlier topics, and practice questions for each topic on Home.

The tutor never hands over a full solution. It gives hints and points at the line to fix, and it flags anything beyond what the course covered. The reference answers are stripped out of the shipped site at build time, so they can't be dug out of the browser either.

Accounts are a username and password or **Sign in with Google**, and progress syncs across devices. New visitors get a short kinetic-type intro, and real wins, like a passing check, send a WebGL distortion wave through the screen. The colours, type, voice, and motion are written down in [BRAND.md](BRAND.md).

Built with Claude Code as a pair programmer.

## How it works
| Part | What |
|---|---|
| Python | Pyodide in a Web Worker, entirely in the browser. Runaway loops are stopped after 3 s by swapping in a pre-warmed spare worker. |
| Grader | Each test gets fresh globals and a fresh file system. Checks stdout, files written, and asserts on objects. An AST check flags constructs outside CS 100. |
| Tutor | Claude (Opus 5.5) streamed through a Cloudflare Worker. Spoken text streams first, then a small JSON block for the on-screen "what you nailed / what to fix" cards. |
| Voice | Silero VAD on device, OpenAI transcription with a Python vocabulary hint, OpenAI TTS spoken sentence by sentence as the reply streams. The mic pauses while the tutor talks, so car speakers can't trigger it. |
| Look and feel | React, Tailwind, Motion. The intro is kinetic type and motion in Geist; the success wave is a fragment shader on a canvas over the panel, with a CSS fallback and nothing at all under reduced motion. |
| Progress | IndexedDB, synced to Workers KV (merged across devices). A skill counts as mastered after two clean passes in a row, at least one of them typed. |\n| Accounts | Username and password (salted hashes, rate-limited sign-in) or Google sign-in (ID tokens verified against Google's keys). A monthly AI budget for the class is tracked in a Durable Object. |

## Run locally
```
npm install
cp .dev.vars.example .dev.vars   # add keys
npm run build && npm run worker:dev    # app + API on :8787
```
Tests: `npm test` (runtime, grader, every lesson's reference and wrong solutions, Quick checks, loop engine, drill, accounts), `npx playwright test` (browser, type and talk mode; voice services are faked), `E2E_SWEEP=1 npx playwright test tests/e2e/sweep.spec.ts` (every lesson, start to finish), `ANTHROPIC_API_KEY=... npx vitest run tests/live` (live tutor evals, costs a few cents).

## Deploy
```
npx wrangler kv namespace create KV        # put the id in wrangler.jsonc
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put ADMIN_CODE
npm run deploy
```
