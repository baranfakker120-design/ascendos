import { useState } from 'react';
import { scorePipelineEvent } from '@shared/lib/apScoring';
import type { ExternalTool } from '@shared/types/domain';
import { ApRewardSticker } from '@shared/ui/ApRewardSticker';

interface Props {
  tools: ExternalTool[];
  contactName: string;
  onShared: (tool: ExternalTool) => void;
}

/**
 * Teilt die Links der externen Tools und zeigt den AP-Reward.
 */
export function ShareTools({ tools, contactName, onShared }: Props) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const share = async (tool: ExternalTool) => {
    const firstName = contactName.split(' ')[0];
    const text = `Hallo ${firstName}, wie besprochen: ${tool.name} — ${tool.url}`;
    let shared = false;
    if (navigator.share) {
      try {
        await navigator.share({ title: tool.name, text, url: tool.url });
        shared = true;
      } catch {
        return;
      }
    } else {
      await navigator.clipboard.writeText(text);
      setCopiedKey(tool.key);
      setTimeout(() => setCopiedKey(null), 2500);
      shared = true;
    }
    if (shared) onShared(tool);
  };

  if (tools.length === 0) return null;

  return (
    <div className="space-y-2">
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => void share(tool)}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left transition-transform hover:bg-bg active:scale-[0.99]"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium">{tool.name} teilen</span>
            {tool.description ? (
              <span className="block text-xs text-muted">{tool.description}</span>
            ) : null}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <ApRewardSticker
              ap={scorePipelineEvent(tool.share_event_type)}
              size="sm"
              animate={false}
            />
            <span className="text-xs font-medium text-primary">
              {copiedKey === tool.key ? '✓' : '↗'}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
