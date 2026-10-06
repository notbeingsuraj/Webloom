import fs from 'node:fs';
import path from 'node:path';
import { DATASETS_DIR } from '../src/ai/paths.js';

/**
 * Dataset v0.1 builder — grows the curated corpus with:
 *  - train additions that correct the failures observed in the baseline
 *    benchmark (see baseline/analysis.json): nested brand DNA shapes, category
 *    lists, hours-as-string, honest UNKNOWNs, and websiteExists=false audits.
 *  - the first validation split (evaluation/validation/v0.1.0/<task>.jsonl),
 *    businesses strictly disjoint from train and holdout.
 *
 * Grounding rule: every valued extraction field cites evidence[0].text that
 * appears verbatim in the input evidence, so gold is always derivable.
 *
 * Run: node eval/dataset_build.js
 */

const PROMPT_VERSION = 'webloom-tasks-v1';
const DATASET_VERSION = 'v0.1.0';

/* ------------------------------------------------------------------ *
 * Envelope helpers
 * ------------------------------------------------------------------ */

const VALIDATED = 'ai_generated';
const MAPS = 'google_maps_page';
const SITE = 'official_website';

function val(value, confidence, source, text, url) {
  return {
    value,
    confidence,
    provenance: VALIDATED,
    status: 'extracted',
    evidence: [{ source, text, url }],
  };
}

function missing() {
  return { value: null, confidence: 0, provenance: 'unknown', status: 'missing', evidence: [] };
}

/* ------------------------------------------------------------------ *
 * Business A: Aster & Ivy Florals (TRAIN — corrects baseline failures)
 * ------------------------------------------------------------------ */

const ASTER = {
  profile: {
    name: 'Aster & Ivy Florals',
    category: 'Florist',
    description: 'Full-service florist and wedding florist in the Mission',
    products: ['fresh-cut bouquets', 'wedding arrangements', 'dried flower keepsakes'],
    address: '618 Valencia St, San Francisco, CA 94110',
    phone: '+1 (415) 555-0138',
    website: 'https://asterandivy.example',
    rating: 4.7,
    reviewCount: 214,
    hours: 'Mon-Sat 9am to 6pm',
  },
  mapsText: [
    'Aster & Ivy Florals',
    'Full-service florist and wedding florist',
    '618 Valencia St, San Francisco, CA 94110',
    '+1 (415) 555-0138',
    'https://asterandivy.example',
    '4.7 (214 reviews)',
    'Florist · Wedding florist',
    'Open Mon-Sat 9am to 6pm',
  ].join('\n'),
  websiteText:
    'Aster & Ivy Florals crafts everyday bouquets and full wedding arrangements in the Mission. '
    + 'We offer fresh-cut bouquets, wedding arrangements, and dried flower keepsakes. '
    + 'Find us on Instagram @asterandivy.',
};

function asterExtraction() {
  const url = 'https://asterandivy.example';
  const mapsUrl = 'https://maps.google.com/example-aster';
  return {
    rawBusinessData: {
      name: ASTER.profile.name,
      category: ASTER.profile.category,
      address: ASTER.profile.address,
      phone: ASTER.profile.phone,
      website: ASTER.profile.website,
      rating: 4.7,
      reviewCount: 214,
      hours: ASTER.profile.hours,
    },
    websiteText: ASTER.websiteText,
    evidence: [
      { source: MAPS, text: ASTER.mapsText, url: mapsUrl },
      { source: SITE, text: ASTER.websiteText, url },
    ],
  };
}

