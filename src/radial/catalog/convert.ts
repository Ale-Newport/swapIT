import { PDFDocument } from 'pdf-lib';
import { appPaths } from '@/core/bridge';
import { readBytes, saveBytes } from '@/core/save';
import type { BatchResult, FileInfo, FileKind } from '@/core/types';
import {
  DEFAULT_QUALITY,
  availableTargets,
  groupFilesByKind,
  normalizeExt,
  planConversion,
  type ConversionTarget,
  type KindGroup,
} from '@/tools/convert/universal/logic';
import { isEmbeddable } from '@/tools/pdf/images-to-pdf/logic';
import type { ActionCtx, RadialItem } from '../model';
import { baseName, missing, pluralize, stemOf, task, type CatalogInput } from './util';

/** One word under each format badge — what the format is *for*. */
const BLURB: Record<string, string> = {
  jpg: 'JPEG',
  png: 'Lossless',
  webp: 'Web',
  avif: 'Modern',
  tiff: 'Print',
  bmp: 'Bitmap',
  gif: 'Animated',
  ico: 'Favicon',
  pdf: 'Document',
  mp4: 'Universal',
  mov: 'QuickTime',
  mkv: 'Matroska',
  webm: 'Web video',
  avi: 'Legacy',
  m4v: 'Apple',
  mp3: 'Music',
  m4a: 'AAC',
  wav: 'Lossless',
  flac: 'Lossless',
  ogg: 'Vorbis',
  opus: 'Opus',
  txt: 'Plain text',
  docx: 'Word',
  odt: 'OpenDocument',
  rtf: 'Rich text',
  html: 'Web page',
  md: 'Markdown',
  epub: 'E-book',
  png_pages: 'Each page',
};

function blurbFor(target: ConversionTarget, sourceKind: FileKind): string {
  if (sourceKind === 'pdf' && (target.ext === 'png' || target.ext === 'jpg')) return 'Each page';
  return BLURB[target.ext] ?? target.label;
}

/** Targets reachable by every kind group, in the first group's order. */
interface Option {
  ext: string;
  perKind: Array<{ group: KindGroup; target: ConversionTarget; missing: string | undefined }>;
}

function commonOptions(groups: KindGroup[], bins: CatalogInput['bins']): Option[] {
  const installed = (id: string) => bins[id as keyof typeof bins] !== false;
  const perGroup = groups.map((g) => ({
    group: g,
    entries: availableTargets(g.kind, g.extensions, installed),
  }));
  const first = perGroup[0];
  if (!first) return [];
  const options: Option[] = [];
  for (const entry of first.entries) {
    const ext = entry.target.ext;
    const perKind: Option['perKind'] = [];
    let ok = true;
    for (const { group, entries } of perGroup) {
      const found = entries.find((e) => e.target.ext === ext);
      if (!found) {
        ok = false;
        break;
      }
      // Converting a file to the format it already is would be a no-op.
      const same = group.extensions.length === 1 && normalizeExt(group.extensions[0]) === normalizeExt(ext);
      if (same) {
        ok = false;
        break;
      }
      perKind.push({
        group,
        target: found.target,
        missing: found.blocked ?? (found.available ? undefined : missing(bins, ...found.missing)),
      });
    }
    if (ok) options.push({ ext, perKind });
  }
  return options;
}

/** Images → one PDF, built in the webview with pdf-lib (no external program). */
async function imagesToPdf(ctx: ActionCtx): Promise<BatchResult> {
  const started = Date.now();
  const doc = await PDFDocument.create();
  let temp: string | null = null;
  for (const file of ctx.files) {
    let path = file.path;
    let ext = file.extension;
    if (!isEmbeddable(ext)) {
      // WebP, HEIC, TIFF… go through the image engine to PNG first.
      temp ??= (await appPaths()).temp;
      const converted = await ctx.job({
        command: 'process_images',
        label: `Preparing ${file.name}`,
        args: {
          inputs: [file.path],
          ops: { format: 'png' },
          output: { mode: 'custom', dir: temp, suffix: '-pdfsrc', collision: 'rename', filename: null },
        },
      });
      const made = converted.results[0];
      if (!made) throw new Error(`“${file.name}” could not be prepared for the PDF.`);
      path = made.path;
      ext = 'png';
    }
    const bytes = await readBytes(path);
    const image = ext.toLowerCase() === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const page = doc.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }
  const first = ctx.files[0];
  const out = await saveBytes(await doc.save(), {
    source: first.path,
    output: ctx.output({ filename: ctx.files.length > 1 ? `${stemOf(first.name)} and ${ctx.files.length - 1} more` : null }),
    ext: 'pdf',
  });
  return { results: [out], failures: [], cancelled: false, elapsedMs: Date.now() - started };
}

