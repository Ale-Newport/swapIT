import { asToolboxError, checkBinaries, installInstructions, openPath } from '@/core/bridge';
import { revealMany, trashPaths } from '@/core/quick';
import { usePrefs } from '@/core/prefs';
import { defaultOutputSpec as outputSpecFromSettings, useSettings } from '@/core/settings';
import { cancelTask, newJobId, runTask, useTaskStore } from '@/core/tasks';
import type { BatchResult, BinaryId, FileInfo, FileResult, OutputSpec, ToolboxError } from '@/core/types';
import { BINARY_LABEL, type Bins } from './catalog/util';
import { applyLayout, cardLayout, currentLayout, forgetLayout, hudLayout, ringLayout } from './layout';
import type { ActionCtx, ActionResult, CardSpec, HudAction, JobPlan, RadialItem } from './model';
import { openInMain, radialHide, radialReleaseFocus } from './native';
import { radial, type HudState } from './store';


// ------------------------------------------------------------------ binaries

let binCache: { at: number; bins: Bins } | null = null;

/**
 * What we know about the helper programs right now, without waiting. Probing runs
 * every program with `--version` (LibreOffice alone can take seconds), so the ring
 * must never block on it: it opens with what is cached, treats the unknown as
 * available, and refreshes in the background.
 */
export function binsNow(): Bins | null {
  if (!binCache || Date.now() - binCache.at > 60_000) void loadBins(true);
  return binCache?.bins ?? null;
}

/** Which helper programs are installed, cached for a minute. */
export async function loadBins(force = false): Promise<Bins> {
  if (!force && binCache && Date.now() - binCache.at < 60_000) return binCache.bins;
  try {
    const statuses = await checkBinaries();
    const bins: Bins = {};
    for (const s of statuses) bins[s.id] = s.installed;
    binCache = { at: Date.now(), bins };
    return bins;
  } catch {
    return binCache?.bins ?? {};
  }
}

// ------------------------------------------------------------------ window helpers

let hudTimer: ReturnType<typeof setTimeout> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

export function clearHudTimer(): void {
  if (hudTimer) clearTimeout(hudTimer);
  hudTimer = null;
}

export function appearance() {
  const theme = useSettings.getState().settings.radialTheme;
  return theme === 'light' || theme === 'dark' ? theme : 'auto';
}

/** Fade the ring out, then hide the window and forget the session. */
export function closeRadial(options: { restoreFocus?: boolean; instant?: boolean } = {}): void {
  clearHudTimer();
  if (closeTimer) return;
  const { restoreFocus = true, instant = false } = options;
  radial.patch({ closing: true });
  closeTimer = setTimeout(
    () => {
      closeTimer = null;
      void radialHide(restoreFocus).catch(() => undefined);
      radial.get().reset();
      forgetLayout();
    },
    instant ? 0 : 120,
  );
}

/** Called when the native side tells us the window is gone. */
export function resetAfterHide(): void {
  clearHudTimer();
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  radial.get().reset();
  forgetLayout();
}

export async function showRing(): Promise<void> {
  clearHudTimer();
  radial.patch({ phase: 'ring', card: null, hud: null, closing: false });
  await applyLayout(ringLayout(appearance()));
}

export async function showCard(card: CardSpec): Promise<void> {
  clearHudTimer();
  const size = cardSize(card);
  await applyLayout(cardLayout(size.width, size.height, appearance()));
  radial.patch({ phase: 'card', card, closing: false, hover: null });
}

export function cardSize(card: CardSpec): { width: number; height: number } {
  switch (card.kind) {
    case 'new-file':
      return { width: 520, height: 430 };
    case 'recorder':
      return { width: 400, height: 330 };
  }
}

function hudHeight(hud: HudState): number {
  let h = 84;
  if (hud.status === 'working') return 92;
  if (hud.status === 'done' && hud.result?.actions?.length) h += 40;
  if (hud.result?.snippet) h += 46;
  if (hud.status === 'error' && hud.fix) h += 40;
  return h;
}

async function showHud(hud: HudState): Promise<void> {
  radial.patch({ hud });
  if (radial.get().phase !== 'hud') {
    await applyLayout(hudLayout(hudHeight(hud), appearance()));
    radial.patch({ phase: 'hud', closing: false, hover: null, card: null });
    // The pill floats above whatever the user is doing; give them their app back.
    void radialReleaseFocus().catch(() => undefined);
  } else {
    await applyLayout(hudLayout(hudHeight(hud), appearance()));
  }
}

export function scheduleClose(ms: number): void {
  clearHudTimer();
  hudTimer = setTimeout(() => closeRadial({ restoreFocus: false }), ms);
}

// ------------------------------------------------------------------ results

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

