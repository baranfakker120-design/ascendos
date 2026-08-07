import { useI18n } from '@shared/i18n';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { computeInsightPlacement, type InsightPlacement } from '@features/coach/intelligence';
import { layoutGenealogyTree, intersects, nodeBounds, worldViewRect } from '../engine/layout';
import { dist2, midpoint } from '../engine/cameraMath';
import { useGenealogyCamera } from '../engine/useGenealogyCamera';
import type { GenealogyNode, LayoutPoint } from '../types';
import { GenealogyEdges } from './GenealogyEdges';
import { TeamNodeCard } from './TeamNodeCard';
import './genealogy-viewport.css';

interface GenealogyViewportProps {
  nodes: GenealogyNode[];
  visibleIds: Set<string>;
  collapsed: Set<string>;
  selectedId: string | null;
  /** Logged-in membership — highlighted and used for initial camera focus. */
  currentMembershipId: string | null;
  editableIds: Set<string>;
  onSelect: (node: GenealogyNode) => void;
  onToggleCollapse: (node: GenealogyNode) => void;
}

const TAP_MOVE_PX = 10;

type PointerSample = { x: number; y: number };

/**
 * Structure-tree camera viewport.
 * Gestures are Maps/Figma-stable: capture on the stage, persist scale/x/y in a
 * ref, and never reset transform when a new touch starts.
 */
