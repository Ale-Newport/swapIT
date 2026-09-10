import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ICON,
  GLYPHS,
  buildIconSvg,
  escapeXml,
  firstGrapheme,
  gradientVector,
  graphemes,
  hexagonPoints,
  iconFileName,
  initialsFontSize,
  innerSize,
  normalizeInitials,
} from './logic';

describe('hexagonPoints', () => {
  it('returns six points with a vertex straight up', () => {
    const points = hexagonPoints(50, 50, 50).split(' ');
    expect(points).toHaveLength(6);
    expect(points[0]).toBe('50,0');
  });

  it('keeps every point on the circle', () => {
    for (const point of hexagonPoints(50, 50, 40).split(' ')) {
      const [x, y] = point.split(',').map(Number);
      expect(Math.hypot(x - 50, y - 50)).toBeCloseTo(40, 1);
    }
  });
});

describe('graphemes', () => {
  it('counts an emoji as one character', () => {
    expect(graphemes('🎉').length).toBe(1);
    expect(firstGrapheme(' 🎉 extra')).toBe('🎉');
  });

  it('trims initials to three upper-case characters', () => {
    expect(normalizeInitials('ada l')).toBe('ADAL'.slice(0, 3));
    expect(normalizeInitials('  jo ')).toBe('JO');
    expect(normalizeInitials('')).toBe('');
  });
});

describe('initialsFontSize', () => {
  it('shrinks as more characters have to fit', () => {
    const inner = innerSize(20);
    const one = initialsFontSize('A', inner);
    const two = initialsFontSize('AB', inner);
    const three = initialsFontSize('ABC', inner);
    expect(one).toBeGreaterThan(two);
    expect(two).toBeGreaterThan(three);
  });

  it('keeps three characters inside the inner square at a rough 0.6 advance per character', () => {
    const inner = innerSize(22);
    expect(initialsFontSize('ABC', inner) * 3 * 0.62).toBeLessThanOrEqual(inner);
  });

  it('follows the scale multiplier', () => {
    expect(initialsFontSize('A', 100, 2)).toBeCloseTo(initialsFontSize('A', 100) * 2, 5);
  });

  it('never divides by zero on empty text', () => {
    expect(initialsFontSize('', 60)).toBeGreaterThan(0);
  });
});

describe('gradientVector', () => {
  it('matches the CSS convention used everywhere else in the app', () => {
    expect(gradientVector(0)).toEqual({ x1: 0, y1: 0.5, x2: 1, y2: 0.5 });
    expect(gradientVector(90)).toEqual({ x1: 0.5, y1: 0, x2: 0.5, y2: 1 });
  });
});

describe('buildIconSvg', () => {
  it('exports at the requested pixel size but draws on the 100 grid', () => {
    const svg = buildIconSvg({ ...DEFAULT_ICON, size: 256 });
    expect(svg).toContain('width="256" height="256" viewBox="0 0 100 100"');
  });

  it('writes a gradient when one is asked for, and nothing extra when it is not', () => {
    expect(buildIconSvg(DEFAULT_ICON)).toContain('<linearGradient id="icon-fill"');
    const solid = buildIconSvg({ ...DEFAULT_ICON, fillKind: 'solid', color: '#123456' });
    expect(solid).not.toContain('linearGradient');
    expect(solid).toContain('fill="#123456"');
  });

  it('draws each shape', () => {
    expect(buildIconSvg({ ...DEFAULT_ICON, shape: 'circle' })).toContain('<circle cx="50" cy="50" r="50"');
    expect(buildIconSvg({ ...DEFAULT_ICON, shape: 'hexagon' })).toContain('<polygon points="50,0');
    expect(buildIconSvg({ ...DEFAULT_ICON, shape: 'shield' })).toContain('<path d="M50 3');
    expect(buildIconSvg({ ...DEFAULT_ICON, shape: 'rounded', radius: 30 })).toContain('rx="30"');
  });

  it('omits the background entirely for the "none" shape', () => {
    const svg = buildIconSvg({ ...DEFAULT_ICON, shape: 'none' });
    expect(svg).not.toContain('<rect');
    expect(svg).not.toContain('linearGradient');
    expect(svg).toContain('<text');
  });

  it('centres the text and escapes it', () => {
    const svg = buildIconSvg({ ...DEFAULT_ICON, text: 'a&b' });
    expect(svg).toContain('text-anchor="middle" dominant-baseline="central"');
    expect(svg).toContain('>A&amp;B<');
  });

  it('draws a stroked glyph with no fill, and a filled glyph with no stroke', () => {
    const check = buildIconSvg({ ...DEFAULT_ICON, foreground: 'glyph', glyph: 'check' });
    expect(check).toContain('fill="none" stroke="#ffffff"');
    const play = buildIconSvg({ ...DEFAULT_ICON, foreground: 'glyph', glyph: 'play' });
    expect(play).toContain('fill="#ffffff"');
    expect(play).not.toContain('stroke-width');
  });

  it('scales the glyph from its 24-unit grid into the padded square', () => {
    const svg = buildIconSvg({ ...DEFAULT_ICON, foreground: 'glyph', glyph: 'play', padding: 20, scale: 1 });
    // inner is 60, so the factor is 60 / 24 = 2.5
    expect(svg).toContain('transform="translate(50 50) scale(2.5) translate(-12 -12)"');
  });

  it('uses the emoji font stack and drops the weight for an emoji', () => {
    const svg = buildIconSvg({ ...DEFAULT_ICON, foreground: 'emoji', text: '🎉' });
    expect(svg).toContain('Apple Color Emoji');
    expect(svg).not.toContain('font-weight');
    expect(svg).toContain('>🎉<');
  });

  it('leaves the foreground out when there is nothing to draw', () => {
    expect(buildIconSvg({ ...DEFAULT_ICON, text: '   ' })).not.toContain('<text');
  });

  it('always closes the root element', () => {
    for (const glyph of GLYPHS) {
      expect(buildIconSvg({ ...DEFAULT_ICON, foreground: 'glyph', glyph: glyph.id }).trimEnd().endsWith('</svg>')).toBe(true);
    }
  });
});

describe('iconFileName', () => {
  it('names the file after what is in it', () => {
    expect(iconFileName({ ...DEFAULT_ICON, text: 'TB' })).toBe('icon-tb');
    expect(iconFileName({ ...DEFAULT_ICON, foreground: 'glyph', glyph: 'heart' })).toBe('icon-heart');
    expect(iconFileName({ ...DEFAULT_ICON, foreground: 'emoji', text: '🎉' })).toBe('icon-emoji');
  });

  it('falls back when the initials produce no usable characters', () => {
    expect(iconFileName({ ...DEFAULT_ICON, text: '🎉' })).toBe('icon-icon');
  });

  it('escapes what belongs in XML', () => {
    expect(escapeXml('<a & "b">')).toBe('&lt;a &amp; &quot;b&quot;&gt;');
  });
});
