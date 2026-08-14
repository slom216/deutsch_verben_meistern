import { z } from 'zod';
import { PERSONS } from '@/types/verb';
import type { CefrLevel, Verb, VerbDataset } from '@/types/verb';

/**
 * Machine validation for every shipped verb entry.
 *
 * The schema is intentionally strict about the shapes the exercise generators
 * depend on (a full six-slot paradigm, a past participle, an auxiliary) and
 * permissive about descriptive metadata, which varies between levels.
 */

const nonEmpty = z.string().min(1);

const personForms = z.object(
  Object.fromEntries(PERSONS.map((p) => [p, nonEmpty])) as Record<
    (typeof PERSONS)[number],
    z.ZodString
  >,
);

const imperativeSchema = z.object({
  available: z.boolean(),
  du: z.string().nullable(),
  ihr: z.string().nullable(),
  Sie: z.string().nullable(),
  reason: z.string().nullable(),
});

const konjunktivSchema = z.object({
  preferred: z.enum(['synthetic', 'würdeForm']),
  synthetic: personForms.nullable(),
  würdeForm: personForms,
});

const reflexiveSchema = z.object({
  isReflexive: z.boolean(),
  case: z.enum(['accusative', 'dative']).nullable(),
  required: z.boolean().optional(),
  optional: z.boolean().optional(),
});

const fixedPrepositionSchema = z.object({
  preposition: nonEmpty,
  case: nonEmpty,
  meaning: z.string(),
});

const strictnessSchema = z.object({
  capitalization: z.boolean(),
  umlauts: z.boolean(),
  eszett: z.boolean(),
  wordOrder: z.boolean(),
  auxiliary: z.boolean(),
  reflexivePronoun: z.boolean(),
  separablePrefix: z.boolean(),
});

/**
 * Lexicalised variants and editorial annotations. This is an open bag: some
 * entries attach a whole sub-paradigm (`transitiveMeaning`), others just a
 * single alternative form string (`alternativeSimplePast: "sandte"`).
 */
const specialFormSchema = z.union([
  z.string().min(1),
  z
    .object({
      english: z.union([z.string(), z.array(z.string())]).optional(),
      forms: personForms.partial().optional(),
    })
    .passthrough(),
]);

export const verbSchema = z
  .object({
    id: nonEmpty,
    rank: z.number().int().positive(),
    level: z.enum(['A1', 'A2', 'B1']),
    infinitive: nonEmpty,
    dictionaryForm: nonEmpty,
    english: z.array(nonEmpty).min(1),
    topic: nonEmpty,
    frequencyBand: nonEmpty,
    verbClasses: z.array(nonEmpty),
    regularity: z.enum(['regular', 'irregular', 'mixed']),
    separable: z.boolean(),
    prefix: z.string().nullable(),
    reflexive: reflexiveSchema,
    auxiliary: nonEmpty,
    requiredCases: z.array(z.string()),
    fixedPrepositions: z.array(fixedPrepositionSchema),
    forms: z.object({
      present: personForms,
      simplePast: personForms,
      presentPerfect: personForms,
      futureI: personForms,
      imperative: imperativeSchema,
      konjunktivII: konjunktivSchema,
      participles: z.object({ present: nonEmpty, past: nonEmpty }),
      infinitiveWithZu: nonEmpty,
      thirdPersonPresent: nonEmpty,
    }),
    optionalReflexiveForms: z
      .object({
        present: personForms.optional(),
        simplePast: personForms.optional(),
        presentPerfect: personForms.optional(),
        futureI: personForms.optional(),
      })
      .optional(),
    specialA1Forms: z.record(specialFormSchema).optional(),
    specialA2Forms: z.record(specialFormSchema).optional(),
    specialB1Forms: z.record(specialFormSchema).optional(),
    usageRestrictions: z
      .object({ mostlyImpersonal: z.boolean().optional(), notes: z.array(z.string()).optional() })
      .optional(),
    sourceMetadata: z.record(z.unknown()).optional(),
    example: z.object({ german: nonEmpty, english: nonEmpty }),
    practiceForms: z.array(nonEmpty),
    strictness: strictnessSchema,
    editorialReview: z
      .object({
        status: z.string().optional(),
        nativeSpeakerReviewRecommended: z.boolean().optional(),
      })
      .optional(),
  })
  .passthrough();

export const verbDatasetSchema = z.object({
  metadata: z
    .object({
      title: nonEmpty,
      schemaVersion: z.number(),
      level: z.enum(['A1', 'A2', 'B1']),
      entryCount: z.number().int().nonnegative(),
    })
    .passthrough(),
  verbs: z.array(verbSchema).min(1),
});

export interface ValidationIssue {
  level: CefrLevel | 'dataset';
  verbId: string | null;
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Semantic checks the shape-level schema cannot express: internal consistency
 * between flags and forms, and the invariants the exercise generators rely on.
 */
export function auditVerb(verb: Verb): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (path: string, message: string, severity: ValidationIssue['severity'] = 'error') =>
    issues.push({ level: verb.level, verbId: verb.id, path, message, severity });

