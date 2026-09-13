import { useCallback, useEffect } from 'react';
import { create } from 'zustand';
import type { Verb } from '@/types/verb';
import type { Exercise, ExerciseResponse, ExerciseType } from '@/exercises/types';
import { buildSession, type SessionPlan } from '@/exercises/sessionBuilder';
import {
  gradeAnswer,
  gradeOrder,
  gradeSelection,
  type GradeResult,
  type StrictnessPolicy,
  type Verdict,
} from '@/lib/grader';
import type { CardId } from '@/lib/srs';
import { comboMultiplier, useGamification } from '@/store/gamificationStore';
import { masteredVerbIds, useProgress } from '@/store/progressStore';
import { enabledCategories, enabledExerciseTypes, useSettings } from '@/store/settingsStore';
import { dayKey } from '@/lib/dates';
import { isRecord } from '@/store/storage';

/**
 * Runs a practice session: builds the queue, grades each response, feeds the
 * result into spaced repetition, and awards experience.
 */

export type SessionPhase = 'idle' | 'active' | 'feedback' | 'complete';

export interface SessionSummary {
  answered: number;
  correct: number;
  xp: number;
  bestCombo: number;
  perfect: boolean;
  durationMs: number;
}

const EMPTY_RESPONSE: ExerciseResponse = { kind: 'text', value: '' };

/** Exercises where the learner types the answer, for the "Selbst getippt" badge. */
const TYPED_TYPES: readonly ExerciseType[] = [
  'typedConjugation',
  'sentenceCompletion',
  'errorCorrection',
  'tenseTransformation',
];

interface SessionData {
  plan: SessionPlan | null;
  index: number;
  phase: SessionPhase;
  response: ExerciseResponse;
  result: GradeResult | null;
  hintUsed: boolean;
  combo: number;
  lastXp: number;
  summary: SessionSummary;
  questionStartedAt: number;
  sessionStartedAt: number;
  /** Completion bookkeeping already ran for this session. */
  finished: boolean;
}

const IDLE: SessionData = {
  plan: null,
  index: 0,
  phase: 'idle',
  response: EMPTY_RESPONSE,
  result: null,
  hintUsed: false,
  combo: 0,
  lastXp: 0,
  summary: { answered: 0, correct: 0, xp: 0, bestCombo: 0, perfect: true, durationMs: 0 },
  questionStartedAt: 0,
  sessionStartedAt: 0,
  finished: false,
};

/*
 * The running session lives outside the component, so leaving the practice
 * page and coming back resumes it. It is also mirrored to sessionStorage (per
 * tab), so a full reload resumes it too. Timers are saved as elapsed time, so
 * time spent away is not counted against the answer.
 */
const SAVED_KEY = 'dvm.session.v1';

type SavedSession = Omit<SessionData, 'questionStartedAt' | 'sessionStartedAt'> & {
  questionElapsedMs: number;
  sessionElapsedMs: number;
};

const isCount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Only a running session is saved; anything else in the key is dropped. */
function isSavedSession(value: unknown): value is SavedSession {
  if (!isRecord(value) || (value.phase !== 'active' && value.phase !== 'feedback')) return false;
  const { plan, response, summary } = value;
  const exercises = isRecord(plan) ? plan.exercises : null;
  return (
    Array.isArray(exercises) &&
    exercises.every((e) => isRecord(e) && typeof e.verbId === 'string' && Array.isArray(e.cardIds)) &&
    Number.isInteger(value.index) &&
    (value.index as number) >= 0 &&
    (value.index as number) < exercises.length &&
    isRecord(response) &&
    ['text', 'choice', 'order', 'pairs'].includes(response.kind as string) &&
    // Feedback means the answer was already graded and recorded.
    (value.phase === 'feedback' ? isRecord(value.result) : value.result === null) &&
    isRecord(summary) &&
    ['answered', 'correct', 'xp', 'bestCombo', 'durationMs'].every((key) => isCount(summary[key])) &&
    typeof summary.perfect === 'boolean' &&
    ['combo', 'lastXp', 'questionElapsedMs', 'sessionElapsedMs'].every((key) => isCount(value[key])) &&
    typeof value.hintUsed === 'boolean' &&
    typeof value.finished === 'boolean'
  );
}

