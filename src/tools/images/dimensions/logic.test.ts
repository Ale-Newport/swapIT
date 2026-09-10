import { describe, it, expect } from 'vitest';
import {
  humanColorType,
  nextSort,
  orientation,
  sortRows,
  toCsv,
  totals,
  type ImageInfoRow,
} from './logic';

function row(patch: Partial<ImageInfoRow>): ImageInfoRow {
  return {
    path: '/photos/a.jpg',
    name: 'a.jpg',
    width: 100,
    height: 100,
    megapixels: 0.01,
    aspectRatio: '1:1',
    colorType: 'Rgb8',
    format: 'JPG',
    size: 1000,
    hasAlpha: false,
    ...patch,
  };
}

describe('humanColorType', () => {
  it('translates the image crate enum names', () => {
    expect(humanColorType('Rgba8')).toBe('RGBA 8-bit');
    expect(humanColorType('L16')).toBe('Grayscale 16-bit');
    expect(humanColorType('Rgb32F')).toBe('RGB 32-bit float');
  });

  it('passes anything it does not recognise straight through', () => {
    expect(humanColorType('Cmyk8')).toBe('Cmyk8');
  });
});

describe('orientation', () => {
  it('names the three shapes', () => {
    expect(orientation({ width: 10, height: 10 })).toBe('Square');
    expect(orientation({ width: 16, height: 9 })).toBe('Landscape');
    expect(orientation({ width: 9, height: 16 })).toBe('Portrait');
  });
});

describe('sortRows', () => {
  const rows = [
    row({ name: 'beta.png', width: 200, height: 100, megapixels: 0.02, size: 500, hasAlpha: true }),
    row({ name: 'Alpha.jpg', width: 100, height: 400, megapixels: 0.04, size: 900 }),
    row({ name: 'gamma.webp', width: 200, height: 300, megapixels: 0.06, size: 700 }),
  ];

  it('sorts names case-insensitively', () => {
    expect(sortRows(rows, 'name', 'asc').map((r) => r.name)).toEqual([
      'Alpha.jpg',
      'beta.png',
      'gamma.webp',
    ]);
  });

  it('breaks a width tie with the height', () => {
    expect(sortRows(rows, 'width', 'asc').map((r) => r.name)).toEqual([
      'Alpha.jpg',
      'beta.png',
      'gamma.webp',
    ]);
  });

  it('sorts by pixel count when asked for megapixels', () => {
    expect(sortRows(rows, 'megapixels', 'desc').map((r) => r.name)).toEqual([
      'gamma.webp',
      'Alpha.jpg',
      'beta.png',
    ]);
  });

  it('sorts by the numeric aspect ratio, not the label', () => {
    expect(sortRows(rows, 'aspect', 'desc').map((r) => r.name)).toEqual([
      'beta.png',
      'gamma.webp',
      'Alpha.jpg',
    ]);
  });

  it('groups transparent images together', () => {
    expect(sortRows(rows, 'alpha', 'desc')[0].name).toBe('beta.png');
  });

  it('is stable for equal values', () => {
    const flat = [row({ name: 'one.png' }), row({ name: 'two.png' }), row({ name: 'three.png' })];
    expect(sortRows(flat, 'size', 'desc').map((r) => r.name)).toEqual([
      'one.png',
      'two.png',
      'three.png',
    ]);
  });

  it('does not mutate the input', () => {
    const original = rows.map((r) => r.name);
    sortRows(rows, 'size', 'asc');
    expect(rows.map((r) => r.name)).toEqual(original);
  });
});

describe('nextSort', () => {
  it('starts text columns ascending and numbers descending', () => {
    expect(nextSort({ key: 'size', direction: 'desc' }, 'name')).toEqual({
      key: 'name',
      direction: 'asc',
    });
    expect(nextSort({ key: 'name', direction: 'asc' }, 'size')).toEqual({
      key: 'size',
      direction: 'desc',
    });
  });

  it('flips the direction when the same column is clicked again', () => {
    expect(nextSort({ key: 'size', direction: 'desc' }, 'size')).toEqual({
      key: 'size',
      direction: 'asc',
    });
  });
});

describe('totals', () => {
  it('adds up pixels and bytes', () => {
    const result = totals([
      row({ width: 100, height: 100, size: 1000 }),
      row({ width: 200, height: 50, size: 2000 }),
    ]);
    expect(result).toEqual({ count: 2, pixels: 20000, bytes: 3000 });
  });

  it('reports zeroes for an empty table', () => {
    expect(totals([])).toEqual({ count: 0, pixels: 0, bytes: 0 });
  });
});

describe('toCsv', () => {
  it('writes a header and one line per image', () => {
    const csv = toCsv([row({ name: 'a.jpg' })]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0].startsWith('Name,Width,Height')).toBe(true);
    expect(lines[1]).toBe('a.jpg,100,100,0.01,1:1,Square,RGB 8-bit,no,JPG,1000,/photos/a.jpg');
  });

  it('quotes names containing commas and doubles embedded quotes', () => {
    const csv = toCsv([row({ name: 'holiday, "final".jpg', path: '/a,b/c.jpg' })]);
    expect(csv).toContain('"holiday, ""final"".jpg"');
    expect(csv).toContain('"/a,b/c.jpg"');
  });

  it('reports alpha as a word rather than a boolean literal', () => {
    expect(toCsv([row({ hasAlpha: true })]).split('\n')[1]).toContain(',yes,');
  });
});
