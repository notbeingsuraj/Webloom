import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Briefcase, Building2, CheckCircle2, Users } from 'lucide-react';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import { leadService } from '../services/leadService';

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => leadService.getDashboardStats(),
  });

  const { data: leadsData } = useQuery({
    queryKey: ['leads'],
    queryFn: () => leadService.getLeads({ sort: '-createdAt' }),
  });

  const metrics = [
    { name: 'Total Leads', value: stats?.data?.totalLeads || 0, detail: 'Across every review', icon: Users },
    { name: 'High Opportunity', value: stats?.data?.highPriority || 0, detail: 'Strong fit & urgency', icon: Briefcase },
    { name: 'Websites Generated', value: stats?.data?.websitesGenerated || 0, detail: 'Offer packages ready', icon: Building2 },
    { name: 'Active Follow-ups', value: stats?.data?.contacted || 0, detail: 'Require outreach', icon: CheckCircle2 },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-[28px] border border-[#E5E5EA] bg-white/80" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-[24px] border border-[#E5E5EA] bg-white/80" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="rounded-[30px] border border-[#E5E5EA] bg-white p-6 shadow-[0_18px_50px_rgba(17,17,17,0.03)] md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#6E6E73]">Overview</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.06em] text-[#111111] md:text-[2.7rem]">Good afternoon, Suraj.</h1>
          </div>

          <Link to="/leads/new">
            <Button variant="primary" size="md" leadingIcon={<ArrowUpRight className="h-4 w-4" />}>
              Analyse Business
            </Button>
          </Link>
        </div>

        <div className="mt-8 border-t border-[#E5E5EA] pt-6">
          <p className="text-sm text-[#6E6E73]">Your pipeline</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map(({ name, value, detail, icon: Icon }) => (
              <div key={name} className="rounded-[24px] border border-[#E5E5EA] bg-[#F7F7F8] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#6E6E73]">{name}</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#111111]">
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-5 flex items-end justify-between gap-3">
                  <span className="text-3xl font-semibold tracking-[-0.05em] text-[#111111]">{value}</span>
                  <span className="text-[11px] uppercase tracking-[0.12em] text-[#6E6E73]">Live</span>
                </div>
                <p className="mt-3 text-sm text-[#6E6E73]">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      <section className="rounded-[30px] border border-[#E5E5EA] bg-white p-6 shadow-[0_15px_40px_rgba(17,17,17,0.02)] md:p-7">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#6E6E73]">Priority</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-[#111111]">Priority Leads</h2>
          </div>
          <Link to="/leads/new" className="text-sm font-medium text-[#0A84FF] hover:text-[#0077ED]">
            Review pipeline
          </Link>
        </div>

        <div className="overflow-hidden rounded-[24px] border border-[#E5E5EA]">
          <div className="hidden grid-cols-[1.5fr_1fr_1fr_0.8fr_0.8fr_0.9fr] gap-3 bg-[#F7F7F8] px-4 py-3 text-[11px] font-medium uppercase tracking-[0.12em] text-[#6E6E73] md:grid">
            <span>Business</span>
            <span>Category</span>
            <span>Location</span>
            <span>Score</span>
            <span>Status</span>
            <span className="text-right">Action</span>
          </div>

          <div className="divide-y divide-[#E5E5EA] bg-white">
            {leadsData?.data?.length ? (
              leadsData.data.map((lead: any) => (
                <div key={lead._id} className="grid gap-3 px-4 py-4 md:grid-cols-[1.5fr_1fr_1fr_0.8fr_0.8fr_0.9fr] md:items-center">
                  <div>
                    <p className="text-sm font-medium text-[#111111]">{lead.businessName}</p>
                    <p className="mt-1 text-xs text-[#6E6E73]">{lead.location?.city || 'Local business'}</p>
                  </div>
                  <div className="text-sm text-[#6E6E73]">{lead.businessCategory || 'N/A'}</div>
                  <div className="text-sm text-[#6E6E73]">{lead.location?.city || 'N/A'}</div>
                  <div className="text-sm font-medium text-[#111111]">{lead.opportunityScore?.total ?? '—'}</div>
                  <div><StatusBadge status={lead.status || 'new'} /></div>
                  <div className="md:text-right">
                    <Link to={`/leads/${lead._id}`} className="inline-flex items-center justify-center rounded-full bg-[#111111] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#2A2A2A]">
                      View
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-12 text-center">
                <p className="text-lg font-medium text-[#111111]">No leads yet.</p>
                <p className="mt-2 text-sm text-[#6E6E73]">Analyse your first business to start building your pipeline.</p>
                <div className="mt-5">
                  <Link to="/leads/new">
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
