import { Component, type ReactNode } from 'react';
import { createTranslator } from '@shared/i18n';
import { readStoredLocale } from '@shared/lib/locale';
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
    const t = createTranslator(readStoredLocale());
    return (
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-semibold">{t('errors.boundaryTitle')}</p>
        <p className="text-sm text-muted">{t('errors.boundaryBody')}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button fullWidth={false} onClick={this.reset}>
            {t('common.retry')}
          </Button>
          <Button fullWidth={false} variant="secondary" onClick={() => window.location.reload()}>
            {t('common.reload')}
          </Button>
        </div>
      </div>
    );
  }
}
