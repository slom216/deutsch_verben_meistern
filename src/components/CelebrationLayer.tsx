import { useEffect, useState } from 'react';
import { useGamification } from '@/store/gamificationStore';
import { ACHIEVEMENTS_BY_ID, RANKS, TIER_STYLES } from '@/lib/achievements';
import { cx } from './ui';

/**
 * Celebration toasts for unlocked badges and rank-ups.
 *
 * The stores queue events rather than rendering them, so a celebration
 * survives navigation — finishing a session and immediately jumping to the
 * progress page still shows the badge you just earned.
 */

interface Toast {
  key: string;
  icon: string;
  title: string;
  subtitle: string;
  accent: string;
}

const TOAST_MS = 4200;

export function CelebrationLayer() {
  const pendingUnlocks = useGamification((state) => state.pendingUnlocks);
  const pendingLevelUp = useGamification((state) => state.pendingLevelUp);
  const consumeUnlocks = useGamification((state) => state.consumeUnlocks);
  const consumeLevelUp = useGamification((state) => state.consumeLevelUp);

  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (pendingUnlocks.length === 0) return;
    const ids = consumeUnlocks();
    const fresh = ids.flatMap<Toast>((id) => {
      const achievement = ACHIEVEMENTS_BY_ID[id];
      if (!achievement) return [];
      return [
        {
          key: `badge-${id}-${Date.now()}`,
          icon: achievement.icon,
          title: achievement.name,
          subtitle: achievement.description,
          accent: TIER_STYLES[achievement.tier].text,
        },
      ];
    });
    if (fresh.length > 0) setToasts((current) => [...current, ...fresh]);
  }, [pendingUnlocks, consumeUnlocks]);

  useEffect(() => {
    if (pendingLevelUp === null) return;
    const level = consumeLevelUp();
    const rank = RANKS.find((r) => r.level === level);
    if (!rank) return;
    setToasts((current) => [
      ...current,
      {
        key: `rank-${level}-${Date.now()}`,
        icon: '🎉',
        title: `Level ${rank.level} — ${rank.name}`,
        subtitle: `You reached the rank of ${rank.english}.`,
        accent: 'text-gold-600 dark:text-gold-400',
      },
    ]);
  }, [pendingLevelUp, consumeLevelUp]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = window.setTimeout(() => setToasts((current) => current.slice(1)), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      role="status"
      aria-live="polite"
    >
      {toasts.slice(0, 3).map((toast) => (
        <div
          key={toast.key}
          className="animate-pop surface-card flex w-full max-w-sm items-center gap-3 rounded-2xl px-4 py-3 shadow-lg"
        >
          <span className="text-2xl" aria-hidden>
            {toast.icon}
          </span>
          <span className="min-w-0">
            <span className={cx('block text-sm font-semibold', toast.accent)}>{toast.title}</span>
            <span className="block truncate text-xs text-muted">{toast.subtitle}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
