import { useI18n } from '@shared/i18n';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { layoutGenealogyTree, intersects, nodeBounds, worldViewRect } from '../engine/layout';
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
  editableIds: Set<string>;
  onSelect: (node: GenealogyNode) => void;
  onToggleCollapse: (node: GenealogyNode) => void;
}

export function GenealogyViewport({
  nodes,
  visibleIds,
  collapsed,
  selectedId,
  editableIds,
  onSelect,
  onToggleCollapse,
}: GenealogyViewportProps) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 360, h: 520 });
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

  // Center root on first layout
  const didCenter = useRef(false);
  useEffect(() => {
    if (didCenter.current || layout.nodes.length === 0) return;
    const root = layout.nodes.find((n) => n.depth === 0) ?? layout.nodes[0];
    if (!root) return;
    focusOn(root.x, root.y, size.w, size.h, 0.82);
    didCenter.current = true;
  }, [layout.nodes, focusOn, size.w, size.h]);

  const [tick, setTick] = useState(0);
  useEffect(() => subscribe(() => setTick((t) => t + 1)), [subscribe]);

  const visibleLayoutNodes: LayoutPoint[] = useMemo(() => {
    void tick;
    const view = worldViewRect(cameraRef.current, size.w, size.h, 160);
    return layout.nodes.filter((n) => intersects(nodeBounds(n), view));
  }, [layout.nodes, size.w, size.h, tick, cameraRef]);

  // Pointer / pinch
  const drag = useRef<{
    pointers: Map<number, { x: number; y: number }>;
    lastDist: number | null;
    mode: 'pan' | 'pinch' | null;
  }>({ pointers: new Map(), lastDist: null, mode: null });

  const onPointerDown = (e: ReactPointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.current.mode = drag.current.pointers.size >= 2 ? 'pinch' : 'pan';
    if (drag.current.pointers.size === 2) {
      const pts = [...drag.current.pointers.values()];
      drag.current.lastDist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag.current.pointers.has(e.pointerId)) return;
    const prev = drag.current.pointers.get(e.pointerId)!;
    const next = { x: e.clientX, y: e.clientY };
    drag.current.pointers.set(e.pointerId, next);

    if (drag.current.pointers.size >= 2 && hostRef.current) {
      const pts = [...drag.current.pointers.values()];
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      if (drag.current.lastDist && dist > 0) {
        const midX = (pts[0]!.x + pts[1]!.x) / 2;
        const midY = (pts[0]!.y + pts[1]!.y) / 2;
        zoomAt(midX, midY, dist / drag.current.lastDist, hostRef.current.getBoundingClientRect());
      }
      drag.current.lastDist = dist;
      return;
    }

    if (drag.current.mode === 'pan') {
      panBy(next.x - prev.x, next.y - prev.y);
    }
  };

  const endPointer = (e: ReactPointerEvent) => {
    drag.current.pointers.delete(e.pointerId);
    if (drag.current.pointers.size < 2) drag.current.lastDist = null;
    if (drag.current.pointers.size === 0) {
      drag.current.mode = null;
      commit();
    }
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
    const now = Date.now();
    if (now - lastTap.current < 280 && hostRef.current) {
      const rect = hostRef.current.getBoundingClientRect();
      const target = cameraRef.current.scale < 1.1 ? 1.35 : 0.75;
      const factor = target / cameraRef.current.scale;
      zoomAt(e.clientX, e.clientY, factor, rect);
      commit();
    }
    lastTap.current = now;
  };

  // Mini-map click focus
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
                collapsed={collapsed.has(lp.id)}
                hasChildren={node.directCount > 0}
                editable={editableIds.has(lp.id)}
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
              className={['genealogy-minimap__dot', selectedId === n.id ? 'is-selected' : ''].join(
                ' '
              )}
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
