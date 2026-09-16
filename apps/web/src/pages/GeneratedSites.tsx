import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ExternalLink, Globe, Loader, MapPin, Play, Plus, RefreshCw, Square, Trash2,
} from 'lucide-react';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import usePageMetadata from '../hooks/usePageMetadata';
import websiteService, { type GeneratedSite, type GeneratePayload } from '../services/websiteService';
import api from '../services/api';

interface AnalyzedBusiness {
  identity: { name: string | null; category?: string | null; description?: string | null };
  contact: { phone?: string | null; email?: string | null; website?: string | null };
  location: { address?: string | null; city?: string | null; state?: string | null; country?: string | null; coordinates?: { lat: number; lng: number } | null };
  openingHours?: Record<string, unknown> | null;
  rating?: number | null;
  reviewCount?: number | null;
  source?: { providers?: Record<string, string | null | boolean> };
}

const styles = {
  card: 'wl-card p-6',
  eyebrow: 'text-[11px] uppercase tracking-[0.18em] text-muted-foreground',
  field: 'flex h-11 w-full rounded-xl border border-input bg-background px-4 py-3 text-base text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring',
  label: 'mb-2 block text-sm font-medium text-foreground',
  stat: 'rounded-2xl border border-border bg-card p-4 shadow-sm',
  chip: 'inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-muted-foreground',
};

