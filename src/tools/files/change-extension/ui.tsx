import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { asToolboxError, call } from '@/core/bridge';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  ErrorDisplay,
  FileDropZone,
  PresetRow,
  ResultPanel,
  ToolActions,
  ToolShell,
} from '@/components/tool';
import { Alert, Badge, Field, Icon, Input, Mono, Section, Switch } from '@/components/ui';
import {
  COMMON_EXTENSIONS,
  converterFor,
  currentExtensions,
  isRisky,
  normalizeExtension,
  type RenamePreview,
} from './logic';

const MAX_PREVIEW_ROWS = 300;

export default function ChangeFileExtension() {
  const files = useToolFiles({ filterName: 'Files', recursive: false });
  const run = useToolRun('files/change-extension', 'Change File Extension');

  const [raw, setRaw] = useState('');
  const [copyInstead, setCopyInstead] = useState(false);
  const [previews, setPreviews] = useState<RenamePreview[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const extension = normalizeExtension(raw);
  const inputs = files.paths;

  useEffect(() => {
    if (inputs.length === 0 || !extension) {
      setPreviews([]);
      setPreviewError(null);
      setPreviewing(false);
      return;
    }
    let cancelled = false;
    setPreviewing(true);
    const timer = setTimeout(() => {
      call<RenamePreview[]>('preview_rename', {
        inputs,
        rules: [{ type: 'changeExtension', ext: extension }],
      })
        .then((rows) => {
          if (cancelled) return;
          setPreviews(rows);
          setPreviewError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          setPreviews([]);
          setPreviewError(asToolboxError(err).message);
        })
        .finally(() => {
          if (!cancelled) setPreviewing(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [inputs, extension]);

  const fromExtensions = useMemo(() => currentExtensions(files.files.map((f) => f.name)), [files.files]);
  const converter = converterFor(extension);
  const risky = isRisky(fromExtensions, extension);
  const conflicts = previews.filter((p) => p.conflict).length;
  const changed = previews.filter((p) => p.from !== p.to).length;

  const blocked = files.isEmpty
    ? 'Add the files whose extension you want to change.'
    : !extension
      ? 'Type the new extension first.'
      : previewError
        ? 'The new name could not be worked out — see the message above.'
        : conflicts > 0
          ? `${conflicts} file${conflicts === 1 ? '' : 's'} would collide with a name that already exists.`
          : changed === 0
            ? `Every file already ends in .${extension}.`
            : null;

  const execute = async () => {
    const batch = await run.execute({
      command: 'batch_rename',
      total: files.files.length,
      inputs: files.paths,
      label: `${copyInstead ? 'Copy' : 'Rename'} ${files.files.length} file${
        files.files.length === 1 ? '' : 's'
      } to .${extension}`,
      args: {
        inputs: files.paths,
        rules: [{ type: 'changeExtension', ext: extension }],
        copyInstead,
      },
    });
    if (batch && !copyInstead) {
      const next = [...batch.results.map((r) => r.path), ...batch.failures.map((f) => f.path)];
      if (next.length > 0) await files.set(next);
    }
  };

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop the files to re-label"
            hint="Any type. Dropping a folder adds the files directly inside it."
            allowFolders
          />

          <Alert tone="warn" title="This renames the file. It does not convert it.">
            The bytes inside stay exactly as they are — only the label at the end of the name changes. Use it when the
            extension is wrong or inconsistent (a JPEG saved as <Mono>.jpeg</Mono>, a text file saved with no
            extension). If you need the file to genuinely become another format, use a converter instead:{' '}
            <Link to="/t/images/convert" className="underline underline-offset-2">
              Image Converter
            </Link>
            ,{' '}
            <Link to="/t/video/convert" className="underline underline-offset-2">
              Video Converter
            </Link>{' '}
            or{' '}
            <Link to="/t/audio/convert" className="underline underline-offset-2">
              Audio Converter
            </Link>
            .
          </Alert>

          <Section
            title="Preview"
            description={
              files.isEmpty
                ? 'Add files to see the new names.'
                : !extension
                  ? 'Type an extension to see the new names.'
                  : previewing
                    ? 'Working out the new names…'
                    : `${changed} of ${previews.length} file${previews.length === 1 ? '' : 's'} would be renamed`
            }
            actions={conflicts > 0 ? <Badge tone="danger">{conflicts} conflict{conflicts === 1 ? '' : 's'}</Badge> : undefined}
          >
            {previewError ? (
              <Alert tone="danger" title="That extension cannot be used.">
                {previewError}
              </Alert>
            ) : previews.length === 0 ? (
              <p className="py-4 text-center text-[12.5px] text-ink-faint">The new names appear here.</p>
            ) : (
              <>
                {conflicts > 0 && (
                  <Alert tone="danger" title="Some names are already taken." className="mb-3">
                    Renaming would clash with a file that already exists, or with another file in this list. Nothing is
                    renamed until every row is clear — remove the clashing files from the list, or handle them in Batch
                    Rename where you can add numbering.
                  </Alert>
                )}
                <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                  {previews.slice(0, MAX_PREVIEW_ROWS).map((row) => (
                    <li
                      key={row.path}
                      className={`flex items-center gap-2 px-3 py-1.5 ${row.conflict ? 'bg-danger-soft' : 'bg-panel'}`}
                    >
                      <span
                        className={`min-w-0 flex-1 truncate text-[12px] ${row.conflict ? 'text-danger' : 'text-ink-faint'}`}
                        title={row.path}
                      >
                        {row.from}
                      </span>
                      <Icon
                        name="ArrowRight"
                        size={12}
                        className={row.conflict ? 'shrink-0 text-danger' : 'shrink-0 text-ink-faint'}
                      />
                      <span
                        className={`min-w-0 flex-1 truncate text-[12px] font-medium ${
                          row.conflict ? 'text-danger' : row.from === row.to ? 'text-ink-faint' : 'text-ink'
                        }`}
                        title={row.to}
                      >
                        {row.to}
                      </span>
                      {row.conflict && <Badge tone="danger">Conflict</Badge>}
                      {!row.conflict && row.from === row.to && <Badge>Unchanged</Badge>}
                    </li>
                  ))}
                </ul>
                {previews.length > MAX_PREVIEW_ROWS && (
                  <p className="mt-2 text-[11.5px] text-ink-faint">
                    Showing the first {MAX_PREVIEW_ROWS} of {previews.length} files — all of them are renamed.
                  </p>
                )}
              </>
            )}
          </Section>

          {run.error && <ErrorDisplay error={run.error} onRetry={() => void execute()} />}
          {run.result && (
            <ResultPanel result={run.result} onProcessAgain={run.reset} title={copyInstead ? 'Copied' : 'Renamed'} />
          )}
        </>
      }
      aside={
        <>
          <Section title="New extension">
            <div className="space-y-3">
              <Field
                label="Extension"
                hint={extension ? `Files will end in .${extension}` : 'Without the dot — jpg, not .jpg'}
              >
                <Input
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  placeholder="jpg"
                  className="font-mono"
                  spellCheck={false}
                />
              </Field>
              <PresetRow
                presets={COMMON_EXTENSIONS.map((ext) => ({ label: ext, value: ext }))}
                active={extension}
                onSelect={setRaw}
              />
              {fromExtensions.length > 0 && (
                <p className="text-[11.5px] text-ink-faint">
                  Currently{' '}
                  {fromExtensions
                    .slice(0, 4)
                    .map((ext) => (ext ? `.${ext}` : 'no extension'))
                    .join(', ')}
                  {fromExtensions.length > 4 ? ' and more' : ''}.
                </p>
              )}
            </div>
          </Section>

          {risky && converter && (
            <Alert tone="warn" title={`.${extension} is a different format.`}>
              Renaming will not make these files openable as {extension.toUpperCase()}. To really convert them, use{' '}
              <Link to={converter.to} className="underline underline-offset-2">
                {converter.label}
              </Link>
              .
            </Alert>
          )}

          <Section title="How to apply">
            <Field
              inline
              label="Copy instead of rename"
              hint={copyInstead ? 'The originals are left untouched' : 'The originals are renamed in place'}
            >
              <Switch checked={copyInstead} onCheckedChange={setCopyInstead} />
            </Field>
            <p className="mt-2 text-[11.5px] text-ink-faint">
              Files stay in their folder, and an existing file is never overwritten.
            </p>
          </Section>

          <ToolActions
            run={run}
            onRun={() => void execute()}
            label={
              extension ? `${copyInstead ? 'Copy as' : 'Rename to'} .${extension}` : copyInstead ? 'Copy' : 'Rename'
            }
            icon="FileType"
            disabled={Boolean(blocked) || previewing}
            disabledReason={blocked ?? undefined}
          />
        </>
      }
    />
  );
}
