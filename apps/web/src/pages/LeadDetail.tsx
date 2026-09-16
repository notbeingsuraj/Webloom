import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Globe, Mail, MapPin, Phone, Sparkles, Trash2, Clock, Tag, ExternalLink, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import StatusBadge from '../components/ui/StatusBadge';
import ScoreIndicator from '../components/ui/ScoreIndicator';
import AuditRow from '../components/ui/AuditRow';
import WebsitePreview from '../components/WebsitePreview';
import ReputationPanel from '../components/ReputationPanel';
import OpportunityInsights from '../components/OpportunityInsights';
import MissingIntelligence from '../components/MissingIntelligence';
import { IntentList, TriggerList, ObjectiveList, VisualDirectionPanel } from '../components/IntelligenceCards';
import usePageMetadata from '../hooks/usePageMetadata';
import { toIntentItems, toTriggerItems, toObjectiveItems, toVisualDirectionData } from '../utils/intelligenceRenderers';
import { resolveLeadScore } from '../utils/opportunityScore';
import { leadService } from '../services/leadService';

const tabs = ['Overview', 'Analysis', 'Website', 'Outreach'];

/**
 * Format a single trust signal entry for display.
 *
 * trustSignals historically arrive in two shapes:
 *   - legacy strings:  "Google Maps rating present"
 *   - structured objects: { type: 'rating', value: 4.2, source: ..., verified, ... }
 * Rendering either shape raw as a React child crashes the tree — objects are
 * not valid React children. Normalize to a readable label instead.
 */
function trustSignalLabel(signal: unknown): string {
  if (signal == null) return 'Signal recorded';
  if (typeof signal === 'string') return signal;
  if (typeof signal === 'number' || typeof signal === 'boolean') return String(signal);
  if (typeof signal === 'object') {
    const s = signal as { type?: unknown; value?: unknown; source?: unknown };
    const type = typeof s.type === 'string' ? s.type : null;
    const value = s.value;
    if (type === 'rating' || type === 'review_count' || type === 'reviews_available') {
      if (value != null) return `${type.replace(/_/g, ' ')}: ${value}`;
      return type.replace(/_/g, ' ');
    }
    if (type) {
      const label = type.replace(/_/g, ' ');
      return value != null ? `${label}: ${value}` : label;
    }
    // Fall back to any readable field we can find.
    const source = typeof s.source === 'string' ? s.source : null;
    if (source) return `Source: ${source}`;
    return JSON.stringify(signal);
  }
  return String(signal);
}

