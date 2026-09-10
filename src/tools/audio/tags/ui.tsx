import { open } from '@tauri-apps/plugin-dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { call } from '@/core/bridge';
import { basename } from '@/core/format';
import { readBytes } from '@/core/save';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  ErrorDisplay,
  FileDropZone,
  ImagePreview,
  OptionsGrid,
  OutputSettings,
  ResultPanel,
  ToolActions,
  ToolShell,
  useOutputSpec,
} from '@/components/tool';
import { Alert, Badge, Button, Field, Input, Section, Switch } from '@/components/ui';
import {
  EMPTY_TAGS,
  VORBIS_READ_LIMIT,
  filledFields,
  isVorbisContainer,
  parseVorbisComments,
  tagPayload,
  tagsFromProbe,
} from './logic';
import type { TagFields } from './logic';

/** The slice of `probe_media`'s MediaInfo this tool needs. */
interface ProbedTags {
  path: string;
  tags: Array<[string, string]>;
}

/**
 * Everything the file says about itself. `probe_media` forwards only FFprobe's
 * format tags, and OGG and Opus keep theirs in a stream-level Vorbis comment
 * block, so for those the block is read from the file as well — otherwise the
 * form starts empty under a label promising it was filled in from the file.
 * Tags FFprobe did report come first, so they win in `tagsFromProbe`.
 */
async function readFileTags(path: string, size: number): Promise<Array<[string, string]>> {
  const probed = await call<ProbedTags[]>('probe_media', { inputs: [path] }).catch(() => null);
  const tags = probed?.[0]?.tags ?? [];
  if (!isVorbisContainer(path) || size > VORBIS_READ_LIMIT) return tags;
  const bytes = await readBytes(path).catch(() => null);
  return bytes ? [...tags, ...parseVorbisComments(bytes)] : tags;
}

const FIELD_LABELS: Record<keyof TagFields, string> = {
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
  albumArtist: 'Album artist',
  year: 'Year',
  genre: 'Genre',
  track: 'Track',
  comment: 'Comment',
};

const PLACEHOLDERS: Record<keyof TagFields, string> = {
  title: 'Song title',
  artist: 'Performing artist',
  album: 'Album name',
  albumArtist: 'Artist the album is filed under',
  year: '2024',
  genre: 'Jazz',
  track: '3 or 3/12',
  comment: 'Anything you want to remember',
};

/** Module-level so the identity stays stable across renders. */
const AUDIO_EXTENSIONS = [
  'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
  'aiff', 'aif', 'wma', 'caf', 'amr', 'ac3', 'mka', 'au',
];

