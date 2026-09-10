// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  MAX_PIXELS,
  MAX_SIDE,
  PT_PER_PX,
  pdfLayout,
  pointsToMm,
  prepareSvg,
  readIntrinsic,
  type PdfOptions,
} from './logic';

const opts = (patch: Partial<PdfOptions> = {}): PdfOptions => ({
  pageSize: 'artwork',
  orientation: 'auto',
  margin: 0,
  dpi: 300,
  ...patch,
});

describe('pdfLayout — page sized to the artwork', () => {
  it('converts CSS pixels to points at 96 dpi', () => {
    const l = pdfLayout(96, 48, opts());
    expect(l.pageWidth).toBeCloseTo(72, 6);
    expect(l.pageHeight).toBeCloseTo(36, 6);
    expect(l.width).toBeCloseTo(96 * PT_PER_PX, 6);
  });

  it('adds the margin on all four sides', () => {
    const l = pdfLayout(96, 96, opts({ margin: 18 }));
    expect(l.pageWidth).toBeCloseTo(72 + 36, 6);
    expect(l).toMatchObject({ x: 18, y: 18 });
  });

  it('rasterises at the requested dots per inch', () => {
    // 96 px = 1 inch, so 300 dpi means 300 pixels across.
    expect(pdfLayout(96, 96, opts({ dpi: 300 })).pixelWidth).toBe(300);
    expect(pdfLayout(96, 96, opts({ dpi: 150 })).pixelWidth).toBe(150);
    expect(pdfLayout(96, 96, opts({ dpi: 600 })).pixelHeight).toBe(600);
    expect(pdfLayout(96, 96, opts({ dpi: 300 })).effectiveDpi).toBe(300);
  });
});

describe('pdfLayout — fixed page sizes', () => {
  it('centres the artwork inside the margins', () => {
    const l = pdfLayout(100, 100, opts({ pageSize: 'a4', orientation: 'portrait', margin: 36 }));
    expect(l.pageWidth).toBeCloseTo(595.28, 2);
    expect(l.width).toBeCloseTo(595.28 - 72, 2);
    expect(l.x).toBeCloseTo(36, 2);
    expect(l.y).toBeCloseTo(36 + (841.89 - 72 - l.height) / 2, 2);
  });

  it('turns the page for wide artwork when the orientation is automatic', () => {
    const l = pdfLayout(1600, 900, opts({ pageSize: 'letter' }));
    expect(l.pageWidth).toBeGreaterThan(l.pageHeight);
    expect(l.pageWidth).toBe(792);
  });

  it('keeps portrait when told to, even for wide artwork', () => {
    const l = pdfLayout(1600, 900, opts({ pageSize: 'letter', orientation: 'portrait' }));
    expect(l.pageWidth).toBe(612);
    expect(l.width).toBeLessThanOrEqual(612);
  });

  it('scales the raster to the size the artwork ends up on the page', () => {
    // A tiny 24 px icon blown up to fill A4 still needs a print-resolution raster.
    const l = pdfLayout(24, 24, opts({ pageSize: 'a4', orientation: 'portrait', margin: 0, dpi: 300 }));
    expect(l.pixelWidth).toBe(Math.round((595.28 / 72) * 300));
  });

  it('clamps an absurd margin instead of producing a negative page box', () => {
    const l = pdfLayout(100, 100, opts({ pageSize: 'a4', margin: 5000 }));
    expect(l.width).toBeGreaterThan(0);
    expect(l.height).toBeGreaterThan(0);
    expect(l.x).toBeGreaterThan(0);
  });
});

describe('pdfLayout — raster limits', () => {
  it('lowers the dpi rather than asking for a canvas that cannot exist', () => {
    const l = pdfLayout(4000, 4000, opts({ dpi: 600 }));
    expect(l.pixelWidth).toBeLessThanOrEqual(MAX_SIDE);
    expect(l.pixelWidth * l.pixelHeight).toBeLessThanOrEqual(MAX_PIXELS + 1);
    expect(l.effectiveDpi).toBeLessThan(600);
  });

  it('never returns a zero-pixel raster for a zero-sized artwork', () => {
    const l = pdfLayout(0, 0, opts());
    expect(l.pixelWidth).toBeGreaterThanOrEqual(1);
    expect(l.pixelHeight).toBeGreaterThanOrEqual(1);
  });
});

describe('pointsToMm', () => {
  it('measures A4 as 210 mm wide', () => {
    expect(pointsToMm(595.28)).toBeCloseTo(210, 1);
  });
});

describe('readIntrinsic and prepareSvg', () => {
  it('reads the size from width and height, then from the viewBox', () => {
    expect(readIntrinsic('<svg xmlns="http://www.w3.org/2000/svg" width="2in" height="1in"/>').width).toBe(192);
    expect(readIntrinsic('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 10"/>')).toMatchObject({
      width: 30,
      height: 10,
      hasSize: true,
    });
    expect(readIntrinsic('<svg xmlns="http://www.w3.org/2000/svg"/>').hasSize).toBe(false);
  });

  it('pins the markup to the raster size and keeps it scalable', () => {
    const out = prepareSvg('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="5"><rect width="10" height="5"/></svg>', 1000, 500);
    expect(out).toContain('width="1000"');
    expect(out).toContain('viewBox="0 0 10 5"');
  });

  it('refuses markup it cannot parse', () => {
    expect(() => prepareSvg('<svg><g></svg>', 10, 10)).toThrow(/not valid XML/);
  });
});
