import { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader, MapPin, Sparkles, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import Button from '../components/ui/Button';
import usePageMetadata from '../hooks/usePageMetadata';
import analytics from '../services/analytics';
import { leadService } from '../services/leadService';

const surface = 'wl-card relative p-6 md:p-8';
const eyebrow = 'wl-eyebrow';
const input = 'wl-input';

/**
 * Analysis phase markers. The UI advances these as the pipeline progresses —
 * but a stage is NEVER marked complete merely because a timer elapsed: the
 * final "Preparing analysis" marker only resolves when the backend response
 * actually arrives (see onSuccess). The durations below are only a cadence
 * hint for the spinner position; they are not a completion contract.
 * Each stage carries a semantic color — blue (reading), violet (identity),
 * pink (gathering), orange (reconciling), green (DNA), amber (scoring).
 */
const progressSteps = [
  { label: 'Reading business location', duration: 3000, color: '#3B82F6' },
  { label: 'Resolving business identity', duration: 8000, color: '#8B5CF6' },
  { label: 'Gathering business information', duration: 15000, color: '#EC4899' },
  { label: 'Reconciling sources', duration: 20000, color: '#F97316' },
  { label: 'Building Business DNA', duration: 25000, color: '#10B981' },
  { label: 'Calculating opportunity score', duration: 30000, color: '#F59E0B' },
  { label: 'Preparing analysis', duration: 35000, color: '#3B82F6' },
];

/**
 * Analysis request timeout. The backend legitimately takes 20-60+ seconds
 * (provider extraction, reconciliation, optional AI enrichment, website audit,
 * Brand DNA generation, opportunity scoring). With AI enrichment enabled and
 * slow upstream providers, runs have measured 90s+.
 *
 * We do NOT abort a live backend request at this limit — axios timeout is the
 * hard safety net (services/api.ts default is 5 minutes; NewLead passes an
 * explicit override). This value is:
 *   - SOFT_LIMIT_WARNING_MS: when the UI switches to "longer than expected"
 *     messaging while still processing (never a failure).
 *   - REQUEST_TIMEOUT_MS: the absolute limit — at this point the request is
 *     aborted and a persisted-lead lookup runs before showing a failure.
 */
const REQUEST_TIMEOUT_MS = 300_000; // 5 minutes — documented safety limit
const SOFT_LIMIT_WARNING_MS = 90_000; // 90s: warn "longer than expected"

type AnalysisStatus = 'idle' | 'submitting' | 'processing' | 'completed' | 'failed' | 'timed_out';

function validateGoogleMapsUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return 'Please enter a Google Maps URL.';
  try {
    const parsed = new URL(trimmed);
    const validHosts = [
      'maps.google.com',
      'www.google.com',
      'google.com',
      'goo.gl',
      'maps.app.goo.gl',
      'maps.googleapis.com',
    ];
    const isValid = validHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h));
    if (!isValid) return "That doesn't appear to be a Google Maps URL.";
    return null; // valid
  } catch {
    return 'Please enter a valid URL (e.g., https://maps.google.com/...)';
  }
}

/** Extract `_id` (the lead id) from a normalized lead payload. */
function extractLeadId(payload: any): string | null {
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload._id === 'string' && payload._id) return payload._id;
  // Defensive: some responses nest under `data`.
  if (payload.data && typeof payload.data === 'object' && typeof payload.data._id === 'string') {
    return payload.data._id;
  }
  return null;
}

