/**
 * OpportunityInsights — colorful insight cards for the LeadDetail Overview.
 *
 * IMPORTANT: every insight is DERIVED FROM REAL LEAD DATA. Nothing here
 * invents metrics. When a signal is absent, the corresponding card is either
 * omitted or shown in its honest "missing" form.
 *
 * Derived signals:
 *   - website opportunity  ← contact.website absent / audit.websiteExists false
 *   - conversion           ← audit categories / brandDNA.conversionStrategy
 *   - local SEO            ← location + review presence
 *   - trust / social proof ← trustSignals + reputation rating/reviewCount
 *   - contact / booking    ← phone + email presence
 *   - content              ← audit weaknesses / brandDNA content gaps
 */
import type { ReactNode } from 'react';
import {
  BadgeCheck, CalendarCheck, FileText, Globe, MapPinned, TrendingUp, type LucideIcon,
} from 'lucide-react';
import type { Lead } from '../services/leadService';

type Tone = 'primary' | 'ai' | 'opportunity' | 'verified' | 'creative' | 'warning';

const toneStyles: Record<Tone, { wrap: string; icon: string; accent: string }> = {
  primary: { wrap: 'border-primary/25 bg-gradient-to-br from-primary/10 to-card', icon: 'bg-primary/15 text-primary', accent: 'text-primary' },
  ai: { wrap: 'border-ai/25 bg-gradient-to-br from-ai/10 to-card', icon: 'bg-ai/15 text-ai', accent: 'text-ai' },
  opportunity: { wrap: 'border-opportunity/30 bg-gradient-to-br from-opportunity/12 to-card', icon: 'bg-opportunity/20 text-opportunity', accent: 'text-opportunity' },
  verified: { wrap: 'border-verified/25 bg-gradient-to-br from-verified/10 to-card', icon: 'bg-verified/15 text-verified', accent: 'text-verified' },
  creative: { wrap: 'border-creative/25 bg-gradient-to-br from-creative/10 to-card', icon: 'bg-creative/15 text-creative', accent: 'text-creative' },
  warning: { wrap: 'border-warning/30 bg-gradient-to-br from-warning/12 to-card', icon: 'bg-warning/20 text-warning-foreground', accent: 'text-warning-foreground' },
};

interface Insight {
  key: string;
  title: string;
  detail: string;
  tone: Tone;
  icon: LucideIcon;
}

