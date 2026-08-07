import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '@shared/i18n';
import { DRAFT_SCOPES, usePersistedDraft } from '@shared/offline';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { Input } from '@shared/ui/Input';
import { CoachBubble, UserBubble } from './CoachBubbles';
import { CoachMarkdown } from './CoachMarkdown';
import { useCoachContact, useCoachMessages, useSendToCoach } from './coachApi';
import { ContactCoachHeader } from './contact/ContactCoachHeader';
import { ContactQuickActionCards } from './contact/ContactQuickActionCards';
import { buildContactCoachSuggestions } from './contact/contactSuggestions';
import { createCoachTranslator } from './i18n';
import { CoachBriefingPanel, findPersonInsight, useCoachOrgIntelligence } from './intelligence';
import {
  ConversationList,
  NewConversationSheet,
  buildContactContextBrief,
  buildPersonContextBrief,
  composeOutboundMessage,
  defaultTitleForKind,
  displayConversationTitle,
  readPendingSeed,
  writePendingSeed,
  useCoachWorkspace,
  type ConversationKind,
} from './workspace';
import { buildProactiveSuggestions } from './executive';
import './coach-chat.css';
import './workspace/coach-workspace.css';
import './executive/executive.css';
import './contact/contact-coach.css';

const URL_PATTERN = /(https?:\/\/[^\s]+[^\s.,;:!?)\]"'])/g;
const STICK_THRESHOLD_PX = 96;
const CONTEXT_MARKER = '\n\n---\n\n';

/** Hide attached person-context brief in the bubble; server history still keeps it. */
function displayUserContent(content: string): string {
  const idx = content.indexOf(CONTEXT_MARKER);
  if (idx >= 0) return content.slice(idx + CONTEXT_MARKER.length);
  return content;
}

function linkifyText(text: string): Array<string | JSX.Element> {
  return text.split(URL_PATTERN).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 break-all"
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}

/**
 * Coach conversation workspace — ChatGPT-style list + thread.
 * Additive local memory over existing coach-chat / coach_messages APIs.
 */
