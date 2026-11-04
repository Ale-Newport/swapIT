import { PDFDocument } from 'pdf-lib';
import { readBytes, saveBytes } from '@/core/save';
import type { BatchResult } from '@/core/types';
import { buildNormalizeOps } from '@/tools/audio/normalize/logic';
import { buildCompressOps } from '@/tools/audio/compress/logic';
import { buildVolumeOps } from '@/tools/audio/volume/logic';
import { buildOps as buildVideoOps } from '@/tools/video/compress/logic';
import type { ActionCtx, JobPlan, RadialItem } from '../model';
import { isKind, missing, pluralize, stemOf, task, ui, type CatalogInput } from './util';

// ------------------------------------------------------------------ images

interface ImageEdit {
  id: string;
  label: string;
  title: string;
  hint: string;
  icon: string;
  glyph?: string;
  suffix: string;
  keywords: string[];
  ops: (ext: string) => Record<string, unknown>;
}

/** HEIC and friends cannot be written back as themselves; JPEG is the sane default. */
function keepFormat(ext: string): string | undefined {
  return ['heic', 'heif', 'avif', 'jfif'].includes(ext.toLowerCase()) ? 'jpg' : undefined;
}

const IMAGE_EDITS: ImageEdit[] = [
  {
    id: 'edit:compress',
    label: 'Compress',
    title: 'Compress image',
    hint: 'Smaller file, same look — metadata stripped',
    icon: 'Minimize2',
    suffix: '-compressed',
    keywords: ['smaller', 'reduce size', 'shrink', 'optimize', 'comprimir', 'reducir'],
    ops: (ext) => ({ format: keepFormat(ext), quality: 72, stripMetadata: true }),
  },
  {
    id: 'edit:resize-50',
    label: 'Half size',
    glyph: '50%',
    title: 'Resize to 50%',
    hint: 'Half the width and height',
    icon: 'Scaling',
    suffix: '-50%',
    keywords: ['resize', 'scale', 'smaller', 'redimensionar', 'half'],
    ops: (ext) => ({ format: keepFormat(ext), resize: { mode: 'percent', percent: 50 } }),
  },
  {
    id: 'edit:resize-25',
    label: 'Quarter size',
    glyph: '25%',
    title: 'Resize to 25%',
    hint: 'A quarter of the width and height',
    icon: 'Scaling',
    suffix: '-25%',
    keywords: ['resize', 'scale', 'thumbnail', 'redimensionar'],
    ops: (ext) => ({ format: keepFormat(ext), resize: { mode: 'percent', percent: 25 } }),
  },
  {
    id: 'edit:resize-1920',
    label: '1920 wide',
    glyph: '1920',
    title: 'Resize to 1920 px wide',
    hint: 'Full HD width, never enlarged',
    icon: 'Scaling',
    suffix: '-1920w',
    keywords: ['resize', 'hd', '1080', 'redimensionar'],
    ops: (ext) => ({ format: keepFormat(ext), resize: { mode: 'fit', width: 1920, height: 99999, allowUpscale: false } }),
  },
  {
    id: 'edit:resize-1280',
    label: '1280 wide',
    glyph: '1280',
    title: 'Resize to 1280 px wide',
    hint: 'Web-friendly width, never enlarged',
    icon: 'Scaling',
    suffix: '-1280w',
    keywords: ['resize', 'web', '720', 'redimensionar'],
    ops: (ext) => ({ format: keepFormat(ext), resize: { mode: 'fit', width: 1280, height: 99999, allowUpscale: false } }),
  },
  {
    id: 'edit:rotate-cw',
    label: 'Rotate right',
    title: 'Rotate 90° clockwise',
    hint: 'Saved as a new file',
    icon: 'RotateCw',
    suffix: '-rotated',
    keywords: ['rotate', 'turn', 'girar', 'rotar'],
    ops: (ext) => ({ format: keepFormat(ext), rotate: 90 }),
  },
  {
    id: 'edit:rotate-ccw',
    label: 'Rotate left',
    title: 'Rotate 90° counter-clockwise',
    hint: 'Saved as a new file',
    icon: 'RotateCcw',
    suffix: '-rotated',
    keywords: ['rotate', 'turn', 'girar', 'rotar'],
    ops: (ext) => ({ format: keepFormat(ext), rotate: 270 }),
  },
  {
    id: 'edit:flip',
    label: 'Mirror',
    title: 'Flip horizontally',
    hint: 'Mirror image, saved as a new file',
    icon: 'FlipHorizontal2',
    suffix: '-flipped',
    keywords: ['flip', 'mirror', 'espejo', 'voltear'],
    ops: (ext) => ({ format: keepFormat(ext), flipHorizontal: true }),
  },
  {
    id: 'edit:grayscale',
    label: 'Black & white',
    title: 'Convert to black and white',
    hint: 'Saved as a new file',
    icon: 'Contrast',
    suffix: '-bw',
    keywords: ['grayscale', 'greyscale', 'monochrome', 'blanco y negro', 'gris'],
    ops: (ext) => ({ format: keepFormat(ext), grayscale: true }),
  },
  {
    id: 'edit:strip',
    label: 'Clean EXIF',
    title: 'Strip metadata',
    hint: 'Removes location, camera and date tags',
    icon: 'Eraser',
    suffix: '-clean',
    keywords: ['exif', 'metadata', 'privacy', 'gps', 'location', 'limpiar', 'privacidad'],
    ops: (ext) => ({ format: keepFormat(ext), quality: 92, stripMetadata: true }),
  },
];

