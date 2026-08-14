/**
 * Verb content types. These mirror the shipped JSON datasets exactly; the
 * runtime guarantee that the data matches lives in `src/data/verbSchema.ts`.
 *
 * Content is deliberately kept free of any interface concerns so datasets can
 * be regenerated or extended without touching application code.
 */

export const CEFR_LEVELS = ['A1', 'A2', 'B1'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** The six conjugation slots used throughout the datasets. */
export const PERSONS = ['ich', 'du', 'erSieEs', 'wir', 'ihr', 'sieSie'] as const;
export type Person = (typeof PERSONS)[number];

export const PERSON_LABELS: Record<Person, string> = {
  ich: 'ich',
  du: 'du',
  erSieEs: 'er/sie/es',
  wir: 'wir',
  ihr: 'ihr',
  sieSie: 'sie/Sie',
};

/** English gloss for each slot, used in prompts and feedback. */
export const PERSON_ENGLISH: Record<Person, string> = {
  ich: 'I',
  du: 'you (informal sg.)',
  erSieEs: 'he/she/it',
  wir: 'we',
  ihr: 'you (informal pl.)',
  sieSie: 'they / you (formal)',
};

export type PersonForms = Record<Person, string>;

export const IMPERATIVE_TARGETS = ['du', 'ihr', 'Sie'] as const;
export type ImperativeTarget = (typeof IMPERATIVE_TARGETS)[number];

export interface ImperativeForms {
  available: boolean;
  du: string | null;
  ihr: string | null;
  Sie: string | null;
  /** Why the imperative is unavailable (e.g. modal or impersonal verb). */
  reason: string | null;
}

export interface KonjunktivII {
  /** Which of the two realisations the datasets consider idiomatic. */
  preferred: 'synthetic' | 'würdeForm';
  /** Null when only the analytic würde form is in productive use. */
  synthetic: PersonForms | null;
  würdeForm: PersonForms;
}

export interface Participles {
  present: string;
  past: string;
}

export interface VerbFormBundle {
  present: PersonForms;
  simplePast: PersonForms;
  presentPerfect: PersonForms;
  futureI: PersonForms;
  imperative: ImperativeForms;
  konjunktivII: KonjunktivII;
  participles: Participles;
  infinitiveWithZu: string;
  thirdPersonPresent: string;
}

/** Tense-like bundles that are keyed by grammatical person. */
export const PERSONAL_TENSES = ['present', 'simplePast', 'presentPerfect', 'futureI'] as const;
export type PersonalTense = (typeof PERSONAL_TENSES)[number];

export interface ReflexiveInfo {
  isReflexive: boolean;
  case: 'accusative' | 'dative' | null;
  /** Present only on datasets that distinguish obligatory from optional use. */
  required?: boolean;
  optional?: boolean;
}

export interface FixedPreposition {
  preposition: string;
  case: string;
  meaning: string;
}

export interface VerbExample {
  german: string;
  english: string;
}

/**
 * Per-verb answer-checking policy. Each flag says whether a given feature is
 * graded strictly for this entry; the learner's own settings can only make
 * grading more lenient, never stricter than the content allows.
 */
export interface VerbStrictness {
  capitalization: boolean;
  umlauts: boolean;
  eszett: boolean;
  wordOrder: boolean;
  auxiliary: boolean;
  reflexivePronoun: boolean;
  separablePrefix: boolean;
}

/**
 * A lexicalised variant or editorial annotation, such as `möchten` under
 * `mögen`, or a bare alternative form string like `alternativeSimplePast`.
 */
export type SpecialForm =
  | string
  | {
      english?: string | string[];
      forms?: Partial<PersonForms>;
      [key: string]: unknown;
    };

export interface Verb {
  id: string;
  rank: number;
  level: CefrLevel;
  infinitive: string;
  dictionaryForm: string;
  english: string[];
  topic: string;
  frequencyBand: string;
  verbClasses: string[];
  regularity: 'regular' | 'irregular' | 'mixed';
  separable: boolean;
  prefix: string | null;
  reflexive: ReflexiveInfo;
  auxiliary: 'haben' | 'sein' | string;
  requiredCases: string[];
  fixedPrepositions: FixedPreposition[];
  forms: VerbFormBundle;
  /** Conjugations for the optional reflexive reading, when the entry has one. */
  optionalReflexiveForms?: Partial<Record<PersonalTense, PersonForms>>;
  specialA1Forms?: Record<string, SpecialForm>;
  specialA2Forms?: Record<string, SpecialForm>;
  specialB1Forms?: Record<string, SpecialForm>;
  usageRestrictions?: { mostlyImpersonal?: boolean; notes?: string[] };
  sourceMetadata?: Record<string, unknown>;
  example: VerbExample;
  practiceForms: string[];
  strictness: VerbStrictness;
  editorialReview?: { status?: string; nativeSpeakerReviewRecommended?: boolean };
}

export interface VerbDatasetMetadata {
  title: string;
  schemaVersion: number;
  level: CefrLevel;
  entryCount: number;
  [key: string]: unknown;
}

export interface VerbDataset {
  metadata: VerbDatasetMetadata;
  verbs: Verb[];
}

/** Collect the lexicalised variants regardless of which level named them. */
export function specialForms(verb: Verb): Record<string, SpecialForm> {
  return {
    ...(verb.specialA1Forms ?? {}),
    ...(verb.specialA2Forms ?? {}),
    ...(verb.specialB1Forms ?? {}),
  };
}
