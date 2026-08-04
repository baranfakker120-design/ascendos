import type { QueryClient } from '@tanstack/react-query';
import type { ContactWithPhase } from '@features/contacts/contactsApi';
import { CONTACTS_PAGE_SIZE } from '@features/contacts/contactsApi';
import { localDate, type DailyPlanData } from '@features/daily-plan/dailyPlanApi';
import type { GenealogyNode } from '@features/genealogy/types';
import type {
  LeaderboardEntry,
  LeaderDashboard,
  QualificationProgress,
  SmartWarning,
  TeamInsight,
  TeamLeaderProgress,
} from '@features/leadership/types';
import type { LiveCoachingEvent } from '@features/live-coaching/types';
import type { JourneyState } from '@features/onboarding/journeyApi';
import type { ProfileDetail } from '@features/profile/profileApi';
import { utcMonthStart } from '@features/profile/monthlyAwardsLogic';
import type { StoryCard } from '@features/stories/types';
import type { CoachMessage } from '@features/coach/coachApi';
import type { WorkspaceSnapshot } from '@features/coach/workspace/types';
import {
  CEO_CONVO_ID,
  CONTACT_IDS,
  MEMBERSHIP_ID,
  ORG_ID,
  PARTNER_IDS,
  PLAN_ID,
  TEAM_ID,
  USER_ID,
} from './ids';
import { presentationMembership, presentationProfile } from './presentationAuth';

function hoursFromNow(h: number): string {
  return new Date(Date.now() + h * 3600_000).toISOString();
}

function daysAgo(d: number): string {
  return new Date(Date.now() - d * 86400_000).toISOString();
}

function node(partial: GenealogyNode): GenealogyNode {
  return partial;
}

export function buildCoachWorkspace(): WorkspaceSnapshot {
  const now = new Date().toISOString();
  return {
    version: 1,
    activeId: CEO_CONVO_ID,
    mobilePane: 'chat',
    updatedAt: Date.now(),
    conversations: [
      {
        id: CEO_CONVO_ID,
        serverConversationId: CEO_CONVO_ID,
        title: 'Ascent · CEO Briefing',
        kind: 'ceo',
        topic: 'Heute priorisieren',
        contactId: null,
        partnerName: null,
        membershipId: null,
        seedPrompt: null,
        contextBrief: null,
        contextAttached: true,
        preview: 'Dein Fokus heute: Julia zum Fit Check führen.',
        createdAt: daysAgo(3),
        updatedAt: now,
        lastOpenedAt: now,
        archivedAt: null,
      },
      {
        id: 'a6000000-0000-4000-8000-0000000000e2',
        serverConversationId: null,
        title: 'Lena · Next Step',
        kind: 'person',
        topic: 'Follow-up',
        contactId: null,
        partnerName: 'Lena Weiss',
        membershipId: PARTNER_IDS.lena.membership,
        seedPrompt: null,
        contextBrief: null,
        contextAttached: false,
        preview: 'Wie öffne ich das Gespräch ohne Druck?',
        createdAt: daysAgo(1),
        updatedAt: daysAgo(0.2),
        lastOpenedAt: daysAgo(0.2),
        archivedAt: null,
      },
      {
        id: 'a6000000-0000-4000-8000-0000000000e3',
        serverConversationId: null,
        title: 'Recruiting Coach',
        kind: 'recruiting',
        topic: 'Interessenten',
        contactId: CONTACT_IDS.julia,
        partnerName: null,
        membershipId: null,
        seedPrompt: null,
        contextBrief: null,
        contextAttached: false,
        preview: 'Präsentation → Fit Check → 3-Way.',
        createdAt: daysAgo(5),
        updatedAt: daysAgo(2),
        lastOpenedAt: daysAgo(2),
        archivedAt: null,
      },
    ],
  };
}

