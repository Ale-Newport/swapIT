/**
 * Reading the tags FFprobe reports back into the fields `write_audio_tags`
 * accepts. Containers disagree wildly on spelling — ID3v2 frames, iTunes atoms
 * and Vorbis comments all land in the same flat list — so every field collects
 * its own set of aliases.
 */

export interface TagFields {
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  year: string;
  genre: string;
  track: string;
  comment: string;
}

export const EMPTY_TAGS: TagFields = {
  title: '',
  artist: '',
  album: '',
  albumArtist: '',
  year: '',
  genre: '',
  track: '',
  comment: '',
};

const ALIASES: Record<keyof TagFields, string[]> = {
  title: ['title', 'tit2', 'name', '©nam'],
  artist: ['artist', 'tpe1', 'author', '©art'],
  album: ['album', 'talb', '©alb'],
  albumArtist: ['album_artist', 'albumartist', 'album artist', 'tpe2', 'aart'],
  year: ['date', 'year', 'tyer', 'tdrc', 'originalyear', '©day'],
  genre: ['genre', 'tcon', '©gen'],
  track: ['track', 'tracknumber', 'trck', 'trkn'],
  comment: ['comment', 'comm', 'description', '©cmt'],
};

/** A tag list from FFprobe, normalised to lower-case keys with the first value winning. */
function index(tags: Array<[string, string]>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, value] of tags) {
    const k = key.trim().toLowerCase();
    if (!k || !value.trim()) continue;
    if (!map.has(k)) map.set(k, value.trim());
  }
  return map;
}

/** Pull the four-digit year out of "2019", "2019-05-04" or "2019-05-04T00:00:00Z". */
export function yearFrom(value: string): string {
  const match = value.match(/\d{4}/);
  return match ? match[0] : value.trim();
}

export function tagsFromProbe(tags: Array<[string, string]> | undefined | null): TagFields {
  if (!tags?.length) return { ...EMPTY_TAGS };
  const map = index(tags);
  const pick = (field: keyof TagFields): string => {
    for (const alias of ALIASES[field]) {
      const found = map.get(alias);
      if (found) return found;
    }
    return '';
  };
  const year = pick('year');
  return {
    title: pick('title'),
    artist: pick('artist'),
    album: pick('album'),
    albumArtist: pick('albumArtist'),
    year: year ? yearFrom(year) : '',
    genre: pick('genre'),
    track: pick('track'),
    comment: pick('comment'),
  };
}

/** The fields the user actually filled in — empty ones are left to the file. */
export function filledFields(fields: TagFields): Array<[keyof TagFields, string]> {
  return (Object.keys(fields) as Array<keyof TagFields>)
    .map((key) => [key, fields[key].trim()] as [keyof TagFields, string])
    .filter(([, value]) => value.length > 0);
}

/** The payload for `write_audio_tags`, with blank fields dropped entirely. */
export function tagPayload(fields: TagFields, cover: string | null, removeAll: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = { removeAll };
  for (const [key, value] of filledFields(fields)) payload[key] = value;
  if (cover) payload.cover = cover;
  return payload;
}

// ------------------------------------------------------------------ Vorbis comments
//
// OGG and Opus keep their tags in a Vorbis comment block, which FFprobe reports
// on the audio stream. `probe_media` only carries `format.tags` across, so those
// files reach the frontend with an empty tag list however much they hold, and
// the form would sit there empty under a label promising it was pre-filled. The
// block lives in the second packet of the stream, so reading it here is a few
// hundred bytes of parsing once the file is in memory.
//
// `audio/remove-metadata` keeps its own copy of this reader for the same reason;
// the two tools stay independent folders, so a change here belongs there as well.

const VORBIS_EXTENSIONS = ['ogg', 'oga', 'opus'];

/** Files whose tags `probe_media` cannot see, so they are worth reading directly. */
export function isVorbisContainer(path: string): boolean {
  const name = path.split('/').pop() ?? path;
  const dot = name.lastIndexOf('.');
  return dot > 0 && VORBIS_EXTENSIONS.includes(name.slice(dot + 1).toLowerCase());
}

/** Larger than this and the block is not worth pulling the whole file in for. */
export const VORBIS_READ_LIMIT = 512 * 1024 * 1024;

