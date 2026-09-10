import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BARCODE_OPTIONS,
  SYMBOLOGIES,
  bwipOptions,
  getSymbology,
  gs1CheckDigit,
  humanizeBwipError,
  parseBatchLines,
  safeFilename,
  toBwipColor,
  validateBarcode,
  withExplicitSize,
} from './logic';

describe('GS1 check digit', () => {
  it('matches the published examples for every retail symbology', () => {
    expect(gs1CheckDigit('590123412345')).toBe(7); // EAN-13
    expect(gs1CheckDigit('9638507')).toBe(4); // EAN-8
    expect(gs1CheckDigit('03600029145')).toBe(2); // UPC-A
    expect(gs1CheckDigit('1540014128876')).toBe(3); // ITF-14
  });

  it('returns 0 rather than 10 when the sum lands on a multiple of ten', () => {
    expect(gs1CheckDigit('000000000000')).toBe(0);
  });

  it('refuses anything that is not a run of digits', () => {
    expect(() => gs1CheckDigit('59012341234A')).toThrow(/digits/i);
    expect(() => gs1CheckDigit('')).toThrow();
  });
});

describe('EAN, UPC and ITF validation', () => {
  it('accepts a full code with the right check digit', () => {
    const result = validateBarcode('ean13', '5901234123457');
    expect(result.ok).toBe(true);
    expect(result.text).toBe('5901234123457');
    expect(result.message).toBeNull();
  });

  it('accepts a short code and offers to append the computed digit', () => {
    const result = validateBarcode('ean13', '590123412345');
    expect(result.ok).toBe(true);
    expect(result.note).toContain('7');
    expect(result.fix).toEqual({ label: 'Append check digit 7', value: '5901234123457' });
  });

  it('rejects a wrong check digit and offers the right one', () => {
    const result = validateBarcode('ean13', '5901234123450');
    expect(result.ok).toBe(false);
    expect(result.message).toBe('The check digit should be 7, not 0.');
    expect(result.fix).toEqual({ label: 'Correct it to 7', value: '5901234123457' });
  });

  it('explains the wrong length without guessing', () => {
    const result = validateBarcode('ean13', '12345');
    expect(result.ok).toBe(false);
    expect(result.message).toBe('EAN-13 needs 12 or 13 digits — this has 5.');
    expect(result.fix).toBeNull();
  });

  it('ignores the spaces and hyphens people type into product codes', () => {
    expect(validateBarcode('ean13', '5 901234 123457').text).toBe('5901234123457');
    expect(validateBarcode('upca', '036000-291452').ok).toBe(true);
  });

  it('offers to strip letters out of a numeric code', () => {
    const result = validateBarcode('ean8', '9638507X');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('digits only');
    expect(result.fix).toEqual({ label: 'Keep only the digits', value: '9638507' });
  });

  it('uses each symbology’s own lengths', () => {
    expect(validateBarcode('ean8', '9638507').ok).toBe(true);
    expect(validateBarcode('ean8', '96385074').ok).toBe(true);
    expect(validateBarcode('upca', '03600029145').ok).toBe(true);
    expect(validateBarcode('upca', '036000291452').ok).toBe(true);
    expect(validateBarcode('itf14', '1540014128876').ok).toBe(true);
    expect(validateBarcode('itf14', '15400141288763').ok).toBe(true);
    expect(validateBarcode('upca', '9638507').message).toContain('11 or 12 digits');
  });
});

describe('Code 39 and Code 128', () => {
  it('takes the full Code 39 alphabet', () => {
    expect(validateBarcode('code39', 'TOOLBOX 39-A.$/+%').ok).toBe(true);
  });

  it('offers capitals instead of rejecting lower case outright', () => {
    const result = validateBarcode('code39', 'toolbox');
    expect(result.ok).toBe(false);
    expect(result.fix).toEqual({ label: 'Use capitals', value: 'TOOLBOX' });
  });

  it('names the characters Code 39 cannot hold', () => {
    const result = validateBarcode('code39', 'TOOL#BOX');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('"#"');
    expect(result.fix).toBeNull();
  });

  it('lets Code 128 carry any ASCII but not emoji', () => {
    expect(validateBarcode('code128', 'Toolbox/2024#7 (a)').ok).toBe(true);
    expect(validateBarcode('code128', 'Café').ok).toBe(false);
    expect(validateBarcode('code128', '🎉').message).toContain('Data Matrix');
  });
});

