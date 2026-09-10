import { open } from '@tauri-apps/plugin-dialog';
import clsx from 'clsx';
import { useCallback, useEffect, useState } from 'react';
import { call } from '@/core/bridge';
import { basename } from '@/core/format';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  assetUrl,
  ErrorDisplay,
  FileDropZone,
  OutputSettings,
  ResultPanel,
  ToolActions,
  ToolShell,
  useOutputSpec,
} from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  Field,
  Icon,
  IconButton,
  Input,
  NumberInput,
  Section,
  Segmented,
  Select,
  Slider,
  Spinner,
} from '@/components/ui';
import {
  buildWatermarkOps,
  burnedLogoWidthPx,
  frameCoverage,
  logoWidthPx,
  overlayStyle,
  POSITION_GRID,
  POSITION_LABELS,
  previewScaleFactor,
  TEXT_BOX_PADDING,
  TEXT_MARGIN,
  textFontPx,
  validateWatermark,
  type WatermarkMode,
  type WatermarkPosition,
} from './logic';

interface ProbedStream {
  width?: number | null;
  height?: number | null;
}

interface ProbedMedia {
  path: string;
  duration?: number | null;
  video?: ProbedStream | null;
}

const ALIGN: Record<WatermarkPosition, string> = {
  'top-left': 'items-start justify-start',
  'top-center': 'items-start justify-center',
  'top-right': 'items-start justify-end',
  center: 'items-center justify-center',
  'bottom-left': 'items-end justify-start',
  'bottom-center': 'items-end justify-center',
  'bottom-right': 'items-end justify-end',
};

const FORMATS = [
  { value: '', label: 'Same as the input' },
  { value: 'mp4', label: 'MP4 (H.264)' },
  { value: 'mov', label: 'MOV (QuickTime)' },
  { value: 'mkv', label: 'MKV (Matroska)' },
  { value: 'webm', label: 'WebM (VP9)' },
];

const QUALITY = [
  { value: '18', label: 'High — larger file' },
  { value: '23', label: 'Balanced' },
  { value: '28', label: 'Small — softer detail' },
];

const PREVIEW_WIDTH = 720;

function PositionGrid({
  value,
  onChange,
}: {
  value: WatermarkPosition;
  onChange: (position: WatermarkPosition) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {POSITION_GRID.map((cell, index) =>
        cell ? (
          <button
            key={cell}
            type="button"
            title={POSITION_LABELS[cell]}
            aria-label={POSITION_LABELS[cell]}
            aria-pressed={value === cell}
            onClick={() => onChange(cell)}
            className={clsx(
              'flex h-9 rounded-lg border p-1.5 transition-colors',
              ALIGN[cell],
              value === cell ? 'border-ink bg-accent-soft' : 'border-line bg-panel hover:border-line-strong',
            )}
          >
            <span className={clsx('h-1.5 w-1.5 rounded-full', value === cell ? 'bg-accent' : 'bg-ink/25')} />
          </button>
        ) : (
          <div key={`empty-${index}`} aria-hidden />
        ),
      )}
    </div>
  );
}

