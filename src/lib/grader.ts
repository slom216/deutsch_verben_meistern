import {
  auxiliaryLemma,
  capitalizeFirst,
  collapseWhitespace,
  foldEszett,
  foldGerman,
  levenshtein,
  looksLikeParticiple,
  REFLEXIVE_PRONOUNS,
  sameMultiset,
  stripDiacritics,
  stripPunctuation,
  tokenize,
} from './text';

/**
 * Answer checking.
 *
 * The grader does two jobs. First it decides whether an answer is acceptable,
 * under a strictness policy that is the intersection of what the verb entry
 * marks as significant and what the learner has asked to be held to. Second —
 * and just as important for learning — it explains *what kind* of mistake was
 * made, so feedback can say "right form, wrong auxiliary" instead of a bare
 * cross.
 */

export type DiagnosticCode =
  | 'capitalization'
  | 'umlaut'
  | 'eszett'
  | 'spelling'
  | 'wordOrder'
  | 'auxiliary'
  | 'participle'
  | 'reflexivePronoun'
  | 'separablePrefix'
  | 'missingWords'
  | 'extraWords'
  | 'wrongForm';

export interface Diagnostic {
  code: DiagnosticCode;
  message: string;
  /** True when this alone would make the answer wrong under current strictness. */
  fatal: boolean;
}

export type Verdict = 'correct' | 'accepted-with-note' | 'near-miss' | 'incorrect' | 'empty';

export interface GradeResult {
  correct: boolean;
  verdict: Verdict;
  /** The accepted answer the response was measured against. */
  target: string;
  diagnostics: Diagnostic[];
  distance: number;
}

/**
 * Which features are graded. A feature is enforced only when the verb entry
 * marks it significant *and* the learner has not relaxed it in settings.
 */
export interface StrictnessPolicy {
  capitalization: boolean;
  umlauts: boolean;
  eszett: boolean;
  wordOrder: boolean;
  /** Allow one or two character typos to still count as correct. */
  allowTypos: boolean;
}

export const DEFAULT_POLICY: StrictnessPolicy = {
  capitalization: true,
  umlauts: true,
  eszett: true,
  wordOrder: true,
  allowTypos: false,
};

const DIAGNOSTIC_MESSAGES: Record<DiagnosticCode, string> = {
  capitalization: 'Check your capitalisation.',
  umlaut: 'Watch the umlauts — ä, ö and ü are different letters.',
  eszett: 'Check ß versus ss.',
  spelling: 'Almost — check the spelling.',
  wordOrder: 'All the right words, but in the wrong order.',
  auxiliary: 'Wrong auxiliary verb.',
  participle: 'The past participle is not formed correctly.',
  reflexivePronoun: 'The reflexive pronoun does not agree.',
  separablePrefix: 'Check the separable prefix.',
  missingWords: 'Something is missing from your answer.',
  extraWords: 'Your answer has more words than it needs.',
  wrongForm: 'That is not the right form.',
};

function diagnostic(code: DiagnosticCode, fatal: boolean, message?: string): Diagnostic {
  return { code, message: message ?? DIAGNOSTIC_MESSAGES[code], fatal };
}

/** Everything except the features under test, so residual differences show up. */
function canonical(value: string): string {
  return collapseWhitespace(stripPunctuation(value)).toLowerCase();
}

/**
 * Grade a response against one target form.
 * Exported mainly for testing; use {@link gradeAnswer} for real grading.
 */
