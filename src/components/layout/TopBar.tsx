import { useNavigate } from 'react-router-dom';
import { activeTaskCount, useTaskStore } from '@/core/tasks';
import { Icon, IconButton, Kbd } from '@/components/ui';

export function TopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const navigate = useNavigate();
  const tasks = useTaskStore((s) => s.tasks);
  const setPanelOpen = useTaskStore((s) => s.setPanelOpen);
  const panelOpen = useTaskStore((s) => s.panelOpen);
  const active = activeTaskCount(tasks);

  return (
    <header className="titlebar-drag flex h-[46px] shrink-0 items-center gap-3 border-b border-line bg-panel/80 px-4 backdrop-blur">
      <button
        type="button"
        onClick={onOpenPalette}
        className="titlebar-nodrag group flex h-8 min-w-0 max-w-md flex-1 items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 text-left transition-colors hover:border-line-strong"
      >
        <Icon name="Search" size={14} className="shrink-0 text-ink-faint" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-faint">Search tools…</span>
        <span className="flex shrink-0 items-center gap-0.5">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="titlebar-nodrag ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => setPanelOpen(!panelOpen)}
          title="Task queue"
          aria-label="Task queue"
          className="relative flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-ink-soft transition-colors hover:bg-ink/6 hover:text-ink"
        >
          <Icon name="ListChecks" size={15} />
          {active > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-semibold text-panel">
              {active}
            </span>
          )}
        </button>
        <IconButton icon="Settings" label="Settings" onClick={() => navigate('/settings')} />
      </div>
    </header>
  );
}