export function GenealogyViewport({
  nodes,
  visibleIds,
  collapsed,
  selectedId,
  currentMembershipId,
  editableIds,
  onSelect,
  onToggleCollapse,
}: GenealogyViewportProps) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 360, h: 520 });
  const [openInsightId, setOpenInsightId] = useState<string | null>(null);
  const [insightPlacement, setInsightPlacement] = useState<InsightPlacement>('right');
  const { cameraRef, subscribe, commit, panBy, zoomAt, focusOn } = useGenealogyCamera({
    scale: 0.82,
  });

  const byId = useMemo(() => new Map(nodes.map((n) => [n.membershipId, n])), [nodes]);
  const layout = useMemo(
    () => layoutGenealogyTree(nodes, collapsed, visibleIds),
    [nodes, collapsed, visibleIds]
  );

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const cr = entry?.contentRect;
      if (!cr) return;
      setSize({ w: cr.width, h: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Apply camera transform without React re-render
  useEffect(() => {
    const apply = (c: { x: number; y: number; scale: number }) => {
      if (!worldRef.current) return;
      worldRef.current.style.transform = `translate3d(${c.x}px, ${c.y}px, 0) scale(${c.scale})`;
    };
    apply(cameraRef.current);
    return subscribe(apply);
  }, [cameraRef, subscribe]);

  // Center the logged-in member on first layout (org root may sit above them).
  const centeredFor = useRef<string | null>(null);
  useEffect(() => {
    if (layout.nodes.length === 0 || size.w <= 0 || size.h <= 0) return;
    const focusKey = currentMembershipId ?? 'root';
    if (centeredFor.current === focusKey) return;
    const target =
      (currentMembershipId ? layout.nodes.find((n) => n.id === currentMembershipId) : null) ??
      layout.nodes.find((n) => n.depth === 0) ??
      layout.nodes[0];
    if (!target) return;
    focusOn(target.x, target.y, size.w, size.h, 0.82);
    centeredFor.current = focusKey;
  }, [layout.nodes, focusOn, size.w, size.h, currentMembershipId]);

  const gesturingRef = useRef(false);
  const [tick, setTick] = useState(0);

  // Cull only when idle — never remount cards mid-gesture (that stole pointer capture)
  useEffect(
    () =>
      subscribe(() => {
        if (gesturingRef.current) return;
        setTick((n) => n + 1);
      }),
    [subscribe]
  );

  const visibleLayoutNodes: LayoutPoint[] = useMemo(() => {
    void tick;
    const view = worldViewRect(cameraRef.current, size.w, size.h, 160);
    const visible = layout.nodes.filter((n) => intersects(nodeBounds(n), view));
    // Keep the open insight node mounted so the anchored card does not unmount mid-pan.
    if (openInsightId && !visible.some((n) => n.id === openInsightId)) {
      const openLp = layout.nodes.find((n) => n.id === openInsightId);
      if (openLp) visible.push(openLp);
    }
    return visible;
  }, [layout.nodes, size.w, size.h, tick, cameraRef, openInsightId]);

  const refreshInsightPlacement = useCallback(() => {
    if (!openInsightId || !hostRef.current) return;
    const nodeEl = hostRef.current.querySelector(
      `[data-membership-id="${CSS.escape(openInsightId)}"]`
    );
    if (!(nodeEl instanceof HTMLElement)) return;
    const next = computeInsightPlacement(
      nodeEl.getBoundingClientRect(),
      hostRef.current.getBoundingClientRect()
    );
    setInsightPlacement((prev) => (prev === next ? prev : next));
  }, [openInsightId]);

  useEffect(() => {
    if (!openInsightId) return;
    refreshInsightPlacement();
    return subscribe(() => {
      refreshInsightPlacement();
    });
  }, [openInsightId, refreshInsightPlacement, subscribe]);

  const drag = useRef<{
    pointers: Map<number, PointerSample>;
    lastDist: number | null;
    mode: 'pan' | 'pinch' | null;
    moved: boolean;
    start: PointerSample | null;
  }>({ pointers: new Map(), lastDist: null, mode: null, moved: false, start: null });

  const syncPinchBaseline = () => {
    if (drag.current.pointers.size < 2) {
      drag.current.lastDist = null;
      return;
    }
    const pts = [...drag.current.pointers.values()];
    drag.current.lastDist = dist2(pts[0]!, pts[1]!);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const stage = hostRef.current;
    if (!stage) return;

    // Capture on the stable stage — never on a virtualized node card
    stage.setPointerCapture?.(e.pointerId);

    const sample = { x: e.clientX, y: e.clientY };
    drag.current.pointers.set(e.pointerId, sample);
    gesturingRef.current = true;

    if (drag.current.pointers.size >= 2) {
      drag.current.mode = 'pinch';
      drag.current.moved = true; // pinch is never a tap
      syncPinchBaseline();
    } else {
      drag.current.mode = 'pan';
      drag.current.moved = false;
      drag.current.start = sample;
      drag.current.lastDist = null;
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag.current.pointers.has(e.pointerId)) return;
    const prev = drag.current.pointers.get(e.pointerId)!;
    const next = { x: e.clientX, y: e.clientY };
    drag.current.pointers.set(e.pointerId, next);

    if (drag.current.start && !drag.current.moved) {
      if (dist2(drag.current.start, next) > TAP_MOVE_PX) drag.current.moved = true;
    }

    const stage = hostRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();

    if (drag.current.pointers.size >= 2) {
      drag.current.mode = 'pinch';
      const pts = [...drag.current.pointers.values()];
      const dist = dist2(pts[0]!, pts[1]!);
      if (drag.current.lastDist && drag.current.lastDist > 0 && dist > 0) {
        const mid = midpoint(pts[0]!, pts[1]!);
        zoomAt(mid.x, mid.y, dist / drag.current.lastDist, rect);
      }
      drag.current.lastDist = dist;
      return;
    }

    if (drag.current.mode === 'pan') {
      panBy(next.x - prev.x, next.y - prev.y);
    }
  };

  const endPointer = (e: ReactPointerEvent) => {
    if (!drag.current.pointers.has(e.pointerId)) return;
    drag.current.pointers.delete(e.pointerId);

    const stage = hostRef.current;
    if (stage?.hasPointerCapture?.(e.pointerId)) {
      stage.releasePointerCapture?.(e.pointerId);
    }

    if (drag.current.pointers.size >= 2) {
      drag.current.mode = 'pinch';
      syncPinchBaseline();
      return;
    }

    if (drag.current.pointers.size === 1) {
      // Continue panning with the remaining finger — do not reset camera
      drag.current.mode = 'pan';
      drag.current.lastDist = null;
      const remaining = [...drag.current.pointers.values()][0];
      drag.current.start = remaining ?? null;
      return;
    }

    // Gesture fully ended — persist camera via commit; refresh culling once
    const wasTap = !drag.current.moved && drag.current.mode === 'pan';
    const tapAt = drag.current.start;
    drag.current.mode = null;
    drag.current.lastDist = null;
    drag.current.start = null;
    gesturingRef.current = false;
    commit();
    setTick((n) => n + 1);

    if (wasTap && tapAt) {
      maybeSelectAt(tapAt.x, tapAt.y);
    }
  };

  const onLostPointerCapture = (e: ReactPointerEvent) => {
    if (!drag.current.pointers.has(e.pointerId)) return;
    drag.current.pointers.delete(e.pointerId);
    if (drag.current.pointers.size === 0) {
      drag.current.mode = null;
      drag.current.lastDist = null;
      drag.current.start = null;
      gesturingRef.current = false;
      commit();
      setTick((n) => n + 1);
    } else if (drag.current.pointers.size === 1) {
      drag.current.mode = 'pan';
      drag.current.lastDist = null;
    } else {
      syncPinchBaseline();
    }
  };

  const maybeSelectAt = (clientX: number, clientY: number) => {
    const hit = document.elementFromPoint(clientX, clientY);
    if (!hit) return;
    if (hit.closest('[data-tree-collapse]')) return;
    if (hit.closest('[data-tree-coach]')) return;
    if (hit.closest('[data-tree-insight]')) return;

    // Tap outside the insight card closes it.
    if (openInsightId) {
      setOpenInsightId(null);
    }

    const card = hit.closest('[data-membership-id]') as HTMLElement | null;
    const id = card?.dataset.membershipId;
    if (!id) return;
    const node = byId.get(id);
    if (node) onSelect(node);
  };

  const onWheel = useCallback(
    (e: WheelEvent) => {
      if (!hostRef.current) return;
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      zoomAt(e.clientX, e.clientY, factor, hostRef.current.getBoundingClientRect());
      commit();
    },
    [zoomAt, commit]
  );

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  const lastTap = useRef(0);
  const onDoubleTapZoom = (e: ReactPointerEvent) => {
    if (drag.current.pointers.size > 1) return;
    const now = Date.now();
    if (now - lastTap.current < 280 && hostRef.current) {
      const rect = hostRef.current.getBoundingClientRect();
      const target = cameraRef.current.scale < 1.1 ? 1.35 : 0.75;
      const factor = target / cameraRef.current.scale;
      zoomAt(e.clientX, e.clientY, factor, rect);
      commit();
      drag.current.moved = true; // suppress tap-select
    }
    lastTap.current = now;
  };

  const onMiniMapClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;
    const worldX = mx * Math.max(layout.width, 1);
    const worldY = my * Math.max(layout.height, 1);
    focusOn(worldX, worldY, size.w, size.h);
  };

  return (
    <div className="genealogy-viewport">
      <div
        ref={hostRef}
        className="genealogy-viewport__stage"
        onPointerDown={(e) => {
          onPointerDown(e);
          onDoubleTapZoom(e);
        }}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onLostPointerCapture={onLostPointerCapture}
        role="application"
        aria-label={t('team.treeHintAria')}
      >
        <div className="genealogy-viewport__atmosphere" aria-hidden />
        <div ref={worldRef} className="genealogy-viewport__world">
          <GenealogyEdges edges={layout.edges} width={layout.width} height={layout.height} />
          {visibleLayoutNodes.map((lp) => {
            const node = byId.get(lp.id);
            if (!node) return null;
            return (
              <TeamNodeCard
                key={lp.id}
                node={node}
                selected={selectedId === lp.id}
                isCurrent={currentMembershipId === lp.id}
                collapsed={collapsed.has(lp.id)}
                hasChildren={node.directCount > 0}
                editable={editableIds.has(lp.id)}
                insightOpen={openInsightId === lp.id}
                insightPlacement={openInsightId === lp.id ? insightPlacement : 'right'}
                onInsightOpenChange={(open) => {
                  setOpenInsightId(open ? lp.id : null);
                }}
                onSelect={onSelect}
                onToggleCollapse={onToggleCollapse}
                style={{ left: lp.x, top: lp.y }}
              />
            );
          })}
        </div>
      </div>

      <button
        type="button"
        className="genealogy-minimap"
        aria-label={t('team.minimap')}
        onClick={onMiniMapClick}
      >
        <span className="genealogy-minimap__canvas">
          {layout.nodes.slice(0, 200).map((n) => (
            <span
              key={n.id}
              className={[
                'genealogy-minimap__dot',
                selectedId === n.id ? 'is-selected' : '',
                currentMembershipId === n.id ? 'is-you' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{
                left: `${(n.x / Math.max(layout.width, 1)) * 100}%`,
                top: `${(n.y / Math.max(layout.height, 1)) * 100}%`,
              }}
            />
          ))}
        </span>
      </button>
    </div>
  );
}
