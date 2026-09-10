import { open } from '@tauri-apps/plugin-dialog';
import { useEffect, useMemo, useState } from 'react';
import { appPaths } from '@/core/bridge';
import { formatBytes, formatDuration, shortenPath } from '@/core/format';
import { usePrefs } from '@/core/prefs';
import { useToolRun } from '@/core/useToolRun';
import { ErrorDisplay, PresetRow, ResultPanel, ToolActions, ToolShell } from '@/components/tool';
import { Alert, Button, Field, Icon, Input, Section, Select, Stat } from '@/components/ui';
import { estimateBytes, parseDurationInput, silenceFilename } from './logic';

const PRESETS = [
  { label: '1 second', value: '1' },
  { label: '5 seconds', value: '5' },
  { label: '10 seconds', value: '10' },
  { label: '30 seconds', value: '30' },
  { label: '1 minute', value: '1:00' },
];

const FORMATS = [
  { value: 'mp3', label: 'MP3 (.mp3)' },
  { value: 'wav', label: 'WAV — uncompressed (.wav)' },
  { value: 'm4a', label: 'M4A / AAC (.m4a)' },
  { value: 'flac', label: 'FLAC — lossless (.flac)' },
];

export default function GenerateSilence() {
  const run = useToolRun('audio/silence', 'Generate Silence');
  const lastOutputDir = usePrefs((s) => s.lastOutputDir);
  const setLastOutputDir = usePrefs((s) => s.setLastOutputDir);
  const [duration, setDuration] = useState('5');
  const [format, setFormat] = useState('mp3');
  const [dir, setDir] = useState<string | null>(lastOutputDir);

  // Seed the folder with Downloads the first time, so the tool is one click away.
  useEffect(() => {
    if (dir) return;
    let stale = false;
    void appPaths()
      .then((paths) => {
        if (!stale) setDir(paths.downloads);
      })
      .catch(() => {
        // Leave the folder empty; the run button explains what to do.
      });
    return () => {
      stale = true;
    };
  }, [dir]);

  const parsed = useMemo(() => parseDurationInput(duration), [duration]);
  const seconds = parsed.ok ? parsed.seconds : null;
  const size = seconds !== null ? estimateBytes(seconds, format) : null;

  const pickFolder = async () => {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === 'string') {
      setDir(picked);
      setLastOutputDir(picked);
    }
  };

  const execute = () => {
    if (seconds === null || !dir) return;
    void run.execute({
      command: 'generate_silence',
      total: 1,
      label: `Generate ${formatDuration(seconds)} of silence`,
      args: { seconds, format, outputDir: dir },
    });
  };

  return (
    <ToolShell
      main={
        <>
          <Section
            title="Silent file"
            description="Stereo, 44.1 kHz, digitally silent — for spacing a podcast, padding a timeline or testing a player"
          >
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Length" value={seconds !== null ? formatDuration(seconds) : '—'} />
              <Stat label="Format" value={format.toUpperCase()} />
              <Stat
                label="File name"
                value={seconds !== null ? silenceFilename(seconds, format) : '—'}
                hint="Never overwrites"
              />
              <Stat
                label="Size"
                value={size !== null ? `≈ ${formatBytes(size)}` : seconds !== null ? 'Very small' : '—'}
                hint={
                  size === null && seconds !== null
                    ? `${format.toUpperCase()} packs silence to almost nothing`
                    : undefined
                }
              />
            </div>
          </Section>

          <Alert tone="info" title="Nothing is ever replaced">
            If a file with that name already exists, the new one is saved alongside it as
            <span className="font-mono"> silence-30s_1.mp3</span>.
          </Alert>

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Silence created" />}
        </>
      }
      aside={
        <>
          <Section title="Length">
            <div className="space-y-3">
              <PresetRow presets={PRESETS} active={duration} onSelect={setDuration} />
              <Field
                label="Custom length"
                hint="Seconds (90), mm:ss (1:30) or hh:mm:ss (0:01:30)"
                error={!parsed.ok && duration.trim() !== '' ? parsed.error : undefined}
              >
                <Input
                  value={duration}
                  placeholder="1:30"
                  spellCheck={false}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </Field>
            </div>
          </Section>

          <Section title="Format">
            <Field label="File format">
              <Select value={format} onChange={(e) => setFormat(e.target.value)} options={FORMATS} />
            </Field>
          </Section>

          <Section title="Where to save">
            <div className="flex items-center gap-2">
              <div className="flex h-8.5 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-canvas px-2.5">
                <Icon name="Folder" size={13} className="shrink-0 text-ink-faint" />
                <span className="truncate text-[12.5px] text-ink-soft" title={dir ?? ''}>
                  {dir ? shortenPath(dir, 3) : 'No folder chosen'}
                </span>
              </div>
              <Button size="sm" onClick={() => void pickFolder()}>
                Browse
              </Button>
            </div>
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label="Generate silence"
            icon="Volume"
            disabled={seconds === null || !dir}
            disabledReason={
              seconds === null ? 'Enter a length such as 30 or 1:30.' : 'Choose a folder to save into first.'
            }
          />
        </>
      }
    />
  );
}
