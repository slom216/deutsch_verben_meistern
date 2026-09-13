import { FORM_CATEGORY_META, type FormCategory } from '@/types/formCategory';
import { PERSONS, PERSON_LABELS, type Person, type Verb } from '@/types/verb';
import { makeCardId, NO_SLOT } from '@/lib/srs';
import type { Rng } from '@/lib/random';
import { capitalizeFirst, tokenize } from '@/lib/text';
import {
  frameParts,
  isSingleClause,
  locateInExample,
  personsReadAs,
  resolveTarget,
  simpleFrame,
  slotsFor,
  SUBJECT_PRONOUN,
  type FormTarget,
} from './formAccess';
import { buildDistractors, buildWrongForm } from './distractors';
import {
  EXERCISE_TYPE_META,
  type Exercise,
  type ExerciseType,
  type MatchingPair,
} from './types';

/**
 * Exercise generation.
 *
 * Each generator takes a scheduled target — one form of one verb — and either
 * returns a playable exercise or `null` when that form cannot support the
 * format. Returning null is normal and expected: sentence reconstruction needs
 * a usable example sentence, tense transformation needs a second tense to
 * transform from. The session builder falls back to another format.
 */

export interface GeneratorContext {
  target: FormTarget;
  rng: Rng;
  /** Other verbs, used for distractors. */
  pool: readonly Verb[];
  /** Categories the learner currently has switched on. */
  enabledCategories: readonly FormCategory[];
  /** Show English meanings alongside prompts. */
  showTranslations: boolean;
}

type Generator = (context: GeneratorContext) => Exercise | null;

function xpFor(category: FormCategory, type: ExerciseType): number {
  return Math.round(FORM_CATEGORY_META[category].xp * EXERCISE_TYPE_META[type].xpMultiplier);
}

function exerciseId(target: FormTarget, type: ExerciseType, rng: Rng): string {
  return `${target.verb.id}|${target.category}|${target.slot}|${type}|${Math.floor(rng.next() * 1e9)}`;
}

function cardIdFor(target: FormTarget): string {
  return makeCardId(target.verb.id, target.category, target.slot);
}

function englishOf(verb: Verb): string {
  return verb.english.join(', ');
}

/** A short nudge that never gives the form away. */
function hintFor({ verb, category }: FormTarget): string {
  const notes = [englishOf(verb)];
  if (verb.regularity !== 'regular') notes.push(`${verb.regularity} verb`);
  if (verb.separable && category !== 'separability') notes.push(`separable prefix "${verb.prefix}"`);
  return `${verb.infinitive}: ${notes.join('; ')}`;
}

function baseFields(target: FormTarget, type: ExerciseType, rng: Rng, showTranslations: boolean) {
  return {
    id: exerciseId(target, type, rng),
    type,
    cardIds: [cardIdFor(target)],
    verbId: target.verb.id,
    infinitive: target.verb.infinitive,
    category: target.category,
    prompt: target.prompt,
    context: showTranslations ? englishOf(target.verb) : undefined,
    explanation: target.explanation,
    baseXp: xpFor(target.category, type),
  };
}

/* ------------------------------------------------------------------ */
/* 1. Multiple choice                                                   */
/* ------------------------------------------------------------------ */

const multipleChoice: Generator = ({ target, rng, pool, showTranslations }) => {
  const distractors = buildDistractors({
    verb: target.verb,
    category: target.category,
    slot: target.slot,
    answer: target.answer,
    accepted: target.accepted,
    pool,
    rng,
    count: 3,
  });

  // Binary categories — separable or not, haben or sein, accusative or dative
  // — genuinely have only one alternative, and a two-option question is the
  // honest way to ask them.
  if (distractors.length < 1) return null;

  const options = rng.shuffle([target.answer, ...distractors]);
  const question = questionText(target);

  return {
    ...baseFields(target, 'multipleChoice', rng, showTranslations),
    type: 'multipleChoice',
    question,
    options,
    answer: target.answer,
  };
};

