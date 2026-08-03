import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@shared/ui/Button';
import { BottomSheet } from '@shared/ui/BottomSheet';
import { Card } from '@shared/ui/Card';
import { useGenealogyTree } from './genealogyApi';
import { filterTreeNodes } from './genealogyUtils';
import { GenealogyList } from './components/GenealogyList';
import { GenealogyToolbar } from './components/GenealogyToolbar';
import { GenealogyViewport } from './components/GenealogyViewport';
import { NodeDetailContent } from './components/NodeDetailContent';
import type { GenealogyFilter, GenealogyNode } from './types';
import './team-page.css';

/**
 * Sprint 4.1 — Genealogy Engine surface.
 * Fill-layout canvas with virtualized premium nodes.
 */
export function TeamPage() {
  const navigate = useNavigate();
  const { data: nodes = [], isPending, isError, refetch, isFetching } = useGenealogyTree();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<GenealogyFilter>('all');
  const [mode, setMode] = useState<'tree' | 'list'>('tree');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<GenealogyNode | null>(null);

  const visibleIds = useMemo(
    () => filterTreeNodes(nodes, { filter, search }),
    [nodes, filter, search]
  );

  const onToggleCollapse = (node: GenealogyNode) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(node.membershipId)) next.delete(node.membershipId);
      else next.add(node.membershipId);
      return next;
    });
  };

  if (isPending) {
    return (
      <div className="team-page flex flex-1 items-center justify-center">
        <p className="text-sm text-muted">Dein Teambaum wird aufgebaut …</p>
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="mt-2 space-y-3 text-center">
        <p className="font-medium">Der Teambaum konnte nicht geladen werden.</p>
        <p className="text-sm text-muted">Prüfe deine Verbindung und versuche es erneut.</p>
        <Button fullWidth={false} variant="secondary" onClick={() => void refetch()}>
          Erneut versuchen
        </Button>
      </Card>
    );
  }

  return (
    <div className="team-page flex min-h-0 flex-1 flex-col gap-2.5">
      <header className="shrink-0 space-y-1">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-accent-deep">
              Genealogy
            </p>
            <h1 className="text-2xl font-bold tracking-tight">Dein Team</h1>
          </div>
          {isFetching ? <span className="text-xs text-muted">Aktualisiere…</span> : null}
        </div>
        <GenealogyToolbar
          search={search}
          onSearch={setSearch}
          filter={filter}
          onFilter={setFilter}
          mode={mode}
          onMode={setMode}
          count={visibleIds.size}
        />
      </header>

      {mode === 'tree' ? (
        <GenealogyViewport
          nodes={nodes}
          visibleIds={visibleIds}
          collapsed={collapsed}
          selectedId={selected?.membershipId ?? null}
          onSelect={setSelected}
          onToggleCollapse={onToggleCollapse}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          <GenealogyList
            nodes={nodes}
            visibleIds={visibleIds}
            selectedId={selected?.membershipId ?? null}
            onSelect={setSelected}
          />
        </div>
      )}

      <BottomSheet
        open={!!selected}
        title={selected ? `${selected.firstName} ${selected.lastName}`.trim() || 'Partner' : ''}
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <NodeDetailContent
            node={selected}
            onCoach={(node) => {
              setSelected(null);
              void navigate(
                `/coach?partner=${encodeURIComponent(node.firstName || node.username)}`
              );
            }}
          />
        ) : null}
      </BottomSheet>
    </div>
  );
}
