/**
 * usePageMetadata — per-route SEO metadata.
 *
 * Sets document.title, meta description, canonical link, and Open Graph /
 * Twitter metadata uniquely per route. Private / authenticated pages render
 * `noindex` so they are never indexable.
 */
import { useEffect } from 'react';
import { siteConfig } from '../config/site';

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

interface PageMetadata {
  title: string;
  description: string;
  /** true for private / authenticated pages that must not be indexable */
  noindex?: boolean;
  /** canonical URL overrides the default `${url}${pathname}` */
  canonicalPath?: string;
}

export default function usePageMetadata({ title, description, noindex = false, canonicalPath }: PageMetadata) {
  useEffect(() => {
    document.title = title;

    // Unique meta description per page (required for distinctiveness in SERPs).
    upsertMeta('name', 'description', description);

    // Canonical URL — never expose private routes with a canonical link.
    if (!noindex) {
      const path = canonicalPath ?? window.location.pathname;
      upsertLink('canonical', `${siteConfig.url}${path}`);
    } else {
      document.head.querySelectorAll('link[rel="canonical"]').forEach((el) => el.remove());
    }

    // Open Graph (unique per page when it applies).
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:url', `${siteConfig.url}${canonicalPath ?? window.location.pathname}`);
    upsertMeta('property', 'og:image', siteConfig.ogImage);
    upsertMeta('property', 'og:image:width', '1200');
    upsertMeta('property', 'og:image:height', '630');
    upsertMeta('property', 'og:type', 'website');

    // Twitter / X card.
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);
    upsertMeta('name', 'twitter:image', siteConfig.ogImage);

    // Robots: private / authenticated pages are excluded from indexing.
    upsertMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');

    return () => {
      // Leave document title to the next page effect; nothing else to clean.
    };
  }, [title, description, noindex, canonicalPath]);
}