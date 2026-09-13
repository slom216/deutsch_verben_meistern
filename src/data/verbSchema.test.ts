import { describe, expect, it } from 'vitest';
import a1 from '@/data/verbs/a1.json';
import a2 from '@/data/verbs/a2.json';
import b1 from '@/data/verbs/b1.json';
import type { Verb, VerbDataset } from '@/types/verb';
import { validateDataset } from './verbSchema';

// JSON imports rather than node:fs: tsconfig.app.json type-checks src without Node types.
const DATASETS = {
  a1: a1 as unknown as VerbDataset,
  a2: a2 as unknown as VerbDataset,
  b1: b1 as unknown as VerbDataset,
};

const errorsOf = (raw: unknown, name: string) =>
  validateDataset(raw, name).issues.filter((i) => i.severity === 'error');

/** Clone a dataset, break one verb, and return the audit errors on that verb. */
function errorsAfter(level: keyof typeof DATASETS, verbId: string, mutate: (v: Verb) => void) {
  const dataset = structuredClone(DATASETS[level]);
  const target = dataset.verbs.find((v) => v.id === verbId);
  if (!target) throw new Error(`no verb ${verbId}`);
  mutate(target);
  return errorsOf(dataset, level).filter((i) => i.verbId === verbId);
}

describe('shipped datasets', () => {
  it.each(Object.keys(DATASETS))('%s has no audit errors', (level) => {
    expect(errorsOf(DATASETS[level as keyof typeof DATASETS], level)).toEqual([]);
  });
});

describe('validateDataset catches historic data mistakes', () => {
  it.each([
    ['du "behandeltst"', 'b1', 'b1v-053-behandeln', 'forms.present.du', (v: Verb) => {
      v.forms.present.du = 'behandeltst';
    }],
    ['ihr "brennet"', 'b1', 'b1v-084-brennen', 'forms.present.ihr', (v: Verb) => {
      v.forms.present.ihr = 'brennet';
    }],
    ['Partizip I "seind"', 'a1', 'a1v-001-sein', 'forms.participles.present', (v: Verb) => {
      v.forms.participles.present = 'seind';
    }],
    ['stray full stop "übernommen."', 'b1', 'b1v-342-uebernehmen', 'forms.participles.past', (v: Verb) => {
      v.forms.participles.past = 'übernommen.';
    }],
    ['Präteritum "schrieen"', 'a1', 'a1v-035-schreiben', 'forms.simplePast.wir', (v: Verb) => {
      v.forms.simplePast.wir = 'schrieen';
    }],
    ['du "eröffnst"', 'a1', 'a1v-158-eroffnen', 'forms.present.du', (v: Verb) => {
      v.forms.present.du = 'eröffnst';
    }],
    ['imperative ihr "brennet"', 'b1', 'b1v-084-brennen', 'forms.imperative.ihr', (v: Verb) => {
      v.forms.imperative.ihr = 'brennet';
    }],
    ['thirdPersonOnly verb with an imperative', 'b1', 'b1v-197-sich-lohnen', 'forms.imperative.available', (v: Verb) => {
      v.forms.imperative = { available: true, du: 'lohn dich', ihr: 'lohnt euch', Sie: 'lohnen Sie sich', reason: null };
    }],
  ] as const)('%s', (_label, level, verbId, path, mutate) => {
    const errors = errorsAfter(level, verbId, mutate);
    expect(errors.map((e) => e.path)).toContain(path);
  });
});
