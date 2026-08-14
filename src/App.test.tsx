// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from './App';
import { useProgress } from './store/progressStore';
import { useGamification } from './store/gamificationStore';
import { useSettings } from './store/settingsStore';
import { EXERCISE_TYPES } from './exercises/types';

/**
 * End-to-end smoke tests: mount the real application, walk through a real
 * practice session, and confirm that answering actually moves the learner's
 * stored progress. This is the check that the wiring between generators,
 * grader, spaced repetition and the stores holds together at runtime.
 */

beforeEach(() => {
  window.localStorage.clear();
  useProgress.getState().resetProgress();
  useGamification.getState().resetGamification();
  useSettings.getState().resetToDefaults();
  window.location.hash = '#/';
});

afterEach(cleanup);

/** jsdom has no layout, so scrollTo is missing; react-router calls it. */
window.scrollTo = () => {};

/** Pages are lazily imported, which is slow under a loaded test runner. */
const LAZY = { timeout: 10000 } as const;

describe('application shell', () => {
  it('renders the dashboard', async () => {
    render(<App />);
    expect(await screen.findByText('Willkommen!')).toBeTruthy();
    expect(screen.getByText('Deutsch Verben Meister')).toBeTruthy();
  });

  it('shows the starting rank and an empty streak', async () => {
    render(<App />);
    await screen.findByText('Willkommen!');
    expect(screen.getAllByText('Anfänger').length).toBeGreaterThan(0);
    expect(screen.getByText('0 d')).toBeTruthy();
  });

  it('navigates to every top-level page without crashing', async () => {
    render(<App />);
    await screen.findByText('Willkommen!');

    for (const [label, heading] of [
      ['Verbs', 'Verb library'],
      ['Badges', 'Badges & ranks'],
      ['Settings', 'Settings'],
      ['Practice', 'Practice'],
    ] as const) {
      fireEvent.click(screen.getByRole('link', { name: new RegExp(label) }));
      // Each page is a lazily loaded chunk, so allow for the import.
      expect(await screen.findByRole('heading', { name: heading }, LAZY)).toBeTruthy();
    }

    // With no answers recorded yet, the progress page shows its empty state
    // rather than the analytics heading.
    fireEvent.click(screen.getByRole('link', { name: /Progress/ }));
    expect(await screen.findByText('No progress yet', undefined, LAZY)).toBeTruthy();
  }, 30000);
});

describe('a practice session', () => {
  it('runs from start to summary and records progress', async () => {
    // A short, single-format session keeps the walk-through deterministic.
    useSettings.getState().setSession({ length: 3, newCardLimit: 3 });
    for (const type of EXERCISE_TYPES) {
      if (type !== 'multipleChoice' && useSettings.getState().exerciseTypes[type]) {
        useSettings.getState().toggleExerciseType(type);
      }
    }

    render(<App />);
    await screen.findByText('Willkommen!');

    fireEvent.click(screen.getByRole('link', { name: /Practice/ }));
    const startButton = await screen.findByRole('button', { name: 'Start session' });

    await act(async () => {
      fireEvent.click(startButton);
    });

    // New material is introduced with recognition formats, so the first
    // question is answerable by picking an option.
    for (let step = 0; step < 3; step += 1) {
      const checkButton = await screen.findByRole('button', { name: /Check/ });

      // Pick the first multiple-choice option; whether it is right or wrong
      // does not matter, only that the session advances and records it.
      const optionButtons = screen
        .getAllByRole('button')
        .filter((button) => /^[1-4]$/.test(button.textContent?.trim().charAt(0) ?? ''));

      expect(optionButtons.length).toBeGreaterThan(0);
      await act(async () => {
        fireEvent.click(optionButtons[0]);
      });

      await waitFor(() => expect((checkButton as HTMLButtonElement).disabled).toBe(false));

      await act(async () => {
        fireEvent.click(checkButton);
      });

      // Feedback panel, then continue.
      const continueButton = await screen.findByRole('button', { name: /Continue/ });
      await act(async () => {
        fireEvent.click(continueButton);
      });
    }

    // Session summary.
    expect(await screen.findByText(/Session complete|Flawless session!/)).toBeTruthy();

    const progress = useProgress.getState();
    expect(progress.totalAnswered).toBe(3);
    expect(progress.sessionsCompleted).toBe(1);
    // Every answered question must have created a spaced-repetition card.
    expect(Object.keys(progress.cards).length).toBeGreaterThanOrEqual(3);
    // And practising must have started a streak.
    expect(useGamification.getState().dailyStreak).toBe(1);
  }, 30000);
});

describe('progress analytics', () => {
  it('renders the analytics once answers exist', async () => {
    act(() => {
      useProgress.getState().recordAnswer({
        cardIds: ['a1v-001-sein|present|du'],
        verbId: 'a1v-001-sein',
        category: 'present',
        slot: 'du',
        exerciseType: 'typedConjugation',
        result: {
          correct: false,
          verdict: 'incorrect',
          target: 'bist',
          diagnostics: [{ code: 'wrongForm', message: 'That is not the right form.', fatal: true }],
          distance: 3,
        },
        response: 'bin',
        responseMs: 4000,
        hintUsed: false,
        xpAwarded: 0,
      });
    });

    render(<App />);
    await screen.findByText(/Time to review|Ready when you are/);

    fireEvent.click(screen.getByRole('link', { name: /Progress/ }));
    expect(await screen.findByRole('heading', { name: 'Progress' })).toBeTruthy();

    // The wrong answer must show up in the repeated-mistakes panel.
    expect(await screen.findByText('Forms you keep missing')).toBeTruthy();
    expect(screen.getByText('bist')).toBeTruthy();
  });
});

describe('settings drive practice', () => {
  it('reflects a disabled category in the practice summary', async () => {
    render(<App />);
    await screen.findByText('Willkommen!');

    act(() => {
      // Leave only the present tense enabled.
      useSettings.getState().setCategories(false);
      useSettings.getState().toggleCategory('present');
    });

    fireEvent.click(screen.getByRole('link', { name: /Practice/ }));
    await screen.findByRole('heading', { name: 'Practice' });

    expect(await screen.findByText(/1 form category enabled/)).toBeTruthy();
    expect(screen.getByText('Präsens')).toBeTruthy();
    expect(screen.queryByText('Perfekt')).toBeNull();
  });

  it('warns when filters exclude every verb', async () => {
    render(<App />);
    await screen.findByText('Willkommen!');

    act(() => {
      useSettings.getState().setFilters({ topics: ['A topic that does not exist'] });
    });

    fireEvent.click(screen.getByRole('link', { name: /Practice/ }));
    expect(await screen.findByText('No verbs match your filters')).toBeTruthy();
  });
});
