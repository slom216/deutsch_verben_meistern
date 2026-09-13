import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FormCategory } from '@/types/formCategory';
import type { DiagnosticCode, GradeResult, Verdict } from '@/lib/grader';
import { isProduction, type ExerciseType } from '@/exercises/types';
import {
  createCard,
  qualityFrom,
  reviewCard,
  type CardId,
  type CardRecord,
  type CardState,
} from '@/lib/srs';
import { dayKey } from '@/lib/dates';
import { flagStorage, isRecord, recordEntries, safeStorage, sanitize, syncAcrossTabs } from './storage';

/**
 * Learning progress.
 *
 * Holds the spaced-repetition card table plus the aggregates the progress page
 * reports on: accuracy over time, which form categories are weak, and which
 * specific mistakes keep coming back. Everything lives in localStorage; there
 * is no server.
 */

export interface CategoryStat {
  seen: number;
  correct: number;
}

export interface MistakeEntry {
  cardId: CardId;
  verbId: string;
  category: FormCategory;
  slot: string;
  count: number;
  lastAt: number;
  lastResponse: string;
  expected: string;
  /** How many times each kind of error was made on this card. */
  diagnostics: Partial<Record<DiagnosticCode, number>>;
}

export interface DailyStat {
  day: string;
  answered: number;
  correct: number;
  xp: number;
}

export interface AnswerInput {
  cardIds: CardId[];
  verbId: string;
  category: FormCategory;
  slot: string;
  exerciseType: ExerciseType;
  result: GradeResult;
  response: string;
  responseMs: number;
  hintUsed: boolean;
  xpAwarded: number;
  /**
   * Per-card verdicts when one exercise grades several cards separately
   * (matching). Cards not listed use `result.verdict`.
   */
  cardResults?: Record<CardId, Verdict>;
}

export interface ProgressState {
  cards: Record<CardId, CardRecord>;
  categoryStats: Partial<Record<FormCategory, CategoryStat>>;
  diagnosticCounts: Partial<Record<DiagnosticCode, number>>;
  mistakes: Record<CardId, MistakeEntry>;
  daily: Record<string, DailyStat>;
  totalAnswered: number;
  totalCorrect: number;
  sessionsCompleted: number;

  recordAnswer: (input: AnswerInput) => void;
  completeSession: () => void;
  clearMistake: (cardId: CardId) => void;
  resetProgress: () => void;
}

type ProgressData = Pick<
  ProgressState,
  | 'cards'
  | 'categoryStats'
  | 'diagnosticCounts'
  | 'mistakes'
  | 'daily'
  | 'totalAnswered'
  | 'totalCorrect'
  | 'sessionsCompleted'
>;

const EMPTY: ProgressData = {
  cards: {},
  categoryStats: {},
  diagnosticCounts: {},
  mistakes: {},
  daily: {},
  totalAnswered: 0,
  totalCorrect: 0,
  sessionsCompleted: 0,
};

/** An answer under 6 seconds counts as fluent recall, not laboured working-out. */
const FAST_ANSWER_MS = 6000;
/** Cap the mistake log so long-term storage cannot grow without bound. */
const MAX_MISTAKES = 300;

/*
 * Compact storage. The card table is the bulk of all saved data, so it is
 * stored as positional tuples with timestamps in whole seconds rather than as
 * keyed objects in milliseconds. In memory it stays a CardRecord map.
 */

const CARD_STATES: CardState[] = ['new', 'learning', 'review', 'lapsed', 'mastered'];
const SECOND = 1000;

/** [id, state, repetitions, interval s, ease, due s, lastReviewed s or 0, step, seen, correct, lapses, bestStreak, streak] */
type CardTuple = [CardId, ...number[]];

type SavedProgress = Omit<ProgressData, 'cards'> & { cards: CardTuple[] };

export function encodeCards(cards: Record<CardId, CardRecord>): CardTuple[] {
  return Object.values(cards).map((card) => [
    card.id,
    CARD_STATES.indexOf(card.state),
    card.repetitions,
    Math.round(card.interval / SECOND),
    card.ease,
    Math.round(card.due / SECOND),
    card.lastReviewed === null ? 0 : Math.round(card.lastReviewed / SECOND),
    card.step,
    card.seen,
    card.correct,
    card.lapses,
    card.bestStreak,
    card.streak,
  ]);
}

