import { describe, it, expect } from 'vitest';
import { bucketFor, formatCoordinates, parseCoordinate, summarizeMetadata, type MetadataEntry } from './logic';

const entry = (tag: string, value: string, group = 'Primary'): MetadataEntry => ({ group, tag, value });

describe('parseCoordinate', () => {
  it('reads the built-in parser’s "deg / min / sec" form', () => {
    expect(parseCoordinate('43 deg 28 min 2.88 sec', 'N')).toBe(43.467467);
  });

  it('reads ExifTool’s punctuation form with the hemisphere inline', () => {
    expect(parseCoordinate('3 deg 48\' 9.52" W')).toBeCloseTo(-3.802644, 5);
  });

  it('treats S and W as negative even when the degrees are positive', () => {
    expect(parseCoordinate('33 deg 51 min 0 sec', 'S')).toBeCloseTo(-33.85, 6);
    expect(parseCoordinate('151 deg 12 min 0 sec', 'West')).toBeCloseTo(-151.2, 6);
  });

  it('accepts a plain decimal value', () => {
    expect(parseCoordinate('-3.802644')).toBeCloseTo(-3.802644, 6);
    expect(parseCoordinate('43.4675 North')).toBeCloseTo(43.4675, 6);
  });

  it('does not mistake the "sec" unit for a south hemisphere marker', () => {
    expect(parseCoordinate('10 deg 0 min 0 sec')).toBe(10);
  });

  it('rejects values that are not coordinates', () => {
    expect(parseCoordinate('')).toBeNull();
    expect(parseCoordinate('unknown')).toBeNull();
    expect(parseCoordinate('900 deg 0 min 0 sec')).toBeNull();
  });
});

describe('bucketFor', () => {
  it('sorts tags into the four buckets', () => {
    expect(bucketFor('GPSLatitude')).toBe('Location');
    expect(bucketFor('Model')).toBe('Camera & lens');
    expect(bucketFor('LensModel')).toBe('Camera & lens');
    expect(bucketFor('DateTimeOriginal')).toBe('Date & time');
    // "Time" is in the name, but an exposure is a camera setting, not a timestamp.
    expect(bucketFor('ExposureTime')).toBe('Everything else');
    expect(bucketFor('FNumber')).toBe('Everything else');
  });
});

describe('summarizeMetadata', () => {
  const entries = [
    entry('Make', 'Apple'),
    entry('Model', 'iPhone 15 Pro'),
    entry('LensModel', 'iPhone 15 Pro back camera 6.765mm f/1.78'),
    entry('DateTimeOriginal', '2024-06-02 18:41:12'),
    entry('Software', '17.5.1'),
    entry('GPSLatitude', '43 deg 28 min 2.88 sec', 'GPS'),
    entry('GPSLatitudeRef', 'N', 'GPS'),
    entry('GPSLongitude', '3 deg 48 min 9.52 sec', 'GPS'),
    entry('GPSLongitudeRef', 'W', 'GPS'),
    entry('FNumber', 'f/1.8'),
  ];

  it('extracts a signed coordinate pair', () => {
    const gps = summarizeMetadata(entries).gps;
    expect(gps).not.toBeNull();
    expect(gps!.latitude).toBeCloseTo(43.4675, 4);
    expect(gps!.longitude).toBeCloseTo(-3.802644, 4);
    expect(formatCoordinates(gps!)).toBe('43.467467, -3.802644');
  });

  it('joins make and model without repeating the brand', () => {
    expect(summarizeMetadata(entries).camera).toBe('Apple iPhone 15 Pro');
    expect(summarizeMetadata([entry('Make', 'Canon'), entry('Model', 'Canon EOS R6')]).camera).toBe('Canon EOS R6');
    expect(summarizeMetadata([entry('Model', 'X-T5')]).camera).toBe('X-T5');
  });

  it('counts only the buckets that have entries', () => {
    const summary = summarizeMetadata(entries);
    expect(summary.total).toBe(10);
    expect(summary.buckets).toEqual([
      { label: 'Location', count: 4 },
      { label: 'Camera & lens', count: 4 },
      { label: 'Date & time', count: 1 },
      { label: 'Everything else', count: 1 },
    ]);
  });

  it('still lists location entries when the coordinates cannot be parsed', () => {
    const summary = summarizeMetadata([entry('GPSAltitude', '12.4 m', 'GPS')]);
    expect(summary.gps).toBeNull();
    expect(summary.locationEntries).toHaveLength(1);
  });

  it('falls back to ExifTool’s composite GPSPosition tag', () => {
    const summary = summarizeMetadata([entry('GPSPosition', '43.4675 N, 3.802644 W', 'Composite')]);
    expect(summary.gps?.latitude).toBeCloseTo(43.4675, 4);
    expect(summary.gps?.longitude).toBeCloseTo(-3.802644, 4);
  });

  it('handles a file with no metadata at all', () => {
    const summary = summarizeMetadata([]);
    expect(summary.total).toBe(0);
    expect(summary.gps).toBeNull();
    expect(summary.buckets).toEqual([]);
    expect(summary.camera).toBeNull();
  });
});
