import { useEffect, useState } from 'react';
import { asToolboxError, expandPaths } from '@/core/bridge';
import { formatBytes } from '@/core/format';
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
import { Alert, Badge, Field, Input, Section, Select, Spinner } from '@/components/ui';
import { FORMATS, archiveFileName, suggestArchiveName, type ArchiveFormat } from './logic';

const SCAN_LIMIT = 100_000;

const ALL_KINDS = [
  'image', 'svg', 'video', 'audio', 'pdf', 'document', 'archive', 'text', 'data', 'code', 'font', 'other',
] as const;

export default function CreateZip() {
  const files = useToolFiles({ folders: true, kinds: [...ALL_KINDS], filterName: 'Any file' });
  const run = useToolRun('files/zip', 'Create ZIP');
  const { spec, update } = useOutputSpec();

  const [format, setFormat] = useState<ArchiveFormat>('zip');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [contents, setContents] = useState<{ count: number; size: number } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const suggestion = suggestArchiveName(files.paths);
  const effectiveName = (nameTouched ? name : suggestion).trim();
  // A blank field is not an error: `create_archive` falls back to the stem of
  // the first selected item, which is exactly what `suggestion` holds — so the
  // preview has to fall back the same way to name the file that is written.
  const outputName = archiveFileName(effectiveName || suggestion, format);
  const hasFolders = files.files.some((f) => f.isDir);

  useEffect(() => {
    if (files.paths.length === 0) {
      setContents(null);
      setScanError(null);
      return;
    }
    let stale = false;
    setScanning(true);
    setScanError(null);
    expandPaths(files.paths, { recursive: true, includeHidden: true, limit: SCAN_LIMIT })
      .then((found) => {
        if (stale) return;
        setContents({
          count: found.length,
          size: found.reduce((sum, f) => sum + f.size, 0),
        });
      })
      .catch((err) => {
        if (stale) return;
        setContents(null);
        setScanError(asToolboxError(err).message);
      })
      .finally(() => {
        if (!stale) setScanning(false);
      });
    return () => {
      stale = true;
    };
  }, [files.paths]);

  const execute = () =>
    void run.execute({
      command: 'create_archive',
      total: contents?.count || files.paths.length,
      inputs: files.paths,
      label: `Compress ${contents?.count ?? files.paths.length} files into ${outputName}`,
      args: {
        inputs: files.paths,
        format,
        archiveName: effectiveName || null,
        output: spec,
      },
    });

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop files and folders here"
            hint="Anything at all — folders go in whole, keeping their internal structure"
            allowFolders
          />

          {files.paths.length > 0 && (
            <Section title="Going into the archive" description={outputName}>
              <div className="space-y-2.5">
                {scanning && !contents ? (
                  <div className="flex items-center gap-2 text-[12.5px] text-ink-faint">
                    <Spinner /> Measuring…
                  </div>
                ) : scanError ? (
                  <Alert tone="danger" title="The selection could not be read.">
                    {scanError}
                  </Alert>
                ) : contents ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="accent">
                      {contents.count.toLocaleString()} file{contents.count === 1 ? '' : 's'}
                    </Badge>
                    <Badge>{formatBytes(contents.size)} uncompressed</Badge>
                    <Badge>
                      {files.files.length} item{files.files.length === 1 ? '' : 's'} selected
                    </Badge>
                  </div>
                ) : null}
                <p className="text-[11.5px] leading-[1.5] text-ink-faint">
                  {hasFolders
                    ? 'Folders keep their structure: a folder named Trip becomes Trip/day-1/photo.jpg inside the archive. Hidden files are included.'
                    : 'Loose files sit at the top level of the archive. Hidden files are included.'}
                  {format === 'tar' && ' TAR stores files without compressing them, so the archive is roughly the size above.'}
                </p>
              </div>
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Archive created" />}
        </>
      }
      aside={
        <>
          <Section title="Archive">
            <div className="space-y-3">
              <Field label="Format">
                <Select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as ArchiveFormat)}
                  options={FORMATS.map((f) => ({ value: f.value, label: f.label }))}
                />
              </Field>
              <p className="text-[11.5px] leading-[1.5] text-ink-faint">
                {FORMATS.find((f) => f.value === format)?.hint}
              </p>
              <Field label="Archive name" hint={`Saved as ${outputName}`}>
                <Input
                  value={nameTouched ? name : suggestion}
                  placeholder={suggestion || 'archive'}
                  spellCheck={false}
                  onChange={(e) => {
                    setNameTouched(true);
                    setName(e.target.value);
                  }}
                />
              </Field>
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} showSuffix={false} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label={`Create ${format === 'zip' ? 'ZIP' : format === 'tar' ? 'TAR' : 'TAR.GZ'}`}
            icon="FileArchive"
            disabled={files.isEmpty}
            disabledReason="Add at least one file or folder first."
          />
        </>
      }
    />
  );
}
