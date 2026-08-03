import { Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router-dom';
import { AppShell } from '@app/layouts/AppShell';
import { AuthLayout } from '@app/layouts/AuthLayout';
import { RouteErrorBoundary } from '@app/RouteErrorBoundary';
import { CoachPage } from '@features/coach/CoachPage';
import { ContactDetailPage } from '@features/contacts/ContactDetailPage';
import { ContactFormPage } from '@features/contacts/ContactFormPage';
import { ContactsPage } from '@features/contacts/ContactsPage';
import { KnowledgePage } from '@features/knowledge/KnowledgePage';
import { KnowledgeCenterPage } from '@features/knowledge-center/KnowledgeCenterPage';
import { LiveCoachingAdminPage } from '@features/live-coaching/LiveCoachingAdminPage';
import { TodayLiveCoachingSlot } from '@features/live-coaching/TodayLiveCoachingSlot';
import { StoriesAdminPage } from '@features/stories/StoriesAdminPage';
import { TodayStoriesSlot } from '@features/stories/TodayStoriesSlot';
import { TodayPage } from '@features/daily-plan/TodayPage';
import { MorePage } from '@features/more/MorePage';
import { JourneyToday } from '@features/onboarding/JourneyToday';
import { useJourneyState } from '@features/onboarding/journeyApi';
import { ProgressPage } from '@features/progress/ProgressPage';
import { ProfileEditPage } from '@features/profile/ProfileEditPage';
import { ProfilePage } from '@features/profile/ProfilePage';
import { SettingsPage } from '@features/settings/SettingsPage';
import { TeamPage } from '@features/genealogy/TeamPage';
import { QualificationsPage } from '@features/leadership/QualificationsPage';
import { TeamSeydaPage } from '@features/team-seyda/TeamSeydaPage';
import { LoginPage } from '@features/auth/LoginPage';
import { RegisterPage } from '@features/auth/RegisterPage';
import { useAuth } from '@shared/auth/AuthProvider';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';

function FullScreenSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-muted">AscendOS wird geladen …</p>
    </div>
  );
}

function ShellOutlet() {
  const { pathname } = useLocation();
  return (
    <RouteErrorBoundary resetKey={pathname}>
      <Outlet />
    </RouteErrorBoundary>
  );
}

/**
 * Sprint 5: Der Heute-Tab gehört der Journey, bis sie abgeschlossen
 * ist — danach dem Daily Plan. Die Entscheidung lebt bewusst im
 * App-Layer (Features bleiben isoliert, ADR-012); solange die Journey
 * läuft, wird generate_daily_plan gar nicht erst aufgerufen.
 *
 * Sprint 5.1: Live Coaching sits above both surfaces (additive).
 * Sprint 5.2: Ascend Stories at the very top (additive).
 */
function TodayRoute() {
  const { data: state, isPending, isError, refetch } = useJourneyState();
  if (isPending) return <FullScreenSpinner />;
  if (isError) {
    return (
      <Card className="mt-4 space-y-3 text-center">
        <p className="font-medium">Dein Heute-Tab konnte nicht geladen werden.</p>
        <p className="text-sm text-muted">Prüfe deine Verbindung und versuche es erneut.</p>
        <Button fullWidth={false} variant="secondary" onClick={() => void refetch()}>
          Erneut versuchen
        </Button>
      </Card>
    );
  }
  const isJourney = !!(state && state.journey && !state.isComplete);
  if (isJourney) {
    return (
      <div className="space-y-4">
        <TodayStoriesSlot />
        <TodayLiveCoachingSlot />
        <JourneyToday />
      </div>
    );
  }
  return <TodayPage />;
}

/** Nur mit Session erreichbar; sonst -> Login. */
function RequireAuth() {
  const { session } = useAuth();
  if (session === undefined) return <FullScreenSpinner />;
  if (session === null) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/**
 * Nur für Super-Admins. Zweite Verteidigungslinie, nicht die erste: die
 * eigentliche Absicherung sind die RLS-Policy `knowledge_docs_admin_write`
 * und der Rollencheck in `ingest-knowledge`. Diese Weiche verhindert nur,
 * dass Berater auf eine Seite geraten, auf der jede Aktion scheitert.
 */
function RequireSuperAdmin() {
  const { session, isSuperAdmin } = useAuth();
  if (session === undefined) return <FullScreenSpinner />;
  if (session === null) return <Navigate to="/login" replace />;
  // Rolle kommt ausschließlich aus der aktiven Mitgliedschaft.
  if (!isSuperAdmin) return <Navigate to="/more" replace />;
  return <Outlet />;
}

/** Sprint 5.1 — SuperAdmin oder Developer (Knowledge Center / Live Coaching). */
function RequireCoachContentManager() {
  const { session, canManageCoachContent } = useAuth();
  if (session === undefined) return <FullScreenSpinner />;
  if (session === null) return <Navigate to="/login" replace />;
  if (!canManageCoachContent) return <Navigate to="/more" replace />;
  return <Outlet />;
}

/** Nur ohne Session erreichbar; eingeloggte Nutzer -> App. */
function RequireGuest() {
  const { session } = useAuth();
  if (session === undefined) return <FullScreenSpinner />;
  if (session) return <Navigate to="/" replace />;
  return <Outlet />;
}

export const router = createBrowserRouter([
  {
    element: <RequireGuest />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/registrieren', element: <RegisterPage /> },
        ],
      },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            element: <ShellOutlet />,
            children: [
              { path: '/', element: <TodayRoute /> },
              { path: '/reise', element: <ProgressPage /> },
              { path: '/kontakte', element: <ContactsPage /> },
              { path: '/kontakte/neu', element: <ContactFormPage /> },
              { path: '/kontakte/:contactId', element: <ContactDetailPage /> },
              { path: '/kontakte/:contactId/bearbeiten', element: <ContactFormPage /> },
              { path: '/coach', element: <CoachPage /> },
              { path: '/team', element: <TeamPage /> },
              { path: '/qualifikationen', element: <QualificationsPage /> },
              { path: '/team-seyda', element: <TeamSeydaPage /> },
              { path: '/more', element: <MorePage /> },
              { path: '/mehr', element: <Navigate to="/more" replace /> },
              { path: '/settings', element: <SettingsPage /> },
              { path: '/profil', element: <ProfilePage /> },
              { path: '/profil/bearbeiten', element: <ProfileEditPage /> },
              {
                element: <RequireSuperAdmin />,
                children: [{ path: '/wissen', element: <KnowledgePage /> }],
              },
              {
                element: <RequireCoachContentManager />,
                children: [
                  { path: '/knowledge-center', element: <KnowledgeCenterPage /> },
                  { path: '/live-coaching', element: <LiveCoachingAdminPage /> },
                  { path: '/stories', element: <StoriesAdminPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
