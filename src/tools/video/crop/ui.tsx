import { useEffect, useMemo, useState } from 'react';
import { formatBytes, formatDuration, formatTimecode } from '@/core/format';
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
import { Alert, Button, Field, Icon, NumberInput, Section, Select, Slider, Spinner, Stat } from '@/components/ui';
import { CropCanvas } from './CropCanvas';
import {
  ASPECTS,
  buildOps,
  encodingFor,
  evenRect,
  fitAspect,
  isFullFrame,
  largestRect,
  ratioFor,
  ratioLabel,
  type Rect,
} from './logic';
import { fpsLabel, useProbe, usePreviewFrame } from './probe';

const EXTENSIONS = ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', '3gp', 'mts', 'm2ts'];

export default function CropVideo() {
  const files = useToolFiles({ kinds: ['video'], filterName: 'Videos', extensions: EXTENSIONS, multiple: false });
  const run = useToolRun('video/crop', 'Crop Video');
  const { spec, update } = useOutputSpec({ suffix: '-cropped' });

  const path = files.paths[0] ?? null;
  const { info, loading: probing, error: probeError } = useProbe(path);
  const vw = info?.video?.width ?? 0;
  const vh = info?.video?.height ?? 0;
  const duration = info?.duration ?? 0;

  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const [aspect, setAspect] = useState('free');
  const [frameTime, setFrameTime] = useState(0);
  const [crf, setCrf] = useState(20);
  const [preset, setPreset] = useState('medium');

  const ratio = ratioFor(aspect);

  // A new video starts with the whole frame selected and a frame from 10% in.
  useEffect(() => {
    if (!vw || !vh) {
      setRect({ x: 0, y: 0, w: 0, h: 0 });
      return;
    }
    setRect(evenRect({ x: 0, y: 0, w: vw, h: vh }, vw, vh));
    setAspect('free');
    setFrameTime(duration > 0 ? Math.min(duration * 0.1, 5) : 0);
  }, [vw, vh, duration, path]);

  const applyRect = (next: Rect) => setRect(evenRect(next, vw, vh));

  const chooseAspect = (value: string) => {
    setAspect(value);
    const r = ratioFor(value);
    if (!r || !vw || !vh) return;
    applyRect(fitAspect(rect, r, vw, vh));
  };

  const { framePath, loading: framing, error: frameError } = usePreviewFrame(path, frameTime, 900);
  const snapped = vw && vh ? evenRect(rect, vw, vh) : rect;
  const noop = vw > 0 && isFullFrame(snapped, vw, vh);

  const sourceExt = files.files[0]?.extension.toLowerCase() ?? '';
  const encoding = useMemo(() => encodingFor(sourceExt), [sourceExt]);
  const settings = useMemo(() => ({ crf, preset, encoding }), [crf, preset, encoding]);

  const execute = () =>
    void run.execute({
      command: 'process_video',
      total: 1,
      inputs: files.paths,
      label: `Crop to ${snapped.w} × ${snapped.h}`,
      args: { inputs: files.paths, ops: buildOps(rect, vw, vh, settings), output: spec },
    });

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop a video here"
            hint="One video at a time — drag a rectangle over the frame to choose what to keep"
            compact={Boolean(path)}
          />

          {probeError && <Alert tone="danger" title="This video could not be read.">{probeError}</Alert>}
          {path && info && (!vw || !vh) && (
            <Alert tone="warn" title="No video track in this file.">
              Cropping needs a picture to work on. This file only carries audio or data streams.
            </Alert>
          )}

          {path && vw > 0 && vh > 0 && (
            <Section
              title="Frame"
              description={`Source ${vw} × ${vh} · showing ${formatTimecode(frameTime)}`}
              actions={
                <>
                  <Button size="sm" variant="ghost" icon="Crop" onClick={() => applyRect(largestRect(vw, vh, ratio))}>
                    Fit frame
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="RotateCcw"
                    onClick={() => {
                      setAspect('free');
                      applyRect({ x: 0, y: 0, w: vw, h: vh });
                    }}
                  >
                    Reset
                  </Button>
                </>
              }
            >
              <div className="space-y-3">
                {framePath ? (
                  <CropCanvas
                    src={assetUrl(framePath)}
                    alt={`Frame at ${formatTimecode(frameTime)}`}
                    rect={snapped}
                    vw={vw}
                    vh={vh}
                    ratio={ratio}
                    onChange={applyRect}
                  />
                ) : (
                  <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border border-line bg-canvas text-ink-faint">
                    {framing ? <Spinner /> : <Icon name="Video" size={20} />}
                    <p className="text-[11.5px]">{frameError ?? 'Rendering a frame…'}</p>
                  </div>
                )}

                {duration > 0 && (
                  <Field label={`Preview frame — ${formatTimecode(frameTime)}`} hint="Check the crop against a busier moment.">
                    <Slider min={0} max={Math.max(0.1, duration)} step={0.1} value={Math.min(frameTime, duration)} onChange={setFrameTime} />
                  </Field>
                )}
              </div>
            </Section>
          )}

          {path && info && (
            <Section title="Source">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Resolution" value={vw && vh ? `${vw} × ${vh}` : '—'} />
                <Stat label="Duration" value={formatDuration(duration)} />
                <Stat label="Frame rate" value={fpsLabel(info.video?.fps)} />
                <Stat label="Size" value={formatBytes(info.size)} />
              </div>
            </Section>
          )}

          {path && probing && !info && (
            <div className="flex items-center gap-2 text-[12.5px] text-ink-faint">
              <Spinner /> Reading the video…
            </div>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} title="Cropped" onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section title="Shape" description={`Result ${snapped.w} × ${snapped.h} · ${ratioLabel(snapped)}`}>
            <div className="space-y-3">
              <PresetRow
                presets={ASPECTS.map((a) => ({ label: a.label, value: a.value }))}
                active={aspect}
                onSelect={chooseAspect}
              />
              <OptionsGrid>
                <Field label="Width">
                  <NumberInput
                    value={snapped.w}
                    min={2}
                    max={vw || 2}
                    step={2}
                    suffix="px"
                    disabled={!vw}
                    onValueChange={(w) => applyRect(ratio ? { ...rect, w, h: w / ratio } : { ...rect, w })}
                  />
                </Field>
                <Field label="Height">
                  <NumberInput
                    value={snapped.h}
                    min={2}
                    max={vh || 2}
                    step={2}
                    suffix="px"
                    disabled={!vh}
                    onValueChange={(h) => applyRect(ratio ? { ...rect, h, w: h * ratio } : { ...rect, h })}
                  />
                </Field>
                <Field label="Left offset">
                  <NumberInput
                    value={snapped.x}
                    min={0}
                    max={Math.max(0, vw - snapped.w)}
                    step={2}
                    suffix="px"
                    disabled={!vw}
                    onValueChange={(x) => applyRect({ ...rect, x })}
                  />
                </Field>
                <Field label="Top offset">
                  <NumberInput
                    value={snapped.y}
                    min={0}
                    max={Math.max(0, vh - snapped.h)}
                    step={2}
                    suffix="px"
                    disabled={!vh}
                    onValueChange={(y) => applyRect({ ...rect, y })}
                  />
                </Field>
              </OptionsGrid>
              <p className="text-[11.5px] text-ink-faint">
                H.264 and H.265 encode in 2 × 2 colour blocks, so every value here is rounded down to an even number.
              </p>
              {noop && (
                <Alert tone="warn">
                  The rectangle still covers the whole frame — nothing would be cropped, only re-encoded.
                </Alert>
              )}
            </div>
          </Section>

          <Section
            title="Quality"
            description={`Cropping always re-encodes the picture${
              encoding.videoCodec === 'libvpx-vp9' ? ' with VP9.' : ' with H.264.'
            }`}
          >
            <div className="space-y-3">
              <Field label={`CRF ${crf}`} hint="Lower keeps more detail and makes bigger files.">
                <Slider min={14} max={32} value={crf} onChange={setCrf} />
              </Field>
              {encoding.supportsPreset ? (
                <Field label="Encoder speed">
                  <Select
                    value={preset}
                    onChange={(e) => setPreset(e.target.value)}
                    options={['veryfast', 'faster', 'fast', 'medium', 'slow'].map((p) => ({ value: p, label: p }))}
                  />
                </Field>
              ) : (
                <p className="text-[11.5px] text-ink-faint">
                  WebM is written with VP9, which has no speed presets — only the quality above applies.
                </p>
              )}
              {encoding.format && (
                <Alert tone="info" title="Written as MP4">
                  A .{sourceExt} container cannot hold the H.264 video this tool produces, so the crop is saved as
                  MP4 instead.
                </Alert>
              )}
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label="Crop"
            icon="Crop"
            disabled={!path || !vw || !vh}
            disabledReason={!path ? 'Add a video first.' : 'Waiting for the video dimensions…'}
          />
        </>
      }
    />
  );
}
