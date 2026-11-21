// cls - className helper that safely handles Tailwind fraction utilities
// Avoids esbuild regex parsing issues with '/' in className strings

export function cls(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function clsx(...classes: (string | undefined | null | false | Record<string, boolean>)[]): string {
  const result: string[] = [];
  for (const cls of classes) {
    if (!cls) continue;
    if (typeof cls === 'string') {
      result.push(cls);
    } else if (typeof cls === 'object') {
      for (const [key, value] of Object.entries(cls)) {
        if (value) result.push(key);
      }
    }
  }
  return result.join(' ');
}

/**
 * Creates a Tailwind fraction utility class (e.g., 'w-1/2', 'bg-primary/50')
 * without triggering esbuild's regex parser bug.
 * Uses String.fromCharCode to avoid esbuild's regex parser.
 */
export function frac(numerator: string, denominator: string): string {
  return numerator + String.fromCharCode(0x2F) + denominator;
}

export default cls;