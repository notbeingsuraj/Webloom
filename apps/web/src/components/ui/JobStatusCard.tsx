import * as React from "react";
import { cn } from "../../lib/utils";
import { Loader, CheckCircle2, AlertCircle, Clock, XCircle, ExternalLink, RefreshCw } from "lucide-react";
import { ProgressIndicator, ProgressStep } from "./ProgressIndicator";
import { Chip } from "./Chip";

export interface ScrapingJob {
  jobId: string;
  status: 'pending' | 'queued' | 'scraping' | 'normalizing' | 'enriching' | 'completed' | 'failed' | 'partial' | 'cancelled' | 'retrying';
  queries: string[];
  progress: number;
  totalPlaces: number;
  completedPlaces: number;
  failedPlaces: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  results?: {
    businesses: Array<{
      name: string;
      placeId?: string;
      address?: string;
      phone?: string;
      website?: string;
      rating?: number;
      reviewCount?: number;
    }>;
    totalCount: number;
  };
}

interface JobStatusCardProps {
  job: ScrapingJob;
  onCancel?: (jobId: string) => void;
  onRetry?: (jobId: string) => void;
  onViewResults?: (jobId: string) => void;
  className?: string;
}

const SCRAPING_STEPS: ProgressStep[] = [
  { label: 'Initializing job', duration: 1000 },
  { label: 'Connecting to scraper worker', duration: 2000 },
  { label: 'Submitting scrape queries', duration: 3000 },
  { label: 'Scraping Google Maps', duration: 30000 },
  { label: 'Normalizing results', duration: 5000 },
  { label: 'Enriching business data', duration: 10000 },
  { label: 'Finalizing', duration: 2000 },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending: { label: 'PENDING', color: 'text-muted-foreground', bg: 'bg-secondary', icon: <Clock className="h-3.5 w-3.5" /> },
  queued: { label: 'QUEUED', color: 'text-primary', bg: 'bg-primary/10', icon: <Loader className="h-3.5 w-3.5 animate-spin" /> },
  scraping: { label: 'SCRAPING', color: 'text-primary', bg: 'bg-primary/10', icon: <Loader className="h-3.5 w-3.5 animate-spin" /> },
  normalizing: { label: 'NORMALIZING', color: 'text-ai', bg: 'bg-ai/10', icon: <Loader className="h-3.5 w-3.5 animate-spin" /> },
  enriching: { label: 'ENRICHING', color: 'text-opportunity', bg: 'bg-opportunity/10', icon: <Loader className="h-3.5 w-3.5 animate-spin" /> },
  completed: { label: 'COMPLETED', color: 'text-verified', bg: 'bg-verified/10', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  failed: { label: 'FAILED', color: 'text-danger', bg: 'bg-danger/10', icon: <AlertCircle className="h-3.5 w-3.5" /> },
  partial: { label: 'PARTIAL', color: 'text-warning-foreground', bg: 'bg-warning/10', icon: <AlertCircle className="h-3.5 w-3.5" /> },
  cancelled: { label: 'CANCELLED', color: 'text-muted-foreground', bg: 'bg-secondary', icon: <XCircle className="h-3.5 w-3.5" /> },
  retrying: { label: 'RETRYING', color: 'text-warning-foreground', bg: 'bg-warning/10', icon: <Loader className="h-3.5 w-3.5 animate-spin" /> },
};

export function JobStatusCard({ 
  job, 
  onCancel, 
  onRetry, 
  onViewResults,
  className 
}: JobStatusCardProps) {
  const config = STATUS_CONFIG[job.status] || STATUS_CONFIG.pending;
  const isTerminal = ['completed', 'failed', 'partial', 'cancelled'].includes(job.status);
  const isActive = ['queued', 'scraping', 'normalizing', 'enriching'].includes(job.status);
  const isRetryable = ['failed', 'partial'].includes(job.status);

  // Calculate current step based on status
  const stepMap: Record<string, number> = {
    pending: 0,
    queued: 1,
    scraping: 2,
    normalizing: 3,
    enriching: 4,
    completed: 5,
    failed: 5,
    partial: 5,
    cancelled: 5,
    retrying: 1,
  };
  const currentStep = stepMap[job.status] ?? 0;

  const steps = active ? SCRAPING_STEPS.map((step, index) => ({
    ...step,
    status: index < currentStep ? 'completed' : index === currentStep ? job.status : 'pending' as const
  })) : SCRAPING_STEPS;

  const elapsedSeconds = job.startedAt 
    ? Math.floor((new Date(job.completedAt || new Date().toISOString()).getTime() - new Date(job.startedAt).getTime()) / 1000)
    : 0;

  const formatTime = (dateString?: string) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className={cn('wl-card p-6 space-y-6', className)}>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/12 to-ai/10 text-primary">
            <span className="font-display text-base font-bold">S</span>
          </div>
          <div>
            <p className="wl-eyebrow">Scraping Job</p>
            <p className="font-display text-lg font-bold tracking-[-0.04em] text-foreground">
              {job.queries[0]?.substring(0, 60) || 'Multi-query job'}
              {job.queries.length > 1 && <span className="ml-2 text-sm text-muted-foreground">+{job.queries.length - 1} more</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip variant={job.status === 'completed' ? 'verified' : job.status === 'failed' ? 'danger' : job.status === 'partial' ? 'warning' : 'default'}>
            {config.icon}
            {config.label}
          </Chip>
          {job.progress > 0 && job.status !== 'completed' && (
            <Chip variant="ai">{job.progress}%</Chip>
          )}
        </div>
      </div>

      {/* Progress Indicator */}
      <ProgressIndicator 
        steps={steps} 
        currentStep={currentStep} 
        elapsedTime={elapsedSeconds}
        showElapsed={active}
      />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-primary/5 p-4">
          <p className="wl-eyebrow">Total Places</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">{job.totalPlaces}</p>
        </div>
        <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-verified/5 p-4">
          <p className="wl-eyebrow">Completed</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-verified">{job.completedPlaces}</p>
        </div>
        <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-danger/5 p-4">
          <p className="wl-eyebrow">Failed</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-danger">{job.failedPlaces}</p>
        </div>
        <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-ai/5 p-4">
          <p className="wl-eyebrow">Queries</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">{job.queries.length}</p>
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-secondary/50 p-4 space-y-3">
        <p className="wl-eyebrow">Timeline</p>
        <div className="space-y-2 text-sm">
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

      {/* Error Display */}
      {job.error && (
        <div className="rounded-xl border border-danger/25 bg-danger/5 p-4" role="alert">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 shrink-0 text-danger mt-0.5" />
            <div>
              <p className="font-medium text-danger">Error</p>
              <p className="mt-1 text-sm text-danger/80">{job.error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Results Preview */}
      {job.results?.businesses?.length && (
        <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-verified/5 p-4">
          <p className="wl-eyebrow">Extracted Businesses ({job.results.totalCount})</p>
          <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
            {job.results.businesses.slice(0, 5).map((biz, index) => (
              <div key={index} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-verified/12 text-verified">
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
            {job.results.businesses.length > 5 && (
              <p className="mt-2 text-xs text-muted-foreground">+{job.results.businesses.length - 5} more businesses</p>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-border">
        {isActive && onCancel && (
          <button
            type="button"
            onClick={() => onCancel?.(job.jobId)}
            className="inline-flex items-center gap-2 rounded-full border border-destructive/25 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/20"
          >
            <XCircle className="h-4 w-4" />
            Cancel Job
          </button>
        )}
        {isRetryable && onRetry && (
          <button
            type="button"
            onClick={() => onRetry?.(job.jobId)}
            className="inline-flex items-center gap-2 rounded-full border border-warning/25 bg-warning/10 px-4 py-2 text-sm font-medium text-warning-foreground transition hover:bg-warning/20"
          >
            <RefreshCw className="h-4 w-4" />
            Retry Job
          </button>
        )}
        {job.status === 'completed' && onViewResults && (
          <button
            type="button"
            onClick={() => onViewResults?.(job.jobId)}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow-blue transition hover:bg-primary/90"
          >
            <ExternalLink className="h-4 w-4" />
            View Results
          </button>
        )}
      </div>
    </div>
  );
}

export default JobStatusCard;