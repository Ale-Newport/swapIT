import { useEffect, useMemo, useState } from 'react';
import { call } from '@/core/bridge';
import { formatDuration } from '@/core/format';
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
import { Alert, Badge, Field, Input, Section, Spinner, Stat, Switch } from '@/components/ui';
import { analyzeMerge, type MergeFile, type MergeStream } from './logic';

interface StreamInfo {
  codec: string;
  width: number | null;
  height: number | null;
  fps: number | null;
  pixFmt: string | null;
  sampleRate: number | null;
  channels: number | null;
}
interface MediaInfo {
  name: string;
  duration: number | null;
  video: StreamInfo | null;
  audio: StreamInfo | null;
}

function toStream(s: StreamInfo | null): MergeStream | null {
  if (!s) return null;
  return {
    codec: s.codec ?? '',
    width: s.width ?? null,
    height: s.height ?? null,
    fps: s.fps ?? null,
    pixFmt: s.pixFmt ?? null,
    sampleRate: s.sampleRate ?? null,
    channels: s.channels ?? null,
  };
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

export default function MergeVideos() {
  const files = useToolFiles({ kinds: ['video'], filterName: 'Videos' });
  const run = useToolRun('video/merge', 'Merge Videos');
  const { spec, update } = useOutputSpec();
  const [reEncode, setReEncode] = useState(false);
  const [reEncodeTouched, setReEncodeTouched] = useState(false);
  const [filename, setFilename] = useState('');

  // Probing is keyed on the *set* of files, so reordering never re-runs ffprobe.
  const probeKey = useMemo(() => JSON.stringify([...files.paths].sort()), [files.paths]);
  const [infos, setInfos] = useState<Record<string, MediaInfo>>({});
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);

  useEffect(() => {
    const paths = JSON.parse(probeKey) as string[];
    if (paths.length === 0) {
      setInfos({});
      setProbeError(null);
      return;
    }
    let alive = true;
    setProbing(true);
    void call<MediaInfo[]>('probe_media', { inputs: paths })
      .then((list) => {
        if (!alive) return;
        // The backend answers in request order; canonicalised paths may differ
        // from what was sent, so index is the reliable key.
        const map: Record<string, MediaInfo> = {};
        paths.forEach((p, i) => {
          if (list[i]) map[p] = list[i];
        });
        setInfos(map);
        setProbeError(null);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setInfos({});
        setProbeError(errorMessage(err));
      })
      .finally(() => {
        if (alive) setProbing(false);
      });
    return () => {
      alive = false;
    };
  }, [probeKey]);

  const rows = files.files.map((f) => ({ file: f, info: infos[f.path] ?? null }));

  const fileList = files.files;
  const analysis = useMemo(() => {
    const known: MergeFile[] = fileList.flatMap((f) => {
      const info = infos[f.path];
      if (!info) return [];
      return [
        {
          name: f.name,
          duration: info.duration ?? null,
          video: toStream(info.video),
          audio: toStream(info.audio),
        },
      ];
    });
    return analyzeMerge(known);
  }, [fileList, infos]);

  // Pre-select re-encoding when a stream copy cannot work, until the user decides.
  useEffect(() => {
    if (!reEncodeTouched) setReEncode(analysis.needsReEncode);
  }, [analysis.needsReEncode, reEncodeTouched]);

  const enough = files.files.length >= 2;

  const execute = () => {
    if (!enough) return;
    void run.execute({
      command: 'concat_media',
      total: 1,
      inputs: files.paths,
      label: `Join ${files.files.length} videos`,
      args: {
        inputs: files.paths,
        output: { ...spec, filename: filename.trim() ? filename.trim() : spec.filename ?? null },
        reEncode,
      },
    });
  };

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop the videos to join"
            hint="They are joined top to bottom — drag the handles to reorder"
            reorderable
            allowFolders
          />

          {files.files.length > 0 && (
            <Section
              title="What you are joining"
              description={
                probing
                  ? 'Reading the files…'
                  : `${files.files.length} file${files.files.length === 1 ? '' : 's'}${
                      analysis.unknownDurations > 0 ? ` · ${analysis.unknownDurations} of unknown length` : ''
                    }`
              }
              actions={
                analysis.totalDuration > 0 ? (
                  <Badge tone="accent">{formatDuration(analysis.totalDuration)} total</Badge>
                ) : probing ? (
                  <Spinner />
                ) : undefined
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-[12px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-faint">
                      <th className="py-1.5 pr-3 font-medium">#</th>
                      <th className="py-1.5 pr-3 font-medium">File</th>
                      <th className="py-1.5 pr-3 font-medium">Length</th>
                      <th className="py-1.5 pr-3 font-medium">Resolution</th>
                      <th className="py-1.5 pr-3 font-medium">Video</th>
                      <th className="py-1.5 pr-3 font-medium">Audio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={row.file.path} className="border-b border-line/60 last:border-0">
                        <td className="py-1.5 pr-3 text-ink-faint">{index + 1}</td>
                        <td className="max-w-[220px] truncate py-1.5 pr-3 text-ink" title={row.file.path}>
                          {row.file.name}
                        </td>
                        <td className="py-1.5 pr-3 text-ink-soft">
                          {row.info?.duration ? formatDuration(row.info.duration) : '—'}
                        </td>
                        <td className="py-1.5 pr-3 text-ink-soft">
                          {row.info?.video?.width && row.info.video.height
                            ? `${row.info.video.width}×${row.info.video.height}`
                            : '—'}
                        </td>
                        <td className="py-1.5 pr-3 text-ink-soft">
                          {row.info?.video?.codec || '—'}
                          {row.info?.video?.fps
                            ? ` · ${(Math.round(row.info.video.fps * 100) / 100).toString()} fps`
                            : ''}
                        </td>
                        <td className="py-1.5 pr-3 text-ink-soft">{row.info?.audio?.codec || 'none'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {probeError && (
            <Alert tone="warn" title="Toolbox could not read the file details.">
              {probeError} Joining still works, but the files cannot be compared first — turn on
              re-encoding if a fast join fails.
            </Alert>
          )}

          {analysis.mismatches.length > 0 && (
            <Alert tone="warn" title="These files cannot simply be stitched together.">
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {analysis.mismatches.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <p className="mt-1.5">
                Copying the streams would fail, so re-encoding is switched on: everything is decoded and
                written again at the first file&apos;s settings. It is slower and re-compresses the video.
              </p>
            </Alert>
          )}

          {analysis.notes.length > 0 && (
            <Alert tone="info" title="Worth knowing">
              {analysis.notes.join(' · ')}. The joined file keeps the timing of the first clip unless you
              re-encode.
            </Alert>
          )}

          {analysis.audioWarning && reEncode && (
            <Alert tone="warn" title="Audio tracks do not line up.">
              {analysis.audioWarning}
            </Alert>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Joined" />}
        </>
      }
      aside={
        <>
          <Section title="How to join">
            <div className="space-y-3">
              <Field
                inline
                label="Re-encode"
                hint={reEncode ? 'Slower, works with mixed files' : 'Instant, needs matching files'}
              >
                <Switch
                  checked={reEncode}
                  onCheckedChange={(v) => {
                    setReEncodeTouched(true);
                    setReEncode(v);
                  }}
                />
              </Field>
              <p className="text-[11.5px] text-ink-faint">
                With re-encoding off the streams are copied byte for byte, which is near-instant but needs
                every file to share the same codec, resolution and pixel format.
              </p>
              {reEncodeTouched && analysis.needsReEncode && !reEncode && (
                <Alert tone="warn">
                  These files differ, so a copy-only join will almost certainly fail.
                </Alert>
              )}
            </div>
          </Section>

          <Section title="Result">
            <div className="space-y-3">
              <Stat
                label="Total length"
                value={analysis.totalDuration > 0 ? formatDuration(analysis.totalDuration) : '—'}
                hint={
                  analysis.unknownDurations > 0
                    ? `${analysis.unknownDurations} file${analysis.unknownDurations === 1 ? '' : 's'} of unknown length not counted`
                    : undefined
                }
              />
              <Field
                label="File name"
                hint={`Extension follows the first file${files.files[0] ? ` (.${files.files[0].extension})` : ''}.`}
              >
                <Input
                  value={filename}
                  placeholder={files.files[0] ? `${files.files[0].stem}-merged` : 'merged'}
                  spellCheck={false}
                  onChange={(e) => setFilename(e.target.value)}
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
            label={reEncode ? 'Join and re-encode' : 'Join videos'}
            icon="Combine"
            disabled={!enough}
            disabledReason="Add at least two videos."
          />
        </>
      }
    />
  );
}