  if (verb.separable && !verb.prefix) {
    add('prefix', 'Marked separable but has no prefix.');
  }
  if (verb.separable && verb.prefix && !verb.forms.infinitiveWithZu.includes('zu')) {
    add('forms.infinitiveWithZu', 'Separable verb is missing an infixed "zu".');
  }
  if (verb.reflexive.isReflexive && !verb.reflexive.case) {
    add('reflexive.case', 'Reflexive verb has no reflexive case.');
  }
  if (!['haben', 'sein'].includes(verb.auxiliary)) {
    add('auxiliary', `Unexpected auxiliary "${verb.auxiliary}".`, 'warning');
  }

  // The perfect paradigm must actually be built from the declared auxiliary.
  const firstPersonPerfect = verb.forms.presentPerfect.ich;
  const expectedAuxStart = verb.auxiliary === 'sein' ? 'bin' : 'habe';
  if (!firstPersonPerfect.startsWith(expectedAuxStart)) {
    add(
      'forms.presentPerfect.ich',
      `Perfect "${firstPersonPerfect}" does not start with "${expectedAuxStart}" for auxiliary "${verb.auxiliary}".`,
      'warning',
    );
  }

  // The past participle must appear in the perfect paradigm.
  const participle = verb.forms.participles.past;
  if (!firstPersonPerfect.includes(participle.split(' ').pop() ?? participle)) {
    add(
      'forms.participles.past',
      `Participle "${participle}" does not appear in perfect "${firstPersonPerfect}".`,
      'warning',
    );
  }

  if (verb.forms.imperative.available) {
    if (!verb.forms.imperative.du && !verb.forms.imperative.ihr && !verb.forms.imperative.Sie) {
      add('forms.imperative', 'Imperative marked available but every slot is null.');
    }
  } else if (!verb.forms.imperative.reason) {
    add('forms.imperative.reason', 'Unavailable imperative should explain why.', 'warning');
  }

  if (verb.forms.konjunktivII.preferred === 'synthetic' && !verb.forms.konjunktivII.synthetic) {
    add('forms.konjunktivII', 'Prefers synthetic Konjunktiv II but none is provided.');
  }

  for (const category of verb.practiceForms) {
    if (
      ![
        'present',
        'simplePast',
        'presentPerfect',
        'futureI',
        'imperative',
        'konjunktivII',
        'pastParticiple',
        'presentParticiple',
        'infinitiveWithZu',
        'auxiliary',
        'separability',
        'reflexivePattern',
        'caseAndPreposition',
      ].includes(category)
    ) {
      add('practiceForms', `Unknown practice category "${category}".`, 'warning');
    }
  }

  if (!verb.example.german.trim().endsWith('.') && !/[!?]$/.test(verb.example.german.trim())) {
    add('example.german', 'Example sentence has no final punctuation.', 'warning');
  }

  return issues;
}

/** Validate a whole dataset: shape, declared count, id uniqueness, semantics. */
export function validateDataset(raw: unknown, sourceName: string) {
  const issues: ValidationIssue[] = [];
  const parsed = verbDatasetSchema.safeParse(raw);

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      const verbIndex = typeof issue.path[1] === 'number' ? issue.path[1] : null;
      issues.push({
        level: 'dataset',
        verbId: verbIndex === null ? null : `${sourceName}[${verbIndex}]`,
        path,
        message: issue.message,
        severity: 'error',
      });
    }
    return { ok: false as const, issues, dataset: null };
  }

  const dataset = parsed.data as unknown as VerbDataset;

  if (dataset.metadata.entryCount !== dataset.verbs.length) {
    issues.push({
      level: dataset.metadata.level,
      verbId: null,
      path: 'metadata.entryCount',
      message: `Declared ${dataset.metadata.entryCount} entries but found ${dataset.verbs.length}.`,
      severity: 'error',
    });
  }

  const seenIds = new Set<string>();
  const seenDictionaryForms = new Map<string, string>();
  for (const verb of dataset.verbs) {
    if (seenIds.has(verb.id)) {
      issues.push({
        level: verb.level,
        verbId: verb.id,
        path: 'id',
        message: 'Duplicate verb id.',
        severity: 'error',
      });
    }
    seenIds.add(verb.id);

    const previous = seenDictionaryForms.get(verb.dictionaryForm);
    if (previous) {
      issues.push({
        level: verb.level,
        verbId: verb.id,
        path: 'dictionaryForm',
        message: `Duplicate dictionary form, also on ${previous}.`,
        severity: 'warning',
      });
    }
    seenDictionaryForms.set(verb.dictionaryForm, verb.id);

    if (verb.level !== dataset.metadata.level) {
      issues.push({
        level: dataset.metadata.level,
        verbId: verb.id,
        path: 'level',
        message: `Entry level "${verb.level}" does not match dataset level "${dataset.metadata.level}".`,
        severity: 'error',
      });
    }

    issues.push(...auditVerb(verb));
  }

  return {
    ok: issues.every((i) => i.severity !== 'error'),
    issues,
    dataset,
  };
}
