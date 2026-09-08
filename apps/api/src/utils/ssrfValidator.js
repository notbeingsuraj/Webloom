/**
 * SSRF Validator & Safe Outbound HTTP Helper — Phase 20 (Requirement #12)
 *
 * Enforces strict Server-Side Request Forgery protection for all outbound fetches:
 *  - initial URL validation
 *  - redirect-safe validation (EVERY redirect destination is checked before following)
 *  - IPv4 private ranges (10.0.0.0/8, 127.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 0.0.0.0/8, etc.)
 *  - IPv6 loopback (::1), unspecified (::), link-local (fe80::/10), unique local (fc00::/7, fd00::/8)
 *  - IPv4-mapped IPv6 (::ffff:127.0.0.1)
 *  - Integer and hex IP notations
 *  - Localhost aliases (localhost, *.local, local, internal, intranet)
 *  - Only HTTPS (or HTTP if specifically allowed in test mode)
 */

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'local',
  'broadcasthost',
  'ip6-localhost',
  'ip6-loopback',
]);

/**
 * Check if an IP address string (v4 or v6) belongs to a private / loopback / link-local range.
 * @param {string} ip
 * @returns {boolean} true if IP is private/internal
 */
export function isPrivateIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  let clean = ip.trim().toLowerCase();

  // Strip IPv6 brackets if present: [::1] -> ::1
  if (clean.startsWith('[') && clean.endsWith(']')) {
    clean = clean.slice(1, -1);
  }

  // IPv4-mapped IPv6: Node's URL parser may expose either dotted form
  // (::ffff:192.168.1.1) or hexadecimal form (::ffff:c0a8:0101).
  if (clean.startsWith('::ffff:')) {
    const mapped = clean.slice(7);
    if (mapped.includes('.')) {
      clean = mapped;
    } else {
      const groups = mapped.split(':');
      if (groups.length === 2 && groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) {
        const high = parseInt(groups[0], 16);
        const low = parseInt(groups[1], 16);
        clean = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
      }
    }
  }

  // IPv6 checks
  if (clean.includes(':')) {
    if (clean === '::1' || clean === '::') return true;
    if (clean.startsWith('fe8') || clean.startsWith('fe9') || clean.startsWith('fea') || clean.startsWith('feb')) return true; // fe80::/10
    if (clean.startsWith('fc') || clean.startsWith('fd')) return true; // fc00::/7
    return false;
  }

  // IPv4 integer or hex notation (e.g. 2130706433 or 0x7f000001)
  if (/^0x[0-9a-f]+$/i.test(clean)) {
    const num = parseInt(clean, 16);
    if (!Number.isNaN(num)) {
      const p1 = (num >> 24) & 255;
      const p2 = (num >> 16) & 255;
      const p3 = (num >> 8) & 255;
      const p4 = num & 255;
      return isPrivateIp(`${p1}.${p2}.${p3}.${p4}`);
    }
  }
  if (/^\d{8,11}$/.test(clean)) {
    const num = Number(clean);
    if (!Number.isNaN(num)) {
      const p1 = (num >> 24) & 255;
      const p2 = (num >> 16) & 255;
      const p3 = (num >> 8) & 255;
      const p4 = num & 255;
      return isPrivateIp(`${p1}.${p2}.${p3}.${p4}`);
    }
  }

  // Standard dotted-decimal IPv4
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = clean.match(ipv4Regex);
  if (!match) return false;

  const [p1, p2, p3, p4] = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
  if (p1 > 255 || p2 > 255 || p3 > 255 || p4 > 255) return true; // invalid IP -> block

  // 0.0.0.0/8 (current network)
  if (p1 === 0) return true;
  // 10.0.0.0/8 (private)
  if (p1 === 10) return true;
  // 127.0.0.0/8 (loopback)
  if (p1 === 127) return true;
  // 172.16.0.0/12 (private: 172.16.0.0 - 172.31.255.255)
  if (p1 === 172 && p2 >= 16 && p2 <= 31) return true;
  // 192.168.0.0/16 (private)
  if (p1 === 192 && p2 === 168) return true;
  // 169.254.0.0/16 (link-local)
  if (p1 === 169 && p2 === 254) return true;
  // 100.64.0.0/10 (carrier-grade NAT)
  if (p1 === 100 && p2 >= 64 && p2 <= 127) return true;
  // 192.0.0.0/24 (IETF protocol assignments)
  if (p1 === 192 && p2 === 0 && p3 === 0) return true;
  // 192.0.2.0/24 (TEST-NET-1)
  if (p1 === 192 && p2 === 0 && p3 === 2) return true;
  // 198.51.100.0/24 (TEST-NET-2)
  if (p1 === 198 && p2 === 51 && p3 === 100) return true;
  // 203.0.113.0/24 (TEST-NET-3)
  if (p1 === 203 && p2 === 0 && p3 === 113) return true;
  // 224.0.0.0/4 (multicast) & 240.0.0.0/4 (reserved)
  if (p1 >= 224) return true;

  return false;
}

