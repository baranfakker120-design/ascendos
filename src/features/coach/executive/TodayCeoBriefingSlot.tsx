import { useNavigate } from 'react-router-dom';
import { writePendingSeed } from '../workspace';
import { CoachBriefingPanel, useCoachOrgIntelligence } from '../intelligence';

/**
 * Home CEO briefing — additive slot. Uses existing briefing UI + intelligence hook.
 * Does not modify analyzeOrg / executive engines.
 */
export function TodayCeoBriefingSlot() {
  const navigate = useNavigate();
  const { intelligence, isMorning, isLoading } = useCoachOrgIntelligence(true);

  return (
    <CoachBriefingPanel
      intelligence={intelligence}
      isMorning={isMorning}
      isLoading={isLoading}
      onAskAbout={(text) => {
        writePendingSeed(text);
        void navigate('/coach?kind=ceo');
      }}
    />
  );
}
