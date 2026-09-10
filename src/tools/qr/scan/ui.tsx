import { readImage } from '@tauri-apps/plugin-clipboard-manager';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useCallback, useEffect, useRef, useState } from 'react';
import { appPaths, asToolboxError, call } from '@/core/bridge';
import type { FileResult, ToolboxError } from '@/core/types';
import { useToolFiles } from '@/core/useToolFiles';
import { ErrorDisplay, FileDropZone, ToolShell, assetUrl } from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Field,
  Icon,
  Section,
  Segmented,
  Spinner,
} from '@/components/ui';
import { decodeImageSource, rgbaToDataUrl } from './decode';
import { describeKind, explain, toOpenableUrl } from './logic';

type ScreenshotMode = 'interactive' | 'window' | 'full';

interface ScanState {
  status: 'working' | 'done';
  text: string | null;
  problem: string | null;
}

interface PastedImage {
  id: string;
  name: string;
  src: string;
  state: ScanState;
}

const WORKING: ScanState = { status: 'working', text: null, problem: null };
const NOT_FOUND = 'No QR code was found in this image. Crop closer to the code, or try a sharper picture.';

export default function QrScanner() {
  const files = useToolFiles({
    kinds: ['image'],
    filterName: 'Images',
    extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff'],
  });
  const [decoded, setDecoded] = useState<Record<string, ScanState>>({});
  const [pasted, setPasted] = useState<PastedImage[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ToolboxError | null>(null);
  const [mode, setMode] = useState<ScreenshotMode>('interactive');
  const started = useRef(new Set<string>());

  // Decode each new file exactly once, in the order they were added.
  useEffect(() => {
    const pending = files.files.filter((file) => !started.current.has(file.path));
    if (pending.length === 0) return;
    for (const file of pending) started.current.add(file.path);
    setDecoded((current) => {
      const next = { ...current };
      for (const file of pending) next[file.path] = WORKING;
      return next;
    });
    void (async () => {
      for (const file of pending) {
        let state: ScanState;
        try {
          const text = await decodeImageSource(assetUrl(file.path));
          state = { status: 'done', text, problem: text ? null : NOT_FOUND };
        } catch (err) {
          state = {
            status: 'done',
            text: null,
            problem: err instanceof Error ? err.message : String(err),
          };
        }
        setDecoded((current) => ({ ...current, [file.path]: state }));
      }
    })();
  }, [files.files]);

  const addPasted = useCallback(async (src: string, name: string) => {
    const id = crypto.randomUUID();
    setPasted((current) => [...current, { id, name, src, state: WORKING }]);
    let state: ScanState;
    try {
      const text = await decodeImageSource(src);
      state = { status: 'done', text, problem: text ? null : NOT_FOUND };
    } catch (err) {
      state = { status: 'done', text: null, problem: err instanceof Error ? err.message : String(err) };
    }
    setPasted((current) => current.map((item) => (item.id === id ? { ...item, state } : item)));
  }, []);

  // ⌘V anywhere on the page, for the screenshot someone just took.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable]')) return;
      const item = Array.from(event.clipboardData?.items ?? []).find((entry) =>
        entry.type.startsWith('image/'),
      );
      const file = item?.getAsFile();
      if (!file) return;
      event.preventDefault();
      const reader = new FileReader();
      reader.onload = () => void addPasted(String(reader.result), 'Pasted image');
      reader.readAsDataURL(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addPasted]);

  const pasteFromClipboard = async () => {
    setBusy('paste');
    setError(null);
    try {
      const image = await readImage();
      const [rgba, size] = await Promise.all([image.rgba(), image.size()]);
      await addPasted(rgbaToDataUrl(rgba, size.width, size.height), 'Clipboard image');
    } catch (err) {
      setError({
        message: 'There is no image on the clipboard. Copy a picture or take a screenshot first, then try again.',
        details: err instanceof Error ? err.message : String(err),
        kind: 'invalid_input',
      });
    } finally {
      setBusy(null);
    }
  };

  const capture = async () => {
    setBusy('screenshot');
    setError(null);
    try {
      const paths = await appPaths();
      const shot = await call<FileResult>('take_screenshot', { mode, outputDir: paths.temp });
      await files.add([shot.path]);
    } catch (err) {
      const failure = asToolboxError(err);
      // Pressing Escape during a selection capture is not an error worth showing.
      if (failure.kind !== 'cancelled') setError(failure);
    } finally {
      setBusy(null);
    }
  };

  const clearAll = () => {
    files.clear();
    setPasted([]);
    setDecoded({});
    started.current.clear();
    setError(null);
  };

  const items = [
    ...files.files.map((file) => ({
      key: file.path,
      name: file.name,
      src: assetUrl(file.path),
      state: decoded[file.path] ?? WORKING,
      remove: () => {
        started.current.delete(file.path);
        setDecoded((current) => {
          const next = { ...current };
          delete next[file.path];
          return next;
        });
        files.remove(file.path);
      },
    })),
    ...pasted.map((item) => ({
      key: item.id,
      name: item.name,
      src: item.src,
      state: item.state,
      remove: () => setPasted((current) => current.filter((entry) => entry.id !== item.id)),
    })),
  ];

  const found = items.filter((item) => item.state.text).length;
  const settled = items.filter((item) => item.state.status === 'done').length;

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop an image with a QR code"
            hint="PNG, JPEG, WebP, GIF — screenshots, photos and posters all work"
            accept="Decoded here on your Mac; no picture ever leaves the machine"
            allowFolders
          />

          {error && <ErrorDisplay error={error} />}

          {items.length > 0 && (
            <Section
              title="Decoded"
              description={
                settled < items.length
                  ? `Reading ${items.length - settled} of ${items.length}…`
                  : `${found} of ${items.length} image${items.length === 1 ? '' : 's'} contained a code`
              }
              actions={
                <Button size="sm" variant="ghost" icon="Trash2" onClick={clearAll}>
                  Clear
                </Button>
              }
            >
              <div className="space-y-3">
                {items.map((item) => (
                  <ResultCard key={item.key} name={item.name} src={item.src} state={item.state} onRemove={item.remove} />
                ))}
              </div>
            </Section>
          )}

        </>
      }
      aside={
        <>
          <Section title="Other ways in">
            <div className="space-y-3">
              <Button
                icon="ClipboardPaste"
                full
                loading={busy === 'paste'}
                disabled={Boolean(busy)}
                onClick={() => void pasteFromClipboard()}
              >
                Paste image from clipboard
              </Button>
              <p className="text-[11.5px] text-ink-faint">You can also press ⌘V anywhere on this page.</p>

              <Field label="Screenshot">
                <Segmented
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'interactive', label: 'Selection' },
                    { value: 'window', label: 'Window' },
                    { value: 'full', label: 'Screen' },
                  ]}
                  className="w-full"
                />
              </Field>
              <Button
                icon="Camera"
                full
                loading={busy === 'screenshot'}
                disabled={Boolean(busy)}
                onClick={() => void capture()}
              >
                Take a screenshot
              </Button>
              <p className="text-[11.5px] text-ink-faint">
                Captures with macOS and reads the result straight away. The image is kept in the temporary folder.
              </p>
            </div>
          </Section>

          <Section title="Trouble reading a code?">
            <ul className="space-y-1.5 text-[12px] text-ink-faint">
              <li>Crop so the code fills most of the picture.</li>
              <li>Keep the whole quiet zone — the white border counts.</li>
              <li>Avoid glare and steep angles; flat and evenly lit reads best.</li>
              <li>Inverted and low-resolution codes are retried automatically.</li>
            </ul>
          </Section>
        </>
      }
    />
  );
}

