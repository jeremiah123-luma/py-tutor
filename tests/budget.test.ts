// The class budget: today's allowance = budget left / days left / active people.
import { describe, expect, it } from 'vitest';
import { applyCharge, claudeCost, dailyAllowance, daysBetween, daysLeftInMonth, isCapped, nyDate } from '../worker/budget';

describe('class budget', () => {
  it('counts today in the days left', () => {
    expect(daysLeftInMonth('2026-11-01')).toBe(30);
    expect(daysLeftInMonth('2026-11-30')).toBe(1);
    expect(daysLeftInMonth('2026-12-21')).toBe(11);
  });

  it('splits what is left over the days left and the active people', () => {
    // $30, nothing spent, Nov 21 (10 days left), 5 people -> $0.60 each
    expect(dailyAllowance(30, 0, '2026-11-21', 5)).toBeCloseTo(0.6);
    // the next week 10 people are active and $15 is gone with 6 days left
    expect(dailyAllowance(30, 15, '2026-11-25', 10)).toBeCloseTo(0.25);
    // nobody active yet still gives one share; an overspent month gives nothing
    expect(dailyAllowance(30, 0, '2026-11-21', 0)).toBeCloseTo(3);
    expect(dailyAllowance(30, 31, '2026-11-21', 5)).toBe(0);
  });

  it('the month can never run past its budget if everyone spends their full share every day', () => {
    let spent = 0;
    for (let d = 1; d <= 30; d++) {
      const date = `2026-11-${String(d).padStart(2, '0')}`;
      spent += dailyAllowance(30, spent, date, 7) * 7;
    }
    expect(spent).toBeLessThanOrEqual(30 + 1e-9);
    expect(spent).toBeCloseTo(30);
  });

  it('caps at the allowance plus approved extra credit, and at the month budget', () => {
    expect(isCapped(0.19, 0.2, 0, 1, 30)).toBe(false);
    expect(isCapped(0.2, 0.2, 0, 1, 30)).toBe(true);
    expect(isCapped(0.2, 0.2, 0.5, 1, 30)).toBe(false);
    expect(isCapped(0, 0.2, 0.5, 30, 30)).toBe(true);
  });

  it('extra credit is only used once the daily allowance is gone', () => {
    expect(applyCharge(0.1, 0.2, 0.5, 0.05)).toEqual({ spentToday: 0.15000000000000002, bonus: 0.5 });
    const r = applyCharge(0.15, 0.2, 0.5, 0.1); // 0.05 over
    expect(r.bonus).toBeCloseTo(0.45);
    expect(applyCharge(0.3, 0.2, 0.5, 0.1).bonus).toBeCloseTo(0.4);
    expect(applyCharge(0.3, 0.2, 0.05, 0.1).bonus).toBe(0);
  });

  it('prices a Claude reply from its token counts', () => {
    expect(claudeCost({ input_tokens: 1_000_000 })).toBeCloseTo(4);
    expect(claudeCost({ output_tokens: 1000, cache_read_input_tokens: 3000 })).toBeCloseTo(0.0206);
  });

  it('uses New York dates', () => {
    expect(nyDate(new Date('2026-11-21T03:00:00Z'))).toBe('2026-11-20'); // 10 PM in New York
    expect(daysBetween('2026-11-14', '2026-11-21')).toBe(7);
  });
});
