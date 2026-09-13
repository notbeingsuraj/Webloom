import { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader, MapPin, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import Button from '../components/ui/Button';
import usePageMetadata from '../hooks/usePageMetadata';
import analytics from '../services/analytics';
import { leadService } from '../services/leadService';

const surface = 'rounded-[30px] border border-webloom-border bg-webloom-surface p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)] md:p-8';
const eyebrow = 'text-[11px] uppercase tracking-[0.18em] text-webloom-dim';
const input = 'w-full rounded-[18px] border border-webloom-border bg-webloom-raised px-4 py-3 text-[15px] text-webloom-text outline-none transition focus:border-primary-500 focus:bg-webloom-hover';
const inputError = 'w-full rounded-[18px] border border-webloom-danger bg-webloom-raised px-4 py-3 text-[15px] text-webloom-text outline-none transition focus:border-webloom-danger';

const progressSteps = [
  { label: 'Reading business location', duration: 3000 },
  { label: 'Resolving business identity', duration: 8000 },
  { label: 'Gathering business information', duration: 15000 },
  { label: 'Reconciling sources', duration: 20000 },
  { label: 'Building Business DNA', duration: 25000 },
  { label: 'Calculating opportunity score', duration: 30000 },
  { label: 'Preparing analysis', duration: 35000 },
];

const REQUEST_TIMEOUT_MS = 90000; // 90 seconds for the full request

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
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const stepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutTimerRef = useRef<NodeJS.Timeout | null>(null);

  const createLeadMutation = useMutation({
    mutationFn: leadService.createLead,
    onSuccess: (data) => {
      analytics.analysisCompleted();
      navigate(`/leads/${data.data._id}`);
    },
    onError: () => {
      analytics.analysisFailed();
    },
  });

  // Progress timer
  useEffect(() => {
    if (createLeadMutation.isPending && startTime) {
      timerRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 250);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [createLeadMutation.isPending, startTime]);

  // Step advancement timer
  useEffect(() => {
    if (!createLeadMutation.isPending) return;
    const elapsed = Date.now() - (startTime || Date.now());
    let nextStep = 0;
    for (let i = 0; i < progressSteps.length; i++) {
      if (elapsed >= progressSteps[i].duration) nextStep = i + 1;
    }
    setCurrentStep(Math.min(nextStep, progressSteps.length - 1));

    // Calculate time until next step
    let accumulated = 0;
    for (let i = 0; i < progressSteps.length; i++) {
      if (i >= nextStep) {
        const delay = Math.max(0, progressSteps[i].duration - elapsed);
        stepTimerRef.current = setTimeout(() => {
          setCurrentStep(i);
        }, delay);
        break;
      }
      accumulated += progressSteps[i].duration;
    }
    return () => {
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    };
  }, [createLeadMutation.isPending, startTime, elapsedTime]);

  // Long-running analysis warning.
  // Do NOT reset/cancel the mutation at 90 seconds: the API may still be
  // finishing valid work (provider fetches + optional enrichment). Resetting
  // previously orphaned that request, made the first run appear wasted, and
  // encouraged users to paste the same URL again.
  useEffect(() => {
    if (createLeadMutation.isPending) {
      timeoutTimerRef.current = setTimeout(() => {
        setElapsedTime((current) => Math.max(current, Math.ceil(REQUEST_TIMEOUT_MS / 1000)));
      }, REQUEST_TIMEOUT_MS);
    }
    return () => {
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    };
  }, [createLeadMutation.isPending]);

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
    analytics.startAnalysis();
    setCurrentStep(0);
    setStartTime(Date.now());
    setElapsedTime(0);
    createLeadMutation.mutate({
      googleMapsUrl: trimmed,
      // A submit always requests a current acquisition. This bypasses stale
      // source-cache entries, so retrying an analysis does not repeat an old
      // empty response from Google Maps.
      forceRefresh: true,
      ...formData,
    });
  };

  const isProcessing = createLeadMutation.isPending;
  const errorMessage = createLeadMutation.isError
    ? ((createLeadMutation.error as any)?.response?.data?.message ||
       (createLeadMutation.error as any)?.response?.data?.error ||
       'The request took too long or the server is unavailable. Please try again.')
    : null;
  const isTimeout = elapsedTime > REQUEST_TIMEOUT_MS / 1000 && isProcessing;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

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
