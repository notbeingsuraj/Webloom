import { Outlet, Link, useLocation } from 'react-router-dom';
import Navbar from './Navbar';

export default function Layout() {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-[1600px] gap-6 px-4 py-4 lg:px-6">
        {/* Desktop sidebar */}
        <aside className="hidden w-72 shrink-0 rounded-2xl border border-border bg-card p-4 shadow-sm lg:block">
          <div className="flex h-full flex-col">
            <div className="px-3 pb-5 pt-2">
              <Link to="/" className="flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">W</div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Webloom</p>
                  <p className="text-sm font-medium text-foreground">Intelligence</p>
                </div>
              </Link>
            </div>

            <nav className="mt-4 space-y-1" aria-label="Primary navigation">
              <SidebarItem label="Overview" to="/" active={location.pathname === '/'} />
              <SidebarItem label="Analyse" to="/leads/new" active={location.pathname === '/leads/new'} />
              <SidebarItem label="Websites" to="/websites" active={location.pathname === '/websites'} />
              <SidebarItem label="Pricing" to="/pricing" active={location.pathname === '/pricing'} />
              <SidebarItem label="Contact" to="/contact" active={location.pathname === '/contact'} />
            </nav>

            <div className="mt-auto rounded-xl border border-border bg-secondary p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Web Intelligence</p>
              <p className="mt-2 text-sm font-medium text-foreground">Start with a Google Maps URL</p>
              <p className="mt-1 text-xs text-muted-foreground">Structured extraction · verified data · AI enrichment</p>
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

function SidebarItem({ label, to, active = false }: { label: string; to: string; active?: boolean }) {
  return (
    <Link
      to={to}
      className={[
        'flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
        active ? 'bg-secondary text-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
      ].join(' ')}
    >
      <span className={['inline-block h-2 w-2 rounded-full', active ? 'bg-primary' : 'bg-border'].join(' ')} />
      <span className="ml-3">{label}</span>
    </Link>
  );
}

