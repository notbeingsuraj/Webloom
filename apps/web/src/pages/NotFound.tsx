/**
 * NotFound — Custom 404 page.
 *
 * Clear explanation, helpful links, consistent branding. Accessible, mobile-friendly.
 */
import { Link } from 'react-router-dom';
import { ArrowRight, LayoutDashboard } from 'lucide-react';
import usePageMetadata from '../hooks/usePageMetadata';
import { routes } from '../config/site';
import Button from '../components/ui/Button';

export default function NotFound() {
  usePageMetadata(routes.NOT_FOUND);

  return (
    <div className="mx-auto flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      {/* decorative icon */}
      <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-card shadow-card">
        <div aria-hidden="true" className="pointer-events-none absolute -right-3 -top-3 h-10 w-10 rounded-full bg-creative/20 blur-xl" />
        <span className="text-4xl font-bold tracking-tight text-primary">404</span>
      </div>

      <h1 className="font-display mt-8 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        Page not found
      </h1>

      <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
        The page you are looking for either doesn't exist, was moved, or is restricted to authenticated users.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link to="/">
          <Button variant="default" size="md" leadingIcon={<LayoutDashboard className="h-4 w-4" />}>
            Go to dashboard
          </Button>
        </Link>
        <Link to="/leads/new">
          <Button variant="secondary" size="md" trailingIcon={<ArrowRight className="h-4 w-4" />}>
            Start an analysis
          </Button>
        </Link>
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        If you believe this is a mistake, contact{' '}
        <a href="mailto:hello@webloom.app" className="text-primary hover:text-primary/80 underline underline-offset-2">
          hello@webloom.app
        </a>
      </p>
    </div>
  );
}