// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { analyzeSvg, aspectRatioLabel, parseLength, parseViewBox } from './logic';

describe('parseLength', () => {
  it('reads a bare number as pixels', () => {
    expect(parseLength('120')).toEqual({ value: 120, unit: '', px: 120 });
  });

  it('converts physical units to CSS pixels', () => {
    expect(parseLength('1in')?.px).toBe(96);
    expect(parseLength('72pt')?.px).toBeCloseTo(96, 6);
    expect(parseLength('25.4mm')?.px).toBeCloseTo(96, 6);
  });

  it('keeps context-dependent units but reports no pixel size', () => {
    expect(parseLength('100%')).toEqual({ value: 100, unit: '%', px: null });
    expect(parseLength('2em')?.px).toBeNull();
  });

  it('tolerates whitespace, decimals and signs', () => {
    expect(parseLength('  .5in ')?.px).toBeCloseTo(48, 6);
    expect(parseLength('-10px')?.px).toBe(-10);
  });

  it('rejects anything that is not a length', () => {
    expect(parseLength(null)).toBeNull();
    expect(parseLength('')).toBeNull();
    expect(parseLength('auto')).toBeNull();
    expect(parseLength('10 20')).toBeNull();
  });
});

describe('parseViewBox', () => {
  it('accepts space and comma separated forms', () => {
    expect(parseViewBox('0 0 24 24')).toEqual({ minX: 0, minY: 0, width: 24, height: 24 });
    expect(parseViewBox('-5,-5, 10 , 20')).toEqual({ minX: -5, minY: -5, width: 10, height: 20 });
  });

  it('rejects a viewBox that cannot describe an area', () => {
    expect(parseViewBox('0 0 0 24')).toBeNull();
    expect(parseViewBox('0 0 -10 24')).toBeNull();
    expect(parseViewBox('0 0 24')).toBeNull();
    expect(parseViewBox('a b c d')).toBeNull();
    expect(parseViewBox(null)).toBeNull();
  });
});

describe('aspectRatioLabel', () => {
  it('reduces whole numbers to their simplest ratio', () => {
    expect(aspectRatioLabel(1920, 1080)).toBe('16:9');
    expect(aspectRatioLabel(512, 512)).toBe('1:1');
    expect(aspectRatioLabel(800, 600)).toBe('4:3');
  });

  it('falls back to a decimal when the reduction stays unwieldy', () => {
    expect(aspectRatioLabel(1123, 794)).toBe('1.41:1');
    expect(aspectRatioLabel(794, 1123)).toBe('1:1.41');
  });

  it('has nothing to report without both dimensions', () => {
    expect(aspectRatioLabel(null, 100)).toBeNull();
    expect(aspectRatioLabel(100, 0)).toBeNull();
  });
});

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="1in" height="0.5in" viewBox="0 0 96 48">
  <title>Badge</title>
  <style>.a { fill: url(https://cdn.example.com/p.svg#g) }</style>
  <defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs>
  <rect id="bg" width="96" height="48" style="fill:#eee"/>
  <rect width="10" height="10"/>
  <image width="8" height="8" xlink:href="data:image/png;base64,AAAA"/>
  <image width="8" height="8" href="https://example.com/logo.png"/>
  <text x="4" y="20" onclick="alert(1)">hi</text>
  <script>console.log('hello')</script>
</svg>`;

describe('analyzeSvg', () => {
  const report = analyzeSvg(SAMPLE);

  it('resolves the drawn size from the width and height units', () => {
    expect(report.widthPx).toBe(96);
    expect(report.heightPx).toBe(48);
    expect(report.renderWidth).toBe(96);
    expect(report.aspect).toBe('2:1');
  });

  it('falls back to the viewBox when there is no width or height', () => {
    const r = analyzeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect/></svg>');
    expect(r.renderWidth).toBe(24);
    expect(r.renderHeight).toBe(24);
    expect(r.widthAttr).toBeNull();
  });

  it('counts elements by tag name, most common first', () => {
    const rect = report.elements.find((e) => e.tag === 'rect');
    expect(rect?.count).toBe(2);
    expect(report.elements[0].count).toBeGreaterThanOrEqual(report.elements[1].count);
    // svg, title, style, defs, linearGradient, stop, 2 rects, 2 images, text, script
    expect(report.elementTotal).toBe(12);
  });

  it('flags scripts and inline event handlers', () => {
    expect(report.scripts).toBe(1);
    expect(report.eventHandlers).toBe(1);
  });

  it('separates embedded rasters from linked ones', () => {
    expect(report.embeddedImages).toBe(1);
    expect(report.linkedImages).toBe(1);
  });

  it('collects external references from attributes and from <style>', () => {
    expect(report.externalRefs).toContain('https://example.com/logo.png');
    expect(report.externalRefs).toContain('https://cdn.example.com/p.svg#g');
  });

  it('reports inline styling in both forms', () => {
    expect(report.styleElements).toBe(1);
    expect(report.styleAttributes).toBe(1);
    expect(report.ids).toBe(2);
    expect(report.title).toBe('Badge');
  });

  it('explains a file that is not XML instead of throwing', () => {
    const r = analyzeSvg('<svg><rect></svg>');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not valid XML/);
  });

  it('explains a file whose root is not an svg', () => {
    const r = analyzeSvg('<html xmlns="http://www.w3.org/1999/xhtml"><body/></html>');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no <svg> root/);
  });

  it('explains an empty file', () => {
    expect(analyzeSvg('   ').error).toBe('This file is empty.');
  });
});