function asterExtractionGold() {
  const maps = MAPS, url = 'https://maps.google.com/example-aster';
  return {
    'identity.name': val('Aster & Ivy Florals', 0.99, maps, 'Aster & Ivy Florals', url),
    'identity.category': val('Florist', 0.97, maps, 'Florist · Wedding florist', url),
    'identity.categories': val(['Florist', 'Wedding florist'], 0.93, maps, 'Florist · Wedding florist', url),
    'identity.business_type': val('full-service florist', 0.9, maps, 'Full-service florist', url),
    'identity.description': val(
      'Aster & Ivy Florals crafts everyday bouquets and full wedding arrangements in the Mission.',
      0.9, SITE,
      'Aster & Ivy Florals crafts everyday bouquets and full wedding arrangements in the Mission.',
      'https://asterandivy.example',
    ),
    'identity.services': val(
      ['Fresh-cut bouquets', 'Wedding arrangements', 'Dried flower keepsakes'],
      0.92, SITE,
      'fresh-cut bouquets, wedding arrangements, and dried flower keepsakes',
      'https://asterandivy.example',
    ),
    'identity.products': missing(),
    'identity.amenities': missing(),
    'contact.phone': val('+1 (415) 555-0138', 0.99, maps, '+1 (415) 555-0138', url),
    'contact.email': missing(),
    'contact.website': val('https://asterandivy.example', 0.99, maps, 'https://asterandivy.example', url),
    'location.full_address': val('618 Valencia St, San Francisco, CA 94110', 0.99, maps, '618 Valencia St, San Francisco, CA 94110', url),
    'location.city': val('San Francisco', 0.99, maps, 'San Francisco', url),
    'location.state': val('CA', 0.99, maps, 'CA', url),
    'location.postal_code': val('94110', 0.99, maps, '94110', url),
    'location.coordinates': missing(),
    hours: val('Mon-Sat 9am to 6pm', 0.9, maps, 'Open Mon-Sat 9am to 6pm', url),
    social_links: val(
      [{ platform: 'instagram', url: 'https://instagram.com/asterandivy' }],
      0.9, SITE, 'Instagram @asterandivy', 'https://asterandivy.example',
    ),
    'ratings.rating': val(4.7, 0.95, maps, '4.7 (214 reviews)', url),
    'ratings.review_count': val(214, 0.95, maps, '4.7 (214 reviews)', url),
  };
}

function asterDna() {
  return {
    businessIdentity: {
      name: 'Aster & Ivy Florals',
      category: 'Florist',
      essence: 'A Mission district florist turning everyday stems into occasions and weddings into gardens.',
      location: 'San Francisco, CA',
    },
    audience: {
      primary: 'San Francisco residents who buy flowers weekly for their homes or tables',
      secondary: 'Couples planning weddings in the Bay Area who want full-service floral design',
    },
    customerIntent: {
      primaryIntent: 'Buy fresh flowers today or commission wedding florals',
      triggers: ['Anniversary and birthday gifting', 'Wedding planning', 'Spontaneous home refresh'],
    },
    painPoints: [
      'Wedding flowers are expensive and stressful to coordinate',
      'Generic grocery-store bouquets fade within a day',
      'No way to preview arrangements before ordering',
    ],
    services: {
      core: ['Fresh-cut bouquets', 'Wedding arrangements', 'Dried flower keepsakes'],
    },
    trustSignals: [
      '4.7 rating from 214 reviews',
      'Open Monday through Saturday, 9am to 6pm',
    ],
    brandPersonality: {
      tone: 'warm, approachable, and design-forward',
      values: ['Freshness', 'Seasonality', 'Craftsmanship'],
    },
    positioning: {
      forWho: 'locals and Bay Area couples who want flowers with a point of view',
      whyChooseUs: 'full-service florals, dependable hours, and same-day bouquets',
      category: 'local wedding florist and everyday flower shop',
    },
    conversionStrategy: {
      primaryCTA: { text: 'Order a bouquet', action: 'schedule' },
      secondaryCTA: { text: 'Book a wedding consult', action: 'contact' },
      funnel: 'Bouquet orders convert repeat shoppers; wedding consults close the high-value seasonal projects.',
    },
  };
}