export default function GeneratedSites() {
  usePageMetadata({
    title: 'Webloom | Generated Websites',
    description: 'Manage generated websites from business analyses.',
    noindex: true, // authenticated product surface
  });
  const queryClient = useQueryClient();
  const [mapsUrl, setMapsUrl] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [generated, setGenerated] = useState<{ slug: string; url?: string; port?: number } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['generated-sites'],
    queryFn: websiteService.list,
  });

  const generateMutation = useMutation({
    mutationFn: async (payload: GeneratePayload) => {
      setStatusMessage('Analyzing business…');
      // Step 1: analyze the Google Maps URL to build the verified profile.
      const analyze = await api.post<{ success: boolean; business: AnalyzedBusiness }>('/business/analyze', payload);
      const business = analyze.data.business;
      if (!analyze.data.success || !business?.identity?.name) {
        throw new Error('Analysis returned no business data.');
      }
      setStatusMessage('Verified profile ready — generating website…');
      // Step 2: generate using the verified server-side profile (no client facts).
      const res = await websiteService.generate({ business }, (m) => setStatusMessage(m));
      return { res, business };
    },
    onSuccess: ({ res, business }) => {
      const w = res.website;
      if (w?.slug) {
        setGenerated({ slug: w.slug, url: w.url ?? `http://localhost:${w.port}`, port: w.port ?? undefined });
      }
      setStatusMessage(`Website ready: ${business?.identity?.name || w?.slug}.`);
      queryClient.invalidateQueries({ queryKey: ['generated-sites'] });
    },
    onError: (e: Error) => {
      setStatusMessage(`Generation failed: ${e.message}`);
    },
  });

  const startMutation = useMutation({
    mutationFn: websiteService.start,
    onSuccess: (r) => {
      const w = r.website;
      setGenerated({ slug: w.slug, url: w.url ?? `http://localhost:${w.port}`, port: w.port ?? undefined });
      queryClient.invalidateQueries({ queryKey: ['generated-sites'] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: websiteService.stop,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['generated-sites'] }),
  });

  const regenerateMutation = useMutation({
    mutationFn: (slug: string) => websiteService.regenerate(slug),
    onSuccess: (r) => {
      const w = r.website;
      setGenerated({ slug: w.slug, url: w.url ?? `http://localhost:${w.port}`, port: w.port ?? undefined });
      queryClient.invalidateQueries({ queryKey: ['generated-sites'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: websiteService.remove,
    onSuccess: () => {
      setGenerated(null);
      queryClient.invalidateQueries({ queryKey: ['generated-sites'] });
    },
  });

  const sites: GeneratedSite[] = data?.sites ?? [];
  const busy = generateMutation.isPending || startMutation.isPending || regenerateMutation.isPending;

  const openWebsite = (url?: string | null) => {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className={styles.card}>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className={styles.eyebrow}>Website generation</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.06em] text-foreground md:text-[2.7rem]">
              Local websites, generated from verified facts.
            </h1>
            <p className="mt-3 max-w-2xl text-base text-muted-foreground">
              Paste a Google Maps URL. Webloom analyzes the business, then renders a polished local website from the
              verified profile — no fabricated phone numbers, addresses, or reviews.
            </p>
          </div>
          <div className={styles.chip}>
            <Globe className="h-3.5 w-3.5 text-primary" />
            Runs on localhost only
          </div>
        </div>
      </header>

      {/* Generate form */}
      <section className={styles.card}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!mapsUrl.trim()) return;
            generateMutation.mutate({ googleMapsUrl: mapsUrl.trim() });
          }}
          className="space-y-4"
        >
          <div>
            <label className={styles.label} htmlFor="maps-url">Google Maps URL</label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <input
                id="maps-url"
                type="url"
                required
                className={`${styles.field} pl-12`}
                placeholder="https://maps.google.com/?cid=123456789"
                value={mapsUrl}
                onChange={(e) => setMapsUrl(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy || !mapsUrl.trim()} leadingIcon={busy ? <Loader className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}>
              {busy ? 'Working…' : 'Analyze & Generate Website'}
            </Button>
            {statusMessage && (
              <span className="text-sm text-muted-foreground">{statusMessage}</span>
            )}
          </div>
        </form>

        {generateMutation.isPending && (
          <div className="mt-5 rounded-xl border border-border bg-secondary p-4" role="status" aria-live="polite">
            <div className="flex items-center gap-3">
              <Loader className="h-5 w-5 animate-spin text-primary" />
              <p className="text-sm text-foreground">{statusMessage || 'Generating…'} This can take a minute (dependencies, Astro build, local server).</p>
            </div>
          </div>
        )}
      </section>

      {generated && generated.url && (
        <section className={`${styles.card} flex flex-wrap items-center justify-between gap-4 border-emerald-200 bg-verified/10`}>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Globe className="h-6 w-6" />
            </div>
            <div>
              <p className={styles.eyebrow}>Just generated</p>
              <p className="text-lg font-semibold tracking-[-0.04em] text-foreground">{generated.slug}</p>
              <p className="text-sm text-muted-foreground">{generated.url}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" leadingIcon={<ExternalLink className="h-4 w-4" />} onClick={() => openWebsite(generated.url)}>
              Open Website
            </Button>
            <Button size="sm" variant="secondary" leadingIcon={<Square className="h-4 w-4" />} onClick={() => stopMutation.mutate(generated.slug)}>
              Stop
            </Button>
            <Button size="sm" variant="secondary" leadingIcon={<RefreshCw className="h-4 w-4" />} onClick={() => regenerateMutation.mutate(generated.slug)}>
              Regenerate
            </Button>
          </div>
        </section>
      )}

      {/* Generated sites list */}
      <section className={styles.card}>
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold tracking-[-0.04em] text-foreground">Generated sites</h2>
          <span className="text-sm text-muted-foreground">{sites.length} total</span>
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground" role="status">Loading sites…</div>
        ) : sites.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No generated sites yet. Paste a Google Maps URL above to create your first one.
          </div>
        ) : (
          <div className="space-y-3">
            {sites.map((site) => (
              <div key={site.slug} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-secondary p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background text-primary">
                    <Globe className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{site.slug}</p>
                    <p className="text-xs text-muted-foreground">{site.url || `Port ${site.port ?? '—'}`}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={site.status === 'running' ? 'won' : 'new'} />
                  {site.status === 'running' ? (
                    <>
                      <Button size="sm" leadingIcon={<ExternalLink className="h-4 w-4" />} onClick={() => openWebsite(site.url)}>
                        Open
                      </Button>
                      <Button size="sm" variant="secondary" leadingIcon={<Square className="h-4 w-4" />} onClick={() => stopMutation.mutate(site.slug)}>
                        Stop
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" leadingIcon={<Play className="h-4 w-4" />} onClick={() => startMutation.mutate(site.slug)}>
                      Start
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" leadingIcon={<RefreshCw className="h-4 w-4" />} onClick={() => regenerateMutation.mutate(site.slug)}>
                    Regenerate
                  </Button>
                  <Button size="sm" variant="destructive" leadingIcon={<Trash2 className="h-4 w-4" />} onClick={() => {
                    if (window.confirm(`Delete generated site "${site.slug}"?`)) removeMutation.mutate(site.slug);
                  }}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}