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
import { Alert, Field, NumberInput, Section, Segmented, Select, Slider, Spinner, Stat, Switch } from '@/components/ui';
import {
  AUDIO_BITRATES,
  AUDIO_LABELS,
  CONTAINERS,
  PRESETS,
  VIDEO_LABELS,
  buildOps,
  container,
  effectiveAudioCodec,
  effectiveVideoCodec,
  qualityHint,
  qualityLabel,
  supportsAudioBitrate,
  supportsCrf,
  supportsPreset,
  supportsVideoBitrate,
  type AudioCodec,
  type VideoCodec,
} from './logic';
import { dimensions, fpsLabel, useProbe } from './probe';

const EXTENSIONS = ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', '3gp', 'ogv', 'mts', 'm2ts'];

export default function VideoConverter() {
  const files = useToolFiles({ kinds: ['video'], filterName: 'Videos', extensions: EXTENSIONS });
  const run = useToolRun('video/convert', 'Video Converter');
  const { spec, update } = useOutputSpec();

  const [format, setFormat] = useState('mp4');
  const [videoCodec, setVideoCodec] = useState<VideoCodec>('auto');
  const [audioCodec, setAudioCodec] = useState<AudioCodec>('auto');
  const [qualityMode, setQualityMode] = useState<'crf' | 'bitrate'>('crf');
  const [crf, setCrf] = useState(23);
  const [videoBitrateKbps, setVideoBitrateKbps] = useState(4000);
  const [audioBitrate, setAudioBitrate] = useState('192k');
  const [preset, setPreset] = useState('medium');
  const [removeAudio, setRemoveAudio] = useState(false);

  const { info, loading: probing } = useProbe(files.paths[0] ?? null);
  const box = container(format);

  // Keep the codec choices legal whenever the container changes.
  const activeVideo: VideoCodec = box.video.includes(videoCodec) ? videoCodec : 'auto';
  const activeAudio: AudioCodec = box.audio.includes(audioCodec) ? audioCodec : 'auto';

  const isCopy = activeVideo === 'copy';
  const canCrf = supportsCrf(format, activeVideo);
  const canPreset = supportsPreset(format, activeVideo);
  const canBitrate = supportsVideoBitrate(format, activeVideo);
  const canAudioBitrate = supportsAudioBitrate(format, activeAudio);

  const settings = useMemo(
    () => ({
      format,
      videoCodec: activeVideo,
      audioCodec: activeAudio,
      qualityMode: canCrf ? qualityMode : ('bitrate' as const),
      crf,
      videoBitrateKbps,
      audioBitrate,
      preset,
      removeAudio,
    }),
    [format, activeVideo, activeAudio, canCrf, qualityMode, crf, videoBitrateKbps, audioBitrate, preset, removeAudio],
  );

  const execute = () =>
    void run.execute({
      command: 'process_video',
      total: files.files.length,
      inputs: files.paths,
      label: `Convert ${files.files.length} video${files.files.length === 1 ? '' : 's'} to ${format.toUpperCase()}`,
      args: { inputs: files.paths, ops: buildOps(settings), output: spec },
    });

  const sourceCodec = info?.video?.codec ?? null;
  const copyMismatch =
    isCopy && sourceCodec
      ? (format === 'webm' && !['vp8', 'vp9', 'av1'].includes(sourceCodec)) ||
        (format === 'avi' && ['hevc', 'vp9', 'av1'].includes(sourceCodec))
      : false;

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop videos here"
            hint="MP4, MOV, MKV, WebM, AVI, MPEG — batches welcome"
            allowFolders
          />

          {files.files.length > 0 && (
            <Section
              title="Source"
              description={files.files.length > 1 ? `First of ${files.files.length} files` : info?.formatLong || undefined}
            >
              {probing && !info ? (
                <div className="flex items-center gap-2 text-[12.5px] text-ink-faint">
                  <Spinner /> Reading the file…
                </div>
              ) : info ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <Stat label="Container" value={(info.formatName || '—').split(',')[0].toUpperCase()} />
                  <Stat
                    label="Video"
                    value={info.video?.codec ? info.video.codec.toUpperCase() : 'None'}
                    hint={dimensions(info) ?? undefined}
                  />
                  <Stat label="Frame rate" value={fpsLabel(info.video?.fps)} />
                  <Stat label="Duration" value={formatDuration(info.duration)} />
                  <Stat
                    label="Audio"
                    value={info.audio?.codec ? info.audio.codec.toUpperCase() : 'None'}
                    hint={info.audio?.channels ? `${info.audio.channels} ch` : undefined}
                  />
                  <Stat
                    label="Size"
                    value={formatBytes(info.size)}
                    hint={info.bitrate ? `${Math.round(info.bitrate / 1000)} kbps` : undefined}
                  />
                </div>
              ) : (
                <p className="text-[12.5px] text-ink-faint">FFprobe could not read this file.</p>
              )}
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section title="Container" description={box.hint}>
            <div className="space-y-3">
              <PresetRow
                presets={CONTAINERS.slice(0, 4).map((c) => ({ label: c.value.toUpperCase(), value: c.value, hint: c.hint }))}
                active={format}
                onSelect={setFormat}
              />
              <Select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                options={CONTAINERS.map((c) => ({ value: c.value, label: c.label }))}
              />
            </div>
          </Section>

          <Section title="Video">
            <div className="space-y-3">
              <Field label="Codec">
                <Select
                  value={activeVideo}
                  onChange={(e) => setVideoCodec(e.target.value as VideoCodec)}
                  options={box.video.map((c) => ({ value: c, label: VIDEO_LABELS[c] }))}
                />
              </Field>

              {isCopy ? (
                <Alert tone={copyMismatch ? 'warn' : 'info'}>
                  {copyMismatch
                    ? `A ${sourceCodec?.toUpperCase()} track cannot go into a ${format.toUpperCase()} file untouched. Pick a codec above to re-encode.`
                    : 'Streams are moved into the new container untouched — seconds instead of minutes, and no quality is lost.'}
                </Alert>
              ) : (
                <>
                  {canCrf && (
                    <Field label="Quality target">
                      <Segmented
                        value={qualityMode}
                        onChange={setQualityMode}
                        options={[
                          { value: 'crf', label: 'Constant quality' },
                          { value: 'bitrate', label: 'Fixed bitrate' },
                        ]}
                        className="w-full"
                      />
                    </Field>
                  )}

                  {canCrf && qualityMode === 'crf' ? (
                    <Field label={`${qualityLabel(crf)} — CRF ${crf}`} hint={qualityHint(crf)}>
                      <Slider min={14} max={40} value={crf} onChange={setCrf} />
                    </Field>
                  ) : !canBitrate ? (
                    <p className="text-[11.5px] text-ink-faint">
                      ProRes sets its own data rate from the codec profile, so there is no quality dial — expect files
                      several times larger than the source.
                    </p>
                  ) : (
                    <Field
                      label="Video bitrate"
                      hint={
                        canCrf
                          ? 'A fixed bitrate makes the size predictable, the quality less so.'
                          : `${effectiveVideoCodec(format, activeVideo)} ignores CRF — set a bitrate instead, or leave it at 0 for the encoder default.`
                      }
                    >
                      <NumberInput
                        value={videoBitrateKbps}
                        onValueChange={setVideoBitrateKbps}
                        min={0}
                        max={200000}
                        step={250}
                        suffix="kbps"
                      />
                    </Field>
                  )}

                  {canPreset && (
                    <Field label="Encoder speed" hint="Slower squeezes more out of every bit. Same picture, smaller file.">
                      <Select
                        value={preset}
                        onChange={(e) => setPreset(e.target.value)}
                        options={PRESETS.map((p) => ({ value: p, label: p }))}
                      />
                    </Field>
                  )}
                </>
              )}
            </div>
          </Section>

          <Section title="Audio">
            <div className="space-y-3">
              <OptionsGrid cols={1}>
                <Field inline label="Remove audio" hint="Produce a silent video">
                  <Switch checked={removeAudio} onCheckedChange={setRemoveAudio} />
                </Field>
              </OptionsGrid>
              {!removeAudio && !isCopy && (
                <>
                  <Field label="Codec">
                    <Select
                      value={activeAudio}
                      onChange={(e) => setAudioCodec(e.target.value as AudioCodec)}
                      options={box.audio.map((c) => ({ value: c, label: AUDIO_LABELS[c] }))}
                    />
                  </Field>
                  {canAudioBitrate ? (
                    <Field label="Bitrate">
                      <Select
                        value={audioBitrate}
                        onChange={(e) => setAudioBitrate(e.target.value)}
                        options={AUDIO_BITRATES.map((b) => ({ value: b, label: b.replace('k', ' kbps') }))}
                      />
                    </Field>
                  ) : (
                    <p className="text-[11.5px] text-ink-faint">
                      {effectiveAudioCodec(format, activeAudio) === 'copy'
                        ? 'The audio track is carried over untouched.'
                        : 'This codec is lossless, so there is no bitrate to choose.'}
                    </p>
                  )}
                </>
              )}
              {!removeAudio && isCopy && (
                <p className="text-[11.5px] text-ink-faint">The audio track is copied along with the video.</p>
              )}
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label={`Convert to ${format.toUpperCase()}`}
            icon="FileVideo"
            disabled={files.isEmpty}
            disabledReason="Add at least one video first."
          />
        </>
      }
    />
  );
}
