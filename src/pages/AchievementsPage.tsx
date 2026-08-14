import { useEffect, useMemo } from 'react';
import {
  ACHIEVEMENTS,
  RANKS,
  TIER_STYLES,
  nextRank,
  rankForXp,
  rankProgress,
  type AchievementContext,
} from '@/lib/achievements';
import { masteredVerbIds, useProgress } from '@/store/progressStore';
import { effectiveStreak, useGamification } from '@/store/gamificationStore';
import { syncAchievements } from '@/hooks/useSession';
import { Badge, Card, cx, ProgressBar, SectionHeading, Stat } from '@/components/ui';

/** Badge gallery and the rank ladder. */
export function AchievementsPage() {
  const progress = useProgress();
  const gamification = useGamification();

  // Reconcile on open, so badges earned through a data change are not missed.
  useEffect(() => {
    syncAchievements();
  }, []);

  const context: AchievementContext = useMemo(() => {
    const masteredCards = Object.values(progress.cards).filter(
      (card) => card.state === 'mastered',
    ).length;

    return {
      xp: gamification.xp,
      dailyStreak: effectiveStreak(gamification),
      longestStreak: gamification.longestStreak,
      totalAnswered: progress.totalAnswered,
      totalCorrect: progress.totalCorrect,
      sessionsCompleted: progress.sessionsCompleted,
      perfectSessions: gamification.perfectSessions,
      bestCombo: gamification.bestCombo,
      masteredCards,
      masteredVerbs: masteredVerbIds(progress.cards).size,
      dailyGoalsMet: gamification.goalDays.length,
      categoriesTouched: gamification.categoriesTouched.length,
      levelsTouched: gamification.levelsTouched.length,
      productionCorrect: gamification.productionCorrect,
      comebacks: gamification.comebacks,
    };
  }, [progress, gamification]);

  const unlockedCount = Object.keys(gamification.unlocked).length;
  const rank = rankForXp(gamification.xp);
  const upcoming = nextRank(gamification.xp);

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-semibold tracking-tight">Badges & ranks</h1>

      <Card className="p-5">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat label="Total XP" value={gamification.xp.toLocaleString()} tone="gold" />
          <Stat label="Rank" value={rank.name} hint={`Level ${rank.level}`} />
          <Stat
            label="Badges"
            value={`${unlockedCount} / ${ACHIEVEMENTS.length}`}
            tone={unlockedCount === ACHIEVEMENTS.length ? 'green' : undefined}
          />
          <Stat label="Best combo" value={gamification.bestCombo} />
        </div>

        <div className="mt-5">
          <div className="flex items-baseline justify-between text-xs text-muted">
            <span>{rank.name}</span>
            <span>{upcoming ? `${upcoming.name} at ${upcoming.minXp.toLocaleString()} XP` : 'Max rank'}</span>
          </div>
          <ProgressBar value={rankProgress(gamification.xp)} className="mt-1" label="Rank progress" />
        </div>
      </Card>

      {/* Rank ladder */}
      <Card className="p-5">
        <SectionHeading title="Rank ladder" />
        <ol className="space-y-1">
          {RANKS.map((entry) => {
            const reached = gamification.xp >= entry.minXp;
            const current = entry.level === rank.level;
            return (
              <li
                key={entry.level}
                className={cx(
                  'flex items-center gap-3 rounded-lg px-2 py-1.5',
                  current && 'bg-gold-500/10',
                )}
              >
                <span
                  className={cx(
                    'grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold',
                    reached
                      ? 'bg-gold-500 text-ink-950'
                      : 'bg-ink-200 text-muted dark:bg-ink-800',
                  )}
                >
                  {entry.level}
                </span>
                <span className={cx('font-medium', !reached && 'text-muted')}>{entry.name}</span>
                <span className="text-xs text-muted">{entry.english}</span>
                <span className="ml-auto text-xs tabular-nums text-muted">
                  {entry.minXp.toLocaleString()} XP
                </span>
              </li>
            );
          })}
        </ol>
      </Card>

      {/* Badges */}
      <Card className="p-5">
        <SectionHeading
          title="Badges"
          description="Locked badges show how far along you are."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ACHIEVEMENTS.map((achievement) => {
            const unlockedAt = gamification.unlocked[achievement.id];
            const unlocked = Boolean(unlockedAt);
            const { value, target } = achievement.progress(context);
            const ratio = Math.min(1, target === 0 ? 1 : value / target);
            const tier = TIER_STYLES[achievement.tier];

            return (
              <div
                key={achievement.id}
                className={cx(
                  'rounded-xl border p-3 transition-colors',
                  unlocked
                    ? cx('border-transparent ring-2 bg-gold-500/5', tier.ring)
                    : 'border-[var(--border-subtle)]',
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cx('text-2xl', !unlocked && 'opacity-30 grayscale')}
                    aria-hidden
                  >
                    {achievement.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cx(
                          'truncate text-sm font-semibold',
                          !unlocked && 'text-muted',
                        )}
                      >
                        {achievement.name}
                      </span>
                      <Badge tone="neutral">{tier.label}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{achievement.description}</p>

                    {unlocked ? (
                      <p className={cx('mt-1.5 text-xs font-medium', tier.text)}>
                        Unlocked {new Date(unlockedAt).toLocaleDateString()}
                      </p>
                    ) : (
                      <div className="mt-2">
                        <ProgressBar value={ratio} className="h-1" label={achievement.name} />
                        <p className="mt-1 text-[10px] tabular-nums text-muted">
                          {Math.min(value, target).toLocaleString()} / {target.toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
