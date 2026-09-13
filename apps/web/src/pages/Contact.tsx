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
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-webloom-text capitalize">{id === 'name' ? 'Your name' : id === 'email' ? 'Email address' : 'Message'}</label>
      {id === 'message' ? (
        <textarea
          id={id}
          rows={5}
          value={form[id]}
          onChange={(e) => setForm({ ...form, [id]: e.target.value })}
          aria-invalid={!!errors[id]}
          aria-describedby={errors[id] ? `${id}-error` : undefined}
          className={`w-full rounded-2xl border ${errors[id] ? 'border-webloom-danger' : 'border-webloom-border'} bg-webloom-surface px-4 py-3 text-sm text-webloom-text outline-none transition focus:border-primary-500 focus:bg-webloom-raised`}
        />
      ) : (
        <input
          id={id}
          type={id === 'email' ? 'email' : 'text'}
          value={form[id]}
          onChange={(e) => setForm({ ...form, [id]: e.target.value })}
          aria-invalid={!!errors[id]}
          aria-describedby={errors[id] ? `${id}-error` : undefined}
          className={`w-full rounded-2xl border ${errors[id] ? 'border-webloom-danger' : 'border-webloom-border'} bg-webloom-surface px-4 py-3 text-sm text-webloom-text outline-none transition focus:border-primary-500 focus:bg-webloom-raised`}
        />
      )}
      {errors[id] && (
        <p id={`${id}-error`} className="flex items-center gap-1.5 text-xs text-webloom-danger" role="alert">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {errors[id]}
        </p>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl pb-12">
      <header className="mb-10">
        <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-dim">Contact</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-webloom-text">Talk to the Webloom team</h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-webloom-muted">
          Have a question about business intelligence, website generation, or platform access? Send a message and we will get back to you.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_0.38fr]">
        <form onSubmit={onSubmit} className="rounded-[30px] border border-webloom-border bg-webloom-surface p-6 shadow-lg sm:p-8" noValidate>
          <div className="space-y-5">
            {field('name')}
            {field('email')}
            {field('message')}

            {serverError && (
              <div className="rounded-2xl border border-red-800/50 bg-red-900/30 px-4 py-3 text-sm text-red-300" role="alert">
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

        <aside className="rounded-[30px] border border-webloom-border bg-webloom-surface p-6 shadow-lg">
          <h2 className="text-lg font-semibold text-webloom-text">Get in touch</h2>
          <div className="mt-5 space-y-4 text-sm text-webloom-muted">
            <p className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-webloom-raised text-primary-400">
                <Mail className="h-4 w-4" />
              </span>
              <span>
                Email us at<br />
                <a href={`mailto:${siteConfig.contact.email}`} className="font-medium text-webloom-accent hover:text-webloom-accent-hover">{siteConfig.contact.email}</a>
              </span>
            </p>
            <p className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-webloom-raised text-primary-400">
                <MapPin className="h-4 w-4" />
              </span>
              <span>
                Registered address<br />
                <span className="font-medium text-webloom-warning">{siteConfig.contact.address.line1 || siteConfig.contact.address}</span>
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