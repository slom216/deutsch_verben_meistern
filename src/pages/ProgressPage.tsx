import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useVerbs } from '@/hooks/useVerbs';
import {
  masteredVerbIds,
  masteryBreakdown,
  overallAccuracy,
  useProgress,
  weakestCategories,
} from '@/store/progressStore';
import { effectiveStreak, useGamification } from '@/store/gamificationStore';
import { FORM_CATEGORY_META } from '@/types/formCategory';
import { PERSON_LABELS, type Person, PERSONS } from '@/types/verb';
import { formatInterval, parseCardId } from '@/lib/srs';
import { recentDays, formatDayShort, dayKey } from '@/lib/dates';
import { Badge, Button, Card, cx, EmptyState, ProgressBar, SectionHeading, Stat } from '@/components/ui';

const DIAGNOSTIC_LABELS: Record<string, string> = {
  capitalization: 'Capitalisation',
  umlaut: 'Umlauts',
  eszett: 'ß versus ss',
  spelling: 'Spelling slips',
  wordOrder: 'Word order',
  auxiliary: 'Wrong auxiliary',
  participle: 'Participle formation',
  reflexivePronoun: 'Reflexive pronoun',
  separablePrefix: 'Separable prefix',
  missingWords: 'Missing words',
  extraWords: 'Extra words',
  wrongForm: 'Wrong form',
};

