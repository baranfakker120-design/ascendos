import { useState } from 'react';
import type { ExternalTool } from '@shared/types/domain';

interface Props {
  tools: ExternalTool[];
  contactName: string;
  onShared: (tool: ExternalTool) => void;
}

/**
 * Teilt die Links der externen Tools (Generation 1) und dokumentiert
 * das Senden als Pipeline-Event. Nutzt den nativen Share-Dialog (PWA),
 * Fallback: Link in die Zwischenablage.
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
        return; // Nutzer hat den Dialog abgebrochen -> kein Event
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
          className="flex w-full items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 text-left transition-colors hover:bg-bg"
        >
          <span>
            <span className="block text-sm font-medium">{tool.name} teilen</span>
            {tool.description ? (
              <span className="block text-xs text-muted">{tool.description}</span>
            ) : null}
          </span>
          <span className="text-xs font-medium text-primary">
            {copiedKey === tool.key ? 'Link kopiert ✓' : '↗'}
          </span>
        </button>
      ))}
    </div>
  );
}
