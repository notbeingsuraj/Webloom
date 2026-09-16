/**
 * ErrorBoundary — class component catching render errors on major page
 * surfaces (especially LeadDetail, which historically crashed and unmounted
 * the entire tree — see .planning/debug/webloom-lead-detail-empty-page.md).
 *
 * Presents a human-readable recovery card with a Retry action; never a blank
 * screen. On reset, the boundary re-renders its children.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Optional label for the surface (e.g. "Lead workspace"). */
  label?: string;
}

interface State {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Something went wrong while rendering this view.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] caught render error', { error, componentStack: info.componentStack });
  }

  private reset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="wl-card mx-auto max-w-xl p-10 text-center" role="alert">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h2 className="mt-5 font-display text-xl font-bold text-foreground">
          {this.props.label ?? 'This view'} hit an unexpected error
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {this.state.message || 'The data could not be rendered. Your lead data is safe — this is a display issue.'}
        </p>
        <button
          type="button"
          onClick={this.reset}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <RotateCcw className="h-4 w-4" />
          Try again
        </button>
        <p className="mt-4 text-xs text-muted-foreground">
          If this keeps happening, contact <a href="mailto:hello@webloom.app" className="text-primary underline underline-offset-2">hello@webloom.app</a>.
        </p>
      </div>
    );
  }
}