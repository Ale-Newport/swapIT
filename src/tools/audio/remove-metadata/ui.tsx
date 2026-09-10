import { useEffect, useMemo, useState } from 'react';
import { call } from '@/core/bridge';
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
  useOutputSpec,
} from '@/components/tool';
import { Alert, Badge, EmptyState, Section, Spinner } from '@/components/ui';
import {
  VORBIS_BYTE_BUDGET,
  VORBIS_SCAN_LIMIT,
  hasCoverArt,
  hasPictureTag,
  isVorbisContainer,
  parseVorbisComments,
  summarizeTags,
} from './logic';
import type { TaggedFile } from './logic';

/** The slice of `probe_media`'s MediaInfo this tool needs. */
interface ProbedFile extends TaggedFile {
  name: string;
  streams: Array<{ kind: string; codec: string }>;
}

/** Module-level so the identity stays stable across renders. */
const AUDIO_EXTENSIONS = [
  'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
  'aiff', 'aif', 'wma', 'caf', 'amr', 'ac3', 'mka', 'au',
];

export default function RemoveAudioMetadata() {
  const files = useToolFiles({ kinds: ['audio'], extensions: AUDIO_EXTENSIONS, filterName: 'Audio' });
  const run = useToolRun('audio/remove-metadata', 'Remove Audio Metadata');
  const { spec, update } = useOutputSpec();
  const [probed, setProbed] = useState<ProbedFile[]>([]);
  const [probing, setProbing] = useState(false);
  /** Files whose tags could not be read, so the preview cannot speak for them. */
  const [unread, setUnread] = useState(0);

  const pathKey = files.paths.join('\n');
  useEffect(() => {
    const inputs = pathKey ? pathKey.split('\n') : [];
    if (inputs.length === 0) {
      setProbed([]);
      setUnread(0);
      return;
    }
    let stale = false;
    setProbing(true);

    const scan = async (): Promise<{ files: ProbedFile[]; unread: number }> => {
      let infos: ProbedFile[];
      try {
        infos = await call<ProbedFile[]>('probe_media', { inputs });
      } catch {
        // Without FFprobe there is no preview, but stripping still works.
        return { files: [], unread: inputs.length };
      }
      // FFprobe puts Vorbis comments on the stream and `probe_media` only carries
      // format tags across, so OGG and Opus files arrive here with an empty list
      // however much they hold. Read their comment block instead of reporting
      // them as untagged — the one claim this tool must never get wrong.
      const vorbis = infos.filter((info) => isVorbisContainer(info.path));
      if (vorbis.length === 0) return { files: infos, unread: 0 };
      if (infos.length > VORBIS_SCAN_LIMIT) return { files: infos, unread: vorbis.length };

      const extra = new Map<string, Array<[string, string]>>();
      let budget = VORBIS_BYTE_BUDGET;
      let missed = 0;
      for (const info of vorbis) {
        if (stale) break;
        if (budget <= 0) {
          missed += 1;
          continue;
        }
        try {
          const bytes = await readBytes(info.path);
          budget -= bytes.length;
          extra.set(info.path, parseVorbisComments(bytes));
        } catch {
          missed += 1;
        }
      }
      return {
        // Duplicate keys are collapsed per file by `summarizeTags`, so appending
        // is enough — whatever FFprobe did report still wins on value.
        files: infos.map((info) => {
          const found = extra.get(info.path);
          return found?.length ? { ...info, tags: [...info.tags, ...found] } : info;
        }),
        unread: missed,
      };
    };

    void scan()
      .then((outcome) => {
        if (stale) return;
        setProbed(outcome.files);
        setUnread(outcome.unread);
      })
      .finally(() => {
        if (!stale) setProbing(false);
      });
    return () => {
      stale = true;
    };
  }, [pathKey]);

  const rows = useMemo(() => summarizeTags(probed), [probed]);
  const withArt = useMemo(
    () => probed.filter((p) => hasCoverArt(p.streams) || hasPictureTag(p.tags)).length,
    [probed],
  );
  const identifying = rows.filter((r) => r.kind === 'identifying').length;
  const single = files.files.length === 1;
  const unreadNote = unread > 0 ? `${unread} file${unread === 1 ? '' : 's'} could not be read` : '';

  const execute = () =>
    void run.execute({
      command: 'write_audio_tags',
      total: files.files.length,
      inputs: files.paths,
      label: `Strip metadata from ${files.files.length} file${files.files.length === 1 ? '' : 's'}`,
      args: {
        inputs: files.paths,
        tags: { removeAll: true },
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
            hint="MP3, M4A, WAV, FLAC, OGG, AIFF, Opus — batches welcome"
            allowFolders
          />

          {files.files.length > 0 && (
            <Section
              title="What will be removed"
              description={
                probing
                  ? 'Reading tags…'
                  : rows.length > 0
                    ? `${rows.length} tag${rows.length === 1 ? '' : 's'} across ${probed.length} file${probed.length === 1 ? '' : 's'}${identifying > 0 ? ` · ${identifying} identifying` : ''}${unreadNote ? ` · ${unreadNote}` : ''}`
                    : unread > 0
                      ? unreadNote
                      : 'Nothing found to remove'
              }
              actions={probing ? <Spinner /> : undefined}
            >
              {rows.length === 0 && !probing ? (
                unread > 0 ? (
                  <EmptyState
                    icon="FileQuestion"
                    title={`${unread === 1 ? 'This file' : `${unread} of these files`} could not be read`}
                    description="Toolbox cannot say what is in there, so it will not claim the files are clean. Stripping still works: the container is rewritten with no metadata at all."
                  />
                ) : (
                  <EmptyState
                    icon="ShieldCheck"
                    title="These files carry no tags"
                    description="Running the tool anyway still rewrites the container, which clears anything FFprobe does not surface."
                  />
                )
              ) : (
                <dl className="divide-y divide-line">
                  {rows.map((row) => (
                    <div key={row.key} className="flex items-center gap-3 py-1.5">
                      <dt className="w-40 shrink-0 truncate text-[12.5px] text-ink" title={row.key}>
                        {row.key}
                      </dt>
                      <dd className="selectable min-w-0 flex-1 truncate text-[12.5px] text-ink-faint">
                        {single || row.sharedValue ? (row.sharedValue ?? '—') : 'varies by file'}
                      </dd>
                      {row.kind === 'identifying' ? (
                        <Badge tone="warn">Identifying</Badge>
                      ) : (
                        <Badge>Technical</Badge>
                      )}
                      {!single && <span className="shrink-0 text-[11.5px] text-ink-faint">{row.count} files</span>}
                    </div>
                  ))}
                </dl>
              )}
              {!probing && rows.length > 0 && unread > 0 && (
                <p className="mt-3 text-[11.5px] text-ink-faint">
                  This list covers the files Toolbox could read. Whatever the other {unread} carry is removed all the
                  same.
                </p>
              )}
            </Section>
          )}

          {withArt > 0 && (
            <Alert tone="warn" title={`${withArt} file${withArt === 1 ? '' : 's'} also carry embedded cover art`}>
              The artwork is removed along with the tags. Save it first with Extract Cover Art if you want to keep it.
            </Alert>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Metadata removed" />}
        </>
      }
      aside={
        <>
          <Section title="What happens">
            <ul className="space-y-2 text-[12.5px] text-ink-soft">
              <li>Every tag is dropped — title, artist, album, comments, purchase records and encoder notes.</li>
              <li>Embedded cover art is dropped with them.</li>
              <li>
                The audio stream is copied bit for bit, so the sound is untouched and stripping takes about a second per
                file.
              </li>
              <li>Your originals are never modified — a clean copy is written instead.</li>
            </ul>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
            <p className="mt-3 text-[11.5px] text-ink-faint">
              With no suffix and no folder of your own, the clean copy is written next to the original as
              <span className="font-mono"> name-tagged.ext</span>.
            </p>
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label={files.files.length > 1 ? `Strip ${files.files.length} files` : 'Strip metadata'}
            icon="ShieldOff"
            disabled={files.isEmpty}
            disabledReason="Add at least one audio file first."
          />
        </>
      }
    />
  );
}
