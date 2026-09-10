import { describe, it, expect } from 'vitest';
import {
  alphaOf,
  extractColors,
  findColorOccurrences,
  formatColor,
  normalizeColor,
  readableInk,
  replaceColors,
  replacementText,
} from './logic';

describe('normalizeColor', () => {
  it('expands short hex', () => {
    expect(normalizeColor('#abc')).toBe('#aabbcc');
    expect(normalizeColor('#FFF')).toBe('#ffffff');
  });

  it('keeps the alpha channel of four- and eight-digit hex', () => {
    expect(normalizeColor('#abc8')).toBe('#aabbcc88');
    expect(normalizeColor('#11223344')).toBe('#11223344');
  });

  it('drops a fully opaque alpha so two spellings of one colour match', () => {
    expect(normalizeColor('#112233ff')).toBe('#112233');
    expect(normalizeColor('rgba(17,34,51,1)')).toBe('#112233');
  });

  it('parses rgb() in comma, space and percentage notation', () => {
    expect(normalizeColor('rgb(255,0,0)')).toBe('#ff0000');
    expect(normalizeColor('rgb(255 0 0)')).toBe('#ff0000');
    expect(normalizeColor('rgb(100%, 0%, 0%)')).toBe('#ff0000');
    expect(normalizeColor('rgba(0 0 0 / 50%)')).toBe('#00000080');
  });

  it('clamps out-of-range channels rather than failing', () => {
    expect(normalizeColor('rgb(300, -20, 0)')).toBe('#ff0000');
  });

  it('resolves CSS colour keywords, case-insensitively', () => {
    expect(normalizeColor('RebeccaPurple')).toBe('#663399');
    expect(normalizeColor('  Tomato ')).toBe('#ff6347');
  });

  it('returns null for paint that is not a colour', () => {
    expect(normalizeColor('none')).toBeNull();
    expect(normalizeColor('url(#grad)')).toBeNull();
    expect(normalizeColor('currentColor')).toBeNull();
    expect(normalizeColor('var(--brand)')).toBeNull();
    expect(normalizeColor('#12345')).toBeNull();
    expect(normalizeColor('#gggggg')).toBeNull();
  });
});

describe('findColorOccurrences', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
  <style>.brand { fill: #F00; stroke: rgb(0,0,255) }</style>
  <rect fill="#ff0000" stroke-width="2" data-fill="black" />
  <circle style="fill: red; stroke: none" />
  <stop stop-color="Blue" offset="0" />
  <text fill="#000">colour: red</text>
</svg>`;

  it('finds colours in attributes, style attributes and style blocks', () => {
    const found = findColorOccurrences(svg);
    const reds = found.filter((f) => f.normalized === '#ff0000');
    expect(reds).toHaveLength(3);
    expect(found.some((f) => f.normalized === '#0000ff' && f.raw === 'rgb(0,0,255)')).toBe(true);
    expect(found.some((f) => f.raw === 'Blue')).toBe(true);
  });

  it('reports the exact source span of each literal', () => {
    for (const occurrence of findColorOccurrences(svg)) {
      expect(svg.slice(occurrence.start, occurrence.end)).toBe(occurrence.raw);
    }
  });

  it('ignores stroke-width, data-fill and prose that merely says "color:"', () => {
    const found = findColorOccurrences(svg);
    expect(found.some((f) => f.raw === 'black')).toBe(false);
    expect(found.filter((f) => f.normalized === '#ff0000' && f.where === 'style')).toHaveLength(2);
  });
});

describe('extractColors', () => {
  it('groups every notation of one colour and counts the occurrences', () => {
    const svg = '<svg><rect fill="#F00"/><rect fill="red"/><rect fill="rgb(255, 0, 0)"/><rect fill="#00f"/></svg>';
    const colors = extractColors(svg);
    expect(colors).toHaveLength(2);
    expect(colors[0]).toEqual({
      normalized: '#ff0000',
      count: 3,
      notations: ['#F00', 'red', 'rgb(255, 0, 0)'],
    });
    expect(colors[1].normalized).toBe('#0000ff');
  });

  it('returns nothing for an SVG that only uses gradients and none', () => {
    expect(extractColors('<svg><rect fill="url(#g)" stroke="none"/></svg>')).toEqual([]);
  });
});

describe('replaceColors', () => {
  it('rewrites every notation of the replaced colour and leaves the rest alone', () => {
    const svg = '<svg><rect fill="#F00"/><circle style="stroke: red"/><rect fill="#00f"/></svg>';
    const { svg: out, changed } = replaceColors(svg, { '#ff0000': '#00ff00' });
    expect(changed).toBe(2);
    expect(out).toBe('<svg><rect fill="#00ff00"/><circle style="stroke: #00ff00"/><rect fill="#00f"/></svg>');
  });

  it('applies several replacements in one pass without re-replacing', () => {
    const svg = '<svg><rect fill="#ff0000"/><rect fill="#00ff00"/></svg>';
    const { svg: out } = replaceColors(svg, { '#ff0000': '#00ff00', '#00ff00': '#ff0000' });
    expect(out).toBe('<svg><rect fill="#00ff00"/><rect fill="#ff0000"/></svg>');
  });

  it('keeps the original transparency when the new colour has none', () => {
    const svg = '<svg><rect fill="rgba(0,0,0,0.25)"/></svg>';
    const { svg: out } = replaceColors(svg, { '#00000040': '#ff0000' });
    expect(out).toBe('<svg><rect fill="rgba(255, 0, 0, 0.251)"/></svg>');
  });

  it('is a no-op when the target equals the source colour', () => {
    const svg = '<svg><rect fill="#ff0000"/></svg>';
    expect(replaceColors(svg, { '#ff0000': 'red' })).toEqual({ svg, changed: 0 });
  });

  it('ignores unparseable targets instead of writing rubbish into the file', () => {
    const svg = '<svg><rect fill="#ff0000"/></svg>';
    expect(replaceColors(svg, { '#ff0000': 'not a colour' }).changed).toBe(0);
  });
});

describe('formatting helpers', () => {
  it('writes opaque colours as hex and translucent ones as rgba', () => {
    expect(formatColor('#aabbcc')).toBe('#aabbcc');
    expect(formatColor('#aabbcc80')).toBe('rgba(170, 187, 204, 0.502)');
  });

  it('reads the alpha channel back', () => {
    expect(alphaOf('#aabbcc')).toBe(1);
    expect(alphaOf('#aabbcc00')).toBe(0);
  });

  it('replacementText refuses a target it cannot parse', () => {
    expect(replacementText('nope', '#000000')).toBeNull();
    expect(replacementText('lime', '#000000')).toBe('#00ff00');
  });

  it('picks readable ink for a swatch label', () => {
    expect(readableInk('#ffffff')).toBe('#000000');
    expect(readableInk('#000000')).toBe('#ffffff');
    expect(readableInk('#1e90ff')).toBe('#ffffff');
  });
});
