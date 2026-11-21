import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Globe, Mail, MapPin, Phone, Sparkles, Trash2, Clock, Tag, ExternalLink, CheckCircle2, AlertCircle, Info, Search, RefreshCw, Eye, Shield, Wifi, BarChart2, Layers, FileText, Target, Zap, Lightbulb, Users, Building2, ArrowRight, ArrowUpRight } from 'lucide-react';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import { Chip } from '../components/ui/Chip';
import { cls, frac } from '../lib/cls';
import { cn } from '../lib/utils';
import usePageMetadata from '../hooks/usePageMetadata';
import { leadService } from '../services/leadService';

const STRATEGY_TABS = [
  { key: 'positioning', label: 'Positioning', icon: Target },
  { key: 'audience', label: 'Audience', icon: Users },
  { key: 'brand', label: 'Brand DNA', icon: Lightbulb },
  { key: 'competitive', label: 'Competitive', icon: Building2 },
  { key: 'website', label: 'Website Strategy', icon: Globe },
  { key: 'conversion', label: 'Conversion', icon: Zap },
] as const;

type StrategyTab = typeof STRATEGY_TABS[number]['key'];

export default function StrategyIntelligence() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<StrategyTab>('positioning');

  usePageMetadata({
    title: 'Webloom | Strategy Intelligence',
    description: 'Business positioning, brand strategy, and competitive intelligence.',
    noindex: true,
  });

  const { data: lead, isLoading, isError, error } = useQuery({
    queryKey: ['lead', id],
    queryFn: async () => {
      const lead = await leadService.getLead(id!);
      return lead;
    },
  });

  const generateDNAMutation = useMutation({
    mutationFn: () => leadService.generateBrandDNA(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead', id] }),
  });

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading strategy intelligence">
        <header className="wl-card wl-mesh relative overflow-hidden p-6 md:p-8">
          <div className="wl-shimmer h-12 w-3/4 rounded-lg" />
          <div className="mt-4 wl-shimmer h-8 w-1/4 rounded-lg" />
        </header>
        <div className="grid gap-6 xl:grid-cols-3">
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

  if (isError || !lead) {
    const message = isError ? (error as any)?.response?.data?.error || (error as any)?.message || 'The strategy intelligence could not be loaded.' : 'No strategy data found.';
    return (
      <div className="wl-card mx-auto max-w-xl p-10 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertCircle className="h-7 w-7" />
        </div>
        <p className="mt-5 font-display text-xl font-bold text-foreground">Unable to load strategy</p>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <button type="button" onClick={() => queryClient.invalidateQueries({ queryKey: ['lead', id] })} className="mt-6 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition-colors hover:bg-primary/90">Retry</button>
        <Link to="/dashboard" className="mt-4 inline-block text-sm text-primary hover:underline">Back to dashboard</Link>
      </div>
    );
  }

  const dna = lead?.analysis?.brandDNA;
  const analysisState = lead?.analysis?.brandStrategyStatus || 'not_attempted';
  const hasDNA = !!dna;
  const showDNA = analysisState === 'ok' && hasDNA;

  const renderTabContent = (tab: StrategyTab) => {
    switch (tab) {
      case 'positioning':
        return (
          <div className="space-y-6">
            {/* Positioning Statement */}
            <div className="wl-card p-6">
              <div className="flex items-center justify-between gap-3 mb-5">
                <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Market positioning</h2>
                <StatusBadge status={analysisState} />
              </div>
              {showDNA && dna?.positioning?.statement ? (
                <div className={cls('rounded-2xl border border-border border-l-4 border-l-primary bg-gradient-to-br from-secondary via-card p-5', frac('to-primary', '5'))}>
                  <p className="wl-eyebrow">Positioning statement</p>
                  <p className="mt-3 text-lg leading-7 text-foreground">{dna.positioning.statement}</p>
                  {dna.positioning.differentiation && (
                    <p className="mt-3 text-sm leading-6 text-muted-foreground border-t border-border pt-3">Differentiation: {dna.positioning.differentiation}</p>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-border border-l-4 border-l-warning bg-gradient-to-br from-secondary via-card to-warning/5 p-5">
                  <p className="wl-eyebrow">Analysis pending</p>
                  <p className="mt-2 text-sm leading-6 text-foreground">Generate Brand DNA to unlock market positioning analysis.</p>
                </div>
              )}
            </div>

            {/* Website Objectives */}
            {showDNA && dna?.websiteObjectives?.length && (
              <div className="wl-card p-6">
                <div className="flex items-center justify-between gap-3 mb-5">
                  <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Website objectives</h2>
                  <Sparkles className="h-5 w-5 text-ai" />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {dna.websiteObjectives.slice(0, 6).map((obj: any, i: number) => (
                    <div key={i} className="rounded-2xl border border-border border-l-4 border-l-primary bg-gradient-to-br from-secondary via-card to-primary/5 p-5">
                      <p className="wl-eyebrow">Objective {i + 1}</p>
                      <p className="mt-2 text-base leading-6 text-foreground">{obj.objective || obj}</p>
                      {obj.priority && <p className="mt-2 text-xs font-medium text-primary">Priority: {obj.priority}</p>}
                      {obj.metrics?.length && (
                        <p className="mt-2 text-xs text-muted-foreground">Metrics: {obj.metrics.join(', ')}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'audience':
        return (
          <div className="space-y-6">
            {showDNA && dna?.audience ? (
              <>
                {/* Primary Audience */}
                <div className="wl-card p-6">
                  <div className="flex items-center justify-between gap-3 mb-5">
                    <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Target audience</h2>
                    <Sparkles className="h-5 w-5 text-ai" />
                  </div>
                  <div className="grid gap-5 lg:grid-cols-2">
                    <div className={cls('rounded-2xl border border-border border-l-4 border-l-primary bg-gradient-to-br from-secondary via-card p-5', frac('to-primary', '5'))}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/12 text-primary">
                          <Users className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="wl-eyebrow">Primary segment</p>
                          <p className="font-semibold text-foreground">{dna.audience.primary?.segment || 'Not defined'}</p>
                        </div>
                      </div>
                      {dna.audience.primary?.demographics && (
                        <div className="space-y-2 text-sm">
                          {dna.audience.primary.demographics.ageRange && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Tag className="h-4 w-4" />
                              <span>Age: {dna.audience.primary.demographics.ageRange}</span>
                            </div>
                          )}
                          {dna.audience.primary.demographics.income && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Zap className="h-4 w-4" />
                              <span>Income: {dna.audience.primary.demographics.income}</span>
                            </div>
                          )}
                          {dna.audience.primary.demographics.location && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <MapPin className="h-4 w-4" />
                              <span>Location: {dna.audience.primary.demographics.location}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {dna.audience.primary?.psychographics && (
                        <div className="mt-4">
                          <p className="wl-eyebrow">Psychographics</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {dna.audience.primary.psychographics.values?.map((v: string, i: number) => (
                              <Chip key={i} variant="primary" size="sm">{v}</Chip>
                            ))}
                            {dna.audience.primary.psychographics.lifestyle && (
                              <span className="text-sm text-muted-foreground">Lifestyle: {dna.audience.primary.psychographics.lifestyle}</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Secondary Audiences */}
                    {dna.audience.secondary?.length && (
                      <div className={cls('rounded-2xl border border-border border-l-4 border-l-ai bg-gradient-to-br from-secondary via-card p-5', frac('to-ai', '5'))}>
                        <p className="wl-eyebrow">Secondary segments</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {dna.audience.secondary.slice(0, 5).map((seg: any, i: number) => (
                            <Chip key={i} variant="ai" size="sm">{seg.segment || seg}</Chip>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
              </div>
            </> ) : (
              <div className="wl-card p-6 text-center">
                <Sparkles className={cls('mx-auto h-12 w-12', frac('text-ai', '50'))} />
                <p className="mt-4 font-semibold text-foreground">Generate Brand DNA to unlock audience intelligence.</p>
                <p className="mt-2 text-sm text-muted-foreground">Audience segments, demographics, and psychographics will be derived from the business profile.</p>
              </div>
            )}
          </div>
        );

      case 'brand':
        return (
          <div className="space-y-6">
            {showDNA ? (
              <>
                {/* Brand Personality */}
                <div className="wl-card p-6">
                  <div className="flex items-center justify-between gap-3 mb-5">
                    <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Brand personality</h2>
                    <Sparkles className="h-5 w-5 text-ai" />
                  </div>
                  {dna?.brandPersonality?.primary?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {dna.brandPersonality.primary.map((trait: string) => (
                        <Chip key={trait} variant="primary" size="md">{trait}</Chip>
                      ))}
                    </div>
                  ) : <p className="text-muted-foreground">Not defined</p>}
                  {dna?.brandPersonality?.archetype && (
                    <div className="mt-4">
                      <span className={cls('inline-flex items-center gap-2 rounded-full', frac('bg-primary', '10'), 'px-3 py-1.5 text-sm font-semibold text-primary')}>
                        Archetype: <span className="font-semibold">{dna.brandPersonality.archetype}</span>
                      </span>
                    </div>
                  )}
                  {dna?.brandPersonality?.secondary?.length && (
                    <div className="mt-4">
                      <p className="wl-eyebrow">Secondary traits</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {dna.brandPersonality.secondary.map((trait: string) => (
                          <Chip key={trait} variant="default" size="sm">{trait}</Chip>
                        ))}
                      </div>
                    </div>
                  )}
                  {dna?.brandPersonality?.avoid?.length && (
                    <div className="mt-4">
                      <p className="wl-eyebrow">Avoid</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {dna.brandPersonality.avoid.map((trait: string) => (
                          <Chip key={trait} variant="danger" size="sm">{trait}</Chip>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Tone of Voice */}
                {dna?.toneOfVoice && (
                  <div className="wl-card p-6">
                    <div className="flex items-center justify-between gap-3 mb-5">
                      <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Tone of voice</h2>
                      <Sparkles className="h-5 w-5 text-ai" />
                    </div>
                    {dna.toneOfVoice.characteristics?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {dna.toneOfVoice.characteristics.map((trait: string) => (
                          <Chip key={trait} variant="verified" size="sm">{trait}</Chip>
                        ))}
                      </div>
                    ) : <p className="text-muted-foreground">Not defined</p>}
                    {dna.toneOfVoice.doUse?.length && (
                      <div className="mt-4">
                        <p className="wl-eyebrow">Do use</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {dna.toneOfVoice.doUse.map((t: string, i: number) => (
                            <Chip key={i} variant="verified" size="sm">{t}</Chip>
                          ))}
                        </div>
                      </div>
                    )}
                    {dna.toneOfVoice.dontUse?.length && (
                      <div className="mt-4">
                        <p className="wl-eyebrow">Don't use</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {dna.toneOfVoice.dontUse.map((t: string, i: number) => (
                            <Chip key={i} variant="danger" size="sm">{t}</Chip>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Visual Direction */}
                {dna?.visualDirection && (
                  <div className="wl-card p-6">
                    <div className="flex items-center justify-between gap-3 mb-5">
                      <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Visual direction</h2>
                      <Sparkles className="h-5 w-5 text-creative" />
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      {dna.visualDirection.mood && (
                        <div className={cls('rounded-2xl border border-border border-l-4 border-l-creative bg-gradient-to-br from-secondary via-card p-5', frac('to-creative', '5'))}>
                          <p className="wl-eyebrow">Mood</p>
                          <p className="mt-2 text-base text-foreground">{dna.visualDirection.mood}</p>
                        </div>
                      )}
                      {dna.visualDirection.colorPalette?.primary && (
                        <div className={cls('rounded-2xl border border-border border-l-4 border-l-primary bg-gradient-to-br from-secondary via-card p-5', frac('to-primary', '5'))}>
                          <p className="wl-eyebrow">Color palette</p>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex h-8 w-16 rounded-lg" style={{ background: dna.visualDirection.colorPalette.primary }} />
                            <span className="text-sm font-mono text-foreground">{dna.visualDirection.colorPalette.primary}</span>
                          </div>
                          {dna.visualDirection.colorPalette.secondary && (
                            <div className="mt-2 flex items-center gap-2">
                              <div className="flex h-8 w-16 rounded-lg" style={{ background: dna.visualDirection.colorPalette.secondary }} />
                              <span className="text-sm font-mono text-foreground">{dna.visualDirection.colorPalette.secondary}</span>
                            </div>
                          )}
                          {dna.visualDirection.colorPalette.reasoning && (
                            <p className="mt-2 text-xs text-muted-foreground">{dna.visualDirection.colorPalette.reasoning}</p>
                          )}
                        </div>
                      )}
                      {dna.visualDirection.typography?.style && (
                        <div className={cls('rounded-2xl border border-border border-l-4 border-l-ai bg-gradient-to-br from-secondary via-card p-5', frac('to-ai', '5'))}>
                          <p className="wl-eyebrow">Typography</p>
                          <p className="mt-2 text-base text-foreground">{dna.visualDirection.typography.style}</p>
                          {dna.visualDirection.typography.reasoning && (
                            <p className="mt-2 text-xs text-muted-foreground">{dna.visualDirection.typography.reasoning}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="wl-card p-6 text-center">
                <Sparkles className={cls('mx-auto h-12 w-12', frac('text-ai', '50'))} />
                <p className="mt-4 font-semibold text-foreground">Generate Brand DNA to unlock brand intelligence.</p>
                <p className="mt-2 text-sm text-muted-foreground">Brand personality, tone of voice, visual direction, and positioning will be derived from the business profile.</p>
              </div>
            )}
          </div>
        );

      case 'competitive':
        return (
          <div className="space-y-6">
            {showDNA && dna?.competitiveAdvantages?.length ? (
              <>
                <div className="wl-card p-6">
                  <div className="flex items-center justify-between gap-3 mb-5">
                    <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Competitive advantages</h2>
                    <Sparkles className="h-5 w-5 text-ai" />
                  </div>
                  <ul className="space-y-3">
                    {dna.competitiveAdvantages.slice(0, 8).map((adv: any, i: number) => (
                      <li key={i} className="flex items-start gap-3 rounded-xl border border-border bg-gradient-to-br from-secondary via-card to-verified/5 p-4">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-verified/12 text-verified">
                          <CheckCircle2 className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{typeof adv === 'string' ? adv : adv.advantage || ''}</p>
                          {adv.category && <p className="mt-0.5 text-xs text-muted-foreground">Category: {adv.category}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <div className="wl-card p-6 text-center">
                <Sparkles className={cls('mx-auto h-12 w-12', frac('text-ai', '50'))} />
                <p className="mt-4 font-semibold text-foreground">Generate Brand DNA to unlock competitive intelligence.</p>
                <p className="mt-2 text-sm text-muted-foreground">Competitive advantages, market positioning, and differentiation will be derived from the business profile.</p>
              </div>
            )}
          </div>
        );

      case 'website':
        return (
          <div className="space-y-6">
            {showDNA && dna?.websiteObjectives?.length ? (
              <>
                <div className="wl-card p-6">
                  <div className="flex items-center justify-between gap-3 mb-5">
                    <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Website objectives</h2>
                    <Sparkles className="h-5 w-5 text-ai" />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {dna.websiteObjectives.slice(0, 8).map((obj: any, i: number) => (
                      <div key={i} className="rounded-2xl border border-border border-l-4 border-l-primary bg-gradient-to-br from-secondary via-card to-primary/5 p-5">
                        <p className="wl-eyebrow">Objective {i + 1}</p>
                        <p className="mt-2 text-base leading-6 text-foreground">{obj.objective || obj}</p>
                        {obj.priority && <p className="mt-2 text-xs font-medium text-primary">Priority: {obj.priority}</p>}
                        {obj.metrics?.length && <p className="mt-2 text-xs text-muted-foreground">Metrics: {obj.metrics.join(', ')}</p>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Conversion Strategy */}
                {dna?.conversionStrategy?.primaryCTA && (
                  <div className="wl-card p-6">
                    <div className="flex items-center justify-between gap-3 mb-5">
                      <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Conversion strategy</h2>
                      <Zap className="h-5 w-5 text-opportunity" />
                    </div>
                    <div className="rounded-2xl border border-ai/25 bg-gradient-to-br from-ai/10 to-card p-5">
                      <p className="wl-eyebrow">Primary CTA</p>
                      <p className="mt-2 text-lg font-semibold text-foreground">{dna.conversionStrategy.primaryCTA.text || dna.conversionStrategy.primaryCTA.action}</p>
                      {dna.conversionStrategy.primaryCTA.reasoning && (
                        <p className="mt-2 text-sm text-muted-foreground">{dna.conversionStrategy.primaryCTA.reasoning}</p>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="wl-card p-6 text-center">
                <Sparkles className={cls('mx-auto h-12 w-12', frac('text-ai', '50'))} />
                <p className="mt-4 font-semibold text-foreground">Generate Brand DNA to unlock website strategy.</p>
                <p className="mt-2 text-sm text-muted-foreground">Website objectives, conversion strategy, and visual direction will be derived from the business profile.</p>
              </div>
            )}
          </div>
        );

      case 'conversion':
        return (
          <div className="space-y-6">
            {showDNA ? (
              <>
                {/* Customer Intent */}
                {dna?.customerIntent && (
                  <div className="wl-card p-6">
                    <div className="flex items-center justify-between gap-3 mb-5">
                      <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Customer intent</h2>
                      <Sparkles className="h-5 w-5 text-ai" />
                    </div>
                    <div className="space-y-3">
                      {Array.isArray(dna.customerIntent) ? dna.customerIntent.map((intent: any, i: number) => (
                        <div key={i} className="rounded-2xl border border-border border-l-4 border-l-primary bg-gradient-to-br from-secondary via-card to-primary/5 p-4">
                          <p className="font-medium text-foreground">{intent.intent || intent}</p>
                          {intent.urgency && <p className="mt-1 text-sm text-opportunity">Urgency: {intent.urgency}</p>}
                          {intent.frequency && <p className="mt-1 text-sm text-muted-foreground">Frequency: {intent.frequency}</p>}
                        </div>
                      )) : (
                        <p className="text-foreground">{dna.customerIntent}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Pain Points */}
                {dna?.painPoints?.length && (
                  <div className="wl-card p-6">
                    <div className="flex items-center justify-between gap-3 mb-5">
                      <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Pain points</h2>
                      <Sparkles className="h-5 w-5 text-ai" />
                    </div>
                    <ul className="space-y-2">
                      {dna.painPoints.slice(0, 8).map((pp: any, i: number) => (
                        <li key={i} className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4">
                          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                          <div>
                            <p className="font-medium text-foreground">{typeof pp === 'string' ? pp : pp.pain || ''}</p>
                            {pp.severity && <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">{pp.severity}</span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Purchase Triggers */}
                {dna?.purchaseTriggers && (
                  <div className="wl-card p-6">
                    <div className="flex items-center justify-between gap-3 mb-5">
                      <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Purchase triggers</h2>
                      <Zap className="h-5 w-5 text-opportunity" />
                    </div>
                    {Array.isArray(dna.purchaseTriggers) ? (
                      <ul className="space-y-2">
                        {dna.purchaseTriggers.map((trigger: any, i: number) => (
                          <li key={i} className="flex items-start gap-3 rounded-xl border border-opportunity/25 bg-opportunity/5 p-4">
                            <Zap className="mt-0.5 h-5 w-5 shrink-0 text-opportunity" />
                            <div>
                              <p className="font-medium text-foreground">{trigger.trigger || trigger}</p>
                              {trigger.type && <p className="mt-1 text-sm text-opportunity">Type: {trigger.type}</p>}
                              {trigger.strength && <p className="mt-1 text-sm text-muted-foreground">Strength: {trigger.strength}</p>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-foreground">{dna.purchaseTriggers}</p>
                    )}
                  </div>
                )}

                {/* Strategic Recommendations */}
                {dna?.strategicRecommendations?.length && (
                  <div className="wl-card p-6">
                    <div className="flex items-center justify-between gap-3 mb-5">
                      <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Strategic recommendations</h2>
                      <Sparkles className="h-5 w-5 text-ai" />
                    </div>
                    <ul className="space-y-3">
                      {dna.strategicRecommendations.slice(0, 6).map((rec: any, i: number) => (
                        <li key={i} className="flex items-start gap-3 rounded-xl border border-ai/25 bg-ai/5 p-4">
                          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-ai" />
                          <div>
                            <p className="font-medium text-foreground">{rec.recommendation || rec}</p>
                            {rec.category && <p className="mt-1 text-sm text-ai">Category: {rec.category}</p>}
                            {rec.impact && <p className="mt-1 text-sm text-opportunity">Impact: {rec.impact}</p>}
                            {rec.effort && <p className="mt-1 text-sm text-muted-foreground">Effort: {rec.effort}</p>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div className="wl-card p-6 text-center">
                <Sparkles className={cls('mx-auto h-12 w-12', frac('text-ai', '50'))} />
                <p className="mt-4 font-semibold text-foreground">Generate Brand DNA to unlock conversion intelligence.</p>
                <p className="mt-2 text-sm text-muted-foreground">Customer intent, pain points, purchase triggers, and strategic recommendations will be derived from the business profile.</p>
              </div>
            )}
          </div>
        );

      default:
        return <div className="wl-card p-6 text-center text-muted-foreground">Tab not implemented</div>;
    }
  };

  if (!lead) return null;

  return (
    <div className="space-y-6">
      <header className="wl-card wl-mesh relative overflow-hidden p-6 md:p-8">
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="wl-eyebrow">Strategy intelligence</p>
              <StatusBadge status={lead?.status || 'new'} />
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
                  <a href={lead.contact.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary transition hover:text-primary/80">
                    <Globe className="h-3.5 w-3.5" /> Website <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-2.5 shadow-sm">
              <div>
                <p className="wl-eyebrow">Strategy</p>
                <p className="font-display text-xl font-bold leading-tight tabular-nums text-foreground">
                  {lead?.analysis?.brandStrategyStatus === 'ok' ? <span className="text-verified">Complete</span> : <span className="text-warning-foreground">Pending</span>}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => generateDNAMutation.mutate()}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow-blue transition hover:bg-primary/90"
              disabled={generateDNAMutation.isPending}
            >
              {generateDNAMutation.isPending ? 'Generating...' : 'Generate Brand DNA'}
            </button>
          </div>
        </div>

        <div className="relative mt-6 flex flex-wrap gap-2 border-t border-border/70 pt-5">
          {STRATEGY_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              aria-current={activeTab === tab.key ? 'page' : undefined}
              className={cn('flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200', activeTab === tab.key ? `bg-${tab.key === 'positioning' ? 'primary' : tab.key === 'audience' ? 'primary' : tab.key === 'brand' ? 'ai' : tab.key === 'competitive' ? 'verified' : tab.key === 'website' ? 'creative' : 'opportunity'} text-white shadow-glow-${tab.key === 'positioning' ? 'primary' : tab.key === 'audience' ? 'primary' : tab.key === 'brand' ? 'ai' : tab.key === 'competitive' ? 'verified' : tab.key === 'website' ? 'creative' : 'opportunity'}` : 'bg-secondary text-muted-foreground hover:bg-secondary/70 hover:text-foreground')}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-6">
        {renderTabContent(activeTab)}
      </div>
    </div>
  );
}