function sizeDelta(r: FileResult): string | null {
  if (!r.sourceSize || !r.size || r.sourceSize <= 0) return null;
  const change = Math.round((1 - r.size / r.sourceSize) * 100);
  const fmt = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  if (Math.abs(change) < 2) return `${fmt(r.size)}`;
  return `${fmt(r.sourceSize)} → ${fmt(r.size)} (${change > 0 ? '−' : '+'}${Math.abs(change)}%)`;
}

export function resultActions(results: FileResult[], onUndone: (n: number) => void): HudAction[] {
  const fresh = results.filter((r) => r.disposition !== 'skipped');
  if (fresh.length === 0) return [];
  const paths = fresh.map((r) => r.path);
  const actions: HudAction[] = [
    {
      id: 'reveal',
      label: 'Show',
      icon: 'FolderSearch',
      primary: true,
      run: async () => {
        await revealMany(paths);
        closeRadial({ restoreFocus: false });
      },
    },
  ];
  if (fresh.length === 1) {
    actions.push({
      id: 'open',
      label: 'Open',
      icon: 'ExternalLink',
      run: async () => {
        await openPath(paths[0]);
        closeRadial({ restoreFocus: false });
      },
    });
  }
  const undoable = fresh.filter((r) => r.disposition === 'created' || r.disposition === 'renamed');
  if (undoable.length > 0) {
    actions.push({
      id: 'undo',
      label: 'Undo',
      icon: 'Undo2',
      run: async () => {
        const n = await trashPaths(undoable.map((r) => r.path));
        onUndone(n);
      },
    });
  }
  return actions;
}

function summarize(batch: BatchResult, item: RadialItem): ActionResult {
  const ok = batch.results.filter((r) => r.disposition !== 'skipped');
  const skipped = batch.results.length - ok.length;
  if (ok.length === 0 && skipped > 0) {
    return { title: 'Nothing new to write', detail: 'Every result already exists — skipped.' };
  }
  const title = ok.length === 1 ? ok[0].name : `${plural(ok.length, 'file', 'files')} ready`;
  const bits: string[] = [];
  if (ok.length === 1) {
    const delta = sizeDelta(ok[0]);
    if (delta) bits.push(delta);
  } else {
    bits.push(item.title);
  }
  if (batch.failures.length > 0) bits.push(`${plural(batch.failures.length, 'file', 'files')} failed`);
  if (skipped > 0) bits.push(`${skipped} skipped`);
  return { title, detail: bits.join(' · ') || item.title, results: ok };
}

function normalize(out: Awaited<ReturnType<RadialItem['run']>>, item: RadialItem): ActionResult {
  if (!out) return { title: 'Done', detail: item.title };
  if ('failures' in out && 'results' in out && Array.isArray(out.results)) return summarize(out as BatchResult, item);
  return out as ActionResult;
}

function recordHistory(item: RadialItem, inputs: string[], results: FileResult[]): void {
  if (!useSettings.getState().settings.recentHistory || results.length === 0) return;
  usePrefs.getState().addHistory({
    toolId: `radial/${item.id}`,
    toolName: `Radial · ${item.title}`,
    inputs: inputs.map((p) => p.split('/').pop() ?? p).slice(0, 20),
    outputDir: results[0]?.path.split('/').slice(0, -1).join('/') ?? null,
    outputCount: results.length,
  });
}

// ------------------------------------------------------------------ errors

async function explainError(err: unknown, item: RadialItem | null): Promise<HudState> {
  const error: ToolboxError = asToolboxError(err);
  let fix: HudState['fix'];
  const needed: BinaryId[] = item?.needs ?? [];
  if (error.kind === 'missing_dependency' || (item?.unavailable && needed.length > 0)) {
    const first = needed.find((id) => binCache?.bins[id] === false) ?? needed[0];
    if (first) {
      try {
        const info = await installInstructions(first);
        fix = { label: `Install ${BINARY_LABEL[first] ?? info.label}`, command: info.command };
      } catch {
        /* the message alone will do */
      }
    }
  }
  return {
    status: 'error',
    title: item?.unavailable ? item.unavailable : error.message || 'Something went wrong',
    detail: item?.unavailable ? (fix ? 'Toolbox never installs anything for you — copy the command and run it.' : undefined) : error.details ?? undefined,
    error,
    fix,
  };
}

// ------------------------------------------------------------------ context

function mergeBatches(batches: BatchResult[]): BatchResult {
  return {
    results: batches.flatMap((b) => b.results),
    failures: batches.flatMap((b) => b.failures),
    cancelled: batches.some((b) => b.cancelled),
    elapsedMs: batches.reduce((n, b) => n + b.elapsedMs, 0),
  };
}

export interface ContextOptions {
  /** Act on these files instead of the ring's. */
  files?: FileInfo[];
  folder?: string | null;
  /** Write results here (custom output folder) instead of beside the originals. */
  outputDir?: string;
  /** Leave the ring's progress pill alone — used for background work such as watch folders. */
  quiet?: boolean;
}