function decodeCards(tuples: unknown[]): Record<CardId, CardRecord> {
  const cards: Record<CardId, CardRecord> = {};
  for (const tuple of tuples) {
    const valid =
      Array.isArray(tuple) &&
      tuple.length === 13 &&
      typeof tuple[0] === 'string' &&
      tuple.slice(1).every((n) => typeof n === 'number' && Number.isFinite(n)) &&
      CARD_STATES[tuple[1]] !== undefined;
    if (!valid) {
      flagStorage('unreadable');
      continue;
    }
    const [id, state, repetitions, interval, ease, due, lastReviewed, step, seen, correct, lapses, bestStreak, streak] =
      tuple as [CardId, ...number[]];
    cards[id] = {
      id,
      state: CARD_STATES[state],
      repetitions,
      interval: interval * SECOND,
      ease,
      due: due * SECOND,
      lastReviewed: lastReviewed ? lastReviewed * SECOND : null,
      step,
      seen,
      correct,
      lapses,
      bestStreak,
      streak,
    };
  }
  return cards;
}

export const useProgress = create<ProgressState>()(
  persist<ProgressState, [], [], SavedProgress>(
    (set) => ({
      ...EMPTY,

      recordAnswer: (input) =>
        set((state) => {
          const now = Date.now();
          const { result } = input;
          const qualityOptions = {
            hintUsed: input.hintUsed,
            fast: input.responseMs <= FAST_ANSWER_MS,
            recognition: !isProduction(input.exerciseType),
          };

          // Advance every card the exercise touched. Matching exercises cover
          // a whole paradigm, so they legitimately review several at once,
          // each by its own pair's outcome.
          const cards = { ...state.cards };
          for (const cardId of input.cardIds) {
            const existing = cards[cardId] ?? createCard(cardId, now);
            const verdict = input.cardResults?.[cardId] ?? result.verdict;
            cards[cardId] = reviewCard(existing, qualityFrom(verdict, qualityOptions), now);
          }

          const categoryStats = { ...state.categoryStats };
          const previous = categoryStats[input.category] ?? { seen: 0, correct: 0 };
          categoryStats[input.category] = {
            seen: previous.seen + 1,
            correct: previous.correct + (result.correct ? 1 : 0),
          };

          const diagnosticCounts = { ...state.diagnosticCounts };
          if (!result.correct) {
            for (const diagnostic of result.diagnostics) {
              diagnosticCounts[diagnostic.code] = (diagnosticCounts[diagnostic.code] ?? 0) + 1;
            }
          }

          const mistakes = { ...state.mistakes };
          const primaryCardId = input.cardIds[0];
          if (!result.correct) {
            const entry = mistakes[primaryCardId];
            const diagnostics = { ...(entry?.diagnostics ?? {}) };
            for (const diagnostic of result.diagnostics) {
              diagnostics[diagnostic.code] = (diagnostics[diagnostic.code] ?? 0) + 1;
            }
            mistakes[primaryCardId] = {
              cardId: primaryCardId,
              verbId: input.verbId,
              category: input.category,
              slot: input.slot,
              count: (entry?.count ?? 0) + 1,
              lastAt: now,
              lastResponse: input.response,
              expected: result.target,
              diagnostics,
            };

            const ids = Object.keys(mistakes);
            if (ids.length > MAX_MISTAKES) {
              // Drop the least recently missed entries first.
              const oldest = ids
                .sort((a, b) => mistakes[a].lastAt - mistakes[b].lastAt)
                .slice(0, ids.length - MAX_MISTAKES);
              oldest.forEach((id) => delete mistakes[id]);
            }
          } else if (mistakes[primaryCardId]) {
            // Two clean answers in a row retire a card from the mistake list.
            const card = cards[primaryCardId];
            if (card && card.streak >= 2) delete mistakes[primaryCardId];
          }

          const today = dayKey(now);
          const dailyEntry = state.daily[today] ?? { day: today, answered: 0, correct: 0, xp: 0 };
          const daily = {
            ...state.daily,
            [today]: {
              day: today,
              answered: dailyEntry.answered + 1,
              correct: dailyEntry.correct + (result.correct ? 1 : 0),
              xp: dailyEntry.xp + input.xpAwarded,
            },
          };

          return {
            cards,
            categoryStats,
            diagnosticCounts,
            mistakes,
            daily,
            totalAnswered: state.totalAnswered + 1,
            totalCorrect: state.totalCorrect + (result.correct ? 1 : 0),
          };
        }),

      completeSession: () => set((state) => ({ sessionsCompleted: state.sessionsCompleted + 1 })),

      clearMistake: (cardId) =>
        set((state) => {
          const mistakes = { ...state.mistakes };
          delete mistakes[cardId];
          return { mistakes };
        }),

      resetProgress: () => set(() => ({ ...EMPTY })),
    }),
    {
      // The key keeps its original name; the version number tracks the format.
      name: 'dvm.progress.v1',
      version: 2,
      storage: safeStorage(),
      partialize: ({ cards, categoryStats, diagnosticCounts, mistakes, daily, totalAnswered, totalCorrect, sessionsCompleted }) => ({
        cards: encodeCards(cards),
        categoryStats,
        diagnosticCounts,
        mistakes,
        daily,
        totalAnswered,
        totalCorrect,
        sessionsCompleted,
      }),
      migrate: (persisted, version) => {
        // v1 stored cards as an id-keyed map of full records.
        if (version < 2 && isRecord(persisted) && isRecord(persisted.cards)) {
          const v1Cards = recordEntries<CardRecord>(persisted.cards);
          return { ...persisted, cards: encodeCards(v1Cards) } as SavedProgress;
        }
        return persisted as SavedProgress;
      },
      merge: (persisted, current) => {
        const saved = sanitize(persisted, { ...EMPTY, cards: [] as unknown[] });
        return {
          ...current,
          ...saved,
          cards: decodeCards(saved.cards),
          categoryStats: recordEntries<CategoryStat>(saved.categoryStats),
          mistakes: recordEntries<MistakeEntry>(saved.mistakes),
          daily: recordEntries<DailyStat>(saved.daily),
        };
      },
    },
  ),
);

