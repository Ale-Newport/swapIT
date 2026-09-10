import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { useEffect, useMemo, useRef, useState } from 'react';
import { asToolboxError } from '@/core/bridge';
import { formatRelative } from '@/core/format';
import { useSettings } from '@/core/settings';
import { ToolShell } from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  Icon,
  IconButton,
  Input,
  Section,
  Switch,
} from '@/components/ui';
import {
  MAX_ENTRIES,
  STORAGE_KEY,
  type ClipEntry,
  describeText,
  filterEntries,
  parseStored,
  previewOf,
  recordEntry,
  sortForDisplay,
} from './logic';

/** Fast enough to feel live, slow enough to be invisible. */
const POLL_MS = 1200;

function loadStored(): ClipEntry[] {
  try {
    return parseStored(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

function persist(entries: ClipEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* storage full or unavailable — the list stays in memory for this session */
  }
}

export default function ClipboardHistory() {
  const enabled = useSettings((s) => s.settings.clipboardHistory);
  const updateSettings = useSettings((s) => s.update);

  const [entries, setEntries] = useState<ClipEntry[]>(loadStored);
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [copyProblem, setCopyProblem] = useState<string | null>(null);

  /**
   * The last text the poller took off the clipboard, remembered separately from
   * the list. Deleting an entry records its text here too, so a deliberate
   * delete is not undone a second later by the clipboard still holding it.
   */
  const lastSeen = useRef<string | null>(null);

  // Watch the clipboard only while the tool is open and recording is switched on.
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let reading = false;
    const tick = async () => {
      if (stopped || reading) return;
      reading = true;
      try {
        const text = await readText();
        if (!stopped && typeof text === 'string' && text !== lastSeen.current) {
          lastSeen.current = text;
          setEntries((current) => recordEntry(current, text, Date.now(), crypto.randomUUID()));
        }
      } catch {
        // An image, a file or an empty clipboard — nothing to record, not a failure.
      } finally {
        reading = false;
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  useEffect(() => {
    persist(entries);
  }, [entries]);

  useEffect(() => {
    if (!copiedId) return;
    const t = setTimeout(() => setCopiedId(null), 1400);
    return () => clearTimeout(t);
  }, [copiedId]);

  useEffect(() => {
    if (!confirmClear) return;
    const t = setTimeout(() => setConfirmClear(false), 4000);
    return () => clearTimeout(t);
  }, [confirmClear]);

  const shown = useMemo(() => sortForDisplay(filterEntries(entries, query)), [entries, query]);
  const pinnedCount = entries.filter((e) => e.pinned).length;

  const copyBack = async (entry: ClipEntry) => {
    try {
      // lastSeen is deliberately left alone: the next poll moves this entry back
      // to the top, which is the behaviour described in "How the list behaves".
      await writeText(entry.text);
      setCopyProblem(null);
      setCopiedId(entry.id);
    } catch (err) {
      setCopiedId(null);
      setCopyProblem(asToolboxError(err).message);
    }
  };

  const togglePin = (id: string) =>
    setEntries((current) => current.map((e) => (e.id === id ? { ...e, pinned: !e.pinned } : e)));

  /** Forget text on the way out, so the poller does not put it straight back. */
  const forget = (text: string | undefined) => {
    if (text) lastSeen.current = text;
  };

  const remove = (id: string) => {
    forget(entries.find((e) => e.id === id)?.text);
    setEntries((current) => current.filter((e) => e.id !== id));
  };

  const clearAll = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    forget(entries[0]?.text);
    setEntries([]);
    setConfirmClear(false);
  };

  if (!enabled) {
    return (
      <ToolShell
        main={
          <Section title="Clipboard history is off">
            <div className="space-y-3">
              <p className="text-[12.5px] leading-[1.6] text-ink-soft">
                When this is on, Toolbox checks the clipboard about once a second while this tool is open
                and keeps the last {MAX_ENTRIES} things you copied, so you can find that link, code or
                address again. Nothing is recorded while it is off, and nothing is recorded while you are
                on another Toolbox page.
              </p>
              <Alert tone="info" title="Where the list lives">
                On this Mac only, in this app&apos;s own local storage. It is never uploaded, never synced
                and never leaves the machine — and you can switch recording off again whenever you like.
              </Alert>
              <Field
                inline
                label="Record clipboard history"
                hint="You can turn this off again here or in Settings"
              >
                <Switch
                  checked={false}
                  onCheckedChange={() => void updateSettings({ clipboardHistory: true })}
                  label="Record clipboard history"
                />
              </Field>
              {entries.length > 0 && (
                <Alert
                  tone="warn"
                  title={`${entries.length} entr${entries.length === 1 ? 'y is' : 'ies are'} still stored from before.`}
                  action={
                    <Button
                      size="sm"
                      variant="danger"
                      icon="Trash2"
                      onClick={() => {
                        forget(entries[0]?.text);
                        setEntries([]);
                        persist([]);
                      }}
                    >
                      Delete them
                    </Button>
                  }
                >
                  They stay on this Mac until you delete them or switch recording back on to see them.
                </Alert>
              )}
            </div>
          </Section>
        }
      />
    );
  }

  return (
    <ToolShell
      main={
        <Section
          title="Copied here"
          description={
            <>
              {entries.length} of {MAX_ENTRIES} kept
              {pinnedCount > 0 && ` · ${pinnedCount} pinned`}
              {query && ` · ${shown.length} matching`}
            </>
          }
          actions={
            <>
              <div className="w-48">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search history…"
                  aria-label="Search clipboard history"
                />
              </div>
              <Button
                size="sm"
                variant={confirmClear ? 'danger' : 'ghost'}
                icon="Trash2"
                disabled={entries.length === 0}
                onClick={clearAll}
              >
                {confirmClear ? 'Delete everything?' : 'Clear all'}
              </Button>
            </>
          }
        >
          {copyProblem && (
            <Alert tone="danger" className="mb-3" title="That entry could not be put on the clipboard.">
              {copyProblem} Another app may be holding the clipboard — try again in a moment.
            </Alert>
          )}
          {entries.length === 0 ? (
            <EmptyState
              icon="Clipboard"
              title="Nothing copied yet"
              description="Copy some text anywhere on your Mac and it shows up here within a second or two. Keep this tab open while you work."
            />
          ) : shown.length === 0 ? (
            <EmptyState
              icon="SearchX"
              title="Nothing matches that search"
              description={`No copied text contains “${query}”.`}
              action={
                <Button size="sm" onClick={() => setQuery('')}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2">
              {shown.map((entry) => {
                const { preview, truncated } = previewOf(entry.text);
                const facts = describeText(entry.text);
                return (
                  <li
                    key={entry.id}
                    className="group rounded-lg border border-line bg-panel px-3 py-2.5 transition-colors hover:border-line-strong"
                  >
                    <div className="flex items-start gap-3">
                      <pre className="selectable min-w-0 flex-1 whitespace-pre-wrap break-words font-sans text-[12.5px] leading-[1.55] text-ink">
                        {preview}
                        {truncated && <span className="text-ink-faint">…</span>}
                      </pre>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          size="sm"
                          variant={copiedId === entry.id ? 'subtle' : 'secondary'}
                          icon={copiedId === entry.id ? 'Check' : 'Copy'}
                          onClick={() => void copyBack(entry)}
                        >
                          {copiedId === entry.id ? 'Copied' : 'Copy'}
                        </Button>
                        <IconButton
                          icon={entry.pinned ? 'PinOff' : 'Pin'}
                          label={entry.pinned ? 'Unpin this entry' : 'Pin this entry so it is never dropped'}
                          size="sm"
                          className={entry.pinned ? 'text-ink' : 'opacity-0 group-hover:opacity-100'}
                          onClick={() => togglePin(entry.id)}
                        />
                        <IconButton
                          icon="X"
                          label="Delete this entry"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100"
                          onClick={() => remove(entry.id)}
                        />
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
                      <span>{formatRelative(entry.at)}</span>
                      <span>·</span>
                      <span>{facts.characters.toLocaleString()} characters</span>
                      {facts.lines > 1 && (
                        <>
                          <span>·</span>
                          <span>{facts.lines.toLocaleString()} lines</span>
                        </>
                      )}
                      {entry.pinned && <Badge tone="accent">Pinned</Badge>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      }
      aside={
        <>
          <Section title="Recording">
            <div className="space-y-3">
              <Field inline label="Record clipboard history" hint={`Checked every ${POLL_MS / 1000} seconds`}>
                <Switch
                  checked
                  onCheckedChange={() => void updateSettings({ clipboardHistory: false })}
                  label="Record clipboard history"
                />
              </Field>
              <p className="text-[12px] leading-[1.6] text-ink-soft">
                Recording only happens while this tool is open. Leave the page, close Toolbox, or turn the
                switch off and nothing further is recorded.
              </p>
              <p className="flex items-start gap-1.5 text-[11.5px] text-ink-faint">
                <Icon name="ShieldCheck" size={13} className="mt-[1px] shrink-0" />
                The list is stored only on this Mac, in this app&apos;s local storage. It is never uploaded
                or synced, and you can delete it at any time.
              </p>
            </div>
          </Section>

          <Section title="How the list behaves">
            <ul className="space-y-1.5 text-[12px] leading-[1.55] text-ink-soft">
              <li className="flex gap-2">
                <Icon name="Pin" size={13} className="mt-[2px] shrink-0 text-ink-faint" />
                Pinned entries are never dropped to make room for new copies.
              </li>
              <li className="flex gap-2">
                <Icon name="History" size={13} className="mt-[2px] shrink-0 text-ink-faint" />
                Copying the same text again moves it back to the top instead of adding a duplicate.
              </li>
              <li className="flex gap-2">
                <Icon name="Image" size={13} className="mt-[2px] shrink-0 text-ink-faint" />
                Only text is recorded. Copied images and files are ignored.
              </li>
            </ul>
          </Section>
        </>
      }
    />
  );
}
