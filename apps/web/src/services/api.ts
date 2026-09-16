import axios from 'axios';

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

/**
 * Default axios timeout. The lead analysis pipeline (provider extraction,
 * reconciliation, AI enrichment, website audit, Brand DNA generation,
 * opportunity scoring) legitimately takes 20-60+ seconds. A short timeout
 * here cancels a valid in-flight request and shows a misleading error.
 *
 * The bubble-reserved value is 300_000ms (5 minutes). Per-request overrides
 * are allowed (e.g. NewLead passes signal and longer limits); this default
 * is a hard safety net for requests WITHOUT a longer override.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 300_000;

const api = axios.create({
  baseURL: (import.meta as ImportMeta & { env: ImportMetaEnv }).env.VITE_API_URL || 'http://localhost:5001/api',
  headers: {
    'Content-Type': 'application/json',
  },
  // Default 5-minute safety net — never abort a valid long-running analysis.
  timeout: DEFAULT_REQUEST_TIMEOUT_MS,
});

export default api;
