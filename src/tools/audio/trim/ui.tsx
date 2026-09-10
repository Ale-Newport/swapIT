import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { call } from '@/core/bridge';
import { formatBytes, formatDuration, formatTimecode, parseTimecode } from '@/core/format';
import { readBytes } from '@/core/save';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  ErrorDisplay,
  FileDropZone,
  OutputSettings,
  ResultPanel,
  ToolActions,
  ToolShell,
  assetUrl,
  useOutputSpec,
} from '@/components/tool';
import { Alert, Badge, Button, Field, Icon, Input, Section, Spinner, Switch } from '@/components/ui';
import {
  MAX_WAVEFORM_BYTES,
  WAVEFORM_BUCKETS,
  buildTrimOps,
  clampEnd,
  clampStart,
  computePeaks,
  isWholeFile,
} from './logic';

const EXTENSIONS = [
  'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
  'aiff', 'aif', 'wma', 'caf', 'ac3', 'mka', 'au',
];

type WaveformState = 'idle' | 'loading' | 'ready' | 'too-large' | 'failed';

interface ProbedDuration {
  path: string;
  duration?: number | null;
}

/** Backing-store size of the waveform canvas; CSS stretches it to the panel. */
const CANVAS_WIDTH = 1800;
const CANVAS_HEIGHT = 220;

