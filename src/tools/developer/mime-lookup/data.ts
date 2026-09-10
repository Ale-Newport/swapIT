/**
 * MIME table for the lookup tool: one entry per media type, with every
 * extension that commonly maps to it, whether the payload is text or binary,
 * and a category so the list can be filtered.
 */

export type MimeCategory = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'font' | 'code' | 'data' | 'other';

export interface MimeEntry {
  mime: string;
  extensions: string[];
  category: MimeCategory;
  /** True when the bytes are human-readable text. */
  text: boolean;
  label: string;
}

export const CATEGORY_LABELS: Record<MimeCategory, string> = {
  image: 'Images',
  video: 'Video',
  audio: 'Audio',
  document: 'Documents',
  archive: 'Archives & binaries',
  font: 'Fonts',
  code: 'Code & markup',
  data: 'Data & feeds',
  other: 'Other',
};

const image = (mime: string, extensions: string[], label: string, text = false): MimeEntry => ({
  mime, extensions, label, category: 'image', text,
});
const video = (mime: string, extensions: string[], label: string): MimeEntry => ({
  mime, extensions, label, category: 'video', text: false,
});
const audio = (mime: string, extensions: string[], label: string): MimeEntry => ({
  mime, extensions, label, category: 'audio', text: false,
});
const doc = (mime: string, extensions: string[], label: string, text = false): MimeEntry => ({
  mime, extensions, label, category: 'document', text,
});
const archive = (mime: string, extensions: string[], label: string): MimeEntry => ({
  mime, extensions, label, category: 'archive', text: false,
});
const font = (mime: string, extensions: string[], label: string): MimeEntry => ({
  mime, extensions, label, category: 'font', text: false,
});
const code = (mime: string, extensions: string[], label: string, text = true): MimeEntry => ({
  mime, extensions, label, category: 'code', text,
});
const data = (mime: string, extensions: string[], label: string, text = true): MimeEntry => ({
  mime, extensions, label, category: 'data', text,
});
const other = (mime: string, extensions: string[], label: string, text = false): MimeEntry => ({
  mime, extensions, label, category: 'other', text,
});

