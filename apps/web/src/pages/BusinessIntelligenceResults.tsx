import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { Globe, Mail, MapPin, Phone, Sparkles, AlertCircle, CheckCircle2, Clock, Search, X, RefreshCw, Eye, Download, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import { Chip } from '../components/ui/Chip';
import { cn } from '../lib/utils';
import usePageMetadata from '../hooks/usePageMetadata';
import { leadService } from '../services/leadService';
import api from '../services/api';
import { cls, frac } from '../lib/cls';

const SCRAPING_STEPS = [
  { label: 'Initializing job', duration: 1000 },
  { label: 'Connecting to scraper worker', duration: 2000 },
  { label: 'Submitting scrape queries', duration: 3000 },
  { label: 'Scraping Google Maps', duration: 30000 },
  { label: 'Normalizing results', duration: 5000 },
  { label: 'Enriching business data', duration: 10000 },
  { label: 'Finalizing', duration: 2000 },
];

export default function BusinessIntelligenceResults() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [job, setJob] = useState<any>(null);
  const [showRaw, setShowRaw] = useState(false);

  usePageMetadata({
    title: 'Webloom | Extraction Results',
    description: 'View extracted business intelligence from Google Maps.',
    noindex: true,
  });

  const { data: jobData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['scraping-job', id],
    queryFn: async () => {
      const response = await api.get(`/scraping/jobs/${id}`);
      return response.data;
    },
    enabled: !!id,
    refetchInterval: (data) => {
      if (!data) return 3000;
      return ['pending', 'queued', 'scraping', 'normalizing', 'enriching', 'retrying'].includes(data.status) ? 3000 : false;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (jobId: string) => {
      await api.delete(`/scraping/jobs/${jobId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scraping-jobs'] });
      refetch();
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (jobId: string) => {
      await api.post(`/scraping/jobs/${jobId}/retry`);
    },
    onSuccess: () => {
      refetch();
    },
  });

  const downloadResults = async () => {
    if (!jobData?.results) return;
    const blob = new Blob([JSON.stringify(jobData.results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scraping-results-${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading extraction results">
        <header className="wl-card wl-mesh relative overflow-hidden p-6 md:p-8">
          <div className={`wl-shimmer h-12 w-3` + '/' + `4 rounded-lg`} />
          <div className={`mt-4 wl-shimmer h-8 w-1` + '/' + `4 rounded-lg`} />
        </header>
        <div className="wl-card p-6">
          <ProgressIndicator steps={SCRAPING_STEPS} currentStep={2} elapsedTime={45} showElapsed={true} />
        </div>
      </div>
    );
  }

  if (isError || !jobData) {
    const message = isError ? (error as any)?.response?.data?.error || (error as any)?.message || 'The results could not be loaded.' : 'Job not found.';
    return (
      <div className="wl-card mx-auto max-w-xl p-10 text-center">
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive` + '/' + `10 text-destructive`}>
          <AlertCircle className="h-7 w-7" />
        </div>
        <p className="mt-5 font-display text-xl font-bold text-foreground">Unable to load results</p>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <button type="button" onClick={() => refetch()} className={`mt-6 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition-colors hover:bg-primary` + '/' + `90`}>Retry</button>
        <Link to="/intelligence/business" className="mt-4 inline-block text-sm text-primary hover:underline">Back to Business Intelligence</Link>
      </div>
    );
  }

  const active = ['pending', 'queued', 'scraping', 'normalizing', 'enriching', 'retrying'].includes(job.status);
  const stepMap: Record<string, number> = {
    pending: 0, queued: 1, scraping: 2, normalizing: 3, enriching: 4, completed: 5, failed: 5, partial: 5, cancelled: 5, retrying: 1
  };
  const currentStep = stepMap[job.status] ?? 0;
  const elapsedSeconds = job.startedAt 
    ? (() => {
        const diff = new Date(job.completedAt || new Date().toISOString()).getTime() - new Date(job.startedAt).getTime();
        return Math.floor(diff * 0.001);
      })()
    : 0;

  const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    pending: { label: 'PENDING', color: 'text-muted-foreground', bg: 'bg-secondary' },
    queued: { label: 'QUEUED', color: 'text-primary', bg: frac('bg-primary', '10') },
    scraping: { label: 'SCRAPING', color: 'text-primary', bg: frac('bg-primary', '10') },
    normalizing: { label: 'NORMALIZING', color: 'text-ai', bg: frac('bg-ai', '10') },
    enriching: { label: 'ENRICHING', color: 'text-opportunity', bg: frac('bg-opportunity', '10') },
    completed: { label: 'COMPLETED', color: 'text-verified', bg: frac('bg-verified', '10') },
    failed: { label: 'FAILED', color: 'text-danger', bg: frac('bg-danger', '10') },
    partial: { label: 'PARTIAL', color: 'text-warning-foreground', bg: frac('bg-warning', '10') },
    cancelled: { label: 'CANCELLED', color: 'text-muted-foreground', bg: 'bg-secondary' },
    retrying: { label: 'RETRYING', color: 'text-warning-foreground', bg: frac('bg-warning', '10') },
  };

  const config = STATUS_CONFIG[job.status] || STATUS_CONFIG.pending;
  const isTerminal = ['completed', 'failed', 'partial', 'cancelled'].includes(job.status);
  const isRetryable = ['failed', 'partial'].includes(job.status);

  const formatTime = (dateString?: string) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="wl-card wl-mesh relative overflow-hidden p-6 md:p-8">
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="wl-eyebrow">Extraction results</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.06em] text-foreground md:text-[2.7rem]">
              {job.queries[0]?.substring(0, 60) || 'Multi-query job'}
              {job.queries.length > 1 && <span className="ml-2 text-sm text-muted-foreground">+{job.queries.length - 1} more</span>}
            </h1>
            <p className="mt-3 max-w-2xl text-base text-muted-foreground">
              Google Maps extraction job — verified data, field-level provenance, AI enrichment ready.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm font-medium">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: config.color }} />
              <span className={cn('font-semibold', config.color)}>{config.label}</span>
            </div>
            {job.progress > 0 && job.status !== 'completed' && <Chip variant="ai">{job.progress}%</Chip>}
          </div>
        </div>
      </header>

      {job.error && (
        <div className={cls('wl-card p-5 border-danger', frac('25', '5'), 'bg-danger')} role="alert">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-danger mt-0.5" />
            <div>
              <p className="font-medium text-danger">Extraction error</p>
              <p className={cls('mt-1 text-sm text-danger', frac('80'))}>{job.error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Main results panel */}
        <div className="space-y-6">
          {/* Progress & Stats */}
          <ProgressIndicator 
            steps={SCRAPING_STEPS.map((step, index) => ({
              ...step,
              status: index < currentStep ? 'completed' : index === currentStep ? job.status : 'pending' as const
            }))} 
            currentStep={currentStep} 
            elapsedTime={job.startedAt ? (() => { const diff = new Date(job.completedAt || new Date().toISOString()).getTime() - new Date(job.startedAt).getTime(); return Math.floor(diff * 0.001); })() : 0}
            showElapsed={active}
          />

          <div className="grid gap-4 sm:grid-cols-4">
            <div className={`rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-primary` + '/' + `5 p-4`}>
              <p className="wl-eyebrow">Total Places</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">{job.totalPlaces}</p>
            </div>
            <div className={`rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-verified` + '/' + `5 p-4`}>
              <p className="wl-eyebrow">Completed</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-verified">{job.completedPlaces}</p>
            </div>
            <div className={`rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-danger` + '/' + `5 p-4`}>
              <p className="wl-eyebrow">Failed</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-danger">{job.failedPlaces}</p>
            </div>
            <div className={`rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-ai` + '/' + `5 p-4`}>
              <p className="wl-eyebrow">Queries</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">{job.queries.length}</p>
            </div>
          </div>

          {/* Timeline */}
          <div className={`wl-card p-5 rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-secondary` + '/' + `50`}>
            <p className="wl-eyebrow">Timeline</p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center gap-3 text-muted-foreground">
                <span className="w-36 shrink-0">Created</span>
                <span className="text-foreground">{formatTime(job.createdAt)}</span>
              </div>
              {job.startedAt && (
                <div className="flex items-center gap-3">
                  <span className="w-36 shrink-0">Started</span>
                  <span className="text-foreground">{formatTime(job.startedAt)}</span>
                </div>
              )}
              {job.completedAt && (
                <div className="flex items-center gap-3">
                  <span className="w-36 shrink-0">Completed</span>
                  <span className="text-foreground">{formatTime(job.completedAt)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Extracted Businesses */}
          {job.results?.businesses?.length && (
            <section className="wl-card overflow-hidden">
              <div className={`flex flex-wrap items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-card via-secondary` + '/' + `60 to-ai${'/'}5 px-6 py-5`}>
                <div>
                  <p className="wl-eyebrow">Extracted businesses</p>
                  <h2 className="mt-1 font-display text-2xl font-bold tracking-[-0.04em] text-foreground">
                    {job.results.totalCount} businesses extracted
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={downloadResults}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-secondary"
                  >
                    <Download className="h-4 w-4" />
                    Download JSON
                  </button>
                  <label className="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                    <input type="checkbox" checked={false} onChange={(e) => setShowRaw(e.target.checked)} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                    Show raw
                  </label>
                </div>
              </div>

              <div className="p-6">
                {showRaw ? (
                  <pre className="rounded-xl border border-border bg-card p-4 max-h-96 overflow-auto text-xs font-mono text-foreground">
                    {JSON.stringify(job.results, null, 2)}
                  </pre>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {job.results.businesses.map((biz: any, index: number) => (
                      <div key={index} className={`flex items-start gap-4 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary` + '/' + `30 hover:shadow-card-hover`}>
                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-verified` + '/' + `12 text-verified`}>
                          <CheckCircle2 className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <p className="font-semibold text-foreground">{biz.name}</p>
                            <Chip variant="verified" size="sm">Verified</Chip>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5" />
                              <span className="truncate text-foreground">{biz.address}</span>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Phone className="h-3.5 w-3.5" />
                              <span className="text-foreground">{biz.phone || '—'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Globe className="h-3.5 w-3.5" />
                              <span className="truncate text-foreground">{biz.website || '—'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Star className="h-3.5 w-3.5" />
                              <span className="text-foreground">{biz.rating ? `★ ${biz.rating}` : '—'}</span>
                              <span className="text-muted-foreground">({biz.reviewCount || 0} reviews)</span>
                            </div>
                          </div>
                          {biz.placeId && (
                            <p className="mt-2 text-xs text-muted-foreground font-mono">Place ID: {biz.placeId}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {biz.rating && (
                            <div className="flex items-center gap-1 text-warning-foreground">
                              <Star className="h-4 w-4 fill-current" />
                              <span className="font-bold">{biz.rating}</span>
                            </div>
                          )}
                          {biz.reviewCount && (
                            <span className="text-xs text-muted-foreground">({biz.reviewCount} reviews)</span>
                          )}
                        </div>
                      </div>
                    ))}
                    {job.results.businesses.length > 10 && (
                      <p className="mt-4 text-center text-sm text-muted-foreground">+{job.results.businesses.length - 10} more businesses</p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          {/* Job Info */}
          <div className={cls('wl-card p-5 bg-gradient-to-br from-secondary via-card to-ai', frac('to-ai', '5'))}>
            <div className="flex items-center gap-3 mb-4">
              <div className={cls('flex h-10 w-10 items-center justify-center rounded-xl bg-ai', frac('bg-ai', '12'), 'text-ai')}>
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="wl-eyebrow">Job information</p>
                <h3 className="font-semibold text-foreground">Job details</h3>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Job ID</span>
                <span className="font-mono text-foreground text-xs truncate max-w-[200px]">{job.jobId}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Queries</span>
                <span className="font-medium text-foreground">{job.queries.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium text-foreground">{formatTime(job.createdAt)}</span>
              </div>
              {job.startedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Started</span>
                  <span className="font-medium text-foreground">{formatTime(job.startedAt)}</span>
                </div>
              )}
              {job.completedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Completed</span>
                  <span className="font-medium text-foreground">{formatTime(job.completedAt)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-mono text-foreground">{elapsedSeconds}s</span>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {job.error && (
            <div className={`wl-card p-5 border-danger` + '/' + `25 bg-danger${'/'}5`} role="alert">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 shrink-0 text-danger mt-0.5" />
                <div>
                  <p className="font-medium text-danger">Error</p>
                  <p className={`mt-1 text-sm text-danger` + '/' + `80`}>{job.error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Queries */}
          <div className="wl-card p-5">
            <h3 className="font-semibold text-foreground mb-3">Search queries</h3>
            <ul className="space-y-2">
              {job.queries.map((q: string, i: number) => (
                <li key={i} className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary` + '/' + `12 text-primary`}>
                    {i + 1}
                  </span>
                  <p className="truncate text-sm text-foreground">{q}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Actions */}
          <div className="wl-card p-5 space-y-3">
            <h3 className="font-semibold text-foreground">Actions</h3>
            <div className="flex flex-col gap-2">
              {active && (
                <button
                  type="button"
                  onClick={() => cancelMutation.mutate(job.jobId)}
                  className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-destructive` + '/' + `25 bg-destructive${'/'}10 px-4 py-2 text-sm font-medium text-destructive transition hover:bg-destructive${'/'}20`}
                >
                  <X className="h-4 w-4" />
                  Cancel Job
                </button>
              )}
              {isRetryable && (
                <button
                  type="button"
                  onClick={() => retryMutation.mutate(job.jobId)}
                  className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-warning` + '/' + `25 bg-warning${'/'}10 px-4 py-2 text-sm font-medium text-warning-foreground transition hover:bg-warning${'/'}20`}
                >
                  <RefreshCw className="h-4 w-4" />
                  Retry Job
                </button>
              )}
              {job.status === 'completed' && (
                <button
                  type="button"
                  onClick={() => navigate(`/intelligence/business`)}
                  className={`w-full justify-start inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow-blue transition hover:bg-primary` + '/' + `90`}
                >
                  <Eye className="h-4 w-4" />
                  View in Business Intelligence
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate('/intelligence/business')}
                className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 text-sm font-medium text-foreground transition hover:bg-secondary` + '/' + `80`}
              >
                <Sparkles className="h-4 w-4" />
                New Extraction
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

const formatTime = (dateString?: string) => {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleString();
}

export default BusinessIntelligenceResults;