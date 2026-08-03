import { useEffect, useId, useRef, useState } from 'react';
import type { ExternalTool } from '@shared/types/domain';
import {
  attachScreenshot,
  canConfirmShareVerification,
  confirmShareVerification,
  fileToDataUrl,
  listPendingShareVerifications,
  markShareCompleted,
  type ShareVerificationRecord,
  upsertShareVerification,
} from '@shared/lib/shareVerification';
import { Button } from '@shared/ui/Button';

const PROOF_COPY =
  'Bitte sende einen Screenshot des geteilten Bildschirms oder Chats.\n\nNicht weil wir dir nicht vertrauen, sondern damit Ascent deine Aktivität korrekt dokumentieren kann.';

interface Props {
  open: boolean;
  tool: ExternalTool;
  contactId: string;
  contactName: string;
  onClose: () => void;
  /** Fired when a pending proof is created/updated (Before AP). */
  onProofChange?: (record: ShareVerificationRecord) => void;
  /** Called only after status becomes verified — awards AP via existing pipeline. */
  onVerified: (tool: ExternalTool, record: ShareVerificationRecord) => void;
}

export function ShareVerificationSheet({
  open,
  tool,
  contactId,
  contactName,
  onClose,
  onProofChange,
  onVerified,
}: Props) {
  const titleId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [record, setRecord] = useState<ShareVerificationRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const existing = listPendingShareVerifications(contactId).find((r) => r.toolKey === tool.key);
    if (existing) {
      setRecord(existing);
    } else {
      const created = upsertShareVerification({
        contactId,
        toolKey: tool.key,
        toolName: tool.name,
        shareUrl: tool.url,
        shareEventType: tool.share_event_type,
        status: 'pending',
        shareCompleted: false,
        screenshotDataUrl: null,
        screenshotFileName: null,
        channelHint: 'unknown',
      });
      setRecord(created);
      onProofChange?.(created);
    }
    setError(null);
    setBusy(false);
    // Intentionally omit onProofChange — parent may pass an inline callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contactId, tool.key, tool.name, tool.url, tool.share_event_type]);

  if (!open) return null;

  const publish = (next: ShareVerificationRecord) => {
    setRecord(next);
    onProofChange?.(next);
  };

  const ensureRecord = (): ShareVerificationRecord => {
    if (record) return record;
    const created = upsertShareVerification({
      contactId,
      toolKey: tool.key,
      toolName: tool.name,
      shareUrl: tool.url,
      shareEventType: tool.share_event_type,
      status: 'pending',
      shareCompleted: false,
      screenshotDataUrl: null,
      screenshotFileName: null,
      channelHint: 'unknown',
    });
    publish(created);
    return created;
  };

  const shareNative = async () => {
    setError(null);
    setBusy(true);
    const row = ensureRecord();
    const firstName = contactName.split(' ')[0] ?? contactName;
    const text = `Hallo ${firstName}, wie besprochen: ${tool.name} — ${tool.url}`;
    try {
      if (!navigator.share) {
        setError('Teilen wird auf diesem Gerät nicht unterstützt — bitte Screenshot hochladen.');
        return;
      }
      await navigator.share({ title: tool.name, text, url: tool.url });
      const next = markShareCompleted(row.id);
      if (next) publish(next);
    } catch {
      // Cancelled — no share_completed
    } finally {
      setBusy(false);
    }
  };

  const onPickScreenshot = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const row = ensureRecord();
      const dataUrl = await fileToDataUrl(file);
      const next = attachScreenshot(row.id, dataUrl, file.name);
      if (next) publish(next);
    } catch {
      setError('Screenshot konnte nicht gelesen werden.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (!record || !canConfirmShareVerification(record)) return;
    const next = confirmShareVerification(record.id);
    if (!next || next.status !== 'verified') return;
    setRecord(next);
    onProofChange?.(next);
    onVerified(tool, next);
    onClose();
  };

  const waiting = record?.status === 'pending';
  const canConfirm = record ? canConfirmShareVerification(record) : false;

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
              Nachweis erforderlich
            </p>
            <p className="mt-0.5 text-sm text-muted">{tool.name} · kein AP ohne Nachweis</p>
          </div>
          <button
            type="button"
            className="text-sm font-semibold text-accent-deep"
            onClick={onClose}
          >
            Schließen
          </button>
        </div>

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
            className="mt-2 max-h-40 w-full rounded-xl object-contain border border-line"
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
      </div>
    </div>
  );
}
