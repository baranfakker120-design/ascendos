import { useI18n, type MessageKey } from '@shared/i18n';
import { Button } from '@shared/ui/Button';
import { BottomSheet } from '@shared/ui/BottomSheet';
import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { displayConversationTitle } from './displayTitle';
import type { WorkspaceConversation } from './types';

function relativeStamp(iso: string, locale: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(t));
  } catch {
    return iso.slice(0, 10);
  }
}

const SWIPE_OPEN_PX = 72;
const SWIPE_ACTIVATE_PX = 12;

export function ConversationList({
  activeId,
  activeList,
  archivedList,
  search,
  onSearch,
  onOpen,
  onNew,
  onDelete,
}: {
  activeId: string | null;
  activeList: WorkspaceConversation[];
  archivedList: WorkspaceConversation[];
  search: string;
  onSearch: (q: string) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [pendingDelete, setPendingDelete] = useState<WorkspaceConversation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await onDelete(pendingDelete.id);
      setPendingDelete(null);
      setOpenSwipeId(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <aside className="coach-ws__list" aria-label={t('coach.ws.listAria')}>
      <div className="coach-ws__list-head">
        <div className="coach-ws__list-title">
          <h1>{t('coach.ws.title')}</h1>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            fullWidth={false}
            aria-label={t('coach.ws.new')}
            onClick={onNew}
          >
            +
          </Button>
        </div>
        <input
          className="ui-input"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={t('coach.ws.searchPlaceholder')}
          aria-label={t('coach.ws.search')}
          autoComplete="off"
        />
      </div>

      <div className="coach-ws__scroll">
        {activeList.length === 0 && archivedList.length === 0 ? (
          <p className="coach-ws__empty">{t('coach.ws.empty')}</p>
        ) : null}

        {activeList.map((c) => (
          <ConversationRow
            key={c.id}
            conversation={c}
            active={c.id === activeId}
            stamp={relativeStamp(c.lastOpenedAt || c.updatedAt, locale)}
            swipeOpen={openSwipeId === c.id}
            onSwipeOpen={(id) => setOpenSwipeId(id)}
            onSwipeClose={() => setOpenSwipeId((cur) => (cur === c.id ? null : cur))}
            onOpen={onOpen}
            onRequestDelete={(convo) => {
              setOpenSwipeId(null);
              setPendingDelete(convo);
            }}
          />
        ))}

        {archivedList.length ? (
          <>
            <p className="coach-ws__section">{t('coach.ws.archived')}</p>
            {archivedList.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                active={c.id === activeId}
                stamp={relativeStamp(c.lastOpenedAt || c.updatedAt, locale)}
                swipeOpen={openSwipeId === c.id}
                onSwipeOpen={(id) => setOpenSwipeId(id)}
                onSwipeClose={() => setOpenSwipeId((cur) => (cur === c.id ? null : cur))}
                onOpen={onOpen}
                onRequestDelete={(convo) => {
                  setOpenSwipeId(null);
                  setPendingDelete(convo);
                }}
              />
            ))}
          </>
        ) : null}
      </div>

      <BottomSheet
        open={!!pendingDelete}
        title={t('coach.ws.deleteTitle')}
        onClose={() => {
          if (!deleting) setPendingDelete(null);
        }}
      >
        <p className="text-sm text-muted">{t('coach.ws.deleteBody')}</p>
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant="secondary"
            fullWidth
            disabled={deleting}
            onClick={() => setPendingDelete(null)}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="primary"
            fullWidth
            disabled={deleting}
            onClick={() => void confirmDelete()}
          >
            {deleting ? t('common.saving') : t('common.delete')}
          </Button>
        </div>
      </BottomSheet>
    </aside>
  );
}

function ConversationRow({
  conversation,
  active,
  stamp,
  swipeOpen,
  onSwipeOpen,
  onSwipeClose,
  onOpen,
  onRequestDelete,
}: {
  conversation: WorkspaceConversation;
  active: boolean;
  stamp: string;
  swipeOpen: boolean;
  onSwipeOpen: (id: string) => void;
  onSwipeClose: () => void;
  onOpen: (id: string) => void;
  onRequestDelete: (conversation: WorkspaceConversation) => void;
}) {
  const { t } = useI18n();
  const kindKey = `coach.ws.kind.${conversation.kind}` as MessageKey;
  const title = displayConversationTitle(conversation, t);
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startY: number; dx: number; horizontal: boolean | null }>({
    startX: 0,
    startY: 0,
    dx: 0,
    horizontal: null,
  });

  const setOffset = useCallback((px: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${px}px, 0, 0)`;
  }, []);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      dx: swipeOpen ? -SWIPE_OPEN_PX : 0,
      horizontal: null,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const dx = e.clientX - drag.current.startX + (swipeOpen ? -SWIPE_OPEN_PX : 0);
    const dy = e.clientY - drag.current.startY;
    if (drag.current.horizontal === null) {
      if (Math.abs(dx) < SWIPE_ACTIVATE_PX && Math.abs(dy) < SWIPE_ACTIVATE_PX) return;
      drag.current.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!drag.current.horizontal) return;
    }
    if (!drag.current.horizontal) return;
    e.preventDefault();
    const clamped = Math.min(0, Math.max(-SWIPE_OPEN_PX, dx));
    drag.current.dx = clamped;
    setOffset(clamped);
  };

  const endPointer = (e: ReactPointerEvent) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (drag.current.horizontal) {
      if (drag.current.dx <= -SWIPE_OPEN_PX / 2) {
        setOffset(-SWIPE_OPEN_PX);
        onSwipeOpen(conversation.id);
      } else {
        setOffset(0);
        onSwipeClose();
      }
    }
    drag.current.horizontal = null;
  };

  return (
    <div className={`coach-ws__swipe${swipeOpen ? ' coach-ws__swipe--open' : ''}`}>
      <button
        type="button"
        className="coach-ws__swipe-action"
        aria-label={t('common.delete')}
        onClick={() => onRequestDelete(conversation)}
      >
        <TrashIcon />
      </button>
      <div
        ref={trackRef}
        className="coach-ws__swipe-track"
        style={{ transform: swipeOpen ? `translate3d(-${SWIPE_OPEN_PX}px, 0, 0)` : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <button
          type="button"
          className={`coach-ws__item${active ? ' coach-ws__item--on' : ''}`}
          onClick={() => {
            if (swipeOpen) {
              setOffset(0);
              onSwipeClose();
              return;
            }
            onOpen(conversation.id);
          }}
        >
          <span className="coach-ws__item-title">{title}</span>
          <span className="coach-ws__item-meta">{stamp}</span>
          <span className="coach-ws__item-preview">
            {conversation.preview?.trim() || t(kindKey)}
          </span>
        </button>
      </div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 3h6m-9 4h12m-1.5 0-.7 12.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9L5.5 7M10 11v6m4-6v6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
