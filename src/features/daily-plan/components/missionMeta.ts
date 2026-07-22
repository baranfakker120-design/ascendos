import type { MissionType } from '@shared/types/domain';

export const MISSION_ICONS: Record<MissionType, string> = {
  fit_check_next_step: '🤝',
  next_step_due: '📌',
  presentation_pending: '📽️',
  follow_up_overdue: '📞',
  reactivate_contact: '💬',
  new_contacts: '👥',
};
