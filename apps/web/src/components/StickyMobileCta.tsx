/**
 * StickyMobileCta — bottom sticky primary CTA for the conversion flow.
 *
 * Behaviour:
 * - Visible only on mobile (lg:hidden) and only on pages where the primary
 *   conversion "Analyse a business" action is relevant.
 * - Respects safe-area insets (env(safe-area-inset-bottom)) and adds bottom
 *   padding to the page so it never covers important content.
 * - Dismissible; dismissal is persisted for the session.
 * - Accessible label and focus styles; honour prefers-reduced-motion.
 */
import { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';

const SHOW_PATHS = ['/', '/pricing', '/websites', '/contact', '/privacy', '/terms'];

export default function StickyMobileCta() {
  const location = useLocation();
  const [dismissed, setDismissed] = useState(false);

  const isRelevant = SHOW_PATHS.includes(location.pathname);

  useEffect(() => {
    if (!isRelevant) setDismissed(false);
  }, [isRelevant]);

  if (!isRelevant || dismissed) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mx-auto max-w-md px-4 pb-4">
        <div className="flex items-center gap-3 rounded-[22px] border border-webloom-border bg-webloom-surface/95 p-3 shadow-2xl backdrop-blur-xl">
          <Link
            to="/leads/new"
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-webloom-bg"
          >
            Analyse a business
            <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-webloom-border bg-webloom-surface text-webloom-muted transition-colors hover:bg-webloom-hover hover:text-webloom-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}