function asterDnaInput() {
  return {
    profile: ASTER.profile,
    websiteText: ASTER.websiteText,
    brandEvidence: [
      { source: MAPS, text: ASTER.mapsText, url: 'https://maps.google.com/example-aster' },
      { source: SITE, text: ASTER.websiteText, url: 'https://asterandivy.example' },
    ],
  };
}

/* ------------------------------------------------------------------ *
 * Business B: Loft & Loom (VALIDATION — clean home-goods store)
 * ------------------------------------------------------------------ */

const LOFT = {
  mapsText: [
    'Loft & Loom',
    'Home goods store',
    '88 Atlantic Ave, Brooklyn, NY 11217',
    '+1 (718) 555-0190',
    'https://loftandloom.example',
    '4.8 (96 reviews)',
    'Home goods · Furniture',
    'Open daily 10am to 7pm',
  ].join('\n'),
  websiteText:
    'Loft & Loom sells sustainable home goods, furniture, and decor. '
    + 'Visit our Brooklyn storefront or shop online at loftandloom.example.',
};

function loftExtractionGold() {
  const maps = MAPS, url = 'https://maps.google.com/example-loft';
  return {
    'identity.name': val('Loft & Loom', 0.99, maps, 'Loft & Loom', url),
    'identity.category': val('Home goods store', 0.97, maps, 'Home goods store', url),
    'identity.categories': val(['Home goods', 'Furniture'], 0.93, maps, 'Home goods · Furniture', url),
    'identity.business_type': val('home goods store', 0.9, maps, 'Home goods store', url),
    'identity.description': val(
      'Loft & Loom sells sustainable home goods, furniture, and decor.',
      0.9, SITE,
      'Loft & Loom sells sustainable home goods, furniture, and decor.',
      'https://loftandloom.example',
    ),
    'identity.services': val(
      ['Sustainable home goods', 'Furniture', 'Decor'],
      0.92, SITE,
      'sustainable home goods, furniture, and decor',
      'https://loftandloom.example',
    ),
    'identity.products': missing(),
    'identity.amenities': missing(),
    'contact.phone': val('+1 (718) 555-0190', 0.99, maps, '+1 (718) 555-0190', url),
    'contact.email': missing(),
    'contact.website': val('https://loftandloom.example', 0.99, maps, 'https://loftandloom.example', url),
    'location.full_address': val('88 Atlantic Ave, Brooklyn, NY 11217', 0.99, maps, '88 Atlantic Ave, Brooklyn, NY 11217', url),
    'location.city': val('Brooklyn', 0.99, maps, 'Brooklyn', url),
    'location.state': val('NY', 0.99, maps, 'NY', url),
    'location.postal_code': val('11217', 0.99, maps, '11217', url),
    'location.coordinates': missing(),
    hours: val('daily 10am to 7pm', 0.9, maps, 'Open daily 10am to 7pm', url),
    social_links: missing(),
    'ratings.rating': val(4.8, 0.95, maps, '4.8 (96 reviews)', url),
    'ratings.review_count': val(96, 0.95, maps, '4.8 (96 reviews)', url),
  };
}

function loftDna() {
  return {
    businessIdentity: {
      name: 'Loft & Loom',
      category: 'Home goods store',
      essence: 'A Brooklyn home goods store making sustainable furniture and decor feel accessible.',
      location: 'Brooklyn, NY',
    },
    audience: {
      primary: 'Brooklyn homeowners and renters furnishing spaces on a budget',
      secondary: 'Eco-conscious shoppers looking for sustainably made pieces',
    },
    customerIntent: {
      primaryIntent: 'Source sustainable furniture and decor for a home refresh',
      triggers: ['Moving into a new apartment', 'Furnishing an empty room', 'Holiday decor shopping'],
    },
    painPoints: [
      'Sustainable furniture is often expensive and hard to find locally',
      'Sizing furniture for small Brooklyn apartments is risky online',
    ],
    services: {
      core: ['Sustainable home goods', 'Furniture', 'Decor'],
    },
    trustSignals: [
      '4.8 rating from 96 reviews',
      'Open daily, 10am to 7pm',
    ],
    brandPersonality: {
      tone: 'casual, modern, and conscientious',
      values: ['Sustainability', 'Design', 'Approachability'],
    },
    positioning: {
      forWho: 'rookie home-makers who want sustainable pieces without the premium',
      whyChooseUs: 'curated sustainable inventory at approachable price points',
      category: 'neighborhood home goods store',
    },
    conversionStrategy: {
      primaryCTA: { text: 'Shop the collection', action: 'schedule' },
      secondaryCTA: { text: 'Visit the store', action: 'navigate' },
      funnel: 'Browse online, confirm material quality in-store, buy locally.',
    },
  };
}

