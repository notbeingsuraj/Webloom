/**
 * Analytics — environment-configured, consent-gated event tracking.
 *
 * Rules enforced here (pure logic in analyticsCore.ts for testability):
 * - No hardcoded secrets/IDs; config comes from VITE_PUBLIC_ANALYTICS_* env.
 * - Analytics is disabled in development unless explicitly enabled.
 * - If VITE_PUBLIC_ANALYTICS_CONSENT_REQUIRED === 'true' (or consent is not
 *   yet granted) events are queued/stashed and only flushed after consent.
 * - NEVER send sensitive data: prompts, extracted content, personal data, API
 *   credentials. Only event names + primitive props are forwarded.
 */
import { siteConfig } from '../config/site';
import {
  consentGate,
  sanitizeEvent,
  type ConsentState,
  type TrackEvent,
  type AnalyticsConfig,
} from './analyticsCore';

const CONSENT_KEY = 'webloom:analytics-consent';
export type { ConsentState };

function buildConfig(): AnalyticsConfig {
  return {
    domain: siteConfig.analytics.domain,
    src: siteConfig.analytics.src,
    consentRequired: siteConfig.analytics.consentRequired,
    enabled: siteConfig.analytics.enabled(),
    isDev: import.meta.env.DEV === true,
  };
}

function loadScript(): boolean {
  const { domain, src } = siteConfig.analytics;
  if (!domain || !src) return false;
  if (document.querySelector(`script[data-webloom-analytics]`)) return true;
  const script = document.createElement('script');
  script.setAttribute('data-webloom-analytics', 'true');
  script.setAttribute('defer', 'true');
  script.src = src;
  script.setAttribute('data-domain', domain);
  document.head.appendChild(script);
  return true;
}

export function getConsentState(): ConsentState {
  const stored = localStorage.getItem(CONSENT_KEY);
  if (stored === 'granted') return 'granted';
  if (stored === 'denied') return 'denied';
  return 'pending';
}

export function setConsent(state: ConsentState) {
  if (state === 'pending') localStorage.removeItem(CONSENT_KEY);
  else localStorage.setItem(CONSENT_KEY, state);

  if (state === 'granted') {
    // Load analytics only after explicit consent when required, or whenever
    // consent is granted (config controls the requirement).
    const config = buildConfig();
    if (config.enabled && !config.isDev) {
      loadScript();
      flushQueue();
    }
  } else {
    document.querySelectorAll('script[data-webloom-analytics]').forEach((s) => s.remove());
  }
}

const QUEUE_KEY = 'webloom:analytics-queue';

function enqueue(event: TrackEvent) {
  try {
    const existing = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    existing.push({ ...sanitizeEvent(event), at: new Date().toISOString() });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(existing.slice(-50)));
  } catch {
    /* storage unavailable — best-effort */
  }
}

function flushQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return;
    const queued = JSON.parse(raw);
    localStorage.removeItem(QUEUE_KEY);
    for (const event of queued) {
      send(event);
    }
  } catch {
    /* ignore */
  }
}

function send(event: TrackEvent) {
  const w = window as unknown as { plausible?: (name: string, opts?: unknown) => void };
  if (typeof w.plausible === 'function') {
    w.plausible(event.name, { props: event.props ?? {} });
  }
}

/**
 * Track an event. Safe no-op when analytics is disabled or consent denied.
 */
export function trackEvent(event: TrackEvent) {
  const config = buildConfig();
  const gate = consentGate(config, getConsentState());

  if (gate === 'block') return;
  if (gate === 'queue') {
    enqueue(event);
    return;
  }

  const safe = sanitizeEvent(event);
  loadScript();
  send(safe);
}

/** Convenience wrappers for the specified event set. */
export const analytics = {
  pageView: () => trackEvent({ name: 'pageview' }),
  primaryCta: (label: string) => trackEvent({ name: 'cta_click', props: { label } }),
  startAnalysis: () => trackEvent({ name: 'analysis_started' }),
  formSuccess: (form: string) => trackEvent({ name: 'form_submit_success', props: { form } }),
  formFailure: (form: string) => trackEvent({ name: 'form_submit_failure', props: { form } }),
  analysisStarted: () => trackEvent({ name: 'analysis_started' }),
  analysisCompleted: () => trackEvent({ name: 'analysis_completed' }),
  analysisFailed: () => trackEvent({ name: 'analysis_failed' }),
  conversion: () => trackEvent({ name: 'conversion' }),
};

export default analytics;