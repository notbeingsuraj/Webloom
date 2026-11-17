import * as React from "react";
import { cn } from "../../lib/utils";
import { MapPin, Search, Link as LinkIcon, CheckCircle2, X, Loader2 } from "lucide-react";

export interface ParsedGoogleMapsUrl {
  originalUrl: string;
  urlType: 'place' | 'search' | 'short' | 'unknown';
  isPlaceUrl: boolean;
  isSearchUrl: boolean;
  isShortUrl: boolean;
  placeId: string | null;
  cid: string | null;
  dataId: string | null;
  latitude: number | null;
  longitude: number | null;
  zoom: number | null;
  query: string | null;
  searchQuery: string | null;
  name: string | null;
  nameFromPath: string | null;
}

const PLACE_URL_PATTERN = /maps\.google\.com\/maps\/place\/|maps\.google\.com\/place\/|google\.com\/maps\/place\//i;
const SEARCH_URL_PATTERN = /maps\.google\.com\/maps\/search\/|maps\.google\.com\/search\/|google\.com\/maps\/search\//i;
const SHORT_URL_PATTERN = /maps\.app\.goo\.gl\//i;
const COORD_PATTERN = /@(-?\d+\.?\d*),(-?\d+\.?\d*)(?:,(\d+\.?\d*))?/;
const CID_PATTERN = /[?&]cid=([^&]+)/i;
const PLACE_ID_PATTERN = /[?&]place_id=([^&]+)/i;
const QUERY_PATTERN = /[?&]q=([^&]+)/i;
const QUERY_PATH_PATTERN = /\/search\/([^/?#]+)/i;
const PLACE_NAME_PATTERN = /\/place\/([^/@?#]+)/i;

export function parseGoogleMapsUrl(url: string): ParsedGoogleMapsUrl | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return null;
  
  try {
    const parsed = new URL(trimmed);
    const validHostnames = [
      'maps.google.com',
      'www.google.com',
      'google.com',
      'maps.app.goo.gl',
      'goo.gl',
    ];
    if (!validHostnames.some(host => parsed.hostname === host || parsed.hostname.endsWith('.' + host))) {
      return null;
    }
  } catch {
    return null;
  }

  const result: ParsedGoogleMapsUrl = {
    originalUrl: url,
    urlType: 'unknown',
    isPlaceUrl: false,
    isSearchUrl: false,
    isShortUrl: false,
    placeId: null,
    cid: null,
    dataId: null,
    latitude: null,
    longitude: null,
    zoom: null,
    query: null,
    searchQuery: null,
    name: null,
    nameFromPath: null,
  };

  if (SHORT_URL_PATTERN.test(url)) {
    result.urlType = 'short';
    result.isShortUrl = true;
  } else if (PLACE_URL_PATTERN.test(url)) {
    result.urlType = 'place';
    result.isPlaceUrl = true;
    
    const nameMatch = url.match(PLACE_NAME_PATTERN);
    if (nameMatch) {
      result.nameFromPath = decodeURIComponent(nameMatch[1])
        .replace(/\+/g, ' ')
        .replace(/_/g, ' ')
        .trim();
      result.name = result.nameFromPath;
    }
    
    const placeIdMatch = url.match(PLACE_ID_PATTERN);
    if (placeIdMatch) {
      result.placeId = placeIdMatch[1];
    }
    
    const cidMatch = url.match(CID_PATTERN);
    if (cidMatch) {
      result.cid = cidMatch[1];
    }
  } else if (SEARCH_URL_PATTERN.test(url)) {
    result.urlType = 'search';
    result.isSearchUrl = true;
    
    const pathQueryMatch = url.match(QUERY_PATH_PATTERN);
    if (pathQueryMatch) {
      result.searchQuery = decodeURIComponent(pathQueryMatch[1])
        .replace(/\+/g, ' ')
        .trim();
    }
    
    const queryMatch = url.match(QUERY_PATTERN);
    if (queryMatch) {
      result.query = decodeURIComponent(queryMatch[1])
        .replace(/\+/g, ' ')
        .trim();
    }
    
    result.name = result.searchQuery || result.query;
  }

  const coordMatch = url.match(COORD_PATTERN);
  if (coordMatch) {
    result.latitude = parseFloat(coordMatch[1]);
    result.longitude = parseFloat(coordMatch[2]);
    if (coordMatch[3]) {
      result.zoom = parseFloat(coordMatch[3]);
    }
  }

  if (result.latitude !== null && result.longitude !== null) {
    if (result.latitude < -90 || result.latitude > 90 || 
        result.longitude < -180 || result.longitude > 180) {
      result.latitude = null;
      result.longitude = null;
      result.zoom = null;
    }
  }

  return result;
}

interface GoogleMapsUrlParserProps {
  value: string;
  onChange: (value: string) => void;
  onParse?: (parsed: ParsedGoogleMapsUrl | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function GoogleMapsUrlParser({ 
  value, 
  onChange, 
  onParse, 
  disabled = false, 
  placeholder = "https://maps.google.com/place/...",
  className 
}: GoogleMapsUrlParserProps) {
  const [parsed, setParsed] = React.useState<ParsedGoogleMapsUrl | null>(null);
  const [isValidating, setIsValidating] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (value.trim()) {
        setIsValidating(true);
        try {
          const parsed = parseGoogleMapsUrl(value);
          setParsed(parsed);
          onParse?.(parsed);
        } catch {
          setParsed(null);
          onParse?.(null);
        } finally {
          setIsValidating(false);
        }
      } else {
        setParsed(null);
        onParse?.(null);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [value, onParse]);

  const isValid = parsed !== null && (parsed.isPlaceUrl || parsed.isSearchUrl || parsed.isShortUrl);

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="url"
          required
          aria-invalid={value && !isValid}
          className={cn(
            'wl-input py-4 pl-12 pr-4 text-base',
            !isValid && value ? 'border-destructive/50 focus:border-destructive focus:ring-destructive/20' : ''
          )}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
        />
        {isValidating && (
          <Loader2 className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary animate-spin" />
        )}
        {isValid && !isValidating && (
          <CheckCircle2 className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-verified" />
        )}
        {!isValid && value && !isValidating && (
          <X className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-destructive" />
        )}
      </div>

      {parsed && (
        <div className="mt-3 rounded-xl border border-border bg-gradient-to-br from-secondary via-card to-ai/5 p-4 animate-in fade-in-200 duration-300">
          <p className="wl-eyebrow">URL analysis</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className={cn('flex h-6 w-6 items-center justify-center rounded-lg', 
                parsed.isPlaceUrl ? 'bg-primary/12 text-primary' : 
                parsed.isSearchUrl ? 'bg-ai/12 text-ai' : 
                'bg-warning/12 text-warning')}>
                {parsed.isPlaceUrl ? <MapPin className="h-3.5 w-3.5" /> : 
                 parsed.isSearchUrl ? <Search className="h-3.5 w-3.5" /> : 
                 <LinkIcon className="h-3.5 w-3.5" />}
              </span>
              <span>Mode: <span className="text-foreground capitalize">{parsed.isPlaceUrl ? 'Place URL' : parsed.isSearchUrl ? 'Search URL' : parsed.isShortUrl ? 'Short URL' : 'Unknown'}</span></span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              {parsed.latitude !== null && parsed.longitude !== null ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-verified" />
                  <span>Coordinates: <span className="text-foreground">{parsed.latitude.toFixed(6)}, {parsed.longitude.toFixed(6)}</span></span>
                </>
              ) : (
                <>
                  <X className="h-3.5 w-3.5 text-destructive" />
                  <span>Coordinates: <span className="text-foreground">Not found</span></span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="font-medium">Place ID:</span>
              <span className="text-foreground font-mono text-xs">{parsed.placeId || parsed.cid || parsed.dataId || 'Not in URL'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GoogleMapsUrlParser;