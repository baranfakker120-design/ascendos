import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '@shared/i18n';
import type { ExternalTool } from '@shared/types/domain';
import { ONBOARDING_DETAIL, isOnboardingShareTool } from '@shared/lib/shareToolsDisplay';
import {
  attachScreenshot,
  canConfirmShareVerification,
  confirmShareVerification,
  fileToDataUrl,
  findVerifiedShareAction,
  getOrCreatePendingShareVerification,
  markShareCompleted,
  type ShareVerificationRecord,
} from '@shared/lib/shareVerification';
import { Button } from '@shared/ui/Button';

interface Props {
  open: boolean;
  tool: ExternalTool;
  contactId: string;
  contactName: string;
  /** True when this contact+action already has AP (pipeline or local verified). */
  alreadyAwarded?: boolean;
  onClose: () => void;
  /** Fired when a pending proof is created/updated (before AP). */
  onProofChange?: (record: ShareVerificationRecord) => void;
  /** Called only after status becomes verified — awards AP via existing pipeline. */
  onVerified: (tool: ExternalTool, record: ShareVerificationRecord) => void;
}

export function ShareVerificationSheet({
  open,
  tool,
  contactId,
  contactName,
  alreadyAwarded = false,
  onClose,
  onProofChange,
  onVerified,
}: Props) {
  const { t } = useI18n();
  const titleId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const confirmLock = useRef(false);
  const [record, setRecord] = useState<ShareVerificationRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = alreadyAwarded || Boolean(findVerifiedShareAction(contactId, tool.key));

  useEffect(() => {
    if (!open) return;
    confirmLock.current = false;
    setError(null);
    setBusy(false);

    if (alreadyAwarded || findVerifiedShareAction(contactId, tool.key)) {
      setRecord(findVerifiedShareAction(contactId, tool.key));
      return;
    }

    const created = getOrCreatePendingShareVerification({
      contactId,
      toolKey: tool.key,
      toolName: tool.name,
      shareUrl: tool.url,
      shareEventType: tool.share_event_type,
    });
    setRecord(created);
    if (created) onProofChange?.(created);
    // Intentionally omit onProofChange — parent may pass an inline callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contactId, tool.key, tool.name, tool.url, tool.share_event_type, alreadyAwarded]);

  if (!open) return null;

  const publish = (next: ShareVerificationRecord) => {
    setRecord(next);
    onProofChange?.(next);
  };

  const shareNative = async () => {
    if (blocked || busy) return;
    setError(null);
    setBusy(true);
    try {
      if (!record) return;
      if (!navigator.share) {
        setError(t('contacts.shareUnsupported'));
        return;
      }
      const firstName = contactName.split(' ')[0] ?? contactName;
      const text = t('contacts.shareTemplateFull', {
        firstName,
        toolName: tool.name,
        url: tool.url,
      });
      await navigator.share({ title: tool.name, text, url: tool.url });
      const next = markShareCompleted(record.id);
      if (next) publish(next);
    } catch {
      // Cancelled — no share_completed
    } finally {
      setBusy(false);
    }
  };

  const onPickScreenshot = async (file: File | null) => {
    if (!file || blocked || busy) return;
    if (file.size <= 0) {
      setError(t('contacts.screenshotEmpty'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (!record) return;
      const dataUrl = await fileToDataUrl(file);
      const next = attachScreenshot(record.id, dataUrl, file.name);
      if (!next) {
        setError(t('contacts.screenshotSaveFailed'));
        return;
      }
      // Remains pending — future AI may move to pending_review; never auto-verify.
      publish(next);
    } catch {
      setError(t('contacts.screenshotReadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (blocked || busy || confirmLock.current) return;
    if (!record || !canConfirmShareVerification(record)) return;
    if (findVerifiedShareAction(contactId, tool.key)) {
      setError(t('contacts.shareAlreadyConfirmed'));
      return;
    }
    confirmLock.current = true;
    setBusy(true);
    try {
      const next = confirmShareVerification(record.id);
      if (!next || next.status !== 'verified') {
        setError(t('contacts.shareAlreadyConfirmed'));
        confirmLock.current = false;
        return;
      }
      setRecord(next);
      onProofChange?.(next);
      onVerified(tool, next);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const waiting = record?.status === 'pending' || record?.status === 'pending_review';
  const canConfirm = !blocked && record ? canConfirmShareVerification(record) : false;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 border-0 bg-[rgb(17_18_20_/0.38)]"
        aria-label={t('common.close')}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[1] mx-auto w-full max-w-lg rounded-t-2xl border border-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-lg"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden />
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p id={titleId} className="text-lg font-bold tracking-tight">
              {blocked ? t('contacts.shareAlreadyConfirmed') : t('contacts.shareRequired')}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {tool.name} ·{' '}
              {blocked ? t('contacts.shareNoApAgain') : t('contacts.shareNoApWithout')}
            </p>
          </div>
          <button
            type="button"
            className="text-sm font-semibold text-accent-deep"
            onClick={onClose}
          >
            {t('common.close')}
          </button>
        </div>

        {isOnboardingShareTool(tool) ? (
          <p className="mb-3 text-sm leading-relaxed text-muted">{ONBOARDING_DETAIL}</p>
        ) : null}

        {blocked ? (
          <p className="rounded-xl border border-line bg-bg px-3 py-2 text-sm font-medium">
            {t('contacts.shareAlreadyConfirmed')}
          </p>
        ) : (
          <>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
              {t('contacts.proofCopy')}
            </p>

            {waiting ? (
              <p className="mt-3 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent-deep">
                {t('contacts.shareWaiting')}
              </p>
            ) : null}

            {record?.shareCompleted ? (
              <p className="mt-2 text-xs font-medium text-muted">{t('contacts.shareDone')}</p>
            ) : null}
            {record?.screenshotFileName ? (
              <p className="mt-1 text-xs font-medium text-muted">
                ✓ {t('contacts.screenshotNamed', { name: record.screenshotFileName })}
              </p>
            ) : null}
            {record?.screenshotDataUrl ? (
              <img
                src={record.screenshotDataUrl}
                alt={t('contacts.proofAlt')}
                className="mt-2 max-h-40 w-full rounded-xl border border-line object-contain"
              />
            ) : null}

            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

            <div className="mt-4 space-y-2">
              <Button disabled={busy} onClick={() => void shareNative()}>
                {busy ? t('contacts.pleaseWait') : t('contacts.shareNow', { name: tool.name })}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
                {t('contacts.shareUpload')}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => void onPickScreenshot(e.target.files?.[0] ?? null)}
              />
              <Button disabled={busy || !canConfirm} onClick={confirm}>
                {t('contacts.shareConfirm')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
