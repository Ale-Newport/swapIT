/**
 * Barcode input rules. Each symbology accepts a different alphabet and most of
 * the retail ones carry a check digit, so the value is validated — and fixed
 * where the fix is unambiguous — before the renderer ever sees it.
 */

export type SymbologyId =
  | 'code128'
  | 'code39'
  | 'ean13'
  | 'ean8'
  | 'upca'
  | 'itf14'
  | 'codabar'
  | 'datamatrix';

export interface Symbology {
  id: SymbologyId;
  /** The bwip-js encoder name. */
  bcid: string;
  label: string;
  hint: string;
  sample: string;
  /** 2D symbols have no bar height and no human-readable line. */
  twoDimensional: boolean;
}

export const SYMBOLOGIES: Symbology[] = [
  {
    id: 'code128',
    bcid: 'code128',
    label: 'Code 128',
    hint: 'Any text or number — the usual choice for shipping and internal labels',
    sample: 'TOOLBOX-2024',
    twoDimensional: false,
  },
  {
    id: 'code39',
    bcid: 'code39',
    label: 'Code 39',
    hint: 'Digits, capitals, space and - . $ / + % — common in warehouses',
    sample: 'TOOLBOX 39',
    twoDimensional: false,
  },
  {
    id: 'ean13',
    bcid: 'ean13',
    label: 'EAN-13',
    hint: '12 or 13 digits — the retail barcode used outside North America',
    sample: '5901234123457',
    twoDimensional: false,
  },
  {
    id: 'ean8',
    bcid: 'ean8',
    label: 'EAN-8',
    hint: '7 or 8 digits — the short retail code for small packages',
    sample: '96385074',
    twoDimensional: false,
  },
  {
    id: 'upca',
    bcid: 'upca',
    label: 'UPC-A',
    hint: '11 or 12 digits — the North American retail barcode',
    sample: '036000291452',
    twoDimensional: false,
  },
  {
    id: 'itf14',
    bcid: 'itf14',
    label: 'ITF-14',
    hint: '13 or 14 digits — the carton code printed on shipping cases',
    sample: '15400141288763',
    twoDimensional: false,
  },
  {
    id: 'codabar',
    bcid: 'rationalizedCodabar',
    label: 'Codabar',
    hint: 'Digits and - $ : / . + wrapped in a start and stop letter A–D',
    sample: 'A123456A',
    twoDimensional: false,
  },
  {
    id: 'datamatrix',
    bcid: 'datamatrix',
    label: 'Data Matrix',
    hint: 'A square 2D code that stays readable when printed very small',
    sample: 'Toolbox',
    twoDimensional: true,
  },
];