/* ------------------------------------------------------------------ *
 * Business C: Red Cedar Grill (VALIDATION — sparse evidence, teaches UNKNOWN)
 * ------------------------------------------------------------------ */

const REDCEDAR = {
  mapsText: [
    'Red Cedar Grill',
    'Steakhouse',
    '412 Falls Road, Boise, ID 83702',
    '+1 (208) 555-0146',
    '4.3 (1,109 reviews)',
    'Open Tuesday-Sunday 5pm-10pm',
  ].join('\n'),
};

function redCedarExtractionGold() {
  const maps = MAPS, url = 'https://maps.google.com/example-redcedar';
  return {
    'identity.name': val('Red Cedar Grill', 0.99, maps, 'Red Cedar Grill', url),
    'identity.category': val('Steakhouse', 0.97, maps, 'Steakhouse', url),
    'identity.categories': val(['Steakhouse'], 0.93, maps, 'Steakhouse', url),
    'identity.business_type': missing(),
    'identity.description': missing(),
    'identity.services': missing(),
    'identity.products': missing(),
    'identity.amenities': missing(),
    'contact.phone': val('+1 (208) 555-0146', 0.99, maps, '+1 (208) 555-0146', url),
    'contact.email': missing(),
    'contact.website': missing(),
    'location.full_address': val('412 Falls Road, Boise, ID 83702', 0.99, maps, '412 Falls Road, Boise, ID 83702', url),
    'location.city': val('Boise', 0.99, maps, 'Boise', url),
    'location.state': val('ID', 0.99, maps, 'ID', url),
    'location.postal_code': val('83702', 0.99, maps, '83702', url),
    'location.coordinates': missing(),
    hours: val('Tuesday-Sunday 5pm-10pm', 0.9, maps, 'Open Tuesday-Sunday 5pm-10pm', url),
    social_links: missing(),
    'ratings.rating': val(4.3, 0.95, maps, '4.3 (1,109 reviews)', url),
    'ratings.review_count': val(1109, 0.95, maps, '4.3 (1,109 reviews)', url),
  };
}

function redCedarDna() {
  return {
    businessIdentity: {
      name: 'Red Cedar Grill',
      category: 'Steakhouse',
      essence: 'A Boise steakhouse for family dinners and special occasions.',
      location: 'Boise, ID',
    },
    audience: {
      primary: 'Boise residents planning dinner out for celebrations or a weekend steak',
      secondary: 'Visitors to downtown Boise looking for reliably good steakhouse fare',
    },
    customerIntent: {
      primaryIntent: 'Book a steakhouse dinner for an occasion or a weekend meal',
      triggers: ['Birthdays and anniversaries', 'Weekend dinner plans', 'The occasional steak craving'],
    },
    painPoints: [
      'Evenings closed more often than guests would like (closed Mondays)',
      'No website, so menu and pricing are hard to preview before visiting',
    ],
    services: {
      core: ['Steakhouse dining'],
    },
    trustSignals: [
      '4.3 rating from 1,109 reviews',
    ],
    brandPersonality: {
      tone: 'warm, unpretentious, and indulgent',
      values: ['Reliability', 'Hospitality', 'Quality cuts'],
    },
    positioning: {
      forWho: 'Boise diners who want a dependable steakhouse meal without ceremony',
      whyChooseUs: 'strong local reviews and a consistent dining room open six nights a week',
      category: 'neighborhood steakhouse',
    },
    conversionStrategy: {
      primaryCTA: { text: 'Call to reserve', action: 'tel' },
      secondaryCTA: { text: 'Visit the Grill', action: 'navigate' },
      funnel: 'Phone reservations and walk-ins on weekend evenings.',
    },
  };
}

