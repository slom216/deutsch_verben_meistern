// @vitest-environment jsdom
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import a1 from '@/data/verbs/a1.json';
import type { Verb, VerbDataset } from '@/types/verb';
import { EXERCISE_TYPES } from '@/exercises/types';
import { dayKey } from '@/lib/dates';
import { useGamification } from '@/store/gamificationStore';
import { useProgress } from '@/store/progressStore';
import { useSettings } from '@/store/settingsStore';
import { useSession } from './useSession';

const VERBS = (a1 as unknown as VerbDataset).verbs.slice(0, 40) as Verb[];
const BY_ID = new Map(VERBS.map((verb) => [verb.id, verb]));

type Session = ReturnType<typeof useSession>;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useProgress.getState().resetProgress();
  useGamification.getState().resetGamification();
  useSettings.getState().resetToDefaults();
  useSettings.setState({ dailyGoalXp: 1 });
  // Multiple choice only, so every answer can be given correctly.
  EXERCISE_TYPES.filter((t) => t !== 'multipleChoice').forEach((t) =>
    useSettings.setState((s) => ({ exerciseTypes: { ...s.exerciseTypes, [t]: false } })),
  );
});

function answerCorrectly(session: () => Session) {
  act(() => {
    const exercise = session().exercise;
    if (exercise?.type !== 'multipleChoice') throw new Error('expected multiple choice');
    session().setResponse({ kind: 'choice', value: exercise.answer });
  });
  act(() => session().submit());
}

describe('useSession bookkeeping', () => {
  it('registers the goal per answer, resumes after unmount, and counts End session once', () => {
    const first = renderHook(() => useSession(BY_ID, VERBS));
    act(() => first.result.current.start({ length: 3 }));
    answerCorrectly(() => first.result.current);

    expect(useGamification.getState().goalDays).toEqual([dayKey()]);
    first.unmount();

    // Navigating away and back resumes the same session.
    const second = renderHook(() => useSession(BY_ID, VERBS));
    expect(second.result.current.phase).toBe('feedback');
    expect(second.result.current.summary.answered).toBe(1);
    expect(useProgress.getState().sessionsCompleted).toBe(0);

    act(() => second.result.current.reset());
    act(() => second.result.current.reset());
    expect(useProgress.getState().sessionsCompleted).toBe(1);
    // Ended early, so not perfect.
    expect(useGamification.getState().perfectSessions).toBe(0);
    expect(second.result.current.phase).toBe('idle');
  });

  it('counts a completed session exactly once under StrictMode', () => {
    const { result, unmount } = renderHook(() => useSession(BY_ID, VERBS), { wrapper: StrictMode });
    act(() => result.current.start({ length: 1 }));
    const total = result.current.total;
    for (let i = 0; i < total; i += 1) {
      answerCorrectly(() => result.current);
      act(() => result.current.advance());
    }
    expect(result.current.phase).toBe('complete');
    act(() => result.current.reset());
    unmount();

    expect(useProgress.getState().sessionsCompleted).toBe(1);
    expect(useGamification.getState().perfectSessions).toBe(1);
  });

  it('does not count a session with no answers', () => {
    const { result } = renderHook(() => useSession(BY_ID, VERBS));
    act(() => result.current.start({ length: 3 }));
    act(() => result.current.reset());
    expect(useProgress.getState().sessionsCompleted).toBe(0);
  });
});

const SAVED_KEY = 'dvm.session.v1';

/** A full page reload: fresh module instances rebuilt from browser storage. */
async function reload() {
  vi.resetModules();
  const [{ useSession: reloaded }, { useProgress: progress }] = await Promise.all([
    import('./useSession'),
    import('@/store/progressStore'),
  ]);
  return { useSession: reloaded, useProgress: progress };
}

describe('useSession across a reload', () => {
  it('resumes the session in feedback without recording the answer again', async () => {
    const first = renderHook(() => useSession(BY_ID, VERBS));
    act(() => first.result.current.start({ length: 3 }));
    answerCorrectly(() => first.result.current);
    const recorded = useProgress.getState().totalAnswered;

    const fresh = await reload();
    const second = renderHook(() => fresh.useSession(BY_ID, VERBS));
    expect(second.result.current.phase).toBe('feedback');
    expect(second.result.current.index).toBe(0);
    expect(second.result.current.summary).toEqual(first.result.current.summary);
    expect(second.result.current.exercise?.id).toBe(first.result.current.exercise?.id);
    act(() => second.result.current.submit());
    expect(fresh.useProgress.getState().totalAnswered).toBe(recorded);

    act(() => second.result.current.advance());
    expect(second.result.current.phase).toBe('active');
    expect(second.result.current.index).toBe(1);
    act(() => first.result.current.reset());
  });

  it('starts idle from a malformed or unusable saved session', async () => {
    for (const raw of ['{nope', '{"phase":"feedback","plan":{"exercises":[]},"index":0}']) {
      sessionStorage.setItem(SAVED_KEY, raw);
      const fresh = await reload();
      const { result } = renderHook(() => fresh.useSession(BY_ID, VERBS));
      expect(result.current.phase).toBe('idle');
      expect(sessionStorage.getItem(SAVED_KEY)).toBeNull();
    }
  });

  it('drops a saved session whose verbs are not loaded', async () => {
    const first = renderHook(() => useSession(BY_ID, VERBS));
    act(() => first.result.current.start({ length: 3 }));

    const fresh = await reload();
    const { result } = renderHook(() => fresh.useSession(new Map([['other', VERBS[0]]]), VERBS));
    expect(result.current.phase).toBe('idle');
    act(() => first.result.current.reset());
  });

  it('clears the saved session on End session', () => {
    const { result } = renderHook(() => useSession(BY_ID, VERBS));
    act(() => result.current.start({ length: 3 }));
    answerCorrectly(() => result.current);
    expect(sessionStorage.getItem(SAVED_KEY)).not.toBeNull();

    act(() => result.current.reset());
    expect(sessionStorage.getItem(SAVED_KEY)).toBeNull();
  });

  it('counts a session completed after a reload exactly once', async () => {
    const first = renderHook(() => useSession(BY_ID, VERBS));
    act(() => first.result.current.start({ length: 1 }));
    answerCorrectly(() => first.result.current);

    const fresh = await reload();
    const second = renderHook(() => fresh.useSession(BY_ID, VERBS));
    act(() => second.result.current.advance());
    expect(second.result.current.phase).toBe('complete');
    expect(fresh.useProgress.getState().sessionsCompleted).toBe(1);
    expect(sessionStorage.getItem(SAVED_KEY)).toBeNull();

    const again = await reload();
    const third = renderHook(() => again.useSession(BY_ID, VERBS));
    expect(third.result.current.phase).toBe('idle');
    act(() => third.result.current.reset());
    expect(again.useProgress.getState().sessionsCompleted).toBe(1);
    act(() => first.result.current.reset());
  });
});
