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
import { Alert, Badge, Field, Section, Select, Slider, Spinner, Stat, Switch } from '@/components/ui';
import {
  FORMATS,
  HEIGHT_CAPS,
  PRESETS,
  buildOps,
  estimateBytes,
  matchPreset,
  parseAudioKbps,
  videoCodecFor,
} from './logic';
import { useProbeAll } from './probe';

const EXTENSIONS = ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', '3gp', 'mts', 'm2ts'];
const AUDIO_BITRATES = ['192k', '160k', '128k', '96k', '64k'];

export default function CompressVideo() {
  const files = useToolFiles({ kinds: ['video'], filterName: 'Videos', extensions: EXTENSIONS });
  const run = useToolRun('video/compress', 'Compress Video');
  const { spec, update } = useOutputSpec({ suffix: '-small' });

  const [crf, setCrf] = useState(23);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  const [format, setFormat] = useState('mp4');
  const [codec, setCodec] = useState<'libx264' | 'libx265'>('libx264');
  const [encoderPreset, setEncoderPreset] = useState('medium');
  const [removeAudio, setRemoveAudio] = useState(false);
  const [audioBitrate, setAudioBitrate] = useState('128k');

  const { infos, loading: probing } = useProbeAll(files.paths);
  const activePreset = matchPreset(crf, maxHeight);
  const effectiveCodec = videoCodecFor(format, codec);

  const estimate = useMemo(() => {
    const audioKbps = removeAudio ? 0 : parseAudioKbps(audioBitrate);
    let bytes = 0;
    let sourceBytes = 0;
    let counted = 0;
    let duration = 0;
    for (const info of infos) {
      const v = info.video;
      if (!v?.width || !v?.height || !info.duration) continue;
      bytes += estimateBytes(
        { duration: info.duration, width: v.width, height: v.height, fps: v.fps ?? 30 },
        { crf, codec: effectiveCodec, maxHeight, audioKbps },
      );
      sourceBytes += info.size;
      duration += info.duration;
      counted += 1;
    }
    return { bytes, sourceBytes, counted, duration };
  }, [infos, crf, effectiveCodec, maxHeight, removeAudio, audioBitrate]);

  const saving =
    estimate.sourceBytes > 0 && estimate.bytes > 0
      ? Math.round(((estimate.sourceBytes - estimate.bytes) / estimate.sourceBytes) * 100)
      : null;

  const execute = () =>
    void run.execute({
      command: 'process_video',
      total: files.files.length,
      inputs: files.paths,
      label: `Compress ${files.files.length} video${files.files.length === 1 ? '' : 's'}`,
      args: {
        inputs: files.paths,
        ops: buildOps({ format, codec, crf, maxHeight, preset: encoderPreset, removeAudio, audioBitrate }),
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
            hint="Re-encoded with the quality you pick — the original is never touched"
            allowFolders
          />

          {files.files.length > 0 && (
            <Section
              title="Estimated result"
              description="A projection from the footage's resolution, frame rate and length — not a measurement."
              actions={probing ? <Spinner /> : undefined}
            >
              {estimate.counted === 0 ? (
                <p className="text-[12.5px] text-ink-faint">
                  {probing ? 'Reading the videos…' : 'These files carry no readable video stream, so there is nothing to estimate.'}
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="Original" value={formatBytes(estimate.sourceBytes)} hint={`${estimate.counted} file${estimate.counted === 1 ? '' : 's'}`} />
                    <Stat label="Estimate" value={`≈ ${formatBytes(estimate.bytes)}`} hint="Give or take 30%" />
                    <Stat
                      label="Change"
                      value={saving === null ? '—' : saving > 0 ? `≈ ${saving}% smaller` : `≈ ${Math.abs(saving)}% larger`}
                    />
                    <Stat label="Total length" value={formatDuration(estimate.duration)} />
                  </div>
                  {saving !== null && saving <= 0 && (
                    <Alert tone="warn">
                      At this quality the result is likely to be bigger than the source. Raise the CRF or cap the resolution.
                    </Alert>
                  )}
                  {probing && estimate.counted < files.files.length && (
                    <p className="text-[11.5px] text-ink-faint">
                      Covering {estimate.counted} of {files.files.length} files so far…
                    </p>
                  )}
                </div>
              )}
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} title="Compressed" onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section
            title="How small"
            description={PRESETS.find((p) => p.value === activePreset)?.hint ?? 'Custom — your own quality and cap'}
          >
            <div className="space-y-3">
              <PresetRow
                presets={PRESETS.map((p) => ({ label: p.label, value: p.value, hint: p.hint }))}
                active={activePreset}
                onSelect={(value) => {
                  const preset = PRESETS.find((p) => p.value === value);
                  if (!preset) return;
                  setCrf(preset.crf);
                  setMaxHeight(preset.maxHeight);
                }}
              />
              <Field
                label={`Quality — CRF ${crf}`}
                hint="Lower keeps more detail and makes bigger files. Every 6 points roughly doubles or halves the size."
              >
                <Slider min={16} max={40} value={crf} onChange={setCrf} />
              </Field>
              <Field label="Resolution cap" hint="Videos already smaller than the cap are left at their own size.">
                <Select
                  value={String(maxHeight ?? 0)}
                  onChange={(e) => setMaxHeight(Number(e.target.value) || null)}
                  options={HEIGHT_CAPS}
                />
              </Field>
            </div>
          </Section>

          <Section title="Encoding">
            <div className="space-y-3">
              <Field label="Output format">
                <Select value={format} onChange={(e) => setFormat(e.target.value)} options={FORMATS} />
              </Field>
              {format === 'webm' ? (
                <p className="text-[11.5px] text-ink-faint">WebM files are encoded with VP9 and Opus.</p>
              ) : (
                <>
                  <Field label="Codec">
                    <Select
                      value={codec}
                      onChange={(e) => setCodec(e.target.value as 'libx264' | 'libx265')}
                      options={[
                        { value: 'libx264', label: 'H.264 — plays on anything' },
                        { value: 'libx265', label: 'H.265 — about a third smaller' },
                      ]}
                    />
                  </Field>
                  <Field label="Encoder speed" hint="Slower means a smaller file at the same quality.">
                    <Select
                      value={encoderPreset}
                      onChange={(e) => setEncoderPreset(e.target.value)}
                      options={['veryfast', 'faster', 'fast', 'medium', 'slow', 'slower'].map((p) => ({ value: p, label: p }))}
                    />
                  </Field>
                </>
              )}
              <OptionsGrid cols={1}>
                <Field inline label="Remove audio" hint="Drops the soundtrack entirely">
                  <Switch checked={removeAudio} onCheckedChange={setRemoveAudio} />
                </Field>
              </OptionsGrid>
              {!removeAudio && (
                <Field label="Audio bitrate">
                  <Select
                    value={audioBitrate}
                    onChange={(e) => setAudioBitrate(e.target.value)}
                    options={AUDIO_BITRATES.map((b) => ({ value: b, label: b.replace('k', ' kbps') }))}
                  />
                </Field>
              )}
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label="Compress"
            icon="Minimize2"
            disabled={files.isEmpty}
            disabledReason="Add at least one video first."
          >
            {estimate.bytes > 0 && !run.running && <Badge tone="accent">≈ {formatBytes(estimate.bytes)}</Badge>}
          </ToolActions>
        </>
      }
    />
  );
}
