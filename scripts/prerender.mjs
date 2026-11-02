// Post-build: writes static HTML for /library and every /library/<verb id> into
// dist/, plus sitemap.xml. Crawlers that do not run JavaScript (ChatGPT search
// among them) otherwise see an empty <div id="root">. React mounts over this markup
// as before; Cloudflare Pages serves dist/library/a1v-001-sein.html at
// /library/a1v-001-sein. No inline scripts or styles: the CSP in _headers forbids them.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ORIGIN = 'https://verben.deulern.com';
const shell = readFileSync('dist/index.html', 'utf8');
const verbs = ['a1', 'a2', 'b1'].flatMap(
  (l) => JSON.parse(readFileSync(`src/data/verbs/${l}.json`, 'utf8')).verbs,
);

const PERSONS = [
  ['ich', 'ich'],
  ['du', 'du'],
  ['erSieEs', 'er/sie/es'],
  ['wir', 'wir'],
  ['ihr', 'ihr'],
  ['sieSie', 'sie/Sie'],
];
const TENSES = [
  ['present', 'Present (Präsens)'],
  ['simplePast', 'Simple past (Präteritum)'],
  ['presentPerfect', 'Present perfect (Perfekt)'],
  ['futureI', 'Future (Futur I)'],
];

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function page(path, title, description, main) {
  return shell
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
      `<meta name="description" content="${esc(description)}" />\n    <link rel="canonical" href="${ORIGIN}${path}" />`,
    )
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${ORIGIN}${path}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${esc(title)}" />`)
    .replace('<div id="root"></div>', `<div id="root"><main>\n${main}\n</main></div>`);
}

function write(path, html) {
  const file = `dist${path}.html`;
  mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  writeFileSync(file, html);
}

const table = (caption, forms) =>
  forms
    ? `<table><caption>${caption}</caption><tbody lang="de">
${PERSONS.map(([k, label]) => `<tr><th>${label}</th><td>${esc(forms[k] ?? '—')}</td></tr>`).join('\n')}
</tbody></table>`
    : '';

const byLevel = Object.groupBy(verbs, (v) => v.level);
write(
  '/library',
  page(
    '/library',
    'German verb conjugation tables, A1 to B1 · Deutsch Verben Meister',
    `Conjugation tables for ${verbs.length} German verbs from A1 to B1, with practice in the browser. Free, no account needed.`,
    `<h1>German verb library</h1>
<p>Full conjugation tables for ${verbs.length} German verbs from CEFR level A1 to B1.</p>
${Object.entries(byLevel)
  .map(
    ([level, list]) =>
      `<h2>${level} verbs</h2>\n<ul>\n${list.map((v) => `<li><a href="/library/${v.id}" lang="de">${esc(v.dictionaryForm)}</a> (${esc(v.english.join(', '))})</li>`).join('\n')}\n</ul>`,
  )
  .join('\n')}`,
  ),
);

for (const [level, list] of Object.entries(byLevel)) {
  list.forEach((v, i) => {
    const f = v.forms;
    const imp = f.imperative?.available
      ? `<h2>Imperative (Imperativ)</h2><ul lang="de"><li>du: ${esc(f.imperative.du)}</li><li>ihr: ${esc(f.imperative.ihr)}</li><li>Sie: ${esc(f.imperative.Sie)}</li></ul>`
      : '';
    const k2 = f.konjunktivII?.[f.konjunktivII.preferred === 'synthetic' ? 'synthetic' : 'würdeForm'];
    const neighbours = [list[i - 1], list[i + 1]].filter(Boolean);
    write(
      `/library/${v.id}`,
      page(
        `/library/${v.id}`,
        `${v.dictionaryForm} conjugation: German verb (${level}) · Deutsch Verben Meister`,
        `Conjugation of ${v.dictionaryForm} (${v.english.join(', ')}): present, Präteritum, Perfekt, Futur, imperative and Konjunktiv II. Practise it free in the browser.`,
        `<p><a href="/library">All verbs</a></p>
<h1 lang="de">${esc(v.dictionaryForm)}</h1>
<p>${esc(v.english.join(', '))} · CEFR level ${level} · ${esc(v.regularity)}${v.separable ? ' · separable' : ''} · auxiliary: ${esc(v.auxiliary)}</p>
<p>Past participle: <span lang="de">${esc(f.participles?.past ?? '—')}</span> · Infinitive with zu: <span lang="de">${esc(f.infinitiveWithZu ?? '—')}</span></p>
${v.example ? `<p><span lang="de">${esc(v.example.german)}</span> — ${esc(v.example.english)}</p>` : ''}
${TENSES.map(([k, caption]) => table(caption, f[k])).join('\n')}
${imp}
${table('Konjunktiv II', k2)}
<p><a href="/practice">Practise German verbs</a></p>
<ul>
${neighbours.map((n) => `<li><a href="/library/${n.id}" lang="de">${esc(n.dictionaryForm)}</a></li>`).join('\n')}
</ul>`,
      ),
    );
  });
}

// The home page doubles as the SPA fallback, so it gets only a link to the library.
writeFileSync(
  'dist/index.html',
  shell.replace(
    '<div id="root"></div>',
    '<div id="root"><main><h1>Deutsch Verben Meister: German verb conjugation practice, A1 to B1</h1><p><a href="/library">Browse all verbs</a></p></main></div>',
  ),
);

const urls = ['/', '/library', ...verbs.map((v) => `/library/${v.id}`)];
writeFileSync(
  'dist/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${ORIGIN}${u}</loc></url>`).join('\n')}
</urlset>
`,
);
console.log(`prerender: /library + ${verbs.length} verb pages + sitemap.xml`);
