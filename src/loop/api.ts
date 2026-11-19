// Thin client for the Worker API.
import type { GradeResult, Mode, Progress } from '../types';

export const META_SEP = '␞';

export interface TutorMeta {
  verdict: 'pass' | 'partial' | 'fail' | 'none';
  nailed: string[];
  fix: string[];
  highlightLines: number[];
  next: 'stay' | 'advance' | 'retry';
}

export interface TutorAsk {
  kind: 'ask' | 'assess-talk' | 'explain-grade' | 'hint' | 'assess-spoken-code';
  concept: string;
  subskill: string;
  step: string;
  mode: Mode;
  learnerText?: string;
  code?: string;
  grade?: GradeResult;
  hintsUsed?: number;
  history?: { role: 'tutor' | 'learner'; text: string }[];
}

const PASS_KEY = 'py-tutor-pass';
export function getPass(): string {
  try {
    return localStorage.getItem(PASS_KEY) ?? '';
  } catch {
    return '';
  }
}
export function setPass(p: string) {
  try {
    localStorage.setItem(PASS_KEY, p);
  } catch {
    /* private mode: kept in memory only */
  }
  memPass = p;
}
let memPass = '';
const pass = () => getPass() || memPass;

export async function checkPass(p: string): Promise<boolean> {
  const r = await fetch('/api/ping', { headers: { 'x-pass': p } });
  return r.ok;
}

const EMPTY_META: TutorMeta = { verdict: 'none', nailed: [], fix: [], highlightLines: [], next: 'stay' };

export function parseMeta(raw: string): TutorMeta {
  try {
    const m = JSON.parse(raw.trim());
    return {
      verdict: m.verdict ?? 'none',
      nailed: Array.isArray(m.nailed) ? m.nailed : [],
      fix: Array.isArray(m.fix) ? m.fix : [],
      highlightLines: Array.isArray(m.highlightLines) ? m.highlightLines.filter((n: unknown) => typeof n === 'number') : [],
      next: m.next ?? 'stay',
    };
  } catch {
    return EMPTY_META;
  }
}

/** Streams the tutor's spoken text through onText (only the part before ␞), then resolves with text + meta. */
export async function askTutor(
  req: TutorAsk,
  onText: (delta: string) => void,
  signal?: AbortSignal,
): Promise<{ text: string; meta: TutorMeta }> {
  const r = await fetch('/api/tutor', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-pass': pass() },
    body: JSON.stringify(req),
    signal,
  });
  if (!r.ok || !r.body) throw new Error(r.status === 401 ? 'locked' : `tutor ${r.status}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let all = '';
  let emitted = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    all += dec.decode(value, { stream: true });
    const sep = all.indexOf(META_SEP);
    const visibleEnd = sep === -1 ? all.length : sep;
    if (visibleEnd > emitted) {
      onText(all.slice(emitted, visibleEnd));
      emitted = visibleEnd;
    }
  }
  const sep = all.indexOf(META_SEP);
  const text = (sep === -1 ? all : all.slice(0, sep)).trim();
  return { text, meta: sep === -1 ? EMPTY_META : parseMeta(all.slice(sep + 1)) };
}

export async function transcribe(audio: Blob, signal?: AbortSignal): Promise<string> {
  const fd = new FormData();
  const ext = audio.type.includes('mp4') ? 'mp4' : audio.type.includes('wav') ? 'wav' : 'webm';
  fd.append('audio', audio, `speech.${ext}`);
  const r = await fetch('/api/stt', { method: 'POST', headers: { 'x-pass': pass() }, body: fd, signal });
  if (!r.ok) throw new Error(`stt ${r.status}`);
  return ((await r.json()) as { text: string }).text;
}

export async function speechAudio(text: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const r = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-pass': pass() },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!r.ok) throw new Error(`tts ${r.status}`);
  return r.arrayBuffer();
}

export async function pullProgress(): Promise<Progress | null> {
  try {
    const r = await fetch('/api/progress', { headers: { 'x-pass': pass() } });
    return r.ok ? ((await r.json()) as Progress | null) : null;
  } catch {
    return null;
  }
}

export async function pushProgress(p: Progress) {
  try {
    await fetch('/api/progress', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-pass': pass() },
      body: JSON.stringify(p),
    });
  } catch {
    /* offline: IndexedDB copy is still there, next save retries */
  }
}
