// The code someone has typed on Try it, kept on this device per account and lesson, so leaving (or a reload, or the
// sign-in running out) doesn't throw it away. Cleared once that lesson's round is passed and a fresh one starts.
const key = (user: string, concept: string, subskill: string) => `py-tutor.draft.${user}.${concept}.${subskill}`;

export function draftStore(user: string, concept: string, subskill: string) {
  const k = key(user, concept, subskill);
  return {
    load(): string | null {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    save(code: string) {
      try {
        localStorage.setItem(k, code);
      } catch {
        /* storage full or blocked: the draft just isn't kept */
      }
    },
    clear() {
      try {
        localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
    },
  };
}
