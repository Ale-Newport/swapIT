import { describe, expect, it } from 'vitest';
import { buildCompressOpts, describeCompression, isCompressPreset, presetDpi } from './logic';

describe('isCompressPreset', () => {
  it('accepts the four Ghostscript profiles and nothing else', () => {
    expect(isCompressPreset('screen')).toBe(true);
    expect(isCompressPreset('prepress')).toBe(true);
    expect(isCompressPreset('default')).toBe(false);
    expect(isCompressPreset('')).toBe(false);
  });
});

describe('buildCompressOpts', () => {
  it('omits the resolution entirely when none is set', () => {
    expect(buildCompressOpts('screen', false, null)).toEqual({ preset: 'screen', grayscale: false });
  });

  it('clamps a resolution into the range Ghostscript accepts', () => {
    expect(buildCompressOpts('ebook', false, 5).dpi).toBe(36);
    expect(buildCompressOpts('ebook', false, 4000).dpi).toBe(600);
    expect(buildCompressOpts('ebook', false, 149.6).dpi).toBe(150);
  });

  it('falls back to the balanced profile for an unknown name', () => {
    expect(buildCompressOpts('tiny', true, null)).toEqual({ preset: 'ebook', grayscale: true });
  });

  it('ignores a resolution that is not a number', () => {
    expect(buildCompressOpts('printer', false, Number.NaN)).toEqual({
      preset: 'printer',
      grayscale: false,
    });
  });
});

describe('describeCompression', () => {
  it('uses the profile resolution when no explicit one is set', () => {
    expect(describeCompression({ preset: 'screen', grayscale: false })).toContain('72 dpi');
    expect(presetDpi('printer')).toBe(300);
  });

  it('prefers an explicit resolution and mentions grayscale', () => {
    expect(describeCompression({ preset: 'ebook', grayscale: true, dpi: 96 })).toBe(
      'Images are downsampled to 96 dpi, converted to grayscale. Text stays sharp at any size.',
    );
  });
});
