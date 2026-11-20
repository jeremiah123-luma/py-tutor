// Remembers which first-run tours a user has seen. localStorage can throw (private mode, blocked storage),
// so every access is wrapped, and an in-memory set keeps a finished tour from coming back in the same session.
import type { TourScreen } from './types';

export const TOUR_SCREENS: readonly TourScreen[] = ['home', 'lesson'];

const memory = new Set<string>();

export function tourKey(userId: string, screen: TourScreen): string {
  return `py-tutor.tour.${userId}.${screen}`;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function tourSeen(userId: string, screen: TourScreen): boolean {
  const key = tourKey(userId, screen);
  if (memory.has(key)) return true;
  try {
    return storage()?.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function markTourSeen(userId: string, screen: TourScreen): void {
  const key = tourKey(userId, screen);
  memory.add(key);
  try {
    storage()?.setItem(key, '1');
  } catch {
    /* storage full or blocked: the in-memory mark still holds for this session */
  }
}

export function resetTour(userId: string): void {
  for (const screen of TOUR_SCREENS) {
    const key = tourKey(userId, screen);
    memory.delete(key);
    try {
      storage()?.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}
