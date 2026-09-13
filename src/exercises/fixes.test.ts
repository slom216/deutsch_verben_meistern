import { describe, expect, it } from 'vitest';
import a1 from '@/data/verbs/a1.json';
import a2 from '@/data/verbs/a2.json';
import b1 from '@/data/verbs/b1.json';
import { PERSONS, type Person, type Verb, type VerbDataset } from '@/types/verb';
import type { FormCategory } from '@/types/formCategory';
import { createRng } from '@/lib/random';
import { makeCardId } from '@/lib/srs';
import { locateInExample, resolveTarget, slotsFor } from './formAccess';
import { GENERATORS, renderSentence } from './generators';
import { buildSession, countPractisable } from './sessionBuilder';
import { EXERCISE_TYPES, isProduction, type Exercise } from './types';

/**
 * Regression tests for specific generator bugs. Verbs are cloned from the
 * corpus for their forms only; example sentences are always set here, because
 * the shipped examples are being rewritten.
 */

const CORPUS: Verb[] = [a1, a2, b1].flatMap((d) => (d as unknown as VerbDataset).verbs);

function verb(infinitive: string, overrides: Partial<Verb> = {}): Verb {
  const found = CORPUS.find((v) => v.infinitive === infinitive);
  if (!found) throw new Error(`no fixture verb ${infinitive}`);
  return {
    ...structuredClone(found),
    example: { german: 'Das ist gut.', english: 'That is good.' },
    ...overrides,
  };
}

function example(german: string) {
  return { example: { german, english: '' } };
}

function context(v: Verb, category: FormCategory, slot: string, seed = 1) {
  const target = resolveTarget(v, category, slot);
  if (!target) throw new Error(`no target ${v.infinitive}/${category}/${slot}`);
  return { target, rng: createRng(seed), pool: CORPUS, enabledCategories: [category], showTranslations: true };
}

