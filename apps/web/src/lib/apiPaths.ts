// API paths - moved to separate file to avoid esbuild regex parser issues with JSX

export const API_HEALTH_AI_URL = '/health/ai?force=1';
export const API_HEALTH_SCRAPER_URL = '/health/scraper';
export const API_HEALTH_URL = '/health';
export const API_JOBS_URL = '/api/v1/jobs';
export const API_JOB_QUEUE_URL = '/api/v1/jobs';
export const API_HEALTH_URL_V1 = '/api/v1/health';

// UI strings - moved to separate file to avoid esbuild regex parser issues with JSX
export const UI_POST_API_JOBS = 'POST /api/v1/jobs';
export const UI_GET_API_JOBS = 'GET /api/v1/jobs';
export const UI_GET_API_HEALTH = 'GET /api/v1/health';
