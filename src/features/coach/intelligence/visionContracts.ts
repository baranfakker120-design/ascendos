/**
 * Future Ascent Vision contracts for chat screenshots.
 * No model wiring — Coach COO can call these later.
 * Complements @shared/lib/shareVerification without changing AP logic.
 */

export type VisionChatChannel =
  | 'whatsapp'
  | 'telegram'
  | 'instagram'
  | 'messenger'
  | 'signal'
  | 'sms'
  | 'email'
  | 'imessage'
  | 'unknown';

export interface VisionScreenshotSummary {
  channel: VisionChatChannel;
  recipientHint: string | null;
  detectedNames: string[];
  detectedDates: string[];
  detectedTimes: string[];
  detectedLinks: string[];
  hasPresentationLink: boolean;
  hasOnboardingLink: boolean;
  hasBusinessFitLink: boolean;
  repliesDetected: boolean | null;
  questionsDetected: string[];
  objectionsDetected: string[];
  conversationSummary: string;
  confidence: number;
  /** Low confidence must stay pending — never auto-award AP. */
  suggestedApStatus: 'pending' | 'pending_review' | 'rejected';
}

export interface AscentVisionAnalyzer {
  readonly id: string;
  analyzeChatScreenshot(input: {
    imageDataUrl: string;
    expectedOnboardingUrl?: string;
    expectedPresentationUrl?: string;
    expectedBusinessFitUrl?: string;
  }): Promise<VisionScreenshotSummary>;
}

export class PendingAscentVisionAnalyzer implements AscentVisionAnalyzer {
  readonly id = 'pending-ascent-vision';

  async analyzeChatScreenshot(input: {
    imageDataUrl: string;
    expectedOnboardingUrl?: string;
    expectedPresentationUrl?: string;
    expectedBusinessFitUrl?: string;
  }): Promise<VisionScreenshotSummary> {
    void input;
    return {
      channel: 'unknown',
      recipientHint: null,
      detectedNames: [],
      detectedDates: [],
      detectedTimes: [],
      detectedLinks: [],
      hasPresentationLink: false,
      hasOnboardingLink: false,
      hasBusinessFitLink: false,
      repliesDetected: null,
      questionsDetected: [],
      objectionsDetected: [],
      conversationSummary: 'Vision analysis not configured yet.',
      confidence: 0,
      suggestedApStatus: 'pending_review',
    };
  }
}

export const defaultAscentVisionAnalyzer: AscentVisionAnalyzer = new PendingAscentVisionAnalyzer();
