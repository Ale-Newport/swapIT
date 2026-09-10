import { useCallback, useMemo, useRef, useState } from 'react';
import { TextTool, type TextTransformResult } from '@/components/tool';
import { Field, NumberInput, Segmented, Select } from '@/components/ui';
import { convert, type Direction } from './logic';

const SAMPLE = `{
  "name": "toolbox",
  "version": "0.1.0",
  "services": { "api": { "port": 8080, "replicas": 2 } },
  "tags": ["local", "fast"],
  "notes": null
}`;

const FLOW_LEVELS = [
  { value: '-1', label: 'Block style everywhere' },
  { value: '1', label: 'Inline below depth 1' },
  { value: '2', label: 'Inline below depth 2' },
  { value: '3', label: 'Inline below depth 3' },
  { value: '0', label: 'Inline everything' },
];

export default function JsonYaml() {
  const [direction, setDirection] = useState<Direction>('auto');
  const [indent, setIndent] = useState(2);
  const [sortKeys, setSortKeys] = useState(false);
  const [flowLevel, setFlowLevel] = useState('-1');

  const [produced, setProduced] = useState<string | null>(null);

  const options = useMemo(
    () => ({ indent, sortKeys, flowLevel: Number(flowLevel) }),
    [indent, sortKeys, flowLevel],
  );

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
      const result = convert(input, direction, options);
      noteProduced(result.to);
      const stats = [
        { label: 'Input', value: result.from.toUpperCase() },
        { label: 'Output', value: result.to.toUpperCase() },
        { label: 'Lines', value: result.output.split('\n').length.toLocaleString() },
      ];
      return result.warning ? { output: result.output, warning: result.warning, stats } : { output: result.output, stats };
    },
    [direction, options, noteProduced],
  );

  return (
    <TextTool
      transform={transform}
      saveExtension={produced ?? (direction === 'yamlToJson' ? 'json' : 'yaml')}
      placeholder={'{"name": "toolbox", "tags": ["local", "fast"]}'}
      sampleText={SAMPLE}
      inputLabel="JSON or YAML"
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
                  { value: 'jsonToYaml', label: 'JSON → YAML' },
                  { value: 'yamlToJson', label: 'YAML → JSON' },
                ]}
              />
            </Field>
            <Field label="Indent" className="w-24">
              <NumberInput value={indent} onValueChange={setIndent} min={0} max={8} suffix="sp" />
            </Field>
            <Field label="Keys">
              <Segmented
                value={sortKeys ? 'sorted' : 'original'}
                onChange={(v) => setSortKeys(v === 'sorted')}
                options={[
                  { value: 'original', label: 'Original order' },
                  { value: 'sorted', label: 'Sorted A–Z' },
                ]}
              />
            </Field>
            <Field label="YAML collections" className="w-56" hint="Only affects YAML output">
              <Select value={flowLevel} onChange={(e) => setFlowLevel(e.target.value)} options={FLOW_LEVELS} />
            </Field>
          </div>
          <p className="text-[11.5px] text-ink-faint">
            Zero indent minifies JSON output. YAML timestamps become ISO strings and anchors are expanded, so the
            result is always plain data.
          </p>
        </div>
      }
    />
  );
}
