/**
 * Future Ascent Vision contracts for chat screenshots & documents.
 * Architecture only — no OpenAI / model wiring.
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
  | 'document'
  | 'invoice'
  | 'presentation_screenshot'
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
  /** Future coach answers derived from the screenshot. */
  presentationAlreadySent: boolean | null;
  askedAboutPrice: boolean | null;
  appearsInterested: boolean | null;
  appearsRejected: boolean | null;
  daysSinceLastReply: number | null;
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
  analyzeDocument?(input: {
    imageDataUrl: string;
    kindHint?: 'invoice' | 'document' | 'presentation_screenshot';
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
    return emptySummary();
  }

  async analyzeDocument(input: {
    imageDataUrl: string;
    kindHint?: 'invoice' | 'document' | 'presentation_screenshot';
  }): Promise<VisionScreenshotSummary> {
    void input;
    return {
      ...emptySummary(),
      channel: input.kindHint === 'invoice' ? 'invoice' : (input.kindHint ?? 'document'),
      conversationSummary: 'Document vision not configured yet.',
    };
  }
}

function emptySummary(): VisionScreenshotSummary {
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
    presentationAlreadySent: null,
    askedAboutPrice: null,
    appearsInterested: null,
    appearsRejected: null,
    daysSinceLastReply: null,
    conversationSummary: 'Vision analysis not configured yet.',
    confidence: 0,
    suggestedApStatus: 'pending_review',
  };
}

export const defaultAscentVisionAnalyzer: AscentVisionAnalyzer = new PendingAscentVisionAnalyzer();
