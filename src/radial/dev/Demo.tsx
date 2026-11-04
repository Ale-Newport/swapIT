/**
 * Browser-only preview of the radial overlay (dev builds, `#/radial-demo`).
 *
 * The real overlay is a transparent native window whose blur comes from macOS.
 * Here the IPC is mocked and a CSS `backdrop-filter` stands in for the native
 * glass, masked with the same shape the backend would receive — enough to
 * iterate on the look and the interactions without building the app.
 */
import { emit } from '@tauri-apps/api/event';
import { mockConvertFileSrc, mockIPC } from '@tauri-apps/api/mocks';
import { useEffect, useState } from 'react';
import type { RadialLayout, RadialOpenPayload } from '../model';
import RadialApp from '../RadialApp';
import { RING } from '../geometry';

(window as unknown as { __RADIAL_DEMO__: boolean }).__RADIAL_DEMO__ = true;
mockConvertFileSrc('macos');

const FILES: Record<string, Partial<{ kind: string; extension: string; size: number; mime: string; isDir: boolean }>> = {
  'Sunset over Lisbon.heic': { kind: 'image', extension: 'heic', size: 3_412_000, mime: 'image/heic' },
  'Beach.jpg': { kind: 'image', extension: 'jpg', size: 2_180_000, mime: 'image/jpeg' },
  'Holiday clip.mov': { kind: 'video', extension: 'mov', size: 184_000_000, mime: 'video/quicktime' },
  'Podcast ep 12.wav': { kind: 'audio', extension: 'wav', size: 62_000_000, mime: 'audio/wav' },
  'Quarterly report.pdf': { kind: 'pdf', extension: 'pdf', size: 4_800_000, mime: 'application/pdf' },
  'Proposal.docx': { kind: 'document', extension: 'docx', size: 120_000, mime: 'application/msword' },
  'config.json': { kind: 'data', extension: 'json', size: 2_400, mime: 'application/json' },
  'notes.md': { kind: 'text', extension: 'md', size: 5_100, mime: 'text/markdown' },
  'Photos 2026': { kind: 'folder', extension: '', size: 0, isDir: true, mime: 'inode/directory' },
  'backup.zip': { kind: 'archive', extension: 'zip', size: 88_000_000, mime: 'application/zip' },
};

