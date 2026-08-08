import { Link } from 'react-router-dom';
import { useI18n } from '@shared/i18n';

/** Compact legal footer used on auth, app shell, and legal pages. */
export function SiteFooter({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  return (
    <footer
      className={`shrink-0 px-4 py-3 text-center text-xs text-muted ${className}`.trim()}
      role="contentinfo"
    >
      <Link
        to="/datenschutz"
        className="font-medium text-accent-deep underline-offset-2 hover:underline"
      >
        {t('common.privacy')}
      </Link>
    </footer>
  );
}