syncAcrossTabs(useProgress);

/* ------------------------------------------------------------------ */
/* Selectors                                                            */
/* ------------------------------------------------------------------ */

export interface MasteryBreakdown {
  new: number;
  learning: number;
  review: number;
  lapsed: number;
  mastered: number;
  total: number;
}

export function masteryBreakdown(cards: Record<CardId, CardRecord>): MasteryBreakdown {
  const counts: MasteryBreakdown = {
    new: 0,
    learning: 0,
    review: 0,
    lapsed: 0,
    mastered: 0,
    total: 0,
  };
  for (const card of Object.values(cards)) {
    counts[card.state] += 1;
    counts.total += 1;
  }
  return counts;
}

/** Verbs where every practised card has reached the mastered state. */
export function masteredVerbIds(cards: Record<CardId, CardRecord>): Set<string> {
  const byVerb = new Map<string, { total: number; mastered: number }>();
  for (const card of Object.values(cards)) {
    const verbId = card.id.split('|')[0];
    const entry = byVerb.get(verbId) ?? { total: 0, mastered: 0 };
    entry.total += 1;
    if (card.state === 'mastered') entry.mastered += 1;
    byVerb.set(verbId, entry);
  }
  const result = new Set<string>();
  for (const [verbId, entry] of byVerb) {
    // Require real evidence, not a single lucky card.
    if (entry.total >= 3 && entry.mastered === entry.total) result.add(verbId);
  }
  return result;
}

/** Categories ordered worst-accuracy first, for the "weak spots" panel. */
export function weakestCategories(
  categoryStats: Partial<Record<FormCategory, CategoryStat>>,
  minimumSeen = 5,
): Array<{ category: FormCategory; accuracy: number; seen: number }> {
  return Object.entries(categoryStats)
    .filter(([, stat]) => stat && stat.seen >= minimumSeen)
    .map(([category, stat]) => ({
      category: category as FormCategory,
      accuracy: stat!.correct / stat!.seen,
      seen: stat!.seen,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);
}

export function overallAccuracy(state: ProgressState): number {
  return state.totalAnswered === 0 ? 0 : state.totalCorrect / state.totalAnswered;
}
