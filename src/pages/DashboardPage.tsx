import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useVerbs } from '@/hooks/useVerbs';
import { enabledCategories, useSettings } from '@/store/settingsStore';
import { countDue, countPractisable } from '@/exercises/sessionBuilder';
import { masteryBreakdown, useProgress, weakestCategories } from '@/store/progressStore';
import { effectiveStreak, useGamification } from '@/store/gamificationStore';
import { ACHIEVEMENTS_BY_ID, nextRank, rankForXp, rankProgress } from '@/lib/achievements';
import { FORM_CATEGORY_META } from '@/types/formCategory';
import { dayKey, recentDays } from '@/lib/dates';
import { Badge, buttonClasses, Card, cx, ProgressBar, Spinner } from '@/components/ui';
import heroArt from '@/assets/art/hero-verbs.webp';
import dueIcon from '@/assets/art/due-now.png';
import streakIcon from '@/assets/art/streak-flame.png';
import todayIcon from '@/assets/art/today-target.png';
import masteredIcon from '@/assets/art/mastered-star.png';
import rankEmblem from '@/assets/art/beginner-rank.png';
import emptyBook from '@/assets/art/empty-state-book.png';
import dotMastered from '@/assets/art/coverage-mastered.png';
import dotReview from '@/assets/art/coverage-review.png';
import dotLearning from '@/assets/art/coverage-learning.png';
import dotLapsed from '@/assets/art/coverage-lapsed.png';

