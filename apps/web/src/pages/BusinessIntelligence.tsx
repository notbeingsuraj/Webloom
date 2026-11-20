import { useState, useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader, MapPin, Sparkles, AlertCircle, CheckCircle2, Clock, Search, X, RefreshCw, Eye, Download, Plus, Filter, Settings } from 'lucide-react';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import { Chip } from '../components/ui/Chip';
import { JobStatusCard, ScrapingJob } from '../components/ui/JobStatusCard';
import { ProgressIndicator, ProgressStep } from '../components/ui/ProgressIndicator';
import { GoogleMapsUrlParser } from '../components/ui/GoogleMapsUrlParser';
import { cn } from '../lib/utils';
import usePageMetadata from '../hooks/usePageMetadata';
import analytics from '../services/analytics';
import api from '../services/api';
import { cls } from '../lib/cls';

const SCRAPING_STEPS: ProgressStep[] = [
  { label: 'Initializing job', duration: 1000 },
  { label: 'Connecting to scraper worker', duration: 2000 },
  { label: 'Submitting scrape queries', duration: 3000 },
  { label: 'Scraping Google Maps', duration: 30000 },
  { label: 'Normalizing results', duration: 5000 },
  { label: 'Enriching business data', duration: 10000 },
  { label: 'Finalizing', duration: 2000 },
];

