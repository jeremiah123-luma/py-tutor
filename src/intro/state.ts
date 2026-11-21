// Whether this browser has seen the intro. Tests set the tour skip key, which skips this too.
const KEY = 'py-tutor.intro.seen';
export function introSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1' || localStorage.getItem('py-tutor.tour.skip-all') === '1';
  } catch {
    return false;
  }
}
export function markIntroSeen(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* blocked storage: it plays again next visit, which is harmless */
  }
}
