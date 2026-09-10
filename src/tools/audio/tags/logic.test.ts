import { describe, it, expect } from 'vitest';
import {
  EMPTY_TAGS,
  filledFields,
  isVorbisContainer,
  parseVorbisComments,
  tagPayload,
  tagsFromProbe,
  yearFrom,
} from './logic';

// ---------------------------------------------------------------- Ogg fixtures
// Real bytes: an Ogg page with its segment table, an identification packet and
// a comment packet, so the reader is tested against the format itself.

const encoder = new TextEncoder();

function bytes(...parts: Array<Uint8Array | number[] | string>): Uint8Array {
  const chunks = parts.map((p) =>
    typeof p === 'string' ? encoder.encode(p) : p instanceof Uint8Array ? p : new Uint8Array(p),
  );
  const out = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

function commentBody(entries: string[], vendor = 'Lavf60.16.100'): Uint8Array {
  return bytes(
    u32(vendor.length),
    vendor,
    u32(entries.length),
    ...entries.flatMap((entry) => {
      const encoded = encoder.encode(entry);
      return [u32(encoded.length), encoded];
    }),
  );
}

function lacing(length: number): number[] {
  const out: number[] = [];
  let left = length;
  while (left >= 255) {
    out.push(255);
    left -= 255;
  }
  out.push(left);
  return out;
}

function oggPage(packets: Uint8Array[]): Uint8Array {
  const table = packets.flatMap((p) => lacing(p.length));
  const header = new Uint8Array(27);
  header.set(encoder.encode('OggS'), 0);
  new DataView(header.buffer).setUint32(14, 7, true);
  header[26] = table.length;
  return bytes(header, table, ...packets);
}

/** An .ogg file carrying `entries` as its Vorbis comment block. */
function oggFile(entries: string[]): Uint8Array {
  return bytes(
    oggPage([bytes([0x01], 'vorbis', new Uint8Array(23))]),
    oggPage([bytes([0x03], 'vorbis', commentBody(entries))]),
  );
}

/** The same, as an Opus stream. */
function opusFile(entries: string[]): Uint8Array {
  return bytes(
    oggPage([bytes('OpusHead', new Uint8Array(11))]),
    oggPage([bytes('OpusTags', commentBody(entries))]),
  );
}

describe('tagsFromProbe', () => {
  it('reads a plain ID3 tag list', () => {
    expect(
      tagsFromProbe([
        ['title', 'Blue Monday'],
        ['artist', 'New Order'],
        ['album', 'Power, Corruption & Lies'],
        ['track', '3'],
      ]),
    ).toEqual({
      ...EMPTY_TAGS,
      title: 'Blue Monday',
      artist: 'New Order',
      album: 'Power, Corruption & Lies',
      track: '3',
    });
  });

  it('matches keys case-insensitively', () => {
    expect(tagsFromProbe([['TITLE', 'Loud']]).title).toBe('Loud');
    expect(tagsFromProbe([['Artist', 'Someone']]).artist).toBe('Someone');
  });

  it('understands the album-artist spellings different containers use', () => {
    expect(tagsFromProbe([['album_artist', 'Various']]).albumArtist).toBe('Various');
    expect(tagsFromProbe([['ALBUMARTIST', 'Various']]).albumArtist).toBe('Various');
    expect(tagsFromProbe([['TPE2', 'Various']]).albumArtist).toBe('Various');
  });

  it('reduces a full date to the year', () => {
    expect(tagsFromProbe([['date', '2019-05-04T00:00:00Z']]).year).toBe('2019');
    expect(tagsFromProbe([['date', '1977']]).year).toBe('1977');
  });

  it('keeps a "3/12" track number as written', () => {
    expect(tagsFromProbe([['track', '3/12']]).track).toBe('3/12');
  });

  it('trims values and ignores blank ones', () => {
    expect(tagsFromProbe([['title', '  Padded  ']]).title).toBe('Padded');
    expect(tagsFromProbe([['title', '   ']]).title).toBe('');
  });

  it('lets the first alias win when a file carries both', () => {
    expect(tagsFromProbe([['album_artist', 'First'], ['albumartist', 'Second']]).albumArtist).toBe('First');
  });

  it('returns empty fields for nothing at all', () => {
    expect(tagsFromProbe([])).toEqual(EMPTY_TAGS);
    expect(tagsFromProbe(null)).toEqual(EMPTY_TAGS);
    expect(tagsFromProbe(undefined)).toEqual(EMPTY_TAGS);
  });
});

describe('parseVorbisComments', () => {
  it('fills the form from an OGG file FFprobe reports no format tags for', () => {
    const file = oggFile(['ARTIST=OggArtist', 'TITLE=OggTitle', 'DATE=2019-05-04', 'TRACKNUMBER=3/12']);
    expect(tagsFromProbe(parseVorbisComments(file))).toEqual({
      ...EMPTY_TAGS,
      artist: 'OggArtist',
      title: 'OggTitle',
      year: '2019',
      track: '3/12',
    });
  });

  it('fills the form from an Opus file', () => {
    const file = opusFile(['ARTIST=OpusArtist', 'ALBUM=OpusAlbum', 'GENRE=Ambient']);
    expect(tagsFromProbe(parseVorbisComments(file))).toEqual({
      ...EMPTY_TAGS,
      artist: 'OpusArtist',
      album: 'OpusAlbum',
      genre: 'Ambient',
    });
  });

  it('keeps UTF-8 values intact', () => {
    expect(tagsFromProbe(parseVorbisComments(oggFile(['ARTIST=Björk']))).artist).toBe('Björk');
  });

  it('leaves the form empty rather than throwing on anything else', () => {
    expect(parseVorbisComments(new Uint8Array(0))).toEqual([]);
    expect(parseVorbisComments(bytes('ID3', new Uint8Array(120)))).toEqual([]);
    const file = oggFile(['ARTIST=Whole', 'TITLE=Cut']);
    expect(parseVorbisComments(file.subarray(0, file.length - 6))).toEqual([['ARTIST', 'Whole']]);
  });
});

describe('isVorbisContainer', () => {
  it('is true only for the containers that hide their tags from probe_media', () => {
    expect(isVorbisContainer('/music/song.ogg')).toBe(true);
    expect(isVorbisContainer('/music/song.OGA')).toBe(true);
    expect(isVorbisContainer('/music/voice.opus')).toBe(true);
    expect(isVorbisContainer('/music/song.mp3')).toBe(false);
    expect(isVorbisContainer('/music/song.flac')).toBe(false);
  });
});

describe('yearFrom', () => {
  it('takes the first four-digit run', () => {
    expect(yearFrom('2004-12-31')).toBe('2004');
    expect(yearFrom('recorded 1969, released 1970')).toBe('1969');
  });

  it('hands back anything with no year in it', () => {
    expect(yearFrom('unknown')).toBe('unknown');
  });
});

describe('tagPayload', () => {
  it('sends only the fields that were filled in', () => {
    const payload = tagPayload({ ...EMPTY_TAGS, title: 'Song', artist: '  ' }, null, false);
    expect(payload).toEqual({ removeAll: false, title: 'Song' });
  });

  it('adds the cover only when one was chosen', () => {
    expect(tagPayload(EMPTY_TAGS, '/tmp/art.jpg', false)).toEqual({ removeAll: false, cover: '/tmp/art.jpg' });
    expect(tagPayload(EMPTY_TAGS, null, false)).toEqual({ removeAll: false });
  });

  it('carries the replace-everything flag through', () => {
    expect(tagPayload({ ...EMPTY_TAGS, title: 'Song' }, null, true)).toEqual({ removeAll: true, title: 'Song' });
  });
});

describe('filledFields', () => {
  it('lists the non-blank fields', () => {
    expect(filledFields({ ...EMPTY_TAGS, title: 'A', genre: ' Rock ' })).toEqual([
      ['title', 'A'],
      ['genre', 'Rock'],
    ]);
  });

  it('is empty when nothing was typed', () => {
    expect(filledFields(EMPTY_TAGS)).toEqual([]);
  });
});
