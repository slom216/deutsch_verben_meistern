import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { StorageWarning } from '@/components/StorageWarning';
import { useGamification } from '@/store/gamificationStore';
import { rankForXp, rankProgress, nextRank } from '@/lib/achievements';
import { useSettings } from '@/store/settingsStore';
import { cx, ProgressBar } from './ui';
import { CelebrationLayer } from './CelebrationLayer';
import logoMark from '@/assets/art/logo-mark.png';
import staircase from '@/assets/art/footer-staircase.webp';
import themeSun from '@/assets/art/theme-sun.png';
import xpStar from '@/assets/art/xp-star.png';

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

/** Lifetime XP, as a small outlined counter beside the rank. */
function XpPill() {
  const xp = useGamification((state) => state.xp);
  return (
    <div
      className="flex h-9 items-center gap-1.5 rounded-full border border-[var(--rule)] px-3 text-sm font-bold tabular-nums"
      title={`${xp.toLocaleString()} XP earned`}
    >
      <img src={xpStar} alt="" width={26} height={25} className="h-[18px] w-auto" />
      {xp.toLocaleString()} XP
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
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--text-strong)] transition-colors hover:text-[var(--headline-accent)]"
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
    >
      {/* The printed sun in light; a moon in ink in dark, like the other DeuLern apps. */}
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M20.5 14.8A8.5 8.5 0 1 1 9.2 3.5a7 7 0 0 0 11.3 11.3Z" strokeLinejoin="round" />
        </svg>
      ) : (
        <img src={themeSun} alt="" width={40} height={40} className="h-8 w-8" />
      )}
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

  // The dashboard is the wide poster page; working screens keep a readable measure.
  const wide = pathname === '/';

  return (
    <div className="relative flex min-h-screen flex-col">
      {/* Hash routing owns the URL fragment, so move focus instead of following #main. */}
      <a
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
        data-print-hidden
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-poster-red focus:px-4 focus:py-2 focus:text-neutral"
      >
        Skip to content
      </a>

      {/* Sticky from `sm` up only: on phones a sticky header plus the on-screen
          keyboard would leave no room for the answer field and Check. */}
      <header className="z-30 bg-[var(--surface)] bg-[image:var(--paper-grain)] sm:sticky sm:top-0">
        <div className="mx-auto flex max-w-[84.5rem] flex-wrap items-center gap-x-6 gap-y-1 px-[clamp(16px,4vw,44px)] py-2">
          <NavLink to="/" className="flex min-h-11 shrink-0 items-center">
            <span aria-hidden className="flex items-center gap-2.5">
              <img src={logoMark} alt="" width={34} height={39} className="h-8 w-auto" />
              <span className="text-[26px] font-semibold tracking-tight">DeuLern</span>
              <span className="ml-3 hidden border-l border-[var(--rule)] py-1 pl-8 text-lg font-bold tracking-tight sm:inline">
                Verben Meister
              </span>
            </span>
            <span className="sr-only">Deutsch Verben Meister</span>
          </NavLink>

          <nav className="order-last w-full lg:order-none lg:mx-auto lg:w-auto" aria-label="Main">
            <ul
              ref={navRef}
              className="flex gap-1 overflow-x-auto max-sm:fade-x-end max-sm:pr-8"
            >
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cx(
                        'relative flex min-h-11 items-center whitespace-nowrap px-3 py-2 text-nav-link transition-colors',
                        "after:absolute after:inset-x-2 after:bottom-1 after:h-0.5 after:content-['']",
                        isActive
                          ? 'font-bold text-[var(--headline-accent)] after:bg-poster-red'
                          : 'text-[var(--text-strong)] hover:text-[var(--headline-accent)]',
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-4 lg:ml-0">
            <div className="hidden sm:block">
              <RankPill />
            </div>
            <XpPill />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className={cx(
          'relative z-10 mx-auto w-full flex-1 outline-none',
          wide
            ? 'max-w-[84.5rem] px-[clamp(16px,4vw,44px)] pb-8 pt-4'
            : 'max-w-5xl px-4 py-6',
        )}
      >
        <StorageWarning />
        <Outlet />
      </main>

      <footer className="relative">
        <div className="mx-auto max-w-[84.5rem] pl-[clamp(16px,4vw,44px)] pr-[calc(clamp(16px,4vw,44px)+120px)] max-lg:pr-[clamp(16px,4vw,44px)]">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--rule)] py-4">
            <a
              href="https://deulern.com"
              className="flex shrink-0 items-center gap-2 border-[var(--rule)] pr-6 text-xl font-semibold tracking-tight sm:border-r"
            >
              <img src={logoMark} alt="" width={34} height={39} className="h-6 w-auto" />
              DeuLern
            </a>
            <p className="text-xs text-muted">
              German verbs from A1 to B1. Everything is stored in this browser only. Built with
              the help of AI, so there may be errors; every one we find gets fixed.
            </p>
          </div>
        </div>
        {/* Decoration, rising out of the sheet's bottom-right corner behind the page. */}
        <img
          src={staircase}
          alt=""
          width={182}
          height={123}
          loading="lazy"
          className="pointer-events-none absolute bottom-0 right-0 max-w-none max-lg:hidden"
          data-print-hidden
        />
      </footer>

      <CelebrationLayer />
    </div>
  );
}
