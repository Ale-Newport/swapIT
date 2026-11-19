import { describe, expect, it } from 'vitest';
import { downloadName } from './save';

describe('downloadName', () => {
  it('keeps only the file name', () => {
    expect(downloadName('/Users/me/Desktop/qr.png')).toBe('qr.png');
    expect(downloadName('..\\..\\evil.svg')).toBe('evil.svg');
  });

  it('drops control characters and falls back when nothing is left', () => {
    expect(downloadName('a\u0000b\nc.txt')).toBe('abc.txt');
    expect(downloadName('   ')).toBe('toolbox-output');
    expect(downloadName('dir/')).toBe('toolbox-output');
  });
});
