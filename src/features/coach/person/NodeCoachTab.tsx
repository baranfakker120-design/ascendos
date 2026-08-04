import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@shared/i18n';
import { Button } from '@shared/ui/Button';
import { Input } from '@shared/ui/Input';
import {
  buildPersonInsight,
  mapGenealogyNodeToPartner,
  type PersonCoachInsight,
} from '@features/coach/intelligence';
import { writePendingSeed } from '@features/coach/workspace';
import type { GenealogyNode } from '@features/genealogy/types';
import { displayName } from '@features/genealogy/genealogyUtils';
import { WhatsAppMessageCard } from './WhatsAppMessageCard';
import './person-coach-conversation.css';

interface Props {
  node: GenealogyNode;
  /** Precomputed insight when available from org intelligence. */
  insight?: PersonCoachInsight | null;
  editable?: boolean;
}

/**
 * Coach overview inside the member sheet — analysis stays visible;
 * asking navigates to the full-screen person conversation (no overlay).
 */
export function NodeCoachTab({ node, insight, editable = true }: Props) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [ask, setAsk] = useState('');
  const name = displayName(node);
  const first = name.split(/\s+/)[0] || name;

  const localInsight = useMemo(
    () => insight ?? buildPersonInsight(mapGenealogyNodeToPartner(node), new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      insight,
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

  const openConversation = (seed?: string) => {
    if (seed?.trim()) writePendingSeed(seed.trim());
    void navigate(`/coach/person/${encodeURIComponent(node.membershipId)}`);
  };

  return (
    <div className="node-coach-tab">
      <section className="node-coach-tab__analysis" aria-label={t('coach.personAnalysis', { name })}>
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">
          {t('coach.analysis', { name })}
        </p>
        <p className="mt-1 text-sm font-semibold text-ink">{localInsight.currentSituation}</p>

        <p className="mt-3 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">
          {t('coach.personNext')}
        </p>
        <p className="mt-0.5 text-sm font-medium text-ink">{localInsight.nextBestAction}</p>
        {localInsight.nextBestActionWhy ? (
          <p className="mt-0.5 text-xs text-muted">
            {t('coach.whyPrefix', { reason: localInsight.nextBestActionWhy })}
          </p>
        ) : null}

        {localInsight.possibleObjection ? (
          <p className="mt-2 text-xs text-muted">
            {t('coach.possibleObjection', { text: localInsight.possibleObjection })}
          </p>
        ) : null}

        <p className="mt-2 text-xs text-muted">
          {t('coach.probs', {
            reg: localInsight.probabilityOfRegistration,
            inactive: localInsight.probabilityOfInactivity,
            risk: localInsight.riskScore,
          })}
        </p>
      </section>

      {localInsight.suggestedWhatsApp ? (
        <WhatsAppMessageCard
          text={localInsight.suggestedWhatsApp}
          onEdit={(text) => {
            writePendingSeed(
              t('coach.improveDraft', { name: first, draft: text })
            );
            void navigate(`/coach/person/${encodeURIComponent(node.membershipId)}`);
          }}
        />
      ) : null}

      <div className="node-coach-tab__ask">
        <Input
          label={t('coach.inputLabel')}
          hideLabel
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder={t('team.coachAskPlaceholder', { name: first })}
          disabled={!editable}
          autoComplete="off"
          enterKeyHint="send"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!editable || !ask.trim()) return;
              openConversation(ask);
            }
          }}
        />
        <Button
          type="button"
          disabled={!editable || !ask.trim()}
          onClick={() => openConversation(ask)}
        >
          {t('team.askCoach')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!editable}
          onClick={() => openConversation()}
        >
          {t('team.openCoachConversation')}
        </Button>
      </div>
    </div>
  );
}
