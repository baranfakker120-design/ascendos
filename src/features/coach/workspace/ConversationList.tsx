import { useI18n, type MessageKey } from '@shared/i18n';
import { Button } from '@shared/ui/Button';
import { BottomSheet } from '@shared/ui/BottomSheet';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
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

const SWIPE_OPEN_PX = 76;
const SWIPE_ACTIVATE_PX = 10;

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
  const listRef = useRef<HTMLElement>(null);

  // Tap outside an open swipe row closes the action (iOS Mail / WhatsApp).
  useEffect(() => {
    if (!openSwipeId) return;
    const onPointerDown = (e: PointerEvent) => {
      const root = listRef.current;
      if (!root) return;
      const target = e.target as Node | null;
      if (!target || !root.contains(target)) {
        setOpenSwipeId(null);
        return;
      }
      const row = (target as Element).closest?.('[data-swipe-id]');
      if (!row || row.getAttribute('data-swipe-id') !== openSwipeId) {
        setOpenSwipeId(null);
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [openSwipeId]);

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

  const requestDelete = (convo: WorkspaceConversation) => {
    setOpenSwipeId(null);
    setPendingDelete(convo);
  };

  return (
    <aside ref={listRef} className="coach-ws__list" aria-label={t('coach.ws.listAria')}>
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
            onRequestDelete={requestDelete}
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
                onRequestDelete={requestDelete}
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
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    startX: number;
    startY: number;
    base: number;
    dx: number;
    horizontal: boolean | null;
  }>({
    startX: 0,
    startY: 0,
    base: 0,
    dx: 0,
    horizontal: null,
  });

  const setOffset = useCallback((px: number, withTransition: boolean) => {
    const el = trackRef.current;
    if (!el) return;
    el.style.transition = withTransition
      ? 'transform 220ms cubic-bezier(0.2, 0.9, 0.2, 1)'
      : 'none';
    el.style.transform = `translate3d(${px}px, 0, 0)`;
  }, []);

  // Sync closed/open state when another row opens or outside tap closes.
  useEffect(() => {
    if (dragging) return;
    setOffset(swipeOpen ? -SWIPE_OPEN_PX : 0, true);
  }, [swipeOpen, dragging, setOffset]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      base: swipeOpen ? -SWIPE_OPEN_PX : 0,
      dx: swipeOpen ? -SWIPE_OPEN_PX : 0,
      horizontal: null,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const rawDx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;

    if (drag.current.horizontal === null) {
      if (Math.abs(rawDx) < SWIPE_ACTIVATE_PX && Math.abs(dy) < SWIPE_ACTIVATE_PX) return;
      drag.current.horizontal = Math.abs(rawDx) > Math.abs(dy);
      if (!drag.current.horizontal) return;
      setDragging(true);
    }
    if (!drag.current.horizontal) return;

    e.preventDefault();
    const clamped = Math.min(0, Math.max(-SWIPE_OPEN_PX, drag.current.base + rawDx));
    drag.current.dx = clamped;
    setOffset(clamped, false);
  };

  const endPointer = (e: ReactPointerEvent) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.currentTarget.releasePointerCapture(e.pointerId);

    const wasHorizontal = drag.current.horizontal === true;
    const dx = drag.current.dx;
    drag.current.horizontal = null;
    setDragging(false);

    if (!wasHorizontal) return;

    if (dx <= -SWIPE_OPEN_PX * 0.45) {
      setOffset(-SWIPE_OPEN_PX, true);
      onSwipeOpen(conversation.id);
    } else {
      setOffset(0, true);
      onSwipeClose();
    }
  };

  const actionRevealed = swipeOpen || dragging;

  return (
    <div
      className={[
        'coach-ws__swipe',
        swipeOpen ? 'coach-ws__swipe--open' : '',
        dragging ? 'coach-ws__swipe--dragging' : '',
        actionRevealed ? 'coach-ws__swipe--revealed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-swipe-id={conversation.id}
    >
      <button
        type="button"
        className="coach-ws__swipe-action"
        aria-label={t('common.delete')}
        tabIndex={actionRevealed ? 0 : -1}
        aria-hidden={!actionRevealed}
        onClick={(e) => {
          e.stopPropagation();
          onRequestDelete(conversation);
        }}
      >
        <TrashIcon />
      </button>
      <div
        ref={trackRef}
        className="coach-ws__swipe-track"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <button
          type="button"
          className={`coach-ws__item${active ? ' coach-ws__item--on' : ''}`}
          onClick={() => {
            if (swipeOpen || drag.current.dx < -SWIPE_ACTIVATE_PX) {
              setOffset(0, true);
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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 3h6m-9 4h12m-1.5 0-.7 12.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9L5.5 7M10 11v6m4-6v6"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
