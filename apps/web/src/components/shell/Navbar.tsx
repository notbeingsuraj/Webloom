import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Plus, Search, Menu, X, Sun, Moon } from 'lucide-react';
import { cn } from '../../lib/utils';
import Button from '../ui/Button';
import ThemeToggle from '../ui/ThemeToggle';

const QUICK_TABS = [
  { label: 'Scanner', to: '/discovery/scanner', match: (p: string) => p === '/discovery/scanner' },
  { label: 'Leads', to: '/discovery/leads', match: (p: string) => p === '/discovery/leads' },
];

export default function Navbar() {
  const location = useLocation();
  const isAnalysePage = location.pathname === '/discovery/scanner';

  return (
    <header className="sticky top-0 z-20 -mx-1 px-1">
      <div className="wl-surface-raised mt-1 flex items-center justify-between gap-4 rounded-2xl border border-border py-2.5 pl-3 pr-2">
        <div className="flex items-center gap-2 md:gap-3">
          {/* Mobile brand (sidebar hidden) */}
          <div className="lg:hidden">
            <Link to="/" onClick={() => analytics.primaryCta('home_click')}>
              <Button variant="ghost" size="icon" leadingIcon={<span className="font-display text-[15px] font-bold tracking-tight text-foreground">W</span>} className="rounded-xl" aria-label="Webloom home">
                <span className="font-display text-[15px] font-bold tracking-tight text-foreground">W</span>
              </Button>
            </Link>
          </div>

          {/* Quick tabs (desktop) */}
          <div className="hidden items-center gap-1 md:flex">
            {QUICK_TABS.map((tab) => {
              const active = tab.match(location.pathname);
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className={cn(
                    'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                    active ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  {tab.label}
                </Link>
              );
            })}
            <span className="ml-1 hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground lg:flex">
              <Search className="h-4 w-4" />
              Search leads
            </span>
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
  );
}

export default function Navbar() {
  const location = useLocation();
  const isAnalysePage = location.pathname === '/discovery/scanner';

  return (
    <header className="sticky top-0 z-20 -mx-1 px-1">
      <div className="wl-surface-raised mt-1 flex items-center justify-between gap-4 rounded-2xl border border-border py-2.5 pl-3 pr-2">
        <div className="flex items-center gap-2 md:gap-3">
          {/* Mobile brand (sidebar hidden) */}
          <div className="lg:hidden">
            <Link to="/" onClick={() => analytics.primaryCta('home_click')}>
              <Button variant="ghost" size="icon" leadingIcon={<span className="font-display text-[15px] font-bold tracking-tight text-foreground">W</span>} className="rounded-xl" aria-label="Webloom home">
                <span className="font-display text-[15px] font-bold tracking-tight text-foreground">W</span>
              </Button>
            </Link>
          </div>

          {/* Quick tabs (desktop) */}
          <div className="hidden items-center gap-1 md:flex">
            {QUICK_TABS.map((tab) => {
              const active = tab.match(location.pathname);
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className={cn(
                    'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                    active ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  {tab.label}
                </Link>
              );
            })}
            <span className="ml-1 hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground lg:flex">
              <Search className="h-4 w-4" />
              Search leads
            </span>
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
  );
}

export default Navbar;