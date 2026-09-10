import { useMemo } from 'react';
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
import { Alert, Badge, Section } from '@/components/ui';

const TOOL_ID = 'pdf/word-to-pdf';
const TOOL_NAME = 'Word to PDF';

const EXTENSIONS = ['doc', 'docx', 'odt', 'rtf', 'txt', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp'];

export default function WordToPdf() {
  // Extensions only, deliberately: a dropped folder is expanded by the backend,
  // which requires the kind *and* the extension to match. Plain text files are
  // kind `text`, not `document`, so naming kinds here would quietly drop the
  // .txt files out of any folder.
  const files = useToolFiles({ extensions: EXTENSIONS, filterName: 'Documents' });
  const run = useToolRun(TOOL_ID, TOOL_NAME);
  const { spec, update } = useOutputSpec();

  /** What is actually queued, so a batch of mixed types is visible before running. */
  const breakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const file of files.files) {
      const ext = file.extension.toLowerCase() || 'file';
      counts.set(ext, (counts.get(ext) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [files.files]);

  const execute = () =>
    void run.execute({
      command: 'convert_document',
      total: files.files.length,
      inputs: files.paths,
      label: `Convert ${files.files.length} document${files.files.length === 1 ? '' : 's'} to PDF`,
      args: { inputs: files.paths, targetFormat: 'pdf', output: spec },
    });

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop documents here"
            hint="Word, OpenDocument, RTF, plain text, spreadsheets and presentations"
            accept="Folders are expanded automatically"
            allowFolders
          />

          {breakdown.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {breakdown.map(([ext, count]) => (
                <Badge key={ext}>
                  {count} · {ext.toUpperCase()}
                </Badge>
              ))}
            </div>
          )}

          <Alert tone="info" title="Converted by LibreOffice, entirely on this Mac.">
            Fonts installed on this machine are embedded in the PDF; anything missing is substituted,
            which can move text around. Spreadsheets and presentations are exported page by page just
            as they would print.
          </Alert>

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="PDFs created" />}
        </>
      }
      aside={
        <>
          <Section title="What can be converted">
            <ul className="space-y-1.5 text-[12.5px] text-ink-soft">
              <li>Word — .doc, .docx</li>
              <li>OpenDocument — .odt, .ods, .odp</li>
              <li>Rich text and plain text — .rtf, .txt</li>
              <li>Spreadsheets — .xls, .xlsx</li>
              <li>Presentations — .ppt, .pptx</li>
            </ul>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} showSuffix={false} />
            <p className="mt-3 text-[11.5px] text-ink-faint">
              Each document keeps its name and gains a .pdf extension.
            </p>
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label={files.files.length > 1 ? `Convert ${files.files.length} files to PDF` : 'Convert to PDF'}
            icon="FileOutput"
            disabled={files.isEmpty}
            disabledReason="Add at least one document first."
          />
        </>
      }
    />
  );
}