describe('Codabar and Data Matrix', () => {
  it('accepts a value already wrapped in start and stop letters', () => {
    expect(validateBarcode('codabar', 'A123456A').ok).toBe(true);
    expect(validateBarcode('codabar', 'D12-34:56/78.90+B').ok).toBe(true);
  });

  it('offers to wrap a bare body', () => {
    const result = validateBarcode('codabar', '123456');
    expect(result.ok).toBe(false);
    expect(result.fix).toEqual({ label: 'Wrap it in A … A', value: 'A123456A' });
  });

  it('offers capitals for lower-case start and stop letters', () => {
    expect(validateBarcode('codabar', 'a123456a').fix).toEqual({ label: 'Use capitals', value: 'A123456A' });
  });

  it('rejects characters Codabar has no bars for', () => {
    const result = validateBarcode('codabar', 'A12X34A');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('"X"');
  });

  it('lets Data Matrix carry anything but emptiness', () => {
    expect(validateBarcode('datamatrix', 'Any text at all — even accents').ok).toBe(true);
    expect(validateBarcode('datamatrix', '   ').ok).toBe(false);
  });
});

describe('symbology table', () => {
  it('gives every entry a sample that passes its own validation', () => {
    for (const symbology of SYMBOLOGIES) {
      const result = validateBarcode(symbology.id, symbology.sample);
      expect(result.ok, `${symbology.label} sample "${symbology.sample}" is invalid`).toBe(true);
    }
  });

  it('looks entries up by id and complains about unknown ones', () => {
    expect(getSymbology('itf14').bcid).toBe('itf14');
    // @ts-expect-error deliberately invalid id
    expect(() => getSymbology('qrcode')).toThrow(/unknown/i);
  });
});

describe('render options', () => {
  it('converts colours to the bare hex bwip-js expects', () => {
    expect(toBwipColor('#ff0055')).toBe('FF0055');
    expect(toBwipColor('#fff')).toBe('FFFFFF');
    expect(toBwipColor('not a colour')).toBe('000000');
  });

  it('omits the background entirely when it should be transparent', () => {
    const opaque = bwipOptions(getSymbology('code128'), 'X', DEFAULT_BARCODE_OPTIONS);
    expect(opaque.backgroundcolor).toBe('FFFFFF');
    const clear = bwipOptions(getSymbology('code128'), 'X', { ...DEFAULT_BARCODE_OPTIONS, transparent: true });
    expect(clear.backgroundcolor).toBeUndefined();
  });

  it('leaves bar height and the text line off 2D symbols', () => {
    const matrix = bwipOptions(getSymbology('datamatrix'), 'X', DEFAULT_BARCODE_OPTIONS);
    expect(matrix.height).toBeUndefined();
    expect(matrix.includetext).toBeUndefined();
    const linear = bwipOptions(getSymbology('ean13'), '5901234123457', DEFAULT_BARCODE_OPTIONS);
    expect(linear.height).toBe(14);
    expect(linear.includetext).toBe(true);
  });
});

describe('output helpers', () => {
  it('strips the bwipp prefix out of an error', () => {
    expect(humanizeBwipError(new Error('bwipp.ean13badLength#6878: EAN-13 must be 12 or 13 digits'))).toBe(
      'EAN-13 must be 12 or 13 digits.',
    );
    expect(humanizeBwipError('something odd')).toBe('something odd.');
    expect(humanizeBwipError('')).toBe('That value could not be drawn as a barcode.');
  });

  it('adds width and height to a viewBox-only SVG', () => {
    expect(withExplicitSize('<svg viewBox="0 0 504 162" xmlns="x"></svg>')).toContain(
      '<svg width="504" height="162"',
    );
  });

  it('leaves an SVG that already has a width alone', () => {
    const svg = '<svg width="10" viewBox="0 0 10 10"></svg>';
    expect(withExplicitSize(svg)).toBe(svg);
  });

  it('turns a value into a safe filename', () => {
    expect(safeFilename('5901234123457')).toBe('5901234123457');
    expect(safeFilename('../../etc/passwd')).toBe('etc-passwd');
    expect(safeFilename('  ')).toBe('barcode');
    expect(safeFilename('x'.repeat(200)).length).toBe(60);
  });

  it('reads a batch list without blanks or duplicates', () => {
    expect(parseBatchLines('a\n\n b \na\r\nc')).toEqual(['a', 'b', 'c']);
    expect(parseBatchLines('   ')).toEqual([]);
  });
});
