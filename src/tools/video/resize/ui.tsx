import { useMemo, useState } from 'react';
import { formatBytes, formatDuration } from '@/core/format';
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
  useOutputSpec,
} from '@/components/tool';
import { Alert, Field, Icon, Input, Section, Select, Slider, Spinner, Stat, Switch } from '@/components/ui';
import {
  ASPECTS,
  RESOLUTIONS,
  aspectDims,
  buildOps,
  canAvoidUpscaling,
  distortion,
  matchResolution,
  parseDim,
  predict,
  resolutionDims,
  type Dims,
} from './logic';
import { fpsLabel, useProbe } from './probe';

const EXTENSIONS = ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', '3gp', 'mts', 'm2ts'];

export default function ResizeVideo() {
  const files = useToolFiles({ kinds: ['video'], filterName: 'Videos', extensions: EXTENSIONS });
  const run = useToolRun('video/resize', 'Resize Video');
  const { spec, update } = useOutputSpec({ suffix: '-resized' });

  const [widthText, setWidthText] = useState('');
  const [heightText, setHeightText] = useState('720');
  const [noUpscale, setNoUpscale] = useState(true);
  const [crf, setCrf] = useState(21);
  const [preset, setPreset] = useState('medium');

  const { info, loading: probing, error: probeError } = useProbe(files.paths[0] ?? null);
  const source = info?.video?.width && info.video.height ? { w: info.video.width, h: info.video.height } : null;

  const dims: Dims = useMemo(
    () => ({ width: parseDim(widthText), height: parseDim(heightText) }),
    [widthText, heightText],
  );

  const applyDims = (next: Dims) => {
    setWidthText(next.width ? String(next.width) : '');
    setHeightText(next.height ? String(next.height) : '');
  };

  const activeResolution = matchResolution(dims, source);
  const result = predict(dims, source, noUpscale);
  const stretch = distortion(dims, source);
  const canCap = canAvoidUpscaling(dims);
  const hasTarget = Boolean(dims.width || dims.height);

  const execute = () =>
    void run.execute({
      command: 'process_video',
      total: files.files.length,
      inputs: files.paths,
      label: `Resize ${files.files.length} video${files.files.length === 1 ? '' : 's'}`,
      args: { inputs: files.paths, ops: buildOps(dims, { noUpscale, crf, preset }), output: spec },
    });

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop videos here"
            hint="Scaled with a Lanczos filter, which keeps edges crisp when shrinking"
            allowFolders
          />

          {files.files.length > 0 && (
            <Section
              title="Source"
              description={files.files.length > 1 ? `First of ${files.files.length} files — presets follow this one` : undefined}
            >
              {probing && !info ? (
                <div className="flex items-center gap-2 text-[12.5px] text-ink-faint">
                  <Spinner /> Reading the video…
                </div>
              ) : (
                <div className="space-y-3">
                  {probeError && (
                    <Alert tone="warn" title="The details of this video could not be read.">
                      {probeError} A width or height still works — only the aspect presets and the before/after line
                      need the source size.
                    </Alert>
                  )}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="Resolution" value={source ? `${source.w} × ${source.h}` : '—'} />
                    <Stat label="Frame rate" value={fpsLabel(info?.video?.fps)} />
                    <Stat label="Duration" value={formatDuration(info?.duration)} />
                    <Stat label="Size" value={formatBytes(info?.size)} />
                  </div>
                  {source && result && (
                    <div className="flex items-center gap-3 rounded-lg border border-line bg-canvas px-3 py-2 text-[13px] text-ink">
                      <span className="tabular-nums">{source.w} × {source.h}</span>
                      <Icon name="ArrowRight" size={14} className="text-ink-faint" />
                      <span className="font-medium tabular-nums">{result.w} × {result.h}</span>
                      {result.w === source.w && result.h === source.h && (
                        <span className="text-[11.5px] text-ink-faint">unchanged</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} title="Resized" onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section title="Target size">
            <div className="space-y-3">
              <Field label="Resolution">
                <PresetRow
                  presets={RESOLUTIONS.map((r) => ({ label: r.label, value: r.value }))}
                  active={activeResolution ?? undefined}
                  onSelect={(value) => applyDims(resolutionDims(value, source))}
                />
              </Field>

              <Field
                label="Aspect ratio"
                hint={
                  source
                    ? "Keeps the source's longer side and reshapes the other."
                    : files.isEmpty
                      ? 'Add a video to use these.'
                      : probing
                        ? 'Reading the video…'
                        : 'The source dimensions could not be read.'
                }
              >
                {source ? (
                  <PresetRow
                    presets={ASPECTS.map((a) => ({ label: a.label, value: a.value }))}
                    onSelect={(value) => {
                      const aspect = ASPECTS.find((a) => a.value === value);
                      if (aspect) applyDims(aspectDims(aspect.ratio, source));
                    }}
                  />
                ) : (
                  <p className="text-[12px] text-ink-faint">
                    {files.isEmpty
                      ? 'Aspect presets need the source dimensions.'
                      : probing
                        ? 'Reading the source dimensions…'
                        : 'Aspect presets need the source dimensions, which this file did not report. Type a width and height instead.'}
                  </p>
                )}
              </Field>

              <OptionsGrid>
                <Field label="Width">
                  <Input
                    value={widthText}
                    onChange={(e) => setWidthText(e.target.value)}
                    placeholder="Auto"
                    inputMode="numeric"
                    className="tabular-nums"
                  />
                </Field>
                <Field label="Height">
                  <Input
                    value={heightText}
                    onChange={(e) => setHeightText(e.target.value)}
                    placeholder="Auto"
                    inputMode="numeric"
                    className="tabular-nums"
                  />
                </Field>
              </OptionsGrid>
              <p className="text-[11.5px] text-ink-faint">
                Leave one side empty and FFmpeg works it out from the other, keeping the aspect ratio and rounding to an
                even number — that is what its <span className="font-mono">-2</span> setting does.
              </p>

              {canCap && (
                <Field inline label="Never enlarge" hint="Leave smaller videos at their own size">
                  <Switch checked={noUpscale} onCheckedChange={setNoUpscale} />
                </Field>
              )}
              {!canCap && hasTarget && (
                <p className="text-[11.5px] text-ink-faint">
                  With both sides pinned every video is scaled to exactly that size. Clear one side to cap instead.
                </p>
              )}
              {stretch > 0.01 && (
                <Alert tone="warn">
                  This target does not match the source shape, so the picture will be stretched. Crop Video keeps the
                  proportions instead.
                </Alert>
              )}
            </div>
          </Section>

          <Section title="Quality" description="Resizing always re-encodes the picture.">
            <div className="space-y-3">
              <Field label={`CRF ${crf}`} hint="Lower keeps more detail and makes bigger files.">
                <Slider min={14} max={32} value={crf} onChange={setCrf} />
              </Field>
              <Field label="Encoder speed">
                <Select
                  value={preset}
                  onChange={(e) => setPreset(e.target.value)}
                  options={['veryfast', 'faster', 'fast', 'medium', 'slow'].map((p) => ({ value: p, label: p }))}
                />
              </Field>
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label="Resize"
            icon="Scaling"
            disabled={files.isEmpty || !hasTarget}
            disabledReason={files.isEmpty ? 'Add at least one video first.' : 'Set a width, a height, or both.'}
          />
        </>
      }
    />
  );
}