export function makeContext(bins: Bins, options: ContextOptions = {}): ActionCtx {
  const state = radial.get();
  const settings = useSettings.getState().settings;
  const files = options.files ?? state.files;
  const quiet = Boolean(options.quiet);

  const track = async <T,>(plan: JobPlan, pick: (id: string, batch: BatchResult) => T): Promise<T> => {
    const id = newJobId();
    if (!quiet) {
      radial.patch({ hud: { ...(radial.get().hud ?? { status: 'working', title: plan.label }), status: 'working', title: plan.label, taskId: id } });
    }
    const batch = await runTask({
      jobId: id,
      toolId: 'radial',
      toolName: 'Radial menu',
      label: plan.label,
      command: plan.command,
      args: plan.args,
      total: plan.total ?? 1,
    });
    return pick(id, batch);
  };

  return {
    files,
    paths: files.map((f) => f.path),
    folder: options.folder ?? state.folder,
    bins,
    settings,
    output: (overrides = {}): OutputSpec =>
      outputSpecFromSettings(options.outputDir ? { mode: 'custom', dir: options.outputDir, ...overrides } : overrides),
    job: (plan) => track(plan, (_id, batch) => batch),
    jobs: async (plans) => {
      const out: BatchResult[] = [];
      for (const plan of plans) out.push(await track(plan, (_id, batch) => batch));
      return mergeBatches(out);
    },
    data: <T,>(plan: JobPlan) =>
      track(plan, (id) => useTaskStore.getState().tasks.find((t) => t.id === id)?.raw as T),
    status: (message) => {
      const hud = radial.get().hud;
      if (!quiet && hud) radial.patch({ hud: { ...hud, detail: message } });
    },
    openCard: (card) => {
      if (!quiet) void showCard(card);
    },
    modal: async <T,>(fn: () => Promise<T>): Promise<T> => {
      const keep = currentLayout();
      if (keep) await applyLayout({ ...keep, sticky: true });
      try {
        return await fn();
      } finally {
        if (keep) await applyLayout(keep);
      }
    },
    openMain: async (route, files) => {
      await openInMain(route, files);
      closeRadial({ restoreFocus: false, instant: true });
    },
    close: () => closeRadial(),
  };
}

// ------------------------------------------------------------------ running

/** Run one petal. Tasks collapse the ring into the progress pill; `ui` items open cards or windows. */
export async function runItem(item: RadialItem): Promise<void> {
  const bins = binsNow() ?? {};
  const ctx = makeContext(bins);

  if (item.unavailable) {
    await showHud(await explainError(new Error(item.unavailable), item));
    scheduleClose(9000);
    return;
  }

  if (item.mode === 'ui') {
    try {
      await item.run(ctx);
    } catch (err) {
      await showHud(await explainError(err, item));
      scheduleClose(9000);
    }
    return;
  }

  const inputs = ctx.paths;
  await showHud({ status: 'working', title: item.title, detail: item.hint });
  try {
    const out = await item.run(ctx);
    const summary = normalize(out, item);
    const withActions: ActionResult = {
      ...summary,
      actions:
        summary.actions ??
        (summary.results?.length
          ? resultActions(summary.results, (n) => {
              const hud = radial.get().hud;
              if (hud) radial.patch({ hud: { status: 'done', title: `Moved ${plural(n, 'item', 'items')} to the Trash` } });
              scheduleClose(2600);
            })
          : undefined),
    };
    recordHistory(item, inputs, summary.results ?? []);
    await showHud({
      status: 'done',
      title: withActions.title ?? 'Done',
      detail: withActions.detail,
      result: withActions,
    });
    scheduleClose(withActions.actions?.length || withActions.snippet ? 8000 : 3200);
  } catch (err) {
    const error = asToolboxError(err);
    if (error.kind === 'cancelled') {
      closeRadial({ restoreFocus: false });
      return;
    }
    await showHud(await explainError(err, item));
    scheduleClose(12000);
  }
}

/** Run a callback from a card (create file, record…) and show the outcome in the pill. */
export async function finishWith(title: string, run: () => Promise<ActionResult | void>): Promise<void> {
  await showHud({ status: 'working', title });
  try {
    const result = (await run()) ?? { title: 'Done' };
    const results = result.results ?? [];
    const withActions: ActionResult = {
      ...result,
      actions:
        result.actions ??
        (results.length
          ? resultActions(results, (n) => {
              radial.patch({ hud: { status: 'done', title: `Moved ${plural(n, 'item', 'items')} to the Trash` } });
              scheduleClose(2600);
            })
          : undefined),
    };
    await showHud({ status: 'done', title: result.title ?? title, detail: result.detail, result: withActions });
    scheduleClose(withActions.actions?.length || withActions.snippet ? 8000 : 3200);
  } catch (err) {
    await showHud(await explainError(err, null));
    scheduleClose(12000);
  }
}

export async function cancelCurrent(): Promise<void> {
  const id = radial.get().hud?.taskId;
  if (id) await cancelTask(id);
  closeRadial({ restoreFocus: false });
}
