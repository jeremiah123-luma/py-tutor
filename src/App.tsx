// App shell: sign in -> home -> lesson (type) | talk | drill. Wires the UI to the loop engine.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Toaster, toast } from 'sonner';
import type { Concept, ConceptId, Mode, Progress } from './types';
import { concepts as conceptMap, conceptOrder } from './curriculum';
import { drill as drillBank } from './curriculum/drill';
import { Session } from './loop/engine';
import { addPasskey, askTutor, me, onCap, signOut, type Account, type Usage } from './loop/api';
import { ProfileContext } from './ui/Profile';
import { usePointerParallax } from './ui/usePointerParallax';
import { emptyProgress, loadProgress, reviewQueue, saveProgress, setProgressUser, sub } from './loop/progress';
import { buildDrill, type Drill } from './loop/drill';
import { browserRunner, type PyRunner } from './runtime/runner';
import type { TalkController } from './voice/talk';

// Voice (VAD model runtime) only loads when talk mode is used.
const loadTalk = () => import('./voice/talk').then((m) => m.TalkController);
import { primeMic, releaseMic, unlockAudio } from './voice/audio';
import { HomeScreen } from './screens/HomeScreen';
import { LessonScreen } from './screens/LessonScreen';
import { TalkScreen } from './screens/TalkScreen';
import { DrillScreen } from './screens/DrillScreen';
import { AuthScreen } from './screens/AuthScreen';
import { AdminScreen } from './screens/AdminScreen';
import { CapDialog } from './ui/CapDialog';
import { Tour } from './ui/Tour';
import { pageTransition } from './ui/pageTransition';
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

type Screen = 'home' | 'lesson' | 'talk' | 'drill' | 'viz' | 'admin';

const CONCEPTS = conceptOrder.map((id) => conceptMap[id]).filter(Boolean) as Concept[];
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

