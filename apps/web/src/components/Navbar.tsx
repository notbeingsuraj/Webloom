import { Link, useLocation } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import Button from './ui/Button';

export default function Navbar() {
  const location = useLocation();
  const isAnalysePage = location.pathname === '/leads/new';

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-1 py-4">
        <div className="flex items-center gap-3 md:gap-4">
          {/* Mobile brand (sidebar hidden) */}
          <div className="lg:hidden">
            <Link to="/" className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Webloom home">
              W
            </Link>
          </div>
          <div className="hidden rounded-full border border-border bg-card px-3 py-2 text-sm text-muted-foreground md:flex md:items-center md:gap-2">
            <Search className="h-4 w-4" />
            Search leads
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link to="/leads/new" className={isAnalysePage ? 'pointer-events-none' : ''}>
            <Button variant="secondary" size="sm" leadingIcon={<Plus className="h-4 w-4" />}>
              Analyse
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