function loadSession(): SessionData {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(SAVED_KEY) ?? 'null');
    if (isSavedSession(saved)) {
      const { questionElapsedMs, sessionElapsedMs, ...data } = saved;
      const now = Date.now();
      return { ...data, questionStartedAt: now - questionElapsedMs, sessionStartedAt: now - sessionElapsedMs };
    }
  } catch {
    // Malformed JSON or unavailable storage: start idle.
  }
  saveSession(IDLE);
  return IDLE;
}

function saveSession(state: SessionData) {
  try {
    if (state.phase !== 'active' && state.phase !== 'feedback') {
      sessionStorage.removeItem(SAVED_KEY);
      return;
    }
    const { questionStartedAt, sessionStartedAt, ...data } = state;
    const now = Date.now();
    const saved: SavedSession = {
      ...data,
      questionElapsedMs: now - questionStartedAt,
      sessionElapsedMs: now - sessionStartedAt,
    };
    sessionStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  } catch {
    // Unavailable or full storage: the session stays in memory only.
  }
}

const useSessionStore = create<SessionData>(() => loadSession());
useSessionStore.subscribe(saveSession);
// Refresh the elapsed timers right before the page goes away.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => saveSession(useSessionStore.getState()));
}

/**
 * Count a session once: sessions completed, perfect sessions, badges. Runs on
 * normal completion and on "End session"; the flag keeps repeat calls inert.
 * A session ended early is perfect only if every planned exercise was answered
 * correctly, which it cannot be.
 */
function finishSession() {
  const { plan, summary, finished } = useSessionStore.getState();
  if (!plan || finished || summary.answered === 0) return;
  useSessionStore.setState({ finished: true });

  useProgress.getState().completeSession();
  useGamification
    .getState()
    .registerSessionResult(summary.perfect && summary.answered === plan.exercises.length);
  syncAchievements();
}

