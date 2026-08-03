import { useEffect, useId, useRef, useState } from 'react';
import type { ExternalTool } from '@shared/types/domain';
import { ONBOARDING_DETAIL, isOnboardingShareTool } from '@shared/lib/shareToolsDisplay';
import {
  ALREADY_CONFIRMED_MESSAGE,
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

const PROOF_COPY =
  'Bitte sende einen Screenshot des geteilten Bildschirms oder Chats.\n\nNicht weil wir dir nicht vertrauen, sondern damit Ascent deine Aktivität korrekt dokumentieren kann.';

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
        setError('Teilen wird auf diesem Gerät nicht unterstützt — bitte Screenshot hochladen.');
        return;
      }
      const firstName = contactName.split(' ')[0] ?? contactName;
      const text = `Hallo ${firstName}, wie besprochen: ${tool.name} — ${tool.url}`;
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
      setError('Screenshot ist leer — bitte erneut hochladen.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (!record) return;
      const dataUrl = await fileToDataUrl(file);
      const next = attachScreenshot(record.id, dataUrl, file.name);
      if (!next) {
        setError('Screenshot konnte nicht gespeichert werden.');
        return;
      }
      // Remains pending — future AI may move to pending_review; never auto-verify.
      publish(next);
    } catch {
      setError('Screenshot konnte nicht gelesen werden.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (blocked || busy || confirmLock.current) return;
    if (!record || !canConfirmShareVerification(record)) return;
    if (findVerifiedShareAction(contactId, tool.key)) {
      setError(ALREADY_CONFIRMED_MESSAGE);
      return;
    }
    confirmLock.current = true;
    setBusy(true);
    try {
      const next = confirmShareVerification(record.id);
      if (!next || next.status !== 'verified') {
        setError(ALREADY_CONFIRMED_MESSAGE);
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
        aria-label="Schließen"
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
              {blocked ? ALREADY_CONFIRMED_MESSAGE : 'Nachweis erforderlich'}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {tool.name} · {blocked ? 'kein erneutes AP' : 'kein AP ohne Nachweis'}
            </p>
          </div>
          <button
            type="button"
            className="text-sm font-semibold text-accent-deep"
            onClick={onClose}
          >
            Schließen
          </button>
        </div>

        {isOnboardingShareTool(tool) ? (
          <p className="mb-3 text-sm leading-relaxed text-muted">{ONBOARDING_DETAIL}</p>
        ) : null}

        {blocked ? (
          <p className="rounded-xl border border-line bg-bg px-3 py-2 text-sm font-medium">
            {ALREADY_CONFIRMED_MESSAGE}
          </p>
        ) : (
          <>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{PROOF_COPY}</p>

            {waiting ? (
              <p className="mt-3 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent-deep">
                Warte auf Nachweis
              </p>
            ) : null}

            {record?.shareCompleted ? (
              <p className="mt-2 text-xs font-medium text-muted">✓ Teilen abgeschlossen</p>
            ) : null}
            {record?.screenshotFileName ? (
              <p className="mt-1 text-xs font-medium text-muted">
                ✓ Screenshot: {record.screenshotFileName}
              </p>
            ) : null}
            {record?.screenshotDataUrl ? (
              <img
                src={record.screenshotDataUrl}
                alt="Hochgeladener Nachweis"
                className="mt-2 max-h-40 w-full rounded-xl border border-line object-contain"
              />
            ) : null}

            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

            <div className="mt-4 space-y-2">
              <Button disabled={busy} onClick={() => void shareNative()}>
                {busy ? 'Bitte warten …' : `${tool.name} jetzt teilen`}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
                Screenshot hochladen
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
                Nachweis bestätigen · AP freigeben
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
