// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createCard, reviewCard, type CardRecord } from '@/lib/srs';
import { effectiveStreak, useGamification } from './gamificationStore';
import { encodeCards, useProgress } from './progressStore';
import { useSettings } from './settingsStore';
import { useStorageHealth } from './storage';

beforeEach(() => {
  localStorage.clear();
  useProgress.getState().resetProgress();
  useGamification.getState().resetGamification();
  useSettings.getState().resetToDefaults();
  useStorageHealth.setState({ health: 'ok' });
});

const save = (key: string, state: unknown, version: number) =>
  localStorage.setItem(key, JSON.stringify({ state, version }));

describe('gamification', () => {
  it('keeps the streak when the local date moves back', () => {
    const { registerPractice } = useGamification.getState();
    const day = (d: number) => new Date(2026, 8, d, 12).getTime();
    [13, 14, 15, 16].forEach((d) => registerPractice(day(d)));
    expect(useGamification.getState().dailyStreak).toBe(4);

    registerPractice(day(15));
    const state = useGamification.getState();
    expect(state.dailyStreak).toBe(4);
    expect(state.lastPracticeDay).toBe('2026-09-16');
    expect(effectiveStreak(state, day(15))).toBe(4);
  });

  it('never lowers a pending level-up that has not been celebrated', () => {
    const { awardXp } = useGamification.getState();
    awardXp(900); // level 3
    awardXp(10);
    expect(useGamification.getState().pendingLevelUp).toBe(3);
  });

  it('falls back to defaults for malformed saved data', async () => {
    save('dvm.gamification.v1', { goalDays: null, xp: 'lots', lastPracticeDay: 7, unlocked: [] }, 1);
    await useGamification.persist.rehydrate();
    const state = useGamification.getState();
    expect(state.goalDays).toEqual([]);
    expect(state.xp).toBe(0);
    expect(state.lastPracticeDay).toBeNull();
    expect(state.unlocked).toEqual({});
  });
});

describe('progress persistence', () => {
  it('falls back to defaults for malformed saved data', async () => {
    save('dvm.progress.v1', { cards: null, daily: null, mistakes: { x: null }, totalAnswered: -3 }, 2);
    await useProgress.persist.rehydrate();
    const state = useProgress.getState();
    expect(state.cards).toEqual({});
    expect(state.daily).toEqual({});
    expect(state.mistakes).toEqual({});
    expect(state.totalAnswered).toBe(0);
    expect(useStorageHealth.getState().health).toBe('unreadable');
  });

  it('backs up invalid JSON and flags it', async () => {
    localStorage.setItem('dvm.progress.v1', '{not json');
    await useProgress.persist.rehydrate();
    expect(localStorage.getItem('dvm.progress.v1.corrupt')).toBe('{not json');
    expect(useStorageHealth.getState().health).toBe('unreadable');
  });

  it('migrates v1 card objects to the compact v2 format', async () => {
    const t = 1_789_000_000_000;
    const card: CardRecord = reviewCard(reviewCard(createCard('a1v-001-sein|present|du', t), 4, t), 4, t + 60_000);
    save('dvm.progress.v1', { cards: { [card.id]: card }, totalAnswered: 2, daily: {}, mistakes: {} }, 1);

    await useProgress.persist.rehydrate();
    expect(useProgress.getState().cards[card.id]).toEqual(card);
    expect(useProgress.getState().totalAnswered).toBe(2);

    const stored = JSON.parse(localStorage.getItem('dvm.progress.v1')!);
    expect(stored.version).toBe(2);
    expect(Array.isArray(stored.state.cards[0])).toBe(true);
  });

  it('fits the whole corpus card table in about 3.5 MB', () => {
    const now = Date.now();
    const cards: Record<string, CardRecord> = {};
    for (let i = 0; i < 25_753; i += 1) {
      const id = `b1v-${String(i % 1000).padStart(3, '0')}-zusammenarbeiten|presentPerfect|erSieEs${i}`;
      let card = createCard(id, now);
      card = reviewCard(reviewCard(reviewCard(card, 4, now), 4, now + 600_000), 5, now + 2 * 86_400_000);
      cards[id] = card;
    }
    const bytes = JSON.stringify(encodeCards(cards)).length;
    console.log(`compact card table: ${bytes} bytes, ${(bytes / 25_753).toFixed(1)} bytes/card`);
    expect(bytes).toBeLessThan(3_500_000);
  });
});

describe('settings merge', () => {
  it.each([[[]], [['C1']], ['A1']])('replaces invalid levels %j with A1', async (levels) => {
    save('dvm.settings.v1', { levels, theme: 'neon' }, 1);
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().levels).toEqual(['A1']);
    expect(['light', 'dark']).toContain(useSettings.getState().theme);
  });

  it('keeps valid levels and fills in missing categories', async () => {
    save('dvm.settings.v1', { levels: ['A2', 'B1'], categories: { present: false } }, 1);
    await useSettings.persist.rehydrate();
    const state = useSettings.getState();
    expect(state.levels).toEqual(['A2', 'B1']);
    expect(state.categories.present).toBe(false);
    expect(state.categories.simplePast).toBe(true);
  });
});
