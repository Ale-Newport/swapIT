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
import { Field, Section, Select } from '@/components/ui';

const FORMATS = [
  { value: 'mp3', label: 'MP3 — universal', codec: 'libmp3lame' },
  { value: 'm4a', label: 'M4A / AAC — Apple', codec: 'aac' },
  { value: 'wav', label: 'WAV — uncompressed', codec: 'pcm_s16le' },
  { value: 'flac', label: 'FLAC — lossless', codec: 'flac' },
  { value: 'ogg', label: 'OGG Vorbis', codec: 'libvorbis' },
  { value: 'opus', label: 'Opus', codec: 'libopus' },
];

export default function ExtractAudio() {
  const files = useToolFiles({ kinds: ['video'], filterName: 'Videos' });
  const run = useToolRun('video/extract-audio', 'Extract Audio');
  const { spec, update } = useOutputSpec();
  const [format, setFormat] = useState('mp3');

  const selected = FORMATS.find((f) => f.value === format) ?? FORMATS[0];
  const lossless = format === 'wav' || format === 'flac';

  /**
   * Dropping the video track needs `audioOnly`, and `process_video` skips its
   * whole encoder block in that mode — the `} else if !ops.audio_only {` branch
   * in src-tauri/src/cmd/media.rs is where `-c:a` and `-b:a` are pushed. So a
   * bitrate cannot reach FFmpeg from here: the container picks the encoder and
   * its standard rate. The codec is still named, so it lands correctly the day
   * the backend forwards it, but a bitrate control would be pure decoration —
   * so the panel offers the format alone.
   */
  const execute = () =>
    void run.execute({
      command: 'process_video',
      total: files.files.length,
      inputs: files.paths,
      label: `Extract audio as ${format.toUpperCase()}`,
      args: {
        inputs: files.paths,
        ops: {
          format,
          audioOnly: true,
          audioCodec: selected.codec,
        },
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
            hint="MP4, MOV, MKV, AVI, WebM — the audio track is written out on its own, without the picture"
            allowFolders
          />
          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section title="Audio format">
            <div className="space-y-3">
              <Field
                label="Format"
                hint={
                  lossless
                    ? 'Lossless — every bit of the original track is kept, at the size that costs.'
                    : 'Compressed at the standard quality FFmpeg uses for this format. Pick WAV or FLAC to keep everything.'
                }
              >
                <Select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  options={FORMATS.map((f) => ({ value: f.value, label: f.label }))}
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
            label="Extract audio"
            icon="AudioLines"
            disabled={files.isEmpty}
            disabledReason="Add at least one video first."
          />
        </>
      }
    />
  );
}
