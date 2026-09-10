import { describe, it, expect } from 'vitest';
import {
  classifyEntry,
  filterMetadata,
  groupMetadata,
  metadataToJson,
  normalizeSourceGroup,
  type MetadataEntry,
} from './logic';

const entry = (tag: string, value = 'x', group = 'In(0)'): MetadataEntry => ({ group, tag, value });

describe('normalizeSourceGroup', () => {
  it('drops the IFD numbers the built-in parser reports', () => {
    expect(normalizeSourceGroup('In(0)')).toBeNull();
    expect(normalizeSourceGroup('In(1)')).toBeNull();
    expect(normalizeSourceGroup('Primary')).toBeNull();
    expect(normalizeSourceGroup('  ')).toBeNull();
  });

  it('keeps the real group names ExifTool reports', () => {
    expect(normalizeSourceGroup('XMP')).toBe('XMP');
    expect(normalizeSourceGroup('IPTC')).toBe('IPTC');
  });
});

describe('classifyEntry', () => {
  it('routes tags by name rather than by IFD', () => {
    expect(classifyEntry(entry('GPSLongitudeRef'))).toBe('Location');
    expect(classifyEntry(entry('LensSpecification'))).toBe('Camera & lens');
    expect(classifyEntry(entry('FNumber'))).toBe('Exposure');
    expect(classifyEntry(entry('ISOSpeed'))).toBe('Exposure');
    expect(classifyEntry(entry('DateTimeOriginal'))).toBe('Date & time');
    expect(classifyEntry(entry('PixelXDimension'))).toBe('Image');
    expect(classifyEntry(entry('Copyright'))).toBe('Author & rights');
  });

  it('falls back to the source group only when the tag says nothing', () => {
    expect(classifyEntry(entry('Nickname', 'x', 'XMP'))).toBe('XMP');
    expect(classifyEntry(entry('Nickname', 'x', 'In(0)'))).toBe('Other');
  });
});

describe('groupMetadata', () => {
  it('orders known groups first, extras next and Other last', () => {
    const groups = groupMetadata([
      entry('Unknown1'),
      entry('Nickname', 'x', 'XMP'),
      entry('DateTimeOriginal'),
      entry('GPSLatitude'),
      entry('Model'),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['Location', 'Camera & lens', 'Date & time', 'XMP', 'Other']);
  });

  it('keeps entry order inside a group', () => {
    const groups = groupMetadata([entry('Make', 'Apple'), entry('Model', 'iPhone')]);
    expect(groups[0].entries.map((e) => e.tag)).toEqual(['Make', 'Model']);
  });

  it('returns nothing for an empty read', () => {
    expect(groupMetadata([])).toEqual([]);
  });
});

describe('filterMetadata', () => {
  const entries = [entry('Make', 'Apple'), entry('GPSLatitude', '43 deg'), entry('FNumber', 'f/1.8')];

  it('matches tags, values and the display group', () => {
    expect(filterMetadata(entries, 'apple').map((e) => e.tag)).toEqual(['Make']);
    expect(filterMetadata(entries, 'f/1').map((e) => e.tag)).toEqual(['FNumber']);
    expect(filterMetadata(entries, 'location').map((e) => e.tag)).toEqual(['GPSLatitude']);
  });

  it('returns everything for a blank query', () => {
    expect(filterMetadata(entries, '   ')).toHaveLength(3);
  });
});

describe('metadataToJson', () => {
  it('disambiguates repeated tags instead of overwriting them', () => {
    const json = metadataToJson([entry('UnknownTag', 'first'), entry('UnknownTag', 'second')]);
    expect(json.metadata).toEqual({ Other: { UnknownTag: 'first', 'UnknownTag (2)': 'second' } });
  });

  it('includes the file facts when image_info is available', () => {
    const json = metadataToJson([entry('Make', 'Apple')], {
      path: '/tmp/a.jpg',
      name: 'a.jpg',
      width: 4032,
      height: 3024,
      megapixels: 12.2,
      aspectRatio: '4:3',
      colorType: 'RGB8',
      format: 'jpeg',
      size: 2_400_000,
      hasAlpha: false,
    });
    expect(json.file).toMatchObject({ name: 'a.jpg', width: 4032, aspectRatio: '4:3' });
    expect(JSON.stringify(json)).toContain('Camera & lens');
  });
});
