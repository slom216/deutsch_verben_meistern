import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FORM_CATEGORIES, type FormCategory } from '@/types/formCategory';
import { EXERCISE_TYPES, type ExerciseType } from '@/exercises/types';
import type { CefrLevel } from '@/types/verb';
import type { StrictnessPolicy } from '@/lib/grader';

/**
 * Learner settings.
 *
 * The central promise of the settings page is that a practice session contains
 * only what the learner has asked for: enabled form categories, enabled
 * exercise formats, and a verb pool narrowed by the grammatical properties
 * they care about.
 */

export type Regularity = 'regular' | 'irregular' | 'mixed';

export interface VerbFilters {
  /** Empty means "no restriction". */
  regularity: Regularity[];
  separability: 'all' | 'separable' | 'inseparable';
  auxiliary: 'all' | 'haben' | 'sein';
  reflexive: 'all' | 'reflexive' | 'non-reflexive';
  topics: string[];
  verbClasses: string[];
}

export interface SessionSettings {
  length: number;
  newCardLimit: number;
}

export interface SettingsState {
  levels: CefrLevel[];
  categories: Record<FormCategory, boolean>;
  exerciseTypes: Record<ExerciseType, boolean>;
  filters: VerbFilters;
  strictness: StrictnessPolicy;
  session: SessionSettings;
  dailyGoalXp: number;
  showTranslations: boolean;
  autoAdvance: boolean;
  soundEnabled: boolean;

  toggleLevel: (level: CefrLevel) => void;
  toggleCategory: (category: FormCategory) => void;
  setCategories: (value: boolean) => void;
  setCategoryGroup: (categories: FormCategory[], value: boolean) => void;
  toggleExerciseType: (type: ExerciseType) => void;
  setFilters: (patch: Partial<VerbFilters>) => void;
  setStrictness: (patch: Partial<StrictnessPolicy>) => void;
  setSession: (patch: Partial<SessionSettings>) => void;
  setDailyGoalXp: (xp: number) => void;
  setShowTranslations: (value: boolean) => void;
  setAutoAdvance: (value: boolean) => void;
  setSoundEnabled: (value: boolean) => void;
  resetToDefaults: () => void;
}

/** A1 beginners start with the tenses they will actually meet first. */
const DEFAULT_CATEGORIES: Record<FormCategory, boolean> = Object.fromEntries(
  FORM_CATEGORIES.map((category) => [
    category,
    ['present', 'presentPerfect', 'simplePast', 'pastParticiple', 'auxiliary'].includes(category),
  ]),
) as Record<FormCategory, boolean>;

const DEFAULT_EXERCISE_TYPES: Record<ExerciseType, boolean> = Object.fromEntries(
  EXERCISE_TYPES.map((type) => [type, true]),
) as Record<ExerciseType, boolean>;

const DEFAULT_FILTERS: VerbFilters = {
  regularity: [],
  separability: 'all',
  auxiliary: 'all',
  reflexive: 'all',
  topics: [],
  verbClasses: [],
};

const DEFAULTS = {
  levels: ['A1'] as CefrLevel[],
  categories: DEFAULT_CATEGORIES,
  exerciseTypes: DEFAULT_EXERCISE_TYPES,
  filters: DEFAULT_FILTERS,
  strictness: {
    capitalization: true,
    umlauts: true,
    eszett: true,
    wordOrder: true,
    allowTypos: false,
  } satisfies StrictnessPolicy,
  session: { length: 20, newCardLimit: 8 },
  dailyGoalXp: 150,
  showTranslations: true,
  autoAdvance: false,
  soundEnabled: true,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      toggleLevel: (level) =>
        set((state) => {
          const enabled = state.levels.includes(level);
          const next = enabled
            ? state.levels.filter((l) => l !== level)
            : [...state.levels, level];
          // At least one level must stay on, or there is nothing to practise.
          return { levels: next.length === 0 ? state.levels : next };
        }),

      toggleCategory: (category) =>
        set((state) => {
          const next = { ...state.categories, [category]: !state.categories[category] };
          if (!Object.values(next).some(Boolean)) return state;
          return { categories: next };
        }),

      setCategories: (value) =>
        set(() => ({
          categories: Object.fromEntries(
            FORM_CATEGORIES.map((c) => [c, value]),
          ) as Record<FormCategory, boolean>,
        })),

      setCategoryGroup: (categories, value) =>
        set((state) => {
          const next = { ...state.categories };
          categories.forEach((c) => {
            next[c] = value;
          });
          if (!Object.values(next).some(Boolean)) return state;
          return { categories: next };
        }),

      toggleExerciseType: (type) =>
        set((state) => {
          const next = { ...state.exerciseTypes, [type]: !state.exerciseTypes[type] };
          if (!Object.values(next).some(Boolean)) return state;
          return { exerciseTypes: next };
        }),

      setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),
      setStrictness: (patch) => set((state) => ({ strictness: { ...state.strictness, ...patch } })),
      setSession: (patch) => set((state) => ({ session: { ...state.session, ...patch } })),
      setDailyGoalXp: (xp) => set(() => ({ dailyGoalXp: Math.max(20, Math.round(xp)) })),
      setShowTranslations: (value) => set(() => ({ showTranslations: value })),
      setAutoAdvance: (value) => set(() => ({ autoAdvance: value })),
      setSoundEnabled: (value) => set(() => ({ soundEnabled: value })),
      resetToDefaults: () => set(() => ({ ...DEFAULTS })),
    }),
    {
      name: 'dvm.settings.v1',
      version: 1,
      // Merge rather than replace, so categories added in a later release
      // appear with their default value instead of as `undefined`.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...saved,
          categories: { ...DEFAULT_CATEGORIES, ...(saved.categories ?? {}) },
          exerciseTypes: { ...DEFAULT_EXERCISE_TYPES, ...(saved.exerciseTypes ?? {}) },
          filters: { ...DEFAULT_FILTERS, ...(saved.filters ?? {}) },
          strictness: { ...DEFAULTS.strictness, ...(saved.strictness ?? {}) },
          session: { ...DEFAULTS.session, ...(saved.session ?? {}) },
        };
      },
    },
  ),
);

/** Enabled categories as a plain list, in canonical teaching order. */
export function enabledCategories(state: SettingsState): FormCategory[] {
  return FORM_CATEGORIES.filter((category) => state.categories[category]);
}

export function enabledExerciseTypes(state: SettingsState): ExerciseType[] {
  return EXERCISE_TYPES.filter((type) => state.exerciseTypes[type]);
}
