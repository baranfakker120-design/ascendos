import type { RadarContentType, RadarSource } from './radarInsertGate';

export const RADAR_UNRESOLVED_LIMIT = 12;

export interface TeamRadarItem {
  id: string;
  source: RadarSource;
  content_type: RadarContentType;
  published_at: string;
  canonical_url: string | null;
  resolved_at: string | null;
}

function isRadarSource(value: string): value is RadarSource {
  return value === 'chogan' || value === 'essence_tribe';
}

function isRadarContentType(value: string): value is RadarContentType {
  return value === 'POST' || value === 'REEL';
}

export function mapRadarItemRow(row: {
  id: string;
  source: string;
  content_type: string;
  published_at: string;
  canonical_url: string | null;
  resolved_at: string | null;
}): TeamRadarItem | null {
  if (!isRadarSource(row.source) || !isRadarContentType(row.content_type)) return null;
  return {
    id: row.id,
    source: row.source,
    content_type: row.content_type,
    published_at: row.published_at,
    canonical_url: row.canonical_url,
    resolved_at: row.resolved_at,
  };
}
