import QRCode from 'qrcode';
import { inspectPaths, openPath } from '@/core/bridge';
import { createTextFile, pasteClipboardAsFile, type ClipboardSummary } from '@/core/quick';
import { saveBytes } from '@/core/save';
import type { BatchResult } from '@/core/types';
import type { ActionResult, RadialItem } from '../model';
import { copyText, isoDate, notify, ocrLanguages, pasteText } from '../system';
import { FILE_TYPES, fileType } from './fileTypes';
import { missing, task, ui, type CatalogInput } from './util';

const LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.';

function randomPassword(length = 20): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+';
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % alphabet.length);
  let out = '';
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < limit && out.length < length) out += alphabet[b % alphabet.length];
    }
  }
  return out;
}

function clipboardHint(clip: ClipboardSummary | null): { hint: string; unavailable?: string } {
  if (!clip || clip.kind === 'empty') return { hint: 'Nothing on the clipboard yet', unavailable: 'Clipboard is empty' };
  if (clip.kind === 'image') return { hint: 'The image on your clipboard → a PNG' };
  if (clip.kind === 'files') return { hint: `${clip.count} copied file${clip.count === 1 ? '' : 's'} → copied in` };
  const preview = clip.preview.replace(/\s+/g, ' ').slice(0, 44);
  return { hint: `“${preview}${clip.preview.length > 44 ? '…' : ''}” → a text file` };
}

/** The root of the Create ring — what you want when nothing is selected. */
export function createItems(input: CatalogInput, clip: ClipboardSummary | null): RadialItem[] {
  const paste = clipboardHint(clip);
  return [
    ui({
      id: 'create:text',
      label: 'Text file',
      glyph: 'TXT',
      title: 'New text file',
      hint: '.txt in this folder',
      icon: 'FileText',
      keywords: ['txt', 'text', 'note', 'new file', 'crear', 'nuevo', 'archivo', 'texto'],
      run: async (ctx) => ctx.openCard({ kind: 'new-file', type: 'txt' }),
    }),
    ui({
      id: 'create:markdown',
      label: 'Markdown',
      glyph: 'MD',
      title: 'New Markdown note',
      hint: '.md with templates',
      icon: 'FileCode2',
      keywords: ['md', 'markdown', 'note', 'notes', 'nota', 'notas', 'nuevo'],
      run: async (ctx) => ctx.openCard({ kind: 'new-file', type: 'md' }),
    }),
    ui({
      id: 'create:record',
      label: 'Record audio',
      title: 'Record a voice memo',
      hint: 'Saved as .m4a in this folder',
      icon: 'Mic',
      tone: 'accent',
      keywords: ['record', 'audio', 'voice', 'microphone', 'memo', 'grabar', 'voz', 'micrófono'],
      run: async (ctx) => ctx.openCard({ kind: 'recorder' }),
    }),
    task({
      id: 'create:paste',
      label: 'Paste as file',
      title: 'Turn the clipboard into a file',
      hint: paste.hint,
      unavailable: paste.unavailable,
      icon: 'ClipboardPaste',
      keywords: ['paste', 'clipboard', 'save clipboard', 'pegar', 'portapapeles'],
      run: async (ctx): Promise<BatchResult> => pasteClipboardAsFile(ctx.folder ?? ''),
    }),
    task({
      id: 'create:daily',
      label: 'Daily note',
      title: `Today’s note — ${isoDate()}.md`,
      hint: 'Opens it if it already exists',
      icon: 'CalendarDays',
      keywords: ['daily', 'journal', 'today', 'diary', 'diario', 'hoy', 'nota diaria'],
      run: async (ctx): Promise<ActionResult> => {
        const name = `${isoDate()}.md`;
        const target = `${ctx.folder ?? ''}/${name}`;
        const exists = await inspectPaths([target]).then(
          () => true,
          () => false,
        );
        if (exists) {
          await openPath(target);
          return { title: 'Opened today’s note', detail: name };
        }
        const md = fileType('md').variants?.find((v) => v.id === 'daily');
        const body = md?.template({ title: '', date: new Date() }) ?? '';
        const made = await createTextFile({ dir: ctx.folder ?? '', name: isoDate(), ext: 'md', content: body });
        await openPath(made.path);
        return { title: 'Daily note created', detail: made.name, results: [made] };
      },
    }),
    task({
      id: 'create:ocr-screen',
      label: 'Text from screen',
      title: 'Copy text from the screen',
      hint: 'Drag over any text — OCR copies it',
      icon: 'ScanText',
      needs: ['tesseract'],
      unavailable: missing(input.bins, 'tesseract'),
      keywords: ['ocr', 'screen text', 'grab text', 'texto de pantalla', 'copiar texto'],
      run: async (ctx): Promise<ActionResult | void> => {
        const { call, appPaths } = await import('@/core/bridge');
        const temp = (await appPaths()).temp;
        ctx.close();
        await new Promise((r) => setTimeout(r, 260));
        const shot = await call<{ path: string }>('take_screenshot', { mode: 'area', outputDir: temp });
        const languages = await ocrLanguages();
        const found = await call<Array<{ text: string; words: number }>>('ocr_files', {
          jobId: `ocr_${Date.now().toString(36)}`,
          inputs: [shot.path],
          opts: { languages, psm: 6, dpi: 300 },
        });
        const text = found.map((f) => f.text.trim()).filter(Boolean).join('\n');
        if (!text) {
          await notify('No text found', 'Try selecting a larger area.');
          return;
        }
        await copyText(text);
        await notify('Text copied', `${text.split(/\s+/).length} words from the screen`);
      },
    }),
    ui({
      id: 'create:app',
      label: 'Toolbox',
      title: 'Open Toolbox',
      hint: 'All 169 tools',
      icon: 'Box',
      keywords: ['toolbox', 'app', 'main window', 'abrir'],
      run: async (ctx) => ctx.openMain('/'),
    }),
  ];
}

