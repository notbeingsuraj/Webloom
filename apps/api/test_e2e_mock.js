import http from 'http';
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env.staging' });

import { GoogleMapsScraperAdapter } from './src/scraping/GoogleMapsScraperAdapter.js';
import { ScrapingJobManager } from './src/scraping/ScrapingJobManager.js';
import { ScrapingResultNormalizer } from './src/scraping/ScrapingResultNormalizer.js';
import { GoogleMapsUrlParser } from './src/scraping/GoogleMapsUrlParser.js';
import BusinessResearchService from './src/services/BusinessResearchService.js';
import BusinessProfile from './src/services/BusinessProfile.js';

// Mock scraper server responses
const mockResults = [
  {
    title: "Tartine Bakery",
    category: "Bakery",
    address: "600 Guerrero St, San Francisco, CA 94110",
    phone: "+1 415-487-2600",
    website: "https://tartinebakery.com",
    review_rating: "4.5",
    review_count: "1234",
    latitude: "37.7617",
    longitude: "-122.4216",
    place_id: "ChIJ0zQtY3uAhYARx5mZ7Z7Z7Z7",
    cid: "1234567890123456789",
    link: "https://www.google.com/maps/place/Tartine+Bakery/@37.7617,-122.4216",
    emails: ["info@tartinebakery.com"],
    open_hours: {
      monday: "07:30-19:00",
      tuesday: "07:30-19:00",
      wednesday: "07:30-19:00",
      thursday: "07:30-19:00",
      friday: "07:30-19:00",
      saturday: "08:00-19:00",
      sunday: "08:00-18:00"
    },
    reviews_per_rating: { "5": 800, "4": 300, "3": 80, "2": 30, "1": 24 },
    user_reviews: [
      { author: "John D.", rating: 5, text: "Best croissants in SF!", date: "2024-01-15" },
      { author: "Jane S.", rating: 4, text: "Great bread, long line.", date: "2024-01-10" }
    ],
    thumbnail: "https://example.com/thumb.jpg",
    images: ["https://example.com/img1.jpg", "https://example.com/img2.jpg"]
  }
];

const mockJobResponse = { id: 'test-job-123', status: 'pending', created_at: new Date().toISOString() };
const mockJobStatus = { id: 'test-job-123', status: 'completed', progress: 100, total_places: 1, completed_places: 1, failed_places: 0, created_at: new Date().toISOString(), started_at: new Date().toISOString(), completed_at: new Date().toISOString() };

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  
  const url = new URL(req.url, `http://localhost:8080`);
  
  if (url.pathname === '/api/v1/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: '1.0.0', uptime: 3600 }));
    return;
  }
  
  if (url.pathname === '/api/v1/jobs' && req.method === 'POST') {
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(mockJobResponse)); });
    return;
  }
  
  if (url.pathname.startsWith('/api/v1/jobs/') && req.method === 'GET') {
    if (url.pathname.endsWith('/download')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ businesses: mockResults, totalCount: mockResults.length }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mockJobStatus));
    }
    return;
  }
  
  if (url.pathname === '/api/v1/jobs' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jobs: [mockJobStatus] }));
    return;
  }
  
  res.writeHead(404); res.end('Not found');
});