/** Build insights strictly from present data. Exported for reuse/testing. */
export function deriveInsights(lead: Lead | undefined): Insight[] {
  if (!lead) return [];
  const insights: Insight[] = [];

  const hasWebsite = !!lead.contact?.website;
  const websiteExists = lead.analysis?.audit?.websiteExists;
  const auditEntries = Object.entries(lead.analysis?.audit?.categories ?? {}).filter(([, c]) => c?.score != null);
  const weakestCategory = auditEntries.length
    ? auditEntries.reduce((worst, [k, c]) => ((c.score as number) < (worst[1].score as number) ? [k, c] : worst), auditEntries[0])
    : null;
  const strengths = lead.analysis?.audit?.strengths ?? [];
  const weaknesses = lead.analysis?.audit?.weaknesses ?? [];
  const criticalIssues = lead.analysis?.audit?.criticalIssues ?? [];
  const auditRecommendations = lead.analysis?.audit?.recommendations ?? [];
  const repairs = auditRecommendations.filter(Boolean).length;
  const rating = lead.businessData?.reputation?.rating ?? lead.businessData?.rating ?? null;
  const reviewCount = lead.businessData?.reputation?.reviewCount ?? lead.businessData?.reviewCount ?? null;

  // 1. Website opportunity
  if (!hasWebsite || websiteExists === false) {
    insights.push({
      key: 'website',
      title: 'Website opportunity',
      detail: hasWebsite
        ? 'A website is present but the audit did not find a scoreable page. Rebuilding it is the highest-leverage move.'
        : 'No website was discovered. A conversion-first local site is the clearest opportunity.',
      tone: 'creative',
      icon: Globe,
    });
  } else if (websiteExists) {
    insights.push({
      key: 'website',
      title: 'Website present',
      detail: strengths.length
        ? `Audit found strengths: ${strengths.slice(0, 2).join(', ')}.`
        : 'A website exists — the opportunity is refinement rather than replacement.',
      tone: 'verified',
      icon: Globe,
    });
  }

  // 2. Conversion opportunity
  const cta = lead.analysis?.brandDNA?.conversionStrategy?.primaryCTA;
  if (cta?.text || cta?.action) {
    insights.push({
      key: 'conversion',
      title: 'Conversion opportunity',
      detail: `Recommended primary CTA: “${cta.text || cta.action}”.${cta.reasoning ? ` ${cta.reasoning}` : ''}`,
      tone: 'ai',
      icon: TrendingUp,
    });
  } else if (criticalIssues.length || weaknesses.length) {
    insights.push({
      key: 'conversion',
      title: 'Conversion opportunity',
      detail: criticalIssues[0] || weaknesses[0],
      tone: 'ai',
      icon: TrendingUp,
    });
  } else if (weakestCategory) {
    insights.push({
      key: 'conversion',
      title: 'Conversion opportunity',
      detail: `Weakest audited area is “${weakestCategory[0].replace(/([A-Z])/g, ' $1').toLowerCase()}” at ${weakestCategory[1].score}/10 — improving it should lift conversion.`,
      tone: 'ai',
      icon: TrendingUp,
    });
  }

  // 3. Local SEO opportunity
  const city = lead.location?.city;
  if (city || reviewCount != null) {
    insights.push({
      key: 'local-seo',
      title: 'Local SEO opportunity',
      detail: city
        ? `Local discovery signals for ${city}${reviewCount != null ? ` across ${reviewCount.toLocaleString()} reviews` : ''}.`
        : `Review presence exists (${reviewCount?.toLocaleString()} reviews) — a strong local ranking signal.`,
      tone: 'opportunity',
      icon: MapPinned,
    });
  }

  // 4. Trust / social proof opportunity
  if (rating != null || reviewCount != null) {
    insights.push({
      key: 'trust',
      title: 'Trust / social proof',
      detail: rating != null
        ? `A ${typeof rating === 'number' ? rating.toFixed(1) : rating}/5 rating is a ready-made trust signal to surface on the site.`
        : 'Review volume is available and can be surfaced as social proof.',
      tone: 'verified',
      icon: BadgeCheck,
    });
  } else {
    insights.push({
      key: 'trust',
      title: 'Trust / social proof',
      detail: 'No rating or review data was verified from the supplied sources — worth confirming before it is used as proof.',
      tone: 'warning',
      icon: BadgeCheck,
    });
  }

  // 5. Contact / booking opportunity
  const hasPhone = !!lead.contact?.phone;
  const hasEmail = !!lead.contact?.email;
  insights.push({
    key: 'contact',
    title: 'Contact / booking opportunity',
    detail: hasPhone || hasEmail
      ? `Reachable${hasPhone ? ' by phone' : ''}${hasPhone && hasEmail ? ' and' : ''}${hasEmail ? ' by email' : ''} — a booking or call CTA can convert directly.`
      : 'No verified phone or email was discovered. A contact path is the top priority to establish.',
    tone: hasPhone || hasEmail ? 'primary' : 'warning',
    icon: CalendarCheck,
  });

  // 6. Content opportunity
  const contentSignal = repairs ? `${repairs} audit recommendation${repairs === 1 ? '' : 's'} to act on.` : '';
  if (contentSignal || weaknesses.length) {
    insights.push({
      key: 'content',
      title: 'Content opportunity',
      detail: [contentSignal, weaknesses[0]].filter(Boolean).join(' '),
      tone: 'primary',
      icon: FileText,
    });
  }

  return insights;
}

export default function OpportunityInsights({ lead }: { lead: Lead | undefined }) {
  const insights = deriveInsights(lead);
  if (!insights.length) return null;

  return (
    <div className="wl-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold tracking-[-0.04em] text-foreground">Opportunity insights</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ai/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ai">
          <Sparkle /> derived from analysis
        </span>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {insights.map(({ key, title, detail, tone, icon: Icon }) => {
          const t = toneStyles[tone];
          return (
            <div key={key} className={`rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover ${t.wrap}`}>
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${t.icon}`}>
                <Icon className="h-4 w-4" />
              </span>
              <p className={`mt-3 text-sm font-semibold ${t.accent}`}>{title}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Sparkle(): ReactNode {
  return <span aria-hidden="true">✦</span>;
}