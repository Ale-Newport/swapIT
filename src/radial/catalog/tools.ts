import { convertFileSrc } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { readFile } from '@tauri-apps/plugin-fs';
import { call } from '@/core/bridge';
import { formatBytes, formatDuration } from '@/core/format';
import { setDesktopPicture } from '@/core/quick';
import { saveText } from '@/core/save';
import type { FileResult } from '@/core/types';
import { decodeImageSource } from '@/tools/qr/scan/decode';
import { isOpenableUrl, toOpenableUrl } from '@/tools/qr/scan/logic';
import type { ActionCtx, ActionResult, RadialItem } from '../model';
import { copyText, ocrLanguages } from '../system';
import { isKind, missing, pluralize, stemOf, task, ui, type CatalogInput } from './util';

interface OcrResult {
  source: string;
  text: string;
  characters: number;
  words: number;
}

interface PaletteColor {
  hex: string;
  percentage: number;
}

interface FileHashes {
  path: string;
  name: string;
  sha256?: string | null;
}

interface MediaProbe {
  name: string;
  size: number;
  duration?: number | null;
  formatLong: string;
  video?: { codec: string; width?: number | null; height?: number | null; fps?: number | null } | null;
  audio?: { codec: string; sampleRate?: number | null; channels?: number | null } | null;
}

interface FolderReport {
  totalSize: number;
  fileCount: number;
  dirCount: number;
}

interface ArchiveEntry {
  name: string;
  size: number;
  isDir: boolean;
}

function ocrItem(input: CatalogInput): RadialItem {
  return task({
    id: 'tool:ocr',
    label: 'Read text',
    title: 'Recognise the text',
    hint: 'OCR — saved as .txt and copied',
    icon: 'ScanText',
    needs: ['tesseract'],
    unavailable: missing(input.bins, 'tesseract'),
    keywords: ['ocr', 'text', 'recognise', 'scan', 'extract text', 'leer texto', 'reconocer', 'extraer texto'],
    run: async (ctx): Promise<ActionResult> => {
      const languages = await ocrLanguages();
      const found = await ctx.data<OcrResult[]>({
        command: 'ocr_files',
        label: `Read text from ${pluralize(ctx.files.length, 'file')}`,
        total: ctx.files.length,
        args: { inputs: ctx.paths, opts: { languages, psm: 3, dpi: 300 } },
      });
      const saved: FileResult[] = [];
      for (const r of found) {
        if (!r.text.trim()) continue;
        saved.push(await saveText(r.text, { source: r.source, output: ctx.output(), ext: 'txt' }));
      }
      const all = found.map((r) => r.text.trim()).filter(Boolean).join('\n\n');
      if (!all) return { title: 'No text found', detail: 'Try a sharper or larger image.' };
      await copyText(all);
      const words = found.reduce((n, r) => n + r.words, 0);
      return {
        title: 'Text recognised',
        detail: `${words.toLocaleString('en-US')} words — copied to the clipboard`,
        snippet: all.slice(0, 240),
        results: saved,
      };
    },
  });
}

function qrItem(): RadialItem {
  return task({
    id: 'tool:qr-scan',
    label: 'Scan QR',
    title: 'Read a QR code or barcode',
    hint: 'Looks for a code in the picture',
    icon: 'QrCode',
    keywords: ['qr', 'barcode', 'scan', 'code', 'escanear', 'código'],
    run: async (ctx): Promise<ActionResult> => {
      const lines: string[] = [];
      for (const file of ctx.files) {
        const text = await decodeImageSource(convertFileSrc(file.path));
        if (text) lines.push(text);
      }
      if (lines.length === 0) return { title: 'No code found', detail: 'The picture needs a clear, whole QR code.' };
      const text = lines.join('\n');
      await copyText(text);
      const url = lines.length === 1 && isOpenableUrl(text) ? toOpenableUrl(text) : null;
      return {
        title: lines.length === 1 ? 'QR code read' : `${lines.length} codes read`,
        detail: 'Copied to the clipboard',
        snippet: text.slice(0, 240),
        actions: url
          ? [
              {
                id: 'open-url',
                label: 'Open link',
                icon: 'ExternalLink',
                primary: true,
                run: () => openUrl(url),
              },
            ]
          : undefined,
      };
    },
  });
}

