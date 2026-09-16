/**
 * MissingIntelligence — honest "missing intelligence" panel.
 *
 * Lists fields that are absent from the verified profile, explains why where
 * known, and offers a recovery action. Never fabricates a value to fill a gap.
 *
 * Sources of "missing":
 *   - contact.phone / email / website absent
 *   - analysis.metrics.unknowns (explicit unknowns reported by the pipeline)
 *   - analysis.audit.websiteExists === false (no site to audit)
 */
import { AlertCircle, HelpCircle, RefreshCw, Sparkles, Wrench } from 'lucide-react';
import type { Lead } from '../services/leadService';

interface MissingItem {
  label: string;
  why: string;
  recovery: string;
  aiEnrichable: boolean;
}

export function deriveMissing(lead: Lead | undefined): MissingItem[] {
  if (!lead) return [];
  const items: MissingItem[] = [];

  if (!lead.contact?.phone) {
    items.push({
      label: 'Phone number',
      why: 'No phone number was present in the structured provider record or the source website.',
      recovery: 'Confirm from the Google Business listing, then re-run the analysis.',
      aiEnrichable: false,
    });
  }
  if (!lead.contact?.email) {
    items.push({
      label: 'Email address',
      why: 'Email is rarely published in Maps data and was not found on a discoverable website.',
      recovery: 'Recover from the business website contact page, or note it manually.',
      aiEnrichable: false,
    });
  }
  if (!lead.contact?.website) {
    items.push({
      label: 'Website',
      why: 'No website was linked from the business sources — this is itself a strong opportunity signal.',
      recovery: 'Generate a conversion-ready site from the verified profile.',
      aiEnrichable: true,
    });
  }

  const unknowns = lead.analysis?.metrics?.unknowns ?? [];
  unknowns.slice(0, 5).forEach((unknown) => {
    items.push({
      label: typeof unknown === 'string' ? unknown : 'Unknown field',
      why: 'The extraction pipeline flagged this as not verifiable from the supplied sources.',
      recovery: 'Re-run the analysis with force refresh, or supply the value during outreach.',
      aiEnrichable: true,
    });
  });

  return items;
}

export default function MissingIntelligence({ lead, onRetry }: { lead: Lead | undefined; onRetry?: () => void }) {
  const items = deriveMissing(lead);

  return (
    <div className="wl-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Missing intelligence</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-warning-foreground">
            <HelpCircle className="h-3 w-3" /> {items.length} gap{items.length === 1 ? '' : 's'}
          </span>
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Re-run analysis
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="mt-5 flex items-center gap-2 rounded-xl border border-verified/25 bg-verified/10 px-4 py-3 text-sm text-verified">
          <Wrench className="h-4 w-4" />
          No missing fields detected — the verified profile is complete for the current sources.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {items.map((item, i) => (
            <li key={`${item.label}-${i}`} className="rounded-2xl border border-border bg-gradient-to-br from-secondary/70 to-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-warning" />
                <span className="text-sm font-semibold text-foreground">{item.label}</span>
                {item.aiEnrichable && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-ai/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ai">
                    <Sparkles className="h-3 w-3" /> AI enrichment available
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                <span className="font-medium text-foreground">Why missing: </span>{item.why}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                <span className="font-medium text-foreground">Recovery: </span>{item.recovery}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}