export function CoachPage() {
  const { locale, t } = useI18n();
  const coachT = useMemo(() => createCoachTranslator(locale), [locale]);
  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();
  const workspace = useCoachWorkspace();
  const [newOpen, setNewOpen] = useState(false);
  const deepLinkHandled = useRef<string | null>(null);
  const pendingSeedRef = useRef<string | null | undefined>(undefined);
  if (pendingSeedRef.current === undefined) {
    pendingSeedRef.current = readPendingSeed();
  }

  const contactIdParam = searchParams.get('kontakt');
  const partnerNameParam = searchParams.get('partner');
  const partnerMidParam = searchParams.get('mid');
  const urlConvo = searchParams.get('c');
  const kindParam = searchParams.get('kind');

  // Person deep links → dedicated full-screen conversation (no overlay on workspace).
  useEffect(() => {
    if (!partnerMidParam) return;
    const seed = pendingSeedRef.current;
    if (seed) {
      writePendingSeed(seed);
      pendingSeedRef.current = null;
    }
    void navigate(`/coach/person/${encodeURIComponent(partnerMidParam)}`, { replace: true });
  }, [partnerMidParam, navigate]);

  const active = workspace.active;
  const contactId = active?.contactId ?? contactIdParam;
  const partnerName = active?.partnerName ?? partnerNameParam;
  const partnerMid = active?.membershipId ?? partnerMidParam;
  const conversationId = active?.serverConversationId ?? null;

  const { data: contact } = useCoachContact(contactId);
  const { intelligence, isMorning, isLoading: intelLoading } = useCoachOrgIntelligence(true);
  const partnerInsight = findPersonInsight(intelligence, partnerMid);

  const isContactCoach =
    !!active && active.kind === 'person' && !!active.contactId && !active.membershipId;

  const freeChatChips = useMemo(() => {
    const proactive = buildProactiveSuggestions(intelligence, t).slice(0, 5);
    if (proactive.length) {
      return proactive.map((s) => ({ label: s.label, text: s.prompt }));
    }
    return [
      { label: t('coach.chipObjection'), text: t('coach.chipObjectionPrompt') },
      { label: t('coach.chipMessage'), text: t('coach.chipMessagePrompt') },
      { label: t('coach.chipPrep'), text: t('coach.chipPrepPrompt') },
    ];
  }, [intelligence, t]);

  const contactChips = useMemo(() => {
    if (!isContactCoach) return [];
    const name = contact?.name ?? active?.partnerName ?? active?.title ?? '';
    if (!name) return [];
    return buildContactCoachSuggestions(coachT, name).map((s) => ({
      label: s.label,
      text: s.prompt,
    }));
  }, [isContactCoach, contact?.name, active?.partnerName, active?.title, coachT]);

  const draftScope = DRAFT_SCOPES.coachThread(active?.id ?? 'none');
  const {
    value: { text: input },
    patch: patchInputDraft,
    clear: clearInputDraft,
  } = usePersistedDraft(draftScope, { text: '' }, { enabled: !!active });
  const setInput = (text: string) => patchInputDraft({ text });

  const [error, setError] = useState<string | null>(null);
  const { data: messages, isPending: messagesPending } = useCoachMessages(
    conversationId,
    active?.id ?? null
  );
  const send = useSendToCoach();

  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [animateIds, setAnimateIds] = useState<Set<string>>(() => new Set());
  const threadKeyRef = useRef<string | null>(null);

  // Reset bubble animation bookkeeping when switching threads (no flicker of old ids).
  useEffect(() => {
    const key = active?.id ?? null;
    if (threadKeyRef.current === key) return;
    threadKeyRef.current = key;
    seenIdsRef.current = new Set();
    setAnimateIds(new Set());
    stickToBottomRef.current = true;
    setError(null);
  }, [active?.id]);

  // Sync URL ← active conversation (replace, no history spam / no flicker).
  // Skip while active is null so inbound deep-link params are not wiped.
  // Do not put membershipId in the URL — that deep-links to /coach/person/:mid.
  useEffect(() => {
    if (!workspace.hydrated || !active) return;
    if (active.kind === 'person' && active.membershipId) return;
    const next = new URLSearchParams();
    if (active.serverConversationId) next.set('c', active.serverConversationId);
    if (active.contactId) next.set('kontakt', active.contactId);
    if (active.partnerName) next.set('partner', active.partnerName);
    next.set('ws', active.id);

    const cur = typeof window !== 'undefined' ? window.location.search.replace(/^\?/, '') : '';
    const nxt = next.toString();
    if (cur !== nxt) setSearchParams(next, { replace: true });
  }, [active, workspace.hydrated, setSearchParams]);

  // Deep links: contact / kind+seed → find-or-create conversation.
  // Person mid deep links redirect to /coach/person/:mid (see effect above).
  useEffect(() => {
    if (!workspace.hydrated) return;
    if (partnerMidParam) return;
    const seed = pendingSeedRef.current;
    const deepKey = [
      contactIdParam ?? '',
      partnerNameParam ?? '',
      kindParam ?? '',
      urlConvo ?? '',
      seed ? 'seed' : '',
    ].join('|');
    if (!contactIdParam && !partnerNameParam && !urlConvo && !kindParam && !seed) {
      deepLinkHandled.current = null;
      // No deep link: ensure Freier Chat exists (fresh user / wipe / cleared storage).
      if (!workspace.active) {
        workspace.ensureKind('general', {
          title: t('coach.ws.defaultTitle.general'),
        });
      }
      return;
    }
    if (deepLinkHandled.current === deepKey) return;
    deepLinkHandled.current = deepKey;

    if (partnerNameParam && !contactIdParam) {
      // Name-only links without kontakt/mid must not spawn orphan person threads.
      // Team chats use /coach/person/:mid; CRM uses ?kontakt=.
      return;
    }

    if (contactIdParam) {
      const name = contact?.name ?? partnerNameParam ?? t('coach.ws.kind.person');
      const brief = buildContactContextBrief({
        name,
        contactId: contactIdParam,
        phase: contact?.phase ?? null,
        notes: contact?.notes ?? null,
        nextStep: contact?.next_step ?? null,
        recentEvents: contact?.recentEvents ?? null,
      });
      workspace.ensureKind('person', {
        title: name,
        partnerName: name,
        contactId: contactIdParam,
        seedPrompt: seed,
        contextBrief: brief,
      });
      return;
    }

    if (kindParam === 'ceo' || kindParam === 'leadership' || kindParam === 'general') {
      workspace.ensureKind(kindParam, {
        title: defaultTitleForKind(kindParam, t),
        seedPrompt: seed,
      });
      return;
    }

    if (seed) {
      workspace.ensureKind('ceo', {
        title: defaultTitleForKind('ceo', t),
        seedPrompt: seed,
      });
      return;
    }

    if (urlConvo) {
      workspace.ensureKind('general', {
        title: t('coach.ws.defaultTitle.general'),
        serverConversationId: urlConvo,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    workspace.hydrated,
    workspace.active,
    contactIdParam,
    partnerMidParam,
    partnerNameParam,
    kindParam,
    urlConvo,
    contact?.name,
    t,
  ]);

  // Apply seed prompt into composer once when opening an empty thread.
  useEffect(() => {
    if (!active?.seedPrompt) return;
    if (messagesPending) return;
    if (messages && messages.length > 0) return;
    if (input.trim()) return;
    setInput(active.seedPrompt);
    workspace.updateActive({ seedPrompt: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.seedPrompt, messages, messagesPending]);

  // Keep contact title + context brief fresh once loaded (contact_chat only).
  useEffect(() => {
    if (!active || !contact || active.contactId !== contact.id) return;
    if (active.membershipId) return;
    const brief = buildContactContextBrief({
      name: contact.name,
      contactId: contact.id,
      phase: contact.phase,
      notes: contact.notes,
      nextStep: contact.next_step,
      recentEvents: contact.recentEvents,
    });
    const patch: { title?: string; partnerName?: string; contextBrief?: string } = {};
    if (active.title !== contact.name || active.partnerName !== contact.name) {
      patch.title = contact.name;
      patch.partnerName = contact.name;
    }
    if (!active.contextAttached && brief !== active.contextBrief) {
      patch.contextBrief = brief;
    }
    if (Object.keys(patch).length) workspace.updateActive(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    contact?.id,
    contact?.name,
    contact?.phase,
    contact?.notes,
    contact?.next_step,
    contact?.recentEventCount,
    active?.id,
  ]);

  // Enrich team person brief when intelligence arrives after deep link.
  useEffect(() => {
    if (!active || active.kind !== 'person' || !partnerMid) return;
    if (active.contextAttached) return;
    if (!partnerInsight) return;
    const brief = buildPersonContextBrief({
      name: active.partnerName || partnerInsight.name,
      membershipId: partnerMid,
      insight: partnerInsight,
    });
    if (brief === active.contextBrief) return;
    workspace.updateActive({ contextBrief: brief });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerInsight, active?.id, partnerMid]);

  const updateStick = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance <= STICK_THRESHOLD_PX;
  }, []);

  useLayoutEffect(() => {
    const list = messages ?? [];
    const fresh = list.filter((m) => !seenIdsRef.current.has(m.id)).map((m) => m.id);
    if (fresh.length) {
      fresh.forEach((id) => seenIdsRef.current.add(id));
      setAnimateIds((prev) => {
        const next = new Set(prev);
        fresh.forEach((id) => next.add(id));
        return next;
      });
      window.setTimeout(() => {
        setAnimateIds((prev) => {
          const next = new Set(prev);
          fresh.forEach((id) => next.delete(id));
          return next;
        });
      }, 700);
    }

    if (!stickToBottomRef.current) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, send.isPending, active?.id]);

  const submit = async (text: string) => {
    const raw = text.trim();
    if (!raw || send.isPending || !active) return;
    setError(null);
    setInput('');
    stickToBottomRef.current = true;

    const { message, attached } = composeOutboundMessage(raw, active);
    try {
      const result = await send.mutateAsync({
        message,
        displayContent: attached ? raw : undefined,
        conversationId: active.serverConversationId,
        localConversationId: active.id,
        contactId: active.contactId,
      });
      await clearInputDraft();
      workspace.afterSend(active.id, result.conversationId, raw, attached);
    } catch (e) {
      setError(e instanceof Error ? e.message : coachT('chat.unreachable'));
      setInput(raw);
    }
  };

  const onChooseKind = (kind: ConversationKind) => {
    setNewOpen(false);
    workspace.startNew(kind, defaultTitleForKind(kind, t));
  };

  const showWelcome =
    !!active &&
    !isContactCoach &&
    !send.isPending &&
    !messages?.length &&
    !(conversationId && messagesPending);

  const showContactSuggestions =
    isContactCoach && !send.isPending && !(messages && messages.length > 0);

  const mobilePane = workspace.snap.mobilePane;
  const wsClass =
    mobilePane === 'list' ? 'coach-ws coach-ws--mobile-list' : 'coach-ws coach-ws--mobile-chat';

  if (partnerMidParam) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className={wsClass}>
      <ConversationList
        activeId={active?.id ?? null}
        activeList={workspace.activeList}
        archivedList={workspace.archivedList}
        search={workspace.search}
        onSearch={workspace.setSearch}
        onOpen={(id) => {
          const convo = workspace.snap.conversations.find((c) => c.id === id);
          if (convo?.kind === 'person' && convo.membershipId) {
            void navigate(`/coach/person/${encodeURIComponent(convo.membershipId)}`);
            return;
          }
          workspace.open(id);
        }}
        onNew={() => setNewOpen(true)}
        onDelete={async (id) => {
          await workspace.remove(id);
        }}
      />

      <div className="coach-ws__chat">
        {active ? (
          <div className="coach-page">
            <div className="coach-page__header space-y-3">
              <div className="coach-ws__chat-bar coach-ws__chat-bar--back">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  fullWidth={false}
                  onClick={() => workspace.showList()}
                >
                  ← {t('coach.ws.back')}
                </Button>
              </div>

              {isContactCoach ? (
                contact ? (
                  <ContactCoachHeader contact={contact} />
                ) : (
                  <div className="rounded-2xl border border-line bg-surface px-3 py-2.5">
                    <p className="text-sm font-bold leading-tight">
                      {displayConversationTitle(active, t)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">{t('common.loading')}</p>
                  </div>
                )
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <img
                      src="/brand/ascendos-symbol-mono-v2.png"
                      alt=""
                      className="h-8 w-auto"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="truncate text-lg font-bold leading-tight">
                        {displayConversationTitle(active, t)}
                      </p>
                      <p className="text-xs text-muted">{t('coach.subtitle')}</p>
                    </div>
                  </div>

                  {active.kind === 'ceo' ||
                  active.kind === 'leadership' ||
                  active.kind === 'general' ? (
                    <CoachBriefingPanel
                      intelligence={intelligence}
                      isMorning={isMorning}
                      isLoading={intelLoading}
                      onAskAbout={(text) => setInput(text)}
                    />
                  ) : null}

                  {partnerInsight ? (
                    <Card padding="sm">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">
                        {t('coach.analysis', { name: partnerInsight.name })}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold">
                        {partnerInsight.currentSituation}
                      </p>
                      <p className="mt-2 text-xs font-medium text-ink">
                        {partnerInsight.nextBestAction}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {t('coach.whyPrefix', { reason: partnerInsight.nextBestActionWhy })}
                      </p>
                      {partnerInsight.possibleObjection ? (
                        <p className="mt-1 text-xs text-muted">
                          {t('coach.possibleObjection', { text: partnerInsight.possibleObjection })}
                        </p>
                      ) : null}
                      <p className="mt-2 whitespace-pre-wrap text-xs text-ink">
                        {partnerInsight.suggestedWhatsApp}
                      </p>
                      <p className="mt-2 text-xs text-muted">
                        {t('coach.probs', {
                          reg: partnerInsight.probabilityOfRegistration,
                          inactive: partnerInsight.probabilityOfInactivity,
                          risk: partnerInsight.riskScore,
                        })}
                      </p>
                      {partnerInsight.recommendation ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="mt-2"
                          onClick={() => {
                            setInput(
                              t('coach.improveDraft', {
                                name: partnerInsight.name,
                                draft: partnerInsight.suggestedWhatsApp,
                              })
                            );
                          }}
                        >
                          {t('coach.prepMessage')}
                        </Button>
                      ) : null}
                    </Card>
                  ) : null}

                  {partnerName ? (
                    <Card padding="sm">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">
                        {t('coach.teamContext')}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold">{partnerName}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {t('coach.teamContextHint', { name: partnerName })}
                        {partnerMid ? t('coach.andTeamStructure') : ''}.
                      </p>
                    </Card>
                  ) : null}
                </>
              )}
            </div>

            <div
              ref={scrollerRef}
              className="coach-page__thread coach-thread"
              onScroll={updateStick}
            >
              {showWelcome ? (
                <CoachBubble animate>
                  <CoachMarkdown content={t('coach.welcome')} />
                </CoachBubble>
              ) : null}

              {messages?.map((m) =>
                m.role === 'user' ? (
                  <UserBubble key={m.id} animate={animateIds.has(m.id)}>
                    {linkifyText(displayUserContent(m.content))}
                  </UserBubble>
                ) : (
                  <CoachBubble key={m.id} animate={animateIds.has(m.id)}>
                    <CoachMarkdown content={m.content} animate={animateIds.has(m.id)} />
                  </CoachBubble>
                )
              )}

              {send.isPending ? <CoachBubble pending animate /> : null}
              {error ? <Alert tone="error">{error}</Alert> : null}
            </div>

            <div className="coach-page__composer space-y-2 border-t border-line pt-3">
              {showContactSuggestions && contactChips.length > 0 ? (
                <ContactQuickActionCards
                  items={contactChips}
                  onPick={setInput}
                  ariaLabel={t('coach.contactPlaceholder', {
                    name:
                      (contact?.name ?? active.partnerName ?? active.title).split(' ')[0] ??
                      t('coach.ws.kind.person'),
                  })}
                />
              ) : null}
              {showWelcome && freeChatChips.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {freeChatChips.map((chip) => (
                    <Button
                      key={chip.label}
                      type="button"
                      variant="secondary"
                      size="chip"
                      fullWidth={false}
                      onClick={() => setInput(chip.text)}
                    >
                      {chip.label}
                    </Button>
                  ))}
                </div>
              ) : null}
              <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit(input);
                }}
              >
                <div className="min-w-0 flex-1">
                  <Input
                    label={t('coach.inputLabel')}
                    hideLabel
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                      isContactCoach
                        ? t('coach.contactPlaceholder', {
                            name:
                              (contact?.name ?? active.partnerName ?? active.title).split(' ')[0] ??
                              t('coach.ws.kind.person'),
                          })
                        : partnerName
                          ? t('coach.contactPlaceholder', {
                              name: partnerName.split(' ')[0] ?? partnerName,
                            })
                          : t('coach.inputPlaceholder')
                    }
                    autoComplete="off"
                    enterKeyHint="send"
                  />
                </div>
                <Button
                  type="submit"
                  size="md"
                  fullWidth={false}
                  disabled={send.isPending || !input.trim()}
                  aria-label={t('coach.send')}
                  className="!px-4"
                >
                  →
                </Button>
              </form>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <img
              src="/brand/ascendos-symbol-mono-v2.png"
              alt=""
              className="h-10 w-auto"
              aria-hidden
            />
            <p className="text-lg font-bold">{t('coach.name')}</p>
            <p className="text-sm text-muted">{t('coach.ws.pickHint')}</p>
            <Button type="button" fullWidth={false} onClick={() => setNewOpen(true)}>
              + {t('coach.ws.new')}
            </Button>
          </div>
        )}
      </div>

      <NewConversationSheet
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onChoose={onChooseKind}
      />
    </div>
  );
}
