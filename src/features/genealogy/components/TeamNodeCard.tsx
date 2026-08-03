import { resolveDisplayFrameKey } from '@shared/lib/frameAssets';
import type { CSSProperties } from 'react';
import { RankFrame } from '@shared/ui/RankFrame';
import { displayName, isNewPartner, isOnline, presenceLabel } from '../genealogyUtils';
import type { GenealogyNode } from '../types';
import './team-node.css';

interface TeamNodeCardProps {
  node: GenealogyNode;
  selected?: boolean;
  collapsed?: boolean;
  hasChildren?: boolean;
  /** Self + descendants of the logged-in member. */
  editable?: boolean;
  onSelect: (node: GenealogyNode) => void;
  onToggleCollapse?: (node: GenealogyNode) => void;
  style?: CSSProperties;
}

export function TeamNodeCard({
  node,
  selected,
  collapsed,
  hasChildren,
  editable = true,
  onSelect,
  onToggleCollapse,
  style,
}: TeamNodeCardProps) {
  const frameKey = resolveDisplayFrameKey({
    role: node.role,
    rankFrameKey: node.frameAsset,
    isBeraterDesMonats: node.isBeraterDesMonats,
  });
  const online = isOnline(node);
  const isNew = isNewPartner(node);
  const gold = node.isBeraterDesMonats;

  return (
    <article
      className={[
        'team-node',
        selected ? 'team-node--selected' : '',
        gold ? 'team-node--gold' : '',
        online ? 'team-node--online' : '',
        node.isFavorite ? 'team-node--fav' : '',
        editable ? 'team-node--editable' : 'team-node--readonly',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      onClick={() => onSelect(node)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(node);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${displayName(node)}, ${node.rankLabel ?? 'Rang'}${editable ? '' : ', nur Ansicht'}`}
    >
      <div className="team-node__glow" aria-hidden />
      <div className="team-node__head">
        <div
          className={['team-node__avatar-wrap', editable ? 'is-editable' : 'is-readonly'].join(' ')}
        >
          <span className="team-node__aura" aria-hidden />
          <RankFrame frameKey={frameKey} src={node.avatarUrl} name={displayName(node)} size="sm" />
          <span
            className={['team-node__presence', online ? 'is-on' : 'is-off'].join(' ')}
            title={presenceLabel(node)}
          />
          {node.messageBadge > 0 ? (
            <span className="team-node__msg" aria-label={`${node.messageBadge} Nachrichten`}>
              {node.messageBadge > 9 ? '9+' : node.messageBadge}
            </span>
          ) : null}
        </div>
        {isNew ? <span className="team-node__badge">NEW</span> : null}
        {node.isFavorite ? <span className="team-node__pin">★</span> : null}
      </div>

      <h3 className="team-node__name">{displayName(node)}</h3>
      <p className="team-node__rank">{node.rankLabel ?? 'Newcomer'}</p>

      <dl className="team-node__stats">
        <div>
          <dt>AP</dt>
          <dd>{node.apTotal.toLocaleString('de-DE')}</dd>
        </div>
        <div>
          <dt>ICP</dt>
          <dd>{node.icpMonth.toLocaleString('de-DE')}</dd>
        </div>
        <div>
          <dt>Direkt</dt>
          <dd>{node.directCount}</dd>
        </div>
      </dl>

      <p className="team-node__activity">
        {presenceLabel(node)}
        {node.streakDays > 0 ? ` · ${node.streakDays}d` : ''}
      </p>
      {node.sponsorName ? <p className="team-node__sponsor">Sponsor: {node.sponsorName}</p> : null}

      {hasChildren ? (
        <button
          type="button"
          className="team-node__collapse"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Zweig öffnen' : 'Zweig schließen'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse?.(node);
          }}
        >
          {collapsed ? `+ ${node.directCount}` : '−'}
        </button>
      ) : null}
    </article>
  );
}
