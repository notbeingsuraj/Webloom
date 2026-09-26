import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

// Import route modules
import healthRoutes from './routes/health.js';
import businessRoutes from './routes/business.js';
import leadsRoutes from './routes/leads.js';
import brandStrategyRoutes from './routes/brandStrategy.js';
import landingPageRoutes from './routes/landingPage.js';
import digitalAuditRoutes from './routes/digitalAudit.js';
import websiteRoutes from './routes/website.js';
import reviewsRoutes from './routes/reviews.js';
import contactRoutes from './routes/contact.js';

const app = express();

// Security middleware
app.use(helmet());

// CORS
app.use(
  cors({
    origin: (origin, callback) => {
      const isDevelopmentOrigin = config.nodeEnv === 'development'
        && (!origin || /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin));
      const isConfiguredOrigin = !origin || origin === config.frontendUrl;

      callback(null, isConfiguredOrigin || isDevelopmentOrigin);
    },
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount API routes
app.use('/health', healthRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/brand-strategy', brandStrategyRoutes);
app.use('/api/landing-page', landingPageRoutes);
app.use('/api/digital-audit', digitalAuditRoutes);
app.use('/api/website', websiteRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/contact', contactRoutes);

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'Webloom API',
    version: '1.0.0',
    description: 'Stateless backend for business intelligence and website generation',
    endpoints: {
      health: '/health',
      business: '/api/business',
      leads: '/api/leads',
      brandStrategy: '/api/brand-strategy',
      landingPage: '/api/landing-page',
      digitalAudit: '/api/digital-audit',
      reviews: '/api/reviews',
      contact: '/api/contact',
    },
  });
});

// Error handlers
app.use(notFound);
app.use(errorHandler);

export default app;
