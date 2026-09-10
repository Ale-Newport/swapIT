import { useCallback, useRef, useState } from 'react';
import { TextTool, type TextTransformResult } from '@/components/tool';
import { Field, Input, NumberInput, Segmented, Switch } from '@/components/ui';
import { detectFormat, jsonToXml, xmlToJson, type Direction } from './logic';

const SAMPLE = `{
  "note": {
    "@_id": "7",
    "to": "Ada",
    "tags": { "tag": ["urgent", "personal"] },
    "body": "Meet at 6 & bring the plans"
  }
}`;

export default function JsonXml() {
  const [direction, setDirection] = useState<Direction>('auto');
  const [rootName, setRootName] = useState('root');
  const [indent, setIndent] = useState(2);
  const [attributePrefix, setAttributePrefix] = useState('@_');
  const [declaration, setDeclaration] = useState(true);
  const [parseValues, setParseValues] = useState(true);
  const [produced, setProduced] = useState<string | null>(null);

  /**
   * TextTool owns the input, so the format that actually came out is only known
   * inside `transform` — which runs during TextTool's render. Record it in a
   * ref and publish it right after that render, so Save offers the extension of
   * the text on screen rather than the one the Direction control implies.
   */
  const producedRef = useRef<string | null>(null);
  const noteProduced = useCallback((ext: string) => {
    if (producedRef.current === ext) return;
    producedRef.current = ext;
    queueMicrotask(() => setProduced(ext));
  }, []);

  const transform = useCallback(
    (input: string): TextTransformResult => {
      const from = direction === 'auto' ? detectFormat(input) : direction === 'jsonToXml' ? 'json' : 'xml';
      if (from === 'json') {
        const result = jsonToXml(input, { rootName, indent, attributePrefix, declaration });
        noteProduced('xml');
        return {
          output: result.output,
          stats: [
            { label: 'Input', value: 'JSON' },
            { label: 'Root', value: `<${result.rootName}>` },
            { label: 'Lines', value: result.output.split('\n').length.toLocaleString() },
          ],
        };
      }
      const result = xmlToJson(input, { indent, attributePrefix, parseValues });
      noteProduced('json');
      return {
        output: result.output,
        stats: [
          { label: 'Input', value: 'XML' },
          { label: 'Root', value: result.rootName ? `<${result.rootName}>` : '—' },
          { label: 'Characters', value: result.output.length.toLocaleString() },
        ],
      };
    },
    [direction, rootName, indent, attributePrefix, declaration, parseValues, noteProduced],
  );

  return (
    <TextTool
      transform={transform}
      saveExtension={produced ?? (direction === 'xmlToJson' ? 'json' : 'xml')}
      placeholder={'{"note": {"@_id": "7", "to": "Ada"}}'}
      sampleText={SAMPLE}
      inputLabel="JSON or XML"
      outputLabel="Converted"
      options={
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Direction" hint="Auto reads the input and picks the other format">
              <Segmented
                value={direction}
                onChange={setDirection}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'jsonToXml', label: 'JSON → XML' },
                  { value: 'xmlToJson', label: 'XML → JSON' },
                ]}
              />
            </Field>
            <Field label="Root element" className="w-40" hint="Used when the JSON is not already rooted">
              <Input value={rootName} onChange={(e) => setRootName(e.target.value)} spellCheck={false} />
            </Field>
            <Field label="Attribute prefix" className="w-32">
              <Input
                value={attributePrefix}
                onChange={(e) => setAttributePrefix(e.target.value)}
                className="font-mono"
                spellCheck={false}
              />
            </Field>
            <Field label="Indent" className="w-24">
              <NumberInput value={indent} onValueChange={setIndent} min={0} max={8} suffix="sp" />
            </Field>
          </div>

          <div className="flex flex-wrap items-end gap-6 border-t border-line pt-3">
            <Field inline label="XML declaration" hint="Prepend <?xml version=&quot;1.0&quot;?>">
              <Switch checked={declaration} onCheckedChange={setDeclaration} />
            </Field>
            <Field inline label="Read numbers and booleans" hint="XML → JSON: 42 becomes a number">
              <Switch checked={parseValues} onCheckedChange={setParseValues} />
            </Field>
          </div>

          <p className="text-[11.5px] text-ink-faint">
            Attributes live under keys carrying the prefix — <span className="font-mono">@_id</span> becomes{' '}
            <span className="font-mono">id=&quot;…&quot;</span> and back again. Text sitting beside attributes or child
            elements uses the key <span className="font-mono">#text</span>. A repeated element becomes an array, and a
            top-level JSON array is wrapped in the root element with each entry as{' '}
            <span className="font-mono">&lt;item&gt;</span>.
          </p>
        </div>
      }
    />
  );
}
