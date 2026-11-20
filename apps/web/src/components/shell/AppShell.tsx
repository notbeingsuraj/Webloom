import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Compass, Globe2, LayoutDashboard, Mail, Plus, Sparkles, Zap, Settings, Search, BarChart2, Shield, Network, FileText, Users, Menu, ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import Button from '../ui/Button';
import ThemeToggle from '../ThemeToggle';
import analytics from '../../services/analytics';

const NAV_SECTIONS = [
  {
    label: 'Overview',
    icon: LayoutDashboard,
    to: '/',
    match: (pathname: string) => pathname === '/',
  },
  {
    label: 'Discovery',
    icon: Compass,
    to: '/discovery',
    match: (pathname: string) => pathname.startsWith('/discovery'),
    children: [
      { label: 'Maps Scanner', to: '/discovery/scanner', match: (p: string) => p === '/discovery/scanner' },
      { label: 'Lead Discovery', to: '/discovery/leads', match: (p: string) => p === '/discovery/leads' },
      { label: 'Search History', to: '/discovery/history', match: (p: string) => p === '/discovery/history' },
      { label: 'Saved Searches', to: '/discovery/saved', match: (p: string) => p === '/discovery/saved' },
    ],
  },
  {
    label: 'Intelligence',
    icon: Network,
    to: '/intelligence',
    match: (pathname: string) => pathname.startsWith('/intelligence'),
    children: [
      { label: 'Business Intelligence', to: '/intelligence/business', match: (p: string) => p === '/intelligence/business' },
      { label: 'Digital Audits', to: '/intelligence/audits', match: (p: string) => p === '/intelligence/audits' },
      { label: 'Competitor Intelligence', to: '/intelligence/competitors', match: (p: string) => p === '/intelligence/competitors' },
      { label: 'Review Intelligence', to: '/intelligence/reviews', match: (p: string) => p === '/intelligence/reviews' },
      { label: 'Market Intelligence', to: '/intelligence/market', match: (p: string) => p === '/intelligence/market' },
    ],
  },
  {
    label: 'Operations',
    icon: Users,
    to: '/operations',
    match: (pathname: string) => pathname.startsWith('/operations'),
    children: [
      { label: 'Prospect Pipeline', to: '/operations/pipeline', match: (p: string) => p === '/operations/pipeline' },
      { label: 'Campaigns', to: '/operations/campaigns', match: (p: string) => p === '/operations/campaigns' },
      { label: 'Outreach', to: '/operations/outreach', match: (p: string) => p === '/operations/outreach' },
      { label: 'Website Opportunities', to: '/operations/websites', match: (p: string) => p === '/operations/websites' },
    ],
  },
  {
    label: 'Analytics',
    icon: BarChart2,
    to: '/analytics',
    match: (pathname: string) => pathname.startsWith('/analytics'),
    children: [
      { label: 'Lead Analytics', to: '/analytics/leads', match: (p: string) => p === '/analytics/leads' },
      { label: 'Market Analytics', to: '/analytics/market', match: (p: string) => p === '/analytics/market' },
      { label: 'Sales Analytics', to: '/analytics/sales', match: (p: string) => p === '/analytics/sales' },
      { label: 'AI Analytics', to: '/analytics/ai', match: (p: string) => p === '/analytics/ai' },
    ],
  },
  {
    label: 'Infrastructure',
    icon: Shield,
    to: '/infrastructure',
    match: (pathname: string) => pathname.startsWith('/infrastructure'),
    children: [
      { label: 'AI Console', to: '/infrastructure/ai-console', match: (p: string) => p === '/infrastructure/ai-console' },
      { label: 'Provider Health', to: '/infrastructure/providers', match: (p: string) => p === '/infrastructure/providers' },
      { label: 'Job Monitor', to: '/infrastructure/jobs', match: (p: string) => p === '/infrastructure/jobs' },
      { label: 'Data Sources', to: '/infrastructure/sources', match: (p: string) => p === '/infrastructure/sources' },
      { label: 'System Diagnostics', to: '/infrastructure/diagnostics', match: (p: string) => p === '/infrastructure/diagnostics' },
    ],
  },
];

const QUICK_ACTIONS = [
  { label: 'New Analysis', to: '/discovery/scanner', icon: Plus, color: 'from-primary to-ai' },
  { label: 'New Search', to: '/discovery/scanner', icon: Search, color: 'from-ai to-primary' },
];

const USER_NAV = [
  { label: 'Profile', to: '/settings/profile', icon: 'user' },
  { label: 'Team', to: '/settings/team', icon: 'users' },
  { label: 'Billing', to: '/settings/billing', icon: 'credit-card' },
  { label: 'Settings', to: '/settings', icon: 'settings' },
];

