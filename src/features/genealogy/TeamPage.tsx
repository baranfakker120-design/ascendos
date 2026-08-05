import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@shared/i18n';
import { Link, useSearchParams } from 'react-router-dom';
import { isMissingRpcError } from '@shared/api/rpcErrors';
import { useAuth } from '@shared/auth/AuthProvider';
import { loadTeamUiState, saveTeamUiState } from '@shared/offline';
import { Button, buttonClassName } from '@shared/ui/Button';
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
import { buildEditableMembershipIds, hasNoTeamPartners } from './genealogyUtils';
import { filterTreeNodes } from './genealogyUtils';
import { GenealogyList } from './components/GenealogyList';
import { GenealogyToolbar } from './components/GenealogyToolbar';
import { GenealogyViewport } from './components/GenealogyViewport';
import { GenealogyViewerShell } from './components/GenealogyViewerShell';
import { NodeDetailContent, type NodeDetailTab } from './components/NodeDetailContent';
import type { GenealogyFilter, GenealogyNode } from './types';
import './team-page.css';

function TeamEmptyState() {
  const { t } = useI18n();
  return (
    <Card className="mt-2 space-y-4 text-center">
      <div className="space-y-2">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-accent-deep">
          {t('team.title')}
        </p>
        <h2 className="text-xl font-bold tracking-tight">{t('team.emptyTitle')}</h2>
        <p className="mx-auto max-w-sm text-sm text-muted">{t('team.emptyBody')}</p>
      </div>
      <Link to="/more" className={buttonClassName({ fullWidth: false })}>
        {t('team.inviteFirst')}
      </Link>
    </Card>
  );
}

/**
 * Sprint 4.2 — Leader Experience + Genealogy Engine.
 * Empty downline is a first-class state, never an error.
 *
 * Member selection lives in the URL (`?member=&tab=`) so Coach → Back
 * can restore the open member sheet without losing navigation context.
 */