function paletteItem(): RadialItem {
  return task({
    id: 'tool:palette',
    label: 'Colours',
    title: 'Pull a colour palette',
    hint: 'Six dominant colours, copied as hex',
    icon: 'Palette',
    keywords: ['palette', 'colors', 'colours', 'hex', 'paleta', 'colores'],
    run: async (ctx): Promise<ActionResult> => {
      const colors = await ctx.data<PaletteColor[]>({
        command: 'extract_palette',
        label: 'Extract colours',
        args: { input: ctx.paths[0], count: 6 },
      });
      const hex = colors.map((c) => c.hex.toUpperCase()).join('  ');
      await copyText(colors.map((c) => c.hex.toUpperCase()).join(', '));
      return { title: 'Palette copied', detail: hex, snippet: hex };
    },
  });
}

function base64Item(): RadialItem {
  return task({
    id: 'tool:base64',
    label: 'Base64',
    title: 'Copy as a data URL',
    hint: 'Embed the image straight in HTML or CSS',
    icon: 'Binary',
    keywords: ['base64', 'data url', 'embed', 'inline', 'datauri'],
    run: async (ctx): Promise<ActionResult> => {
      const file = ctx.files[0];
      if (file.size > 6 * 1024 * 1024) throw new Error('That image is over 6 MB — a data URL that large would not be useful.');
      const bytes = await readFile(file.path);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      const dataUrl = `data:${file.mime};base64,${btoa(binary)}`;
      await copyText(dataUrl);
      return {
        title: 'Data URL copied',
        detail: `${formatBytes(dataUrl.length)} of text on the clipboard`,
        snippet: `${dataUrl.slice(0, 96)}…`,
      };
    },
  });
}

function hashItem(): RadialItem {
  return task({
    id: 'tool:hash',
    label: 'Checksum',
    title: 'SHA-256 checksum',
    hint: 'Copied to the clipboard',
    icon: 'Fingerprint',
    keywords: ['hash', 'sha256', 'sha', 'checksum', 'verify', 'integrity', 'huella'],
    run: async (ctx): Promise<ActionResult> => {
      const hashes = await ctx.data<FileHashes[]>({
        command: 'hash_files',
        label: `Checksum of ${pluralize(ctx.files.length, 'file')}`,
        total: ctx.files.length,
        args: { inputs: ctx.paths, algorithms: ['sha256'] },
      });
      const text = hashes.length === 1 ? (hashes[0].sha256 ?? '') : hashes.map((h) => `${h.sha256}  ${h.name}`).join('\n');
      await copyText(text);
      return { title: 'SHA-256 copied', detail: hashes.length === 1 ? hashes[0].name : pluralize(hashes.length, 'file'), snippet: text.slice(0, 240) };
    },
  });
}

function wallpaperItem(): RadialItem {
  return task({
    id: 'tool:wallpaper',
    label: 'Wallpaper',
    title: 'Set as desktop picture',
    hint: 'On every display',
    icon: 'MonitorUp',
    keywords: ['wallpaper', 'desktop', 'background', 'fondo', 'escritorio'],
    run: async (ctx): Promise<ActionResult> => {
      await setDesktopPicture(ctx.paths[0]);
      return { title: 'Desktop picture set', detail: ctx.files[0].name };
    },
  });
}

function probeItem(input: CatalogInput): RadialItem {
  return task({
    id: 'tool:info',
    label: 'Info',
    title: 'Codec, size and length',
    hint: 'Copied as a short summary',
    icon: 'Info',
    needs: ['ffprobe'],
    unavailable: missing(input.bins, 'ffprobe'),
    keywords: ['info', 'details', 'codec', 'duration', 'resolution', 'información'],
    run: async (ctx): Promise<ActionResult> => {
      const infos = await ctx.data<MediaProbe[]>({
        command: 'probe_media',
        label: 'Reading media info',
        args: { inputs: ctx.paths },
      });
      const lines = infos.map((m) => {
        const parts = [m.name];
        if (m.video?.width) parts.push(`${m.video.width}×${m.video.height}`);
        if (m.video?.fps) parts.push(`${Math.round(m.video.fps)} fps`);
        if (m.video) parts.push(m.video.codec);
        if (m.audio) parts.push(`${m.audio.codec}${m.audio.channels ? ` ${m.audio.channels}ch` : ''}`);
        if (m.duration) parts.push(formatDuration(m.duration));
        parts.push(formatBytes(m.size));
        return parts.join(' · ');
      });
      const text = lines.join('\n');
      await copyText(text);
      return { title: infos.length === 1 ? 'Media info' : `${infos.length} files`, detail: 'Copied to the clipboard', snippet: text };
    },
  });
}

