import { describe, expect, it } from 'vitest';
import { converterFor, currentExtensions, isRisky, normalizeExtension } from './logic';

describe('normalizeExtension', () => {
  it('strips dots, spaces and case', () => {
    expect(normalizeExtension(' .JPG ')).toBe('jpg');
    expect(normalizeExtension('..Png')).toBe('png');
    expect(normalizeExtension('t x t')).toBe('txt');
  });

  it('keeps a compound extension intact', () => {
    expect(normalizeExtension('.tar.gz')).toBe('tar.gz');
  });

  it('returns an empty string for nothing useful', () => {
    expect(normalizeExtension('   ')).toBe('');
    expect(normalizeExtension('.')).toBe('');
  });
});

describe('currentExtensions', () => {
  it('lists the extensions in the selection, most common first', () => {
    expect(currentExtensions(['a.png', 'b.PNG', 'c.jpg'])).toEqual(['png', 'jpg']);
  });

  it('reports an empty extension for files that have none', () => {
    expect(currentExtensions(['README'])).toEqual(['']);
  });

  it('ignores a leading dot in a hidden file', () => {
    expect(currentExtensions(['.gitignore'])).toEqual(['']);
  });
});

describe('converterFor', () => {
  it('points at the tool that really converts, by family', () => {
    expect(converterFor('jpg')?.to).toBe('/t/images/convert');
    expect(converterFor('.MP4')?.to).toBe('/t/video/convert');
    expect(converterFor('flac')?.to).toBe('/t/audio/convert');
  });

  it('has no suggestion for formats with no converter', () => {
    expect(converterFor('txt')).toBeNull();
    expect(converterFor('')).toBeNull();
  });
});

describe('isRisky', () => {
  it('warns when the new extension names a different format', () => {
    expect(isRisky(['png'], 'jpg')).toBe(true);
    expect(isRisky(['txt', 'png'], 'jpg')).toBe(true);
  });

  it('stays quiet for spellings of the same format', () => {
    expect(isRisky(['jpeg'], 'jpg')).toBe(false);
    expect(isRisky(['tiff'], 'tif')).toBe(false);
    expect(isRisky(['yml'], 'yaml')).toBe(false);
  });

  it('stays quiet when the extension is unchanged or missing', () => {
    expect(isRisky(['jpg'], 'jpg')).toBe(false);
    expect(isRisky([''], 'jpg')).toBe(false);
    expect(isRisky(['png'], '')).toBe(false);
  });
});
