// Free "Check my code" feedback, written from the test results alone (no AI call, no credits).
import type { GradeResult } from '../types';

const show = (s: string) => (s === '' ? '(nothing)' : s.replace(/\n$/, ''));

/** The first line where two outputs differ, 1-based, or 0 if they match line by line. */
function firstDiff(expected: string, got: string) {
  const a = expected.replace(/\n$/, '').split('\n');
  const b = got.replace(/\n$/, '').split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return { line: i + 1, want: a[i], have: b[i] };
  return null;
}

export function gradeFeedback(grade: GradeResult): { text: string; nailed: string[]; fix: string[] } {
  const total = grade.results.length;
  const passing = grade.results.filter((r) => r.passed).length;
  const nailed = passing ? [`${passing} of ${total} tests pass.`] : [];
  if (grade.passed) return { text: `All ${total} tests pass. Nice work.`, nailed: [`All ${total} tests pass.`], fix: [] };

  const fix: string[] = [];
  if (grade.bannedUsed.length)
    fix.push(`The final only allows what class covered, so don't use: ${grade.bannedUsed.join(', ')}.`);

  const bad = grade.results.find((r) => !r.passed && !r.hidden) ?? grade.results.find((r) => !r.passed);
  if (!bad) {
    // every test passes; only a banned construct failed it
  } else if (bad.error) {
    const last = bad.error.trim().split('\n').pop() ?? bad.error;
    fix.push(`"${bad.name}" stopped with an error: ${last}. Find the line it points to and fix that first.`);
  } else if (bad.hidden) {
    fix.push(`A hidden test ("${bad.name}") fails. Your code works on the sample, so try other inputs: an empty case, a single item, or a value that repeats.`);
  } else if (bad.expected !== undefined && bad.got !== undefined) {
    const d = firstDiff(bad.expected, bad.got);
    if (!d) fix.push(`"${bad.name}" is off only by spacing or a blank line at the end. Compare your output with the expected output character by character.`);
    else if (d.have === undefined) fix.push(`"${bad.name}": your output stops early. Line ${d.line} should be ${show(d.want)}.`);
    else if (d.want === undefined) fix.push(`"${bad.name}": your output has an extra line ${d.line}: ${show(d.have)}.`);
    else if (d.want.replace(/\s+/g, ' ').trim() === d.have.replace(/\s+/g, ' ').trim()) fix.push(`"${bad.name}", line ${d.line}: the words are right but the spaces are different.`);
    else fix.push(`"${bad.name}", line ${d.line}: expected ${show(d.want)} but your code printed ${show(d.have)}.`);
  } else fix.push(`"${bad.name}" fails. Look at it in the results below.`);

  const text = [...nailed, ...fix].join(' ');
  return { text, nailed, fix };
}
