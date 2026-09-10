import { describe, expect, it } from 'vitest';
import {
  MAX_TILES,
  anchorCenter,
  anchorFromCenter,
  describePdfError,
  parsePageRange,
  parseRangeTokens,
  rotatedExtent,
  tileCenters,
  toUserSpace,
  unsupportedCharacters,
  validatePageRange,
} from './logic';

describe('parsePageRange', () => {
  it('reads a mix of single pages and spans', () => {
    expect(parsePageRange('1-3, 7', 10)).toEqual([0, 1, 2, 6]);
  });

  it('treats a trailing dash as "to the end"', () => {
    expect(parsePageRange('8-', 10)).toEqual([7, 8, 9]);
  });

  it('clamps a span that runs past the last page', () => {
    expect(parsePageRange('9-999', 10)).toEqual([8, 9]);
  });

  it('removes duplicates and sorts', () => {
    expect(parsePageRange('5, 1-2, 5', 10)).toEqual([0, 1, 4]);
  });

  it('rejects a backwards span', () => {
    expect(() => parsePageRange('7-2', 10)).toThrow(/backwards/);
  });

  it('rejects page zero', () => {
    expect(() => parsePageRange('0-3', 10)).toThrow(/start at 1/);
  });

  it('rejects text that is not a range', () => {
    expect(() => parsePageRange('last two', 10)).toThrow(/not a page range/);
    expect(() => parsePageRange('1..3', 10)).toThrow(/not a page range/);
  });

  it('says so when the range selects nothing at all', () => {
    expect(() => parsePageRange('40-50', 10)).toThrow(/selects nothing/);
  });

  it('asks for input rather than silently doing every page', () => {
    expect(() => parsePageRange('   ', 10)).toThrow(/Enter the pages/);
  });
});

describe('parseRangeTokens', () => {
  it('keeps an open-ended span open instead of resolving it to a length', () => {
    expect(parseRangeTokens('1-3, 7, 12-')).toEqual([
      { from: 1, to: 3 },
      { from: 7, to: 7 },
      { from: 12, to: null },
    ]);
  });
});

describe('validatePageRange', () => {
  it('accepts a well-formed range without knowing the page count', () => {
    expect(() => validatePageRange('1-')).not.toThrow();
    expect(() => validatePageRange('2, 4-6, 20-')).not.toThrow();
  });

  it('rejects the same typos parsePageRange does', () => {
    expect(() => validatePageRange('last two')).toThrow(/not a page range/);
    expect(() => validatePageRange('7-2')).toThrow(/backwards/);
    expect(() => validatePageRange('0-3')).toThrow(/start at 1/);
    expect(() => validatePageRange('  ')).toThrow(/Enter the pages/);
    expect(() => validatePageRange(', ,')).toThrow(/Enter the pages/);
  });
});

describe('rotatedExtent', () => {
  it('leaves an unrotated box alone', () => {
    expect(rotatedExtent(100, 20, 0)).toEqual({ width: 100, height: 20 });
  });

  it('swaps the sides at a quarter turn', () => {
    const r = rotatedExtent(100, 20, 90);
    expect(r.width).toBeCloseTo(20, 6);
    expect(r.height).toBeCloseTo(100, 6);
  });

  it('grows on the diagonal', () => {
    const r = rotatedExtent(100, 100, 45);
    expect(r.width).toBeCloseTo(Math.SQRT2 * 100, 6);
  });
});

describe('anchorFromCenter', () => {
  it('is a plain half-box offset with no rotation', () => {
    expect(anchorFromCenter(200, 300, 100, 20, 0)).toEqual({ x: 150, y: 290 });
  });

  it('round-trips: drawing from the anchor lands the centre back where asked', () => {
    const deg = 45;
    const rad = (deg * Math.PI) / 180;
    const [w, h] = [120, 30];
    const a = anchorFromCenter(200, 300, w, h, deg);
    // Re-derive the centre from the anchor the way a PDF viewer would.
    const cx = a.x + ((w / 2) * Math.cos(rad) - (h / 2) * Math.sin(rad));
    const cy = a.y + ((w / 2) * Math.sin(rad) + (h / 2) * Math.cos(rad));
    expect(cx).toBeCloseTo(200, 6);
    expect(cy).toBeCloseTo(300, 6);
  });
});

