import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { asToolboxError, call } from '@/core/bridge';
import { formatBytes } from '@/core/format';
import type { ToolboxError } from '@/core/types';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  ErrorDisplay,
  FileDropZone,
  OptionsGrid,
  OutputSettings,
  PresetRow,
  ResultPanel,
  ToolActions,
  ToolShell,
  assetUrl,
  useOutputSpec,
} from '@/components/tool';
import { Alert, Button, Field, Icon, NumberInput, Section, Stat } from '@/components/ui';
import {
  centeredRect,
  clampRect,
  describeRatio,
  drawRect,
  fitAspect,
  moveRect,
  rectFromAnchor,
  resizeRect,
  type Handle,
  type Point,
  type Rect,
  type Size,
} from './logic';

const IMAGE_EXTENSIONS = [
  'heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff', 'bmp', 'gif',
];

const RATIOS: Array<{ label: string; value: string; hint: string; ratio: number | null }> = [
  { label: 'Free', value: 'free', hint: 'Any shape', ratio: null },
  { label: '1:1', value: '1:1', hint: 'Square — avatars and Instagram posts', ratio: 1 },
  { label: '4:3', value: '4:3', hint: 'Classic photo', ratio: 4 / 3 },
  { label: '3:2', value: '3:2', hint: '35 mm photo', ratio: 3 / 2 },
  { label: '16:9', value: '16:9', hint: 'Widescreen', ratio: 16 / 9 },
  { label: '9:16', value: '9:16', hint: 'Stories and reels', ratio: 9 / 16 },
];