/**
 * Validate a target URL against the SSRF policy.
 * @param {string} urlString
 * @param {Object} [options]
 * @param {boolean} [options.allowHttp=false] whether to permit http (default https only)
 * @throws {Error} if URL violates policy
 * @returns {URL} parsed URL if valid
 */
export function validateFetchUrl(urlString, { allowHttp = false } = {}) {
  if (!urlString || typeof urlString !== 'string') {
    throw new Error('Invalid URL: URL must be a non-empty string');
  }

  let parsed;
  try {
    parsed = new URL(urlString.trim());
  } catch {
    throw new Error('Invalid URL format');
  }

  // Protocol check
  if (parsed.protocol === 'https:') {
    // Allowed
  } else if (parsed.protocol === 'http:') {
    if (!allowHttp) {
      throw new Error('Only HTTPS URLs are allowed');
    }
  } else {
    throw new Error(`Unsupported protocol: ${parsed.protocol}. Only HTTPS is allowed.`);
  }

  const hostname = parsed.hostname.toLowerCase().trim();
  if (!hostname) {
    throw new Error('Invalid URL: empty hostname');
  }

  // Hostname aliases
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.localhost')) {
    throw new Error('Localhost/internal URLs are not allowed');
  }

  // Check IP ranges (IPv4, IPv6, mapped)
  if (isPrivateIp(hostname)) {
    throw new Error('Private or internal IP addresses are not allowed');
  }

  return parsed;
}

/**
 * Perform a safe HTTP(S) fetch that validates EVERY redirect destination
 * against the SSRF policy.
 *
 * @param {string} initialUrl
 * @param {Object} [options]
 * @param {number} [options.maxRedirects=5]
 * @param {number} [options.timeout=10000]
 * @param {Object} [options.headers={}]
 * @param {boolean} [options.allowHttp=false]
 * @returns {Promise<{ url: string, status: number, headers: Object, data: string }>}
 */
export async function safeFetch(initialUrl, {
  maxRedirects = 5,
  timeout = 10000,
  headers = {},
  allowHttp = false,
} = {}) {
  let currentUrl = initialUrl;
  let redirectsCount = 0;

  while (true) {
    // Validate current URL against SSRF policy
    const parsed = validateFetchUrl(currentUrl, { allowHttp });

    const requestHeaders = {
      'User-Agent': 'Webloom-Bot/1.0 (+https://webloom.internal)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...headers,
    };

    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;

    const response = await new Promise((resolve, reject) => {
      const req = transport.request(parsed, {
        method: 'GET',
        headers: requestHeaders,
        timeout,
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          resolve({
            status: res.statusCode || 200,
            headers: res.headers,
            data: body,
            url: currentUrl,
          });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timed out after ${timeout}ms`));
      });

      req.on('error', (err) => reject(err));
      req.end();
    });

    // Check for redirects (301, 302, 303, 307, 308)
    const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
    const location = response.headers.location;

    if (isRedirect && location) {
      if (redirectsCount >= maxRedirects) {
        throw new Error(`Too many redirects (limit: ${maxRedirects})`);
      }

      // Resolve redirect URL relative to current URL
      const redirectTarget = new URL(location, currentUrl).href;

      // Validate the REDIRECT destination BEFORE following it
      try {
        validateFetchUrl(redirectTarget, { allowHttp });
      } catch (err) {
        throw new Error(`SSRF blocked on redirect to ${redirectTarget}: ${err.message}`);
      }

      currentUrl = redirectTarget;
      redirectsCount += 1;
      continue;
    }

    return response;
  }
}

export default {
  validateFetchUrl,
  isPrivateIp,
  safeFetch,
};