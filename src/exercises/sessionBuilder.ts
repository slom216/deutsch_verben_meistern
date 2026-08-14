import type { FormCategory } from '@/types/formCategory';
import type { Verb } from '@/types/verb';
import { createRng, type Rng } from '@/lib/random';
import {
  createCard,
  isDue,
  makeCardId,
  urgency,
  type CardRecord,
} from '@/lib/srs';
import { slotsFor, resolveTarget, type FormTarget } from './formAccess';
import { generateExercise } from './generators';
import type { Exercise, ExerciseType } from './types';

/**
 * Session assembly.
 *
 * A session is built from two pools: cards that spaced repetition says are
 * due, and new material to keep the corpus moving. Due cards come first
 * because forgetting is time-sensitive, but new cards are woven in rather than
 * queued at the end, so a long review backlog never feels like a wall.
 */

export interface SessionRequest {
  verbs: readonly Verb[];
  cards: Readonly<Record<string, CardRecord>>;
  enabledCategories: readonly FormCategory[];
  enabledTypes: readonly ExerciseType[];
  /** How many exercises to build. */
  length: number;
  /** Upper bound on unseen cards introduced in this session. */
  newCardLimit: number;
  showTranslations: boolean;
  now?: number;
  seed?: number;
}

export interface SessionPlan {
  exercises: Exercise[];
  dueCount: number;
  newCount: number;
  /** Total cards due right now across the whole filtered corpus. */
  totalDue: number;
}

interface Candidate {
  target: FormTarget;
  cardId: string;
  card: CardRecord | null;
  priority: number;
  isNew: boolean;
}

/**
 * Enumerate practisable targets. Verbs are visited in frequency order so that
 * new material is introduced from the most useful verbs first.
 */
function collectCandidates(
  verbs: readonly Verb[],
  cards: Readonly<Record<string, CardRecord>>,
  enabledCategories: readonly FormCategory[],
  now: number,
  newCardBudget: number,
): { due: Candidate[]; fresh: Candidate[]; totalDue: number } {
  const due: Candidate[] = [];
  const fresh: Candidate[] = [];
  let totalDue = 0;

  for (const verb of verbs) {
    for (const category of enabledCategories) {
      for (const slot of slotsFor(verb, category)) {
        const cardId = makeCardId(verb.id, category, slot);
        const card = cards[cardId];

        if (card) {
          if (card.state === 'mastered' && !isDue(card, now)) continue;
          if (!isDue(card, now)) continue;
          totalDue += 1;
          // Resolving a target is the expensive part; skip it once the review
          // queue is comfortably larger than any session could consume.
          if (due.length < 400) {
            const target = resolveTarget(verb, category, slot);
            if (target) {
              due.push({ target, cardId, card, priority: urgency(card, now), isNew: false });
            }
          }
          continue;
        }

        if (fresh.length < newCardBudget * 4) {
          const target = resolveTarget(verb, category, slot);
          if (target) {
            fresh.push({ target, cardId, card: null, priority: 50, isNew: true });
          }
        }
      }
    }
  }

  return { due, fresh, totalDue };
}

/** Interleave review and new items so new material is spread across the run. */
function interleave(due: Candidate[], fresh: Candidate[], rng: Rng): Candidate[] {
  if (fresh.length === 0) return due;
  if (due.length === 0) return fresh;

  const result: Candidate[] = [];
  const gap = Math.max(1, Math.floor(due.length / fresh.length));
  let freshIndex = 0;

  due.forEach((candidate, index) => {
    result.push(candidate);
    if (index > 0 && index % gap === 0 && freshIndex < fresh.length) {
      result.push(fresh[freshIndex]);
      freshIndex += 1;
    }
  });

  // Anything left over goes on the end, lightly shuffled.
  result.push(...rng.shuffle(fresh.slice(freshIndex)));
  return result;
}

export function buildSession(request: SessionRequest): SessionPlan {
  const {
    verbs,
    cards,
    enabledCategories,
    enabledTypes,
    length,
    newCardLimit,
    showTranslations,
  } = request;

  const now = request.now ?? Date.now();
  const rng = createRng(request.seed ?? Date.now());

  if (verbs.length === 0 || enabledCategories.length === 0 || length <= 0) {
    return { exercises: [], dueCount: 0, newCount: 0, totalDue: 0 };
  }

  const { due, fresh, totalDue } = collectCandidates(
    verbs,
    cards,
    enabledCategories,
    now,
    Math.max(newCardLimit, 1),
  );

  due.sort((a, b) => b.priority - a.priority);

  const reviewSlots = Math.min(due.length, length);
  const newSlots = Math.min(fresh.length, newCardLimit, Math.max(length - reviewSlots, 0));

  const chosenDue = due.slice(0, reviewSlots);
  // Take new material from the top of the frequency-ordered list, but shuffle
  // within it so repeated sessions do not always open with the same verb.
  const chosenFresh = rng.shuffle(fresh.slice(0, Math.max(newSlots * 3, newSlots))).slice(0, newSlots);

  const ordered = interleave(chosenDue, chosenFresh, rng).slice(0, length);

  const exercises: Exercise[] = [];
  const pool = verbs;

  for (const candidate of ordered) {
    const exercise = generateExercise(
      {
        target: candidate.target,
        rng,
        pool,
        enabledCategories,
        showTranslations,
      },
      // A brand-new form is introduced by recognition before it is demanded
      // in production — you cannot recall what you have never seen.
      candidate.isNew ? preferRecognition(enabledTypes) : enabledTypes,
    );
    if (exercise) exercises.push(exercise);
  }

  return {
    exercises,
    dueCount: chosenDue.length,
    newCount: chosenFresh.length,
    totalDue,
  };
}

/** Recognition formats first, for material the learner has not met yet. */
function preferRecognition(enabled: readonly ExerciseType[]): ExerciseType[] {
  const recognition = enabled.filter((t) => t === 'multipleChoice' || t === 'matching');
  return recognition.length > 0 ? recognition : [...enabled];
}

/** Count everything currently due, without building any exercises. */
export function countDue(
  verbs: readonly Verb[],
  cards: Readonly<Record<string, CardRecord>>,
  enabledCategories: readonly FormCategory[],
  now: number = Date.now(),
): number {
  let count = 0;
  for (const verb of verbs) {
    for (const category of enabledCategories) {
      for (const slot of slotsFor(verb, category)) {
        const card = cards[makeCardId(verb.id, category, slot)];
        if (card && isDue(card, now)) count += 1;
      }
    }
  }
  return count;
}

/** Total practisable cards in a filtered corpus — the denominator for progress. */
export function countPractisable(
  verbs: readonly Verb[],
  enabledCategories: readonly FormCategory[],
): number {
  let count = 0;
  for (const verb of verbs) {
    for (const category of enabledCategories) {
      count += slotsFor(verb, category).length;
    }
  }
  return count;
}

/** Materialise a card record, creating a fresh one when unseen. */
export function ensureCard(
  cards: Readonly<Record<string, CardRecord>>,
  cardId: string,
  now: number = Date.now(),
): CardRecord {
  return cards[cardId] ?? createCard(cardId, now);
}
