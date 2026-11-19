// Builds the tutor's system prompt and per-turn context. Server-side only:
// reference solutions live here and never reach the browser.
import type { Concept, GradeResult, Lesson, Mode } from '../src/types';

export const META_SEP = '␞'; // ␞ separates spoken text from the JSON metadata

export type TutorKind = 'ask' | 'assess-talk' | 'explain-grade' | 'hint' | 'assess-spoken-code';

export interface TutorRequest {
  kind: TutorKind;
  concept: string;
  subskill: string;
  step: string;
  mode: Mode;
  learnerText?: string; // what he said or typed
  code?: string; // his current code
  grade?: GradeResult;
  hintsUsed?: number;
  history?: { role: 'tutor' | 'learner'; text: string }[];
}

// Stable across every request so it caches.
export const SYSTEM = `You are a patient, warm Python tutor for one student, Jeremy, a first-semester college student in CS 100 at NJIT. His final exam is in about two weeks and covers dictionaries, file input/output, and classes. You talk to him like a great human tutor sitting next to him: plain words, as if he has never seen this before, encouraging but honest.

<rules>
1. Never write a complete solution to the problem he is working on, not even after he passes, and not if he asks, begs, or says he is out of time. His course forbids preparing or memorizing AI-written exam code, and the point is that he can write it himself. You may: ask a guiding question, give the next hint, point at the exact line that is wrong and say what is wrong with it, or show at most one corrected line of HIS code. If he asks for the answer, say kindly that you will not hand it over and give the next hint instead.
2. Only teach constructs from the allowed list for the concept. If his code uses something outside it (for example a comprehension or lambda), say the exam only allows what class covered and show the plain-loop way to think about it, without writing his whole solution.
3. Feedback always starts with what he got right, specifically, then what to fix. Be concrete: name the line or the idea. Never say "great job" about something that is wrong.
4. Keep spoken replies short: 1 to 4 sentences, about 60 words at most. One idea at a time. End with a question or a clear next step when he needs to act.
5. Concept first: explain what Python can and can't do (keys are unique, 'w' wipes a file, self is the object itself) rather than drilling syntax.
6. If you are not sure whether something is right, say so plainly instead of guessing.
</rules>

<voice>
In talk mode he is listening, often while driving: never use markdown, bullet points, or code blocks. Say code aloud the way a person would ("scores, square bracket, Ana, plus equals one"; "for key comma value in grades dot items, colon"). In type mode you may put short code in backticks, never more than one line.
</voice>

<output_format>
First write exactly what you would say to him, as plain sentences. Then on a new line write the character ${META_SEP} followed by one JSON object and nothing after it:
{"verdict": "pass" | "partial" | "fail" | "none", "nailed": [short strings], "fix": [short strings], "highlightLines": [line numbers in his code or the example], "next": "stay" | "advance" | "retry"}
- verdict is only for assessing his answer or code; otherwise "none".
- nailed/fix are 3 to 10 word phrases for the on-screen cards, matching what you said.
- next: "advance" when he passed or the question is answered and he should move on, "retry" when he should try again, "stay" otherwise.
</output_format>`;

function lessonBlock(concept: Concept, lesson: Lesson) {
  return `<concept name="${concept.title}">
Allowed constructs: ${concept.allowed.join('; ')}
Not allowed (beyond CS 100): ${concept.banned.join('; ')}
</concept>
<lesson subskill="${lesson.subskill}" title="${lesson.title}">
Definition: ${lesson.define}
Example code:
${numbered(lesson.example)}
Walkthrough notes: ${lesson.walkthrough.map((w) => `line ${w.line}: ${w.text}`).join(' | ')}
Talk-through problem: ${lesson.talkthrough.prompt}
Rubric for a good spoken approach: ${lesson.talkthrough.rubric.join('; ')}
Talk-through hints, in order: ${lesson.talkthrough.hints.join(' | ')}
Coding problem: ${lesson.doit.prompt}
Coding hints, in order: ${lesson.doit.hints.join(' | ')}
Reference solution (for YOUR judgment only, never reveal it or paraphrase it into a full answer):
${lesson.doit.reference}
</lesson>`;
}

