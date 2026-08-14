/**
 * Ranks and achievements.
 *
 * The motivation design deliberately rewards *consistency and depth* rather
 * than raw volume: streaks, mastered forms and clean sessions are worth more
 * recognition than simply answering a lot of questions, because that is the
 * behaviour that actually makes verb forms stick.
 */

export interface Rank {
  level: number;
  name: string;
  english: string;
  minXp: number;
}

/** Rank ladder. Thresholds grow roughly geometrically. */
export const RANKS: Rank[] = [
  { level: 1, name: 'Anfänger', english: 'Beginner', minXp: 0 },
  { level: 2, name: 'Lehrling', english: 'Apprentice', minXp: 300 },
  { level: 3, name: 'Schüler', english: 'Student', minXp: 800 },
  { level: 4, name: 'Kenner', english: 'Knower', minXp: 1600 },
  { level: 5, name: 'Könner', english: 'Skilled one', minXp: 3000 },
  { level: 6, name: 'Fortgeschrittener', english: 'Advanced', minXp: 5000 },
  { level: 7, name: 'Routinier', english: 'Old hand', minXp: 8000 },
  { level: 8, name: 'Experte', english: 'Expert', minXp: 12000 },
  { level: 9, name: 'Spezialist', english: 'Specialist', minXp: 17000 },
  { level: 10, name: 'Meister', english: 'Master', minXp: 24000 },
  { level: 11, name: 'Großmeister', english: 'Grandmaster', minXp: 34000 },
  { level: 12, name: 'Verbmeister', english: 'Verb Master', minXp: 50000 },
];

export function rankForXp(xp: number): Rank {
  let current = RANKS[0];
  for (const rank of RANKS) {
    if (xp >= rank.minXp) current = rank;
    else break;
  }
  return current;
}

export function nextRank(xp: number): Rank | null {
  return RANKS.find((rank) => rank.minXp > xp) ?? null;
}

/** Progress through the current rank, 0–1. */
export function rankProgress(xp: number): number {
  const current = rankForXp(xp);
  const next = nextRank(xp);
  if (!next) return 1;
  return (xp - current.minXp) / (next.minXp - current.minXp);
}

/* ------------------------------------------------------------------ */
/* Achievements                                                         */
/* ------------------------------------------------------------------ */

export type AchievementTier = 'bronze' | 'silver' | 'gold';

export interface AchievementContext {
  xp: number;
  dailyStreak: number;
  longestStreak: number;
  totalAnswered: number;
  totalCorrect: number;
  sessionsCompleted: number;
  perfectSessions: number;
  bestCombo: number;
  masteredCards: number;
  masteredVerbs: number;
  dailyGoalsMet: number;
  /** Distinct form categories with at least one correct answer. */
  categoriesTouched: number;
  /** Distinct CEFR levels the learner has answered questions in. */
  levelsTouched: number;
  /** Correct answers on typed/production exercises. */
  productionCorrect: number;
  /** Cards recovered from `lapsed` back to `review` or better. */
  comebacks: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: AchievementTier;
  /** Current value and the target, for a progress bar on locked badges. */
  progress: (context: AchievementContext) => { value: number; target: number };
}

const counter =
  (key: keyof AchievementContext, target: number) => (context: AchievementContext) => ({
    value: context[key],
    target,
  });

