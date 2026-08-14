/**
 * Dataset gate: validates every shipped verb file against the schema and the
 * semantic audit. Run with `npm run validate:data`. Exits non-zero on errors.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateDataset, type ValidationIssue } from '../src/data/verbSchema';

const here = dirname(fileURLToPath(import.meta.url));
const verbsDir = join(here, '..', 'src', 'data', 'verbs');

const FILES = ['a1.json', 'a2.json', 'b1.json'];

let totalVerbs = 0;
let errorCount = 0;
let warningCount = 0;
const allIssues: ValidationIssue[] = [];
const dictionaryFormsAcrossLevels = new Map<string, string>();

for (const file of FILES) {
  const raw = JSON.parse(readFileSync(join(verbsDir, file), 'utf8'));
  const result = validateDataset(raw, file);

  const errors = result.issues.filter((i) => i.severity === 'error');
  const warnings = result.issues.filter((i) => i.severity === 'warning');
  errorCount += errors.length;
  warningCount += warnings.length;
  allIssues.push(...result.issues);

  if (result.dataset) {
    totalVerbs += result.dataset.verbs.length;
    for (const verb of result.dataset.verbs) {
      const seen = dictionaryFormsAcrossLevels.get(verb.dictionaryForm);
      if (seen) {
        warningCount += 1;
        allIssues.push({
          level: verb.level,
          verbId: verb.id,
          path: 'dictionaryForm',
          message: `Cross-level duplicate dictionary form (also ${seen}).`,
          severity: 'warning',
        });
      }
      dictionaryFormsAcrossLevels.set(verb.dictionaryForm, verb.id);
    }
  }

  const status = errors.length === 0 ? 'OK  ' : 'FAIL';
  const count = result.dataset ? result.dataset.verbs.length : 0;
  console.log(
    `${status} ${file.padEnd(9)} ${String(count).padStart(4)} verbs  ` +
      `${errors.length} errors, ${warnings.length} warnings`,
  );
}

const byMessage = new Map<string, ValidationIssue[]>();
for (const issue of allIssues) {
  const key = `${issue.severity}: ${issue.path}`;
  const list = byMessage.get(key) ?? [];
  list.push(issue);
  byMessage.set(key, list);
}

if (byMessage.size > 0) {
  console.log('\nIssues grouped by field:');
  const rows = [...byMessage.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [key, list] of rows) {
    const sample = list[0];
    console.log(`  ${String(list.length).padStart(4)}x  ${key}`);
    console.log(`         e.g. ${sample.verbId ?? '-'}: ${sample.message}`);
  }
}

console.log(
  `\nTotal: ${totalVerbs} verbs, ${errorCount} errors, ${warningCount} warnings across ${FILES.length} files.`,
);

if (errorCount > 0) {
  console.error('\nDataset validation FAILED.');
  process.exit(1);
}
console.log('Dataset validation passed.');
