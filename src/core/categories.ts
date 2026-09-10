import type { Category, CategoryId } from './types';

export const CATEGORIES: Category[] = [
  { id: 'convert', name: 'File Conversion', description: 'Turn any file into another format', icon: 'Repeat', order: 1 },
  { id: 'images', name: 'Images', description: 'Convert, resize, compress and clean up images', icon: 'Image', order: 2 },
  { id: 'video', name: 'Video', description: 'Convert, trim, compress and extract from video', icon: 'Video', order: 3 },
  { id: 'audio', name: 'Audio', description: 'Convert, trim, normalise and tag audio', icon: 'AudioLines', order: 4 },
  { id: 'pdf', name: 'PDF', description: 'Merge, split, compress and convert documents', icon: 'FileText', order: 5 },
  { id: 'qr', name: 'QR & Barcodes', description: 'Generate and scan codes of every kind', icon: 'QrCode', order: 6 },
  { id: 'svg', name: 'SVG', description: 'View, optimise, edit and export vectors', icon: 'PenTool', order: 7 },
  { id: 'text', name: 'Text', description: 'Count, convert, format and compare text', icon: 'Type', order: 8 },
  { id: 'developer', name: 'Developer', description: 'Encoders, hashes, tokens and converters', icon: 'Code2', order: 9 },
  { id: 'files', name: 'Files', description: 'Rename, hash, deduplicate and organise', icon: 'FolderOpen', order: 10 },
  { id: 'generators', name: 'Generators', description: 'IDs, passwords, colours and placeholder data', icon: 'Sparkles', order: 11 },
  { id: 'datetime', name: 'Date & Time', description: 'Timestamps, durations and time zones', icon: 'Clock', order: 12 },
  { id: 'calculators', name: 'Calculators', description: 'Ratios, sizes, bitrates and conversions', icon: 'Calculator', order: 13 },
  { id: 'capture', name: 'Capture & OCR', description: 'Screenshots and text recognition', icon: 'ScanText', order: 14 },
  { id: 'clipboard', name: 'Clipboard', description: 'Save, clean and convert clipboard content', icon: 'Clipboard', order: 15 },
];

const BY_ID = new Map<CategoryId, Category>(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: CategoryId): Category {
  return BY_ID.get(id) ?? CATEGORIES[0];
}

export function categoryName(id: CategoryId): string {
  return BY_ID.get(id)?.name ?? id;
}
