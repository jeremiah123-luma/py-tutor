// App shell: sign in -> home -> lesson (type) | talk | drill. Wires the UI to the loop engine.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Toaster, toast } from 'sonner';
import { AnimatePresence } from 'motion/react';
import type { Concept, ConceptId, DrillQuestion, Mode, Progress } from './types';
import { concepts as conceptMap, conceptOrder } from './curriculum';
import { drill as drillBank } from './curriculum/drill';
import { Session } from './loop/engine';
import { hideSplash } from './ui/splash';
import { addPasskey, askTutor, googleClientId, removePasskeys, me, onCap, signInWithGoogle, signOut, type Account, type Usage } from './loop/api';
import { GoogleButton } from './ui/GoogleButton';
import * as Dialog from '@radix-ui/react-dialog';
import { ProfileContext } from './ui/Profile';
import { usePointerParallax } from './ui/usePointerParallax';
import { draftStore } from './loop/drafts';
import { emptyProgress, flushProgress, loadProgress, recordQuiz, saveProgress, setProgressUser, sub } from './loop/progress';
import { quizFor, quizzes } from './curriculum/quiz';
import { FOCUS } from './curriculum/ids';
import { PracticeScreen } from './screens/PracticeScreen';
import { buildDrill, type Drill } from './loop/drill';
import { browserRunner, type PyRunner } from './runtime/runner';
import type { TalkController } from './voice/talk';

// Voice (VAD model runtime) only loads when talk mode is used.
const loadTalk = () => import('./voice/talk').then((m) => m.TalkController);
import { primeMic, releaseMic, unlockAudio } from './voice/audio';
import { endAll, setTalkScreenOn, silenceAll } from './voice/registry';
import { releaseMediaAudioSession } from './intro/sound';
import { HomeScreen } from './screens/HomeScreen';
import { LessonScreen } from './screens/LessonScreen';
import { TalkScreen } from './screens/TalkScreen';
import { DrillScreen } from './screens/DrillScreen';
import { AuthScreen } from './screens/AuthScreen';
import { AdminScreen } from './screens/AdminScreen';
import { CapDialog } from './ui/CapDialog';
import { Tour } from './ui/Tour';
import { Reveal } from './ui/Reveal';
import { Intro } from './ui/Intro';
import { introSeen, markIntroSeen } from './intro/state';
import { TOUR_STEPS } from './tour/steps';
import { markTourSeen, resetTour, tourSeen } from './tour/state';
import type { TourScreen } from './tour/types';

/** Tests set this to keep the first-run tour out of the way. */
const tourOff = () => {
  try {
    return localStorage.getItem('py-tutor.tour.skip-all') === '1';
  } catch {
    return false;
  }
};
import { VisualizeScreen, type VizInit } from './screens/VisualizeScreen';
import { PHASES, phaseIndex } from './ui/StepTrack';

type Screen = 'home' | 'lesson' | 'talk' | 'drill' | 'viz' | 'admin' | 'practice';

const CONCEPTS = conceptOrder.map((id) => conceptMap[id]).filter(Boolean) as Concept[];
/** Quick check questions from the earlier topics: the practice exam mixes in a few, since the final is cumulative. */
const REVIEW_POOL = () => CONCEPTS.filter((c) => !FOCUS.includes(c.id)).flatMap((c) => c.lessons.flatMap((l) => quizzes[c.id]?.[l.subskill] ?? []));
/** Every Quick check question in a topic, in lesson order (Practice questions on Home shuffles them). */
const PRACTICE = Object.fromEntries(CONCEPTS.map((c) => [c.id, c.lessons.flatMap((l) => quizzes[c.id]?.[l.subskill] ?? [])])) as Record<ConceptId, DrillQuestion[]>;
const REVIEW = REVIEW_POOL();
const SUBSKILLS = Object.fromEntries(CONCEPTS.map((c) => [c.id, c.lessons.map((l) => l.subskill)]));
const MODE_KEY = 'py-tutor-mode';

let runnerSingleton: PyRunner | null = null;
const runner = () => (runnerSingleton ??= browserRunner());

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'talk' ? 'talk' : 'type';
  } catch {
    return 'type';
  }
}

