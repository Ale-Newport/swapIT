import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, buildConfig, clampPrecision, optimizeSvg, type OptimizeOptions } from './logic';

const SVG = `<?xml version="1.0" encoding="UTF-8"?>
<!-- drawn by hand -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
     width="100" height="100" viewBox="0 0 100 100" sodipodi:docname="thing.svg">
  <metadata>rdf junk</metadata>
  <g id="layer1"><rect x="10.123456" y="10.987654" width="30" height="30" fill="#ff0000"/></g>
  <g display="none"><rect width="5" height="5"/></g>
  <circle cx="50" cy="50" r="20"/>
</svg>`;

const opts = (patch: Partial<OptimizeOptions> = {}): OptimizeOptions => ({ ...DEFAULT_OPTIONS, ...patch });

describe('buildConfig', () => {
  it('disables nothing when every clean-up is left on', () => {
    const config = buildConfig(opts());
    const preset = config.plugins?.[0] as { name: string; params: { overrides: Record<string, unknown> } };
    expect(preset.name).toBe('preset-default');
    const disabled = Object.entries(preset.params.overrides).filter(([, v]) => v === false);
    expect(disabled).toEqual([]);
  });

  it('turns a toggle off by disabling exactly that plugin', () => {
    const preset = buildConfig(opts({ collapseGroups: false })).plugins?.[0] as {
      params: { overrides: Record<string, unknown> };
    };
    expect(preset.params.overrides.collapseGroups).toBe(false);
    expect(preset.params.overrides.mergePaths).toBeUndefined();
  });

  it('keeps ellipses as ellipses when shape conversion is off', () => {
    const preset = buildConfig(opts({ convertShapesToPaths: false })).plugins?.[0] as {
      params: { overrides: Record<string, unknown> };
    };
    expect(preset.params.overrides.convertShapeToPath).toBe(false);
    expect(preset.params.overrides.convertEllipseToCircle).toBe(false);
  });

  it('feeds the precision to every plugin that rounds numbers', () => {
    const config = buildConfig(opts({ precision: 1 }));
    const preset = config.plugins?.[0] as { params: { floatPrecision: number; overrides: Record<string, unknown> } };
    expect(config.floatPrecision).toBe(1);
    expect(preset.params.floatPrecision).toBe(1);
    expect(preset.params.overrides.convertPathData).toEqual({ floatPrecision: 1 });
    expect(preset.params.overrides.cleanupNumericValues).toEqual({ floatPrecision: 1 });
  });

  it('only adds removeViewBox and prefixIds when they are asked for', () => {
    expect(buildConfig(opts()).plugins).toHaveLength(1);
    const plugins = buildConfig(opts({ removeViewBox: true, prefixIds: true, idPrefix: ' logo ' })).plugins ?? [];
    expect(plugins).toContain('removeViewBox');
    expect(plugins).toContainEqual({ name: 'prefixIds', params: { prefix: 'logo' } });
  });

  it('falls back to a usable prefix when the field is left blank', () => {
    const plugins = buildConfig(opts({ prefixIds: true, idPrefix: '   ' })).plugins ?? [];
    expect(plugins).toContainEqual({ name: 'prefixIds', params: { prefix: 'id' } });
  });
});

describe('clampPrecision', () => {
  it('stays inside the 0–5 range the slider offers', () => {
    expect(clampPrecision(-4)).toBe(0);
    expect(clampPrecision(9)).toBe(5);
    expect(clampPrecision(2.6)).toBe(3);
    expect(clampPrecision(Number.NaN)).toBe(3);
  });
});

describe('optimizeSvg', () => {
  it('shrinks a hand-written file and reports the saving', () => {
    const result = optimizeSvg(SVG, opts());
    expect(result.after).toBeLessThan(result.before);
    expect(result.saved).toBe(result.before - result.after);
    expect(result.percent).toBeGreaterThan(10);
  });

  it('strips comments, metadata and editor namespaces by default', () => {
    const { data } = optimizeSvg(SVG, opts());
    expect(data).not.toContain('drawn by hand');
    expect(data).not.toContain('<metadata>');
    expect(data).not.toContain('sodipodi');
  });

  it('keeps comments when that toggle is off', () => {
    const { data } = optimizeSvg(SVG, opts({ removeComments: false }));
    expect(data).toContain('drawn by hand');
  });

  it('keeps hidden elements when that toggle is off', () => {
    expect(optimizeSvg(SVG, opts({ removeHiddenElements: false })).data).toContain('display="none"');
    expect(optimizeSvg(SVG, opts()).data).not.toContain('display="none"');
  });

  it('never drops the viewBox unless asked', () => {
    expect(optimizeSvg(SVG, opts()).data).toContain('viewBox="0 0 100 100"');
    expect(optimizeSvg(SVG, opts({ removeViewBox: true })).data).not.toContain('viewBox');
  });

  it('rounds coordinates to the chosen precision', () => {
    expect(optimizeSvg(SVG, opts({ precision: 1 })).data).toContain('10.1');
    // The rect becomes a path, so the rounding shows up in the path data.
    expect(optimizeSvg(SVG, opts({ precision: 0 })).data).toContain('d="M10 11h30v30H10z"');
  });

  it('can keep the result readable instead of on one line', () => {
    expect(optimizeSvg(SVG, opts({ pretty: true })).data).toContain('\n');
    expect(optimizeSvg(SVG, opts({ pretty: false })).data.split('\n')).toHaveLength(1);
  });

  it('explains an empty file rather than returning nothing', () => {
    expect(() => optimizeSvg('   ', opts())).toThrow(/nothing to optimise/i);
  });

  it('explains broken markup in a sentence a person can act on', () => {
    expect(() => optimizeSvg('<svg><g></svg>', opts())).toThrow(/not valid SVG markup/i);
  });
});
