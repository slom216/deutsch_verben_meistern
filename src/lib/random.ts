/**
 * Small random helpers. A seedable generator is used so a practice session can
 * be reproduced exactly in tests and bug reports.
 */

export interface Rng {
  next(): number;
  pick<T>(items: readonly T[]): T;
  sample<T>(items: readonly T[], count: number): T[];
  shuffle<T>(items: readonly T[]): T[];
  bool(probability?: number): boolean;
  int(minInclusive: number, maxExclusive: number): number;
}

/** mulberry32 — small, fast, good enough for shuffling exercise options. */
export function createRng(seed: number = Date.now()): Rng {
  let state = seed >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const shuffle = <T,>(items: readonly T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  return {
    next,
    shuffle,
    pick: <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
    sample: <T,>(items: readonly T[], count: number): T[] => shuffle(items).slice(0, count),
    bool: (probability = 0.5) => next() < probability,
    int: (minInclusive: number, maxExclusive: number) =>
      minInclusive + Math.floor(next() * (maxExclusive - minInclusive)),
  };
}

/** Deterministic non-negative hash, for deriving stable per-item seeds. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
