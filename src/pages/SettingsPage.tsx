import { useMemo, useState } from 'react';
import { useVerbs } from '@/hooks/useVerbs';
import {
  CATEGORY_GROUP_LABELS,
  FORM_CATEGORIES,
  FORM_CATEGORY_META,
  type FormCategory,
  type FormCategoryMeta,
} from '@/types/formCategory';
import { EXERCISE_TYPE_META, EXERCISE_TYPES } from '@/exercises/types';
import { CEFR_LEVELS, type CefrLevel } from '@/types/verb';
import { enabledCategories, useSettings, type Regularity } from '@/store/settingsStore';
import { useProgress } from '@/store/progressStore';
import { useGamification } from '@/store/gamificationStore';
import { countActiveFilters } from '@/lib/filters';
import { countPractisable } from '@/exercises/sessionBuilder';
import { Badge, Button, Card, cx, SectionHeading, Segmented, Toggle } from '@/components/ui';

/**
 * Settings.
 *
 * The headline feature is category control: turning a form category off
 * removes it from generation and from scheduling, so sessions contain only
 * what the learner currently wants to work on.
 */
export function SettingsPage() {
  const settings = useSettings();
  const { verbs, filtered, facets, loading } = useVerbs();
  const [confirmingReset, setConfirmingReset] = useState<'progress' | 'all' | null>(null);

  const categories = useMemo(() => enabledCategories(settings), [settings]);
  const practisable = useMemo(
    () => countPractisable(filtered, categories),
    [filtered, categories],
  );

  const grouped = useMemo(() => {
    const groups = new Map<FormCategoryMeta['group'], FormCategory[]>();
    for (const category of FORM_CATEGORIES) {
      const group = FORM_CATEGORY_META[category].group;
      groups.set(group, [...(groups.get(group) ?? []), category]);
    }
    return [...groups.entries()];
  }, []);

  const activeFilters = countActiveFilters(settings.filters);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          {loading
            ? 'Loading…'
            : `${filtered.length} of ${verbs.length} verbs in your pool · ${practisable.toLocaleString()} practisable forms`}
        </p>
      </div>

      {/* Levels */}
      <Card className="p-5">
        <SectionHeading
          title="CEFR levels"
          description="Datasets load on demand — enabling B1 downloads it the first time."
        />
        <div className="flex flex-wrap gap-2">
          {CEFR_LEVELS.map((level) => (
            <LevelChip key={level} level={level} />
          ))}
        </div>
      </Card>

      {/* Form categories */}
      <Card className="p-5">
        <SectionHeading
          title="Verb forms to practise"
          description="Only enabled categories are generated, graded and scheduled."
          action={
            <div className="flex gap-1.5">
              <Button size="sm" onClick={() => settings.setCategories(true)}>
                All
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  settings.setCategoryGroup(
                    FORM_CATEGORIES.filter((c) => c !== 'present'),
                    false,
                  )
                }
              >
                Only Präsens
              </Button>
            </div>
          }
        />

        <div className="space-y-5">
          {grouped.map(([group, groupCategories]) => {
            const allOn = groupCategories.every((c) => settings.categories[c]);
            return (
              <div key={group}>
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {CATEGORY_GROUP_LABELS[group]}
                  </h3>
                  <button
                    type="button"
                    className="text-xs text-gold-600 hover:underline dark:text-gold-400"
                    onClick={() => settings.setCategoryGroup(groupCategories, !allOn)}
                  >
                    {allOn ? 'none' : 'all'}
                  </button>
                </div>
                <div className="grid gap-x-6 sm:grid-cols-2">
                  {groupCategories.map((category) => (
                    <Toggle
                      key={category}
                      checked={settings.categories[category]}
                      onChange={() => settings.toggleCategory(category)}
                      label={
                        <span className="flex items-center gap-2">
                          {FORM_CATEGORY_META[category].label}
                          <Badge tone="neutral">{FORM_CATEGORY_META[category].xp} XP</Badge>
                        </span>
                      }
                      description={FORM_CATEGORY_META[category].description}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Exercise formats */}
      <Card className="p-5">
        <SectionHeading
          title="Exercise formats"
          description="Production formats are worth more XP because they are harder."
        />
        <div className="grid gap-x-6 sm:grid-cols-2">
          {EXERCISE_TYPES.map((type) => (
            <Toggle
              key={type}
              checked={settings.exerciseTypes[type]}
              onChange={() => settings.toggleExerciseType(type)}
              label={
                <span className="flex items-center gap-2">
                  {EXERCISE_TYPE_META[type].label}
                  <Badge tone={EXERCISE_TYPE_META[type].mode === 'production' ? 'violet' : 'blue'}>
                    {EXERCISE_TYPE_META[type].mode}
                  </Badge>
                </span>
              }
              description={EXERCISE_TYPE_META[type].description}
            />
          ))}
        </div>
      </Card>

      {/* Verb pool filters */}
      <Card className="p-5">
        <SectionHeading
          title="Verb pool"
          description="Narrow practice to a grammatical pattern you want to drill."
          action={
            activeFilters > 0 ? (
              <Button
                size="sm"
                onClick={() =>
                  settings.setFilters({
                    regularity: [],
                    separability: 'all',
                    auxiliary: 'all',
                    reflexive: 'all',
                    topics: [],
                    verbClasses: [],
                  })
                }
              >
                Clear {activeFilters}
              </Button>
            ) : undefined
          }
        />

        <div className="space-y-4">
          <FilterRow label="Regularity">
            <div className="flex flex-wrap gap-1.5">
              {(['regular', 'irregular', 'mixed'] as Regularity[]).map((option) => {
                const active = settings.filters.regularity.includes(option);
                return (
                  <ChipToggle
                    key={option}
                    active={active}
                    onClick={() =>
                      settings.setFilters({
                        regularity: active
                          ? settings.filters.regularity.filter((r) => r !== option)
                          : [...settings.filters.regularity, option],
                      })
                    }
                  >
                    {option}
                  </ChipToggle>
                );
              })}
            </div>
          </FilterRow>

          <FilterRow label="Separability">
            <Segmented
              size="sm"
              value={settings.filters.separability}
              onChange={(value) => settings.setFilters({ separability: value })}
              options={[
                { value: 'all', label: 'All' },
                { value: 'separable', label: 'Separable' },
                { value: 'inseparable', label: 'Inseparable' },
              ]}
            />
          </FilterRow>

          <FilterRow label="Auxiliary">
            <Segmented
              size="sm"
              value={settings.filters.auxiliary}
              onChange={(value) => settings.setFilters({ auxiliary: value })}
              options={[
                { value: 'all', label: 'All' },
                { value: 'haben', label: 'haben' },
                { value: 'sein', label: 'sein' },
              ]}
            />
          </FilterRow>

          <FilterRow label="Reflexive">
            <Segmented
              size="sm"
              value={settings.filters.reflexive}
              onChange={(value) => settings.setFilters({ reflexive: value })}
              options={[
                { value: 'all', label: 'All' },
                { value: 'reflexive', label: 'Reflexive' },
                { value: 'non-reflexive', label: 'Non-reflexive' },
              ]}
            />
          </FilterRow>

          <FilterRow label="Topics">
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {facets.topics.map((topic) => {
                const active = settings.filters.topics.includes(topic);
                return (
                  <ChipToggle
                    key={topic}
                    active={active}
                    onClick={() =>
                      settings.setFilters({
                        topics: active
                          ? settings.filters.topics.filter((t) => t !== topic)
                          : [...settings.filters.topics, topic],
                      })
                    }
                  >
                    {topic}
                  </ChipToggle>
                );
              })}
            </div>
          </FilterRow>

          <FilterRow label="Verb classes">
            <div className="flex flex-wrap gap-1.5">
              {facets.verbClasses.map((klass) => {
                const active = settings.filters.verbClasses.includes(klass);
                return (
                  <ChipToggle
                    key={klass}
                    active={active}
                    onClick={() =>
                      settings.setFilters({
                        verbClasses: active
                          ? settings.filters.verbClasses.filter((c) => c !== klass)
                          : [...settings.filters.verbClasses, klass],
                      })
                    }
                  >
                    {klass}
                  </ChipToggle>
                );
              })}
            </div>
          </FilterRow>
        </div>

        {filtered.length === 0 && !loading && (
          <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            These filters match no verbs. Practice will be empty until you loosen them.
          </p>
        )}
      </Card>

      {/* Answer checking */}
      <Card className="p-5">
        <SectionHeading
          title="Answer checking"
          description="Turning a check off downgrades it to a note instead of a wrong answer."
        />
        <div className="grid gap-x-6 sm:grid-cols-2">
          <Toggle
            checked={settings.strictness.capitalization}
            onChange={(value) => settings.setStrictness({ capitalization: value })}
            label="Capitalisation"
            description="Require du gehst, not Du Gehst."
          />
          <Toggle
            checked={settings.strictness.umlauts}
            onChange={(value) => settings.setStrictness({ umlauts: value })}
            label="Umlauts"
            description="Require ä, ö, ü rather than ae, oe, ue."
          />
          <Toggle
            checked={settings.strictness.eszett}
            onChange={(value) => settings.setStrictness({ eszett: value })}
            label="ß versus ss"
            description="Require heißt, not heisst."
          />
          <Toggle
            checked={settings.strictness.wordOrder}
            onChange={(value) => settings.setStrictness({ wordOrder: value })}
            label="Word order"
            description="Require bin gegangen, not gegangen bin."
          />
          <Toggle
            checked={settings.strictness.allowTypos}
            onChange={(value) => settings.setStrictness({ allowTypos: value })}
            label="Forgive single typos"
            description="Accept an answer that is one character off."
          />
        </div>
        <p className="mt-3 text-xs text-muted">
          Auxiliary choice, participle formation, pronoun agreement and separable prefixes are
          always checked — getting those wrong means the form itself is wrong.
        </p>
      </Card>

      {/* Session and motivation */}
      <Card className="p-5">
        <SectionHeading title="Session & motivation" />

        <div className="space-y-4">
          <NumberRow
            label="Questions per session"
            value={settings.session.length}
            min={5}
            max={100}
            step={5}
            onChange={(length) => settings.setSession({ length })}
          />
          <NumberRow
            label="New forms per session"
            value={settings.session.newCardLimit}
            min={0}
            max={40}
            step={2}
            onChange={(newCardLimit) => settings.setSession({ newCardLimit })}
            hint="0 means review only"
          />
          <NumberRow
            label="Daily XP goal"
            value={settings.dailyGoalXp}
            min={20}
            max={1000}
            step={10}
            onChange={settings.setDailyGoalXp}
          />
        </div>

        <div className="mt-2 grid gap-x-6 sm:grid-cols-2">
          <Toggle
            checked={settings.showTranslations}
            onChange={settings.setShowTranslations}
            label="Show English meanings"
            description="Display translations alongside prompts."
          />
          <Toggle
            checked={settings.autoAdvance}
            onChange={settings.setAutoAdvance}
            label="Auto-advance on correct"
            description="Skip the feedback panel when you get it right."
          />
        </div>
      </Card>

      {/* Data */}
      <Card className="p-5">
        <SectionHeading
          title="Your data"
          description="Everything is stored in this browser. Nothing is uploaded anywhere."
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => settings.resetToDefaults()}>Reset settings</Button>

          <Button
            variant={confirmingReset === 'progress' ? 'danger' : 'secondary'}
            onClick={() => {
              if (confirmingReset === 'progress') {
                useProgress.getState().resetProgress();
                setConfirmingReset(null);
              } else {
                setConfirmingReset('progress');
              }
            }}
          >
            {confirmingReset === 'progress' ? 'Really erase progress?' : 'Erase learning progress'}
          </Button>

          <Button
            variant={confirmingReset === 'all' ? 'danger' : 'secondary'}
            onClick={() => {
              if (confirmingReset === 'all') {
                useProgress.getState().resetProgress();
                useGamification.getState().resetGamification();
                settings.resetToDefaults();
                setConfirmingReset(null);
              } else {
                setConfirmingReset('all');
              }
            }}
          >
            {confirmingReset === 'all' ? 'Really erase everything?' : 'Erase everything'}
          </Button>

          {confirmingReset && (
            <Button variant="ghost" onClick={() => setConfirmingReset(null)}>
              Cancel
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function LevelChip({ level }: { level: CefrLevel }) {
  const levels = useSettings((state) => state.levels);
  const toggleLevel = useSettings((state) => state.toggleLevel);
  const active = levels.includes(level);
  const isLast = active && levels.length === 1;

  return (
    <button
      type="button"
      onClick={() => toggleLevel(level)}
      disabled={isLast}
      title={isLast ? 'At least one level must stay enabled' : undefined}
      className={cx(
        'rounded-xl border-2 px-4 py-2 text-sm font-semibold transition-colors',
        active
          ? 'border-gold-500 bg-gold-500/15 text-gold-700 dark:text-gold-300'
          : 'border-[var(--border-subtle)] text-muted hover:border-ink-300',
        isLast && 'cursor-not-allowed opacity-70',
      )}
    >
      {level}
    </button>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-4">
      <span className="w-28 shrink-0 pt-1 text-sm font-medium text-muted">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function ChipToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-gold-500 bg-gold-500/15 text-gold-700 dark:text-gold-300'
          : 'border-[var(--border-subtle)] text-muted hover:border-ink-300',
      )}
    >
      {children}
    </button>
  );
}

function NumberRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
      <span className="w-44 shrink-0 text-sm font-medium">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-ink-200 accent-gold-500 dark:bg-ink-800"
        aria-label={label}
      />
      <span className="w-24 shrink-0 text-right text-sm tabular-nums text-muted">
        {value}
        {hint && <span className="block text-[10px] leading-3">{hint}</span>}
      </span>
    </div>
  );
}
