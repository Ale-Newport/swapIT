import { useCallback, useEffect, useMemo, useState } from 'react';
import { call } from '@/core/bridge';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  assetUrl,
  ErrorDisplay,
  FileDropZone,
  OutputSettings,
  PresetRow,
  ResultPanel,
  ToolActions,
  ToolShell,
  useOutputSpec,
} from '@/components/tool';
import { Badge, Field, Icon, Section, Select, Spinner, Switch } from '@/components/ui';
import {
  cssTransform,
  fitScale,
  isIdentity,
  isQuarterTurn,
  orientationLabel,
  previewTimestamp,
  resultDimensions,
  type Rotation,
} from './logic';

interface ProbedStream {
  codec: string;
  width?: number | null;
  height?: number | null;
}

interface ProbedMedia {
  path: string;
  duration?: number | null;
  video?: ProbedStream | null;
}

const ROTATIONS: Array<{ label: string; value: Rotation; hint: string }> = [
  { label: 'None', value: 0, hint: 'Leave the orientation alone' },
  { label: '90° CW', value: 90, hint: 'Quarter turn clockwise' },
  { label: '180°', value: 180, hint: 'Upside down' },
  { label: '90° CCW', value: 270, hint: 'Quarter turn counter-clockwise' },
];

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

export default function RotateVideo() {
  const files = useToolFiles({ kinds: ['video'], filterName: 'Videos' });
  const run = useToolRun('video/rotate', 'Rotate Video');
  const { spec, update } = useOutputSpec();

  const [rotate, setRotate] = useState<Rotation>(90);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [format, setFormat] = useState('');
  const [crf, setCrf] = useState('23');

  const [info, setInfo] = useState<ProbedMedia | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [frameFailed, setFrameFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  const [box, setBox] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState({ width: 0, height: 0 });

  const path = files.paths[0] ?? null;

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
    setNatural({ width: 0, height: 0 });
    void (async () => {
      let media: ProbedMedia | null = null;
      try {
        [media] = await call<ProbedMedia[]>('probe_media', { inputs: [path] });
      } catch {
        /* dimensions stay unknown; the preview is still worth trying */
      }
      if (cancelled) return;
      setInfo(media ?? null);
      try {
        const framePath = await call<string>('preview_frame', {
          input: path,
          timestamp: previewTimestamp(media?.duration),
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

  // React 19 callback refs may return a cleanup, which keeps the observer tied
  // to whichever element is actually mounted.
  const measureRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const read = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const orientation = useMemo(() => ({ rotate, flipH, flipV }), [rotate, flipH, flipV]);
  const quarterTurn = isQuarterTurn(rotate);
  const scale = fitScale(natural, box, quarterTurn);
  const before = info?.video?.width && info?.video?.height
    ? { width: info.video.width, height: info.video.height }
    : null;
  const after = resultDimensions(before?.width, before?.height, rotate);
  const identity = isIdentity(orientation);

  const execute = () =>
    void run.execute({
      command: 'process_video',
      total: files.files.length,
      inputs: files.paths,
      label: `Rotate ${files.files.length} video${files.files.length === 1 ? '' : 's'} — ${orientationLabel(orientation)}`,
      args: {
        inputs: files.paths,
        ops: {
          format: format || undefined,
          rotate: rotate || undefined,
          flipHorizontal: flipH,
          flipVertical: flipV,
          crf: Number(crf),
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
            hint="MP4, MOV, MKV, AVI, WebM — every file is turned the same way"
            allowFolders
          />

          {path && (
            <Section
              title="Preview"
              description={
                before && after
                  ? `${before.width} × ${before.height} becomes ${after.width} × ${after.height}`
                  : 'A frame from the first video, turned the way the result will be'
              }
              actions={<Badge tone="accent">{orientationLabel(orientation)}</Badge>}
            >
              <div
                ref={measureRef}
                className="flex h-72 items-center justify-center overflow-hidden rounded-lg border border-line bg-canvas"
              >
                {loading && <Spinner size={20} />}
                {frameFailed && !loading && (
                  <div className="flex flex-col items-center gap-1 px-6 text-center">
                    <Icon name="FileWarning" size={18} className="text-ink-faint" />
                    <p className="text-[11.5px] text-ink-faint">
                      No frame could be decoded from this file, so there is nothing to preview. Rotating it may still
                      work.
                    </p>
                  </div>
                )}
                {frame && (
                  <img
                    src={assetUrl(frame)}
                    alt="Preview of the rotated frame"
                    onLoad={(e) =>
                      setNatural({
                        width: e.currentTarget.naturalWidth,
                        height: e.currentTarget.naturalHeight,
                      })
                    }
                    className="max-w-none rounded-[3px] shadow-[0_1px_6px_rgba(0,0,0,0.12)]"
                    style={{
                      width: scale ? `${natural.width * scale}px` : undefined,
                      height: scale ? `${natural.height * scale}px` : undefined,
                      opacity: scale ? 1 : 0,
                      transform: cssTransform(orientation),
                      transition: 'transform 180ms ease, width 180ms ease, height 180ms ease',
                    }}
                  />
                )}
              </div>
              {files.files.length > 1 && (
                <p className="mt-2 text-[11.5px] text-ink-faint">
                  Showing {files.files[0].name}. All {files.files.length} files get the same rotation.
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
          <Section title="Orientation">
            <div className="space-y-3">
              <Field label="Rotate">
                <PresetRow presets={ROTATIONS} active={rotate} onSelect={setRotate} />
              </Field>
              <Field inline label="Mirror horizontally" hint="Left and right swap">
                <Switch checked={flipH} onCheckedChange={setFlipH} />
              </Field>
              <Field inline label="Mirror vertically" hint="Top and bottom swap">
                <Switch checked={flipV} onCheckedChange={setFlipV} />
              </Field>
              <p className="text-[11.5px] text-ink-faint">
                The rotation is applied first, then the mirrors — the same order the preview shows.
              </p>
            </div>
          </Section>

          <Section title="Encoding">
            <div className="space-y-3">
              <Field label="Container">
                <Select value={format} onChange={(e) => setFormat(e.target.value)} options={FORMATS} />
              </Field>
              <Field label="Quality" hint="Turning the picture re-encodes it. Applies to H.264, H.265 and VP9 output.">
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
            label="Rotate"
            icon="RotateCw"
            disabled={files.isEmpty || identity}
            disabledReason={
              files.isEmpty ? 'Add at least one video first.' : 'Pick a rotation or a mirror to apply.'
            }
          />
        </>
      }
    />
  );
}
