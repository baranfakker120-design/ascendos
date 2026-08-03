import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { phaseLabel } from '@shared/lib/pipeline';
import { Alert } from '@shared/ui/Alert';
import { Card } from '@shared/ui/Card';
import { CoachBubble, UserBubble } from './CoachBubbles';
import { useCoachContact, useCoachMessages, useLatestConvo, useSendToCoach } from './coachApi';
import './coach-chat.css';

/** Kontext-Chips (Phase 3): zeigen, was der Coach kann — statt leerem Feld. */
const CHIPS = [
  { label: '🛡️ Einwand behandeln', text: 'Hilf mir, diesen Einwand zu behandeln: ' },
  { label: '✍️ Nachricht formulieren', text: 'Formuliere mir eine Nachricht für diese Situation: ' },
  { label: '🎯 Gespräch vorbereiten', text: 'Bereite mich auf das nächste Gespräch vor.' },
];

/**
 * Erkennt bare URLs in einer Coach-Antwort und macht sie anklickbar.
 */
const URL_PATTERN = /(https?:\/\/[^\s]+[^\s.,;:!?)\]"'])/g;

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
    ),
  );
}

export function CoachPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const contactId = searchParams.get('kontakt');
  const conversationId = searchParams.get('c');
  const { data: contact } = useCoachContact(contactId);
  const setConversationId = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('c', id);
    setSearchParams(next, { replace: true });
  };
  const { data: latestConvoId } = useLatestConvo(contactId, !conversationId);
  useEffect(() => {
    if (!conversationId && latestConvoId) setConversationId(latestConvoId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestConvoId, conversationId]);

  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { data: messages } = useCoachMessages(conversationId);
  const send = useSendToCoach();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, send.isPending]);

  const submit = async (text: string) => {
    const message = text.trim();
    if (!message || send.isPending) return;
    setError(null);
    setInput('');
    try {
      const result = await send.mutateAsync({ message, conversationId, contactId });
      setConversationId(result.conversationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ascent ist gerade nicht erreichbar.');
      setInput(message);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 pb-3">
        <div className="flex items-center gap-3">
          <img
            src="/brand/ascendos-symbol-mono-v2.png"
            alt=""
            className="h-8 w-auto"
            aria-hidden
          />
          <div>
            <p className="text-lg font-bold leading-tight">Ascent</p>
            <p className="text-xs text-muted">Dein persönlicher Coach</p>
          </div>
        </div>
        {contact ? (
          <Card className="py-3">
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
        ) : null}
      </div>

      <div className="flex-1 space-y-3.5 overflow-y-auto pb-3">
        {!messages?.length && !send.isPending ? (
          <CoachBubble>
            <p className="font-medium">Womit kann ich dich weiterbringen?</p>
            <p className="mt-1 text-sm text-muted">
              Ich arbeite mit deiner Pipeline und den Teamdokumenten — und ende immer mit einem
              konkreten nächsten Schritt.
            </p>
          </CoachBubble>
        ) : null}

        {messages?.map((m) =>
          m.role === 'user' ? (
            <UserBubble key={m.id}>{linkifyText(m.content)}</UserBubble>
          ) : (
            <CoachBubble key={m.id}>{linkifyText(m.content)}</CoachBubble>
          ),
        )}

        {send.isPending ? <CoachBubble pending>Ascent denkt nach …</CoachBubble> : null}

        {error ? <Alert tone="error">{error}</Alert> : null}
        <div ref={bottomRef} />
      </div>

      <div className="space-y-2 border-t border-line pt-3">
        {!messages?.length ? (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {CHIPS.map((chip) => (
              <button
                key={chip.label}
                onClick={() => setInput(chip.text)}
                className="whitespace-nowrap rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-transform active:scale-[0.97]"
              >
                {chip.label}
              </button>
            ))}
          </div>
        ) : null}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={contact ? `Frage zu ${contact.name.split(' ')[0]} …` : 'Nachricht an Ascent …'}
            className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 text-base placeholder:text-muted focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={send.isPending || !input.trim()}
            aria-label="Senden"
            className="h-12 shrink-0 rounded-xl bg-primary px-4 font-semibold text-primary-ink transition-transform enabled:active:scale-[0.97] disabled:opacity-50"
          >
            →
          </button>
        </form>
      </div>
    </div>
  );
}
