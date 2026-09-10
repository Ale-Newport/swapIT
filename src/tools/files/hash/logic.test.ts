import { describe, expect, it } from 'vitest';
import {
  algorithmForDigest,
  checksumFileText,
  extractDigest,
  firstDifference,
  groupDigest,
  matchingFile,
  verdictFor,
  type FileHashes,
} from './logic';

const SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const MD5 = 'd41d8cd98f00b204e9800998ecf8427e';

describe('extractDigest', () => {
  it('reads a bare digest', () => {
    expect(extractDigest(SHA256)).toBe(SHA256);
  });

  it('reads sha256sum output with the file name attached', () => {
    expect(extractDigest(`${SHA256}  ubuntu-24.04.1-desktop-amd64.iso`)).toBe(SHA256);
  });

  it('reads the BSD shape', () => {
    expect(extractDigest(`SHA256 (ubuntu.iso) = ${SHA256}`)).toBe(SHA256);
  });

  it('lower-cases a digest published in capitals', () => {
    expect(extractDigest(SHA256.toUpperCase())).toBe(SHA256);
  });

  it('joins a digest printed in readable groups', () => {
    expect(extractDigest(groupDigest(MD5, 4))).toBe(MD5);
  });

  it('ignores surrounding prose and whitespace', () => {
    expect(extractDigest(`\n  Checksum:\n  ${MD5}\n  (verify before installing)\n`)).toBe(MD5);
  });

  it('returns nothing when there is no digest-shaped run', () => {
    expect(extractDigest('')).toBeNull();
    expect(extractDigest('no checksum here')).toBeNull();
    expect(extractDigest('deadbeefdeadbeef')).toBeNull();
  });

  it('is not fooled by a hex-looking file name alone', () => {
    expect(extractDigest('abcdef0123456789.iso')).toBeNull();
  });
});

describe('algorithmForDigest', () => {
  it('names the algorithm from the digest length', () => {
    expect(algorithmForDigest(SHA256)).toBe('sha256');
    expect(algorithmForDigest(MD5)).toBe('md5');
    expect(algorithmForDigest('a'.repeat(40))).toBe('sha1');
    expect(algorithmForDigest('a'.repeat(128))).toBe('sha512');
  });

  it('has no answer for a missing or wrong-length digest', () => {
    expect(algorithmForDigest(null)).toBeNull();
    expect(algorithmForDigest('abc')).toBeNull();
  });
});

const file = (patch: Partial<FileHashes>): FileHashes => ({
  path: '/downloads/ubuntu.iso',
  name: 'ubuntu.iso',
  size: 100,
  ...patch,
});

describe('verdictFor', () => {
  it('matches regardless of the case the checksum was published in', () => {
    expect(verdictFor(file({ sha256: SHA256 }), 'sha256', SHA256.toUpperCase())).toBe('match');
  });

  it('reports a mismatch for a different digest', () => {
    expect(verdictFor(file({ sha256: SHA256 }), 'sha256', MD5.padEnd(64, '0'))).toBe('mismatch');
  });

  it('stays undecided with nothing to compare against', () => {
    expect(verdictFor(file({ sha256: SHA256 }), 'sha256', null)).toBe('unknown');
    expect(verdictFor(file({ sha256: null }), 'sha256', SHA256)).toBe('unknown');
  });
});

describe('matchingFile', () => {
  const results = [file({ name: 'other.iso', sha256: 'f'.repeat(64) }), file({ name: 'ubuntu.iso', sha256: SHA256 })];

  it('finds which of several files is the one the checksum describes', () => {
    expect(matchingFile(results, 'sha256', SHA256)?.name).toBe('ubuntu.iso');
  });

  it('returns nothing when none of them match', () => {
    expect(matchingFile(results, 'sha256', 'a'.repeat(64))).toBeNull();
  });
});

describe('checksumFileText', () => {
  it('writes the two-space sha256sum format', () => {
    const text = checksumFileText([file({ sha256: SHA256 })], 'sha256');
    expect(text).toBe(`${SHA256}  ubuntu.iso`);
  });

  it('skips files that have no digest for the chosen algorithm', () => {
    expect(checksumFileText([file({ sha256: null })], 'sha256')).toBe('');
  });
});

describe('firstDifference', () => {
  it('reports -1 for identical digests', () => {
    expect(firstDifference(SHA256, SHA256.toUpperCase())).toBe(-1);
  });

  it('points at the first differing character', () => {
    expect(firstDifference('abcdef', 'abcxef')).toBe(3);
  });

  it('points at the end when one is a prefix of the other', () => {
    expect(firstDifference('abc', 'abcdef')).toBe(3);
  });
});
