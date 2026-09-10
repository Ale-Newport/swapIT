import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ToolShell } from '@/components/tool';
import { Alert, Badge, Button, CopyButton, Field, Input, Section, Stat, Textarea } from '@/components/ui';
import {
  FLAGS,
  MAX_MATCHES,
  MAX_TEST_LENGTH,
  applyReplacement,
  compileRegex,
  findMatches,
  highlightSegments,
  matchStats,
  type MatchInfo,
} from './logic';

const SAMPLE_PATTERN = '(?<user>[\\w.+-]+)@(?<domain>[\\w-]+\\.[\\w.]+)';
const SAMPLE_TEXT = `Contact ada@example.com or grace.hopper+navy@navy.mil.
Old address: turing@bletchley.example.org (retired 1954)
Not an address: @example.com, hello@, plain text.`;

/**
 * Every entry is a list of tokens that each get their own button, so a click
 * always appends one usable token — never a documentation pair with a space in
 * the middle, which would silently match that space.
 */
const CHEATSHEET: Array<{ group: string; items: Array<{ tokens: string[]; meaning: string }> }> = [
  {
    group: 'Characters',
    items: [
      { tokens: ['.'], meaning: 'any character except newline' },
      { tokens: ['\\d', '\\D'], meaning: 'digit / not a digit' },
      { tokens: ['\\w', '\\W'], meaning: 'word character / not one' },
      { tokens: ['\\s', '\\S'], meaning: 'whitespace / not whitespace' },
      { tokens: ['\\b'], meaning: 'word boundary' },
      { tokens: ['\\n', '\\t'], meaning: 'newline, tab' },
    ],
  },
  {
    group: 'Quantifiers',
    items: [
      { tokens: ['*'], meaning: '0 or more' },
      { tokens: ['+'], meaning: '1 or more' },
      { tokens: ['?'], meaning: '0 or 1' },
      { tokens: ['{2,5}'], meaning: 'between 2 and 5' },
      { tokens: ['+?'], meaning: 'lazy — as few as possible' },
    ],
  },
  {
    group: 'Groups',
    items: [
      { tokens: ['(abc)'], meaning: 'capturing group' },
      { tokens: ['(?:abc)'], meaning: 'non-capturing' },
      { tokens: ['(?<name>abc)'], meaning: 'named group' },
      { tokens: ['a|b'], meaning: 'either a or b' },
      { tokens: ['[a-z]'], meaning: 'character class' },
      { tokens: ['[^a-z]'], meaning: 'negated class' },
    ],
  },
  {
    group: 'Anchors & lookaround',
    items: [
      { tokens: ['^', '$'], meaning: 'start / end' },
      { tokens: ['(?=a)'], meaning: 'followed by a' },
      { tokens: ['(?!a)'], meaning: 'not followed by a' },
      { tokens: ['(?<=a)'], meaning: 'preceded by a' },
      { tokens: ['(?<!a)'], meaning: 'not preceded by a' },
    ],
  },
];

function GroupChips({ match }: { match: MatchInfo }) {
  if (match.groups.length === 0) return <span className="text-[11.5px] text-ink-faint">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {match.groups.map((group) => (
        <span
          key={group.index}
          className="inline-flex items-center gap-1 rounded-md bg-ink/6 px-1.5 py-[1px] font-mono text-[11px] text-ink-soft"
          title={group.name ? `Named group "${group.name}"` : `Group ${group.index}`}
        >
          <span className="text-ink-faint">{group.name ?? group.index}</span>
          {group.value === undefined ? (
            <span className="italic text-ink-faint">undefined</span>
          ) : (
            <span className="text-ink">{group.value === '' ? '(empty)' : group.value}</span>
          )}
        </span>
      ))}
    </div>
  );
}