/** The headline question line for a target, adapted to its category. */
function questionText(target: FormTarget): string {
  const { verb, category, slot } = target;
  switch (category) {
    case 'auxiliary':
      return `Which auxiliary does "${verb.infinitive}" use in the Perfekt?`;
    case 'separability':
      return `Is "${verb.infinitive}" separable or inseparable?`;
    case 'reflexivePattern':
      return `"${verb.infinitive}" — which case is the reflexive pronoun?`;
    case 'caseAndPreposition':
      return target.prompt;
    case 'pastParticiple':
      return `What is the Partizip II of "${verb.infinitive}"?`;
    case 'presentParticiple':
      return `What is the Partizip I of "${verb.infinitive}"?`;
    case 'infinitiveWithZu':
      return `What is the zu-infinitive of "${verb.infinitive}"?`;
    case 'imperative':
      return `Give the ${slot === 'Sie' ? 'Sie' : slot} imperative of "${verb.infinitive}".`;
    default:
      return `"${verb.infinitive}" — ${FORM_CATEGORY_META[category].short}, ${
        PERSONS.includes(slot as Person) ? PERSON_LABELS[slot as Person] : slot
      }`;
  }
}

/* ------------------------------------------------------------------ */
/* 2. Typed conjugation                                                 */
/* ------------------------------------------------------------------ */

const typedConjugation: Generator = ({ target, rng, showTranslations }) => {
  // Closed-set grammar facts are recognition material, not typing practice.
  if (
    target.category === 'separability' ||
    target.category === 'reflexivePattern' ||
    target.category === 'auxiliary'
  ) {
    return null;
  }

  return {
    ...baseFields(target, 'typedConjugation', rng, showTranslations),
    type: 'typedConjugation',
    question: questionText(target),
    accepted: target.accepted,
    answer: target.answer,
    hint: hintFor(target),
  };
};

/* ------------------------------------------------------------------ */
/* 3. Sentence completion                                               */
/* ------------------------------------------------------------------ */

const sentenceCompletion: Generator = ({ target, rng, showTranslations }) => {
  const { verb, category, slot } = target;
  if (!PERSONS.includes(slot as Person)) return null;
  if (!['present', 'simplePast', 'presentPerfect', 'futureI', 'konjunktivII'].includes(category)) {
    return null;
  }

  const person = slot as Person;

  // Prefer the curated example when it contains this exact form with an
  // agreeing subject — real German beats a synthetic frame.
  const located = locateInExample(verb, target.answer, person);
  const useExample = located !== null;

  const { before, after } = useExample ? located : frameParts(person);

  return {
    ...baseFields(target, 'sentenceCompletion', rng, showTranslations),
    type: 'sentenceCompletion',
    prompt: `Complete the sentence — ${FORM_CATEGORY_META[category].short}, ${PERSON_LABELS[person]}`,
    before,
    after,
    accepted: target.accepted,
    answer: target.answer,
    translation: showTranslations && useExample ? verb.example.english : undefined,
    hint: `${verb.infinitive} (${englishOf(verb)})`,
  };
};

/* ------------------------------------------------------------------ */
/* 4. Matching                                                          */
/* ------------------------------------------------------------------ */

const matching: Generator = ({ target, rng, showTranslations }) => {
  const { verb, category } = target;
  if (!['present', 'simplePast', 'presentPerfect', 'futureI', 'konjunktivII'].includes(category)) {
    return null;
  }

  const person = target.slot as Person;
  const slots = slotsFor(verb, category) as Person[];
  if (!slots.includes(person)) return null;

  const pairs: MatchingPair[] = [];
  const seenRight = new Set<string>();

  // Syncretic slots (wir/sie/Sie share a form) would make matching ambiguous,
  // so a repeated form is dropped. The scheduled person goes first, so it is
  // always the neighbour that gets dropped, never the card under review.
  for (const candidate of [person, ...slots.filter((p) => p !== person)]) {
    if (pairs.length === 4) break;
    const resolved = resolveTarget(verb, category, candidate);
    if (!resolved) continue;
    if (seenRight.has(resolved.answer.toLowerCase())) continue;
    seenRight.add(resolved.answer.toLowerCase());
    pairs.push({
      left: PERSON_LABELS[candidate],
      right: resolved.answer,
      cardId: makeCardId(verb.id, category, candidate),
    });
  }

  if (pairs.length < 3) return null;

  const order = (pair: MatchingPair) => PERSONS.findIndex((p) => PERSON_LABELS[p] === pair.left);
  const chosen = pairs.sort((a, b) => order(a) - order(b));

  return {
    ...baseFields(target, 'matching', rng, showTranslations),
    cardIds: chosen.map((pair) => pair.cardId),
    type: 'matching',
    prompt: `Match each pronoun to the correct ${FORM_CATEGORY_META[category].short} form of "${verb.infinitive}"`,
    pairs: chosen,
    shuffledRight: rng.shuffle(chosen.map((p) => p.right)),
    explanation: `${verb.infinitive} — ${FORM_CATEGORY_META[category].label}.`,
  };
};

