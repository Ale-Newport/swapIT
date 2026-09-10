import { useCallback, useState } from 'react';
import { TextTool, type TextTransformResult } from '@/components/tool';
import { Field, NumberInput, Segmented, Switch } from '@/components/ui';
import { convertYaml, type YamlMode } from './logic';

const SAMPLE_YAML = `name:    Toolbox
version: 0.1.0
local: true
tools:
    - images
    - video
    - pdf
limits:
        maxFiles: 500
        maxSizeMb: 2048`;

const SAMPLE_JSON = `{"name":"Toolbox","version":"0.1.0","local":true,"tools":["images","video","pdf"]}`;

export default function YamlFormatter() {
  const [mode, setMode] = useState<YamlMode>('format');
  const [indent, setIndent] = useState(2);
  const [lineWidth, setLineWidth] = useState(80);
  const [sortKeys, setSortKeys] = useState(false);
  const [quoting, setQuoting] = useState<'auto' | 'single' | 'double'>('auto');
  const [flow, setFlow] = useState(false);

  const yamlOut = mode !== 'to-json';

  const transform = useCallback(
    (input: string): TextTransformResult => {
      const result = convertYaml(input, { mode, indent, lineWidth, sortKeys, quoting, flow });
      const stats = [
        { label: 'Lines', value: result.output ? result.output.split('\n').length.toLocaleString() : '0' },
        { label: 'Characters', value: result.output.length.toLocaleString() },
      ];
      if (result.documents > 1) stats.unshift({ label: 'Documents', value: String(result.documents) });
      return { output: result.output, warning: result.warning, stats };
    },
    [mode, indent, lineWidth, sortKeys, quoting, flow],
  );

  return (
    <TextTool
      transform={transform}
      saveExtension={yamlOut ? 'yaml' : 'json'}
      inputLabel={mode === 'from-json' ? 'JSON' : 'YAML'}
      outputLabel={yamlOut ? 'YAML' : 'JSON'}
      placeholder={mode === 'from-json' ? '{"key": "value"}' : 'key: value'}
      sampleText={mode === 'from-json' ? SAMPLE_JSON : SAMPLE_YAML}
      minRows={16}
      options={
        <div className="space-y-3">
          <Field label="Mode">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'format', label: 'Format YAML' },
                { value: 'to-json', label: 'YAML → JSON' },
                { value: 'from-json', label: 'JSON → YAML' },
              ]}
            />
          </Field>
          <div className="flex flex-wrap items-end gap-5">
            <Field label="Indent" className="w-24">
              <NumberInput value={indent} onValueChange={setIndent} min={yamlOut ? 1 : 0} max={10} suffix="sp" />
            </Field>
            {yamlOut && (
              <>
                <Field label="Wrap at" hint="0 never wraps" className="w-28">
                  <NumberInput value={lineWidth} onValueChange={setLineWidth} min={0} max={400} suffix="col" />
                </Field>
                <Field label="Strings">
                  <Segmented
                    value={quoting}
                    onChange={setQuoting}
                    options={[
                      { value: 'auto', label: 'Only when needed' },
                      { value: 'single', label: "'quoted'" },
                      { value: 'double', label: '"quoted"' },
                    ]}
                  />
                </Field>
                <Field inline label="Inline collections" hint="Flow style: {a: 1, b: [2, 3]}">
                  <Switch checked={flow} onCheckedChange={setFlow} />
                </Field>
              </>
            )}
            <Field inline label="Sort keys" hint="Alphabetical order at every level">
              <Switch checked={sortKeys} onCheckedChange={setSortKeys} />
            </Field>
          </div>
        </div>
      }
    />
  );
}
