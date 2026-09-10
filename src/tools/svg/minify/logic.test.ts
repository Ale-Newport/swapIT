import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MINIFY,
  SAMPLE_SVG,
  buildMinifyConfig,
  clampPrecision,
  collapseWhitespace,
  minifySvg,
  type MinifyOptions,
} from './logic';

const opts = (patch: Partial<MinifyOptions> = {}): MinifyOptions => ({ ...DEFAULT_MINIFY, ...patch });

describe('buildMinifyConfig', () => {
  it('always makes several passes and never pretty-prints', () => {
    const config = buildMinifyConfig(opts());
    expect(config.multipass).toBe(true);
    expect(config.js2svg).toEqual({ pretty: false });
  });

  it('rounds every kind of number to the chosen precision', () => {
    const preset = buildMinifyConfig(opts({ precision: 0 })).plugins?.[0] as {
      params: { overrides: Record<string, unknown> };
    };
    expect(preset.params.overrides.convertPathData).toEqual({ floatPrecision: 0 });
    expect(preset.params.overrides.convertTransform).toEqual({ floatPrecision: 0 });
    expect(buildMinifyConfig(opts({ precision: 0 })).plugins).toContainEqual({
      name: 'cleanupListOfValues',
      params: { floatPrecision: 0 },
    });
  });

  it('adds the optional passes only when they are switched on', () => {
    const off = buildMinifyConfig(opts({ removeTitles: false, reusePaths: false })).plugins ?? [];
    expect(off).not.toContain('removeTitle');
    expect(off).not.toContain('reusePaths');
    const on = buildMinifyConfig(opts({ removeDimensions: true, removeScripts: true })).plugins ?? [];
    expect(on).toContain('removeDimensions');
    expect(on).toContain('removeScripts');
  });
});

describe('clampPrecision', () => {
  it('keeps the value inside the 0–3 range the slider offers', () => {
    expect(clampPrecision(-1)).toBe(0);
    expect(clampPrecision(7)).toBe(3);
    expect(clampPrecision(Number.NaN)).toBe(1);
  });
});

describe('collapseWhitespace', () => {
  it('removes the gaps between elements', () => {
    expect(collapseWhitespace('<svg>\n  <rect/>\n</svg>')).toBe('<svg><rect/></svg>');
  });

  it('leaves files containing <text> alone, where a gap is a real space', () => {
    const withText = '<svg><text>a <tspan>b</tspan>\n<tspan>c</tspan></text></svg>';
    expect(collapseWhitespace(withText)).toBe(withText);
  });

  it('trims the ends either way', () => {
    expect(collapseWhitespace('  <svg><text>x</text></svg>\n')).toBe('<svg><text>x</text></svg>');
  });
});

describe('minifySvg', () => {
  it('makes a hand-exported file substantially smaller', () => {
    const result = minifySvg(SAMPLE_SVG, opts());
    expect(result.after).toBeLessThan(result.before);
    expect(result.percent).toBeGreaterThan(40);
    expect(result.saved).toBe(result.before - result.after);
  });

  it('produces a single line with no gaps between elements', () => {
    const { data } = minifySvg(SAMPLE_SVG, opts());
    expect(data.split('\n')).toHaveLength(1);
    expect(data).not.toMatch(/>\s+</);
  });

  it('drops the title and description when asked, and keeps them when not', () => {
    expect(minifySvg(SAMPLE_SVG, opts()).data).not.toContain('<title>');
    const kept = minifySvg(SAMPLE_SVG, opts({ removeTitles: false })).data;
    expect(kept).toContain('<title>Cloud</title>');
    expect(kept).toContain('<desc>');
  });

  it('keeps width and height unless removing them is switched on', () => {
    expect(minifySvg(SAMPLE_SVG, opts()).data).toContain('width="64"');
    const stripped = minifySvg(SAMPLE_SVG, opts({ removeDimensions: true })).data;
    expect(stripped).not.toContain('width="64"');
    expect(stripped).toContain('viewBox="0 0 64 64"');
  });

  it('keeps a script unless removing scripts is switched on', () => {
    const withScript = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><script>alert(1)</script><rect width="8" height="8"/></svg>';
    expect(minifySvg(withScript, opts()).data).toContain('script');
    expect(minifySvg(withScript, opts({ removeScripts: true })).data).not.toContain('script');
  });

  it('rounds coordinates harder at a lower precision', () => {
    const loose = minifySvg(SAMPLE_SVG, opts({ precision: 0 })).after;
    const tight = minifySvg(SAMPLE_SVG, opts({ precision: 3 })).after;
    expect(loose).toBeLessThan(tight);
  });

  it('explains an empty input', () => {
    expect(() => minifySvg('  ', opts())).toThrow(/nothing to minify/i);
  });

  it('explains broken markup in a sentence a person can act on', () => {
    expect(() => minifySvg('<svg><g></svg>', opts())).toThrow(/not valid SVG markup/i);
  });
});
