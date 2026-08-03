import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { phaseLabel } from '@shared/lib/pipeline';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { Input } from '@shared/ui/Input';
import { CoachBubble, UserBubble } from './CoachBubbles';
import { CoachMarkdown } from './CoachMarkdown';
import { useCoachContact, useCoachMessages, useLatestConvo, useSendToCoach } from './coachApi';
import './coach-chat.css';

const CHIPS = [
  { label: '🛡️ Einwand behandeln', text: 'Hilf mir, diesen Einwand zu behandeln: ' },
  {
    label: '✍️ Nachricht formulieren',
    text: 'Formuliere mir eine Nachricht für diese Situation: ',
  },
  { label: '🎯 Gespräch vorbereiten', text: 'Bereite mich auf das nächste Gespräch vor.' },
];

const URL_PATTERN = /(https?:\/\/[^\s]+[^\s.,;:!?)\]"'])/g;
const STICK_THRESHOLD_PX = 96;

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
 * ChatGPT-stable coach layout:
 * header (shrink) + thread scroller (flex) + composer (shrink).
 * Auto-stick only when the user is already near the bottom.
 */
export function CoachPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const contactId = searchParams.get('kontakt');
  const partnerName = searchParams.get('partner');
  const partnerMid = searchParams.get('mid');
  const conversationId = searchParams.get('c');
  const { data: contact } = useCoachContact(contactId);

  const setConversationId = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      next.set('c', id);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  // When contact context changes, drop a stale convo id so we resolve the
  // contact-scoped latest thread instead of mixing banner + wrong history.
  const prevContactRef = useRef(contactId);
  useEffect(() => {
    if (prevContactRef.current === contactId) return;
    prevContactRef.current = contactId;
    if (conversationId) {
      const next = new URLSearchParams(searchParams);
      next.delete('c');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  const { data: latestConvoId } = useLatestConvo(contactId, !conversationId);
  useEffect(() => {
    if (!conversationId && latestConvoId) setConversationId(latestConvoId);
  }, [latestConvoId, conversationId, setConversationId]);

  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { data: messages, isPending: messagesPending } = useCoachMessages(conversationId);
  const send = useSendToCoach();

  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [animateIds, setAnimateIds] = useState<Set<string>>(() => new Set());

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
      // Drop animation flags after the spring finishes so remounts stay quiet.
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
  }, [messages, send.isPending]);

  const submit = async (text: string) => {
    const message = text.trim();
    if (!message || send.isPending) return;
    setError(null);
    setInput('');
    stickToBottomRef.current = true;
    try {
      const result = await send.mutateAsync({ message, conversationId, contactId });
      setConversationId(result.conversationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ascent ist gerade nicht erreichbar.');
      setInput(message);
    }
  };

  const showWelcome = !send.isPending && !messages?.length && !(conversationId && messagesPending);

  return (
    <div className="coach-page">
      <div className="coach-page__header space-y-3">
        <div className="flex items-center gap-3">
          <img src="/brand/ascendos-symbol-mono-v2.png" alt="" className="h-8 w-auto" aria-hidden />
          <div>
            <p className="text-lg font-bold leading-tight">Ascent</p>
            <p className="text-xs text-muted">Dein persönlicher Mentor</p>
          </div>
        </div>
        {contact ? (
          <Card padding="sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Ascent kennt bereits
            </p>
            <p className="mt-0.5 text-sm font-semibold">
              {contact.name} · {phaseLabel(contact.phase)}
              <Link to={`/kontakte/${contact.id}`} className="ml-2 font-medium text-primary">
                Kontakt ansehen
              </Link>
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Phase, letzte Ereignisse und dein geplanter nächster Schritt werden automatisch
              mitgegeben — du musst nichts erklären.
            </p>
          </Card>
        ) : partnerName ? (
          <Card padding="sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Team-Kontext</p>
            <p className="mt-0.5 text-sm font-semibold">{partnerName}</p>
            <p className="mt-0.5 text-xs text-muted">
              Frag z. B.: „Wie helfe ich {partnerName} heute?“ — Ascent nutzt deinen Leadership-
              Kontext{partnerMid ? ' und die Teamstruktur' : ''}.
            </p>
          </Card>
        ) : null}
      </div>

      <div ref={scrollerRef} className="coach-page__thread coach-thread" onScroll={updateStick}>
        {showWelcome ? (
          <CoachBubble animate>
            <CoachMarkdown
              content={
                'Ich bin Ascent — dein Mentor für den Alltag im Business.\n\nKein Theorie-Marathon. Eine klare Einsicht, warum sie zählt, und was du als Nächstes tust.\n\nNächster Schritt: Sag mir, woran du gerade arbeitest — Einwand, Nachricht oder nächster Move mit einem Kontakt.'
              }
            />
          </CoachBubble>
        ) : null}

        {messages?.map((m) =>
          m.role === 'user' ? (
            <UserBubble key={m.id} animate={animateIds.has(m.id)}>
              {linkifyText(m.content)}
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
            {CHIPS.map((chip) => (
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
              label="Nachricht an Ascent"
              hideLabel
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                contact ? `Frage zu ${contact.name.split(' ')[0]} …` : 'Nachricht an Ascent …'
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
            aria-label="Senden"
            className="!px-4"
          >
            →
          </Button>
        </form>
      </div>
    </div>
  );
}