export default function VideoWatermark() {
  const files = useToolFiles({ kinds: ['video'], filterName: 'Videos' });
  const run = useToolRun('video/watermark', 'Video Watermark');
  const { spec, update } = useOutputSpec();

  const [mode, setMode] = useState<WatermarkMode>('logo');
  const [logo, setLogo] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [position, setPosition] = useState<WatermarkPosition>('bottom-right');
  const [opacity, setOpacity] = useState(60);
  const [scale, setScale] = useState(20);
  const [margin, setMargin] = useState(24);
  const [format, setFormat] = useState('');
  const [crf, setCrf] = useState('23');

  const [info, setInfo] = useState<ProbedMedia | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [frameFailed, setFrameFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [display, setDisplay] = useState({ width: 0, height: 0 });
  const [logoWidth, setLogoWidth] = useState(0);

  const path = files.paths[0] ?? null;

  // FFmpeg sizes the logo from its own width, so the preview needs that number
  // rather than anything about the frame.
  useEffect(() => {
    setLogoWidth(0);
    if (!logo) return;
    const url = assetUrl(logo);
    if (!url) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) setLogoWidth(image.naturalWidth);
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [logo]);

  useEffect(() => {
    if (!path) {
      setInfo(null);
      setFrame(null);
      setFrameFailed(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFrame(null);
    setFrameFailed(false);
    void (async () => {
      let media: ProbedMedia | null = null;
      try {
        [media] = await call<ProbedMedia[]>('probe_media', { inputs: [path] });
      } catch {
        /* the frame is still worth trying without the metadata */
      }
      if (cancelled) return;
      setInfo(media ?? null);
      const duration = media?.duration ?? 0;
      try {
        const framePath = await call<string>('preview_frame', {
          input: path,
          timestamp: duration > 0 ? Math.min(duration / 2, 3) : 0,
          width: PREVIEW_WIDTH,
        });
        if (!cancelled) setFrame(framePath);
      } catch {
        if (!cancelled) setFrameFailed(true);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  // Measuring the <img> itself gives the exact size the frame is drawn at, which
  // is what the overlay has to be positioned against.
  const measureRef = useCallback((el: HTMLImageElement | null) => {
    if (!el) return;
    const read = () => setDisplay({ width: el.clientWidth, height: el.clientHeight });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const factor = previewScaleFactor(display.width, info?.video?.width);
  const effectiveMargin = mode === 'text' ? TEXT_MARGIN : margin;
  const problem = validateWatermark(mode, logo, text);
  const ready = display.width > 0 && !problem;

  const burnedWidth = burnedLogoWidthPx(scale / 100, logoWidth);
  const previewLogoWidth = logoWidthPx(scale / 100, logoWidth, factor);
  const coverage = frameCoverage(scale / 100, logoWidth, info?.video?.width);

  const execute = () =>
    void run.execute({
      command: 'process_video',
      total: files.files.length,
      inputs: files.paths,
      label: `Watermark ${files.files.length} video${files.files.length === 1 ? '' : 's'}`,
      args: {
        inputs: files.paths,
        ops: {
          format: format || undefined,
          crf: Number(crf),
          watermark: buildWatermarkOps({
            mode,
            logo,
            text,
            position,
            opacity: opacity / 100,
            margin,
            scale: scale / 100,
          }),
        },
        output: spec,
      },
    });

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop videos here"
            hint="MP4, MOV, MKV, AVI, WebM — the same watermark is burned into every file"
            allowFolders
          />

          {path && (
            <Section
              title="Placement preview"
              description={
                mode === 'text'
                  ? 'Approximate: FFmpeg draws the text with its own font, so the exact letterforms will differ'
                  : 'A real frame from the first video with the logo laid over it at the chosen size'
              }
              actions={<Badge tone="accent">{POSITION_LABELS[position]}</Badge>}
            >
              <div className="flex h-80 items-center justify-center overflow-hidden rounded-lg border border-line bg-canvas p-3">
                {loading && <Spinner size={20} />}
                {frameFailed && !loading && (
                  <div className="flex flex-col items-center gap-1 px-6 text-center">
                    <Icon name="FileWarning" size={18} className="text-ink-faint" />
                    <p className="text-[11.5px] text-ink-faint">
                      No frame could be decoded from this file, so there is nothing to preview. Watermarking it may
                      still work.
                    </p>
                  </div>
                )}
                {frame && (
                  // Clipped like FFmpeg's own overlay: a mark wider than the
                  // frame is cut off here exactly as it would be in the file.
                  <div className="relative overflow-hidden rounded-[3px]">
                    <img
                      ref={measureRef}
                      src={assetUrl(frame)}
                      alt="Frame from the first video"
                      className="block max-h-[17rem] max-w-full rounded-[3px]"
                    />
                    {ready && mode === 'logo' && logo && previewLogoWidth > 0 && (
                      <div className="absolute" style={overlayStyle(position, effectiveMargin * factor)}>
                        <img
                          src={assetUrl(logo)}
                          alt=""
                          className="block max-w-none"
                          style={{ width: `${previewLogoWidth}px`, opacity: opacity / 100 }}
                        />
                      </div>
                    )}
                    {ready && mode === 'text' && (
                      <div className="absolute" style={overlayStyle(position, effectiveMargin * factor)}>
                        {/* These colours mimic FFmpeg's drawtext defaults — white text on a
                            35% black box — so they are deliberately not theme tokens. */}
                        <span
                          className="inline-block whitespace-pre"
                          style={{
                            fontSize: `${textFontPx(display.height)}px`,
                            lineHeight: 1.2,
                            padding: `${Math.max(1, TEXT_BOX_PADDING * factor)}px`,
                            background: 'rgba(0, 0, 0, 0.35)',
                            color: `rgba(255, 255, 255, ${opacity / 100})`,
                            fontFamily: 'system-ui, -apple-system, sans-serif',
                          }}
                        >
                          {text}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {problem && <p className="mt-2 text-[11.5px] text-ink-faint">{problem}</p>}
              {files.files.length > 1 && !problem && (
                <p className="mt-2 text-[11.5px] text-ink-faint">
                  {mode === 'logo'
                    ? `Showing ${files.files[0].name}. The logo is burned in at the same pixel size in all ${files.files.length} files, so it covers more of a smaller video.`
                    : `Showing ${files.files[0].name}. The text is drawn at 1/22 of each video's height, so all ${files.files.length} files get proportionally the same mark.`}
                </p>
              )}
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section title="Watermark">
            <div className="space-y-3">
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'logo', label: 'Image', icon: 'Image' },
                  { value: 'text', label: 'Text', icon: 'Type' },
                ]}
                className="w-full"
              />

              {mode === 'logo' ? (
                <Field label="Logo file" hint="PNG keeps transparency; JPG is drawn as a solid rectangle.">
                  {logo ? (
                    <div className="flex items-center gap-2">
                      <div className="flex h-8.5 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-canvas px-2.5">
                        <Icon name="Image" size={13} className="shrink-0 text-ink-faint" />
                        <span className="truncate text-[12.5px] text-ink-soft" title={logo}>
                          {basename(logo)}
                        </span>
                      </div>
                      <IconButton icon="X" label="Remove the logo" size="sm" onClick={() => setLogo(null)} />
                    </div>
                  ) : (
                    <Button
                      full
                      icon="FolderOpen"
                      onClick={() =>
                        void open({
                          multiple: false,
                          directory: false,
                          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
                        }).then((picked) => {
                          if (typeof picked === 'string') setLogo(picked);
                        })
                      }
                    >
                      Choose a PNG or JPG
                    </Button>
                  )}
                </Field>
              ) : (
                <Field label="Text" hint="Drawn white on a dark plate, sized to 1/22 of the video height.">
                  <Input
                    value={text}
                    placeholder="© 2026 Your Name"
                    maxLength={120}
                    onChange={(e) => setText(e.target.value)}
                  />
                </Field>
              )}

              <Field
                label="Position"
                hint="Seven anchor points — FFmpeg has no expression for the sides of the middle row."
              >
                <PositionGrid value={position} onChange={setPosition} />
              </Field>

              <Field label={`Opacity — ${opacity}%`}>
                <Slider min={5} max={100} step={1} value={opacity} onChange={setOpacity} />
              </Field>

              {mode === 'logo' && (
                <>
                  <Field
                    label={`Size — ${scale}% of the logo's own width`}
                    hint={
                      burnedWidth > 0
                        ? `Burned in ${burnedWidth} px wide${
                            coverage !== null ? ` — ${(coverage * 100).toFixed(coverage < 0.1 ? 1 : 0)}% of this frame` : ''
                          }, the same in every file.`
                        : 'FFmpeg scales the logo from its own width, so the mark is the same size in every video.'
                    }
                  >
                    <Slider min={2} max={100} step={1} value={scale} onChange={setScale} />
                  </Field>
                  <Field label="Margin" hint="Distance from the edges, in video pixels.">
                    <NumberInput
                      value={margin}
                      onValueChange={(v) => setMargin(Math.min(500, Math.max(0, Math.round(v))))}
                      min={0}
                      max={500}
                      suffix="px"
                    />
                  </Field>
                </>
              )}

              {mode === 'text' && (
                <Alert tone="info">
                  Text is always drawn 24 px from the edge at 1/22 of the video height, so size and margin do not apply
                  here. Switch to an image watermark for full control.
                </Alert>
              )}
            </div>
          </Section>

          <Section title="Encoding">
            <div className="space-y-3">
              <Field label="Container">
                <Select value={format} onChange={(e) => setFormat(e.target.value)} options={FORMATS} />
              </Field>
              <Field label="Quality" hint="Burning in a watermark re-encodes. Applies to H.264, H.265 and VP9 output.">
                <Select value={crf} onChange={(e) => setCrf(e.target.value)} options={QUALITY} />
              </Field>
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label="Add watermark"
            icon="Stamp"
            disabled={files.isEmpty || Boolean(problem)}
            disabledReason={files.isEmpty ? 'Add at least one video first.' : (problem ?? undefined)}
          />
        </>
      }
    />
  );
}
