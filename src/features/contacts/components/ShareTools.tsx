import { useState } from 'react';
import { scorePipelineEvent } from '@shared/lib/apScoring';
import { displayShareTool, isProofRequiredShareTool } from '@shared/lib/shareToolsDisplay';
import type { ShareVerificationRecord } from '@shared/lib/shareVerification';
import type { ExternalTool } from '@shared/types/domain';
import { ApRewardSticker } from '@shared/ui/ApRewardSticker';
import { Button } from '@shared/ui/Button';
import { ShareVerificationSheet } from './ShareVerificationSheet';

interface Props {
  tools: ExternalTool[];
  contactId: string;
  contactName: string;
  /** Invoked only after verification — logs pipeline event / awards AP. */
  onShared: (tool: ExternalTool, proof?: ShareVerificationRecord) => void;
  /** Pending proof created/updated before AP is awarded. */
  onProofChange?: (proof: ShareVerificationRecord) => void;
  pendingToolKeys?: Set<string>;
}

/**
 * Teilt externe Tools. Onboarding + Firmenpräsentation benötigen Nachweis
 * bevor AP freigegeben wird.
 */
export function ShareTools({
  tools,
  contactId,
  contactName,
  onShared,
  onProofChange,
  pendingToolKeys,
}: Props) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [verifyTool, setVerifyTool] = useState<ExternalTool | null>(null);

  const shareSimple = async (tool: ExternalTool) => {
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
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        return;
      }
      setCopiedKey(tool.key);
      setTimeout(() => setCopiedKey(null), 2500);
      shared = true;
    }
    if (shared) onShared(tool);
  };

  const onClick = (raw: ExternalTool) => {
    const tool = displayShareTool(raw);
    if (isProofRequiredShareTool(tool)) {
      setVerifyTool(tool);
      return;
    }
    void shareSimple(tool);
  };

  if (tools.length === 0) return null;

  const ordered = [...tools].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-2">
      {ordered.map((raw) => {
        const tool = displayShareTool(raw);
        const waiting = pendingToolKeys?.has(tool.key);
        return (
          <Button
            key={tool.id}
            variant="secondary"
            onClick={() => onClick(raw)}
            className="h-auto min-h-12 justify-between py-3 text-left [&_.ui-btn__label]:w-full [&_.ui-btn__label]:justify-between"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium">{tool.name} teilen</span>
              {tool.description ? (
                <span className="block text-xs font-normal text-muted">{tool.description}</span>
              ) : null}
              {waiting ? (
                <span className="mt-1 block text-xs font-semibold text-accent-deep">
                  Warte auf Nachweis
                </span>
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
          </Button>
        );
      })}

      {verifyTool ? (
        <ShareVerificationSheet
          open
          tool={verifyTool}
          contactId={contactId}
          contactName={contactName}
          onClose={() => setVerifyTool(null)}
          onProofChange={onProofChange}
          onVerified={(tool, proof) => onShared(tool, proof)}
        />
      ) : null}
    </div>
  );
}
