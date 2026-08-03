import type { CoachOrgIntelligence, PersonCoachInsight } from '@features/coach/intelligence/types';
import type { StoryCard, StoryType } from './types';
import { STORY_TTL_MS } from './types';

function firstName(full: string): string {
  const t = full.trim();
  if (!t) return 'Partner';
  return t.split(/\s+/)[0] ?? t;
}

function expiresFrom(publishedIso: string): string {
  return new Date(new Date(publishedIso).getTime() + STORY_TTL_MS).toISOString();
}

function card(partial: Omit<StoryCard, 'accent'> & { accent?: StoryCard['accent'] }): StoryCard {
  return { accent: 'champagne', ...partial };
}

/**
 * Coach Stories — optimistic insights from verified org intelligence only.
 * Never shame. Never fake. Never negative comparison.
 */
export function buildCoachStories(intelligence: CoachOrgIntelligence, max = 8): StoryCard[] {
  const publishedAt = intelligence.generatedAt;
  const expiresAt = expiresFrom(publishedAt);
  const stories: StoryCard[] = [];
  const d = intelligence.briefing;
  const evening = intelligence.evening;
  const health = intelligence.teamHealth;
  const exec = intelligence.executive;

  const topMomentum = pickMomentumStars(intelligence.personInsights, 3);
  for (const p of topMomentum) {
    stories.push(
      card({
        id: `coach-momentum-${p.membershipId}`,
        type: 'coach_highlights',
        mediaKind: 'text',
        title: firstName(p.name),
        body: optimisticMomentumLine(p),
        authorLabel: 'Ascent Coach',
        subjectName: p.name,
        mediaUrl: null,
        tone: 'inspire',
        source: 'coach',
        publishedAt,
        expiresAt,
        accent: 'gold',
      })
    );
  }

  const growthLine = d.yesterdaySummary.find((l) => /Registrierung/i.test(l));
  if (growthLine) {
    stories.push(
      card({
        id: 'coach-onboarding-growth',
        type: 'onboarding',
        mediaKind: 'text',
        title: 'Onboarding Momentum',
        body: `My analysis suggests your organization is welcoming growth — ${growthLine}.`,
        authorLabel: 'Ascent Coach',
        subjectName: null,
        mediaUrl: null,
        tone: 'celebrate',
        source: 'coach',
        publishedAt,
        expiresAt,
      })
    );
  }

  const activeLine = d.yesterdaySummary.find((l) => /heute aktiv/i.test(l));
  if (activeLine) {
    stories.push(
      card({
        id: 'coach-active-energy',
        type: 'partners',
        mediaKind: 'text',
        title: 'Team Energy',
        body: `${activeLine} — consistency is compounding.`,
        authorLabel: 'Ascent Coach',
        subjectName: null,
        mediaUrl: null,
        tone: 'motivate',
        source: 'coach',
        publishedAt,
        expiresAt,
      })
    );
  }

  if (exec.momentum.score >= 70) {
    stories.push(
      card({
        id: 'coach-momentum-org',
        type: 'achievements',
        mediaKind: 'text',
        title: 'Momentum',
        body: `Organization momentum is ${exec.momentum.label} (${exec.momentum.score}/100). ${exec.momentum.why[0] ?? ''}`.trim(),
        authorLabel: 'Ascent Coach',
        subjectName: null,
        mediaUrl: null,
        tone: 'inspire',
        source: 'coach',
        publishedAt,
        expiresAt,
        accent: 'gold',
      })
    );
  }

  const qualPriority = intelligence.priorities.find((p) =>
    /TeamLeader|Qualifikation/i.test(p.title)
  );
  if (qualPriority) {
    stories.push(
      card({
        id: `coach-qual-${qualPriority.id}`,
        type: 'qualifications',
        mediaKind: 'text',
        title: 'Qualification',
        body: `${qualPriority.title} — ${qualPriority.why}`,
        authorLabel: 'Ascent Coach',
        subjectName: null,
        mediaUrl: null,
        tone: 'motivate',
        source: 'coach',
        publishedAt,
        expiresAt,
        accent: 'gold',
      })
    );
  }

  const advisorCandidate = intelligence.personInsights.find(
    (p) => p.probabilityOfRegistration >= 0.55 && p.riskScore < 45 && p.strengths.length > 0
  );
  if (advisorCandidate) {
    stories.push(
      card({
        id: `coach-advisor-${advisorCandidate.membershipId}`,
        type: 'coach_highlights',
        mediaKind: 'text',
        title: firstName(advisorCandidate.name),
        body: `My analysis suggests ${firstName(advisorCandidate.name)} could become Advisor of the Month — ${advisorCandidate.strengths[0]}.`,
        authorLabel: 'Ascent Coach',
        subjectName: advisorCandidate.name,
        mediaUrl: null,
        tone: 'inspire',
        source: 'coach',
        publishedAt,
        expiresAt,
        accent: 'gold',
      })
    );
  }

  const consistencyStar = intelligence.personInsights.find((p) =>
    p.strengths.some((s) => /streak|konsistenz|consistency|disziplin/i.test(s))
  );
  if (consistencyStar) {
    stories.push(
      card({
        id: `coach-streak-${consistencyStar.membershipId}`,
        type: 'achievements',
        mediaKind: 'text',
        title: firstName(consistencyStar.name),
        body: `${firstName(consistencyStar.name)} has excellent consistency — ${consistencyStar.strengths[0]}.`,
        authorLabel: 'Ascent Coach',
        subjectName: consistencyStar.name,
        mediaUrl: null,
        tone: 'celebrate',
        source: 'coach',
        publishedAt,
        expiresAt,
      })
    );
  } else {
    const lowRisk = intelligence.personInsights
      .filter((p) => p.riskScore < 40)
      .sort((a, b) => a.riskScore - b.riskScore)[0];
    if (lowRisk) {
      stories.push(
        card({
          id: `coach-build-${lowRisk.membershipId}`,
          type: 'partners',
          mediaKind: 'text',
          title: firstName(lowRisk.name),
          body: `${firstName(lowRisk.name)} is building strong momentum — verified activity stays healthy.`,
          authorLabel: 'Ascent Coach',
          subjectName: lowRisk.name,
          mediaUrl: null,
          tone: 'inspire',
          source: 'coach',
          publishedAt,
          expiresAt,
        })
      );
    }
  }

  if (evening.todaysWins[0]) {
    stories.push(
      card({
        id: 'coach-win-today',
        type: 'achievements',
        mediaKind: 'text',
        title: 'Today',
        body: evening.todaysWins[0],
        authorLabel: 'Ascent Coach',
        subjectName: null,
        mediaUrl: null,
        tone: 'celebrate',
        source: 'coach',
        publishedAt,
        expiresAt,
      })
    );
  }

  if (health.score >= 70 && health.why[0]) {
    stories.push(
      card({
        id: 'coach-health',
        type: 'coach_highlights',
        mediaKind: 'text',
        title: 'Branch Health',
        body: `${health.label} (${health.score}/100). ${health.why[0]}`,
        authorLabel: 'Ascent Coach',
        subjectName: null,
        mediaUrl: null,
        tone: 'motivate',
        source: 'coach',
        publishedAt,
        expiresAt,
      })
    );
  }

  return dedupeStories(stories).slice(0, max);
}