export function gradeAgainst(
  response: string,
  target: string,
  policy: StrictnessPolicy,
): GradeResult {
  const trimmedResponse = collapseWhitespace(response);
  const trimmedTarget = collapseWhitespace(target);

  if (trimmedResponse.length === 0) {
    return {
      correct: false,
      verdict: 'empty',
      target: trimmedTarget,
      diagnostics: [],
      distance: trimmedTarget.length,
    };
  }

  const diagnostics: Diagnostic[] = [];

  // Exact match, ignoring only incidental whitespace.
  if (trimmedResponse === trimmedTarget) {
    return { correct: true, verdict: 'correct', target: trimmedTarget, diagnostics, distance: 0 };
  }

  const responseNoPunct = collapseWhitespace(stripPunctuation(trimmedResponse));
  const targetNoPunct = collapseWhitespace(stripPunctuation(trimmedTarget));
  if (responseNoPunct === targetNoPunct) {
    return { correct: true, verdict: 'correct', target: trimmedTarget, diagnostics, distance: 0 };
  }

  const distance = levenshtein(canonical(trimmedResponse), canonical(trimmedTarget));

  /* -------- Feature-by-feature comparison -------- */

  // Capitalisation: identical once case is ignored.
  const caseInsensitiveMatch = responseNoPunct.toLowerCase() === targetNoPunct.toLowerCase();
  if (caseInsensitiveMatch) {
    diagnostics.push(diagnostic('capitalization', policy.capitalization));
    return finalize(trimmedTarget, diagnostics, distance);
  }

  // Eszett: `heißen` vs `heissen`.
  const eszettMatch =
    foldEszett(responseNoPunct).toLowerCase() === foldEszett(targetNoPunct).toLowerCase();
  if (eszettMatch) {
    diagnostics.push(diagnostic('eszett', policy.eszett));
    return finalize(trimmedTarget, diagnostics, distance);
  }

  // Umlauts written as digraphs (`ueben` for `üben`) or dropped (`uben`).
  const foldedResponse = foldGerman(responseNoPunct).toLowerCase();
  const foldedTarget = foldGerman(targetNoPunct).toLowerCase();
  if (foldedResponse === foldedTarget) {
    diagnostics.push(
      diagnostic('umlaut', policy.umlauts, 'Umlauts written out as ae/oe/ue — use ä, ö, ü.'),
    );
    return finalize(trimmedTarget, diagnostics, distance);
  }

  const strippedResponse = stripDiacritics(responseNoPunct).toLowerCase();
  const strippedTarget = stripDiacritics(targetNoPunct).toLowerCase();
  if (strippedResponse === strippedTarget) {
    diagnostics.push(diagnostic('umlaut', policy.umlauts));
    return finalize(trimmedTarget, diagnostics, distance);
  }

  /* -------- Multi-word analysis -------- */

  const responseTokens = tokenize(trimmedResponse.toLowerCase());
  const targetTokens = tokenize(trimmedTarget.toLowerCase());

  if (targetTokens.length > 1 || responseTokens.length > 1) {
    if (sameMultiset(responseTokens, targetTokens)) {
      diagnostics.push(diagnostic('wordOrder', policy.wordOrder));
      return finalize(trimmedTarget, diagnostics, distance);
    }

    const missing = targetTokens.filter((t) => !responseTokens.includes(t));
    const extra = responseTokens.filter((t) => !targetTokens.includes(t));

    // A single swapped token is the interesting, teachable case.
    if (missing.length === 1 && extra.length === 1) {
      const expected = missing[0];
      const given = extra[0];

      const expectedAux = auxiliaryLemma(expected);
      const givenAux = auxiliaryLemma(given);
      if (expectedAux && givenAux && expectedAux !== givenAux) {
        diagnostics.push(
          diagnostic(
            'auxiliary',
            true,
            `This verb builds its perfect with "${expectedAux}", not "${givenAux}".`,
          ),
        );
        return finalize(trimmedTarget, diagnostics, distance);
      }
      if (expectedAux && givenAux && expectedAux === givenAux) {
        diagnostics.push(
          diagnostic('auxiliary', true, `Right auxiliary, wrong person: expected "${expected}".`),
        );
        return finalize(trimmedTarget, diagnostics, distance);
      }

      if (REFLEXIVE_PRONOUNS.has(expected) || REFLEXIVE_PRONOUNS.has(given)) {
        diagnostics.push(
          diagnostic(
            'reflexivePronoun',
            true,
            `Expected the reflexive pronoun "${expected}", not "${given}".`,
          ),
        );
        return finalize(trimmedTarget, diagnostics, distance);
      }

      if (looksLikeParticiple(expected) || looksLikeParticiple(given)) {
        diagnostics.push(
          diagnostic('participle', true, `The participle should be "${expected}".`),
        );
        return finalize(trimmedTarget, diagnostics, distance);
      }
    }

    if (missing.length > 0 && extra.length === 0) {
      diagnostics.push(diagnostic('missingWords', true, `Missing: ${missing.join(', ')}.`));
      return finalize(trimmedTarget, diagnostics, distance);
    }
    if (extra.length > 0 && missing.length === 0) {
      diagnostics.push(diagnostic('extraWords', true, `Remove: ${extra.join(', ')}.`));
      return finalize(trimmedTarget, diagnostics, distance);
    }
  }

  /* -------- Single-token near misses -------- */

  // A separable verb answered with the prefix still attached, or vice versa.
  if (responseTokens.length !== targetTokens.length) {
    const joinedResponse = responseTokens.join('');
    const joinedTarget = targetTokens.join('');
    if (joinedResponse === joinedTarget) {
      diagnostics.push(
        diagnostic(
          'separablePrefix',
          true,
          'Right words — but the separable prefix belongs on its own.',
        ),
      );
      return finalize(trimmedTarget, diagnostics, distance);
    }
  }

  const tolerance = trimmedTarget.length <= 5 ? 1 : 2;
  if (distance <= tolerance) {
    diagnostics.push(diagnostic('spelling', !policy.allowTypos));
    return finalize(trimmedTarget, diagnostics, distance);
  }

  diagnostics.push(diagnostic('wrongForm', true));
  return finalize(trimmedTarget, diagnostics, distance);
}

