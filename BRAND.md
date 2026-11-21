# py-tutor brand identity

## What it is
py-tutor is a Python tutor for NJIT's CS 100 final: dictionaries, file I/O, and classes. It puts the lesson, the editor, the tests, and the tutor on one screen, and the tutor coaches without ever writing your code.

**The line:** No more three tabs and two apps just to learn Python.

### The problem it solves
Studying for CS 100 usually means zyBooks in one tab, the lecture slides in another, a chatbot in a third, and an editor on the side. Every switch costs you your place. The chatbot is the worst of it: it hands over the answer, you learn nothing, and the course counts it as cheating.

### Why it's better
| The usual way | py-tutor |
|---|---|
| Three tabs and two apps | One screen: read it, run it, write it |
| A chatbot writes the code | The tutor points at the line to fix and asks the right question. You write every line. |
| Paste into an IDE to see if it works | Check my code runs real tests in the browser, free, as often as you want |
| Guess what the program is doing | Visualize steps through any program and shows every variable and object |
| Only at a desk | Talk mode is hands-free, for the car or a walk |
| Generic Python | Lined up with our zyBook chapter by chapter, plus a timed 18-question practice exam |

## Voice
Talk like a classmate who already gets it, not like a textbook or a startup.
- **Short and concrete.** Name the thing: "three tabs and two apps", "Check my code", "Dec 19".
- **Plain words.** "Your code", "the line to fix", "free". No "leverage", "seamless", "empower", "unlock".
- **A little attitude is fine.** "Chatbots hand you the answer. That's the problem." / "just like zyBooks (just better ;)"
- **Honest about limits.** It never says it writes code, never promises a grade.
- **Every control names its action.** "Run", "Check my code", "Next line", "Ask the tutor about this". Errors say what went wrong and the way out.

Messaging, in order of weight:
1. No more three tabs and two apps just to learn Python.
2. It coaches. You code.
3. Check your code. Free, every time.
4. Watch your code think.
5. Study in the car.
6. Built for Dec 19.

## Name and mark
- The name is always lowercase with a hyphen: **py-tutor**.
- The mark is a `>_` prompt in Geist Mono Bold on a rounded square filled with the aurora (violet base, periwinkle top-left, pink bottom-right). Radius 8 at 28 px.
- Wordmark: Geist Bold, tracking -0.04em, next to the mark. Below 420 px only the mark shows.

## Colour
One theme: a dark studio. Near-black surfaces, white primary actions, a violet accent, and a pastel aurora wherever the product introduces itself.

| Token | Value | Use |
|---|---|---|
| `--paper` | #111111 | page |
| `--surface` / `--surface-2` | #1A1A1A / #222222 | panels, inputs |
| `--ink` / `--ink-2` / `--ink-3` | #F5F5F5 / #A8A8A8 / #8C8C8C | text, secondary, meta |
| `--line` / `--line-strong` | #262626 / #363636 | hairlines |
| `--accent` | #A78BFA | focus rings, current state, links on hover |
| `--ok` | #4ADE80 | passed tests, "what you nailed" |
| `--fix` | #FBBF24 | "what to fix" |
| `--err` | #F87171 | errors |

**Aurora** (heroes only): blobs of #A5B4FC, #C4B5FD, #F9A8D4, #A78BFA, #FBCFE8, #93C5FD that drift and shift hue on a #F4E8F7 to #F7DCEE base, with grain and a halftone ramp into the dark page. Dark text sits on it.

**Intro pairs** (kinetic type only). Each is a full-bleed slab with its text in a clashing partner, all pulled from the aurora:

| Slab | Text |
|---|---|
| #6D28D9 violet | #FBCFE8 pink |
| #FBCFE8 pink | #6B0F3A berry |
| #1E1B4B indigo | #93C5FD sky |
| #93C5FD sky | #1E3A8A navy |
| #111111 studio | #C4B5FD lilac |
| #86EFAC mint | #14532D forest |
| #FDE68A butter | #7C2D12 rust |
| #2E1065 plum | #F9A8D4 pink |
| #A78BFA violet | #14092B ink |