const HANDLES: Array<{ handle: Handle; position: string; cursor: string }> = [
  { handle: 'nw', position: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2', cursor: 'nwse-resize' },
  { handle: 'n', position: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2', cursor: 'ns-resize' },
  { handle: 'ne', position: 'right-0 top-0 translate-x-1/2 -translate-y-1/2', cursor: 'nesw-resize' },
  { handle: 'e', position: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2', cursor: 'ew-resize' },
  { handle: 'se', position: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2', cursor: 'nwse-resize' },
  { handle: 's', position: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2', cursor: 'ns-resize' },
  { handle: 'sw', position: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2', cursor: 'nesw-resize' },
  { handle: 'w', position: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2', cursor: 'ew-resize' },
];

type Drag =
  | { kind: 'move'; from: Rect; clientX: number; clientY: number }
  | { kind: 'resize'; handle: Handle; from: Rect; clientX: number; clientY: number }
  | { kind: 'draw'; origin: Point; clientX: number; clientY: number; started: boolean };

/** Pointer travel, in screen pixels, before a press counts as drawing a new area. */
const DRAW_THRESHOLD = 3;

interface ImageInfoRow {
  width: number;
  height: number;
}

export default function CropImage() {
  const files = useToolFiles({
    kinds: ['image'],
    extensions: IMAGE_EXTENSIONS,
    filterName: 'Images',
    multiple: false,
  });
  const run = useToolRun('images/crop', 'Crop Image');
  const { spec, update } = useOutputSpec({ suffix: '-cropped' });

  const [natural, setNatural] = useState<Size | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [ratioId, setRatioId] = useState('free');
  const [previewFailed, setPreviewFailed] = useState(false);
  const [infoError, setInfoError] = useState<ToolboxError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [stage, setStage] = useState<Size>({ width: 0, height: 0 });

  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  const path = files.paths[0] ?? null;
  const file = files.files[0] ?? null;
  const ratio = RATIOS.find((r) => r.value === ratioId)?.ratio ?? null;

  // Dimensions come from the backend so formats the WebView cannot render
  // (HEIC on some machines) still crop correctly.
  useEffect(() => {
    let alive = true;
    setPreviewFailed(false);
    setInfoError(null);
    if (!path) {
      setNatural(null);
      setRect(null);
      return;
    }
    setNatural(null);
    void (async () => {
      try {
        const rows = await call<ImageInfoRow[]>('image_info', { inputs: [path] });
        if (!alive) return;
        const first = rows[0];
        if (!first || first.width <= 0 || first.height <= 0) {
          setInfoError({
            message: 'Toolbox could not read the size of this image, so there is nothing to crop.',
            details: `image_info returned no usable dimensions for ${path}`,
            kind: 'unsupported',
          });
          return;
        }
        const size = { width: first.width, height: first.height };
        setNatural(size);
        setRect(centeredRect(size, null, 0.9));
      } catch (err) {
        if (!alive) return;
        setNatural(null);
        setInfoError(asToolboxError(err));
      }
    })();
    return () => {
      alive = false;
    };
  }, [path, reloadKey]);

  // Re-shape the selection whenever the ratio (or the image) changes.
  useEffect(() => {
    if (!natural || ratio === null) return;
    setRect((current) => (current ? fitAspect(current, ratio, natural) : centeredRect(natural, ratio)));
  }, [ratio, natural]);

  // The stage has a fixed height, so observing it cannot feed back into layout.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setStage({ width: box.width, height: box.height });
    });
    observer.observe(el);
    setStage({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  const scale =
    natural && natural.width > 0 && natural.height > 0 && stage.width > 0 && stage.height > 0
      ? Math.min(stage.width / natural.width, stage.height / natural.height, 4)
      : 1;
  const displayWidth = natural ? Math.max(1, natural.width * scale) : 0;
  const displayHeight = natural ? Math.max(1, natural.height * scale) : 0;

  /** Pointer position in image pixels, relative to the rendered frame. */
  const toImagePoint = useCallback(
    (clientX: number, clientY: number): Point => {
      const frame = frameRef.current;
      if (!frame || !natural) return { x: 0, y: 0 };
      const box = frame.getBoundingClientRect();
      return {
        x: Math.min(natural.width, Math.max(0, (clientX - box.left) / scale)),
        y: Math.min(natural.height, Math.max(0, (clientY - box.top) / scale)),
      };
    },
    [natural, scale],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!natural || !rect || event.button !== 0) return;
    const target = event.target as HTMLElement;
    const role = target.dataset.role;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    if (role === 'move') {
      dragRef.current = { kind: 'move', from: rect, clientX: event.clientX, clientY: event.clientY };
    } else if (role === 'handle' && target.dataset.handle) {
      dragRef.current = {
        kind: 'resize',
        handle: target.dataset.handle as Handle,
        from: rect,
        clientX: event.clientX,
        clientY: event.clientY,
      };
    } else {
      // Wait for real movement — a stray click should not wipe the selection.
      dragRef.current = {
        kind: 'draw',
        origin: toImagePoint(event.clientX, event.clientY),
        clientX: event.clientX,
        clientY: event.clientY,
        started: false,
      };
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !natural) return;
    if (drag.kind === 'draw') {
      if (
        !drag.started &&
        Math.abs(event.clientX - drag.clientX) < DRAW_THRESHOLD &&
        Math.abs(event.clientY - drag.clientY) < DRAW_THRESHOLD
      ) {
        return;
      }
      drag.started = true;
      setRect(drawRect(drag.origin, toImagePoint(event.clientX, event.clientY), natural, ratio));
      return;
    }
    const dx = (event.clientX - drag.clientX) / scale;
    const dy = (event.clientY - drag.clientY) / scale;
    setRect(
      drag.kind === 'move'
        ? moveRect(drag.from, dx, dy, natural)
        : resizeRect(drag.from, drag.handle, dx, dy, natural, ratio),
    );
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const editField = (field: keyof Rect, value: number) => {
    if (!natural || !rect) return;
    const rounded = Math.round(value);
    if (field === 'width' && ratio) {
      setRect(rectFromAnchor({ x: rect.x, y: rect.y }, 1, 1, rounded, rounded / ratio, natural));
      return;
    }
    if (field === 'height' && ratio) {
      setRect(rectFromAnchor({ x: rect.x, y: rect.y }, 1, 1, rounded * ratio, rounded, natural));
      return;
    }
    setRect(clampRect({ ...rect, [field]: rounded }, natural));
  };

  const selectAll = () => {
    if (!natural) return;
    setRatioId('free');
    setRect({ x: 0, y: 0, width: natural.width, height: natural.height });
  };

  const recentre = () => {
    if (!natural) return;
    setRect(centeredRect(natural, ratio, 0.9));
  };

  const execute = () => {
    if (!rect || !path) return;
    void run.execute({
      command: 'process_images',
      total: 1,
      inputs: [path],
      label: `Crop to ${rect.width} × ${rect.height}`,
      args: {
        inputs: [path],
        ops: { crop: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } },
        output: spec,
      },
    });
  };

  const wholeImage =
    rect && natural && rect.x === 0 && rect.y === 0 && rect.width === natural.width && rect.height === natural.height;

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop an image here"
            hint="One image at a time — drag out the area you want to keep"
            accept="JPG, PNG, HEIC, WebP, AVIF, TIFF, BMP, GIF"
          />

          {infoError && (
            <ErrorDisplay error={infoError} onRetry={() => setReloadKey((key) => key + 1)} />
          )}

          <div
            ref={stageRef}
            className="relative flex h-[440px] items-center justify-center overflow-hidden rounded-card border border-line bg-canvas"
          >
            {!path && (
              <p className="px-6 text-center text-[12.5px] text-ink-faint">
                Add an image and the cropper appears here.
              </p>
            )}
            {path && !natural && !infoError && (
              <p className="px-6 text-center text-[12.5px] text-ink-faint">Reading the image…</p>
            )}
            {path && infoError && (
              <p className="px-6 text-center text-[12.5px] text-ink-faint">
                This image could not be read — the details are above.
              </p>
            )}
            {path && natural && rect && (
              <div
                ref={frameRef}
                style={{ width: displayWidth, height: displayHeight }}
                className="relative touch-none select-none"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <img
                  src={assetUrl(path)}
                  alt=""
                  draggable={false}
                  onError={() => setPreviewFailed(true)}
                  className="pointer-events-none block h-full w-full select-none object-fill"
                />
                {previewFailed && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-canvas">
                    <div className="flex flex-col items-center gap-1 text-center">
                      <Icon name="FileWarning" size={18} className="text-ink-faint" />
                      <p className="text-[11.5px] text-ink-faint">No live preview for this format</p>
                    </div>
                  </div>
                )}

                {/* Dim everything outside the selection. */}
                <div
                  className="pointer-events-none absolute"
                  style={{
                    left: rect.x * scale,
                    top: rect.y * scale,
                    width: rect.width * scale,
                    height: rect.height * scale,
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                  }}
                />

                <div
                  data-role="move"
                  className="absolute cursor-move border border-accent"
                  style={{
                    left: rect.x * scale,
                    top: rect.y * scale,
                    width: rect.width * scale,
                    height: rect.height * scale,
                  }}
                >
                  {/* Rule-of-thirds guides. */}
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute inset-y-0 left-1/3 w-px bg-accent/30" />
                    <div className="absolute inset-y-0 left-2/3 w-px bg-accent/30" />
                    <div className="absolute inset-x-0 top-1/3 h-px bg-accent/30" />
                    <div className="absolute inset-x-0 top-2/3 h-px bg-accent/30" />
                  </div>
                  {HANDLES.map((h) => (
                    <div
                      key={h.handle}
                      data-role="handle"
                      data-handle={h.handle}
                      style={{ cursor: h.cursor }}
                      className={`absolute h-3 w-3 rounded-[3px] border border-accent bg-panel shadow-[0_1px_2px_rgba(0,0,0,0.25)] ${h.position}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {previewFailed && (
            <Alert tone="info">
              The preview could not be drawn for this format, but the numbers below still describe real
              pixels — set the area by hand and the crop will be exact.
            </Alert>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section title="Aspect ratio">
            <div className="space-y-3">
              <PresetRow
                presets={RATIOS.map((r) => ({ label: r.label, value: r.value, hint: r.hint }))}
                active={ratioId}
                onSelect={setRatioId}
              />
              <p className="text-[11.5px] text-ink-faint">
                Drag inside the image to draw a new area, drag the middle to move it, or pull a corner.
              </p>
            </div>
          </Section>

          <Section
            title="Selection"
            actions={
              <>
                <Button size="sm" variant="ghost" onClick={recentre} disabled={!natural}>
                  Centre
                </Button>
                <Button size="sm" variant="ghost" onClick={selectAll} disabled={!natural}>
                  Whole image
                </Button>
              </>
            }
          >
            {rect && natural ? (
              <div className="space-y-3">
                <OptionsGrid>
                  <Field label="X">
                    <NumberInput
                      value={rect.x}
                      onValueChange={(v) => editField('x', v)}
                      min={0}
                      max={Math.max(0, natural.width - 1)}
                      suffix="px"
                    />
                  </Field>
                  <Field label="Y">
                    <NumberInput
                      value={rect.y}
                      onValueChange={(v) => editField('y', v)}
                      min={0}
                      max={Math.max(0, natural.height - 1)}
                      suffix="px"
                    />
                  </Field>
                  <Field label="Width">
                    <NumberInput
                      value={rect.width}
                      onValueChange={(v) => editField('width', v)}
                      min={1}
                      max={natural.width}
                      suffix="px"
                    />
                  </Field>
                  <Field label="Height">
                    <NumberInput
                      value={rect.height}
                      onValueChange={(v) => editField('height', v)}
                      min={1}
                      max={natural.height}
                      suffix="px"
                    />
                  </Field>
                </OptionsGrid>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-canvas px-3 py-2">
                  <Stat label="Source" value={`${natural.width} × ${natural.height}`} hint={file ? formatBytes(file.size) : undefined} />
                  <Icon name="ArrowRight" size={14} className="shrink-0 text-ink-faint" />
                  <Stat label="Crop" value={`${rect.width} × ${rect.height}`} hint={describeRatio(rect)} />
                </div>
                {wholeImage && (
                  <p className="text-[11.5px] text-ink-faint">
                    The selection covers the whole image — nothing would be cut away.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-ink-faint">
                {infoError ? 'This image could not be read.' : 'Add an image to choose an area.'}
              </p>
            )}
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label="Crop image"
            icon="Crop"
            disabled={!rect || !path}
            disabledReason={
              !path
                ? 'Add an image first.'
                : infoError
                  ? 'This image could not be read, so there is no area to crop.'
                  : 'Choose an area first.'
            }
          />
        </>
      }
    />
  );
}
