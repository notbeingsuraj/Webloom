import { Star, MessageSquare, Info, AlertTriangle } from 'lucide-react';
import type { Lead } from '../services/leadService';

// ---------------------------------------------------------------------------
// P1.9 Reputation Panel
//
// Renders rating + review data with truthful state handling:
//   - rating: "4.1/5"  (never "0", never "—" when available)
//   - reviewCount: "82 reviews"  (never "—" when available)
//   - source: Google Maps / provider / AI evidence extraction
//   - status: verified | source_extracted | ai_extracted_from_evidence |
//             partial | unavailable | conflicting
//   - sample count vs total review count distinction
// ---------------------------------------------------------------------------

type ReputationStatus =
  | 'verified'
  | 'source_extracted'
  | 'ai_extracted_from_evidence'
  | 'partial'
  | 'unavailable'
  | 'conflicting'
  | null;

function statusLabel(status: ReputationStatus | undefined): string | null {
  switch (status) {
    case 'verified':
      return 'Verified from structured source';
    case 'source_extracted':
      return 'Extracted from source evidence';
    case 'ai_extracted_from_evidence':
      return 'Extracted from source evidence';
    case 'partial':
      return 'Partial review data';
    case 'unavailable':
      return 'Rating unavailable from supplied sources';
    case 'conflicting':
      return 'Reputation data could not be verified for this business';
    default:
      return null;
  }
}

function sourceLabel(source?: string | null): string {
  if (!source) return 'Google Maps';
  if (source === 'provider_record' || source === 'structured_provider') return 'Google Maps (structured)';
  return 'Google Maps';
}

export default function ReputationPanel({ lead }: { lead: Lead | undefined }) {
  const rep = lead?.businessData?.reputation;
  const rating = rep?.rating ?? lead?.businessData?.rating ?? null;
  const reviewCount = rep?.reviewCount ?? lead?.businessData?.reviewCount ?? null;
  const reviews = rep?.reviews ?? lead?.businessData?.reviews ?? [];
  const reviewSummary = rep?.reviewSummary ?? lead?.businessData?.reviewSummary ?? null;
  const status = rep?.status ?? null;

  const statusText = statusLabel(status);
  const isUnavailable = status === 'unavailable' || (rating == null && reviewCount == null && reviews.length === 0);
  const isConflicting = status === 'conflicting';

  const sampleCount = reviews.length;

  // The specific P1.9 §13 copy for partial data:
  //   "5 review samples available; total review count: 82"
  const partialNote =
    sampleCount > 0 && reviewCount != null && sampleCount < reviewCount
      ? `${sampleCount} review sample${sampleCount === 1 ? '' : 's'} available; total review count: ${reviewCount}`
      : null;

  return (
    <div className="wl-card p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-[-0.04em] text-foreground">Reviews & reputation</h2>
        {status && (
          <span
            className={[
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium tracking-wide',
              isUnavailable ? 'bg-secondary text-muted-foreground border border-border'
                : isConflicting ? 'bg-red-50 text-destructive border border-red-200'
                : status === 'ai_extracted_from_evidence' ? 'bg-purple-50 text-purple-700 border border-purple-200'
                : 'bg-blue-50 text-blue-700 border border-blue-200',
            ].join(' ')}
          >
            {isConflicting ? <AlertTriangle className="h-3 w-3" /> : <Info className="h-3 w-3" />}
            {statusLabel(status)}
          </span>
        )}
      </div>

      {/* Rating + review count */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-primary/5 p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Rating</p>
          <div className="mt-3 flex items-center gap-1.5">
            {rating != null ? (
              <>
                <Star className="h-4 w-4 text-[#F59E0B] fill-[#F59E0B]" />
                <span className="text-2xl font-semibold tracking-[-0.05em] text-foreground">
                  {typeof rating === 'number' ? rating.toFixed(1) : rating}
                </span>
                <span className="text-sm text-muted-foreground">/ 5</span>
              </>
            ) : (
              <span className="text-lg font-medium leading-7 text-muted-foreground">Unavailable</span>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-primary/5 p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Reviews</p>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-foreground">
            {reviewCount != null ? (
              <>
                {reviewCount.toLocaleString()}<span className="ml-1 text-sm font-normal text-muted-foreground">reviews</span>
              </>
            ) : (
              <span className="text-lg font-medium leading-7 text-muted-foreground">
                {sampleCount > 0 ? 'Total count unavailable' : 'Unavailable'}
              </span>
            )}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-primary/5 p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Review source</p>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-foreground">
            <span className="flex items-center gap-1.5 text-lg font-medium leading-7">
              <MessageSquare className="h-4 w-4 text-primary" />
              {sourceLabel(rep?.source)}
            </span>
          </p>
        </div>
      </div>

      {/* Unavailable / conflicting states */}
      {isUnavailable && !partialNote && (
        <p className="mt-4 rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-muted-foreground">
          {statusText || 'Rating unavailable from supplied sources'}
        </p>
      )}
      {isConflicting && (
        <p className="mt-4 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Reputation data could not be verified for this business.
        </p>
      )}

      {/* Partial note: sample count vs total */}
      {partialNote && (
        <p className="mt-4 rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-muted-foreground">
          {partialNote}
        </p>
      )}

      {/* Review summary */}
      {reviewSummary && (
        <div className="mt-4 rounded-xl border border-border bg-secondary px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Review summary</p>
          <p className="mt-1 text-sm leading-6 text-foreground">{reviewSummary}</p>
        </div>
      )}

      {/* Review samples */}
      {sampleCount > 0 && (
        <div className="mt-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Review samples ({sampleCount})</p>
          <ul className="mt-3 space-y-2">
            {reviews.slice(0, 10).map((r, idx) => (
              <li key={idx} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {r.rating != null && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      <Star className="h-3 w-3 fill-[#F59E0B] text-[#F59E0B]" />
                      {r.rating}
                    </span>
                  )}
                  {r.author && <span className="text-xs font-medium text-foreground">{r.author}</span>}
                  {r.publishedAt && <span className="text-xs text-muted-foreground">{r.publishedAt}</span>}
                </div>
                {r.text && <p className="mt-2 text-sm leading-6 text-foreground">{r.text}</p>}
                {r.provenance === 'ai_generated' && (
                  <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-ai">
                    Extracted from source evidence
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}