function fakeIcon(label: string): string {
  const hue = [...label].reduce((n, c) => n + c.charCodeAt(0), 0) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 80% 70%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360} 70% 45%)"/></linearGradient></defs><rect x="10" y="6" width="108" height="116" rx="16" fill="url(#g)"/><circle cx="46" cy="46" r="14" fill="rgba(255,255,255,.7)"/><path d="M14 112 L52 70 L74 92 L92 72 L114 106 Z" fill="rgba(255,255,255,.55)"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

let layoutListener: ((l: RadialLayout) => void) | null = null;
const log: string[] = [];

mockIPC(
  (cmd, payload) => {
    const args = (payload ?? {}) as Record<string, unknown>;
    switch (cmd) {
      case 'get_settings':
        return {
          binaries: {},
          defaultOutputDir: null,
          outputMode: 'same_dir',
          collision: 'rename',
          preserveMetadata: true,
          jpegQuality: 85,
          webpQuality: 82,
          theme: 'light',
          recentHistory: true,
          clipboardHistory: false,
          notifications: true,
          rememberOutputDir: true,
          openLastTool: true,
          defaultVideoCodec: 'libx264',
          defaultVideoCrf: 23,
        };
      case 'check_binaries':
        return ['ffmpeg', 'ffprobe', 'magick', 'gs', 'pdftoppm', 'pdftotext', 'tesseract', 'pandoc', 'soffice', 'qpdf', 'yt-dlp'].map((id) => ({
          id,
          label: id,
          installed: !['qpdf', 'yt-dlp', 'soffice'].includes(id),
          installHint: `brew install ${id}`,
          usedFor: '',
          overridden: false,
        }));
      case 'install_instructions':
        return { id: args.id, label: String(args.id), command: `brew install ${String(args.id)}`, homebrewAvailable: true };
      case 'inspect_paths':
        return (args.paths as string[]).map((p) => {
          const name = p.split('/').pop() ?? p;
          const meta = FILES[name] ?? { kind: 'other', extension: name.split('.').pop() ?? '', size: 1000, mime: 'application/octet-stream' };
          return {
            path: p,
            name,
            stem: name.replace(/\.[^.]+$/, ''),
            extension: meta.extension ?? '',
            mime: meta.mime ?? '',
            kind: meta.kind ?? 'other',
            size: meta.size ?? 0,
            isDir: Boolean(meta.isDir),
            created: null,
            modified: null,
          };
        });
      case 'file_icon':
      case 'file_thumbnail':
        return fakeIcon(String(args.path));
      case 'clipboard_summary':
        return { kind: 'text', preview: 'https://example.com/a-long-link-copied-earlier', count: 48 };
      case 'default_folders':
        return { desktop: '/Users/demo/Desktop', documents: '/Users/demo/Documents', downloads: '/Users/demo/Downloads', home: '/Users/demo' };
      case 'radial_set_layout':
        layoutListener?.(args.layout as RadialLayout);
        return null;
      case 'radial_hide':
      case 'radial_release_focus':
      case 'open_in_main':
      case 'reveal_in_finder':
      case 'open_path':
      case 'quick_look':
        log.push(`${cmd} ${JSON.stringify(args)}`);
        return null;
      case 'process_images':
      case 'process_video':
      case 'compress_pdf':
      case 'create_archive':
      case 'pdf_to_images':
      case 'pdf_to_text':
        return new Promise((resolve) => {
          const jobId = String(args.jobId);
          const inputs = (args.inputs as string[]) ?? [];
          let done = 0;
          const tick = setInterval(() => {
            done += 1;
            void emit('toolbox://progress', { jobId, progress: done / 5, done: 0, total: inputs.length || 1, message: null, currentFile: inputs[0] ?? null });
            if (done >= 5) {
              clearInterval(tick);
              resolve({
                results: inputs.map((p) => ({
                  path: p.replace(/\.[^.]+$/, '-out.jpg'),
                  name: (p.split('/').pop() ?? 'file').replace(/\.[^.]+$/, '-out.jpg'),
                  size: 640_000,
                  source: p,
                  sourceSize: 3_412_000,
                  disposition: 'created',
                })),
                failures: [],
                cancelled: false,
                elapsedMs: 900,
              });
            }
          }, 260);
        });
      case 'create_text_file':
        return { path: `${args.dir}/${args.name}.${args.ext}`, name: `${args.name}.${args.ext}`, size: String(args.content ?? '').length, source: null, sourceSize: null, disposition: 'created' };
      case 'create_folder':
        return { results: [{ path: `${args.dir}/${args.name}`, name: String(args.name), size: 0, disposition: 'created' }], failures: [], cancelled: false, elapsedMs: 3 };
      case 'trash_paths':
        return (args.paths as string[]).length;
      default:
        // Plugins (clipboard, notification, dialog, fs…) and anything else: harmless nothing.
        if (cmd.startsWith('plugin:notification|is_permission_granted')) return true;
        return null;
    }
  },
  { shouldMockEvents: true },
);

type Scenario = { label: string; paths: string[]; intent?: string };
const SCENARIOS: Scenario[] = [
  { label: 'HEIC photo', paths: ['/Users/demo/Pictures/Sunset over Lisbon.heic'] },
  { label: 'JPG', paths: ['/Users/demo/Pictures/Beach.jpg'] },
  { label: '3 photos', paths: ['/Users/demo/Pictures/Beach.jpg', '/Users/demo/Pictures/Sunset over Lisbon.heic', '/Users/demo/Pictures/Beach2.jpg'] },
  { label: 'Video', paths: ['/Users/demo/Movies/Holiday clip.mov'] },
  { label: 'Audio', paths: ['/Users/demo/Music/Podcast ep 12.wav'] },
  { label: 'PDF', paths: ['/Users/demo/Documents/Quarterly report.pdf'] },
  { label: 'Word', paths: ['/Users/demo/Documents/Proposal.docx'] },
  { label: 'JSON', paths: ['/Users/demo/Documents/config.json'] },
  { label: 'Markdown', paths: ['/Users/demo/Documents/notes.md'] },
  { label: 'Folder', paths: ['/Users/demo/Pictures/Photos 2026'] },
  { label: 'Archive', paths: ['/Users/demo/Downloads/backup.zip'] },
  { label: 'Create (empty)', paths: [] },
  { label: 'New Markdown', paths: [], intent: 'create:markdown' },
  { label: 'New text', paths: [], intent: 'create:text' },
  { label: 'Record', paths: [], intent: 'record' },
];

let counter = 0;
function open(s: Scenario, trigger: RadialOpenPayload['trigger'] = 'hotkey'): void {
  counter += 1;
  void emit('radial://open', {
    id: counter,
    trigger,
    intent: s.intent ?? 'ring',
    paths: s.paths,
    folder: s.paths.length === 0 ? '/Users/demo/Documents' : null,
    frontApp: { name: 'Finder', bundleId: 'com.apple.finder' },
    holdKey: false,
    permission: null,
    cursor: { x: 0, y: 0 },
  } satisfies RadialOpenPayload);
}

export default function Demo() {
  const [layout, setLayout] = useState<RadialLayout>({
    width: 560,
    height: 560,
    anchor: 'keep',
    shape: { kind: 'ring', outer: RING.outer, inner: RING.inner, core: RING.core },
    sticky: false,
  });
  const [dark, setDark] = useState(window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    layoutListener = (l) => {
      setLayout(l);
      setVisible(true);
    };
    return () => {
      layoutListener = null;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.demoDark = dark ? '1' : '0';
  }, [dark]);

  const mask = (() => {
    const s = layout.shape;
    if (s.kind === 'ring') {
      const stops = `#000 0 ${s.core}px, transparent ${s.core + 0.8}px ${s.inner - 0.8}px, #000 ${s.inner}px ${s.outer}px, transparent ${s.outer + 0.8}px`;
      return `radial-gradient(circle at 50% 50%, ${stops})`;
    }
    return undefined;
  })();

  const radius = layout.shape.kind === 'rrect' ? layout.shape.radius : 0;
  const inset = layout.shape.kind === 'rrect' ? (layout.shape.inset ?? 0) : 0;

  return (
    <div className="demo-wall" data-dark={dark}>
      <style>{`
        .demo-wall { position: fixed; inset: 0; overflow: hidden; font-family: -apple-system, 'SF Pro Text', sans-serif;
          background:
            radial-gradient(900px 600px at 15% 20%, #ff9a8b 0%, transparent 60%),
            radial-gradient(800px 700px at 85% 25%, #6a8cff 0%, transparent 60%),
            radial-gradient(900px 700px at 60% 95%, #ffd36e 0%, transparent 55%),
            linear-gradient(135deg, #1f2a5a, #6b3a7a); }
        .demo-wall[data-dark='true'] { }
        .demo-window { position: absolute; left: 70px; top: 60px; width: 640px; height: 420px; border-radius: 14px;
          background: rgba(255,255,255,.82); box-shadow: 0 30px 80px rgba(0,0,0,.35); padding: 18px 22px; color: #222; }
        .demo-window h3 { margin: 0 0 12px; font-size: 15px; }
        .demo-window p { margin: 6px 0; font-size: 13px; line-height: 1.5; }
        .demo-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 14px; margin-top: 16px; }
        .demo-grid i { aspect-ratio: 1; border-radius: 10px; background: linear-gradient(135deg, #cfe0ff, #ffd6e7); display: block; }
        .demo-bar { position: fixed; left: 50%; bottom: 14px; transform: translateX(-50%); display: flex; gap: 6px; flex-wrap: wrap; justify-content: center;
          max-width: 94vw; padding: 8px; border-radius: 14px; background: rgba(0,0,0,.55); backdrop-filter: blur(14px); z-index: 99999; }
        .demo-bar button { border: 0; border-radius: 8px; padding: 5px 10px; font-size: 12px; color: #fff; background: rgba(255,255,255,.16); cursor: pointer; }
        .demo-bar button:hover { background: rgba(255,255,255,.3); }
        .demo-native { position: absolute; pointer-events: none; }
        .demo-native > i { position: absolute; display: block; backdrop-filter: blur(26px) saturate(1.7) brightness(1.1); -webkit-backdrop-filter: blur(26px) saturate(1.7) brightness(1.1);
          background: rgba(255,255,255,.28); }
        .demo-wall[data-dark='true'] .demo-native > i { backdrop-filter: blur(26px) saturate(1.5) brightness(.5); -webkit-backdrop-filter: blur(26px) saturate(1.5) brightness(.5);
          background: rgba(20,22,30,.34); }
        .demo-frame { position: absolute; contain: layout; transform: translate(0,0); }
      `}</style>

      <div className="demo-window">
        <h3>Photos 2026</h3>
        <p>Select a file in Finder and press ⌃⌥Space — the radial menu appears at your cursor. This backdrop exists only so the glass has something to refract.</p>
        <div className="demo-grid">
          {Array.from({ length: 18 }, (_, i) => (
            <i key={i} style={{ filter: `hue-rotate(${i * 22}deg)` }} />
          ))}
        </div>
      </div>

      {visible && (
        <div
          className="demo-frame"
          style={{
            width: layout.width,
            height: layout.height,
            left: '50%',
            marginLeft: -layout.width / 2,
            ...(layout.anchor === 'top' ? { top: 28 } : { top: '50%', marginTop: -layout.height / 2 - 20 }),
          }}
        >
          <div className="demo-native" style={{ inset: 0 }}>
            <i
              style={{
                inset: inset,
                borderRadius: radius,
                WebkitMaskImage: mask,
                maskImage: mask,
              }}
            />
          </div>
          <RadialApp />
        </div>
      )}
      {!visible && <RadialApp />}

      <div className="demo-bar">
        {SCENARIOS.map((s) => (
          <button key={s.label} type="button" onClick={() => open(s)}>
            {s.label}
          </button>
        ))}
        <button type="button" onClick={() => open(SCENARIOS[0], 'drag')}>
          drag mode
        </button>
        <button type="button" onClick={() => setDark((d) => !d)}>
          {dark ? 'dark' : 'light'} wallpaper
        </button>
      </div>
    </div>
  );
}
