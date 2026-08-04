import type { CoachOrgIntelligence, PersonCoachInsight } from '@features/coach/intelligence/types';
import { createCoachTranslator, type CoachTranslateFn } from '@features/coach/i18n';
import type { StoryCard, StoryType } from './types';
import { STORY_TTL_MS } from './types';

const DEFAULT_T = createCoachTranslator('de');
const REGISTRATION_RE = /registrierung|registration|inscription|kayıt|registrazion[ei]/i;
const ACTIVE_TODAY_RE =
  /heute aktiv|active today|acti(?:f|fs|ve|ves) aujourd|bugün.*aktif|attiv[ioe]* oggi/i;
const QUALIFICATION_RE = /team\s*leader|qualifikation|qualification|yeterlilik|qualifica/i;
const CONSISTENCY_RE =
  /streak|konsistenz|consistency|régularité|série|istikrar|seri|costanza|serie|disziplin|discipline|disiplin|disciplina/i;

function firstName(full: string, t: CoachTranslateFn): string {
  const trimmed = full.trim();
  if (!trimmed) return t('common.partner');
  return trimmed.split(/\s+/)[0] ?? trimmed;
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
export function buildCoachStories(
  intelligence: CoachOrgIntelligence,
  maxOrTranslator: number | CoachTranslateFn = 8,
  translate?: CoachTranslateFn
): StoryCard[] {
  const max = typeof maxOrTranslator === 'number' ? maxOrTranslator : 8;
  const t = typeof maxOrTranslator === 'function' ? maxOrTranslator : (translate ?? DEFAULT_T);
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
        title: firstName(p.name, t),
        body: optimisticMomentumLine(p, t),
        authorLabel: t('story.author'),
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

  const growthLine = d.yesterdaySummary.find((line) => REGISTRATION_RE.test(line));
  if (growthLine) {
    stories.push(
      card({
        id: 'coach-onboarding-growth',
        type: 'onboarding',
        mediaKind: 'text',
        title: t('story.titleOnboarding'),
        body: t('story.growth', { line: growthLine }),
        authorLabel: t('story.author'),
        subjectName: null,
        mediaUrl: null,
        tone: 'celebrate',
        source: 'coach',
        publishedAt,
        expiresAt,
      })
    );
  }

  const activeLine = d.yesterdaySummary.find((line) => ACTIVE_TODAY_RE.test(line));
  if (activeLine) {
    stories.push(
      card({
        id: 'coach-active-energy',
        type: 'partners',
        mediaKind: 'text',
        title: t('story.titleTeamEnergy'),
        body: t('story.teamEnergy', { line: activeLine }),
        authorLabel: t('story.author'),
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
        title: t('story.titleMomentum'),
        body: t('story.orgMomentum', {
          label: exec.momentum.label,
          score: exec.momentum.score,
          why: exec.momentum.why[0] ?? '',
        }).trim(),
        authorLabel: t('story.author'),
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

  const qualPriority = intelligence.priorities.find((p) => QUALIFICATION_RE.test(p.title));
  if (qualPriority) {
    stories.push(
      card({
        id: `coach-qual-${qualPriority.id}`,
        type: 'qualifications',
        mediaKind: 'text',
        title: t('story.titleQualification'),
        body: `${qualPriority.title} — ${qualPriority.why}`,
        authorLabel: t('story.author'),
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
        title: firstName(advisorCandidate.name, t),
        body: t('story.advisorCandidate', {
          name: firstName(advisorCandidate.name, t),
          strength: advisorCandidate.strengths[0],
        }),
        authorLabel: t('story.author'),
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
    p.strengths.some((strength) => CONSISTENCY_RE.test(strength))
  );
  if (consistencyStar) {
    stories.push(
      card({
        id: `coach-streak-${consistencyStar.membershipId}`,
        type: 'achievements',
        mediaKind: 'text',
        title: firstName(consistencyStar.name, t),
        body: t('story.consistency', {
          name: firstName(consistencyStar.name, t),
          strength: consistencyStar.strengths[0],
        }),
        authorLabel: t('story.author'),
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
          title: firstName(lowRisk.name, t),
          body: t('story.building', { name: firstName(lowRisk.name, t) }),
          authorLabel: t('story.author'),
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
        title: t('story.titleToday'),
        body: evening.todaysWins[0],
        authorLabel: t('story.author'),
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
        title: t('story.titleBranchHealth'),
        body: `${health.label} (${health.score}/100). ${health.why[0]}`,
        authorLabel: t('story.author'),
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

function optimisticMomentumLine(p: PersonCoachInsight, t: CoachTranslateFn): string {
  if (p.strengths[0]) {
    return t('story.personStrength', {
      name: firstName(p.name, t),
      strength: p.strengths[0],
    });
  }
  return t('story.personMomentum', { name: firstName(p.name, t) });
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
