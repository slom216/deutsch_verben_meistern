import type { FormCategory } from '@/types/formCategory';
import { FORM_CATEGORY_META } from '@/types/formCategory';
import { PERSONS, PERSON_LABELS, type Person, type Verb } from '@/types/verb';
import { NO_SLOT } from '@/lib/srs';
import { capitalizeFirst, tokenize } from '@/lib/text';

/**
 * A single practisable fact: one form of one verb, with everything the
 * generators and the grader need to build a question around it.
 */
export interface FormTarget {
  verb: Verb;
  category: FormCategory;
  /** Person, imperative address form, or `NO_SLOT` for property categories. */
  slot: string;
  /** Canonical answer, shown as the correct one. */
  answer: string;
  /** Every answer the grader should accept. */
  accepted: string[];
  /** Label for the slot, e.g. "du" or "Sie (formal)". */
  slotLabel: string;
  /** Instruction shown to the learner. */
  prompt: string;
  /** Explanation shown after answering. */
  explanation: string;
}

/** Subject pronouns used when a form is embedded in a sentence frame. */
export const SUBJECT_PRONOUN: Record<Person, string> = {
  ich: 'ich',
  du: 'du',
  erSieEs: 'er',
  wir: 'wir',
  ihr: 'ihr',
  sieSie: 'sie',
};

/** Which slots a category can be practised in for this verb. */
export function slotsFor(verb: Verb, category: FormCategory): string[] {
  switch (category) {
    case 'present':
    case 'simplePast':
    case 'presentPerfect':
    case 'futureI':
    case 'konjunktivII':
      return [...PERSONS];
    case 'imperative': {
      if (!verb.forms.imperative.available) return [];
      return (['du', 'ihr', 'Sie'] as const).filter((t) => Boolean(verb.forms.imperative[t]));
    }
    default:
      return [NO_SLOT];
  }
}

function reflexivePronounFor(person: Person, reflexiveCase: 'accusative' | 'dative'): string {
  const accusative: Record<Person, string> = {
    ich: 'mich',
    du: 'dich',
    erSieEs: 'sich',
    wir: 'uns',
    ihr: 'euch',
    sieSie: 'sich',
  };
  const dative: Record<Person, string> = {
    ich: 'mir',
    du: 'dir',
    erSieEs: 'sich',
    wir: 'uns',
    ihr: 'euch',
    sieSie: 'sich',
  };
  return reflexiveCase === 'dative' ? dative[person] : accusative[person];
}

/** Verbs whose datasets record a variable auxiliary, e.g. `"haben/sein"`. */
export function auxiliaryOptions(verb: Verb): string[] {
  return verb.auxiliary
    .split('/')
    .map((a) => a.trim())
    .filter(Boolean);
}

/**
 * Resolve a (verb, category, slot) triple into a gradable target.
 * Returns null when the verb carries no content for that combination.
 */
