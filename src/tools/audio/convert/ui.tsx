import { useEffect, useMemo, useState } from 'react';
import { call } from '@/core/bridge';
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
import { Alert, Field, Section, Segmented, Select, Spinner, Stat } from '@/components/ui';
import {
  AUDIO_FORMATS,
  BITRATES,
  buildConvertOps,
  estimateBytes,
  findFormat,
  isLosslessCodec,
  sampleRateChoices,
  usableSampleRate,
} from './logic';

const EXTENSIONS = [
  'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
  'aiff', 'aif', 'wma', 'caf', 'amr', 'ac3', 'mka', 'au',
];

/** The slice of `probe_media`'s MediaInfo this tool reads. */
interface ProbedAudio {
  path: string;
  name: string;
  size: number;
  duration?: number | null;
  formatLong: string;
  bitrate?: number | null;
  audio?: {
    codec: string;
    bitrate?: number | null;
    sampleRate?: number | null;
    channels?: number | null;
    channelLayout?: string | null;
  } | null;
}

function channelLabel(info: ProbedAudio): string {
  const channels = info.audio?.channels ?? 0;
  if (!channels) return '—';
  if (channels === 1) return 'Mono';
  if (channels === 2) return 'Stereo';
  return info.audio?.channelLayout || `${channels} channels`;
}

function kbps(bits: number | null | undefined): string {
  if (!bits || bits <= 0) return '—';
  return `${Math.round(bits / 1000)} kbps`;
}

/** 44100 → "44.1 kHz", 48000 → "48 kHz". */
function khz(rate: number): string {
  const value = rate / 1000;
  return `${Number.isInteger(value) ? value : value.toFixed(rate % 100 === 0 ? 1 : 2)} kHz`;
}

export default function AudioConverter() {
  const files = useToolFiles({ kinds: ['audio'], filterName: 'Audio', extensions: EXTENSIONS });
  const run = useToolRun('audio/convert', 'Audio Converter');
  const { spec, update } = useOutputSpec();

  const [format, setFormat] = useState('mp3');
  const [bitrate, setBitrate] = useState('192k');
  const [sampleRate, setSampleRate] = useState(0);
  const [mono, setMono] = useState(false);

  const [source, setSource] = useState<ProbedAudio | null>(null);
  const [reading, setReading] = useState(false);

  // Read the first file so the panel can show what is actually being converted.
  const firstPath = files.paths[0] ?? '';
  useEffect(() => {
    if (!firstPath) {
      setSource(null);
      return;
    }
    let stale = false;
    setReading(true);
    void call<ProbedAudio[]>('probe_media', { inputs: [firstPath] })
      .then((infos) => {
        if (!stale) setSource(infos[0] ?? null);
      })
      .catch(() => {
        // The conversion still works without the summary.
        if (!stale) setSource(null);
      })
      .finally(() => {
        if (!stale) setReading(false);
      });
    return () => {
      stale = true;
    };
  }, [firstPath]);

  const selected = findFormat(format);
  const rates = sampleRateChoices(format);
  const effectiveRate = usableSampleRate(format, sampleRate);

  const estimate = useMemo(() => {
    if (!selected.bitrate || !source?.duration) return 0;
    return estimateBytes(source.duration, bitrate);
  }, [selected.bitrate, source?.duration, bitrate]);

  const execute = () =>
    void run.execute({
      command: 'process_video',
      total: files.files.length,
      inputs: files.paths,
      label: `Convert ${files.files.length} file${files.files.length === 1 ? '' : 's'} to ${format.toUpperCase()}`,
      args: {
        inputs: files.paths,
        ops: buildConvertOps({ format, bitrate, sampleRate, mono }),
        output: spec,
      },
    });

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop audio files here"
            hint="MP3, WAV, M4A, AAC, FLAC, OGG, Opus, AIFF, WMA — batches welcome"
            accept="Folders are expanded automatically"
            allowFolders
          />

          {files.files.length > 0 && (
            <Section
              title="Source"
              description={
                files.files.length > 1
                  ? `${files.files.length} files · showing the first one`
                  : source?.name ?? files.files[0].name
              }
              actions={reading ? <Spinner /> : undefined}
            >
              {source ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                  <Stat label="Codec" value={source.audio?.codec?.toUpperCase() || '—'} hint={source.formatLong} />
                  <Stat label="Bitrate" value={kbps(source.audio?.bitrate ?? source.bitrate)} />
                  <Stat
                    label="Sample rate"
                    value={source.audio?.sampleRate ? khz(source.audio.sampleRate) : '—'}
                  />
                  <Stat label="Channels" value={channelLabel(source)} />
                  <Stat label="Length" value={formatDuration(source.duration)} />
                  <Stat label="Size" value={formatBytes(source.size)} />
                </div>
              ) : (
                <p className="text-[12.5px] text-ink-faint">
                  {reading ? 'Reading the file…' : 'FFprobe could not read this file, but converting it may still work.'}
                </p>
              )}

              {estimate > 0 && (
                <p className="mt-3 text-[12px] text-ink-faint">
                  At {bitrate.replace('k', ' kbps')} this file becomes roughly{' '}
                  <span className="font-medium text-ink">{formatBytes(estimate)}</span>
                  {source?.size ? ` (was ${formatBytes(source.size)})` : ''}.
                </p>
              )}
            </Section>
          )}

          {selected.lossless && source?.audio && !isLosslessCodec(source.audio.codec) && (
            <Alert tone="info" title="Lossless output cannot restore lost detail">
              The source is already compressed, so the {format.toUpperCase()} file will be much larger without sounding
              any better. Lossless formats are worth it when the source is lossless too.
            </Alert>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section title="Output format">
            <div className="space-y-3">
              <PresetRow
                presets={['mp3', 'm4a', 'wav', 'flac'].map((f) => ({ label: f.toUpperCase(), value: f }))}
                active={format}
                onSelect={setFormat}
              />
              <Field label="Format" hint={selected.hint}>
                <Select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  options={AUDIO_FORMATS.map((f) => ({ value: f.value, label: f.label }))}
                />
              </Field>

              {selected.bitrate && (
                <Field label="Bitrate" hint="Higher keeps more detail and makes larger files.">
                  <Select
                    value={bitrate}
                    onChange={(e) => setBitrate(e.target.value)}
                    options={BITRATES.map((b) => ({ value: b, label: `${parseInt(b, 10)} kbps` }))}
                  />
                </Field>
              )}

              <OptionsGrid>
                <Field label="Sample rate">
                  <Select
                    value={String(effectiveRate)}
                    onChange={(e) => setSampleRate(Number(e.target.value))}
                    options={[
                      { value: '0', label: 'Same as source' },
                      ...rates.map((r) => ({ value: String(r), label: khz(r) })),
                    ]}
                  />
                </Field>
                <Field label="Channels">
                  <Segmented
                    value={mono ? 'mono' : 'keep'}
                    onChange={(v) => setMono(v === 'mono')}
                    options={[
                      { value: 'keep', label: 'Keep' },
                      { value: 'mono', label: 'Mono' },
                    ]}
                    className="w-full"
                  />
                </Field>
              </OptionsGrid>

              {selected.bitrate ? (
                <p className="text-[11.5px] text-ink-faint">Embedded cover art is carried over where the format allows it.</p>
              ) : (
                <p className="text-[11.5px] text-ink-faint">Embedded cover art is not written into {format.toUpperCase()} files.</p>
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
            icon="AudioLines"
            disabled={files.isEmpty}
            disabledReason="Add at least one audio file first."
          />
        </>
      }
    />
  );
}
