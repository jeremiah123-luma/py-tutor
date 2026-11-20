import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { markTourSeen, resetTour, tourKey, tourSeen } from '../src/tour/state';
import { cardWidth, placeCard, spotlightRect, type Rect, type Viewport } from '../src/ui/Tour';

class MemStorage {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  get length() { return this.map.size; }
}

const g = globalThis as { localStorage?: unknown };

describe('tour state', () => {
  let store: MemStorage;
  beforeEach(() => {
    store = new MemStorage();
    g.localStorage = store;
    resetTour('u1');
    resetTour('u2');
  });
  afterEach(() => { delete g.localStorage; });

  it('uses py-tutor.tour.<userId>.<screen> keys', () => {
    expect(tourKey('u1', 'home')).toBe('py-tutor.tour.u1.home');
    markTourSeen('u1', 'home');
    expect(store.getItem('py-tutor.tour.u1.home')).toBe('1');
  });

  it('tracks each user and screen separately', () => {
    expect(tourSeen('u1', 'home')).toBe(false);
    markTourSeen('u1', 'home');
    expect(tourSeen('u1', 'home')).toBe(true);
    expect(tourSeen('u1', 'lesson')).toBe(false);
    expect(tourSeen('u2', 'home')).toBe(false);
  });

  it('reads marks written by an earlier session', () => {
    store.setItem('py-tutor.tour.u2.lesson', '1');
    expect(tourSeen('u2', 'lesson')).toBe(true);
  });

  it('resetTour clears every screen for that user only', () => {
    markTourSeen('u1', 'home');
    markTourSeen('u1', 'lesson');
    markTourSeen('u2', 'home');
    resetTour('u1');
    expect(tourSeen('u1', 'home')).toBe(false);
    expect(tourSeen('u1', 'lesson')).toBe(false);
    expect(tourSeen('u2', 'home')).toBe(true);
  });

  it('never throws when storage throws, and remembers in memory for the session', () => {
    const boom = () => { throw new Error('blocked'); };
    g.localStorage = { getItem: boom, setItem: boom, removeItem: boom };
    expect(tourSeen('u1', 'home')).toBe(false);
    expect(() => markTourSeen('u1', 'home')).not.toThrow();
    expect(tourSeen('u1', 'home')).toBe(true);
    expect(() => resetTour('u1')).not.toThrow();
    expect(tourSeen('u1', 'home')).toBe(false);
  });

  it('works with no localStorage at all', () => {
    delete g.localStorage;
    expect(tourSeen('u1', 'lesson')).toBe(false);
    markTourSeen('u1', 'lesson');
    expect(tourSeen('u1', 'lesson')).toBe(true);
  });
});

const desktop: Viewport = { width: 1280, height: 800 };
const phone: Viewport = { width: 393, height: 852, insets: { top: 59, right: 0, bottom: 34, left: 0 } };
const card = { width: 360, height: 200 };
const inside = (p: { top: number; left: number; width: number }, h: number, vp: Viewport, m = 12) => {
  const i = vp.insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
  expect(p.left).toBeGreaterThanOrEqual(i.left + m);
  expect(p.top).toBeGreaterThanOrEqual(i.top + m);
  expect(p.left + p.width).toBeLessThanOrEqual(vp.width - i.right - m);
  expect(p.top + h).toBeLessThanOrEqual(vp.height - i.bottom - m);
};

describe('placeCard', () => {
  it('centers when there is no target', () => {
    const p = placeCard(null, card, desktop);
    expect(p.mode).toBe('center');
    expect(p.left).toBe((1280 - 360) / 2);
    expect(p.top).toBe((800 - 200) / 2);
  });

  it('defaults to below the target, centered on it', () => {
    const t: Rect = { top: 100, left: 500, width: 200, height: 40 };
    const p = placeCard(t, card, desktop);
    expect(p).toMatchObject({ mode: 'anchored', side: 'bottom', top: 152 });
    expect(p.left).toBe(600 - 180);
  });

  it('flips to the top when there is no room below', () => {
    const t: Rect = { top: 700, left: 500, width: 200, height: 60 };
    const p = placeCard(t, card, desktop);
    expect(p.side).toBe('top');
    expect(p.top).toBe(700 - 12 - 200);
  });

  it('honors an explicit placement when it fits, and its opposite when not', () => {
    const t: Rect = { top: 300, left: 400, width: 200, height: 100 };
    expect(placeCard(t, card, desktop, { placement: 'right' })).toMatchObject({ side: 'right', left: 612 });
    expect(placeCard(t, card, desktop, { placement: 'left' })).toMatchObject({ side: 'left', left: 400 - 12 - 360 });
    const edge: Rect = { top: 300, left: 1000, width: 200, height: 100 };
    expect(placeCard(edge, card, desktop, { placement: 'right' }).side).toBe('left');
  });

  it('clamps horizontally so a target near the edge keeps the card on screen', () => {
    const t: Rect = { top: 100, left: 0, width: 40, height: 40 };
    const p = placeCard(t, card, desktop);
    expect(p.left).toBe(12);
    inside(p, card.height, desktop);
  });

  it('centers when the target fills the screen', () => {
    const t: Rect = { top: 0, left: 0, width: 1280, height: 800 };
    expect(placeCard(t, card, desktop).mode).toBe('center');
  });

  it('docks to the bottom on a phone, inside the safe area', () => {
    const t: Rect = { top: 200, left: 20, width: 100, height: 40 };
    const w = cardWidth(phone);
    expect(w).toBe(393 - 24);
    const p = placeCard(t, { width: w, height: 240 }, phone);
    expect(p.mode).toBe('dock');
    expect(p.top).toBe(852 - 34 - 12 - 240);
    inside(p, 240, phone);
  });

  it('never goes above the safe top on a phone, even when the card is tall', () => {
    const p = placeCard(null, { width: 369, height: 2000 }, phone);
    expect(p.top).toBe(59 + 12);
  });

  it('keeps the card on screen for a target scrolled off screen', () => {
    const t: Rect = { top: -500, left: 300, width: 200, height: 50 };
    const p = placeCard(t, card, desktop);
    inside(p, card.height, desktop);
  });

  it('cardWidth never exceeds the screen', () => {
    expect(cardWidth(desktop)).toBe(360);
    expect(cardWidth({ width: 650, height: 800 })).toBe(360);
    expect(cardWidth({ width: 320, height: 600 })).toBe(296);
  });

  it('spotlightRect pads the target', () => {
    expect(spotlightRect({ top: 10, left: 20, width: 30, height: 40 }, 8)).toEqual({ top: 2, left: 12, width: 46, height: 56 });
  });
});
