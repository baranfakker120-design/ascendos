import { useState } from 'react';
import { resolveDisplayFrameKey } from '@shared/lib/frameAssets';
import { Button } from '@shared/ui/Button';
import { RankFrame } from '@shared/ui/RankFrame';
import {
  useLeadershipNote,
  useToggleFavorite,
  useUpsertLeadershipNote,
} from '@features/leadership/leadershipApi';
import { displayName, presenceLabel } from '../genealogyUtils';
import type { GenealogyNode } from '../types';

interface NodeDetailSheetProps {
  node: GenealogyNode;
  directs: GenealogyNode[];
  onCoach: (node: GenealogyNode) => void;
}

export function NodeDetailContent({ node, directs, onCoach }: NodeDetailSheetProps) {
  const frameKey = resolveDisplayFrameKey({
    role: node.role,
    rankFrameKey: node.frameAsset,
    isBeraterDesMonats: node.isBeraterDesMonats,
  });
  const name = displayName(node);
  const digits = node.phone?.replace(/[^\d+]/g, '') ?? '';
  const wa = digits ? `https://wa.me/${digits.replace(/^\+/, '')}` : null;
  const tel = node.phone ? `tel:${node.phone}` : null;
  const toggleFav = useToggleFavorite();
  const upsertNote = useUpsertLeadershipNote();
  const { data: existingNote = '' } = useLeadershipNote(node.membershipId);
  const [note, setNote] = useState<string | null>(null);
  const noteValue = note ?? existingNote;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <RankFrame frameKey={frameKey} src={node.avatarUrl} name={name} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold tracking-tight">{name}</p>
          <p className="text-sm font-semibold text-accent-deep">{node.rankLabel ?? 'Newcomer'}</p>
          <p className="text-xs text-muted">{presenceLabel(node)}</p>
        </div>
        {node.depth > 0 ? (
          <button
            type="button"
            className="min-h-[40px] rounded-xl border border-line px-3 text-sm font-semibold"
            onClick={() => void toggleFav.mutateAsync(node.membershipId)}
            aria-pressed={node.isFavorite}
          >
            {node.isFavorite ? '★ Favorit' : '☆ Anpinnen'}
          </button>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-line/80 bg-white/50 px-3 py-2">
          <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted">AP</dt>
          <dd className="font-bold">{node.apTotal.toLocaleString('de-DE')}</dd>
        </div>
        <div className="rounded-xl border border-line/80 bg-white/50 px-3 py-2">
          <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted">ICP</dt>
          <dd className="font-bold">{node.icpMonth.toLocaleString('de-DE')}</dd>
        </div>
        <div className="rounded-xl border border-line/80 bg-white/50 px-3 py-2">
          <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
            Direkte
          </dt>
          <dd className="font-bold">{node.directCount}</dd>
        </div>
        <div className="rounded-xl border border-line/80 bg-white/50 px-3 py-2">
          <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
            Streak
          </dt>
          <dd className="font-bold">{node.streakDays}d</dd>
        </div>
      </dl>

      {node.sponsorName ? (
        <p className="text-sm text-muted">
          Persönlicher Sponsor: <span className="font-semibold text-ink">{node.sponsorName}</span>
        </p>
      ) : null}

      <label className="block space-y-1.5">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
          Notizen / Follow-up
        </span>
        <textarea
          className="min-h-[88px] w-full rounded-xl border border-line bg-white/70 px-3 py-2 text-sm"
          value={noteValue}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Was besprichst du als Nächstes?"
        />
        <Button
          type="button"
          variant="secondary"
          disabled={upsertNote.isPending || !noteValue.trim()}
          onClick={() =>
            void upsertNote.mutateAsync({
              targetMembershipId: node.membershipId,
              body: noteValue.trim(),
            })
          }
        >
          Notiz speichern
        </Button>
      </label>

      {directs.length > 0 ? (
        <div>
          <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
            Direkte Partner
          </p>
          <ul className="space-y-1.5 text-sm">
            {directs.slice(0, 8).map((d) => (
              <li key={d.membershipId} className="flex justify-between gap-2">
                <span className="font-medium">{displayName(d)}</span>
                <span className="text-muted">{d.apTotal.toLocaleString('de-DE')} AP</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-2">
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-line bg-white/80 px-4 text-sm font-semibold"
          >
            WhatsApp
          </a>
        ) : null}
        {tel ? (
          <a
            href={tel}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-line bg-white/80 px-4 text-sm font-semibold"
          >
            Anrufen
          </a>
        ) : null}
        <Button type="button" onClick={() => onCoach(node)}>
          Coach fragen
        </Button>
      </div>
    </div>
  );
}
