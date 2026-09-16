import { Outlet, Link, useLocation } from 'react-router-dom';
import { Compass, Globe2, LayoutDashboard, Mail, Plus, Sparkles, Zap } from 'lucide-react';
import Navbar from './Navbar';
import { cn } from '../lib/utils';

const NAV_ITEMS = [
  { label: 'Overview', to: '/', icon: LayoutDashboard, match: (p: string) => p === '/' },
  { label: 'Analyse', to: '/leads/new', icon: Sparkles, match: (p: string) => p === '/leads/new' },
  { label: 'Websites', to: '/websites', icon: Globe2, match: (p: string) => p === '/websites' },
  { label: 'Pricing', to: '/pricing', icon: Zap, match: (p: string) => p === '/pricing' },
  { label: 'Contact', to: '/contact', icon: Mail, match: (p: string) => p === '/contact' },
];

export default function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-[1600px] gap-6 px-4 py-4 lg:px-6">
        {/* Desktop sidebar */}
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="wl-card sticky top-4 flex h-[calc(100vh-2rem)] flex-col overflow-hidden p-4">
            {/* sidebar gradient accent */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-gradient-to-br from-primary/12 via-ai/10 to-creative/10 blur-2xl"
            />

            <div className="relative px-3 pb-5 pt-2">
              <Link to="/" className="group flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-ai to-creative text-sm font-bold text-white shadow-glow-violet transition-transform group-hover:scale-105">
                  W
                </div>
                <div>
                  <p className="font-display text-[15px] font-bold tracking-tight text-foreground">Webloom</p>
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Intelligence</p>
                </div>
              </Link>
            </div>

            <nav className="relative mt-2 space-y-1" aria-label="Primary navigation">
              {NAV_ITEMS.map((item) => {
                const active = item.match(location.pathname);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'bg-gradient-to-r from-primary/15 to-ai/10 text-foreground shadow-sm ring-1 ring-primary/30'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-lg transition-colors',
                        active ? 'bg-primary text-primary-foreground shadow-glow-blue' : 'bg-secondary text-muted-foreground',
                      )}
                    >
                      <item.icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="flex-1">{item.label}</span>
                    <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-primary' : 'bg-border')} />
                  </Link>
                );
              })}
            </nav>

            {/* Pipeline teaser card */}
            <div className="relative mt-auto mb-1">
              <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-ai/5 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-opportunity/15 text-opportunity">
                    <Compass className="h-4 w-4" />
                  </span>
                  <p className="wl-eyebrow">Web Intelligence</p>
                </div>
                <p className="mt-3 text-sm font-semibold text-foreground">Start with a Google Maps URL</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Structured extraction · verified data · AI enrichment</p>
                <Link
                  to="/leads/new"
                  className="mt-4 flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-ai px-3 py-2 text-xs font-semibold text-white shadow-glow-blue transition-all hover:shadow-glow-violet focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New analysis
                </Link>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <Navbar />
          <main className="mx-auto max-w-[1180px] pb-20 pt-6 sm:pb-10">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
