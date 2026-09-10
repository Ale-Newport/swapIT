import { useEffect, useMemo, useState } from 'react';
import { asToolboxError, call } from '@/core/bridge';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  ErrorDisplay,
  FileDropZone,
  PresetRow,
  ResultPanel,
  ToolActions,
  ToolShell,
} from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Field,
  Icon,
  IconButton,
  Input,
  NumberInput,
  Section,
  Segmented,
  Switch,
} from '@/components/ui';
import {
  PRESETS,
  RULE_LABELS,
  RULE_ORDER,
  activeRules,
  countChanged,
  countConflicts,
  defaultRule,
  describeRule,
  isEffective,
  keyed,
  moveRule,
  type KeyedRule,
  type RenamePreview,
  type RenameRule,
  type RuleType,
} from './logic';

const MAX_PREVIEW_ROWS = 300;

function RuleFields({ rule, onChange }: { rule: RenameRule; onChange: (rule: RenameRule) => void }) {
  switch (rule.type) {
    case 'prefix':
    case 'suffix':
      return (
        <Field label="Text" hint={rule.type === 'prefix' ? 'Goes before the name' : 'Goes after the name'}>
          <Input
            value={rule.text}
            placeholder={rule.type === 'prefix' ? 'IMG_' : '_final'}
            onChange={(e) => onChange({ ...rule, text: e.target.value })}
          />
        </Field>
      );
    case 'replace':
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Find">
              <Input
                value={rule.find}
                placeholder="draft"
                onChange={(e) => onChange({ ...rule, find: e.target.value })}
              />
            </Field>
            <Field label="Replace with" hint="Leave empty to delete it">
              <Input
                value={rule.replace}
                placeholder="final"
                onChange={(e) => onChange({ ...rule, replace: e.target.value })}
              />
            </Field>
          </div>
          <Checkbox
            checked={rule.all}
            onCheckedChange={(all) => onChange({ ...rule, all })}
            label="Replace every occurrence"
          />
        </div>
      );
    case 'regex':
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pattern" hint="Rust regex syntax">
            <Input
              value={rule.pattern}
              placeholder="^DSC_(\d+)"
              className="font-mono"
              spellCheck={false}
              onChange={(e) => onChange({ ...rule, pattern: e.target.value })}
            />
          </Field>
          <Field label="Replace with" hint="$1 is the first group">
            <Input
              value={rule.replace}
              placeholder="photo-$1"
              className="font-mono"
              spellCheck={false}
              onChange={(e) => onChange({ ...rule, replace: e.target.value })}
            />
          </Field>
        </div>
      );
    case 'sequence':
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Start at">
              <NumberInput
                value={rule.start}
                min={0}
                max={1_000_000}
                onValueChange={(start) => onChange({ ...rule, start: Math.max(0, Math.round(start)) })}
              />
            </Field>
            <Field label="Digits">
              <NumberInput
                value={rule.padding}
                min={1}
                max={9}
                onValueChange={(padding) => onChange({ ...rule, padding: Math.min(9, Math.max(1, Math.round(padding))) })}
              />
            </Field>
            <Field label="Separator">
              <Input
                value={rule.separator}
                placeholder="_"
                onChange={(e) => onChange({ ...rule, separator: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Where" hint="Numbers follow the order of the list above.">
            <Segmented
              value={rule.position}
              onChange={(position) => onChange({ ...rule, position })}
              options={[
                { value: 'prefix', label: 'Before the name' },
                { value: 'suffix', label: 'After the name' },
              ]}
              className="w-full"
            />
          </Field>
        </div>
      );
    case 'case':
      return (
        <Field label="Style">
          <Segmented
            value={rule.mode}
            onChange={(mode) => onChange({ ...rule, mode })}
            options={[
              { value: 'lower', label: 'lower' },
              { value: 'upper', label: 'UPPER' },
              { value: 'title', label: 'Title' },
            ]}
            className="w-full"
          />
        </Field>
      );
    case 'removeChars':
      return (
        <Field label="Characters to delete" hint="Every one of these disappears from the name">
          <Input
            value={rule.chars}
            placeholder="#()[]"
            className="font-mono"
            spellCheck={false}
            onChange={(e) => onChange({ ...rule, chars: e.target.value })}
          />
        </Field>
      );
    case 'changeExtension':
      return (
        <Field label="New extension" hint="The file is not converted — only its name changes.">
          <Input
            value={rule.ext}
            placeholder="jpg"
            className="font-mono"
            spellCheck={false}
            onChange={(e) => onChange({ ...rule, ext: e.target.value })}
          />
        </Field>
      );
    case 'slugify':
    case 'transliterate':
      return null;
  }
}

