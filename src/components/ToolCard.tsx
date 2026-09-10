import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { usePrefs } from '@/core/prefs';
import type { ToolDefinition } from '@/core/types';
import { Icon } from '@/components/ui';

export function ToolCard({ tool, compact }: { tool: ToolDefinition; compact?: boolean }) {
  const isFavorite = usePrefs((s) => s.favorites.includes(tool.id));
  const toggleFavorite = usePrefs((s) => s.toggleFavorite);

  return (
    <Link
      to={`/t/${tool.id}`}
      className={clsx(
        'group relative flex items-start gap-3 rounded-card border border-line bg-panel transition-[border-color,box-shadow,transform] hover:border-line-strong hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)]',
        compact ? 'p-2.5' : 'p-3',
      )}
    >
      <span
        className={clsx(
          'flex shrink-0 items-center justify-center rounded-lg bg-canvas text-ink-soft transition-colors group-hover:bg-ink group-hover:text-panel',
          compact ? 'h-7 w-7' : 'h-8 w-8',
        )}
      >
        <Icon name={tool.icon} size={compact ? 14 : 15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate pr-5 text-[13px] font-medium text-ink">{tool.name}</span>
        <span className="mt-0.5 block line-clamp-2 text-[11.5px] leading-[1.45] text-ink-faint">
          {tool.description}
        </span>
      </span>
      <button
        type="button"
        aria-label={isFavorite ? `Unpin ${tool.name}` : `Pin ${tool.name}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleFavorite(tool.id);
        }}
        className={clsx(
          'absolute right-2 top-2 rounded p-0.5 transition-opacity',
          isFavorite ? 'text-ink opacity-100' : 'text-ink-faint opacity-0 group-hover:opacity-100 hover:text-ink',
        )}
      >
        <Icon name={isFavorite ? 'Star' : 'Star'} size={13} className={isFavorite ? 'fill-current' : ''} />
      </button>
    </Link>
  );
}

export function ToolGrid({ tools, compact }: { tools: ToolDefinition[]; compact?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {tools.map((tool) => (
        <ToolCard key={tool.id} tool={tool} compact={compact} />
      ))}
    </div>
  );
}