/* ------------------------------------------------------------------ */
/* 5. Error correction                                                  */
/* ------------------------------------------------------------------ */

const errorCorrection: Generator = ({ target, rng, pool, showTranslations }) => {
  const { verb, category, slot } = target;
  if (!PERSONS.includes(slot as Person)) return null;
  if (!['present', 'simplePast', 'presentPerfect', 'futureI'].includes(category)) return null;

  const person = slot as Person;

  // The "wrong" token must be wrong for every person the displayed subject
  // could denote, or a grammatical sentence gets struck out ("Sie darf.").
  // Example sentences only locate unambiguous subjects, so the frame pronoun's
  // readings cover both cases.
  const rightForSubject = personsReadAs(SUBJECT_PRONOUN[person]).flatMap(
    (p) => resolveTarget(verb, category, p)?.accepted ?? [],
  );
  const wrong = buildWrongForm({
    verb,
    category,
    slot,
    answer: target.answer,
    accepted: [...target.accepted, ...rightForSubject],
    pool,
    rng,
  });
  if (!wrong) return null;

  const located = locateInExample(verb, target.answer, person);
  const useExample =
    located !== null && tokenize(wrong).length === tokenize(target.answer).length;
  const sentence = useExample
    ? capitalizeFirst(`${located.before}${wrong}${located.after}`)
    : simpleFrame(person, wrong);

  return {
    ...baseFields(target, 'errorCorrection', rng, showTranslations),
    type: 'errorCorrection',
    prompt: 'This sentence has a wrong verb form. Type the corrected form.',
    sentence,
    wrongToken: wrong,
    accepted: target.accepted,
    answer: target.answer,
    translation: showTranslations && useExample ? verb.example.english : undefined,
    hint: `${FORM_CATEGORY_META[category].short}, ${PERSON_LABELS[person]}`,
    explanation: `"${wrong}" is wrong here — ${PERSON_LABELS[person]} takes "${target.answer}".`,
  };
};

/* ------------------------------------------------------------------ */
/* 6. Tense transformation                                              */
/* ------------------------------------------------------------------ */

const TRANSFORMABLE: FormCategory[] = [
  'present',
  'simplePast',
  'presentPerfect',
  'futureI',
  'konjunktivII',
];

const tenseTransformation: Generator = ({
  target,
  rng,
  enabledCategories,
  showTranslations,
}) => {
  const { verb, category, slot } = target;
  if (!PERSONS.includes(slot as Person)) return null;
  if (!TRANSFORMABLE.includes(category)) return null;

  const person = slot as Person;

  // Transform *from* a tense the learner already has switched on, preferring
  // the present as the most familiar starting point.
  const sourceCandidates = TRANSFORMABLE.filter(
    (c) => c !== category && enabledCategories.includes(c),
  );
  const source =
    sourceCandidates.find((c) => c === 'present') ??
    (sourceCandidates.length > 0 ? rng.pick(sourceCandidates) : null);
  if (!source) return null;

  const sourceTarget = resolveTarget(verb, source, person);
  if (!sourceTarget) return null;

  // Rewrite the curated example when it holds the source form with an agreeing
  // subject. Swapping in a multi-word form is only safe when nothing follows
  // the verb; otherwise the German verb bracket would break.
  const located = locateInExample(verb, sourceTarget.answer, person);
  const inExample = (form: string): string | null =>
    located && (!form.includes(' ') || !/[^\s.!?]/.test(located.after))
      ? capitalizeFirst(`${located.before}${form}${located.after}`)
      : null;
  const useExample = inExample(target.answer) !== null;

  const sourceSentence = useExample
    ? verb.example.german.trim()
    : simpleFrame(person, sourceTarget.answer);
  const answer = inExample(target.answer) ?? simpleFrame(person, target.answer);

  // Accept the bare form or the whole rewritten sentence (a frame with either ending).
  const accepted = target.accepted.flatMap((form) => {
    if (useExample) return [form, ...[inExample(form)].filter((v): v is string => v !== null)];
    const frame = simpleFrame(person, form);
    return [form, frame, frame.replace(/ …$/, '.')];
  });

  return {
    ...baseFields(target, 'tenseTransformation', rng, showTranslations),
    type: 'tenseTransformation',
    prompt: `Rewrite in the ${FORM_CATEGORY_META[category].short}`,
    sourceSentence,
    fromLabel: FORM_CATEGORY_META[source].short,
    toLabel: FORM_CATEGORY_META[category].short,
    accepted,
    answer,
    explanation: `${FORM_CATEGORY_META[source].short}: ${sourceSentence} → ${FORM_CATEGORY_META[category].short}: ${answer}`,
  };
};

