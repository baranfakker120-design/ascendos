import { resolveDisplayFrameKey } from '@shared/lib/frameAssets';
import { Button } from '@shared/ui/Button';
import { RankFrame } from '@shared/ui/RankFrame';
import { displayName, presenceLabel } from '../genealogyUtils';
import type { GenealogyNode } from '../types';

interface NodeDetailSheetProps {
  node: GenealogyNode;
  onCoach: (node: GenealogyNode) => void;
}

export function NodeDetailContent({ node, onCoach }: NodeDetailSheetProps) {
  const frameKey = resolveDisplayFrameKey({
    role: node.role,
    rankFrameKey: node.frameAsset,
    isBeraterDesMonats: node.isBeraterDesMonats,
  });
  const name = displayName(node);
  const digits = node.phone?.replace(/[^\d+]/g, '') ?? '';
  const wa = digits ? `https://wa.me/${digits.replace(/^\+/, '')}` : null;
  const tel = node.phone ? `tel:${node.phone}` : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <RankFrame frameKey={frameKey} src={node.avatarUrl} name={name} size="md" />
        <div className="min-w-0">
          <p className="truncate text-lg font-bold tracking-tight">{name}</p>
          <p className="text-sm font-semibold text-accent-deep">{node.rankLabel ?? 'Newcomer'}</p>
          <p className="text-xs text-muted">{presenceLabel(node)}</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-line/80 bg-white/50 px-3 py-2">
          <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted">AP</dt>
          <dd className="font-bold">{node.apTotal.toLocaleString('de-DE')}</dd>
        </div>
        <div className="rounded-xl border border-line/80 bg-white/50 px-3 py-2">
          <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
            Direkte
          </dt>
          <dd className="font-bold">{node.directCount}</dd>
        </div>
        <div className="rounded-xl border border-line/80 bg-white/50 px-3 py-2">
          <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted">Team</dt>
          <dd className="font-bold">{node.teamCount}</dd>
        </div>
        <div className="rounded-xl border border-line/80 bg-white/50 px-3 py-2">
          <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
            Aktivität
          </dt>
          <dd className="font-bold">{presenceLabel(node)}</dd>
        </div>
      </dl>

      {node.phone ? (
        <p className="text-sm text-muted">
          Telefon:{' '}
          <a className="font-semibold text-ink underline-offset-2 hover:underline" href={tel!}>
            {node.phone}
          </a>
        </p>
      ) : (
        <p className="text-sm text-muted">Keine Telefonnummer hinterlegt.</p>
      )}

      <div className="grid gap-2">
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-line bg-white/80 px-4 text-sm font-semibold"
          >
            WhatsApp
          </a>
        ) : null}
        {tel ? (
          <a
            href={tel}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-line bg-white/80 px-4 text-sm font-semibold"
          >
            Anrufen
          </a>
        ) : null}
        <Button type="button" onClick={() => onCoach(node)}>
          Coach starten
        </Button>
      </div>
    </div>
  );
}
