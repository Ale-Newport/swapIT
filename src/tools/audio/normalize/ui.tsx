import { useState } from 'react';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  ErrorDisplay,
  FileDropZone,
  OutputSettings,
  ResultPanel,
  ToolActions,
  ToolShell,
  useOutputSpec,
} from '@/components/tool';
import { Alert, Field, Section, Select } from '@/components/ui';
import { BITRATES, LOUDNESS_TARGET, OUTPUT_FORMATS, buildNormalizeOps, findOutputFormat } from './logic';

const EXTENSIONS = [
  'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
  'aiff', 'aif', 'wma', 'caf', 'amr', 'ac3', 'mka', 'au',
];

export default function NormalizeVolume() {
  const files = useToolFiles({ kinds: ['audio'], filterName: 'Audio', extensions: EXTENSIONS });
  const run = useToolRun('audio/normalize', 'Normalize Volume');
  const { spec, update } = useOutputSpec({ suffix: '-normalized' });

  const [format, setFormat] = useState('same');
  const [bitrate, setBitrate] = useState('192k');

  const target = findOutputFormat(format);

  const execute = () =>
    void run.execute({
      command: 'process_video',
      total: files.files.length,
      inputs: files.paths,
      label: `Normalize ${files.files.length} file${files.files.length === 1 ? '' : 's'}`,
      args: {
        inputs: files.paths,
        ops: buildNormalizeOps(format, bitrate),
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

          <Section title="What normalizing does">
            <div className="space-y-3 text-[12.5px] leading-[1.6] text-ink-soft">
              <p>
                A quiet interview and a loud song end up at the same perceived loudness, so you can play one after the
                other without reaching for the volume knob. This is not the same as turning the volume up: the level is
                measured the way an ear hears it rather than by how tall the waveform is.
              </p>
              <p>
                Toolbox uses <span className="font-medium text-ink">EBU R128</span>, the measurement Spotify, YouTube
                and Apple Music all normalize to, at{' '}
                <span className="font-medium text-ink">{LOUDNESS_TARGET.integrated} LUFS</span> with peaks held below{' '}
                <span className="font-medium text-ink">{LOUDNESS_TARGET.truePeak} dBTP</span> and a loudness range of{' '}
                <span className="font-medium text-ink">{LOUDNESS_TARGET.range} LU</span>. Files already at that level
                come out practically unchanged.
              </p>
              <p className="text-ink-faint">
                It is a single pass: FFmpeg follows the loudness as it reads the file and adjusts the gain as it goes,
                so the gap between the quietest and the loudest parts of a track is narrowed a little on the way to the{' '}
                {LOUDNESS_TARGET.range} LU range. The audio is always encoded again — there is no way to normalize by
                copying. Keep the format lossless if you plan to edit the result further.
              </p>
            </div>
          </Section>

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
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

          {files.files.length > 1 && (
            <Alert tone="info">
              Each of the {files.files.length} files is normalized on its own to the same target, so they will match
              each other when played back to back.
            </Alert>
          )}

          <ToolActions
            run={run}
            onRun={execute}
            label="Normalize"
            icon="Activity"
            disabled={files.isEmpty}
            disabledReason="Add at least one audio file first."
          />
        </>
      }
    />
  );
}
