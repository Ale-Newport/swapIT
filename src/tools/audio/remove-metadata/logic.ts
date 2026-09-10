/**
 * Summarising what a batch of files is about to lose. Some tags identify a
 * person or a purchase and some are container bookkeeping, and a privacy tool
 * should say which is which rather than listing thirty keys flatly.
 */

export type TagKind = 'identifying' | 'technical';

/** Keys that carry something about a person, a purchase or a place. */
const IDENTIFYING = new Set([
  'artist',
  'album_artist',
  'albumartist',
  'composer',
  'performer',
  'author',
  'comment',
  'description',
  'lyrics',
  'copyright',
  'encoded_by',
  'purchase_date',
  'itunes_account',
  'itunes_account_name',
  'owner',
  'publisher',
  'location',
  'gps',
  'isrc',
  'tsrc',
  'title',
  'album',
]);

/** Keys that only describe the container or the encoder. */
const TECHNICAL_PREFIXES = ['major_brand', 'minor_version', 'compatible_brands', 'encoder', 'handler_name', 'vendor_id'];

export function classifyTag(key: string): TagKind {
  const k = key.trim().toLowerCase();
  if (IDENTIFYING.has(k)) return 'identifying';
  if (TECHNICAL_PREFIXES.some((prefix) => k.startsWith(prefix))) return 'technical';
  // Anything unrecognised is treated as identifying: over-reporting what will be
  // removed is the safe direction for a privacy tool.
  return 'identifying';
}

export interface TagSummaryRow {
  key: string;
  count: number;
  kind: TagKind;
  /** The value, when every file that has this tag agrees on it. */
  sharedValue: string | null;
}

export interface TaggedFile {
  path: string;
  tags: Array<[string, string]>;
}

/**
 * Vorbis comment keys that hold artwork rather than text: the picture is
 * base64 inside the value, so it belongs in the cover-art warning and not in a
 * tag row that would carry a few hundred kilobytes of it.
 */
const PICTURE_KEYS = new Set(['metadata_block_picture', 'coverart', 'coverartmime']);

/** True when a tag list carries embedded artwork of its own. */
export function hasPictureTag(tags: Array<[string, string]>): boolean {
  return tags.some(([key]) => PICTURE_KEYS.has(key.trim().toLowerCase()));
}

/**
 * Tally tag keys across a selection, most widespread first, identifying tags
 * ahead of technical ones so the interesting rows are at the top.
 */
export function summarizeTags(files: TaggedFile[]): TagSummaryRow[] {
  const counts = new Map<string, { count: number; values: Set<string> }>();
  for (const file of files) {
    const seen = new Set<string>();
    for (const [rawKey, value] of file.tags) {
      const key = rawKey.trim().toLowerCase();
      if (!key || seen.has(key) || PICTURE_KEYS.has(key)) continue;
      seen.add(key);
      const entry = counts.get(key) ?? { count: 0, values: new Set<string>() };
      entry.count += 1;
      entry.values.add(value);
      counts.set(key, entry);
    }
  }
  const rows: TagSummaryRow[] = [...counts.entries()].map(([key, entry]) => ({
    key,
    count: entry.count,
    kind: classifyTag(key),
    sharedValue: entry.values.size === 1 ? [...entry.values][0] : null,
  }));
  return rows.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'identifying' ? -1 : 1;
    if (b.count !== a.count) return b.count - a.count;
    return a.key.localeCompare(b.key);
  });
}

/** Picture codecs that mean a file carries embedded artwork. */
const PICTURE_CODECS = new Set(['mjpeg', 'png', 'bmp', 'gif', 'webp']);

export function hasCoverArt(streams: Array<{ kind: string; codec: string }>): boolean {
  return streams.some((s) => s.kind === 'video' && PICTURE_CODECS.has(s.codec.toLowerCase()));
}

// ------------------------------------------------------------------ Vorbis comments
//
// OGG and Opus keep their tags in a Vorbis comment block, which FFprobe reports
// on the audio stream. `probe_media` only carries `format.tags` across, so those
// files reach the frontend with an empty tag list however much they hold — and a
// privacy tool must never answer "no tags" to a file that names its owner. The
// block lives in the second packet of the stream, so reading it here is a few
// hundred bytes of parsing once the file is in memory.
//
// `audio/tags` keeps its own copy of this reader for the same reason; the two
// tools stay independent folders, so a change here belongs there as well.

const VORBIS_EXTENSIONS = ['ogg', 'oga', 'opus'];

/** Files whose tags `probe_media` cannot see, so they are worth reading directly. */
export function isVorbisContainer(path: string): boolean {
  const name = path.split('/').pop() ?? path;
  const dot = name.lastIndexOf('.');
  return dot > 0 && VORBIS_EXTENSIONS.includes(name.slice(dot + 1).toLowerCase());
}

/** Above this many files the preview stays with what FFprobe reported. */
export const VORBIS_SCAN_LIMIT = 30;

/** And it stops reading once this much has been pulled into memory. */
export const VORBIS_BYTE_BUDGET = 256 * 1024 * 1024;

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
