import type { Verb } from '@/types/verb';
import type { VerbFilters } from '@/store/settingsStore';

/**
 * Verb pool filtering — the "organise verbs by grammatical pattern" half of
 * the app. Pure and independent of React so it can be unit tested and reused
 * by both the practice builder and the verb library.
 */

export function matchesFilters(verb: Verb, filters: VerbFilters): boolean {
  if (filters.regularity.length > 0 && !filters.regularity.includes(verb.regularity)) {
    return false;
  }

  if (filters.separability === 'separable' && !verb.separable) return false;
  if (filters.separability === 'inseparable' && verb.separable) return false;

  if (filters.auxiliary !== 'all') {
    // Variable-auxiliary verbs (`"haben/sein"`) satisfy either filter.
    const auxiliaries = verb.auxiliary.split('/').map((a) => a.trim());
    if (!auxiliaries.includes(filters.auxiliary)) return false;
  }

  if (filters.reflexive === 'reflexive' && !verb.reflexive.isReflexive) return false;
  if (filters.reflexive === 'non-reflexive' && verb.reflexive.isReflexive) return false;

  if (filters.topics.length > 0 && !filters.topics.includes(verb.topic)) return false;

  if (filters.verbClasses.length > 0) {
    if (!filters.verbClasses.some((klass) => verb.verbClasses.includes(klass))) return false;
  }

  return true;
}

export function applyFilters(verbs: readonly Verb[], filters: VerbFilters): Verb[] {
  return verbs.filter((verb) => matchesFilters(verb, filters));
}

/** True when nothing has been narrowed — used to show an "all verbs" hint. */
export function isUnfiltered(filters: VerbFilters): boolean {
  return (
    filters.regularity.length === 0 &&
    filters.separability === 'all' &&
    filters.auxiliary === 'all' &&
    filters.reflexive === 'all' &&
    filters.topics.length === 0 &&
    filters.verbClasses.length === 0
  );
}

export function countActiveFilters(filters: VerbFilters): number {
  let count = 0;
  if (filters.regularity.length > 0) count += 1;
  if (filters.separability !== 'all') count += 1;
  if (filters.auxiliary !== 'all') count += 1;
  if (filters.reflexive !== 'all') count += 1;
  if (filters.topics.length > 0) count += 1;
  if (filters.verbClasses.length > 0) count += 1;
  return count;
}

/** Free-text search across infinitive, translations and topic. */
export function searchVerbs(verbs: readonly Verb[], query: string): Verb[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) return [...verbs];

  return verbs.filter((verb) => {
    if (verb.infinitive.toLowerCase().includes(trimmed)) return true;
    if (verb.dictionaryForm.toLowerCase().includes(trimmed)) return true;
    if (verb.english.some((meaning) => meaning.toLowerCase().includes(trimmed))) return true;
    if (verb.topic.toLowerCase().includes(trimmed)) return true;
    return false;
  });
}
