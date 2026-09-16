/**
 * Pricing — public marketing page with above-the-fold primary CTA wired to a
 * real route (/leads/new) and a secondary CTA.
 */
import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import Button from '../components/ui/Button';
import usePageMetadata from '../hooks/usePageMetadata';
import { routes } from '../config/site';

const plans = [
  {
    name: 'Starter',
    price: '$49',
    cadence: '/ month',
    description: 'For small teams starting with business intelligence.',
    features: ['50 analyses / month', 'Structured extraction', 'Digital presence audit', 'Email support'],
  },
  {
    name: 'Growth',
    price: '$149',
    cadence: '/ month',
    description: 'For teams scaling lead generation with website generation.',
    features: ['250 analyses / month', 'Website generation', 'Brand DNA profiles', 'Priority support'],
    featured: true,
  },
  {
    name: 'Momentum',
    price: 'Custom',
    cadence: '',
    description: 'For agencies and high-volume pipelines.',
    features: ['Unlimited analyses', 'API access', 'White-label output', 'Dedicated support'],
  },
];

export default function Pricing() {
  usePageMetadata(routes.PRICING);

  return (
    <div className="mx-auto max-w-5xl pb-20">
      {/* Above-the-fold: hero + primary CTA */}
      <header className="py-12 text-center sm:py-16">
        <p className="text-[11px] uppercase tracking-[0.18em] text-primary">Pricing</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Intelligence that pays for itself
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Turn Google Maps URLs into verified business profiles, digital audits, and conversion-ready websites — then focus on the outreach that wins.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/leads/new">
            <Button size="lg" trailingIcon={<ArrowRight className="h-4 w-4" />}>
              Start analysing free
            </Button>
          </Link>
          <Link to="/contact">
            <Button variant="secondary" size="lg">
              Talk to sales
            </Button>
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">No credit card required · Cancel anytime</p>
      </header>

      {/* Plans */}
      <section className="grid gap-6 md:grid-cols-3" aria-label="Plans">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={[
              'relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm transition-colors',
              plan.featured ? 'border-primary ring-1 ring-primary/40' : 'border-border',
            ].join(' ')}
          >
            {plan.featured && (
              <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground">
                Most popular
              </span>
            )}
            <h2 className="text-lg font-semibold text-foreground">{plan.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
            <p className="mt-6 flex items-baseline gap-1">
              <span className="text-4xl font-bold tracking-tight text-foreground">{plan.price}</span>
              {plan.cadence && <span className="text-sm text-muted-foreground">{plan.cadence}</span>}
            </p>
            <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Check className="h-3 w-3" />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-8">
              <Link to="/leads/new" className="block">
                <Button variant={plan.featured ? 'default' : 'secondary'} className="w-full">
                  {plan.name === 'Momentum' ? 'Contact us' : 'Start free'}
                </Button>
              </Link>
            </div>
          </div>
        ))}
      </section>

      <p className="mt-12 text-center text-xs text-muted-foreground">
        All plans include the Webloom extraction pipeline with provenance-aware quality control.
      </p>
    </div>
  );
}