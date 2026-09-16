import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Briefcase, Building2, CheckCircle2, Users } from 'lucide-react';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import usePageMetadata from '../hooks/usePageMetadata';
import analytics from '../services/analytics';
import { leadService } from '../services/leadService';

const card = 'rounded-[24px] border border-webloom-border bg-webloom-surface p-4';
const surface = 'rounded-[30px] border border-webloom-border bg-webloom-surface p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)]';
const eyebrow = 'text-[11px] font-medium uppercase tracking-[0.18em] text-webloom-dim';

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

  const metrics = [
    { name: 'Total Leads', value: stats?.totalLeads || 0, detail: 'Across every review', icon: Users },
    { name: 'High Opportunity', value: stats?.highPriority || 0, detail: 'Strong fit & urgency', icon: Briefcase },
    { name: 'Websites Generated', value: stats?.websitesGenerated || 0, detail: 'Offer packages ready', icon: Building2 },
    { name: 'Active Follow-ups', value: stats?.contacted || 0, detail: 'Require outreach', icon: CheckCircle2 },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
        <div className="h-24 animate-pulse rounded-[28px] border border-webloom-border bg-webloom-surface" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-[24px] border border-webloom-border bg-webloom-surface" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className={`${surface} md:p-8`}>
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className={eyebrow}>Overview</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.06em] text-webloom-text md:text-[2.7rem]">
              Web intelligence pipeline
            </h1>
            <p className="mt-2 text-sm text-webloom-muted">
              Structure business data from a single Google Maps URL.
            </p>
          </div>

          <Link to="/leads/new" onClick={() => analytics.primaryCta('dashboard_analyse')}>
            <Button variant="primary" size="md" leadingIcon={<ArrowUpRight className="h-4 w-4" />}>
              Analyse Business
            </Button>
          </Link>
        </div>

        <div className="mt-8 border-t border-webloom-border pt-6">
          <p className="text-sm text-webloom-muted">Your pipeline</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map(({ name, value, detail, icon: Icon }) => (
              <div key={name} className={card}>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-webloom-muted">{name}</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-webloom-raised text-primary-400">
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-5 flex items-end justify-between gap-3">
                  <span className="text-3xl font-semibold tracking-[-0.05em] text-webloom-text">{value}</span>
                  <span className="text-[11px] uppercase tracking-[0.12em] text-webloom-dim">Live</span>
                </div>
                <p className="mt-3 text-sm text-webloom-muted">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      <section className={`${surface} md:p-7`}>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={eyebrow}>Priority</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-webloom-text">Priority Leads</h2>
          </div>
          <Link to="/leads/new" onClick={() => analytics.primaryCta('pipeline_review')} className="text-sm font-medium text-primary-400 hover:text-primary-300">
            Review pipeline
          </Link>
        </div>

        <div className="overflow-x-auto rounded-[24px] border border-webloom-border">
          <div className="hidden min-w-[720px] grid-cols-[1.5fr_1fr_1fr_0.8fr_0.8fr_0.9fr] gap-3 bg-webloom-raised px-4 py-3 text-[11px] font-medium uppercase tracking-[0.12em] text-webloom-dim md:grid">
            <span>Business</span>
            <span>Category</span>
            <span>Location</span>
            <span>Score</span>
            <span>Status</span>
            <span className="text-right">Action</span>
          </div>

          <div className="divide-y divide-webloom-border bg-webloom-surface">
            {leadsData?.length ? (
              leadsData.map((lead: any) => (
                <div key={lead._id} className="grid min-w-[720px] gap-3 px-4 py-4 md:grid-cols-[1.5fr_1fr_1fr_0.8fr_0.8fr_0.9fr] md:items-center">
                  <div>
                    <p className="text-sm font-medium text-webloom-text">{lead.businessName || 'Local business'}</p>
                    <p className="mt-1 text-xs text-webloom-muted">{lead.location?.city || 'Local business'}</p>
                  </div>
                  <div className="text-sm text-webloom-muted">{lead.businessCategory || 'N/A'}</div>
                  <div className="text-sm text-webloom-muted">{lead.location?.city || 'N/A'}</div>
                  <div className="text-sm font-medium text-webloom-text">{lead.opportunityScore?.total ?? '—'}</div>
                  <div><StatusBadge status={lead.status || 'new'} /></div>
                  <div className="md:text-right">
                    <Link
                      to={`/leads/${lead._id}`}
                      className="inline-flex items-center justify-center rounded-full bg-primary-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-primary-500"
                    >
                      View
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-12 text-center">
                <p className="text-lg font-medium text-webloom-text">No leads yet.</p>
                <p className="mt-2 text-sm text-webloom-muted">Analyse your first business to start building your pipeline.</p>
                <div className="mt-5">
                  <Link to="/leads/new" onClick={() => analytics.primaryCta('empty_analyse')}>
                    <Button variant="primary" size="sm">Analyse Business</Button>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
