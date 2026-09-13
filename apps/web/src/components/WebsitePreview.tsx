import { useState } from 'react';
import { AlertCircle, Globe, Loader, RefreshCw, Sparkles } from 'lucide-react';
import type { LeadGeneratedWebsite, WebsiteSpecification } from '../types/websiteSpecification';

/**
 * WebsitePreview
 *
 * Renders the Website tab: truthful state machine + populated preview.
 *
 * States:
 *   - not_started / pending → explanatory empty state with Generate CTA
 *   - generated + spec      → populated preview (Desktop/Tablet/Mobile)
 *   - generated + no spec   → "No source website found" (still generated? No —
 *     only when the business had no discovered website, generation succeeded
 *     deterministically from the profile, so a spec is present)
 *   - failed                → error message + Retry
 *
 * Never renders raw JSON. Never shows "Unavailable" without explanation.
 */
export default function WebsitePreview({
  website,
  generatedAt,
  isGenerating,
  onGenerate,
  generateError,
}: {
  website: LeadGeneratedWebsite | undefined;
  generatedAt?: string | null;
  isGenerating?: boolean;
  onGenerate: () => void;
  generateError?: string | null;
}) {
  const [viewport, setViewport] = useState<'Desktop' | 'Tablet' | 'Mobile'>('Desktop');

  const status = website?.status ?? 'not_started';
  const spec = website?.specification ?? null;

  if (isGenerating) {
    return (
      <div className="rounded-[30px] border border-webloom-border bg-webloom-surface p-10 text-center">
        <Loader className="mx-auto h-8 w-8 animate-spin text-primary-400" />
        <p className="mt-4 text-base font-medium text-webloom-text">Generating website specification…</p>
        <p className="mt-2 text-sm text-webloom-muted">
          Using the verified business profile and analysis. This takes a moment.
        </p>
      </div>
    );
  }

  if (generateError) {
    return (
      <div className="rounded-[30px] border border-red-800/50 bg-webloom-surface p-10 text-center shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
        <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
        <p className="mt-4 text-base font-medium text-red-400">Website specification generation failed</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-red-400/80">{generateError}</p>
        <button
          type="button"
          onClick={onGenerate}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-webloom-raised px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#2A2A2A]"
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  if (!spec) {
    return (
      <div className="rounded-[30px] border border-webloom-border bg-webloom-surface p-10 text-center shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
        <Sparkles className="mx-auto h-8 w-8 text-primary-400" />
        <p className="mt-4 text-base font-medium text-webloom-text">
          {status === 'failed' ? 'No website specification available' : 'Generate a website specification'}
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-webloom-muted">
          {status === 'failed'
            ? 'The last generation attempt did not complete. You can retry — the analysis is still valid.'
            : website?.noSourceWebsite
              ? 'No source website was found for this business, but a specification can still be built from the verified profile.'
              : 'Build a conversion-focused website specification from the verified business profile and analysis.'}
        </p>
        <button
          type="button"
          onClick={onGenerate}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-webloom-raised px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#2A2A2A]"
        >
          {status === 'failed' ? (
            <><RefreshCw className="h-4 w-4" /> Retry generation</>
          ) : (
            <><Sparkles className="h-4 w-4" /> Generate specification</>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-webloom-muted">
          {generatedAt ? `Generated ${new Date(generatedAt).toLocaleString()}` : 'Generated from verified analysis'}
          {website?.noSourceWebsite ? ' · No source website found — built from profile' : ''}
        </p>
        <div className="flex items-center gap-2 rounded-full border border-webloom-border bg-webloom-raised p-1">
          {(['Desktop', 'Tablet', 'Mobile'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setViewport(v)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                viewport === v ? 'bg-webloom-raised text-white' : 'text-webloom-muted hover:text-webloom-text'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.5fr_0.8fr]">
        {/* Sections */}
        <div className="rounded-[22px] border border-webloom-border bg-webloom-raised p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Sections</p>
          <div className="mt-4 space-y-2 text-sm text-webloom-text">
            {spec.sections?.length ? (
              spec.sections.map((section) => (
                <div key={section.id ?? section.type ?? 'section'} className="rounded-xl border border-webloom-border bg-webloom-surface px-3 py-2">
                  <span className="font-medium capitalize">{section.type || 'Section'}</span>
                  {section.purpose && <span className="mt-0.5 block text-xs leading-4 text-webloom-muted">{section.purpose}</span>}
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-webloom-border bg-webloom-surface px-3 py-2 text-webloom-muted">Section list not available</div>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className={`rounded-[28px] border border-webloom-border bg-webloom-raised p-4 ${viewport === 'Mobile' ? 'max-w-sm' : viewport === 'Tablet' ? 'max-w-2xl' : ''}`}>
          <PreviewCanvas spec={spec} />
        </div>

        {/* Appearance + regenerate */}
        <div className="rounded-[22px] border border-webloom-border bg-webloom-raised p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Appearance</p>
          <div className="mt-4 space-y-3 text-sm text-webloom-text">
            {spec.visualDirection ? (
              <>
                {spec.visualDirection.mood && (
                  <div className="rounded-xl border border-webloom-border bg-webloom-surface px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-webloom-muted">Mood</p>
                    <p className="mt-0.5">{spec.visualDirection.mood}</p>
                  </div>
                )}
                {spec.colorDirection && (
                  <div className="flex items-center gap-2 rounded-xl border border-webloom-border bg-webloom-surface px-3 py-2">
                    <span className="h-4 w-4 shrink-0 rounded-full border border-webloom-border" style={{ background: spec.colorDirection }} />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-webloom-muted">Primary colour</p>
                      <p className="truncate">{spec.colorDirection}</p>
                    </div>
                  </div>
                )}
                {spec.typographyDirection && (
                  <div className="rounded-xl border border-webloom-border bg-webloom-surface px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-webloom-muted">Typography</p>
                    <p className="mt-0.5">{spec.typographyDirection}</p>
                  </div>
                )}
                {spec.imageryDirection && (
                  <div className="rounded-xl border border-webloom-border bg-webloom-surface px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-webloom-muted">Imagery</p>
                    <p className="mt-0.5">{spec.imageryDirection}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-webloom-border bg-webloom-surface px-3 py-2 text-webloom-muted">
                <p className="text-[10px] uppercase tracking-[0.14em] text-webloom-muted">Typography</p>
                <p className="mt-0.5">System default</p>
              </div>
            )}
            <button
              type="button"
              onClick={onGenerate}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#111111] bg-webloom-surface px-4 py-2 text-sm font-medium text-webloom-text transition hover:bg-webloom-raised"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Regenerate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

function PreviewCanvas({ spec }: { spec: WebsiteSpecification }) {
  const hero = spec.sections?.find((s) => s.type === 'hero');
  const servicesSection = spec.sections?.find((s) => s.type === 'services');
  const cta = spec.sections?.find((s) => s.type === 'cta');
  const location = spec.sections?.find((s) => s.type === 'location');
  const trust = spec.sections?.find((s) => s.type === 'trustIndicators');

  return (
    <div className="overflow-hidden rounded-[20px] border border-webloom-border bg-webloom-surface shadow-[0_14px_40px_rgba(17,17,17,0.04)]">
      {/* Navigation */}
      <div className="flex items-center justify-between border-b border-[#F0F0F2] px-5 py-3">
        <span className="text-sm font-semibold tracking-tight text-webloom-text">{spec.businessName || 'Business'}</span>
        <span className="hidden gap-4 text-xs text-webloom-muted sm:flex">
          <span>About</span>
          <span>Services</span>
          <span>Contact</span>
        </span>
      </div>

      {/* Hero */}
      <div className="bg-webloom-raised px-6 py-8 text-white md:px-8 md:py-10">
        <p className="text-[11px] uppercase tracking-[0.18em] text-white/70">
          {spec.businessCategory || 'Local business'}
        </p>
        <h3 className="mt-3 text-2xl font-semibold tracking-[-0.05em] md:text-3xl">
          {hero?.headline || spec.headline || spec.businessName || 'Website specification unavailable'}
        </h3>
        <p className="mt-3 max-w-md text-sm leading-6 text-white/80">
          {hero?.content || spec.subheadline || '—'}
        </p>
        {(spec.primaryCTA?.text || hero?.items?.length) && (
          <div className="mt-6 flex flex-wrap gap-3">
            {spec.primaryCTA?.text && (
              <span className="inline-flex items-center rounded-full bg-webloom-surface px-4 py-2 text-sm font-medium text-webloom-text">
                {spec.primaryCTA.text}
              </span>
            )}
            {spec.secondaryCTA?.text && (
              <span className="inline-flex items-center rounded-full border border-white/30 px-4 py-2 text-sm font-medium text-white">
                {spec.secondaryCTA.text}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Trust indicators */}
      {trust?.items?.length ? (
        <div className="flex flex-wrap gap-2 px-6 py-4">
          {trust.items.slice(0, 3).map((item) => (
            <span key={item} className="rounded-full border border-webloom-border bg-webloom-raised px-3 py-1 text-xs text-webloom-muted">{item}</span>
          ))}
        </div>
      ) : null}

      {/* Services */}
      {(spec.services?.length || servicesSection?.items?.length) ? (
        <div className="px-6 py-5 md:px-8">
          <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Services & offerings</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {(spec.services?.slice(0, 6) || []).map((service) => (
              <div key={service} className="rounded-2xl border border-webloom-border bg-webloom-raised p-3 text-sm font-medium text-webloom-text">
                {service}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* CTA band */}
      {cta?.items?.length || spec.primaryCTA?.text ? (
        <div className="mx-6 mb-5 rounded-2xl bg-webloom-raised p-5 text-center md:mx-8">
          <p className="text-sm font-medium text-webloom-text">{cta?.purpose || 'Ready to get started?'}</p>
          {spec.primaryCTA?.text && (
            <span className="mt-3 inline-flex items-center rounded-full bg-webloom-raised px-5 py-2.5 text-sm font-medium text-white">
              {spec.primaryCTA.text}
            </span>
          )}
        </div>
      ) : null}

      {/* Footer */}
      <div className="border-t border-[#F0F0F2] px-6 py-4 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-webloom-muted">
          <span className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            {spec.contact?.website || `${spec.businessName || 'Business'} website`}
          </span>
          <span>{spec.responsiveBehavior?.join(' · ') || 'Responsive'}</span>
        </div>
        {location?.purpose && <p className="mt-1 text-[11px] text-[#A0A0A6]">{location.purpose}</p>}
      </div>
    </div>
  );
}