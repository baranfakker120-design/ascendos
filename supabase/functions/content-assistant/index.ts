// ============================================================
// content-assistant — Phase 3: AI asset analysis + draft generation
//
// Separate from coach-chat. Does NOT use coach quota.
// Does NOT publish to Instagram. Does NOT run daily cron.
// Vision: OpenRouter multimodal (Gemini) via signed media URL so the
// model sees the actual image/video — not only the file name.
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handleOptions, json } from '../_shared/cors.ts';
import {
  classifyHttpStatus,
  fetchWithTimeout,
  parseOpenAiResponse,
} from '../_shared/ai-providers/openai-format.ts';

const CONTENT_ASSETS_BUCKET = 'content-assets';
const DEFAULT_DAILY_GENERATION_LIMIT = 25;
/** Vision model with image + video URL support via OpenRouter. */
const VISION_MODEL = 'google/gemini-2.5-flash';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const VISION_TIMEOUT_MS = 60_000;

type ContentFormat = 'story' | 'feed' | 'reel';

interface MembershipRow {
  id: string;
  org_id: string;
  role: string;
  status: string;
}

interface AssetRow {
  id: string;
  org_id: string;
  owner_membership_id: string;
  scope: string;
  media_kind: 'image' | 'video';
  storage_path: string;
  file_name: string;
  mime_type: string;
  title: string | null;
  aspect_ratio: string | null;
  suggested_formats: string[] | null;
}

interface GenerationPayload {
  visual_summary: string;
  theme: string | null;
  audience_hint: string | null;
  mood: string | null;
  content_category: string | null;
  message: string | null;
  product_hint: string | null;
  uncertain: string[];
  content_type: ContentFormat;
  hook: string;
  caption: string;
  keywords: string[];
  hashtags: string[];
  cta: string;
  target_audience: string | null;
  posting_hint: string | null;
  llm_clean_flags: string[];
}

const SPAM_HASHTAGS = new Set([
  'fyp',
  'foryou',
  'foryoupage',
  'viral',
  'viralvideo',
  'explorepage',
  'explore',
  'trending',
  'follow4follow',
  'like4like',
  'l4l',
  'f4f',
  'spam',
]);

const ENGAGEMENT_BAIT =
  /\b(like\s*and\s*share|like\s*for\s*like|comment\s*yes|tag\s*(3|three)\s*friends|double\s*tap|smash\s*that)\b/i;

const MISLEADING_CLAIMS =
  /\b(guaranteed\s*income|passive\s*income\s*guaranteed|get\s*rich|make\s*\$?\d+|earn\s*\$?\d+|miracle\s*cure|100\s*%\s*safe\s*from\s*shadowban|shadowban[\s-]*proof|instagram\s*guaranteed)\b/i;

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, '').toLowerCase();
}

function runHeuristicCleanCheck(input: {
  hook: string;
  caption: string;
  cta: string;
  keywords: string[];
  hashtags: string[];
  llmFlags: string[];
}): { status: 'clean' | 'attention'; notes: string[] } {
  const notes: string[] = [];
  const hashtags = input.hashtags.map(normalizeTag).filter(Boolean);
  const blob = [input.hook, input.caption, input.cta, ...input.keywords, ...hashtags].join('\n');

  if (hashtags.length > 18) notes.push('Too many hashtags (keep a focused set).');
  if (hashtags.length > 0 && new Set(hashtags).size < hashtags.length) {
    notes.push('Repeated hashtags detected.');
  }
  const spamTags = hashtags.filter((h) => SPAM_HASHTAGS.has(h));
  if (spamTags.length > 0) {
    notes.push(`Generic/spam-leaning hashtags: ${spamTags.map((h) => `#${h}`).join(', ')}`);
  }
  if (ENGAGEMENT_BAIT.test(blob)) notes.push('Aggressive engagement-bait phrasing detected.');
  if (MISLEADING_CLAIMS.test(blob)) {
    notes.push('Potentially misleading or absolute claim language detected.');
  }
  for (const flag of input.llmFlags) {
    const f = flag.trim();
    if (f) notes.push(f);
  }
  notes.push(
    'Clean Check is supportive only — not a guarantee of Instagram compliance or reach.'
  );
  return { status: notes.length > 1 ? 'attention' : 'clean', notes };
}

function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('invalid_ai_json');
  return JSON.parse(raw.slice(start, end + 1));
}

function asStringArray(v: unknown, max = 24): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== 'string') continue;
    const s = item.trim();
    if (!s) continue;
    out.push(s.replace(/^#/, ''));
    if (out.length >= max) break;
  }
  return out;
}

function asNullableString(v: unknown, max = 2000): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.slice(0, max);
}

