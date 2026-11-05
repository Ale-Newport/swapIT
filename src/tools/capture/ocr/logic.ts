/**
 * Naming and ordering for Tesseract's language codes.
 *
 * `tesseract --list-langs` answers with ISO 639-2/T codes ("spa"), codes with a
 * script or variant tail ("chi_sim", "srp_latn"), script bundles
 * ("script/Latin") and a few entries that are not languages at all ("osd",
 * "equ", "snum"). A picker that shows those raw is a puzzle, so every code is turned
 * into something a person recognises.
 */

/** Codes Intl cannot name, or names in a way that reads badly in a picker. */
const SPECIAL: Record<string, string> = {
  osd: 'Page orientation and script detection',
  equ: 'Maths and equations',
  snum: 'Serial numbers',
  chi_sim: 'Chinese (Simplified)',
  chi_tra: 'Chinese (Traditional)',
  chi_sim_vert: 'Chinese (Simplified, vertical)',
  chi_tra_vert: 'Chinese (Traditional, vertical)',
  jpn_vert: 'Japanese (vertical)',
  kor_vert: 'Korean (vertical)',
  frk: 'German (Fraktur)',
  deu_frak: 'German (Fraktur)',
  deu_latf: 'German (Fraktur)',
  enm: 'English (medieval)',
  frm: 'French (medieval)',
  grc: 'Greek (ancient)',
  lat: 'Latin',
  kmr: 'Kurdish (Kurmanji)',
  fil: 'Filipino',
};

/** Variant tails that appear after an underscore. */
const VARIANTS: Record<string, string> = {
  latn: 'Latin script',
  cyrl: 'Cyrillic script',
  frak: 'Fraktur',
  latf: 'Fraktur',
  vert: 'vertical',
  old: 'old orthography',
  sim: 'Simplified',
  tra: 'Traditional',
};

/** Entries that help recognition but are not languages you would pick alone. */
export const NON_LANGUAGE_CODES = new Set(['osd', 'equ', 'snum']);

function intlName(code: string): string | null {
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });
    const value = names.of(code);
    if (!value || value.toLowerCase() === code.toLowerCase()) return null;
    return value;
  } catch {
    // RangeError for anything that is not a well-formed language tag.
    return null;
  }
}

/** "spa" → "Spanish", "chi_sim" → "Chinese (Simplified)", "script/Latin" → "Latin script". */
export function languageLabel(code: string): string {
  const raw = code.trim();
  if (!raw) return '';
  if (SPECIAL[raw]) return SPECIAL[raw];

  if (raw.toLowerCase().startsWith('script/')) {
    const script = raw.slice('script/'.length).replace(/_/g, ' ');
    return `${script} script`;
  }

  const direct = intlName(raw);
  if (direct) return direct;

  const [base, ...tail] = raw.split('_');
  const baseName = SPECIAL[base] ?? intlName(base);
  if (baseName && tail.length > 0) {
    const variant = tail.map((part) => VARIANTS[part.toLowerCase()] ?? part).join(', ');
    return `${baseName} (${variant})`;
  }
  if (baseName) return baseName;
  return raw;
}

/**
 * Languages selected when the tool opens: English and Spanish together when
 * both are installed, since bilingual documents are the common case here.
 */
export function defaultLanguages(available: string[]): string[] {
  const set = new Set(available);
  if (set.has('eng') && set.has('spa')) return ['eng', 'spa'];
  if (set.has('eng')) return ['eng'];
  const firstReal = available.find((code) => !NON_LANGUAGE_CODES.has(code) && !code.startsWith('script/'));
  return firstReal ? [firstReal] : [];
}

/** Real languages first (by name), then the detection helpers and script bundles. */
export function orderLanguages(available: string[]): string[] {
  const rank = (code: string) => {
    if (NON_LANGUAGE_CODES.has(code)) return 2;
    if (code.startsWith('script/')) return 1;
    return 0;
  };
  return [...available].sort((a, b) => rank(a) - rank(b) || languageLabel(a).localeCompare(languageLabel(b)));
}

/** The `-l` argument Tesseract expects. Throws with an actionable sentence when empty. */
export function joinLanguages(codes: string[]): string {
  const cleaned = codes.map((c) => c.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    throw new Error('Choose at least one language before reading the text.');
  }
  return cleaned.join('+');
}

export interface PsmOption {
  value: number;
  label: string;
  hint: string;
}

/** Tesseract page-segmentation modes, described by what they are good for. */
export const PSM_OPTIONS: PsmOption[] = [
  { value: 3, label: 'Automatic', hint: 'Let Tesseract work out the layout. Right for most pages.' },
  { value: 4, label: 'Single column', hint: 'One column of text of varying sizes, such as a receipt.' },
  { value: 6, label: 'Single block', hint: 'One uniform block of text, such as a paragraph screenshot.' },
  { value: 7, label: 'Single line', hint: 'The image contains exactly one line of text.' },
  { value: 8, label: 'Single word', hint: 'The image contains exactly one word.' },
  { value: 11, label: 'Sparse text', hint: 'Scattered words with no layout — labels, diagrams, UI screenshots.' },
];

/** Whether the DPI control matters for this selection. */
export function hasPdf(paths: string[]): boolean {
  return paths.some((p) => p.toLowerCase().endsWith('.pdf'));
}

/** Nothing but whitespace, page separators and stray punctuation came back. */
export function isEmptyResult(text: string): boolean {
  return text.replace(/--- Page \d+ ---/g, '').replace(/[\s\p{P}]/gu, '').length === 0;
}
