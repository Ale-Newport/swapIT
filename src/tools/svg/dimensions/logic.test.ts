import { describe, it, expect } from 'vitest';
import {
  applyDimensions,
  aspectRatio,
  findRootTag,
  formatLength,
  getAttribute,
  lockedCounterpart,
  parseLength,
  parseViewBox,
  readDimensions,
  setAttribute,
} from './logic';

const DOC = `<?xml version="1.0" encoding="UTF-8"?>
<!-- a comment mentioning <svg> -->
<svg xmlns="http://www.w3.org/2000/svg" width="120px" height="60px" viewBox="0 0 24 12">
  <rect width="24" height="12" fill="red"/>
</svg>`;

describe('findRootTag', () => {
  it('skips the declaration and comments', () => {
    const root = findRootTag(DOC);
    expect(root?.text.startsWith('<svg xmlns=')).toBe(true);
    expect(root?.selfClosing).toBe(false);
  });

  it('is not fooled by a > inside an attribute value', () => {
    const root = findRootTag('<svg data-note="a > b" width="10"><g/></svg>');
    expect(root?.text).toBe('<svg data-note="a > b" width="10">');
  });

  it('handles a self-closing root', () => {
    expect(findRootTag('<svg width="1"/>')?.selfClosing).toBe(true);
  });

  it('returns null when there is no svg element', () => {
    expect(findRootTag('<html><body>hi</body></html>')).toBeNull();
  });
});

describe('setAttribute', () => {
  const tag = '<svg xmlns="http://www.w3.org/2000/svg" width="120px" height="60px">';

  it('replaces an existing value in place', () => {
    expect(setAttribute(tag, 'width', '300')).toContain('width="300"');
    expect(setAttribute(tag, 'width', '300')).toContain('height="60px"');
  });

  it('appends an attribute that is not there yet', () => {
    expect(setAttribute('<svg>', 'viewBox', '0 0 10 10')).toBe('<svg viewBox="0 0 10 10">');
  });

  it('appends before the slash of a self-closing tag', () => {
    expect(setAttribute('<svg width="1"/>', 'height', '2')).toBe('<svg width="1" height="2"/>');
  });

  it('removes an attribute when the value is null', () => {
    expect(setAttribute(tag, 'height', null)).toBe('<svg xmlns="http://www.w3.org/2000/svg" width="120px">');
  });

  it('finds an attribute whatever its case, and keeps the rest of the tag', () => {
    expect(getAttribute('<svg viewbox="0 0 5 5">', 'viewBox')).toBe('0 0 5 5');
  });
});

describe('parseLength', () => {
  it('splits the number from the unit', () => {
    expect(parseLength('120')).toEqual({ value: 120, unit: '' });
    expect(parseLength(' 120.5px ')).toEqual({ value: 120.5, unit: 'px' });
    expect(parseLength('50%')).toEqual({ value: 50, unit: '%' });
  });

  it('rejects values SVG allows but this tool cannot edit numerically', () => {
    expect(parseLength('auto')).toBeNull();
    expect(parseLength('calc(100% - 4px)')).toBeNull();
    expect(parseLength('10 20')).toBeNull();
    expect(parseLength(null)).toBeNull();
  });
});

describe('parseViewBox', () => {
  it('accepts space and comma separators and negative origins', () => {
    expect(parseViewBox('-5 -5 10 20')).toEqual({ minX: -5, minY: -5, width: 10, height: 20 });
    expect(parseViewBox('0,0,10,10')?.width).toBe(10);
  });

  it('rejects a viewBox with no area', () => {
    expect(parseViewBox('0 0 0 10')).toBeNull();
    expect(parseViewBox('0 0 10')).toBeNull();
  });
});

describe('readDimensions and aspectRatio', () => {
  it('reads width, height and viewBox off the root', () => {
    const d = readDimensions(DOC);
    expect(d?.width).toEqual({ value: 120, unit: 'px' });
    expect(d?.viewBox).toEqual({ minX: 0, minY: 0, width: 24, height: 12 });
  });

  it('prefers the viewBox ratio, because that is what governs the drawing', () => {
    expect(aspectRatio(readDimensions(DOC))).toBe(2);
  });

  it('falls back to the declared size when there is no viewBox', () => {
    const d = readDimensions('<svg width="200" height="50"></svg>');
    expect(aspectRatio(d)).toBe(4);
  });

  it('has no ratio when the two dimensions use different units', () => {
    expect(aspectRatio(readDimensions('<svg width="100%" height="50px"></svg>'))).toBeNull();
  });
});

describe('applyDimensions', () => {
  it('writes the new size and leaves the body untouched', () => {
    const out = applyDimensions(DOC, { width: { value: 480, unit: 'px' }, height: { value: 240, unit: 'px' } });
    expect(out).toContain('width="480px" height="240px"');
    expect(out).toContain('<rect width="24" height="12" fill="red"/>');
    expect(out.startsWith('<?xml version="1.0"')).toBe(true);
  });

  it('only touches the root — the rect keeps its own width', () => {
    const out = applyDimensions(DOC, { width: { value: 1, unit: '' }, height: { value: 2, unit: '' } });
    expect(out).toContain('<rect width="24" height="12"');
  });

  it('strips both attributes so the SVG scales to its container', () => {
    const out = applyDimensions(DOC, null);
    expect(out).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 12">');
  });

  it('trims trailing zeros', () => {
    expect(formatLength({ value: 12.5000001, unit: 'px' })).toBe('12.5px');
    expect(formatLength({ value: 100, unit: '' })).toBe('100');
  });
});

describe('lockedCounterpart', () => {
  it('keeps the aspect ratio when either side is edited', () => {
    expect(lockedCounterpart(480, 2, 'width')).toBe(240);
    expect(lockedCounterpart(240, 2, 'height')).toBe(480);
  });

  it('leaves the value alone for a nonsense ratio', () => {
    expect(lockedCounterpart(480, 0, 'width')).toBe(480);
    expect(lockedCounterpart(480, Number.NaN, 'width')).toBe(480);
  });
});
