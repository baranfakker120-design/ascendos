import { useI18n, type MessageKey } from '@shared/i18n';
import { Button } from '@shared/ui/Button';
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

export function ConversationList({
  activeId,
  activeList,
  archivedList,
  search,
  onSearch,
  onOpen,
  onNew,
}: {
  activeId: string | null;
  activeList: WorkspaceConversation[];
  archivedList: WorkspaceConversation[];
  search: string;
  onSearch: (q: string) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const { t, locale } = useI18n();

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
            onOpen={onOpen}
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
                onOpen={onOpen}
              />
            ))}
          </>
        ) : null}
      </div>
    </aside>
  );
}

function ConversationRow({
  conversation,
  active,
  stamp,
  onOpen,
}: {
  conversation: WorkspaceConversation;
  active: boolean;
  stamp: string;
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  const kindKey = `coach.ws.kind.${conversation.kind}` as MessageKey;
  return (
    <button
      type="button"
      className={`coach-ws__item${active ? ' coach-ws__item--on' : ''}`}
      onClick={() => onOpen(conversation.id)}
    >
      <span className="coach-ws__item-title">{conversation.title}</span>
      <span className="coach-ws__item-meta">{stamp}</span>
      <span className="coach-ws__item-preview">{conversation.preview?.trim() || t(kindKey)}</span>
    </button>
  );
}
