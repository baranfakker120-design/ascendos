import { useI18n } from '@shared/i18n';
import { resolveDisplayFrameKey } from '@shared/lib/frameAssets';
import { RankFrame } from '@shared/ui/RankFrame';
import { displayName, isNewPartner, presenceLabel } from '../genealogyUtils';
import type { GenealogyNode } from '../types';

interface GenealogyListProps {
  nodes: GenealogyNode[];
  visibleIds: Set<string>;
  selectedId: string | null;
  onSelect: (node: GenealogyNode) => void;
}

export function GenealogyList({ nodes, visibleIds, selectedId, onSelect }: GenealogyListProps) {
  const { t } = useI18n();
  const rows = nodes
    .filter((n) => visibleIds.has(n.membershipId))
    .sort((a, b) => a.depth - b.depth || a.firstName.localeCompare(b.firstName));

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-line bg-white/60 px-4 py-8 text-center text-sm text-muted">
        {t('team.empty')}
      </p>
    );
  }

  return (
    <ul className="space-y-2" aria-label={t('team.listAria')}>
      {rows.map((node) => {
        const frameKey = resolveDisplayFrameKey({
          role: node.role,
          rankFrameKey: node.frameAsset,
          isBeraterDesMonats: node.isBeraterDesMonats,
        });
        return (
          <li key={node.membershipId}>
            <button
              type="button"
              onClick={() => onSelect(node)}
              className={[
                'flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition',
                'bg-white/70 backdrop-blur border-line shadow-[0_1px_0_rgb(255_255_255/0.8)_inset]',
                selectedId === node.membershipId ? 'border-accent ring-1 ring-accent/30' : '',
              ].join(' ')}
              style={{ paddingLeft: `${0.75 + Math.min(node.depth, 6) * 0.55}rem` }}
            >
              <RankFrame
                frameKey={frameKey}
                src={node.avatarUrl}
                name={displayName(node)}
                size="xs"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold">{displayName(node)}</span>
                  {isNewPartner(node) ? (
                    <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[0.58rem] font-bold tracking-wide text-accent-deep">
                      {t('team.badgeNew')}
                    </span>
                  ) : null}
                </span>
                <span className="block text-xs text-muted">
                  {node.rankLabel ?? t('team.newcomer')} · {node.apTotal} AP ·{' '}
                  {presenceLabel(node, Date.now(), t)}
                </span>
              </span>
              <span className="shrink-0 text-right text-xs font-semibold text-muted">
                <span className="block">
                  {node.directCount} {t('team.directShort')}
                </span>
                <span className="block">
                  {node.teamCount} {t('nav.team')}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
