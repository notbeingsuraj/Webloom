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
    <div className="rounded-[30px] border border-webloom-border bg-webloom-surface p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-[-0.04em] text-webloom-text">Reviews & reputation</h2>
        {status && (
          <span
            className={[
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium tracking-wide',
              isUnavailable ? 'bg-webloom-surface text-webloom-muted border border-webloom-border'
                : isConflicting ? 'bg-red-900/30 text-red-400 border border-red-800/50'
                : status === 'ai_extracted_from_evidence' ? 'bg-purple-900/30 text-purple-300 border border-purple-800/50'
                : 'bg-primary-900/30 text-primary-400 border border-primary-800/50',
            ].join(' ')}
          >
            {isConflicting ? <AlertTriangle className="h-3 w-3" /> : <Info className="h-3 w-3" />}
            {statusLabel(status)}
          </span>
        )}
      </div>

      {/* Rating + review count */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[22px] border border-webloom-border bg-webloom-raised p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Rating</p>
          <div className="mt-3 flex items-center gap-1.5">
            {rating != null ? (
              <>
                <Star className="h-4 w-4 text-[#F59E0B] fill-[#F59E0B]" />
                <span className="text-2xl font-semibold tracking-[-0.05em] text-webloom-text">
                  {typeof rating === 'number' ? rating.toFixed(1) : rating}
                </span>
                <span className="text-sm text-webloom-muted">/ 5</span>
              </>
            ) : (
              <span className="text-lg font-medium leading-7 text-webloom-muted">Unavailable</span>
            )}
          </div>
        </div>

        <div className="rounded-[22px] border border-webloom-border bg-webloom-raised p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Reviews</p>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-webloom-text">
            {reviewCount != null ? (
              <>
                {reviewCount.toLocaleString()}<span className="ml-1 text-sm font-normal text-webloom-muted">reviews</span>
              </>
            ) : (
              <span className="text-lg font-medium leading-7 text-webloom-muted">
                {sampleCount > 0 ? 'Total count unavailable' : 'Unavailable'}
              </span>
            )}
          </p>
        </div>

        <div className="rounded-[22px] border border-webloom-border bg-webloom-raised p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Review source</p>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-webloom-text">
            <span className="flex items-center gap-1.5 text-lg font-medium leading-7">
              <MessageSquare className="h-4 w-4 text-primary-400" />
              {sourceLabel(rep?.source)}
            </span>
          </p>
        </div>
      </div>

      {/* Unavailable / conflicting states */}
      {isUnavailable && !partialNote && (
        <p className="mt-4 rounded-[18px] border border-webloom-border bg-webloom-raised px-4 py-3 text-sm text-webloom-muted">
          {statusText || 'Rating unavailable from supplied sources'}
        </p>
      )}
      {isConflicting && (
        <p className="mt-4 rounded-[18px] border border-red-800/50 bg-red-900/30 px-4 py-3 text-sm text-red-400">
          Reputation data could not be verified for this business.
        </p>
      )}

      {/* Partial note: sample count vs total */}
      {partialNote && (
        <p className="mt-4 rounded-[18px] border border-webloom-border bg-webloom-raised px-4 py-3 text-sm text-webloom-muted">
          {partialNote}
        </p>
      )}

      {/* Review summary */}
      {reviewSummary && (
        <div className="mt-4 rounded-[18px] border border-webloom-border bg-webloom-raised px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-webloom-muted">Review summary</p>
          <p className="mt-1 text-sm leading-6 text-webloom-text">{reviewSummary}</p>
        </div>
      )}

      {/* Review samples */}
      {sampleCount > 0 && (
        <div className="mt-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-webloom-muted">Review samples ({sampleCount})</p>
          <ul className="mt-3 space-y-2">
            {reviews.slice(0, 10).map((r, idx) => (
              <li key={idx} className="rounded-[18px] border border-webloom-border bg-webloom-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {r.rating != null && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-900/30 px-2 py-0.5 text-xs font-medium text-amber-300">
                      <Star className="h-3 w-3 fill-[#F59E0B] text-[#F59E0B]" />
                      {r.rating}
                    </span>
                  )}
                  {r.author && <span className="text-xs font-medium text-webloom-text">{r.author}</span>}
                  {r.publishedAt && <span className="text-xs text-webloom-muted">{r.publishedAt}</span>}
                </div>
                {r.text && <p className="mt-2 text-sm leading-6 text-webloom-text">{r.text}</p>}
                {r.provenance === 'ai_generated' && (
                  <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-purple-300">
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