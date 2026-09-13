/**
 * Contact routes — public contact form endpoint.
 *
 * Collects name/email/message with server-side validation. This endpoint is
 * intentionally minimal: it validates input, logs to the operational log, and
 * (when configured) forwards to a delivery destination.
 *
 * TODO(owner): configure VITE-facing delivery (email/webhook) before launch —
 * see apps/web/.env.example and CONTACT-ADDRESS-TODO.md. Until then the
 * endpoint is a compliant no-op that still returns a success shape so the
 * frontend thank-you flow works end to end.
 */
import { Router } from 'express';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateContact(body) {
  const errors = [];
  const data = { name: '', email: '', message: '' };

  if (typeof body?.name === 'string' && body.name.trim()) {
    data.name = body.name.trim().slice(0, 120);
  } else {
    errors.push({ field: 'name', message: 'Name is required' });
  }

  if (typeof body?.email === 'string' && EMAIL_RE.test(body.email.trim())) {
    data.email = body.email.trim().slice(0, 254);
  } else {
    errors.push({ field: 'email', message: 'Invalid email address' });
  }

  if (typeof body?.message === 'string' && body.message.trim().length >= 10) {
    data.message = body.message.trim().slice(0, 5000);
  } else {
    errors.push({ field: 'message', message: 'Message must be at least 10 characters' });
  }

  return { data, errors };
}

/**
 * POST /api/contact
 * Validates and accepts a contact message.
 */
router.post('/', async (req, res, next) => {
  try {
    const { data, errors } = validateContact(req.body ?? {});
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: errors[0]?.message || 'Validation failed',
        field: errors[0]?.field || null,
      });
    }

    // Best-effort delivery hooks (none configured by default).
    // TODO(owner): wire notification delivery here (email service / webhook).
    console.log(`[Contact] message from ${data.name} <${data.email}>: ${data.message.slice(0, 120)}${data.message.length > 120 ? '…' : ''}`);

    return res.status(201).json({ success: true });
  } catch (error) {
    return next(error);
  }
});

export default router;