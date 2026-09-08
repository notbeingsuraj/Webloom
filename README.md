# 🌱 Webloom

<p align="center">
  <strong>AI-powered business intelligence and website generation platform.</strong>
</p>

<p align="center">
  Research a real business. Understand its brand. Generate its website.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/AI-Native-7C3AED?style=for-the-badge" alt="AI Native">
  <img src="https://img.shields.io/badge/Business-Intelligence-0EA5E9?style=for-the-badge" alt="Business Intelligence">
  <img src="https://img.shields.io/badge/Website-Generation-22C55E?style=for-the-badge" alt="Website Generation">
  <img src="https://img.shields.io/badge/Status-Active%20Development-F59E0B?style=for-the-badge" alt="Status">
</p>

---

## Overview

**Webloom** is an AI-native platform that converts a **Google Maps business URL into a researched, branded, and personalized website**.

Webloom does not simply ask an LLM to invent a website from a prompt.

It first builds an understanding of the actual business, then uses that information to determine the brand direction, digital strategy, and website design.

The core pipeline is:

    Google Maps URL
            ↓
    Business Extraction
            ↓
    Web Research
            ↓
    BusinessProfile
            ↓
    Brand DNA
            ↓
    Digital Audit
            ↓
    Design Intelligence
            ↓
    Website Strategy
            ↓
    AI Website Generation
            ↓
    Astro / Vite Website

---

## What Webloom Does

### 1. Business Discovery

Webloom starts with a Google Maps URL.

It extracts and normalizes information such as:

- Business name
- Business category
- Address
- Location
- Phone number
- Website
- Rating
- Review count
- Opening hours
- Business attributes
- Public business information

The extracted information is converted into a structured `BusinessProfile`.

This gives the rest of the system a consistent representation of the business.

---

### 2. Business Research

After identifying the business, Webloom researches its public digital presence.

The research layer can use:

- Structured business data
- Existing business websites
- Public web content
- External business information
- AI-assisted enrichment

The goal is to answer:

- What does this business actually do?
- Who is it serving?
- What services does it provide?
- What information is already available?
- What information is missing?
- How is the business currently positioned online?

---

### 3. BusinessProfile

All relevant business information is normalized into a structured business model.

Conceptually:

    BusinessProfile
    ├── Identity
    ├── Location
    ├── Contact
    ├── Category
    ├── Hours
    ├── Ratings
    ├── Website
    ├── Description
    ├── Services
    ├── Attributes
    └── Provenance

`BusinessProfile` acts as the primary source of context for downstream AI systems.

Instead of passing raw scraped information directly into website generation, Webloom first converts it into structured business intelligence.

---

## 4. Data Provenance

Webloom distinguishes between information that is **sourced** and information that is **AI-derived**.

Typical provenance categories include:

- `IDENTIFIED` — directly extracted from a known business source
- `DISCOVERED` — found through external research
- `INFERRED` — derived by AI from available evidence

For example:

    Phone Number
        → IDENTIFIED

    Business Category
        → IDENTIFIED

    Target Audience
        → INFERRED

    Brand Personality
        → INFERRED

    Visual Direction
        → AI-generated design intelligence

This prevents creative AI decisions from being confused with factual business information.

---

# 5. Brand DNA

Webloom converts business information into a **Brand DNA** model.

Brand DNA represents how the business should communicate and visually position itself.

It can contain:

- Brand personality
- Target audience
- Positioning
- Value proposition
- Communication style
- Tone of voice
- Brand characteristics
- Competitive direction

For example, a luxury salon, neighborhood restaurant, law firm, gym, and automobile workshop should not all receive the same generic website.

Brand DNA provides the contextual layer that makes the generated website specific to the business.

---

# 6. Digital Audit

Webloom evaluates the business's existing digital presence before generating a new website.

The audit can identify:

- Existing website content
- Available business information
- Existing digital assets
- Content gaps
- Structural weaknesses
- Information that can be reused
- Areas that should be improved

The purpose is not simply scraping.

The audit provides information that influences the website strategy.

    Existing Digital Presence
              ↓
         Digital Audit
              ↓
       Strengths + Gaps
              ↓
        Website Strategy

---

# 7. Design Intelligence

Webloom separates **business intelligence** from **design decisions**.

The Design Intelligence layer translates the business and brand information into a concrete visual and UX direction.

It can determine:

