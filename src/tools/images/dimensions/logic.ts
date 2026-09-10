/** Table maths for the dimensions report: sorting, totals and CSV export. */

/** One entry of the `image_info` backend response. */
export interface ImageInfoRow {
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

export type SortKey = 'name' | 'width' | 'megapixels' | 'aspect' | 'color' | 'alpha' | 'size';
export type SortDirection = 'asc' | 'desc';

/** The `image` crate reports its own enum names; turn them into English. */
export function humanColorType(raw: string): string {
  const map: Record<string, string> = {
    L8: 'Grayscale 8-bit',
    La8: 'Grayscale + alpha 8-bit',
    Rgb8: 'RGB 8-bit',
    Rgba8: 'RGBA 8-bit',
    L16: 'Grayscale 16-bit',
    La16: 'Grayscale + alpha 16-bit',
    Rgb16: 'RGB 16-bit',
    Rgba16: 'RGBA 16-bit',
    Rgb32F: 'RGB 32-bit float',
    Rgba32F: 'RGBA 32-bit float',
  };
  return map[raw] ?? raw;
}

export function orientation(row: Pick<ImageInfoRow, 'width' | 'height'>): 'Square' | 'Landscape' | 'Portrait' {
  if (row.width === row.height) return 'Square';
  return row.width > row.height ? 'Landscape' : 'Portrait';
}

function sortValue(row: ImageInfoRow, key: SortKey): number | string {
  switch (key) {
    case 'name':
      return row.name.toLowerCase();
    case 'width':
      return row.width * 100000 + row.height;
    case 'megapixels':
      return row.megapixels;
    case 'aspect':
      return row.height === 0 ? 0 : row.width / row.height;
    case 'color':
      return humanColorType(row.colorType).toLowerCase();
    case 'alpha':
      return row.hasAlpha ? 1 : 0;
    case 'size':
      return row.size;
  }
}

/** Stable sort — equal rows keep the order the files were added in. */
export function sortRows(rows: ImageInfoRow[], key: SortKey, direction: SortDirection): ImageInfoRow[] {
  const factor = direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const va = sortValue(a.row, key);
      const vb = sortValue(b.row, key);
      let cmp: number;
      if (typeof va === 'string' && typeof vb === 'string') cmp = va.localeCompare(vb);
      else cmp = Number(va) - Number(vb);
      if (cmp !== 0) return cmp * factor;
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}

/** Clicking a column sorts it ascending, clicking it again flips the direction. */
export function nextSort(
  current: { key: SortKey; direction: SortDirection },
  key: SortKey,
): { key: SortKey; direction: SortDirection } {
  if (current.key !== key) {
    return { key, direction: key === 'name' || key === 'color' ? 'asc' : 'desc' };
  }
  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}

export function totals(rows: ImageInfoRow[]): { count: number; pixels: number; bytes: number } {
  return rows.reduce(
    (acc, row) => ({
      count: acc.count + 1,
      pixels: acc.pixels + row.width * row.height,
      bytes: acc.bytes + row.size,
    }),
    { count: 0, pixels: 0, bytes: 0 },
  );
}

function csvCell(value: string | number | boolean): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_HEADER = [
  'Name',
  'Width',
  'Height',
  'Megapixels',
  'Aspect ratio',
  'Orientation',
  'Colour type',
  'Alpha',
  'Format',
  'Size (bytes)',
  'Path',
];

export function toCsv(rows: ImageInfoRow[]): string {
  const lines = [CSV_HEADER.join(',')];
  for (const row of rows) {
    lines.push(
      [
        csvCell(row.name),
        row.width,
        row.height,
        row.megapixels.toFixed(2),
        csvCell(row.aspectRatio),
        orientation(row),
        csvCell(humanColorType(row.colorType)),
        row.hasAlpha ? 'yes' : 'no',
        csvCell(row.format),
        row.size,
        csvCell(row.path),
      ].join(','),
    );
  }
  return lines.join('\n');
}
