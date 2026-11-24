import { describe, expect, it } from 'vitest';
import { emptyProgress, spotFor, withLast, withSlide } from '../src/loop/progress';
import { cleanProgress, mergeProgress } from '../src/loop/mergeProgress';
import { CONCEPT_IDS } from '../src/curriculum/ids';

const [A, B] = CONCEPT_IDS;

describe('stopping places', () => {
  it('keeps one stopping place per topic', () => {
    let p = withLast(emptyProgress(), A, 'one', 'walkthrough', 3);
    p = withLast(p, B, 'two', 'doit');
    expect(p.spots?.[A]).toMatchObject({ subskill: 'one', step: 'walkthrough', line: 3 });
    expect(p.spots?.[B]).toMatchObject({ subskill: 'two', step: 'doit' });
    expect(p.last).toEqual({ concept: B, subskill: 'two', step: 'doit' });
  });

  it('remembers the Learn slide, and keeps it when the lesson is opened again on Learn', () => {
    let p = withLast(emptyProgress(), A, 'one', 'define');
    p = withSlide(p, A, 'one', 4);
    expect(spotFor(p, A, 'one')?.slide).toBe(4);
    p = withLast(p, A, 'one', 'define'); // opening the lesson again
    expect(spotFor(p, A, 'one')?.slide).toBe(4);
    p = withLast(p, A, 'one', 'example'); // moving on forgets the slide
    expect(spotFor(p, A, 'one')?.slide).toBe(0);
  });

  it('does not save a slide for a different lesson or step', () => {
    const p = withLast(emptyProgress(), A, 'one', 'doit');
    expect(withSlide(p, A, 'one', 2)).toBe(p);
    expect(withSlide(p, A, 'other', 2)).toBe(p);
    expect(spotFor(p, A, 'other')).toBeUndefined();
  });

  it('survives cleaning, and merging keeps the newer place in each topic', () => {
    const old = withLast(emptyProgress(), A, 'one', 'define');
    old.spots![A]!.at = 1000;
    const newer = withLast(emptyProgress(), A, 'one', 'walkthrough', 2);
    const other = withLast(emptyProgress(), B, 'two', 'quiz');
    const m = mergeProgress(cleanProgress(old), mergeProgress(cleanProgress(newer), cleanProgress(other)));
    expect(m.spots?.[A]).toMatchObject({ step: 'walkthrough', line: 2 });
    expect(m.spots?.[B]).toMatchObject({ step: 'quiz' });
  });

  it('drops a stopping place that is not in the shape the app writes', () => {
    const p = cleanProgress({ concepts: {}, updatedAt: 1, spots: { [A]: { subskill: '__proto__!', step: 'define' }, [B]: { subskill: 'ok', step: 'nope' } } });
    expect(p.spots).toBeUndefined();
  });
});
