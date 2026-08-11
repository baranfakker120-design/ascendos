// AscendOS Edge Function: content-autopilot (Dashboard-Version, alles in einer Datei)
// Name der Function MUSS exakt lauten: content-autopilot
//
// GENERIERT von scripts/bundle-functions.mjs — NICHT von Hand ändern.
// Quelle: supabase/functions/content-autopilot/index.ts

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

// ---- inline: _shared/cors.ts ----
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // x-ascendos-org: org selector from the shared Supabase client (additive; required for browser preflight).
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-ascendos-org',
};

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return null;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ---- inline: _shared/content-autopilot/types.ts ----
/** Instagram Content Autopilot V1 — shared contracts (no Facebook). */

export const AUTOPILOT_MIN_ELIGIBLE_ASSETS = 10;
export const AUTOPILOT_MAX_FEED_PER_DAY = 3;
export const AUTOPILOT_MAX_STORIES_PER_DAY = 3;
export const AUTOPILOT_DEFAULT_MAX_RETRIES = 3;
export const AUTOPILOT_ASSET_COOLDOWN_DAYS = 3;

export type AutopilotSlotKind = 'feed' | 'story';
export type AutopilotContentFormat = 'story' | 'feed' | 'reel';
export type AutopilotSlotStatus =
  | 'planned'
  | 'ready'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export type AutopilotPlanStatus = 'active' | 'completed' | 'cancelled';

export interface AutopilotEligibleAsset {
  id: string;
  scope: 'personal' | 'central' | string;
  media_kind: 'image' | 'video' | string;
  mime_type: string | null;
  storage_path: string | null;
  theme: string | null;
  keywords: string[] | null;
  suggested_formats: string[] | null;
  analysis_status: string | null;
  last_used_at: string | null;
  usage_count: number;
  created_at: string;
}

export interface AutopilotHistoryItem {
  assetId: string | null;
  category: string | null;
  theme: string | null;
  publishedAt: string;
  slotKind: AutopilotSlotKind | string;
}

export interface ScoredCandidate {
  asset: AutopilotEligibleAsset;
  score: number;
  category: string;
  reasons: string[];
}

// ---- inline: _shared/content-autopilot/eligibility.ts ----
/** Asset is publishable + countable toward the 10-asset gate. */
export function isEligibleAutopilotAsset(asset: AutopilotEligibleAsset): boolean {
  if (!asset?.id) return false;
  if (!asset.storage_path || !String(asset.storage_path).trim()) return false;
  if (asset.media_kind !== 'image' && asset.media_kind !== 'video') return false;
  const mime = (asset.mime_type ?? '').toLowerCase();
  if (mime && mime.startsWith('image/') === false && mime.startsWith('video/') === false) {
    return false;
  }
  if (asset.analysis_status === 'failed') return false;
  return true;
}

export function countEligibleAssets(assets: readonly AutopilotEligibleAsset[]): number {
  return assets.filter(isEligibleAutopilotAsset).length;
}

export function canActivateAutopilot(
  assets: readonly AutopilotEligibleAsset[],
  minRequired = AUTOPILOT_MIN_ELIGIBLE_ASSETS
): { ok: true; count: number } | { ok: false; count: number; reason: 'below_min_assets' } {
  const count = countEligibleAssets(assets);
  if (count < minRequired) return { ok: false, count, reason: 'below_min_assets' };
  return { ok: true, count };
}

/** Meine + Zentrale together — both scopes count when eligible. */
export function countByScope(assets: readonly AutopilotEligibleAsset[]): {
  personal: number;
  central: number;
  total: number;
} {
  let personal = 0;
  let central = 0;
  for (const a of assets) {
    if (!isEligibleAutopilotAsset(a)) continue;
    if (a.scope === 'central') central += 1;
    else personal += 1;
  }
  return { personal, central, total: personal + central };
}

// ---- inline: _shared/content-autopilot/signals.ts ----
/** Weekday / daypart signals — soft preferences, never hard requirements. */

export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sun=0 … Sat=6 (JS Date)

export type Daypart = 'morning' | 'midday' | 'afternoon' | 'evening';

const WEEKDAY_CATEGORIES: Record<WeekdayIndex, string[]> = {
  1: ['motivation', 'business', 'goals', 'recruiting', 'weekstart'],
  2: ['education', 'tips', 'product', 'value'],
  3: ['team', 'community', 'storytelling', 'education'],
  4: ['business', 'recruiting', 'product', 'socialproof'],
  5: ['lifestyle', 'personality', 'team', 'community'],
  6: ['lifestyle', 'everyday', 'personality', 'community'],
  0: ['reflection', 'motivation', 'planning', 'personalstory'],
};

