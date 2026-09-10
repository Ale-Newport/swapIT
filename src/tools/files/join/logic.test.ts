import { describe, expect, it } from 'vitest';
import { basePartName, comparePaths, joinedName, partNumber, reviewParts, sortForJoin } from './logic';

const part = (path: string, size = 100) => ({ path, name: path.split('/').pop()!, size });

describe('comparePaths', () => {
  it('sorts component by component, the way Rust orders paths', () => {
    // A naive string compare would put "/a-c/d" first because "-" < "/".
    expect(comparePaths('/a/b.txt', '/a-c/d.txt')).toBeLessThan(0);
  });

  it('treats a shorter path as coming first when it is a prefix', () => {
    expect(comparePaths('/a/b', '/a/b/c')).toBeLessThan(0);
  });

  it('is zero for the same path', () => {
    expect(comparePaths('/a/b', '/a/b')).toBe(0);
  });
});

describe('sortForJoin', () => {
  it('puts zero-padded parts in numeric order', () => {
    const sorted = sortForJoin(['/d/f.001.part', '/d/f.010.part', '/d/f.002.part']);
    expect(sorted).toEqual(['/d/f.001.part', '/d/f.002.part', '/d/f.010.part']);
  });

  it('does not mutate the caller list', () => {
    const input = ['/d/b', '/d/a'];
    sortForJoin(input);
    expect(input).toEqual(['/d/b', '/d/a']);
  });
});

describe('partNumber', () => {
  it('reads the number out of a part name', () => {
    expect(partNumber('movie.mp4.001.part')).toBe(1);
    expect(partNumber('movie.mp4.042.part')).toBe(42);
    expect(partNumber('movie.mp4.1234.part')).toBe(1234);
  });

  it('is null for a file that is not a numbered part', () => {
    expect(partNumber('movie.mp4')).toBeNull();
    expect(partNumber('movie.mp4.part')).toBeNull();
    expect(partNumber('001.part.txt')).toBeNull();
  });
});

describe('basePartName', () => {
  it('strips the numbering so parts of the same file group together', () => {
    expect(basePartName('movie.mp4.003.part')).toBe('movie.mp4');
    expect(basePartName('notes.txt')).toBe('notes.txt');
  });
});

describe('joinedName', () => {
  it('recovers the original name including its extension', () => {
    expect(joinedName('movie.mp4.001.part')).toBe('movie.mp4');
    expect(joinedName('backup.tar.gz.014.part')).toBe('backup.tar.gz');
  });

  it('mirrors the backend when the file is not a .part at all', () => {
    // The backend drops the final extension in that case.
    expect(joinedName('chunk.bin')).toBe('chunk');
    expect(joinedName('chunk')).toBe('chunk');
  });

  it('never produces an empty file name', () => {
    // The backend strips leading dots when sanitising, so ".part" becomes "part".
    expect(joinedName('.part')).toBe('part');
    expect(joinedName('...')).toBe('untitled');
  });
});

describe('reviewParts', () => {
  it('reports the join order, size and output name', () => {
    const review = reviewParts([
      part('/d/movie.mp4.002.part', 200),
      part('/d/movie.mp4.001.part', 300),
    ]);
    expect(review.order.map((p) => p.name)).toEqual(['movie.mp4.001.part', 'movie.mp4.002.part']);
    expect(review.totalSize).toBe(500);
    expect(review.outputName).toBe('movie.mp4');
    expect(review.missing).toEqual([]);
  });

  it('spots a gap in the sequence', () => {
    const review = reviewParts([
      part('/d/f.001.part'),
      part('/d/f.003.part'),
      part('/d/f.006.part'),
    ]);
    expect(review.missing).toEqual([2, 4, 5]);
  });

  it('spots the same number twice, which comes from two folders', () => {
    const review = reviewParts([part('/a/f.001.part'), part('/b/f.001.part')]);
    expect(review.duplicates).toEqual([1]);
  });

  it('notices numbering that does not start at one', () => {
    expect(reviewParts([part('/d/f.002.part'), part('/d/f.003.part')]).startsLate).toBe(true);
    expect(reviewParts([part('/d/f.001.part')]).startsLate).toBe(false);
  });

  it('notices parts belonging to different files', () => {
    const review = reviewParts([part('/d/a.zip.001.part'), part('/d/b.zip.002.part')]);
    expect(review.bases).toEqual(['a.zip', 'b.zip']);
  });

  it('counts files with no part number instead of guessing an order for them', () => {
    const review = reviewParts([part('/d/f.001.part'), part('/d/readme.txt')]);
    expect(review.unnumbered).toBe(1);
    expect(review.missing).toEqual([]);
  });

  it('does not enumerate a gap of thousands from one stray number', () => {
    const review = reviewParts([part('/d/f.001.part'), part('/d/f.99999.part')]);
    expect(review.missing).toEqual([]);
  });

  it('handles an empty selection', () => {
    const review = reviewParts([]);
    expect(review.order).toEqual([]);
    expect(review.outputName).toBe('');
    expect(review.totalSize).toBe(0);
  });
});
