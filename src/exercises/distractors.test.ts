import { describe, expect, it } from 'vitest';
import a1 from '@/data/verbs/a1.json';
import a2 from '@/data/verbs/a2.json';
import b1 from '@/data/verbs/b1.json';
import { PERSONS, type Verb, type VerbDataset } from '@/types/verb';
import { FORM_CATEGORIES, type FormCategory } from '@/types/formCategory';
import { createRng } from '@/lib/random';
import { buildDistractors, buildWrongForm } from './distractors';
import { resolveTarget, slotsFor } from './formAccess';

const CORPUS: Verb[] = [a1, a2, b1].flatMap((d) => (d as unknown as VerbDataset).verbs);

function verb(infinitive: string): Verb {
  const found = CORPUS.find((v) => v.infinitive === infinitive);
  if (!found) throw new Error(`no fixture verb ${infinitive}`);
  return found;
}

function request(v: Verb, category: FormCategory, slot: string, count = 4, seed = 7) {
  const target = resolveTarget(v, category, slot);
  if (!target) throw new Error(`no target ${v.infinitive}/${category}/${slot}`);
  return {
    verb: v,
    category,
    slot,
    answer: target.answer,
    accepted: target.accepted,
    pool: CORPUS,
    rng: createRng(seed),
    count,
  };
}

const lower = (values: readonly string[]) => values.map((v) => v.toLowerCase());

describe('buildDistractors', () => {
  it('never offers an accepted answer, never repeats, and respects count', () => {
    const problems: string[] = [];
    // Every 7th verb keeps the sweep fast while still covering all levels.
    for (const v of CORPUS.filter((_, i) => i % 7 === 0)) {
      for (const category of FORM_CATEGORIES) {
        for (const slot of slotsFor(v, category)) {
          for (const count of [1, 3, 5]) {
            const req = request(v, category, slot, count, v.rank);
            const result = buildDistractors(req);
            const where = `${v.id}/${category}/${slot}/${count}`;
            const accepted = new Set(lower(req.accepted));
            if (result.length > count) problems.push(`${where}: too many`);
            if (new Set(lower(result)).size !== result.length) problems.push(`${where}: repeats`);
            if (lower(result).some((r) => accepted.has(r))) problems.push(`${where}: accepted`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('treats accepted answers case-insensitively', () => {
    const req = request(verb('gehen'), 'present', 'du');
    const others = PERSONS.filter((p) => p !== 'du').map((p) => verb('gehen').forms.present[p]);
    const result = buildDistractors({ ...req, accepted: [...req.accepted, ...others.map((o) => o.toUpperCase())] });
    expect(lower(result).some((r) => lower(others).includes(r))).toBe(false);
  });

  it('returns only the fixed option sets for closed-set categories', () => {
    const fixed: Partial<Record<FormCategory, string[]>> = {
      auxiliary: ['haben', 'sein'],
      separability: ['separable', 'inseparable'],
      reflexivePattern: ['accusative', 'dative'],
    };
    const prepositions = ['an', 'auf', 'für', 'mit', 'nach', 'über', 'um', 'von', 'zu', 'bei', 'in'];
    const cases = ['accusative', 'dative', 'genitive', 'dative+accusative'];
    const seen = new Set<FormCategory>();

    for (const v of CORPUS) {
      for (const category of ['auxiliary', 'separability', 'reflexivePattern', 'caseAndPreposition'] as const) {
        if (slotsFor(v, category).length === 0) continue;
        seen.add(category);
        const result = buildDistractors(request(v, category, slotsFor(v, category)[0], 20));
        const allowed =
          category === 'caseAndPreposition'
            ? v.fixedPrepositions.length > 0
              ? prepositions
              : cases
            : fixed[category]!;
        expect(result.every((r) => allowed.includes(r)), `${v.id}/${category}: ${result}`).toBe(true);
        expect(result.length).toBeGreaterThan(0);
      }
    }
    expect(seen.size).toBe(4);
  });

  it('puts the other persons of the same paradigm first for a person slot', () => {
    const v = verb('gehen');
    const req = request(v, 'present', 'du', 8);
    const accepted = new Set(lower(req.accepted));
    const expected = new Set(
      PERSONS.filter((p) => p !== 'du')
        .map((p) => v.forms.present[p])
        .filter((form) => !accepted.has(form.toLowerCase())),
    );
    expect(expected.size).toBeGreaterThan(1);
    const result = buildDistractors(req);
    expect(new Set(result.slice(0, expected.size))).toEqual(expected);
  });

  it('is deterministic for a given seed', () => {
    const v = verb('schreiben');
    expect(buildDistractors(request(v, 'simplePast', 'wir', 4, 99))).toEqual(
      buildDistractors(request(v, 'simplePast', 'wir', 4, 99)),
    );
  });
});

describe('buildWrongForm', () => {
  it('returns a form that is not accepted', () => {
    for (const [infinitive, category, slot] of [
      ['gehen', 'present', 'du'],
      ['schreiben', 'pastParticiple', '_'],
      ['sein', 'presentPerfect', 'ich'],
      ['brennen', 'simplePast', 'ihr'],
    ] as const) {
      const v = verb(infinitive);
      const actualSlot = slotsFor(v, category).includes(slot) ? slot : slotsFor(v, category)[0];
      const { count: _count, ...req } = request(v, category, actualSlot);
      const wrong = buildWrongForm(req);
      expect(wrong, `${infinitive}/${category}`).toBeTruthy();
      expect(lower(req.accepted)).not.toContain(wrong!.toLowerCase());
    }
  });
});
