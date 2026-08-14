/**
 * Practice form categories — the switchable units of study.
 *
 * A category is what the settings page turns on and off, what the exercise
 * generators target, and what spaced repetition schedules. Categories are
 * either *paradigm* categories (a form per grammatical person) or *property*
 * categories (one fact about the verb as a whole).
 */

export const FORM_CATEGORIES = [
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
] as const;

export type FormCategory = (typeof FORM_CATEGORIES)[number];

export interface FormCategoryMeta {
  id: FormCategory;
  label: string;
  short: string;
  description: string;
  /** Paradigm categories vary by person; property categories do not. */
  kind: 'paradigm' | 'property';
  /** Rough teaching order, used for sensible defaults and grouping. */
  group: 'core-tenses' | 'moods' | 'non-finite' | 'grammar';
  /** Base XP awarded for a correct answer in this category. */
  xp: number;
}

export const FORM_CATEGORY_META: Record<FormCategory, FormCategoryMeta> = {
  present: {
    id: 'present',
    label: 'Present (Präsens)',
    short: 'Präsens',
    description: 'The everyday tense — ich gehe, du gehst, er geht.',
    kind: 'paradigm',
    group: 'core-tenses',
    xp: 10,
  },
  simplePast: {
    id: 'simplePast',
    label: 'Simple past (Präteritum)',
    short: 'Präteritum',
    description: 'Written narrative past, and the spoken past of sein, haben and modals.',
    kind: 'paradigm',
    group: 'core-tenses',
    xp: 12,
  },
  presentPerfect: {
    id: 'presentPerfect',
    label: 'Present perfect (Perfekt)',
    short: 'Perfekt',
    description: 'The spoken past: auxiliary plus past participle.',
    kind: 'paradigm',
    group: 'core-tenses',
    xp: 14,
  },
  futureI: {
    id: 'futureI',
    label: 'Future I (Futur I)',
    short: 'Futur I',
    description: 'werden plus infinitive, for intentions and predictions.',
    kind: 'paradigm',
    group: 'core-tenses',
    xp: 10,
  },
  imperative: {
    id: 'imperative',
    label: 'Imperative (Imperativ)',
    short: 'Imperativ',
    description: 'Commands and requests for du, ihr and Sie.',
    kind: 'paradigm',
    group: 'moods',
    xp: 12,
  },
  konjunktivII: {
    id: 'konjunktivII',
    label: 'Konjunktiv II',
    short: 'Konj. II',
    description: 'Politeness, wishes and hypotheticals — wäre, hätte, würde gehen.',
    kind: 'paradigm',
    group: 'moods',
    xp: 16,
  },
  pastParticiple: {
    id: 'pastParticiple',
    label: 'Past participle (Partizip II)',
    short: 'Partizip II',
    description: 'The participle used to build the perfect and the passive.',
    kind: 'property',
    group: 'non-finite',
    xp: 10,
  },
  presentParticiple: {
    id: 'presentParticiple',
    label: 'Present participle (Partizip I)',
    short: 'Partizip I',
    description: 'The -end form used adjectivally: laufend, singend.',
    kind: 'property',
    group: 'non-finite',
    xp: 8,
  },
  infinitiveWithZu: {
    id: 'infinitiveWithZu',
    label: 'Infinitive with zu',
    short: 'zu-Infinitiv',
    description: 'Where zu lands — especially inside separable verbs (aufzustehen).',
    kind: 'property',
    group: 'non-finite',
    xp: 10,
  },
  auxiliary: {
    id: 'auxiliary',
    label: 'Auxiliary (haben / sein)',
    short: 'Hilfsverb',
    description: 'Which helper verb the perfect tenses take.',
    kind: 'property',
    group: 'grammar',
    xp: 8,
  },
  separability: {
    id: 'separability',
    label: 'Separability',
    short: 'Trennbarkeit',
    description: 'Whether the prefix detaches, and where it goes in the sentence.',
    kind: 'property',
    group: 'grammar',
    xp: 8,
  },
  reflexivePattern: {
    id: 'reflexivePattern',
    label: 'Reflexive pattern',
    short: 'Reflexiv',
    description: 'Reflexive pronouns and whether they are accusative or dative.',
    kind: 'property',
    group: 'grammar',
    xp: 10,
  },
  caseAndPreposition: {
    id: 'caseAndPreposition',
    label: 'Case & preposition',
    short: 'Kasus',
    description: 'Verb valency: required cases and fixed prepositions.',
    kind: 'property',
    group: 'grammar',
    xp: 12,
  },
};

export const CATEGORY_GROUP_LABELS: Record<FormCategoryMeta['group'], string> = {
  'core-tenses': 'Core tenses',
  moods: 'Moods',
  'non-finite': 'Non-finite forms',
  grammar: 'Grammar properties',
};

export function isFormCategory(value: string): value is FormCategory {
  return (FORM_CATEGORIES as readonly string[]).includes(value);
}