export default function BusinessIntelligence() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  usePageMetadata({
    title: 'Webloom | Business Intelligence',
    description: 'Extract verified business intelligence from Google Maps URLs.',
    noindex: true,
  });

  const [mode, setMode] = useState<'single' | 'multi'>('single');
  const [singleUrl, setSingleUrl] = useState('');
  const [multiQuery, setMultiQuery] = useState('');
  const [multiLocation, setMultiLocation] = useState('');
  const [maxResults, setMaxResults] = useState(20);
  const [depth, setDepth] = useState(1);
  const [emailExtraction, setEmailExtraction] = useState(false);
  const [extraReviews, setExtraReviews] = useState(false);
  const [fastMode, setFastMode] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [currentJob, setCurrentJob] = useState<ScrapingJob | null>(null);
  const [jobsHistory, setJobsHistory] = useState<ScrapingJob[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<'extract' | 'history'>('extract');

  const validateGoogleMapsUrl = (url: string): string | null => {
    const trimmed = url.trim();
    if (!trimmed) return 'Please enter a Google Maps URL.';
    try {
      const parsed = new URL(trimmed);
      const validHosts = ['maps.google.com', 'www.google.com', 'google.com', 'goo.gl', 'maps.app.goo.gl'];
      const isValid = validHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h));
      if (!isValid) return "That doesn't appear to be a Google Maps URL.";
      return null;
    } catch {
      return 'Please enter a valid URL (e.g., https://maps.google.com/...)';
    }
  };

  const validateMultiInput = (): string | null => {
    if (!multiQuery.trim()) return 'Please enter a search query.';
    return null;
  };

  const parseUrlPreview = useCallback((url: string) => {
    try {
      return GoogleMapsUrlParser.parse(url);
    } catch {
      return null;
    }
  }, []);

  const singleUrlParsed = singleUrl ? parseUrlPreview(singleUrl) : null;

  const submitSingleJob = useMutation({
    mutationFn: async (url: string) => {
      const response = await api.post('/scraping/jobs', {
        queries: [url],
        config: { depth, maxResults: 1, emailExtraction, extraReviews, fastMode: false }
      });
      return response.data;
    },
    onMutate: () => {
      setCurrentJob(null);
    },
    onSuccess: (data) => {
      setCurrentJob({ ...data, status: 'pending', queries: [singleUrl] } as ScrapingJob);
      pollJobStatus(data.jobId);
    },
    onError: (error: any) => {
      console.error('[BusinessIntelligence] Submit failed:', error);
    },
  });

  const submitMultiJob = useMutation({
    mutationFn: async () => {
      const query = multiLocation ? `${multiQuery} in ${multiLocation}` : multiQuery;
      const response = await api.post('/scraping/jobs', {
        queries: [query],
        config: { depth, maxResults, emailExtraction, extraReviews, fastMode }
      });
      return response.data;
    },
    onMutate: () => {
      setCurrentJob(null);
    },
    onSuccess: (data) => {
      setCurrentJob({ ...data, status: 'pending', queries: [multiQuery] } as ScrapingJob);
      pollJobStatus(data.jobId);
    },
    onError: (error: any) => {
      console.error('[BusinessIntelligence] Submit failed:', error);
    },
  });

  const cancelJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      await api.delete(`/scraping/jobs/${jobId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scraping-jobs'] });
    },
  });

  const retryJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      await api.post(`/scraping/jobs/${jobId}/retry`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scraping-jobs'] });
    },
  });

  const pollJobStatus = async (jobId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await api.get(`/scraping/jobs/${jobId}`);
        const job = response.data;
        setCurrentJob(prev => prev?.jobId === jobId ? job : prev);
        setJobsHistory(prev => {
          const exists = prev.find(j => j.jobId === jobId);
          if (exists) {
            return prev.map(j => j.jobId === jobId ? job : j);
          }
          return [job, ...prev];
        });

        if (['completed', 'failed', 'cancelled', 'partial'].includes(job.status)) {
          clearInterval(pollInterval);
          queryClient.invalidateQueries({ queryKey: ['scraping-jobs'] });
        }
      } catch (error) {
        console.error('[BusinessIntelligence] Poll failed:', error);
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  };

  const handleSingleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = singleUrl.trim();
    const error = validateGoogleMapsUrl(trimmed);
    if (error) { setUrlError(error); return; }
    setUrlError(null);
    analytics.startAnalysis();
    submitSingleJob.mutate(trimmed);
  };

  const handleMultiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const error = validateMultiInput();
    if (error) { setUrlError(error); return; }
    setUrlError(null);
    analytics.startAnalysis();
    submitMultiJob.mutate();
  };

  const handleCancel = () => {
    if (currentJob) cancelJobMutation.mutate(currentJob.jobId);
  };

  const handleRetry = () => {
    if (currentJob) retryJobMutation.mutate(currentJob.jobId);
  };

  const handleViewResults = (jobId: string) => {
    navigate(`/intelligence/results/${jobId}`);
  };

  const active = currentJob && ['pending', 'queued', 'scraping', 'normalizing', 'enriching'].includes(currentJob.status);
  const stepMap: Record<string, number> = {
    pending: 0, queued: 1, scraping: 2, normalizing: 3, enriching: 4, completed: 5, failed: 5, partial: 5, cancelled: 5, retrying: 1
  };
  const currentStep = currentJob ? (stepMap[currentJob.status] ?? 0) : 0;
  const elapsedSeconds = currentJob?.startedAt 
    ? Math.floor((new Date(currentJob.completedAt || new Date().toISOString()).getTime() - new Date(currentJob.startedAt).getTime()) / 1000)
    : 0;

  // Extract job history list to reduce JSX nesting depth (esbuild workaround)
  const jobHistoryList = showHistory
    ? jobsHistory.length === 0
      ? <p className="text-sm text-muted-foreground text-center py-8">No extraction history yet</p>
      : jobsHistory.slice(0, 10).map((job) => (
          <div key={job.jobId} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {job.queries[0]?.substring(0, 40) || 'Multi-query'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {new Date(job.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Chip variant={job.status === 'completed' ? 'verified' : job.status === 'failed' ? 'danger' : 'default'} size="sm">
                {job.status}
              </Chip>
              <button
                type="button"
                onClick={() => handleViewResults(job.jobId)}
                className="text-primary hover:underline text-sm"
              >
                View
              </button>
            </div>
          </div>
        ))
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="wl-card wl-mesh relative overflow-hidden p-6 md:p-8">
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="wl-eyebrow">Business intelligence</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.06em] text-foreground md:text-[2.7rem]">
              Extract verified business intelligence from <span className="text-gradient-brand">Google Maps</span>.
            </h1>
            <p className="mt-3 max-w-2xl text-base text-muted-foreground">
              Single-business extraction or multi-business discovery. Verified data, field-level provenance, AI enrichment ready.
            </p>
          </div>
          <div className={cls('inline-flex items-center gap-2 rounded-full border', frac('border-ai', '25'), frac('bg-ai', '10'), 'px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ai')}>
            <Sparkles className="h-3.5 w-3.5" />
            Google Maps scraper
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Main extraction panel */}
        <div className="space-y-6">
          {/* Mode selector */}
          <div className="wl-card p-4">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-5 w-5 text-ai" />
              <h3 className="font-semibold text-foreground">Extraction mode</h3>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-1">
              <button
                type="button"
                onClick={() => setMode('single')}
                className={cn('flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all',
                  mode === 'single' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                <MapPin className="h-4 w-4 mr-2" />
                Single business
              </button>
              <button
                type="button"
                onClick={() => setMode('multi')}
                className={cn('flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all',
                  mode === 'multi' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                <Search className="h-4 w-4 mr-2" />
                Multi-business discovery
              </button>
            </div>
          </div>

          {/* Single business mode */}
          {mode === 'single' && (
            <form onSubmit={handleSingleSubmit} className="wl-card p-6 space-y-6">
              <div>
                <label htmlFor="single-url" className="mb-2 block text-sm font-semibold text-foreground">Google Maps place URL</label>
                <div className="relative">
                  <MapPin className={cls('pointer-events-none absolute left-4', frac('top-1', '2'), 'h-5 w-5', frac('-translate-y-1', '2'), 'text-primary')} />
                  <input
                    id="single-url"
                    type="url"
                    required
                    aria-invalid={!!urlError}
                    className="wl-input py-4 pl-12 pr-4 text-base"
                    placeholder="https://maps.google.com/place/Business+Name/@lat,lng,zoom"
                    value={singleUrl}
                    onChange={(e) => { setSingleUrl(e.target.value); setUrlError(null); }}
                    disabled={active}
                  />
                </div>
                {urlError && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive" role="alert">
                    <AlertCircle className="h-3.5 w-3.5" /> {urlError}
                  </p>
                )}
                {singleUrlParsed && (
                  <div className={cls('mt-3 rounded-xl border border-border bg-gradient-to-br from-secondary via-card to-ai', frac('to-ai', '5'), 'p-4')}>
                    <p className="wl-eyebrow">URL analysis</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        <span>Mode: <span className="text-foreground capitalize">{singleUrlParsed.isPlaceUrl ? 'Place URL' : singleUrlParsed.isSearchUrl ? 'Search URL' : 'Unknown'}</span></span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <CheckCircle2 className="h-4 w-4 text-verified" />
                        <span>Coordinates: <span className="text-foreground">{singleUrlParsed.latitude && singleUrlParsed.longitude ? `${singleUrlParsed.latitude.toFixed(6)}, ${singleUrlParsed.longitude.toFixed(6)}` : 'Not found'}</span></span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className="font-medium">Place ID:</span>
                        <span className="text-foreground font-mono text-xs">{singleUrlParsed.placeId || singleUrlParsed.cid || 'Not in URL'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={() => setSingleUrl('')}>
                  Clear
                </Button>
                <Button type="submit" size="lg" disabled={active || !singleUrl.trim()} trailingIcon={active ? undefined : <ArrowRight className="h-4 w-4" />}>
                  {active ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin" />
                      Extracting...
                    </>
                  ) : (
                    'Extract Business'
                  )}
                </Button>
              </div>
            </form>
          )}

          {/* Multi-business mode */}
          {mode === 'multi' && (
            <form onSubmit={handleMultiSubmit} className="wl-card p-6 space-y-6">
              <div>
                <label htmlFor="multi-query" className="mb-2 block text-sm font-semibold text-foreground">Search query</label>
                <input
                  id="multi-query"
                  type="text"
                  required
                  className="wl-input py-3 text-base"
                  placeholder="e.g., dentists, coffee shops, plumbers"
                  value={multiQuery}
                  onChange={(e) => { setMultiQuery(e.target.value); setUrlError(null); }}
                  disabled={active}
                />
              </div>

              <div>
                <label htmlFor="multi-location" className="mb-2 block text-sm font-semibold text-foreground">Location (optional)</label>
                <div className="relative">
                  <MapPin className={cls('pointer-events-none absolute left-4', frac('top-1', '2'), 'h-5 w-5', frac('-translate-y-1', '2'), 'text-muted-foreground')} />
                  <input
                    id="multi-location"
                    type="text"
                    className="wl-input py-3 pl-12 text-base"
                    placeholder="e.g., Berlin, Germany or San Francisco, CA"
                    value={multiLocation}
                    onChange={(e) => setMultiLocation(e.target.value)}
                    disabled={active}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-foreground">Max results</span>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    className="wl-input py-3"
                    value={maxResults}
                    onChange={(e) => setMaxResults(parseInt(e.target.value) || 20)}
                    disabled={active}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-foreground">Depth</span>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    className="wl-input py-3"
                    value={depth}
                    onChange={(e) => setDepth(parseInt(e.target.value) || 1)}
                    disabled={active}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-foreground">Mode</span>
                  <select className="wl-input py-3" value={fastMode ? 'fast' : 'normal'} onChange={(e) => setFastMode(e.target.value === 'fast')} disabled={active}>
                    <option value="normal">Normal (full data)</option>
                    <option value="fast">Fast (basic data)</option>
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" checked={emailExtraction} onChange={(e) => setEmailExtraction(e.target.checked)} disabled={active} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                  Extract emails from websites
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" checked={extraReviews} onChange={(e) => setExtraReviews(e.target.checked)} disabled={active} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                  Collect extra reviews
                </label>
              </div>

              {urlError && (
                <p className="flex items-center gap-1.5 text-sm text-destructive" role="alert">
                  <AlertCircle className="h-3.5 w-3.5" /> {urlError}
                </p>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={() => { setMultiQuery(''); setMultiLocation(''); }}>
                  Clear
                </Button>
                <Button type="submit" size="lg" disabled={active || !multiQuery.trim()} trailingIcon={active ? undefined : <ArrowRight className="h-4 w-4" />}>
                  {active ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin" />
                      Starting discovery...
                    </>
                  ) : (
                    'Start Discovery'
                  )}
                </Button>
              </div>
            </form>
          )}

          {/* Active Job Panel */}
          {currentJob && (
            <div className="wl-card p-6 space-y-4 border-l-4 border-primary">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={cls('flex h-10 w-10 items-center justify-center rounded-xl', frac('bg-primary', '12'), 'text-primary')}>
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="wl-eyebrow">Active extraction</p>
                    <p className="font-semibold text-foreground">
                      {currentJob.queries[0]?.substring(0, 60) || 'Multi-query job'}
                      {currentJob.queries.length > 1 && <span className="ml-2 text-sm text-muted-foreground">+{currentJob.queries.length - 1} more</span>}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip variant={currentJob.status === 'completed' ? 'verified' : currentJob.status === 'failed' ? 'danger' : currentJob.status === 'partial' ? 'warning' : 'default'}>
                    {currentJob.status.toUpperCase()}
                  </Chip>
                  {currentJob.progress > 0 && currentJob.status !== 'completed' && <Chip variant="ai">{currentJob.progress}%</Chip>}
                </div>
              </div>

              <ProgressIndicator 
                steps={SCRAPING_STEPS.map((step, index) => ({
                  ...step,
                  status: index < (stepMap[currentJob.status] ?? 0) ? 'completed' : index === (stepMap[currentJob.status] ?? 0) ? currentJob.status : 'pending' as const
                }))} 
                currentStep={stepMap[currentJob.status] ?? 0} 
                elapsedTime={currentJob?.startedAt ? Math.floor((new Date(currentJob.completedAt || new Date().toISOString()).getTime() - new Date(currentJob.startedAt).getTime()) / 1000) : 0}
                showElapsed={active}
              />

              <div className="grid gap-4 sm:grid-cols-4">
                <div className={cls('rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-primary', frac('to-primary', '5'), 'p-4')}>
                  <p className="wl-eyebrow">Total Places</p>
                  <p className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">{currentJob.totalPlaces}</p>
                </div>
                <div className={cls('rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-verified', frac('to-verified', '5'), 'p-4')}>
                  <p className="wl-eyebrow">Completed</p>
                  <p className="mt-1 font-display text-2xl font-bold tabular-nums text-verified">{currentJob.completedPlaces}</p>
                </div>
                <div className={cls('rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-danger', frac('to-danger', '5'), 'p-4')}>
                  <p className="wl-eyebrow">Failed</p>
                  <p className="mt-1 font-display text-2xl font-bold tabular-nums text-danger">{currentJob.failedPlaces}</p>
                </div>
                <div className={cls('rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-ai', frac('to-ai', '5'), 'p-4')}>
                  <p className="wl-eyebrow">Queries</p>
                  <p className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">{currentJob.queries.length}</p>
                </div>
              </div>

              {currentJob.results?.businesses?.length && (
                <div className={cls('rounded-2xl border border-border bg-gradient-to-br from-secondary via-card', frac('to-verified', '5'), 'p-4')}>
                  <p className="wl-eyebrow">Extracted Businesses ({currentJob.results.totalCount})</p>
                  <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
                    {currentJob.results.businesses.slice(0, 5).map((biz, index) => (
                      <div key={index} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                        <div className={cls('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', frac('bg-verified', '12'), 'text-verified')}>
                          <CheckCircle2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{biz.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{biz.address}</p>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {biz.rating && <span>★ {biz.rating}</span>}
                          {biz.reviewCount && <span>({biz.reviewCount} reviews)</span>}
                        </div>
                      </div>
                    ))}
                    {currentJob.results.businesses.length > 5 && (
                      <p className="mt-2 text-xs text-muted-foreground">+{currentJob.results.businesses.length - 5} more businesses</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-border">
                {active && (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className={cls('inline-flex items-center gap-2 rounded-full border', frac('border-destructive', '25'), 'bg-destructive', frac('bg-destructive', '10'), 'px-4 py-2 text-sm font-medium text-destructive transition hover:bg-destructive', frac('20'))}
                  >
                    <X className="h-4 w-4" />
                    Cancel Job
                  </button>
                )}
                {['completed', 'failed', 'partial'].includes(currentJob.status) && (
                  <button
                    type="button"
                    onClick={() => handleViewResults(currentJob.jobId)}
                    className={cls('inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow-blue transition hover:bg-primary', frac('90'))}
                  >
                    <Eye className="h-4 w-4" />
                    View Results
                  </button>
                )}
                {['failed', 'partial'].includes(currentJob.status) && (
                  <button
                    type="button"
                    onClick={handleRetry}
                    className={cls('inline-flex items-center gap-2 rounded-full border', frac('border-warning', '25'), 'bg-warning', frac('bg-warning', '10'), 'px-4 py-2 text-sm font-medium text-warning-foreground transition hover:bg-warning', frac('20'))}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Retry Job
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar - History & Settings */}
        <aside className="space-y-6">
          {/* Scraper Worker Health */}
          <div className={cls('wl-card p-6 bg-gradient-to-br from-secondary via-card', frac('to-ai', '5'))}>
            <div className="flex items-center gap-3 mb-4">
              <div className={cls('flex h-10 w-10 items-center justify-center rounded-xl', frac('bg-ai', '12'), 'text-ai')}>
                <Settings className="h-5 w-5" />
              </div>
              <div>
                <p className="wl-eyebrow">Scraper worker</p>
                <h3 className="font-semibold text-foreground">Worker status</h3>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Health</span>
                <span className="font-medium text-verified flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-verified" />
                  Healthy
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Version</span>
                <span className="font-mono text-foreground">1.0.0</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Uptime</span>
                <span className="font-mono text-foreground">2h 34m</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Queue depth</span>
                <span className="font-mono text-foreground">0 jobs</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Active jobs</span>
                <span className="font-mono text-foreground">0</span>
              </div>
            </div>
          </div>

          {/* Job History */}
          <div className="wl-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Recent extractions</h3>
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className={cls('text-sm font-medium text-primary hover:text-primary', frac('80'))}
              >
                {showHistory ? 'Hide' : 'Show'} history
              </button>
            </div>
            {showHistory ? (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {jobHistoryList}
              </div>
            ) : null}
          </div>

          {/* Quick Actions */}
          <div className="wl-card p-6 space-y-3">
            <h3 className="font-semibold text-foreground">Quick actions</h3>
            <Link to="/leads/new">
              <Button variant="secondary" className="w-full justify-start" leadingIcon={<Plus className="h-4 w-4" />}>
                New lead analysis
              </Button>
            </Link>
            <Link to="/websites">
              <Button variant="secondary" className="w-full justify-start" leadingIcon={<Globe2 className="h-4 w-4" />}>
                Generate website
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button variant="secondary" className="w-full justify-start" leadingIcon={<Sparkles className="h-4 w-4" />}>
                View dashboard
              </Button>
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

const stepMap: Record<string, number> = {
  pending: 0, queued: 1, scraping: 2, normalizing: 3, enriching: 4, completed: 5, failed: 5, partial: 5, cancelled: 5, retrying: 1
};