## Type
| Role | Face | Use |
|---|---|---|
| Display | Instrument Serif 400 (and italic) | intro statements, hero headlines, tour titles, exam score |
| UI | Geist Variable | everything else |
| Code | Geist Mono Variable | code, program input and output, the `>_` mark |

- Display is always weight 400 (it has no bold) with tracking -0.02em and leading 0.95 to 1.05. Intro size: `clamp(2.5rem, min(12.5vw, 16vh), 11rem)`.
- UI scale (rem): 0.75 / 0.875 / 1 / 1.1875 / 1.4375 / 1.75 / 2.125 / 2.5. Headings tighten to -0.035em.
- Body measure stays under 68ch. Numbers use tabular figures.

## Motion
- Ease: `cubic-bezier(0.16, 1, 0.3, 1)` (exponential out). Never ease-in.
- 160 ms for control states, 240 ms for panels and steps, 450 ms for screen changes.
- Buttons press to `scale(0.97)`.
- `prefers-reduced-motion` removes every movement below; state is still clear from words and colour.

### Signature 1: the distortion wave
The "it worked" moment. Inspired by Jakub Antalik's Distortion Waves; built from scratch as a WebGL shader (`src/ui/wave.ts`).
- A ring of light leaves the exact point you tapped and grows to the far corner with an ease-out.
- Its edge wobbles with angular noise, splits into colour (red leads, blue trails), and carries small sparkles.
- When it reaches the panel's edges they light up, then everything fades by the end. About 1.1 s.
- The panel leans toward the tap (up to 3°, less on wide panels), blurs for a beat as the ring passes, and settles.
- Drawn on a canvas over the element with `mix-blend-mode: screen` on dark surfaces and normal blending on light ones. No WebGL means a CSS edge glow instead.

Tones:
| Tone | Colour | When |
|---|---|---|
| success | green | a passing Check my code |
| iridescent | violet → pink → butter → sky | mastering a skill, signing in, handing in the practice exam, "Get started" at the end of the intro, tapping the aurora |

It plays only on a real success or a deliberate tap. Never on load, never on a timer, never on a failure.

### Signature 2: kinetic type
How py-tutor introduces itself. Inspired by Anagram's typography for Raison (`src/ui/Intro.tsx`).
- One statement per screen, set huge in Instrument Serif, centred, on a full-bleed slab from the intro pairs.
- The opener rises out of masks line by line, top line first.
- Every later slab slides up over the last one (750 ms). Its lines ride up a beat behind it, bottom line first, so the statement builds upward and lands together.
- The supporting sentence fades up last while its letter-spacing tightens from 0.03em to 0.
- It moves on by itself (hold time grows with the words), or on tap, Space, or the arrow keys. A thin progress line per slide runs across the top in the slide's own ink.
- Where: first visit (before sign-in), once for existing accounts, and from Replay tour in the profile. Spotlight tour titles use the same face and rise in word by word.

### Supporting motion
- The highlighter sweep: the active code line fills left to right (420 ms).
- Headlines rise in word by word with a blur clearing.
- The glow ring: a slow conic gradient around the sign-in card and the ask box, brighter on focus.

## Texture
- **Halftone:** dots cut out of the aurora gradient, drifting a few pixels with the cursor. Used as a ramp under heroes, a ring around the talk orb, and a corner patch on topic cards.
- **Grain:** fractal noise at 16% soft-light over every gradient so it never bands.
- **Glass:** only for the small pills on the hero.

## Rules
1. Colour means something: green is passing, amber is "fix this", red is an error, violet is focus and current state. Decoration lives only in the aurora, the intro, and the wave.
2. Lists are rows split by hairlines, not boxes.
3. Lucide icons only, stroke 1.75 to 2. No emoji.
4. Every interactive element has hover, focus-visible (2 px accent ring, 2 px offset), active, and disabled states. Touch targets are at least 44 px, 56 px in talk mode.
5. Progress is always visible and always quiet: small text and a 2 px line.
6. Talk mode passes the arm's-length test: caption 28 px or larger, state readable from colour and label alone.
7. Solutions are never shown. There is no "show answer" control anywhere.
