// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CelebrationLayer } from './CelebrationLayer';
import { useGamification } from '@/store/gamificationStore';
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_ID, RANKS } from '@/lib/achievements';

beforeEach(() => {
  window.localStorage.clear();
  useGamification.getState().resetGamification();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const mount = () =>
  render(
    <MemoryRouter>
      <CelebrationLayer />
    </MemoryRouter>,
  );

describe('CelebrationLayer', () => {
  it('renders nothing with an empty queue', () => {
    const { container } = mount();
    expect(container.innerHTML).toBe('');
  });

  it('shows a toast per pending unlock and drains the queue', () => {
    useGamification.setState({ pendingUnlocks: ['first-steps', 'streak-3'] });
    mount();
    expect(screen.getByText(ACHIEVEMENTS_BY_ID['first-steps'].name)).toBeTruthy();
    expect(screen.getByText(ACHIEVEMENTS_BY_ID['streak-3'].name)).toBeTruthy();
    expect(useGamification.getState().pendingUnlocks).toEqual([]);
  });

  it('collapses more than 3 unlocks into one summary toast linking to badges', () => {
    const ids = ACHIEVEMENTS.slice(0, 5).map((a) => a.id);
    useGamification.setState({ pendingUnlocks: ids });
    mount();
    const link = screen.getByRole('link', { name: /5 badges unlocked/ });
    expect(link.getAttribute('href')).toBe('/achievements');
    expect(screen.queryByText(ACHIEVEMENTS_BY_ID[ids[0]].name)).toBeNull();
  });

  it('shows a pending level-up and drains it', () => {
    useGamification.setState({ pendingLevelUp: 2 });
    mount();
    expect(screen.getByText(`Level 2 — ${RANKS[1].name}`)).toBeTruthy();
    expect(useGamification.getState().pendingLevelUp).toBeNull();
  });

  it('dismisses toasts on a timer', () => {
    useGamification.setState({ pendingUnlocks: ['first-steps'] });
    const { container } = mount();
    expect(container.innerHTML).not.toBe('');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(container.innerHTML).toBe('');
  });
});
