import { optimize } from 'svgo/browser';
import type { Config, PluginConfig, PresetDefaultOverrides } from 'svgo/browser';

/**
 * SVGO configuration, expressed as the handful of decisions that actually
 * change what an exported vector looks like. Kept pure so the mapping from
 * toggle to plugin can be tested without a browser.
 */
export interface OptimizeOptions {
  removeComments: boolean;
  /** The `<metadata>` block only — RDF, licence and editor bookkeeping. */
  removeMetadata: boolean;
  /** `<title>` and `<desc>`: accessible names, dead weight in a sprite. */
  removeTitles: boolean;
  /** Inkscape, Illustrator and Sketch leave private namespaces behind. */
  removeEditorData: boolean;
  removeHiddenElements: boolean;
  collapseGroups: boolean;
  mergePaths: boolean;
  convertShapesToPaths: boolean;
  /** Decimal places kept on coordinates, 0–5. */
  precision: number;
  /** Off by default: dropping the viewBox stops the image scaling. */
  removeViewBox: boolean;
  prefixIds: boolean;
  idPrefix: string;
  multipass: boolean;
  /** Keep the output indented and readable instead of on one line. */
  pretty: boolean;
}

export const DEFAULT_OPTIONS: OptimizeOptions = {
  removeComments: true,
  removeMetadata: true,
  // Off by default: a <title> is the accessible name a screen reader announces.
  removeTitles: false,
  removeEditorData: true,
  removeHiddenElements: true,
  collapseGroups: true,
  mergePaths: true,
  convertShapesToPaths: true,
  precision: 3,
  removeViewBox: false,
  prefixIds: false,
  idPrefix: 'icon',
  multipass: true,
  pretty: false,
};

export function clampPrecision(value: number): number {
  if (!Number.isFinite(value)) return 3;
  return Math.min(5, Math.max(0, Math.round(value)));
}

/**
 * Everything in `preset-default` runs unless a toggle turns it off, so the
 * overrides map only ever carries the plugins the user has disabled plus the
 * two that take the precision setting.
 */
export function buildConfig(opts: OptimizeOptions): Config {
  const precision = clampPrecision(opts.precision);
  const overrides: PresetDefaultOverrides = {
    cleanupNumericValues: { floatPrecision: precision },
    convertPathData: { floatPrecision: precision },
  };
  if (!opts.removeComments) overrides.removeComments = false;
  if (!opts.removeMetadata) overrides.removeMetadata = false;
  // preset-default's removeDesc only drops editor boilerplate; widen it to every
  // description, and add removeTitle, which the preset does not contain at all.
  if (opts.removeTitles) overrides.removeDesc = { removeAny: true };
  if (!opts.removeEditorData) overrides.removeEditorsNSData = false;
  if (!opts.removeHiddenElements) overrides.removeHiddenElems = false;
  if (!opts.collapseGroups) overrides.collapseGroups = false;
  if (!opts.mergePaths) overrides.mergePaths = false;
  if (!opts.convertShapesToPaths) {
    overrides.convertShapeToPath = false;
    overrides.convertEllipseToCircle = false;
  }

  const plugins: PluginConfig[] = [{ name: 'preset-default', params: { floatPrecision: precision, overrides } }];
  // Not part of preset-default in SVGO 4 — added only when explicitly asked for.
  if (opts.removeTitles) plugins.push('removeTitle');
  if (opts.removeViewBox) plugins.push('removeViewBox');
  if (opts.prefixIds) {
    plugins.push({ name: 'prefixIds', params: { prefix: opts.idPrefix.trim() || 'id' } });
  }

  return {
    multipass: opts.multipass,
    floatPrecision: precision,
    plugins,
    js2svg: opts.pretty ? { pretty: true, indent: 2 } : { pretty: false },
  };
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

export interface OptimizeResult {
  data: string;
  before: number;
  after: number;
  saved: number;
  /** Percentage of the original size removed; negative if the file grew. */
  percent: number;
}

export function optimizeSvg(source: string, opts: OptimizeOptions): OptimizeResult {
  if (!source.trim()) {
    throw new Error('There is nothing to optimise — this file is empty.');
  }
  let data: string;
  try {
    data = optimize(source, buildConfig(opts)).data;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `This is not valid SVG markup, so it could not be optimised. Open it in the SVG Viewer to see what is wrong. (${detail})`,
    );
  }
  const before = byteLength(source);
  const after = byteLength(data);
  return {
    data,
    before,
    after,
    saved: before - after,
    percent: before > 0 ? ((before - after) / before) * 100 : 0,
  };
}
