import { useCallback, useMemo, useRef, useState } from 'react';
import type { Verb } from '@/types/verb';
import type { Exercise, ExerciseResponse } from '@/exercises/types';
import { EXERCISE_TYPE_META } from '@/exercises/types';
import { buildSession, type SessionPlan } from '@/exercises/sessionBuilder';
import {
  gradeAnswer,
  gradeOrder,
  gradeSelection,
  type GradeResult,
  type StrictnessPolicy,
} from '@/lib/grader';
import { comboMultiplier, useGamification } from '@/store/gamificationStore';
import { masteredVerbIds, useProgress } from '@/store/progressStore';
import { enabledCategories, enabledExerciseTypes, useSettings } from '@/store/settingsStore';
import { dayKey } from '@/lib/dates';

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

export function useSession(verbsById: Map<string, Verb>, pool: readonly Verb[]) {
  const settings = useSettings();
  const recordAnswer = useProgress((state) => state.recordAnswer);
  const completeSession = useProgress((state) => state.completeSession);

  const gamification = useGamification();

  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<SessionPhase>('idle');
  const [response, setResponse] = useState<ExerciseResponse>(EMPTY_RESPONSE);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const [combo, setCombo] = useState(0);
  const [lastXp, setLastXp] = useState(0);

  const [summary, setSummary] = useState<SessionSummary>({
    answered: 0,
    correct: 0,
    xp: 0,
    bestCombo: 0,
    perfect: true,
    durationMs: 0,
  });

  const questionStartedAt = useRef<number>(Date.now());
  const sessionStartedAt = useRef<number>(Date.now());

  const categories = useMemo(() => enabledCategories(settings), [settings]);
  const types = useMemo(() => enabledExerciseTypes(settings), [settings]);

  const exercise: Exercise | null = plan?.exercises[index] ?? null;

  const start = useCallback(
    (options?: { length?: number; onlyDue?: boolean }) => {
      const built = buildSession({
        verbs: pool,
        cards: useProgress.getState().cards,
        enabledCategories: categories,
        enabledTypes: types,
        length: options?.length ?? settings.session.length,
        newCardLimit: options?.onlyDue ? 0 : settings.session.newCardLimit,
        showTranslations: settings.showTranslations,
      });

      setPlan(built);
      setIndex(0);
      setResponse(EMPTY_RESPONSE);
      setResult(null);
      setHintUsed(false);
      setCombo(0);
      setLastXp(0);
      setSummary({ answered: 0, correct: 0, xp: 0, bestCombo: 0, perfect: true, durationMs: 0 });
      sessionStartedAt.current = Date.now();
      questionStartedAt.current = Date.now();
      setPhase(built.exercises.length > 0 ? 'active' : 'complete');
    },
    [pool, categories, types, settings.session.length, settings.session.newCardLimit, settings.showTranslations],
  );

  /** Verb strictness is a ceiling; learner settings can only relax it. */
  const policyFor = useCallback(
    (verb: Verb | undefined): StrictnessPolicy => {
      const user = settings.strictness;
      if (!verb) return user;
      return {
        capitalization: user.capitalization && verb.strictness.capitalization,
        umlauts: user.umlauts && verb.strictness.umlauts,
        eszett: user.eszett && verb.strictness.eszett,
        wordOrder: user.wordOrder && verb.strictness.wordOrder,
        allowTypos: user.allowTypos,
      };
    },
    [settings.strictness],
  );

  const grade = useCallback(
    (current: Exercise, given: ExerciseResponse, verb: Verb | undefined): GradeResult => {
      const policy = policyFor(verb);

      switch (current.type) {
        case 'multipleChoice':
          return gradeSelection(given.kind === 'choice' ? given.value : null, current.answer);

        case 'typedConjugation':
        case 'sentenceCompletion':
        case 'errorCorrection':
        case 'tenseTransformation':
          return gradeAnswer(given.kind === 'text' ? given.value : '', current.accepted, policy);

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
    },
    [policyFor],
  );

  const submit = useCallback(() => {
    if (!exercise || phase !== 'active') return;

    const verb = verbsById.get(exercise.verbId);
    const graded = grade(exercise, response, verb);
    const responseMs = Date.now() - questionStartedAt.current;

    const nextCombo = graded.correct ? combo + 1 : 0;
    const multiplier = comboMultiplier(nextCombo);
    const xp = graded.correct ? Math.round(exercise.baseXp * multiplier) : 0;

    // Detect a card climbing back out of the lapsed state, for the badge.
    const before = useProgress.getState().cards[exercise.cardIds[0]];
    const wasLapsed = before?.state === 'lapsed';

    recordAnswer({
      cardIds: exercise.cardIds,
      verbId: exercise.verbId,
      category: exercise.category,
      slot: exercise.cardIds[0]?.split('|')[2] ?? '_',
      exerciseType: exercise.type,
      result: graded,
      response: describeResponse(response),
      responseMs,
      hintUsed,
      xpAwarded: xp,
    });

    if (graded.correct) {
      gamification.awardXp(xp);
      gamification.registerCombo(nextCombo);
      if (EXERCISE_TYPE_META[exercise.type].mode === 'production') {
        gamification.registerProductionCorrect();
      }
      if (wasLapsed) {
        const after = useProgress.getState().cards[exercise.cardIds[0]];
        if (after && after.state !== 'lapsed') gamification.registerComeback();
      }
    }

    if (verb) gamification.registerTouched(verb.level, exercise.category);
    gamification.registerPractice();

    setCombo(nextCombo);
    setLastXp(xp);
    setResult(graded);
    setPhase('feedback');
    setSummary((current) => ({
      answered: current.answered + 1,
      correct: current.correct + (graded.correct ? 1 : 0),
      xp: current.xp + xp,
      bestCombo: Math.max(current.bestCombo, nextCombo),
      perfect: current.perfect && graded.correct,
      durationMs: Date.now() - sessionStartedAt.current,
    }));
  }, [exercise, phase, response, combo, hintUsed, grade, verbsById, recordAnswer, gamification]);

  const advance = useCallback(() => {
    if (!plan) return;
    const nextIndex = index + 1;

    if (nextIndex >= plan.exercises.length) {
      completeSession();

      const finalSummary: SessionSummary = {
        ...summary,
        durationMs: Date.now() - sessionStartedAt.current,
      };
      gamification.registerSessionResult(finalSummary.perfect && finalSummary.answered > 0);

      // Daily goal is evaluated against the day's cumulative XP, not this
      // session's, so several short sessions add up.
      const today = dayKey();
      const todayXp = useProgress.getState().daily[today]?.xp ?? 0;
      if (todayXp >= useSettings.getState().dailyGoalXp) {
        gamification.registerGoalMet(today);
      }

      syncAchievements();
      setSummary(finalSummary);
      setPhase('complete');
      return;
    }

    setIndex(nextIndex);
    setResponse(EMPTY_RESPONSE);
    setResult(null);
    setHintUsed(false);
    questionStartedAt.current = Date.now();
    setPhase('active');
  }, [plan, index, summary, completeSession, gamification]);

  const reset = useCallback(() => {
    setPlan(null);
    setPhase('idle');
    setIndex(0);
    setResult(null);
    setResponse(EMPTY_RESPONSE);
  }, []);

  const revealHint = useCallback(() => setHintUsed(true), []);

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
