/**
 * The browser build of Toolbox (`npm run build:web`, published to GitHub Pages).
 *
 * The desktop app talks to its Rust backend over Tauri IPC. In a plain browser
 * there is no backend, so this module answers that IPC itself: settings live in
 * memory, and every command that needs the Mac (encoders, the file system,
 * Finder) fails with a clear "desktop only" message instead of hanging. Tools
 * whose work happens in TypeScript — text, developer, generators, QR, SVG,
 * calculators, date and time — run here exactly as they do in the app.
 */
import { mockConvertFileSrc, mockIPC } from '@tauri-apps/api/mocks';
import type { ToolboxError } from '@/core/types';

export const RELEASES_URL = 'https://github.com/Ale-Newport/swapIT/releases/latest';

const settings: Record<string, unknown> = {
  binaries: {},
  defaultOutputDir: null,
  outputMode: 'same_dir',
  collision: 'rename',
  preserveMetadata: true,
  jpegQuality: 85,
  webpQuality: 82,
  theme: 'system',
  recentHistory: true,
  clipboardHistory: false,
  notifications: false,
  rememberOutputDir: true,
  openLastTool: false,
  defaultVideoCodec: 'libx264',
  defaultVideoCrf: 23,
  radialEnabled: true,
};

const BINARIES: Array<[string, string]> = [
  ['ffmpeg', 'FFmpeg'],
  ['ffprobe', 'FFprobe'],
  ['magick', 'ImageMagick'],
  ['gs', 'Ghostscript'],
  ['pdftoppm', 'Poppler'],
  ['qpdf', 'QPDF'],
  ['exiftool', 'ExifTool'],
  ['tesseract', 'Tesseract'],
  ['pandoc', 'Pandoc'],
  ['soffice', 'LibreOffice'],
  ['yt-dlp', 'yt-dlp'],
];

export function desktopOnly(command: string): ToolboxError {
  return {
    kind: 'unsupported',
    message: 'This part of Toolbox runs on your Mac. Download the desktop app to use it with real files.',
    details: `The web demo has no native backend for “${command}”. ${RELEASES_URL}`,
  };
}

mockConvertFileSrc('macos');

mockIPC(
  (cmd, payload) => {
    const args = (payload ?? {}) as Record<string, unknown>;
    switch (cmd) {
      case 'get_settings':
        return { ...settings };
      case 'update_settings':
        Object.assign(settings, (args.patch as Record<string, unknown>) ?? {});
        return { ...settings };
      case 'check_binaries':
        return BINARIES.map(([id, label]) => ({
          id,
          label,
          installed: false,
          path: null,
          version: null,
          installHint: `brew install ${id}`,
          usedFor: 'Desktop app only',
          overridden: false,
        }));
      case 'install_instructions':
        return { id: args.id, label: String(args.id), command: `brew install ${String(args.id)}`, homebrewAvailable: false };
      case 'radial_status':
        return null;
      case 'cancel_job':
        return false;
      case 'plugin:clipboard-manager|write_text':
        return navigator.clipboard?.writeText(String(args.text ?? '')).then(() => null) ?? null;
      case 'plugin:clipboard-manager|read_text':
        return navigator.clipboard?.readText() ?? '';
      default:
        if (cmd.startsWith('plugin:notification|is_permission_granted')) return false;
        if (cmd.startsWith('plugin:os|')) return cmd.endsWith('platform') ? 'macos' : '';
        // Clipboard writes, the store, event listeners and dialogs: harmless no-ops.
        // A dialog that returns null reads as "the user cancelled".
        if (cmd.startsWith('plugin:')) return null;
        throw desktopOnly(cmd);
    }
  },
  { shouldMockEvents: true },
);
