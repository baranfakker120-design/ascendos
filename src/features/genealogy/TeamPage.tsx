import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@shared/ui/Button';
import { BottomSheet } from '@shared/ui/BottomSheet';
import { Card } from '@shared/ui/Card';
import { ApTasksPanel } from '@features/leadership/components/ApTasksPanel';
import { LeaderboardPanel } from '@features/leadership/components/LeaderboardPanel';
import { LeaderDashboardStrip } from '@features/leadership/components/LeaderDashboardStrip';
import { SmartWarningsList } from '@features/leadership/components/SmartWarningsList';
import { TeamInsightsStrip } from '@features/leadership/components/TeamInsightsStrip';
import { TeamLeaderProgressCard } from '@features/leadership/components/TeamLeaderProgressCard';
import {
  useLeaderDashboard,
  useSmartWarnings,
  useTeamInsights,
  useTeamLeaderProgress,
} from '@features/leadership/leadershipApi';
import { useGenealogyTree } from './genealogyApi';
import { filterTreeNodes } from './genealogyUtils';
import { GenealogyList } from './components/GenealogyList';
import { GenealogyToolbar } from './components/GenealogyToolbar';
import { GenealogyViewport } from './components/GenealogyViewport';
import { NodeDetailContent } from './components/NodeDetailContent';
import type { GenealogyFilter, GenealogyNode } from './types';
import './team-page.css';

/**
 * Sprint 4.2 — Leader Experience + Genealogy Engine.
 * Dashboard / insights / warnings sit above the virtualized tree.
 */
export function TeamPage() {
  const navigate = useNavigate();
  const { data: nodes = [], isPending, isError, refetch, isFetching } = useGenealogyTree();
  const dash = useLeaderDashboard();
  const insights = useTeamInsights();
  const warnings = useSmartWarnings();
  const tlProgress = useTeamLeaderProgress();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<GenealogyFilter>('all');
  const [mode, setMode] = useState<'tree' | 'list'>('tree');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<GenealogyNode | null>(null);
  const [showOps, setShowOps] = useState(true);

  const visibleIds = useMemo(
    () => filterTreeNodes(nodes, { filter, search }),
    [nodes, filter, search]
  );

  const directsOfSelected = useMemo(() => {
    if (!selected) return [];
    return nodes.filter((n) => n.sponsorMembershipId === selected.membershipId);
  }, [nodes, selected]);

  const onToggleCollapse = (node: GenealogyNode) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(node.membershipId)) next.delete(node.membershipId);
      else next.add(node.membershipId);
      return next;
    });
  };

  const selectById = (membershipId: string) => {
    const node = nodes.find((n) => n.membershipId === membershipId);
    if (node) setSelected(node);
  };

  if (isPending) {
    return (
      <div className="team-page flex flex-1 items-center justify-center">
        <p className="text-sm text-muted">Dein Führungszentrum wird aufgebaut …</p>
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="mt-2 space-y-3 text-center">
        <p className="font-medium">Das Team konnte nicht geladen werden.</p>
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
              Leadership
            </p>
            <h1 className="text-2xl font-bold tracking-tight">Dein Team</h1>
          </div>
          <div className="flex items-center gap-2">
            {isFetching ? <span className="text-xs text-muted">Aktualisiere…</span> : null}
            <Link
              to="/qualifikationen"
              className="text-xs font-semibold text-accent-deep underline-offset-2 hover:underline"
            >
              Qualifikationen
            </Link>
            <button
              type="button"
              className="text-xs font-semibold text-muted"
              onClick={() => setShowOps((v) => !v)}
            >
              {showOps ? 'Kompakt' : 'Dashboard'}
            </button>
          </div>
        </div>
      </header>

      {showOps ? (
        <div className="shrink-0 space-y-2.5 overflow-y-auto max-h-[42vh] pr-0.5">
          <LeaderDashboardStrip data={dash.data} loading={dash.isPending} />
          <TeamLeaderProgressCard progress={tlProgress.data} />
          <TeamInsightsStrip items={insights.data ?? []} onSelect={selectById} />
          <SmartWarningsList items={warnings.data ?? []} onSelect={selectById} />
          <LeaderboardPanel />
          <ApTasksPanel />
        </div>
      ) : null}

      <GenealogyToolbar
        search={search}
        onSearch={setSearch}
        filter={filter}
        onFilter={setFilter}
        mode={mode}
        onMode={setMode}
        count={visibleIds.size}
      />

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
            directs={directsOfSelected}
            onCoach={(node) => {
              setSelected(null);
              void navigate(
                `/coach?partner=${encodeURIComponent(node.firstName || node.username)}&mid=${encodeURIComponent(node.membershipId)}`
              );
            }}
          />
        ) : null}
      </BottomSheet>
    </div>
  );
}
