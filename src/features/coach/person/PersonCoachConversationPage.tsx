import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '@shared/i18n';
import { DRAFT_SCOPES, usePersistedDraft } from '@shared/offline';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { Input } from '@shared/ui/Input';
import { RankFrame } from '@shared/ui/RankFrame';
import { resolveDisplayFrameKey } from '@shared/lib/frameAssets';
import { useGenealogyTree } from '@features/genealogy/genealogyApi';
import { displayName } from '@features/genealogy/genealogyUtils';
import { CoachBubble, UserBubble } from '../CoachBubbles';
import { CoachMarkdown } from '../CoachMarkdown';
import { useCoachMessages, useSendToCoach } from '../coachApi';
import { createCoachTranslator } from '../i18n';
import { findPersonInsight, useCoachOrgIntelligence } from '../intelligence';
import {
  buildPersonContextBrief,
  composeOutboundMessage,
  readPendingSeed,
  useCoachWorkspace,
} from '../workspace';
import { PersonQuickActions } from './PersonQuickActions';
import { WhatsAppMessageCard } from './WhatsAppMessageCard';
import { extractWhatsAppDraft } from './extractWhatsAppDraft';
import '../coach-chat.css';
import './person-coach-conversation.css';

const CONTEXT_MARKER = '\n\n---\n\n';
const STICK_THRESHOLD_PX = 96;

function displayUserContent(content: string): string {
  const idx = content.indexOf(CONTEXT_MARKER);
  if (idx >= 0) return content.slice(idx + CONTEXT_MARKER.length);
  return content;
}

/**
 * Full-screen Ascend Coach conversation for one team member.
 * No overlay, no conversation-list chrome — ChatGPT-style thread with person chip.
 */
