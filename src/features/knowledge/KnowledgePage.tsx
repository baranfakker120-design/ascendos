import { useCallback, useRef, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@shared/ui/Card';
import { DocumentList } from './components/DocumentList';
import { DropZone } from './components/DropZone';
import { UploadQueue, type UploadJob } from './components/UploadQueue';
import { ExtractError, extractText } from './extractText';
import {
  CATEGORIES,
  SOURCE_TYPES,
  ingestChunk,
  splitForRequests,
  type CategoryValue,
  type SourceTypeValue,
} from './knowledgeApi';

/** Dateiname ohne Endung als Vorschlag für den Dokumenttitel. */
function titleFromFile(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 200);
}

let jobCounter = 0;

export function KnowledgePage() {
  const qc = useQueryClient();
  const [category, setCategory] = useState<CategoryValue>('produkte');
  const [sourceType, setSourceType] = useState<SourceTypeValue>('document');
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [busy, setBusy] = useState(false);
  // Ref statt State: der Wert wird innerhalb der Verarbeitungsschleife
  // gelesen, die den State-Snapshot ihres Renders sonst festhält.
  const runningRef = useRef(false);

  const patch = (id: string, changes: Partial<UploadJob>) =>
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...changes } : j)));

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setBusy(true);

      const queued: UploadJob[] = files.map((file) => ({
        id: `job-${++jobCounter}`,
        fileName: file.name,
        size: file.size,
        phase: 'waiting',
        parts: 0,
        partsDone: 0,
        chunks: 0,
      }));
      setJobs((prev) => [...prev, ...queued]);

      // STRENG SEQUENZIELL, absichtlich. gemini-embedding-001 nimmt einen
      // Text pro Request, und das kostenlose Kontingent liegt bei rund 100
      // Anfragen pro Minute. Paralleles Hochladen würde zuverlässig in
      // 429er laufen und halbe Dokumente hinterlassen.
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const job = queued[i];

        try {
          patch(job.id, { phase: 'reading' });
          const { text, pages } = await extractText(file);

          const parts = splitForRequests(text);
          patch(job.id, { phase: 'embedding', parts: parts.length, pages });

          const baseTitle = titleFromFile(file.name);
          let chunkTotal = 0;

          for (let p = 0; p < parts.length; p++) {
            const title =
              parts.length > 1 ? `${baseTitle} (Teil ${p + 1}/${parts.length})` : baseTitle;
            const res = await ingestChunk({
              title,
              category,
              sourceType,
              content: parts[p],
            });
            chunkTotal += res.chunks;
            patch(job.id, { partsDone: p + 1, chunks: chunkTotal });
          }

          patch(job.id, { phase: 'done', chunks: chunkTotal });
        } catch (e) {
          const message =
            e instanceof ExtractError
              ? e.message
              : e instanceof Error
                ? e.message
                : 'Unbekannter Fehler.';
          patch(job.id, { phase: 'error', error: message });
        }
      }

      // Liste einmal am Ende neu laden statt nach jeder Datei.
      void qc.invalidateQueries({ queryKey: ['knowledge-docs'] });
      runningRef.current = false;
      setBusy(false);
    },
    [category, sourceType, qc]
  );

  const selected = CATEGORIES.find((c) => c.value === category);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Wissensdatenbank</h1>
        <p className="mt-1 text-sm text-muted">
          Teamdokumente sind für Ascent die oberste Wahrheit. Was hier fehlt, behandelt der
          Coach als Wissenslücke.
        </p>
      </header>

      <Card className="space-y-4">
        <div>
          <label htmlFor="kb-category" className="mb-1 block text-sm font-medium text-ink">
            Kategorie
          </label>
          <select
            id="kb-category"
            value={category}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setCategory(e.target.value as CategoryValue)}
            disabled={busy}
            className="h-12 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink disabled:opacity-50"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          {selected && (
            <p className="mt-1 text-xs text-muted">
              Wird abgefragt von: {selected.agents}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="kb-source" className="mb-1 block text-sm font-medium text-ink">
            Art des Dokuments
          </label>
          <select
            id="kb-source"
            value={sourceType}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setSourceType(e.target.value as SourceTypeValue)}
            disabled={busy}
            className="h-12 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink disabled:opacity-50"
          >
            {SOURCE_TYPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <DropZone onFiles={handleFiles} disabled={busy} />
      </Card>

      <UploadQueue jobs={jobs} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">Dokumente</h2>
        <DocumentList />
      </section>
    </div>
  );
}