export function getSymbology(id: SymbologyId): Symbology {
  const found = SYMBOLOGIES.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown barcode type "${id}".`);
  return found;
}

// ------------------------------------------------------------------ check digits

/**
 * The GS1 modulo-10 check digit shared by EAN-8, EAN-13, UPC-A and ITF-14:
 * weights alternate 3 and 1 starting from the rightmost data digit.
 */
export function gs1CheckDigit(digits: string): number {
  if (!/^\d+$/.test(digits)) {
    throw new Error('A check digit can only be worked out from digits.');
  }
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    const value = Number(digits[digits.length - 1 - i]);
    sum += i % 2 === 0 ? value * 3 : value;
  }
  return (10 - (sum % 10)) % 10;
}

// ------------------------------------------------------------------ validation

export interface Validation {
  ok: boolean;
  /** The exact string handed to the renderer. */
  text: string;
  /** Why it cannot be rendered. */
  message: string | null;
  /** Something worth knowing even though it renders fine. */
  note: string | null;
  /** A correction the user can apply with one click. */
  fix: { label: string; value: string } | null;
}

function fail(text: string, message: string, fix: Validation['fix'] = null): Validation {
  return { ok: false, text, message, note: null, fix };
}

function pass(text: string, note: string | null = null, fix: Validation['fix'] = null): Validation {
  return { ok: true, text, message: null, note, fix };
}

const CODE39_ALPHABET = /^[0-9A-Z \-.$/+%]*$/;
const CODABAR_BODY = /^[0-9\-$:/.+]*$/;

function listBadCharacters(value: string, allowed: RegExp): string {
  const bad = [...new Set(value.split('').filter((char) => !allowed.test(char)))];
  return bad.map((char) => (char === ' ' ? 'a space' : `"${char}"`)).join(', ');
}

/** Validate a numeric symbology that ends in a GS1 check digit. */
function validateGs1(
  raw: string,
  label: string,
  dataLength: number,
): Validation {
  const digits = raw.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits)) {
    return fail(
      digits,
      `${label} is digits only. Remove ${listBadCharacters(digits, /^\d$/)} and try again.`,
      /\d/.test(digits) ? { label: 'Keep only the digits', value: digits.replace(/\D/g, '') } : null,
    );
  }
  if (digits.length === dataLength) {
    const check = gs1CheckDigit(digits);
    return pass(digits, `Check digit ${check} is added for you.`, {
      label: `Append check digit ${check}`,
      value: `${digits}${check}`,
    });
  }
  if (digits.length === dataLength + 1) {
    const expected = gs1CheckDigit(digits.slice(0, dataLength));
    const actual = Number(digits[dataLength]);
    if (expected !== actual) {
      return fail(digits, `The check digit should be ${expected}, not ${actual}.`, {
        label: `Correct it to ${expected}`,
        value: `${digits.slice(0, dataLength)}${expected}`,
      });
    }
    return pass(digits);
  }
  return fail(
    digits,
    `${label} needs ${dataLength} or ${dataLength + 1} digits — this has ${digits.length}.`,
  );
}

export function validateBarcode(id: SymbologyId, raw: string): Validation {
  const trimmed = raw.trim();
  if (!trimmed) return fail('', 'Type the value the barcode should carry.');

  switch (id) {
    case 'code128': {
      // eslint-disable-next-line no-control-regex
      const printable = /^[\x00-\x7F]*$/;
      if (!printable.test(trimmed)) {
        return fail(
          trimmed,
          'Code 128 only holds standard ASCII. Accented letters and emoji need Data Matrix instead.',
        );
      }
      return pass(trimmed);
    }

    case 'code39': {
      const upper = trimmed.toUpperCase();
      if (CODE39_ALPHABET.test(trimmed)) return pass(trimmed);
      if (CODE39_ALPHABET.test(upper)) {
        return fail(trimmed, 'Code 39 has no lower-case letters.', {
          label: 'Use capitals',
          value: upper,
        });
      }
      return fail(
        trimmed,
        `Code 39 holds digits, capitals, spaces and - . $ / + % only. Remove ${listBadCharacters(upper, /^[0-9A-Z \-.$/+%]$/)}.`,
      );
    }

    case 'ean13':
      return validateGs1(trimmed, 'EAN-13', 12);
    case 'ean8':
      return validateGs1(trimmed, 'EAN-8', 7);
    case 'upca':
      return validateGs1(trimmed, 'UPC-A', 11);
    case 'itf14':
      return validateGs1(trimmed, 'ITF-14', 13);

    case 'codabar': {
      const upper = trimmed.toUpperCase();
      if (/^[A-D][0-9\-$:/.+]*[A-D]$/.test(upper)) {
        return upper === trimmed ? pass(upper) : fail(trimmed, 'Codabar start and stop letters are capitals.', { label: 'Use capitals', value: upper });
      }
      if (CODABAR_BODY.test(upper)) {
        return fail(trimmed, 'Codabar has to start and stop with a letter A, B, C or D.', {
          label: 'Wrap it in A … A',
          value: `A${upper}A`,
        });
      }
      return fail(
        trimmed,
        `Codabar holds digits and - $ : / . + between two letters A–D. Remove ${listBadCharacters(upper.replace(/^[A-D]|[A-D]$/g, ''), /^[0-9\-$:/.+]$/)}.`,
      );
    }

    case 'datamatrix':
      return pass(trimmed);
  }
}

// ------------------------------------------------------------------ rendering

export interface BarcodeOptions {
  includeText: boolean;
  /** Bar height in millimetres, as bwip-js measures it. */
  barHeight: number;
  scale: number;
  foreground: string;
  background: string;
  transparent: boolean;
}

export const DEFAULT_BARCODE_OPTIONS: BarcodeOptions = {
  includeText: true,
  barHeight: 14,
  scale: 3,
  foreground: '#111111',
  background: '#ffffff',
  transparent: false,
};

/** bwip-js wants bare hex, and refuses anything it does not recognise. */
export function toBwipColor(hex: string): string {
  const value = hex.trim().replace(/^#/, '');
  const expanded =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value.slice(0, 6);
  return /^[0-9a-f]{6}$/i.test(expanded) ? expanded.toUpperCase() : '000000';
}

/** Exactly the bwip-js options Toolbox sets — a structural subset of RenderOptions. */
export interface BwipOptions {
  bcid: string;
  text: string;
  scale: number;
  barcolor: string;
  padding: number;
  backgroundcolor?: string;
  height?: number;
  includetext?: boolean;
  textxalign?: 'center';
  textcolor?: string;
}

export function bwipOptions(symbology: Symbology, text: string, options: BarcodeOptions): BwipOptions {
  const result: BwipOptions = {
    bcid: symbology.bcid,
    text,
    scale: Math.max(1, Math.round(options.scale)),
    barcolor: toBwipColor(options.foreground),
    padding: 6,
  };
  if (!options.transparent) result.backgroundcolor = toBwipColor(options.background);
  if (!symbology.twoDimensional) {
    result.height = Math.max(2, options.barHeight);
    result.includetext = options.includeText;
    if (options.includeText) {
      result.textxalign = 'center';
      result.textcolor = toBwipColor(options.foreground);
    }
  }
  return result;
}

/** bwip-js reports failures as `bwipp.ean13badLength#6878: EAN-13 must be…`. */
export function humanizeBwipError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const cleaned = raw.replace(/^bwipp?\.[A-Za-z0-9]+(#\d+)?:\s*/, '').trim();
  if (!cleaned) return 'That value could not be drawn as a barcode.';
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

/** bwip-js emits a viewBox with no width or height; add them so files open at a sane size. */
export function withExplicitSize(svg: string): string {
  if (/<svg[^>]*\swidth=/.test(svg)) return svg;
  const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!viewBox) return svg;
  return svg.replace('<svg', `<svg width="${viewBox[1]}" height="${viewBox[2]}"`);
}

/** A filename that survives every filesystem, built from the encoded value. */
export function safeFilename(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+/, '')
    .replace(/-+$/, '')
    .slice(0, 60);
  return cleaned || 'barcode';
}

/** One value per line, blanks and duplicates removed, order preserved. */
export function parseBatchLines(text: string): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const value = line.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    lines.push(value);
  }
  return lines;
}
