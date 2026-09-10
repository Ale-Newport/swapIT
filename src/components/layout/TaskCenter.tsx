import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import { openPath, revealInFinder } from '@/core/bridge';
import { formatRelative, basename } from '@/core/format';
import { cancelTask, retryTask, useTaskStore, type Task } from '@/core/tasks';
import { Badge, Button, EmptyState, Icon, IconButton, Progress } from '@/components/ui';

const STATUS: Record<Task['status'], { icon: string; tone: string; label: string }> = {
  queued: { icon: 'Clock', tone: 'text-ink-faint', label: 'Waiting' },
  running: { icon: 'Loader2', tone: 'text-accent', label: 'Running' },
  completed: { icon: 'CircleCheck', tone: 'text-success', label: 'Completed' },
  failed: { icon: 'CircleAlert', tone: 'text-danger', label: 'Failed' },
  cancelled: { icon: 'CircleSlash', tone: 'text-ink-faint', label: 'Cancelled' },
};

function TaskRow({ task }: { task: Task }) {
  const navigate = useNavigate();
  const meta = STATUS[task.status];
  const first = task.result?.results[0];
  return (
    <li className="border-b border-line px-3 py-2.5 last:border-b-0">
      <div className="flex items-start gap-2.5">
        <Icon
          name={meta.icon}
          size={14}
          className={clsx('mt-0.5 shrink-0', meta.tone, task.status === 'running' && 'animate-spin-slow')}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(`/t/${task.toolId}`)}
              className="truncate text-[12.5px] font-medium text-ink hover:underline"
            >
              {task.toolName}
            </button>
            <span className="shrink-0 text-[11px] text-ink-faint">{formatRelative(task.startedAt)}</span>
          </div>
          <p className="truncate text-[11.5px] text-ink-faint">
            {task.status === 'running'
              ? `${task.total > 1 ? `${task.done}/${task.total} · ` : ''}${task.currentFile ? basename(task.currentFile) : 'Working…'}`
              : task.error
                ? task.error.message
                : task.result
                  ? `${task.result.results.length} file${task.result.results.length === 1 ? '' : 's'}`
                  : meta.label}
          </p>
          {task.status === 'running' && <Progress value={task.progress} className="mt-1.5" />}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {task.status === 'running' && (
            <IconButton icon="Square" label="Cancel" size="sm" onClick={() => void cancelTask(task.id)} />
          )}
          {(task.status === 'failed' || task.status === 'cancelled') && task.retry && (
            <IconButton icon="RotateCcw" label="Retry" size="sm" onClick={() => void retryTask(task.id)} />
          )}
          {first && (
            <>
              <IconButton icon="ExternalLink" label="Open result" size="sm" onClick={() => void openPath(first.path)} />
              <IconButton
                icon="FolderOpen"
                label="Reveal in Finder"
                size="sm"
                onClick={() => void revealInFinder(first.path)}
              />
            </>
          )}
        </div>
      </div>
    </li>
  );
}

export function TaskCenter() {
  const { tasks, panelOpen, setPanelOpen, clearFinished } = useTaskStore();
  if (!panelOpen) return null;
  const running = tasks.filter((t) => t.status === 'running' || t.status === 'queued');
  const finished = tasks.filter((t) => t.status !== 'running' && t.status !== 'queued');

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={() => setPanelOpen(false)} aria-hidden />
      <aside className="animate-pop fixed right-3 top-[52px] z-40 flex max-h-[70vh] w-[380px] flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-[0_16px_48px_rgba(0,0,0,0.16)]">
        <header className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-semibold text-ink">Tasks</h2>
            {running.length > 0 && <Badge tone="accent">{running.length} running</Badge>}
          </div>
          <div className="flex items-center gap-1">
            {finished.length > 0 && (
              <Button size="sm" variant="ghost" onClick={clearFinished}>
                Clear
              </Button>
            )}
            <IconButton icon="X" label="Close tasks" size="sm" onClick={() => setPanelOpen(false)} />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tasks.length === 0 ? (
            <EmptyState icon="ListChecks" title="No tasks yet" description="Conversions you run will appear here." />
          ) : (
            <ul>
              {[...running, ...finished].map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
