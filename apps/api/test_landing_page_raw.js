/**
 * Webloom — raw landing-page spec probe
 *
 * Exercises the full provider chain end to end on a real business URL and
 * prints the model's raw output, so prompt/schema problems are visible.
 *
 * Goes through AIService (not a direct vendor call) so it also demonstrates
 * structured-output validation, the fallback chain, and provenance.
 */
import BusinessDataExtractor from './src/services/BusinessDataExtractor.js';
import BusinessResearchService from './src/services/BusinessResearchService.js';
import BrandStrategyService from './src/services/BrandStrategyService.js';
import WebsiteStrategyService from './src/services/WebsiteStrategyService.js';
import AIService from './src/services/AIService.js';
import { buildLandingPageSpecPrompt } from './src/prompts/landingPageSpec.js';

const url = 'https://www.google.com/maps/place/Nilkamal+Homes/@30.9003452,75.85667325,17z/data=!3m1!4b1!4m6!3m5!1s0x390feb5b7b7b7b7b:0x1234567890abcdef!8m2!3d30.9003452!4d75.85667325!16s%2Fg%2F11c5q8v7z';

const SCHEMA = {
  type: 'object',
  properties: {
    pageTitle: { type: 'string' },
    pageDescription: { type: 'string' },
    primaryCTA: { type: 'string' },
    sections: { type: 'array' },
    theme: { type: 'object' },
    metadata: { type: 'object' },
  },
  required: ['pageTitle', 'pageDescription', 'primaryCTA', 'sections', 'theme', 'metadata'],
};

async function test() {
  const extractedData = await BusinessDataExtractor.extractFromGoogleMapsUrl(url);
  const businessData = await BusinessResearchService.extractBusinessIntelligence(extractedData);
  const brandDNA = await BrandStrategyService.generateBrandDNA(businessData);

  const digitalAudit = {
    score: 50,
    gaps: ['No website', 'No Google reviews', 'No contact info on Maps'],
    opportunities: ['Build simple website', 'Claim Google Business Profile', 'Add photos'],
    details: {
      hasWebsite: false,
      websiteQuality: null,
      reviewCount: 0,
      rating: null,
      socialPresence: {},
      seoHealth: null,
    },
  };

  const websiteStrategy = await WebsiteStrategyService.generateStrategy(brandDNA, digitalAudit, businessData);

  const prompt = buildLandingPageSpecPrompt(brandDNA, websiteStrategy, digitalAudit);
  console.log('Prompt length:', prompt.length);

  console.log('\n=== SENDING REQUEST (via AIService) ===');
  const spec = await AIService.generate({
    operation: 'landingPageSpec',
    systemPrompt:
      'You are a senior UX designer, conversion strategist and frontend information architect. ' +
      'Generate a structured landing-page specification for a local business. Return ONLY valid JSON.',
    prompt,
    schema: SCHEMA,
    temperature: 0.5,
    maxTokens: 16000,
  });

  console.log('Provider :', spec.__ai?.provider);
  console.log('Model    :', spec.__ai?.model);
  console.log('Attempts :', spec.__ai?.attempts);
  console.log('Latency  :', spec.__ai?.latencyMs, 'ms');
  console.log('Tokens   :', JSON.stringify(spec.__ai?.usage));
  console.log('\nFull spec:', JSON.stringify(spec, null, 2));
}

test().catch((error) => {
  console.error('\n=== FAILED ===');
  console.error('code    :', error.code);
  console.error('category:', error.category);
  console.error('message :', error.message);
  console.error('attempts:', JSON.stringify(error.attempts, null, 2));
  process.exit(1);
});