function imageEditItems(input: CatalogInput): RadialItem[] {
  return IMAGE_EDITS.map((edit) =>
    task({
      id: edit.id,
      label: edit.label,
      glyph: edit.glyph,
      title: edit.title,
      hint: edit.hint,
      icon: edit.icon,
      keywords: edit.keywords,
      run: (ctx) =>
        ctx.job({
          command: 'process_images',
          label: `${edit.title} · ${pluralize(ctx.files.length, 'image')}`,
          total: ctx.files.length,
          args: {
            inputs: ctx.paths,
            // Per-file extension decides whether HEIC needs a different container.
            ops: edit.ops(ctx.files[0]?.extension ?? ''),
            output: ctx.output({ suffix: edit.suffix }),
          },
        }),
    }),
  ).filter(() => input.files.length > 0);
}

// ------------------------------------------------------------------ video

function videoPlan(ctx: ActionCtx, label: string, ops: Record<string, unknown>, suffix: string): JobPlan {
  return {
    command: 'process_video',
    label: `${label} · ${pluralize(ctx.files.length, 'video')}`,
    total: ctx.files.length,
    args: { inputs: ctx.paths, ops, output: ctx.output({ suffix }) },
  };
}

function videoEditItems(input: CatalogInput): RadialItem[] {
  const need = missing(input.bins, 'ffmpeg');
  const base = { unavailable: need, needs: ['ffmpeg' as const] };
  const crf = (n: number) => n;
  return [
    task({
      ...base,
      id: 'edit:video-compress',
      label: 'Compress',
      title: 'Compress video',
      hint: 'H.264 at CRF 28 — much smaller, still sharp',
      icon: 'Minimize2',
      keywords: ['smaller', 'reduce', 'shrink', 'comprimir', 'reducir peso'],
      run: (ctx) =>
        ctx.job(
          videoPlan(
            ctx,
            'Compress',
            buildVideoOps({ format: 'mp4', codec: 'libx264', crf: crf(28), maxHeight: null, preset: 'medium', removeAudio: false, audioBitrate: '128k' }),
            '-compressed',
          ),
        ),
    }),
    task({
      ...base,
      id: 'edit:video-720',
      label: '720p',
      glyph: '720p',
      title: 'Shrink to 720p',
      hint: 'Ideal for messaging and email',
      icon: 'Scaling',
      keywords: ['resize', 'small', 'whatsapp', 'email', '720'],
      run: (ctx) =>
        ctx.job(
          videoPlan(
            ctx,
            'Shrink to 720p',
            buildVideoOps({ format: 'mp4', codec: 'libx264', crf: 28, maxHeight: 720, preset: 'medium', removeAudio: false, audioBitrate: '128k' }),
            '-720p',
          ),
        ),
    }),
    task({
      ...base,
      id: 'edit:video-1080',
      label: '1080p',
      glyph: '1080p',
      title: 'Cap at 1080p',
      hint: 'Full HD, never enlarged',
      icon: 'Scaling',
      keywords: ['resize', 'hd', '1080'],
      run: (ctx) =>
        ctx.job(
          videoPlan(
            ctx,
            'Cap at 1080p',
            buildVideoOps({ format: 'mp4', codec: 'libx264', crf: 24, maxHeight: 1080, preset: 'medium', removeAudio: false, audioBitrate: '160k' }),
            '-1080p',
          ),
        ),
    }),
    task({
      ...base,
      id: 'edit:mute',
      label: 'Mute',
      title: 'Remove the audio track',
      hint: 'Copies the picture as it is — instant',
      icon: 'VolumeX',
      keywords: ['silent', 'no sound', 'remove audio', 'silenciar', 'quitar audio'],
      run: (ctx) => ctx.job(videoPlan(ctx, 'Remove audio', { removeAudio: true, copyStreams: true }, '-mute')),
    }),
    task({
      ...base,
      id: 'edit:video-2x',
      label: 'Speed 2×',
      glyph: '2×',
      title: 'Double the speed',
      hint: 'Plays twice as fast',
      icon: 'FastForward',
      keywords: ['faster', 'timelapse', 'speed', 'rápido', 'velocidad'],
      run: (ctx) => ctx.job(videoPlan(ctx, 'Double speed', { speed: 2, crf: 23 }, '-2x')),
    }),
    task({
      ...base,
      id: 'edit:video-half',
      label: 'Slow-mo',
      glyph: '½×',
      title: 'Half the speed',
      hint: 'Plays at half speed',
      icon: 'Rewind',
      keywords: ['slow', 'slowmo', 'lento', 'velocidad'],
      run: (ctx) => ctx.job(videoPlan(ctx, 'Half speed', { speed: 0.5, crf: 23 }, '-slow')),
    }),
    task({
      ...base,
      id: 'edit:video-reverse',
      label: 'Reverse',
      title: 'Play backwards',
      hint: 'Best for short clips',
      icon: 'Undo2',
      keywords: ['backwards', 'rewind', 'reverse', 'al revés', 'invertir'],
      run: (ctx) => ctx.job(videoPlan(ctx, 'Reverse', { reverse: true, crf: 23 }, '-reversed')),
    }),
    task({
      ...base,
      id: 'edit:video-rotate',
      label: 'Rotate',
      title: 'Rotate 90° clockwise',
      hint: 'Fixes sideways phone videos',
      icon: 'RotateCw',
      keywords: ['rotate', 'sideways', 'girar', 'rotar'],
      run: (ctx) => ctx.job(videoPlan(ctx, 'Rotate', { rotate: 90, crf: 23 }, '-rotated')),
    }),
    task({
      ...base,
      id: 'edit:video-thumb',
      label: 'Poster frame',
      title: 'Save a still from the video',
      hint: 'A JPEG next to the video',
      icon: 'ImageDown',
      keywords: ['thumbnail', 'frame', 'screenshot', 'poster', 'miniatura', 'captura'],
      run: async (ctx) => {
        const results: BatchResult = { results: [], failures: [], cancelled: false, elapsedMs: 0 };
        for (const file of ctx.files) {
          const out = await ctx.data<{ path: string; name: string; size: number; disposition: 'created' }>({
            command: 'video_thumbnail',
            label: `Frame from ${file.name}`,
            args: { input: file.path, timestamp: 1, output: ctx.output({ suffix: '-frame' }) },
          });
          results.results.push({ ...out, source: file.path });
        }
        return results;
      },
    }),
    ui({
      id: 'edit:video-trim',
      label: 'Trim…',
      title: 'Trim on a timeline',
      hint: 'Opens the trim tool',
      icon: 'Scissors',
      needs: ['ffmpeg'],
      unavailable: need,
      keywords: ['cut', 'trim', 'recortar', 'cortar'],
      run: (ctx) => ctx.openMain('/t/video/trim', ctx.paths),
    }),
  ];
}

