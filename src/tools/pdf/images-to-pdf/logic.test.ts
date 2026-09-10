import { describe, expect, it } from 'vitest';
import { defaultPdfName, isEmbeddable, layoutImage, pathVariants } from './logic';

describe('layoutImage — fit to image', () => {
  it('makes the page exactly the image plus the margin', () => {
    const l = layoutImage(800, 600, { pageSize: 'fit', orientation: 'auto', margin: 20, fit: 'contain' });
    expect(l.pageWidth).toBe(840);
    expect(l.pageHeight).toBe(640);
    expect(l).toMatchObject({ x: 20, y: 20, width: 800, height: 600, clip: false });
  });

  it('never scales the image, so a huge photo keeps its pixel size', () => {
    const l = layoutImage(6000, 4000, { pageSize: 'fit', orientation: 'auto', margin: 0, fit: 'cover' });
    expect(l.width).toBe(6000);
    expect(l.height).toBe(4000);
  });
});

describe('layoutImage — fixed page sizes', () => {
  it('picks landscape automatically for a wide image', () => {
    const l = layoutImage(1600, 900, { pageSize: 'a4', orientation: 'auto', margin: 0, fit: 'contain' });
    expect(l.pageWidth).toBeGreaterThan(l.pageHeight);
  });

  it('honours an explicit portrait choice for a wide image', () => {
    const l = layoutImage(1600, 900, { pageSize: 'a4', orientation: 'portrait', margin: 0, fit: 'contain' });
    expect(l.pageWidth).toBeLessThan(l.pageHeight);
  });

  it('contains the image inside the margins and centres it', () => {
    const l = layoutImage(1000, 1000, { pageSize: 'letter', orientation: 'portrait', margin: 36, fit: 'contain' });
    expect(l.width).toBeCloseTo(612 - 72, 4);
    expect(l.height).toBeCloseTo(612 - 72, 4);
    expect(l.x).toBeCloseTo(36, 4);
    // A square image on a tall page is centred vertically.
    expect(l.y).toBeCloseTo(36 + (792 - 72 - (612 - 72)) / 2, 4);
    expect(l.clip).toBe(false);
  });

  it('overflows the box in cover mode and asks for clipping', () => {
    const l = layoutImage(1000, 1000, { pageSize: 'letter', orientation: 'portrait', margin: 0, fit: 'cover' });
    expect(l.width).toBeCloseTo(792, 4);
    expect(l.height).toBeCloseTo(792, 4);
    expect(l.clip).toBe(true);
    // Centred means it hangs off both sides equally.
    expect(l.x).toBeCloseTo((612 - 792) / 2, 4);
  });

  it('clamps a margin bigger than the page instead of producing a negative box', () => {
    const l = layoutImage(1000, 1000, { pageSize: 'a4', orientation: 'portrait', margin: 5000, fit: 'contain' });
    expect(l.box.width).toBeGreaterThan(0);
    expect(l.box.height).toBeGreaterThan(0);
    expect(l.width).toBeGreaterThan(0);
  });

  it('survives a zero-sized image without dividing by zero', () => {
    const l = layoutImage(0, 0, { pageSize: 'a4', orientation: 'portrait', margin: 0, fit: 'contain' });
    expect(Number.isFinite(l.width)).toBe(true);
    expect(Number.isFinite(l.height)).toBe(true);
  });
});

describe('isEmbeddable', () => {
  it('accepts the two formats pdf-lib can embed, in any spelling', () => {
    expect(isEmbeddable('JPG')).toBe(true);
    expect(isEmbeddable('.jpeg')).toBe(true);
    expect(isEmbeddable('png')).toBe(true);
  });

  it('rejects formats that need converting first', () => {
    expect(isEmbeddable('heic')).toBe(false);
    expect(isEmbeddable('webp')).toBe(false);
    expect(isEmbeddable('tiff')).toBe(false);
  });
});

describe('pathVariants', () => {
  it('adds the /private spelling macOS canonicalisation produces', () => {
    expect(pathVariants('/tmp/a.jpg')).toEqual(['/tmp/a.jpg', '/private/tmp/a.jpg']);
  });

  it('adds the plain spelling for an already-canonical path', () => {
    expect(pathVariants('/private/tmp/a.jpg')).toEqual(['/private/tmp/a.jpg', '/tmp/a.jpg']);
  });
});

describe('defaultPdfName', () => {
  it('uses the single image name on its own', () => {
    expect(defaultPdfName('receipt', 1)).toBe('receipt');
  });

  it('says how many more images are in the batch', () => {
    expect(defaultPdfName('receipt', 4)).toBe('receipt-and-3-more');
  });

  it('falls back when there is no name to work from', () => {
    expect(defaultPdfName(undefined, 0)).toBe('images');
    expect(defaultPdfName('   ', 2)).toBe('images');
  });
});
