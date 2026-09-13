/**
 * NotFound — Custom 404 page.
 *
 * Clear explanation, helpful links, consistent branding. Accessible, mobile-friendly.
 */
import { Link } from 'react-router-dom';
import { ArrowRight, LayoutDashboard } from 'lucide-react';
import usePageMetadata from '../hooks/usePageMetadata';
import { routes } from '../config/site';
import Button from './ui/Button';

export default function NotFound() {
  usePageMetadata(routes.NOT_FOUND);

  return (
    <div className="mx-auto flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      {/* decorative icon */}
      <div className="flex h-20 w-20 items-center justify-center rounded-[22px] border border-webloom-border bg-webloom-surface shadow-lg">
        <span className="text-4xl font-bold tracking-tight text-webloom-accent">404</span>
      </div>

      <h1 className="mt-8 text-3xl font-semibold tracking-tight text-webloom-text sm:text-4xl">
        Page not found
      </h1>

      <p className="mt-4 max-w-lg text-base leading-relaxed text-webloom-muted">
        The page you are looking for either doesn't exist, was moved, or is restricted to authenticated users.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link to="/">
          <Button variant="primary" size="md" leadingIcon={<LayoutDashboard className="h-4 w-4" />}>
            Go to dashboard
          </Button>
        </Link>
        <Link to="/leads/new">
          <Button variant="secondary" size="md" trailingIcon={<ArrowRight className="h-4 w-4" />}>
            Start an analysis
          </Button>
        </Link>
      </div>

      <p className="mt-8 text-xs text-webloom-dim">
        If you believe this is a mistake, contact{' '}
        <a href="mailto:hello@webloom.app" className="text-webloom-accent hover:text-webloom-accent-hover underline underline-offset-2">
          hello@webloom.app
        </a>
      </p>
    </div>
  );
}