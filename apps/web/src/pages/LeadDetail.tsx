import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { Globe, Mail, MapPin, Phone, Sparkles, Trash2, Clock, Tag, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import StatusBadge from '../components/ui/StatusBadge';
import ScoreIndicator from '../components/ui/ScoreIndicator';
import AuditRow from '../components/ui/AuditRow';
import WebsitePreview from '../components/WebsitePreview';
import ReputationPanel from '../components/ReputationPanel';
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
    return <div className="rounded-[28px] border border-webloom-border bg-webloom-surface p-10 text-center text-sm text-webloom-muted">Loading lead workspace...</div>;
  }

  if (isError) {
    const message =
      (error as any)?.response?.data?.error ||
      (error as any)?.message ||
      'The lead could not be loaded.';
    return (
      <div className="rounded-[30px] border border-red-800/50 bg-red-900/30 p-10 text-center">
        <p className="flex items-center justify-center gap-2 text-sm font-medium text-red-400">
          <AlertCircle className="h-4 w-4" />
          Unable to load lead
        </p>
        <p className="mt-2 text-sm text-red-400/80">{message}</p>
        <button
          type="button"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['lead', id] })}
          className="mt-5 rounded-full bg-webloom-raised px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2A2A2A]"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!lead || !lead._id) {
    return (
      <div className="rounded-[30px] border border-webloom-border bg-webloom-surface p-10 text-center">
        <p className="text-sm font-medium text-webloom-text">No lead found</p>
        <p className="mt-2 text-sm text-webloom-muted">This lead does not exist or has been deleted.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="rounded-[30px] border border-webloom-border bg-webloom-surface p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)] md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Lead detail</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.06em] text-webloom-text md:text-[2.7rem]">{lead?.businessName || lead?.leadName || 'Local business'}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-webloom-muted">
              <span>{lead?.businessCategory || 'Local business'}</span>
              {lead?.location?.city && <><span className="h-1 w-1 rounded-full bg-[#D2D2D7]" /><span>{lead.location.city}</span></>}
              {lead?.contact?.website && <><span className="h-1 w-1 rounded-full bg-[#D2D2D7]" /><span className="flex items-center gap-1"><Globe className="h-3 w-3" /> Website</span></>}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={lead?.status || 'new'}
              onChange={(e) => updateStatusMutation.mutate(e.target.value)}
              className="rounded-full border border-webloom-border bg-webloom-raised px-3 py-2 text-sm font-medium text-webloom-text outline-none focus:border-primary-500"
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
              className="inline-flex items-center gap-2 rounded-full border border-red-800/50 bg-red-900/30 px-3 py-2 text-sm font-medium text-red-400 transition hover:bg-red-900/50"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2 border-t border-webloom-border pt-6">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={[
                'rounded-full px-3 py-2 text-sm font-medium transition',
                activeTab === tab ? 'bg-webloom-raised text-white' : 'bg-webloom-raised text-webloom-muted hover:text-webloom-text',
              ].join(' ')}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'Overview' && (
        <div className="grid gap-6 xl:grid-cols-[1.03fr_0.97fr]">
          <div className="space-y-6">
            <div className="rounded-[30px] border border-webloom-border bg-webloom-surface p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold tracking-[-0.04em] text-webloom-text">Business profile</h2>
                <StatusBadge status={lead?.status || 'new'} />
              </div>

              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[20px] border border-webloom-border bg-webloom-raised p-4">
                  <dt className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Location</dt>
                  <dd className="mt-3 flex items-center gap-2 text-sm text-webloom-text">
                    <MapPin className="h-4 w-4 shrink-0 text-webloom-muted" />
                    <span>{lead?.location?.address || 'Location not available'}</span>
                  </dd>
                </div>
                <div className="rounded-[20px] border border-webloom-border bg-webloom-raised p-4">
                  <dt className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Phone</dt>
                  <dd className="mt-3 flex items-center gap-2 text-sm text-webloom-text">
                    <Phone className="h-4 w-4 shrink-0 text-webloom-muted" />
                    {lead?.contact?.phone ? (
                      <a href={`tel:${lead.contact.phone}`} className="text-primary-400 hover:text-primary-300">{lead.contact.phone}</a>
                    ) : <span className="text-webloom-muted">Not available</span>}
                  </dd>
                </div>
                <div className="rounded-[20px] border border-webloom-border bg-webloom-raised p-4">
                  <dt className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Email</dt>
                  <dd className="mt-3 flex items-center gap-2 text-sm text-webloom-text">
                    <Mail className="h-4 w-4 shrink-0 text-webloom-muted" />
                    {lead?.contact?.email ? (
                      <a href={`mailto:${lead.contact.email}`} className="text-primary-400 hover:text-primary-300">{lead.contact.email}</a>
                    ) : <span className="text-webloom-muted">Not available</span>}
                  </dd>
                </div>
                <div className="rounded-[20px] border border-webloom-border bg-webloom-raised p-4">
                  <dt className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Website</dt>
                  <dd className="mt-3 flex items-center gap-2 text-sm text-webloom-text">
                    <Globe className="h-4 w-4 shrink-0 text-webloom-muted" />
                    {lead?.contact?.website ? (
                      <a href={lead.contact.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary-400 hover:text-primary-300">
                        Visit site <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : <span className="text-webloom-muted">No website detected</span>}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-[30px] border border-webloom-border bg-webloom-surface p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold tracking-[-0.04em] text-webloom-text">Business DNA</h2>
                <StatusBadge status={analysisState} />
              </div>
              {analysisState === 'failed' && (
                <div className="mb-4 rounded-[20px] border border-red-800/50 bg-red-900/30 p-4">
                  <p className="flex items-center gap-2 text-sm font-medium text-red-400">
                    <AlertCircle className="h-4 w-4" />
                    Brand DNA generation failed
                  </p>
                  <p className="mt-1 text-xs leading-5 text-red-400/80">The business profile is still valid, but the AI analysis did not complete. Retry to regenerate.</p>
                </div>
              )}
              <div className="mt-5 space-y-4">
                <div className="rounded-[20px] border border-webloom-border bg-webloom-raised p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Target audience</p>
                  <p className="mt-2 text-sm leading-6 text-webloom-text">{showDna ? (lead?.analysis?.brandDNA?.audience?.primary?.segment || dnaEmptyText) : dnaEmptyText}</p>
                  {showDna && lead?.analysis?.brandDNA?.audience?.primary?.demographics && (
                    <p className="mt-2 text-xs leading-5 text-webloom-muted">
                      {[
                        lead.analysis.brandDNA.audience.primary.demographics.ageRange,
                        lead.analysis.brandDNA.audience.primary.demographics.income,
                        lead.analysis.brandDNA.audience.primary.demographics.location,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="rounded-[20px] border border-webloom-border bg-webloom-raised p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Positioning statement</p>
                  <p className="mt-2 text-sm leading-6 text-webloom-text">{showDna ? (lead?.analysis?.brandDNA?.positioning?.statement || dnaEmptyText) : dnaEmptyText}</p>
                  {showDna && lead?.analysis?.brandDNA?.positioning?.differentiation && (
                    <p className="mt-2 text-xs leading-5 text-webloom-muted">{lead.analysis.brandDNA.positioning.differentiation}</p>
                  )}
                </div>
                <div className="rounded-[20px] border border-webloom-border bg-webloom-raised p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Brand personality</p>
                  {showDna && lead?.analysis?.brandDNA?.brandPersonality?.primary?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {lead.analysis.brandDNA.brandPersonality.primary.map((trait: string) => (
                        <span key={trait} className="inline-flex items-center rounded-full border border-webloom-border bg-webloom-surface px-2.5 py-1 text-xs text-webloom-text">{trait}</span>
                      ))}
                      {lead.analysis.brandDNA.brandPersonality.archetype && (
                        <span className="inline-flex items-center rounded-full bg-primary-900/30 px-2.5 py-1 text-xs text-primary-400">Archetype: {lead.analysis.brandDNA.brandPersonality.archetype}</span>
                      )}
                    </div>
                  ) : <p className="mt-2 text-sm leading-6 text-webloom-text">{dnaEmptyText}</p>}
                </div>
                {showDna && lead?.analysis?.brandDNA?.toneOfVoice && (
                  <div className="rounded-[20px] border border-webloom-border bg-webloom-raised p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Tone of voice</p>
                    <p className="mt-2 text-sm leading-6 text-webloom-text">{lead.analysis.brandDNA.toneOfVoice.characteristics?.join(', ') || '—'}</p>
                  </div>
                )}
                {showDna && lead?.analysis?.brandDNA?.strategicRecommendations?.length ? (
                  <div className="rounded-[20px] border border-webloom-border bg-webloom-raised p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Strategic recommendations</p>
                    <ul className="mt-2 space-y-2">
                      {lead.analysis.brandDNA.strategicRecommendations.slice(0, 4).map((rec: { recommendation?: string }, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm leading-5 text-webloom-text">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          {rec.recommendation}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>

          {/* Provenance / Source Information */}
            {(lead?.analysis?.metrics?.trustSignals || services.length > 0) && (
              <div className="rounded-[30px] border border-webloom-border bg-webloom-surface p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
                <h2 className="text-xl font-semibold tracking-[-0.04em] text-webloom-text">Business details</h2>
                <div className="mt-5 space-y-3">
                  {services.length > 0 && (
                    <div className="rounded-[20px] border border-webloom-border bg-webloom-raised p-4">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Services</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {services.map((s: string) => (
                          <span key={s} className="inline-flex items-center gap-1 rounded-full border border-webloom-border bg-webloom-surface px-2.5 py-1 text-xs text-webloom-text">
                            <Tag className="h-3 w-3 text-webloom-muted" /> {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {!!lead?.businessData?.openingHours && (
                    <div className="rounded-[20px] border border-webloom-border bg-webloom-raised p-4">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Hours</p>
                      <div className="mt-2 flex items-center gap-2 text-sm text-webloom-text">
                        <Clock className="h-4 w-4 text-webloom-muted" />
                        <span>Hours data available</span>
                      </div>
                    </div>
                  )}
                  {lead?.analysis?.metrics?.trustSignals && (
                    <div className="rounded-[20px] border border-webloom-border bg-webloom-raised p-4">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Source confidence</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {Array.isArray(lead.analysis.metrics.trustSignals) ? (
                          lead.analysis.metrics.trustSignals.slice(0, 3).map((signal, i: number) => (
                            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-emerald-900/40 px-2 py-1 text-xs text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" /> {trustSignalLabel(signal)}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-webloom-text">{trustSignalLabel(lead.analysis.metrics.trustSignals)}</span>
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

            <div className="rounded-[30px] border border-webloom-border bg-webloom-surface p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
              <h2 className="text-xl font-semibold tracking-[-0.04em] text-webloom-text">Digital audit</h2>
              <p className="mt-1 text-xs text-webloom-muted">
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

            <div className="rounded-[30px] border border-webloom-border bg-webloom-surface p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-semibold tracking-[-0.04em] text-webloom-text">Recommended action</h2>
                <button
                  type="button"
                  onClick={() => generateDNAMutation.mutate()}
                  className="rounded-full bg-webloom-raised px-3 py-2 text-xs font-medium text-white transition hover:bg-[#2A2A2A]"
                  disabled={generateDNAMutation.isPending}
                >
                  {generateDNAMutation.isPending ? 'Generating...' : 'Refresh analysis'}
                </button>
              </div>

              {generateDNAMutation.isError ? (
                <div className="mt-5 rounded-[20px] border border-red-800/50 bg-red-900/30 p-4 text-sm leading-6">
                  <p className="flex items-center gap-2 font-medium text-red-400">
                    <AlertCircle className="h-4 w-4" />
                    Refresh failed
                  </p>
                  <p className="mt-1 text-xs text-red-400/80">The analysis could not be regenerated. Check the API and try again.</p>
                </div>
              ) : (
                <div className="mt-5 rounded-[20px] border border-webloom-border bg-webloom-raised p-4 text-sm leading-6 text-webloom-text">
                  <p className="flex items-center gap-2 font-medium">
                    <Sparkles className="h-4 w-4 text-primary-400" />
                    {recommendedAction}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Analysis' && (
        <div className="space-y-6">
          <div className="rounded-[30px] border border-webloom-border bg-webloom-surface p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
            <div className="mb-6 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold tracking-[-0.04em] text-webloom-text">Opportunity breakdown</h2>
              <StatusBadge status={lead?.opportunityScore?.priority || 'high'} />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[22px] border border-webloom-border bg-webloom-raised p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Website</p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-webloom-text">{lead?.contact?.website ? 'Present' : 'Missing'}</p>
              </div>
              <div className="rounded-[22px] border border-webloom-border bg-webloom-raised p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Score</p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-webloom-text">{lead?.opportunityScore?.total ?? '—'}</p>
              </div>
            </div>
          </div>

          {/* P1.9: full reputation panel (rating, review count, samples, status) */}
          <ReputationPanel lead={lead} />

          {/* Brand DNA deep dive */}
          {lead?.analysis?.brandDNA && (
            <div className="rounded-[30px] border border-webloom-border bg-webloom-surface p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold tracking-[-0.04em] text-webloom-text">Brand DNA deep dive</h2>
                <StatusBadge status={lead?.analysis?.brandStrategyStatus || 'new'} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {lead.analysis.brandDNA.customerIntent && (
                  <div className="rounded-[20px] border border-webloom-border bg-webloom-raised p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Customer intent</p>
                    <div className="mt-2">
                      <IntentList items={toIntentItems(lead.analysis.brandDNA.customerIntent)} />
                    </div>
                  </div>
                )}
                {lead.analysis.brandDNA.purchaseTriggers && (
                  <div className="rounded-[20px] border border-webloom-border bg-webloom-raised p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Purchase triggers</p>
                    <div className="mt-2">
                      <TriggerList items={toTriggerItems(lead.analysis.brandDNA.purchaseTriggers)} />
                    </div>
                  </div>
                )}
                {lead.analysis.brandDNA.painPoints?.length ? (
                  <div className="rounded-[20px] border border-webloom-border bg-webloom-raised p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Pain points</p>
                    <ul className="mt-2 space-y-1.5">
                      {lead.analysis.brandDNA.painPoints.slice(0, 5).map((pp: { pain?: string } | string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm leading-5 text-webloom-text">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                          {typeof pp === 'string' ? pp : pp.pain || ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {lead.analysis.brandDNA.competitiveAdvantages?.length ? (
                  <div className="rounded-[20px] border border-webloom-border bg-webloom-raised p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Competitive advantages</p>
                    <ul className="mt-2 space-y-1.5">
                      {lead.analysis.brandDNA.competitiveAdvantages.slice(0, 5).map((adv: { advantage?: string } | string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm leading-5 text-webloom-text">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          {typeof adv === 'string' ? adv : adv.advantage || ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {lead.analysis.brandDNA.conversionStrategy?.primaryCTA && (
                  <div className="rounded-[20px] border border-webloom-border bg-webloom-raised p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Primary CTA</p>
                    <p className="mt-2 text-sm font-medium text-webloom-text">{lead.analysis.brandDNA.conversionStrategy.primaryCTA.text || lead.analysis.brandDNA.conversionStrategy.primaryCTA.action}</p>
                    {lead.analysis.brandDNA.conversionStrategy.primaryCTA.reasoning && (
                      <p className="mt-1 text-xs leading-5 text-webloom-muted">{lead.analysis.brandDNA.conversionStrategy.primaryCTA.reasoning}</p>
                    )}
                  </div>
                )}
                {lead.analysis.brandDNA.visualDirection && (
                  <div className="rounded-[20px] border border-webloom-border bg-webloom-raised p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Visual direction</p>
                    <div className="mt-2">
                      <VisualDirectionPanel data={toVisualDirectionData(lead.analysis.brandDNA.visualDirection)} />
                    </div>
                  </div>
                )}
                {lead.analysis.brandDNA.websiteObjectives && (
                  <div className="rounded-[20px] border border-webloom-border bg-webloom-raised p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Website objectives</p>
                    <div className="mt-2">
                      <ObjectiveList items={toObjectiveItems(lead.analysis.brandDNA.websiteObjectives)} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Research / Analysis Details */}
          {lead?.analysis?.metrics?.facts && lead.analysis.metrics.facts.length > 0 && (
            <div className="rounded-[30px] border border-webloom-border bg-webloom-surface p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
              <h2 className="text-xl font-semibold tracking-[-0.04em] text-webloom-text">Key findings</h2>
              <div className="mt-4 space-y-2">
                {lead.analysis.metrics.facts.slice(0, 8).map((fact: any, i: number) => (
                  <div key={i} className="flex items-start gap-2.5 rounded-xl border border-webloom-border bg-webloom-raised px-4 py-3 text-sm text-webloom-text">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                    <span className="leading-6">{typeof fact === 'string' ? fact : fact.claim}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {lead?.analysis?.metrics?.unknowns && lead.analysis.metrics.unknowns.length > 0 && (
            <div className="rounded-[30px] border border-webloom-border bg-webloom-surface p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
              <h2 className="text-xl font-semibold tracking-[-0.04em] text-webloom-text">Information gaps</h2>
              <div className="mt-4 space-y-2">
                {lead.analysis.metrics.unknowns.slice(0, 5).map((unknown: string, i: number) => (
                  <div key={i} className="flex items-start gap-2.5 rounded-xl border border-webloom-border bg-amber-900/30 px-4 py-3 text-sm text-amber-300">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
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
        <div className="rounded-[30px] border border-webloom-border bg-webloom-surface p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
          <h2 className="text-xl font-semibold tracking-[-0.04em] text-webloom-text">Outreach drafts</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {['WhatsApp', 'Email', 'Instagram', 'Call Script'].map((channel) => (
              <div key={channel} className="rounded-[22px] border border-webloom-border bg-webloom-raised p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">{channel}</p>
                <p className="mt-3 text-sm leading-6 text-webloom-text">{channel === 'WhatsApp' ? 'Hi, I noticed your current digital presence...' : 'We can help improve...'}</p>
                <div className="mt-4 flex gap-2">
                  <button type="button" className="rounded-full bg-webloom-raised px-3 py-2 text-xs font-medium text-white">Copy</button>
                  <button type="button" className="rounded-full border border-webloom-border bg-webloom-surface px-3 py-2 text-xs font-medium text-webloom-text">Regenerate</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
