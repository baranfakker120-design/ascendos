import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { CATEGORIES, useDeleteDoc, useKnowledgeDocs, useSetDocStatus } from '../knowledgeApi';

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  archived: 'bg-bg text-muted border-line',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Entwurf',
  approved: 'Freigegeben',
  archived: 'Archiviert',
};

function categoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

/** Ob eine Kategorie überhaupt von einem Agenten abgefragt wird. */
function isRetrievable(value: string): boolean {
  return CATEGORIES.some((c) => c.value === value);
}

export function DocumentList() {
  const { data: docs, isLoading, error } = useKnowledgeDocs();
  const setStatus = useSetDocStatus();
  const remove = useDeleteDoc();

  if (isLoading) return <p className="text-sm text-muted">Dokumente werden geladen …</p>;
  if (error) {
    return (
      <p className="text-sm text-red-700">
        Dokumente konnten nicht geladen werden: {(error as Error).message}
      </p>
    );
  }
  if (!docs || docs.length === 0) {
    return (
      <Card className="px-4 py-6 text-center text-sm text-muted">
        Noch keine Dokumente. Lade das erste hoch — ohne Wissensbasis behandelt Ascent jede
        Teamfrage als Wissenslücke.
      </Card>
    );
  }

  const drafts = docs.filter((d) => d.status === 'draft').length;

  return (
    <div className="space-y-3">
      {drafts > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {drafts === 1 ? 'Ein Dokument ist' : `${drafts} Dokumente sind`} noch nicht freigegeben.
          Für dein Team {drafts === 1 ? 'ist es' : 'sind sie'} damit unsichtbar — du selbst siehst{' '}
          {drafts === 1 ? 'es' : 'sie'} als Super-Admin trotzdem im Coach.
        </div>
      )}

      <ul className="space-y-2">
        {docs.map((doc) => (
          <li key={doc.id}>
            <Card padding="sm" className="space-y-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{doc.title}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {categoryLabel(doc.category)} · {doc.chunk_count} Abschnitte ·{' '}
                    {new Date(doc.created_at).toLocaleDateString('de-DE')}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${
                    STATUS_STYLE[doc.status] ?? STATUS_STYLE.archived
                  }`}
                >
                  {STATUS_LABEL[doc.status] ?? doc.status}
                </span>
              </div>

              {!isRetrievable(doc.category) && (
                <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
                  Die Kategorie „{doc.category}" wird von keinem Agenten abgefragt. Dieses Dokument
                  wird nie gefunden, auch nach Freigabe nicht.
                </p>
              )}

              {doc.chunk_count === 0 && (
                <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
                  Keine Abschnitte vorhanden — die Einbettung ist fehlgeschlagen. Bitte neu
                  hochladen.
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {doc.status !== 'approved' && (
                  <Button
                    size="sm"
                    fullWidth={false}
                    onClick={() => setStatus.mutate({ id: doc.id, status: 'approved' })}
                    disabled={setStatus.isPending}
                  >
                    Freigeben
                  </Button>
                )}
                {doc.status === 'approved' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidth={false}
                    onClick={() => setStatus.mutate({ id: doc.id, status: 'archived' })}
                    disabled={setStatus.isPending}
                  >
                    Archivieren
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  fullWidth={false}
                  onClick={() => {
                    // Löschen entfernt auch alle Chunks (ON DELETE CASCADE)
                    // und ist nicht rückholbar.
                    if (window.confirm(`„${doc.title}" endgültig löschen?`)) {
                      remove.mutate(doc.id);
                    }
                  }}
                  disabled={remove.isPending}
                >
                  Löschen
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
