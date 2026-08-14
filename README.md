# Deutsch Verben Meister

A frontend-only German verb trainer. 676 verbs across A1, A2 and B1, practised
through eight form categories and seven exercise formats, scheduled by spaced
repetition. Everything runs in the browser; nothing is uploaded anywhere.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Typecheck and produce a static `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Full test suite (71 tests) |
| `npm run typecheck` | Types only |
| `npm run validate:data` | Validate all three verb datasets |

The build is static and hash-routed, so `dist/` can be dropped on any host
without server rewrite rules.

## How it is put together

Verb content is kept completely separate from interface code. The datasets in
`src/data/verbs/` are validated by a Zod schema plus a semantic audit, and the
app only ever reads them through `verbRepository`, which loads each CEFR level
as its own lazy chunk — studying A1 never downloads the 348-entry B1 file.

```
src/
  types/          Verb schema types, form-category definitions
  data/           Datasets, Zod schema + semantic audit, lazy repository
  lib/            Grader, spaced repetition, text utilities, achievements
  exercises/      Form access, distractors, 7 generators, session builder
  store/          Settings, progress, gamification (localStorage-backed)
  components/     Layout, exercise views, UI primitives
  pages/          Dashboard, Practice, Library, Progress, Badges, Settings
scripts/          Dataset validation gate
```

### The scheduled unit is a form, not a verb

Spaced repetition tracks `(verb, category, slot)` — `gehen` in the du-slot of
the present tense is a different card from `gehen` in the perfect. That is the
granularity at which learners actually have gaps, so a weak form can come back
tomorrow without dragging the whole verb with it.

The scheduler is SM-2 with two changes: short intra-day learning steps for new
material, and a damped ease penalty so one bad session cannot permanently sour
a card. A card is *mastered* once it survives a 21-day interval with at least
four successful repetitions.

### Answer checking explains itself

The grader decides acceptance *and* diagnoses the mistake, so feedback can say
"this verb builds its perfect with sein, not haben" instead of showing a bare
cross. It detects capitalisation, umlauts written as `ae`/`oe`/`ue`, `ß` versus
`ss`, word order, wrong auxiliary, malformed participles, reflexive-pronoun
disagreement, separable-prefix placement, and single-character typos.

Strictness is the intersection of what a verb entry marks as significant and
what you have asked to be held to — settings can relax a check, never tighten
it past what the content supports. Auxiliary choice, participle formation,
pronoun agreement and prefix placement are always enforced, because getting
those wrong means the form itself is wrong.

### Exercises are generated, then verified

Seven formats: multiple choice, typed conjugation, sentence completion,
matching, error correction, tense transformation and sentence building. A
generator returns `null` when a form cannot support its format — sentence
building needs a usable example sentence — and the session builder falls back.

Sentence frames exploit a property of the datasets: multi-word forms are stored
in main-clause linear order (`wohne zusammen`, `habe mich vorgestellt`), so a
`{Subject} ___ .` frame is grammatical for any tense, separable or reflexive
verb. Where a verb's curated example sentence actually contains the target
form, that real sentence is used instead.

New material is always introduced through recognition before it is demanded in
production — you cannot recall what you have never seen.

### Motivation

XP scaled by category difficulty and exercise type, an in-session combo
multiplier, twelve German-named ranks, a calendar-local daily streak, a daily
XP goal ring, and 26 achievements weighted toward consistency and depth rather
than raw volume.

## Testing

`npm test` runs 71 tests. The substantial one drives the real generators over
all 676 real verbs and every form category — roughly 10,000 generated exercises
— asserting that none is malformed, that every generator grades its own correct
answer as correct, and that no distractor is secretly also a right answer.
`src/App.test.tsx` mounts the real app and plays a full session through to the
summary, checking that answering actually moves stored progress.

## Data notes

All 676 entries pass validation with zero errors. Thirteen warnings are
intentional content, not defects:

- Eight duplicate dictionary forms — deliberate homograph entries such as
  reflexive versus plain `vorstellen`, which conjugate differently.
- Five verbs marked `"haben/sein"`, whose auxiliary genuinely varies with
  meaning. The app accepts either answer for these.

The datasets recommend a native-speaker editorial pass before production use,
particularly for example sentences and valency.
