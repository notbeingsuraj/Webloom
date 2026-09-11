/**
 * Street-address detector — shared data-quality guard.
 *
 * A street address is a location datum, not a business identity. Some providers
 * (notably Geoapify when the search drifts to a street-level feature) return a
 * street address string in the `name` field. Such strings must never become (or
 * replace) a canonical business name.
 *
 * Heuristics (conservative, avoids false positives on legal names that merely
 * contain a street word like "High Street Market"):
 *   A) number-led:      "5 Main St", "No. 5 Park Road", "#12 ..."
 *   B) street→number:   "Street No. 5", "Road #4", "Main St 5"
 *   C) number→locality: "5 Nagar", "5-B Colony", "Phase 7"
 *
 * @param {string|null} name
 * @returns {boolean} true if the string looks like a street address
 */
export function looksLikeStreetAddress(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length === 0) return false;

  // A) "5 Main St", "No. 5 Park Road", "#12 something"
  if (/^(no\.?\s*|#\s*)?\d{1,5}[a-z]?\b/i.test(trimmed)) return true;

  // B) street word immediately followed by a number: "Street No. 5", "Road #4", "Main St 5"
  if (/(street|st\.?|road|rd\.?|lane|ln\.?|avenue|ave\.?|boulevard|blvd\.?|drive|dr\.?|highway|hwy\.?|nagar|colony|sector|phase|block|chowk|basti|mohalla|gram|gaon)\s*(no\.?\s*|#\s*)?\d{1,5}[a-z]?\b/i.test(trimmed)) return true;

  // C) number immediately before a locality suffix: "5 Nagar", "5-B Colony"
  if (/\d{1,5}[a-z]?\s+(nagar|colony|sector|phase|block|chowk|basti|mohalla|gram|gaon|village|township|estate)\b/i.test(trimmed)) return true;

  return false;
}

export default looksLikeStreetAddress;