export const MIME_TYPES: MimeEntry[] = [
  // ------------------------------------------------------------- images
  image('image/jpeg', ['jpg', 'jpeg', 'jpe', 'jfif'], 'JPEG image'),
  image('image/png', ['png'], 'PNG image'),
  image('image/gif', ['gif'], 'GIF image'),
  image('image/webp', ['webp'], 'WebP image'),
  image('image/avif', ['avif'], 'AVIF image'),
  image('image/heic', ['heic'], 'HEIC image (Apple)'),
  image('image/heif', ['heif'], 'HEIF image'),
  image('image/apng', ['apng'], 'Animated PNG'),
  image('image/svg+xml', ['svg', 'svgz'], 'SVG vector image', true),
  image('image/bmp', ['bmp'], 'Windows bitmap'),
  image('image/tiff', ['tif', 'tiff'], 'TIFF image'),
  image('image/vnd.microsoft.icon', ['ico'], 'Windows icon'),
  image('image/x-icon', ['ico', 'cur'], 'Icon (legacy type)'),
  image('image/jp2', ['jp2', 'jpf', 'jpx'], 'JPEG 2000'),
  image('image/jxl', ['jxl'], 'JPEG XL'),
  image('image/vnd.adobe.photoshop', ['psd'], 'Photoshop document'),
  image('image/x-adobe-dng', ['dng'], 'Adobe digital negative (RAW)'),
  image('image/x-canon-cr2', ['cr2', 'cr3'], 'Canon RAW'),
  image('image/x-nikon-nef', ['nef'], 'Nikon RAW'),
  image('image/x-sony-arw', ['arw'], 'Sony RAW'),
  image('image/x-panasonic-rw2', ['rw2'], 'Panasonic RAW'),
  image('image/x-olympus-orf', ['orf'], 'Olympus RAW'),
  image('image/x-fuji-raf', ['raf'], 'Fujifilm RAW'),
  image('image/x-portable-pixmap', ['ppm'], 'Portable pixmap', true),
  image('image/x-portable-graymap', ['pgm'], 'Portable graymap', true),
  image('image/x-portable-bitmap', ['pbm'], 'Portable bitmap', true),
  image('image/x-tga', ['tga'], 'Targa image'),
  image('image/x-xcf', ['xcf'], 'GIMP image'),
  image('image/vnd.dwg', ['dwg'], 'AutoCAD drawing'),
  image('image/vnd.dxf', ['dxf'], 'AutoCAD exchange drawing', true),

  // ------------------------------------------------------------- video
  video('video/mp4', ['mp4', 'm4v'], 'MPEG-4 video'),
  video('video/quicktime', ['mov', 'qt'], 'QuickTime movie'),
  video('video/x-msvideo', ['avi'], 'AVI video'),
  video('video/x-matroska', ['mkv'], 'Matroska video'),
  video('video/webm', ['webm'], 'WebM video'),
  video('video/mpeg', ['mpg', 'mpeg', 'mpe', 'm1v'], 'MPEG-1/2 video'),
  video('video/x-ms-wmv', ['wmv'], 'Windows Media video'),
  video('video/x-ms-asf', ['asf'], 'Advanced Systems Format'),
  video('video/x-flv', ['flv'], 'Flash video'),
  video('video/3gpp', ['3gp'], '3GPP mobile video'),
  video('video/3gpp2', ['3g2'], '3GPP2 mobile video'),
  video('video/ogg', ['ogv'], 'Ogg video'),
  video('video/mp2t', ['ts', 'm2ts', 'mts'], 'MPEG transport stream'),
  video('video/x-m4v', ['m4v'], 'iTunes video'),
  video('video/vnd.dlna.mpeg-tts', ['m2t'], 'DLNA transport stream'),
  video('video/x-ms-vob', ['vob'], 'DVD video object'),
  video('video/divx', ['divx'], 'DivX video'),
  video('application/vnd.apple.mpegurl', ['m3u8'], 'HLS playlist'),
  video('application/dash+xml', ['mpd'], 'MPEG-DASH manifest'),

  // ------------------------------------------------------------- audio
  audio('audio/mpeg', ['mp3'], 'MP3 audio'),
  audio('audio/wav', ['wav'], 'WAV audio'),
  audio('audio/x-wav', ['wav'], 'WAV audio (legacy type)'),
  audio('audio/aac', ['aac'], 'AAC audio'),
  audio('audio/mp4', ['m4a', 'm4b'], 'MPEG-4 audio'),
  audio('audio/ogg', ['ogg', 'oga'], 'Ogg audio'),
  audio('audio/opus', ['opus'], 'Opus audio'),
  audio('audio/flac', ['flac'], 'FLAC lossless audio'),
  audio('audio/x-aiff', ['aif', 'aiff', 'aifc'], 'AIFF audio'),
  audio('audio/midi', ['mid', 'midi'], 'MIDI sequence'),
  audio('audio/x-ms-wma', ['wma'], 'Windows Media audio'),
  audio('audio/amr', ['amr'], 'AMR speech audio'),
  audio('audio/webm', ['weba'], 'WebM audio'),
  audio('audio/basic', ['au', 'snd'], 'Sun/NeXT audio'),
  audio('audio/x-caf', ['caf'], 'Core Audio format'),
  audio('audio/vnd.dolby.dd-raw', ['ac3'], 'Dolby Digital audio'),
  audio('audio/x-matroska', ['mka'], 'Matroska audio'),
  audio('audio/x-musepack', ['mpc'], 'Musepack audio'),
  audio('audio/x-monkeys-audio', ['ape'], 'Monkey’s Audio'),
  audio('audio/x-mpegurl', ['m3u'], 'M3U playlist'),

  // ------------------------------------------------------------- documents
  doc('application/pdf', ['pdf'], 'PDF document'),
  doc('application/msword', ['doc', 'dot'], 'Word 97–2003 document'),
  doc('application/vnd.openxmlformats-officedocument.wordprocessingml.document', ['docx'], 'Word document'),
  doc('application/vnd.openxmlformats-officedocument.wordprocessingml.template', ['dotx'], 'Word template'),
  doc('application/vnd.ms-excel', ['xls', 'xlt'], 'Excel 97–2003 workbook'),
  doc('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ['xlsx'], 'Excel workbook'),
  doc('application/vnd.ms-excel.sheet.macroenabled.12', ['xlsm'], 'Excel macro workbook'),
  doc('application/vnd.ms-powerpoint', ['ppt', 'pps'], 'PowerPoint 97–2003 deck'),
  doc('application/vnd.openxmlformats-officedocument.presentationml.presentation', ['pptx'], 'PowerPoint deck'),
  doc('application/vnd.oasis.opendocument.text', ['odt'], 'OpenDocument text'),
  doc('application/vnd.oasis.opendocument.spreadsheet', ['ods'], 'OpenDocument spreadsheet'),
  doc('application/vnd.oasis.opendocument.presentation', ['odp'], 'OpenDocument presentation'),
  doc('application/vnd.oasis.opendocument.graphics', ['odg'], 'OpenDocument drawing'),
  doc('application/rtf', ['rtf'], 'Rich text format', true),
  doc('text/plain', ['txt', 'text', 'log', 'nfo'], 'Plain text', true),
  doc('text/markdown', ['md', 'markdown', 'mdown'], 'Markdown', true),
  doc('text/x-rst', ['rst'], 'reStructuredText', true),
  doc('application/x-tex', ['tex'], 'TeX source', true),
  doc('application/x-latex', ['latex'], 'LaTeX source', true),
  doc('application/epub+zip', ['epub'], 'EPUB e-book'),
  doc('application/x-mobipocket-ebook', ['mobi', 'prc'], 'Mobipocket e-book'),
  doc('application/vnd.amazon.ebook', ['azw', 'azw3'], 'Kindle e-book'),
  doc('application/vnd.apple.pages', ['pages'], 'Apple Pages document'),
  doc('application/vnd.apple.numbers', ['numbers'], 'Apple Numbers spreadsheet'),
  doc('application/vnd.apple.keynote', ['key'], 'Apple Keynote deck'),
  doc('application/postscript', ['ps', 'eps', 'ai'], 'PostScript / Illustrator'),
  doc('application/vnd.visio', ['vsd', 'vsdx'], 'Visio diagram'),
  doc('application/vnd.ms-project', ['mpp'], 'Microsoft Project plan'),
  doc('application/vnd.ms-outlook', ['msg'], 'Outlook message'),
  doc('message/rfc822', ['eml', 'mht'], 'Email message', true),
  doc('application/vnd.oasis.opendocument.formula', ['odf'], 'OpenDocument formula'),
  doc('application/x-abiword', ['abw'], 'AbiWord document'),
  doc('application/vnd.sun.xml.writer', ['sxw'], 'StarOffice document'),

  // ------------------------------------------------------------- archives & binaries
  archive('application/zip', ['zip', 'zipx'], 'ZIP archive'),
  archive('application/x-7z-compressed', ['7z'], '7-Zip archive'),
  archive('application/vnd.rar', ['rar'], 'RAR archive'),
  archive('application/x-tar', ['tar'], 'TAR archive'),
  archive('application/gzip', ['gz', 'tgz'], 'Gzip archive'),
  archive('application/x-bzip2', ['bz2', 'tbz2'], 'Bzip2 archive'),
  archive('application/x-xz', ['xz'], 'XZ archive'),
  archive('application/zstd', ['zst'], 'Zstandard archive'),
  archive('application/x-lzma', ['lzma'], 'LZMA archive'),
  archive('application/x-compress', ['z'], 'Unix compress archive'),
  archive('application/x-cpio', ['cpio'], 'cpio archive'),
  archive('application/java-archive', ['jar'], 'Java archive'),
  archive('application/x-apple-diskimage', ['dmg'], 'macOS disk image'),
  archive('application/x-iso9660-image', ['iso'], 'ISO disc image'),
  archive('application/vnd.debian.binary-package', ['deb'], 'Debian package'),
  archive('application/x-rpm', ['rpm'], 'RPM package'),
  archive('application/vnd.android.package-archive', ['apk'], 'Android package'),
  archive('application/x-msdownload', ['exe', 'dll'], 'Windows executable'),
  archive('application/vnd.microsoft.portable-executable', ['exe'], 'Portable executable'),
  archive('application/x-msi', ['msi'], 'Windows installer'),
  archive('application/x-xpinstall', ['xpi'], 'Browser extension package'),
  archive('application/wasm', ['wasm'], 'WebAssembly module'),
  archive('application/x-shockwave-flash', ['swf'], 'Flash movie'),
  archive('application/x-mach-binary', ['dylib', 'bundle'], 'Mach-O binary'),
  archive('application/vnd.apple.installer+xml', ['pkg', 'mpkg'], 'macOS installer package'),

  // ------------------------------------------------------------- fonts
  font('font/ttf', ['ttf'], 'TrueType font'),
  font('font/otf', ['otf'], 'OpenType font'),
  font('font/woff', ['woff'], 'Web Open Font Format'),
  font('font/woff2', ['woff2'], 'WOFF 2 web font'),
  font('font/collection', ['ttc'], 'TrueType collection'),
  font('font/sfnt', ['sfnt'], 'SFNT font'),
  font('application/vnd.ms-fontobject', ['eot'], 'Embedded OpenType font'),
  font('application/x-font-type1', ['pfb', 'pfm'], 'PostScript Type 1 font'),
  font('application/x-font-bdf', ['bdf'], 'BDF bitmap font'),

  // ------------------------------------------------------------- code & markup
  code('text/html', ['html', 'htm', 'xhtml'], 'HTML document'),
  code('application/xhtml+xml', ['xhtml', 'xht'], 'XHTML document'),
  code('text/css', ['css'], 'Cascading style sheet'),
  code('text/javascript', ['js', 'mjs', 'cjs'], 'JavaScript'),
  code('application/typescript', ['ts', 'mts', 'cts'], 'TypeScript'),
  code('text/jsx', ['jsx', 'tsx'], 'JSX / TSX component'),
  code('application/xml', ['xml'], 'XML document'),
  code('text/xml', ['xml', 'xsl', 'xsd'], 'XML (text form)'),
  code('text/x-python', ['py', 'pyw'], 'Python source'),
  code('text/x-java-source', ['java'], 'Java source'),
  code('text/x-c', ['c', 'h'], 'C source'),
  code('text/x-c++src', ['cpp', 'cc', 'cxx', 'hpp', 'hh'], 'C++ source'),
  code('text/x-csharp', ['cs'], 'C# source'),
  code('text/x-go', ['go'], 'Go source'),
  code('text/x-rust', ['rs'], 'Rust source'),
  code('text/x-php', ['php', 'phtml'], 'PHP source'),
  code('text/x-ruby', ['rb', 'erb'], 'Ruby source'),
  code('text/x-swift', ['swift'], 'Swift source'),
  code('text/x-kotlin', ['kt', 'kts'], 'Kotlin source'),
  code('text/x-scala', ['scala', 'sc'], 'Scala source'),
  code('text/x-perl', ['pl', 'pm'], 'Perl source'),
  code('text/x-lua', ['lua'], 'Lua source'),
  code('text/x-haskell', ['hs'], 'Haskell source'),
  code('text/x-r', ['r', 'rmd'], 'R source'),
  code('text/x-dart', ['dart'], 'Dart source'),
  code('text/x-objectivec', ['m', 'mm'], 'Objective-C source'),
  code('text/x-shellscript', ['sh', 'bash', 'zsh', 'fish'], 'Shell script'),
  code('application/x-bat', ['bat', 'cmd'], 'Windows batch file'),
  code('application/x-powershell', ['ps1'], 'PowerShell script'),
  code('text/x-sql', ['sql'], 'SQL script'),
  code('text/x-diff', ['diff', 'patch'], 'Unified diff'),
  code('text/x-dockerfile', ['dockerfile'], 'Dockerfile'),
  code('text/x-makefile', ['mk', 'makefile'], 'Makefile'),
  code('text/x-ini', ['ini', 'cfg', 'conf'], 'INI configuration'),
  code('application/x-httpd-php', ['php3', 'php4'], 'PHP (server-parsed)'),
  code('application/graphql', ['graphql', 'gql'], 'GraphQL document'),
  code('text/x-vb', ['vb', 'bas'], 'Visual Basic source'),
  code('text/x-clojure', ['clj', 'cljs'], 'Clojure source'),
  code('text/x-elixir', ['ex', 'exs'], 'Elixir source'),
  code('text/x-erlang', ['erl'], 'Erlang source'),
  code('text/x-julia', ['jl'], 'Julia source'),
  code('text/x-solidity', ['sol'], 'Solidity contract'),
  code('text/x-zig', ['zig'], 'Zig source'),

  // ------------------------------------------------------------- data & feeds
  data('application/json', ['json'], 'JSON data'),
  data('application/ld+json', ['jsonld'], 'JSON-LD linked data'),
  data('application/x-ndjson', ['ndjson', 'jsonl'], 'Newline-delimited JSON'),
  data('application/json5', ['json5'], 'JSON5 data'),
  data('text/csv', ['csv'], 'Comma-separated values'),
  data('text/tab-separated-values', ['tsv', 'tab'], 'Tab-separated values'),
  data('application/yaml', ['yaml', 'yml'], 'YAML document'),
  data('application/toml', ['toml'], 'TOML configuration'),
  data('application/rss+xml', ['rss'], 'RSS feed'),
  data('application/atom+xml', ['atom'], 'Atom feed'),
  data('application/vnd.geo+json', ['geojson'], 'GeoJSON geometry'),
  data('application/gpx+xml', ['gpx'], 'GPS exchange track'),
  data('application/vnd.google-earth.kml+xml', ['kml'], 'Google Earth KML'),
  data('application/vnd.sqlite3', ['sqlite', 'sqlite3', 'db'], 'SQLite database', false),
  data('application/vnd.apache.parquet', ['parquet'], 'Parquet columnar data', false),
  data('application/vnd.apache.arrow.file', ['arrow'], 'Arrow columnar data', false),
  data('application/x-protobuf', ['pb', 'proto'], 'Protocol buffers', false),
  data('application/x-msgpack', ['msgpack', 'mpk'], 'MessagePack', false),
  data('application/cbor', ['cbor'], 'CBOR binary data', false),
  data('application/x-bson', ['bson'], 'BSON document', false),
  data('text/vcard', ['vcf', 'vcard'], 'Contact card'),
  data('text/calendar', ['ics', 'ical'], 'Calendar event'),
  data('text/vtt', ['vtt'], 'WebVTT subtitles'),
  data('application/x-subrip', ['srt'], 'SubRip subtitles'),
  data('application/ttml+xml', ['ttml', 'dfxp'], 'TTML subtitles'),
  data('application/vnd.ms-excel.addin.macroenabled.12', ['xlam'], 'Excel add-in', false),

  // ------------------------------------------------------------- other
  other('application/octet-stream', ['bin', 'dat'], 'Unknown binary data'),
  other('application/x-www-form-urlencoded', [], 'HTML form submission', true),
  other('multipart/form-data', [], 'Multipart form upload'),
  other('text/event-stream', [], 'Server-sent events', true),
  other('application/manifest+json', ['webmanifest'], 'Web app manifest', true),
  other('application/x-bittorrent', ['torrent'], 'BitTorrent metainfo'),
  other('application/vnd.apple.pkpass', ['pkpass'], 'Apple Wallet pass'),
  other('application/pgp-signature', ['asc', 'sig'], 'PGP signature', true),
  other('application/pgp-encrypted', ['pgp'], 'PGP encrypted data'),
  other('application/x-x509-ca-cert', ['crt', 'cer', 'pem'], 'X.509 certificate', true),
  other('application/x-pkcs12', ['p12', 'pfx'], 'PKCS #12 key store'),
  other('application/pkcs7-mime', ['p7m', 'p7c'], 'PKCS #7 message'),
  other('model/gltf+json', ['gltf'], 'glTF 3D scene', true),
  other('model/gltf-binary', ['glb'], 'Binary glTF 3D scene'),
  other('model/stl', ['stl'], 'STL 3D model'),
  other('model/obj', ['obj'], 'Wavefront 3D model', true),
  other('model/vnd.usdz+zip', ['usdz'], 'USDZ 3D scene'),
  other('application/vnd.apple.mpegurl.audio', ['m3u8'], 'HLS audio playlist', true),
  other('application/x-ms-shortcut', ['lnk'], 'Windows shortcut'),
  other('application/x-desktop', ['desktop'], 'Linux desktop entry', true),
];

export const TOTAL_TYPES = MIME_TYPES.length;

function normaliseExt(text: string): string {
  return text.trim().toLowerCase().replace(/^[.*]+/, '');
}

/** All entries whose extension list contains `ext` (with or without the dot). */
export function byExtension(ext: string): MimeEntry[] {
  const needle = normaliseExt(ext);
  if (!needle) return [];
  return MIME_TYPES.filter((entry) => entry.extensions.includes(needle));
}

/** All entries whose media type matches or contains `mime`. */
export function byMime(mime: string): MimeEntry[] {
  const needle = mime.trim().toLowerCase();
  if (!needle) return [];
  const exact = MIME_TYPES.filter((entry) => entry.mime === needle);
  return exact.length > 0 ? exact : MIME_TYPES.filter((entry) => entry.mime.includes(needle));
}

export type SearchMode = 'any' | 'extension' | 'mime';

export function searchMimes(
  query: string,
  mode: SearchMode,
  category: MimeCategory | 'all',
): MimeEntry[] {
  const needle = query.trim().toLowerCase();
  const extNeedle = normaliseExt(query);

  return MIME_TYPES.filter((entry) => {
    if (category !== 'all' && entry.category !== category) return false;
    if (!needle) return true;
    const extHit = entry.extensions.some((e) => e === extNeedle || e.startsWith(extNeedle));
    const mimeHit = entry.mime.includes(needle);
    const labelHit = entry.label.toLowerCase().includes(needle);
    if (mode === 'extension') return extHit;
    if (mode === 'mime') return mimeHit;
    return extHit || mimeHit || labelHit;
  }).sort((a, b) => {
    if (!needle) return 0;
    // Exact hits first, so "png" does not bury image/png under image/apng.
    const score = (entry: MimeEntry): number =>
      (entry.extensions.includes(extNeedle) ? 0 : 1) + (entry.mime === needle ? 0 : 1);
    return score(a) - score(b);
  });
}
