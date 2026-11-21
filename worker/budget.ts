// The class AI budget. One monthly budget is shared by everyone who is actually using the tutor:
//   today's allowance per person = (budget left this month) / (days left this month) / (people active in the last 7 days)
// It is recomputed once a day, so it grows or shrinks as people start or stop using the tutor,
// and the month can never run past its budget. Admins are not capped and don't count against it.
// Checks, written hints and Visualize run in the browser and never touch this.

/** Prices in US dollars. Estimates for speech, exact token prices for Claude (Opus 5.5). */
export const PRICES = {
  claude: { input: 4 / 1e6, output: 20 / 1e6, cacheRead: 0.2 / 1e6, cacheWrite: 5 / 1e6 },
  sttPerCall: 0.003, // gpt-4o-mini-transcribe, ~$0.003/min; one spoken turn is under a minute
  ttsPerChar: 0.015 / 900, // gpt-4o-mini-tts, ~$0.015/min of speech at ~15 characters a second
};

export interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export function claudeCost(u: ClaudeUsage): number {
  const p = PRICES.claude;
  return (
    (u.input_tokens ?? 0) * p.input +
    (u.output_tokens ?? 0) * p.output +
    (u.cache_read_input_tokens ?? 0) * p.cacheRead +
    (u.cache_creation_input_tokens ?? 0) * p.cacheWrite
  );
}

/** Calendar dates in New York time (the class's time zone), as YYYY-MM-DD. */
export function nyDate(at = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

export function daysLeftInMonth(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return last - d + 1; // today counts
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Today's per-person allowance. */
export function dailyAllowance(budget: number, spentThisMonthBeforeToday: number, date: string, activePeople: number): number {
  const left = Math.max(0, budget - spentThisMonthBeforeToday);
  return left / daysLeftInMonth(date) / Math.max(1, activePeople);
}

/** How a new charge splits between the daily allowance and any extra credit he approved. */
export function applyCharge(spentToday: number, allowance: number, bonus: number, cost: number) {
  const overBefore = Math.max(0, spentToday - allowance);
  const overAfter = Math.max(0, spentToday + cost - allowance);
  const fromBonus = Math.min(bonus, overAfter - overBefore);
  return { spentToday: spentToday + cost, bonus: bonus - fromBonus };
}

/** bonus is what's LEFT of the extra credit: applyCharge already takes today's overage out of it. */
export function isCapped(spentToday: number, allowance: number, bonus: number, monthSpent: number, budget: number): boolean {
  return monthSpent >= budget || (spentToday >= allowance && bonus <= 1e-9);
}
