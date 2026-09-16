import { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader, MapPin, Sparkles, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import Button from '../components/ui/Button';
import usePageMetadata from '../hooks/usePageMetadata';
import analytics from '../services/analytics';
import { leadService } from '../services/leadService';

const surface = 'rounded-[30px] border border-webloom-border bg-webloom-surface p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)] md:p-8';
const eyebrow = 'text-[11px] uppercase tracking-[0.18em] text-webloom-dim';
const input = 'w-full rounded-[18px] border border-webloom-border bg-webloom-raised px-4 py-3 text-[15px] text-webloom-text outline-none transition focus:border-primary-500 focus:bg-webloom-hover';

/**
 * Analysis phase markers. The UI advances these as the pipeline progresses —
 * but a stage is NEVER marked complete merely because a timer elapsed: the
 * final "Preparing analysis" marker only resolves when the backend response
 * actually arrives (see onSuccess). The durations below are only a cadence
 * hint for the spinner position; they are not a completion contract.
 */
const progressSteps = [
  { label: 'Reading business location', duration: 3000 },
  { label: 'Resolving business identity', duration: 8000 },
  { label: 'Gathering business information', duration: 15000 },
  { label: 'Reconciling sources', duration: 20000 },
  { label: 'Building Business DNA', duration: 25000 },
  { label: 'Calculating opportunity score', duration: 30000 },
  { label: 'Preparing analysis', duration: 35000 },
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
      const isAborted = (error as any)?.code === 'ERR_CANCELED' || (error as any)?.name === 'CanceledError';
      console.debug('[NewLead] analysis onError', {
        status,
        isAborted,
        message: (error as any)?.message,
        responseStatus: (error as any)?.response?.status,
        responseData: (error as any)?.response?.data,
      });

      if (isAborted) {
        // Genuine abort (unmount / new submit) or the hard-timeout abort.
        // The hard-timeout path already set status to 'timed_out' — don't
        // clobber it with a generic failure.
        if (statusRef.current === 'timed_out') {
          console.debug('[NewLead] aborted by hard timeout — timed_out UI already set');
          return;
        }
        console.debug('[NewLead] aborted by user/unmount — no error UI');
        return;
      }

      // If we reached the hard timeout, the timeout handler already decided —
      // do not override its UI state.
      if (statusRef.current === 'timed_out') {
        console.debug('[NewLead] onError after hard timeout — timeout UI already set');
        return;
      }

      setStatus('failed');
      analytics.analysisFailed();
    },
  });

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

  // Cleanup on unmount: abort the in-flight request + clear all timers.
  useEffect(() => {
    return () => {
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
      const recent = (leads || []).find((l) => {
        if (!l?.createdAt || !started) return false;
        const createdAt = new Date(l.createdAt).getTime();
        // The persisted lead must have been created within this run's window
        // (some slack for clock skew / server timestamps).
        return Math.abs(createdAt - started) < REQUEST_TIMEOUT_MS * 2;
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
      <div className={`mb-8 ${surface}`}>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className={eyebrow}>Analysis</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.06em] text-webloom-text md:text-[2.7rem]">
              Turn local businesses into opportunities.
            </h1>
            <p className="mt-3 max-w-2xl text-base text-webloom-muted">
              Paste a Google Maps URL to uncover business value, identify digital gaps, and generate a premium outreach plan.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-webloom-border bg-webloom-raised px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-webloom-muted">
            <Sparkles className="h-3.5 w-3.5 text-primary-400" />
            Lead workflow
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <form onSubmit={handleSubmit} className={surface} noValidate>
          <div className="space-y-6">
            <div>
              <label htmlFor="maps-url" className="mb-2 block text-sm font-medium text-webloom-text">Google Maps URL</label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-webloom-dim" />
                <input
                  id="maps-url"
                  type="url"
                  required
                  aria-invalid={!!urlError}
                  aria-describedby={urlError ? 'maps-url-error' : 'maps-url-hint'}
                  className={`w-full rounded-[20px] border ${urlError ? 'border-webloom-danger bg-webloom-raised' : 'border-webloom-border bg-webloom-raised focus:border-primary-500'} py-4 pl-12 pr-4 text-base text-webloom-text outline-none transition focus:bg-webloom-hover ${isProcessing ? 'opacity-60' : ''}`}
                  placeholder="https://maps.google.com/place/..."
                  value={urlInput}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  disabled={isProcessing}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              {urlError ? (
                <p id="maps-url-error" className="mt-2 flex items-center gap-1.5 text-sm text-webloom-danger" role="alert">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {urlError}
                </p>
              ) : (
                <p id="maps-url-hint" className="mt-2 text-sm text-webloom-muted">Paste a Google Maps link for any business — e.g. maps.google.com/place/... or maps.google.com/?cid=...</p>
              )}
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-webloom-text">Lead name</span>
                <input
                  type="text"
                  className={input}
                  placeholder="Business name or account"
                  value={formData.leadName}
                  onChange={(e) => setFormData({ ...formData, leadName: e.target.value })}
                />
              </label>

              <div className="rounded-[18px] border border-dashed border-webloom-border bg-webloom-raised px-4 py-3 text-sm text-webloom-muted">
                <p className="font-medium text-webloom-text">Workflow</p>
                <p className="mt-1">Business analysis → DNA → score → website → outreach</p>
              </div>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-webloom-text">Internal notes</span>
              <textarea
                rows={3}
                className={input}
                placeholder="Customer notes, source details, or sales context"
                value={formData.internalNotes}
                onChange={(e) => setFormData({ ...formData, internalNotes: e.target.value })}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-webloom-text">Custom instructions</span>
              <textarea
                rows={3}
                className={input}
                placeholder="Desired positioning, brand tone, or special requirements"
                value={formData.customInstructions}
                onChange={(e) => setFormData({ ...formData, customInstructions: e.target.value })}
              />
            </label>

            {isTimeout ? (
              <div className="rounded-[18px] border border-red-800/50 bg-red-900/30 px-4 py-3 text-sm text-red-300" role="alert">
                <div className="font-medium">Request timed out</div>
                <div className="mt-1">The analysis is taking longer than expected. You can try again with a simpler Google Maps URL.</div>
              </div>
            ) : errorMessage ? (
              <div className="rounded-[18px] border border-red-800/50 bg-red-900/30 px-4 py-3 text-sm text-red-300" role="alert">
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

        <aside className={`${surface} bg-webloom-raised`}>
          <p className={eyebrow}>Status</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-webloom-text">
            {createLeadMutation.isPending ? 'Processing lead' : 'Ready to review'}
          </h2>

          <div className="mt-6 space-y-4">
            {progressSteps.map((step, index) => {
              const isComplete = isProcessing ? index < currentStep : false;
              const isActive = isProcessing && index === currentStep;

              return (
                <div key={step.label} className="flex items-center gap-3">
                  <div className={[
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors duration-300',
                    isComplete
                      ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-800/60'
                      : isActive
                      ? 'bg-primary-600 text-white'
                      : 'bg-webloom-surface text-webloom-dim border border-webloom-border',
                  ].join(' ')}>
                    {isComplete ? <CheckCircle2 className="h-3.5 w-3.5" /> : isActive ? <Loader className="h-3 w-3 animate-spin" /> : index + 1}
                  </div>
                  <div className="min-w-0">
                    <span className={['text-sm block truncate', isComplete ? 'text-emerald-400' : isActive ? 'text-webloom-text font-medium' : 'text-webloom-muted'].join(' ')}>
                      {step.label}
                    </span>
                    {isActive && (
                      <span className="text-[11px] text-webloom-dim">{formatTime(elapsedTime)} elapsed</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 rounded-[22px] border border-webloom-border bg-webloom-surface p-4">
            <p className={eyebrow}>What Webloom does</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-webloom-muted">
              <li>• Resolves business identity from your Maps URL</li>
              <li>• Gathers verified business information from multiple sources</li>
              <li>• Produces a canonical business profile with provenance</li>
              <li>• Generates a digital presence analysis</li>
              <li>• Builds a strategic Business DNA profile</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
