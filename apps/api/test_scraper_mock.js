import http from 'http';
import { GoogleMapsScraperAdapter } from './src/scraping/GoogleMapsScraperAdapter.js';
import { ScrapingJobManager } from './src/scraping/ScrapingJobManager.js';
import { ScrapingResultNormalizer } from './src/scraping/ScrapingResultNormalizer.js';
import { GoogleMapsUrlParser } from './src/scraping/GoogleMapsUrlParser.js';

// Mock scraper server responses
const mockJobResponse = {
  id: 'test-job-123',
  status: 'pending',
  created_at: new Date().toISOString()
};

const mockJobStatus = {
  id: 'test-job-123',
  status: 'completed',
  progress: 100,
  total_places: 2,
  completed_places: 2,
  failed_places: 0,
  created_at: new Date().toISOString(),
  started_at: new Date().toISOString(),
  completed_at: new Date().toISOString()
};

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
  },
  {
    title: "Blue Bottle Coffee",
    category: "Coffee Shop",
    address: "66 Mint St, San Francisco, CA 94103",
    phone: "+1 415-555-0100",
    website: "https://bluebottlecoffee.com",
    review_rating: "4.3",
    review_count: "567",
    latitude: "37.7764",
    longitude: "-122.4021",
    place_id: "ChIJ11111111111111111111111",
    cid: "9876543210987654321",
    link: "https://www.google.com/maps/place/Blue+Bottle+Coffee/@37.7764,-122.4021",
    emails: [],
    open_hours: {
      monday: "06:00-20:00",
      tuesday: "06:00-20:00",
      wednesday: "06:00-20:00",
      thursday: "06:00-20:00",
      friday: "06:00-20:00",
      saturday: "07:00-20:00",
      sunday: "07:00-19:00"
    },
    reviews_per_rating: { "5": 300, "4": 150, "3": 50, "2": 40, "1": 27 },
    user_reviews: [],
    thumbnail: "https://example.com/thumb2.jpg",
    images: ["https://example.com/img3.jpg"]
  }
];

// Create mock server
const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  const url = new URL(req.url, `http://localhost:8080`);
  
  if (url.pathname === '/api/v1/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: '1.0.0', uptime: 3600 }));
    return;
  }
  
  if (url.pathname === '/api/v1/jobs' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      console.log('[Mock] Job submitted:', JSON.parse(body));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mockJobResponse));
    });
    return;
  }
  
  if (url.pathname.startsWith('/api/v1/jobs/') && req.method === 'GET') {
    const jobId = url.pathname.split('/')[3];
    if (url.pathname.endsWith('/download')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ businesses: mockResults, totalCount: mockResults.length }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mockJobStatus));
    }
    return;
  }
  
  if (url.pathname.startsWith('/api/v1/jobs/') && req.method === 'DELETE') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'cancelled' }));
    return;
  }
  
  if (url.pathname === '/api/v1/jobs' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jobs: [mockJobStatus] }));
    return;
  }
  
  res.writeHead(404);
  res.end('Not found');
});

