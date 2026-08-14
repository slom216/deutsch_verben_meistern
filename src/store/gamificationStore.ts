import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  evaluateAchievements,
  rankForXp,
  type AchievementContext,
} from '@/lib/achievements';
import { dayKey, daysBetween } from '@/lib/dates';

/**
 * Motivation state: experience, ranks, streaks and badges.
 *
 * Kept apart from learning progress on purpose — resetting your XP should
 * never be able to damage the spaced-repetition schedule, and vice versa.
 */

export interface GamificationState {
  xp: number;
  /** Highest rank level reached, so a level-up is only celebrated once. */
  highestLevel: number;
  dailyStreak: number;
  longestStreak: number;
  /** Day key of the most recent day with any practice. */
  lastPracticeDay: string | null;
  /** Day keys on which the daily XP goal was met. */
  goalDays: string[];
  unlocked: Record<string, number>;
  bestCombo: number;
  perfectSessions: number;
  productionCorrect: number;
  comebacks: number;
  levelsTouched: string[];
  categoriesTouched: string[];

  /** Queue of things to celebrate, drained by the UI. */
  pendingUnlocks: string[];
  pendingLevelUp: number | null;

  awardXp: (amount: number) => void;
  registerPractice: (at?: number) => void;
  registerCombo: (combo: number) => void;
  registerProductionCorrect: () => void;
  registerComeback: () => void;
  registerTouched: (level: string, category: string) => void;
  registerSessionResult: (perfect: boolean) => void;
  registerGoalMet: (day: string) => void;
  syncAchievements: (context: Omit<AchievementContext, keyof DerivedContext> & Partial<DerivedContext>) => void;
  consumeUnlocks: () => string[];
  consumeLevelUp: () => number | null;
  resetGamification: () => void;
}

/** Fields the store already knows and callers need not supply. */
type DerivedContext = Pick<
  AchievementContext,
  | 'xp'
  | 'dailyStreak'
  | 'longestStreak'
  | 'sessionsCompleted'
  | 'perfectSessions'
  | 'bestCombo'
  | 'dailyGoalsMet'
  | 'categoriesTouched'
  | 'levelsTouched'
  | 'productionCorrect'
  | 'comebacks'
>;

const EMPTY = {
  xp: 0,
  highestLevel: 1,
  dailyStreak: 0,
  longestStreak: 0,
  lastPracticeDay: null as string | null,
  goalDays: [] as string[],
  unlocked: {} as Record<string, number>,
  bestCombo: 0,
  perfectSessions: 0,
  productionCorrect: 0,
  comebacks: 0,
  levelsTouched: [] as string[],
  categoriesTouched: [] as string[],
  pendingUnlocks: [] as string[],
  pendingLevelUp: null as number | null,
};

export const useGamification = create<GamificationState>()(
  persist(
    (set, get) => ({
      ...EMPTY,

      awardXp: (amount) =>
        set((state) => {
          const xp = state.xp + Math.max(0, Math.round(amount));
          const level = rankForXp(xp).level;
          const levelledUp = level > state.highestLevel;
          return {
            xp,
            highestLevel: Math.max(level, state.highestLevel),
            pendingLevelUp: levelledUp ? level : state.pendingLevelUp,
          };
        }),

      registerPractice: (at = Date.now()) =>
        set((state) => {
          const today = dayKey(at);
          if (state.lastPracticeDay === today) return state;

          // A gap of exactly one day continues the streak; anything longer
          // restarts it. The first ever session starts a streak of one.
          const gap = state.lastPracticeDay ? daysBetween(state.lastPracticeDay, today) : null;
          const dailyStreak = gap === 1 ? state.dailyStreak + 1 : 1;

          return {
            lastPracticeDay: today,
            dailyStreak,
            longestStreak: Math.max(state.longestStreak, dailyStreak),
          };
        }),

      registerCombo: (combo) =>
        set((state) => (combo > state.bestCombo ? { bestCombo: combo } : state)),

      registerProductionCorrect: () =>
        set((state) => ({ productionCorrect: state.productionCorrect + 1 })),

      registerComeback: () => set((state) => ({ comebacks: state.comebacks + 1 })),

      registerTouched: (level, category) =>
        set((state) => {
          const levelsTouched = state.levelsTouched.includes(level)
            ? state.levelsTouched
            : [...state.levelsTouched, level];
          const categoriesTouched = state.categoriesTouched.includes(category)
            ? state.categoriesTouched
            : [...state.categoriesTouched, category];
          if (
            levelsTouched === state.levelsTouched &&
            categoriesTouched === state.categoriesTouched
          ) {
            return state;
          }
          return { levelsTouched, categoriesTouched };
        }),

      registerSessionResult: (perfect) =>
        set((state) => (perfect ? { perfectSessions: state.perfectSessions + 1 } : state)),

      registerGoalMet: (day) =>
        set((state) =>
          state.goalDays.includes(day) ? state : { goalDays: [...state.goalDays, day] },
        ),

      syncAchievements: (partial) => {
        const state = get();
        const context: AchievementContext = {
          totalAnswered: partial.totalAnswered,
          totalCorrect: partial.totalCorrect,
          masteredCards: partial.masteredCards,
          masteredVerbs: partial.masteredVerbs,
          sessionsCompleted: partial.sessionsCompleted ?? 0,
          xp: state.xp,
          dailyStreak: state.dailyStreak,
          longestStreak: state.longestStreak,
          perfectSessions: state.perfectSessions,
          bestCombo: state.bestCombo,
          dailyGoalsMet: state.goalDays.length,
          categoriesTouched: state.categoriesTouched.length,
          levelsTouched: state.levelsTouched.length,
          productionCorrect: state.productionCorrect,
          comebacks: state.comebacks,
        };

        const earned = evaluateAchievements(context);
        const fresh = earned.filter((id) => !(id in state.unlocked));
        if (fresh.length === 0) return;

        const now = Date.now();
        set({
          unlocked: {
            ...state.unlocked,
            ...Object.fromEntries(fresh.map((id) => [id, now])),
          },
          pendingUnlocks: [...state.pendingUnlocks, ...fresh],
        });
      },

      consumeUnlocks: () => {
        const { pendingUnlocks } = get();
        if (pendingUnlocks.length > 0) set({ pendingUnlocks: [] });
        return pendingUnlocks;
      },

      consumeLevelUp: () => {
        const { pendingLevelUp } = get();
        if (pendingLevelUp !== null) set({ pendingLevelUp: null });
        return pendingLevelUp;
      },

      resetGamification: () => set(() => ({ ...EMPTY })),
    }),
    { name: 'dvm.gamification.v1', version: 1 },
  ),
);

/**
 * Streaks are only accurate once staleness is accounted for: a streak that was
 * not continued yesterday is already broken, whatever the stored number says.
 */
export function effectiveStreak(state: GamificationState, at: number = Date.now()): number {
  if (!state.lastPracticeDay) return 0;
  const gap = daysBetween(state.lastPracticeDay, dayKey(at));
  if (gap === 0 || gap === 1) return state.dailyStreak;
  return 0;
}

/** Combo multiplier applied to XP during a session. */
export function comboMultiplier(combo: number): number {
  if (combo >= 20) return 2;
  if (combo >= 12) return 1.75;
  if (combo >= 7) return 1.5;
  if (combo >= 3) return 1.25;
  return 1;
}
