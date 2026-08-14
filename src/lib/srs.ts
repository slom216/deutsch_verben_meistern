import type { FormCategory } from '@/types/formCategory';
import type { Person } from '@/types/verb';

/**
 * Spaced repetition.
 *
 * The scheduled unit is not a verb but a single *form* of a verb: `gehen` in
 * the du-slot of the present tense is tracked separately from `gehen` in the
 * perfect. That is the granularity at which learners actually have gaps, and
 * it lets weak forms come back sooner without dragging the whole verb with
 * them.
 *
 * The algorithm is SM-2 with two adjustments: short intra-day learning steps
 * for brand-new material, and a damped ease penalty so one bad session does
 * not permanently sour a card.
 */

export const MINUTE = 60_000;
export const DAY = 86_400_000;

/** Property categories have no person slot; they use this sentinel. */
export const NO_SLOT = '_';

export type CardSlot = Person | 'du' | 'ihr' | 'Sie' | typeof NO_SLOT;

export type CardId = string;

export function makeCardId(verbId: string, category: FormCategory, slot: string = NO_SLOT): CardId {
  return `${verbId}|${category}|${slot}`;
}

export function parseCardId(id: CardId): {
  verbId: string;
  category: FormCategory;
  slot: string;
} | null {
  const parts = id.split('|');
  if (parts.length !== 3) return null;
  return { verbId: parts[0], category: parts[1] as FormCategory, slot: parts[2] };
}

export type CardState = 'new' | 'learning' | 'review' | 'lapsed' | 'mastered';

export interface CardRecord {
  id: CardId;
  state: CardState;
  /** Consecutive successful reviews since the last lapse. */
  repetitions: number;
  /** Current scheduling interval in milliseconds. */
  interval: number;
  /** SM-2 ease factor. */
  ease: number;
  /** Epoch ms when this card next becomes due. */
  due: number;
  lastReviewed: number | null;
  /** Index into LEARNING_STEPS while the card is still in the learning phase. */
  step: number;
  seen: number;
  correct: number;
  lapses: number;
  /** Longest run of correct answers ever achieved on this card. */
  bestStreak: number;
  streak: number;
}

/** Answer quality, mapped from the grader's verdict. */
export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;

/** Intra-day steps a new or lapsed card walks through before graduating. */
export const LEARNING_STEPS = [1 * MINUTE, 10 * MINUTE];

export const MIN_EASE = 1.3;
export const DEFAULT_EASE = 2.5;
const GRADUATING_INTERVAL = DAY;
const EASY_INTERVAL = 4 * DAY;

/** A card counts as mastered once it survives this long between reviews. */
export const MASTERY_INTERVAL = 21 * DAY;
export const MASTERY_MIN_REPETITIONS = 4;

export function createCard(id: CardId, now: number = Date.now()): CardRecord {
  return {
    id,
    state: 'new',
    repetitions: 0,
    interval: 0,
    ease: DEFAULT_EASE,
    due: now,
    lastReviewed: null,
    step: 0,
    seen: 0,
    correct: 0,
    lapses: 0,
    bestStreak: 0,
    streak: 0,
  };
}

/** Map a grading outcome plus response speed onto an SM-2 quality score. */
export function qualityFrom(
  verdict: 'correct' | 'accepted-with-note' | 'near-miss' | 'incorrect' | 'empty',
  options: { hintUsed?: boolean; fast?: boolean } = {},
): ReviewQuality {
  switch (verdict) {
    case 'correct':
      if (options.hintUsed) return 3;
      return options.fast ? 5 : 4;
    case 'accepted-with-note':
      return 3;
    case 'near-miss':
      return 2;
    case 'incorrect':
      return 1;
    case 'empty':
    default:
      return 0;
  }
}

function clampEase(ease: number): number {
  return Math.max(MIN_EASE, Math.min(3.2, Number(ease.toFixed(3))));
}

/**
 * Advance a card after a review.
 * Pure: returns a new record and never mutates its input.
 */