export const ACHIEVEMENTS: Achievement[] = [
  // Getting started
  {
    id: 'first-steps',
    name: 'Erste Schritte',
    description: 'Answer your first question.',
    icon: '👣',
    tier: 'bronze',
    progress: counter('totalAnswered', 1),
  },
  {
    id: 'first-session',
    name: 'Aufgewärmt',
    description: 'Finish your first practice session.',
    icon: '🔥',
    tier: 'bronze',
    progress: counter('sessionsCompleted', 1),
  },

  // Streaks
  {
    id: 'streak-3',
    name: 'Dreitagebart',
    description: 'Practise three days in a row.',
    icon: '📆',
    tier: 'bronze',
    progress: counter('dailyStreak', 3),
  },
  {
    id: 'streak-7',
    name: 'Wochensieger',
    description: 'Keep a seven-day streak.',
    icon: '🗓️',
    tier: 'silver',
    progress: counter('dailyStreak', 7),
  },
  {
    id: 'streak-30',
    name: 'Eiserne Disziplin',
    description: 'Keep a thirty-day streak.',
    icon: '⛓️',
    tier: 'gold',
    progress: counter('dailyStreak', 30),
  },
  {
    id: 'streak-100',
    name: 'Hundert Tage',
    description: 'Keep a hundred-day streak.',
    icon: '💯',
    tier: 'gold',
    progress: counter('dailyStreak', 100),
  },

  // Volume
  {
    id: 'answers-100',
    name: 'Fleißig',
    description: 'Answer 100 questions.',
    icon: '📝',
    tier: 'bronze',
    progress: counter('totalAnswered', 100),
  },
  {
    id: 'answers-1000',
    name: 'Vielübend',
    description: 'Answer 1,000 questions.',
    icon: '📚',
    tier: 'silver',
    progress: counter('totalAnswered', 1000),
  },
  {
    id: 'answers-5000',
    name: 'Unermüdlich',
    description: 'Answer 5,000 questions.',
    icon: '🏔️',
    tier: 'gold',
    progress: counter('totalAnswered', 5000),
  },

  // Mastery
  {
    id: 'mastered-10',
    name: 'Erste Beute',
    description: 'Master 10 individual verb forms.',
    icon: '🌱',
    tier: 'bronze',
    progress: counter('masteredCards', 10),
  },
  {
    id: 'mastered-100',
    name: 'Formenschatz',
    description: 'Master 100 individual verb forms.',
    icon: '💎',
    tier: 'silver',
    progress: counter('masteredCards', 100),
  },
  {
    id: 'mastered-500',
    name: 'Formensammler',
    description: 'Master 500 individual verb forms.',
    icon: '🏆',
    tier: 'gold',
    progress: counter('masteredCards', 500),
  },
  {
    id: 'verbs-10',
    name: 'Zehn im Griff',
    description: 'Fully master 10 verbs.',
    icon: '🔟',
    tier: 'silver',
    progress: counter('masteredVerbs', 10),
  },
  {
    id: 'verbs-50',
    name: 'Verbenkenner',
    description: 'Fully master 50 verbs.',
    icon: '👑',
    tier: 'gold',
    progress: counter('masteredVerbs', 50),
  },

  // Precision
  {
    id: 'combo-10',
    name: 'Im Fluss',
    description: 'Get 10 correct answers in a row.',
    icon: '🌊',
    tier: 'bronze',
    progress: counter('bestCombo', 10),
  },
  {
    id: 'combo-25',
    name: 'Unaufhaltsam',
    description: 'Get 25 correct answers in a row.',
    icon: '⚡',
    tier: 'silver',
    progress: counter('bestCombo', 25),
  },
  {
    id: 'combo-50',
    name: 'Makellos',
    description: 'Get 50 correct answers in a row.',
    icon: '✨',
    tier: 'gold',
    progress: counter('bestCombo', 50),
  },
  {
    id: 'perfect-session',
    name: 'Fehlerfrei',
    description: 'Finish a session without a single mistake.',
    icon: '🎯',
    tier: 'silver',
    progress: counter('perfectSessions', 1),
  },
  {
    id: 'perfect-10',
    name: 'Zehnmal fehlerfrei',
    description: 'Finish ten perfect sessions.',
    icon: '🥇',
    tier: 'gold',
    progress: counter('perfectSessions', 10),
  },

  // Breadth and depth
  {
    id: 'categories-8',
    name: 'Allrounder',
    description: 'Practise eight different form categories.',
    icon: '🧭',
    tier: 'silver',
    progress: counter('categoriesTouched', 8),
  },
  {
    id: 'levels-3',
    name: 'A1 bis B1',
    description: 'Answer questions from all three CEFR levels.',
    icon: '🪜',
    tier: 'silver',
    progress: counter('levelsTouched', 3),
  },
  {
    id: 'production-250',
    name: 'Selbst getippt',
    description: 'Get 250 typed answers right — no multiple choice.',
    icon: '⌨️',
    tier: 'silver',
    progress: counter('productionCorrect', 250),
  },
  {
    id: 'comeback-25',
    name: 'Wiedergutmachung',
    description: 'Bring 25 forgotten forms back to a healthy schedule.',
    icon: '🔄',
    tier: 'silver',
    progress: counter('comebacks', 25),
  },
  {
    id: 'goals-7',
    name: 'Zielstrebig',
    description: 'Hit your daily goal on seven days.',
    icon: '🎖️',
    tier: 'bronze',
    progress: counter('dailyGoalsMet', 7),
  },
  {
    id: 'goals-30',
    name: 'Immer am Ball',
    description: 'Hit your daily goal on thirty days.',
    icon: '🏅',
    tier: 'gold',
    progress: counter('dailyGoalsMet', 30),
  },
  {
    id: 'rank-meister',
    name: 'Meistergrad',
    description: 'Reach the rank of Meister.',
    icon: '🎓',
    tier: 'gold',
    progress: (context) => ({ value: context.xp, target: 24000 }),
  },
];

export const ACHIEVEMENTS_BY_ID: Record<string, Achievement> = Object.fromEntries(
  ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]),
);

export function isUnlocked(achievement: Achievement, context: AchievementContext): boolean {
  const { value, target } = achievement.progress(context);
  return value >= target;
}

/** Every achievement whose condition is met, for reconciling after a change. */
export function evaluateAchievements(context: AchievementContext): string[] {
  return ACHIEVEMENTS.filter((achievement) => isUnlocked(achievement, context)).map((a) => a.id);
}

export const TIER_STYLES: Record<AchievementTier, { ring: string; text: string; label: string }> = {
  bronze: { ring: 'ring-amber-700/60', text: 'text-amber-600 dark:text-amber-500', label: 'Bronze' },
  silver: { ring: 'ring-slate-400/60', text: 'text-slate-500 dark:text-slate-300', label: 'Silver' },
  gold: { ring: 'ring-yellow-500/60', text: 'text-yellow-600 dark:text-yellow-400', label: 'Gold' },
};