export default function LeadDetail() {
  usePageMetadata({
    title: 'Webloom | Lead Workspace',
    description: 'Review a business analysis workspace.',
    noindex: true, // authenticated product surface
  });
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('Overview');

  const { data: lead, isLoading, isError, error } = useQuery({
    queryKey: ['lead', id],
    queryFn: async () => {
      console.debug('[LeadDetail] fetching lead', { id, url: `/leads/${id}` });
      const lead = await leadService.getLead(id!);
      console.debug('[LeadDetail] normalized lead payload:', {
        id,
        keys: lead ? Object.keys(lead) : null,
        businessName: lead?.businessName,
        opportunityScore: lead?.opportunityScore,
        trustSignals: lead?.analysis?.metrics?.trustSignals,
        status: lead?.status,
      });
      return lead;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => leadService.deleteLead(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      navigate('/');
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => leadService.updateLead(id!, { status } as any),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead', id] }),
  });

  const generateDNAMutation = useMutation({
    mutationFn: () => leadService.generateBrandDNA(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead', id] }),
  });

  const generateWebsiteMutation = useMutation({
    mutationFn: () => leadService.generateWebsiteSpec(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead', id] }),
  });

  // ----- Opportunity score: ONE normalized source for both tabs -----
  const score = useMemo(
    () =>
      resolveLeadScore({
        score: lead?.opportunityScore?.total ?? null,
        status: lead?.opportunityScore?.status ?? null,
      }),
    [lead?.opportunityScore?.total, lead?.opportunityScore?.status],
  );

  const scoreDescription = useMemo(() => {
    if (score.state === 'unavailable') return 'Opportunity score not available.';
    if (score.state === 'preliminary') return 'Preliminary score — the digital audit did not complete, so this is not a final assessment.';
    const total = score.value ?? 0;
    if (total >= 80) return 'Strong opportunity with visible demand and a clear growth story.';
    if (total >= 60) return 'Promising lead with moderate urgency and a clear conversion path.';
    return 'There is potential, but the current digital presence needs strategic refinement.';
  }, [score]);

  // ----- Website generation state -----
  const websiteGenerateError = generateWebsiteMutation.isError
    ? (generateWebsiteMutation.error as any)?.response?.data?.message ||
      (generateWebsiteMutation.error as any)?.response?.data?.error ||
      'The website specification could not be generated. Check the API and try again.'
    : null;

  const analysisState = lead?.analysis?.brandStrategyStatus || 'not_attempted';
  const hasBrandDNA = !!lead?.analysis?.brandDNA;
  const showDna = analysisState === 'ok' && hasBrandDNA;
  const dnaEmptyText = analysisState === 'failed' ? 'Analysis unavailable' : 'Analysis pending';

  const recommendedAction = useMemo(() => {
    const recs = lead?.analysis?.brandDNA?.strategicRecommendations;
    if (recs?.length && typeof recs[0] === 'object' && recs[0]?.recommendation) return recs[0].recommendation;
    const gap = lead?.analysis?.audit?.opportunityGap;
    if (typeof gap === 'string' && gap) return gap;
    if (gap && typeof gap === 'object' && (gap as any)?.description) return (gap as any).description;
    return 'Focus on a conversion-first landing page with a strong local CTA and trust signals.';
  }, [lead?.analysis?.brandDNA?.strategicRecommendations, lead?.analysis?.audit?.opportunityGap]);

  // Defensive normalization: services may arrive as a JSON-stringified array
  // from older canonical projections — always coerce to a real array.
  const services = useMemo(() => {
    const raw = lead?.businessData?.services;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [raw];
      } catch {
        return [raw];
      }
    }
    return [];
  }, [lead?.businessData?.services]);

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading lead workspace">
        <div className="wl-card h-40 p-6">
          <div className="wl-shimmer h-full w-full rounded-2xl" />
        </div>
        <div className="grid gap-6 xl:grid-cols-[1.03fr_0.97fr]">
          <div className="space-y-6">
            <div className="wl-card h-64 p-6"><div className="wl-shimmer h-full w-full rounded-2xl" /></div>
            <div className="wl-card h-72 p-6"><div className="wl-shimmer h-full w-full rounded-2xl" /></div>
          </div>
          <div className="space-y-6">
            <div className="wl-card h-52 p-6"><div className="wl-shimmer h-full w-full rounded-2xl" /></div>
            <div className="wl-card h-56 p-6"><div className="wl-shimmer h-full w-full rounded-2xl" /></div>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    const message =
      (error as any)?.response?.data?.error ||
      (error as any)?.message ||
      'The lead could not be loaded.';
    return (
      <div className="wl-card mx-auto max-w-xl p-10 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertCircle className="h-7 w-7" />
        </div>
        <p className="mt-5 font-display text-xl font-bold text-foreground">Unable to load lead</p>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <button
          type="button"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['lead', id] })}
          className="mt-6 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition-colors hover:bg-primary/90"
        >
          Retry
        </button>
        <p className="mt-4 text-xs text-muted-foreground">The lead data is safe — this was a fetch or display issue.</p>
      </div>
    );
  }

  if (!lead || !lead._id) {
    return (
      <div className="wl-card mx-auto max-w-xl p-10 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
          <AlertCircle className="h-7 w-7" />
        </div>
        <p className="mt-5 font-display text-xl font-bold text-foreground">No lead found</p>
        <p className="mt-2 text-sm text-muted-foreground">This lead does not exist or has been deleted.</p>
        <Link to="/" className="mt-6 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Back to dashboard</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="wl-card wl-mesh relative overflow-hidden p-6 md:p-8">
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="wl-eyebrow">Lead workspace</p>
              <StatusBadge status={lead?.status || 'new'} />
              {score.state === 'preliminary' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-0.5 text-[11px] font-semibold text-warning-foreground">
                  Preliminary score
                </span>
              )}
            </div>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.06em] text-foreground md:text-[2.7rem]">
              {lead?.businessName || lead?.leadName || 'Local business'}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-ai" aria-hidden="true" />
                {lead?.businessCategory || 'Local business'}
              </span>
              {lead?.location?.city && (
                <>
                  <span className="h-1 w-1 rounded-full bg-border" aria-hidden="true" />
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {lead.location.city}</span>
                </>
              )}
              {lead?.contact?.website && (
                <>
                  <span className="h-1 w-1 rounded-full bg-border" aria-hidden="true" />
                  <a
                    href={lead.contact.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary transition hover:text-primary/80"
                  >
                    <Globe className="h-3.5 w-3.5" /> Website <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Compact score chip */}
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-2.5 shadow-sm">
              <div>
                <p className="wl-eyebrow">Opportunity</p>
                <p className="font-display text-xl font-bold leading-tight tabular-nums text-foreground">
                  {score.value != null ? score.value : <span className="text-muted-foreground">—</span>}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full border-4 border-muted bg-card" style={{ background: `conic-gradient(hsl(var(--primary)) ${(score.value ?? 0) * 3.6}deg, hsl(var(--muted)) 0deg)` }}>
                <div className="flex h-full w-full items-center justify-center rounded-full bg-card text-[9px] font-bold text-foreground tabular-nums">
                  {score.value != null ? Math.round(score.value) : '—'}
                </div>
              </div>
            </div>

            <select
              value={lead?.status || 'new'}
              onChange={(e) => updateStatusMutation.mutate(e.target.value)}
              className="h-11 rounded-full border border-input bg-card px-4 text-sm font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
              aria-label="Lead status"
            >
              <option value="new">New</option>
              <option value="qualified">Qualified</option>
              <option value="contacted">Contacted</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </select>
            <button
              onClick={() => deleteMutation.mutate()}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-destructive/25 bg-destructive/10 px-4 text-sm font-medium text-destructive transition hover:bg-destructive/20"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>

        <div className="relative mt-6 flex flex-wrap gap-2 border-t border-border/70 pt-5">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              aria-current={activeTab === tab ? 'page' : undefined}
              className={[
                'rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200',
                activeTab === tab
                  ? 'bg-gradient-to-r from-primary to-ai text-white shadow-glow-blue'
                  : 'bg-secondary text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
              ].join(' ')}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'Overview' && (
        <>
          <OpportunityInsights lead={lead} />
          <div className="grid gap-6 xl:grid-cols-[1.03fr_0.97fr]">
          <div className="space-y-6">
            {/* Business profile — color-coded evidence fields */}
            <div className="wl-card p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Business profile</h2>
                <StatusBadge status={lead?.status || 'new'} />
              </div>

              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-primary/5 p-4 transition-colors hover:border-primary/30">
                  <dt className="wl-eyebrow">Location</dt>
                  <dd className="mt-3 flex items-center gap-2 text-sm text-foreground">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary"><MapPin className="h-4 w-4" /></span>
                    <span>{lead?.location?.address || <span className="text-muted-foreground">Not available</span>}</span>
                  </dd>
                </div>
                <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-verified/5 p-4 transition-colors hover:border-verified/40">
                  <dt className="wl-eyebrow">Phone</dt>
                  <dd className="mt-3 flex items-center gap-2 text-sm text-foreground">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-verified/12 text-verified"><Phone className="h-4 w-4" /></span>
                    {lead?.contact?.phone ? (
                      <a href={`tel:${lead.contact.phone}`} className="text-primary hover:text-primary/80">{lead.contact.phone}</a>
                    ) : <span className="text-muted-foreground">Not available</span>}
                  </dd>
                </div>
                <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-ai/5 p-4 transition-colors hover:border-ai/40">
                  <dt className="wl-eyebrow">Email</dt>
                  <dd className="mt-3 flex items-center gap-2 text-sm text-foreground">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ai/12 text-ai"><Mail className="h-4 w-4" /></span>
                    {lead?.contact?.email ? (
                      <a href={`mailto:${lead.contact.email}`} className="text-primary hover:text-primary/80">{lead.contact.email}</a>
                    ) : <span className="text-muted-foreground">Not available</span>}
                  </dd>
                </div>
                <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-creative/5 p-4 transition-colors hover:border-creative/40">
                  <dt className="wl-eyebrow">Website</dt>
                  <dd className="mt-3 flex items-center gap-2 text-sm text-foreground">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-creative/12 text-creative"><Globe className="h-4 w-4" /></span>
                    {lead?.contact?.website ? (
                      <a href={lead.contact.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:text-primary/80">
                        Visit site <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : <span className="text-muted-foreground">No website detected</span>}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Business DNA — AI summary */}
            <div className="wl-card p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Business DNA</h2>
                <StatusBadge status={analysisState} />
              </div>
              {analysisState === 'failed' && (
                <div className="mb-4 rounded-xl border border-destructive/25 bg-destructive/10 p-4">
                  <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    Brand DNA generation failed
                  </p>
                  <p className="mt-1 text-xs leading-5 text-destructive/80">The business profile is still valid, but the AI analysis did not complete. Retry to regenerate.</p>
                </div>
              )}
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-border border-l-4 border-l-ai bg-gradient-to-br from-secondary via-card to-ai/5 p-4">
                  <p className="wl-eyebrow">Target audience</p>
                  <p className="mt-2 text-sm leading-6 text-foreground">{showDna ? (lead?.analysis?.brandDNA?.audience?.primary?.segment || dnaEmptyText) : dnaEmptyText}</p>
                  {showDna && lead?.analysis?.brandDNA?.audience?.primary?.demographics && (
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {[
                        lead.analysis.brandDNA.audience.primary.demographics.ageRange,
                        lead.analysis.brandDNA.audience.primary.demographics.income,
                        lead.analysis.brandDNA.audience.primary.demographics.location,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="rounded-2xl border border-border border-l-4 border-l-opportunity bg-gradient-to-br from-secondary via-card to-opportunity/5 p-4">
                  <p className="wl-eyebrow">Positioning statement</p>
                  <p className="mt-2 text-sm leading-6 text-foreground">{showDna ? (lead?.analysis?.brandDNA?.positioning?.statement || dnaEmptyText) : dnaEmptyText}</p>
                  {showDna && lead?.analysis?.brandDNA?.positioning?.differentiation && (
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{lead.analysis.brandDNA.positioning.differentiation}</p>
                  )}
                </div>
                <div className="rounded-2xl border border-border border-l-4 border-l-creative bg-gradient-to-br from-secondary via-card to-creative/5 p-4">
                  <p className="wl-eyebrow">Brand personality</p>
                  {showDna && lead?.analysis?.brandDNA?.brandPersonality?.primary?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {lead.analysis.brandDNA.brandPersonality.primary.map((trait: string) => (
                        <span key={trait} className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground">{trait}</span>
                      ))}
                      {lead.analysis.brandDNA.brandPersonality.archetype && (
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">Archetype: {lead.analysis.brandDNA.brandPersonality.archetype}</span>
                      )}
                    </div>
                  ) : <p className="mt-2 text-sm leading-6 text-foreground">{dnaEmptyText}</p>}
                </div>
                {showDna && lead?.analysis?.brandDNA?.toneOfVoice && (
                  <div className="rounded-2xl border border-border border-l-4 border-l-verified bg-gradient-to-br from-secondary via-card to-verified/5 p-4">
                    <p className="wl-eyebrow">Tone of voice</p>
                    <p className="mt-2 text-sm leading-6 text-foreground">{lead.analysis.brandDNA.toneOfVoice.characteristics?.join(', ') || '—'}</p>
                  </div>
                )}
                {showDna && lead?.analysis?.brandDNA?.strategicRecommendations?.length ? (
                  <div className="rounded-2xl border border-ai/25 bg-ai/5 p-4">
                    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ai">
                      <Sparkles className="h-3.5 w-3.5" /> Strategic recommendations
                    </p>
                    <ul className="mt-2 space-y-2">
                      {lead.analysis.brandDNA.strategicRecommendations.slice(0, 4).map((rec: { recommendation?: string }, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm leading-5 text-foreground">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-verified" />
                          {rec.recommendation}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>

          {/* Provenance / Source Information — evidence color language:
              verified = green, discovered = blue, AI-extracted = violet,
              uncertain = yellow. Never implies AI data is verified. */}
            {(lead?.analysis?.metrics?.trustSignals || services.length > 0) && (
              <div className="wl-card p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Business details & evidence</h2>
                  <StatusBadge status="verified" />
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-full bg-verified/10 px-2 py-0.5 text-verified"><CheckCircle2 className="h-3 w-3" /> verified</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary">discovered</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-ai/10 px-2 py-0.5 text-ai">AI-extracted</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-warning-foreground">uncertain</span>
                </div>
                <div className="mt-5 space-y-3">
                  {services.length > 0 && (
                    <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-ai/5 p-4">
                      <p className="wl-eyebrow">Services</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {services.map((s: string) => (
                          <span key={s} className="wl-chip">
                            <Tag className="h-3 w-3" /> {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {!!lead?.businessData?.openingHours && (
                    <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-primary/5 p-4">
                      <p className="wl-eyebrow">Hours</p>
                      <div className="mt-2 flex items-center gap-2 text-sm text-foreground">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/12 text-primary"><Clock className="h-4 w-4" /></span>
                        <span>Hours data available</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-verified/10 px-2 py-0.5 text-[10px] font-semibold text-verified">
                          <CheckCircle2 className="h-3 w-3" /> discovered
                        </span>
                      </div>
                    </div>
                  )}
                  {lead?.analysis?.metrics?.trustSignals && (
                    <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-verified/5 p-4">
                      <p className="wl-eyebrow">Source confidence</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {Array.isArray(lead.analysis.metrics.trustSignals) ? (
                          lead.analysis.metrics.trustSignals.slice(0, 6).map((signal, i: number) => {
                            const s = typeof signal === 'object' && signal ? signal as { verified?: boolean; verification?: string | null } : null;
                            const verified = !!s?.verified || s?.verification === 'verified';
                            const aiExtracted = !!s && s.verification === 'ai_generated';
                            return (
                              <span
                                key={i}
                                className={[
                                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
                                  aiExtracted
                                    ? 'bg-ai/10 text-ai'
                                    : verified
                                    ? 'bg-verified/10 text-verified'
                                    : 'bg-primary/10 text-primary',
                                ].join(' ')}
                              >
                                {aiExtracted ? <Sparkles className="h-3 w-3" /> : verified ? <CheckCircle2 className="h-3 w-3" /> : <Info className="h-3 w-3" />}
                                {trustSignalLabel(signal)}
                              </span>
                            );
                          })
                        ) : (
                          <span className="text-sm text-foreground">{trustSignalLabel(lead.analysis.metrics.trustSignals)}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <ScoreIndicator
              score={score.value ?? 0}
              label={`Opportunity${score.state === 'preliminary' ? ' — Preliminary' : ''}`}
              description={scoreDescription}
            />

            <div className="wl-card p-6">
              <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Digital audit</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {lead?.analysis?.audit?.status === 'degraded'
                  ? `Audit incomplete — ${lead.analysis.audit.websiteExists ? 'website detected but not scored' : 'no website detected'}`
                  : lead?.analysis?.audit?.websiteExists
                    ? `Audited ${lead.analysis.audit.websiteUrl || ''}`
                    : 'No website detected — deterministic audit'}
              </p>
              <div className="mt-5 space-y-3">
                {lead?.analysis?.audit?.categories && Object.keys(lead.analysis.audit.categories).length > 0 ? (
                  (Object.entries(lead.analysis.audit.categories) as Array<[string, { score?: number }]>).map(([key, cat]) => (
                    <AuditRow
                      key={key}
                      label={key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
                      value={cat.score != null ? `${cat.score}/10` : '—'}
                      tone={cat.score != null ? (cat.score >= 7 ? 'good' : cat.score >= 4 ? 'neutral' : 'bad') : 'neutral'}
                    />
                  ))
                ) : (
                  <>
                    <AuditRow label="Website" value={lead?.analysis?.audit?.websiteExists ? 'Present' : 'Missing'} tone={lead?.analysis?.audit?.websiteExists ? 'good' : 'bad'} />
                    <AuditRow label="Overall score" value={lead?.analysis?.audit?.overallScore != null ? `${lead.analysis.audit.overallScore}/10` : 'Not reviewed'} tone="neutral" />
                  </>
                )}
              </div>
            </div>

            <div className="wl-card p-6">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Recommended action</h2>
                <button
                  type="button"
                  onClick={() => generateDNAMutation.mutate()}
                  className="rounded-full bg-secondary px-3 py-2 text-xs font-medium text-foreground transition hover:bg-secondary/80"
                  disabled={generateDNAMutation.isPending}
                >
                  {generateDNAMutation.isPending ? 'Generating...' : 'Refresh analysis'}
                </button>
              </div>

              {generateDNAMutation.isError ? (
                <div className="mt-5 rounded-xl border border-destructive/25 bg-destructive/10 p-4 text-sm leading-6">
                  <p className="flex items-center gap-2 font-medium text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    Refresh failed
                  </p>
                  <p className="mt-1 text-xs text-destructive/80">The analysis could not be regenerated. Check the API and try again.</p>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-ai/25 bg-gradient-to-br from-ai/10 to-creative/5 p-4 text-sm leading-6 text-foreground shadow-glow-violet">
                  <p className="flex items-center gap-2 font-semibold">
                    <Sparkles className="h-4 w-4 text-ai" />
                    {recommendedAction}
                  </p>
                </div>
              )}
            </div>
          </div>
          </div>

          <MissingIntelligence
            lead={lead}
            onRetry={() => generateDNAMutation.mutate()}
          />
        </>
      )}

      {activeTab === 'Analysis' && (
        <div className="space-y-6">
          <div className="wl-card p-6">
            <div className="mb-6 flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Opportunity breakdown</h2>
              <StatusBadge status={lead?.opportunityScore?.priority || 'high'} />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-primary/5 p-4">
                <p className="wl-eyebrow">Website</p>
                <p className="mt-3 font-display text-2xl font-bold tracking-[-0.05em] text-foreground">
                  {lead?.contact?.website ? (
                    <span className="text-verified">Present</span>
                  ) : <span className="text-opportunity">Missing</span>}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-ai/5 p-4">
                <p className="wl-eyebrow">Score</p>
                <p className="mt-3 font-display text-2xl font-bold tracking-[-0.05em] tabular-nums text-foreground">{lead?.opportunityScore?.total ?? '—'}</p>
              </div>
              <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-verified/5 p-4">
                <p className="wl-eyebrow">Reputation</p>
                <p className="mt-3 font-display text-2xl font-bold tracking-[-0.05em] tabular-nums text-foreground">
                  {lead?.businessData?.reputation?.rating ?? lead?.businessData?.rating ?? '—'}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-creative/5 p-4">
                <p className="wl-eyebrow">Analysis status</p>
                <p className="mt-3 font-display text-2xl font-bold tracking-[-0.05em] text-foreground">
                  {lead?.analysis?.brandStrategyStatus === 'ok' ? <span className="text-verified">Complete</span> : <span className="text-warning-foreground">Pending</span>}
                </p>
              </div>
            </div>
          </div>

          {/* P1.9: full reputation panel (rating, review count, samples, status) */}
          <ReputationPanel lead={lead} />

          {/* Brand DNA deep dive */}
          {lead?.analysis?.brandDNA && (
            <div className="wl-card p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Brand DNA deep dive</h2>
                <StatusBadge status={lead?.analysis?.brandStrategyStatus || 'new'} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {lead.analysis.brandDNA.customerIntent && (
                  <div className="rounded-2xl border border-border border-l-4 border-l-primary bg-gradient-to-br from-secondary via-card to-primary/5 p-4">
                    <p className="wl-eyebrow">Customer intent</p>
                    <div className="mt-2">
                      <IntentList items={toIntentItems(lead.analysis.brandDNA.customerIntent)} />
                    </div>
                  </div>
                )}
                {lead.analysis.brandDNA.purchaseTriggers && (
                  <div className="rounded-2xl border border-border border-l-4 border-l-opportunity bg-gradient-to-br from-secondary via-card to-opportunity/5 p-4">
                    <p className="wl-eyebrow">Purchase triggers</p>
                    <div className="mt-2">
                      <TriggerList items={toTriggerItems(lead.analysis.brandDNA.purchaseTriggers)} />
                    </div>
                  </div>
                )}
                {lead.analysis.brandDNA.painPoints?.length ? (
                  <div className="rounded-2xl border border-border border-l-4 border-l-destructive bg-gradient-to-br from-secondary via-card to-destructive/5 p-4">
                    <p className="wl-eyebrow">Pain points</p>
                    <ul className="mt-2 space-y-1.5">
                      {lead.analysis.brandDNA.painPoints.slice(0, 5).map((pp: { pain?: string } | string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm leading-5 text-foreground">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                          {typeof pp === 'string' ? pp : pp.pain || ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {lead.analysis.brandDNA.competitiveAdvantages?.length ? (
                  <div className="rounded-2xl border border-border border-l-4 border-l-verified bg-gradient-to-br from-secondary via-card to-verified/5 p-4">
                    <p className="wl-eyebrow">Competitive advantages</p>
                    <ul className="mt-2 space-y-1.5">
                      {lead.analysis.brandDNA.competitiveAdvantages.slice(0, 5).map((adv: { advantage?: string } | string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm leading-5 text-foreground">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-verified" />
                          {typeof adv === 'string' ? adv : adv.advantage || ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {lead.analysis.brandDNA.conversionStrategy?.primaryCTA && (
                  <div className="rounded-2xl border border-ai/25 bg-gradient-to-br from-ai/10 to-card p-4">
                    <p className="wl-eyebrow">Primary CTA</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">{lead.analysis.brandDNA.conversionStrategy.primaryCTA.text || lead.analysis.brandDNA.conversionStrategy.primaryCTA.action}</p>
                    {lead.analysis.brandDNA.conversionStrategy.primaryCTA.reasoning && (
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{lead.analysis.brandDNA.conversionStrategy.primaryCTA.reasoning}</p>
                    )}
                  </div>
                )}
                {lead.analysis.brandDNA.visualDirection && (
                  <div className="rounded-2xl border border-border border-l-4 border-l-creative bg-gradient-to-br from-secondary via-card to-creative/5 p-4">
                    <p className="wl-eyebrow">Visual direction</p>
                    <div className="mt-2">
                      <VisualDirectionPanel data={toVisualDirectionData(lead.analysis.brandDNA.visualDirection)} />
                    </div>
                  </div>
                )}
                {lead.analysis.brandDNA.websiteObjectives && (
                  <div className="rounded-2xl border border-border border-l-4 border-l-ai bg-gradient-to-br from-secondary via-card to-ai/5 p-4">
                    <p className="wl-eyebrow">Website objectives</p>
                    <div className="mt-2">
                      <ObjectiveList items={toObjectiveItems(lead.analysis.brandDNA.websiteObjectives)} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Research / Analysis Details — color-coded evidence */}
          {lead?.analysis?.metrics?.facts && lead.analysis.metrics.facts.length > 0 && (
            <div className="wl-card p-6">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Key findings</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-verified/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-verified">
                  <CheckCircle2 className="h-3 w-3" /> evidence-backed
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {lead.analysis.metrics.facts.slice(0, 8).map((fact: any, i: number) => (
                  <div key={i} className="flex items-start gap-2.5 rounded-xl border border-border bg-gradient-to-br from-secondary/70 to-card px-4 py-3 text-sm text-foreground">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-verified mt-0.5" />
                    <span className="leading-6">{typeof fact === 'string' ? fact : fact.claim}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {lead?.analysis?.metrics?.unknowns && lead.analysis.metrics.unknowns.length > 0 && (
            <div className="wl-card p-6">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Information gaps</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-warning-foreground">
                  <AlertCircle className="h-3 w-3" /> unknowns
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {lead.analysis.metrics.unknowns.slice(0, 5).map((unknown: string, i: number) => (
                  <div key={i} className="flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
                    <span className="leading-6">{unknown}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'Website' && (
        <WebsitePreview
          website={lead?.generatedWebsite}
          isGenerating={generateWebsiteMutation.isPending}
          onGenerate={() => generateWebsiteMutation.mutate()}
          generateError={websiteGenerateError}
        />
      )}

      {activeTab === 'Outreach' && (
        <div className="wl-card p-6">
          <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Outreach drafts</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {['WhatsApp', 'Email', 'Instagram', 'Call Script'].map((channel) => (
              <div key={channel} className="rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-ai/5 p-4 transition-all duration-200 hover:border-primary/40 hover:shadow-card-hover">
                <p className="wl-eyebrow">{channel}</p>
                <p className="mt-3 text-sm leading-6 text-foreground">{channel === 'WhatsApp' ? 'Hi, I noticed your current digital presence...' : 'We can help improve...'}</p>
                <div className="mt-4 flex gap-2">
                  <button type="button" className="rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-glow-blue transition-all hover:bg-primary/90">Copy</button>
                  <button type="button" className="rounded-full border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary">Regenerate</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
