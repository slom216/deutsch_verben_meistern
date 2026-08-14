/** Local-time day keys. Streaks are a human, calendar-local idea. */

export function dayKey(timestamp: number = Date.now()): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function dayKeyOffset(days: number, from: number = Date.now()): string {
  const date = new Date(from);
  date.setDate(date.getDate() + days);
  return dayKey(date.getTime());
}

/** Whole calendar days between two day keys. */
export function daysBetween(earlier: string, later: string): number {
  const a = new Date(`${earlier}T00:00:00`);
  const b = new Date(`${later}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** The last `count` day keys, oldest first, ending today. */
export function recentDays(count: number, from: number = Date.now()): string[] {
  return Array.from({ length: count }, (_, index) => dayKeyOffset(index - count + 1, from));
}

export function formatDayShort(key: string): string {
  const date = new Date(`${key}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