describe('bug 7: error correction never strikes out a grammatical sentence', () => {
  // Independent of the implementation: who a displayed subject can refer to.
  const readings: Record<string, Person[]> = {
    ich: ['ich'],
    du: ['du'],
    er: ['erSieEs'],
    es: ['erSieEs'],
    sie: ['erSieEs', 'sieSie'],
    wir: ['wir'],
    ihr: ['ihr'],
  };

  it('picks a wrong token that is wrong for every reading of the subject', () => {
    const fixtures = [
      verb('machen'),
      verb('sein'),
      verb('können'),
      verb('sich waschen'),
      verb('anrufen'),
      verb('machen', example('Heute macht er Sport.')),
    ];
    const problems: string[] = [];
    for (const v of fixtures) {
      for (const category of ['present', 'simplePast', 'presentPerfect', 'futureI'] as const) {
        for (const person of PERSONS) {
          for (let seed = 1; seed <= 10; seed += 1) {
            const exercise = GENERATORS.errorCorrection(context(v, category, person, seed));
            if (exercise?.type !== 'errorCorrection') continue;
            const words = exercise.sentence.toLowerCase().split(/\s+/);
            const persons = exercise.sentence.toLowerCase().startsWith('die beiden')
              ? (['sieSie'] as Person[])
              : words.flatMap((w) => readings[w] ?? []);
            expect(persons.length).toBeGreaterThan(0);
            const right = persons.flatMap(
              (p) => resolveTarget(v, category, p)?.accepted.map((a) => a.toLowerCase()) ?? [],
            );
            if (right.includes(exercise.wrongToken.toLowerCase())) {
              problems.push(`${v.infinitive}/${category}/${person}: ${exercise.sentence}`);
            }
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('bug 9: examples are only used when the subject agrees', () => {
  it('requires the person pronoun next to the finite form', () => {
    const haben = verb('haben', example('Wir haben heute viel Zeit.'));
    expect(locateInExample(haben, 'haben', 'sieSie')).toBeNull();
    expect(locateInExample(haben, 'haben', 'wir')).not.toBeNull();

    const inverted = verb('machen', example('Heute macht ihr Sport.'));
    expect(locateInExample(inverted, 'macht', 'ihr')?.before).toBe('Heute ');
    expect(locateInExample(verb('machen', example('Sie macht ihr Bett.')), 'macht', 'ihr')).toBeNull();
  });

  it('rejects infinitive gaps after a modal or zu', () => {
    expect(locateInExample(verb('machen', example('Ich möchte heute machen.')), 'machen', 'wir')).toBeNull();
    expect(locateInExample(verb('gehen', example('Können wir jetzt gehen?')), 'gehen', 'wir')).toBeNull();
    expect(locateInExample(verb('machen', example('Wir haben viel zu machen.')), 'machen', 'wir')).toBeNull();
  });
});

describe('bug 10: dative+accusative verbs', () => {
  it('asks for both cases and never offers the answer as a distractor', () => {
    const geben = verb('geben', { requiredCases: ['dative', 'accusative'], fixedPrepositions: [] });
    const target = resolveTarget(geben, 'caseAndPreposition', '_')!;
    expect(target.answer).toBe('dative+accusative');
    expect(target.explanation).toContain('takes a dative and an accusative object');

    const exercise = GENERATORS.multipleChoice(context(geben, 'caseAndPreposition', '_'));
    if (exercise?.type !== 'multipleChoice') throw new Error('expected multiple choice');
    expect(exercise.options.filter((o) => o === 'dative+accusative')).toHaveLength(1);

    const single = verb('anrufen', { requiredCases: ['accusative'], fixedPrepositions: [] });
    expect(resolveTarget(single, 'caseAndPreposition', '_')!.explanation).toContain(
      'takes an accusative object',
    );
  });

  it('says optional reflexive use is optional', () => {
    const trennen = verb('trennen');
    expect(resolveTarget(trennen, 'reflexivePattern', '_')!.explanation).toBe(
      'trennen can be used reflexively (sich trennen) with an accusative pronoun — ich trenne mich.',
    );
  });
});

describe('bug 11: categories without content produce no cards', () => {
  it('skips separability without a prefix and auxiliary with two options', () => {
    expect(slotsFor(verb('sein'), 'separability')).toEqual([]);
    expect(slotsFor(verb('anrufen'), 'separability')).toEqual(['_']);
    expect(slotsFor(verb('ziehen'), 'auxiliary')).toEqual([]);
    expect(resolveTarget(verb('sein'), 'separability', '_')).toBeNull();

    const prefixless = [verb('sein'), verb('machen'), verb('haben')];
    expect(countPractisable(prefixless, ['separability'])).toBe(0);
    const plan = buildSession({
      verbs: prefixless,
      cards: {},
      enabledCategories: ['separability'],
      enabledTypes: [...EXERCISE_TYPES],
      length: 10,
      newCardLimit: 10,
      showTranslations: false,
      seed: 3,
    });
    expect(plan.exercises).toEqual([]);
  });

  it('limits third-person-only verbs to er/sie/es and sie/Sie with no imperative', () => {
    const lohnen = verb('machen', { usageRestrictions: { thirdPersonOnly: true } });
    expect(slotsFor(lohnen, 'present')).toEqual(['erSieEs', 'sieSie']);
    expect(slotsFor(lohnen, 'imperative')).toEqual([]);
    expect(resolveTarget(lohnen, 'present', 'ich')).toBeNull();
  });
});

describe('bug 12: sentence building reviews only a card the sentence exercises', () => {
  it('needs the target form in the example with an agreeing subject', () => {
    const machen = verb('machen', example('Ich mache heute Sport.'));
    const ok = GENERATORS.sentenceReconstruction(context(machen, 'present', 'ich'));
    expect(ok?.cardIds).toEqual([makeCardId(machen.id, 'present', 'ich')]);
    expect(GENERATORS.sentenceReconstruction(context(machen, 'present', 'du'))).toBeNull();
    expect(GENERATORS.sentenceReconstruction(context(machen, 'simplePast', 'ich'))).toBeNull();
    expect(GENERATORS.sentenceReconstruction(context(machen, 'pastParticiple', '_'))).toBeNull();
  });

  it('keeps the question mark (bug 23)', () => {
    const machen = verb('machen', example('Machst du heute Sport?'));
    const exercise = GENERATORS.sentenceReconstruction(context(machen, 'present', 'du'));
    if (exercise?.type !== 'sentenceReconstruction') throw new Error('expected reconstruction');
    expect(exercise.terminal).toBe('?');
    expect(renderSentence(exercise.correctOrder, exercise.terminal)).toBe('Machst du heute Sport?');
  });
});

describe('bug 24: matching always reviews the scheduled card', () => {
  it('keeps ihr for machen | present | ihr', () => {
    const machen = verb('machen');
    const exercise = GENERATORS.matching(context(machen, 'present', 'ihr'));
    if (exercise?.type !== 'matching') throw new Error('expected matching');
    expect(exercise.cardIds).toContain(makeCardId(machen.id, 'present', 'ihr'));
    expect(exercise.pairs.length).toBeLessThanOrEqual(4);
    expect(exercise.pairs.map((p) => p.cardId)).toEqual(exercise.cardIds);
    const rights = exercise.pairs.map((p) => p.right);
    expect(new Set(rights).size).toBe(rights.length);
  });
});

const newLearner = {
  verbs: CORPUS.slice(0, 40),
  cards: {},
  enabledCategories: ['present', 'futureI'] as FormCategory[],
  enabledTypes: [...EXERCISE_TYPES],
  length: 20,
  newCardLimit: 8,
  showTranslations: false,
};

describe('bug 25: no card is reviewed twice in the first pass', () => {
  it('never repeats a card across recognition exercises', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const plan = buildSession({ ...newLearner, enabledTypes: ['multipleChoice', 'matching'], seed });
      const ids = plan.exercises.flatMap((e) => e.cardIds);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('bug 5: a new learner gets a full session', () => {
  const key = (e: Exercise, id: string) => `${e.type}|${id}`;

  it('fills up with production practice after every first presentation', () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const plan = buildSession({ ...newLearner, seed });
      expect(plan.exercises).toHaveLength(20);

      const keys = plan.exercises.flatMap((e) => e.cardIds.map((id) => key(e, id)));
      expect(new Set(keys).size).toBe(keys.length);

      const seen = new Set<string>();
      let lastFirst = -1;
      plan.exercises.forEach((e, index) => {
        if (e.cardIds.some((id) => !seen.has(id))) {
          expect(isProduction(e.type)).toBe(false);
          lastFirst = index;
        }
        e.cardIds.forEach((id) => seen.add(id));
      });
      expect(plan.exercises.slice(lastFirst + 1).some((e) => isProduction(e.type))).toBe(true);
    }
  });

  it('stays short when no production format is enabled', () => {
    const plan = buildSession({ ...newLearner, enabledTypes: ['multipleChoice'], seed: 1 });
    expect(plan.exercises.length).toBeLessThanOrEqual(8);
  });
});

describe('C4: alternative forms are accepted', () => {
  it('accepts sandte, gesandt and habe gesandt for senden', () => {
    const senden = verb('senden', {
      specialB1Forms: { alternativeSimplePast: 'sandte', alternativePastParticiple: 'gesandt' },
    });
    expect(resolveTarget(senden, 'simplePast', 'ich')!.accepted).toContain('sandte');
    expect(resolveTarget(senden, 'simplePast', 'du')!.accepted).toContain('sandtest');
    expect(resolveTarget(senden, 'simplePast', 'wir')!.accepted).toContain('sandten');
    expect(resolveTarget(senden, 'pastParticiple', '_')!.accepted).toContain('gesandt');
    const perfect = resolveTarget(senden, 'presentPerfect', 'ich')!;
    expect(perfect.answer).toBe('habe gesendet');
    expect(perfect.accepted).toContain('habe gesandt');
  });

  it('accepts both auxiliaries for a haben/sein verb and an alternative auxiliary', () => {
    const ziehen = verb('ziehen');
    expect(resolveTarget(ziehen, 'presentPerfect', 'ich')!.accepted).toEqual(
      expect.arrayContaining(['habe gezogen', 'bin gezogen']),
    );
    expect(resolveTarget(ziehen, 'presentPerfect', 'ihr')!.accepted).toContain('seid gezogen');

    const stehen = verb('stehen', { specialB1Forms: { alternativeAuxiliary: 'sein' } });
    expect(resolveTarget(stehen, 'presentPerfect', 'ich')!.accepted).toContain('bin gestanden');
  });

  it('inflects an alternative Konjunktiv II', () => {
    const brauchen = verb('brauchen', { specialB1Forms: { alternativeKonjunktivII: 'bräuchte' } });
    expect(resolveTarget(brauchen, 'konjunktivII', 'du')!.accepted).toContain('bräuchtest');
  });
});
