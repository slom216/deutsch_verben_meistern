import { useEffect, useMemo, useRef } from 'react';
import type {
  Exercise,
  ExerciseResponse,
  MatchingExercise,
  MultipleChoiceExercise,
  SentenceCompletionExercise,
  SentenceReconstructionExercise,
} from '@/exercises/types';
import type { GradeResult } from '@/lib/grader';
import { GermanInput } from './GermanInput';
import { Badge, Button, cx } from './ui';

/**
 * Renders the current exercise and collects the learner's response.
 *
 * Each view is a controlled component over a single `ExerciseResponse`; the
 * session hook owns all state and grading, so these stay presentational.
 */

export interface ExerciseViewProps {
  exercise: Exercise;
  response: ExerciseResponse;
  onChange: (next: ExerciseResponse) => void;
  onSubmit: () => void;
  /** Non-null once the answer has been graded. */
  result: GradeResult | null;
  hintUsed: boolean;
}

export function ExerciseView(props: ExerciseViewProps) {
  const { exercise } = props;

  switch (exercise.type) {
    case 'multipleChoice':
      return <MultipleChoiceView {...props} exercise={exercise} />;
    case 'matching':
      return <MatchingView {...props} exercise={exercise} />;
    case 'sentenceReconstruction':
      return <ReconstructionView {...props} exercise={exercise} />;
    case 'sentenceCompletion':
      return <SentenceCompletionView {...props} exercise={exercise} />;
    case 'typedConjugation':
      return (
        <TypedView {...props} question={exercise.question} placeholder="Type the form…" />
      );
    case 'errorCorrection':
      return (
        <TypedView
          {...props}
          question={exercise.sentence}
          questionTone="error"
          placeholder="Corrected form…"
          note={`Replace "${exercise.wrongToken}".`}
        />
      );
    case 'tenseTransformation':
      return (
        <TypedView
          {...props}
          question={exercise.sourceSentence}
          placeholder="Rewritten sentence…"
          note={`${exercise.fromLabel} → ${exercise.toLabel}`}
        />
      );
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */

function QuestionHeader({
  prompt,
  context,
  infinitive,
}: {
  prompt: string;
  context?: string;
  infinitive: string;
}) {
  return (
    <div className="text-center">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{prompt}</div>
      <div className="mt-1 font-serif text-2xl font-semibold tracking-tight">{infinitive}</div>
      {context && <div className="mt-0.5 text-sm text-muted">{context}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Multiple choice                                                      */
/* ------------------------------------------------------------------ */

function MultipleChoiceView({
  exercise,
  response,
  onChange,
  onSubmit,
  result,
}: ExerciseViewProps & { exercise: MultipleChoiceExercise }) {
  const selected = response.kind === 'choice' ? response.value : null;
  const graded = result !== null;

  // Number keys pick an option; a second press of the same key submits it.
  useEffect(() => {
    if (graded) return;
    const handler = (event: KeyboardEvent) => {
      const position = Number.parseInt(event.key, 10);
      if (Number.isNaN(position) || position < 1 || position > exercise.options.length) return;
      event.preventDefault();
      const option = exercise.options[position - 1];
      if (selected === option) onSubmit();
      else onChange({ kind: 'choice', value: option });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [exercise.options, selected, graded, onChange, onSubmit]);

  return (
    <div className="space-y-5">
      <QuestionHeader
        prompt={exercise.prompt}
        context={exercise.context}
        infinitive={exercise.infinitive}
      />
      <p className="text-center text-sm">{exercise.question}</p>

      <div className="grid gap-2 sm:grid-cols-2">
        {exercise.options.map((option, position) => {
          const isSelected = selected === option;
          const isAnswer = option === exercise.answer;

          const tone = graded
            ? isAnswer
              ? 'border-emerald-500 bg-emerald-500/10'
              : isSelected
                ? 'border-red-500 bg-red-500/10'
                : 'opacity-55'
            : isSelected
              ? 'border-gold-500 bg-gold-500/10'
              : 'hover:border-ink-300 dark:hover:border-ink-600';

          return (
            <button
              key={option}
              type="button"
              disabled={graded}
              onClick={() => onChange({ kind: 'choice', value: option })}
              onDoubleClick={onSubmit}
              className={cx(
                'flex items-center gap-3 rounded-xl border-2 border-[var(--border-subtle)] px-4 py-3 text-left transition-colors',
                'surface-card disabled:cursor-default',
                tone,
              )}
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-ink-100 text-xs font-semibold dark:bg-ink-800">
                {position + 1}
              </span>
              <span className="font-medium">{option}</span>
              {graded && isAnswer && <span className="ml-auto text-emerald-600">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Typed answers                                                        */
/* ------------------------------------------------------------------ */

function TypedView({
  exercise,
  response,
  onChange,
  onSubmit,
  result,
  hintUsed,
  question,
  placeholder,
  note,
  questionTone,
}: ExerciseViewProps & {
  question: string;
  placeholder: string;
  note?: string;
  questionTone?: 'error';
}) {
  const value = response.kind === 'text' ? response.value : '';
  const graded = result !== null;

  return (
    <div className="space-y-5">
      <QuestionHeader
        prompt={exercise.prompt}
        context={exercise.context}
        infinitive={exercise.infinitive}
      />

      <p
        className={cx(
          'text-center text-lg',
          questionTone === 'error' && 'font-medium text-red-600 line-through decoration-red-400/60 dark:text-red-400',
        )}
      >
        {question}
      </p>
      {note && <p className="-mt-3 text-center text-xs text-muted">{note}</p>}

      <GermanInput
        value={value}
        onChange={(next) => onChange({ kind: 'text', value: next })}
        onSubmit={onSubmit}
        placeholder={placeholder}
        disabled={graded}
        state={graded ? (result.correct ? 'correct' : 'incorrect') : 'neutral'}
        autoFocus
        ariaLabel={exercise.prompt}
      />

      {hintUsed && exercise.hint && !graded && (
        <p className="text-center text-sm text-muted animate-rise">💡 {exercise.hint}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sentence completion                                                  */
/* ------------------------------------------------------------------ */

function SentenceCompletionView({
  exercise,
  response,
  onChange,
  onSubmit,
  result,
  hintUsed,
}: ExerciseViewProps & { exercise: SentenceCompletionExercise }) {
  const value = response.kind === 'text' ? response.value : '';
  const graded = result !== null;

  return (
    <div className="space-y-5">
      <QuestionHeader
        prompt={exercise.prompt}
        context={exercise.context}
        infinitive={exercise.infinitive}
      />

      <p className="text-center text-xl leading-relaxed">
        <span>{exercise.before}</span>
        <span
          className={cx(
            'mx-1 inline-block min-w-24 border-b-2 pb-0.5 font-semibold',
            graded
              ? result.correct
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-red-500 text-red-600 dark:text-red-400'
              : 'border-gold-500',
          )}
        >
          {graded ? exercise.answer : value || ' '}
        </span>
        <span>{exercise.after}</span>
      </p>

      {exercise.translation && (
        <p className="-mt-3 text-center text-sm text-muted italic">{exercise.translation}</p>
      )}

      <GermanInput
        value={value}
        onChange={(next) => onChange({ kind: 'text', value: next })}
        onSubmit={onSubmit}
        placeholder="Fill the gap…"
        disabled={graded}
        state={graded ? (result.correct ? 'correct' : 'incorrect') : 'neutral'}
        autoFocus
        ariaLabel="Fill the gap"
      />

      {hintUsed && exercise.hint && !graded && (
        <p className="text-center text-sm text-muted animate-rise">💡 {exercise.hint}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Matching                                                             */
/* ------------------------------------------------------------------ */

function MatchingView({
  exercise,
  response,
  onChange,
  result,
}: ExerciseViewProps & { exercise: MatchingExercise }) {
  const chosen = response.kind === 'pairs' ? response.value : {};
  const graded = result !== null;

  // The pronoun currently awaiting a form — the first still unmatched.
  const activeLeft = useMemo(
    () => exercise.pairs.find((pair) => !chosen[pair.left])?.left ?? null,
    [exercise.pairs, chosen],
  );

  const usedForms = new Set(Object.values(chosen));

  const assign = (form: string) => {
    if (graded || !activeLeft) return;
    onChange({ kind: 'pairs', value: { ...chosen, [activeLeft]: form } });
  };

  const unassign = (left: string) => {
    if (graded) return;
    const next = { ...chosen };
    delete next[left];
    onChange({ kind: 'pairs', value: next });
  };

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">Matching</div>
        <p className="mt-1 text-sm">{exercise.prompt}</p>
      </div>

      <div className="space-y-2">
        {exercise.pairs.map((pair) => {
          const value = chosen[pair.left];
          const isCorrect = graded && value === pair.right;
          const isWrong = graded && value !== pair.right;

          return (
            <div
              key={pair.left}
              className={cx(
                'flex items-center gap-3 rounded-xl border-2 px-4 py-2.5 transition-colors surface-card',
                isCorrect
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : isWrong
                    ? 'border-red-500 bg-red-500/10'
                    : activeLeft === pair.left
                      ? 'border-gold-500'
                      : 'border-[var(--border-subtle)]',
              )}
            >
              <span className="w-20 shrink-0 font-medium text-muted">{pair.left}</span>
              <span className="text-muted">→</span>
              {value ? (
                <button
                  type="button"
                  onClick={() => unassign(pair.left)}
                  disabled={graded}
                  className="font-semibold disabled:cursor-default"
                >
                  {value}
                </button>
              ) : (
                <span className="text-sm text-muted italic">choose a form…</span>
              )}
              {graded && !isCorrect && (
                <span className="ml-auto text-sm text-emerald-600 dark:text-emerald-400">
                  {pair.right}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {!graded && (
        <div className="flex flex-wrap justify-center gap-2">
          {exercise.shuffledRight.map((form) => (
            <button
              key={form}
              type="button"
              onClick={() => assign(form)}
              disabled={usedForms.has(form)}
              className={cx(
                'rounded-lg border-2 border-[var(--border-subtle)] px-3 py-1.5 text-sm font-medium transition-colors surface-card',
                usedForms.has(form)
                  ? 'opacity-30'
                  : 'hover:border-gold-500 hover:bg-gold-500/10',
              )}
            >
              {form}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sentence reconstruction                                              */
/* ------------------------------------------------------------------ */

function ReconstructionView({
  exercise,
  response,
  onChange,
  result,
}: ExerciseViewProps & { exercise: SentenceReconstructionExercise }) {
  const order = response.kind === 'order' ? response.value : [];
  const graded = result !== null;

  // Tokens can repeat in principle, so track availability by index.
  const remaining = useMemo(() => {
    const counts = new Map<string, number>();
    exercise.tokens.forEach((token) => counts.set(token, (counts.get(token) ?? 0) + 1));
    order.forEach((token) => counts.set(token, (counts.get(token) ?? 0) - 1));
    return counts;
  }, [exercise.tokens, order]);

  const append = (token: string) => {
    if (graded) return;
    onChange({ kind: 'order', value: [...order, token] });
  };

  const removeAt = (position: number) => {
    if (graded) return;
    onChange({ kind: 'order', value: order.filter((_, index) => index !== position) });
  };

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">Word order</div>
        <p className="mt-1 text-sm">{exercise.prompt}</p>
        {exercise.translation && (
          <p className="mt-1 text-sm text-muted italic">{exercise.translation}</p>
        )}
      </div>

      <div
        className={cx(
          'flex min-h-16 flex-wrap items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-3',
          graded
            ? result.correct
              ? 'border-emerald-500 bg-emerald-500/5'
              : 'border-red-500 bg-red-500/5'
            : 'border-[var(--border-subtle)]',
        )}
      >
        {order.length === 0 && (
          <span className="text-sm text-muted italic">Tap the words in the right order</span>
        )}
        {order.map((token, position) => (
          <button
            key={`${token}-${position}`}
            type="button"
            onClick={() => removeAt(position)}
            disabled={graded}
            className="rounded-lg bg-gold-500/15 px-2.5 py-1 font-medium transition-colors hover:bg-gold-500/25 disabled:cursor-default"
          >
            {token}
          </button>
        ))}
      </div>

      {!graded && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {exercise.tokens.map((token, position) => (
            <button
              key={`${token}-${position}`}
              type="button"
              onClick={() => append(token)}
              disabled={(remaining.get(token) ?? 0) <= 0}
              className={cx(
                'rounded-lg border-2 border-[var(--border-subtle)] px-2.5 py-1 font-medium transition-colors surface-card',
                (remaining.get(token) ?? 0) <= 0
                  ? 'opacity-25'
                  : 'hover:border-gold-500 hover:bg-gold-500/10',
              )}
            >
              {token}
            </button>
          ))}
        </div>
      )}

      {graded && !result.correct && (
        <p className="text-center text-sm">
          <span className="text-muted">Correct order: </span>
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            {exercise.correctOrder.join(' ')}.
          </span>
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Feedback                                                             */
/* ------------------------------------------------------------------ */

export function FeedbackPanel({
  result,
  exercise,
  xp,
  multiplier,
  onNext,
  autoFocusNext,
}: {
  result: GradeResult;
  exercise: Exercise;
  xp: number;
  multiplier: number;
  onNext: () => void;
  autoFocusNext: boolean;
}) {
  const nextRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (autoFocusNext) nextRef.current?.focus();
  }, [autoFocusNext]);

  const fatal = result.diagnostics.filter((d) => d.fatal);
  const notes = result.diagnostics.filter((d) => !d.fatal);

  return (
    <div
      className={cx(
        'rounded-2xl border-2 p-4 animate-rise',
        result.correct
          ? 'border-emerald-500/50 bg-emerald-500/10'
          : 'border-red-500/50 bg-red-500/10',
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>
          {result.correct ? (notes.length > 0 ? '👍' : '✅') : '❌'}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">
              {result.correct ? (notes.length > 0 ? 'Accepted' : 'Correct') : 'Not quite'}
            </span>
            {xp > 0 && (
              <Badge tone="gold">
                +{xp} XP{multiplier > 1 && ` · ×${multiplier}`}
              </Badge>
            )}
          </div>

          {!result.correct && (
            <p className="mt-1 text-sm">
              <span className="text-muted">Answer: </span>
              <span className="font-semibold">{result.target}</span>
            </p>
          )}

          {[...fatal, ...notes].map((diagnostic) => (
            <p key={diagnostic.code} className="mt-1 text-sm text-muted">
              {diagnostic.message}
            </p>
          ))}

          <p className="mt-2 text-sm text-muted">{exercise.explanation}</p>
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <Button ref={nextRef} variant="primary" size="sm" onClick={onNext}>
          Continue <span className="text-xs opacity-70">↵</span>
        </Button>
      </div>
    </div>
  );
}