const DAYPART_CATEGORIES: Record<Daypart, string[]> = {
  morning: ['motivation', 'daystart', 'personality', 'story'],
  midday: ['education', 'value', 'carousel', 'product'],
  afternoon: ['community', 'lifestyle', 'interaction'],
  evening: ['recruiting', 'storytelling', 'business', 'reel', 'cta'],
};

export function daypartFromHour(hour: number): Daypart {
  if (hour < 11) return 'morning';
  if (hour < 15) return 'midday';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export function preferredCategoriesForSlot(params: {
  weekday: WeekdayIndex;
  hour: number;
}): string[] {
  const day = WEEKDAY_CATEGORIES[params.weekday] ?? [];
  const part = DAYPART_CATEGORIES[daypartFromHour(params.hour)] ?? [];
  return [...new Set([...day, ...part])];
}

export function inferCategoryFromAsset(params: {
  theme: string | null | undefined;
  keywords: string[] | null | undefined;
  suggestedFormats: string[] | null | undefined;
}): string {
  const blob = [
    params.theme ?? '',
    ...(params.keywords ?? []),
    ...(params.suggestedFormats ?? []),
  ]
    .join(' ')
    .toLowerCase();

  const rules: Array<[string, RegExp]> = [
    ['recruiting', /recruit|team.?aufbau|bewerb|nebenverdienst|network.?market/],
    ['product', /produkt|parfum|duft|fragrance|packaging|product/],
    ['education', /tipp|learn|wissen|howto|erklä|educat|mehrwert/],
    ['lifestyle', /lifestyle|alltag|everyday|leben|mood/],
    ['storytelling', /story|erzähl|journey|weg/],
    ['team', /team|community|zusammen|wir/],
    ['business', /business|umsatz|ziele|fokus|mindset/],
    ['motivation', /motivation|inspiration|start|montag/],
    ['socialproof', /erfolg|proof|testimon|ergebnis|kunden/],
  ];
  for (const [cat, re] of rules) {
    if (re.test(blob)) return cat;
  }
  return 'general';
}

// ---- inline: _shared/content-autopilot/timing.ts ----
/**
 * Default local time windows (Europe/Berlin wall clock as HH:mm).
 * Soft defaults when account insights are unavailable — never invent metrics.
 */

export const DEFAULT_FEED_TIMES = ['09:30', '13:00', '19:00'] as const;
export const DEFAULT_STORY_TIMES = ['08:15', '12:30', '17:45'] as const;

export function parseHm(hm: string): { hour: number; minute: number } {
  const [h, m] = hm.split(':').map((x) => Number(x));
  return {
    hour: Number.isFinite(h) ? h : 12,
    minute: Number.isFinite(m) ? m : 0,
  };
}

/** Build ISO timestamptz for a calendar date + HH:mm in a fixed offset approximation.
 * Autopilot stores timestamptz; planning uses Europe/Berlin civil dates from the client/edge.
 * For V1 we encode as UTC+1/+2 via explicit offset passed by planner (cetOffsetHours).
 */
export function wallTimeToIso(params: {
  dateYmd: string; // YYYY-MM-DD
  hm: string;
  /** CET=1, CEST=2 */
  utcOffsetHours: number;
}): string {
  const { hour, minute } = parseHm(params.hm);
  const [y, mo, d] = params.dateYmd.split('-').map(Number);
  const utcMs = Date.UTC(y, mo - 1, d, hour - params.utcOffsetHours, minute, 0);
  return new Date(utcMs).toISOString();
}

/** Rough Berlin offset for a Y-M-D (CEST last Sunday March→October). Good enough for V1 slots. */
export function berlinUtcOffsetHours(dateYmd: string): number {
  const [y, mo, d] = dateYmd.split('-').map(Number);
  const utc = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  // Approximate EU DST: last Sunday of March to last Sunday of October
  const marchLastSun = lastSundayUtc(y, 2);
  const octLastSun = lastSundayUtc(y, 9);
  if (utc >= marchLastSun && utc < octLastSun) return 2;
  return 1;
}

function lastSundayUtc(year: number, monthIndex: number): Date {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0, 1, 0, 0));
  const day = last.getUTCDay();
  last.setUTCDate(last.getUTCDate() - day);
  return last;
}

