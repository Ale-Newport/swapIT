import { invoke } from '@tauri-apps/api/core';
import type {
  BatchResult,
  BinaryStatus,
  FileInfo,
  FileResult,
  OutputSpec,
  ToolboxError,
} from './types';

/** Narrow an unknown thrown value into the structured error the backend sends. */
export function asToolboxError(err: unknown): ToolboxError {
  if (err && typeof err === 'object' && 'message' in err && 'kind' in err) {
    return err as ToolboxError;
  }
  if (err instanceof Error) {
    return { message: err.message, details: err.stack ?? null, kind: 'internal' };
  }
  return { message: String(err ?? 'Something went wrong.'), details: null, kind: 'internal' };
}

export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (err) {
    throw asToolboxError(err);
  }
}

// ------------------------------------------------------------------ system

export interface AppSettings {
  binaries: Record<string, string>;
  defaultOutputDir: string | null;
  outputMode: 'same_dir' | 'custom';
  collision: 'rename' | 'skip' | 'overwrite';
  preserveMetadata: boolean;
  jpegQuality: number;
  webpQuality: number;
  theme: 'light' | 'dark' | 'system';
  recentHistory: boolean;
  clipboardHistory: boolean;
  notifications: boolean;
  rememberOutputDir: boolean;
  openLastTool: boolean;
  defaultVideoCodec: string;
  defaultVideoCrf: number;
  [key: string]: unknown;
}

export const getSettings = () => call<AppSettings>('get_settings');
export const updateSettings = (patch: Record<string, unknown>) =>
  call<AppSettings>('update_settings', { patch });
export const checkBinaries = () => call<BinaryStatus[]>('check_binaries');
export const checkBinary = (id: string) => call<BinaryStatus>('check_binary', { id });
export const cancelJob = (jobId: string) => call<boolean>('cancel_job', { jobId });
export const revealInFinder = (path: string) => call<void>('reveal_in_finder', { path });
export const openPath = (path: string) => call<void>('open_path', { path });
export const ensureDir = (path: string) => call<string>('ensure_dir', { path });
export const installInstructions = (id: string) =>
  call<{ id: string; label: string; command: string; homebrewAvailable: boolean }>(
    'install_instructions',
    { id },
  );

export interface AppPaths {
  home: string;
  downloads: string;
  desktop: string;
  documents: string;
  pictures: string;
  config: string;
  temp: string;
}
export const appPaths = () => call<AppPaths>('app_paths');

export const planOutput = (source: string | null, output: OutputSpec, ext: string) =>
  call<{ path: string; name: string; disposition: string }>('plan_output', { source, output, ext });

// ------------------------------------------------------------------ files

export const inspectPaths = (paths: string[]) => call<FileInfo[]>('inspect_paths', { paths });
export const expandPaths = (
  inputs: string[],
  opts: { recursive?: boolean; kinds?: string[]; extensions?: string[]; limit?: number; includeHidden?: boolean } = {},
) => call<FileInfo[]>('expand_paths', { inputs, opts });

// ------------------------------------------------------------------ results

export type { BatchResult, FileResult, FileInfo, BinaryStatus, OutputSpec };

/** Normalise any command result into a batch shape the result panel understands. */
export function toBatch(value: unknown): BatchResult {
  if (!value || typeof value !== 'object') {
    return { results: [], failures: [], cancelled: false, elapsedMs: 0 };
  }
  if ('results' in value && Array.isArray((value as BatchResult).results)) {
    return value as BatchResult;
  }
  if ('path' in value) {
    return { results: [value as FileResult], failures: [], cancelled: false, elapsedMs: 0 };
  }
  if (Array.isArray(value) && value.every((v) => v && typeof v === 'object' && 'path' in v)) {
    return { results: value as FileResult[], failures: [], cancelled: false, elapsedMs: 0 };
  }
  return { results: [], failures: [], cancelled: false, elapsedMs: 0 };
}
