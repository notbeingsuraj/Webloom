/**
 * ThankYou — Post-submission confirmation page.
 *
 * Shown only after a successful contact form submission. Includes
 * confirmation, what-happens-next copy, analytics conversion event,
 * and links back into the product. Never shown as a standalone landing page.
 */
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, LayoutDashboard } from 'lucide-react';
import Button from '../components/ui/Button';
import usePageMetadata from '../hooks/usePageMetadata';
import analytics from '../services/analytics';

export default function ThankYou() {
  usePageMetadata({
    title: 'Webloom | Message Sent',
    description: 'Your message to the Webloom team has been sent and will be reviewed shortly.',
    noindex: true,
  });

  useEffect(() => {
    analytics.conversion();
  }, []);

  return (
    <div className="mx-auto flex min-h-[65vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-verified/10 text-verified shadow-sm">
        <CheckCircle2 className="h-7 w-7" />
      </div>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Message sent
      </h1>

      <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
        Thanks for reaching out. We will review your message and get back to you
        within two business days if a response is required.
      </p>

      <p className="mt-2 text-sm text-muted-foreground">
        You can also continue using Webloom to analyse businesses and generate websites right away.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link to="/">
          <Button variant="default" size="md" leadingIcon={<LayoutDashboard className="h-4 w-4" />}>
            Go to dashboard
          </Button>
        </Link>
        <Link to="/leads/new">
          <Button variant="secondary" size="md" trailingIcon={<ArrowRight className="h-4 w-4" />}>
            Analyse a business
          </Button>
        </Link>
      </div>
    </div>
  );
}