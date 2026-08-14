import type { FormCategory } from '@/types/formCategory';
import type { CardId } from '@/lib/srs';

/**
 * Exercise contracts.
 *
 * Every exercise carries the SRS card ids it exercises, so grading can feed
 * results straight back into the scheduler without the UI having to know how
 * scheduling works.
 */

export const EXERCISE_TYPES = [
  'multipleChoice',
  'typedConjugation',
  'sentenceCompletion',
  'matching',
  'errorCorrection',
  'tenseTransformation',
  'sentenceReconstruction',
] as const;

export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export interface ExerciseTypeMeta {
  id: ExerciseType;
  label: string;
  description: string;
  /** Recognition exercises show the answer; production exercises demand it. */
  mode: 'recognition' | 'production';
  /** Multiplier applied to the category's base XP. */
  xpMultiplier: number;
}

export const EXERCISE_TYPE_META: Record<ExerciseType, ExerciseTypeMeta> = {
  multipleChoice: {
    id: 'multipleChoice',
    label: 'Multiple choice',
    description: 'Pick the correct form from four options.',
    mode: 'recognition',
    xpMultiplier: 1,
  },
  typedConjugation: {
    id: 'typedConjugation',
    label: 'Typed conjugation',
    description: 'Type the form yourself — the strongest test of recall.',
    mode: 'production',
    xpMultiplier: 1.6,
  },
  sentenceCompletion: {
    id: 'sentenceCompletion',
    label: 'Sentence completion',
    description: 'Fill the gap in a real sentence.',
    mode: 'production',
    xpMultiplier: 1.5,
  },
  matching: {
    id: 'matching',
    label: 'Matching',
    description: 'Pair each pronoun with its form.',
    mode: 'recognition',
    xpMultiplier: 1.2,
  },
  errorCorrection: {
    id: 'errorCorrection',
    label: 'Correct the mistake',
    description: 'Find the wrong form in a sentence and fix it.',
    mode: 'production',
    xpMultiplier: 1.7,
  },
  tenseTransformation: {
    id: 'tenseTransformation',
    label: 'Tense transformation',
    description: 'Rewrite a sentence in another tense.',
    mode: 'production',
    xpMultiplier: 1.8,
  },
  sentenceReconstruction: {
    id: 'sentenceReconstruction',
    label: 'Sentence building',
    description: 'Put scrambled words into correct German word order.',
    mode: 'production',
    xpMultiplier: 1.5,
  },
};

interface ExerciseBase {
  id: string;
  type: ExerciseType;
  /** SRS cards reviewed by this exercise. */
  cardIds: CardId[];
  verbId: string;
  infinitive: string;
  category: FormCategory;
  /** Instruction line, e.g. "Conjugate in the Perfekt". */
  prompt: string;
  /** Optional supporting context, e.g. the English meaning. */
  context?: string;
  hint?: string;
  /** Shown after answering, whatever the outcome. */
  explanation: string;
  baseXp: number;
}

export interface MultipleChoiceExercise extends ExerciseBase {
  type: 'multipleChoice';
  question: string;
  options: string[];
  answer: string;
}

export interface TypedConjugationExercise extends ExerciseBase {
  type: 'typedConjugation';
  question: string;
  /** Every spelling that should be accepted. */
  accepted: string[];
  /** The canonical answer to display. */
  answer: string;
}

export interface SentenceCompletionExercise extends ExerciseBase {
  type: 'sentenceCompletion';
  /** Sentence split around a single gap. */
  before: string;
  after: string;
  accepted: string[];
  answer: string;
  translation?: string;
}

export interface MatchingPair {
  left: string;
  right: string;
}

export interface MatchingExercise extends ExerciseBase {
  type: 'matching';
  pairs: MatchingPair[];
  /** Right-hand values in presentation order. */
  shuffledRight: string[];
}

export interface ErrorCorrectionExercise extends ExerciseBase {
  type: 'errorCorrection';
  /** The sentence containing exactly one wrong verb form. */
  sentence: string;
  /** The incorrect token the learner has to replace. */
  wrongToken: string;
  accepted: string[];
  answer: string;
  translation?: string;
}

export interface TenseTransformationExercise extends ExerciseBase {
  type: 'tenseTransformation';
  sourceSentence: string;
  fromLabel: string;
  toLabel: string;
  accepted: string[];
  answer: string;
}

export interface SentenceReconstructionExercise extends ExerciseBase {
  type: 'sentenceReconstruction';
  /** Tokens in scrambled presentation order. */
  tokens: string[];
  correctOrder: string[];
  translation?: string;
}

export type Exercise =
  | MultipleChoiceExercise
  | TypedConjugationExercise
  | SentenceCompletionExercise
  | MatchingExercise
  | ErrorCorrectionExercise
  | TenseTransformationExercise
  | SentenceReconstructionExercise;

/** A learner's response, shaped per exercise type. */
export type ExerciseResponse =
  | { kind: 'text'; value: string }
  | { kind: 'choice'; value: string | null }
  | { kind: 'order'; value: string[] }
  | { kind: 'pairs'; value: Record<string, string> };

export function isProduction(type: ExerciseType): boolean {
  return EXERCISE_TYPE_META[type].mode === 'production';
}
