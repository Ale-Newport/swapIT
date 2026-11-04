import { inspectPaths } from '@/core/bridge';
import { usePrefs } from '@/core/prefs';
import { useSettings } from '@/core/settings';
import type { BatchResult, FileResult } from '@/core/types';
import { buildMenu } from './catalog';
import { pluralize } from './catalog/util';
import { flattenItems } from './menu';
import { loadBins, makeContext } from './runner';
import { notify } from './system';

/** A rule: "when a file lands in `folder`, run `action` on it". */
export interface WatchRule {
  id: string;
  folder: string;
  /** A catalogue item id, e.g. `convert:jpg` or `edit:compress`. */
  action: string;
  enabled: boolean;
}

export interface WatchEvent {
  ruleId: string;
  action: string;
  path: string;
  folder: string;
}

/** Folder (inside the watched one) where watch-folder results go, so they are never picked up again. */
export const WATCH_OUTPUT = 'Toolbox Output';

/** The actions worth automating, in the order the picker lists them. */
export const WATCH_ACTIONS: Array<{ id: string; label: string; hint: string; kinds: string[] }> = [
  { id: 'convert:jpg', label: 'Convert images to JPG', hint: 'HEIC, PNG, WebP… → JPEG', kinds: ['image'] },
  { id: 'convert:png', label: 'Convert images to PNG', hint: 'Lossless, keeps transparency', kinds: ['image'] },
  { id: 'convert:webp', label: 'Convert images to WebP', hint: 'Small files for the web', kinds: ['image'] },
  { id: 'edit:compress', label: 'Compress images', hint: 'Smaller, metadata stripped', kinds: ['image'] },
  { id: 'edit:strip', label: 'Remove location from photos', hint: 'Strips EXIF, GPS and camera tags', kinds: ['image'] },
  { id: 'edit:resize-1920', label: 'Shrink images to 1920 px', hint: 'Never enlarged', kinds: ['image'] },
  { id: 'edit:video-compress', label: 'Compress videos', hint: 'H.264, much smaller', kinds: ['video'] },
  { id: 'convert:mp3', label: 'Extract audio as MP3', hint: 'From videos and other audio', kinds: ['video', 'audio'] },
  { id: 'edit:normalize', label: 'Normalise audio loudness', hint: 'Even out the volume', kinds: ['audio'] },
  { id: 'pdf:compress', label: 'Compress PDFs', hint: 'Balanced, good for email', kinds: ['pdf'] },
  { id: 'convert:pdf', label: 'Convert documents to PDF', hint: 'Word, Pages, text…', kinds: ['document'] },
  { id: 'tool:ocr', label: 'Read text from images & PDFs', hint: 'Saves a .txt next to each', kinds: ['image', 'pdf'] },
];

export function describeAction(id: string): string {
  return WATCH_ACTIONS.find((a) => a.id === id)?.label ?? id;
}

/** Pure: does this rule's action make sense for a file of this kind? */
export function actionAcceptsKind(actionId: string, kind: string): boolean {
  const entry = WATCH_ACTIONS.find((a) => a.id === actionId);
  if (!entry) return true;
  return entry.kinds.includes('*') || entry.kinds.includes(kind);
}

let busy = Promise.resolve();

/**
 * Handle a file the watcher saw arrive. Runs quietly — no ring, no pill — and
 * reports with a notification, so it never disturbs what you are doing.
 * Events are queued so a burst of files is processed one after another.
 */
export function handleWatchEvent(event: WatchEvent): Promise<void> {
  busy = busy.then(() => process(event)).catch(() => undefined);
  return busy;
}

async function process(event: WatchEvent): Promise<void> {
  await useSettings.getState().load();
  const settings = useSettings.getState().settings;
  const rules = (settings.watchRules as WatchRule[] | undefined) ?? [];
  const rule = rules.find((r) => r.id === event.ruleId);
  if (!rule || !rule.enabled) return;

  const files = await inspectPaths([event.path]).catch(() => []);
  const file = files[0];
  if (!file || file.isDir || !actionAcceptsKind(event.action, file.kind)) return;

  const bins = await loadBins();
  const { pool } = buildMenu({ files, folder: event.folder, bins, settings, intent: 'watch', clipboard: null });
  const item = flattenItems(pool).find((i) => i.id === event.action);
  if (!item || item.mode !== 'task' || item.unavailable) return;

  const ctx = makeContext(bins, {
    files,
    folder: event.folder,
    outputDir: `${event.folder}/${WATCH_OUTPUT}`,
    quiet: true,
  });

  try {
    const out = await item.run(ctx);
    const results: FileResult[] = out && 'results' in out && Array.isArray(out.results) ? (out as BatchResult).results : [];
    if (settings.recentHistory && results.length > 0) {
      usePrefs.getState().addHistory({
        toolId: `watch/${item.id}`,
        toolName: `Watch folder · ${item.title}`,
        inputs: [file.name],
        outputDir: results[0].path.split('/').slice(0, -1).join('/'),
        outputCount: results.length,
      });
    }
    await notify(
      `${item.title}`,
      results.length > 0 ? `${file.name} → ${pluralize(results.length, 'file')} in “${WATCH_OUTPUT}”` : file.name,
    );
  } catch (err) {
    const message = err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : 'Something went wrong.';
    await notify(`${item.title} failed`, `${file.name}: ${message}`);
  }
}
