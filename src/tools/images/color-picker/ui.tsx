import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { call } from '@/core/bridge';
import { formatBytes } from '@/core/format';
import { useToolFiles } from '@/core/useToolFiles';
import { assetUrl, FileDropZone, ToolShell } from '@/components/tool';
import { Alert, Badge, Button, CopyButton, Field, Icon, Section, Spinner, Switch } from '@/components/ui';
import {
  formatHsl,
  formatRgb,
  pushRecent,
  readableInk,
  rgbToHsl,
  toHex,
  type Rgb,
} from './logic';

/** Backend `pick_color_at` payload — the authoritative sample, read from the file itself. */
interface PickedColor {
  hex: string;
  rgb: [number, number, number];
}

/** Canvas backing store cap: plenty of detail without a 50 MP allocation. */
const MAX_CANVAS = 4096;
const MAX_VIEW_HEIGHT = 520;
const LOUPE_SIZE = 132;
const LOUPE_ZOOM = 11;

interface View {
  canvasW: number;
  canvasH: number;
  naturalW: number;
  naturalH: number;
}

export default function ColorPicker() {
  const files = useToolFiles({ kinds: ['image'], filterName: 'Images', multiple: false });
  const path = files.files[0]?.path ?? null;
  const file = files.files[0] ?? null;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const loupeBoxRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pixelsRef = useRef<ImageData | null>(null);

  const [view, setView] = useState<View | null>(null);
  const [stageWidth, setStageWidth] = useState(720);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tainted, setTainted] = useState(false);
  const [hover, setHover] = useState<{ color: Rgb; x: number; y: number } | null>(null);
  const [picked, setPicked] = useState<Rgb | null>(null);
  const [pickedAt, setPickedAt] = useState<{ x: number; y: number } | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [recents, setRecents] = useState<Rgb[]>([]);
  const [copyOnPick, setCopyOnPick] = useState(false);

  // ---------------------------------------------------------------- loading

  useEffect(() => {
    if (!path) {
      setView(null);
      pixelsRef.current = null;
      setLoading(false);
      setLoadError(null);
      setHover(null);
      setPicked(null);
      setPickedAt(null);
      setPickError(null);
      setTainted(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setPickError(null);
    setTainted(false);
    setHover(null);
    setPicked(null);
    setPickedAt(null);

    const draw = (img: HTMLImageElement) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const natural = { w: img.naturalWidth, h: img.naturalHeight };
      if (!natural.w || !natural.h) {
        setLoadError('This image reports a size of zero pixels, so there is nothing to sample.');
        return;
      }
      const shrink = Math.min(1, MAX_CANVAS / Math.max(natural.w, natural.h));
      const canvasW = Math.max(1, Math.round(natural.w * shrink));
      const canvasH = Math.max(1, Math.round(natural.h * shrink));
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        setLoadError('This machine could not open a 2D canvas, so the picker cannot render the image.');
        return;
      }
      ctx.clearRect(0, 0, canvasW, canvasH);
      ctx.drawImage(img, 0, 0, canvasW, canvasH);
      try {
        pixelsRef.current = ctx.getImageData(0, 0, canvasW, canvasH);
        setTainted(false);
      } catch {
        // A cross-origin source taints the canvas: live hover sampling is off,
        // but clicking still reads the real pixel through the backend.
        pixelsRef.current = null;
        setTainted(true);
      }
      setView({ canvasW, canvasH, naturalW: natural.w, naturalH: natural.h });
    };

    void (async () => {
      // A data URL never taints the canvas, so live sampling keeps working.
      // Very large files fall back to the asset URL and backend-only picking.
      let src: string;
      try {
        src = await call<string>('image_to_base64', { input: path, asDataUrl: true });
      } catch {
        src = assetUrl(path);
      }
      if (cancelled) return;
      if (!src) {
        setLoading(false);
        setLoadError('Toolbox could not read this file for preview. Check that it still exists.');
        return;
      }
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        draw(img);
        setLoading(false);
      };
      img.onerror = () => {
        if (cancelled) return;
        setLoading(false);
        setLoadError(
          'This format cannot be displayed for sampling. Convert it to PNG or JPEG with the Image Converter first, then pick colours from that copy.',
        );
      };
      img.src = src;
    })();

    return () => {
      cancelled = true;
    };
  }, [path]);

  // Keep the rendered size in step with the window.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width && width > 0) setStageWidth(width);
    });
    observer.observe(stage);
    setStageWidth(stage.clientWidth || 720);
    return () => observer.disconnect();
  }, [view]);

  const display = useMemo(() => {
    if (!view) return { width: 0, height: 0, scale: 1 };
    const scale = Math.min(stageWidth / view.canvasW, MAX_VIEW_HEIGHT / view.canvasH, 8);
    const safe = Math.max(scale, 0.02);
    return {
      width: Math.round(view.canvasW * safe),
      height: Math.round(view.canvasH * safe),
      scale: safe,
    };
  }, [view, stageWidth]);

  // ---------------------------------------------------------------- sampling

  const pointFor = useCallback(
    (clientX: number, clientY: number): { cx: number; cy: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas || !view) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      const cx = Math.floor(((clientX - rect.left) / rect.width) * view.canvasW);
      const cy = Math.floor(((clientY - rect.top) / rect.height) * view.canvasH);
      return {
        cx: Math.max(0, Math.min(view.canvasW - 1, cx)),
        cy: Math.max(0, Math.min(view.canvasH - 1, cy)),
      };
    },
    [view],
  );

  const readPixel = useCallback(
    (cx: number, cy: number): Rgb | null => {
      const data = pixelsRef.current;
      if (!data || !view) return null;
      const index = (cy * view.canvasW + cx) * 4;
      if (index < 0 || index + 2 >= data.data.length) return null;
      return { r: data.data[index], g: data.data[index + 1], b: data.data[index + 2] };
    },
    [view],
  );

  const drawLoupe = useCallback((cx: number, cy: number) => {
    const loupe = loupeRef.current;
    const canvas = canvasRef.current;
    if (!loupe || !canvas) return;
    const ctx = loupe.getContext('2d');
    if (!ctx) return;
    const span = LOUPE_SIZE / LOUPE_ZOOM;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
    // Clip the source window by hand so the crosshair keeps marking the sampled
    // pixel when the cursor is near an edge of the image.
    const left = cx - span / 2;
    const top = cy - span / 2;
    const cutLeft = Math.max(0, -left);
    const cutTop = Math.max(0, -top);
    const cutRight = Math.max(0, left + span - canvas.width);
    const cutBottom = Math.max(0, top + span - canvas.height);
    const sw = span - cutLeft - cutRight;
    const sh = span - cutTop - cutBottom;
    if (sw > 0 && sh > 0) {
      ctx.drawImage(
        canvas,
        left + cutLeft,
        top + cutTop,
        sw,
        sh,
        cutLeft * LOUPE_ZOOM,
        cutTop * LOUPE_ZOOM,
        sw * LOUPE_ZOOM,
        sh * LOUPE_ZOOM,
      );
    }
    const box = Math.round(LOUPE_ZOOM);
    const origin = Math.round((LOUPE_SIZE - box) / 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeRect(origin - 0.5, origin - 0.5, box + 1, box + 1);
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeRect(origin + 0.5, origin + 0.5, box - 1, box - 1);
  }, []);

  const onMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const point = pointFor(event.clientX, event.clientY);
      if (!point || !view) return;
      drawLoupe(point.cx, point.cy);
      const stage = stageRef.current;
      const box = loupeBoxRef.current;
      if (stage && box) {
        const rect = stage.getBoundingClientRect();
        const x = Math.min(
          Math.max(event.clientX - rect.left + 20, 8),
          Math.max(rect.width - LOUPE_SIZE - 10, 8),
        );
        const y = Math.min(
          Math.max(event.clientY - rect.top - LOUPE_SIZE - 16, 8),
          Math.max(rect.height - LOUPE_SIZE - 10, 8),
        );
        box.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        box.style.opacity = '1';
      }
      const color = readPixel(point.cx, point.cy);
      const sx = Math.min(view.naturalW - 1, Math.round((point.cx * view.naturalW) / view.canvasW));
      const sy = Math.min(view.naturalH - 1, Math.round((point.cy * view.naturalH) / view.canvasH));
      setHover(color ? { color, x: sx, y: sy } : null);
    },
    [pointFor, readPixel, drawLoupe, view],
  );

  const onLeave = useCallback(() => {
    setHover(null);
    const box = loupeBoxRef.current;
    if (box) box.style.opacity = '0';
  }, []);

  const commit = useCallback(
    (color: Rgb) => {
      setPicked(color);
      setRecents((list) => pushRecent(list, color));
      if (copyOnPick) void navigator.clipboard.writeText(toHex(color)).catch(() => undefined);
    },
    [copyOnPick],
  );

  const onPick = useCallback(
    async (event: React.MouseEvent<HTMLCanvasElement>) => {
      const point = pointFor(event.clientX, event.clientY);
      if (!point || !view || !path) return;
      setPickError(null);
      const local = readPixel(point.cx, point.cy);
      if (local) setPicked(local);
      const sx = Math.min(view.naturalW - 1, Math.round((point.cx * view.naturalW) / view.canvasW));
      const sy = Math.min(view.naturalH - 1, Math.round((point.cy * view.naturalH) / view.canvasH));
      setPickedAt({ x: sx, y: sy });
      try {
        // The backend reads the untouched source file, so it is the value of record.
        const exact = await call<PickedColor>('pick_color_at', { input: path, x: sx, y: sy });
        commit({ r: exact.rgb[0], g: exact.rgb[1], b: exact.rgb[2] });
      } catch (err) {
        const message =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Toolbox could not read that pixel from the file.';
        if (local) {
          commit(local);
          setPickError(`${message} The value shown was read from the preview instead.`);
        } else {
          setPickError(message);
        }
      }
    },
    [pointFor, readPixel, view, path, commit],
  );

  // ---------------------------------------------------------------- render

  const shown = picked ?? hover?.color ?? null;
  const hsl = shown ? rgbToHsl(shown) : null;

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop an image here"
            hint="Click anywhere on it to sample that pixel"
            compact={Boolean(path)}
          />

          {loadError && <Alert tone="warn" title="Nothing to sample">{loadError}</Alert>}

          {path && !loadError && (
            <Section
              title="Click to sample"
              description={
                view
                  ? `${view.naturalW} × ${view.naturalH} px${
                      view.canvasW !== view.naturalW ? ' · preview downscaled for speed' : ''
                    }`
                  : 'Loading the image…'
              }
              actions={
                hover ? (
                  <Badge>
                    x {hover.x} · y {hover.y}
                  </Badge>
                ) : undefined
              }
              dense
            >
              <div
                ref={stageRef}
                className="relative flex min-h-40 items-center justify-center overflow-hidden rounded-lg bg-canvas p-2"
              >
                {loading && <Spinner />}
                <canvas
                  ref={canvasRef}
                  onMouseMove={onMove}
                  onMouseLeave={onLeave}
                  onClick={(event) => void onPick(event)}
                  className="checkerboard cursor-crosshair rounded-md"
                  style={{
                    width: display.width || undefined,
                    height: display.height || undefined,
                    display: view && !loading ? 'block' : 'none',
                    imageRendering: display.scale > 1.5 ? 'pixelated' : 'auto',
                  }}
                />
                <div
                  ref={loupeBoxRef}
                  className="pointer-events-none absolute left-0 top-0 overflow-hidden rounded-lg border border-line-strong bg-panel opacity-0 shadow-[0_6px_20px_rgba(0,0,0,0.18)] transition-opacity"
                  style={{ width: LOUPE_SIZE, height: LOUPE_SIZE }}
                >
                  <canvas ref={loupeRef} width={LOUPE_SIZE} height={LOUPE_SIZE} className="block" />
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-ink-faint">
                <span>
                  {file ? `${file.name} · ${formatBytes(file.size)}` : ''}
                  {display.scale !== 1 && view ? ` · shown at ${Math.round(display.scale * 100)}%` : ''}
                </span>
                {hover ? (
                  <span className="font-mono text-ink-soft">{toHex(hover.color)}</span>
                ) : (
                  <span>{tainted ? 'Click a pixel to read it from the file' : 'Hover to preview, click to keep'}</span>
                )}
              </div>
            </Section>
          )}

          {tainted && !loadError && path && (
            <Alert tone="info" title="Live preview sampling is unavailable for this file">
              It is too large to inline, so the magnifier follows the image but the readout only
              updates when you click — each click reads the exact pixel from the file itself.
            </Alert>
          )}

          {pickError && <Alert tone="warn">{pickError}</Alert>}
        </>
      }
      aside={
        <>
          <Section
            title="Sampled colour"
            description={
              pickedAt && picked ? `Pixel ${pickedAt.x}, ${pickedAt.y} of the source file` : 'Click the image to sample'
            }
          >
            <div className="space-y-3">
              <div
                className="flex h-24 items-end justify-between rounded-lg border border-line p-2.5"
                style={{ background: shown ? toHex(shown) : 'transparent' }}
              >
                {shown ? (
                  <span
                    className="font-mono text-[13px] font-medium"
                    style={{ color: readableInk(shown) }}
                  >
                    {toHex(shown)}
                  </span>
                ) : (
                  <span className="flex w-full items-center justify-center gap-1.5 text-[12px] text-ink-faint">
                    <Icon name="MousePointerClick" size={14} />
                    No colour sampled yet
                  </span>
                )}
                {shown && !picked && (
                  <span className="text-[11px]" style={{ color: readableInk(shown) }}>
                    preview
                  </span>
                )}
              </div>

              <ValueRow label="HEX" value={shown ? toHex(shown) : ''} />
              <ValueRow label="RGB" value={shown ? formatRgb(shown) : ''} />
              <ValueRow label="HSL" value={hsl ? formatHsl(hsl) : ''} />

              <Field
                inline
                label="Copy on click"
                hint="Put the hex on the clipboard as you sample"
              >
                <Switch checked={copyOnPick} onCheckedChange={setCopyOnPick} />
              </Field>
            </div>
          </Section>

          <Section
            title="Recent samples"
            description={recents.length ? `Last ${recents.length} of 12` : 'The last 12 colours you sampled'}
            actions={
              recents.length > 0 ? (
                <>
                  <CopyButton
                    size="sm"
                    variant="ghost"
                    label="Copy all"
                    value={() => recents.map(toHex).join('\n')}
                  />
                  <Button size="sm" variant="ghost" icon="Trash2" onClick={() => setRecents([])}>
                    Clear
                  </Button>
                </>
              ) : undefined
            }
            dense
          >
            {recents.length === 0 ? (
              <p className="px-1 py-2 text-[12px] text-ink-faint">
                Sampled colours collect here so you can compare and copy them later.
              </p>
            ) : (
              <ul className="space-y-1">
                {recents.map((color) => {
                  const hex = toHex(color);
                  return (
                    <li key={hex} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPicked(color)}
                        title={`Show ${hex}`}
                        className="h-6 w-6 shrink-0 rounded-md border border-line"
                        style={{ background: hex }}
                      />
                      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink selectable">
                        {hex}
                      </span>
                      <span className="hidden shrink-0 font-mono text-[11px] text-ink-faint sm:inline">
                        {formatRgb(color)}
                      </span>
                      <CopyButton size="sm" variant="ghost" label="" value={hex} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </>
      }
    />
  );
}

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-9 shrink-0 text-[11px] uppercase tracking-wide text-ink-faint">{label}</span>
      <span className="min-w-0 flex-1 truncate rounded-lg border border-line bg-canvas px-2.5 py-1.5 font-mono text-[12.5px] text-ink selectable">
        {value || '—'}
      </span>
      <CopyButton size="sm" variant="secondary" label="" value={value} disabled={!value} />
    </div>
  );
}