export default function TrimAudio() {
  const files = useToolFiles({ kinds: ['audio'], filterName: 'Audio', multiple: false, extensions: EXTENSIONS });
  const run = useToolRun('audio/trim', 'Trim Audio');
  const { spec, update } = useOutputSpec({ suffix: '-trim' });

  const file = files.files[0] ?? null;
  const path = file?.path ?? '';
  const size = file?.size ?? 0;

  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [startDraft, setStartDraft] = useState<string | null>(null);
  const [endDraft, setEndDraft] = useState<string | null>(null);
  const [reEncode, setReEncode] = useState(false);

  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [waveform, setWaveform] = useState<WaveformState>('idle');
  const [themeTick, setThemeTick] = useState(0);

  const [playhead, setPlayhead] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopAtRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<'start' | 'end' | null>(null);

  /** Adopt a length from whichever source reports one first. */
  const applyDuration = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    setDuration((current) => (current > 0 ? current : seconds));
    setEnd((current) => (current > 0 ? current : seconds));
  }, []);

  // A new file resets the range, then FFprobe supplies the authoritative length.
  useEffect(() => {
    setDuration(0);
    setStart(0);
    setEnd(0);
    setStartDraft(null);
    setEndDraft(null);
    setPlayhead(0);
    stopAtRef.current = null;
    if (!path) return;
    let stale = false;
    void call<ProbedDuration[]>('probe_media', { inputs: [path] })
      .then((infos) => {
        if (!stale) applyDuration(infos[0]?.duration ?? 0);
      })
      .catch(() => {
        // The <audio> element's own metadata is the fallback.
      });
    return () => {
      stale = true;
    };
  }, [path, applyDuration]);

  // Decode the file in the webview to draw its shape. Large files are skipped:
  // decoding one means holding the whole uncompressed stream in memory.
  useEffect(() => {
    setPeaks(null);
    if (!path) {
      setWaveform('idle');
      return;
    }
    if (size > MAX_WAVEFORM_BYTES) {
      setWaveform('too-large');
      return;
    }
    let stale = false;
    setWaveform('loading');
    void (async () => {
      let context: AudioContext | null = null;
      try {
        const bytes = await readBytes(path);
        if (stale) return;
        // decodeAudioData detaches the buffer it is handed, so give it a copy.
        const owned = bytes.slice().buffer as ArrayBuffer;
        context = new AudioContext();
        const decoded = await context.decodeAudioData(owned);
        if (stale) return;
        setPeaks(computePeaks(decoded.getChannelData(0), WAVEFORM_BUCKETS));
        setWaveform('ready');
        applyDuration(decoded.duration);
      } catch {
        if (!stale) setWaveform('failed');
      } finally {
        void context?.close().catch(() => undefined);
      }
    })();
    return () => {
      stale = true;
    };
  }, [path, size, applyDuration]);

  // The canvas is painted with the theme's own tokens, so it has to be redrawn
  // when the theme flips.
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeTick((n) => n + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!peaks || peaks.length === 0) return;
    const styles = getComputedStyle(document.documentElement);
    context.fillStyle = styles.getPropertyValue('--color-ink-soft').trim() || '#52525b';
    const barWidth = canvas.width / peaks.length;
    const middle = canvas.height / 2;
    const scale = canvas.height * 0.46;
    for (let i = 0; i < peaks.length; i += 1) {
      const amplitude = Math.max(1, peaks[i] * scale);
      context.fillRect(i * barWidth, middle - amplitude, Math.max(1, barWidth * 0.68), amplitude * 2);
    }
  }, [peaks, themeTick]);

  const percent = (seconds: number) =>
    duration > 0 ? Math.min(100, Math.max(0, (seconds / duration) * 100)) : 0;

  const timeAt = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || duration <= 0) return 0;
      return ((clientX - rect.left) / rect.width) * duration;
    },
    [duration],
  );

  const moveHandle = (kind: 'start' | 'end', seconds: number) => {
    if (kind === 'start') {
      setStart(clampStart(seconds, end, duration));
      setStartDraft(null);
    } else {
      setEnd(clampEnd(seconds, start, duration));
      setEndDraft(null);
    }
  };

  const onHandleDown = (kind: 'start' | 'end') => (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = kind;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onHandleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    moveHandle(dragRef.current, timeAt(event.clientX));
  };

  const onHandleUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const onHandleKey = (kind: 'start' | 'end') => (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 1 : 0.1;
    const current = kind === 'start' ? start : end;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveHandle(kind, current - step);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveHandle(kind, current + step);
    } else if (event.key === 'Home') {
      event.preventDefault();
      moveHandle(kind, 0);
    } else if (event.key === 'End') {
      event.preventDefault();
      moveHandle(kind, duration);
    }
  };

  const seekTo = (seconds: number) => {
    const audio = audioRef.current;
    const target = Math.min(Math.max(0, seconds), duration || seconds);
    setPlayhead(target);
    stopAtRef.current = null;
    if (audio) audio.currentTime = target;
  };

  const playSelection = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = start;
    setPlayhead(start);
    stopAtRef.current = end;
    void audio.play().catch(() => undefined);
  };

  const commitDraft = (kind: 'start' | 'end') => {
    const draft = kind === 'start' ? startDraft : endDraft;
    if (draft === null) return;
    const parsed = parseTimecode(draft);
    if (parsed === null) {
      if (kind === 'start') setStartDraft(null);
      else setEndDraft(null);
      return;
    }
    moveHandle(kind, parsed);
  };

  const clipLength = Math.max(0, end - start);
  const untouched = isWholeFile(start, end, duration);

  const execute = () =>
    void run.execute({
      command: 'process_video',
      total: 1,
      inputs: [path],
      label: `Trim ${formatDuration(clipLength)} from ${file?.name ?? 'audio'}`,
      args: {
        inputs: [path],
        ops: buildTrimOps(start, end, reEncode),
        output: spec,
      },
    });

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop one audio file here"
            hint="MP3, WAV, M4A, FLAC, OGG, AIFF — the waveform is drawn from the file itself"
            compact={Boolean(file)}
          />

          {file && (
            <Section
              title="Waveform"
              description={
                duration > 0
                  ? `${formatDuration(duration)} · ${formatBytes(file.size)}`
                  : 'Reading the length…'
              }
              actions={
                <Badge tone={untouched ? 'neutral' : 'accent'}>
                  {untouched ? 'Whole file' : `Keeping ${formatDuration(clipLength)}`}
                </Badge>
              }
            >
              <div
                ref={trackRef}
                className="relative h-[132px] w-full select-none overflow-hidden rounded-lg border border-line bg-canvas"
                onPointerDown={(event) => {
                  if (dragRef.current) return;
                  seekTo(timeAt(event.clientX));
                }}
              >
                <canvas
                  ref={canvasRef}
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  className="absolute inset-0 h-full w-full"
                />

                {waveform !== 'ready' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center">
                    {waveform === 'loading' && (
                      <>
                        <Spinner />
                        <p className="text-[11.5px] text-ink-faint">Decoding the audio…</p>
                      </>
                    )}
                    {waveform === 'too-large' && (
                      <>
                        <Icon name="AudioLines" size={18} className="text-ink-faint" />
                        <p className="text-[11.5px] text-ink-faint">
                          No waveform for files over {formatBytes(MAX_WAVEFORM_BYTES)} — decoding one would have to hold
                          the whole uncompressed track in memory. Use the timecodes and the player below.
                        </p>
                      </>
                    )}
                    {waveform === 'failed' && (
                      <>
                        <Icon name="AudioLines" size={18} className="text-ink-faint" />
                        <p className="text-[11.5px] text-ink-faint">
                          This format cannot be decoded for a preview here. Trimming still works — set the times below.
                        </p>
                      </>
                    )}
                  </div>
                )}

                {duration > 0 && (
                  <>
                    <div
                      className="pointer-events-none absolute inset-y-0 left-0 bg-canvas/70"
                      style={{ width: `${percent(start)}%` }}
                    />
                    <div
                      className="pointer-events-none absolute inset-y-0 right-0 bg-canvas/70"
                      style={{ width: `${100 - percent(end)}%` }}
                    />
                    <div
                      className="pointer-events-none absolute inset-y-0 border-x border-accent bg-accent/8"
                      style={{ left: `${percent(start)}%`, width: `${Math.max(0, percent(end) - percent(start))}%` }}
                    />
                    <div
                      className="pointer-events-none absolute inset-y-0 w-px bg-ink"
                      style={{ left: `${percent(playhead)}%` }}
                    />

                    {(['start', 'end'] as const).map((kind) => {
                      const value = kind === 'start' ? start : end;
                      return (
                        <div
                          key={kind}
                          role="slider"
                          tabIndex={0}
                          aria-label={kind === 'start' ? 'Clip start' : 'Clip end'}
                          aria-valuemin={0}
                          aria-valuemax={Math.round(duration)}
                          aria-valuenow={Math.round(value)}
                          aria-valuetext={formatTimecode(value, true)}
                          onPointerDown={onHandleDown(kind)}
                          onPointerMove={onHandleMove}
                          onPointerUp={onHandleUp}
                          onPointerCancel={onHandleUp}
                          onKeyDown={onHandleKey(kind)}
                          className="absolute inset-y-0 -ml-[7px] w-[14px] cursor-ew-resize touch-none focus:outline-none"
                          style={{ left: `${percent(value)}%` }}
                        >
                          <span className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-accent" />
                          <span className="absolute left-1/2 top-1/2 h-5 w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-[3px] border border-accent bg-panel" />
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              <div className="mt-2 flex items-center justify-between text-[11.5px] text-ink-faint">
                <span className="tabular-nums">{formatTimecode(0)}</span>
                <span className="tabular-nums">{duration > 0 ? formatTimecode(duration) : '—'}</span>
              </div>

              <audio
                ref={audioRef}
                src={path ? assetUrl(path) : undefined}
                preload="metadata"
                controls
                className="mt-3 w-full"
                onLoadedMetadata={(event) => applyDuration(event.currentTarget.duration)}
                onTimeUpdate={(event) => {
                  const audio = event.currentTarget;
                  setPlayhead(audio.currentTime);
                  if (stopAtRef.current !== null && audio.currentTime >= stopAtRef.current) {
                    audio.pause();
                    stopAtRef.current = null;
                  }
                }}
                onPause={() => {
                  stopAtRef.current = null;
                }}
              />

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" icon="Play" onClick={playSelection} disabled={duration <= 0}>
                  Play selection
                </Button>
                <Button size="sm" variant="ghost" onClick={() => moveHandle('start', playhead)} disabled={duration <= 0}>
                  Start at playhead
                </Button>
                <Button size="sm" variant="ghost" onClick={() => moveHandle('end', playhead)} disabled={duration <= 0}>
                  End at playhead
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon="RotateCcw"
                  onClick={() => {
                    setStart(0);
                    setEnd(duration);
                    setStartDraft(null);
                    setEndDraft(null);
                  }}
                  disabled={duration <= 0 || untouched}
                >
                  Reset
                </Button>
              </div>
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section title="Clip">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start" hint="mm:ss or h:mm:ss">
                  <Input
                    value={startDraft ?? formatTimecode(start, true)}
                    onChange={(event) => setStartDraft(event.target.value)}
                    onBlur={() => commitDraft('start')}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitDraft('start');
                    }}
                    className="font-mono tabular-nums"
                    disabled={duration <= 0}
                  />
                </Field>
                <Field label="End" hint="mm:ss or h:mm:ss">
                  <Input
                    value={endDraft ?? formatTimecode(end, true)}
                    onChange={(event) => setEndDraft(event.target.value)}
                    onBlur={() => commitDraft('end')}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitDraft('end');
                    }}
                    className="font-mono tabular-nums"
                    disabled={duration <= 0}
                  />
                </Field>
              </div>
              <p className="text-[12px] text-ink-soft">
                Keeping <span className="font-medium text-ink">{formatDuration(clipLength)}</span>
                {duration > 0 && <span className="text-ink-faint"> of {formatDuration(duration)}</span>}
              </p>
            </div>
          </Section>

          <Section title="How to cut">
            <div className="space-y-3">
              <Field
                inline
                label="Re-encode"
                hint={reEncode ? 'Exact cut, slower, one more encoding pass' : 'Copies the audio untouched'}
              >
                <Switch checked={reEncode} onCheckedChange={setReEncode} />
              </Field>
              <Alert tone="info">
                {reEncode
                  ? 'The clip is encoded again so it starts exactly at the time you chose. The file keeps its format, and the encoder uses its default quality.'
                  : 'The audio packets are copied out as they are — instant, and with no quality loss. The cut lands on the nearest packet, which is within a few hundredths of a second.'}
              </Alert>
              <p className="text-[11.5px] text-ink-faint">
                The clip keeps the source format. To change it afterwards, use the Audio Converter.
              </p>
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
            disabled={files.isEmpty || duration <= 0 || untouched}
            disabledReason={
              files.isEmpty
                ? 'Add an audio file first.'
                : duration <= 0
                  ? 'Waiting for the length of the file.'
                  : 'Move a handle to choose the part you want to keep.'
            }
          />
        </>
      }
    />
  );
}
