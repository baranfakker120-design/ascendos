/** Domain types for the Genealogy Engine (Sprint 4.1). */

export type GenealogyRole = 'super_admin' | 'admin' | 'leader' | 'berater' | 'developer';

export interface GenealogyNode {
  membershipId: string;
  identityId: string;
  sponsorMembershipId: string | null;
  depth: number;
  firstName: string;
  lastName: string;
  username: string;
  avatarUrl: string | null;
  phone: string | null;
  role: GenealogyRole;
  apTotal: number;
  rankKey: string | null;
  rankLabel: string | null;
  frameAsset: string | null;
  directCount: number;
  teamCount: number;
  lastAppOpenedAt: string | null;
  isBeraterDesMonats: boolean;
  joinedAt: string;
}

export type GenealogyFilter = 'all' | 'leaders' | 'berater' | 'new' | 'inactive' | 'high_ap';

export interface LayoutPoint {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  parentId: string | null;
}

export interface LayoutEdge {
  id: string;
  fromId: string;
  toId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TreeLayout {
  nodes: LayoutPoint[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

export interface CameraState {
  x: number;
  y: number;
  scale: number;
}

export const NODE_WIDTH = 172;
export const NODE_HEIGHT = 204;
export const NODE_GAP_X = 28;
export const NODE_GAP_Y = 88;
export const MIN_SCALE = 0.35;
export const MAX_SCALE = 1.85;
