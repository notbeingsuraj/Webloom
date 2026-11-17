import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, Globe2, Sparkles, Zap, Building2, Users, Server, Database, Cloud, ExternalLink, RefreshCw } from 'lucide-react';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import StatCard from '../components/ui/StatCard';
import EmptyState from '../components/ui/EmptyState';
import Reveal from '../components/Reveal';
import usePageMetadata from '../hooks/usePageMetadata';
import { leadService } from '../services/leadService';
import { JobStatusCard, ScrapingJob } from '../components/ui/JobStatusCard';
import { websiteService } from '../services/websiteService';
import api from '../services/api';

const SCRAPING_STEPS = [
  { label: 'Initializing job', duration: 1000 },
  { label: 'Connecting to scraper worker', duration: 2000 },
  { label: 'Submitting scrape queries', duration: 3000 },
  { label: 'Scraping Google Maps', duration: 30000 },
  { label: 'Normalizing results', duration: 5000 },
  { label: 'Enriching business data', duration: 10000 },
  { label: 'Finalizing', duration: 2000 },
];

export default function IntelligenceOverview() {
  usePageMetadata({
    title: 'Webloom | Intelligence Overview',
    description: 'Operational status, active intelligence operations, and system health.',
    noindex: true,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => leadService.getDashboardStats(),
  });

  const { data: leadsData } = useQuery({
    queryKey: ['leads'],
    queryFn: () => leadService.getLeads({ sort: '-createdAt', limit: 10 }),
  });

  const { data: sitesData, isLoading: sitesLoading } = useQuery({
    queryKey: ['generated-sites'],
    queryFn: websiteService.list,
  });

  const { data: aiHealth, isLoading: aiHealthLoading, refetch: refetchAiHealth } = useQuery({
    queryKey: ['ai-health'],
    queryFn: async () => {
      const response = await api.get('/health/ai');
      return response.data;
    },
    refetchInterval: 60000,
  });

  const { data: scraperHealth, isLoading: scraperHealthLoading } = useQuery({
    queryKey: ['scraper-health'],
    queryFn: async () => {
      const response = await api.get('/health/scraper');
      return response.data;
    },
    refetchInterval: 60000,
  });

  const leads = leadsData?.leads ?? [];
  const highOpportunityLeads = stats?.highPriority ?? 0;
  const sites = sitesData?.sites ?? [];

  const metrics = [
    {
      name: 'Total Investigations', value: stats?.totalLeads ?? 0, detail: 'Across every review', icon: <Users className="h-4 w-4" />,
      tone: 'primary' as const, progress: null, badge: 'Live',
    },
    {
      name: 'High Opportunity', value: highOpportunityLeads, detail: 'Strong fit & urgency', icon: <Building2 className="h-4 w-4" />,
      tone: 'opportunity' as const,
      progress: stats?.totalLeads ? Math.min(100, Math.round((highOpportunityLeads / stats.totalLeads) * 100)) : null,
      badge: 'Priority',
    },
    {
      name: 'Websites Deployed', value: stats?.websitesGenerated ?? 0, detail: 'Offer packages ready', icon: <Globe2 className="h-4 w-4" />,
      tone: 'creative' as const, progress: null, badge: 'Deployed',
    },
    {
      name: 'Active Follow-ups', value: stats?.contacted ?? 0, detail: 'Require outreach', icon: <Sparkles className="h-4 w-4" />,
      tone: 'verified' as const, progress: null, badge: 'Outreach',
    },
  ];

  const activeLeads = leads.filter(l => !['won', 'lost'].includes(l.status)).slice(0, 5);
  const runningSites = sites.filter(s => s.status === 'running').slice(0, 3);

  const aiProviders = aiHealth?.providers ?? {};
  const aiChain = aiHealth?.chain ?? [];
  const aiStatus = aiHealth?.status ?? 'unknown';

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <Reveal>
        <header className="wl-card wl-mesh relative overflow-hidden p-6 md:p-8">
          <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2">
                <p className="wl-eyebrow">Intelligence overview</p>
                <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.18em]', aiStatus === 'healthy' ? 'bg-verified/10 text-verified' : aiStatus === 'degraded' ? 'bg-warning/10 text-warning-foreground' : 'bg-danger/10 text-danger')}>
                  <span className={cn('wl-dot', aiStatus === 'healthy' ? 'bg-verified' : aiStatus === 'degraded' ? 'bg-warning' : 'bg-danger')} aria-hidden="true" />
                  {aiStatus === 'healthy' ? 'All systems nominal' : aiStatus === 'degraded' ? 'Degraded performance' : 'Critical failure'}
                </span>
              </div>
              <h1 className="mt-3 font-display text-3xl font-bold leading-tight tracking-[-0.05em] text-foreground md:text-[2.7rem]">
                Operational command for <span className="text-gradient-brand">business intelligence</span>.
              </h1>
              <p className="mt-3 max-w-xl text-base text-muted-foreground">
                Monitor active investigations, scraping operations, AI provider health, and deployment status from a single terminal.
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <Link to="/leads/new" className="group">
                <Button variant="default" size="lg" leadingIcon={<Sparkles className="h-4 w-4" />} trailingIcon={<ArrowRight className="h-4 w-4" />}>
                  New Investigation
                </Button>
              </Link>
              <Button variant="secondary" size="lg" onClick={() => refetchAiHealth()}>
                <RefreshCw className="h-4 w-4" /> Refresh Status
              </Button>
            </div>
          </div>

          {/* Pipeline highlight strip */}
          <div className="relative mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-border/70 pt-5">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 text-ai" />
              Pipeline: <span className="font-semibold text-foreground">{stats?.totalLeads ?? 0} investigations</span>
            </span>
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-opportunity" aria-hidden="true" />
              High opportunity: <span className="font-semibold text-foreground">{highOpportunityLeads}</span>
            </span>
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-creative" aria-hidden="true" />
              Websites: <span className="font-semibold text-foreground">{stats?.websitesGenerated ?? 0}</span>
            </span>
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Server className="h-4 w-4 text-ai" />
              AI: <span className="font-semibold text-foreground">{aiStatus === 'healthy' ? 'Nominal' : 'Degraded'}</span>
            </span>
          </div>
        </header>
      </Reveal>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m, i) => (
          <Reveal key={m.name} delay={i * 70}>
            <StatCard
              label={m.name}
              value={m.value}
              detail={m.detail}
              icon={m.icon}
              tone={m.tone}
              progress={m.progress}
              badge={m.badge}
            />
          </Reveal>
        ))}
      </div>

      {/* Active sections */}
      <div className="grid gap-6 xl:grid-cols-[1.03fr_0.97fr]">
        {/* Left column - Active Investigations & Scraping Jobs */}
        <div className="space-y-6">
          {/* Active Investigations */}
          <section className="wl-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-card via-secondary/60 to-ai/5 px-6 py-5">
              <div>
                <p className="wl-eyebrow">Active investigations</p>
                <h2 className="mt-1 font-display text-2xl font-bold tracking-[-0.04em] text-foreground">
                  Recent leads
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <Link to="/leads/new" className="group inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80">
                  New investigation
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
              </div>
            </div>

            <div className="flex flex-col divide-y divide-border">
              {activeLeads.length ? (
                activeLeads.map((lead: any, index: number) => (
                  <Link
                    key={lead._id}
                    to={`/leads/${lead._id}`}
                    className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-all duration-200 hover:border-primary/40 hover:shadow-card-hover sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/12 to-ai/10 text-primary">
                      <span className="font-display text-base font-bold">
                        {(lead.businessName || lead.leadName || 'B').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
                          {lead.businessName || lead.leadName || 'Local business'}
                        </p>
                        <StatusBadge status={lead.status || 'new'} />
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        {(lead.businessCategory || 'Local business')}
                        {lead.location?.city ? (
                          <>
                            <span className="text-border">·</span>
                            <MapPin className="h-3 w-3" />
                            {lead.location.city}
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-6 sm:justify-end sm:gap-8">
                      <div className="text-right">
                        <p className="wl-eyebrow">Score</p>
                        <p className="mt-1 font-display text-lg font-bold tabular-nums text-foreground">
                          {lead.opportunityScore?.total != null ? Math.round(lead.opportunityScore.total) : '—'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="wl-eyebrow">Updated</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {lead.updatedAt ? new Date(lead.updatedAt).toLocaleDateString() : '—'}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="px-6 py-12 text-center">
                  <p className="font-display text-lg font-semibold text-foreground">No active investigations.</p>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Start a new investigation to build your pipeline.</p>
                  <div className="mt-5">
                    <Link to="/leads/new">
                      <Button variant="default" size="sm" leadingIcon={<Sparkles className="h-4 w-4" />}>New Investigation</Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Scraping Jobs */}
          <section className="wl-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-card via-secondary/60 to-ai/5 px-6 py-5">
              <div>
                <p className="wl-eyebrow">Scraping operations</p>
                <h2 className="mt-1 font-display text-2xl font-bold tracking-[-0.04em] text-foreground">
                  Google Maps extraction
                </h2>
              </div>
              <Link to="/intelligence/business" className="group inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80">
                New extraction
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </div>

            <div className="space-y-4 p-6">
              {/* Placeholder for scraping jobs - would connect to scraper job API */}
              <div className="wl-card p-6 bg-gradient-to-br from-secondary via-card to-ai/5">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ai/12 text-ai">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Scraping operations</p>
                    <p className="mt-1 text-sm text-muted-foreground">Connect to the Google Maps scraper worker to monitor extraction jobs, view progress, and manage results.</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <Link to="/intelligence/business">
                    <Button variant="default" leadingIcon={<Sparkles className="h-4 w-4" />}>
                      Open Business Intelligence
                    </Button>
                  </Link>
                  <Button variant="secondary" leadingIcon={<ExternalLink className="h-4 w-4" />}>
                    Scraper Worker Health
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Right column - AI Provider Health & Deployed Sites */}
        <div className="space-y-6">
          {/* AI Provider Health */}
          <section className="wl-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-card via-secondary/60 to-ai/5 px-6 py-5">
              <div>
                <p className="wl-eyebrow">AI infrastructure</p>
                <h2 className="mt-1 font-display text-2xl font-bold tracking-[-0.04em] text-foreground">
                  Provider health
                </h2>
              </div>
              <Button variant="secondary" size="sm" onClick={() => refetchAiHealth()}>
                <RefreshCw className="h-4 w-4" /> Refresh
              </Button>
            </div>

            <div className="p-6 space-y-4">
              {aiHealthLoading ? (
                <div className="space-y-4" aria-busy="true" aria-label="Loading AI health">
                  <div className="wl-card h-32 p-6"><div className="wl-shimmer h-full w-full rounded-2xl" /></div>
                  <div className="wl-card h-32 p-6"><div className="wl-shimmer h-full w-full rounded-2xl" /></div>
                </div>
              ) : (
                <>
                  {/* Chain Overview */}
                  <div className="wl-card p-4 bg-gradient-to-br from-secondary via-card to-ai/5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ai/12 text-ai">
                          <Sparkles className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="wl-eyebrow">Provider chain</p>
                          <p className="font-medium text-foreground">{aiChain.join(' → ') || 'mercury → nvidia'}</p>
                        </div>
                      </div>
                      <StatusBadge status={aiStatus === 'healthy' ? 'verified' : aiStatus === 'degraded' ? 'warning' : 'danger'} />
                    </div>
                  </div>

                  {/* Provider Cards */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {['mercury', 'nvidia'].map((providerName) => {
                      const provider = aiHealth?.providers?.[providerName];
                      if (!provider) return null;
                      const isPrimary = aiChain[0] === providerName;
                      return (
                        <div key={providerName} className="wl-card p-4 transition-all hover:border-primary/30">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', 
                                providerName === 'mercury' ? 'bg-primary/12 text-primary' : 'bg-ai/12 text-ai')}>
                                {providerName === 'mercury' ? 'M3' : 'N3'}
                              </div>
                              <div>
                                <p className="font-semibold text-foreground">{providerName === 'mercury' ? 'Mercury 3' : 'NVIDIA Nemotron 3 Ultra'}</p>
                                <p className="text-xs text-muted-foreground">{provider.model}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge status={provider.usable === true ? 'verified' : provider.configured ? 'warning' : 'new'} />
                              {isPrimary && <Chip variant="primary" size="sm">PRIMARY</Chip>}
                            </div>
                          </div>
                          <div className="mt-4 grid gap-2 sm:grid-cols-3">
                            <div className="rounded-xl border border-border bg-card p-3">
                              <p className="wl-eyebrow">Latency</p>
                              <p className="font-display text-lg font-bold tabular-nums text-foreground">{provider.latencyP50Ms ?? '—'}ms</p>
                            </div>
                            <div className="rounded-xl border border-border bg-card p-3">
                              <p className="wl-eyebrow">Success Rate</p>
                              <p className="font-display text-lg font-bold tabular-nums text-foreground">
                                {provider.failureRate != null ? `${((1 - provider.failureRate) * 100).toFixed(1)}%` : '—'}
                              </p>
                            </div>
                            <div className="rounded-xl border border-border bg-card p-3">
                              <p className="wl-eyebrow">Status</p>
                              <p className="font-display text-lg font-bold tabular-nums text-foreground">
                                {provider.usable === true ? 'Operational' : provider.configured ? 'Configured' : 'Unconfigured'}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Deployed Sites */}
          <section className="wl-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-card via-secondary/60 to-creative/5 px-6 py-5">
              <div>
                <p className="wl-eyebrow">Deployed assets</p>
                <h2 className="mt-1 font-display text-2xl font-bold tracking-[-0.04em] text-foreground">
                  Generated websites
                </h2>
              </div>
              <Link to="/websites" className="group inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80">
                View all sites
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </div>

            <div className="p-6">
              {sitesLoading ? (
                <div className="space-y-3" aria-busy="true" aria-label="Loading sites">
                  <div className="wl-card h-32 p-6"><div className="wl-shimmer h-full w-full rounded-2xl" /></div>
                  <div className="wl-card h-32 p-6"><div className="wl-shimmer h-full w-full rounded-2xl" /></div>
                  <div className="wl-card h-32 p-6"><div className="wl-shimmer h-full w-full rounded-2xl" /></div>
                </div>
              ) : sites.length === 0 ? (
                <div className="wl-card p-8 text-center bg-gradient-to-br from-secondary via-card to-creative/5">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-creative/12 text-creative">
                    <Globe2 className="h-7 w-7" />
                  </div>
                  <p className="mt-4 font-display text-lg font-semibold text-foreground">No websites deployed</p>
                  <p className="mt-2 text-sm text-muted-foreground">Generate your first website from a verified business profile.</p>
                  <Link to="/websites" className="mt-5 inline-block">
                    <Button variant="default" size="sm" leadingIcon={<Plus className="h-4 w-4" />}>Generate Website</Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {runningSites.map((site) => (
                    <div key={site.slug} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-secondary p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-creative/12 text-creative">
                          <Globe2 className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{site.slug}</p>
                          <p className="text-xs text-muted-foreground">{site.url || `Port ${site.port ?? '—'}`}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={site.status === 'running' ? 'verified' : 'new'} />
                        {site.status === 'running' ? (
                          <>
                            <Button size="sm" leadingIcon={<ExternalLink className="h-4 w-4" />} onClick={() => window.open(site.url, '_blank', 'noopener,noreferrer')}>
                              Open
                            </Button>
                            <Button size="sm" variant="secondary" leadingIcon={<Square className="h-4 w-4" />}>
                              Stop
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" leadingIcon={<ExternalLink className="h-4 w-4" />}>
                            Start
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {sites.length > runningSites.length && (
                    <div className="mt-4 text-center">
                      <Link to="/websites">
                        <Button variant="secondary" size="sm">View all {sites.length} sites</Button>
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}