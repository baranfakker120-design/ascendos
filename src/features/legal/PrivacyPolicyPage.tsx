import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@shared/i18n';
import { SiteFooter } from '@shared/ui/SiteFooter';

/**
 * Öffentliche Datenschutzseite (/datenschutz).
 * Inhalt basiert auf der tatsächlichen Code-/Architektur-Analyse von AscendOS.
 */
export function PrivacyPolicyPage() {
  const { t } = useI18n();
  const updated = '8. August 2026';

  return (
    <div className="mx-auto flex h-full max-w-lg flex-col overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] [scrollbar-gutter:stable]">
      <header className="space-y-3 pb-4">
        <Link
          to="/"
          className="inline-flex text-sm font-semibold text-accent-deep underline-offset-2 hover:underline"
        >
          ← {t('common.back')}
        </Link>
        <div className="flex justify-center pt-2">
          <img
            src="/brand/ascendos-lockup-v2.png"
            alt={t('brand.lockupAlt')}
            className="h-auto w-full max-w-[220px]"
          />
        </div>
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-ink">Datenschutzerklärung</h1>
          <p className="text-sm text-muted">AscendOS · Stand: {updated}</p>
        </div>
      </header>

      <article className="space-y-6 pb-6 text-sm leading-relaxed text-ink">
        <Section title="1. Allgemeine Hinweise zur Datenverarbeitung">
          <p>
            AscendOS ist eine webbasierte Business-Plattform (PWA) für Organisation, Coaching,
            Kontakte, Team-/Qualifikationsübersichten und Content-Unterstützung im
            Network-Marketing- bzw. Business-Kontext.
          </p>
          <p className="mt-2">
            Wir verarbeiten personenbezogene Daten nur, soweit dies für Bereitstellung, Sicherheit
            und Funktionen der Anwendung erforderlich ist oder Sie uns Daten aktiv mitteilen (z. B.
            bei Registrierung, Profilpflege, Kontakterfassung oder Nutzung von
            KI-/Integrationsfunktionen).
          </p>
          <p className="mt-2">
            Rechtsgrundlagen sind insbesondere Art. 6 Abs. 1 lit. b DSGVO (Vertrag/Nutzung des
            Dienstes), Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an sicherem Betrieb) und –
            soweit einschlägig – Art. 6 Abs. 1 lit. a DSGVO (Einwilligung, z. B. bei optionalen
            Browser-Benachrichtigungen oder optionaler Instagram-Verbindung).
          </p>
        </Section>

        <Section title="2. Hosting">
          <p>Die Web-Anwendung AscendOS wird technisch wie folgt betrieben:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Frontend-Hosting:</strong> Cloudflare Pages (Auslieferung der Web-App-Dateien)
            </li>
            <li>
              <strong>
                Backend / Datenbank / Authentifizierung / Dateispeicher / Edge Functions:
              </strong>{' '}
              Supabase (Projekt-Region laut aktueller Infrastruktur: EU, u. a. Frankfurt /
              eu-central)
            </li>
          </ul>
          <p className="mt-2">
            Mit den genannten Anbietern besteht eine Auftragsverarbeitung bzw. es gelten deren
            Datenschutzbestimmungen und ggf. Standardvertragsklauseln, soweit Daten außerhalb des
            EWR verarbeitet werden. Einzelheiten ergeben sich aus den Verträgen mit den Hosting- und
            Plattformanbietern.
          </p>
        </Section>

        <Section title="3. Aufruf der Website">
          <p>
            Beim Aufruf von AscendOS werden durch die Hosting- und Plattforminfrastruktur technisch
            notwendige Verbindungsdaten verarbeitet (z. B. IP-Adresse in Server-/Zugangslogs der
            Anbieter, Zeitpunkt, angeforderte Ressource, User-Agent). Dies dient der Auslieferung
            der Seite, der Betriebssicherheit und der Fehleranalyse.
          </p>
          <p className="mt-2">
            In der AscendOS-Anwendung selbst sind derzeit <strong>keine</strong> eigenen Analyse-,
            Marketing- oder Tracking-Dienste (wie Google Analytics, Meta-Pixel, Plausible, PostHog
            o. Ä.) eingebunden.
          </p>
        </Section>

        <Section title="4. Verarbeitung personenbezogener Daten">
          <p>Je nach Nutzung können insbesondere folgende Daten verarbeitet werden:</p>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <strong>Account / Authentifizierung:</strong> E-Mail-Adresse und Passwort (Passwort
              gehasht über Supabase Auth), Einladungscode, Vorname, Nachname, Benutzername
            </li>
            <li>
              <strong>Profil:</strong> Name, Benutzername, optional Telefon, Land, Sprache,
              Profilbild (Avatar), Ziele; Zugehörigkeit zu Organisation/Team
            </li>
            <li>
              <strong>Kontakte (CRM innerhalb der App):</strong> von Ihnen erfasste
              Kontaktinformationen (z. B. Name, Telefon, E-Mail, Notizen, nächste Schritte)
            </li>
            <li>
              <strong>Coach-/Nachrichteninhalte:</strong> von Ihnen eingegebene Chat- und
              Coaching-Texte sowie zugehörige Konversationsmetadaten
            </li>
            <li>
              <strong>Organisations- und Teamdaten:</strong> Mitgliedschaften, Rollen,
              Fortschritts-/Qualifikationsbezogene Angaben, Leadership-Notizen
            </li>
            <li>
              <strong>Content-Assistent:</strong> hochgeladene Medien (Bilder/Videos), erzeugte
              Entwürfe (Hook, Caption, Hashtags etc.), Tagesvorbereitungen; Entwürfe können als „für
              Instagram vorbereitet“ markiert werden (Status in der App, ohne automatisches
              Veröffentlichen)
            </li>
            <li>
              <strong>Live-Coaching / Stories (soweit freigeschaltet):</strong> z. B.
              Veranstaltungsdaten, Zoom-Links, Medien-URLs
            </li>
            <li>
              <strong>Nutzungsereignisse (App-intern):</strong> technische Event-Typen zur
              Funktionssteuerung (z. B. App geöffnet), ohne eingebettete Drittanbieter-Analytics
            </li>
            <li>
              <strong>Technische Sicherheit:</strong> bei Einladungsprüfung können IP-Adressen in
              Validierungsversuchen gespeichert werden
            </li>
          </ul>
        </Section>

        <Section title="5. Speicherung von Daten">
          <p>
            Die genannten Anwendungsdaten werden in der AscendOS-Backend-Infrastruktur (Supabase:
            Datenbank und Storage-Buckets) gespeichert. Speicherdauer richtet sich nach der Dauer
            Ihres Accounts bzw. der jeweiligen Funktionsnotwendigkeit sowie gesetzlichen
            Aufbewahrungspflichten.
          </p>
          <p className="mt-2">
            Profilbilder und Content-Medien werden in Supabase Storage abgelegt (öffentliche
            Avatar-/Coaching-Buckets bzw. privater Content-Bucket mit Zugriff über signierte URLs).
          </p>
          <p className="mt-2">
            Eine vollständige Self-Service-Kontolöschung ist in der App derzeit nicht automatisiert
            umgesetzt; in den Einstellungen wird auf den Support-Kontakt verwiesen.
          </p>
        </Section>

        <Section title="6. LocalStorage, SessionStorage und IndexedDB">
          <p>
            AscendOS setzt <strong>keine</strong> eigenen Tracking-Cookies ein. Es werden jedoch
            lokale Speichertechniken des Browsers verwendet, die für Login, Offline-Fähigkeit und
            Nutzerkomfort erforderlich sind:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>LocalStorage:</strong> u. a. Supabase-Sitzung, Spracheinstellung, aktive
              Organisation, Onboarding-/Coach-/UI-Präferenzen, lokale Merker (z. B. gesehene
              Stories)
            </li>
            <li>
              <strong>SessionStorage:</strong> kurzlebige UI-Merker (z. B. einmalige Anzeige von
              Erfolgsanimationen)
            </li>
            <li>
              <strong>IndexedDB</strong> (über die Bibliothek idb-keyval): Offline-Cache, Sync- und
              Upload-Warteschlangen, Entwurfs- und UI-Zustände, Tagesnotizen
            </li>
          </ul>
          <p className="mt-2">
            Diese Speicherung erfolgt lokal auf Ihrem Endgerät. Sie können die Daten über die
            Browserfunktionen löschen; dadurch kann u. a. die Anmeldung erneut erforderlich werden.
          </p>
        </Section>

        <Section title="7. Externe Dienste und Drittanbieter">
          <p>
            AscendOS nutzt – soweit die jeweilige Funktion verwendet wird – folgende externe
            Dienste:
          </p>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <strong>Supabase</strong> – Authentifizierung, Datenbank, Storage, Edge Functions
            </li>
            <li>
              <strong>Cloudflare Pages</strong> – Hosting/Auslieferung der Web-App
            </li>
            <li>
              <strong>KI-Anbieter über Edge Functions</strong> (nur serverseitig, nicht direkt im
              Browser-Bundle): Groq, OpenRouter, Cerebras sowie Google Gemini (u. a. für Embeddings
              und multimodale Bildanalyse). Dabei können von Ihnen eingegebene Inhalte (z. B.
              Coach-Nachrichten, Asset-Analysen) zur Verarbeitung an diese Anbieter übermittelt
              werden.
            </li>
          </ul>
          <p className="mt-2">
            In der Datenbank ist technisch eine Tabelle für spätere Instagram-Verbindungsmetadaten
            vorgesehen. Eine produktive Instagram-OAuth-Verbindung ist im aktuellen Stand der
            Anwendung nicht freigeschaltet; AscendOS speichert keine Instagram-Passwörter.
          </p>
          <p className="mt-2">
            Zusätzlich kann AscendOS Links zu externen Diensten öffnen, die Sie selbst hinterlegen
            oder auswählen (z. B. Zoom-Meeting-URL, Kalender-Deep-Links zu Google/Outlook). Dabei
            gelten die Datenschutzbestimmungen des jeweiligen Anbieters; AscendOS bettet hierfür
            keine eigenen Tracking-SDKs ein.
          </p>
          <p className="mt-2">
            Es werden <strong>keine</strong> Werbe- oder Analyse-Pixel von Drittanbietern in der
            AscendOS-Oberfläche geladen.
          </p>
        </Section>

        <Section title="8. Server-Logfiles">
          <p>
            Die Hosting- und Backend-Anbieter (Cloudflare Pages, Supabase) können Server- bzw.
            Zugriffsprotokolle führen. Diese können insbesondere IP-Adresse, Zeitstempel,
            angeforderte Ressource und technische Client-Informationen enthalten und dienen dem
            sicheren Betrieb sowie der Missbrauchs-/Fehlererkennung. Art und Dauer der
            Protokollierung richten sich nach den Einstellungen und Policies der jeweiligen
            Anbieter.
          </p>
        </Section>

        <Section title="9. Kontaktaufnahme">
          <p>
            AscendOS enthält kein öffentliches Kontaktformular auf der Website. Für
            datenschutzrechtliche Anfragen erreichen Sie den Verantwortlichen unter{' '}
            <a href="mailto:hacibekircayir@gmail.com">hacibekircayir@gmail.com</a>. Für allgemeine
            Nutzungs- und Supportanfragen stehen die in den Einstellungen hinterlegten
            E-Mail-Adressen <a href="mailto:support@ascendos.app">support@ascendos.app</a> und{' '}
            <a href="mailto:feedback@ascendos.app">feedback@ascendos.app</a> zur Verfügung. Dabei
            werden die von Ihnen übermittelten Angaben (mindestens E-Mail-Adresse und
            Nachrichteninhalt) zur Bearbeitung der Anfrage verarbeitet.
          </p>
        </Section>

        <Section title="10. Rechte der betroffenen Personen">
          <p>
            Sie haben gegenüber dem Verantwortlichen Rechte nach der DSGVO. Die wichtigsten Rechte
            sind nachfolgend beschrieben. Zur Ausübung wenden Sie sich bitte an die im Abschnitt
            „Verantwortlicher“ genannten Kontaktdaten.
          </p>
        </Section>

        <Section title="11. Recht auf Auskunft">
          <p>
            Sie haben das Recht, Auskunft darüber zu verlangen, ob und welche personenbezogenen
            Daten wir zu Ihrer Person verarbeiten (Art. 15 DSGVO).
          </p>
        </Section>

        <Section title="12. Recht auf Berichtigung">
          <p>
            Sie haben das Recht, unverzüglich die Berichtigung unrichtiger oder die
            Vervollständigung unvollständiger personenbezogener Daten zu verlangen (Art. 16 DSGVO).
            Viele Profildaten können Sie zudem selbst in der App anpassen.
          </p>
        </Section>

        <Section title="13. Recht auf Löschung">
          <p>
            Sie haben unter den Voraussetzungen des Art. 17 DSGVO das Recht auf Löschung Ihrer
            personenbezogenen Daten („Recht auf Vergessenwerden“), soweit keine gesetzlichen
            Aufbewahrungspflichten oder andere Ausnahmen entgegenstehen.
          </p>
        </Section>

        <Section title="14. Recht auf Einschränkung der Verarbeitung">
          <p>
            Sie haben das Recht, unter den Voraussetzungen des Art. 18 DSGVO die Einschränkung der
            Verarbeitung Ihrer personenbezogenen Daten zu verlangen.
          </p>
        </Section>

        <Section title="15. Recht auf Datenübertragbarkeit">
          <p>
            Sie haben das Recht, Sie betreffende personenbezogene Daten, die Sie uns bereitgestellt
            haben, in einem strukturierten, gängigen und maschinenlesbaren Format zu erhalten bzw. –
            soweit technisch machbar – an einen anderen Verantwortlichen übermitteln zu lassen (Art.
            20 DSGVO).
          </p>
        </Section>

        <Section title="16. Widerspruchsrecht">
          <p>
            Sie haben das Recht, aus Gründen, die sich aus Ihrer besonderen Situation ergeben,
            jederzeit gegen die Verarbeitung Sie betreffender personenbezogener Daten Widerspruch
            einzulegen, die auf Art. 6 Abs. 1 lit. f DSGVO beruht (Art. 21 DSGVO).
          </p>
        </Section>

        <Section title="17. Widerruf einer Einwilligung">
          <p>
            Sofern die Verarbeitung auf einer Einwilligung beruht, können Sie diese jederzeit mit
            Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3 DSGVO). Die Rechtmäßigkeit der bis zum
            Widerruf erfolgten Verarbeitung bleibt unberührt. Beispiel: Zurücknehmen von
            Browser-Benachrichtigungsrechten in den Geräteeinstellungen bzw. in AscendOS.
          </p>
        </Section>

        <Section title="18. Beschwerderecht bei einer Datenschutzaufsichtsbehörde">
          <p>
            Sie haben das Recht, sich bei einer Datenschutzaufsichtsbehörde über die Verarbeitung
            Ihrer personenbezogenen Daten zu beschweren (Art. 77 DSGVO). Zuständig ist in der Regel
            die Aufsichtsbehörde Ihres gewöhnlichen Aufenthaltsorts, Ihres Arbeitsplatzes oder des
            Orts des mutmaßlichen Verstoßes.
          </p>
          <p className="mt-2">
            <strong className="text-ink">TODO:</strong> Falls gewünscht, hier die konkret zuständige
            Aufsichtsbehörde des Verantwortlichen (Sitzland) ergänzen.
          </p>
        </Section>

        <Section title="19. Datensicherheit">
          <p>
            Wir setzen technische und organisatorische Maßnahmen ein, um personenbezogene Daten
            gegen Verlust, Manipulation und unbefugten Zugriff zu schützen. Dazu zählen insbesondere
            Transportverschlüsselung (HTTPS), rollenbasierte Zugriffskontrollen und
            Row-Level-Security in der Datenbank. Dennoch kann keine absolute Sicherheit garantiert
            werden.
          </p>
        </Section>

        <Section title="20. Änderungen dieser Datenschutzerklärung">
          <p>
            Wir behalten uns vor, diese Datenschutzerklärung anzupassen, wenn sich die Rechtslage,
            unsere Dienste oder die Datenverarbeitung ändern. Die aktuelle Fassung ist unter der URL{' '}
            <strong>/datenschutz</strong> innerhalb der AscendOS-Web-App abrufbar. Es gilt jeweils
            die zum Zeitpunkt Ihres Besuchs veröffentlichte Version.
          </p>
        </Section>

        <p className="text-xs text-muted">
          Hinweis: Diese Erklärung beschreibt die aus dem aktuellen Stand der AscendOS-Software
          ableitbare Datenverarbeitung. Sie ersetzt keine individuelle Rechtsberatung.
        </p>

        <section
          id="verantwortlicher"
          aria-labelledby="verantwortlicher-heading"
          className="mt-2 space-y-3 border-t border-line pt-8"
        >
          <h2
            id="verantwortlicher-heading"
            className="text-base font-semibold tracking-tight text-ink"
          >
            Verantwortlicher
          </h2>
          <div className="text-muted [&_a]:font-medium [&_a]:text-accent-deep [&_a]:underline-offset-2 hover:[&_a]:underline">
            <p>
              Verantwortlich für die Datenverarbeitung im Sinne der Datenschutz-Grundverordnung
              (DSGVO) ist:
            </p>
            <address className="mt-4 not-italic">
              <div className="space-y-1 rounded-xl border border-line bg-surface px-4 py-4 leading-relaxed">
                <p className="text-base font-semibold text-ink">Hacibekir Cayir</p>
                <p>Chemnitzer Strasse 7</p>
                <p>35260 Stadtallendorf</p>
                <p>Deutschland</p>
                <p className="pt-3">
                  E-Mail: <a href="mailto:hacibekircayir@gmail.com">hacibekircayir@gmail.com</a>
                </p>
              </div>
            </address>
            <p className="mt-4">
              Datenschutzrechtliche Anfragen richten Sie bitte an die oben genannte E-Mail-Adresse
              des Verantwortlichen. Für allgemeine Nutzungs- und Supportanfragen zur App stehen
              zusätzlich die in AscendOS hinterlegten Adressen{' '}
              <a href="mailto:support@ascendos.app">support@ascendos.app</a> und{' '}
              <a href="mailto:feedback@ascendos.app">feedback@ascendos.app</a> zur Verfügung.
            </p>
          </div>
        </section>
      </article>

      <SiteFooter />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-b border-line pb-6 last:border-b-0">
      <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
      <div className="text-muted [&_a]:font-medium [&_a]:text-accent-deep [&_a]:underline-offset-2 hover:[&_a]:underline [&_strong]:text-ink">
        {children}
      </div>
    </section>
  );
}