// ------------------------------------------------------------------ audio

function audioPlan(ctx: ActionCtx, label: string, ops: Record<string, unknown>, suffix: string): JobPlan {
  return {
    command: 'process_video',
    label: `${label} · ${pluralize(ctx.files.length, 'audio file')}`,
    total: ctx.files.length,
    args: { inputs: ctx.paths, ops, output: ctx.output({ suffix }) },
  };
}

function audioEditItems(input: CatalogInput): RadialItem[] {
  const need = missing(input.bins, 'ffmpeg');
  const base = { unavailable: need, needs: ['ffmpeg' as const] };
  return [
    task({
      ...base,
      id: 'edit:normalize',
      label: 'Normalize',
      title: 'Even out the loudness',
      hint: 'Broadcast level, −16 LUFS',
      icon: 'AudioWaveform',
      keywords: ['loudness', 'volume', 'level', 'normalizar', 'volumen'],
      run: (ctx) => ctx.job(audioPlan(ctx, 'Normalize', buildNormalizeOps('same', '192k'), '-normalized')),
    }),
    task({
      ...base,
      id: 'edit:audio-small',
      label: 'Compress',
      title: 'Shrink to a small MP3',
      hint: '96 kbps — still sounds like music',
      icon: 'Minimize2',
      keywords: ['smaller', 'reduce', 'mp3', 'comprimir'],
      run: (ctx) => ctx.job(audioPlan(ctx, 'Compress', buildCompressOps('small', 'mp3'), '-small')),
    }),
    task({
      ...base,
      id: 'edit:audio-voice',
      label: 'Voice memo',
      title: 'Compress for speech',
      hint: 'Mono 64 kbps — lectures, voice notes',
      icon: 'Mic',
      keywords: ['voice', 'speech', 'podcast', 'voz', 'nota de voz'],
      run: (ctx) => ctx.job(audioPlan(ctx, 'Compress for speech', buildCompressOps('voice', 'm4a'), '-voice')),
    }),
    task({
      ...base,
      id: 'edit:audio-mono',
      label: 'Mono',
      title: 'Mix down to mono',
      hint: 'One channel instead of two',
      icon: 'Speaker',
      keywords: ['mono', 'downmix', 'channels'],
      run: (ctx) => ctx.job(audioPlan(ctx, 'Mix to mono', { audioOnly: true, toMono: true }, '-mono')),
    }),
    task({
      ...base,
      id: 'edit:audio-louder',
      label: 'Louder',
      glyph: '+6dB',
      title: 'Boost by 6 dB',
      hint: 'About twice as loud',
      icon: 'Volume2',
      keywords: ['volume up', 'boost', 'amplify', 'subir volumen'],
      run: (ctx) => ctx.job(audioPlan(ctx, '+6 dB', buildVolumeOps(6, 'same', '192k'), '-louder')),
    }),
    task({
      ...base,
      id: 'edit:audio-quieter',
      label: 'Quieter',
      glyph: '−6dB',
      title: 'Lower by 6 dB',
      hint: 'About half as loud',
      icon: 'Volume1',
      keywords: ['volume down', 'reduce', 'bajar volumen'],
      run: (ctx) => ctx.job(audioPlan(ctx, '−6 dB', buildVolumeOps(-6, 'same', '192k'), '-quieter')),
    }),
    task({
      ...base,
      id: 'edit:audio-fast',
      label: 'Speed 1.5×',
      glyph: '1.5×',
      title: 'Play at 1.5× speed',
      hint: 'Good for podcasts',
      icon: 'FastForward',
      keywords: ['faster', 'podcast', 'speed', 'velocidad'],
      run: (ctx) => ctx.job(audioPlan(ctx, '1.5× speed', { audioOnly: true, speed: 1.5 }, '-1.5x')),
    }),
    ui({
      id: 'edit:audio-trim',
      label: 'Trim…',
      title: 'Trim on a waveform',
      hint: 'Opens the trim tool',
      icon: 'Scissors',
      needs: ['ffmpeg'],
      unavailable: need,
      keywords: ['cut', 'trim', 'recortar', 'cortar'],
      run: (ctx) => ctx.openMain('/t/audio/trim', ctx.paths),
    }),
  ];
}