describe('anchorCenter', () => {
  it('keeps a corner mark a full margin away from both edges', () => {
    const { cx, cy } = anchorCenter('bottom-left', 600, 800, 30, 100, 20);
    expect(cx - 100 / 2).toBeCloseTo(30, 6);
    expect(cy - 20 / 2).toBeCloseTo(30, 6);
  });

  it('centres the middle position regardless of margin', () => {
    expect(anchorCenter('middle-center', 600, 800, 90, 100, 20)).toEqual({ cx: 300, cy: 400 });
  });

  it('mirrors left and right', () => {
    const left = anchorCenter('top-left', 600, 800, 30, 100, 20);
    const right = anchorCenter('top-right', 600, 800, 30, 100, 20);
    expect(left.cx + right.cx).toBeCloseTo(600, 6);
    expect(left.cy).toBeCloseTo(right.cy, 6);
  });
});

describe('tileCenters', () => {
  it('spreads tiles evenly and symmetrically across the page', () => {
    const centers = tileCenters(600, 800, 200, 200);
    expect(centers).toHaveLength(3 * 4);
    expect(centers[0]).toEqual({ cx: 100, cy: 100 });
    // The pattern is symmetric: first and last centres mirror about the middle.
    const last = centers[centers.length - 1];
    expect(centers[0].cx + last.cx).toBeCloseTo(600, 6);
    expect(centers[0].cy + last.cy).toBeCloseTo(800, 6);
  });

  it('always produces at least one tile', () => {
    expect(tileCenters(600, 800, 5000, 5000)).toHaveLength(1);
  });

  it('refuses to run away when the mark is tiny', () => {
    expect(tileCenters(600, 800, 0.01, 0.01).length).toBe(MAX_TILES);
  });
});

describe('toUserSpace', () => {
  it('is the identity on an unrotated page', () => {
    expect(toUserSpace(10, 20, 600, 800, 0)).toEqual({ x: 10, y: 20 });
  });

  it('flips both axes at a half turn', () => {
    expect(toUserSpace(10, 20, 600, 800, 180)).toEqual({ x: 590, y: 780 });
  });

  it('maps the reader centre to the page centre for every turn', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const visual = rotation === 90 || rotation === 270 ? { w: 800, h: 600 } : { w: 600, h: 800 };
      expect(toUserSpace(visual.w / 2, visual.h / 2, 600, 800, rotation)).toEqual({ x: 300, y: 400 });
    }
  });
});

describe('unsupportedCharacters', () => {
  it('accepts the Latin text the built-in fonts cover', () => {
    expect(unsupportedCharacters('CONFIDENTIAL — Ángel & Co. ©2024 «draft»')).toEqual([]);
  });

  it('accepts the typographic extras WinAnsi adds on top of Latin-1', () => {
    expect(unsupportedCharacters('“smart” ‘quotes’ — dash… €99 ™')).toEqual([]);
  });

  it('reports each unusable character once', () => {
    expect(unsupportedCharacters('社外秘 社外秘')).toEqual(['社', '外', '秘']);
    expect(unsupportedCharacters('ok 🔒')).toEqual(['🔒']);
  });

  it('finds nothing in an empty string', () => {
    expect(unsupportedCharacters('')).toEqual([]);
  });
});

describe('describePdfError', () => {
  it('points an encrypted file at the decrypt tool', () => {
    expect(describePdfError(new Error('is encrypted'), 'a.pdf')).toContain('Decrypt PDF');
  });

  it('explains an encoding failure in terms of the text, not the library', () => {
    const message = describePdfError(new Error('WinAnsi cannot encode "社" (0x793e)'), 'a.pdf');
    expect(message).toContain('image watermark');
    expect(message).not.toContain('WinAnsi');
  });
});
