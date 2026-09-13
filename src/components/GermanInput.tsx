import { forwardRef, useRef, type KeyboardEvent } from 'react';
import { cx } from './ui';

/**
 * Text input for German answers, with a special-character strip.
 *
 * Umlauts and ß are graded strictly by default, so a learner on a keyboard
 * without them needs a way to type them that is not "give up and write ue".
 */

const SPECIAL_CHARACTERS = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'];

export interface GermanInputProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  /** Visual state after grading. */
  state?: 'neutral' | 'correct' | 'incorrect';
  autoFocus?: boolean;
  ariaLabel: string;
}

export const GermanInput = forwardRef<HTMLInputElement, GermanInputProps>(function GermanInput(
  { value, onChange, onSubmit, placeholder, disabled, state = 'neutral', autoFocus, ariaLabel },
  forwardedRef,
) {
  const localRef = useRef<HTMLInputElement | null>(null);

  const setRef = (node: HTMLInputElement | null) => {
    localRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      // Handled here: keep the page-level Enter handler from also advancing.
      event.preventDefault();
      event.stopPropagation();
      onSubmit();
    }
  };

  /** Insert at the caret so the strip works mid-word, not just at the end. */
  const insert = (character: string) => {
    const input = localRef.current;
    if (!input) {
      onChange(value + character);
      return;
    }
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? value.length;
    const next = value.slice(0, start) + character + value.slice(end);
    onChange(next);
    // Refocus straight away so keys typed right after the click land in the
    // input; the caret can only be placed once React has rendered the value.
    input.focus();
    requestAnimationFrame(() => {
      input.setSelectionRange(start + character.length, start + character.length);
    });
  };

  const stateClasses = {
    neutral: '',
    correct: 'border-emerald-500! text-emerald-700 dark:text-emerald-300',
    incorrect: 'border-red-500! text-red-700 dark:text-red-300',
  }[state];

  return (
    <div>
      <input
        ref={setRef}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        lang="de"
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className={cx(
          'answer-input w-full rounded-xl px-4 py-3 text-center text-xl font-medium tracking-tight',
          'disabled:opacity-80',
          stateClasses,
        )}
      />

      {!disabled && (
        <div className="mt-2 flex flex-wrap justify-center gap-1">
          {SPECIAL_CHARACTERS.map((character) => (
            <button
              key={character}
              type="button"
              // Keep focus (and the caret) in the input on mouse clicks.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insert(character)}
              className="h-11 min-w-11 rounded-lg bg-ink-100 text-base font-semibold transition-colors hover:bg-ink-200 dark:bg-ink-800 dark:hover:bg-ink-700"
              aria-label={`Insert ${character}`}
            >
              {character}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
