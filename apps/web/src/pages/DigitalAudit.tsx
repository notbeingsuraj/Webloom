import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Globe, Mail, MapPin, Phone, Sparkles, Trash2, Clock, Tag, ExternalLink, CheckCircle2, AlertCircle, Info, Search, RefreshCw, Eye, Shield, Wifi, BarChart2, Layers, FileText } from 'lucide-react';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import { Chip } from '../components/ui/Chip';
import { AuditRow } from '../components/ui/AuditRow';
import { cn } from '../lib/utils';
import { cls, frac } from '../lib/cls';
import usePageMetadata from '../hooks/usePageMetadata';
import { leadService } from '../services/leadService';

const AUDIT_CATEGORIES = [
  { key: 'technical', label: 'Technical SEO', icon: Search, color: 'primary' },
  { key: 'content', label: 'Content Quality', icon: FileText, color: 'ai' },
  { key: 'local', label: 'Local SEO', icon: MapPin, color: 'verified' },
  { key: 'performance', label: 'Performance', icon: Sparkles, color: 'opportunity' },
  { key: 'security', label: 'Security', icon: Shield, color: 'danger' },
  { key: 'mobile', label: 'Mobile UX', icon: Layers, color: 'creative' },
  { key: 'social', label: 'Social Signals', icon: Sparkles, color: 'ai' },
  { key: 'reputation', label: 'Reputation', icon: Tag, color: 'opportunity' },
];

