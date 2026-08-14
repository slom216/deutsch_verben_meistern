import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useVerbs } from '@/hooks/useVerbs';
import { searchVerbs } from '@/lib/filters';
import { PERSONS, PERSON_LABELS, specialForms, type Verb } from '@/types/verb';
import { availableCategories } from '@/data/verbRepository';
import { FORM_CATEGORY_META } from '@/types/formCategory';
import { makeCardId, formatInterval, type CardRecord } from '@/lib/srs';
import { slotsFor } from '@/exercises/formAccess';
import { enabledCategories, useSettings } from '@/store/settingsStore';
import { useProgress } from '@/store/progressStore';
import { Badge, Card, cx, EmptyState, ProgressBar, Spinner } from '@/components/ui';

/**
 * Verb library: browse and search the corpus, and inspect a full paradigm
 * together with your own mastery of each individual form.
 */
export function LibraryPage() {
  const { verbId } = useParams();
  const navigate = useNavigate();
  const { filtered, byId, loading } = useVerbs();
  const [query, setQuery] = useState('');

  const results = useMemo(() => searchVerbs(filtered, query), [filtered, query]);
  const selected = verbId ? byId.get(verbId) : undefined;

  if (loading) return <Spinner label="Loading verbs…" />;

  if (selected) {
    return <VerbDetail verb={selected} onBack={() => navigate('/library')} />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Verb library</h1>
        <p className="mt-1 text-sm text-muted">
          {results.length} of {filtered.length} verbs in your current pool
        </p>
      </div>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search infinitive, meaning or topic…"
        aria-label="Search verbs"
        className="answer-input w-full rounded-xl px-4 py-2.5 text-base"
      />

      {results.length === 0 ? (
        <Card>
          <EmptyState
            icon="🔍"
            title="No verbs found"
            description="Try a different search term, or widen your filters in settings."
          />
        </Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {results.slice(0, 200).map((verb) => (
            <VerbRow key={verb.id} verb={verb} onOpen={() => navigate(`/library/${verb.id}`)} />
          ))}
        </div>
      )}

      {results.length > 200 && (
        <p className="text-center text-xs text-muted">
          Showing the first 200 of {results.length}. Narrow your search to see more.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Fraction of this verb's practisable forms that are mastered. */
function useVerbMastery(verb: Verb) {
  const cards = useProgress((state) => state.cards);
  const settings = useSettings();

  return useMemo(() => {
    const categories = enabledCategories(settings);
    let total = 0;
    let mastered = 0;
    let seen = 0;

    for (const category of categories) {
      for (const slot of slotsFor(verb, category)) {
        total += 1;
        const card = cards[makeCardId(verb.id, category, slot)];
        if (!card) continue;
        seen += 1;
        if (card.state === 'mastered') mastered += 1;
      }
    }

    return { total, mastered, seen, ratio: total === 0 ? 0 : mastered / total };
  }, [verb, cards, settings]);
}

function VerbRow({ verb, onOpen }: { verb: Verb; onOpen: () => void }) {
  const mastery = useVerbMastery(verb);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="surface-card flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors hover:border-gold-500"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-semibold">{verb.dictionaryForm}</span>
          <Badge tone="neutral">{verb.level}</Badge>
          {verb.regularity !== 'regular' && <Badge tone="violet">{verb.regularity}</Badge>}
          {verb.separable && <Badge tone="blue">trennbar</Badge>}
        </div>
        <p className="truncate text-sm text-muted">{verb.english.join(', ')}</p>
        {mastery.seen > 0 && (
          <ProgressBar
            value={mastery.ratio}
            tone={mastery.ratio === 1 ? 'green' : 'gold'}
            className="mt-1.5 h-1"
            label="Mastery"
          />
        )}
      </div>
      {mastery.ratio === 1 && mastery.total > 0 && (
        <span className="text-lg" title="Fully mastered" aria-label="Fully mastered">
          👑
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */

function VerbDetail({ verb, onBack }: { verb: Verb; onBack: () => void }) {
  const cards = useProgress((state) => state.cards);
  const mastery = useVerbMastery(verb);
  const categories = availableCategories(verb);
  const extras = specialForms(verb);

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-muted hover:underline">
        ← Back to library
      </button>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl font-semibold tracking-tight">
              {verb.dictionaryForm}
            </h1>
            <p className="mt-1 text-muted">{verb.english.join(', ')}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="neutral">{verb.level}</Badge>
            <Badge tone="neutral">#{verb.rank}</Badge>
            <Badge tone="violet">{verb.regularity}</Badge>
            <Badge tone={verb.auxiliary === 'sein' ? 'green' : 'blue'}>{verb.auxiliary}</Badge>
            {verb.separable && <Badge tone="blue">separable · {verb.prefix}</Badge>}
            {verb.reflexive.isReflexive && (
              <Badge tone="gold">reflexive · {verb.reflexive.case}</Badge>
            )}
          </div>
        </div>

        <p className="mt-4 rounded-xl bg-ink-100 px-4 py-3 dark:bg-ink-800">
          <span className="block font-medium">{verb.example.german}</span>
          <span className="mt-0.5 block text-sm text-muted italic">{verb.example.english}</span>
        </p>

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
          <span>Topic: {verb.topic}</span>
          <span>Band: {verb.frequencyBand}</span>
          <span>Classes: {verb.verbClasses.join(', ')}</span>
        </div>

        {mastery.total > 0 && (
          <div className="mt-4">
            <div className="flex items-baseline justify-between text-xs text-muted">
              <span>Your mastery of enabled forms</span>
              <span className="tabular-nums">
                {mastery.mastered} / {mastery.total}
              </span>
            </div>
            <ProgressBar
              value={mastery.ratio}
              tone={mastery.ratio === 1 ? 'green' : 'gold'}
              className="mt-1"
              label="Mastery"
            />
          </div>
        )}
      </Card>

      {/* Valency */}
      {(verb.requiredCases.length > 0 || verb.fixedPrepositions.length > 0) && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Case & prepositions</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {verb.requiredCases.map((requiredCase) => (
              <li key={requiredCase}>
                Takes a <strong>{requiredCase}</strong> object.
              </li>
            ))}
            {verb.fixedPrepositions.map((preposition) => (
              <li key={`${preposition.preposition}-${preposition.case}`}>
                <strong>
                  {verb.infinitive} + {preposition.preposition}
                </strong>{' '}
                + {preposition.case}
                {preposition.meaning && <span className="text-muted"> — {preposition.meaning}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Paradigms */}
      {(['present', 'simplePast', 'presentPerfect', 'futureI'] as const).map((category) => (
        <ParadigmTable key={category} verb={verb} category={category} cards={cards} />
      ))}

      {/* Konjunktiv II */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">{FORM_CATEGORY_META.konjunktivII.label}</h2>
        <p className="mt-0.5 text-xs text-muted">
          Preferred: {verb.forms.konjunktivII.preferred === 'synthetic' ? 'synthetic' : 'würde form'}
        </p>
        <div className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {PERSONS.map((person) => {
            const card = cards[makeCardId(verb.id, 'konjunktivII', person)];
            return (
              <FormRow
                key={person}
                label={PERSON_LABELS[person]}
                value={
                  verb.forms.konjunktivII.synthetic?.[person] ??
                  verb.forms.konjunktivII.würdeForm[person]
                }
                secondary={
                  verb.forms.konjunktivII.synthetic
                    ? verb.forms.konjunktivII.würdeForm[person]
                    : undefined
                }
                card={card}
              />
            );
          })}
        </div>
      </Card>

      {/* Imperative */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">{FORM_CATEGORY_META.imperative.label}</h2>
        {verb.forms.imperative.available ? (
          <div className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2">
            {(['du', 'ihr', 'Sie'] as const).map((target) =>
              verb.forms.imperative[target] ? (
                <FormRow
                  key={target}
                  label={target}
                  value={verb.forms.imperative[target]!}
                  card={cards[makeCardId(verb.id, 'imperative', target)]}
                />
              ) : null,
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">
            No imperative — {verb.forms.imperative.reason ?? 'not used with this verb'}.
          </p>
        )}
      </Card>

      {/* Non-finite */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">Non-finite forms</h2>
        <div className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <FormRow
            label="Partizip II"
            value={verb.forms.participles.past}
            card={cards[makeCardId(verb.id, 'pastParticiple')]}
          />
          <FormRow
            label="Partizip I"
            value={verb.forms.participles.present}
            card={cards[makeCardId(verb.id, 'presentParticiple')]}
          />
          <FormRow
            label="zu-Infinitiv"
            value={verb.forms.infinitiveWithZu}
            card={cards[makeCardId(verb.id, 'infinitiveWithZu')]}
          />
          <FormRow label="3rd person sg." value={verb.forms.thirdPersonPresent} />
        </div>
      </Card>

      {/* Optional reflexive reading */}
      {verb.optionalReflexiveForms && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Reflexive reading</h2>
          <p className="mt-0.5 text-xs text-muted">
            This verb is also used reflexively; both readings are accepted when you practise.
          </p>
          <div className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2">
            {PERSONS.map((person) =>
              verb.optionalReflexiveForms?.present?.[person] ? (
                <FormRow
                  key={person}
                  label={PERSON_LABELS[person]}
                  value={verb.optionalReflexiveForms.present[person]}
                />
              ) : null,
            )}
          </div>
        </Card>
      )}

      {/* Editorial extras */}
      {Object.keys(extras).length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Special forms & notes</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {Object.entries(extras).map(([key, value]) => (
              <li key={key}>
                <span className="text-muted">{key}: </span>
                <span className="font-medium">
                  {typeof value === 'string' ? value : JSON.stringify(value)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Badge tone="neutral">
          Practisable categories: {categories.map((c) => FORM_CATEGORY_META[c].short).join(', ')}
        </Badge>
      </div>
    </div>
  );
}

function ParadigmTable({
  verb,
  category,
  cards,
}: {
  verb: Verb;
  category: 'present' | 'simplePast' | 'presentPerfect' | 'futureI';
  cards: Record<string, CardRecord>;
}) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold">{FORM_CATEGORY_META[category].label}</h2>
      <div className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2">
        {PERSONS.map((person) => (
          <FormRow
            key={person}
            label={PERSON_LABELS[person]}
            value={verb.forms[category][person]}
            card={cards[makeCardId(verb.id, category, person)]}
          />
        ))}
      </div>
    </Card>
  );
}

/** One paradigm slot, annotated with its spaced-repetition state. */
function FormRow({
  label,
  value,
  secondary,
  card,
}: {
  label: string;
  value: string;
  secondary?: string;
  card?: CardRecord;
}) {
  const stateStyles: Record<string, { dot: string; title: string }> = {
    new: { dot: 'bg-ink-300 dark:bg-ink-700', title: 'Not practised yet' },
    learning: { dot: 'bg-gold-500', title: 'Learning' },
    review: { dot: 'bg-sky-500', title: 'In review' },
    lapsed: { dot: 'bg-red-500', title: 'Forgotten — coming back soon' },
    mastered: { dot: 'bg-emerald-500', title: 'Mastered' },
  };
  const style = stateStyles[card?.state ?? 'new'];

  return (
    <div className="flex items-baseline gap-2 border-b border-[var(--border-subtle)] py-1.5 last:border-0">
      <span
        className={cx('h-2 w-2 shrink-0 rounded-full', style.dot)}
        title={
          card
            ? `${style.title} · ${card.correct}/${card.seen} correct · next ${formatInterval(Math.max(0, card.due - Date.now()))}`
            : style.title
        }
        aria-hidden
      />
      <span className="w-20 shrink-0 text-sm text-muted">{label}</span>
      <span className="min-w-0 flex-1 font-medium">
        {value}
        {secondary && <span className="ml-2 text-sm font-normal text-muted">/ {secondary}</span>}
      </span>
    </div>
  );
}