function normalizeFormat(v: unknown, fallback: ContentFormat): ContentFormat {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (s === 'story' || s === 'feed' || s === 'reel') return s;
  return fallback;
}

function parseGeneration(raw: unknown, formatFallback: ContentFormat): GenerationPayload {
  if (!raw || typeof raw !== 'object') throw new Error('invalid_ai_json');
  const o = raw as Record<string, unknown>;
  const visual = asNullableString(o.visual_summary, 4000);
  if (!visual) throw new Error('missing_visual_summary');

  const hook = asNullableString(o.hook, 280) ?? '';
  const caption = asNullableString(o.caption, 2200) ?? '';
  const cta = asNullableString(o.cta, 280) ?? '';
  if (!hook || !caption) throw new Error('missing_draft_fields');

  return {
    visual_summary: visual,
    theme: asNullableString(o.theme, 200),
    audience_hint: asNullableString(o.audience_hint, 400),
    mood: asNullableString(o.mood, 120),
    content_category: asNullableString(o.content_category, 120),
    message: asNullableString(o.message, 400),
    product_hint: asNullableString(o.product_hint, 200),
    uncertain: asStringArray(o.uncertain, 12),
    content_type: normalizeFormat(o.content_type ?? o.format, formatFallback),
    hook,
    caption,
    keywords: asStringArray(o.keywords, 16),
    hashtags: asStringArray(o.hashtags, 18),
    cta,
    target_audience: asNullableString(o.target_audience, 400),
    posting_hint: asNullableString(o.posting_hint, 400),
    llm_clean_flags: asStringArray(o.llm_clean_flags ?? o.clean_check_flags, 12),
  };
}

function buildSystemPrompt(locale: string): string {
  return `You are AscendOS Content Assistant. Analyze the REAL media (image or video) the user provides.
Do NOT invent details you cannot see. If unsure, list the uncertainty in "uncertain" and keep related fields null or cautious.
Never claim shadowban safety or Instagram guarantees.
Never invent income, health, or miracle claims.
Write captions that sound natural for the audience — not robotic, not keyword-stuffed, not spammy.
Hashtags must match the actual content. Do NOT default to fyp/viral/explore/trending unless clearly justified by the media (prefer omitting them).
No black-hat, scraping, bots, or fake-engagement advice.

Respond with ONE JSON object only (no markdown) using this shape:
{
  "visual_summary": string,
  "theme": string|null,
  "audience_hint": string|null,
  "mood": string|null,
  "content_category": string|null,
  "message": string|null,
  "product_hint": string|null,
  "uncertain": string[],
  "content_type": "story"|"feed"|"reel",
  "hook": string,
  "caption": string,
  "keywords": string[],
  "hashtags": string[],
  "cta": string,
  "target_audience": string|null,
  "posting_hint": string|null,
  "llm_clean_flags": string[]
}

Language for hook/caption/cta/keywords/hashtags text: ${locale}.
llm_clean_flags: short notes about spam risk, misleading claims, or engagement bait you still see in YOUR draft (empty if none).`;
}

function buildUserPrompt(params: {
  format: ContentFormat;
  fileName: string;
  title: string | null;
  mediaKind: string;
  aspectRatio: string | null;
  locale: string;
}): string {
  return [
    `Requested content format: ${params.format}`,
    `Media kind: ${params.mediaKind}`,
    `Aspect ratio hint: ${params.aspectRatio ?? 'unknown'}`,
    `Asset title (may be wrong — trust the media first): ${params.title ?? ''}`,
    `File name (may be wrong — trust the media first): ${params.fileName}`,
    `Output language: ${params.locale}`,
    'Analyze the attached media and produce the JSON draft.',
  ].join('\n');
}

