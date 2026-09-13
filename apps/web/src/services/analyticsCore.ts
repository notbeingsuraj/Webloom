/**
 * analyticsCore — pure, testable analytics decision logic.
 *
 * Separated from the browser/global-touching analytics.ts so the consent and
 * enabled/disabled rules can be unit-tested without a DOM. All functions are
 * pure: they take config/state as parameters and return values.
 */

export type ConsentState = 'granted' | 'denied' | 'pending';

export interface AnalyticsConfig {
  domain: string | null;
  src: string | null;
  consentRequired: boolean;
  /** true when the environment/build allows analytics (production, configured) */
  enabled: boolean;
  /** true when running in a dev environment (always disables analytics) */
  isDev: boolean;
}

export interface TrackEvent {
  name: string;
  props?: Record<string, string | number | boolean>;
}

/**
 * Should this event be tracked at all?
 * - Dev builds never track.
 * - Analytics disabled (missing config) → never track.
 */
export function shouldTrack(config: AnalyticsConfig): boolean {
  if (config.isDev) return false;
  if (!config.enabled) return false;
  return true;
}

/**
 * In consent-required mode, an event may only fire when consent is granted.
 * In non-consent-required mode, denied consent also blocks tracking.
 *
 * Returns 'fire' | 'queue' | 'block'.
 */
export function consentGate(config: AnalyticsConfig, consent: ConsentState): 'fire' | 'queue' | 'block' {
  if (!shouldTrack(config)) return 'block';

  if (config.consentRequired) {
    if (consent !== 'granted') return 'queue';
  } else if (consent === 'denied') {
    return 'block';
  }
  return 'fire';
}

/**
 * Filter a raw event and return the safe payload to send. Never forwards
 * prompts, extracted content, personal data, or credentials — only the event
 * name + allow-listed primitive props.
 */
export function sanitizeEvent(event: TrackEvent): TrackEvent {
  const props: Record<string, string | number | boolean> = {};
  if (event.props && typeof event.props === 'object') {
    for (const [key, value] of Object.entries(event.props)) {
      const t = typeof value;
      if (t === 'string' || t === 'number' || t === 'boolean') {
        props[key] = value;
      }
    }
  }
  return { name: String(event.name).slice(0, 200), props };
}