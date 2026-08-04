import { useNavigate } from 'react-router-dom';
import { FirstLaunchWizard } from './FirstLaunchWizard';

/**
 * Re-openable install guide: Profile → Hilfe → Installation.
 */
export function InstallGuidePage() {
  const navigate = useNavigate();

  return (
    <FirstLaunchWizard
      variant="overlay"
      resetToWelcome
      onFinished={() => {
        void navigate('/profil', { replace: true });
      }}
    />
  );
}
