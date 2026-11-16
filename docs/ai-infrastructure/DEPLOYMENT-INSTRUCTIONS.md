# AI Infrastructure Deployment Instructions

**Date:** 2026-11-16  
**Phase:** AI Infrastructure Recovery  
**Target Environments:** Local Development, Vercel, Docker

---

## 1. Local Development Setup

### 1.1 Prerequisites
- Node.js 20+
- npm 10+
- Git
- Ollama (for local provider) - `brew install ollama` or download from ollama.com
- Redis (optional, for shared state) - `brew install redis`

### 1.2 Environment Setup
```bash
# Clone and install
git clone <repo>
cd webloom
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your API keys
# Minimum required for MVP:
# - OPENROUTER_API_KEY
# - GEMINI_API_KEY
# - DEEPSEEK_API_KEY (for extraction)
# - LOCAL_AI_BASE_URL=http://localhost:11434/v1
# - LOCAL_AI_MODEL=llama3.1:8b
```

### 1.3 Start Local Provider (Ollama)
```bash
# Start Ollama service
ollama serve

# Pull required models (in another terminal)
ollama pull llama3.1:8b
ollama pull mistral:7b
ollama pull qwen2.5:7b

# Verify
curl http://localhost:11434/v1/models
```

### 1.4 Start Development Servers
```bash
# Terminal 1: API server
cd apps/api
npm run dev

# Terminal 2: Frontend
cd apps/web
npm run dev

# Terminal 3: Redis (optional, for shared state)
redis-server
```

### 1.5 Verify Deployment
```bash
# Health checks
curl http://localhost:5001/health
curl http://localhost:5001/health/ai

# Test AI pipeline
curl -X POST http://localhost:5001/api/leads \
  -H "Content-Type: application/json" \
  -d '{"googleMapsUrl": "https://maps.google.com/place/ChIJ..."}'
```

---

## 2. Vercel Deployment

### 2.1 Prerequisites
- Vercel account
- GitHub/GitLab/Bitbucket repository
- Upstash Redis (for shared state) - free tier available

### 2.2 Environment Variables in Vercel
Add all variables from `.env.example` to Vercel Project Settings → Environment Variables:

**Required:**
```bash
OPENROUTER_API_KEY=xxx
GEMINI_API_KEY=xxx
DEEPSEEK_API_KEY=xxx
NVIDIA_API_KEY=xxx
# ... all provider keys
```

**Vercel-Specific:**
```bash
# Redis for shared state (circuit breakers, cooldowns, quotas)
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# Vercel-specific
AI_COST_PHASE=controlled
AI_MONTHLY_BUDGET_USD=50
```

### 2.3 Vercel Configuration
```json
// vercel.json
{
  "functions": {
    "apps/api/src/server.js": {
      "maxDuration": 60
    }
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET,POST,PUT,DELETE,OPTIONS" }
      ]
    }
  ]
}
```

### 2.4 Deploy
```bash
# Install Vercel CLI
npm i -g vercel

# Login and deploy
vercel login
vercel --prod
```

### 2.5 Post-Deploy Verification
```bash
# Health checks
curl https://your-app.vercel.app/health
curl https://your-app.vercel.app/health/ai

# Test AI pipeline
curl -X POST https://your-app.vercel.app/api/leads \
  -H "Content-Type: application/json" \
  -d '{"googleMapsUrl": "https://maps.google.com/place/ChIJ..."}'
```

---

## 3. Docker Deployment

### 3.1 Dockerfile
```dockerfile
# apps/api/Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Build (if needed)
RUN npm run build

# Expose port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5001/health || exit 1

# Start
CMD ["node", "src/server.js"]
```

### 3.2 Docker Compose (Local Stack)
```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
    ports:
      - "5001:5001"
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    depends_on:
      - redis
      - ollama
    restart: unless-stopped

  web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
    ports:
      - "5173:5173"
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    depends_on:
      - api
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    restart: unless-stopped
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

volumes:
  redis_data:
  ollama_data:
```

