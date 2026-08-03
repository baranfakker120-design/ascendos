import { beforeEach, describe, expect, it } from 'vitest';
import {
  PendingCoachShareVision,
  PendingShareVisionVerifier,
  attachScreenshot,
  canConfirmShareVerification,
  confirmShareVerification,
  listPendingShareVerifications,
  markShareCompleted,
  rejectShareVerification,
  upsertShareVerification,
} from './shareVerification';

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const memory = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: memory,
    configurable: true,
  });
}

describe('shareVerification', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it('creates pending proofs without awarding verification', () => {
    const row = upsertShareVerification({
      contactId: 'c1',
      toolKey: 'waytomoon',
      toolName: 'Onboarding',
      shareUrl: 'http://waytomoon.netlify.app',
      shareEventType: 'waytomoon_sent',
      status: 'pending',
      shareCompleted: false,
      screenshotDataUrl: null,
      screenshotFileName: null,
      channelHint: 'unknown',
    });
    expect(row.status).toBe('pending');
    expect(canConfirmShareVerification(row)).toBe(false);
    expect(listPendingShareVerifications('c1')).toHaveLength(1);
  });

  it('allows confirm only after native share_completed', () => {
    const row = upsertShareVerification({
      contactId: 'c1',
      toolKey: 'waytomoon',
      toolName: 'Onboarding',
      shareUrl: 'http://waytomoon.netlify.app',
      shareEventType: 'waytomoon_sent',
      status: 'pending',
      shareCompleted: false,
      screenshotDataUrl: null,
      screenshotFileName: null,
      channelHint: 'unknown',
    });
    const shared = markShareCompleted(row.id)!;
    expect(shared.shareCompleted).toBe(true);
    expect(canConfirmShareVerification(shared)).toBe(true);
    const verified = confirmShareVerification(shared.id)!;
    expect(verified.status).toBe('verified');
    expect(listPendingShareVerifications('c1')).toHaveLength(0);
  });

  it('allows confirm via screenshot upload fallback', () => {
    const row = upsertShareVerification({
      contactId: 'c1',
      toolKey: 'presentation',
      toolName: 'Firmenpräsentation',
      shareUrl: 'https://mywaytomoon.netlify.app',
      shareEventType: 'presentation_sent',
      status: 'pending',
      shareCompleted: false,
      screenshotDataUrl: null,
      screenshotFileName: null,
      channelHint: 'unknown',
    });
    const withShot = attachScreenshot(row.id, 'data:image/png;base64,abc', 'chat.png')!;
    expect(canConfirmShareVerification(withShot)).toBe(true);
    expect(withShot.screenshotFileName).toBe('chat.png');
  });

  it('supports rejected status for future AI review', () => {
    const row = upsertShareVerification({
      contactId: 'c1',
      toolKey: 'waytomoon',
      toolName: 'Onboarding',
      shareUrl: 'http://waytomoon.netlify.app',
      shareEventType: 'waytomoon_sent',
      status: 'pending',
      shareCompleted: true,
      screenshotDataUrl: null,
      screenshotFileName: null,
      channelHint: 'native_share',
    });
    const rejected = rejectShareVerification(row.id)!;
    expect(rejected.status).toBe('rejected');
  });

  it('exposes pending vision stubs without calling OpenAI', async () => {
    const vision = new PendingShareVisionVerifier();
    const detection = await vision.analyzeScreenshot({
      imageDataUrl: 'data:image/png;base64,x',
      expectedOnboardingUrl: 'http://waytomoon.netlify.app',
      expectedPresentationUrl: null,
      contactName: 'Anna',
    });
    expect(detection.taskAppearsCompleted).toBeNull();
    expect(detection.confidence).toBe(0);

    const coach = new PendingCoachShareVision();
    const decision = await coach.determineTaskCompletion({
      detection,
      expectedOnboardingUrl: 'http://waytomoon.netlify.app',
      expectedPresentationUrl: null,
    });
    expect(decision.status).toBe('pending');
    expect(decision.completed).toBe(false);
  });
});
