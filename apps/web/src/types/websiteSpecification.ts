/**
 * Website specification contract (frontend-facing).
 *
 * This is the SINGLE normalized shape the Website tab renders. It is produced
 * server-side (POST /api/leads/:id/website-spec) from the LandingPageSpec AI
 * service or the deterministic config fallback, and persisted on the lead as
 * `generatedWebsite.specification`.
 *
 * Rules:
 *   - Missing fields are `null` / empty collections — never the string
 *     "undefined" and never nested internal database structures.
 *   - `status` is one of: 'pending' | 'generated' | 'failed' | 'not_started'
 *   - `error` is a safe human-readable message when status === 'failed'.
 *   - `provenance` and `metadata` are exposed as labeled summary fields in the
 *     UI (never as raw JSON).
 */

export type WebsiteSpecStatus = 'pending' | 'generated' | 'failed' | 'not_started';

export interface WebsiteSpecSection {
  id?: string | null;
  type?: string | null;
  purpose?: string | null;
  priority?: string | null;
  visibility?: string | null;
  layout?: string | null;
  headline?: string | null;
  content?: string | null;
  /** Services / offerings rendered as readable chips. */
  items?: string[];
}

export interface WebsiteSpecCTA {
  text?: string | null;
  action?: string | null;
  reasoning?: string | null;
}

export interface WebsiteVisualDirection {
  mood?: string | null;
  colorPalette?: {
    primary?: string | null;
    secondary?: string | null;
    reasoning?: string | null;
  } | null;
  imagery?: {
    style?: string | null;
    subjects?: string[];
    avoid?: string[];
  } | null;
  typography?: {
    style?: string | null;
    reasoning?: string | null;
  } | null;
}

export interface WebsiteObjective {
  objective?: string | null;
  priority?: string | null;
  metrics?: string[];
}

export interface WebsiteSpecification {
  /** Rendered as the preview page title. */
  businessName?: string | null;
  businessCategory?: string | null;
  headline?: string | null;
  subheadline?: string | null;
  valueProposition?: string | null;
  targetAudience?: string | null;
  primaryCTA?: WebsiteSpecCTA | null;
  secondaryCTA?: WebsiteSpecCTA | null;
  sections?: WebsiteSpecSection[];
  services?: string[];
  testimonials?: Array<{ quote?: string | null; source?: string | null }>;
  contact?: {
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    address?: string | null;
  } | null;
  websiteObjectives?: WebsiteObjective[];
  visualDirection?: WebsiteVisualDirection | null;
  typographyDirection?: string | null;
  colorDirection?: string | null;
  imageryDirection?: string | null;
  responsiveBehavior?: string[] | null;
}

export interface LeadGeneratedWebsite {
  specification?: WebsiteSpecification | null;
  /** 'pending' while generating, 'generated' on success, 'failed' on error. */
  status: WebsiteSpecStatus;
  /** Safe human-readable error when status === 'failed'. */
  error?: string | null;
  /** True when the source business had no discovered website (not an error). */
  noSourceWebsite?: boolean;
  generatedAt?: string | null;
  metadata?: {
    source?: string | null;
    version?: string | null;
    model?: string | null;
  } | null;
}

/**
 * Default empty spec — used for truthful "not started / pending" states rather
 * than rendering `undefined`.
 */
export function emptyWebsiteSpec(): LeadGeneratedWebsite {
  return { specification: null, status: 'not_started', error: null, noSourceWebsite: false };
}