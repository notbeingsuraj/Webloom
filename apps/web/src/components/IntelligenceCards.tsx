import { CheckCircle2, TrendingUp, Target } from 'lucide-react';
import type { IntentItem, TriggerItem, ObjectiveItem, VisualDirectionData } from '../utils/intelligenceRenderers';

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

const urgencyTone: Record<string, string> = {
  low: 'bg-[#F5F5F7] text-[#6E6E73] border border-[#E5E5EA]',
  medium: 'bg-[#FFF7ED] text-[#C2410C] border border-[#FBD4A8]',
  high: 'bg-[#FDECEC] text-[#B42318] border border-[#F0C5C2]',
  urgent: 'bg-[#FDECEC] text-[#B42318] border border-[#F0C5C2]',
};

const frequencyTone: Record<string, string> = {
  'one-time': 'bg-[#F5F5F7] text-[#6E6E73] border border-[#E5E5EA]',
  recurring: 'bg-[#EBF3FF] text-[#0A84FF] border border-[#D8E9FF]',
  seasonal: 'bg-[#F5F3FF] text-[#6D28D9] border border-[#DDD6FE]',
};

const strengthTone: Record<string, string> = {
  weak: 'bg-[#F5F5F7] text-[#6E6E73] border border-[#E5E5EA]',
  moderate: 'bg-[#FFF7ED] text-[#C2410C] border border-[#FBD4A8]',
  strong: 'bg-[#ECFDF5] text-[#067647] border border-[#BAF0C4]',
};

const priorityTone: Record<string, string> = {
  primary: 'bg-[#EBF3FF] text-[#0A84FF] border border-[#D8E9FF]',
  secondary: 'bg-[#F5F5F7] text-[#6E6E73] border border-[#E5E5EA]',
  tertiary: 'bg-[#F5F5F7] text-[#6E6E73] border border-[#E5E5EA]',
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
    <p className="rounded-xl border border-[#E5E5EA] bg-[#F7F7F8] px-3 py-2.5 text-xs text-[#6E6E73]">
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
        <li key={idx} className="rounded-xl border border-[#E5E5EA] bg-white px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Target className="h-3.5 w-3.5 shrink-0 text-[#0A84FF]" />
            <span className="text-sm font-medium text-[#111111]">{item.intent}</span>
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
        <li key={idx} className="rounded-xl border border-[#E5E5EA] bg-white px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 shrink-0 text-[#C2410C]" />
            <span className="text-sm font-medium text-[#111111]">{item.trigger}</span>
            <span className="ml-auto flex items-center gap-1.5">
              {item.type && <Badge label={item.type} tone="bg-[#F5F3FF] text-[#6D28D9] border border-[#DDD6FE]" />}
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
        <li key={idx} className="rounded-xl border border-[#E5E5EA] bg-white px-3 py-2.5">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#067647]" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-[#111111]">{item.objective}</span>
                {item.priority && <Badge label={item.priority} tone={priorityTone[item.priority] || priorityTone.secondary} />}
              </div>
              {item.metrics?.length > 0 && (
                <p className="mt-1 text-xs leading-5 text-[#6E6E73]">Success metrics: {item.metrics.join(', ')}</p>
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
    <div className="rounded-xl border border-[#E5E5EA] bg-white px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-[#6E6E73]">{label}</p>
      <p className="mt-0.5 text-sm text-[#111111]">{value}</p>
    </div>
  );
}

function ChipList({ label, values }: { label: string; values: string[] }) {
  if (!values?.length) return null;
  return (
    <div className="rounded-xl border border-[#E5E5EA] bg-white px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-[#6E6E73]">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center rounded-full border border-[#E5E5EA] bg-[#F7F7F8] px-2 py-0.5 text-xs text-[#111111]">{v}</span>
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