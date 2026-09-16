import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowRight, ArrowUpRight, Briefcase, Building2, CheckCircle2, Compass, MapPin, Plus, Sparkles, Users,
} from 'lucide-react';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import StatCard from '../components/ui/StatCard';
import EmptyState from '../components/ui/EmptyState';
import Reveal from '../components/Reveal';
import usePageMetadata from '../hooks/usePageMetadata';
import analytics from '../services/analytics';
import { leadService } from '../services/leadService';

export default function Dashboard() {
  usePageMetadata({
    title: 'Webloom | AI-Powered Web Intelligence',
    description: 'Resolve verified business identities and generate conversion-ready websites with Webloom.',
    noindex: true, // dashboard is authenticated product surface
  });

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => leadService.getDashboardStats(),
  });

  const { data: leadsData } = useQuery({
    queryKey: ['leads'],
    queryFn: () => leadService.getLeads({ sort: '-createdAt' }),
  });

  const leads = leadsData ?? [];
  const highOpportunityLeads = stats?.highPriority ?? 0;

  const metrics = [
    {
      name: 'Total Leads', value: stats?.totalLeads ?? 0, detail: 'Across every review', icon: <Users className="h-4 w-4" />,
      tone: 'primary' as const, progress: null as number | null, badge: 'Live',
    },
    {
      name: 'High Opportunity', value: highOpportunityLeads, detail: 'Strong fit & urgency', icon: <Briefcase className="h-4 w-4" />,
      tone: 'opportunity' as const,
      progress: stats?.totalLeads ? Math.min(100, Math.round((highOpportunityLeads / stats.totalLeads) * 100)) : null,
      badge: 'Priority',
    },
    {
      name: 'Websites Generated', value: stats?.websitesGenerated ?? 0, detail: 'Offer packages ready', icon: <Building2 className="h-4 w-4" />,
      tone: 'creative' as const, progress: null as number | null, badge: 'Generated',
    },
    {
      name: 'Active Follow-ups', value: stats?.contacted ?? 0, detail: 'Require outreach', icon: <CheckCircle2 className="h-4 w-4" />,
      tone: 'verified' as const, progress: null as number | null, badge: 'Outreach',
    },
  ];

  const leadsAnalysis = leads.length > 0 ? (
    <>
      {leads.map((lead: any, index: number) => {
        const score = lead.opportunityScore?.total;
        const scoreNum = typeof score === 'number' && Number.isFinite(score) ? score : null;
        const toneScore = scoreNum == null ? null : (scoreNum >= 75 ? 'text-verified' : scoreNum >= 50 ? 'text-primary' : 'text-opportunity');
        return (
          <Reveal key={lead._id} delay={Math.min(index * 60, 240)}>
            <Link
              to={`/leads/${lead._id}`}
              className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-all duration-200 hover:border-primary/40 hover:shadow-card-hover sm:flex-row sm:items-center sm:gap-4"
            >
              {/* Avatar tile */}
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
                  <p className={`mt-1 font-display text-lg font-bold tabular-nums ${toneScore ?? 'text-muted-foreground'}`}>
                    {score != null && typeof score === 'number' ? Math.round(score) : '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="wl-eyebrow">Analyzed</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {lead.updatedAt ? new Date(lead.updatedAt).toLocaleDateString() : '—'}
                  </p>
                </div>
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-all group-hover:border-primary/40 group-hover:bg-primary group-hover:text-primary-foreground">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          </Reveal>
        );
      })}
    </>
  ) : null;

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <Reveal>
        <header className="wl-card wl-mesh relative overflow-hidden p-6 md:p-8">
          <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2">
                <p className="wl-eyebrow">Intelligence overview</p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-verified/10 px-2.5 py-0.5 text-[11px] font-semibold text-verified">
                  <span className="wl-dot bg-verified" aria-hidden="true" />
                  Verified pipeline
                </span>
              </div>
              <h1 className="mt-3 font-display text-3xl font-bold leading-tight tracking-[-0.05em] text-foreground md:text-[2.7rem]">
                Turn local businesses into <span className="text-gradient-brand">intelligence</span>.
              </h1>
              <p className="mt-3 max-w-xl text-base text-muted-foreground">
                Structure business data from a single Google Maps URL — verified identity, digital audit, opportunity score, and website generation.
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <Link to="/leads/new" onClick={() => analytics.primaryCta('dashboard_analyse')}>
                <Button variant="default" size="lg" leadingIcon={<Sparkles className="h-4 w-4" />} trailingIcon={<ArrowRight className="h-4 w-4" />}>
                  New Lead
                </Button>
              </Link>
              <Button variant="secondary" size="lg" onClick={() => document.getElementById('pipeline')?.scrollIntoView({ behavior: 'smooth' })}>
                Review pipeline
              </Button>
            </div>
          </div>

          {/* Pipeline highlight strip */}
          <div className="relative mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-border/70 pt-5">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Compass className="h-4 w-4 text-ai" />
              Pipeline: <span className="font-semibold text-foreground">{stats?.totalLeads ?? 0} leads</span>
            </span>
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-opportunity" aria-hidden="true" />
              High opportunity: <span className="font-semibold text-foreground">{highOpportunityLeads}</span>
            </span>
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-creative" aria-hidden="true" />
              Websites: <span className="font-semibold text-foreground">{stats?.websitesGenerated ?? 0}</span>
            </span>
          </div>
        </header>
      </Reveal>

      {isLoading ? (
        <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-36 wl-card">
                <div className="wl-shimmer h-full w-full rounded-3xl" />
              </div>
            ))}
          </div>
          <div className="wl-card h-80 px-6 py-8">
            <div className="wl-shimmer h-full w-full rounded-3xl" />
          </div>
        </div>
      ) : (leads.length === 0 && (stats?.totalLeads ?? 0) === 0) ? (
        <EmptyState
          tone="ai"
          icon={<Sparkles className="h-7 w-7" />}
          title="Your intelligence pipeline is ready"
          description="Analyse your first business to build a verified profile, see its opportunity score, and generate a conversion-ready website."
          example="https://maps.google.com/place/Tartine+Bakery"
          action={
            <Link to="/leads/new" onClick={() => analytics.primaryCta('empty_analyse')}>
              <Button size="lg" leadingIcon={<Plus className="h-4 w-4" />}>Analyse Business</Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* KPI cards: varied sizes — large overview + smaller KPIs */}
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

          {/* Main pipeline section */}
          <section id="pipeline" className="wl-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-card via-secondary/60 to-ai/5 px-6 py-5">
              <div>
                <p className="wl-eyebrow">Priority pipeline</p>
                <h2 className="mt-1 font-display text-2xl font-bold tracking-[-0.04em] text-foreground">
                  Recent leads
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground sm:inline-flex">
                  <span className="wl-dot bg-verified" aria-hidden="true" />
                  {leads.length} leads in view
                </span>
                <Link to="/leads/new" onClick={() => analytics.primaryCta('pipeline_review')} className="group inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80">
                  Review pipeline
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
              </div>
            </div>

            <div className="flex flex-col divide-y divide-border">
              {leads.length ? (
                leadsAnalysis
              ) : (
                <div className="px-6 py-12 text-center">
                  <p className="font-display text-lg font-semibold text-foreground">No leads yet.</p>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Analyse your first business to start building your pipeline — it takes about a minute.</p>
                  <div className="mt-5">
                    <Link to="/leads/new" onClick={() => analytics.primaryCta('empty_analyse')}>
                      <Button variant="default" size="sm" leadingIcon={<Plus className="h-4 w-4" />}>Analyse Business</Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
