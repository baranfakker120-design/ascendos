import { useI18n, type MessageKey } from '@shared/i18n';
import { Card } from '@shared/ui/Card';
import { EnergyCore } from '@shared/ui/EnergyCore';
import { humanFileSize } from '../extractText';

export type JobPhase = 'waiting' | 'reading' | 'embedding' | 'done' | 'error';

export interface UploadJob {
  id: string;
  fileName: string;
  size: number;
  phase: JobPhase;
  /** Anzahl Teile, in die der Text zerlegt wurde (große Dokumente). */
  parts: number;
  partsDone: number;
  chunks: number;
  pages?: number;
  error?: string;
}

const PHASE_KEYS: Record<JobPhase, MessageKey> = {
  waiting: 'knowledge.queueWaiting',
  reading: 'knowledge.queueReading',
  embedding: 'knowledge.queueEmbedding',
  done: 'knowledge.queueDone',
  error: 'knowledge.queueError',
};

/**
 * Fortschritt pro Datei.
 *
 * Bewusst grobkörnig: die Edge Function ist ein Roundtrip pro Teil und
 * meldet zwischendurch nichts. Ein Balken, der scheinbar flüssig läuft,
 * wäre erfunden — deshalb Phasen und ein Teil-Zähler, die echten
 * Ereignissen entsprechen.
 */
function progressPercent(job: UploadJob): number {
  if (job.phase === 'done') return 100;
  if (job.phase === 'waiting') return 0;
  if (job.phase === 'reading') return 10;
  if (job.parts === 0) return 20;
  // 15 % fürs Lesen, der Rest verteilt auf die Teile.
  return 15 + Math.round((job.partsDone / job.parts) * 85);
}

export function UploadQueue({ jobs }: { jobs: UploadJob[] }) {
  const { t } = useI18n();
  if (jobs.length === 0) return null;

  const active = jobs.filter((j) => j.phase !== 'done' && j.phase !== 'error').length;
  const failed = jobs.filter((j) => j.phase === 'error').length;

  return (
    <section aria-label={t('knowledge.queueProgress')} className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-ink">
          {active > 0
            ? t('knowledge.queueActive', { active })
            : t('knowledge.queueComplete')}
        </h3>
        {failed > 0 && (
          <span className="text-xs font-medium text-red-700">
            {failed} {t('knowledge.queueError')}
          </span>
        )}
      </div>

      <ul className="space-y-2">
        {jobs.map((job) => {
          const percent = progressPercent(job);
          return (
            <li key={job.id}>
              <Card padding="sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{job.fileName}</p>
                    <p className="text-xs text-muted">
                      {humanFileSize(job.size)}
                      {job.pages ? ` · ${t('knowledge.pages', { count: job.pages })}` : ''}
                      {job.parts > 1 ? ` · ${t('knowledge.parts', { count: job.parts })}` : ''}
                      {job.phase === 'done' && job.chunks > 0
                        ? ` · ${t('knowledge.chunks', { count: job.chunks })}`
                        : ''}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-semibold ${
                      job.phase === 'error'
                        ? 'text-red-700'
                        : job.phase === 'done'
                          ? 'text-accent-deep'
                          : 'text-muted'
                    }`}
                  >
                    {t(PHASE_KEYS[job.phase])}
                    {job.phase === 'embedding' && job.parts > 1
                      ? ` ${job.partsDone}/${job.parts}`
                      : ''}
                  </span>
                </div>

                {job.phase !== 'error' && (
                  <EnergyCore
                    ap={percent}
                    currentThreshold={0}
                    nextThreshold={100}
                    showLabel={false}
                    size="md"
                    className="mt-2"
                  />
                )}

                {job.error && <p className="mt-2 text-xs text-red-700">{job.error}</p>}
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
