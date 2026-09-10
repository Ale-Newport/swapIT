import { describe, it, expect } from 'vitest';
import {
  applyBackground,
  coverageOf,
  gradientVector,
  hasToolboxBackground,
  removeBackground,
  type BackgroundOptions,
} from './logic';

const SOLID: BackgroundOptions = { kind: 'solid', color: '#ffffff', from: '#fff', to: '#000', angle: 0, radius: 0 };
const GRADIENT: BackgroundOptions = { ...SOLID, kind: 'gradient', from: '#ff0000', to: '#0000ff', angle: 90 };

const DOC = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <path d="M0 0h24v24H0z"/>
</svg>`;

describe('coverageOf', () => {
  it('prefers the viewBox, including a shifted origin', () => {
    expect(coverageOf('<svg viewBox="-5 -5 10 20"></svg>')).toEqual({
      box: { x: -5, y: -5, width: 10, height: 20 },
      fluid: false,
    });
  });

  it('falls back to the declared size', () => {
    expect(coverageOf('<svg width="40" height="20"></svg>')?.box).toEqual({ x: 0, y: 0, width: 40, height: 20 });
  });

  it('goes fluid when neither is usable', () => {
    expect(coverageOf('<svg width="100%" height="100%"></svg>')).toEqual({ box: null, fluid: true });
  });
});

describe('gradientVector', () => {
  it('runs left to right at 0°', () => {
    expect(gradientVector(0)).toEqual({ x1: 0, y1: 0.5, x2: 1, y2: 0.5 });
  });

  it('runs top to bottom at 90°', () => {
    expect(gradientVector(90)).toEqual({ x1: 0.5, y1: 0, x2: 0.5, y2: 1 });
  });

  it('spans corner to corner on the diagonal', () => {
    expect(gradientVector(45)).toEqual({ x1: 0, y1: 0, x2: 1, y2: 1 });
    expect(gradientVector(135)).toEqual({ x1: 1, y1: 0, x2: 0, y2: 1 });
  });

  it('reverses at 180°', () => {
    expect(gradientVector(180)).toEqual({ x1: 1, y1: 0.5, x2: 0, y2: 0.5 });
  });

  it('is long enough that every corner of the box falls between the two stops', () => {
    const corners = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ];
    for (let angle = 0; angle < 360; angle += 7) {
      const v = gradientVector(angle);
      const dx = v.x2 - v.x1;
      const dy = v.y2 - v.y1;
      const lengthSq = dx * dx + dy * dy;
      for (const [cx, cy] of corners) {
        const t = ((cx - v.x1) * dx + (cy - v.y1) * dy) / lengthSq;
        expect(t).toBeGreaterThanOrEqual(-0.001);
        expect(t).toBeLessThanOrEqual(1.001);
      }
    }
  });
});

describe('applyBackground', () => {
  it('inserts a solid rect covering the viewBox as the first child', () => {
    const out = applyBackground(DOC, SOLID);
    expect(out).toContain('<rect data-toolbox-bg="1" x="0" y="0" width="24" height="24" fill="#ffffff"/>');
    const rectAt = out?.indexOf('<rect data-toolbox-bg') ?? -1;
    const pathAt = out?.indexOf('<path') ?? -1;
    expect(rectAt).toBeGreaterThan(-1);
    expect(rectAt).toBeLessThan(pathAt);
  });

  it('writes a gradient into defs and points the rect at it', () => {
    const out = applyBackground(DOC, GRADIENT) ?? '';
    expect(out).toContain('<linearGradient id="toolbox-background" x1="0.5" y1="0" x2="0.5" y2="1">');
    expect(out).toContain('<stop offset="0" stop-color="#ff0000"/>');
    expect(out).toContain('fill="url(#toolbox-background)"');
  });

  it('adds a corner radius only when one was asked for', () => {
    expect(applyBackground(DOC, SOLID)).not.toContain('rx=');
    expect(applyBackground(DOC, { ...SOLID, radius: 4 })).toContain('rx="4"');
  });

  it('replaces its own background instead of stacking a second one', () => {
    const once = applyBackground(DOC, SOLID) ?? '';
    const twice = applyBackground(once, GRADIENT) ?? '';
    expect(twice.match(/data-toolbox-bg="1"/g)).toHaveLength(2); // the defs and the rect
    expect(twice).not.toContain('fill="#ffffff"');
    expect(twice).toContain('<path d="M0 0h24v24H0z"/>');
  });

  it('leaves the file exactly as it was when the background is removed again', () => {
    const once = applyBackground(DOC, GRADIENT) ?? '';
    expect(hasToolboxBackground(once)).toBe(true);
    expect(removeBackground(once)).toBe(DOC);
  });

  it('gives a self-closing root a body to hold the rectangle', () => {
    const out = applyBackground('<svg viewBox="0 0 10 10"/>', SOLID) ?? '';
    expect(out).toContain('<svg viewBox="0 0 10 10">');
    expect(out.trimEnd().endsWith('</svg>')).toBe(true);
    expect(out).toContain('width="10" height="10"');
  });

  it('covers the whole viewport when the size is unknown', () => {
    const out = applyBackground('<svg width="100%" height="100%"><g/></svg>', SOLID) ?? '';
    expect(out).toContain('x="0" y="0" width="100%" height="100%"');
  });

  it('returns null for a file with no svg element', () => {
    expect(applyBackground('# just markdown', SOLID)).toBeNull();
  });
});
