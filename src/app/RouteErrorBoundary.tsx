import { Component, type ReactNode } from 'react';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';

interface Props {
  children: ReactNode;
  /** Resets when this value changes (typically the route pathname). */
  resetKey: string;
}

interface State {
  hasError: boolean;
}

/**
 * Route-level boundary: a single page crash must not white-out the shell/nav.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error: unknown) {
    console.error(
      'AscendOS RouteErrorBoundary:',
      error instanceof Error ? error.message : 'unknown',
    );
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <Card className="mt-4 space-y-3 text-center">
        <p className="font-semibold">Dieser Bereich ist kurz gestolpert.</p>
        <p className="text-sm text-muted">
          Die Navigation bleibt verfügbar — du kannst es hier erneut versuchen.
        </p>
        <Button fullWidth={false} onClick={() => this.setState({ hasError: false })}>
          Erneut versuchen
        </Button>
      </Card>
    );
  }
}
