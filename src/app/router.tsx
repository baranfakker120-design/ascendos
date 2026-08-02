import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@app/layouts/AppShell';
import { AuthLayout } from '@app/layouts/AuthLayout';
import { CoachPage } from '@features/coach/CoachPage';
import { ContactDetailPage } from '@features/contacts/ContactDetailPage';
import { ContactFormPage } from '@features/contacts/ContactFormPage';
import { ContactsPage } from '@features/contacts/ContactsPage';
import { KnowledgePage } from '@features/knowledge/KnowledgePage';
import { TodayPage } from '@features/daily-plan/TodayPage';
import { MorePage } from '@features/more/MorePage';
import { JourneyToday } from '@features/onboarding/JourneyToday';
import { useJourneyState } from '@features/onboarding/journeyApi';
import { ProgressPage } from '@features/progress/ProgressPage';
import { ProfileEditPage } from '@features/profile/ProfileEditPage';
import { ProfilePage } from '@features/profile/ProfilePage';
import { LoginPage } from '@features/auth/LoginPage';
import { RegisterPage } from '@features/auth/RegisterPage';
import { useAuth } from '@shared/auth/AuthProvider';

function FullScreenSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-muted">AscendOS wird geladen …</p>
    </div>
  );
}

/**
 * Sprint 5: Der Heute-Tab gehört der Journey, bis sie abgeschlossen
 * ist — danach dem Daily Plan. Die Entscheidung lebt bewusst im
 * App-Layer (Features bleiben isoliert, ADR-012); solange die Journey
 * läuft, wird generate_daily_plan gar nicht erst aufgerufen.
 */
function TodayRoute() {
  const { data: state, isLoading } = useJourneyState();
  if (isLoading) return <FullScreenSpinner />;
  if (state && state.journey && !state.isComplete) return <JourneyToday />;
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
  const { session, profile } = useAuth();
  if (session === undefined) return <FullScreenSpinner />;
  if (session === null) return <Navigate to="/login" replace />;
  // profile lädt asynchron nach der Session nach.
  if (profile === null) return <FullScreenSpinner />;
  if (profile.role !== 'super_admin') return <Navigate to="/mehr" replace />;
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
          { path: '/', element: <TodayRoute /> },
          { path: '/reise', element: <ProgressPage /> },
          { path: '/kontakte', element: <ContactsPage /> },
          { path: '/kontakte/neu', element: <ContactFormPage /> },
          { path: '/kontakte/:contactId', element: <ContactDetailPage /> },
          { path: '/kontakte/:contactId/bearbeiten', element: <ContactFormPage /> },
          { path: '/coach', element: <CoachPage /> },
          { path: '/mehr', element: <MorePage /> },
          { path: '/profil', element: <ProfilePage /> },
          { path: '/profil/bearbeiten', element: <ProfileEditPage /> },
          {
            element: <RequireSuperAdmin />,
            children: [{ path: '/wissen', element: <KnowledgePage /> }],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