/* ------------------------------------------------------------------ *
 * Website analysis gold template
 * ------------------------------------------------------------------ */

function auditCategory(score, issues, recommendations, verified) {
  return { score, issues, recommendations, verified: verified ?? false };
}

function loftAudit() {
  return {
    websiteExists: true,
    overallScore: 7.5,
    categories: {
      design: auditCategory(7, ['Clean but templated layouts'], ['Custom hero photography of products'], true),
      mobile: auditCategory(8, ['None significant'], ['Keep mobile nav sticky'], true),
      navigation: auditCategory(7, ['Category filter is buried'], ['Surface furniture + decor filters on the homepage'], true),
      conversion: auditCategory(6, ['No visible email capture'], ['Add a newsletter signup for new arrivals'], true),
      trust: auditCategory(8, ['No customer review widget'], ['Embed recent local reviews'], true),
      seo: auditCategory(7, ['Thin category descriptions'], ['Add product schema.org markup'], true),
      localSeo: auditCategory(9, [], ['Keep hours and address on every page footer'], true),
      content: auditCategory(7, ['No blog or buying guides'], ['Publish a sofa-buying guide for small spaces'], true),
      branding: auditCategory(8, ['Palette underused'], ['Reinforce the warm neutral palette'], true),
      performance: auditCategory(8, [], ['Lazy-load product images'], true),
      contactAccessibility: auditCategory(9, [], ['Add a same-day buy online / pick up in store path'], true),
    },
    criticalIssues: ['No email capture or loyalty loop to bring customers back'],
    recommendations: [
      'Add a newsletter signup and homepage category filters',
      'Publish a small-space furnishing guide for content and SEO',
    ],
    weaknesses: ['Conversion', 'Content', 'SEO'],
  };
}

function redCedarAudit() {
  return {
    websiteExists: false,
    overallScore: 1.5,
    categories: {
      design: auditCategory(1, ['No brand presence online'], ['Design a simple brand landing page'], false),
      mobile: auditCategory(1, ['No site to view on mobile'], ['Make the site mobile-first'], false),
      navigation: auditCategory(1, ['No site structure'], ['Define menu, hours, reservations pages'], false),
      conversion: auditCategory(1, ['No online path to book a table'], ['Add phone reservation + hours prominently'], false),
      trust: auditCategory(2, ['Customers rely on third-party review sites'], ['Feature the 4.3 rating on the site'], false),
      seo: auditCategory(1, ['Unfindable for local searches'], ['Create indexable menu and hours pages'], false),
      localSeo: auditCategory(2, ['No Google Business integration'], ['Claim and link the Google Business profile'], false),
      content: auditCategory(1, ['No site to host menu and photos'], ['Publish menu with prices'], false),
      branding: auditCategory(1, ['Brand only lives on review platforms'], ['Sketch a warm, rustic visual identity'], false),
      performance: auditCategory(1, ['n/a — no site'], ['Keep the first site lightweight'], false),
      contactAccessibility: auditCategory(3, ['Menu and hours not reachable online'], ['List address, phone, hours on every page'], false),
    },
    criticalIssues: [
      'No website means menu, prices, and hours are only discoverable by phone or visit',
    ],
    recommendations: [
      'Launch a simple site with menu, hours, and a phone-based reservation path',
      'Link the Google Business profile to drive local SEO',
    ],
    weaknesses: ['Performance', 'Local SEO', 'Content', 'Trust'],
  };
}

