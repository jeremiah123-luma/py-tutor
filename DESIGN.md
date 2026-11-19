# py-tutor design

## Who and where
- **The learner:** a beginner with a CS 100 final in about two weeks.
- **Two scenes:**
  1. **Desk** (laptop, often at night, typing). This is Operate mode: the interface disappears into the lesson.
  2. **Car** (phone in a mount, glanced at, never read). One state, one caption, the whole screen is a button.

## The world: paper and highlighter
A tutor sitting next to you with a printed page and a yellow highlighter. The page is warm paper with ink text.
**The highlighter is the tutor's hand**: it marks the line being explained, the phrase that matters, and the ring
while the tutor is speaking. Green is the learner's color: your turn, what you nailed, the main action. Nothing else
gets color.

- **Light** for the desk by default (paper). **Dark** follows the system. Talk mode is always dark (car at night,
  less glare, and the screen is just a lamp).
- **Restrained:** the accent is only for the primary action, the current state, and feedback. Never decoration.

## Type
| Role | Face | Use |
|---|---|---|
| Voice | Fraunces (variable, opsz) | the tutor speaking: definitions, talk captions, page headings |
| UI | Instrument Sans (variable) | everything else |
| Code | JetBrains Mono (variable) | code and program I/O only |

Fixed rem scale, ratio about 1.2: 12 / 14 / 16 (body) / 19 / 23 / 28 / 34 / 40. Tracking -0.02em on headings of 23px and up.
Body measure is at most 68ch. Numbers use tabular-nums.

## Color tokens (APCA-checked, see `src/styles/tokens.css`)
| Token | Light | Dark | Lc |
|---|---|---|---|
| `--paper` (bg) | #F7F4EC | #171612 | |
| `--surface` | #FFFDF8 | #1F1D18 | |
| `--surface-2` (panels/rail) | #EDE8DC | #26241E | |
| `--ink` | #1D1B17 | #F2EEE3 | 97.6 / 95.9 |
| `--ink-2` (secondary) | #57524A | #CAC3B3 | 80.4 / 69.7 |
| `--ink-3` (meta/placeholder) | #736D62 | #A39C8C | 68.9 / 48.1 |
| `--line` (hairline) | #E2DCCF | #34312A | |
| `--accent` (green) | #1E6B4F | #86DBAF | 75.1 / 68.7 |
| `--on-accent` | #FFFFFF | #0B1D14 | 86.7 / 73.6 |
| `--hl` (highlighter) | #FFE27A | #4A3D12 | ink on it 87.9 / 87.5 |
| `--nail-bg` | #E4F1E8 | #1C2E24 | |
| `--fix` / `--fix-bg` | #8A5200 / #FBEFD9 | #F3BC66 / #2E2414 | 72.5 / 70.9 |
| `--err` | #A8361F | #F7A189 | 74.8 / 62.5 |
| Talk: bg / caption / sub | #0E0D0B / #F5F1E6 / #C2BBAB | (same) | 98.5 / 65.7 |

## Space, shape, depth
- 4px base: 4 8 12 16 24 32 48 64. Tight inside a group, generous between groups, more space above a heading than below.
- Radius: 8 for controls, 12 for panels, full only for small pills and the talk ring.
- Elevation is declared once: panels use a hairline border OR a soft shadow (`0 1px 2px` + `0 8px 24px` at low alpha), never both.

## Motion
- 160 ms for UI state and 240 ms for panel and step changes. Exponential ease-out `cubic-bezier(0.16, 1, 0.3, 1)`. Never ease-in.
- **One authored moment:** the highlighter sweeps onto the active line (a background-size transition from left to right). Talk-ring states animate; nothing else does.
- `prefers-reduced-motion` turns the sweep into an instant change and holds the ring still, with state shown by color and label.
- Buttons press to `scale(0.97)`.

## Rules held to
1. No eyebrow labels, no numbered section markers, no card grids, no gradient text, no glass, no side-stripe borders, no emoji or glyph icons (lucide only, 1.75 stroke).
2. Lists are rows separated by spacing and hairlines, not boxes.
3. Every control names its action ("Run", "Check my code", "Next line"). Errors name the problem and the way out.
4. Every interactive element has hover, focus-visible (a 2px accent ring with 2px offset), active, and disabled states. Hit targets are at least 44px on touch and at least 56px in talk mode.
5. The text-selection color, caret, scrollbars, and focus rings are themed from the palette.
6. The loop's progress is always visible and always quiet: small text and a 2px line, never a progress ring.
7. Talk mode passes the arm's-length test: the caption is 28px or larger, the state is readable from color and label alone, and nothing needs reading while driving.
8. Solutions are never displayed (the exam-integrity rule). The UI has no "show answer" control.