/**
 * Where "Continue" goes, in order: the lesson in progress; the next unmastered lesson in the topic he's working
 * in; then the final's main topics (lessons not tried, then tried but not mastered); then the earlier topics the
 * same way. So finishing a Basics lesson keeps him in Basics, and nobody is sent to Basics while a main topic
 * still has unmastered work.
 */
function nextLesson(p: Progress): { concept: ConceptId; index: number } {
  const idx = (c: ConceptId, s: string) => conceptMap[c]?.lessons.findIndex((l) => l.subskill === s) ?? -1;
  const open = (c: Concept, test: (s: ReturnType<typeof sub>) => boolean) => c.lessons.findIndex((l) => test(sub(p, c.id, l.subskill)));
  if (p.last && conceptMap[p.last.concept]) {
    const i = idx(p.last.concept, p.last.subskill);
    if (i >= 0 && !sub(p, p.last.concept, p.last.subskill).mastered) return { concept: p.last.concept, index: i };
    const j = open(conceptMap[p.last.concept]!, (s) => !s.mastered);
    if (j >= 0) return { concept: p.last.concept, index: j };
  }
  for (const group of [CONCEPTS.filter((c) => FOCUS.includes(c.id)), CONCEPTS.filter((c) => !FOCUS.includes(c.id))]) {
    for (const c of group) {
      const i = open(c, (s) => s.attempts === 0);
      if (i >= 0) return { concept: c.id, index: i };
    }
    for (const c of group) {
      const i = open(c, (s) => !s.mastered);
      if (i >= 0) return { concept: c.id, index: i };
    }
  }
  return { concept: CONCEPTS[0].id, index: 0 };
}

/** First lesson in a topic that isn't mastered yet (lesson 1 if it's all mastered). */
const firstOpen = (p: Progress, c: Concept) => Math.max(0, c.lessons.findIndex((l) => !sub(p, c.id, l.subskill).mastered));
/** Mastered lessons that still exist in the topic (a renamed lesson's old save doesn't count). */
const masteredIn = (p: Progress, c: Concept) => c.lessons.filter((l) => sub(p, c.id, l.subskill).mastered).length;

function useSession(s: Session | null) {
  return useSyncExternalStore(
    useCallback(
      (fn: () => void) => {
        if (!s) return () => {};
        const off = s.subscribe(fn);
        return () => void off();
      },
      [s],
    ),
    () => s?.state ?? null,
  );
}

function useTalk(t: TalkController | null) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!t) return;
    const off = t.subscribe(() => force((n) => n + 1));
    return () => void off();
  }, [t]);
  return t;
}

