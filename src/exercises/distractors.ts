import type { FormCategory } from '@/types/formCategory';
import { PERSONS, type Person, type Verb } from '@/types/verb';
import type { Rng } from '@/lib/random';
import { resolveTarget } from './formAccess';

/**
 * Distractor construction for recognition exercises.
 *
 * Good distractors are the forms a learner might actually produce by mistake:
 * a neighbouring person of the same paradigm, the regularised version of an
 * irregular verb, or the same slot borrowed from a similar verb. Random
 * unrelated words teach nothing, so they are never used.
 */

/** Regularise a verb as a naive learner would, to make a tempting distractor. */
function regularise(verb: Verb, category: FormCategory, person: Person): string | null {
  const stem = verb.infinitive.replace(/e?n$/, '');
  if (stem.length === 0) return null;

  const presentEndings: Record<Person, string> = {
    ich: 'e',
    du: 'st',
    erSieEs: 't',
    wir: 'en',
    ihr: 't',
    sieSie: 'en',
  };
  const pastEndings: Record<Person, string> = {
    ich: 'te',
    du: 'test',
    erSieEs: 'te',
    wir: 'ten',
    ihr: 'tet',
    sieSie: 'ten',
  };

  if (category === 'present') return stem + presentEndings[person];
  if (category === 'simplePast') return stem + pastEndings[person];
  if (category === 'pastParticiple') return `ge${stem}t`;
  return null;
}

/** Swap the auxiliary inside a compound form, e.g. `bin gegangen` → `habe gegangen`. */
function swapAuxiliary(form: string): string | null {
  const map: Record<string, string> = {
    habe: 'bin',
    hast: 'bist',
    hat: 'ist',
    haben: 'sind',
    habt: 'seid',
    bin: 'habe',
    bist: 'hast',
    ist: 'hat',
    sind: 'haben',
    seid: 'habt',
  };
  const tokens = form.split(' ');
  const index = tokens.findIndex((t) => map[t.toLowerCase()]);
  if (index === -1) return null;
  const replacement = map[tokens[index].toLowerCase()];
  return [...tokens.slice(0, index), replacement, ...tokens.slice(index + 1)].join(' ');
}

export interface DistractorRequest {
  verb: Verb;
  category: FormCategory;
  slot: string;
  answer: string;
  accepted: readonly string[];
  pool: readonly Verb[];
  rng: Rng;
  count: number;
}

/**
 * Build up to `count` plausible wrong answers, ordered most-confusable first
 * and guaranteed not to collide with any accepted answer.
 */
export function buildDistractors(request: DistractorRequest): string[] {
  const { verb, category, slot, accepted, pool, rng, count } = request;
  const taken = new Set(accepted.map((a) => a.toLowerCase()));
  const candidates: string[] = [];

  const offer = (value: string | null | undefined) => {
    if (!value) return;
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    if (taken.has(trimmed.toLowerCase())) return;
    taken.add(trimmed.toLowerCase());
    candidates.push(trimmed);
  };

  // Closed-set categories have a fixed, exhaustive option list.
  switch (category) {
    case 'auxiliary':
      ['haben', 'sein'].forEach(offer);
      return candidates.slice(0, count);
    case 'separability':
      ['separable', 'inseparable'].forEach(offer);
      return candidates.slice(0, count);
    case 'reflexivePattern':
      ['accusative', 'dative'].forEach(offer);
      return candidates.slice(0, count);
    case 'caseAndPreposition': {
      if (verb.fixedPrepositions.length > 0) {
        rng
          .shuffle(['an', 'auf', 'für', 'mit', 'nach', 'über', 'um', 'von', 'zu', 'bei', 'in'])
          .forEach(offer);
      } else {
        ['accusative', 'dative', 'genitive', 'dative+accusative'].forEach(offer);
      }
      return candidates.slice(0, count);
    }
    default:
      break;
  }

  const isPersonal = PERSONS.includes(slot as Person);

  // 1. Other persons of the same paradigm — the classic confusion.
  if (isPersonal) {
    const others = rng.shuffle(PERSONS.filter((p) => p !== slot));
    for (const person of others) {
      const other = resolveTarget(verb, category, person);
      offer(other?.answer);
    }
  }

  // 2. The regularised form, for irregular verbs.
  if (isPersonal && verb.regularity !== 'regular') {
    offer(regularise(verb, category, slot as Person));
  }
  if (category === 'pastParticiple' && verb.regularity !== 'regular') {
    offer(regularise(verb, category, 'ich'));
  }

  // 3. The same form with the wrong auxiliary.
  offer(swapAuxiliary(request.answer));

  // 4. The same slot from comparable verbs.
  const similar = rng.shuffle(
    pool.filter(
      (candidate) =>
        candidate.id !== verb.id &&
        candidate.level === verb.level &&
        candidate.regularity === verb.regularity,
    ),
  );
  for (const candidate of similar.slice(0, 12)) {
    const other = resolveTarget(candidate, category, slot);
    offer(other?.answer);
    if (candidates.length >= count * 2) break;
  }

  // 5. Last resort — any verb at all, so an option list is never short.
  if (candidates.length < count) {
    for (const candidate of rng.shuffle(pool).slice(0, 30)) {
      if (candidate.id === verb.id) continue;
      const other = resolveTarget(candidate, category, slot);
      offer(other?.answer);
      if (candidates.length >= count) break;
    }
  }

  return candidates.slice(0, count);
}

/** A deliberately wrong form for the "correct the mistake" exercise. */
export function buildWrongForm(request: Omit<DistractorRequest, 'count'>): string | null {
  const [first] = buildDistractors({ ...request, count: 1 });
  return first ?? null;
}