const PORT = 8080;
server.listen(PORT, async () => {
  console.log(`[Mock] Scraper server running on port ${PORT}`);
  
  // Test GoogleMapsUrlParser
  console.log('\n=== GOOGLE MAPS URL PARSER TESTS ===');
  
  const placeUrl = 'https://www.google.com/maps/place/Tartine+Bakery/@37.7617,-122.4216,17z/data=!3m1!4b1!4m6!3m5!1s0x8085808c5b7b7b7b:0x1234567890abcdef!8m2!3d37.7617!4d-122.4216!16s%2Fg%2F11b7b7b7b';
  const parsed = GoogleMapsUrlParser.parse(placeUrl);
  console.log('Place URL parsed:', {
    isPlaceUrl: parsed.isPlaceUrl,
    name: parsed.name,
    placeId: parsed.placeId,
    coordinates: parsed.latitude && parsed.longitude ? { lat: parsed.latitude, lng: parsed.longitude } : null,
    mode: GoogleMapsUrlParser.getScrapingMode(placeUrl)
  });
  
  const searchUrl = 'https://www.google.com/maps/search/bakery+san+francisco/@37.7749,-122.4194,13z';
  const parsedSearch = GoogleMapsUrlParser.parse(searchUrl);
  console.log('Search URL parsed:', {
    isSearchUrl: parsedSearch.isSearchUrl,
    query: parsedSearch.searchQuery,
    mode: GoogleMapsUrlParser.getScrapingMode(searchUrl)
  });
  
  const shortUrl = 'https://maps.app.goo.gl/abc123';
  const parsedShort = GoogleMapsUrlParser.parse(shortUrl);
  console.log('Short URL parsed:', {
    isShortUrl: parsedShort.isShortUrl,
    mode: GoogleMapsUrlParser.getScrapingMode(shortUrl)
  });
  
  // Test GoogleMapsScraperAdapter
  console.log('\n=== GOOGLE MAPS SCRAPER ADAPTER TESTS ===');
  const adapter = new GoogleMapsScraperAdapter({
    baseUrl: `http://localhost:${PORT}`,
    timeoutMs: 30000
  });
  
  // Health check
  const health = await adapter.healthCheck();
  console.log('Health check:', health);
  
  // Submit single-business job
  console.log('\n--- Single Business Scraping ---');
  const singleJob = await adapter.submitJob({
    queries: [placeUrl]
  });
  console.log('Job submitted:', singleJob);
  
  // Wait for completion
  const singleResults = await adapter.waitForCompletion(singleJob.jobId, {
    pollIntervalMs: 100,
    maxWaitMs: 5000
  });
  console.log('Single business results:', {
    totalCount: singleResults.totalCount,
    businesses: singleResults.businesses.map(b => ({ name: b.name, phone: b.phone, website: b.website, rating: b.rating }))
  });
  
  // Test multi-business scraping
  console.log('\n--- Multi Business Scraping ---');
  const multiResults = await adapter.scrapeMultiBusiness({
    query: 'bakery',
    location: 'San Francisco, CA',
    maxResults: 5
  });
  console.log('Multi business results:', {
    totalCount: multiResults.totalCount,
    businesses: multiResults.businesses.map(b => ({ name: b.name, phone: b.phone, website: b.website, rating: b.rating }))
  });
  
  // Test ScrapingResultNormalizer
  console.log('\n=== RESULT NORMALIZER TESTS ===');
  const normalizer = new ScrapingResultNormalizer();
  
  const normalized = normalizer.normalizeBatch(mockResults, {
    sourceUrl: placeUrl,
    authoritativeCoordinates: { lat: 37.7617, lng: -122.4216 }
  });
  
  console.log('Normalized results:', {
    uniqueCount: normalized.records.length,
    duplicateCount: normalized.duplicates.length,
    firstRecord: {
      identity: {
        name: normalized.records[0].identity?.name?.value,
        placeId: normalized.records[0].identity?.placeId?.value,
        googleMapsUrl: normalized.records[0].identity?.googleMapsUrl?.value
      },
      contact: {
        phone: normalized.records[0].contact?.phone?.value,
        website: normalized.records[0].contact?.website?.value,
        email: normalized.records[0].contact?.email?.value
      },
      location: {
        fullAddress: normalized.records[0].location?.full_address?.value,
        coordinates: normalized.records[0].location?.coordinates?.value
      },
      ratings: {
        rating: normalized.records[0].ratings?.rating?.value,
        reviewCount: normalized.records[0].ratings?.review_count?.value
      },
      provenance: normalized.records[0].identity?.name?.provenance
    }
  });
  
  // Test ScrapingJobManager
  console.log('\n=== JOB MANAGER TESTS ===');
  const jobManager = new ScrapingJobManager({ adapter });
  
  const job = await jobManager.submitJob({
    queries: [placeUrl],
    config: { depth: 1, maxResults: 10 }
  });
  console.log('Job created:', job);
  
  const jobStatus = await jobManager.getJob(job.jobId);
  console.log('Job status (initial):', jobStatus.status);
  
  // Start job (will use mock adapter)
  await jobManager.startJob(job.jobId);
  
  // Wait a bit for processing
  await new Promise(r => setTimeout(r, 500));
  
  const jobStatus2 = await jobManager.getJob(job.jobId);
  console.log('Job status (after start):', jobStatus2.status);
  
  const results = await jobManager.getResults(job.jobId);
  console.log('Job results:', {
    totalCount: results.totalCount,
    businessNames: results.businesses.map(b => b.name)
  });
  
  // Cleanup
  await jobManager.destroy();
  adapter.destroy();
  
  server.close();
  console.log('\n=== ALL MOCK TESTS COMPLETE ===');
});

server.on('error', (err) => {
  console.error('Server error:', err);
});
