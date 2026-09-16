import api from './api';
import type { LeadGeneratedWebsite } from '../types/websiteSpecification';

export interface Lead {
  _id: string;
  businessName: string;
  leadName?: string | null;
  businessCategory?: string;
  status: string;
  opportunityScore?: {
    total: number;
    priority: string;
    status?: string;
    explanation?: string;
  };
  location?: {
    address?: string;
    city?: string;
    state?: string;
  };
  contact?: {
    phone?: string;
    email?: string;
    website?: string;
  };
  businessData?: {
    rating?: number | null;
    reviewCount?: number | null;
    services?: string[];
    openingHours?: unknown;
    reviews?: Array<{
      rating?: number | null;
      text?: string | null;
      author?: string | null;
      publishedAt?: string | null;
      source?: string;
      sourceUrl?: string | null;
      provenance?: string | null;
      confidence?: number;
      verified?: boolean;
      evidenceSnippet?: string | null;
    }>;
    reviewSummary?: string | null;
    reputation?: {
      rating?: number | null;
      reviewCount?: number | null;
      reviews?: Array<{
        rating?: number | null;
        text?: string | null;
        author?: string | null;
        publishedAt?: string | null;
        source?: string;
        sourceUrl?: string | null;
        provenance?: string | null;
        confidence?: number;
        verified?: boolean;
      }>;
      reviewSummary?: string | null;
      sentiment?: { label?: string; positive?: number; negative?: number; neutral?: number } | null;
      themes?: Array<{ theme?: string; confidence?: number; reviewCount?: number; example?: string | null } | string>;
      provenance?: string | null;
      confidence?: number | null;
      status?: 'verified' | 'source_extracted' | 'ai_extracted_from_evidence' | 'partial' | 'unavailable' | 'conflicting' | null;
      source?: string | null;
    };
  };
  analysis?: {
    brandStrategyStatus?: string;
    brandDNA?: {
      businessIdentity?: Record<string, unknown>;
      audience?: {
        primary?: {
          segment?: string;
          demographics?: { ageRange?: string; income?: string; location?: string };
          psychographics?: { values?: string[]; lifestyle?: string };
        };
        secondary?: Array<{ segment?: string }>;
      };
      customerIntent?: Array<{
        intent?: string;
        urgency?: string;
        frequency?: string;
      }> | string | null;
      painPoints?: Array<{ pain?: string; severity?: string; source?: string }>;
      purchaseTriggers?: Array<{
        trigger?: string;
        type?: string;
        strength?: string;
      }> | string | null;
      services?: unknown;
      competitiveAdvantages?: Array<{ advantage?: string; category?: string }>;
      trustSignals?: unknown;
      brandPersonality?: {
        primary?: string[];
        secondary?: string[];
        avoid?: string[];
        archetype?: string;
      };
      toneOfVoice?: {
        characteristics?: string[];
        doUse?: string[];
        dontUse?: string[];
      };
      visualDirection?: {
        mood?: string;
        colorPalette?: {
          primary?: string;
          secondary?: string;
          reasoning?: string;
        };
        imagery?: {
          style?: string;
          subjects?: string[];
          avoid?: string[];
        };
        typography?: {
          style?: string;
          reasoning?: string;
        };
      } | string | null;
      positioning?: {
        statement?: string;
        differentiation?: string;
      };
      websiteObjectives?: Array<{
        objective?: string;
        priority?: string;
        metrics?: string[];
      }> | string | null;
      conversionStrategy?: {
        primaryCTA?: { action?: string; text?: string; reasoning?: string };
      };
      strategicRecommendations?: Array<{ recommendation?: string; category?: string; impact?: string; effort?: string }>;
      confidence?: Record<string, unknown>;
    };
    audit?: {
      websiteExists?: boolean;
      websiteUrl?: string;
      overallScore?: number;
      status?: string;
      categories?: Record<string, { score?: number; notes?: string; verified?: boolean }>;
      strengths?: string[];
      weaknesses?: string[];
      criticalIssues?: string[];
      recommendations?: string[];
      opportunityGap?: string;
    };
    metrics?: {
      /** Trust signal entries may be legacy strings OR structured objects
       *  ({ type, value, source, verified, ... }). Renderers must normalize —
       *  never render entries raw as React children. */
      trustSignals?: Array<
        | string
        | {
            type?: string;
            value?: unknown;
            source?: string | null;
            verified?: boolean;
            verification?: string | null;
            confidence?: number | null;
          }
      > | null;
      facts?: Array<{ claim?: string; source?: string; verified?: boolean }>;
      unknowns?: string[];
      digitalPresence?: Record<string, unknown>;
      positioning?: unknown;
      source?: unknown;
    };
  };
  generatedWebsite?: LeadGeneratedWebsite;
  createdAt: string;
}