export function enumerateDatesInclusive(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${startYmd}T12:00:00.000Z`);
  const end = new Date(`${endYmd}T12:00:00.000Z`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function weekdayIndexFromYmd(dateYmd: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const d = new Date(`${dateYmd}T12:00:00.000Z`);
  return d.getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

// ---- inline: _shared/content-autopilot/selection.ts ----
function daysBetween(isoA: string, isoB: string): number {
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  return Math.abs(a - b) / (24 * 60 * 60 * 1000);
}

export function scoreAutopilotCandidate(params: {
  asset: AutopilotEligibleAsset;
  slotKind: AutopilotSlotKind;
  weekday: WeekdayIndex;
  hour: number;
  nowIso: string;
  reservedAssetIds: ReadonlySet<string>;
  history: readonly AutopilotHistoryItem[];
}): ScoredCandidate | null {
  const { asset, slotKind, weekday, hour, nowIso, reservedAssetIds, history } = params;
  if (!isEligibleAutopilotAsset(asset)) return null;
  if (reservedAssetIds.has(asset.id)) return null;

  // Stories: prefer images; feed can be image or video (reel).
  if (slotKind === 'story' && asset.media_kind === 'video') {
    // Allow video stories but slightly lower — Meta supports them.
  }

  const category = inferCategoryFromAsset({
    theme: asset.theme,
    keywords: asset.keywords,
    suggestedFormats: asset.suggested_formats,
  });
  const preferred = preferredCategoriesForSlot({ weekday, hour });
  const reasons: string[] = [];
  let score = 50;

  if (preferred.includes(category)) {
    score += 18;
    reasons.push(`Passt zu Wochentag/Uhrzeit (${category}).`);
  } else if (category === 'general') {
    score += 2;
  } else {
    score += 6;
  }

  const usage = Number(asset.usage_count ?? 0);
  if (usage === 0) {
    score += 20;
    reasons.push('Noch nicht verwendet.');
  } else if (usage <= 2) {
    score += 10;
    reasons.push('Wenige Verwendungen.');
  } else {
    score -= Math.min(15, usage);
  }

  if (asset.last_used_at) {
    const ago = daysBetween(asset.last_used_at, nowIso);
    if (ago < 1) {
      score -= 40;
      reasons.push('Heute bereits verwendet — stark abgewertet.');
    } else if (ago < AUTOPILOT_ASSET_COOLDOWN_DAYS) {
      score -= 25;
      reasons.push('Kürzlich verwendet.');
    } else if (ago > 14) {
      score += 8;
      reasons.push('Lange nicht verwendet.');
    }
  }

  const recentCategories = history
    .filter((h) => daysBetween(h.publishedAt, nowIso) <= 2)
    .map((h) => h.category)
    .filter(Boolean) as string[];
  if (recentCategories.includes(category)) {
    score -= 12;
    reasons.push('Ähnliche Kategorie kürzlich gepostet.');
  }

  const sameAssetRecent = history.some(
    (h) => h.assetId === asset.id && daysBetween(h.publishedAt, nowIso) < AUTOPILOT_ASSET_COOLDOWN_DAYS
  );
  if (sameAssetRecent) {
    score -= 30;
    reasons.push('Asset in Cooldown.');
  }

  // Prefer matching suggested formats
  const formats = asset.suggested_formats ?? [];
  if (slotKind === 'story' && formats.includes('story')) score += 8;
  if (slotKind === 'feed' && (formats.includes('feed') || formats.includes('reel'))) score += 8;

  if (asset.scope === 'personal') score += 2;

  return { asset, score, category, reasons };
}

/**
 * Pick best candidate; returns null when nothing is good enough
 * (avoids forced low-quality / blind recycling).
 */
export function selectBestAutopilotAsset(params: {
  assets: readonly AutopilotEligibleAsset[];
  slotKind: AutopilotSlotKind;
  weekday: WeekdayIndex;
  hour: number;
  nowIso: string;
  reservedAssetIds: ReadonlySet<string>;
  history: readonly AutopilotHistoryItem[];
  /** Minimum score to accept — below → skip slot. */
  minScore?: number;
}): ScoredCandidate | null {
  const minScore = params.minScore ?? 35;
  const scored: ScoredCandidate[] = [];
  for (const asset of params.assets) {
    const s = scoreAutopilotCandidate({
      asset,
      slotKind: params.slotKind,
      weekday: params.weekday,
      hour: params.hour,
      nowIso: params.nowIso,
      reservedAssetIds: params.reservedAssetIds,
      history: params.history,
    });
    if (s) scored.push(s);
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0] ?? null;
  if (!best || best.score < minScore) return null;
  return best;
}

// ---- inline: _shared/content-autopilot/planner.ts ----
export interface PlannedSlotDraft {
  plannedFor: string;
  slotKind: AutopilotSlotKind;
  contentFormat: AutopilotContentFormat;
  assetId: string;
  theme: string | null;
  category: string;
  selectionReason: string;
  status: 'planned' | 'skipped';
  skipReason?: string;
}

function resolveFormat(
  slotKind: AutopilotSlotKind,
  asset: AutopilotEligibleAsset
): AutopilotContentFormat {
  if (slotKind === 'story') return 'story';
  if (asset.media_kind === 'video') return 'reel';
  return 'feed';
}

/**
 * Build a week of slots (max 3 feed + 3 stories / day).
 * Skips slots when no suitable unused asset remains.
 */
export function buildAutopilotWeekPlan(params: {
  periodStart: string;
  periodEnd: string;
  assets: readonly AutopilotEligibleAsset[];
  history: readonly AutopilotHistoryItem[];
  nowIso?: string;
  maxFeedPerDay?: number;
  maxStoriesPerDay?: number;
}): PlannedSlotDraft[] {
  const nowIso = params.nowIso ?? new Date().toISOString();
  const maxFeed = Math.min(
    AUTOPILOT_MAX_FEED_PER_DAY,
    params.maxFeedPerDay ?? AUTOPILOT_MAX_FEED_PER_DAY
  );
  const maxStories = Math.min(
    AUTOPILOT_MAX_STORIES_PER_DAY,
    params.maxStoriesPerDay ?? AUTOPILOT_MAX_STORIES_PER_DAY
  );
  const reserved = new Set<string>();
  const history = [...params.history];
  const slots: PlannedSlotDraft[] = [];

  for (const dateYmd of enumerateDatesInclusive(params.periodStart, params.periodEnd)) {
    const offset = berlinUtcOffsetHours(dateYmd);
    const weekday = weekdayIndexFromYmd(dateYmd);

    const feedTimes = DEFAULT_FEED_TIMES.slice(0, maxFeed);
    const storyTimes = DEFAULT_STORY_TIMES.slice(0, maxStories);

    const daySlots: Array<{ kind: AutopilotSlotKind; hm: string }> = [
      ...storyTimes.map((hm) => ({ kind: 'story' as const, hm })),
      ...feedTimes.map((hm) => ({ kind: 'feed' as const, hm })),
    ];

    for (const { kind, hm } of daySlots) {
      const { hour } = parseHm(hm);
      const plannedFor = wallTimeToIso({ dateYmd, hm, utcOffsetHours: offset });
      // Skip past slots when activating mid-week
      if (new Date(plannedFor).getTime() < new Date(nowIso).getTime() - 60_000) {
        continue;
      }

      const best = selectBestAutopilotAsset({
        assets: params.assets,
        slotKind: kind,
        weekday,
        hour,
        nowIso: plannedFor,
        reservedAssetIds: reserved,
        history,
      });

      if (!best) {
        slots.push({
          plannedFor,
          slotKind: kind,
          contentFormat: kind === 'story' ? 'story' : 'feed',
          assetId: '',
          theme: null,
          category: 'none',
          selectionReason: 'Kein ausreichend neuer und geeigneter Content verfügbar.',
          status: 'skipped',
          skipReason: 'no_suitable_asset',
        });
        continue;
      }

      reserved.add(best.asset.id);
      history.push({
        assetId: best.asset.id,
        category: best.category,
        theme: best.asset.theme,
        publishedAt: plannedFor,
        slotKind: kind,
      });

      slots.push({
        plannedFor,
        slotKind: kind,
        contentFormat: resolveFormat(kind, best.asset),
        assetId: best.asset.id,
        theme: best.asset.theme,
        category: best.category,
        selectionReason: best.reasons.slice(0, 3).join(' ') || 'Beste Passung für diesen Slot.',
        status: 'planned',
      });
    }
  }

  return slots;
}

// ---- inline: _shared/content-autopilot/index.ts ----


/**
 * content-autopilot — user JWT actions for Instagram Content Autopilot V1.
 *
 * Actions: get_state | activate | pause | resume | deactivate | replan
 * Instagram-only. No Facebook. Never touches OAuth start/callback.
 */


interface MembershipRow {
  id: string;
  org_id: string;
  role: string;
  status: string;
}

function userClient(req: Request): SupabaseClient {
  const forwardHeaders: Record<string, string> = {
    Authorization: req.headers.get('Authorization') ?? '',
  };
  const orgSelector = req.headers.get('x-ascendos-org');
  if (orgSelector) forwardHeaders['x-ascendos-org'] = orgSelector;
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: forwardHeaders },
  });
}

async function resolveMembership(
  db: SupabaseClient,
  req: Request
): Promise<{ membership: MembershipRow } | Response> {
  const { data: userData, error: authError } = await db.auth.getUser();
  if (authError || !userData.user) return json({ ok: false, error: 'not_authenticated' }, 401);

  const { data: memberships, error } = await db
    .from('memberships')
    .select('id, org_id, role, status')
    .eq('identity_id', userData.user.id)
    .eq('status', 'active');
  if (error) throw error;
  const orgHeader = req.headers.get('x-ascendos-org');
  const list = (memberships as MembershipRow[] | null) ?? [];
  const active =
    list.find((m) => orgHeader && m.org_id === orgHeader) ?? (list.length === 1 ? list[0] : null);
  if (!active) return json({ ok: false, error: 'no_active_membership' }, 403);
  return { membership: active };
}

async function loadEligibleAssets(
  db: SupabaseClient,
  orgId: string,
  membershipId: string
): Promise<AutopilotEligibleAsset[]> {
  const { data, error } = await db
    .from('content_assets')
    .select(
      'id, scope, media_kind, mime_type, storage_path, theme, keywords, suggested_formats, analysis_status, last_used_at, usage_count, created_at, owner_membership_id'
    )
    .eq('org_id', orgId)
    .or(`owner_membership_id.eq.${membershipId},scope.eq.central`);
  if (error) throw error;
  return (data ?? []) as AutopilotEligibleAsset[];
}

async function loadHistory(
  db: SupabaseClient,
  membershipId: string
): Promise<AutopilotHistoryItem[]> {
  const since = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from('content_autopilot_slots')
    .select('asset_id, category, theme, published_at, planned_for, slot_kind, status')
    .eq('membership_id', membershipId)
    .in('status', ['published', 'ready', 'planned', 'publishing'])
    .gte('planned_for', since)
    .order('planned_for', { ascending: false })
    .limit(80);
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    assetId: (row.asset_id as string) ?? null,
    category: (row.category as string) ?? null,
    theme: (row.theme as string) ?? null,
    publishedAt: String(row.published_at ?? row.planned_for),
    slotKind: String(row.slot_kind ?? 'feed'),
  }));
}

function defaultPeriod(): { start: string; end: string } {
  const now = new Date();
  // Start = today (UTC date for planning seed; slots use Berlin offset)
  const start = now.toISOString().slice(0, 10);
  const endDate = new Date(now);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
}

async function ensureSettings(
  db: SupabaseClient,
  membership: MembershipRow
): Promise<Record<string, unknown>> {
  const { data: existing } = await db
    .from('content_autopilot_settings')
    .select('*')
    .eq('org_id', membership.org_id)
    .eq('membership_id', membership.id)
    .maybeSingle();
  if (existing) return existing as Record<string, unknown>;
  const { data, error } = await db
    .from('content_autopilot_settings')
    .insert({
      org_id: membership.org_id,
      membership_id: membership.id,
      enabled: false,
      paused: false,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

async function igConnected(db: SupabaseClient, membership: MembershipRow): Promise<boolean> {
  const { data } = await db
    .from('content_instagram_connections')
    .select('status, ig_user_id, token_ref, scopes')
    .eq('org_id', membership.org_id)
    .eq('membership_id', membership.id)
    .maybeSingle();
  if (!data || data.status !== 'connected' || !data.ig_user_id || !data.token_ref) return false;
  const scopes = (data.scopes as string[] | null) ?? [];
  return scopes.includes('instagram_business_content_publish');
}

async function createDraftForSlot(
  db: SupabaseClient,
  membership: MembershipRow,
  assetId: string,
  format: 'story' | 'feed' | 'reel',
  category: string
): Promise<string | null> {
  // Reuse newest ready/draft for same asset+format if present.
  const { data: existing } = await db
    .from('content_drafts')
    .select('id, status, format')
    .eq('asset_id', assetId)
    .eq('owner_membership_id', membership.id)
    .eq('format', format)
    .in('status', ['draft', 'ready'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    if (existing.status !== 'ready') {
      await db.from('content_drafts').update({ status: 'ready' }).eq('id', existing.id);
    }
    return existing.id as string;
  }

  const { data: asset } = await db
    .from('content_assets')
    .select(
      'id, title, theme, keywords, detected_summary, audience_hint, analysis_json, mime_type, media_kind'
    )
    .eq('id', assetId)
    .maybeSingle();
  if (!asset) return null;

  const analysis = (asset.analysis_json ?? {}) as Record<string, unknown>;
  const hook =
    (typeof analysis.hook === 'string' && analysis.hook) ||
    (asset.theme ? String(asset.theme).slice(0, 120) : null) ||
    (asset.title ? String(asset.title).slice(0, 120) : 'AscendOS Update');
  const caption =
    (typeof analysis.caption === 'string' && analysis.caption) ||
    (asset.detected_summary ? String(asset.detected_summary).slice(0, 1800) : null) ||
    `${hook}`;
  const cta =
    (typeof analysis.cta === 'string' && analysis.cta) ||
    (format === 'story' ? '' : 'Speichere diesen Beitrag für später.');
  const keywords = Array.isArray(asset.keywords) ? asset.keywords.slice(0, 12) : [];
  let hashtags: string[] = [];
  if (Array.isArray(analysis.hashtags)) {
    hashtags = analysis.hashtags.map(String).map((h) => h.replace(/^#/, '')).slice(0, 5);
  }
  while (hashtags.length < 5) {
    const pad = ['ascendos', 'content', category || 'business', 'team', 'fokus'][hashtags.length];
    if (!hashtags.includes(pad)) hashtags.push(pad);
    else hashtags.push(`tag${hashtags.length + 1}`);
  }
  hashtags = hashtags.slice(0, 5);

  const { data: draft, error } = await db
    .from('content_drafts')
    .insert({
      org_id: membership.org_id,
      asset_id: assetId,
      owner_membership_id: membership.id,
      format,
      hook,
      caption: format === 'story' ? caption.slice(0, 400) : caption,
      cta,
      keywords,
      hashtags,
      clean_check_status: 'clean',
      clean_check_notes: 'Autopilot draft from existing asset analysis / metadata.',
      target_audience: asset.audience_hint,
      posting_hint: `Autopilot · ${category}`,
      status: 'ready',
      carousel_asset_ids: [],
      analysis_json: {
        source: 'autopilot_v1',
        category,
        reused_analysis: Boolean(analysis && Object.keys(analysis).length),
      },
    })
    .select('id')
    .single();
  if (error) {
    console.error('autopilot_draft_insert_failed', error.message);
    return null;
  }
  return draft.id as string;
}

async function buildAndInsertPlan(
  db: SupabaseClient,
  membership: MembershipRow,
  periodStart: string,
  periodEnd: string
): Promise<{ planId: string; slotCount: number; skipped: number }> {
  const assets = await loadEligibleAssets(db, membership.org_id, membership.id);
  const history = await loadHistory(db, membership.id);
  const planned = buildAutopilotWeekPlan({
    periodStart,
    periodEnd,
    assets,
    history,
    maxFeedPerDay: AUTOPILOT_MAX_FEED_PER_DAY,
    maxStoriesPerDay: AUTOPILOT_MAX_STORIES_PER_DAY,
  });

  // Cancel previous active plans' future slots
  const { data: activePlans } = await db
    .from('content_autopilot_plans')
    .select('id')
    .eq('membership_id', membership.id)
    .eq('status', 'active');
  for (const p of activePlans ?? []) {
    await db
      .from('content_autopilot_slots')
      .update({ status: 'cancelled' })
      .eq('plan_id', p.id)
      .in('status', ['planned', 'ready', 'failed']);
    await db.from('content_autopilot_plans').update({ status: 'cancelled' }).eq('id', p.id);
  }

  const { data: plan, error: planErr } = await db
    .from('content_autopilot_plans')
    .insert({
      org_id: membership.org_id,
      membership_id: membership.id,
      period_start: periodStart,
      period_end: periodEnd,
      status: 'active',
      summary: `Autopilot ${periodStart} → ${periodEnd}`,
    })
    .select('id')
    .single();
  if (planErr) throw planErr;

  let slotCount = 0;
  let skipped = 0;
  for (const s of planned) {
    if (s.status === 'skipped' || !s.assetId) {
      skipped += 1;
      await db.from('content_autopilot_slots').insert({
        org_id: membership.org_id,
        membership_id: membership.id,
        plan_id: plan.id,
        asset_id: null,
        planned_for: s.plannedFor,
        slot_kind: s.slotKind,
        content_format: s.contentFormat,
        theme: s.theme,
        category: s.category,
        selection_reason: s.selectionReason,
        status: 'skipped',
        error_message: s.skipReason ?? 'no_suitable_asset',
      });
      continue;
    }

    const draftId = await createDraftForSlot(
      db,
      membership,
      s.assetId,
      s.contentFormat,
      s.category
    );
    if (!draftId) {
      skipped += 1;
      await db.from('content_autopilot_slots').insert({
        org_id: membership.org_id,
        membership_id: membership.id,
        plan_id: plan.id,
        asset_id: s.assetId,
        planned_for: s.plannedFor,
        slot_kind: s.slotKind,
        content_format: s.contentFormat,
        theme: s.theme,
        category: s.category,
        selection_reason: s.selectionReason,
        status: 'skipped',
        error_message: 'draft_create_failed',
      });
      continue;
    }

    const { error: slotErr } = await db.from('content_autopilot_slots').insert({
      org_id: membership.org_id,
      membership_id: membership.id,
      plan_id: plan.id,
      draft_id: draftId,
      asset_id: s.assetId,
      planned_for: s.plannedFor,
      slot_kind: s.slotKind,
      content_format: s.contentFormat,
      theme: s.theme,
      category: s.category,
      selection_reason: s.selectionReason,
      status: 'ready',
    });
    if (slotErr) {
      // Reservation conflict — skip
      skipped += 1;
      continue;
    }
    slotCount += 1;
  }

  return { planId: plan.id as string, slotCount, skipped };
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  try {
    const db = userClient(req);
    const resolved = await resolveMembership(db, req);
    if (resolved instanceof Response) return resolved;
    const { membership } = resolved;
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      periodStart?: string;
      periodEnd?: string;
    };
    const action = String(body.action ?? 'get_state');

    const settings = await ensureSettings(db, membership);
    const assets = await loadEligibleAssets(db, membership.org_id, membership.id);
    const scopeCounts = countByScope(assets);
    const gate = canActivateAutopilot(assets, AUTOPILOT_MIN_ELIGIBLE_ASSETS);
    const connected = await igConnected(db, membership);

    if (action === 'get_state') {
      const { data: plan } = await db
        .from('content_autopilot_plans')
        .select('id, period_start, period_end, status, summary, created_at')
        .eq('membership_id', membership.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let slots: unknown[] = [];
      if (plan?.id) {
        const { data: slotRows } = await db
          .from('content_autopilot_slots')
          .select(
            'id, draft_id, asset_id, planned_for, slot_kind, content_format, theme, category, selection_reason, status, error_message, published_at, retry_count'
          )
          .eq('plan_id', plan.id)
          .order('planned_for', { ascending: true });
        slots = slotRows ?? [];
      }

      const today = new Date().toISOString().slice(0, 10);
      const weekSlots = (slots as Array<Record<string, unknown>>) ?? [];
      const stats = {
        feedPlanned: weekSlots.filter((s) => s.slot_kind === 'feed' && s.status !== 'cancelled')
          .length,
        feedPublished: weekSlots.filter(
          (s) => s.slot_kind === 'feed' && s.status === 'published'
        ).length,
        storiesPlanned: weekSlots.filter(
          (s) => s.slot_kind === 'story' && s.status !== 'cancelled'
        ).length,
        storiesPublished: weekSlots.filter(
          (s) => s.slot_kind === 'story' && s.status === 'published'
        ).length,
        skipped: weekSlots.filter((s) => s.status === 'skipped').length,
        failed: weekSlots.filter((s) => s.status === 'failed').length,
        todayFeed: weekSlots.filter(
          (s) =>
            s.slot_kind === 'feed' &&
            String(s.planned_for).startsWith(today) &&
            s.status !== 'cancelled' &&
            s.status !== 'skipped'
        ).length,
        todayStories: weekSlots.filter(
          (s) =>
            s.slot_kind === 'story' &&
            String(s.planned_for).startsWith(today) &&
            s.status !== 'cancelled' &&
            s.status !== 'skipped'
        ).length,
      };

      const next = weekSlots.find(
        (s) =>
          (s.status === 'ready' || s.status === 'planned') &&
          new Date(String(s.planned_for)).getTime() >= Date.now() - 60_000
      );

      return json({
        ok: true,
        settings,
        instagramConnected: connected,
        eligibility: {
          ...gate,
          ...scopeCounts,
          minRequired: AUTOPILOT_MIN_ELIGIBLE_ASSETS,
          maxFeedPerDay: AUTOPILOT_MAX_FEED_PER_DAY,
          maxStoriesPerDay: AUTOPILOT_MAX_STORIES_PER_DAY,
        },
        plan: plan ?? null,
        slots,
        stats,
        nextSlot: next ?? null,
        datesInPeriod: plan
          ? enumerateDatesInclusive(String(plan.period_start), String(plan.period_end))
          : [],
      });
    }

    if (action === 'activate') {
      if (!connected) {
        return json({ ok: false, error: 'instagram_not_connected' }, 400);
      }
      if (!gate.ok) {
        return json(
          {
            ok: false,
            error: 'below_min_assets',
            count: gate.count,
            minRequired: AUTOPILOT_MIN_ELIGIBLE_ASSETS,
            scopeCounts,
          },
          400
        );
      }
      const period = defaultPeriod();
      const periodStart = String(body.periodStart ?? period.start).slice(0, 10);
      const periodEnd = String(body.periodEnd ?? period.end).slice(0, 10);

      const built = await buildAndInsertPlan(db, membership, periodStart, periodEnd);
      const { data: updatedSettings, error: setErr } = await db
        .from('content_autopilot_settings')
        .update({
          enabled: true,
          paused: false,
          consent_confirmed_at: new Date().toISOString(),
          last_activated_at: new Date().toISOString(),
        })
        .eq('org_id', membership.org_id)
        .eq('membership_id', membership.id)
        .select('*')
        .single();
      if (setErr) throw setErr;

      return json({
        ok: true,
        settings: updatedSettings,
        planId: built.planId,
        slotCount: built.slotCount,
        skipped: built.skipped,
      });
    }

    if (action === 'pause') {
      const { data, error } = await db
        .from('content_autopilot_settings')
        .update({ paused: true, last_paused_at: new Date().toISOString() })
        .eq('membership_id', membership.id)
        .select('*')
        .single();
      if (error) throw error;
      return json({ ok: true, settings: data });
    }

    if (action === 'resume') {
      if (!connected) return json({ ok: false, error: 'instagram_not_connected' }, 400);
      if (!gate.ok) return json({ ok: false, error: 'below_min_assets', count: gate.count }, 400);
      const { data, error } = await db
        .from('content_autopilot_settings')
        .update({ paused: false, enabled: true })
        .eq('membership_id', membership.id)
        .select('*')
        .single();
      if (error) throw error;
      return json({ ok: true, settings: data });
    }

    if (action === 'deactivate') {
      const { data: activePlans } = await db
        .from('content_autopilot_plans')
        .select('id')
        .eq('membership_id', membership.id)
        .eq('status', 'active');
      for (const p of activePlans ?? []) {
        await db
          .from('content_autopilot_slots')
          .update({ status: 'cancelled' })
          .eq('plan_id', p.id)
          .in('status', ['planned', 'ready', 'failed']);
        await db.from('content_autopilot_plans').update({ status: 'cancelled' }).eq('id', p.id);
      }
      const { data, error } = await db
        .from('content_autopilot_settings')
        .update({ enabled: false, paused: false })
        .eq('membership_id', membership.id)
        .select('*')
        .single();
      if (error) throw error;
      return json({ ok: true, settings: data });
    }

    if (action === 'replan') {
      if (!connected) return json({ ok: false, error: 'instagram_not_connected' }, 400);
      if (!gate.ok) return json({ ok: false, error: 'below_min_assets', count: gate.count }, 400);
      const period = defaultPeriod();
      const periodStart = String(body.periodStart ?? period.start).slice(0, 10);
      const periodEnd = String(body.periodEnd ?? period.end).slice(0, 10);
      const built = await buildAndInsertPlan(db, membership, periodStart, periodEnd);
      return json({ ok: true, planId: built.planId, slotCount: built.slotCount, skipped: built.skipped });
    }

    return json({ ok: false, error: 'unknown_action' }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'internal_error';
    console.error('content_autopilot_error', msg);
    return json({ ok: false, error: 'internal_error' }, 500);
  }
});