/** Analytics: accuracy, weak categories, repeated mistakes, upcoming reviews. */
export function ProgressPage() {
  const progress = useProgress();
  const gamification = useGamification();
  const { byId, loading } = useVerbs();

  const mastery = useMemo(() => masteryBreakdown(progress.cards), [progress.cards]);
  const weak = useMemo(
    () => weakestCategories(progress.categoryStats, 3),
    [progress.categoryStats],
  );
  const masteredVerbs = useMemo(() => masteredVerbIds(progress.cards), [progress.cards]);

  const topMistakes = useMemo(
    () =>
      Object.values(progress.mistakes)
        .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
        .slice(0, 12),
    [progress.mistakes],
  );

  const topDiagnostics = useMemo(
    () =>
      Object.entries(progress.diagnosticCounts)
        .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
        .slice(0, 6),
    [progress.diagnosticCounts],
  );

  /** Reviews falling due over the coming week. */
  const forecast = useMemo(() => {
    const buckets = new Array(8).fill(0);
    const now = Date.now();
    for (const card of Object.values(progress.cards)) {
      const days = Math.floor((card.due - now) / 86_400_000);
      if (days < 0) buckets[0] += 1;
      else if (days < 7) buckets[days] += 1;
      else buckets[7] += 1;
    }
    return buckets;
  }, [progress.cards]);

  const last30 = useMemo(() => {
    const days = recentDays(30);
    const peak = Math.max(1, ...days.map((day) => progress.daily[day]?.answered ?? 0));
    return days.map((day) => {
      const entry = progress.daily[day];
      return {
        day,
        answered: entry?.answered ?? 0,
        accuracy: entry && entry.answered > 0 ? entry.correct / entry.answered : null,
        ratio: (entry?.answered ?? 0) / peak,
      };
    });
  }, [progress.daily]);

  /** Which grammatical persons trip you up most. */
  const personStats = useMemo(() => {
    const stats = new Map<string, { seen: number; correct: number }>();
    for (const card of Object.values(progress.cards)) {
      const parsed = parseCardId(card.id);
      if (!parsed || !PERSONS.includes(parsed.slot as Person)) continue;
      const entry = stats.get(parsed.slot) ?? { seen: 0, correct: 0 };
      entry.seen += card.seen;
      entry.correct += card.correct;
      stats.set(parsed.slot, entry);
    }
    return PERSONS.map((person) => {
      const entry = stats.get(person) ?? { seen: 0, correct: 0 };
      return {
        person,
        seen: entry.seen,
        accuracy: entry.seen === 0 ? null : entry.correct / entry.seen,
      };
    }).filter((entry) => entry.seen > 0);
  }, [progress.cards]);

  if (progress.totalAnswered === 0) {
    return (
      <Card>
        <EmptyState
          icon="📈"
          title="No progress yet"
          description="Finish a practice session and this page will fill up with accuracy trends, your weakest forms and a review forecast."
          action={
            <Link to="/practice">
              <Button variant="primary">Start practising</Button>
            </Link>
          }
        />
      </Card>
    );
  }

  const accuracy = overallAccuracy(progress);

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-semibold tracking-tight">Progress</h1>

      <Card className="p-5">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat label="Answered" value={progress.totalAnswered.toLocaleString()} />
          <Stat
            label="Accuracy"
            value={`${Math.round(accuracy * 100)}%`}
            tone={accuracy >= 0.8 ? 'green' : accuracy >= 0.6 ? 'gold' : 'red'}
          />
          <Stat label="Sessions" value={progress.sessionsCompleted} />
          <Stat
            label="Longest streak"
            value={`${gamification.longestStreak} d`}
            hint={`now ${effectiveStreak(gamification)} d`}
          />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <SectionHeading title="Forms by state" />
          <ul className="space-y-2">
            {(
              [
                ['Mastered', mastery.mastered, 'bg-emerald-500'],
                ['In review', mastery.review, 'bg-sky-500'],
                ['Learning', mastery.learning, 'bg-gold-500'],
                ['Lapsed', mastery.lapsed, 'bg-red-500'],
              ] as const
            ).map(([label, count, colour]) => (
              <li key={label} className="flex items-center gap-3">
                <span className={cx('h-2.5 w-2.5 rounded-full', colour)} aria-hidden />
                <span className="flex-1 text-sm">{label}</span>
                <span className="text-sm font-semibold tabular-nums">{count}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-[var(--border-subtle)] pt-3 text-sm text-muted">
            <strong className="text-[var(--text-strong)]">{masteredVerbs.size}</strong> verbs fully
            mastered across every form you practise.
          </p>
        </Card>

        <Card className="p-5">
          <SectionHeading title="Review forecast" description="Cards falling due over the next week." />
          <div className="flex h-28 items-end gap-1.5">
            {forecast.map((count, index) => {
              const peak = Math.max(1, ...forecast);
              return (
                <div key={index} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] tabular-nums text-muted">{count || ''}</span>
                  <div
                    className={cx(
                      'w-full rounded-t',
                      index === 0 ? 'bg-gold-500' : 'bg-sky-500/60',
                    )}
                    style={{ height: `${Math.max(2, (count / peak) * 100)}%` }}
                    title={index === 0 ? `${count} due now` : `${count} due in ${index} days`}
                  />
                  <span className="text-[10px] text-muted">
                    {index === 0 ? 'now' : index === 7 ? '7+' : `${index}d`}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Daily activity */}
      <Card className="p-5">
        <SectionHeading title="Last 30 days" description="Bar height is questions answered; colour is accuracy." />
        <div className="flex h-24 items-end gap-0.5">
          {last30.map((entry) => (
            <div
              key={entry.day}
              className={cx(
                'flex-1 rounded-t transition-all',
                entry.accuracy === null
                  ? 'bg-ink-200 dark:bg-ink-800'
                  : entry.accuracy >= 0.8
                    ? 'bg-emerald-500'
                    : entry.accuracy >= 0.6
                      ? 'bg-gold-500'
                      : 'bg-red-500',
                entry.day === dayKey() && 'ring-2 ring-gold-500 ring-offset-1 ring-offset-[var(--surface-raised)]',
              )}
              style={{ height: `${Math.max(3, entry.ratio * 100)}%` }}
              title={`${formatDayShort(entry.day)}: ${entry.answered} answered${
                entry.accuracy === null ? '' : `, ${Math.round(entry.accuracy * 100)}% correct`
              }`}
            />
          ))}
        </div>
      </Card>

      {/* Categories */}
      {weak.length > 0 && (
        <Card className="p-5">
          <SectionHeading title="Accuracy by form category" />
          <ul className="space-y-2">
            {weak.map((entry) => (
              <li key={entry.category} className="flex items-center gap-3">
                <span className="w-44 shrink-0 truncate text-sm">
                  {FORM_CATEGORY_META[entry.category].label}
                </span>
                <ProgressBar
                  value={entry.accuracy}
                  tone={entry.accuracy >= 0.8 ? 'green' : 'gold'}
                  className="flex-1"
                />
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted">
                  {Math.round(entry.accuracy * 100)}% · {entry.seen}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Persons */}
      {personStats.length > 0 && (
        <Card className="p-5">
          <SectionHeading title="Accuracy by person" />
          <div className="grid gap-3 sm:grid-cols-3">
            {personStats.map((entry) => (
              <div key={entry.person}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{PERSON_LABELS[entry.person]}</span>
                  <span className="text-xs tabular-nums text-muted">
                    {entry.accuracy === null ? '—' : `${Math.round(entry.accuracy * 100)}%`}
                  </span>
                </div>
                <ProgressBar
                  value={entry.accuracy ?? 0}
                  tone={(entry.accuracy ?? 0) >= 0.8 ? 'green' : 'gold'}
                  className="mt-1 h-1.5"
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Error types */}
      {topDiagnostics.length > 0 && (
        <Card className="p-5">
          <SectionHeading
            title="What goes wrong most"
            description="Aggregated across every wrong answer you have given."
          />
          <div className="flex flex-wrap gap-2">
            {topDiagnostics.map(([code, count]) => (
              <span
                key={code}
                className="flex items-center gap-2 rounded-lg bg-ink-100 px-3 py-1.5 text-sm dark:bg-ink-800"
              >
                {DIAGNOSTIC_LABELS[code] ?? code}
                <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">
                  {count}
                </span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Repeated mistakes */}
      {topMistakes.length > 0 && (
        <Card className="p-5">
          <SectionHeading
            title="Forms you keep missing"
            description="These are already scheduled to come back sooner."
          />
          <ul className="divide-y divide-[var(--border-subtle)]">
            {topMistakes.map((mistake) => {
              const verb = byId.get(mistake.verbId);
              const card = progress.cards[mistake.cardId];
              const slotLabel = PERSONS.includes(mistake.slot as Person)
                ? PERSON_LABELS[mistake.slot as Person]
                : mistake.slot === '_'
                  ? ''
                  : mistake.slot;

              return (
                <li key={mistake.cardId} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <Link
                        to={`/library/${mistake.verbId}`}
                        className="font-medium hover:underline"
                      >
                        {loading ? mistake.verbId : (verb?.dictionaryForm ?? mistake.verbId)}
                      </Link>
                      <Badge tone="neutral">
                        {FORM_CATEGORY_META[mistake.category]?.short ?? mistake.category}
                        {slotLabel && ` · ${slotLabel}`}
                      </Badge>
                    </div>
                    <p className="truncate text-sm text-muted">
                      you wrote{' '}
                      <span className="text-red-600 dark:text-red-400">
                        {mistake.lastResponse || '—'}
                      </span>{' '}
                      · correct{' '}
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {mistake.expected}
                      </span>
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">
                      ×{mistake.count}
                    </div>
                    {card && (
                      <div className="text-[10px] text-muted">
                        {formatInterval(Math.max(0, card.due - Date.now()))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
