import { describe, expect, it } from 'vitest';
import { cssPointFromDrop } from './dropPoint';

describe('cssPointFromDrop', () => {
  it('keeps macOS points as they are, even on a Retina screen', () => {
    expect(cssPointFromDrop({ x: 280, y: 150 }, 2, true)).toEqual({ x: 280, y: 150 });
  });

  it('converts real device pixels elsewhere', () => {
    expect(cssPointFromDrop({ x: 560, y: 300 }, 2, false)).toEqual({ x: 280, y: 150 });
    expect(cssPointFromDrop({ x: 150, y: 90 }, 1.5, false)).toEqual({ x: 100, y: 60 });
  });

  it('never divides by zero', () => {
    expect(cssPointFromDrop({ x: 10, y: 20 }, 0, false)).toEqual({ x: 10, y: 20 });
  });
});
