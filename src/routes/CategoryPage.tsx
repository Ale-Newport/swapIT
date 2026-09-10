import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getCategory } from '@/core/categories';
import { usePrefs } from '@/core/prefs';
import { getTool, toolsByCategory } from '@/core/registry';
import type { CategoryId, ToolDefinition } from '@/core/types';
import { ToolGrid } from '@/components/ToolCard';
import { EmptyState, Icon, Input } from '@/components/ui';

export function CategoryPage() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const [query, setQuery] = useState('');
  const category = getCategory((categoryId ?? 'images') as CategoryId);
  const tools = useMemo(() => toolsByCategory(category.id), [category.id]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.keywords ?? []).some((k) => k.toLowerCase().includes(q)),
    );
  }, [tools, query]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-6 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-panel text-ink-soft ring-1 ring-line">
            <Icon name={category.icon} size={17} />
          </span>
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-ink">{category.name}</h1>
            <p className="text-[12.5px] text-ink-faint">
              {category.description} · {tools.length} tool{tools.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Filter ${category.name.toLowerCase()}…`}
          className="w-56"
        />
      </header>

      {filtered.length === 0 ? (
        <EmptyState
          icon="SearchX"
          title="Nothing matches that filter"
          description={`No ${category.name.toLowerCase()} tool matches “${query}”.`}
        />
      ) : (
        <ToolGrid tools={filtered} />
      )}
    </div>
  );
}

export function FavoritesPage() {
  const favorites = usePrefs((s) => s.favorites);
  const tools = favorites.map(getTool).filter((t): t is ToolDefinition => Boolean(t));

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-6 py-6">
      <header>
        <h1 className="text-[17px] font-semibold tracking-tight text-ink">Favorites</h1>
        <p className="mt-0.5 text-[12.5px] text-ink-faint">
          Pin tools with the star on any card to keep them here and at the top of the command palette.
        </p>
      </header>
      {tools.length === 0 ? (
        <EmptyState
          icon="Star"
          title="No favorites yet"
          description="Hover any tool card and click the star to pin it."
        />
      ) : (
        <ToolGrid tools={tools} />
      )}
    </div>
  );
}