- Visual personality
- Color direction
- Typography
- Layout hierarchy
- Spacing
- Imagery direction
- Section structure
- CTA strategy
- Conversion hierarchy
- Responsive behavior

The relationship is:

    BusinessProfile
          +
       Brand DNA
          +
      Digital Audit
          ↓
    Design Intelligence
          ↓
    Website Strategy

This prevents the generator from producing the same visual template for every business.

---

# 8. AI Website Generation

The final generation stage consumes the intelligence produced by the previous stages.

    BusinessProfile
          +
       Brand DNA
          +
      Digital Audit
          +
    Design Intelligence
          ↓
    Website Strategy
          ↓
    AI Generation
          ↓
    Astro / Vite Project

The generated website can include:

- Business-specific content
- Business-specific branding
- Responsive layouts
- Reusable components
- SEO-oriented structure
- Conversion-focused sections
- Contact and CTA sections
- Service/product presentation
- Location and business information

The generator is intentionally downstream of the research pipeline.

---

# Architecture

    ┌───────────────────────────────────────────────┐
    │                  WEBLOOM UI                   │
    │                                               │
    │  Business URL → Research → Website Preview    │
    └───────────────────────┬───────────────────────┘
                            │
                            ▼
    ┌───────────────────────────────────────────────┐
    │              NODE.JS / EXPRESS                │
    │                                               │
    │ URL Parsing │ Research │ AI │ Generation      │
    └───────────────┬───────────────────┬───────────┘
                    │                   │
                    ▼                   ▼
           ┌─────────────────┐  ┌──────────────────┐
           │ Research Layer  │  │    AI Layer      │
           │                 │  │                  │
           │ Geoapify        │  │ OmniRoute        │
           │ Web Extraction  │  │ AI Enrichment    │
           │ Provider Logic  │  │ Brand DNA        │
           └────────┬────────┘  │ Design Intel.    │
                    │           └────────┬─────────┘
                    │                    │
                    └──────────┬─────────┘
                               ▼
                    ┌────────────────────┐
                    │   BusinessProfile  │
                    │ + Provenance Data  │
                    └──────────┬─────────┘
                               │
                               ▼
                    ┌────────────────────┐
                    │ Website Strategy   │
                    └──────────┬─────────┘
                               │
                               ▼
                    ┌────────────────────┐
                    │   Astro / Vite     │
                    │   Site Generator   │
                    └──────────┬─────────┘
                               │
                               ▼
                    ┌────────────────────┐
                    │ Personalized Site  │
                    └────────────────────┘

---

# Research Pipeline

Webloom uses a layered research architecture rather than relying on a single AI request.

    Google Maps URL
          ↓
    Deterministic URL Parsing
          ↓
    Structured Business Provider
          ↓
    Web Extraction
          ↓
    Data Normalization
          ↓
    AI Enrichment
          ↓
    BusinessProfile
          ↓
    Brand + Design Intelligence

Current integrations include:

- **Geoapify** — structured business and location data
- **r.jina.ai** — web content extraction
- **OmniRoute** — model routing and AI inference

Provider-specific logic is isolated so that individual data sources can be replaced or extended without redesigning the complete pipeline.

---

# AI Architecture

Webloom uses AI at specific stages rather than making one model call responsible for the entire system.

    Raw Business Data
           ↓
    Context Construction
           ↓
    AI Enrichment
           ↓
    Brand Analysis
           ↓
    Design Analysis
           ↓
    Website Strategy
           ↓
    Code Generation

This separation makes the system easier to reason about, validate, and extend.

---

# Generated Website Runtime

Generated websites are built using an **Astro + Vite** based architecture.

A generated project can contain:

    Generated Project
    ├── Pages
    ├── Components
    ├── Styles
    ├── Assets
    ├── Configuration
    └── Runtime

Astro provides a lightweight rendering layer suitable for business websites, while Vite provides the development and build tooling.

---

# Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React + Vite | Webloom application interface |
| Backend | Node.js + Express | API and system orchestration |
| AI Routing | OmniRoute | Model routing and inference |
| Business Data | Geoapify | Structured business/location data |
| Web Extraction | r.jina.ai | External website/content extraction |
| Generated Sites | Astro + Vite | Website generation and rendering |
| AI/ML | LLMs | Enrichment, brand reasoning, design reasoning |
| Data Model | BusinessProfile | Normalized business intelligence |

---

