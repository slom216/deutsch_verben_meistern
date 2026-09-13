import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_BY_ID,
  evaluateAchievements,
  isUnlocked,
  nextRank,
  RANKS,
  rankForXp,
  rankProgress,
  type AchievementContext,
} from './achievements';

/** Every counter set to the same value, so each achievement reads `n` whatever its key. */
function contextAt(n: number): AchievementContext {
  return {
    xp: n,
    dailyStreak: n,
    longestStreak: n,
    totalAnswered: n,
    totalCorrect: n,
    sessionsCompleted: n,
    perfectSessions: n,
    bestCombo: n,
    masteredCards: n,
    masteredVerbs: n,
    dailyGoalsMet: n,
    categoriesTouched: n,
    levelsTouched: n,
    productionCorrect: n,
    comebacks: n,
  };
}

describe('achievements', () => {
  it('have unique ids, all indexed', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(ACHIEVEMENTS_BY_ID)).toHaveLength(ids.length);
  });

  it.each(ACHIEVEMENTS.map((a) => [a.id, a] as const))(
    '%s unlocks exactly at its threshold',
    (_id, achievement) => {
      const { target } = achievement.progress(contextAt(0));
      expect(target).toBeGreaterThan(0);
      expect(isUnlocked(achievement, contextAt(target))).toBe(true);
      expect(isUnlocked(achievement, contextAt(target - 1))).toBe(false);
    },
  );

  it('rank-meister targets the Meister rank threshold', () => {
    const meister = RANKS.find((r) => r.name === 'Meister');
    expect(ACHIEVEMENTS_BY_ID['rank-meister'].progress(contextAt(0)).target).toBe(meister?.minXp);
  });

  it('evaluates nothing for a fresh learner and everything for a maxed one', () => {
    expect(evaluateAchievements(contextAt(0))).toEqual([]);
    expect(evaluateAchievements(contextAt(1_000_000))).toHaveLength(ACHIEVEMENTS.length);
  });
});

describe('ranks', () => {
  it('are ordered by level and strictly increasing thresholds, starting at 0', () => {
    expect(RANKS[0].minXp).toBe(0);
    RANKS.forEach((rank, i) => {
      expect(rank.level).toBe(i + 1);
      if (i > 0) expect(rank.minXp).toBeGreaterThan(RANKS[i - 1].minXp);
    });
  });

  it('rankForXp switches exactly at each threshold', () => {
    expect(rankForXp(299).level).toBe(1);
    expect(rankForXp(300).level).toBe(2);
    for (const rank of RANKS.slice(1)) {
      expect(rankForXp(rank.minXp - 1).level).toBe(rank.level - 1);
      expect(rankForXp(rank.minXp).level).toBe(rank.level);
    }
  });

  it('rankProgress is 0 at a threshold, between 0 and 1 inside a rank', () => {
    for (const rank of RANKS.slice(0, -1)) expect(rankProgress(rank.minXp)).toBe(0);
    expect(rankProgress(150)).toBeCloseTo(0.5);
    expect(rankProgress(299)).toBeLessThan(1);
  });

  it('at the top rank, nextRank is null and progress is 1', () => {
    const top = RANKS.at(-1)!;
    expect(nextRank(top.minXp - 1)).toEqual(top);
    expect(nextRank(top.minXp)).toBeNull();
    expect(rankProgress(top.minXp)).toBe(1);
    expect(rankProgress(top.minXp * 10)).toBe(1);
    expect(nextRank(299)?.minXp).toBe(300);
  });
});
