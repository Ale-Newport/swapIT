import { describe, it, expect } from 'vitest';
import {
  classifyTag,
  hasCoverArt,
  hasPictureTag,
  isVorbisContainer,
  parseVorbisComments,
  summarizeTags,
} from './logic';

// ---------------------------------------------------------------- Ogg fixtures
//
// Real files, byte for byte: pages with a segment table, a header packet and a
// comment packet, so the reader is tested against the format rather than
// against the way it happens to be written.

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

/** The comment list every Vorbis-family container shares. */
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

/** Lacing values for one packet: 255s until the remainder, which ends it. */
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

function oggPage(packets: Uint8Array[], serial = 7): Uint8Array {
  const table = packets.flatMap((p) => lacing(p.length));
  const header = new Uint8Array(27);
  header.set(encoder.encode('OggS'), 0);
  new DataView(header.buffer).setUint32(14, serial, true);
  header[26] = table.length;
  return bytes(header, table, ...packets);
}

function oggFile(headerPacket: Uint8Array, commentPacket: Uint8Array, serial = 7): Uint8Array {
  return bytes(oggPage([headerPacket], serial), oggPage([commentPacket], serial));
}

const vorbisId = bytes([0x01], 'vorbis', new Uint8Array(23));
const opusId = bytes('OpusHead', new Uint8Array(11));

function vorbisComments(entries: string[]): Uint8Array {
  return bytes([0x03], 'vorbis', commentBody(entries));
}

function opusComments(entries: string[]): Uint8Array {
  return bytes('OpusTags', commentBody(entries));
}

describe('classifyTag', () => {
  it('marks the tags that point at a person or a purchase', () => {
    expect(classifyTag('artist')).toBe('identifying');
    expect(classifyTag('comment')).toBe('identifying');
    expect(classifyTag('purchase_date')).toBe('identifying');
    expect(classifyTag('ITUNES_ACCOUNT')).toBe('identifying');
  });

  it('marks container bookkeeping as technical', () => {
    expect(classifyTag('major_brand')).toBe('technical');
    expect(classifyTag('encoder')).toBe('technical');
    expect(classifyTag('handler_name')).toBe('technical');
  });

  it('errs towards identifying for keys it does not recognise', () => {
    expect(classifyTag('some_vendor_field')).toBe('identifying');
  });
});

