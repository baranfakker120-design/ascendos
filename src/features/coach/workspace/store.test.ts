import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTranslator } from '@shared/i18n/translate';
import {
  autoArchiveInactive,
  consolidateConversations,
  createConversation,
  findContactConversation,
  findFreeChatConversation,
  findPersonConversation,
  mergeServerConvos,
  normalizeSnapshot,
  openConversation,
  removeConversation,
} from './store';
import { displayConversationTitle, isGeneratedConversationTitle } from './displayTitle';
import { conversationTypeOf, EMPTY_WORKSPACE } from './types';
import { filterConversations, sortConversations } from './search';
import { buildContactContextBrief, composeOutboundMessage } from './personContext';
import { messagesKey } from '../messageCacheKey';

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

  it('keeps contact chats isolated from team chats and free chat', () => {
    let snap = createConversation(EMPTY_WORKSPACE, {
      title: 'Zuhal',
      kind: 'person',
      contactId: 'c-zuhal',
    }).snap;
    const zuhalId = snap.activeId!;
    snap = createConversation(snap, {
      title: 'Erol',
      kind: 'person',
      contactId: 'c-erol',
    }).snap;
    const erolId = snap.activeId!;
    snap = createConversation(snap, {
      title: 'Team Erol',
      kind: 'person',
      membershipId: 'mid-erol',
    }).snap;
    snap = createConversation(snap, {
      title: 'Freier Chat',
      kind: 'general',
    }).snap;

    expect(findContactConversation(snap, 'c-erol')?.id).toBe(erolId);
    expect(findContactConversation(snap, 'c-zuhal')?.id).toBe(zuhalId);
    expect(findContactConversation(snap, 'c-erol')?.id).not.toBe(zuhalId);
    expect(findPersonConversation(snap, 'mid-erol')?.contactId).toBeNull();
    expect(findFreeChatConversation(snap)?.kind).toBe('general');
    expect(conversationTypeOf(findContactConversation(snap, 'c-erol')!)).toBe('contact_chat');
    expect(conversationTypeOf(findPersonConversation(snap, 'mid-erol')!)).toBe('team_chat');
    expect(conversationTypeOf(findFreeChatConversation(snap)!)).toBe('free_chat');
  });

  it('consolidates duplicate contact conversations into one', () => {
    let snap = createConversation(EMPTY_WORKSPACE, {
      title: 'Erol',
      kind: 'person',
      contactId: 'c-erol',
      serverConversationId: 'srv-old',
    }).snap;
    snap = createConversation(snap, {
      title: 'Erol again',
      kind: 'person',
      contactId: 'c-erol',
    }).snap;
    expect(snap.conversations.filter((c) => c.contactId === 'c-erol')).toHaveLength(2);
    snap = consolidateConversations(snap);
    const contacts = snap.conversations.filter((c) => c.contactId === 'c-erol');
    expect(contacts).toHaveLength(1);
    expect(contacts[0].serverConversationId).toBe('srv-old');
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

  it('merges server threads without duplicates or hardcoded locale titles', () => {
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
    const imported = snap.conversations.find((c) => c.serverConversationId === 'srv-2');
    expect(imported).toBeTruthy();
    expect(imported!.title).toBe('');
    expect(imported!.kind).toBe('general');
  });

  it('does not create a second list row for the same contact_id from server', () => {
    let snap = createConversation(EMPTY_WORKSPACE, {
      title: 'Erol',
      kind: 'person',
      contactId: 'c-erol',
    }).snap;
    snap = mergeServerConvos(snap, [
      { id: 'srv-erol-1', contact_id: 'c-erol', created_at: new Date().toISOString() },
      { id: 'srv-erol-2', contact_id: 'c-erol', created_at: new Date().toISOString() },
    ]);
    expect(snap.conversations.filter((c) => c.contactId === 'c-erol')).toHaveLength(1);
    expect(snap.conversations.find((c) => c.contactId === 'c-erol')?.serverConversationId).toBe(
      'srv-erol-1'
    );
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

  it('removes a conversation and clears active selection', () => {
    let snap = createConversation(EMPTY_WORKSPACE, {
      title: 'A',
      kind: 'general',
    }).snap;
    const keepId = snap.activeId!;
    snap = createConversation(snap, { title: 'B', kind: 'marketing' }).snap;
    const removeId = snap.activeId!;
    snap = removeConversation(snap, removeId);
    expect(snap.conversations.map((c) => c.id)).toEqual([keepId]);
    expect(snap.activeId).toBe(keepId);
  });
});

describe('messagesKey isolation', () => {
  it('isolates pending threads by local conversation id', () => {
    expect(messagesKey(null, 'local-a')).toEqual(['coach-messages', 'local:local-a']);
    expect(messagesKey(null, 'local-b')).toEqual(['coach-messages', 'local:local-b']);
    expect(messagesKey(null, 'local-a')[1]).not.toBe(messagesKey(null, 'local-b')[1]);
    expect(messagesKey('srv-1')[1]).toBe('srv-1');
  });
});

describe('buildContactContextBrief', () => {
  it('scopes the brief to one CRM contact', () => {
    const brief = buildContactContextBrief({
      name: 'Erol',
      contactId: 'c-erol',
      phase: 'follow_up',
      notes: 'Wants info pack',
      nextStep: 'Send Zoom link',
      recentEvents: [{ event_type: 'message_sent', occurred_at: '2026-08-01T10:00:00.000Z' }],
    });
    expect(brief).toContain('Erol');
    expect(brief).toContain('c-erol');
    expect(brief).toContain('follow_up');
    expect(brief).toContain('Wants info pack');
    expect(brief).toContain('Send Zoom link');
    expect(brief).toContain('message_sent');
    expect(brief).toMatch(/this contact only/i);
    expect(brief).toMatch(/Do not discuss other people/i);
  });
});

describe('displayConversationTitle', () => {
  it('re-translates generated and legacy Freier Chat titles', () => {
    const tDe = createTranslator('de');
    const tTr = createTranslator('tr');
    const legacy = {
      id: '1',
      serverConversationId: null,
      title: 'Freier Chat',
      kind: 'general' as const,
      topic: null,
      contactId: null,
      partnerName: null,
      membershipId: null,
      seedPrompt: null,
      contextBrief: null,
      contextAttached: false,
      preview: null,
      createdAt: '',
      updatedAt: '',
      lastOpenedAt: '',
      archivedAt: null,
    };
    expect(isGeneratedConversationTitle(legacy)).toBe(true);
    expect(displayConversationTitle(legacy, tDe)).toBe(tDe('coach.ws.defaultTitle.general'));
    expect(displayConversationTitle(legacy, tTr)).toBe(tTr('coach.ws.defaultTitle.general'));
    expect(displayConversationTitle(legacy, tTr)).not.toBe('Freier Chat');
  });

  it('keeps partner names as-is', () => {
    const t = createTranslator('en');
    const person = {
      id: '1',
      serverConversationId: null,
      title: 'Freier Chat',
      kind: 'person' as const,
      topic: null,
      contactId: 'c1',
      partnerName: 'Zuhal Özkartal',
      membershipId: null,
      seedPrompt: null,
      contextBrief: null,
      contextAttached: false,
      preview: null,
      createdAt: '',
      updatedAt: '',
      lastOpenedAt: '',
      archivedAt: null,
    };
    expect(displayConversationTitle(person, t)).toBe('Zuhal Özkartal');
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
