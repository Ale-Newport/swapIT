import { useState } from 'react';
import { formatBytes, shortenPath } from '@/core/format';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import { ErrorDisplay, FileDropZone, ToolActions, ToolShell } from '@/components/tool';
import { Alert, Badge, Button, Checkbox, Field, Icon, Modal, Section, Select } from '@/components/ui';

const PASS_OPTIONS = [
  { value: '1', label: '1 pass — recommended' },
  { value: '2', label: '2 passes' },
  { value: '3', label: '3 passes' },
  { value: '4', label: '4 passes' },
  { value: '5', label: '5 passes' },
  { value: '6', label: '6 passes' },
  { value: '7', label: '7 passes' },
];

export default function SecureDelete() {
  const files = useToolFiles({ multiple: true, filterName: 'Any file' });
  const run = useToolRun('files/secure-delete', 'Secure Delete');

  const [passes, setPasses] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [understood, setUnderstood] = useState(false);

  const openConfirm = () => {
    setUnderstood(false);
    setConfirmOpen(true);
  };

  const execute = async () => {
    setConfirmOpen(false);
    const targets = files.paths;
    const outcome = await run.execute({
      command: 'secure_delete',
      total: targets.length,
      inputs: targets,
      label: `Securely delete ${targets.length} file${targets.length === 1 ? '' : 's'}`,
      args: { inputs: targets, passes },
    });
    // Drop what is gone from the list; anything that failed stays so it can be retried.
    for (const deleted of outcome?.results ?? []) files.remove(deleted.path);
  };

  const result = run.result;
  const freed = result?.results.reduce((sum, r) => sum + (r.sourceSize ?? 0), 0) ?? 0;

  return (
    <>
      <ToolShell
        main={
          <>
            <FileDropZone
              files={files}
              label="Drop the files to destroy here"
              hint="Dropping a folder adds the files inside it — the folders themselves are left in place"
            />

            <Alert tone="warn" title="What this tool can and cannot promise">
              <p>
                Overwriting a file does <strong>not</strong> reliably destroy its contents on an SSD. Wear
                levelling means the drive writes the new bytes to fresh cells and quietly retires the ones
                holding your data, where they stay readable to anyone with forensic tools until the controller
                reuses them. Toolbox cannot address those cells — no application can.
              </p>
              <p className="mt-1.5">
                APFS, the file system on every modern Mac, is copy-on-write and keeps local snapshots, so an
                older copy of the file may still exist in a snapshot, in a Time Machine backup, in iCloud Drive
                or in an app&rsquo;s cache. Deleting the file here does not touch any of those.
              </p>
              <p className="mt-1.5">
                <strong>Turn on FileVault</strong> (System Settings › Privacy &amp; Security) if the goal is
                that nobody can read your data. Full-disk encryption is the only thing that reliably protects
                what is left behind on the drive.
              </p>
            </Alert>

            {run.error && <ErrorDisplay error={run.error} onRetry={() => void execute()} />}

            {result && (
              <Section
                title={
                  <span className="flex items-center gap-2">
                    <Icon
                      name={result.cancelled ? 'CircleSlash' : 'CircleCheck'}
                      size={15}
                      className={result.cancelled ? 'text-ink-faint' : 'text-success'}
                    />
                    {result.cancelled ? 'Stopped early' : 'Deleted'}
                  </span>
                }
                description={`${result.results.length} file${result.results.length === 1 ? '' : 's'} removed · ${formatBytes(freed)} freed${result.failures.length ? ` · ${result.failures.length} failed` : ''}`}
                actions={
                  <Button size="sm" variant="ghost" icon="RotateCcw" onClick={run.reset}>
                    Clear
                  </Button>
                }
              >
                <div className="space-y-3">
                  {result.results.length > 0 && (
                    <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                      {result.results.slice(0, 50).map((item) => (
                        <li key={item.path} className="flex items-center gap-3 bg-panel px-3 py-1.5">
                          <Icon name="Trash2" size={13} className="shrink-0 text-ink-faint" />
                          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink" title={item.path}>
                            {item.name}
                          </span>
                          <span className="shrink-0 text-[11.5px] text-ink-faint">
                            {formatBytes(item.sourceSize ?? 0)}
                          </span>
                          {item.note && <Badge>{item.note}</Badge>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {result.results.length > 50 && (
                    <p className="text-[12px] text-ink-faint">
                      …and {result.results.length - 50} more files.
                    </p>
                  )}
                  {result.failures.map((failure) => (
                    <Alert key={failure.path + failure.message} tone="danger" title={failure.name}>
                      {failure.message}
                    </Alert>
                  ))}
                </div>
              </Section>
            )}
          </>
        }
        aside={
          <>
            <Section title="Overwrite passes">
              <div className="space-y-2.5">
                <Field label="Passes">
                  <Select
                    value={String(passes)}
                    onChange={(e) => setPasses(Number(e.target.value))}
                    options={PASS_OPTIONS}
                  />
                </Field>
                <p className="text-[11.5px] leading-[1.5] text-ink-faint">
                  Each pass rewrites the whole file, alternating all-zero and all-one bytes, then the file is
                  renamed to a random name and unlinked.
                </p>
                <p className="text-[11.5px] leading-[1.5] text-ink-faint">
                  More passes is folklore from 1990s magnetic drives; on flash storage it only takes longer and
                  wears the disk. One pass gives you everything a second one would.
                </p>
              </div>
            </Section>

            <Section title="Before you run">
              <div className="space-y-2 text-[11.5px] leading-[1.5] text-ink-faint">
                <p>Files are not moved to the Trash. There is no undo inside Toolbox and no undo in Finder.</p>
                <p>
                  A file you have no write permission for, or one on a read-only volume, fails with a message
                  rather than being silently skipped.
                </p>
                <p>Folders are not deleted — only the files you list.</p>
              </div>
            </Section>

            <ToolActions
              run={run}
              onRun={openConfirm}
              label={`Delete ${files.files.length || ''} file${files.files.length === 1 ? '' : 's'}…`}
              icon="ShieldX"
              disabled={files.isEmpty}
              disabledReason="Add the files you want destroyed first."
            />
          </>
        }
      />

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Destroy these files permanently?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" icon="ShieldX" disabled={!understood} onClick={() => void execute()}>
              Overwrite and delete {files.files.length} file{files.files.length === 1 ? '' : 's'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[12.5px] leading-[1.5] text-ink-soft">
            {files.files.length} file{files.files.length === 1 ? '' : 's'} ·{' '}
            {formatBytes(files.totalSize)} · overwritten {passes} time{passes === 1 ? '' : 's'}, then removed
            without going to the Trash.
          </p>

          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
            {files.files.map((file) => (
              <li key={file.path} className="bg-panel px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <Icon name="File" size={13} className="shrink-0 text-ink-faint" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{file.name}</span>
                  <span className="shrink-0 text-[11.5px] text-ink-faint">{formatBytes(file.size)}</span>
                </div>
                <p className="truncate pl-5 text-[11px] text-ink-faint" title={file.path}>
                  {shortenPath(file.path.split('/').slice(0, -1).join('/'), 3)}
                </p>
              </li>
            ))}
          </ul>

          <Alert tone="danger" title="This cannot be undone.">
            Recovery software will not bring these files back, and neither will Toolbox. Anything you still
            need should be copied elsewhere first.
          </Alert>

          <Checkbox
            checked={understood}
            onCheckedChange={setUnderstood}
            label="I understand these files cannot be recovered"
          />
        </div>
      </Modal>
    </>
  );
}
