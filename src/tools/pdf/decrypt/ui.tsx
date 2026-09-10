import { useMemo, useState } from 'react';
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
import { Alert, Field, IconButton, Input, Section } from '@/components/ui';
import { summariseFailures, wrongPasswordMessage } from './logic';

const TOOL_ID = 'pdf/decrypt';
const TOOL_NAME = 'Remove PDF Password';

export default function DecryptPdf() {
  const files = useToolFiles({ kinds: ['pdf'], extensions: ['pdf'], filterName: 'PDF files' });
  const run = useToolRun(TOOL_ID, TOOL_NAME);
  const { spec, update } = useOutputSpec({ suffix: '-unlocked' });

  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);

  const failures = useMemo(
    () => summariseFailures(run.result?.failures ?? []),
    [run.result],
  );
  const attempted = (run.result?.results.length ?? 0) + (run.result?.failures.length ?? 0);
  const passwordNotice = wrongPasswordMessage(failures.wrongPassword, attempted);

  const execute = () =>
    void run.execute({
      command: 'decrypt_pdf',
      total: files.files.length,
      inputs: files.paths,
      label: `Unlock ${files.files.length} PDF${files.files.length === 1 ? '' : 's'}`,
      args: { inputs: files.paths, password, output: spec },
    });

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop protected PDFs here"
            hint="An unlocked copy is written — the protected originals are left as they are"
            accept="Folders are expanded automatically"
            allowFolders
          />

          <Alert tone="info" title="Only for documents you are allowed to open.">
            This removes protection from a PDF you can already unlock with its password. Toolbox does
            not guess, crack or bypass a password, and the correct one has to be entered below.
          </Alert>

          {passwordNotice && (
            <Alert tone="danger" title={passwordNotice}>
              Check for typos, capital letters and a stray space at the end. PDF passwords are exact,
              and a document can carry a different one from the file it was copied from.
            </Alert>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Unlocked" />}
        </>
      }
      aside={
        <>
          <Section title="Password">
            <div className="space-y-3">
              <Field
                label="Document password"
                hint="The password you normally type when opening the file"
              >
                <div className="flex items-center gap-2">
                  <Input
                    type={visible ? 'text' : 'password'}
                    value={password}
                    placeholder="Required"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && password && !files.isEmpty && !run.running) execute();
                    }}
                  />
                  <IconButton
                    icon={visible ? 'EyeOff' : 'Eye'}
                    label={visible ? 'Hide password' : 'Show password'}
                    onClick={() => setVisible((v) => !v)}
                  />
                </div>
              </Field>
              <p className="text-[11.5px] text-ink-faint">
                The same password is tried on every file in the batch. Documents needing a different one
                are reported individually and left untouched.
              </p>
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label={files.files.length > 1 ? `Unlock ${files.files.length} PDFs` : 'Remove password'}
            icon="LockOpen"
            disabled={files.isEmpty || password === ''}
            disabledReason={files.isEmpty ? 'Add at least one PDF first.' : 'Enter the document password first.'}
          />
        </>
      }
    />
  );
}
