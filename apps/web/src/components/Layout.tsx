import { Outlet, Link, useLocation } from 'react-router-dom';
import Navbar from './Navbar';

export default function Layout() {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-webloom-bg text-webloom-text">
      <div className="mx-auto flex max-w-[1600px] gap-6 px-4 py-4 lg:px-6">
        {/* Desktop sidebar */}
        <aside className="hidden w-72 shrink-0 rounded-[28px] border border-webloom-border bg-webloom-surface p-4 shadow-[0_20px_50px_rgba(0,0,0,0.25)] lg:block">
          <div className="flex h-full flex-col">
            <div className="px-3 pb-5 pt-2">
              <Link to="/" className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-xl">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-sm font-bold text-white">W</div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-webloom-dim">Webloom</p>
                  <p className="text-sm font-medium text-webloom-text">Intelligence</p>
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

            <div className="mt-auto rounded-2xl border border-webloom-border bg-webloom-raised p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-dim">Web Intelligence</p>
              <p className="mt-2 text-sm font-medium text-webloom-text">Start with a Google Maps URL</p>
              <p className="mt-1 text-xs text-webloom-muted">Structured extraction · verified data · AI enrichment</p>
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
        active ? 'bg-primary-600 text-white' : 'text-webloom-muted hover:bg-webloom-hover hover:text-webloom-text',
      ].join(' ')}
    >
      <span className="inline-block h-2 w-2 rounded-full bg-current opacity-80" />
      <span className="ml-3">{label}</span>
    </Link>
  );
}