function folderSizeItem(): RadialItem {
  return task({
    id: 'tool:folder-size',
    label: 'Size',
    title: 'How big is this folder?',
    hint: 'Counts everything inside',
    icon: 'HardDrive',
    keywords: ['size', 'space', 'disk', 'weight', 'tamaño', 'espacio'],
    run: async (ctx): Promise<ActionResult> => {
      const report = await ctx.data<FolderReport>({
        command: 'analyze_folder',
        label: `Measuring ${ctx.files[0].name}`,
        args: { path: ctx.paths[0], topN: 5 },
      });
      const text = `${formatBytes(report.totalSize)} · ${pluralize(report.fileCount, 'file')} · ${pluralize(report.dirCount, 'folder')}`;
      await copyText(text);
      return { title: ctx.files[0].name, detail: text, snippet: text };
    },
  });
}

function archiveItems(): RadialItem[] {
  return [
    task({
      id: 'archive:list',
      label: 'Peek inside',
      title: 'What is in this archive?',
      hint: 'Lists the contents without extracting',
      icon: 'ListTree',
      keywords: ['list', 'contents', 'inspect', 'ver contenido'],
      run: async (ctx): Promise<ActionResult> => {
        const entries = await call<ArchiveEntry[]>('list_archive', { input: ctx.paths[0] });
        const files = entries.filter((e) => !e.isDir);
        const names = files.slice(0, 6).map((e) => e.name).join('\n');
        return {
          title: ctx.files[0].name,
          detail: `${pluralize(files.length, 'file')} · ${formatBytes(files.reduce((n, e) => n + e.size, 0))} unpacked`,
          snippet: names + (files.length > 6 ? `\n… and ${files.length - 6} more` : ''),
        };
      },
    }),
  ];
}

function openMainItem(
  id: string,
  label: string,
  title: string,
  hint: string,
  icon: string,
  route: string,
  keywords: string[],
): RadialItem {
  return ui({ id, label, title, hint, icon, keywords, run: (ctx: ActionCtx) => ctx.openMain(route, ctx.paths) });
}

/** Content-aware tools: OCR, QR, colours, checksums, folder size, archive peek… */
export function toolItems(input: CatalogInput): RadialItem[] {
  const { files } = input;
  if (files.length === 0) return [];
  const items: RadialItem[] = [];

  if (isKind(files, 'image')) {
    items.push(ocrItem(input), qrItem(), paletteItem());
    if (files.length === 1) items.push(base64Item(), wallpaperItem());
  } else if (isKind(files, 'pdf')) {
    items.push(ocrItem(input));
  } else if (isKind(files, 'video', 'audio')) {
    items.push(probeItem(input));
  } else if (isKind(files, 'archive')) {
    items.push(...archiveItems());
  } else if (files.length === 1 && files[0].isDir) {
    items.push(
      folderSizeItem(),
      openMainItem('tool:duplicates', 'Duplicates', 'Find duplicate files', 'Opens the duplicate finder', 'CopyCheck', '/t/files/duplicates', ['duplicates', 'duplicados', 'clean']),
      openMainItem('tool:organize', 'Organise', 'Sort files into folders', 'Opens the organiser', 'FolderTree', '/t/files/organize', ['organize', 'organise', 'sort', 'organizar', 'ordenar']),
      openMainItem('tool:flatten', 'Flatten', 'Pull files out of sub-folders', 'Opens the flatten tool', 'Layers', '/t/files/flatten', ['flatten', 'aplanar']),
    );
  }

  if (!files.every((f) => f.isDir)) items.push(hashItem());
  return items;
}

export { stemOf };