function asterAudit() {
  return {
    websiteExists: true,
    overallScore: 6.5,
    categories: {
      design: auditCategory(8, ['Elegant palette'], ['Add seasonal hero refreshes'], true),
      mobile: auditCategory(7, ['Order flow is long'], ['Offer one-tap bouquet reorder'], true),
      navigation: auditCategory(7, ['Wedding section is deep-linked only'], ['Surface wedding florals in the main nav'], true),
      conversion: auditCategory(5, ['No same-day-order CTA on the homepage'], ['Add an "Order today" CTA with hours'], true),
      trust: auditCategory(7, ['Reviews not shown on-site'], ['Embed the recent review highlights'], true),
      seo: auditCategory(6, ['Thin city-level landing pages'], ['Add Mission/Bay Area page variants'], true),
      localSeo: auditCategory(8, [], ['Keep NAP consistent on the footer'], true),
      content: auditCategory(6, ['No inspiration gallery'], ['Publish a wedding floral gallery'], true),
      branding: auditCategory(8, ['Strong identity'], ['Ensure consistent tone in copy blocks'], true),
      performance: auditCategory(7, ['Gallery images heavy'], ['Serve next-gen image formats'], true),
      contactAccessibility: auditCategory(7, ['No click-to-call on mobile'], ['Add click-to-call ordering'], true),
    },
    criticalIssues: [
      'Wedding services and same-day ordering are not visible without deep navigation',
    ],
    recommendations: [
      'Add a same-day bouquet CTA and a wedding floral gallery to the homepage',
      'Create Bay Area-specific landing pages for local SEO',
    ],
    weaknesses: ['Conversion', 'SEO', 'Content'],
  };
}

/* ------------------------------------------------------------------ *
 * Example builders
 * ------------------------------------------------------------------ */

function baseExample(exampleId, task, split, input, expectedOutput, sourceType, evidence) {
  return {
    exampleId,
    task,
    datasetVersion: DATASET_VERSION,
    split,
    input,
    expectedOutput,
    evidence,
    source: { type: sourceType, url: null, retrievedAt: '2026-10-06' },
    annotation: { status: 'gold', qualityScore: 1, annotatedBy: 'webloom-curator' },
    promptVersion: PROMPT_VERSION,
  };
}

function strategyGold(audit, dna, websiteGoal) {
  void audit;
  return {
    websiteGoal: websiteGoal ?? 'Convert browsers into same-day buyers and book occasion-based work',
    targetAudience: dna.audience.primary,
    primaryCTA: { text: 'Order today', action: 'schedule' },
    secondaryCTA: { text: 'Learn more', action: 'discover' },
    pages: ['Home', 'Shop', 'About', 'Contact'],
    homepageSections: ['Hero with value proposition', 'Featured products or services', 'Social proof', 'Location and hours'],
    trustStrategy: ['Local review highlights', 'Real operating hours and address on every page', 'Transparent pricing'],
    conversionStrategy: {
      primary: 'Same-day purchase path from the hero',
      secondary: 'Occasion- or project-based consultation path',
    },
    seoStrategy: ['City + category landing pages', 'Schema.org structured data', 'Consistent NAP citations'],
    visualDirection: {
      palette: ['Warm neutrals with a seasonal accent'],
      typography: 'Humanist sans-serif with serif accents',
    },
    contentStrategy: ['Inspiration gallery', 'Category guides', 'Updated operating-hour blocks'],
  };
}

