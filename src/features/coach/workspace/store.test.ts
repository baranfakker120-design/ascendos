import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  autoArchiveInactive,
  createConversation,
  findPersonConversation,
  mergeServerConvos,
  normalizeSnapshot,
  openConversation,
} from './store';
import { EMPTY_WORKSPACE } from './types';
import { filterConversations, sortConversations } from './search';
import { composeOutboundMessage } from './personContext';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('coach workspace store', () => {
  it('creates conversations without duplicating person threads', () => {
    let snap = { ...EMPTY_WORKSPACE };
    const first = createConversation(snap, {
      title: 'Şeyda Tatar',
      kind: 'person',
      membershipId: 'mid-1',
    });
    snap = first.snap;
    const again = findPersonConversation(snap, 'mid-1');
    expect(again?.id).toBe(first.conversation.id);
    snap = openConversation(snap, first.conversation.id);
    expect(snap.activeId).toBe(first.conversation.id);
  });

  it('auto-archives inactive conversations but never deletes', () => {
    const old = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const snap = normalizeSnapshot({
      version: 1,
      activeId: null,
      mobilePane: 'list',
      updatedAt: 1,
      conversations: [
        {
          id: 'a',
          serverConversationId: null,
          title: 'Old',
          kind: 'general',
          topic: null,
          contactId: null,
          partnerName: null,
          membershipId: null,
          seedPrompt: null,
          contextBrief: null,
          contextAttached: false,
          preview: null,
          createdAt: old,
          updatedAt: old,
          lastOpenedAt: old,
          archivedAt: null,
        },
      ],
    });
    const next = autoArchiveInactive(snap);
    expect(next.conversations).toHaveLength(1);
    expect(next.conversations[0].archivedAt).toBeTruthy();
  });

  it('merges server threads without duplicates', () => {
    let snap = createConversation(EMPTY_WORKSPACE, {
      title: 'Existing',
      kind: 'general',
      serverConversationId: 'srv-1',
    }).snap;
    snap = mergeServerConvos(snap, [
      { id: 'srv-1', contact_id: null, created_at: new Date().toISOString() },
      { id: 'srv-2', contact_id: null, created_at: new Date().toISOString() },
    ]);
    expect(snap.conversations.filter((c) => c.serverConversationId === 'srv-1')).toHaveLength(1);
    expect(snap.conversations.some((c) => c.serverConversationId === 'srv-2')).toBe(true);
  });

  it('clears stale serverConversationId after wipe (empty server index)', () => {
    let snap = createConversation(EMPTY_WORKSPACE, {
      title: 'Freier Chat',
      kind: 'general',
      serverConversationId: 'deleted-srv',
    }).snap;
    snap = mergeServerConvos(snap, []);
    expect(snap.conversations).toHaveLength(1);
    expect(snap.conversations[0].serverConversationId).toBeNull();
  });
});

describe('isConversationMissingError', () => {
  it('detects localized missing-conversation messages', async () => {
    const { isConversationMissingError } = await import('./store');
    expect(isConversationMissingError('Konversation nicht gefunden.')).toBe(true);
    expect(isConversationMissingError('Conversation not found.')).toBe(true);
    expect(isConversationMissingError('Nie znaleziono rozmowy.')).toBe(true);
    expect(isConversationMissingError('Network offline')).toBe(false);
  });
});

describe('coach workspace search', () => {
  it('filters by name topic and date', () => {
    const list = [
      {
        id: '1',
        serverConversationId: null,
        title: 'Şeyda Tatar',
        kind: 'person' as const,
        topic: 'Onboarding',
        contactId: null,
        partnerName: 'Şeyda Tatar',
        membershipId: 'm1',
        seedPrompt: null,
        contextBrief: null,
        contextAttached: false,
        preview: 'Next step',
        createdAt: '2026-08-01T10:00:00.000Z',
        updatedAt: '2026-08-01T10:00:00.000Z',
        lastOpenedAt: '2026-08-01T10:00:00.000Z',
        archivedAt: null,
      },
      {
        id: '2',
        serverConversationId: null,
        title: 'Marketing',
        kind: 'marketing' as const,
        topic: 'Euro Event',
        contactId: null,
        partnerName: null,
        membershipId: null,
        seedPrompt: null,
        contextBrief: null,
        contextAttached: false,
        preview: null,
        createdAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-07-01T10:00:00.000Z',
        lastOpenedAt: '2026-07-01T10:00:00.000Z',
        archivedAt: null,
      },
    ];
    expect(filterConversations(list, 'şeyda')).toHaveLength(1);
    expect(filterConversations(list, 'euro')).toHaveLength(1);
    expect(filterConversations(list, '2026-08-01')).toHaveLength(1);
    expect(sortConversations(list)[0].id).toBe('1');
  });
});

describe('composeOutboundMessage', () => {
  it('attaches context brief only once', () => {
    const first = composeOutboundMessage('How can I help?', {
      contextBrief: 'AP 1200',
      contextAttached: false,
    });
    expect(first.attached).toBe(true);
    expect(first.message).toContain('AP 1200');
    expect(first.message).toContain('How can I help?');

    const second = composeOutboundMessage('Follow up', {
      contextBrief: 'AP 1200',
      contextAttached: true,
    });
    expect(second.attached).toBe(false);
    expect(second.message).toBe('Follow up');
  });
});
