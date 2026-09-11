import api from './api';

export interface Lead {
  _id: string;
  businessName: string;
  businessCategory?: string;
  status: string;
  opportunityScore?: {
    total: number;
    priority: string;
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
    rating?: number;
    reviewCount?: number;
    services?: string[];
    openingHours?: unknown;
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
      customerIntent?: unknown;
      painPoints?: Array<{ pain?: string; severity?: string; source?: string }>;
      purchaseTriggers?: unknown;
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
      visualDirection?: unknown;
      positioning?: {
        statement?: string;
        differentiation?: string;
      };
      websiteObjectives?: unknown;
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
      categories?: Record<string, { score?: number; notes?: string; verified?: boolean }>;
      strengths?: string[];
      weaknesses?: string[];
      criticalIssues?: string[];
      recommendations?: string[];
      opportunityGap?: string;
    };
    metrics?: {
      trustSignals?: string[];
      facts?: Array<{ claim?: string; source?: string; verified?: boolean }>;
      unknowns?: string[];
      digitalPresence?: Record<string, unknown>;
      positioning?: unknown;
      source?: unknown;
    };
  };
  generatedWebsite?: {
    specification?: {
      pageTitle?: string;
      pageDescription?: string;
      primaryCTA?: { text?: string };
      sections?: Array<{ type?: string; content?: { headline?: string } }>;
    };
  };
  createdAt: string;
}

export interface CreateLeadData {
  googleMapsUrl: string;
  leadName?: string;
  internalNotes?: string;
  customInstructions?: string;
}

export const leadService = {
  async createLead(data: CreateLeadData) {
    const response = await api.post('/leads', data);
    return response.data;
  },

  async getLeads(params?: any) {
    const response = await api.get('/leads', { params });
    return response.data;
  },

  async getLead(id: string) {
    const response = await api.get(`/leads/${id}`);
    return response.data;
  },

  async updateLead(id: string, data: Partial<Lead>) {
    const response = await api.put(`/leads/${id}`, data);
    return response.data;
  },

  async deleteLead(id: string) {
    const response = await api.delete(`/leads/${id}`);
    return response.data;
  },

  async getDashboardStats() {
    const response = await api.get('/leads/stats/dashboard');
    return response.data;
  },

  async generateBrandDNA(id: string) {
    const response = await api.post(`/leads/${id}/brand-dna`);
    return response.data;
  },
};
