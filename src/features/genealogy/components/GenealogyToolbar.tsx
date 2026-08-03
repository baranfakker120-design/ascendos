import type { GenealogyFilter } from '../types';

const FILTERS: { id: GenealogyFilter; label: string }[] = [
  { id: 'all', label: 'Alle' },
  { id: 'leaders', label: 'Leader' },
  { id: 'berater', label: 'Berater' },
  { id: 'new', label: 'Neu' },
  { id: 'inactive', label: 'Inaktiv' },
  { id: 'high_ap', label: 'AP 250+' },
];

interface GenealogyToolbarProps {
  search: string;
  onSearch: (value: string) => void;
  filter: GenealogyFilter;
  onFilter: (value: GenealogyFilter) => void;
  mode: 'tree' | 'list';
  onMode: (mode: 'tree' | 'list') => void;
  count: number;
}

export function GenealogyToolbar({
  search,
  onSearch,
  filter,
  onFilter,
  mode,
  onMode,
  count,
}: GenealogyToolbarProps) {
  return (
    <div className="genealogy-toolbar space-y-2">
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="genealogy-search">
          Team suchen
        </label>
        <input
          id="genealogy-search"
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Name, Rang, Username…"
          className="min-h-[42px] flex-1 rounded-xl border border-line bg-white/75 px-3 text-sm shadow-[0_1px_0_rgb(255_255_255/0.8)_inset] outline-none backdrop-blur focus:border-accent"
          autoComplete="off"
        />
        <div className="flex shrink-0 overflow-hidden rounded-xl border border-line bg-white/70 text-xs font-semibold">
          <button
            type="button"
            className={`px-2.5 py-2 ${mode === 'tree' ? 'bg-ink text-primary-ink' : 'text-muted'}`}
            onClick={() => onMode('tree')}
          >
            Baum
          </button>
          <button
            type="button"
            className={`px-2.5 py-2 ${mode === 'list' ? 'bg-ink text-primary-ink' : 'text-muted'}`}
            onClick={() => onMode('list')}
          >
            Liste
          </button>
        </div>
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onFilter(f.id)}
            className={[
              'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold tracking-wide transition',
              filter === f.id
                ? 'border-accent bg-accent/15 text-accent-deep'
                : 'border-line bg-white/60 text-muted',
            ].join(' ')}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto shrink-0 self-center pr-1 text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
          {count} Partner
        </span>
      </div>
    </div>
  );
}