export default function DigitalAudit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<'overview' | 'technical' | 'content' | 'local' | 'performance' | 'security' | 'mobile' | 'social' | 'reputation'>('overview');

  usePageMetadata({
    title: 'Webloom | Digital Audit',
    description: 'Comprehensive digital presence analysis and audit.',
    noindex: true,
  });

  const { data: lead, isLoading, isError, error } = useQuery({
    queryKey: ['lead', id],
    queryFn: async () => {
      const lead = await leadService.getLead(id!);
      return lead;
    },
  });

  const generateAuditMutation = useMutation({
    mutationFn: () => leadService.generateWebsiteSpec(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead', id] }),
  });

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading digital audit">
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
    const message = isError ? (error as any)?.response?.data?.error || (error as any)?.message || 'The audit could not be loaded.' : 'No audit data found.';
    return (
      <div className="wl-card mx-auto max-w-xl p-10 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertCircle className="h-7 w-7" />
        </div>
        <p className="mt-5 font-display text-xl font-bold text-foreground">Unable to load audit</p>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <button type="button" onClick={() => queryClient.invalidateQueries({ queryKey: ['lead', id] })} className="mt-6 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition-colors hover:bg-primary/90">Retry</button>
        <Link to="/dashboard" className="mt-4 inline-block text-sm text-primary hover:underline">Back to dashboard</Link>
      </div>
    );
  }

  const audit = lead?.analysis?.audit;
  const websiteExists = audit?.websiteExists;
  const websiteUrl = audit?.websiteUrl;
  const overallScore = audit?.overallScore;
  const categories = audit?.categories || {};
  const status = audit?.status || 'unknown';

  const getCategoryScore = (key: string) => {
    const cat = categories[key];
    if (!cat) return null;
    if (cat.verified === false && cat.score === 0) return { score: 0, verified: false };
    return { score: cat.score ?? null, verified: cat.verified ?? true };
  };

  const renderCategoryCard = (category: typeof AUDIT_CATEGORIES[0]) => {
    const data = getCategoryScore(category.key);
    const hasData = data !== null && data.score !== null;
    const score = hasData ? data.score : 0;
    const isVerified = hasData ? data.verified : false;
    const tone = !hasData ? 'neutral' : !isVerified || score === 0 ? 'bad' : score >= 7 ? 'good' : score >= 4 ? 'neutral' : 'bad';

    return (
      <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-card p-5 transition-all hover:border-primary/30">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={cls('flex h-10 w-10 items-center justify-center rounded-lg', frac(`bg-${category.color}`, '12'), `text-${category.color}`)}>
              <category.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="wl-eyebrow">{category.label}</p>
              <p className="font-medium text-foreground">{hasData ? `${score}/10` : 'Not audited'}</p>
            </div>
          </div>
          <StatusBadge status={isVerified ? 'verified' : hasData ? 'warning' : 'new'} />
        </div>
        {hasData ? (
          <div className="mt-4 h-2 rounded-full bg-border overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-500" 
              style={{ 
                width: `${(score / 10) * 100}%`,
                background: tone === 'good' ? 'var(--color-verified)' : tone === 'neutral' ? 'var(--color-opportunity)' : 'var(--color-danger)'
              }} 
            />
          </div>
        ) : null}
        {!hasData && (
          <p className="mt-4 text-sm text-muted-foreground">Run digital audit to analyze this category.</p>
        )}
      </div>
    );
  };

  const strengths = audit?.strengths || [];
  const weaknesses = audit?.weaknesses || [];
  const criticalIssues = audit?.criticalIssues || [];
  const recommendations = audit?.recommendations || [];

  const normalizeEntry = (entry: any) => {
    if (typeof entry === 'string') return { description: entry, severity: 'medium' };
    return entry;
  };

  const renderFindings = (title: string, icon: React.ReactNode, items: any[], color: string, bgColor: string, emptyText: string) => {
    if (!items.length) return null;
    return (
      <div className="wl-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className={cls('flex h-8 w-8 items-center justify-center rounded-lg', frac(`bg-${color}`, '12'), `text-${color}`)}>
            {icon}
          </div>
          <h3 className="font-semibold text-foreground">{title}</h3>
        </div>
        <ul className="space-y-3">
          {items.slice(0, 5).map((item, index) => {
            const normalized = normalizeEntry(item);
            return (
              <li key={index} className="flex items-start gap-3 rounded-xl border border-border bg-gradient-to-br from-secondary via-card to-card p-4">
                <div className={cls('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', frac(`bg-${color}`, '12'), `text-${color}`)}>
                  {icon}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{normalized.description || normalized.area || 'Finding'}</p>
                  {normalized.severity && (
                    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]', 
                      normalized.severity === 'high' ? 'frac("bg-danger", "10") text-danger' :
                      normalized.severity === 'medium' ? 'frac("bg-opportunity", "10") text-opportunity' :
                      'frac("bg-primary", "10") text-primary')}>
                      {normalized.severity}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {items.length > 5 && <p className="mt-3 text-xs text-muted-foreground">+{items.length - 5} more findings</p>}
      </div>
    );
  };

  if (!lead) return null;

  return (
    <div className="space-y-6">
      <header className="wl-card wl-mesh relative overflow-hidden p-6 md:p-8">
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="wl-eyebrow">Digital audit</p>
              <StatusBadge status={lead?.status || 'new'} />
              {lead?.analysis?.audit?.status === 'degraded' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-0.5 text-[11px] font-semibold text-warning-foreground">
                  Audit incomplete
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
                <div style={{ display: 'contents' }}>
                  <span className="h-1 w-1 rounded-full bg-border" aria-hidden="true" />
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {lead.location.city}</span>
                </div>
              )}
              {lead?.contact?.website && (
                <div style={{ display: 'contents' }}>
                  <span className="h-1 w-1 rounded-full bg-border" aria-hidden="true" />
                  <a href={lead.contact.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary transition hover:text-primary/80">
                    <Globe className="h-3.5 w-3.5" /> Website <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-2.5 shadow-sm">
              <div>
                <p className="wl-eyebrow">Digital presence</p>
                <p className="font-display text-xl font-bold leading-tight tabular-nums text-foreground">
                  {websiteExists ? <span className="text-verified">Website detected</span> : <span className="text-opportunity">No website</span>}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full border-4 border-muted bg-card" style={{ background: `conic-gradient(hsl(var(--primary)) ${(overallScore ?? 0) * 3.6}deg, hsl(var(--muted)) 0deg)` }}>
                <div className="flex h-full w-full items-center justify-center rounded-full bg-card text-[9px] font-bold text-foreground tabular-nums">
                  {overallScore != null ? overallScore : '—'}
                </div>
              </div>
            </div>
          </div>

          <div className={cls('relative mt-6 flex flex-wrap gap-2 border-t', frac('border-border', '70'), 'pt-5')}>
            <button
              type="button"
              onClick={() => setActiveSection('overview')}
              className={cls('rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200', activeSection === 'overview' ? 'bg-gradient-to-r from-primary to-ai text-white shadow-glow-blue' : cls('bg-secondary text-muted-foreground', frac('hover:bg-secondary', '70'), 'hover:text-foreground'))}
            >
              Overview
            </button>
            {AUDIT_CATEGORIES.map((cat) => {
              const baseClasses = 'rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200';
              const activeClasses = 'bg-' + cat.color + ' text-' + cat.color + '-foreground shadow-glow-' + cat.color;
              const inactiveClasses = 'bg-secondary text-muted-foreground hover:bg-secondary hover:text-foreground';
              const hoverClasses = inactiveClasses + ' ' + frac('hover:bg-secondary', '70');
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setActiveSection(cat.key as typeof activeSection)}
                  className={cn(baseClasses, activeSection === cat.key ? activeClasses : hoverClasses)}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>
        </header>

      {activeSection === 'overview' ? (
        <div style={{ display: 'contents' }}>
          {/* Score & Summary */}
          <div className="grid gap-6 xl:grid-cols-[1.03fr_0.97fr]">
            <div className="space-y-6">
              <ScoreIndicator
                score={overallScore ?? 0}
                label={`Digital Audit${status === 'degraded' ? ' — Incomplete' : ''}`}
                description={status === 'degraded' 
                  ? `Audit incomplete — ${websiteExists ? 'website detected but not scored' : 'no website detected'}`
                  : websiteExists ? `Audited ${websiteUrl || ''}` : 'No website detected — deterministic audit'}
              />

              {/* Quick Actions */}
              <div className="wl-card p-5">
                <h3 className="font-semibold text-foreground mb-4">Quick actions</h3>
                <div className="flex flex-wrap gap-3">
                  <Button variant="default" leadingIcon={<RefreshCw className="h-4 w-4" />} onClick={() => generateAuditMutation.mutate()}>
                    Refresh audit
                  </Button>
                  {websiteUrl && (
                    <Button variant="secondary" leadingIcon={<ExternalLink className="h-4 w-4" />} onClick={() => window.open(websiteUrl, '_blank')}>
                      View website
                    </Button>
                  )}
                  <Button variant="secondary" leadingIcon={<Sparkles className="h-4 w-4" />}>
                    Generate website
                  </Button>
                </div>
              </div>

              {/* Findings Summary */}
              {(strengths.length || weaknesses.length || criticalIssues.length) && (
                <div className="wl-card p-5">
                  <h3 className="font-semibold text-foreground mb-4">Audit summary</h3>
                  <div className="flex flex-wrap gap-3">
                    {strengths.length > 0 && (
                      <Chip variant="verified" size="lg">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {strengths.length} strengths
                      </Chip>
                    )}
                    {weaknesses.length > 0 && (
                      <Chip variant="warning" size="lg">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {weaknesses.length} weaknesses
                      </Chip>
                    )}
                    {criticalIssues.length > 0 && (
                      <Chip variant="danger" size="lg">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {criticalIssues.length} critical
                      </Chip>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-6">
              {renderFindings('Strengths', <CheckCircle2 className="h-5 w-5" />, strengths, 'verified', 'verified/10', 'No strengths identified')}
              {renderFindings('Weaknesses', <AlertCircle className="h-5 w-5" />, weaknesses, 'opportunity', 'opportunity/10', 'No weaknesses identified')}
              {renderFindings('Critical issues', <AlertCircle className="h-5 w-5" />, criticalIssues, 'danger', 'danger/10', 'No critical issues')}

              {recommendations.length > 0 && (
                <div className="wl-card p-5">
                  <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-ai" />
                    Recommendations
                  </h3>
                  <ul className="space-y-3">
                    {recommendations.slice(0, 5).map((rec, index) => (
                      <li key={index} className={cls('flex items-start gap-3 rounded-xl border border-border bg-gradient-to-br from-secondary via-card', frac('to-ai', '5'), 'p-4')}>
                        <div className={cls('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', frac('bg-ai', '12'), 'text-ai')}>
                          <Sparkles className="h-4 w-4" />
                        </div>
                        <p className="text-sm leading-6 text-foreground">{typeof rec === 'string' ? rec : rec.description || rec}</p>
                      </li>
                    ))}
                  </ul>
                  {recommendations.length > 5 && <p className="mt-3 text-xs text-muted-foreground">+{recommendations.length - 5} more recommendations</p>}
                </div>
              )}
            </div>
        </div>
      </div>
    ) : (
      <div style={{ display: 'contents' }}>
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {AUDIT_CATEGORIES.filter(c => c.key === activeSection).map(renderCategoryCard)}
        </div>
      </div>
    )}
  </div>
);
}

