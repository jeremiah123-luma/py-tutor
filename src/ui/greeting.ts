// The line above the home headline: a greeting for the time of day, with the person's first name.
// Most days it's the plain one ("Good evening"); now and then a looser one ("G'day mate") so it doesn't feel canned.
// Picked by the date, so it stays the same all day instead of changing on every visit.

const SLOTS: { until: number; plain: string; extra: string[] }[] = [
  { until: 5, plain: 'Up late', extra: ['Burning the midnight oil', 'Still up'] },
  { until: 12, plain: 'Good morning', extra: ['Morning', 'Rise and shine', 'G’day mate'] },
  { until: 17, plain: 'Good afternoon', extra: ['Good day', 'G’day mate', 'Howdy'] },
  { until: 22, plain: 'Good evening', extra: ['Evening', 'Hey there'] },
  { until: 24, plain: 'Up late', extra: ['Burning the midnight oil', 'Still up'] },
];

export function timeGreeting(now = new Date()): string {
  const h = now.getHours();
  const i = SLOTS.findIndex((s) => h < s.until);
  const slot = SLOTS[i];
  const day = Math.floor((now.getTime() - now.getTimezoneOffset() * 60_000) / 86_400_000);
  // 2 days in 5 get a looser one, the rest the plain one
  if ((day * 7 + i) % 5 < 2) return slot.extra[(day + i) % slot.extra.length];
  return slot.plain;
}

/** "Good evening, Jordan. Welcome back." (or without "Welcome back" on someone's first visit). */
export function homeGreeting(name: string, returning: boolean, now = new Date()): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  const g = timeGreeting(now);
  const hello = first ? `${g}, ${first}` : g;
  return returning ? `${hello}. Welcome back.` : `${hello}.`;
}
