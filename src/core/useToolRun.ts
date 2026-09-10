import { sendNotification, isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import { useCallback, useMemo, useState } from 'react';
import { asToolboxError } from './bridge';
import { usePrefs } from './prefs';
import { useSettings } from './settings';
import { activeTaskCount, cancelTask, newJobId, runTask, useTaskStore } from './tasks';
import type { BatchResult, ToolboxError } from './types';

export interface ExecuteOptions {
  command: string;
  args: Record<string, unknown>;
  label?: string;
  total?: number;
  /** File names recorded in Recent history (never contents). */
  inputs?: string[];
}

export interface ToolRun {
  running: boolean;
  progress: number | null;
  done: number;
  total: number;
  currentFile: string | null;
  /** File-writing commands return a BatchResult, which lands here. */
  result: BatchResult | null;
  /**
   * The command's untouched return value. Data commands such as `probe_media`,
   * `ocr_files`, `hash_files`, `extract_palette` and `find_duplicates` return
   * their own shape rather than a BatchResult — read it here, or use
   * `executeRaw<T>()` which resolves to it directly.
   */
  raw: unknown;
  error: ToolboxError | null;
  taskId: string | null;
  execute: (options: ExecuteOptions) => Promise<BatchResult | null>;
  executeRaw: <T>(options: ExecuteOptions) => Promise<T | null>;
  cancel: () => void;
  reset: () => void;
}

async function notifyDone(title: string, body: string): Promise<void> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === 'granted';
    if (granted) sendNotification({ title, body });
  } catch {
    /* notifications are a nicety, never a failure path */
  }
}

/**
 * Runs a backend command for a tool: registers a task, tracks progress, stores
 * the result, writes a history entry and posts a completion notification.
 */
export function useToolRun(toolId: string, toolName: string): ToolRun {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [raw, setRaw] = useState<unknown>(null);
  const [error, setError] = useState<ToolboxError | null>(null);
  const [running, setRunning] = useState(false);
  const tasks = useTaskStore((s) => s.tasks);
  const markUsed = usePrefs((s) => s.markUsed);
  const addHistory = usePrefs((s) => s.addHistory);
  const settings = useSettings((s) => s.settings);

  const task = useMemo(() => tasks.find((t) => t.id === taskId) ?? null, [tasks, taskId]);

  /** Single implementation; `execute` and `executeRaw` are two views of it. */
  const perform = useCallback(
    async (options: ExecuteOptions): Promise<{ batch: BatchResult; raw: unknown } | null> => {
      setRunning(true);
      setError(null);
      setResult(null);
      setRaw(null);
      markUsed(toolId);
      const started = Date.now();
      const id = newJobId();
      setTaskId(id);
      try {
        const batch = await runTask({
          jobId: id,
          toolId,
          toolName,
          label: options.label ?? toolName,
          command: options.command,
          args: options.args,
          total: options.total ?? 1,
        });
        // runTask has already stored the untouched response on the task.
        const rawValue = useTaskStore.getState().tasks.find((t) => t.id === id)?.raw ?? null;
        setResult(batch);
        setRaw(rawValue);

        if (settings.recentHistory && batch.results.length > 0) {
          addHistory({
            toolId,
            toolName,
            inputs: (options.inputs ?? []).map((p) => p.split('/').pop() ?? p).slice(0, 20),
            outputDir: batch.results[0]?.path.split('/').slice(0, -1).join('/') ?? null,
            outputCount: batch.results.length,
          });
        }
        const elapsed = Date.now() - started;
        if (settings.notifications && elapsed > 6000 && batch.results.length > 0) {
          void notifyDone(
            `${toolName} finished`,
            `${batch.results.length} file${batch.results.length === 1 ? '' : 's'} ready`,
          );
        }
        return { batch, raw: rawValue };
      } catch (err) {
        const e = asToolboxError(err);
        if (e.kind !== 'cancelled') setError(e);
        return null;
      } finally {
        setRunning(false);
      }
    },
    [toolId, toolName, markUsed, addHistory, settings.recentHistory, settings.notifications],
  );

  const execute = useCallback(
    async (options: ExecuteOptions) => (await perform(options))?.batch ?? null,
    [perform],
  );

  const executeRaw = useCallback(
    async <T,>(options: ExecuteOptions) => ((await perform(options))?.raw as T | undefined) ?? null,
    [perform],
  );

  const cancel = useCallback(() => {
    if (taskId) void cancelTask(taskId);
    setRunning(false);
  }, [taskId]);

  const reset = useCallback(() => {
    setResult(null);
    setRaw(null);
    setError(null);
    setTaskId(null);
  }, []);

  return {
    running,
    progress: task?.progress ?? null,
    done: task?.done ?? 0,
    total: task?.total ?? 0,
    currentFile: task?.currentFile ?? null,
    result,
    raw,
    error,
    taskId,
    execute,
    executeRaw,
    cancel,
    reset,
  };
}

export { activeTaskCount };