export function useSession(verbsById: Map<string, Verb>, pool: readonly Verb[]) {
  const {
    plan,
    index,
    phase,
    response,
    result,
    hintUsed,
    combo,
    lastXp,
    summary,
  } = useSessionStore();

  // A finished session has nothing to resume; show the start card next time.
  useEffect(
    () => () => {
      if (useSessionStore.getState().phase === 'complete') useSessionStore.setState(IDLE);
    },
    [],
  );

  // A restored session can reference verbs that are no longer loaded; drop it.
  useEffect(() => {
    if (verbsById.size > 0 && plan?.exercises.some((e) => !verbsById.has(e.verbId))) {
      useSessionStore.setState(IDLE);
    }
  }, [plan, verbsById]);

  const exercise: Exercise | null = plan?.exercises[index] ?? null;

  const start = useCallback(
    (options?: { length?: number; onlyDue?: boolean }) => {
      finishSession();
      const settings = useSettings.getState();
      const built = buildSession({
        verbs: pool,
        cards: useProgress.getState().cards,
        enabledCategories: enabledCategories(settings),
        enabledTypes: enabledExerciseTypes(settings),
        length: options?.length ?? settings.session.length,
        newCardLimit: options?.onlyDue ? 0 : settings.session.newCardLimit,
        showTranslations: settings.showTranslations,
      });

      const now = Date.now();
      useSessionStore.setState({
        ...IDLE,
        plan: built,
        sessionStartedAt: now,
        questionStartedAt: now,
        phase: built.exercises.length > 0 ? 'active' : 'complete',
      });
    },
    [pool],
  );

  const submit = useCallback(() => {
    const state = useSessionStore.getState();
    const current = state.plan?.exercises[state.index];
    if (!current || state.phase !== 'active') return;

    const verb = verbsById.get(current.verbId);
    const graded = grade(current, state.response, verb);
    const responseMs = Date.now() - state.questionStartedAt;

    const nextCombo = graded.correct ? state.combo + 1 : 0;
    const multiplier = comboMultiplier(nextCombo);
    const xp = graded.correct ? Math.round(current.baseXp * multiplier) : 0;

    // Detect a genuinely forgotten card climbing back out, for the badge.
    const before = useProgress.getState().cards[current.cardIds[0]];
    const wasLapsed = before?.state === 'lapsed' && before.lapses > 0;

    const progress = useProgress.getState();
    progress.recordAnswer({
      cardIds: current.cardIds,
      verbId: current.verbId,
      category: current.category,
      slot: current.cardIds[0]?.split('|')[2] ?? '_',
      exerciseType: current.type,
      result: graded,
      response: describeResponse(state.response),
      responseMs,
      hintUsed: state.hintUsed,
      xpAwarded: xp,
      cardResults: current.type === 'matching' ? matchingResults(current, state.response) : undefined,
    });

    const gamification = useGamification.getState();
    if (graded.correct) {
      gamification.awardXp(xp);
      gamification.registerCombo(nextCombo);
      if (TYPED_TYPES.includes(current.type)) gamification.registerProductionCorrect();
      if (wasLapsed) {
        const after = useProgress.getState().cards[current.cardIds[0]];
        if (after && after.state !== 'lapsed') gamification.registerComeback();
      }
    }

    if (verb) gamification.registerTouched(verb.level, graded.correct ? current.category : undefined);
    gamification.registerPractice();

    // Daily goal is evaluated against the day's cumulative XP after every
    // answer, so several short or abandoned sessions still add up.
    const today = dayKey();
    const todayXp = useProgress.getState().daily[today]?.xp ?? 0;
    if (todayXp >= useSettings.getState().dailyGoalXp) gamification.registerGoalMet(today);

    useSessionStore.setState({
      combo: nextCombo,
      lastXp: xp,
      result: graded,
      phase: 'feedback',
      summary: {
        answered: state.summary.answered + 1,
        correct: state.summary.correct + (graded.correct ? 1 : 0),
        xp: state.summary.xp + xp,
        bestCombo: Math.max(state.summary.bestCombo, nextCombo),
        perfect: state.summary.perfect && graded.correct,
        durationMs: Date.now() - state.sessionStartedAt,
      },
    });
  }, [verbsById]);

  const advance = useCallback(() => {
    const state = useSessionStore.getState();
    if (!state.plan) return;
    const nextIndex = state.index + 1;

    if (nextIndex >= state.plan.exercises.length) {
      finishSession();
      useSessionStore.setState({
        summary: { ...state.summary, durationMs: Date.now() - state.sessionStartedAt },
        phase: 'complete',
      });
      return;
    }

    useSessionStore.setState({
      index: nextIndex,
      response: EMPTY_RESPONSE,
      result: null,
      hintUsed: false,
      questionStartedAt: Date.now(),
      phase: 'active',
    });
  }, []);

  const reset = useCallback(() => {
    finishSession();
    useSessionStore.setState(IDLE);
  }, []);

  const setResponse = useCallback(
    (next: ExerciseResponse) => useSessionStore.setState({ response: next }),
    [],
  );

  const revealHint = useCallback(() => useSessionStore.setState({ hintUsed: true }), []);

  return {
    plan,
    exercise,
    index,
    total: plan?.exercises.length ?? 0,
    phase,
    response,
    setResponse,
    result,
    hintUsed,
    revealHint,
    combo,
    multiplier: comboMultiplier(combo),
    lastXp,
    summary,
    start,
    submit,
    advance,
    reset,
  };
}

/** Verb strictness is a ceiling; learner settings can only relax it. */
function policyFor(verb: Verb | undefined): StrictnessPolicy {
  const user = useSettings.getState().strictness;
  if (!verb) return user;
  return {
    capitalization: user.capitalization && verb.strictness.capitalization,
    umlauts: user.umlauts && verb.strictness.umlauts,
    eszett: user.eszett && verb.strictness.eszett,
    wordOrder: user.wordOrder && verb.strictness.wordOrder,
    allowTypos: user.allowTypos,
  };
}

