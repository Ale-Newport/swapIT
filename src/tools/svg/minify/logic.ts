import { optimize } from 'svgo/browser';
import type { Config, PluginConfig, PresetDefaultOverrides } from 'svgo/browser';

/**
 * Minification is SVGO's full default pass, sharpened: several passes, tight
 * number rounding, list values cleaned up, and the whitespace between elements
 * squeezed out afterwards. Everything that could change how a file behaves
 * rather than how it looks is a toggle.
 */
export interface MinifyOptions {
  /** Decimal places kept on coordinates, 0–3. */
  precision: number;
  /** <title> and <desc> — accessible names, dead weight in a sprite. */
  removeTitles: boolean;
  /** Drop width/height and keep the viewBox, so CSS decides the size. */
  removeDimensions: boolean;
  /** Replace repeated identical paths with a single <use>. */
  reusePaths: boolean;
  removeScripts: boolean;
}

export const DEFAULT_MINIFY: MinifyOptions = {
  precision: 1,
  removeTitles: true,
  removeDimensions: false,
  reusePaths: true,
  removeScripts: false,
};

export function clampPrecision(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(3, Math.max(0, Math.round(value)));
}

export function buildMinifyConfig(opts: MinifyOptions): Config {
  const precision = clampPrecision(opts.precision);
  const overrides: PresetDefaultOverrides = {
    cleanupNumericValues: { floatPrecision: precision },
    convertPathData: { floatPrecision: precision },
    convertTransform: { floatPrecision: precision },
    removeDesc: { removeAny: opts.removeTitles },
  };

  const plugins: PluginConfig[] = [
    { name: 'preset-default', params: { floatPrecision: precision, overrides } },
    { name: 'cleanupListOfValues', params: { floatPrecision: precision } },
  ];
  if (opts.removeTitles) plugins.push('removeTitle');
  if (opts.removeDimensions) plugins.push('removeDimensions');
  if (opts.reusePaths) plugins.push('reusePaths');
  if (opts.removeScripts) plugins.push('removeScripts');

  return {
    multipass: true,
    floatPrecision: precision,
    plugins,
    js2svg: { pretty: false },
  };
}

/**
 * Squeeze out the gaps left between elements. Inside <text> that whitespace is
 * rendered content, so files containing text are left exactly as SVGO wrote
 * them rather than risking a lost word space.
 */
export function collapseWhitespace(svg: string): string {
  if (/<text[\s>]/i.test(svg)) return svg.trim();
  return svg.replace(/>\s+</g, '><').trim();
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

export interface MinifyResult {
  data: string;
  before: number;
  after: number;
  saved: number;
  /** Percentage of the original size removed; negative if the file grew. */
  percent: number;
}

export function minifySvg(source: string, opts: MinifyOptions): MinifyResult {
  if (!source.trim()) {
    throw new Error('There is nothing to minify — paste some SVG markup or open a file.');
  }
  let data: string;
  try {
    data = collapseWhitespace(optimize(source, buildMinifyConfig(opts)).data);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `This is not valid SVG markup, so it could not be minified. Open it in the SVG Viewer to see what is wrong. (${detail})`,
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

export const SAMPLE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<!-- exported from a drawing app -->
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <title>Cloud</title>
  <desc>A small cloud icon</desc>
  <g id="layer1">
    <path d="M20.000000,40.000000 C14.500000,40.000000 10.000000,35.500000 10.000000,30.000000 C10.000000,24.500000 14.500000,20.000000 20.000000,20.000000 Z" fill="#4488ff"/>
    <rect x="20.123456" y="30.987654" width="24.000000" height="10.000000" fill="#4488ff"/>
  </g>
</svg>`;
