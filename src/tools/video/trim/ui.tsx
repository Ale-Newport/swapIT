import { useEffect, useMemo, useState } from 'react';
import { formatBytes, formatDuration, formatTimecode } from '@/core/format';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  ErrorDisplay,
  FileDropZone,
  OptionsGrid,
  OutputSettings,
  ResultPanel,
  ToolActions,
  ToolShell,
  assetUrl,
  useOutputSpec,
} from '@/components/tool';
import { Alert, Button, Field, Icon, Input, Section, Select, Slider, Spinner, Stat, Switch } from '@/components/ui';
import { Timeline } from './Timeline';
import { buildOps, clamp, clipLength, moveHandle, parseTimeField, type Range } from './logic';
import { dimensions, fpsLabel, useProbe, usePreviewFrame } from './probe';

const EXTENSIONS = ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', '3gp', 'mts', 'm2ts'];

export default function TrimVideo() {
  const files = useToolFiles({ kinds: ['video'], filterName: 'Videos', extensions: EXTENSIONS, multiple: false });
  const run = useToolRun('video/trim', 'Trim Video');
  const { spec, update } = useOutputSpec({ suffix: '-clip' });

  const path = files.paths[0] ?? null;
  const { info, loading: probing, error: probeError } = useProbe(path);
  const duration = info?.duration ?? 0;

  const [range, setRange] = useState<Range>({ start: 0, end: 0 });
  const [scrub, setScrub] = useState(0);
  const [startText, setStartText] = useState('00:00:00');
  const [endText, setEndText] = useState('00:00:00');
  const [copyStreams, setCopyStreams] = useState(true);
  const [crf, setCrf] = useState(20);
  const [preset, setPreset] = useState('medium');

  // A new file resets the selection to the whole clip.
  useEffect(() => {
    if (!duration) {
      setRange({ start: 0, end: 0 });
      setScrub(0);
      setStartText('00:00:00');
      setEndText('00:00:00');
      return;
    }
    setRange({ start: 0, end: duration });
    setScrub(0);
    setStartText(formatTimecode(0));
    setEndText(formatTimecode(duration));
  }, [duration, path]);

  const setRangeAndText = (next: Range) => {
    setRange(next);
    setStartText(formatTimecode(next.start, next.start % 1 !== 0));
    setEndText(formatTimecode(next.end, next.end % 1 !== 0));
  };

  const commitField = (which: 'start' | 'end', text: string) => {
    const seconds = parseTimeField(text, duration);
    if (seconds === null) {
      // Bad input simply snaps back to the value that is actually in effect.
      setStartText(formatTimecode(range.start, range.start % 1 !== 0));
      setEndText(formatTimecode(range.end, range.end % 1 !== 0));
      return;
    }
    const next = moveHandle(range, which, seconds, duration);
    setRangeAndText(next);
    setScrub(which === 'start' ? next.start : next.end);
  };

  const { framePath, loading: framing, error: frameError } = usePreviewFrame(path, scrub, 720);
  const length = clipLength(range);
  const trimsSomething = duration > 0 && (range.start > 0.01 || range.end < duration - 0.01);

  const settings = useMemo(() => ({ copyStreams, crf, preset }), [copyStreams, crf, preset]);

  const execute = () =>
    void run.execute({
      command: 'process_video',
      total: 1,
      inputs: files.paths,
      label: `Trim to ${formatDuration(length)}`,
      args: { inputs: files.paths, ops: buildOps(range, duration, settings), output: spec },
    });

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop a video here"
            hint="One video at a time — the clip is cut from the original, which stays untouched"
            compact={Boolean(path)}
          />

          {probeError && <Alert tone="danger" title="This video could not be read.">{probeError}</Alert>}

          {path && duration > 0 && (
            <Section
              title="Clip"
              description={`${formatTimecode(range.start)} → ${formatTimecode(range.end)} · ${formatDuration(length)} of ${formatDuration(duration)}`}
              actions={
                <Button size="sm" variant="ghost" icon="RotateCcw" onClick={() => setRangeAndText({ start: 0, end: duration })}>
                  Whole video
                </Button>
              }
            >
              <div className="space-y-3">
                <div className="relative flex h-72 items-center justify-center overflow-hidden rounded-lg border border-line bg-canvas">
                  {framePath ? (
                    <img src={assetUrl(framePath)} alt={`Frame at ${formatTimecode(scrub)}`} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-ink-faint">
                      <Icon name="Video" size={20} />
                      <p className="text-[11.5px]">{frameError ?? 'Rendering the first frame…'}</p>
                    </div>
                  )}
                  <span className="absolute bottom-2 left-2 rounded-md bg-black/55 px-1.5 py-0.5 font-mono text-[11px] text-white">
                    {formatTimecode(scrub, true)}
                  </span>
                  {framing && <Spinner className="absolute right-2 top-2 text-white" />}
                </div>

                <Timeline
                  duration={duration}
                  range={range}
                  scrub={scrub}
                  onRangeChange={setRangeAndText}
                  onScrubChange={(t) => setScrub(clamp(t, 0, duration))}
                />

                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => { const next = moveHandle(range, 'start', scrub, duration); setRangeAndText(next); }}>
                    Start here
                  </Button>
                  <Button size="sm" onClick={() => { const next = moveHandle(range, 'end', scrub, duration); setRangeAndText(next); }}>
                    End here
                  </Button>
                  <span className="text-[11.5px] text-ink-faint">Uses the playhead at {formatTimecode(scrub, true)}</span>
                </div>
              </div>
            </Section>
          )}

          {path && info && (
            <Section title="Source">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Duration" value={formatDuration(info.duration)} />
                <Stat label="Video" value={info.video?.codec?.toUpperCase() || 'None'} hint={dimensions(info) ?? undefined} />
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
          {run.result && <ResultPanel result={run.result} title="Trimmed" onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section title="Start and end">
            <div className="space-y-3">
              <OptionsGrid>
                <Field label="Start" hint="mm:ss or hh:mm:ss">
                  <Input
                    value={startText}
                    onChange={(e) => setStartText(e.target.value)}
                    onBlur={(e) => commitField('start', e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitField('start', (e.target as HTMLInputElement).value);
                    }}
                    className="font-mono"
                    spellCheck={false}
                    disabled={!duration}
                  />
                </Field>
                <Field label="End" hint="or plain seconds">
                  <Input
                    value={endText}
                    onChange={(e) => setEndText(e.target.value)}
                    onBlur={(e) => commitField('end', e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitField('end', (e.target as HTMLInputElement).value);
                    }}
                    className="font-mono"
                    spellCheck={false}
                    disabled={!duration}
                  />
                </Field>
              </OptionsGrid>
              <div className="rounded-lg border border-line bg-canvas px-3 py-2">
                <Stat label="Resulting clip" value={formatDuration(length)} hint={duration ? `${formatTimecode(range.start, true)} → ${formatTimecode(range.end, true)}` : undefined} />
              </div>
            </div>
          </Section>

          <Section title="How to cut">
            <div className="space-y-3">
              <Field inline label="Copy streams" hint="Fast, no re-encode">
                <Switch checked={copyStreams} onCheckedChange={setCopyStreams} />
              </Field>
              {copyStreams ? (
                <Alert tone="info">
                  Nothing is re-encoded, so the cut is instant and the picture is bit-for-bit identical. The start snaps
                  back to the nearest keyframe, which can be a second or two early.
                </Alert>
              ) : (
                <>
                  <Alert tone="info">Re-encoding cuts on the exact frame you chose, but takes as long as the clip deserves.</Alert>
                  <Field label={`Quality — CRF ${crf}`} hint="Lower keeps more detail and makes bigger files.">
                    <Slider min={16} max={32} value={crf} onChange={setCrf} />
                  </Field>
                  <Field label="Encoder speed">
                    <Select
                      value={preset}
                      onChange={(e) => setPreset(e.target.value)}
                      options={['veryfast', 'faster', 'fast', 'medium', 'slow'].map((p) => ({ value: p, label: p }))}
                    />
                  </Field>
                </>
              )}
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label="Trim"
            icon="Scissors"
            disabled={!path || duration <= 0 || length <= 0}
            disabledReason={!path ? 'Add a video first.' : duration <= 0 ? 'Waiting for the video details…' : 'Choose a clip longer than zero.'}
          >
            {!trimsSomething && duration > 0 && (
              <span className="text-[11.5px] text-ink-faint">The whole video will be copied.</span>
            )}
          </ToolActions>
        </>
      }
    />
  );
}
