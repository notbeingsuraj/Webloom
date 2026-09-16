import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Plus, Search } from 'lucide-react';
import Button from './ui/Button';
import ThemeToggle from './ThemeToggle';

const QUICK_TABS = [
  { label: 'Overview', to: '/', match: (p: string) => p === '/' },
  { label: 'Analyse', to: '/leads/new', match: (p: string) => p === '/leads/new' },
];

export default function Navbar() {
  const location = useLocation();
  const isAnalysePage = location.pathname === '/leads/new';

  return (
    <header className="sticky top-0 z-20 -mx-1 px-1">
      <div className="wl-surface-raised mt-1 flex items-center justify-between gap-4 rounded-2xl border border-border py-2.5 pl-3 pr-2">
        <div className="flex items-center gap-2 md:gap-3">
          {/* Mobile brand (sidebar hidden) */}
          <div className="lg:hidden">
            <Link to="/" className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-ai to-creative text-sm font-bold text-white shadow-glow-violet focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Webloom home">
              W
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
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                    active ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  ].join(' ')}
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
          <Link to="/leads/new" className={isAnalysePage ? 'pointer-events-none' : ''}>
            <Button variant="default" size="sm" leadingIcon={<Plus className="h-4 w-4" />} trailingIcon={<ArrowRight className="hidden h-3.5 w-3.5 sm:inline-flex" />}>
              Analyse
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
