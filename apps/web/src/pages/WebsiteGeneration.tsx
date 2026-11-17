import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe, Loader, MapPin, Play, Plus, RefreshCw, Square, Trash2, ExternalLink, Code, Download, Eye, Sparkles, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import { Chip } from '../components/ui/Chip';
import { cn } from '../lib/utils';
import usePageMetadata from '../hooks/usePageMetadata';
import { leadService } from '../services/leadService';
import { websiteService, GeneratedSite, GeneratePayload } from '../services/websiteService';
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

export default function WebsiteGeneration() {
  const queryClient = useQueryClient();
  const [mapsUrl, setMapsUrl] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [generated, setGenerated] = useState<{ slug: string; url?: string; port?: number } | null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [activeTab, setActiveTab] = useState<'generate' | 'manage'>('generate');

  usePageMetadata({
    title: 'Webloom | Website Generation',
    description: 'Generate local websites from verified business intelligence.',
    noindex: true,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['generated-sites'],
    queryFn: websiteService.list,
  });

  const generateMutation = useMutation({
    mutationFn: async (payload: GeneratePayload) => {
      setStatusMessage('Analyzing business…');
      const analyze = await api.post<{ success: boolean; business: AnalyzedBusiness }>('/business/analyze', payload);
      const business = analyze.data.business;
      if (!analyze.data.success || !business?.identity?.name) {
        throw new Error('Analysis returned no business data.');
      }
      setStatusMessage('Verified profile ready — generating website…');
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
      <header className="wl-card wl-mesh relative overflow-hidden p-6 md:p-8">
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="wl-eyebrow">Website generation</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.06em] text-foreground md:text-[2.7rem]">
              Local websites, generated from <span className="text-gradient-brand">verified facts</span>.
            </h1>
            <p className="mt-3 max-w-2xl text-base text-muted-foreground">
              Paste a Google Maps URL. Webloom analyzes the business, then renders a polished local website from the
              verified profile — no fabricated phone numbers, addresses, or reviews.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-ai/25 bg-ai/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ai">
            <Sparkles className="h-3.5 w-3.5" />
            Google Maps scraper
          </div>
        </div>

        <div className="relative mt-8 flex flex-col gap-2 border-t border-border/70 pt-5 md:flex-row md:items-center md:gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('generate')}
            className={cn('rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200', activeTab === 'generate' ? 'bg-gradient-to-r from-primary to-ai text-white shadow-glow-blue' : 'bg-secondary text-muted-foreground hover:bg-secondary/70 hover:text-foreground')}
          >
            <Plus className="h-4 w-4 mr-2" />
            Generate
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manage')}
            className={cn('rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200', activeTab === 'manage' ? 'bg-gradient-to-r from-primary to-ai text-white shadow-glow-blue' : 'bg-secondary text-muted-foreground hover:bg-secondary/70 hover:text-foreground')}
          >
            <Globe className="h-4 w-4 mr-2" />
            Manage Sites
          </button>
        </div>
      </header>

      {activeTab === 'generate' && (
        <section className="wl-card p-6 space-y-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!mapsUrl.trim()) return;
              generateMutation.mutate({ googleMapsUrl: mapsUrl.trim() });
            }}
            className="space-y-6"
          >
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground" htmlFor="maps-url">Google Maps URL</label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="maps-url"
                  type="url"
                  required
                  className="wl-input py-4 pl-12 pr-4 text-base"
                  placeholder="https://maps.google.com/place/Business+Name/@lat,lng,zoom"
                  value={mapsUrl}
                  onChange={(e) => setMapsUrl(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-foreground">Depth</span>
                <select className="wl-input py-3" value={2} onChange={(e) => {}} disabled>
                  <option value="1">1 (Fast)</option>
                  <option value="2" selected>2 (Standard)</option>
                  <option value="3">3 (Deep)</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-foreground">Max results</span>
                <input type="number" min="1" max="100" className="wl-input py-3" value={20} onChange={(e) => {}} disabled />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-foreground">Mode</span>
                <select className="wl-input py-3" value="normal" onChange={(e) => {}} disabled>
                  <option value="normal">Normal (full data)</option>
                  <option value="fast">Fast (basic data)</option>
                </select>
              </label>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" checked={false} onChange={() => {}} disabled className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                  Extract emails
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" checked={false} onChange={() => {}} disabled className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                  Extra reviews
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={busy || !mapsUrl.trim()} leadingIcon={busy ? <Loader className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}>
                {busy ? 'Working…' : 'Analyze & Generate Website'}
              </Button>
              {statusMessage && <span className="text-sm text-muted-foreground">{statusMessage}</span>}
            </div>

            {generateMutation.isPending && (
              <div className="mt-5 rounded-xl border border-border bg-secondary p-4" role="status" aria-live="polite">
                <div className="flex items-center gap-3">
                  <Loader className="h-5 w-5 animate-spin text-primary" />
                  <p className="text-sm text-foreground">{statusMessage || 'Generating…'} This can take a minute (dependencies, Astro build, local server).</p>
                </div>
              </div>
            )}
          </form>

          {generated && generated.url && (
            <section className="wl-card flex flex-wrap items-center justify-between gap-4 border-emerald-200 bg-verified/10">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                  <Globe className="h-6 w-6" />
                </div>
                <div>
                  <p className="wl-eyebrow">Just generated</p>
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
        </section>
      )}

      {activeTab === 'manage' && (
        <section className="wl-card space-y-6">
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
                    <StatusBadge status={site.status === 'running' ? 'verified' : 'new'} />
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
      )}
    </div>
  );
}