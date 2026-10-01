import axios from 'axios';

/**
 * Indirection over the HTTP transport.
 *
 * Every provider request goes through getHttpClient(). Swapping the
 * implementation lets tests drive provider selection, retries, and fallback
 * with no network and no API keys, and gives one place to add tracing,
 * timeouts, or circuit-breaking later.
 */
let impl = axios;

export function getHttpClient() {
  return impl;
}

/** @param {Function|null} fn pass null to restore the default (axios). */
export function setHttpClient(fn) {
  impl = fn || axios;
}

export function resetHttpClient() {
  impl = axios;
}

export default { getHttpClient, setHttpClient, resetHttpClient };
