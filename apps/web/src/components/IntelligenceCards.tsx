import { CheckCircle2, TrendingUp, Target } from 'lucide-react';
import type { IntentItem, TriggerItem, ObjectiveItem, VisualDirectionData } from '../utils/intelligenceRenderers';

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

const urgencyTone: Record<string, string> = {
  low: 'bg-webloom-surface text-webloom-muted border border-webloom-border',
  medium: 'bg-amber-900/30 text-amber-300 border border-amber-800/50',
  high: 'bg-red-900/30 text-red-400 border border-red-800/50',
  urgent: 'bg-red-900/30 text-red-400 border border-red-800/50',
};

const frequencyTone: Record<string, string> = {
  'one-time': 'bg-webloom-surface text-webloom-muted border border-webloom-border',
  recurring: 'bg-primary-900/30 text-primary-400 border border-primary-800/50',
  seasonal: 'bg-purple-900/30 text-purple-300 border border-purple-800/50',
};

const strengthTone: Record<string, string> = {
  weak: 'bg-webloom-surface text-webloom-muted border border-webloom-border',
  moderate: 'bg-amber-900/30 text-amber-300 border border-amber-800/50',
  strong: 'bg-emerald-900/40 text-emerald-400 border border-emerald-800/60',
};

const priorityTone: Record<string, string> = {
  primary: 'bg-primary-900/30 text-primary-400 border border-primary-800/50',
  secondary: 'bg-webloom-surface text-webloom-muted border border-webloom-border',
  tertiary: 'bg-webloom-surface text-webloom-muted border border-webloom-border',
};

function Badge({ label, tone }: { label?: string | null; tone: string }) {
  if (!label) return null;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${tone}`}>
      {label}
    </span>
  );
}

function EmptyNote() {
  return (
    <p className="rounded-xl border border-webloom-border bg-webloom-raised px-3 py-2.5 text-xs text-webloom-muted">
      Not available from the analysed sources.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Customer intent
// ---------------------------------------------------------------------------

export function IntentList({ items }: { items: IntentItem[] | null }) {
  if (!items?.length) return <EmptyNote />;
  return (
    <ul className="space-y-2">
      {items.map((item, idx) => (
        <li key={idx} className="rounded-xl border border-webloom-border bg-webloom-surface px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Target className="h-3.5 w-3.5 shrink-0 text-primary-400" />
            <span className="text-sm font-medium text-webloom-text">{item.intent}</span>
            <span className="ml-auto flex items-center gap-1.5">
              {item.urgency && <Badge label={item.urgency} tone={urgencyTone[item.urgency] || urgencyTone.medium} />}
              {item.frequency && <Badge label={item.frequency} tone={frequencyTone[item.frequency] || frequencyTone['one-time']} />}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Purchase triggers
// ---------------------------------------------------------------------------

export function TriggerList({ items }: { items: TriggerItem[] | null }) {
  if (!items?.length) return <EmptyNote />;
  return (
    <ul className="space-y-2">
      {items.map((item, idx) => (
        <li key={idx} className="rounded-xl border border-webloom-border bg-webloom-surface px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span className="text-sm font-medium text-webloom-text">{item.trigger}</span>
            <span className="ml-auto flex items-center gap-1.5">
              {item.type && <Badge label={item.type} tone="bg-purple-900/30 text-purple-300 border border-purple-800/50" />}
              {item.strength && <Badge label={item.strength} tone={strengthTone[item.strength] || strengthTone.moderate} />}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Website objectives
// ---------------------------------------------------------------------------

export function ObjectiveList({ items }: { items: ObjectiveItem[] | null }) {
  if (!items?.length) return <EmptyNote />;
  return (
    <ul className="space-y-2">
      {items.map((item, idx) => (
        <li key={idx} className="rounded-xl border border-webloom-border bg-webloom-surface px-3 py-2.5">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-webloom-text">{item.objective}</span>
                {item.priority && <Badge label={item.priority} tone={priorityTone[item.priority] || priorityTone.secondary} />}
              </div>
              {item.metrics?.length > 0 && (
                <p className="mt-1 text-xs leading-5 text-webloom-muted">Success metrics: {item.metrics.join(', ')}</p>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Visual direction
// ---------------------------------------------------------------------------

function LabeledRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="rounded-xl border border-webloom-border bg-webloom-surface px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-webloom-muted">{label}</p>
      <p className="mt-0.5 text-sm text-webloom-text">{value}</p>
    </div>
  );
}

function ChipList({ label, values }: { label: string; values: string[] }) {
  if (!values?.length) return null;
  return (
    <div className="rounded-xl border border-webloom-border bg-webloom-surface px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-webloom-muted">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center rounded-full border border-webloom-border bg-webloom-raised px-2 py-0.5 text-xs text-webloom-text">{v}</span>
        ))}
      </div>
    </div>
  );
}

export function VisualDirectionPanel({ data }: { data: VisualDirectionData | null }) {
  if (!data) return <EmptyNote />;

  const hasAny = data.mood || data.colorPrimary || data.colorSecondary || data.imageryStyle
    || data.imagerySubjects.length || data.imageryAvoid.length || data.typographyStyle;

  if (!hasAny) return <EmptyNote />;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <LabeledRow label="Mood" value={data.mood} />
      <LabeledRow label="Primary colour" value={data.colorPrimary} />
      <LabeledRow label="Secondary colour" value={data.colorSecondary} />
      <LabeledRow label="Imagery style" value={data.imageryStyle} />
      <LabeledRow label="Typography" value={data.typographyStyle} />
      {data.colorReasoning && <LabeledRow label="Colour reasoning" value={data.colorReasoning} />}
      <ChipList label="Imagery subjects" values={data.imagerySubjects} />
      <ChipList label="Imagery to avoid" values={data.imageryAvoid} />
      {data.typographyReasoning && (
        <div className="sm:col-span-2">
          <LabeledRow label="Typography reasoning" value={data.typographyReasoning} />
        </div>
      )}
    </div>
  );
}