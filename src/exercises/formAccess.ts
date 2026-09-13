import type { FormCategory } from '@/types/formCategory';
import { FORM_CATEGORY_META } from '@/types/formCategory';
import { PERSONS, PERSON_LABELS, specialForms, type Person, type Verb } from '@/types/verb';
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
  // Not "sie": sentence-initial "Sie" also reads as "she", which made frames
  // like "Sie darf." ambiguous between er/sie/es and sie/Sie.
  sieSie: 'die beiden',
};

/** Every person a displayed subject could be read as ("sie" is she or they). */
export function personsReadAs(subject: string): Person[] {
  const lower = subject.toLowerCase();
  if (lower === 'sie') return ['erSieEs', 'sieSie'];
  if (lower === 'es') return ['erSieEs'];
  return PERSONS.filter((p) => SUBJECT_PRONOUN[p] === lower);
}

function thirdPersonOnly(verb: Verb): boolean {
  return verb.usageRestrictions?.thirdPersonOnly === true;
}

/**
 * Whether a verb carries real content for a category. Every enumeration of
 * practisable cards goes through `slotsFor`, which uses this as its guard.
 */
export function hasContentFor(verb: Verb, category: FormCategory): boolean {
  switch (category) {
    case 'present':
    case 'simplePast':
    case 'presentPerfect':
    case 'futureI':
      return Boolean(verb.forms[category]);
    case 'imperative':
      return verb.forms.imperative.available && !thirdPersonOnly(verb);
    case 'konjunktivII':
      return Boolean(verb.forms.konjunktivII.würdeForm || verb.forms.konjunktivII.synthetic);
    case 'pastParticiple':
      return Boolean(verb.forms.participles.past);
    case 'presentParticiple':
      return Boolean(verb.forms.participles.present);
    case 'infinitiveWithZu':
      return Boolean(verb.forms.infinitiveWithZu);
    case 'auxiliary':
      // With two valid auxiliaries there is no wrong answer to ask about.
      return auxiliaryOptions(verb).length === 1;
    case 'separability':
      // Only meaningful when there is a prefix to reason about.
      return Boolean(verb.prefix);
    case 'reflexivePattern':
      return Boolean(verb.reflexive.case);
    case 'caseAndPreposition':
      return verb.requiredCases.length > 0 || verb.fixedPrepositions.length > 0;
    default:
      return false;
  }
}

