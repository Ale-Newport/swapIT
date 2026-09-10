import { useEffect, useMemo, useState } from 'react';
import { formatBytes } from '@/core/format';
import { saveTextAs } from '@/core/save';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import { ErrorDisplay, FileDropZone, ToolActions, ToolShell } from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  CopyButton,
  Field,
  Icon,
  Section,
  Select,
  Stat,
  Switch,
  Textarea,
} from '@/components/ui';
import {
  ALGORITHMS,
  checksumFile,
  digestOf,
  fullReport,
  parseExpected,
  summarise,
  verifyFiles,
  type AlgorithmId,
  type FileHashes,
  type Verdict,
} from './logic';

const VERDICT_BADGE: Record<Verdict, { tone: 'success' | 'danger' | 'neutral'; icon: string; label: string }> = {
  match: { tone: 'success', icon: 'CircleCheck', label: 'Matches' },
  mismatch: { tone: 'danger', icon: 'CircleAlert', label: 'Does not match' },
  unchecked: { tone: 'neutral', icon: 'CircleSlash', label: 'Not checked' },
};

export default function FileHash() {
  const files = useToolFiles({ filterName: 'Any file' });
  const run = useToolRun('developer/file-hash', 'File Hash');
  const [selected, setSelected] = useState<AlgorithmId[]>(['sha256']);
  const [rows, setRows] = useState<FileHashes[] | null>(null);
  const [verifyMode, setVerifyMode] = useState(false);
  const [expected, setExpected] = useState('');
  const [checksumAlgorithm, setChecksumAlgorithm] = useState<AlgorithmId>('sha256');

  const selectionKey = files.paths.join('|');
  const algorithmKey = selected.join('|');
  // Stale digests next to a changed selection would be a lie.
  useEffect(() => {
    setRows(null);
  }, [selectionKey, algorithmKey]);

  /** Keep the canonical MD5 → SHA-512 order however the boxes are ticked. */
  const toggle = (id: AlgorithmId, on: boolean) =>
    setSelected((current) => ALGORITHMS.map((a) => a.id).filter((a) => (a === id ? on : current.includes(a))));

  const execute = async () => {
    if (files.isEmpty || selected.length === 0) return;
    const result = await run.executeRaw<FileHashes[]>({
      command: 'hash_files',
      total: files.files.length,
      inputs: files.paths,
      label: `Hash ${files.files.length} file${files.files.length === 1 ? '' : 's'}`,
      args: { inputs: files.paths, algorithms: selected },
    });
    setRows(Array.isArray(result) ? result : null);
  };

  const verification = useMemo(
    () => (rows && verifyMode && expected.trim() ? verifyFiles(rows, expected) : null),
    [rows, verifyMode, expected],
  );
  const summary = verification ? summarise(verification) : null;
  const unreadable = useMemo(
    () => (verifyMode && expected.trim() ? parseExpected(expected).unreadable : []),
    [verifyMode, expected],
  );

  const checksumTarget = selected.includes(checksumAlgorithm) ? checksumAlgorithm : selected[0];
  const checksumText = rows && checksumTarget ? checksumFile(rows, checksumTarget) : '';

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop files here"
            hint="Any size — files are streamed, so a multi-gigabyte disk image never lands in memory"
            allowFolders
            compact={!files.isEmpty}
          />

          {run.error && <ErrorDisplay error={run.error} onRetry={() => void execute()} />}

          {summary && (
            <Alert
              tone={summary.mismatched > 0 ? 'danger' : summary.matched > 0 ? 'success' : 'warn'}
              title={
                summary.mismatched > 0
                  ? `${summary.mismatched} file${summary.mismatched === 1 ? '' : 's'} did not match`
                  : summary.matched > 0
                    ? `${summary.matched} file${summary.matched === 1 ? '' : 's'} matched`
                    : 'Nothing could be checked'
              }
            >
              {summary.mismatched > 0
                ? 'A mismatch means the file is not byte-for-byte the one the hash was taken from. Download it again before opening it.'
                : summary.matched > 0
                  ? 'The file is byte-for-byte identical to the one that produced the hash you pasted.'
                  : 'The pasted hashes do not line up with these files — check the names and the algorithm.'}
              {summary.unchecked > 0 && ` ${summary.unchecked} file${summary.unchecked === 1 ? '' : 's'} could not be checked.`}
            </Alert>
          )}

          {unreadable.length > 0 && (
            <Alert tone="warn" title="Some pasted lines held no hash">
              {unreadable.slice(0, 3).map((line) => (
                <p key={line} className="truncate font-mono text-[11.5px]">
                  {line}
                </p>
              ))}
              A hash is 32, 40, 64 or 128 hexadecimal characters, on its own or followed by a file name.
            </Alert>
          )}

          {rows && rows.length > 0 && (
            <Section
              title="Digests"
              description={`${rows.length} file${rows.length === 1 ? '' : 's'} · ${selected.length} algorithm${selected.length === 1 ? '' : 's'}`}
              actions={<CopyButton size="sm" label="Copy all" value={() => fullReport(rows, selected)} />}
              dense
            >
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                {rows.map((file) => {
                  const row = verification?.find((v) => v.file.path === file.path);
                  const badge = row ? VERDICT_BADGE[row.verdict] : null;
                  return (
                    <li key={file.path} className="bg-panel px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Icon name="File" size={14} className="shrink-0 text-ink-faint" />
                        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink" title={file.path}>
                          {file.name}
                        </span>
                        <span className="shrink-0 text-[11.5px] text-ink-faint">{formatBytes(file.size)}</span>
                        {badge && (
                          <Badge tone={badge.tone}>
                            <Icon name={badge.icon} size={12} />
                            {badge.label}
                          </Badge>
                        )}
                      </div>

                      {row?.note && <p className="mt-1 text-[11.5px] text-ink-faint">{row.note}</p>}

                      {row?.verdict === 'mismatch' && (
                        <div className="mt-1.5 space-y-0.5 rounded-lg bg-danger-soft p-2 font-mono text-[11.5px] text-danger">
                          <p className="break-all">expected {row.expected}</p>
                          <p className="break-all">actual&nbsp;&nbsp; {row.actual}</p>
                        </div>
                      )}

                      <div className="mt-1.5 space-y-1">
                        {selected.map((id) => {
                          const digest = digestOf(file, id);
                          if (!digest) return null;
                          const label = ALGORITHMS.find((a) => a.id === id)?.label ?? id;
                          const isMatched = row?.algorithm === id && row.verdict === 'match';
                          return (
                            <div key={id} className="flex items-start gap-2">
                              <span className="w-16 shrink-0 pt-[2px] text-[11.5px] text-ink-faint">{label}</span>
                              <span
                                className={`selectable min-w-0 flex-1 break-all font-mono text-[12px] ${
                                  isMatched ? 'text-success' : 'text-ink'
                                }`}
                              >
                                {digest}
                              </span>
                              <CopyButton size="sm" variant="ghost" value={digest} />
                            </div>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {rows && rows.length === 0 && (
            <Section title="Digests" dense>
              <p className="py-4 text-center text-[12.5px] text-ink-faint">None of those files could be read.</p>
            </Section>
          )}
        </>
      }
      aside={
        <>
          <Section title="Algorithms" description="Every selected digest is computed in one pass over the file">
            <div className="space-y-2.5">
              {ALGORITHMS.map((algorithm) => (
                <div key={algorithm.id} className="flex items-center justify-between gap-2">
                  <Checkbox
                    checked={selected.includes(algorithm.id)}
                    onCheckedChange={(on) => toggle(algorithm.id, on)}
                    label={algorithm.label}
                  />
                  {!algorithm.secure && <Badge tone="warn">not for security</Badge>}
                </div>
              ))}
              {selected.length === 0 && (
                <p className="text-[11.5px] text-danger">Choose at least one algorithm.</p>
              )}
            </div>
          </Section>

          <Section
            title="Verify"
            description="Paste the hash a download page gave you"
            actions={<Switch checked={verifyMode} onCheckedChange={setVerifyMode} label="Verify mode" />}
          >
            {verifyMode ? (
              <div className="space-y-2">
                <Textarea
                  value={expected}
                  onChange={(e) => setExpected(e.target.value)}
                  rows={4}
                  spellCheck={false}
                  placeholder={'e3b0c44298fc1c14…\nor: e3b0c442…  app.dmg'}
                  className="w-full break-all"
                />
                <p className="text-[11.5px] text-ink-faint">
                  A bare hash is checked against every file. Lines in <span className="font-mono">shasum</span> or BSD
                  form are matched to the file they name. Case and spacing do not matter.
                </p>
              </div>
            ) : (
              <p className="text-[12.5px] text-ink-faint">
                Turn this on to compare the result against a published checksum and get a plain yes or no.
              </p>
            )}
          </Section>

          <ToolActions
            run={run}
            onRun={() => void execute()}
            label={files.files.length > 1 ? `Hash ${files.files.length} files` : 'Hash file'}
            icon="Fingerprint"
            disabled={files.isEmpty || selected.length === 0}
            disabledReason={files.isEmpty ? 'Add at least one file first.' : 'Choose at least one algorithm.'}
          />

          {rows && rows.length > 0 && checksumTarget && (
            <Section title="Checksum file" description="shasum-compatible, one line per file">
              <div className="space-y-2.5">
                <Field label="Algorithm">
                  <Select
                    value={checksumTarget}
                    onChange={(e) => setChecksumAlgorithm(e.target.value as AlgorithmId)}
                    options={selected.map((id) => ({
                      value: id,
                      label: ALGORITHMS.find((a) => a.id === id)?.label ?? id,
                    }))}
                  />
                </Field>
                <div className="flex gap-2">
                  <CopyButton size="sm" label="Copy" value={checksumText} disabled={!checksumText} />
                  <Button
                    size="sm"
                    icon="Download"
                    disabled={!checksumText}
                    onClick={() => void saveTextAs(checksumText, `checksums.${checksumTarget}`)}
                  >
                    Save file
                  </Button>
                </div>
              </div>
            </Section>
          )}

          <Section title="Selection">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Files" value={files.files.length} />
              <Stat label="On disk" value={formatBytes(files.totalSize)} />
            </div>
          </Section>
        </>
      }
    />
  );
}
