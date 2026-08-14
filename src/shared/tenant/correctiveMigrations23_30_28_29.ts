/**
 * Corrective migration contracts (repo-only documentation helpers).
 * See docs/architecture/PHASE_CORRECTIVE_23_30_28_29.md
 */

/** DB mirror of ap_design_score_mission (corrective 52 / historical 23). */
export const AP_DESIGN_SCORE_MISSION: Record<string, number> = {
  new_contacts: 25,
  follow_up_overdue: 50,
  reactivate_contact: 50,
  presentation_pending: 75,
  next_step_due: 50,
  fit_check_next_step: 100,
};

export const CORRECTIVE_FRAME_RPCS = [
  'ensure_role_frame_cosmetics',
  'list_my_frame_cosmetics',
  'equip_frame_cosmetic',
] as const;

export const CORRECTIVE_CMS_TABLES = [
  'coach_knowledge_articles',
  'coach_knowledge_versions',
  'coach_knowledge_change_log',
] as const;

export const CORRECTIVE_STORIES_TABLE = 'ascend_stories';
