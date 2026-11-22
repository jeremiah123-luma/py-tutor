import { describe, expect, it } from 'vitest';
import { homeGreeting, timeGreeting } from '../src/ui/greeting';

const at = (h: number, day = 10) => new Date(2026, 10, day, h, 30);

describe('home greeting', () => {
  it('fits the time of day', () => {
    const morning = ['Good morning', 'Morning', 'Rise and shine', 'G’day mate'];
    const afternoon = ['Good afternoon', 'Good day', 'G’day mate', 'Howdy'];
    const evening = ['Good evening', 'Evening', 'Hey there'];
    const late = ['Up late', 'Burning the midnight oil', 'Still up'];
    for (let d = 1; d <= 30; d++) {
      expect(morning).toContain(timeGreeting(at(8, d)));
      expect(afternoon).toContain(timeGreeting(at(14, d)));
      expect(evening).toContain(timeGreeting(at(19, d)));
      expect(late).toContain(timeGreeting(at(23, d)));
      expect(late).toContain(timeGreeting(at(2, d)));
    }
  });
  it('is mostly the plain one, sometimes a looser one', () => {
    const got = Array.from({ length: 30 }, (_, d) => timeGreeting(at(8, d + 1)));
    const plain = got.filter((g) => g === 'Good morning').length;
    expect(plain).toBeGreaterThan(12);
    expect(plain).toBeLessThan(30);
  });
  it('stays the same all day within a time slot', () => {
    for (let d = 1; d <= 30; d++) expect(timeGreeting(at(12, d))).toBe(timeGreeting(at(16, d)));
  });
  it('uses the first name and says welcome back to returning people', () => {
    const g = homeGreeting('Jordan Test', true, at(19, 3));
    expect(g).toMatch(/^(Good evening|Evening|Hey there), Jordan\. Welcome back\.$/);
    expect(homeGreeting('Jordan', false, at(19, 3))).not.toMatch(/Welcome back/);
    expect(homeGreeting('', true, at(19, 3))).toMatch(/^\w[^,]*\. Welcome back\.$/);
  });
});