function landingGold(dna) {
  return {
    pageTitle: `${dna.businessIdentity.name} — ${dna.positioning.category}`,
    pageDescription: dna.businessIdentity.essence,
    primaryCTA: { text: 'Order today', action: 'schedule' },
    sections: [
      { type: 'navigation', priority: 'high', content: 'Sticky header with phone, hours, and primary CTA' },
      { type: 'hero', priority: 'critical', content: 'Value proposition + same-day CTA' },
      { type: 'socialProof', priority: 'high', content: 'Review highlights and ratings' },
      { type: 'trustIndicators', priority: 'high', content: { items: ['Verified hours', 'Local address', 'Review rating'] } },
      { type: 'cta', priority: 'high', content: 'Order or request a consult' },
      { type: 'footer', priority: 'critical', content: 'NAP, hours, and social links' },
    ],
    theme: { colors: ['#f5f0e8', '#3f3a33', '#c9552b'], fontStyle: 'warm minimalist' },
    metadata: { author: 'webloom-curator', locale: 'en-US' },
  };
}

/* ------------------------------------------------------------------ *
 * Dataset assembly
 * ------------------------------------------------------------------ */

const TRAIN_BUILD = [
  {
    exampleId: 'ext-aster-001',
    task: 'extraction.business_profile',
    file: 'extraction/v0.1.0/train.jsonl',
    input: asterExtraction(),
    expectedOutput: asterExtractionGold(),
  },
  {
    exampleId: 'dna-aster-001',
    task: 'brand.dna',
    file: 'business-dna/v0.1.0/train.jsonl',
    input: asterDnaInput(),
    expectedOutput: asterDna(),
  },
  {
    exampleId: 'web-aster-001',
    task: 'website.analysis',
    file: 'website-analysis/v0.1.0/train.jsonl',
    input: { profile: ASTER.profile, websiteText: ASTER.websiteText },
    expectedOutput: asterAudit(),
    evidenceOverride: [{ source: SITE, text: ASTER.websiteText, url: 'https://asterandivy.example' }],
  },
  {
    exampleId: 'strat-aster-website-001',
    task: 'strategy.website',
    file: 'strategy/v0.1.0/train.jsonl',
    input: { profile: ASTER.profile, brandDna: asterDna(), websiteAnalysis: asterAudit() },
    expectedOutput: strategyGold(asterAudit(), asterDna()),
    evidenceOverride: [{ source: SITE, text: ASTER.websiteText, url: 'https://asterandivy.example' }],
  },
  {
    exampleId: 'strat-aster-landing-001',
    task: 'strategy.landing_page',
    file: 'strategy/v0.1.0/train.jsonl',
    input: {
      profile: ASTER.profile,
      brandDna: asterDna(),
      websiteStrategy: strategyGold(asterAudit(), asterDna()),
    },
    expectedOutput: landingGold(asterDna()),
    evidenceOverride: [{ source: SITE, text: ASTER.websiteText, url: 'https://asterandivy.example' }],
  },
];

