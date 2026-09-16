/**
 * Terms and Conditions — dedicated route.
 *
 * Covers actual Webloom platform behaviour. Legal/business facts that are
 * not available in the repository are explicitly marked as `TODO` — nothing
 * is invented.
 *
 * TODO(owner): Have a legal professional review before public launch.
 */
import usePageMetadata from '../hooks/usePageMetadata';
import { routes, siteConfig } from '../config/site';

const accent = 'text-primary';
const strong = 'font-medium text-foreground';

export default function Terms() {
  usePageMetadata(routes.TERMS);

  return (
    <article className="mx-auto max-w-3xl pb-20">
      <header className="mb-10">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Legal</p>
        <h1 className="mt-3 text-3xl font-bold font-display tracking-tight text-foreground">Terms and Conditions</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </header>

      <div className="space-y-8 text-[15px] leading-[1.8] text-muted-foreground">
        <Section title="1. Acceptance of terms">
          <p>
            By accessing or using Webloom you agree to these terms. If you do not agree, do not use the platform.
          </p>
        </Section>

        <Section title="2. Use of the platform">
          <ul className="list-disc space-y-2 pl-5">
            <li>You may only use Webloom for lawful purposes.</li>
            <li>You may not attempt to bypass extraction boundaries, access other accounts, or misuse AI capabilities.</li>
            <li>You are responsible for the URLs and source content you submit.</li>
          </ul>
        </Section>

        <Section title="3. AI-generated output">
          <p>
            Webloom produces AI-extracted and AI-inferred outputs. These outputs may be incomplete, approximate, or incorrect.
            AI outputs are <span className={strong}>not a substitute for independent verification</span> and must not be relied on as authoritative business facts.
          </p>
        </Section>

        <Section title="4. Intellectual property">
          <p>
            Webloom retains ownership of the platform, its codebase, and generated infrastructure.
            Business data and extracted profiles are provided for your use within the platform.
          </p>
        </Section>

        <Section title="5. Third-party services">
          <p>
            The platform may interact with third-party providers, hosting infrastructure, and AI model gateways.
            Those services are subject to their own terms and availability.
          </p>
        </Section>

        <Section title="6. Disclaimers">
          <p>
            Webloom is provided <span className={strong}>“as is”</span> and <span className={strong}>“as available”</span> without warranties of any kind, whether express or implied.
          </p>
          <p className="mt-2">
            <span className="text-webloom-warning font-medium">TODO: replace with your actual limitation-of-liability language after legal review.</span>
          </p>
        </Section>

        <Section title="7. Limitation of liability">
          <p>
            To the maximum extent permitted by law, Webloom is not liable for indirect, incidental, special, consequential, or punitive damages arising from your use of the platform.
          </p>
        </Section>

        <Section title="8. Termination">
          <p>We may suspend or terminate access if these terms are violated or if the platform is misused.</p>
        </Section>

        <Section title="9. Governing law">
          <p>
            These terms are governed by the laws of <span className="text-webloom-warning font-medium">{siteConfig.legal.governingLaw}</span>.
          </p>
        </Section>

        <Section title="10. Contact">
          <p>
            Questions about these terms should be sent to{' '}
            <a className={accent} href={`mailto:${siteConfig.contact.email}`}>{siteConfig.contact.email}</a>.
          </p>
        </Section>
      </div>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}