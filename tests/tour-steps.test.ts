import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOUR_STEPS } from '../src/tour/steps';

const SOURCES = ['src/screens/HomeScreen.tsx', 'src/screens/LessonScreen.tsx', 'src/ui/LessonStage.tsx', 'src/ui/TopBar.tsx'];
const source = SOURCES.map((f) => readFileSync(resolve(__dirname, '..', f), 'utf8')).join('\n');

describe('tour steps', () => {
  it('has unique ids', () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every target exists as a data-tour attribute in the UI source', () => {
    for (const s of TOUR_STEPS) {
      if (!s.target) continue;
      expect(source.includes(`data-tour="${s.target}"`), `missing data-tour="${s.target}" for step ${s.id}`).toBe(true);
    }
  });

  it('keeps every body under 220 characters', () => {
    for (const s of TOUR_STEPS) expect(s.body.length, `${s.id}: ${s.body.length} chars`).toBeLessThan(220);
  });

  it('covers both screens', () => {
    expect(TOUR_STEPS.some((s) => s.screen === 'home')).toBe(true);
    expect(TOUR_STEPS.some((s) => s.screen === 'lesson')).toBe(true);
  });
});
