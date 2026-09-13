import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useVerbs } from '@/hooks/useVerbs';
import { useSession } from '@/hooks/useSession';
import { ExerciseView, FeedbackPanel } from '@/components/ExerciseView';
import {
  Badge,
  Button,
  buttonClasses,
  Card,
  cx,
  EmptyState,
  ProgressBar,
  Spinner,
  Stat,
} from '@/components/ui';
import { enabledCategories, useSettings } from '@/store/settingsStore';
import { FORM_CATEGORY_META } from '@/types/formCategory';
import { EXERCISE_TYPE_META } from '@/exercises/types';
import { countDue } from '@/exercises/sessionBuilder';
import { useProgress } from '@/store/progressStore';

/**
 * The practice screen: a start card, the running session, and a summary.
 *
 * Keyboard flow is the priority — Enter submits, Enter again advances, so a
 * whole session can be done without touching the mouse.
 */
export function PracticePage() {
  const { filtered, byId, loading, error } = useVerbs();
  const categories = useSettings(useShallow(enabledCategories));
  const sessionSettings = useSettings((state) => state.session);
  const exerciseTypes = useSettings((state) => state.exerciseTypes);
  const autoAdvance = useSettings((state) => state.autoAdvance);
  const cards = useProgress((state) => state.cards);
  const [searchParams, setSearchParams] = useSearchParams();

  const session = useSession(byId, filtered);
  const {
    exercise,
    phase,
    response,
    setResponse,
    result,
    hintUsed,
    revealHint,
    combo,
    multiplier,
    lastXp,
    summary,
    index,
    total,
    plan,
    start,
    submit,
    advance,
    reset,
  } = session;

  const dueNow = useMemo(
    () => (loading ? 0 : countDue(filtered, cards, categories)),
    [loading, filtered, cards, categories],
  );

  const autoStart = searchParams.get('start');

  // `?start=due` from the dashboard opens straight into a review session.
  useEffect(() => {
    if (!autoStart || loading || phase !== 'idle' || filtered.length === 0) return;
    start({ onlyDue: autoStart === 'due' });
    setSearchParams({}, { replace: true });
  }, [autoStart, loading, phase, filtered.length, start, setSearchParams]);

  const canSubmit = useMemo(() => {
    if (!exercise) return false;
    switch (response.kind) {
      case 'text':
        return response.value.trim().length > 0;
      case 'choice':
        return response.value !== null;
      case 'order':
        return (
          exercise.type === 'sentenceReconstruction' &&
          response.value.length === exercise.tokens.length
        );
      case 'pairs':
        return (
          exercise.type === 'matching' &&
          exercise.pairs.every((pair) => Boolean(response.value[pair.left]))
        );
      default:
        return false;
    }
  }, [exercise, response]);

  const exerciseRef = useRef<HTMLDivElement | null>(null);
  const checkRef = useRef<HTMLButtonElement | null>(null);

  // Enter submits whenever Check is enabled, and Enter (or Space) advances from
  // the feedback panel. This is the single page-level key handler.
  const handleKey = useCallback(
    (event: KeyboardEvent) => {
      const isEnter = event.key === 'Enter';
      if (event.defaultPrevented || !(isEnter || (phase === 'feedback' && event.key === ' '))) {
        return;
      }
      const target = event.target as HTMLElement | null;
      // Text fields handle their own keys (GermanInput submits on Enter), and
      // controls outside the exercise — Continue, End session, the nav — keep
      // their native activation.
      if (target?.closest?.('input, textarea, select')) return;
      if (target?.closest?.('button, a') && !exerciseRef.current?.contains(target)) return;

      if (phase === 'feedback') {
        event.preventDefault();
        advance();
      } else if (phase === 'active' && isEnter && canSubmit) {
        event.preventDefault();
        submit();
      }
    },
    [phase, advance, submit, canSubmit],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  // Optionally skip the feedback panel on a clean answer.
  useEffect(() => {
    if (!autoAdvance || phase !== 'feedback' || !result?.correct) return;
    const timer = window.setTimeout(advance, 900);
    return () => window.clearTimeout(timer);
  }, [autoAdvance, phase, result, advance]);

  // A new question takes focus, so keyboard users do not restart from <body>.
  // Typed questions autofocus their input on mount, which this leaves alone.
  useEffect(() => {
    const area = exerciseRef.current;
    if (area && !area.contains(document.activeElement)) area.focus();
  }, [exercise]);

  if (loading) return <Spinner label="Loading verbs…" />;

  if (error) {
    return (
      <Card>
        <EmptyState
          icon="⚠️"
          title="The verb data could not be loaded"
          description={error}
          action={
            <Button variant="primary" onClick={() => window.location.reload()}>
              Reload
            </Button>
          }
        />
      </Card>
    );
  }

  if (filtered.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="🔍"
          title="No verbs match your filters"
          description="Your level selection and verb filters have narrowed the pool to nothing. Loosen them in settings to start practising."
          action={
            <Link to="/settings" className={buttonClasses('primary')}>
              Open settings
            </Link>
          }
        />
      </Card>
    );
  }

  /* ---------------- Start screen ---------------- */

  if (phase === 'idle') {
    return (
      <div className="space-y-4">
        <Card className="p-6">
          <h1 className="font-serif text-2xl font-semibold tracking-tight">Practice</h1>
          <p className="mt-1 text-sm text-muted">
            {filtered.length} verbs in your pool · {categories.length} form categor
            {categories.length === 1 ? 'y' : 'ies'} enabled
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Stat label="Due now" value={dueNow} tone={dueNow > 0 ? 'gold' : undefined} />
            <Stat label="Session length" value={sessionSettings.length} hint="questions" />
            <Stat label="New forms" value={sessionSettings.newCardLimit} hint="max per session" />
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="primary" size="lg" onClick={() => start()}>
              Start session
            </Button>
            <Button
              size="lg"
              disabled={dueNow === 0}
              onClick={() => start({ onlyDue: true })}
              title={dueNow === 0 ? 'Nothing is due for review yet' : undefined}
            >
              Review due only ({dueNow})
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-semibold">What this session can ask you</h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.values(EXERCISE_TYPE_META)
              .filter((meta) => exerciseTypes[meta.id])
              .map((meta) => (
                <Badge key={meta.id} tone={meta.mode === 'production' ? 'violet' : 'blue'}>
                  {meta.label}
                </Badge>
              ))}
          </div>

          <h2 className="mt-5 text-sm font-semibold">Forms in play</h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {categories.map((category) => (
              <Badge key={category} tone="gold">
                {FORM_CATEGORY_META[category].short}
              </Badge>
            ))}
          </div>

          <Link
            to="/settings"
            className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-gold-600 hover:underline dark:text-gold-400"
          >
            Change what you practise →
          </Link>
        </Card>
      </div>
    );
  }

  /* ---------------- Summary ---------------- */

  if (phase === 'complete') {
    const accuracy = summary.answered === 0 ? 0 : summary.correct / summary.answered;
    const minutes = Math.max(1, Math.round(summary.durationMs / 60000));

    return (
      <Card className="p-6">
        <div className="text-center">
          <div className="text-5xl animate-pop" aria-hidden>
            {summary.perfect && summary.answered > 0 ? '🏆' : accuracy >= 0.8 ? '🎉' : '💪'}
          </div>
          <h1 className="mt-3 font-serif text-2xl font-semibold">
            {summary.answered === 0
              ? 'Nothing to practise'
              : summary.perfect
                ? 'Flawless session!'
                : 'Session complete'}
          </h1>
          {summary.answered === 0 && (
            <p className="mt-1 text-sm text-muted">
              Every enabled form is either mastered or scheduled for later. Try enabling more form
              categories or CEFR levels.
            </p>
          )}
        </div>

        {summary.answered > 0 && (
          <div className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-5 sm:grid-cols-4">
            <Stat label="Answered" value={summary.answered} />
            <Stat
              label="Accuracy"
              value={`${Math.round(accuracy * 100)}%`}
              tone={accuracy >= 0.8 ? 'green' : accuracy >= 0.5 ? undefined : 'red'}
            />
            <Stat label="XP" value={`+${summary.xp}`} tone="gold" />
            <Stat label="Best combo" value={summary.bestCombo} hint={`${minutes} min`} />
          </div>
        )}

        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={() => start()}>
            Another session
          </Button>
          <Button onClick={reset}>Back</Button>
          <Link to="/progress" className={buttonClasses('ghost')}>
            See progress
          </Link>
        </div>
      </Card>
    );
  }

  /* ---------------- Running session ---------------- */

  if (!exercise) return <Spinner />;

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Practice session</h1>

      {/* Session progress and combo */}
      <div className="flex items-center gap-3">
        <ProgressBar value={total === 0 ? 0 : index / total} className="flex-1" label="Session progress" />
        <span className="text-xs tabular-nums text-muted">
          {index + 1} / {total}
        </span>
        {combo >= 3 && (
          <span
            className={cx(
              'animate-pop rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
              multiplier >= 2
                ? 'bg-orange-500/20 text-orange-600 dark:text-orange-400'
                : 'bg-gold-500/20 text-gold-700 dark:text-gold-300',
            )}
            title={`Combo ×${multiplier} XP`}
          >
            🔥 {combo}
          </span>
        )}
      </div>

      <Card
        className={cx(
          'p-6',
          phase === 'feedback' && result && !result.correct && 'animate-shake',
        )}
        onFocus={(event) => {
          // On phones the on-screen keyboard opens after focus and can cover
          // Check; bring it back into view once the viewport has shrunk.
          if (event.target instanceof HTMLInputElement) {
            window.setTimeout(() => checkRef.current?.scrollIntoView?.({ block: 'nearest' }), 300);
          }
        }}
      >
        <div
          ref={exerciseRef}
          tabIndex={-1}
          role="group"
          aria-label={`Question ${index + 1} of ${total}`}
          className="outline-none"
        >
          <ExerciseView
            key={exercise.id}
            exercise={exercise}
            response={response}
            onChange={setResponse}
            onSubmit={() => canSubmit && submit()}
            result={phase === 'feedback' ? result : null}
            hintUsed={hintUsed}
          />
        </div>

        {phase === 'active' && (
          <div className="mt-4 flex items-center justify-between gap-3">
            {exercise.hint && !hintUsed ? (
              <Button variant="ghost" size="sm" onClick={revealHint}>
                💡 Hint
              </Button>
            ) : (
              <span />
            )}

            <Button ref={checkRef} variant="primary" onClick={submit} disabled={!canSubmit}>
              Check <span className="text-xs opacity-70">↵</span>
            </Button>
          </div>
        )}
      </Card>

      {/* Always mounted, so screen readers announce feedback when it is inserted. */}
      <div role="status" aria-live="polite">
        {phase === 'feedback' && result && (
          <FeedbackPanel
            result={result}
            exercise={exercise}
            xp={lastXp}
            multiplier={multiplier}
            onNext={advance}
            autoFocusNext={!autoAdvance}
          />
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {plan && plan.dueCount > 0 && `${plan.dueCount} review`}
          {plan && plan.dueCount > 0 && plan.newCount > 0 && ' · '}
          {plan && plan.newCount > 0 && `${plan.newCount} new`}
        </span>
        <button type="button" onClick={reset} className="hover:underline">
          End session
        </button>
      </div>
    </div>
  );
}
