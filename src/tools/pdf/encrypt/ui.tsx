import clsx from 'clsx';
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
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Field,
  IconButton,
  Input,
  Section,
  Switch,
} from '@/components/ui';
import { generatePassword, passwordStrength, validatePasswords } from './logic';

const TOOL_ID = 'pdf/encrypt';
const TOOL_NAME = 'Encrypt PDF';

function PasswordField({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <Input
          type={visible ? 'text' : 'password'}
          value={value}
          placeholder={placeholder}
          autoComplete="new-password"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
        />
        <IconButton
          icon={visible ? 'EyeOff' : 'Eye'}
          label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          onClick={() => setVisible((v) => !v)}
        />
      </div>
    </Field>
  );
}

export default function EncryptPdf() {
  const files = useToolFiles({ kinds: ['pdf'], extensions: ['pdf'], filterName: 'PDF files' });
  const run = useToolRun(TOOL_ID, TOOL_NAME);
  const { spec, update } = useOutputSpec({ suffix: '-encrypted' });

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [owner, setOwner] = useState('');
  const [allowPrinting, setAllowPrinting] = useState(true);

  const check = useMemo(() => validatePasswords(password, confirm, owner), [password, confirm, owner]);
  const strength = passwordStrength(password);

  const suggest = () => {
    const suggestion = generatePassword();
    setPassword(suggestion);
    setConfirm(suggestion);
  };

  const execute = () => {
    if (check.error) return;
    void run.execute({
      command: 'encrypt_pdf',
      total: files.files.length,
      inputs: files.paths,
      label: `Encrypt ${files.files.length} PDF${files.files.length === 1 ? '' : 's'}`,
      args: {
        inputs: files.paths,
        userPassword: password,
        ownerPassword: owner || undefined,
        allowPrinting,
        output: spec,
      },
    });
  };

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop PDFs here"
            hint="An encrypted copy is written — the originals stay unlocked"
            accept="Folders are expanded automatically"
            allowFolders
          />

          <Alert tone="warn" title="Toolbox cannot recover a forgotten password.">
            AES-256 encryption has no back door and no reset. If the password is lost, the encrypted
            copy is lost with it — write it down or put it in your password manager before you run this.
          </Alert>

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Encrypted" />}
        </>
      }
      aside={
        <>
          <Section
            title="Password"
            description="Needed to open the document"
            actions={
              <Button size="sm" variant="ghost" icon="RefreshCw" onClick={suggest}>
                Suggest
              </Button>
            }
          >
            <div className="space-y-3">
              <PasswordField
                label="Open password"
                value={password}
                onChange={setPassword}
                placeholder="Required to open the file"
              />
              {password !== '' && (
                <div className="flex items-center gap-2">
                  <Badge
                    tone={strength.level === 'strong' ? 'success' : strength.level === 'fair' ? 'warn' : 'danger'}
                  >
                    {strength.label}
                  </Badge>
                  <CopyButton value={password} label="Copy" size="sm" variant="ghost" />
                </div>
              )}
              <PasswordField
                label="Confirm password"
                value={confirm}
                onChange={setConfirm}
                placeholder="Type it a second time"
              />
              <div
                className={clsx(
                  'text-[11.5px]',
                  check.error ? 'text-danger' : password ? 'text-success' : 'text-ink-faint',
                )}
              >
                {check.error ?? (password ? 'Both fields match.' : 'Nothing is encrypted until you enter a password.')}
              </div>
            </div>
          </Section>

          <Section title="Permissions">
            <div className="space-y-3">
              <PasswordField
                label="Owner password"
                hint="Optional — needed to change permissions. Defaults to the open password."
                value={owner}
                onChange={setOwner}
                placeholder="Leave empty to reuse the open password"
              />
              <Field inline label="Allow printing" hint="Off blocks printing from compliant readers">
                <Switch checked={allowPrinting} onCheckedChange={setAllowPrinting} />
              </Field>
              <p className="text-[11.5px] text-ink-faint">
                Permission flags are a request that well-behaved PDF readers honour, not a lock. Only the
                open password actually keeps a document closed.
              </p>
            </div>
          </Section>

          {check.warnings.length > 0 && (
            <div className="space-y-2">
              {check.warnings.map((warning) => (
                <Alert key={warning} tone="warn">
                  {warning}
                </Alert>
              ))}
            </div>
          )}

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label={files.files.length > 1 ? `Encrypt ${files.files.length} PDFs` : 'Encrypt PDF'}
            icon="Lock"
            disabled={files.isEmpty || Boolean(check.error)}
            disabledReason={files.isEmpty ? 'Add at least one PDF first.' : (check.error ?? undefined)}
          />
        </>
      }
    />
  );
}
