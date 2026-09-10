import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CATEGORIES } from '@/core/categories';
import { inspectPaths } from '@/core/bridge';
import { useDropTarget, useDropFallback } from '@/core/dnd';
import { formatBytes, formatRelative } from '@/core/format';
import { popularToolIds, usePrefs } from '@/core/prefs';
import { categoryCounts, getTool, toolsForFiles } from '@/core/registry';
import type { FileInfo, ToolDefinition } from '@/core/types';
import { ToolGrid } from '@/components/ToolCard';
import { kindIcon } from '@/components/tool/FileDropZone';
import { Badge, Button, Card, Icon, IconButton } from '@/components/ui';
import { open } from '@tauri-apps/plugin-dialog';
import clsx from 'clsx';

/** Files dropped on Home become a set of suggested actions rather than an error. */
function QuickActions({
  files,
  onClear,
}: {
  files: FileInfo[];
  onClear: () => void;
}) {
  const navigate = useNavigate();
  const tools = toolsForFiles(files).slice(0, 12);
  const kinds = [...new Set(files.map((f) => f.kind))];
  const totalSize = files.reduce((s, f) => s + f.size, 0);

  const openWith = (tool: ToolDefinition) => {
    navigate(`/t/${tool.id}`, { state: { files: files.map((f) => f.path) } });
  };

  return (
    <Card className="animate-in" padded={false}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-canvas text-ink-soft">
            <Icon name={kindIcon(files[0]?.kind ?? 'other')} size={15} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-ink">
              {files.length === 1 ? files[0].name : `${files.length} files`}
            </p>
            <p className="text-[11.5px] text-ink-faint">
              {kinds.join(', ')} · {formatBytes(totalSize)}
            </p>
          </div>
        </div>
        <IconButton icon="X" label="Clear selection" size="sm" onClick={onClear} />
      </header>
      <div className="p-3">
        {tools.length === 0 ? (
          <p className="px-1 py-4 text-center text-[12.5px] text-ink-faint">
            No tool handles {files.length === 1 ? 'this file type' : 'this mix of file types'} yet.
          </p>
        ) : (
          <>
            <p className="px-1 pb-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
              Quick actions
            </p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {tools.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => openWith(tool)}
                  className="group flex items-center gap-2.5 rounded-lg border border-line bg-panel px-2.5 py-2 text-left transition-colors hover:border-line-strong hover:bg-canvas"
                >
                  <Icon name={tool.icon} size={14} className="shrink-0 text-ink-faint group-hover:text-ink" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                    {tool.quickLabel ?? tool.name}
                  </span>
                  <Icon name="ArrowRight" size={13} className="shrink-0 text-ink-faint opacity-0 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

export function Home() {
  const [dropped, setDropped] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const favorites = usePrefs((s) => s.favorites);
  const recent = usePrefs((s) => s.recent);
  const usage = usePrefs((s) => s.usage);
  const counts = categoryCounts();

  const ingest = useCallback(async (paths: string[]) => {
    setLoading(true);
    try {
      setDropped(await inspectPaths(paths));
    } catch {
      setDropped([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const { ref, isOver } = useDropTarget((paths) => void ingest(paths), { priority: 2 });
  useDropFallback(useCallback((paths: string[]) => void ingest(paths), [ingest]));

  // ⌘O routes its selection here so it lands in the same quick-action flow.
  const location = useLocation();
  useEffect(() => {
    const opened = (location.state as { openFiles?: string[] } | null)?.openFiles;
    if (opened?.length) void ingest(opened);
  }, [location.state, ingest]);

  const browse = async () => {
    const picked = await open({ multiple: true });
    if (!picked) return;
    await ingest(Array.isArray(picked) ? picked : [picked]);
  };

  const favoriteTools = favorites.map(getTool).filter((t): t is ToolDefinition => Boolean(t));
  const recentTools = recent.map(getTool).filter((t): t is ToolDefinition => Boolean(t)).slice(0, 8);
  const popularTools = popularToolIds(usage, 8).map(getTool).filter((t): t is ToolDefinition => Boolean(t));

  return (
    <div className="mx-auto max-w-6xl space-y-7 px-6 py-6">
      <section>
        <div
          ref={ref}
          className={clsx(
            'flex flex-col items-center justify-center gap-3 rounded-card border border-dashed px-6 py-12 text-center transition-colors',
            isOver ? 'border-accent bg-accent-soft' : 'border-line-strong bg-panel',
          )}
        >
          <div
            className={clsx(
              'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
              isOver ? 'bg-accent/12 text-accent' : 'bg-ink/5 text-ink-faint',
            )}
          >
            <Icon name={isOver ? 'Download' : 'Upload'} size={21} />
          </div>
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-ink">
              {isOver ? 'Release to inspect' : 'Drop anything here'}
            </h1>
            <p className="mt-1 text-[12.5px] text-ink-faint">
              {loading ? 'Reading files…' : 'Toolbox works out what you can do with it — all on this Mac.'}
            </p>
          </div>
          {!isOver && (
            <Button size="sm" variant="secondary" icon="FolderOpen" onClick={() => void browse()}>
              or browse files
            </Button>
          )}
        </div>
      </section>

      {dropped.length > 0 && <QuickActions files={dropped} onClear={() => setDropped([])} />}

      {favoriteTools.length > 0 && (
        <section>
          <h2 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            <Icon name="Star" size={14} className="text-ink-faint" />
            Favorites
          </h2>
          <ToolGrid tools={favoriteTools} />
        </section>
      )}

      {recentTools.length > 0 && (
        <section>
          <h2 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            <Icon name="History" size={14} className="text-ink-faint" />
            Recently used
          </h2>
          <ToolGrid tools={recentTools} compact />
        </section>
      )}

      {popularTools.length > 2 && (
        <section>
          <h2 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            <Icon name="TrendingUp" size={14} className="text-ink-faint" />
            Most used
          </h2>
          <ToolGrid tools={popularTools} compact />
        </section>
      )}

      <section>
        <h2 className="mb-2.5 text-[13px] font-semibold text-ink">Categories</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {CATEGORIES.map((c) => (
            <Link
              key={c.id}
              to={`/c/${c.id}`}
              className="group flex flex-col gap-2 rounded-card border border-line bg-panel p-3 transition-colors hover:border-line-strong"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-canvas text-ink-soft transition-colors group-hover:bg-ink group-hover:text-panel">
                <Icon name={c.icon} size={15} />
              </span>
              <span>
                <span className="block text-[12.5px] font-medium text-ink">{c.name}</span>
                <span className="mt-0.5 block text-[11px] text-ink-faint">
                  {counts[c.id] ?? 0} tool{(counts[c.id] ?? 0) === 1 ? '' : 's'}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <footer className="flex items-center justify-center gap-2 pb-4 pt-2 text-[11.5px] text-ink-faint">
        <Icon name="ShieldCheck" size={13} />
        Your files stay on your device.
      </footer>
    </div>
  );
}

export { QuickActions };
export function RecentPage() {
  const history = usePrefs((s) => s.history);
  const clearHistory = usePrefs((s) => s.clearHistory);
  const recent = usePrefs((s) => s.recent);
  const recentTools = recent.map(getTool).filter((t): t is ToolDefinition => Boolean(t));

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-[17px] font-semibold tracking-tight text-ink">Recent</h1>
          <p className="mt-0.5 text-[12.5px] text-ink-faint">
            Tools you have used and jobs you have run. Only names and paths are stored — never file contents.
          </p>
        </div>
        {history.length > 0 && (
          <Button size="sm" variant="ghost" icon="Trash2" onClick={clearHistory}>
            Clear history
          </Button>
        )}
      </header>

      {recentTools.length > 0 && (
        <section>
          <h2 className="mb-2.5 text-[13px] font-semibold text-ink">Recent tools</h2>
          <ToolGrid tools={recentTools} compact />
        </section>
      )}

      <section>
        <h2 className="mb-2.5 text-[13px] font-semibold text-ink">History</h2>
        {history.length === 0 ? (
          <Card className="text-center text-[12.5px] text-ink-faint">Nothing here yet.</Card>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-panel">
            {history.slice(0, 60).map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <Icon name="FileCheck2" size={14} className="shrink-0 text-ink-faint" />
                <div className="min-w-0 flex-1">
                  <Link to={`/t/${h.toolId}`} className="text-[12.5px] font-medium text-ink hover:underline">
                    {h.toolName}
                  </Link>
                  <p className="truncate text-[11.5px] text-ink-faint">
                    {h.inputs.slice(0, 3).join(', ')}
                    {h.inputs.length > 3 ? ` +${h.inputs.length - 3} more` : ''}
                  </p>
                </div>
                <Badge>{h.outputCount} out</Badge>
                <span className="shrink-0 text-[11px] text-ink-faint">{formatRelative(h.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