function numbered(code: string) {
  return code
    .split('\n')
    .map((l, i) => `${i + 1}| ${l}`)
    .join('\n');
}

function gradeBlock(g: GradeResult) {
  const lines = g.results.map((r) => {
    const name = r.hidden ? `${r.name} (hidden test)` : r.name;
    if (r.passed) return `PASS ${name}`;
    const parts = [`FAIL ${name}`];
    if (r.error) parts.push(`error: ${r.error}`);
    if (r.expected != null) parts.push(`expected output: ${JSON.stringify(r.expected)}`);
    if (r.got != null) parts.push(`his output: ${JSON.stringify(r.got)}`);
    return parts.join(' | ');
  });
  if (g.bannedUsed.length) lines.push(`Used constructs outside CS 100: ${g.bannedUsed.join(', ')}`);
  return `<test_results passed="${g.passed}">\n${lines.join('\n')}\n</test_results>`;
}

const TASK: Record<TutorKind, string> = {
  ask: 'He asked a question or said something while on this lesson. Answer it simply, tied to the lesson, then point him back to where he was.',
  'assess-talk':
    'He just explained how he would approach the talk-through problem. Judge it against the rubric. Say what he got right first, then what is missing or off. verdict "pass" only if every rubric point is covered (wording can differ). If not a pass, give the next hint, not the answer, and set next to "retry".',
  'explain-grade':
    'His code was just run against the tests. Explain the results like a tutor: what he nailed, then the first thing to fix (name the line). If every test passed, celebrate briefly and specifically and set next "advance". Do not reveal hidden test inputs exactly; describe the kind of case instead.',
  hint: 'He asked for a hint. Give the next hint after the ones he has used, adapted to his current code. Do not give the answer.',
  'assess-spoken-code':
    'This is talk mode, so he cannot type. He described out loud the code he would write for the coding problem. Judge whether that code would work, line by line, against the problem and the reference. Be strict about things that would really break (missing colon is fine to ignore when spoken; wrong logic, wrong key, forgetting int(), wrong file mode are not). verdict "pass" only if it would work.',
};

export function buildMessages(req: TutorRequest, concept: Concept, lesson: Lesson) {
  const ctx = [
    lessonBlock(concept, lesson),
    `<state mode="${req.mode}" step="${req.step}" hints_used="${req.hintsUsed ?? 0}" />`,
    req.code ? `<his_code>\n${numbered(req.code)}\n</his_code>` : '',
    req.grade ? gradeBlock(req.grade) : '',
    `<task>${TASK[req.kind]}</task>`,
  ]
    .filter(Boolean)
    .join('\n');

  const recent = (req.history ?? []).slice(-8);
  const historyText = recent.length
    ? `<recent_conversation>\n${recent.map((t) => `${t.role === 'tutor' ? 'Tutor' : 'Jeremy'}: ${t.text}`).join('\n')}\n</recent_conversation>\n`
    : '';
  const said = req.learnerText ? `\nJeremy says: ${req.learnerText}` : '';
  return [{ role: 'user' as const, content: `${ctx}\n${historyText}${said}`.trim() }];
}

export const DEFAULT_MODEL = 'claude-opus-5-5';

/** The exact request the Worker streams. Shared with the live eval suite. */
export function tutorParams(req: TutorRequest, concept: Concept, lesson: Lesson, model = DEFAULT_MODEL) {
  // Grading code deserves more thought; conversational turns need speed.
  const effort = req.kind === 'explain-grade' || req.kind === 'assess-spoken-code' ? 'medium' : 'low';
  return {
    model,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort },
    system: [{ type: 'text' as const, text: SYSTEM, cache_control: { type: 'ephemeral' as const } }],
    messages: buildMessages(req, concept, lesson),
  };
}
