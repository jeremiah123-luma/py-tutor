# Plan: multiple-choice practice for every lesson

Status: planned, not started.

## Goal
A short set of exam-style questions on each of the 20 lessons (7 Dictionaries, 6 Files, 7 Classes), so a student can check they understand the idea before writing code and drill it again later. The final's short questions are this format, so the practice should be too.

## What a quiz looks like
- 4 to 6 questions per lesson, about 100 in total.
- Three kinds, the same ones the practice exam already uses (`DrillQuestion` in `src/types.ts`):
  - **What does this print?** Read a short program and pick (or type) the exact output.
  - **Pick one.** A concept question with four choices, such as which line adds a key, or what `self` is.
  - **Find the bug.** Pick the line that is wrong.
- Every question has a one or two line explanation, shown after answering.
- Questions use only what that lesson and earlier lessons taught (each concept's `allowed` list), and nothing that matches HW10 or HW11.

## Where it goes in the lesson
Recommended: a **Quick check** step between Line by line and Talk it through. The student has just read the example, and answering a few questions before explaining and writing code catches a misunderstanding early. The step row becomes Learn, Example, Line by line, Quick check, Talk it through, Try it.

Also:
- From Home, each topic card gets **Practice questions**, which runs all of that topic's questions in shuffled order with no lesson around them.
- A mastered lesson can reopen its quiz at any time.

## Rules
- **Free.** No AI call. Grading is local, using `checkShort` from `src/loop/drill.ts`.
- **Not part of mastery.** Mastery stays as it is (two clean passes, one typed). The quiz is practice; a wrong answer shows the explanation and moves on. A short score at the end ("4 of 5") is shown and saved per lesson.
- Wrong answers come back once at the end of the set, so a student sees each missed idea twice.
- Talk mode reads each question aloud with lettered choices and takes "A", "B", "C" or "D" by voice. Predict questions become choices in talk mode.

## Building it
1. **Types.** Add `quiz?: DrillQuestion[]` to `Lesson`. Reuse `DrillQuestion` as is, so the drill and the quizzes share one checker and one renderer.
2. **Content.** Write the questions in each concept file next to its lesson (`src/curriculum/dictionaries.ts`, `files.ts`, `classes.ts`), each with a stable `id`.
3. **Verification tests**, extending `tests/drill.test.ts`:
   - every predict answer matches the real Python output (run in Pyodide, as the drill does now);
   - every choice index is valid and choices aren't duplicated;
   - no question uses a construct outside the concept's allowed list (run `banned_used` on question code);
   - each lesson has at least 4 questions, with at least one of each kind across a topic.
4. **Engine.** A `quiz` step in `src/loop/engine.ts` between `walkthrough` and `talkthrough`, with `goTo('quiz')` for the step tabs. Skippable, like Talk it through.
5. **UI.** Pull the question view out of `DrillScreen.tsx` into a shared `QuestionCard` component, then use it in the lesson stage and in a topic practice screen. Phone first: choices are full-width tap targets.
6. **Progress.** Save the best score per lesson in `Progress` (local and KV sync, like the rest), and show it on the lesson's line in the topic card.
7. **Tour.** One tutorial step for Quick check, and update "Five steps per lesson".
8. **Tests and checks.** Unit tests for the engine step and score saving; an e2e test that answers a quiz on a phone viewport; the same iPhone frame-by-frame check used for the intro.

## Size
About a day of work for the code, and most of the effort is writing and checking about 100 good questions. Content can go topic by topic: Dictionaries first (HW10 is due Nov 25), then Files, then Classes.

## Open questions
- Quick check before Talk it through (recommended), or after Try it as a review?
- Should a perfect quiz score count for anything on Home (a badge, a check on the lesson), or stay purely practice?
