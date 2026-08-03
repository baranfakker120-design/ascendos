import type { LayoutEdge } from '../types';
import './genealogy-edges.css';

interface GenealogyEdgesProps {
  edges: LayoutEdge[];
  width: number;
  height: number;
}

function curvePath(e: LayoutEdge): string {
  const midY = (e.y1 + e.y2) / 2;
  return `M ${e.x1} ${e.y1} C ${e.x1} ${midY}, ${e.x2} ${midY}, ${e.x2} ${e.y2}`;
}

export function GenealogyEdges({ edges, width, height }: GenealogyEdgesProps) {
  return (
    <svg
      className="genealogy-edges"
      width={Math.max(width, 1)}
      height={Math.max(height, 1)}
      aria-hidden
    >
      <defs>
        <linearGradient id="genealogy-edge-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(184 147 90)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="rgb(110 112 117)" stopOpacity="0.28" />
        </linearGradient>
      </defs>
      {edges.map((edge) => (
        <path
          key={edge.id}
          className="genealogy-edges__path"
          d={curvePath(edge)}
          fill="none"
          stroke="url(#genealogy-edge-grad)"
        />
      ))}
    </svg>
  );
}
