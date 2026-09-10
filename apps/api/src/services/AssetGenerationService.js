/**
 * AssetGenerationService
 * 
 * Handles high-quality asset generation for generated websites.
 * Supports multiple providers with graceful fallback.
 */

import AIService from './AIService.js';
import { buildAssetGenerationPrompt } from '../prompts/assetGeneration.js';
import { config } from '../config/env.js';
import CanonicalBusinessProfileService from './CanonicalBusinessProfileService.js';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class AssetGenerationService {
  constructor() {
    this.assetsDir = config.assetGeneration?.assetsDir 
      ? path.resolve(config.assetGeneration.assetsDir)
      : path.join(path.resolve(__dirname, '../../../../'), 'generated-sites');
  }

  /**
   * Generate all assets for a site based on the asset plan.
   * Returns map of asset IDs to generated file paths.
   */
  async generateAssets(slug, assetPlan, designSystem, businessProfile) {
    const siteDir = path.join(this.assetsDir, slug);
    const assetsDir = path.join(siteDir, 'public', 'assets');
    await fsp.mkdir(assetsDir, { recursive: true });

    const generatedAssets = {
      hero: null,
      supporting: [],
      gallery: [],
      metadata: {
        generatedAt: new Date().toISOString(),
        provider: null,
        resolution: null,
      }
    };

    try {
      // Generate hero asset (most critical)
      if (assetPlan.hero) {
        const heroAsset = await this.generateSingleAsset({
          ...assetPlan.hero,
          id: 'hero',
          slug,
          siteDir,
          assetsDir,
          designSystem,
          businessProfile
        });
        if (heroAsset) {
          generatedAssets.hero = heroAsset;
        }
      }

      // Generate supporting assets (2-4)
      if (assetPlan.supporting && assetPlan.supporting.length > 0) {
        for (const support of assetPlan.supporting.slice(0, 4)) {
          const asset = await this.generateSingleAsset({
            ...support,
            slug,
            siteDir,
            assetsDir,
            designSystem,
            businessProfile
          });
          if (asset) {
            generatedAssets.supporting.push(asset);
          }
        }
      }

      // Generate gallery if specified
      if (assetPlan.gallery?.count > 0) {
        const count = Math.min(assetPlan.gallery.count, 12);
        for (let i = 0; i < count; i++) {
          const galleryItem = assetPlan.supporting[i] || {
            id: `gallery-${i}`,
            purpose: `gallery-${i}`,
            subject: assetPlan.gallery.style || 'business environment',
            aspectRatio: '4:3',
            resolution: '2k'
          };
          const asset = await this.generateSingleAsset({
            ...galleryItem,
            id: `gallery-${i}`,
            slug,
            siteDir,
            assetsDir,
            designSystem,
            businessProfile
          });
          if (asset) {
            generatedAssets.gallery.push(asset);
          }
        }
      }

      // Generate optimized derivatives
      await this.generateDerivatives(assetsDir, generatedAssets);

      generatedAssets.metadata.provider = config.assetGeneration?.provider || 'placeholder';
      generatedAssets.metadata.resolution = '4k';

    } catch (error) {
      console.error('[AssetGenerationService] Asset generation failed:', error.message);
      // Return empty assets - renderer will use CSS fallbacks
      return {
        hero: null,
        supporting: [],
        gallery: [],
        metadata: { error: error.message }
      };
    }

    return generatedAssets;
  }

  /**
   * Generate a single asset using the configured provider.
   * Falls back gracefully if generation fails.
   */
  async generateSingleAsset(params) {
    const { id, slug, siteDir, assetsDir, designSystem, businessProfile, ...assetSpec } = params;
    
    const provider = config.assetGeneration?.provider || 'placeholder';
    
    try {
      let assetPath = null;
      
      if (provider === 'openai' && config.assetGeneration?.openaiApiKey) {
        assetPath = await this.generateWithOpenAI(params);
      } else if (provider === 'replicate' && config.assetGeneration?.replicateApiKey) {
        assetPath = await this.generateWithReplicate(params);
      } else if (provider === 'local' && config.assetGeneration?.localModelPath) {
        assetPath = await this.generateWithLocal(params);
      } else {
        // Placeholder fallback - generate a designed CSS-based asset
        assetPath = await this.generatePlaceholderAsset(params);
      }

      if (!assetPath) return null;

      // Validate generated asset
      const validated = await this.validateAsset(assetPath, params.resolution);
      if (!validated) {
        console.warn(`[AssetGenerationService] Asset ${id} failed validation, using fallback`);
        return this.generatePlaceholderAsset(params);
      }

      // Copy to assets directory with deterministic name
      const ext = path.extname(assetPath) || '.webp';
      const finalName = `${slug}-${params.id}.webp`;
      const finalPath = path.join(assetsDir, finalName);
      
      await fsp.copyFile(assetPath, finalPath);
      
      // Clean up temp file if different
      if (assetPath !== finalPath) {
        await fsp.unlink(assetPath).catch(() => {});
      }

      return {
        id: params.id,
        path: `/assets/${finalName}`,
        absolutePath: finalPath,
        width: validated.width,
        height: validated.height,
        format: 'webp',
        size: validated.size,
        aspectRatio: params.aspectRatio,
        treatment: params.treatment || {},
      };

    } catch (error) {
      console.warn(`[AssetGenerationService] Failed to generate ${params.id}:`, error.message);
      // Return placeholder fallback
      return this.generatePlaceholderAsset(params);
    }
  }

  /**
   * Generate high-quality asset using OpenAI DALL-E 3
   */
  async generateWithOpenAI(params) {
    // Implementation for OpenAI DALL-E 3
    // Returns path to generated image
    throw new Error('OpenAI provider not implemented yet');
  }

  /**
   * Generate using Replicate (Stable Diffusion, Midjourney, etc.)
   */
  async generateWithReplicate(params) {
    // Implementation for Replicate
    throw new Error('Replicate provider not implemented yet');
  }

  /**
   * Generate using local model (Stable Diffusion via ComfyUI, etc.)
   */
  async generateWithLocal(params) {
    // Implementation for local generation
    throw new Error('Local provider not implemented yet');
  }

  /**
   * Generate a designed placeholder asset using CSS/Canvas
   * This creates a visually appealing placeholder that matches the design system
   */
  async generatePlaceholderAsset(params) {
    const { id, slug, siteDir, assetsDir, designSystem, businessProfile, aspectRatio = '16:9', resolution = '4k' } = params;
    
    const assetsDirPath = path.join(siteDir, 'public', 'assets');
    await fsp.mkdir(assetsDirPath, { recursive: true });
    
    const finalName = `${slug}-${params.id}.svg`;
    const finalPath = path.join(assetsDirPath, finalName);
    
    // Extract design tokens for placeholder
    const colors = params.designSystem?.colorSystem || {
      primary: '#2563eb',
      secondary: '#7c3aed',
      accent: '#f59e0b',
      background: '#ffffff',
      surface: '#f8fafc',
    };
    
    const typography = params.designSystem?.typography || {
      display: { family: 'Georgia, serif' },
      body: { family: 'system-ui, sans-serif' }
    };
    
    // P1.5: business facts come from canonical projection. The 'Business'
    // fallback is display-only placeholder text for SVG rendering — never a
    // synthetic identity assertion.
    const canonical = CanonicalBusinessProfileService.fromEntityData({
      record: params.businessProfile,
    });
    const businessName = canonical.identity.name || 'Business';
    const category = canonical.business.category || 'Business';
    
    // Parse aspect ratio
    const [w, h] = aspectRatio.split(':').map(Number);
    const baseWidth = resolution === '4k' ? 3840 : resolution === '2k' ? 2560 : 1920;
    const width = Math.round(baseWidth);
    const height = Math.round(baseWidth * h / w);
    
    // Generate SVG placeholder with design system styling
    const svg = this.generatePlaceholderSVG({
      width,
      height,
      businessName,
      category,
      colors,
      typography,
      treatment: params.treatment || {},
    });
    
    await fsp.writeFile(path.join(params.siteDir, 'public', 'assets', `${slug}-${params.id}.svg`), svg);
    
    // Also create a WebP version for production (would need sharp in real implementation)
    // For now, return SVG path
    return path.join('public', 'assets', finalName);
  }

  generatePlaceholderSVG({ width, height, businessName, category, colors, typography, treatment }) {
    const { primary, secondary, accent, background, surface, text } = colors;
    const displayFont = typography.display?.family || 'Georgia, serif';
    const bodyFont = typography.body?.family || 'system-ui, sans-serif';
    
    // Create a sophisticated placeholder that reflects the design system
    const gradientId = `grad-${Math.random().toString(36).substr(2, 9)}`;
    
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${colors.primary};stop-opacity:0.1" />
      <stop offset="50%" style="stop-color:${colors.accent};stop-opacity:0.05" />
      <stop offset="100%" style="stop-color:${colors.secondary};stop-opacity:0.1" />
    </linearGradient>
    <filter id="grain" x="0" y="0">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/>
      <feColorMatrix in="SourceGraphic" type="saturate" values="0"/>
      <feBlend mode="multiply"/>
    </filter>
  </defs>
  
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="${colors.background}"/>
  <rect width="${width}" height="${height}" fill="url(#${gradientId})"/>
  
  <!-- Subtle grain texture -->
  <rect width="${width}" height="${height}" fill="${colors.background}" filter="url(#grain)" opacity="0.03"/>
  
  <!-- Decorative accent elements -->
  <circle cx="${width * 0.15}" cy="${height * 0.2}" r="${Math.min(width, height) * 0.15}" 
          fill="${colors.primary}" opacity="0.03" />
  <circle cx="${width * 0.85}" cy="${height * 0.8}" r="${Math.min(width, height) * 0.12}" 
          fill="${colors.accent}" opacity="0.03" />
  
  <!-- Content area -->
  <g font-family="${typography.display?.family || 'Georgia, serif'}">
    <!-- Category badge -->
    <text x="${width/2}" y="${height * 0.35}" 
          text-anchor="middle" 
          font-family="${typography.body?.family || 'system-ui, sans-serif'}"
          font-size="${Math.max(18, width / 60)}"
          font-weight="500"
          letter-spacing="0.2em"
          text-transform="uppercase"
          fill="${colors.primary}" opacity="0.8">
      ${this.escapeXml(category || 'Business')}
    </text>
    
    <!-- Business name -->
    <text x="${width/2}" y="${height * 0.45}" 
          text-anchor="middle" 
          font-family="${typography.display?.family || 'Georgia, serif'}"
          font-size="${Math.max(48, width / 18)}"
          font-weight="700"
          line-height="1.1"
          fill="${colors.text}"
          style="font-family: ${typography.display?.family || 'Georgia, serif'}">
      ${this.escapeXml(this.truncateForSVG(businessName, width, 0.8))}
    </text>
    
    <!-- Divider -->
    <line x1="${width * 0.4}" y1="${height * 0.55}" 
          x2="${width * 0.6}" y2="${height * 0.55}"
          stroke="${colors.accent}" stroke-width="${Math.max(2, width / 400)}" 
          stroke-linecap="round" opacity="0.6"/>
    
    <!-- Subtitle -->
    <text x="${width/2}" y="${height * 0.62}" 
          text-anchor="middle" 
          font-family="${typography.body?.family || 'system-ui, sans-serif'}"
          font-size="${Math.max(16, width / 50)}"
          font-weight="400"
          fill="${colors.text}" opacity="0.7">
      ${this.escapeXml('Professional local business website')}
    </text>
    
    <!-- Decorative line -->
    <line x1="${width * 0.35}" y1="${height * 0.72}" 
          x2="${width * 0.65}" y2="${height * 0.72}"
          stroke="${colors.primary}" stroke-width="${Math.max(1, width / 600)}" 
          stroke-dasharray="8,4" opacity="0.3"/>
    
    <!-- Attribution -->
    <text x="${width/2}" y="${height * 0.85}" 
          text-anchor="middle" 
          font-family="${typography.body?.family || 'system-ui, sans-serif'}"
          font-size="${Math.max(12, width / 80)}"
          fill="${colors.mutedText || colors.text}" opacity="0.5"
          font-style="italic">
      Webloom • Generated placeholder • Replace with real imagery
    </text>
  </g>
</svg>`;
  }

  truncateForSVG(text, width, maxWidthRatio = 0.8) {
    // Approximate character limit based on width
    const maxChars = Math.floor(width / 20);
    if (text.length <= maxChars) return text;
    return text.substring(0, maxChars - 3) + '...';
  }

  escapeXml(text) {
    return String(text)
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '&apos;');
  }

  /**
   * Validate generated asset meets requirements
   */
  async validateAsset(assetPath, expectedResolution) {
    try {
      const stats = await fsp.stat(assetPath);
      if (stats.size === 0) return null;
      
      // For SVG, basic validation
      if (assetPath.endsWith('.svg')) {
        const content = await fsp.readFile(assetPath, 'utf8');
        if (content.includes('<svg') && content.includes('</svg>')) {
          return { width: 3840, height: 2160, size: stats.size };
        }
      }
      
      // For other formats, would use sharp or similar
      return { width: 3840, height: 2160, size: stats.size };
    } catch {
      return null;
    }
  }

  /**
   * Generate optimized derivatives (WebP, AVIF, responsive sizes)
   */
  async generateDerivatives(assetsDir, generatedAssets) {
    // In production, would use sharp to generate:
    // - WebP versions
    // - AVIF versions  
    // - Responsive sizes (hero: 3840w, 1920w, 960w, 480w)
    // - AVIF/WebP with quality 80
    // - Blurhash/LQIP for progressive loading
    
    // For now, metadata only
    if (generatedAssets.hero) {
      generatedAssets.hero.derivatives = {
        webp: generatedAssets.hero.path.replace('.svg', '.webp'),
        avif: generatedAssets.hero.path.replace('.svg', '.avif'),
        sizes: ['3840w', '1920w', '960w', '480w'],
      };
    }
  }
}

export default new AssetGenerationService();