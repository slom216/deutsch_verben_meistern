import { create } from 'zustand';
import type { PersistStorage, StorageValue } from 'zustand/middleware';

/**
 * localStorage plumbing shared by the persisted stores.
 *
 * Storage is the one part of the app the learner's browser controls, so every
 * access here is defensive: a blocked, full or corrupted store degrades to an
 * in-memory session plus a visible warning, never to a crash.
 */

export type StorageHealth = 'ok' | 'unreadable' | 'full' | 'blocked';

/** Worse problems win: a blocked store matters more than one unreadable key. */
const SEVERITY: StorageHealth[] = ['ok', 'unreadable', 'full', 'blocked'];

function probe(): StorageHealth {
  try {
    localStorage.setItem('dvm.probe', '1');
    localStorage.removeItem('dvm.probe');
    return 'ok';
  } catch {
    return 'blocked';
  }
}

export const useStorageHealth = create<{ health: StorageHealth }>(() => ({ health: probe() }));

export function flagStorage(health: StorageHealth) {
  const current = useStorageHealth.getState().health;
  if (SEVERITY.indexOf(health) > SEVERITY.indexOf(current)) useStorageHealth.setState({ health });
}

/** JSON over localStorage that reports failures instead of throwing them. */
export function safeStorage<S>(): PersistStorage<S> {
  return {
    getItem: (name) => {
      let raw: string | null;
      try {
        raw = localStorage.getItem(name);
      } catch {
        flagStorage('blocked');
        return null;
      }
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as StorageValue<S>;
      } catch {
        // Keep the unreadable text so it can still be recovered by hand.
        try {
          localStorage.setItem(`${name}.corrupt`, raw);
        } catch {
          /* nothing more we can do */
        }
        flagStorage('unreadable');
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        localStorage.setItem(name, JSON.stringify(value));
      } catch (error) {
        flagStorage(error instanceof DOMException && error.name === 'QuotaExceededError' ? 'full' : 'blocked');
      }
    },
    removeItem: (name) => {
      try {
        localStorage.removeItem(name);
      } catch {
        /* blocked storage has nothing to remove */
      }
    },
  };
}

/** Another tab wrote this store's key: reload it instead of overwriting it later. */
export function syncAcrossTabs(store: {
  persist: { rehydrate: () => unknown; getOptions: () => { name?: string } };
}) {
  if (typeof window === 'undefined') return;
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === store.persist.getOptions().name) {
      void store.persist.rehydrate();
    }
  });
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Keep only the object-valued entries of a saved map, e.g. `daily` or `mistakes`. */
export function recordEntries<T>(value: Record<string, unknown>): Record<string, T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => isRecord(entry))) as Record<
    string,
    T
  >;
}

function sameShape(value: unknown, fallback: unknown): boolean {
  if (typeof fallback === 'number') return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  if (Array.isArray(fallback)) return Array.isArray(value);
  if (isRecord(fallback)) return isRecord(value);
  return typeof value === typeof fallback;
}

/**
 * Rebuild saved state field by field: a field with the default's shape is
 * kept, anything else falls back to the default and flags the data as
 * unreadable. Records with default keys are checked one level deeper; empty
 * default records (id-keyed maps) are taken as they are.
 */
export function sanitize<T extends object>(saved: unknown, defaults: T): T {
  if (saved === undefined || saved === null) return { ...defaults };
  if (!isRecord(saved)) {
    flagStorage('unreadable');
    return { ...defaults };
  }
  const result = { ...defaults } as Record<string, unknown>;
  for (const [key, fallback] of Object.entries(defaults)) {
    if (!(key in saved)) continue;
    const value = saved[key];
    if (!sameShape(value, fallback)) {
      flagStorage('unreadable');
    } else if (isRecord(fallback) && Object.keys(fallback).length > 0) {
      result[key] = sanitize(value, fallback);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}
