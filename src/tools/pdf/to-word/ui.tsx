import clsx from 'clsx';
import { useState } from 'react';
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
import { Alert, Section } from '@/components/ui';

const TOOL_ID = 'pdf/to-word';
const TOOL_NAME = 'PDF to Word';

// Every target here must be one LibreOffice writes as a *single* file:
// `convert_document` copies one file out of the conversion folder, so a format
// that also emits sidecar images (HTML) cannot be offered.
const TARGETS = [
  { value: 'docx', label: 'Word (.docx)', hint: 'Opens in Word, Pages and Google Docs' },
  { value: 'odt', label: 'OpenDocument (.odt)', hint: 'LibreOffice and OpenOffice' },
  { value: 'rtf', label: 'Rich Text (.rtf)', hint: 'Plain formatting that opens almost anywhere' },
];

export default function PdfToWord() {
  const files = useToolFiles({ kinds: ['pdf'], extensions: ['pdf'], filterName: 'PDF files' });
  const run = useToolRun(TOOL_ID, TOOL_NAME);
  const { spec, update } = useOutputSpec();
  const [target, setTarget] = useState('docx');

  const execute = () =>
    void run.execute({
      command: 'convert_document',
      total: files.files.length,
      inputs: files.paths,
      label: `Convert ${files.files.length} PDF${files.files.length === 1 ? '' : 's'} to ${target.toUpperCase()}`,
      args: { inputs: files.paths, targetFormat: target, output: spec },
    });

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop PDFs here"
            hint="LibreOffice rebuilds each page in an editable document"
            accept="Folders are expanded automatically"
            allowFolders
          />

          <Alert tone="warn" title="How faithful the result is depends on the PDF.">
            A PDF made from a word processor usually keeps its words and most of its look, but
            paragraphs often arrive as separate text boxes instead of flowing text, so heavy editing
            takes some tidying up. A scanned PDF contains pictures of text rather than text, so the
            converted file contains those same pictures — run it through OCR first if you need words
            you can edit.
          </Alert>

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Converted" />}
        </>
      }
      aside={
        <>
          <Section title="Convert to">
            <div className="space-y-1.5">
              {TARGETS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={target === option.value}
                  onClick={() => setTarget(option.value)}
                  className={clsx(
                    'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                    target === option.value
                      ? 'border-ink bg-accent-soft'
                      : 'border-line bg-panel hover:border-line-strong',
                  )}
                >
                  <span className="block text-[12.5px] font-medium text-ink">{option.label}</span>
                  <span className="mt-0.5 block text-[11.5px] text-ink-faint">{option.hint}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} showSuffix={false} />
            <p className="mt-3 text-[11.5px] text-ink-faint">
              Each document keeps its name and gains a .{target} extension.
            </p>
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label={`Convert to ${target.toUpperCase()}`}
            icon="FileText"
            disabled={files.isEmpty}
            disabledReason="Add at least one PDF first."
          />
        </>
      }
    />
  );
}
