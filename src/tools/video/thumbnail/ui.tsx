import { useCallback, useEffect, useState } from 'react';
import { call, planOutput, revealInFinder } from '@/core/bridge';
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
import { Alert, Badge, Button, Field, IconButton, Input, Section, Select, Slider, Spinner } from '@/components/ui';
import { clampTimestamp, markPositions, parseTimestamp, scrubStep } from './logic';

interface ProbeStream {
  width: number | null;
  height: number | null;
  fps: number | null;
}
interface Probe {
  duration: number | null;
  video: ProbeStream | null;
}

const WIDTHS = [
  { value: '', label: 'Original size' },
  { value: '320', label: '320 px wide' },
  { value: '640', label: '640 px wide' },
  { value: '1280', label: '1280 px wide' },
  { value: '1920', label: '1920 px wide' },
];

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

export default function VideoThumbnail() {
  const files = useToolFiles({ kinds: ['video'], filterName: 'Videos', multiple: false });
  const run = useToolRun('video/thumbnail', 'Video Thumbnail');
  const { spec, update } = useOutputSpec();

  const [timestamp, setTimestamp] = useState(0);
  const [timeText, setTimeText] = useState('0:00:00.000');
  const [timeError, setTimeError] = useState<string | null>(null);
  const [widthChoice, setWidthChoice] = useState('');
  const [runToken, setRunToken] = useState(0);
  const [skipped, setSkipped] = useState<{ path: string; name: string } | null>(null);

  const source = files.files[0] ?? null;
  const sourcePath = source?.path ?? null;

  const [probe, setProbe] = useState<Probe | null>(null);
  useEffect(() => {
    setProbe(null);
    setTimestamp(0);
    setTimeText('0:00:00.000');
    setTimeError(null);
    setSkipped(null);
    if (!sourcePath) return;
    let alive = true;
    void call<Probe[]>('probe_media', { inputs: [sourcePath] })
      .then((infos) => {
        if (alive) setProbe(infos[0] ?? null);
      })
      .catch(() => {
        // No ffprobe: the scrubber is replaced by the timecode field below.
      });
    return () => {
      alive = false;
    };
  }, [sourcePath]);

  const duration = probe?.duration ?? null;
  const step = scrubStep(duration, probe?.video?.fps ?? null);

  const moveTo = useCallback(
    (seconds: number) => {
      const next = clampTimestamp(Math.round(seconds * 1000) / 1000, duration);
      setTimestamp(next);
      setTimeText(formatTimecode(next, true));
      setTimeError(null);
    },
    [duration],
  );

  // ---------------------------------------------------------------- preview
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  useEffect(() => {
    if (!sourcePath) {
      setPreviewPath(null);
      setPreviewError(null);
      return;
    }
    let alive = true;
    setPreviewing(true);
    const timer = setTimeout(() => {
      void call<string>('preview_frame', { input: sourcePath, timestamp, width: 720 })
        .then((path) => {
          if (!alive) return;
          setPreviewPath(path);
          setPreviewError(null);
        })
        .catch((err: unknown) => {
          if (!alive) return;
          setPreviewPath(null);
          setPreviewError(errorMessage(err));
        })
        .finally(() => {
          if (alive) setPreviewing(false);
        });
    }, 220);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [sourcePath, timestamp]);

  const thumb = run.result?.results[0] ?? null;
  const marks = markPositions(duration);

  const execute = () => {
    if (!sourcePath || timeError) return;
    setSkipped(null);
    void (async () => {
      // `video_thumbnail` hands the destination straight to FFmpeg, which always
      // runs with `-y`, so a "Skip the file" policy has to be honoured before the
      // call — otherwise the existing PNG is silently replaced. `plan_output`
      // resolves the very same destination the command would.
      try {
        const planned = await planOutput(sourcePath, spec, 'png');
        if (planned.disposition === 'skipped') {
          // Clear any earlier run so the panel never shows a stale "saved" file
          // next to the notice that nothing was written this time.
          run.reset();
          setSkipped({ path: planned.path, name: planned.name });
          return;
        }
      } catch {
        /* The command resolves its own destination; let it report the failure. */
      }
      await run.execute({
        command: 'video_thumbnail',
        total: 1,
        inputs: [sourcePath],
        label: `Thumbnail at ${formatTimecode(timestamp)}`,
        args: {
          input: sourcePath,
          timestamp,
          width: widthChoice ? Number(widthChoice) : undefined,
          output: spec,
        },
      });
      // A re-run can overwrite a PNG the browser has already cached.
      setRunToken(Date.now());
    })();
  };

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop a video here"
            hint="Scrub to the frame you want, then save it as a PNG"
          />

          {source && (
            <Section
              title="Choose the frame"
              description={
                duration !== null
                  ? `${formatTimecode(timestamp, true)} of ${formatDuration(duration)}`
                  : formatTimecode(timestamp, true)
              }
              actions={previewing ? <Spinner /> : undefined}
            >
              <div className="space-y-3">
                {previewError ? (
                  <Alert tone="warn" title="That frame could not be read.">
                    {previewError}
                  </Alert>
                ) : (
                  <ImagePreview
                    path={previewPath}
                    className="h-72 w-full"
                    checkered={false}
                    alt={`Frame at ${formatTimecode(timestamp)}`}
                  />
                )}

                {duration !== null ? (
                  <>
                    <Slider
                      min={0}
                      max={Math.max(step, duration)}
                      step={step}
                      value={Math.min(timestamp, duration)}
                      onChange={moveTo}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <PresetRow
                        presets={marks.map((m) => ({ label: m.label, value: m.seconds }))}
                        active={timestamp}
                        onSelect={moveTo}
                      />
                      <div className="flex items-center gap-1">
                        <IconButton
                          icon="ChevronLeft"
                          label="One frame back"
                          size="sm"
                          onClick={() => moveTo(timestamp - step)}
                        />
                        <IconButton
                          icon="ChevronRight"
                          label="One frame forward"
                          size="sm"
                          onClick={() => moveTo(timestamp + step)}
                        />
                        <Button size="sm" variant="ghost" onClick={() => moveTo(timestamp - 1)}>
                          −1s
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => moveTo(timestamp + 1)}>
                          +1s
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-[11.5px] text-ink-faint">
                    The video length is unknown, so there is no scrubber — type the time you want below.
                  </p>
                )}
              </div>
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}

          {skipped && (
            <Alert
              tone="warn"
              title="Nothing was written — that file already exists."
              action={
                <Button size="sm" icon="FolderOpen" onClick={() => void revealInFinder(skipped.path)}>
                  Reveal it
                </Button>
              }
            >
              {skipped.name} is already in the output folder and “If the file exists” is set to “Skip the file”, so it
              was left untouched. Choose “Keep both” or “Replace it” to save this frame.
            </Alert>
          )}

          {thumb && (
            <Section title="Saved thumbnail" description={`${thumb.name} · ${formatBytes(thumb.size)}`}>
              <div className="flex justify-center rounded-lg border border-line bg-canvas p-3">
                <img
                  src={assetUrlFresh(thumb.path, runToken)}
                  alt="The thumbnail that was saved"
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
          <Section title="Frame">
            <div className="space-y-3">
              <Field label="Time" hint="Type an exact time, or scrub in the preview." error={timeError}>
                <Input
                  value={timeText}
                  spellCheck={false}
                  placeholder="0:00:05.000"
                  onChange={(e) => {
                    setTimeText(e.target.value);
                    const parsed = parseTimestamp(e.target.value, duration);
                    setTimeError(parsed.error);
                    if (parsed.seconds !== null) setTimestamp(clampTimestamp(parsed.seconds, duration));
                  }}
                  onBlur={() => {
                    if (!timeError) setTimeText(formatTimecode(timestamp, true));
                  }}
                />
              </Field>
              {probe?.video?.width && probe.video.height && (
                <div className="flex flex-wrap gap-1.5">
                  <Badge>
                    {probe.video.width} × {probe.video.height}
                  </Badge>
                  {probe.video.fps && <Badge>{probe.video.fps.toFixed(probe.video.fps % 1 === 0 ? 0 : 2)} fps</Badge>}
                </div>
              )}
            </div>
          </Section>

          <Section title="Image">
            <Field label="Width" hint="PNG, with the original aspect ratio.">
              <Select
                value={widthChoice}
                onChange={(e) => setWidthChoice(e.target.value)}
                options={WIDTHS}
              />
            </Field>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label="Save thumbnail"
            icon="ImagePlus"
            disabled={files.isEmpty || Boolean(timeError)}
            disabledReason={files.isEmpty ? 'Add a video first.' : 'Fix the time before saving.'}
          />
        </>
      }
    />
  );
}