export default function AppShell() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');
  const isSectionActive = (section: { to: string }) => location.pathname === section.to || location.pathname.startsWith(section.to + '/');

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const toggleSidebarCollapsed = () => setSidebarCollapsed(!sidebarCollapsed);

  return (
    <div className="min-h-screen bg-bg-primary text-foreground">
      {/* Background mesh */}
      <div 
        className="fixed inset-0 wl-mesh pointer-events-none -z-10"
        aria-hidden="true"
      />
      
      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="min-h-screen bg-bg-primary text-foreground">
        <div className="mx-auto flex max-w-[1600px] gap-6 px-4 py-4 lg:px-6">
          {/* Sidebar */}
          <aside
            className={cn(
              'hidden w-72 shrink-0 lg:block',
              sidebarCollapsed && 'w-16',
              'sticky top-4'
            )}
            aria-label="Main navigation"
          >
            <div className="wl-card sticky top-4 flex h-[calc(100vh-2rem)] flex-col overflow-hidden p-4">
              {/* Background accent */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-gradient-to-br from-primary/12 via-ai/10 to-creative/10 blur-2xl"
              />
              
              <div className="relative px-3 pb-5 pt-2">
                <Link
                  to="/"
                  className="group flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Webloom home"
                >
                  <div className="group-hover:scale-105 flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-ai to-creative text-sm font-bold text-white shadow-glow-violet transition-transform">
                    W
                  </div>
                  <div>
                    <p className="font-display text-[15px] font-bold tracking-tight text-foreground">Webloom</p>
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Intelligence</p>
                  </div>
                </Link>
              </div>

              <nav className="relative mt-2 space-y-1" aria-label="Primary navigation">
                {NAV_SECTIONS.map((section) => {
                  const active = isSectionActive(section);
                  const hasChildren = section.children && section.children.length > 0;
                  const sectionActive = active || (hasChildren && section.children.some(child => location.pathname === child.to || location.pathname.startsWith(child.to + '/')));

                  return (
                    <div key={section.to} className="relative">
                      <Link
                        to={section.to}
                        aria-current={sectionActive ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          sectionActive
                            ? 'bg-gradient-to-r from-primary/15 to-ai/10 text-foreground shadow-sm ring-1 ring-primary/30'
                            : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                        )}
                        aria-expanded={activeSection === section.to}
                        onClick={(e) => {
                          if (hasChildren) {
                            e.preventDefault();
                            setActiveSection(activeSection === section.to ? null : section.to);
                          }
                        }}
                      >
                        <span
                          className={cn(
                            'flex h-7 w-7 items-center justify-center rounded-lg transition-colors',
                            activeSection === section.to ? 'bg-primary text-primary-foreground shadow-glow-blue' : 'bg-secondary text-muted-foreground'
                          )}
                        >
                          <section.icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="flex-1 truncate">{section.label}</span>
                        {hasChildren && (
                          <span className={cn(
                            'h-1.5 w-1.5 rounded-full transition-colors',
                            activeSection === section.to ? 'bg-primary' : 'bg-border'
                          )}
                        />}
                      </Link>
                      
                      {hasChildren && activeSection === section.to && (
                        <div className="ml-10 mt-1 space-y-0.5 animate-slide-down">
                          {section.children!.map((child) => (
                            <Link
                              key={child.to}
                              to={child.to}
                              aria-current={location.pathname === child.to ? 'page' : undefined}
                              className={cn(
                                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                location.pathname === child.to
                                  ? 'bg-primary/15 text-primary'
                                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                              )}
                            >
                              {child.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </nav>
              </div>

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
                    to="/discovery/scanner"
                    className="mt-4 flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-ai px-3 py-2 text-xs font-semibold text-white shadow-glow-blue transition-all hover:shadow-glow-violet focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New analysis
                  </Link>
                </div>
              </div>
            </div>
        </aside>

        {/* Mobile sidebar overlay */}
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        <div className="min-w-0 flex-1">
          {/* Topbar */}
          <header className="sticky top-0 z-20 -mx-1 px-1">
            <div className="wl-surface-raised mt-1 flex items-center justify-between gap-4 rounded-2xl border border-border py-2.5 pl-3 pr-2">
              <div className="flex items-center gap-2 md:gap-3">
                {/* Mobile menu button */}
                <button
                  onClick={() => setMobileSidebarOpen(true)}
                  className="lg:hidden flex h-9 w-9 items-center justify-center rounded-xl bg-card text-muted-foreground hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </button>

                {/* Mobile brand */}
                <div className="lg:hidden">
                  <Link to="/" className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-ai to-creative text-sm font-bold text-white shadow-glow-violet focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Webloom home">
                    W
                  </Link>
                </div>

                {/* Quick tabs (desktop) */}
                <div className="hidden shrink-0 flex items-center gap-2 md:flex">
                  <Link
                    to="/discovery/scanner"
                    className={cn(
                      'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                      location.pathname === '/discovery/scanner' ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                    )}
                  >
                    Scanner
                  </Link>
                  <Link
                    to="/discovery/leads"
                    className={cn(
                      'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                      location.pathname === '/discovery/leads' ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                    )}
                  >
                    Leads
                  </Link>
                </div>

                <div className="ml-1 hidden items-center gap-2 md:flex">
                  <Search className="h-4 w-4" />
                  Search leads
                </div>
              </div>

              <div className="flex items-center gap-2">
                <ThemeToggle />
                <Link to="/discovery/scanner" onClick={() => analytics.primaryCta('header_analyse')}>
                  <Button variant="default" size="lg" leadingIcon={<Sparkles className="h-4 w-4" />} trailingIcon={<ArrowRight className="h-4 w-4" />}>
                    New Analysis
                  </Button>
                </Link>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-[1180px] pb-20 pt-6 sm:pb-10">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
    </div>
  );
}

export default AppShell;