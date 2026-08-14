/**
 * Corrective contract checks for migrations 52–55
 * (historical gaps 23 / 30 / 28 / 29).
 *
 * These assertions document the intended production-corrective surface
 * without touching remote databases.
 */
import { describe, expect, it } from 'vitest';
import { scoreMission } from '../lib/apScoring';
import {
  AP_DESIGN_SCORE_MISSION,
  CORRECTIVE_CMS_TABLES,
  CORRECTIVE_FRAME_RPCS,
  CORRECTIVE_STORIES_TABLE,
} from './correctiveMigrations23_30_28_29';

describe('correctiveMigrations23_30_28_29', () => {
  it('documents mission AP design scores used by corrective SQL', () => {
    expect(AP_DESIGN_SCORE_MISSION.new_contacts).toBe(25);
    expect(AP_DESIGN_SCORE_MISSION.fit_check_next_step).toBe(100);
    expect(AP_DESIGN_SCORE_MISSION.presentation_pending).toBe(75);
  });

  it('keeps TS mission scorer in the same reward ladder as the SQL mirror', () => {
    for (const [mission, ap] of Object.entries(AP_DESIGN_SCORE_MISSION)) {
      expect([10, 25, 50, 75, 100, 150, 250, 500]).toContain(scoreMission(mission));
      expect([10, 25, 50, 75, 100, 150, 250, 500]).toContain(ap);
    }
  });

  it('lists frame RPCs without implying ap_apply_to_total auto-equip changes', () => {
    expect(CORRECTIVE_FRAME_RPCS).toEqual([
      'ensure_role_frame_cosmetics',
      'list_my_frame_cosmetics',
      'equip_frame_cosmetic',
    ]);
    expect(CORRECTIVE_FRAME_RPCS).not.toContain('ap_apply_to_total');
  });

  it('scopes CMS + stories table names for tenant-aware correctives', () => {
    expect(CORRECTIVE_CMS_TABLES).toContain('coach_knowledge_articles');
    expect(CORRECTIVE_STORIES_TABLE).toBe('ascend_stories');
  });
});