/** Every string form of the verb, so the grader can tell a wrong form from a typo. */
function verbForms(verb: Verb | undefined): string[] {
  const forms: string[] = [];
  const walk = (value: unknown, key?: string) => {
    // `reason` and `preferred` are annotations, not forms.
    if (key === 'reason' || key === 'preferred') return;
    if (typeof value === 'string') forms.push(value);
    else if (value && typeof value === 'object') {
      Object.entries(value).forEach(([childKey, child]) => walk(child, childKey));
    }
  };
  walk(verb?.forms);
  walk(verb?.optionalReflexiveForms);
  return forms;
}

function grade(current: Exercise, given: ExerciseResponse, verb: Verb | undefined): GradeResult {
  switch (current.type) {
    case 'multipleChoice':
      return gradeSelection(given.kind === 'choice' ? given.value : null, current.answer);

    case 'typedConjugation':
    case 'sentenceCompletion':
    case 'errorCorrection':
    case 'tenseTransformation':
      return gradeAnswer(
        given.kind === 'text' ? given.value : '',
        current.accepted,
        policyFor(verb),
        verbForms(verb),
      );

    case 'sentenceReconstruction':
      return gradeOrder(given.kind === 'order' ? given.value : [], current.correctOrder);

    case 'matching': {
      const chosen = given.kind === 'pairs' ? given.value : {};
      const wrong = current.pairs.filter((pair) => chosen[pair.left] !== pair.right);
      const allAnswered = current.pairs.every((pair) => Boolean(chosen[pair.left]));
      if (!allAnswered) {
        return {
          correct: false,
          verdict: 'empty',
          target: current.pairs.map((p) => `${p.left} → ${p.right}`).join(', '),
          diagnostics: [],
          distance: wrong.length,
        };
      }
      return {
        correct: wrong.length === 0,
        verdict: wrong.length === 0 ? 'correct' : 'incorrect',
        target: current.pairs.map((p) => `${p.left} → ${p.right}`).join(', '),
        diagnostics:
          wrong.length === 0
            ? []
            : [
                {
                  code: 'wrongForm',
                  message: `${wrong.length} pair${wrong.length === 1 ? '' : 's'} not matched correctly.`,
                  fatal: true,
                },
              ],
        distance: wrong.length,
      };
    }

    default:
      throw new Error('Unhandled exercise type.');
  }
}

/** Each matching pair reviews its own card: right pairs pass, wrong ones fail. */
function matchingResults(
  current: Extract<Exercise, { type: 'matching' }>,
  given: ExerciseResponse,
): Record<CardId, Verdict> {
  const chosen = given.kind === 'pairs' ? given.value : {};
  return Object.fromEntries(
    current.pairs.map((pair) => [pair.cardId, chosen[pair.left] === pair.right ? 'correct' : 'incorrect']),
  );
}

/** Flatten a response into the string stored in the mistake log. */
function describeResponse(response: ExerciseResponse): string {
  switch (response.kind) {
    case 'text':
      return response.value;
    case 'choice':
      return response.value ?? '';
    case 'order':
      return response.value.join(' ');
    case 'pairs':
      return Object.entries(response.value)
        .map(([left, right]) => `${left}→${right}`)
        .join(', ');
    default:
      return '';
  }
}

/** Recompute badge state from the authoritative stores. */
export function syncAchievements() {
  const progress = useProgress.getState();
  const masteredCards = Object.values(progress.cards).filter(
    (card) => card.state === 'mastered',
  ).length;

  useGamification.getState().syncAchievements({
    totalAnswered: progress.totalAnswered,
    totalCorrect: progress.totalCorrect,
    sessionsCompleted: progress.sessionsCompleted,
    masteredCards,
    masteredVerbs: masteredVerbIds(progress.cards).size,
  });
}