function ResultCard({
  name,
  src,
  state,
  onRemove,
}: {
  name: string;
  src: string;
  state: ScanState;
  onRemove: () => void;
}) {
  const analysis = state.text ? explain(state.text) : null;
  const openable = state.text ? toOpenableUrl(state.text) : null;

  return (
    <div className="rounded-card border border-line bg-panel">
      <header className="flex items-center gap-2.5 border-b border-line px-3 py-2">
        <img src={src} alt="" className="h-9 w-9 shrink-0 rounded-md border border-line object-cover" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink" title={name}>
          {name}
        </span>
        {analysis && <Badge tone="accent">{describeKind(analysis.kind)}</Badge>}
        {state.status === 'done' && state.text && <CopyButton value={state.text} label="Copy" />}
        <Button size="sm" variant="ghost" icon="X" onClick={onRemove}>
          Remove
        </Button>
      </header>

      <div className="space-y-3 p-3">
        {state.status === 'working' && (
          <div className="flex items-center gap-2 text-[12.5px] text-ink-faint">
            <Spinner size={14} /> Looking for a code…
          </div>
        )}

        {state.status === 'done' && !state.text && <Alert tone="warn">{state.problem ?? NOT_FOUND}</Alert>}

        {state.text && (
          <>
            <pre className="selectable max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-canvas p-2.5 font-mono text-[11.5px] leading-[1.55] text-ink">
              {state.text}
            </pre>

            {analysis && analysis.details.length > 0 && (
              <dl className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                {analysis.details.map((detail, index) => (
                  <div key={`${detail.label}-${index}`} className="flex items-start gap-3 px-3 py-1.5">
                    <dt className="w-28 shrink-0 text-[11.5px] uppercase tracking-wide text-ink-faint">
                      {detail.label}
                    </dt>
                    <dd className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[12.5px] text-ink selectable">
                      {detail.value}
                    </dd>
                    {detail.secret && <CopyButton value={detail.value} label="Copy" />}
                  </div>
                ))}
              </dl>
            )}

            {openable && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2">
                <Icon name="TriangleAlert" size={14} className="shrink-0 text-warn" />
                <p className="min-w-0 flex-1 text-[11.5px] text-ink-faint">
                  The code decides where this goes. Read the address above before you open it.
                </p>
                <Button size="sm" icon="ExternalLink" onClick={() => void openUrl(openable)}>
                  Open link
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
