import { describe, expect, it } from 'vitest';
import a1 from '@/data/verbs/a1.json';
import a2 from '@/data/verbs/a2.json';
import b1 from '@/data/verbs/b1.json';
import type { Verb, VerbDataset } from '@/types/verb';
import { FORM_CATEGORIES, type FormCategory } from '@/types/formCategory';
import { createRng } from '@/lib/random';
import { gradeAnswer, gradeOrder, gradeSelection, DEFAULT_POLICY } from '@/lib/grader';
import { EXERCISE_TYPES, type ExerciseType } from './types';
import { resolveTarget, slotsFor, targetsForVerb } from './formAccess';
import { GENERATORS, generateExercise } from './generators';
import { buildSession } from './sessionBuilder';

/**
 * These tests run the real engine over the real corpus. The point is that no
 * combination of the 676 shipped verbs and thirteen form categories can
 * produce a broken, unanswerable or self-contradicting exercise.
 */

const CORPUS: Verb[] = [
  ...(a1 as unknown as VerbDataset).verbs,
  ...(a2 as unknown as VerbDataset).verbs,
  ...(b1 as unknown as VerbDataset).verbs,
];

const ALL_CATEGORIES = [...FORM_CATEGORIES];
const ALL_TYPES = [...EXERCISE_TYPES];

function contextFor(verb: Verb, category: FormCategory, slot: string, seed = 42) {
  const target = resolveTarget(verb, category, slot);
  if (!target) return null;
  return {
    target,
    rng: createRng(seed),
    pool: CORPUS,
    enabledCategories: ALL_CATEGORIES,
    showTranslations: true,
  };
}

describe('corpus', () => {
  it('loads all three levels', () => {
    expect(CORPUS).toHaveLength(676);
  });

  it('gives every verb at least one practisable target', () => {
    const barren = CORPUS.filter((verb) => targetsForVerb(verb, ALL_CATEGORIES).length === 0);
    expect(barren.map((v) => v.id)).toEqual([]);
  });
});

