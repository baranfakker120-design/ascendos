import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useI18n } from '@shared/i18n';
import { phaseLabel } from '@shared/lib/pipeline';
import { DRAFT_SCOPES, usePersistedDraft } from '@shared/offline';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { Input } from '@shared/ui/Input';
import { CoachBubble, UserBubble } from './CoachBubbles';
import { CoachMarkdown } from './CoachMarkdown';
import { useCoachContact, useCoachMessages, useSendToCoach } from './coachApi';
import { createCoachTranslator } from './i18n';
import { CoachBriefingPanel, findPersonInsight, useCoachOrgIntelligence } from './intelligence';
import {
  ConversationList,
  NewConversationSheet,
  buildPersonContextBrief,
  composeOutboundMessage,
  defaultTitleForKind,
  readPendingSeed,
  useCoachWorkspace,
  type ConversationKind,
} from './workspace';
import { buildProactiveSuggestions } from './executive';
import './coach-chat.css';
import './workspace/coach-workspace.css';
import './executive/executive.css';

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

  const active = workspace.active;
  const contactId = active?.contactId ?? contactIdParam;
  const partnerName = active?.partnerName ?? partnerNameParam;
  const partnerMid = active?.membershipId ?? partnerMidParam;
  const conversationId = active?.serverConversationId ?? null;

  const { data: contact } = useCoachContact(contactId);
  const { intelligence, isMorning, isLoading: intelLoading } = useCoachOrgIntelligence(true);
  const partnerInsight = findPersonInsight(intelligence, partnerMid);

  const chips = useMemo(() => {
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

  const draftScope = DRAFT_SCOPES.coachThread(active?.id ?? 'none');
  const {
    value: { text: input },
    patch: patchInputDraft,
    clear: clearInputDraft,
  } = usePersistedDraft(draftScope, { text: '' }, { enabled: !!active });
  const setInput = (text: string) => patchInputDraft({ text });

  const [error, setError] = useState<string | null>(null);
  const { data: messages, isPending: messagesPending } = useCoachMessages(conversationId);
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
  useEffect(() => {
    if (!workspace.hydrated || !active) return;
    const next = new URLSearchParams();
    if (active.serverConversationId) next.set('c', active.serverConversationId);
    if (active.contactId) next.set('kontakt', active.contactId);
    if (active.partnerName) next.set('partner', active.partnerName);
    if (active.membershipId) next.set('mid', active.membershipId);
    next.set('ws', active.id);

    const cur = typeof window !== 'undefined' ? window.location.search.replace(/^\?/, '') : '';
    const nxt = next.toString();
    if (cur !== nxt) setSearchParams(next, { replace: true });
  }, [active, workspace.hydrated, setSearchParams]);

  // Deep links: contact / genealogy person / kind+seed → find-or-create conversation.
  useEffect(() => {
    if (!workspace.hydrated) return;
    const seed = pendingSeedRef.current;
    const deepKey = [
      contactIdParam ?? '',
      partnerMidParam ?? '',
      partnerNameParam ?? '',
      kindParam ?? '',
      urlConvo ?? '',
      seed ? 'seed' : '',
    ].join('|');
    if (
      !contactIdParam &&
      !partnerMidParam &&
      !partnerNameParam &&
      !urlConvo &&
      !kindParam &&
      !seed
    ) {
      deepLinkHandled.current = null;
      return;
    }
    if (deepLinkHandled.current === deepKey) return;
    deepLinkHandled.current = deepKey;

    if (partnerMidParam || partnerNameParam) {
      const name = partnerNameParam || t('coach.ws.kind.person');
      const brief = buildPersonContextBrief({
        name,
        membershipId: partnerMidParam,
        insight: findPersonInsight(intelligence, partnerMidParam),
      });
      const ask =
        seed ||
        (partnerInsight
          ? t('coach.personAsk', {
              name: partnerInsight.name,
              why: partnerInsight.nextBestActionWhy,
              action: partnerInsight.nextBestAction,
            })
          : null);
      workspace.ensureKind('person', {
        title: name,
        partnerName: name,
        membershipId: partnerMidParam,
        seedPrompt: ask,
        contextBrief: brief,
      });
      return;
    }

    if (contactIdParam) {
      workspace.ensureKind('person', {
        title: contact?.name ?? t('coach.ws.kind.person'),
        contactId: contactIdParam,
        seedPrompt: seed,
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
    contactIdParam,
    partnerMidParam,
    partnerNameParam,
    kindParam,
    urlConvo,
    intelligence,
    contact?.name,
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

  // Keep contact title fresh once loaded.
  useEffect(() => {
    if (!active || !contact || active.contactId !== contact.id) return;
    if (active.title === contact.name) return;
    workspace.updateActive({ title: contact.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id, contact?.name, active?.id]);

  // Enrich person brief when intelligence arrives after deep link.
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
    !!active && !send.isPending && !messages?.length && !(conversationId && messagesPending);

  const mobilePane = workspace.snap.mobilePane;
  const wsClass =
    mobilePane === 'list' ? 'coach-ws coach-ws--mobile-list' : 'coach-ws coach-ws--mobile-chat';

  return (
    <div className={wsClass}>
      <ConversationList
        activeId={active?.id ?? null}
        activeList={workspace.activeList}
        archivedList={workspace.archivedList}
        search={workspace.search}
        onSearch={workspace.setSearch}
        onOpen={(id) => workspace.open(id)}
        onNew={() => setNewOpen(true)}
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

              <div className="flex items-center gap-3">
                <img
                  src="/brand/ascendos-symbol-mono-v2.png"
                  alt=""
                  className="h-8 w-auto"
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold leading-tight">{active.title}</p>
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
                  <p className="mt-0.5 text-sm font-semibold">{partnerInsight.currentSituation}</p>
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

              {contact ? (
                <Card padding="sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    {t('coach.knowsAlready')}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold">
                    {contact.name} · {phaseLabel(contact.phase, t)}
                    <Link to={`/kontakte/${contact.id}`} className="ml-2 font-medium text-primary">
                      {t('coach.viewContact')}
                    </Link>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{t('coach.contextHint')}</p>
                </Card>
              ) : partnerName ? (
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
              {showWelcome ? (
                <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {chips.map((chip) => (
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
                      contact
                        ? t('coach.contactPlaceholder', {
                            name: contact.name.split(' ')[0] ?? contact.name,
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
