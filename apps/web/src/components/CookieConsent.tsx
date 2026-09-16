/**
 * CookieConsent — Privacy-compliant consent banner.
 *
 * Renders a full-width bar at the bottom on mobile / at the bottom on desktop
 * with Accept / Reject / Manage Preferences actions. Persists consent via
 * localStorage and wires into the analytics module. Accessible (keyboard
 * navigable, announced on mount, respects prefers-reduced-motion).
 */
import { useEffect, useState } from 'react';
import { Settings, ShieldCheck, X } from 'lucide-react';
import Button from './ui/Button';
import { setConsent, getConsentState, type ConsentState } from '../services/analytics';
import { siteConfig } from '../config/site';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [prefOpen, setPrefOpen] = useState(false);

  // Show only when consent is not yet granted/denied
  useEffect(() => {
    if (!siteConfig.legal.cookiesUsed) return; // no cookies used — never show
    const state = getConsentState();
    if (state === 'pending') setVisible(true);
  }, []);

  const choose = (state: ConsentState) => {
    setConsent(state);
    setVisible(false);
    setPrefOpen(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50" role="dialog" aria-label="Cookie consent" aria-live="polite">
      {/* Backdrop on preference panel */}
      {prefOpen && (
        <div className="absolute inset-0 bg-black/20" onClick={() => setPrefOpen(false)} aria-hidden="true" />
      )}

      {/* Preference panel (floating card) */}
      {prefOpen && (
        <div className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-lg sm:bottom-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-foreground">Cookie Preferences</h2>
            <button onClick={() => setPrefOpen(false)} className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary" aria-label="Close preferences">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Webloom uses only strictly necessary cookies required for core functionality.
            Non-essential analytics are <strong className="font-medium text-foreground">not loaded until you explicitly consent</strong>.
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            <a href="/privacy" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</a> — explains what is collected, how it is used, and your rights.
          </p>
          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:justify-end">
            <Button variant="ghost" size="sm" onClick={() => setPrefOpen(false)}>Cancel</Button>
            <Button variant="secondary" size="sm" onClick={() => choose('denied')}>Reject Non-Essential</Button>
            <Button size="sm" onClick={() => choose('granted')}>Accept All</Button>
          </div>
        </div>
      )}

      {/* Bottom banner */}
      {!prefOpen && (
        <div className="mx-auto max-w-5xl mb-4 px-4 sm:mb-6 sm:px-6">
          <div className="wl-card p-4 backdrop-blur-xl sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">We value your privacy</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Webloom uses strictly necessary cookies for core functionality. Non-essential analytics
                    are only loaded with your explicit consent.
                    <a href="/privacy" className="ml-1 underline underline-offset-2 hover:text-muted-foreground">Learn more</a>
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  onClick={() => setPrefOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Preferences
                </button>
                <Button variant="ghost" size="sm" onClick={() => choose('denied')}>
                  Reject Non-Essential
                </Button>
                <Button size="sm" onClick={() => choose('granted')}>
                  Accept All
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}