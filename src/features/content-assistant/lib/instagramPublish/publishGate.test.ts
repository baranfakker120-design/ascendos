import { describe, expect, it } from 'vitest';
import {
  buildInstagramCaptionPreview,
  evaluateInstagramPublishGate,
  formatHashtagsForDisplay,
} from './publishGate';

describe('evaluateInstagramPublishGate', () => {
  const base = {
    connected: true,
    draftReady: true,
    hasMedia: true,
    hasCaption: true,
  };

  it('blocks when not connected', () => {
    expect(evaluateInstagramPublishGate({ ...base, connected: false })).toBe('not_connected');
  });

  it('blocks when draft is not ready', () => {
    expect(evaluateInstagramPublishGate({ ...base, draftReady: false })).toBe('draft_not_ready');
  });

  it('blocks when publishing API flag is off (default)', () => {
    expect(evaluateInstagramPublishGate(base)).toBe('publishing_api_unavailable');
  });

  it('allows only when publishing is explicitly enabled and inputs are valid', () => {
    expect(evaluateInstagramPublishGate({ ...base, publishingEnabled: true })).toBe('ok');
  });

  it('never returns ok without caption/media', () => {
    expect(
      evaluateInstagramPublishGate({ ...base, hasCaption: false, publishingEnabled: true })
    ).toBe('missing_caption');
    expect(
      evaluateInstagramPublishGate({ ...base, hasMedia: false, publishingEnabled: true })
    ).toBe('missing_media');
  });
});

describe('caption helpers', () => {
  it('formats hashtags with #', () => {
    expect(formatHashtagsForDisplay(['duft', '#parfum'])).toBe('#duft #parfum');
  });

  it('builds caption + hashtags preview', () => {
    expect(buildInstagramCaptionPreview('Hallo', ['x'])).toBe('Hallo\n\n#x');
  });
});
