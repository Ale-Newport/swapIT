import { useEffect, useMemo, useState } from 'react';
import { call } from '@/core/bridge';
import { formatBytes, formatDuration, formatTimecode } from '@/core/format';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  ErrorDisplay,
  FileDropZone,
  ImagePreview,
  OutputSettings,
  PresetRow,
  ResultPanel,
  ToolActions,
  ToolShell,
  assetUrlFresh,
  useOutputSpec,
} from '@/components/tool';
import { Alert, Badge, Field, Input, NumberInput, Section, Select, Slider, Switch } from '@/components/ui';
import { estimateGif, resolveClip } from './logic';

interface ProbeStream {
  width: number | null;
  height: number | null;
  fps: number | null;
}
interface Probe {
  duration: number | null;
  video: ProbeStream | null;
}

const WIDTHS = [320, 480, 640, 800];

const DITHERS = [
  { value: 'sierra2_4a', label: 'Sierra — smoothest gradients' },
  { value: 'bayer', label: 'Bayer — patterned, smaller files' },
  { value: 'none', label: 'None — flat colours, smallest' },
];

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

export default function VideoToGif() {
  const files = useToolFiles({ kinds: ['video'], filterName: 'Videos', multiple: false });
  const run = useToolRun('video/gif', 'Video to GIF');
  const { spec, update } = useOutputSpec();

  const [startText, setStartText] = useState('');
  const [durationText, setDurationText] = useState('');
  const [fps, setFps] = useState(12);
  const [width, setWidth] = useState(480);
  const [dither, setDither] = useState('sierra2_4a');
  const [loop, setLoop] = useState(true);
  const [runToken, setRunToken] = useState(0);

  const source = files.files[0] ?? null;
  const sourcePath = source?.path ?? null;

  // ---------------------------------------------------------------- probe
  const [probe, setProbe] = useState<Probe | null>(null);
  useEffect(() => {
    setProbe(null);
    if (!sourcePath) return;
    let alive = true;
    void call<Probe[]>('probe_media', { inputs: [sourcePath] })
      .then((infos) => {
        if (alive) setProbe(infos[0] ?? null);
      })
      .catch(() => {
        // Without ffprobe there is no length to range-check against — the
        // timecode fields and the GIF itself still work.
      });
    return () => {
      alive = false;
    };
  }, [sourcePath]);

  const sourceDuration = probe?.duration ?? null;
  const clip = useMemo(
    () => resolveClip(startText, durationText, sourceDuration),
    [startText, durationText, sourceDuration],
  );

  // ---------------------------------------------------------------- preview
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  useEffect(() => {
    if (!sourcePath) {
      setPreviewPath(null);
      setPreviewError(null);
      return;
    }
    if (clip.startError) return;
    let alive = true;
    const timer = setTimeout(() => {
      void call<string>('preview_frame', { input: sourcePath, timestamp: clip.start, width: 640 })
        .then((path) => {
          if (!alive) return;
          setPreviewPath(path);
          setPreviewError(null);
        })
        .catch((err: unknown) => {
          if (!alive) return;
          setPreviewPath(null);
          setPreviewError(errorMessage(err));
        });
    }, 280);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [sourcePath, clip.start, clip.startError]);

  const estimate = estimateGif({
    durationSec: clip.effective,
    fps,
    width,
    sourceWidth: probe?.video?.width ?? null,
    sourceHeight: probe?.video?.height ?? null,
  });

  const gif = run.result?.results[0] ?? null;
  const invalid = Boolean(clip.startError || clip.durationError);

  const execute = () => {
    if (!sourcePath || invalid) return;
    void run
      .execute({
        command: 'video_to_gif',
        total: 1,
        inputs: [sourcePath],
        label: `Make a GIF from ${source?.name ?? 'video'}`,
        args: {
          inputs: [sourcePath],
          ops: {
            gifFps: fps,
            gifWidth: width,
            gifLoop: loop,
            gifDither: dither,
            start: clip.start > 0 ? clip.start : undefined,
            duration: clip.duration ?? undefined,
          },
          output: spec,
        },
      })
      // The GIF may replace a file the browser has already cached.
      .then(() => setRunToken(Date.now()));
  };

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop a video here"
            hint="MP4, MOV, MKV, WebM, AVI — one video at a time"
          />

          {source && (
            <Section
              title="Start frame"
              description={
                sourceDuration !== null
                  ? `${formatTimecode(clip.start)} of ${formatDuration(sourceDuration)}`
                  : `Frame at ${formatTimecode(clip.start)}`
              }
              actions={
                estimate && (
                  <Badge tone={estimate.level === 'ok' ? 'neutral' : 'warn'}>
                    {estimate.frames} frames · ~{formatBytes(estimate.bytes)}
                  </Badge>
                )
              }
            >
              {previewError ? (
                <Alert tone="warn" title="That frame could not be read.">
                  {previewError}
                </Alert>
              ) : (
                <ImagePreview
                  path={previewPath}
                  className="h-64 w-full"
                  checkered={false}
                  alt="Frame at the start of the clip"
                />
              )}
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}

          {gif && (
            <Section title="Your GIF" description={`${gif.name} · ${formatBytes(gif.size)}`}>
              <div className="flex justify-center rounded-lg border border-line bg-canvas p-3">
                <img
                  src={assetUrlFresh(gif.path, runToken)}
                  alt="The GIF that was produced"
                  className="max-h-[420px] max-w-full rounded"
                />
              </div>
            </Section>
          )}

          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section title="Clip" description="Leave both empty to use the whole video">
            <div className="space-y-3">
              <Field
                label="Start at"
                hint={sourceDuration !== null ? `Video is ${formatDuration(sourceDuration)} long` : 'mm:ss or seconds'}
                error={clip.startError}
              >
                <Input
                  value={startText}
                  placeholder="0:00"
                  spellCheck={false}
                  onChange={(e) => setStartText(e.target.value)}
                />
              </Field>
              <Field label="Length" hint="How much of the video to keep" error={clip.durationError}>
                <Input
                  value={durationText}
                  placeholder="to the end"
                  spellCheck={false}
                  onChange={(e) => setDurationText(e.target.value)}
                />
              </Field>
              <PresetRow
                presets={[
                  { label: 'First 3s', value: '3' },
                  { label: 'First 5s', value: '5' },
                  { label: 'First 10s', value: '10' },
                  { label: 'Whole video', value: '' },
                ]}
                active={durationText}
                onSelect={(value) => {
                  setStartText('');
                  setDurationText(value);
                }}
              />
            </div>
          </Section>

          <Section title="GIF settings">
            <div className="space-y-3">
              <Field label={`Frame rate — ${fps} fps`} hint="Lower frame rates make much smaller GIFs.">
                <Slider min={5} max={30} value={fps} onChange={setFps} />
              </Field>
              <Field label="Width" hint="Height follows the original aspect ratio.">
                <div className="space-y-2">
                  <PresetRow
                    presets={WIDTHS.map((w) => ({ label: `${w}px`, value: w }))}
                    active={width}
                    onSelect={setWidth}
                  />
                  <NumberInput
                    value={width}
                    min={32}
                    max={3840}
                    step={10}
                    suffix="px"
                    onValueChange={(v) => setWidth(Math.min(3840, Math.max(32, Math.round(v))))}
                  />
                </div>
              </Field>
              <Field label="Dithering" hint="How 256 colours are spread across the picture.">
                <Select value={dither} onChange={(e) => setDither(e.target.value)} options={DITHERS} />
              </Field>
              <Field inline label="Loop forever" hint="Off plays the GIF once">
                <Switch checked={loop} onCheckedChange={setLoop} />
              </Field>
            </div>
          </Section>

          {estimate && estimate.level !== 'ok' && (
            <Alert
              tone="warn"
              title={estimate.level === 'huge' ? 'This GIF will be very large' : 'This GIF will be large'}
            >
              {estimate.frames} frames at {estimate.width}×{estimate.height} is roughly{' '}
              {formatBytes(estimate.bytes)}. Shorten the clip, drop the frame rate or pick a smaller width.
            </Alert>
          )}
          {estimate && estimate.level === 'ok' && (
            <p className="text-[11.5px] text-ink-faint">
              About {estimate.frames} frames at {estimate.width}×{estimate.height} — roughly{' '}
              {formatBytes(estimate.bytes)}.
            </p>
          )}

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label="Make GIF"
            icon="Film"
            disabled={files.isEmpty || invalid}
            disabledReason={
              files.isEmpty ? 'Add a video first.' : 'Fix the start time or length before running.'
            }
          />
        </>
      }
    />
  );
}
