# py-tutor

A voice-first Python tutor I built to get ready for my CS 100 final. It covers dictionaries, file I/O, and classes. Every concept runs through the same loop: a plain definition, an example, a line-by-line walkthrough, a spoken talk-through, then I write the code and real tests grade it, looping until I have it down.

Two modes:
- **Type** (laptop): an editor, a console with zyBooks-style program input, and tests that show expected vs. actual output with whitespace visible.
- **Talk** (phone in a mount): fully hands-free. The tutor explains out loud, listens, and answers. The whole screen is the interrupt button.

The tutor never hands over a full solution. It gives hints and points at the line to fix, and it flags anything beyond what the course covered.

New visitors get a short kinetic-type intro (what it is, the problem it fixes, why it beats juggling tabs), and real wins, like a passing check, send a WebGL distortion wave through the screen. The colours, type, voice, and motion are written down in [BRAND.md](BRAND.md).

Built with Claude Code as a pair programmer.

## How it works
| Part | What |
|---|---|
| Python | Pyodide in a Web Worker, entirely in the browser. Runaway loops are stopped after 3 s by swapping in a pre-warmed spare worker. |
| Grader | Each test gets fresh globals and a fresh file system. Checks stdout, files written, and asserts on objects. An AST check flags constructs outside CS 100. |
| Tutor | Claude (Opus 5.5) streamed through a Cloudflare Worker. Spoken text streams first, then a small JSON block for the on-screen "what you nailed / what to fix" cards. |
| Voice | Silero VAD on device, OpenAI transcription with a Python vocabulary hint, OpenAI TTS spoken sentence by sentence as the reply streams. The mic pauses while the tutor talks, so car speakers can't trigger it. |
| Look and feel | React, Tailwind, Motion. The intro is kinetic type in Instrument Serif; the success wave is a fragment shader on a canvas over the panel, with a CSS fallback and nothing at all under reduced motion. |
| Progress | IndexedDB, synced to Workers KV. A skill counts as mastered after two clean passes in a row, at least one of them typed. |

## Run locally
```
npm install
cp .dev.vars.example .dev.vars   # add keys
npm run build && npx wrangler dev --local    # app + API on :8787
```
Tests: `npm test` (runtime, grader, every lesson's reference and wrong solutions, loop engine, drill), `npx playwright test` (browser, type and talk mode), `ANTHROPIC_API_KEY=... npx vitest run tests/live` (live tutor evals, costs a few cents).

## Deploy
```
npx wrangler kv namespace create KV        # put the id in wrangler.jsonc
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put PASSCODE
npm run deploy
```