export default function BatchRename() {
  const files = useToolFiles({ filterName: 'Files', recursive: false });
  const run = useToolRun('files/batch-rename', 'Batch Rename');

  const [rules, setRules] = useState<KeyedRule[]>([]);
  const [copyInstead, setCopyInstead] = useState(false);
  const [adding, setAdding] = useState(false);
  const [previews, setPreviews] = useState<RenamePreview[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const sending = useMemo(() => activeRules(rules), [rules]);
  const rulesJson = useMemo(() => JSON.stringify(sending), [sending]);
  const inputs = files.paths;

  useEffect(() => {
    const parsed = JSON.parse(rulesJson) as RenameRule[];
    if (inputs.length === 0 || parsed.length === 0) {
      setPreviews([]);
      setPreviewError(null);
      setPreviewing(false);
      return;
    }
    let cancelled = false;
    setPreviewing(true);
    const timer = setTimeout(() => {
      call<RenamePreview[]>('preview_rename', { inputs, rules: parsed })
        .then((rows) => {
          if (cancelled) return;
          setPreviews(rows);
          setPreviewError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          setPreviews([]);
          setPreviewError(asToolboxError(err).message);
        })
        .finally(() => {
          if (!cancelled) setPreviewing(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [inputs, rulesJson]);

  const conflicts = countConflicts(previews);
  const changed = countChanged(previews);

  const addRule = (type: RuleType) => {
    setRules((current) => [...current, keyed(defaultRule(type))]);
    setAdding(false);
  };

  const updateRule = (key: string, rule: RenameRule) =>
    setRules((current) => current.map((r) => (r.key === key ? { ...r, rule } : r)));

  const removeRule = (key: string) => setRules((current) => current.filter((r) => r.key !== key));

  const blocked =
    files.isEmpty
      ? 'Add the files you want to rename first.'
      : sending.length === 0
        ? 'Add a rule — an empty rule list would change nothing.'
        : previewError
          ? 'Fix the rule above before renaming.'
          : conflicts > 0
            ? `${conflicts} file${conflicts === 1 ? '' : 's'} would collide with another name. Add numbering, or change the rules until no row is marked.`
            : changed === 0
              ? 'These rules leave every name exactly as it is.'
              : null;

  const count = files.files.length;
  const actionLabel = `${copyInstead ? 'Copy' : 'Rename'}${count ? ` ${count}` : ''} file${count === 1 ? '' : 's'}`;

  const execute = async () => {
    const batch = await run.execute({
      command: 'batch_rename',
      total: files.files.length,
      inputs: files.paths,
      label: `${copyInstead ? 'Copy' : 'Rename'} ${files.files.length} file${files.files.length === 1 ? '' : 's'}`,
      args: { inputs: files.paths, rules: sending, copyInstead },
    });
    // After a rename the old paths are gone; follow the files to their new names
    // so the preview and a second pass keep working.
    if (batch && !copyInstead) {
      const next = [...batch.results.map((r) => r.path), ...batch.failures.map((f) => f.path)];
      if (next.length > 0) await files.set(next);
    }
  };

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop the files to rename"
            hint="Any type. Dropping a folder adds the files directly inside it."
            allowFolders
            reorderable
          />

          <Section
            title="Rules"
            description="Applied top to bottom — drag the file list above to change the numbering order."
            actions={
              rules.length > 0 ? (
                <Button size="sm" variant="ghost" icon="X" onClick={() => setRules([])}>
                  Clear
                </Button>
              ) : undefined
            }
          >
            <div className="space-y-2.5">
              {rules.length === 0 && (
                <p className="text-[12.5px] text-ink-faint">
                  No rules yet. Start from a preset on the right, or add one below.
                </p>
              )}

              {rules.map((entry, index) => {
                const inert = !isEffective(entry.rule);
                return (
                  <div key={entry.key} className="rounded-lg border border-line bg-canvas">
                    <header className="flex items-center gap-2 px-3 py-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink/6 text-[11px] font-medium text-ink-soft">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium text-ink">{RULE_LABELS[entry.rule.type]}</p>
                        <p className="truncate text-[11.5px] text-ink-faint">{describeRule(entry.rule)}</p>
                      </div>
                      {inert && <Badge tone="warn">No effect yet</Badge>}
                      <IconButton
                        icon="ArrowUp"
                        label="Move up"
                        size="sm"
                        disabled={index === 0}
                        onClick={() => setRules((current) => moveRule(current, index, -1))}
                      />
                      <IconButton
                        icon="ArrowDown"
                        label="Move down"
                        size="sm"
                        disabled={index === rules.length - 1}
                        onClick={() => setRules((current) => moveRule(current, index, 1))}
                      />
                      <IconButton icon="X" label="Remove rule" size="sm" onClick={() => removeRule(entry.key)} />
                    </header>
                    {entry.rule.type !== 'slugify' && entry.rule.type !== 'transliterate' && (
                      <div className="border-t border-line px-3 py-2.5">
                        <RuleFields rule={entry.rule} onChange={(rule) => updateRule(entry.key, rule)} />
                      </div>
                    )}
                  </div>
                );
              })}

              {adding ? (
                <div className="rounded-lg border border-line bg-canvas p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[12px] font-medium text-ink-soft">Add a rule</span>
                    <IconButton icon="X" label="Close" size="sm" onClick={() => setAdding(false)} />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {RULE_ORDER.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => addRule(type)}
                        className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-left text-[12px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
                      >
                        {RULE_LABELS[type]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <Button size="sm" icon="Plus" onClick={() => setAdding(true)}>
                  Add a rule
                </Button>
              )}
            </div>
          </Section>

          <Section
            title="Preview"
            description={
              files.isEmpty
                ? 'Add files to see the new names.'
                : sending.length === 0
                  ? 'Add a rule to see the new names.'
                  : previewing
                    ? 'Working out the new names…'
                    : `${changed} of ${previews.length} name${previews.length === 1 ? '' : 's'} would change`
            }
            actions={
              conflicts > 0 ? <Badge tone="danger">{conflicts} conflict{conflicts === 1 ? '' : 's'}</Badge> : undefined
            }
          >
            {previewError ? (
              <Alert tone="danger" title="These rules cannot be applied.">
                {previewError}
              </Alert>
            ) : previews.length === 0 ? (
              <p className="py-4 text-center text-[12.5px] text-ink-faint">
                {files.isEmpty ? 'Nothing to preview yet.' : 'The new names appear here as you build the rules.'}
              </p>
            ) : (
              <>
                {conflicts > 0 && (
                  <Alert tone="danger" title="Some names would collide." className="mb-3">
                    Two files would end up with the same name, or the name is already taken in that folder. Adding a
                    numbering rule usually fixes it. Renaming stays blocked until every row is clear.
                  </Alert>
                )}
                <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                  {previews.slice(0, MAX_PREVIEW_ROWS).map((row) => (
                    <li
                      key={row.path}
                      className={`flex items-center gap-2 px-3 py-1.5 ${row.conflict ? 'bg-danger-soft' : 'bg-panel'}`}
                    >
                      <span
                        className={`min-w-0 flex-1 truncate text-[12px] ${row.conflict ? 'text-danger' : 'text-ink-faint'}`}
                        title={row.path}
                      >
                        {row.from}
                      </span>
                      <Icon
                        name="ArrowRight"
                        size={12}
                        className={row.conflict ? 'shrink-0 text-danger' : 'shrink-0 text-ink-faint'}
                      />
                      <span
                        className={`min-w-0 flex-1 truncate text-[12px] font-medium ${
                          row.conflict ? 'text-danger' : row.from === row.to ? 'text-ink-faint' : 'text-ink'
                        }`}
                        title={row.to}
                      >
                        {row.to}
                      </span>
                      {row.conflict && <Badge tone="danger">Conflict</Badge>}
                      {!row.conflict && row.from === row.to && <Badge>Unchanged</Badge>}
                    </li>
                  ))}
                </ul>
                {previews.length > MAX_PREVIEW_ROWS && (
                  <p className="mt-2 text-[11.5px] text-ink-faint">
                    Showing the first {MAX_PREVIEW_ROWS} of {previews.length} files — all of them are renamed.
                  </p>
                )}
              </>
            )}
          </Section>

          {run.error && <ErrorDisplay error={run.error} onRetry={() => void execute()} />}
          {run.result && (
            <ResultPanel result={run.result} onProcessAgain={run.reset} title={copyInstead ? 'Copied' : 'Renamed'} />
          )}
        </>
      }
      aside={
        <>
          <Section title="Presets" description="A starting point you can then edit.">
            <PresetRow
              presets={PRESETS.map((p) => ({ label: p.label, value: p.label, hint: p.hint }))}
              onSelect={(label) => {
                const preset = PRESETS.find((p) => p.label === label);
                // Built on click — the date preset reads the clock right now.
                if (preset) setRules(preset.rules().map((rule) => keyed(rule)));
              }}
            />
          </Section>

          <Section title="How to apply">
            <Field
              inline
              label="Copy instead of rename"
              hint={copyInstead ? 'Originals stay where they are' : 'The originals are renamed in place'}
            >
              <Switch checked={copyInstead} onCheckedChange={setCopyInstead} />
            </Field>
            <p className="mt-2 text-[11.5px] text-ink-faint">
              Files keep their folder either way — nothing is moved, and an existing file is never overwritten.
            </p>
          </Section>

          <ToolActions
            run={run}
            onRun={() => void execute()}
            label={actionLabel}
            icon="FileType"
            disabled={Boolean(blocked) || previewing}
            disabledReason={blocked ?? undefined}
          />
        </>
      }
    />
  );
}
