import { describe, expect, it } from 'vitest';
import {
  buildWatermarkOps,
  burnedLogoWidthPx,
  frameCoverage,
  logoWidthPx,
  overlayStyle,
  POSITION_GRID,
  POSITION_LABELS,
  previewScaleFactor,
  TEXT_MARGIN,
  textFontPx,
  validateWatermark,
  type WatermarkPosition,
} from './logic';

describe('POSITION_GRID', () => {
  it('is a 3×3 layout with the two unsupported cells left empty', () => {
    expect(POSITION_GRID).toHaveLength(9);
    expect(POSITION_GRID[3]).toBeNull();
    expect(POSITION_GRID[5]).toBeNull();
    expect(POSITION_GRID.filter(Boolean)).toHaveLength(7);
  });

  it('labels every position it offers', () => {
    for (const cell of POSITION_GRID) {
      if (cell) expect(POSITION_LABELS[cell]).toBeTruthy();
    }
  });
});

describe('overlayStyle', () => {
  it('insets the corners by the margin', () => {
    expect(overlayStyle('top-left', 24)).toEqual({ top: '24px', left: '24px' });
    expect(overlayStyle('bottom-right', 12)).toEqual({ bottom: '12px', right: '12px' });
    expect(overlayStyle('top-right', 0)).toEqual({ top: '0px', right: '0px' });
  });

  it('centres horizontally for the centre columns', () => {
    expect(overlayStyle('top-center', 10)).toEqual({
      top: '10px',
      left: '50%',
      transform: 'translateX(-50%)',
    });
    expect(overlayStyle('bottom-center', 10)).toEqual({
      bottom: '10px',
      left: '50%',
      transform: 'translateX(-50%)',
    });
  });

  it('ignores the margin for a true centre', () => {
    expect(overlayStyle('center', 99)).toEqual({
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    });
  });

  it('produces a style for every supported position', () => {
    for (const position of Object.keys(POSITION_LABELS) as WatermarkPosition[]) {
      expect(Object.keys(overlayStyle(position, 20)).length).toBeGreaterThan(0);
    }
  });
});

describe('previewScaleFactor', () => {
  it('shrinks video pixels down to preview pixels', () => {
    expect(previewScaleFactor(480, 1920)).toBe(0.25);
  });

  it('draws 1:1 when the video width is unknown', () => {
    expect(previewScaleFactor(480, null)).toBe(1);
    expect(previewScaleFactor(480, 0)).toBe(1);
  });

  it('is zero before the frame has been measured', () => {
    expect(previewScaleFactor(0, 1920)).toBe(0);
  });
});

describe('burnedLogoWidthPx', () => {
  it('is a fraction of the logo, because scale=iw*s runs inside the logo chain', () => {
    expect(burnedLogoWidthPx(0.2, 500)).toBe(100);
    // The frame is irrelevant: the same logo and scale on any video.
    expect(burnedLogoWidthPx(0.2, 500)).toBe(burnedLogoWidthPx(0.2, 500));
  });

  it('clamps to the range FFmpeg accepts', () => {
    expect(burnedLogoWidthPx(5, 500)).toBe(500);
    expect(burnedLogoWidthPx(0, 500)).toBe(10);
  });

  it('is zero while the logo size is unknown', () => {
    expect(burnedLogoWidthPx(0.2, 0)).toBe(0);
    expect(burnedLogoWidthPx(0.2, Number.NaN)).toBe(0);
  });
});

describe('logoWidthPx', () => {
  it('shrinks the burned-in width by the preview factor', () => {
    // 500 px logo at 20% = 100 video px; the frame is drawn at a quarter size.
    expect(logoWidthPx(0.2, 500, 0.25)).toBe(25);
    expect(logoWidthPx(0.2, 500, 1)).toBe(100);
  });

  it('is zero when the logo or the frame has not been measured', () => {
    expect(logoWidthPx(0.2, 0, 0.25)).toBe(0);
    expect(logoWidthPx(0.2, 500, 0)).toBe(0);
  });
});

describe('frameCoverage', () => {
  it('reports how much of the frame the mark actually covers', () => {
    // 500 px logo at 20% is 100 px — barely a twentieth of a 1920 px frame.
    expect(frameCoverage(0.2, 500, 1920)).toBeCloseTo(100 / 1920, 5);
    // The same settings swallow a 640 px frame.
    expect(frameCoverage(0.2, 500, 640)).toBeCloseTo(100 / 640, 5);
  });

  it('is null when either width is unknown', () => {
    expect(frameCoverage(0.2, 500, null)).toBeNull();
    expect(frameCoverage(0.2, 500, 0)).toBeNull();
    expect(frameCoverage(0.2, 0, 1920)).toBeNull();
  });
});

describe('textFontPx', () => {
  it('is a twenty-second of the frame height', () => {
    expect(textFontPx(440)).toBe(20);
  });

  it('is zero before the frame is measured', () => {
    expect(textFontPx(0)).toBe(0);
  });
});

describe('buildWatermarkOps', () => {
  const common = { position: 'top-left' as WatermarkPosition, opacity: 0.5, margin: 30, scale: 0.25 };

  it('sends only the logo in logo mode', () => {
    const ops = buildWatermarkOps({ ...common, mode: 'logo', logo: '/tmp/logo.png', text: 'ignored' });
    expect(ops.logo).toBe('/tmp/logo.png');
    expect(ops.text).toBeUndefined();
    expect(ops.margin).toBe(30);
  });

  it('sends only the text in text mode, at the fixed inset the backend uses', () => {
    const ops = buildWatermarkOps({ ...common, mode: 'text', logo: '/tmp/logo.png', text: '  hello  ' });
    expect(ops.text).toBe('hello');
    expect(ops.logo).toBeUndefined();
    expect(ops.margin).toBe(TEXT_MARGIN);
  });

  it('clamps opacity and scale into the ranges FFmpeg accepts', () => {
    const ops = buildWatermarkOps({
      ...common,
      mode: 'logo',
      logo: '/tmp/a.png',
      text: '',
      opacity: 4,
      scale: 0,
      margin: -8,
    });
    expect(ops.opacity).toBe(1);
    expect(ops.scale).toBe(0.02);
    expect(ops.margin).toBe(0);
  });
});

describe('validateWatermark', () => {
  it('asks for the missing piece', () => {
    expect(validateWatermark('logo', null, 'anything')).toMatch(/PNG or JPG/);
    expect(validateWatermark('text', '/tmp/a.png', '   ')).toMatch(/text/);
  });

  it('passes once the mode has what it needs', () => {
    expect(validateWatermark('logo', '/tmp/a.png', '')).toBeNull();
    expect(validateWatermark('text', null, 'Toolbox')).toBeNull();
  });
});
