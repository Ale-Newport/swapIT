import { describe, it, expect } from 'vitest';
import { ASCII_ROWS, LATIN1_ROWS, searchRows } from './data';

describe('the tables', () => {
  it('covers both ranges completely', () => {
    expect(ASCII_ROWS).toHaveLength(128);
    expect(LATIN1_ROWS).toHaveLength(128);
    expect(ASCII_ROWS[0].code).toBe(0);
    expect(ASCII_ROWS[127].code).toBe(127);
    expect(LATIN1_ROWS[0].code).toBe(128);
    expect(LATIN1_ROWS[127].code).toBe(255);
  });

  it('formats every base correctly', () => {
    const a = ASCII_ROWS[65];
    expect([a.hex, a.octal, a.binary, a.char]).toEqual(['41', '101', '01000001', 'A']);
    const nul = ASCII_ROWS[0];
    expect([nul.hex, nul.octal, nul.binary]).toEqual(['00', '000', '00000000']);
  });

  it('labels control codes with their abbreviation and meaning', () => {
    expect(ASCII_ROWS[10]).toMatchObject({ abbr: 'LF', name: 'Line feed', escape: '\\n', isControl: true });
    expect(ASCII_ROWS[13].abbr).toBe('CR');
    expect(ASCII_ROWS[27]).toMatchObject({ abbr: 'ESC', name: 'Escape' });
    expect(ASCII_ROWS[127]).toMatchObject({ abbr: 'DEL', name: 'Delete', isControl: true });
    expect(ASCII_ROWS[32].display).toBe('SP');
  });

  it('names printable characters', () => {
    expect(ASCII_ROWS[48].name).toBe('Digit zero');
    expect(ASCII_ROWS[97].name).toBe('Latin small letter a');
    expect(ASCII_ROWS[38].name).toBe('Ampersand');
  });

  it('carries the HTML entities that exist', () => {
    expect(ASCII_ROWS[38].entity).toBe('&amp;');
    expect(ASCII_ROWS[60].entity).toBe('&lt;');
    expect(ASCII_ROWS[62].entity).toBe('&gt;');
    expect(ASCII_ROWS[34].entity).toBe('&quot;');
    expect(ASCII_ROWS[65].entity).toBeNull();
  });

  it('handles the Latin-1 supplement', () => {
    const nbsp = LATIN1_ROWS[160 - 128];
    expect(nbsp).toMatchObject({ entity: '&nbsp;', name: 'No-break space', display: 'NBSP' });
    expect(LATIN1_ROWS[169 - 128]).toMatchObject({ entity: '&copy;', char: '©' });
    expect(LATIN1_ROWS[255 - 128]).toMatchObject({ entity: '&yuml;', char: 'ÿ' });
    expect(LATIN1_ROWS[233 - 128]).toMatchObject({ char: 'é', name: 'Latin small letter e with acute' });
  });

  it('shows the Windows-1252 character for the C1 range', () => {
    expect(LATIN1_ROWS[128 - 128]).toMatchObject({ abbr: 'PAD', windows1252: '€', isControl: true });
    expect(LATIN1_ROWS[147 - 128].windows1252).toBe('“');
    expect(LATIN1_ROWS[129 - 128].windows1252).toBeNull();
  });
});

describe('searchRows', () => {
  it('finds by decimal and hex code', () => {
    expect(searchRows(ASCII_ROWS, '65').map((r) => r.char)).toContain('A');
    expect(searchRows(ASCII_ROWS, '0x41').map((r) => r.char)).toEqual(['A']);
    expect(searchRows(ASCII_ROWS, 'U+41').map((r) => r.char)).toEqual(['A']);
  });

  it('finds by character', () => {
    expect(searchRows(ASCII_ROWS, '&').map((r) => r.code)).toContain(38);
    expect(searchRows(LATIN1_ROWS, '©').map((r) => r.code)).toEqual([169]);
  });

  it('finds by name, abbreviation and entity', () => {
    expect(searchRows(ASCII_ROWS, 'carriage').map((r) => r.code)).toEqual([13]);
    expect(searchRows(ASCII_ROWS, 'esc').map((r) => r.code)).toContain(27);
    expect(searchRows(ASCII_ROWS, '&amp;').map((r) => r.code)).toEqual([38]);
    expect(searchRows(ASCII_ROWS, '\\n').map((r) => r.code)).toEqual([10]);
  });

  it('returns everything for an empty query and nothing for nonsense', () => {
    expect(searchRows(ASCII_ROWS, '   ')).toHaveLength(128);
    expect(searchRows(ASCII_ROWS, 'zzzzz')).toEqual([]);
  });
});
