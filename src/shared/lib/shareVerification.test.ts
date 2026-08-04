import { beforeEach, describe, expect, it } from 'vitest';
import {
  ALREADY_CONFIRMED_MESSAGE,
  PendingCoachShareVision,
  PendingShareVisionVerifier,
  attachScreenshot,
  canConfirmShareVerification,
  confirmShareVerification,
  findVerifiedShareAction,
  getOrCreatePendingShareVerification,
  isShareActionAlreadyAwarded,
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
    const row = getOrCreatePendingShareVerification({
      contactId: 'c1',
      toolKey: 'waytomoon',
      toolName: 'Onboarding',
      shareUrl: 'http://waytomoon.netlify.app',
      shareEventType: 'waytomoon_sent',
    })!;
    expect(row.status).toBe('pending');
    expect(canConfirmShareVerification(row)).toBe(false);
    expect(listPendingShareVerifications('c1')).toHaveLength(1);
  });

  it('reuses the same pending row for contact+tool (no farming via reopen)', () => {
    const a = getOrCreatePendingShareVerification({
      contactId: 'c1',
      toolKey: 'waytomoon',
      toolName: 'Onboarding',
      shareUrl: 'http://waytomoon.netlify.app',
      shareEventType: 'waytomoon_sent',
    })!;
    const b = getOrCreatePendingShareVerification({
      contactId: 'c1',
      toolKey: 'waytomoon',
      toolName: 'Onboarding',
      shareUrl: 'http://waytomoon.netlify.app',
      shareEventType: 'waytomoon_sent',
    })!;
    expect(a.id).toBe(b.id);
    expect(listPendingShareVerifications('c1')).toHaveLength(1);
  });

  it('allows confirm only after native share_completed', () => {
    const row = getOrCreatePendingShareVerification({
      contactId: 'c1',
      toolKey: 'waytomoon',
      toolName: 'Onboarding',
      shareUrl: 'http://waytomoon.netlify.app',
      shareEventType: 'waytomoon_sent',
    })!;
    const shared = markShareCompleted(row.id)!;
    expect(shared.shareCompleted).toBe(true);
    expect(canConfirmShareVerification(shared)).toBe(true);
    const verified = confirmShareVerification(shared.id)!;
    expect(verified.status).toBe('verified');
    expect(listPendingShareVerifications('c1')).toHaveLength(0);
  });

  it('keeps screenshot uploads pending and never auto-verifies', () => {
    const row = getOrCreatePendingShareVerification({
      contactId: 'c1',
      toolKey: 'presentation',
      toolName: 'Firmenpräsentation',
      shareUrl: 'https://mywaytomoon.netlify.app',
      shareEventType: 'presentation_sent',
    })!;
    const withShot = attachScreenshot(
      row.id,
      'data:image/png;base64,aaaaaaaaaaaaaaaaaaaaaaaa',
      'chat.png'
    )!;
    expect(withShot.status).toBe('pending');
    expect(canConfirmShareVerification(withShot)).toBe(true);
    expect(withShot.screenshotFileName).toBe('chat.png');
  });

  it('blocks duplicate AP for the same contact + action', () => {
    const row = getOrCreatePendingShareVerification({
      contactId: 'dogukan',
      toolKey: 'presentation',
      toolName: 'Firmenpräsentation',
      shareUrl: 'https://mywaytomoon.netlify.app',
      shareEventType: 'presentation_sent',
    })!;
    markShareCompleted(row.id);
    const first = confirmShareVerification(row.id)!;
    expect(first.status).toBe('verified');
    expect(findVerifiedShareAction('dogukan', 'presentation')).toBeTruthy();
    expect(confirmShareVerification(row.id)).toBeNull();
    expect(isShareActionAlreadyAwarded('dogukan', 'presentation', 'presentation_sent')).toBe(true);
    expect(isShareActionAlreadyAwarded('dogukan', 'waytomoon', 'waytomoon_sent')).toBe(false);
    expect(
      isShareActionAlreadyAwarded('dogukan', 'waytomoon', 'waytomoon_sent', ['waytomoon_sent'])
    ).toBe(true);
    expect(ALREADY_CONFIRMED_MESSAGE).toBe('Already confirmed for this contact.');
    expect(
      getOrCreatePendingShareVerification({
        contactId: 'dogukan',
        toolKey: 'presentation',
        toolName: 'Firmenpräsentation',
        shareUrl: 'https://mywaytomoon.netlify.app',
        shareEventType: 'presentation_sent',
      })
    ).toBeNull();
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

  it('exposes pending vision stubs that never auto-verify', async () => {
    const vision = new PendingShareVisionVerifier();
    const detection = await vision.analyzeScreenshot({
      imageDataUrl: 'data:image/png;base64,x',
      expectedOnboardingUrl: 'http://waytomoon.netlify.app',
      expectedPresentationUrl: null,
      contactName: 'Anna',
    });
    expect(detection.taskAppearsCompleted).toBeNull();
    expect(detection.confidence).toBe(0);
    expect(detection.suggestedStatus).toBe('pending_review');

    const coach = new PendingCoachShareVision();
    const decision = await coach.determineTaskCompletion({
      detection,
      expectedOnboardingUrl: 'http://waytomoon.netlify.app',
      expectedPresentationUrl: null,
    });
    expect(decision.status).toBe('pending_review');
    expect(decision.completed).toBe(false);

    const answers = await coach.answerShareReviewQuestions({
      detection,
      toolKey: 'waytomoon',
      contactName: 'Anna',
    });
    expect(answers.wasOnboardingReallySent).toBeNull();
    expect(answers.shouldCreateFollowUpReminder).toBeNull();
  });
});
