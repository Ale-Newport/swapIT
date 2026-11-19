import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { readFile, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { call, planOutput } from './bridge';
import { WEB_DEMO } from './platform';
import type { FileResult, OutputSpec } from './types';

const toBytes = async (data: Uint8Array | ArrayBuffer | Blob): Promise<Uint8Array> =>
  data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data instanceof ArrayBuffer ? new Uint8Array(data) : data;

/** A file name without any folder part, safe to offer as a download name. */
export function downloadName(name: string): string {
  const base = name.split(/[\\/]/).pop()?.trim() ?? '';
  return [...base].filter((c) => c.charCodeAt(0) >= 32).join('') || 'toolbox-output';
}

/**
 * The web demo has no file system: hand the bytes to the browser as a download
 * and report it the way a saved file is reported.
 */
function browserDownload(bytes: Uint8Array, name: string): FileResult {
  const fileName = downloadName(name);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return { path: fileName, name: fileName, size: bytes.byteLength, source: null, sourceSize: null, disposition: 'created', note: 'Downloaded by your browser' };
}

function webName(options: { output: OutputSpec; ext: string }): string {
  const stem = options.output.filename?.trim() || 'toolbox-output';
  return stem.toLowerCase().endsWith(`.${options.ext}`) ? stem : `${stem}.${options.ext}`;
}

/**
 * Save bytes produced in the frontend (PDF, QR, SVG …) through the same output
 * policy the Rust tools use: the backend picks a collision-free path, the
 * frontend writes the bytes.
 */
export async function saveBytes(
  data: Uint8Array | ArrayBuffer | Blob,
  options: { source: string | null; output: OutputSpec; ext: string },
): Promise<FileResult> {
  const bytes = await toBytes(data);
  if (WEB_DEMO) return browserDownload(bytes, webName(options));
  const planned = await planOutput(options.source, options.output, options.ext);
  // "skip" means the file already exists and must be left alone — `planned.path`
  // is that existing file, so writing here would destroy it.
  if (planned.disposition === 'skipped') {
    return {
      path: planned.path,
      name: planned.name,
      size: 0,
      source: options.source,
      sourceSize: null,
      disposition: 'skipped',
      note: 'Already exists — skipped',
    };
  }
  await writeFile(planned.path, bytes);
  return {
    path: planned.path,
    name: planned.name,
    size: bytes.byteLength,
    source: options.source,
    sourceSize: null,
    disposition: planned.disposition as FileResult['disposition'],
  };
}

export async function saveText(
  text: string,
  options: { source: string | null; output: OutputSpec; ext: string },
): Promise<FileResult> {
  if (WEB_DEMO) return browserDownload(new TextEncoder().encode(text), webName(options));
  const planned = await planOutput(options.source, options.output, options.ext);
  if (planned.disposition === 'skipped') {
    return {
      path: planned.path,
      name: planned.name,
      size: 0,
      source: options.source,
      sourceSize: null,
      disposition: 'skipped',
      note: 'Already exists — skipped',
    };
  }
  await writeTextFile(planned.path, text);
  return {
    path: planned.path,
    name: planned.name,
    size: new TextEncoder().encode(text).byteLength,
    source: options.source,
    sourceSize: null,
    disposition: planned.disposition as FileResult['disposition'],
  };
}

/** Read a file as raw bytes — used by the PDF and image tools that work in JS. */
export async function readBytes(path: string): Promise<Uint8Array> {
  return readFile(path);
}

/** Prompt for a location and write bytes there. Used by generators with no input file. */
export async function saveAs(
  data: Uint8Array | Blob,
  defaultName: string,
): Promise<FileResult | null> {
  if (WEB_DEMO) return browserDownload(await toBytes(data), defaultName);
  const target = await saveDialog({ defaultPath: defaultName });
  if (!target) return null;
  const bytes = await toBytes(data);
  await writeFile(target, bytes);
  return {
    path: target,
    name: target.split('/').pop() ?? defaultName,
    size: bytes.byteLength,
    source: null,
    sourceSize: null,
    disposition: 'created',
  };
}

export async function saveTextAs(text: string, defaultName: string): Promise<FileResult | null> {
  if (WEB_DEMO) return browserDownload(new TextEncoder().encode(text), defaultName);
  const target = await saveDialog({ defaultPath: defaultName });
  if (!target) return null;
  await writeTextFile(target, text);
  return {
    path: target,
    name: target.split('/').pop() ?? defaultName,
    size: new TextEncoder().encode(text).byteLength,
    source: null,
    sourceSize: null,
    disposition: 'created',
  };
}

/** Turn a <canvas> into PNG bytes without a data-URL round trip. */
export async function canvasToBytes(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new Error('The canvas could not be encoded.');
  return new Uint8Array(await blob.arrayBuffer());
}

/** Directory of a path, for seeding an OutputSpec from an input file. */
export function parentDir(path: string): string {
  return path.split('/').slice(0, -1).join('/');
}

export { call };