export function TeamPage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const { membership } = useAuth();
  const { data: nodes = [], isPending, isError, error, refetch, isFetching } = useGenealogyTree();
  const dash = useLeaderDashboard();
  const insights = useTeamInsights();
  const warnings = useSmartWarnings();
  const tlProgress = useTeamLeaderProgress();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<GenealogyFilter>('all');
  const [mode, setMode] = useState<'tree' | 'list'>('tree');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [showOps, setShowOps] = useState(true);
  const teamUiHydrated = useRef(false);

  const memberParam = searchParams.get('member');
  const detailTab: NodeDetailTab = searchParams.get('tab') === 'coach' ? 'coach' : 'overview';

  const selected = useMemo(() => {
    if (!memberParam) return null;
    return nodes.find((n) => n.membershipId === memberParam) ?? null;
  }, [nodes, memberParam]);

  const openMember = useCallback(
    (node: GenealogyNode, tab: NodeDetailTab = 'overview') => {
      const next = new URLSearchParams(searchParams);
      next.set('member', node.membershipId);
      if (tab === 'coach') next.set('tab', 'coach');
      else next.delete('tab');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const closeMember = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('member');
    next.delete('tab');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const setDetailTab = useCallback(
    (tab: NodeDetailTab) => {
      if (!memberParam) return;
      const next = new URLSearchParams(searchParams);
      if (tab === 'coach') next.set('tab', 'coach');
      else next.delete('tab');
      setSearchParams(next, { replace: true });
    },
    [memberParam, searchParams, setSearchParams]
  );

  useEffect(() => {
    let cancelled = false;
    void loadTeamUiState().then((saved) => {
      if (cancelled) return;
      if (saved) {
        setCollapsed(new Set(saved.collapsedIds));
        if (saved.mode) setMode(saved.mode);
      }
      teamUiHydrated.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!teamUiHydrated.current) return;
    const timer = window.setTimeout(() => {
      void saveTeamUiState({ collapsedIds: [...collapsed], mode });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [collapsed, mode]);

  // Ensure the path to the viewer stays expanded so auto-centering can find them.
  useEffect(() => {
    if (!membership?.id || nodes.length === 0) return;
    const byId = new Map(nodes.map((n) => [n.membershipId, n]));
    const self = byId.get(membership.id);
    if (!self) return;
    const ancestorIds: string[] = [];
    let walk = self.sponsorMembershipId;
    while (walk) {
      ancestorIds.push(walk);
      walk = byId.get(walk)?.sponsorMembershipId ?? null;
    }
    if (ancestorIds.length === 0) return;
    setCollapsed((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of ancestorIds) {
        if (next.delete(id)) changed = true;
      }
      return changed ? next : prev;
    });
  }, [membership?.id, nodes]);

  const emptyTeam = !isPending && !isError && hasNoTeamPartners(nodes);

  const visibleIds = useMemo(
    () => filterTreeNodes(nodes, { filter, search }),
    [nodes, filter, search]
  );

  const editableIds = useMemo(
    () => buildEditableMembershipIds(nodes, membership?.id),
    [nodes, membership?.id]
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
    if (node) openMember(node, 'overview');
  };

  if (isPending) {
    return (
      <div className="team-page flex flex-1 items-center justify-center">
        <p className="text-sm text-muted">{t('team.loading')}</p>
      </div>
    );
  }

  if (isError) {
    const schemaGap = isMissingRpcError(error);
    return (
      <Card className="mt-2 space-y-3 text-center">
        <p className="font-medium">{schemaGap ? t('team.migrationTitle') : t('team.loadError')}</p>
        <p className="text-sm text-muted">
          {schemaGap ? t('team.migrationBody') : t('common.connectionHint')}
        </p>
        <Button fullWidth={false} variant="secondary" onClick={() => void refetch()}>
          {t('common.retry')}
        </Button>
      </Card>
    );
  }

  if (emptyTeam) {
    return (
      <div className="team-page flex min-h-0 flex-1 flex-col gap-2.5">
        <header className="shrink-0 space-y-1">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-accent-deep">
            {t('team.leadership')}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">{t('team.title')}</h1>
        </header>
        <TeamLeaderProgressCard progress={tlProgress.data} />
        <TeamEmptyState />
      </div>
    );
  }

  return (
    <div className="team-page flex min-h-0 flex-1 flex-col gap-2.5">
      <header className="shrink-0 space-y-1">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-accent-deep">
              {t('team.leadership')}
            </p>
            <h1 className="text-2xl font-bold tracking-tight">{t('team.title')}</h1>
          </div>
          <div className="flex items-center gap-2">
            {isFetching ? <span className="text-xs text-muted">{t('team.refreshing')}</span> : null}
            <Link
              to="/qualifikationen"
              className="text-xs font-semibold text-accent-deep underline-offset-2 hover:underline"
            >
              {t('team.qualificationsLink')}
            </Link>
            <button
              type="button"
              className="text-xs font-semibold text-muted"
              onClick={() => setShowOps((v) => !v)}
            >
              {showOps ? t('team.compact') : t('team.dashboard')}
            </button>
          </div>
        </div>
      </header>

      {showOps ? (
        <div className="max-h-[28dvh] shrink-0 space-y-2.5 overflow-y-auto pr-0.5">
          <LeaderDashboardStrip data={dash.data} loading={dash.isPending} />
          <TeamLeaderProgressCard progress={tlProgress.data} />
          <TeamInsightsStrip items={insights.data ?? []} onSelect={selectById} />
          <SmartWarningsList items={warnings.data ?? []} onSelect={selectById} />
          <LeaderboardPanel />
          <ApTasksPanel />
        </div>
      ) : null}

      <GenealogyViewerShell
        memberCount={visibleIds.size}
        title={t('team.treeAria')}
        expandable={mode === 'tree'}
        tree={
          mode === 'tree' ? (
            <GenealogyViewport
              nodes={nodes}
              visibleIds={visibleIds}
              collapsed={collapsed}
              selectedId={selected?.membershipId ?? null}
              currentMembershipId={membership?.id ?? null}
              editableIds={editableIds}
              onSelect={(node) => openMember(node, 'overview')}
              onToggleCollapse={onToggleCollapse}
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
              <GenealogyList
                nodes={nodes}
                visibleIds={visibleIds}
                selectedId={selected?.membershipId ?? null}
                onSelect={(node) => openMember(node, 'overview')}
              />
            </div>
          )
        }
      >
        <GenealogyToolbar
          search={search}
          onSearch={setSearch}
          filter={filter}
          onFilter={setFilter}
          mode={mode}
          onMode={setMode}
          count={visibleIds.size}
        />
      </GenealogyViewerShell>

      <BottomSheet
        open={!!selected}
        title={
          selected ? `${selected.firstName} ${selected.lastName}`.trim() || t('team.partner') : ''
        }
        onClose={closeMember}
      >
        {selected ? (
          <NodeDetailContent
            node={selected}
            directs={directsOfSelected}
            editable={editableIds.has(selected.membershipId)}
            tab={detailTab}
            onTabChange={setDetailTab}
          />
        ) : null}
      </BottomSheet>
    </div>
  );
}
