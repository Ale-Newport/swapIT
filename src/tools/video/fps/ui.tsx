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
import { FPS_PRESETS, buildOps, direction, encodingFor, explain, formatFps, parseFps } from './logic';
import { dimensions, useProbe } from './probe';

const EXTENSIONS = ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', '3gp', 'mts', 'm2ts'];

export default function ChangeFrameRate() {
  const files = useToolFiles({ kinds: ['video'], filterName: 'Videos', extensions: EXTENSIONS });
  const run = useToolRun('video/fps', 'Change Frame Rate');
  const { spec, update } = useOutputSpec({ suffix: '-fps' });

  const [fpsText, setFpsText] = useState('30');
  const [interpolate, setInterpolate] = useState(false);
  const [crf, setCrf] = useState(21);
  const [preset, setPreset] = useState('medium');

  const { info, loading: probing } = useProbe(files.paths[0] ?? null);
  const sourceFps = info?.video?.fps ?? null;
  const target = parseFps(fpsText);
  const activePreset = target !== null && FPS_PRESETS.some((p) => p.value === target) ? target : undefined;
  const way = target === null ? 'unknown' : direction(sourceFps, target);

  // Interpolation only means anything when frames have to be invented. The switch
  // hides itself when the rate goes down, so the flag is dropped from the payload
  // as well — otherwise a value left over from a raise would silently run
  // minterpolate on a run the panel is describing as dropped frames.
  const canInterpolate = way === 'up' || way === 'unknown';
  const interpolating = interpolate && canInterpolate;

  const encoding = useMemo(
    () => encodingFor(files.files.map((f) => f.extension)),
    [files.files],
  );
  const rewrapped = useMemo(
    () => files.files.filter((f) => encoding.format && f.extension.toLowerCase() !== encoding.format),
    [files.files, encoding.format],
  );

  const settings = useMemo(
    () => ({ interpolate: interpolating, crf, preset, encoding }),
    [interpolating, crf, preset, encoding],
  );

  const execute = () => {
    if (target === null) return;
    void run.execute({
      command: 'process_video',
      total: files.files.length,
      inputs: files.paths,
      label: `Set ${files.files.length} video${files.files.length === 1 ? '' : 's'} to ${target} fps`,
      args: { inputs: files.paths, ops: buildOps(target, settings), output: spec },
    });
  };

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop videos here"
            hint="The frame rate changes; the running time does not"
            allowFolders
          />

          {files.files.length > 0 && (
            <Section
              title="Source"
              description={files.files.length > 1 ? `First of ${files.files.length} files` : undefined}
            >
              {probing && !info ? (
                <div className="flex items-center gap-2 text-[12.5px] text-ink-faint">
                  <Spinner /> Reading the video…
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="Frame rate" value={`${formatFps(sourceFps)} fps`} />
                    <Stat label="Resolution" value={dimensions(info) ?? '—'} />
                    <Stat label="Duration" value={formatDuration(info?.duration)} />
                    <Stat label="Size" value={formatBytes(info?.size)} />
                  </div>
                  {sourceFps && target !== null && (
                    <div className="flex items-center gap-3 rounded-lg border border-line bg-canvas px-3 py-2 text-[13px] text-ink">
                      <span className="tabular-nums">{formatFps(sourceFps)} fps</span>
                      <Icon name="ArrowRight" size={14} className="text-ink-faint" />
                      <span className="font-medium tabular-nums">{target} fps</span>
                      <span className="text-[11.5px] text-ink-faint">
                        {way === 'up' ? 'more frames per second' : way === 'down' ? 'fewer frames per second' : 'no change'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} title="Re-timed" onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section title="Frame rate">
            <div className="space-y-3">
              <PresetRow
                presets={FPS_PRESETS.map((p) => ({ label: p.label, value: p.value, hint: p.hint }))}
                active={activePreset}
                onSelect={(value) => setFpsText(String(value))}
              />
              <Field
                label="Custom"
                hint="Anything from 1 to 240. Decimals such as 29.97 are fine."
                error={fpsText.trim() && target === null ? 'Enter a frame rate between 1 and 240.' : undefined}
              >
                <Input
                  value={fpsText}
                  onChange={(e) => setFpsText(e.target.value)}
                  inputMode="decimal"
                  placeholder="30"
                  className="tabular-nums"
                />
              </Field>

              {target !== null && (
                <Alert tone={way === 'up' && !interpolating ? 'warn' : 'info'}>
                  {explain(sourceFps, target, interpolating)}
                </Alert>
              )}

              {target !== null && canInterpolate && (
                <>
                  <OptionsGrid cols={1}>
                    <Field
                      inline
                      label="Invent the in-between frames"
                      hint={
                        way === 'unknown'
                          ? 'Motion interpolation — the source rate could not be read'
                          : 'Motion interpolation, not duplication'
                      }
                    >
                      <Switch checked={interpolate} onCheckedChange={setInterpolate} />
                    </Field>
                  </OptionsGrid>
                  {interpolate && (
                    <Alert tone="warn">
                      Motion interpolation is slow — think minutes of encoding per minute of video — and it can smear
                      fast movement or fine detail. Worth trying on steady footage, rarely on action.
                    </Alert>
                  )}
                </>
              )}
            </div>
          </Section>

          <Section
            title="Quality"
            description={`Changing the frame rate re-encodes the picture${
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
              {rewrapped.length > 0 && (
                <Alert tone="info" title="Written as MP4">
                  {files.files.length === 1
                    ? `A .${rewrapped[0].extension.toLowerCase()} container cannot hold the H.264 video this tool produces, so it is saved as MP4 instead.`
                    : 'One run writes one container, and not all of these can hold the H.264 video this tool produces, so every file comes out as MP4.'}
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
            label={target === null ? 'Change frame rate' : `Set to ${target} fps`}
            icon="Gauge"
            disabled={files.isEmpty || target === null}
            disabledReason={files.isEmpty ? 'Add at least one video first.' : 'Enter a frame rate between 1 and 240.'}
          />
        </>
      }
    />
  );
}