function optimisticMomentumLine(p: PersonCoachInsight): string {
  if (p.strengths[0]) {
    return `${firstName(p.name)} stands out: ${p.strengths[0]}.`;
  }
  return `${firstName(p.name)} shows healthy forward motion — keep recognizing the effort.`;
}

function pickMomentumStars(people: PersonCoachInsight[], n: number): PersonCoachInsight[] {
  return [...people]
    .filter((p) => p.riskScore < 55 && p.probabilityOfInactivity < 0.55)
    .sort(
      (a, b) =>
        a.riskScore - b.riskScore || b.probabilityOfRegistration - a.probabilityOfRegistration
    )
    .slice(0, n);
}

function dedupeStories(stories: StoryCard[]): StoryCard[] {
  const seen = new Set<string>();
  return stories.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

export function isStoryActive(
  story: Pick<StoryCard, 'expiresAt'>,
  now: Date = new Date()
): boolean {
  return new Date(story.expiresAt).getTime() > now.getTime();
}

export function storyTypeLabel(type: StoryType): string {
  return type.replace(/_/g, ' ');
}

export function toStoryCardFromRow(row: {
  id: string;
  story_type: StoryType;
  media_kind: StoryCard['mediaKind'];
  title: string;
  body: string;
  author_label: string;
  subject_name: string | null;
  media_url: string | null;
  tone: StoryCard['tone'];
  source: StoryCard['source'];
  published_at: string;
  expires_at: string;
}): StoryCard {
  return {
    id: row.id,
    type: row.story_type,
    mediaKind: row.media_kind,
    title: row.title,
    body: row.body,
    authorLabel: row.author_label,
    subjectName: row.subject_name,
    mediaUrl: row.media_url,
    tone: row.tone,
    source: row.source,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    accent: row.source === 'admin' ? 'ink' : 'champagne',
  };
}

/** Merge admin/system rows with coach-generated; prefer freshest; drop expired. */
export function mergeStoryFeeds(
  adminRows: StoryCard[],
  coachStories: StoryCard[],
  now: Date = new Date()
): StoryCard[] {
  const all = [...adminRows, ...coachStories].filter((s) => isStoryActive(s, now));
  return all.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}
