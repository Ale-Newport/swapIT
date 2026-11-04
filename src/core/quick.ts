import { call } from './bridge';
import type { BatchResult, FileResult } from './types';

/**
 * Small Finder-polite file helpers (`src-tauri/src/cmd/quick.rs`). Names are
 * numbered like Finder numbers them, nothing is overwritten, nothing is deleted
 * for good — the Trash is the only way out.
 */

export const createTextFile = (args: {
  dir: string;
  name: string;
  ext: string;
  content: string;
  executable?: boolean;
}) => call<FileResult>('create_text_file', args);

export const createFolder = (dir: string, name: string, moveInto?: string[]) =>
  call<BatchResult>('create_folder', { dir, name, moveInto });

export const trashPaths = (paths: string[]) => call<number>('trash_paths', { paths });
export const duplicatePaths = (paths: string[]) => call<BatchResult>('duplicate_paths', { paths });
export const movePaths = (paths: string[], destDir: string) =>
  call<BatchResult>('move_paths', { paths, destDir });
export const copyPathsToClipboard = (paths: string[]) => call<void>('copy_paths_to_clipboard', { paths });
export const revealMany = (paths: string[]) => call<void>('reveal_many', { paths });
export const openWith = (paths: string[], app?: string) => call<void>('open_with', { paths, app });
export const quickLook = (paths: string[]) => call<void>('quick_look', { paths });
export const quickLookClose = () => call<void>('quick_look_close');
export const setDesktopPicture = (path: string) => call<void>('set_desktop_picture', { path });
export const pasteClipboardAsFile = (dir: string) => call<BatchResult>('paste_clipboard_as_file', { dir });

export interface ClipboardSummary {
  kind: 'text' | 'image' | 'files' | 'empty';
  preview: string;
  count: number;
}
export const clipboardSummary = () => call<ClipboardSummary>('clipboard_summary');

export const fileIcon = (path: string, size: number) => call<string>('file_icon', { path, size });
export const fileThumbnail = (path: string, size: number) => call<string>('file_thumbnail', { path, size });
export const readTextFile = (path: string, maxBytes?: number) =>
  call<string>('read_text_file', { path, maxBytes });

export interface DefaultFolders {
  desktop: string;
  documents: string;
  downloads: string;
  home: string;
}
export const defaultFolders = () => call<DefaultFolders>('default_folders');
