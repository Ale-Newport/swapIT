import { listen } from '@tauri-apps/api/event';
import { create } from 'zustand';
import { asToolboxError, cancelJob, call, toBatch } from './bridge';
import type { BatchResult, ToolboxError } from './types';

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Task {
  id: string;
  toolId: string;
  toolName: string;
  label: string;
  status: TaskStatus;
  progress: number | null;
  done: number;
  total: number;
  currentFile: string | null;
  message: string | null;
  startedAt: number;
  finishedAt: number | null;
  result: BatchResult | null;
  /** The command's untouched return value, for tools that read data rather than write files. */
  raw: unknown;
  error: ToolboxError | null;
  /** Enough information to run the same job again. */
  retry: { command: string; args: Record<string, unknown> } | null;
}

interface ProgressPayload {
  jobId: string;
  progress: number | null;
  done: number;
  total: number;
  message: string | null;
  currentFile: string | null;
}

interface TaskState {
  tasks: Task[];
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  add: (task: Task) => void;
  patch: (id: string, patch: Partial<Task>) => void;
  remove: (id: string) => void;
  clearFinished: () => void;
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  panelOpen: false,
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  add: (task) => set((s) => ({ tasks: [task, ...s.tasks].slice(0, 200) })),
  patch: (id, patch) =>
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  remove: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
  clearFinished: () =>
    set((s) => ({ tasks: s.tasks.filter((t) => t.status === 'running' || t.status === 'queued') })),
}));

let progressBound = false;

/** Subscribe once to backend progress events and fan them into the store. */
export function bindProgressEvents(): void {
  if (progressBound) return;
  progressBound = true;
  const subscribe = listen<ProgressPayload>('toolbox://progress', (event) => {
    const p = event.payload;
    const { patch, tasks } = useTaskStore.getState();
    const task = tasks.find((t) => t.id === p.jobId);
    if (!task || task.status === 'completed' || task.status === 'failed') return;
    patch(p.jobId, {
      status: 'running',
      progress: p.progress,
      done: p.done,
      total: p.total || task.total,
      currentFile: p.currentFile,
      message: p.message,
    });
  });
  subscribe.catch(() => {
    // No Tauri IPC (running the frontend on its own): progress simply never arrives.
    progressBound = false;
  });
}

export function newJobId(): string {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface RunOptions {
  /** Supply an id so the caller can cancel without racing the store. */
  jobId?: string;
  toolId: string;
  toolName: string;
  label: string;
  command: string;
  args: Record<string, unknown>;
  total?: number;
  /** Skip the task-centre entry for instant, local-only operations. */
  silent?: boolean;
}

/**
 * Run a backend command as a tracked task: registers it in the task centre,
 * streams progress, and records the result so it can be retried or revealed.
 */
export async function runTask(opts: RunOptions): Promise<BatchResult> {
  const store = useTaskStore.getState();
  const id = opts.jobId ?? newJobId();
  const task: Task = {
    id,
    toolId: opts.toolId,
    toolName: opts.toolName,
    label: opts.label,
    status: 'running',
    progress: null,
    done: 0,
    total: opts.total ?? 1,
    currentFile: null,
    message: null,
    startedAt: Date.now(),
    finishedAt: null,
    result: null,
    raw: null,
    error: null,
    retry: { command: opts.command, args: opts.args },
  };
  store.add(task);

  try {
    const raw = await call<unknown>(opts.command, { ...opts.args, jobId: id });
    const batch = toBatch(raw);
    const cancelled = batch.cancelled;
    useTaskStore.getState().patch(id, {
      status: cancelled ? 'cancelled' : batch.failures.length > 0 && batch.results.length === 0 ? 'failed' : 'completed',
      progress: 1,
      done: batch.results.length,
      finishedAt: Date.now(),
      result: batch,
      raw,
      error:
        batch.failures.length > 0 && batch.results.length === 0
          ? { message: batch.failures[0].message, details: batch.failures[0].details ?? null, kind: 'process' }
          : null,
    });
    return batch;
  } catch (err) {
    const error = asToolboxError(err);
    useTaskStore.getState().patch(id, {
      status: error.kind === 'cancelled' ? 'cancelled' : 'failed',
      finishedAt: Date.now(),
      error,
    });
    throw error;
  }
}

export async function cancelTask(id: string): Promise<void> {
  await cancelJob(id).catch(() => false);
  useTaskStore.getState().patch(id, { status: 'cancelled', finishedAt: Date.now() });
}

export async function retryTask(id: string): Promise<void> {
  const task = useTaskStore.getState().tasks.find((t) => t.id === id);
  if (!task?.retry) return;
  await runTask({
    toolId: task.toolId,
    toolName: task.toolName,
    label: task.label,
    command: task.retry.command,
    args: task.retry.args,
    total: task.total,
  }).catch(() => undefined);
}

export function activeTaskCount(tasks: Task[]): number {
  return tasks.filter((t) => t.status === 'running' || t.status === 'queued').length;
}