/** Home screen: what to do now, and how the last two weeks have gone. */
export function DashboardPage() {
  const { filtered, loading } = useVerbs();
  const categories = useSettings(useShallow(enabledCategories));
  const dailyGoalXp = useSettings((state) => state.dailyGoalXp);
  const progress = useProgress(
    useShallow((state) => ({
      cards: state.cards,
      categoryStats: state.categoryStats,
      daily: state.daily,
      totalAnswered: state.totalAnswered,
    })),
  );
  const xp = useGamification((state) => state.xp);
  const unlocked = useGamification((state) => state.unlocked);
  const streak = useGamification(effectiveStreak);

  // Cards fall due as time passes, not only when the store changes, so re-read
  // the clock every 30 s and whenever the tab regains focus.
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 30_000);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', tick);
    };
  }, []);

  const due = useMemo(
    () => (loading ? 0 : countDue(filtered, progress.cards, categories, now)),
    [loading, filtered, progress.cards, categories, now],
  );
  const practisable = useMemo(
    () => (loading ? 0 : countPractisable(filtered, categories)),
    [loading, filtered, categories],
  );

  const mastery = useMemo(() => masteryBreakdown(progress.cards), [progress.cards]);
  const weak = useMemo(() => weakestCategories(progress.categoryStats), [progress.categoryStats]);

  const rank = rankForXp(xp);
  const upcoming = nextRank(xp);

  const today = progress.daily[dayKey()];
  const todayXp = today?.xp ?? 0;
  const goalMet = todayXp >= dailyGoalXp;

  const last14 = useMemo(() => {
    const days = recentDays(14);
    const peak = Math.max(1, ...days.map((day) => progress.daily[day]?.xp ?? 0));
    return days.map((day) => ({
      day,
      xp: progress.daily[day]?.xp ?? 0,
      ratio: (progress.daily[day]?.xp ?? 0) / peak,
    }));
  }, [progress.daily]);

  if (loading) return <Spinner label="Loading verbs…" />;

  const isNewUser = progress.totalAnswered === 0;
  // Three gridlines above zero; the top one is the busiest day, never below 3 XP.
  const chartTop = Math.max(3, ...last14.map((entry) => entry.xp));
  const ticks = [chartTop, (chartTop * 2) / 3, chartTop / 3, 0].map((tick) => Math.round(tick));

  return (
    <div className="space-y-5">
      {/* Hero: copy on the left, the verb collage at native size on the right. */}
      <section className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-[var(--link)]">
            A1 – B1 German verbs
          </p>
          <p className="mt-2 font-heading text-[clamp(2.5rem,4.6vw,4.25rem)] leading-[0.92] font-extrabold tracking-[-0.035em]">
            Put your German
            <br />
            <span className="text-[var(--headline-accent)]">into action</span>.
          </p>
          <h1 className="mt-5 font-heading text-[clamp(1.75rem,2.6vw,2.25rem)] leading-tight font-extrabold tracking-tight">
            {isNewUser ? 'Willkommen!' : due > 0 ? 'Time to review' : 'Ready when you are'}
          </h1>
          <p className="mt-1 max-w-lg text-lg leading-snug text-muted">
            {isNewUser
              ? 'Start your first session and the app will begin scheduling verb forms for you automatically.'
              : due > 0
                ? `${due} form${due === 1 ? '' : 's'} ${due === 1 ? 'is' : 'are'} due — reviewing them now is what keeps them from fading.`
                : 'Nothing is due right now. A session will introduce new forms instead.'}
          </p>
          <Link
            to={due > 0 ? '/practice?start=due' : '/practice?start=mixed'}
            className={buttonClasses('primary', 'lg', 'btn-arrow mt-5')}
          >
            {isNewUser ? 'Start learning' : due > 0 ? `Review ${due}` : 'Practise'}
          </Link>
        </div>
        {/* The verb cards printed in the art (ich bin, du bist, er ist) are decoration. */}
        <img
          src={heroArt}
          alt=""
          width={738}
          height={366}
          className="mx-auto h-auto w-[738px] max-w-full lg:-mr-2 lg:-mt-6"
        />
      </section>

      {/* The four figures, divided by hairlines under a full-width rule. */}
      <dl className="grid grid-cols-2 gap-y-5 border-t border-[var(--rule)] pt-5 lg:grid-cols-4">
        <StatBlock
          icon={dueIcon}
          size={[78, 76]}
          label="Due now"
          value={due}
          tone={due > 0 ? 'gold' : undefined}
        />
        <StatBlock
          icon={streakIcon}
          size={[66, 86]}
          label="Streak"
          value={`${streak} d`}
          tone={streak > 0 ? 'green' : undefined}
        />
        <StatBlock
          icon={todayIcon}
          size={[81, 86]}
          label="Today"
          value={`${todayXp} XP`}
          hint={goalMet ? 'goal met ✓' : `goal ${dailyGoalXp}`}
          tone={goalMet ? 'green' : undefined}
        />
        <StatBlock
          icon={masteredIcon}
          size={[87, 86]}
          label="Mastered"
          value={mastery.mastered}
          hint="forms"
        />
      </dl>

      <div className="grid gap-3 md:grid-cols-2">
        {/* Rank */}
        <Card className="p-6 pt-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-heading text-xl font-extrabold tracking-tight">Rank</h2>
            <span className="tabular-nums text-muted">{xp.toLocaleString()} XP</span>
          </div>
          <div className="mt-2 flex items-start gap-9">
            {/* One emblem for every rank for now; the rank is written beside it. */}
            <img src={rankEmblem} alt="" width={76} height={81} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-heading text-[28px] leading-tight font-extrabold tracking-tight">
                {rank.name}
              </p>
              <p className="text-muted">
                Level {rank.level} · {rank.english}
              </p>
              <ProgressBar value={rankProgress(xp)} className="mt-3 h-2.5" label="Rank progress" />
              <p className="mt-3 text-sm text-muted">
                {upcoming
                  ? `${upcoming.minXp - xp} XP to ${upcoming.name}`
                  : 'Highest rank reached — Verbmeister.'}
              </p>
            </div>
          </div>
        </Card>

        {/* Corpus coverage */}
        <Card className="p-6 pt-5">
          <h2 className="font-heading text-xl font-extrabold tracking-tight">Coverage</h2>
          <p className="mt-1 text-lg text-muted">
            {mastery.total} of {practisable.toLocaleString()} enabled forms seen
          </p>

          <div className="mt-3 flex h-4 overflow-hidden rounded-full bg-[var(--track)]">
            {(
              [
                ['mastered', mastery.mastered, 'bg-emerald-500'],
                ['review', mastery.review, 'bg-sky-500'],
                ['learning', mastery.learning, 'bg-gold-500'],
                ['lapsed', mastery.lapsed, 'bg-red-500'],
              ] as const
            ).map(([key, count, colour]) => (
              <div
                key={key}
                className={colour}
                style={{ width: `${practisable === 0 ? 0 : (count / practisable) * 100}%` }}
                title={`${key}: ${count}`}
              />
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-9 gap-y-2">
            <LegendDot dot={dotMastered} label="Mastered" value={mastery.mastered} />
            <LegendDot dot={dotReview} label="Review" value={mastery.review} />
            <LegendDot dot={dotLearning} label="Learning" value={mastery.learning} />
            <LegendDot dot={dotLapsed} label="Lapsed" value={mastery.lapsed} />
          </div>
        </Card>
      </div>

      {/* Activity */}
      <Card className="p-6 pt-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-heading text-xl font-extrabold tracking-tight">Last 14 days</h2>
          <span className="text-muted">
            {progress.totalAnswered.toLocaleString()} answers all-time
          </span>
        </div>

        <div className="relative mt-4 ml-6 h-28">
          {/* Dashed gridlines with their XP values; bars sit on the zero line. */}
          {ticks.map((tick, index) => (
            <div
              key={index}
              className={cx(
                'absolute inset-x-0 border-t',
                index === ticks.length - 1
                  ? 'border-[var(--rule)]'
                  : 'border-dashed border-[var(--border-subtle)]',
              )}
              style={{ top: `${(index / (ticks.length - 1)) * 100}%` }}
            >
              <span className="absolute -left-6 -translate-y-1/2 text-xs tabular-nums text-muted">
                {tick}
              </span>
            </div>
          ))}
          <div className="absolute inset-0 flex items-end gap-1 border-l border-[var(--rule)] px-1">
            {last14.map((entry) => (
              <div
                key={entry.day}
                className={cx(
                  'flex-1 rounded-t-sm',
                  entry.xp === 0
                    ? 'bg-transparent'
                    : entry.day === dayKey()
                      ? 'bg-poster-red'
                      : 'bg-gold-500',
                )}
                style={{ height: `${(entry.xp / chartTop) * 100}%` }}
                title={`${entry.day}: ${entry.xp} XP`}
              />
            ))}
          </div>
          {isNewUser && (
            <div className="absolute inset-0 grid place-content-center justify-items-center gap-2 text-muted">
              <img src={emptyBook} alt="" width={48} height={42} className="h-auto w-10 dark:invert" />
              <p>Your first session starts the story.</p>
            </div>
          )}
        </div>
        <div className="mt-2 ml-6 flex justify-between text-sm text-muted">
          <span>14 days ago</span>
          <span>today</span>
        </div>
      </Card>

      {/* Weak spots */}
      {weak.length > 0 && (
        <Card className="p-6 pt-5">
          <h2 className="font-heading text-xl font-extrabold tracking-tight">
            Where you struggle most
          </h2>
          <p className="mt-1 text-sm text-muted">
            Spaced repetition already brings these back more often.
          </p>
          <ul className="mt-3 space-y-2">
            {weak.slice(0, 4).map((entry) => (
              <li key={entry.category} className="flex items-center gap-3">
                <span className="w-44 shrink-0 truncate text-sm font-semibold">
                  {FORM_CATEGORY_META[entry.category].label}
                </span>
                <ProgressBar
                  value={entry.accuracy}
                  tone={entry.accuracy < 0.6 ? 'gold' : 'green'}
                  className="flex-1"
                />
                <span className="w-20 shrink-0 text-right text-sm tabular-nums text-muted">
                  {Math.round(entry.accuracy * 100)}% · {entry.seen}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Recently unlocked */}
      {Object.keys(unlocked).length > 0 && (
        <Card className="p-6 pt-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-heading text-xl font-extrabold tracking-tight">Latest badges</h2>
            <Link to="/achievements" className="text-sm text-[var(--link)] underline-offset-4 hover:underline">
              See all →
            </Link>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.entries(unlocked)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .flatMap(([id]) => {
                const achievement = ACHIEVEMENTS_BY_ID[id];
                if (!achievement) return [];
                return [
                  <Badge key={id} tone="gold">
                    <span className="mr-1" aria-hidden>
                      {achievement.icon}
                    </span>
                    {achievement.name}
                  </Badge>,
                ];
              })}
          </div>
        </Card>
      )}
    </div>
  );
}

/** One headline figure: its printed shape, then the tracked label, the value and a hint. */
function StatBlock({
  icon,
  size,
  label,
  value,
  hint,
  tone,
}: {
  icon: string;
  size: readonly [number, number];
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'gold' | 'green';
}) {
  const tones = {
    gold: 'text-gold-600 dark:text-gold-400',
    green: 'text-emerald-600 dark:text-emerald-400',
  };
  return (
    <div className="flex items-start gap-3 px-2 sm:gap-8 sm:px-8 lg:[&:not(:first-child)]:border-l lg:border-[var(--rule)] max-lg:even:border-l max-lg:border-[var(--rule)]">
      {/* Shown at native size, shrunk only on phones. */}
      <img
        src={icon}
        alt=""
        width={size[0]}
        height={size[1]}
        className="mt-1 h-auto shrink-0 max-sm:w-10"
      />
      <div>
        <dt className="text-sm tracking-[0.06em] uppercase">{label}</dt>
        <dd
          className={cx(
            'font-heading text-[30px] leading-tight font-extrabold whitespace-nowrap tabular-nums sm:text-[40px]',
            tone && tones[tone],
          )}
        >
          {value}
        </dd>
        {hint && <dd className="text-lg text-muted">{hint}</dd>}
      </div>
    </div>
  );
}

function LegendDot({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <span className="flex items-center gap-2 text-muted">
      <img src={dot} alt="" width={24} height={24} className="h-5 w-5" />
      {label} <span className="ml-1 tabular-nums">{value}</span>
    </span>
  );
}
