import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useVerbs } from '@/hooks/useVerbs';
import { enabledCategories, useSettings } from '@/store/settingsStore';
import { countDue, countPractisable } from '@/exercises/sessionBuilder';
import { masteryBreakdown, useProgress, weakestCategories } from '@/store/progressStore';
import { effectiveStreak, useGamification } from '@/store/gamificationStore';
import { ACHIEVEMENTS_BY_ID, nextRank, rankForXp, rankProgress } from '@/lib/achievements';
import { FORM_CATEGORY_META } from '@/types/formCategory';
import { dayKey, recentDays } from '@/lib/dates';
import { Badge, Button, Card, cx, ProgressBar, Spinner, Stat } from '@/components/ui';

/** Home screen: what to do now, and how the last two weeks have gone. */
export function DashboardPage() {
  const { filtered, loading } = useVerbs();
  const settings = useSettings();
  const progress = useProgress();
  const gamification = useGamification();

  const categories = useMemo(() => enabledCategories(settings), [settings]);

  const due = useMemo(
    () => (loading ? 0 : countDue(filtered, progress.cards, categories)),
    [loading, filtered, progress.cards, categories],
  );
  const practisable = useMemo(
    () => (loading ? 0 : countPractisable(filtered, categories)),
    [loading, filtered, categories],
  );

  const mastery = useMemo(() => masteryBreakdown(progress.cards), [progress.cards]);
  const weak = useMemo(() => weakestCategories(progress.categoryStats), [progress.categoryStats]);

  const streak = effectiveStreak(gamification);
  const rank = rankForXp(gamification.xp);
  const upcoming = nextRank(gamification.xp);

  const today = progress.daily[dayKey()];
  const todayXp = today?.xp ?? 0;
  const goalMet = todayXp >= settings.dailyGoalXp;

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

  return (
			<div className="space-y-4">
				{/* Primary call to action */}
				<Card className="overflow-hidden">
					<div className="bg-gradient-to-br from-gold-500/15 to-transparent p-6">
						<div className="flex flex-wrap items-start justify-between gap-4">
							<div>
								<h1 className="font-serif text-2xl font-semibold tracking-tight">
									{isNewUser
										? "Willkommen!"
										: due > 0
											? "Time to review"
											: "Ready when you are"}
								</h1>
								<p className="mt-1 max-w-md text-sm text-muted">
									{isNewUser
										? "Start your first session and the app will begin scheduling verb forms for you automatically."
										: due > 0
											? `${due} form${due === 1 ? "" : "s"} ${due === 1 ? "is" : "are"} due — reviewing them now is what keeps them from fading.`
											: "Nothing is due right now. A session will introduce new forms instead."}
								</p>
							</div>

							<div className="flex gap-2">
								<Link
									to={due > 0 ? "/practice?start=due" : "/practice?start=mixed"}
								>
									<Button variant="primary" size="lg">
										{isNewUser
											? "Start learning"
											: due > 0
												? `Review ${due}`
												: "Practise"}
									</Button>
								</Link>
							</div>
						</div>

						<div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-4">
							<Stat
								label="Due now"
								value={due}
								tone={due > 0 ? "gold" : undefined}
							/>
							<Stat
								label="Streak"
								value={`${streak} d`}
								tone={streak > 0 ? "green" : undefined}
							/>
							<Stat
								label="Today"
								value={`${todayXp} XP`}
								hint={goalMet ? "goal met ✓" : `goal ${settings.dailyGoalXp}`}
								tone={goalMet ? "green" : undefined}
							/>
							<Stat label="Mastered" value={mastery.mastered} hint="forms" />
						</div>
					</div>
				</Card>

				<div className="grid gap-4 md:grid-cols-2">
					{/* Rank */}
					<Card className="p-5">
						<div className="flex items-baseline justify-between">
							<h2 className="text-sm font-semibold">Rank</h2>
							<span className="text-xs tabular-nums text-muted">
								{gamification.xp} XP
							</span>
						</div>
						<div className="mt-2 flex items-baseline gap-2">
							<span className="font-serif text-xl font-semibold">
								{rank.name}
							</span>
							<span className="text-xs text-muted">
								Level {rank.level} · {rank.english}
							</span>
						</div>
						<ProgressBar
							value={rankProgress(gamification.xp)}
							className="mt-3"
							label="Rank progress"
						/>
						<p className="mt-2 text-xs text-muted">
							{upcoming
								? `${upcoming.minXp - gamification.xp} XP to ${upcoming.name}`
								: "Highest rank reached — Verbmeister."}
						</p>
					</Card>

					{/* Corpus coverage */}
					<Card className="p-5">
						<h2 className="text-sm font-semibold">Coverage</h2>
						<p className="mt-1 text-xs text-muted">
							{mastery.total} of {practisable.toLocaleString()} enabled forms
							seen
						</p>

						<div className="mt-3 flex h-3 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
							{(
								[
									["mastered", mastery.mastered, "bg-emerald-500"],
									["review", mastery.review, "bg-sky-500"],
									["learning", mastery.learning, "bg-gold-500"],
									["lapsed", mastery.lapsed, "bg-red-500"],
								] as const
							).map(([key, count, colour]) => (
								<div
									key={key}
									className={colour}
									style={{
										width: `${practisable === 0 ? 0 : (count / practisable) * 100}%`,
									}}
									title={`${key}: ${count}`}
								/>
							))}
						</div>

						<div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
							<LegendDot
								colour="bg-emerald-500"
								label="Mastered"
								value={mastery.mastered}
							/>
							<LegendDot
								colour="bg-sky-500"
								label="Review"
								value={mastery.review}
							/>
							<LegendDot
								colour="bg-gold-500"
								label="Learning"
								value={mastery.learning}
							/>
							<LegendDot
								colour="bg-red-500"
								label="Lapsed"
								value={mastery.lapsed}
							/>
						</div>
					</Card>
				</div>

				{/* Activity */}
				<Card className="p-5">
					<div className="flex items-baseline justify-between">
						<h2 className="text-sm font-semibold">Last 14 days</h2>
						<span className="text-xs text-muted">
							{progress.totalAnswered.toLocaleString()} answers all-time
						</span>
					</div>

					<div className="mt-4 flex h-24 items-end gap-1">
						{last14.map((entry) => (
							<div
								key={entry.day}
								className="group flex flex-1 flex-col items-center gap-1"
							>
								<div
									className={cx(
										"w-full rounded-t transition-all",
										entry.xp === 0
											? "bg-ink-200 dark:bg-ink-800"
											: entry.day === dayKey()
												? "bg-gold-500"
												: "bg-gold-500/50",
									)}
									style={{ height: `${Math.max(3, entry.ratio * 100)}%` }}
									title={`${entry.day}: ${entry.xp} XP`}
								/>
							</div>
						))}
					</div>
					<div className="mt-1 flex justify-between text-[10px] text-muted">
						<span>14 days ago</span>
						<span>today</span>
					</div>
				</Card>

				{/* Weak spots */}
				{weak.length > 0 && (
					<Card className="p-5">
						<h2 className="text-sm font-semibold">Where you struggle most</h2>
						<p className="mt-1 text-xs text-muted">
							Spaced repetition already brings these back more often.
						</p>
						<ul className="mt-3 space-y-2">
							{weak.slice(0, 4).map((entry) => (
								<li key={entry.category} className="flex items-center gap-3">
									<span className="w-36 shrink-0 truncate text-sm">
										{FORM_CATEGORY_META[entry.category].label}
									</span>
									<ProgressBar
										value={entry.accuracy}
										tone={entry.accuracy < 0.6 ? "gold" : "green"}
										className="flex-1"
									/>
									<span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted">
										{Math.round(entry.accuracy * 100)}% · {entry.seen}
									</span>
								</li>
							))}
						</ul>
					</Card>
				)}

				{/* Recently unlocked */}
				{Object.keys(gamification.unlocked).length > 0 && (
					<Card className="p-5">
						<div className="flex items-baseline justify-between">
							<h2 className="text-sm font-semibold">Latest badges</h2>
							<Link
								to="/achievements"
								className="text-xs text-gold-600 hover:underline dark:text-gold-400"
							>
								See all →
							</Link>
						</div>
						<div className="mt-3 flex flex-wrap gap-1.5">
							{Object.entries(gamification.unlocked)
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

function LegendDot({ colour, label, value }: { colour: string; label: string; value: number }) {
  return (
    <span className="flex items-center gap-1.5 text-muted">
      <span className={cx('h-2 w-2 rounded-full', colour)} aria-hidden />
      {label} <span className="tabular-nums">{value}</span>
    </span>
  );
}
