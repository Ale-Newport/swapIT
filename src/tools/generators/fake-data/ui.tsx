import { useCallback, useEffect, useMemo, useState } from 'react';
import { revealInFinder } from '@/core/bridge';
import { dirname, formatBytes, shortenPath } from '@/core/format';
import { saveTextAs } from '@/core/save';
import type { FileResult } from '@/core/types';
import { PresetRow, ToolShell } from '@/components/tool';
import {
  Alert,
  Button,
  Checkbox,
  CopyButton,
  Field,
  Input,
  NumberInput,
  Section,
  Segmented,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '@/components/ui';
import {
  DEFAULT_FIELDS,
  FIELDS,
  LOCALES,
  MAX_ROWS,
  exportPeople,
  makePeople,
  type ExportFormat,
  type FieldKey,
  type Locale,
  type Person,
} from './logic';

const FORMAT_LABEL: Record<ExportFormat, string> = { json: 'JSON', csv: 'CSV', sql: 'SQL' };
const PREVIEW_ROWS = 12;

export default function FakeTestData() {
  const [locale, setLocale] = useState<Locale>('en');
  const [count, setCount] = useState(25);
  const [fields, setFields] = useState<FieldKey[]>(DEFAULT_FIELDS);
  const [format, setFormat] = useState<ExportFormat>('json');
  const [table, setTable] = useState('people');
  const [people, setPeople] = useState<Person[]>([]);
  const [saved, setSaved] = useState<FileResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const generate = useCallback(() => {
    setPeople(makePeople(locale, count));
    setSaved(null);
    setSaveError(null);
  }, [locale, count]);

  useEffect(() => {
    generate();
  }, [generate]);

  const selected = useMemo(() => FIELDS.filter((f) => fields.includes(f.key)).map((f) => f.key), [fields]);

  const exported = useMemo(
    () => exportPeople(people, selected, format, table),
    [people, selected, format, table],
  );

  const toggleField = (key: FieldKey) =>
    setFields((current) => (current.includes(key) ? current.filter((f) => f !== key) : [...current, key]));

  const download = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveTextAs(exported, `fake-data-${people.length}.${format}`);
      if (result) setSaved(result);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const preview = people.slice(0, PREVIEW_ROWS);

  return (
    <ToolShell
      main={
        <>
          <Alert tone="warn" title="Invented data — not real people">
            Every name, address, phone number and e-mail below is fictional. The domains are the reserved
            example.com family, the phone numbers come from ranges no operator can issue, and the streets do not
            exist. Use it to fill a test database or a mockup — never present it as information about real people,
            and never load it into a system that sends messages to those addresses.
          </Alert>

          <Section
            title={`${people.length} record${people.length === 1 ? '' : 's'}`}
            description={`${LOCALES[locale].label} names and places · showing the first ${Math.min(
              PREVIEW_ROWS,
              people.length,
            )}`}
            actions={
              <Button size="sm" variant="ghost" icon="RefreshCw" onClick={generate}>
                Regenerate
              </Button>
            }
          >
            {selected.length === 0 ? (
              <Alert tone="info">Pick at least one field to see anything here.</Alert>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line bg-canvas">
                      {selected.map((key) => (
                        <th
                          key={key}
                          className="whitespace-nowrap px-2.5 py-2 text-[11px] font-medium uppercase tracking-wide text-ink-faint"
                        >
                          {FIELDS.find((f) => f.key === key)?.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((person) => (
                      <tr key={person.id} className="border-b border-line last:border-0">
                        {selected.map((key) => (
                          <td
                            key={key}
                            className="selectable whitespace-nowrap px-2.5 py-1.5 text-[12px] text-ink"
                          >
                            {person[key]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section
            title="Export"
            actions={
              <>
                <CopyButton value={() => exported} label="Copy" disabled={!exported} />
                <Button size="sm" icon="Download" loading={saving} disabled={!exported} onClick={() => void download()}>
                  Save .{format}
                </Button>
              </>
            }
          >
            <div className="space-y-3">
              <Tabs value={format} onChange={(value) => setFormat(value as ExportFormat)}>
                <TabList className="mb-3">
                  {(Object.keys(FORMAT_LABEL) as ExportFormat[]).map((f) => (
                    <Tab key={f} value={f}>
                      {FORMAT_LABEL[f]}
                    </Tab>
                  ))}
                </TabList>
                {(Object.keys(FORMAT_LABEL) as ExportFormat[]).map((f) => (
                  <TabPanel key={f} value={f}>
                    <pre className="selectable max-h-96 overflow-auto whitespace-pre rounded-lg border border-line bg-canvas p-3 font-mono text-[11.5px] leading-[1.6] text-ink">
                      {exported.length > 20000 ? `${exported.slice(0, 20000)}\n…` : exported}
                    </pre>
                  </TabPanel>
                ))}
              </Tabs>
              {exported.length > 20000 && (
                <p className="text-[11.5px] text-ink-faint">
                  The preview is trimmed; copying and saving include every row.
                </p>
              )}
              {saveError && <Alert tone="danger">{saveError}</Alert>}
              {saved && (
                <Alert
                  tone="success"
                  title={`Saved ${saved.name}`}
                  action={
                    <Button size="sm" icon="FolderOpen" onClick={() => void revealInFinder(saved.path)}>
                      Reveal
                    </Button>
                  }
                >
                  {formatBytes(saved.size)} · {shortenPath(dirname(saved.path), 2)}
                </Alert>
              )}
            </div>
          </Section>
        </>
      }
      aside={
        <>
          <Section title="Locale">
            <Segmented
              value={locale}
              onChange={setLocale}
              options={[
                { value: 'en', label: 'English' },
                { value: 'es', label: 'Español' },
              ]}
              className="w-full"
            />
          </Section>

          <Section title="How many">
            <div className="space-y-3">
              <PresetRow
                presets={[5, 25, 100, 500].map((c) => ({ label: String(c), value: c }))}
                active={count}
                onSelect={setCount}
              />
              <Field label="Rows" hint={`Up to ${MAX_ROWS.toLocaleString()}.`}>
                <NumberInput value={count} min={1} max={MAX_ROWS} onValueChange={setCount} />
              </Field>
            </div>
          </Section>

          <Section
            title="Fields"
            actions={
              <Button size="sm" variant="ghost" onClick={() => setFields(FIELDS.map((f) => f.key))}>
                All
              </Button>
            }
          >
            <div className="space-y-1.5">
              {FIELDS.map((field) => (
                <Checkbox
                  key={field.key}
                  checked={fields.includes(field.key)}
                  onCheckedChange={() => toggleField(field.key)}
                  label={field.label}
                />
              ))}
            </div>
          </Section>

          {format === 'sql' && (
            <Section title="SQL">
              <Field label="Table name" hint="Column names are snake_cased from the field names.">
                <Input value={table} onChange={(e) => setTable(e.target.value)} spellCheck={false} />
              </Field>
            </Section>
          )}

          <Button variant="primary" size="lg" icon="RefreshCw" full onClick={generate}>
            Generate again
          </Button>
        </>
      }
    />
  );
}
