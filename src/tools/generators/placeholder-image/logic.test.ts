import { describe, expect, it } from 'vitest';
import {
  MAX_SIDE,
  autoFontSize,
  clampSide,
  crossLines,
  defaultLabel,
  gridLines,
  strokeWidthFor,
  suggestedFilename,
  type PlaceholderSpec,
} from './logic';

const spec: PlaceholderSpec = {
  width: 1200,
  height: 630,
  background: '#e6e8ec',
  foreground: '#5b6472',
  label: '',
  fontSize: 0,
  overlay: 'none',
  gridSize: 80,
};

describe('clampSide', () => {
  it('keeps sides inside what a canvas can hold', () => {
    expect(clampSide(0)).toBe(1);
    expect(clampSide(-40)).toBe(1);
    expect(clampSide(1200.6)).toBe(1201);
    expect(clampSide(MAX_SIDE * 4)).toBe(MAX_SIDE);
    expect(clampSide(Number.NaN)).toBe(1);
  });
});

describe('defaultLabel', () => {
  it('uses the multiplication sign, not a letter x', () => {
    expect(defaultLabel(1200, 630)).toBe('1200 × 630');
    expect(defaultLabel(1200, 630)).not.toContain('x');
  });
});

describe('autoFontSize', () => {
  it('scales with the shorter side and never disappears', () => {
    expect(autoFontSize(1200, 630)).toBe(90);
    expect(autoFontSize(630, 1200)).toBe(90);
    expect(autoFontSize(40, 40)).toBe(11);
  });
});

describe('overlays', () => {
  it('draws both diagonals for a cross', () => {
    expect(crossLines(100, 50)).toEqual([
      { x1: 0, y1: 0, x2: 100, y2: 50 },
      { x1: 100, y1: 0, x2: 0, y2: 50 },
    ]);
  });

  it('lays a grid that includes both outer edges', () => {
    const lines = gridLines(100, 50, 25);
    const vertical = lines.filter((l) => l.x1 === l.x2);
    const horizontal = lines.filter((l) => l.y1 === l.y2);
    expect(vertical.map((l) => l.x1)).toEqual([0, 25, 50, 75, 100]);
    expect(horizontal.map((l) => l.y1)).toEqual([0, 25, 50]);
    for (const line of horizontal) expect(line.x2).toBe(100);
  });

  it('refuses a grid step so small it would paint solid', () => {
    const lines = gridLines(100, 100, 0);
    expect(lines.length).toBeLessThan(100);
  });

  it('thickens the stroke on larger images', () => {
    expect(strokeWidthFor(400, 400)).toBe(1);
    expect(strokeWidthFor(1600, 1600)).toBe(4);
  });
});

describe('suggestedFilename', () => {
  it('names the file after the size', () => {
    expect(suggestedFilename(spec)).toBe('placeholder-1200x630.png');
  });
});