const PORT = 8081;
server.listen(PORT, async () => {
  console.log(`[Mock] Scraper server running on port ${PORT}`);
  
  const adapter = new GoogleMapsScraperAdapter({ baseUrl: `http://localhost:${PORT}`, timeoutMs: 30000 });
  const normalizer = new ScrapingResultNormalizer();
  
  console.log('\n=== END-TO-END PIPELINE TEST ===');
  
  const placeUrl = 'https://www.google.com/maps/place/Tartine+Bakery/@37.7617,-122.4216,17z/data=!3m1!4b1!4m6!3m5!1s0x8085808c5b7b7b7b:0x1234567890abcdef!8m2!3d37.7617!4d-122.4216!16s%2Fg%2F11b7b7b7b';
  
  // Step 1: Parse URL
  console.log('\n1. URL Parsing:');
  const parsed = GoogleMapsUrlParser.parse(placeUrl);
  console.log('   Parsed:', { name: parsed.name, placeId: parsed.placeId, coordinates: parsed.latitude && parsed.longitude ? { lat: parsed.latitude, lng: parsed.longitude } : null, mode: GoogleMapsUrlParser.getScrapingMode(placeUrl) });
  
  // Step 2: Scrape
  console.log('\n2. Scraping:');
  const scrapeResults = await adapter.scrapeSingleBusiness(placeUrl);
  console.log('   Scraped businesses:', scrapeResults.totalCount);
  const business = scrapeResults.businesses[0];
  console.log('   Business:', { name: business.name, phone: business.phone, website: business.website, rating: business.rating, reviewCount: business.reviewCount, coordinates: business.coordinates });
  
  // Step 3: Normalize
  console.log('\n3. Normalization:');
  const normalized = normalizer.normalize(business, {
    sourceUrl: placeUrl,
    authoritativeCoordinates: { lat: 37.7617, lng: -122.4216 }
  });
  console.log('   Normalized record:');
  console.log('   - Identity:', { name: normalized.identity.name?.value, placeId: normalized.identity.placeId?.value, provenance: normalized.identity.name?.provenance });
  console.log('   - Contact:', { phone: normalized.contact.phone?.value, website: normalized.contact.website?.value, email: normalized.contact.email?.value });
  console.log('   - Location:', { address: normalized.location.full_address?.value, coordinates: normalized.location.coordinates?.value, provenance: normalized.location.coordinates?.provenance });
  console.log('   - Ratings:', { rating: normalized.ratings.rating?.value, reviewCount: normalized.ratings.review_count?.value, provenance: normalized.ratings.rating?.provenance });
  console.log('   - Business Details:', { category: normalized.business.category?.value, status: normalized.business.status?.value });
  console.log('   - Hours:', Object.keys(normalized.hours || {}).length > 0 ? Object.keys(normalized.hours) : 'none');
  console.log('   - Metadata:', { source: normalized.metadata?.source, scrapedAt: normalized.metadata?.scrapedAt });
  
  // Step 4: BusinessResearchService integration (with mocked scraper)
  console.log('\n4. BusinessResearchService Integration:');
  const researchService = BusinessResearchService;
  
  // We'll test the _mergeCanonical and provenance handling
  const profile = new BusinessProfile();
  const sourceUrl = placeUrl;
  
  // Convert normalized record to format expected by _mergeCanonical
  const recordForMerge = {
    identity: { name: normalized.identity.name?.value, category: normalized.identity.category?.value },
    contact: { phone: normalized.contact.phone?.value, website: normalized.contact.website?.value, email: normalized.contact.email?.value },
    location: { full_address: normalized.location.full_address?.value, coordinates: normalized.location.coordinates?.value, city: normalized.location.city?.value, state: normalized.location.state?.value, country: normalized.location.country?.value, postal_code: normalized.location.postal_code?.value },
    business: { category: normalized.business.category?.value, description: normalized.business.description?.value },
    ratings: { rating: normalized.ratings.rating?.value, review_count: normalized.ratings.review_count?.value },
    hours: normalized.hours,
    sourceUrls: [sourceUrl],
    metadata: normalized.metadata,
    provider: { placeId: normalized.identity.placeId?.value, source: 'google_maps_scraper' }
  };
  
  await researchService._mergeCanonical(profile, recordForMerge, 'discovered', 'google_maps_scraper', sourceUrl);
  
  console.log('   Profile after merge:');
  console.log('   - Identity name:', profile.get('identity.name'));
  console.log('   - Contact phone:', profile.get('contact.phone'));
  console.log('   - Location address:', profile.get('location.full_address'));
  console.log('   - Ratings:', profile.get('ratings.rating'), profile.get('ratings.review_count'));
  
  // Step 5: Verify provenance hierarchy
  console.log('\n5. Provenance Verification:');
  const nameField = profile.get('identity.name');
  console.log('   - Name provenance:', nameField?.provenance, '(expected: discovered=3)');
  console.log('   - Name confidence:', nameField?.confidence);
  
  const phoneField = profile.get('contact.phone');
  console.log('   - Phone provenance:', phoneField?.provenance);
  
  const ratingField = profile.get('ratings.rating');
  console.log('   - Rating provenance:', ratingField?.provenance);
  
  // Step 6: Test AI enrichment (with Mercury)
  console.log('\n6. AI Enrichment Test (Mercury 3):');
  try {
    const { MercuryProvider } = await import('./src/ai/providers/MercuryProvider.js');
    const mercury = new MercuryProvider({
      apiKey: process.env.MERCURY_API_KEY,
      model: process.env.MERCURY_MODEL,
      baseUrl: process.env.MERCURY_BASE_URL,
      timeoutMs: parseInt(process.env.MERCURY_TIMEOUT_MS)
    });
    
    const result = await mercury.complete({
      model: mercury.getModel('default'),
      prompt: `Given this business data: ${JSON.stringify({ name: 'Tartine Bakery', category: 'Bakery', address: '600 Guerrero St' })}. Extract the business type and description in JSON.`,
      maxTokens: 200,
      temperature: 0,
      timeoutMs: 30000,
      responseFormat: { type: 'json_object' }
    });
    console.log('   AI Enrichment Result:', result.content);
  } catch (error) {
    console.log('   AI Enrichment Error:', error.message);
  }
  
  // Step 7: Test NVIDIA fallback
  console.log('\n7. NVIDIA Fallback Test:');
  try {
    const { NVIDIAProvider } = await import('./src/ai/providers/NVIDIAProvider.js');
    const nvidia = new NVIDIAProvider({
      name: 'nvidia',
      config: { enabled: true, apiKey: process.env.NVIDIA_API_KEY, model: process.env.NVIDIA_MODEL, baseUrl: process.env.NVIDIA_BASE_URL, timeoutMs: parseInt(process.env.NVIDIA_TIMEOUT_MS), requiresApiKey: true },
      defaultTimeoutMs: parseInt(process.env.NVIDIA_TIMEOUT_MS),
      probeMaxTokens: 6000
    });
    
    const result = await nvidia.complete({
      model: nvidia.getModel('default'),
      prompt: `Describe Tartine Bakery in one sentence.`,
      maxTokens: 100,
      temperature: 0,
      timeoutMs: 60000
    });
    console.log('   NVIDIA Result:', result.content);
  } catch (error) {
    console.log('   NVIDIA Error:', error.message);
  }
  
  adapter.destroy();
  server.close();
  console.log('\n=== END-TO-END TEST COMPLETE ===');
});

server.on('error', (err) => console.error('Server error:', err));