### 3.3 Deploy with Docker Compose
```bash
# Build and start
docker-compose up -d --build

# Pull Ollama models
docker-compose exec ollama ollama pull llama3.1:8b
docker-compose exec ollama ollama pull mistral:7b

# Verify
curl http://localhost:5001/health
curl http://localhost:5001/health/ai
```

---

## 4. Monitoring & Operations

### 4.1 Health Endpoints
```bash
# Basic health
curl https://your-domain.com/health

# AI infrastructure health
curl https://your-domain.com/health/ai

# Provider diagnostics
curl "https://your-domain.com/health/ai/diagnose?provider=deepseek"
```

### 4.2 Key Metrics to Monitor
| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| API Latency (p50) | < 500ms | > 2s |
| AI Latency (p50) | < 30s | > 60s |
| AI Failure Rate | < 5% | > 10% |
| Free Tier Usage | < 80% | > 90% |
| Monthly Cost | < Budget | > 80% budget |
| Circuit Breaker OPEN | 0 | > 0 |

### 4.3 Log Aggregation
```bash
# Vercel: Built-in logs in dashboard
# Docker: 
docker-compose logs -f api

# Key log patterns to watch:
# [AI] operation=... provider=... status=success|failure
# [AI] circuit breaker OPEN for provider=...
# [AI] quota alert: provider=... used=85%
# [AI] cooldown: provider=... remaining=30s
```

### 4.4 Alerting Rules (Example: Vercel + PagerDuty)
```yaml
# .vercel/alerts.yml
alerts:
  - name: AI High Failure Rate
    condition: "ai_failure_rate > 0.1"
    severity: critical
  
  - name: AI Circuit Breaker Open
    condition: "ai_circuit_open_count > 0"
    severity: warning
  
  - name: Monthly Budget 80%
    condition: "ai_monthly_cost > 0.8 * budget"
    severity: warning
  
  - name: Free Tier 90%
    condition: "ai_free_tier_used > 0.9"
    severity: critical
```

---

## 5. Scaling Considerations

### 5.1 Horizontal Scaling (Vercel)
- Automatic with serverless functions
- Max duration: 60s (configured in vercel.json)
- Concurrency: Automatic

### 5.2 Redis for Shared State
Required for production (Vercel/serverless):
- Circuit breaker state persistence
- Cooldown tracking across invocations
- Quota counters across instances

```bash
# Upstash Redis (recommended for Vercel)
# Free tier: 10K commands/day, 256MB
# Paid: $25/mo for 50M commands, 1GB
```

### 5.3 Database Scaling
- SQLite: Single instance only (dev/small prod)
- PostgreSQL: For multi-instance (migrate `db/schema.js`)

---

## 6. Security Checklist

- [ ] All API keys in environment variables (not code)
- [ ] `.env` in `.gitignore`
- [ ] Different keys per environment (dev/staging/prod)
- [ ] Rate limiting enabled (100 req/15min default)
- [ ] Helmet.js headers enabled
- [ ] CORS configured for frontend domain only
- [ ] SSRF protection on all outbound requests
- [ ] Input validation on all API endpoints
- [ ] No secrets in logs (sanitized by `sanitizeSecretText`)

---

## 7. Rollback Procedure

```bash
# Vercel
vercel rollback [deployment-url]

# Docker
docker-compose down
docker-compose up -d --build  # Previous image tag

# Database (if migrated)
# Restore from backup
```

---

## 8. Support Contacts

| Issue | Contact |
|-------|---------|
| Vercel deployment | Vercel Support |
| Upstash Redis | Upstash Support |
| Provider API issues | Respective provider support |
| Application bugs | GitHub Issues |

---

## 8. Quick Reference Commands

```bash
# Local development
npm run dev                    # Start both API and web
npm run test                   # Run test suite
npm run test:ai                # Run AI-specific tests

# Health checks
curl localhost:5001/health
curl localhost:5001/health/ai

# AI diagnostics
curl "localhost:5001/health/ai/diagnose?provider=deepseek"

# Logs
docker-compose logs -f api
vercel logs [deployment-url]

# Deploy
vercel --prod
docker-compose up -d --build
```