async function callVisionModel(params: {
  system: string;
  userText: string;
  mediaKind: 'image' | 'video';
  mimeType: string;
  signedUrl: string;
}): Promise<{ text: string; model: string; provider: string }> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    throw new Error('missing_openrouter_key');
  }

  const mediaPart =
    params.mediaKind === 'video'
      ? {
          type: 'video_url',
          video_url: { url: params.signedUrl },
        }
      : {
          type: 'image_url',
          image_url: { url: params.signedUrl },
        };

  // Some OpenRouter routes reject video_url — retry images-only style with image_url for video as last resort is useless.
  // Primary: native multimodal parts; fallback for video: also try image_url key (some gateways accept video there).
  const attempts: unknown[][] = [
    [
      { type: 'text', text: params.userText },
      mediaPart,
    ],
  ];
  if (params.mediaKind === 'video') {
    attempts.push([
      { type: 'text', text: params.userText },
      { type: 'image_url', image_url: { url: params.signedUrl } },
    ]);
  }

  let lastErr: Error | null = null;
  for (const content of attempts) {
    try {
      const res = await fetchWithTimeout(
        'openrouter',
        OPENROUTER_URL,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://ascendos.app',
            'X-Title': 'AscendOS Content Assistant',
          },
          body: JSON.stringify({
            model: VISION_MODEL,
            temperature: 0.35,
            max_tokens: 2200,
            messages: [
              { role: 'system', content: params.system },
              { role: 'user', content },
            ],
          }),
        },
        VISION_TIMEOUT_MS
      );
      const httpError = classifyHttpStatus('openrouter', res.status, res.statusText);
      if (httpError) throw httpError;
      const { text } = await parseOpenAiResponse('openrouter', res);
      return { text, model: VISION_MODEL, provider: 'openrouter' };
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr ?? new Error('vision_failed');
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    // Forward org selector so current_org_id()/RLS resolve the same membership as the client.
    const forwardHeaders: Record<string, string> = {
      Authorization: req.headers.get('Authorization') ?? '',
    };
    const orgSelector = req.headers.get('x-ascendos-org');
    if (orgSelector) forwardHeaders['x-ascendos-org'] = orgSelector;

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: forwardHeaders },
    });

    const { data: userData, error: authError } = await db.auth.getUser();
    if (authError || !userData.user) return json({ error: 'not_authenticated' }, 401);

    const { data: memberships, error: membershipError } = await db
      .from('memberships')
      .select('id, org_id, role, status')
      .eq('identity_id', userData.user.id)
      .eq('status', 'active');
    if (membershipError) throw membershipError;

    const orgHeader = req.headers.get('x-ascendos-org');
    const active =
      (memberships as MembershipRow[] | null)?.find((m) => orgHeader && m.org_id === orgHeader) ??
      ((memberships as MembershipRow[] | null)?.length === 1
        ? (memberships as MembershipRow[])[0]
        : null);
    if (!active) return json({ error: 'no_active_membership' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'generate_draft');
    if (action !== 'generate_draft') {
      return json({ error: 'unsupported_action', action }, 400);
    }

    const assetId = String(body.assetId ?? '').trim();
    if (!assetId) return json({ error: 'asset_id_required' }, 400);

    const requestedFormat = normalizeFormat(body.format, 'feed');
    const locale = String(body.locale ?? 'de').trim().slice(0, 8) || 'de';

    const { data: asset, error: assetError } = await db
      .from('content_assets')
      .select(
        'id, org_id, owner_membership_id, scope, media_kind, storage_path, file_name, mime_type, title, aspect_ratio, suggested_formats'
      )
      .eq('id', assetId)
      .maybeSingle();
    if (assetError) throw assetError;
    if (!asset) return json({ error: 'asset_not_found' }, 404);
    const assetRow = asset as AssetRow;
    if (assetRow.org_id !== active.org_id) return json({ error: 'asset_wrong_org' }, 403);

    // Content-side daily generation quota (org settings). Never coach quota.
    const { data: orgRow } = await db
      .from('organizations')
      .select('settings')
      .eq('id', active.org_id)
      .maybeSingle();
    const settings = (orgRow?.settings ?? {}) as Record<string, unknown>;
    const dailyLimitRaw = Number(settings.content_daily_generation_limit);
    const dailyLimit =
      Number.isFinite(dailyLimitRaw) && dailyLimitRaw > 0
        ? Math.min(500, Math.floor(dailyLimitRaw))
        : DEFAULT_DAILY_GENERATION_LIMIT;

    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count: usedToday, error: countError } = await db
      .from('content_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('owner_membership_id', active.id)
      .gte('created_at', dayStart.toISOString());
    if (countError) throw countError;
    if ((usedToday ?? 0) >= dailyLimit) {
      return json(
        {
          error: 'content_generation_quota_reached',
          used: usedToday ?? 0,
          limit: dailyLimit,
          message: 'Content-Quota für KI-Generierungen heute erreicht.',
        },
        429
      );
    }

    const format: ContentFormat =
      requestedFormat ||
      normalizeFormat(assetRow.suggested_formats?.[0], 'feed');

    const { data: signed, error: signError } = await db.storage
      .from(CONTENT_ASSETS_BUCKET)
      .createSignedUrl(assetRow.storage_path, 3600);
    if (signError || !signed?.signedUrl) {
      return json({ error: 'signed_url_failed', detail: signError?.message }, 500);
    }

    let visionText: string;
    let providerMeta: { provider: string; model: string };
    try {
      const vision = await callVisionModel({
        system: buildSystemPrompt(locale),
        userText: buildUserPrompt({
          format,
          fileName: assetRow.file_name,
          title: assetRow.title,
          mediaKind: assetRow.media_kind,
          aspectRatio: assetRow.aspect_ratio,
          locale,
        }),
        mediaKind: assetRow.media_kind,
        mimeType: assetRow.mime_type,
        signedUrl: signed.signedUrl,
      });
      visionText = vision.text;
      providerMeta = { provider: vision.provider, model: vision.model };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Best-effort mark analysis failed (may be denied by RLS on central assets for non-managers).
      await db
        .from('content_assets')
        .update({
          analysis_status: 'failed',
          analysis_json: { error: msg, at: new Date().toISOString() },
        })
        .eq('id', assetRow.id);
      if (msg.includes('missing_openrouter_key') || msg.includes('OPENROUTER')) {
        return json({ error: 'ai_not_configured', detail: msg }, 503);
      }
      return json({ error: 'ai_analysis_failed', detail: msg }, 502);
    }

    let parsed: GenerationPayload;
    try {
      parsed = parseGeneration(extractJsonObject(visionText), format);
    } catch (e) {
      await db
        .from('content_assets')
        .update({
          analysis_status: 'failed',
          analysis_json: {
            error: 'parse_failed',
            rawPreview: visionText.slice(0, 800),
            at: new Date().toISOString(),
          },
        })
        .eq('id', assetRow.id);
      return json(
        {
          error: 'ai_parse_failed',
          detail: e instanceof Error ? e.message : String(e),
        },
        502
      );
    }

    const clean = runHeuristicCleanCheck({
      hook: parsed.hook,
      caption: parsed.caption,
      cta: parsed.cta,
      keywords: parsed.keywords,
      hashtags: parsed.hashtags,
      llmFlags: parsed.llm_clean_flags,
    });

    const analysisJson = {
      provider: providerMeta.provider,
      model: providerMeta.model,
      visual_summary: parsed.visual_summary,
      theme: parsed.theme,
      audience_hint: parsed.audience_hint,
      mood: parsed.mood,
      content_category: parsed.content_category,
      message: parsed.message,
      product_hint: parsed.product_hint,
      uncertain: parsed.uncertain,
      generated_at: new Date().toISOString(),
      // Architecture hook for later curated/official hashtag research (Phase 5+) — not used yet.
      research: { mode: 'asset_derived_only', hashtagApi: 'not_enabled' },
    };

    // Best-effort asset analysis update (RLS may block non-managers on central assets).
    const { data: usageRow } = await db
      .from('content_assets')
      .select('usage_count')
      .eq('id', assetRow.id)
      .maybeSingle();
    await db
      .from('content_assets')
      .update({
        analysis_status: 'ready',
        detected_summary: parsed.visual_summary.slice(0, 2000),
        theme: parsed.theme,
        mood: parsed.mood,
        product_hint: parsed.product_hint,
        audience_hint: parsed.audience_hint,
        keywords: parsed.keywords,
        analysis_json: analysisJson,
        last_used_at: new Date().toISOString(),
        usage_count: Number(usageRow?.usage_count ?? 0) + 1,
      })
      .eq('id', assetRow.id);

    const draftInsert = {
      org_id: active.org_id,
      asset_id: assetRow.id,
      owner_membership_id: active.id,
      format: parsed.content_type,
      hook: parsed.hook,
      caption: parsed.caption,
      cta: parsed.cta,
      keywords: parsed.keywords,
      hashtags: parsed.hashtags.map((h) => h.replace(/^#/, '')),
      clean_check_status: clean.status,
      clean_check_notes: clean.notes.join(' · '),
      target_audience: parsed.target_audience ?? parsed.audience_hint,
      posting_hint: parsed.posting_hint,
      status: 'draft' as const,
    };

    const { data: draft, error: draftError } = await db
      .from('content_drafts')
      .insert(draftInsert)
      .select(
        'id, org_id, asset_id, owner_membership_id, format, hook, caption, cta, keywords, hashtags, clean_check_status, clean_check_notes, target_audience, posting_hint, content_score, status, created_at, updated_at'
      )
      .single();
    if (draftError) throw draftError;

    return json({
      ok: true,
      draft,
      analysis: analysisJson,
      cleanCheck: {
        status: clean.status,
        notes: clean.notes,
        isGuarantee: false,
      },
      quota: {
        used: (usedToday ?? 0) + 1,
        limit: dailyLimit,
      },
      // Phase 6 placeholder — never auto-publish.
      instagram: { prepareOnly: true, publishingEnabled: false },
    });
  } catch (e) {
    console.error('content-assistant error', e);
    return json(
      {
        error: 'internal_error',
        detail: e instanceof Error ? e.message : String(e),
      },
      500
    );
  }
});
