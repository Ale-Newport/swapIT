import { describe, expect, it } from 'vitest';
import {
  centreOf,
  colorAt,
  cssDeclaration,
  cssGradient,
  linearEndpoints,
  radialRadii,
  sortedStops,
  svgGradient,
  type GradientSpec,
} from './logic';

const spec: GradientSpec = {
  type: 'linear',
  angle: 90,
  shape: 'circle',
  position: { x: 50, y: 50 },
  stops: [
    { id: 'a', color: '#ff0000', position: 0 },
    { id: 'b', color: '#0000ff', position: 100 },
  ],
};

describe('cssGradient', () => {
  it('writes a linear gradient with the angle and every stop', () => {
    expect(cssGradient(spec)).toBe('linear-gradient(90deg, #ff0000 0%, #0000ff 100%)');
    expect(cssDeclaration(spec)).toBe('background-image: linear-gradient(90deg, #ff0000 0%, #0000ff 100%);');
  });

  it('orders stops by position no matter how they were added', () => {
    const messy: GradientSpec = {
      ...spec,
      stops: [
        { id: 'c', color: '#00ff00', position: 70 },
        { id: 'a', color: '#ff0000', position: 0 },
        { id: 'b', color: '#0000ff', position: 100 },
      ],
    };
    expect(cssGradient(messy)).toBe('linear-gradient(90deg, #ff0000 0%, #00ff00 70%, #0000ff 100%)');
    expect(sortedStops(messy.stops).map((s) => s.id)).toEqual(['a', 'c', 'b']);
  });

  it('writes the radial shape and centre', () => {
    expect(cssGradient({ ...spec, type: 'radial', shape: 'ellipse', position: { x: 25, y: 75 } })).toBe(
      'radial-gradient(ellipse at 25% 75%, #ff0000 0%, #0000ff 100%)',
    );
  });

  it('writes conic with a from-angle', () => {
    expect(cssGradient({ ...spec, type: 'conic', angle: 45 })).toBe(
      'conic-gradient(from 45deg at 50% 50%, #ff0000 0%, #0000ff 100%)',
    );
  });
});

describe('linearEndpoints', () => {
  it('runs bottom to top at 0deg, the way CSS does', () => {
    const { x0, y0, x1, y1 } = linearEndpoints(0, 200, 100);
    expect(x0).toBeCloseTo(100, 6);
    expect(x1).toBeCloseTo(100, 6);
    expect(y0).toBeCloseTo(100, 6);
    expect(y1).toBeCloseTo(0, 6);
  });

  it('runs left to right at 90deg', () => {
    const { x0, y0, x1, y1 } = linearEndpoints(90, 200, 100);
    expect(x0).toBeCloseTo(0, 6);
    expect(x1).toBeCloseTo(200, 6);
    expect(y0).toBeCloseTo(50, 6);
    expect(y1).toBeCloseTo(50, 6);
  });

  it('spans the diagonal length at 45deg', () => {
    const { x0, y0, x1, y1 } = linearEndpoints(45, 100, 100);
    expect(Math.hypot(x1 - x0, y1 - y0)).toBeCloseTo(100 * Math.SQRT2, 6);
    expect(x0).toBeLessThan(x1);
    expect(y0).toBeGreaterThan(y1);
  });

  it('is symmetric half a turn later', () => {
    const a = linearEndpoints(30, 300, 200);
    const b = linearEndpoints(210, 300, 200);
    expect(a.x0).toBeCloseTo(b.x1, 6);
    expect(a.y0).toBeCloseTo(b.y1, 6);
  });
});

describe('radialRadii', () => {
  it('reaches the farthest corner for a circle', () => {
    const { rx, ry } = radialRadii('circle', 0, 0, 300, 400);
    expect(rx).toBeCloseTo(500, 6);
    expect(rx).toBe(ry);
  });

  it('keeps the farthest-side ratio for an ellipse', () => {
    const { rx, ry } = radialRadii('ellipse', 50, 50, 100, 200);
    expect(rx).toBeCloseTo(50 * Math.SQRT2, 6);
    expect(ry).toBeCloseTo(150 * Math.SQRT2, 6);
  });

  it('never collapses to a zero radius', () => {
    const { rx, ry } = radialRadii('ellipse', 0, 0, 0, 0);
    expect(rx).toBeGreaterThan(0);
    expect(ry).toBeGreaterThan(0);
  });

  it('places the centre from the percentage position', () => {
    expect(centreOf({ ...spec, position: { x: 25, y: 80 } }, 400, 200)).toEqual({ cx: 100, cy: 160 });
  });
});

describe('colorAt', () => {
  it('returns the endpoints outside the range', () => {
    expect(colorAt(spec.stops, -20)).toBe('#ff0000');
    expect(colorAt(spec.stops, 140)).toBe('#0000ff');
  });

  it('interpolates between two stops', () => {
    expect(colorAt(spec.stops, 50)).toBe('#800080');
  });

  it('handles two stops at the same position without dividing by zero', () => {
    const hard = [
      { id: 'a', color: '#ffffff', position: 50 },
      { id: 'b', color: '#000000', position: 50 },
    ];
    expect(colorAt(hard, 50)).toBe('#ffffff');
    expect(colorAt(hard, 60)).toBe('#000000');
  });

  it('falls back to black for a colour it cannot parse', () => {
    expect(colorAt([{ id: 'a', color: 'chartreuse', position: 0 }, { id: 'b', color: '#ffffff', position: 100 }], 50)).toBe(
      '#808080',
    );
  });
});

describe('svgGradient', () => {
  it('emits a linearGradient in user space with matching endpoints', () => {
    const svg = svgGradient(spec, 200, 100);
    expect(svg).toContain('<linearGradient id="g" gradientUnits="userSpaceOnUse"');
    expect(svg).toContain('x1="0.00" y1="50.00" x2="200.00" y2="50.00"');
    expect(svg).toContain('<stop offset="0.0000" stop-color="#ff0000" />');
    expect(svg).toContain('<stop offset="1.0000" stop-color="#0000ff" />');
    expect(svg).toContain('fill="url(#g)"');
  });

  it('squashes a radial gradient with a transform only when it is an ellipse', () => {
    const circle = svgGradient({ ...spec, type: 'radial', shape: 'circle' }, 200, 100);
    expect(circle).not.toContain('gradientTransform');
    const ellipse = svgGradient({ ...spec, type: 'radial', shape: 'ellipse' }, 200, 100);
    expect(ellipse).toContain('gradientTransform="translate(100.00 50.00) scale(1 0.5000)');
  });

  it('approximates a conic gradient with wedge paths, since SVG has none', () => {
    const svg = svgGradient({ ...spec, type: 'conic' }, 200, 200);
    expect(svg.match(/<path /g)).toHaveLength(360);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"');
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });
});
