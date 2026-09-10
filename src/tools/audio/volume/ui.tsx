import { useState } from 'react';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  ErrorDisplay,
  FileDropZone,
  OutputSettings,
  PresetRow,
  ResultPanel,
  ToolActions,
  ToolShell,
  useOutputSpec,
} from '@/components/tool';
import { Alert, Field, NumberInput, Section, Select, Slider, Stat } from '@/components/ui';
import {
  BITRATES,
  CLIPPING_WARNING_DB,
  MAX_DB,
  MIN_DB,
  OUTPUT_FORMATS,
  buildVolumeOps,
  dbToLinear,
  findOutputFormat,
  formatMultiplier,
} from './logic';

const EXTENSIONS = [
  'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
  'aiff', 'aif', 'wma', 'caf', 'amr', 'ac3', 'mka', 'au',
];

const PRESETS = [
  { label: '−12 dB', value: -12, hint: 'A quarter as loud' },
  { label: '−6 dB', value: -6, hint: 'Half the amplitude' },
  { label: '−3 dB', value: -3, hint: 'Noticeably quieter' },
  { label: '0 dB', value: 0, hint: 'Unchanged' },
  { label: '+3 dB', value: 3, hint: 'Noticeably louder' },
  { label: '+6 dB', value: 6, hint: 'Twice the amplitude' },
];

function clampDb(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_DB, Math.max(MIN_DB, value));
}

export default function ChangeVolume() {
  const files = useToolFiles({ kinds: ['audio'], filterName: 'Audio', extensions: EXTENSIONS });
  const run = useToolRun('audio/volume', 'Change Volume');
  const { spec, update } = useOutputSpec({ suffix: '-volume' });

  const [db, setDb] = useState(3);
  const [format, setFormat] = useState('same');
  const [bitrate, setBitrate] = useState('192k');

  const target = findOutputFormat(format);
  const multiplier = dbToLinear(db);
  const unchanged = Math.abs(db) < 0.05;
  const risky = db > CLIPPING_WARNING_DB;

  const execute = () =>
    void run.execute({
      command: 'process_video',
      total: files.files.length,
      inputs: files.paths,
      label: `${db > 0 ? '+' : ''}${db} dB on ${files.files.length} file${files.files.length === 1 ? '' : 's'}`,
      args: {
        inputs: files.paths,
        ops: buildVolumeOps(db, format, bitrate),
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
            hint="MP3, WAV, M4A, FLAC, OGG, AIFF — batches welcome"
            accept="Folders are expanded automatically"
            allowFolders
          />

          <Section
            title="Change"
            description="Decibels are how loudness is measured; the multiplier is what FFmpeg scales the waveform by."
          >
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Adjustment" value={`${db > 0 ? '+' : ''}${db} dB`} />
              <Stat label="Multiplier" value={formatMultiplier(db)} hint={`Every sample × ${multiplier.toFixed(4)}`} />
              <Stat
                label="Perceived"
                value={unchanged ? 'Unchanged' : db > 0 ? 'Louder' : 'Quieter'}
                hint={
                  unchanged
                    ? 'No gain applied'
                    : `${Math.abs(db) >= 10 ? 'A lot' : Math.abs(db) >= 5 ? 'Clearly' : 'Slightly'} ${db > 0 ? 'up' : 'down'}`
                }
              />
              <Stat label="Files" value={files.files.length || '—'} />
            </div>

            {risky && (
              <Alert tone="warn" className="mt-3" title="More than +6 dB can clip">
                Anything already close to full scale has nowhere left to go and will be squared off, which sounds
                distorted. If the file is simply too quiet overall, Normalize Volume measures it first and lands it at
                the right level without clipping.
              </Alert>
            )}
          </Section>

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section title="Level">
            <div className="space-y-3">
              <PresetRow presets={PRESETS} active={db} onSelect={setDb} />
              <Field
                label={`${db > 0 ? '+' : ''}${db} dB — ${formatMultiplier(db)}`}
                hint="Every 6 dB doubles or halves the amplitude."
              >
                <Slider
                  min={MIN_DB}
                  max={MAX_DB}
                  step={0.5}
                  value={db}
                  onChange={(value) => setDb(Number(value.toFixed(1)))}
                />
              </Field>
              <Field label="Exact value">
                <NumberInput
                  value={db}
                  min={MIN_DB}
                  max={MAX_DB}
                  step={0.5}
                  suffix="dB"
                  onValueChange={(value) => setDb(clampDb(value))}
                />
              </Field>
            </div>
          </Section>

          <Section title="Output format">
            <div className="space-y-3">
              <Field label="Format">
                <Select value={format} onChange={(e) => setFormat(e.target.value)} options={OUTPUT_FORMATS} />
              </Field>
              {target.bitrate ? (
                <Field label="Bitrate" hint="Higher keeps more detail and makes larger files.">
                  <Select
                    value={bitrate}
                    onChange={(e) => setBitrate(e.target.value)}
                    options={BITRATES.map((b) => ({ value: b, label: `${parseInt(b, 10)} kbps` }))}
                  />
                </Field>
              ) : (
                <p className="text-[11.5px] text-ink-faint">
                  {format === 'same'
                    ? 'Each file keeps its own container and is re-encoded at that encoder’s default quality — about 128 kbps for MP3 and M4A. Choose a format above to set an exact bitrate.'
                    : 'Lossless output: nothing is thrown away, but the files are considerably larger.'}
                </p>
              )}
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label={`Apply ${db > 0 ? '+' : ''}${db} dB`}
            icon="Volume2"
            disabled={files.isEmpty || unchanged}
            disabledReason={files.isEmpty ? 'Add at least one audio file first.' : 'Pick a level other than 0 dB.'}
          />
        </>
      }
    />
  );
}
