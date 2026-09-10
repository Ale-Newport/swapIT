import { describe, expect, it } from 'vitest';
import {
  algorithmForDigest,
  baseName,
  checksumFile,
  fullReport,
  parseExpected,
  summarise,
  verifyFiles,
  type FileHashes,
} from './logic';

const MD5 = 'd41d8cd98f00b204e9800998ecf8427e';
const SHA1 = 'da39a3ee5e6b4b0d3255bfef95601890afd80709';
const SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const SHA512 = 'c'.repeat(128);

const FILE: FileHashes = {
  path: '/Users/ada/Downloads/app.dmg',
  name: 'app.dmg',
  size: 1024,
  md5: MD5,
  sha1: null,
  sha256: SHA256,
  sha512: null,
};

describe('algorithmForDigest', () => {
  it('identifies each algorithm by digest length', () => {
    expect(algorithmForDigest(MD5)).toBe('md5');
    expect(algorithmForDigest(SHA1)).toBe('sha1');
    expect(algorithmForDigest(SHA256)).toBe('sha256');
    expect(algorithmForDigest(SHA512)).toBe('sha512');
  });

  it('returns nothing for a value of the wrong length', () => {
    expect(algorithmForDigest('abc123')).toBeNull();
  });
});

describe('baseName', () => {
  it('keeps only the last path segment', () => {
    expect(baseName('/Users/ada/app.dmg')).toBe('app.dmg');
    expect(baseName('app.dmg')).toBe('app.dmg');
  });
});

describe('parseExpected', () => {
  it('reads a bare digest', () => {
    expect(parseExpected(SHA256).entries).toEqual([{ digest: SHA256, name: null, algorithm: 'sha256' }]);
  });

  it('reads a shasum line with two spaces', () => {
    expect(parseExpected(`${SHA256}  app.dmg`).entries).toEqual([
      { digest: SHA256, name: 'app.dmg', algorithm: 'sha256' },
    ]);
  });

  it('reads the binary-mode star before the file name', () => {
    expect(parseExpected(`${MD5} *app.dmg`).entries[0].name).toBe('app.dmg');
  });

  it('reads the BSD format', () => {
    expect(parseExpected(`SHA256 (app.dmg) = ${SHA256}`).entries).toEqual([
      { digest: SHA256, name: 'app.dmg', algorithm: 'sha256' },
    ]);
  });

  it('accepts the digest after the file name', () => {
    expect(parseExpected(`app.dmg ${SHA1}`).entries).toEqual([
      { digest: SHA1, name: 'app.dmg', algorithm: 'sha1' },
    ]);
  });

  it('lowercases an uppercase digest and trims surrounding space', () => {
    expect(parseExpected(`   ${SHA256.toUpperCase()}   `).entries[0].digest).toBe(SHA256);
  });

  it('reads several lines and skips comments and blanks', () => {
    const text = `# checksums\n${SHA256}  a.zip\n\n${MD5}  b.zip\n`;
    const parsed = parseExpected(text);
    expect(parsed.entries.map((e) => e.name)).toEqual(['a.zip', 'b.zip']);
    expect(parsed.unreadable).toEqual([]);
  });

  it('collects lines that hold no digest at all', () => {
    const parsed = parseExpected('not a hash at all\nstill nothing');
    expect(parsed.entries).toEqual([]);
    expect(parsed.unreadable).toHaveLength(2);
  });

  it('keeps a file name that contains spaces', () => {
    expect(parseExpected(`${SHA256}  my file.dmg`).entries[0].name).toBe('my file.dmg');
  });
});

describe('verifyFiles', () => {
  it('matches a single pasted digest against every file', () => {
    const rows = verifyFiles([FILE], SHA256);
    expect(rows[0].verdict).toBe('match');
    expect(rows[0].algorithm).toBe('sha256');
  });

  it('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(verifyFiles([FILE], `\n  ${SHA256.toUpperCase()}  \n`)[0].verdict).toBe('match');
  });

  it('reports a mismatch instead of a match', () => {
    const wrong = `${'f'.repeat(63)}0`;
    const rows = verifyFiles([FILE], wrong);
    expect(rows[0].verdict).toBe('mismatch');
    expect(rows[0].actual).toBe(SHA256);
  });

  it('matches a named line to the right file', () => {
    const other: FileHashes = { ...FILE, path: '/tmp/other.dmg', name: 'other.dmg', sha256: 'a'.repeat(64) };
    const rows = verifyFiles([FILE, other], `${SHA256}  app.dmg`);
    expect(rows[0].verdict).toBe('match');
    expect(rows[1].verdict).toBe('unchecked');
    expect(rows[1].note).toMatch(/No expected hash/);
  });

  it('matches by file name even when the line carries a full path', () => {
    expect(verifyFiles([FILE], `${SHA256}  /somewhere/else/app.dmg`)[0].verdict).toBe('match');
  });

  it('says which algorithm to switch on when that digest was not computed', () => {
    const rows = verifyFiles([FILE], SHA1);
    expect(rows[0].verdict).toBe('unchecked');
    expect(rows[0].note).toMatch(/Turn SHA-1 on/);
  });

  it('explains a value that is no digest length at all', () => {
    const rows = verifyFiles([FILE], 'app.dmg abc123');
    expect(rows[0].verdict).toBe('unchecked');
    expect(rows[0].note).toMatch(/No expected hash/);
  });

  it('leaves every file unchecked when nothing was pasted', () => {
    expect(verifyFiles([FILE], '').every((r) => r.verdict === 'unchecked')).toBe(true);
  });

  it('does not spread a named digest across other files', () => {
    const other: FileHashes = { ...FILE, path: '/tmp/other.dmg', name: 'other.dmg' };
    const rows = verifyFiles([other], `${SHA256}  app.dmg`);
    expect(rows[0].verdict).toBe('unchecked');
  });
});

describe('summarise', () => {
  it('counts each verdict', () => {
    const other: FileHashes = { ...FILE, path: '/tmp/o.dmg', name: 'o.dmg', sha256: 'a'.repeat(64) };
    const rows = verifyFiles([FILE, other], SHA256);
    expect(summarise(rows)).toEqual({ matched: 1, mismatched: 1, unchecked: 0 });
  });
});

describe('checksumFile', () => {
  it('writes shasum-compatible lines', () => {
    expect(checksumFile([FILE], 'sha256')).toBe(`${SHA256}  app.dmg`);
  });

  it('skips files whose digest was not computed', () => {
    expect(checksumFile([FILE], 'sha512')).toBe('');
  });
});

describe('fullReport', () => {
  it('groups every computed digest under its file name', () => {
    expect(fullReport([FILE], ['md5', 'sha256', 'sha512'])).toBe(
      `app.dmg\n  MD5      ${MD5}\n  SHA-256  ${SHA256}`,
    );
  });
});
