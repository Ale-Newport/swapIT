/** One row of what `read_metadata` returns. Mirrors `MetadataEntry` in Rust. */
export interface MetadataEntry {
  group: string;
  tag: string;
  value: string;
}

export interface GpsFix {
  latitude: number;
  longitude: number;
  /** The raw EXIF strings the numbers were parsed from. */
  rawLatitude: string;
  rawLongitude: string;
}

export type BucketLabel = 'Location' | 'Camera & lens' | 'Date & time' | 'Everything else';

export interface MetadataSummary {
  total: number;
  gps: GpsFix | null;
  /** Every location-related entry, even when the coordinates could not be parsed. */
  locationEntries: MetadataEntry[];
  camera: string | null;
  lens: string | null;
  captured: string | null;
  software: string | null;
  serial: string | null;
  buckets: Array<{ label: BucketLabel; count: number }>;
}

const LOCATION = /^gps|^location|geolocation/i;
const CAMERA =
  /^(make|model|lensmake|lensmodel|lensspecification|lensinfo|lensid|lens|bodyserialnumber|serialnumber|internalserialnumber|cameraownername|ownername|hostcomputer|software|creatortool)$/i;
/**
 * Anchored on purpose: an unanchored `/(date|time)/` swallows `ExposureTime`,
 * `ShutterSpeedTime` and friends, which are camera settings rather than a
 * timestamp. Mirrors the rule the metadata viewer uses.
 */
const DATE = /(datetime|^date|^time|^offsettime|^subsectime|^createdate|^modifydate)/i;

/** Which of the four "what am I giving away" buckets a tag falls into. */
export function bucketFor(tag: string): BucketLabel {
  if (LOCATION.test(tag)) return 'Location';
  if (CAMERA.test(tag)) return 'Camera & lens';
  if (DATE.test(tag)) return 'Date & time';
  return 'Everything else';
}

function hemisphereSign(text: string): -1 | 1 | 0 {
  if (/\b(s|south|w|west)\b/i.test(text)) return -1;
  if (/\b(n|north|e|east)\b/i.test(text)) return 1;
  return 0;
}

/**
 * EXIF coordinates arrive in wildly different shapes depending on whether the
 * built-in parser or ExifTool produced them: `43 deg 28 min 2.88 sec N`,
 * `43 deg 28' 2.88" W`, `-3.802644` or `43.4675 North`. All of them decode to
 * signed decimal degrees.
 */
export function parseCoordinate(value: string, ref?: string): number | null {
  const numbers = value.match(/-?\d+(?:\.\d+)?/g);
  if (!numbers?.length) return null;
  const parts = numbers.slice(0, 3).map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  const [degrees, minutes = 0, seconds = 0] = parts;
  const magnitude = Math.abs(degrees) + Math.abs(minutes) / 60 + Math.abs(seconds) / 3600;
  if (magnitude > 180) return null;
  const sign = hemisphereSign(`${value} ${ref ?? ''}`);
  const negative = sign === -1 || (sign === 0 && degrees < 0);
  return Number(((negative ? -1 : 1) * magnitude).toFixed(6));
}

export function findEntry(entries: MetadataEntry[], tag: string): MetadataEntry | undefined {
  return entries.find((e) => e.tag.toLowerCase() === tag.toLowerCase());
}

function valueOf(entries: MetadataEntry[], tag: string): string | null {
  const found = findEntry(entries, tag)?.value.trim();
  return found ? found : null;
}

/** "43.467467, -3.802644" — the form you can paste straight into a map search. */
export function formatCoordinates(fix: GpsFix): string {
  return `${fix.latitude.toFixed(6)}, ${fix.longitude.toFixed(6)}`;
}

function readGps(entries: MetadataEntry[]): GpsFix | null {
  const latRaw = valueOf(entries, 'GPSLatitude');
  const lonRaw = valueOf(entries, 'GPSLongitude');
  if (latRaw && lonRaw) {
    const latitude = parseCoordinate(latRaw, valueOf(entries, 'GPSLatitudeRef') ?? undefined);
    const longitude = parseCoordinate(lonRaw, valueOf(entries, 'GPSLongitudeRef') ?? undefined);
    if (latitude !== null && longitude !== null) {
      return { latitude, longitude, rawLatitude: latRaw, rawLongitude: lonRaw };
    }
  }
  // ExifTool's composite tag packs both halves into one string.
  const position = valueOf(entries, 'GPSPosition');
  if (position) {
    const [latPart, lonPart] = position.split(',');
    if (latPart && lonPart) {
      const latitude = parseCoordinate(latPart);
      const longitude = parseCoordinate(lonPart);
      if (latitude !== null && longitude !== null) {
        return {
          latitude,
          longitude,
          rawLatitude: latPart.trim(),
          rawLongitude: lonPart.trim(),
        };
      }
    }
  }
  return null;
}

/** What a person is actually handing over when they share this file untouched. */
export function summarizeMetadata(entries: MetadataEntry[]): MetadataSummary {
  const counts = new Map<BucketLabel, number>();
  for (const entry of entries) {
    const bucket = bucketFor(entry.tag);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  const order: BucketLabel[] = ['Location', 'Camera & lens', 'Date & time', 'Everything else'];
  const make = valueOf(entries, 'Make');
  const model = valueOf(entries, 'Model');
  const camera = model && make && !model.toLowerCase().startsWith(make.toLowerCase())
    ? `${make} ${model}`
    : (model ?? make);

  return {
    total: entries.length,
    gps: readGps(entries),
    locationEntries: entries.filter((e) => bucketFor(e.tag) === 'Location'),
    camera,
    lens: valueOf(entries, 'LensModel') ?? valueOf(entries, 'LensMake'),
    captured:
      valueOf(entries, 'DateTimeOriginal') ??
      valueOf(entries, 'DateTimeDigitized') ??
      valueOf(entries, 'DateTime'),
    software: valueOf(entries, 'Software') ?? valueOf(entries, 'HostComputer'),
    serial: valueOf(entries, 'BodySerialNumber') ?? valueOf(entries, 'SerialNumber'),
    buckets: order
      .map((label) => ({ label, count: counts.get(label) ?? 0 }))
      .filter((b) => b.count > 0),
  };
}
