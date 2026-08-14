import type { CefrLevel, Verb, VerbDataset } from '@/types/verb';
import { FORM_CATEGORIES, type FormCategory } from '@/types/formCategory';

/**
 * Lazily loads CEFR datasets and answers structural questions about the
 * corpus. Each level lives in its own chunk, so a learner studying A1 never
 * downloads the 348-entry B1 file.
 */

type Loader = () => Promise<{ default: unknown }>;

const LOADERS: Record<CefrLevel, Loader> = {
  A1: () => import('./verbs/a1.json'),
  A2: () => import('./verbs/a2.json'),
  B1: () => import('./verbs/b1.json'),
};

const cache = new Map<CefrLevel, Verb[]>();
const inFlight = new Map<CefrLevel, Promise<Verb[]>>();

export async function loadLevel(level: CefrLevel): Promise<Verb[]> {
  const cached = cache.get(level);
  if (cached) return cached;

  const pending = inFlight.get(level);
  if (pending) return pending;

  const promise = LOADERS[level]().then((module) => {
    const dataset = module.default as VerbDataset;
    const verbs = dataset.verbs;
    cache.set(level, verbs);
    inFlight.delete(level);
    return verbs;
  });

  inFlight.set(level, promise);
  return promise;
}

export async function loadLevels(levels: readonly CefrLevel[]): Promise<Verb[]> {
  const loaded = await Promise.all(levels.map(loadLevel));
  // Preserve CEFR order, then frequency rank within a level.
  return loaded.flat().sort((a, b) => a.level.localeCompare(b.level) || a.rank - b.rank);
}

export function peekLoadedLevel(level: CefrLevel): Verb[] | undefined {
  return cache.get(level);
}

/* ------------------------------------------------------------------ */
/* Derived structure                                                    */
/* ------------------------------------------------------------------ */

/**
 * Which categories this verb can actually be practised in.
 *
 * `practiceForms` is the dataset's own recommendation; it is intersected with
 * what the forms block really contains so a generator is never handed a
 * category with no answer behind it.
 */
export function availableCategories(verb: Verb): FormCategory[] {
  const declared = new Set(verb.practiceForms);
  const result: FormCategory[] = [];

  for (const category of FORM_CATEGORIES) {
    if (!hasContentFor(verb, category)) continue;
    // Participles and zu-infinitives are universally present but not always
    // listed in practiceForms; offer them anyway since the content exists.
    const alwaysOfferable =
      category === 'presentParticiple' ||
      category === 'infinitiveWithZu' ||
      category === 'pastParticiple';
    if (declared.has(category) || alwaysOfferable) result.push(category);
  }

  return result;
}

export function hasContentFor(verb: Verb, category: FormCategory): boolean {
  switch (category) {
    case 'present':
    case 'simplePast':
    case 'presentPerfect':
    case 'futureI':
      return Boolean(verb.forms[category]);
    case 'imperative':
      return verb.forms.imperative.available;
    case 'konjunktivII':
      return Boolean(verb.forms.konjunktivII.würdeForm || verb.forms.konjunktivII.synthetic);
    case 'pastParticiple':
      return Boolean(verb.forms.participles.past);
    case 'presentParticiple':
      return Boolean(verb.forms.participles.present);
    case 'infinitiveWithZu':
      return Boolean(verb.forms.infinitiveWithZu);
    case 'auxiliary':
      return Boolean(verb.auxiliary);
    case 'separability':
      // Only meaningful when there is a prefix to reason about.
      return verb.separable || Boolean(verb.prefix);
    case 'reflexivePattern':
      return verb.reflexive.isReflexive || Boolean(verb.optionalReflexiveForms);
    case 'caseAndPreposition':
      return verb.requiredCases.length > 0 || verb.fixedPrepositions.length > 0;
    default:
      return false;
  }
}

export interface CorpusFacets {
  topics: string[];
  verbClasses: string[];
  frequencyBands: string[];
  auxiliaries: string[];
}

export function corpusFacets(verbs: Verb[]): CorpusFacets {
  const topics = new Set<string>();
  const verbClasses = new Set<string>();
  const frequencyBands = new Set<string>();
  const auxiliaries = new Set<string>();

  for (const verb of verbs) {
    topics.add(verb.topic);
    verb.verbClasses.forEach((c) => verbClasses.add(c));
    frequencyBands.add(verb.frequencyBand);
    auxiliaries.add(verb.auxiliary);
  }

  const sorted = (set: Set<string>) => [...set].sort((a, b) => a.localeCompare(b));
  return {
    topics: sorted(topics),
    verbClasses: sorted(verbClasses),
    frequencyBands: sorted(frequencyBands),
    auxiliaries: sorted(auxiliaries),
  };
}