export interface CreateLeadData {
  googleMapsUrl: string;
  leadName?: string;
  internalNotes?: string;
  customInstructions?: string;
  forceRefresh?: boolean;
}

/**
 * Options for createLead. `signal` allows the caller to abort the request
 * (e.g. on unmount). `timeoutMs` overrides the axios default per request —
 * the analysis pipeline legitimately takes 20-60+ seconds.
 */
export interface CreateLeadOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * The API wraps every response in an envelope: `{ success: true, data: ... }`.
 * Unwrap `data` here — in ONE place — so every consumer receives the payload
 * directly. Previously each caller unwrapped ad-hoc (or not at all), which made
 * envelope shape bugs easy to introduce and diagnose.
 */
type LeadEnvelope<T> = { success: boolean; data: T };

export const leadService = {
  _unwrap<T>(response: { data: LeadEnvelope<T> | T }): T {
    const body = response.data;
    // Envelope detection: a body with a `data` field AND no lead fields is the
    // wrapper. A lead object itself never has a top-level `data` key.
    if (body && typeof body === 'object' && 'data' in body && !('_id' in body)) {
      return (body as LeadEnvelope<T>).data;
    }
    return body as T;
  },

  async createLead(data: CreateLeadData, options?: CreateLeadOptions) {
    const startedAt = Date.now();
    const requestId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `lead-${startedAt}-${Math.random().toString(36).slice(2, 10)}`;

    console.debug('[leadService] analysis start', {
      requestId,
      url: `/leads`,
      method: 'POST',
      startedAt: new Date(startedAt).toISOString(),
      googleMapsUrl: data.googleMapsUrl,
      timeoutMs: options?.timeoutMs ?? 'default(5m)',
      signal: options?.signal ? 'provided' : 'none',
    });

    const response = await api.post('/leads', data, {
      signal: options?.signal,
      timeout: options?.timeoutMs,
    });

    const elapsedMs = Date.now() - startedAt;
    const payload = this._unwrap<Lead>(response);
    console.debug('[leadService] analysis response', {
      requestId,
      status: response.status,
      elapsedMs,
      elapsed: `${(elapsedMs / 1000).toFixed(1)}s`,
      payloadShape: {
        keys: payload ? Object.keys(payload) : null,
        hasId: !!payload?._id,
        _id: payload?._id,
        hasAnalysis: !!payload?.analysis,
        hasBrandDNA: !!payload?.brandDNA,
        hasAudit: !!payload?.audit,
        hasOpportunityScore: !!payload?.opportunityScore,
      },
    });
    return payload;
  },

  async getLeads(params?: any) {
    const response = await api.get('/leads', { params });
    return this._unwrap<Lead[]>(response);
  },

  async getLead(id: string) {
    const response = await api.get(`/leads/${id}`);
    return this._unwrap<Lead>(response);
  },

  async updateLead(id: string, data: Partial<Lead>) {
    const response = await api.put(`/leads/${id}`, data);
    return this._unwrap<Lead>(response);
  },

  async deleteLead(id: string) {
    const response = await api.delete(`/leads/${id}`);
    return this._unwrap<{ message?: string; deleted?: boolean }>(response);
  },

  async getDashboardStats() {
    const response = await api.get('/leads/stats/dashboard');
    return this._unwrap<{ totalLeads: number; highPriority: number; websitesGenerated: number; contacted: number }>(response);
  },

  async generateBrandDNA(id: string) {
    const response = await api.post(`/leads/${id}/brand-dna`);
    return response.data;
  },

  /** Generate (or regenerate) the website specification for a lead. */
  async generateWebsiteSpec(id: string) {
    const response = await api.post<{
      success: boolean;
      data: LeadGeneratedWebsite;
    }>(`/leads/${id}/website-spec`);
    return response.data;
  },
};
