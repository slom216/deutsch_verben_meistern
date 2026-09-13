import { useState } from 'react';
import { useStorageHealth, type StorageHealth } from '@/store/storage';

const MESSAGES: Record<Exclude<StorageHealth, 'ok'>, string> = {
  blocked:
    'This browser is blocking site storage, so your progress will be lost when you close the tab.',
  full: 'Browser storage is full, so new progress is not being saved.',
  unreadable:
    'Some saved data could not be read and was reset. Your practice continues from what could be recovered.',
};

/** Tells the learner when progress is not being kept, instead of failing silently. */
export function StorageWarning() {
  const health = useStorageHealth((state) => state.health);
  const [dismissed, setDismissed] = useState<StorageHealth | null>(null);

  if (health === 'ok' || dismissed === health) return null;

  return (
    <div
      role="status"
      className="mb-4 flex items-start justify-between gap-3 rounded-md bg-red-500/15 px-4 py-3 text-sm text-red-700 dark:text-red-300"
    >
      <span>⚠️ {MESSAGES[health]}</span>
      <button
        type="button"
        onClick={() => setDismissed(health)}
        className="shrink-0 hover:underline"
        aria-label="Dismiss storage warning"
      >
        Dismiss
      </button>
    </div>
  );
}