export default function App() {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [cap, setCap] = useState<{ open: boolean; usage?: Usage }>({ open: false });
  const [tourTick, setTourTick] = useState(0);
  const [introOpen, setIntroOpen] = useState(false);
  const [progress, setProgressState] = useState<Progress>(emptyProgress);
  const progressRef = useRef(progress);
  const [screen, setScreen] = useState<Screen>('home');
  const [practice, setPractice] = useState<ConceptId | null>(null);
  const [connectGoogle, setConnectGoogle] = useState(false);
  // Connect Google shows only when Google sign-in is set up
  const [googleOn, setGoogleOn] = useState(false);
  useEffect(() => {
    void googleClientId().then((id) => setGoogleOn(!!id));
  }, []);
  const [mode, setModeState] = useState<Mode>(readMode);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [returning, setReturning] = useState(false);
  /** The lesson was opened by a question typed on Home: show the Ask panel with it. */
  const [askFromHome, setAskFromHome] = useState(false);
  // used once, by the lesson screen that opens for it (it reads it when it mounts)
  useEffect(() => {
    if (!askFromHome || screen !== 'lesson') return;
    const t = window.setTimeout(() => setAskFromHome(false), 50);
    return () => window.clearTimeout(t);
  }, [askFromHome, screen]);
  sessionRef.current = session;
  const [talk, setTalk] = useState<TalkController | null>(null);
  const talkRef = useRef<TalkController | null>(null);
  talkRef.current = talk;
  const [programInput, setProgramInput] = useState('');
  const [drill, setDrill] = useState<Drill | null>(null);
  const [viz, setViz] = useState<{ init?: VizInit; from: 'home' | 'lesson' } | null>(null);
  const openViz = (from: 'home' | 'lesson', init?: VizInit) => {
    runner(); // warm Python
    setViz({ init, from });
    setScreen('viz');
  };
  const talkReady = useRef<Promise<TalkController | null> | null>(null);
  const talkGen = useRef(0);
  const [talkLoadFailed, setTalkLoadFailed] = useState(false);
  const nextSkillRef = useRef<() => void>(() => {});
  /** Load Talk mode for this session. If he leaves before it finishes loading, it shuts itself down instead of
   *  starting to speak (and opening the mic) on whatever screen he's on by then. */
  const loadTalkFor = (s: Session) => {
    const gen = ++talkGen.current;
    setTalkLoadFailed(false);
    talkReady.current = loadTalk().then(
      (TC) => {
        if (gen !== talkGen.current) return null;
        const tc = new TC(s);
        tc.onNextSkill = () => nextSkillRef.current();
        setTalk(tc);
        return tc;
      },
      () => {
        // the voice code didn't download (bad signal, or a new version went live): say so; a tap retries
        if (gen === talkGen.current) {
          releaseMic();
          setTalkLoadFailed(true);
        }
        return null;
      },
    );
  };
  const cancelTalk = () => {
    talkGen.current++;
    talkReady.current = null;
  };
  const state = useSession(session);
  usePointerParallax();
  useTalk(talk);

  const setProgress = useCallback((p: Progress) => {
    progressRef.current = p;
    setProgressState(p);
    void saveProgress(p);
  }, []);

  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
  };

  const enter = useCallback(async (u: Account) => {
    setAccount(u);
    setProgressUser(u.id);
    // Never leave the start-up screen waiting on a bad connection: progress that can't load in time starts from this
    // device's copy (loadProgress falls back to it) and syncs later.
    const loaded = await loadProgress().catch(() => emptyProgress());
    // "Welcome back" is for people who had progress when they opened the app, not after their first try today
    setReturning(Object.values(loaded.concepts).some((c) => Object.keys(c ?? {}).length > 0));
    progressRef.current = loaded;
    setProgressState(loaded);
    setUnlocked(true);
    void me().then((m) => m && setUsage(m.usage));
  }, []);

  // Boot: signed in already (cookie)? then progress.
  useEffect(() => {
    me().then((m) => {
      if (!m) return setUnlocked(false);
      setUsage(m.usage);
      void enter(m.user);
    });
  }, [enter]);

  // Signed out somewhere else, or the 60-day sign-in ran out: back to the sign-in screen. Progress stays saved on
  // this device and merges back in once he signs in again.
  useEffect(() => {
    const onLocked = () => {
      if (!account) return;
      stopRef.current();
      toast.message('Your sign-in ran out. Sign in again to keep going.', { description: 'Your progress and the code you were writing are saved.' });
      setAccount(null);
      setProgressUser('');
      setScreen('home');
      setUnlocked(false);
    };
    window.addEventListener('py-tutor:locked', onLocked);
    return () => window.removeEventListener('py-tutor:locked', onLocked);
  }, [account]);

  // The start-up screen lifts once we know whether to show sign-in or home.
  useEffect(() => {
    if (unlocked !== null) hideSplash();
  }, [unlocked]);

  // Classmates who signed up before the intro existed see it once, on their next visit.
  useEffect(() => {
    if (account && !introSeen()) setIntroOpen(true);
  }, [account]);

  // Any AI call that hits the daily cap opens the pop-up.
  useEffect(
    () =>
      onCap((u) => {
        if (u) setUsage(u);
        setCap({ open: true, usage: u });
      }),
    [],
  );

  const startLesson = useCallback(
    (conceptId: ConceptId, index: number, m: Mode) => {
      const keep = m === 'talk' && talk && !talk.isEnded ? talk : null; // next skill in Talk mode keeps the open mic
      if (!keep) {
        cancelTalk();
        talk?.end();
        setTalk(null);
      }
      const concept = conceptMap[conceptId]!;
      const s = new Session(concept, index, m, {
        tutor: askTutor,
        run: (code, stdin, files, trace) => runner().run(code, stdin, files, trace),
        grade: (code, tests) => runner().grade(code, tests, []),
        getProgress: () => progressRef.current,
        setProgress,
        draft: draftStore(account?.id ?? '', conceptId, concept.lessons[index]?.subskill ?? ''),
      });
      setSession(s);
      setProgramInput('');
      if (m === 'talk' && keep) {
        setScreen('talk');
        void keep.adopt(s);
      } else if (m === 'talk') {
        setScreen('talk');
        loadTalkFor(s); // starts on the first tap (iOS audio needs a gesture)
      } else {
        runner(); // warm Python while he reads the definition
        // Coming back to a lesson he left while writing code: pick up at Try it, with his code
        // (read before start(), which records this visit as being on Learn)
        const last = progressRef.current.last;
        s.start();
        const here = last && last.concept === conceptId && last.subskill === concept.lessons[index]?.subskill;
        if (here && (last.step === 'doit' || last.step === 'check')) s.goTo('doit');
        else if (here && last.step === 'quiz' && quizFor(conceptId, concept.lessons[index].subskill).length) s.goTo('quiz');
        setScreen('lesson');
      }
      return s;
    },
    [setProgress, talk, account],
  );

  /** Stops talk mode (even one still loading), the mic, and the tutor. */
  const stopEverything = () => {
    cancelTalk();
    void talkRef.current?.end();
    void endAll(); // and any other one, even one this screen no longer holds
    releaseMic();
    setTalk(null);
    sessionRef.current?.interrupt();
  };
  // Leaving the app (home screen, another app, the lock button) silences talk mode until he taps again. iOS keeps a
  // home-screen app running for a while in the background, and talk mode is hands-free, so it would otherwise keep
  // reading the lesson and answering whatever the mic heard. Every live talk controller is paused, not just the one
  // this screen holds. iOS doesn't always send visibilitychange to a home-screen app, so pagehide, freeze and a blur
  // while hidden do the same.
  const introOpenRef = useRef(introOpen);
  introOpenRef.current = introOpen;
  useEffect(() => {
    const quiet = () => {
      silenceAll();
      // the intro's 'playback' session and silent loop keep an iPhone page alive in the background
      if (!introOpenRef.current) releaseMediaAudioSession();
    };
    const hide = () => {
      if (document.visibilityState === 'hidden') quiet();
    };
    document.addEventListener('visibilitychange', hide);
    document.addEventListener('freeze', quiet);
    window.addEventListener('pagehide', quiet);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      document.removeEventListener('freeze', quiet);
      window.removeEventListener('pagehide', quiet);
      window.removeEventListener('blur', hide);
      // unmounting (a hot reload in development): nothing may keep talking from the old tree
      setTalkScreenOn(false);
      void endAll();
    };
  }, []);
  const stopRef = useRef(stopEverything);
  stopRef.current = stopEverything;
  // Talk mode only speaks while its screen is the one up. Any other screen ends it, whatever path led there.
  useEffect(() => {
    const on = screen === 'talk' && !!unlocked;
    setTalkScreenOn(on);
    if (on) {
      if (!introOpen) releaseMediaAudioSession(); // a 'playback' session can't record, and keeps running hidden
    } else if (talkRef.current || talkReady.current) stopRef.current();
    else void endAll();
  }, [screen, unlocked, introOpen]);

  const goHome = () => {
    stopEverything();
    setScreen('home');
  };

  const nextSkill = () => {
    if (!session) return;
    const i = session.state.lessonIndex + 1;
    if (i < session.concept.lessons.length) startLesson(session.concept.id, i, session.mode);
    else {
      const ci = conceptOrder.indexOf(session.concept.id);
      const nextC = conceptOrder[ci + 1];
      toast.success(`${session.concept.title} done.`);
      if (nextC && conceptMap[nextC]) startLesson(nextC, firstOpen(progressRef.current, conceptMap[nextC]!), session.mode);
      else goHome();
    }
  };

  nextSkillRef.current = () => nextSkill();

  const switchMode = (m: Mode) => {
    setMode(m);
    if (!session) return;
    session.mode = m;
    if (m === 'talk') {
      setScreen('talk');
      loadTalkFor(session);
    } else {
      cancelTalk();
      void talk?.end();
      releaseMic();
      setTalk(null);
      session.events = {};
      runner();
      setScreen('lesson');
    }
  };

  // Browser back / iPhone swipe back: every screen but Home gets one history entry, so going back lands on Home
  // (or back in the lesson, from Visualize) instead of leaving the site.
  const inner = useRef(false);
  const ignorePop = useRef(false);
  const backRef = useRef<() => void>(() => {});
  backRef.current = () => {
    if (screen === 'drill') {
      // the exam decides (it asks first if there are answers); keep the entry until it actually leaves
      window.history.pushState({ pyInner: true }, '');
      inner.current = true;
      window.dispatchEvent(new Event('py-tutor:back'));
    } else if (screen === 'viz') setScreen(viz?.from === 'lesson' && session ? 'lesson' : 'home');
    else goHome();
  };
  useEffect(() => {
    if (!account) return;
    if (screen !== 'home' && !inner.current) {
      window.history.pushState({ pyInner: true }, '');
      inner.current = true;
    } else if (screen === 'home' && inner.current) {
      inner.current = false;
      ignorePop.current = true;
      window.history.back(); // drop the entry the in-app back button made unnecessary
    }
  }, [screen, account]);
  useEffect(() => {
    // Reloaded on an inner screen: the app starts on Home, so step off that leftover entry.
    if ((window.history.state as { pyInner?: boolean } | null)?.pyInner) {
      ignorePop.current = true;
      window.history.back();
    }
    const onPop = (e: PopStateEvent) => {
      if (ignorePop.current) {
        ignorePop.current = false;
        return;
      }
      if (!inner.current) {
        // Forward onto an old inner entry while on Home: there's nothing to show, so go back off it.
        if ((e.state as { pyInner?: boolean } | null)?.pyInner) {
          ignorePop.current = true;
          window.history.back();
        }
        return;
      }
      inner.current = false;
      backRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const cont = useMemo(() => nextLesson(progress), [progress]);
  const contLesson = conceptMap[cont.concept]!.lessons[cont.index];

  if (unlocked === null) return <div className="min-h-dvh bg-paper" />; // the start-up screen (index.html) covers this
  // (also on the sign-in screen, for "Your sign-in ran out")
  const toaster = (
    <Toaster
      position="bottom-center"
      toastOptions={{ style: { fontFamily: 'var(--font-ui)', background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)' } }}
    />
  );
  if (!unlocked)
    return (
      <>
        <AuthScreen onSignedIn={(u) => enter(u)} />
        {toaster}
      </>
    );

  // First-run tour: home right after signing in; the lesson tour the first time they reach "Try it",
  // when every part it points at is on screen.
  const tourScreen: TourScreen | null = (() => {
    if (!account || tourOff() || cap.open || introOpen) return null;
    void tourTick;
    if (screen === 'home' && !tourSeen(account.id, 'home')) return 'home';
    if (screen === 'lesson' && state?.step === 'doit' && !tourSeen(account.id, 'lesson')) return 'lesson';
    return null;
  })();

  const masteredCount = CONCEPTS.reduce((n, c) => n + masteredIn(progress, c), 0);
  const lessonCount = CONCEPTS.reduce((n, c) => n + c.lessons.length, 0);
  const profile = {
    name: account?.name ?? '',
    username: account?.username ?? '',
    admin: !!account?.admin,
    passkeys: account?.passkeys ?? 0,
    google: account?.google ?? null,
    onConnectGoogle: googleOn ? () => setConnectGoogle(true) : undefined,
    usage,
    mastered: masteredCount,
    total: lessonCount,
    mode,
    onAddPasskey: async () => {
      try {
        setAccount(await addPasskey());
        toast.success('Passkey added. Next time, sign in with Face ID or Touch ID.');
      } catch (e) {
        if (!['NotAllowedError', 'AbortError'].includes((e as Error).name)) toast.error('The passkey couldn’t be added. Try again.');
      }
    },
    onRemovePasskeys: async () => {
      if (!window.confirm('Remove your passkey? You’ll sign in with your password, and you can add a new passkey after.')) return;
      try {
        setAccount(await removePasskeys());
        toast.success('Passkey removed. You can add a new one from this menu.');
      } catch {
        toast.error('That didn’t work. Try again.');
      }
    },
    onAdmin: () => setScreen('admin'),
    onOpen: () => void me().then((m) => m && setUsage(m.usage)),
    onReplayTour: () => {
      if (!account) return;
      if (screen === 'drill' && !window.confirm('Leave the practice exam? Your answers so far will be lost.')) return;
      resetTour(account.id);
      goHome();
      setIntroOpen(true); // the intro first, then the spotlight tour picks up on Home
      setTourTick((n) => n + 1);
    },
    onSignOut: async () => {
      stopEverything();
      await flushProgress(); // anything still waiting to upload belongs to this account
      await signOut(); // finish signing out first, so a quick sign-in right after can't have its new session cleared
      setAccount(null);
      setProgressUser('');
      setScreen('home');
      setUnlocked(false);
    },
  };

  return (
    <ProfileContext.Provider value={profile}>
      <AnimatePresence initial={false}>
      {screen === 'home' && (
        <Reveal key="home">
        <HomeScreen
          name={account?.name}
          returning={returning}
          concepts={CONCEPTS}
          progress={progress}
          subskills={SUBSKILLS}
          mode={mode}
          onModeChange={(m) => {
            setMode(m);
            if (m === 'talk') void loadTalk(); // warm the voice chunk
          }}
          onContinue={() => startLesson(cont.concept, cont.index, mode)}
          onAsk={(text) => {
            setMode('type');
            setAskFromHome(true);
            const s = startLesson(cont.concept, cont.index, 'type');
            void s.say(text);
          }}
          onTalkNow={() => {
            // a one-off talk session: the saved Type/Talk choice stays as it was
            unlockAudio();
            void primeMic().catch(() => {});
            void loadTalk();
            startLesson(cont.concept, cont.index, 'talk');
          }}
          onStart={(id) => {
            const c = conceptMap[id]!;
            startLesson(id, firstOpen(progress, c), mode);
          }}
          onDrill={() => {
            runner();
            setDrill(buildDrill(drillBank, CONCEPTS.filter((c) => FOCUS.includes(c.id)), Math.random, REVIEW));
            setScreen('drill');
          }}
          onVisualize={() => openViz('home')}
          onPractice={(id) => {
            setPractice(id);
            setScreen('practice');
          }}
          continueLabel={`${progress.updatedAt ? 'Continue' : 'Start'}: ${contLesson.title.charAt(0).toLowerCase()}${contLesson.title.slice(1)}`}
        />
        </Reveal>
      )}

      {screen === 'lesson' && session && state && (
        <Reveal key={`lesson-${session.concept.id}-${session.state.lessonIndex}`}>
        <LessonScreen
          startAsk={askFromHome}
          session={state}
          concept={session.concept}
          mode="type"
          programInput={programInput}
          onProgramInputChange={setProgramInput}
          onCodeChange={(c) => session.setCode(c)}
          onRun={() => void session.run(programInput)}
          onCheck={() => void session.check()}
          onExplainCheck={() => void session.explainCheck()}
          onSend={(t) => void session.say(t)}
          onStep={(dir) => {
            if (dir === 'back') session.back();
            else if (state.step === 'check' || state.step === 'mastered' || state.step === 'quiz') nextSkill();
            else session.next();
          }}
          onHint={() => void session.hint()}
          onModeChange={switchMode}
          onBack={goHome}
          onJump={(t) => session.goTo(t)}
          onTrace={() => session.traceExample()}
          quiz={quizFor(session.concept.id, session.lesson.subskill)}
          onQuizScore={(right, of) => setProgress(recordQuiz(progressRef.current, session.concept.id, session.lesson.subskill, right, of))}
          quizDoneLabel={session.hasNextLesson ? 'Next skill' : conceptOrder[conceptOrder.indexOf(session.concept.id) + 1] ? 'Next topic' : 'Back to Home'}
          onVisualize={(code, files) => openViz('lesson', { code, files, stdin: programInput, from: session.lesson.title })}
        />
        </Reveal>
      )}

      {screen === 'talk' && session && state && (
        <Reveal key="talk">
        <TalkScreen
          state={talk?.ring ?? 'idle'}
          error={!!talk?.error || talkLoadFailed}
          passed={state.step === 'check' || state.step === 'mastered' || state.step === 'quiz'}
          caption={(talkLoadFailed ? 'Voice mode didn’t load. Check your connection and tap to try again.' : '') || talk?.error || talk?.caption || (state.turns.length ? '' : 'I’ll explain it out loud, then you answer out loud. No reading needed.')}
          context={`${session.concept.title} · ${state.step === 'mastered' ? 'Mastered' : (PHASES[phaseIndex(state.step)]?.label ?? '')}`}
          onTap={() => {
            // After a pass, a tap moves on, but only once he's had the feedback (a tap while it speaks interrupts it)
            if ((state.step === 'check' || state.step === 'mastered' || state.step === 'quiz') && (talk?.ring === 'listening' || talk?.ring === 'idle')) return nextSkill();
            unlockAudio(); // synchronously, inside the gesture
            void primeMic().catch(() => {}); // iPhone: the mic must be asked for inside the tap
            if (talkLoadFailed) loadTalkFor(session);
            void talkReady.current?.then((t) => t?.tap());
          }}
          onExit={goHome}
        />
        </Reveal>
      )}

      {screen === 'practice' && practice && conceptMap[practice] && (
        <Reveal key={`practice-${practice}`}>
          <PracticeScreen concept={conceptMap[practice]!} questions={PRACTICE[practice]} onExit={goHome} />
        </Reveal>
      )}

      {screen === 'drill' && drill && (
        <Reveal key="drill">
        <DrillScreen
          drill={drill}
          grade={(code, problem) => runner().grade(code, problem.tests, [])}
          onExit={goHome}
          conceptTitle={(id) => conceptMap[id]?.title ?? id}
        />
        </Reveal>
      )}

      {screen === 'viz' && viz && (
        <Reveal key="viz">
          <VisualizeScreen
            init={viz.init}
            concepts={CONCEPTS}
            visualize={(code, stdin, files) => runner().visualize(code, stdin, files)}
            backLabel={viz.from === 'lesson' ? 'Lesson' : 'Home'}
            onBack={() => setScreen(viz.from === 'lesson' && session ? 'lesson' : 'home')}
          />
        </Reveal>
      )}

      {screen === 'admin' && account?.admin && (
        <Reveal key="admin">
          <AdminScreen onBack={() => setScreen('home')} />
        </Reveal>
      )}
      </AnimatePresence>

      {tourScreen && account && (
        <Tour
          key={`${tourScreen}-${tourTick}`}
          steps={TOUR_STEPS}
          screen={tourScreen}
          onDone={() => {
            markTourSeen(account.id, tourScreen);
            setTourTick((n) => n + 1);
          }}
        />
      )}

      {introOpen && (
        <Intro
          signedIn
          onDone={() => {
            markIntroSeen();
            setIntroOpen(false);
          }}
        />
      )}

      <CapDialog open={cap.open} usage={cap.usage} onClose={() => setCap({ open: false })} />

      {toaster}
      <Dialog.Root open={connectGoogle} onOpenChange={setConnectGoogle}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-[121] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line-strong bg-surface p-5 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.7)] data-[state=open]:animate-[pop-in_220ms_var(--ease-out)]">
            <Dialog.Title className="text-md font-semibold">Connect Google sign-in</Dialog.Title>
            <Dialog.Description className="mt-1 mb-5 text-[0.9375rem] text-ink-2">
              Pick your Google account. Next time, Sign in with Google opens this same account, with all your progress.
            </Dialog.Description>
            <GoogleButton
              onCredential={async (cred) => {
                try {
                  setAccount((await signInWithGoogle(cred, true)).user);
                  setConnectGoogle(false);
                  toast.success('Google connected. You can sign in with it from now on.');
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            />
            <Dialog.Close asChild>
              <button type="button" className="mt-4 w-full text-center text-sm text-ink-3 hover:text-ink">
                Not now
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </ProfileContext.Provider>
  );
}
