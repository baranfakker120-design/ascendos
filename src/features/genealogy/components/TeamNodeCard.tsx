import { useI18n } from '@shared/i18n';
import { resolveDisplayFrameKey } from '@shared/lib/frameAssets';
import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CoachPersonInsightBubble,
  buildPersonInsight,
  mapGenealogyNodeToPartner,
} from '@features/coach/intelligence';
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
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const frameKey = resolveDisplayFrameKey({
    role: node.role,
    rankFrameKey: node.frameAsset,
    isBeraterDesMonats: node.isBeraterDesMonats,
  });
  const online = isOnline(node);
  const isNew = isNewPartner(node);
  const gold = node.isBeraterDesMonats;
  const coachInsight = useMemo(
    () => buildPersonInsight(mapGenealogyNodeToPartner(node), new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute when node identity/metrics change
    [
      node.membershipId,
      node.apTotal,
      node.icpMonth,
      node.streakDays,
      node.lastAppOpenedAt,
      node.directCount,
      node.joinedAt,
      node.firstName,
      node.lastName,
    ]
  );

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
      aria-label={`${displayName(node)}, ${node.rankLabel ?? t('team.rankFallback')}${editable ? '' : `, ${t('team.viewOnly')}`}`}
    >
      <div className="team-node__glow" aria-hidden />
      <div
        className="team-node__coach"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <CoachPersonInsightBubble
          insight={coachInsight}
          onAsk={() => {
            const name = displayName(node);
            navigate(
              `/coach?partner=${encodeURIComponent(name)}&mid=${encodeURIComponent(node.membershipId)}`
            );
          }}
        />
      </div>
      <div className="team-node__head">
        <div
          className={['team-node__avatar-wrap', editable ? 'is-editable' : 'is-readonly'].join(' ')}
        >
          <span className="team-node__aura" aria-hidden />
          <RankFrame frameKey={frameKey} src={node.avatarUrl} name={displayName(node)} size="sm" />
          <span
            className={['team-node__presence', online ? 'is-on' : 'is-off'].join(' ')}
            title={presenceLabel(node, Date.now(), t)}
          />
          {node.messageBadge > 0 ? (
            <span
              className="team-node__msg"
              aria-label={t('team.messages', { count: node.messageBadge })}
            >
              {node.messageBadge > 9 ? '9+' : node.messageBadge}
            </span>
          ) : null}
        </div>
        {isNew ? <span className="team-node__badge">{t('team.badgeNew')}</span> : null}
        {node.isFavorite ? <span className="team-node__pin">★</span> : null}
      </div>

      <h3 className="team-node__name">{displayName(node)}</h3>
      <p className="team-node__rank">{node.rankLabel ?? t('team.newcomer')}</p>

      <dl className="team-node__stats">
        <div>
          <dt>AP</dt>
          <dd>{node.apTotal.toLocaleString(locale)}</dd>
        </div>
        <div>
          <dt>ICP</dt>
          <dd>{node.icpMonth.toLocaleString(locale)}</dd>
        </div>
        <div>
          <dt>{t('team.directShort')}</dt>
          <dd>{node.directCount}</dd>
        </div>
      </dl>

      <p className="team-node__activity">
        {presenceLabel(node, Date.now(), t)}
        {node.streakDays > 0 ? ` · ${node.streakDays}d` : ''}
      </p>
      {node.sponsorName ? (
        <p className="team-node__sponsor">
          {t('team.sponsor')} {node.sponsorName}
        </p>
      ) : null}

      {hasChildren ? (
        <button
          type="button"
          className="team-node__collapse"
          aria-expanded={!collapsed}
          aria-label={collapsed ? t('team.expandBranch') : t('team.collapseBranch')}
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
