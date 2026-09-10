import { useEffect, useMemo, useState } from 'react';
import { formatBytes } from '@/core/format';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import { ErrorDisplay, FileDropZone, ToolActions, ToolShell } from '@/components/tool';
import {
  Alert,
  Badge,
  CopyButton,
  Field,
  Icon,
  Section,
  Select,
  Textarea,
} from '@/components/ui';
import {
  ALGORITHMS,
  algorithmForDigest,
  algorithmLabel,
  checksumFileText,
  digestOf,
  extractDigest,
  firstDifference,
  groupDigest,
  matchingFile,
  verdictFor,
  type Algorithm,
  type FileHashes,
} from './logic';

export default function Checksum() {
  const files = useToolFiles({ filterName: 'Files' });
  const run = useToolRun('files/hash', 'Checksum');

  const [algorithm, setAlgorithm] = useState<Algorithm>('sha256');
  const [expected, setExpected] = useState('');
  const [results, setResults] = useState<FileHashes[]>([]);

  const pathsKey = files.paths.join('\n');
  useEffect(() => {
    setResults([]);
  }, [pathsKey, algorithm]);

  const expectedDigest = useMemo(() => extractDigest(expected), [expected]);
  const matched = useMemo(
    () => matchingFile(results, algorithm, expectedDigest),
    [results, algorithm, expectedDigest],
  );

  const onExpectedChange = (value: string) => {
    setExpected(value);
    // The length of a pasted digest already says which algorithm to use.
    const detected = algorithmForDigest(extractDigest(value));
    if (detected && detected !== algorithm) setAlgorithm(detected);
  };

  const execute = async () => {
    const computed = await run.executeRaw<FileHashes[]>({
      command: 'hash_files',
      total: files.files.length,
      inputs: files.paths,
      label: `${algorithmLabel(algorithm)} of ${files.files.length} file${files.files.length === 1 ? '' : 's'}`,
      args: { inputs: files.paths, algorithms: [algorithm] },
    });
    if (computed) setResults(computed);
  };

  const single = results.length === 1 ? results[0] : null;
  const singleDigest = single ? digestOf(single, algorithm) : null;
  const diffAt = expectedDigest && singleDigest ? firstDifference(expectedDigest, singleDigest) : -1;

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop the file you downloaded"
            hint="Any type and any size — the file is streamed, never loaded into memory."
            allowFolders
          />

          <Section
            title="Expected checksum"
            description="Paste what the publisher printed next to the download."
          >
            <Textarea
              value={expected}
              onChange={(e) => onExpectedChange(e.target.value)}
              placeholder="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  ubuntu-24.04.iso"
              className="min-h-20 text-[12.5px]"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {expectedDigest ? (
                <>
                  <Badge tone="accent">{algorithmLabel(algorithm)} detected</Badge>
                  <span className="text-[11.5px] text-ink-faint">
                    {expectedDigest.length} hex characters — extra text like the file name is ignored.
                  </span>
                </>
              ) : expected.trim() ? (
                <span className="text-[11.5px] text-danger">
                  That is not a checksum. MD5, SHA-1, SHA-256 and SHA-512 digests are 32, 40, 64 or 128 hexadecimal
                  characters.
                </span>
              ) : (
                <span className="text-[11.5px] text-ink-faint">
                  Leave this empty to simply read the file’s checksum instead of comparing it.
                </span>
              )}
            </div>
          </Section>

          {run.error && <ErrorDisplay error={run.error} onRetry={() => void execute()} />}

          {results.length > 0 && expectedDigest && (
            <Section title="Verdict">
              {matched ? (
                <Alert tone="success" title={`It matches — ${matched.name} is exactly the published file.`}>
                  Every byte agrees with the {algorithmLabel(algorithm)} checksum you pasted. The download is complete
                  and has not been altered on its way to you.
                </Alert>
              ) : (
                <Alert tone="danger" title="No match.">
                  {results.length === 1
                    ? 'This file is not the one that checksum describes. Most often the download was interrupted or you are comparing against a different version — download it again and check once more. If it still differs, do not open it.'
                    : `None of the ${results.length} files match that checksum. Check you pasted the checksum for the right version, or download the file again.`}
                </Alert>
              )}

              {single && singleDigest && (
                <div className="mt-3 space-y-2 rounded-lg border border-line p-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-ink-faint">Expected</p>
                    <p className="selectable break-all font-mono text-[12px] text-ink-soft">
                      {groupDigest(expectedDigest)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-ink-faint">This file</p>
                    <p
                      className={`selectable break-all font-mono text-[12px] ${
                        diffAt === -1 ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {groupDigest(singleDigest)}
                    </p>
                  </div>
                  {diffAt >= 0 && (
                    <p className="text-[11.5px] text-ink-faint">
                      The two digests already differ at character {diffAt + 1}.
                    </p>
                  )}
                </div>
              )}
            </Section>
          )}

          {results.length > 0 && (
            <Section
              title={`${algorithmLabel(algorithm)} checksums`}
              description={`${results.length} file${results.length === 1 ? '' : 's'}`}
              actions={
                <CopyButton
                  value={() => checksumFileText(results, algorithm)}
                  label="Copy all"
                  size="sm"
                />
              }
            >
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                {results.map((result) => {
                  const digest = digestOf(result, algorithm);
                  const verdict = verdictFor(result, algorithm, expectedDigest);
                  return (
                    <li key={result.path} className="space-y-1 bg-panel px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Icon
                          name={verdict === 'match' ? 'CircleCheck' : verdict === 'mismatch' ? 'CircleAlert' : 'File'}
                          size={14}
                          className={
                            verdict === 'match'
                              ? 'shrink-0 text-success'
                              : verdict === 'mismatch'
                                ? 'shrink-0 text-danger'
                                : 'shrink-0 text-ink-faint'
                          }
                        />
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink" title={result.path}>
                          {result.name}
                        </span>
                        {verdict === 'match' && <Badge tone="success">Match</Badge>}
                        {verdict === 'mismatch' && <Badge tone="danger">Different</Badge>}
                        <span className="shrink-0 text-[11.5px] text-ink-faint">{formatBytes(result.size)}</span>
                        <CopyButton value={digest ?? ''} label="Copy" size="sm" variant="ghost" disabled={!digest} />
                      </div>
                      <p className="selectable break-all pl-6 font-mono text-[11.5px] text-ink-soft">{digest ?? '—'}</p>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}
        </>
      }
      aside={
        <>
          <Section title="Algorithm">
            <Field hint={ALGORITHMS.find((a) => a.value === algorithm)?.note}>
              <Select
                value={algorithm}
                onChange={(e) => setAlgorithm(e.target.value as Algorithm)}
                options={ALGORITHMS.map((a) => ({ value: a.value, label: `${a.label} · ${a.length} characters` }))}
              />
            </Field>
            <p className="mt-2 text-[11.5px] text-ink-faint">
              Pasting a checksum above picks the matching algorithm automatically.
            </p>
          </Section>

          <ToolActions
            run={run}
            onRun={() => void execute()}
            label={expectedDigest ? 'Verify' : 'Compute checksum'}
            icon="ShieldCheck"
            disabled={files.isEmpty}
            disabledReason="Add the file you want to check first."
          />

          <Section title="Why this matters">
            <p className="text-[12px] leading-[1.55] text-ink-faint">
              A checksum is a fingerprint of the exact bytes of a file. If the digest computed here is identical to the
              one the publisher printed, your copy is byte-for-byte theirs — no truncated download, no corrupted disk,
              no substituted installer. A single differing byte changes the digest completely, so there is no such thing
              as “almost matching”.
            </p>
          </Section>
        </>
      }
    />
  );
}
