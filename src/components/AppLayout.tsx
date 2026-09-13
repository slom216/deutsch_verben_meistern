import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { StorageWarning } from '@/components/StorageWarning';
import { useGamification, effectiveStreak } from '@/store/gamificationStore';
import { rankForXp, rankProgress, nextRank } from '@/lib/achievements';
import { useProgress } from '@/store/progressStore';
import { dayKey } from '@/lib/dates';
import { useSettings } from '@/store/settingsStore';
import { cx, ProgressBar } from './ui';
import { CelebrationLayer } from './CelebrationLayer';

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: '🏠', end: true },
  { to: '/practice', label: 'Practice', icon: '🎯' },
  { to: '/library', label: 'Verbs', icon: '📖' },
  { to: '/progress', label: 'Progress', icon: '📈' },
  { to: '/achievements', label: 'Badges', icon: '🏅' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

function RankPill() {
  const xp = useGamification((state) => state.xp);
  const rank = rankForXp(xp);
  const next = nextRank(xp);

  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold truncate">{rank.name}</span>
        <span className="text-xs text-muted tabular-nums">Lv {rank.level}</span>
      </div>
      <ProgressBar
        value={rankProgress(xp)}
        className="mt-1 h-1.5 w-28"
        label={`Rank progress towards ${next?.name ?? 'the highest rank'}`}
      />
    </div>
  );
}

function StreakPill() {
  const streak = useGamification(effectiveStreak);
  const practisedToday = useGamification((state) => state.lastPracticeDay === dayKey());

  return (
    <div
      className={cx(
        'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums',
        streak > 0 && practisedToday
          ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
          : 'bg-ink-100 dark:bg-ink-800 text-muted',
      )}
      title={
        practisedToday
          ? `${streak}-day streak — today is done`
          : streak > 0
            ? `${streak}-day streak — practise today to keep it`
            : 'No active streak'
      }
    >
      <span aria-hidden>{streak > 0 && practisedToday ? '🔥' : '🕯️'}</span>
      {streak}
    </div>
  );
}

function DailyGoalRing() {
  const goal = useSettings((state) => state.dailyGoalXp);
  const daily = useProgress((state) => state.daily);
  const today = daily[dayKey()];
  const earned = today?.xp ?? 0;
  const ratio = Math.min(1, goal === 0 ? 1 : earned / goal);
  const met = earned >= goal;

  const radius = 13;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      className="relative h-9 w-9 shrink-0"
      title={`Daily goal: ${earned} / ${goal} XP`}
      aria-label={`Daily goal ${earned} of ${goal} XP`}
    >
      <svg viewBox="0 0 32 32" className="h-9 w-9 -rotate-90">
        <circle
          cx="16"
          cy="16"
          r={radius}
          fill="none"
          strokeWidth="3.5"
          className="stroke-ink-200 dark:stroke-ink-800"
        />
        <circle
          cx="16"
          cy="16"
          r={radius}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          className={met ? 'stroke-emerald-500' : 'stroke-gold-500'}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[10px] font-bold">
        {met ? '✓' : Math.round(ratio * 100)}
      </span>
    </div>
  );
}

function ThemeToggle() {
  const theme = useSettings((state) => state.theme);
  const setTheme = useSettings((state) => state.setTheme);
  const next = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-base transition-colors hover:bg-primary-10 dark:hover:bg-ink-800"
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
    >
      <span aria-hidden>{theme === 'dark' ? '☀️' : '🌙'}</span>
    </button>
  );
}

export function AppLayout() {
  const { pathname } = useLocation();
  const navRef = useRef<HTMLUListElement | null>(null);

  // On phones the pill row scrolls sideways; keep the current page's pill visible.
  useEffect(() => {
    navRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hash routing owns the URL fragment, so move focus instead of following #main. */}
      <a
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
        data-print-hidden
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-tertiary focus:px-4 focus:py-2 focus:text-primary"
      >
        Skip to content
      </a>

      {/* Sticky from `sm` up only: on phones a sticky header plus the on-screen
          keyboard would leave no room for the answer field and Check. */}
      <header className="z-30 border-b border-[var(--border-subtle)] bg-[var(--surface)]/85 backdrop-blur sm:sticky sm:top-0">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-1 sm:py-2.5">
          <NavLink to="/" className="flex min-h-11 shrink-0 items-center gap-2">
            <span aria-hidden className="font-serif text-base font-semibold tracking-tight sm:hidden">
              🇩🇪 DVM
            </span>
            <span className="sr-only font-serif text-base font-semibold tracking-tight sm:not-sr-only">
              Deutsch Verben Meister
            </span>
          </NavLink>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:block">
              <RankPill />
            </div>
            <StreakPill />
            <DailyGoalRing />
            <ThemeToggle />
          </div>
        </div>

        <nav className="mx-auto max-w-5xl px-2">
          <ul
            ref={navRef}
            className="flex gap-0.5 overflow-x-auto pb-1 max-sm:fade-x-end max-sm:pr-8"
          >
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cx(
                      'flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-nav-link transition-colors',
                      isActive
                        ? 'bg-tertiary text-primary'
                        : 'text-muted hover:bg-primary-10 dark:hover:bg-ink-800',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 outline-none">
        <StorageWarning />
        <Outlet />
      </main>

      <footer className="border-t border-[var(--border-subtle)] py-4">
        <p className="mx-auto max-w-5xl px-4 text-xs text-muted">
          German verbs from A1 to B1. Everything is stored in this browser only. Built with the
          help of AI, so there may be errors; every one we find gets fixed.
        </p>
      </footer>

      <CelebrationLayer />
    </div>
  );
}