export default function EditAudioTags() {
  const files = useToolFiles({ kinds: ['audio'], extensions: AUDIO_EXTENSIONS, filterName: 'Audio' });
  const run = useToolRun('audio/tags', 'Edit Audio Tags');
  const { spec, update } = useOutputSpec();
  const [fields, setFields] = useState<TagFields>(EMPTY_TAGS);
  const [cover, setCover] = useState<string | null>(null);
  const [removeAll, setRemoveAll] = useState(false);
  /** Which file the form was last filled from, so re-renders do not undo edits. */
  const prefilledFrom = useRef<string | null>(null);

  const pathKey = files.paths.join('\n');
  const onlySize = files.files.length === 1 ? files.files[0].size : 0;
  useEffect(() => {
    const inputs = pathKey ? pathKey.split('\n') : [];
    if (inputs.length === 0) {
      prefilledFrom.current = null;
      setFields(EMPTY_TAGS);
      return;
    }
    // Only a single file gets read into the form: filling it from one file and
    // then writing those values across a whole batch would be a trap.
    if (inputs.length !== 1 || prefilledFrom.current === inputs[0]) return;
    const path = inputs[0];
    let stale = false;
    void readFileTags(path, onlySize)
      .then((tags) => {
        if (stale) return;
        prefilledFrom.current = path;
        setFields(tagsFromProbe(tags));
      })
      .catch(() => {
        // No FFprobe, or an unreadable container — the form just starts empty.
      });
    return () => {
      stale = true;
    };
  }, [pathKey, onlySize]);

  const set = (key: keyof TagFields, value: string) => setFields((f) => ({ ...f, [key]: value }));

  const filled = useMemo(() => filledFields(fields), [fields]);
  const hasWork = filled.length > 0 || cover !== null || removeAll;
  const batch = files.files.length > 1;

  const pickCover = async () => {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    if (typeof picked === 'string') setCover(picked);
  };

  const execute = () =>
    void run.execute({
      command: 'write_audio_tags',
      total: files.files.length,
      inputs: files.paths,
      label: `Tag ${files.files.length} file${files.files.length === 1 ? '' : 's'}`,
      args: {
        inputs: files.paths,
        tags: tagPayload(fields, cover, removeAll),
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
            hint="MP3, M4A and FLAC carry the richest tags — WAV and Opus keep only the basics"
            allowFolders
          />

          {batch && (
            <Alert tone="warn" title={`The same values go onto all ${files.files.length} files`}>
              Every field you fill in is written to every selected file — useful for a whole album, wrong for a mixed
              playlist. Fields you leave empty keep whatever each file already has.
            </Alert>
          )}

          <Section
            title="Tags"
            description={
              files.files.length === 1
                ? 'Pre-filled from the file. Clear a field to leave that tag untouched.'
                : 'Leave a field empty to keep the value each file already has.'
            }
            actions={filled.length > 0 ? <Badge tone="accent">{filled.length} to write</Badge> : undefined}
          >
            <div className="space-y-3">
              <OptionsGrid cols={2}>
                <Field label={FIELD_LABELS.title}>
                  <Input
                    value={fields.title}
                    placeholder={PLACEHOLDERS.title}
                    onChange={(e) => set('title', e.target.value)}
                  />
                </Field>
                <Field label={FIELD_LABELS.artist}>
                  <Input
                    value={fields.artist}
                    placeholder={PLACEHOLDERS.artist}
                    onChange={(e) => set('artist', e.target.value)}
                  />
                </Field>
                <Field label={FIELD_LABELS.album}>
                  <Input
                    value={fields.album}
                    placeholder={PLACEHOLDERS.album}
                    onChange={(e) => set('album', e.target.value)}
                  />
                </Field>
                <Field label={FIELD_LABELS.albumArtist} hint="Keeps compilations together in music apps">
                  <Input
                    value={fields.albumArtist}
                    placeholder={PLACEHOLDERS.albumArtist}
                    onChange={(e) => set('albumArtist', e.target.value)}
                  />
                </Field>
              </OptionsGrid>

              <OptionsGrid cols={3}>
                <Field label={FIELD_LABELS.year}>
                  <Input
                    value={fields.year}
                    placeholder={PLACEHOLDERS.year}
                    inputMode="numeric"
                    onChange={(e) => set('year', e.target.value)}
                  />
                </Field>
                <Field label={FIELD_LABELS.genre}>
                  <Input
                    value={fields.genre}
                    placeholder={PLACEHOLDERS.genre}
                    onChange={(e) => set('genre', e.target.value)}
                  />
                </Field>
                <Field label={FIELD_LABELS.track} hint="Number, or number/total">
                  <Input
                    value={fields.track}
                    placeholder={PLACEHOLDERS.track}
                    onChange={(e) => set('track', e.target.value)}
                  />
                </Field>
              </OptionsGrid>

              <Field label={FIELD_LABELS.comment}>
                <Input
                  value={fields.comment}
                  placeholder={PLACEHOLDERS.comment}
                  onChange={(e) => set('comment', e.target.value)}
                />
              </Field>
            </div>
          </Section>

          <Section
            title="Cover art"
            description="Embedded as a JPEG picture. MP3, M4A and FLAC support this; WAV and Opus do not."
            actions={
              cover ? (
                <Button size="sm" variant="ghost" icon="X" onClick={() => setCover(null)}>
                  Remove
                </Button>
              ) : undefined
            }
          >
            <div className="flex items-center gap-4">
              <ImagePreview path={cover} className="h-28 w-28 shrink-0" alt="Chosen cover art" />
              <div className="min-w-0 space-y-2">
                <Button size="sm" icon="ImagePlus" onClick={() => void pickCover()}>
                  {cover ? 'Choose a different image' : 'Choose an image'}
                </Button>
                <p className="truncate text-[11.5px] text-ink-faint" title={cover ?? ''}>
                  {cover ? basename(cover) : 'No image chosen — existing artwork is left alone.'}
                </p>
              </div>
            </div>
          </Section>

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Tags written" />}
        </>
      }
      aside={
        <>
          <Section title="How tags are applied">
            <div className="space-y-3">
              <Field
                inline
                label="Replace everything"
                hint="Erase all existing metadata first, then write only the fields above"
              >
                <Switch checked={removeAll} onCheckedChange={setRemoveAll} />
              </Field>
              <p className="text-[11.5px] text-ink-faint">
                The audio itself is copied bit for bit — only the tag block is rewritten, so nothing is re-encoded and no
                quality is lost.
              </p>
              {removeAll && (
                <Alert tone="warn">
                  Existing artwork, comments and every other tag are dropped from the new file. The original is never
                  modified.
                </Alert>
              )}
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
            <p className="mt-3 text-[11.5px] text-ink-faint">
              With no suffix and no folder of your own, the tagged copy is written next to the original as
              <span className="font-mono"> name-tagged.ext</span>.
            </p>
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label={batch ? `Write tags to ${files.files.length} files` : 'Write tags'}
            icon="Tags"
            disabled={files.isEmpty || !hasWork}
            disabledReason={
              files.isEmpty
                ? 'Add at least one audio file first.'
                : 'Fill in at least one field, choose cover art, or turn on Replace everything.'
            }
          />
        </>
      }
    />
  );
}
