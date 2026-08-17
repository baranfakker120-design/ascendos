/**
 * Minimal org-scoped AI usage ledger helper (Edge).
 * Never throws into the caller path — tracking must not break product flows.
 * Does not log prompts, completions, or secrets.
 */

export type AiUsageInsert = {
  org_id: string;
  user_id?: string | null;
  feature: string;
  provider?: string | null;
  model?: string | null;
  input_tokens?: number;
  output_tokens?: number;
  estimated_cost_micros?: number | null;
  request_id?: string | null;
  metadata?: Record<string, unknown>;
};

type SupabaseLike = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
  };
};

export async function recordAiUsageEvent(
  db: SupabaseLike,
  row: AiUsageInsert
): Promise<void> {
  try {
    const result = await db.from('ai_usage_events').insert({
      org_id: row.org_id,
      user_id: row.user_id ?? null,
      feature: row.feature,
      provider: row.provider ?? null,
      model: row.model ?? null,
      input_tokens: Math.max(0, row.input_tokens ?? 0),
      output_tokens: Math.max(0, row.output_tokens ?? 0),
      estimated_cost_micros: row.estimated_cost_micros ?? null,
      request_id: row.request_id ?? null,
      metadata: row.metadata ?? {},
    });
    void result;
  } catch {
    // swallow — ledger must never break coach/content
  }
}