# Project Structure

    Webloom/
    ├── frontend/          # Webloom UI
    ├── backend/           # API and orchestration
    │   ├── research/      # Business research pipeline
    │   ├── providers/     # External data providers
    │   ├── extraction/    # Web/data extraction
    │   ├── ai/            # AI orchestration
    │   ├── profiles/      # BusinessProfile logic
    │   ├── brand/         # Brand DNA
    │   ├── design/        # Design Intelligence
    │   └── generation/    # Website generation
    ├── generated/         # Generated websites
    └── README.md

The exact repository structure may evolve as Webloom develops.

---

# Example

### Input

    https://www.google.com/maps/...

### Webloom

    Identify Business
          ↓
    Extract Business Data
          ↓
    Research Public Presence
          ↓
    Build BusinessProfile
          ↓
    Track Provenance
          ↓
    Generate Brand DNA
          ↓
    Run Digital Audit
          ↓
    Generate Design Intelligence
          ↓
    Create Website Strategy
          ↓
    Generate Astro/Vite Website

### Output

A personalized business website based on:

    Real Business Information
            +
    Business Intelligence
            +
    Brand Intelligence
            +
    Design Intelligence
            +
    AI Website Generation

---

# Why Webloom Exists

Most website generators start with a blank prompt and a generic template.

Webloom starts with the **business**.

That changes the architecture.

Instead of:

    Prompt → Template → Website

Webloom uses:

    Business
       ↓
    Research
       ↓
    Intelligence
       ↓
    Brand
       ↓
    Design
       ↓
    Website

The objective is to generate a website that actually reflects the business rather than a vaguely attractive page with invented copy and three suspiciously enthusiastic testimonials.

---

# Engineering Principles

### Separation of Facts and Inference

Sourced business information and AI-generated interpretation should remain distinguishable.

### Structured Intermediate Representation

`BusinessProfile` provides a stable interface between research and generation.

### Provider Abstraction

External data providers should not be tightly coupled to the core business logic.

### Intelligence Before Generation

The website generator should consume researched context instead of being responsible for discovering the business itself.

### Business-Specific Design

Visual and UX decisions should originate from the business context and Brand DNA.

### Deterministic Where Possible

Parsing, normalization, validation, and other predictable operations should not unnecessarily depend on an LLM.

---

# Current Limitations

Webloom is actively evolving.

The current architecture focuses on the complete pipeline from business discovery to website generation, but deeper research capabilities can still be expanded.

Future improvements include:

- Multi-pass autonomous research
- Cross-source verification
- Evidence graphs
- Source conflict resolution
- Confidence scoring
- Knowledge-gap detection
- Deeper website analysis
- Automated testing of generated websites
- Stronger validation before generation
- More advanced autonomous website iteration

The intended direction is:

    Research
       ↓
    Evidence
       ↓
    Verification
       ↓
    Confidence
       ↓
    Intelligence
       ↓
    Generation

---

# Getting Started

### Clone

    git clone <repository-url>
    cd Webloom

### Install Dependencies

    npm install

### Configure Environment

Create a `.env` file with the required credentials and configuration for the active services.

Typical configuration includes:

    PORT=5001
    GEOAPIFY_API_KEY=your_key
    AI_API_KEY=your_key

Additional variables may be required depending on the configured AI and extraction providers.

### Run

    npm run dev

---

# Product Flow

The complete Webloom experience is:

    ┌─────────────┐
    │ Google Maps │
    │     URL     │
    └──────┬──────┘
           ↓
    ┌─────────────┐
    │  Research   │
    └──────┬──────┘
           ↓
    ┌─────────────┐
    │   Business  │
    │   Profile   │
    └──────┬──────┘
           ↓
    ┌─────────────┐
    │  Brand DNA  │
    └──────┬──────┘
           ↓
    ┌─────────────┐
    │   Digital   │
    │    Audit    │
    └──────┬──────┘
           ↓
    ┌─────────────┐
    │   Design    │
    │ Intelligence│
    └──────┬──────┘
           ↓
    ┌─────────────┐
    │   Website   │
    │  Generation │
    └──────┬──────┘
           ↓
    ┌─────────────┐
    │ Personalized │
    │   Website   │
    └─────────────┘

---

<p align="center">
  <strong>Webloom</strong>
  <br>
  <sub>Research the business. Understand the brand. Generate the website.</sub>
</p>
