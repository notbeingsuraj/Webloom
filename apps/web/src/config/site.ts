/**
 * Webloom site-wide configuration.
 *
 * Centralized metadata for SEO (titles, descriptions, canonical URLs),
 * analytics, and legal/contact placeholders.
 *
 * IMPORTANT:
 * - PRODUCTION_URL is derived from VITE_PUBLIC_SITE_URL when set, otherwise
 *   falls back to a sensible localhost default for development.
 * - CONTACT_ADDRESS / LEGAL placeholders are NOT filled with invented facts.
 *   They carry an explicit `todo` marker that the owner must replace before
 *   production launch (see CONTACT-ADDRESS-TODO.md).
 */

const PRODUCTION_URL =
  typeof import.meta.env !== 'undefined' && import.meta.env.VITE_PUBLIC_SITE_URL
    ? import.meta.env.VITE_PUBLIC_SITE_URL.replace(/\/$/, '')
    : 'http://localhost:5173';

const isProduction =
  typeof import.meta.env !== 'undefined' && import.meta.env.PROD === true;

export const siteConfig = {
  name: 'Webloom',
  tagline: 'AI-Powered Web Intelligence',
  url: PRODUCTION_URL,
  isProduction,
  description:
    'Webloom is an AI-powered web intelligence and business extraction platform. Resolve verified business identities, extract structured data, and generate conversion-ready websites.',
  ogImage: `${PRODUCTION_URL}/og-image.png`,
  defaultTitle: 'Webloom | AI-Powered Web Intelligence',
  analytics: {
    // Plausible-style analytics via environment configuration. No secrets are
    // embedded; if VITE_PUBLIC_ANALYTICS_DOMAIN is unset analytics is silently
    // disabled and the site works as normal.
    domain: import.meta.env.VITE_PUBLIC_ANALYTICS_DOMAIN || null,
    src: import.meta.env.VITE_PUBLIC_ANALYTICS_SRC || null,
    // Consent-gated: analytics only loads after explicit user consent when
    // VITE_PUBLIC_ANALYTICS_CONSENT_REQUIRED === 'true'.
    consentRequired: import.meta.env.VITE_PUBLIC_ANALYTICS_CONSENT_REQUIRED === 'true',
    // Disable entirely in development unless EXPLICITLY enabled.
    enabled: () =>
      import.meta.env.DEV === false &&
      !!import.meta.env.VITE_PUBLIC_ANALYTICS_DOMAIN &&
      !!import.meta.env.VITE_PUBLIC_ANALYTICS_SRC,
  },
  contact: {
    email: import.meta.env.VITE_PUBLIC_CONTACT_EMAIL || 'hello@webloom.app',
    // TODO(owner): Replace with the real registered business address before
    // production launch. Do NOT invent one.
    address: {
      line1: 'TODO: Registered business address — replace before launch',
      city: '',
      region: '',
      postalCode: '',
      country: '',
    },
    addressTodo: true,
  },
  legal: {
    // TODO(owner): Provide the actual entity name + governing law before
    // production launch. These pages mark every such fact as a placeholder.
    companyName: 'Webloom (TODO: legal entity name)',
    governingLaw: 'TODO: governing law jurisdiction',
    // TODO(owner): confirm whether analytics cookies / non-essential tracking
    // are used; the cookie banner is consent-gated either way.
    cookiesUsed: true,
  },
};

export const routes = {
  HOME: { path: '/', title: 'Webloom | AI-Powered Web Intelligence', description: 'Resolve verified business identities and generate conversion-ready websites with Webloom.' },
  LEADS_NEW: { path: '/leads/new', title: 'Webloom | Business Intelligence Analysis', description: 'Paste a Google Maps URL to extract verified business intelligence, digital audit, and opportunity score.' },
  LEADS_DETAIL_PREFIX: { path: '/leads/:id', title: 'Webloom | Lead Workspace', description: 'Review a business analysis workspace.' },
  WEBSITES: { path: '/websites', title: 'Webloom | Generated Websites', description: 'Manage generated websites from business analyses.' },
  PRICING: { path: '/pricing', title: 'Webloom | Pricing', description: 'Simple, transparent pricing for Webloom web intelligence and website generation.' },
  CONTACT: { path: '/contact', title: 'Webloom | Contact', description: 'Contact the Webloom team about web intelligence, business extraction, and website generation.' },
  THANK_YOU: { path: '/contact/thanks', title: 'Webloom | Message Sent', description: 'Your message has been sent and will be reviewed shortly.' },
  PRIVACY: { path: '/privacy', title: 'Webloom | Privacy Policy', description: 'How Webloom collects, uses, and protects data across its AI intelligence platform.' },
  TERMS: { path: '/terms', title: 'Webloom | Terms and Conditions', description: 'The terms that govern use of the Webloom platform.' },
  NOT_FOUND: { path: '*', title: 'Webloom | Page Not Found', description: 'The page you are looking for does not exist.' },
};

export default siteConfig;