import { Outlet } from 'react-router-dom';
import { useI18n } from '@shared/i18n';
import { SiteFooter } from '@shared/ui/SiteFooter';

export function AuthLayout() {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex h-full max-w-md flex-col overflow-y-auto px-6 py-10 [scrollbar-gutter:stable]">
      <div className="my-auto w-full py-[max(1rem,var(--safe-top))] pb-[max(1.5rem,var(--safe-bottom))]">
        {/* Kein Traeger mehr, auf ausdruecklichen Wunsch vom 30. Juli 2026.
         *
         *  Frueherer Stand hatte hier bewusst einen dunklen Traeger
         *  (bg-primary), begruendet mit F4 Teil 2: auf dem hellen
         *  Seitenhintergrund sind 55,4 % der Symbolflaeche unsichtbar. Das
         *  war eine eigene Entscheidung, kein Darstellungsfehler.
         *
         *  Entfernt wie verlangt. Die messbare Folge bleibt bestehen: das
         *  kuehle Silber verliert auf hellem Grund an Kontrast, besonders
         *  in den helleren Bereichen des Verlaufs. Das ist keine
         *  Bearbeitung der Bilddatei, sondern die Physik der Farbe auf
         *  diesem Untergrund. */}
        <div className="mb-8 flex justify-center">
          <img
            src="/brand/ascendos-lockup-v2.png"
            alt={t('brand.lockupAlt')}
            className="h-auto w-full max-w-[280px]"
          />
        </div>
        <Outlet />
        <SiteFooter className="mt-8 px-0" />
      </div>
    </div>
  );
}
