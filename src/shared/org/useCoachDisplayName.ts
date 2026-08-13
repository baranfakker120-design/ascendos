import { useI18n } from '@shared/i18n';
import { useActiveOrganizationProfile } from './useActiveOrganizationProfile';

/**
 * Visible coach label: org branding.coachDisplayName, else platform "Ascent".
 * Never falls back to "Seyda".
 */
export function useCoachDisplayName(): string {
  const { t } = useI18n();
  const { profile } = useActiveOrganizationProfile();
  return profile?.coachDisplayName?.trim() || t('coach.name');
}