export function seedPresentationData(qc: QueryClient): void {
  const date = localDate();
  const now = new Date().toISOString();

  const journey: JourneyState = {
    journey: null,
    steps: [],
    completedStepIds: new Set(),
    currentDay: 1,
    totalDays: 0,
    isComplete: true,
  };
  qc.setQueryData(['journey-state', USER_ID], journey);

  const plan: DailyPlanData = {
    plan: {
      id: PLAN_ID,
      org_id: ORG_ID,
      user_id: USER_ID,
      plan_date: date,
      committed_at: hoursFromNow(-2),
      created_at: hoursFromNow(-8),
    },
    items: [
      {
        id: 'a5100000-0000-4000-8000-000000000001',
        plan_id: PLAN_ID,
        contact_id: CONTACT_IDS.julia,
        mission_type: 'fit_check_next_step',
        title: 'Julia · Fit Check abschließen',
        reason: 'Präsentation gesehen — jetzt Klarheit schaffen.',
        score: 96,
        position: 0,
        status: 'pending',
        status_reason: null,
        resolved_at: null,
        created_at: now,
      },
      {
        id: 'a5100000-0000-4000-8000-000000000002',
        plan_id: PLAN_ID,
        contact_id: CONTACT_IDS.tom,
        mission_type: 'follow_up_overdue',
        title: 'Tom · Follow-up nachholen',
        reason: '7 Tage ohne Kontakt — Wärme halten.',
        score: 88,
        position: 1,
        status: 'pending',
        status_reason: null,
        resolved_at: null,
        created_at: now,
      },
      {
        id: 'a5100000-0000-4000-8000-000000000003',
        plan_id: PLAN_ID,
        contact_id: CONTACT_IDS.mira,
        mission_type: 'presentation_pending',
        title: 'Mira · Präsentation senden',
        reason: 'Gespräch war stark — Momentum nutzen.',
        score: 81,
        position: 2,
        status: 'pending',
        status_reason: null,
        resolved_at: null,
        created_at: now,
      },
    ],
  };
  qc.setQueryData(['daily-plan', USER_ID, date], plan);

  const contacts: ContactWithPhase[] = [
    {
      id: CONTACT_IDS.julia,
      org_id: ORG_ID,
      owner_id: USER_ID,
      name: 'Julia Hartmann',
      email: 'julia@example.com',
      phone: '+49 151 1111111',
      notes: null,
      next_step: 'Fit Check Termin bestätigen',
      next_step_due: hoursFromNow(6).slice(0, 10),
      created_at: daysAgo(12),
      updated_at: daysAgo(0.5),
      phase: 'fit_check',
      last_event_at: daysAgo(1),
    },
    {
      id: CONTACT_IDS.tom,
      org_id: ORG_ID,
      owner_id: USER_ID,
      name: 'Tom Keller',
      email: null,
      phone: '+49 151 2222222',
      notes: null,
      next_step: 'Kurzer Check-in',
      next_step_due: daysAgo(2).slice(0, 10),
      created_at: daysAgo(40),
      updated_at: daysAgo(8),
      phase: 'im_gespraech',
      last_event_at: daysAgo(8),
    },
    {
      id: CONTACT_IDS.mira,
      org_id: ORG_ID,
      owner_id: USER_ID,
      name: 'Mira Novak',
      email: 'mira@example.com',
      phone: null,
      notes: null,
      next_step: 'Firmenpräsentation teilen',
      next_step_due: hoursFromNow(24).slice(0, 10),
      created_at: daysAgo(4),
      updated_at: daysAgo(0.2),
      phase: 'praesentation_offen',
      last_event_at: daysAgo(0.3),
    },
    {
      id: CONTACT_IDS.kenan,
      org_id: ORG_ID,
      owner_id: USER_ID,
      name: 'Kenan Yilmaz',
      email: null,
      phone: '+49 151 3333333',
      notes: null,
      next_step: null,
      next_step_due: null,
      created_at: daysAgo(60),
      updated_at: daysAgo(20),
      phase: 'kunde',
      last_event_at: daysAgo(18),
    },
    {
      id: CONTACT_IDS.sofia,
      org_id: ORG_ID,
      owner_id: USER_ID,
      name: 'Sofia Berg',
      email: null,
      phone: null,
      notes: null,
      next_step: 'Willkommensnachricht',
      next_step_due: hoursFromNow(4).slice(0, 10),
      created_at: daysAgo(1),
      updated_at: daysAgo(0.1),
      phase: 'lead',
      last_event_at: daysAgo(1),
    },
  ];
  qc.setQueryData(['contacts', USER_ID, '', CONTACTS_PAGE_SIZE], {
    items: contacts,
    hasMore: false,
  });
  qc.setQueryData(['contacts', USER_ID, '', 50], { items: contacts, hasMore: false });

  const tree: GenealogyNode[] = [
    node({
      membershipId: MEMBERSHIP_ID,
      identityId: USER_ID,
      sponsorMembershipId: null,
      depth: 0,
      firstName: 'Baran',
      lastName: 'Fakker',
      username: 'baran',
      avatarUrl: null,
      phone: null,
      role: 'super_admin',
      apTotal: 18450,
      rankKey: 'mentor',
      rankLabel: 'Mentor',
      frameAsset: 'frame-05',
      directCount: 4,
      teamCount: 12,
      lastAppOpenedAt: now,
      isBeraterDesMonats: true,
      joinedAt: '2024-03-12T10:00:00Z',
      icpMonth: 3,
      streakDays: 12,
      isFavorite: false,
      sponsorName: null,
      messageBadge: 0,
    }),
    node({
      membershipId: PARTNER_IDS.seyda.membership,
      identityId: PARTNER_IDS.seyda.user,
      sponsorMembershipId: MEMBERSHIP_ID,
      depth: 1,
      firstName: 'Seyda',
      lastName: 'Yilmaz',
      username: 'seyda',
      avatarUrl: null,
      phone: null,
      role: 'leader',
      apTotal: 14200,
      rankKey: 'team_leader',
      rankLabel: 'Team Leader',
      frameAsset: 'frame-06',
      directCount: 3,
      teamCount: 7,
      lastAppOpenedAt: hoursFromNow(-3),
      isBeraterDesMonats: false,
      joinedAt: '2024-05-01T10:00:00Z',
      icpMonth: 2,
      streakDays: 8,
      isFavorite: true,
      sponsorName: 'Baran Fakker',
      messageBadge: 2,
    }),
    node({
      membershipId: PARTNER_IDS.lena.membership,
      identityId: PARTNER_IDS.lena.user,
      sponsorMembershipId: MEMBERSHIP_ID,
      depth: 1,
      firstName: 'Lena',
      lastName: 'Weiss',
      username: 'lena',
      avatarUrl: null,
      phone: null,
      role: 'berater',
      apTotal: 6200,
      rankKey: 'builder',
      rankLabel: 'Builder',
      frameAsset: 'frame-03',
      directCount: 2,
      teamCount: 2,
      lastAppOpenedAt: hoursFromNow(-20),
      isBeraterDesMonats: false,
      joinedAt: '2025-01-18T10:00:00Z',
      icpMonth: 1,
      streakDays: 4,
      isFavorite: false,
      sponsorName: 'Baran Fakker',
      messageBadge: 0,
    }),
    node({
      membershipId: PARTNER_IDS.marco.membership,
      identityId: PARTNER_IDS.marco.user,
      sponsorMembershipId: PARTNER_IDS.seyda.membership,
      depth: 2,
      firstName: 'Marco',
      lastName: 'Stein',
      username: 'marco',
      avatarUrl: null,
      phone: null,
      role: 'berater',
      apTotal: 3100,
      rankKey: 'rising',
      rankLabel: 'Rising',
      frameAsset: 'frame-02',
      directCount: 1,
      teamCount: 1,
      lastAppOpenedAt: daysAgo(2),
      isBeraterDesMonats: false,
      joinedAt: '2025-06-02T10:00:00Z',
      icpMonth: 0,
      streakDays: 2,
      isFavorite: false,
      sponsorName: 'Seyda Yilmaz',
      messageBadge: 1,
    }),
    node({
      membershipId: PARTNER_IDS.nora.membership,
      identityId: PARTNER_IDS.nora.user,
      sponsorMembershipId: MEMBERSHIP_ID,
      depth: 1,
      firstName: 'Nora',
      lastName: 'Klein',
      username: 'nora',
      avatarUrl: null,
      phone: null,
      role: 'berater',
      apTotal: 980,
      rankKey: 'newcomer',
      rankLabel: 'Newcomer',
      frameAsset: 'frame-01',
      directCount: 0,
      teamCount: 0,
      lastAppOpenedAt: daysAgo(9),
      isBeraterDesMonats: false,
      joinedAt: '2026-04-10T10:00:00Z',
      icpMonth: 0,
      streakDays: 0,
      isFavorite: false,
      sponsorName: 'Baran Fakker',
      messageBadge: 0,
    }),
  ];
  qc.setQueryData(['genealogy-tree', MEMBERSHIP_ID, USER_ID], tree);

  const dash: LeaderDashboard = {
    activeToday: 7,
    newRegistrationsMonth: 3,
    newCustomersMonth: 5,
    openFollowups: 4,
    teamAp: 42800,
    teamSize: 12,
    directCount: 4,
    inactive14d: 1,
    tasksDoneToday: 9,
    icpMonth: 3,
    monthGoalAp: 2500,
    goalProgress: 0.74,
    myApTotal: 18450,
    tasksDoneByTeamToday: [
      { membershipId: PARTNER_IDS.seyda.membership, name: 'Seyda', ap: 120, tasks: 3 },
      { membershipId: PARTNER_IDS.lena.membership, name: 'Lena', ap: 80, tasks: 2 },
    ],
  };
  qc.setQueryData(['leader-dashboard', MEMBERSHIP_ID], dash);

  const insights: TeamInsight[] = [
    {
      kind: 'momentum',
      emoji: '',
      title: 'Starkes Momentum',
      membershipId: PARTNER_IDS.seyda.membership,
      name: 'Seyda Yilmaz',
      detail: '3 aktive Firstlines diese Woche',
    },
  ];
  qc.setQueryData(['team-insights', MEMBERSHIP_ID], insights);

  const warnings: SmartWarning[] = [
    {
      kind: 'inactive',
      membershipId: PARTNER_IDS.nora.membership,
      name: 'Nora Klein',
      title: '9 Tage ohne App',
      action: 'Kurzer Impuls senden',
    },
  ];
  qc.setQueryData(['smart-warnings', MEMBERSHIP_ID], warnings);

  const tl: TeamLeaderProgress = {
    membershipId: MEMBERSHIP_ID,
    activeFirstlines: 3,
    requiredFirstlines: 3,
    qualified: true,
    qualifiedAt: '2025-11-01T00:00:00Z',
    bonusEntitled: true,
    bonusPaid: false,
    bonusAmountCents: 50000,
  };
  qc.setQueryData(['team-leader-progress', MEMBERSHIP_ID], tl);

  const qual: QualificationProgress = {
    membershipId: MEMBERSHIP_ID,
    apTotal: 18450,
    currentRank: {
      key: 'mentor',
      label: 'Mentor',
      thresholdAp: 15000,
      frameAsset: 'frame-05',
    },
    nextRank: {
      key: 'architect',
      label: 'Architect',
      thresholdAp: 30000,
      remainingAp: 11550,
    },
    teamLeader: {
      qualified: true,
      activeFirstlines: 3,
      requiredFirstlines: 3,
      bonusAmountCents: 50000,
      bonusPaid: false,
      qualifiedAt: '2025-11-01T00:00:00Z',
    },
    unlockedRewards: [],
  };
  qc.setQueryData(['qualification-progress', MEMBERSHIP_ID], qual);

  const board: LeaderboardEntry[] = tree
    .filter((n) => n.depth <= 1)
    .map((n) => ({
      membershipId: n.membershipId,
      identityId: n.identityId,
      firstName: n.firstName,
      lastName: n.lastName,
      avatarUrl: n.avatarUrl,
      rankLabel: n.rankLabel,
      frameAsset: n.frameAsset,
      metric: n.apTotal,
      apTotal: n.apTotal,
      directCount: n.directCount,
    }));
  for (const period of ['month', 'week', 'all'] as const) {
    for (const sort of ['ap', 'activity', 'sales'] as const) {
      qc.setQueryData(['team-leaderboard', MEMBERSHIP_ID, period, sort], board);
    }
  }

  const stories: StoryCard[] = [
    {
      id: 'story-1',
      type: 'achievements',
      mediaKind: 'text',
      title: 'Mentor erreicht',
      body: 'Baran hat den Mentor-Rang freigeschaltet.',
      authorLabel: 'AscendOS',
      subjectName: 'Baran Fakker',
      mediaUrl: null,
      tone: 'celebrate',
      source: 'system',
      publishedAt: hoursFromNow(-5),
      expiresAt: hoursFromNow(48),
      accent: 'gold',
    },
    {
      id: 'story-2',
      type: 'partners',
      mediaKind: 'text',
      title: 'Neue Partnerin',
      body: 'Lena ist gestartet — willkommen im Team.',
      authorLabel: 'Team Seyda',
      subjectName: 'Lena Weiss',
      mediaUrl: null,
      tone: 'inspire',
      source: 'admin',
      publishedAt: hoursFromNow(-20),
      expiresAt: hoursFromNow(40),
      accent: 'champagne',
    },
    {
      id: 'story-3',
      type: 'zoom',
      mediaKind: 'text',
      title: 'Live Coaching heute',
      body: '20:00 · Recruiting ohne Druck',
      authorLabel: 'Ascent',
      subjectName: null,
      mediaUrl: null,
      tone: 'motivate',
      source: 'coach',
      publishedAt: hoursFromNow(-2),
      expiresAt: hoursFromNow(10),
      accent: 'ink',
    },
  ];
  qc.setQueryData(['ascend-stories', 'feed'], stories);

  const liveStarts = new Date();
  liveStarts.setHours(20, 0, 0, 0);
  const live: LiveCoachingEvent[] = [
    {
      id: 'a7000000-0000-4000-8000-0000000000f1',
      title: 'Recruiting ohne Druck',
      subtitle: 'Live Coaching',
      description: 'Wie du Klarheit schaffst, ohne zu pushen.',
      coach_name: 'Ascent',
      category: 'recruiting',
      language: 'de',
      starts_at: liveStarts.toISOString(),
      duration_minutes: 45,
      zoom_url: 'https://zoom.us/j/example',
      repeat_rule: 'weekly',
      media_type: 'image',
      media_path: null,
      media_url: null,
      active: true,
      published_at: daysAgo(2),
      published_by: USER_ID,
      replay_url: null,
      recording_url: null,
      guest_speakers: [],
      library_visible: true,
      created_by: USER_ID,
      updated_by: USER_ID,
      created_at: daysAgo(3),
      updated_at: daysAgo(1),
    },
  ];
  qc.setQueryData(['live-coaching-events', true], live);
  qc.setQueryData(['live-coaching-events', false], live);

  const profileDetail: ProfileDetail = {
    profile: presentationProfile,
    context: {
      teamName: 'Team Seyda',
      orgName: 'Chogan',
      sponsorName: null,
    },
    rank: {
      apTotal: 18450,
      membershipId: MEMBERSHIP_ID,
      current: {
        key: 'mentor',
        label: 'Mentor',
        threshold_ap: 15000,
        frame_asset: 'frame-05',
        sort_order: 5,
      },
      next: {
        key: 'architect',
        label: 'Architect',
        threshold_ap: 30000,
      },
      isBeraterDesMonats: true,
      equippedFrameKey: 'frame-10',
      teamLeaderQualified: true,
    },
  };
  qc.setQueryData(['profile-detail', USER_ID], profileDetail);

  qc.setQueryData(['monthly-awards', ORG_ID, 12], []);
  qc.setQueryData(['monthly-awards', ORG_ID, 36], []);
  qc.setQueryData(['advisor-hero-seen', USER_ID, ORG_ID, utcMonthStart()], true);

  const messages: CoachMessage[] = [
    {
      id: 'm1',
      role: 'assistant',
      content:
        'Guten Morgen, Baran. Dein klarster Hebel heute: Julia zum Fit Check führen — sie hat die Präsentation gesehen.',
      created_at: hoursFromNow(-1),
    },
    {
      id: 'm2',
      role: 'user',
      content: 'Wie öffne ich das Gespräch, ohne Druck aufzubauen?',
      created_at: hoursFromNow(-0.8),
    },
    {
      id: 'm3',
      role: 'assistant',
      content:
        'Starte mit ihrer Erkenntnis: „Was hat für dich am stärksten geklickt?“ Dann eine klare Einladung zum Fit Check — eine Frage, ein Termin.',
      created_at: hoursFromNow(-0.7),
    },
  ];
  qc.setQueryData(['coach-messages', CEO_CONVO_ID], messages);
  qc.setQueryData(['coach-convos-index'], [
    {
      id: CEO_CONVO_ID,
      contact_id: null,
      created_at: daysAgo(3),
      agent_key: 'ceo',
    },
  ]);

  qc.setQueryData(['firstline-progress', USER_ID], [
    {
      user_id: PARTNER_IDS.lena.user,
      first_name: 'Lena',
      username: 'lena',
      journey_id: TEAM_ID,
      journey_title: 'Erste 7 Tage',
      completed_steps: 4,
      total_steps: 10,
      current_day: 3,
      total_days: 7,
    },
  ]);
  qc.setQueryData(['external-tools-more'], [
    {
      id: 'a8000000-0000-4000-8000-000000000001',
      org_id: ORG_ID,
      key: 'presentation',
      name: 'Firmenpräsentation',
      description: 'Präsentation für Interessenten',
      url: 'https://mywaytomoon.netlify.app',
      share_event_type: 'presentation_sent' as const,
      result_event_type: 'presentation_viewed' as const,
      sort_order: 1,
      is_active: true,
      created_at: now,
    },
  ]);
  qc.setQueryData(['ap-tasks', MEMBERSHIP_ID], []);

  // Silence unused import lint if TEAM_ID only used above
  void presentationMembership;
}
