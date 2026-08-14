import { Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router-dom';
import { AppShell } from '@app/layouts/AppShell';
import { AuthLayout } from '@app/layouts/AuthLayout';
import { RouteErrorBoundary } from '@app/RouteErrorBoundary';
import { CoachPage } from '@features/coach/CoachPage';
import { PersonCoachConversationPage } from '@features/coach/person';
import { ContactDetailPage } from '@features/contacts/ContactDetailPage';
import { ContactFormPage } from '@features/contacts/ContactFormPage';
import { ContactsPage } from '@features/contacts/ContactsPage';
import { KnowledgePage } from '@features/knowledge/KnowledgePage';
import { KnowledgeCenterPage } from '@features/knowledge-center/KnowledgeCenterPage';
import { LiveCoachingAdminPage } from '@features/live-coaching/LiveCoachingAdminPage';
import { TodayLiveCoachingSlot } from '@features/live-coaching/TodayLiveCoachingSlot';
import { StoriesAdminPage } from '@features/stories/StoriesAdminPage';
import { TodayStoriesSlot } from '@features/stories/TodayStoriesSlot';
import { AiContentAssistantPage } from '@features/content-assistant/AiContentAssistantPage';
import { TodayPage } from '@features/daily-plan/TodayPage';
import { MorePage } from '@features/more/MorePage';
import { JourneyToday } from '@features/onboarding/JourneyToday';
import { useJourneyState } from '@features/onboarding/journeyApi';
import { ProgressPage } from '@features/progress/ProgressPage';
import { InstallGuidePage } from '@features/first-launch';
import { TodayCeoBriefingSlot, TodayCoachOsSlot } from '@features/coach/executive';
import { ProfileEditPage } from '@features/profile/ProfileEditPage';
import { ProfilePage } from '@features/profile/ProfilePage';
import { SettingsPage } from '@features/settings/SettingsPage';
import { TeamPage } from '@features/genealogy/TeamPage';
import { QualificationsPage } from '@features/leadership/QualificationsPage';
import { OrganizationGuidePage } from '@features/team-seyda/TeamSeydaPage';
import {
  OrgAdminLayout,
  OrgAdminDashboardPage,
  OrgAdminOrganizationPage,
  OrgAdminBrandingPage,
  OrgAdminMembersPage,
  OrgAdminToolsPage,
  OrgAdminCoachPage,
  OrgAdminKnowledgeHubPage,
  OrgAdminContentHubPage,
  OrgAdminLiveHubPage,
  OrgAdminStoriesHubPage,
  PlatformAdminDeniedPage,
  OrgAdminForbiddenPage,
} from '@features/org-admin';
import { LoginPage } from '@features/auth/LoginPage';
import { RegisterPage } from '@features/auth/RegisterPage';
import { PrivacyPolicyPage } from '@features/legal/PrivacyPolicyPage';
import { useAuth } from '@shared/auth/AuthProvider';
import { useI18n } from '@shared/i18n';
import { SyncStatusIndicator } from '@shared/offline';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import '@features/coach/executive/executive.css';

function FullScreenSpinner() {
  const { t } = useI18n();
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-muted">{t('common.loading')}</p>
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
  const { t } = useI18n();
  const { data: state, isPending, isError, refetch } = useJourneyState();
  if (isPending) return <FullScreenSpinner />;
  if (isError) {
    return (
      <Card className="mt-4 space-y-3 text-center">
        <p className="font-medium">{t('today.loadErrorTitle')}</p>
        <p className="text-sm text-muted">{t('today.loadErrorBody')}</p>
        <Button fullWidth={false} variant="secondary" onClick={() => void refetch()}>
          {t('common.retry')}
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
        <div className="exec-home-sync">
          <SyncStatusIndicator variant="home" />
        </div>
        <section className="exec-mission" aria-label={t('today.missionTitle')}>
          <p className="exec-mission__label">{t('today.missionTitle')}</p>
          <JourneyToday />
        </section>
        <TodayCeoBriefingSlot />
        <TodayCoachOsSlot />
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

/** Phase 9 — ORGANIZATION_ADMIN for active org (UX gate; RLS/RPC enforce). */
function RequireOrganizationAdmin() {
  const { session, isOrganizationAdmin } = useAuth();
  if (session === undefined) return <FullScreenSpinner />;
  if (session === null) return <Navigate to="/login" replace />;
  if (!isOrganizationAdmin) return <OrgAdminForbiddenPage />;
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
  /** Öffentlich erreichbar (auch ohne Login; SPA-Direktaufruf via _redirects). */
  { path: '/datenschutz', element: <PrivacyPolicyPage /> },
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
              { path: '/heute/content', element: <AiContentAssistantPage /> },
              { path: '/reise', element: <ProgressPage /> },
              { path: '/kontakte', element: <ContactsPage /> },
              { path: '/kontakte/neu', element: <ContactFormPage /> },
              { path: '/kontakte/:contactId', element: <ContactDetailPage /> },
              { path: '/kontakte/:contactId/bearbeiten', element: <ContactFormPage /> },
              { path: '/coach', element: <CoachPage /> },
              { path: '/coach/person/:membershipId', element: <PersonCoachConversationPage /> },
              { path: '/team', element: <TeamPage /> },
              { path: '/qualifikationen', element: <QualificationsPage /> },
              { path: '/guide', element: <OrganizationGuidePage /> },
              { path: '/team-seyda', element: <Navigate to="/guide" replace /> },
              { path: '/more', element: <MorePage /> },
              { path: '/mehr', element: <Navigate to="/more" replace /> },
              { path: '/settings', element: <SettingsPage /> },
              { path: '/profil', element: <ProfilePage /> },
              { path: '/profil/bearbeiten', element: <ProfileEditPage /> },
              { path: '/hilfe/installation', element: <InstallGuidePage /> },
              {
                path: '/platform-admin',
                element: <PlatformAdminDeniedPage />,
              },
              {
                element: <RequireOrganizationAdmin />,
                children: [
                  {
                    path: '/admin',
                    element: <OrgAdminLayout />,
                    children: [
                      { index: true, element: <OrgAdminDashboardPage /> },
                      { path: 'organization', element: <OrgAdminOrganizationPage /> },
                      { path: 'members', element: <OrgAdminMembersPage /> },
                      { path: 'branding', element: <OrgAdminBrandingPage /> },
                      { path: 'tools', element: <OrgAdminToolsPage /> },
                      { path: 'coach', element: <OrgAdminCoachPage /> },
                      { path: 'knowledge', element: <OrgAdminKnowledgeHubPage /> },
                      { path: 'content', element: <OrgAdminContentHubPage /> },
                      { path: 'live-coaching', element: <OrgAdminLiveHubPage /> },
                      { path: 'stories', element: <OrgAdminStoriesHubPage /> },
                    ],
                  },
                ],
              },
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