/** One petal per file type — the "New file ▸" group. */
export function newFileItems(): RadialItem[] {
  return FILE_TYPES.map((type) =>
    ui({
      id: `new:${type.id}`,
      label: type.label,
      glyph: type.glyph,
      title: `New ${type.label} file`,
      hint: `.${type.ext} — starts from a sensible template`,
      icon: type.icon,
      keywords: [type.ext, type.label.toLowerCase(), 'new', 'create', 'nuevo', 'crear'],
      run: async (ctx) => ctx.openCard({ kind: 'new-file', type: type.id }),
    }),
  );
}

/** Quick things to put on the clipboard, plus clipboard → file helpers. */
export function clipboardItems(): RadialItem[] {
  return [
    task({
      id: 'clip:uuid',
      label: 'UUID',
      glyph: 'UUID',
      title: 'Copy a fresh UUID',
      hint: 'Random, version 4',
      icon: 'Fingerprint',
      keywords: ['uuid', 'guid', 'id', 'unique'],
      run: async (): Promise<ActionResult> => {
        const id = crypto.randomUUID();
        await copyText(id);
        return { title: 'UUID copied', snippet: id };
      },
    }),
    task({
      id: 'clip:password',
      label: 'Password',
      title: 'Copy a strong password',
      hint: '20 characters from the system’s random source',
      icon: 'KeyRound',
      keywords: ['password', 'secret', 'contraseña', 'clave', 'generate'],
      run: async (): Promise<ActionResult> => {
        const pw = randomPassword(20);
        await copyText(pw);
        return { title: 'Password copied', detail: '20 characters — nothing was stored', snippet: pw };
      },
    }),
    task({
      id: 'clip:date',
      label: 'Date',
      title: 'Copy today’s date',
      hint: 'ISO 8601 — 2026-11-04',
      icon: 'CalendarDays',
      keywords: ['date', 'today', 'iso', 'fecha', 'hoy'],
      run: async (): Promise<ActionResult> => {
        const text = isoDate();
        await copyText(text);
        return { title: 'Date copied', snippet: text };
      },
    }),
    task({
      id: 'clip:timestamp',
      label: 'Timestamp',
      title: 'Copy the current Unix time',
      hint: 'Seconds since 1970',
      icon: 'Clock',
      keywords: ['timestamp', 'unix', 'epoch', 'now', 'ahora'],
      run: async (): Promise<ActionResult> => {
        const text = String(Math.floor(Date.now() / 1000));
        await copyText(text);
        return { title: 'Timestamp copied', snippet: text };
      },
    }),
    task({
      id: 'clip:lorem',
      label: 'Lorem ipsum',
      title: 'Copy placeholder text',
      hint: 'One paragraph',
      icon: 'TextQuote',
      keywords: ['lorem', 'placeholder', 'dummy', 'texto de relleno'],
      run: async (): Promise<ActionResult> => {
        await copyText(LOREM);
        return { title: 'Lorem ipsum copied', snippet: LOREM.slice(0, 120) };
      },
    }),
    task({
      id: 'clip:plain',
      label: 'Plain text',
      title: 'Strip formatting from the clipboard',
      hint: 'Keeps only the words',
      icon: 'RemoveFormatting',
      keywords: ['plain', 'format', 'clean', 'strip', 'sin formato', 'limpiar'],
      run: async (): Promise<ActionResult> => {
        const text = await pasteText();
        if (!text.trim()) return { title: 'Nothing to clean', detail: 'The clipboard has no text.' };
        await copyText(text.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim());
        return { title: 'Clipboard is plain text', snippet: text.slice(0, 120) };
      },
    }),
    task({
      id: 'clip:qr',
      label: 'QR code',
      title: 'Make a QR code from the clipboard',
      hint: 'A PNG in this folder',
      icon: 'QrCode',
      keywords: ['qr', 'code', 'link', 'url', 'código qr', 'generar'],
      run: async (ctx): Promise<ActionResult> => {
        const text = (await pasteText()).trim();
        if (!text) return { title: 'Nothing to encode', detail: 'Copy a link or some text first.' };
        const dataUrl = await QRCode.toDataURL(text, { width: 1024, margin: 2, errorCorrectionLevel: 'M' });
        const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
        const saved = await saveBytes(bytes, {
          source: null,
          output: { mode: 'custom', dir: ctx.folder, suffix: null, collision: 'rename', filename: 'QR Code' },
          ext: 'png',
        });
        return { title: 'QR code saved', detail: text.slice(0, 80), results: [saved] };
      },
    }),
  ];
}