/* ------------------------------------------------------------------ */
/* 7. Sentence reconstruction                                           */
/* ------------------------------------------------------------------ */

const sentenceReconstruction: Generator = ({ target, rng, showTranslations }) => {
  const { verb, category, slot } = target;

  // The puzzle must exercise the scheduled card: its form has to appear in the
  // example with an agreeing subject, or solving it reviews an unrelated card.
  if (!PERSONS.includes(slot as Person)) return null;
  if (!locateInExample(verb, target.answer, slot as Person)) return null;

  // Word order is only worth drilling on a genuine, single-clause sentence.
  const sentence = verb.example.german.trim();
  if (!isSingleClause(sentence)) return null;
  const terminal = /[.!?]$/.test(sentence) ? sentence.slice(-1) : '.';

  const raw = sentence.split(/\s+/);
  if (raw.length < 4 || raw.length > 9) return null;

  // Strip the final punctuation mark; it is re-added on display.
  const tokens = raw.map((token, index) =>
    index === raw.length - 1 ? token.replace(/[.!?]+$/, '') : token,
  );
  if (tokens.some((t) => t.length === 0)) return null;

  // Only useful if the words can be told apart when scrambled.
  if (new Set(tokens.map((t) => t.toLowerCase())).size !== tokens.length) return null;

  let scrambled = rng.shuffle(tokens);
  // Guarantee the puzzle is not handed over already solved.
  for (let attempt = 0; attempt < 5 && scrambled.every((t, i) => t === tokens[i]); attempt += 1) {
    scrambled = rng.shuffle(tokens);
  }
  if (scrambled.every((t, i) => t === tokens[i])) return null;

  return {
    ...baseFields(target, 'sentenceReconstruction', rng, showTranslations),
    cardIds: [makeCardId(verb.id, category, slot)],
    type: 'sentenceReconstruction',
    prompt: `Build a correct German sentence with "${verb.infinitive}"`,
    tokens: scrambled,
    correctOrder: tokens,
    terminal,
    translation: showTranslations ? verb.example.english : undefined,
    explanation: `${sentence} — ${verb.example.english}`,
  };
};

/* ------------------------------------------------------------------ */

export const GENERATORS: Record<ExerciseType, Generator> = {
  multipleChoice,
  typedConjugation,
  sentenceCompletion,
  matching,
  errorCorrection,
  tenseTransformation,
  sentenceReconstruction,
};

/**
 * Build an exercise for a target, trying the learner's enabled formats in a
 * random order and falling back to multiple choice, which always works.
 */
export function generateExercise(
  context: GeneratorContext,
  enabledTypes: readonly ExerciseType[],
): Exercise | null {
  if (enabledTypes.length === 0) return null;

  for (const type of context.rng.shuffle(enabledTypes)) {
    const exercise = GENERATORS[type](context);
    if (exercise) return exercise;
  }

  // Last resort: a format the learner disabled is better than no question.
  return GENERATORS.multipleChoice(context) ?? GENERATORS.typedConjugation(context);
}

/** Exercise formats that can present this target at all. */
export function supportedTypes(
  context: GeneratorContext,
  candidates: readonly ExerciseType[],
): ExerciseType[] {
  return candidates.filter((type) => GENERATORS[type](context) !== null);
}

/** Full display text of a reconstruction answer, for feedback. */
export function renderSentence(tokens: readonly string[], terminal = '.'): string {
  return `${capitalizeFirst(tokens.join(' '))}${terminal}`;
}

/** Number of scrambled tokens, used by the UI to size the drop area. */
export function tokenCount(sentence: string): number {
  return tokenize(sentence).length;
}

export { SUBJECT_PRONOUN, NO_SLOT };
