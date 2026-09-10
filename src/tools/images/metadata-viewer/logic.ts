/** One row of what `read_metadata` returns. Mirrors `MetadataEntry` in Rust. */
export interface MetadataEntry {
  group: string;
  tag: string;
  value: string;
}

/** What `image_info` returns for a single file. */
export interface ImageInfo {
  path: string;
  name: string;
  width: number;
  height: number;
  megapixels: number;
  aspectRatio: string;
  colorType: string;
  format: string;
  size: number;
  hasAlpha: boolean;
}

export interface MetadataGroup {
  name: string;
  entries: MetadataEntry[];
}

export const LOCATION_GROUP = 'Location';

const RULES: Array<[RegExp, string]> = [
  [/^gps|^location|geolocation/i, LOCATION_GROUP],
  [
    /^(make|model|lens(make|model|info|id|serialnumber|specification)?|bodyserialnumber|serialnumber|internalserialnumber|cameraownername|ownername|hostcomputer|software|creatortool|firmware)$/i,
    'Camera & lens',
  ],
  [
    /^(exposure|aperture|shutter|fnumber|iso|photographicsensitivity|sensitivitytype|recommendedexposureindex|focal|flash|meteringmode|whitebalance|brightness|lightsource|scene|subject|sensingmethod|digitalzoom|contrast|saturation|sharpness|gaincontrol|customrendered|filesource|maxaperture)/i,
    'Exposure',
  ],
  [/(datetime|^date|^time|^offsettime|^subsectime|^createdate|^modifydate)/i, 'Date & time'],
  [
    /^(pixel|imagewidth|imagelength|imageheight|orientation|xresolution|yresolution|resolutionunit|colorspace|components|ycbcr|compression|bitspersample|samplesperpixel|photometric|planarconfiguration|interopindex|interoperability|thumbnail|jpeginterchange|referenceblackwhite|primarychromaticities|whitepoint|transferfunction)/i,
    'Image',
  ],
  [
    /^(artist|copyright|rights|creator|byline|credit|imagedescription|description|usercomment|xp(author|comment|title|keywords|subject)|rating|title|keywords|caption)/i,
    'Author & rights',
  ],
];

const KNOWN_ORDER = [
  LOCATION_GROUP,
  'Camera & lens',
  'Exposure',
  'Date & time',
  'Image',
  'Author & rights',
];

/**
 * The raw `group` is an IFD number from the built-in parser (`In(0)`) and a real
 * group name from ExifTool (`EXIF`, `XMP`, `IPTC`). Only the latter is worth
 * showing, so IFD numbers are dropped.
 */
export function normalizeSourceGroup(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^in\(\d+\)$/i.test(value)) return null;
  if (/^(primary|thumbnail|exif|ifd\d*)$/i.test(value)) return null;
  return value;
}

/** The display group an entry belongs to — driven by the tag, not the IFD. */
export function classifyEntry(entry: MetadataEntry): string {
  for (const [pattern, group] of RULES) {
    if (pattern.test(entry.tag)) return group;
  }
  return normalizeSourceGroup(entry.group) ?? 'Other';
}

/** Group for display: known groups in a fixed order, then extras, then Other. */
export function groupMetadata(entries: MetadataEntry[]): MetadataGroup[] {
  const map = new Map<string, MetadataEntry[]>();
  for (const entry of entries) {
    const name = classifyEntry(entry);
    const bucket = map.get(name);
    if (bucket) bucket.push(entry);
    else map.set(name, [entry]);
  }
  const rank = (name: string) => {
    const known = KNOWN_ORDER.indexOf(name);
    if (known >= 0) return known;
    return name === 'Other' ? 1000 : 500;
  };
  return [...map.entries()]
    .map(([name, groupEntries]) => ({ name, entries: groupEntries }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

/** Case-insensitive substring match across tag, value and both group names. */
export function filterMetadata(entries: MetadataEntry[], query: string): MetadataEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((entry) =>
    `${entry.tag} ${entry.value} ${entry.group} ${classifyEntry(entry)}`.toLowerCase().includes(q),
  );
}

/**
 * A JSON shape a person can paste somewhere useful: grouped, with repeated tags
 * disambiguated rather than silently overwritten.
 */
export function metadataToJson(
  entries: MetadataEntry[],
  info?: ImageInfo | null,
): Record<string, unknown> {
  const grouped: Record<string, Record<string, string>> = {};
  for (const group of groupMetadata(entries)) {
    const bucket: Record<string, string> = {};
    for (const entry of group.entries) {
      let key = entry.tag;
      let n = 2;
      while (key in bucket) key = `${entry.tag} (${n++})`;
      bucket[key] = entry.value;
    }
    grouped[group.name] = bucket;
  }
  const out: Record<string, unknown> = {};
  if (info) {
    out.file = {
      name: info.name,
      format: info.format,
      bytes: info.size,
      width: info.width,
      height: info.height,
      megapixels: info.megapixels,
      aspectRatio: info.aspectRatio,
      colorType: info.colorType,
      hasAlpha: info.hasAlpha,
    };
  }
  out.metadata = grouped;
  return out;
}