const VALIDATION_BUILD = [
  {
    exampleId: 'ext-loft-001',
    task: 'extraction.business_profile',
    file: 'evaluation/validation/v0.1.0/extraction.jsonl',
    input: {
      rawBusinessData: {
        name: 'Loft & Loom',
        category: 'Home goods store',
        address: '88 Atlantic Ave, Brooklyn, NY 11217',
        phone: '+1 (718) 555-0190',
        website: 'https://loftandloom.example',
        rating: 4.8,
        reviewCount: 96,
        hours: 'daily 10am to 7pm',
      },
      websiteText: LOFT.websiteText,
      evidence: [
        { source: MAPS, text: LOFT.mapsText, url: 'https://maps.google.com/example-loft' },
        { source: SITE, text: LOFT.websiteText, url: 'https://loftandloom.example' },
      ],
    },
    expectedOutput: loftExtractionGold(),
  },
  {
    exampleId: 'ext-redcedar-001',
    task: 'extraction.business_profile',
    file: 'evaluation/validation/v0.1.0/extraction.jsonl',
    input: {
      rawBusinessData: {
        name: 'Red Cedar Grill',
        category: 'Steakhouse',
        address: '412 Falls Road, Boise, ID 83702',
        phone: '+1 (208) 555-0146',
        rating: 4.3,
        reviewCount: 1109,
        hours: 'Tuesday-Sunday 5pm-10pm',
      },
      websiteText: '',
      evidence: [
        { source: MAPS, text: REDCEDAR.mapsText, url: 'https://maps.google.com/example-redcedar' },
      ],
    },
    expectedOutput: redCedarExtractionGold(),
  },
  {
    exampleId: 'dna-redcedar-001',
    task: 'brand.dna',
    file: 'evaluation/validation/v0.1.0/business-dna.jsonl',
    input: {
      profile: {
        name: 'Red Cedar Grill',
        category: 'Steakhouse',
        description: 'Steakhouse',
        address: '412 Falls Road, Boise, ID 83702',
        phone: '+1 (208) 555-0146',
        rating: 4.3,
        reviewCount: 1109,
      },
      websiteText: '',
      brandEvidence: [
        { source: MAPS, text: REDCEDAR.mapsText, url: 'https://maps.google.com/example-redcedar' },
      ],
    },
    expectedOutput: redCedarDna(),
  },
  {
    exampleId: 'web-loft-001',
    task: 'website.analysis',
    file: 'evaluation/validation/v0.1.0/website-analysis.jsonl',
    input: { profile: { name: 'Loft & Loom', category: 'Home goods store', address: '88 Atlantic Ave, Brooklyn, NY 11217', rating: 4.8, reviewCount: 96, website: 'https://loftandloom.example' }, websiteText: LOFT.websiteText },
    expectedOutput: loftAudit(),
    evidenceOverride: [{ source: SITE, text: LOFT.websiteText, url: 'https://loftandloom.example' }],
  },
  {
    exampleId: 'web-redcedar-001',
    task: 'website.analysis',
    file: 'evaluation/validation/v0.1.0/website-analysis.jsonl',
    input: {
      profile: { name: 'Red Cedar Grill', category: 'Steakhouse', address: '412 Falls Road, Boise, ID 83702', rating: 4.3, reviewCount: 1109 },
      websiteText: null,
    },
    expectedOutput: redCedarAudit(),
    evidenceOverride: [{ source: MAPS, text: REDCEDAR.mapsText, url: 'https://maps.google.com/example-redcedar' }],
  },
  {
    exampleId: 'strat-loft-website-001',
    task: 'strategy.website',
    file: 'evaluation/validation/v0.1.0/strategy.jsonl',
    input: { profile: { name: 'Loft & Loom', category: 'Home goods store', address: '88 Atlantic Ave, Brooklyn, NY 11217', website: 'https://loftandloom.example' }, brandDna: loftDna(), websiteAnalysis: loftAudit() },
    expectedOutput: strategyGold(loftAudit(), loftDna(), 'Turn casual shoppers into repeat local buyers'),
    evidenceOverride: [{ source: SITE, text: LOFT.websiteText, url: 'https://loftandloom.example' }],
  },
];

function build() {
  const added = [];
  for (const item of [...TRAIN_BUILD, ...VALIDATION_BUILD]) {
    const file = path.join(DATASETS_DIR, item.file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const existing = fs.existsSync(file)
      ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
      : [];
    const precedent = existing.find((e) => e.exampleId === item.exampleId);
    if (precedent) {
      added.push(`${item.exampleId}  (unchanged)`);
      continue;
    }
    const evidence = item.evidenceOverride
      ?? item.input.evidence
      ?? item.input.brandEvidence
      ?? [];
    const normalizedEvidence = evidence
      .map((e) => ({ source: e.source, text: e.text ?? '', url: e.url ?? null }));
    const example = baseExample(item.exampleId, item.task, file.includes('train.jsonl') ? 'train' : 'validation', item.input, item.expectedOutput, item.task === 'extraction.business_profile' ? 'curator_annotation' : 'correction_foundation', normalizedEvidence);
    fs.appendFileSync(file, `${JSON.stringify(example)}\n`, 'utf8');
    added.push(`${item.exampleId}  (appended to ${item.file})`);
  }
  console.log(added.join('\n'));
}

build();