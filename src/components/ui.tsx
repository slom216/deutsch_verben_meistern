import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, Ref } from 'react';

/** Small shared primitives. Deliberately plain — no component library. */

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

/* design.md: flat fills, teal text, no shadows; emphasis comes from colour. */
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-tertiary text-primary hover:bg-gold-600 active:bg-gold-600 disabled:bg-ink-200 dark:disabled:bg-ink-700 disabled:text-ink-500',
  secondary:
    'surface-card hover:bg-primary-10 dark:hover:bg-ink-800 disabled:opacity-50',
  ghost: 'hover:bg-primary-10 dark:hover:bg-ink-800 disabled:opacity-50',
  danger: 'bg-error text-neutral hover:bg-red-700 active:bg-red-700 disabled:opacity-50',
};

/* Pill actions. `lg` is design.md's button-primary (56px), `md` its
   button-secondary (48px), `sm` a compact variant of the same shape. */
const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'px-4 py-1.5 text-label-md rounded-full',
  md: 'h-12 px-6 py-3 text-button rounded-full',
  lg: 'h-14 px-7 py-3.5 text-button rounded-full',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** React 19 passes refs to function components as an ordinary prop. */
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 transition-colors',
        'disabled:cursor-not-allowed',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx('surface-card rounded-md', className)} />;
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'gold' | 'green' | 'red' | 'blue' | 'violet';
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
    gold: 'bg-tertiary text-primary dark:bg-gold-500 dark:text-primary',
    green: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    red: 'bg-red-500/15 text-red-700 dark:text-red-300',
    blue: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    violet: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  };
  return (
    <span
      className={cx(
        /* design.md chip: pill, compact 6px/12px padding, label-sm. */
        'inline-flex items-center rounded-full px-3 py-1.5 text-label-sm',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ProgressBar({
  value,
  tone = 'gold',
  className,
  label,
}: {
  /** 0–1. */
  value: number;
  tone?: 'gold' | 'green' | 'blue';
  className?: string;
  label?: string;
}) {
  const percent = Math.max(0, Math.min(1, value)) * 100;
  const tones: Record<string, string> = {
    gold: 'bg-gold-500',
    green: 'bg-emerald-500',
    blue: 'bg-sky-500',
  };
  return (
    <div
      className={cx('h-2 w-full overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800', className)}
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cx('h-full rounded-full transition-[width] duration-500', tones[tone])}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={cx(
        'flex items-start gap-3 py-2 cursor-pointer select-none',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cx(
          'mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors relative',
          checked ? 'bg-gold-500' : 'bg-ink-300 dark:bg-ink-700',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-4.5' : 'translate-x-0.5',
          )}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-5">{label}</span>
        {description && <span className="block text-xs text-muted mt-0.5">{description}</span>}
      </span>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (next: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex rounded-full bg-primary-10 dark:bg-ink-800 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cx(
            'rounded-full font-medium transition-colors',
            size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm',
            value === option.value
              ? 'bg-neutral text-primary dark:bg-ink-950 dark:text-ink-50'
              : 'text-muted hover:text-[var(--text-strong)]',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'gold' | 'green' | 'red';
}) {
  const tones: Record<string, string> = {
    gold: 'text-gold-600 dark:text-gold-400',
    green: 'text-emerald-600 dark:text-emerald-400',
    red: 'text-red-600 dark:text-red-400',
  };
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={cx('text-2xl font-semibold tabular-nums mt-0.5', tone && tones[tone])}>
        {value}
      </div>
      {hint && <div className="text-xs text-muted mt-0.5">{hint}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-14 px-6">
      <div className="text-4xl mb-3" aria-hidden>
        {icon}
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted mt-1 max-w-md mx-auto">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted text-sm">
      <span
        className="h-4 w-4 rounded-full border-2 border-ink-300 border-t-gold-500 animate-spin"
        aria-hidden
      />
      {label}
    </div>
  );
}
