import { Component, type ReactNode } from 'react';
import { Button } from '@shared/ui/Button';

interface State {
  hasError: boolean;
}

/** [F-2] Ein Render-Fehler darf nie eine weiße Seite hinterlassen. */
export class ErrorBoundary extends Component<
  {
    children: ReactNode;
    /** Soft reset without full reload when possible. */ onReset?: () => void;
  },
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Ohne PII loggen (ADR-019); Sentry-Anbindung nutzt diesen Hook später.
    console.error('AscendOS ErrorBoundary:', error instanceof Error ? error.message : 'unknown');
  }

  private reset = () => {
    this.setState({ hasError: false });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-semibold">Da ist etwas schiefgelaufen.</p>
        <p className="text-sm text-muted">
          Deine Daten sind sicher gespeichert. Du kannst es erneut versuchen oder AscendOS neu
          laden.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button fullWidth={false} onClick={this.reset}>
            Erneut versuchen
          </Button>
          <Button fullWidth={false} variant="secondary" onClick={() => window.location.reload()}>
            Neu laden
          </Button>
        </div>
      </div>
    );
  }
}
