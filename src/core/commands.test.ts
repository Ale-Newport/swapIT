import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');

/** Every command registered in the Tauri invoke handler. */
function registeredCommands(): Set<string> {
  const lib = readFileSync(join(ROOT, 'src-tauri', 'src', 'lib.rs'), 'utf8');
  const block = lib.slice(lib.indexOf('generate_handler!['), lib.indexOf('])', lib.indexOf('generate_handler![')));
  const names = new Set<string>();
  for (const match of block.matchAll(/cmd::[a-z_]+::([a-z0-9_]+)/g)) names.add(match[1]);
  return names;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * A wrong command name fails only at runtime, when the user clicks the button —
 * TypeScript cannot catch it because `call('name')` takes a plain string. This
 * test closes that gap across the whole tool library at once.
 */
describe('backend command surface', () => {
  const commands = registeredCommands();

  it('parses the invoke handler', () => {
    expect(commands.size).toBeGreaterThan(30);
    expect(commands.has('process_images')).toBe(true);
    expect(commands.has('process_video')).toBe(true);
  });

  it('every command referenced by the frontend is registered', () => {
    const files = [...walk(join(ROOT, 'src', 'tools')), ...walk(join(ROOT, 'src', 'core')), ...walk(join(ROOT, 'src', 'components'))];
    const problems: string[] = [];
    // Matches `command: 'x'`, `call<T>('x'`, `invoke('x'` and `call('x'`.
    const patterns = [
      /\bcommand:\s*'([a-z0-9_]+)'/g,
      /\bcall\s*(?:<[^>]*>)?\s*\(\s*'([a-z0-9_]+)'/g,
      /\binvoke\s*(?:<[^>]*>)?\s*\(\s*'([a-z0-9_]+)'/g,
    ];
    for (const file of files) {
      // Test files illustrate call shapes in comments; they issue no real IPC.
      if (/\.test\.tsx?$/.test(file)) continue;
      const text = readFileSync(file, 'utf8');
      for (const pattern of patterns) {
        for (const match of text.matchAll(pattern)) {
          const name = match[1];
          if (!commands.has(name)) {
            problems.push(`${file.replace(ROOT + '/', '')} calls unregistered command "${name}"`);
          }
        }
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});

/** Which external program each command needs. Commands able to fall back are absent. */
const COMMAND_BINARY: Record<string, string> = {
  process_video: 'ffmpeg',
  video_to_gif: 'ffmpeg',
  extract_frames: 'ffmpeg',
  video_thumbnail: 'ffmpeg',
  preview_frame: 'ffmpeg',
  concat_media: 'ffmpeg',
  generate_silence: 'ffmpeg',
  write_audio_tags: 'ffmpeg',
  extract_cover_art: 'ffmpeg',
  probe_media: 'ffprobe',
  pdf_to_images: 'pdftoppm',
  pdf_page_preview: 'pdftoppm',
  pdf_to_text: 'pdftotext',
  pdf_read_text: 'pdftotext',
  pdf_info: 'pdftotext',
  pdf_page_count: 'pdftotext',
  compress_pdf: 'gs',
  encrypt_pdf: 'qpdf',
  decrypt_pdf: 'qpdf',
  convert_document: 'soffice',
  pandoc_convert: 'pandoc',
  ocr_files: 'tesseract',
  available_ocr_languages: 'tesseract',
  remote_media_info: 'yt-dlp',
  download_media: 'yt-dlp',
};

/**
 * A tool that drives an external program without declaring it in `requires`
 * shows the user a raw process failure instead of an install card. A tool that
 * uses such a command only as an optional enhancement opts out with the marker
 * comment `// optional-dependency` in its ui.tsx.
 */
describe('dependency declarations', () => {
  it('every tool declares the binaries its commands need', () => {
    const toolDirs = walk(join(ROOT, 'src', 'tools')).filter((f) => f.endsWith('tool.ts'));
    const problems: string[] = [];

    for (const toolFile of toolDirs) {
      const dir = toolFile.slice(0, toolFile.lastIndexOf('/'));
      const meta = readFileSync(toolFile, 'utf8');
      const declared = new Set(
        [...meta.matchAll(/'([a-z0-9-]+)'/g)]
          .map((m) => m[1])
          .filter((v) => Object.values(COMMAND_BINARY).includes(v)),
      );

      const sources = walk(dir).filter((f) => !f.endsWith('.test.ts') && !f.endsWith('tool.ts'));
      const optedOut = sources.some((f) => readFileSync(f, 'utf8').includes('optional-dependency'));
      if (optedOut) continue;

      const used = new Set<string>();
      for (const file of sources) {
        const text = readFileSync(file, 'utf8');
        for (const [command, binary] of Object.entries(COMMAND_BINARY)) {
          if (new RegExp(String.raw`['"\`]` + command + String.raw`['"\`]`).test(text)) used.add(binary);
        }
      }
      for (const binary of used) {
        // ffprobe ships in the same Homebrew formula as ffmpeg, so declaring
        // ffmpeg already gives the user the right install instructions.
        if (binary === 'ffprobe' && declared.has('ffmpeg')) continue;
        if (!declared.has(binary)) {
          problems.push(
            `${toolFile.replace(ROOT + '/', '')} uses a command needing "${binary}" but does not list it in requires`,
          );
        }
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
