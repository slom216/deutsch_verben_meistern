import { describe, expect, it } from 'vitest';
import {
  createCard,
  DAY,
  isDue,
  makeCardId,
  MASTERY_INTERVAL,
  MIN_EASE,
  parseCardId,
  qualityFrom,
  reviewCard,
  urgency,
  type CardRecord,
} from './srs';

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

/** Drive a card through repeated successful reviews. */
function drill(card: CardRecord, times: number, quality: 3 | 4 | 5 = 4): CardRecord {
  let current = card;
  let clock = NOW;
  for (let i = 0; i < times; i += 1) {
    clock = current.due;
    current = reviewCard(current, quality, clock);
  }
  return current;
}

describe('card ids', () => {
  it('round-trips through parse', () => {
    const id = makeCardId('a1v-001-sein', 'present', 'du');
    expect(parseCardId(id)).toEqual({
      verbId: 'a1v-001-sein',
      category: 'present',
      slot: 'du',
    });
  });

  it('defaults property categories to the no-slot sentinel', () => {
    expect(makeCardId('a1v-001-sein', 'auxiliary')).toBe('a1v-001-sein|auxiliary|_');
  });
});

describe('qualityFrom', () => {
  it('rewards fast, unaided correct answers most', () => {
    expect(qualityFrom('correct', { fast: true })).toBe(5);
    expect(qualityFrom('correct')).toBe(4);
    expect(qualityFrom('correct', { hintUsed: true })).toBe(3);
  });

  it('ranks failures below the passing threshold', () => {
    expect(qualityFrom('near-miss')).toBeLessThan(3);
    expect(qualityFrom('incorrect')).toBeLessThan(3);
    expect(qualityFrom('empty')).toBe(0);
  });
});

describe('reviewCard', () => {
  it('does not mutate the card it is given', () => {
    const card = createCard('x', NOW);
    const snapshot = { ...card };
    reviewCard(card, 5, NOW);
    expect(card).toEqual(snapshot);
  });

  it('walks a new card through the learning steps', () => {
    const card = createCard('x', NOW);
    const first = reviewCard(card, 4, NOW);
    expect(first.state).toBe('learning');
    expect(first.due - NOW).toBeLessThan(DAY);

    const second = reviewCard(first, 4, first.due);
    expect(second.state).toBe('review');
    expect(second.interval).toBeGreaterThanOrEqual(DAY);
  });

  it('lets a confident first answer skip the learning steps', () => {
    const card = reviewCard(createCard('x', NOW), 5, NOW);
    expect(card.state).toBe('review');
    expect(card.interval).toBeGreaterThan(DAY);
  });

  it('grows the interval on each successful review', () => {
    const card = drill(createCard('x', NOW), 5);
    expect(card.interval).toBeGreaterThan(DAY);
    expect(card.repetitions).toBe(5);
  });

  it('reaches the mastered state after sustained success', () => {
    const card = drill(createCard('x', NOW), 12, 5);
    expect(card.interval).toBeGreaterThanOrEqual(MASTERY_INTERVAL);
    expect(card.state).toBe('mastered');
  });

  it('sends a failed review back to learning and counts a lapse', () => {
    const mature = drill(createCard('x', NOW), 5);
    expect(mature.state).toBe('review');

    const failed = reviewCard(mature, 1, mature.due);
    expect(failed.state).toBe('lapsed');
    expect(failed.lapses).toBe(1);
    expect(failed.repetitions).toBe(0);
    expect(failed.interval).toBeLessThan(DAY);
    expect(failed.ease).toBeLessThan(mature.ease);
  });

  it('never drops ease below the floor', () => {
    let card = createCard('x', NOW);
    for (let i = 0; i < 40; i += 1) card = reviewCard(card, 0, NOW + i * 1000);
    expect(card.ease).toBeGreaterThanOrEqual(MIN_EASE);
  });

  it('tracks streaks and best streak', () => {
    let card = drill(createCard('x', NOW), 3);
    expect(card.streak).toBe(3);
    expect(card.bestStreak).toBe(3);

    card = reviewCard(card, 1, card.due);
    expect(card.streak).toBe(0);
    expect(card.bestStreak).toBe(3);
  });

  it('counts every review in seen, and passes in correct', () => {
    let card = createCard('x', NOW);
    card = reviewCard(card, 4, NOW);
    card = reviewCard(card, 1, NOW + 1000);
    expect(card.seen).toBe(2);
    expect(card.correct).toBe(1);
  });
});

describe('isDue and urgency', () => {
  it('treats a new card as due immediately', () => {
    expect(isDue(createCard('x', NOW), NOW)).toBe(true);
  });

  it('is not due before its scheduled time', () => {
    const card = drill(createCard('x', NOW), 4);
    expect(isDue(card, card.due - 1000)).toBe(false);
    expect(isDue(card, card.due)).toBe(true);
  });

  it('ranks lapsed cards above healthy ones', () => {
    const healthy = drill(createCard('a', NOW), 5);
    const lapsed = reviewCard(drill(createCard('b', NOW), 5), 1, NOW + DAY);
    expect(urgency(lapsed, lapsed.due)).toBeGreaterThan(urgency(healthy, healthy.due));
  });

  it('gives an unseen card a nonzero urgency so new material is scheduled', () => {
    expect(urgency(createCard('x', NOW), NOW)).toBeGreaterThan(0);
  });

  it('gives a card that is not yet due no urgency', () => {
    const card = drill(createCard('x', NOW), 4);
    expect(urgency(card, card.due - DAY)).toBe(0);
  });
});
