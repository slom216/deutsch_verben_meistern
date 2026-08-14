/**
 * German-aware text primitives shared by the grader and the exercise
 * generators. Kept dependency-free and pure so they are cheap to unit test.
 */

/** Collapse runs of whitespace and trim. */
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Drop sentence punctuation that never distinguishes a verb form. */
export function stripPunctuation(value: string): string {
  return value.replace(/[.,!?;:]+/g, ' ');
}

/**
 * Fold umlauts and eszett to their ASCII digraphs.
 * `ä → ae`, `ö → oe`, `ü → ue`, `ß → ss`. This is the transliteration German
 * speakers use on keyboards without umlaut keys, so `ueben` should be
 * recognised as an attempt at `üben`.
 */
export function foldGerman(value: string): string {
  return value
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss');
}

/**
 * Strip umlaut diacritics without expanding them (`ä → a`).
 * Used only to detect *which* mistake a learner made, never to accept it.
 */
export function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Normalise eszett to `ss` so the two spellings compare equal. */
export function foldEszett(value: string): string {
  return value.replace(/ß/g, 'ss');
}

export function tokenize(value: string): string[] {
  const cleaned = collapseWhitespace(stripPunctuation(value));
  return cleaned.length === 0 ? [] : cleaned.split(' ');
}

/** Levenshtein edit distance, iterative with a single rolling row. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  const current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, substitution);
    }
    previous = current.slice();
  }

  return previous[b.length];
}

/** Two token lists containing the same words, possibly in a different order. */
export function sameMultiset(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((token, index) => token === sortedB[index]);
}

/* ------------------------------------------------------------------ */
/* German closed-class lexicons                                         */
/* ------------------------------------------------------------------ */

export const HABEN_FORMS = new Set([
  'habe',
  'hast',
  'hat',
  'haben',
  'habt',
  'hatte',
  'hattest',
  'hatten',
  'hattet',
  'hätte',
  'hättest',
  'hätten',
  'hättet',
]);

export const SEIN_FORMS = new Set([
  'bin',
  'bist',
  'ist',
  'sind',
  'seid',
  'war',
  'warst',
  'waren',
  'wart',
  'wäre',
  'wärst',
  'wärest',
  'wären',
  'wäret',
]);

export const WERDEN_FORMS = new Set([
  'werde',
  'wirst',
  'wird',
  'werden',
  'werdet',
  'würde',
  'würdest',
  'würden',
  'würdet',
]);

export const REFLEXIVE_PRONOUNS = new Set(['mich', 'dich', 'sich', 'uns', 'euch', 'mir', 'dir']);

export const PERSONAL_PRONOUNS = new Set([
  'ich',
  'du',
  'er',
  'sie',
  'es',
  'wir',
  'ihr',
  'Sie',
  'man',
]);

export function isAuxiliaryToken(token: string): boolean {
  const lower = token.toLowerCase();
  return HABEN_FORMS.has(lower) || SEIN_FORMS.has(lower) || WERDEN_FORMS.has(lower);
}

/** Which auxiliary lemma a finite token belongs to, if any. */
export function auxiliaryLemma(token: string): 'haben' | 'sein' | 'werden' | null {
  const lower = token.toLowerCase();
  if (HABEN_FORMS.has(lower)) return 'haben';
  if (SEIN_FORMS.has(lower)) return 'sein';
  if (WERDEN_FORMS.has(lower)) return 'werden';
  return null;
}

/** Heuristic: does this token look like a German past participle? */
export function looksLikeParticiple(token: string): boolean {
  const lower = token.toLowerCase();
  if (/^ge.+(t|en)$/.test(lower)) return true;
  // Inseparable prefixes and -ieren verbs form participles without ge-.
  if (/^(be|emp|ent|er|ge|miss|ver|zer|über|unter|um|wider)/.test(lower) && /(t|en)$/.test(lower)) {
    return true;
  }
  return /iert$/.test(lower);
}

/** Capitalise the first character, leaving the rest untouched. */
export function capitalizeFirst(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}
