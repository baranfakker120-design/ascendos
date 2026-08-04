import { useCallback, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FirstLaunchWizard } from './FirstLaunchWizard';
import { isStandaloneDisplayMode } from './platform';
import { readFirstLaunchState, shouldAutoShowFirstLaunch } from './storage';

/**
 * Full-screen first-launch install guide. Mounted from AppShell (additive).
 * Hidden once completed locally, or while already running as installed PWA.
 */
export function FirstLaunchGate() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(() => {
    const state = readFirstLaunchState();
    return shouldAutoShowFirstLaunch(state, isStandaloneDisplayMode());
  });

  const onFinished = useCallback(() => {
    setOpen(false);
  }, []);

  // Manual reopen owns the surface — avoid stacking two wizards.
  if (!open || pathname === '/hilfe/installation') return null;

  return <FirstLaunchWizard variant="overlay" onFinished={onFinished} />;
}