export function resolveTarget(
  verb: Verb,
  category: FormCategory,
  slot: string,
): FormTarget | null {
  const meta = FORM_CATEGORY_META[category];
  const base = { verb, category, slot };

  switch (category) {
    case 'present':
    case 'simplePast':
    case 'presentPerfect':
    case 'futureI': {
      if (!PERSONS.includes(slot as Person)) return null;
      const person = slot as Person;
      const answer = verb.forms[category][person];
      if (!answer) return null;
      const accepted = [answer];
      // Verbs with an optional reflexive reading accept either realisation.
      const optional = verb.optionalReflexiveForms?.[category]?.[person];
      if (optional) accepted.push(optional);
      return {
        ...base,
        answer,
        accepted,
        slotLabel: PERSON_LABELS[person],
        prompt: `${meta.label} — ${PERSON_LABELS[person]}`,
        explanation: `${PERSON_LABELS[person]} ${answer} — ${meta.short} of ${verb.infinitive}.`,
      };
    }

    case 'konjunktivII': {
      if (!PERSONS.includes(slot as Person)) return null;
      const person = slot as Person;
      const { synthetic, würdeForm, preferred } = verb.forms.konjunktivII;
      const syntheticForm = synthetic?.[person] ?? null;
      const wurde = würdeForm[person];
      const answer = preferred === 'synthetic' && syntheticForm ? syntheticForm : wurde;
      // Both realisations are grammatical; accept either.
      const accepted = [answer, ...(syntheticForm ? [syntheticForm] : []), wurde].filter(
        (v, i, arr) => arr.indexOf(v) === i,
      );
      const note = syntheticForm
        ? `Both "${syntheticForm}" and "${wurde}" are correct; ${preferred === 'synthetic' ? 'the synthetic form' : 'the würde form'} is more idiomatic here.`
        : `${verb.infinitive} uses the würde form in practice.`;
      return {
        ...base,
        answer,
        accepted,
        slotLabel: PERSON_LABELS[person],
        prompt: `Konjunktiv II — ${PERSON_LABELS[person]}`,
        explanation: note,
      };
    }

    case 'imperative': {
      const target = slot as 'du' | 'ihr' | 'Sie';
      if (!verb.forms.imperative.available) return null;
      const answer = verb.forms.imperative[target];
      if (!answer) return null;
      const label = target === 'Sie' ? 'Sie (formal)' : target;
      return {
        ...base,
        answer,
        accepted: [answer],
        slotLabel: label,
        prompt: `Imperative — ${label}`,
        explanation: `The ${label} imperative of ${verb.infinitive} is "${answer}".`,
      };
    }

    case 'pastParticiple': {
      const answer = verb.forms.participles.past;
      return {
        ...base,
        answer,
        accepted: [answer],
        slotLabel: 'Partizip II',
        prompt: 'Past participle (Partizip II)',
        explanation: `${verb.infinitive} → ${answer} (with ${verb.auxiliary}).`,
      };
    }

    case 'presentParticiple': {
      const answer = verb.forms.participles.present;
      return {
        ...base,
        answer,
        accepted: [answer],
        slotLabel: 'Partizip I',
        prompt: 'Present participle (Partizip I)',
        explanation: `${verb.infinitive} → ${answer}.`,
      };
    }

    case 'infinitiveWithZu': {
      const answer = verb.forms.infinitiveWithZu;
      return {
        ...base,
        answer,
        accepted: [answer],
        slotLabel: 'zu-Infinitiv',
        prompt: 'Infinitive with zu',
        explanation: verb.separable
          ? `${verb.infinitive} is separable, so "zu" goes inside the word: ${answer}.`
          : `${verb.infinitive} → ${answer}.`,
      };
    }

    case 'auxiliary': {
      const options = auxiliaryOptions(verb);
      const answer = options[0];
      return {
        ...base,
        answer,
        accepted: options,
        slotLabel: 'Hilfsverb',
        prompt: 'Which auxiliary builds the Perfekt?',
        explanation:
          options.length > 1
            ? `${verb.infinitive} takes either auxiliary depending on meaning: ${verb.forms.presentPerfect.erSieEs}.`
            : `${verb.infinitive} forms the Perfekt with ${answer}: ${verb.forms.presentPerfect.erSieEs}.`,
      };
    }

    case 'separability': {
      const answer = verb.separable ? 'separable' : 'inseparable';
      const explanation = verb.separable
        ? `${verb.infinitive} is separable — the prefix "${verb.prefix}" detaches: ${verb.forms.present.erSieEs}.`
        : `${verb.infinitive} is inseparable; the prefix stays attached: ${verb.forms.present.erSieEs}.`;
      return {
        ...base,
        answer,
        accepted: [answer],
        slotLabel: 'Trennbarkeit',
        prompt: 'Is this verb separable?',
        explanation,
      };
    }

    case 'reflexivePattern': {
      if (!verb.reflexive.isReflexive || !verb.reflexive.case) return null;
      const answer = verb.reflexive.case;
      const sample = reflexivePronounFor('ich', verb.reflexive.case);
      return {
        ...base,
        answer,
        accepted: [answer],
        slotLabel: 'Reflexiv',
        prompt: 'Which case does the reflexive pronoun take?',
        explanation: `${verb.infinitive} takes a ${answer} reflexive pronoun — ich ${verb.forms.present.ich} (${sample}).`,
      };
    }

    case 'caseAndPreposition': {
      if (verb.fixedPrepositions.length > 0) {
        const preposition = verb.fixedPrepositions[0];
        return {
          ...base,
          answer: preposition.preposition,
          accepted: [preposition.preposition],
          slotLabel: 'Präposition',
          prompt: `Which preposition does ${verb.infinitive} take${preposition.meaning ? ` (${preposition.meaning})` : ''}?`,
          explanation: `${verb.infinitive} + ${preposition.preposition} + ${preposition.case}${
            preposition.meaning ? ` — ${preposition.meaning}.` : '.'
          }`,
        };
      }
      if (verb.requiredCases.length > 0) {
        const requiredCase = verb.requiredCases[0];
        return {
          ...base,
          answer: requiredCase,
          accepted: [requiredCase],
          slotLabel: 'Kasus',
          prompt: `Which case does ${verb.infinitive} require for its object?`,
          explanation: `${verb.infinitive} takes a ${requiredCase} object.`,
        };
      }
      return null;
    }

    default:
      return null;
  }
}

