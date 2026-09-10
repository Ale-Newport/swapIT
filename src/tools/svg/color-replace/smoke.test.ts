import { describe, it, expect } from 'vitest';
import { extractColors, replaceColors } from './logic';
import { applyDimensions, readDimensions } from '../dimensions/logic';
import { applyViewBox, readViewBox, stripSize } from '../viewbox/logic';
import { applyBackground } from '../background/logic';

const REAL = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="240px" height="120px" viewBox="0 0 240 120" version="1.1">
  <title>Logo</title>
  <style type="text/css">
    .accent { fill: #F60; stroke: rgb(0, 0, 0); stroke-width: 2 }
    text { fill: DarkSlateGray }
  </style>
  <defs>
    <linearGradient id="g"><stop offset="0" stop-color="#f60"/><stop offset="1" stop-color="rgba(255,102,0,0.5)"/></linearGradient>
  </defs>
  <rect class="accent" x="0" y="0" width="240" height="120" fill="url(#g)"/>
  <circle cx="60" cy="60" r="40" fill="#F60" stroke="none" style="stroke: #ffffff"/>
  <text x="120" y="64" data-fill="ignored">Toolbox</text>
</svg>`;

describe('a realistic file survives every SVG tool', () => {
  it('finds the colours a designer would recognise', () => {
    const colors = extractColors(REAL);
    const orange = colors.find((c) => c.normalized === '#ff6600');
    // `.accent { fill: #F60 }`, `stop-color="#f60"` and `fill="#F60"`.
    expect(orange?.count).toBe(3);
    expect(orange?.notations.sort()).toEqual(['#F60', '#f60']);
    const names = colors.map((c) => c.normalized);
    expect(names).toContain('#2f4f4f'); // DarkSlateGray, in a <style> rule
    expect(names).toContain('#ff660080'); // the translucent gradient stop
    expect(names).toContain('#000000'); // rgb(0, 0, 0)
    expect(names).toContain('#ffffff'); // inside a style attribute
  });

  it('recolours without disturbing anything else', () => {
    const { svg, changed } = replaceColors(REAL, { '#ff6600': '#0088cc' });
    expect(changed).toBe(3);
    expect(svg).toContain('<title>Logo</title>');
    expect(svg).toContain('fill="url(#g)"');
    expect(svg).toContain('data-fill="ignored"');
    expect(svg).not.toMatch(/#F60/i);
    expect(readDimensions(svg)?.width).toEqual({ value: 240, unit: 'px' });
  });

  it('resizes, then clears the size, without losing the viewBox', () => {
    const resized = applyDimensions(REAL, { width: { value: 480, unit: 'px' }, height: { value: 240, unit: 'px' } });
    expect(resized).toContain('width="480px" height="240px"');
    const fluid = applyDimensions(resized, null);
    expect(fluid).not.toContain('width="480px"');
    expect(readViewBox(fluid)?.declared).toEqual({ minX: 0, minY: 0, width: 240, height: 120 });
    expect(fluid).toContain('<circle cx="60" cy="60" r="40"');
  });

  it('crops the frame and strips the size for a preview', () => {
    const cropped = applyViewBox(REAL, { minX: 20, minY: 20, width: 80, height: 80 });
    expect(cropped).toContain('viewBox="20 20 80 80"');
    expect(cropped).toContain('width="240px"');
    expect(stripSize(cropped)).not.toContain('width="240px"');
  });

  it('adds a background as the very first child, behind the defs', () => {
    const out = applyBackground(REAL, {
      kind: 'gradient',
      color: '#fff',
      from: '#000000',
      to: '#ffffff',
      angle: 45,
      radius: 12,
    }) as string;
    const bg = out.indexOf('data-toolbox-bg');
    expect(bg).toBeGreaterThan(-1);
    expect(bg).toBeLessThan(out.indexOf('<title>'));
    expect(out).toContain('x="0" y="0" width="240" height="120" rx="12"');
    // The document's own gradient is untouched.
    expect(out).toContain('<linearGradient id="g">');
  });

  it('chains all four tools together', () => {
    let svg = replaceColors(REAL, { '#ff6600': '#112233' }).svg;
    svg = applyViewBox(svg, { minX: 0, minY: 0, width: 240, height: 240 });
    svg = applyDimensions(svg, { width: { value: 96, unit: '' }, height: { value: 96, unit: '' } });
    svg = applyBackground(svg, { kind: 'solid', color: '#eeeeee', from: '#000', to: '#fff', angle: 0, radius: 0 }) as string;
    expect(svg).toContain('viewBox="0 0 240 240"');
    expect(svg).toContain('width="96" height="96"');
    expect(svg).toContain('width="240" height="240" fill="#eeeeee"');
    expect(svg).toContain('<text x="120" y="64"');
    expect(svg.match(/<svg /g)).toHaveLength(1);
  });
});
