import clsx from 'clsx';
import { NavLink, useNavigate } from 'react-router-dom';
import { CATEGORIES } from '@/core/categories';
import { usePrefs } from '@/core/prefs';
import { categoryCounts, getTool } from '@/core/registry';
import { Icon } from '@/components/ui';

function NavItem({
  to,
  icon,
  label,
  count,
  end,
}: {
  to: string;
  icon: string;
  label: string;
  count?: number;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          'group flex h-7.5 items-center gap-2.5 rounded-lg px-2.5 text-[12.5px] transition-colors',
          isActive ? 'bg-ink/8 font-medium text-ink' : 'text-ink-soft hover:bg-ink/5 hover:text-ink',
        )
      }
    >
      <Icon name={icon} size={14.5} className="shrink-0 opacity-80" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">{count}</span>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const counts = categoryCounts();
  const favorites = usePrefs((s) => s.favorites);
  const navigate = useNavigate();
  const favoriteTools = favorites.map((id) => getTool(id)).filter((t) => t !== undefined);

  return (
    <nav className="flex h-full w-[216px] shrink-0 flex-col border-r border-line bg-panel">
      {/* Space for the macOS traffic lights. */}
      <div className="titlebar-drag h-[38px] shrink-0" />

      <div className="titlebar-nodrag flex items-center gap-2 px-4 pb-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-2 rounded-md text-left"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-ink text-panel">
            <Icon name="Box" size={13} strokeWidth={2.2} />
          </span>
          <span className="text-[13.5px] font-semibold tracking-tight text-ink">Toolbox</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <div className="space-y-0.5">
          <NavItem to="/" icon="House" label="Home" end />
          <NavItem to="/favorites" icon="Star" label="Favorites" count={favorites.length} />
          <NavItem to="/recent" icon="History" label="Recent" />
          <NavItem to="/radial" icon="Orbit" label="Radial menu" />
        </div>

        {favoriteTools.length > 0 && (
          <div className="mt-4">
            <p className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
              Pinned
            </p>
            <div className="space-y-0.5">
              {favoriteTools.slice(0, 6).map((tool) => (
                <NavItem key={tool.id} to={`/t/${tool.id}`} icon={tool.icon} label={tool.name} />
              ))}
            </div>
          </div>
        )}

        <div className="mt-4">
          <p className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
            Categories
          </p>
          <div className="space-y-0.5">
            {CATEGORIES.map((c) => (
              <NavItem key={c.id} to={`/c/${c.id}`} icon={c.icon} label={c.name} count={counts[c.id] ?? 0} />
            ))}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-line p-2">
        <NavItem to="/settings" icon="Settings" label="Settings" />
      </div>
    </nav>
  );
}
