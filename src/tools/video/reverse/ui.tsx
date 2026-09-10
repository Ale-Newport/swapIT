import { useEffect, useState } from 'react';
import { call } from '@/core/bridge';
import { formatBytes, formatDuration } from '@/core/format';
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
import { Alert, Field, Section, Segmented, Select, Spinner, Stat } from '@/components/ui';
import { estimateFrameBuffer, reverseRisk, riskAdvice, riskHeadline } from './logic';

interface ProbedStream {
  kind: string;
  codec: string;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  channels?: number | null;
}

interface ProbedMedia {
  path: string;
  duration?: number | null;
  video?: ProbedStream | null;
  audio?: ProbedStream | null;
}

const FORMATS = [
  { value: '', label: 'Same as the input' },
  { value: 'mp4', label: 'MP4 (H.264)' },
  { value: 'mov', label: 'MOV (QuickTime)' },
  { value: 'mkv', label: 'MKV (Matroska)' },
  { value: 'webm', label: 'WebM (VP9)' },
];

const QUALITY = [
  { value: '18', label: 'High — larger file' },
  { value: '23', label: 'Balanced' },
  { value: '28', label: 'Small — softer detail' },
];

const RISK_TONE = { quick: 'info', slow: 'warn', heavy: 'danger', unknown: 'warn' } as const;

export default function ReverseVideo() {
  const files = useToolFiles({ kinds: ['video'], filterName: 'Videos', multiple: false });
  const run = useToolRun('video/reverse', 'Reverse Video');
  const { spec, update } = useOutputSpec();

  const [audioMode, setAudioMode] = useState<'reverse' | 'drop'>('reverse');
  const [format, setFormat] = useState('');
  const [crf, setCrf] = useState('23');

  const [info, setInfo] = useState<ProbedMedia | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeFailed, setProbeFailed] = useState(false);

  const path = files.paths[0] ?? null;
  useEffect(() => {
    if (!path) {
      setInfo(null);
      setProbeFailed(false);
      return;
    }
    let cancelled = false;
    setProbing(true);
    setProbeFailed(false);
    void call<ProbedMedia[]>('probe_media', { inputs: [path] })
      .then(([first]) => {
        if (cancelled) return;
        setInfo(first ?? null);
        setProbeFailed(!first);
      })
      .catch(() => {
        if (cancelled) return;
        setInfo(null);
        setProbeFailed(true);
      })
      .finally(() => {
        if (!cancelled) setProbing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const duration = info?.duration ?? null;
  const risk = probeFailed ? 'unknown' : reverseRisk(duration);
  const buffer = estimateFrameBuffer(info?.video?.width, info?.video?.height, info?.video?.fps, duration);
  const hasAudio = Boolean(info?.audio);

  const execute = () =>
    void run.execute({
      command: 'process_video',
      total: 1,
      inputs: files.paths,
      label: `Reverse ${files.files[0]?.name ?? 'video'}`,
      args: {
        inputs: files.paths,
        ops: {
          format: format || undefined,
          reverse: true,
          removeAudio: audioMode === 'drop',
          crf: Number(crf),
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
            label="Drop one video here"
            hint="Reversing works on a single clip at a time — the whole thing has to be held in memory"
          />

          {path && (
            <Section
              title="The clip"
              description={probing ? 'Reading the video…' : riskHeadline(risk, duration)}
              actions={probing ? <Spinner /> : undefined}
            >
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Length" value={formatDuration(duration)} />
                <Stat
                  label="Resolution"
                  value={
                    info?.video?.width && info?.video?.height
                      ? `${info.video.width} × ${info.video.height}`
                      : '—'
                  }
                  hint={info?.video?.codec || undefined}
                />
                <Stat
                  label="Frame rate"
                  value={info?.video?.fps ? `${Math.round(info.video.fps * 100) / 100} fps` : '—'}
                />
                <Stat
                  label="Memory needed"
                  value={buffer === null ? '—' : `≈ ${formatBytes(buffer)}`}
                  hint="Estimate, decoded frames"
                />
              </div>
              <Alert tone={RISK_TONE[risk]} title={riskHeadline(risk, duration)} className="mt-3">
                {riskAdvice(risk)}
              </Alert>
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} />}
        </>
      }
      aside={
        <>
          <Section title="Audio">
            {path && !probing && !hasAudio ? (
              <p className="text-[12.5px] text-ink-faint">
                This clip has no audio track, so there is nothing to reverse or drop.
              </p>
            ) : (
              <div className="space-y-3">
                <Segmented
                  value={audioMode}
                  onChange={setAudioMode}
                  options={[
                    { value: 'reverse', label: 'Reverse it', icon: 'AudioLines' },
                    { value: 'drop', label: 'Remove it', icon: 'VolumeX' },
                  ]}
                  className="w-full"
                />
                <p className="text-[11.5px] text-ink-faint">
                  {audioMode === 'reverse'
                    ? 'The sound plays backwards with the picture. This buffers the audio in memory too.'
                    : 'The result is silent, which makes the encode noticeably lighter.'}
                </p>
              </div>
            )}
          </Section>

          <Section title="Encoding">
            <div className="space-y-3">
              <Field label="Container">
                <Select value={format} onChange={(e) => setFormat(e.target.value)} options={FORMATS} />
              </Field>
              <Field label="Quality" hint="Reversing always re-encodes. Applies to H.264, H.265 and VP9 output.">
                <Select value={crf} onChange={(e) => setCrf(e.target.value)} options={QUALITY} />
              </Field>
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label="Reverse video"
            icon="Rewind"
            disabled={files.isEmpty}
            disabledReason="Add a video first."
          />
        </>
      }
    />
  );
}