export function PersonCoachConversationPage() {
  const { membershipId = '' } = useParams<{ membershipId: string }>();
  const navigate = useNavigate();
  const { locale, t } = useI18n();
  const coachT = useMemo(() => createCoachTranslator(locale), [locale]);

  const { data: nodes = [] } = useGenealogyTree();
  const node = useMemo(
    () => nodes.find((n) => n.membershipId === membershipId) ?? null,
    [nodes, membershipId]
  );
  const personName = node ? displayName(node) : t('coach.ws.kind.person');

  const workspace = useCoachWorkspace();
  const { intelligence } = useCoachOrgIntelligence(true);
  const partnerInsight = findPersonInsight(intelligence, membershipId);

  const seedRef = useRef<string | null | undefined>(undefined);
  if (seedRef.current === undefined) seedRef.current = readPendingSeed();
  const openedRef = useRef(false);

  useEffect(() => {
    if (!workspace.hydrated || !membershipId || openedRef.current) return;
    openedRef.current = true;
    const brief = buildPersonContextBrief({
      name: personName,
      membershipId,
      insight: partnerInsight,
    });
    workspace.ensureKind('person', {
      title: personName,
      partnerName: personName,
      membershipId,
      seedPrompt: seedRef.current,
      contextBrief: brief,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.hydrated, membershipId, personName]);

  const active = workspace.active?.membershipId === membershipId ? workspace.active : null;

  useEffect(() => {
    if (!active || active.contextAttached || !partnerInsight) return;
    const brief = buildPersonContextBrief({
      name: personName,
      membershipId,
      insight: partnerInsight,
    });
    if (brief !== active.contextBrief) {
      workspace.updateActive({ contextBrief: brief, partnerName: personName, title: personName });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerInsight, active?.id, membershipId, personName]);

  const conversationId = active?.serverConversationId ?? null;
  const { data: messages, isPending: messagesPending } = useCoachMessages(conversationId);
  const send = useSendToCoach();

  const draftScope = DRAFT_SCOPES.coachThread(active?.id ?? `person:${membershipId}`);
  const {
    value: { text: input },
    patch: patchInputDraft,
    clear: clearInputDraft,
  } = usePersistedDraft(draftScope, { text: '' }, { enabled: !!active });
  const setInput = (text: string) => patchInputDraft({ text });

  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [animateIds, setAnimateIds] = useState<Set<string>>(() => new Set());
  const threadKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = active?.id ?? null;
    if (threadKeyRef.current === key) return;
    threadKeyRef.current = key;
    seenIdsRef.current = new Set();
    setAnimateIds(new Set());
    stickToBottomRef.current = true;
    setError(null);
  }, [active?.id]);

  useEffect(() => {
    if (!active?.seedPrompt) return;
    if (messagesPending) return;
    if (messages && messages.length > 0) return;
    if (input.trim()) return;
    setInput(active.seedPrompt);
    workspace.updateActive({ seedPrompt: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.seedPrompt, messages, messagesPending]);

  const updateStick = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD_PX;
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
    if (el) el.scrollTop = el.scrollHeight;
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

  const showWelcome =
    !!active && !send.isPending && !messages?.length && !(conversationId && messagesPending);

  const frameKey = node
    ? resolveDisplayFrameKey({
        role: node.role,
        rankFrameKey: node.frameAsset,
        isBeraterDesMonats: node.isBeraterDesMonats,
      })
    : 'default';

  const backToCoachOverview = () => {
    navigate(`/team?member=${encodeURIComponent(membershipId)}&tab=coach`);
  };

  const openMemberProfile = () => {
    navigate(`/team?member=${encodeURIComponent(membershipId)}&tab=overview`);
  };

  return (
    <div className="person-coach">
      <header className="person-coach__top">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          fullWidth={false}
          onClick={backToCoachOverview}
        >
          ← {t('common.back')}
        </Button>
        <h1 className="person-coach__title">{t('coach.personScreenTitle')}</h1>
        <button
          type="button"
          className="person-coach__chip"
          onClick={openMemberProfile}
          title={t('coach.personChipOpenProfile', { name: personName })}
        >
          {node ? (
            <RankFrame
              frameKey={frameKey}
              src={node.avatarUrl}
              name={personName}
              size="sm"
              className="person-coach__chip-avatar"
            />
          ) : (
            <span
              className="person-coach__chip-avatar person-coach__chip-avatar--fallback"
              aria-hidden
            >
              👤
            </span>
          )}
          <span className="person-coach__chip-name">{personName}</span>
        </button>
      </header>

      <div ref={scrollerRef} className="person-coach__thread coach-thread" onScroll={updateStick}>
        {showWelcome ? (
          <CoachBubble animate>
            <CoachMarkdown content={t('coach.personWelcome', { name: personName })} />
          </CoachBubble>
        ) : null}

        {messages?.map((m) => {
          if (m.role === 'user') {
            return (
              <UserBubble key={m.id} animate={animateIds.has(m.id)}>
                {displayUserContent(m.content)}
              </UserBubble>
            );
          }
          const { draft, remainder } = extractWhatsAppDraft(m.content);
          return (
            <CoachBubble key={m.id} animate={animateIds.has(m.id)}>
              {remainder ? (
                <CoachMarkdown content={remainder} animate={animateIds.has(m.id)} />
              ) : null}
              {draft ? (
                <WhatsAppMessageCard text={draft} onEdit={(text) => setInput(text)} />
              ) : null}
            </CoachBubble>
          );
        })}

        {send.isPending ? <CoachBubble pending animate /> : null}
        {error ? <Alert tone="error">{error}</Alert> : null}
      </div>

      <div className="person-coach__composer">
        <PersonQuickActions
          personName={personName}
          disabled={send.isPending || !active}
          onSend={(text) => void submit(text)}
        />
        <form
          className="person-coach__form"
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
              placeholder={t('coach.contactPlaceholder', {
                name: personName.split(/\s+/)[0] || personName,
              })}
              autoComplete="off"
              enterKeyHint="send"
            />
          </div>
          <Button
            type="submit"
            size="md"
            fullWidth={false}
            disabled={send.isPending || !input.trim() || !active}
            aria-label={t('coach.send')}
            className="!px-4"
          >
            →
          </Button>
        </form>
        <p className="text-center text-[0.68rem] text-muted">
          <Link to="/coach" className="font-medium text-primary">
            {t('coach.personOpenWorkspace')}
          </Link>
        </p>
      </div>
    </div>
  );
}
