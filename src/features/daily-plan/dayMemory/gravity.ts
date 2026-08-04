import type { DailyPlanItem, MissionType } from '@shared/types/domain';

export type GravityBand = 'light' | 'pulling' | 'heavy' | 'critical';

export interface GravityReading {
  score: number;
  band: GravityBand;
  idleDays: number | null;
}

const GRAVITY_MISSIONS = new Set<MissionType>([
  'follow_up_overdue',
  'reactivate_contact',
  'next_step_due',
  'fit_check_next_step',
  'presentation_pending',
  'new_contacts',
]);

export function daysIdle(lastEventAt: string | null | undefined, now: Date): number | null {
  if (!lastEventAt) return null;
  const t = new Date(lastEventAt).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

function bandFor(idleDays: number | null, missionType: MissionType): GravityBand {
  if (missionType === 'follow_up_overdue' || missionType === 'reactivate_contact') {
    if (idleDays !== null && idleDays >= 14) return 'critical';
    if (idleDays !== null && idleDays >= 7) return 'heavy';
    return 'pulling';
  }
  if (idleDays !== null && idleDays >= 10) return 'heavy';
  if (idleDays !== null && idleDays >= 4) return 'pulling';
  return 'light';
}

/**
 * Sprint 5 · L4 Follow-Up Gravity — neglect as physics.
 * Explains and ranks; does NOT replace generate_daily_plan.
 */
export function scoreFollowUpGravity(input: {
  missionType: MissionType;
  engineScore: number;
  lastEventAt?: string | null;
  now?: Date;
}): GravityReading {
  const now = input.now ?? new Date();
  const idleDays = daysIdle(input.lastEventAt, now);
  if (!GRAVITY_MISSIONS.has(input.missionType)) {
    return { score: input.engineScore, band: 'light', idleDays };
  }

  let boost = 0;
  if (idleDays !== null) {
    boost += Math.min(40, idleDays * 2.5);
  } else if (input.missionType === 'follow_up_overdue') {
    boost += 18;
  }
  if (input.missionType === 'follow_up_overdue') boost += 12;
  if (input.missionType === 'reactivate_contact') boost += 10;
  if (input.missionType === 'fit_check_next_step') boost += 8;

  const score = Math.round(input.engineScore + boost);
  return {
    score,
    band: bandFor(idleDays, input.missionType),
    idleDays,
  };
}

export function pickGravityPriority(
  items: DailyPlanItem[],
  lastEventByContactId: Map<string, string | null>,
  now = new Date()
): DailyPlanItem | null {
  const open = items.filter((i) => i.status === 'pending' || i.status === 'deferred');
  const pool = open.length > 0 ? open : items;
  if (pool.length === 0) return null;

  return [...pool].sort((a, b) => {
    const ga = scoreFollowUpGravity({
      missionType: a.mission_type,
      engineScore: a.score,
      lastEventAt: a.contact_id ? lastEventByContactId.get(a.contact_id) : null,
      now,
    }).score;
    const gb = scoreFollowUpGravity({
      missionType: b.mission_type,
      engineScore: b.score,
      lastEventAt: b.contact_id ? lastEventByContactId.get(b.contact_id) : null,
      now,
    }).score;
    return gb - ga || a.position - b.position;
  })[0]!;
}
