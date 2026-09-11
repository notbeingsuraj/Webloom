/**
 * Readable intelligence renderers.
 *
 * Converts analysis objects (customer intent, purchase triggers, visual
 * direction, website objectives) into plain readable data for the UI.
 *
 * IMPORTANT: These helpers NEVER return raw JSON strings. If a value cannot be
 * rendered readably, they return null and the caller shows an explicit state.
 */

export interface IntentItem {
  intent: string;
  urgency?: string | null;
  frequency?: string | null;
}

export interface TriggerItem {
  trigger: string;
  type?: string | null;
  strength?: string | null;
}

export interface ObjectiveItem {
  objective: string;
  priority?: string | null;
  metrics: string[];
}

export interface VisualDirectionData {
  mood?: string | null;
  colorPrimary?: string | null;
  colorSecondary?: string | null;
  colorReasoning?: string | null;
  imageryStyle?: string | null;
  imagerySubjects: string[];
  imageryAvoid: string[];
  typographyStyle?: string | null;
  typographyReasoning?: string | null;
}

const toString = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/**
 * Normalize the AI customer-intent value (array of { intent, urgency,
 * frequency } | string).
 */
export function toIntentItems(raw: unknown): IntentItem[] | null {
  if (Array.isArray(raw)) {
    const items = raw
      .map<IntentItem>((entry) =>
        typeof entry === 'string'
          ? { intent: entry, urgency: null, frequency: null }
          : {
              intent: toString(entry?.intent) ?? '',
              urgency: toString(entry?.urgency),
              frequency: toString(entry?.frequency),
            },
      )
      .filter((entry): entry is IntentItem => !!entry.intent);
    return items.length ? items : null;
  }
  if (typeof raw === 'string' && raw.trim()) return [{ intent: raw.trim() }];
  return null;
}

/**
 * Normalize purchase triggers (array of { trigger, type, strength } | string).
 */
export function toTriggerItems(raw: unknown): TriggerItem[] | null {
  if (Array.isArray(raw)) {
    const items = raw
      .map<TriggerItem>((entry) =>
        typeof entry === 'string'
          ? { trigger: entry, type: null, strength: null }
          : {
              trigger: toString(entry?.trigger) ?? '',
              type: toString(entry?.type),
              strength: toString(entry?.strength),
            },
      )
      .filter((entry): entry is TriggerItem => !!entry.trigger);
    return items.length ? items : null;
  }
  if (typeof raw === 'string' && raw.trim()) return [{ trigger: raw.trim() }];
  return null;
}

/**
 * Normalize website objectives (array of { objective, priority, metrics } | string).
 */
export function toObjectiveItems(raw: unknown): ObjectiveItem[] | null {
  if (Array.isArray(raw)) {
    const items = raw
      .map<ObjectiveItem>((entry) =>
        typeof entry === 'string'
          ? { objective: entry, priority: null, metrics: [] }
          : {
              objective: toString(entry?.objective) ?? '',
              priority: toString(entry?.priority),
              metrics: Array.isArray(entry?.metrics)
                ? entry.metrics.filter((m: unknown): m is string => typeof m === 'string')
                : [],
            },
      )
      .filter((entry): entry is ObjectiveItem => !!entry.objective);
    return items.length ? items : null;
  }
  if (typeof raw === 'string' && raw.trim()) return [{ objective: raw.trim(), metrics: [] }];
  return null;
}

/**
 * Normalize visual direction into a labeled, flat structure for display.
 */
export function toVisualDirectionData(raw: unknown): VisualDirectionData | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    return { mood: raw, imagerySubjects: [], imageryAvoid: [] };
  }
  if (typeof raw !== 'object') return null;

  const vd = raw as {
    mood?: unknown;
    colorPalette?: { primary?: unknown; secondary?: unknown; reasoning?: unknown };
    imagery?: { style?: unknown; subjects?: unknown; avoid?: unknown };
    typography?: { style?: unknown; reasoning?: unknown };
  };

  const subjects = Array.isArray(vd.imagery?.subjects)
    ? vd.imagery.subjects.filter((s): s is string => typeof s === 'string')
    : [];
  const avoid = Array.isArray(vd.imagery?.avoid)
    ? vd.imagery.avoid.filter((s): s is string => typeof s === 'string')
    : [];

  return {
    mood: toString(vd.mood),
    colorPrimary: toString(vd.colorPalette?.primary),
    colorSecondary: toString(vd.colorPalette?.secondary),
    colorReasoning: toString(vd.colorPalette?.reasoning),
    imageryStyle: toString(vd.imagery?.style),
    imagerySubjects: subjects,
    imageryAvoid: avoid,
    typographyStyle: toString(vd.typography?.style),
    typographyReasoning: toString(vd.typography?.reasoning),
  };
}