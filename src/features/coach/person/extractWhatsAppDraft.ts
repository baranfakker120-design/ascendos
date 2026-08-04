/**
 * Detect WhatsApp-style drafts in coach replies.
 * Prefers fenced ```whatsapp blocks; falls back to a short greeting draft.
 */
export function extractWhatsAppDraft(content: string): {
  draft: string | null;
  remainder: string;
} {
  const fenced = content.match(/```whatsapp\s*([\s\S]*?)```/i);
  if (fenced) {
    const draft = fenced[1].trim();
    const remainder = content.replace(fenced[0], '').trim();
    return { draft: draft || null, remainder };
  }

  // Heuristic: standalone short message starting with Hey/Hallo/Hi/Salut/Ciao/Merhaba
  const lines = content.trim().split(/\n+/);
  if (lines.length >= 1 && lines.length <= 12) {
    const first = lines[0]?.trim() ?? '';
    if (/^(hey|hallo|hi|salut|ciao|merhaba)\b/i.test(first) && content.length < 700) {
      // Only treat as draft if the whole reply looks like a message (no long markdown headers)
      if (!/^#{1,3}\s/m.test(content) && !/\*\*[^*]+\*\*/.test(content.slice(0, 40))) {
        return { draft: content.trim(), remainder: '' };
      }
    }
  }

  return { draft: null, remainder: content };
}
