/**
 * ThemeToggle — light/dark theme switch.
 *
 * Persists to localStorage; applies `.dark` on <html>. Defaults to the
 * OS preference when unset. The app previously shipped light-only tokens;
 * dark tokens are provided in index.css (`--background` etc under `.dark`).
 */
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const STORAGE_KEY = 'webloom-theme';

function getInitialTheme(): 'light' | 'dark' {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* localStorage unavailable — fall through to OS preference */
  }
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* non-blocking */
    }
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
      aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
      title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-all hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}