/** Every practisable target for a verb in a set of enabled categories. */
export function targetsForVerb(verb: Verb, categories: readonly FormCategory[]): FormTarget[] {
  const targets: FormTarget[] = [];
  for (const category of categories) {
    for (const slot of slotsFor(verb, category)) {
      const target = resolveTarget(verb, category, slot);
      if (target) targets.push(target);
    }
  }
  return targets;
}

/* ------------------------------------------------------------------ */
/* Sentence frames                                                      */
/* ------------------------------------------------------------------ */

/**
 * The datasets store multi-word forms in the linear order they take in a main
 * clause with the subject first — `wohne zusammen`, `habe mich vorgestellt`,
 * `werde gehen`. A `{Subject} ___ .` frame is therefore always grammatical,
 * whatever the tense, separability or reflexivity of the verb.
 */
export function simpleFrame(person: Person, form: string): string {
  return `${capitalizeFirst(SUBJECT_PRONOUN[person])} ${form}.`;
}

export function frameParts(person: Person): { before: string; after: string } {
  return { before: `${capitalizeFirst(SUBJECT_PRONOUN[person])} `, after: '.' };
}

/**
 * Try to locate a form inside the verb's curated example sentence.
 * Returns the token span so the sentence can be split around it, letting an
 * exercise use natural curated German rather than a bare frame.
 */
export function locateInExample(
  verb: Verb,
  form: string,
): { before: string; after: string; matched: string } | null {
  const sentenceTokens = tokenize(verb.example.german);
  const rawTokens = verb.example.german.trim().split(/\s+/);
  const formTokens = tokenize(form);
  if (formTokens.length === 0 || sentenceTokens.length === 0) return null;

  const lowerSentence = sentenceTokens.map((t) => t.toLowerCase());
  const lowerForm = formTokens.map((t) => t.toLowerCase());

  for (let i = 0; i + lowerForm.length <= lowerSentence.length; i += 1) {
    const matches = lowerForm.every((token, k) => lowerSentence[i + k] === token);
    if (!matches) continue;

    // Rebuild from the raw tokens so original punctuation survives.
    const before = rawTokens.slice(0, i).join(' ');
    const after = rawTokens.slice(i + lowerForm.length).join(' ');
    return {
      before: before.length > 0 ? `${before} ` : '',
      after: after.length > 0 ? ` ${after}` : '',
      matched: rawTokens.slice(i, i + lowerForm.length).join(' '),
    };
  }

  return null;
}

/** Single-clause examples are safe to scramble for word-order practice. */
export function isSingleClause(sentence: string): boolean {
  return !sentence.includes(',') && !/\b(dass|weil|wenn|ob|als|obwohl|damit|während)\b/i.test(sentence);
}
