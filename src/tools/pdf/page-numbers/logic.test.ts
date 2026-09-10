import { describe, expect, it } from 'vitest';
import {
  describePdfError,
  highestNumber,
  normalizeRotation,
  parseHexColor,
  placeLabel,
  planStamps,
  renderTemplate,
  toUserSpace,
} from './logic';

describe('parseHexColor', () => {
  it('reads the long and short forms', () => {
    expect(parseHexColor('#ffffff')).toEqual({ r: 1, g: 1, b: 1 });
    expect(parseHexColor('000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseHexColor('#f00')).toEqual({ r: 1, g: 0, b: 0 });
  });

  it('rejects anything that is not a colour', () => {
    expect(parseHexColor('')).toBeNull();
    expect(parseHexColor('#12345')).toBeNull();
    expect(parseHexColor('rebeccapurple')).toBeNull();
    expect(parseHexColor('#gggggg')).toBeNull();
  });
});

describe('planStamps', () => {
  it('numbers every page from one by default', () => {
    expect(planStamps(3, 1, false)).toEqual([
      { index: 0, number: 1 },
      { index: 1, number: 2 },
      { index: 2, number: 3 },
    ]);
  });

  it('leaves the cover bare but keeps the count running', () => {
    expect(planStamps(3, 1, true)).toEqual([
      { index: 1, number: 2 },
      { index: 2, number: 3 },
    ]);
  });

  it('offsets numbering when the document continues from another one', () => {
    expect(planStamps(2, 17, false)).toEqual([
      { index: 0, number: 17 },
      { index: 1, number: 18 },
    ]);
  });

  it('produces nothing for an empty document', () => {
    expect(planStamps(0, 1, false)).toEqual([]);
    expect(planStamps(1, 1, true)).toEqual([]);
  });
});

describe('highestNumber', () => {
  it('is the page count when numbering starts at one', () => {
    expect(highestNumber(10, 1)).toBe(10);
  });

  it('follows the start number so "3 of 12" stays true', () => {
    expect(highestNumber(10, 3)).toBe(12);
  });
});

describe('renderTemplate', () => {
  it('fills both placeholders', () => {
    expect(renderTemplate('Page {n} of {total}', 4, 10)).toBe('Page 4 of 10');
    expect(renderTemplate('- {n} -', 4, 10)).toBe('- 4 -');
  });

  it('leaves literal text that looks nothing like a placeholder alone', () => {
    expect(renderTemplate('Section {n}', 2, 9)).toBe('Section 2');
  });
});

describe('normalizeRotation', () => {
  it('snaps to the four legal quarter turns', () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(450)).toBe(90);
  });

  it('handles the negative rotations some writers emit', () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(-180)).toBe(180);
  });
});

describe('toUserSpace', () => {
  const W = 600;
  const H = 800;

  it('is the identity on an unrotated page', () => {
    expect(toUserSpace(10, 20, W, H, 0)).toEqual({ x: 10, y: 20 });
  });

  it('maps the visual bottom-left corner back to a real corner for every turn', () => {
    // The visual page is H x W wide for a quarter turn, so its corners must land
    // inside the real page for the maths to be right.
    for (const rotation of [90, 180, 270] as const) {
      const p = toUserSpace(0, 0, W, H, rotation);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(W);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(H);
    }
  });

  it('turns a 90-degree page correctly', () => {
    // Visual (0,0) is the reader's bottom-left; on a 90° page that is the
    // document's top-left corner.
    expect(toUserSpace(0, 0, W, H, 90)).toEqual({ x: W, y: 0 });
    expect(toUserSpace(H, W, W, H, 90)).toEqual({ x: 0, y: H });
  });
});

describe('placeLabel', () => {
  const base = { pageWidth: 600, pageHeight: 800, rotation: 0, margin: 36, textWidth: 40, fontSize: 10 };

  it('centres the label horizontally at the bottom', () => {
    const p = placeLabel({ ...base, anchor: 'bottom-center' });
    expect(p.x).toBeCloseTo((600 - 40) / 2, 4);
    expect(p.y).toBeCloseTo(36, 4);
    expect(p.rotate).toBe(0);
  });

  it('keeps the right-hand label inside the margin', () => {
    const p = placeLabel({ ...base, anchor: 'bottom-right' });
    expect(p.x).toBeCloseTo(600 - 36 - 40, 4);
  });

  it('sits the top label below the top margin, not above the page', () => {
    const p = placeLabel({ ...base, anchor: 'top-center' });
    expect(p.y).toBeCloseTo(800 - 36 - 10, 4);
    expect(p.y).toBeLessThan(800);
  });

  it('rotates with the page so the number reads upright', () => {
    const p = placeLabel({ ...base, rotation: 90, anchor: 'bottom-center' });
    expect(p.rotate).toBe(90);
    // On a 90° page the visual bottom edge is the document's right edge.
    expect(p.x).toBeCloseTo(600 - 36, 4);
    expect(p.y).toBeCloseTo((800 - 40) / 2, 4);
  });

  it('never places the label at a negative coordinate when the margin swallows the page', () => {
    const p = placeLabel({ ...base, margin: 5000, anchor: 'bottom-right' });
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
  });
});

describe('describePdfError', () => {
  it('points an encrypted file at the decrypt tool', () => {
    const message = describePdfError(new Error('Input document to `PDFDocument.load` is encrypted.'), 'report.pdf');
    expect(message).toContain('report.pdf');
    expect(message).toContain('Decrypt PDF');
  });

  it('calls a damaged file damaged', () => {
    expect(describePdfError(new Error('No PDF header found'), 'broken.pdf')).toContain('damaged');
  });

  it('still says something useful for an error it does not recognise', () => {
    const message = describePdfError('disk went away', 'a.pdf');
    expect(message).toContain('a.pdf');
    expect(message).toContain('disk went away');
  });
});