describe('resolveTarget', () => {
  it('produces a non-empty answer for every resolvable slot', () => {
    const broken: string[] = [];
    for (const verb of CORPUS) {
      for (const category of ALL_CATEGORIES) {
        for (const slot of slotsFor(verb, category)) {
          const target = resolveTarget(verb, category, slot);
          if (!target) continue;
          if (target.answer.trim().length === 0) broken.push(`${verb.id}/${category}/${slot}`);
          if (!target.accepted.includes(target.answer)) {
            broken.push(`${verb.id}/${category}/${slot} answer not in accepted`);
          }
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('never offers an imperative for a verb that has none', () => {
    const offenders = CORPUS.filter(
      (verb) => !verb.forms.imperative.available && slotsFor(verb, 'imperative').length > 0,
    );
    expect(offenders).toEqual([]);
  });

  it('accepts both Konjunktiv II realisations when both exist', () => {
    const verb = CORPUS.find((v) => v.forms.konjunktivII.synthetic !== null);
    expect(verb).toBeDefined();
    const target = resolveTarget(verb!, 'konjunktivII', 'ich');
    expect(target!.accepted).toContain(verb!.forms.konjunktivII.synthetic!.ich);
    expect(target!.accepted).toContain(verb!.forms.konjunktivII.würdeForm.ich);
  });

  it('accepts either auxiliary for variable-auxiliary verbs', () => {
    const verb = CORPUS.find((v) => v.auxiliary.includes('/'));
    if (!verb) return;
    const target = resolveTarget(verb, 'auxiliary', '_');
    expect(target!.accepted.length).toBeGreaterThan(1);
  });
});

describe('generators over the whole corpus', () => {
  it('produce well-formed exercises wherever they produce anything', () => {
    const problems: string[] = [];
    let produced = 0;

    CORPUS.forEach((verb, verbIndex) => {
      for (const category of ALL_CATEGORIES) {
        for (const slot of slotsFor(verb, category)) {
          const context = contextFor(verb, category, slot, verbIndex + 1);
          if (!context) continue;

          for (const type of ALL_TYPES) {
            const exercise = GENERATORS[type](context);
            if (!exercise) continue;
            produced += 1;

            const where = `${verb.id}/${category}/${slot}/${type}`;
            if (exercise.cardIds.length === 0) problems.push(`${where}: no card ids`);
            if (!exercise.prompt.trim()) problems.push(`${where}: empty prompt`);
            if (!exercise.explanation.trim()) problems.push(`${where}: empty explanation`);
            if (exercise.baseXp <= 0) problems.push(`${where}: non-positive XP`);

            switch (exercise.type) {
              case 'multipleChoice': {
                if (exercise.options.length < 2) problems.push(`${where}: too few options`);
                if (!exercise.options.includes(exercise.answer)) {
                  problems.push(`${where}: answer missing from options`);
                }
                if (new Set(exercise.options).size !== exercise.options.length) {
                  problems.push(`${where}: duplicate options`);
                }
                break;
              }
              case 'typedConjugation':
              case 'sentenceCompletion':
              case 'errorCorrection':
              case 'tenseTransformation': {
                if (exercise.accepted.length === 0) problems.push(`${where}: nothing accepted`);
                if (!exercise.accepted.includes(exercise.answer)) {
                  problems.push(`${where}: answer not in accepted list`);
                }
                break;
              }
              case 'matching': {
                if (exercise.pairs.length < 3) problems.push(`${where}: too few pairs`);
                const rights = exercise.pairs.map((p) => p.right);
                if (new Set(rights).size !== rights.length) {
                  problems.push(`${where}: ambiguous matching pairs`);
                }
                if (exercise.shuffledRight.length !== exercise.pairs.length) {
                  problems.push(`${where}: option count mismatch`);
                }
                if (exercise.cardIds.length !== exercise.pairs.length) {
                  problems.push(`${where}: card ids do not cover the pairs`);
                }
                break;
              }
              case 'sentenceReconstruction': {
                if (exercise.tokens.length !== exercise.correctOrder.length) {
                  problems.push(`${where}: token count mismatch`);
                }
                const sorted = (list: readonly string[]) => [...list].sort().join('|');
                if (sorted(exercise.tokens) !== sorted(exercise.correctOrder)) {
                  problems.push(`${where}: scrambled tokens are not a permutation`);
                }
                if (exercise.tokens.every((t, i) => t === exercise.correctOrder[i])) {
                  problems.push(`${where}: puzzle starts already solved`);
                }
                break;
              }
              default:
                break;
            }
          }
        }
      }
    });

    expect(problems.slice(0, 20)).toEqual([]);
    expect(produced).toBeGreaterThan(10000);
  });

  it('grade their own correct answer as correct', () => {
    const failures: string[] = [];

    // A representative slice — grading every exercise in the corpus is slow.
    const sample = CORPUS.filter((_, index) => index % 7 === 0);

    sample.forEach((verb, verbIndex) => {
      for (const category of ALL_CATEGORIES) {
        for (const slot of slotsFor(verb, category)) {
          const context = contextFor(verb, category, slot, verbIndex + 100);
          if (!context) continue;

          for (const type of ALL_TYPES) {
            const exercise = GENERATORS[type](context);
            if (!exercise) continue;
            const where = `${verb.id}/${category}/${slot}/${type}`;

            switch (exercise.type) {
              case 'multipleChoice': {
                if (!gradeSelection(exercise.answer, exercise.answer).correct) {
                  failures.push(where);
                }
                break;
              }
              case 'typedConjugation':
              case 'sentenceCompletion':
              case 'errorCorrection':
              case 'tenseTransformation': {
                const result = gradeAnswer(exercise.answer, exercise.accepted, DEFAULT_POLICY);
                if (!result.correct) failures.push(`${where}: "${exercise.answer}"`);
                break;
              }
              case 'sentenceReconstruction': {
                if (!gradeOrder(exercise.correctOrder, exercise.correctOrder).correct) {
                  failures.push(where);
                }
                break;
              }
              default:
                break;
            }
          }
        }
      }
    });

    expect(failures.slice(0, 20)).toEqual([]);
  });

  it('never puts the correct answer among the distractors', () => {
    const failures: string[] = [];

    CORPUS.filter((_, index) => index % 5 === 0).forEach((verb, verbIndex) => {
      for (const category of ALL_CATEGORIES) {
        for (const slot of slotsFor(verb, category)) {
          const context = contextFor(verb, category, slot, verbIndex + 7);
          if (!context) continue;
          const exercise = GENERATORS.multipleChoice(context);
          if (!exercise || exercise.type !== 'multipleChoice') continue;

          const distractors = exercise.options.filter((o) => o !== exercise.answer);
          for (const distractor of distractors) {
            // A distractor that is also an accepted answer would punish a
            // learner for being right.
            if (context.target.accepted.includes(distractor)) {
              failures.push(`${verb.id}/${category}/${slot}: "${distractor}"`);
            }
          }
        }
      }
    });

    expect(failures.slice(0, 20)).toEqual([]);
  });
});

describe('generateExercise', () => {
  it('always returns something for a resolvable target', () => {
    const failures: string[] = [];
    for (const verb of CORPUS.filter((_, i) => i % 11 === 0)) {
      for (const category of ALL_CATEGORIES) {
        for (const slot of slotsFor(verb, category)) {
          const context = contextFor(verb, category, slot);
          if (!context) continue;
          if (!generateExercise(context, ALL_TYPES)) {
            failures.push(`${verb.id}/${category}/${slot}`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('falls back when the only enabled format cannot render the target', () => {
    const verb = CORPUS.find((v) => v.separable)!;
    const context = contextFor(verb, 'separability', '_')!;
    // Typed conjugation deliberately refuses closed-set grammar facts.
    expect(GENERATORS.typedConjugation(context)).toBeNull();
    expect(generateExercise(context, ['typedConjugation'])).not.toBeNull();
  });

  it('asks binary grammar questions as two-option choices', () => {
    const separable = CORPUS.find((v) => v.separable)!;
    const choice = GENERATORS.multipleChoice(contextFor(separable, 'separability', '_')!);
    expect(choice).not.toBeNull();
    expect(choice!.type).toBe('multipleChoice');
    if (choice!.type !== 'multipleChoice') return;
    expect(choice!.options.sort()).toEqual(['inseparable', 'separable']);
    expect(choice!.answer).toBe('separable');

    const habenVerb = CORPUS.find((v) => v.auxiliary === 'haben')!;
    const auxChoice = GENERATORS.multipleChoice(contextFor(habenVerb, 'auxiliary', '_')!);
    expect(auxChoice).not.toBeNull();
    if (auxChoice!.type !== 'multipleChoice') return;
    expect(auxChoice!.options.sort()).toEqual(['haben', 'sein']);
  });
});

describe('buildSession', () => {
  const baseRequest = {
    verbs: CORPUS.slice(0, 60),
    cards: {},
    enabledCategories: ['present', 'presentPerfect'] as FormCategory[],
    enabledTypes: ALL_TYPES as ExerciseType[],
    length: 20,
    newCardLimit: 20,
    showTranslations: true,
    seed: 1234,
  };

  it('builds a full session of the requested length', () => {
    const plan = buildSession(baseRequest);
    expect(plan.exercises).toHaveLength(20);
    expect(plan.newCount).toBeGreaterThan(0);
  });

  it('respects the new-card limit', () => {
    const plan = buildSession({ ...baseRequest, newCardLimit: 5 });
    expect(plan.newCount).toBeLessThanOrEqual(5);
  });

  it('introduces new material with recognition formats', () => {
    const plan = buildSession(baseRequest);
    // Every card is new here, so nothing should demand blind production.
    const productionFirst = plan.exercises.filter(
      (exercise) => exercise.type !== 'multipleChoice' && exercise.type !== 'matching',
    );
    expect(productionFirst).toEqual([]);
  });

  it('only uses enabled categories', () => {
    const plan = buildSession(baseRequest);
    const used = new Set(plan.exercises.map((exercise) => exercise.category));
    expect([...used].every((c) => baseRequest.enabledCategories.includes(c))).toBe(true);
  });

  it('returns nothing when no categories are enabled', () => {
    const plan = buildSession({ ...baseRequest, enabledCategories: [] });
    expect(plan.exercises).toEqual([]);
  });

  it('returns nothing when the verb pool is empty', () => {
    const plan = buildSession({ ...baseRequest, verbs: [] });
    expect(plan.exercises).toEqual([]);
  });

  it('builds a review-only session when new cards are disallowed', () => {
    const plan = buildSession({ ...baseRequest, newCardLimit: 0 });
    expect(plan.newCount).toBe(0);
    expect(plan.exercises).toHaveLength(0);
  });

  it('is deterministic for a fixed seed', () => {
    const a = buildSession(baseRequest);
    const b = buildSession(baseRequest);
    expect(a.exercises.map((e) => `${e.verbId}|${e.category}|${e.type}`)).toEqual(
      b.exercises.map((e) => `${e.verbId}|${e.category}|${e.type}`),
    );
  });
});