// ------------------------------------------------------------------ pdf

/** Merge PDFs in selection order with pdf-lib — no external program. */
async function mergePdfs(ctx: ActionCtx): Promise<BatchResult> {
  const started = Date.now();
  const out = await PDFDocument.create();
  for (const file of ctx.files) {
    let src: PDFDocument;
    try {
      src = await PDFDocument.load(await readBytes(file.path), { ignoreEncryption: false });
    } catch {
      throw new Error(`“${file.name}” could not be opened — it may be password protected or damaged.`);
    }
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  const first = ctx.files[0];
  const saved = await saveBytes(await out.save(), {
    source: first.path,
    output: ctx.output({ filename: `${stemOf(first.name)} + ${ctx.files.length - 1} more` }),
    ext: 'pdf',
  });
  return { results: [saved], failures: [], cancelled: false, elapsedMs: Date.now() - started };
}

function pdfEditItems(input: CatalogInput): RadialItem[] {
  const gs = missing(input.bins, 'gs');
  const items: RadialItem[] = [
    task({
      id: 'pdf:compress',
      label: 'Compress',
      title: 'Compress PDF',
      hint: 'Balanced — good for email',
      icon: 'Minimize2',
      needs: ['gs'],
      unavailable: gs,
      keywords: ['smaller', 'reduce', 'shrink', 'comprimir', 'reducir'],
      run: (ctx) =>
        ctx.job({
          command: 'compress_pdf',
          label: `Compress ${pluralize(ctx.files.length, 'PDF')}`,
          total: ctx.files.length,
          args: { inputs: ctx.paths, opts: { preset: 'ebook', grayscale: false }, output: ctx.output({ suffix: '-compressed' }) },
        }),
    }),
    task({
      id: 'pdf:compress-max',
      label: 'Smallest',
      title: 'Compress PDF as small as possible',
      hint: 'Screen quality — text stays sharp, images soften',
      icon: 'Shrink',
      needs: ['gs'],
      unavailable: gs,
      keywords: ['tiny', 'minimum', 'smaller', 'más pequeño'],
      run: (ctx) =>
        ctx.job({
          command: 'compress_pdf',
          label: `Shrink ${pluralize(ctx.files.length, 'PDF')}`,
          total: ctx.files.length,
          args: { inputs: ctx.paths, opts: { preset: 'screen', grayscale: false }, output: ctx.output({ suffix: '-small' }) },
        }),
    }),
  ];
  if (input.files.length >= 2) {
    items.unshift(
      task({
        id: 'pdf:merge',
        label: 'Merge',
        title: `Merge ${input.files.length} PDFs into one`,
        hint: 'In the order they were selected',
        icon: 'Combine',
        keywords: ['join', 'combine', 'unir', 'combinar', 'juntar'],
        run: mergePdfs,
      }),
    );
  }
  items.push(
    ui({
      id: 'pdf:split',
      label: 'Split…',
      title: 'Split or extract pages',
      hint: 'Opens the page tools',
      icon: 'Split',
      keywords: ['split', 'extract', 'pages', 'dividir', 'extraer'],
      run: (ctx) => ctx.openMain('/t/pdf/split', ctx.paths),
    }),
    ui({
      id: 'pdf:protect',
      label: 'Protect…',
      title: 'Add a password',
      hint: 'Opens the encrypt tool',
      icon: 'Lock',
      keywords: ['encrypt', 'password', 'proteger', 'contraseña', 'cifrar'],
      run: (ctx) => ctx.openMain('/t/pdf/encrypt', ctx.paths),
    }),
  );
  return items;
}

/** Edit-type items for whatever is selected. */
export function editItems(input: CatalogInput): RadialItem[] {
  const { files } = input;
  if (files.length === 0) return [];
  if (isKind(files, 'image')) return imageEditItems(input);
  if (isKind(files, 'video')) return videoEditItems(input);
  if (isKind(files, 'audio')) return audioEditItems(input);
  if (isKind(files, 'pdf')) return pdfEditItems(input);
  return [];
}