/** Which slots a category can be practised in for this verb. */
export function slotsFor(verb: Verb, category: FormCategory): string[] {
  if (!hasContentFor(verb, category)) return [];
  switch (category) {
    case 'present':
    case 'simplePast':
    case 'presentPerfect':
    case 'futureI':
    case 'konjunktivII':
      return thirdPersonOnly(verb) ? ['erSieEs', 'sieSie'] : [...PERSONS];
    case 'imperative': {
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

/** String-valued alternative forms, e.g. `alternativeSimplePast: "sandte"`. */
function alternative(verb: Verb, key: string): string | null {
  const value = specialForms(verb)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Verbs whose datasets record a variable auxiliary, e.g. `"haben/sein"`, or an
 * `alternativeAuxiliary` special form.
 */
export function auxiliaryOptions(verb: Verb): string[] {
  const options = verb.auxiliary
    .split('/')
    .map((a) => a.trim())
    .filter(Boolean);
  const alt = alternative(verb, 'alternativeAuxiliary');
  return alt && !options.includes(alt) ? [...options, alt] : options;
}

const WEAK_ENDINGS: Record<Person, string> = {
  ich: '',
  du: 'st',
  erSieEs: '',
  wir: 'n',
  ihr: 't',
  sieSie: 'n',
};

/** Inflect an ich/er form ending in -e (sandte, bräuchte) for a person. */
function inflectFromIch(form: string, person: Person): string | null {
  const [head, ...rest] = form.split(' ');
  if (!head.endsWith('e')) return person === 'ich' || person === 'erSieEs' ? form : null;
  return [head + WEAK_ENDINGS[person], ...rest].join(' ');
}

const AUXILIARY_FORMS: Record<string, Record<Person, string>> = {
  haben: { ich: 'habe', du: 'hast', erSieEs: 'hat', wir: 'haben', ihr: 'habt', sieSie: 'haben' },
  sein: { ich: 'bin', du: 'bist', erSieEs: 'ist', wir: 'sind', ihr: 'seid', sieSie: 'sind' },
};

/** Grammatical alternatives recorded in the data, never the canonical answer. */
function alternativeForms(verb: Verb, category: FormCategory, person: Person, answer: string): string[] {
  switch (category) {
    case 'simplePast': {
      const alt = alternative(verb, 'alternativeSimplePast');
      const form = alt && inflectFromIch(alt, person);
      return form ? [form] : [];
    }
    case 'konjunktivII': {
      const alt = alternative(verb, 'alternativeKonjunktivII');
      const form = alt && inflectFromIch(alt, person);
      return form ? [form] : [];
    }
    case 'presentPerfect': {
      const tokens = answer.split(' ');
      const participles = [verb.forms.participles.past, alternative(verb, 'alternativePastParticiple')];
      const auxiliaries = auxiliaryOptions(verb).map((aux) => AUXILIARY_FORMS[aux]?.[person]);
      const isAuxiliary = Object.values(AUXILIARY_FORMS).some((f) => f[person] === tokens[0]);
      const forms: string[] = [];
      for (const aux of isAuxiliary ? auxiliaries : [tokens[0]]) {
        for (const participle of participles) {
          if (!aux || !participle) continue;
          const swapped = tokens.map((t) => (t === verb.forms.participles.past ? participle : t));
          forms.push([aux, ...swapped.slice(1)].join(' '));
        }
      }
      return forms;
    }
    default:
      return [];
  }
}

function unique(values: string[]): string[] {
  return values.filter((v, i, arr) => arr.indexOf(v) === i);
}

/** "a dative", "an accusative". */
function withArticle(word: string): string {
  return `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`;
}

/** Reflexive use is optional (trennen / sich trennen) rather than obligatory. */
export function isOptionallyReflexive(verb: Verb): boolean {
  return (
    verb.reflexive.optional === true ||
    (verb.reflexive.isReflexive && verb.reflexive.required === false)
  );
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
  if (!slotsFor(verb, category).includes(slot)) return null;

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
      accepted.push(...alternativeForms(verb, category, person, answer));
      return {
        ...base,
        answer,
        accepted: unique(accepted),
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
      const accepted = unique([
        answer,
        ...(syntheticForm ? [syntheticForm] : []),
        wurde,
        ...alternativeForms(verb, category, person, answer),
      ]);
      let note = syntheticForm
        ? `Both "${syntheticForm}" and "${wurde}" are correct; ${preferred === 'synthetic' ? 'the synthetic form' : 'the würde form'} is more idiomatic here.`
        : `${verb.infinitive} uses the würde form in practice.`;
      if (syntheticForm && syntheticForm === verb.forms.simplePast[person]) {
        note += ` "${syntheticForm}" is identical to the Präteritum form; context makes it subjunctive.`;
      }
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
      const alt = alternative(verb, 'alternativePastParticiple');
      return {
        ...base,
        answer,
        accepted: alt ? unique([answer, alt]) : [answer],
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
      if (!verb.reflexive.case) return null;
      const answer = verb.reflexive.case;
      const sample = reflexivePronounFor('ich', verb.reflexive.case);
      const ichForm = verb.optionalReflexiveForms?.present?.ich ?? verb.forms.present.ich;
      const example = tokenize(ichForm).includes(sample) ? ichForm : `${ichForm} ${sample}`;
      const sichForm = verb.infinitive.startsWith('sich ') ? verb.infinitive : `sich ${verb.infinitive}`;
      return {
        ...base,
        answer,
        accepted: [answer],
        slotLabel: 'Reflexiv',
        prompt: 'Which case does the reflexive pronoun take?',
        explanation: isOptionallyReflexive(verb)
          ? `${verb.infinitive} can be used reflexively (${sichForm}) with ${withArticle(answer)} pronoun — ich ${example}.`
          : `${verb.infinitive} takes ${withArticle(answer)} reflexive pronoun — ich ${example}.`,
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
        // `["dative","accusative"]` and the literal `"dative+accusative"` mean the same.
        const cases = unique(verb.requiredCases.flatMap((c) => c.split('+')));
        const answer = [...cases].sort().reverse().join('+');
        return {
          ...base,
          answer,
          accepted: [answer],
          slotLabel: 'Kasus',
          prompt: `Which case does ${verb.infinitive} require for its object?`,
          explanation: `${verb.infinitive} takes ${cases.map(withArticle).join(' and ')} object.`,
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
 * `werde gehen` — so a `{Subject} {form}` frame has the right word order. It
 * is not a complete sentence, though: transitive verbs and modals need a
 * complement ("Wir haben …"), so frames end in "…" to read as fragments.
 * Prefer the curated example (via `locateInExample`) wherever it agrees.
 */
export function simpleFrame(person: Person, form: string): string {
  return `${capitalizeFirst(SUBJECT_PRONOUN[person])} ${form} …`;
}

export function frameParts(person: Person): { before: string; after: string } {
  return { before: `${capitalizeFirst(SUBJECT_PRONOUN[person])} `, after: ' …' };
}

/** Subject pronouns that unambiguously mark a person in an example sentence. */
const EXAMPLE_SUBJECTS: Record<Person, string[]> = {
  ich: ['ich'],
  du: ['du'],
  // "sie" could be she, they or formal you, so it never counts as agreement.
  erSieEs: ['er', 'es'],
  wir: ['wir'],
  ihr: ['ihr'],
  sieSie: [],
};

const ANY_SUBJECT = new Set(['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr']);

/**
 * Try to locate a person's form inside the verb's curated example sentence.
 * Returns the token span so the sentence can be split around it, letting an
 * exercise use natural curated German rather than a bare frame.
 *
 * ponytail: a subject-adjacency heuristic, not a parser. The match only counts
 * when the person's pronoun opens the sentence right before the form
 * ("Ich gebe …") or follows it in inversion ("Heute gebe ich …"), which also
 * rules out infinitive gaps after a modal or zu.
 */
export function locateInExample(
  verb: Verb,
  form: string,
  person: Person,
): { before: string; after: string; matched: string } | null {
  const subjects = EXAMPLE_SUBJECTS[person];
  const sentenceTokens = tokenize(verb.example.german);
  const rawTokens = verb.example.german.trim().split(/\s+/);
  const formTokens = tokenize(form);
  if (subjects.length === 0 || formTokens.length === 0 || sentenceTokens.length === 0) return null;
  // Punctuation-only tokens would shift the raw and cleaned indices apart.
  if (sentenceTokens.length !== rawTokens.length) return null;

  const lowerSentence = sentenceTokens.map((t) => t.toLowerCase());
  const lowerForm = formTokens.map((t) => t.toLowerCase());

  for (let i = 0; i + lowerForm.length <= lowerSentence.length; i += 1) {
    const matches = lowerForm.every((token, k) => lowerSentence[i + k] === token);
    if (!matches) continue;

    const previous = lowerSentence[i - 1];
    const next = lowerSentence[i + lowerForm.length];
    const subjectFirst = i === 1 && subjects.includes(previous);
    const inverted =
      subjects.includes(next) && previous !== 'zu' && !ANY_SUBJECT.has(previous ?? '');
    if (!subjectFirst && !inverted) continue;

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
