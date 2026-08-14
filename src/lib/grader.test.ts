import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POLICY,
  gradeAnswer,
  gradeOrder,
  gradeSelection,
  primaryDiagnostic,
  type StrictnessPolicy,
} from './grader';

const lenient = (overrides: Partial<StrictnessPolicy>): StrictnessPolicy => ({
  ...DEFAULT_POLICY,
  ...overrides,
});

describe('gradeAnswer — acceptance', () => {
  it('accepts an exact match', () => {
    const result = gradeAnswer('gehst', ['gehst']);
    expect(result.correct).toBe(true);
    expect(result.verdict).toBe('correct');
  });

  it('ignores surrounding whitespace and trailing punctuation', () => {
    expect(gradeAnswer('  gehst  ', ['gehst']).correct).toBe(true);
    expect(gradeAnswer('bin gegangen.', ['bin gegangen']).correct).toBe(true);
  });

  it('accepts any of several valid answers', () => {
    const result = gradeAnswer('würde gehen', ['ginge', 'würde gehen']);
    expect(result.correct).toBe(true);
    expect(result.target).toBe('würde gehen');
  });

  it('rejects an empty response', () => {
    expect(gradeAnswer('', ['gehst']).verdict).toBe('empty');
  });
});

describe('gradeAnswer — capitalisation', () => {
  it('flags capitalisation as fatal when enforced', () => {
    const result = gradeAnswer('Gehst', ['gehst']);
    expect(result.correct).toBe(false);
    expect(primaryDiagnostic(result)?.code).toBe('capitalization');
  });

  it('accepts with a note when capitalisation is relaxed', () => {
    const result = gradeAnswer('Gehst', ['gehst'], lenient({ capitalization: false }));
    expect(result.correct).toBe(true);
    expect(result.verdict).toBe('accepted-with-note');
    expect(result.diagnostics[0].code).toBe('capitalization');
  });
});

describe('gradeAnswer — umlauts and eszett', () => {
  it('detects ae/oe/ue digraphs as an umlaut mistake', () => {
    const result = gradeAnswer('faehrst', ['fährst']);
    expect(result.correct).toBe(false);
    expect(primaryDiagnostic(result)?.code).toBe('umlaut');
  });

  it('detects dropped umlauts', () => {
    const result = gradeAnswer('fahrst', ['fährst']);
    expect(primaryDiagnostic(result)?.code).toBe('umlaut');
  });

  it('accepts digraphs when umlaut strictness is relaxed', () => {
    const result = gradeAnswer('ueben', ['üben'], lenient({ umlauts: false }));
    expect(result.correct).toBe(true);
  });

  it('detects ss written for ß', () => {
    const result = gradeAnswer('heisst', ['heißt']);
    expect(result.correct).toBe(false);
    expect(primaryDiagnostic(result)?.code).toBe('eszett');
  });

  it('accepts ss for ß when relaxed', () => {
    expect(gradeAnswer('heisst', ['heißt'], lenient({ eszett: false })).correct).toBe(true);
  });
});

describe('gradeAnswer — multi-word diagnostics', () => {
  it('identifies the wrong auxiliary', () => {
    const result = gradeAnswer('habe gefahren', ['bin gefahren']);
    expect(result.correct).toBe(false);
    const diag = primaryDiagnostic(result);
    expect(diag?.code).toBe('auxiliary');
    expect(diag?.message).toContain('sein');
  });

  it('identifies the right auxiliary in the wrong person', () => {
    const result = gradeAnswer('habe gemacht', ['hat gemacht']);
    expect(primaryDiagnostic(result)?.code).toBe('auxiliary');
  });

  it('identifies a bad reflexive pronoun', () => {
    const result = gradeAnswer('wasche dich', ['wasche mich']);
    expect(primaryDiagnostic(result)?.code).toBe('reflexivePronoun');
  });

  it('identifies a malformed participle', () => {
    const result = gradeAnswer('habe gemachen', ['habe gemacht']);
    expect(result.correct).toBe(false);
    expect(['participle', 'spelling', 'wrongForm']).toContain(primaryDiagnostic(result)?.code);
  });

  it('identifies word order when the words are all present', () => {
    const result = gradeAnswer('gegangen bin', ['bin gegangen']);
    expect(primaryDiagnostic(result)?.code).toBe('wordOrder');
  });

  it('accepts a word-order slip when the policy allows it', () => {
    const result = gradeAnswer('gegangen bin', ['bin gegangen'], lenient({ wordOrder: false }));
    expect(result.correct).toBe(true);
  });

  it('reports missing words', () => {
    const result = gradeAnswer('gegangen', ['bin gegangen']);
    expect(result.correct).toBe(false);
    expect(['missingWords', 'wrongForm']).toContain(primaryDiagnostic(result)?.code);
  });

  it('reports extra words', () => {
    const result = gradeAnswer('ich bin gegangen', ['bin gegangen']);
    expect(primaryDiagnostic(result)?.code).toBe('extraWords');
  });
});

describe('gradeAnswer — typos', () => {
  it('marks a one-character slip as a near miss by default', () => {
    const result = gradeAnswer('gehsr', ['gehst']);
    expect(result.correct).toBe(false);
    expect(result.verdict).toBe('near-miss');
    expect(primaryDiagnostic(result)?.code).toBe('spelling');
  });

  it('accepts a one-character slip when typos are forgiven', () => {
    const result = gradeAnswer('gehsr', ['gehst'], lenient({ allowTypos: true }));
    expect(result.correct).toBe(true);
  });

  it('does not forgive a genuinely different form', () => {
    const result = gradeAnswer('lief', ['gegangen'], lenient({ allowTypos: true }));
    expect(result.correct).toBe(false);
    expect(primaryDiagnostic(result)?.code).toBe('wrongForm');
  });
});

describe('gradeSelection', () => {
  it('grades a chosen option', () => {
    expect(gradeSelection('haben', 'haben').correct).toBe(true);
    expect(gradeSelection('sein', 'haben').correct).toBe(false);
    expect(gradeSelection(null, 'haben').verdict).toBe('empty');
  });
});

describe('gradeOrder', () => {
  it('accepts the exact order', () => {
    expect(gradeOrder(['Ich', 'bin', 'gegangen'], ['Ich', 'bin', 'gegangen']).correct).toBe(true);
  });

  it('reports a word-order error when all tokens are present', () => {
    const result = gradeOrder(['bin', 'Ich', 'gegangen'], ['Ich', 'bin', 'gegangen']);
    expect(result.correct).toBe(false);
    expect(primaryDiagnostic(result)?.code).toBe('wordOrder');
  });

  it('treats an empty arrangement as empty', () => {
    expect(gradeOrder([], ['Ich', 'bin']).verdict).toBe('empty');
  });
});