describe('summarizeTags', () => {
  it('counts how many files carry each key', () => {
    const rows = summarizeTags([
      { path: 'a.mp3', tags: [['artist', 'A'], ['album', 'X']] },
      { path: 'b.mp3', tags: [['artist', 'A']] },
    ]);
    expect(rows.find((r) => r.key === 'artist')?.count).toBe(2);
    expect(rows.find((r) => r.key === 'album')?.count).toBe(1);
  });

  it('reports a shared value only when every file agrees', () => {
    const rows = summarizeTags([
      { path: 'a.mp3', tags: [['album', 'Same'], ['title', 'One']] },
      { path: 'b.mp3', tags: [['album', 'Same'], ['title', 'Two']] },
    ]);
    expect(rows.find((r) => r.key === 'album')?.sharedValue).toBe('Same');
    expect(rows.find((r) => r.key === 'title')?.sharedValue).toBeNull();
  });

  it('puts identifying tags above technical ones', () => {
    const rows = summarizeTags([
      { path: 'a.mp3', tags: [['encoder', 'LAME'], ['major_brand', 'M4A'], ['artist', 'A']] },
    ]);
    expect(rows[0].key).toBe('artist');
    expect(rows.map((r) => r.kind)).toEqual(['identifying', 'technical', 'technical']);
  });

  it('folds different spellings of the same key together', () => {
    const rows = summarizeTags([
      { path: 'a.mp3', tags: [['Artist', 'A']] },
      { path: 'b.mp3', tags: [['ARTIST', 'B']] },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(2);
  });

  it('counts a key once per file even when it repeats', () => {
    const rows = summarizeTags([{ path: 'a.mp3', tags: [['comment', 'one'], ['comment', 'two']] }]);
    expect(rows[0].count).toBe(1);
  });

  it('returns nothing for files with no tags', () => {
    expect(summarizeTags([{ path: 'a.mp3', tags: [] }])).toEqual([]);
    expect(summarizeTags([])).toEqual([]);
  });

  it('leaves embedded artwork to the cover-art warning', () => {
    const rows = summarizeTags([
      { path: 'a.ogg', tags: [['METADATA_BLOCK_PICTURE', 'AAAAAy…base64…'], ['artist', 'A']] },
    ]);
    expect(rows.map((r) => r.key)).toEqual(['artist']);
  });
});

describe('hasPictureTag', () => {
  it('spots artwork carried as a Vorbis comment', () => {
    expect(hasPictureTag([['METADATA_BLOCK_PICTURE', 'AAAA']])).toBe(true);
    expect(hasPictureTag([['coverart', 'AAAA']])).toBe(true);
    expect(hasPictureTag([['artist', 'A']])).toBe(false);
    expect(hasPictureTag([])).toBe(false);
  });
});

describe('isVorbisContainer', () => {
  it('picks the containers FFprobe hides the tags of', () => {
    expect(isVorbisContainer('/music/song.ogg')).toBe(true);
    expect(isVorbisContainer('/music/song.OGA')).toBe(true);
    expect(isVorbisContainer('/music/voice.opus')).toBe(true);
  });

  it('leaves the containers that report their tags alone', () => {
    expect(isVorbisContainer('/music/song.mp3')).toBe(false);
    expect(isVorbisContainer('/music/song.flac')).toBe(false);
    expect(isVorbisContainer('/music.ogg/song.m4a')).toBe(false);
    expect(isVorbisContainer('/music/noextension')).toBe(false);
  });
});

describe('parseVorbisComments', () => {
  it('reads the tags FFprobe reports on the stream instead of the format', () => {
    const file = oggFile(vorbisId, vorbisComments(['ARTIST=OggArtist', 'TITLE=OggTitle']));
    expect(parseVorbisComments(file)).toEqual([
      ['ARTIST', 'OggArtist'],
      ['TITLE', 'OggTitle'],
    ]);
  });

  it('reads an Opus comment header', () => {
    const file = oggFile(opusId, opusComments(['ARTIST=OpusArtist', 'TITLE=OpusTitle']));
    expect(parseVorbisComments(file)).toEqual([
      ['ARTIST', 'OpusArtist'],
      ['TITLE', 'OpusTitle'],
    ]);
  });

  it('reads a FLAC comment block inside an Ogg wrapper', () => {
    const body = commentBody(['ARTIST=OgaArtist']);
    const block = bytes([0x84, (body.length >> 16) & 0xff, (body.length >> 8) & 0xff, body.length & 0xff], body);
    const file = oggFile(bytes([0x7f], 'FLAC', new Uint8Array(4)), block);
    expect(parseVorbisComments(file)).toEqual([['ARTIST', 'OgaArtist']]);
  });

  it('keeps UTF-8 values intact', () => {
    const file = oggFile(vorbisId, vorbisComments(['ARTIST=Björk', 'TITLE=Jóga']));
    expect(parseVorbisComments(file)).toEqual([
      ['ARTIST', 'Björk'],
      ['TITLE', 'Jóga'],
    ]);
  });

  it('follows a packet that spans two pages', () => {
    const comments = vorbisComments(['COMMENT=' + 'x'.repeat(600), 'ARTIST=Split']);
    expect(comments.length).toBeGreaterThan(510);
    // A page whose last lacing value is 255 carries on into the next page, so
    // the first 510 bytes go out as two full segments and the rest follows.
    const header = new Uint8Array(27);
    header.set(encoder.encode('OggS'), 0);
    new DataView(header.buffer).setUint32(14, 7, true);
    header[26] = 2;
    const continued = bytes(header, [255, 255], comments.subarray(0, 510));
    const file = bytes(oggPage([vorbisId]), continued, oggPage([comments.subarray(510)]));
    expect(parseVorbisComments(file)).toContainEqual(['ARTIST', 'Split']);
  });

  it('ignores pages belonging to another logical stream', () => {
    const mine = oggFile(vorbisId, vorbisComments(['ARTIST=Mine']), 1);
    const theirs = oggPage([vorbisComments(['ARTIST=Theirs'])], 2);
    expect(parseVorbisComments(bytes(theirs, mine))).toEqual([['ARTIST', 'Theirs']]);
    expect(parseVorbisComments(mine)).toEqual([['ARTIST', 'Mine']]);
  });

  it('returns nothing rather than throwing on data that is not Ogg', () => {
    expect(parseVorbisComments(new Uint8Array(0))).toEqual([]);
    expect(parseVorbisComments(bytes('ID3', new Uint8Array(200)))).toEqual([]);
    expect(parseVorbisComments(bytes('OggS', new Uint8Array(4)))).toEqual([]);
  });

  it('stops at a truncated comment block instead of inventing tags', () => {
    const file = oggFile(vorbisId, vorbisComments(['ARTIST=Whole', 'TITLE=Cut']));
    expect(parseVorbisComments(file.subarray(0, file.length - 6))).toEqual([['ARTIST', 'Whole']]);
  });

  it('skips entries that are not KEY=value', () => {
    const file = oggFile(vorbisId, vorbisComments(['NOTATAG', '=empty', 'ARTIST=Real']));
    expect(parseVorbisComments(file)).toEqual([['ARTIST', 'Real']]);
  });
});

describe('hasCoverArt', () => {
  it('spots a picture stream', () => {
    expect(hasCoverArt([{ kind: 'audio', codec: 'mp3' }, { kind: 'video', codec: 'mjpeg' }])).toBe(true);
    expect(hasCoverArt([{ kind: 'video', codec: 'PNG' }])).toBe(true);
  });

  it('ignores audio-only files and real video', () => {
    expect(hasCoverArt([{ kind: 'audio', codec: 'flac' }])).toBe(false);
    expect(hasCoverArt([{ kind: 'video', codec: 'h264' }])).toBe(false);
  });
});
