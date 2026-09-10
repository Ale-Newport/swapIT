import { describe, it, expect } from 'vitest';
import {
  defaultLanguages,
  hasPdf,
  isEmptyResult,
  joinLanguages,
  languageLabel,
  orderLanguages,
} from './logic';

describe('languageLabel', () => {
  it('names plain ISO 639-2 codes', () => {
    expect(languageLabel('eng')).toBe('English');
    expect(languageLabel('spa')).toBe('Spanish');
  });

  it('names codes with a script tail that Intl rejects', () => {
    expect(languageLabel('chi_sim')).toBe('Chinese (Simplified)');
    expect(languageLabel('srp_latn')).toBe('Serbian (Latin script)');
  });

  it('describes the two entries that are not languages', () => {
    expect(languageLabel('osd')).toMatch(/orientation/i);
    expect(languageLabel('equ')).toMatch(/equations/i);
  });

  it('reads script bundles as scripts', () => {
    expect(languageLabel('script/Latin')).toBe('Latin script');
  });

  it('falls back to the raw code rather than showing nothing', () => {
    expect(languageLabel('zzz')).toBe('zzz');
    expect(languageLabel('')).toBe('');
  });
});

describe('defaultLanguages', () => {
  it('picks English and Spanish when both are installed', () => {
    expect(defaultLanguages(['eng', 'osd', 'spa', 'fra'])).toEqual(['eng', 'spa']);
  });

  it('falls back to English alone', () => {
    expect(defaultLanguages(['eng', 'deu'])).toEqual(['eng']);
  });

  it('uses the first real language when English is missing', () => {
    expect(defaultLanguages(['osd', 'script/Latin', 'deu'])).toEqual(['deu']);
  });

  it('never selects a detection helper on its own', () => {
    expect(defaultLanguages(['osd', 'equ'])).toEqual([]);
    expect(defaultLanguages([])).toEqual([]);
  });
});

describe('orderLanguages', () => {
  it('sorts by readable name and pushes helpers to the end', () => {
    expect(orderLanguages(['osd', 'spa', 'deu', 'script/Latin', 'eng'])).toEqual([
      'eng',
      'deu',
      'spa',
      'script/Latin',
      'osd',
    ]);
  });

  it('does not mutate the input', () => {
    const input = ['spa', 'eng'];
    orderLanguages(input);
    expect(input).toEqual(['spa', 'eng']);
  });
});

describe('joinLanguages', () => {
  it('joins with the plus sign Tesseract expects', () => {
    expect(joinLanguages(['eng', 'spa'])).toBe('eng+spa');
  });

  it('drops blanks and refuses an empty selection', () => {
    expect(joinLanguages([' eng ', ''])).toBe('eng');
    expect(() => joinLanguages([])).toThrow(/at least one language/i);
  });
});

describe('hasPdf', () => {
  it('spots a PDF whatever the case of the extension', () => {
    expect(hasPdf(['/a/b.PDF'])).toBe(true);
    expect(hasPdf(['/a/b.png', '/a/c.jpg'])).toBe(false);
  });
});

describe('isEmptyResult', () => {
  it('treats page separators and punctuation as nothing found', () => {
    expect(isEmptyResult('\n--- Page 1 ---\n \n.,;\n')).toBe(true);
  });

  it('accepts a single recognised word', () => {
    expect(isEmptyResult('--- Page 1 ---\nHola')).toBe(false);
  });
});
