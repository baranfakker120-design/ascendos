import { beforeEach, describe, expect, it } from 'vitest';
import {
  defaultAutomationPreferences,
  disableAllAutomation,
  isAutomationEnabled,
  listAutomationLog,
  logAutomationEvent,
  setAutomationEnabled,
} from './automation';
import { forgetCoachFact, listCoachMemory, rememberCoachFact } from './memory';
import { PendingAscentVisionAnalyzer } from './visionContracts';

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    },
  });
}

describe('coach automation + memory + vision stubs', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it('keeps all automation disabled by default', () => {
    expect(defaultAutomationPreferences().every((p) => !p.enabled)).toBe(true);
    expect(isAutomationEnabled('reminders')).toBe(false);
  });

  it('logs automation events and can disable everything', () => {
    setAutomationEnabled('birthday_greetings', true);
    expect(isAutomationEnabled('birthday_greetings')).toBe(true);
    logAutomationEvent({
      kind: 'birthday_greetings',
      targetLabel: 'Anna',
      preview: 'Alles Gute',
    });
    expect(listAutomationLog()).toHaveLength(1);
    disableAllAutomation();
    expect(isAutomationEnabled('birthday_greetings')).toBe(false);
  });

  it('stores and forgets coach memory facts', () => {
    const row = rememberCoachFact({
      contactId: 'c1',
      membershipId: null,
      kind: 'objection',
      text: 'Keine Zeit',
      occurredAt: '2026-08-01T10:00:00Z',
    });
    expect(listCoachMemory({ contactId: 'c1' })).toHaveLength(1);
    forgetCoachFact(row.id);
    expect(listCoachMemory({ contactId: 'c1' })).toHaveLength(0);
  });

  it('never auto-verifies screenshots via vision stub', async () => {
    const vision = new PendingAscentVisionAnalyzer();
    const summary = await vision.analyzeChatScreenshot({
      imageDataUrl: 'data:image/png;base64,xxx',
    });
    expect(summary.confidence).toBe(0);
    expect(summary.suggestedApStatus).toBe('pending_review');
  });
});