/** A corrupt count must not spin the loop; no real file carries this many tags. */
const MAX_COMMENTS = 512;

/** "OggS", read big-endian. */
const OGG_MAGIC = 0x4f676753;

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/**
 * Rebuild the leading packets of the first logical stream from the Ogg pages.
 * A segment shorter than 255 bytes ends the packet it belongs to, which is what
 * lets a packet span pages.
 */
function oggPackets(bytes: Uint8Array, maxPackets: number): Uint8Array[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const packets: Uint8Array[] = [];
  let pending: Uint8Array[] = [];
  let serial: number | null = null;
  let offset = 0;
  while (offset + 27 <= bytes.length && packets.length < maxPackets) {
    if (view.getUint32(offset, false) !== OGG_MAGIC) break;
    const segments = bytes[offset + 26];
    const tableAt = offset + 27;
    let cursor = tableAt + segments;
    if (cursor > bytes.length) break;
    const pageSerial = view.getUint32(offset + 14, true);
    if (serial === null) serial = pageSerial;
    const wanted = pageSerial === serial;
    for (let i = 0; i < segments; i += 1) {
      const length = bytes[tableAt + i];
      if (cursor + length > bytes.length) {
        // A truncated file still has usable tags in the part that did arrive,
        // so the bytes that are there become the packet's tail.
        if (wanted && cursor < bytes.length) {
          pending.push(bytes.subarray(cursor));
          packets.push(concatBytes(pending));
        }
        return packets;
      }
      if (wanted) pending.push(bytes.subarray(cursor, cursor + length));
      cursor += length;
      if (wanted && length < 255) {
        packets.push(concatBytes(pending));
        pending = [];
        if (packets.length >= maxPackets) break;
      }
    }
    offset = cursor;
  }
  return packets;
}

/** Byte-for-byte prefix test, so header magic is checked without decoding. */
function hasPrefix(packet: Uint8Array, prefix: string, at = 0): boolean {
  if (packet.length < at + prefix.length) return false;
  for (let i = 0; i < prefix.length; i += 1) {
    if (packet[at + i] !== prefix.charCodeAt(i)) return false;
  }
  return true;
}

/** Where the comment list starts in a Vorbis, Opus or Ogg-FLAC comment header. */
function commentStart(packet: Uint8Array): number | null {
  if (packet[0] === 0x03 && hasPrefix(packet, 'vorbis', 1)) return 7;
  if (hasPrefix(packet, 'OpusTags')) return 8;
  // FLAC in an Ogg wrapper carries the same list inside a FLAC metadata block:
  // a type byte (4 = VORBIS_COMMENT, high bit marks the last block) and a
  // 24-bit length, which has to match the packet for this to be that block.
  if (packet.length > 4 && (packet[0] & 0x7f) === 4) {
    const length = (packet[1] << 16) | (packet[2] << 8) | packet[3];
    if (length === packet.length - 4) return 4;
  }
  return null;
}

function readComments(packet: Uint8Array, start: number): Array<[string, string]> {
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const decoder = new TextDecoder();
  const out: Array<[string, string]> = [];
  let at = start;
  if (at + 4 > packet.length) return out;
  at += 4 + view.getUint32(at, true); // the vendor string, which is not a tag
  if (at + 4 > packet.length) return out;
  const count = Math.min(view.getUint32(at, true), MAX_COMMENTS);
  at += 4;
  for (let i = 0; i < count; i += 1) {
    if (at + 4 > packet.length) break;
    const length = view.getUint32(at, true);
    at += 4;
    if (length > packet.length - at) break;
    const entry = decoder.decode(packet.subarray(at, at + length));
    at += length;
    const equals = entry.indexOf('=');
    // Vorbis comments are "KEY=value"; anything else is not a tag.
    if (equals > 0) out.push([entry.slice(0, equals), entry.slice(equals + 1)]);
  }
  return out;
}

/**
 * The tags in an OGG or Opus file, read from its Vorbis comment block. Returns
 * an empty list for anything that is not an Ogg stream, and for a block that is
 * truncated or malformed — a partial read is never treated as a failure.
 */
export function parseVorbisComments(bytes: Uint8Array): Array<[string, string]> {
  for (const packet of oggPackets(bytes, 3)) {
    const start = commentStart(packet);
    if (start !== null) return readComments(packet, start);
  }
  return [];
}
