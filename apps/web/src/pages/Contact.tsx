/**
 * Contact — public contact page with form (client-side validated, field-level
 * error display, analytics events, accessible labels, preserved input on error).
 *
 * TODO(owner): Provide a real API endpoint to handle the submission before
 * production launch. Currently posts to /api/contact via the existing api client.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Mail, MapPin, Send } from 'lucide-react';
import Button from '../components/ui/Button';
import usePageMetadata from '../hooks/usePageMetadata';
import { routes, siteConfig } from '../config/site';
import analytics from '../services/analytics';
import api from '../services/api';

interface FormErrors {
  name?: string;
  email?: string;
  message?: string;
}

export default function Contact() {
  usePageMetadata(routes.CONTACT);
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validate = (): FormErrors => {
    const e: FormErrors = {};
    if (!form.name.trim()) e.name = 'Please enter your name.';
    if (!form.email.trim()) e.email = 'Please enter an email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Please enter a valid email address.';
    if (!form.message.trim()) e.message = 'Please enter a message.';
    else if (form.message.trim().length < 10) e.message = 'Please write at least 10 characters.';
    return e;
  };

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const fieldErrors = validate();
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) {
      analytics.formFailure('contact');
      return;
    }
    setSubmitting(true);
    setServerError(null);
    try {
      await api.post('/contact', form);
      analytics.formSuccess('contact');
      navigate('/contact/thanks', { replace: true });
    } catch {
      setServerError('Something went wrong. Please try again in a moment.');
      analytics.formFailure('contact');
    } finally {
      setSubmitting(false);
    }
  };

  const field = (id: 'name' | 'email' | 'message') => (
    <div className="space-y-1.5">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-foreground capitalize">{id === 'name' ? 'Your name' : id === 'email' ? 'Email address' : 'Message'}</label>
      {id === 'message' ? (
        <textarea
          id={id}
          rows={5}
          value={form[id]}
          onChange={(e) => setForm({ ...form, [id]: e.target.value })}
          aria-invalid={!!errors[id]}
          aria-describedby={errors[id] ? `${id}-error` : undefined}
          className={`w-full rounded-2xl border ${errors[id] ? 'border-destructive' : 'border-border'} bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring`}
        />
      ) : (
        <input
          id={id}
          type={id === 'email' ? 'email' : 'text'}
          value={form[id]}
          onChange={(e) => setForm({ ...form, [id]: e.target.value })}
          aria-invalid={!!errors[id]}
          aria-describedby={errors[id] ? `${id}-error` : undefined}
          className={`w-full rounded-2xl border ${errors[id] ? 'border-destructive' : 'border-border'} bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring`}
        />
      )}
      {errors[id] && (
        <p id={`${id}-error`} className="flex items-center gap-1.5 text-xs text-destructive" role="alert">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {errors[id]}
        </p>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl pb-12">
      <header className="mb-10">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Contact</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Talk to the Webloom team</h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
          Have a question about business intelligence, website generation, or platform access? Send a message and we will get back to you.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_0.38fr]">
        <form onSubmit={onSubmit} className="wl-card p-6 sm:p-8" noValidate>
          <div className="space-y-5">
            {field('name')}
            {field('email')}
            {field('message')}

            {serverError && (
              <div className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
                {serverError}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button type="submit" size="md" disabled={submitting} trailingIcon={submitting ? undefined : <Send className="h-4 w-4" />}>
                {submitting ? 'Sending…' : 'Send message'}
              </Button>
            </div>
          </div>
        </form>

        <aside className="wl-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Get in touch</h2>
          <div className="mt-5 space-y-4 text-sm text-muted-foreground">
            <p className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                <Mail className="h-4 w-4" />
              </span>
              <span>
                Email us at<br />
                <a href={`mailto:${siteConfig.contact.email}`} className="font-medium text-primary hover:text-primary/80">{siteConfig.contact.email}</a>
              </span>
            </p>
            <p className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                <MapPin className="h-4 w-4" />
              </span>
              <span>
                Registered address<br />
                <span className="font-medium text-amber-600">
                  {typeof siteConfig.contact.address === 'string'
                    ? siteConfig.contact.address
                    : siteConfig.contact.address.line1 || 'TODO: provide registered address'}
                </span>
              </span>
            </p>
          </div>
          <div className="mt-6 rounded-2xl border border-webloom-border bg-webloom-raised p-4 text-xs leading-5 text-webloom-dim">
            We aim to respond within two business days.
          </div>
        </aside>
      </div>
    </div>
  );
}