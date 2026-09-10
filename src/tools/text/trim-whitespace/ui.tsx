import { useCallback, useState } from 'react';
import { TextTool, type TextTransformResult } from '@/components/tool';
import { Checkbox, Field, NumberInput, Segmented, Select } from '@/components/ui';
import { EXOTIC_SPACE_RE, ZERO_WIDTH_RE, trimWhitespace, type TrimOptions } from './logic';

function countHidden(text: string): number {
  return (text.match(ZERO_WIDTH_RE)?.length ?? 0) + (text.match(EXOTIC_SPACE_RE)?.length ?? 0);
}

export default function TrimWhitespace() {
  const [trim, setTrim] = useState<TrimOptions['trim']>('trailing');
  const [collapseSpaces, setCollapseSpaces] = useState(false);
  const [tabs, setTabs] = useState<TrimOptions['tabs']>('keep');
  const [tabWidth, setTabWidth] = useState(2);
  const [lineEndings, setLineEndings] = useState<TrimOptions['lineEndings']>('keep');
  const [stripInvisible, setStripInvisible] = useState(true);

  const transform = useCallback(
    (input: string): TextTransformResult => {
      const result = trimWhitespace(input, {
        trim,
        collapseSpaces,
        tabs,
        tabWidth,
        lineEndings,
        stripInvisible,
      });
      const stats = [
        { label: 'Lines trimmed', value: result.linesTrimmed.toLocaleString() },
        { label: 'Zero-width removed', value: result.zeroWidth.toLocaleString() },
        { label: 'Odd spaces fixed', value: result.exoticSpaces.toLocaleString() },
      ];
      if (collapseSpaces) {
        stats.push({ label: 'Runs collapsed', value: result.runsCollapsed.toLocaleString() });
      }
      const hidden = stripInvisible ? 0 : countHidden(input);
      return {
        output: result.output,
        warning:
          hidden > 0
            ? `This text still contains ${hidden} invisible character${hidden === 1 ? '' : 's'}. Turn on "Clean invisible characters" to strip them.`
            : undefined,
        stats,
      };
    },
    [trim, collapseSpaces, tabs, tabWidth, lineEndings, stripInvisible],
  );

  return (
    <TextTool
      transform={transform}
      inputLabel="Text"
      outputLabel="Cleaned"
      placeholder="Paste text with messy spacing…"
      sampleText={'  Hello\u00A0world   with  odd\u200B spacing   \n\tIndented line\t\n   Trailing spaces here    '}
      options={
        <div className="space-y-3">
          <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
            <Field label="Trim each line">
              <Segmented
                value={trim}
                onChange={setTrim}
                options={[
                  { value: 'none', label: 'Off' },
                  { value: 'leading', label: 'Leading' },
                  { value: 'trailing', label: 'Trailing' },
                  { value: 'both', label: 'Both' },
                ]}
              />
            </Field>
            <Field label="Line endings" hint="Keep uses whatever the text already has">
              <Segmented
                value={lineEndings}
                onChange={setLineEndings}
                options={[
                  { value: 'keep', label: 'Keep' },
                  { value: 'lf', label: 'LF' },
                  { value: 'crlf', label: 'CRLF' },
                ]}
              />
            </Field>
            <Field label="Tabs and indentation" className="w-56">
              <Select
                value={tabs}
                onChange={(e) => setTabs(e.target.value as TrimOptions['tabs'])}
                options={[
                  { value: 'keep', label: 'Leave as they are' },
                  { value: 'tabs-to-spaces', label: 'Tabs → spaces' },
                  { value: 'spaces-to-tabs', label: 'Indent spaces → tabs' },
                ]}
              />
            </Field>
            {tabs !== 'keep' && (
              <Field label="Tab width" className="w-24">
                <NumberInput value={tabWidth} onValueChange={setTabWidth} min={1} max={16} suffix="sp" />
              </Field>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Checkbox
              checked={collapseSpaces}
              onCheckedChange={setCollapseSpaces}
              label="Collapse repeated spaces inside a line"
            />
            <Checkbox
              checked={stripInvisible}
              onCheckedChange={setStripInvisible}
              label="Clean invisible characters"
            />
          </div>
        </div>
      }
    />
  );
}
