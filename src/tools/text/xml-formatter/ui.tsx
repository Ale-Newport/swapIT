import { useCallback, useState } from 'react';
import { TextTool, type TextTransformResult } from '@/components/tool';
import { formatBytes } from '@/core/format';
import { Field, Segmented, Switch } from '@/components/ui';
import { countElements, formatXml } from './logic';

const INDENTS = [
  { value: '  ', label: '2 spaces' },
  { value: '    ', label: '4 spaces' },
  { value: '\t', label: 'Tab' },
];

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<catalog><!-- two products --><product id="a1" stock="12"><name>Desk lamp</name><price currency="EUR">39.00</price></product><product id="a2" stock="0"><name>Notebook</name><price currency="EUR">4.50</price></product></catalog>`;

export default function XmlFormatter() {
  const [minify, setMinify] = useState(false);
  const [indent, setIndent] = useState('  ');
  const [keepComments, setKeepComments] = useState(true);
  const [collapseEmpty, setCollapseEmpty] = useState(true);

  const transform = useCallback(
    (input: string): TextTransformResult => {
      const output = formatXml(input, { minify, indent, keepComments, collapseEmpty });
      const before = new TextEncoder().encode(input).byteLength;
      const after = new TextEncoder().encode(output).byteLength;
      return {
        output,
        stats: [
          { label: 'Elements', value: countElements(output).toLocaleString() },
          { label: 'Lines', value: output ? output.split('\n').length.toLocaleString() : '0' },
          { label: 'Size', value: `${formatBytes(before)} → ${formatBytes(after)}` },
        ],
      };
    },
    [minify, indent, keepComments, collapseEmpty],
  );

  return (
    <TextTool
      transform={transform}
      saveExtension="xml"
      inputLabel="XML"
      placeholder="<root><item>value</item></root>"
      sampleText={SAMPLE}
      options={
        <div className="flex flex-wrap items-end gap-5">
          <Field label="Mode">
            <Segmented
              value={minify ? 'minify' : 'format'}
              onChange={(v) => setMinify(v === 'minify')}
              options={[
                { value: 'format', label: 'Pretty print' },
                { value: 'minify', label: 'Minify' },
              ]}
            />
          </Field>
          {!minify && (
            <Field label="Indent">
              <Segmented
                value={indent}
                onChange={setIndent}
                options={INDENTS}
              />
            </Field>
          )}
          <Field inline label="Keep comments" hint="Otherwise <!-- … --> is removed">
            <Switch checked={keepComments} onCheckedChange={setKeepComments} />
          </Field>
          <Field inline label="Collapse empty tags" hint="Write <tag/> instead of <tag></tag>">
            <Switch checked={collapseEmpty} onCheckedChange={setCollapseEmpty} />
          </Field>
        </div>
      }
    />
  );
}