function finalize(target: string, diagnostics: Diagnostic[], distance: number): GradeResult {
  const fatal = diagnostics.some((d) => d.fatal);
  return {
    correct: !fatal,
    verdict: fatal ? (distance <= 2 ? 'near-miss' : 'incorrect') : 'accepted-with-note',
    target,
    diagnostics,
    distance,
  };
}

/**
 * Grade a response against every acceptable answer and report the kindest
 * outcome. Ties are broken by edit distance so the feedback points at the
 * variant the learner was evidently reaching for.
 */
export function gradeAnswer(
  response: string,
  accepted: readonly string[],
  policy: StrictnessPolicy = DEFAULT_POLICY,
): GradeResult {
  if (accepted.length === 0) {
    throw new Error('gradeAnswer requires at least one accepted answer.');
  }

  const results = accepted.map((target) => gradeAgainst(response, target, policy));

  const rank = (result: GradeResult) => {
    const verdictRank: Record<Verdict, number> = {
      correct: 0,
      'accepted-with-note': 1,
      'near-miss': 2,
      incorrect: 3,
      empty: 4,
    };
    return verdictRank[result.verdict] * 1000 + result.distance;
  };

  return results.reduce((best, current) => (rank(current) < rank(best) ? current : best));
}

/**
 * Grade a choice from a fixed option set. Selection exercises have no spelling
 * dimension, so this is a plain identity check with a uniform result shape.
 */
export function gradeSelection(selected: string | null, correctOption: string): GradeResult {
  if (selected === null) {
    return {
      correct: false,
      verdict: 'empty',
      target: correctOption,
      diagnostics: [],
      distance: correctOption.length,
    };
  }
  const correct = selected === correctOption;
  return {
    correct,
    verdict: correct ? 'correct' : 'incorrect',
    target: correctOption,
    diagnostics: correct ? [] : [diagnostic('wrongForm', true)],
    distance: correct ? 0 : levenshtein(canonical(selected), canonical(correctOption)),
  };
}

/**
 * Grade an ordered token sequence, as produced by the sentence
 * reconstruction exercise.
 */
export function gradeOrder(selected: readonly string[], correctOrder: readonly string[]): GradeResult {
  const target = correctOrder.join(' ');
  if (selected.length === 0) {
    return { correct: false, verdict: 'empty', target, diagnostics: [], distance: target.length };
  }

  const correct =
    selected.length === correctOrder.length && selected.every((t, i) => t === correctOrder[i]);

  if (correct) {
    return { correct: true, verdict: 'correct', target, diagnostics: [], distance: 0 };
  }

  const diagnostics: Diagnostic[] = sameMultiset([...selected], [...correctOrder])
    ? [diagnostic('wordOrder', true)]
    : [diagnostic('wrongForm', true)];

  return {
    correct: false,
    verdict: 'incorrect',
    target,
    diagnostics,
    distance: levenshtein(selected.join(' ').toLowerCase(), target.toLowerCase()),
  };
}

/** Human-readable summary of the most important thing that went wrong. */
export function primaryDiagnostic(result: GradeResult): Diagnostic | null {
  if (result.diagnostics.length === 0) return null;
  return result.diagnostics.find((d) => d.fatal) ?? result.diagnostics[0];
}

/** Render an answer for display, capitalised the way a sentence would be. */
export function displayAnswer(value: string, asSentence = false): string {
  return asSentence ? capitalizeFirst(value) : value;
}
