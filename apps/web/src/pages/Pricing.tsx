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
      <header className="wl-card wl-mesh relative overflow-hidden py-12 text-center sm:py-16">
        <p className="wl-eyebrow relative">Pricing</p>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Intelligence that pays for <span className="text-gradient-brand">itself</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Turn Google Maps URLs into verified business profiles, digital audits, and conversion-ready websites — then focus on the outreach that wins.
        </p>
        <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
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
        <p className="relative mt-4 text-xs text-muted-foreground">No credit card required · Cancel anytime</p>
      </header>

      {/* Plans */}
      <section className="grid gap-6 md:grid-cols-3" aria-label="Plans">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={[
              'relative flex flex-col overflow-hidden rounded-3xl border bg-card transition-all duration-200',
              plan.featured
                ? 'border-primary/50 ring-1 ring-primary/40 shadow-glow-blue'
                : 'border-border hover:border-primary/30 hover:shadow-card-hover',
            ].join(' ')}
          >
            {/* featured gradient bar */}
            {plan.featured && (
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-ai to-creative" />
            )}
            {plan.featured && (
              <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-primary to-ai px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-glow-blue">
                Most popular
              </span>
            )}
            <div className="relative p-6">
              <h2 className="font-display text-lg font-bold text-foreground">{plan.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              <p className="mt-6 flex items-baseline gap-1">
                <span className="font-display text-4xl font-bold tracking-tight text-foreground">{plan.price}</span>
                {plan.cadence && <span className="text-sm text-muted-foreground">{plan.cadence}</span>}
              </p>
              <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-verified/15 text-verified">
                      <Check className="h-3 w-3" />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-auto border-t border-border bg-secondary/40 px-6 py-5">
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