export function reviewCard(
  card: CardRecord,
  quality: ReviewQuality,
  now: number = Date.now(),
): CardRecord {
  const passed = quality >= 3;
  const next: CardRecord = {
    ...card,
    seen: card.seen + 1,
    correct: card.correct + (passed ? 1 : 0),
    lastReviewed: now,
    streak: passed ? card.streak + 1 : 0,
  };
  next.bestStreak = Math.max(card.bestStreak, next.streak);

  if (!passed) {
    // A failure drops the card back into learning and shortens future gaps,
    // but the ease floor keeps it from collapsing to daily drilling forever.
    next.repetitions = 0;
    next.step = 0;
    next.lapses = card.lapses + (card.state === 'review' || card.state === 'mastered' ? 1 : 0);
    next.ease = clampEase(card.ease - (quality === 0 ? 0.3 : 0.2));
    next.interval = LEARNING_STEPS[0];
    next.due = now + LEARNING_STEPS[0];
    next.state = card.state === 'new' ? 'learning' : 'lapsed';
    return next;
  }

  // SM-2 ease update, applied on every successful review.
  next.ease = clampEase(card.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  next.repetitions = card.repetitions + 1;

  const inLearning = card.state === 'new' || card.state === 'learning' || card.state === 'lapsed';

  if (inLearning) {
    const nextStep = card.step + 1;
    if (quality === 5 && card.state === 'new') {
      // A confident first answer skips the drill steps entirely.
      next.step = LEARNING_STEPS.length;
      next.interval = EASY_INTERVAL;
      next.due = now + EASY_INTERVAL;
      next.state = 'review';
      return next;
    }
    if (nextStep < LEARNING_STEPS.length) {
      next.step = nextStep;
      next.interval = LEARNING_STEPS[nextStep];
      next.due = now + LEARNING_STEPS[nextStep];
      next.state = 'learning';
      return next;
    }
    next.step = LEARNING_STEPS.length;
    next.interval = GRADUATING_INTERVAL;
    next.due = now + GRADUATING_INTERVAL;
    next.state = 'review';
    return next;
  }

  // Graduated card: grow the interval by the ease factor.
  const base = Math.max(card.interval, GRADUATING_INTERVAL);
  const multiplier = quality === 3 ? 1.2 : next.ease;
  const grown = Math.round(base * multiplier);
  next.interval = Math.min(grown, 365 * DAY);
  next.due = now + next.interval;
  next.state =
    next.interval >= MASTERY_INTERVAL && next.repetitions >= MASTERY_MIN_REPETITIONS
      ? 'mastered'
      : 'review';

  return next;
}

export function isDue(card: CardRecord, now: number = Date.now()): boolean {
  return card.due <= now;
}

export function accuracy(card: CardRecord): number {
  return card.seen === 0 ? 0 : card.correct / card.seen;
}

/**
 * How badly this card needs attention, for ordering a practice queue.
 * Higher is more urgent. Overdue cards outrank merely due ones, failures
 * outrank successes, and unseen cards sit in the middle so a session mixes
 * revision with new material.
 */
export function urgency(card: CardRecord, now: number = Date.now()): number {
  if (card.state === 'new') return 50;

  const overdueBy = now - card.due;
  if (overdueBy < 0) return 0;

  const overdueRatio = card.interval > 0 ? overdueBy / card.interval : 1;
  const accuracyPenalty = (1 - accuracy(card)) * 40;
  const lapsePenalty = Math.min(card.lapses * 8, 40);
  const statePriority = card.state === 'lapsed' ? 60 : card.state === 'learning' ? 55 : 30;

  return statePriority + Math.min(overdueRatio * 30, 60) + accuracyPenalty + lapsePenalty;
}

/** Human-readable "next review in ..." text. */
export function formatInterval(ms: number): string {
  if (ms < MINUTE) return 'in under a minute';
  if (ms < 60 * MINUTE) return `in ${Math.round(ms / MINUTE)} min`;
  if (ms < DAY) return `in ${Math.round(ms / (60 * MINUTE))} h`;
  const days = Math.round(ms / DAY);
  if (days < 30) return `in ${days} day${days === 1 ? '' : 's'}`;
  const months = Math.round(days / 30);
  return `in ${months} month${months === 1 ? '' : 's'}`;
}