/** Where "Continue" goes: the lesson in progress, then the first lesson not tried yet, then review of tried-but-unmastered ones. */
function nextLesson(p: Progress): { concept: ConceptId; index: number } {
  const idx = (c: ConceptId, s: string) => conceptMap[c]!.lessons.findIndex((l) => l.subskill === s);
  if (p.last && !sub(p, p.last.concept, p.last.subskill).mastered) {
    const i = idx(p.last.concept, p.last.subskill);
    if (i >= 0) return { concept: p.last.concept, index: i };
  }
  for (const c of CONCEPTS) {
    const i = c.lessons.findIndex((l) => sub(p, c.id, l.subskill).attempts === 0);
    if (i >= 0) return { concept: c.id, index: i };
  }
  const r = reviewQueue(p)[0];
  if (r) return { concept: r.concept, index: idx(r.concept, r.subskill) };
  return { concept: CONCEPTS[0].id, index: 0 };
}

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
  const [screen, setScreenNow] = useState<Screen>('home');
  // every screen change opens out of the point that was tapped
  const setScreen = useCallback((s: Screen) => void pageTransition(() => setScreenNow(s)), []);
  const [mode, setModeState] = useState<Mode>(readMode);
  const [session, setSession] = useState<Session | null>(null);
  const [talk, setTalk] = useState<TalkController | null>(null);
  const [programInput, setProgramInput] = useState('');
  const [drill, setDrill] = useState<Drill | null>(null);
  const [viz, setViz] = useState<{ init?: VizInit; from: 'home' | 'lesson' } | null>(null);
  const openViz = (from: 'home' | 'lesson', init?: VizInit) => {
    runner(); // warm Python
    setViz({ init, from });
    setScreen('viz');
  };
  const talkReady = useRef<Promise<TalkController> | null>(null);
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
    const loaded = await loadProgress();
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
      talk?.end();
      setTalk(null);
      const concept = conceptMap[conceptId]!;
      const s = new Session(concept, index, m, {
        tutor: askTutor,
        run: (code, stdin, files, trace) => runner().run(code, stdin, files, trace),
        grade: (code, tests) => runner().grade(code, tests, []),
        getProgress: () => progressRef.current,
        setProgress,
      });
      setSession(s);
      setProgramInput('');
      if (m === 'talk') {
        setScreen('talk');
        talkReady.current = loadTalk().then((TC) => new TC(s)); // starts on the first tap (iOS audio needs a gesture)
        void talkReady.current.then(setTalk);
      } else {
        runner(); // warm Python while he reads the definition
        s.start();
        setScreen('lesson');
      }
      return s;
    },
    [setProgress, talk],
  );

  const goHome = () => {
    void talk?.end();
    releaseMic();
    setTalk(null);
    session?.interrupt();
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
      if (nextC && conceptMap[nextC]) startLesson(nextC, 0, session.mode);
      else goHome();
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    if (!session) return;
    session.mode = m;
    if (m === 'talk') {
      setScreen('talk');
      talkReady.current = loadTalk().then((TC) => new TC(session));
      void talkReady.current.then(setTalk);
    } else {
      void talk?.end();
      releaseMic();
      setTalk(null);
      session.events = {};
      runner();
      setScreen('lesson');
    }
  };

  const cont = useMemo(() => nextLesson(progress), [progress]);
  const contLesson = conceptMap[cont.concept]!.lessons[cont.index];

  if (unlocked === null) return <div className="min-h-dvh bg-paper" />;
  if (!unlocked) return <AuthScreen onSignedIn={(u) => enter(u)} />;

  // First-run tour: home right after signing in; the lesson tour the first time they reach "Try it",
  // when every part it points at is on screen.
  const tourScreen: TourScreen | null = (() => {
    if (!account || tourOff() || cap.open || introOpen) return null;
    void tourTick;
    if (screen === 'home' && !tourSeen(account.id, 'home')) return 'home';
    if (screen === 'lesson' && state?.step === 'doit' && !tourSeen(account.id, 'lesson')) return 'lesson';
    return null;
  })();

  const masteredCount = CONCEPTS.reduce((n, c) => n + Object.values(progress.concepts[c.id] ?? {}).filter((x) => x.mastered).length, 0);
  const lessonCount = CONCEPTS.reduce((n, c) => n + c.lessons.length, 0);
  const profile = {
    name: account?.name ?? '',
    username: account?.username ?? '',
    admin: !!account?.admin,
    passkeys: account?.passkeys ?? 0,
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
    onAdmin: () => setScreen('admin'),
    onOpen: () => void me().then((m) => m && setUsage(m.usage)),
    onReplayTour: () => {
      if (!account) return;
      resetTour(account.id);
      setScreen('home');
      setIntroOpen(true); // the intro first, then the spotlight tour picks up on Home
      setTourTick((n) => n + 1);
    },
    onSignOut: () => {
      void talk?.end();
      setTalk(null);
      session?.interrupt();
      void signOut();
      setAccount(null);
      setProgressUser('');
      void pageTransition(() => {
        setScreenNow('home');
        setUnlocked(false);
      });
    },
  };

  return (
    <ProfileContext.Provider value={profile}>
      {screen === 'home' && (
        <div key="home" className="animate-[screen-in_450ms_var(--ease-out)]">
        <HomeScreen
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
            const i = c.lessons.findIndex((l) => !sub(progress, id, l.subskill).mastered);
            startLesson(id, i === -1 ? 0 : i, mode);
          }}
          onDrill={() => {
            runner();
            setDrill(buildDrill(drillBank, CONCEPTS));
            setScreen('drill');
          }}
          onVisualize={() => openViz('home')}
          continueLabel={`${progress.updatedAt ? 'Continue' : 'Start'}: ${contLesson.title.charAt(0).toLowerCase()}${contLesson.title.slice(1)}`}
        />
        </div>
      )}

      {screen === 'lesson' && session && state && (
        <div key="lesson" className="animate-[screen-in_450ms_var(--ease-out)]">
        <LessonScreen
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
            else if (state.step === 'check' || state.step === 'mastered') nextSkill();
            else session.next();
          }}
          onHint={() => void session.hint()}
          onModeChange={switchMode}
          onBack={goHome}
          onJump={(t) => session.goTo(t)}
          onTrace={() => session.traceExample()}
          onVisualize={(code, files) => openViz('lesson', { code, files, stdin: programInput, from: session.lesson.title })}
        />
        </div>
      )}

      {screen === 'talk' && session && state && (
        <TalkScreen
          state={talk?.ring ?? 'idle'}
          error={!!talk?.error}
          caption={talk?.error || talk?.caption || (state.turns.length ? '' : 'I’ll explain it out loud, then you answer out loud. No reading needed.')}
          context={`${session.concept.title} · ${phaseIndex(state.step) < PHASES.length ? PHASES[phaseIndex(state.step)].label : 'Mastered'}`}
          onTap={() => {
            if (state.step === 'check' || state.step === 'mastered') return nextSkill();
            unlockAudio(); // synchronously, inside the gesture
            void primeMic().catch(() => {}); // iPhone: the mic must be asked for inside the tap
            void talkReady.current?.then((t) => t.tap());
          }}
          onExit={goHome}
        />
      )}

      {screen === 'drill' && drill && (
        <div key="drill" className="animate-[screen-in_450ms_var(--ease-out)]">
        <DrillScreen
          drill={drill}
          grade={(code, problem) => runner().grade(code, problem.tests, [])}
          onExit={goHome}
          conceptTitle={(id) => conceptMap[id]?.title ?? id}
        />
        </div>
      )}

      {screen === 'viz' && viz && (
        <div key="viz" className="animate-[screen-in_450ms_var(--ease-out)]">
          <VisualizeScreen
            init={viz.init}
            concepts={CONCEPTS}
            visualize={(code, stdin, files) => runner().visualize(code, stdin, files)}
            backLabel={viz.from === 'lesson' ? 'Lesson' : 'Home'}
            onBack={() => setScreen(viz.from === 'lesson' && session ? 'lesson' : 'home')}
          />
        </div>
      )}

      {screen === 'admin' && account?.admin && (
        <div key="admin" className="animate-[screen-in_450ms_var(--ease-out)]">
          <AdminScreen onBack={() => setScreen('home')} />
        </div>
      )}

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

      <Toaster
        position="bottom-center"
        toastOptions={{ style: { fontFamily: 'var(--font-ui)', background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)' } }}
      />
    </ProfileContext.Provider>
  );
}
