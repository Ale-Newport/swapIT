import { open } from '@tauri-apps/plugin-dialog';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { expandPaths, inspectPaths } from './bridge';
import type { AcceptSpec, FileInfo } from './types';

export interface ToolFilesOptions extends AcceptSpec {
  /** Dialog filter name, e.g. 'Images'. */
  filterName?: string;
  /** Expand dropped folders into their files. */
  expandFolders?: boolean;
  recursive?: boolean;
}

export interface ToolFiles {
  files: FileInfo[];
  paths: string[];
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
  add: (paths: string[]) => Promise<void>;
  set: (paths: string[]) => Promise<void>;
  remove: (path: string) => void;
  clear: () => void;
  reorder: (from: number, to: number) => void;
  browse: () => Promise<void>;
  browseFolder: () => Promise<void>;
  totalSize: number;
}

function matches(file: FileInfo, opts: ToolFilesOptions): boolean {
  if (file.isDir) return Boolean(opts.folders);
  const ext = file.extension.toLowerCase();
  if (opts.extensions?.length && opts.extensions.some((e) => e.replace(/^\./, '').toLowerCase() === ext)) {
    return true;
  }
  if (opts.kinds?.length && opts.kinds.includes(file.kind)) return true;
  return !opts.extensions?.length && !opts.kinds?.length;
}

/**
 * File selection for a tool: picker, drag-and-drop and folder expansion, with
 * the type filtering the tool declared in its metadata.
 */
export function useToolFiles(opts: ToolFilesOptions = {}): ToolFiles {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const multiple = opts.multiple !== false;

  const resolve = useCallback(
    async (paths: string[]): Promise<FileInfo[]> => {
      if (paths.length === 0) return [];
      const initial = await inspectPaths(paths);
      const wantFolders = Boolean(opts.folders);
      const hasFolders = initial.some((f) => f.isDir);
      if (hasFolders && !wantFolders && opts.expandFolders !== false) {
        const expanded = await expandPaths(paths, {
          recursive: opts.recursive ?? true,
          kinds: opts.kinds ?? [],
          extensions: opts.extensions ?? [],
        });
        return expanded;
      }
      return initial;
    },
    [opts.folders, opts.expandFolders, opts.recursive, opts.kinds, opts.extensions],
  );

  const ingest = useCallback(
    async (paths: string[], mode: 'add' | 'set') => {
      setLoading(true);
      setError(null);
      try {
        const resolved = await resolve(paths);
        const accepted = resolved.filter((f) => matches(f, opts));
        const rejected = resolved.length - accepted.length;
        setFiles((current) => {
          const base = mode === 'set' ? [] : current;
          const seen = new Set(base.map((f) => f.path));
          const merged = [...base];
          for (const f of accepted) {
            if (!seen.has(f.path)) {
              seen.add(f.path);
              merged.push(f);
            }
          }
          return multiple ? merged : merged.slice(-1);
        });
        if (accepted.length === 0 && resolved.length > 0) {
          setError(`This tool does not accept ${resolved.length === 1 ? 'that file' : 'those files'}.`);
        } else if (rejected > 0) {
          setError(`${rejected} file${rejected === 1 ? '' : 's'} skipped — not a supported type.`);
        }
      } catch (err) {
        const message = err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : String(err);
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    // `opts` is recreated each render by callers; depend on its stable parts.
    [resolve, multiple, opts.extensions, opts.kinds, opts.folders], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const add = useCallback((paths: string[]) => ingest(paths, 'add'), [ingest]);
  const set = useCallback((paths: string[]) => ingest(paths, 'set'), [ingest]);

  const browse = useCallback(async () => {
    const filters = opts.extensions?.length
      ? [{ name: opts.filterName ?? 'Supported files', extensions: opts.extensions.map((e) => e.replace(/^\./, '')) }]
      : undefined;
    const picked = await open({ multiple, directory: false, filters });
    if (!picked) return;
    await add(Array.isArray(picked) ? picked : [picked]);
  }, [add, multiple, opts.extensions, opts.filterName]);

  const browseFolder = useCallback(async () => {
    const picked = await open({ multiple: false, directory: true });
    if (!picked) return;
    await add([picked as string]);
  }, [add]);

  const remove = useCallback((path: string) => {
    setFiles((current) => current.filter((f) => f.path !== path));
  }, []);

  const clear = useCallback(() => {
    setFiles([]);
    setError(null);
  }, []);

  const reorder = useCallback((from: number, to: number) => {
    setFiles((current) => {
      if (from === to || from < 0 || to < 0 || from >= current.length || to >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  // Files handed over by the Home quick actions load themselves.
  const location = useLocation();
  const consumed = useRef<string | null>(null);
  useEffect(() => {
    const incoming = (location.state as { files?: string[] } | null)?.files;
    if (!incoming?.length) return;
    const key = incoming.join('|');
    if (consumed.current === key) return;
    consumed.current = key;
    void ingest(incoming, 'set');
  }, [location.state, ingest]);

  const paths = useMemo(() => files.map((f) => f.path), [files]);
  const totalSize = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);

  return {
    files,
    paths,
    loading,
    error,
    isEmpty: files.length === 0,
    add,
    set,
    remove,
    clear,
    reorder,
    browse,
    browseFolder,
    totalSize,
  };
}
