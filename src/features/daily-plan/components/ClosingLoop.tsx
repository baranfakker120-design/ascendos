import { useMemo, useState } from 'react';
import { useI18n } from '@shared/i18n';
import type { DailyPlanItem } from '@shared/types/domain';
import { Button } from '@shared/ui/Button';
import {
  canClaimDone,
  deriveCloseOutcome,
  pickPriorityMission,
  type DayCloseJournal,
  type DayCloseOutcome,
  type DayCloseRecord,
  type DayCloseSource,
  type DayOpenRecord,
} from '../dayMemory';
import './closingLoop.css';

type Step = 1 | 2 | 3 | 4;

interface Props {
  items: DailyPlanItem[];
  openRecord: DayOpenRecord | null;
  busy?: boolean;
  sourceHint: DayCloseSource;
  onSave: (journal: DayCloseJournal) => void;
  onKeepWorking?: () => void;
}

/**
 * Sprint 5 · Closing Loop — executive day journal.
 * Constitution v2: one question per step, evidence before “done”, no gamification.
 */
export function ClosingLoop({
  items,
  openRecord,
  busy = false,
  sourceHint,
  onSave,
  onKeepWorking,
}: Props) {
  const { t } = useI18n();
  const priority =
    (openRecord?.priorityItemId ? items.find((i) => i.id === openRecord.priorityItemId) : null) ??
    pickPriorityMission(items);

  const evidenceOk = canClaimDone(items, priority?.id ?? openRecord?.priorityItemId);
  const suggested = deriveCloseOutcome(items);

  const [step, setStep] = useState<Step>(1);
  const [priorityWasMain, setPriorityWasMain] = useState(true);
  const [outcome, setOutcome] = useState<DayCloseOutcome>(
    suggested === 'done' && evidenceOk ? 'done' : suggested === 'missed' ? 'missed' : 'partial'
  );
  const [reason, setReason] = useState('');
  const [tomorrowNote, setTomorrowNote] = useState('');
  const [doneBlocked, setDoneBlocked] = useState(false);

  const priorityTitle =
    openRecord?.priorityTitle ?? priority?.title ?? t('today.closingNoPriority');

  const reasonChips = useMemo(
    () => [
      t('today.closingReasonMoved'),
      t('today.closingReasonNoReply'),
      t('today.closingReasonSuccess'),
      t('today.closingReasonMissed'),
    ],
    [t]
  );

  const selectOutcome = (next: DayCloseOutcome) => {
    if (next === 'done' && !evidenceOk) {
      setDoneBlocked(true);
      setOutcome(items.some((i) => i.status === 'done') ? 'partial' : 'missed');
      return;
    }
    setDoneBlocked(false);
    setOutcome(next);
  };

  const save = () => {
    if (outcome === 'done' && !evidenceOk) {
      setDoneBlocked(true);
      return;
    }
    onSave({
      priorityWasMain,
      outcome,
      reason: reason.trim() || null,
      tomorrowNote: tomorrowNote.trim() || null,
    });
  };

  return (
    <div className="closing-loop space-y-5" data-step={step}>
      <header className="closing-loop__hero">
        <p className="closing-loop__eyebrow">{t('today.closingEyebrow')}</p>
        <h1 className="closing-loop__title">{t('today.closingTitle')}</h1>
        <p className="closing-loop__lede">{t('today.closingLede')}</p>
        <p className="closing-loop__steps" aria-hidden>
          {step} / 4
        </p>
      </header>

      {step === 1 ? (
        <section className="closing-loop__panel" aria-label={t('today.closingPriorityLabel')}>
          <p className="closing-loop__label">{t('today.closingPriorityLabel')}</p>
          <p className="closing-loop__priority">{priorityTitle}</p>
          <p className="closing-loop__question">{t('today.closingPriorityAsk')}</p>
          <div className="closing-loop__choices">
            <button
              type="button"
              className={`closing-loop__choice${priorityWasMain ? ' is-on' : ''}`}
              onClick={() => setPriorityWasMain(true)}
            >
              {t('today.closingYes')}
            </button>
            <button
              type="button"
              className={`closing-loop__choice${priorityWasMain ? '' : ' is-on'}`}
              onClick={() => setPriorityWasMain(false)}
            >
              {t('today.closingNo')}
            </button>
          </div>
          <Button onClick={() => setStep(2)}>{t('today.closingNext')}</Button>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="closing-loop__panel" aria-label={t('today.closingStatusLabel')}>
          <p className="closing-loop__label">{t('today.closingStatusLabel')}</p>
          <p className="closing-loop__question">{t('today.closingStatusAsk')}</p>
          <div className="closing-loop__radios" role="radiogroup">
            {(
              [
                ['done', t('today.closingStatusDone')],
                ['partial', t('today.closingStatusPartial')],
                ['missed', t('today.closingStatusMissed')],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={outcome === value}
                className={`closing-loop__radio${outcome === value ? ' is-on' : ''}${
                  value === 'done' && !evidenceOk ? ' is-disabled' : ''
                }`}
                onClick={() => selectOutcome(value)}
              >
                <span className="closing-loop__radio-mark" aria-hidden />
                <span>{label}</span>
              </button>
            ))}
          </div>
          {doneBlocked || (outcome === 'done' && !evidenceOk) ? (
            <p className="closing-loop__warn">{t('today.closingNeedEvidence')}</p>
          ) : null}
          {!evidenceOk ? (
            <p className="closing-loop__hint">{t('today.closingEvidenceHint')}</p>
          ) : (
            <p className="closing-loop__hint">{t('today.closingEvidenceOk')}</p>
          )}
          <div className="closing-loop__nav">
            <Button variant="ghost" onClick={() => setStep(1)}>
              {t('common.back')}
            </Button>
            <Button onClick={() => setStep(3)}>{t('today.closingNext')}</Button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="closing-loop__panel" aria-label={t('today.closingReasonLabel')}>
          <p className="closing-loop__label">{t('today.closingReasonLabel')}</p>
          <p className="closing-loop__question">{t('today.closingReasonAsk')}</p>
          <div className="closing-loop__chips">
            {reasonChips.map((chip) => (
              <button
                key={chip}
                type="button"
                className={`closing-loop__chip${reason === chip ? ' is-on' : ''}`}
                onClick={() => setReason(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
          <label className="closing-loop__field">
            <span className="sr-only">{t('today.closingReasonLabel')}</span>
            <textarea
              className="closing-loop__textarea"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('today.closingReasonPlaceholder')}
            />
          </label>
          <div className="closing-loop__nav">
            <Button variant="ghost" onClick={() => setStep(2)}>
              {t('common.back')}
            </Button>
            <Button onClick={() => setStep(4)}>{t('today.closingNext')}</Button>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="closing-loop__panel" aria-label={t('today.closingTomorrowLabel')}>
          <p className="closing-loop__label">{t('today.closingTomorrowLabel')}</p>
          <p className="closing-loop__question">{t('today.closingTomorrowAsk')}</p>
          <label className="closing-loop__field">
            <span className="sr-only">{t('today.closingTomorrowLabel')}</span>
            <textarea
              className="closing-loop__textarea"
              rows={3}
              value={tomorrowNote}
              onChange={(e) => setTomorrowNote(e.target.value)}
              placeholder={t('today.closingTomorrowPlaceholder')}
            />
          </label>
          <div className="closing-loop__nav">
            <Button variant="ghost" onClick={() => setStep(3)}>
              {t('common.back')}
            </Button>
            <Button onClick={save} disabled={busy} aria-busy={busy}>
              {busy ? t('today.closingBusy') : t('today.closingSave')}
            </Button>
          </div>
          {sourceHint === 'manual_close' || sourceHint === 'evening_reminder' ? (
            onKeepWorking ? (
              <Button variant="ghost" disabled={busy} onClick={onKeepWorking}>
                {t('today.closingKeepWorking')}
              </Button>
            ) : null
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export function ClosedDay({ record }: { record: DayCloseRecord }) {
  const { t } = useI18n();
  return (
    <div className="closing-loop closing-loop--closed space-y-5">
      <header className="closing-loop__hero">
        <p className="closing-loop__eyebrow">{t('today.closedEyebrow')}</p>
        <h1 className="closing-loop__title">{t('today.closedConfirmTitle')}</h1>
        <p className="closing-loop__lede">{t('today.closedConfirmBody')}</p>
      </header>

      <section className="closing-loop__panel space-y-3">
        {record.priorityTitle ? (
          <div>
            <p className="closing-loop__label">{t('today.closingPriorityLabel')}</p>
            <p className="text-sm font-medium">{record.priorityTitle}</p>
          </div>
        ) : null}
        <div>
          <p className="closing-loop__label">{t('today.closingStatusLabel')}</p>
          <p className="text-sm">
            {record.outcome === 'done'
              ? t('today.closingStatusDone')
              : record.outcome === 'partial'
                ? t('today.closingStatusPartial')
                : t('today.closingStatusMissed')}
          </p>
        </div>
        {record.tomorrowNote || record.tomorrowSeed.length > 0 ? (
          <div>
            <p className="closing-loop__label">{t('today.closedTomorrow')}</p>
            <ul className="mt-1.5 space-y-1">
              {(record.tomorrowNote ? [record.tomorrowNote] : record.tomorrowSeed).map((line) => (
                <li key={line} className="text-sm text-muted">
                  → {line}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted">{t('today.closedClean')}</p>
        )}
      </section>
    </div>
  );
}

/** Calm evening nudge — not a celebration. */
export function EveningCloseReminder({ onEndDay }: { onEndDay: () => void }) {
  const { t } = useI18n();
  return (
    <aside className="closing-loop__reminder" role="note">
      <div>
        <p className="closing-loop__label">{t('today.closingReminderEyebrow')}</p>
        <p className="text-sm font-medium">{t('today.closingReminderBody')}</p>
      </div>
      <Button size="sm" fullWidth={false} onClick={onEndDay}>
        {t('today.endWorkday')}
      </Button>
    </aside>
  );
}