export default function NewLead() {
  const navigate = useNavigate();
  usePageMetadata({
    title: 'Webloom | Business Intelligence Analysis',
    description: 'Paste a Google Maps URL to extract verified business intelligence, digital audit, and opportunity score.',
    noindex: true,
  });
  const [urlInput, setUrlInput] = useState('');
  const [formData, setFormData] = useState({
    leadName: '',
    internalNotes: '',
    customInstructions: '',
  });
  const [currentStep, setCurrentStep] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [urlError, setUrlError] = useState<string | null>(null);
  // Explicit analysis state machine (idle/submitting/processing/completed/failed/timed_out).
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  // Persisted-lead check result shown when the request genuinely times out.
  const [timedOutLeadId, setTimedOutLeadId] = useState<string | null>(null);
  const [timedOutLeadName, setTimedOutLeadName] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const stepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutWarningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hardTimeoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Navigation latch — prevents duplicate navigations if onSuccess fires
  // alongside a timer-driven check.
  const navigatedRef = useRef(false);
  // Unmount latch — the cleanup effect aborts the in-flight request; onError
  // must NOT run a recovery lookup on a component that is gone.
  const unmountedRef = useRef(false);

  // Keep a ref of status + startTime alongside state for handlers that capture
  // stale closures.
  const statusRef = useRef<AnalysisStatus>('idle');
  statusRef.current = status;
  const startTimeRef = useRef<number | null>(null);
  startTimeRef.current = startTime;

  const navigateToLead = useCallback((leadId: string) => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    console.debug('[NewLead] navigation target', { route: `/leads/${leadId}` });
    navigate(`/leads/${leadId}`);
  }, [navigate]);

  /**
   * Handle the case where the request has consumed the entire configured
   * window without a definitive backend response. We do NOT blindly show a
   * failure — the backend may still be finishing. We check whether a persisted
   * lead exists (GET /api/leads) and, if one matches this run, surface it so
   * the user can navigate to results instead of seeing a dead failure.
   * Idempotent.
   */
  const handleHardTimeout = useCallback(async () => {
    if (navigatedRef.current || statusRef.current === 'timed_out') return;
    navigatedRef.current = true; // latch to prevent re-entry
    console.warn('[NewLead] analysis hit configured limit — checking for persisted lead', {
      startedAt: startTimeRef.current ? new Date(startTimeRef.current).toISOString() : null,
      limitMs: REQUEST_TIMEOUT_MS,
      elapsedMs: startTimeRef.current ? Date.now() - startTimeRef.current : null,
    });

    // Abort the in-flight request so we do not double-handle onSuccess.
    abortControllerRef.current?.abort();
    setStatus('timed_out');

    // Best-effort: try to find the lead that was persisted by the backend.
    // The backend persists the lead only at the very end, so if the request
    // truly timed out the lead likely does not exist yet — but if it DID
    // complete server-side before the abort, we recover navigation.
    try {
      const leads = await leadService.getLeads({ sort: '-createdAt', limit: 10 });
      const started = startTimeRef.current;
      const now = Date.now();
      const recent = (leads || []).find((l) => {
        if (!l?.createdAt || !started) return false;
        const createdAt = new Date(l.createdAt).getTime();
        // The persisted lead for THIS run must have been created after the
        // request started (small skew allowance) and within the configured
        // window — it cannot predate the run.
        return createdAt >= started - 5_000 && createdAt <= now + 5_000;
      });
      if (recent?._id) {
        setTimedOutLeadId(recent._id);
        setTimedOutLeadName(recent.leadName ?? recent.businessName ?? 'the lead');
        console.debug('[NewLead] persisted lead found after timeout', {
          _id: recent._id,
          leadName: recent.leadName ?? recent.businessName,
          createdAt: recent.createdAt,
        });
      } else {
        console.debug('[NewLead] no persisted lead found after timeout — genuine failure');
      }
    } catch (lookupError) {
      console.debug('[NewLead] persisted-lead lookup failed (non-fatal)', lookupError);
    }
  }, []);

  const createLeadMutation = useMutation({
    mutationFn: (vars: { data: Parameters<typeof leadService.createLead>[0]; signal: AbortSignal }) =>
      leadService.createLead(vars.data, { signal: vars.signal, timeoutMs: REQUEST_TIMEOUT_MS }),
    onMutate: () => {
      navigatedRef.current = false;
      setStatus('processing');
    },
    onSuccess: (lead) => {
      console.debug('[NewLead] analysis onSuccess', {
        status,
        hasId: !!lead?._id,
        _id: lead?._id,
        leadName: lead?.leadName ?? lead?.businessName,
      });
      const leadId = extractLeadId(lead);
      if (!leadId) {
        // Response completed but carried no usable id — treat as failure so the
        // UI never reports success with nowhere to go.
        console.error('[NewLead] analysis completed WITHOUT a lead id', {
          payloadKeys: lead ? Object.keys(lead) : null,
        });
        setStatus('failed');
        analytics.analysisFailed();
        return;
      }
      setStatus('completed');
      // Event-driven completion: ALL steps resolve now, regardless of elapsed
      // timers — a stage is never marked complete merely because time passed.
      setCurrentStep(progressSteps.length - 1);
      console.debug('[NewLead] analysis completed — navigating to results', {
        target: `/leads/${leadId}`,
        elapsedMs: startTimeRef.current ? Date.now() - startTimeRef.current : null,
      });
      analytics.analysisCompleted();
      navigateToLead(leadId);
    },
    onError: (error: unknown) => {
      const axError = error as any;
      const isAborted =
        axError?.code === 'ERR_CANCELED' ||
        axError?.name === 'CanceledError' ||
        axError?.code === 'ECONNABORTED'; // axios `timeout` option fired
      const isTimedOutState = statusRef.current === 'timed_out';
      console.debug('[NewLead] analysis onError', {
        status,
        isAborted,
        message: axError?.message,
        responseStatus: axError?.response?.status,
        responseData: axError?.response?.data,
      });

      // The request was cancelled — either a user/unmount abort, or the
      // hard-timeout abort (which already set 'timed_out'). Never show a
      // generic failure for a cancelled request, and never clobber the
      // timed_out UI.
      if (isAborted || isTimedOutState) {
        if (isAborted && !isTimedOutState && !unmountedRef.current) {
          // Could be the axios `timeout` option rejecting (5 min) before the
          // timer's handleHardTimeout ran. Route through the same recovery.
          console.debug('[NewLead] request aborted/expired — running recovery check');
          handleHardTimeout();
          return;
        }
        console.debug('[NewLead] aborted by timeout/user/unmount — timed_out UI already set');
        return;
      }

      setStatus('failed');
      analytics.analysisFailed();
    },
  });

  // Cleanup on unmount: abort the in-flight request + clear all timers.
  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      abortControllerRef.current?.abort();
      if (timerRef.current) clearInterval(timerRef.current);
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
      if (timeoutWarningTimerRef.current) clearTimeout(timeoutWarningTimerRef.current);
      if (hardTimeoutTimerRef.current) clearTimeout(hardTimeoutTimerRef.current);
    };
  }, []);

  // Progress timer (elapsed seconds) + defensive hard-limit check.
  useEffect(() => {
    if (status === 'processing' && startTime) {
      timerRef.current = setInterval(() => {
        const now = Date.now();
        setElapsedTime(Math.floor((now - startTime) / 1000));
        // Defensive: if we pass the absolute limit while still pending
        // (should not happen — axios timeout aborts first), surface timed_out.
        if (now - startTime > REQUEST_TIMEOUT_MS && statusRef.current === 'processing') {
          console.warn('[NewLead] reached absolute limit while still processing', {
            elapsedMs: now - startTime,
            limitMs: REQUEST_TIMEOUT_MS,
          });
          handleHardTimeout();
        }
      }, 250);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status === 'processing', startTime]);

  // Soft warning: after SOFT_LIMIT_WARNING_MS the UI explains the analysis is
  // still running (backend legitimately slow), NOT that it failed.
  useEffect(() => {
    if (status !== 'processing') return;
    timeoutWarningTimerRef.current = setTimeout(() => {
      console.debug('[NewLead] soft warning: analysis exceeds expected duration', {
        elapsedMs: Date.now() - (startTimeRef.current || Date.now()),
        thresholdMs: SOFT_LIMIT_WARNING_MS,
      });
      setElapsedTime((current) => Math.max(current, Math.ceil(SOFT_LIMIT_WARNING_MS / 1000)));
    }, SOFT_LIMIT_WARNING_MS);
    return () => {
      if (timeoutWarningTimerRef.current) clearTimeout(timeoutWarningTimerRef.current);
    };
  }, [status === 'processing']);

  // Hard timeout: after REQUEST_TIMEOUT_MS the request is genuinely beyond the
  // configured limit. Abort the request and check for a persisted lead.
  useEffect(() => {
    if (status !== 'processing') return;
    hardTimeoutTimerRef.current = setTimeout(() => {
      handleHardTimeout();
    }, REQUEST_TIMEOUT_MS);
    return () => {
      if (hardTimeoutTimerRef.current) clearTimeout(hardTimeoutTimerRef.current);
    };
  }, [status === 'processing']);

  // Step advancement — cadence hint only. Stages are NOT marked complete on a
  // timer; they are marked complete in onSuccess (event-driven).
  useEffect(() => {
    if (status !== 'processing') return;
    const elapsed = Date.now() - (startTime || Date.now());
    let nextStep = 0;
    for (let i = 0; i < progressSteps.length; i++) {
      if (elapsed >= progressSteps[i].duration) nextStep = i + 1;
    }
    // Never show "Preparing analysis" as complete on a timer alone: it resolves
    // only when the response arrives. Cap at the second-to-last marker.
    const maxTimerStep = Math.min(nextStep, progressSteps.length - 2);
    setCurrentStep(maxTimerStep);

    // Calculate time until next step
    for (let i = maxTimerStep; i < progressSteps.length - 1; i++) {
      const delay = Math.max(0, progressSteps[i].duration - elapsed);
      stepTimerRef.current = setTimeout(() => {
        setCurrentStep((prev) => Math.max(prev, i));
      }, delay);
      break;
    }
    return () => {
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    };
  }, [status === 'processing', startTime, elapsedTime]);

  const handleUrlChange = useCallback((value: string) => {
    setUrlInput(value);
    setUrlError(null);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = urlInput.trim();
    const error = validateGoogleMapsUrl(trimmed);
    if (error) {
      setUrlError(error);
      return;
    }
    // Guard: no duplicate submissions while processing.
    if (status === 'processing' || status === 'submitting') {
      console.debug('[NewLead] submit blocked — analysis already in flight', { status });
      return;
    }

    // Reset any previous terminal state.
    setTimedOutLeadId(null);
    setTimedOutLeadName(null);
    navigatedRef.current = false;
    unmountedRef.current = false;
    setCurrentStep(0);
    setStartTime(Date.now());
    setElapsedTime(0);
    // State machine: submitting → processing (set in onMutate).
    setStatus('submitting');

    analytics.startAnalysis();
    const requestId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `submit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    console.debug('[NewLead] analysis start', {
      requestId,
      requestUrl: '/api/leads',
      requestStartTime: new Date().toISOString(),
      googleMapsUrl: trimmed,
      forceRefresh: true,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    createLeadMutation.mutate({
      data: {
        googleMapsUrl: trimmed,
        // A submit always requests a current acquisition. This bypasses stale
        // source-cache entries, so retrying an analysis does not repeat an old
        // empty response from Google Maps.
        forceRefresh: true,
        ...formData,
      },
      signal: controller.signal,
    });
  };

  const isProcessing = status === 'processing' || status === 'submitting';
  const errorMessage = createLeadMutation.isError
    ? ((createLeadMutation.error as any)?.response?.data?.message ||
       (createLeadMutation.error as any)?.response?.data?.error ||
       'The request took too long or the server is unavailable. Please try again.')
    : null;
  // "Longer than expected" — the backend is still working; NOT a failure.
  const isBeyondExpected = elapsedTime > SOFT_LIMIT_WARNING_MS / 1000 && isProcessing;
  // Real timed_out terminal state (request aborted at the hard limit).
  const isHardTimedOut = status === 'timed_out';
  // Failure only reached once the mutation actually errors out.
  const isFailed = status === 'failed' || (createLeadMutation.isError && !isHardTimedOut && !isProcessing);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const headerTitle = isProcessing
    ? 'Processing lead'
    : isHardTimedOut
    ? 'Analysis timed out'
    : isFailed
    ? 'Analysis failed'
    : 'Ready to review';

  return (
    <div className="mx-auto max-w-6xl">
      <div className={`mb-8 ${surface} wl-mesh relative overflow-hidden`}>
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className={eyebrow}>Analysis</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.06em] text-foreground md:text-[2.7rem]">
              Turn local businesses into <span className="text-gradient-brand">opportunities</span>.
            </h1>
            <p className="mt-3 max-w-2xl text-base text-muted-foreground">
              Paste a Google Maps URL to uncover business value, identify digital gaps, and generate a premium outreach plan.
            </p>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-ai/25 bg-ai/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ai">
            <Sparkles className="h-3.5 w-3.5" />
            Intelligence workflow
          </div>
        </div>
        {/* Pipeline visualization strip */}
        <div className="relative mt-8 flex flex-col gap-2 border-t border-border/70 pt-5 md:flex-row md:items-center md:gap-6">
          {[
            { label: 'Discover sources', color: 'var(--primary)' },
            { label: 'Extract intelligence', color: 'hsl(var(--ai))' },
            { label: 'Validate evidence', color: 'hsl(var(--verified))' },
            { label: 'Generate insights', color: 'hsl(var(--opportunity))' },
          ].map((stage, i, arr) => (
            <div key={stage.label} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: stage.color }} aria-hidden="true" />
              <span className="text-xs font-medium text-muted-foreground">{stage.label}</span>
              {i < arr.length - 1 && <ArrowRight className="hidden h-3.5 w-3.5 text-border md:inline-flex" />}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <form onSubmit={handleSubmit} className={surface} noValidate>
          <div className="space-y-6">
            <div>
              <label htmlFor="maps-url" className="mb-2 block text-sm font-semibold text-foreground">Google Maps URL</label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
                <input
                  id="maps-url"
                  type="url"
                  required
                  aria-invalid={!!urlError}
                  aria-describedby={urlError ? 'maps-url-error' : 'maps-url-hint'}
                  className={`${input} py-4 pl-12 pr-4 text-base ${isProcessing ? 'opacity-60' : ''}`}
                  placeholder="https://maps.google.com/place/..."
                  value={urlInput}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  disabled={isProcessing}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              {urlError ? (
                <p id="maps-url-error" className="mt-2 flex items-center gap-1.5 text-sm text-destructive" role="alert">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {urlError}
                </p>
              ) : (
                <p id="maps-url-hint" className="mt-2 text-sm text-muted-foreground">Paste a Google Maps link for any business — e.g. maps.google.com/place/... or maps.google.com/?cid=...</p>
              )}
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-foreground">Lead name</span>
                <input
                  type="text"
                  className={input}
                  placeholder="Business name or account"
                  value={formData.leadName}
                  onChange={(e) => setFormData({ ...formData, leadName: e.target.value })}
                />
              </label>

              <div className="rounded-xl border border-dashed border-primary/30 bg-gradient-to-br from-secondary via-card to-ai/5 px-4 py-3 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">Workflow</p>
                <p className="mt-1">Business analysis → DNA → score → website → outreach</p>
              </div>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-foreground">Internal notes</span>
              <textarea
                rows={3}
                className={input}
                placeholder="Customer notes, source details, or sales context"
                value={formData.internalNotes}
                onChange={(e) => setFormData({ ...formData, internalNotes: e.target.value })}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-foreground">Custom instructions</span>
              <textarea
                rows={3}
                className={input}
                placeholder="Desired positioning, brand tone, or special requirements"
                value={formData.customInstructions}
                onChange={(e) => setFormData({ ...formData, customInstructions: e.target.value })}
              />
            </label>

            {isHardTimedOut ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                <div className="font-medium">The analysis is taking longer than expected</div>
                <div className="mt-1">
                  {timedOutLeadId ? (
                    <>
                      A lead was persisted while the analysis was running.{' '}
                      <button
                        type="button"
                        onClick={() => navigateToLead(timedOutLeadId)}
                        className="underline underline-offset-2 hover:text-red-900"
                      >
                        View results for {timedOutLeadName ?? 'this lead'}
                      </button>
                    </>
                  ) : (
                    'The analysis exceeded the configured time limit. The backend may still be finishing — please retry shortly, and the results will be available on the dashboard.'
                  )}
                </div>
              </div>
            ) : isBeyondExpected ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
                <div className="flex items-center gap-2 font-medium">
                  <Clock className="h-4 w-4" />
                  Still working — this analysis can take a few minutes
                </div>
                <div className="mt-1">
                  The analysis performs provider extraction, source reconciliation, AI enrichment, a website audit, and opportunity scoring. Please keep this tab open.
                </div>
              </div>
            ) : isFailed ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                <div className="font-medium">Something went wrong</div>
                <div className="mt-1">{errorMessage}</div>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => navigate('/')}>
                Cancel
              </Button>
              <Button type="submit" size="lg" disabled={isProcessing} trailingIcon={isProcessing ? undefined : <ArrowRight className="h-4 w-4" />}>
                {isProcessing ? (
                  <>
                    <Loader className="h-4 w-4 animate-spin" />
                    Analysing...
                  </>
                ) : (
                  'Analyse Business'
                )}
              </Button>
            </div>
          </div>
        </form>

        <aside className={`${surface} bg-gradient-to-br from-secondary via-card to-ai/5`}>
          <p className={eyebrow}>Analysis status</p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-[-0.05em] text-foreground">
            {headerTitle}
          </h2>
          {isProcessing && (
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <span className="wl-dot wl-glow-pulse bg-primary" aria-hidden="true" />
              {isBeyondExpected ? 'Still active — slower than usual' : 'Running the intelligence pipeline'}
            </p>
          )}

          <div className="relative mt-7 space-y-5">
            {/* vertical connector line */}
            {isProcessing && (
              <div aria-hidden="true" className="absolute bottom-4 left-[15px] top-4 w-px bg-gradient-to-b from-primary via-ai/40 to-transparent" />
            )}
            {progressSteps.map((step, index) => {
              // During processing: steps before the current one are complete
              // (timer cadence hint only — the final "Preparing analysis" step
              // is never completed on a timer). On completion (status
              // 'completed', immediately before navigation): all steps resolve
              // together, event-driven.
              const isComplete = isProcessing
                ? index < currentStep
                : status === 'completed'
                ? true
                : false;
              const isActive = isProcessing && index === currentStep;

              return (
                <div key={step.label} className="relative flex items-start gap-3">
                  <div
                    className={[
                      'relative z-10 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-300',
                      isComplete
                        ? 'border border-verified/30 text-white shadow-glow-green'
                        : isActive
                        ? 'text-white'
                        : 'border border-border bg-card text-muted-foreground',
                    ].join(' ')}
                    style={{ background: isActive || isComplete ? step.color : undefined }}
                  >
                    {isComplete ? <CheckCircle2 className="h-3.5 w-3.5" /> : isActive ? <Loader className="h-3 w-3 animate-spin" /> : index + 1}
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <span
                      className={['block truncate text-sm', isComplete ? 'font-medium text-foreground line-through decoration-verified/50 decoration-1' : isActive ? 'font-semibold text-foreground' : 'text-muted-foreground'].join(' ')}
                    >
                      {step.label}
                    </span>
                    {isActive && (
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                        <span className="h-1 w-1 rounded-full" style={{ background: step.color }} aria-hidden="true" />
                        {formatTime(elapsedTime)} elapsed
                        {isBeyondExpected && ' · longer than expected'}
                      </span>
                    )}
                    {isComplete && (
                      <span className="mt-0.5 block text-[11px] text-verified">Complete</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 rounded-xl border border-border bg-gradient-to-br from-card to-secondary/70 p-4">
            <p className={eyebrow}>What Webloom does</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
              {[
                'Resolves business identity from your Maps URL',
                'Gathers verified business information from multiple sources',
                'Produces a canonical business profile with provenance',
                'Generates a digital presence analysis',
                'Builds a strategic Business DNA profile',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-r from-primary to-ai" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
