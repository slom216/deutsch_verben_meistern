import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FormCategory } from '@/types/formCategory';
import type { DiagnosticCode, GradeResult } from '@/lib/grader';
import type { ExerciseType } from '@/exercises/types';
import {
  createCard,
  qualityFrom,
  reviewCard,
  type CardId,
  type CardRecord,
} from '@/lib/srs';
import { dayKey } from '@/lib/dates';

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

const EMPTY: Pick<
  ProgressState,
  | 'cards'
  | 'categoryStats'
  | 'diagnosticCounts'
  | 'mistakes'
  | 'daily'
  | 'totalAnswered'
  | 'totalCorrect'
  | 'sessionsCompleted'
> = {
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

export const useProgress = create<ProgressState>()(
  persist(
    (set) => ({
      ...EMPTY,

      recordAnswer: (input) =>
        set((state) => {
          const now = Date.now();
          const { result } = input;
          const quality = qualityFrom(result.verdict, {
            hintUsed: input.hintUsed,
            fast: input.responseMs <= FAST_ANSWER_MS,
          });

          // Advance every card the exercise touched. Matching exercises cover
          // a whole paradigm, so they legitimately review several at once.
          const cards = { ...state.cards };
          for (const cardId of input.cardIds) {
            const existing = cards[cardId] ?? createCard(cardId, now);
            cards[cardId] = reviewCard(existing, quality, now);
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
    { name: 'dvm.progress.v1', version: 1 },
  ),
);

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
