import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import './genealogy-viewer-shell.css';

interface GenealogyViewerShellProps {
  children: ReactNode;
  /** Tree body only (viewport / list) — sits under the expand affordance. */
  tree: ReactNode;
  memberCount: number;
  title?: string;
  /** Hide expand when list mode (or empty). */
  expandable?: boolean;
}

/**
 * Compact ↔ fullscreen container for the genealogy viewer.
 * Keeps a single mounted tree — expand only changes layout (fixed glass panel).
 * Camera / selection / collapse state live in children and are never remounted.
 */
export function GenealogyViewerShell({
  children,
  tree,
  memberCount,
  title = 'User Tree',
  expandable = true,
}: GenealogyViewerShellProps) {
  const titleId = useId();
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const [spacerPx, setSpacerPx] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const swipeStartY = useRef<number | null>(null);

  const measureSpacer = useCallback(() => {
    const el = panelRef.current;
    if (!el) return 0;
    return el.getBoundingClientRect().height;
  }, []);

  const open = useCallback(() => {
    setSpacerPx(measureSpacer());
    setClosing(false);
    setExpanded(true);
  }, [measureSpacer]);

  const finishClose = useCallback(() => {
    setExpanded(false);
    setClosing(false);
    setSpacerPx(0);
  }, []);

  const close = useCallback(() => {
    if (!expanded || closing) return;
    setClosing(true);
    window.setTimeout(finishClose, 300);
  }, [expanded, closing, finishClose]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus close after spring-in begins
    const t = window.setTimeout(() => closeRef.current?.focus(), 40);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      window.clearTimeout(t);
    };
  }, [expanded, close]);

  const onHeaderPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    swipeStartY.current = e.clientY;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onHeaderPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (swipeStartY.current == null) return;
    const dy = e.clientY - swipeStartY.current;
    swipeStartY.current = null;
    if (dy > 72) close();
  };

  return (
    <div
      className={[
        'genealogy-viewer-shell',
        expanded ? 'genealogy-viewer-shell--expanded' : 'genealogy-viewer-shell--compact',
        closing ? 'is-closing' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {expanded ? (
        <div
          className="genealogy-viewer-shell__spacer"
          style={{ height: spacerPx || undefined }}
          aria-hidden
        />
      ) : null}

      {expanded ? (
        <button
          type="button"
          className="genealogy-viewer-shell__backdrop"
          aria-label="Vollbild schließen"
          onClick={close}
        />
      ) : null}

      <div
        ref={panelRef}
        className="genealogy-viewer-shell__panel"
        role={expanded ? 'dialog' : undefined}
        aria-modal={expanded ? true : undefined}
        aria-labelledby={expanded ? titleId : undefined}
      >
        {expanded ? (
          <div
            className="genealogy-viewer-shell__header"
            onPointerDown={onHeaderPointerDown}
            onPointerUp={onHeaderPointerUp}
            onPointerCancel={() => {
              swipeStartY.current = null;
            }}
          >
            <h2 id={titleId} className="genealogy-viewer-shell__title">
              {title} <span className="genealogy-viewer-shell__count">({memberCount} members)</span>
            </h2>
            <button
              ref={closeRef}
              type="button"
              className="genealogy-viewer-shell__close"
              aria-label="Schließen"
              onClick={close}
            >
              ✕
            </button>
          </div>
        ) : null}

        <div className="genealogy-viewer-shell__chrome">
          {/* Search + filters stay mounted in both modes */}
          {children}

          <div className="genealogy-viewer-shell__body">
            {tree}
            {expandable && !expanded ? (
              <button
                type="button"
                className="genealogy-viewer-shell__expand"
                aria-label="Teambaum vergrößern"
                title="Vollbild"
                onClick={open}
              >
                ⛶
              </button>
            ) : null}
          </div>

          {expanded ? (
            <p className="genealogy-viewer-shell__hint">
              Drag to pan, Scroll to zoom, Click to select
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