export default function RegexTester() {
  const [pattern, setPattern] = useState(SAMPLE_PATTERN);
  const [flags, setFlags] = useState('gi');
  const [test, setTest] = useState(SAMPLE_TEXT);
  const [replacement, setReplacement] = useState('$<user> at $<domain>');

  const oversized = test.length > MAX_TEST_LENGTH;
  const subject = oversized ? test.slice(0, MAX_TEST_LENGTH) : test;

  const compiled = useMemo(() => {
    try {
      return { regex: compileRegex(pattern, flags), error: null as string | null };
    } catch (err) {
      return { regex: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [pattern, flags]);

  const report = useMemo(
    () => (compiled.regex ? findMatches(compiled.regex, subject) : { matches: [], truncated: false }),
    [compiled.regex, subject],
  );

  const segments = useMemo(() => highlightSegments(subject, report.matches), [subject, report.matches]);
  const stats = useMemo(() => matchStats(report.matches, subject.length), [report.matches, subject.length]);

  const replaced = useMemo(() => {
    if (!compiled.regex) return '';
    try {
      return applyReplacement(compiled.regex, subject, replacement);
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }, [compiled.regex, subject, replacement]);

  const toggleFlag = (flag: string) =>
    setFlags((current) => (current.includes(flag) ? current.replace(flag, '') : current + flag));

  return (
    <ToolShell
      main={
        <>
          <Section
            title="Pattern"
            actions={<CopyButton value={() => `/${pattern}/${flags}`} label="Copy /…/" size="sm" variant="ghost" />}
          >
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[15px] text-ink-faint">/</span>
              <Input
                value={pattern}
                spellCheck={false}
                autoComplete="off"
                placeholder="\\d{4}-\\d{2}-\\d{2}"
                onChange={(e) => setPattern(e.target.value)}
                className="font-mono text-[13.5px]"
              />
              <span className="font-mono text-[15px] text-ink-faint">/{flags}</span>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {FLAGS.map((f) => {
                const on = flags.includes(f.flag);
                return (
                  <button
                    key={f.flag}
                    type="button"
                    title={f.hint}
                    onClick={() => toggleFlag(f.flag)}
                    className={clsx(
                      'rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors',
                      on
                        ? 'border-ink bg-ink text-panel'
                        : 'border-line bg-panel text-ink-soft hover:border-line-strong hover:text-ink',
                    )}
                  >
                    <span className="font-mono">{f.flag}</span> {f.label}
                  </button>
                );
              })}
            </div>

            {compiled.error && (
              <Alert tone="danger" className="mt-3" title="The pattern will not compile">
                {compiled.error}
              </Alert>
            )}
          </Section>

          <Section
            title="Test string"
            actions={
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPattern(SAMPLE_PATTERN);
                    setFlags('gi');
                    setTest(SAMPLE_TEXT);
                    setReplacement('$<user> at $<domain>');
                  }}
                >
                  Sample
                </Button>
                <Button size="sm" variant="ghost" icon="X" onClick={() => setTest('')}>
                  Clear
                </Button>
              </>
            }
          >
            <Textarea
              value={test}
              rows={7}
              placeholder="Paste the text you want to match against…"
              onChange={(e) => setTest(e.target.value)}
            />
            {oversized && (
              <Alert tone="warn" className="mt-2">
                Only the first {MAX_TEST_LENGTH.toLocaleString()} characters are tested — a longer string can freeze the
                window on a backtracking pattern.
              </Alert>
            )}

            <p className="mt-3 mb-1.5 text-[12px] font-medium text-ink-soft">Highlighted</p>
            <div className="max-h-72 overflow-auto rounded-lg border border-line bg-canvas p-3">
              {subject === '' ? (
                <p className="text-[12.5px] text-ink-faint">Type a test string to see the matches.</p>
              ) : (
                <p className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-[1.65] text-ink selectable">
                  {segments.map((segment, i) =>
                    segment.match === null ? (
                      <span key={i}>{segment.text}</span>
                    ) : (
                      <mark
                        key={i}
                        title={`Match ${segment.match + 1}`}
                        className={clsx(
                          'rounded-[3px] px-[1px]',
                          segment.match % 2 === 0 ? 'bg-accent-soft text-accent' : 'bg-warn-soft text-warn',
                        )}
                      >
                        {segment.text}
                      </mark>
                    ),
                  )}
                </p>
              )}
            </div>
          </Section>

          <Section
            title="Matches"
            actions={
              <>
                {report.truncated && <Badge tone="warn">first {MAX_MATCHES.toLocaleString()}</Badge>}
                <Badge tone={stats.count > 0 ? 'success' : 'neutral'}>
                  {stats.count} match{stats.count === 1 ? '' : 'es'}
                </Badge>
              </>
            }
          >
            {report.matches.length === 0 ? (
              <p className="text-[12.5px] text-ink-faint">
                {compiled.error ? 'Fix the pattern to see matches.' : 'Nothing matched this pattern yet.'}
              </p>
            ) : (
              <div className="max-h-96 overflow-auto rounded-lg border border-line">
                <div className="flex items-center gap-3 border-b border-line bg-canvas px-3 py-1.5">
                  <span className="w-8 shrink-0 text-[11px] uppercase tracking-wide text-ink-faint">#</span>
                  <span className="w-14 shrink-0 text-[11px] uppercase tracking-wide text-ink-faint">Index</span>
                  <span className="w-[32%] shrink-0 text-[11px] uppercase tracking-wide text-ink-faint">Match</span>
                  <span className="flex-1 text-[11px] uppercase tracking-wide text-ink-faint">Groups</span>
                </div>
                {report.matches.map((match, i) => (
                  <div
                    key={`${match.index}-${i}`}
                    className="flex items-start gap-3 border-b border-line px-3 py-2 last:border-b-0"
                  >
                    <span className="w-8 shrink-0 font-mono text-[11.5px] text-ink-faint">{i + 1}</span>
                    <span className="w-14 shrink-0 font-mono text-[11.5px] text-ink-faint tabular-nums">
                      {match.index}
                    </span>
                    <span className="w-[32%] shrink-0 break-all font-mono text-[12px] text-ink selectable">
                      {match.text === '' ? <span className="italic text-ink-faint">(empty)</span> : match.text}
                    </span>
                    <span className="min-w-0 flex-1">
                      <GroupChips match={match} />
                    </span>
                  </div>
                ))}
              </div>
            )}
            {report.matches.length > 0 && (
              <div className="mt-2 flex justify-end">
                <CopyButton
                  value={() => report.matches.map((m) => m.text).join('\n')}
                  label="Copy matches"
                  size="sm"
                  variant="ghost"
                />
              </div>
            )}
          </Section>

          <Section
            title="Replace"
            description="$1 for a numbered group, $<name> for a named one, $& for the whole match"
            actions={<CopyButton value={() => replaced} size="sm" variant="ghost" disabled={!replaced} />}
          >
            <Field label="Replacement">
              <Input
                value={replacement}
                spellCheck={false}
                autoComplete="off"
                placeholder="$1"
                onChange={(e) => setReplacement(e.target.value)}
                className="font-mono"
              />
            </Field>
            <p className="mt-2.5 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-canvas p-3 font-mono text-[12.5px] leading-[1.65] text-ink selectable">
              {compiled.error ? (
                <span className="text-ink-faint">Fix the pattern to preview the replacement.</span>
              ) : (
                replaced || <span className="text-ink-faint">The result appears here.</span>
              )}
            </p>
          </Section>
        </>
      }
      aside={
        <>
          <Section title="Stats">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Stat label="Matches" value={stats.count.toLocaleString()} />
              <Stat label="Unique" value={stats.unique.toLocaleString()} />
              <Stat label="Coverage" value={`${stats.coverage}%`} hint="of the test string" />
              <Stat label="Characters" value={test.length.toLocaleString()} />
            </div>
          </Section>

          <Section title="Cheat sheet">
            <div className="space-y-3">
              {CHEATSHEET.map((section) => (
                <div key={section.group}>
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-ink-faint">{section.group}</p>
                  <div className="space-y-1">
                    {section.items.map((item) => (
                      <div key={item.tokens.join(' ')} className="flex items-baseline gap-2">
                        <span className="flex w-[86px] shrink-0 flex-wrap items-baseline gap-x-0.5">
                          {item.tokens.map((token) => (
                            <button
                              key={token}
                              type="button"
                              title={`Insert ${token}`}
                              onClick={() => setPattern((p) => p + token)}
                              className="rounded px-1 text-left font-mono text-[11.5px] text-ink hover:bg-ink/6"
                            >
                              {token}
                            </button>
                          ))}
                        </span>
                        <span className="min-w-0 flex-1 text-[11.5px] text-ink-faint">{item.meaning}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </>
      }
    />
  );
}
