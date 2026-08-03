/**
 * Compact top-down tidy tree layout (leaf-index packing).
 * Positions are node centers. Collapse hides descendants.
 */
import {
  NODE_GAP_X,
  NODE_GAP_Y,
  NODE_HEIGHT,
  NODE_WIDTH,
  type GenealogyNode,
  type LayoutEdge,
  type LayoutPoint,
  type TreeLayout,
} from '../types';

interface TidyNode {
  id: string;
  parentId: string | null;
  depth: number;
  children: TidyNode[];
  x: number;
  y: number;
}

function isHiddenByCollapse(
  node: GenealogyNode,
  byId: Map<string, GenealogyNode>,
  collapsed: Set<string>
): boolean {
  let walk = node.sponsorMembershipId;
  while (walk) {
    if (collapsed.has(walk)) return true;
    walk = byId.get(walk)?.sponsorMembershipId ?? null;
  }
  return false;
}

function buildTree(
  nodes: GenealogyNode[],
  collapsed: Set<string>,
  visible: Set<string> | null
): TidyNode | null {
  const source = visible ? nodes.filter((n) => visible.has(n.membershipId)) : nodes;
  if (source.length === 0) return null;

  const byId = new Map(source.map((n) => [n.membershipId, n]));
  const tidy = new Map<string, TidyNode>();

  for (const n of source) {
    if (n.depth > 0 && isHiddenByCollapse(n, byId, collapsed)) continue;
    tidy.set(n.membershipId, {
      id: n.membershipId,
      parentId: n.sponsorMembershipId,
      depth: n.depth,
      children: [],
      x: 0,
      y: 0,
    });
  }

  let root: TidyNode | null = null;
  for (const n of source) {
    const self = tidy.get(n.membershipId);
    if (!self) continue;
    if (n.depth === 0 || !n.sponsorMembershipId || !tidy.has(n.sponsorMembershipId)) {
      if (!root || self.depth < root.depth) root = self;
      continue;
    }
    if (collapsed.has(n.sponsorMembershipId)) continue;
    tidy.get(n.sponsorMembershipId)!.children.push(self);
  }

  return root;
}

/** Assign leaf indices left-to-right; parents sit at the mean of children. */
function layoutByLeaves(v: TidyNode, distance: number): void {
  let leafIndex = 0;
  function assign(node: TidyNode) {
    if (node.children.length === 0) {
      node.x = leafIndex * distance;
      leafIndex += 1;
      return;
    }
    for (const c of node.children) assign(c);
    node.x = node.children.reduce((s, c) => s + c.x, 0) / node.children.length;
  }
  assign(v);
}

function secondWalk(v: TidyNode, depth = 0, levelSep = NODE_GAP_Y + NODE_HEIGHT) {
  v.y = depth * levelSep;
  for (const child of v.children) secondWalk(child, depth + 1, levelSep);
}

function collect(
  v: TidyNode,
  nodes: LayoutPoint[],
  edges: LayoutEdge[],
  bounds: { minX: number; maxX: number; maxY: number }
) {
  nodes.push({
    id: v.id,
    x: v.x,
    y: v.y,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    depth: v.depth,
    parentId: v.parentId,
  });
  bounds.minX = Math.min(bounds.minX, v.x - NODE_WIDTH / 2);
  bounds.maxX = Math.max(bounds.maxX, v.x + NODE_WIDTH / 2);
  bounds.maxY = Math.max(bounds.maxY, v.y + NODE_HEIGHT / 2);

  for (const child of v.children) {
    edges.push({
      id: `${v.id}->${child.id}`,
      fromId: v.id,
      toId: child.id,
      x1: v.x,
      y1: v.y + NODE_HEIGHT / 2,
      x2: child.x,
      y2: child.y - NODE_HEIGHT / 2,
    });
    collect(child, nodes, edges, bounds);
  }
}

export function layoutGenealogyTree(
  nodes: GenealogyNode[],
  collapsed: Set<string>,
  visible: Set<string> | null = null
): TreeLayout {
  const root = buildTree(nodes, collapsed, visible);
  if (!root) return { nodes: [], edges: [], width: 0, height: 0 };

  layoutByLeaves(root, NODE_WIDTH + NODE_GAP_X);
  secondWalk(root);

  const layoutNodes: LayoutPoint[] = [];
  const edges: LayoutEdge[] = [];
  const bounds = { minX: Infinity, maxX: -Infinity, maxY: 0 };
  collect(root, layoutNodes, edges, bounds);

  const offsetX = Number.isFinite(bounds.minX) ? -bounds.minX + 56 : 56;
  const offsetY = 56;
  for (const n of layoutNodes) {
    n.x += offsetX;
    n.y += offsetY;
  }
  for (const e of edges) {
    e.x1 += offsetX;
    e.y1 += offsetY;
    e.x2 += offsetX;
    e.y2 += offsetY;
  }

  return {
    nodes: layoutNodes,
    edges,
    width: (Number.isFinite(bounds.maxX) ? bounds.maxX - bounds.minX : 0) + 112,
    height: bounds.maxY + offsetY + 112,
  };
}

export function nodeBounds(n: LayoutPoint): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  return {
    left: n.x - n.width / 2,
    top: n.y - n.height / 2,
    right: n.x + n.width / 2,
    bottom: n.y + n.height / 2,
  };
}

export function intersects(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number }
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function worldViewRect(
  camera: { x: number; y: number; scale: number },
  viewportW: number,
  viewportH: number,
  overscan = 120
): { left: number; top: number; right: number; bottom: number } {
  const left = (-camera.x - overscan) / camera.scale;
  const top = (-camera.y - overscan) / camera.scale;
  const right = (-camera.x + viewportW + overscan) / camera.scale;
  const bottom = (-camera.y + viewportH + overscan) / camera.scale;
  return { left, top, right, bottom };
}