function convertRun(option: Option) {
  return async (ctx: ActionCtx): Promise<BatchResult> => {
    const quality = {
      ...DEFAULT_QUALITY,
      imageQuality: Number(ctx.settings.jpegQuality) || DEFAULT_QUALITY.imageQuality,
      crf: Number(ctx.settings.defaultVideoCrf) || DEFAULT_QUALITY.crf,
    };
    const plans = [];
    const merged: BatchResult = { results: [], failures: [], cancelled: false, elapsedMs: 0 };
    for (const { group, target } of option.perKind) {
      if (target.handoff?.toolId === 'pdf/images-to-pdf') {
        const sub = await imagesToPdf({ ...ctx, files: ctx.files.filter((f) => group.paths.includes(f.path)) });
        merged.results.push(...sub.results);
        continue;
      }
      if (target.handoff?.toolId === 'svg/to-raster') {
        plans.push({
          command: 'process_images',
          label: `Convert ${pluralize(group.paths.length, 'SVG')} to ${target.label}`,
          args: {
            inputs: group.paths,
            ops: { format: option.ext, quality: option.ext === 'jpg' ? quality.imageQuality : undefined },
            output: ctx.output(),
          },
        });
        continue;
      }
      if (target.handoff) {
        await ctx.openMain(`/t/${target.handoff.toolId}`, group.paths);
        return merged;
      }
      plans.push(planConversion({ kind: group.kind, targetExt: option.ext, paths: group.paths, output: ctx.output(), quality }));
    }
    if (plans.length > 0) {
      const batch = await ctx.jobs(plans);
      merged.results.push(...batch.results);
      merged.failures.push(...batch.failures);
      merged.elapsedMs = batch.elapsedMs;
    }
    return merged;
  };
}

/** "Convert to …" items for the selection, one per reachable format. */
export function convertItems(input: CatalogInput): RadialItem[] {
  const { files, bins } = input;
  if (files.length === 0 || files.some((f) => f.isDir)) return [];
  const groups = groupFilesByKind(files);
  // Every selected file must be convertible, or the ring would silently skip some.
  if (groups.reduce((n, g) => n + g.paths.length, 0) !== files.length) return [];

  return commonOptions(groups, bins).map((option) => {
    const lead = option.perKind[0];
    const unavailable = option.perKind.map((p) => p.missing).find(Boolean);
    const needs = [...new Set(option.perKind.flatMap((p) => p.target.requires))];
    // SVG → raster goes through ImageMagick even though the table calls it a hand-off.
    const svgNeedsMagick = option.perKind.some((p) => p.target.handoff?.toolId === 'svg/to-raster');
    const svgMissing = svgNeedsMagick ? missing(bins, 'magick') : undefined;
    return task({
      id: `convert:${option.ext}`,
      label: blurbFor(lead.target, lead.group.kind),
      glyph: option.ext.toUpperCase(),
      title: `Convert to ${lead.target.label}`,
      hint: lead.target.note ?? lead.target.engine,
      icon: 'Repeat',
      keywords: [option.ext, `to ${option.ext}`, lead.target.label, 'convert', 'convertir', 'export'],
      unavailable: unavailable ?? svgMissing,
      needs: svgNeedsMagick ? [...needs, 'magick'] : needs,
      run: convertRun(option),
    });
  });
}

export function selectionKinds(files: FileInfo[]): KindGroup[] {
  return groupFilesByKind(files);
}

export { baseName };
